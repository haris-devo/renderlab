import { useEffect, useId, useState, type CSSProperties } from 'react';
import { STRATEGY_BY_ID, GLOSSARY, type NodeId } from '../engine/strategies';
import { STRATEGY_ORDER } from '../engine/simulate';
import type { StrategyId } from '../engine/types';
import { prefersReducedMotion } from '../lib/useClock';
import { CodeBlock, Icon, SectionHead, StrategyTag, accent } from './ui';
import { Matrix } from './Matrix';
import './deep.css';

const NODES: Record<NodeId, { x: number; y: number; name: string; sub: string }> = {
  browser: { x: 110, y: 230, name: 'Browser', sub: 'The visitor’s device' },
  cdn: { x: 340, y: 230, name: 'CDN', sub: 'Nearest edge node' },
  origin: { x: 570, y: 230, name: 'Server', sub: 'Your origin' },
  data: { x: 800, y: 230, name: 'Data', sub: 'Database or API' },
  build: { x: 570, y: 372, name: 'Build', sub: 'Runs at deploy time' },
};

const W = 156;
const H = 84;

/** One drawn connection per pair, in a fixed direction. Responses reuse it in reverse. */
const EDGES: Record<string, string> = {
  'browser-cdn': 'M192 230 L258 230',
  'cdn-origin': 'M422 230 L488 230',
  'origin-data': 'M652 230 L718 230',
  'browser-origin': 'M130 186 C 130 62, 550 62, 550 186',
  'build-cdn': 'M510 330 C 440 316, 380 304, 350 274',
  'build-data': 'M630 330 C 700 316, 770 304, 790 274',
};

function edgeFor(from: NodeId, to: NodeId): { id: string; reverse: boolean } | null {
  const forward = `${from}-${to}`;
  const backward = `${to}-${from}`;
  if (EDGES[forward]) return { id: forward, reverse: false };
  if (EDGES[backward]) return { id: backward, reverse: true };
  return null;
}

function Flow({ id, step }: { id: StrategyId; step: number }) {
  const meta = STRATEGY_BY_ID[id];
  const cur = meta.steps[step];
  const edge = edgeFor(cur.from, cur.to);
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const self = cur.from === cur.to;
  const active = new Set<NodeId>([cur.from, cur.to]);
  const usesBuild = meta.steps.some((s) => s.from === 'build' || s.to === 'build');

  return (
    <svg className="flow" viewBox={`0 0 910 ${usesBuild ? 430 : 330}`} role="img" aria-label={`Step ${step + 1} of ${meta.steps.length}: ${cur.title}`}>
      <defs>
        <filter id={`${uid}-glow`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        {Object.entries(EDGES).map(([k, d]) => (
          <path key={k} id={`${uid}-${k}`} d={d} />
        ))}
      </defs>

      {Object.entries(EDGES)
        .filter(([k]) => usesBuild || !k.startsWith('build'))
        .map(([k, d]) => (
          <path key={k} d={d} className="flow-edge" />
        ))}

      {edge && (
        <g key={`${step}`}>
          <path d={EDGES[edge.id]} className={`flow-active ${edge.reverse ? 'rev' : ''}`} />
          <circle r="7" className="flow-packet" filter={`url(#${uid}-glow)`}>
            <animateMotion
              dur="1.5s"
              repeatCount="indefinite"
              calcMode="linear"
              keyPoints={edge.reverse ? '1;0' : '0;1'}
              keyTimes="0;1"
            >
              <mpath href={`#${uid}-${edge.id}`} />
            </animateMotion>
          </circle>
        </g>
      )}

      {(Object.keys(NODES) as NodeId[])
        .filter((n) => usesBuild || n !== 'build')
        .map((n) => {
          const p = NODES[n];
          const on = active.has(n);
          return (
            <g key={n} className={`flow-node ${on ? 'on' : ''}`} transform={`translate(${p.x - W / 2} ${p.y - H / 2})`}>
              {on && self && n === cur.from && <rect className="flow-pulse" x="-6" y="-6" width={W + 12} height={H + 12} rx="22" />}
              <rect width={W} height={H} rx="18" />
              <text x={W / 2} y="37" textAnchor="middle" className="n-name">
                {p.name}
              </text>
              <text x={W / 2} y="62" textAnchor="middle" className="n-sub">
                {p.sub}
              </text>
            </g>
          );
        })}
    </svg>
  );
}

function useStepper(id: StrategyId) {
  const count = STRATEGY_BY_ID[id].steps.length;
  const [step, setStep] = useState(0);
  const [auto, setAuto] = useState(!prefersReducedMotion());

  useEffect(() => {
    setStep(0);
  }, [id]);

  useEffect(() => {
    if (!auto) return;
    const t = window.setInterval(() => setStep((s) => (s + 1) % count), 2800);
    return () => window.clearInterval(t);
  }, [auto, count, id]);

  return {
    step,
    auto,
    setAuto,
    go: (i: number) => {
      setAuto(false);
      setStep(i);
    },
    next: () => {
      setAuto(false);
      setStep((s) => (s + 1) % count);
    },
    prev: () => {
      setAuto(false);
      setStep((s) => (s - 1 + count) % count);
    },
  };
}

export function DeepDive({ strategy, setStrategy, onOpenLab }: { strategy: StrategyId; setStrategy: (s: StrategyId) => void; onOpenLab: (s: StrategyId) => void }) {
  const meta = STRATEGY_BY_ID[strategy];
  const st = useStepper(strategy);
  const [variant, setVariant] = useState(0);
  useEffect(() => setVariant(0), [strategy]);
  const code = meta.code[Math.min(variant, meta.code.length - 1)];

  return (
    <section className="section" id="deep" aria-labelledby="deep-title">
      <div className="wrap">
        <SectionHead n={2} id="How each one works" title="The same request, with the work in a different place">
          Step through what actually happens between a tap on a link and a usable page. Watch which box does the work, and when the visitor gets to see anything.
        </SectionHead>

        <div className="picker deep-picker" role="tablist" aria-label="Strategy" id="deep-title">
          {STRATEGY_ORDER.map((id) => (
            <button key={id} type="button" role="tab" aria-selected={strategy === id} aria-checked={strategy === id} style={accent(id)} onClick={() => setStrategy(id)}>
              <i className="dot" style={{ '--dot': `var(--c-${id})` } as CSSProperties} />
              {STRATEGY_BY_ID[id].name}
            </button>
          ))}
        </div>

        <div className="deep card" style={accent(strategy)} role="tabpanel">
          <div className="deep-head">
            <div>
              <StrategyTag id={strategy} long />
              <h3>{meta.tagline}</h3>
            </div>
            <button type="button" className="btn btn-sm" onClick={() => onOpenLab(strategy)}>
              Run it in the lab {Icon.arrow}
            </button>
          </div>
          <p className="deep-summary">{meta.summary}</p>

          <div className="deep-grid">
            <div className="deep-flow">
              <Flow id={strategy} step={st.step} />
              <div className="deep-controls">
                <button type="button" className="btn btn-sm" onClick={st.prev} aria-label="Previous step">
                  Back
                </button>
                <span className="tabular">
                  Step {st.step + 1} of {meta.steps.length}
                </span>
                <button type="button" className="btn btn-sm" onClick={st.next} aria-label="Next step">
                  Next
                </button>
                <button type="button" className="btn btn-sm" onClick={() => st.setAuto(!st.auto)} aria-pressed={st.auto}>
                  {st.auto ? Icon.pause : Icon.play} {st.auto ? 'Pause' : 'Auto-play'}
                </button>
              </div>
            </div>

            <ol className="steps">
              {meta.steps.map((s, i) => (
                <li key={i} data-state={i === st.step ? 'on' : i < st.step ? 'past' : 'next'}>
                  <button type="button" onClick={() => st.go(i)} aria-current={i === st.step ? 'step' : undefined}>
                    <span className="steps-n">{i + 1}</span>
                    <span className="steps-body">
                      <b>{s.title}</b>
                      <span>{s.text}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </div>

          <div className="deep-facts">
            <FactList title="Reach for it when" items={meta.bestFor} tone="good" />
            <FactList title="Look elsewhere when" items={meta.avoid} tone="bad" />
            <FactList title="Watch out for" items={meta.gotchas} tone="warn" />
          </div>

          <div className="deep-code">
            <div className="deep-code-head">
              <h4>In code</h4>
              {meta.code.length > 1 && (
                <div className="seg" role="tablist" aria-label="Code variant">
                  {meta.code.map((c, i) => (
                    <button key={c.label} type="button" role="tab" aria-selected={variant === i} onClick={() => setVariant(i)}>
                      {c.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <CodeBlock code={code.code} file={code.file} note={code.note} />
          </div>

          <blockquote className="say">
            <span>In an interview</span>
            <p>“{meta.say}”</p>
          </blockquote>
        </div>

        <div className="matrix-wrap">
          <h3>Side by side</h3>
          <p className="matrix-lede">Click a column to sort by it. Hover a row to follow it across.</p>
          <Matrix active={strategy} onPick={setStrategy} />
        </div>

        <details className="glossary card">
          <summary>Glossary</summary>
          <dl>
            {GLOSSARY.map((g) => (
              <div key={g.term}>
                <dt>{g.term}</dt>
                <dd>{g.plain}</dd>
              </div>
            ))}
          </dl>
        </details>
      </div>
    </section>
  );
}

function FactList({ title, items, tone }: { title: string; items: string[]; tone: 'good' | 'bad' | 'warn' }) {
  return (
    <div className="facts" data-tone={tone}>
      <h4>{title}</h4>
      <ul>
        {items.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
    </div>
  );
}

