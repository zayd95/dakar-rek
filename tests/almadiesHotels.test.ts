import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { stubCanvas } from './hubstub';
import { drawSite } from './helpers/siteCost';
import { E, STOREY, TRI_CAP, extentOf, sizeOf, type GateSide, type Site } from '../src/world/almadies/contract';
import { SITES } from '../src/world/almadies/plan';
import { variantOf, variantsFor } from '../src/world/almadies/district';
import { VARIANTS } from '../src/world/almadies/hotels';
import { gateX } from '../src/world/almadies/parts';
import { info } from '../src/world/almadies/hotels.kit';
import type { Collider } from '../src/world/types';

/**
 * LD2.0-E lane E-H: the three hotels (src/world/almadies/hotels.ts) as designs: where the plan puts them, what each says about itself (the name board, a lobby
 * on the street face with its way in kept free, a balcony on every room with a rhythm, the service end on the gate's side, a drop-off kept open), and that
 * each stays in its site, in its budget and lighter on the low preset at the plan's storey counts (4, 5 and 8) in every facing, mirror and gate.
 */
stubCanvas();
const hotels = SITES.filter(s => s.kind === 'hotel');
const within = (c: Collider, r: { x0: number; x1: number; z0: number; z1: number }, m = 0.02) => c.x0 >= r.x0 - m && c.x1 <= r.x1 + m && c.z0 >= r.z0 - m && c.z1 <= r.z1 + m;
const at = (cs: Collider[], x: number, z: number) => cs.some(c => x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1);
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
  const [lo, hi] = RANGE[id];
  it('stays inside its site, is solid up to its height, in its budget and lighter on the low preset (4, 5 and 8 storeys; every facing, mirror and gate)', () => {
    const v = variant(plan), cap = TRI_CAP.hotel[v.size]!;
    for (const storeys of [4, 5, 8]) for (const gate of ['left', 'centre', 'right'] as GateSide[]) for (const [facing, mirror] of [['south', false], ['north', true]] as const) {
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
  it('has a lobby on the street face, its way in free from the street, a drop-off kept open', () => {
    const v = variant(plan);
    for (const [facing, mirror] of [['south', false], ['north', true]] as const) {
      const s = make(plan, { facing, mirror }), r = drawSite(s, v), i = info(r.draw), f = r.draw.f;
      const lobby = i.doors.find(x => x.kind === 'lobby')!;
      expect(lobby).toBeDefined(); expect(lobby.face).toBe('street'); expect(Math.abs(lobby.x)).toBeLessThan(2);
      for (let z = lobby.z + 0.9; z < E - 0.6; z += 0.4) for (const x of [-0.8, 0, 0.8]) { const q = f.p(x, z); expect(at(r.colliders, q.x, q.z), `plan (${x}, ${z.toFixed(1)})`).toBe(false); }
      const keep = r.keepClear.find(k => k.why.startsWith('hotel_dropoff'))!;
      expect(keep).toBeDefined();
      expect(within({ ...keep, h: 1 }, { x0: s.rect.x0, x1: s.rect.x1, z0: s.rect.z0 - 3.3, z1: s.rect.z1 + 3.3 }), 'the drop-off and the pavement before it').toBe(true);   // (it runs on to the pavement, as the gate\'s apron does)
      const lane = i.dropoff!, a = f.p(lane.x0, lane.z0), b = f.p(lane.x1, lane.z1);
      expect(Math.min(a.x, b.x)).toBeGreaterThanOrEqual(keep.x0 - 0.01); expect(Math.max(a.x, b.x)).toBeLessThanOrEqual(keep.x1 + 0.01);
      expect(Math.min(a.z, b.z)).toBeGreaterThanOrEqual(keep.z0 - 0.01); expect(Math.max(a.z, b.z)).toBeLessThanOrEqual(keep.z1 + 0.01);
    }
  });
  it('keeps its service end and its service door on the gate\'s side, and the gate stands shut on the street wall', () => {
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
    void lo; void hi; void extentOf;
  });
});
