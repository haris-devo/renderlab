import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { age, createIsr, invalidate, isFresh, publish, purge, setRevalidate, stats, tick, visit, type IsrEvent, type IsrState, type Outcome } from '../engine/isr';
import { useSeenOnce } from '../lib/useInView';
import { prefersReducedMotion } from '../lib/useClock';
import { Icon, SectionHead, Slider, Switch } from './ui';
import './isr.css';

const WINDOW = 120;
const VERSION_COLORS = ['#6d8dff', '#36c3a0', '#ffb347', '#d4326b', '#7a4cf5', '#0f8fa8'];
const vcolor = (v: number) => VERSION_COLORS[(v - 1) % VERSION_COLORS.length];

const TRAFFIC = [
  { id: 'off', name: 'Off', rate: 0 },
  { id: 'light', name: 'Light', rate: 0.2 },
  { id: 'busy', name: 'Busy', rate: 0.8 },
  { id: 'spike', name: 'Spike', rate: 2.5 },
] as const;
const SPEEDS = [2, 5, 12] as const;

const OUTCOME: Record<Outcome, { label: string; color: string }> = {
  hit: { label: 'Hit', color: 'var(--good)' },
  stale: { label: 'Stale', color: 'var(--warn)' },
  miss: { label: 'Miss', color: 'var(--bad)' },
};

function secs(n: number) {
  return `${n < 10 ? n.toFixed(1) : Math.round(n)} s`;
}

export function IsrLab() {
  // The simulation lives in a ref so the animation loop never runs a side effect inside a state updater.
  const sim = useRef<IsrState>(createIsr({ revalidate: 20 }));
  const [state, setState] = useState<IsrState>(sim.current);
  const apply = (fn: (s: IsrState) => IsrState) => {
    sim.current = fn(sim.current);
    setState(sim.current);
  };
  const [running, setRunning] = useState(false);
  const [traffic, setTraffic] = useState<(typeof TRAFFIC)[number]['id']>('light');
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(5);
  const [prebuilt, setPrebuilt] = useState(true);
  const [revalidate, setReval] = useState(20);
  const [ref, seen] = useSeenOnce<HTMLDivElement>(0.15);

  useEffect(() => {
    if (seen && !prefersReducedMotion()) setRunning(true);
  }, [seen]);

  useEffect(() => {
    sim.current = setRevalidate(sim.current, revalidate);
    setState(sim.current);
  }, [revalidate]);

  const rate = TRAFFIC.find((t) => t.id === traffic)!.rate;
  const acc = useRef(0);
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const real = Math.min(0.1, (now - last) / 1000);
      last = now;
      let dv = real * speed;
      let s = sim.current;
      // Step in small slices so visits land at believable times.
      while (dv > 0) {
        const slice = Math.min(0.25, dv);
        s = tick(s, slice);
        acc.current += rate * slice;
        while (acc.current >= 1) {
          acc.current -= 1;
          s = visit(s);
        }
        dv -= slice;
      }
      sim.current = s;
      setState(s);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running, speed, rate]);

  const st = useMemo(() => stats(state), [state]);
  const entryAge = age(state);
  const fresh = isFresh(state);
  const regenLeft = state.regen ? Math.max(0, state.regen.doneAt - state.now) : 0;

  const reset = () => {
    acc.current = 0;
    sim.current = createIsr({ revalidate, prebuilt });
    setState(sim.current);
  };

  return (
    <section className="section" id="isr" aria-labelledby="isr-title">
      <div className="wrap">
        <SectionHead n={3} id="The cache clock" title="Why “revalidate: 60” does not mean fresh every 60 seconds">
          Run an ISR cache in fast-forward. Publish in the CMS, send visitors, and watch who sees which version, and who triggers the rebuild.
        </SectionHead>

        <div className="stage isr" ref={ref} id="isr-title">
          <div className="isr-controls">
            <div className="isr-group">
              <h3>The cache</h3>
              <Slider label="Revalidate after" value={revalidate} min={5} max={120} step={5} format={(v) => `${v} s`} onChange={setReval} color="var(--c-isr)" hint="How old an entry can get before the next visit triggers a rebuild." />
              <Switch label="Pre-built at deploy" hint="Applies on reset. Off means the first visitor waits." checked={prebuilt} onChange={setPrebuilt} color="var(--c-isr)" />
            </div>

            <div className="isr-group">
              <h3>The CMS</h3>
              <button type="button" className="btn btn-primary" onClick={() => apply(publish)}>
                Publish version {state.cms + 1}
              </button>
              <p className="hint">An editor saves a change. The cache does not know yet.</p>
              <div className="isr-pair">
                <button type="button" className="btn btn-sm" onClick={() => apply((s) => invalidate(s, 'swr'))} title="revalidateTag: serve the old page once, then refresh">
                  Revalidate
                </button>
                <button type="button" className="btn btn-sm" onClick={() => apply((s) => invalidate(s, 'expire'))} title="updateTag: the next visitor waits for a fresh render">
                  Expire now
                </button>
                <button type="button" className="btn btn-sm" onClick={() => apply(purge)}>
                  Purge
                </button>
              </div>
              <p className="hint">On-demand options a webhook would call. Revalidate serves stale once. Expire makes the next visitor wait.</p>
            </div>

            <div className="isr-group">
              <h3>The visitors</h3>
              <div className="seg" role="radiogroup" aria-label="Traffic">
                {TRAFFIC.map((t) => (
                  <button key={t.id} type="button" role="radio" aria-checked={traffic === t.id} onClick={() => setTraffic(t.id)}>
                    {t.name}
                  </button>
                ))}
              </div>
              <button type="button" className="btn btn-sm" onClick={() => apply(visit)}>
                One visitor arrives
              </button>
            </div>

            <div className="isr-group">
              <h3>The clock</h3>
              <div className="isr-pair">
                <button type="button" className="btn btn-sm" onClick={() => setRunning((r) => !r)}>
                  {running ? Icon.pause : Icon.play} {running ? 'Pause' : 'Run'}
                </button>
                <button type="button" className="btn btn-sm" onClick={reset}>
                  {Icon.replay} Reset
                </button>
              </div>
              <div className="seg" role="radiogroup" aria-label="Clock speed">
                {SPEEDS.map((s) => (
                  <button key={s} type="button" role="radio" aria-checked={speed === s} onClick={() => setSpeed(s)}>
                    {s}×
                  </button>
                ))}
              </div>
              <p className="hint tabular">Virtual time: {secs(state.now)}</p>
            </div>
          </div>

          <div className="isr-main">
            <ul className="isr-status" aria-live="polite">
              <li>
                <span>CMS has</span>
                <b style={{ '--v': vcolor(state.cms) } as CSSProperties}>v{state.cms}</b>
              </li>
              <li>
                <span>Cache holds</span>
                <b style={{ '--v': state.entry ? vcolor(state.entry.version) : 'var(--ink-3)' } as CSSProperties}>{state.entry ? `v${state.entry.version}` : 'nothing'}</b>
                {state.entry && entryAge !== null && (
                  <em data-fresh={fresh}>
                    {state.entry.expired ? 'expired' : state.entry.stale ? 'marked stale' : fresh ? `fresh, ${secs(entryAge)} old` : `stale, ${secs(entryAge)} old`}
                  </em>
                )}
              </li>
              <li>
                <span>Rebuild</span>
                <b style={{ '--v': 'var(--ink)' } as CSSProperties}>{state.regen ? 'running' : 'idle'}</b>
                {state.regen && <em data-fresh="false">{secs(regenLeft)} left</em>}
              </li>
            </ul>

            <Timeline state={state} />

            <dl className="isr-stats">
              <div>
                <dt>Visitors</dt>
                <dd className="tabular">{st.total}</dd>
              </div>
              <div>
                <dt>Answered instantly</dt>
                <dd className="tabular">{Math.round(st.instant * 100)}%</dd>
              </div>
              <div>
                <dt>Server renders</dt>
                <dd className="tabular">
                  {st.regens}
                  <small>
                    {st.total > st.regens ? ` instead of ${st.total}` : ''}
                  </small>
                </dd>
              </div>
              <div>
                <dt>Oldest page shown</dt>
                <dd className="tabular">{st.worstStaleFor > 0 ? secs(st.worstStaleFor) : 'none'}</dd>
              </div>
            </dl>

            <Visits state={state} />
          </div>
        </div>

        <div className="isr-rules">
          <div>
            <h3>The three outcomes</h3>
            <p>
              <b className="o hit">Hit</b> The entry is younger than the revalidate window. Served from cache, nothing else happens.
            </p>
            <p>
              <b className="o stale">Stale</b> The entry is older than the window. The visitor still gets it instantly, and the first such visit starts one rebuild in the background.
            </p>
            <p>
              <b className="o miss">Miss</b> Nothing cached, or it was expired on demand. This one visitor waits for a full render.
            </p>
          </div>
          <div>
            <h3>What to try</h3>
            <ol>
              <li>Publish a version, then send visitors. Count how many see the old one before the cache catches up.</li>
              <li>Drop revalidate to 5 s and set traffic to Spike. Origin renders barely move. Staleness shrinks.</li>
              <li>Press Expire now, then send one visitor. That is the cost of making an editor’s change instant.</li>
              <li>Press Purge with traffic on. One visitor waits, and everyone after them does not.</li>
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}

function pct(t: number, start: number) {
  return `${((t - start) / WINDOW) * 100}%`;
}

function Timeline({ state }: { state: IsrState }) {
  const start = Math.max(0, state.now - WINDOW);
  const end = start + WINDOW;
  const inView = (a: number, b: number) => b >= start && a <= end;

  const publishes = state.events.filter((e): e is IsrEvent & { version: number } => e.kind === 'publish' && e.version !== undefined);
  const cmsSegs = [{ v: 1, from: 0 }, ...publishes.map((p) => ({ v: p.version, from: p.t }))].map((s, i, arr) => ({
    ...s,
    to: i + 1 < arr.length ? arr[i + 1].from : state.now,
  }));

  const stored = state.events.filter((e) => e.kind === 'stored' && e.version !== undefined);
  const purges = state.events.filter((e) => e.kind === 'purge');
  const cacheSegs = stored.map((s, i) => {
    const nextStore = stored[i + 1]?.t ?? Infinity;
    const nextPurge = purges.find((p) => p.t > s.t)?.t ?? Infinity;
    return { v: s.version!, from: s.t, to: Math.min(nextStore, nextPurge, state.now) };
  });
  const regens = state.events.filter((e) => e.kind === 'regen-start' && e.doneAt !== undefined);
  const marks = state.events.filter((e) => e.kind === 'invalidate');

  const ticks: number[] = [];
  for (let v = Math.ceil(start / 20) * 20; v <= end; v += 20) ticks.push(v);

  const visits = state.visits.filter((v) => v.at >= start);

  return (
    <div className="tl" role="img" aria-label="Timeline of CMS versions, cache entries and visitors">
      <div className="tl-rows">
        <span className="tl-label">CMS</span>
        <div className="tl-track tl-cms">
          {cmsSegs
            .filter((s) => inView(s.from, s.to))
            .map((s) => {
              const a = Math.max(s.from, start);
              return (
                <div key={s.v} className="tl-seg" style={{ left: pct(a, start), width: `${((s.to - a) / WINDOW) * 100}%`, '--v': vcolor(s.v) } as CSSProperties}>
                  <span>v{s.v}</span>
                </div>
              );
            })}
        </div>

        <span className="tl-label">Cache</span>
        <div className="tl-track tl-cache">
          {cacheSegs
            .filter((s) => inView(s.from, s.to))
            .map((s) => {
              const a = Math.max(s.from, start);
              const freshEnd = Math.min(s.to, s.from + state.revalidate);
              return (
                <div key={`${s.v}-${s.from}`} className="tl-seg" style={{ left: pct(a, start), width: `${((s.to - a) / WINDOW) * 100}%`, '--v': vcolor(s.v) } as CSSProperties}>
                  <span>v{s.v}</span>
                  {s.to > freshEnd && <i className="tl-stale" style={{ left: `${(Math.max(0, freshEnd - a) / (s.to - a)) * 100}%` }} />}
                </div>
              );
            })}
          {marks
            .filter((m) => m.t >= start)
            .map((m, i) => (
              <i key={i} className="tl-invalidate" style={{ left: pct(m.t, start) }} title={m.mode === 'swr' ? 'Revalidated on demand' : 'Expired on demand'} />
            ))}
          {purges
            .filter((m) => m.t >= start)
            .map((m, i) => (
              <i key={`p${i}`} className="tl-invalidate purge" style={{ left: pct(m.t, start) }} title="Cache purged" />
            ))}
        </div>

        <span className="tl-label">Rebuild</span>
        <div className="tl-track tl-regen">
          {regens
            .filter((r) => inView(r.t, r.doneAt!))
            .map((r, i) => {
              const a = Math.max(r.t, start);
              return <div key={i} className="tl-job" style={{ left: pct(a, start), width: `max(${((Math.min(r.doneAt!, state.now) - a) / WINDOW) * 100}%, 4px)` }} title={`Rendering v${r.version}`} />;
            })}
        </div>

        <span className="tl-label">Visitors</span>
        <div className="tl-track tl-visits">
          {visits.map((v) => (
            <i
              key={v.id}
              className="tl-dot"
              data-outcome={v.outcome}
              data-old={v.staleFor > 0}
              style={{ left: pct(v.at, start), top: `${6 + (v.id % 3) * 14}px`, '--v': vcolor(v.served) } as CSSProperties}
              title={`${OUTCOME[v.outcome].label}: saw v${v.served}${v.served < v.cms ? `, CMS had v${v.cms}` : ''}${v.waited ? `, waited ${secs(v.waited)}` : ''}`}
            />
          ))}
        </div>
      </div>

      <div className="tl-axis" aria-hidden="true">
        {ticks.map((t) => (
          <span key={t} style={{ left: pct(t, start) }}>
            {t === Math.floor(state.now) ? '' : `${Math.round(t)} s`}
          </span>
        ))}
        <span className="tl-now" style={{ left: '100%' }}>
          now
        </span>
      </div>

      <ul className="tl-legend">
        <li>
          <i className="tl-dot lg" data-outcome="hit" />
          Hit
        </li>
        <li>
          <i className="tl-dot lg" data-outcome="stale" />
          Stale
        </li>
        <li>
          <i className="tl-dot lg" data-outcome="miss" />
          Miss
        </li>
        <li>
          <i className="tl-dot lg" data-outcome="hit" data-old="true" style={{ '--v': 'var(--ink)' } as CSSProperties} />
          Ring: older than the CMS
        </li>
        <li>
          <i className="tl-swatch fresh" />
          Within the window
        </li>
        <li>
          <i className="tl-swatch stale" />
          Past the window
        </li>
      </ul>
    </div>
  );
}

function Visits({ state }: { state: IsrState }) {
  const rows = state.visits.slice(-6).reverse();
  return (
    <div className="isr-visits">
      <h4>Latest visitors</h4>
      {rows.length === 0 ? (
        <p className="hint">Nobody yet. Press “One visitor arrives”, or turn traffic on.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th scope="col">At</th>
              <th scope="col">Result</th>
              <th scope="col">Saw</th>
              <th scope="col">CMS had</th>
              <th scope="col">Waited</th>
              <th scope="col">What happened</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((v) => (
              <tr key={v.id}>
                <td className="tabular">{secs(v.at)}</td>
                <td>
                  <span className="o" data-o={v.outcome}>
                    {OUTCOME[v.outcome].label}
                  </span>
                </td>
                <td>
                  <span className="vtag" style={{ '--v': vcolor(v.served) } as CSSProperties}>
                    v{v.served}
                  </span>
                </td>
                <td>
                  <span className="vtag" style={{ '--v': vcolor(v.cms) } as CSSProperties}>
                    v{v.cms}
                  </span>
                </td>
                <td className="tabular">{v.waited ? secs(v.waited) : '0'}</td>
                <td>{v.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
