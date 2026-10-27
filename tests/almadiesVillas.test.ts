import { describe, expect, it, vi } from 'vitest';
import { E, GRID, LIFE_CAP, PALETTES, STOREY, TRI_CAP, type Site } from '../src/world/almadies/contract';
import { lifeInHub } from '../src/world/almadies/district';
import { gateX } from '../src/world/almadies/parts';
import { variantsFor } from '../src/world/almadies/district';
import { drawSite } from './helpers/siteCost';
import { PAL, colliderInPlan, coloursOf, drawLife, lifeProblems, paneCount, panesPerStorey, siteWith, silhouette, toPlan, walkToDoor } from './helpers/designChecks';

/**
 * LD2.0-E lane E-V: the four villas (src/world/almadies/villas.ts): each reads as its own premium home. For every design, on 2 and 3 storeys, both
 * facings, mirrored or not, the three gate sides and every palette: inside its site, within its budget, a real front door on the street face on the
 * side away from the gate, the car gate where the site says, balconies and glazing on every storey, a pool with water, lanterns, no sign.
 */
const calls = vi.hoisted(() => ({ cars: 0, scooters: 0, benches: 0, doors: [] as { face: string; hub: { x: number; z: number }; w?: number }[], balconies: [] as { face: string; y: number }[], perimeter: [] as { gate?: string; front?: string; entries: { hub: { x: number; z: number }; w: number }[] }[] }));
vi.mock('../src/world/almadies/parts', async importOriginal => {
  const m = await importOriginal<typeof import('../src/world/almadies/parts')>();
  return {
    ...m,
    parkedCar: (...a: Parameters<typeof m.parkedCar>) => { calls.cars++; return m.parkedCar(...a); },
    scooter: (...a: Parameters<typeof m.scooter>) => { calls.scooters++; return m.scooter(...a); },
    bench: (...a: Parameters<typeof m.bench>) => { calls.benches++; return m.bench(...a); },
    door: (d: Parameters<typeof m.door>[0], o: Parameters<typeof m.door>[1]) => { calls.doors.push({ face: o.face, hub: d.f.p(o.x, o.z), w: o.w }); return m.door(d, o); },
    balcony: (d: Parameters<typeof m.balcony>[0], o: Parameters<typeof m.balcony>[1]) => { calls.balconies.push({ face: o.face, y: o.y }); return m.balcony(d, o); },
    perimeter: (d: Parameters<typeof m.perimeter>[0], o: Parameters<typeof m.perimeter>[1] = {}) => { calls.perimeter.push({ gate: o.gate, front: o.front, entries: (o.entries ?? []).map(e => ({ hub: d.f.p(e.x, E - 0.15), w: e.w })) }); return m.perimeter(d, o); },
  };
});
const VILLAS = variantsFor('villa', 'S');
const gateXOf = (g: 'left' | 'right' | 'centre') => gateX(GRID.lot, g);
const within = (c: { x0: number; x1: number; z0: number; z1: number }, r: { x0: number; x1: number; z0: number; z1: number }, m = 0.02) => c.x0 >= r.x0 - m && c.x1 <= r.x1 + m && c.z0 >= r.z0 - m && c.z1 <= r.z1 + m;
const near = (set: Set<number>, hex: number, tol = 3) => [...set].some(h => Math.abs((h >> 16) - (hex >> 16)) <= tol && Math.abs(((h >> 8) & 255) - ((hex >> 8) & 255)) <= tol && Math.abs((h & 255) - (hex & 255)) <= tol);
const draw = (v: (typeof VILLAS)[number], s: Site, lite = false) => { calls.doors.length = calls.balconies.length = calls.perimeter.length = 0; calls.cars = calls.scooters = calls.benches = 0; const r = drawSite(s, v, lite); return { r, doors: [...calls.doors], balconies: [...calls.balconies], perimeter: [...calls.perimeter] }; };

describe('the villa designs', () => {
  it('are four, in the registry order the plan asks for, each its own name and silhouette', () => {
    expect(VILLAS).toHaveLength(4);
    expect(new Set(VILLAS.map(v => v.id)).size).toBe(4);
    expect(new Set(VILLAS.map(v => v.name)).size).toBe(4);
    const sig = VILLAS.map(v => silhouette(draw(v, siteWith('villa', { gate: 'right', storeys: 2 })).r.draw));
    expect(new Set(sig).size).toBe(4);
    // and by their height profile: the tower villa rises past the others' roofs, the pavilion villa is the lowest of its masses
    const tallest = VILLAS.map(v => Math.max(...draw(v, siteWith('villa', { gate: 'right', storeys: 2 })).r.colliders.map(c => c.h)));
    expect(Math.max(...tallest)).toBeGreaterThan(Math.min(...tallest) + 2);
  });
  for (const v of VILLAS) describe(`${v.id} ${v.name}`, () => {
    for (const storeys of [2, 3]) for (const gate of ['right', 'left', 'centre'] as const) for (const [facing, mirror] of [['south', false], ['north', true], ['south', true], ['north', false]] as const) {
      const label = `${storeys} storeys, gate ${gate}, facing ${facing}${mirror ? ' mirrored' : ''}`;
      it(`${label}: inside its site, solid, within its budget, lighter on the low preset, the car gate where the site says`, () => {
        const s = siteWith('villa', { facing, mirror, gate, storeys }), { r, perimeter } = draw(v, s), lite = draw(v, s, true).r;
        expect(r.colliders.length).toBeGreaterThan(5);
        for (const c of r.colliders) expect(within(c, s.rect), JSON.stringify(c)).toBe(true);
        expect(r.tris, `${r.tris} triangles`).toBeLessThanOrEqual(TRI_CAP.villa.S!);
        expect(lite.tris, `lite ${lite.tris} / ${r.tris}`).toBeLessThanOrEqual(r.tris * 0.9);
        expect(r.signs).toHaveLength(0);
        expect(r.group).toBeUndefined();
        expect(perimeter).toHaveLength(1);                                                            // the shared boundary, once: a railing on the street, never a solid wall (front is the default)
        expect(perimeter[0].front).toBeUndefined();
        expect(Math.max(...r.colliders.map(c => c.h))).toBeGreaterThanOrEqual(storeys * STOREY * 0.9);
        // the shut car gate (2.3 m) stands at the site's gate, in the plan, whatever the mirror (the design is mirrored for a left gate)
        const g = r.colliders.map(c => colliderInPlan(r.draw, c)).filter(c => c.h === 2.3);
        expect(g).toHaveLength(1);
        expect(g[0].x).toBeCloseTo(gateX(GRID.lot, gate), 1);
      });
    }
    for (const storeys of [2, 3]) it(`${storeys} storeys: a real front door on the street face, away from the gate; teak in a portal; balconies on the upper floors; glazing; a pool; lanterns`, () => {
      for (const gate of ['right', 'left'] as const) for (const mirror of [false, true]) {
        const s = siteWith('villa', { gate, mirror, storeys }), { r, doors, balconies } = draw(v, s);
        const street = doors.filter(d => d.face === 'street');
        expect(street.length, 'a door on the street face, and the wall\'s portal').toBeGreaterThanOrEqual(1);
        for (const d of street) {
          const p = toPlan(r.draw, d.hub);
          expect(Math.sign(p.x), `door x ${p.x.toFixed(1)} against the ${gate} gate`).toBe(-Math.sign(gateX(GRID.lot, gate)));
        }
        expect(street.some(d => toPlan(r.draw, d.hub).z < 9), 'the house\'s own front door').toBe(true);
        expect(street.some(d => Math.abs(toPlan(r.draw, d.hub).z - 10.7) < 0.2), 'no door in a street wall: the street edge is a railing').toBe(false);
        expect(balconies.length, 'balconies').toBeGreaterThanOrEqual(1);
        const panes = panesPerStorey(r.kit.batches, STOREY);
        for (let st = 0; st < storeys; st++) expect(panes[st] ?? 0, `panes on storey ${st} (${panes.join(',')})`).toBeGreaterThanOrEqual(2);
        expect(paneCount(r.kit.batches), 'panes of glass').toBeGreaterThanOrEqual(6);
        expect(r.kit.batches.water.count, 'the pool\'s water').toBeGreaterThanOrEqual(1);
        expect(r.kit.batches.bulbs.count, 'lights').toBeGreaterThanOrEqual(6);
        expect(r.kit.batches.metal.count, 'the gate and the garage door').toBeGreaterThanOrEqual(1);
        expect(r.kit.batches.glassDark.count, 'glass guards').toBeGreaterThanOrEqual(2);
        expect(r.kit.batches.leaves.count, 'palms and planting').toBeGreaterThanOrEqual(12);
        expect(r.canopies.length, 'a palm\'s canopy for the camera').toBeGreaterThanOrEqual(1);
      }
    });
    it('stays within its budget on any lot: the site id only jitters a palm, a tree, the bougainvillea (30 ids, both storeys, every gate)', () => {
      let max = 0;
      for (const storeys of [2, 3]) for (let k = 0; k < 30; k++) for (const gate of ['right', 'left', 'centre'] as const) {
        const s = { ...siteWith('villa', { gate, storeys, mirror: k % 2 === 0, facing: k % 3 === 0 ? 'north' : 'south' }), id: `almadies:${k % 4},${k % 3}:${k}` };
        max = Math.max(max, drawSite(s, v).tris);
      }
      expect(max).toBeLessThanOrEqual(TRI_CAP.villa.S!);
    });
    it('is open to the street: a walk-in opening in the railing in front of the front door, a clear path from the pavement to its step, the car gate shut', () => {
      for (const storeys of [2, 3]) for (const gate of ['right', 'left'] as const) for (const [facing, mirror] of [['south', false], ['north', true], ['south', true], ['north', false]] as const) {
        const s = siteWith('villa', { gate, mirror, facing, storeys }), { r, doors, perimeter } = draw(v, s), label = `${storeys} storeys, gate ${gate}, ${facing}${mirror ? ' mirrored' : ''}`;
        expect(perimeter[0].entries, label).toHaveLength(1);
        const op = toPlan(r.draw, perimeter[0].entries[0].hub), w = perimeter[0].entries[0].w;
        const door = doors.filter(d => d.face === 'street').map(d => toPlan(r.draw, d.hub)).find(p => p.z < 9)!;
        expect(Math.abs(op.x - door.x), `${label}: the opening is in line with the door`).toBeLessThan(0.3);
        const { reached, crossing } = walkToDoor(r.draw, { x: op.x, z: E + 1.2 }, { x: door.x, z: door.z + 0.9 });
        expect(reached, `${label}: a body walks from the pavement to the door's step`).toBe(true);
        // and only through that opening: whoever stands on the railing's line stands in it (the rest is railing, pier or the shut gate)
        expect(crossing.length, `${label}: the opening is open`).toBeGreaterThan(0);
        for (const x of crossing) expect(Math.abs(x - op.x), `${label}: crossing at ${x}`).toBeLessThanOrEqual(w / 2);
      }
    });
    it('and without an opening (a centre gate leaves no room for one) nobody walks in: the railing and the shut gate close the street edge', () => {
      const s = siteWith('villa', { gate: 'centre', storeys: 2 }), { r, doors, perimeter } = draw(v, s);
      if (perimeter[0].entries.length) return;                                                       // (this design's door is clear of the centre gate: its opening stays)
      const door = doors.filter(d => d.face === 'street').map(d => toPlan(r.draw, d.hub)).find(p => p.z < 9)!;
      const w = walkToDoor(r.draw, { x: door.x, z: E + 1.2 }, { x: door.x, z: door.z + 0.9 });
      expect(w.reached).toBe(false); expect(w.crossing).toHaveLength(0);
    });
    it('is lived in: a guard or a gardener at the entry facing the street, a car on the drive, a registered bench, someone on a balcony; every post reachable from the pavement, nothing inside a collider, the gate\'s apron and the door\'s walk clear', () => {
      for (const storeys of [2, 3]) for (const gate of ['right', 'left'] as const) for (const [facing, mirror] of [['south', false], ['north', true], ['south', true], ['north', false]] as const) {
        const s = siteWith('villa', { gate, mirror, facing, storeys }), label = `${storeys} storeys, gate ${gate}, ${facing}${mirror ? ' mirrored' : ''}`;
        calls.cars = calls.scooters = calls.benches = 0; calls.doors.length = calls.perimeter.length = 0;
        const r = drawLife(s, v), cars = calls.cars, benches = calls.benches, door = calls.doors.filter(d => d.face === 'street').map(d => toPlan(r.draw, d.hub)).find(p => p.z < 9)!, op = toPlan(r.draw, calls.perimeter[0].entries[0].hub);
        const gx = gateXOf(gate), gt = { x0: gx - 2.2, x1: gx + 2.2 };
        expect(lifeProblems(r, door, op, gt, LIFE_CAP.villa, STOREY), label).toEqual([]);
        const people = r.life.people ?? [], seats = r.life.seats ?? [];
        expect(people.length, `${label}: people`).toBeGreaterThanOrEqual(1); expect(people.length).toBeLessThanOrEqual(LIFE_CAP.villa.people);
        expect(cars, `${label}: a parked car`).toBeGreaterThanOrEqual(1);
        expect(benches, `${label}: a bench`).toBeGreaterThanOrEqual(1);
        expect(seats.length, `${label}: bench seats`).toBeGreaterThanOrEqual(2); expect(seats.every(x => x.kind === 'bench'), `${label}: benches`).toBe(true);
        // the one at the entry faces the street: a guard or gardener (Idle), inside the railing, turned to the street (plan yaw 0)
        const g = people.find(p => !p.y)!;
        expect(g, `${label}: someone at the entry`).toBeTruthy(); expect(g.clip).toBe('Idle'); expect(Math.abs(g.yaw), `${label}: faces the street`).toBeLessThan(1e-6); expect(g.z, `${label}: inside the railing`).toBeLessThan(E - 0.5);
        expect(people.some(p => p.y && p.y > 3), `${label}: someone on a balcony`).toBe(true);
        // it reaches the hub whole
        const hub = lifeInHub(r.draw, r.life); expect(hub.people).toHaveLength(people.length); expect(hub.seats).toHaveLength(seats.length);
      }
    });
    it('puts the same life out each time, in the budget, lighter on the low preset', () => {
      const s = siteWith('villa', { storeys: 3, gate: 'left', mirror: true }), a = drawLife(s, v), b = drawLife(s, v), lo = drawLife(s, v, true);
      expect(b.life).toEqual(a.life); expect(b.tris).toBe(a.tris); expect(a.tris).toBeLessThanOrEqual(TRI_CAP.villa.S!);
      expect(lo.tris).toBeLessThanOrEqual(a.tris * 0.9);
    });
    it('wears any palette: its render, slab, stone, wood and frame colours come from the site\'s palette, never hard-coded', () => {
      const seen = PAL.map(p => ({ p, cols: coloursOf(drawSite(siteWith('villa', { palette: p, storeys: 2 }), v).kit.batches), pal: PALETTES[p] }));
      for (const { p, cols, pal } of seen) for (const k of ['render', 'slab', 'stone', 'wood', 'frame'] as const) expect(near(cols, pal[k]), `${p}.${k}`).toBe(true);
      // two palettes share no render colour: a design that hard-coded its walls would show the same colour in both
      const a = seen.find(s => s.p === 'ivory')!, b = seen.find(s => s.p === 'terracotta')!;
      expect(near(b.cols, a.pal.render, 1)).toBe(false);
      expect(near(a.cols, b.pal.render, 1)).toBe(false);
    });
    it('is deterministic: the same site draws the same triangles and colliders, whatever Math.random says', () => {
      const s = siteWith('villa', { storeys: 3 }), a = drawSite(s, v), spy = vi.spyOn(Math, 'random').mockReturnValue(0.37);
      try { const b = drawSite(s, v); expect(b.tris).toBe(a.tris); expect(b.colliders).toEqual(a.colliders); expect(b.canopies).toEqual(a.canopies); } finally { spy.mockRestore(); }
    });
  });
});
