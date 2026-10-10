import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { fmt } from '../engine/explain';
import { NETWORKS } from '../engine/presets';
import { DEFAULT_REGIONS, planStream, type Region, type RegionId, type StreamMode, type StreamPlan } from '../engine/stream';
import { useClock } from '../lib/useClock';
import { useSeenOnce } from '../lib/useInView';
import { Icon, SectionHead, Slider, Switch } from './ui';
import './stream.css';

const MODES: { id: StreamMode; name: string; color: string; blurb: string }[] = [
  { id: 'blocking', name: 'Blocking SSR', color: 'var(--c-ssr)', blurb: 'The server waits for every query, then sends one response.' },
  { id: 'streaming', name: 'Streaming SSR', color: 'var(--c-stream)', blurb: 'The shell goes first. Each Suspense boundary streams in when its data is ready.' },
  { id: 'ppr', name: 'Partial prerendering', color: 'var(--c-ppr)', blurb: 'The static parts come from the CDN. Only the dynamic holes need the server.' },
];

const NETS = NETWORKS.filter((n) => ['fast4g', '4g', 'slow4g'].includes(n.id));

export function StreamLab() {
  const [mode, setMode] = useState<StreamMode>('streaming');
  const [regions, setRegions] = useState<Region[]>(DEFAULT_REGIONS);
  const [netId, setNetId] = useState('4g');
  const net = NETS.find((n) => n.id === netId)!;
  const netCfg = useMemo(() => ({ rtt: net.rtt, originMs: 40 }), [net]);

  const plan = useMemo(() => planStream(mode, regions, netCfg), [mode, regions, netCfg]);
  const baseline = useMemo(() => planStream('blocking', regions, netCfg), [regions, netCfg]);
  const horizon = Math.ceil(Math.max(plan.complete, baseline.complete) / 100) * 100 + 400;

  const clock = useClock(horizon, { autoplay: false });
  const [ref, seen] = useSeenOnce<HTMLDivElement>(0.3);
  const started = useRef(false);
  useEffect(() => {
    if (seen && !started.current) {
      started.current = true;
      clock.restart();
    }
  }, [seen, clock]);

  const patch = (id: RegionId, p: Partial<Region>) => {
    setRegions((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));
    clock.restart();
  };
  const changeMode = (m: StreamMode) => {
    setMode(m);
    clock.restart();
  };

  const accent = MODES.find((m) => m.id === mode)!.color;
  const t = clock.t;

  return (
    <section className="section" id="streaming" aria-labelledby="stream-title">
      <div className="wrap">
        <SectionHead n={4} id="Streaming and partial prerendering" title="One slow widget should never hold the whole page hostage">
          Change how the server sends the same four regions. Wrap the slow ones in Suspense, mark which ones read request data, and watch the HTTP response arrive piece by piece.
        </SectionHead>

        <div className="stage sl" ref={ref} style={{ '--accent': accent } as CSSProperties} id="stream-title">
          <header className="sl-top">
            <div className="seg" role="radiogroup" aria-label="How the server responds">
              {MODES.map((m) => (
                <button key={m.id} type="button" role="radio" aria-checked={mode === m.id} onClick={() => changeMode(m.id)}>
                  <i className="dot" style={{ '--dot': m.color } as CSSProperties} />
                  {m.name}
                </button>
              ))}
            </div>
            <div className="seg" role="radiogroup" aria-label="Network">
              {NETS.map((n) => (
                <button key={n.id} type="button" role="radio" aria-checked={netId === n.id} onClick={() => { setNetId(n.id); clock.restart(); }}>
                  {n.name}
                </button>
              ))}
            </div>
          </header>
          <p className="sl-blurb">{MODES.find((m) => m.id === mode)!.blurb}</p>

          {plan.error && (
            <div className="sl-alert" role="alert">
              <b>Build error</b>
              <p>{plan.error}</p>
            </div>
          )}
          {!plan.error && plan.blockedBy && (
            <div className="sl-alert warn" role="status">
              <b>The shell is waiting</b>
              <p>
                {regions.find((r) => r.id === plan.blockedBy)!.name} is not wrapped in Suspense, so nothing is flushed until its {fmt(regions.find((r) => r.id === plan.blockedBy)!.ms)} query finishes. Turn Suspense on for it.
              </p>
            </div>
          )}

          <div className="sl-body">
            <div className="sl-left">
              <PageMock plan={plan} regions={regions} t={t} />
              <Meters plan={plan} baseline={baseline} t={t} mode={mode} />
            </div>

            <div className="sl-right">
              <div className="sl-regions">
                {regions.map((r) => (
                  <div key={r.id} className="sl-region" data-dynamic={mode === 'ppr' && r.dynamic}>
                    <div className="sl-region-head">
                      <b>{r.name}</b>
                      {mode === 'ppr' && <span className="tag" data-kind={r.dynamic ? 'dyn' : 'static'}>{r.dynamic ? 'Dynamic hole' : 'Static shell'}</span>}
                    </div>
                    <Slider label="Data takes" value={r.ms} min={20} max={4000} step={20} format={fmt} onChange={(v) => patch(r.id, { ms: v })} color={accent} />
                    <div className="sl-toggles">
                      <Switch label="Wrap in Suspense" checked={r.suspense} disabled={mode === 'blocking'} onChange={(v) => patch(r.id, { suspense: v })} color={accent} />
                      {mode === 'ppr' && <Switch label="Reads request data" hint="Cookies, headers, uncached fetch." checked={r.dynamic} onChange={(v) => patch(r.id, { dynamic: v })} color={accent} />}
                    </div>
                  </div>
                ))}
              </div>
              <button type="button" className="btn btn-sm" onClick={() => { setRegions(DEFAULT_REGIONS); clock.restart(); }}>
                Reset regions
              </button>
            </div>
          </div>

          <div className="sl-transport">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => (clock.playing ? clock.pause() : clock.play())}>
              {clock.playing ? Icon.pause : Icon.play} {clock.playing ? 'Pause' : 'Play'}
            </button>
            <button type="button" className="btn btn-sm" onClick={clock.restart}>
              {Icon.replay} Replay
            </button>
            <input
              type="range"
              min={0}
              max={horizon}
              step={10}
              value={t}
              aria-label="Timeline position"
              style={{ '--pct': `${(t / horizon) * 100}%` } as CSSProperties}
              onChange={(e) => clock.seek(Number(e.target.value))}
            />
            <output className="tabular">{fmt(t)}</output>
          </div>

          <RegionTimeline plan={plan} regions={regions} horizon={horizon} t={t} onSeek={clock.seek} />
          <ResponseLog plan={plan} t={t} />
        </div>

        <div className="sl-takeaways">
          <div>
            <h3>What streaming changes</h3>
            <p>
              It changes when the visitor first sees something, not how long the slowest query takes. The reviews still arrive at the same moment. The difference is that they no longer decide when everything else appears.
            </p>
          </div>
          <div>
            <h3>What it needs from you</h3>
            <p>
              Suspense boundaries around every slow region, fallbacks shaped like the final content so nothing jumps, and a host that does not buffer responses. The HTTP status is sent with the first chunk, so a late 404 cannot change it.
            </p>
          </div>
          <div>
            <h3>What partial prerendering adds</h3>
            <p>
              The shell itself no longer waits for an origin trip. Static regions come from the CDN at once, and the origin works on the dynamic holes in parallel from the moment the request arrives.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function PageMock({ plan, regions, t }: { plan: StreamPlan; regions: Region[]; t: number }) {
  const state = (id: RegionId): 'wait' | 'fallback' | 'content' => {
    if (t >= plan.contentAt[id]) return 'content';
    const fb = plan.fallbackAt[id];
    if (fb !== null && t >= fb) return 'fallback';
    return 'wait';
  };
  const name = (id: RegionId) => regions.find((r) => r.id === id)!.name;
  const shown = (id: RegionId) => state(id);

  return (
    <div className="pm" aria-label="Page as the visitor sees it">
      <div className="pm-chrome">
        <i />
        <i />
        <i />
        <span>shop.example/alta-trail-shell</span>
      </div>
      <div className="pm-body">
        <Region id="header" st={shown('header')} label={name('header')}>
          <div className="pm-header">
            <span className="pm-logo" />
            <span className="pm-search" />
            <span className="pm-cart" />
          </div>
        </Region>
        <Region id="hero" st={shown('hero')} label={name('hero')} tall>
          <div className="pm-hero">
            <span className="pm-art" />
            <div>
              <h4>Alta Trail Shell</h4>
              <p className="pm-price">$189</p>
              <span className="pm-buy">Add to cart</span>
            </div>
          </div>
        </Region>
        <div className="pm-two">
          <Region id="recs" st={shown('recs')} label={name('recs')}>
            <div className="pm-recs">
              <b>Recommended for you</b>
              <div>
                <i />
                <i />
                <i />
              </div>
            </div>
          </Region>
          <Region id="reviews" st={shown('reviews')} label={name('reviews')}>
            <div className="pm-reviews">
              <b>Reviews</b>
              <span />
              <span />
              <span />
            </div>
          </Region>
        </div>
      </div>
    </div>
  );
}

function Region({ id, st, label, children, tall }: { id: RegionId; st: 'wait' | 'fallback' | 'content'; label: string; children: React.ReactNode; tall?: boolean }) {
  return (
    <div className={`rg ${tall ? 'tall' : ''}`} data-state={st} data-id={id}>
      {st === 'content' && children}
      {st === 'fallback' && <span className="rg-sk"><i /><i /><i /></span>}
      {st === 'wait' && <span className="rg-wait">{label} not sent yet</span>}
    </div>
  );
}

function Meters({ plan, baseline, t, mode }: { plan: StreamPlan; baseline: StreamPlan; t: number; mode: StreamMode }) {
  const items = [
    { label: 'First paint', v: plan.firstPaint, base: baseline.firstPaint },
    { label: 'Product visible', v: plan.contentAt.hero, base: baseline.contentAt.hero },
    { label: 'Everything visible', v: plan.complete, base: baseline.complete },
  ];
  return (
    <dl className="sl-meters">
      {items.map((m) => {
        const diff = m.base - m.v;
        return (
          <div key={m.label} data-reached={t >= m.v}>
            <dt>{m.label}</dt>
            <dd className="tabular">
              {fmt(m.v)}
              {mode !== 'blocking' && diff >= 50 && <em>{fmt(diff)} sooner</em>}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function RegionTimeline({ plan, regions, horizon, t, onSeek }: { plan: StreamPlan; regions: Region[]; horizon: number; t: number; onSeek: (ms: number) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const down = useRef(false);
  const pct = (ms: number) => `${(ms / horizon) * 100}%`;
  const seek = (e: React.PointerEvent) => {
    const r = box.current?.getBoundingClientRect();
    if (r) onSeek(Math.max(0, Math.min(horizon, ((e.clientX - r.left) / r.width) * horizon)));
  };
  const step = horizon > 6000 ? 1000 : 500;
  const ticks: number[] = [];
  for (let v = 0; v <= horizon; v += step) ticks.push(v);

  return (
    <div className="rt">
      <div className="rt-names">
        <span />
        {regions.map((r) => (
          <span key={r.id}>{r.name}</span>
        ))}
      </div>
      <div
        ref={box}
        className="rt-plot"
        onPointerDown={(e) => {
          down.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          seek(e);
        }}
        onPointerMove={(e) => down.current && seek(e)}
        onPointerUp={() => (down.current = false)}
      >
        <div className="rt-axis" aria-hidden="true">
          {ticks.map((v) => (
            <span key={v} style={{ left: pct(v) }}>
              {v === 0 ? '0' : fmt(v)}
            </span>
          ))}
        </div>
        {regions.map((r) => {
          const fb = plan.fallbackAt[r.id];
          const at = plan.contentAt[r.id];
          return (
            <div key={r.id} className="rt-row">
              <i className="rt-wait" style={{ left: 0, width: pct(fb ?? at) }} />
              {fb !== null && <i className="rt-skel" style={{ left: pct(fb), width: pct(at - fb) }} />}
              <i className="rt-done" style={{ left: pct(at) }} data-on={t >= at} />
            </div>
          );
        })}
        <div className="rt-head" style={{ left: pct(t) }} aria-hidden="true" />
      </div>
      <ul className="rt-legend">
        <li><i className="rt-wait" /> Nothing on screen</li>
        <li><i className="rt-skel" /> Placeholder showing</li>
        <li><i className="rt-done" data-on="true" /> Content arrives</li>
      </ul>
    </div>
  );
}

function ResponseLog({ plan, t }: { plan: StreamPlan; t: number }) {
  return (
    <div className="rl">
      <h4>The HTTP response, as it arrives</h4>
      <div className="code">
        <div className="code-bar">
          <span>200 OK · Transfer-Encoding: chunked</span>
          <span className="tabular">{plan.log.filter((l) => t >= l.at).length} of {plan.log.length} chunks</span>
        </div>
        <pre tabIndex={0}>
          {plan.log.map((l, i) => (
            <div key={i} className={`rl-chunk ${t >= l.at ? 'on' : ''}`}>
              <span className="rl-time">{t >= l.at ? `+${fmt(l.at)}` : '…'}</span>
              <span className="rl-label">{l.label}</span>
              <code>{t >= l.at ? l.code : ' '}</code>
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
}
