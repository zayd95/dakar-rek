import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { stubCanvas } from './hubstub';
import { digestHub, type HubDigest } from './helpers/lotDigest';
import { BAYS, FRONT_DOOR, GATE, HELIPAD, HOUSE, LOT, POOL, STOREY, WALL_H, onLot } from '../src/housing/villa';
import { GROUND, LOT_RECT, STRIP_Z, VILLA_SITE } from '../src/world/villaCompound';
import { BLADE_PARK, ROTOR_DIAMETER, buildHelicopter } from '../src/world/helicopter';
import type { Collider, HubWorld } from '../src/world/types';

/**
 * LD2.0-D lane V-E: the flagship villa's street compound (src/world/villaCompound.ts) on the Almadies block (1,1) lot 3, and the helicopter on its roof.
 *
 * The proof that the rest of the Almadies did not move: tests/fixtures/almadiesOutsideVilla.json is the digest (tests/helpers/lotDigest.ts) of the hub as the
 * contract commit (9991801) built it — until the integration with M4 (the Almadies' hospitality strip, which replaces two villa blocks and so shifts every random
 * draw after them): the fixture is now the hub as the M4 branch (4d48c2c) built it, the villa's lot dry-run as ever — every merged primitive of every batch, in the order it was drawn, the colliders, the camera's canopies, the
 * interactables, the seats and the people, of everything that does not touch the lot — at both qualities. Any random draw shifted anywhere (another lot, a
 * street tree, a palm, a stall) would move what comes after it and change the digest.
 */
stubCanvas();
// The villa's facade (lane V-S, src/housing/villaFacade.ts) is drawn about its own origin, then moved onto the lot: its batches belong to the lot, not to
// the rest of the Almadies, so the digest leaves out whatever is built while it runs.
const facade = vi.hoisted(() => ({ depth: 0 }));
vi.mock('../src/housing/villaFacade', async importOriginal => {
  const m = await importOriginal<typeof import('../src/housing/villaFacade')>();
  return { ...m, buildVillaFacade: (...a: Parameters<typeof m.buildVillaFacade>) => { facade.depth++; try { return m.buildVillaFacade(...a); } finally { facade.depth--; } } };
});
const fixture = JSON.parse(new TextDecoder().decode(readFileSync('tests/fixtures/almadiesOutsideVilla.json'))) as { base: string; lot: { x0: number; x1: number; z0: number; z1: number }; full: HubDigest; lite: HubDigest };
const hubs: Partial<Record<'full' | 'lite', HubWorld>> = {};
const build = async (q: 'full' | 'lite') => { const { buildHub } = await import('../src/world/builder'); return (hubs[q] ??= buildHub('almadies', q === 'lite')); };
const inLot = (c: Collider, m = 0) => c.x0 >= LOT_RECT.x0 - m && c.x1 <= LOT_RECT.x1 + m && c.z0 >= LOT_RECT.z0 - m && c.z1 <= LOT_RECT.z1 + m;
const hits = (c: Collider, r: { x0: number; x1: number; z0: number; z1: number }) => c.x1 > r.x0 && c.x0 < r.x1 && c.z1 > r.z0 && c.z0 < r.z1;
/** A plan rectangle in the hub. */
const P = (x0: number, z0: number, x1: number, z1: number) => { const a = onLot(x0, z0), b = onLot(x1, z1); return { x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), z0: Math.min(a.z, b.z), z1: Math.max(a.z, b.z) }; };

describe('the villa\'s lot in the generator', () => {
  it('is the Almadies block (1,1) lot 3: the contract\'s LOT, the lot the fixture left out', () => {
    expect(VILLA_SITE).toEqual({ hub: 'almadies', i: 1, j: 1, lot: 3 });
    expect(LOT_RECT).toEqual({ x0: -29, x1: -7, z0: -29, z1: -7 });
    expect(fixture.lot).toEqual(LOT_RECT);
    expect(fixture.base).toBe('4d48c2c');
  });

  for (const q of ['full', 'lite'] as const) it(`(${q}) leaves every other lot, street tree, palm, stall, collider, seat and person of the Almadies exactly as the contract commit drew them`, async () => {
    let hub: HubWorld | null = null;
    const now = await digestHub(async () => (hub = await build(q)), LOT_RECT, 0.3, () => facade.depth > 0);
    hubs[q] = hub!;
    const was = fixture[q];
    expect(now.batches.map(b => b.n)).toEqual(was.batches.map(b => b.n));
    expect(now.batches).toEqual(was.batches);
    expect(now.colliders).toEqual(was.colliders);
    expect(now.canopies).toEqual(was.canopies);
    expect(now.interactables).toEqual(was.interactables);
    expect(now.seats).toEqual(was.seats);
    expect(now.people).toEqual(was.people);
  }, 60_000);
});

describe('the street compound', () => {
  it('walls the lot all round (WALL_H, solid), its side strips closed: from the street only the gate leads in, and only to the front yard', async () => {
    const h = await build('full');
    const mine = h.colliders.filter(c => hits(c, LOT_RECT));
    for (const c of mine) expect(inLot(c), JSON.stringify(c)).toBe(true);                    // nothing of the villa straddles its lot
    // the four edges are solid at the wall's height, but for the gate's opening (its own collider while shut)
    const solidAt = (x: number, z: number, hMin = WALL_H - 0.01) => mine.some(c => c.h >= hMin && x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1);
    for (let t = -10.8; t <= 10.8; t += 0.4) {
      const a = onLot(t, 10.85), b = onLot(t, -10.85), c = onLot(10.85, t), d = onLot(-10.85, t);
      if (t < GATE.x0 - 0.05 || t > GATE.x1 + 0.05) expect(solidAt(a.x, a.z), `street wall at x ${t}`).toBe(true);
      expect(solidAt(b.x, b.z), `back wall at x ${t}`).toBe(true);
      expect(solidAt(c.x, c.z), `east wall at z ${t}`).toBe(true);
      expect(solidAt(d.x, d.z), `west wall at z ${t}`).toBe(true);
    }
    // the side strips: closed from the house to the boundary
    for (let x = 8.1; x < 10.8; x += 0.3) for (const sx of [-1, 1]) { const p = onLot(sx * x, STRIP_Z); expect(solidAt(p.x, p.z), `strip wall at ${sx * x}`).toBe(true); }
    // the house is solid; the gate's opening is shut by the gate's own box (the villa module moves it)
    const door = onLot(FRONT_DOOR.x, (HOUSE.z0 + HOUSE.z1) / 2);
    expect(solidAt(door.x, door.z, 2 * STOREY)).toBe(true);
    const gate = (h.group.getObjectByName('villa-compound')!.userData.gate) as Collider;
    expect(h.colliders).toContain(gate);
    const mid = onLot((GATE.x0 + GATE.x1) / 2, GATE.z - 0.3);
    expect(gate.x0 < mid.x && gate.x1 > mid.x && gate.z0 < mid.z && gate.z1 > mid.z).toBe(true);
    expect(gate.x1 - gate.x0).toBeCloseTo(GATE.x1 - GATE.x0, 5);
  });

  it('keeps the yard\'s ways free: the gate to the bays, the bays themselves, the forecourt to the front door', async () => {
    const h = await build('full');
    const gate = (h.group.getObjectByName('villa-compound')!.userData.gate) as Collider;
    const others = h.colliders.filter(c => c !== gate);
    const free = (r: { x0: number; x1: number; z0: number; z1: number }) => others.filter(c => hits(c, r)).map(c => JSON.stringify(c));
    for (const b of BAYS) expect(free(P(b.x - 1.25, b.z - 2.6, b.x + 1.25, b.z + 2.6)), `bay at ${b.x}`).toEqual([]);
    expect(free(P(GATE.x0 + 0.05, BAYS[0].z, GATE.x1 - 0.05, GATE.z + 4))).toEqual([]);         // the way in, over the dropped kerb
    expect(free(P(FRONT_DOOR.x - 0.6, HOUSE.z1 + 0.05, BAYS[0].x - 1.3, HOUSE.z1 + 1.6))).toEqual([]);   // the forecourt to the door
    // what the street keeps open: the lot and the kerb before the gate (no parked car or stall across the way in)
    expect(h.keepClear?.map(k => k.why)).toEqual(expect.arrayContaining(['villa_almadies', 'villa_gate']));
    const kerb = h.keepClear!.find(k => k.why === 'villa_gate')!;
    expect(kerb.z0).toBeCloseTo(LOT_RECT.z1, 5); expect(kerb.z1).toBeGreaterThan(-4.3 + 1);   // past the parked cars' line (4.3 m from the road's centre)
  });

  it('draws the house where the plan has it, solid, and the helicopter on its roof pad', async () => {
    const h = await build('full'), g = h.group.getObjectByName('villa-compound')!;
    const facade = g.getObjectByName('villa-facade')!, heli = g.getObjectByName('helicopter')!;
    expect(facade.position.toArray()).toEqual([LOT.cx, GROUND, LOT.cz]);
    expect(heli.position.x).toBeCloseTo(LOT.cx + HELIPAD.x, 5); expect(heli.position.z).toBeCloseTo(LOT.cz + HELIPAD.z, 5);
    expect(heli.position.y).toBeCloseTo(GROUND + 2 * STOREY, 5);
    const house = h.colliders.find(c => c.x0 === LOT.cx + HOUSE.x0 && c.x1 === LOT.cx + HOUSE.x1 && c.z0 === LOT.cz + HOUSE.z0 && c.z1 === LOT.cz + HOUSE.z1);
    expect(house?.h).toBeGreaterThanOrEqual(2 * STOREY);
  });

  it('costs the Almadies view few draw calls of its own: the gate, the facade and the helicopter (the rest joins the hub\'s merged batches)', async () => {
    for (const q of ['full', 'lite'] as const) {
      const g = (await build(q)).group.getObjectByName('villa-compound')!;
      let draws = 0; g.traverse(o => { if ((o as THREE.Mesh).isMesh) draws++; });
      expect(draws).toBeLessThanOrEqual(25);
      const gate = g.getObjectByName('villa-gate') as THREE.Mesh;
      expect(gate.isMesh).toBe(true);
    }
  });
});

describe('the helicopter', () => {
  const h = buildHelicopter();
  it('is two draw calls and under 3 000 triangles, a 7.2 m two-blade rotor, on its skids at y 0, its nose toward +z', () => {
    let draws = 0, tris = 0; h.group.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { draws++; tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; } });
    expect(draws).toBe(2); expect(h.cost.draws).toBe(2);
    expect(tris).toBe(h.cost.tris); expect(tris).toBeLessThanOrEqual(3000);
    expect(ROTOR_DIAMETER).toBeCloseTo(7.2, 5);
    const box = new THREE.Box3().setFromObject(h.group);
    expect(box.min.y).toBeGreaterThanOrEqual(-0.01); expect(box.min.y).toBeLessThan(0.03);      // standing on its skids
    expect(box.max.z).toBeGreaterThan(2); expect(box.min.z).toBeLessThan(-3.5);                    // the nose ahead, the tail behind
    // the rotor's tips: 3.6 m from the mast, parked at an angle (seen from the street)
    expect(h.footprint.w).toBeCloseTo(ROTOR_DIAMETER * Math.cos(BLADE_PARK), 0);
  });
  it('reports its true footprint, and stands on the 6.4 m pad: the skids inside the circle, the tail on the roof', () => {
    const box = new THREE.Box3().setFromObject(h.group);
    expect(h.footprint.w).toBeCloseTo(box.max.x - box.min.x, 1); expect(h.footprint.d).toBeCloseTo(box.max.z - box.min.z, 1); expect(h.footprint.h).toBeCloseTo(box.max.y, 1);
    // the skids: a metre either side, ±1.5 m along: within the pad's radius
    expect(Math.hypot(1.0, 1.5)).toBeLessThan(HELIPAD.r);
    // nose and tail within the roof (the house: z −5…4 in the plan, the pad's centre at z −0.5)
    expect(HELIPAD.z + h.extent.z1).toBeLessThan(HOUSE.z1 - 0.2); expect(HELIPAD.z + h.extent.z0).toBeGreaterThan(HOUSE.z0 + 0.2);
    expect(HELIPAD.x + h.extent.x0).toBeGreaterThan(HOUSE.x0 + 0.2); expect(HELIPAD.x + h.extent.x1).toBeLessThan(HOUSE.x1 - 0.2);
    expect(h.footprint.h).toBeGreaterThan(2.5); expect(h.footprint.h).toBeLessThan(3.2);
  });
});

// the pool of the back garden, as the interior has it (the street side draws the same numbers)
describe('the back garden seen from the street', () => {
  it('has the pool where the interior has it', () => {
    expect(POOL).toMatchObject({ x0: -6, x1: 4, z0: -9.6, z1: -6 });
  });
});
