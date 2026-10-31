import type { Batch } from './batch';
import type { KeepClear } from './types';
import { rng } from '../core/rng';
import {
  ALLEY_RECT, CAR_COLOURS, VENUE_D, VENUE_W, WARM,
  binta, cafeSet, clubAlley, comptoir, festoon, lampPole, lounge, palm, parkedCar, phare, planter, type StripKit,
} from './hospitalityStrip';

/**
 * The Almadies' night street (docs/districts/ALMADIES-NIGHTLIFE.md): the beach side of the coast road, across from the boutique hotel and the resort, from Le Patio at the west end to
 * Le Comptoir de Ngor at the east (the pirogues pulled up on the sand beyond it, x > 11, stay where the Embarcadère has them), with La Vague behind its alley in the middle. It is the M4 team's hospitality strip (Lounge 221, Le Comptoir de Ngor, Chez Binta, Café du Phare and
 * the lit alley, src/world/hospitalityStrip.ts) turned to face the road and moved off the two sea-front blocks, which LD2.0-E's hotels and villas have again; Le Patio is the courtyard
 * club of src/venues/patio.ts, the Terrasse de Ngor the boutique hotel's roof.
 *
 * From the road to the sea (z grows toward the road; the carriageway's north edge is z −127):
 *   − 127 … − 132.6   the car parks: two rows of painted bays, nose to the beach, open to the road (a car drives straight in and reverses out) — « PARKING DU PATIO » in the west,
 *                      « PARKING NGOR » (hotel, Terrasse and La Vague's visitors) in the east; a dépose-minute bay for taxis between the west one and the alley
 *   − 132.6 … − 137   the promenade: an ochre walk along the venues' fronts, lamp poles and festoons, café tables at the doors
 *   − 137 …           the venues' fronts (the buildings, a courtyard behind the gate of Le Patio), the beach and the sea behind them
 * No marking lies on the carriageway; the bays are on the sand verge, so a car in one is out of every traffic lane. The NPC cars in them leave every third bay free and the bays
 * nearest each venue's door.
 *
 * It only adds merged primitives and colliders. It draws nothing from the generator's own random stream: a local stream feeds the parked cars.
 */

/** The carriageway's north edge, the car parks' open side, and the line of the venues' fronts (La Vague's gate is on it). */
export const ROAD_EDGE_Z = -127, BAY_DEPTH = 5.0, WALK_Z0 = -132.6, FRONT_Z = -137;
export const BAY_W = 2.6;
/** The two car parks' extent along the road. */
export const LOTS = {
  west: { name: 'PARKING DU PATIO · 24H/24', x0: -122, x1: -64 },
  east: { name: 'PARKING NGOR · HÔTEL · TERRASSE · LA VAGUE', x0: -22, x1: 10 },
} as const;
/** Where Le Patio stands: the club's local frame (VenueKit: the gate toward +z, the sea toward −z), its centre and half extents. The gate is on the venues' front line. */
export const PATIO_SITE = { x: -109, z: FRONT_Z - 10, yaw: 0, halfW: 14, halfD: 10 } as const;
/** The venues the M4 strip drew, by centre, west to east: they face the road. */
export const NIGHT_VENUES = [
  { kind: 'binta', cx: -86.5 }, { kind: 'phare', cx: -72.5 },
  { kind: 'lounge', cx: -12 }, { kind: 'comptoir', cx: 4 },
] as const;
type VenueKind = typeof NIGHT_VENUES[number]['kind'];
const BUILD: Record<VenueKind, (k: StripKit, x: number, z: number) => void> = { binta, phare, lounge, comptoir };
/** The dépose-minute bay (taxis and the drop-offs of the west car park), between the west car park and the alley. */
export const DROP_BAY = { x0: -62.5, x1: -53.5 };

/** The ground the night street owns: the street dressing (billboards, stalls, parked traffic, palms) keeps off, and the digest tests leave it out of the « rest of the Almadies ». */
export const NIGHT_RECTS = {
  west: { x0: -124, z0: -158, x1: -52.5, z1: ROAD_EDGE_Z },
  east: { x0: -23, z0: -158, x1: 13, z1: ROAD_EDGE_Z },
} as const;
/** A zebra across the coast road from the alley's mouth to the hotel's forecourt gap: the way between the night street and the boutique hotel (the road's other crossings are at its junctions). */
export const ZEBRA = { x: -30, z0: -126.2, z1: -113.8 };
/** The crossing's ground: no parked car stands on it (the digest tests leave it out too). */
export const ZEBRA_RECT = { x0: -32.5, z0: -127, x1: -27.5, z1: -113.4 };
export const NIGHT_KEEP_CLEAR: KeepClear[] = [
  { x0: LOTS.west.x0 - 1, z0: -133, x1: DROP_BAY.x1 + 0.5, z1: -122.5, why: 'almadies_car_park' },
  { x0: LOTS.east.x0 - 1, z0: -133, x1: LOTS.east.x1 + 1, z1: -122.5, why: 'almadies_car_park' },
  { x0: NIGHT_RECTS.west.x0, z0: -158, x1: DROP_BAY.x0 - 0.5, z1: -133, why: 'almadies_night_street' },
  { x0: NIGHT_RECTS.east.x0, z0: -158, x1: NIGHT_RECTS.east.x1, z1: -133, why: 'almadies_night_street' },
  { ...ALLEY_RECT, why: 'almadies_alley' },
  { ...ZEBRA_RECT, why: 'almadies_crossing' },
];
/** Whether a point of the beach is on ground the night street owns (a margin for the trunks' crowns). */
export const inNightStreet = (x: number, z: number, m = 0.5) => [NIGHT_RECTS.west, NIGHT_RECTS.east].some(r => x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m);

/**
 * The kit turned half a turn about (cx, cz): a venue drawn facing −z comes out facing +z, the road. Every primitive's position is mirrored through the centre and its yaw gains π
 * (a primitive's own tilt and roll are local to it, so they stay): the same building, the other way round.
 */
export function turned(k: StripKit, cx: number, cz: number): StripKit {
  const mx = (x: number) => 2 * cx - x, mz = (z: number) => 2 * cz - z;
  type B = Batch;
  const wrap = (b: B): B => ({
    box: (w: number, h: number, d: number, x: number, y: number, z: number, c: number, r = 0) => b.box(w, h, d, mx(x), y, mz(z), c, r + Math.PI),
    slab: (w: number, h: number, d: number, x: number, y: number, z: number, c: number, r = 0, t = 0, ro = 0) => b.slab(w, h, d, mx(x), y, mz(z), c, r + Math.PI, t, ro),
    flat: (w: number, d: number, x: number, y: number, z: number, c: number, r = 0) => b.flat(w, d, mx(x), y, mz(z), c, r + Math.PI),
    facade: (w: number, h: number, d: number, x: number, y: number, z: number, c: number, r = 0) => b.facade(w, h, d, mx(x), y, mz(z), c, r + Math.PI),
    cyl: (rt: number, rb: number, h: number, x: number, y: number, z: number, c: number, seg = 8, rot: [number, number, number] = [0, 0, 0]) => b.cyl(rt, rb, h, mx(x), y, mz(z), c, seg, [rot[0], rot[1] + Math.PI, rot[2]]),
    blob: (r: number, x: number, y: number, z: number, c: number, sy = 1, d = 1) => b.blob(r, mx(x), y, mz(z), c, sy, d),
    sphere: (r: number, x: number, y: number, z: number, c: number, half = false) => b.sphere(r, mx(x), y, mz(z), c, half),
  } as unknown as B);
  return {
    ...k,
    plain: wrap(k.plain), glass: wrap(k.glass), metal: wrap(k.metal), lampBulbs: wrap(k.lampBulbs), lampPosts: wrap(k.lampPosts), leaves: wrap(k.leaves), trunks: wrap(k.trunks), tin: wrap(k.tin), tileRoof: wrap(k.tileRoof),
    canopies: { push: (...c: StripKit['canopies']) => k.canopies.push(...c.map(o => ({ ...o, x: mx(o.x), z: mz(o.z) }))) } as unknown as StripKit['canopies'],
    people: { push: (...p: StripKit['people']) => k.people.push(...p.map(o => ({ ...o, x: mx(o.x), z: mz(o.z), yaw: o.yaw + Math.PI }))) } as unknown as StripKit['people'],
    addSign: (text, bg, fg, x, y, z, rotY, w, h) => k.addSign(text, bg, fg, mx(x), y, mz(z), rotY + Math.PI, w, h),
    solidC: (x, z, w, d, h) => k.solidC(mx(x), mz(z), w, d, h),
    pool: (x, z, r, y) => k.pool(mx(x), mz(z), r, y),
  };
}

// ---------------------------------------------------------------- the car parks and the promenade
/** A row of painted bays along the road's north edge, open to the carriageway: asphalt, lines, wheel stops, NPC cars that leave open the bays within `r` metres of each door `[x, r]` of `free` (a player drives in on an arc and needs the neighbours clear), and a sign at each end. */
function bayRow(k: StripKit, x0: number, x1: number, name: string, seed: number, free: [number, number][]) {
  const { plain, G } = k, R = rng(seed), top = G + 0.045, y = G + 0.005;
  const n = Math.floor((x1 - x0) / BAY_W), w = n * BAY_W, bx0 = x0 + ((x1 - x0) - w) / 2, zFront = ROAD_EDGE_Z, zBack = ROAD_EDGE_Z - BAY_DEPTH;
  plain.box(w + 0.6, 0.035, BAY_DEPTH + 0.6, bx0 + w / 2, y - 0.015, (zFront + zBack) / 2, 0x4a4d52);                       // the asphalt, on the sand verge
  for (let i = 0; i <= n; i++) plain.box(0.1, 0.012, BAY_DEPTH - 0.1, bx0 + i * BAY_W, top, (zFront + zBack) / 2 + 0.05, 0xf2f2ec);   // bay lines
  plain.box(w, 0.012, 0.1, bx0 + w / 2, top, zBack + 0.05, 0xf2f2ec);                                                     // the row's back line
  const bays: { x: number; z: number }[] = [];
  for (let i = 0; i < n; i++) {
    const cx = bx0 + (i + 0.5) * BAY_W;
    bays.push({ x: cx, z: zBack + 2.5 });
    plain.box(1.5, 0.11, 0.16, cx, top, zBack + 0.45, 0x8d8f93);                                                           // the wheel stop (a visual: nothing solid at the back)
  }
  // NPC cars: about two bays in five, never the bays nearest a door (`free`) and never every bay of a stretch
  const cars = bays.filter((b, i) => i % 3 !== 1 && !free.some(([f, r]) => Math.abs(f - b.x) < r) && R() < 0.72);
  for (const b of cars) parkedCar(k, b.x + (R() - 0.5) * 0.2, b.z + (R() - 0.5) * 0.3, -1, CAR_COLOURS[Math.floor(R() * CAR_COLOURS.length)], R() < 0.25);
  // the sign: a board on two posts at each end of the row, facing the road, lit at night
  for (const ex of [bx0 - 0.9, bx0 + w + 0.9]) {
    plain.box(0.22, 4.2, 0.22, ex - 1.9, G, zBack - 0.6, 0x23527f); plain.box(0.22, 4.2, 0.22, ex + 1.9, G, zBack - 0.6, 0x23527f);
    plain.box(4.4, 0.95, 0.2, ex, G + 3.35, zBack - 0.6, 0x23527f);
    k.addSign(name, '#0d3d8c', '#ffffff', ex, G + 3.8, zBack - 0.47, 0, 4.1, 0.82);
    k.solidC(ex - 1.9, zBack - 0.6, 0.3, 0.3, 4.2); k.solidC(ex + 1.9, zBack - 0.6, 0.3, 0.3, 4.2);
  }
  const taken = new Set(cars);
  return { n, bx0, w, cars: cars.length, bays: bays.map(b => ({ x: +b.x.toFixed(2), z: +b.z.toFixed(2), free: !taken.has(b) })) };
}

/** The ochre walk along the venues' fronts, with its lamp poles and the festoons that run from them to the fronts. */
function promenade(k: StripKit, x0: number, x1: number) {
  const { plain, G } = k, z0 = FRONT_Z, z1 = WALK_Z0, top = G + 0.035;
  plain.box(x1 - x0, 0.035, z1 - z0, (x0 + x1) / 2, G, (z0 + z1) / 2, 0xb99a74);
  for (let x = x0 + 7.7; x < x1 - 1; x += 7.7) plain.box(0.12, 0.018, z1 - z0, x, top, (z0 + z1) / 2, 0xd8c9ab);              // joints
  for (let x = x0 + 6; x < x1 - 3; x += 12.4) {
    lampPole(k, x, z1 - 0.6, 4.9);
    festoon(k, x, 4.6, z1 - 0.6, x + 6.2, 3.4, z0 + 1.0, 0.3, [WARM, 0xffc46b], 0.8);
  }
}

/** The dépose-minute bay: a yellow-hatched kerb strip beside the road with a TAXI sign, where a taxi waits and the club's guests are let out. */
function dropBay(k: StripKit) {
  const { plain, G } = k, cx = (DROP_BAY.x0 + DROP_BAY.x1) / 2, w = DROP_BAY.x1 - DROP_BAY.x0, top = G + 0.045;
  plain.box(w, 0.035, 3.4, cx, G - 0.01, ROAD_EDGE_Z - 1.7, 0x4a4d52);
  for (let i = 0; i < 7; i++) plain.box(0.16, 0.012, 3.2, DROP_BAY.x0 + 0.8 + i * (w - 1.6) / 6, top, ROAD_EDGE_Z - 1.7, 0xf2c230, Math.PI / 8);
  plain.box(w, 0.012, 0.1, cx, top, ROAD_EDGE_Z - 3.4, 0xf2f2ec);
  plain.box(0.14, 3.4, 0.14, DROP_BAY.x1 - 0.4, G, ROAD_EDGE_Z - 3.9, 0x2b2b2b);
  k.addSign('TAXIS · DÉPOSE-MINUTE', '#f2c230', '#1a1a1a', DROP_BAY.x1 - 0.4, G + 3.0, ROAD_EDGE_Z - 3.8, 0, 2.6, 0.6);
  k.solidC(DROP_BAY.x1 - 0.4, ROAD_EDGE_Z - 3.9, 0.2, 0.2, 3.4);
  parkedCar(k, DROP_BAY.x0 + 3.2, ROAD_EDGE_Z - 2.4, -1, 0xf2c230, false);                                                       // a taxi waiting (solid, as every parked car)
}

function zebra(k: StripKit) {
  if (k.lite) return;                                                                       // as the junctions' (src/world/builder.ts): not on Low
  for (let z = ZEBRA.z0; z <= ZEBRA.z1 + 0.01; z += 1.1) k.plain.flat(2.4, 0.55, ZEBRA.x, 0.085, z, 0xeeeae0);
}

/**
 * Builds the night street into the hub's batches: the car parks, the promenade, the four venues turned toward the road and the alley to La Vague. Le Patio is its own venue module
 * (src/venues/patio.ts) and the Terrasse de Ngor the hotel's roof: neither is drawn here.
 */
export interface NightStreetInfo {
  /** Every painted bay by centre (the car's middle when it is in), with whether an NPC car stands in it: the player's cars park in the free ones. */
  bays: { x: number; z: number; lot: 'west' | 'east'; free: boolean }[];
  venues: { kind: string; cx: number; front: number }[];
  patio: typeof PATIO_SITE; dropBay: typeof DROP_BAY; cars: number;
}
export function buildNightStreet(k: StripKit): NightStreetInfo {
  const venues: NightStreetInfo['venues'] = [];
  const w = bayRow(k, LOTS.west.x0, LOTS.west.x1, LOTS.west.name, k.seed * 31 + 3, [[PATIO_SITE.x, 6], [-86.5, 6], [-72.5, 6]]);
  const e = bayRow(k, LOTS.east.x0, LOTS.east.x1, LOTS.east.name, k.seed * 31 + 10, [[-12, 8], [4, 4]]);
  dropBay(k); zebra(k);
  promenade(k, LOTS.west.x0, DROP_BAY.x0 - 1);
  promenade(k, LOTS.east.x0, LOTS.east.x1);
  for (const v of NIGHT_VENUES) {
    const cz = FRONT_Z - VENUE_D / 2, kt = turned(k, v.cx, cz), t = v.kind;
    BUILD[t](kt, v.cx, cz);
    const tables = t === 'lounge' ? [] : t === 'comptoir' ? [v.cx - 7.3] : t === 'phare' ? [v.cx + 7.4] : [v.cx - 7.3];
    for (const tx of tables) cafeSet(kt, tx, cz - VENUE_D / 2 - 4.0, t === 'comptoir' ? 0x2a6fb0 : t === 'phare' ? 0x1e6fd9 : 0xb94f36);
    if (t !== 'lounge') kt.people.push({ x: v.cx + 1.0, z: cz - VENUE_D / 2 - 3.0, yaw: Math.PI, clip: 'Talk' });
    kt.solidC(v.cx, cz, VENUE_W + 0.5, VENUE_D + 0.5, t === 'lounge' ? 6.4 : t === 'phare' ? 5.0 : t === 'binta' ? 4.2 : 4.6);
    venues.push({ kind: t, cx: v.cx, front: FRONT_Z });
  }
  palm(k, 0, FRONT_Z + 1.4, 1.0); planter(k, 0, FRONT_Z + 1.4, 1.3, 1.0, 0xe7e1d4, false);       // between the lounge and the comptoir
  clubAlley(k);
  return { bays: [...w.bays.map(b => ({ ...b, lot: 'west' as const })), ...e.bays.map(b => ({ ...b, lot: 'east' as const }))], venues, patio: PATIO_SITE, dropBay: DROP_BAY, cars: w.cars + e.cars };
}
