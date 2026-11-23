import * as THREE from 'three';
import { Batch } from '../world/batch';
import { Humanoid, humanoidReady, randomLook } from '../actors/humanoid';
import { rng } from '../core/rng';
import type { StandSeatDef } from './program';

/**
 * The stands' crowd, drawn cheaply: every spectator is an instance of two low-poly figures — seated, or standing with
 * the arms up when the crowd reacts — so hundreds of people cost four draw calls (clothes and skin of each pose, colours
 * per instance). Next to the player's seat, a few real humanoids take over (near LOD, quality-scaled), sitting and
 * cheering with the same animations as everyone in the city.
 */
const SHIRTS = [0xf2f2ec, 0xd9322b, 0x1a9d54, 0xf4c20d, 0x2f6fb3, 0x27407a, 0xe8742c, 0x6b3fa0, 0x9cc8e8, 0x7a1f3d, 0x222428, 0x1f7a44];
const SKINS = [0x3b2216, 0x4e2e1c, 0x5b3420, 0x6b3f25, 0x7a4a2c, 0x45291a];

/** Figure pieces (local frame: +z = facing, origin on the seat surface under the hips). */
function figure(standing: boolean): { cloth: THREE.BufferGeometry; skin: THREE.BufferGeometry } {
  const c = new Batch(), k = new Batch(), W = 0xffffff;
  if (!standing) {
    c.box(0.38, 0.52, 0.24, 0, 0, -0.02, W);                                            // torso
    for (const sx of [-0.1, 0.1]) {
      c.box(0.15, 0.14, 0.46, sx, -0.06, 0.2, W);                                       // thighs on the seat
      c.box(0.13, 0.46, 0.13, sx, -0.5, 0.4, W);                                        // shins over the edge
      c.box(0.1, 0.4, 0.12, sx * 2.45, 0.08, 0.04, W);                                  // arms
      k.box(0.09, 0.09, 0.1, sx * 2.45, 0.02, 0.08, W);                                 // hands on the knees
    }
    k.box(0.19, 0.23, 0.21, 0, 0.56, 0, W);                                             // head
  } else {
    for (const sx of [-0.1, 0.1]) c.box(0.14, 0.8, 0.16, sx, 0, 0, W);                  // legs
    c.box(0.38, 0.56, 0.24, 0, 0.8, 0, W);                                              // torso
    for (const sx of [-1, 1]) { c.box(0.1, 0.5, 0.12, sx * 0.27, 1.3, 0.02, W); k.box(0.09, 0.1, 0.1, sx * 0.27, 1.8, 0.02, W); } // arms up
    k.box(0.19, 0.23, 0.21, 0, 1.4, 0, W);                                              // head
  }
  const geo = (b: Batch) => { const m = b.build(new THREE.MeshBasicMaterial())!; const g = m.geometry; (m.material as THREE.Material).dispose(); return g; };
  return { cloth: geo(c), skin: geo(k) };
}

interface Spot { seat: StandSeatDef; shirt: THREE.Color; skinC: THREE.Color; phase: number; stand: number; on: boolean; near: boolean }

const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const FR = new THREE.Frustum(), PM = new THREE.Matrix4(), SP = new THREE.Sphere();

export class StandCrowd {
  readonly group = new THREE.Group();
  private spots: Spot[] = [];
  private meshes: THREE.InstancedMesh[] = [];
  private seated: [THREE.InstancedMesh, THREE.InstancedMesh];
  private standing: [THREE.InstancedMesh, THREE.InstancedMesh];
  private mat: THREE.MeshLambertMaterial;
  private t = 0;
  private dirty = true;
  private near: { h: Humanoid; spot: Spot; seen: boolean }[] = [];
  private rand = rng(23);

  /** `seats`: the places the crowd may take (in fill order); `nearCount`: real humanoids next to the player. */
  constructor(seats: StandSeatDef[], private nearCount: number) {
    const R = rng(91);
    this.spots = seats.map(seat => ({ seat, shirt: new THREE.Color(SHIRTS[Math.floor(R() * SHIRTS.length)]), skinC: new THREE.Color(SKINS[Math.floor(R() * SKINS.length)]), phase: R() * 6.28, stand: 0, on: false, near: false }));
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const sit = figure(false), up = figure(true), n = Math.max(1, seats.length);
    const mk = (g: THREE.BufferGeometry) => {
      const m = new THREE.InstancedMesh(g, this.mat, n); m.count = seats.length; m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.castShadow = false; m.receiveShadow = false;
      this.group.add(m); this.meshes.push(m); return m;
    };
    this.seated = [mk(sit.cloth), mk(sit.skin)];
    this.standing = [mk(up.cloth), mk(up.skin)];
    this.spots.forEach((s, i) => {
      for (const m of [this.seated[0], this.standing[0]]) m.setColorAt(i, s.shirt);
      for (const m of [this.seated[1], this.standing[1]]) m.setColorAt(i, s.skinC);
    });
    for (const m of this.meshes) { m.instanceColor!.needsUpdate = true; }
    this.group.name = 'arena_crowd';
  }

  /** Seats the crowd holds right now (to mark them taken in the seat registry). */
  taken(): StandSeatDef[] { return this.spots.filter(s => s.on).map(s => s.seat); }
  get present() { return this.spots.filter(s => s.on).length; }
  get cheering() { return this.spots.filter(s => s.on && s.stand > 0).length; }

  /** Show the first `n` spots of the fill order, except `skip` (a seat the player or someone else holds). */
  fill(n: number, skip: (id: string) => boolean) {
    let k = 0;
    for (const s of this.spots) {
      const want = k < n && !skip(s.seat.id);
      if (k < n) k++;
      if (want !== s.on) { s.on = want; if (!want) s.stand = 0; this.dirty = true; }
    }
  }

  /** A share of the seated crowd stands up and cheers for a few seconds. */
  react(share: number, seconds: number) {
    for (const s of this.spots) if (s.on && this.rand() < share) { s.stand = Math.max(s.stand, seconds * (0.6 + this.rand() * 0.6)); this.dirty = true; }
    for (const n of this.near) if (this.rand() < Math.min(1, share + 0.2)) n.spot.stand = Math.max(n.spot.stand, seconds);
  }

  /**
   * Real humanoids on the crowd seats nearest to (x, z) (the player's seat), those in front first (the row below, seen
   * from behind); the instances there are hidden. `yaw`: where the player's seat faces.
   */
  setNear(x: number, z: number | null, yaw = 0) {
    for (const n of this.near) { n.h.dispose(); n.spot.near = false; }
    this.near = []; this.dirty = true;
    if (z === null || !this.nearCount || !humanoidReady()) return;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const score = (s: Spot) => {
      const dx = s.seat.x - x, dz = s.seat.z - z, d = Math.hypot(dx, dz);
      return d + ((dx * fx + dz * fz) > 0.5 * d ? 0 : 3);
    };
    const list = this.spots.filter(s => s.on).sort((a, b) => score(a) - score(b)).slice(0, this.nearCount);
    for (const spot of list) {
      const h = new Humanoid(randomLook(this.rand)); h.hold = 'Sit';
      this.group.add(h.group); spot.near = true; this.near.push({ h, spot, seen: true });
    }
  }

  /** Near humanoids out of the camera's view are not drawn (their skinned meshes are never frustum-culled). */
  cull(cam: THREE.Camera) {
    if (!this.near.length) return;
    cam.updateMatrixWorld();
    FR.setFromProjectionMatrix(PM.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    for (const n of this.near) { SP.center.set(n.spot.seat.x, n.spot.seat.top + 0.4, n.spot.seat.z); SP.radius = 1.1; n.seen = FR.intersectsSphere(SP); }
  }

  update(dt: number, animate: boolean) {
    this.t += dt;
    let any = false;
    for (const s of this.spots) if (s.stand > 0) { s.stand = Math.max(0, s.stand - dt); any = true; if (s.stand === 0) this.dirty = true; }
    if (any || this.dirty) this.writeMatrices();
    for (const n of this.near) {
      const s = n.spot, standing = s.stand > 0;
      n.h.group.position.set(s.seat.x, standing ? s.seat.top : s.seat.top - 0.48, s.seat.z); n.h.group.rotation.y = s.seat.yaw;
      n.h.group.visible = s.on && n.seen;
      n.h.hold = standing ? 'Celebrate' : 'Sit';
      if (animate && s.on && n.seen) n.h.animate(dt, 0);
    }
  }

  private writeMatrices() {
    this.dirty = false;
    this.spots.forEach((s, i) => {
      const up = s.on && !s.near && s.stand > 0, down = s.on && !s.near && s.stand <= 0;
      Q.setFromAxisAngle(Y, s.seat.yaw); S.set(1, 1, 1);
      if (down) { P.set(s.seat.x, s.seat.top, s.seat.z); M.compose(P, Q, S); this.seated[0].setMatrixAt(i, M); this.seated[1].setMatrixAt(i, M); }
      else { this.seated[0].setMatrixAt(i, ZERO); this.seated[1].setMatrixAt(i, ZERO); }
      if (up) {
        P.set(s.seat.x, s.seat.top + Math.max(0, Math.sin(this.t * 9 + s.phase)) * 0.12, s.seat.z); M.compose(P, Q, S);
        this.standing[0].setMatrixAt(i, M); this.standing[1].setMatrixAt(i, M);
      } else { this.standing[0].setMatrixAt(i, ZERO); this.standing[1].setMatrixAt(i, ZERO); }
    });
    for (const m of this.meshes) m.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    for (const n of this.near) n.h.dispose();
    this.near = [];
    for (const m of this.meshes) { m.geometry.dispose(); m.dispose(); }
    this.mat.dispose();
    this.group.removeFromParent();
  }
}
