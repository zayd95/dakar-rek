import type { GameState } from '../core/state';

/**
 * Getting around on foot — always free (0 F CFA): walk (a light push of the stick), brisk walk (the default), run
 * (Shift, or the « Courir » button on phones) while stamina lasts. Running far builds fitness (« forme », the same
 * counter as the open-air gym): more stamina and a slightly faster run. Running tires a little (énergie), and an
 * exhausted character cannot run.
 */
export const GAIT = { walk: 2.2, brisk: 4.2, run: 7.0 } as const;
/** Metres run for one point of fitness. */
export const METRES_PER_FORME = 400;
/** Below this energy the character is too tired to run. */
export const RUN_MIN_ENERGY = 12;

export class Stride {
  stamina = 100;
  running = false;
  /** Out of breath: no running until stamina is back to a third. */
  winded = false;
  private run = 0;

  constructor(private state: GameState) {}

  get forme() { return this.state.data.counters.forme ?? 0; }
  /** 100 for anyone, up to 200 for the fittest. */
  maxStamina() { return 100 + Math.min(100, this.forme * 2); }
  runSpeed() { return GAIT.run * (1 + Math.min(0.12, this.forme * 0.0012)); }
  /** Why the character cannot run right now, or null. */
  whyNot(): string | null {
    if (this.winded) return 'Essoufflé…';
    if (this.state.data.needs.energie < RUN_MIN_ENERGY) return 'Trop fatigué pour courir';
    return null;
  }

  /** Target speed this frame for a stick/keys magnitude (0…1) and the run request; updates stamina. */
  target(mag: number, wantRun: boolean, dt: number): number {
    const max = this.maxStamina();
    this.running = wantRun && mag > 0.5 && !this.whyNot();
    if (this.running) {
      this.stamina -= dt * Math.max(7, 14 - this.forme * 0.06);
      if (this.stamina <= 0) { this.stamina = 0; this.winded = true; this.running = false; }
    } else {
      this.stamina = Math.min(max, this.stamina + dt * (mag > 0.05 ? 9 : 18));
      if (this.winded && this.stamina >= max / 3) this.winded = false;
    }
    if (this.running) return this.runSpeed() * mag;
    return mag < 0.6 ? GAIT.walk * (mag / 0.6) : GAIT.brisk;
  }

  /** Distance covered this frame (after collisions): running builds fitness and costs a little energy. */
  moved(dist: number) {
    if (!this.running || dist <= 0) return;
    this.state.adjust({ energie: -dist * 0.012, hygiene: -dist * 0.006 });
    this.run += dist;
    this.state.data.counters.course_m = Math.round((this.state.data.counters.course_m ?? 0) + dist);
    while (this.run >= METRES_PER_FORME) { this.run -= METRES_PER_FORME; this.state.count('forme'); }
  }
}
