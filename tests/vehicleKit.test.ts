import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { animateVehicle, buildVehicle, vehicleMaterials, vehicleSpec, vehicleSeats, vehicleCamera, worldYaw, VEHICLE_KINDS, type VehicleKind } from '../src/actors/vehicleKit';

describe('vehicle animation', () => {
  const body = (g: THREE.Object3D) => (g.children.find(c => (c as THREE.LOD).isLOD) as THREE.LOD).levels[0].object.getObjectByName('body') as THREE.Mesh;
  const modes = (m: THREE.Mesh) => { const a = m.geometry.getAttribute('wheel'); const set = new Set<number>(); for (let i = 0; i < a.count; i++) set.add(a.getW(i)); return set; };
  it('tags the wheels of every body geometry (steered ones apart) and leaves the far model at rest', () => {
    for (const kind of VEHICLE_KINDS) {
      const v = buildVehicle(kind, { seed: 2 });
      const m = modes(body(v.group));
      expect(m.has(0)).toBe(true);
      if (kind === 'moto') { expect(m.has(1)).toBe(true); expect(m.has(3)).toBe(true); expect(m.has(4)).toBe(true); }
      else { expect(m.has(1)).toBe(true); expect(m.has(2)).toBe(true); }
      const far = (v.lod!.levels[1].object as THREE.Mesh).geometry.getAttribute('wheel');
      expect(far).toBeDefined(); for (let i = 0; i < far.count; i++) expect(far.getW(i)).toBe(0);
      expect(v.spec.drive.wheelRadius).toBe(v.spec.wheels[0].r);
    }
  });
  it('spins the wheels with the distance travelled and steers within the limit, on the near model only', () => {
    const v = buildVehicle('taxi', { seed: 3 }), m = body(v.group);
    expect(m.material).toBe(vehicleMaterials().body);
    animateVehicle(v.group, 6, 2, 0.5);
    expect(m.material).not.toBe(vehicleMaterials().body);                   // its own copy carries the angles…
    const mat = m.material as THREE.MeshLambertMaterial, base = vehicleMaterials().body;
    expect(mat.map).toBe(base.map); expect(mat.customProgramCacheKey()).toBe(base.customProgramCacheKey());   // …same textures, same program
    const u = mat.userData.anim;
    expect(u.uSpin.value).toBeCloseTo((6 * 0.5) / v.spec.drive.wheelRadius % (Math.PI * 2));
    expect(u.uSteer.value).toBeCloseTo(v.spec.drive.steerMax);
    animateVehicle(v.group, 6, -0.1, 0.5);
    expect(u.uSteer.value).toBeCloseTo(-0.1);
    expect(v.group.rotation.z).toBe(0);                                     // cars do not lean
    expect(meshes(v.group).length).toBe(4);                                 // no extra mesh: same draw calls
  });
  it('leans a motorbike into the turn and turns its front end about the fork', () => {
    const v = buildVehicle('moto', { seed: 1 }), lod = v.lod!;
    for (let k = 0; k < 40; k++) animateVehicle(v.group, 8, 0.4, 0.05);      // turning left
    expect(lod.rotation.z).toBeLessThan(-0.2); expect(lod.rotation.z).toBeGreaterThanOrEqual(-v.spec.drive.lean - 1e-6);   // top towards +x
    for (let k = 0; k < 60; k++) animateVehicle(v.group, 8, 0, 0.05);
    expect(Math.abs(lod.rotation.z)).toBeLessThan(0.01);                    // back upright
    const u = (body(v.group).material as THREE.MeshLambertMaterial).userData.anim;
    expect(u.uAxis.value.length()).toBeCloseTo(1); expect(u.uAxis.value.y).toBeGreaterThan(0.8); expect(u.uAxis.value.z).toBeLessThan(0);   // fork raked back
  });
  it('compiles the wheel hook into the shared material', () => {
    const shader = { uniforms: {} as Record<string, unknown>, vertexShader: '#include <beginnormal_vertex>\n#include <begin_vertex>', fragmentShader: '' };
    vehicleMaterials().body.onBeforeCompile(shader as never, undefined as never);
    expect(shader.vertexShader).toContain('attribute vec4 wheel');
    expect(shader.vertexShader).toContain('transformed = kitAnim(transformed, 1.0)');
    expect(shader.vertexShader).toContain('objectNormal = kitAnim(objectNormal, 0.0)');
    expect(Object.keys(shader.uniforms)).toEqual(['uSpin', 'uSteer', 'uPivot', 'uAxis']);
  });
});
import { sitOriginY } from '../src/interact/seats';
import { placeParked, PARKED_COUNT, PARK_OFFSET } from '../src/game/parkedVehicles';
import type { HubWorld } from '../src/world/types';

describe('parked vehicles', () => {
  const fakeWorld = () => {
    const edges = [];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 5; j++) { edges.push({ ax: -120 + i * 60, az: -120 + j * 60, bx: -60 + i * 60, bz: -120 + j * 60 }); edges.push({ ax: -120 + j * 60, az: -120 + i * 60, bx: -120 + j * 60, bz: -60 + i * 60 }); }
    return { id: 'plateau', edges, colliders: [{ x0: -50, z0: -50, x1: -10, z1: -10, h: 9 }], interactables: [], rapides: [], seats: [], bounds: { x0: -127, x1: 127, z0: -127, z1: 127 }, spawn: { x: 0, z: 0, yaw: 0 } } as unknown as HubWorld;
  };
  it('follows the quality level, stays on the kerb lane, never overlaps and adds colliders', () => {
    expect(PARKED_COUNT.low).toBe(0);
    expect(PARKED_COUNT.high).toBeGreaterThan(PARKED_COUNT.medium);
    const w = fakeWorld(), before = w.colliders.length;
    const g = placeParked(w, PARKED_COUNT.high);
    expect(g.children.length).toBeGreaterThanOrEqual(PARKED_COUNT.high);
    expect(w.colliders.length).toBeGreaterThan(before);
    const added = w.colliders.slice(before);
    for (let i = 0; i < added.length; i++) for (let j = i + 1; j < added.length; j++) {
      const a = added[i], b = added[j];
      expect(a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0).toBe(false);
    }
    for (const v of g.children) {
      // every parked vehicle stands PARK_OFFSET (± 0.3 m for motorbikes) from a road centre line
      const lx = ((v.position.x + 120) % 60 + 60) % 60, lz = ((v.position.z + 120) % 60 + 60) % 60;
      const off = Math.min(Math.abs(lx - PARK_OFFSET), Math.abs(60 - lx - PARK_OFFSET), Math.abs(lz - PARK_OFFSET), Math.abs(60 - lz - PARK_OFFSET));
      expect(off).toBeLessThan(0.5);
      expect(v.userData.vehicleSpec.seats.length).toBeGreaterThan(0);
    }
    expect(placeParked(fakeWorld(), 0).children).toHaveLength(0);
    const key = () => placeParked(fakeWorld(), 5).children.map(v => v.position.toArray().map(n => n.toFixed(2)).join());
    expect(key()).toEqual(key());                                     // same hub, same parked cars
  });
});

const meshes = (o: THREE.Object3D) => { const out: THREE.Mesh[] = []; o.traverse(x => { if ((x as THREE.Mesh).isMesh) out.push(x as THREE.Mesh); }); return out; };
const WHEELS: Record<VehicleKind, number> = { carRapide: 4, bus: 4, taxi: 4, moto: 2, sedan: 4, suv: 4, luxury: 4, pickup: 4, truck: 6 };
/** Near-model triangle budget per kind (merged, one opaque draw call). */
const TRIS: Record<VehicleKind, number> = { carRapide: 3600, bus: 4200, taxi: 1600, moto: 1100, sedan: 1600, suv: 1700, luxury: 1700, pickup: 1700, truck: 2600 };

describe('vehicle kit', () => {
  for (const kind of VEHICLE_KINDS) {
    describe(kind, () => {
      const seeds = [1, 2, 3, 4, 5, 6];
      it('has sane dimensions, wheels and exactly one driver seat', () => {
        for (const seed of seeds) {
          const s = vehicleSpec(kind, { seed });
          expect(s.length).toBeGreaterThan(kind === 'moto' ? 1.5 : 3.5);
          expect(s.width).toBeGreaterThan(0.5); expect(s.height).toBeGreaterThan(1);
          expect(s.wheels).toHaveLength(WHEELS[kind]);
          for (const w of s.wheels) { expect(Math.abs(w.y - w.r)).toBeLessThan(0.01); expect(Math.abs(w.z)).toBeLessThan(s.length / 2); expect(Math.abs(w.x)).toBeLessThanOrEqual(s.width / 2); }
          expect(s.wheels.some(w => w.steer)).toBe(true);
          expect(s.seats.filter(x => x.kind === 'driver')).toHaveLength(1);
        }
      });
      it('keeps every seat inside the body, above the floor and reachable through a door', () => {
        const s = vehicleSpec(kind, { seed: 3 });
        const doorIds = new Set(s.doors.map(d => d.id));
        expect(new Set(s.seats.map(x => x.id)).size).toBe(s.seats.length);
        for (const seat of s.seats) {
          expect(Math.abs(seat.x)).toBeLessThan(s.width / 2);
          expect(Math.abs(seat.z)).toBeLessThan(s.length / 2);
          expect(seat.top).toBeGreaterThan(0.4); expect(seat.top).toBeLessThan(s.height - 0.3);
          expect(sitOriginY(seat)).toBeGreaterThan(-0.2);
          expect(doorIds.has(seat.door)).toBe(true);
          expect(s.doors.find(d => d.id === seat.door)!.seats).toContain(seat.id);
        }
        for (const d of s.doors) {
          expect(d.board[1]).toBe(0);
          // boarding point stands outside the footprint
          expect(Math.abs(d.board[0]) > s.width / 2 || Math.abs(d.board[2]) > s.length / 2).toBe(true);
        }
      });
      it('gives camera, lamp and control anchors', () => {
        const s = vehicleSpec(kind, { seed: 2 });
        for (const a of [s.cameras.chase, s.cameras.driver, s.cameras.passenger, s.cameras.side]) { expect(a.pos).toHaveLength(3); expect(a.look).toHaveLength(3); }
        expect(s.cameras.chase.pos[2]).toBeLessThan(-s.length / 2);
        expect(s.lights.head.length).toBeGreaterThan(0); expect(s.lights.tail.length).toBeGreaterThan(0);
        for (const h of s.lights.head) expect(h[2]).toBeGreaterThan(0);
        for (const t of s.lights.tail) expect(t[2]).toBeLessThan(0);
        const drv = s.seats.find(x => x.kind === 'driver')!;
        expect(s.controls.steering[2]).toBeGreaterThan(drv.z);           // the wheel / handlebar is in front of the driver
        expect(Math.abs(s.controls.grips[0][0] - s.controls.grips[1][0])).toBeGreaterThan(0.2);
      });
      it('fits the draw-call and triangle budget (near: 1 opaque + glass + night beam; far: 1)', () => {
        for (const seed of seeds) {
          const v = buildVehicle(kind, { seed });
          expect(v.lod).not.toBeNull();
          const near = meshes(v.lod!.levels[0].object), far = meshes(v.lod!.levels[1].object);
          expect(near.length).toBeLessThanOrEqual(3);
          expect(far).toHaveLength(1);
          expect(v.spec.budget.near.tris).toBeLessThan(TRIS[kind]);
          expect(v.spec.budget.far.tris).toBeLessThan(260);
          expect(v.spec.budget.far.tris).toBeLessThan(v.spec.budget.near.tris / 3);
          for (const m of [...near, ...far]) expect(m.userData.shared).toBe(true);
          expect(v.group.userData.vehicleSpec).toBe(v.spec);
        }
      });
    });
  }

  it('shares three materials across the whole fleet', () => {
    const mats = new Set<THREE.Material>();
    for (const kind of VEHICLE_KINDS) for (const seed of [1, 9]) for (const m of meshes(buildVehicle(kind, { seed }).group)) mats.add(m.material as THREE.Material);
    expect(mats.size).toBe(3);
  });

  it('is reproducible from a seed and varies between seeds', () => {
    expect(vehicleSpec('sedan', { seed: 42 }).colors).toEqual(vehicleSpec('sedan', { seed: 42 }).colors);
    const colours = new Set(Array.from({ length: 24 }, (_, i) => vehicleSpec('sedan', { seed: i }).colors.body));
    expect(colours.size).toBeGreaterThan(3);
    const liveries = new Set(Array.from({ length: 24 }, (_, i) => vehicleSpec('carRapide', { seed: i }).variant));
    expect(liveries.size).toBe(3);
  });

  it('puts the car rapide apprentice on the rear step, behind the open rear doorway', () => {
    const s = vehicleSpec('carRapide', { seed: 1 });
    const rear = s.doors.find(d => d.side === 'rear')!;
    expect(rear.open).toBe(true);
    expect(s.step!.riding.z).toBeLessThan(-s.length / 2 + 0.3);
    expect(Math.abs(s.step!.riding.x - rear.x)).toBeLessThan(rear.width / 2);
    expect(s.cameras.step).toBeDefined();
  });

  it('exposes the moto handlebar for a drive mode', () => {
    const s = vehicleSpec('moto', { seed: 5 });
    expect(s.seats.map(x => x.kind)).toEqual(['driver', 'passenger']);
    expect(s.controls.grips[0][1]).toBeGreaterThan(s.seats[0].top);
    expect(s.width).toBeLessThan(1);
  });

  it('places seats in the world with the vehicle transform', () => {
    const v = buildVehicle('taxi', { seed: 4 });
    v.group.position.set(10, 0.08, -5); v.group.rotation.y = Math.PI / 2; v.group.updateMatrixWorld(true);
    expect(worldYaw(v.group)).toBeCloseTo(Math.PI / 2);
    const seats = vehicleSeats(v.group, v.spec, 'taxi:1');
    const drv = seats.find(s => s.id === 'taxi:1:driver')!, local = v.spec.seats.find(s => s.kind === 'driver')!;
    expect(drv.kind).toBe('vehicle'); expect(drv.space).toBe('taxi:1');
    expect(drv.x).toBeCloseTo(10 + local.z); expect(drv.z).toBeCloseTo(-5 - local.x); expect(drv.top).toBeCloseTo(0.08 + local.top);
    expect(drv.yaw).toBeCloseTo(Math.PI / 2);
    const cam = vehicleCamera(v.group, v.spec.cameras.chase);
    expect(cam.pos.x).toBeLessThan(10);                               // behind a car facing +x
  });

  it('honours passengers: false and driver: false (no baked people)', () => {
    const full = buildVehicle('carRapide', { seed: 8 }).spec.budget.near.tris;
    const empty = buildVehicle('carRapide', { seed: 8, passengers: false, driver: false }).spec.budget.near.tris;
    expect(empty).toBeLessThan(full);
    const parked = buildVehicle('moto', { seed: 8, driver: false }).spec.budget.near.tris;
    expect(parked).toBeLessThan(buildVehicle('moto', { seed: 8 }).spec.budget.near.tris);
  });
});
