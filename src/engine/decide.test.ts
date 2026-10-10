import { describe, expect, it } from 'vitest';
import { ARCHETYPES, DEFAULT_ANSWERS, QUESTIONS, recommend } from './decide';

const top = (name: string) => recommend(ARCHETYPES.find((a) => a.name === name)!.answers);

describe('recommend', () => {
  it('picks static generation for a docs site', () => {
    expect(top('Docs site')[0].id).toBe('ssg');
  });

  it('picks a cache-backed or partial strategy for an e-commerce product page', () => {
    expect(['ppr', 'isr']).toContain(top('E-commerce product page')[0].id);
  });

  it('picks client rendering for a dashboard on static hosting', () => {
    const r = top('Admin dashboard');
    expect(r[0].id).toBe('csr');
    expect(r.filter((v) => v.blocked).map((v) => v.id).sort()).toEqual(['isr', 'ppr', 'rsc', 'ssr', 'stream']);
  });

  it('never recommends static generation for a feed', () => {
    const r = top('Social feed');
    expect(r[0].id).not.toBe('ssg');
    expect(['stream', 'rsc', 'ssr']).toContain(r[0].id);
  });

  it('picks incremental regeneration for huge, mostly-shared listing sets', () => {
    expect(top('Marketplace listings')[0].id).toBe('isr');
  });

  it('puts blocked options last, whatever their score', () => {
    const r = recommend({ ...DEFAULT_ANSWERS, hosting: 'static' });
    const firstBlocked = r.findIndex((v) => v.blocked);
    expect(r.slice(firstBlocked).every((v) => v.blocked)).toBe(true);
  });

  it('keeps scores in range and explains its strongest calls', () => {
    for (const q of QUESTIONS) {
      for (const o of q.options) {
        const r = recommend({ ...DEFAULT_ANSWERS, [q.key]: o.value });
        for (const v of r) {
          expect(v.score).toBeGreaterThanOrEqual(0);
          expect(v.score).toBeLessThanOrEqual(100);
        }
      }
    }
    const winner = top('Docs site')[0];
    expect(winner.for.length).toBeGreaterThan(0);
  });

  it('answers change the ranking', () => {
    const a = recommend({ ...DEFAULT_ANSWERS, who: 'same', change: 'rare', slow: 'no' })[0].id;
    const b = recommend({ ...DEFAULT_ANSWERS, who: 'everything', change: 'live' })[0].id;
    expect(a).not.toBe(b);
  });
});
