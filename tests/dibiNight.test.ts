import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { stubCanvas } from './hubstub';
import { GameState } from '../src/core/state';
import { newSave } from '../src/core/save';
import { Seats, type Seat } from '../src/interact/seats';
import { ActivityRunner, type ActivityServices } from '../src/activity/runner';
import type { PlaceSpec } from '../src/activity/places';
import type { GameCtx } from '../src/game/modules';
import type { Collider, HubWorld } from '../src/world/types';
import { DIBI_NIGHT_DRAWCALLS, G0, MENU, NIGHT, menuRows, stringBulbs, tvLines } from '../src/venues/dibiNight';
import { billFor } from '../src/arena/program';
import { buildSpots } from '../src/social/ambientSpots';

stubCanvas();

/** The real Pikine Dibi (« Dibiterie Chez Pathé ») on its site, with a minimal game context in node. */
async function pikineDibi(lite = false) {
  const { buildHub } = await import('../src/world/builder');
  const { buildDibi } = await import('../src/venues/dibi');
  const { VenueMaterials } = await import('../src/venues/kit');
  const hub: HubWorld = buildHub('pikine', lite);
  const site = hub.sites!.find(s => s.kind === 'dibiterie')!;
  const before = hub.colliders.length;
  const seats = new Seats(), places: PlaceSpec[] = [], extra = new THREE.Group(), camera = new THREE.PerspectiveCamera();
  let hour = 21.5, day = 3;
  const state = new GameState(newSave());
  const ctx = {
    world: () => hub, extra, seats, places: { add: (p: PlaceSpec) => places.push(p) }, state, hour: () => hour, day: () => day,
    player: { pos: { x: 0, z: 0 }, seated: () => null, place() {} }, activities: { current: null }, camera, space: () => 'street',
    toast() {}, menu() {}, hud: { closeModal() {} },
  } as unknown as GameCtx;
  const v = buildDibi({ ctx, mats: new VenueMaterials(), lite, addPeople() {} }, site);
  const d = () => v.debug() as Record<string, any>;
  const o = d().origin as { x: number; z: number }, yaw = d().yaw as number, c = Math.cos(yaw), s = Math.sin(yaw);
  /** Local (venue frame) → world. */
  const W = (x: number, z: number) => ({ x: o.x + x * c + z * s, z: o.z - x * s + z * c });
  const run = (h: number, seconds: number, cam = W(NIGHT.grill.x + 3, NIGHT.grill.z - 4)) => {
    hour = h; camera.position.set(cam.x, 4, cam.z);
    for (let t = 0; t < seconds; t += 0.1) v.update(0.1);
  };
  return { hub, site, v, d, seats, places, extra, W, run, venueCols: hub.colliders.slice(before), setDay: (n: number) => { day = n; } };
}
const inRect = (r: { x0: number; x1: number; z0: number; z1: number }, p: { x: number; z: number }, m = 0) => p.x > r.x0 + m && p.x < r.x1 - m && p.z > r.z0 + m && p.z < r.z1 - m;
const hits = (cols: readonly Collider[], p: { x: number; z: number }, m = 0) => cols.some(c => p.x > c.x0 - m && p.x < c.x1 + m && p.z > c.z0 - m && p.z < c.z1 + m);
/** Grid flood fill over the colliders from `from` (walker radius r): which of `to` can be walked to. */
function reach(cols: readonly Collider[], box: { x0: number; x1: number; z0: number; z1: number }, from: { x: number; z: number }, to: { x: number; z: number }[], r = 0.28, step = 0.1) {
  const nx = Math.ceil((box.x1 - box.x0) / step) + 1, nz = Math.ceil((box.z1 - box.z0) / step) + 1, solid = cols.filter(cc => cc.h > 0.3);
  const free = (i: number, j: number) => !hits(solid, { x: box.x0 + i * step, z: box.z0 + j * step }, r);
  const cell = (p: { x: number; z: number }) => [Math.round((p.x - box.x0) / step), Math.round((p.z - box.z0) / step)];
  const seen = new Uint8Array(nx * nz), q: number[] = [];
  const [si, sj] = cell(from); seen[si * nz + sj] = 1; q.push(si, sj);
  while (q.length) {
    const j = q.pop()!, i = q.pop()!;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= nx || b >= nz || seen[a * nz + b] || !free(a, b)) continue; seen[a * nz + b] = 1; q.push(a, b); }
  }
  return to.map(p => { const [i, j] = cell(p); for (let a = i - 3; a <= i + 3; a++) for (let b = j - 3; b <= j + 3; b++) if (a >= 0 && b >= 0 && a < nx && b < nz && seen[a * nz + b]) return true; return false; });
}

describe('the Dibi at night (src/venues/dibiNight.ts on src/venues/dibi.ts)', async () => {
  const D = await pikineDibi();
  const place = D.places.find(p => p.type === 'dibi')!;
  const night = () => D.d().night as Record<string, any>;
  const seatsNight = () => (night().seats as string[]).map(id => D.seats.get(id)!);

  it('its new seats are real seats of the lot: the TV corner on low benches, the attaya cushions under the neem', () => {
    const list = seatsNight();
    expect(list.length).toBe(3 + 2 + 2 + 3);
    expect(new Set(list.map(s => s.id)).size).toBe(list.length);
    for (const s of list) expect(inRect(D.site, s, 0.3), s.id).toBe(true);
    const tv = list.filter(s => s.id.includes(':tv-')), cushions = list.filter(s => s.id.includes(':attaya:'));
    expect(tv.every(s => s.kind === 'bench' && s.top === 0.57)).toBe(true);
    expect(cushions.map(s => s.kind)).toEqual(['floor', 'floor', 'floor']);
    expect(cushions.every(s => s.clip === 'SitFloor')).toBe(true);
    // the TV corner is part of the tables (meals sit you there too, the city's people eat there)
    expect(place.area).toBeTruthy();
    for (const s of tv) expect(Math.hypot(s.x - place.area!.x, s.z - place.area!.z)).toBeLessThanOrEqual(place.area!.r);
    // the TV corner faces the TV, the cushions face the attaya set
    const tvAt = D.W(NIGHT.tv.x, NIGHT.tv.z), set = D.W(NIGHT.attaya.x, NIGHT.attaya.z);
    const facing = (s: Seat, p: { x: number; z: number }) => (Math.sin(s.yaw) * (p.x - s.x) + Math.cos(s.yaw) * (p.z - s.z)) / Math.hypot(p.x - s.x, p.z - s.z);
    for (const s of tv.filter(x => x.id.includes(':tv-o:'))) expect(facing(s, tvAt)).toBeGreaterThan(0.9);
    for (const s of cushions) expect(facing(s, set)).toBeGreaterThan(0.6);
  });

  it('the TV corner and the attaya set stand clear of the tables, the posts and the walls, and are walked to from the entrance', () => {
    const corner = [D.W(7.3, 1.5), D.W(9.9, 4.5)], cushion = [D.W(4.9, -8.7), D.W(6.3, -7.2)];
    const rect = (a: { x: number; z: number }, b: { x: number; z: number }) => ({ x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), z0: Math.min(a.z, b.z), z1: Math.max(a.z, b.z) });
    const overl = (r: ReturnType<typeof rect>, cc: Collider) => cc.x0 < r.x1 && cc.x1 > r.x0 && cc.z0 < r.z1 && cc.z1 > r.z0;
    const tall = D.hub.colliders.filter(cc => cc.h >= 0.8);                         // tables, posts, walls, the tree
    expect(tall.filter(cc => overl(rect(corner[0], corner[1]), cc))).toEqual([]);
    expect(tall.filter(cc => overl(rect(cushion[0], cushion[1]), cc))).toEqual([]);
    const inside = D.d().inside as { x: number; z: number };
    const box = { x0: D.site.x0 - 2, x1: D.site.x1 + 2, z0: D.site.z0 - 2, z1: D.site.z1 + 2 };
    const anchor = place.anchors.find(a => a.id === 'attaya')!;
    const [toAttaya, toTv, toCounter] = reach(D.hub.colliders, box, inside, [anchor, D.W(6.9, 3.0), place.anchors.find(a => a.id === 'counter')!]);
    expect(toAttaya, 'the attaya set').toBe(true); expect(toTv, 'the TV corner').toBe(true); expect(toCounter, 'the counter').toBe(true);
    // nobody stands in a wall: the grill master, the attaya anchor
    expect(hits(D.hub.colliders.filter(cc => cc.h > 0.3), anchor, 0.2)).toBe(false);
  });

  it('a ceiling of string lights under the tin roof, over the heads', () => {
    for (const lite of [false, true]) {
      const b = stringBulbs(lite ? 1.4 : 0.9);
      expect(b.length).toBeGreaterThan(lite ? 25 : 45);
      for (const p of b) { expect(p.y).toBeGreaterThan(G0 + 2.25); expect(p.y).toBeLessThan(G0 + 2.8); expect(p.x).toBeGreaterThan(-2); expect(p.x).toBeLessThan(10.6); expect(p.z).toBeGreaterThan(-5.6); expect(p.z).toBeLessThan(9.8); }
    }
  });

  it('the menu at the counter lists what the counter sells, at its prices; the pot of attaya is ordered under the neem', () => {
    const rows = night().menu as { id: string; label: string; price: number }[];
    expect(rows.map(r => r.id)).toEqual(['dibi', 'brochettes', 'bissap', 'attaya', 'theiere']);
    const all = Object.values(place.offers).flat();
    for (const r of rows) expect(r.price).toBe(all.find(o => o.id === r.id)!.price);
    expect(rows[0]).toMatchObject({ label: 'Dibi mouton', price: 2000 });
    expect(MENU[0].note).toMatch(/oignons.*moutarde.*pain/);
    expect(all.find(o => o.id === 'dibi')!.detail).toMatch(/oignons, moutarde et pain/);
    expect(menuRows({ counter: all.filter(o => o.id !== 'bissap') }).map(r => r.id)).not.toContain('bissap');   // never a dish not sold
    // the pot: price shown, paid once, the player sits on a free cushion of the set and drinks; the evening only
    const pot = place.offers.attaya[0];
    expect(pot).toMatchObject({ id: 'theiere', price: 500 });
    D.run(21.5, 0.2); expect(pot.requires!()).toBeNull();
    const state = new GameState(newSave()); state.data.wallet = 1000;
    let seated: Seat | null = null;
    const s: ActivityServices = {
      state, seats: D.seats, space: () => 'street', player: () => place.anchors.find(a => a.id === 'attaya')!, seated: () => seated,
      sit: st => { if (!D.seats.occupy(st.id, 'player')) return false; seated = st; return true; },
      clip: () => {}, busy: () => {}, progress: () => {}, toast: () => {}, save: () => {},
    };
    const runner = new ActivityRunner(s); runner.start(pot);
    for (let t = 0; t < 12; t += 0.25) runner.update(0.25);
    expect(state.wallet).toBe(500);
    const got = seated as Seat | null;
    expect(got?.id).toMatch(/:attaya:/); expect(got?.clip).toBe('SitFloor');
    if (got) D.seats.release(got.id, 'player');
    D.run(12.5, 0.2); expect(pot.requires!()).toMatch(/le soir/);
  });

  it('by day the grill works but the coals only glow dimly; at night they glow, spark, and the brochettes are turned', () => {
    D.run(12.5, 2);
    let n = night();
    expect(n.glow).toBeLessThan(0.5); expect(n.coals).toBeLessThan(0.5); expect(n.sparks).toBe(false); expect(n.brochettes).toBe(true);
    expect(n.tv.live).toBe(false); expect(n.tv.status).toMatch(/^Ce soir 17 h/);
    const f0 = n.flips;
    D.run(21.5, 6);
    n = night();
    expect(n.glow).toBeGreaterThan(0.95); expect(n.coals).toBeGreaterThan(0.55); expect(n.sparks).toBe(true);
    expect(n.flips - f0).toBeGreaterThanOrEqual(2);                                  // the dibi master keeps turning them
    expect(n.tv.live).toBe(true);
    const bill = billFor(3);
    expect(n.tv.names).toBe(`${bill.left.name} – ${bill.right.name}`.toUpperCase());
    // far from the grill no sparks are simulated
    D.run(21.5, 0.3, D.W(60, 60)); expect(night().sparks).toBe(false);
    // after midnight the TV replays the evening's bout (the city day has turned)
    D.setDay(4); D.run(0.5, 0.3); n = night();
    expect(n.tv.status).toMatch(/Résumé/); expect(n.tv.names).toBe(`${bill.left.name} – ${bill.right.name}`.toUpperCase());
    D.setDay(3);
    // closed in the morning: cold grill, no brochettes, no sparks, the TV off
    D.run(8, 0.5); n = night();
    expect(n.coals).toBeLessThanOrEqual(0.15); expect(n.brochettes).toBe(false); expect(n.sparks).toBe(false); expect(n.tv.frame).toBe(-1);
  });

  it('the TV shows the arena\'s result only once the bout is over, never an invented one', () => {
    expect(tvLines(3, 21, false, { day: 3, text: 'Babacar bat Lamine' }).result).toBeNull();
    expect(tvLines(3, 23.5, false, { day: 3, text: 'Babacar bat Lamine' }).result).toMatch(/Babacar bat Lamine/);
    expect(tvLines(3, 23.5, false, null).result).toBeNull();
    expect(tvLines(3, 21, true, null).status).toMatch(/Résumé/);
  });

  it('within the draw-call budget: the night layer adds its board, coals, brochettes and furniture (+ the sparks at night)', () => {
    const visible = (pred: (o: THREE.Object3D) => boolean) => { let n = 0; D.extra.traverseVisible(o => { if (((o as THREE.Mesh).isMesh || (o as THREE.Points).isPoints || (o as THREE.Sprite).isSprite) && pred(o)) n++; }); return n; };
    const ours = (o: THREE.Object3D) => o.name.startsWith('dibi_');
    D.run(12.5, 0.5);
    expect(visible(ours) - 1).toBe(DIBI_NIGHT_DRAWCALLS.day);                         // − the painted menu sign it replaces
    const day = visible(() => true);
    D.run(21.5, 0.5);
    expect(visible(ours) - 1).toBe(DIBI_NIGHT_DRAWCALLS.night);
    const nightAll = visible(() => true);
    // the whole Dibi (geometry, signs, glows, smoke; its people are humanoids under the shared budget)
    expect(day).toBeLessThanOrEqual(32); expect(nightAll).toBeLessThanOrEqual(34);
  });

  it('the city\'s people sit and eat there: every table, the TV corner and the attaya cushions belong to the Dibi\'s spot', () => {
    const all = D.seats.all().filter(s => s.id.includes(':venue:dibiterie'));
    const spots = buildSpots({ places: D.places, seats: D.seats.all(), interactables: [], layout: { specials: [], sea: null }, colliders: D.hub.colliders, people: [], arena: null });
    const spot = spots.find(s => s.place === place.id)!;
    expect(spot.tags).toContain('dibi');
    const mine = new Set(spot.seats);
    const missing = all.filter(s => !mine.has(s.id)).map(s => s.id);
    expect(missing).toEqual([]);
  });
});
