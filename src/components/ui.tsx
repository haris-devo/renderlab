import { useId, useState, type CSSProperties, type ReactNode } from 'react';
import { highlight } from '../lib/highlight';
import type { StrategyId } from '../engine/types';
import { STRATEGY_BY_ID } from '../engine/strategies';

export const accent = (id: StrategyId): CSSProperties =>
  ({ '--accent': `var(--c-${id})`, '--soft': `var(--c-${id}-soft)`, '--ink-accent': `var(--c-${id}-ink)` }) as CSSProperties;

export function StrategyTag({ id, long }: { id: StrategyId; long?: boolean }) {
  const meta = STRATEGY_BY_ID[id];
  return (
    <span className="tag" style={{ '--tag-bg': `var(--c-${id}-soft)`, '--tag-ink': `var(--c-${id}-ink)` } as CSSProperties}>
      <i className="dot" style={{ '--dot': `var(--c-${id})` } as CSSProperties} />
      {long ? meta.full : meta.name}
    </span>
  );
}

export function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  hint?: string;
  color?: string;
}) {
  const id = useId();
  const { label, value, min, max, step = 1, onChange, format, hint, color } = props;
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="field" style={color ? ({ '--accent': color } as CSSProperties) : undefined}>
      <div className="field-top">
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id}>{format ? format(value) : value}</output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ '--pct': `${pct}%` } as CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {hint && <small>{hint}</small>}
    </div>
  );
}

export function Switch(props: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
  color?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="switch" style={props.color ? ({ '--accent': props.color } as CSSProperties) : undefined}>
      <label htmlFor={id} id={`${id}-l`}>
        {props.label}
        {props.hint && <small>{props.hint}</small>}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={props.checked}
        aria-labelledby={`${id}-l`}
        disabled={props.disabled}
        onClick={() => props.onChange(!props.checked)}
      />
    </div>
  );
}

export function CodeBlock({ code, file, note }: { code: string; file: string; note?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard can be blocked; the code stays selectable */
    }
  };
  return (
    <div>
      <div className="code">
        <div className="code-bar">
          <span>{file}</span>
          <button type="button" onClick={copy}>
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <pre tabIndex={0}>
          <code>{highlight(code)}</code>
        </pre>
      </div>
      {note && <p style={{ marginTop: 10, color: 'var(--ink-3)', fontSize: '0.9rem' }}>{note}</p>}
    </div>
  );
}

export function SectionHead(props: { n: number; id: string; title: string; children?: ReactNode }) {
  return (
    <div className="section-head">
      <span className="chapter">
        <b>{props.n}</b>
        <span>{props.id}</span>
      </span>
      <h2>{props.title}</h2>
      {props.children && <p>{props.children}</p>}
    </div>
  );
}

const ico = (d: string) => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);
export const Icon = {
  play: <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" /></svg>,
  pause: <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4.2" height="14" rx="1.2" /><rect x="13.8" y="5" width="4.2" height="14" rx="1.2" /></svg>,
  replay: ico('M3 12a9 9 0 1 0 3-6.7M3 4v5h5'),
  link: ico('M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1'),
  arrow: ico('M5 12h14M13 6l6 6-6 6'),
  down: ico('M12 5v14M6 13l6 6 6-6'),
  lock: ico('M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z'),
  check: ico('M5 12.5l4.5 4.5L19 7'),
  x: ico('M6 6l12 12M18 6L6 18'),
  github: (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true">
      <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.37-3.87-1.37-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.18-3.09-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.78 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.18 1.83 1.18 3.09 0 4.42-2.7 5.4-5.27 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" />
    </svg>
  ),
};
