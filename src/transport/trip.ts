import type { Motion } from './route';

/**
 * The player's trip on a line, as pure logic (unit-tested): wait at a stop → board the vehicle standing there →
 * ride → ask to get off → alight when the vehicle reaches that stop. The module (module.ts) plays the actions it
 * returns (walk to the rear door, pay, sit, step out onto the pavement…).
 *
 * Robust to frames far apart (a slow phone, a busy test machine): besides "standing at the stop now", each vehicle
 * reports the stops it reached since the previous frame, so a stop is never skipped between two frames.
 */
export type TripPhase = 'idle' | 'waiting' | 'boarding' | 'riding' | 'alighting';
export type TripAction = { act: 'board'; vehicle: number } | { act: 'alight' } | null;

/** Starting to wait while a vehicle stands at the stop: it must still stand there this long (else wait for the next). */
export const MIN_STOP = 1.6;

export class TripLogic {
  phase: TripPhase = 'idle';
  /** Stop the player waits at (waiting) or boarded at (riding). */
  stop = -1;
  /** Vehicle index in the line's fleet (boarding, riding, alighting). */
  vehicle = -1;
  /** Stop the player asked to get off at, or −1. */
  alightAt = -1;
  /** Stops reached since boarding. */
  passed = 0;

  reset() { this.phase = 'idle'; this.stop = this.vehicle = this.alightAt = -1; this.passed = 0; }

  wait(stop: number) { this.reset(); this.phase = 'waiting'; this.stop = stop; }

  /** Boarding started on vehicle k (standing at `stop`). */
  boarding(k: number, stop: number) { this.phase = 'boarding'; this.vehicle = k; this.stop = stop; this.alightAt = -1; this.passed = 0; }
  /** Seated: the ride starts. */
  seated() { if (this.phase === 'boarding') this.phase = 'riding'; }

  /** Ask to get off: at the stop the vehicle stands at now if there is still time, otherwise at the next one. */
  request(m: Motion): number {
    this.alightAt = m.dwell >= 0 && m.dwellLeft > MIN_STOP ? m.dwell : m.next;
    return this.alightAt;
  }
  cancelRequest() { this.alightAt = -1; }

  /**
   * Called every frame with each vehicle's motion and the stops each one reached since the previous frame.
   * Returns what to do now.
   */
  step(motions: readonly Motion[], arrivals: readonly (readonly number[])[] = []): TripAction {
    if (this.phase === 'waiting') {
      for (let k = 0; k < motions.length; k++) if (arrivals[k]?.includes(this.stop)) return { act: 'board', vehicle: k };
      for (let k = 0; k < motions.length; k++) { const m = motions[k]; if (m.dwell === this.stop && m.dwellLeft > MIN_STOP) return { act: 'board', vehicle: k }; }
      return null;
    }
    if (this.phase !== 'riding') return null;
    const m = motions[this.vehicle]; if (!m) return null;
    const arrived = arrivals[this.vehicle] ?? [];
    this.passed += arrived.length;
    if (this.alightAt >= 0 && (arrived.includes(this.alightAt) || (m.dwell === this.alightAt && m.dwellLeft > 0))) { this.phase = 'alighting'; return { act: 'alight' }; }
    return null;
  }
}
