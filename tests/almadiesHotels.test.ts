import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { stubCanvas } from './hubstub';
import { drawSite } from './helpers/siteCost';
import { E, PALETTES, STOREY, TRI_CAP, sizeOf, type GateSide, type Site, type SiteDraw } from '../src/world/almadies/contract';
import { SITES } from '../src/world/almadies/plan';
import { variantOf, variantsFor } from '../src/world/almadies/district';
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
  it('puts the boutique on the sea front (Le Filao, east of the port) and the tower on the mall\'s road (Océane); the resort (Baobab Azur) is kept in the registry, its block having gone to the hospitality strip', () => {
    expect(hotels).toHaveLength(2);
    const byName = Object.fromEntries(hotels.map(s => [s.name!, variantOf(s).id]));
    expect(byName).toEqual({ 'HÔTEL LE FILAO': 'hotel-boutique', 'HÔTEL OCÉANE': 'hotel-tower' });
    expect(VARIANTS.map(v => v.id)).toContain('hotel-resort');
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
      const t = i.terraces[0], tc = { x: (t.x0 + t.x1) / 2, z: (t.z0 + t.z1) / 2 };
      expect(canWalk(d, r.colliders, from, tc), 'from the pavement to the terrace').toBe(true);
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
