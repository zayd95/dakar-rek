import * as THREE from 'three';
import type { Batch } from '../batch';
import { GROUND, STOREY, type SiteDraw } from './contract';
import type { Face } from './parts';

/**
 * LD2.0-E lane E-H: what the three hotels share beyond the district's parts (src/world/almadies/parts.ts): thin facade planes (a pane, a slat screen, a guard,
 * a course of stone: two triangles each instead of a box's ten, so a 40 m front can carry a rhythm of balconies and screens inside a hotel's budget),
 * a raised pool, a lounger, a parasol, a flag pole, a lighter palm. Everything is drawn in plan coordinates on a `SiteDraw`, into the hub's merged
 * batches (no mesh, no material of its own), and thins out on the low preset (`d.lite`).
 */
export const Y0 = GROUND, ST = STOREY;
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
/** A colour between two (0 … 1). */
export function mix(a: number, b: number, t: number): number {
  const r = (c: number, s: number) => (c >> s) & 255;
  const f = (s: number) => Math.round(r(a, s) + (r(b, s) - r(a, s)) * t);
  return (f(16) << 16) | (f(8) << 8) | f(0);
}
/** A colour darkened (k < 1) or lightened (k > 1). */
export const shade = (c: number, k: number) => k <= 1 ? mix(c, 0x000000, 1 - k) : mix(c, 0xffffff, k - 1);
/** The side a face looks to along its plane's normal axis: +1 for the street's and the right's, −1 for the back's and the left's. */
export const sign = (f: Face) => f === 'street' || f === 'right' ? 1 : -1;
const OUT: Record<Face, [number, number]> = { street: [0, 1], back: [0, -1], right: [1, 0], left: [-1, 0] };

/** A vertical rectangle on a face: `u0…u1` along it, `y0…y1`; `c` its colour (bottom), `c2` the colour at its top (a gradient: a sky in the glass). */
export interface Q { u0: number; u1: number; y0: number; y1: number; c: number; c2?: number }
/**
 * Vertical planes on a face (`at`: the plane's z for the street and the back, its x for the sides), as ONE piece of a batch: two triangles each, wound to look
 * outward in whatever frame the site stands in (mirrored or turned). Planes sit a few cm in front of what they dress, so they never fight its face.
 */
export function quads(d: SiteDraw, b: Batch, face: Face, at: number, list: Q[]) {
  if (!list.length) return;
  const [nx, nz] = OUT[face], onX = face === 'street' || face === 'back';
  const o = d.f.p(0, 0), nn = d.f.p(nx, nz), hx = nn.x - o.x, hz = nn.z - o.z;
  const P = (u: number, y: number): [number, number, number] => { const q = onX ? d.f.p(u, at) : d.f.p(at, u); return [q.x, y, q.z]; };
  const pos: number[] = [], col: number[] = [], c1 = new THREE.Color(), c2 = new THREE.Color();
  for (const r of list) {
    if (r.u1 - r.u0 < 1e-3 || r.y1 - r.y0 < 1e-3) continue;
    const A = P(r.u0, r.y0), B = P(r.u1, r.y0), C = P(r.u1, r.y1), D = P(r.u0, r.y1);
    const ax = B[0] - A[0], ay = B[1] - A[1], az = B[2] - A[2], bx = C[0] - A[0], by = C[1] - A[1], bz = C[2] - A[2];
    const flip = (ay * bz - az * by) * hx + (ax * by - ay * bx) * hz < 0;
    c1.set(r.c); c2.set(r.c2 ?? r.c);
    const tris = flip ? [[A, c1], [C, c2], [B, c1], [A, c1], [D, c2], [C, c2]] as const : [[A, c1], [B, c1], [C, c2], [A, c1], [C, c2], [D, c2]] as const;
    for (const [v, c] of tris) { pos.push(v[0], v[1], v[2]); col.push(c.r, c.g, c.b); }
  }
  if (!pos.length) return;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  b.coloured(g);
}

/** The glass's colours, bottom and top: the dark pane of the palette reflecting a little sky toward its top (the villa's panes do the same). */
export const glassCols = (d: SiteDraw, k = 0.5) => ({ lo: mix(d.p.glass, 0x6f8ea2, k * 0.25), hi: mix(d.p.glass, 0xa4c4d6, k) });
/**
 * A glazed opening on a face: a pane of reflecting glass `at` the plane + 4 cm, in slim frames (head, sill, jambs, a mullion every `mull` m) 2 cm proud of it.
 * 2 triangles for the glass, 2 per bar.
 */
export function pane(d: SiteDraw, face: Face, at: number, u0: number, u1: number, y0: number, y1: number, o: { mull?: number; frame?: number; sky?: number; head?: boolean; sill?: boolean } = {}) {
  const s = sign(face), g = glassCols(d, o.sky ?? 0.5), fr = o.frame ?? d.p.frame, T = 0.05;
  quads(d, d.glass, face, at + s * 0.04, [{ u0, u1, y0, y1, c: g.lo, c2: g.hi }]);
  const bars: Q[] = [];
  if (o.head !== false) bars.push({ u0, u1, y0: y1 - 0.07, y1, c: fr });
  if (o.sill !== false) bars.push({ u0, u1, y0, y1: y0 + 0.07, c: fr });
  bars.push({ u0, u1: u0 + T, y0, y1, c: fr }, { u0: u1 - T, u1, y0, y1, c: fr });
  if (o.mull) { const n = Math.max(1, Math.round((u1 - u0) / o.mull)), m = d.lite ? Math.ceil(n / 2) : n; for (let k = 1; k < m; k++) { const u = u0 + ((u1 - u0) * k) / m; bars.push({ u0: u - 0.03, u1: u + 0.03, y0, y1, c: fr }); } }
  quads(d, d.plain, face, at + s * 0.06, bars);
}
/** Vertical slats on a dark backing, one piece: a slat every `pitch` m (twice as far apart on the low preset), alternating two woods, a rail at the head and the foot. */
export function slats(d: SiteDraw, face: Face, at: number, u0: number, u1: number, y0: number, y1: number, o: { pitch?: number; w?: number; col?: number; col2?: number; back?: number; rails?: boolean } = {}) {
  const s = sign(face), pitch = (o.pitch ?? 0.2) * (d.lite ? 1.9 : 1), w = Math.min(pitch * 0.62, (o.w ?? 0.09) * (d.lite ? 1.5 : 1)), n = Math.max(1, Math.floor((u1 - u0 - w) / pitch));
  const c1 = o.col ?? d.p.wood, c2 = o.col2 ?? shade(c1, 0.8), back = o.back ?? mix(d.p.frame, c1, 0.3);
  quads(d, d.plain, face, at + s * 0.02, [{ u0, u1, y0, y1, c: back }]);
  const list: Q[] = [];
  const step = (u1 - u0 - w) / n;
  for (let k = 0; k <= n; k++) list.push({ u0: u0 + k * step, u1: u0 + k * step + w, y0, y1, c: k % 3 === 1 ? c2 : c1 });
  quads(d, d.plain, face, at + s * 0.05, list);
  if (o.rails !== false) quads(d, d.plain, face, at + s * 0.07, [{ u0: u0 - 0.03, u1: u1 + 0.03, y0: y1 - 0.09, y1, c: d.p.frame }, { u0: u0 - 0.03, u1: u1 + 0.03, y0, y1: y0 + 0.09, c: d.p.frame }]);
}
/** A frameless glass guard (a plane, a thin steel handrail, a post every `post` m) standing on `y`, `h` high, its plane at `at`. */
export function guard(d: SiteDraw, face: Face, at: number, u0: number, u1: number, y: number, h = 1.05, post = 0) {
  const s = sign(face), lo = mix(d.p.glass, 0xa9c8d8, 0.55), hi = mix(d.p.glass, 0xdcedf5, 0.75);
  quads(d, d.glass, face, at, [{ u0, u1, y0: y + 0.06, y1: y + h, c: lo, c2: hi }]);
  const bars: Q[] = [{ u0: u0 - 0.02, u1: u1 + 0.02, y0: y + h - 0.045, y1: y + h, c: 0xc5c8ca }, { u0: u0 - 0.02, u1: u1 + 0.02, y0: y, y1: y + 0.07, c: d.p.frame }];
  if (post && !d.lite) for (let u = u0 + post; u < u1 - 0.3; u += post) bars.push({ u0: u - 0.025, u1: u + 0.025, y0: y, y1: y + h, c: 0xc5c8ca });
  quads(d, d.plain, face, at + s * 0.012, bars);
}
/** Horizontal joints (a course of stone every `step` m): thin lines on a face. */
export function courses(d: SiteDraw, face: Face, at: number, u0: number, u1: number, y0: number, y1: number, step: number, col: number) {
  const s = sign(face), list: Q[] = [], st = step * (d.lite ? 2 : 1);
  for (let y = y0 + st; y < y1 - 0.05; y += st) list.push({ u0, u1, y0: y, y1: y + 0.035, c: col });
  quads(d, d.plain, face, at + s * 0.025, list);
}
/** A vertical rhythm of lines (piers' joints, a blind's folds): thin vertical strips every `step` m. */
export function strips(d: SiteDraw, face: Face, at: number, u0: number, u1: number, y0: number, y1: number, step: number, col: number, w = 0.04) {
  const s = sign(face), list: Q[] = [], st = step * (d.lite ? 2 : 1);
  for (let u = u0 + st; u < u1 - 0.05; u += st) list.push({ u0: u - w / 2, u1: u + w / 2, y0, y1, c: col });
  quads(d, d.plain, face, at + s * 0.025, list);
}

// ------------------------------------------------------------------------------------------------ pools, furniture, flags
/** A raised pool: its coping as ONE stone box and the water 3 cm over its top, inset by `rim` m (12 triangles), a glow at night. */
export function pool(d: SiteDraw, x0: number, z0: number, x1: number, z1: number, y: number, o: { rim?: number; h?: number; stone?: number; water?: number; lit?: number } = {}) {
  const rim = o.rim ?? 0.3, h = o.h ?? 0.3, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  d.box(d.plain, x1 - x0, h, z1 - z0, cx, y, cz, o.stone ?? 0xf4f1ea);
  d.flat(d.water, x1 - x0 - 2 * rim, z1 - z0 - 2 * rim, cx, y + h + 0.03, cz, o.water ?? 0x2fa8d8);
  if (!d.lite) { const n = o.lit ?? 1; for (let k = 0; k < n; k++) d.light(cx + (k - (n - 1) / 2) * ((x1 - x0) / Math.max(1, n)), cz, Math.min(2.6, (z1 - z0) * 0.7), y + h + 0.02); }
}
/** A lounger: its teak frame and a cushion on it (12 triangles); `rot` turns it (plan radians). */
export function lounger(d: SiteDraw, x: number, y: number, z: number, rot = 0, col: number = d.p.wood, cushion = 0xf3efe6) {
  d.box(d.plain, 0.7, 0.3, 1.9, x, y, z, col, rot);
  d.flat(d.plain, 0.6, 1.7, x, y + 0.31, z, cushion, rot);
}
/** A parasol: a square canvas pyramid on its pole (26 triangles). */
export function parasol(d: SiteDraw, x: number, y: number, z: number, col = 0xefe8da, r = 1.4) {
  d.box(d.plain, 0.06, 2.3, 0.06, x, y, z, 0x2c2d30);
  d.cyl(d.plain, 0.05, r, 0.42, x, y + 2.05, z, col, 4);
}
/** A flag pole on the metal batch (a box) with a banner of `col` near its top (20 triangles); the banner flies along x. */
export function flagPole(d: SiteDraw, x: number, z: number, h: number, col: number, dir = 1) {
  d.box(d.metal, 0.09, h, 0.09, x, Y0, z, 0xdfe2e4);
  d.box(d.plain, 1.35, 0.85, 0.025, x + dir * 0.72, Y0 + h - 1.05, z, col);
}
/** A table and its chairs' hint on a terrace: a round-ish top on a post (box top, 20 triangles). */
export function table(d: SiteDraw, x: number, y: number, z: number, col = 0xf3efe6) {
  d.box(d.plain, 0.07, 0.72, 0.07, x, y, z, 0x2c2d30);
  d.box(d.plain, 0.9, 0.05, 0.9, x, y + 0.72, z, col);
}
/**
 * A lighter palm (about 90 triangles beside the district's 190): one tapering trunk, eight fronds, a heart; the same crown, solid foot and camera canopy as
 * `palm` (src/world/parts.ts), drawn without random numbers. `sc` ≈ 0.8…1.3.
 */
export function slimPalm(d: SiteDraw, x: number, z: number, sc = 1, turn = 0, y = Y0) {
  const h = 6.0 * sc, c = d.c;
  d.cyl(d.trunks, 0.13 * sc, 0.22 * sc, h, x, y, z, c.bark, 5);
  const top = d.f.p(x + 0.1, z), ty = y + h, n = d.lite ? 6 : 8;
  for (let k = 0; k < n; k++) {
    const a = turn + (k / n) * Math.PI * 2, len = 3.2 * sc, r = len * 0.45, q = d.f.p(x + 0.1 + Math.sin(a) * r, z + Math.cos(a) * r);
    d.leaves.box(0.65 * sc, 0.1 * sc, len, q.x, ty - 0.35 * sc - (k % 2) * 0.25, q.z, k % 2 ? c.frond2 : c.frond, d.f.rot(a));
  }
  d.leaves.blob(0.38 * sc, top.x, ty - 0.1, top.z, c.heart, 1, 0);
  d.canopies.push({ x: top.x, z: top.z, r: 3.0 * sc, y0: ty - 0.8 * sc, y1: ty + 0.3 * sc });
  d.solid(x - 0.25, z - 0.25, x + 0.25, z + 0.25, 3);
  if (!d.lite) d.light(x + 0.4, z + 0.4, 2.1, 0.17);
}
/** A run of low hedge blobs (a clipped hedge, a bed of shrubs) from (x0, z) to (x1, z), `step` m apart. */
export function hedge(d: SiteDraw, x0: number, x1: number, z: number, o: { y?: number; r?: number; step?: number; col?: number; col2?: number; bloom?: number } = {}) {
  const step = (o.step ?? 1.1) * (d.lite ? 1.8 : 1), r = o.r ?? 0.45, y = o.y ?? Y0 + 0.3;
  for (let x = Math.min(x0, x1) + step / 2, k = 0; x < Math.max(x0, x1); x += step, k++) d.blob(d.leaves, r, x, y, z, o.bloom && k % 4 === 2 ? o.bloom : k % 2 ? (o.col2 ?? d.c.hedge2) : (o.col ?? d.c.hedge), 0.8, 0);
}
/** The lit underside of a roof edge: a bar of light (bulbs: dim by day, bright at night). */
export function litBar(d: SiteDraw, x0: number, x1: number, z: number, y: number, o: { d?: number; h?: number; col?: number } = {}) {
  d.box(d.bulbs, Math.abs(x1 - x0), o.h ?? 0.05, o.d ?? 0.1, (x0 + x1) / 2, y, z, o.col ?? 0xfff1c8);
}
/** A glass parapet round a roof rectangle (frameless panes in the sky's colour, a steel handrail): 4 glass boxes and 4 rails (80 triangles). */
export function glassRail(d: SiteDraw, r: { x0: number; x1: number; z0: number; z1: number }, y: number, h = 1.05) {
  const g = { hi: mix(d.p.glass, 0xe4f0f5, 0.9) }, t = 0.05, mx = (r.x0 + r.x1) / 2, mz = (r.z0 + r.z1) / 2, w = r.x1 - r.x0, dd = r.z1 - r.z0;
  for (const [bw, bd, x, z] of [[w, t, mx, r.z1], [w, t, mx, r.z0], [t, dd, r.x0, mz], [t, dd, r.x1, mz]] as const) {
    d.box(d.glass, bw, h, bd, x, y, z, g.hi);
    d.box(d.plain, bw + (bw > bd ? 0.05 : 0.03), 0.045, bd + (bw > bd ? 0.03 : 0.05), x, y + h, z, 0xc5c8ca);
  }
}

// ------------------------------------------------------------------------------------------------ what a design says about itself (for the checks)
/** What a hotel drew: its balconies (storey, span along the face, kind), its doors, the side its service end is on, the drop-off lane (plan rectangle). */
export interface HotelInfo {
  storeys: number;
  balconies: { floor: number; u0: number; u1: number; face: Face; kind: 'glass' | 'oak' | 'suite' | 'terrace' }[];
  doors: { kind: 'lobby' | 'staff' | 'service'; face: Face; x: number; z: number }[];
  serviceSide: 1 | -1;
  dropoff: { x0: number; z0: number; x1: number; z1: number } | null;
  /** The name board's plan position and height. */
  board: { x: number; z: number; y: number } | null;
}
const infos = new WeakMap<SiteDraw, HotelInfo>();
/** The record of a draw (made on first use); the district never reads it, the tests do. */
export function info(d: SiteDraw): HotelInfo {
  let i = infos.get(d);
  if (!i) infos.set(d, i = { storeys: d.site.storeys, balconies: [], doors: [], serviceSide: 1, dropoff: null, board: null });
  return i;
}
