import type { DriveSpec } from './spec';
import type { DriveInput } from './drive';

/**
 * Analog driving controls, as pure logic (unit-tested). One stick does two things: forward = how much throttle, left / right = steering, both at once on a diagonal.
 * Two buttons sit under the right thumb: « Accélérer » (held, it lifts the top speed from the ordinary cruising speed to the vehicle's boosted range: faster road
 * travel, not a racing nitro) and « Frein » (held: slows down; once stopped, and still held after a short deliberate pause, a CAR eases into a gentle reverse).
 * A motorbike has no reverse gear: stopped and still braking after the same pause, the rider PUSHES it backwards with both feet (`paddle`), at a walking
 * pace at most, and it stops the moment the brake is let go. There is no reverse gear button, and no jump from forward to reverse: it has to stop first.
 */

/** The stick, the two buttons, and the steering the driver asks for (−1 left … 1 right). `fwd` is the stick's forward push, 0…1. */
export interface DriveCmd { fwd: number; steer: number; boost: boolean; brake: boolean }

/** Seconds the brake must stay held at a standstill before a car starts to reverse (a deliberate hold, never a brush of the thumb). */
export const REVERSE_DELAY = 0.7;
/** Below this speed (m/s) the vehicle counts as stopped for the brake-to-reverse hold. */
export const STOPPED = 0.35;
/** Reverse acceleration (m/s²): gentle. */
export const REVERSE_ACCEL = 1.6;
/** The foot-paddle (a motorbike pushed backwards by its rider): at most a slow walk (m/s), eased in gently. */
export const PADDLE_SPEED = 0.85, PADDLE_ACCEL = 0.9;
/** Boost builds up and fades over these times (s): the speed rises and falls smoothly, never in a step. */
export const BOOST_UP = 0.9, BOOST_DOWN = 1.6;

/** Stick push → share of the speed range: finer at the low end (dense streets), 1 at the top. */
export const throttleCurve = (x: number) => { const c = Math.max(0, Math.min(1, x)); return c * (0.35 + 0.65 * c); };

/** Forward intent from the stick: a diagonal still gets most of the throttle (steering into a bend should not drop to a crawl). */
export const forwardIntent = (sx: number, sy: number) => Math.max(0, Math.min(1, sy * (1 + 0.35 * Math.min(1, Math.abs(sx)))));

export class DriveControls {
  /** 0 … 1, the smoothed Accélérer. */
  boost = 0;
  /** The reverse has been engaged (the brake was held at a standstill long enough) and is still held. */
  reversing = false;
  /** True while the vehicle is ACTUALLY moving backwards: the subtle « R » badge shows for this, never merely because a thumb asks. */
  get showR() { return this.backing && !this.paddle; }
  /** A motorbike being pushed backwards with the feet (the rider's legs go down: src/actors/humanoid.ts 'RidePaddle'). */
  get paddling() { return this.paddle && this.reversing; }
  private backing = false;
  private hold = 0;
  private paddle = false;

  reset() { this.boost = 0; this.reversing = false; this.backing = false; this.hold = 0; }

  /**
   * One step: the driver's command and the vehicle's speed in, what `driveStep` should do out. `canReverse`: true for a car (a gentle reverse),
   * 'paddle' for a motorbike (pushed backwards with the feet: slower, and it stops as soon as the brake is let go), false for none.
   */
  update(dt: number, c: DriveCmd, speed: number, d: DriveSpec, canReverse: boolean | 'paddle'): DriveInput {
    this.paddle = canReverse === 'paddle';
    const top = d.boostSpeed ?? d.maxSpeed;
    const wantBoost = c.boost && !c.brake && speed > -STOPPED ? 1 : 0;
    this.boost += (wantBoost - this.boost) * Math.min(1, (dt / (wantBoost > this.boost ? BOOST_UP : BOOST_DOWN)) * 1.6);
    if (this.boost < 0.002) this.boost = 0;

    let target = 0, braking = false;
    if (c.brake) {
      if (!this.reversing && speed > STOPPED) { this.hold = 0; braking = true; }                    // moving forward: it brakes, however long the thumb stays
      else if (canReverse) {
        if (!this.reversing) { this.hold += dt; if (this.hold >= REVERSE_DELAY) this.reversing = true; }
        if (this.reversing) target = this.paddle ? -PADDLE_SPEED : -d.reverseSpeed; else braking = true;   // stopped: held, waiting for the deliberate hold
      } else braking = true;                                                                         // no reverse at all: the brake holds it
    } else {
      this.hold = 0;
      if (this.reversing && this.paddle) { this.reversing = speed < -0.05; if (speed < 0) braking = true; }   // feet down: the push stops at once, the bike with it
      else if (this.reversing) { if (speed > -0.2) this.reversing = false; }                         // brake let go: no more reverse push, it rolls to a stop (target 0)
      if (!this.reversing) {
        const fwd = c.boost ? 1 : Math.max(0, c.fwd);                                                // the button alone also sets a stopped vehicle off, as the old gas pedal did
        target = (d.maxSpeed + (top - d.maxSpeed) * this.boost) * throttleCurve(fwd);
      } else this.reversing = speed < -0.2;
    }
    this.backing = speed < -0.3;
    return { throttle: target > 0 ? 1 : target < 0 || braking ? -1 : 0, steer: c.steer, target, braking, boost: this.boost, reverseAccel: this.paddle ? PADDLE_ACCEL : REVERSE_ACCEL };
  }
}
