import { DriveControls, PADDLE_SPEED, type DriveCmd } from '../../src/transport/controls';
import { driveSteps, newDriveState, type Blocked, type DriveState } from '../../src/transport/drive';
import type { DriveSpec } from '../../src/transport/spec';

/**
 * The measured audit of a vehicle's handling (docs/DRIVING_FEEL.md, « Before and after »): the real controls (`DriveControls`) and the real drive step (`driveSteps`) at 60 Hz with a
 * scripted foot, no browser. Times are game seconds, distances metres, speeds km/h. The numbers are what the physics does, not what a phone feels like.
 */
export interface Audit {
  /** Seconds from rest to 50 km/h and to the cruising speed with the pedal down; to 100 km/h with the foot kept down (the boosted range opens after 0.8 s, as on the pad). */
  to50: number; toCruise: number; to100: number;
  cruiseKmh: number; topKmh: number;
  /** Seconds from rest to 95 % of the boosted top speed. */
  toTop: number;
  /** Metres and seconds to stop from the cruising speed, and metres from 100 km/h. */
  brakeCruise: number; brakeCruiseS: number; brake100: number;
  /** The circle's radius (m) at a walking pace on full lock, the width a U-turn needs between walls (m), and the radius the tyres allow at 50 km/h and at the cruising speed. */
  radiusLow: number; uTurn: number; radius50: number; radiusCruise: number;
  /** Seconds for the wheel to reach 90 % of the lock asked for: at a standstill, at the cruising speed. */
  lock0: number; lockCruise: number;
  /** Seconds to have backed 3 m from a standstill with the brake held (a motorbike is pushed with the feet: slow on purpose). */
  back3: number; reverseKmh: number;
  /** Nose into a wall at 30 km/h with the pedal down, then the brake held: seconds from the hit until the bumper is 2.5 m clear of it. */
  unwedge: number;
  /** A wall met at 20° at 45 km/h, the pedal kept down: the share of the speed left one second later (against the same second with no wall). */
  glanceKeep: number;
}

const DT = 1 / 60, free: Blocked = () => false;
const idle: DriveCmd = { fwd: 0, steer: 0, boost: false, brake: false };
const KMH = 3.6;

function sim(d: DriveSpec, canReverse: boolean | 'paddle', s: DriveState, ctl: DriveControls, cmd: (t: number) => DriveCmd, until: (s: DriveState, t: number) => boolean, blocked: Blocked = free, limit = 120) {
  let t = 0;
  while (t < limit && !until(s, t)) { driveSteps(s, ctl.update(DT, cmd(t), s.speed, d, canReverse), d, DT, blocked); t += DT; }
  return t;
}

export function audit(d: DriveSpec, moto = false): Audit {
  const rev = moto ? 'paddle' as const : true, top = d.boostSpeed ?? d.maxSpeed, r1 = (x: number) => Math.round(x * 10) / 10;
  const fresh = () => ({ s: newDriveState(0, 0, 0), ctl: new DriveControls() });
  const gas = (t: number): DriveCmd => ({ ...idle, fwd: 1, boost: t > 0.8 });
  let a = fresh();
  const to50 = sim(d, rev, a.s, a.ctl, () => ({ ...idle, fwd: 1 }), s => s.speed >= 50 / KMH);
  a = fresh();
  const toCruise = sim(d, rev, a.s, a.ctl, () => ({ ...idle, fwd: 1 }), s => s.speed >= d.maxSpeed * 0.98);
  a = fresh();
  const to100 = sim(d, rev, a.s, a.ctl, gas, s => s.speed >= 100 / KMH);
  a = fresh();
  const toTop = sim(d, rev, a.s, a.ctl, gas, s => s.speed >= top * 0.95);
  // braking
  const stopFrom = (v: number) => { const b = fresh(); b.s.speed = v; const z0 = b.s.z; const secs = sim(d, rev, b.s, b.ctl, () => ({ ...idle, brake: true }), s => s.speed <= 0.05); return { m: b.s.z - z0, secs }; };
  const bc = stopFrom(d.maxSpeed), b100 = stopFrom(Math.min(top, 100 / KMH));
  // the circle at a walking pace on full lock (the yaw rate once the wheel is over), and what the tyres hold at the cruising speed
  const b = fresh(); b.s.speed = 2.5; b.s.steer = 1;
  let yaw0 = 0, tt = 0;
  sim(d, rev, b.s, b.ctl, () => ({ ...idle, fwd: 0.35, steer: 1 }), (s, t) => { if (t < 2) { yaw0 = s.yaw; tt = t; } return t > 4; });
  const rate = Math.abs(b.s.yaw - yaw0) / (4 - tt), radiusLow = Math.abs(b.s.speed) / rate;
  const radiusAt = (v: number) => Math.max(d.turnRadius, d.grip ? (v * v) / d.grip : d.turnRadius), radiusCruise = radiusAt(d.maxSpeed);
  // the wheel's answer to the thumb
  const lockAt = (v: number) => { const c = fresh(); c.s.speed = v; return sim(d, rev, c.s, c.ctl, () => ({ ...idle, fwd: v > 0 ? 1 : 0, steer: 1 }), s => Math.abs(s.steer) >= 0.9, free, 10); };
  // the reverse
  const e = fresh(); const back3 = sim(d, rev, e.s, e.ctl, () => ({ ...idle, brake: true }), s => s.z <= -3, free, 30);
  const reverseKmh = moto ? PADDLE_SPEED * KMH : d.reverseSpeed * KMH;
  // nose into a wall across the road at z = 30 at 30 km/h; the driver keeps the pedal down half a second more (the time to change pedals), then holds the brake
  const wall: Blocked = (_x, z, r) => z + r > 30 && z - r < 30.3;
  const w = fresh(); w.s.z = 30 - d.halfLength - 6; w.s.speed = 30 / KMH;
  let hitAt = -1, tw = 0;
  while (tw < 40 && !(hitAt >= 0 && w.s.z + d.halfLength < 30 - 2.5)) {
    const cmd: DriveCmd = hitAt < 0 || tw - hitAt < 0.5 ? { ...idle, fwd: 1 } : { ...idle, brake: true };
    if (driveSteps(w.s, w.ctl.update(DT, cmd, w.s.speed, d, rev), d, DT, wall) && hitAt < 0) hitAt = tw;
    tw += DT;
  }
  const unwedge = hitAt < 0 || tw >= 40 ? NaN : tw - hitAt - 0.5;
  // a glancing contact: a wall along the road at x = 3, met at 20° at 45 km/h with the pedal kept down; against the same second of driving with no wall
  const side: Blocked = (x, _z, r) => x + r > 3;
  const glance = (blocked: Blocked) => {
    const g = fresh(); g.s.yaw = 0.35; g.s.x = 3 - d.halfWidth - d.halfLength * 0.35 - 0.3; g.s.speed = 45 / KMH;
    let touched = -1;
    sim(d, rev, g.s, g.ctl, () => ({ ...idle, fwd: 1 }), (s, t) => { if (touched < 0 && s.x > 3 - d.halfWidth - d.halfLength * 0.35 - 0.05) touched = t; return touched >= 0 && t - touched >= 1; }, blocked, 10);
    return g.s.speed;
  };
  const v1 = glance(side) / glance(free);
  return {
    to50: r1(to50), toCruise: r1(toCruise), to100: r1(to100), cruiseKmh: Math.round(d.maxSpeed * KMH), topKmh: Math.round(top * KMH), toTop: r1(toTop),
    brakeCruise: r1(bc.m), brakeCruiseS: r1(bc.secs), brake100: r1(b100.m),
    radiusLow: r1(radiusLow), uTurn: r1(2 * radiusLow + 2 * d.halfWidth), radius50: r1(radiusAt(50 / KMH)), radiusCruise: r1(radiusCruise),
    lock0: Math.round(lockAt(0) * 100) / 100, lockCruise: Math.round(lockAt(d.maxSpeed) * 100) / 100,
    back3: r1(back3), reverseKmh: r1(reverseKmh), unwedge: r1(unwedge), glanceKeep: Math.round(v1 * 100) / 100,
  };
}
