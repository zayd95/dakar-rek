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
export function clearOfWalls(from: Vec3, want: Vec3, colliders: readonly Collider[], steps = 12, pad = 0.4): number {
  for (let k = 1; k <= steps; k++) {
    const f = k / steps, x = from.x + (want.x - from.x) * f, y = from.y + (want.y - from.y) * f, z = from.z + (want.z - from.z) * f;
    for (const c of colliders) if (x > c.x0 - pad && x < c.x1 + pad && z > c.z0 - pad && z < c.z1 + pad && y < c.h + 0.5) return Math.max(0.15, (k - 1) / steps);
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
  private eye = new THREE.Vector3();
  private live = false;
  private baseFov = 0;
  private speedK = 0;
  /** At the wheel (`seat`): where the head is turned (rad: + to the left, + up) on top of looking down the road. */
  private head = { yaw: 0, pitch: 0 };
  private readonly q = new THREE.Quaternion(); private readonly qh = new THREE.Quaternion(); private readonly eu = new THREE.Euler(0, 0, 0, 'YXZ'); private readonly fwd = new THREE.Vector3();

  /** Start from where the camera is now (smooth hand-over from the follow camera). */
  begin(camera: THREE.Camera, v: WorldPose) {
    this.rel.set(camera.position.x - v.x, camera.position.y - v.y, camera.position.z - v.z);
    camera.getWorldDirection(this.relLook); this.relLook.multiplyScalar(10).add(this.rel);
    this.yaw = v.yaw; this.orbit = 0; this.lift = 0; this.idle = 0; this.live = true; this.head.yaw = 0; this.head.pitch = 0;
    const pc = camera as THREE.PerspectiveCamera; this.baseFov = pc.fov; this.speedK = 0;
  }
  /** Gives the camera's field of view back (the follow camera takes over). */
  end(camera?: THREE.PerspectiveCamera) { this.live = false; if (camera && this.baseFov) { camera.fov = this.baseFov; camera.updateProjectionMatrix(); } this.speedK = 0; }
  get active() { return this.live; }
  next(count: number) { this.view = (this.view + 1) % count; this.orbit = 0; this.lift = 0; this.head.yaw = 0; this.head.pitch = 0; }

  /**
   * At the wheel: the eye is fixed in the car's own frame (`frame`: the body that sways, so its pitch, roll and bounce carry the view and the
   * dashboard holds still on the screen), looking down the road `pitch0` (rad, negative: down). A drag turns the head, up to about 110° either way
   * and a little up and down, and it comes back to the road a few seconds after. The follow state is kept up to date so leaving this view is smooth.
   */
  seat(dt: number, camera: THREE.PerspectiveCamera, frame: THREE.Object3D, eye: THREE.Vector3, pitch0: number, drag: { yaw: number; pitch: number }, v: WorldPose) {
    const h = this.head;
    if (drag.yaw || drag.pitch) { h.yaw = Math.max(-1.9, Math.min(1.9, h.yaw + drag.yaw)); h.pitch = Math.max(-0.5, Math.min(0.6, h.pitch - drag.pitch)); this.idle = 0; }
    else { this.idle += dt; if (this.idle > 3) { const k = Math.min(1, dt * 1.2); h.yaw -= h.yaw * k; h.pitch -= h.pitch * k; } }
    frame.updateWorldMatrix(true, false);
    camera.position.copy(eye).applyMatrix4(frame.matrixWorld);
    this.q.setFromRotationMatrix(frame.matrixWorld);
    this.eu.set(pitch0 + h.pitch, Math.PI + h.yaw, 0);                     // the camera looks down its −z: turned round to look down the car's +z
    camera.quaternion.copy(this.q).multiply(this.qh.setFromEuler(this.eu));
    this.yaw = v.yaw; this.orbit = 0; this.lift = 0;
    this.rel.set(camera.position.x - v.x, camera.position.y - v.y, camera.position.z - v.z);
    this.fwd.set(0, 0, -1).applyQuaternion(camera.quaternion); this.relLook.copy(this.rel).addScaledVector(this.fwd, 10);
  }
  /** Where the head is turned at the wheel (checks). */
  get look() { return { yaw: this.head.yaw, pitch: this.head.pitch }; }
  /** Checks: turn the head at the wheel and hold it there `s` seconds before it comes back to the road. */
  holdLook(yaw: number, pitch: number, s = 30) { this.head.yaw = yaw; this.head.pitch = pitch; this.idle = 3 - s; }

  update(dt: number, camera: THREE.PerspectiveCamera, v: WorldPose, bounce: number, anchor: CameraAnchor, drag: { yaw: number; pitch: number }, colliders: readonly Collider[], speedShare = 0) {
    if (drag.yaw || drag.pitch) { this.orbit += drag.yaw; this.lift = Math.max(-1.5, Math.min(6, this.lift + drag.pitch * 6)); this.idle = 0; }
    else {
      this.idle += dt;
      if (this.idle > 3) { const k = Math.min(1, dt * 0.8); this.orbit -= wrapAngle(this.orbit) * k; this.lift -= this.lift * k; }
    }
    // speed: the view pulls back and widens a little as the vehicle goes faster (a sense of speed, room to see the road ahead), and its heading follows a touch more calmly
    this.speedK += (Math.max(0, Math.min(1, speedShare)) - this.speedK) * Math.min(1, dt * 1.5);
    const k = this.speedK;
    this.yaw += wrapAngle(v.yaw - this.yaw) * Math.min(1, dt * (2.4 - 0.8 * k));      // a calm swing through a corner, calmer still at speed
    anchorToWorld(v, this.yaw + this.orbit, anchor, this.lift, this.want, this.wantLook, camera.aspect < 1);
    if (!anchor.inside && k > 0.001) { const f = 1 + 0.24 * k; this.want.x = this.wantLook.x + (this.want.x - this.wantLook.x) * f; this.want.z = this.wantLook.z + (this.want.z - this.wantLook.z) * f; this.want.y += 0.5 * k; }
    this.want.y += bounce * 0.6;
    this.from.set(v.x, v.y + 2.6, v.z);
    const kc = clearOfWalls(this.from, this.want, colliders);
    if (kc < 1) this.want.lerpVectors(this.from, this.want, kc);
    this.want.x -= v.x; this.want.y -= v.y; this.want.z -= v.z;
    this.wantLook.x -= v.x; this.wantLook.y -= v.y; this.wantLook.z -= v.z;
    const a = 1 - Math.exp(-dt * 4.2), b = 1 - Math.exp(-dt * 6);
    this.rel.lerp(this.want, a); this.relLook.lerp(this.wantLook, b);
    camera.position.set(v.x + this.rel.x, v.y + this.rel.y, v.z + this.rel.z);
    if (this.baseFov) { const fov = this.baseFov + (anchor.inside ? 3 : 9) * k; if (Math.abs(camera.fov - fov) > 0.02) { camera.fov = fov; camera.updateProjectionMatrix(); } }
    if (!anchor.inside) {
      // the smoothed camera, not only the wanted one, stays out of buildings (it swings through a corner on its way): pulled in at once, with a margin
      this.eye.set(v.x, v.y + 2.6, v.z);
      const k2 = clearOfWalls(this.eye, camera.position, colliders, 20, 0.8);
      if (k2 < 1) camera.position.lerpVectors(this.eye, camera.position, k2);
    }
    this.from.set(v.x + this.relLook.x, v.y + this.relLook.y, v.z + this.relLook.z);
    camera.lookAt(this.from);
  }
}
