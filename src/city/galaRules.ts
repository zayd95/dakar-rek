/**
 * The road to the arena on a fight evening, as rules (pure, no three.js; unit-tested in tests/galaTraffic.test.ts; drawn
 * by src/city/galaTraffic.ts). From the doors the east approach thickens: cars queue on the road that comes in to the
 * junction at the arena block's north-east corner, where a traffic agent stands in the middle and lets one side go, then
 * the other — the jam's front cars sent round to the right (north, away from the closed gate road), then the moto-taxis
 * and the people crossing. A short jam forms there: three columns of cars kerb to kerb, with gaps between them a moto
 * fits through and a car does not. The moto-taxis filter through the gaps to their drop-off on the gate road, where the
 * fan on the back steps off and walks to the queue. After the bouts the flow turns round: the cars leave eastwards in a
 * jam the other way, fed from the parking along the arena; taxis wait at the corner's kerb for the crowd and the
 * moto-taxis come to take fans home. A weekday card is the same evening at 40 % (src/city/rules.ts SIZE_SHARE, as the
 * arena's exterior and the street flows scale it).
 *
 * Everything is a function of the arena's place, the shared clock (seconds of server time: one city hour is one real
 * minute, src/core/clock.ts) and a seed of the hub and the city day (`galaSeed`, a sibling of the bout's seed), so every
 * player sees the same cars at the same places.
 */
import { GALA, boutSeed } from '../arena/program';
import { gateOf } from '../arena/exteriorRules';
import { KERB, arenaEvening } from '../transport/lines';
import { Path, type Pose, type Pt } from '../transport/route';
import { LEAVING_FROM, SIZE_SHARE, arenaArrivals, arenaDepartures, curve, type EveningSize } from './rules';

export type { Pt };
export type Quality = 'low' | 'medium' | 'high';
/** Seconds of the shared clock in one city hour (a city day is 24 real minutes). */
export const HOUR_S = 60;

/** Seed of the gala road of a hub on a city day (the same for everyone; a sibling of the bout's seed). */
export const galaSeed = (hub: string, day: number) => boutSeed(`${hub}:road`, Math.floor(day));
const frac = (x: number) => x - Math.floor(x);
/** k-th number in [0, 1) of a seed (k kept small: the same on every engine). */
export const unit = (seed: number, k: number) => frac(Math.sin((seed % 100003) * 0.0137 + (k % 100019) * 12.9898) * 43758.5453);
const smooth = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };
const wrapH = (h: number) => ((h % 24) + 24) % 24;

// ------------------------------------------------------------------ the place

/** x (or z) beyond which a vehicle has left the hub (it ends at ±130 m; roads run on past it). */
export const EDGE = 136;
/** Between two columns of the jam, centre to centre (m): the gaps are 1.46–1.70 m (a Jakarta is 0.84, a car 1.78). */
export const COLUMN_GAP = 3.4;

/**
 * The geometry of the gala road round an arena centred on (cx, cz), on the hub's 60 m road grid.
 * - The junction at the arena block's north-east corner, the agent in its middle.
 * - The east approach (the road towards +x from the junction): the jam's three columns on the carriageway, kerb to
 *   kerb (the pavements stay the walkers', src/crowd/streetPlan.ts PAVE), stopping short of the crossing (the walkers'
 *   lanes end 7.6 m from the junction).
 * - The two moto lanes through the jam: the north gap westbound, the south gap eastbound (driving on the right).
 * - The moto-taxis' drop-off on the gate road's north lane, east of the gate's pedestrian zone (src/arena/exteriorRules.ts
 *   gatePlaza: the stalls, the barriers, the queue) and its U-turn too.
 * - The road north of the junction: the lanes the released cars and the taxis use, the taxis' kerb (the rank).
 */
export interface GalaGeo {
  junction: Pt;
  /** The carriageway the jam fills (z, kerb to kerb). */
  corridor: readonly [number, number];
  /** x of the jam's front line (arriving), or its tail end (leaving), just past the crossing. */
  front: number;
  /** z of the three columns, north to south. */
  columns: readonly number[];
  /** z of the moto lanes: through the north gap (westbound, in), the south gap (eastbound, out). */
  gapIn: number; gapOut: number;
  /** x where the moto-taxis wait beside the front cars while the agent lets the jam go. */
  hold: number;
  /** The drop-off (the moto stands there) and where its pillion steps off / a fan gets on. */
  motoDrop: Pt; motoStep: Pt;
  /** x of the north road's southbound lane (west) and northbound lane (east), and of its west kerb (the taxis' rank). */
  southbound: number; northbound: number; kerb: number;
  /** The rank's places on that kerb after the bouts (nose south, towards the junction). */
  rank: readonly Pt[];
  /** The traffic agent: in the middle of the junction, clear of every lane. */
  agent: Pt;
  /** Where the fans walk to (the queue's tail) and where the crowd comes out of the gate. */
  queueTail: Pt; gateOut: Pt;
}
export function galaGeo(a: { cx: number; cz: number }): GalaGeo {
  const jx = a.cx + 30, jz = a.cz - 30, g = gateOf(a), lane = 2.2;
  const columns = [jz - COLUMN_GAP, jz, jz + COLUMN_GAP];
  const front = jx + 9;
  return {
    junction: { x: jx, z: jz }, corridor: [jz - KERB, jz + KERB], front, columns,
    gapIn: jz - COLUMN_GAP / 2, gapOut: jz + COLUMN_GAP / 2, hold: front + 1.2,
    motoDrop: { x: a.cx + 19.5, z: jz - 2.6 }, motoStep: { x: a.cx + 19.5, z: jz - 4.4 },
    southbound: jx - lane, northbound: jx + lane, kerb: jx - 4.3,
    rank: [{ x: jx - 4.3, z: jz - 22 }, { x: jx - 4.3, z: jz - 28.5 }, { x: jx - 4.3, z: jz - 35 }],
    agent: { x: jx, z: jz },
    queueTail: { x: g.queue.x, z: g.queue.z1 - 0.35 }, gateOut: { x: g.x, z: g.queue.z0 - 0.4 },
  };
}

/** Nominal size of the jam's cars (the vehicle kit's: length, width), by look; tests/galaTraffic.test.ts holds them to the kit. */
export const JAM_LOOKS = [
  { kind: 'taxi', l: 4.3, w: 1.7 }, { kind: 'sedan', l: 4.5, w: 1.78 }, { kind: 'suv', l: 4.85, w: 1.94 }, { kind: 'pickup', l: 5.2, w: 1.82 },
] as const;
export type JamKind = (typeof JAM_LOOKS)[number]['kind'];
export const LOOK_OF = (kind: JamKind) => JAM_LOOKS.find(l => l.kind === kind)!;
/** Looks used per quality (each one is an instanced mesh: body and glass, two draw calls). The taxi is always one. */
export const JAM_LOOK_COUNT: Record<Quality, number> = { low: 2, medium: 2, high: 3 };
/** Bumper to bumper in a jam (m). */
export const BUMPER = 1.2;

// ------------------------------------------------------------------ the evening's schedule

/**
 * The approach's arrival jam: it forms some time after the doors (17 h 36 – 18 h 06 on a gala night, about half an
 * hour later on a card) and lasts 1 h 12 – 1 h 42 (a card: 36 – 54 min). The same window for everyone that evening.
 */
export function jamWindow(size: EveningSize, seed: number): [number, number] {
  const a = unit(seed, 1), b = unit(seed, 2);
  if (size === 'gala') { const from = GALA.doors + 0.6 + 0.5 * a; return [from, from + 1.2 + 0.5 * b]; }
  const from = GALA.doors + 1 + 0.5 * a; return [from, from + 0.6 + 0.3 * b];
}
/** A thin queue at the agent from the doors to 21 h (one car or two a column): the traffic of a big evening. */
export const THIN = 0.22;
/** Leaving after the bouts: everybody at once, then fewer until midnight. */
const OUT: readonly [number, number][] = [[0, 0], [LEAVING_FROM, 1], [23.3, 0.6], [23.9, 0]];

export type RoadDir = 'in' | 'out';
/**
 * How thick the approach is now (0–1 of the evening's), arriving or (`after`: the arena's street is in its after-gala
 * window, src/arena/program.ts streetAt, as the exterior and the crowd read it) leaving. Arriving: a thin queue from just
 * before the doors to 21 h, the jam in its window; leaving: everyone at once, fewer until midnight.
 */
export function jamLevel(hour: number, size: EveningSize, seed: number, after: boolean): number {
  const h = wrapH(hour);
  if (!arenaEvening(h)) return 0;
  if (after) return h < LEAVING_FROM ? 0.7 : curve(OUT, h);
  const base = THIN * Math.min(smooth((h - (GALA.doors - 0.25)) / 0.25), smooth((21.5 - h) / 0.5));
  const [from, to] = jamWindow(size, seed), ramp = 0.25;
  return Math.max(base, Math.min(smooth((h - from) / ramp), smooth((to - h) / ramp)));
}
/** Cars per column at the jam's thickest, by graphics quality (three columns). */
export const JAM_DEPTH: Record<Quality, number> = { low: 3, medium: 4, high: 5 };
/** Cars per column for a level: the evening's thickness, times the size of the evening (a card is 40 % of a gala). */
export function jamDepth(level: number, quality: Quality, size: EveningSize): number {
  if (level <= 0.02) return 0;
  return Math.max(1, Math.round(JAM_DEPTH[quality] * level * SIZE_SHARE[size]));
}

/** The traffic agent is at his junction from just before the doors to the end of the evening. */
export const agentOn = (hour: number) => { const h = wrapH(hour); return arenaEvening(h) && h >= GALA.doors - 0.25; };
/**
 * Who goes at the junction (shared clock, seconds): for 16 s the gate's side (moto-taxis, taxis, the people crossing),
 * then for 10 s the jam (its front cars sent round to the north; after the bouts, the parking's cars let into the
 * jam). The same rhythm for everyone: the seed sets where the cycle starts.
 */
export const AGENT_CYCLE = { period: 26, gate: 16 } as const;
export function agentPhase(t: number, seed: number): { go: 'gate' | 'jam'; left: number } {
  const p = AGENT_CYCLE.period, u = cycleTime(t, seed);
  return u < AGENT_CYCLE.gate ? { go: 'gate', left: AGENT_CYCLE.gate - u } : { go: 'jam', left: p - u };
}
/** Seconds into the agent's cycle at t. */
export const cycleTime = (t: number, seed: number) => { const p = AGENT_CYCLE.period; return (((t + unit(seed, 3) * p) % p) + p) % p; };
/**
 * After the bouts the parking's cars come up into the jam only in the first seconds the agent lets the jam's side go:
 * they cross the junction's east lane before the moto-taxis go again.
 */
export const feedOpen = (t: number, seed: number) => { const u = cycleTime(t, seed); return u >= AGENT_CYCLE.gate && u < AGENT_CYCLE.gate + 4; };
/** Seconds between two front cars of a column let through while the jam goes, and how many a column each time. */
export const RELEASE_EVERY = 2.6, RELEASES = 2;
/**
 * When the front car of column `col` goes (shared seconds): twice a column while the jam goes, the columns in turn, the
 * last one more than 5 s before the gate's side goes again (it is round the corner by then).
 */
export function releaseTimes(col: number, seed: number, from: number, to: number): number[] {
  const p = AGENT_CYCLE.period, off = unit(seed, 3) * p, out: number[] = [];
  for (let m = Math.floor((from + off) / p) - 1; m * p - off <= to; m++) {
    for (let k = 0; k < RELEASES; k++) {
      const r = m * p - off + AGENT_CYCLE.gate + 0.6 + 0.6 * col + RELEASE_EVERY * k;
      if (r > from && r <= to) out.push(r);
    }
  }
  return out;
}

/** Moto-taxis on the road at once on a gala night, per quality (a card: 40 %). */
export const GALA_FLOWS: Record<Quality, number> = { low: 3, medium: 5, high: 7 };
export const maxFlows = (quality: Quality, size: EveningSize) => Math.max(1, Math.round(GALA_FLOWS[quality] * SIZE_SHARE[size]));
/** Taxis waiting at the corner's rank after the bouts, per quality (a card: 40 %, at least one). */
export const RANK: Record<Quality, number> = { low: 2, medium: 2, high: 3 };
export const rankTaxis = (quality: Quality, size: EveningSize) => Math.max(1, Math.round(RANK[quality] * SIZE_SHARE[size]));

/** Fans on the rear step of each evening car rapide (with the apprenti), per quality: a gala packs the step. */
export function stepRiders(size: EveningSize, quality: Quality): number {
  if (size === 'gala') return quality === 'low' ? 1 : 2;
  return quality === 'low' ? 0 : 1;
}
/** Where the k-th fan stands on the car rapide's rear step (beside the apprenti, kit frame), holding the bar. */
export function stepSpot(step: { x: number; y: number; z: number }, k: number): { x: number; y: number; z: number; yaw: number } {
  return { x: step.x + 0.55 + 0.48 * k, y: step.y, z: step.z - 0.04 * k, yaw: Math.PI + 0.55 + 0.25 * k };
}

// ------------------------------------------------------------------ horns and the agent's whistle

/** Mean seconds between two horns from the jam (a gala's is more impatient). */
export const HORN_EVERY: Record<EveningSize, number> = { gala: 3.5, card: 9 };
/**
 * Which car of the jam sounds its horn in the one-second slot of shared time `slot` (an index into `cars`), or −1. The same
 * slots for everyone; how often follows the evening and how thick the jam is.
 */
export function hornAt(slot: number, seed: number, size: EveningSize, cars: number, level: number): number {
  if (cars <= 0 || level <= 0.05) return -1;
  const p = Math.min(0.9, level / HORN_EVERY[size]);
  return unit(seed, 2000 + (slot % 50000)) < p ? Math.floor(unit(seed, 3000 + (slot % 50000)) * cars) : -1;
}
/** A car rapide carrying fans toots on its way in, at most once in each 7-second slot: the second of that slot, or −1. */
export const RAPIDE_HORN_SLOT = 7;
export function rapideHorn(slot: number, car: number, seed: number): number {
  const k = 4000 + car * 977 + (slot % 50000);
  return unit(seed, k) < 0.6 ? Math.floor(unit(seed, k + 1) * RAPIDE_HORN_SLOT) : -1;
}
/** Loudness of a horn heard `dist` metres away (silent beyond 70 m). */
export const hornVolume = (dist: number) => (dist >= 70 ? 0 : dist <= 8 ? 1 : (1 - (dist - 8) / 62) ** 2);

// ------------------------------------------------------------------ the jam and who gets through

export interface JamCar { col: number; k: number; kind: JamKind; x: number; z: number; yaw: number; hl: number; hw: number }
/** Look of the n-th car of column `col` that evening (the same for everyone). The taxi is the first look. */
export function jamKind(seed: number, col: number, n: number, quality: Quality): JamKind {
  const looks = JAM_LOOK_COUNT[quality];
  return JAM_LOOKS[Math.floor(unit(seed, 10 + col * 31 + (n % 997) * 7) * looks) % looks].kind;
}
/** Leaving, the jam's front car stands this far east of its tail end (the column reaches back towards the junction). */
export const OUT_SPAN = 34;
/**
 * Where the k-th car of a column stands (k = 0: the front one, let through next). Arriving, the column faces west with
 * its front at `front` and stretches east; leaving, it faces east, its front OUT_SPAN further east, and stretches back
 * west. `lengths`: the lengths of the column's cars from the front.
 */
export function slotX(geo: GalaGeo, dir: RoadDir, lengths: readonly number[], k: number): number {
  let d = 0;
  for (let i = 0; i < k; i++) d += lengths[i] + BUMPER;
  d += lengths[k] / 2;
  return dir === 'in' ? geo.front + d : geo.front + OUT_SPAN - d;
}
/** The whole jam standing at a depth (cars per column), for the checks and the tests. */
export function jamLayout(geo: GalaGeo, depth: number, dir: RoadDir, seed: number, quality: Quality): JamCar[] {
  const out: JamCar[] = [];
  geo.columns.forEach((z, col) => {
    const kinds = Array.from({ length: depth }, (_, k) => jamKind(seed, col, k, quality));
    const lengths = kinds.map(k => LOOK_OF(k).l);
    kinds.forEach((kind, k) => {
      const look = LOOK_OF(kind);
      out.push({ col, k, kind, x: slotX(geo, dir, lengths, k), z, yaw: dir === 'in' ? -Math.PI / 2 : Math.PI / 2, hl: look.l / 2, hw: look.w / 2 });
    });
  });
  return out;
}
/**
 * Straight lines along the road a vehicle of half-width `hw` can follow through the jam: the gaps between the cars'
 * sides (and between the outer cars and the kerbs) wider than the vehicle. A moto (half-width 0.42) finds the two
 * gaps; a car (0.89) none. Drive mode's own test is the same box test (src/transport/ownedModule.ts blocked).
 */
export function filterLanes(cars: readonly { z: number; hw: number }[], corridor: readonly [number, number], hw: number): number[] {
  const iv = cars.map(c => [c.z - c.hw, c.z + c.hw] as [number, number]).sort((a, b) => a[0] - b[0]);
  const out: number[] = [];
  let edge = corridor[0];
  for (const [a, b] of iv) {
    if (a - edge > 2 * hw) out.push((edge + a) / 2);
    edge = Math.max(edge, b);
  }
  if (corridor[1] - edge > 2 * hw) out.push((edge + corridor[1]) / 2);
  return out;
}

// ------------------------------------------------------------------ the routes

/** The jam's front cars, let through: arriving, round to the right and up the north road; leaving, on east and away. */
export function releaseRoute(geo: GalaGeo, dir: RoadDir, z: number, fromX: number): Pt[] {
  const j = geo.junction, n = geo.northbound;
  if (dir === 'out') return [{ x: fromX, z }, { x: EDGE + 8, z }];
  const turn = z - (j.z - 7);                                               // how far south of the north corner it starts
  return [{ x: fromX, z }, { x: geo.front - 1, z }, { x: n + 2.6, z: z - 0.6 - turn * 0.15 }, { x: n + 0.4, z: j.z - 7 - 0.2 * turn }, { x: n, z: j.z - 14 }, { x: n, z: -EDGE - 8 }];
}
/** Cars joining the jam's tail: arriving, from the east edge; leaving, up from the parking along the arena and round the corner. */
export function feedRoute(geo: GalaGeo, dir: RoadDir, z: number, toX: number): Pt[] {
  const j = geo.junction, n = geo.northbound;
  if (dir === 'in') return [{ x: EDGE + 8, z }, { x: toX, z }];
  return [{ x: n, z: j.z + 50 }, { x: n, z: z + 4 }, { x: n + 1.2, z: z + 1.4 }, { x: geo.front - 3, z }, { x: toX, z }];
}
/**
 * The moto-taxis' way: in from the east along the jam's north gap, a wait beside the front cars while the jam goes,
 * through the junction (north of the agent) onto the gate road's north lane, a stop at the drop-off, a U-turn east of
 * the stalls, a wait before the junction while the jam goes, and back out along the south gap. `hold`, `drop`, `wait`:
 * indices of those three points.
 */
export function motoRoute(geo: GalaGeo): { pts: Pt[]; hold: number; drop: number; wait: number } {
  const j = geo.junction, d = geo.motoDrop, back = j.z + 2.0;
  const pts: Pt[] = [
    { x: EDGE + 8, z: geo.gapIn }, { x: geo.hold, z: geo.gapIn }, { x: j.x - 3, z: geo.gapIn }, { x: j.x - 9, z: d.z }, d,
    { x: d.x - 1.8, z: d.z + 0.4 }, { x: d.x - 2.7, z: d.z + 1.6 }, { x: d.x - 2.7, z: back - 1.2 }, { x: d.x - 1.8, z: back }, { x: d.x + 1, z: back },
    { x: j.x - 4, z: back }, { x: j.x + 3, z: geo.gapOut }, { x: geo.hold, z: geo.gapOut }, { x: EDGE + 8, z: geo.gapOut },
  ];
  return { pts, hold: 1, drop: 4, wait: 10 };
}
/** A rank taxi's way: down the north road's southbound lane to its place at the kerb, then on through the junction and south. */
export function rankRoute(geo: GalaGeo, slot: number): { pts: Pt[]; stop: number } {
  const r = geo.rank[slot], s = geo.southbound;
  const pts: Pt[] = [{ x: s, z: -EDGE - 8 }, { x: s, z: r.z - 9 }, { x: r.x + 0.6, z: r.z - 2.5 }, r, { x: r.x + 0.5, z: r.z + 3 }, { x: s, z: r.z + 9 }, { x: s, z: EDGE + 8 }];
  return { pts, stop: 3 };
}
/** The fans' walk from where a moto-taxi drops them to the queue's tail (east of the queue lane, then along its end). */
export const walkToQueue = (geo: GalaGeo): Pt[] => [{ x: geo.queueTail.x + 3.7, z: geo.queueTail.z }, geo.queueTail];
/** The crowd's walk out of the gate to a moto-taxi at the drop-off, or to a rank taxi's door. */
export const walkToMoto = (geo: GalaGeo): Pt[] => [{ x: geo.gateOut.x + 4, z: geo.gateOut.z - 4 }, geo.motoStep];
export function walkToRank(geo: GalaGeo, slot: number): Pt[] {
  const r = geo.rank[slot], c = { x: geo.junction.x - 6.2, z: geo.junction.z - 6.2 };
  return [{ x: geo.gateOut.x + 6, z: geo.gateOut.z - 3 }, { x: c.x - 6, z: geo.junction.z - 5.6 }, c, { x: c.x, z: r.z + 1.6 }, { x: r.x - 1.3, z: r.z + 0.4 }];
}

/** The grid roads the gala's traffic uses (node to node): kept clear of road events and of the decorative traffic. */
export function galaRoads(geo: GalaGeo): [Pt, Pt][] {
  const j = geo.junction;
  return [[j, { x: j.x + 60, z: j.z }], [{ x: j.x, z: j.z - 60 }, j], [j, { x: j.x, z: j.z + 60 }], [{ x: j.x, z: j.z + 60 }, { x: j.x, z: j.z + 120 }]];
}

// ------------------------------------------------------------------ motion along a route

/** Distance covered `t` s after setting off from rest, speeding up at `a` to `v`. */
export const fromRest = (t: number, v: number, a: number) => (t <= 0 ? 0 : t < v / a ? 0.5 * a * t * t : v * v / (2 * a) + v * (t - v / a));
/** Seconds to cover `d` from rest to rest (speeding up at `a` to at most `v`, braking at `a`). */
export function restToRest(d: number, v: number, a: number): number {
  if (d <= 0) return 0;
  return d < v * v / a ? 2 * Math.sqrt(d / a) : d / v + v / a;
}
/** Distance covered after `t` s of a rest-to-rest run of `d` metres (see restToRest). */
export function restToRestAt(d: number, v: number, a: number, t: number): number {
  const T = restToRest(d, v, a);
  if (t <= 0) return 0;
  if (t >= T) return d;
  if (d < v * v / a) { const h = T / 2; return t < h ? 0.5 * a * t * t : d - 0.5 * a * (T - t) ** 2; }
  const ta = v / a;
  return t < ta ? 0.5 * a * t * t : t < T - ta ? v * v / (2 * a) + v * (t - ta) : d - 0.5 * a * (T - t) ** 2;
}
/** Seconds to cover `d` arriving at rest from cruising at `v` (braking at `a` for the last v²/2a metres). */
export const cruiseToRest = (d: number, v: number, a: number) => (d <= v * v / (2 * a) ? Math.sqrt(2 * d / a) : (d - v * v / (2 * a)) / v + v / a);
/** Metres still to go `t` s into a cruise-to-rest run of `d` metres. */
export function cruiseToRestLeft(d: number, v: number, a: number, t: number): number {
  const T = cruiseToRest(d, v, a);
  if (t >= T) return 0;
  const brake = Math.min(T, v / a);
  return T - t <= brake ? 0.5 * a * (T - t) ** 2 : d - v * t;
}

/** An open route to sample (a Path over its points: corners blended, never wrapping past its end). */
export class Route {
  readonly path: Path;
  readonly length: number;
  /** Arc length of each point. */
  readonly at: number[];
  constructor(readonly pts: readonly Pt[]) {
    this.path = new Path(pts, 1.2);
    this.at = pts.map((_, i) => this.path.at(i));
    this.length = this.at[pts.length - 1];
  }
  sample(s: number, out: Pose): Pose { return this.path.sample(Math.max(0, Math.min(this.length - 1e-6, s)), out); }
}

// ------------------------------------------------------------------ the moto-taxis

/** Speeds (m/s), acceleration, and the stop at the drop-off: the fan steps off (arriving) or walks up and gets on (leaving). */
export const MOTO = { cruise: 6.5, gap: 5.5, accel: 2.5, dwell: 2.4, pickup: 6 } as const;
/** Seconds between two moto-taxis setting off (so that about `maxFlows` are on the road at once at the rush). */
export const motoEvery = (quality: Quality, size: EveningSize) => Math.round(48 / maxFlows(quality, size) * 10) / 10;
export interface MotoTrip {
  i: number; start: number; dir: RoadDir;
  /**
   * Arrive at the hold, leave it (the agent lets the gate's side go), arrive at the drop-off, leave it, wait before
   * the junction on the way back (the same), off the map.
   */
  holdIn: number; holdOut: number; dropIn: number; dropOut: number; waitIn: number; waitOut: number; end: number;
}
/** Where a moto-taxi stops on its route (arc lengths of the hold, the drop-off and the wait on the way back). */
export interface MotoStops { holdS: number; dropS: number; waitS: number }
/** Seconds until the gate's side may go at t (0 while it goes), plus a moment to react. */
const gateWait = (t: number, seed: number) => { const ph = agentPhase(t, seed); return ph.go === 'jam' ? ph.left + 0.4 : 0; };
/**
 * The i-th moto-taxi of the evening's lattice (it sets off from the east edge at `i · every + offset`), or null when
 * none rides then (fewer at quiet hours: the arrivals' and departures' curves of src/city/rules.ts, the same draw for
 * everyone). `dirAt(t)`: arriving or leaving at that time (null: no evening).
 */
export function motoTrip(i: number, o: MotoStops & { seed: number; every: number; route: Route; hourAt: (t: number) => number; dirAt: (t: number) => RoadDir | null; size: EveningSize }): MotoTrip | null {
  const start = i * o.every + unit(o.seed, 5) * o.every, dir = o.dirAt(start);
  if (!dir) return null;
  const h = o.hourAt(start), rush = dir === 'in' ? arenaArrivals(h, o.size) / SIZE_SHARE[o.size] : arenaDepartures(h, o.size) / SIZE_SHARE[o.size];
  if (unit(o.seed, 500 + (i % 50000)) >= Math.min(1, 0.15 + rush)) return null;
  const holdIn = start + cruiseToRest(o.holdS, MOTO.gap, MOTO.accel), holdOut = holdIn + gateWait(holdIn, o.seed);
  const dropIn = holdOut + restToRest(o.dropS - o.holdS, MOTO.cruise, MOTO.accel), dropOut = dropIn + (dir === 'in' ? MOTO.dwell : MOTO.pickup);
  const waitIn = dropOut + restToRest(o.waitS - o.dropS, MOTO.cruise, MOTO.accel), waitOut = waitIn + gateWait(waitIn, o.seed);
  const end = waitOut + (o.route.length - o.waitS - MOTO.cruise * MOTO.cruise / (2 * MOTO.accel)) / MOTO.cruise + MOTO.cruise / MOTO.accel;
  return { i, start, dir, holdIn, holdOut, dropIn, dropOut, waitIn, waitOut, end };
}
/** Arc length along the moto route at time t of a trip (null before its start or after its end). */
export function motoS(m: MotoTrip, t: number, o: MotoStops): number | null {
  if (t < m.start || t > m.end) return null;
  if (t < m.holdIn) return o.holdS - cruiseToRestLeft(o.holdS, MOTO.gap, MOTO.accel, t - m.start);
  if (t < m.holdOut) return o.holdS;
  if (t < m.dropIn) return o.holdS + restToRestAt(o.dropS - o.holdS, MOTO.cruise, MOTO.accel, t - m.holdOut);
  if (t < m.dropOut) return o.dropS;
  if (t < m.waitIn) return o.dropS + restToRestAt(o.waitS - o.dropS, MOTO.cruise, MOTO.accel, t - m.dropOut);
  if (t < m.waitOut) return o.waitS;
  return o.waitS + fromRest(t - m.waitOut, MOTO.cruise, MOTO.accel);
}
/** When the fan steps off (arriving) or has got on (leaving), and walks to the queue or has walked up from the gate. */
export const motoHandover = (m: MotoTrip) => (m.dir === 'in' ? m.dropIn + 1 : m.dropOut - 0.8);
/** Carrying a fan at time t: arriving, from the edge to the drop-off; leaving, from the drop-off to the edge. */
export const motoPillion = (m: MotoTrip, t: number) => (m.dir === 'in' ? t < motoHandover(m) : t >= motoHandover(m));

// ------------------------------------------------------------------ the rank taxis (after the bouts)

export const RANK_CYCLE = 34;
export const TAXI = { cruise: 7.5, accel: 2.2, wait: 13 } as const;
export interface RankVisit { slot: number; n: number; start: number; arrive: number; leave: number; end: number }
/**
 * The n-th taxi to come to rank place `slot` (it sets off from the north edge at `n · RANK_CYCLE + offset`), or null when
 * none comes then (only while the street is leaving). It waits for its fans, and leaves as the agent lets the jam's side
 * go (it goes south through the junction's west lane beside the cars coming up to the jam, never across the moto-taxis).
 */
export function rankVisit(slot: number, n: number, o: { seed: number; route: Route; stopS: number; leaving: (t: number) => boolean }): RankVisit | null {
  const start = n * RANK_CYCLE + (unit(o.seed, 7 + slot) + slot / 3) * RANK_CYCLE;
  if (!o.leaving(start)) return null;
  const arrive = start + cruiseToRest(o.stopS, TAXI.cruise, TAXI.accel);
  const ready = arrive + TAXI.wait, ph = agentPhase(ready, o.seed), jamFor = AGENT_CYCLE.period - AGENT_CYCLE.gate;
  const leave = ready + (ph.go === 'gate' ? ph.left : ph.left > jamFor - 1 ? 0 : ph.left + AGENT_CYCLE.gate);
  const end = leave + 2 * Math.sqrt((o.route.length - o.stopS) / TAXI.accel) + 30;
  return { slot, n, start, arrive, leave, end };
}
/** Arc length of a rank taxi along its route at time t (null outside its visit). */
export function rankS(v: RankVisit, t: number, stopS: number, length: number): number | null {
  if (t < v.start || t > v.end) return null;
  if (t < v.arrive) return stopS - cruiseToRestLeft(stopS, TAXI.cruise, TAXI.accel, t - v.start);
  if (t < v.leave) return stopS;
  const s = stopS + fromRest(t - v.leave, TAXI.cruise, TAXI.accel);
  return s >= length ? null : s;
}

// ------------------------------------------------------------------ the jam over time

/** A car of a column: when it joined its tail, came to a stop there, and was let through (Infinity: still there). */
export interface JamRec { col: number; n: number; kind: JamKind; l: number; join: number; arrive: number; release: number; joinX: number }
/** A car of the jam now: standing or creeping in its column, coming to its tail, or let through and on its way. */
export interface JamNow extends JamCar { state: 'come' | 'queue' | 'away'; n: number; v: number }
export const JAM_MOVE = { cruise: 8, accel: 2.5, brake: 3.2, creep: 2.0 } as const;

/**
 * The jam of one evening as it happens: each column's cars join its tail (one a second at most, while the column is
 * shorter than the jam's depth then), drive in and stop there, and are let through at its front at the agent's times
 * (`releaseTimes`) once they stand there. Pure and deterministic: events fall on whole seconds and on the release times
 * of the shared clock, whatever the frames, so every device that advances it to the same time has the same cars at the
 * same places.
 */
export class JamTimeline {
  readonly cols: JamRec[][];
  private t: number;
  private count: number[];
  private next: number[];
  private routes = new Map<string, Route>();
  constructor(readonly geo: GalaGeo, readonly dir: RoadDir, readonly seed: number, readonly quality: Quality, readonly since: number, private depthAt: (t: number) => number) {
    this.cols = geo.columns.map(() => []);
    this.count = geo.columns.map(() => 0);
    this.next = geo.columns.map(() => 0);
    this.t = since;
  }
  /** Time the timeline has reached. */
  get now() { return this.t; }
  /** Cars of column c at time t that have joined and are not let through yet (front first; the last ones may still be coming). */
  queue(c: number, t = this.t) { return this.cols[c].filter(r => r.join <= t && r.release > t); }

  /** Run the events up to t (t only grows; a step back is ignored). */
  advance(t: number) {
    if (t <= this.t) return;
    const from = this.t;
    this.geo.columns.forEach((_, c) => {
      const rel = releaseTimes(c, this.seed, from, t);
      let ri = 0;
      for (let s = Math.floor(from) + 1; s <= Math.floor(t) + 1; s++) {
        while (ri < rel.length && rel[ri] < s) this.release(c, rel[ri++]);
        if (s <= t) this.join(c, s);
      }
      while (ri < rel.length) this.release(c, rel[ri++]);
    });
    this.t = t;
    // keep what still shows: a car let through is out of sight within a minute
    this.cols.forEach((col, c) => {
      let k = col.findIndex(r => r.release > t - 60);
      if (k < 0) k = col.length;
      for (const r of col.slice(0, k)) { this.routes.delete(this.key('rel', c, r.n)); this.routes.delete(this.key('feed', c, r.n)); }
      if (k > 0) col.splice(0, k);
    });
  }
  /** The front car goes, if it stands at the front by then (one still driving in waits for the next time). */
  private release(c: number, at: number) {
    const q = this.cols[c].find(r => r.release === Infinity);
    if (q && q.arrive <= at) { q.release = at; this.count[c]--; }
  }
  private join(c: number, at: number) {
    if (this.count[c] >= this.depthAt(at) || (this.dir === 'out' && !feedOpen(at, this.seed))) return;
    const col = this.cols[c], n = this.next[c]++, kind = jamKind(this.seed, c, n, this.quality), l = LOOK_OF(kind).l;
    const lengths = [...col.filter(r => r.release === Infinity).map(r => r.l), l];
    const joinX = slotX(this.geo, this.dir, lengths, lengths.length - 1);
    const feed = this.route(this.key('feed', c, n), () => feedRoute(this.geo, this.dir, this.geo.columns[c], joinX));
    col.push({ col: c, n, kind, l, join: at, arrive: at + cruiseToRest(feed.length, JAM_MOVE.cruise, JAM_MOVE.brake), release: Infinity, joinX });
    this.count[c]++;
  }

  private key(what: 'rel' | 'feed', c: number, n: number) { return what + ':' + c + ':' + n; }
  private route(key: string, pts: () => Pt[]) { let r = this.routes.get(key); if (!r) { r = new Route(pts()); this.routes.set(key, r); } return r; }

  /** Every car of the jam at time t (≥ the last advance): where it is, which way it faces, standing, coming or away. */
  at(t: number): JamNow[] {
    const out: JamNow[] = [], dir = this.dir, yaw0 = dir === 'in' ? -Math.PI / 2 : Math.PI / 2, P: Pose = { x: 0, z: 0, yaw: 0 };
    this.geo.columns.forEach((z, c) => {
      const recs = this.cols[c], places = this.places(c, t);
      let k = -1;
      for (const r of recs) {
        if (r.join > t) continue;
        const look = LOOK_OF(r.kind), base = { col: c, k: 0, kind: r.kind, z, yaw: yaw0, hl: look.l / 2, hw: look.w / 2, n: r.n };
        if (r.release <= t) {                                                  // let through: on its way round the corner
          const route = this.route(this.key('rel', c, r.n), () => releaseRoute(this.geo, dir, z, this.slotAt(c, r, r.release)));
          const s = fromRest(t - r.release, JAM_MOVE.cruise, JAM_MOVE.accel);
          if (s >= route.length - 0.5) continue;
          route.sample(s, P);
          out.push({ ...base, x: P.x, z: P.z, yaw: P.yaw, state: 'away', v: Math.min(JAM_MOVE.cruise, JAM_MOVE.accel * (t - r.release)) });
          continue;
        }
        const x = places.get(r.n)!; k++;
        if (t < r.arrive) {                                                    // coming: braking into its place
          const feed = this.route(this.key('feed', c, r.n), () => feedRoute(this.geo, dir, z, r.joinX));
          const left = cruiseToRestLeft(feed.length, JAM_MOVE.cruise, JAM_MOVE.brake, t - r.join);
          const pts = feed.pts, corner = pts[pts.length - 2], along = Math.abs(r.joinX - corner.x);
          const v = Math.min(JAM_MOVE.cruise, Math.sqrt(2 * JAM_MOVE.brake * left));
          if (left <= along) {                                                 // along the column, to where its place is now
            const u = along > 0 ? 1 - left / along : 1;
            out.push({ ...base, k, x: corner.x + u * (x - corner.x), state: 'come', v });
          } else { feed.sample(feed.length - left, P); out.push({ ...base, k, x: P.x, z: P.z, yaw: P.yaw, state: 'come', v }); }
          continue;
        }
        out.push({ ...base, k, x, state: 'queue', v: 0 });
      }
    });
    return out;
  }
  /** `slotAt` for every car of column c standing or coming at time t, in one pass (by serial). */
  private places(c: number, t: number): Map<number, number> {
    const recs = this.cols[c], out = new Map<number, number>(), sgn = this.dir === 'in' ? 1 : -1, head = this.dir === 'in' ? this.geo.front : this.geo.front + OUT_SPAN;
    let last: JamRec | null = null, d = 0;
    for (const r of recs) if (r.release <= t && r.release > t - JAM_MOVE.creep) last = r;
    for (const r of recs) {
      if (r.join > t || r.release <= t) continue;
      const now = head + sgn * (d + r.l / 2);
      d += r.l + BUMPER;
      // the cars let through are all ahead of those still there: the last one's place closes up behind it
      if (!last || last.n > r.n) { out.set(r.n, now); continue; }
      const was = now + sgn * (last.l + BUMPER);
      out.set(r.n, was + (now - was) * smooth((t - last.release) / JAM_MOVE.creep));
    }
    return out;
  }
  /**
   * x of a standing car at time t: its place behind the cars still in front of it, creeping up from the place it had
   * before the last car ahead of it was let through (JAM_MOVE.creep seconds to close the gap).
   */
  private slotAt(c: number, r: JamRec, t: number): number {
    const recs = this.cols[c];
    const ahead = recs.filter(x => x.n < r.n && x.join <= t && x.release > t);
    const now = slotX(this.geo, this.dir, [...ahead.map(x => x.l), r.l], ahead.length);
    const last = recs.filter(x => x.n < r.n && x.release <= t && x.release > t - JAM_MOVE.creep).pop();
    if (!last) return now;
    const before = recs.filter(x => x.n < r.n && x.join <= t && (x.release > t || x === last));
    const was = slotX(this.geo, this.dir, [...before.map(x => x.l), r.l], before.length);
    return was + (now - was) * smooth((t - last.release) / JAM_MOVE.creep);
  }
}
