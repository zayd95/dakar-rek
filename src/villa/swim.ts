import type { GameCtx } from '../game/modules';
import { SIT_HIPS, type Seat } from '../interact/seats';
import type { Affordance, Target } from '../interact/types';
import type { Clip } from '../actors/humanoid';
import { CLIMB_HANDS, SWIM_WATERLINE, strokeSurge } from '../actors/swimStroke';
import { daylight } from '../core/clock';
import { POOL, type Box } from '../housing/villa';
import { inBand, type Collider } from '../world/types';
import type { VillaHold } from './gate';
import { SwimWater } from './swimWater';
import type * as THREE from 'three';

/**
 * LD2.0-D lane V-E, the swim in the villa's pool; round 2, lane R2-W (docs/ld2/LD2_D.md, « Round 2 », decision 2: the owner's « the swimming is not
 * smooth and animated at all I want freedom to move and swim »). The basin is the interior's (src/housing/apartment.ts drawPool: a mosaic basin, steps
 * down at its west end); the swim reads the contract's numbers (src/housing/villa.ts POOL): the interior's level 0 stands at the home's origin
 * (src/economy/placement.ts homeOrigin), a plan point (x, z) at origin + (x, 0.1, z).
 *
 *  - In: walking down the steps at the west end takes the player into the water (a push of the stick toward the pool at the steps' head); « Se
 *    baigner » at any other edge, on the deck, walks to the edge and slips in (0.55 s, a splash), from where the player stands: no jump.
 *  - In the water the stick (or the keys) swims anywhere in the basin beyond the steps (SWIM_AREA), at about SWIM_PACE, SWIM_FULL pushed to the rim:
 *    the swimmer turns smoothly to where the stick points and the stroke carries them along their heading, surging after each kick; the stick at rest,
 *    they drift to a stop and tread water, upright, the head and shoulders out. The body's footprint (the hands ahead in the glide, the feet behind,
 *    the sculling hands either side) is held inside the basin's walls (`holdIn`).
 *  - The animation is the rig's (src/actors/swimStroke.ts): a heads-up breaststroke ('Swim', its pace following the speed: STROKE_LENGTH a cycle) and
 *    treading water ('Tread'), cross-faded (SWIM_FADE) as the swimmer sets off and stops; the body level with the water swimming, upright treading.
 *  - Ripples round the body, a wake of rings left behind while swimming, a splash going in, drips coming out (src/villa/swimWater.ts: two draw calls).
 *  - Out: « Sortir de l'eau » at any time: within CLIMB_REACH of a wall the swimmer turns to it and climbs out onto the deck (hands on the coping, a
 *    knee up, standing: about a second); farther, they swim to the nearest wall first; by the steps, they walk up them. Swimming into the steps walks
 *    up them too. No timer takes the player out any more.
 *  - Hygiene and moral up, in proportion to the time in the water (a swim of SWIM_SECONDS or more: +22 hygiene, +15 moral; a dip still a quarter).
 * Who may swim: the villa's owner or renter, in their own villa (`maySwim`). The rules are pure (tests/villaLife.test.ts); `VillaSwim` runs them in the
 * game (src/villa/module.ts): the player sits on a locked seat that the swim moves every frame (main.ts places a seated player from their seat), its
 * clip the swim's, so main.ts's own walking is untouched.
 */
export const SWIM_SECONDS = 22;
export const SWIM_GAINS = { hygiene: 22, moral: 15, energie: -4 } as const;
/** The water's surface (interior y): a hand under the deck, whose top is the ground floor's, 0.1 (src/housing/apartment.ts Y0 and drawPool). */
export const DECK_Y = 0.1, WATER_Y = DECK_Y - 0.12, COPING_Y = DECK_Y + 0.025;
/** How far from the pool the deck offers the swim (m, from the water's rectangle, outside it). */
export const EDGE_REACH = 1.4;
/** The steps down at the west end (src/housing/apartment.ts drawPool): three treads of STEP_RUN, STEP_RISE apart, across the basin less 0.5 m a side. */
export const STEP_RUN = 0.4, STEP_RISE = 0.35;
export const STEPS: Box = { x0: POOL.x0, x1: POOL.x0 + 3 * STEP_RUN, z0: POOL.z0 + 0.5, z1: POOL.z1 - 0.5 };
/** The water the swimmer swims in: the basin beyond the steps (the pool's floor, 1.4 m down). */
export const SWIM_AREA: Box = { x0: STEPS.x1, x1: POOL.x1, z0: POOL.z0, z1: POOL.z1 };
/** The swimming pace (m/s): the stick pushed three quarters (or the keys), and pushed to the rim (or the keys with Shift). */
export const SWIM_PACE = 1.0, SWIM_FULL = 1.35;
/** The stick's dead zone, and the slowest stroke past it (m/s). */
export const STICK_DEAD = 0.12, SWIM_SLOW = 0.55;
/** At most this fast the swimmer turns (rad/s); how quickly the speed follows the stick (s), and how slowly it drifts to a stop with the stick at rest. */
export const TURN_RATE = 2.4, ACCEL_T = 0.55, DRIFT_T = 0.9;
/** Under this speed (m/s), the stick at rest, the swimmer treads water. How long the body takes to lie down into the stroke or come upright (s). */
export const TREAD_BELOW = 0.3, LEAN_T = 0.35;
/** One breaststroke cycle carries the swimmer this far (m): the stroke's pace is the speed over it (cycles a second), within STROKE_RATE. */
export const STROKE_LENGTH = 1.1, STROKE_RATE = { min: 0.5, max: 1.25 } as const, TREAD_RATE = 0.62;
/** The cross-fade between the swim's clips (s). */
export const SWIM_FADE = 0.4;
/**
 * « Sortir de l'eau » climbs out over a wall when the body's footprint comes within CLIMB_GAP of it (the hands of a body swimming at it touch it
 * first) or its origin within CLIMB_REACH; farther, the swimmer swims to it first.
 */
export const CLIMB_REACH = 1.05, CLIMB_GAP = 0.45;
/** Where a swimmer climbing out stands on the deck: this far out of the water (m: the body's radius indoors is 0.3, src/main.ts). */
export const DECK_OUT = 0.5;

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** Distance (m) from a plan point to the pool's rectangle (0 inside it). */
export function poolDistance(px: number, pz: number): number {
  const dx = Math.max(POOL.x0 - px, 0, px - POOL.x1), dz = Math.max(POOL.z0 - pz, 0, pz - POOL.z1);
  return Math.hypot(dx, dz);
}
/** At the edge, on the deck: out of the water and within reach of it. */
export const atEdge = (px: number, pz: number) => { const d = poolDistance(px, pz); return d > 0 && d <= EDGE_REACH; };
/** Who may swim: the villa's owner or renter, in their own villa (a guest or a visit of the empty house does not). */
export const maySwim = (hold: VillaHold, own: boolean) => own && (hold === 'owned' || hold === 'rented');

// ------------------------------------------------------------------------------------------------ the swimmer
/**
 * The body's room in the water (m, from its origin), measured on the rig's poses (src/actors/swimStroke.ts): half its width (treading, the sculling
 * hands; swimming, the hands' outsweep and the kick, a hand's breadth into a wall at most), how far it reaches ahead (the hands in front; in the
 * glide the fingertips 1.37 m ahead) and behind (the feet, a metre back swimming). `lean`: 0 upright treading … 1 level swimming.
 */
export function footprint(lean: number) { return { side: 0.75 - 0.25 * lean, ahead: 0.55 + 0.75 * lean, behind: 0.35 + 0.65 * lean }; }
/** The plan rectangle round the footprint of a body at (x, z) heading `yaw` (0 faces +z). */
export function bodyBox(x: number, z: number, yaw: number, lean: number): Box {
  const f = footprint(lean), fx = Math.sin(yaw), fz = Math.cos(yaw);
  const ax = Math.abs(fx), az = Math.abs(fz);
  // the four corners of the rotated rectangle: along the heading `ahead` / −`behind`, across it ±`side`
  const ex = (a: number) => fx * a, ez = (a: number) => fz * a;
  const sx = az * f.side, sz = ax * f.side;
  return {
    x0: x + Math.min(ex(f.ahead), ex(-f.behind)) - sx, x1: x + Math.max(ex(f.ahead), ex(-f.behind)) + sx,
    z0: z + Math.min(ez(f.ahead), ez(-f.behind)) - sz, z1: z + Math.max(ez(f.ahead), ez(-f.behind)) + sz,
  };
}
export interface Swimmer { x: number; z: number; yaw: number; vx: number; vz: number; lean: number; mode: 'swim' | 'tread' }
/** Holds the body's footprint inside `area`: its origin moved in where the footprint would cross a wall. Which way it was held on each axis (−1, 0, 1). */
export function holdIn(s: Pick<Swimmer, 'x' | 'z' | 'yaw' | 'lean'>, area: Box = SWIM_AREA): { x: number; z: number } {
  const b = bodyBox(0, 0, s.yaw, s.lean);
  const held = { x: 0, z: 0 };
  const xs = [area.x0 - b.x0, area.x1 - b.x1], zs = [area.z0 - b.z0, area.z1 - b.z1];
  const fit = (v: number, [lo, hi]: number[]) => (lo > hi ? [(lo + hi) / 2, v < (lo + hi) / 2 ? -1 : 1] : v < lo ? [lo, -1] : v > hi ? [hi, 1] : [v, 0]);
  [s.x, held.x] = fit(s.x, xs); [s.z, held.z] = fit(s.z, zs);
  return held;
}
/**
 * The pace (m/s) for a push of the phone's stick (0…1): nothing in its dead zone, SWIM_SLOW just past it, SWIM_PACE at three quarters, SWIM_FULL
 * at the rim. At the keyboard (`keyed`): SWIM_PACE, SWIM_FULL with Shift.
 */
export function swimPace(push: number, keyed = false, shift = false): number {
  if (keyed) return push > STICK_DEAD ? (shift ? SWIM_FULL : SWIM_PACE) : 0;
  if (push < STICK_DEAD) return 0;
  if (push <= 0.75) return SWIM_SLOW + ((SWIM_PACE - SWIM_SLOW) * (push - STICK_DEAD)) / (0.75 - STICK_DEAD);
  return SWIM_PACE + (SWIM_FULL - SWIM_PACE) * Math.min(1, (push - 0.75) / 0.2);
}
/** The stroke's pace (cycles a second, the clip's rate) at a swimming speed (m/s). */
export const strokeRate = (speed: number) => clamp(speed / STROKE_LENGTH, STROKE_RATE.min, STROKE_RATE.max);
/**
 * One step of the free swim. (dx, dz): where the stick points in the plan (any length; 0: at rest), `pace` the speed it asks for. The swimmer turns
 * toward it (smoothly, at most TURN_RATE) and the stroke carries them along their heading (less while still turned away), the speed following in
 * ACCEL_T; at rest they drift to a stop in DRIFT_T and tread water once slow. `surge` (src/actors/swimStroke.ts strokeSurge) pulses the way made
 * within a stroke. The footprint is held in `area`: what goes into a wall is lost.
 */
export function stepSwimmer(s: Swimmer, dx: number, dz: number, pace: number, dt: number, surge = 1, area: Box = SWIM_AREA): Swimmer {
  const go = pace > 0 && Math.hypot(dx, dz) > 1e-6;
  let tx = 0, tz = 0;
  if (go) {
    const want = Math.atan2(dx, dz), err = wrap(want - s.yaw);
    s.yaw = wrap(s.yaw + Math.sign(err) * Math.min(Math.abs(err), TURN_RATE * dt, Math.abs(err) * Math.min(1, dt * 5)));
    const keep = Math.max(0.15, Math.cos(wrap(want - s.yaw)));
    tx = Math.sin(s.yaw) * pace * keep; tz = Math.cos(s.yaw) * pace * keep;
  }
  const k = 1 - Math.exp(-dt / (go ? ACCEL_T : DRIFT_T));
  s.vx += (tx - s.vx) * k; s.vz += (tz - s.vz) * k;
  if (go) s.mode = 'swim'; else if (Math.hypot(s.vx, s.vz) < TREAD_BELOW) s.mode = 'tread';
  s.lean += ((s.mode === 'swim' ? 1 : 0) - s.lean) * (1 - Math.exp(-dt / LEAN_T));
  s.x += s.vx * dt * surge; s.z += s.vz * dt * surge;
  const held = holdIn(s, area);
  if (held.x * s.vx > 0) s.vx = 0;
  if (held.z * s.vz > 0) s.vz = 0;
  return s;
}

// ------------------------------------------------------------------------------------------------ in and out
/** Standing at the steps' head (on the deck at the west end, in front of the treads: a walker is held 0.3 m off the water by the pool's collider). */
export const atStepsHead = (px: number, pz: number) => px >= POOL.x0 - 0.6 && px <= POOL.x0 + 0.05 && pz >= STEPS.z0 + 0.05 && pz <= STEPS.z1 - 0.05;
/** Walking into the pool at the steps' head: the stick (dx, dz in the plan) pushing east, toward the water, within 35° (not a walk on round the deck). */
export const wantsStepsIn = (px: number, pz: number, dx: number, dz: number) => atStepsHead(px, pz) && dx > 0.82 * Math.hypot(dx, dz) && Math.hypot(dx, dz) > 0;
/**
 * Swimming into the steps: at them (a body swimming west stops with its origin footprint(1).ahead short of them), in front of them, heading west,
 * the stick pushing west (within 40°: a push into the corner beside them is not one).
 */
export const wantsStepsOut = (s: Pick<Swimmer, 'x' | 'z' | 'yaw'>, dx: number, dz: number) =>
  s.x < SWIM_AREA.x0 + 1.45 && s.z > STEPS.z0 + 0.2 && s.z < STEPS.z1 - 0.2 && Math.sin(s.yaw) < -0.6 && dx < -0.77 * Math.hypot(dx, dz) && Math.hypot(dx, dz) > 0;
/** The feet's height (interior y) of someone walking the steps at plan x: the deck, then down a riser a tread, to the pool's floor (through the treads' middles). */
export const stepsY = (x: number) => DECK_Y - STEP_RISE * clamp((x - (POOL.x0 - STEP_RUN / 2)) / STEP_RUN, 0, 4);
/** The z a walker keeps on the steps (inside the treads, clear of their ends). */
export const stepsZ = (z: number) => clamp(z, STEPS.z0 + 0.35, STEPS.z1 - 0.35);

export type Side = 'n' | 's' | 'e';
/** The basin's walls a swimmer can climb out over (the west end is the steps): the wall's line, its outward normal (plan) and along which axis it runs. */
const WALLS: Record<Side, { nx: number; nz: number; at: number; along: 'x' | 'z' }> = {
  n: { nx: 0, nz: -1, at: POOL.z0, along: 'x' }, s: { nx: 0, nz: 1, at: POOL.z1, along: 'x' }, e: { nx: 1, nz: 0, at: POOL.x1, along: 'z' },
};
/** The wall nearest to a plan point inside the pool or on its deck (not the steps' end), and the distance to its line. */
export function nearestWall(x: number, z: number): { side: Side; d: number } {
  const ds: [Side, number][] = [['n', Math.abs(z - POOL.z0)], ['s', Math.abs(z - POOL.z1)], ['e', Math.abs(x - POOL.x1)]];
  ds.sort((a, b) => a[1] - b[1]);
  return { side: ds[0][0], d: ds[0][1] };
}
/** The wall nearest to the body's origin (`nearestWall`), the origin's distance to it and its footprint's gap to it (0: touching). */
export function closestWall(s: Pick<Swimmer, 'x' | 'z' | 'yaw' | 'lean'>): { side: Side; gap: number; d: number } {
  const b = bodyBox(s.x, s.z, s.yaw, s.lean), w = nearestWall(s.x, s.z);
  const gap = w.side === 'n' ? b.z0 - POOL.z0 : w.side === 's' ? POOL.z1 - b.z1 : POOL.x1 - b.x1;
  return { side: w.side, gap: Math.max(0, gap), d: w.d };
}
/** Near enough a wall to climb out over it now. */
export const canClimb = (s: Pick<Swimmer, 'x' | 'z' | 'yaw' | 'lean'>) => { const w = closestWall(s); return w.gap <= CLIMB_GAP || w.d <= CLIMB_REACH; };
/** A point `off` metres out of the water from wall `side` (negative: into it), level with plan point (x, z) along the wall, kept 0.5 m off its corners. */
export function byWall(side: Side, x: number, z: number, off: number): { x: number; z: number; yaw: number } {
  const w = WALLS[side];
  const a = w.along === 'x' ? clamp(x, SWIM_AREA.x0 + 0.5, SWIM_AREA.x1 - 0.5) : clamp(z, SWIM_AREA.z0 + 0.5, SWIM_AREA.z1 - 0.5);
  const yaw = Math.atan2(w.nx, w.nz);                                                           // facing the wall (out of the water)
  return w.along === 'x' ? { x: a, z: w.at + w.nz * off, yaw } : { x: w.at + w.nx * off, z: a, yaw };
}
/** « Se baigner » from a deck point: down the steps at the west end, else over the nearest wall (the deck point at its edge, the water inside it). */
export function entryFor(px: number, pz: number): { steps: true } | { steps: false; side: Side; edge: { x: number; z: number }; water: { x: number; z: number }; yaw: number } {
  if (px < POOL.x0 + 0.05 && pz > STEPS.z0 - 0.1 && pz < STEPS.z1 + 0.1) return { steps: true };
  // from the west end's corners (beside the steps), the long side nearest
  const side = px < SWIM_AREA.x0 + 0.5 ? (Math.abs(pz - POOL.z0) < Math.abs(pz - POOL.z1) ? 'n' : 's') : nearestWall(px, pz).side;
  const edge = byWall(side, px, pz, 0.22), water = byWall(side, px, pz, -(footprint(0).behind + 0.22));
  return { steps: false, side, edge: { x: edge.x, z: edge.z }, water: { x: water.x, z: water.z }, yaw: wrap(edge.yaw + Math.PI) };
}
/** The deck's point where the swimmer climbs out over the nearest wall: DECK_OUT out of the water, in front of them. */
export function exitPoint(px: number, pz: number): { x: number; z: number } {
  const p = byWall(nearestWall(px, pz).side, px, pz, DECK_OUT);
  return { x: p.x, z: p.z };
}
/**
 * A free spot on the deck near (x, z) for a body of radius `r`: the point itself, else along the wall ±0.4, ±0.8, ±1.2 m and a little farther out;
 * `cols` the interior's colliders in the deck's band, less the pool's own (plan coordinates). Null when none is free.
 */
export function freeDeck(side: Side, x: number, z: number, cols: readonly Box[], r = 0.3): { x: number; z: number } | null {
  const free = (p: { x: number; z: number }) => !cols.some(c => p.x > c.x0 - r && p.x < c.x1 + r && p.z > c.z0 - r && p.z < c.z1 + r);
  for (const out of [DECK_OUT, DECK_OUT + 0.25]) for (const s of [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2]) {
    const w = WALLS[side], p = byWall(side, w.along === 'x' ? x + s : x, w.along === 'z' ? z + s : z, out);
    if (free(p)) return { x: p.x, z: p.z };
  }
  return null;
}
/** What a swim of `seconds` gives (in proportion, at least a quarter, at most a full swim's). */
export function swimGains(seconds: number): { hygiene: number; moral: number; energie: number } {
  const k = Math.max(0.25, Math.min(1, seconds / SWIM_SECONDS));
  return { hygiene: Math.round(SWIM_GAINS.hygiene * k), moral: Math.round(SWIM_GAINS.moral * k), energie: Math.round(SWIM_GAINS.energie * k) };
}

// ------------------------------------------------------------------------------------------------ in the game
/** A scripted move of the body (going in or out): from where it is to `to` (plan x, z; interior y of the origin; yaw), in `dur` s, holding `clip`. */
interface Leg {
  kind: 'walk' | 'hop' | 'turn' | 'climb' | 'onto' | 'settle';
  to: { x: number; z: number; y: number; yaw: number };
  dur: number; clip: Clip;
  /** walk: the floor under the walker along x (the steps); settle / walk: the water reached at this share of the leg (a splash, the time in the water starts). */
  ground?: (x: number) => number; wet?: number;
}
type How = 'slide' | 'steps' | 'climb' | 'steps-out';
const SEAT_ID = 'villa:baignade';

export class VillaSwim {
  private seat: Seat | null = null;
  /** 'in' and 'out': a scripted move (legs); 'water': free. */
  private phase: 'in' | 'water' | 'out' = 'water';
  private how: How | null = null;
  private legs: Leg[] = []; private leg = 0; private legT = 0; private from = { x: 0, z: 0, y: 0, yaw: 0 };
  /** The body's origin now (plan x, z; interior y; yaw). */
  private at = { x: 0, z: 0, y: 0, yaw: 0 };
  private readonly s: Swimmer = { x: 0, z: 0, yaw: 0, vx: 0, vz: 0, lean: 0, mode: 'tread' };
  /** Seconds in the water (from the splash going in to the start of the way out), and whether the water has been reached. */
  private t = 0; private wet = false;
  private origin = { x: 0, z: 0 };
  /** « Sortir de l'eau » from the middle: the swimmer swims to this point by the wall first. */
  private auto: { x: number; z: number; side: Side; t: number } | null = null;
  /** The steps' head: how long the stick has pushed toward the water there. */
  private stepsPush = 0;
  /** The proof's pictures: a clip held at a phase of its cycle. */
  private freeze: { clip: Clip; phase: number } | null = null;
  private lastPhase = 0; private rippleT = 0; private wakeT = 0;
  private water: SwimWater | null = null;
  private target: Target;
  private outTarget: Target;
  private readonly inAff: Affordance[];
  private readonly outAff: Affordance[];
  /** For the checks: swims begun and ended (full or not), the ways in and out taken, the last gains. */
  readonly log = { started: 0, ended: 0, full: 0, gains: null as null | ReturnType<typeof swimGains>, ins: { slide: 0, steps: 0 }, outs: { climb: 0, steps: 0, taken: 0 } };
  // (outs.taken: out of the water by something else than the swim's own ways: a door, a trip)

  constructor(private ctx: GameCtx, private room: THREE.Group, private hold: () => VillaHold, private where: () => { x: number; z: number } | null) {
    this.inAff = [{ id: 'baignade', verb: 'use', label: 'Se baigner', icon: '🏊', detail: `Nager librement · hygiène +${SWIM_GAINS.hygiene}, moral +${SWIM_GAINS.moral}`, run: () => this.start() }];
    this.outAff = [{ id: 'sortir', verb: 'stand', label: 'Sortir de l’eau', icon: '🧍', run: () => this.stop() }];
    this.target = { id: 'villa:piscine', name: 'La piscine', kind: 'spot', space: 'home', x: 0, z: 0, y: 0.6, radius: EDGE_REACH + 0.4, bias: -0.3, affordances: () => this.inAff };
    this.outTarget = { id: 'villa:piscine:sortir', name: 'Dans la piscine', kind: 'self', space: 'home', x: 0, z: 0, radius: 2, bias: -1.5, affordances: () => this.outAff };
  }
  get swimming() { return !!this.seat; }

  /** The targets at the pool: « Se baigner » at its edge, « Sortir de l'eau » in the water (not while going in or out). */
  collect(space: string, x: number, z: number, out: Target[]) {
    if (space !== 'home') return;
    const o = this.where(); if (!o) return;
    if (this.seat) {
      if (this.phase !== 'water' || this.auto) return;
      const near = canClimb(this.s) || this.byTheSteps();
      const g = swimGains(this.t);
      this.outAff[0].detail = `${near ? '' : 'Nager jusqu’au bord · '}hygiène +${g.hygiene}, moral +${g.moral}`;
      this.outTarget.x = x; this.outTarget.z = z; out.push(this.outTarget);
      return;
    }
    if (!maySwim(this.hold(), true) || this.ctx.player.seated() || this.ctx.player.pos.y > 1.2) return;
    const px = x - o.x, pz = z - o.z;
    if (!atEdge(px, pz)) return;
    // the target on the water's edge nearest to the player
    this.target.x = o.x + clamp(px, POOL.x0, POOL.x1); this.target.z = o.z + clamp(pz, POOL.z0, POOL.z1);
    out.push(this.target);
  }

  /** « Se baigner » at the edge: in by the steps at the west end, else a slip over the edge from where the player stands. */
  start(): boolean {
    const ctx = this.ctx, o = this.where();
    if (this.seat || !o || ctx.player.seated() || ctx.activities.running || !maySwim(this.hold(), true)) return false;
    const p = ctx.player.pos, px = p.x - o.x, pz = p.z - o.z;
    if (!atEdge(px, pz) && !atStepsHead(px, pz)) return false;
    const e = entryFor(px, pz);
    return e.steps ? this.begin('steps', this.stepsIn(px, pz)) : this.begin('slide', this.slideIn(px, pz, e));
  }

  /** « Sortir de l'eau »: up the steps by them, over the wall within reach of it, else a swim to the nearest wall first. */
  stop() {
    if (!this.seat || this.phase !== 'water') return;
    if (this.byTheSteps()) { this.leave('steps-out', this.stepsOut()); return; }
    const w = closestWall(this.s);
    if (canClimb(this.s)) { this.leave('climb', this.climbOut(w.side)); return; }
    const p = byWall(w.side, this.s.x, this.s.z, -0.9);
    this.auto = { x: p.x, z: p.z, side: w.side, t: 0 };
  }

  /** Every frame: the steps' head watched while walking; in the water, the free swim or the way in or out. */
  update(dt: number) {
    const seat = this.seat;
    if (!seat) { this.watchSteps(dt); this.water?.update(dt, WATER_Y, this.light()); return; }
    if (this.ctx.player.seated()?.id !== seat.id) { this.end(false); return; }      // taken out by a door, a trip…
    const b = this.ctx.player.body();
    if (b) b.holdFade = SWIM_FADE;
    if (this.phase === 'water') this.swim(dt); else this.stepLegs(dt);
    if (!this.seat) return;                                                          // (out: ended this frame)
    if (this.freeze && b) { seat.clip = this.freeze.clip; b.holdRate = 0; if (b.clipName === this.freeze.clip) b.seekClip(this.freeze.phase); }
    this.place();
    this.water?.update(dt, WATER_Y, this.light());
  }

  // ---------------------------------------------------------------- the free swim
  private swim(dt: number) {
    const ctx = this.ctx, s = this.s, b = ctx.player.body();
    let dx = 0, dz = 0, pace = 0;
    if (this.auto) {
      const a = this.auto; a.t += dt;
      dx = a.x - s.x; dz = a.z - s.z; pace = SWIM_PACE;
      if (Math.hypot(dx, dz) < 0.15 || a.t > 8 || (a.t > 0.3 && canClimb(s))) { this.auto = null; this.leave('climb', this.climbOut(closestWall(s).side)); return; }
    } else if (ctx.mode() === 'play') {
      const m = ctx.input.move(), push = Math.min(1, Math.hypot(m.x, m.y)), yaw = ctx.follow.yaw;
      const keyed = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].some(k => ctx.input.keys.has(k));
      pace = swimPace(push, keyed, ctx.input.keys.has('ShiftLeft') || ctx.input.keys.has('ShiftRight'));
      if (pace > 0) { dx = Math.sin(yaw) * m.y - Math.cos(yaw) * m.x; dz = Math.cos(yaw) * m.y + Math.sin(yaw) * m.x; }   // the stick in the camera's frame (as on foot: main.ts)
      if (pace > 0 && wantsStepsOut(s, dx, dz)) { this.leave('steps-out', this.stepsOut()); return; }
    }
    // the way made pulses with the stroke (a surge after each kick), as much as the body lies in it
    const phase = b && b.clipName === 'Swim' ? b.clipPhase() : 0, surge = b && b.clipName === 'Swim' ? 1 + (strokeSurge(phase) - 1) * s.lean : 1;
    stepSwimmer(s, dx, dz, pace, dt, surge);
    this.t += dt;
    const speed = Math.hypot(s.vx, s.vz);
    this.seat!.clip = s.mode === 'swim' ? 'Swim' : 'Tread';
    if (b) b.holdRate = s.mode === 'swim' ? strokeRate(Math.max(speed, pace * 0.6)) : TREAD_RATE;
    this.at.x = s.x; this.at.z = s.z; this.at.yaw = s.yaw; this.at.y = this.floatY();
    this.ripples(dt, phase, speed);
  }
  /** The water's rings: round the treading body now and then; swimming, a ring at the head each kick and a trail of rings left behind (the wake). */
  private ripples(dt: number, phase: number, speed: number) {
    const w = this.water; if (!w) return;
    const s = this.s, fx = Math.sin(s.yaw), fz = Math.cos(s.yaw), X = (a: number) => this.origin.x + s.x + fx * a, Z = (a: number) => this.origin.z + s.z + fz * a;
    if (s.mode === 'tread' || speed < 0.25) {
      if ((this.rippleT -= dt) <= 0) { this.rippleT = 0.85; w.ring(X(0.05), Z(0.05), { r0: 0.32, r1: 1.05, life: 1.9, strength: 0.16 }); }
    } else {
      if (this.lastPhase < 0.78 && phase >= 0.78) w.ring(X(0.75), Z(0.75), { r0: 0.28, r1: 1.0, life: 1.5, strength: 0.2 });
      if ((this.wakeT -= dt) <= 0) { this.wakeT = 0.2; w.ring(X(0.5), Z(0.5), { r0: 0.22, r1: 0.6 + 0.35 * speed, life: 1.35, strength: 0.06 + 0.09 * Math.min(1, speed) }); }
    }
    this.lastPhase = phase;
  }

  // ---------------------------------------------------------------- in and out
  /** The water line on this body: its origin that far under the surface (the body's own scale: a Meshy body, a woman's v4). */
  private floatY() { return WATER_Y - SWIM_WATERLINE * (this.ctx.player.body()?.group.scale.y ?? 1); }
  private bodyScale() { return this.ctx.player.body()?.group.scale.y ?? 1; }
  private byTheSteps() { const s = this.s; return s.x < SWIM_AREA.x0 + 1.8 && s.z > STEPS.z0 - 0.3 && s.z < STEPS.z1 + 0.3; }

  /** « Se baigner » over a wall: a few steps to the edge if need be, then a slip into the water facing out over it (0.55 s), a splash. */
  private slideIn(px: number, pz: number, e: Exclude<ReturnType<typeof entryFor>, { steps: true }>): Leg[] {
    const legs: Leg[] = [], d = Math.hypot(e.edge.x - px, e.edge.z - pz);
    if (d > 0.12) legs.push({ kind: 'walk', to: { ...e.edge, y: DECK_Y, yaw: e.yaw }, dur: d / 1.3, clip: 'Walk' });
    legs.push({ kind: 'hop', to: { ...e.water, y: this.floatY(), yaw: e.yaw }, dur: 0.55, clip: 'Tread', wet: 0.45 });
    return legs;
  }
  /** Down the steps: walked at a careful pace to the pool's floor, then into the water up to the shoulders, treading. */
  private stepsIn(px: number, pz: number): Leg[] {
    const z = stepsZ(pz), east = Math.PI / 2, foot = POOL.x0 + 0.95;
    return [
      { kind: 'walk', to: { x: foot, z, y: stepsY(foot), yaw: east }, dur: Math.hypot(foot - px, z - pz) / 0.85, clip: 'Walk', ground: stepsY, wet: 0.45 },
      { kind: 'settle', to: { x: SWIM_AREA.x0 + footprint(0).behind + 0.25, z, y: this.floatY(), yaw: east }, dur: 0.9, clip: 'Tread' },
    ];
  }
  /**
   * Over a wall: turned to it and up to it treading if need be, the hands on the coping and a knee up (0.45 s), then up and onto the deck, standing
   * (0.55 s).
   */
  private climbOut(side: Side): Leg[] {
    const s = this.s, k = this.bodyScale(), c = byWall(side, s.x, s.z, 0.12 - CLIMB_HANDS.z * k);
    const deck = freeDeck(side, s.x, s.z, this.deckColliders()) ?? exitPoint(s.x, s.z);
    const turn = Math.abs(wrap(c.yaw - s.yaw)), w = WALLS[side], d = w.along === 'x' ? Math.abs(w.at - s.z) : Math.abs(w.at - s.x);
    const legs: Leg[] = [];
    if (turn > 0.5) legs.push({ kind: 'turn', to: { x: s.x, z: s.z, y: this.floatY(), yaw: c.yaw }, dur: Math.max(0.2, turn / 3.2), clip: 'Tread' });
    if (d > 0.8) { const p = byWall(side, s.x, s.z, -0.75); legs.push({ kind: 'settle', to: { x: p.x, z: p.z, y: this.floatY(), yaw: c.yaw }, dur: (d - 0.75) / 0.9, clip: 'Tread' }); }
    legs.push({ kind: 'climb', to: { x: c.x, z: c.z, y: COPING_Y + 0.01 - CLIMB_HANDS.y * k, yaw: c.yaw }, dur: 0.45, clip: 'SwimClimb' });
    legs.push({ kind: 'onto', to: { x: deck.x, z: deck.z, y: DECK_Y, yaw: c.yaw }, dur: 0.55, clip: 'Idle' });
    return legs;
  }
  /** Up the steps: standing up and wading to their foot, then walked up onto the deck at the west end. */
  private stepsOut(): Leg[] {
    const s = this.s, z = stepsZ(s.z), west = -Math.PI / 2, foot = POOL.x0 + 1.15, top = POOL.x0 - 0.45;
    return [
      { kind: 'settle', to: { x: foot, z, y: stepsY(foot), yaw: west }, dur: Math.max(0.6, Math.hypot(foot - s.x, z - s.z) / 1.1), clip: 'Walk' },
      { kind: 'walk', to: { x: top, z, y: DECK_Y, yaw: west }, dur: (foot - top) / 0.85, clip: 'Walk', ground: stepsY },
    ];
  }

  /** The player onto the swim's seat where they stand (no jump), then the way in. */
  private begin(how: How, legs: Leg[]): boolean {
    const ctx = this.ctx, o = this.where()!, p = ctx.player.pos;
    this.origin = { x: o.x, z: o.z };
    this.at = { x: p.x - o.x, z: p.z - o.z, y: p.y, yaw: ctx.player.facing() };
    const seat: Seat = { id: SEAT_ID, x: p.x, z: p.z, top: p.y + SIT_HIPS, yaw: this.at.yaw, kind: 'floor', space: 'home', occupant: null, locked: true, clip: legs[0].clip, exits: [] };
    ctx.seats.add(seat);
    ctx.player.sit(seat);
    if (ctx.player.seated()?.id !== seat.id) { ctx.seats.remove(seat.id); return false; }
    this.seat = seat; this.how = how; this.t = 0; this.wet = false; this.auto = null; this.freeze = null;
    Object.assign(this.s, { x: this.at.x, z: this.at.z, yaw: this.at.yaw, vx: 0, vz: 0, lean: 0, mode: 'tread' });
    this.showWater(true);
    this.run('in', legs);
    this.log.started++; this.log.ins[how === 'steps' ? 'steps' : 'slide']++;
    ctx.toast(how === 'steps' ? 'Par les marches, dans l’eau.' : 'Dans l’eau : nage où tu veux.');
    return true;
  }
  private leave(how: How, legs: Leg[]) { this.how = how; this.run('out', legs); this.log.outs[how === 'climb' ? 'climb' : 'steps']++; }
  private run(phase: 'in' | 'out', legs: Leg[]) { this.phase = phase; this.legs = legs; this.leg = 0; this.legT = 0; this.from = { ...this.at }; this.seat!.clip = legs[0].clip; }

  /** One frame of the way in or out: along the leg, its clip held; at its end the next, and at the last the water (in) or the deck (out). */
  private stepLegs(dt: number) {
    const L = this.legs[this.leg], f = this.from, a = this.at, seat = this.seat!, b = this.ctx.player.body();
    if (b) b.holdRate = L.clip === 'Tread' ? TREAD_RATE : 1;
    seat.clip = L.clip;
    this.legT += dt;
    const u = Math.min(1, this.legT / L.dur);
    const yawTo = (k: number) => f.yaw + wrap(L.to.yaw - f.yaw) * k;
    switch (L.kind) {
      case 'walk': {                                                // at a steady pace, turned toward where it goes, on the floor under it
        a.x = lerp(f.x, L.to.x, u); a.z = lerp(f.z, L.to.z, u);
        a.y = L.ground ? L.ground(a.x) : lerp(f.y, L.to.y, u); a.yaw = yawTo(Math.min(1, u * 4));
        break;
      }
      case 'hop': {                                                  // a step over the edge and down into the water, a little rise first
        const h = 1 - (1 - u) * (1 - u);
        a.x = lerp(f.x, L.to.x, h); a.z = lerp(f.z, L.to.z, h);
        a.y = lerp(f.y, L.to.y, smooth(0.15, 1, u)) + 0.1 * Math.sin(Math.PI * Math.min(1, u * 1.6)) * (1 - u); a.yaw = yawTo(Math.min(1, u * 3));
        break;
      }
      case 'turn': { a.yaw = yawTo(smooth(0, 1, u)); a.y = L.to.y; break; }
      case 'climb': case 'settle': {
        const k = smooth(0, 1, u);
        a.x = lerp(f.x, L.to.x, k); a.z = lerp(f.z, L.to.z, k); a.y = lerp(f.y, L.to.y, k); a.yaw = yawTo(Math.min(1, u * 2));
        break;
      }
      case 'onto': {                                                 // up first, then forward over the coping onto the deck
        a.y = lerp(f.y, L.to.y, smooth(0, 0.65, u)); const k = smooth(0.25, 1, u);
        a.x = lerp(f.x, L.to.x, k); a.z = lerp(f.z, L.to.z, k); a.yaw = L.to.yaw;
        break;
      }
    }
    // the water reached going in (a splash, the time in the water starts) and left going out (drips)
    if (this.phase === 'in' && !this.wet && L.wet !== undefined && u >= L.wet) {
      this.wet = true;
      const wx = this.origin.x + a.x, wz = this.origin.z + a.z;
      if (L.kind === 'hop') { this.water?.splash(wx, WATER_Y, wz, 18, 1); this.water?.ring(wx, wz, { r0: 0.3, r1: 1.6, life: 1.6, strength: 0.5 }); }
      this.water?.ring(wx, wz, { r0: 0.2, r1: 1.0, life: 1.3, strength: 0.35 });
    }
    if (this.phase === 'in' && this.wet) this.t += dt;
    if (this.wet && (L.kind === 'walk' || L.kind === 'settle') && (this.rippleT -= dt) <= 0 && a.y < WATER_Y - 0.25) {     // wading: rings round the legs
      this.rippleT = 0.45; this.water?.ring(this.origin.x + a.x, this.origin.z + a.z, { r0: 0.25, r1: 0.9, life: 1.4, strength: 0.18 });
    }
    if (this.phase === 'out' && L.kind === 'onto' && this.legT - dt <= L.dur * 0.3 && this.legT > L.dur * 0.3) this.water?.splash(this.origin.x + a.x, WATER_Y + 0.5, this.origin.z + a.z, 8, 0.25);
    if (u < 1) return;
    this.from = { ...a };
    if (++this.leg < this.legs.length) { this.legT = 0; seat.clip = this.legs[this.leg].clip; return; }
    if (this.phase === 'in') {                                       // in: free in the water, treading
      Object.assign(this.s, { x: a.x, z: a.z, yaw: a.yaw, vx: 0, vz: 0, lean: 0, mode: 'tread' });
      holdIn(this.s);
      this.phase = 'water'; this.rippleT = 0.3;
      return;
    }
    this.end(true);
  }

  /** Out of the water (`climbed`: on the deck by the swim's own way; else taken out by something else, a door, a trip): the gains of the time in it. */
  private end(climbed: boolean) {
    const ctx = this.ctx, seat = this.seat!; this.seat = null;
    if (!climbed) this.log.outs.taken++;
    const b = ctx.player.body(); if (b) { b.holdFade = 0.2; b.holdRate = 1; }
    if (ctx.player.seated()?.id === seat.id) ctx.player.standUp(true);                       // where the way out left the body: on the deck
    ctx.seats.remove(seat.id);
    this.phase = 'water'; this.legs = []; this.auto = null; this.freeze = null;
    const g = swimGains(this.t);
    ctx.state.adjust(g);
    ctx.state.count('baignades');
    this.log.ended++; if (this.t >= SWIM_SECONDS - 0.05) this.log.full++; this.log.gains = g;
    ctx.toast(`Baignade ✓  hygiène +${g.hygiene} · moral +${g.moral}`);
    ctx.save();
  }

  /** The seat where the body's origin is: main.ts puts a seated player at (x, top − SIT_HIPS, z), facing yaw. */
  private place() {
    const seat = this.seat!, a = this.at;
    seat.x = this.origin.x + a.x; seat.z = this.origin.z + a.z; seat.top = a.y + SIT_HIPS; seat.yaw = a.yaw;
  }

  /** On foot at the steps' head, the stick pushing toward the water for a moment: in, down the steps. */
  private watchSteps(dt: number) {
    const ctx = this.ctx;
    if (ctx.mode() !== 'play' || ctx.player.seated() || ctx.activities.running) { this.stepsPush = 0; return; }
    const o = this.where(); if (!o || ctx.player.pos.y > 1.2) { this.stepsPush = 0; return; }
    const p = ctx.player.pos, px = p.x - o.x, pz = p.z - o.z;
    if (!atStepsHead(px, pz) || !maySwim(this.hold(), true)) { this.stepsPush = 0; return; }
    const m = ctx.input.move(), yaw = ctx.follow.yaw;
    const dx = Math.sin(yaw) * m.y - Math.cos(yaw) * m.x, dz = Math.cos(yaw) * m.y + Math.sin(yaw) * m.x;
    this.stepsPush = Math.hypot(m.x, m.y) > 0.3 && wantsStepsIn(px, pz, dx, dz) ? this.stepsPush + dt : 0;
    if (this.stepsPush > 0.12) { this.stepsPush = 0; this.begin('steps', this.stepsIn(px, pz)); }
  }

  /** The interior's colliders on the deck's floor, in plan coordinates, less the pool's own. */
  private deckColliders(): Box[] {
    const int = this.ctx.inside()?.int, o = this.origin; if (!int) return [];
    const out: Box[] = [];
    for (const c of int.colliders as readonly Collider[]) {
      if (!inBand(c, DECK_Y)) continue;
      const b = { x0: c.x0 - o.x, x1: c.x1 - o.x, z0: c.z0 - o.z, z1: c.z1 - o.z };
      if (Math.abs(b.x0 - POOL.x0) < 0.05 && Math.abs(b.x1 - POOL.x1) < 0.05 && Math.abs(b.z0 - POOL.z0) < 0.05 && Math.abs(b.z1 - POOL.z1) < 0.05) continue;
      out.push(b);
    }
    return out;
  }
  /** How lit the water's rings are: by day, and less at night (the pool is lit from within). */
  private light() { const d = daylight(this.ctx.hour()); return 0.45 + 0.55 * d; }
  private showWater(on: boolean) {
    if (on && !this.water) {
      this.water = new SwimWater();
      this.room.add(this.water.group);
    }
    if (this.water && this.where()) { const o = this.where()!; this.water.clipTo(o.x + POOL.x0, o.z + POOL.z0, o.x + POOL.x1, o.z + POOL.z1); }
  }

  /** The hub is being rebuilt: forget the swim without touching the player. */
  reset() {
    if (this.seat) { this.ctx.seats.remove(this.seat.id); this.seat = null; const b = this.ctx.player.body(); if (b) { b.holdFade = 0.2; b.holdRate = 1; } }
    this.phase = 'water'; this.legs = []; this.auto = null; this.freeze = null; this.stepsPush = 0;
    if (this.water) { this.water.dispose(); this.water = null; }
  }
  info() {
    const s = this.s, a = this.at, r = (v: number) => Math.round(v * 100) / 100, box = bodyBox(s.x, s.z, s.yaw, s.lean);
    const state = !this.seat ? null : this.phase === 'water' ? (this.auto ? 'to-edge' : s.mode) : this.phase;
    return {
      swimming: !!this.seat, state, how: this.seat ? this.how : null, t: Math.round(this.t * 10) / 10,
      /** The body's origin (plan, from the home's origin; interior y) and in the hub. */
      x: r(a.x), z: r(a.z), y: r(a.y), yaw: r(a.yaw), wx: r(this.origin.x + a.x), wz: r(this.origin.z + a.z),
      speed: r(Math.hypot(s.vx, s.vz)), lean: r(s.lean), clip: this.ctx.player.body()?.clipName ?? null, rate: r(this.ctx.player.body()?.holdRate ?? 1),
      /** The footprint held in the water (plan), while free in it. */
      box: this.seat && this.phase === 'water' ? { x0: r(box.x0), x1: r(box.x1), z0: r(box.z0), z1: r(box.z1) } : null,
      fx: this.water?.info() ?? null,
      seat: this.seat ? { x: this.seat.x, z: this.seat.z, top: this.seat.top, yaw: this.seat.yaw } : null, log: JSON.parse(JSON.stringify(this.log)) as VillaSwim['log'],
    };
  }
  /** Debug: the pool's numbers in the plan and the hub. */
  geometry() { return { pool: { ...POOL }, steps: { ...STEPS }, area: { ...SWIM_AREA }, origin: this.where(), waterY: WATER_Y, deckY: DECK_Y }; }
  /** Debug (the proof's pictures): in the water at plan (x, z) heading `yaw`, treading; a debug move, not a way in. */
  debugAt(x: number, z: number, yaw = 0) {
    if (!this.seat && (!this.where() || !this.begin('slide', [{ kind: 'settle', to: { x, z, y: this.floatY(), yaw }, dur: 0.01, clip: 'Tread' }]))) return false;
    Object.assign(this.s, { x, z, yaw, vx: 0, vz: 0, lean: 0, mode: 'tread' }); holdIn(this.s);
    this.at = { x: this.s.x, z: this.s.z, y: this.floatY(), yaw: this.s.yaw }; this.from = { ...this.at }; this.place();
    return true;
  }
  /** Debug (the proof's pictures): `clip` held at `phase` of its cycle (null: free again). */
  debugHold(clip: Clip | null, phase = 0) { this.freeze = clip ? { clip, phase } : null; if (!clip) { const b = this.ctx.player.body(); if (b) b.holdRate = 1; } return !!this.seat; }
}

/**
 * The swim's debug hooks (`__dakar.villa.swim`, src/villa/module.ts), each reading the swim when called (the hooks are made before the module's init):
 * info, start (« Se baigner »), stop (« Sortir de l'eau »), geometry, at (straight into the water), hold (a clip held at a phase).
 */
export const swimHooks = (swim: () => VillaSwim) => ({
  info: () => swim().info(),
  start: () => swim().start(),
  stop: () => { swim().stop(); return swim().info().state; },
  geometry: () => swim().geometry(),
  at: (x: number, z: number, yaw = 0) => swim().debugAt(x, z, yaw),
  hold: (clip: Clip | null, phase = 0) => swim().debugHold(clip, phase),
});
