import { describe, expect, it } from 'vitest';
import { DEFAULT_SETUP, NETWORKS, DEVICES, SCENARIOS, applyDevice, applyNetwork, applyScenario } from './presets';
import { STRATEGY_ORDER, horizon, rscJsKb, simulate, simulateAll } from './simulate';

const base = DEFAULT_SETUP;

describe('simulate: invariants', () => {
  for (const sc of SCENARIOS) {
    for (const n of NETWORKS) {
      for (const d of DEVICES) {
        const setup = applyDevice(applyNetwork(applyScenario(base, sc.id), n.id), d.id);
        for (const cache of ['hit', 'stale', 'miss'] as const) {
          it(`${sc.id}/${n.id}/${d.id}/${cache}: marks are finite and ordered`, () => {
            for (const id of STRATEGY_ORDER) {
              const r = simulate(id, { ...setup, cache });
              const m = r.marks;
              for (const v of Object.values(m)) expect(Number.isFinite(v)).toBe(true);
              expect(m.ttfb).toBeGreaterThan(0);
              expect(m.fcp).toBeGreaterThanOrEqual(m.ttfb);
              expect(m.lcp).toBeGreaterThanOrEqual(m.fcp);
              expect(m.complete).toBeGreaterThanOrEqual(m.lcp);
              expect(m.tti).toBeGreaterThanOrEqual(m.lcp);
              expect(r.visual.heroAt).toBeLessThanOrEqual(m.lcp + 0.001);
              expect(r.deadZone).toBeGreaterThanOrEqual(0);
              for (const seg of r.segments) {
                expect(seg.end).toBeGreaterThanOrEqual(seg.start);
                expect(seg.start).toBeGreaterThanOrEqual(0);
              }
            }
          });
        }
      }
    }
  }
});

describe('simulate: the trade-offs the lab teaches', () => {
  const r = simulateAll(base);

  it('static HTML beats a server render on time to first byte', () => {
    expect(r.ssg.marks.ttfb).toBeLessThan(r.ssr.marks.ttfb);
    expect(r.ppr.marks.ttfb).toBeLessThan(r.ssr.marks.ttfb);
  });

  it('streaming paints sooner than blocking SSR when a widget is slow', () => {
    expect(r.stream.marks.fcp).toBeLessThan(r.ssr.marks.fcp);
  });

  it('client rendering shows nothing until JavaScript has run', () => {
    expect(r.csr.marks.fcp).toBeGreaterThan(r.ssg.marks.fcp);
    expect(r.csr.marks.lcp).toBeGreaterThan(r.ssg.marks.lcp);
  });

  it('server-rendered pages have a window where they look ready but are not', () => {
    expect(r.ssr.deadZone).toBeGreaterThan(500);
    expect(r.ssg.deadZone).toBeGreaterThan(500);
    expect(r.csr.deadZone).toBe(0);
  });

  it('server components ship and hydrate less JavaScript', () => {
    expect(r.rsc.jsKb).toBeLessThan(r.stream.jsKb);
    expect(r.rsc.marks.tti).toBeLessThan(r.stream.marks.tti);
    expect(r.rsc.deadZone).toBeLessThan(r.stream.deadZone);
  });

  it('partial prerendering combines an instant shell with a small bundle', () => {
    expect(r.ppr.marks.fcp).toBeLessThanOrEqual(r.rsc.marks.fcp);
    expect(r.ppr.marks.tti).toBeLessThan(r.ssg.marks.tti);
  });

  it('streaming improves first paint, not the arrival of the main data', () => {
    // The hero still needs its data. Streaming only stops it waiting for everyone else.
    expect(r.stream.marks.lcp).toBeLessThan(r.ssr.marks.lcp);
    expect(r.stream.marks.lcp).toBeGreaterThan(r.stream.marks.fcp);
  });

  it('personalised content makes static pages wait for the client', () => {
    const personal = simulateAll({ ...base, personalized: true });
    expect(personal.ssg.marks.lcp).toBeGreaterThan(r.ssg.marks.lcp * 3);
    expect(personal.ppr.marks.lcp).toBeLessThan(personal.ssg.marks.lcp);
    // Servers already know who is asking.
    expect(personal.ssr.marks.lcp).toBeCloseTo(r.ssr.marks.lcp, 5);
  });

  it('isr behaves like ssg on a hit or stale hit and like ssr on a miss', () => {
    const hit = simulate('isr', { ...base, cache: 'hit' });
    const stale = simulate('isr', { ...base, cache: 'stale' });
    const miss = simulate('isr', { ...base, cache: 'miss' });
    expect(hit.marks.ttfb).toBeCloseTo(r.ssg.marks.ttfb, 5);
    expect(stale.marks.fcp).toBeCloseTo(hit.marks.fcp, 5);
    expect(miss.marks.ttfb).toBeGreaterThan(hit.marks.ttfb * 3);
    expect(miss.marks.ttfb).toBeCloseTo(r.ssr.marks.ttfb, 5);
  });

  it('origin load: static is free, ssr is every view, ppr is in between', () => {
    expect(r.ssg.originLoad).toBe(0);
    expect(r.ssr.originLoad).toBe(1);
    expect(r.ppr.originLoad).toBeGreaterThan(0);
    expect(r.ppr.originLoad).toBeLessThan(1);
  });
});

describe('simulate: monotonicity', () => {
  it('a slower network never makes anything faster', () => {
    for (const id of STRATEGY_ORDER) {
      let prev = 0;
      for (const n of NETWORKS) {
        const t = simulate(id, applyNetwork(base, n.id)).marks.tti;
        expect(t).toBeGreaterThanOrEqual(prev);
        prev = t;
      }
    }
  });

  it('a slower CPU never makes anything faster', () => {
    for (const id of STRATEGY_ORDER) {
      let prev = 0;
      for (const d of DEVICES) {
        const t = simulate(id, applyDevice(base, d.id)).marks.tti;
        expect(t).toBeGreaterThanOrEqual(prev);
        prev = t;
      }
    }
  });

  it('more JavaScript never makes time to interactive faster', () => {
    for (const id of STRATEGY_ORDER) {
      const small = simulate(id, { ...base, jsKb: 150 }).marks.tti;
      const large = simulate(id, { ...base, jsKb: 600 }).marks.tti;
      expect(large).toBeGreaterThanOrEqual(small);
    }
  });

  it('slower data only hurts strategies that wait for it', () => {
    const fast = simulateAll({ ...base, slowMs: 100, dataMs: 100 });
    const slow = simulateAll({ ...base, slowMs: 3000, dataMs: 100 });
    expect(slow.ssr.marks.fcp).toBeGreaterThan(fast.ssr.marks.fcp + 2000);
    expect(slow.stream.marks.fcp).toBeCloseTo(fast.stream.marks.fcp, 5);
    expect(slow.ssg.marks.fcp).toBeCloseTo(fast.ssg.marks.fcp, 5);
  });
});

describe('rscJsKb', () => {
  it('always keeps the runtime and scales the rest', () => {
    expect(rscJsKb({ jsKb: 300, clientShare: 0 })).toBe(45);
    expect(rscJsKb({ jsKb: 300, clientShare: 1 })).toBe(300);
    expect(rscJsKb({ jsKb: 30, clientShare: 0.5 })).toBe(45);
  });
});

describe('horizon', () => {
  it('covers every segment', () => {
    const results = Object.values(simulateAll(base));
    const h = horizon(results);
    for (const res of results) for (const seg of res.segments) expect(seg.end).toBeLessThanOrEqual(h);
  });
});
