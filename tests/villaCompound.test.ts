import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { stubCanvas } from './hubstub';
import { digestHub, type HubDigest } from './helpers/lotDigest';
import { BAYS, FRONT_DOOR, GATE, HELIPAD, HOUSE, LOT, POOL, STOREY, WALL_H, onLot } from '../src/housing/villa';
import { GROUND, LOT_RECT, STRIP_Z, VILLA_SITE } from '../src/world/villaCompound';
import { BLADE_PARK, BLADES, LENGTH, REGISTRATION, ROTOR_DIAMETER, SKIDS, buildHelicopter } from '../src/world/helicopter';
import type { Collider, HubWorld } from '../src/world/types';

/**
 * LD2.0-D lane V-E: the flagship villa's street compound (src/world/villaCompound.ts) on the Almadies block (1,1) lot 3, and the helicopter on its roof.
 *
 * The proof that the rest of the Almadies did not move: tests/fixtures/almadiesOutsideVilla.json is the digest (tests/helpers/lotDigest.ts) of the hub as the
 * contract commit (9991801) built it — until the integration with M4 (the Almadies' hospitality strip, which replaces two villa blocks and so shifts every random
 * draw after them): the fixture is now the hub as the combined integration (combined-20261027: M4 with the strip's placemaking pass, the Plage de Ngor and the modern fronts — src/world/modernFront.ts: sand render palette, glass balconies, entrances, baked depth) built it, the villa's lot dry-run as ever — every merged primitive of every batch, in the order it was drawn, the colliders, the camera's canopies, the
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
    expect(fixture.base).toBe('combined-20261027');
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
  const meshes = () => { const out: THREE.Mesh[] = []; h.group.traverse(o => { if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh); }); return out; };
  /** A point of the helicopter's frame where it stands on the roof (plan coordinates of the house): turned by its heading, on the pad's centre. */
  const onRoof = (x: number, z: number) => { const c = Math.cos(HELIPAD.yaw), s = Math.sin(HELIPAD.yaw); return { x: HELIPAD.x + x * c + z * s, z: HELIPAD.z - x * s + z * c }; };
  it('LD2.0-D round 2: four draw calls (paint, glass, metal, satin) and at most 12 000 triangles, as its cost says', () => {
    let tris = 0; for (const m of meshes()) tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
    expect(meshes().map(m => m.name).sort()).toEqual(['helicopter-glass', 'helicopter-metal', 'helicopter-paint', 'helicopter-satin']);
    expect(h.cost.draws).toBe(4); expect(tris).toBe(h.cost.tris);
    expect(tris).toBeLessThanOrEqual(12000); expect(tris).toBeGreaterThan(6000);
  });
  it('has a real light helicopter\'s proportions: 8.5 m long, a 9.4 m three-blade rotor, about 3 m high, on its skids at y 0, its nose toward +z', () => {
    expect(ROTOR_DIAMETER).toBeCloseTo(9.4, 5); expect(BLADES).toBe(3);
    const box = new THREE.Box3().setFromObject(h.group);
    expect(box.min.y).toBeGreaterThanOrEqual(-0.001); expect(box.min.y).toBeLessThan(0.01);   // standing on its skids
    expect(box.max.z - box.min.z).toBeGreaterThan(8); expect(box.max.z - box.min.z).toBeLessThan(9.5); expect(box.max.z - box.min.z).toBeCloseTo(LENGTH, 0);   // nose to tail
    expect(box.max.z).toBeGreaterThan(2.3); expect(box.min.z).toBeLessThan(-5.8);                                       // the nose ahead, the tail behind
    expect(h.footprint.h).toBeGreaterThan(2.9); expect(h.footprint.h).toBeLessThan(3.4);
    // the three blades at 120°, one parked over the tail boom: the others reach ±R·sin 60° across
    expect(h.footprint.w).toBeCloseTo(ROTOR_DIAMETER * Math.sin(Math.PI / 3), 0);
    expect(BLADE_PARK).toBe(0);
    // what it is made of: a clear-coated paint, tinted see-through glass, all four reflecting one shared sky map
    const mats = Object.fromEntries(meshes().map(m => [m.name, m.material as THREE.MeshPhysicalMaterial]));
    expect(mats['helicopter-paint'].clearcoat).toBe(1); expect(mats['helicopter-glass'].transparent).toBe(true);
    const env = mats['helicopter-paint'].envMap; expect(env).toBeTruthy();
    for (const m of Object.values(mats)) expect(m.envMap).toBe(env);
    expect((buildHelicopter().group.children[0] as THREE.Mesh).material).toBe(mats['helicopter-paint']);   // shared by every helicopter
    for (const m of Object.values(mats)) expect(m.userData.shared).toBe(true);                         // so an interior's disposal leaves them
  });
  it('reports its true footprint and extent', () => {
    const box = new THREE.Box3().setFromObject(h.group);
    expect(h.footprint.w).toBeCloseTo(box.max.x - box.min.x, 1); expect(h.footprint.d).toBeCloseTo(box.max.z - box.min.z, 1); expect(h.footprint.h).toBeCloseTo(box.max.y, 1);
    expect(h.extent).toMatchObject({ x0: expect.closeTo(box.min.x, 1), x1: expect.closeTo(box.max.x, 1), z0: expect.closeTo(box.min.z, 1), z1: expect.closeTo(box.max.z, 1) });
  });
  it('stands on the 6.4 m pad, turned along the terrace: its skids on the pad, the whole of it (blades too) over the roof terrace, short of the stair head', () => {
    // the skids: every point of it touching the ground
    const low: THREE.Vector3[] = [];
    for (const m of meshes()) { const p = m.geometry.attributes.position; for (let i = 0; i < p.count; i++) if (p.getY(i) < 0.02) low.push(new THREE.Vector3().fromBufferAttribute(p, i)); }
    expect(low.length).toBeGreaterThan(20);
    expect(Math.min(...low.map(v => v.z))).toBeLessThan(SKIDS.z0 + 0.3); expect(Math.max(...low.map(v => v.z))).toBeGreaterThan(SKIDS.z1 - 0.7);   // along their length
    for (const v of low) { const q = onRoof(v.x, v.z); expect(Math.hypot(q.x - HELIPAD.x, q.z - HELIPAD.z)).toBeLessThan(HELIPAD.r - 0.5); }
    // the box of it, turned onto the roof: inside the parapet (0.15 m in), west of the stair head (x 4.4)
    const corners = [[h.extent.x0, h.extent.z0], [h.extent.x0, h.extent.z1], [h.extent.x1, h.extent.z0], [h.extent.x1, h.extent.z1]].map(([x, z]) => onRoof(x, z));
    for (const c of corners) {
      expect(c.x).toBeGreaterThan(HOUSE.x0 + 0.15); expect(c.x).toBeLessThan(4.4 - 0.5);
      expect(c.z).toBeGreaterThan(HOUSE.z0 + 0.15); expect(c.z).toBeLessThan(HOUSE.z1 - 0.15);
    }
    // the nose toward −x, its left side (and the registration) toward the street
    expect(onRoof(0, 1).x).toBeCloseTo(HELIPAD.x - 1, 5); expect(onRoof(1, 0).z).toBeCloseTo(HELIPAD.z + 1, 5);
    expect(REGISTRATION).toMatch(/^6V-[A-Z]{3}$/);
  });
  it('its reflections follow the scene\'s sky light: full by day, dim under the moon (no glow at night)', () => {
    const scene = new THREE.Scene(), hemi = new THREE.HemisphereLight(0xffffff, 0x8a7a60, 0.9); scene.add(hemi, h.group);
    const paint = meshes().find(m => m.name === 'helicopter-paint')!, mat = paint.material as THREE.MeshPhysicalMaterial;
    const draw = () => paint.onBeforeRender({} as THREE.WebGLRenderer, scene, new THREE.PerspectiveCamera(), paint.geometry, mat, null as unknown as THREE.Group);
    draw(); const day = mat.envMapIntensity;
    hemi.color.set(0x6474a6); hemi.intensity = 0.9; draw(); const night = mat.envMapIntensity;                 // main.ts updateLighting at 21 h
    expect(day).toBeGreaterThan(0.9); expect(night).toBeLessThan(day * 0.35); expect(night).toBeGreaterThan(0.05);
    scene.remove(h.group);
  });
});

// the pool of the back garden, as the interior has it (the street side draws the same numbers)
describe('the back garden seen from the street', () => {
  it('has the pool where the interior has it', () => {
    expect(POOL).toMatchObject({ x0: -6, x1: 4, z0: -9.6, z1: -6 });
  });
});
