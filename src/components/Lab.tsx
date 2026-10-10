import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  DEVICES,
  NETWORKS,
  SCENARIOS,
  DEFAULT_SETUP,
  applyDevice,
  applyNetwork,
  applyScenario,
  type Setup,
} from '../engine/presets';
import { compareLine, explain, fmt } from '../engine/explain';
import { horizon as horizonOf, rscJsKb, simulate, STRATEGY_ORDER } from '../engine/simulate';
import { STRATEGY_BY_ID } from '../engine/strategies';
import type { SimResult, StrategyId } from '../engine/types';
import { useClock } from '../lib/useClock';
import { useSeenOnce } from '../lib/useInView';
import { writeLabState } from '../lib/urlState';
import { Browser } from './Browser';
import { Legend, Waterfall } from './Waterfall';
import { Icon, SectionHead, Slider, StrategyTag, Switch, accent } from './ui';
import './lab.css';

interface Props {
  setup: Setup;
  setSetup: (s: Setup | ((s: Setup) => Setup)) => void;
  strategy: StrategyId;
  setStrategy: (s: StrategyId) => void;
  compare: StrategyId | null;
  setCompare: (s: StrategyId | null) => void;
  onDeep: (s: StrategyId) => void;
}

type Tone = 'good' | 'warn' | 'bad';
const tone = (v: number, good: number, poor: number): Tone => (v <= good ? 'good' : v <= poor ? 'warn' : 'bad');

interface MetricDef {
  key: string;
  label: string;
  hint: string;
  get: (r: SimResult) => number;
  fmt: (n: number) => string;
  tone?: (n: number) => Tone;
  reachedAt?: (r: SimResult) => number;
  lowerIsBetter: boolean;
}

const METRICS: MetricDef[] = [
  { key: 'ttfb', label: 'First byte', hint: 'TTFB', get: (r) => r.marks.ttfb, fmt, tone: (n) => tone(n, 800, 1800), reachedAt: (r) => r.marks.ttfb, lowerIsBetter: true },
  { key: 'fcp', label: 'First paint', hint: 'FCP', get: (r) => r.marks.fcp, fmt, tone: (n) => tone(n, 1800, 3000), reachedAt: (r) => r.marks.fcp, lowerIsBetter: true },
  { key: 'lcp', label: 'Main content', hint: 'LCP', get: (r) => r.marks.lcp, fmt, tone: (n) => tone(n, 2500, 4000), reachedAt: (r) => r.marks.lcp, lowerIsBetter: true },
  { key: 'tti', label: 'Interactive', hint: 'TTI', get: (r) => r.marks.tti, fmt, tone: (n) => tone(n, 3800, 7300), reachedAt: (r) => r.marks.tti, lowerIsBetter: true },
  { key: 'dead', label: 'Dead zone', hint: 'Looks ready, ignores taps', get: (r) => r.deadZone, fmt, tone: (n) => tone(n, 300, 1500), lowerIsBetter: true },
  { key: 'js', label: 'JavaScript', hint: 'Shipped and run', get: (r) => r.jsKb, fmt: (n) => `${Math.round(n)} KB`, tone: (n) => tone(n, 170, 350), lowerIsBetter: true },
];

function Metrics({ result, t, other }: { result: SimResult; t: number; other?: SimResult }) {
  return (
    <dl className="metrics">
      {METRICS.map((m) => {
        const v = m.get(result);
        const reached = m.reachedAt ? t >= m.reachedAt(result) : true;
        const diff = other ? v - m.get(other) : 0;
        const rounded = m.key === 'js' ? Math.abs(diff) >= 1 : Math.abs(diff) >= 20;
        return (
          <div key={m.key} className="metric" data-reached={reached} data-tone={m.tone?.(v)}>
            <dt>
              {m.label}
              <small>{m.hint}</small>
            </dt>
            <dd className="tabular">
              {m.fmt(v)}
              {other && rounded && (
                <em data-better={diff < 0}>
                  {diff < 0 ? '−' : '+'}
                  {m.key === 'js' ? `${Math.abs(Math.round(diff))} KB` : fmt(Math.abs(diff))}
                </em>
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function Notes({ result, setup }: { result: SimResult; setup: Setup }) {
  const notes = explain(result, setup);
  return (
    <ul className="notes">
      {notes.map((n, i) => (
        <li key={i} className="note" data-tone={n.tone}>
          {n.text}
        </li>
      ))}
    </ul>
  );
}

function Picker({
  value,
  onChange,
  label,
  exclude,
}: {
  value: StrategyId;
  onChange: (s: StrategyId) => void;
  label: string;
  exclude?: StrategyId | null;
}) {
  return (
    <div className="picker" role="radiogroup" aria-label={label}>
      {STRATEGY_ORDER.filter((id) => id !== exclude).map((id) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={value === id}
          style={accent(id)}
          onClick={() => onChange(id)}
        >
          <i className="dot" style={{ '--dot': `var(--c-${id})` } as CSSProperties} />
          {STRATEGY_BY_ID[id].name}
        </button>
      ))}
    </div>
  );
}

export function Lab({ setup, setSetup, strategy, setStrategy, compare, setCompare, onDeep }: Props) {
  const a = useMemo(() => simulate(strategy, setup), [strategy, setup]);
  const b = useMemo(() => (compare ? simulate(compare, setup) : null), [compare, setup]);
  const horizon = Math.ceil(horizonOf(b ? [a, b] : [a]) / 100) * 100 + 200;

  const clock = useClock(horizon, { autoplay: false });
  const [stageRef, seen] = useSeenOnce<HTMLDivElement>(0.3);
  const started = useRef(false);
  useEffect(() => {
    if (seen && !started.current) {
      started.current = true;
      clock.restart();
    }
  }, [seen, clock]);

  // Replay whenever the strategy changes, whether the visitor or another section changed it.
  const prevKey = useRef(`${strategy}|${compare}`);
  useEffect(() => {
    const key = `${strategy}|${compare}`;
    if (key !== prevKey.current) {
      prevKey.current = key;
      clock.restart();
    }
  }, [strategy, compare, clock]);

  const [copied, setCopied] = useState(false);
  const shareUrl = () => `${location.origin}${location.pathname}?${writeLabState({ setup, strategy, compare })}#lab`;
  const share = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  };

  // Keep the address bar in sync so any setup can be shared. Only a real change writes to it,
  // so a plain visit leaves the URL alone.
  const lastWritten = useRef(writeLabState({ setup, strategy, compare }));
  useEffect(() => {
    const q = writeLabState({ setup, strategy, compare });
    if (q === lastWritten.current) return;
    const id = window.setTimeout(() => {
      lastWritten.current = q;
      history.replaceState(null, '', `${location.pathname}?${q}${location.hash}`);
    }, 350);
    return () => window.clearTimeout(id);
  }, [setup, strategy, compare]);

  const custom = (patch: Partial<Setup>) => setSetup((s) => ({ ...s, ...patch, scenarioId: 'custom' }));
  const scenario = SCENARIOS.find((s) => s.id === setup.scenarioId);
  const usesIsr = strategy === 'isr' || compare === 'isr';
  const usesRsc = ['rsc', 'ppr'].includes(strategy) || (!!compare && ['rsc', 'ppr'].includes(compare));
  const savedKb = setup.jsKb - rscJsKb(setup);

  const pick = (id: StrategyId) => {
    setStrategy(id);
    if (compare === id) setCompare(null);
  };

  return (
    <section className="section" id="lab" aria-labelledby="lab-title">
      <div className="wrap">
        <SectionHead n={1} id="The lab" title="Same page, seven ways to build it">
          Pick a strategy, then change the phone, the network or the page. The waterfall redraws, the mock browser repaints, and you can drag the playhead to any moment.
        </SectionHead>

        <div className="stage lab" ref={stageRef} style={accent(strategy)}>
          <header className="lab-top">
            <div className="lab-pick">
              <span className="lab-pick-label" id="lab-title">
                Strategy
              </span>
              <Picker value={strategy} onChange={pick} label="Rendering strategy" exclude={compare} />
              <p className="lab-tagline">
                <strong>{STRATEGY_BY_ID[strategy].full}.</strong> {STRATEGY_BY_ID[strategy].tagline}{' '}
                <a href="#deep" className="lab-link" onClick={() => onDeep(strategy)}>
                  How it works
                </a>
              </p>
            </div>
            <div className="lab-compare">
              <Switch
                label="Compare with another strategy"
                checked={!!compare}
                onChange={(on) => setCompare(on ? (strategy === 'ppr' ? 'ssr' : 'ppr') : null)}
              />
              {compare && (
                <Picker
                  value={compare}
                  onChange={setCompare}
                  label="Compare against"
                  exclude={strategy}
                />
              )}
            </div>
          </header>

          <div className="lab-body">
            <aside className="lab-controls" aria-label="Setup">
              <fieldset>
                <legend>Page</legend>
                <div className="seg seg-col" role="radiogroup" aria-label="Page type">
                  {SCENARIOS.map((s) => (
                    <button key={s.id} type="button" role="radio" aria-checked={setup.scenarioId === s.id} onClick={() => setSetup((x) => applyScenario(x, s.id))}>
                      {s.name}
                    </button>
                  ))}
                </div>
                <p className="hint">{scenario ? scenario.blurb : 'Custom page. Adjust the sliders below.'}</p>
              </fieldset>

              <fieldset>
                <legend>Network</legend>
                <div className="seg" role="radiogroup" aria-label="Network">
                  {NETWORKS.map((n) => (
                    <button key={n.id} type="button" role="radio" aria-checked={setup.networkId === n.id} title={n.hint} onClick={() => setSetup((x) => applyNetwork(x, n.id))}>
                      {n.name}
                    </button>
                  ))}
                </div>
                <p className="hint tabular">
                  {setup.rtt} ms round trip · {setup.mbps} Mbit/s
                </p>
              </fieldset>

              <fieldset>
                <legend>Device</legend>
                <div className="seg" role="radiogroup" aria-label="Device">
                  {DEVICES.map((d) => (
                    <button key={d.id} type="button" role="radio" aria-checked={setup.deviceId === d.id} title={d.hint} onClick={() => setSetup((x) => applyDevice(x, d.id))}>
                      {d.name}
                    </button>
                  ))}
                </div>
                <p className="hint">{DEVICES.find((d) => d.id === setup.deviceId)?.hint} than a fast desktop</p>
              </fieldset>

              <fieldset className="sliders">
                <legend>Fine-tune</legend>
                <Slider label="Main data" value={setup.dataMs} min={20} max={2000} step={10} format={fmt} onChange={(v) => custom({ dataMs: v })} hint="Database or API time for the content that matters." />
                <Slider label="Slow widget" value={setup.slowMs} min={20} max={4000} step={20} format={fmt} onChange={(v) => custom({ slowMs: v })} hint="Recommendations, reviews, ads." />
                <Slider label="Server distance" value={setup.originMs} min={0} max={300} step={5} format={fmt} onChange={(v) => custom({ originMs: v })} hint="CDN to origin round trip." />
                <Slider label="JavaScript" value={setup.jsKb} min={60} max={900} step={10} format={(v) => `${v} KB`} onChange={(v) => custom({ jsKb: v })} hint="Gzipped, if everything ran on the client." />
                <Slider label="HTML" value={setup.htmlKb} min={10} max={200} step={5} format={(v) => `${v} KB`} onChange={(v) => custom({ htmlKb: v })} />
                <Slider
                  label="Stays on the client"
                  value={Math.round(setup.clientShare * 100)}
                  min={5}
                  max={100}
                  step={5}
                  format={(v) => `${v}%`}
                  onChange={(v) => custom({ clientShare: v / 100 })}
                  hint={usesRsc ? `Server Components drop ${savedKb} KB from the bundle.` : 'Only used by Server Components and partial prerendering.'}
                />
              </fieldset>

              <fieldset>
                <legend>Behaviour</legend>
                <Switch
                  label="Content depends on the visitor"
                  hint="Cookies, auth, location."
                  checked={setup.personalized}
                  onChange={(v) => custom({ personalized: v })}
                />
                {usesIsr && (
                  <div className="isr-cache">
                    <span className="legend-s">ISR cache for this visit</span>
                    <div className="seg" role="radiogroup" aria-label="ISR cache state">
                      {(['hit', 'stale', 'miss'] as const).map((c) => (
                        <button key={c} type="button" role="radio" aria-checked={setup.cache === c} onClick={() => setSetup((x) => ({ ...x, cache: c }))}>
                          {c === 'hit' ? 'Fresh hit' : c === 'stale' ? 'Stale hit' : 'Miss'}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </fieldset>

              <div className="lab-actions">
                <button type="button" className="btn btn-sm" onClick={() => setSetup(DEFAULT_SETUP)}>
                  Reset setup
                </button>
                <button type="button" className="btn btn-sm" onClick={share}>
                  {Icon.link} {copied ? 'Link copied' : 'Copy link to this setup'}
                </button>
              </div>
            </aside>

            <div className="lab-main">
              {b ? (
                <>
                  <p className="lab-compare-line">{compareLine(a, b, STRATEGY_BY_ID[strategy].name, STRATEGY_BY_ID[b.strategy].name)}</p>
                  <div className="lab-duo">
                    {[
                      { r: a, other: b },
                      { r: b, other: a },
                    ].map(({ r, other }) => (
                      <div key={r.strategy} className="lab-col" style={accent(r.strategy)}>
                        <StrategyTag id={r.strategy} long />
                        <Browser key={`${r.strategy}-${setup.scenarioId}`} result={r} t={clock.t} tappable />
                        <Metrics result={r} t={clock.t} other={other} />
                        <Notes result={r} setup={setup} />
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="lab-solo">
                  <Browser key={`${strategy}-${setup.scenarioId}`} result={a} t={clock.t} tappable />
                  <div className="lab-solo-side">
                    <Metrics result={a} t={clock.t} />
                    <Notes result={a} setup={setup} />
                  </div>
                </div>
              )}

              <Transport clock={clock} horizon={horizon} />

              <div className="lab-waterfalls">
                <Waterfall result={a} horizon={horizon} t={clock.t} onSeek={clock.seek} title={b ? <StrategyTag id={a.strategy} long /> : undefined} />
                {b && <Waterfall result={b} horizon={horizon} t={clock.t} onSeek={clock.seek} axis={false} title={<StrategyTag id={b.strategy} long />} />}
              </div>
              <Legend />
              {a.cacheNote && <p className="lab-cache">{a.cacheNote}</p>}
            </div>
          </div>
        </div>

        <ModelNotes />
      </div>
    </section>
  );
}

function Transport({ clock, horizon }: { clock: ReturnType<typeof useClock>; horizon: number }) {
  return (
    <div className="transport">
      <button type="button" className="btn btn-primary btn-sm" onClick={() => (clock.playing ? clock.pause() : clock.play())} aria-label={clock.playing ? 'Pause' : 'Play'}>
        {clock.playing ? Icon.pause : Icon.play}
        {clock.playing ? 'Pause' : 'Play'}
      </button>
      <button type="button" className="btn btn-sm" onClick={clock.restart}>
        {Icon.replay} Replay
      </button>
      <input
        type="range"
        min={0}
        max={horizon}
        step={10}
        value={clock.t}
        aria-label="Timeline position"
        style={{ '--pct': `${(clock.t / horizon) * 100}%`, '--accent': 'var(--accent)' } as CSSProperties}
        onChange={(e) => clock.seek(Number(e.target.value))}
      />
      <output className="tabular">{fmt(clock.t)}</output>
      <div className="seg" role="radiogroup" aria-label="Speed">
        {[0.25, 0.5, 1, 2].map((s) => (
          <button key={s} type="button" role="radio" aria-checked={clock.speed === s} onClick={() => clock.setSpeed(s)}>
            {s}×
          </button>
        ))}
      </div>
    </div>
  );
}

function ModelNotes() {
  return (
    <details className="model card">
      <summary>How the numbers are made</summary>
      <div className="model-body">
        <p>
          This is a timing model, not a browser. It is built from a handful of rules, and it is meant to move the way real measurements move. Use it to see why one strategy beats another, and run Lighthouse or WebPageTest for a verdict on your own site.
        </p>
        <ul>
          <li>
            <b>Network.</b> A cold connection costs two round trips. A request costs one more. Transfer time is size × 8 ÷ bandwidth.
          </li>
          <li>
            <b>Device.</b> Running JavaScript costs 1.4 ms per gzipped KB on a fast desktop. Hydration costs 0.8 ms per KB. Both multiply by the CPU slowdown you pick.
          </li>
          <li>
            <b>Server.</b> A render takes 20 ms plus 0.4 ms per KB of HTML. Data fetches run in parallel, so the slowest one decides when blocking SSR can answer.
          </li>
          <li>
            <b>First paint.</b> The browser paints after the first ~14 KB of HTML, the size of the first TCP congestion window.
          </li>
          <li>
            <b>Server Components.</b> The runtime is 45 KB and always ships. The rest of your bundle shrinks to the share you keep on the client, and the flight payload adds 25% to the streamed HTML.
          </li>
          <li>
            <b>Interactive.</b> The end of hydration, or the moment the main content arrives, whichever is later.
          </li>
        </ul>
        <p>
          The rules live in <code>src/engine/simulate.ts</code>. Hundreds of tests check invariants such as “a slower network never makes anything faster”.
        </p>
      </div>
    </details>
  );
}
