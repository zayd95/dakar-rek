import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { stubCanvas } from './hubstub';
import { digestCompound, type CompoundDigest } from './helpers/compoundDigest';
import { buildVillaCompound } from '../src/world/villaCompound';

/**
 * LD2.0-D round 2, lane R2-E: the Almadies villa kit (src/kits/almadiesVilla.ts). The villa as it stands on its lot stays exactly as it was:
 * tests/fixtures/villaCompoundOwn.json is the digest (tests/helpers/compoundDigest.ts) of everything the compound drew on its lot once the main entrance
 * was built (commit « the main entrance », before the kit), at both qualities.
 */
stubCanvas();
const FIX = 'tests/fixtures/villaCompoundOwn.json';
const now = { full: digestCompound(buildVillaCompound, false), lite: digestCompound(buildVillaCompound, true) };
// (pinned once, before the kit: UPDATE_VILLA_KIT_FIXTURE=1 npx vitest run tests/villaKit.test.ts writes it again)
if ((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.UPDATE_VILLA_KIT_FIXTURE === '1') writeFileSync(FIX, JSON.stringify(now, null, 1) + '\n');
const was = JSON.parse(new TextDecoder().decode(readFileSync(FIX))) as Record<'full' | 'lite', CompoundDigest>;

describe('the villa built from the kit', () => {
  for (const q of ['full', 'lite'] as const) it(`(${q}) is the villa as it was, primitive for primitive, box for box`, () => {
    expect(now[q].batches).toEqual(was[q].batches);
    expect(now[q].meshes).toEqual(was[q].meshes);
    expect(now[q].colliders).toEqual(was[q].colliders);
    expect(now[q].canopies).toEqual(was[q].canopies);
    expect(now[q].keepClear).toEqual(was[q].keepClear);
    expect(now[q].pools).toEqual(was[q].pools);
    expect(now[q].heli).toEqual(was[q].heli);
  });
});

// ------------------------------------------------------------------------------------------------ the kit
import * as THREE from 'three';
import { Batch } from '../src/world/batch';
import { ALMADIES_VILLA_PIECES, FLAGSHIP, MIN_LOT, buildAlmadiesVilla, lotFrame, villaFacadeFor, type AlmadiesVillaSpec } from '../src/kits/almadiesVilla';
import { BAYS, ENTRANCE, ENTRY_WALK, FRONT_DOOR, GATE, HOUSE, STOREY, WALL_H } from '../src/housing/villa';
import { VILLA_ALMADIES_LAYOUT } from '../src/housing/villaLayout';
import { slideGate, swingEntrance, type CompoundKit } from '../src/world/villaCompound';

const freshKit = (lite = false): CompoundKit => ({ lite, plain: new Batch(), pave: new Batch(), leaves: new Batch(), trunks: new Batch(), water: new Batch(), bulbs: new Batch(), metalMat: new THREE.MeshLambertMaterial(), pool: () => {} });
/** Another Almadies lot: the block (1,1)'s lot 0 (x −53…−31, z −53…−31; src/world/builder.ts lotRect), its street to the north. */
const LOT0 = { x0: -53, x1: -31, z0: -53, z1: -31 };
const hits = (c: { x0: number; x1: number; z0: number; z1: number }, r: { x0: number; x1: number; z0: number; z1: number }) => c.x1 > r.x0 && c.x0 < r.x1 && c.z1 > r.z0 && c.z0 < r.z1;
const within = (c: { x0: number; x1: number; z0: number; z1: number }, r: { x0: number; x1: number; z0: number; z1: number }, m = 0.01) => c.x0 >= r.x0 - m && c.x1 <= r.x1 + m && c.z0 >= r.z0 - m && c.z1 <= r.z1 + m;

describe('the Almadies villa kit', () => {
  it('builds the flagship from the flagship\'s spec, exactly (both qualities)', () => {
    for (const q of ['full', 'lite'] as const) {
      const viaKit = digestCompound(kit => buildAlmadiesVilla(kit, FLAGSHIP), q === 'lite');
      expect(viaKit).toEqual(was[q]);
      expect(digestCompound(kit => buildAlmadiesVilla(kit), q === 'lite')).toEqual(was[q]);
    }
  });

  it('names every piece the owner asked to keep, each with its builder, parameters and street cost', () => {
    expect(ALMADIES_VILLA_PIECES.map(p => p.id)).toEqual(['plan', 'facade', 'wall', 'carGate', 'entrance', 'bays', 'frontGarden', 'poolDeck', 'pergola', 'helipad', 'helicopter', 'furniture']);
    for (const p of ALMADIES_VILLA_PIECES) { expect(p.builder.length).toBeGreaterThan(10); expect(Object.keys(p.params).length).toBeGreaterThan(0); expect(p.street.length).toBeGreaterThan(0); }
    // the street compound's pieces build on their own, at the plan's origin
    for (const id of ['plan', 'facade', 'wall', 'carGate', 'entrance', 'bays', 'frontGarden', 'poolDeck', 'pergola', 'helipad', 'helicopter', 'furniture']) {
      const g = ALMADIES_VILLA_PIECES.find(p => p.id === id)!.build(); let tris = 0;
      g.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; });
      expect(tris, id).toBeGreaterThan(id === 'helipad' || id === 'bays' ? 30 : 100);
      const b = new THREE.Box3().setFromObject(g);
      expect(b.min.x, id).toBeGreaterThan(-13); expect(b.max.x, id).toBeLessThan(13); expect(b.max.z, id).toBeLessThan(13.5); expect(b.min.z, id).toBeGreaterThan(-13);   // (a palm's fronds hang over the wall)
    }
  });

  it('the furniture layout sets out every piece of the list on its level, the plan its three levels', () => {
    const f = ALMADIES_VILLA_PIECES.find(p => p.id === 'furniture')!.build();
    expect(f.children.length).toBe(VILLA_ALMADIES_LAYOUT.length);
    const ys = new Set(f.children.map(c => Math.round(c.position.y * 10) / 10));
    expect([...ys].sort((a, b) => a - b)).toEqual([0, STOREY, 2 * STOREY]);
    const plan = ALMADIES_VILLA_PIECES.find(p => p.id === 'plan')!.build(), levels = new Set<string>();
    plan.traverse(o => { const m = /^level:([a-z]+):/.exec(o.name); if (m) levels.add(m[1]); });
    expect([...levels].sort()).toEqual(['etage', 'rdc', 'toit']);
  });

  const specs: [string, Partial<AlmadiesVillaSpec>][] = [
    ['facing north (the street on −z)', { lot: LOT0, facing: 'north' }],
    ['facing north, mirrored (the gate on the other side)', { lot: LOT0, facing: 'north', mirror: true }],
    ['facing east', { lot: LOT0, facing: 'east' }],
    ['facing west, mirrored', { lot: LOT0, facing: 'west', mirror: true }],
    ['on a larger lot (28 × 30), facing south', { lot: { x0: 0, x1: 28, z0: 0, z1: 30 }, facing: 'south' }],
  ];
  for (const [what, spec] of specs) it(`on another lot ${what}: walled, its gate and entrance on the street edge, the walk clear, every box on the lot`, () => {
    const v = buildAlmadiesVilla(freshKit(), spec), lot = spec.lot!, { frame: f } = lotFrame(lot, spec.facing, spec.mirror);
    for (const c of v.colliders) expect(within(c, lot), JSON.stringify(c)).toBe(true);
    expect(v.lot).toEqual(lot);
    // the street edge (plan z = 11) walled all along but for the gate and the entrance, which their own boxes shut
    const solidAt = (x: number, z: number) => v.colliders.some(c => c.h >= 2.2 && x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1);   // (the gate's panels: 2.25 m)
    const half = (f.facing === 'south' || f.facing === 'north' ? lot.x1 - lot.x0 : lot.z1 - lot.z0) / 2;
    for (let t = -half + 0.2; t <= half - 0.2; t += 0.4) { const q = f.p(t, 10.85); expect(solidAt(q.x, q.z), `street edge at ${t}`).toBe(true); }
    const gate = f.rect(GATE.x0, 10.4, GATE.x1, 11), ent = f.rect(ENTRANCE.x0, 10.7, ENTRANCE.x1, 11);
    expect(hits(v.gate.collider, gate)).toBe(true); expect(hits(v.entrance.shut, ent)).toBe(true);
    // the walk from the entrance to the front door: nothing solid on it but the door
    const walk = f.rect(ENTRY_WALK.x0, ENTRY_WALK.z0 + 0.01, ENTRY_WALK.x1, ENTRY_WALK.z1 - 0.5);
    expect(v.colliders.filter(c => c !== v.entrance.shut && hits(c, walk)).map(c => JSON.stringify(c))).toEqual([]);
    // the house where the plan has it; the bays clear
    const house = f.rect(HOUSE.x0, HOUSE.z0, HOUSE.x1, HOUSE.z1);
    expect(v.colliders.some(c => Math.abs(c.x0 - house.x0) < 1e-6 && Math.abs(c.x1 - house.x1) < 1e-6 && Math.abs(c.z0 - house.z0) < 1e-6 && Math.abs(c.z1 - house.z1) < 1e-6)).toBe(true);
    for (const b of BAYS) expect(v.colliders.filter(c => c !== v.gate.collider && hits(c, f.rect(b.x - 1.25, b.z - 2.6, b.x + 1.25, b.z + 2.6))).length).toBe(0);
    // its door swings into the garden, its gate stows along the street wall clear of the entrance and within the lot
    swingEntrance(v.entrance.mesh, 1); v.entrance.mesh.updateMatrixWorld(true);
    const leaf = new THREE.Box3().setFromObject(v.entrance.mesh), inward = f.p(ENTRANCE.x0 + 0.25, 9.5), outward = f.p(ENTRANCE.x0 + 0.25, 12);
    const lc = leaf.getCenter(new THREE.Vector3());
    expect(Math.hypot(lc.x - inward.x, lc.z - inward.z)).toBeLessThan(Math.hypot(lc.x - outward.x, lc.z - outward.z));
    const gm = v.gate.mesh, pos = gm.geometry.attributes.position as THREE.BufferAttribute;
    slideGate(gm, v.gate.travel, 1);
    const stow = new THREE.Box3(); for (let i = 0; i < pos.count; i++) stow.expandByPoint(new THREE.Vector3(pos.getX(i) + gm.position.x, 0, pos.getZ(i) + gm.position.z));
    const opening = f.rect(GATE.x0 + 0.05, 10.3, GATE.x1 - 0.05, 10.7), portal = f.rect(ENTRANCE.x0 - 0.6, 10.3, ENTRANCE.x1 + 0.6, 10.7);
    const sb = { x0: stow.min.x, x1: stow.max.x, z0: stow.min.z, z1: stow.max.z };
    expect(hits(sb, opening)).toBe(false); expect(hits(sb, portal)).toBe(false); expect(within(sb, lot)).toBe(true);
  });

  it('a larger lot: its wall on its edges, the back garden deeper, the street side as on the flagship', () => {
    const lot = { x0: 0, x1: 28, z0: 0, z1: 30 }, v = buildAlmadiesVilla(freshKit(), { lot });
    const at = (x: number, z: number) => v.colliders.some(c => c.h >= WALL_H - 0.01 && x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1);
    for (let t = 0.3; t < 27.8; t += 0.5) { expect(at(t, 0.1), `back ${t}`).toBe(true); }
    for (let t = 0.3; t < 29.8; t += 0.5) { expect(at(0.1, t), `west ${t}`).toBe(true); expect(at(27.9, t), `east ${t}`).toBe(true); }
    // the street side 11 m from the plan's origin, the house as far from the street as on the flagship
    const { frame } = lotFrame(lot); expect(frame.at).toEqual({ x: 14, z: 19 });
    expect(() => lotFrame({ x0: 0, x1: 20, z0: 0, z1: 22 })).toThrow(/22/);
    expect(MIN_LOT).toBe(22);
  });

  it('storeys, helipad, pool and palette change what they say', () => {
    const box = (o: THREE.Object3D) => new THREE.Box3().setFromObject(o);
    const two = box(villaFacadeFor({ storeys: 2, helipad: true, palette: {} })), three = box(villaFacadeFor({ storeys: 3, helipad: true, palette: {} })), one = box(villaFacadeFor({ storeys: 1, helipad: true, palette: {} }));
    expect(three.max.y - two.max.y).toBeCloseTo(STOREY, 3); expect(two.max.y - one.max.y).toBeCloseTo(STOREY, 3);
    expect(one.min.y).toBeCloseTo(two.min.y, 3);
    const v3 = buildAlmadiesVilla(freshKit(), { storeys: 3 }), heli = v3.group.getObjectByName('helicopter')!;
    expect(heli.position.y).toBeCloseTo(0.1 + 3 * STOREY, 6);
    const tris = (o: THREE.Object3D) => { let n = 0; o.traverse(x => { const m = x as THREE.Mesh; if (m.isMesh) n += m.geometry.attributes.position.count / 3; }); return n; };
    const noPad = villaFacadeFor({ storeys: 2, helipad: false, palette: {} }), pad = villaFacadeFor({ storeys: 2, helipad: true, palette: {} });
    expect(tris(pad) - tris(noPad)).toBeGreaterThan(100);
    expect(buildAlmadiesVilla(freshKit(), { helipad: false }).group.getObjectByName('helicopter')).toBeUndefined();
    const k1 = freshKit(), k2 = freshKit();
    buildAlmadiesVilla(k1, {}); buildAlmadiesVilla(k2, { pool: false });
    expect(k1.water.count).toBe(1); expect(k2.water.count).toBe(0);
    // the palette: the wall's colour, the façade's render
    const k3 = freshKit(); buildAlmadiesVilla(k3, { palette: { wall: 0xff0000, render: 0xe8d0b0 } });
    const geos = (k3.plain as unknown as { geos: THREE.BufferGeometry[] }).geos, red = geos.filter(g => { const c = g.attributes.color as THREE.BufferAttribute; return c.getX(0) === 1 && c.getY(0) === 0; });
    expect(red.length).toBeGreaterThan(5);
    const f = villaFacadeFor({ storeys: 2, helipad: true, palette: { render: 0xe8d0b0 } }).getObjectByName('villa-facade:render') as THREE.Mesh, f0 = pad.getObjectByName('villa-facade:render') as THREE.Mesh;
    expect((f.geometry.attributes.color as THREE.BufferAttribute).getZ(0)).toBeLessThan((f0.geometry.attributes.color as THREE.BufferAttribute).getZ(0));
    expect(FRONT_DOOR.x).toBe(-3);
  });
});
