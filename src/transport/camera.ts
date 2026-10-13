import * as THREE from 'three';
import type { Collider } from '../world/types';
import type { CameraAnchor, WorldPose } from './spec';

/**
 * Passenger camera: watching Dakar pass. The view hangs on one of the vehicle's camera anchors (behind the car, at the
 * window, high above). It follows the vehicle without lagging behind it, but its heading eases after the vehicle's in
 * corners (a smooth swing instead of a rigid one), it can be turned by dragging (drifting back a few seconds later),
 * and it is pulled in front of a wall instead of going through it.
 */
export interface Vec3 { x: number; y: number; z: number }

const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Anchor → world for a vehicle at (v.x, v.y, v.z) seen with heading `yaw`, raised by `lift`. In portrait (narrow field
 * of view) the anchor's portrait placement is used when it has one.
 */
export function anchorToWorld(v: { x: number; y: number; z: number }, yaw: number, a: CameraAnchor, lift: number, pos: Vec3, look: Vec3, portrait = false) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const P = portrait && a.portrait ? a.portrait.pos : a.pos, L = portrait && a.portrait ? a.portrait.look : a.look;
  pos.x = v.x + P[0] * c + P[2] * s; pos.z = v.z - P[0] * s + P[2] * c; pos.y = v.y + P[1] + lift;
  look.x = v.x + L[0] * c + L[2] * s; look.z = v.z - L[0] * s + L[2] * c; look.y = v.y + L[1];
}

/** Fraction of the segment from → want that stays out of the colliders (same rule as the follow camera). */
export function clearOfWalls(from: Vec3, want: Vec3, colliders: readonly Collider[], steps = 12): number {
  for (let k = 1; k <= steps; k++) {
    const f = k / steps, x = from.x + (want.x - from.x) * f, y = from.y + (want.y - from.y) * f, z = from.z + (want.z - from.z) * f;
    for (const c of colliders) if (x > c.x0 - 0.4 && x < c.x1 + 0.4 && z > c.z0 - 0.4 && z < c.z1 + 0.4 && y < c.h + 0.5) return Math.max(0.15, (k - 1) / steps);
  }
  return 1;
}

export class PassengerCamera {
  view = 0;
  private yaw = 0;
  private orbit = 0;
  private lift = 0;
  private idle = 0;
  /** Camera and look-at point relative to the vehicle (smoothed there, so there is no lag behind a moving vehicle). */
  private rel = new THREE.Vector3();
  private relLook = new THREE.Vector3();
  private want = new THREE.Vector3();
  private wantLook = new THREE.Vector3();
  private from = new THREE.Vector3();
  private live = false;

  /** Start from where the camera is now (smooth hand-over from the follow camera). */
  begin(camera: THREE.Camera, v: WorldPose) {
    this.rel.set(camera.position.x - v.x, camera.position.y - v.y, camera.position.z - v.z);
    camera.getWorldDirection(this.relLook); this.relLook.multiplyScalar(10).add(this.rel);
    this.yaw = v.yaw; this.orbit = 0; this.lift = 0; this.idle = 0; this.live = true;
  }
  end() { this.live = false; }
  get active() { return this.live; }
  next(count: number) { this.view = (this.view + 1) % count; this.orbit = 0; this.lift = 0; }

  update(dt: number, camera: THREE.PerspectiveCamera, v: WorldPose, bounce: number, anchor: CameraAnchor, drag: { yaw: number; pitch: number }, colliders: readonly Collider[]) {
    if (drag.yaw || drag.pitch) { this.orbit += drag.yaw; this.lift = Math.max(-1.5, Math.min(6, this.lift + drag.pitch * 6)); this.idle = 0; }
    else {
      this.idle += dt;
      if (this.idle > 3) { const k = Math.min(1, dt * 0.8); this.orbit -= wrapAngle(this.orbit) * k; this.lift -= this.lift * k; }
    }
    this.yaw += wrapAngle(v.yaw - this.yaw) * Math.min(1, dt * 3);
    anchorToWorld(v, this.yaw + this.orbit, anchor, this.lift, this.want, this.wantLook, camera.aspect < 1);
    this.want.y += bounce * 0.6;
    this.from.set(v.x, v.y + 2.6, v.z);
    const k = clearOfWalls(this.from, this.want, colliders);
    if (k < 1) this.want.lerpVectors(this.from, this.want, k);
    this.want.x -= v.x; this.want.y -= v.y; this.want.z -= v.z;
    this.wantLook.x -= v.x; this.wantLook.y -= v.y; this.wantLook.z -= v.z;
    const a = 1 - Math.exp(-dt * 5), b = 1 - Math.exp(-dt * 7);
    this.rel.lerp(this.want, a); this.relLook.lerp(this.wantLook, b);
    camera.position.set(v.x + this.rel.x, v.y + this.rel.y, v.z + this.rel.z);
    this.from.set(v.x + this.relLook.x, v.y + this.relLook.y, v.z + this.relLook.z);
    camera.lookAt(this.from);
  }
}
