import { describe, expect, it } from 'vitest';
import { stubCanvas } from './hubstub';
import { buildShopInterior } from '../src/world/shopKit';
import { ShopPaths } from '../src/world/shopFlow';
import { QUINCAILLERIE, buildQuincaillerie, quincaillerieAt } from '../src/economy/stall';
import { buildSpots } from '../src/social/ambientSpots';
import type { Action, Collider, HubWorld } from '../src/world/types';

stubCanvas();
const ACTION: Action = { id: 'meubles', label: 'Voir les meubles', detail: 'Livrés dans ta chambre', seconds: 0, special: 'shop' };
const inCols = (cols: readonly Collider[], p: { x: number; z: number }, m = 0) => cols.some(c => p.x > c.x0 - m && p.x < c.x1 + m && p.z > c.z0 - m && p.z < c.z1 + m);

describe('« Quincaillerie · meubles »: the hardware shop of the kit, variant « · meubles »', () => {
  it('a small open shop: counter, tools and shelves, then the furniture it sells; every spot reached from the street', () => {
    for (const detail of ['low', 'medium', 'high'] as const) for (const shell of [false, 'open'] as const) {
      const s = buildShopInterior('hardware', { w: QUINCAILLERIE.w, d: QUINCAILLERIE.d }, 2718, { detail, shell, variant: 1, height: QUINCAILLERIE.h, at: { x: 85.5, z: -10.5, y: 0.12 } });
      const a = s.anchors, paths = new ShopPaths(s.bounds, s.colliders);
      expect(s.budget.drawCalls).toBe(1);                                            // the atlas only
      expect(a.browse.length).toBeGreaterThanOrEqual(2);                             // the pipes, the furniture corner
      for (const p of [a.counter, a.keeper, ...a.queue, ...a.browse]) {
        expect(inCols(s.colliders, p, 0.25), `${detail} ${shell}: blocked ${JSON.stringify(p)}`).toBe(false);
        expect(paths.path(a.door, p), `${detail} ${shell}: no way to ${JSON.stringify(p)}`).not.toBeNull();
      }
      for (const c of s.colliders) { expect(c.x0).toBeGreaterThanOrEqual(s.bounds.x0 - 0.01); expect(c.x1).toBeLessThanOrEqual(s.bounds.x1 + 0.01); expect(c.z0).toBeGreaterThanOrEqual(s.bounds.z0 - 0.01); expect(c.z1).toBeLessThanOrEqual(s.bounds.z1 + 0.01); }
      // the « · meubles » corner adds its stack of chairs, mattress and mirror to the plain hardware shop
      const plain = buildShopInterior('hardware', { w: QUINCAILLERIE.w, d: QUINCAILLERIE.d }, 2718, { detail, shell, height: QUINCAILLERIE.h, at: { x: 85.5, z: -10.5, y: 0.12 } });
      expect(s.anchors.browse.length).toBe(plain.anchors.browse.length + 1);
    }
  });

  it('stands on the Maïga du marché\'s lot in Pikine, beside it, its sheet at the counter, clear of everything else', async () => {
    const { buildHub } = await import('../src/world/builder');
    const h: HubWorld = buildHub('pikine', true);
    const m = h.interactables.find(i => i.id.startsWith('pikine:') && i.id.includes(':maiga:'))!;
    const before = [...h.colliders], people = h.people.length;
    const { shop, sheet } = buildQuincaillerie(h, m, ACTION, 'low');
    const b = shop.bounds, at = quincaillerieAt(m);
    expect(at.x).toBeCloseTo(85.5, 5);
    // on the Maïga's lot (x 67–89), on the Maïga's front line, clear of the Maïga and of Garage Modou
    expect(b.x1).toBeLessThanOrEqual(89);
    expect(b.z1).toBeCloseTo(m.z - 2, 1);
    for (const c of before.filter(c => c.h > 0.3)) expect(c.x1 <= b.x0 + 0.01 || c.x0 >= b.x1 - 0.01 || c.z1 <= b.z0 + 0.01 || c.z0 >= b.z1 - 0.01, JSON.stringify(c)).toBe(true);
    // the sheet at the counter with the same action, the keeper behind it, the sign on the front
    expect(sheet.id).toBe('pikine:shop:meubles');
    expect(sheet.actions).toEqual([ACTION]);
    expect({ x: sheet.x, z: sheet.z }).toEqual({ x: shop.anchors.counter.x, z: shop.anchors.counter.z });
    expect(h.interactables.filter(i => i.id === sheet.id).length).toBe(1);
    expect(h.people.length).toBe(people + 1);
    expect(h.people.at(-1)).toMatchObject({ x: shop.anchors.keeper.x, z: shop.anchors.keeper.z });
    // where the economy check stands to buy (1.5 m out from the sheet, facing it) is free
    expect(inCols(h.colliders, { x: sheet.x, z: sheet.z + 1.5 }, 0.3)).toBe(false);
    // the city's people come in to it like any stocked shop (src/social/ambientSpots.ts)
    const shops = [{ key: sheet.id, type: 'hardware', anchors: shop.anchors, bounds: shop.bounds, colliders: shop.colliders }];
    const spots = buildSpots({ interactables: h.interactables, layout: { specials: [], sea: null }, colliders: h.colliders, people: [], arena: null, places: [], seats: [], shops });
    const spot = spots.find(x => x.id === 'legacy:pikine:shop:meubles');
    expect(spot?.shop).toBeTruthy();
    expect(spot!.stands.length).toBeGreaterThanOrEqual(1);
    expect(spot!.shop!.checkout[0]).toEqual(shop.anchors.counter);
  });
});
