import { useMemo, useState } from 'react';
import { ARCHETYPES, DEFAULT_ANSWERS, QUESTIONS, SWITCH_IF, recommend, type Answers } from '../engine/decide';
import { STRATEGY_BY_ID } from '../engine/strategies';
import type { StrategyId } from '../engine/types';
import { Icon, SectionHead, StrategyTag, accent } from './ui';
import './decide.css';

export function Decide({ onTry, onDeep }: { onTry: (id: StrategyId, a: Answers) => void; onDeep: (id: StrategyId) => void }) {
  const [answers, setAnswers] = useState<Answers>(DEFAULT_ANSWERS);
  const [open, setOpen] = useState<StrategyId | null>(null);
  const ranked = useMemo(() => recommend(answers), [answers]);
  const top = ranked[0];
  const expanded = open && ranked.some((r) => r.id === open) ? open : top.id;

  const set = <K extends keyof Answers>(key: K, value: Answers[K]) => {
    setOpen(null);
    setAnswers((a) => ({ ...a, [key]: value }));
  };

  return (
    <section className="section" id="decide" aria-labelledby="decide-title">
      <div className="wrap">
        <SectionHead n={6} id="Decide" title="Describe the page and get a defensible answer">
          Seven questions, the same ones a senior engineer asks before choosing. The ranking updates as you answer, and every call comes with the reasoning.
        </SectionHead>

        <div className="dc" id="decide-title">
          <div className="dc-left">
            <div className="dc-start">
              <span>Start from</span>
              <div className="seg" role="group" aria-label="Example pages">
                {ARCHETYPES.map((a) => (
                  <button
                    key={a.name}
                    type="button"
                    aria-pressed={JSON.stringify(a.answers) === JSON.stringify(answers)}
                    onClick={() => {
                      setOpen(null);
                      setAnswers(a.answers);
                    }}
                  >
                    {a.name}
                  </button>
                ))}
              </div>
            </div>

            {QUESTIONS.map((q) => (
              <fieldset key={q.key} className="dc-q card">
                <legend>{q.title}</legend>
                <p className="hint">{q.help}</p>
                <div className="dc-opts" role="radiogroup" aria-label={q.title}>
                  {q.options.map((o) => (
                    <button
                      key={String(o.value)}
                      type="button"
                      role="radio"
                      aria-checked={answers[q.key] === o.value}
                      onClick={() => set(q.key, o.value as never)}
                    >
                      <b>{o.label}</b>
                      <span>{o.hint}</span>
                    </button>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>

          <aside className="dc-right" aria-label="Recommendation" aria-live="polite">
            <div className="dc-result card">
              <p className="dc-kicker">Best fit</p>
              <ol className="dc-rank">
                {ranked.map((v, i) => {
                  const meta = STRATEGY_BY_ID[v.id];
                  const isOpen = expanded === v.id;
                  return (
                    <li key={v.id} data-open={isOpen} data-blocked={!!v.blocked} data-top={i === 0 && !v.blocked} style={accent(v.id)}>
                      <button type="button" className="dc-row" onClick={() => setOpen(isOpen ? top.id : v.id)} aria-expanded={isOpen}>
                        <span className="dc-pos">{i + 1}</span>
                        <span className="dc-name">
                          <StrategyTag id={v.id} />
                        </span>
                        <span className="dc-bar" aria-hidden="true">
                          <i style={{ width: `${v.blocked ? 0 : v.score}%` }} />
                        </span>
                        <span className="dc-score tabular">{v.blocked ? '–' : v.score}</span>
                      </button>
                      {isOpen && (
                        <div className="dc-more">
                          {v.blocked ? (
                            <p className="dc-blocked">{v.blocked}</p>
                          ) : (
                            <>
                              <p className="dc-tagline">
                                <b>{meta.full}.</b> {meta.tagline}
                              </p>
                              {v.for.length > 0 && (
                                <div className="dc-why" data-tone="good">
                                  <h4>Why it fits</h4>
                                  <ul>
                                    {v.for.map((t) => (
                                      <li key={t}>{t}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {v.against.length > 0 && (
                                <div className="dc-why" data-tone="bad">
                                  <h4>What counts against it</h4>
                                  <ul>
                                    {v.against.map((t) => (
                                      <li key={t}>{t}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              <p className="dc-switch">
                                <b>When to move on.</b> {SWITCH_IF[v.id]}
                              </p>
                              <div className="dc-actions">
                                <button type="button" className="btn btn-primary btn-sm" onClick={() => onTry(v.id, answers)}>
                                  Run it in the lab {Icon.arrow}
                                </button>
                                <button type="button" className="btn btn-sm" onClick={() => onDeep(v.id)}>
                                  How it works
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
              <p className="dc-note">
                Scores come from a transparent rule table in <code>src/engine/decide.ts</code>, tested against five typical pages. They are a starting point for an argument, not a verdict.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
