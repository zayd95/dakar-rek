import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * LD2.0-D (docs/ld2/LD2_D.md): the light helicopter parked on the villa's roof, seen from the street and on the roof terrace. Our own design (no
 * maker's model, no brand): a rounded four-seat cabin under tinted glazing, a slim tail boom with a swept fin, a stabiliser and a two-blade tail
 * rotor, a two-blade main rotor 7.2 m across parked at an angle (so it reads from the street), tubular skids. Livery: pearl white over a deep navy
 * belly, a thin gold cheat line, the tail rotor's guard stripes, small green-yellow-red bands on the fin, red tips on the main blades.
 *
 * Built for a phone: two meshes in all (the painted body with its rotors and skids, and the glazing), each one merged geometry with vertex colours;
 * about 1 600 triangles. Nothing is animated (it is parked: no flight in this slice).
 * Local frame: the origin on the ground under the middle of its skids, the nose toward +z. `footprint` is measured on the geometry (w along x,
 * d along z, h up), `extent` gives its box in that frame. The tail sits shorter than on a long-range machine so the whole aircraft stands on a
 * roof pad 6.4 m across: the skids inside the pad's circle, the tail within 4.4 m of its centre.
 */
export interface HelicopterBuild {
  group: THREE.Group;
  footprint: { w: number; d: number; h: number };
  /** Its box in the local frame (m). */
  extent: { x0: number; x1: number; z0: number; z1: number; y1: number };
  /** Draw calls and triangles (the budget: ≤ 2 and ≤ 3 000). */
  cost: { draws: number; tris: number };
}

export const ROTOR_DIAMETER = 7.2;
/** The main rotor's blades are parked at this angle from the aircraft's lateral axis (rad). */
export const BLADE_PARK = 0.5;

const WHITE = 0xf3f1ec, NAVY = 0x18253d, GOLD = 0xc9a14b, METAL = 0xb7bcc2, DARK = 0x2a2e35, BLADE = 0x3a3f47, RED = 0xb8342c, YEL = 0xf2c230, GREEN = 0x1f8a4c;

/** A triangle soup with per-face colours (crisp livery lines on the facets) and per-vertex normals (smooth highlights). */
class Soup {
  pos: number[] = []; nor: number[] = []; col: number[] = [];
  private c = new THREE.Color();
  tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, na: THREE.Vector3, nb: THREE.Vector3, nc: THREE.Vector3, color: number) {
    this.c.setHex(color);
    for (const [p, n] of [[a, na], [b, nb], [c, nc]] as const) { this.pos.push(p.x, p.y, p.z); this.nor.push(n.x, n.y, n.z); this.col.push(this.c.r, this.c.g, this.c.b); }
  }
  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    return g;
  }
}

/** A primitive in one colour, moved into place, as a non-indexed geometry with a colour attribute (merged with the rest). */
function part(g: THREE.BufferGeometry, color: number, m: THREE.Matrix4): THREE.BufferGeometry {
  g.applyMatrix4(m);
  const out = g.index ? g.toNonIndexed() : g;
  if (out !== g) g.dispose();
  out.deleteAttribute('uv');
  const c = new THREE.Color(color), n = out.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  out.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return out;
}
const M = () => new THREE.Matrix4();
const at = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => M().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(1, 1, 1));
/** A tube from A to B (radius r0 at A, r1 at B). */
function tube(A: THREE.Vector3, B: THREE.Vector3, r0: number, r1: number, color: number, seg = 6): THREE.BufferGeometry {
  const d = B.clone().sub(A), len = d.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1, false);
  g.translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return part(g, color, M().compose(A, q, new THREE.Vector3(1, 1, 1)));
}

/**
 * The fuselage as a loft of rounded sections along z (nose +z): half-width, half-height and the section's middle height at each station. The
 * windscreen and the cabin's side windows are the loft's own faces, given to the glazing: the glass fits the body exactly.
 */
const STATIONS: [z: number, rx: number, ry: number, cy: number][] = [
  [2.3, 0.05, 0.06, 1.0], [2.16, 0.3, 0.32, 1.02], [1.9, 0.48, 0.5, 1.06], [1.5, 0.62, 0.66, 1.12], [1.0, 0.68, 0.74, 1.18], [0.5, 0.7, 0.76, 1.2],
  [0.0, 0.69, 0.74, 1.21], [-0.5, 0.62, 0.66, 1.24], [-0.95, 0.48, 0.52, 1.3], [-1.35, 0.32, 0.36, 1.38], [-1.7, 0.19, 0.21, 1.46],
];
const AROUND = 28;
/** A rounded (super-elliptic) section: the point and its outward normal at angle a (0 = top, going round toward +x). */
function section(rx: number, ry: number, cy: number, z: number, a: number, p: THREE.Vector3, n: THREE.Vector3) {
  const e = 2.6, s = Math.sin(a), c = Math.cos(a);
  const sx = Math.sign(s) * Math.abs(s) ** (2 / e), sy = Math.sign(c) * Math.abs(c) ** (2 / e);
  p.set(rx * sx, cy + ry * sy, z);
  // normal of |x/rx|^e + |y/ry|^e = 1
  n.set(Math.sign(sx) * Math.abs(sx) ** (e - 1) / rx, Math.sign(sy) * Math.abs(sy) ** (e - 1) / ry, 0).normalize();
}
function fuselage(body: Soup, glass: Soup) {
  const P = STATIONS.map(([z, rx, ry, cy]) => Array.from({ length: AROUND }, (_, k) => { const p = new THREE.Vector3(), n = new THREE.Vector3(); section(rx, ry, cy, z, (k / AROUND) * Math.PI * 2, p, n); return { p, n, s: (p.y - cy) / ry }; }));
  // the loft's normals lean with the body's taper (a smooth nose)
  for (let i = 0; i < P.length; i++) {
    const a = STATIONS[Math.max(0, i - 1)], b = STATIONS[Math.min(P.length - 1, i + 1)];
    const dr = (b[1] - a[1]) / Math.max(1e-3, a[0] - b[0]);
    for (const v of P[i]) { v.n.z += dr * 0.8; v.n.normalize(); }
  }
  for (const v of P[0]) v.n.set(0, 0.1, 1).normalize();
  for (let i = 0; i < P.length - 1; i++) for (let k = 0; k < AROUND; k++) {
    const k2 = (k + 1) % AROUND, a = P[i][k], b = P[i][k2], c = P[i + 1][k2], d = P[i + 1][k];
    const z = (a.p.z + c.p.z) / 2, s = (a.s + b.s + c.s + d.s) / 4, side = Math.abs((a.p.x + b.p.x + c.p.x + d.p.x) / 4);
    // the glazing: the windscreen (the nose's upper half, dipping to a chin window, under a painted roof) and the side windows of the rear seats
    const f = Math.max(0, Math.min(1, (z - 0.55) / 1.6));
    const screen = z > 0.55 && z < 2.2 && s > 0.08 - 0.22 * f && (s < 0.8 || z > 1.35);
    const rear = z > -0.5 && z < 0.4 && s > 0.05 && s < 0.6 && side > 0.35;
    const frame = (z > 0.4 && z < 0.55 && s > -0.2) || (z > -0.62 && z < -0.5 && s > -0.05 && s < 0.7);   // the door pillars
    const col = frame ? DARK : s < -0.52 ? NAVY : s < -0.42 ? GOLD : WHITE;
    const out = screen || rear ? glass : body;
    out.tri(a.p, c.p, d.p, a.n, c.n, d.n, col); out.tri(a.p, b.p, c.p, a.n, b.n, c.n, col);
  }
  // the last section closed where the boom comes out of it
  const last = P[P.length - 1], [lz, , , lcy] = STATIONS[STATIONS.length - 1], mid = new THREE.Vector3(0, lcy, lz), back = new THREE.Vector3(0, 0, -1);
  for (let k = 0; k < AROUND; k++) body.tri(mid, last[k].p, last[(k + 1) % AROUND].p, back, back, back, WHITE);
}

export function buildHelicopter(): HelicopterBuild {
  const g = new THREE.Group(); g.name = 'helicopter';
  const body = new Soup(), glass = new Soup();
  fuselage(body, glass);
  const parts: THREE.BufferGeometry[] = [body.geometry()];
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  // the tail boom, tapering to the fin, white with the gold line carried along its flank
  parts.push(tube(V(0, 1.52, -1.5), V(0, 1.66, -3.95), 0.2, 0.09, WHITE, 10));
  for (const sx of [-1, 1]) parts.push(part(new THREE.BoxGeometry(0.012, 0.05, 2.3), GOLD, at(sx * 0.155, 1.53, -2.6, 0.05)));
  // the swept fin and its green-yellow-red bands, the horizontal stabiliser with end plates
  const fin = new THREE.Shape(); fin.moveTo(0, 0); fin.lineTo(0.55, 0); fin.lineTo(0.18, 0.92); fin.lineTo(-0.12, 0.92); fin.lineTo(-0.2, 0.1); fin.closePath();
  const finG = new THREE.ExtrudeGeometry(fin, { depth: 0.05, bevelEnabled: false });
  finG.translate(0, 0, -0.025);
  parts.push(part(finG, NAVY, at(0, 1.5, -3.85, 0, -Math.PI / 2)));
  ([[GREEN, -3.9], [YEL, -3.77], [RED, -3.64]] as const).forEach(([c, z]) => { for (const sx of [-1, 1]) parts.push(part(new THREE.BoxGeometry(0.006, 0.2, 0.13), c, at(sx * 0.03, 2.08, z))); });
  parts.push(part(new THREE.BoxGeometry(1.36, 0.045, 0.34), WHITE, at(0, 1.66, -3.55)));
  for (const sx of [-1, 1]) parts.push(part(new THREE.BoxGeometry(0.03, 0.26, 0.3), NAVY, at(sx * 0.68, 1.62, -3.58)));
  // the tail rotor on the left, its hub, its two blades striped red and white (the guard marks)
  parts.push(tube(V(-0.04, 1.9, -3.92), V(-0.2, 1.9, -3.92), 0.05, 0.04, DARK, 8));
  for (const s of [1, -1]) {
    const a = 0.35 + (s < 0 ? Math.PI : 0), r0 = 0.07, r1 = 0.58;
    for (let k = 0; k < 3; k++) {
      const t0 = r0 + (r1 - r0) * (k / 3), t1 = r0 + (r1 - r0) * ((k + 1) / 3), m = (t0 + t1) / 2;
      parts.push(part(new THREE.BoxGeometry(0.02, t1 - t0, 0.075), k === 1 ? WHITE : RED, at(-0.22, 1.9 + Math.cos(a) * m, -3.92 + Math.sin(a) * m, a)));
    }
  }
  // the engine's cowling behind the cabin roof, its intake and exhaust
  const cowl = new THREE.CapsuleGeometry(0.3, 0.75, 4, 10); cowl.rotateX(Math.PI / 2); cowl.scale(0.9, 0.62, 1);
  parts.push(part(cowl, WHITE, at(0, 1.95, -0.55)));
  parts.push(part(new THREE.BoxGeometry(0.36, 0.08, 0.2), DARK, at(0, 2.13, -0.08)));
  parts.push(tube(V(0, 1.93, -1.0), V(0, 1.91, -1.38), 0.085, 0.075, DARK, 8));
  // the mast, the hub and the swashplate, the two main blades (parked at an angle, drooping a little, red tips)
  const mz = -0.25;
  parts.push(tube(V(0, 2.0, mz), V(0, 2.66, mz), 0.07, 0.06, METAL, 8));
  parts.push(part(new THREE.CylinderGeometry(0.17, 0.2, 0.08, 10), DARK, at(0, 2.36, mz)));
  parts.push(part(new THREE.CylinderGeometry(0.13, 0.13, 0.13, 10), DARK, at(0, 2.7, mz)));
  const R = ROTOR_DIAMETER / 2;
  for (const s of [1, -1]) {
    const yaw = BLADE_PARK + (s < 0 ? Math.PI : 0), droop = 0.035;
    // three spans each: root, blade, red tip (the tips droop a little at rest)
    for (const [t0, t1, c, w] of [[0.1, 0.5, DARK, 0.16], [0.5, R - 0.28, BLADE, 0.24], [R - 0.28, R, RED, 0.24]] as const) {
      const m = (t0 + t1) / 2;
      parts.push(part(new THREE.BoxGeometry(t1 - t0, 0.035, w), c, at(Math.cos(yaw) * m, 2.73 - droop * (m / R) * (m / R) * 4, mz - Math.sin(yaw) * m, 0, yaw, -droop * (m / R) * 2)));
    }
  }
  // the skids: two tubes with their upturned toes, two cross tubes each side up to the belly
  for (const sx of [-1, 1]) {
    const x = sx * 0.96;
    parts.push(tube(V(x, 0.05, -1.25), V(x, 0.05, 1.15), 0.045, 0.045, METAL, 6));
    parts.push(tube(V(x, 0.05, 1.15), V(x, 0.24, 1.46), 0.045, 0.04, METAL, 6));
    for (const [z, y] of [[0.62, 0.6], [-0.55, 0.78]] as const) parts.push(tube(V(x, 0.05, z), V(sx * 0.42, y, z), 0.04, 0.04, METAL, 6));
  }
  // a step on each side under the doors, the navy belly fairing between the cross tubes
  for (const sx of [-1, 1]) parts.push(part(new THREE.BoxGeometry(0.22, 0.03, 0.5), DARK, at(sx * 0.68, 0.36, 0.5)));
  const opaque = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  opaque.computeBoundingSphere(); opaque.computeBoundingBox();
  const glaze = glass.geometry(); glaze.computeBoundingSphere();

  const paint = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 70, specular: 0x3a3a3a });
  const tint = new THREE.MeshPhongMaterial({ color: 0x35536b, specular: 0xd0e0ee, shininess: 120, emissive: 0x0c1824 });
  const m1 = new THREE.Mesh(opaque, paint), m2 = new THREE.Mesh(glaze, tint);
  m1.name = 'helicopter-body'; m2.name = 'helicopter-glass';
  for (const m of [m1, m2]) { m.castShadow = true; m.receiveShadow = true; g.add(m); }
  const box = new THREE.Box3().setFromBufferAttribute(opaque.attributes.position as THREE.BufferAttribute).union(new THREE.Box3().setFromBufferAttribute(glaze.attributes.position as THREE.BufferAttribute));
  const r = (v: number) => Math.round(v * 100) / 100;
  const tris = (opaque.attributes.position.count + glaze.attributes.position.count) / 3;
  return {
    group: g,
    footprint: { w: r(box.max.x - box.min.x), d: r(box.max.z - box.min.z), h: r(box.max.y) },
    extent: { x0: r(box.min.x), x1: r(box.max.x), z0: r(box.min.z), z1: r(box.max.z), y1: r(box.max.y) },
    cost: { draws: 2, tris: Math.round(tris) },
  };
}
