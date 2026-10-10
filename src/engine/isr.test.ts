import { describe, expect, it } from 'vitest';
import { createIsr, invalidate, publish, purge, stats, tick, visit } from './isr';

describe('isr cache', () => {
  it('serves a pre-built page as a hit inside the window', () => {
    let s = createIsr({ revalidate: 30 });
    s = tick(s, 10);
    s = visit(s);
    expect(s.visits[0].outcome).toBe('hit');
    expect(s.visits[0].waited).toBe(0);
  });

  it('serves stale once the window has passed and starts exactly one regeneration', () => {
    let s = createIsr({ revalidate: 30, renderTime: 2 });
    s = publish(tick(s, 5));
    s = tick(s, 30);
    s = visit(s);
    s = visit(s);
    s = visit(s);
    expect(s.visits.map((v) => v.outcome)).toEqual(['stale', 'stale', 'stale']);
    expect(s.visits.map((v) => v.startedRegen)).toEqual([true, false, false]);
    expect(s.regens).toBe(1);
    // Every one of them saw version 1 while version 2 was live.
    expect(s.visits.every((v) => v.served === 1 && v.cms === 2)).toBe(true);
    expect(s.visits[0].staleFor).toBeGreaterThan(25);
  });

  it('shows the new version to the visitor after the regeneration finishes', () => {
    let s = createIsr({ revalidate: 30, renderTime: 2 });
    s = publish(tick(s, 5));
    s = tick(s, 30);
    s = visit(s);
    s = tick(s, 2.1);
    s = visit(s);
    expect(s.visits[1].outcome).toBe('hit');
    expect(s.visits[1].served).toBe(2);
    expect(s.visits[1].staleFor).toBe(0);
  });

  it('makes the first visitor wait when nothing is cached, then caches for everyone', () => {
    let s = createIsr({ prebuilt: false, renderTime: 2 });
    s = visit(s);
    s = tick(s, 3);
    s = visit(s);
    expect(s.visits[0].outcome).toBe('miss');
    expect(s.visits[0].waited).toBe(2);
    expect(s.visits[1].outcome).toBe('hit');
  });

  it('on-demand revalidation by swr serves stale once, then fresh', () => {
    let s = createIsr({ revalidate: 600, renderTime: 2 });
    s = publish(tick(s, 1));
    s = visit(s);
    expect(s.visits[0].outcome).toBe('hit');
    expect(s.visits[0].staleFor).toBeGreaterThanOrEqual(0);
    s = invalidate(s, 'swr');
    s = visit(s);
    expect(s.visits[1].outcome).toBe('stale');
    s = tick(s, 3);
    s = visit(s);
    expect(s.visits[2].outcome).toBe('hit');
    expect(s.visits[2].served).toBe(2);
  });

  it('on-demand expiry makes the next visitor wait for fresh content', () => {
    let s = createIsr({ revalidate: 600, renderTime: 2 });
    s = publish(tick(s, 1));
    s = invalidate(s, 'expire');
    s = visit(s);
    expect(s.visits[0].outcome).toBe('miss');
    expect(s.visits[0].served).toBe(2);
    expect(s.visits[0].staleFor).toBe(0);
  });

  it('purging forces a miss', () => {
    let s = purge(createIsr());
    s = visit(s);
    expect(s.visits[0].outcome).toBe('miss');
  });

  it('records events the timeline can draw', () => {
    let s = createIsr({ revalidate: 10, renderTime: 2 });
    s = publish(tick(s, 11));
    s = visit(s);
    s = tick(s, 2.5);
    s = invalidate(s, 'swr');
    const kinds = s.events.map((e) => e.kind);
    expect(kinds).toEqual(['stored', 'publish', 'regen-start', 'stored', 'invalidate']);
    expect(s.events[2].doneAt).toBe(13);
    expect(s.events[3]).toMatchObject({ t: 13, version: 2 });
  });

  it('computes stats', () => {
    let s = createIsr({ revalidate: 10, renderTime: 2 });
    s = visit(s);
    s = publish(tick(s, 11));
    s = visit(s);
    s = tick(s, 3);
    s = visit(s);
    const st = stats(s);
    expect(st).toMatchObject({ total: 3, hits: 2, stale: 1, misses: 0, regens: 1 });
    expect(st.instant).toBe(1);
    expect(st.worstStaleFor).toBe(0);
  });

  it('a lower revalidate window bounds how stale visitors can be', () => {
    const run = (revalidate: number) => {
      let s = createIsr({ revalidate, renderTime: 1 });
      s = publish(tick(s, 1));
      for (let i = 0; i < 120; i++) s = visit(tick(s, 1));
      return stats(s).worstStaleFor;
    };
    expect(run(10)).toBeLessThan(run(60));
  });
});
