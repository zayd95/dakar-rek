import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { animateGlbRig, glbVehicle, glbVehiclesWanted, rigOf, setGlbVehicles } from '../src/actors/glbVehicle';
import { buildCockpit } from '../src/actors/cockpit';
import { animateVehicle, vehicleSpec } from '../src/actors/vehicleKit';
import { carSpec } from '../src/transport/car';
import side from '../public/assets/vehicles/compacte.json';

/** A model with the node names the pipeline writes: axle_* (hub, front pair steers) > wheel_*. */
function fakeCar() {
  const g = new THREE.Group();
  for (const [id, x, z, steer] of [['fl', 0.76, 1.36, true], ['fr', -0.76, 1.36, true], ['rl', 0.76, -1.32, false], ['rr', -0.76, -1.32, false]] as const) {
    const axle = new THREE.Group(); axle.name = `axle_${id}`; axle.position.set(x, 0.31, z); axle.userData = { r: 0.31, steer };
    const wheel = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.62, 0.62)); wheel.name = `wheel_${id}`; axle.add(wheel); g.add(axle);
  }
  return g;
}

describe('GLB vehicle bodies: the test link', () => {
  it('the generated body is used by default; ?vehicleModel=kit forces the procedural car on local and preview hosts only', () => {
    expect(glbVehiclesWanted('localhost', '?debug')).toBe(true);
    expect(glbVehiclesWanted('localhost', '?debug&vehicleModel=glb')).toBe(true);
    expect(glbVehiclesWanted('localhost', '?vehicleModel=kit')).toBe(false);
    expect(glbVehiclesWanted('127.0.0.1', '?vehicleModel=kit')).toBe(false);
    expect(glbVehiclesWanted('feature-x-dakar-rek.acct.workers.dev', '?vehicleModel=kit')).toBe(false);
    expect(glbVehiclesWanted('dakar-rek.example.com', '?vehicleModel=kit')).toBe(true);        // the production host never honours the test link
  });
  it('builds nothing when the flag is off, nor when the model is not loaded: the procedural kit model stays', () => {
    setGlbVehicles(false);
    const kit = vehicleSpec('sedan', { seed: 14, driver: false, passengers: false });
    expect(glbVehicle('compacte', kit)).toBeNull();
    setGlbVehicles(true);
    expect(glbVehicle('compacte', kit)).toBeNull();                                                 // flag on, nothing preloaded
    setGlbVehicles(false);
    expect(carSpec().cameras.map(c => c.id)).toEqual(['chase', 'volant', 'haut']);                // « Au volant » is never dropped, whatever the body
  });
});

describe('GLB vehicle bodies: separate wheels', () => {
  it('finds the four wheels and steers only the front pair', () => {
    const rig = rigOf(fakeCar(), 0.6);
    expect(rig.wheels).toHaveLength(4);
    expect(rig.wheels.filter(w => w.steer).map(w => w.spin.name).sort()).toEqual(['wheel_fl', 'wheel_fr']);
  });
  it('spins with the distance driven (reverse spins back) and turns within the steering limit', () => {
    const rig = rigOf(fakeCar(), 0.6);
    animateGlbRig(rig, 6, 0.3, 0.5);
    for (const w of rig.wheels) expect(w.spin.rotation.x).toBeCloseTo(((6 * 0.5) / 0.31) % (Math.PI * 2));
    expect(rig.wheels.find(w => w.spin.name === 'wheel_fl')!.steer!.rotation.y).toBeCloseTo(0.3);
    animateGlbRig(rig, 6, 5, 0.1);
    expect(rig.wheels.find(w => w.spin.name === 'wheel_fr')!.steer!.rotation.y).toBeCloseTo(0.6);   // clamped
    for (const w of rig.wheels.filter(w => !w.steer)) expect(w.spin.parent!.rotation.y).toBe(0);     // the rear axles never turn
    const before = rig.wheels[0].spin.rotation.x;
    animateGlbRig(rig, -2, 0, 0.1);
    expect(rig.wheels[0].spin.rotation.x).toBeLessThan(before);
  });
  it('is what animateVehicle drives when a group carries a rig (the owned vehicle calls it every frame)', () => {
    const g = fakeCar(), kit = vehicleSpec('sedan', { seed: 14, driver: false, passengers: false });
    g.userData.vehicleSpec = kit; g.userData.glbRig = rigOf(g, kit.drive.steerMax);
    animateVehicle(g, 8, 0.4, 0.25);
    expect((g.getObjectByName('wheel_rl') as THREE.Object3D).rotation.x).toBeCloseTo(((8 * 0.25) / 0.31) % (Math.PI * 2));
    expect((g.getObjectByName('axle_fl') as THREE.Object3D).rotation.y).toBeCloseTo(0.4);
  });
});

describe('the modern sedan\'s generated body against the kit it fits', () => {
  const kit = vehicleSpec('sedan', { seed: side.kit.seed, driver: false, passengers: false });
  it('has the kit\'s length, body width (mirrors apart) and height, with four of its own wheels on the kit\'s axles, tyres on the ground, steering at the front', () => {
    expect(side.length).toBeCloseTo(kit.length, 1); expect(side.bodyWidth).toBeCloseTo(kit.width, 1); expect(Math.abs(side.height - kit.height)).toBeLessThan(0.06);
    expect(side.wheelFit).toBe('own'); expect(side.wheels).toHaveLength(4);
    for (const w of kit.wheels) {
      const m = side.wheels.find(x => Math.sign(x.x) === Math.sign(w.x) && Math.sign(x.z) === Math.sign(w.z))!;
      expect(Math.abs(m.x - w.x)).toBeLessThan(0.12); expect(Math.abs(m.z - w.z)).toBeLessThan(0.12);
      expect(m.r).toBeGreaterThan(0.25); expect(m.r).toBeLessThan(0.42); expect(Math.abs(m.bottom)).toBeLessThan(0.02); expect(m.steer).toBe(w.steer);
    }
  });
  it('passed every check of the pipeline, is the owner\'s generated car (not a stand-in), with the budget the phone can carry', () => {
    expect(side.checks.every(c => c.ok)).toBe(true);
    expect(side.standIn).toBe(false);
    expect(side.provenance.name).toMatch(/Meshy/); expect(side.provenance.licence).toMatch(/unbranded/);
    expect(side.drawCalls).toBeLessThanOrEqual(5); expect(side.tris).toBeLessThanOrEqual(8000); expect(side.bytes).toBeLessThan(1300 * 1024);
    expect(side.textures.every(t => Math.max(...t.size) <= 1024)).toBe(true);
  });
});

describe('the shared cockpit of a solid-shell body', () => {
  const kit = vehicleSpec('sedan', { seed: 14, driver: false, passengers: false });
  it('is light (two meshes, one shared material, under 500 triangles), hidden until the inside view, inside the car\'s envelope', () => {
    const ck = buildCockpit(kit);
    expect(ck.group.visible).toBe(false);
    const meshes: THREE.Mesh[] = []; ck.group.traverse(o => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
    expect(meshes).toHaveLength(2); expect(new Set(meshes.map(m => m.material)).size).toBe(1);
    const tris = meshes.reduce((n, m) => n + m.geometry.index!.count / 3, 0);
    expect(tris).toBeLessThan(500);
    const b = new THREE.Box3().setFromObject(ck.group);
    expect(b.max.x).toBeLessThanOrEqual(kit.width / 2); expect(b.min.x).toBeGreaterThanOrEqual(-kit.width / 2);
    expect(b.max.y).toBeLessThanOrEqual(kit.height); expect(b.min.y).toBeGreaterThan(0.3);
    expect(b.max.z).toBeLessThan(kit.length / 2); expect(b.min.z).toBeGreaterThan(-kit.length / 2);
  });
  it('leaves the windscreen open: the header is a thin band well above the horizon, the headliner is not cut away by the camera\'s near plane', () => {
    const VFOV = 58, NEAR = 0.3, deg = (r: number) => (r * 180) / Math.PI;           // the game camera (src/main.ts)
    const ck = buildCockpit(kit), body = ck.group.getObjectByName('cockpit_body') as THREE.Mesh, [ex, ey, ez] = kit.cameras.driver.pos;
    const P = body.geometry.getAttribute('position'), above: THREE.Vector3[] = [];
    for (let i = 0; i < P.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(P, i); if (v.y > ey + 0.1 && v.z > ez + 0.3 && Math.abs(v.x - ex) < 0.5) above.push(v); }   // (the little mirror hangs lower, below the header)
    const lowest = Math.min(...above.map(v => deg(Math.atan2(v.y - ey, v.z - ez))));
    expect(lowest).toBeGreaterThan(8);                                                // what the driver looks through starts well above the horizon
    const liner = [] as THREE.Vector3[]; for (let i = 0; i < P.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(P, i); if (v.y > kit.height - 0.02 && v.y > ey) liner.push(v); }
    expect(liner.length).toBeGreaterThan(0);
    for (const v of liner) expect(deg(Math.atan2(v.y - ey, NEAR))).toBeGreaterThan(VFOV / 2 - 3);   // at most a sliver of the picture above the roof lining is cut by the near plane
  });
  it('puts the wheel where the kit puts the steering, in front of the driver\'s eye and below it, and turns it with the steering', () => {
    const ck = buildCockpit(kit), [sx, sy, sz] = kit.controls.steering, eye = kit.cameras.driver.pos;
    ck.group.updateMatrixWorld(true);
    const c = new THREE.Box3().setFromObject(ck.wheel).getCenter(new THREE.Vector3());
    expect(c.distanceTo(new THREE.Vector3(sx, sy, sz))).toBeLessThan(0.02);
    expect(sz - eye[2]).toBeGreaterThan(0.3); expect(sy).toBeLessThan(eye[1]);
    const rig = rigOf(fakeCar(), 0.6); rig.cockpitWheel = ck.wheel;
    animateGlbRig(rig, 5, 0.3, 0.1); expect(ck.wheel.rotation.z).toBeCloseTo(-0.9);
    animateGlbRig(rig, 5, -0.3, 0.1); expect(ck.wheel.rotation.z).toBeCloseTo(0.9);
  });
});
