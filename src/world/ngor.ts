import * as THREE from 'three';
import type { Batch } from './batch';
import { pirogue } from './city';
import { rng } from '../core/rng';
import { TRAVERSEE_SITE as S } from '../sea/traverseeSite';
import type { Collider } from './types';

/**
 * The Embarcadère de Ngor's static scene (docs/TRAVERSEE.md; where things are: src/sea/traverseeSite.ts), merged into the Almadies' own batches so it
 * adds no draw call: the quay (the pier carried over the beach, the floating pontoon, the pirogues pulled up on the sand) and the island of Ngor
 * offshore. The boats that cross are not here: the crossing builds and moves them (src/world/boats.ts, src/venues/embarcadere.ts).
 */
export interface NgorBatches { plain: Batch; leaves: Batch; trunks: Batch; bulbs: Batch }
/** A walked surface (src/world/builder.ts heightAt): flat here, y0 = y1. */
export interface NgorRamp { x0: number; x1: number; z0: number; z1: number; y0: number; y1: number; xEnd: number }

type V3 = [number, number, number];
const WOOD = 0x8b6a47, SEAM = 0x6b4f33, PILE = 0x5c4128, IRON = 0x2b2f35, STEEL = 0xb8bcc0, BULB = 0xffe2a0;

/** A life ring (orange and white quarters) standing on edge, its face toward +z turned by `yaw`. */
function lifeRing(b: Batch, x: number, y: number, z: number, yaw: number) {
  for (let q = 0; q < 4; q++) { const g = new THREE.TorusGeometry(0.26, 0.055, 4, 3, Math.PI / 2); g.rotateZ(q * Math.PI / 2); b.geometry(g, q % 2 ? 0xf6f4ee : 0xf26a1b, x, y, z, yaw); }
}

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
  // bollards on its east edge where the moored boat's lines go, a ladder down into the water at its end
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
  const moorZ = S.quayMooring.z;
  for (const z of [moorZ - 2.8, moorZ + 2.9]) plain.cyl(0.09, 0.12, 0.26, Q.x1 - 0.3, PD, z, IRON, 6);
  for (const x of [pcx - 0.3, pcx + 0.3]) { plain.box(0.05, 1.55, 0.05, x, -0.6, Q.z0 - 0.05, STEEL); plain.box(0.05, 0.05, 0.42, x, 0.9, Q.z0 + 0.14, STEEL); }
  for (const y of [-0.22, 0.06]) plain.box(0.6, 0.04, 0.05, pcx, y, Q.z0 - 0.07, STEEL);
  // the pirogues pulled up on the sand (src/world/city.ts pirogue(), bows to the sea), clear of the pier, the pontoon, the moored boats and the coast
  // road; four lie where the quay's pirogues always lay (the people by them: src/social/ambientSpots.ts), the fifth, which lay across the pier's line,
  // now lies east of it near the water's edge
  const colliders: Collider[] = [];
  const beached = [{ dx: -17, yaw: 0.1 }, { dx: -9, yaw: -0.08 }, { dx: 10.5, yaw: 0.28, z: -151.5 }, { dx: 7, yaw: 0.06 }, { dx: 15, yaw: -0.12 }];
  beached.forEach((p, n) => {
    const x = cx + p.dx, z = p.z !== undefined ? p.z - rand() * 1.5 : bz - 24 - rand() * 3;
    pirogue(plain, x, z, 10, p.yaw, n % 3, 0.06, { trued: true, segments: lite ? 8 : 12 });
    const c = Math.abs(Math.cos(p.yaw)), s = Math.abs(Math.sin(p.yaw)), hx = c * 1.1 + s * 5, hz = s * 1.1 + c * 5;
    colliders.push({ x0: x - hx, x1: x + hx, z0: z - hz, z1: z + hz, h: 1 });
  });
  return { ramps, colliders };
}

// ------------------------------------------------------------------ the island
const I = S.island, ICX = I.centre.x, ICZ = I.centre.z, IA = I.size.x / 2, IB = I.size.z / 2;
/** The landing's direction from the island's centre (the jetty's foot): the shore keeps to the contract's z −300 there. */
const LANDING = Math.atan2(((I.jetty.z0 + 2) - ICZ) / IB, ((I.jetty.x0 + I.jetty.x1) / 2 - ICX) / IA);
const angleTo = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
/** The shore's radius (1 = the contract's ellipse) round the island: coves and points, none at the landing. */
function shore(t: number) {
  const m = 0.07 * Math.sin(3 * t + 0.7) + 0.045 * Math.sin(5 * t + 2.1) + 0.03 * Math.sin(8 * t + 0.3);
  return 1 + m * (1 - Math.exp(-((angleTo(t, LANDING) / 0.32) ** 2)));
}
/** Rings out from the centre: radius (fraction of the shore's), height and colour. The second ring is the waterline: just below the sea (y 0.05), so
 *  the sand runs into it on a slope and the shore is where they cross, never a seam lying on the water. */
const RINGS: [number, number, number][] = [
  [1.1, -0.7, 0xb39f78], [1.0, -0.06, 0xcbb78b], [0.95, 0.34, 0xe0cf9f], [0.83, 0.55, 0xe6d6a6], [0.64, 1.0, 0xd3ba84], [0.44, 2.0, 0xb6a46b], [0.22, 2.9, 0x9d9a60], [0, 3.3, 0x949659],
];
/** The rise of the inland ground at angle t: higher to the north-west, flatter toward the landing. */
function hill(t: number) {
  const h = 0.9 * Math.sin(2 * t + 0.6) + 0.5 * Math.cos(3 * t - 0.4);
  return Math.max(-0.6, h) * (1 - 0.6 * Math.exp(-((angleTo(t, LANDING) / 0.5) ** 2)));
}
const ringY = (i: number, t: number) => RINGS[i][1] + (RINGS[i][0] < 0.7 && RINGS[i][0] > 0 ? hill(t) * (0.7 - RINGS[i][0]) / 0.7 : 0);

/** The island's ground height at (x, z) (the sea's floor −0.7 off its shore), within a few centimetres of its mesh: for whoever walks on its sand. */
export function ngorGroundY(x: number, z: number): number {
  const u = (x - ICX) / IA, v = (z - ICZ) / IB, t = Math.atan2(v, u), r = Math.hypot(u, v) / shore(t);
  if (r >= RINGS[0][0]) return RINGS[0][1];
  for (let i = 0; i < RINGS.length - 1; i++) {
    const [r0] = RINGS[i], [r1] = RINGS[i + 1];
    if (r <= r0 && r >= r1) { const y0 = ringY(i, t), y1 = ringY(i + 1, t); return y1 + (y0 - y1) * (r - r1) / (r0 - r1); }
  }
  return ringY(RINGS.length - 1, t);
}
const islandXZ = (r: number, t: number) => ({ x: ICX + IA * shore(t) * r * Math.cos(t), z: ICZ + IB * shore(t) * r * Math.sin(t) });

/**
 * The island of Ngor offshore: a low island of sand and dark rocks whose sand runs down into the sea, the landing jetty on its south shore, a few
 * flat-roofed houses (white and ochre, blue shutters; their windows lit at night on the lamps' material), palms, a beach restaurant's terrace under
 * straw parasols by the landing and two pirogues on its beach. About 2 700 triangles (1 300 on Low), all in the hub's batches. Out of the walkable
 * bounds: only the customers set foot on it (ngorGroundY).
 */
export function buildNgorIsland(k: NgorBatches, lite: boolean) {
  const { plain, leaves, trunks, bulbs } = k, R = rng(4242);
  // the ground: rings round the centre with their colours, from wet sand to dry scrub
  const SEG = lite ? 18 : 24, rings = RINGS.length - 1, pos: number[] = [], col: number[] = [], idx: number[] = [];
  const tint = new THREE.Color();
  const vertex = (x: number, y: number, z: number, c: number, jitter: number) => {
    tint.setHex(c).multiplyScalar(1 + jitter); pos.push(x, y, z); col.push(tint.r, tint.g, tint.b); return pos.length / 3 - 1;
  };
  const at = (i: number, j: number) => i * (SEG + 1) + j;
  for (let i = 0; i < rings; i++) for (let j = 0; j <= SEG; j++) {
    const t = (j % SEG) / SEG * Math.PI * 2, p = islandXZ(RINGS[i][0], t);
    vertex(p.x, ringY(i, t), p.z, RINGS[i][2], (((j * 7 + i * 3) % 5) - 2) * 0.025);
  }
  const centre = vertex(ICX, RINGS[rings][1], ICZ, RINGS[rings][2], 0);
  for (let i = 0; i < rings - 1; i++) for (let j = 0; j < SEG; j++) { const a = at(i, j), b = at(i, j + 1), c = at(i + 1, j), d = at(i + 1, j + 1); idx.push(a, c, b, b, c, d); }
  for (let j = 0; j < SEG; j++) idx.push(at(rings - 1, j), centre, at(rings - 1, j + 1));
  const ground = new THREE.BufferGeometry();
  ground.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); ground.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); ground.setIndex(idx);
  ground.computeVertexNormals(); plain.coloured(ground);
  // dark basalt rocks along the shore (none on the landing's beach) and a knoll of them to the north-west, the island's highest point
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
  // the houses, facing the mainland: walls, a flat roof slab, a window between open blue shutters (its pane on the lamps' material: dim by day, lit at
  // night) and a blue door; bougainvillea over a few walls
  const WHITE = 0xf2efe6, OCHRE = 0xd9a55a, SAND = 0xe8d49a, SALMON = 0xe0a38a, BLUE = 0x2a6fb5;
  const houses: [number, number, number, number, number, number, boolean][] = [   // x, z, w, d, storeys, colour, bougainvillea
    [47, -319, 7, 6, 1, WHITE, true], [56, -322, 6, 6.5, 2, OCHRE, false], [65, -318, 7.5, 6, 1, WHITE, true], [25, -321, 6.5, 6, 1, OCHRE, true], [39, -332, 7, 6, 2, WHITE, false],
    [73, -325, 6, 6, 2, SAND, false], [80, -330, 7, 6, 1, WHITE, false], [16, -327, 6, 6.5, 2, WHITE, false], [60, -336, 6, 6, 1, SALMON, false],
  ];
  for (const [x, z, w, d, storeys, wall, flowers] of houses.slice(0, lite ? 5 : houses.length)) {
    const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => ngorGroundY(x + sx * w / 2, z + sz * d / 2));
    const foot = Math.min(...corners) - 0.15, floor = Math.max(...corners), top = floor + storeys * 3, zf = z + d / 2;
    plain.box(w, top - foot, d, x, foot, z, wall);
    plain.slab(w + 0.3, 0.16, d + 0.3, x, top + 0.06, z, 0xe9e6dc);
    plain.box(0.95, 2.0, 0.06, x - w * 0.24, floor, zf, BLUE);
    for (let s = 0; s < storeys; s++) {
      const xw = x + w * 0.2, yw = floor + 1.0 + s * 3;
      bulbs.box(0.75, 0.9, 0.05, xw, yw, zf, 0xffd890);
      if (!lite) for (const sx of [-1, 1]) plain.box(0.36, 0.95, 0.05, xw + sx * 0.58, yw - 0.02, zf + 0.02, BLUE);
    }
    if (flowers && !lite) leaves.blob(1.0, x - w / 2 + 0.55, top - 0.35, zf - 0.25, 0xb8457f, 0.8, 0);     // spilling over the roof's corner
  }
  // palms on the beach and among the houses, leaning a little; fronds drooping (slabs with both faces: seen from the pier nearly edge-on)
  const palms: [number, number][] = [[43, -306.5], [31, -309], [21, -312], [70, -310], [52, -312.5], [8, -318]];
  for (const [x, z] of palms.slice(0, lite ? 4 : palms.length)) {
    const s = 0.95 + R() * 0.2, h = 6.6 * s, y = ngorGroundY(x, z) - 0.1, ax = (R() - 0.5) * 0.24, az = (R() - 0.5) * 0.24;
    trunks.cyl(0.17 * s, 0.25 * s, h, x, y, z, 0x8a6d4a, 5, [ax, 0, az]);
    const tx = x - h * Math.cos(ax) * Math.sin(az), ty = y + h * Math.cos(ax) * Math.cos(az), tz = z + h * Math.sin(ax);
    const fronds = lite ? 4 : 5;
    for (let f = 0; f < fronds; f++) {
      const a = (f / fronds) * Math.PI * 2 + R() * 0.5;
      leaves.slab(0.62 * s, 0.06, 3.0 * s, tx + Math.sin(a) * 1.3 * s, ty - 0.25, tz + Math.cos(a) * 1.3 * s, f % 2 ? 0x2f7f3e : 0x3d9450, a, 0.38);
    }
  }
  if (!lite) for (const [x, z] of [[30, -326], [52, -328], [70, -331], [20, -336]]) leaves.blob(1.1, x, ngorGroundY(x, z) + 0.3, z, 0x4f6b2e, 0.7, 0);
  // the beach restaurant by the landing: a raised deck with its rail, straw parasols over tables, a bulb under two of them
  const TX = 46, TZ = -306, TY = 0.9;
  plain.box(10, TY - 0.1, 6, TX, 0.1, TZ, 0x9a7650);
  plain.box(10, 0.5, 0.08, TX, TY, TZ + 2.96, 0x7a5a3c);
  const parasols: [number, number][] = [[42.5, -305], [49.5, -305], [46, -307.4], [43, -308.2]];
  parasols.slice(0, lite ? 2 : 4).forEach(([x, z], n) => {
    plain.box(0.1, 2.1, 0.1, x, TY, z, 0x6e5a44);
    plain.cyl(0.06, 1.5, 0.7, x, TY + 1.85, z, 0xc9a35c, 7);
    plain.box(0.9, 0.72, 0.9, x, TY, z, 0xe9e2d0);
    if (n < 2) bulbs.box(0.12, 0.12, 0.12, x, TY + 1.7, z, 0xffd27a);
  });
  // the landing jetty (deckY: 0.45) on its piles, a lamp at its end on the west corner (the boat moors on the east)
  const J = I.jetty, jcx = (J.x0 + J.x1) / 2, jcz = (J.z0 + J.z1) / 2, JD = 0.45;
  plain.box(J.x1 - J.x0, 0.12, J.z1 - J.z0, jcx, JD - 0.12, jcz, 0x93714c);
  if (!lite) for (let z = J.z0 + 0.6; z < J.z1 - 0.3; z += 1.25) plain.flat(J.x1 - J.x0 - 0.1, 0.04, jcx, JD + 0.003, z, SEAM);
  for (const z of lite ? [J.z1 - 1.2, J.z1 - 8.8] : [J.z1 - 1.2, J.z1 - 5, J.z1 - 8.8, J.z1 - 12.6]) for (const x of [J.x0 + 0.12, J.x1 - 0.12]) plain.box(0.22, 1.4, 0.22, x, -0.85, z, PILE);
  plain.box(0.1, 2.1, 0.1, J.x0 + 0.3, JD, J.z1 - 0.4, IRON); bulbs.box(0.22, 0.28, 0.22, J.x0 + 0.3, JD + 2.1, J.z1 - 0.4, BULB); plain.box(0.3, 0.05, 0.3, J.x0 + 0.3, JD + 2.38, J.z1 - 0.4, IRON);
  // pirogues drawn up on the beach west of the landing
  const boats: [number, number, number, number][] = [[24.5, -304.8, Math.PI / 2 - 0.15, 1], [14.5, -307.5, Math.PI / 2 + 0.2, 2]];
  for (const [x, z, yaw, v] of boats.slice(0, lite ? 1 : 2)) pirogue(plain, x, z, 9, yaw, v, ngorGroundY(x, z) - 0.06, { trued: true, segments: 6 });
}

/** Points of the island's shoreline (the waterline ring), for checks. */
export function ngorShore(n = 24): V3[] {
  return Array.from({ length: n }, (_, j) => { const t = j / n * Math.PI * 2, p = islandXZ(RINGS[1][0], t); return [p.x, RINGS[1][1], p.z] as V3; });
}
