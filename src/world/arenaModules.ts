import * as THREE from 'three';
import type { Batch } from './batch';
import {
  AISLE_HALF, PARAPET_H, PARAPET_R, ROOF_FRONT_R, TIER_DEPTH, TIERS, TUNNEL_HALF, TUNNEL_MOUTH_R, WALL_H, WALL_R, roofY, tierRadius, tierTop,
  type StandSection,
} from './geew';

/**
 * Reusable modules of the Pikine arena (the géew), drawn into the builder's merged batches (no draw call of their own):
 * one stand section (barrier, bannered parapet, three tiers with riser bands, seat edges and seat marks, colliders) repeated
 * between the aisles; the aisle stairs; the wrestlers' tunnel and their own gate in the outer wall; the media zone, the
 * drummers' stand and the two écuries' preparation corners at the ring side. Positions come from src/world/geew.ts, so the
 * stand seats of the visit and the crowd agree with what is drawn. Every écurie and banner is fictional, without brands.
 */
export interface ArenaKit {
  plain: Batch;
  concrete: Batch;
  /** Box collider centred on (x, z), axis-aligned. */
  solid(x: number, z: number, w: number, d: number, h: number): void;
  /** A sign panel facing `rotY` (one small mesh each: keep them few). */
  sign(text: string, bg: string, fg: string, x: number, y: number, z: number, rotY: number, w: number, h: number): void;
  /** Ground of the arena floor. */
  base: number;
  lite: boolean;
}
const at = (cx: number, cz: number, a: number, r: number) => ({ x: cx + Math.sin(a) * r, z: cz + Math.cos(a) * r });

const TIER_COL = [0xd5cbb8, 0xc6bba6, 0xb7ab95];
/** Riser bands and banners: neutral colours, a different one per section (no sponsor, no écurie on the stands). */
const BAND = [0x1a9d54, 0xf4c20d, 0xd9322b, 0x1e6fd9, 0x1a9d54, 0xf4c20d, 0xd9322b, 0x1e6fd9];
const BOARD = [0xf2f2ec, 0x1e6fd9, 0xd9482b, 0x2f8f4e, 0xf4c20d, 0x0f3d6e];
/** Seat places on a tier, every 0.62 m (the stand seats of the visit use the same gap). */
const SEAT_MARK = 0.62;

/** Pieces of an arc between two angles at radius r, each at most `max` metres long. */
function arc(a0: number, a1: number, r: number, max: number) {
  const n = Math.max(1, Math.ceil(((a1 - a0) * r) / max)), step = (a1 - a0) / n;
  return Array.from({ length: n }, (_, i) => ({ a: a0 + (i + 0.5) * step, w: step * r }));
}

/**
 * One section of stands between two gaps: crowd barrier, bannered parapet, three tiers (cast concrete) with a painted
 * riser band, a worn seat edge and seat marks, and colliders up to the roof (the player cannot climb the tiers; the follow
 * camera stays under the roof).
 */
export function standSection(k: ArenaKit, cx: number, cz: number, s: StandSection, index: number) {
  const { plain, concrete, base: B } = k, band = BAND[index % BAND.length];
  for (const p of arc(s.a0, s.a1, 16.4, 1.7)) {                                     // metal crowd barrier
    const { x, z } = at(cx, cz, p.a, 16.4);
    plain.box(p.w - 0.12, 0.05, 0.05, x, B + 1.0, z, 0xa9adb3, p.a);
    plain.box(p.w - 0.12, 0.05, 0.05, x, B + 0.25, z, 0xa9adb3, p.a);
    for (let v = 0; v < 4; v++) { const o = (v / 3 - 0.5) * (p.w - 0.2); plain.box(0.03, 0.8, 0.03, x + Math.cos(p.a) * o, B + 0.25, z - Math.sin(p.a) * o, 0xa9adb3, p.a); }
  }
  arc(s.a0, s.a1, PARAPET_R, 2.3).forEach((p, i) => {                             // bannered parapet in front of the first tier
    const { x, z } = at(cx, cz, p.a, PARAPET_R);
    plain.box(p.w + 0.04, PARAPET_H, 0.22, x, 0, z, 0xe9e4d8, p.a);
    if (i % 2 === 0) { const f = at(cx, cz, p.a, PARAPET_R - 0.13); plain.box(p.w * 0.9, 0.62, 0.03, f.x, 0.24, f.z, i % 4 === 0 ? band : BOARD[(index + i) % BOARD.length], p.a); }
  });
  for (let t = 0; t < TIERS; t++) {
    const r = tierRadius(t), top = tierTop(t);
    for (const p of arc(s.a0, s.a1, r, 1.6)) {
      const c = at(cx, cz, p.a, r), e = at(cx, cz, p.a, r - 0.6), b = at(cx, cz, p.a, r - 0.67);
      concrete.box(p.w + 0.05, top, TIER_DEPTH, c.x, 0, c.z, TIER_COL[t], p.a);              // cast concrete
      plain.box(p.w + 0.05, 0.12, 0.06, b.x, top - 0.18, b.z, band, p.a);                   // painted riser band
      plain.box(p.w + 0.05, 0.06, 0.12, e.x, top, e.z, 0xe9e4d8, p.a);                      // worn seat edge
    }
    if (!k.lite) for (const p of arc(s.a0, s.a1, r - 0.25, SEAT_MARK)) {                   // seat marks painted on the tread
      const m = at(cx, cz, p.a + (SEAT_MARK / 2) / (r - 0.25), r - 0.25);
      plain.flat(0.03, 0.75, m.x, top + 0.005, m.z, 0x8f8676, p.a);
    }
    for (const p of arc(s.a0, s.a1, r, 2.6)) { const c = at(cx, cz, p.a, r); k.solid(c.x, c.z, 2.6, 2.6, roofY(r)); }
  }
}

/**
 * Stairs of an aisle: each tier's span is two steps (half way up, then the tier's top), from the walkway in front of the
 * parapet to the top tier, with a handrail on each side. A collider covers it (the stands are not walkable yet).
 */
export function aisleStairs(k: ArenaKit, cx: number, cz: number, a: number) {
  const { plain, concrete, base: B } = k;
  let prev = B;
  for (let t = 0; t < TIERS; t++) {
    const r = tierRadius(t), top = tierTop(t), w = 2 * AISLE_HALF * (r - 0.4), d = TIER_DEPTH / 2;
    const f = at(cx, cz, a, r - d / 2), b = at(cx, cz, a, r + d / 2);
    concrete.box(w, (prev + top) / 2, d, f.x, 0, f.z, 0xcfc6b2, a);
    concrete.box(w, top, d, b.x, 0, b.z, 0xcfc6b2, a);
    for (const p of [f, b]) plain.box(w, 0.05, 0.08, p.x - Math.sin(a) * (d / 2 - 0.04), p === f ? (prev + top) / 2 : top, p.z - Math.cos(a) * (d / 2 - 0.04), 0xf4c20d, a);   // yellow nosing
    prev = top;
    const c = at(cx, cz, a, r); k.solid(c.x, c.z, 1.8, 1.8, roofY(r));
  }
  // first step from the walkway, in the parapet's gap
  const s0 = at(cx, cz, a, PARAPET_R);
  concrete.box(2 * AISLE_HALF * PARAPET_R, 0.55, 0.5, s0.x, 0, s0.z, 0xcfc6b2, a);
  // handrail posts on each side, at every tier's edge
  if (!k.lite) for (const side of [-1, 1]) {
    const off = side * (AISLE_HALF * 18.4 - 0.08);
    for (let t = 0; t <= TIERS; t++) {
      const r = t < TIERS ? tierRadius(t) - TIER_DEPTH / 2 : tierRadius(TIERS - 1) + TIER_DEPTH / 2 - 0.1, y = t ? tierTop(t - 1) : 0.55;
      const p = at(cx, cz, a, r);
      plain.box(0.05, 0.95, 0.05, p.x + Math.cos(a) * off, y, p.z - Math.sin(a) * off, 0x9aa0a6, a);
    }
  }
}

/**
 * The wrestlers' tunnel at angle 0: concrete side walls through the stands, a covered passage under the back of the
 * stands, a canopy over its mouth on the ring side (sign « ENTRÉE DES LUTTEURS »), a dark runner on the sand to the ring,
 * and railings that keep the passage clear. Its gate in the outer wall is `fightersGate`.
 */
export function tunnel(k: ArenaKit, cx: number, cz: number) {
  const { plain, concrete, base: B } = k;
  const half = Math.sin(TUNNEL_HALF) * tierRadius(0) - 0.15;                     // half width of the passage (≈ 2 m)
  const r0 = TUNNEL_MOUTH_R + 0.4, r1 = WALL_R;
  for (const sx of [-1, 1]) {
    // side walls, as high as the tiers they cut through, then the back wall's height
    const len = r1 - r0, mid = (r0 + r1) / 2;
    concrete.box(0.62, tierTop(TIERS - 1) + 0.35, len, cx + sx * (half + 0.31), 0, cz + mid, 0xbfb49f);
    plain.box(0.64, 0.14, len, cx + sx * (half + 0.31), tierTop(TIERS - 1) + 0.35, cz + mid, 0xe9e4d8);
    k.solid(cx + sx * (half + 0.31), cz + mid, 0.62, len, WALL_H);
    // railings from the mouth toward the ring
    for (let z = 11.4; z < TUNNEL_MOUTH_R; z += 1.2) {
      plain.box(0.04, 0.95, 0.04, cx + sx * half, B, cz + z, 0xa9adb3);
      plain.box(0.05, 0.05, 1.2, cx + sx * half, B + 0.9, cz + z + 0.6, 0xa9adb3);
    }
  }
  // covered passage under the back of the stands (darker inside) and the canopy over the mouth
  plain.slab(2 * half + 0.7, 0.3, r1 - tierRadius(1) + 0.4, cx, tierTop(TIERS - 1) + 0.2, cz + (tierRadius(1) + r1) / 2, 0x4a4036);
  plain.slab(2 * half + 1.4, 0.18, 1.6, cx, 3.35, cz + TUNNEL_MOUTH_R + 0.3, 0x7a3f1a);
  for (const sx of [-1, 1]) plain.box(0.25, 3.35, 0.25, cx + sx * (half + 0.55), 0, cz + TUNNEL_MOUTH_R - 0.35, 0x7a3f1a);
  k.sign('ENTRÉE DES LUTTEURS', '#3b1d0b', '#ffd98a', cx, 3.85, cz + TUNNEL_MOUTH_R - 0.52, Math.PI, 4.6, 0.62);   // facing the ring
  // a dark runner on the sand from the mouth to the sandbags
  plain.flat(2.2, TUNNEL_MOUTH_R - 9.6, cx, B + 0.045, cz + (TUNNEL_MOUTH_R + 9.6) / 2, 0x5a2a1e);
}

/** The wrestlers' own gate in the outer wall (+z), separate from the public gate: arch, sign, barriers, écurie flags. */
export function fightersGate(k: ArenaKit, cx: number, cz: number) {
  const { plain, base: B } = k, gz = cz + WALL_R, half = Math.sin(TUNNEL_HALF) * tierRadius(0) - 0.15;
  for (const sx of [-1, 1]) {
    plain.box(1.35, 4.6, 1.1, cx + sx * (half + 0.86), 0, gz, 0xc98a3a);           // pillars close the wall up to the gate
    plain.box(1.55, 0.3, 1.3, cx + sx * (half + 0.86), 4.6, gz, 0xf1ead8);
    k.solid(cx + sx * (half + 0.86), gz, 1.35, 1.1, 4.6);
    // a short corridor of barriers outside: the wrestlers and their people arrive here, away from the public queue
    for (let n = 0; n < 3; n++) {
      const z = gz + 1.6 + n * 2.1, x = cx + sx * (half + 0.9);
      for (const y of [0.15, 1.05]) plain.box(0.04, 0.04, 2.0, x, B + y, z, 0xa8adb1);
      for (let v = 0; v < 8; v++) plain.box(0.025, 0.9, 0.025, x, B + 0.15, z - 0.95 + v * 0.27, 0xb8bdc1);
    }
  }
  plain.box(2 * half + 3.0, 1.0, 0.9, cx, 3.8, gz, 0x7a3f1a);
  k.sign('ENTRÉE DES LUTTEURS', '#3b1d0b', '#ffd98a', cx, 4.3, gz + 0.47, 0, 4.4, 0.7);                // facing the street (+z)
  // the two écuries' flags at the gate (fictional écuries of the game: Baobab green, Teranga red)
  for (const [sx, col] of [[-1, 0x1a7a44], [1, 0xc8322a]] as const) {
    const x = cx + sx * (half + 2.2), z = gz + 1.2;
    plain.box(0.07, 4.4, 0.07, x, B, z, 0x555555);
    plain.box(1.3, 0.85, 0.03, x + sx * 0.66, 3.3, z, col);
  }
}

/** Media zone at the ring side (−x): a press table with laptops and chairs, three cameras on tripods, a « PRESSE » sign. */
export function mediaZone(k: ArenaKit, cx: number, cz: number) {
  const { plain, base: B } = k, a = -Math.PI / 2, r = 13.4, c = at(cx, cz, a, r);
  plain.flat(4.6, 3.2, c.x, B + 0.04, c.z, 0x3a3f46, a);                                   // rubber mat
  plain.box(3.4, 0.75, 0.8, c.x - 0.5, B, c.z, 0xf2f2ec, a);                               // press table (along z)
  for (let n = 0; n < 3; n++) {
    const z = c.z - 1.1 + n * 1.1;
    plain.box(0.36, 0.02, 0.26, c.x - 0.55, B + 0.75, z, 0x1c1c1e, a);                     // laptop base
    plain.box(0.36, 0.24, 0.02, c.x - 0.72, B + 0.76, z, 0x2a6f9a, a);                     // lit screen
    plain.box(0.44, 0.45, 0.44, c.x - 1.3, B, z, 0x2b2f36, a);                             // chair
  }
  k.solid(c.x - 0.5, c.z, 0.9, 3.4, 0.8);
  for (const dz of [-1.9, 0.2, 2.0]) {                                                     // cameras on tripods, aimed at the ring
    const x = c.x + 1.3, z = c.z + dz;
    for (let l = 0; l < 3; l++) { const la = (l / 3) * Math.PI * 2; plain.box(0.03, 1.45, 0.03, x + Math.sin(la) * 0.22, B, z + Math.cos(la) * 0.22, 0x2b2b2b); }
    plain.box(0.22, 0.22, 0.42, x, B + 1.45, z, 0x1c1c1e, Math.PI / 2);
    plain.cyl(0.07, 0.07, 0.16, x + 0.28, B + 1.5, z, 0x111111, 10, [0, 0, Math.PI / 2]);
  }
  k.sign('PRESSE', '#0f3d6e', '#ffffff', c.x - 0.95, 1.55, c.z, Math.PI / 2, 1.6, 0.42);              // facing the ring (+x)
}

/** The drummers' stand near the tunnel's mouth: a wooden deck with tall sabar drums and a bench. Returns where they play (on the deck). */
export function drummersStand(k: ArenaKit, cx: number, cz: number): { x: number; y: number; z: number; yaw: number }[] {
  const { plain, base: B } = k, a = 0.42, r = 14.2, c = at(cx, cz, a, r), yaw = a + Math.PI;
  plain.box(3.6, 0.3, 1.8, c.x, B, c.z, 0x8b5a32, a);                                      // deck
  plain.box(3.4, 0.42, 0.4, at(cx, cz, a, r + 0.55).x, B + 0.3, at(cx, cz, a, r + 0.55).z, 0x6b4a2e, a);   // bench at the back
  k.solid(c.x, c.z, 2.6, 2.6, 0.7);
  const spots: { x: number; y: number; z: number; yaw: number }[] = [];
  for (let n = 0; n < 4; n++) {
    const o = (n - 1.5) * 0.85, p = { x: c.x + Math.cos(a) * o, z: c.z - Math.sin(a) * o };
    plain.cyl(0.16, 0.1, 0.82, p.x - Math.sin(a) * 0.35, B + 0.3, p.z - Math.cos(a) * 0.35, 0x7a4a24, 10);   // sabar
    plain.cyl(0.17, 0.17, 0.04, p.x - Math.sin(a) * 0.35, B + 1.12, p.z - Math.cos(a) * 0.35, 0xe8dcc0, 10);  // skin
    spots.push({ x: p.x + Math.sin(a) * 0.15, y: B + 0.3, z: p.z + Math.cos(a) * 0.15, yaw });
  }
  return spots;
}

/**
 * Preparation corner of one écurie at the ring side, beside the tunnel: a mat, a bench, water and buckets, a low fence
 * and a banner in the écurie's colour. Returns where its people stand.
 */
export function prepCorner(k: ArenaKit, cx: number, cz: number, side: -1 | 1, colour: number): { x: number; z: number; yaw: number }[] {
  const { plain, base: B } = k, a = side * 0.78, r = 13.6, c = at(cx, cz, a, r), yaw = a + Math.PI;
  plain.flat(2.8, 2.2, c.x, B + 0.045, c.z, 0x6b5a46, a);                                  // woven mat
  const back = at(cx, cz, a, r + 1.2);
  plain.box(2.4, 0.45, 0.4, back.x, B, back.z, 0x8b6a47, a);                              // bench
  for (const o of [-0.9, 0.9]) {                                                           // buckets and water bottles
    const p = at(cx, cz, a + o / r, r + 0.7);
    plain.cyl(0.18, 0.15, 0.32, p.x, B, p.z, 0x2a6fb3, 10);
    plain.cyl(0.04, 0.04, 0.26, p.x + 0.3, B, p.z + 0.1, 0xdfe9f2, 6);
  }
  for (const o of [-1.5, 1.5]) {                                                           // low fence posts and rail
    const p = at(cx, cz, a + o / r, r);
    plain.box(0.06, 0.8, 0.06, p.x, B, p.z, 0x8a8f96);
  }
  const front = at(cx, cz, a, r - 1.1);
  plain.box(3.0, 0.05, 0.05, front.x, B + 0.75, front.z, 0x8a8f96, a);
  // banner on two poles behind the bench, in the écurie's colour
  for (const o of [-1.1, 1.1]) { const p = at(cx, cz, a + o / r, r + 1.6); plain.box(0.06, 2.6, 0.06, p.x, B, p.z, 0x555555); }
  const bn = at(cx, cz, a, r + 1.6);
  plain.box(2.2, 1.0, 0.03, bn.x, B + 1.45, bn.z, colour, a);
  plain.box(2.2, 0.12, 0.035, bn.x, B + 1.45, bn.z, 0xf2f2ec, a);
  k.solid(back.x, back.z, 2.0, 2.0, 0.5);
  return [-0.6, 0.6, 0].map((o, i) => { const p = at(cx, cz, a + o / r, r - (i === 2 ? 0.4 : -0.2)); return { x: p.x, z: p.z, yaw }; });
}

/** Section letters on the parapet, facing the ring: one mesh for the whole arena (letters from one small atlas). */
export function sectionPlates(cx: number, cz: number, sections: readonly StandSection[]): THREE.Mesh | null {
  if (typeof document === 'undefined') return null;
  const cell = 128, cv = document.createElement('canvas'); cv.width = cell * sections.length; cv.height = cell;
  const g = cv.getContext('2d'); if (!g) return null;
  sections.forEach((s, i) => {
    g.fillStyle = '#14324f'; g.fillRect(i * cell + 4, 4, cell - 8, cell - 8);
    g.fillStyle = '#ffffff'; g.font = 'bold 30px sans-serif'; g.textAlign = 'center'; g.fillText('TRIBUNE', i * cell + cell / 2, 46);
    g.font = 'bold 56px sans-serif'; g.fillText(s.id, i * cell + cell / 2, 106);
  });
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 2;
  const parts: THREE.BufferGeometry[] = [];
  sections.forEach((s, i) => {
    const a = (s.a0 + s.a1) / 2, p = at(cx, cz, a, PARAPET_R - 0.13);
    const q = new THREE.PlaneGeometry(0.7, 0.7);
    const uv = q.attributes.uv as THREE.BufferAttribute;
    for (let v = 0; v < uv.count; v++) uv.setX(v, (i + uv.getX(v)) / sections.length);
    q.rotateY(a + Math.PI); q.translate(p.x, PARAPET_H + 0.42, p.z);
    parts.push(q);
  });
  const merged = mergeAll(parts);
  const m = new THREE.Mesh(merged, new THREE.MeshLambertMaterial({ map: tex }));
  m.name = 'arena_section_plates';
  return m;
}
function mergeAll(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  let base = 0;
  for (const p of parts) {
    const P = p.attributes.position, N = p.attributes.normal, U = p.attributes.uv;
    for (let i = 0; i < P.count; i++) { pos.push(P.getX(i), P.getY(i), P.getZ(i)); nor.push(N.getX(i), N.getY(i), N.getZ(i)); uv.push(U.getX(i), U.getY(i)); }
    for (const i of Array.from(p.index!.array)) idx.push(base + i);
    base += P.count; p.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeBoundingSphere();
  return g;
}
/** Front edge of the roof, for checks that frame the stands from the ring. */
export const ROOF_EDGE_R = ROOF_FRONT_R;
