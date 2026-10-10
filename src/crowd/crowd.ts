import * as THREE from 'three';
import { Humanoid, humanoidReady, type Clip, type PersonLook } from '../actors/humanoid';
import { cullHumanoid } from '../actors/crowdLod';
import { SIT_HIPS } from '../interact/seats';
import { rng } from '../core/rng';
import {
  Excitement, REACTIONS, armDirs, calm, easePose, offer, plan, poseFor, restState, standingFor, step,
  type ReactState, type ReactionKind, type RigPose,
} from './reactions';
import { RIG_ATTRS, crowdClock, figureGeometry, rigMaterial, tickClock, type FigureKind, type RigAttr } from './rig';

/**
 * A reusable crowd (docs/CROWD.md), on top of the city's crowd LOD (src/actors/crowdLod.ts):
 *
 *  - near: a few full animated humanoids (the city's own bodies and clips) next to the player or the focus point, their
 *    arms posed like the figures they replace when the clip has no such gesture (clapping, fists, hands on the head);
 *  - mid: instanced rigged figures (src/crowd/rig.ts), one draw call per posture for the whole crowd;
 *  - far: instanced silhouettes, one draw call per posture; beyond the far range nobody is drawn.
 *
 * Ranges and the near count follow the graphics quality. The crowd holds people on slots (seats or standing places),
 * tagged in groups; `react(group, kind)` makes a group applaud, shout, stand up, tense at a grab, leap at a fall or
 * celebrate (src/crowd/reactions.ts). Owners decide who is present (`fill`, `setPresent`), move walkers (`move`), feed
 * the camera (`setCamera`) and call `update` every frame. The crowd never touches the seat registry: owners mark the
 * seats they give it, as the arena does.
 */
export type CrowdQuality = 'low' | 'medium' | 'high';
export const CROWD_LOD: Record<CrowdQuality, { near: number; mid: number; far: number }> = {
  low: { near: 0, mid: 14, far: 90 },
  medium: { near: 4, mid: 34, far: 150 },
  high: { near: 8, mid: 64, far: 220 },
};

export interface CrowdSlot {
  id: string;
  /** Position in the crowd group's space; y = the sitting surface (seated) or the ground (standing). */
  x: number; y: number; z: number;
  /** Facing (rotation about +y; 0 faces +z). */
  yaw: number;
  seated: boolean;
  /** Groups this place belongs to ('all' is implicit). */
  tags?: readonly string[];
}
export interface CrowdLook { shirt: number; legs: number; skin: number; style: 'tee' | 'boubou' | 'dress'; wrap: number | null }
export interface CrowdOptions {
  quality: CrowdQuality;
  /** Full humanoids at most (default: the quality's). */
  near?: number;
  /** Only members this close to the focus become full humanoids (m). */
  nearRadius?: number;
  /** Full humanoids only around a focus point (setFocus), never around the camera alone (the arena: the player's seat). */
  nearNeedsFocus?: boolean;
  seed?: number;
  name?: string;
  look?: (slot: CrowdSlot, r: () => number) => CrowdLook;
}

const SKINS = [0x3b2216, 0x4e2e1c, 0x5b3420, 0x6b3f25, 0x7a4a2c, 0x45291a];
const SHIRTS = [0xf2f2ec, 0xd9322b, 0x1a9d54, 0xf4c20d, 0x2f6fb3, 0x27407a, 0xe8742c, 0x6b3fa0, 0x9cc8e8, 0x7a1f3d, 0x222428, 0x1f7a44, 0xe8e2d4];
const TROUSERS = [0x2b2f3a, 0x3d4a5c, 0x1c1c1f, 0x6b5a45, 0x4a3f35, 0xd8d0bf];
const DRESSES = [0xe58a2f, 0xc2417f, 0x1f7a44, 0x2f6fb3, 0xd9322b, 0x6b3fa0, 0xf4c20d];
const pick = <T,>(a: readonly T[], r: () => number) => a[Math.floor(r() * a.length)];
/** A Dakar crowd's mix: tees and trousers, boubous, dresses with a headwrap. */
export function defaultLook(r: () => number, shirts: readonly number[] = SHIRTS): CrowdLook {
  const skin = pick(SKINS, r), u = r();
  if (u < 0.3) { const c = pick(DRESSES, r); return { style: 'dress', shirt: c, legs: c, skin, wrap: r() < 0.6 ? pick(DRESSES, r) : null }; }
  if (u < 0.52) { const c = pick(shirts, r); return { style: 'boubou', shirt: c, legs: c, skin, wrap: null }; }
  return { style: 'tee', shirt: pick(shirts, r), legs: pick(TROUSERS, r), skin, wrap: null };
}
function personLook(l: CrowdLook): PersonLook {
  if (l.style === 'dress') return { skin: l.skin, female: true, style: 'dress', top: l.shirt, pattern: 'uni', hat: l.wrap !== null ? 'headwrap' : null, hatColor: l.wrap ?? undefined, shoes: 0x6b4a2e };
  if (l.style === 'boubou') return { skin: l.skin, style: 'boubou', top: l.shirt, bottom: l.legs, pattern: 'uni', shoes: 0x3a2a1e };
  return { skin: l.skin, style: 'tee', top: l.shirt, bottom: l.legs, pattern: 'uni', shoes: 0x2e2620 };
}

interface Member {
  slot: CrowdSlot;
  look: CrowdLook;
  shirt: THREE.Color; legs: THREE.Color; skin: THREE.Color;
  phase: number;
  /** Keenness: how readily this person joins in (0.6–1.4). */
  temper: number;
  on: boolean;
  st: ReactState;
  speed: number;
  standing: boolean;
  pose: RigPose; target: RigPose; easing: boolean;
  /** 0 not drawn, 1 far silhouette, 2 mid figure, 3 full humanoid. */
  lod: 0 | 1 | 2 | 3;
  matrix: Float32Array;
  body: NearBody | null;
}
interface NearBody {
  h: Humanoid; m: Member; w: number; seen: boolean;
  root: THREE.Object3D;
  bones: { upper: THREE.Object3D; fore: THREE.Object3D; side: 1 | -1 }[];
}

class Bucket {
  readonly mesh: THREE.InstancedMesh;
  private attrs = {} as Record<RigAttr, THREE.InstancedBufferAttribute>;
  n = 0;
  constructor(kind: FigureKind, max: number) {
    const g = figureGeometry(kind);
    for (const [k, size] of Object.entries(RIG_ATTRS) as [RigAttr, number][]) {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(max * size), size);
      a.setUsage(THREE.DynamicDrawUsage); g.setAttribute(k, a); this.attrs[k] = a;
    }
    const m = new THREE.InstancedMesh(g, rigMaterial(), max);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.setColorAt(0, new THREE.Color(0xffffff)); m.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    m.count = 0; m.frustumCulled = false; m.castShadow = false; m.receiveShadow = false;
    m.name = `crowd_${kind}`; m.userData.noLod = true;
    this.mesh = m;
  }
  add(p: Member) {
    const i = this.n++, A = this.attrs, q = p.pose;
    (this.mesh.instanceMatrix.array as Float32Array).set(p.matrix, i * 16);
    this.mesh.instanceColor!.setXYZ(i, p.shirt.r, p.shirt.g, p.shirt.b);
    A.iSkin.setXYZ(i, p.skin.r, p.skin.g, p.skin.b);
    A.iLegs.setXYZ(i, p.legs.r, p.legs.g, p.legs.b);
    A.iArm.setXYZW(i, q.pitch, q.spread, q.yaw, q.elbow);
    A.iOsc.setXYZW(i, q.yawAmp, q.pitchAmp, q.freq, p.phase);
    A.iMove.setXYZW(i, q.bounce, q.lean, q.walk, q.sideOff);
  }
  finish() {
    this.mesh.count = this.n;
    if (!this.n) return;
    this.mesh.instanceMatrix.needsUpdate = true; this.mesh.instanceColor!.needsUpdate = true;
    for (const a of Object.values(this.attrs)) a.needsUpdate = true;
  }
  dispose() { this.mesh.geometry.dispose(); this.mesh.dispose(); }
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1), _up = new THREE.Vector3(0, 1, 0);
const _fr = new THREE.Frustum(), _pm = new THREE.Matrix4(), _sp = new THREE.Sphere(), _eye = new THREE.Vector3();
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qd = new THREE.Quaternion(), _qs = new THREE.Quaternion(), _qi = new THREE.Quaternion();
const _va = new THREE.Vector3(), _vb = new THREE.Vector3();

/** Every crowd alive (the crowd module's debug entries list them). */
export const LIVE_CROWDS = new Set<Crowd>();

export class Crowd {
  readonly group = new THREE.Group();
  readonly name: string;
  private members: Member[] = [];
  private byId = new Map<string, Member>();
  private buckets: Record<FigureKind, Bucket>;
  private bodies: NearBody[] = [];
  private rand: () => number;
  private excite = new Excitement();
  private lod: { near: number; mid: number; far: number };
  private nearRadius: number;
  private nearNeedsFocus: boolean;
  private eye: THREE.Vector3 | null = null;
  private frustum: THREE.Frustum | null = null;
  private focus: { x: number; z: number; yaw: number | null } | null = null;
  private layoutDirty = true;
  private lodT = 0;
  private nearT = 0;

  constructor(slots: readonly CrowdSlot[], o: CrowdOptions) {
    this.name = o.name ?? 'crowd';
    this.group.name = `crowd:${this.name}`;
    this.group.userData.noLod = true;                       // our humanoids are ours to show or hide (crowdLod.ts)
    this.rand = rng(o.seed ?? 17);
    const L = CROWD_LOD[o.quality];
    this.lod = { ...L, near: Math.max(0, Math.min(16, o.near ?? L.near)) };
    this.nearRadius = o.nearRadius ?? 10;
    this.nearNeedsFocus = !!o.nearNeedsFocus;
    const R = rng((o.seed ?? 17) * 7 + 3);
    for (const slot of slots) {
      const look = o.look ? o.look(slot, R) : defaultLook(R);
      const standing = !slot.seated, pose = { ...poseFor(null, standing) };
      const m: Member = {
        slot, look, shirt: new THREE.Color(look.shirt), legs: new THREE.Color(look.legs), skin: new THREE.Color(look.skin),
        phase: R() * Math.PI * 2, temper: 0.6 + R() * 0.8, on: false, st: restState(), speed: 0,
        standing, pose, target: poseFor(null, standing), easing: false, lod: 0, matrix: new Float32Array(16), body: null,
      };
      this.place(m);
      this.members.push(m); this.byId.set(slot.id, m);
    }
    const max = Math.max(1, slots.length);
    this.buckets = { midSeated: new Bucket('midSeated', max), midStanding: new Bucket('midStanding', max), farSeated: new Bucket('farSeated', max), farStanding: new Bucket('farStanding', max) };
    for (const b of Object.values(this.buckets)) this.group.add(b.mesh);
    LIVE_CROWDS.add(this);
  }

  private place(m: Member) {
    const s = m.slot;
    _p.set(s.x, s.y, s.z); _q.setFromAxisAngle(_up, s.yaw);
    _m.compose(_p, _q, _one).toArray(m.matrix);
  }

  // ---------------------------------------------------------------- presence
  get size() { return this.members.length; }
  /** Members shown now. */
  get present() { let n = 0; for (const m of this.members) if (m.on) n++; return n; }
  /** Members reacting now. */
  get reacting() { let n = 0; for (const m of this.members) if (m.on && m.st.kind) n++; return n; }
  slots(): CrowdSlot[] { return this.members.filter(m => m.on).map(m => m.slot); }
  has(id: string) { return !!this.byId.get(id)?.on; }

  /** Show the first `n` slots (in the order given), except those `skip` names (a seat the player or someone else holds). */
  fill(n: number, skip?: (id: string) => boolean) {
    let k = 0;
    for (const m of this.members) {
      const want = k < n && !skip?.(m.slot.id);
      if (k < n) k++;
      this.setOn(m, want);
    }
  }
  setPresent(id: string, on: boolean) { const m = this.byId.get(id); if (m) this.setOn(m, on); }
  private setOn(m: Member, on: boolean) {
    if (m.on === on) return;
    m.on = on; this.layoutDirty = true;
    if (!on) { calm(m.st); m.speed = 0; this.retarget(m, true); }
  }

  /** Move a member (walkers, queues): position in the group's space, facing, ground speed (m/s: the walk). */
  move(id: string, x: number, y: number, z: number, yaw: number, speed = 0) {
    const m = this.byId.get(id); if (!m) return;
    m.slot.x = x; m.slot.y = y; m.slot.z = z; m.slot.yaw = yaw;
    this.place(m);
    const walking = speed > 0.2;
    if (walking !== m.speed > 0.2 || (walking && Math.abs(speed - m.speed) > 0.3)) { m.speed = speed; this.retarget(m); }
    m.speed = speed;
    if (m.on) this.layoutDirty = true;
  }

  // ---------------------------------------------------------------- reactions
  /**
   * Make a group react. `share` and `seconds` override the reaction's defaults; `origin` (group space) makes it ripple
   * out from a point at `speed` m/s (the side the wrestler walks along, the corner a goal is scored in…).
   * Returns how many people join in.
   */
  react(group: string, kind: ReactionKind, o: { share?: number; seconds?: number; origin?: { x: number; z: number }; speed?: number } = {}): number {
    const list = this.members.filter(m => m.on && m.speed <= 0.2 && (group === 'all' || (m.slot.tags?.includes(group) ?? false)));
    if (!list.length) return 0;
    const p = plan(list.length, kind, this.rand, { share: o.share, seconds: o.seconds, temper: i => list[i].temper });
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const r = p[i]; if (!r) continue;
      const m = list[i];
      const ripple = o.origin ? Math.hypot(m.slot.x - o.origin.x, m.slot.z - o.origin.z) / (o.speed ?? 30) : 0;
      if (offer(m.st, kind, r.delay + ripple, r.seconds)) { n++; if (m.st.kind === kind && !m.st.next) this.retarget(m); }
    }
    this.excite.add(group, REACTIONS[kind].voice * n / list.length);
    if (group !== 'all') this.excite.add('all', REACTIONS[kind].voice * n / Math.max(1, this.present));
    return n;
  }
  /** Everyone in the group settles back at once. */
  calm(group = 'all') {
    for (const m of this.members) if (group === 'all' || m.slot.tags?.includes(group)) if (calm(m.st)) this.retarget(m);
  }
  /** How excited a group is (0–1), for the crowd's sound. */
  level(group = 'all') { return this.excite.level(group); }
  /** The reaction a member shows now (null: at rest or absent). */
  reactionOf(id: string): ReactionKind | null { const m = this.byId.get(id); return m?.on ? m.st.kind : null; }
  standingNow(id: string): boolean { return !!this.byId.get(id)?.standing; }

  private retarget(m: Member, snap = false) {
    const kind = m.on ? m.st.kind : null;
    const standing = standingFor(m.slot.seated, kind);
    if (standing !== m.standing) { m.standing = standing; this.layoutDirty = true; }
    m.target = poseFor(kind, standing, m.speed);
    if (snap) { Object.assign(m.pose, m.target); m.easing = false; } else m.easing = true;
  }

  // ---------------------------------------------------------------- level of detail
  /** Full humanoids go to the members nearest (x, z), those in front of `yaw` first; null: nearest to the camera. */
  setFocus(x: number, z: number | null, yaw: number | null = null) {
    this.focus = z === null ? null : { x, z, yaw };
    this.nearT = 0;
  }
  /** The camera of this frame: LOD distances, and near bodies outside the view are neither drawn nor animated. */
  setCamera(cam: THREE.Camera) {
    cam.updateMatrixWorld();
    this.group.updateWorldMatrix(true, false);
    this.eye = this.group.worldToLocal(cam.getWorldPosition(this.eye ?? new THREE.Vector3()));
    _fr.setFromProjectionMatrix(_pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    (this.frustum ??= new THREE.Frustum()).copy(_fr);
    for (const b of this.bodies) {
      b.h.group.getWorldPosition(_sp.center); _sp.center.y += 0.8; _sp.radius = 1.2;
      b.seen = this.frustum.intersectsSphere(_sp);
    }
  }

  private assignLod() {
    const L = this.lod, mid2 = L.mid * L.mid, far2 = L.far * L.far, e = this.eye;
    for (const m of this.members) {
      let lod: Member['lod'];
      if (!m.on) lod = 0;
      else if (m.body) lod = 3;
      else if (!e) lod = L.mid > 0 ? 2 : 1;
      else {
        const dx = m.slot.x - e.x, dy = m.slot.y - e.y, dz = m.slot.z - e.z, d2 = dx * dx + dy * dy + dz * dz;
        lod = d2 < mid2 ? 2 : d2 < far2 ? 1 : 0;
      }
      if (lod !== m.lod) { m.lod = lod; this.layoutDirty = true; }
    }
  }

  private pickNear() {
    const want = new Set<Member>();
    const anchor = this.focus ?? (this.eye && !this.nearNeedsFocus ? { x: this.eye.x, z: this.eye.z, yaw: null } : null);
    if (anchor && this.lod.near > 0 && humanoidReady() && this.group.visible) {
      const fx = anchor.yaw === null ? 0 : Math.sin(anchor.yaw), fz = anchor.yaw === null ? 0 : Math.cos(anchor.yaw);
      const r2 = this.nearRadius * this.nearRadius;
      const scored: { m: Member; s: number }[] = [];
      for (const m of this.members) {
        if (!m.on) continue;
        const dx = m.slot.x - anchor.x, dz = m.slot.z - anchor.z, d2 = dx * dx + dz * dz;
        if (d2 > r2 || d2 < 0.04) continue;
        const d = Math.sqrt(d2);
        scored.push({ m, s: d + (anchor.yaw === null || dx * fx + dz * fz > 0.5 * d ? 0 : 3) });
      }
      scored.sort((a, b) => a.s - b.s);
      for (const { m } of scored.slice(0, this.lod.near)) want.add(m);
    }
    // let go of the bodies whose member left the set, then give bodies to the newcomers (two new bodies per pick)
    this.bodies = this.bodies.filter(b => {
      if (want.has(b.m) && b.m.on) { want.delete(b.m); return true; }
      this.dropBody(b); return false;
    });
    let made = 0;
    for (const m of want) {
      if (made >= 2) { this.nearT = 0.1; break; }
      this.bodies.push(this.makeBody(m)); made++;
    }
  }
  private makeBody(m: Member): NearBody {
    const h = new Humanoid(personLook(m.look));
    h.group.userData.noLod = true;
    cullHumanoid(h.group);
    const root = h.group.children.find(c => c.name === 'Scene') ?? h.group.children[0];
    const bones: NearBody['bones'] = [];
    for (const [s, side] of [['L', 1], ['R', -1]] as const) {
      const upper = h.group.getObjectByName(`upper_arm${s}`), fore = h.group.getObjectByName(`forearm${s}`);
      if (upper && fore) bones.push({ upper, fore, side });
    }
    this.group.add(h.group);
    const b: NearBody = { h, m, w: 0, seen: true, root, bones };
    m.body = b; m.lod = 3; this.layoutDirty = true;
    return b;
  }
  private dropBody(b: NearBody) {
    b.m.body = null; this.layoutDirty = true;
    b.h.group.traverse(o => { const mesh = o as THREE.Mesh; if (mesh.isMesh) for (const mat of ([] as THREE.Material[]).concat(mesh.material)) mat.dispose(); });
    b.h.dispose();
  }

  // ---------------------------------------------------------------- every frame
  /** `animate`: false while the player is far (positions are kept, no mixer or arm work). */
  update(dt: number, animate = true) {
    tickClock(performance.now(), dt);
    this.excite.decay(dt);
    for (const m of this.members) if (m.on && step(m.st, dt)) this.retarget(m);
    this.nearT -= dt;
    if (this.nearT <= 0) { this.nearT = 0.5; this.pickNear(); }
    this.lodT -= dt;
    if (this.lodT <= 0 || this.layoutDirty) { this.lodT = 0.25; this.assignLod(); }
    let posed = false;
    const k = 1 - Math.exp(-dt * 7);
    for (const m of this.members) if (m.easing && m.on) { m.easing = easePose(m.pose, m.target, k); if (m.lod === 1 || m.lod === 2) posed = true; }
    if (this.layoutDirty || posed) this.write();
    for (const b of this.bodies) this.updateBody(b, dt, animate);
  }

  private write() {
    this.layoutDirty = false;
    const B = this.buckets;
    for (const b of Object.values(B)) b.n = 0;
    for (const m of this.members) {
      if (m.lod === 2) (m.standing ? B.midStanding : B.midSeated).add(m);
      else if (m.lod === 1) (m.standing ? B.farStanding : B.farSeated).add(m);
    }
    for (const b of Object.values(B)) b.finish();
  }

  private updateBody(b: NearBody, dt: number, animate: boolean) {
    const m = b.m, s = m.slot, g = b.h.group;
    g.visible = m.on && b.seen;
    if (!g.visible) return;
    const walking = m.speed > 0.2, kind = m.st.kind;
    g.position.set(s.x, m.standing ? s.y : s.y - SIT_HIPS, s.z); g.rotation.y = s.yaw;
    const clip: Clip | null = walking ? null : !m.standing ? 'Sit' : kind === 'celebrate' ? 'Celebrate' : 'Idle';
    b.h.hold = clip;
    if (!animate) return;
    b.h.animate(dt, walking ? m.speed : 0);
    // the clip has no clapping, fists or hands on the head: pose the arms like the figure this body stands in for
    const arms = !walking && !!kind && kind !== 'celebrate' && !(kind === 'standUp' && m.standing);
    b.w = THREE.MathUtils.clamp(b.w + (arms ? dt : -dt) * 4, 0, 1);
    if (b.w > 0) this.aimArms(b);
  }

  private aimArms(b: NearBody) {
    b.root.getWorldQuaternion(_qs);
    const t = crowdClock();
    for (const { upper, fore, side } of b.bones) {
      const d = armDirs(b.m.pose, side, t, b.m.phase);
      aim(upper, _va.fromArray(d.upper), _qs, b.w);
      aim(fore, _vb.fromArray(d.fore), _qs, b.w);
    }
  }

  stats() {
    const out = { size: this.members.length, present: 0, reacting: 0, standing: 0, near: 0, mid: 0, far: 0, hidden: 0, kinds: {} as Record<string, number> };
    for (const m of this.members) {
      if (!m.on) continue;
      out.present++;
      if (m.standing) out.standing++;
      if (m.st.kind) { out.reacting++; out.kinds[m.st.kind] = (out.kinds[m.st.kind] ?? 0) + 1; }
      if (m.lod === 3) out.near++; else if (m.lod === 2) out.mid++; else if (m.lod === 1) out.far++; else out.hidden++;
    }
    return out;
  }
  /** Draw calls the crowd costs now (instanced kinds drawn; a full humanoid ≈ 10). */
  drawCalls() {
    let n = 0;
    for (const b of Object.values(this.buckets)) if (b.mesh.count) n++;
    for (const b of this.bodies) if (b.h.group.visible) n += 10;
    return n;
  }

  dispose() {
    for (const b of this.bodies) this.dropBody(b);
    this.bodies = [];
    for (const b of Object.values(this.buckets)) b.dispose();
    this.group.removeFromParent();
    LIVE_CROWDS.delete(this);
  }
}

/** Turn `bone` (its +Y axis, head to tail) towards `dir` (character space), blended by w from the clip's pose. */
function aim(bone: THREE.Object3D, dir: THREE.Vector3, sceneQ: THREE.Quaternion, w: number) {
  bone.parent!.getWorldQuaternion(_qa);
  _qb.copy(_qa).multiply(bone.quaternion);
  _eye.set(0, 1, 0).applyQuaternion(_qb);
  _qd.setFromUnitVectors(_eye, dir.applyQuaternion(sceneQ).normalize());
  if (w < 1) _qd.slerp(_qi.identity(), 1 - w);
  _qb.premultiply(_qd);
  bone.quaternion.copy(_qa.invert().multiply(_qb));
  bone.updateMatrixWorld(true);
}
