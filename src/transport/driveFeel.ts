/**
 * How the player drives, as the city sees it (pure tracker, unit-tested in tests/driveFeel.test.ts): the driven vehicle reports its state every frame (`report`) and its contacts
 * (`crash`, `bump`); this turns them into the events the people around react to. The passenger of a ride (src/transport/vtcBanter.ts) says « Dawalal ndank » when the car is fast, and the
 * street (src/crowd/streetReact.ts) steps back and shouts when it passes close. One tracker for the page: the vehicle that is driven reports, anyone may listen.
 *
 * Speeds are m/s: a car cruises at 19 (68 km/h) and, with the foot held down, opens up to 45–55 (160–200 km/h). `FAST` (76 km/h) is above the cruising speed, `VERY_FAST` (119 km/h) is not a speed for a town street.
 */
export const FAST = 21, VERY_FAST = 33;
/** Seconds above `FAST` / `VERY_FAST` before it counts (a burst is not speeding), and seconds below before it can count again. */
export const FAST_FOR = 1.8, VERY_FAST_FOR = 0.9, CALM_AFTER = 2.5;
/** Braking harder than this (m/s²) from at least this speed (m/s) is a hard brake. */
export const HARD_BRAKE = 7.2, HARD_FROM = 8;
/** A crawl: moving, but slower than this (m/s) for this long (s); a stop is not a crawl. */
export const CRAWL = 3.2, CRAWL_FOR = 7;
/** Seconds of driving with none of the above before the ride counts as smooth, and between two such. */
export const SMOOTH_AFTER = 26;

export type DriveEventKind = 'fast' | 'veryFast' | 'hardBrake' | 'crash' | 'bump' | 'crawl' | 'smooth' | 'honk';
export interface DriveEvent { kind: DriveEventKind; /** The drive clock (s). */ t: number; speed: number; /** 0…1 for a crash or a bump. */ strength: number }
export interface DriveSnap { hub: string; x: number; z: number; yaw: number; speed: number; /** The cruising speed of the vehicle (m/s). */ top: number; kind: 'car' | 'moto' }

export class DriveFeel {
  /** Where the driven vehicle is now; null when nobody drives. */
  snap: DriveSnap | null = null;
  /** The drive clock: seconds of driving since the last `idle`. */
  clock = 0;
  /** What has happened since the drive began (the checks, and the passenger's tally). */
  readonly tally = { fast: 0, veryFast: 0, hardBrake: 0, crash: 0, bump: 0, crawl: 0, smooth: 0, honk: 0 };
  private listeners = new Set<(e: DriveEvent) => void>();
  private above = 0; private aboveVery = 0; private below = 0; private armed = true; private armedVery = true;
  private slow = 0; private calm = 0; private lastSpeed = 0; private horn = false; private hardLatched = false; private eased = 0;

  /** Listens to the drive's events; returns the way to stop. */
  on(fn: (e: DriveEvent) => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private emit(kind: DriveEventKind, speed: number, strength = 0) {
    this.tally[kind]++;
    const e: DriveEvent = { kind, t: this.clock, speed, strength };
    for (const f of [...this.listeners]) f(e);
    if (kind !== 'smooth' && kind !== 'honk') this.calm = 0;
  }

  /** One frame of the driven vehicle (`horn`: the horn is held). */
  report(s: DriveSnap, dt: number, horn = false) {
    if (dt <= 0) return;
    const first = !this.snap; this.snap = s; this.clock += dt;
    const v = Math.abs(s.speed), prev = first ? v : this.lastSpeed; this.lastSpeed = v;
    // fast, and very fast: above the line for a while; once it has counted, the speed must come back down for a while before it can count again
    if (v >= FAST) { this.above += dt; this.below = 0; } else { this.above = 0; this.below += dt; if (this.below >= CALM_AFTER) this.armed = this.armedVery = true; }
    if (v >= VERY_FAST) this.aboveVery += dt; else this.aboveVery = 0;
    if (this.armedVery && this.aboveVery >= VERY_FAST_FOR) { this.armedVery = false; this.armed = false; this.emit('veryFast', v); }
    else if (this.armed && this.above >= FAST_FOR) { this.armed = false; this.emit('fast', v); }
    // a hard brake: the speed falls fast from a real speed; one per braking, the next one only after the car has stopped slowing hard for a moment
    const decel = (prev - v) / dt;
    if (decel >= HARD_BRAKE && prev >= HARD_FROM && !this.hardLatched) { this.hardLatched = true; this.emit('hardBrake', prev, Math.min(1, decel / 14)); }
    else if (decel < HARD_BRAKE * 0.4) { this.eased += dt; if (this.eased >= 0.6) this.hardLatched = false; } else this.eased = 0;
    // a crawl
    if (v > 0.4 && v < CRAWL) { this.slow += dt; if (this.slow >= CRAWL_FOR) { this.slow = 0; this.emit('crawl', v); } } else if (v >= CRAWL || v <= 0.4) this.slow = 0;
    // smooth: long enough without any of it, at a real speed
    if (v > 4) { this.calm += dt; if (this.calm >= SMOOTH_AFTER) { this.calm = 0; this.emit('smooth', v); } }
    if (horn && !this.horn) this.emit('honk', v);
    this.horn = horn;
  }
  /** The vehicle hit something (strength 0…1). */
  crash(strength: number, speed: number) { this.emit('crash', speed, Math.max(0, Math.min(1, strength))); }
  /** A soft knock (a kerb, a post). */
  bump(speed: number) { this.emit('bump', speed, 0.25); }
  /** Nobody drives any more. */
  idle() {
    this.snap = null; this.clock = 0; this.above = this.aboveVery = this.below = this.slow = this.calm = this.lastSpeed = this.eased = 0; this.armed = this.armedVery = true; this.horn = false; this.hardLatched = false;
    for (const k of Object.keys(this.tally) as (keyof DriveFeel['tally'])[]) this.tally[k] = 0;
  }
}
export const driveFeel = new DriveFeel();
