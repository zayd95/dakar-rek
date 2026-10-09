/**
 * The grill job is a gesture, not a progress bar: skewers go on the fire one after the other; each one browns, and the
 * player flips it (the action button, « Retourner ») when it is golden. Too early: it is still raw, keep watching. A bit
 * late: overcooked, it still sells. Too late: burnt, lost. The shift pays the rung's pay scaled by how well the batch
 * was cooked. Pure logic (no Three.js): the venue draws the skewer and calls `update` and `flip`.
 */
export type Doneness = 'cru' | 'dore' | 'trop' | 'brule';
export type FlipResult = 'trop_tot' | 'parfait' | 'trop_cuit' | 'brule';

/** Fraction of the cooking time: golden from 0.6 to 0.85, overcooked until 1.1, burnt after. */
export const GOLDEN: readonly [number, number] = [0.6, 0.85];
export const BURNT = 1.1;

export function doneness(f: number): Doneness {
  return f < GOLDEN[0] ? 'cru' : f < GOLDEN[1] ? 'dore' : f < BURNT ? 'trop' : 'brule';
}
/** Points of a flipped skewer: golden 1, overcooked 0.6, burnt 0. */
export const SCORE: Record<Exclude<FlipResult, 'trop_tot'>, number> = { parfait: 1, trop_cuit: 0.6, brule: 0 };

/** What a shift pays: 40 % of the rung's pay for showing up, the rest for the batch's quality (rounded to 50 F). */
export function shiftPay(pay: number, points: number, skewers: number): number {
  const q = skewers > 0 ? Math.max(0, Math.min(1, points / skewers)) : 0;
  return Math.round((pay * (0.4 + 0.6 * q)) / 50) * 50;
}

export interface ShiftSpec { skewers: number; seconds: number }

export class GrillShift {
  /** Index of the skewer on the fire; time it has been cooking. */
  i = 0; t = 0;
  results: Exclude<FlipResult, 'trop_tot'>[] = [];
  constructor(readonly spec: ShiftSpec) {}

  get done() { return this.i >= this.spec.skewers; }
  /** Cooking fraction of the current skewer (0 raw … 1 fully cooked … burnt after BURNT). */
  get f() { return this.t / this.spec.seconds; }
  get points() { return this.results.reduce((s, r) => s + SCORE[r], 0); }
  get golden() { return this.results.filter(r => r === 'parfait').length; }

  /** Advance the fire; returns 'brule' when the skewer on the fire burnt (it is lost and the next one goes on). */
  update(dt: number): 'brule' | null {
    if (this.done) return null;
    this.t += dt;
    if (this.f >= BURNT + 0.15) { this.next('brule'); return 'brule'; }
    return null;
  }

  /** The player flips the skewer on the fire. */
  flip(): FlipResult | null {
    if (this.done) return null;
    const d = doneness(this.f);
    if (d === 'cru') return 'trop_tot';
    const r = d === 'dore' ? 'parfait' : d === 'trop' ? 'trop_cuit' : 'brule';
    this.next(r);
    return r;
  }

  private next(r: Exclude<FlipResult, 'trop_tot'>) { this.results.push(r); this.i++; this.t = 0; }
}
