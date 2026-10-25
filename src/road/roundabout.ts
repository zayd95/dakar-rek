import * as THREE from 'three';
import type { Batch } from '../world/batch';
import type { Collider, HubWorld } from '../world/types';
import type { Arm, Pt } from './network';

/**
 * A rond-point on a road between districts (a junction with `round: true`, src/road/routes.ts). Sacré-Cœur's (the owner's reference, after the M1 video): the BRT
 * corridor runs straight through it, its red busway cutting the planted island in two (`split`), the ring round it two lanes wide, splitter islands and zebras at the
 * ways in, brick pavements round its corners.
 *
 * How the traffic goes round: the road keeps its one spine, and both lanes swing out round the island (`swing`): a car going a → b keeps to the right of the spine, so it
 * passes the island on its LEFT; a car going b → a keeps to ITS right, the other side of the spine, and passes the island on its left too: both go round anticlockwise, as on
 * a right-hand rond-point. The swing is smooth (a cos² over `flare` metres each side of the centre), so a car at town speed follows it without a kink.
 *
 * Ground: the ring (an annulus of short capsules), the swung lanes' way in and out, never the island; with the island's halves solid, nobody drives through it. The busway
 * that crosses it is ground only where the ring crosses it (src/road/brt.ts: the buses' signal holds the ring there).
 *
 * Frames: the road's own (district a's). `ds` is the distance along the road from the centre, `lat` the offset across it (positive to the left of a → b).
 */
export interface RoundSpec {
  /** The raised island's radius (its kerb). */
  island: number;
  /** The lanes' centres at the island's widest (from the road's centre line). */
  lane: number;
  /** The ring's outer edge. */
  ring: number;
  /** Metres either side of the centre over which the lanes swing out and back. */
  flare: number;
  /** Half the width of the band that crosses the island (a busway and its kerbs), 0 for a whole island. */
  split: number;
}
/** The usual lane centre the swing starts from (src/road/traffic.ts LANE: 2.8). */
export const LANE_BASE = 2.8;
/** Sacré-Cœur's, the BRT through it: the island 32 m across, the ring 7 m wide. */
export const BRT_ROUND: RoundSpec = { island: 16, lane: 19.6, ring: 23.2, flare: 42, split: 5.8 };

export interface RoundLayout extends RoundSpec {
  name: string;
  /** The rond-point's arc length on the road, its centre, and the road's forward and left directions there. */
  s: number; x: number; z: number; fx: number; fz: number; lx: number; lz: number;
  /** A point at `ds` along and `lat` across from the centre (road frame). */
  at(ds: number, lat: number): Pt;
}

export function roundLayout(name: string, j: { s: number; x: number; z: number; yaw: number }, spec: RoundSpec): RoundLayout {
  const fx = Math.sin(j.yaw), fz = Math.cos(j.yaw), lx = Math.cos(j.yaw), lz = -Math.sin(j.yaw);
  return { ...spec, name, s: j.s, x: j.x, z: j.z, fx, fz, lx, lz, at: (ds, lat) => ({ x: j.x + fx * ds + lx * lat, z: j.z + fz * ds + lz * lat }) };
}

/** How far the lanes stand out from their usual offset at `ds` metres from a rond-point's centre (0 beyond its flare). */
export function swing(r: RoundSpec, ds: number): number {
  const u = Math.abs(ds) / r.flare;
  if (u >= 1) return 0;
  const c = Math.cos((u * Math.PI) / 2);
  return (r.lane - LANE_BASE) * c * c;
}

/** The ground a rond-point adds: its ring (short capsules round it) and the two swung lanes' way in and out. */
export function roundGround(r: RoundLayout): Arm[] {
  const out: Arm[] = [], n = 40, mid = (r.island + r.ring) / 2, half = (r.ring - r.island) / 2 + 0.4;
  for (let k = 0; k < n; k++) {
    const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2;
    out.push({ a: r.at(Math.cos(a0) * mid, Math.sin(a0) * mid), b: r.at(Math.cos(a1) * mid, Math.sin(a1) * mid), half });
  }
  for (const side of [-1, 1]) for (let ds = -r.flare; ds < r.flare; ds += 3) {
    const l0 = side * (LANE_BASE + swing(r, ds)), l1 = side * (LANE_BASE + swing(r, ds + 3));
    out.push({ a: r.at(ds, l0), b: r.at(ds + 3, l1), half: 3.6 });
  }
  return out;
}

/** Inside one of the island's halves (kerb included, `pad` more)? */
export function onIsland(r: RoundSpec & { x: number; z: number; fx: number; fz: number }, x: number, z: number, pad = 0): boolean {
  const dx = x - r.x, dz = z - r.z, ds = dx * r.fx + dz * r.fz;
  return Math.hypot(dx, dz) < r.island + pad && Math.abs(ds) > r.split - pad;
}

const WHITE = 0xeeeae0, KERB = 0xd8d2c4, APRON = 0xe4ded2, BRICK = 0xb76e52, GRASS = 0x5f8f3e;

/**
 * The rond-point's fixed things: the carriageway widened along the swing, the ring of asphalt, the island (in two halves when split: grass, shrubs, palms, flowers, a white
 * apron round each), the splitter islands and zebras on the main road's ways in, the low kerbs and brick pavements round the corners, lamps, the give-way lines.
 * Built once, by the chunk that holds its centre. `frame`: the road's frame at an arc length (from the chunk builder).
 */
export function buildRoundStatic(r: RoundLayout, b: { plain: Batch; asphalt: Batch; fac?: Batch }, colliders: Collider[], people: HubWorld['people'], lite: boolean, R: () => number,
  frame: (s: number) => { x: number; z: number; yaw: number; lx: number; lz: number }) {
  const { plain, asphalt } = b, Y = 0.08, MARK = 0.1, yaw = Math.atan2(r.fx, r.fz);
  const P = (ds: number, lat: number) => r.at(ds, lat);
  const sq = (p: Pt, half: number, h: number) => colliders.push({ x0: p.x - half, x1: p.x + half, z0: p.z - half, z1: p.z + half, h });
  const ASPH = new THREE.Color(0x4d5057);

  // the carriageway widened where the lanes swing round (a strip that follows the swing, each side), and the ring of asphalt
  {
    const pos: number[] = [], col: number[] = [], n = Math.ceil((2 * r.flare + 6) / 1.5);
    for (let k = 0; k <= n; k++) {
      const ds = -r.flare - 3 + (k * (2 * r.flare + 6)) / n, f = frame(r.s + ds), half = Math.max(5.5, LANE_BASE + swing(r, ds) + 2.6);
      pos.push(f.x - f.lx * half, Y + 0.002, f.z - f.lz * half, f.x + f.lx * half, Y + 0.002, f.z + f.lz * half); col.push(ASPH.r, ASPH.g, ASPH.b, ASPH.r, ASPH.g, ASPH.b);
    }
    const idx: number[] = []; for (let k = 0; k < n; k++) { const a = k * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx);
    asphalt.coloured(g);
    const ring = new THREE.RingGeometry(r.island, r.ring, 64); ring.rotateX(-Math.PI / 2); asphalt.geometry(ring, 0x4a4d53, r.x, Y + 0.004, r.z);
  }
  // the ring's markings: a dashed line between its two lanes, the solid white edge round the apron
  for (let k = 0; k < 72; k++) {
    const a = (k / 72) * Math.PI * 2, ds = Math.cos(a), dl = Math.sin(a);
    if (r.split && Math.abs(ds * r.lane) < r.split + 1.5) continue;                                          // (not across the busway)
    if (k % 2 === 0) { const p = P(ds * r.lane, dl * r.lane); plain.flat(0.13, 1.1, p.x, MARK, p.z, WHITE, yaw + Math.atan2(-ds, dl)); }
  }

  // the island: in two halves when the busway crosses it; each a raised bed (grass) behind a white apron, its kerb, shrubs and palms, a few flowers
  const halves: (1 | -1)[] = r.split ? [1, -1] : [1];
  for (const h of halves) {
    const sh = new THREE.Shape(), a0 = r.split ? Math.asin(Math.min(1, r.split / r.island)) : 0;
    const arc = (rad: number, from: number, to: number, path: THREE.Shape | THREE.Path, move = false) => {
      const n = 28; for (let k = 0; k <= n; k++) { const a = from + ((to - from) * k) / n, x = Math.sin(a) * rad, y = Math.cos(a) * rad; if (k === 0 && move) path.moveTo(x, y); else path.lineTo(x, y); }
    };
    // in shape space x is across the road (lat), y along it (ds): this half covers ds·h > split
    if (r.split) arc(r.island, -Math.PI / 2 + a0, Math.PI / 2 - a0, sh, true); else arc(r.island, 0, Math.PI * 2, sh, true);
    const top = (rad: number, col: number, y: number) => {
      const s2 = new THREE.Shape(); const b0 = r.split ? Math.asin(Math.min(1, (r.split + (r.island - rad)) / rad)) : 0;
      if (r.split) arc(rad, -Math.PI / 2 + b0, Math.PI / 2 - b0, s2, true); else arc(rad, 0, Math.PI * 2, s2, true);
      const g = new THREE.ShapeGeometry(s2, 8); g.rotateX(-Math.PI / 2); g.rotateY(Math.PI / 2);         // shape (x: lat, y: ds) → road frame: lat on +l, ds on +f
      if (h < 0) g.rotateY(Math.PI);
      plain.geometry(g, col, r.x, y, r.z, yaw - Math.PI / 2);
    };
    top(r.island, APRON, Y + 0.012);                                                                     // the white apron (mountable)
    top(r.island - 1.4, 0xf2f0ea, Y + 0.16);                                                            // the bed's kerb (a white rim)
    top(r.island - 1.6, GRASS, Y + 0.3);                                                                 // the grass
    // its solid part: squares inside the bed, never reaching the apron
    for (let ds = r.split + 1.4; ds < r.island - 1.5; ds += 1.6) for (let lat = -r.island; lat < r.island; lat += 1.6) {
      if (Math.hypot(ds, lat) + 1.15 > r.island - 1.7) continue;                                         // (a square's corner never past the bed's kerb)
      sq(P(h * ds, lat), 0.8, 0.6);
    }
    // the planting: low shrub masses, palms, white and red flowers (the reference's mixed bed)
    const nS = lite ? 10 : 34;
    for (let k = 0; k < nS; k++) {
      const a = (R() - 0.5) * (Math.PI - 2 * (r.split ? Math.asin(r.split / r.island) : 0)), rad = 2 + R() * (r.island - 4.5);
      const ds = h * Math.max(r.split + 1.8, Math.cos(a) * rad), lat = Math.sin(a) * rad, p = P(ds, lat);
      if (Math.hypot(ds, lat) > r.island - 2.2) continue;
      plain.blob(0.7 + R() * 0.8, p.x, Y + 0.6, p.z, [0x3f6f2f, 0x4a7a36, 0x557f3a, 0x2f5a26][Math.floor(R() * 4)], 0.65, 0);
      if (!lite && R() < 0.4) plain.blob(0.22, p.x + (R() - 0.5) * 1.2, Y + 0.45, p.z + (R() - 0.5) * 1.2, R() < 0.5 ? 0xf2f2ec : 0xd23a2a, 0.8, 0);
    }
    if (!lite) for (let k = 0; k < 3; k++) {
      const ds = h * (r.split + 3 + R() * (r.island * 0.5)), lat = (R() - 0.5) * r.island, p = P(ds, lat);
      if (Math.hypot(ds, lat) > r.island - 3) continue;
      plain.cyl(0.18, 0.26, 6.5 + R() * 2, p.x, Y + 0.3, p.z, 0xb9b2a2, 7);
      const top2 = Y + 7.2;
      for (let f = 0; f < 8; f++) { const fa = (f / 8) * Math.PI * 2; plain.slab(0.45, 0.08, 2.6, p.x + Math.sin(fa) * 1.1, top2, p.z + Math.cos(fa) * 1.1, 0x4c7d36, fa, -0.45); }
    }
  }

  // the main road's ways in and out: a small kerbed splitter island between its two lanes (a smooth teardrop, grass on top), white chevrons painted between the lanes from
  // it to the ring, a zebra across beyond it, the give-way line at the ring
  for (const side of [-1, 1] as const) {
    const d0 = r.ring + 3, d1 = Math.min(r.flare - 4, r.ring + 16), halfAt = (d: number) => Math.min(1.6, Math.max(0.35, LANE_BASE + swing(r, d) - 3.4) * Math.min(1, (d1 - d) / 4));
    const outline: Pt[] = [];
    for (let d = d0; d <= d1; d += 0.75) outline.push(P(side * d, halfAt(d)));
    for (let d = d1; d >= d0; d -= 0.75) outline.push(P(side * d, -halfAt(d)));
    const top = (inset: number, y: number, col: number) => {
      const sh = new THREE.Shape(outline.map(p => { const dx = p.x - r.x, dz = p.z - r.z, ds = dx * r.fx + dz * r.fz, lat = dx * r.lx + dz * r.lz; return new THREE.Vector2(lat * (1 - inset / 3), ds); }));
      const g = new THREE.ShapeGeometry(sh, 4); g.rotateX(-Math.PI / 2); g.rotateY(Math.PI / 2); g.rotateY(Math.PI);    // shape (x: lat, y: ds) → road frame (see the island)
      plain.geometry(g, col, r.x, y, r.z, yaw - Math.PI / 2);
    };
    top(0, Y + 0.17, KERB); top(0.6, Y + 0.2, GRASS);
    for (let d = d0 + 0.4; d < d1; d += 1.2) { const hw = halfAt(d); if (hw > 0.5) for (const l of [-hw + 0.4, hw - 0.4]) sq(P(side * d, l), 0.4, 0.4); }
    for (let d = r.ring + 0.8; d < d0; d += 1.2) {                                                         // the chevrons between the lanes, from the island to the ring
      const w = LANE_BASE + swing(r, d) - 2.2; if (w < 0.6) continue;
      for (const l of [-1, 1]) { const p = P(side * (d + 0.3), l * w * 0.5); plain.flat(0.25, w * 0.9, p.x, MARK, p.z, WHITE, yaw + Math.PI / 2 + l * side * 0.5); }
    }
    const z = frame(r.s + side * (d1 + 3));
    for (let k = -4; k <= 4; k++) plain.flat(2.6, 0.5, z.x + z.lx * k * 1.15, MARK, z.z + z.lz * k * 1.15, WHITE, z.yaw);
    // the give-way: dashes across the lane coming in, just outside the ring (the lane coming in on this side keeps to its right: lat < 0 for side −1, > 0 for side +1)
    const inLat = side < 0 ? -1 : 1, dIn = r.ring + 0.6, lIn = LANE_BASE + swing(r, dIn);
    for (let k = -2; k <= 2; k++) { const p = P(side * dIn, inLat * (lIn + k * 0.7)); plain.flat(0.5, 0.3, p.x, MARK, p.z, WHITE, yaw); }
  }

  // round the corners between the ways in: low kerbs on the ring's edge, brick pavements behind them, lamps, a tree or two, a few people
  const gapMain = 0.68, gapSide = r.split ? 0.62 : 0.55;                                                // the angles the ways in leave open (rad, from their axes)
  for (const q of [0, 1, 2, 3]) {
    const from = q * (Math.PI / 2) + (q % 2 === 0 ? gapMain : gapSide), to = (q + 1) * (Math.PI / 2) - ((q + 1) % 2 === 0 ? gapMain : gapSide);
    if (to <= from) continue;
    for (let a = from; a < to; a += 0.05) {
      const ds = Math.cos(a), dl = Math.sin(a), k = P(ds * (r.ring + 0.15), dl * (r.ring + 0.15)), pv = P(ds * (r.ring + 2.4), dl * (r.ring + 2.4));
      plain.box(0.3, 0.16, 1.25, k.x, Y, k.z, KERB, yaw + Math.atan2(-ds, dl));                         // (local z along the ring: rotY = yaw + a − π/2)
      plain.box(4.0, 0.1, 1.35, pv.x, Y, pv.z, BRICK, yaw + Math.atan2(-ds, dl));
    }
    const am = (from + to) / 2, lp = P(Math.cos(am) * (r.ring + 2.2), Math.sin(am) * (r.ring + 2.2));
    plain.cyl(0.09, 0.12, 9, lp.x, 0, lp.z, 0x3e4349, 6);
    plain.box(1.6, 0.12, 0.12, lp.x - Math.cos(am) * 0.8 * r.fx - Math.sin(am) * 0.8 * r.lx, 8.9, lp.z - Math.cos(am) * 0.8 * r.fz - Math.sin(am) * 0.8 * r.lz, 0x3e4349, yaw + Math.atan2(-Math.cos(am), Math.sin(am)) + Math.PI / 2);
    sq(lp, 0.18, 9);
    if (!lite) for (let k = 0; k < 2; k++) {
      const a = from + (k + 1) * (to - from) / 3, p = P(Math.cos(a) * (r.ring + 3.0), Math.sin(a) * (r.ring + 3.0));
      people.push({ x: p.x, z: p.z, yaw: Math.atan2(r.x - p.x, r.z - p.z) + (R() - 0.5), clip: R() < 0.5 ? 'Talk' : 'Idle' });
    }
    // a shade tree on the brick, and the corner's block behind (four to six floors, a shop on the ground floor toward the ring)
    if (!lite) { const tp = P(Math.cos(am + 0.12) * (r.ring + 3.4), Math.sin(am + 0.12) * (r.ring + 3.4)); plain.cyl(0.18, 0.25, 3.2, tp.x, 0, tp.z, 0x6e5a44, 6); plain.blob(2.0, tp.x, 4.6, tp.z, 0x557f3a, 0.7, 0); plain.blob(1.5, tp.x + 0.8, 5.2, tp.z - 0.5, 0x6c9a44, 0.7, 0); sq(tp, 0.3, 3); }
    if (b.fac) {
      const c = P(Math.cos(am) * (r.ring + 13.5), Math.sin(am) * (r.ring + 13.5)), w = 14, fl = 4 + Math.floor(R() * 3), h = fl * 3.2;
      const col = [0xf1e6d2, 0xe9cfae, 0xdfe6e8, 0xf4efe6, 0xe3c9a6, 0xdba57c][Math.floor(R() * 6)], by = yaw + am;
      b.fac.facade(w, h, w, c.x, 0, c.z, col, by);
      plain.box(w + 0.4, 0.3, w + 0.4, c.x, h, c.z, 0xd2cdc2, by);
      const f = P(Math.cos(am) * (r.ring + 6.4), Math.sin(am) * (r.ring + 6.4));
      plain.box(w * 0.7, 2.6, 0.12, f.x, 0, f.z, 0x2a2622, by + Math.PI / 2);
      plain.box(w * 0.7, 0.8, 0.16, f.x, 2.8, f.z, [0xd9482b, 0x1e6fd9, 0x2f8f4e, 0xf4c20d][Math.floor(R() * 4)], by + Math.PI / 2);
      for (let k = -2; k <= 2; k++) { const q = P(Math.cos(am) * (r.ring + 13.5) + Math.cos(am + Math.PI / 2) * k * (w / 5), Math.sin(am) * (r.ring + 13.5) + Math.sin(am + Math.PI / 2) * k * (w / 5)); sq(q, w / 10 + 0.05, h); }
      for (const k of [-1, 0, 1]) { const q = P(Math.cos(am) * (r.ring + 13.5 + k * (w / 3)), Math.sin(am) * (r.ring + 13.5 + k * (w / 3))); sq(q, w / 4, h); }
    }
  }
}
