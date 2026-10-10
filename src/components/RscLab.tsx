import { useMemo, useState, type CSSProperties } from 'react';
import { K } from '../engine/simulate';
import {
  LOCK_REASON,
  PRESETS,
  PRODUCT_TREE,
  RUNTIME_KB,
  compute,
  flatten,
  importsFor,
  lockOf,
  sourceFor,
  type Choice,
  type RscNode,
  type Why,
} from '../engine/rsc';
import { CodeBlock, Icon, SectionHead } from './ui';
import './rsc.css';

const NAME_BY_ID = Object.fromEntries(flatten(PRODUCT_TREE).map((n) => [n.id, n.name]));

const WHY_LABEL: Record<Why, string> = {
  'locked-client': 'Needs the browser',
  'locked-server': 'Needs the server',
  chosen: 'use client',
  pulled: 'Pulled in by an import',
  slotted: 'Passed as children',
  default: 'Server by default',
};

export function RscLab({ onApply }: { onApply: (share: number, jsKb: number) => void }) {
  const [choice, setChoice] = useState<Choice>({ forced: {}, slotted: {} });
  const [preset, setPreset] = useState<string | null>('imports');
  const [selected, setSelected] = useState<string>('tabs');
  const result = useMemo(() => compute(PRODUCT_TREE, choice), [choice]);

  const nodes = useMemo(() => flatten(PRODUCT_TREE), []);
  const node = nodes.find((n) => n.id === selected) ?? PRODUCT_TREE;
  const place = result.placement[node.id];

  const update = (fn: (c: Choice) => Choice) => {
    setPreset(null);
    setChoice(fn);
  };
  const toggleForced = (id: string) =>
    update((c) => ({ forced: { ...c.forced, [id]: !c.forced[id] }, slotted: { ...c.slotted, [id]: false } }));
  const setSlot = (id: string, on: boolean) => update((c) => ({ ...c, slotted: { ...c.slotted, [id]: on } }));

  // Main-thread time to run and hydrate this bundle on a mid-range phone (4x slower).
  const phoneMs = Math.round(result.clientKb * (K.EXEC_MS_PER_KB + K.HYDRATE_MS_PER_KB) * 4);
  const baselineMs = Math.round(result.baselineKb * (K.EXEC_MS_PER_KB + K.HYDRATE_MS_PER_KB) * 4);

  const total = result.baselineKb;
  const clientNodes = nodes.filter((n) => result.placement[n.id].side === 'client');

  return (
    <section className="section" id="boundaries" aria-labelledby="rsc-title">
      <div className="wrap">
        <SectionHead n={5} id="Server Component boundaries" title="Where you put “use client” decides what the phone has to run">
          The product page below is a real-shaped tree. Some components need the browser, some need the server, and the rest could go either way. Move the boundary and watch the bundle respond.
        </SectionHead>

        <div className="stage rl2" id="rsc-title" style={{ '--accent': 'var(--c-rsc)' } as CSSProperties}>
          <div className="rsc-presets" role="radiogroup" aria-label="Start from a pattern">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={preset === p.id}
                onClick={() => {
                  setPreset(p.id);
                  setChoice(p.choice(PRODUCT_TREE));
                }}
              >
                <b>{p.name}</b>
                <span>{p.hint}</span>
              </button>
            ))}
          </div>

          <div className="rsc-body">
            <ul className="tree" aria-label="Component tree">
              {nodes.map((n) => (
                <Row
                  key={n.id}
                  node={n}
                  depth={depthOf(PRODUCT_TREE, n.id)}
                  placement={result.placement[n.id]}
                  selected={selected === n.id}
                  onSelect={() => setSelected(n.id)}
                  onToggle={() => toggleForced(n.id)}
                  onSlot={(on) => setSlot(n.id, on)}
                  forced={!!choice.forced[n.id]}
                />
              ))}
            </ul>

            <div className="rsc-side">
              <div className="bundle">
                <div className="bundle-top">
                  <div>
                    <span className="bundle-label">JavaScript the browser downloads and runs</span>
                    <b className="bundle-num tabular">{result.clientKb} KB</b>
                  </div>
                  <div className="bundle-save" data-good={result.savedPct > 0.3}>
                    <b className="tabular">{Math.round(result.savedPct * 100)}%</b>
                    <span>less than shipping everything</span>
                  </div>
                </div>

                <div className="bundle-bar" style={{ '--total': total } as CSSProperties} aria-hidden="true">
                  <i className="seg-runtime" style={{ width: `${(RUNTIME_KB / total) * 100}%` }} title={`React and framework runtime: ${RUNTIME_KB} KB`} />
                  {clientNodes.map((n) => (
                    <i
                      key={n.id}
                      className={`seg-${result.placement[n.id].why}`}
                      style={{ width: `${(n.kb / total) * 100}%` }}
                      title={`${n.name}: ${n.kb} KB, ${WHY_LABEL[result.placement[n.id].why]}`}
                    />
                  ))}
                  <span className="bundle-rest" />
                </div>
                <ul className="bundle-legend">
                  <li><i className="seg-runtime" /> Runtime, {RUNTIME_KB} KB</li>
                  <li><i className="seg-locked-client" /> Needs the browser</li>
                  <li><i className="seg-chosen" /> You chose client</li>
                  <li><i className="seg-pulled" /> Pulled in by an import</li>
                </ul>

                <dl className="bundle-stats">
                  <div>
                    <dt>Client components</dt>
                    <dd className="tabular">{result.clientCount}</dd>
                  </div>
                  <div>
                    <dt>Server components</dt>
                    <dd className="tabular">{result.serverCount}</dd>
                  </div>
                  <div>
                    <dt>Run and hydrate, mid-range phone</dt>
                    <dd className="tabular">
                      {(phoneMs / 1000).toFixed(1)} s<small> of {(baselineMs / 1000).toFixed(1)} s</small>
                    </dd>
                  </div>
                </dl>

                <button type="button" className="btn btn-primary" onClick={() => onApply(result.clientShare, result.clientKb)}>
                  Use this split in the lab {Icon.arrow}
                </button>
              </div>

              <div className="rsc-detail">
                <div className="rsc-detail-head">
                  <h4>{node.name}</h4>
                  <span className="side-badge" data-side={place.side}>
                    {place.side === 'client' ? 'Client' : 'Server'}
                  </span>
                </div>
                <p className="hint">
                  {node.does} <b>{WHY_LABEL[place.why]}.</b>{' '}
                  {place.why === 'pulled' && place.via ? `${NAME_BY_ID[place.via]} is a client component and imports it, so it joins the bundle. ` : ''}
                  {LOCK_REASON[node.need]}
                  {node.dep && place.side === 'client' ? ` It drags in a ${node.dep}.` : ''}
                  {node.dep && place.side === 'server' ? ` The ${node.dep} stays on the server.` : ''}
                </p>
                <CodeBlock code={sourceFor(node, place.side, importsFor(node, place.side))} file={`components/${node.name}.tsx`} />
              </div>
            </div>
          </div>
        </div>

        <div className="rsc-lessons">
          <div>
            <h3>The boundary is an import graph</h3>
            <p>
              A client component and everything it imports end up in the bundle. That is why a small tabs component can quietly pull a 35 KB markdown parser to the phone.
            </p>
          </div>
          <div>
            <h3>Children cross the boundary for free</h3>
            <p>
              A server component can render a client component and pass other server components in as <code>children</code>. They arrive already rendered, so their code never ships. Press “Pass as children” on the pulled components above.
            </p>
          </div>
          <div>
            <h3>Locked means the framework enforces it</h3>
            <p>
              A component that calls <code>useState</code> cannot be a server component, and one that reads the database should never be a client one. Mark server code with the <code>server-only</code> package so an import mistake fails the build.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function depthOf(root: RscNode, id: string, d = 0): number {
  if (root.id === id) return d;
  for (const c of root.children) {
    const r = depthOf(c, id, d + 1);
    if (r >= 0) return r;
  }
  return -1;
}

function Row(props: {
  node: RscNode;
  depth: number;
  placement: { side: 'client' | 'server'; why: Why; via?: string };
  selected: boolean;
  forced: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onSlot: (on: boolean) => void;
}) {
  const { node, depth, placement, selected, forced } = props;
  const lock = lockOf(node);
  const heavy = !!node.dep;
  return (
    <li
      className="trow"
      data-side={placement.side}
      data-why={placement.why}
      data-selected={selected}
      data-root={depth === 0}
      style={{ '--depth': depth } as CSSProperties}
    >
      <button type="button" className="trow-main" onClick={props.onSelect} aria-pressed={selected}>
        <span className="side-badge" data-side={placement.side}>
          {placement.side === 'client' ? 'Client' : 'Server'}
        </span>
        <span className="trow-name">
          <b>{node.name}</b>
          <small>{node.does}</small>
        </span>
        <span className="trow-kb tabular" data-heavy={heavy} data-shipped={placement.side === 'client'}>
          {placement.side === 'client' ? `+${node.kb} KB` : node.kb > 8 ? `${node.kb} KB stays here` : ''}
        </span>
      </button>

      <div className="trow-act">
        {lock === 'client' && (
          <span className="lock" title={LOCK_REASON[node.need]}>
            {Icon.lock} {node.need === 'state' ? 'uses state' : 'has handlers'}
          </span>
        )}
        {lock === 'server' && (
          <span className="lock" title={LOCK_REASON[node.need]}>
            {Icon.lock} reads data
          </span>
        )}
        {lock === 'free' && placement.why === 'pulled' && (
          <button type="button" className="chip-btn" onClick={() => props.onSlot(true)} title="Render it on the server and pass it in as children">
            Pass as children
          </button>
        )}
        {lock === 'free' && placement.why === 'slotted' && (
          <button type="button" className="chip-btn on" onClick={() => props.onSlot(false)}>
            Passed as children
          </button>
        )}
        {lock === 'free' && placement.why !== 'pulled' && placement.why !== 'slotted' && (
          <label className="mini-switch">
            <span>use client</span>
            <button type="button" role="switch" aria-checked={forced} onClick={props.onToggle} />
          </label>
        )}
      </div>
    </li>
  );
}
