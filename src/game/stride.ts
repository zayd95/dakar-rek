import type { GameState } from '../core/state';

/**
 * Getting around on foot — always free, and (release 1.0) never tiring: the push decides the pace, nothing else. There is no run button, no stamina and no
 * « Footing » / « Sprint » gauge any more; running costs no energy and no hygiene. What tires a character is what they DO (a shift at the garage, the catch at the
 * quay, a football match, a training session: each activity carries its own cost), and rest, food and sleep bring it back.
 *
 *  - Phone (the joystick): one smooth curve from the lightest push (a slow walk through a shop) to the full push (a run). The fastest stretch only opens once the
 *    stick has been fully out for a moment, so brushing its edge never bolts.
 *  - Keyboard: a direction key walks for the first instant, then runs on its own; Shift held keeps to a walk (to place oneself at a counter, a door, a bay).
 *    Indoors the keys walk: a room is not a track.
 *
 * Running far still builds fitness (« forme », the same counter as the open-air gym), which makes the run a little faster. Nothing of it is shown while moving.
 */
export const GAIT = { walk: 1.4, brisk: 2.0, jog: 4.2, run: 7.0 } as const;
/** A gait forced by the debug API and the checks (`__dakar.strideToggle`): 0 none, 1 jog, 2 run. */
export type RunLevel = 0 | 1 | 2;
/** A sprinted metre counts this much more than a jogged one toward fitness. */
export const SPRINT_FORME = 1.5;
/** Metres run for one point of fitness. */
export const METRES_PER_FORME = 400;

/**
 * Analog walking (the phone's joystick): the push sets the speed along ONE smooth curve, no gait switches. A small push is a slow walk through a shop, a moderate one the normal walk
 * of a market, a strong one a jog, a fully extended stick a run. `mag` is the stick's magnitude after its dead zone, 0…1.
 */
export const ANALOG = {
  /** Speed of the lightest push that moves at all (m/s). */
  creep: 0.45, creepAt: 0.06,
  /** Where each stretch of the curve ends (stick magnitude): slow walk, normal walk, jog; beyond it the run. */
  slowTo: 0.3, walkTo: 0.62, jogTo: 0.88,
  /** Speeds at those points (m/s). */
  walk: GAIT.walk, brisk: 2.1, jog: 4.4,
  /** The run needs the stick held nearly fully out for this long (s): brushing the edge of the stick never bolts by accident. */
  sprintAt: 0.93, sprintHold: 0.3,
} as const;
/** Keyboard: a direction key held this long (s) starts to run; `runIn` more seconds bring it from the jog to the full run. */
export const KEYS = { runAfter: 0.3, runIn: 0.9 } as const;
const smooth = (t: number) => { const c = Math.max(0, Math.min(1, t)); return c * c * (3 - 2 * c); };
/** The speed a stick push asks for (m/s): continuous and increasing from the lightest push to the full one. `run` is the run's speed at full push. */
export function analogSpeed(mag: number, run: number): number {
  const m = Math.max(0, Math.min(1, mag)), A = ANALOG;
  if (m <= 0) return 0;
  if (m < A.creepAt) return A.creep * (m / A.creepAt);                                  // from standing still, no step
  if (m < A.slowTo) return A.creep + (A.walk - A.creep) * smooth((m - A.creepAt) / (A.slowTo - A.creepAt));
  if (m < A.walkTo) return A.walk + (A.brisk - A.walk) * ((m - A.slowTo) / (A.walkTo - A.slowTo));
  if (m < A.jogTo) return A.brisk + (A.jog - A.brisk) * smooth((m - A.walkTo) / (A.jogTo - A.walkTo));
  return A.jog + (run - A.jog) * smooth((m - A.jogTo) / (1 - A.jogTo));
}
/** The speed the keys ask for (m/s) after a direction has been held `held` seconds: a walk, then the jog, then the run, without a step. */
export function keysSpeed(held: number, run: number): number {
  const A = ANALOG, K = KEYS;
  if (held < K.runAfter) return A.brisk;
  return A.jog + (run - A.jog) * smooth((held - K.runAfter) / K.runIn);
}

export class Stride {
  /** Jogging or running this frame. */
  running = false;
  /** At the run this frame (a subset of `running`). */
  sprinting = false;
  private run = 0;
  private mode: 'walk' | 'jog' | 'sprint' = 'walk';
  private full = 0;
  private held = 0;

  constructor(private state: GameState) {}

  get forme() { return this.state.data.counters.forme ?? 0; }
  /** The run's speed (m/s): fitness makes it a little faster. */
  runSpeed() { return GAIT.run * (1 + Math.min(0.12, this.forme * 0.0012)); }
  /** What the body is doing on foot (for the animation and the checks; nothing on screen names it). */
  get gait(): 'walk' | 'jog' | 'sprint' { return this.mode; }

  private note(v: number) {
    const A = ANALOG, run = this.runSpeed();
    const jogK = Math.max(0, Math.min(1, (v - A.brisk) / (A.jog - A.brisk))), sprintK = Math.max(0, Math.min(1, (v - A.jog) / Math.max(0.1, run - A.jog)));
    this.sprinting = sprintK > 0.35; this.running = jogK > 0.25;
    this.mode = this.sprinting ? 'sprint' : this.running ? 'jog' : 'walk';
    return v;
  }

  /** Target speed this frame for the analog stick (`mag` 0…1): the curve above; the run only opens once the stick has been fully out for a moment. */
  analog(mag: number, dt: number): number {
    const A = ANALOG;
    this.held = 0;
    this.full = mag >= A.sprintAt ? this.full + dt : Math.max(0, this.full - dt * 2);
    let v = analogSpeed(mag, this.runSpeed());
    if (this.full < A.sprintHold) v = Math.min(v, A.jog);
    return this.note(v);
  }

  /**
   * Target speed this frame for the keys (`mag` 0…1 of the direction keys): a walk for the first instant, then the run on its own. `walk` (Shift held) keeps to
   * a walk; so does `indoors`.
   */
  keys(mag: number, walk: boolean, dt: number, indoors = false): number {
    this.full = 0;
    if (mag <= 0.05) { this.held = 0; return this.note(0); }
    this.held += dt;
    return this.note(walk ? GAIT.walk : indoors ? ANALOG.brisk : keysSpeed(this.held, this.runSpeed()) * Math.min(1, mag));
  }

  /** A gait forced by the debug API (the checks): 1 the jog, 2 the run, at once. */
  forced(mag: number, level: RunLevel): number {
    this.full = 0; this.held = 0;
    if (mag <= 0.05) return this.note(0);
    return this.note(level === 2 ? this.runSpeed() * mag : level === 1 ? GAIT.jog * mag : mag < 0.6 ? GAIT.walk * (mag / 0.6) : GAIT.brisk);
  }

  /** Distance covered this frame (after collisions): running builds fitness. It costs nothing. */
  moved(dist: number) {
    if (!this.running || dist <= 0) return;
    this.state.data.counters.course_m = Math.round((this.state.data.counters.course_m ?? 0) + dist);
    this.run += dist * (this.sprinting ? SPRINT_FORME : 1);
    while (this.run >= METRES_PER_FORME) { this.run -= METRES_PER_FORME; this.state.count('forme'); }
  }
}
