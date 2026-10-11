import * as THREE from 'three';
import { clamp } from '../core/rng';
import type { Canopy, Collider } from '../world/types';

/** Margin kept around a wall (m), and the closest the camera comes to the head when walls press in (share of the distance). */
const PAD = 0.4, MIN_K = 0.12;
/**
 * Room kept around the camera itself (m): a trunk, a wall, an awning or a parasol closer than this to the lens fills the
 * view, so the camera comes in front of it along its way (`pullClear`).
 */
export const CAM_CLEAR = 0.9;
/** Outdoors, less free room than this behind the player (m) is « tight »: the camera looks for a better angle. */
export const TIGHT_M = 3.0;
/** Pitch range of the follow camera (rad); a lifted view may go a little higher, over the shoulder. */
const PITCH_MIN = 0.14, PITCH_MAX = 0.95, PITCH_LIFT_MAX = 1.1;
/**
 * Views tried when the room behind the player is tight (yaw offset, pitch offset): over the shoulder, a three-quarter
 * angle on either side, the side, from the front three-quarter (a wall right at the back), and lower (under a tree's leaves).
 * Tried only while it is tight, four times a second at most, with the player standing for a turn.
 */
export const VIEW_TRIES: readonly (readonly [number, number])[] = [[0, 0.35], [0.75, 0.1], [-0.75, 0.1], [1.45, 0.15], [-1.45, 0.15], [2.3, 0.2], [-2.3, 0.2], [0, -0.2]];

type P3 = { x: number; y: number; z: number };
const NO_CANOPIES: readonly Canopy[] = [];

/** A point inside a wall (with its margin) or inside a canopy's leaves. */
export function blocked(x: number, y: number, z: number, colliders: readonly Collider[], canopies: readonly Canopy[]): boolean {
  for (const c of colliders) if (x > c.x0 - PAD && x < c.x1 + PAD && z > c.z0 - PAD && z < c.z1 + PAD && y < c.h + 0.5) return true;
  for (const t of canopies) if (y > t.y0 && y < t.y1 && (x - t.x) ** 2 + (z - t.z) ** 2 < t.r * t.r) return true;
  return false;
}
/** Share (MIN_K..1) of the way from the head to the wanted camera position that is free of walls and leaves (`steps` samples). */
export function clearFraction(from: P3, to: P3, colliders: readonly Collider[], canopies: readonly Canopy[], steps = 12): number {
  for (let s = 1; s <= steps; s++) {
    const f = s / steps;
    if (blocked(from.x + (to.x - from.x) * f, from.y + (to.y - from.y) * f, from.z + (to.z - from.z) * f, colliders, canopies)) return Math.max(MIN_K, (s - 1) / steps);
  }
  return 1;
}
/** Where the camera wants to be for a view (yaw, pitch) at `dist` from the target (feet position). */
export const viewPoint = (t: P3, yaw: number, pitch: number, dist: number): P3 =>
  ({ x: t.x - Math.sin(yaw) * Math.cos(pitch) * dist, y: t.y + 1.3 + Math.sin(pitch) * dist, z: t.z - Math.cos(yaw) * Math.cos(pitch) * dist });
/**
 * The try to take (index in `tries`), or -1 to keep the current view: the most free room, a big turn or tilt costing a
 * little, and only when it really frees room (at least a metre more than now).
 */
export function bestView(free0: number, frees: readonly number[], tries: readonly (readonly [number, number])[] = VIEW_TRIES): number {
  let best = -1, score = free0;
  frees.forEach((f, i) => {
    const s = f - 0.9 * Math.abs(tries[i][0]) - 1.5 * Math.abs(tries[i][1]);
    if (f >= free0 + 1 && s > score) { best = i; score = s; }
  });
  return best;
}
/** Something too close to the lens at (x, y, z): a wall within CAM_CLEAR, or leaves (an awning) within CAM_CLEAR around or just above. */
export function crowded(x: number, y: number, z: number, colliders: readonly Collider[], canopies: readonly Canopy[], m = CAM_CLEAR): boolean {
  for (const c of colliders) if (x > c.x0 - m && x < c.x1 + m && z > c.z0 - m && z < c.z1 + m && y < c.h + 0.5) return true;
  for (const t of canopies) if (y > t.y0 - 0.5 && y < t.y1 + 0.3 && (x - t.x) ** 2 + (z - t.z) ** 2 < (t.r + m) ** 2) return true;
  return false;
}
/** The share `k` brought in (by 1/24 steps, never under MIN_K) until the lens has CAM_CLEAR of room around it. */
export function pullClear(from: P3, to: P3, k: number, colliders: readonly Collider[], canopies: readonly Canopy[]): number {
  const at = (f: number) => [from.x + (to.x - from.x) * f, from.y + (to.y - from.y) * f, from.z + (to.z - from.z) * f] as const;
  while (k > MIN_K && crowded(...at(k), colliders, canopies)) k = Math.max(MIN_K, k - 1 / 24);
  return k;
}

/**
 * Under the trees: the same view lowered so that the way from the head stays well under the leaves it passes beneath (a
 * low camera among the trunks rather than one pushed against the head), or null when the leaves hang too low for that.
 */
export function underLeaves(from: P3, to: P3, canopies: readonly Canopy[]): P3 | null {
  const dx = to.x - from.x, dz = to.z - from.z, L2 = dx * dx + dz * dz;
  let top = Infinity;
  for (const t of canopies) {
    const u = L2 ? Math.max(0, Math.min(1, ((t.x - from.x) * dx + (t.z - from.z) * dz) / L2)) : 0;
    if (Math.hypot(from.x + dx * u - t.x, from.z + dz * u - t.z) < t.r) top = Math.min(top, t.y0 - 0.55);   // clear of crowded()
  }
  if (top === Infinity) return null;
  return top >= from.y + 0.05 ? { x: to.x, y: Math.min(to.y, top), z: to.z } : null;
}

/** Walls and canopies near (x, z) within `r` (the follow camera keeps such a short list instead of the whole hub's). */
export function nearOccluders(x: number, z: number, r: number, colliders: readonly Collider[], canopies: readonly Canopy[]) {
  const c = colliders.filter(k => Math.hypot(Math.max(k.x0 - x, 0, x - k.x1), Math.max(k.z0 - z, 0, z - k.z1)) < r + PAD);
  const t = canopies.filter(k => Math.hypot(k.x - x, k.z - z) < r + k.r);
  return { c, t };
}

/**
 * Third-person follow camera: behind and slightly above, character low-centre, never inside walls nor inside a tree's
 * leaves. When the room behind the player is tight (a counter, a window, a wall at their back), it swings to a
 * three-quarter angle or rises over the shoulder instead of sitting against the head; the player's own drag always wins.
 */
export class FollowCamera {
  yaw = 0; pitch = 0.36;
  /** Inside a room: shorter, lower camera. */
  indoor = false;
  /** What the camera did last frame (for the checks): free room behind the player (m), tight, the extra pitch. */
  info = { free: 0, tight: false, lift: 0, swinging: false, near: 0 };
  private pos = new THREE.Vector3();
  private look = new THREE.Vector3();
  private inited = false;
  private lift = 0; private liftTo = 0;
  private swingTo: number | null = null;
  /** Seconds since the player last dragged the view; seconds left before the camera eases back behind the walker. */
  private userT = 9; private holdT = 0; private tryT = 0;
  private near: { c: Collider[]; t: Canopy[]; x: number; z: number; r: number; age: number; src: readonly Collider[] | null; srcT: readonly Canopy[] | null } =
    { c: [], t: [], x: 1e9, z: 1e9, r: 0, age: 0, src: null, srcT: null };
  constructor(public camera: THREE.PerspectiveCamera) {}

  snapBehind(yawFacing: number) { this.yaw = yawFacing; this.inited = false; this.swingTo = null; this.lift = this.liftTo = 0; this.pinned = false; }
  /** A view set on purpose (the checks' framing, a scripted look): kept as set, no swing or tilt, until the player walks. */
  pin() { this.pinned = true; this.swingTo = null; this.lift = this.liftTo = 0; }
  private pinned = false;

  /** The short list of walls and leaves around the player, refreshed when they move a few metres (or every second). */
  private occluders(t: THREE.Vector3, dist: number, colliders: readonly Collider[], canopies: readonly Canopy[], dt: number) {
    const n = this.near, r = dist + 2;
    n.age += dt;
    if (n.src !== colliders || n.srcT !== canopies || n.age > 1 || r > n.r || Math.hypot(t.x - n.x, t.z - n.z) > 2) {
      const o = nearOccluders(t.x, t.z, r + 2, colliders, canopies);
      Object.assign(n, { c: o.c, t: o.t, x: t.x, z: t.z, r: r + 2 - 0.01, age: 0, src: colliders, srcT: canopies });
    }
    return n;
  }

  /**
   * room: when indoors, the camera is clamped inside this rectangle (and under the ceiling) instead of colliding.
   * canopies: the hub's tree tops (src/world/builder.ts), kept out of like walls.
   */
  update(dt: number, target: THREE.Vector3, facing: number, drag: { yaw: number; pitch: number }, colliders: Collider[], portrait: boolean, auto: boolean,
    room?: { x0: number; x1: number; z0: number; z1: number }, groundAt?: (x: number, z: number) => number, canopies: readonly Canopy[] = NO_CANOPIES) {
    const dragging = drag.yaw !== 0 || drag.pitch !== 0;
    this.userT = dragging ? 0 : this.userT + dt;
    if (auto) this.pinned = false;
    if (dragging) { this.swingTo = null; this.liftTo = 0; }
    this.yaw += drag.yaw;
    this.pitch = clamp(this.pitch + drag.pitch, PITCH_MIN, PITCH_MAX);
    this.holdT = Math.max(0, this.holdT - dt);
    if (auto && drag.yaw === 0 && this.holdT === 0 && this.swingTo === null) { // ease behind the character while walking
      const d = Math.atan2(Math.sin(facing - this.yaw), Math.cos(facing - this.yaw));
      this.yaw += d * Math.min(1, dt * 0.9);
    }
    if (this.swingTo !== null) {                             // a swing away from a wall at the player's back, a few frames long
      const d = Math.atan2(Math.sin(this.swingTo - this.yaw), Math.cos(this.swingTo - this.yaw)), step = 2.4 * dt;
      if (Math.abs(d) <= step) { this.yaw = this.swingTo; this.swingTo = null; } else this.yaw += Math.sign(d) * step;
    }
    const dist = this.indoor ? (portrait ? 4.6 : 4.0) : portrait ? 10.5 : 8;
    if (this.indoor) { this.pitch = clamp(this.pitch, 0.5, 0.8); this.lift = this.liftTo = 0; }   // looking down into the room shows more of it
    this.lift += (this.liftTo - this.lift) * Math.min(1, dt * 3);
    const pitch = clamp(this.pitch + this.lift, PITCH_MIN, PITCH_LIFT_MAX);
    const v = viewPoint(target, this.yaw, pitch, dist), want = new THREE.Vector3(v.x, v.y, v.z);
    const from = new THREE.Vector3(target.x, target.y + 1.5, target.z);
    let k = 1;
    if (room) {
      want.x = clamp(want.x, room.x0, room.x1); want.z = clamp(want.z, room.z0, room.z1); want.y = Math.min(want.y, 2.6);
    } else {
      const n = this.occluders(target, dist, colliders, canopies, dt);
      k = pullClear(from, want, clearFraction(from, want, n.c, n.t), n.c, n.t);   // in front of what would fill the lens
      // leaves cut the way so short that the head would fill the view: under them, when they hang high enough
      if (k * dist < TIGHT_M && n.t.length && clearFraction(from, want, n.c, []) > k) {
        const u = underLeaves(from, want, n.t), ku = u ? pullClear(from, u, clearFraction(from, u, n.c, n.t), n.c, n.t) : 0;
        if (u && ku > k) { want.set(u.x, u.y, u.z); k = ku; }
      }
      const free = k * dist, tight = free < TIGHT_M;
      this.tryT -= dt;
      if (this.userT > 0.8 && !this.pinned && this.tryT <= 0 && this.swingTo === null) {
        this.tryT = 0.25;
        if (tight) {                                         // the room behind is tight: a side angle, over the shoulder, or under the leaves
          // walking, the view only tilts (a turn would bend the walk under the player's thumb); standing, it may also turn
          const frees = VIEW_TRIES.map(([dy, dp]) => (auto && dy ? 0 : clearFraction(from, viewPoint(target, this.yaw + dy, clamp(this.pitch + dp, PITCH_MIN, PITCH_LIFT_MAX), dist), n.c, n.t) * dist));
          const i = bestView(free, frees);
          if (i >= 0) { if (VIEW_TRIES[i][0]) this.swingTo = this.yaw + VIEW_TRIES[i][0]; this.liftTo = VIEW_TRIES[i][1]; this.holdT = 2; }
        } else if (this.liftTo !== 0 && clearFraction(from, viewPoint(target, this.yaw, this.pitch, dist), n.c, n.t) * dist >= TIGHT_M) this.liftTo = 0;
      }
      const f = this.info; f.free = Math.round(free * 100) / 100; f.tight = tight; f.lift = Math.round(this.lift * 100) / 100; f.swinging = this.swingTo !== null; f.near = n.c.length + n.t.length;
    }
    want.lerpVectors(from, want, k);
    if (groundAt) want.y = Math.max(want.y, groundAt(want.x, want.z) + 1.3);   // stay above stairs and terraces
    const ahead = this.indoor ? 1.2 : portrait ? 3.6 : 3.2;
    const look = new THREE.Vector3(target.x + Math.sin(this.yaw) * ahead, target.y + 1.2, target.z + Math.cos(this.yaw) * ahead);
    if (!this.inited) { this.pos.copy(want); this.look.copy(look); this.inited = true; }
    const a = 1 - Math.exp(-dt * 9);
    this.pos.lerp(want, a); this.look.lerp(look, a);
    this.camera.position.copy(this.pos); this.camera.lookAt(this.look);
  }
}
