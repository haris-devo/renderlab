import { useMemo, useState } from 'react';
import { CRITERIA, STRATEGIES, type CriterionId } from '../engine/strategies';
import type { StrategyId } from '../engine/types';
import { StrategyTag } from './ui';
import './matrix.css';

const WORD = { 1: 'Weak', 2: 'Fair', 3: 'Good', 4: 'Strong' } as const;

export function Matrix({ active, onPick }: { active: StrategyId; onPick: (s: StrategyId) => void }) {
  const [sort, setSort] = useState<CriterionId | null>(null);
  const [hint, setHint] = useState<CriterionId | null>(null);

  const rows = useMemo(() => {
    if (!sort) return STRATEGIES;
    return [...STRATEGIES].sort((a, b) => b.ratings[sort] - a.ratings[sort]);
  }, [sort]);

  const shown = CRITERIA.find((c) => c.id === (hint ?? sort));

  return (
    <div className="matrix card">
      <div className="matrix-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">Strategy</span>
              </th>
              {CRITERIA.map((c) => (
                <th key={c.id} scope="col" aria-sort={sort === c.id ? 'descending' : 'none'}>
                  <button
                    type="button"
                    onClick={() => setSort(sort === c.id ? null : c.id)}
                    onMouseEnter={() => setHint(c.id)}
                    onMouseLeave={() => setHint(null)}
                    onFocus={() => setHint(c.id)}
                    onBlur={() => setHint(null)}
                    data-on={sort === c.id}
                  >
                    {c.name}
                    <i aria-hidden="true">{sort === c.id ? '↓' : ''}</i>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id} data-active={s.id === active}>
                <th scope="row">
                  <button type="button" onClick={() => onPick(s.id)} aria-label={`Open ${s.full}`}>
                    <StrategyTag id={s.id} />
                  </button>
                </th>
                {CRITERIA.map((c) => {
                  const v = s.ratings[c.id];
                  return (
                    <td key={c.id} data-v={v} data-hot={sort === c.id}>
                      <span className="meter" aria-hidden="true">
                        {[1, 2, 3, 4].map((n) => (
                          <i key={n} data-on={n <= v} />
                        ))}
                      </span>
                      <span className="sr-only">{WORD[v]}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="matrix-hint" aria-live="polite">
        {shown ? (
          <>
            <b>{shown.name}.</b> {shown.hint}
          </>
        ) : (
          'Four filled bars is the best case for that column.'
        )}
      </p>
    </div>
  );
}
