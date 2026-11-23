import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { E, GRID, LIFE_CAP, PALETTES, STOREY, TRI_CAP, type Site } from '../src/world/almadies/contract';
import { lifeInHub } from '../src/world/almadies/district';
import { gateX } from '../src/world/almadies/parts';
import { variantsFor } from '../src/world/almadies/district';
import { guardGlass } from '../src/world/almadies/villas.kit';
import type { Batch } from '../src/world/batch';
import { drawSite } from './helpers/siteCost';
import { PAL, colliderInPlan, coloursOf, drawLife, lifeProblems, panesPerStorey, siteWith, silhouette, toPlan, walkToDoor } from './helpers/designChecks';

/**
 * LD2.0-E lane E-V: the three houses (src/world/almadies/houses.ts): compact two-storey homes behind a low wall, each its own silhouette, with a real
 * front door, a glass-guarded balcony or terrace on the street, a carport or garage, a small garden. For every design, on 2 and 3 storeys, both facings,
 * mirrored or not, the three gate sides and every palette.
 */
const calls = vi.hoisted(() => ({ cars: 0, scooters: 0, benches: 0, doors: [] as { face: string; hub: { x: number; z: number } }[], balconies: [] as { face: string; y: number }[], perimeter: [] as { gate?: string; front?: string; entries: { hub: { x: number; z: number }; w: number }[] }[] }));
vi.mock('../src/world/almadies/parts', async importOriginal => {
  const m = await importOriginal<typeof import('../src/world/almadies/parts')>();
  return {
    ...m,
    parkedCar: (...a: Parameters<typeof m.parkedCar>) => { calls.cars++; return m.parkedCar(...a); },
    scooter: (...a: Parameters<typeof m.scooter>) => { calls.scooters++; return m.scooter(...a); },
    bench: (...a: Parameters<typeof m.bench>) => { calls.benches++; return m.bench(...a); },
    door: (d: Parameters<typeof m.door>[0], o: Parameters<typeof m.door>[1]) => { calls.doors.push({ face: o.face, hub: d.f.p(o.x, o.z) }); return m.door(d, o); },
    balcony: (d: Parameters<typeof m.balcony>[0], o: Parameters<typeof m.balcony>[1]) => { calls.balconies.push({ face: o.face, y: o.y }); return m.balcony(d, o); },
    perimeter: (d: Parameters<typeof m.perimeter>[0], o: Parameters<typeof m.perimeter>[1] = {}) => { calls.perimeter.push({ gate: o.gate, front: o.front, entries: (o.entries ?? []).map(e => ({ hub: d.f.p(e.x, E - 0.15), w: e.w })) }); return m.perimeter(d, o); },
  };
});
const HOUSES = variantsFor('house', 'S');
const within = (c: { x0: number; x1: number; z0: number; z1: number }, r: { x0: number; x1: number; z0: number; z1: number }, m = 0.02) => c.x0 >= r.x0 - m && c.x1 <= r.x1 + m && c.z0 >= r.z0 - m && c.z1 <= r.z1 + m;
const near = (set: Set<number>, hex: number, tol = 3) => [...set].some(h => Math.abs((h >> 16) - (hex >> 16)) <= tol && Math.abs(((h >> 8) & 255) - ((hex >> 8) & 255)) <= tol && Math.abs((h & 255) - (hex & 255)) <= tol);
const draw = (v: (typeof HOUSES)[number], s: Site, lite = false) => { calls.doors.length = calls.balconies.length = calls.perimeter.length = 0; calls.cars = calls.scooters = calls.benches = 0; const r = drawSite(s, v, lite); return { r, doors: [...calls.doors], balconies: [...calls.balconies], perimeter: [...calls.perimeter] }; };
const geos = (b: Batch) => (b as unknown as { geos: THREE.BufferGeometry[] }).geos;
/** The boxes of a batch in the site's plan: [x0, x1, z0, z1, y0, y1, colour]. */
function boxesInPlan(r: ReturnType<typeof drawSite>, name: string) {
  const out: [number, number, number, number, number, number, number][] = [], c = new THREE.Color();
  for (const g of geos(r.kit.batches[name])) {
    const b = new THREE.Box3().setFromBufferAttribute(g.attributes.position as THREE.BufferAttribute), a = toPlan(r.draw, { x: b.min.x, z: b.min.z }), z = toPlan(r.draw, { x: b.max.x, z: b.max.z }), col = g.attributes.color as THREE.BufferAttribute;
    out.push([Math.min(a.x, z.x), Math.max(a.x, z.x), Math.min(a.z, z.z), Math.max(a.z, z.z), b.min.y, b.max.y, c.setRGB(col.getX(0), col.getY(0), col.getZ(0)).getHex()]);
  }
  return out;
}

describe('the house designs', () => {
  it('are three, each its own name and silhouette', () => {
    expect(HOUSES).toHaveLength(3);
    expect(new Set(HOUSES.map(v => v.id)).size).toBe(3);
    expect(new Set(HOUSES.map(v => v.name)).size).toBe(3);
    expect(new Set(HOUSES.map(v => silhouette(draw(v, siteWith('house', { gate: 'right', storeys: 2 })).r.draw))).size).toBe(3);
  });
  for (const v of HOUSES) describe(`${v.id} ${v.name}`, () => {
    for (const storeys of [2, 3]) for (const gate of ['left', 'right', 'centre'] as const) for (const [facing, mirror] of [['south', false], ['north', true], ['south', true], ['north', false]] as const) {
      const label = `${storeys} storeys, gate ${gate}, facing ${facing}${mirror ? ' mirrored' : ''}`;
      it(`${label}: inside its site, solid, within its budget, lighter on the low preset, the car gate where the site says`, () => {
        const s = siteWith('house', { facing, mirror, gate, storeys }), { r, perimeter } = draw(v, s), lite = draw(v, s, true).r;
        expect(r.colliders.length).toBeGreaterThan(5);
        for (const c of r.colliders) expect(within(c, s.rect), JSON.stringify(c)).toBe(true);
        expect(r.tris, `${r.tris} triangles`).toBeLessThanOrEqual(TRI_CAP.house.S!);
        expect(lite.tris, `lite ${lite.tris} / ${r.tris}`).toBeLessThanOrEqual(r.tris * 0.9);
        expect(r.signs).toHaveLength(0);
        expect(r.group).toBeUndefined();
        expect(perimeter).toHaveLength(1);                                                            // the shared boundary once: a railing on the street (the default front), the gate in the design's arrangement
        expect(perimeter[0].gate).toBe(gate === 'centre' ? 'centre' : 'right'); expect(perimeter[0].front).toBeUndefined();
        expect(Math.max(...r.colliders.map(c => c.h))).toBeGreaterThanOrEqual(storeys * STOREY * 0.9);
        const g = r.colliders.map(c => colliderInPlan(r.draw, c)).filter(c => Math.abs(c.h - 2.3) < 1e-6);
        expect(g).toHaveLength(1);
        expect(g[0].x).toBeCloseTo(gateX(GRID.lot, gate), 1);
        expect(g[0].w).toBeCloseTo(3.4, 1);                                                                // a one-car gate
      });
    }
    for (const storeys of [2, 3]) it(`${storeys} storeys: a real front door away from the gate, panes on every storey, a glass guard over the street, covered parking, a garden, lanterns`, () => {
      for (const gate of ['right', 'left'] as const) for (const mirror of [false, true]) {
        const s = siteWith('house', { gate, mirror, storeys }), { r, doors } = draw(v, s), sg = Math.sign(gateX(GRID.lot, gate));
        const street = doors.filter(d => d.face === 'street').map(d => toPlan(r.draw, d.hub));
        expect(street.length, 'the house\'s front door on its street face').toBeGreaterThanOrEqual(1);
        for (const p of street) expect(Math.sign(p.x), `door x ${p.x.toFixed(1)} against the ${gate} gate`).toBe(-sg);
        expect(street.some(p => p.z < 8 && p.z > 2), 'the door stands in the house\'s front, not on the wall').toBe(true);
        const panes = panesPerStorey(r.kit.batches, STOREY);
        for (let st = 0; st < storeys; st++) expect(panes[st] ?? 0, `panes on storey ${st} (${panes.join(',')})`).toBeGreaterThanOrEqual(2);
        // a glass guard facing the street at an upper floor: a pale guard box (dark-glass batch) spanning at least 2.4 m across the street side, over the first floor
        const guard = guardGlass(PALETTES[s.palette].glass);
        const guards = boxesInPlan(r, 'glassDark').filter(b => Math.abs(b[6] - guard) < 0x030303 || near(new Set([b[6]]), guard, 2));
        expect(guards.some(b => b[1] - b[0] >= 2.4 && b[2] > 0 && b[4] >= 3), 'a glass guard across the street side, at the first floor or above').toBe(true);
        // covered parking on the gate's side: a slab above head height, at least 2.5 × 3 m, over the drive's side
        const slabs = boxesInPlan(r, 'plain').filter(b => b[5] - b[4] <= 0.45 && b[4] >= 2.4 && b[4] <= 3.9 && b[1] - b[0] >= 2.5 && b[3] - b[2] >= 3 && Math.sign((b[0] + b[1]) / 2) === sg);
        expect(slabs.length, 'a carport slab or a garage roof on the gate side').toBeGreaterThanOrEqual(1);
        expect(r.kit.batches.metal.count, 'the bar gate (and the garage door)').toBeGreaterThanOrEqual(1);
        expect(r.kit.batches.leaves.count, 'planting').toBeGreaterThanOrEqual(3);
        expect(r.kit.batches.bulbs.count, 'lights').toBeGreaterThanOrEqual(5);
        expect(r.kit.batches.pave.count, 'a drive and a path').toBeGreaterThanOrEqual(2);
      }
    });
    it('stays within its budget on any lot: the site id only jitters a palm, a tree, the bougainvillea (30 ids, both storeys, every gate)', () => {
      let max = 0;
      for (const storeys of [2, 3]) for (let k = 0; k < 30; k++) for (const gate of ['right', 'left', 'centre'] as const) {
        const s = { ...siteWith('house', { gate, storeys, mirror: k % 2 === 0, facing: k % 3 === 0 ? 'north' : 'south' }), id: `almadies:${k % 4},${k % 3}:${k}` };
        max = Math.max(max, drawSite(s, v).tris);
      }
      expect(max).toBeLessThanOrEqual(TRI_CAP.house.S!);
    });
    it('is open to the street: a walk-in opening in the railing in front of the front door, a clear path from the pavement to its step, the car gate shut', () => {
      for (const storeys of [2, 3]) for (const gate of ['right', 'left'] as const) for (const [facing, mirror] of [['south', false], ['north', true], ['south', true], ['north', false]] as const) {
        const s = siteWith('house', { gate, mirror, facing, storeys }), { r, doors, perimeter } = draw(v, s), label = `${storeys} storeys, gate ${gate}, ${facing}${mirror ? ' mirrored' : ''}`;
        expect(perimeter[0].entries, label).toHaveLength(1);
        const op = toPlan(r.draw, perimeter[0].entries[0].hub), w = perimeter[0].entries[0].w;
        const door = doors.filter(d => d.face === 'street').map(d => toPlan(r.draw, d.hub)).find(p => p.z < 9)!;
        expect(Math.abs(op.x - door.x), `${label}: the opening is in line with the door`).toBeLessThan(0.3);
        const { reached, crossing } = walkToDoor(r.draw, { x: op.x, z: E + 1.2 }, { x: door.x, z: door.z + 0.9 });
        expect(reached, `${label}: a body walks from the pavement to the door's step`).toBe(true);
        expect(crossing.length, `${label}: the opening is open`).toBeGreaterThan(0);
        for (const x of crossing) expect(Math.abs(x - op.x), `${label}: crossing at ${x}`).toBeLessThanOrEqual(w / 2);
      }
    });
    it('and without an opening (a centre gate leaves no room for one) nobody walks in', () => {
      const s = siteWith('house', { gate: 'centre', storeys: 2 }), { r, doors, perimeter } = draw(v, s);
      if (perimeter[0].entries.length) return;
      const door = doors.filter(d => d.face === 'street').map(d => toPlan(r.draw, d.hub)).find(p => p.z < 9)!;
      const w = walkToDoor(r.draw, { x: door.x, z: E + 1.2 }, { x: door.x, z: door.z + 0.9 });
      expect(w.reached).toBe(false); expect(w.crossing).toHaveLength(0);
    });
    it('is lived in: a car in the carport or before the garage, a scooter by the door, someone at home; every post reachable from the pavement, nothing inside a collider, the gate\'s apron and the door\'s walk clear', () => {
      for (const storeys of [2, 3]) for (const gate of ['right', 'left'] as const) for (const [facing, mirror] of [['south', false], ['north', true], ['south', true], ['north', false]] as const) {
        const s = siteWith('house', { gate, mirror, facing, storeys }), label = `${storeys} storeys, gate ${gate}, ${facing}${mirror ? ' mirrored' : ''}`;
        calls.cars = calls.scooters = calls.benches = 0; calls.doors.length = calls.perimeter.length = 0;
        const r = drawLife(s, v), cars = calls.cars, scooters = calls.scooters, door = calls.doors.filter(d => d.face === 'street').map(d => toPlan(r.draw, d.hub)).find(p => p.z < 9)!, op = toPlan(r.draw, calls.perimeter[0].entries[0].hub);
        const gx = gateX(GRID.lot, gate), gt = { x0: gx - 1.7, x1: gx + 1.7 };
        expect(lifeProblems(r, door, op, gt, LIFE_CAP.house, STOREY), label).toEqual([]);
        const people = r.life.people ?? [];
        expect(people.length, `${label}: someone at home`).toBeGreaterThanOrEqual(1); expect(people.length).toBeLessThanOrEqual(LIFE_CAP.house.people);
        expect(cars, `${label}: a parked car`).toBeGreaterThanOrEqual(1); expect(scooters, `${label}: a scooter`).toBeGreaterThanOrEqual(1);
        expect(people.every(p => p.clip === 'Talk'), `${label}: talking`).toBe(true);
        const hub = lifeInHub(r.draw, r.life); expect(hub.people).toHaveLength(people.length);
        // the car stands on the gate's side (the drive), the scooter on the door's
        const cols = r.draw.colliders.map(c => colliderInPlan(r.draw, c)).filter(c => c.h > 1.2 && c.h < 2 && c.w > 1.5 && c.d > 1.5 && c.w < 5 && c.d < 5 && Math.sign(c.x) === Math.sign(gx));
        expect(cols.length, `${label}: a car on the gate's side`).toBeGreaterThanOrEqual(1);
      }
    });
    it('puts the same life out each time, in the budget, lighter on the low preset', () => {
      const s = siteWith('house', { storeys: 3, gate: 'left', mirror: true }), a = drawLife(s, v), b = drawLife(s, v), lo = drawLife(s, v, true);
      expect(b.life).toEqual(a.life); expect(b.tris).toBe(a.tris); expect(a.tris).toBeLessThanOrEqual(TRI_CAP.house.S!);
      expect(lo.tris).toBeLessThanOrEqual(a.tris * 0.9);
    });
    it('wears any palette: its render, slab, stone, wood and frame colours come from the site\'s palette, never hard-coded', () => {
      const seen = PAL.map(p => ({ p, cols: coloursOf(drawSite(siteWith('house', { palette: p, storeys: 2 }), v).kit.batches), pal: PALETTES[p] }));
      for (const { p, cols, pal } of seen) for (const k of ['render', 'slab', 'stone', 'wood', 'frame'] as const) expect(near(cols, pal[k]), `${p}.${k}`).toBe(true);
      const a = seen.find(s => s.p === 'ivory')!, b = seen.find(s => s.p === 'terracotta')!;
      expect(near(b.cols, a.pal.render, 1)).toBe(false);
      expect(near(a.cols, b.pal.render, 1)).toBe(false);
    });
    it('is deterministic: the same site draws the same triangles and colliders, whatever Math.random says', () => {
      const s = siteWith('house', { storeys: 3 }), a = drawSite(s, v), spy = vi.spyOn(Math, 'random').mockReturnValue(0.37);
      try { const b = drawSite(s, v); expect(b.tris).toBe(a.tris); expect(b.colliders).toEqual(a.colliders); expect(b.canopies).toEqual(a.canopies); } finally { spy.mockRestore(); }
    });
  });
  it('each has its own plan: stacked offset boxes, an L with a loggia, boxes stepping back from the street', () => {
    const s = siteWith('house', { gate: 'right', storeys: 2 });
    const cols = (v: (typeof HOUSES)[number]) => draw(v, s).r.colliders.map(c => colliderInPlan(draw(v, s).r.draw, c)).filter(c => c.h > 3);
    const [stacked, ell, steps] = HOUSES.map(cols);
    // stacked: a collider (the upper box) that overhangs the ground box on two sides: a banded collider (y0 above head height) exists
    expect(stacked.some(c => c.y0 !== undefined && c.y0 > 2), 'the upper box floats over the carport and the entry').toBe(true);
    // the L: the two wings' union is not a rectangle (its bounding box is at least 20 m² larger than the wings' area)
    const ellWings = ell.filter(c => c.h > 6), area = ellWings.reduce((a, c) => a + c.w * c.d, 0), minx = Math.min(...ellWings.map(c => c.x - c.w / 2)), maxx = Math.max(...ellWings.map(c => c.x + c.w / 2)), minz = Math.min(...ellWings.map(c => c.z - c.d / 2)), maxz = Math.max(...ellWings.map(c => c.z + c.d / 2));
    expect((maxx - minx) * (maxz - minz) - area, 'the loggia\'s corner is open').toBeGreaterThan(20);
    // the terraces: the masses get taller going back from the street (at least three heights, the tallest the furthest back)
    const hs = [...new Set(steps.map(c => c.h))].sort((a, b) => a - b);
    expect(hs.length).toBeGreaterThanOrEqual(3);
    const front = steps.reduce((a, c) => (c.z + c.d / 2 > a.z + a.d / 2 ? c : a)), back = steps.reduce((a, c) => (c.h > a.h ? c : a));
    expect(back.z).toBeLessThan(front.z);
    expect(back.h).toBeGreaterThan(front.h + STOREY * 0.8);
  });
});
