import type { GameState } from '../core/state';

/**
 * Getting around on foot — always free (0 F CFA): walk (a light push of the stick, 1.4 m/s; a full push or W, 2.0 m/s: the
 * normal walk), jog (Shift held, or the « Courir » button: 4.2 m/s, sustainable, little stamina) and sprint (double-tap Shift
 * and hold, or « Courir » pressed a second time: 7 m/s, a short burst that drains stamina fast). Jogging and sprinting far
 * builds fitness (« forme », the same counter as the open-air gym): more stamina and a slightly faster sprint. They tire a
 * little (énergie, hygiène: the jog half as much as the sprint), and an exhausted character cannot run.
 */
export const GAIT = { walk: 1.4, brisk: 2.0, jog: 4.2, run: 7.0 } as const;
/** Gait levels asked for: 0 walk, 1 jog, 2 sprint. */
export type RunLevel = 0 | 1 | 2;
/** Two Shift presses this close (s) make a double tap. */
export const DOUBLE_TAP = 0.35;
/** Stamina per second spent jogging (it does not come back while jogging) and sprinting, by fitness. */
export const jogDrain = (forme: number) => Math.max(0.8, 1.5 - forme * 0.006);
export const sprintDrain = (forme: number) => Math.max(8, 16 - forme * 0.07);
/** A sprinted metre counts this much more than a jogged one toward fitness. */
export const SPRINT_FORME = 1.5;
/** Metres jogged for one point of fitness. */
export const METRES_PER_FORME = 400;
/** Below this energy the character is too tired to run. */
export const RUN_MIN_ENERGY = 12;

/**
 * Shift (desktop): held = jog, double-tapped and held = sprint. Fed the key events (with their time in seconds), so a fast
 * double tap is not lost between two slow frames; `level` is read each frame with whether Shift is still held.
 */
export class ShiftTap {
  private last = -9; private armed = false; private down = false;
  press(now: number) { if (this.down) return; this.down = true; this.armed = now - this.last <= DOUBLE_TAP; this.last = now; }
  release() { this.down = false; this.armed = false; }
  level(held: boolean): RunLevel {
    if (!held) { this.down = false; this.armed = false; return 0; }
    return this.armed ? 2 : 1;
  }
}

/**
 * Analog walking (the phone's joystick): the push sets the speed along ONE smooth curve, no gait switches. A small push is a slow walk through a shop, a moderate one the normal walk
 * of a market, a strong one a jog, a fully extended stick a sprint. `mag` is the stick's magnitude after its dead zone, 0…1.
 */
export const ANALOG = {
  /** Speed of the lightest push that moves at all (m/s). */
  creep: 0.45, creepAt: 0.06,
  /** Where each stretch of the curve ends (stick magnitude): slow walk, normal walk, jog; beyond it the run. */
  slowTo: 0.3, walkTo: 0.62, jogTo: 0.88,
  /** Speeds at those points (m/s). */
  walk: GAIT.walk, brisk: 2.1, jog: 4.4,
  /** The sprint needs the stick held nearly fully out for this long (s): brushing the edge of the stick never sprints by accident. */
  sprintAt: 0.93, sprintHold: 0.3,
} as const;
const smooth = (t: number) => { const c = Math.max(0, Math.min(1, t)); return c * c * (3 - 2 * c); };
/** The speed a stick push asks for (m/s), before stamina limits: continuous and increasing from the lightest push to the full one. `run` is the sprint speed at full push. */
export function analogSpeed(mag: number, run: number): number {
  const m = Math.max(0, Math.min(1, mag)), A = ANALOG;
  if (m <= 0) return 0;
  if (m < A.creepAt) return A.creep * (m / A.creepAt);                                  // from standing still, no step
  if (m < A.slowTo) return A.creep + (A.walk - A.creep) * smooth((m - A.creepAt) / (A.slowTo - A.creepAt));
  if (m < A.walkTo) return A.walk + (A.brisk - A.walk) * ((m - A.slowTo) / (A.walkTo - A.slowTo));
  if (m < A.jogTo) return A.brisk + (A.jog - A.brisk) * smooth((m - A.walkTo) / (A.jogTo - A.walkTo));
  return A.jog + (run - A.jog) * smooth((m - A.jogTo) / (1 - A.jogTo));
}

export class Stride {
  stamina = 100;
  /** Jogging or sprinting this frame. */
  running = false;
  /** Sprinting this frame (a subset of `running`). */
  sprinting = false;
  /** Out of breath from a sprint: no sprint until stamina is back to a third (the jog carries on). */
  winded = false;
  /** Stamina at zero: no running at all until a sixth is back. */
  spent = false;
  private run = 0;
  private mode: 'walk' | 'jog' | 'sprint' = 'walk';

  constructor(private state: GameState) {}

  get forme() { return this.state.data.counters.forme ?? 0; }
  /** 100 for anyone, up to 200 for the fittest. */
  maxStamina() { return 100 + Math.min(100, this.forme * 2); }
  /** The sprint's speed (m/s): fitness makes it a little faster. */
  runSpeed() { return GAIT.run * (1 + Math.min(0.12, this.forme * 0.0012)); }
  /** What the body is doing on foot, for the interface (« Footing », « Sprint »). */
  get gait(): 'walk' | 'jog' | 'sprint' { return this.mode; }
  /** Why the character cannot run right now, or null. */
  whyNot(): string | null {
    if (this.spent) return 'Essoufflé…';
    if (this.state.data.needs.energie < RUN_MIN_ENERGY) return 'Trop fatigué pour courir';
    return null;
  }

  /** Target speed this frame for a stick/keys magnitude (0…1) and the gait asked for (0 walk, 1 jog, 2 sprint); updates stamina. */
  target(mag: number, ask: RunLevel | boolean, dt: number): number {
    const level = ask === true ? 1 : ask === false ? 0 : ask, max = this.maxStamina();
    const can = mag > 0.5 && !this.whyNot();
    const sprint = level === 2 && can && !this.winded;
    const jog = !sprint && level >= 1 && can;
    this.running = sprint || jog; this.sprinting = sprint;
    this.mode = sprint ? 'sprint' : jog ? 'jog' : 'walk';
    if (this.running) {
      this.stamina -= dt * (sprint ? sprintDrain(this.forme) : jogDrain(this.forme));
      if (this.stamina <= 0) {
        this.winded = true;
        if (sprint) { this.stamina = max * 0.12; this.sprinting = false; this.mode = 'jog'; }    // the sprint gives out: it falls back to a jog, on a reserve
        else { this.stamina = 0; this.spent = true; this.running = false; this.mode = 'walk'; }
      }
    } else {
      this.stamina = Math.min(max, this.stamina + dt * (mag > 0.05 ? 9 : 18));
      if (this.winded && this.stamina >= max / 3) this.winded = false;
    }
    if (this.spent && this.stamina >= max / 6) this.spent = false;
    if (this.sprinting) return this.runSpeed() * mag;
    if (this.mode === 'jog') return GAIT.jog * mag;
    return mag < 0.6 ? GAIT.walk * (mag / 0.6) : GAIT.brisk;
  }

  private full = 0;
  /**
   * Target speed this frame for the analog stick (`mag` 0…1): the curve above, limited by stamina and energy exactly like the button gaits (a winded character cannot sprint, a spent or
   * exhausted one cannot run), and the sprint zone only opens once the stick has been fully out for a moment. Updates stamina and the gait the interface names.
   */
  analog(mag: number, dt: number): number {
    const max = this.maxStamina(), A = ANALOG, run = this.runSpeed();
    this.full = mag >= A.sprintAt ? this.full + dt : Math.max(0, this.full - dt * 2);
    let v = analogSpeed(mag, run);
    if (this.whyNot()) v = Math.min(v, A.brisk);                                       // too tired, or out of breath: no running at all
    else if (this.winded || this.full < A.sprintHold) v = Math.min(v, A.jog);          // no sprint until held, and none while winded: the jog carries on
    const jogK = Math.max(0, Math.min(1, (v - A.brisk) / (A.jog - A.brisk))), sprintK = Math.max(0, Math.min(1, (v - A.jog) / Math.max(0.1, run - A.jog)));
    this.sprinting = sprintK > 0.35; this.running = jogK > 0.25;
    this.mode = this.sprinting ? 'sprint' : this.running ? 'jog' : 'walk';
    if (this.running) {
      this.stamina -= dt * (jogDrain(this.forme) * jogK + (sprintDrain(this.forme) - jogDrain(this.forme)) * sprintK);
      if (this.stamina <= 0) {
        this.winded = true;
        if (this.sprinting) { this.stamina = max * 0.12; this.sprinting = false; this.mode = 'jog'; v = Math.min(v, A.jog); }
        else { this.stamina = 0; this.spent = true; this.running = false; this.mode = 'walk'; v = Math.min(v, A.brisk); }
      }
    } else {
      this.stamina = Math.min(max, this.stamina + dt * (mag > 0.05 ? 9 : 18));
      if (this.winded && this.stamina >= max / 3) this.winded = false;
    }
    if (this.spent && this.stamina >= max / 6) this.spent = false;
    return v;
  }

  /** Distance covered this frame (after collisions): jogging and sprinting build fitness and cost a little energy (the jog half of the sprint). */
  moved(dist: number) {
    if (!this.running || dist <= 0) return;
    const k = this.sprinting ? 1 : 0.5;
    this.state.adjust({ energie: -dist * 0.012 * k, hygiene: -dist * 0.006 * k });
    this.state.data.counters.course_m = Math.round((this.state.data.counters.course_m ?? 0) + dist);
    this.run += dist * (this.sprinting ? SPRINT_FORME : 1);
    while (this.run >= METRES_PER_FORME) { this.run -= METRES_PER_FORME; this.state.count('forme'); }
  }
}
