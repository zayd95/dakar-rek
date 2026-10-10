/**
 * The road to the arena on a fight evening, as rules (pure, unit-tested in tests/galaTraffic.test.ts; drawn by
 * src/city/galaTraffic.ts and src/city/arena.ts). From the doors the approach roads thicken: a jam forms on the road that
 * comes in from the east to the junction at the arena block's north-east corner, where a traffic agent waves one way
 * through, then the other. Moto-taxis filter through the jam between the cars — a car cannot, the gaps are narrower
 * than a car — and drop their fans at a drop-off a few steps from the queue's tail. After the bouts the flow turns
 * round: the cars leave in a jam the other way, taxis wait at the gate. A weekday card is the same evening at 40 %.
 *
 * Everything is a function of the arena's place, the shared clock and a seed of the hub and the city day
 * (`galaSeed`, a sibling of the bout's seed), so every player sees the same evening.
 */
import { GALA, boutSeed } from '../arena/program';
import { gateOf } from '../arena/exteriorRules';
import { arenaEvening } from '../transport/lines';
import { LEAVING_FROM, SIZE_SHARE, curve, type EveningSize } from './rules';

export type Quality = 'low' | 'medium' | 'high';
export interface Pt { x: number; z: number }

/** Seed of the gala road of a hub on a city day (the same for everyone; a sibling of the bout's seed). */
export const galaSeed = (hub: string, day: number) => boutSeed(`${hub}:road`, Math.floor(day));
const frac = (x: number) => x - Math.floor(x);
/** k-th number in [0, 1) of a seed. */
export const unit = (seed: number, k: number) => frac(Math.sin((seed % 100003) * 0.0137 + k * 12.9898) * 43758.5453);

// ------------------------------------------------------------------ the place

/** Where a map edge road leaves the hub (the hub ends at ±130 m; roads run on past it). */
export const EDGE = 136;

/**
 * The geometry of the gala road round an arena centred on (cx, cz), on the hub's 60 m road grid: the arena block's
 * north-east junction, the east approach where the jam stands (four columns of cars, the whole width of the road and
 * its pavements, leaving gaps a moto fits through and a car does not), the moto-taxis' drop-off and the taxis' rank at
 * the gate (both on the road in front of the gate, closed to ordinary traffic), the agent's corner.
 */
export interface GalaGeo {
  junction: Pt;
  /** Centre line of the east approach (z), and its half width with the pavements (the jam fills it). */
  roadZ: number; halfWidth: number;
  /** x of the jam's front line, just east of the junction. */
  front: number;
  /** z of the four columns of the jam (north to south). */
  columns: readonly number[];
  /** Lines the moto-taxis ride through the jam: in along the centre gap (westbound), out along the south gap. */
  gapIn: number; gapOut: number;
  /** The moto-taxis' drop-off (the pillion steps off on the north side, `step`) and their way back. */
  motoDrop: Pt; motoStep: Pt;
  /** The gate's taxi rank after the bouts (eastbound lane, west of the stalls). */
  rank: Pt;
  /** The traffic agent's corner (north-west corner of the junction), facing the jam. */
  agent: Pt & { yaw: number };
  /** Tail of the queue at the gate (where the fans go). */
  queueTail: Pt;
}
export function galaGeo(a: { cx: number; cz: number }): GalaGeo {
  const jx = a.cx + 30, jz = a.cz - 30, g = gateOf(a);
  const columns = [jz - 4.6, jz - 1.55, jz + 1.55, jz + 4.6];
  return {
    junction: { x: jx, z: jz }, roadZ: jz, halfWidth: 7,
    front: jx + 6.5, columns,
    gapIn: jz, gapOut: (columns[2] + columns[3]) / 2,
    motoDrop: { x: a.cx + 10, z: jz - 2.4 }, motoStep: { x: a.cx + 10, z: jz - 4.2 },
    rank: { x: a.cx - 19, z: jz + 2 },
    agent: { x: jx - 4.5, z: jz - 6.5, yaw: Math.PI / 2 },
    queueTail: { x: g.queue.x, z: g.queue.z1 - 0.35 },
  };
}

/** Nominal size of the jam's cars (the vehicle kit's: length, width), by look. */
export const JAM_LOOKS = [
  { kind: 'taxi', l: 4.3, w: 1.7 }, { kind: 'sedan', l: 4.5, w: 1.78 }, { kind: 'suv', l: 4.85, w: 1.94 }, { kind: 'pickup', l: 5.2, w: 1.82 },
] as const;
export type JamKind = (typeof JAM_LOOKS)[number]['kind'];
/** Looks used per quality (each one is an instanced mesh: one draw call). */
export const JAM_LOOK_COUNT: Record<Quality, number> = { low: 2, medium: 3, high: 4 };
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
const smooth = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };
/** Leaving after the bouts: everybody at once, then fewer until midnight. */
const OUT: readonly [number, number][] = [[0, 0], [LEAVING_FROM, 1], [23.3, 0.6], [23.9, 0]];

export type RoadDir = 'in' | 'out';
/**
 * The jam now: which way it faces (arriving, or leaving after the bouts) and how thick it is (0–1 of the evening's).
 * `after`: the arena's street is in its after-gala window (src/arena/program.ts streetAt, as the exterior and the crowd
 * read it): the flow turns round. Before the bouts end everyone is arriving.
 */
export function jamLevel(hour: number, size: EveningSize, seed: number, after: boolean): { dir: RoadDir | null; level: number } {
  const h = ((hour % 24) + 24) % 24;
  if (!arenaEvening(h)) return { dir: null, level: 0 };
  if (after) return { dir: 'out', level: h < LEAVING_FROM ? 0.7 : curve(OUT, h) };
  const [from, to] = jamWindow(size, seed), ramp = 0.25;
  return { dir: 'in', level: Math.min(smooth((h - from) / ramp), smooth((to - h) / ramp)) };
}
/** Cars per column at the jam's thickest, by graphics quality (four columns). */
export const JAM_DEPTH: Record<Quality, number> = { low: 3, medium: 4, high: 5 };
/** Cars per column now: the evening's thickness, times the size of the evening (a card is 40 % of a gala). */
export function jamDepth(level: number, quality: Quality, size: EveningSize): number {
  if (level <= 0.02) return 0;
  return Math.max(1, Math.round(JAM_DEPTH[quality] * level * SIZE_SHARE[size]));
}

/** The traffic agent is at his corner from just before the doors to the end of the evening. */
export const agentOn = (hour: number) => { const h = ((hour % 24) + 24) % 24; return arenaEvening(h) && h >= GALA.doors - 0.25; };
/**
 * Who goes at the junction (shared clock, seconds): for 16 s the gate's traffic (moto-taxis to the drop-off, fans
 * crossing, the taxis), then for 10 s the jam (its front cars turn down to the parking along the arena). The same
 * rhythm for everyone (the seed sets where the cycle starts).
 */
export const AGENT_CYCLE = { period: 26, gate: 16 } as const;
export function agentPhase(t: number, seed: number): { go: 'gate' | 'jam'; left: number } {
  const p = AGENT_CYCLE.period, u = (((t + unit(seed, 3) * p) % p) + p) % p;
  return u < AGENT_CYCLE.gate ? { go: 'gate', left: AGENT_CYCLE.gate - u } : { go: 'jam', left: p - u };
}
/** Seconds between two front cars let through while the jam goes. */
export const RELEASE_EVERY = 2.6;

/** Taxis and moto-taxis at once on the arena's roads, per quality, on a gala night (a card: 40 %). */
export const GALA_FLOWS: Record<Quality, number> = { low: 3, medium: 5, high: 7 };
export const maxFlows = (quality: Quality, size: EveningSize) => Math.max(1, Math.round(GALA_FLOWS[quality] * SIZE_SHARE[size]));

/** Fans on the rear step of each evening car rapide (with the apprenti), per quality: a gala packs the step. */
export function stepRiders(size: EveningSize, quality: Quality): number {
  if (size === 'gala') return quality === 'low' ? 1 : 2;
  return quality === 'low' ? 0 : 1;
}

/** Seconds between two horns from the jam (a gala's is louder and more impatient), and a car rapide's cool-down. */
export const HORN_EVERY: Record<EveningSize, [number, number]> = { gala: [2.5, 6], card: [7, 14] };
export const RAPIDE_HORN_COOLDOWN = 7;
/** Loudness of a horn heard `dist` metres away (silent beyond 70 m). */
export const hornVolume = (dist: number) => (dist >= 70 ? 0 : dist <= 8 ? 1 : (1 - (dist - 8) / 62) ** 2);

// ------------------------------------------------------------------ the jam's layout and who gets through

export interface JamCar { col: number; k: number; kind: JamKind; x: number; z: number; yaw: number; hl: number; hw: number }
/** Look of the k-th car of column `col` (the same for everyone that evening). */
export function jamKind(seed: number, col: number, k: number, quality: Quality): JamKind {
  const n = JAM_LOOK_COUNT[quality];
  return JAM_LOOKS[Math.floor(unit(seed, 10 + col * 31 + k * 7) * n) % n].kind;
}
/** Leaving, the jam's front car stands this far east of the junction (the column reaches back to the junction). */
export const OUT_SPAN = 34;
/**
 * Where the k-th car of a column stands (k = 0: the front one, let through next). Arriving, the column faces west with
 * its front at the junction and stretches east; leaving, it faces east, its front OUT_SPAN east of the junction, and
 * stretches back west towards it. `lengths`: the lengths of the column's cars from the front.
 */
export function slotX(geo: GalaGeo, dir: RoadDir, lengths: readonly number[], k: number): number {
  let d = 0;
  for (let i = 0; i < k; i++) d += lengths[i] + BUMPER;
  d += lengths[k] / 2;
  return dir === 'in' ? geo.front + d : geo.front + OUT_SPAN - d;
}
/** The whole jam at a depth (cars per column), for the checks and the tests. */
export function jamLayout(geo: GalaGeo, depth: number, dir: RoadDir, seed: number, quality: Quality): JamCar[] {
  const out: JamCar[] = [];
  geo.columns.forEach((z, col) => {
    const kinds = Array.from({ length: depth }, (_, k) => jamKind(seed, col, k, quality));
    const lengths = kinds.map(k => JAM_LOOKS.find(l => l.kind === k)!.l);
    kinds.forEach((kind, k) => {
      const look = JAM_LOOKS.find(l => l.kind === kind)!;
      out.push({ col, k, kind, x: slotX(geo, dir, lengths, k), z, yaw: dir === 'in' ? -Math.PI / 2 : Math.PI / 2, hl: look.l / 2, hw: look.w / 2 });
    });
  });
  return out;
}
/**
 * Straight lines along the road a vehicle of half-width `hw` can follow through the jam: the gaps between the cars'
 * sides (and between the outer cars and the edge of the pavements) wider than the vehicle. A moto (half-width 0.42)
 * finds several; a car (0.89) none. The vehicle's own collision test is the same box test (src/transport/drive.ts).
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

// ------------------------------------------------------------------ the routes of the gala's own traffic

/**
 * The moto-taxis' way: in from the east along the jam's centre gap, through the junction onto the road in front of the
 * gate (its north lane), a stop at the drop-off, a U-turn, and out along the jam's south gap. `drop`: index of the
 * drop-off point; `hold`: index of the point before the junction where they wait while the jam goes.
 */
export function motoRoute(geo: GalaGeo): { pts: Pt[]; drop: number; hold: number } {
  const j = geo.junction, d = geo.motoDrop, zr = d.z + 4.0;   // the way back, clear of the stalls on the south side
  const pts: Pt[] = [
    { x: EDGE, z: geo.gapIn }, { x: geo.front + 1, z: geo.gapIn }, { x: j.x, z: geo.gapIn - 1.2 }, { x: j.x - 8, z: d.z }, d,
    { x: d.x - 2.2, z: d.z + 0.4 }, { x: d.x - 3.3, z: d.z + 1.6 }, { x: d.x - 3.3, z: d.z + 2.8 }, { x: d.x - 2.2, z: zr - 0.2 }, { x: d.x, z: zr },
    { x: j.x - 4, z: zr }, { x: j.x + 1, z: geo.gapOut }, { x: geo.front + 1, z: geo.gapOut }, { x: EDGE, z: geo.gapOut },
  ];
  return { pts, drop: 4, hold: 1 };
}
/**
 * The taxis that wait at the gate after the bouts: along the road from the west (its eastbound lane) past the junction
 * at the arena's north-west corner, a stop at the rank, a U-turn, back to that junction and down the arena's west side.
 */
export function rankRoute(geo: GalaGeo, wx: number): { pts: Pt[]; rank: number } {
  const r = geo.rank, zb = r.z - 4.4, xw = wx - 2;                 // wx: the west junction's x (road centre)
  const pts: Pt[] = [
    { x: -EDGE, z: r.z }, { x: xw - 6, z: r.z }, r,
    { x: r.x + 2.4, z: r.z - 0.5 }, { x: r.x + 3.5, z: r.z - 2.2 }, { x: r.x + 2.4, z: zb + 0.5 }, { x: r.x, z: zb },
    { x: wx + 4, z: zb }, { x: xw + 0.4, z: zb + 3 }, { x: xw, z: zb + 9 }, { x: xw, z: EDGE },
  ];
  return { pts, rank: 2 };
}
/** The jam's cars let through turn left at the junction down the arena's east side (to the parking); leaving, east. */
export function releaseRoute(geo: GalaGeo, dir: RoadDir, z: number, fromX: number): Pt[] {
  const j = geo.junction;
  if (dir === 'out') return [{ x: fromX, z }, { x: EDGE + 6, z }];
  const lane = j.x - 2.2;
  return [{ x: fromX, z }, { x: j.x + 3.5, z }, { x: lane + 1.2, z: z + 2.4 }, { x: lane, z: Math.max(z + 6, j.z + 8) }, { x: lane, z: EDGE + 6 }];
}
/** Cars joining the jam's tail: arriving, from the east edge; leaving, up from the parking and round the corner. */
export function feedRoute(geo: GalaGeo, dir: RoadDir, z: number, toX: number): Pt[] {
  const j = geo.junction;
  if (dir === 'in') return [{ x: EDGE + 6, z }, { x: toX, z }];
  const lane = j.x + 2.2;
  return [{ x: lane, z: j.z + 40 }, { x: lane, z: j.z + 6 }, { x: lane + 1.6, z: z + 1.2 }, { x: j.x + 6, z }, { x: toX, z }];
}

/** Where the arena's gala traffic must keep clear of road events (roads in grid-node pairs): the east approach. */
export const galaEdges = (geo: GalaGeo): [Pt, Pt][] => [[geo.junction, { x: geo.junction.x + 60, z: geo.junction.z }]];

export const LOOK_OF = (kind: JamKind) => JAM_LOOKS.find(l => l.kind === kind)!;
export const GALA_SIZE = SIZE_SHARE;
