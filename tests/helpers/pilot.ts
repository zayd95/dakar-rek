import { DriveControls, type DriveCmd } from '../../src/transport/controls';
import { driveStep, newDriveState, type Blocked } from '../../src/transport/drive';
import type { DriveSpec } from '../../src/transport/spec';
import { wrapAngle } from '../../src/road/network';
import type { Road } from '../../src/road/routes';

/**
 * The pilot's steering law (the same one scripts/lib/roadDrive.mjs flies with the real fingers): pure pursuit toward a point `look` metres ahead on the lane, converted to the stick with the
 * vehicle's own turning model (yaw rate = speed / max(turnRadius, speed² / grip) × steering): steering = curvature × that radius. Exact for the bicycle model, so it holds a bend at any speed.
 */
export function steerFor(err: number, look: number, v: number, d: { turnRadius: number; grip?: number }) {
  const kappa = (2 * Math.sin(err)) / Math.max(6, look), radius = Math.max(d.turnRadius, d.grip ? (v * v) / d.grip : 0);
  return Math.max(-1, Math.min(1, -kappa * radius));
}
export const lookFor = (v: number) => Math.max(14, Math.min(48, 10 + 1.3 * v));

export interface Lap { secs: number; metres: number; maxLateral: number; bumps: number; reversals: number; top: number; left: boolean; wobble: number }

/** Drives a vehicle down a road (a → b, or back) with the analog controls and a pilot, in simulation: the stick's full push (or « Accélérer » too), steering from the pilot's law. */
export function lap(road: Road, d: DriveSpec, { boost = false, back = false, lane = 2.8, from = 40, to = road.length - 40, dt = 1 / 60, limitSecs = 400 } = {}): Lap {
  const ctl = new DriveControls(), dir = back ? -1 : 1, s0 = back ? road.length - from : from, s1 = back ? road.length - to : to;
  const f0 = road.spine.at(s0), s = newDriveState(f0.x, f0.z, f0.yaw + (back ? Math.PI : 0));
  const blocked: Blocked = (x, z, r) => !road.ground.contains(x, z, r);
  let t = 0, bumps = 0, maxLat = 0, reversals = 0, lastSteerSign = 0, last = s.yaw, rate = 0, steerCmd = 0, left = false, top = 0, wob = 0, lastSteer = 0;
  let cur = s0;
  while (t < limitSecs) {
    const p = road.spine.project(s.x, s.z, cur, 160); cur = p.s;
    if ((dir > 0 && p.s >= s1) || (dir < 0 && p.s <= s1)) break;
    maxLat = Math.max(maxLat, Math.abs(p.d)); if (Math.abs(p.d) > 9.5) left = true;
    const v = Math.abs(s.speed), look = Math.min(road.length, Math.max(0, p.s + dir * lookFor(v)));
    const g = road.spine.at(look), lat = dir > 0 ? -lane : lane, ax = g.x + Math.cos(g.yaw) * lat, az = g.z - Math.sin(g.yaw) * lat;
    const err = wrapAngle(Math.atan2(ax - s.x, az - s.z) - s.yaw);
    steerCmd = steerFor(err, Math.hypot(ax - s.x, az - s.z), v, d); void rate;
    const cmd: DriveCmd = { fwd: 1, steer: steerCmd, boost, brake: false };
    const hit = driveStep(s, ctl.update(dt, cmd, s.speed, d, true), d, dt, blocked);
    if (hit) bumps++;
    rate = wrapAngle(s.yaw - last) / dt; last = s.yaw;
    const sg = Math.sign(steerCmd) * (Math.abs(steerCmd) > 0.08 ? 1 : 0);
    if (sg !== 0 && lastSteerSign !== 0 && sg !== lastSteerSign) reversals++;
    if (sg !== 0) lastSteerSign = sg;
    wob += Math.abs(steerCmd - lastSteer); lastSteer = steerCmd;
    top = Math.max(top, s.speed); t += dt;
  }
  return { secs: t, metres: Math.abs(s1 - s0), maxLateral: maxLat, bumps, reversals, top, left, wobble: wob };
}
