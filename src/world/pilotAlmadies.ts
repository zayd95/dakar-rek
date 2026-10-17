import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { addGrain } from './grain';

/**
 * PILOT « Almadies at dusk » (branch pilot/almadies-dusk). Everything here is behind `?pilot=almadies`: with the flag off
 * nothing in this file runs (the builder and the main loop only test PILOT_ALMADIES). One street segment of the Almadies
 * (the north side of the middle east-west road): three hero villas built from boxes with real materials, a paved sidewalk,
 * lit gate pillars and sconces (emissive + additive light decals + halo points), instanced palms and planters, street
 * lamps with warm pools, and a dusk grade (sky, fog, hemisphere) for ~19:00–22:00.
 *
 * Draw calls: the villas, their cars, the walls, the gates, the railings share ONE set of merged meshes (plaster, stone,
 * wood, lit glass, emissive, pavers, additive decals, halos) + two instanced meshes (palms, planters): about 10 calls
 * for the whole street, i.e. under 4 per villa.
 */
export const PILOT_ALMADIES = typeof location !== 'undefined' && new URLSearchParams(location.search).get('pilot') === 'almadies';

type Quality = 'low' | 'medium' | 'high';
export interface PilotOpts { quality: Quality; G: number; lotXs: { i: number; j: number; a: number; b: number }[] }
export interface PilotLot { variant: number; i: number; j: number; a: number; b: number }
export interface PilotController {
  lot(i: number, j: number, a: number, b: number): PilotLot | null;
  villa(v: PilotLot, L: { x0: number; z0: number; x1: number; z1: number; cx: number; cz: number }, solid: (x0: number, z0: number, x1: number, z1: number, h: number) => void): void;
  blocks(x: number, z: number, r: number): boolean;
  skipLamp(x: number, z: number): boolean;
  build(canopies: { x: number; z: number; r: number; y0: number; y1: number }[]): THREE.Group;
  update(hour: number): void;
}

// ------------------------------------------------------------------------------------------ dusk sky
type Key = [number, number, number, number];
/** The normal keys until 18 h; then a long, warm orange-violet dusk (the mockup) instead of the quick fall to night. */
export const PILOT_SKY_KEYS: Key[] = [
  [0, 0x040814, 0x0f1a34, 0x1a2440],
  [5, 0x060c20, 0x18264a, 0x2a3050],
  [6.2, 0x2d4a80, 0xf0a46c, 0xf6c08a],
  [7.5, 0x3e7cc0, 0xbfd6e2, 0xead8bc],
  [12, 0x2f74c4, 0xb9d5e6, 0xe9dcc2],
  [17, 0x3a78c0, 0xc6d8e0, 0xefd5b0],
  [18.4, 0x3d5a9e, 0xf29a5c, 0xf7b072],
  [19.3, 0x3a4a96, 0xf0845e, 0xf6a470],
  [20.0, 0x3a3f86, 0xe0705f, 0xe88a70],
  [20.8, 0x262a66, 0x9a4f78, 0xb8647a],
  [21.8, 0x10163c, 0x38305e, 0x4a3556],
  [23, 0x060c20, 0x16234a, 0x22284a],
  [24, 0x040814, 0x0f1a34, 0x1a2440],
];

const ss = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** 0 by day, 1 from ~19:40 to dawn: when the street's lights are on. */
export const pilotNight = (h: number) => (h < 12 ? 1 - ss(5, 6.2, h) : ss(18.6, 19.5, h));
/** Weight of the dusk grade: ramps in from 17:45, out after 22:30 (the normal night takes over). */
export const pilotDusk = (h: number) => ss(17.6, 18.8, h) * (1 - ss(22.2, 23.2, h));

export interface GradeTargets {
  hemi: THREE.HemisphereLight; sun: THREE.DirectionalLight; fog: THREE.Fog; renderer: THREE.WebGLRenderer;
  sunPos: THREE.Vector3; hour: number;
}
const C = { a: new THREE.Color(), b: new THREE.Color() };
/** Dusk grade over the normal lighting (the main loop calls it after its own, only in the pilot hub). */
export function pilotGrade(g: GradeTargets) {
  const w = pilotDusk(g.hour); if (w <= 0.001) return;
  const l = (cur: THREE.Color, hex: number) => cur.lerp(C.a.set(hex), w);
  l(g.hemi.color, 0x8d78b0); l(g.hemi.groundColor, 0x6d5444);
  g.hemi.intensity += (0.95 - g.hemi.intensity) * w;
  l(g.sun.color, 0xff9a68); g.sun.intensity += (0.7 - g.sun.intensity) * w;
  g.sun.position.lerp(g.sunPos.set(g.sun.target.position.x - 80, g.sun.target.position.y + 32, g.sun.target.position.z + 34), w);
  g.fog.near += (28 - g.fog.near) * w; g.fog.far += (190 - g.fog.far) * w;
  g.renderer.toneMappingExposure += (1.32 - g.renderer.toneMappingExposure) * w;
}

// ------------------------------------------------------------------------------------------ textures
const cache = new Map<string, THREE.CanvasTexture>();
function prng(seed: number) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function tex(key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D, r: () => number) => void, repeat = true) {
  const hit = cache.get(key); if (hit) return hit;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  draw(cv.getContext('2d')!, prng(w * 31 + h * 7 + key.length));
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  cache.set(key, t); return t;
}
/** Stacked ledgestone cladding (dark basalt), ~1.5 m per repeat. */
const stoneTex = () => tex('stone', 256, 256, (c, r) => {
  c.fillStyle = '#26231f'; c.fillRect(0, 0, 256, 256);
  let y = 0;
  while (y < 256) {
    const rh = Math.min(256 - y, 22 + Math.floor(r() * 16)); let x = -Math.floor(r() * 40);
    while (x < 256) {
      const sw = 44 + Math.floor(r() * 60), v = 78 + Math.floor(r() * 62), warm = Math.floor(r() * 10);
      c.fillStyle = `rgb(${v + warm},${v},${v - warm})`; c.fillRect(x + 2, y + 2, sw - 3, rh - 3);
      c.fillStyle = `rgba(255,255,255,0.16)`; c.fillRect(x + 2, y + 2, sw - 3, 2);        // lit top edge
      c.fillStyle = 'rgba(0,0,0,0.28)'; c.fillRect(x + 2, y + rh - 3, sw - 3, 2);         // shadow under
      for (let k = 0; k < 14; k++) { const s = 70 + r() * 80; c.fillStyle = `rgba(${s},${s},${s},0.35)`; c.fillRect(x + 3 + r() * (sw - 8), y + 3 + r() * (rh - 8), 2, 1 + r() * 2); }
      x += sw;
    }
    y += rh;
  }
  // wrap: the first row repeats at the bottom edge naturally enough at this scale
});
/** Warm wood slat panels, 0.8 m per repeat, 8 slats. */
const woodTex = () => tex('wood', 256, 256, (c, r) => {
  for (let s = 0; s < 8; s++) {
    const v = 150 + Math.floor(r() * 50); c.fillStyle = `rgb(${v},${Math.floor(v * 0.62)},${Math.floor(v * 0.4)})`; c.fillRect(s * 32, 0, 32, 256);
    for (let k = 0; k < 26; k++) { const a = 0.08 + r() * 0.14; c.fillStyle = `rgba(40,18,6,${a})`; c.fillRect(s * 32 + 3 + r() * 26, 0, 1, 256); }
    for (let k = 0; k < 4; k++) { c.fillStyle = 'rgba(40,18,6,0.25)'; c.fillRect(s * 32 + 4, r() * 256, 24, 2); }   // butt joints
    c.fillStyle = 'rgba(15,6,2,0.85)'; c.fillRect(s * 32, 0, 2, 256);
  }
});
/** Light concrete pavers 60 × 30 cm in running bond, 2.4 m × 2.4 m per repeat (warm joints). */
const paverTex = () => tex('paver', 512, 512, (c, r) => {
  c.fillStyle = '#6f675c'; c.fillRect(0, 0, 512, 512);
  const pw = 128, ph = 64;
  for (let row = 0; row < 8; row++) for (let k = -1; k < 4; k++) {
    const x = k * pw + (row % 2 ? pw / 2 : 0), y = row * ph, v = 176 + Math.floor(r() * 36);
    c.fillStyle = `rgb(${v},${v - 6},${v - 18})`; c.fillRect(x + 2, y + 2, pw - 4, ph - 4);
    for (let n = 0; n < 40; n++) { const s = v - 20 + r() * 40; c.fillStyle = `rgba(${s},${s - 6},${s - 16},0.5)`; c.fillRect(x + 3 + r() * (pw - 8), y + 3 + r() * (ph - 8), 2, 2); }
  }
});
/** Lit room seen through glass: warm light, curtains, a pendant; used as colour and emissive map. */
const roomTex = () => tex('room', 256, 128, (c, r) => {
  const g = c.createLinearGradient(0, 0, 0, 128); g.addColorStop(0, '#fff0c8'); g.addColorStop(0.55, '#f4b768'); g.addColorStop(1, '#a8642c');
  c.fillStyle = g; c.fillRect(0, 0, 256, 128);
  const gl = c.createRadialGradient(128, 14, 2, 128, 14, 70); gl.addColorStop(0, 'rgba(255,250,225,0.95)'); gl.addColorStop(1, 'rgba(255,230,170,0)');
  c.fillStyle = gl; c.fillRect(0, 0, 256, 128);
  for (const [x0, x1] of [[0, 52], [204, 256]] as const) for (let x = x0; x < x1; x += 6) { const a = 0.14 + r() * 0.18; c.fillStyle = `rgba(255,236,204,${a + 0.3})`; c.fillRect(x, 0, 3, 128); c.fillStyle = `rgba(120,70,40,${a})`; c.fillRect(x + 3, 0, 3, 128); }
  c.fillStyle = 'rgba(60,30,14,0.85)'; c.fillRect(60, 84, 74, 44); c.fillRect(150, 96, 34, 32);   // sofa and a console
  c.fillStyle = 'rgba(20,12,8,0.9)'; c.fillRect(126, 0, 3, 128); c.fillRect(0, 0, 256, 3); c.fillRect(0, 125, 256, 3); c.fillRect(0, 0, 3, 128); c.fillRect(253, 0, 3, 128); // frame / mullion
});
const glowTex = () => tex('glow', 64, 64, c => {
  const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g; c.fillRect(0, 0, 64, 64);
}, false);

// ------------------------------------------------------------------------------------------ geometry collector
class Mesher {
  geos: THREE.BufferGeometry[] = [];
  constructor(private tile = 1.2, private raw = false) {}
  private fin(g: THREE.BufferGeometry, color: number, x: number, y: number, z: number, rotY = 0) {
    g.rotateY(rotY); g.translate(x, y, z);
    const c = new THREE.Color(color), n = g.attributes.position.count, arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    this.geos.push(g);
  }
  /** Box standing at y; the UVs follow the metres (tile m per repeat), so textures keep their scale on any size. */
  box(w: number, h: number, d: number, x: number, y: number, z: number, color: number, rotY = 0) {
    const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv as THREE.BufferAttribute;
    if (this.raw) { g.translate(0, h / 2, 0); this.fin(g, color, x, y, z, rotY); return; }
    const dims: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    const ox = (x * 0.37) % 1, oy = (y * 0.21 + z * 0.13) % 1;
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0] / this.tile + ox, uv.getY(i) * dims[f][1] / this.tile + oy); }
    g.translate(0, h / 2, 0); this.fin(g, color, x, y, z, rotY);
  }
  cyl(rt: number, rb: number, h: number, x: number, y: number, z: number, color: number, seg = 10, rotX = 0, rotZ = 0, rotY = 0) {
    const g = new THREE.CylinderGeometry(rt, rb, h, seg); if (rotX) g.rotateX(rotX); if (rotZ) g.rotateZ(rotZ); this.fin(g, color, x, y, z, rotY);
  }
  /** A prebuilt indexed geometry (position, normal, uv). */
  geometry(g: THREE.BufferGeometry, color: number, x = 0, y = 0, z = 0, rotY = 0) { this.fin(g, color, x, y, z, rotY); }
  merged(): THREE.BufferGeometry | null { if (!this.geos.length) return null; const m = mergeGeometries(this.geos, false); m?.computeBoundingSphere(); return m; }
}

/** One palm: bent ringed trunk + 11 arching V-folded fronds; vertex colours only (instanced, double-sided). */
function palmGeometry(): THREE.BufferGeometry {
  const pos: number[] = [], col: number[] = [], idx: number[] = [], uv: number[] = [];
  const H = 7.2, N = 9, SEG = 6;
  const push = (x: number, y: number, z: number, r: number, g: number, b: number) => { pos.push(x, y, z); col.push(r, g, b); uv.push(0, 0); return pos.length / 3 - 1; };
  const ring = (s: number) => { const t = s / N; return { x: 0.55 * t * t * 1.4, y: t * H, rad: 0.2 - 0.07 * t }; };
  for (let s = 0; s <= N; s++) {
    const { x, y, rad } = ring(s), band = s % 2 ? 0.86 : 1;
    for (let k = 0; k < SEG; k++) { const a = (k / SEG) * Math.PI * 2; push(x + Math.cos(a) * rad, y, Math.sin(a) * rad, 0.5 * band, 0.4 * band, 0.28 * band); }
  }
  for (let s = 0; s < N; s++) for (let k = 0; k < SEG; k++) { const a = s * SEG + k, b = s * SEG + (k + 1) % SEG; idx.push(a, a + SEG, b, b, a + SEG, b + SEG); }
  const top = ring(N), F = 11, SP = 6;
  for (let f = 0; f < F; f++) {
    const az = (f / F) * Math.PI * 2 + (f % 2) * 0.2, up = 0.55 - (f % 3) * 0.28, L = 3.4 + (f % 4) * 0.25;
    const dx = Math.cos(az), dz = Math.sin(az), px = -dz, pz = dx;
    const rows: number[][] = [];
    for (let s = 0; s <= SP; s++) {
      const t = s / SP, hx = top.x + dx * L * t, hz = dz * L * t, hy = top.y + 0.1 + up * L * t * 0.9 - 1.9 * t * t * (L / 3.6);
      const wd = 0.62 * Math.sin(Math.PI * Math.min(1, t * 1.05 + 0.05)) * (1 - 0.25 * t) + 0.03;
      const sh = 0.55 + 0.45 * t, gc: [number, number, number] = [0.14 * sh + 0.05, 0.36 * sh + 0.07, 0.13 * sh + 0.03];
      const L0 = push(hx + px * wd, hy - 0.17 * wd, hz + pz * wd, ...gc), M0 = push(hx, hy + 0.06, hz, gc[0] * 1.2, gc[1] * 1.2, gc[2] * 1.2), R0 = push(hx - px * wd, hy - 0.17 * wd, hz - pz * wd, ...gc);
      rows.push([L0, M0, R0]);
    }
    for (let s = 0; s < SP; s++) for (let q = 0; q < 2; q++) { const a = rows[s][q], b = rows[s][q + 1], c = rows[s + 1][q], d = rows[s + 1][q + 1]; idx.push(a, c, b, b, c, d); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals(); return g;
}

/** A planter (white box, dark soil) with a clump of tropical plants (strelitzia blades + broad leaves). 1.4 m long. */
function planterGeometry(): THREE.BufferGeometry {
  const m = new Mesher();
  m.box(1.4, 0.55, 0.62, 0, 0, 0, 0xf0ece2); m.box(1.46, 0.07, 0.68, 0, 0.55, 0, 0xfaf6ec); m.box(1.2, 0.04, 0.44, 0, 0.6, 0, 0x2b2118);
  const rr = prng(11), leafGeos: THREE.BufferGeometry[] = [];
  const blade = (x: number, z: number, az: number, len: number, wid: number, lean: number, c0: number[], c1: number[]) => {
    const pos: number[] = [], col: number[] = [], idx: number[] = [], uv: number[] = []; const S = 5;
    const dx = Math.cos(az), dz = Math.sin(az), px = -dz, pz = dx;
    for (let s = 0; s <= S; s++) {
      const t = s / S, w = wid * Math.sin(Math.PI * (0.12 + 0.88 * t) ) * (1 - 0.15 * t), hx = x + dx * lean * len * t * t, hz = z + dz * lean * len * t * t, hy = 0.62 + len * t * (1 - 0.35 * lean * t);
      const cc = c0.map((v, i) => v + (c1[i] - v) * t);
      for (const [o, up] of [[1, -0.05], [0, 0.04], [-1, -0.05]] as const) { pos.push(hx + px * w * o, hy + up * w, hz + pz * w * o); col.push(cc[0] * (o === 0 ? 1.15 : 1), cc[1] * (o === 0 ? 1.15 : 1), cc[2]); uv.push(0, 0); }
    }
    for (let s = 0; s < S; s++) for (let q = 0; q < 2; q++) { const a = s * 3 + q, b = s * 3 + q + 1, c = (s + 1) * 3 + q, d = (s + 1) * 3 + q + 1; idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    leafGeos.push(g);
  };
  for (let k = 0; k < 11; k++) {
    const az = (k / 11) * Math.PI * 2 + rr() * 0.4, ox = (rr() - 0.5) * 0.8, oz = (rr() - 0.5) * 0.2;
    blade(ox, oz, az, 0.95 + rr() * 0.75, 0.13 + rr() * 0.06, 0.35 + rr() * 0.5, [0.08, 0.22, 0.08], [0.2, 0.46, 0.16]);
  }
  for (let k = 0; k < 4; k++) { const az = rr() * 6.28; blade((rr() - 0.5) * 0.6, 0, az, 0.55 + rr() * 0.3, 0.2, 0.9, [0.1, 0.3, 0.1], [0.24, 0.5, 0.18]); }
  return mergeGeometries([m.merged()!, ...leafGeos], false)!;
}

// ------------------------------------------------------------------------------------------ the controller
const WALL = 0xf3efe6, WALL2 = 0xe6dccb, DARK = 0x2a2829, DARK2 = 0x37322f, WOODC = 0xc9905a, STONEC = 0xe6dfd4, PAVE = 0xd2c6b0, COURT = 0xa89c8b;
const WARM = 0xffc27a, WARM_HI = 0xffd9a0, GLASS = 0xffffff;

export function createAlmadiesPilot(opts: PilotOpts): PilotController {
  const { quality, G } = opts;
  const body = new Mesher(), stone = new Mesher(1.5), wood = new Mesher(0.8), glass = new Mesher(1, true), lamp = new Mesher(), pave = new Mesher(2.4);
  const palms: { x: number; y: number; z: number; s: number; r: number }[] = [];
  const planters: { x: number; y: number; z: number; s: number; r: number }[] = [];
  const decals: THREE.BufferGeometry[] = [];
  const halos: { x: number; y: number; z: number; size: number; r: number; g: number; b: number }[] = [];
  const lights: { x: number; y: number; z: number; k: number }[] = [];
  const rects: { x0: number; x1: number; z0: number; z1: number }[] = [];
  const lotSet = new Map(opts.lotXs.map((l, n) => [`${l.i},${l.j},${l.a},${l.b}`, n]));
  const low = quality === 'low';

  const decal = (kind: 'floor' | 'wallZ', x: number, y: number, z: number, w: number, h: number, col: number, k = 1) => {
    const g = new THREE.PlaneGeometry(w, h); if (kind === 'floor') g.rotateX(-Math.PI / 2);
    g.translate(x, y, z);
    const c = new THREE.Color(col).multiplyScalar(k), n = g.attributes.position.count, arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3)); decals.push(g);
  };
  const halo = (x: number, y: number, z: number, size: number, col = WARM, k = 1) => { const c = new THREE.Color(col).multiplyScalar(k); halos.push({ x, y, z, size, r: c.r, g: c.g, b: c.b }); };

  /** One villa and its frontage. Local frame: x to the right seen from the street, zl toward the street from the house front. */
  const villa = (v: PilotLot, L: { x0: number; z0: number; x1: number; z1: number; cx: number; cz: number }, solid: (x0: number, z0: number, x1: number, z1: number, h: number) => void) => {
    const mir = v.variant === 1 ? -1 : 1, cx = L.cx;
    const zw = L.z1 - 2.2, zh = zw - 7.2;            // street wall line, house front plane
    const WD = v.variant === 2 ? 0x3a2f2a : WOODC;
    const plaster = [WALL, WALL2, 0xefe7da][v.variant % 3], accent = [DARK2, 0x3b3f44, 0x2b2522][v.variant % 3];
    const X = (xl: number) => cx + mir * xl, Z = (zl: number) => zh + zl;
    const bx = (m: Mesher, xl: number, y: number, zl: number, w: number, h: number, d: number, c: number) => m.box(w, h, d, X(xl), y, Z(zl), c);
    const Y1 = G + 3.4, Y2 = G + 6.85;
    const sconce = (xl: number, y: number, zl: number, strong = 1) => {
      bx(body, xl, y - 0.02, zl, 0.2, 0.34, 0.1, 0x1c1b1c); bx(lamp, xl, y + 0.12, zl + 0.055, 0.14, 0.06, 0.02, WARM_HI);
      if (!low) halo(X(xl), y + 0.14, Z(zl) + 0.12, 1.5 * strong);
      decal('wallZ', X(xl), y + 0.14, Z(zl) + 0.06, 1.7, 3.2, WARM, 0.55 * strong);
    };

    // ---- plinth, ground floor
    bx(body, 0, G - 0.02, -5.2, 18.4, 0.34, 10.8, 0x55524f);
    bx(body, -7.95, G, -5.2, 2.1, 3.4, 10.4, plaster);                    // left white wing
    bx(body, 4.75, G, -5.2, 8.5, 3.4, 10.4, plaster);                     // right ground-floor block
    bx(wood, -2, G, -6.0, 5, 3.4, 8.8, WD);                               // entry recess: wood panelled back wall
    bx(stone, -5.7, G, -4.9, 2.4, 7.2, 11.0, STONEC);                     // the stone-clad column, two storeys
    bx(body, -5.7, G + 7.2, -4.9, 2.5, 0.2, 11.1, DARK);                  // its dark cap
    // entry door, side light
    bx(wood, -1.4, G, -1.57, 1.25, 2.55, 0.08, 0xa6683a); bx(body, -1.4, G + 2.55, -1.57, 1.4, 0.1, 0.12, DARK); bx(body, -2.05, G, -1.57, 0.08, 2.55, 0.12, DARK); bx(body, -0.75, G, -1.57, 0.08, 2.55, 0.12, DARK);
    bx(lamp, -0.55, G + 1.05, -1.5, 0.05, 0.3, 0.04, WARM_HI);
    bx(glass, -3.7, G + 0.25, -1.55, 0.55, 2.6, 0.06, GLASS);
    // sliding glass door, right: frame + panes
    bx(glass, 4.0, G + 0.25, 0.04, 5.2, 2.7, 0.06, GLASS);
    bx(body, 4.0, G + 2.95, 0.05, 5.5, 0.14, 0.1, DARK); bx(body, 4.0, G + 0.14, 0.05, 5.5, 0.12, 0.1, DARK);
    for (const xl of [1.3, 6.7]) bx(body, xl, G + 0.14, 0.05, 0.14, 2.95, 0.1, DARK);
    bx(body, 4.0, G + 0.14, 0.06, 0.1, 2.95, 0.1, DARK);
    // slit window on the white wing
    bx(body, -8.0, G + 0.9, 0.02, 0.62, 1.95, 0.05, DARK); bx(glass, -8.0, G + 0.97, 0.05, 0.42, 1.8, 0.04, GLASS);
    // ---- first floor
    bx(body, 2.25, Y1, -4.3, 13.5, 0.55, 12.2, accent);                    // the dark slab / fascia, cantilevered 1.8 m
    bx(lamp, 2.25, Y1 - 0.02, 1.7, 13.2, 0.05, 0.08, WARM);                // LED line under its front edge
    bx(wood, -3.05, Y1 + 0.55, -5.45, 2.9, 2.9, 10.0, WD);                 // wood panel wall of the balcony room
    bx(body, 1.2, Y1 + 0.55, -5.45, 5.6, 2.9, 10.0, plaster);              // white wall
    bx(glass, 1.2, Y1 + 0.75, -0.46, 5.0, 2.55, 0.06, GLASS);              // the balcony's sliding door
    bx(body, 1.2, Y1 + 3.35, -0.45, 5.4, 0.12, 0.1, DARK); bx(body, 1.2, Y1 + 0.62, -0.45, 5.4, 0.12, 0.1, DARK);
    for (const xl of [-1.5, 3.9]) bx(body, xl, Y1 + 0.62, -0.45, 0.12, 2.9, 0.1, DARK);
    bx(body, 6.5, Y1 + 0.55, -4.3, 5.0, 2.9, 12.2, accent);                // the dark volume, right
    bx(glass, 6.5, Y1 + 1.35, 1.82, 2.8, 1.3, 0.05, GLASS);                // its window
    for (const [w, xl, h, y] of [[2.9, 6.5, 0.1, 1.28], [2.9, 6.5, 0.1, 2.68]] as const) bx(body, xl, Y1 + y, 1.83, w, h, 0.08, 0x151414);
    bx(body, -7.95, Y1, -5.2, 2.1, 0.3, 10.6, 0xe9e4da);                    // wing roof + parapet
    bx(body, -7.95, Y1 + 0.3, -5.2, 2.3, 0.22, 10.8, plaster);
    // glass balustrade: rails and posts (the glass itself is not drawn)
    bx(body, -0.1, Y1 + 0.55, 1.7, 8.4, 0.05, 0.05, 0x151414); bx(body, -0.1, Y1 + 1.58, 1.7, 8.4, 0.07, 0.07, 0x151414);
    for (let k = 0; k <= 6; k++) bx(body, -4.3 + k * 1.4, Y1 + 0.55, 1.7, 0.05, 1.05, 0.05, 0x151414);
    for (const xl of [-4.3, 4.1]) bx(body, xl, Y1 + 0.55, 1.1, 0.05, 1.05, 0.05, 0x151414);
    // flat roof: thick white slab, overhanging, a warm line under it
    bx(body, 2.25, Y2, -4.0, 14.1, 0.3, 13.0, 0xf5f1e8);
    bx(body, 2.25, Y2 + 0.3, -4.0, 14.1, 0.26, 13.0, plaster);
    bx(lamp, 2.25, Y2 - 0.03, 2.4, 13.8, 0.04, 0.05, WARM);
    bx(body, 6.5, Y2 + 0.56, -8, 1.6, 1.0, 1.6, 0x2a2a2c);                  // a water tank
    // ---- balcony and terrace pots, wall sconces on the house
    for (const xl of [-3.9, 3.7]) planters.push({ x: X(xl), y: Y1 + 0.3, z: Z(1.1), s: 0.6, r: 0 });
    for (const xl of [-0.2, 8.0]) planters.push({ x: X(xl), y: G + 0.02, z: Z(0.95), s: 0.8, r: 0 });
    sconce(-4.55, G + 1.9, 0.62); sconce(-7.6, G + 2.0, 0.07, 0.8); sconce(7.7, G + 2.0, 0.07, 0.8); sconce(-3.0, G + 2.1, -1.52, 0.6);
    // entry spots in the soffit and a glow in the rooms
    for (const xl of [-3.4, -1.8, -0.2]) { bx(lamp, xl, Y1 - 0.04, -0.2, 0.22, 0.03, 0.22, WARM_HI); if (!low) halo(X(xl), Y1 - 0.1, Z(-0.2), 1.2); decal('floor', X(xl), G + 0.1, Z(-0.2), 3.2, 3.2, WARM, 0.5); }
    halo(X(4.0), G + 2.2, Z(0.5), 4.5, 0xffb060, 0.45); halo(X(1.2), Y1 + 2.1, Z(0.3), 4.0, 0xffb060, 0.4);
    // ---- the court (dark pavers) and the street wall with gates
    pave.box(22, 0.03, 7.4, cx, G + 0.015, zh + 3.7, COURT);
    bx(body, -10.85, G, -8.8, 0.3, 2.2, 18.3, plaster); bx(body, 10.85, G, -8.8, 0.3, 2.2, 18.3, plaster);   // side walls (z -17.9..0.4)
    body.box(22, 2.2, 0.3, cx, G, L.z0 + 0.3, plaster);                                                    // back wall
    // street wall: low wall left, pillar A, vehicle gate, pillar B, pedestrian gate, pillar C, wall + slat screen right
    const WH = 1.15, PH = 2.55, zl0 = 7.2;
    const pillar = (xl: number, h = PH) => {
      bx(body, xl, G, zl0, 0.85, h, 0.85, plaster); bx(body, xl, G + h, zl0, 1.0, 0.1, 1.0, 0x2e2c2d);
      bx(lamp, xl, G + h - 0.62, zl0 + 0.435, 0.12, 0.46, 0.02, WARM_HI);
      if (!low) halo(X(xl), G + h - 0.4, Z(zl0) + 0.5, 1.8);
      sconce(xl, G + 1.35, zl0 + 0.43, 0.9);
    };
    bx(body, -7.35, G, zl0, 7.3, WH, 0.3, plaster); bx(body, -7.35, G + WH, zl0, 7.5, 0.07, 0.4, 0xfbf8f0);    // x -11 .. -3.7
    pillar(-3.3);
    const slats = (xa: number, xb: number, h: number, c: number) => {
      const w = Math.abs(xb - xa), xc = (xa + xb) / 2;
      bx(body, xc, G, zl0 - 0.04, w, h, 0.06, 0x12100f);
      for (let y = 0.1; y < h - 0.1; y += 0.17) bx(body, xc, G + y, zl0, w - 0.1, 0.12, 0.08, c);
      bx(body, xa + 0.05, G, zl0, 0.1, h, 0.12, c); bx(body, xb - 0.05, G, zl0, 0.1, h, 0.12, c);
    };
    slats(-2.85, 3.3, 2.0, 0x2d2825);                                         // the vehicle gate
    pillar(3.75); slats(4.2, 5.8, 2.05, 0x2d2825); pillar(6.25, PH + 0.2);
    bx(body, 8.9, G, zl0, 4.3, WH + 0.2, 0.3, plaster); bx(body, 8.9, G + WH + 0.2, zl0, 4.5, 0.07, 0.4, 0xfbf8f0);
    slats(7.0, 10.6, 0.7, 0x2d2825); body.box(3.6, 0.7, 0.01, X(8.8), G + WH + 0.27, Z(zl0), 0x12100f);
    // a driveway cut and kerb ramp are left to the existing sidewalk: only the court gets a different floor
    // ---- cars in the court
    suv(body, lamp, X(-6.6), G + 0.03, Z(3.6), mir > 0 ? 0 : Math.PI);
    scooter(body, lamp, X(-3.4), G + 0.03, Z(3.2), mir > 0 ? 0.7 : Math.PI - 0.7);
    // ---- uplit planters in front of the street wall (sidewalk side) and in the court
    for (const xl of [-10.2, -8.8, -7.4]) { planters.push({ x: X(xl), y: G + 0.02, z: Z(zl0) + 0.7, s: 1, r: 0 }); }
    for (const xl of [8.0, 9.4]) planters.push({ x: X(xl), y: G + 0.02, z: Z(zl0) + 0.7, s: 1, r: 0 });
    for (const xl of [-4.2, 0.9]) planters.push({ x: X(xl), y: G + 0.02, z: Z(1.2), s: 0.85, r: 0 });
    for (const xl of [-9.4, -7.9, 8.1, 9.5]) { bx(lamp, xl, G + 0.07, zl0 + 0.4, 0.14, 0.05, 0.06, WARM_HI); if (!low) halo(X(xl), G + 0.3, Z(zl0) + 0.4, 1.3); decal('floor', X(xl), G + 0.155, Z(zl0) + 1.2, 3.4, 3.4, WARM, 0.55); }
    // ---- palms
    palms.push({ x: X(-10.2), y: 0, z: Z(-6.5), s: 1.05 + 0.1 * v.variant, r: v.variant }, { x: X(10.4), y: 0, z: Z(1.0), s: 1.25 - 0.1 * v.variant, r: 2 + v.variant }, { x: X(1.8), y: 0, z: Z(-12.5), s: 0.95, r: 4 });
    // pools of warm light on the sidewalk and in front of the gates
    decal('floor', X(-0.2), G + 0.16, Z(zl0) + 2.0, 9, 4.2, WARM, 0.5); decal('floor', X(5.1), G + 0.16, Z(zl0) + 1.8, 4, 3.6, WARM, 0.6);
    // ---- colliders
    solid(cx - 9, Z(-10.4), cx + 9, Z(1.8), 7.0);                                  // the house
    solid(L.x0, zw - 0.15, L.x1, zw + 0.15, 1.3);                                  // the street wall (the gates are decoration)
    solid(L.x0, L.z0, L.x1, L.z0 + 0.4, 2.2);
    // real lights (medium/high): the gate pillar and the entry
    lights.push({ x: X(-0.4), y: G + 2.3, z: Z(zl0) + 0.8, k: 1 });
    rects.push({ x0: L.x0 - 1, x1: L.x1 + 1, z0: L.z0 - 1, z1: L.z1 + 3 });
  };

  const lot = (i: number, j: number, a: number, b: number): PilotLot | null => { const n = lotSet.get(`${i},${j},${a},${b}`); return n === undefined ? null : { variant: n, i, j, a, b }; };

  const state = { pn: -1 };
  const built: { mats: { glass?: THREE.MeshLambertMaterial; lamp?: THREE.MeshBasicMaterial; decal?: THREE.MeshBasicMaterial; halo?: THREE.ShaderMaterial }; pl: THREE.PointLight[] } = { mats: {}, pl: [] };

  return {
    lot,
    villa(v, L, solid) { villa(v, L, solid); },
    blocks(x, z, r) { return rects.some(q => x > q.x0 - r && x < q.x1 + r && z > q.z0 - r && z < q.z1 + r) || (z > -10.5 - r && z < -4.6 + r && x > -55 - r && x < 31 + r); },
    skipLamp(x, z) { return z > -10 && z < -4 && x > -55 && x < 32; },
    build(canopies) {
      const g = new THREE.Group(); g.name = 'pilot-almadies';
      const zk = -5.0;                                       // kerb line (north side of the road z = 0)
      // sidewalk: warm light pavers from the wall line to the kerb, over the two block fronts
      const sw = (x0: number, x1: number) => { pave.box(x1 - x0, 0.03, zk - (-9.2) - 0.15, (x0 + x1) / 2, G + 0.015, (zk + -9.2) / 2 - 0.07, PAVE); body.box(x1 - x0, 0.2, 0.28, (x0 + x1) / 2, 0.0, zk, 0x66625f); };
      sw(-53, -7); sw(7, 31);
      // street lamps: slim curved pole, a lit head over the road, a warm pool; the kerb side
      for (const lx of [-30, 30]) {
        const lz = zk - 0.55;
        body.cyl(0.07, 0.11, 6.4, lx, 0.1, lz, 0x1f2022, 8); body.box(0.5, 0.35, 0.5, lx, 0.1, lz, 0x1f2022);
        body.box(0.1, 0.1, 1.9, lx, 6.32, lz + 0.9, 0x1f2022); body.box(0.5, 0.14, 0.9, lx, 6.2, lz + 1.9, 0x26272a);
        lamp.box(0.42, 0.05, 0.75, lx, 6.15, lz + 1.9, 0xffd69a);
        halo(lx, 6.1, lz + 1.9, 5.5, WARM_HI, 1.0);
        decal('floor', lx, G + 0.17, lz + 1.9, 13, 13, WARM, 0.85);
        lights.push({ x: lx, y: 5.3, z: lz + 1.5, k: 1.3 });
        canopies.push({ x: lx, z: lz + 1.9, r: 0.8, y0: 6, y1: 6.5 });
      }
      // street palms in the gaps between the lots (lamp x is also between lots)
      palms.push({ x: 18, y: 0, z: zk - 0.9, s: 1.1, r: 1 });
      // ---- meshes
      const out = (geo: THREE.BufferGeometry | null, mat: THREE.Material, shadow: boolean, name: string) => { if (!geo) return null; const m = new THREE.Mesh(geo, mat); m.name = name; m.castShadow = shadow && quality !== 'low'; m.receiveShadow = true; g.add(m); return m; };
      const plain = addGrain(new THREE.MeshLambertMaterial({ vertexColors: true }), 0.55, 1);
      out(body.merged(), plain, true, 'p-plaster');
      out(stone.merged(), new THREE.MeshLambertMaterial({ vertexColors: true, map: stoneTex() }), true, 'p-stone');
      out(wood.merged(), new THREE.MeshLambertMaterial({ vertexColors: true, map: woodTex(), emissive: 0x5a2a0c, emissiveIntensity: 0 }), true, 'p-wood');
      const gm = new THREE.MeshLambertMaterial({ vertexColors: true, map: roomTex(), emissive: 0xffffff, emissiveMap: roomTex(), emissiveIntensity: 0 });
      out(glass.merged(), gm, false, 'p-glass'); built.mats.glass = gm;
      const lm = new THREE.MeshBasicMaterial({ vertexColors: true }); out(lamp.merged(), lm, false, 'p-lights'); built.mats.lamp = lm;
      out(pave.merged(), new THREE.MeshLambertMaterial({ vertexColors: true, map: paverTex() }), false, 'p-pavers');
      // additive light decals (pools on the ground, washes on the walls)
      if (decals.length) {
        const dm = new THREE.MeshBasicMaterial({ map: glowTex(), vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
        const m = out(mergeGeometries(decals.map(d => d), false), dm, false, 'p-decals'); if (m) m.renderOrder = 2; built.mats.decal = dm;
      }
      // halos: one Points draw call (round soft sprites, size attenuated by distance)
      if (halos.length) {
        const pos = new Float32Array(halos.length * 3), siz = new Float32Array(halos.length), col = new Float32Array(halos.length * 3);
        halos.forEach((h, n) => { pos.set([h.x, h.y, h.z], n * 3); siz[n] = h.size; col.set([h.r, h.g, h.b], n * 3); });
        const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('aSize', new THREE.BufferAttribute(siz, 1)); geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
        const hm = new THREE.ShaderMaterial({
          uniforms: { uPx: { value: 600 }, uI: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
          vertexShader: 'attribute float aSize; attribute vec3 aColor; uniform float uPx; varying vec3 vC; void main(){ vC=aColor; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=clamp(aSize*uPx/max(-mv.z,0.5),0.0,220.0); gl_Position=projectionMatrix*mv; }',
          fragmentShader: 'uniform float uI; varying vec3 vC; void main(){ vec2 d=gl_PointCoord-0.5; float r=length(d)*2.0; float a=exp(-r*r*3.2)*(1.0-smoothstep(0.85,1.0,r)); gl_FragColor=vec4(vC*a*uI*0.55,1.0); }',
        });
        const pts = new THREE.Points(geo, hm); pts.frustumCulled = false; pts.renderOrder = 3; pts.name = 'p-halos';
        const sz = new THREE.Vector2();
        pts.onBeforeRender = (r, _s, cam) => { r.getDrawingBufferSize(sz); hm.uniforms.uPx.value = (cam as THREE.PerspectiveCamera).projectionMatrix.elements[5] * sz.y * 0.5; };
        g.add(pts); built.mats.halo = hm;
      }
      // instanced palms and planters
      const inst = (geo: THREE.BufferGeometry, list: { x: number; y: number; z: number; s: number; r: number }[], name: string, shadow: boolean) => {
        if (!list.length) return;
        const m = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), list.length);
        const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
        list.forEach((it, n) => { q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, it.r * 2.1 + n); s.setScalar(it.s); p.set(it.x, it.y + G, it.z); mtx.compose(p, q, s); m.setMatrixAt(n, mtx); });
        m.instanceMatrix.needsUpdate = true; m.castShadow = shadow && quality !== 'low'; m.receiveShadow = false; m.frustumCulled = false; m.name = name; g.add(m);
      };
      inst(palmGeometry(), palms, 'p-palms', true);
      inst(planterGeometry(), planters, 'p-planters', false);
      for (const pl of palms) canopies.push({ x: pl.x, z: pl.z, r: 3.2 * pl.s, y0: 6.2 * pl.s, y1: 7.6 * pl.s });
      // real lights: medium 2, high 4 (none on Low: emissive and the decals carry it)
      const nLights = quality === 'high' ? 4 : quality === 'medium' ? 2 : 0;
      const pick = [3, 1, 0, 2].map(n => lights[n]).filter(Boolean);
      for (const l of pick.slice(0, nLights)) {
        const pl = new THREE.PointLight(0xffb067, 0, 17, 1.6); pl.position.set(l.x, l.y, l.z); (pl as unknown as { k: number }).k = l.k; g.add(pl); built.pl.push(pl);
      }
      return g;
    },
    update(hour) {
      const pn = pilotNight(hour); if (Math.abs(pn - state.pn) < 0.004) return; state.pn = pn;
      const m = built.mats;
      if (m.glass) { m.glass.emissiveIntensity = pn * 0.95; m.glass.color.setScalar(0.22 + 0.78 * pn); }
      if (m.lamp) m.lamp.color.setScalar(0.3 + 0.7 * pn);
      if (m.decal) m.decal.opacity = pn * 0.85;
      if (m.halo) m.halo.uniforms.uI.value = pn;
      for (const pl of built.pl) pl.intensity = pn * 22 * ((pl as unknown as { k: number }).k ?? 1);
    },
  };
}

// ------------------------------------------------------------------------------------------ props
function suv(b: Mesher, lamp: Mesher, x: number, y: number, z: number, yaw: number) {
  const bd = 0x15171a, gl = 0x242d38, c = Math.cos(yaw), s = Math.sin(yaw);
  const at = (lx: number, lz: number): [number, number] => [x + lx * c + lz * s, z - lx * s + lz * c];
  const box = (w: number, h: number, d: number, lx: number, ly: number, lz: number, col: number) => { const [px, pz] = at(lx, lz); b.box(w, h, d, px, y + ly, pz, col, yaw); };
  box(4.7, 0.62, 1.92, 0, 0.42, 0, bd); box(2.9, 0.62, 1.8, -0.25, 1.04, 0, bd);          // lower body, cabin
  box(2.6, 0.5, 1.84, -0.25, 1.1, 0, gl);                                                  // glass band
  box(1.2, 0.2, 1.8, 1.45, 1.04, 0, bd);                                                    // bonnet
  for (const [lx, lz] of [[1.4, 0.82], [1.4, -0.82], [-1.4, 0.82], [-1.4, -0.82]] as const) { const [px, pz] = at(lx, lz); b.cyl(0.38, 0.38, 0.28, px, y + 0.38, pz, 0x0c0c0d, 12, Math.PI / 2, 0, yaw); }
  for (const lz of [-0.7, 0.7]) { const [px, pz] = at(-2.36, lz); lamp.box(0.05, 0.14, 0.4, px, y + 0.82, pz, 0xff3a2a, yaw); const [fx, fz] = at(2.36, lz); lamp.box(0.05, 0.12, 0.4, fx, y + 0.78, fz, 0xfff0d0, yaw); }
}
function scooter(b: Mesher, lamp: Mesher, x: number, y: number, z: number, yaw: number) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const at = (lx: number, lz: number): [number, number] => [x + lx * c + lz * s, z - lx * s + lz * c];
  const box = (w: number, h: number, d: number, lx: number, ly: number, lz: number, col: number) => { const [px, pz] = at(lx, lz); b.box(w, h, d, px, y + ly, pz, col, yaw); };
  for (const lx of [-0.65, 0.65]) { const [px, pz] = at(lx, 0); b.cyl(0.26, 0.26, 0.12, px, y + 0.26, pz, 0x0d0d0e, 10, Math.PI / 2, 0, yaw); }
  box(1.0, 0.34, 0.3, -0.1, 0.34, 0, 0x8d1f24); box(0.55, 0.12, 0.28, -0.35, 0.72, 0, 0x16171a); box(0.5, 0.5, 0.3, 0.55, 0.45, 0, 0x8d1f24); box(0.1, 0.1, 0.62, 0.62, 0.98, 0, 0x16171a);
  const [hx, hz] = at(0.82, 0); lamp.box(0.06, 0.12, 0.14, hx, y + 0.84, hz, 0xfff0d0, yaw);
}
