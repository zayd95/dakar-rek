import * as THREE from 'three';
import { clamp } from '../core/rng';
import type { Collider } from '../world/types';

/** Third-person follow camera: behind and slightly above, character low-centre, never inside walls. */
export class FollowCamera {
  yaw = 0; pitch = 0.36;
  /** Inside a room: shorter, lower camera. */
  indoor = false;
  private pos = new THREE.Vector3();
  private look = new THREE.Vector3();
  private inited = false;
  constructor(public camera: THREE.PerspectiveCamera) {}

  snapBehind(yawFacing: number) { this.yaw = yawFacing; this.inited = false; }

  /** room: when indoors, the camera is clamped inside this rectangle (and under the ceiling) instead of colliding. */
  update(dt: number, target: THREE.Vector3, facing: number, drag: { yaw: number; pitch: number }, colliders: Collider[], portrait: boolean, auto: boolean, room?: { x0: number; x1: number; z0: number; z1: number }, groundAt?: (x: number, z: number) => number, roofs: readonly Collider[] = []) {
    this.yaw += drag.yaw;
    this.pitch = clamp(this.pitch + drag.pitch, 0.14, 0.95);
    if (auto && drag.yaw === 0) { // ease behind the character while walking
      const d = Math.atan2(Math.sin(facing - this.yaw), Math.cos(facing - this.yaw));
      this.yaw += d * Math.min(1, dt * 0.9);
    }
    const dist = this.indoor ? (portrait ? 4.6 : 4.0) : portrait ? 10.5 : 8;
    if (this.indoor) this.pitch = clamp(this.pitch, 0.5, 0.8);   // looking down into the room shows more of it
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const want = new THREE.Vector3(target.x - Math.sin(this.yaw) * cp * dist, target.y + 1.3 + sp * dist, target.z - Math.cos(this.yaw) * cp * dist);
    const from = new THREE.Vector3(target.x, target.y + 1.5, target.z);
    let k = 1;
    if (room) {
      want.x = clamp(want.x, room.x0, room.x1); want.z = clamp(want.z, room.z0, room.z1); want.y = Math.min(want.y, 2.6);
      k = 1; colliders = [];
    }
    for (let s = 1; s <= 12; s++) {
      const f = s / 12, x = from.x + (want.x - from.x) * f, y = from.y + (want.y - from.y) * f, z = from.z + (want.z - from.z) * f;
      let hit = false;
      for (const c of colliders) if (x > c.x0 - 0.4 && x < c.x1 + 0.4 && z > c.z0 - 0.4 && z < c.z1 + 0.4 && y < c.h + 0.5) { hit = true; break; }
      if (hit) { k = Math.max(0.12, (s - 1) / 12); break; }
    }
    want.lerpVectors(from, want, k);
    // under a roof open on one side (dibiterie): stay below it, or the slab hides the character
    for (const r of roofs) if (target.x > r.x0 && target.x < r.x1 && target.z > r.z0 && target.z < r.z1) want.y = Math.min(want.y, r.h - 0.2);
    if (groundAt) want.y = Math.max(want.y, groundAt(want.x, want.z) + 1.3);   // stay above stairs and terraces
    const ahead = this.indoor ? 1.2 : portrait ? 3.6 : 3.2;
    const look = new THREE.Vector3(target.x + Math.sin(this.yaw) * ahead, target.y + 1.2, target.z + Math.cos(this.yaw) * ahead);
    if (!this.inited) { this.pos.copy(want); this.look.copy(look); this.inited = true; }
    const a = 1 - Math.exp(-dt * 9);
    this.pos.lerp(want, a); this.look.lerp(look, a);
    this.camera.position.copy(this.pos); this.camera.lookAt(this.look);
  }
}
