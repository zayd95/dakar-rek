import * as THREE from 'three';
import type { Batch } from './batch';
import { pirogue } from './city';
import { rng } from '../core/rng';
import { TRAVERSEE_SITE as S, type P2 } from '../sea/traverseeSite';
import type { Collider } from './types';

/**
 * The Embarcadère de Ngor's static scene (docs/TRAVERSEE.md, version 2; where things are: src/sea/traverseeSite.ts), merged into the Almadies' own
 * batches so it adds no draw call: the quay (the pier carried over the beach and the floating pontoon, scenery since the boats are boarded on the sand;
 * the pirogues pulled up on the beach) and the island of Ngor offshore with its landing beach. The bay (the launches at anchor, the wet sand, the
 * turquoise shallows) is src/world/ngorBay.ts; the boats that cross are the crossing's (src/world/boats.ts, src/venues/embarcadere.ts).
 */
export interface NgorBatches {
  plain: Batch; leaves: Batch; trunks: Batch; bulbs: Batch;
  /** A pool of the lamps' light laid on a floor at night (src/world/builder.ts's pools: the hub's one lamp-glow mesh), at (x, z), radius r, height y. */
  pool?: (x: number, z: number, r: number, y: number) => void;
}
/** A walked surface (src/world/builder.ts heightAt): flat here, y0 = y1. */
export interface NgorRamp { x0: number; x1: number; z0: number; z1: number; y0: number; y1: number; xEnd: number }

type V3 = [number, number, number];
const WOOD = 0x8b6a47, SEAM = 0x6b4f33, PILE = 0x5c4128, IRON = 0x2b2f35, STEEL = 0xb8bcc0, BULB = 0xffe2a0;

/** A life ring (orange and white quarters) standing on edge, its face toward +z turned by `yaw`. */
function lifeRing(b: Batch, x: number, y: number, z: number, yaw: number) {
  for (let q = 0; q < 4; q++) { const g = new THREE.TorusGeometry(0.26, 0.055, 4, 3, Math.PI / 2); g.rotateZ(q * Math.PI / 2); b.geometry(g, q % 2 ? 0xf6f4ee : 0xf26a1b, x, y, z, yaw); }
}

/**
 * Pirogues pulled up on the mainland's sand besides the quay's five, bows to the sea near the water's edge as in the owner's photo of the boarding beach:
 * west of the pier and east of the boarding beach, clear of `beach.clear` and of the customers' way from the waiting spots to the beached boats (x 40…56,
 * z −150…−163). x, z, yaw, paint; the first only on Low.
 */
const SHORE_PIROGUES: [number, number, number, number][] = [[9.5, -154.5, 0.14, 1], [19, -153.2, -0.1, 2], [78, -155.4, 0.1, 0]];

/**
 * The quay: `cx` is the port block's centre x and `bz` its north edge (the pier's axis is x = cx), `base` the block's ground. The coast road between the
 * block and the beach (z bz − 14 … bz) stays a road: the pier's two parts stop at its kerbs (a 0.4 m platform laid across it once stopped every car and
 * motorbike on the coast road), and nothing else stands on it. `rand` is the hub's own random sequence: it is drawn exactly five times (one per beach
 * pirogue, as the quay always did), so everything the hub builds after the quay keeps its place.
 */
export function buildNgorQuay(k: NgorBatches, at: { cx: number; bz: number; base: number; lite: boolean; rand: () => number }): { ramps: NgorRamp[]; colliders: Collider[] } {
  const { plain, bulbs } = k, { cx, bz, base: B, lite, rand } = at, P = S.pier, Q = S.pontoon;
  const deck = B + 0.4, kerb = bz - 14.3;
  // the pier: the boardwalk on the block, then from the far kerb out over the beach to the pier's end (deckY: 0.54), its plank seams and its piles
  plain.box(6, 0.4, 10, cx, B, bz + 5, WOOD);
  plain.box(6, 0.4, kerb - P.z0, cx, B, (kerb + P.z0) / 2, WOOD);
  const ramps: NgorRamp[] = [
    { x0: cx - 3, x1: cx - 3, z0: bz, z1: bz + 10, y0: 0.4, y1: 0.4, xEnd: cx + 3 },             // walked on: feet on the planks (flat)
    { x0: cx - 3, x1: cx - 3, z0: P.z0, z1: kerb, y0: 0.4, y1: 0.4, xEnd: cx + 3 },
  ];
  for (let n = -6; n < 12; n++) { const pz = bz - 25 + n * 3; if (pz > bz - 14.4 && pz < bz + 0.1) continue; plain.box(6.05, 0.05, 0.12, cx, deck, pz, SEAM); }
  for (let z = P.z0 + 1.5; z < kerb - 2; z += 6) for (const s of [-1, 1]) plain.box(0.2, 0.72, 0.2, cx + s * 3.08, 0.04, z, PILE);   // piles standing proud of the deck's edges
  if (!lite) { plain.box(0.1, 1.25, 0.1, P.x1 - 0.2, deck, P.z0 + 0.6, PILE); lifeRing(plain, P.x1 - 0.2, deck + 0.95, P.z0 + 0.66, 0); }   // a life ring at the pier's end
  // the floating pontoon (deckY: 0.32), a step down to it from the pier; floats under it, piles at its corners with lamps on the two seaward ones,
  // bollards on both edges where the launches' lines go (src/world/ngorBay.ts moors one on its west side), a ladder down into the water at its end
  const PD = 0.32, pcx = (Q.x0 + Q.x1) / 2, pcz = (Q.z0 + Q.z1) / 2, pw = Q.x1 - Q.x0, pl = Q.z1 - Q.z0;
  plain.box(pw, 0.1, pl, pcx, PD - 0.1, pcz, 0xa8957a);                                   // weathered, paler than the pier: the float reads apart
  for (let z = Q.z0 + 0.45; z < Q.z1 - 0.6; z += 0.75) plain.flat(pw - 0.1, 0.04, pcx, PD + 0.003, z, SEAM);
  for (const x of [Q.x0 + 0.08, Q.x1 - 0.08]) plain.box(0.16, 0.14, pl, x, PD - 0.1, pcz, PILE);
  plain.box(pw, 0.11, 0.6, pcx, PD, Q.z1 - 0.3, WOOD);
  if (lite) for (const x of [Q.x0 + 0.65, Q.x1 - 0.65]) plain.box(1.1, 0.4, pl - 0.6, x, -0.18, pcz, 0x2c3238);
  else for (const x of [Q.x0 + 0.65, Q.x1 - 0.65]) for (let z = Q.z0 + 1.1; z < Q.z1 - 1; z += 2.1) plain.box(1.1, 0.4, 1.8, x, -0.18, z, 0x2c3238);
  for (const x of [Q.x0 - 0.16, Q.x1 + 0.16]) for (const z of [Q.z0 + 0.4, Q.z0 + 7.5]) {
    plain.box(0.26, 2.5, 0.26, x, -0.9, z, PILE);
    if (z < pcz) { bulbs.box(0.22, 0.26, 0.22, x, 1.6, z, BULB); plain.box(0.3, 0.05, 0.3, x, 1.86, z, IRON); }
  }
  for (const x of [Q.x0 + 0.3, Q.x1 - 0.3]) for (const z of [Q.z0 + 1.6, Q.z0 + 6.4]) plain.cyl(0.09, 0.12, 0.26, x, PD, z, IRON, 6);
  for (const x of [pcx - 0.3, pcx + 0.3]) { plain.box(0.05, 1.55, 0.05, x, -0.6, Q.z0 - 0.05, STEEL); plain.box(0.05, 0.05, 0.42, x, 0.9, Q.z0 + 0.14, STEEL); }
  for (const y of [-0.22, 0.06]) plain.box(0.6, 0.04, 0.05, pcx, y, Q.z0 - 0.07, STEEL);
  // the pirogues pulled up on the sand (src/world/city.ts pirogue(), bows to the sea), clear of the pier, the pontoon, the coast road and the beached
  // boats' beach: four lie where the quay's pirogues always lay (the people by them: src/social/ambientSpots.ts); the fifth, which lay by the water
  // east of the pier where the customers now cross the sand to the boats, lies past the boarding beach; more along the water's edge either side
  const colliders: Collider[] = [];
  const keep = (x: number, z: number, yaw: number) => {
    const c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw)), hx = c * 1.1 + s * 5, hz = s * 1.1 + c * 5;
    colliders.push({ x0: x - hx, x1: x + hx, z0: z - hz, z1: z + hz, h: 1 });
  };
  const beached = [{ dx: -17, yaw: 0.1 }, { dx: -9, yaw: -0.08 }, { dx: 35, yaw: -0.18, z: -151.6 }, { dx: 7, yaw: 0.06 }, { dx: 15, yaw: -0.12 }];
  beached.forEach((p, n) => {
    const x = cx + p.dx, z = p.z !== undefined ? p.z - rand() * 1.5 : bz - 24 - rand() * 3;
    pirogue(plain, x, z, 10, p.yaw, n % 3, 0.06, { trued: true, segments: lite ? 8 : 12 });
    keep(x, z, p.yaw);
  });
  for (const [x, z, yaw, v] of SHORE_PIROGUES.slice(0, lite ? 1 : SHORE_PIROGUES.length)) { pirogue(plain, x, z, 10, yaw, v, 0.06, { trued: true, segments: lite ? 8 : 12 }); keep(x, z, yaw); }
  return { ramps, colliders };
}

// ------------------------------------------------------------------ the island's ground
const I = S.island, ICX = I.centre.x, ICZ = I.centre.z, IA = I.size.x / 2, IB = I.size.z / 2;
/** The landing's direction from the island's centre: the beach facing the mainland where the boat runs its bow up (the contract's beached x, its south shore z −300). */
const LANDING = Math.atan2((-300 - ICZ) / IB, (I.beached.x - ICX) / IA);
const angleTo = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
/** The shore's radius (1 = the contract's ellipse) round the island: coves and points, none along the landing's beach. */
function shore(t: number) {
  const m = 0.07 * Math.sin(3 * t + 0.7) + 0.045 * Math.sin(5 * t + 2.1) + 0.03 * Math.sin(8 * t + 0.3);
  return 1 + m * (1 - Math.exp(-((angleTo(t, LANDING) / 0.32) ** 2)));
}
/** How much of the landing's beach there is at angle t: 1 facing the mainland (x ≈ 40), about half by x 22 and 58, none round the rest of the island. */
const landing = (t: number) => Math.exp(-((angleTo(t, LANDING) / 0.36) ** 2));
/**
 * Rings out from the centre, from the sea's floor in: radius (a fraction of the shore's) and height on the rocky shore, the same on the landing's
 * beach, and the colour. Round most of the island the sand drops steeply into the sea (the waterline ring lies just below it, y 0.05, so the shore is
 * where they cross, never a seam lying on the water). The landing's rings spread out (1 in the fraction is 35 m there): its sand runs into the sea at
 * about 1 in 12, crossing the sea 0.4 m out from z −300, so a pirogue's bow rests on it at about z −299 and those who step off wade ankle- to
 * knee-deep beside it; then golden sand up to the restaurants, and the scrub and gardens inland, green.
 */
const RINGS: [number, number, number, number, number][] = [
  [1.1, -0.7, 1.26, -0.7, 0xb39f78],
  [1.04, -0.32, 1.12, -0.3, 0xbba47b],
  [1.0, -0.06, 1.0, 0.08, 0xcdb385],
  [0.95, 0.34, 0.885, 0.4, 0xe2c58f],
  [0.83, 0.55, 0.74, 0.62, 0xe4cb96],
  [0.64, 1.0, 0.6, 1.0, 0xa79e64],
  [0.44, 2.0, 0.44, 1.9, 0x87924f],
  [0.22, 2.9, 0.22, 2.9, 0x748946],
  [0, 3.3, 0, 3.3, 0x6c8240],
];
/** The rise of the inland ground at angle t: higher to the north-west, flatter toward the landing. */
function hill(t: number) {
  const h = 0.9 * Math.sin(2 * t + 0.6) + 0.5 * Math.cos(3 * t - 0.4);
  return Math.max(-0.6, h) * (1 - 0.6 * Math.exp(-((angleTo(t, LANDING) / 0.5) ** 2)));
}
const ringR = (i: number, t: number) => { const w = landing(t); return RINGS[i][0] + (RINGS[i][2] - RINGS[i][0]) * w; };
function ringY(i: number, t: number) {
  const w = landing(t), r = ringR(i, t);
  return RINGS[i][1] + (RINGS[i][3] - RINGS[i][1]) * w + (r < 0.7 && r > 0 ? hill(t) * (0.7 - r) / 0.7 : 0);
}

/** The island's ground height at (x, z) (the sea's floor −0.7 off its shore), within a few centimetres of its mesh: for whoever walks or wades on it. */
export function ngorGroundY(x: number, z: number): number {
  const u = (x - ICX) / IA, v = (z - ICZ) / IB, t = Math.atan2(v, u), r = Math.hypot(u, v) / shore(t);
  if (r >= ringR(0, t)) return RINGS[0][1];
  for (let i = 0; i < RINGS.length - 1; i++) {
    const r0 = ringR(i, t), r1 = ringR(i + 1, t);
    if (r <= r0 && r >= r1) { const y0 = ringY(i, t), y1 = ringY(i + 1, t); return y1 + (y0 - y1) * (r - r1) / (r0 - r1); }
  }
  return ringY(RINGS.length - 1, t);
}
export const islandXZ = (r: number, t: number): P2 => ({ x: ICX + IA * shore(t) * r * Math.cos(t), z: ICZ + IB * shore(t) * r * Math.sin(t) });
/** Where, out from the centre at angle t (a fraction of the shore's radius), the island's ground rises through the height y: its waterline at y = seaY. */
export function ngorWaterR(t: number, y: number = S.seaY): number {
  for (let i = 0; i < RINGS.length - 1; i++) {
    const y0 = ringY(i, t), y1 = ringY(i + 1, t);
    if (y0 <= y && y1 >= y) return ringR(i, t) + (ringR(i + 1, t) - ringR(i, t)) * (y - y0) / (y1 - y0);
  }
  return 1;
}
/** The angles the ground is cut at: evenly round the island, closer along the landing's beach (where people walk and wade, the mesh follows the curve). */
export function ngorAngles(lite: boolean): number[] {
  const seg = lite ? 16 : 24, ts = Array.from({ length: seg }, (_, j) => j / seg * Math.PI * 2);
  for (const d of lite ? [0.1, 0.22] : [0.06, 0.13, 0.2, 0.3]) for (const s of [-1, 1]) ts.push((LANDING + s * d + Math.PI * 2) % (Math.PI * 2));
  return [...new Set(ts.map(t => Math.round(t * 1e4) / 1e4))].sort((a, b) => a - b).filter((t, j, a) => j === 0 || t - a[j - 1] > 0.02);
}

/** The island's ground: rings round the centre with their colours, from the sea's floor through the wet sand to the green inland; vertex-coloured. */
export function ngorGround(lite: boolean): THREE.BufferGeometry {
  const ts = ngorAngles(lite), n = ts.length, rings = RINGS.length - 1, pos: number[] = [], col: number[] = [], idx: number[] = [];
  const tint = new THREE.Color();
  const vertex = (x: number, y: number, z: number, c: number, jitter: number) => {
    tint.setHex(c).multiplyScalar(1 + jitter); pos.push(x, y, z); col.push(tint.r, tint.g, tint.b); return pos.length / 3 - 1;
  };
  for (let i = 0; i < rings; i++) for (let j = 0; j <= n; j++) {
    const t = ts[j % n], p = islandXZ(ringR(i, t), t);
    vertex(p.x, ringY(i, t), p.z, RINGS[i][4], (((j * 7 + i * 3) % 5) - 2) * 0.025);
  }
  const at = (i: number, j: number) => i * (n + 1) + j, centre = vertex(ICX, RINGS[rings][1], ICZ, RINGS[rings][4], 0);
  for (let i = 0; i < rings - 1; i++) for (let j = 0; j < n; j++) { const a = at(i, j), b = at(i, j + 1), c = at(i + 1, j), d = at(i + 1, j + 1); idx.push(a, c, b, b, c, d); }
  for (let j = 0; j < n; j++) idx.push(at(rings - 1, j), centre, at(rings - 1, j + 1));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------ the island's beach and village
/** A beach parasol (orange, pink, red, blue: the owner's photos, no straw): a white pole and an eight-sided canopy seen from above and below. */
function parasol(b: Batch, x: number, y: number, z: number, color: number, r = 1.35) {
  b.box(0.06, 2.3, 0.06, x, y, z, 0xeceae2);
  const pos: number[] = [], n = 8, apex: V3 = [0, 2.62, 0], rim = (k: number): V3 => [Math.cos(k / n * Math.PI * 2) * r, 2.12, Math.sin(k / n * Math.PI * 2) * r];
  for (let k = 0; k < n; k++) pos.push(...apex, ...rim(k + 1), ...rim(k), ...apex, ...rim(k), ...rim(k + 1));     // its top, then its underside
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  b.geometry(g, color, x, y, z);
}
/** A chair facing `yaw` (forward = (sin yaw, cos yaw)), its seat centred at (x, z) and `seat` high: the seat on its legs, and its back. */
function chair(b: Batch, x: number, y: number, z: number, yaw: number, color: number, seat = 0.44) {
  b.box(0.44, seat, 0.42, x, y, z, color, yaw);
  b.box(0.44, 0.46, 0.06, x - Math.sin(yaw) * 0.2, y + seat, z - Math.cos(yaw) * 0.2, color, yaw);
}
/** A white plastic table: its top on one leg (a parasol's pole goes through it). */
function table(b: Batch, x: number, y: number, z: number) {
  b.box(0.1, 0.68, 0.1, x, y, z, 0xd9d6cc);
  b.box(0.82, 0.05, 0.82, x, y + 0.68, z, 0xf2f0e9);
}
/** A palm frond from the crown (tx, ty, tz) out toward `a`: rising a little, then drooping to its tip, broad in the middle; both faces. */
function frond(b: Batch, tx: number, ty: number, tz: number, a: number, s: number, color: number) {
  const b0: V3 = [-0.08 * s, 0, 0.2 * s], b1: V3 = [0.08 * s, 0, 0.2 * s], m0: V3 = [-0.36 * s, 0.22 * s, 1.7 * s], m1: V3 = [0.36 * s, 0.22 * s, 1.7 * s], tip: V3 = [0, -1.15 * s, 3.4 * s];
  const tri = [[b0, b1, m0], [b1, m1, m0], [m0, m1, tip]], pos: number[] = [];
  for (const [p, q, r] of tri) pos.push(...p, ...q, ...r, ...p, ...r, ...q);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  b.geometry(g, color, tx, ty, tz, a);
}
/**
 * A coconut palm standing at (x, y, z), `s` its size: a tall trunk leaning a little (bark in `trunks`), its fronds drooping from the crown (`leaves`).
 * `R` is its own random sequence (never the hub's). About 56 triangles with six fronds.
 */
export function palmTree(k: { leaves: Batch; trunks: Batch }, x: number, y: number, z: number, s: number, R: () => number, fronds = 6) {
  const h = 7.2 * s, ax = (R() - 0.5) * 0.26, az = (R() - 0.5) * 0.26;
  k.trunks.cyl(0.16 * s, 0.24 * s, h, x, y, z, 0x8a6d4a, 5, [ax, 0, az]);
  const tx = x - h * Math.cos(ax) * Math.sin(az), ty = y + h * Math.cos(ax) * Math.cos(az), tz = z + h * Math.sin(ax);
  for (let f = 0; f < fronds; f++) frond(k.leaves, tx, ty - 0.1, tz, (f / fronds) * Math.PI * 2 + R() * 0.5, s, f % 2 ? 0x2f7f3e : 0x3d9450);
}
/**
 * A beach restaurant's shack (photo 2: « RESTO MAMA »): painted walls on three sides, open to the sea (+z), a counter, a tin roof sloping back with its
 * awning over the front, a painted board along the roof's edge; it stands on the sand.
 */
function shack(b: Batch, x: number, z: number, w: number, d: number, wall: number, board: number) {
  const y = ngorGroundY(x, z) - 0.12, h = 2.7;
  b.box(w, h, 0.16, x, y, z - d / 2 + 0.08, new THREE.Color(wall).multiplyScalar(0.8).getHex());   // the back wall, a shade darker (inside, in the shade)
  for (const s of [-1, 1]) b.box(0.16, h, d, x + s * (w / 2 - 0.08), y, z, wall);
  b.box(w * 0.42, 1.05, 0.45, x + w * 0.22, y, z + d / 2 - 0.55, board);                    // the counter
  b.slab(w + 0.7, 0.1, d + 1.4, x, y + h + 0.12, z + 0.45, 0x9aa3a8, 0, -0.07);              // the tin roof, the awning out over the front
  b.box(w * 0.8, 0.5, 0.06, x, y + h + 0.12, z + d / 2 + 1.1, board);                       // the board
}
/** A low wall of grey and ochre stones (photo 3) along x from x0 to x1 at z, on the ground. */
function stoneWall(b: Batch, x0: number, x1: number, z: number) {
  const y = Math.min(ngorGroundY(x0, z), ngorGroundY(x1, z), ngorGroundY((x0 + x1) / 2, z)) - 0.1;
  b.box(x1 - x0, 1.0, 0.45, (x0 + x1) / 2, y, z, 0xa49882);
}
/** A thin straight piece from A to B (a string of bulbs' wire, a sail's edge): a square rod of side `r`. */
function rod(b: Batch, A: V3, B: V3, r: number, color: number) {
  const dx = B[0] - A[0], dy = B[1] - A[1], dz = B[2] - A[2], len = Math.hypot(dx, dy, dz);
  const g = new THREE.BoxGeometry(r, r, len); g.rotateX(-Math.asin(dy / len));
  b.geometry(g, color, (A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2, Math.atan2(dx, dz));
}
/** A triangle seen from both faces (a shade sail). */
function sail(b: Batch, A: V3, B: V3, C: V3, color: number) {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([...A, ...B, ...C, ...A, ...C, ...B], 3));
  b.geometry(g, color, 0, 0, 0);
}

/** The island's houses: x, z, width, depth, storeys, wall colour, bougainvillea (photo 3: red, ochre, yellow, behind low stone walls). The first five on Low. */
const RED = 0xc4472f, OCHRE = 0xd58e3c, YELLOW = 0xe8c14d, SALMON = 0xdc8b6e, WHITE = 0xf2efe6, BLUE = 0x2a6fb5;
const HOUSES: [number, number, number, number, number, number, boolean][] = [
  [25, -322, 6.5, 6, 2, OCHRE, true], [57.5, -324, 6, 6.5, 1, YELLOW, false], [66.5, -320, 7.5, 6, 2, RED, true], [39.5, -338, 7, 6, 2, YELLOW, false],
  [16, -327, 6, 6.5, 2, SALMON, true], [8, -321, 6, 6, 2, RED, false], [74.5, -327, 6, 6, 1, OCHRE, false], [82, -332, 7, 6, 2, WHITE, false], [60, -337, 6, 6, 1, RED, false],
];
/** The beach restaurants' shacks: x, z, width, depth, walls, board (« RESTO »'s yellow, a blue one, a green one). */
const SHACKS: [number, number, number, number, number, number][] = [[53.6, -312.4, 6, 4, 0xf0c13a, 0xd8392d], [29.2, -311.6, 5.4, 4, 0x2f78c4, 0xf4f1e6], [61.6, -311.2, 5, 3.8, 0x3c9a5c, 0xf2c018]];
/** Palms placed by hand: along the beach behind the parasols, by the restaurants and among the houses. The first seven on Low. */
const PALMS: [number, number][] = [
  [33.2, -309.6], [41.8, -309.4], [24.2, -309], [53.2, -307.9], [62.6, -306.9], [17.8, -312.4], [47.4, -309.6],
  [70.6, -311], [29.6, -316.2], [61.6, -315.2], [11, -316.6], [52.6, -330.5], [31, -331],
];
/** Trees and big bushes placed by hand, whose canopies make the island read green from the mainland (photo 4): x, z, radius. The first ten on Low. */
const TREES: [number, number, number][] = [
  [20, -335, 3], [50.5, -342, 3.2], [8, -334, 2.6], [70, -337, 2.8], [31, -340, 2.6], [88, -334, 2.4], [-2, -326, 2.2], [44, -352, 3], [62, -350, 2.8], [26, -353, 2.8],
  [80, -347, 2.5], [96, -323, 2], [13, -346, 2.4], [36, -363, 2.4], [-9, -339, 2], [56, -362, 2.4], [74, -357, 2.2], [3, -352, 2.2], [16, -316.5, 1.8], [68.6, -314.4, 1.7],
];
const BUSHES: [number, number, number][] = [[21.5, -313.6, 1.1], [34, -315.4, 0.9], [52.6, -315.8, 1.0], [66.4, -312.8, 1.1], [6.5, -313, 1.0], [72, -315.6, 0.9]];
/** The beach's parasols: pole x, z, colour, what is under it (chairs at a table, two loungers, or nothing). The first six on Low (the three over the waiting spots first). */
const ORANGE = 0xf0682a, PINK = 0xef82ad, RED_P = 0xdb3b30, SKY = 0x2f93dc, TEAL = 0x2bb3b8;
const PARASOLS: [number, number, number, 'table' | 'loungers' | 'none'][] = [
  [34.55, -305.25, ORANGE, 'table'], [39.1, -306.1, PINK, 'none'], [43.35, -305.55, SKY, 'table'],
  [30.6, -304.6, RED_P, 'table'], [47.4, -304.6, ORANGE, 'table'], [51.6, -305.6, PINK, 'loungers'],
  [26.6, -305.8, SKY, 'loungers'], [55.6, -306.4, RED_P, 'table'], [59.6, -307.4, TEAL, 'table'], [22.6, -307, ORANGE, 'table'],
];
const CHAIRS = [0xf4f3ee, 0xd8392d, 0x2c9a4b, 0x2f6fd0, 0xf2c018];
/** Dark rocks in the water either side of the landing (photos 2 and 3), outside its clear zone: x, z, radius. The first four on Low. */
const LANDING_ROCKS: [number, number, number][] = [
  [27.4, -298.6, 1.2], [55, -298.2, 1.3], [24.6, -296.8, 1.5], [57.6, -296.2, 1.6], [28.4, -295.6, 0.8], [53.6, -295.6, 0.75], [22.4, -300.4, 1.1], [60.2, -300, 1.05],
];
/** Pirogues drawn up on the island's beach west of the landing: x, z, yaw, paint. */
const ISLAND_PIROGUES: [number, number, number, number][] = [[16.5, -306.2, Math.PI / 2 - 0.12, 1], [7.8, -309.6, Math.PI / 2 + 0.2, 2]];

// ------------------------------------------------------------------ the rooftop restaurant and lounge bar
const RT = I.rooftop;
/** The rooftop restaurant's ground floor (its plinth's top: the ground at its box's centre, the contract's rule) and its roof terrace's floor. */
export function rooftopFloors(): { ground: number; roof: number } {
  const g = ngorGroundY((RT.box.x0 + RT.box.x1) / 2, (RT.box.z0 + RT.box.z1) / 2);
  return { ground: g, roof: g + RT.roofY };
}
/** A piece of the roof terrace's furniture: its footprint on the terrace floor and its height. `seat`s hold the contract's seated poses; the rest no pose. */
export interface RoofPiece { kind: 'table' | 'chair' | 'sofa' | 'sofa-back' | 'low-table' | 'bar' | 'shelf' | 'booth' | 'speaker' | 'post' | 'pot'; x0: number; x1: number; z0: number; z1: number; h: number }
const SAIL_LOUNGE: V3[] = [[36.35, 0, -320.45], [41.3, 0, -320.45], [36.8, 0, -326.4]], SAIL_BAR: V3[] = [[38.7, 0, -330.75], [47.3, 0, -330.75]];
const PERGOLA = { x0: 42.6, x1: 49.6, z0: -327.6, z1: -320.55 };
const POTS: [number, number][] = [[36.7, -320.7], [45.3, -320.7], [49.3, -329.2], [36.7, -327.7]];
/** The seated sit this high above the terrace's floor (the rooftop's people, src/crowd): the chairs' and the sofas' seats. Their knees reach 0.45 m
 *  forward of the seat point, 0.6 m up: under the tables' tops (0.71 m), clear of their legs. */
export const ROOF_SEAT = 0.48;
/**
 * The roof terrace's furniture as footprints on its floor, built to the contract's poses (island.rooftop): a table at the mean of each dining four with a
 * chair under each diner, the lounge's U of low sofas (seats and backs) round its low table, the bar counter along the back and its shelf behind the
 * barman, the DJ's booth in front of the DJ and its speakers either side, the pergola's and the sails' posts, the potted plants. The dancers' floor
 * stays free. What the building draws, and what the checks hold the poses against.
 */
export function rooftopPieces(): RoofPiece[] {
  const P: RoofPiece[] = [], at = (kind: RoofPiece['kind'], x: number, z: number, w: number, d: number, h: number) => P.push({ kind, x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, h });
  for (let t = 0; t < RT.dining.length; t += 4) {
    const four = RT.dining.slice(t, t + 4), x = four.reduce((s, p) => s + p.x, 0) / 4, z = four.reduce((s, p) => s + p.z, 0) / 4;
    at('table', x, z, 0.76, 1.5, 0.76);
    for (const s of four) at('chair', s.x - Math.sin(s.yaw) * 0.04, s.z - Math.cos(s.yaw) * 0.04, 0.44, 0.44, ROOF_SEAT);
  }
  // the lounge: each side's sofa under its poses (seats 0.8 deep, the hips 0.4 in from the back), the back sofa joining them; the low table between
  const side = (yaw: number) => RT.lounge.filter(p => Math.abs(p.yaw - yaw) < 0.01);
  for (const s of [1, -1]) {
    const ps = side(s * Math.PI / 2), x = ps[0].x, z0 = Math.min(...ps.map(p => p.z)) - 0.7, z1 = Math.max(...ps.map(p => p.z)) + 0.7, back = x - s * 0.42;
    P.push({ kind: 'sofa', x0: Math.min(back, x + s * 0.38), x1: Math.max(back, x + s * 0.38), z0, z1, h: ROOF_SEAT });
    P.push({ kind: 'sofa-back', x0: Math.min(back, back - s * 0.18), x1: Math.max(back, back - s * 0.18), z0, z1, h: 0.85 });
  }
  const north = side(0), nz = north[0].z, wx = side(Math.PI / 2)[0].x - 0.42, ex = side(-Math.PI / 2)[0].x + 0.42;
  P.push({ kind: 'sofa', x0: wx, x1: ex, z0: nz - 0.42, z1: nz + 0.38, h: ROOF_SEAT }, { kind: 'sofa-back', x0: wx - 0.18, x1: ex + 0.18, z0: nz - 0.6, z1: nz - 0.42, h: 0.85 });
  at('low-table', 39, -323, 1.0, 1.3, 0.38);
  // the bar along the back (x 39…47 at z −329.5, its front face at −329.2: those standing at it face it at −328.6) and its shelf behind the barman;
  // the DJ's booth, narrow, just before the DJ, a speaker either side behind: the dancers' spots stay half a metre clear of them
  P.push({ kind: 'bar', x0: 39, x1: 47, z0: -329.8, z1: -329.2, h: 1.1 }, { kind: 'shelf', x0: 39, x1: 47, z0: RT.box.z0 + 0.05, z1: RT.box.z0 + 0.3, h: 1.9 });
  const dj = RT.dj;
  at('booth', dj.x + Math.sin(dj.yaw) * 0.55, dj.z + Math.cos(dj.yaw) * 0.55, 1.0, 0.4, 1.0);
  for (const s of [-1, 1]) at('speaker', dj.x + s * 1.15, dj.z - 0.25, 0.42, 0.38, 1.1);
  for (const [x, , z] of [...SAIL_LOUNGE, ...SAIL_BAR]) at('post', x, z, 0.1, 0.1, 2.6);
  for (const x of [PERGOLA.x0, PERGOLA.x1]) for (const z of [PERGOLA.z0, PERGOLA.z1]) at('post', x, z, 0.12, 0.12, 2.75);
  for (const [x, z] of POTS) at('pot', x, z, 0.5, 0.5, 0.5);
  return P;
}

/**
 * The island's rooftop restaurant and lounge bar (island.rooftop; the owner, 26 Oct): the landmark above the landing beach, white with an ochre band,
 * facing the sea; its name on the roof's front edge (src/world/builder.ts, « SUNU TOIT »). Level on a stone plinth (its front proud of the sloping beach, its back sunk in the hill, steps up at its front); the kitchen behind
 * (its hatch lit at night) and a shaded front on pillars under the roof; the outside stair up the west wall to the roof terrace, under a light pergola
 * and two shade sails, a low parapet with a rail along the front (the diners show over it from the boat), walls at the sides and back. The furniture to
 * the contract's poses (rooftopPieces), warm wood and colourful cushions, potted plants, and strings of warm bulbs on the lamps' material, lit at night.
 * About 2 000 triangles (1 400 on Low).
 */
function buildRooftop(k: NgorBatches, lite: boolean) {
  const { plain, leaves, bulbs } = k, B = RT.box, { ground: G, roof: Y } = rooftopFloors();
  const cx = (B.x0 + B.x1) / 2, cz = (B.z0 + B.z1) / 2, w = B.x1 - B.x0, d = B.z1 - B.z0;
  const WALL = 0xf4efe4, TRIM = 0xd58e3c, TEAK = 0x9a6b45, PALE_WOOD = 0xc89a66, STONE = 0xb4a68c;
  const low = Math.min(...[[B.x0, B.z1], [B.x1, B.z1], [B.x0, B.z0], [B.x1, B.z0]].map(([x, z]) => ngorGroundY(x, z))) - 0.25;
  plain.box(w + 0.6, G - low, d + 0.6, cx, low, cz, STONE);
  for (const [n, z] of [[1, B.z1 + 0.52], [2, B.z1 + 0.97]] as const) plain.box(4.2, G - n * 0.22 - low, 0.45, cx, low, z, STONE);
  // the ground floor: the kitchen behind (its door, its hatch lit at night), the shaded front on pillars, the roof over all, its edge banded ochre
  const kz = cz - 0.3, H = RT.roofY - 0.22;
  plain.box(w, H, kz - B.z0, cx, G, (B.z0 + kz) / 2, 0xe6b073);                         // the kitchen's wall in warm ochre: in the shade of the roof, white read as concrete
  bulbs.box(2.2, 0.8, 0.05, cx + 2.4, G + 1.15, kz + 0.03, 0xffd890);
  plain.box(1.0, 2.1, 0.05, cx - 3.4, G, kz + 0.03, BLUE);
  for (let n = 0; n < 5; n++) plain.box(0.36, H, 0.36, B.x0 + 0.3 + n * (w - 0.6) / 4, G, B.z1 - 0.3, WALL);
  plain.slab(w + 0.3, 0.22, d + 0.3, cx, Y - 0.11, cz, 0xe8dcc6);
  if (!lite) {
    plain.box(w + 0.34, 0.26, 0.04, cx, Y - 0.24, B.z1 + 0.17, TRIM);
    for (const [x, z] of [[39.4, -321.7], [46.6, -321.7]]) { table(plain, x, G, z); for (const s of [-1, 1]) chair(plain, x + s * 0.7, G, z, -s * Math.PI / 2, 0xf4f3ee); }
  }
  // the outside stair up the west wall, from the beach side to the roof at the back (solid masonry steps on the ground), its landing, its parapet
  const S0 = RT.stair, sx = (S0.x0 + S0.x1) / 2, sw = S0.x1 - S0.x0, g0 = ngorGroundY(sx, S0.z1), steps = Math.round((Y - g0) / 0.21), tread = (S0.z1 - S0.z0) / steps;
  for (let n = 0; n < steps; n++) {
    const z = S0.z1 - (n + 0.5) * tread, base = ngorGroundY(sx, z) - 0.1;
    plain.box(sw, g0 + (n + 1) * (Y - g0) / steps - base, tread, sx, base, z, STONE);
  }
  plain.box(sw, Y - ngorGroundY(sx, S0.z0 - 0.5) + 0.1, 1.0, sx, ngorGroundY(sx, S0.z0 - 0.5) - 0.1, S0.z0 - 0.5, STONE);
  plain.slab(0.12, 0.9, Math.hypot(S0.z1 - S0.z0, Y - g0), S0.x0 + 0.06, (g0 + Y) / 2 + 0.45, (S0.z0 + S0.z1) / 2, WALL, 0, Math.atan2(Y - g0, S0.z1 - S0.z0));
  // the terrace: a teak deck under the lounge; the parapets (low with a rail at the front; walls at the sides and the back; open at the stair's head)
  plain.flat(4.8, 4.6, 39, Y + 0.006, -323.2, TEAK);
  plain.box(w, 0.5, 0.16, cx, Y, B.z1 - 0.08, WALL);
  plain.box(w, 0.07, 0.12, cx, Y + 1.0, B.z1 - 0.08, TEAK);
  for (let n = 0; n <= 6; n++) plain.box(0.07, 0.5, 0.07, B.x0 + 0.1 + n * (w - 0.2) / 6, Y + 0.5, B.z1 - 0.08, TEAK);
  plain.box(0.16, 1.0, d, B.x1 - 0.08, Y, cz, WALL);
  plain.box(w, 1.0, 0.16, cx, Y, B.z0 + 0.08, WALL);
  plain.box(0.16, 1.0, B.z1 - (S0.z0 + 1.4), B.x0 + 0.08, Y, (B.z1 + S0.z0 + 1.4) / 2, WALL);
  // the furniture, to the poses
  const pieces = rooftopPieces(), cushions = [ORANGE, TEAL, PINK];
  let cushion = 0;
  for (const p of pieces) {
    const x = (p.x0 + p.x1) / 2, z = (p.z0 + p.z1) / 2, pw = p.x1 - p.x0, pd = p.z1 - p.z0;
    if (p.kind === 'table') {
      plain.box(pw, 0.05, pd, x, Y + p.h - 0.05, z, PALE_WOOD);
      for (const s of [-1, 1]) plain.box(0.08, p.h - 0.05, 0.08, x, Y, z + s * (pd / 2 - 0.25), TEAK);
    } else if (p.kind === 'sofa') {
      plain.box(pw, p.h - 0.16, pd, x, Y, z, TEAK);
      plain.box(pw - 0.04, 0.16, pd - 0.04, x, Y + p.h - 0.16, z, cushions[cushion++ % 3]);
    } else if (p.kind === 'sofa-back') plain.box(pw, p.h, pd, x, Y, z, 0xeee6d6);
    else if (p.kind === 'low-table') plain.box(pw, p.h, pd, x, Y, z, TEAK);
    else if (p.kind === 'bar') {
      plain.box(pw, p.h - 0.06, pd, x, Y, z, 0x7a4f32);
      plain.box(pw + 0.1, 0.06, pd + 0.12, x, Y + p.h - 0.06, z, 0xf2efe6);
      bulbs.box(pw - 0.2, 0.05, 0.02, x, Y + p.h - 0.16, p.z1 + 0.01, 0xffc070);             // a warm strip under the counter's top
    } else if (p.kind === 'shelf') {
      plain.box(pw, p.h, pd, x, Y, z, TEAK);
      if (!lite) for (const [y, c] of [[1.05, 0x2f6b3a], [1.5, 0xb5652a]] as const) plain.box(pw - 0.4, 0.28, 0.1, x, Y + y, p.z1 + 0.05, c);   // the bottles
    } else if (p.kind === 'booth') {
      plain.box(pw, p.h, pd, x, Y, z, 0x22252a);
      plain.flat(pw - 0.1, pd - 0.08, x, Y + p.h + 0.004, z, 0x5a5f66);
      bulbs.box(pw - 0.1, 0.07, 0.02, x, Y + p.h - 0.2, p.z1 + 0.01, 0xff5fd0);             // the booth's light strip, pink at night
    } else if (p.kind === 'speaker') plain.box(pw, p.h, pd, x, Y, z, 0x1d1f22);
    else if (p.kind === 'pot') { plain.box(pw, p.h, pd, x, Y, z, 0xb8613a); if (!lite) leaves.blob(0.5, x, Y + p.h + 0.35, z, 0x3f7a34, 1.1, 0); }
  }
  for (let n = 0; n < RT.dining.length; n++) {
    const s = RT.dining[n], c = [0xf4f3ee, 0x2bb3b8, 0xf0682a][Math.floor(n / 4)];
    chair(plain, s.x - Math.sin(s.yaw) * 0.04, Y, s.z - Math.cos(s.yaw) * 0.04, s.yaw, c, ROOF_SEAT);
  }
  // the pergola over the dining tables (posts, beams, slats), the sails over the lounge and the bar on their posts
  for (const x of [PERGOLA.x0, PERGOLA.x1]) for (const z of [PERGOLA.z0, PERGOLA.z1]) plain.box(0.12, 2.75, 0.12, x, Y, z, PALE_WOOD);
  for (const z of [PERGOLA.z0, PERGOLA.z1]) plain.box(PERGOLA.x1 - PERGOLA.x0 + 0.3, 0.14, 0.12, (PERGOLA.x0 + PERGOLA.x1) / 2, Y + 2.62, z, PALE_WOOD);
  for (let x = PERGOLA.x0 + 0.3; x < PERGOLA.x1; x += lite ? 1.6 : 0.8) plain.box(0.07, 0.07, PERGOLA.z1 - PERGOLA.z0 + 0.4, x, Y + 2.76, (PERGOLA.z0 + PERGOLA.z1) / 2, PALE_WOOD);
  const lounge = SAIL_LOUNGE.map(([x, , z], n) => [x, Y + [2.9, 2.45, 2.55][n], z] as V3), bar = SAIL_BAR.map(([x, , z]) => [x, Y + 2.4, z] as V3);
  for (const p of [...lounge, ...bar]) plain.box(0.1, p[1] - Y, 0.1, p[0], Y, p[2], 0xc8ccd0);
  sail(plain, lounge[0], lounge[1], lounge[2], 0xf3ead6);
  sail(plain, bar[0], bar[1], [PERGOLA.x0, Y + 2.75, PERGOLA.z0], 0xe07a3e);
  // strings of warm bulbs from post to post, sagging over the lounge, the dancers, the bar and the tables
  const tops: [V3, V3][] = [
    [[36.35, Y + 2.5, -320.45], [PERGOLA.x0, Y + 2.5, PERGOLA.z0]], [[38.7, Y + 2.3, -330.75], [PERGOLA.x1, Y + 2.5, PERGOLA.z1]],
    [[41.3, Y + 2.4, -320.45], [36.8, Y + 2.4, -326.4]], [[PERGOLA.x0, Y + 2.5, PERGOLA.z1], [47.3, Y + 2.3, -330.75]],
  ];
  for (const [A, Bp] of tops.slice(0, lite ? 2 : tops.length)) {
    const len = Math.hypot(Bp[0] - A[0], Bp[2] - A[2]), n = Math.round(len / 0.9), at = (f: number): V3 => [A[0] + (Bp[0] - A[0]) * f, A[1] + (Bp[1] - A[1]) * f - 0.42 * 4 * f * (1 - f), A[2] + (Bp[2] - A[2]) * f];
    for (let i = 1; i < n; i++) { const p = at(i / n); bulbs.geometry(new THREE.OctahedronGeometry(0.07, 0), 0xffd27a, p[0], p[1] - 0.05, p[2]); }
    if (!lite) for (const [f0, f1] of [[0, 0.5], [0.5, 1]]) rod(plain, at(f0), at(f1), 0.015, 0x2b2b2b);
  }
  // at night the bulbs' light on the terrace and under the shaded front (the lamps' pools: the floor warmed where people sit, dance and drink, the
  // people standing out against it), each inside its floor; two laid on each other, a pool doubling what is under it: the moonlit floor turns warm
  for (const [x, z, r] of [[39.2, -323.2, 2.8], [42.6, -327.4, 2.8], [46.4, -324.2, 3.4]]) for (const f of [1, 0.65]) k.pool?.(x, z, r * f, Y + 0.02);
  k.pool?.(cx, (kz + B.z1) / 2, 2.7, G + 0.02);
}

/** What of the island is where (checks: the landing, its path, its waiting spots and the restaurant are clear of it). */
export const NGOR_ISLAND_LAYOUT = { HOUSES, SHACKS, PALMS, TREES, PARASOLS, LANDING_ROCKS, ISLAND_PIROGUES } as const;

/** Ground the island's planted trees keep off: the houses with their walls, the shacks, the restaurant and its stair, the parasols, the pirogues, the landing. */
function builtOn(): { x0: number; x1: number; z0: number; z1: number }[] {
  const out = [
    ...HOUSES.map(([x, z, w, d]) => ({ x0: x - w / 2 - 1.3, x1: x + w / 2 + 1.3, z0: z - d / 2 - 0.5, z1: z + d / 2 + 2.6 })),
    ...SHACKS.map(([x, z, w, d]) => ({ x0: x - w / 2 - 0.5, x1: x + w / 2 + 0.5, z0: z - d / 2 - 0.4, z1: z + d / 2 + 1.4 })),
    { x0: RT.stair.x0 - 0.6, x1: RT.box.x1 + 0.6, z0: RT.box.z0 - 0.6, z1: RT.box.z1 + 1.4 },
    ...PARASOLS.map(([x, z]) => ({ x0: x - 1.5, x1: x + 1.5, z0: z - 1.5, z1: z + 1.5 })),
    ...ISLAND_PIROGUES.map(([x, z]) => ({ x0: x - 5, x1: x + 5, z0: z - 1.5, z1: z + 1.5 })),
    { ...I.clear, z0: I.clear.z0 - 4 },
  ];
  return out;
}
const segDist = (p: P2, a: P2, b: P2) => {
  const dx = b.x - a.x, dz = b.z - a.z, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(p.x - a.x - t * dx, p.z - a.z - t * dz);
};
/** How far (x, z) is from the way up from the landing and its waiting spots: nothing planted or built stands within a metre and a half of them. */
export const ngorPathDistance = (x: number, z: number) => Math.min(
  ...I.path.slice(1).map((b, n) => segDist({ x, z }, I.path[n], b)), ...I.waiting.map(w => Math.hypot(x - w.x, z - w.z)),
);
/**
 * The island planted densely (the owner: « more trees »; photos 2–4): palms and leafy trees on the hill, round the houses and behind the beach, placed
 * from their own random sequence where the ground is above the beach's top and nothing is built, a few metres apart. x, z, radius (palms: 0), in the
 * order Low keeps the first of.
 */
function plantedTrees(): [number, number, number][] {
  const R = rng(1957), out: [number, number, number][] = [], busy = builtOn(), hand = [...PALMS.map(([x, z]) => [x, z, 1.4]), ...TREES];
  for (let n = 0; n < 900 && out.length < 46; n++) {
    const x = -14 + R() * 108, z = -306 - R() * 62, palm = out.length % 3 === 0, r = palm ? 0 : 1.8 + R() * 1.3, keep = r + (palm ? 1.6 : 0.6);
    if (ngorGroundY(x, z) < (palm ? 0.5 : 0.75) || ngorPathDistance(x, z) < keep + 1.5) continue;
    if (busy.some(b => x > b.x0 - keep && x < b.x1 + keep && z > b.z0 - keep && z < b.z1 + keep)) continue;
    if ([...out, ...hand].some(([ox, oz, or]) => Math.hypot(x - ox, z - oz) < (or || 1.4) + keep + 0.8)) continue;
    out.push([x, z, r]);
  }
  return out;
}
let planted: [number, number, number][] | null = null;

/**
 * The island of Ngor offshore (the owner's photos 2–4): a low island whose landing beach of golden sand runs gently into the turquoise shallows
 * (ngorGroundY), dark rocks in the water either side of it; on the beach, colourful parasols over plastic tables and chairs, three beach restaurants'
 * shacks with painted walls, pirogues drawn up; behind it the rooftop restaurant and lounge bar (island.rooftop), houses in red, ochre and yellow
 * behind low stone walls (their windows lit at night on the lamps' material), palms leaning over all of it and dense green trees on the hill. No jetty:
 * the boats run their bows up the sand. Nothing stands in the landing's clear zone, on the path up from it or on the waiting spots (island.path,
 * island.waiting). About 7 900 triangles (4 000 on Low), all in the hub's batches. Out of the walkable bounds: only the customers set foot on it.
 */
export function buildNgorIsland(k: NgorBatches, lite: boolean) {
  const { plain, leaves, trunks, bulbs } = k, R = rng(4242);
  plain.coloured(ngorGround(lite));
  // dark basalt rocks along the shore (none along the landing's beach) and a knoll of them to the north-west, the island's highest point; more in the
  // water either side of the landing, standing out of the shallows
  const ROCK = [0x4a443e, 0x57504a, 0x3d3833];
  const rocks = lite ? 7 : 11;
  for (let n = 0; n < rocks; n++) {
    let t = (n + R() * 0.6) / rocks * Math.PI * 2;
    if (Math.abs(angleTo(t, LANDING)) < 0.75) t = LANDING + Math.sign(angleTo(t, LANDING) || 1) * (0.75 + R() * 0.3);
    const r = 0.92 + R() * 0.08, p = islandXZ(r, t), s = 1.1 + R() * 1.6, sy = 0.6 + R() * 0.35;
    plain.blob(s, p.x, Math.max(ngorGroundY(p.x, p.z), -0.1) + s * sy * 0.2, p.z, ROCK[n % 3], sy, 0);     // standing out of the sand and the surf, not lying on the water
  }
  for (const [r, t, s] of ([[0.78, -2.35, 3.2], [0.88, -2.6, 2.4], [0.7, -2.05, 2.2]] as const).slice(0, lite ? 1 : 3)) {
    const p = islandXZ(r, t); plain.blob(s, p.x, ngorGroundY(p.x, p.z) - 0.3, p.z, ROCK[0], 0.85, 0);
  }
  LANDING_ROCKS.slice(0, lite ? 4 : LANDING_ROCKS.length).forEach(([x, z, s], n) => plain.blob(s, x, Math.max(ngorGroundY(x, z), -0.35) + s * 0.12, z, ROCK[(n + 1) % 3], 0.62, 0));
  // the houses, facing the mainland: walls, a flat roof slab, a window between its open blue shutters (its pane on the lamps' material: dim by day, lit at
  // night) and a blue door; bougainvillea over a few walls; a low stone wall along the front of each plot, a gap at its gate
  for (const [x, z, w, d, storeys, wall, flowers] of HOUSES.slice(0, lite ? 5 : HOUSES.length)) {
    const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => ngorGroundY(x + sx * w / 2, z + sz * d / 2));
    const foot = Math.min(...corners) - 0.15, floor = Math.max(...corners), top = floor + storeys * 3, zf = z + d / 2;
    plain.box(w, top - foot, d, x, foot, z, wall);
    plain.slab(w + 0.3, 0.16, d + 0.3, x, top + 0.06, z, 0xe9e6dc);
    plain.box(0.95, 2.0, 0.06, x - w * 0.24, floor, zf, BLUE);
    for (let s = 0; s < storeys; s++) {
      const xw = x + w * 0.2, yw = floor + 1.0 + s * 3;
      bulbs.box(0.75, 0.9, 0.05, xw, yw, zf + 0.02, 0xffd890);
      if (!lite) plain.box(1.5, 0.95, 0.03, xw, yw - 0.02, zf + 0.01, BLUE);              // the open shutters either side of the pane
    }
    if (flowers && !lite) leaves.blob(1.0, x - w / 2 + 0.55, top - 0.35, zf - 0.25, 0xb8457f, 0.8, 0);     // spilling over the roof's corner
    const wz = zf + 2.2, gate = x - w * 0.24;
    stoneWall(plain, x - w / 2 - 1.2, gate - 0.7, wz);
    if (!lite) stoneWall(plain, gate + 0.7, x + w / 2 + 1.2, wz);
  }
  for (const [x, z, w, d, wall, board] of SHACKS) shack(plain, x, z, w, d, wall, board);
  buildRooftop(k, lite);
  // the parasols over plastic tables and chairs, or loungers; those over the waiting spots shade whoever waits there (nothing on the spot itself)
  PARASOLS.slice(0, lite ? 6 : PARASOLS.length).forEach(([x, z, color, under], n) => {
    const y = ngorGroundY(x, z) - 0.04;
    parasol(plain, x, y, z, color);
    if (under === 'table') {
      table(plain, x, y, z);
      if (!lite) for (const a of [-2.2, 2.6]) chair(plain, x + Math.sin(a) * 0.72, y, z + Math.cos(a) * 0.72, a + Math.PI, CHAIRS[(n + (a > 0 ? 1 : 3)) % CHAIRS.length]);
    } else if (under === 'loungers' && !lite) for (const s of [-1, 1]) {
      plain.box(0.62, 0.32, 1.8, x + s * 0.5, y, z - 0.2, 0xf2c018);
      plain.box(0.62, 0.62, 0.08, x + s * 0.5, y + 0.3, z - 1.05, 0xf2c018, 0);                 // its backrest up
    }
  });
  // palms on the beach and among the houses (photos 2 and 3: many, tall), leaning a little, their fronds drooping; the trees' canopies, low and dense
  // (filao, mango, neem: from the mainland a green island), a few on their trunks; bushes along the beach's top; then the island planted densely
  for (const [x, z] of PALMS.slice(0, lite ? 7 : PALMS.length)) palmTree(k, x, ngorGroundY(x, z) - 0.1, z, 0.95 + R() * 0.25, R, lite ? 5 : 6);
  const tree = (x: number, z: number, r: number, n: number, trunk: boolean) => {
    const y = ngorGroundY(x, z), lift = trunk ? r * 0.75 : 0;
    if (lift) trunks.cyl(0.18, 0.26, lift + r * 0.4, x, y - 0.1, z, 0x6e5a44, 5);
    leaves.blob(r, x, y + r * 0.6 + lift, z, [0x3d6b2c, 0x4a7a34, 0x2f5a26, 0x568a3a][n % 4], 0.78, 0);
  };
  TREES.slice(0, lite ? 10 : TREES.length).forEach(([x, z, r], n) => tree(x, z, r, n, n < 4 && !lite));
  if (!lite) for (const [x, z, r] of BUSHES) leaves.blob(r, x, ngorGroundY(x, z) + r * 0.45, z, 0x4f7a32, 0.7, 0);
  planted ??= plantedTrees();
  const P = rng(31);
  planted.slice(0, lite ? 16 : planted.length).forEach(([x, z, r], n) => {
    if (r === 0) palmTree(k, x, ngorGroundY(x, z) - 0.1, z, 0.9 + P() * 0.3, P, lite ? 5 : 6);
    else tree(x, z, r, n, n % 4 === 1 && !lite);
  });
  // pirogues drawn up on the beach west of the landing
  for (const [x, z, yaw, v] of ISLAND_PIROGUES.slice(0, lite ? 1 : 2)) pirogue(plain, x, z, 9, yaw, v, ngorGroundY(x, z) - 0.06, { trued: true, segments: 6, fittings: false });
}

/** Points of the island's shoreline (its z −300 ring, the waterline on the rocky shore), for checks. */
export function ngorShore(n = 24): V3[] {
  return Array.from({ length: n }, (_, j) => { const t = j / n * Math.PI * 2, p = islandXZ(ringR(2, t), t); return [p.x, ringY(2, t), p.z] as V3; });
}
