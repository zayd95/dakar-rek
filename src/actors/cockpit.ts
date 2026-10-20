import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { VehicleSpec } from './vehicleKit';

/**
 * A shared, lightweight cockpit for a car whose body is a solid shell (a generated or scanned model has its dashboard and seats painted
 * on its skin: from the driver's eye the shell is culled away and nothing but the street is left). It is drawn only in the « Au volant »
 * view, from the kit spec of the car it replaces: the dashboard and its hood, a steering wheel that turns with the steering, the
 * windscreen pillars and header, the headliner, the door tops and a mirror. Two meshes, one shared vertex-coloured Lambert material,
 * no texture: about 400 triangles, 2 draw calls, and none at all outside that view (it is hidden, not drawn).
 * The player's own body is already hidden in an inside view (OwnedVehicleModule.camera).
 */
export interface Cockpit { group: THREE.Group; wheel: THREE.Object3D }

const paint = (g: THREE.BufferGeometry, color: number) => {
  const c = new THREE.Color(color), n = g.getAttribute('position').count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  g.deleteAttribute('uv');
  return g;
};
const box = (w: number, h: number, d: number, x: number, y: number, z: number, color: number, rx = 0, rz = 0) => {
  const g = new THREE.BoxGeometry(w, h, d); g.rotateX(rx); g.rotateZ(rz); g.translate(x, y, z); return paint(g, color);
};
let material: THREE.MeshLambertMaterial | null = null;
const shared = () => material ??= Object.assign(new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x2c2d31 }), { userData: { shared: true } });

export function buildCockpit(spec: VehicleSpec): Cockpit {
  const [sx, sy, sz] = spec.controls.steering;
  const hw = spec.width / 2 - 0.1, top = spec.height, trim = 0x5a5b62, dash = 0x5a5b62, liner = 0x8c8b87, dark = 0x2a2b2f, ez = spec.cameras.driver.pos[2];
  const geos: THREE.BufferGeometry[] = [];
  // dashboard across the car, a hood over the instruments in front of the driver, a glove-box side
  geos.push(box(2 * hw, 0.12, 0.45, 0, sy - 0.2, sz + 0.14, dash), box(0.56, 0.08, 0.24, sx, sy - 0.1, sz + 0.1, trim), box(0.46, 0.04, 0.02, sx, sy - 0.12, sz - 0.02, 0x0c0d0f));
  // The roof structure is what the driver looks through, so it is thin and out of the way: a slim header about 0.75 m ahead of the eye, slim
  // leaning pillars, and a headliner right up under the roof. The 0.3 m near plane cuts anything closer than that (a headliner lower than
  // the roof lets the sky show above it), so the headliner's underside sits within a hair of the roof line.
  const hz = ez + 0.75, base = sy - 0.05, tipY = top - 0.03, baseZ = sz + 0.42, up = tipY - base, back = baseZ - hz, len = Math.hypot(up, back), lean = -Math.atan2(back, up);
  for (const s of [-1, 1]) geos.push(box(0.05, len, 0.05, s * (hw - 0.02), base + up / 2, baseZ - back / 2, trim, lean));
  geos.push(box(2 * hw, 0.04, 0.08, 0, top - 0.03, hz, 0x92939a), box(0.12, 0.03, 0.03, 0, top - 0.065, hz + 0.03, 0x3a3b40));
  // headliner, door tops and cards
  const roofLining = box(2 * hw, 0.01, 1.9, 0, top - 0.009, hz - 0.95, liner), ln = roofLining.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < ln.count; i++) ln.setXYZ(i, 0, 1, 0);                  // lit as if facing the sky: a face looking down gets only the ground's brown, which reads as a dark lid
  geos.push(roofLining);
  for (const s of [-1, 1]) geos.push(box(0.06, 0.09, 1.5, s * hw, sy - 0.05, 0.05, trim), box(0.05, 0.45, 1.5, s * hw, sy - 0.32, 0.05, dash));
  const body = new THREE.Mesh(mergeGeometries(geos, false)!, shared()); body.name = 'cockpit_body';
  // the steering wheel: a rim, a hub and two spokes, tilted towards the driver; `spin` turns about the column
  const rim = new THREE.TorusGeometry(0.16, 0.016, 6, 20), hub = new THREE.CylinderGeometry(0.045, 0.045, 0.03, 10).rotateX(Math.PI / 2);
  const bar = new THREE.BoxGeometry(0.29, 0.025, 0.02), stem = new THREE.BoxGeometry(0.025, 0.145, 0.02).translate(0, -0.0725, 0);   // a T: its turn shows
  const wheelGeo = mergeGeometries([paint(rim, dark), paint(hub, trim), paint(bar, dark), paint(stem, dark)], false)!;
  const tilt = new THREE.Group(); tilt.position.set(sx, sy, sz); tilt.rotation.x = -0.5;
  const spin = new THREE.Mesh(wheelGeo, shared()); spin.name = 'cockpit_wheel'; tilt.add(spin);
  const group = new THREE.Group(); group.name = 'cockpit'; group.add(body, tilt); group.visible = false;
  return { group, wheel: spin };
}
