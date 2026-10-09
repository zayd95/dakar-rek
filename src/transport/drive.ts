import type { DriveSpec } from './spec';

/**
 * Drive mode, as pure logic (unit-tested): the stick becomes throttle and steering, a simple bicycle model moves the
 * vehicle, and it never enters a wall. Readable rather than realistic: up = accelerate, down = brake then reverse,
 * left / right = steer, releasing the stick coasts to a stop.
 *
 * Game conventions: yaw 0 faces +z, forward = (sin yaw, cos yaw); turning right lowers the yaw.
 */
export interface DriveState {
  x: number; z: number; yaw: number;
  /** m/s along the heading (negative = reversing). */
  speed: number;
  /** Smoothed steering −1 (left) … 1 (right). */
  steer: number;
  /** Longitudinal acceleration this step (the body pitches with it). */
  accel: number;
  /** Metres travelled (road bumps). */
  odo: number;
}
export interface DriveInput { throttle: number; steer: number }

/** Is a circle of radius r at (x, z) inside something solid? */
export type Blocked = (x: number, z: number, r: number) => boolean;

export const newDriveState = (x: number, z: number, yaw: number): DriveState => ({ x, z, yaw, speed: 0, steer: 0, accel: 0, odo: 0 });

/** Coasting deceleration with the throttle released (m/s²). */
const COAST = 1.4;

/** Speed the vehicle heads for, given the throttle (positive forward, negative brake-then-reverse). */
export function targetSpeed(d: DriveSpec, speed: number, throttle: number): number {
  if (throttle > 0.05) return d.maxSpeed * Math.min(1, throttle);
  if (throttle < -0.05) return speed > 0.4 ? 0 : -d.reverseSpeed * Math.min(1, -throttle);
  return 0;
}

/**
 * Footprint test of the vehicle at (x, z, yaw): circles of halfWidth × k along its axis, from the front to the back,
 * close enough that the sides have no gap a wall corner could slip into (3 for a motorbike-sized footprint, 5 for a car).
 */
export function hits(d: DriveSpec, x: number, z: number, yaw: number, blocked: Blocked, k = 1) {
  const fx = Math.sin(yaw), fz = Math.cos(yaw), l = Math.max(0, d.halfLength - d.halfWidth), r = d.halfWidth * k;
  const n = Math.max(1, Math.ceil(l / (d.halfWidth * 0.75)));       // circles each side of the middle one
  if (blocked(x, z, r)) return true;
  for (let i = 1; i <= n; i++) {
    const t = (l * i) / n;
    if (blocked(x + fx * t, z + fz * t, r) || blocked(x - fx * t, z - fz * t, r)) return true;
  }
  return false;
}

/**
 * Advance by dt. Returns true when the vehicle ran into something this step (it stops against it, sliding along a
 * wall when it meets it at an angle).
 */
export function driveStep(s: DriveState, inp: DriveInput, d: DriveSpec, dt: number, blocked: Blocked): boolean {
  s.steer += (Math.max(-1, Math.min(1, inp.steer)) - s.steer) * Math.min(1, d.steer * dt);
  const target = targetSpeed(d, s.speed, inp.throttle);
  const before = s.speed;
  const speeding = Math.sign(target) === Math.sign(s.speed) && Math.abs(target) > Math.abs(s.speed);
  const rate = speeding ? d.accel * (1 - 0.6 * Math.abs(s.speed) / d.maxSpeed) : Math.abs(inp.throttle) > 0.05 ? d.brake : COAST;
  const dv = target - s.speed;
  s.speed += Math.sign(dv) * Math.min(Math.abs(dv), rate * dt);
  if (Math.abs(s.speed) < 0.02 && Math.abs(target) < 0.02) s.speed = 0;
  s.accel = dt > 0 ? (s.speed - before) / dt : 0;
  // bicycle model: yaw rate = speed / radius × steering; steering softens at speed so the bike stays controllable
  const soft = 1 - 0.45 * Math.min(1, Math.abs(s.speed) / d.maxSpeed);
  const yawRate = (s.speed / d.turnRadius) * s.steer * soft;
  const yaw = s.yaw - yawRate * dt;
  const step = s.speed * dt;
  const nx = s.x + Math.sin(yaw) * step, nz = s.z + Math.cos(yaw) * step;
  // already touching something (left against a wall, a car pulled up beside): it may creep out, not go deeper in
  const stuck = hits(d, s.x, s.z, s.yaw, blocked);
  if (stuck ? !hits(d, nx, nz, yaw, blocked, 0.4) : !hits(d, nx, nz, yaw, blocked)) { s.x = nx; s.z = nz; s.yaw = yaw; s.odo += Math.abs(step); return false; }
  // slide along the wall: keep the free component of the move, at reduced speed
  if (!hits(d, nx, s.z, yaw, blocked)) { s.odo += Math.abs(nx - s.x); s.x = nx; s.yaw = yaw; s.speed *= 0.6; return true; }
  if (!hits(d, s.x, nz, yaw, blocked)) { s.odo += Math.abs(nz - s.z); s.z = nz; s.yaw = yaw; s.speed *= 0.6; return true; }
  if (!hits(d, s.x, s.z, yaw, blocked)) s.yaw = yaw;
  s.speed = -s.speed * 0.15;                                    // a small bounce back
  return true;
}
