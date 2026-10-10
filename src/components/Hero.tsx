import { useEffect, useMemo, useRef } from 'react';
import { DEFAULT_SETUP } from '../engine/presets';
import { fmt } from '../engine/explain';
import { horizon, simulate } from '../engine/simulate';
import type { StrategyId } from '../engine/types';
import { STRATEGY_BY_ID } from '../engine/strategies';
import { useClock } from '../lib/useClock';
import { Browser } from './Browser';
import { Icon, accent } from './ui';
import './hero.css';

const RACE: { id: StrategyId; line: string }[] = [
  { id: 'csr', line: 'Blank until the JavaScript has run' },
  { id: 'ssr', line: 'Blank until the server has finished' },
  { id: 'ppr', line: 'Static shell now, the rest streams in' },
];

export function Hero() {
  const results = useMemo(() => RACE.map((r) => simulate(r.id, DEFAULT_SETUP)), []);
  const end = Math.ceil(horizon(results) / 100) * 100 + 300;
  const clock = useClock(end);

  // Let the race loop on its own, so the page never looks finished and static.
  const loop = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!clock.playing && clock.t >= end) {
      loop.current = window.setTimeout(clock.restart, 3200);
    }
    return () => window.clearTimeout(loop.current);
  }, [clock.playing, clock.t, end, clock.restart]);

  return (
    <section className="hero" id="top">
      <div className="wrap">
        <h1>Watch one web page load three ways at once</h1>
        <p className="hero-lede">
          Same product page, same mid-range phone, same 4G connection. Only the rendering strategy changes. Then take the controls and test the other four.
        </p>
        <div className="hero-cta">
          <a href="#lab" className="btn btn-primary">
            Open the lab {Icon.down}
          </a>
          <a href="#interview" className="btn">
            Jump to the interview round
          </a>
        </div>

        <div className="race stage" aria-label="A race between three rendering strategies">
          <div className="race-grid">
            {RACE.map(({ id, line }, i) => {
              const r = results[i];
              const seen = clock.t >= r.visual.heroAt;
              const tap = clock.t >= r.marks.tti;
              return (
                <div className="race-col" key={id} style={accent(id)}>
                  <div className="race-head">
                    <i className="dot" style={{ '--dot': `var(--c-${id})` } as React.CSSProperties} />
                    <div>
                      <strong>{STRATEGY_BY_ID[id].name}</strong>
                      <span>{line}</span>
                    </div>
                  </div>
                  <Browser result={r} t={clock.t} compact />
                  <dl className="race-stats">
                    <div data-on={seen}>
                      <dt>Sees the product</dt>
                      <dd className="tabular">{fmt(r.visual.heroAt)}</dd>
                    </div>
                    <div data-on={tap}>
                      <dt>Can tap the button</dt>
                      <dd className="tabular">{fmt(r.marks.tti)}</dd>
                    </div>
                  </dl>
                </div>
              );
            })}
          </div>
          <div className="race-foot">
            <div className="race-bar" aria-hidden="true">
              <i style={{ width: `${(clock.t / end) * 100}%` }} />
            </div>
            <output className="tabular">{fmt(clock.t)}</output>
            <button type="button" className="btn btn-sm" onClick={clock.restart}>
              {Icon.replay} Replay
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
