/**
 * A tiny model of an incremental static regeneration cache, in virtual seconds.
 * It follows the stale-while-revalidate behaviour of Next.js: the first request
 * after expiry is served the old page and triggers exactly one regeneration.
 */

export type Outcome = 'hit' | 'stale' | 'miss';

export interface Entry {
  version: number;
  generatedAt: number;
  /** Marked stale by an on-demand revalidation. Still served, then refreshed. */
  stale: boolean;
  /** Expired by an on-demand revalidation. The next visitor waits for a fresh render. */
  expired: boolean;
}

export interface Regen {
  startedAt: number;
  doneAt: number;
  /** The CMS version that was read when the regeneration began. */
  version: number;
}

export interface Visit {
  id: number;
  at: number;
  outcome: Outcome;
  served: number;
  cms: number;
  /** How many seconds the visitor's copy has been out of date. */
  staleFor: number;
  /** Time the visitor waited for a render, in seconds. */
  waited: number;
  startedRegen: boolean;
  note: string;
}

export interface IsrEvent {
  t: number;
  kind: 'publish' | 'stored' | 'regen-start' | 'invalidate' | 'purge';
  version?: number;
  mode?: 'swr' | 'expire';
  /** For regen-start: when the regeneration will finish. */
  doneAt?: number;
}

export interface IsrState {
  now: number;
  revalidate: number;
  /** How long a render takes, in seconds. */
  renderTime: number;
  cms: number;
  /** published[v] is the time version v went live in the CMS. */
  published: number[];
  entry: Entry | null;
  regen: Regen | null;
  visits: Visit[];
  events: IsrEvent[];
  regens: number;
  nextVisitId: number;
}

export function createIsr(opts: { revalidate?: number; prebuilt?: boolean; renderTime?: number } = {}): IsrState {
  const prebuilt = opts.prebuilt ?? true;
  return {
    now: 0,
    revalidate: opts.revalidate ?? 30,
    renderTime: opts.renderTime ?? 2,
    cms: 1,
    published: [0, 0],
    entry: prebuilt ? { version: 1, generatedAt: 0, stale: false, expired: false } : null,
    regen: null,
    visits: [],
    events: prebuilt ? [{ t: 0, kind: 'stored', version: 1 }] : [],
    regens: 0,
    nextVisitId: 1,
  };
}

/** Complete a background regeneration if it has finished by `now`. */
function settle(s: IsrState): IsrState {
  if (s.regen && s.regen.doneAt <= s.now) {
    return {
      ...s,
      entry: { version: s.regen.version, generatedAt: s.regen.doneAt, stale: false, expired: false },
      regen: null,
      events: [...s.events, { t: s.regen.doneAt, kind: 'stored', version: s.regen.version }],
    };
  }
  return s;
}

export function tick(s: IsrState, dt: number): IsrState {
  return settle({ ...s, now: s.now + dt });
}

export function setRevalidate(s: IsrState, seconds: number): IsrState {
  return { ...s, revalidate: seconds };
}

export function publish(s: IsrState): IsrState {
  const cms = s.cms + 1;
  const published = [...s.published];
  published[cms] = s.now;
  return { ...s, cms, published, events: [...s.events, { t: s.now, kind: 'publish', version: cms }] };
}

export function age(s: IsrState): number | null {
  return s.entry ? s.now - s.entry.generatedAt : null;
}

export function isFresh(s: IsrState): boolean {
  return !!s.entry && !s.entry.stale && !s.entry.expired && s.now - s.entry.generatedAt < s.revalidate;
}

function staleFor(s: IsrState, served: number): number {
  if (served >= s.cms) return 0;
  return Math.max(0, s.now - (s.published[served + 1] ?? s.now));
}

export function visit(input: IsrState): IsrState {
  const s = settle(input);
  const id = s.nextVisitId;
  const base = { id, at: s.now, cms: s.cms };

  const record = (v: Omit<Visit, 'id' | 'at' | 'cms'>, next: Partial<IsrState>, events: IsrEvent[] = []): IsrState => ({
    ...s,
    ...next,
    nextVisitId: id + 1,
    visits: [...s.visits, { ...base, ...v }],
    events: [...s.events, ...events],
  });

  // Nothing cached, or the entry was expired on demand: this visitor pays for the render.
  if (!s.entry || s.entry.expired) {
    const inFlight = s.regen ? Math.max(0, s.regen.doneAt - s.now) : null;
    const waited = inFlight ?? s.renderTime;
    const version = s.regen ? s.regen.version : s.cms;
    return record(
      {
        outcome: 'miss',
        served: version,
        staleFor: staleFor(s, version),
        waited,
        startedRegen: !s.regen,
        note: s.entry ? 'Expired on demand: rendered before responding' : 'Nothing cached yet: rendered before responding',
      },
      {
        entry: { version, generatedAt: s.now + waited, stale: false, expired: false },
        regen: null,
        regens: s.regen ? s.regens : s.regens + 1,
      },
      [
        ...(s.regen ? [] : [{ t: s.now, kind: 'regen-start' as const, version, doneAt: s.now + waited }]),
        { t: s.now + waited, kind: 'stored' as const, version },
      ],
    );
  }

  if (isFresh(s)) {
    return record(
      { outcome: 'hit', served: s.entry.version, staleFor: staleFor(s, s.entry.version), waited: 0, startedRegen: false, note: 'Served from cache' },
      {},
    );
  }

  // Expired by age or marked stale: serve what we have, regenerate once in the background.
  const startRegen = !s.regen;
  return record(
    {
      outcome: 'stale',
      served: s.entry.version,
      staleFor: staleFor(s, s.entry.version),
      waited: 0,
      startedRegen: startRegen,
      note: startRegen ? 'Served stale, regeneration started' : 'Served stale, regeneration already running',
    },
    startRegen
      ? { regen: { startedAt: s.now, doneAt: s.now + s.renderTime, version: s.cms }, regens: s.regens + 1 }
      : {},
    startRegen ? [{ t: s.now, kind: 'regen-start', version: s.cms, doneAt: s.now + s.renderTime }] : [],
  );
}

/** What revalidateTag and updateTag do to the entry. */
export function invalidate(s: IsrState, mode: 'swr' | 'expire'): IsrState {
  if (!s.entry) return s;
  return {
    ...s,
    entry: { ...s.entry, ...(mode === 'swr' ? { stale: true } : { expired: true }) },
    events: [...s.events, { t: s.now, kind: 'invalidate', mode }],
  };
}

export function purge(s: IsrState): IsrState {
  return { ...s, entry: null, regen: null, events: [...s.events, { t: s.now, kind: 'purge' }] };
}

export interface IsrStats {
  total: number;
  hits: number;
  stale: number;
  misses: number;
  regens: number;
  /** Share of visits served instantly (hit or stale). */
  instant: number;
  /** Longest a visitor was shown out-of-date content, in seconds. */
  worstStaleFor: number;
}

export function stats(s: IsrState): IsrStats {
  const hits = s.visits.filter((v) => v.outcome === 'hit').length;
  const stale = s.visits.filter((v) => v.outcome === 'stale').length;
  const misses = s.visits.filter((v) => v.outcome === 'miss').length;
  const total = s.visits.length;
  return {
    total,
    hits,
    stale,
    misses,
    regens: s.regens,
    instant: total ? (hits + stale) / total : 1,
    worstStaleFor: s.visits.reduce((m, v) => Math.max(m, v.staleFor), 0),
  };
}
