import { describe, expect, it } from 'vitest';
import { PRESETS, PRODUCT_TREE, RUNTIME_KB, compute, flatten, lockOf } from './rsc';

const none = { forced: {}, slotted: {} };

describe('server component boundaries', () => {
  it('state and handlers are locked to the client, data is locked to the server', () => {
    const byId = Object.fromEntries(flatten(PRODUCT_TREE).map((x) => [x.id, x]));
    expect(lockOf(byId.search)).toBe('client');
    expect(lockOf(byId.zoom)).toBe('client');
    expect(lockOf(byId.reviews)).toBe('server');
    expect(lockOf(byId.desc)).toBe('free');
  });

  it('leaf boundaries ship only what needs the browser', () => {
    const r = compute(PRODUCT_TREE, none);
    const client = flatten(PRODUCT_TREE).filter((x) => r.placement[x.id].side === 'client').map((x) => x.id);
    // Description, specs and cards are dragged in by the tabs and the carousel that import them.
    expect(client.sort()).toEqual(['addtocart', 'card', 'carousel', 'cartbadge', 'desc', 'gallery', 'reviewform', 'search', 'specs', 'tabs', 'zoom']);
    expect(r.placement.desc).toMatchObject({ why: 'pulled', via: 'tabs' });
    expect(r.placement.card).toMatchObject({ why: 'pulled', via: 'carousel' });
    expect(r.clientKb).toBe(RUNTIME_KB + 12 + 5 + 6 + 9 + 7 + 4 + 38 + 9 + 10 + 14 + 11);
  });

  it('marking a component "use client" pulls its free descendants into the bundle', () => {
    const r = compute(PRODUCT_TREE, { forced: { price: true }, slotted: {} });
    expect(r.placement.price).toMatchObject({ side: 'client', why: 'chosen' });
    expect(r.clientKb).toBe(compute(PRODUCT_TREE, none).clientKb + 30);
    const header = compute(PRODUCT_TREE, { forced: { header: true }, slotted: {} });
    expect(header.placement.header.side).toBe('client');
    expect(header.clientKb).toBeGreaterThan(compute(PRODUCT_TREE, none).clientKb);
  });

  it('server-locked components stay on the server even below a client boundary', () => {
    const r = compute(PRODUCT_TREE, { forced: { header: true }, slotted: {} });
    expect(r.placement.reviews.side).toBe('server');
    expect(r.placement.info.side).toBe('server');
  });

  it('passing a pulled-in component as children keeps it on the server', () => {
    const before = compute(PRODUCT_TREE, none);
    const after = compute(PRODUCT_TREE, { forced: {}, slotted: { desc: true } });
    expect(before.placement.desc.side).toBe('client');
    expect(after.placement.desc).toMatchObject({ side: 'server', why: 'slotted' });
    expect(after.clientKb).toBe(before.clientKb - 38);
    // The tabs component itself still needs the browser.
    expect(after.placement.tabs.side).toBe('client');
  });

  it('slotting a node whose parent is on the server changes nothing', () => {
    const r = compute(PRODUCT_TREE, { forced: {}, slotted: { price: true } });
    expect(r.placement.price.why).toBe('default');
  });

  it('presets are ordered by cost: client-first > too-high > leaves', () => {
    const cost = (id: string) => {
      const p = PRESETS.find((x) => x.id === id)!;
      return compute(PRODUCT_TREE, p.choice(PRODUCT_TREE)).clientKb;
    };
    expect(cost('client-first')).toBeGreaterThan(cost('too-high'));
    expect(cost('too-high')).toBeGreaterThan(cost('imports'));
    expect(cost('imports')).toBeGreaterThan(cost('optimal'));
    expect(compute(PRODUCT_TREE, PRESETS.find((p) => p.id === 'optimal')!.choice(PRODUCT_TREE)).savedPct).toBeGreaterThan(0.5);
  });

  it('counts add up and the share is a fraction', () => {
    const r = compute(PRODUCT_TREE, none);
    expect(r.clientCount + r.serverCount).toBe(flatten(PRODUCT_TREE).length);
    expect(r.clientShare).toBeGreaterThan(0);
    expect(r.clientShare).toBeLessThan(1);
    expect(r.baselineKb - r.clientKb).toBe(r.savedKb);
  });
});
