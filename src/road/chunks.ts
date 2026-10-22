import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Batch } from '../world/batch';
import { addGrain } from '../world/grain';
import { generatedTexture } from '../world/textures';
import { hubSurface, lightPoolTexture } from '../world/builder';
import { rng } from '../core/rng';
import type { Collider, HubWorld } from '../world/types';
import { ROAD_HALF, SHOULDER, type Profile, type Road } from './routes';

/**
 * One stretch of a road between districts, built from its centre line: ground, carriageway, kerbs, markings and the roadside (lamps, poles, walls, houses, stalls, parked vehicles…).
 * A chunk is `CHUNK` metres of road, deterministic from its index (the same chunk is the same wherever and whenever it is built), small (three merged meshes, a few dozen
 * boxes) and self-contained: its geometry lives in the road's own frame (a's), the corridor's group carries it into whichever district's frame the player is in, its colliders
 * are in the same frame and are offset when they are registered (src/road/corridor.ts), and `dispose()` frees everything it made.
 */
export const CHUNK = 100;
const ROAD_Y = 0.08, GROUND_Y = 0.012, MARK_Y = 0.1, KERB = ROAD_HALF + 1.5, VERGE = ROAD_HALF + SHOULDER + 1;
const ASPHALT = 0x4d5057;

/** The materials every chunk shares (made once for the road, freed with it). `lite`: no procedural grain or detail texture (the Low quality preset). */
export class ChunkMats {
  readonly ground: THREE.MeshLambertMaterial; readonly asphalt: THREE.MeshLambertMaterial; readonly plain: THREE.MeshLambertMaterial;
  /** Lamp heads (dimmer by day, full at night) and the pools of light on the road under them (night only), like the districts' own (world/builder.ts). */
  readonly bulb = new THREE.MeshBasicMaterial({ vertexColors: true });
  readonly glow = new THREE.MeshBasicMaterial({ map: typeof document !== 'undefined' ? lightPoolTexture() : null, color: 0xffb860, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, visible: false });
  constructor(lite: boolean) {
    this.ground = addGrain(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), 1.2, 0.5, false, lite ? undefined : generatedTexture('sand'), 3) as THREE.MeshLambertMaterial;
    this.asphalt = addGrain(new THREE.MeshLambertMaterial({ vertexColors: true }), 0.5, 1, false, lite ? undefined : generatedTexture('asphalt'), 3) as THREE.MeshLambertMaterial;
    this.plain = addGrain(new THREE.MeshLambertMaterial({ vertexColors: true }), 1, 1) as THREE.MeshLambertMaterial;
  }
  /** `night`: 0 (day) … 1. */
  setNight(night: number) { this.bulb.color.setScalar(0.45 + 0.55 * night); this.glow.visible = night > 0.3; }
  dispose() { this.ground.dispose(); this.asphalt.dispose(); this.plain.dispose(); this.bulb.dispose(); this.glow.dispose(); }
}

export interface Chunk {
  index: number;
  group: THREE.Group;
  /** Solid things (road frame). */
  colliders: Collider[];
  /** Roadside people to place (road frame), with the clip they play. */
  people: HubWorld['people'];
  s0: number; s1: number;
  dispose(): void;
}

const lerpHex = (a: number, b: number, t: number) => new THREE.Color(a).lerp(new THREE.Color(b), Math.max(0, Math.min(1, t)));
const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** The road's frame at `s`: point, heading by central difference (smooth through the bends), the left-hand unit vector. */
function frame(road: Road, s: number) {
  const a = road.spine.at(s - 2), b = road.spine.at(s + 2), p = road.spine.at(s), yaw = Math.atan2(b.x - a.x, b.z - a.z);
  return { x: p.x, z: p.z, yaw, lx: Math.cos(yaw), lz: -Math.sin(yaw) };
}

/** A strip of the road between two lateral offsets (m, positive left) from s0 to s1 at height y, coloured by `colour(s)`. */
function ribbon(road: Road, s0: number, s1: number, l0: number, l1: number, y: number, colour: (s: number) => THREE.Color, step = 10): THREE.BufferGeometry {
  const n = Math.max(1, Math.ceil((s1 - s0) / step)), pos: number[] = [], col: number[] = [];
  const at = (k: number) => { const s = s0 + ((s1 - s0) * k) / n, f = frame(road, s), c = colour(s); return { f, c }; };
  const push = (v: { f: ReturnType<typeof frame>; c: THREE.Color }, l: number) => { pos.push(v.f.x + v.f.lx * l, y, v.f.z + v.f.lz * l); col.push(v.c.r, v.c.g, v.c.b); };
  for (let k = 0; k < n; k++) {
    const a = at(k), b = at(k + 1);
    push(a, l0); push(b, l0); push(a, l1);                       // counter-clockwise seen from above (left is +l)
    push(a, l1); push(b, l0); push(b, l1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/** A straight strip from a to b (arm roads of a junction). */
function strip(ax: number, az: number, bx: number, bz: number, half: number, y: number, color: THREE.Color): THREE.BufferGeometry {
  const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1, lx = dz / L, lz = -dx / L;     // left of a→b is (cos yaw, −sin yaw) with yaw = atan2(dx, dz)
  const v = [[ax + lx * half, az + lz * half], [bx + lx * half, bz + lz * half], [ax - lx * half, az - lz * half], [bx - lx * half, bz - lz * half]];
  const pos = [v[0], v[2], v[1], v[1], v[2], v[3]].flatMap(p => [p[0], y, p[1]]), col = Array.from({ length: 6 }, () => [color.r, color.g, color.b]).flat();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  if (g.attributes.normal.getY(0) < 0) { const n = g.attributes.normal as THREE.BufferAttribute; for (let i = 0; i < n.count; i++) n.setY(i, -n.getY(i)); }
  return g;
}

const PIKINE_PALETTE = [0x5fa8c9, 0x8fcf9a, 0xe7b45a, 0xe58aa0, 0xd9d2c4, 0x9c8fd1, 0xd96f4f, 0x7fb8a4, 0xc4a574, 0xa67c52];
const VILLA_PALETTE = [0xfafafa, 0xf3f0ea, 0xeeeeee, 0xf7efe2];
const AWNING = [0xd9482b, 0xf4c20d, 0x1e6fd9, 0x2f8f4e, 0xe8742c, 0x6b3fa0];
const BLOCK = 0xb4a58f;

export interface ChunkOpts { road: Road; mats: ChunkMats; lite: boolean; /** road-frame positions that must stay clear (the player's own parked vehicle…) */ keepClear?: { x: number; z: number; r: number }[] }

/** Builds chunk `index` (road metres [index·CHUNK, (index+1)·CHUNK]). */
export function buildChunk(o: ChunkOpts, index: number): Chunk {
  const { road } = o, L = road.length;
  const s0 = index * CHUNK, s1 = Math.min(L, s0 + CHUNK + 4);        // a few metres of overlap: no seam between two chunks
  const R = rng(0x5f3a + index * 7919 + road.id.length * 131 + road.id.charCodeAt(0) * 17);
  const sa = hubSurface(road.def.a), sb = hubSurface(road.def.b);
  const plain = new Batch(), asphalt = new Batch(), ground = new Batch(), bulbs = new Batch(), pools: THREE.BufferGeometry[] = [];
  const colliders: Collider[] = [], people: HubWorld['people'] = [];
  const disposables: { dispose(): void }[] = [];
  const group = new THREE.Group(); group.name = `road:${road.id}:${index}`;

  /**
   * A solid box (width w across, depth d along its heading) as colliders. A box turned off the axes (the road runs at an angle) is a CHAIN of small boxes along its long side, not one big
   * axis-aligned one: the single box's corners would swell far into the carriageway (the lanes must stay clear at every angle: chunks.test.ts).
   */
  const solid = (cx: number, cz: number, w: number, d: number, h: number, yaw = 0) => {
    const c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw)), diag = Math.abs(Math.sin(2 * yaw)) > 0.2, long = Math.max(w, d), short = Math.min(w, d);
    const n = diag && short > 0.3 && long > short * 1.4 ? Math.min(6, Math.round(long / short)) : 1;
    const sw = d >= w ? w : w / n, sd = d >= w ? d / n : d;
    const hw = (sw * c + sd * s) / 2, hd = (sw * s + sd * c) / 2;
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : ((i + 0.5) / n - 0.5) * long;
      const ox = d >= w ? Math.sin(yaw) * t : Math.cos(yaw) * t, oz = d >= w ? Math.cos(yaw) * t : -Math.sin(yaw) * t;
      colliders.push({ x0: cx + ox - hw, x1: cx + ox + hw, z0: cz + oz - hd, z1: cz + oz + hd, h });
    }
  };
  const clear = (x: number, z: number, r: number) => !o.keepClear?.some(k => Math.hypot(k.x - x, k.z - z) < k.r + r);

  // colours blend from a's surfaces to b's along the road: Pikine's dirt road becomes asphalt within 200 m, and Almadies's asphalt is reached before its first street
  const roadCol = (s: number) => lerpHex(lerpHex(sa.road, ASPHALT, smooth(40, 220, s)).getHex(), sb.road, smooth(L - 220, L - 40, s));
  const walkCol = (s: number) => lerpHex(sa.walk, sb.walk, s / L);
  const groundCol = (s: number) => lerpHex(sa.ground, sb.ground, s / L);
  const dustCol = (s: number) => groundCol(s).multiplyScalar(0.94);

  // ground, wide enough that the road never floats on nothing; the hub's own plane lies a few cm below it
  ground.coloured(ribbon(road, s0, s1, -200, 200, GROUND_Y, groundCol, 25));
  // verge and pavements
  plain.coloured(ribbon(road, s0, s1, KERB, VERGE + 0.5, GROUND_Y + 0.03, dustCol, 12));
  plain.coloured(ribbon(road, s0, s1, -VERGE - 0.5, -KERB, GROUND_Y + 0.03, dustCol, 12));
  plain.coloured(ribbon(road, s0, s1, ROAD_HALF, KERB, ROAD_Y - 0.02, walkCol, 12));
  plain.coloured(ribbon(road, s0, s1, -KERB, -ROAD_HALF, ROAD_Y - 0.02, walkCol, 12));
  // carriageway
  asphalt.coloured(ribbon(road, s0, s1, -ROAD_HALF, ROAD_HALF, ROAD_Y, roadCol, 8));

  // junction arms and their zebra crossings
  for (const j of road.junctionS) {
    if (j.s < s0 - 60 || j.s > s1 + 60) continue;
    for (const m of j.arms) {
      asphalt.coloured(strip(m.a.x, m.a.z, m.b.x, m.b.z, m.half, ROAD_Y + 0.003, ASPHALT3));
      const dx = m.b.x - m.a.x, dz = m.b.z - m.a.z, l = Math.hypot(dx, dz), ux = dx / l, uz = dz / l, yaw = Math.atan2(ux, uz);
      for (let k = -4; k <= 4; k++) plain.flat(0.5, 3, m.a.x + ux * 11 - uz * k * 1.1, MARK_Y, m.a.z + uz * 11 + ux * k * 1.1, 0xe8e4d8, yaw + Math.PI / 2);
    }
    // zebra crossings across the main road on both sides of the junction
    for (const side of [-1, 1]) {
      const f = frame(road, j.s + side * 12);
      for (let k = -4; k <= 4; k++) plain.flat(2.6, 0.5, f.x + f.lx * k * 1.15, MARK_Y, f.z + f.lz * k * 1.15, 0xe8e4d8, f.yaw);
    }
  }
  const nearJunction = (s: number, pad = 46) => road.junctionS.some(j => Math.abs(j.s - s) < pad);

  // markings: centre dashes and the edges of the carriageway (none on a dirt road)
  for (let s = Math.ceil(s0 / 9) * 9; s < Math.min(s1 - 4, L); s += 9) {
    const prof = road.profileAt(s);
    const dirt = smooth(40, 220, s) < 0.6 && s < L / 2;
    if (dirt || prof === 'banlieue') continue;
    if (nearJunction(s, 8)) continue;
    const f = frame(road, s + 1.5);
    plain.flat(0.2, 3.2, f.x, MARK_Y, f.z, 0xe8e4d8, f.yaw);
  }
  if (s0 > 220 && s1 < L - 40) {
    for (const l of [-ROAD_HALF + 0.35, ROAD_HALF - 0.35]) plain.coloured(ribbon(road, s0, s1, l - 0.09, l + 0.09, MARK_Y, () => new THREE.Color(0xe8e4d8), 12));
  }

  // roadside, every few metres of the chunk, by what the road is like there
  const place = (s: number, lat: number) => { const f = frame(road, s); return { x: f.x + f.lx * lat, z: f.z + f.lz * lat, yaw: f.yaw, f }; };
  const lamp = (s: number, side: number) => {
    const p = place(s, side * (KERB + 0.6)), arm = -side;
    plain.cyl(0.07, 0.1, 6.6, p.x, 0, p.z, 0x3e4349, 6);
    const ax = p.x + p.f.lx * arm * 1.1, az = p.z + p.f.lz * arm * 1.1;
    plain.box(2.2, 0.1, 0.1, ax, 6.6, az, 0x3e4349, p.yaw + Math.PI / 2);
    bulbs.box(0.5, 0.14, 0.28, p.x + p.f.lx * arm * 2, 6.5, p.z + p.f.lz * arm * 2, 0xfff1c0, p.yaw + Math.PI / 2);
    const g = new THREE.PlaneGeometry(14, 14); g.rotateX(-Math.PI / 2); g.translate(p.x + p.f.lx * arm * 2, ROAD_Y + 0.06, p.z + p.f.lz * arm * 2); pools.push(g);
    solid(p.x, p.z, 0.5, 0.5, 6.6);
  };
  const pole = (s: number, side: number) => {
    const p = place(s, side * (VERGE - 0.4));
    plain.cyl(0.1, 0.13, 8, p.x, 0, p.z, 0x7a6a55, 6);
    plain.box(2.4, 0.12, 0.12, p.x, 7.4, p.z, 0x5b4f40, p.yaw + Math.PI / 2);
    for (const k of [-1, 0, 1]) plain.box(0.07, 0.07, 0.07, p.x + p.f.lx * k * 1.0, 7.5, p.z + p.f.lz * k * 1.0, 0xdddddd);
    solid(p.x, p.z, 0.4, 0.4, 8);
  };
  const palm = (s: number, lat: number, sc = 1) => {
    const p = place(s, lat), h = 6.4 * sc;
    plain.cyl(0.2 * sc, 0.28 * sc, h, p.x, 0.05, p.z, 0x8a6d4a, 5);
    for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2 + R() * 0.5, len = 3.2 * sc; plain.box(0.7 * sc, 0.1 * sc, len, p.x + Math.sin(a) * len * 0.45, h - 0.1, p.z + Math.cos(a) * len * 0.45, k % 2 ? 0x2f7f3e : 0x3d9450, a); }
    if (Math.abs(lat) < VERGE + 0.5) solid(p.x, p.z, 0.6, 0.6, h);
  };
  const wall = (s: number, side: number, len: number, col: number, h = 1.6) => {
    const p = place(s + len / 2, side * (VERGE + 0.3));
    plain.box(0.25, h, len, p.x, 0, p.z, col, p.f.yaw);
    plain.box(0.4, 0.15, len + 0.1, p.x, h, p.z, 0xd8d0c0, p.f.yaw);
  };
  const house = (s: number, lat: number, w: number, d: number, h: number, col: number, flat = true) => {
    const p = place(s, lat);
    plain.box(w, h, d, p.x, 0, p.z, col, p.f.yaw);
    if (flat) plain.box(w + 0.3, 0.2, d + 0.3, p.x, h, p.z, 0xe2dccf, p.f.yaw);
    else plain.box(w + 0.4, 0.15, d + 0.4, p.x, h, p.z, 0x9a9588, p.f.yaw);
    const door = R() < 0.6;
    if (door) plain.box(1.2, 2.0, 0.1, p.x - p.f.lx * 0, 0.0, p.z, PIKINE_PALETTE[Math.floor(R() * PIKINE_PALETTE.length)], p.f.yaw);
  };
  const stall = (s: number, side: number) => {
    const lat = side * (VERGE - 1.4), p = place(s, lat), col = AWNING[Math.floor(R() * AWNING.length)];
    plain.box(2.6, 0.9, 1.6, p.x, 0, p.z, 0x8a6d4a, p.yaw);
    plain.slab(3.0, 0.12, 2.2, p.x, 2.4, p.z, col, p.yaw, side * 0.12);
    for (const [dx, dz] of [[-1.3, -0.8], [1.3, -0.8], [-1.3, 0.8], [1.3, 0.8]]) plain.box(0.08, 2.4, 0.08, p.x + p.f.lx * dz + Math.sin(p.yaw) * dx, 0, p.z + p.f.lz * dz + Math.cos(p.yaw) * dx, 0x5b4f40);
    for (let k = 0; k < 5; k++) plain.box(0.4, 0.3, 0.4, p.x + Math.sin(p.yaw) * (k - 2) * 0.5, 0.9, p.z + Math.cos(p.yaw) * (k - 2) * 0.5, [0xd9482b, 0xf4c20d, 0x2f8f4e, 0xe8742c, 0xd96f4f][k]);
    solid(p.x, p.z, 3.0, 2.0, 2.4, p.yaw);
    people.push({ x: p.x + p.f.lx * -side * 0.2, z: p.z + p.f.lz * -side * 0.2, yaw: p.yaw + (side > 0 ? -Math.PI / 2 : Math.PI / 2), clip: R() < 0.5 ? 'Talk' : 'Idle' });
  };
  const billboard = (s: number, side: number) => {
    const p = place(s, side * 15), col = [0xd9482b, 0x1e6fd9, 0xf4c20d, 0x2f8f4e][Math.floor(R() * 4)];
    for (const k of [-2.6, 2.6]) plain.cyl(0.14, 0.14, 6, p.x + Math.sin(p.yaw) * k, 0, p.z + Math.cos(p.yaw) * k, 0x555a60, 6);
    plain.box(8, 3.4, 0.25, p.x, 5, p.z, 0xf1efe8, p.yaw + Math.PI / 2 + (side > 0 ? 0 : Math.PI));
    plain.box(7.4, 2.2, 0.3, p.x, 5.5, p.z, col, p.yaw + Math.PI / 2 + (side > 0 ? 0 : Math.PI));
  };
  const station = (s: number, side: number) => {
    const p = place(s, side * 20);
    plain.box(16, 0.4, 9, p.x, 5.2, p.z, 0xe8e4d8, p.yaw); plain.box(16.2, 0.5, 9.2, p.x, 5.6, p.z, 0xc0392b, p.yaw);
    for (const [dx, dz] of [[-6, -3], [6, -3], [-6, 3], [6, 3]]) plain.box(0.4, 5.2, 0.4, p.x + Math.sin(p.yaw) * dx + p.f.lx * dz, 0, p.z + Math.cos(p.yaw) * dx + p.f.lz * dz, 0xe8e4d8);
    for (const k of [-3, 0, 3]) plain.box(0.7, 1.5, 0.5, p.x + Math.sin(p.yaw) * k, 0, p.z + Math.cos(p.yaw) * k, 0xd9d2c4);
    solid(p.x, p.z, 16, 9, 1.5, p.yaw);
    plain.box(9, 3.4, 6, p.x - p.f.lx * side * 8, 0, p.z - p.f.lz * side * 8, 0xdcd6c8, p.yaw);
  };

  for (let s = Math.ceil(s0 / 12) * 12; s < Math.min(L, s0 + CHUNK); s += 12) {
    const prof: Profile = road.profileAt(s), near = nearJunction(s);
    const side = R() < 0.5 ? -1 : 1;
    switch (prof) {
      case 'banlieue':
        if (!near) {
          if (s % 36 === 0) pole(s, side);
          for (const sd of [-1, 1]) {
            if (R() < 0.75) wall(s, sd, 9 + R() * 3, BLOCK, 1.5 + R() * 0.5);
            if (R() < 0.8) house(s + 4, sd * (VERGE + 6 + R() * 12), 6 + R() * 5, 6 + R() * 4, 2.8 + R() * 2.2, PIKINE_PALETTE[Math.floor(R() * PIKINE_PALETTE.length)], R() < 0.6);
          }
        }
        break;
      case 'market':
        if (!near) {
          if (s % 24 === 0) stall(s + 2, side);
          if (s % 36 === 0) lamp(s, -side);
          for (const sd of [-1, 1]) { if (R() < 0.8) house(s + 4, sd * (VERGE + 4 + R() * 8), 7 + R() * 5, 6 + R() * 4, 3 + R() * 2.5, PIKINE_PALETTE[Math.floor(R() * PIKINE_PALETTE.length)], R() < 0.7); if (R() < 0.5) wall(s, sd, 8, BLOCK, 1.3); }
        }
        break;
      case 'artery':
        if (!near) {
          if (s % 36 === 0) lamp(s, side);
          if (s % 72 === 0) lamp(s, -side);
          if (R() < 0.22) billboard(s + 2, side);
          if (R() < 0.3) palm(s + 3, side * (VERGE + 1 + R() * 3), 0.9 + R() * 0.3);
          for (const sd of [-1, 1]) if (R() < 0.5) house(s + 4, sd * (VERGE + 12 + R() * 22), 8 + R() * 8, 8 + R() * 6, 3.5 + R() * 6, [0xe7e1d4, 0xd9d2c4, 0xc7d5df, 0xf1e6d2][Math.floor(R() * 4)], true);
        }
        break;
      case 'villa':
        if (!near) {
          if (s % 36 === 0) lamp(s, side);
          wall(s, -1, 10, 0xf3efe6, 2.2); wall(s, 1, 10, 0xf3efe6, 2.2);
          if (R() < 0.7) palm(s + 4, side * (VERGE + 1.5), 1 + R() * 0.3);
          for (const sd of [-1, 1]) if (R() < 0.45) house(s + 4, sd * (VERGE + 14 + R() * 14), 10 + R() * 6, 9 + R() * 5, 5 + R() * 3, VILLA_PALETTE[Math.floor(R() * VILLA_PALETTE.length)], true);
        }
        break;
      case 'downtown':
        if (!near) {
          if (s % 36 === 0) lamp(s, side);
          for (const sd of [-1, 1]) house(s + 4, sd * (VERGE + 9 + R() * 6), 10 + R() * 6, 9 + R() * 4, 9 + R() * 12, [0xf1e6d2, 0xe8d8b8, 0xdcd0c0, 0xc7d5df][Math.floor(R() * 4)], true);
        }
        break;
      case 'coast':
        if (!near) { if (s % 36 === 0) lamp(s, side); palm(s + 3, side * (VERGE + 1.5), 1); }
        break;
    }
  }
  // people waiting at the public-transport stops (where taxis, car rapides and buses pull over), and standing in small groups at the junctions: a few, at the kerb, never in the carriageway
  const waiter = (s: number, lat: number) => { const p = place(s, lat); people.push({ x: p.x, z: p.z, yaw: p.yaw + (lat > 0 ? -Math.PI / 2 : Math.PI / 2) + (R() - 0.5) * 0.5, clip: R() < 0.5 ? 'Talk' : 'Idle' }); };
  for (const t of road.stops) {
    if (t.s < s0 || t.s >= s1) continue;
    const lat = -t.dir * (KERB + 0.9), n = o.lite ? 1 : 2 + (R() < 0.4 ? 1 : 0);
    for (let k = 0; k < n; k++) waiter(t.s + (k - (n - 1) / 2) * 1.2 * t.dir, lat + (R() - 0.5) * 0.4);
  }
  for (const j of road.junctionS) {
    if (j.s < s0 || j.s >= s1) continue;
    for (const side of [-1, 1]) for (let k = 0; k < (o.lite ? 1 : 2); k++) waiter(j.s + (side * 12 + (k ? 1.1 : 0) * side), side * (KERB + 0.9) + (R() - 0.5) * 0.3);
  }
  // the fuel station of the artery, once
  if (road.profileAt(s0 + 50) === 'artery' && R() < 0.35 && !nearJunction(s0 + 50, 90)) station(s0 + 50, R() < 0.5 ? -1 : 1);

  // a vehicle parked on the shoulder now and then (an apprentice's car rapide in the market, a pick-up on the artery): a solid box in the road
  if (R() < (road.profileAt(s0 + 50) === 'market' ? 0.6 : 0.3) && !nearJunction(s0 + 50, 70)) {
    const side = R() < 0.5 ? -1 : 1, p = place(s0 + 40 + R() * 30, side * (KERB + 1.9));
    if (clear(p.x, p.z, 4)) {
      const col = [0xd9482b, 0x1e6fd9, 0xf4c20d, 0xdcd6c8, 0x2f8f4e][Math.floor(R() * 5)];
      plain.box(1.9, 0.9, 4.4, p.x, 0.35, p.z, col, p.yaw); plain.box(1.7, 0.75, 2.3, p.x, 1.2, p.z - Math.cos(p.yaw) * 0.2, 0x9fb3c2, p.yaw);
      for (const [dx, dz] of [[-0.85, 1.4], [0.85, 1.4], [-0.85, -1.4], [0.85, -1.4]]) plain.box(0.25, 0.7, 0.7, p.x + p.f.lx * dx + Math.sin(p.yaw) * dz, 0, p.z + p.f.lz * dx + Math.cos(p.yaw) * dz, 0x1d1f22);
      solid(p.x, p.z, 2.1, 4.6, 1.7, p.yaw);
    }
  }

  const meshes: THREE.Mesh[] = [];
  const add = (b: Batch, m: THREE.Material, cast: boolean, receive = true) => { const mesh = b.build(m, receive, cast); if (mesh) { mesh.frustumCulled = true; group.add(mesh); meshes.push(mesh); disposables.push(mesh.geometry); } };
  add(ground, o.mats.ground, false); add(asphalt, o.mats.asphalt, false); add(plain, o.mats.plain, true); add(bulbs, o.mats.bulb, false, false);
  if (pools.length) { const glow = new THREE.Mesh(mergeGeometries(pools, false)!, o.mats.glow); glow.renderOrder = 1; group.add(glow); meshes.push(glow); disposables.push(glow.geometry); for (const g of pools) g.dispose(); }

  // the direction boards at the junctions of this chunk: two a driver coming from each end reads in time
  for (const j of road.junctionS) {
    for (const dir of [1, -1]) {
      const s = j.s - dir * 62;
      if (s < s0 || s >= s0 + CHUNK) continue;
      const lat = dir > 0 ? -(VERGE - 0.2) : VERGE - 0.2, f = frame(road, s), x = f.x + f.lx * lat, z = f.z + f.lz * lat;
      if (typeof document !== 'undefined') {                                  // (no canvas under the unit tests' node: the board is a browser thing)
        const board = directionBoard(j.name, signTarget(road, dir), f.yaw + (dir > 0 ? Math.PI : 0), x, z);
        group.add(board.mesh); disposables.push(board.mesh.geometry, board.mat, board.tex);
      }
      plain.cyl(0.08, 0.08, 4, x, 0, z, 0x555a60, 6);
      colliders.push({ x0: x - 0.4, x1: x + 0.4, z0: z - 0.4, z1: z + 0.4, h: 4 });
    }
  }
  // the long stretches: every 500 m, each way, a board with the district ahead and the kilometres left (none near a junction: its own boards speak there)
  for (let k = 0; 250 + k * 500 < L; k++) for (const dir of [1, -1]) {
    const s = 250 + k * 500 + (dir < 0 ? 40 : 0);
    if (s < s0 || s >= s0 + CHUNK || s < 160 || s > L - 160 || nearJunction(s, 110)) continue;
    const left = dir > 0 ? L - s : s, km = `${(left / 1000).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;
    const lat = dir > 0 ? -(VERGE - 0.2) : VERGE - 0.2, f = frame(road, s), x = f.x + f.lx * lat, z = f.z + f.lz * lat;
    if (typeof document !== 'undefined') {
      const board = directionBoard(signTarget(road, dir), km, f.yaw + (dir > 0 ? Math.PI : 0), x, z);
      group.add(board.mesh); disposables.push(board.mesh.geometry, board.mat, board.tex);
    }
    plain.cyl(0.08, 0.08, 4, x, 0, z, 0x555a60, 6);
    colliders.push({ x0: x - 0.4, x1: x + 0.4, z0: z - 0.4, z1: z + 0.4, h: 4 });
  }
  return {
    index, group, colliders, people, s0, s1,
    dispose() { for (const d of disposables) d.dispose(); group.removeFromParent(); },
  };
}

const ASPHALT3 = new THREE.Color(ASPHALT);

/** What a board at a junction says the road ahead leads to. */
function signTarget(road: Road, dir: 1 | -1 | number): string {
  const names: Record<string, string> = { pikine: 'PIKINE', almadies: 'ALMADIES', plateau: 'PLATEAU', corniche: 'CORNICHE' };
  return names[dir > 0 ? road.def.b : road.def.a] ?? '';
}

/** A green direction board: the junction's name, and where the road leads. */
function directionBoard(name: string, to: string, yaw: number, x: number, z: number) {
  const cv = document.createElement('canvas'); cv.width = 384; cv.height = 128;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#0f6b3a'; c.fillRect(0, 0, 384, 128); c.strokeStyle = '#ffffff'; c.lineWidth = 5; c.strokeRect(5, 5, 374, 118);
  c.fillStyle = '#ffffff'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = '700 40px system-ui, sans-serif'; c.fillText(name.toUpperCase().slice(0, 18), 192, 46, 350);
  c.font = '600 30px system-ui, sans-serif'; c.fillText(`${to}  ➜`, 192, 94, 350);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const mat = new THREE.MeshLambertMaterial({ map: tex, emissive: 0x0b3d22, emissiveMap: tex, emissiveIntensity: 0.25 });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.55), mat);
  mesh.position.set(x, 4.6, z); mesh.rotation.y = yaw;
  return { mesh, mat, tex };
}
