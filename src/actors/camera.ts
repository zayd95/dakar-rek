import * as THREE from 'three';
import { clamp } from '../core/rng';
import type { Collider } from '../world/types';

/** Third-person follow camera: behind and slightly above, character low-centre, never inside walls. */
export class FollowCamera {
  yaw = 0; pitch = 0.36;
  private pos = new THREE.Vector3();
  private look = new THREE.Vector3();
  private inited = false;
  constructor(public camera: THREE.PerspectiveCamera) {}

  snapBehind(yawFacing: number) { this.yaw = yawFacing; this.inited = false; }

  update(dt: number, target: THREE.Vector3, facing: number, drag: { yaw: number; pitch: number }, colliders: Collider[], portrait: boolean, auto: boolean) {
    this.yaw += drag.yaw;
    this.pitch = clamp(this.pitch + drag.pitch, 0.14, 0.95);
    if (auto && drag.yaw === 0) { // ease behind the character while walking
      const d = Math.atan2(Math.sin(facing - this.yaw), Math.cos(facing - this.yaw));
      this.yaw += d * Math.min(1, dt * 0.9);
    }
    const dist = portrait ? 10.5 : 8;
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const want = new THREE.Vector3(target.x - Math.sin(this.yaw) * cp * dist, target.y + 1.3 + sp * dist, target.z - Math.cos(this.yaw) * cp * dist);
    const from = new THREE.Vector3(target.x, target.y + 1.5, target.z);
    let k = 1;
    for (let s = 1; s <= 12; s++) {
      const f = s / 12, x = from.x + (want.x - from.x) * f, y = from.y + (want.y - from.y) * f, z = from.z + (want.z - from.z) * f;
      let hit = false;
      for (const c of colliders) if (x > c.x0 - 0.4 && x < c.x1 + 0.4 && z > c.z0 - 0.4 && z < c.z1 + 0.4 && y < c.h + 0.5) { hit = true; break; }
      if (hit) { k = Math.max(0.12, (s - 1) / 12); break; }
    }
    want.lerpVectors(from, want, k);
    const ahead = portrait ? 3.6 : 3.2;
    const look = new THREE.Vector3(target.x + Math.sin(this.yaw) * ahead, target.y + 1.2, target.z + Math.cos(this.yaw) * ahead);
    if (!this.inited) { this.pos.copy(want); this.look.copy(look); this.inited = true; }
    const a = 1 - Math.exp(-dt * 9);
    this.pos.lerp(want, a); this.look.lerp(look, a);
    this.camera.position.copy(this.pos); this.camera.lookAt(this.look);
  }
}
