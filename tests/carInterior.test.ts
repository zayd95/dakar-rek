import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CarInterior, cabinOf, WHEEL_LOCK } from '../src/transport/carInterior';
import { carModelDims, vehicleSpec, type CarModelId } from '../src/actors/vehicleKit';
import { PassengerCamera } from '../src/transport/camera';

/** The player's cars at the wheel: the four with a body of their own, the Berline moderne (the kit saloon), the berline neuve (the kit luxury saloon). */
const CARS: [string, ReturnType<typeof vehicleSpec>, CarModelId | null][] = [
  ['Teranga', vehicleSpec('sedan', { seed: 1000, driver: false, passengers: false, model: 'teranga' }), 'teranga'],
  ['Rafet', vehicleSpec('sedan', { seed: 1000, driver: false, passengers: false, model: 'rafet' }), 'rafet'],
  ['Lamane Sport', vehicleSpec('suv', { seed: 1000, driver: false, passengers: false, model: 'lamane' }), 'lamane'],
  ['Gaïndé', vehicleSpec('suv', { seed: 1000, driver: false, passengers: false, model: 'gainde' }), 'gainde'],
  ['Berline moderne', vehicleSpec('sedan', { seed: 14, driver: false, passengers: false }), null],
  ['berline neuve', vehicleSpec('luxury', { seed: 3, driver: false, passengers: false }), null],
];
const deg = (r: number) => (r * 180) / Math.PI;
const meshes = (g: THREE.Object3D) => { const out: THREE.Mesh[] = []; g.traverse(o => { if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh); }); return out; };

describe('the car interior at the wheel', () => {
  it('reads each car\'s own proportions: the model\'s windscreen, roof and pillars, the kit\'s driver seat', () => {
    for (const [, k, model] of CARS) {
      const c = cabinOf(k), drv = k.seats.find(s => s.kind === 'driver')!;
      expect(c.W).toBeCloseTo(k.width); expect(c.roof).toBeCloseTo(k.height); expect(c.L).toBeCloseTo(k.length);
      expect(c.driverX).toBeCloseTo(drv.x); expect(c.seatTop).toBeCloseTo(drv.top); expect(c.frontZ).toBeCloseTo(drv.z);
      if (model) { const d = carModelDims(model); expect(c.zRf).toBeCloseTo(d.zRf); expect(c.zWs).toBeCloseTo(d.zWs); expect(c.cowl).toBeCloseTo(d.cowl); expect(c.zB).toBeCloseTo(d.zB); }
      expect(c.zRf).toBeLessThan(c.zWs); expect(c.zRr).toBeLessThan(c.zB);
    }
  });

  it('is light: three meshes, the shell and the wheel on one shared material, under 2 500 triangles; hidden until the view is taken', () => {
    const a = new CarInterior(cabinOf(CARS[0][1]), 'city'), b = new CarInterior(cabinOf(CARS[2][1]), 'premium');
    for (const ir of [a, b]) {
      expect(ir.group.visible).toBe(false);
      const ms = meshes(ir.group);
      expect(ms).toHaveLength(3);
      expect(ms[0].material).toBe(ms[1].material);
      expect(ir.tris).toBeLessThan(2500);
      expect(ms.every(m => !m.castShadow && (m.material as THREE.Material).depthTest !== false)).toBe(true);   // depth-tested like the world, never drawn over it
    }
    expect(meshes(a.group)[0].material).toBe(meshes(b.group)[0].material);                                     // every car's interior shares it
  });

  it('stays inside the car\'s body, and the driver\'s eye has head room, the wheel at arm\'s length below it, the B pillar behind', () => {
    for (const [name, k] of CARS) {
      const c = cabinOf(k), ir = new CarInterior(c, 'city'); ir.group.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(ir.group);
      expect(b.max.x, name).toBeLessThanOrEqual(k.width / 2); expect(b.min.x, name).toBeGreaterThanOrEqual(-k.width / 2);
      expect(b.max.y, name).toBeLessThanOrEqual(k.height); expect(b.min.y, name).toBeGreaterThan(0.2);
      expect(b.max.z, name).toBeLessThan(k.length / 2); expect(b.min.z, name).toBeGreaterThan(-k.length / 2);
      const e = ir.eye, wc = ir.wheelAt;
      expect(c.roof - 0.04 - e.y, name).toBeGreaterThan(0.12);
      expect(e.z, name).toBeGreaterThan(c.zB + 0.05);
      const reach = e.distanceTo(wc); expect(reach, name).toBeGreaterThan(0.42); expect(reach, name).toBeLessThan(0.6);
      expect(wc.y, name).toBeLessThan(e.y - 0.2);
    }
  });

  it('leaves the windscreen open: straight ahead, from just under the horizon to well above it (the header frames the top), the eye sees the street', () => {
    for (const [name, k] of CARS) {
      const ir = new CarInterior(cabinOf(k), 'premium'); ir.setPaint(0xffffff); ir.group.updateMatrixWorld(true);
      const rc = new THREE.Raycaster(), dir = new THREE.Vector3(), hits: string[] = [];
      for (let az = -15; az <= 15; az += 5) for (let el = -8; el <= 16; el += 3) {
        const a = THREE.MathUtils.degToRad(az), e = THREE.MathUtils.degToRad(el);
        dir.set(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e));
        rc.set(ir.eye, dir); rc.near = 0; rc.far = 5;
        if (rc.intersectObject(ir.group, true).length) hits.push(`${az},${el}`);
      }
      expect(hits, name).toEqual([]);
    }
  });

  it('shows the cluster through the top of the wheel: from the eye, its middle is the first thing met', () => {
    for (const [name, k] of CARS) {
      const ir = new CarInterior(cabinOf(k), 'city'); ir.group.updateMatrixWorld(true);
      const screens = ir.group.getObjectByName('car_interior_screens') as THREE.Mesh, P = screens.geometry.getAttribute('position');
      const mid = new THREE.Vector3(); for (let i = 0; i < 6; i++) mid.add(new THREE.Vector3().fromBufferAttribute(P, i)); mid.divideScalar(6);   // the cluster's two triangles
      const rc = new THREE.Raycaster(ir.eye, mid.clone().sub(ir.eye).normalize(), 0, 3);
      const first = rc.intersectObject(ir.group, true)[0];
      expect(first?.object.name, name).toBe('car_interior_screens');
      expect(deg(Math.atan2(ir.eye.y - mid.y, mid.z - ir.eye.z)), name).toBeLessThan(30);       // not so low that it hides under the controls
    }
  });

  it('turns the wheel with the steering, about its own centre', () => {
    const ir = new CarInterior(cabinOf(CARS[1][1]), 'city'), w = ir.group.getObjectByName('car_interior_wheel')!;
    ir.steer(1); expect(w.rotation.z).toBeCloseTo(WHEEL_LOCK);
    ir.steer(-0.5); expect(w.rotation.z).toBeCloseTo(-WHEEL_LOCK / 2);
    ir.group.updateMatrixWorld(true);
    expect(w.getWorldPosition(new THREE.Vector3()).distanceTo(ir.wheelAt)).toBeLessThan(1e-6);
  });

  it('a bonnet in the paint only for a body that is not drawn from inside; folded away (still one draw) otherwise', () => {
    const ir = new CarInterior(cabinOf(CARS[4][1]), 'city'), shell = ir.group.getObjectByName('car_interior_shell') as THREE.Mesh;
    const front = () => { shell.geometry.computeBoundingBox(); return shell.geometry.boundingBox!.max.z; };
    ir.setPaint(0xa9adb2); const withBonnet = front();
    expect(withBonnet).toBeGreaterThan(cabinOf(CARS[4][1]).zWs + 0.5);
    ir.setPaint(null); expect(front()).toBeLessThan(withBonnet - 0.5);
    ir.setPaint(0x1f3f78); expect(front()).toBeCloseTo(withBonnet);
  });

  it('redraws its screens at most four times a second', () => {
    const ir = new CarInterior(cabinOf(CARS[0][1]), 'city'); let n = 0;
    for (let i = 0; i < 60; i++) if (ir.due(1 / 30)) n++;                                       // two seconds at 30 frames a second
    expect(n).toBeLessThanOrEqual(9);
  });
});

describe('the seat camera', () => {
  const frame = () => { const g = new THREE.Group(), body = new THREE.Group(); g.add(body); g.position.set(10, 0.08, -4); g.rotation.y = 0.7; body.position.y = 0.02; body.rotation.x = 0.02; return body; };
  it('sits at the eye in the car\'s frame and looks down the car\'s road; a drag turns the head, not the car', () => {
    const body = frame(), cam = new THREE.PerspectiveCamera(78, 390 / 844), pc = new PassengerCamera(), eye = new THREE.Vector3(0.36, 1.24, -0.22), pose = { x: 10, y: 0.08, z: -4, yaw: 0.7 };
    pc.begin(cam, pose);
    pc.seat(1 / 30, cam, body, eye, -0.1, { yaw: 0, pitch: 0 }, pose);
    body.updateMatrixWorld(true);
    expect(cam.position.distanceTo(eye.clone().applyMatrix4(body.matrixWorld))).toBeLessThan(1e-6);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion), carFwd = new THREE.Vector3(Math.sin(0.7), 0, Math.cos(0.7));
    expect(Math.atan2(fwd.x, fwd.z)).toBeCloseTo(0.7, 1); expect(fwd.y).toBeLessThan(0);
    expect(fwd.dot(carFwd)).toBeGreaterThan(0.98);
    pc.seat(1 / 30, cam, body, eye, -0.1, { yaw: 0.8, pitch: 0 }, pose);                            // dragged: the head turns to the left (+x of the car)
    const turned = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    expect(Math.atan2(turned.x, turned.z) - 0.7).toBeCloseTo(0.8, 1);
    expect(cam.position.distanceTo(eye.clone().applyMatrix4(body.matrixWorld))).toBeLessThan(1e-6);   // the eye did not move
    for (let i = 0; i < 200; i++) pc.seat(1 / 30, cam, body, eye, -0.1, { yaw: 0, pitch: 0 }, pose);   // left alone, it comes back to the road
    expect(Math.abs(pc.look.yaw)).toBeLessThan(0.05);
    pc.seat(1 / 30, cam, body, eye, -0.1, { yaw: 9, pitch: -9 }, pose);
    expect(pc.look.yaw).toBeLessThanOrEqual(1.9); expect(pc.look.pitch).toBeLessThanOrEqual(0.6);
  });
});
