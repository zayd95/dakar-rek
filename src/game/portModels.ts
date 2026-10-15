import * as THREE from 'three';
import { Batch } from '../world/batch';

/** Shaped parts for the port (hulls, rounded decks, tubes, side profiles), merged into the same single-draw-call Batch. */
export type V3 = [number, number, number];

/** A tube between two points: rails, truss members, stays, wheels. */
export function bar(b: Batch, a: V3, c: V3, r: number, color: number, seg = 5) {
  const v = new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]), len = v.length();
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize()));
  b.geometry(g, color, (a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2);
}

/** A plan outline (x along the length, y = the other horizontal axis) stood up into a solid from `y` to `y + h`. */
export function plan(b: Batch, s: THREE.Shape, h: number, color: number, x: number, y: number, z: number, bevel = 0, yaw = 0) {
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 8 });
  g.rotateX(-Math.PI / 2);
  b.geometry(g, color, x, y, z, yaw);
}
/** A side profile (u forward, v up) given width across, for cabs and gables. */
export function side(b: Batch, pts: [number, number][], width: number, color: number, x: number, y: number, z: number) {
  const s = new THREE.Shape(pts.map(p => new THREE.Vector2(p[0], p[1])));
  const g = new THREE.ExtrudeGeometry(s, { depth: width, bevelEnabled: false });
  g.translate(0, 0, -width / 2); g.rotateY(-Math.PI / 2);
  b.geometry(g, color, x, y, z);
}
export function roundRect(w: number, d: number, r: number) {
  const s = new THREE.Shape(), x = w / 2, y = d / 2; r = Math.min(r, x, y);
  s.moveTo(-x + r, -y); s.lineTo(x - r, -y); s.quadraticCurveTo(x, -y, x, -y + r); s.lineTo(x, y - r); s.quadraticCurveTo(x, y, x - r, y);
  s.lineTo(-x + r, y); s.quadraticCurveTo(-x, y, -x, y - r); s.lineTo(-x, -y + r); s.quadraticCurveTo(-x, -y, -x + r, -y);
  return s;
}
/** Hull outline: pointed, slightly bulged bow at +x, rounded transom at -x. */
export function hullShape(L: number, B: number, bow: number, transom = 1.2) {
  const s = new THREE.Shape(), x = L / 2, y = B / 2;
  s.moveTo(-x + transom, -y); s.lineTo(x - bow, -y);
  s.bezierCurveTo(x - bow * 0.35, -y, x, -y * 0.2, x, 0); s.bezierCurveTo(x, y * 0.2, x - bow * 0.35, y, x - bow, y);
  s.lineTo(-x + transom, y); s.quadraticCurveTo(-x, y, -x, y - transom); s.lineTo(-x, -y + transom); s.quadraticCurveTo(-x, -y, -x + transom, -y);
  return s;
}

/** Corrugated container sides (ribs painted in a grey-scale map, tinted per instance). */
let ribs: THREE.CanvasTexture | null = null;
export function containerMap() {
  if (ribs) return ribs;
  const c = document.createElement('canvas'); c.width = 128; c.height = 32;
  const g = c.getContext('2d')!; g.fillStyle = '#e8e8e8'; g.fillRect(0, 0, 128, 32);
  for (let i = 0; i < 128; i += 4) { g.fillStyle = i % 8 ? '#cfcfcf' : '#f6f6f6'; g.fillRect(i, 2, 3, 28); }
  g.fillStyle = '#b8b8b8'; g.fillRect(0, 0, 128, 2); g.fillRect(0, 30, 128, 2);
  ribs = new THREE.CanvasTexture(c); ribs.colorSpace = THREE.SRGBColorSpace; ribs.anisotropy = 2;
  return ribs;
}
