import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { stubCanvas } from './hubstub';
import { drawSite, testKit } from './helpers/siteCost';
import { E, LIFE_CAP, PALETTES, STOREY, TRI_CAP, siteDraw, sizeOf, type GateSide, type PlanPerson, type Site, type SiteLife, type SiteDraw, type SiteResult, type Variant } from '../src/world/almadies/contract';
import { SITES } from '../src/world/almadies/plan';
import { lifeInHub, variantOf, variantsFor } from '../src/world/almadies/district';
import { VARIANTS } from '../src/world/almadies/hotels';
import { gateX } from '../src/world/almadies/parts';
import { info } from '../src/world/almadies/hotels.kit';
import { colliderInPlan } from './helpers/designChecks';
import type { Collider } from '../src/world/types';

/**
 * LD2.0-E lane E-H: the three hotels (src/world/almadies/hotels.ts) as designs: where the plan puts them, what each says about itself (the name board, a lobby
 * on the street face, a balcony on every room with a rhythm, the service end on the gate's side), how each is part of the street (a see-through railing, an
 * open walk-in from the pavement to the lobby's door, a café terrace on the pavement side, awnings on the tower's shopfronts, the road-side flanks planted),
 * and that each stays in its site, in its budget (`TRI_CAP`) and lighter on the low preset at 4, 5, 8 and 9 storeys in every facing, mirror and gate.
 */
stubCanvas();
const hotels = SITES.filter(s => s.kind === 'hotel');
const within = (c: Collider, r: { x0: number; x1: number; z0: number; z1: number }, m = 0.02) => c.x0 >= r.x0 - m && c.x1 <= r.x1 + m && c.z0 >= r.z0 - m && c.z1 <= r.z1 + m;
/**
 * Can a body's circle (`r`, the district check's 0.45 m) walk from a plan point to another against the colliders? A flood fill on a 0.2 m grid of the plan, from
 * the pavement (z > E) to a door, over the forecourt and through whatever the railing leaves open.
 */
function canWalk(d: SiteDraw, cs: Collider[], from: { x: number; z: number }, to: { x: number; z: number }, r = 0.45): boolean {
  const step = 0.2, x0 = -d.w / 2, x1 = d.w / 2, z0 = Math.min(from.z, to.z) - 3, z1 = Math.max(from.z, to.z) + 1.5, nx = Math.ceil((x1 - x0) / step), nz = Math.ceil((z1 - z0) / step);
  const near = cs.filter(c => c.y0 === undefined || c.y0 < 1.5);
  const blocked = (i: number, j: number) => {
    const q = d.f.p(x0 + (i + 0.5) * step, z0 + (j + 0.5) * step);
    return near.some(c => Math.hypot(Math.max(c.x0 - q.x, 0, q.x - c.x1), Math.max(c.z0 - q.z, 0, q.z - c.z1)) < r);
  };
  const cell = (p: { x: number; z: number }) => [Math.floor((p.x - x0) / step), Math.floor((p.z - z0) / step)] as const;
  const [si, sj] = cell(from), [ti, tj] = cell(to), seen = new Uint8Array(nx * nz), stack = [[si, sj]];
  if (blocked(si, sj) || blocked(ti, tj)) return false;
  seen[sj * nx + si] = 1;
  while (stack.length) {
    const [i, j] = stack.pop()!;
    if (i === ti && j === tj) return true;
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + a, nj = j + b;
      if (ni < 0 || nj < 0 || ni >= nx || nj >= nz || seen[nj * nx + ni]) continue;
      seen[nj * nx + ni] = 1;
      if (!blocked(ni, nj)) stack.push([ni, nj]);
    }
  }
  return false;
}
/**
 * Where can a body's circle (`r`) walk to from a plan point? The same flood fill on a 0.2 m grid; the answer says whether a plan point is within `reach` of a cell the body reached
 * (a seat is taken from 1.3 m, a person is spoken to from about 1.6).
 */
function reachFrom(d: SiteDraw, cs: Collider[], from: { x: number; z: number }, r = 0.45) {
  const step = 0.2, x0 = -d.w / 2, x1 = d.w / 2, z0 = -(d.depth - E) - 1, z1 = E + 3, nx = Math.ceil((x1 - x0) / step), nz = Math.ceil((z1 - z0) / step);
  const near = cs.filter(c => c.y0 === undefined || c.y0 < 1.5);
  const blocked = (i: number, j: number) => { const q = d.f.p(x0 + (i + 0.5) * step, z0 + (j + 0.5) * step); return near.some(c => Math.hypot(Math.max(c.x0 - q.x, 0, q.x - c.x1), Math.max(c.z0 - q.z, 0, q.z - c.z1)) < r); };
  const seen = new Uint8Array(nx * nz), si = Math.floor((from.x - x0) / step), sj = Math.floor((from.z - z0) / step), stack = [[si, sj]];
  seen[sj * nx + si] = 1;
  while (stack.length) {
    const [i, j] = stack.pop()!;
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ni = i + a, nj = j + b; if (ni < 0 || nj < 0 || ni >= nx || nj >= nz || seen[nj * nx + ni] || blocked(ni, nj)) continue; seen[nj * nx + ni] = 1; stack.push([ni, nj]); }
  }
  return (p: { x: number; z: number }, reach: number) => {
    for (let j = Math.max(0, Math.floor((p.z - reach - z0) / step)); j <= Math.min(nz - 1, Math.ceil((p.z + reach - z0) / step)); j++) for (let i = Math.max(0, Math.floor((p.x - reach - x0) / step)); i <= Math.min(nx - 1, Math.ceil((p.x + reach - x0) / step)); i++)
      if (seen[j * nx + i] && Math.hypot(x0 + (i + 0.5) * step - p.x, z0 + (j + 0.5) * step - p.z) <= reach) return true;
    return false;
  };
}
/** A site drawn with its builder's own result (the life, the rooftop door). */
function drawLife(site: Site, v: Variant, lite = false) { const t = testKit(lite), d = siteDraw(t.kit, site), r: SiteResult = v.build(d) ?? {}; return { t, d, r, life: r.life as Required<SiteLife>, i: info(d) }; }
const fwd = (yaw: number) => [Math.sin(yaw), Math.cos(yaw)] as const;
const inside = (c: Collider, x: number, z: number, m = 0) => x > c.x0 - m && x < c.x1 + m && z > c.z0 - m && z < c.z1 + m;
/** The storeys each design draws (it clamps what the plan asks for). */
const RANGE: Record<string, [number, number]> = { 'hotel-boutique': [3, 5], 'hotel-tower': [4, 9], 'hotel-resort': [3, 5] };
const effective = (id: string, n: number) => Math.max(RANGE[id][0], Math.min(RANGE[id][1], n));
const variant = (s: Site) => variantOf(s);
const setups: { id: string; plan: Site }[] = hotels.map(plan => ({ id: variantOf(plan).id, plan }));
/** What each batch drew, as boxes in the hub (the palms' fronds are allowed to lean out a little over the wall). */
function extents(r: ReturnType<typeof drawSite>) {
  const out: Record<string, { min: THREE.Vector3; max: THREE.Vector3 }> = {};
  for (const [k, b] of Object.entries(r.kit.batches)) {
    const m = b.build(new THREE.MeshBasicMaterial()); if (!m) continue;
    m.geometry.computeBoundingBox(); out[k] = { min: m.geometry.boundingBox!.min.clone(), max: m.geometry.boundingBox!.max.clone() };
  }
  return out;
}
const make = (plan: Site, o: Partial<Site> = {}): Site => ({ ...plan, ...o });

describe('the hotels in the registry and the plan', () => {
  it('exports two M designs (the boutique, then the tower) and one L design (the resort), as the plan asks', () => {
    expect(variantsFor('hotel', 'M').map(v => v.id)).toEqual(['hotel-boutique', 'hotel-tower']);
    expect(variantsFor('hotel', 'L').map(v => v.id)).toEqual(['hotel-resort']);
    expect(VARIANTS.map(v => v.size)).toEqual(['M', 'M', 'L']);
    for (const v of VARIANTS) expect(typeof v.build).toBe('function');
  });
  it('puts the boutique on the sea front (Le Filao), the tower on the mall\'s road (Océane) and the resort on the corner block (Baobab Azur)', () => {
    expect(hotels).toHaveLength(3);
    const byName = Object.fromEntries(hotels.map(s => [s.name!, variantOf(s).id]));
    expect(byName).toEqual({ 'HÔTEL LE FILAO': 'hotel-boutique', 'HÔTEL OCÉANE': 'hotel-tower', 'HÔTEL BAOBAB AZUR': 'hotel-resort' });
    for (const s of hotels) expect(variant(s).size).toBe(sizeOf(s));
  });
});

for (const { id, plan } of setups) describe(`${id} on ${plan.name}`, () => {
  it('stays inside its site, is solid up to its height, in its budget and lighter on the low preset (4, 5, 8 and 9 storeys; every facing, mirror and gate)', () => {
    const v = variant(plan), cap = TRI_CAP.hotel[v.size]!;
    // the plan's own facing, mirrored or not (the sites' edges on a road are the plan's); and the other facing at the plan's own storeys (as the district's test turns every design)
    const orient = (storeys: number) => (storeys === plan.storeys ? [[plan.facing, false], [plan.facing, true], [plan.facing === 'north' ? 'south' : 'north', false], [plan.facing === 'north' ? 'south' : 'north', true]] : [[plan.facing, false], [plan.facing, true]]) as ['north' | 'south', boolean][];
    for (const storeys of [4, 5, 8, 9]) for (const gate of ['left', 'centre', 'right'] as GateSide[]) for (const [facing, mirror] of orient(storeys)) {
      const s = make(plan, { storeys, gate, facing, mirror }), n = effective(id, storeys), r = drawSite(s, v), lite = drawSite(s, v, true);
      expect(r.colliders.length).toBeGreaterThan(5);
      for (const c of r.colliders) expect(within(c, s.rect), `${storeys} storeys ${gate} ${facing} ${mirror}: ${JSON.stringify(c)}`).toBe(true);
      expect(Math.max(...r.colliders.map(c => c.h)), 'the tallest solid').toBeGreaterThanOrEqual(n * STOREY * 0.95);
      expect(r.tris, `${storeys} storeys: ${r.tris} triangles`).toBeLessThanOrEqual(cap);
      expect(lite.tris, `lite ${lite.tris} / ${r.tris}`).toBeLessThanOrEqual(r.tris * 0.9);
      expect(r.signs.length).toBeLessThanOrEqual(1);
      expect(r.group).toBeUndefined();                                                    // no mesh of its own: the hub's batches only
      for (const [k, e] of Object.entries(extents(r))) {                                   // nothing is drawn outside the site (a frond may lean over the wall)
        const m = k === 'leaves' ? 2.2 : 0.2;                // (the district's own wall coping and gate pillars' caps stand 6 and 16 cm over its edge)
        expect(e.min.x, `${k} west`).toBeGreaterThanOrEqual(s.rect.x0 - m); expect(e.max.x, `${k} east`).toBeLessThanOrEqual(s.rect.x1 + m);
        expect(e.min.z, `${k} north`).toBeGreaterThanOrEqual(s.rect.z0 - m); expect(e.max.z, `${k} south`).toBeLessThanOrEqual(s.rect.z1 + m);
      }
      for (const c of r.canopies) expect(c.x > s.rect.x0 - 3 && c.x < s.rect.x1 + 3 && c.z > s.rect.z0 - 3 && c.z < s.rect.z1 + 3).toBe(true);
    }
  });
  it('draws the same thing every time (no random number)', () => {
    const v = variant(plan), s = make(plan, { storeys: 6 }), a = drawSite(s, v), b = drawSite(s, v);
    expect(b.tris).toBe(a.tris); expect(b.colliders).toEqual(a.colliders); expect(b.signs).toEqual(a.signs);
  });
  it('carries the site\'s name on ONE lit board facing the street, high on the building, at the position it says', () => {
    const v = variant(plan);
    for (const storeys of [4, 5, 8]) for (const [facing, mirror] of [['south', false], ['north', true], ['north', false]] as const) {
      const s = make(plan, { storeys, facing, mirror }), r = drawSite(s, v), i = info(r.draw);
      expect(r.signs).toHaveLength(1);
      const sg = r.signs[0], q = r.draw.f.p(i.board!.x, i.board!.z);
      expect(sg.text).toBe(plan.name);
      expect(sg.yaw).toBeCloseTo(r.draw.f.rot(0), 6);                                      // its face looks where the plan's street is
      expect(sg.x).toBeCloseTo(q.x, 4); expect(sg.z).toBeCloseTo(q.z, 4); expect(sg.y).toBeCloseTo(i.board!.y, 4);
      expect(sg.x > s.rect.x0 && sg.x < s.rect.x1 && sg.z > s.rect.z0 && sg.z < s.rect.z1).toBe(true);
      expect(sg.y).toBeGreaterThan(4);
      expect(sg.w).toBeGreaterThanOrEqual(6);
    }
  });
  it('has a lobby on the street face and a drop-off kept open (the lane, and the pavement before it)', () => {
    const v = variant(plan);
    for (const [facing, mirror] of [['south', false], ['north', true]] as const) {
      const s = make(plan, { facing, mirror }), r = drawSite(s, v), i = info(r.draw), f = r.draw.f;
      const lobby = i.doors.find(x => x.kind === 'lobby')!;
      expect(lobby).toBeDefined(); expect(lobby.face).toBe('street'); expect(Math.abs(lobby.x)).toBeLessThan(2);
      const keep = r.keepClear.find(k => k.why.startsWith('hotel_dropoff'))!;
      expect(keep).toBeDefined();
      expect(within({ ...keep, h: 1 }, { x0: s.rect.x0, x1: s.rect.x1, z0: s.rect.z0 - 3.3, z1: s.rect.z1 + 3.3 }), 'the drop-off and the pavement before it').toBe(true);   // (it runs on to the pavement, as the gate\'s apron does)
      const lane = i.dropoff!, a = f.p(lane.x0, lane.z0), b = f.p(lane.x1, lane.z1);
      expect(Math.min(a.x, b.x)).toBeGreaterThanOrEqual(keep.x0 - 0.01); expect(Math.max(a.x, b.x)).toBeLessThanOrEqual(keep.x1 + 0.01);
      expect(Math.min(a.z, b.z)).toBeGreaterThanOrEqual(keep.z0 - 0.01); expect(Math.max(a.z, b.z)).toBeLessThanOrEqual(keep.z1 + 0.01);
    }
  });
  it('is open to the street: a see-through railing and an opening 6 to 8 m wide, a body can walk from the pavement through it to the lobby\'s door and the café\'s terrace; the service gate stays shut', () => {
    const v = variant(plan);
    for (const gate of ['left', 'centre', 'right'] as GateSide[]) for (const [facing, mirror] of [['south', false], ['north', true], ['north', false]] as const) {
      const s = make(plan, { gate, facing, mirror }), r = drawSite(s, v), i = info(r.draw), d = r.draw, lobby = i.doors.find(x => x.kind === 'lobby')!, entry = i.entry!;
      expect(entry.w).toBeGreaterThanOrEqual(6); expect(entry.w).toBeLessThanOrEqual(8);
      const cs = r.colliders.map(c => colliderInPlan(d, c)), street = cs.filter(c => c.z > E - 0.5 && c.d < 0.5);
      expect(street.length, 'the street railing').toBeGreaterThan(0);
      for (const c of street) expect(c.h <= 1.6 || c.h === 2.3, `a railing's height or the gate's, not a wall's: ${JSON.stringify(c)}`).toBe(true);
      expect(street.filter(c => c.h === 2.3), 'the gate, shut, solid').toHaveLength(1);
      expect(street.some(c => Math.abs(c.x - entry.x) < entry.w / 2 - 0.1 + c.w / 2 && c.x - c.w / 2 < entry.x + entry.w / 2 - 0.1 && c.x + c.w / 2 > entry.x - entry.w / 2 + 0.1), 'nothing across the opening').toBe(false);
      const from = { x: entry.x, z: E + 2 }, door = { x: lobby.x, z: lobby.z + 0.8 };
      expect(canWalk(d, r.colliders, from, door), 'from the pavement to the lobby\'s door').toBe(true);
      const reach = reachFrom(d, r.colliders, from), t = i.terraces[0];
      expect(t.seats.every(q => reach(q, 1.3)), 'from the pavement to the terrace\'s every seat').toBe(true);
      // and the test has teeth: a wall across the opening, or a car gate shut in front of the door, stops the same walk
      const q0 = d.f.p(entry.x - entry.w / 2, E - 0.3), q1 = d.f.p(entry.x + entry.w / 2, E - 0.05), wall: Collider = { x0: Math.min(q0.x, q1.x), x1: Math.max(q0.x, q1.x), z0: Math.min(q0.z, q1.z), z1: Math.max(q0.z, q1.z), h: 1.5 };
      expect(canWalk(d, [...r.colliders, wall], from, door), 'with the opening shut').toBe(false);
    }
  });
  it('has a café terrace on the street side, beside the way in and away from the service gate: tables with chairs, parasols, strings of lights', () => {
    const v = variant(plan);
    for (const [facing, mirror, gate] of [['south', false, 'right'], ['north', true, 'left']] as const) {
      const s = make(plan, { facing, mirror, gate }), r = drawSite(s, v), i = info(r.draw), t = i.terraces[0], entry = i.entry!;
      expect(i.terraces.length).toBeGreaterThanOrEqual(1);
      expect(t.tables).toBeGreaterThanOrEqual(5); expect(t.chairs).toBe(2 * t.tables); expect(t.parasols).toBeGreaterThanOrEqual(2);
      expect(t.z1, 'on the pavement side, behind the railing').toBeGreaterThan(E - 1.6); expect(t.z1).toBeLessThanOrEqual(E);
      expect(Math.min(Math.abs(t.x0), Math.abs(t.x1)), 'beside the opening, not across it').toBeGreaterThanOrEqual(entry.w / 2);
      expect(Math.sign(t.x0 + t.x1), 'on the other side from the service gate').toBe(-i.serviceSide);
      expect(r.draw.bulbs.count, 'its lights').toBeGreaterThan(20);
    }
  });
  it('turns a considered ground floor to the road on its flanks: planting on both sides', () => {
    const s = make(plan), r = drawSite(s, variant(plan)), i = info(r.draw), cs = r.colliders.map(c => colliderInPlan(r.draw, c));
    expect(new Set(i.flanks.map(f => f.side))).toEqual(new Set([-1, 1]));
    // the road-side edges of the real site are railings (a body sees the lawn and the glass through them), the neighbours\' side a wall
    const road = new Set<string>(); const sideWalls = cs.filter(c => c.w < 0.5 && c.d > 4);
    for (const c of sideWalls) if (c.h <= 1.6) road.add(c.x < 0 ? 'left' : 'right');
    expect([...road].sort()).toEqual(['left', 'right']);
  });
  it('lights its windows by night through the district\'s panes and keeps its guards dark: both glass batches are used, the lit ones are the larger part of the windows', () => {
    const r = drawSite(plan, variant(plan)), lit = r.kit.batches.glass.triangles(), dark = r.kit.batches.glassDark.triangles();
    expect(lit).toBeGreaterThan(20); expect(dark).toBeGreaterThan(10);
    expect(lit / (lit + dark), 'the glow\'s share of the glass').toBeGreaterThan(0.3);
  });
  if (id === 'hotel-tower') it('has shopfronts at street level on the podium: an awning in the accent colour over each of six bays either side of the lobby, two shop doors, the lobby open', () => {
    for (const [facing, mirror] of [['north', false], ['north', true]] as const) {
      const s = make(plan, { facing, mirror }), r = drawSite(s, variant(plan)), i = info(r.draw), accent = PALETTES[plan.palette].accent, lobby = i.doors.find(x => x.kind === 'lobby')!;
      expect(i.awnings).toHaveLength(6);
      for (const a of i.awnings) { expect(a.col).toBe(accent); expect(a.z).toBe(lobby.z); expect(Math.min(Math.abs(a.x0), Math.abs(a.x1)), 'clear of the lobby\'s bay').toBeGreaterThanOrEqual(i.entry!.w / 2); expect(a.x1 - a.x0).toBeGreaterThan(3); }
      expect(new Set(i.awnings.map(a => Math.sign(a.x0 + a.x1)))).toEqual(new Set([-1, 1]));
      expect(i.doors.filter(x => x.kind === 'shop')).toHaveLength(2);
    }
  });
  // ------------------------------------------------------------------------------------------------ life at the ground floor (LD2.0-E round 3)
  const orients = [['south', false], ['north', true], ['north', false]] as const;
  it('puts out its seats and its people (SiteResult.life): every terrace chair is a seat, at least three people, within LIFE_CAP, none dropped on the way to the hub', () => {
    const cap = LIFE_CAP.hotel;
    for (const gate of ['left', 'centre', 'right'] as GateSide[]) for (const [facing, mirror] of orients) {
      const s = make(plan, { gate, facing, mirror }), { d, life, i } = drawLife(s, variant(plan)), chairs = i.terraces.reduce((n, t) => n + t.chairs, 0);
      expect(life, 'the builder hands a life').toBeDefined();
      expect(life.seats.length, 'the terrace\'s chairs and the benches').toBeGreaterThanOrEqual(chairs + 2);
      expect(life.seats.filter(x => x.kind === 'chair')).toHaveLength(chairs);
      expect(life.people.length).toBeGreaterThanOrEqual(3); expect(life.people.length).toBeLessThanOrEqual(cap.people); expect(life.seats.length).toBeLessThanOrEqual(cap.seats);
      const h = lifeInHub(d, life);
      expect(h.seats).toHaveLength(life.seats.length); expect(h.people).toHaveLength(life.people.length);
      expect(new Set(h.seats.map(x => x.id)).size, 'distinct seat ids').toBe(h.seats.length);
    }
  });
  it('keeps every seat and every person inside the site\'s rectangle and out of every collider of the design, and a seated person on a seat', () => {
    for (const gate of ['left', 'right'] as GateSide[]) for (const [facing, mirror] of orients) {
      const s = make(plan, { gate, facing, mirror }), { d, life } = drawLife(s, variant(plan)), h = lifeInHub(d, life), cs = d.colliders.filter(c => c.y0 === undefined || c.y0 < 1.5);
      for (const q of [...h.seats, ...h.people]) {
        const onBench = 'kind' in q ? q.kind === 'bench' : h.seats.some(x => x.kind === 'bench' && Math.hypot(x.x - q.x, x.z - q.z) < 0.01);
        expect(q.x > s.rect.x0 + 0.3 && q.x < s.rect.x1 - 0.3 && q.z > s.rect.z0 + 0.3 && q.z < s.rect.z1 - 0.3, `${JSON.stringify(q)} in the site`).toBe(true);
        if (!onBench) expect(cs.some(c => inside(c, q.x, q.z, 0.05)), `${JSON.stringify(q)} not inside a collider`).toBe(false);          // (a bench is its own thin collider: its seat is on it)
      }
      for (const q of h.people.filter(x => x.clip === 'Sit')) expect(h.seats.some(x => Math.hypot(x.x - q.x, x.z - q.z) < 0.01 && Math.abs(x.yaw - q.yaw) < 1e-6), 'a sitter is on a seat, facing as it does').toBe(true);
      expect(new Set(h.seats.map(x => `${x.x.toFixed(2)},${x.z.toFixed(2)}`)).size, 'no two seats on the same spot').toBe(h.seats.length);
      for (const a of h.people) for (const b of h.people) if (a !== b) expect(Math.hypot(a.x - b.x, a.z - b.z), 'people do not stand on each other').toBeGreaterThan(0.5);
    }
  });
  it('turns every seat toward its table, at the chair\'s height, the table\'s at a table\'s: in the plan and in the hub, in every facing and mirror', () => {
    for (const [facing, mirror] of orients) {
      const s = make(plan, { facing, mirror }), { d, life } = drawLife(s, variant(plan)), h = lifeInHub(d, life);
      const tabled = life.seats.filter(x => x.table);
      expect(tabled.length).toBe(life.seats.filter(x => x.kind === 'chair').length);
      for (const [k, q] of life.seats.entries()) {
        if (q.table) {
          const to = [q.table.x - q.x, q.table.z - q.z], l = Math.hypot(to[0], to[1]), f = fwd(q.yaw);
          expect((to[0] * f[0] + to[1] * f[1]) / l, 'the plan: facing its table').toBeGreaterThan(0.99);
          expect(l, 'the table 0.72 m away').toBeCloseTo(0.72, 5);
          expect(q.top).toBeCloseTo(0.49, 5); expect(q.table.y).toBeCloseTo(0.9, 5);                                // the ground 0.1 + the deck 0.03 + the chair 0.36; + the table 0.77
          const hq = h.seats[k], ht = hq.table!, hf = fwd(hq.yaw), hl = Math.hypot(ht.x - hq.x, ht.z - hq.z);
          expect(((ht.x - hq.x) * hf[0] + (ht.z - hq.z) * hf[1]) / hl, 'the hub: facing its table').toBeGreaterThan(0.99);
        } else expect(q.kind).toBe('bench');
        if (q.kind === 'bench') expect(q.top).toBeCloseTo(0.57, 5);
      }
      // the tables are solid where they stand: one collider over each, the chairs are not (a body brushes past them)
      for (const t of new Set(tabled.map(x => `${x.table!.x},${x.table!.z}`))) { const [tx, tz] = t.split(',').map(Number), q = d.f.p(tx, tz); expect(d.colliders.some(c => inside(c, q.x, q.z)), 'a table is solid').toBe(true); }
    }
  });
  it('lets a body (r 0.45) walk from the pavement through the opening to every seat (within its reach, 1.3 m) and every person\'s post (within 1.6 m), on every gate side and orientation', () => {
    for (const gate of ['left', 'centre', 'right'] as GateSide[]) for (const [facing, mirror] of orients) {
      const s = make(plan, { gate, facing, mirror }), { d, life, i, r } = drawLife(s, variant(plan)), reach = reachFrom(d, d.colliders, { x: i.entry!.x, z: E + 2 });
      for (const q of life.seats) expect(reach(q, 1.3), `${gate} ${facing} ${mirror}: seat ${q.kind} at ${q.x.toFixed(1)}, ${q.z.toFixed(1)}`).toBe(true);
      for (const q of life.people) expect(reach(q, 1.6), `${gate} ${facing} ${mirror}: ${q.clip} at ${q.x.toFixed(1)}, ${q.z.toFixed(1)}`).toBe(true);
      const lobby = i.doors.find(x => x.kind === 'lobby')!, staff = i.doors.find(x => x.kind === 'staff');
      expect(reach({ x: lobby.x, z: lobby.z + 0.8 }, 0.35), 'the lobby\'s door').toBe(true);
      if (staff) expect(reach({ x: staff.x, z: staff.z + 0.6 }, 0.7), 'the staff door').toBe(true);
      if (r.rooftopDoor) expect(reach(r.rooftopDoor, 0.7), 'the rooftop restaurant\'s door').toBe(true);
    }
  });
  it('stations its lobby staff at the door, facing the street: a doorman and a bellhop with a trolley of bags either side of the way, a valet by the lane and never in it', () => {
    for (const gate of ['left', 'right'] as GateSide[]) for (const [facing, mirror] of orients) {
      const s = make(plan, { gate, facing, mirror }), { life, i } = drawLife(s, variant(plan)), lobby = i.doors.find(x => x.kind === 'lobby')!, lane = i.dropoff!;
      const front = life.people.filter(q => q.clip === 'Idle' && Math.abs(q.yaw) < 1e-6 && Math.abs(q.x - lobby.x) < 3.4 && q.z - lobby.z > 0.4 && q.z - lobby.z < 2.4);
      expect(front.length, 'two people at the door facing the street').toBeGreaterThanOrEqual(2);
      expect(front.map(q => Math.sign(q.x)).sort(), 'one either side of the walk').toEqual([-1, 1]);
      for (const q of front) expect(Math.abs(q.x - lobby.x), 'clear of the walk to the door').toBeGreaterThan(1.5);
      const trolley = i.props.find(q => q.kind === 'trolley')!;
      expect(trolley, 'the bellhop\'s trolley').toBeDefined(); expect(Math.hypot(trolley.x - front.find(q => q.x > 0)!.x, trolley.z - front.find(q => q.x > 0)!.z)).toBeLessThan(2.4);
      expect(trolley.x * Math.sign(front.find(q => q.x > 0)!.x)).toBeGreaterThan(0);
      const valet = life.people.find(q => q.clip === 'Idle' && Math.abs(Math.abs(q.yaw) - Math.PI / 2) < 1e-6 && q.z > lane.z0 - 1)!;
      expect(valet, 'a valet turned to the lane').toBeDefined();
      expect(valet.x > lane.x1 + 0.3 || valet.x < lane.x0 - 0.3, 'outside the lane').toBe(true);
      expect(Math.sign(Math.sin(valet.yaw)), 'turned toward it').toBe(-Math.sign(valet.x));
      expect(valet.x * i.serviceSide, 'on the gate\'s side').toBeGreaterThan(0);
      for (const q of life.people) expect(q.x >= lane.x0 - 0.3 && q.x <= lane.x1 + 0.3 && q.z >= lane.z0 - 0.3 && q.z <= lane.z1 + 0.3, 'nobody stands in the drop-off lane').toBe(false);
    }
  });
  it('parks a car beside the drop-off lane and scooters by the service side: solid, never across the lane, the way to the door or the staff door', () => {
    for (const gate of ['left', 'right'] as GateSide[]) for (const [facing, mirror] of orients) {
      const s = make(plan, { gate, facing, mirror }), { d, i } = drawLife(s, variant(plan)), lane = i.dropoff!, lobby = i.doors.find(x => x.kind === 'lobby')!;
      const cars = i.props.filter(q => q.kind === 'car'), scooters = i.props.filter(q => q.kind === 'scooter');
      expect(cars).toHaveLength(1); expect(scooters.length).toBeGreaterThanOrEqual(2);
      const solid = (q: { x: number; z: number }) => d.colliders.map(c => colliderInPlan(d, c)).find(c => Math.abs(c.x - q.x) < 0.05 && Math.abs(c.z - q.z) < 0.05)!;
      for (const q of [...cars, ...scooters]) {
        const c = solid(q); expect(c, `a collider under the ${i.props.indexOf(q)}th prop`).toBeDefined();
        expect(c.x + c.w / 2 < lane.x0 - 0.3 || c.x - c.w / 2 > lane.x1 + 0.3 || c.z + c.d / 2 < lane.z0 - 0.3 || c.z - c.d / 2 > lane.z1 + 0.3, 'clear of the lane').toBe(true);
        expect(Math.abs(c.x - lobby.x) - c.w / 2, 'clear of the walk to the door').toBeGreaterThan(1.2);
        expect(q.x * i.serviceSide, 'on the gate\'s side').toBeGreaterThan(0);
        expect(c.x - c.w / 2).toBeGreaterThan(-d.w / 2); expect(c.x + c.w / 2).toBeLessThan(d.w / 2);
      }
      const car = solid(cars[0]); expect(Math.max(car.w, car.d)).toBeGreaterThan(4); expect(Math.min(car.w, car.d)).toBeGreaterThan(1.7);
      for (const q of scooters) { const c = solid(q); expect(Math.max(c.w, c.d)).toBeCloseTo(1.9, 5); expect(Math.min(c.w, c.d)).toBeCloseTo(0.6, 5); }
    }
  });
  it('is deterministic, and its life and its props are the same on the low preset (only the details thin out)', () => {
    const v = variant(plan), a = drawLife(plan, v), b = drawLife(plan, v), l = drawLife(plan, v, true);
    expect(JSON.stringify(b.life)).toBe(JSON.stringify(a.life)); expect(JSON.stringify(b.i.props)).toBe(JSON.stringify(a.i.props));
    expect(l.life.seats).toHaveLength(a.life.seats.length); expect(l.life.people).toEqual(a.life.people);
    expect(l.i.props).toEqual(a.i.props);
  });
  if (id === 'hotel-boutique') it('puts a doorman at the rooftop restaurant\'s stair door (the venue draws the door, the hotel stations the person), facing the street, off the walk', () => {
    for (const gate of ['left', 'right'] as GateSide[]) for (const [facing, mirror] of orients) {
      const s = make(plan, { gate, facing, mirror }), { life, r } = drawLife(s, variant(plan)), door = r.rooftopDoor!;
      const q = life.people.find(x => Math.hypot(x.x - door.x, x.z - door.z) < 1.6 && x.z > door.z - 0.5)!;
      expect(q, 'someone at the door').toBeDefined(); expect(q.clip).toBe('Idle'); expect(Math.abs(q.yaw)).toBeLessThan(1e-6);
      expect(Math.abs(q.x - door.x), 'beside the door, not in front of it').toBeGreaterThan(0.6); expect(Math.sign(q.x - door.x) * Math.sign(door.x)).toBe(1);
    }
  });
  if (id === 'hotel-tower') it('keeps a shopkeeper at each of the two shop doors, facing the street, and a menu board at the café bay (the terrace\'s side), scooters along the kerb and a bench of two seats on the forecourt', () => {
    for (const gate of ['left', 'right'] as GateSide[]) for (const [facing, mirror] of orients) {
      const s = make(plan, { gate, facing, mirror }), { life, i } = drawLife(s, variant(plan)), shops = i.doors.filter(x => x.kind === 'shop');
      expect(shops).toHaveLength(2);
      for (const dr of shops) { const k = life.people.filter(q => Math.abs(q.x - dr.x) < 0.9 && q.z - dr.z > 0.4 && q.z - dr.z < 1.6 && Math.abs(q.yaw) < 1e-6 && q.clip === 'Idle'); expect(k, `a keeper at the shop door ${dr.x}`).toHaveLength(1); }
      const menu = i.props.find(q => q.kind === 'menu')!, t = i.terraces[0];
      expect(Math.sign(menu.x), 'at the café bay, the terrace\'s side').toBe(Math.sign(t.x0 + t.x1));
      expect(Math.min(...shops.map(dr => Math.hypot(dr.x - menu.x, dr.z - menu.z)))).toBeLessThan(2.4);
      const sc = i.props.filter(q => q.kind === 'scooter'); expect(sc.length).toBeGreaterThanOrEqual(2); for (const q of sc) expect(q.z, 'on the kerb side').toBeGreaterThan(9);
      const bn = life.seats.filter(q => q.kind === 'bench'); expect(bn).toHaveLength(2); for (const q of bn) { expect(q.yaw).toBeCloseTo(0, 6); expect(q.z).toBeGreaterThan(6.7); }
    }
  });
  if (id === 'hotel-resort') it('has benches on both flank lawns, facing the road, and someone sitting on one; a guard at the service gate', () => {
    for (const [facing, mirror] of orients) {
      const s = make(plan, { facing, mirror }), { d, life, i } = drawLife(s, variant(plan)), bn = life.seats.filter(q => q.kind === 'bench');
      expect(bn.length).toBeGreaterThanOrEqual(2);
      for (const side of [-1, 1]) { const b = bn.filter(q => Math.sign(q.x) === side); expect(b.length, `a bench on the ${side} flank`).toBeGreaterThanOrEqual(1); for (const q of b) { expect(Math.abs(q.x)).toBeGreaterThan(21.5); expect(Math.sign(Math.sin(q.yaw)), 'facing the road').toBe(side); } }
      expect(life.people.some(q => q.clip === 'Sit' && bn.some(b => Math.hypot(b.x - q.x, b.z - q.z) < 0.01)), 'someone on a bench').toBe(true);
      const sit = life.people.find(q => q.clip === 'Sit' && bn.some(b => Math.hypot(b.x - q.x, b.z - q.z) < 0.01)) as PlanPerson; expect(sit.y).toBeCloseTo(-0.01, 5);
      const gate = i.serviceSide * (d.w / 2 - 3.4), guard = life.people.find(q => q.clip === 'Idle' && q.z > 9.5 && Math.abs(q.x - gate) < 3.6)!;
      expect(guard, 'a guard by the gate').toBeDefined(); expect(Math.abs(guard.yaw)).toBeLessThan(1e-6);
    }
  });
  it('keeps its service end and its service door on the gate\'s side, and the gate stands shut on the street edge', () => {
    const v = variant(plan);
    for (const gate of ['left', 'right'] as const) for (const [facing, mirror] of [['south', false], ['north', true]] as const) {
      const s = make(plan, { gate, facing, mirror }), r = drawSite(s, v), i = info(r.draw), gx = gateX(r.draw.w, gate), q = r.draw.f.p(gx, E - 0.2);
      expect(i.serviceSide).toBe(gx < 0 ? -1 : 1);
      for (const dr of i.doors.filter(x => x.kind === 'service' || x.kind === 'staff')) expect(dr.x * i.serviceSide, `${dr.kind} door at ${dr.x}`).toBeGreaterThan(0);
      expect(r.colliders.some(c => c.h >= 2.2 && q.x > c.x0 && q.x < c.x1 && q.z > c.z0 && q.z < c.z1)).toBe(true);
    }
  });
  it('gives rooms their balconies, floor after floor, on a rhythm', () => {
    const v = variant(plan);
    for (const storeys of [4, 5, 8]) {
      const s = make(plan, { storeys }), r = drawSite(s, v), i = info(r.draw), n = effective(id, storeys);
      if (id === 'hotel-boutique') {
        for (let k = 1; k < n; k++) {
          const row = i.balconies.filter(b => b.floor === k && (b.kind === 'glass' || b.kind === 'oak')).sort((a, b) => a.u0 - b.u0);
          expect(row.length, `floor ${k}`).toBe(8);                                       // a balcony on every room: four bays either side of the lobby
          expect(new Set(row.map(b => b.kind)).size).toBe(2);                              // a glass guard, an oak screen…
          const left = row.filter(b => b.u1 <= 0), right = row.filter(b => b.u0 >= 0);
          for (const side of [left, right]) for (let j = 1; j < side.length; j++) expect(side[j].kind, `floor ${k} bay ${j}`).not.toBe(side[j - 1].kind);   // …alternating along the front
          if (k >= 2) expect(i.balconies.filter(b => b.floor === k && b.kind === 'suite')).toHaveLength(1);
        }
        for (let k = 2; k < n - 1; k++) {                                                  // and up the front, as a draught board
          const kinds = (f: number) => i.balconies.filter(b => b.floor === f && b.kind !== 'suite').sort((a, b) => a.u0 - b.u0).map(b => b.kind);
          const a = kinds(k), b = kinds(k + 1);
          a.forEach((kd, j) => expect(b[j]).not.toBe(kd));
        }
        expect(i.balconies.every(b => b.floor >= 1 && b.floor <= n - 1)).toBe(true);
      } else if (id === 'hotel-tower') {
        for (let k = 2; k < n; k++) expect(i.balconies.filter(b => b.floor === k), `floor ${k}`).toHaveLength(1);
        expect(i.balconies.filter(b => b.kind === 'glass').length).toBe(n - 3);
        expect(i.balconies.every(b => b.u1 - b.u0 >= 18)).toBe(true);                       // the tower's slabs run its whole width
      } else {
        const court = i.balconies.filter(b => b.face !== 'street');
        expect(court.length).toBeGreaterThanOrEqual(2 * ((n - 1) + (Math.max(2, n - 1) - 1) + (Math.max(2, n - 2) - 1)));   // every floor of every segment of both wings, on the court
        expect(new Set(court.map(b => b.face))).toEqual(new Set(['left', 'right']));
        expect(i.balconies.filter(b => b.face === 'street').length).toBeGreaterThanOrEqual(2);
      }
    }
  });
});
