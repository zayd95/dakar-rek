import * as THREE from 'three';
import type { Batch } from './batch';
import type { Collider, HubWorld } from './types';
import { BAY } from './city';

/**
 * The Corniche Ouest's esplanade (the owner's drone reference, 11 Nov): a headland of ochre laterite out into the sea, opposite the end of the street at z = −60, with
 *  • the great round concrete esplanade on it (a ring step round a disc, people walking on it),
 *  • the painted terraces between the promenade and the disc: wavy bands of red, yellow and purple,
 *  • black basalt boulders along the headland's edge and here and there along the shore, an ochre bank at the foot of the sea wall,
 *  • turquoise shallows and lines of foam off the beach.
 * All of it in the hub's `plain` batch: no draw call. The headland is walked on: the promenade's sea-side railing and the sea wall are open between `gate0` and `gate1`
 * (src/world/builder.ts), and the walls returned here keep the walker on the headland and, everywhere else, at the water's edge where the district stopped before.
 * Everything lies flat (within a few centimetres of the sand): the game's ground has no height here, so a raised disc would be waded through.
 */
export const ESPLANADE = {
  /** The disc's centre and radius; the ring step's radius. */
  x: -160, z: -60, r: 15, ring: 16.6,
  /** The headland that can be walked on (x0 is its seaward edge); the old water's edge everywhere else. */
  x0: -176, shore: -155, z0: -78, z1: -42,
  /** The opening in the promenade's sea-side railing and in the sea wall. */
  gate0: -66, gate1: -54,
} as const;

const OCHRE = 0xd2a268, OCHRE_DARK = 0xbd8a52, CONCRETE = 0xcfc8ba, STEP = 0xa9a296, BASALT = 0x3a3b40, BASALT_2 = 0x4d4944, BASALT_3 = 0x2c2d31;
const RED = 0xc2452d, YELLOW = 0xe7b436, PURPLE = 0x8a4f7d, FOAM = 0xf4f1e6;
/** The shallows, from the beach out: turquoise, then toward the sea's own blue (src/world/builder.ts seaMat). */
const SHALLOWS = [0x58c9bb, 0x3fb3b6, 0x2f9db3] as const;

/** A flat band between two wavy edges (x by z), facing up: the painted terraces. */
function wavyBand(x: (z: number) => number, width: number, z0: number, z1: number, step = 1.6): THREE.BufferGeometry {
  const v: number[] = [];
  for (let z = z0; z < z1 - 1e-6; z += step) {
    const a = z, b = Math.min(z1, z + step), xa = x(a), xb = x(b);
    // (xa − w … xa) at a, (xb − w … xb) at b; wound to face up
    v.push(xa - width, 0, a, xb - width, 0, b, xa, 0, a, xa, 0, a, xb - width, 0, b, xb, 0, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  return g;
}
/** A flat ring sector lying on the ground (angles from +x toward −z), facing up. */
function arc(r0: number, r1: number, a0: number, a1: number, seg: number): THREE.BufferGeometry {
  const g = new THREE.RingGeometry(r0, r1, seg, 1, a0, a1 - a0);
  g.rotateX(-Math.PI / 2);
  return g;
}

export function buildEsplanade(k: { plain: Batch; G: number; lite: boolean }): { colliders: Collider[]; people: HubWorld['people'] } {
  const { plain, lite } = k, E = ESPLANADE, colliders: Collider[] = [];
  const wall = (x0: number, z0: number, x1: number, z1: number, h = 1.2) => colliders.push({ x0, z0, x1, z1, h });
  /** A number in 0…1 from a place (no random stream is drawn: the district's layout is untouched). */
  const hash = (a: number, b: number) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
  const rock = (x: number, z: number, r: number, i: number) => plain.blob(r, x, r * 0.22, z, [BASALT, BASALT_2, BASALT_3][i % 3], 0.5 + hash(x, z) * 0.45, 0);

  // ---- the shore, the whole length: an ochre bank at the foot of the sea wall, the shallows and their foam
  for (const [z0, z1] of [[-150, BAY.z0 - 2], [BAY.z1 + 2, 150]]) {                      // (not across the fish beach of Soumbédioune)
    plain.flat(5.2, z1 - z0, -138.9, 0.078, (z0 + z1) / 2, OCHRE);
    for (let z = z0; z < z1 - 4; z += 9) plain.flat(2.2 + hash(z, 1) * 2.4, Math.min(9, z1 - z), -142.2 - hash(z, 2) * 1.2, 0.058, z + Math.min(9, z1 - z) / 2, OCHRE_DARK);   // its ragged edge on the sand
  }
  plain.flat(16, 320, -165, 0.07, 0, SHALLOWS[0]); plain.flat(16, 320, -181, 0.07, 0, SHALLOWS[1]); plain.flat(18, 320, -198, 0.07, 0, SHALLOWS[2]);
  // two lines of foam off the beach, each one wavering strip (broken where the headland stands)
  for (const [z0, z1] of [[-158, E.z0 - 12], [E.z1 + 12, 158]]) {
    plain.geometry(wavyBand(z => -168.2 - 1.3 * Math.sin(z * 0.11) - 0.6 * Math.sin(z * 0.37 + 1), 1.2, z0, z1, 2.5), FOAM, 0, 0.09, 0);
    plain.geometry(wavyBand(z => -179.5 - 1.8 * Math.sin(z * 0.08 + 2) - 0.7 * Math.sin(z * 0.29), 0.8, z0 + 9, z1 - 6, 2.5), FOAM, 0, 0.09, 0);
  }

  // ---- the headland: laterite, the round esplanade, the painted terraces
  plain.cyl(26, 27.6, 0.1, E.x - 2, 0, E.z, OCHRE, lite ? 20 : 32);
  plain.geometry(arc(27.4, 29.6, Math.PI * 0.62, Math.PI * 1.38, lite ? 10 : 18), FOAM, E.x - 2, 0.092, E.z);   // the swell breaking round it
  plain.cyl(E.ring, E.ring, 0.02, E.x, 0.1, E.z, STEP, lite ? 24 : 40);                  // the ring step
  plain.cyl(E.r, E.r, 0.02, E.x, 0.12, E.z, CONCRETE, lite ? 24 : 40);                   // the disc
  plain.geometry(arc(E.r - 2.6, E.r - 2.3, 0, Math.PI * 2, lite ? 24 : 40), STEP, E.x, 0.162, E.z);   // the joint of its outer ring of slabs
  for (let n = 0; n < 12; n++) { const a = (n / 12) * Math.PI * 2; plain.flat(0.12, 2.3, E.x + Math.sin(a) * (E.r - 1.15), 0.162, E.z + Math.cos(a) * (E.r - 1.15), STEP, a); }
  const bands: [number, number][] = [[RED, 1.5], [YELLOW, 1.1], [PURPLE, 1.5], [RED, 1.3], [YELLOW, 1.1]];
  let edge = -136.4;
  bands.forEach(([colour, w], i) => {
    const e = edge, half = 13.5 - i * 0.9;                                                // each band a little shorter than the one above: they fan toward the disc
    plain.geometry(wavyBand(z => e - 0.55 * Math.sin((z - E.z) * 0.42 + i * 0.9) - 0.25 * Math.cos((z - E.z) * 0.9), w, E.z - half, E.z + half), colour, 0, 0.125 + i * 0.004, 0);
    edge -= w + 0.12;
  });

  // ---- basalt: along the headland's edge beyond the old water's edge (where the walls below stand), and in heaps along the shore
  let n = 0;
  for (let x = E.shore - 0.5; x > E.x0 - 1.2; x -= 1.7, n++) for (const z of [E.z0 - 1.0, E.z1 + 1.0]) {
    rock(x + hash(x, z) * 0.7, z + (hash(z, x) - 0.5) * 1.1, 0.7 + hash(x, n) * 1.0, n);
    if (hash(x, z + 3) > 0.45) rock(x + 0.8, z + Math.sign(z - E.z) * (1.3 + hash(x, 5) * 0.8), 0.5 + hash(n, x) * 0.7, n + 1);   // a second, lower row outside
  }
  for (let z = E.z0 - 0.6; z < E.z1 + 0.8; z += 1.7, n++) {
    rock(E.x0 - 1.2 - hash(z, 9) * 0.8, z + (hash(z, 10) - 0.5) * 0.7, 0.75 + hash(z, n) * 1.0, n);
    if (hash(z, 12) > 0.45) rock(E.x0 - 2.7 - hash(z, 13) * 0.9, z + 0.8, 0.5 + hash(n, z) * 0.7, n + 1);
  }
  if (!lite) for (let a = Math.PI * 0.66; a < Math.PI * 1.34; a += 0.07, n++) rock(E.x - 2 + Math.cos(a) * (26.6 + hash(a, 1) * 1.6), E.z - Math.sin(a) * (26.6 + hash(a, 2) * 1.6), 0.6 + hash(a, 3) * 1.0, n);   // the riprap at the waterline
  for (let z = -128; z < 130; z += 23) {
    if (z > E.z0 - 14 && z < E.z1 + 14) continue;                                         // (the headland has its own)
    for (let j = 0; j < (lite ? 3 : 6); j++, n++) rock(-156.8 - hash(z, j) * 5, z + (hash(j, z) - 0.5) * 8, 0.5 + hash(z + j, 11) * 1.0, n);
  }

  // ---- where one can walk: the headland beyond the old water's edge; everywhere else the shore stops where it did
  wall(E.shore - 1, -170, E.shore - 0.4, E.z0);            wall(E.shore - 1, E.z1, E.shore - 0.4, 170);
  wall(E.x0 - 0.6, E.z0 - 0.6, E.shore - 0.4, E.z0);       wall(E.x0 - 0.6, E.z1, E.shore - 0.4, E.z1 + 0.6);
  wall(E.x0 - 0.6, E.z0 - 0.6, E.x0, E.z1 + 0.6);
  // the strip of grass between the railing and the sea wall is not a path: closed either side of the way down
  wall(-136.1, E.gate0 - 0.3, -133.4, E.gate0);            wall(-136.1, E.gate1, -133.4, E.gate1 + 0.3);

  // a few people on the disc, as on any evening (none on Low)
  const people: HubWorld['people'] = lite ? [] : [
    { x: E.x - 4.2, z: E.z + 3.1, yaw: -Math.PI / 2, clip: 'Idle' },
    { x: E.x + 5.0, z: E.z - 6.2, yaw: 2.2, clip: 'Talk' }, { x: E.x + 4.1, z: E.z - 5.4, yaw: -0.9, clip: 'Talk' },
  ];
  return { colliders, people };
}

/**
 * Dakar 2026: the city is hosting the Youth Games this autumn, and the Corniche is dressed for it (the owner, 11 Nov: « incorporate few JOJ 2026 theme »).
 *  • a welcome arch over the way down to the esplanade, named on both faces;
 *  • a line of nations' flags on masts in the rocks at the headland's seaward edge (beyond where one walks: nothing to bump into);
 *  • returned to the builder: the colours of the banners it hangs on the median's lamp posts.
 * Plain shapes in the hub's batch and two painted signs. No emblem of the Games is drawn (the rings, the logo and the mascot are not ours to reproduce): the dressing is
 * the host city's own, in the national colours.
 */
export const GAMES = { green: 0x00853f, yellow: 0xfdef42, red: 0xe31b23, white: 0xf7f4ea } as const;
type Flag = { v?: [number, number, number]; h?: [number, number, number]; dot?: number };
const FLAGS: Flag[] = [
  { v: [0x00853f, 0xfdef42, 0xe31b23] },            // Sénégal
  { v: [0x0055a4, 0xffffff, 0xef4135] },            // France
  { v: [0x008751, 0xffffff, 0x008751] },            // Nigeria
  { h: [0x000000, 0xdd0000, 0xffce00] },            // Allemagne
  { v: [0xf77f00, 0xffffff, 0x009e60] },            // Côte d'Ivoire
  { h: [0x74acdf, 0xffffff, 0x74acdf] },            // Argentine
  { v: [0x14b53a, 0xfcd116, 0xce1126] },            // Mali
  { h: [0xffffff, 0xffffff, 0xffffff], dot: 0xbc002d },   // Japon
  { v: [0x009246, 0xffffff, 0xce2b37] },            // Italie
  { h: [0xce1126, 0xffffff, 0x000000] },            // Égypte
  { v: [0x009739, 0xfedd00, 0x009739] },            // (vert et or)
  { h: [0xae1c28, 0xffffff, 0x21468b] },            // Pays-Bas
  { v: [0x00853f, 0xfdef42, 0xe31b23] },            // Sénégal
];
export function buildGamesDressing(k: { plain: Batch; sign(text: string, bg: string, fg: string, x: number, y: number, z: number, yaw: number, w?: number, h?: number): void; lite: boolean }): Collider[] {
  const { plain } = k, E = ESPLANADE, colliders: Collider[] = [];
  // ---- the welcome arch on the sea wall's line, either side of the way down
  const AX = -135.8, H = 5.4, PILLAR = 0.7;
  for (const z of [E.gate0 - PILLAR / 2, E.gate1 + PILLAR / 2]) {
    plain.box(PILLAR, H, PILLAR, AX, 0, z, GAMES.white);
    plain.box(PILLAR + 0.06, 0.5, PILLAR + 0.06, AX, 0.9, z, GAMES.green); plain.box(PILLAR + 0.06, 0.5, PILLAR + 0.06, AX, 1.4, z, GAMES.yellow); plain.box(PILLAR + 0.06, 0.5, PILLAR + 0.06, AX, 1.9, z, GAMES.red);
    colliders.push({ x0: AX - PILLAR / 2, x1: AX + PILLAR / 2, z0: z - PILLAR / 2, z1: z + PILLAR / 2, h: H });
  }
  const span = E.gate1 - E.gate0 + PILLAR * 2;
  plain.box(0.5, 1.5, span, AX, H - 1.5, (E.gate0 + E.gate1) / 2, 0x0d3b2a);
  plain.box(0.56, 0.12, span + 0.3, AX, H, (E.gate0 + E.gate1) / 2, GAMES.yellow);
  k.sign('DAKAR 2026 · JEUX DE LA JEUNESSE', '#0d3b2a', '#fdef42', AX + 0.27, H - 0.75, (E.gate0 + E.gate1) / 2, Math.PI / 2, span - 1.6, 1.1);
  k.sign('DALAL AK JÀMM · BIENVENUE', '#0d3b2a', '#f7f4ea', AX - 0.27, H - 0.75, (E.gate0 + E.gate1) / 2, -Math.PI / 2, span - 1.6, 1.1);
  // ---- the nations' flags: masts in the rocks along the headland's seaward edge
  const n = k.lite ? 7 : FLAGS.length, MX = E.x0 - 1.9, MH = 7.2, FW = 1.9, FH = 1.15;
  for (let i = 0; i < n; i++) {
    const z = E.z0 + 1.5 + ((E.z1 - E.z0 - 3) * i) / (n - 1), f = FLAGS[i % FLAGS.length], y = MH - FH - 0.15;
    plain.cyl(0.05, 0.07, MH, MX, 0.3, z, 0xd9d9d9, 5); plain.blob(0.11, MX, MH + 0.36, z, 0xe9b93a, 1, 0);
    if (f.v) f.v.forEach((c, j) => plain.box(0.03, FH, FW / 3, MX, y, z + 0.08 + FW / 6 + (j * FW) / 3, c));
    else if (f.h) f.h.forEach((c, j) => plain.box(0.03, FH / 3, FW, MX, y + FH - ((j + 1) * FH) / 3, z + 0.08 + FW / 2, c));
    if (f.dot !== undefined) plain.box(0.05, 0.5, 0.5, MX, y + FH / 2 - 0.25, z + 0.08 + FW / 2, f.dot);
  }
  return colliders;
}

/**
 * Two landmarks of the Corniche's shore (the owner's photograph of the Corniche road, 11 Nov: the twin minarets over the palms):
 *  • the **Mosquée de la Divinité** on the beach below the road, built in the hub's batch: two tall square white minarets side by side, tier on tier of small arched
 *    balconies, each under a green dome; the low white prayer hall behind them under its own green dome. Solid (one box).
 *  • the **Mamelles**: a hill of laterite out in the sea north of the esplanade, basalt at its foot; the lighthouse on it is a model (src/world/landmarks.ts).
 *    Out of reach: nothing to bump into.
 */
export const MOSQUE = { x: -147, z: 24, w: 14, d: 22 } as const;
export const MAMELLES = { x: -226, z: -152, top: 15, lighthouse: 17 } as const;
export function buildShoreLandmarks(k: { plain: Batch; lite: boolean }): Collider[] {
  const { plain, lite } = k, M = MOSQUE, WHITE = 0xf5f2e9, SHADE = 0xe2dccb, GREEN = 0x1f8a55, DARK = 0x3b4a44;
  // ---- the mosque
  plain.box(M.w, 0.5, M.d, M.x, 0, M.z, 0xe6dfcc);                                                        // its terrace on the sand
  const hx = M.x - 1.6, hz = M.z + 3.2;
  plain.box(9.5, 5.6, 12.5, hx, 0.5, hz, WHITE); plain.box(9.9, 0.35, 12.9, hx, 6.1, hz, SHADE);           // the prayer hall and its cornice
  plain.cyl(3.3, 3.3, 1.1, hx, 6.45, hz, WHITE, 12); plain.sphere(3.25, hx, 7.5, hz, GREEN, true); plain.cyl(0.05, 0.09, 1.3, hx, 10.7, hz, 0xd8b23a, 5);
  for (const [dx, dz] of [[-3.6, -5], [3.6, -5], [-3.6, 5], [3.6, 5]]) { plain.cyl(0.95, 0.95, 0.5, hx + dx, 6.45, hz + dz, WHITE, 8); plain.sphere(0.95, hx + dx, 6.9, hz + dz, GREEN, true); }
  for (let i = 0; i < 5; i++) { plain.box(0.08, 2.6, 1.2, hx + 4.78, 1.6, hz - 4.8 + i * 2.4, DARK); plain.cyl(0.6, 0.6, 0.08, hx + 4.78, 4.2, hz - 4.8 + i * 2.4, DARK, 8, [0, 0, Math.PI / 2]); }   // pointed windows on the road's side
  plain.box(0.1, 3.2, 2.0, hx + 4.8, 0.5, hz - 7.6 + 12.5 / 2 + 1.35, 0x1d5c3c);                              // the door
  // the two minarets, toward the road
  for (const mz of [M.z - 7.4, M.z - 3.6]) {
    const mx = M.x + 4.6, S = 2.5, TIER = 3.3, tiers = 6;
    for (let t = 0; t < tiers; t++) {
      const y = 0.5 + t * TIER, s = S - t * 0.09;
      plain.box(s, TIER, s, mx, y, mz, t % 2 ? WHITE : 0xf1ede2);
      plain.box(s + 0.9, 0.22, s + 0.9, mx, y + TIER - 0.22, mz, SHADE);                                  // the balcony's slab
      if (!lite || t % 2 === 0) for (const [fx, fz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {               // an arched opening on each face
        plain.box(fx ? 0.06 : 0.8, 1.5, fz ? 0.06 : 0.8, mx + fx * (s / 2 + 0.01), y + 0.9, mz + fz * (s / 2 + 0.01), DARK);
        plain.box(fx ? 0.08 : s + 0.7, 0.5, fz ? 0.08 : s + 0.7, mx + fx * (s / 2 + 0.44), y + TIER, mz + fz * (s / 2 + 0.44), WHITE);   // the balcony's parapet
      }
    }
    const top = 0.5 + tiers * TIER;
    plain.cyl(1.15, 1.25, 1.4, mx, top, mz, WHITE, 8); plain.sphere(1.5, mx, top + 2.1, mz, GREEN); plain.cyl(0.04, 0.07, 1.2, mx, top + 3.5, mz, 0xd8b23a, 5);
  }
  const colliders: Collider[] = [{ x0: M.x - M.w / 2, x1: M.x + M.w / 2, z0: M.z - M.d / 2, z1: M.z + M.d / 2, h: 8 }];
  // ---- the Mamelles: the hill in the sea, its rocks
  const L = MAMELLES;
  plain.cyl(8, 25, L.top, L.x, 0, L.z, 0xb9955c, lite ? 12 : 18); plain.cyl(7.6, 8.4, 0.4, L.x, L.top - 0.2, L.z, 0xcbb489, 12);
  plain.cyl(13, 22, 6, L.x + 16, 0, L.z + 20, 0xa98a54, lite ? 10 : 14);                                    // its lower twin
  for (let i = 0; i < (lite ? 10 : 22); i++) { const a = (i / (lite ? 10 : 22)) * Math.PI * 2, r = 24.5 + Math.sin(i * 7.3) * 1.2; plain.blob(1.1 + (Math.sin(i * 3.1) + 1) * 0.6, L.x + Math.cos(a) * r, 0.3, L.z + Math.sin(a) * r, i % 2 ? 0x3a3b40 : 0x4d4944, 0.6, 0); }
  for (let i = 0; i < (lite ? 6 : 14); i++) { const a = i * 2.4, r = 10 + (i % 5) * 2.6; plain.blob(1.3 + (i % 3) * 0.5, L.x + Math.cos(a) * r, L.top * (1 - (r - 8) / 17) - 0.3, L.z + Math.sin(a) * r, i % 3 ? 0x5f7a3a : 0x7a8a46, 0.55, 0); }   // scrub on its flanks
  return colliders;
}
