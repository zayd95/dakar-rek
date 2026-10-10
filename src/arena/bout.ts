import * as THREE from 'three';
import { LambDuel } from '../lamb/duel';
import { STYLES } from '../lamb/rules';
import type { Input } from '../core/input';
import type { WrestlerLook } from '../core/types';
import { rng } from '../core/rng';
import { pilot, type BoutView } from './program';
import type { Opponent } from '../lamb/opponents';
import type { OpponentStyle } from '../lamb/rules';

/** The bout's own time step: fixed, so a bout seeded alike plays out alike on every device (src/arena/together.ts). */
export const BOUT_STEP = 1 / 60;
/**
 * Avec frappe, a gala bout watched from the stands is a short round: almost every one ends by a fall well before (the
 * referee presses a bout that goes nowhere: src/lamb/stand.ts URGE, src/lamb/clinch.ts URGE_CLINCH); at the bell the
 * referee decides on points. With the intro, a watched bout is over within 40 seconds.
 */
export const WATCHED_ROUND = 30;

/**
 * The gala's bout: the existing làmb duel (src/lamb/duel.ts, rules untouched) played by two NPC wrestlers. The duel's
 * « player » side is driven by `pilot()` with the same buttons a player has; the other side is the duel's own opponent
 * AI. Watched from the stands: no duel HUD, no keys, the city HUD stays.
 *
 * Seeded (`seed`: the evening's, program.ts boutSeed) and played in fixed steps (BOUT_STEP) whatever the frame rate, so
 * friends in the stands watch one bout: a device that sits down later plays the same bout up to the same second.
 *
 * Làmb 2.0 (`frappe`, behind ?lamb2): the evening's two roster wrestlers fight avec frappe, AI against AI — strikes,
 * the empoignade, the slip, throws and counters, the fall, the referee — every draw from the duel's seeded `rand`.
 */
export class WatchedBout {
  readonly duel: LambDuel;
  private steer = { x: 0, y: 0 };
  private rand: () => number;
  /** Steps played; time not yet played (less than a step, or what a frame's cap left over). */
  private steps = 0;
  private acc = 0;
  /** Last phase seen, to tell the show about moments (empoignade, fall, decision). */
  private last = '';
  onMoment: (phase: string, info: ReturnType<LambDuel['info']>) => void = () => {};

  /** Avec frappe: the duel plays both sides itself (its autopilot), no pilot. */
  readonly frappe: boolean;

  /**
   * `o`: a preliminary's opponent style (with the young wrestler's name) and level, and a shorter round (seconds);
   * the main event keeps the defaults. Làmb 2.0 (`o.frappe`, behind ?lamb2): the pair fights avec frappe, AI against
   * AI — the left one is the duel's autopilot, the right one its opponent — in a short round (`o.round`, else
   * WATCHED_ROUND); `style` and `level` then come from the pair.
   */
  constructor(origin: { x: number; z: number }, left: WrestlerLook, seed: number,
    o: { style?: OpponentStyle; level?: number; round?: number; frappe?: { left: Opponent; right: Opponent } | null } = {}) {
    this.rand = rng(seed);
    const steer = this.steer;
    const input = { enabled: false, move: () => ({ x: steer.x, y: steer.y }), takeAction: () => false } as unknown as Input;
    const duelSeed = (seed ^ 0x5bd1e995) >>> 0, frappe = o.frappe;
    this.frappe = !!frappe;
    if (frappe) {
      const L = frappe.left, Rt = frappe.right;
      this.duel = new LambDuel({
        origin, look: left, input, crowdSize: 0, mode: 'amical', ring: 7.6, spectate: true, seed: duelSeed, discipline: 'avec_frappe', roundSeconds: o.round ?? WATCHED_ROUND,
        style: { ...STYLES[Rt.wrestler.style], name: Rt.wrestler.name }, level: Rt.level,
        opponent: { attrs: Rt.attrs, stand: Rt.stand, clinch: Rt.clinch, line: Rt.line },
        autopilot: { attrs: L.attrs, stand: L.stand, clinch: L.clinch, style: STYLES[L.wrestler.style], level: L.level },
      });
    } else {
      this.duel = new LambDuel({ origin, look: left, input, crowdSize: 0, mode: 'amical', style: o.style ?? STYLES.rapide, level: o.level ?? 2, ring: 7.6, spectate: true, seed: duelSeed });
      if (o.round) this.duel.timeLeft = Math.min(this.duel.timeLeft, o.round);
    }
  }

  get group(): THREE.Group { return this.duel.group; }
  get over() { return this.duel.phase === 'result' || this.duel.done; }
  get result() { return this.duel.result; }
  /** Seconds of bout played so far (whole steps). */
  get time() { return this.steps * BOUT_STEP; }
  info() { return this.duel.info(); }
  /** Points on both wrestlers (feet, waist, head), for the camera. */
  focus(): THREE.Vector3 {
    const p = this.duel.fighterPoints();
    return new THREE.Vector3((p[1][0] + p[4][0]) / 2, 1.1, (p[1][2] + p[4][2]) / 2);
  }

  /** Plays `dt` more seconds of the bout in fixed steps (at most `maxSteps` in this call: the rest waits for the next). */
  advance(dt: number, maxSteps = 240) {
    this.acc += Math.max(0, dt);
    for (let n = 0; n < maxSteps && this.acc >= BOUT_STEP - 1e-9 && !this.over; n++) { this.step(BOUT_STEP); this.acc -= BOUT_STEP; this.steps++; }
    if (this.over) this.acc = 0;
  }
  /** Time asked for but not played yet (a long catch-up spreads over a few frames). */
  get pending() { return this.acc; }

  private step(dt: number) {
    if (this.frappe) {                                                       // AI against AI inside the duel
      this.duel.update(dt);
      const now = this.duel.info();
      if (now.phase !== this.last) { this.last = now.phase; this.onMoment(now.phase, now); }
      return;
    }
    const v = this.duel.info() as unknown as BoutView;
    const o = pilot(v, this.rand(), dt);
    // approach the opponent: world direction → the duel's screen axes (how input.move() is read)
    const pts = this.duel.fighterPoints(), me = { x: pts[1][0], z: pts[1][2] }, ai = { x: pts[4][0], z: pts[4][2] };
    const dx = ai.x - me.x, dz = ai.z - me.z, len = Math.hypot(dx, dz) || 1, ax = this.duel.axes();
    const wx = (dx / len) * o.approach, wz = (dz / len) * o.approach;
    this.steer.x = wx * ax.right.x + wz * ax.right.z; this.steer.y = wx * ax.fwd.x + wz * ax.fwd.z;
    this.duel.setGuard(o.guard);
    if (o.grab) this.duel.pressGrab();
    for (let k = 0; k < o.taps; k++) this.duel.pressGrab();
    if (o.brk) this.duel.pressBreak();
    this.duel.update(dt);
    const now = this.duel.info();
    if (now.phase !== this.last) { this.last = now.phase; this.onMoment(now.phase, now); }
  }

  dispose() { this.duel.dispose(); }
}
