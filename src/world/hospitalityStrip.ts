import type { Batch } from './batch';
import type { Canopy, HubWorld } from './types';
import { rng } from '../core/rng';

/**
 * The venues of the Almadies' night street (src/world/nightStreet.ts places them): Lounge 221, Le Comptoir de Ngor, Chez Binta and Café du Phare, each a building of its own that does
 * not look like the others, and the lit alley to La Vague's gate. They were M4's hospitality strip (docs/districts/M4-STRIP-PLACEMAKING.md) on the two sea-front blocks; the integration
 * with LD2.0-E's district (docs/districts/ALMADIES-NIGHTLIFE.md) gives those blocks back to the district's hotels, moves the venues to the beach side of the coast road and turns them to
 * face it. The Terrasse de Ngor is the boutique hotel's roof and Le Patio the courtyard club (src/venues/patio.ts): neither is drawn here any more.
 *
 * Nothing here is a villa: the references are the Corniche des Almadies restaurants (rooftop terraces with pergolas and umbrellas, timber-slat screens over glass, beach paillotes with
 * thatch, a lighthouse-like café) and a night street of neon, festoons and velvet ropes. Venue names are invented. Each builder draws a building whose front is at −z (z − VENUE_D / 2);
 * `turned` (nightStreet.ts) turns it round to face the other way.
 *
 * It only adds merged primitives and colliders. It draws nothing from the generator's own random stream (the districts around keep their layout): a local stream feeds the parked cars.
 */
export interface StripKit {
  plain: Batch; glass: Batch; metal: Batch; lampBulbs: Batch; lampPosts: Batch; leaves: Batch; trunks: Batch; tin: Batch; tileRoof: Batch;
  canopies: Canopy[]; people: HubWorld['people'];
  G: number; lite: boolean; seed: number;
  addSign: (text: string, bg: string, fg: string, x: number, y: number, z: number, rotY: number, w?: number, h?: number) => void;
  solidC: (cx: number, cz: number, w: number, d: number, h: number) => void;
  pool: (x: number, z: number, r: number, y?: number) => void;
  shade: (c: number, k: number) => number;
}
export type K = StripKit;

export const VENUE_W = 12.2, VENUE_D = 9;

/** Where the alley runs from the coast road to La Vague's gate: the street dressing keeps out of it, and the walkers' way from the taxi rank (src/crowd/clubPlan.ts) stays clear. */
export const ALLEY_RECT = { x0: -52, z0: -136, x1: -24, z1: -126.5 };

export const WARM = 0xffe2a0, NEON_PINK = 0xff3fb0, NEON_CYAN = 0x38e8ff, NEON_AMBER = 0xffa927;

// ---------------------------------------------------------------- small parts
export const palm = (k: K, x: number, z: number, s = 1) => {
  const h = 5.4 * s;
  k.trunks.cyl(0.17 * s, 0.24 * s, h, x, 0.1, z, 0x8a6d4a, 5);
  const top = 0.1 + h;
  k.canopies.push({ x, z, r: 2.8 * s, y0: top - 0.6 * s, y1: top + 0.3 * s });
  for (let n = 0; n < 7; n++) {
    const a = (n / 7) * Math.PI * 2 + 0.3, len = 3 * s;
    k.leaves.box(0.7 * s, 0.1 * s, len, x + Math.sin(a) * len * 0.45, top - 0.25 * s, z + Math.cos(a) * len * 0.45, n % 2 ? 0x2f7f3e : 0x3d9450, a);
  }
  k.leaves.blob(0.4 * s, x, top - 0.1, z, 0x6b5a2a, 1, 0);
};
export const planter = (k: K, x: number, z: number, w: number, d: number, col = 0xe7e1d4, green = true) => {
  const { plain, leaves, G } = k;
  plain.box(w, 0.62, d, x, G, z, col);
  plain.box(w + 0.12, 0.08, d + 0.12, x, G + 0.62, z, k.shade(col, 0.85));
  if (green) for (let n = 0; n < Math.max(2, Math.round(w / 0.7)); n++) leaves.blob(0.38, x - w / 2 + 0.4 + n * 0.7, G + 0.95, z + (n % 2 ? 0.08 : -0.08), n % 3 ? 0x3d8a44 : 0x2f7a3a, 0.8, 0);
  k.solidC(x, z, w, d, 0.7);
};
export const bougainvillea = (k: K, x: number, y: number, z: number, w: number) => {
  for (let n = 0; n < Math.round(w / 0.8); n++) k.leaves.blob(0.42, x - w / 2 + 0.4 + n * 0.8, y + (n % 2) * 0.12, z, n % 2 ? 0xc2185b : 0xe0408a, 0.7, 0);
};
export const cafeSet = (k: K, x: number, z: number, chair: number, top = 0x6b4a2e) => {
  const { plain, G } = k;
  plain.cyl(0.52, 0.52, 0.06, x, G + 0.76, z, top, 12);
  plain.cyl(0.05, 0.05, 0.72, x, G + 0.04, z, 0x2a2a30, 6);
  for (const side of [-1, 1]) {
    plain.box(0.42, 0.05, 0.42, x + side * 0.82, G + 0.44, z, chair);
    plain.box(0.42, 0.48, 0.05, x + side * 0.82, G + 0.49, z + 0.23, chair);
  }
};
export const umbrella = (k: K, x: number, y: number, z: number, col: number, r = 1.1) => {
  k.plain.cyl(0.03, 0.03, 2.3, x, y, z, 0xcfcfcf, 5);
  k.plain.cyl(0.04, r, 0.38, x, y + 2.0, z, col, 8);
};
export const lampPole = (k: K, x: number, z: number, h = 4.6, bulb = WARM) => {
  k.lampPosts.cyl(0.07, 0.1, h, x, 0, z, 0x2c2f36, 6);
  k.lampPosts.box(0.9, 0.08, 0.08, x, h, z, 0x2c2f36);
  k.lampBulbs.box(0.40, 0.40, 0.40, x - 0.4, h - 0.1, z, bulb); k.lampBulbs.box(0.40, 0.40, 0.40, x + 0.4, h - 0.1, z, bulb);
  k.pool(x, z, 4.6);
  k.solidC(x, z, 0.3, 0.3, h);
};
/** A string of small lamps between two points, hanging a little in the middle. */
export const festoon = (k: K, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, sag: number, cols: number[], step = 0.65) => {
  const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(2, Math.round(len / (k.lite ? step * 1.8 : step)));
  for (let m = 0; m <= n; m++) {
    const t = m / n, y = y0 + (y1 - y0) * t - Math.sin(t * Math.PI) * sag;
    k.lampBulbs.box(0.13, 0.13, 0.13, x0 + (x1 - x0) * t, y, z0 + (z1 - z0) * t, cols[m % cols.length]);
  }
};
export const stripedAwning = (k: K, x: number, w: number, y: number, z: number, out: number, a: number, b: number) => {
  const n = Math.max(3, Math.round(w / 0.7));
  for (let m = 0; m < n; m++) k.plain.slab(w / n + 0.01, 0.07, out, x - w / 2 + (m + 0.5) * (w / n), y, z - out / 2, m % 2 ? a : b, 0, -0.14);
  k.plain.box(w, 0.28, 0.06, x, y - 0.42, z - out + 0.05, a);
  k.canopies.push({ x, z: z - out / 2, r: out * 0.6, y0: y - 0.6, y1: y + 0.2 });
};
export const door = (k: K, x: number, z: number, w = 1.45, h = 2.3, col = 0x30271f) => { k.plain.box(w, h, 0.14, x, k.G - 0.02, z, col); k.pool(x, z - 2.2, 3.4); };

// ---------------------------------------------------------------- venues
/** Lounge 221: a dark volume with a wider upper floor, neon strips, a tall vertical fin sign and a rope at the door. */
export function lounge(k: K, x: number, z: number) {
  const { plain, glass, lampBulbs, G } = k, fz = z - VENUE_D / 2, ink = 0x4a4d5a;
  plain.box(VENUE_W, 3.4, VENUE_D, x, G - 0.02, z, ink);
  plain.box(VENUE_W + 0.9, 3.0, VENUE_D + 0.9, x, G + 3.38, z - 0.5, 0x5b5f70);                           // the upper floor overhangs on every side
  plain.box(VENUE_W + 1.1, 0.2, VENUE_D + 1.1, x, G + 6.35, z - 0.5, 0x3d404c);
  glass.box(9.0, 2.2, 0.08, x, G + 0.35, fz - 0.06, 0x2a5f7a);
  glass.box(9.4, 1.5, 0.08, x, G + 4.0, fz - 1.0, 0x3a7a99);
  for (const gx of [-3.2, 0, 3.2]) lampBulbs.box(2.6, 1.1, 0.04, x + gx, G + 4.2, fz - 0.99, 0x6b2f6e);   // the lounge's windows glow
  for (let n = -4; n <= 4; n++) plain.box(0.14, 1.6, 0.14, x + n * 1.1, G + 3.95, fz - 1.02, 0x15161b);   // louvres in front of the upper glazing
  door(k, x, fz - 0.07, 2.0, 2.4, 0x3a2f20);
  for (const s of [-1, 1]) plain.box(0.08, 1.4, 0.12, x + s * 0.55, G + 1.0, fz - 0.17, 0xd7b26a);          // brass handles
  for (const [y, c] of [[3.45, NEON_PINK], [6.0, NEON_CYAN], [0.2, NEON_PINK]] as const) lampBulbs.box(VENUE_W + 0.6, 0.09, 0.07, x, G + y, fz - (y > 3 ? 0.97 : 0.1), c);
  for (const s of [-1, 1]) lampBulbs.box(0.09, 3.0, 0.07, x + s * (VENUE_W / 2 + 0.45), G + 3.4, fz - 0.97, NEON_PINK);
  // the vertical fin: a tall sign above the roof at the east corner
  plain.box(0.9, 4.6, 0.5, x + 5.5, G + 6.55, fz - 0.55, 0x15161b);
  lampBulbs.box(0.28, 4.2, 0.08, x + 5.5, G + 6.7, fz - 0.84, NEON_PINK);
  k.addSign('LOUNGE 221 · MUSIQUE & CUISINE', '#1e0f2e', '#ff9ad8', x - 0.6, G + 2.95, fz - 0.14, Math.PI, 7.6, 0.62);
  // DJ deck on the roof
  plain.box(5.4, 0.9, 0.2, x - 2.6, G + 6.55, fz - 0.9, 0x15161b);
  for (const s of [-1, 1]) plain.box(0.55, 1.1, 0.5, x - 2.6 + s * 2.4, G + 6.55, z - 1.8, 0x15161b);
  // a velvet rope: two brass stanchions and a red rope, a doorman
  for (const s of [-1, 1]) { plain.cyl(0.04, 0.04, 0.95, x + s * 1.45, G, fz - 1.9, 0xd7b26a, 6); plain.cyl(0.14, 0.14, 0.04, x + s * 1.45, G, fz - 1.9, 0xd7b26a, 8); }
  plain.box(2.9, 0.05, 0.05, x, G + 0.85, fz - 1.9, 0xa8202a);
  k.people.push({ x: x + 2.4, z: fz - 1.5, yaw: Math.PI, clip: 'Idle' });
  planter(k, x - 4.6, fz - 0.7, 1.4, 0.8, 0x23252b);
  planter(k, x + 4.6, fz - 0.7, 1.4, 0.8, 0x23252b);
  for (const [ox, c] of [[-4.2, NEON_PINK], [4.2, NEON_CYAN]] as const) lampBulbs.box(0.9, 0.06, 0.06, x + ox, G + 0.7, fz - 1.1, c);
}

/** Le Comptoir de Ngor: a market hall with a saw-tooth roof, open counters under rolled shutters and a painted band. */
export function comptoir(k: K, x: number, z: number) {
  const { plain, glass, metal, lampBulbs, G } = k, fz = z - VENUE_D / 2, brick = 0xc4693a;
  plain.box(VENUE_W, 3.6, VENUE_D, x, G - 0.02, z, brick);
  plain.box(VENUE_W + 0.2, 0.5, VENUE_D + 0.2, x, G - 0.02, z, k.shade(brick, 0.65));
  for (let n = 0; n < 4; n++) {                                                                       // saw teeth: a slope and a glazed upright
    const tx = x - VENUE_W / 2 + (n + 0.5) * (VENUE_W / 4);
    plain.slab(VENUE_W / 4 + 0.05, 0.14, VENUE_D + 0.3, tx - 0.35, G + 4.0, z, 0x8a8f95, 0, 0, 0.32);
    glass.box(0.06, 1.0, VENUE_D - 0.6, tx + 1.2, G + 3.5, z, 0x8fc4d4);
  }
  for (let n = -1; n <= 1; n++) {                                                                     // three open bays: counter, shutter, a menu on a board
    const bx = x + n * 3.8;
    plain.box(3.0, 2.5, 0.1, bx, G, fz - 0.03, 0x241a14);
    metal.box(3.1, 0.38, 0.3, bx, G + 2.5, fz - 0.14, 0x8a9096);
    plain.box(3.1, 1.0, 0.7, bx, G, fz - 0.5, 0xf0ede5); plain.box(3.3, 0.07, 0.85, bx, G + 1.0, fz - 0.5, 0x2a6fb0);
    for (let s = 0; s < 3; s++) { plain.cyl(0.2, 0.2, 0.06, bx - 1.0 + s, G + 0.55, fz - 1.15, 0x2a2a30, 8); plain.cyl(0.05, 0.05, 0.5, bx - 1.0 + s, G, fz - 1.15, 0x2a2a30, 5); }
    lampBulbs.box(0.28, 0.28, 0.28, bx - 0.8, G + 2.25, fz - 0.55, WARM); lampBulbs.box(0.28, 0.28, 0.28, bx + 0.8, G + 2.25, fz - 0.55, WARM);
  }
  for (const [n, c] of [[0, 0x1a9d54], [1, 0xf4c20d], [2, 0xd9322b]] as const) plain.box(VENUE_W / 3, 0.38, 0.08, x - VENUE_W / 3 + n * (VENUE_W / 3), G + 3.12, fz - 0.05, c);   // the painted band
  k.addSign('LE COMPTOIR DE NGOR · CUISINE', '#4a2514', '#ffe7b3', x, G + 3.9, fz - 0.14, Math.PI, 8.6, 0.7);
  for (let n = 0; n < 4; n++) plain.box(0.5, 0.35, 0.5, x + 5.0 + (n % 2) * 0.3, G + n * 0.35, fz - 1.6, n % 2 ? 0xc99a5a : 0xb5834a);        // stacked crates
  plain.box(0.8, 1.2, 0.06, x - 5.3, G, fz - 2.2, 0x1e2a24); plain.box(0.7, 0.05, 0.9, x - 5.3, G, fz - 2.3, 0x1e2a24);
  festoon(k, x - 5.8, G + 3.0, fz - 2.2, x + 5.8, G + 3.0, fz - 2.2, 0.4, [0xff8a1e, 0x1fbf5f, 0xffd23a]);
  planter(k, x - 5.4, fz - 0.7, 1.0, 0.7, 0xd9ccb5);
}

/** Chez Binta: a beach paillote: thatch on logs over an open grill counter, whitewashed kitchen behind it, blue trim. */
export function binta(k: K, x: number, z: number) {
  const { plain, lampBulbs, G } = k, fz = z - VENUE_D / 2, white = 0xf4efe6, blue = 0x1e6fd9, wood = 0x6b4a2e;
  plain.box(VENUE_W - 1, 3.1, 4.4, x, G - 0.02, fz + 6.8, white);
  plain.box(VENUE_W - 0.6, 0.3, 4.8, x, G + 3.0, fz + 6.8, blue);
  plain.box(VENUE_W - 1, 0.6, 4.4, x, G - 0.02, fz + 6.8, blue);
  plain.box(VENUE_W, 0.14, 4.6, x, G - 0.02, fz + 2.3, 0xcbb694);                                      // sand-coloured deck under the roof
  plain.box(VENUE_W, 0.95, 0.22, x - 0.0, G + 0.1, fz + 0.15, white); plain.box(VENUE_W + 0.1, 0.09, 0.3, x, G + 1.05, fz + 0.15, blue);
  const ridgeZ = fz + 1.4, roofY = G + 3.35;
  plain.slab(VENUE_W + 1.6, 0.2, 3.6, x, roofY, ridgeZ - 1.7, 0xc5a052, 0, -0.36);                           // thatch, front slope
  plain.slab(VENUE_W + 1.6, 0.2, 3.6, x, roofY, ridgeZ + 1.7, 0xb8923f, 0, 0.36);                            // back slope
  plain.box(VENUE_W + 1.7, 0.22, 0.5, x, roofY + 0.5, ridgeZ, 0x9c7a34);
  for (let n = -3; n <= 3; n++) plain.cyl(0.11, 0.13, 2.9, x + n * 1.9, G, fz - 1.1, wood, 6);          // logs
  for (let n = -3; n <= 3; n += 2) plain.box(0.1, 0.1, 0.1, x + n * 1.9, G + 2.75, fz - 1.1, 0x9c7a34);
  plain.box(8.0, 0.95, 0.65, x - 1.0, G + 0.1, fz + 1.6, wood); plain.box(8.2, 0.07, 0.8, x - 1.0, G + 1.05, fz + 1.6, blue);   // the counter
  for (let n = 0; n < 5; n++) { plain.cyl(0.19, 0.19, 0.05, x - 4.0 + n * 1.5, G + 0.5, fz - 0.4, 0x8c3b2a, 8); plain.cyl(0.04, 0.04, 0.5, x - 4.0 + n * 1.5, G, fz - 0.4, 0x2a2a30, 5); }
  plain.cyl(0.38, 0.34, 0.8, x + 5.0, G, fz - 0.8, 0x2a2a2e, 10);                                      // the grill drum
  lampBulbs.box(0.55, 0.04, 0.55, x + 5.0, G + 0.82, fz - 0.8, 0xff7a2a);
  plain.box(0.5, 0.05, 0.5, x + 5.0, G + 0.95, fz - 0.8, 0x777a7e);
  for (let n = 0; n < 4; n++) k.leaves.blob(0.34 + n * 0.08, x + 5.1 + n * 0.12, G + 1.5 + n * 0.55, fz - 0.8 + n * 0.05, 0xb9b6b0, 0.8, 0);  // smoke
  for (let n = -2; n <= 2; n++) lampBulbs.box(0.26, 0.26, 0.26, x + n * 2.3, G + 2.55, fz - 1.0, n % 2 ? WARM : 0xffc46b);
  k.addSign('CHEZ BINTA · GRILLADES', '#1e5fb5', '#fff2d3', x, G + 2.15, fz - 1.17, Math.PI, 5.2, 0.72);
  plain.box(2.2, 0.9, 0.8, x - 5.2, G, fz + 5.0, 0x4d9fd4);                                            // a fish-seller's blue chest
  plain.box(0.5, 0.9, 0.5, x + 5.0, G, fz + 4.4, 0xd9482b);                                            // gas cylinder
}

/** Café du Phare: a lighthouse-like red-and-white tower and a glazed café under striped awnings, a rooftop deck. */
export function phare(k: K, x: number, z: number) {
  const { plain, glass, lampBulbs, G } = k, fz = z - VENUE_D / 2, white = 0xf5f1ea, red = 0xd93a2f, tx = x - 3.6, tz = z - 0.8;
  plain.box(8.1, 4.5, VENUE_D, x + 2.05, G - 0.02, z, white);
  plain.box(8.3, 0.3, VENUE_D + 0.2, x + 2.05, G + 4.4, z, 0x23527f);
  glass.box(6.6, 2.5, 0.1, x + 2.4, G + 0.3, fz - 0.07, 0x4a89a6);
  for (const m of [-1.65, 0, 1.65]) plain.box(0.1, 2.6, 0.14, x + 2.4 + m * 1, G + 0.25, fz - 0.1, 0xf5f1ea);
  door(k, x + 2.4, fz - 0.06, 1.4, 2.3, 0x23527f);
  stripedAwning(k, x + 2.4, 7.4, G + 3.0, fz - 0.1, 1.9, 0x1e6fd9, 0xf5f1ea);
  k.addSign('CAFÉ DU PHARE · JUS & CAFÉ', '#173b63', '#fff2d3', x + 2.4, G + 3.75, fz - 0.12, Math.PI, 6.4, 0.7);
  plain.cyl(2.2, 2.4, 0.6, tx, G - 0.02, tz, 0xd8d2c6, 14);
  for (let n = 0; n < 5; n++) plain.cyl(1.9 - n * 0.1, 2.0 - n * 0.1, 1.85, tx, G + 0.5 + n * 1.85, tz, n % 2 ? red : white, 14);
  plain.cyl(2.55, 2.55, 0.2, tx, G + 9.75, tz, 0x23527f, 14);                                           // the gallery
  for (let a = 0; a < 12; a++) plain.box(0.06, 0.8, 0.06, tx + Math.cos(a / 12 * 6.283) * 2.45, G + 9.95, tz + Math.sin(a / 12 * 6.283) * 2.45, 0x23527f);
  glass.cyl(1.0, 1.0, 1.3, tx, G + 9.95, tz, 0x9fd3e0, 10);
  lampBulbs.sphere(0.62, tx, G + 10.6, tz, 0xfff2a0);
  plain.cyl(0.05, 1.35, 0.9, tx, G + 11.2, tz, red, 10);
  k.pool(tx, tz, 3.0, 0.18);
  for (const [a, b] of [[x - 0.7, x + 1.5], [x + 3.3, x + 5.9]]) {                                       // a low rail round the pavement terrace, open at the door
    for (let px = a; px <= b + 0.01; px += (b - a) / 2) plain.box(0.07, 0.95, 0.07, px, G, fz - 2.2, 0xf5f1ea);
    plain.box(b - a, 0.07, 0.07, (a + b) / 2, G + 0.95, fz - 2.2, 0xf5f1ea);
  }
  plain.box(8.3, 0.5, VENUE_D + 0.2, x + 2.05, G + 4.7, z, 0xf5f1ea);                                    // roof parapet
  umbrella(k, x + 1.0, G + 5.0, z - 1.0, 0x1e6fd9, 1.0); umbrella(k, x + 4.0, G + 5.0, z + 0.4, 0xf5f1ea, 1.0);
  festoon(k, x - 1.4, G + 2.9, fz - 2.2, x + 5.8, G + 2.9, fz - 2.2, 0.35, [WARM, 0xcfe8ff]);
  planter(k, x - 0.1, fz - 0.7, 1.2, 0.7, 0xe0dacd);
}

/** The back of a venue, on the car park: a service door with a lamp over it, an air-conditioner, a pipe run and a bin on wheels (the cars see these, not the front). */
export function rear(k: K, x: number, z: number, n: number) {
  const { plain, lampBulbs, metal, G } = k, bz = z + VENUE_D / 2;
  plain.box(1.2, 2.1, 0.12, x + 3.2 - (n % 2) * 6.4, G - 0.02, bz + 0.05, 0x3a4048);
  lampBulbs.box(0.3, 0.14, 0.14, x + 3.2 - (n % 2) * 6.4, G + 2.35, bz + 0.18, WARM);
  plain.box(0.9, 0.55, 0.35, x - 1.2, G + 2.3, bz + 0.2, 0xe8e6e0);
  plain.box(0.14, 3.2, 0.14, x + 1.4, G, bz + 0.12, 0x9a9da3);
  if (!k.lite) metal.box(1.1, 1.0, 0.7, x - 3.0 + (n % 2) * 1.5, G, bz + 1.0, [0x2f6f4a, 0x3a5a8c, 0x2f6f4a][n % 3]);       // a bin on wheels
  k.solidC(x - 3.0 + (n % 2) * 1.5, bz + 1.0, 1.1, 0.7, 1.0);
}

// ---------------------------------------------------------------- cars and car parks
export const CAR_COLOURS = [0xd8d8d4, 0x1f2430, 0x7d8087, 0x8e2a2a, 0x2e4f7a, 0xe9e5da, 0x3a3d42, 0xb8b9bd];
export function parkedCar(k: K, x: number, z: number, nose: 1 | -1, col: number, tall = false) {
  const { plain, glass, G } = k, y = G + 0.04;
  plain.box(1.78, 0.62, 4.2, x, y + 0.26, z, col);
  const cl = tall ? 3.0 : 2.1, cz = z - nose * 0.2, ch = tall ? 0.78 : 0.6;
  plain.box(1.62, ch, cl, x, y + 0.86, cz, k.shade(col, 0.92));
  glass.box(1.66, ch - 0.18, cl + 0.05, x, y + 0.98, cz, 0x27323b);
  plain.box(1.7, 0.06, cl + 0.05, x, y + 0.86 + ch, cz, k.shade(col, 0.8));
  for (const sx of [-1, 1]) for (const sz of [-1.35, 1.35]) plain.box(0.22, 0.6, 0.6, x + sx * 0.84, y, z + sz, 0x16171a);
  if (!k.lite) for (const sx of [-1, 1]) { k.lampBulbs.box(0.3, 0.08, 0.04, x + sx * 0.6, y + 0.55, z + nose * 2.12, 0xfff4d0); k.lampBulbs.box(0.3, 0.08, 0.04, x + sx * 0.6, y + 0.55, z - nose * 2.12, 0xc82b2b); }
  k.solidC(x, z, 1.9, 4.3, tall ? 1.7 : 1.5);
}

// ---------------------------------------------------------------- street identity and the alley
/** The way from the coast road to La Vague's gate, lit like a night street: a dark boardwalk with light lines, neon arches, a rope queue, a container bar, a mural wall and festoons. */
export function clubAlley(k: K) {
  const { plain, lampBulbs, metal, G } = k, cx = -36, z0 = -128.6, z1 = -134.9, top = G + 0.05;
  plain.box(9.2, 0.05, z0 - z1, cx, G, (z0 + z1) / 2, 0x7a5638);                                          // boardwalk
  for (let n = 0; n < 8; n++) plain.box(9.2, 0.012, 0.06, cx, top, z0 - 0.5 - n * 0.8, 0x3a2818);        // plank joints
  for (const s of [-1, 1]) lampBulbs.box(0.07, 0.03, z0 - z1 - 0.4, cx + s * 4.2, top, (z0 + z1) / 2, s > 0 ? NEON_PINK : NEON_CYAN);
  for (let n = 0; n < 5; n++) lampBulbs.box(0.1, 0.03, 0.6, cx, top, z0 - 0.9 - n * 1.15, n % 2 ? NEON_AMBER : 0xfff0c0);   // dashes lead to the gate
  // two neon arches
  for (const z of [-130.2, -132.4]) {
    for (const s of [-1, 1]) plain.box(0.14, 4.0, 0.14, cx + s * 4.4, G, z, 0x15161b);
    plain.box(9.0, 0.14, 0.14, cx, G + 4.0, z, 0x15161b);
    lampBulbs.box(8.8, 0.07, 0.07, cx, G + 3.9, z, z < -131 ? NEON_PINK : NEON_CYAN);
    for (const s of [-1, 1]) lampBulbs.box(0.07, 3.8, 0.07, cx + s * 4.3, G + 0.1, z, z < -131 ? NEON_PINK : NEON_CYAN);
  }
  // rope queue: brass stanchions and a red rope leaving a 2.6 m way to the door (its anchor at z -133.4 stays clear)
  for (const s of [-1, 1]) for (const z of [-129.4, -131.2]) { plain.cyl(0.04, 0.04, 0.95, cx + s * 1.5, G, z, 0xd7b26a, 6); plain.cyl(0.14, 0.14, 0.04, cx + s * 1.5, G, z, 0xd7b26a, 8); }
  for (const s of [-1, 1]) plain.box(0.05, 0.05, 1.8, cx + s * 1.5, G + 0.85, -130.3, 0xa8202a);
  // the queue to the gate stands along the fence west of it and its walkers come from the west (src/crowd/clubPlan.ts): the west edge only gets a low mural wall, clear of their way
  const wx = -40.8;
  plain.box(0.3, 2.5, 3.9, wx, G, -130.65, 0x20232a);
  const R = rng(k.seed * 7 + 5), pal = [0xff3fb0, 0x38e8ff, 0xffd23a, 0x1fbf5f, 0xff6a2a, 0x6a4dff];
  for (let n = 0; n < 6; n++) plain.box(0.06, 0.5 + R() * 1.0, 0.5 + R() * 1.1, wx + 0.17, G + 0.2 + R() * 1.4, -128.9 - n * 0.62, pal[n % pal.length]);
  k.solidC(wx, -130.65, 0.4, 4.0, 2.6);
  // container bar on the east edge: a painted shipping container with a serving hatch toward the alley and stools
  const kx = -29.4, hx = kx - 1.22;
  metal.box(2.4, 2.5, 5.0, kx, G, -131.0, 0x1f4f8f);
  for (let n = 0; n < 5; n++) plain.box(0.04, 2.4, 0.05, hx, G + 0.05, -128.8 - n * 1.0, 0x173c6e);
  plain.box(0.1, 1.0, 3.0, hx - 0.01, G + 1.0, -131.0, 0x0e1014); plain.box(0.6, 0.08, 3.4, hx - 0.3, G + 1.0, -131.0, 0xd9a45a);
  lampBulbs.box(0.06, 0.08, 3.0, hx - 0.03, G + 2.1, -131.0, NEON_AMBER);
  for (let n = 0; n < 3; n++) { plain.cyl(0.2, 0.2, 0.06, hx - 0.9, G + 0.64, -129.9 - n * 1.2, 0x23252b, 8); plain.cyl(0.04, 0.04, 0.62, hx - 0.9, G, -129.9 - n * 1.2, 0x23252b, 5); }
  k.addSign('LA VAGUE · BAR', '#10243a', '#7be8ff', hx - 0.06, G + 2.9, -131.0, -Math.PI / 2, 3.2, 0.5);
  k.solidC(kx, -131.0, 2.5, 5.1, 2.6);
  // festoons across the alley, the container's roof to the mural wall
  festoon(k, hx, G + 3.3, -129.4, wx, G + 3.3, -129.4, 0.5, [NEON_PINK, NEON_CYAN, NEON_AMBER], 0.55);
  festoon(k, hx, G + 3.0, -132.6, wx, G + 3.0, -132.6, 0.5, [NEON_CYAN, NEON_AMBER, NEON_PINK], 0.55);
  k.addSign('ALLÉE LA VAGUE · SOIRÉES', '#1a0f2e', '#ff9ad8', cx, G + 4.9, -128.9, 0, 6.8, 0.7);
  for (const s of [-1, 1]) plain.box(0.12, 5.3, 0.12, cx + s * 3.5, G, -128.9, 0x15161b);
  for (const px of [-50.5, -24.8]) lampPole(k, px, -128.2, 4.8, NEON_AMBER);
  planter(k, -26.8, -127.9, 1.6, 0.8, 0x23252b);
}

