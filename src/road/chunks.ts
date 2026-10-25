import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Batch, facadeTextures } from '../world/batch';
import { addGrain } from '../world/grain';
import { generatedTexture } from '../world/textures';
import { hubSurface, lightPoolTexture } from '../world/builder';
import { rng } from '../core/rng';
import type { Collider, HubWorld } from '../world/types';
import type { PersonLook } from '../actors/humanoid';
import { DIVIDED, MEDIAN_HALF, ROAD_HALF, SHOULDER, type Profile, type Road } from './routes';
import { brtDims, buildBrtStatic } from './brt';
import { LANE_BASE as RB_BASE, buildRoundStatic } from './roundabout';
import { autopontLayout, buildAutopontStatic } from './autopont';

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
  /** The districts' window texture (world/batch.ts facadeTextures) on the VDN's and Sacré-Cœur's blocks; lit windows at night. Plain walls under the unit tests (no canvas). */
  readonly facade: THREE.MeshLambertMaterial;
  /** Lamp heads (dimmer by day, full at night) and the pools of light on the road under them (night only), like the districts' own (world/builder.ts). */
  readonly bulb = new THREE.MeshBasicMaterial({ vertexColors: true });
  readonly glow = new THREE.MeshBasicMaterial({ map: typeof document !== 'undefined' ? lightPoolTexture() : null, color: 0xffb860, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, visible: false });
  constructor(lite: boolean) {
    this.ground = addGrain(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), 1.2, 0.5, false, lite ? undefined : generatedTexture('sand'), 3) as THREE.MeshLambertMaterial;
    this.asphalt = addGrain(new THREE.MeshLambertMaterial({ vertexColors: true }), 0.5, 1, false, lite ? undefined : generatedTexture('asphalt'), 3) as THREE.MeshLambertMaterial;
    this.plain = addGrain(new THREE.MeshLambertMaterial({ vertexColors: true }), 1, 1) as THREE.MeshLambertMaterial;
    const tex = typeof document !== 'undefined' ? facadeTextures() : null;
    this.facade = addGrain(new THREE.MeshLambertMaterial({ map: tex?.map ?? null, vertexColors: true, emissive: 0xffc070, emissiveMap: tex?.glow ?? null, emissiveIntensity: 0 }), 0.7, 1, true) as THREE.MeshLambertMaterial;
  }
  /** `night`: 0 (day) … 1. */
  setNight(night: number) { this.bulb.color.setScalar(0.45 + 0.55 * night); this.glow.visible = night > 0.3; this.facade.emissiveIntensity = this.facade.emissiveMap ? 0.9 * night : 0; }
  dispose() { this.ground.dispose(); this.asphalt.dispose(); this.plain.dispose(); this.facade.map?.dispose(); this.facade.emissiveMap?.dispose(); this.facade.dispose(); this.bulb.dispose(); this.glow.dispose(); }
}

export interface Chunk {
  index: number;
  group: THREE.Group;
  /** Solid things (road frame). */
  colliders: Collider[];
  /** Roadside people to place (road frame), with the clip they play. */
  people: HubWorld['people'];
  /** The flower and plant sellers on this chunk's verges (arc length of their middle, side: +1 left of a → b, length along the road). */
  sellers: { s: number; side: number; len: number; big: boolean }[];
  s0: number; s1: number;
  dispose(): void;
}

/** The chance a 100 m stretch has a flower and plant seller on its verge (a second one, 40 % of it), by the roadside's look: most on the wide urban road (the VDN). */
export const FLOWER_ODDS: Record<Profile, number> = { artery: 0.8, market: 0.55, villa: 0.5, coast: 0.35, downtown: 0.25, banlieue: 0.3, vdn: 0.85, sacrecoeur: 0.3 };

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

/** The half size of a district's own ground (world/builder.ts HALF and its 3 m margin: the hub's bounds). */
const DISTRICT = 130;
/** Is the point (road frame, district a's) on the ground of one of the road's two districts, or within `pad` of it? */
export const onDistrict = (road: Road, x: number, z: number, pad = 0) =>
  (Math.abs(x) < DISTRICT + pad && Math.abs(z) < DISTRICT + pad) || (Math.abs(x + road.dx) < DISTRICT + pad && Math.abs(z + road.dz) < DISTRICT + pad);

export interface ChunkOpts { road: Road; mats: ChunkMats; lite: boolean; /** road-frame positions that must stay clear (the player's own parked vehicle…) */ keepClear?: { x: number; z: number; r: number }[] }

/** Builds chunk `index` (road metres [index·CHUNK, (index+1)·CHUNK]). */
export function buildChunk(o: ChunkOpts, index: number): Chunk {
  const { road } = o, L = road.length;
  const s0 = index * CHUNK, s1 = Math.min(L, s0 + CHUNK + 4);        // a few metres of overlap: no seam between two chunks
  const R = rng(0x5f3a + index * 7919 + road.id.length * 131 + road.id.charCodeAt(0) * 17);
  const sa = hubSurface(road.def.a), sb = hubSurface(road.def.b);
  const plain = new Batch(), asphalt = new Batch(), ground = new Batch(), bulbs = new Batch(), fac = new Batch(), pools: THREE.BufferGeometry[] = [];
  if (road.id === 'corniche-mermoz') { plain.shade = { ground: { h: 2.6, min: 0.66 }, under: 0.72 }; fac.shade = { ground: { h: 2.6, min: 0.66 } }; }   // (the M1 visual pass: baked depth, src/world/batch.ts)
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
    const here = j.s >= s0 && j.s < s0 + CHUNK;
    if (j.round && here) buildRoundStatic(j.round, { plain, asphalt, fac }, colliders, people, o.lite, R, s => frame(road, s));     // (src/road/roundabout.ts)
    if (j.brt) {
      // the BRT avenue (src/road/brt.ts), built once by the chunk that holds the crossing; the main road's stop lines (and on a plain crossing its zebras) before it, both ways
      if (here) buildBrtStatic(j.brt, { plain, asphalt }, colliders, people, o.lite, R);
      const stop = brtDims(j.brt).mainStop;
      for (const dir of [1, -1]) {
        const f = frame(road, j.s - dir * stop), lane = RB_BASE + road.laneShift(j.s - dir * stop);                 // on a rond-point: across the ring's lane, before the busway
        for (let k = 0; k < 5; k++) { const l = lane - 2 + k * 1.0; plain.flat(0.45, 1.0, f.x - f.lx * dir * l, MARK_Y, f.z - f.lz * dir * l, 0xeeeae0, f.yaw + Math.PI / 2); }
        if (j.round) continue;
        const z = frame(road, j.s - dir * (stop + 3));
        for (let k = -4; k <= 4; k++) plain.flat(2.6, 0.5, z.x + z.lx * k * 1.15, MARK_Y, z.z + z.lz * k * 1.15, 0xe8e4d8, z.yaw);
      }
      continue;
    }
    if (j.round) {
      // a rond-point without a busway: its side streets from the ring outward, a zebra on each
      for (const m of j.arms) {
        const dx = m.b.x - m.a.x, dz = m.b.z - m.a.z, l = Math.hypot(dx, dz), ux = dx / l, uz = dz / l, yaw = Math.atan2(ux, uz), a0 = { x: m.a.x + ux * (j.round.ring - 1), z: m.a.z + uz * (j.round.ring - 1) };
        asphalt.coloured(strip(a0.x, a0.z, m.b.x, m.b.z, m.half, ROAD_Y + 0.003, ASPHALT3));
        for (let k = -4; k <= 4; k++) plain.flat(0.5, 3, m.a.x + ux * (j.round.ring + 4) - uz * k * 1.1, MARK_Y, m.a.z + uz * (j.round.ring + 4) + ux * k * 1.1, 0xe8e4d8, yaw + Math.PI / 2);
      }
      continue;
    }
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
  // (the autopont counts as a junction for the roadside, at half the distance: its ramps run out across the road, nothing else stands there)
  // (a rond-point keeps its own corners: the roadside comes back past its corner blocks)
  const nearJunction = (s: number, pad = 46) => road.junctionS.some(j => Math.abs(j.s - s) < (j.round && pad > 30 ? j.round.ring + 14 : pad)) || (road.autopontS !== null && Math.abs(road.autopontS.s - s) < Math.max(pad * 0.5, 12));

  // markings: centre dashes and the edges of the carriageway (none on a dirt road)
  for (let s = Math.ceil(s0 / 9) * 9; s < Math.min(s1 - 4, L); s += 9) {
    const prof = road.profileAt(s);
    const dirt = smooth(40, 220, s) < 0.6 && s < L / 2;
    if (dirt || prof === 'banlieue' || DIVIDED.has(prof)) continue;
    if (nearJunction(s, 8) || road.nearRound(s, 4)) continue;
    const f = frame(road, s + 1.5);
    plain.flat(0.2, 3.2, f.x, MARK_Y, f.z, 0xe8e4d8, f.yaw);
  }
  if (s0 > 220 && s1 < L - 40) {
    const cuts = road.rounds.map(r => [r.s - r.flare - 4, r.s + r.flare + 4] as const).filter(([a, b]) => b > s0 && a < s1);
    const spans: [number, number][] = []; let from = s0;
    for (const [a, b] of cuts) { if (a > from) spans.push([from, a]); from = Math.max(from, b); }
    if (from < s1) spans.push([from, s1]);
    for (const [a, b] of spans) for (const l of [-ROAD_HALF + 0.35, ROAD_HALF - 0.35]) plain.coloured(ribbon(road, a, b, l - 0.09, l + 0.09, MARK_Y, () => new THREE.Color(0xe8e4d8), 12));
  }

  // wear of an old city road (the owner's road references: patched asphalt, oil stains in the wheel tracks, the odd pothole) on the VDN and at Sacré-Cœur; flat on the
  // asphalt, between the edge lines and clear of the centre (its dashes, the median) and of the junctions' stop lines and zebras. Paint only: nothing to hit
  const WEAR = new Set<Profile>(['vdn', 'sacrecoeur']), RW = rng(0x77a1 + index * 131 + road.id.length);
  for (let s = Math.ceil(s0 / 6) * 6; s < Math.min(s1 - 3, L - 3); s += 6) {
    if (!WEAR.has(road.profileAt(s)) || nearJunction(s, 22)) { RW(); RW(); RW(); continue; }
    const r = RW(), side = RW() < 0.5 ? -1 : 1, lat = side * (1.7 + RW() * 2.2), f = frame(road, s + 3), x = f.x + f.lx * lat, z = f.z + f.lz * lat;
    if (r < 0.22) plain.flat(1.6 + RW() * 0.6, 2 + RW() * 4, x, MARK_Y - 0.008, z, RW() < 0.5 ? 0x3c3f45 : 0x5d5f62, f.yaw + (RW() - 0.5) * 0.06);   // a patch, newer or older than the road
    else if (r < 0.42) { const g = new THREE.CircleGeometry(0.5 + RW() * 0.6, 8); g.rotateX(-Math.PI / 2); g.scale(0.6, 1, 1.6); plain.geometry(g, 0x34363a, x, MARK_Y - 0.009, z, f.yaw); }   // an oil stain in the wheel track
    else if (r < 0.46 && !o.lite) {                                                                                                                            // a pothole, its rim of broken asphalt
      const g = new THREE.CircleGeometry(0.55, 7); g.rotateX(-Math.PI / 2); plain.geometry(g, 0x6b6558, x, MARK_Y - 0.008, z, RW() * 3);
      const h = new THREE.CircleGeometry(0.4, 7); h.rotateX(-Math.PI / 2); plain.geometry(h, 0x222327, x, MARK_Y - 0.006, z, RW() * 3);
    }
  }

  // roadside, every few metres of the chunk, by what the road is like there
  const place = (s: number, lat: number) => { const f = frame(road, s); return { x: f.x + f.lx * lat, z: f.z + f.lz * lat, yaw: f.yaw, f }; };
  /**
   * The districts at both ends build their own streets: nothing of the roadside stands on their ground (the last houses of the road into the Plateau
   * stood across its west perimeter street, blocks in its lanes). A piece is drawn as always, so its random numbers are drawn the same and nothing else
   * of the chunk moves, and taken back (geometry, colliders, people, light pools) when its footprint — `w` across the road, `d` along it, centred on `p` —
   * falls on a district's ground (`onDistrict`).
   */
  const guarded = (p: { x: number; z: number; yaw: number }, w: number, d: number, draw: () => void) => {
    const mp = plain.mark(), mf = fac.mark(), mb = bulbs.mark(), nc = colliders.length, np = people.length, nl = pools.length;
    draw();
    const ax = Math.cos(p.yaw), az = -Math.sin(p.yaw), fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    if (![[-1, -1], [-1, 1], [1, -1], [1, 1], [0, 0]].some(([u, v]) => onDistrict(road, p.x + ax * u * w / 2 + fx * v * d / 2, p.z + az * u * w / 2 + fz * v * d / 2, 0.5))) return;
    plain.rollback(mp); fac.rollback(mf); bulbs.rollback(mb); colliders.length = nc; people.length = np; for (const g of pools.splice(nl)) g.dispose();
  };
  const lamp = (s: number, side: number) => guarded(place(s, side * (KERB + 0.6)), 4.6, 0.6, () => {
    const p = place(s, side * (KERB + 0.6)), arm = -side;
    plain.cyl(0.07, 0.1, 6.6, p.x, 0, p.z, 0x3e4349, 6);
    const ax = p.x + p.f.lx * arm * 1.1, az = p.z + p.f.lz * arm * 1.1;
    plain.box(2.2, 0.1, 0.1, ax, 6.6, az, 0x3e4349, p.yaw + Math.PI / 2);
    bulbs.box(0.5, 0.14, 0.28, p.x + p.f.lx * arm * 2, 6.5, p.z + p.f.lz * arm * 2, 0xfff1c0, p.yaw + Math.PI / 2);
    const g = new THREE.PlaneGeometry(14, 14); g.rotateX(-Math.PI / 2); g.translate(p.x + p.f.lx * arm * 2, ROAD_Y + 0.06, p.z + p.f.lz * arm * 2); pools.push(g);
    solid(p.x, p.z, 0.5, 0.5, 6.6);
  });
  const pole = (s: number, side: number) => guarded(place(s, side * (VERGE - 0.4)), 2.4, 0.4, () => {
    const p = place(s, side * (VERGE - 0.4));
    plain.cyl(0.1, 0.13, 8, p.x, 0, p.z, 0x7a6a55, 6);
    plain.box(2.4, 0.12, 0.12, p.x, 7.4, p.z, 0x5b4f40, p.yaw + Math.PI / 2);
    for (const k of [-1, 0, 1]) plain.box(0.07, 0.07, 0.07, p.x + p.f.lx * k * 1.0, 7.5, p.z + p.f.lz * k * 1.0, 0xdddddd);
    solid(p.x, p.z, 0.4, 0.4, 8);
  });
  const palm = (s: number, lat: number, sc = 1) => guarded(place(s, lat), 6 * sc, 6 * sc, () => {
    const p = place(s, lat), h = 6.4 * sc;
    plain.cyl(0.2 * sc, 0.28 * sc, h, p.x, 0.05, p.z, 0x8a6d4a, 5);
    for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2 + R() * 0.5, len = 3.2 * sc; plain.box(0.7 * sc, 0.1 * sc, len, p.x + Math.sin(a) * len * 0.45, h - 0.1, p.z + Math.cos(a) * len * 0.45, k % 2 ? 0x2f7f3e : 0x3d9450, a); }
    if (Math.abs(lat) < VERGE + 0.5) solid(p.x, p.z, 0.6, 0.6, h);
  });
  const wall = (s: number, side: number, len: number, col: number, h = 1.6) => guarded(place(s + len / 2, side * (VERGE + 0.3)), 0.4, len + 0.1, () => {
    const p = place(s + len / 2, side * (VERGE + 0.3));
    plain.box(0.25, h, len, p.x, 0, p.z, col, p.f.yaw);
    plain.box(0.4, 0.15, len + 0.1, p.x, h, p.z, 0xd8d0c0, p.f.yaw);
  });
  const houses: { s: number; lat: number; w: number; d: number }[] = [];
  /** `windows`: the districts' window texture. `shop` (−1 / +1, the side of the house facing the road): a shop at its foot, a dark opening and a half-raised shutter. */
  const house = (s: number, lat: number, w: number, d: number, h: number, col: number, flat = true, windows = false, shop = 0) => guarded(place(s, lat), w + 0.4, d + 0.4, () => {
    const p = place(s, lat); houses.push({ s, lat, w: w + 0.4, d: d + 0.4 });
    if (windows) { fac.facade(w, h, d, p.x, 0, p.z, col, p.f.yaw); for (let y = 3.1; y < h - 1; y += 3.2) plain.box(w + 0.24, 0.16, d + 0.24, p.x, y, p.z, new THREE.Color(col).multiplyScalar(0.86).getHex(), p.f.yaw); }   // (floor bands: a line of shade under each)
    else plain.box(w, h, d, p.x, 0, p.z, col, p.f.yaw);
    if (shop) {
      const fx = p.x + p.f.lx * shop * (w / 2 + 0.05), fz = p.z + p.f.lz * shop * (w / 2 + 0.05), fw = d * 0.7;
      plain.box(0.1, 2.5, fw, fx, 0, fz, 0x2a2622, p.f.yaw);
      plain.box(0.14, 1.0, fw, fx + p.f.lx * shop * 0.03, 1.5, fz + p.f.lz * shop * 0.03, 0x9aa0a6, p.f.yaw);
    }
    if (flat) plain.box(w + 0.3, 0.2, d + 0.3, p.x, h, p.z, 0xe2dccf, p.f.yaw);
    else plain.box(w + 0.4, 0.15, d + 0.4, p.x, h, p.z, 0x9a9588, p.f.yaw);
    const door = R() < 0.6;
    if (door) plain.box(1.2, 2.0, 0.1, p.x - p.f.lx * 0, 0.0, p.z, PIKINE_PALETTE[Math.floor(R() * PIKINE_PALETTE.length)], p.f.yaw);
  });
  const stall = (s: number, side: number) => guarded(place(s, side * (VERGE - 1.4)), 3, 3, () => {
    const lat = side * (VERGE - 1.4), p = place(s, lat), col = AWNING[Math.floor(R() * AWNING.length)];
    plain.box(2.6, 0.9, 1.6, p.x, 0, p.z, 0x8a6d4a, p.yaw);
    plain.slab(3.0, 0.12, 2.2, p.x, 2.4, p.z, col, p.yaw, side * 0.12);
    for (const [dx, dz] of [[-1.3, -0.8], [1.3, -0.8], [-1.3, 0.8], [1.3, 0.8]]) plain.box(0.08, 2.4, 0.08, p.x + p.f.lx * dz + Math.sin(p.yaw) * dx, 0, p.z + p.f.lz * dz + Math.cos(p.yaw) * dx, 0x5b4f40);
    for (let k = 0; k < 5; k++) plain.box(0.4, 0.3, 0.4, p.x + Math.sin(p.yaw) * (k - 2) * 0.5, 0.9, p.z + Math.cos(p.yaw) * (k - 2) * 0.5, [0xd9482b, 0xf4c20d, 0x2f8f4e, 0xe8742c, 0xd96f4f][k]);
    solid(p.x, p.z, 3.0, 2.0, 2.4, p.yaw);
    people.push({ x: p.x + p.f.lx * -side * 0.2, z: p.z + p.f.lz * -side * 0.2, yaw: p.yaw + (side > 0 ? -Math.PI / 2 : Math.PI / 2), clip: R() < 0.5 ? 'Talk' : 'Idle' });
  });
  const billboard = (s: number, side: number) => guarded(place(s, side * 15), 1, 8, () => {
    const p = place(s, side * 15), col = [0xd9482b, 0x1e6fd9, 0xf4c20d, 0x2f8f4e][Math.floor(R() * 4)];
    for (const k of [-2.6, 2.6]) plain.cyl(0.14, 0.14, 6, p.x + Math.sin(p.yaw) * k, 0, p.z + Math.cos(p.yaw) * k, 0x555a60, 6);
    plain.box(8, 3.4, 0.25, p.x, 5, p.z, 0xf1efe8, p.yaw + Math.PI / 2 + (side > 0 ? 0 : Math.PI));
    plain.box(7.4, 2.2, 0.3, p.x, 5.5, p.z, col, p.yaw + Math.PI / 2 + (side > 0 ? 0 : Math.PI));
  });
  const station = (s: number, side: number) => guarded(place(s, side * 17.75), 20.5, 9.2, () => {
    const p = place(s, side * 20);
    plain.box(16, 0.4, 9, p.x, 5.2, p.z, 0xe8e4d8, p.yaw); plain.box(16.2, 0.5, 9.2, p.x, 5.6, p.z, 0xc0392b, p.yaw);
    for (const [dx, dz] of [[-6, -3], [6, -3], [-6, 3], [6, 3]]) plain.box(0.4, 5.2, 0.4, p.x + Math.sin(p.yaw) * dx + p.f.lx * dz, 0, p.z + Math.cos(p.yaw) * dx + p.f.lz * dz, 0xe8e4d8);
    for (const k of [-3, 0, 3]) plain.box(0.7, 1.5, 0.5, p.x + Math.sin(p.yaw) * k, 0, p.z + Math.cos(p.yaw) * k, 0xd9d2c4);
    solid(p.x, p.z, 16, 9, 1.5, p.yaw);
    plain.box(9, 3.4, 6, p.x - p.f.lx * side * 8, 0, p.z - p.f.lz * side * 8, 0xdcd6c8, p.yaw);
  });

  /** A vehicle standing on the verge, a box body, its cabin and four wheels (`p` from `place`). */
  const parkedCar = (p: ReturnType<typeof place>, col: number, glass: number) => {
    plain.box(1.9, 0.9, 4.4, p.x, 0.35, p.z, col, p.yaw); plain.box(1.7, 0.75, 2.3, p.x, 1.2, p.z - Math.cos(p.yaw) * 0.2, glass, p.yaw);
    for (const [dx, dz] of [[-0.85, 1.4], [0.85, 1.4], [-0.85, -1.4], [0.85, -1.4]]) plain.box(0.25, 0.7, 0.7, p.x + p.f.lx * dx + Math.sin(p.yaw) * dz, 0, p.z + p.f.lz * dx + Math.cos(p.yaw) * dz, 0x1d1f22);
  };
  const nearCheckpoint = (s: number, pad: number) => road.checkpointS !== null && Math.abs(s - road.checkpointS) < pad;

  /**
   * A police checkpoint on a small rond-point, as at the ways into Dakar's centre: a raised island on the centre line (its kerb painted red and white,
   * a bed of flowers, the officer's parasol, an officer), a mountable apron painted round it, hatched splitters and cones along the centre line either
   * side — both lanes pass it at their usual width (a car in its lane clears the island by a metre) — a police post and its pick-up on the right of
   * the way in, an officer by each, a board each way that says to slow down. Nothing is enforced: a driver slows, drives round and goes on.
   */
  const checkpoint = (s: number) => {
    const c = place(s, 0), POL = 0x1f3f78, WHITE = 0xf2f2ec, RED = 0xd23a2a, KHAKI = 0xc9b07a;
    const cop: PersonLook = { skin: 0x4a2c1c, style: 'tee', top: KHAKI, bottom: 0x3c3a30, pattern: 'uni', hat: 'kufi', hatColor: POL, shoes: 0x141414 };
    // the apron, mountable: a disc of pale paving 2.4 m round, its edge a white line; the island 1.0 m round, 0.22 m high
    plain.cyl(2.4, 2.4, 0.02, c.x, ROAD_Y + 0.004, c.z, 0xb9b2a2, 20); plain.cyl(2.45, 2.45, 0.012, c.x, ROAD_Y, c.z, WHITE, 20);
    for (let k = 0; k < 12; k++) {                                                                  // the kerb's red and white blocks round the island
      const a = (k / 12) * Math.PI * 2; plain.box(0.56, 0.22, 0.2, c.x + Math.sin(a) * 1.0, ROAD_Y, c.z + Math.cos(a) * 1.0, k % 2 ? RED : WHITE, a + Math.PI / 2);
    }
    plain.cyl(0.92, 0.92, 0.24, c.x, ROAD_Y, c.z, 0x6f9a4a, 12);                                   // its bed
    for (let k = 0; k < 7; k++) { const a = k * 0.9; plain.blob(0.13, c.x + Math.sin(a) * 0.62, ROAD_Y + 0.36, c.z + Math.cos(a) * 0.62, [0xd23a8c, 0xf4c20d, 0xe8742c, WHITE][k % 4], 0.8, 0); }
    plain.cyl(0.035, 0.035, 2.6, c.x + 0.35, ROAD_Y + 0.24, c.z, 0x555a60, 5); plain.cyl(0.06, 1.05, 0.38, c.x + 0.35, ROAD_Y + 2.62, c.z, POL, 10);   // the parasol
    solid(c.x, c.z, 2.0, 2.0, 0.6);                                                                 // the island (the apron is driven over)
    people.push({ x: c.x - 0.3 * c.f.lx, z: c.z - 0.3 * c.f.lz, yaw: c.yaw + Math.PI, clip: 'Idle', y: 0.24, look: cop });
    // the splitters: hatching between two white lines on the centre line, and cones on them, before and after the island
    for (const dir of [-1, 1]) {
      for (const lat of [-0.55, 0.55]) { const m = place(s + dir * 9, lat); plain.flat(0.12, 13, m.x, MARK_Y, m.z, WHITE, m.yaw); }
      for (let k = 0; k < 7; k++) { const m = place(s + dir * (3.6 + k * 1.8), 0); plain.flat(0.16, 1.3, m.x, MARK_Y, m.z, WHITE, m.yaw + 0.75); }
      for (let k = 0; k < 4; k++) { const m = place(s + dir * (4.5 + k * 3.2), 0); plain.cyl(0.03, 0.17, 0.55, m.x, ROAD_Y, m.z, 0xf06a1a, 6); plain.cyl(0.075, 0.115, 0.1, m.x, ROAD_Y + 0.26, m.z, WHITE, 6); }
    }
    // the post on the right of the way in (lat < 0 heading a → b): a blue-and-white booth past the verge, the pick-up on the verge before it
    const post = place(s + 6, -(VERGE + 1.6));
    plain.box(2.0, 2.5, 1.8, post.x, 0, post.z, WHITE, post.yaw); plain.box(2.04, 0.5, 1.84, post.x, 1.5, post.z, POL, post.yaw); plain.slab(2.5, 0.12, 2.3, post.x, 2.6, post.z, POL, post.yaw);
    plain.box(0.9, 1.0, 0.06, post.x + post.f.lx * 0.92, 1.1, post.z + post.f.lz * 0.92, 0x9fb3c2, post.yaw + Math.PI / 2);   // its window, toward the road
    solid(post.x, post.z, 2.2, 2.0, 2.6, post.yaw);
    const truck = place(s - 9, -(KERB + 1.9));
    parkedCar(truck, POL, 0xdfe8ef); plain.box(1.92, 0.12, 4.42, truck.x, 1.0, truck.z, WHITE, truck.yaw); plain.box(0.6, 0.12, 0.25, truck.x, 1.98, truck.z + Math.cos(truck.yaw) * 0.3, RED, truck.yaw);   // its white band, its lights
    solid(truck.x, truck.z, 2.1, 4.6, 1.7, truck.yaw);
    for (const [ds, lat, yaw, clip] of [[s + 2.5, -(KERB + 0.4), Math.PI / 2, 'Idle'], [s + 6, -(VERGE - 0.3), Math.PI / 2, 'Talk'], [s - 4, -(KERB + 0.5), Math.PI / 2, 'Idle']] as const) {
      const q = place(ds, lat); people.push({ x: q.x, z: q.z, yaw: q.yaw + yaw * (lat < 0 ? 1 : -1), clip, look: cop });
    }
  };

  /**
   * Flower and plant sellers on the verge, as along the VDN and at Yoff: rows of potted plants — shrubs in black nursery bags, terracotta pots, areca
   * palms, bougainvillea in flower — buckets of cut flowers on a trestle, a tarpaulin on four poles (a parasol for a small one), the seller on a stool,
   * now and then a customer on the pavement. Between the kerb and the wall line only (never on the carriageway: the pots start 2 m past its edge), off
   * the junctions, the stops, the checkpoint and the district ends; one solid box keeps a vehicle out of the pots. Merged into the chunk's one roadside
   * mesh (no draw call of its own); their own random stream (nothing else of the chunk moves); fewer pots, no customer and no flower heads on Low.
   */
  const flowerSellers = () => {
    const RF = rng(0x7f10 + index * 104729 + road.id.length * 977 + road.id.charCodeAt(0) * 31), lite = o.lite;
    const prof = road.profileAt(s0 + CHUNK / 2), odds = FLOWER_ODDS[prof];
    const want = (RF() < odds ? 1 : 0) + (RF() < odds * 0.4 ? 1 : 0);
    const BAG = 0x1c1c1e, POT = [0xb5562f, 0xa34a26, 0xc96a3a], LEAF = [0x2f6f2e, 0x3d8a3a, 0x4a9a3f, 0x2a5e2a, 0x5aa84a], BLOOM = [0xd23a8c, 0xe8366a, 0xf4c20d, 0xf2f2ec, 0xe8742c, 0xb03ad2, 0xd9322b];
    const TARP = [0x2f8f4e, 0x1e6fd9, 0xe8742c, 0xd9482b, 0x6b3fa0];
    let made = 0;
    for (let tries = 0; made < want && tries < 10; tries++) {
      const big = RF() < 0.45, len = big ? 9 + RF() * 5 : 4 + RF() * 2.5, s = s0 + 8 + len / 2 + RF() * (CHUNK - 16 - len), side = RF() < 0.5 ? -1 : 1;
      if (s + len / 2 > L - 2 || nearJunction(s, 22 + len / 2) || road.nearRound(s, 8 + len / 2) || nearCheckpoint(s, 40 + len / 2) || road.stops.some(t => Math.abs(t.s - s) < 15 + len / 2)) continue;   // clear of the junction's arms and zebras, of the stops' waiting people
      const lat0 = KERB + 0.55, lat1 = VERGE - 0.15, mid = place(s, side * (lat0 + lat1) / 2);
      if (!clear(mid.x, mid.z, len / 2 + 1)) continue;
      // nothing of the chunk stands there already (a lamp, a pole, a stall, a parked vehicle)
      const ax = Math.abs(Math.cos(mid.yaw)), az = Math.abs(Math.sin(mid.yaw)), hx = (ax * (lat1 - lat0) + az * len) / 2 + 0.6, hz = (az * (lat1 - lat0) + ax * len) / 2 + 0.6;
      if (colliders.some(c => mid.x + hx > c.x0 && mid.x - hx < c.x1 && mid.z + hz > c.z0 && mid.z - hz < c.z1)) continue;
      if (houses.some(h => Math.sign(h.lat) === side && Math.abs(h.s - s) < (len + h.d) / 2 + 0.5 && Math.abs(h.lat) - h.w / 2 < lat1 + 0.4)) continue;   // a house come close to the road
      if (boardsAt().some(b => Math.abs(b - s) < len / 2 + 2)) continue;                                               // a direction board's post
      if (sellers.some(o => o.side === side && Math.abs(o.s - s) < (o.len + len) / 2 + 3)) continue;
      const before = plain.mark();
      guarded(mid, lat1 - lat0, len, () => {
        const at = (t: number, lat: number) => place(s + t, side * lat);
        const g = at(0, (lat0 + lat1) / 2); plain.flat(lat1 - lat0 + 0.6, len + 0.8, g.x, GROUND_Y + 0.045, g.z, 0x6e5a40, g.yaw);   // the watered earth under the pots
        // the rows of pots, the back rows taller: shrubs and palms at the back, flowers to the front
        // (each pot is a box or a five-sided cylinder and its plant one low icosahedron: about 30 to 60 triangles a pot, a big seller under 2 500)
        const rows = lite ? 2 : big ? 3 : 2;
        for (let r = 0; r < rows; r++) {
          const lat = lat1 - 0.3 - r * ((lat1 - lat0 - 0.5) / Math.max(1, rows - 1)), step = lite ? 0.95 : 0.72;
          for (let t = -len / 2 + 0.35 + RF() * 0.2; t < len / 2 - 0.3; t += step + RF() * 0.2) {
            if (r === rows - 1 && Math.abs(t - (big ? -len / 2 + 2.2 : -len / 2 + 1.2)) < 1.3) continue;     // the trestle and the seller's place, at the front
            const q = at(t, lat + (RF() - 0.5) * 0.12), bag = RF() < 0.6, pr = 0.13 + RF() * 0.07, ph = 0.2 + RF() * 0.14;
            if (bag) plain.box(pr * 1.8, ph, pr * 1.8, q.x, GROUND_Y, q.z, BAG, RF() * 1.5);           // a black nursery bag
            else plain.cyl(pr, pr * 0.8, ph, q.x, GROUND_Y, q.z, POT[Math.floor(RF() * POT.length)], 5);   // a terracotta pot
            const kind = RF(), back = r === 0;
            if (back && kind < 0.25) {                                                       // an areca palm: a cane and a few fronds
              const h = 0.9 + RF() * 0.8; plain.box(0.06, h, 0.06, q.x, GROUND_Y + ph, q.z, 0x6b7a3a);
              for (let k = 0; k < 3; k++) { const a = k * 2.1 + RF() * 0.6; plain.box(0.16, 0.03, 0.8, q.x + Math.sin(a) * 0.32, GROUND_Y + ph + h - 0.1, q.z + Math.cos(a) * 0.32, LEAF[(k + r) % LEAF.length], a); }
            } else {
              const lr = (back ? 0.3 : 0.22) + RF() * 0.14, ly = GROUND_Y + ph + lr * 0.7;
              plain.blob(lr, q.x, ly, q.z, LEAF[Math.floor(RF() * LEAF.length)], back ? 1.25 : 0.85, 0);
              if (!lite && kind > 0.55) plain.blob(lr * 0.62, q.x + (RF() - 0.5) * 0.1, ly + lr * 0.55, q.z + (RF() - 0.5) * 0.1, BLOOM[Math.floor(RF() * BLOOM.length)], 0.7, 0);   // in flower: bougainvillea, hibiscus, marigolds
            }
          }
        }
        // the trestle of cut flowers in buckets, and the seller's stool beside it, at the front by the pavement
        const tr = at(big ? -len / 2 + 2.2 : -len / 2 + 1.2, lat0 + 0.35);
        plain.box(1.5, 0.62, 0.55, tr.x, GROUND_Y, tr.z, 0x8a6d4a, tr.yaw + Math.PI / 2);
        for (let k = 0; k < 3; k++) {
          const b = at((big ? -len / 2 + 2.2 : -len / 2 + 1.2) + (k - 1) * 0.45, lat0 + 0.35);
          plain.cyl(0.13, 0.11, 0.24, b.x, GROUND_Y + 0.62, b.z, [0x2b5c9e, 0xd9d2c4, 0x2f8f4e][k], 7);
          plain.blob(0.17, b.x, GROUND_Y + 0.98, b.z, BLOOM[(k * 2 + Math.floor(RF() * 3)) % BLOOM.length], 0.9, 0);
        }
        const st = at(big ? -len / 2 + 0.9 : -len / 2 + 0.25, lat0 + 0.45);
        plain.cyl(0.17, 0.2, 0.48, st.x, GROUND_Y, st.z, [0xd9322b, 0x2f6fb3, 0xf4c20d][Math.floor(RF() * 3)], 7);
        const face = st.yaw + (side > 0 ? -Math.PI / 2 : Math.PI / 2);                          // toward the road
        if (RF() < 0.6) people.push({ x: st.x, z: st.z, yaw: face, clip: 'Sit', y: -0.13 });       // on the stool
        else { const sd = at(big ? -len / 2 + 0.9 : -len / 2 + 0.25, KERB - 0.2); people.push({ x: sd.x, z: sd.z, yaw: face, clip: 'Idle' }); }   // standing by the pots at the kerb's edge, to the passing cars
        // the shade: a tarpaulin on four poles over a big one, a parasol over a small one; a bulb under it for the evening
        const col = TARP[Math.floor(RF() * TARP.length)];
        if (big) {
          const sl = Math.min(5.5, len * 0.55), c0 = -len / 2 + sl / 2 + 0.3;
          for (const [t, lat] of [[c0 - sl / 2, lat0 + 0.1], [c0 + sl / 2, lat0 + 0.1], [c0 - sl / 2, lat1], [c0 + sl / 2, lat1]] as const) { const q = at(t, lat); plain.cyl(0.04, 0.05, 2.35, q.x, GROUND_Y, q.z, 0x6b5a45, 5); }
          const roof = at(c0, (lat0 + lat1) / 2 + 0.05); plain.slab(lat1 - lat0 + 0.5, 0.05, sl + 0.4, roof.x, 2.38, roof.z, col, roof.yaw, side * 0.1);
          const bulb = at(c0, (lat0 + lat1) / 2); bulbs.box(0.12, 0.14, 0.12, bulb.x, 2.12, bulb.z, 0xfff1c0);
          const pg = new THREE.PlaneGeometry(4.5, 4.5); pg.rotateX(-Math.PI / 2); pg.translate(bulb.x, GROUND_Y + 0.08, bulb.z); pools.push(pg);   // its light on the pots at night
        } else {
          const q = at(-len / 2 + 0.8, (lat0 + lat1) / 2 + 0.1); plain.cyl(0.03, 0.03, 2.2, q.x, GROUND_Y, q.z, 0x555a60, 5); plain.cyl(0.05, 1.3, 0.4, q.x, GROUND_Y + 2.2, q.z, col, 10);
          bulbs.box(0.1, 0.12, 0.1, q.x, 2.05, q.z, 0xfff1c0);
        }
        // a customer now and then, on the pavement in front of the pots, looking at them
        if (!lite && RF() < (big ? 0.5 : 0.3)) { const cu = at(-len / 2 + len * (0.3 + RF() * 0.4), KERB - 0.6); people.push({ x: cu.x, z: cu.z, yaw: face + Math.PI, clip: RF() < 0.5 ? 'Talk' : 'Idle' }); }
        solid(mid.x, mid.z, lat1 - lat0, len, 1.0, mid.yaw);
      });
      if (plain.mark() > before) { made++; sellers.push({ s, side, len, big }); }                // (nothing kept: it fell on a district's ground)
    }
  };
  /** Where this chunk's direction boards stand (arc lengths): the junctions' boards 62 m before each, and the long stretches' every 500 m (see below). */
  const boardsAt = () => {
    const out: number[] = [];
    for (const j of road.junctionS) for (const dir of [1, -1]) out.push(j.s - dir * 62);
    for (let k = 0; 250 + k * 500 < L; k++) for (const dir of [1, -1]) out.push(250 + k * 500 + (dir < 0 ? 40 : 0));
    return out;
  };
  const sellers: { s: number; side: number; len: number; big: boolean }[] = [];

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
      case 'vdn':
        // the VDN: apartment blocks of six to ten floors set back behind the verge (some still being built, a crane over them), palms and hedges on the verge, billboards;
        // its lamps stand in the median (below)
        if (!near) {
          if (R() < 0.18) billboard(s + 2, side);
          if (R() < 0.45) palm(s + 3, side * (VERGE + 1 + R() * 2), 0.9 + R() * 0.3);
          for (const sd of [-1, 1]) if (R() < 0.42) {
            const h = 3.2 * (6 + Math.floor(R() * 5)), lat = sd * (VERGE + 14 + R() * 16), col = [0xf6f1e8, 0xf3e7d1, 0xe8d3b0, 0xd7e0e4, 0xe9c99a][Math.floor(R() * 5)];
            house(s + 4, lat, 13 + R() * 6, 12 + R() * 5, h, col, true, true);
            if (R() < 0.18) guarded(place(s + 4, lat), 3, 3, () => {                                     // a crane over a block still going up
              const p = place(s + 4, lat), top = h + 12;
              plain.box(0.9, top, 0.9, p.x, 0, p.z, 0xd9a12a); plain.box(16, 0.7, 0.8, p.x + p.f.lx * 4, top, p.z + p.f.lz * 4, 0xd9a12a, p.yaw + Math.PI / 2);
              plain.box(2, 1.6, 1.6, p.x - p.f.lx * 3, top - 1.4, p.z - p.f.lz * 3, 0x8a8f96, p.yaw);
            });
          }
          if (s % 48 === 0) for (const sd of [-1, 1]) wall(s, sd, 11, 0xe9e2d4, 1.4);
        }
        break;
      case 'sacrecoeur':
        // Sacré-Cœur's commercial approach: three to six floors close to the pavement, shops with their boards, stalls under parasols, motorbikes and cars at the kerb
        if (!near) {
          if (s % 36 === 0) lamp(s, side);
          if (s % 24 === 0) stall(s + 2, side);
          for (const sd of [-1, 1]) if (R() < 0.85) {
            const h = 3.2 * (3 + Math.floor(R() * 4)), lat = sd * (VERGE + 6 + R() * 3), col = [0xf1e6d2, 0xe9cfae, 0xdfe6e8, 0xf4efe6, 0xe3c9a6, 0xc7d5df, 0xdba57c][Math.floor(R() * 7)];
            house(s + 4, lat, 10 + R() * 4, 9 + R() * 3, h, col, true, true, -sd);
            const b = place(s + 4, sd * (VERGE + 0.9)); guarded(b, 0.3, 4, () => plain.box(0.12, 0.7, 4, b.x, 2.6, b.z, AWNING[Math.floor(R() * AWNING.length)], b.yaw));
          }
        }
        break;
    }
  }
  // the VDN's raised central median: a kerbed island, its bed of bougainvillea and low palms, double-armed lamps every 36 m; open at the junctions (solid everywhere else)
  for (let s = Math.ceil(s0 / 4) * 4; s < Math.min(L - 2, s0 + CHUNK); s += 4) {
    if (!DIVIDED.has(road.profileAt(s)) || nearJunction(s, 26)) continue;
    const p = place(s + 2, 0);
    plain.box(MEDIAN_HALF * 2, 0.22, 4.05, p.x, ROAD_Y - 0.02, p.z, 0xd8d2c4, p.yaw);
    plain.box(MEDIAN_HALF * 2 - 0.3, 0.05, 4.05, p.x, ROAD_Y + 0.2, p.z, 0x7a6a4a, p.yaw);
    plain.box(MEDIAN_HALF * 2 - 0.5, 0.5, 3.7, p.x, ROAD_Y + 0.24, p.z, R() < 0.5 ? 0x3f6f2f : 0x4a7a36, p.yaw);           // the trimmed hedge along the island
    if (!o.lite && R() < 0.6) plain.blob(0.32 + R() * 0.12, p.x, ROAD_Y + 0.82, p.z + (R() - 0.5) * 2, [0xd23a8c, 0xe2588f, 0xc2307a, 0xf08a3c][Math.floor(R() * 4)], 0.7, 0);   // bougainvillea over it
    for (let k = 0; k < 4; k++) { const q = place(s + 0.5 + k, 0); colliders.push({ x0: q.x - MEDIAN_HALF + 0.05, x1: q.x + MEDIAN_HALF - 0.05, z0: q.z - MEDIAN_HALF + 0.05, z1: q.z + MEDIAN_HALF - 0.05, h: 0.6 }); }   // small squares: never swelling toward the lanes in a bend
    if (s % 36 === 0) {
      plain.cyl(0.09, 0.13, 8.5, p.x, ROAD_Y + 0.22, p.z, 0x9aa0a6, 6);
      for (const sd of [-1, 1]) {
        const hx = p.x + p.f.lx * sd * 1.6, hz = p.z + p.f.lz * sd * 1.6;
        plain.box(3.2, 0.1, 0.1, p.x + p.f.lx * sd * 0.8, 8.6, p.z + p.f.lz * sd * 0.8, 0x9aa0a6, p.yaw + Math.PI / 2);
        bulbs.box(0.55, 0.14, 0.3, hx, 8.5, hz, 0xfff1c0, p.yaw + Math.PI / 2);
        const g = new THREE.PlaneGeometry(14, 14); g.rotateX(-Math.PI / 2); g.translate(hx, ROAD_Y + 0.06, hz); pools.push(g);
      }
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
    const side = R() < 0.5 ? -1 : 1, sp = s0 + 40 + R() * 30, p = place(sp, side * (KERB + 1.9));
    if (clear(p.x, p.z, 4) && !nearCheckpoint(sp, 30)) guarded(p, 2.1, 4.6, () => {
      const col = [0xd9482b, 0x1e6fd9, 0xf4c20d, 0xdcd6c8, 0x2f8f4e][Math.floor(R() * 5)];
      parkedCar(p, col, 0x9fb3c2);
      solid(p.x, p.z, 2.1, 4.6, 1.7, p.yaw);
    });
  }

  // the autopont at the way into Mermoz (RouteDef.autopont, src/road/autopont.ts)
  const apl = autopontLayout(road);
  if (apl && apl.s >= s0 && apl.s < s0 + CHUNK) buildAutopontStatic(apl, { plain, asphalt }, colliders, o.lite);
  // the police checkpoint at the way into the Plateau (RouteDef.checkpoint)
  const cps = road.checkpointS;
  if (cps !== null && cps >= s0 && cps < s0 + CHUNK) checkpoint(cps);
  // the flower and plant sellers of the roadside (VDN, Yoff)
  flowerSellers();

  const meshes: THREE.Mesh[] = [];
  const add = (b: Batch, m: THREE.Material, cast: boolean, receive = true) => { const mesh = b.build(m, receive, cast); if (mesh) { mesh.frustumCulled = true; group.add(mesh); meshes.push(mesh); disposables.push(mesh.geometry); } };
  add(ground, o.mats.ground, false); add(asphalt, o.mats.asphalt, false); add(plain, o.mats.plain, true); add(fac, o.mats.facade, true); add(bulbs, o.mats.bulb, false, false);
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
    index, group, colliders, people, sellers, s0, s1,
    dispose() { for (const d of disposables) d.dispose(); group.removeFromParent(); },
  };
}

const ASPHALT3 = new THREE.Color(ASPHALT);

/** What a board at a junction says the road ahead leads to. */
function signTarget(road: Road, dir: 1 | -1 | number): string {
  const names: Record<string, string> = { pikine: 'PIKINE', almadies: 'ALMADIES', plateau: 'PLATEAU', corniche: 'CORNICHE', mermoz: 'MERMOZ' };
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
