import { BAR, BOOTH, DANCE_FLOOR, SEAT_IDS, ZF } from './patioPlan';
import { NGOR_BEACH } from '../world/ngorBeach';
import type { Doing, KeepOut, LifePlan, LifeSpot, Pt } from './routine';

/**
 * Where the people of the three living places stand, sit, dance and look at the sea, and when (1.0.1; the routine: src/venues/routine.ts, the scene:
 * src/venues/venueLife.ts). Pure data, placed by hand on ground that is open in each place's own plan and held to it by tests/venueLife.test.ts:
 * never on a door, a way in, an anchor the player walks to, an aisle or the spot of somebody who is already there (the named cast, the stallholders).
 *
 *  - Le Patio (Almadies, 20 h – 4 h): the courtyard fills through the evening and is full from midnight to 2 h 30; nobody by day.
 *  - The rooftop terraces — Toit Baobab (Plateau), Terrasse de Ngor (the hotel's roof, Almadies), Sunset Lounge (Corniche): lunch and, above all,
 *    the evening; nobody late at night or in the morning.
 *  - La plage de Ngor: a few people in the morning, busy from 13 h to 18 h, the last ones at dusk, nobody at night.
 */
const HALF = Math.PI / 2;
const spot = (id: string, kind: Doing, x: number, z: number, yaw: number, extra: Partial<LifeSpot> = {}): LifeSpot => ({ id, kind, x, z, yaw, ...extra });
/** Two or three people facing the middle of their group. */
const group = (id: string, kind: Doing, cx: number, cz: number, n: 2 | 3, r = 0.62, turn = 0): LifeSpot[] =>
  Array.from({ length: n }, (_, i) => { const a = turn + (i * Math.PI * 2) / n, x = cx + Math.sin(a) * r, z = cz + Math.cos(a) * r; return spot(`${id}${i}`, kind, x, z, Math.atan2(cx - x, cz - z)); });
const facing = (from: Pt, to: Pt) => Math.atan2(to.x - from.x, to.z - from.z);

// ------------------------------------------------------------------ Le Patio (club-local metres: the gate toward +z, src/venues/patioPlan.ts)
const FLOOR_C = { x: DANCE_FLOOR.x, z: DANCE_FLOOR.z };
/** The dancers keep to the rim of the floor: its middle is where the player dances (the floor's anchor), and Fatou and Seynabou have their own places. */
const PATIO_DANCERS: [number, number][] = [[3.2, -0.6], [3.7, -2.4], [3.2, -4.4], [1.7, -5.0], [-1.8, -5.0], [-3.7, -3.7], [-4.0, -2.0], [2.1, -0.1], [4.2, -3.4], [-2.9, -4.4]];
export const PATIO_LIFE: LifePlan = {
  id: 'patio',
  // in the arch of the gate, either side of its middle: the rope and the doorman are out on the porch, the way out (the exit's anchor) inside
  entries: [{ x: 0.75, z: ZF + 0.15 }, { x: -0.75, z: ZF + 0.15 }],
  // just inside, off the walk from the gate to the floor (x within ±1.6 stays the player's)
  gathers: [
    spot('g0', 'talk', 2.7, 7.4, -HALF), spot('g1', 'talk', 3.6, 7.9, -HALF - 0.5), spot('g2', 'talk', -2.7, 7.4, HALF), spot('g3', 'talk', -3.6, 7.9, HALF + 0.5),
    spot('g4', 'talk', 2.9, 3.2, -HALF + 0.4), spot('g5', 'talk', -2.9, 3.2, HALF - 0.4),
  ],
  spots: [
    ...PATIO_DANCERS.map(([x, z], i) => spot(`d${i}`, 'dance', x, z, facing({ x, z }, FLOOR_C))),
    ...group('te', 'talk', 8.2, -1.6, 3), ...group('tf', 'talk', 10.4, 1.3, 2, 0.6, HALF), ...group('tw', 'talk', -6.3, -3.0, 2, 0.6, HALF), ...group('tg', 'talk', -3.7, 5.0, 2, 0.6, HALF),
    // watching the floor from its edge
    spot('w0', 'stand', 5.4, -2.2, -HALF), spot('w1', 'stand', 5.3, -4.3, -HALF + 0.3), spot('w2', 'stand', -5.4, -5.0, HALF), spot('w3', 'stand', 5.2, 0.9, -HALF - 0.5),
    // a stool at the bar, a place on the sofas (the cast has Tonton's stool and Ibrahima's, Aminata's place and Marième's; the others stay free for the player)
    spot('s0', 'sit', BAR.stoolX, BAR.stools[0], -HALF, { seat: SEAT_IDS.stool(0) }), spot('s1', 'sit', BAR.stoolX, BAR.stools[3], -HALF, { seat: SEAT_IDS.stool(3) }),
    spot('s2', 'sit', -9.4, ZF - 0.7, Math.PI, { seat: `${SEAT_IDS.salon[1]}:0` }), spot('s3', 'sit', -13.5 + 0.7, 3.4, HALF, { seat: `${SEAT_IDS.salon[0]}:1` }),
  ],
  windows: [[20, 22, 0.45], [22, 24, 0.8], [0, 2.5, 1], [2.5, 4, 0.4]],
  capacity: { low: 10, medium: 18, high: 26 },
  near: { low: 0, medium: 2, high: 4 },
  bpm: 100,
};
/** What the courtyard's people keep off, club-local: the place's anchors (the player's spots) and the cast's standing places. */
export const PATIO_KEEP: KeepOut[] = [
  { x: FLOOR_C.x, z: FLOOR_C.z, r: 2.3, why: 'floor' }, { x: BAR.anchorX - 0.4, z: BAR.anchorZ, r: 1.25, why: 'bar' }, { x: BOOTH.x, z: BOOTH.z + 1.9, r: 1.25, why: 'dj' },
  { x: 0, z: ZF - 1.7, r: 1.7, why: 'exit' }, { x: 0, z: ZF + 2.1, r: 1.7, why: 'door' },
  { x: -3.4, z: -0.2, r: 1.0, why: 'fatou' }, { x: -2.2, z: -1.5, r: 1.0, why: 'seynabou' }, { x: -6.7, z: 0.9, r: 1.0, why: 'rokhaya' }, { x: -5.4, z: 6.6, r: 1.0, why: 'serveur' },
];
/** The walk from the gate to the dance floor (club-local): nobody stands in it. */
export const PATIO_WALK = { x0: -1.6, x1: 1.6, z0: 0.4, z1: ZF } as const;

// ------------------------------------------------------------------ the rooftop terraces (terrace-local: x from the deck's centre, the stairs at x +5 in the south parapet z +5.5, the bar north; src/venues/rooftop.ts)
export const TERRACE_STAIRS = { x: 5, z: 5.3 } as const;
/** The aisle from the bar to the stairs (x +4.1 … +5.9): the guest's way in and out, nobody stands in it. */
export const TERRACE_AISLE = { x0: 4.1, x1: 5.9, z0: -3.4, z1: 5.5 } as const;
/** Lunch and the evening on a roof that never shuts (Toit Baobab, Sunset Lounge); the hotel's roof opens at 17 h and shuts at 1 h. */
const TERRACE_WINDOWS: Record<string, LifePlan['windows']> = {
  plateau: [[12, 15, 0.6], [18, 19.5, 0.5], [19.5, 23, 1], [23, 24, 0.3]],
  corniche: [[12, 15, 0.4], [17, 19.5, 0.8], [19.5, 23.5, 1], [23.5, 1, 0.4]],
  almadies: [[17, 19, 0.45], [19, 23, 1], [23, 1, 0.5]],
};
/**
 * A terrace's people. `kind`: tables and chairs (two chairs a table, numbered in the tables' order) or low tables with a sofa and two poufs (five
 * seats a table); the two tables nearest the bar are left to the player, and at the others never more than about half the seats are taken.
 */
export function terraceLife(def: { id: string; kind: 'restaurant' | 'lounge'; view: 'city' | 'sea' }, hub: string): LifePlan {
  const seat = (i: number, name: string) => spot(`s${i}`, 'sit', 0, 0, 0, { seat: `${hub}:rooftop:${name}` });
  const seats = def.kind === 'restaurant'
    ? ['chair:0', 'chair:1', 'chair:2', 'chair:3', 'chair:4', 'chair:10', 'chair:11', 'stool:12']
    : ['sofa:0', 'sofa:1', 'pouf:3', 'sofa:5', 'sofa:7', 'sofa:10', 'pouf:13', 'sofa:25', 'sofa:26', 'stool:30'];
  return {
    id: `terrasse:${def.id}`,
    entries: [{ ...TERRACE_STAIRS }],
    gathers: [spot('g0', 'talk', -6.6, -1.5, HALF), spot('g1', 'talk', -3.2, -1.3, 2.4), spot('g2', 'talk', -2.5, -2.2, -0.9), spot('g3', 'talk', 6.8, -3.0, 0), spot('g4', 'talk', 6.8, -0.9, Math.PI)],
    spots: [
      // at the parapet, the sea (or the city) in front
      spot('v0', 'sea', -6.6, -4.75, Math.PI), spot('v1', 'sea', -5.2, -4.75, Math.PI), spot('v2', 'sea', -3.7, -4.75, Math.PI), spot('v3', 'sea', -7.45, -2.7, -HALF),
      spot('v4', 'sea', 7.45, -2.0, HALF), spot('v5', 'sea', 7.45, 0.6, HALF),
      ...group('ta', 'talk', -5.0, -3.1, 3, 0.6), ...group('tb', 'talk', 6.75, 3.0, 2, 0.55),
      // a lounge dances a little once the evening is on
      ...(def.kind === 'lounge' ? [spot('d0', 'dance', -3.3, -3.7, 0.6, { from: 21, until: 1 }), spot('d1', 'dance', -2.4, -3.4, -0.6, { from: 21, until: 1 })] : []),
      ...seats.map((s, i) => seat(i, s)),
    ],
    windows: TERRACE_WINDOWS[def.id] ?? TERRACE_WINDOWS.plateau,
    capacity: { low: 5, medium: 9, high: 13 },
    near: { low: 0, medium: 2, high: 3 },
    bpm: 104,
  };
}
/** What a terrace's people keep off (terrace-local): the bar where the player orders, the way down, the hostess of the Terrasse de Ngor (src/districts/almadies.ts). */
export const TERRACE_KEEP: KeepOut[] = [
  { x: 2.2, z: -3.1, r: 1.7, why: 'bar' }, { x: 5, z: 5.0, r: 1.7, why: 'exit' }, { x: 4.6, z: 4.0, r: 1.25, why: 'spawn' }, { x: -0.8, z: -3.4, r: 1.25, why: 'awa' },
];

// ------------------------------------------------------------------ la plage de Ngor (hub-local metres, the sea toward −z: src/world/ngorBeach.ts)
const N = NGOR_BEACH, SEA = Math.PI;
/** The water's edge, on the wet sand (the waterline is z −163). */
const EDGE = -160.6, STROLL = -158.8;
export const NGOR_LIFE: LifePlan = {
  id: 'plage',
  // the ends of the boardwalk and the beach's gate
  entries: [{ x: -21.4, z: N.promenade.z }, { x: 31, z: N.promenade.z }, { x: N.gate.x, z: N.gate.z - 0.5 }],
  // between the stalls, either side of the way down from the gate
  gathers: [spot('g0', 'talk', -10.2, -136.6, HALF), spot('g1', 'talk', -9.6, -137.5, HALF - 0.6), spot('g2', 'talk', -5.8, -136.6, -HALF), spot('g3', 'talk', -6.4, -137.5, -HALF + 0.6), spot('g4', 'talk', 12.5, -131.4, SEA)],
  spots: [
    ...[-20.5, -16, -11.5, -5, 0.5, 5.5].map((x, i) => spot(`sea${i}`, 'sea', x, EDGE - (i % 2) * 0.5, SEA + (i % 3 - 1) * 0.15)),
    // a walk along the water, a walk along the boardwalk: short halts far apart
    ...[-22.5, -13, -3, 7].map((x, i) => spot(`eau${i}`, 'stroll', x, STROLL + (i % 2) * 0.6, SEA)),
    ...[-19, -1, 16, 27].map((x, i) => spot(`quai${i}`, 'stroll', x, N.promenade.z + (i % 2 ? 0.45 : -0.45), SEA)),
    ...group('ta', 'talk', -18.2, -155.6, 3), ...group('tb', 'talk', 2.6, -151.2, 2, 0.6, HALF), ...group('tc', 'talk', -1.0, -157.2, 2, 0.6, HALF),
    // beside a stall's customer (the customer's own place is the stall's anchor), looking at what is sold
    spot('st0', 'stand', -11.2, -132.5, SEA + 0.5), spot('st1', 'stand', -1.2, -132.5, SEA + 0.5), spot('st2', 'stand', 4.4, -132.5, SEA + 0.5),
    // beds, a stool at the bar, a bench of the lookout, a place in the waiting shelter: seats the beach's own figures do not hold, and others stay free for the player
    spot('s0', 'sit', 0, 0, 0, { seat: 'almadies:ngor:bed:6' }), spot('s1', 'sit', 0, 0, 0, { seat: 'almadies:ngor:bed:11' }), spot('s2', 'sit', 0, 0, 0, { seat: 'almadies:ngor:bed:0' }),
    spot('s3', 'sit', 0, 0, 0, { seat: 'almadies:ngor:stool:5' }), spot('s4', 'sit', 0, 0, 0, { seat: 'almadies:ngor:look:1' }), spot('s5', 'sit', 0, 0, 0, { seat: 'almadies:ngor:wait:3' }),
  ],
  windows: [[8, 10, 0.3], [10, 13, 0.65], [13, 18, 1], [18, 20, 0.45]],
  capacity: { low: 8, medium: 14, high: 22 },
  near: { low: 0, medium: 2, high: 4 },
};
/** What the beach's people keep off: every anchor of the place (where the player stands to buy, to rent a bed, to look through the telescope), the gate. */
export const NGOR_KEEP: KeepOut[] = [
  ...Object.entries(N.stalls).map(([k, s]) => ({ x: s.at.x, z: s.at.z, r: 1.25, why: k })),
  { x: N.bar.at.x, z: N.bar.at.z, r: 1.7, why: 'bar' }, { x: N.hut.at.x, z: N.hut.at.z, r: 1.7, why: 'guichet' }, { x: N.lookout.at.x, z: N.lookout.at.z, r: 1.25, why: 'lunette' },
  { x: -17.4, z: -142.3, r: 1.25, why: 'transats_a' }, { x: 0.6, z: -142.3, r: 1.25, why: 'transats_b' }, { x: N.gate.x, z: N.gate.z, r: 1.7, why: 'gate' },
];
/** The ground the beach's people walk on (their walking map: src/world/navgrid.ts). */
export const NGOR_AREA = { x0: -26, x1: 36, z0: -162.4, z1: -128.6 } as const;

/** A plan placed in the world: `at` maps its own metres to the hub's, `turn` is added to every facing. */
export function placed(plan: LifePlan, at: (x: number, z: number) => Pt, turn = 0): LifePlan {
  const sp = (s: LifeSpot): LifeSpot => ({ ...s, ...at(s.x, s.z), yaw: s.yaw + turn });
  return { ...plan, entries: plan.entries.map(e => at(e.x, e.z)), gathers: plan.gathers.map(sp), spots: plan.spots.map(sp) };
}
