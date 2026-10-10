import { describe, expect, it } from 'vitest';
import { SHOP_TYPES, buildShopInterior, type ShopType } from '../src/world/shopKit';
import { ShopFlow, ShopPaths } from '../src/world/shopFlow';
import { seeded } from '../src/world/kitGeometry';

const SIZE: Record<ShopType, { w: number; d: number }> = {
  grocery: { w: 17, d: 8 }, phone: { w: 12, d: 8 }, clothing: { w: 12, d: 8 }, furniture: { w: 12, d: 8 }, pharmacy: { w: 12, d: 8 },
  cafe: { w: 9.4, d: 7.4 }, bank: { w: 31.6, d: 21.6 }, hardware: { w: 12, d: 8 }, craft: { w: 10, d: 8 }, beauty: { w: 17, d: 8 },
};

describe('shop customers (spec §31: enter → browse → buy → leave without the player)', () => {
  for (const type of SHOP_TYPES) for (const shell of [false, true]) {
    if (type === 'bank' && shell) continue;
    it(`${type}${shell ? ' walk-in' : ''}: customers cycle through the shop on their own, never through the furniture`, () => {
      const s = buildShopInterior(type, SIZE[type], 2, { detail: 'medium', shell, at: { x: 40, z: -20, yaw: 0 } });
      const paths = new ShopPaths(s.bounds, s.colliders);
      const flow = new ShopFlow(s.anchors, paths, 3, seeded(9), shell ? { outside: 0 } : {});
      const inside = (x: number, z: number) => s.colliders.some(c => x > c.x0 + 0.05 && x < c.x1 - 0.05 && z > c.z0 + 0.05 && z < c.z1 - 0.05);
      let maxBuying = 0;
      for (let t = 0; t < 400; t += 0.1) {
        flow.update(0.1, true);
        for (const c of flow.present()) expect(inside(c.x, c.z), `${c.state} at ${c.x.toFixed(2)},${c.z.toFixed(2)}`).toBe(false);
        const buying = flow.customers.filter(c => c.state === 'buy');
        maxBuying = Math.max(maxBuying, buying.length);
        for (const c of buying) { expect(Math.hypot(c.x - s.anchors.counter.x, c.z - s.anchors.counter.z)).toBeLessThan(0.05); expect(c.pose).toBe('Talk'); }
        const slots = flow.customers.filter(c => c.slot >= 0).map(c => c.slot);
        expect(new Set(slots).size).toBe(slots.length);                               // one customer per queue place
      }
      expect(maxBuying).toBe(1);                                                        // one at a time at the counter
      expect(flow.stats.entered).toBeGreaterThanOrEqual(4);
      expect(flow.stats.browsed).toBeGreaterThanOrEqual(3);
      expect(flow.stats.bought).toBeGreaterThanOrEqual(3);
      expect(flow.stats.left).toBeGreaterThanOrEqual(3);
    });
  }

  it('waits behind the player standing at the counter, and nobody comes in when the shop is closed', () => {
    const s = buildShopInterior('grocery', SIZE.grocery, 1);
    const flow = new ShopFlow(s.anchors, new ShopPaths(s.bounds, s.colliders), 2, seeded(3));
    const c = s.anchors.counter;
    for (let t = 0; t < 120; t += 0.1) flow.update(0.1, true, p => Math.hypot(p.x - c.x, p.z - c.z) < 0.1);
    expect(flow.stats.bought).toBe(0);
    expect(flow.customers.some(x => x.state === 'queue' && x.slot === 0)).toBe(true);
    for (let t = 0; t < 60; t += 0.1) flow.update(0.1, true);
    expect(flow.stats.bought).toBeGreaterThanOrEqual(1);
    const closed = new ShopFlow(s.anchors, new ShopPaths(s.bounds, s.colliders), 2, seeded(3));
    for (let t = 0; t < 120; t += 0.1) closed.update(0.1, false);
    expect(closed.stats.entered).toBe(0);
  });

  it('plans around shelves: the path from the door to the far displays bends', () => {
    const s = buildShopInterior('bank', SIZE.bank, 1);
    const paths = new ShopPaths(s.bounds, s.colliders);
    const p = paths.path(s.anchors.door, s.anchors.counter);
    expect(p).not.toBeNull();
    for (let k = 1; k < p!.length; k++) expect(paths.clear(p![k - 1], p![k])).toBe(true);
  });
});
