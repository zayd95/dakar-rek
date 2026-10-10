import { describe, expect, it } from 'vitest';
import { stubCanvas } from './hubstub';
import { buildShopInterior, stockedShop, stockedShopFront, type ShopInterior } from '../src/world/shopKit';
import { ShopPaths } from '../src/world/shopFlow';
import { NDIAYE_AUTO } from '../src/world/city';
import { sedanSeed, CAR_ASSET, SEDAN_BLUE, SEDAN_WHITE } from '../src/transport/car';
import { roadDistance } from '../src/transport/ownedModule';
import { specOf } from '../src/economy/catalog';
import { fcfa } from '../src/ui/hud';
import { glossed } from '../src/i18n/wolof';
import type { Collider, HubWorld } from '../src/world/types';

stubCanvas();
/** Ndiaye Auto as the Plateau places it (src/world/city.ts): open on the road east of the shops block. */
const AT = { x: 107.5, z: 94, y: 0.12, yaw: Math.PI / 2 };
const LOTS = [null, { kind: 'sedan' as const, seed: sedanSeed(SEDAN_WHITE) }, { kind: 'sedan' as const, seed: sedanSeed(SEDAN_BLUE) }];
const inRect = (r: { x0: number; x1: number; z0: number; z1: number }, p: { x: number; z: number }, m = 0) => p.x > r.x0 + m && p.x < r.x1 - m && p.z > r.z0 + m && p.z < r.z1 - m;
const inCols = (cols: readonly Collider[], p: { x: number; z: number }, m = 0) => cols.some(c => p.x > c.x0 - m && p.x < c.x1 + m && p.z > c.z0 - m && p.z < c.z1 + m);
const fwd = (yaw: number) => ({ x: Math.sin(yaw), z: Math.cos(yaw) });

describe('the car showroom of the shop kit (showroom_cars)', () => {
  const s: ShopInterior = buildShopInterior('showroom_cars', { w: 14, d: 9 }, 7, { detail: 'medium', at: AT, shell: 'open', lots: LOTS });
  const a = s.anchors, lots = a.lots!;

  it('three lots nose to the open front, their price cards at the noses, the lot for sale left to the dealer', () => {
    expect(lots.length).toBe(3);
    const out = fwd(AT.yaw);                                                          // the open front faces +x (the road)
    expect(s.front.x).toBeCloseTo(AT.x + 4.5, 5);
    for (const l of lots) {
      expect(inRect(s.bounds, l, 0.9)).toBe(true);
      expect(l.yaw).toBeCloseTo(AT.yaw, 5);                                           // nose toward the street
      const ahead = (l.card.x - l.x) * out.x + (l.card.z - l.z) * out.z;
      expect(ahead).toBeGreaterThan(2.25);                                            // the card stands past the nose…
      expect(inRect(s.bounds, l.card, 0.1)).toBe(true);                               // …still on the showroom's floor
    }
    // the kit parks the two cars already taken (solid); the first lot stays free for the one the dealer sells
    expect(inCols(s.colliders, lots[0])).toBe(false);
    expect(inCols(s.colliders, lots[1])).toBe(true);
    expect(inCols(s.colliders, lots[2])).toBe(true);
    // one draw call each: the atlas, the glass (the cars' windows), the kit cars
    expect(s.budget.drawCalls).toBe(3);
    const all = buildShopInterior('showroom_cars', { w: 14, d: 9 }, 7, { detail: 'medium', at: AT, shell: 'open' });
    expect(all.anchors.lots!.every(l => inCols(all.colliders, l))).toBe(true);        // by default it fills every lot
  });

  it('the salesman behind his desk at the back, the customer in front of it, both reached from the street', () => {
    const out = fwd(AT.yaw), depth = (p: { x: number; z: number }) => (p.x - AT.x) * out.x + (p.z - AT.z) * out.z;
    expect(depth(a.keeper)).toBeLessThan(depth(a.counter) - 1);
    expect(depth(a.counter)).toBeLessThan(Math.min(...lots.map(depth)) - 1.5);         // behind the cars, at the back
    // the desk stands between them
    let desk = false;
    for (let t = 0.1; t < 0.9; t += 0.05) desk ||= inCols(s.colliders.filter(c => c.h < 1), { x: a.keeper.x + (a.counter.x - a.keeper.x) * t, z: a.keeper.z + (a.counter.z - a.keeper.z) * t });
    expect(desk).toBe(true);
    const paths = new ShopPaths(s.bounds, s.colliders);
    for (const p of [a.counter, a.keeper, ...a.queue, ...a.browse]) expect(paths.path(a.door, p), JSON.stringify(p)).not.toBeNull();
    // the waiting bench and the client's chair
    expect(s.seats.filter(x => x.kind === 'bench').length).toBe(3);
    expect(s.seats.some(x => x.kind === 'chair')).toBe(true);
  });
});

describe('Ndiaye Auto in the Plateau (src/world/city.ts + src/transport/carModule.ts)', () => {
  let hub: HubWorld | null = null;
  const plateau = async () => { if (!hub) { const { buildHub } = await import('../src/world/builder'); hub = buildHub('plateau', true); } return hub; };

  it('stands in the shops block, open on the road, clear of its neighbours', async () => {
    const h = await plateau(), show = stockedShop(h.group, NDIAYE_AUTO)!;
    expect(show).not.toBeNull();
    expect(show.type).toBe('showroom_cars');
    expect(show.anchors.lots!.length).toBe(3);
    const b = show.bounds;
    expect(b.x1).toBeLessThanOrEqual(113);                                            // inside the block (the pavement starts at x = 113)
    expect(roadDistance(b.x1, (b.z0 + b.z1) / 2)).toBeGreaterThan(7.5);
    // nothing else of the hub stands in it (its own walls, desk and cars aside)
    const own = new Set(h.group.getObjectByName('shop_showroom_cars')?.userData.shopColliders as Collider[]);
    const others = h.colliders.filter(c => !own.has(c) && c.h > 0.3);
    for (const c of others) expect(c.x1 <= b.x0 + 0.01 || c.x0 >= b.x1 - 0.01 || c.z1 <= b.z0 + 0.01 || c.z0 >= b.z1 - 0.01, JSON.stringify(c)).toBe(true);
    // the salesman stands at his place
    expect(h.people.some(p => Math.hypot(p.x - show.anchors.keeper.x, p.z - show.anchors.keeper.z) < 0.05)).toBe(true);
  });

  it('the dealer sells from the desk, shows the silver saloon on the first lot and delivers outside the door', async () => {
    const h = await plateau(), show = stockedShop(h.group, NDIAYE_AUTO)!, { carDealer } = await import('../src/transport/carModule');
    const site = carDealer(h)!, lot = show.anchors.lots![0], door = stockedShopFront(h.group, NDIAYE_AUTO, 0)!;
    expect(site.counter).toEqual({ x: show.anchors.counter.x, z: show.anchors.counter.z });
    expect(site.displays).toEqual([{ x: lot.x, z: lot.z, yaw: lot.yaw, seed: sedanSeed() }]);   // the one sold is the one shown
    expect(site.forSale).toBe(0);
    expect(site.card).toEqual(lot.card);
    expect(site.lots).toBe(3);
    expect(site.desk).toBeUndefined();
    // outside the door: at the kerb (4.3 m from the road's centre line), right in front of the open front
    const d = site.delivery;
    expect(inRect(show.bounds, d)).toBe(false);
    expect(roadDistance(d.x, d.z)).toBeCloseTo(4.3, 5);
    expect(Math.abs(d.z - door.z)).toBeLessThan(0.5);
    expect(d.x - door.x).toBeGreaterThan(2.5); expect(d.x - door.x).toBeLessThan(4.5);
    expect(d.yaw).toBeCloseTo(0, 5);                                                  // the traffic's way on that side
    expect(site.kerb[0].from).toBeLessThan(-6); expect(site.kerb[0].to).toBeGreaterThan(6);
    // the car check's spots: beside the counter toward the road, the pavement by the delivered car, the sign's pole
    const toRoad = Math.sign(d.x - site.counter.x);
    expect(toRoad).toBe(1);
    expect(inCols(h.colliders, { x: site.counter.x + toRoad * 0.7, z: site.counter.z + 0.4 }, 0.25)).toBe(false);
    expect(inCols(h.colliders, { x: d.x - toRoad * 2.2, z: d.z }, 0.3)).toBe(false);
    expect(inRect(show.bounds, site.sign)).toBe(false);
    // the price card shows the catalogue's price
    expect(specOf(CAR_ASSET)?.price).toBe(2800000);
    expect(fcfa(specOf(CAR_ASSET)?.price ?? 0).replace(/\s/g, ' ')).toBe('2 800 000 F');
  });

  it('the salesman hands over the keys: a short line, Wolof glossed in French', async () => {
    const { KEYS_LINE, car } = await import('../src/transport/carModule');
    expect(car.def.text.welcome).toBe(KEYS_LINE);
    const shown = glossed(KEYS_LINE, true), bare = glossed(KEYS_LINE, false);
    expect(shown).toMatch(/clés/);
    expect(shown).toMatch(/devant la porte/);
    expect(shown).toContain('Jërëjëf (merci)');
    expect(shown).toContain('Ñibbil ak jàmm (rentre bien)');
    expect(bare).not.toMatch(/\(merci\)/);
  });
});
