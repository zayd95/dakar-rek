import * as THREE from 'three';
import { Humanoid, humanoidReady, type Clip, type PersonLook } from '../actors/humanoid';
import { cullHumanoid } from '../actors/crowdLod';
import { SIT_HIPS } from '../interact/seats';
import { rng } from '../core/rng';
import {
  Excitement, FIDGETS, REACTIONS, armDirs, calm, easePose, handLocal, offer, plan, poseFor, restState, standingFor, step,
  type Fidget, type Mood, type ReactState, type ReactionKind, type RigPose,
} from './reactions';
import { RIG_ATTRS, crowdClock, figureGeometry, flagGeometry, flagMaterial, rigMaterial, tickClock, type FigureKind, type RigAttr } from './rig';
import { defaultLook, headShape, printCode, type CrowdLook } from './looks';
export { defaultLook, type CrowdLook } from './looks';

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
  /**
   * A companion of another slot (its id): shown when that one is, not counted in `fill` or `present` (a child on a
   * parent's lap, someone standing at the rail who came with a spectator).
   */
  with?: string;
  /** A seated slot drawn standing at rest (at the rail): the seated figure, upright; it stands up for reactions as usual. */
  upright?: boolean;
  /** On the companion's lap: never stands, and is not drawn while the person it sits on stands. */
  lap?: boolean;
  /** This person hangs a banner on the parapet in front of them (its index in src/crowd/banners.ts BANNERS). */
  banner?: number;
}
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
  /** A soft round shadow under each standing figure (street crowds; one draw call). */
  blobs?: boolean;
  /** Share of the calm members who start a small gesture each second (talking, leaning in, sitting back); 0: none. */
  fidget?: number;
}

/** The same person as a full humanoid (near the player): headwear, prints and build carried over. */
export function personLook(l: CrowdLook): PersonLook {
  const h = headShape(l), head = l.head ?? (l.wrap !== null ? 'wrap' : 'hair');
  const hat = head === 'wrap' ? 'headwrap' as const : head === 'kufi' || head === 'cap' ? 'kufi' as const : null;
  const pattern = l.print && l.print <= 3 ? 'wax' as const : l.print ? 'rayure' as const : l.style === 'boubou' ? 'bazin' as const : 'uni' as const;
  const heavy = Math.max(0, Math.min(1, ((l.build ?? 1) - 1) * 4));
  const common = { skin: l.skin, pattern, accent: l.accent, hat, hatColor: hat ? h.colour : undefined, heavy, hair: head === 'none' ? 'none' as const : undefined };
  if (l.style === 'dress') return { ...common, female: true, style: 'dress', top: l.shirt, shoes: 0x6b4a2e };
  if (l.style === 'boubou') return { ...common, style: 'boubou', top: l.shirt, bottom: l.legs, shoes: 0x3a2a1e };
  return { ...common, style: 'tee', top: l.shirt, bottom: l.legs, shoes: 0x2e2620 };
}

interface Member {
  slot: CrowdSlot;
  look: CrowdLook;
  /** The shirt (the instance colour); skin, trousers and headwear go packed in iCols (rig.ts). */
  shirt: THREE.Color;
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
  mood: Mood;
  bpm: number;
  /** Index in the crowd (the near bodies' dance alternates two clips). */
  i: number;
  /** Height factor (people are not all the same size). */
  scale: number;
  fidget: Fidget | null;
  fidgetLeft: number;
  /** Colour of the flag this supporter waves when the arms go up (null: none). */
  flag: THREE.Color | null;
  /** Headwear colour (0xRRGGBB), the print's code, the crown's height factor, a brim, the build (looks.ts). */
  head: number; code: number; crown: number; brim: boolean; build: number;
  /** The slot this companion comes with, and the companions that come with this one. */
  parent: Member | null; kids: Member[];
}
interface NearBody {
  h: Humanoid; m: Member; w: number; seen: boolean;
  /** Greeted by the player (src/interact/people.ts turns the body and holds Talk): seconds left facing them. */
  greet: number; greetYaw: number;
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
    A.iCols.setXYZW(i, p.look.skin, p.look.legs, p.head, p.look.accent ?? 0);                 // packed sRGB (rig.ts)
    A.iArm.setXYZW(i, q.pitch, q.spread, q.yaw, q.elbow);
    A.iOsc.setXYZW(i, q.yawAmp, q.pitchAmp, q.freq, p.phase);
    A.iMove.setXYZW(i, q.bounce, q.lean, q.walk, q.sideOff);
    A.iLook.setXYZW(i, p.crown, (p.brim ? 1 : 0) + (p.slot.upright && !p.standing ? 2 : 0) + 4 * p.code, p.build, p.slot.banner !== undefined ? p.slot.banner + 1 : 0);
  }
  finish() {
    this.mesh.count = this.n;
    if (!this.n) return;
    this.mesh.instanceMatrix.needsUpdate = true; this.mesh.instanceColor!.needsUpdate = true;
    for (const a of Object.values(this.attrs)) a.needsUpdate = true;
  }
  dispose() { this.mesh.geometry.dispose(); this.mesh.dispose(); }
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _sc = new THREE.Vector3(1, 1, 1), _up = new THREE.Vector3(0, 1, 0);
const _fq = new THREE.Quaternion(), _fw = new THREE.Quaternion(), _fd = new THREE.Vector3(), _fy = new THREE.Vector3(0, 1, 0);
const _fr = new THREE.Frustum(), _pm = new THREE.Matrix4(), _sp = new THREE.Sphere(), _eye = new THREE.Vector3();
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qd = new THREE.Quaternion(), _qs = new THREE.Quaternion(), _qi = new THREE.Quaternion();
const _va = new THREE.Vector3(), _vb = new THREE.Vector3();

/** The cleared view of a seated player: radius around them, and a strip ahead (length, half width), in metres. */
export const CLEAR = { near: 1.3, ahead: 2.8, side: 0.5, widen: 0.4, hide: 1.0 } as const;

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
  /** The seated player's view: nobody stands up right beside them or in front of them on the way to what they watch. */
  private clear: { x: number; z: number; fx: number; fz: number } | null = null;
  private layoutDirty = true;
  private lodT = 0;
  private nearT = 0;
  private blobs: THREE.InstancedMesh | null = null;
  private flags: THREE.InstancedMesh | null = null;
  private flagged: Member[] = [];
  private fidgeting = new Set<Member>();
  private chatters = new Set<Member>();
  private fidgetRate: number;
  private fidgetT = 0;
  /** Share of the calm members leaning forward on their knees at a time (the bout's tense moments); 0: none. */
  private tension = 0;

  constructor(slots: readonly CrowdSlot[], o: CrowdOptions) {
    this.name = o.name ?? 'crowd';
    this.group.name = `crowd:${this.name}`;
    this.group.userData.noLod = true;                       // our humanoids are ours to show or hide (crowdLod.ts)
    this.rand = rng(o.seed ?? 17);
    const L = CROWD_LOD[o.quality];
    this.lod = { ...L, near: Math.max(0, Math.min(16, o.near ?? L.near)) };
    this.nearRadius = o.nearRadius ?? 10;
    this.nearNeedsFocus = !!o.nearNeedsFocus;
    this.fidgetRate = o.fidget ?? 0.03;
    const R = rng((o.seed ?? 17) * 7 + 3);
    for (const slot of slots) {
      const look = o.look ? o.look(slot, R) : defaultLook(R);
      const standing = !slot.seated, pose = { ...poseFor(null, standing) }, head = headShape(look);
      const m: Member = {
        slot, look, shirt: new THREE.Color(look.shirt),
        phase: R() * Math.PI * 2, temper: 0.6 + R() * 0.8, on: false, st: restState(), speed: 0,
        standing, pose, target: poseFor(null, standing), easing: false, lod: 0, matrix: new Float32Array(16), body: null,
        mood: 'rest', bpm: 120, i: this.members.length, scale: look.height ?? (look.style === 'dress' ? 0.93 : 0.95) + R() * 0.09,
        fidget: null, fidgetLeft: 0, flag: null,
        head: head.colour, code: printCode(look), crown: head.crown, brim: head.brim, build: look.build ?? 1,
        parent: null, kids: [],
      };
      this.place(m);
      this.members.push(m); this.byId.set(slot.id, m);
    }
    for (const m of this.members) {
      const p = m.slot.with ? this.byId.get(m.slot.with) : undefined;
      if (p && p !== m) { m.parent = p; p.kids.push(m); }
    }
    const max = Math.max(1, slots.length);
    this.buckets = { midSeated: new Bucket('midSeated', max), midStanding: new Bucket('midStanding', max), farSeated: new Bucket('farSeated', max), farStanding: new Bucket('farStanding', max) };
    for (const b of Object.values(this.buckets)) this.group.add(b.mesh);
    if (o.blobs) {
      this.blobs = new THREE.InstancedMesh(blobGeometry(), blobMaterial(), max);
      this.blobs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.blobs.count = 0; this.blobs.frustumCulled = false; this.blobs.renderOrder = 1; this.blobs.name = 'crowd_blobs';
      this.group.add(this.blobs);
    }
    LIVE_CROWDS.add(this);
  }

  private place(m: Member) {
    const s = m.slot;
    _p.set(s.x, s.y, s.z); _q.setFromAxisAngle(_up, s.yaw);
    _m.compose(_p, _q, _sc.setScalar(m.scale)).toArray(m.matrix);
  }

  // ---------------------------------------------------------------- presence
  get size() { return this.members.length; }
  /** Members shown now (companions, children on laps and people at the rail, not counted). */
  get present() { let n = 0; for (const m of this.members) if (m.on && !m.parent) n++; return n; }
  /** Members reacting now. */
  get reacting() { let n = 0; for (const m of this.members) if (m.on && m.st.kind) n++; return n; }
  slots(): CrowdSlot[] { return this.members.filter(m => m.on).map(m => m.slot); }
  has(id: string) { return !!this.byId.get(id)?.on; }

  /**
   * Show the first `n` slots (in the order given), except those `skip` names (a seat the player or someone else holds).
   * Companions come and go with theirs.
   */
  fill(n: number, skip?: (id: string) => boolean) {
    let k = 0;
    for (const m of this.members) {
      if (m.parent) continue;
      const want = k < n && !skip?.(m.slot.id);
      if (k < n) k++;
      this.setOn(m, want);
    }
  }
  setPresent(id: string, on: boolean) { const m = this.byId.get(id); if (m) this.setOn(m, on); }
  private setOn(m: Member, on: boolean) {
    for (const k of m.kids) this.setOn(k, on);
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
  /** What a group does between reactions: rest, or dance on a beat of `bpm` (the near bodies dance their clips). */
  setMood(group: string, mood: Mood, bpm = 120) {
    for (const m of this.members) if (group === 'all' || m.slot.tags?.includes(group)) {
      if (m.mood === mood && m.bpm === bpm) continue;
      m.mood = mood; m.bpm = bpm;
      if (mood === 'chat') this.chatters.add(m); else this.chatters.delete(m);
      this.retarget(m);
    }
  }
  /** This member waves a flag of `colour` whenever the arms go up (shouting, celebrating). */
  giveFlag(id: string, colour: number) {
    const m = this.byId.get(id); if (!m) return;
    if (!m.flag) this.flagged.push(m);
    m.flag = new THREE.Color(colour);
    if (!this.flags) {
      this.flags = new THREE.InstancedMesh(flagGeometry(), flagMaterial(), Math.max(1, this.members.length));
      this.flags.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.flags.setColorAt(0, m.flag); this.flags.instanceColor!.setUsage(THREE.DynamicDrawUsage);
      this.flags.count = 0; this.flags.frustumCulled = false; this.flags.name = 'crowd_flags';
      this.group.add(this.flags);
    }
  }
  /** One member's mood (a person joining a group chat, leaving it for a walk). */
  setMemberMood(id: string, mood: Mood, bpm = 120) {
    const m = this.byId.get(id); if (!m || (m.mood === mood && m.bpm === bpm)) return;
    m.mood = mood; m.bpm = bpm;
    if (mood === 'chat') this.chatters.add(m); else this.chatters.delete(m);
    this.retarget(m);
  }
  /**
   * The bout's tense moments: about `share` of the calm members lean forward, elbows on their knees, a few seconds each,
   * others taking over (0: back to the usual small gestures).
   */
  setTension(share: number) { this.tension = Math.max(0, Math.min(0.6, share)); }
  /** Everyone in the group settles back at once. */
  calm(group = 'all') {
    for (const m of this.members) if (group === 'all' || m.slot.tags?.includes(group)) if (calm(m.st)) this.retarget(m);
  }
  /** How excited a group is (0–1), for the crowd's sound. */
  level(group = 'all') { return this.excite.level(group); }
  /** The reaction a member shows now (null: at rest or absent). */
  reactionOf(id: string): ReactionKind | null { const m = this.byId.get(id); return m?.on ? m.st.kind : null; }
  standingNow(id: string): boolean { return !!this.byId.get(id)?.standing; }
  /** How a member looks (null: no such slot). */
  lookOf(id: string): CrowdLook | null { return this.byId.get(id)?.look ?? null; }
  /** Whether a member is drawn now (any level of detail). */
  drawn(id: string): boolean { const m = this.byId.get(id); return !!m && m.on && m.lod > 0; }

  private retarget(m: Member, snap = false) {
    const kind = m.on ? m.st.kind : null;
    if ((kind || !m.on) && m.fidget) { m.fidget = null; this.fidgeting.delete(m); }
    const standing = standingFor(m.slot.seated, kind) && !(m.slot.seated && this.inClearView(m.slot.x, m.slot.z)) && !m.slot.lap;
    if (standing !== m.standing) { m.standing = standing; this.layoutDirty = true; }
    m.target = poseFor(kind, standing, m.speed, m.mood, m.bpm, m.fidget);
    // at a grab some lean in further than others (the keen ones), at rest too when the bout is tense
    if (kind === 'grab' || m.fidget === 'lean') m.target = { ...m.target, lean: m.target.lean * (0.75 + (m.temper - 0.6) * 0.6) };
    if (snap) { Object.assign(m.pose, m.target); m.easing = false; } else m.easing = true;
  }

  // ---------------------------------------------------------------- level of detail
  /** Full humanoids go to the members nearest (x, z), those in front of `yaw` first; null: nearest to the camera. */
  setFocus(x: number, z: number | null, yaw: number | null = null) {
    this.focus = z === null ? null : { x, z, yaw };
    this.nearT = 0;
  }
  /**
   * Keep the view of someone seated at (x, z) facing `yaw` clear (null: nobody seated): the people right beside them and
   * those in front of them on their sight line (the next two rows down, a widening strip) stay seated whatever happens —
   * they cheer, clap and hold their heads from their seats — so no head or shoulder ever fills the player's view, and
   * the stands still look full.
   */
  setClearView(v: { x: number; z: number; yaw: number } | null) {
    const was = new Set(this.members.filter(m => this.inClearView(m.slot.x, m.slot.z)));
    this.clear = v ? { x: v.x, z: v.z, fx: Math.sin(v.yaw), fz: Math.cos(v.yaw) } : null;
    for (const m of this.members) if (was.has(m) || this.inClearView(m.slot.x, m.slot.z)) this.retarget(m);
    this.layoutDirty = true; this.nearT = 0;
  }
  /** Whether a member stands in the cleared view (pure geometry, exported for the tests through `inClearView`). */
  inClearView(x: number, z: number) {
    const c = this.clear; if (!c) return false;
    const dx = x - c.x, dz = z - c.z;
    if (dx * dx + dz * dz < CLEAR.near * CLEAR.near) return true;
    const fwd = dx * c.fx + dz * c.fz, lat = Math.abs(-dx * c.fz + dz * c.fx);
    return fwd > 0 && fwd < CLEAR.ahead && lat < CLEAR.side + CLEAR.widen * fwd;
  }
  /**
   * Right beside the seated player (within a metre: the neighbours on either side): not drawn at all, so a head and
   * shoulder never fill the screen when the gaze follows the bout sideways. They keep their seats.
   */
  besideView(x: number, z: number) {
    const c = this.clear; if (!c) return false;
    const dx = x - c.x, dz = z - c.z;
    return dx * dx + dz * dz < CLEAR.hide * CLEAR.hide;
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
      if (!m.on || this.besideView(m.slot.x, m.slot.z)) lod = 0;
      else if (m.slot.lap && m.parent?.standing) lod = 0;                       // the parent is up: the child is not drawn
      else if (m.slot.upright && !m.standing && this.inClearView(m.slot.x, m.slot.z)) lod = 0;
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
        // full bodies for the seated adults only (a child, someone at the rail or a banner's holder stays a figure)
        if (!m.on || this.besideView(m.slot.x, m.slot.z) || m.parent || m.look.child || m.slot.banner !== undefined) continue;
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
    // no shadow pass for the crowd's full bodies (it doubles their ten draw calls): the stands are under the roof's
    // shade, and on the street the crowd's round ground shadow sits under them like under the figures
    h.group.traverse(o => { if ((o as THREE.Mesh).isMesh) o.castShadow = false; });
    const root = h.group.children.find(c => c.name === 'Scene') ?? h.group.children[0];
    const bones: NearBody['bones'] = [];
    for (const [s, side] of [['L', 1], ['R', -1]] as const) {
      const upper = h.group.getObjectByName(`upper_arm${s}`), fore = h.group.getObjectByName(`forearm${s}`);
      if (upper && fore) bones.push({ upper, fore, side });
    }
    this.group.add(h.group);
    const b: NearBody = { h, m, w: 0, seen: true, root, bones, greet: 0, greetYaw: 0 };
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
    tickClock(performance.now());
    this.excite.decay(dt);
    for (const m of this.members) if (m.on && step(m.st, dt)) this.retarget(m);
    this.fidgets(dt);
    this.nearT -= dt;
    if (this.nearT <= 0) { this.nearT = 0.5; this.pickNear(); }
    this.lodT -= dt;
    if (this.lodT <= 0 || this.layoutDirty) { this.lodT = 0.25; this.assignLod(); }
    let posed = false;
    const k = 1 - Math.exp(-dt * 7);
    for (const m of this.members) if (m.easing && m.on) { m.easing = easePose(m.pose, m.target, k); if (m.lod === 1 || m.lod === 2) posed = true; }
    if (this.layoutDirty || posed) this.write();
    for (const b of this.bodies) this.updateBody(b, dt, animate);
    if (this.flags) this.waveFlags();
  }

  /** A few calm people at a time talk with their hands, lean in or sit back for a few seconds. */
  private fidgets(dt: number) {
    for (const m of this.fidgeting) {
      m.fidgetLeft -= dt;
      if (m.fidgetLeft <= 0) { m.fidget = null; this.fidgeting.delete(m); this.retarget(m); }
    }
    this.fidgetT -= dt;
    if (this.fidgetT > 0 || !this.members.length) return;
    this.fidgetT = 0.5;
    // people chatting take turns talking with their hands
    for (const m of this.chatters) {
      if (!m.on || m.st.kind || m.st.next || m.fidget || m.speed > 0.2 || this.rand() > 0.22) continue;
      m.fidget = 'talk'; m.fidgetLeft = 1.2 + this.rand() * 1.8;
      this.fidgeting.add(m); this.retarget(m);
    }
    if (this.tension > 0) {                                         // the bout is tense: people lean in, elbows on their knees
      const want = this.members.length * this.tension;
      let have = 0;
      for (const m of this.fidgeting) if (m.fidget === 'lean') have++;
      for (let tries = 0, k = Math.min(12, Math.ceil((want - have) * 0.35)); k > 0 && tries < k * 4; tries++) {
        const m = this.members[Math.floor(this.rand() * this.members.length)];
        if (!m.on || m.st.kind || m.st.next || m.fidget || m.speed > 0.2 || m.mood !== 'rest' || m.slot.upright) continue;
        m.fidget = 'lean'; m.fidgetLeft = 3 + this.rand() * 4;
        this.fidgeting.add(m); this.retarget(m); k--;
      }
    }
    if (!this.fidgetRate) return;
    const n = this.members.length * this.fidgetRate * 0.5;
    let k = Math.floor(n) + (this.rand() < n % 1 ? 1 : 0);
    for (let tries = 0; k > 0 && tries < k * 4; tries++) {
      const m = this.members[Math.floor(this.rand() * this.members.length)];
      if (!m.on || m.st.kind || m.st.next || m.fidget || m.speed > 0.2 || m.mood !== 'rest') continue;
      m.fidget = FIDGETS[Math.floor(this.rand() * FIDGETS.length)]; m.fidgetLeft = 2 + this.rand() * 4;
      this.fidgeting.add(m); this.retarget(m); k--;
    }
  }

  /** Supporters with a flag wave it while their arms are up (the left hand, as the figure draws it). */
  private waveFlags() {
    const F = this.flags!, arr = F.instanceMatrix.array as Float32Array, t = crowdClock();
    let n = 0;
    for (const m of this.flagged) {
      if (!m.on || (m.lod !== 1 && m.lod !== 2) || m.pose.pitch < 1.7) continue;
      const far = m.lod === 1, h = handLocal(m.pose, 1, t, m.phase, m.standing, far), d = armDirs(m.pose, 1, t, m.phase);
      const dir = far ? d.upper : d.fore;
      _p.set(h[0], h[1], h[2]).applyMatrix4(_m.fromArray(m.matrix));
      _q.setFromAxisAngle(_up, m.slot.yaw);
      _fd.set(dir[0], dir[1], dir[2]).applyQuaternion(_q).normalize();
      _fq.setFromUnitVectors(_fy, _fd).multiply(_fw.setFromAxisAngle(_fy, m.slot.yaw + Math.sin(t * 6 + m.phase) * 0.7));
      _m.compose(_p, _fq, _sc.setScalar(m.scale)).toArray(arr, n * 16);
      F.setColorAt(n, m.flag!);
      n++;
    }
    F.count = n;
    if (n) { F.instanceMatrix.needsUpdate = true; F.instanceColor!.needsUpdate = true; }
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
    if (this.blobs) {
      let n = 0;
      const arr = this.blobs.instanceMatrix.array as Float32Array;
      for (const m of this.members) {
        if (!m.on || !m.standing || m.lod === 0) continue;
        arr.set(m.matrix, n * 16); arr[n * 16 + 13] += 0.03; n++;
      }
      this.blobs.count = n; if (n) this.blobs.instanceMatrix.needsUpdate = true;
    }
  }

  private updateBody(b: NearBody, dt: number, animate: boolean) {
    const m = b.m, s = m.slot, g = b.h.group;
    g.visible = m.on && b.seen;
    if (!g.visible) return;
    const walking = m.speed > 0.2, kind = m.st.kind;
    // the player greeted this person (People set Talk and turned them): standing still, they face the player a moment
    if (b.h.hold === 'Talk' && b.greet <= 0 && !walking && m.standing) { b.greet = 2.6; b.greetYaw = g.rotation.y; }
    b.greet = Math.max(0, b.greet - dt);
    g.position.set(s.x, m.standing ? s.y : s.y - SIT_HIPS, s.z); g.rotation.y = b.greet > 0 ? b.greetYaw : s.yaw;
    const dancing = !kind && m.mood === 'dance' && m.standing;
    const clip: Clip | null = walking ? null : !m.standing ? 'Sit' : b.greet > 0 ? 'Talk' : kind === 'celebrate' ? 'Celebrate' : dancing ? (m.i % 2 ? 'Dance_B' : 'Dance_A') : 'Idle';
    b.h.hold = clip;
    if (!animate) return;
    b.h.animate(dt, walking ? m.speed : 0);
    // the clip has no clapping, fists or hands on the head: pose the arms like the figure this body stands in for
    const arms = !walking && ((!!kind && kind !== 'celebrate' && !(kind === 'standUp' && m.standing)) || (!kind && !!m.fidget));
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

  /**
   * The full humanoids of this crowd as people of the street (src/interact/people.ts): the player can greet the
   * spectator next to them or a passer-by, like anyone in the city.
   */
  people(): { id: string; obj: THREE.Object3D; h: Humanoid; female: boolean; seated: boolean; bias: number }[] {
    return this.bodies.filter(b => b.m.on).map(b => ({ id: `crowd:${this.name}:${b.m.slot.id}`, obj: b.h.group, h: b.h, female: b.m.look.style === 'dress', seated: !b.m.standing, bias: 0.8 }));
  }

  stats() {
    const out = { size: this.members.length, present: 0, companions: 0, companionsDrawn: 0, reacting: 0, standing: 0, near: 0, mid: 0, far: 0, hidden: 0, fidgeting: this.fidgeting.size, flagsUp: this.flags?.count ?? 0, kinds: {} as Record<string, number> };
    for (const m of this.members) {
      if (!m.on) continue;
      // companions (children on laps, people at the rail) are counted apart: the rest is about the seats
      if (m.parent) { out.companions++; if (m.lod) out.companionsDrawn++; continue; }
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
    if (this.blobs?.count) n++;
    if (this.flags?.count) n++;
    for (const b of this.bodies) if (b.h.group.visible) n += 10;
    return n;
  }

  dispose() {
    for (const b of this.bodies) this.dropBody(b);
    this.bodies = [];
    for (const b of Object.values(this.buckets)) b.dispose();
    this.blobs?.dispose();
    if (this.flags) { this.flags.geometry.dispose(); this.flags.dispose(); }
    this.group.removeFromParent();
    LIVE_CROWDS.delete(this);
  }
}

// ---------------------------------------------------------------- ground shadows (shared)
let blobGeo: THREE.BufferGeometry | null = null, blobMat: THREE.MeshBasicMaterial | null = null;
function blobGeometry() { return (blobGeo ??= new THREE.CircleGeometry(0.34, 14).rotateX(-Math.PI / 2)); }
function blobMaterial() {
  return (blobMat ??= new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
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
