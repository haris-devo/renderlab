import { useMemo, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import type { Lane, Segment, SegmentKind, SimResult } from '../engine/types';
import { fmt } from '../engine/explain';
import './waterfall.css';

export const KIND_LABEL: Record<SegmentKind, string> = {
  connect: 'Connect',
  wait: 'Waiting',
  document: 'HTML',
  script: 'JavaScript',
  data: 'Data',
  render: 'Render',
  parse: 'Parse',
  paint: 'Paint',
  exec: 'Run JS',
  hydrate: 'Hydrate',
};

const LANES: { id: Lane; name: string; hint: string }[] = [
  { id: 'network', name: 'Network', hint: 'Bytes on the wire' },
  { id: 'server', name: 'Server', hint: 'Work on the origin' },
  { id: 'main', name: 'Main thread', hint: 'The device’s CPU' },
];

const STEPS = [50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000];
function tickStep(horizon: number) {
  return STEPS.find((s) => horizon / s <= 8) ?? 20000;
}

function pack(segments: Segment[]): Segment[][] {
  const rows: { end: number; items: Segment[] }[] = [];
  for (const seg of [...segments].sort((a, b) => a.start - b.start)) {
    const row = rows.find((r) => r.end <= seg.start + 0.5);
    if (row) {
      row.items.push(seg);
      row.end = seg.end;
    } else {
      rows.push({ end: seg.end, items: [seg] });
    }
  }
  return rows.map((r) => r.items);
}

interface Props {
  result: SimResult;
  horizon: number;
  t: number;
  onSeek: (ms: number) => void;
  /** Draw the time axis above the lanes. */
  axis?: boolean;
  title?: ReactNode;
}

export function Waterfall({ result, horizon, t, onSeek, axis = true, title }: Props) {
  const plot = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [tip, setTip] = useState<{ seg: Segment; x: number; y: number } | null>(null);

  const pct = (ms: number) => `${(ms / horizon) * 100}%`;
  const lanes = useMemo(
    () => LANES.map((l) => ({ ...l, rows: pack(result.segments.filter((s) => s.lane === l.id)) })).filter((l) => l.rows.length),
    [result],
  );

  const step = tickStep(horizon);
  const ticks: number[] = [];
  for (let v = 0; v <= horizon; v += step) ticks.push(v);

  const seekFrom = (e: PointerEvent) => {
    const box = plot.current?.getBoundingClientRect();
    if (!box) return;
    onSeek(Math.max(0, Math.min(horizon, ((e.clientX - box.left) / box.width) * horizon)));
  };

  const marks = [
    { key: 'ttfb', name: 'First byte', at: result.marks.ttfb },
    { key: 'fcp', name: 'First paint', at: result.marks.fcp },
    { key: 'lcp', name: 'Main content', at: result.marks.lcp },
    { key: 'tti', name: 'Interactive', at: result.marks.tti },
  ] as const;

  return (
    <div className="wf">
      {title && <div className="wf-title">{title}</div>}
      <div className="wf-scroll">
        <div className="wf-grid">
          {axis && (
            <>
              <div />
              <div className="wf-axis" aria-hidden="true">
                {ticks.map((v) => (
                  <span key={v} style={{ left: pct(v) }}>
                    {v === 0 ? '0' : fmt(v)}
                  </span>
                ))}
              </div>
            </>
          )}

          <div className="wf-flagspace" />
          <div className="wf-flags" aria-hidden="true">
            {marks.map((m, i) => (
              <span key={m.key} className={`wf-flag f-${m.key} lvl-${i % 2}`} style={{ left: pct(m.at) }} data-reached={t >= m.at}>
                {m.name}
              </span>
            ))}
          </div>

          <div className="wf-gutter">
            {lanes.map((l) => (
              <div key={l.id} className="wf-lane-name" style={{ height: l.rows.length * 28 + 10 }}>
                <b>{l.name}</b>
                <span>{l.hint}</span>
              </div>
            ))}
          </div>

          <div
            ref={plot}
            className="wf-plot"
            onPointerDown={(e) => {
              dragging.current = true;
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              seekFrom(e);
            }}
            onPointerMove={(e) => {
              if (dragging.current) seekFrom(e);
            }}
            onPointerUp={() => (dragging.current = false)}
            onPointerCancel={() => (dragging.current = false)}
            onPointerLeave={() => setTip(null)}
          >
            {ticks.map((v) => (
              <i key={v} className="wf-grid-line" style={{ left: pct(v) }} aria-hidden="true" />
            ))}

            {lanes.map((l) => (
              <div key={l.id} className="wf-lane" style={{ height: l.rows.length * 28 + 10 }}>
                {l.rows.map((row, ri) => (
                  <div key={ri} className="wf-row" style={{ top: 5 + ri * 28 }}>
                    {row.map((seg) => {
                      const p = seg.end === seg.start ? 1 : Math.max(0, Math.min(1, (t - seg.start) / (seg.end - seg.start)));
                      const state = t < seg.start ? 'todo' : p >= 1 ? 'done' : 'live';
                      return (
                        <div
                          key={seg.id}
                          className={`wf-bar k-${seg.kind}`}
                          data-state={state}
                          style={{ left: pct(seg.start), width: `max(${((seg.end - seg.start) / horizon) * 100}%, 3px)` }}
                          onPointerMove={(e) => {
                            const box = plot.current?.getBoundingClientRect();
                            if (box) setTip({ seg, x: e.clientX - box.left, y: e.clientY - box.top });
                          }}
                          onPointerLeave={() => setTip(null)}
                        >
                          <i style={{ width: `${p * 100}%` }} />
                          <span>{seg.label}</span>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            ))}

            {marks.map((m) => (
              <i key={m.key} className={`wf-mark f-${m.key}`} style={{ left: pct(m.at) }} data-reached={t >= m.at} aria-hidden="true" />
            ))}

            <div className="wf-head" style={{ left: pct(t) }} aria-hidden="true">
              <b className="tabular">{fmt(t)}</b>
            </div>

            {tip && (
              <div
                className="wf-tip"
                style={{ left: tip.x, top: tip.y, '--flip': tip.x > (plot.current?.clientWidth ?? 0) * 0.62 ? '-100%' : '0%' } as CSSProperties}
                role="tooltip"
              >
                <b>{tip.seg.label}</b>
                {tip.seg.detail && <span>{tip.seg.detail}</span>}
                <span className="tabular">
                  {fmt(tip.seg.start)} to {fmt(tip.seg.end)} · {fmt(tip.seg.end - tip.seg.start)}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function Legend() {
  const kinds: SegmentKind[] = ['connect', 'wait', 'document', 'script', 'data', 'render', 'parse', 'paint', 'exec', 'hydrate'];
  return (
    <ul className="wf-legend" aria-label="Legend">
      {kinds.map((k) => (
        <li key={k}>
          <i className={`k-${k}`} />
          {KIND_LABEL[k]}
        </li>
      ))}
    </ul>
  );
}
