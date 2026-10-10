import { describe, expect, it } from 'vitest';
import { SHOP_TYPES, buildShopInterior, type ShopType } from '../src/world/shopKit';
import { ShopPaths } from '../src/world/shopFlow';
import { buildSpots } from '../src/social/ambientSpots';

/** Spec §31: the city's people walk into a stocked shop, browse, queue at the counter and leave — never through a shelf. */
const SIZE: Record<ShopType, { w: number; d: number }> = {
  grocery: { w: 17, d: 8 }, phone: { w: 12, d: 8 }, clothing: { w: 12, d: 8 }, furniture: { w: 12, d: 8 }, pharmacy: { w: 12, d: 8 },
  cafe: { w: 9.4, d: 7.4 }, bank: { w: 31.6, d: 21.6 }, hardware: { w: 12, d: 8 }, craft: { w: 10, d: 8 }, beauty: { w: 17, d: 8 },
  garage: { w: 14, d: 8 }, restaurant: { w: 12, d: 9 },
};
const inside = (cols: { x0: number; x1: number; z0: number; z1: number }[], p: { x: number; z: number }) => cols.some(c => p.x > c.x0 && p.x < c.x1 && p.z > c.z0 && p.z < c.z1);

describe('walking inside a stocked shop (src/world/shopFlow.ts)', () => {
  for (const type of SHOP_TYPES) for (const shell of [false, true]) {
    if (type === 'bank' && shell) continue;
    it(`${type}${shell ? ' walk-in' : ''}: from the door to every display and queue place, and back, around the furniture`, () => {
      const s = buildShopInterior(type, SIZE[type], 2, { detail: 'medium', shell, at: { x: 40, z: -20, yaw: 0 } });
      const paths = new ShopPaths(s.bounds, s.colliders), a = s.anchors;
      for (const to of [...a.browse, ...a.queue]) {
        for (const [p, q] of [[a.door, to], [to, a.door], [to, a.counter]]) {
          const route = paths.path(p, q);
          expect(route, `${type}: no way from ${JSON.stringify(p)} to ${JSON.stringify(q)}`).not.toBeNull();
          for (let k = 1; k < route!.length; k++) {
            expect(paths.clear(route![k - 1], route![k]), `${type}: leg ${k} ${JSON.stringify(route![k - 1])} → ${JSON.stringify(route![k])} of ${JSON.stringify(p)} → ${JSON.stringify(q)}`).toBe(true);
            for (let t = 0; t <= 1; t += 0.1) {
              const m = { x: route![k - 1].x + (route![k].x - route![k - 1].x) * t, z: route![k - 1].z + (route![k].z - route![k - 1].z) * t };
              expect(inside(s.colliders, m), `${type}: through the furniture at ${m.x.toFixed(2)},${m.z.toFixed(2)}`).toBe(false);
            }
          }
        }
      }
    });
  }

  it('the city gives every stocked shop a spot: door, displays, checkout line (counter first), seats inside', () => {
    const at = { x: -101, z: 80, y: 0.12 };
    const s = buildShopInterior('grocery', SIZE.grocery, 1, { at });
    const bank = buildShopInterior('bank', SIZE.bank, 1, { at: { x: 90, z: -37, y: 0.15 } });
    const craft = [0, 1, 2].map(k => buildShopInterior('craft', SIZE.craft, 1, { variant: k, at: { x: -150 + k * 12, z: 60 } }));
    const shops = [
      { key: 'pikine:city:boutique', type: 'grocery', anchors: s.anchors, bounds: s.bounds, colliders: s.colliders },
      { key: 'plateau:city:bank', type: 'bank', anchors: bank.anchors, bounds: bank.bounds, colliders: bank.colliders },
      ...craft.map((c, k) => ({ key: `corniche:city:craft-${k}`, type: 'craft', anchors: c.anchors, bounds: c.bounds, colliders: c.colliders })),
    ];
    const interactables = [
      { id: 'pikine:city:boutique', x: s.anchors.counter.x, z: s.anchors.counter.z },
      { id: 'plateau:city:bank', x: bank.anchors.counter.x, z: bank.anchors.counter.z },
      { id: 'corniche:city:craft', x: craft[1].anchors.counter.x, z: craft[1].anchors.counter.z },
    ];
    const spots = buildSpots({ interactables, layout: { specials: [], sea: null }, colliders: [...s.colliders, ...bank.colliders], people: [], arena: null, places: [], seats: bank.seats, shops });
    const shopSpots = spots.filter(x => x.shop);
    expect(shopSpots.map(x => x.id).sort()).toEqual(['legacy:corniche:city:craft:0', 'legacy:corniche:city:craft:1', 'legacy:corniche:city:craft:2', 'legacy:pikine:city:boutique', 'legacy:plateau:city:bank']);
    const g = shopSpots.find(x => x.id === 'legacy:pikine:city:boutique')!;
    expect(g.tags).toContain('shop');
    expect(g.shop!.door).toEqual(s.anchors.door);
    expect(g.shop!.checkout[0]).toEqual(s.anchors.counter);
    expect(g.stands.length).toBeGreaterThanOrEqual(1);
    for (const st of g.stands) expect(g.shop!.path(g.shop!.door, st)).not.toBeNull();
    const b = shopSpots.find(x => x.id === 'legacy:plateau:city:bank')!;
    expect(b.tags).toContain('bank');
    expect(b.seats.length).toBe(bank.seats.length);                                   // the waiting chairs, then the guichet
    expect(b.shop!.checkout.length).toBeGreaterThanOrEqual(4);
  });
});
