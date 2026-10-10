import { useMemo, useState } from 'react';
import { CASES, FRAMEWORK, type Case } from '../engine/interview';
import type { StrategyId } from '../engine/types';
import { STRATEGY_BY_ID } from '../engine/strategies';
import { Icon, SectionHead, StrategyTag } from './ui';
import './interview.css';

function shuffle<T>(arr: T[], seed: number): T[] {
  // Small seeded shuffle, so the order is stable within one attempt.
  const a = [...arr];
  let s = seed || 1;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) % 4294967296;
    const j = Math.floor((s / 4294967296) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

interface Prepared {
  c: Case;
  options: { text: string; why: string; correct: boolean }[];
}

function prepare(seed: number): Prepared[] {
  return shuffle(CASES, seed).map((c, i) => ({
    c,
    options: shuffle(
      c.options.map((o, idx) => ({ ...o, correct: idx === c.answer })),
      seed + i * 7919,
    ),
  }));
}

export function Interview({ onLab, onDeep }: { onLab: (id: StrategyId) => void; onDeep: (id: StrategyId) => void }) {
  const [seed, setSeed] = useState(() => 20261010);
  const deck = useMemo(() => prepare(seed), [seed]);
  const [i, setI] = useState(0);
  const [picks, setPicks] = useState<(number | null)[]>(() => deck.map(() => null));
  const done = i >= deck.length;
  const q = deck[Math.min(i, deck.length - 1)];
  const pick = picks[i] ?? null;
  const score = picks.filter((p, k) => p !== null && deck[k].options[p].correct).length;
  const answered = picks.filter((p) => p !== null).length;

  const choose = (idx: number) => {
    if (pick !== null) return;
    setPicks((p) => p.map((v, k) => (k === i ? idx : v)));
  };
  const restart = () => {
    const next = seed + 1;
    setSeed(next);
    setPicks(CASES.map(() => null));
    setI(0);
  };

  const missed = deck.filter((d, k) => picks[k] !== null && !d.options[picks[k]!].correct);

  return (
    <section className="section" id="interview" aria-labelledby="iv-title">
      <div className="wrap">
        <SectionHead n={7} id="Interview round" title="Defend your choice out loud">
          {CASES.length} scenarios of the kind frontend system design rounds use. Pick the strategy, then read why the other three lose. The follow-up question is the one an interviewer asks next.
        </SectionHead>

        <div className="iv" id="iv-title">
          <div className="iv-main stage">
            {!done ? (
              <>
                <div className="iv-progress">
                  <div className="iv-bar" aria-hidden="true">
                    {deck.map((_, k) => (
                      <i key={k} data-state={picks[k] === null ? (k === i ? 'now' : 'todo') : deck[k].options[picks[k]!].correct ? 'ok' : 'miss'} />
                    ))}
                  </div>
                  <span className="tabular">
                    Scenario {i + 1} of {deck.length}
                  </span>
                </div>

                <h3>{q.c.title}</h3>
                <p className="iv-prompt">{q.c.prompt}</p>
                <ul className="iv-facts">
                  {q.c.facts.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>

                <div className="iv-opts" role="radiogroup" aria-label="Your answer">
                  {q.options.map((o, idx) => {
                    const state = pick === null ? 'open' : o.correct ? 'right' : pick === idx ? 'wrong' : 'other';
                    return (
                      <button key={o.text} type="button" role="radio" aria-checked={pick === idx} data-state={state} onClick={() => choose(idx)}>
                        <span className="iv-key">{String.fromCharCode(65 + idx)}</span>
                        <span className="iv-text">
                          <b>{o.text}</b>
                          {pick !== null && (
                            <span className="iv-why">
                              {state === 'right' ? <i>{Icon.check} Best answer.</i> : state === 'wrong' ? <i className="x">{Icon.x} Not this one.</i> : null} {o.why}
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {pick !== null && (
                  <div className="iv-after">
                    <div className="iv-follow">
                      <span>Interviewer follow-up</span>
                      <p>{q.c.followUp}</p>
                    </div>
                    <div className="iv-actions">
                      <button type="button" className="btn btn-sm" onClick={() => onLab(q.c.topic)}>
                        Try {STRATEGY_BY_ID[q.c.topic].name} in the lab {Icon.arrow}
                      </button>
                      <button type="button" className="btn btn-sm" onClick={() => onDeep(q.c.topic)}>
                        How it works
                      </button>
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => setI(i + 1)}>
                        {i + 1 === deck.length ? 'See results' : 'Next scenario'} {Icon.arrow}
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="iv-done">
                <p className="iv-kicker">Round complete</p>
                <h3>
                  {score} of {deck.length} right
                </h3>
                <p className="iv-verdict">
                  {score >= 10
                    ? 'You reasoned about freshness, personalisation, discoverability and cost, and the answers followed. That is the habit that matters.'
                    : score >= 7
                      ? 'A solid round. The misses below are where the trade-offs are least obvious. Open each in the lab and watch what the numbers do.'
                      : 'Good material to learn from. Read the reasons on the options you missed, then replay them in the lab.'}
                </p>
                {missed.length > 0 && (
                  <div className="iv-missed">
                    <h4>Worth another look</h4>
                    <ul>
                      {missed.map((m) => (
                        <li key={m.c.id}>
                          <div>
                            <b>{m.c.title}</b>
                            <StrategyTag id={m.c.topic} long />
                          </div>
                          <button type="button" className="btn btn-sm" onClick={() => onLab(m.c.topic)}>
                            Open in the lab
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <button type="button" className="btn btn-primary" onClick={restart}>
                  {Icon.replay} Go again, shuffled
                </button>
              </div>
            )}
          </div>

          <aside className="iv-side">
            <div className="card iv-score">
              <span>Score</span>
              <b className="tabular">
                {score}
                <small> / {answered}</small>
              </b>
            </div>
            <div className="card iv-frame">
              <h4>A six-part answer</h4>
              <p>Say these out loud before you name anything. Most of the decision is made by the answers.</p>
              <ol>
                {FRAMEWORK.map((f) => (
                  <li key={f.step}>
                    <b>{f.step}</b>
                    <span>{f.ask}</span>
                  </li>
                ))}
              </ol>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}

