import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * What the street's moving people carry or ride (one instanced mesh each, a draw call only while one is out): a bicycle
 * under a cyclist, a basin of goods on a peddler's head, a hand cart a vendor pushes. Low poly, flat colours; the white
 * parts take the instance colour (a frame's paint, the goods).
 */
export type PropKind = 'bike' | 'tray' | 'cart';

function parts(list: { w: number; h: number; d: number; x: number; y: number; z: number; c: number; rx?: number; rz?: number; cyl?: number }[]) {
  const geos = list.map(p => {
    const g = p.cyl ? new THREE.CylinderGeometry(p.cyl, p.cyl, p.d, 10) : new THREE.BoxGeometry(p.w, p.h, p.d);
    if (p.cyl) g.rotateZ(Math.PI / 2);                                          // a wheel: its axis across the machine (x)
    if (p.rx) g.rotateX(p.rx);
    if (p.rz) g.rotateZ(p.rz);
    g.translate(p.x, p.y, p.z);
    const n = g.attributes.position.count, c = new THREE.Color(p.c), col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g.index ? g.toNonIndexed() : g;
  });
  const m = mergeGeometries(geos, false)!;
  for (const g of geos) g.dispose();
  return m;
}
const W = 0xffffff, DARK = 0x1c1c1f, RUBBER = 0x2a2a2d;
/** A bicycle heading +z: two wheels, a diagonal frame, a saddle, handlebars. */
const bikeGeo = () => parts([
  { w: 0, h: 0, d: 0.05, cyl: 0.34, x: 0, y: 0.34, z: 0.52, c: RUBBER }, { w: 0, h: 0, d: 0.05, cyl: 0.34, x: 0, y: 0.34, z: -0.52, c: RUBBER },
  { w: 0.05, h: 0.05, d: 1.0, x: 0, y: 0.6, z: 0, c: W }, { w: 0.05, h: 0.55, d: 0.05, x: 0, y: 0.6, z: -0.3, c: W, rx: 0.15 },
  { w: 0.05, h: 0.6, d: 0.05, x: 0, y: 0.62, z: 0.46, c: W, rx: -0.3 }, { w: 0.05, h: 0.45, d: 0.05, x: 0, y: 0.38, z: 0.0, c: W, rx: 0.9 },
  { w: 0.14, h: 0.05, d: 0.26, x: 0, y: 0.9, z: -0.34, c: DARK }, { w: 0.5, h: 0.04, d: 0.04, x: 0, y: 0.98, z: 0.56, c: DARK },
  { w: 0.08, h: 0.06, d: 0.34, x: 0, y: 0.78, z: -0.52, c: W },                      // a carrier over the rear wheel
]);
/** A basin on a head with goods piled in it: its origin at the head's top. */
const trayGeo = () => parts([
  { w: 0, h: 0, d: 0.12, cyl: 0.36, x: 0, y: 0.06, z: 0, c: 0xb9b3a2, rz: Math.PI / 2 },
  { w: 0.26, h: 0.2, d: 0.26, x: -0.1, y: 0.22, z: 0.05, c: W }, { w: 0.24, h: 0.17, d: 0.24, x: 0.14, y: 0.2, z: -0.08, c: W },
  { w: 0.2, h: 0.15, d: 0.2, x: 0.02, y: 0.38, z: -0.02, c: W },
]);
/** A two-wheeled hand cart pushed from behind (its handles towards -z, the origin under the pusher's hands): a load on top. */
const cartGeo = () => parts([
  { w: 0, h: 0, d: 0.07, cyl: 0.3, x: 0.5, y: 0.3, z: 1.35, c: RUBBER }, { w: 0, h: 0, d: 0.07, cyl: 0.3, x: -0.5, y: 0.3, z: 1.35, c: RUBBER },
  { w: 1.1, h: 0.1, d: 1.3, x: 0, y: 0.58, z: 1.1, c: 0x7a5636 }, { w: 0.05, h: 0.05, d: 1.1, x: 0.4, y: 0.7, z: 0.3, c: 0x5a3f26 }, { w: 0.05, h: 0.05, d: 1.1, x: -0.4, y: 0.7, z: 0.3, c: 0x5a3f26 },
  { w: 0.9, h: 0.38, d: 0.7, x: 0, y: 0.82, z: 1.2, c: W }, { w: 0.5, h: 0.2, d: 0.4, x: 0.1, y: 1.2, z: 1.1, c: 0xefe9da },
]);

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _up = new THREE.Vector3(0, 1, 0), _c = new THREE.Color();
const PAINT = [0xc8443a, 0x3b78b4, 0x4f9a5a, 0xe0a24a, 0xd9d2bc, 0x7a4a8a, 0xe58a2f];

export class StreetProps {
  readonly group = new THREE.Group();
  private meshes: Record<PropKind, THREE.InstancedMesh>;
  private n: Record<PropKind, number> = { bike: 0, tray: 0, cart: 0 };
  private max: Record<PropKind, number>;
  constructor(max: Record<PropKind, number>, shadows = false) {
    this.max = max;
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const make = (k: PropKind, g: THREE.BufferGeometry) => {
      const m = new THREE.InstancedMesh(g, mat, Math.max(1, max[k]));
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.count = 0; m.frustumCulled = false; m.name = `street_prop_${k}`; m.castShadow = shadows;
      m.setColorAt(0, _c.set(0xffffff));
      this.group.add(m); return m;
    };
    this.meshes = { bike: make('bike', bikeGeo()), tray: make('tray', trayGeo()), cart: make('cart', cartGeo()) };
    this.group.name = 'street_props';
  }
  begin() { this.n.bike = this.n.tray = this.n.cart = 0; }
  /** One prop at (x, y, z) heading `yaw`; `look` picks its colours. */
  put(k: PropKind, x: number, y: number, z: number, yaw: number, look: number) {
    const i = this.n[k]; if (i >= this.max[k]) return;
    const m = this.meshes[k];
    _m.compose(_p.set(x, y, z), _q.setFromAxisAngle(_up, yaw), _s).toArray(m.instanceMatrix.array as Float32Array, i * 16);
    m.setColorAt(i, _c.set(k === 'bike' ? PAINT[look % PAINT.length] : [0xe58a2f, 0xe8c24a, 0x6aa84f, 0xb8372b, 0xefe9da][look % 5]));
    this.n[k] = i + 1;
  }
  end() {
    for (const k of ['bike', 'tray', 'cart'] as const) {
      const m = this.meshes[k]; m.count = this.n[k];
      if (m.count) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    }
  }
  drawCalls() { return (['bike', 'tray', 'cart'] as const).filter(k => this.n[k] > 0).length; }
  dispose() { for (const m of Object.values(this.meshes)) { m.geometry.dispose(); m.dispose(); } (Object.values(this.meshes)[0].material as THREE.Material).dispose(); }
}
