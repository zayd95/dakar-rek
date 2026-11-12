import type { Seat } from '../interact/seats';
import { floorSeatTop } from '../interact/seats';
import { rng } from '../core/rng';
import type { KeepClear } from './types';
import { NEON_AMBER, WARM, cafeSet, festoon, lampPole, palm, planter, umbrella, type StripKit } from './hospitalityStrip';

/**
 * La plage de Ngor (the owner, 27 Oct: « change the embarcadère to a beach side first, then you get the embarkation area; the beach of Ngor is famous in Dakar »).
 * Walking east along the Almadies' coast from La Vague you come to the beach first: a modern boardwalk along the sand, the gate « PLAGE DE NGOR », two rows of
 * sun beds under parasols, four stalls (sunglasses and hats, coconut and juices, grilled corn, wax print and necklaces), a beach bar-lounge; the boardwalk
 * carries on east over the pier's foot to the embarkation: a ticket hut and a waiting shelter, the plank path down to the boarding beach, and, beside the pier, a
 * lookout deck with a telescope on the island. The pier, the pirogues, the boarding beach and the island are the traversée's (docs/TRAVERSEE.md): nothing here
 * stands in their zones.
 *
 * Hub-local metres, Almadies (north is −z: the sea). Merged primitives and colliders only, and no draw from the generator's random stream (a local one).
 * The people, the offers and the camera: src/venues/ngorBeach.ts, which uses the poses and anchors below.
 */
export const NGOR_BEACH_HUB = 'almadies' as const;
const PAD = 0.42;                                                          // the top of a sun bed's mattress
const BED_ROWS = [-139.2, -145.5];
const BED_X = [-21, -17.4, -13.8, -3, 0.6, 4.2];
export const NGOR_BEACH = {
  gate: { x: -8, z: -129.6 },
  promenade: { x0: -22, x1: 47, z: -130.4, w: 2.2 },
  /** The sun beds: head to the land (south), feet to the sea. */
  beds: BED_ROWS.flatMap((z, r) => BED_X.map((x, c) => ({ id: `almadies:ngor:bed:${r * BED_X.length + c}`, x, z, yaw: Math.PI }))),
  bedTop: floorSeatTop(PAD),
  /** A stall's centre (3.2 × 2.2 m, the counter on its south face) and where the customer stands. */
  stalls: {
    souvenirs: { x: -18.5, z: -134.2, at: { x: -18.5, z: -132.3 } },
    jus: { x: -13, z: -134.2, at: { x: -13, z: -132.3 } },
    grill: { x: -3, z: -134.2, at: { x: -3, z: -132.3 } },
    tissus: { x: 2.5, z: -134.2, at: { x: 2.5, z: -132.3 } },
  },
  /** The beach bar-lounge: a deck 11 × 6.4 m, the counter along its north side, the stools on its south face, facing the sea. */
  bar: { x: -8.5, z: -150.5, w: 11, d: 6.4, at: { x: -8.5, z: -150.2 }, stools: [-12, -10.6, -9.2, -7.8, -6.4, -5].map(x => ({ x, z: -151.1 })) },
  /** The embarkation: the ticket hut (3.6 × 2.6 m, its window south), the waiting shelter (west of x 47: the open corridor from the road to the boarding beach, x 47…62, stays free of solids: tests/boats.test.ts), the plank path in that corridor. */
  hut: { x: 38.2, z: -134.6, at: { x: 38.2, z: -132.2 } },
  shelter: { x: 43.6, z: -134, w: 5.2, d: 3.6, seats: [{ x: 42.2, z: -135.2 }, { x: 43.4, z: -135.2 }, { x: 44.6, z: -135.2 }, { x: 45.8, z: -135.2 }] },
  path: { x: 49.5, z0: -131.2, z1: -148 },
  sign: { x: 24, z: -133.2 },
  /** The lookout deck by the pier (4.2 × 4.4 m): the telescope on the island, two benches facing the sea. */
  lookout: { x: 24.4, z: -151.6, scope: { x: 24.4, z: -153.2 }, at: { x: 24.4, z: -152.3 }, benches: [{ x: 22.9, z: -150.3 }, { x: 25.9, z: -150.3 }] },
  /** The island the telescope looks at (docs/TRAVERSEE.md TRAVERSEE_SITE.island.centre). */
  island: { x: 40, z: -335 },
};
/** Seats of the beach, for the world's seat registry and the venue's people. */
export function ngorBeachSeats(): Seat[] {
  const out: Seat[] = NGOR_BEACH.beds.map(b => ({ id: b.id, x: b.x, z: b.z, top: NGOR_BEACH.bedTop, yaw: b.yaw, kind: 'bed', space: 'street', occupant: null, clip: 'Lie', label: 'Transat' }));
  NGOR_BEACH.bar.stools.forEach((s, n) => out.push({ id: `almadies:ngor:stool:${n}`, x: s.x, z: s.z, top: 0.7, yaw: Math.PI, kind: 'stool', space: 'street', occupant: null }));
  NGOR_BEACH.shelter.seats.forEach((s, n) => out.push({ id: `almadies:ngor:wait:${n}`, x: s.x, z: s.z, top: 0.52, yaw: 0, kind: 'bench', space: 'street', occupant: null, label: 'Banc d’attente' }));
  NGOR_BEACH.lookout.benches.forEach((s, n) => out.push({ id: `almadies:ngor:look:${n}`, x: s.x, z: s.z, top: 0.52, yaw: Math.PI, kind: 'bench', space: 'street', occupant: null, label: 'Banc face à l’île' }));
  return out;
}
/** Ground the street dressing and the parked traffic keep off. */
export const NGOR_BEACH_KEEP_CLEAR: KeepClear[] = [
  { x0: -24, z0: -157, x1: 8, z1: -128, why: 'ngor_beach' },
  { x0: -22, z0: -131.6, x1: 52, z1: -129.2, why: 'ngor_promenade' },
  { x0: 34, z0: -138, x1: 47, z1: -128, why: 'ngor_embarkation' },
  { x0: 21, z0: -155, x1: 27, z1: -148, why: 'ngor_lookout' },
];

const WOOD = 0x8a5c36, WOOD_D = 0x5d3d24, SAND_WOOD = 0x7d5533, CONCRETE = 0x9a9ca0, WHITE = 0xf4efe6, INK = 0x23262b;
const PARASOLS = [0xe8742c, 0xe0408a, 0xd9322b, 0x1f6fd0, 0xf2c230, 0x1fa07a];

/** A sun bed: timber frame on legs, a mattress, a rolled towel, and its parasol. */
function bed(k: StripKit, x: number, z: number, n: number) {
  const { plain } = k;
  plain.box(0.86, 0.1, 2.0, x, PAD - 0.2, z, WOOD);
  plain.box(0.8, 0.1, 1.94, x, PAD - 0.1, z, n % 2 ? 0xf4efe6 : 0xdbe9f2);                      // mattress
  plain.box(0.78, 0.04, 0.62, x, PAD, z + 0.62, PARASOLS[n % PARASOLS.length]);                  // a towel over the head end
  for (const sx of [-0.38, 0.38]) for (const sz of [-0.9, 0.9]) plain.box(0.06, PAD - 0.2, 0.06, x + sx, 0, z + sz, WOOD_D);
  if (n % 2 === 0) umbrella(k, x + 1.75, 0, z + 0.2, PARASOLS[(n >> 1) % PARASOLS.length], 1.55);
  k.solidC(x, z, 0.9, 2.0, 0.45);
}

/** A stall: back wall, posts, a striped canopy over a counter, its goods by kind, a sign, the stallholder behind it (venue). */
function stall(k: StripKit, kind: 'souvenirs' | 'jus' | 'grill' | 'tissus', x: number, z: number, accent: number, sign: string, bg: string) {
  const { plain, lampBulbs, leaves } = k, front = z + 1.1;
  plain.box(3.2, 0.9, 0.5, x, 0, front - 0.25, 0xe9e1cf);                                         // the counter (a front panel and a top)
  plain.box(3.4, 0.07, 0.8, x, 0.9, front - 0.3, WOOD);
  plain.box(3.2, 2.4, 0.12, x, 0, z - 1.0, SAND_WOOD);                                              // back wall
  for (const sx of [-1.6, 1.6]) { plain.box(0.12, 2.5, 0.12, x + sx, 0, front - 0.05, WOOD_D); plain.box(0.1, 2.4, 0.1, x + sx, 0, front + 0.85, WOOD_D); }
  for (let m = 0; m < 6; m++) plain.slab(3.6 / 6 + 0.01, 0.06, 3.0, x - 1.5 + m * 0.6, 2.62, z + 0.5, m % 2 ? accent : 0xf6f1e6, 0, 0.1);   // the striped canopy
  plain.box(3.6, 0.3, 0.05, x, 2.2, front + 0.95, accent);
  k.canopies.push({ x, z: front - 0.1, r: 1.7, y0: 2.0, y1: 2.8 });
  if (kind === 'souvenirs') {
    for (let n = 0; n < 5; n++) { plain.cyl(0.34, 0.34, 0.04, x - 1.2 + n * 0.6, 1.5 + (n % 2) * 0.35, z - 0.86, n % 2 ? 0xd9b45a : 0xe9cf86, 10, [Math.PI / 2, 0, 0]); plain.blob(0.16, x - 1.2 + n * 0.6, 1.55 + (n % 2) * 0.35, z - 0.78, 0xc79a42, 0.7, 0); }   // straw hats on the wall
    for (let n = 0; n < 6; n++) plain.box(0.2, 0.05, 0.06, x - 1.0 + n * 0.4, 1.12, front - 0.35, 0x15161b);                                                                              // sunglasses on the counter
    plain.box(0.9, 0.5, 0.4, x + 1.0, 0.97, front - 0.55, 0xd9482b);
  } else if (kind === 'jus') {
    for (let n = 0; n < 7; n++) leaves.blob(0.2, x - 1.1 + (n % 4) * 0.34 + (n > 3 ? 0.17 : 0), 1.05 + (n > 3 ? 0.3 : 0), front - 0.3, n % 2 ? 0x6b8a3a : 0x4f7a32, 0.9, 0);   // coconuts
    for (let n = 0; n < 4; n++) plain.box(0.1, 0.3, 0.1, x + 0.55 + n * 0.2, 0.97, front - 0.4, [0xb2182b, 0x6b2a8a, 0xe08a1a, 0xf2e6b8][n]);                                                // bottles
    plain.box(0.8, 0.55, 0.5, x + 1.15, 0, z - 0.3, 0x2a6fb0);                                                                                                                              // the cooler
  } else if (kind === 'grill') {
    plain.cyl(0.36, 0.3, 0.8, x - 0.9, 0, front - 0.45, 0x2a2a2e, 10); lampBulbs.box(0.5, 0.04, 0.5, x - 0.9, 0.82, front - 0.45, 0xff7a2a);
    for (let n = 0; n < 5; n++) plain.cyl(0.05, 0.05, 0.3, x - 1.1 + n * 0.1, 0.9, front - 0.45 + (n % 2) * 0.1, 0xf2c230, 5, [Math.PI / 2, 0, 0]);                                              // corn on the grill
    for (let n = 0; n < 3; n++) leaves.blob(0.3 + n * 0.08, x - 0.8 + n * 0.1, 1.5 + n * 0.5, front - 0.45, 0xb9b6b0, 0.8, 0);                                                              // smoke
    plain.box(1.0, 0.3, 0.5, x + 0.8, 0.97, front - 0.4, 0xefe1b6);
  } else {
    for (let n = 0; n < 6; n++) plain.box(0.34, 1.3, 0.04, x - 1.2 + n * 0.46, 0.95, z - 0.9, [0xd9322b, 0x1a9d54, 0xf2c230, 0x1f6fd0, 0xe0408a, 0xe8742c][n]);                                  // wax print cloth on the wall
    for (let n = 0; n < 4; n++) plain.cyl(0.18, 0.18, 0.04, x - 0.6 + n * 0.45, 1.0, front - 0.4, [0xf2c230, 0x1a9d54, 0xd9322b, 0x1f6fd0][n], 8);                                              // necklaces and bracelets
  }
  k.addSign(sign, bg, '#fff2d3', x, 2.2, front + 0.98, 0, 3.0, 0.45);
  k.solidC(x, z, 3.4, 2.4, 2.6);
}

/** The beach bar-lounge: a timber deck, a concrete-and-timber counter, a flat roof on steel posts with a slat pergola, glass wind screens, stools, a lounge, light. */
function beachBar(k: StripKit) {
  const { plain, glass, lampBulbs } = k, B = NGOR_BEACH.bar, x = B.x, z = B.z, hw = B.w / 2, hd = B.d / 2;
  plain.box(B.w, 0.12, B.d, x, 0, z, SAND_WOOD);
  for (let n = 0; n <= 10; n++) plain.box(0.04, 0.012, B.d, x - hw + 0.5 + n, 0.12, z, 0x9a7248);
  plain.box(7.4, 1.1, 0.9, x, 0.12, z - hd + 0.7, CONCRETE);                                        // the counter: concrete with a timber top
  plain.box(7.6, 0.08, 1.1, x, 1.22, z - hd + 0.7, WOOD);
  plain.box(7.4, 1.0, 0.1, x, 1.3, z - hd + 0.15, INK);                                              // the back bar
  for (let n = 0; n < 8; n++) plain.box(0.1, 0.34, 0.1, x - 3.2 + n * 0.9, 1.45 + (n % 2) * 0.01, z - hd + 0.2, [0x1a9d54, 0xe8742c, 0xffffff, 0xd9322b][n % 4]);
  lampBulbs.box(7.2, 0.05, 0.05, x, 2.3, z - hd + 0.17, 0xfff0c0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) plain.box(0.16, 3.2, 0.16, x + sx * (hw - 0.2), 0.12, z + sz * (hd - 0.2), INK);   // four steel posts
  plain.box(B.w + 1.0, 0.18, B.d + 1.0, x, 3.2, z, WHITE);                                           // the flat roof, its edge dark
  plain.box(B.w + 1.1, 0.05, B.d + 1.1, x, 3.18, z, INK);
  for (let n = 0; n < 12; n++) plain.box(0.08, 0.14, B.d + 1.0, x - hw + 0.4 + n * 0.95, 3.38, z, WOOD);                                // timber fins on the roof
  for (const s of [-1, 1]) glass.box(0.05, 1.3, B.d - 1.2, x + s * (hw - 0.1), 0.2, z, 0xaed8e6);   // wind screens at the ends
  for (let n = 0; n < 7; n++) lampBulbs.box(0.14, 0.14, 0.14, x - hw + 0.6 + n * 1.65, 3.0, z + hd - 0.3, n % 2 ? WARM : NEON_AMBER);
  for (const s of NGOR_BEACH.bar.stools) { plain.cyl(0.2, 0.2, 0.06, s.x, 0.68, s.z, 0x1f2430, 8); plain.cyl(0.04, 0.04, 0.62, s.x, 0.12, s.z, 0x9a9da3, 5); }
  for (const dx of [-2.2, 2.2]) cafeSet(k, x + dx, z + 1.3, 0x1f9ab8, 0x6b4a2e);
  for (const sx of [-1, 1]) {                                                                         // a low timber lounge bench each side
    plain.box(2.4, 0.28, 0.7, x + sx * 3.9, 0.12, z + 1.8, WOOD); plain.box(2.3, 0.14, 0.62, x + sx * 3.9, 0.4, z + 1.8, 0xe9e1cf);
  }
  k.addSign('NGOR BEACH LOUNGE', '#0f3340', '#c8f6ff', x, 3.65, z + hd + 0.5, 0, 6.4, 0.7);
  for (const px of [-1, 1]) plain.box(0.1, 0.5, 0.1, x + px * 2.6, 3.38, z + hd + 0.5, INK);
  for (let n = 0; n < 5; n++) plain.box(0.14, 1.9, 0.5, x + 5.9 + (n % 2) * 0.05, 0.06, z - hd + 0.3 + n * 0.25 - 0.0, [0xf2c230, 0x1f6fd0, 0xd9322b, 0xf4efe6, 0x1fa07a][n]);   // surfboards on the end wall's rack (Ngor's wave)
  k.solidC(x, z - hd + 0.7, 7.6, 1.2, 1.3);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.solidC(x + sx * (hw - 0.2), z + sz * (hd - 0.2), 0.3, 0.3, 3.2);
}

/** The boardwalk: a modern deck along the sand with low light posts, the gate at the road, the directional sign near the pier. */
function promenade(k: StripKit) {
  const { plain, lampBulbs } = k, P = NGOR_BEACH.promenade, len = P.x1 - P.x0, cx = (P.x0 + P.x1) / 2;
  plain.box(len, 0.12, P.w, cx, 0, P.z, SAND_WOOD);
  for (let x = P.x0 + 1; x < P.x1; x += 1.1) plain.box(0.03, 0.012, P.w, x, 0.12, P.z, 0x9a7248);
  for (const s of [-1, 1]) plain.box(len, 0.1, 0.08, cx, 0.02, P.z + s * (P.w / 2 + 0.04), INK);
  for (let x = P.x0 + 2; x < P.x1; x += 5) {
    if (x > 25 && x < 35) continue;                                                                   // the pier's deck
    plain.box(0.1, 0.8, 0.1, x, 0, P.z - P.w / 2 - 0.2, INK); lampBulbs.box(0.22, 0.12, 0.22, x, 0.8, P.z - P.w / 2 - 0.2, WARM);
    if ((x / 5) % 2 === 0) k.pool(x, P.z - P.w / 2 - 0.2, 2.8);
  }
  // the spine to the beach and the gate over it (facing the road)
  const g = NGOR_BEACH.gate;
  plain.box(3.0, 0.12, 8.6, g.x, 0, g.z - 4.5, SAND_WOOD);
  for (const s of [-1, 1]) { plain.box(0.3, 4.4, 0.3, g.x + s * 2.2, 0, g.z, WOOD_D); plain.box(0.1, 4.0, 0.1, g.x + s * 1.9, 0, g.z, INK); }
  plain.box(5.4, 0.7, 0.3, g.x, 4.1, g.z, WOOD_D);
  for (let n = -4; n <= 4; n++) plain.box(0.06, 0.55, 0.06, g.x + n * 0.52, 3.2, g.z - 0.1, WOOD);
  lampBulbs.box(4.9, 0.06, 0.06, g.x, 3.95, g.z + 0.18, 0xfff0c0);
  k.addSign('PLAGE DE NGOR', '#0d5869', '#fbeccb', g.x, 4.45, g.z + 0.2, 0, 4.8, 0.8);
  k.addSign('PLAGE · TRANSATS · BAR  ·  EMBARCADÈRE → ÎLE DE NGOR', '#11424f', '#fbeccb', NGOR_BEACH.sign.x, 2.2, NGOR_BEACH.sign.z, -Math.PI / 2, 3.4, 0.9);
  for (const s of [-1, 1]) plain.box(0.12, 2.8, 0.12, NGOR_BEACH.sign.x, 0, NGOR_BEACH.sign.z + s * 1.55, INK);
}

/** The embarkation: ticket hut, waiting shelter, life jackets on a rack, the plank path down to the boarding beach, bollards and rope. */
function embarkation(k: StripKit) {
  const { plain, glass, tin, lampBulbs } = k, H = NGOR_BEACH.hut, S = NGOR_BEACH.shelter, P = NGOR_BEACH.path;
  plain.box(3.6, 2.5, 2.6, H.x, 0, H.z, 0x1d6f8a);                                                  // the hut, in a pirogue's blue, a red-and-white trim
  plain.box(3.8, 0.15, 2.8, H.x, 2.5, H.z, 0xf4efe6);
  for (let n = 0; n < 6; n++) plain.box(0.3, 0.22, 0.04, H.x - 1.5 + n * 0.6, 2.1, H.z + 1.32, n % 2 ? 0xd9322b : 0xf4efe6);
  glass.box(1.6, 0.9, 0.05, H.x - 0.4, 1.1, H.z + 1.31, 0xaed8e6);
  plain.box(1.9, 0.1, 0.5, H.x - 0.4, 1.0, H.z + 1.55, WOOD);                                        // the ticket counter shelf
  plain.box(0.9, 1.9, 0.06, H.x + 1.0, 0, H.z + 1.31, 0x2a3a44);
  k.addSign('BILLETS · PIROGUE & CHALOUPE · ÎLE DE NGOR', '#0d5869', '#fff2d3', H.x, 2.9, H.z + 1.33, 0, 3.4, 0.55);
  k.solidC(H.x, H.z, 3.8, 2.8, 2.7);
  plain.box(0.1, 1.5, 1.6, H.x + 2.35, 0, H.z + 0.3, WOOD_D);                                         // the rack beside it, with the orange life jackets
  for (let n = 0; n < 6; n++) plain.box(0.12, 0.7, 0.2, H.x + 2.25, 0.6, H.z - 0.4 + n * 0.25, 0xf08a1c);
  // the waiting shelter: a tin roof on posts, benches along the back
  plain.box(S.w, 0.14, S.d, S.x, 2.7, S.z, 0xb9bdc2);
  tin.box(S.w + 0.2, 0.05, S.d + 0.2, S.x, 2.84, S.z, 0x9aa0a6);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) plain.box(0.14, 2.7, 0.14, S.x + sx * (S.w / 2 - 0.15), 0, S.z + sz * (S.d / 2 - 0.15), WOOD_D);
  plain.box(S.w - 0.4, 0.12, 0.5, S.x, 0.42, S.z - 1.2, WOOD); plain.box(S.w - 0.4, 0.5, 0.08, S.x, 0.5, S.z - 1.5, WOOD);
  plain.box(S.w, 0.12, S.d, S.x, 0, S.z, SAND_WOOD);
  lampBulbs.box(S.w - 1, 0.06, 0.06, S.x, 2.6, S.z + 1.0, WARM);
  k.solidC(S.x, S.z - 1.2, S.w - 0.4, 0.6, 1.0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.solidC(S.x + sx * (S.w / 2 - 0.15), S.z + sz * (S.d / 2 - 0.15), 0.2, 0.2, 2.7);
  // the plank path down to the boarding beach, with a rope on bollards either side
  const len = Math.abs(P.z1 - P.z0), cz = (P.z0 + P.z1) / 2;
  plain.box(1.9, 0.12, len, P.x, 0, cz, SAND_WOOD);
  for (let z = P.z0 - 0.5; z > P.z1; z -= 1.0) plain.box(1.9, 0.012, 0.05, P.x, 0.12, z, 0x9a7248);
  for (const s of [-1, 1]) {
    for (let z = P.z0 - 1; z > P.z1; z -= 4) plain.cyl(0.07, 0.07, 0.55, P.x + s * 1.15, 0, z, 0xe9e1cf, 6);
    plain.box(0.03, 0.03, len - 1, P.x + s * 1.15, 0.5, cz, 0xe9e1cf);
  }
}

/** The lookout deck by the pier: planks, rails, a telescope on a brass post, two benches facing the sea and the island. */
function lookout(k: StripKit) {
  const { plain } = k, L = NGOR_BEACH.lookout;
  plain.box(4.2, 0.14, 4.4, L.x, 0, L.z, SAND_WOOD);
  for (let z = L.z - 2; z < L.z + 2.1; z += 0.8) plain.box(4.2, 0.012, 0.04, L.x, 0.14, z, 0x9a7248);
  for (const s of [-1, 1]) plain.box(0.12, 1.1, 0.12, L.x + s * 2.0, 0.1, L.z - 2.1, WOOD_D);
  plain.box(4.2, 0.07, 0.07, L.x, 1.15, L.z - 2.1, WOOD_D);
  plain.cyl(0.07, 0.09, 1.2, L.scope.x, 0.1, L.scope.z, 0x8a6a2a, 6);
  plain.cyl(0.07, 0.1, 0.55, L.scope.x, 1.2, L.scope.z - 0.15, 0x2a2e36, 8, [-0.35, 0, 0]);          // the telescope, tilted to the island
  for (const b of L.benches) { plain.box(1.4, 0.1, 0.5, b.x, 0.42, b.z, WOOD); plain.box(1.4, 0.45, 0.07, b.x, 0.5, b.z + 0.28, WOOD); for (const sx of [-0.6, 0.6]) plain.box(0.08, 0.42, 0.4, b.x + sx, 0.1, b.z, WOOD_D); }
  k.solidC(L.scope.x, L.scope.z, 0.3, 0.3, 1.3);
  for (const s of [-1, 1]) k.solidC(L.x + s * 2.0, L.z - 2.1, 0.2, 0.2, 1.2);
}

/** Builds the beach into the hub's batches (the seats come from `ngorBeachSeats`, the people and offers from the venue). */
export function buildNgorBeach(k: StripKit) {
  const R = rng(k.seed * 11 + 17);
  NGOR_BEACH.beds.forEach((b, n) => bed(k, b.x, b.z, n));
  stall(k, 'souvenirs', NGOR_BEACH.stalls.souvenirs.x, NGOR_BEACH.stalls.souvenirs.z, 0xe8742c, 'LUNETTES & CHAPEAUX', '#7a3a10');
  stall(k, 'jus', NGOR_BEACH.stalls.jus.x, NGOR_BEACH.stalls.jus.z, 0x1fa07a, 'COCO FRAIS · JUS', '#0f5a44');
  stall(k, 'grill', NGOR_BEACH.stalls.grill.x, NGOR_BEACH.stalls.grill.z, 0xd9322b, 'MAÏS GRILLÉ · BEIGNETS', '#7a1a14');
  stall(k, 'tissus', NGOR_BEACH.stalls.tissus.x, NGOR_BEACH.stalls.tissus.z, 0x6a4dff, 'WAX · COLLIERS · ART', '#2a1d5a');
  beachBar(k); promenade(k); embarkation(k); lookout(k);
  for (const [x, z, s] of [[-24, -143, 1], [-12.6, -142.4, 0.95], [-3.4, -142.4, 0.95], [7.4, -141, 1]] as const) { planter(k, x, z + 0.8, 1.2, 0.9, 0xe7e1d4, false); palm(k, x, z + 0.8, s + R() * 0.05); }
  for (const x of [-6, -10]) lampPole(k, x, -131.6, 4.2);
  festoon(k, -13.5, 3.0, -131.8, -2.5, 3.0, -131.8, 0.45, [WARM, 0xffc46b, 0xff8aa8], 0.7);
}
