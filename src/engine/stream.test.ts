import { describe, expect, it } from 'vitest';
import { DEFAULT_REGIONS, planStream, type Region } from './stream';

const net = { rtt: 70, originMs: 40 };
const regions = (patch: Partial<Record<Region['id'], Partial<Region>>> = {}): Region[] =>
  DEFAULT_REGIONS.map((r) => ({ ...r, ...patch[r.id] }));

describe('planStream', () => {
  it('blocking shows everything at once, after the slowest query', () => {
    const p = planStream('blocking', regions(), net);
    const times = new Set(Object.values(p.contentAt));
    expect(times.size).toBe(1);
    expect(p.firstPaint).toBeGreaterThan(2400);
    expect(p.log).toHaveLength(1);
  });

  it('streaming paints the shell long before the slow regions finish', () => {
    const b = planStream('blocking', regions(), net);
    const s = planStream('streaming', regions(), net);
    expect(s.firstPaint).toBeLessThan(b.firstPaint / 5);
    expect(s.contentAt.hero).toBeLessThan(s.contentAt.recs);
    expect(s.contentAt.recs).toBeLessThan(s.contentAt.reviews);
    // Streaming does not make the slowest part any faster.
    expect(s.complete).toBeLessThanOrEqual(b.complete);
    expect(s.complete).toBeGreaterThan(2400);
  });

  it('a slow region without Suspense holds up the whole shell', () => {
    const r = regions({ reviews: { suspense: false } });
    const p = planStream('streaming', r, net);
    expect(p.blockedBy).toBe('reviews');
    expect(p.firstPaint).toBeGreaterThan(2400);
    expect(p.fallbackAt.reviews).toBeNull();
  });

  it('a fast region without Suspense is not flagged', () => {
    const p = planStream('streaming', regions(), net);
    expect(p.blockedBy).toBeNull();
  });

  it('ppr serves the static parts before a streamed shell could even leave the server', () => {
    const s = planStream('streaming', regions(), net);
    const p = planStream('ppr', regions(), net);
    expect(p.error).toBeNull();
    expect(p.contentAt.header).toBeLessThan(s.contentAt.header);
    expect(p.contentAt.hero).toBeLessThan(s.contentAt.hero);
    expect(p.fallbackAt.recs).not.toBeNull();
  });

  it('ppr turns a dynamic region outside Suspense into an error and falls back to blocking', () => {
    const p = planStream('ppr', regions({ recs: { suspense: false } }), net);
    expect(p.error).toMatch(/Suspense/);
    expect(new Set(Object.values(p.contentAt)).size).toBe(1);
  });

  it('log is in time order and mentions each streamed region', () => {
    const p = planStream('streaming', regions(), net);
    expect(p.log.map((l) => l.at)).toEqual([...p.log.map((l) => l.at)].sort((a, b) => a - b));
    expect(p.log.length).toBe(4);
    expect(p.log[0].code).toContain('<template');
  });

  it('is never faster than the network allows', () => {
    for (const mode of ['blocking', 'streaming', 'ppr'] as const) {
      const p = planStream(mode, regions(), net);
      for (const v of Object.values(p.contentAt)) expect(v).toBeGreaterThanOrEqual(net.rtt);
    }
  });
});
