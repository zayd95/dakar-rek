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
  /** How far the brake has built up, 0…1: a hard stop eases in over a moment instead of biting at once (analog model). */
  brakeK?: number;
}
export interface DriveInput {
  throttle: number; steer: number;
  /** Analog controls (src/transport/controls.ts): the speed to head for (m/s, negative = reverse), whether the driver is braking, how far « Accélérer » is open (0…1), reverse acceleration. */
  target?: number; braking?: boolean; boost?: number; reverseAccel?: number;
}

/** Is a circle of radius r at (x, z) inside something solid? */
export type Blocked = (x: number, z: number, r: number) => boolean;

export const newDriveState = (x: number, z: number, yaw: number): DriveState => ({ x, z, yaw, speed: 0, steer: 0, accel: 0, odo: 0, brakeK: 0 });

/**
 * The steering asked for from the stick (analog model): at a walking pace finer around the centre, so a thumb's small wobble in a tight street is not a swerve;
 * from about 30 km/h straight in proportion to the stick (predictable at speed). Full lock at full push always.
 */
export const steerCurve = (x: number, speed = 0) => { const c = Math.max(-1, Math.min(1, x)), e = 1 + 0.25 * Math.max(0, 1 - Math.abs(speed) / 8); return Math.sign(c) * Math.abs(c) ** e; };
/** The brake's build-up time (s) and the share it bites with at once. */
export const BRAKE_RAMP = 0.3, BRAKE_START = 0.45;

/**
 * « Descendre » asked while the vehicle still moves: brake to a standstill and no further. Asking for the other way instead overshoots on a slow frame (a
 * motorbike's 8.5 m/s² over 0.1 s is 0.85 m/s, more than the ±0.3 m/s the rider waits for), and the speed then swings to and fro without ever stopping.
 */
export const stopping = (): DriveInput => ({ throttle: 0, steer: 0, target: 0, braking: true });

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
  const analog = inp.target !== undefined, v0 = Math.abs(s.speed);
  // steering: the wheel follows the stick, more slowly the faster the vehicle goes (the analog model), so a fast bike or car does not wobble; finer around the
  // centre; and it comes back to straight more readily than it turns in (the self-centring of a real wheel), so letting go of the stick straightens the car
  const want = d.grip ? steerCurve(inp.steer, v0) : Math.max(-1, Math.min(1, inp.steer));
  const back = d.grip && Math.abs(want) < Math.abs(s.steer) && Math.sign(want) !== -Math.sign(s.steer);
  const follow = (d.grip ? d.steer / (1 + 0.035 * v0) : d.steer) * (back ? 1.3 : 1);
  s.steer += (want - s.steer) * Math.min(1, follow * dt);
  const target = analog ? inp.target! : targetSpeed(d, s.speed, inp.throttle);
  const before = s.speed;
  let rate: number;
  if (analog) {
    const sameWay = Math.sign(target) === Math.sign(s.speed) || (target === 0 && s.speed > 0) || v0 < 0.3, top = d.boostSpeed ?? d.maxSpeed;
    // the brake builds up over a moment (no snap of the nose at the first touch), and lets go at once
    s.brakeK = inp.braking ? Math.min(1, (s.brakeK ?? 0) + dt / BRAKE_RAMP) : 0;
    if (inp.braking) rate = d.brake * (BRAKE_START + (1 - BRAKE_START) * s.brakeK);
    else if (Math.abs(target) > Math.abs(s.speed) && sameWay) rate = (target < 0 ? inp.reverseAccel ?? 1.6 : d.accel * (1 - 0.5 * v0 / top) * (1 + 0.25 * (inp.boost ?? 0)));
    else if (!sameWay) rate = d.brake * 0.8;                                         // asked the other way: it stops first
    else rate = Math.min(2.2, COAST + 0.06 * Math.abs(s.speed - target));   // lifting off: engine braking, stronger the further above the target
  } else {
    const speeding = Math.sign(target) === Math.sign(s.speed) && Math.abs(target) > Math.abs(s.speed);
    rate = speeding ? d.accel * (1 - 0.6 * Math.abs(s.speed) / d.maxSpeed) : Math.abs(inp.throttle) > 0.05 ? d.brake : COAST;
  }
  const dv = target - s.speed;
  s.speed += Math.sign(dv) * Math.min(Math.abs(dv), rate * dt);
  if (Math.abs(s.speed) < 0.02 && Math.abs(target) < 0.02) s.speed = 0;
  s.accel = dt > 0 ? (s.speed - before) / dt : 0;
  // bicycle model: yaw rate = speed / radius × steering. Analog model: the radius grows with speed (v² / grip), so the lateral acceleration stays within what the tyres hold.
  const yawRate = d.grip
    ? (s.speed / Math.max(d.turnRadius, (s.speed * s.speed) / d.grip)) * s.steer
    : (s.speed / d.turnRadius) * s.steer * (1 - 0.45 * Math.min(1, Math.abs(s.speed) / d.maxSpeed));
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

/** The longest stretch (m) a vehicle moves between two looks at what is in its way: a car at 200 km/h covers 5 m in a slow frame, more than a wall is thick. */
export const MAX_STEP = 0.5;
/**
 * `driveStep` in as many equal steps as the speed needs to keep each under MAX_STEP (at most 12 per call). It stops at the first contact: the rest of the frame is
 * dropped rather than bouncing again and again in one frame. Slow vehicles (a step under MAX_STEP) run exactly one `driveStep`, as before.
 */
export function driveSteps(s: DriveState, inp: DriveInput, d: DriveSpec, dt: number, blocked: Blocked): boolean {
  const n = Math.min(12, Math.max(1, Math.ceil((Math.abs(s.speed) * dt) / MAX_STEP))), h = dt / n;
  for (let i = 0; i < n; i++) if (driveStep(s, inp, d, h, blocked)) return true;
  return false;
}
