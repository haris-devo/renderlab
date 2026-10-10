export type StreamMode = 'blocking' | 'streaming' | 'ppr';
export type RegionId = 'header' | 'hero' | 'recs' | 'reviews';

export interface Region {
  id: RegionId;
  name: string;
  /** Time the region's data takes on the server, in ms. */
  ms: number;
  /** Wrapped in a Suspense boundary. */
  suspense: boolean;
  /** Reads request data (cookies, headers) or uncached data. */
  dynamic: boolean;
}

export interface Net {
  rtt: number;
  originMs: number;
}

export interface LogLine {
  at: number;
  label: string;
  code: string;
}

export interface StreamPlan {
  mode: StreamMode;
  /** When the visitor first sees a fallback or content for each region. */
  fallbackAt: Record<RegionId, number | null>;
  contentAt: Record<RegionId, number>;
  firstPaint: number;
  complete: number;
  /** The un-wrapped region that is holding up the shell, if any. */
  blockedBy: RegionId | null;
  error: string | null;
  log: LogLine[];
}

export const REGION_ORDER: RegionId[] = ['header', 'hero', 'recs', 'reviews'];

export const DEFAULT_REGIONS: Region[] = [
  { id: 'header', name: 'Header', ms: 20, suspense: false, dynamic: false },
  { id: 'hero', name: 'Product', ms: 300, suspense: true, dynamic: false },
  { id: 'recs', name: 'Recommended', ms: 1200, suspense: true, dynamic: true },
  { id: 'reviews', name: 'Reviews', ms: 2400, suspense: true, dynamic: true },
];

const SHELL_RENDER = 15;
const EDGE = 8;
const BLOCKING_RENDER = 20;
/** Un-wrapped regions this fast are not worth calling out as a blocker. */
const BLOCK_THRESHOLD = 200;

const html: Record<RegionId, string> = {
  header: '<header>…</header>',
  hero: '<section class="hero">…</section>',
  recs: '<section class="recs">…</section>',
  reviews: '<section class="reviews">…</section>',
};

const tag: Record<RegionId, string> = { header: 'H', hero: 'P', recs: 'R', reviews: 'V' };

export function planStream(mode: StreamMode, regions: Region[], net: Net): StreamPlan {
  const toServer = net.rtt / 2 + net.originMs / 2;
  const toClient = toServer;
  const ready = (r: Region) => toServer + r.ms;

  const fallbackAt = {} as StreamPlan['fallbackAt'];
  const contentAt = {} as StreamPlan['contentAt'];
  const log: LogLine[] = [];
  let blockedBy: RegionId | null = null;
  let error: string | null = null;

  const blocking = () => {
    const done = Math.max(...regions.map(ready)) + BLOCKING_RENDER;
    const at = done + toClient;
    for (const r of regions) {
      fallbackAt[r.id] = null;
      contentAt[r.id] = at;
    }
    log.push({
      at,
      label: 'One response, after every query has finished',
      code: '<!DOCTYPE html><html>' + REGION_ORDER.map((id) => html[id]).join('') + '</html>',
    });
    return at;
  };

  if (mode === 'blocking') {
    blocking();
  } else if (mode === 'streaming') {
    const eager = regions.filter((r) => !r.suspense);
    const shellReady = Math.max(...eager.map(ready), toServer) + SHELL_RENDER;
    const slowestEager = eager.reduce<Region | null>((m, r) => (!m || r.ms > m.ms ? r : m), null);
    if (slowestEager && slowestEager.ms > BLOCK_THRESHOLD) blockedBy = slowestEager.id;
    const shellAt = shellReady + toClient;

    log.push({
      at: shellAt,
      label: 'Shell flushed',
      code:
        '<!DOCTYPE html><html>' +
        regions
          .map((r) =>
            r.suspense
              ? `<!--$?--><template id="B:${tag[r.id]}"></template><div class="skeleton"></div><!--/$-->`
              : html[r.id],
          )
          .join('') +
        '<script src="/_next/static/chunks/main.js" async></script>',
    });

    for (const r of regions) {
      if (!r.suspense) {
        fallbackAt[r.id] = null;
        contentAt[r.id] = shellAt;
      } else {
        fallbackAt[r.id] = shellAt;
        const at = Math.max(ready(r) + BLOCKING_RENDER / 2, shellReady) + toClient;
        contentAt[r.id] = at;
        log.push({
          at,
          label: `${r.name} resolved`,
          code: `<div hidden id="S:${tag[r.id]}">${html[r.id]}</div><script>$RC("B:${tag[r.id]}","S:${tag[r.id]}")</script>`,
        });
      }
    }
  } else {
    const holes = regions.filter((r) => r.dynamic);
    const unwrapped = holes.find((r) => !r.suspense);
    if (unwrapped) {
      error = `${unwrapped.name} reads request data outside a Suspense boundary. With cacheComponents on, Next.js fails the build here with “Uncached data was accessed outside of <Suspense>”. Wrap it, or cache it with "use cache". Until then the whole route is dynamic, which is what you see below.`;
      blocking();
    } else {
      const shellAt = net.rtt + EDGE;
      log.push({
        at: shellAt,
        label: 'Static shell from the CDN, prerendered at build time',
        code:
          '<!DOCTYPE html><html>' +
          regions
            .map((r) =>
              r.dynamic
                ? `<!--$?--><template id="B:${tag[r.id]}"></template><div class="skeleton"></div><!--/$-->`
                : html[r.id],
            )
            .join('') +
          '<script src="/_next/static/chunks/main.js" async></script>',
      });
      // Dynamic rendering resumes at the origin as soon as the request reaches the edge.
      const edgeToOrigin = net.rtt / 2 + EDGE + net.originMs / 2;
      for (const r of regions) {
        if (!r.dynamic) {
          fallbackAt[r.id] = null;
          contentAt[r.id] = shellAt;
        } else {
          fallbackAt[r.id] = shellAt;
          const at = Math.max(edgeToOrigin + r.ms + BLOCKING_RENDER / 2 + net.originMs / 2 + net.rtt / 2, shellAt);
          contentAt[r.id] = at;
          log.push({
            at,
            label: `${r.name} resolved at the origin`,
            code: `<div hidden id="S:${tag[r.id]}">${html[r.id]}</div><script>$RC("B:${tag[r.id]}","S:${tag[r.id]}")</script>`,
          });
        }
      }
    }
  }

  const all = Object.values(contentAt);
  const firsts = [...all, ...Object.values(fallbackAt).filter((x): x is number => x !== null)];
  return {
    mode,
    fallbackAt,
    contentAt,
    firstPaint: Math.min(...firsts),
    complete: Math.max(...all),
    blockedBy,
    error,
    log: log.sort((a, b) => a.at - b.at),
  };
}
