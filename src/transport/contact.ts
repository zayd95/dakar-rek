import { IMPACT_SPEED } from './vehicleAudio';

/**
 * How a contact FEELS (never how the vehicle moves: that stays in drive.ts). Each frame `driveStep` says whether the vehicle ran into something; left as it was, a vehicle pushed
 * against a wall « hit » on every frame: a sound, a shake of the screen, again and again. A person feels three different things, and so does the game:
 *   – a bump: a slow touch (a parking knock): a soft thud, almost no jolt;
 *   – a hit: a real contact (from IMPACT_SPEED up): a crunch, a jolt of the body and the camera, a buzz of the phone where it can, the more the faster;
 *   – a scrape: the vehicle sliding along the wall: a continuous grind that follows its speed, with no new knock on every frame.
 * An episode starts at the first contact after a short spell without one; it fires ONE bump or hit. Only a real new hit after the rebound (fast enough, and a moment later) fires another.
 */
export type ContactKind = 'bump' | 'hit';
export interface Impact { kind: ContactKind; speed: number; strength: number; headOn: boolean; dir: 1 | -1 }
export interface ContactFrame { impact: Impact | null; scraping: boolean; /** 0…1, follows the speed along the wall. */ scrape: number }

/** Seconds without contact before the next one is a new episode; and the least time between two hits of one episode (the rebound and a new run-up). */
export const REARM = 0.3, RE_HIT = 0.7;
/** Below this (m/s) a slide along a wall is not heard as a scrape. A hit at this speed is the hardest there is (strength 1). */
export const SCRAPE_MIN = 0.8, STRONG = 12;

/** How hard a hit is, 0 at the threshold of a hit, 1 at STRONG. */
export const strengthOf = (speed: number) => Math.max(0, Math.min(1, (Math.abs(speed) - IMPACT_SPEED) / (STRONG - IMPACT_SPEED)));

export class ContactTracker {
  private free = 9; private since = 9; private inContact = false;
  /** Told each frame: the time step, whether it ran into something, and the speed (signed) before and after the step. */
  step(dt: number, hit: boolean, vBefore: number, vAfter: number): ContactFrame {
    this.since += dt;
    if (!hit) { this.free += dt; if (this.free >= REARM) this.inContact = false; return { impact: null, scraping: false, scrape: 0 }; }
    const speed = Math.abs(vBefore), headOn = vAfter * vBefore <= 0;                  // the bounce reverses the speed; a slide keeps its sign
    this.free = 0;
    let impact: Impact | null = null;
    if (speed > 0.5 && (!this.inContact || (speed >= IMPACT_SPEED && this.since >= RE_HIT))) {
      const kind: ContactKind = speed < IMPACT_SPEED ? 'bump' : 'hit';
      impact = { kind, speed, strength: kind === 'hit' ? strengthOf(speed) * (headOn ? 1 : 0.6) : 0, headOn, dir: vBefore >= 0 ? 1 : -1 };   // a glancing blow is softer than a head-on one
      this.since = 0;
    }
    this.inContact = true;
    const scraping = !headOn && speed > SCRAPE_MIN;
    return { impact, scraping, scrape: scraping ? Math.min(1, speed / 8) : 0 };
  }
  reset() { this.free = 9; this.since = 9; this.inContact = false; }
  get active() { return this.inContact; }
}
