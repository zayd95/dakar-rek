import * as THREE from 'three';
import { GaitState, RIG } from '../actors/gait';
import { GaitRig } from '../actors/gaitRig';
import type { Wrestler } from '../actors/humanoid';
import { AIMS } from './strikeRig';
import type { FallKind, GripKind, ThrowId, Vec } from './combat';
import type { ClinchMove } from './clinch';
import { ClipPlayer, combatClips, CLIP_REST_HIPS, type ClipId } from './combatClips';

/**
 * The new bout's bodies (docs/wrestling/COMBAT.md « Les corps »): what the rules do, seen on the 20-bone rig — v4's body or
 * the Roi des Arènes' (the same bones), after the clip and before the frame is drawn. Procedural, ours (movement
 * placeholders of the game, not the reproduction of any real technique):
 *
 * - **A crouched fighting stance whose feet stay planted and step**: the legs are put on the feet by the game's own
 *   two-bone IK (src/actors/gaitRig.ts, given a state of our own: no shared file changes), the hips low; a foot steps
 *   (a short arc) when the body has moved too far from it, one foot at a time — nobody glides.
 * - **The weight**: the hips go over the lean, the trunk leans the way the balance goes (arched back when pushed, folded
 *   forward when pulled, sideways when turned), the knees bend deeper when he braces.
 * - **The hands on the hold**: both arms by two-bone IK onto the other man's bones — the nape and shoulders, the arm, the
 *   belt (the ngemb at his hips), the leg (his thigh) —, reaching there while the reach is under way.
 * - **Moves and throws set up** (the tells): Làmb 2.0's push / pull / pivot aims, the hip turned in, the leg hooked
 *   behind, the sweep, the squat under him, the dive to the leg, the head pulled down; the falls by the throw that caused
 *   them (over the hip, backwards, swept to a side, lifted and dropped, onto the four supports).
 * - **The sign over his head** (levels 1–2 and the lesson): what he sets up, in a few words.
 *
 * **The clips underneath** (src/lamb/combatClips.ts, once loaded): the retargeted Meshy wrestling clips are the base pose
 * — the stance, the fight walks matched to his speed, the drive and the sprawl in the clinch, the throw's own clip
 * time-warped onto its wind-up, the man thrown on his back, the falls, the stagger, the get-up, the victory — and all of
 * the above goes on top: the feet planted by IK (the clip's hips height kept), the trunk turned by the springs and the
 * weight, the hands on the hold (the pair stays bound), the sign. Without them the body is the procedural one alone.
 *
 * Bones are only turned; a bone the clip did not write again since the last frame is first put back to the clip's value
 * (three's mixer writes a bone only when its value changes), so nothing adds up frame after frame.
 */
const ARM: readonly ['upper_armL' | 'upper_armR', 'forearmL' | 'forearmR', 'handL' | 'handR'][] = [['upper_armL', 'forearmL', 'handL'], ['upper_armR', 'forearmR', 'handR']];
const TOUCHED = ['root', 'hips', 'spine', 'chest', 'neck', 'head', 'shoulderL', 'shoulderR', 'upper_armL', 'forearmL', 'handL', 'upper_armR', 'forearmR', 'handR', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'] as const;
type Bone = (typeof TOUCHED)[number];

const Y = new THREE.Vector3(0, 1, 0);
const ARMS: ReadonlySet<string> = new Set(['shoulderL', 'upper_armL', 'forearmL', 'handL', 'shoulderR', 'upper_armR', 'forearmR', 'handR']);
/** Each throw's clip: the wind-up's span (driven by its progress), then the follow-through's end (s, clip time). */
const THROW_CLIP: Record<ThrowId, { clip: ClipId; from: number; to: number; end: number }> = {
  hanche: { clip: 'hip_throw', from: 0.25, to: 1.35, end: 2.6 },
  souleve: { clip: 'lift_drop', from: 0.2, to: 1.05, end: 1.5 },
  balayage: { clip: 'shoulder_throw', from: 0.6, to: 2.9, end: 4.2 },
  ramene: { clip: 'grip_throw', from: 0.4, to: 2.6, end: 3.6 },
  croc: { clip: 'push_drive', from: 0.3, to: 1.6, end: 2.6 },
  jambe: { clip: 'push_drive', from: 0.5, to: 1.7, end: 2.7 },
};
const V1 = new THREE.Vector3(), V2 = new THREE.Vector3(), V3 = new THREE.Vector3(), V4 = new THREE.Vector3(), V5 = new THREE.Vector3();
const S = new THREE.Vector3(), T = new THREE.Vector3(), E = new THREE.Vector3(), P = new THREE.Vector3();
const Q1 = new THREE.Quaternion(), Q2 = new THREE.Quaternion(), Q3 = new THREE.Quaternion(), QC = new THREE.Quaternion();
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const smooth = (u: number) => { const x = clamp(u, 0, 1); return x * x * (3 - 2 * x); };
/** One step of a damped spring towards `to` (angular frequency `w`, damping ratio `z`): [x, v]. */
const SP = { x: 0, v: 0 };
const spring = (x: number, v: number, to: number, w: number, z: number, h: number) => { SP.v = v + (w * w * (to - x) - 2 * z * w * v) * h; SP.x = x + SP.v * h; return SP; };

/** What the duel gives the rig each frame. */
export interface PoseIn {
  dt: number; phase: string; ring: THREE.Vector3;
  /** The other wrestler (his body and his rig), for the hands' targets. */
  other: Wrestler | null; otherLook: CombatRig | null;
  /** His imbalance and weight (own frame: f towards the other man, s to his left). */
  lean: Vec; weight: Vec;
  hold: GripKind | null; holdStr: number;
  reach: { kind: GripKind; k: number } | null;
  move: { kind: ClinchMove; k: number; side: number } | null;
  throwing: { id: ThrowId; k: number } | null;
  thrown: { id: ThrowId; k: number } | null;
  fall: { kind: FallKind; throw: ThrowId | null; t: number; force?: number } | null;
  /** How far the other man is (m), standing. */
  apart?: number;
  /** The cinematic bout (src/lamb/cinematic.ts): this clip at this time (s), nothing else — the two halves of a paired move are played on one clock. */
  force?: { id: ClipId; t: number } | null;
  /** On top of a forced clip: the trunk leant (rad) forward into the other man (f) and sideways (s) — his balance, seen. */
  tilt?: { f: number; s: number } | null;
  won: boolean; guard: boolean; stagger: number;
  /** How crouched (0 upright … 1 the fighting stance). */
  crouch: number;
  /** Làmb 2.0's strike rig on top (avec frappe, standing), run inside so its turns are put back too. */
  after?: () => void;
}

/** A foot of the stance: where it stands on the ground (world x, z), its heading, and a step under way. */
interface Planted { x: number; z: number; yaw: number; swing: { fx: number; fz: number; fyaw: number; tx: number; tz: number; tyaw: number; s: number; dur: number } | null }

const TV1 = new THREE.Vector3(), TV2 = new THREE.Vector3(), TUP = new THREE.Vector3(0, 1, 0);
const TQ1 = new THREE.Quaternion(), TQ2 = new THREE.Quaternion(), TQ3 = new THREE.Quaternion(), TQ4 = new THREE.Quaternion();

export class CombatRig {
  private b = {} as Record<Bone, THREE.Object3D>;
  private ok: boolean;
  private space: THREE.Object3D;
  private gaitRig: GaitRig | null;
  private g = new GaitState();
  private feet: [Planted, Planted] = [{ x: 0, z: 0, yaw: 0, swing: null }, { x: 0, z: 0, yaw: 0, swing: null }];
  private placed = false;
  private clipQ = new Map<Bone, THREE.Quaternion>();
  private setQ = new Map<Bone, THREE.Quaternion>();
  private clipP = new Map<'root' | 'hips', THREE.Vector3>();
  private setP = new Map<'root' | 'hips', THREE.Vector3>();
  /** Blends (eased): the stance's legs, the hands on the hold. */
  private wLegs = 0; private wHands = 0;
  private lastX = NaN; private lastZ = NaN; private vx = 0; private vz = 0;
  /** Checks: steps taken, how far a planted foot slid (m), the hands' distance to their targets, the trunk's lean (rad, own frame), the hips' drop (m). */
  steps = 0; slid = 0; handGap = -1; trunk = { f: 0, s: 0 }; drop = 0; kneeBend = 0;
  /** Checks: the head's height over the sand as drawn (m): a man thrown is seen on the sand. */
  headY = 0;
  private sprite: THREE.Sprite | null = null;
  private signText: string | null = null;
  private fallYaw = 0;
  /**
   * The body's springs (fighting-game feel, src/lamb/combatRig.ts): the hips lead (a stiff spring), the trunk follows
   * them with lag and a little overshoot (a softer, under-damped one), a knee buckle when the balance is hit hard
   * (an impulse that springs back: the recovery). Plain numbers, no allocation.
   */
  private hx = 0; private hz = 0; private hvx = 0; private hvz = 0;
  private tf = 0; private ts = 0; private tvf = 0; private tvs = 0;
  private buckle = 0; private bv = 0; private depthWas = 0;
  /** Checks: stumble steps taken (a step the way the balance went when it was hit). */
  stumbles = 0;
  /** The clips' layer, its weight (eased in once they are loaded), the clip's own drop of the hips (m, own frame). */
  private player = new ClipPlayer();
  private wClip = 0; private clipDrop = 0; private clipLegs = 0;
  private restHips = new THREE.Vector3();
  /** The root bone at rest: with the clips on, it stays there (the clips move the hips; the body's own clip — Fall_Back — must not lower the root under them). */
  private restRoot: { p: THREE.Vector3; q: THREE.Quaternion } | null = null;
  private downWas = false; private resT = 0; private wonT = 0; private lastThrow: ThrowId | null = null;
  /** Checks: the clip under the body now, and its time. */
  clip: ClipId | null = null; clipT = 0;

  constructor(readonly w: Wrestler) {
    const root = w.group.children.find(c => c.name === 'Scene') ?? w.group.children[0] ?? w.group;
    let ok = true;
    for (const n of TOUCHED) { const o = root.getObjectByName(n); if (!o) ok = false; else this.b[n] = o; }
    this.ok = ok;
    this.space = this.b.root?.parent ?? root;                              // the gait's character space: the root bone's parent
    this.gaitRig = ok ? GaitRig.from(root) : null;                       // its rest: the bind pose, as made
    if (ok) this.restHips.copy(this.b.hips.position);
    if (ok && this.b.root) this.restRoot = { p: this.b.root.position.clone(), q: this.b.root.quaternion.clone() };
    this.g.m = 0;
    w.fullRate = true;
  }

  /** The bones this rig turns, put back to the clip's values where the clip did not write them again (nothing adds up). */
  private restore() {
    for (const n of TOUCHED) {
      const bone = this.b[n], set = this.setQ.get(n), clip = this.clipQ.get(n);
      if (set && clip && bone.quaternion.equals(set)) bone.quaternion.copy(clip);
      (this.clipQ.get(n) ?? this.clipQ.set(n, new THREE.Quaternion()).get(n)!).copy(bone.quaternion);
    }
    for (const n of ['root', 'hips'] as const) {
      const bone = this.b[n], set = this.setP.get(n), clip = this.clipP.get(n);
      if (set && clip && bone.position.equals(set)) bone.position.copy(clip);
      (this.clipP.get(n) ?? this.clipP.set(n, new THREE.Vector3()).get(n)!).copy(bone.position);
    }
  }
  private keep() {
    for (const n of TOUCHED) (this.setQ.get(n) ?? this.setQ.set(n, new THREE.Quaternion()).get(n)!).copy(this.b[n].quaternion);
    for (const n of ['root', 'hips'] as const) (this.setP.get(n) ?? this.setP.set(n, new THREE.Vector3()).get(n)!).copy(this.b[n].position);
  }

  /** Turns `bone` so its +Y points along the world direction `dir`, blended by `w`. */
  private aimWorld(bone: THREE.Object3D, dir: THREE.Vector3, w: number) {
    if (w <= 0.001 || !bone.parent) return;
    bone.parent.getWorldQuaternion(Q1);
    Q2.copy(Q1).multiply(bone.quaternion);
    V1.copy(Y).applyQuaternion(Q2);
    Q3.setFromUnitVectors(V1, V2.copy(dir).normalize()).multiply(Q2);
    Q3.premultiply(Q1.invert());
    bone.quaternion.slerp(Q3, Math.min(1, w));
    bone.updateMatrixWorld(true);
  }
  /** A character-space aim (Làmb 2.0's AIMS: +z forward, +x his left, +y up) on the bones it lists. */
  private aimChar(aim: Partial<Record<string, [number, number, number]>>, w: number) {
    if (w <= 0.001) return;
    this.space.getWorldQuaternion(QC);
    for (const n of ['spine', 'chest', 'neck', 'head', 'upper_armL', 'forearmL', 'handL', 'upper_armR', 'forearmR', 'handR'] as const) {
      const a = aim[n]; if (!a) continue;
      V3.set(a[0], a[1], a[2]).normalize().applyQuaternion(QC);
      this.aimWorld(this.b[n], V3, w);
    }
  }

  /** Turns `bone` in the world about his own side axis (`pitch`: forward) and forward axis (`roll`: to his left). */
  private tilt(bone: THREE.Object3D, pitch: number, roll: number) {
    if (!bone.parent || (Math.abs(pitch) < 1e-4 && Math.abs(roll) < 1e-4)) return;
    this.space.getWorldQuaternion(QC);
    V1.set(1, 0, 0).applyQuaternion(QC); V2.set(0, 0, 1).applyQuaternion(QC);
    Q1.setFromAxisAngle(V1, pitch); Q2.setFromAxisAngle(V2, -roll); Q1.multiply(Q2);
    bone.getWorldQuaternion(Q3); Q3.premultiply(Q1);
    bone.parent.getWorldQuaternion(Q2); bone.quaternion.copy(Q2.invert().multiply(Q3));
    bone.updateMatrixWorld(true);
  }

  /** The world point of a bone of this body (for the other's hands). */
  point(name: Bone, out: THREE.Vector3): THREE.Vector3 { return this.b[name] ? this.b[name].getWorldPosition(out) : out.copy(this.w.group.position); }

  /** The sign over his head (null: none). */
  sign(text: string | null) {
    if (text === this.signText) return;
    this.signText = text;
    if (!text) { if (this.sprite) this.sprite.visible = false; return; }
    if (typeof document === 'undefined') return;
    if (!this.sprite) {
      const c = document.createElement('canvas'); c.width = 256; c.height = 64;
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
      this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
      this.sprite.renderOrder = 10; this.sprite.scale.set(0.9, 0.225, 1);
      this.w.group.add(this.sprite);
    }
    const tex = (this.sprite.material as THREE.SpriteMaterial).map as THREE.CanvasTexture, c = tex.image as HTMLCanvasElement, x = c.getContext('2d');
    if (x) {
      x.clearRect(0, 0, 256, 64);
      x.fillStyle = 'rgba(15,23,42,.82)'; x.beginPath(); x.roundRect?.(4, 6, 248, 52, 14); if (!x.roundRect) x.rect(4, 6, 248, 52); x.fill();
      x.fillStyle = '#fde68a'; x.font = '800 30px system-ui,sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, 128, 33);
    }
    tex.needsUpdate = true;
    this.sprite.visible = true;
    this.sprite.position.set(0, (this.w.headTop() / (this.w.group.scale.y || 1)) + 0.3, 0);
  }

  /** Checks (`duelInfo().combat.body`): what the body shows now. */
  info() {
    const r = (x: number) => Math.round(x * 100) / 100;
    return { head: r(this.headY), stumbles: this.stumbles, buckle: r(this.buckle), steps: this.steps, slid: r(this.slid), handGap: r(this.handGap), trunk: { f: r(this.trunk.f), s: r(this.trunk.s) }, drop: r(this.drop), kneeBend: r(this.kneeBend), legs: r(this.wLegs), hands: r(this.wHands), planted: this.feet.map(f => !f.swing), sign: this.signText, clip: this.clip, clipT: r(this.clipT), clipW: r(this.wClip) };
  }

  pose(p: PoseIn) {
    if (!this.ok || !this.gaitRig) return;
    const g = this.w.group, dt = p.dt;
    this.restore();
    // the body's own motion (for the steps' lead)
    if (dt > 0 && Number.isFinite(this.lastX)) { const a = Math.min(1, dt / 0.12); this.vx += ((g.position.x - this.lastX) / dt - this.vx) * a; this.vz += ((g.position.z - this.lastZ) / dt - this.vz) * a; }
    this.lastX = g.position.x; this.lastZ = g.position.z;
    const fighting = p.phase === 'fight' || p.phase === 'clinch';
    g.rotation.order = 'YXZ'; g.rotation.x = 0;
    // the clips underneath (once loaded): the base pose, everything below on top
    const lib = combatClips();
    this.wClip += clamp((lib ? 1 : 0) - this.wClip, -dt / 0.3, dt / 0.3);
    this.clipLegs = 0;
    if (lib && this.restRoot && this.b.root) { this.b.root.position.copy(this.restRoot.p); this.b.root.quaternion.copy(this.restRoot.q); }
    if (lib) this.baseClip(p);
    if (p.force && lib) { if (p.tilt && p.other) this.tiltTrunk(p.tilt, p.other.group.position); this.wLegs = 0; this.wHands = 0; this.keep(); this.headY = this.b.head.getWorldPosition(V1).y - p.ring.y; return; }
    if (p.fall) { this.fallPose(p); p.after?.(); this.keep(); this.headY = this.b.head.getWorldPosition(V1).y - p.ring.y; return; }
    this.fallYaw = 0;
    const legsOn = (fighting || (p.phase === 'fall' && !p.won)) && this.clipLegs < 0.5;
    this.wLegs += clamp((legsOn ? 1 : 0) - this.wLegs, -dt / 0.25, dt / 0.25);
    if (!legsOn && this.wLegs < 0.05) this.placed = false;               // the clip walks: the feet are put down afresh when it stops
    const holdOn = p.phase === 'clinch' && !!p.hold || !!p.reach;
    this.wHands += clamp((holdOn ? 1 : 0) - this.wHands, -dt / 0.2, dt / 0.15);
    const throwK = p.throwing?.k ?? 0;
    // the throw's own turn of the body (the hip turned in: his back comes against the other's chest)
    if (p.throwing && (p.throwing.id === 'hanche' || p.throwing.id === 'balayage')) g.rotation.y += (p.throwing.id === 'hanche' ? 1.25 : 0.55) * smooth(throwK / 0.8) * (1 - 0.5 * this.wClip);
    g.updateMatrixWorld(true);
    if (this.wLegs > 0.01) this.legs(p, throwK);
    this.trunkPose(p);
    if (this.wHands > 0.01 && p.other) this.hands(p);
    else this.handGap = -1;
    p.after?.();
    this.keep();
    this.headY = this.b.head.getWorldPosition(V1).y - p.ring.y;
  }

  /** The trunk leant on top of the clip (spine and chest, half each): forward towards `to`, and sideways. */
  private tiltTrunk(t: { f: number; s: number }, to: THREE.Vector3) {
    const g = this.w.group, dir = TV1.set(to.x - g.position.x, 0, to.z - g.position.z);
    if (dir.lengthSq() < 1e-6 || (Math.abs(t.f) < 0.01 && Math.abs(t.s) < 0.01)) return;
    dir.normalize();
    const axF = TV2.crossVectors(TUP, dir), q = TQ1.setFromAxisAngle(axF, t.f * 0.5).multiply(TQ2.setFromAxisAngle(dir, t.s * 0.5));
    g.updateMatrixWorld(true);
    for (const k of ['spine', 'chest'] as const) {
      const b = this.b[k]; if (!b || !b.parent) continue;
      b.parent.getWorldQuaternion(TQ3);
      // world rotation q applied to the bone: local' = parentWorld⁻¹ · q · parentWorld · local
      b.quaternion.premultiply(TQ4.copy(TQ3).invert().multiply(q).multiply(TQ3));
      b.updateMatrixWorld(true);
    }
  }

  /**
   * The clip under the body for what the rules do now, written onto the bones (cross-faded): the stance (back and forth
   * over its crouch), the fight walks at his own speed, the drive and the sprawl in the clinch, the throw's clip on its
   * wind-up's clock then its follow-through, the man thrown, the falls by the throw, the stagger (arms kept), the get-up
   * after the fall, the victory.
   */
  private baseClip(p: PoseIn) {
    const pl = this.player, g = this.w.group, dt = p.dt;
    let skip: ReadonlySet<string> | undefined;
    const down = !!p.fall, wasDown = this.downWas;
    if (down) this.downWas = true;
    if (p.phase !== 'fall' && p.phase !== 'result') { this.downWas = false; this.wonT = 0; }
    this.resT = p.phase === 'result' ? this.resT + dt : 0;
    if (p.throwing) this.lastThrow = p.throwing.id;
    if (p.force) {
      const c = combatClips()?.get(p.force.id);
      if (c) { pl.play(p.force.id, { mode: 'driven', from: 0, to: c.dur, fade: 0.15 }); pl.at(clamp(p.force.t / c.dur, 0, 1)); }
      this.clipLegs = 1;
    } else if (p.fall) {
      const t = p.fall.t, id = p.fall.throw;
      if (p.fall.kind === 'appuis' || id === 'ramene') { pl.play('fall_fwd', { mode: 'driven', from: 0.25, to: 1.45, fade: 0.12 }); pl.at(t / 0.95); }
      else if ((p.fall.force ?? 0.5) < 0.4) { pl.play('fall_back', { mode: 'driven', from: 1.25, to: 3.05, fade: 0.15 }); pl.at(t / 1.7); }   // a weak throw: he is put down, backwards
      else if (id === 'hanche' || id === 'souleve' || (p.fall.force ?? 0) > 0.72) {
        // a strong throw (or over the hip): lifted, over in the air (thrown_back's flight), slammed on his back (fall_back's last second)
        if (t < 0.75) { pl.play('thrown_back', { mode: 'driven', from: 0.35, to: 1.35, fade: 0.1 }); pl.at(t / 0.75); }
        else { pl.play('fall_back', { mode: 'driven', from: 2.35, to: 3.05, fade: 0.22 }); pl.at((t - 0.75) / 0.6); }
      }
      else if (id === 'balayage') { pl.play('knock_down', { mode: 'driven', from: 0.2, to: 1.75, fade: 0.1 }); pl.at(t / 1.25); }
      else { pl.play('fall_back', { mode: 'driven', from: 1.25, to: 3.05, fade: 0.12 }); pl.at(t / 1.4); }
      this.clipLegs = 1;
    } else if (p.phase === 'result' && wasDown) {
      // he gets up off the sand, then stands
      if (this.resT < 0.8) pl.at(1);
      else { pl.play('stand_up', { mode: 'once', rate: 2.4, from: 0, fade: 0.35 }); }
      this.clipLegs = 1;
    } else if (p.won || (p.phase === 'result' && !wasDown && this.wonT > 0)) {
      this.wonT += dt;
      const th = this.lastThrow ? THROW_CLIP[this.lastThrow] : null;
      if (th && this.wonT < 1.1 && p.phase === 'fall') { pl.play(th.clip, { mode: 'driven', from: th.to, to: th.end, fade: 0.1 }); pl.at(this.wonT / 1.1); }
      else pl.play('victory', { mode: 'pingpong', from: 0.35, to: 2.3, fade: 0.3 });
      this.clipLegs = 1;
    } else if (p.throwing) {
      const th = THROW_CLIP[p.throwing.id];
      pl.play(th.clip, { mode: 'driven', from: th.from, to: th.to, fade: 0.12 }); pl.at(p.throwing.k);
    } else if (p.stagger > 0) {
      pl.play('stagger', { mode: 'loop', rate: 1.3, fade: 0.2 }); skip = ARMS; this.clipLegs = 1;
    } else if (p.phase === 'clinch') {
      // driving him (my weight on him, or my move a push) or holding him off (weight back, the sprawl)
      if (p.thrown || p.weight.f < -0.3) pl.play('resist_sprawl', { mode: 'pingpong', from: 0.5, to: 2.8, fade: 0.25 });
      else if (p.weight.f > 0.3 || p.move?.kind === 'push') pl.play('push_drive', { mode: 'pingpong', from: 0.35, to: 2.4, fade: 0.25 });
      else pl.play('stance', { mode: 'pingpong', from: 0.05, to: 0.85, rate: 0.7, fade: 0.25 });
    } else {
      // the stance, or the fight walks at his own speed (forward or back: his facing against his motion)
      const fx = Math.sin(g.rotation.y), fz = Math.cos(g.rotation.y), along = this.vx * fx + this.vz * fz, sp = Math.hypot(this.vx, this.vz);
      if (sp > 0.3 && (p.phase === 'fight' || p.phase === 'intro')) {
        const id: ClipId = along >= -0.1 ? 'walk_fwd' : 'walk_back', c = combatClips()!.get(id)!;
        pl.play(id, { mode: 'loop', fade: 0.2 }); pl.rate(clamp(sp / (c.speed || 0.9), 0.6, 1.7)); this.clipLegs = 1;
      } else if (p.phase === 'fight' && (p.apart ?? 0) > 1.9) {
        // apart: standing tall, the fight walk's upright guard swaying a little in place
        pl.play('walk_fwd', { mode: 'pingpong', from: 0.1, to: 0.35, rate: 0.35, fade: 0.35 }); this.clipLegs = 0;
      } else pl.play('stance', { mode: 'pingpong', from: 0.05, to: 0.85, rate: 0.6, fade: 0.25 });
    }
    pl.tick(dt);
    this.clip = pl.id; this.clipT = pl.time;
    this.player.apply(this.b, this.wClip, CLIP_REST_HIPS, this.restHips, skip);
    // the clip's own drop of the hips (the IK keeps it: the stance's crouch, the drive's, the throw's squat)
    this.clipDrop = (this.b.hips.position.z - this.restHips.z) * this.wClip;   // (root space: z up)
    this.b.hips.updateMatrixWorld(true);
  }

  /** The crouched stance: the hips low over the lean, the feet planted where they stand, stepping when the body has moved off them. */
  private legs(p: PoseIn, throwK: number) {
    const g = this.w.group, gs = this.g, sc = g.scale.x || 1, c = p.crouch;
    const brace = Math.max(0, -p.weight.f) * 0.4 + Math.max(0, p.weight.f) * 0.25;
    const deep = Math.hypot(p.lean.f, p.lean.s);
    // the hips: low in the stance, lower when braced or off balance, over the lean (the weight seen in the hips)
    // with a clip underneath, its own crouch sets the hips' height (the rules' brace and lean still lower them)
    let py = this.wClip > 0 ? RIG.hipY + this.clipDrop * 0.9 - (0.12 * (1 - this.wClip) + 0.05 * brace) * c - 0.07 * deep : RIG.hipY - (0.12 + 0.05 * brace) * c - 0.07 * deep;
    if (p.throwing?.id === 'souleve') py -= 0.16 * smooth(throwK / 0.7) - 0.2 * smooth((throwK - 0.7) / 0.3);
    if (p.throwing?.id === 'jambe' || (p.hold === 'jambe' && p.phase === 'clinch')) py -= 0.12;
    else if (p.hold === 'ceinture' && p.phase === 'clinch') py -= 0.06;
    if (p.reach && p.reach.kind !== 'nuque') py -= 0.14 * smooth(p.reach.k);
    // the balance hit hard (its depth jumps): the knees buckle, then spring back; a stumble step the way it went
    const depth = Math.hypot(p.lean.f, p.lean.s), jump = depth - this.depthWas; this.depthWas = depth;
    if (jump > 0.04 && p.dt > 0) { this.bv -= jump * 2.2; if (jump > 0.06) this.stumble(p, depth); }
    // springs (sub-stepped: stable at any frame time): hips stiff (they lead), the buckle under-damped (it recovers with a bounce)
    for (let t = p.dt; t > 1e-6; t -= 0.02) {
      const h = Math.min(0.02, t);
      { const o = spring(this.hx, this.hvx, 0.08 * p.lean.s + 0.03 * p.weight.s, 16, 0.6, h); this.hx = o.x; this.hvx = o.v; }
      { const o = spring(this.hz, this.hvz, -0.01 + 0.1 * p.lean.f + 0.06 * p.weight.f, 16, 0.6, h); this.hz = o.x; this.hvz = o.v; }
      { const o = spring(this.buckle, this.bv, 0, 9, 0.32, h); this.buckle = o.x; this.bv = o.v; }
    }
    gs.py = py + Math.max(-0.16, Math.min(0.04, this.buckle));
    gs.px = this.hx;
    gs.pz = this.hz;
    gs.pyaw = 0.12; gs.proll = -0.18 * p.lean.s;
    this.drop = (RIG.hipY - py) * sc;
    // the stance's spots under the hips (character space): left foot ahead, right foot back and turned out, wider when braced
    const wide = 0.2 + 0.04 * c + 0.03 * brace, ahead = 0.13 + 0.05 * brace + 0.04 * Math.max(0, p.weight.f), back = -0.15 - 0.05 * brace - 0.05 * Math.max(0, -p.weight.f);
    const spot: [number, number, number][] = [[wide, ahead, 0], [-wide, back, -0.45]];
    // the croc: the front foot steps behind his; the sweep: the foot swings across
    if (p.throwing?.id === 'croc' || p.throwing?.id === 'balayage') { const k = smooth(throwK / 0.7); spot[0] = [wide - (p.throwing.id === 'balayage' ? 0.35 * k : 0.05 * k), ahead + 0.45 * k, 0]; }
    g.updateMatrixWorld(true);
    const lead = 0.12;
    for (let i = 0; i < 2; i++) {
      const f = this.feet[i];
      V4.set(spot[i][0], 0, spot[i][1]).applyMatrix4(this.space.matrixWorld);  // the spot in the world
      const wx = V4.x + this.vx * lead, wz = V4.z + this.vz * lead, wyaw = g.rotation.y + spot[i][2];
      if (!this.placed) { f.x = wx; f.z = wz; f.yaw = wyaw; }
      const err = Math.hypot(f.x - wx, f.z - wz), yawErr = Math.abs(Math.atan2(Math.sin(f.yaw - wyaw), Math.cos(f.yaw - wyaw)));
      if (err > 0.65 * sc) { f.x = wx; f.z = wz; f.yaw = wyaw; f.swing = null; }   // too far (a separation, a restart): it is put down there
      (f as Planted & { err: number }).err = err + 0.2 * yawErr;
      if (f.swing) { f.swing.tx = wx; f.swing.tz = wz; f.swing.tyaw = wyaw; }
    }
    this.placed = true;
    // one foot steps at a time: the one farthest from its spot, once it is more than a short step away
    if (!this.feet[0].swing && !this.feet[1].swing) {
      const e0 = (this.feet[0] as Planted & { err: number }).err, e1 = (this.feet[1] as Planted & { err: number }).err;
      const i = e0 >= e1 ? 0 : 1, f = this.feet[i], e = Math.max(e0, e1);
      if (e > 0.13 * sc) {
        V4.set(spot[i][0], 0, spot[i][1]).applyMatrix4(this.space.matrixWorld);
        f.swing = { fx: f.x, fz: f.z, fyaw: f.yaw, tx: V4.x + this.vx * lead, tz: V4.z + this.vz * lead, tyaw: g.rotation.y + spot[i][2], s: 0, dur: 0.17 + 0.08 * clamp(e / 0.4, 0, 1) };
      }
    }
    for (let i = 0; i < 2; i++) {
      const f = this.feet[i], foot = gs.feet[i];
      let x = f.x, z = f.z, yaw = f.yaw, lift = 0;
      if (f.swing) {
        const s = f.swing; s.s += p.dt / s.dur;
        const u = smooth(s.s);
        x = s.fx + (s.tx - s.fx) * u; z = s.fz + (s.tz - s.fz) * u; yaw = s.fyaw + Math.atan2(Math.sin(s.tyaw - s.fyaw), Math.cos(s.tyaw - s.fyaw)) * u;
        lift = 0.07 * Math.sin(Math.PI * clamp(s.s, 0, 1));
        if (s.s >= 1) { f.x = s.tx; f.z = s.tz; f.yaw = s.tyaw; f.swing = null; this.steps++; }
      }
      // the ankle in character space
      V5.set(x, g.position.y, z);
      this.space.worldToLocal(V5);
      foot.ax = V5.x; foot.az = V5.z; foot.ay = RIG.ankle.y + lift / sc;
      foot.yaw = Math.atan2(Math.sin(yaw - g.rotation.y), Math.cos(yaw - g.rotation.y));
      foot.pitch = 0; foot.clear = lift > 0 ? lift / sc : 0; foot.shinW = 0; foot.alpha = 0;
    }
    // the IK sets the pelvis upright: the clip's trunk (its lean over the hips) is kept in the world through it
    if (this.wClip > 0) this.b.spine.getWorldQuaternion(Q3);
    this.gaitRig!.apply(gs, this.wLegs);
    if (this.wClip > 0) { this.b.hips.getWorldQuaternion(Q1); Q2.copy(Q1).invert().multiply(Q3); this.b.spine.quaternion.slerp(Q2, this.wClip * this.wLegs); this.b.spine.updateMatrixWorld(true); }
    // checks: the knee's bend (the angle between thigh and shin)
    const th = this.b.thighL.getWorldPosition(V1), sh = this.b.shinL.getWorldPosition(V2), ft = this.b.footL.getWorldPosition(V3);
    this.kneeBend = Math.PI - V4.subVectors(th, sh).angleTo(V5.subVectors(ft, sh));
    // a planted foot that the legs could not reach slides: measured, for the checks (it should not)
    const ankle = this.b.footL.getWorldPosition(V1);
    if (!this.feet[0].swing) this.slid = Math.max(this.slid * 0.98, Math.hypot(ankle.x - this.feet[0].x, ankle.z - this.feet[0].z) - 0.12 * sc);
  }

  /** A stumble: the foot on the side the balance went steps out that way at once (short and quick), to catch the body. */
  private stumble(p: PoseIn, depth: number) {
    if (!this.placed || this.feet[0].swing || this.feet[1].swing) return;
    const g = this.w.group, i = p.lean.s >= 0 ? 0 : 1, f = this.feet[i];
    const u = 0.22 + 0.25 * Math.min(1, depth), lf = p.lean.f / (depth || 1), ls = p.lean.s / (depth || 1);
    // his own frame to the world: forward is the group's facing, his left its +x
    const c = Math.cos(g.rotation.y), sn = Math.sin(g.rotation.y);
    const wx = f.x + (lf * sn + ls * c) * u, wz = f.z + (lf * c - ls * sn) * u;
    f.swing = { fx: f.x, fz: f.z, fyaw: f.yaw, tx: wx, tz: wz, tyaw: f.yaw, s: 0, dur: 0.14 };
    this.stumbles++;
  }

  /** The trunk over the weight: arched back when pushed, folded forward when pulled or diving, turned with a pivot; the move and the throw set up on top. */
  private trunkPose(p: PoseIn) {
    const lf = p.lean.f, ls = p.lean.s, c = p.crouch;
    // a deep hold folds the trunk over him (the belt: heads over shoulders; the leg: head down)
    const holdFold = p.phase === 'clinch' ? (p.hold === 'jambe' ? 0.7 : p.hold === 'ceinture' ? 0.75 : p.hold === 'bras' ? 0.25 : 0) : 0;
    const fold = 0.28 * c + 0.9 * lf + 0.35 * p.weight.f + holdFold + (p.reach && p.reach.kind !== 'nuque' ? 0.6 * smooth(p.reach.k) : 0);
    const side = 0.9 * ls + 0.25 * p.weight.s;
    // the trunk follows the hips with lag and overshoot (an under-damped spring): a push snaps the chest back past its lean, then settles
    for (let t = p.dt; t > 1e-6; t -= 0.02) {
      const h = Math.min(0.02, t);
      { const o = spring(this.tf, this.tvf, fold, 10, 0.38, h); this.tf = o.x; this.tvf = o.v; }
      { const o = spring(this.ts, this.tvs, side, 10, 0.38, h); this.ts = o.x; this.tvs = o.v; }
    }
    const f2 = this.tf, s2 = this.ts, wc = this.wClip, wa = 1 - wc;
    // procedural alone: the trunk aimed; on a clip: the clip's trunk turned by the weight (the crouch's own fold taken off)
    this.aimChar({ spine: [s2 * 0.6, 1, f2 * 0.7], chest: [s2, 1, f2], head: [s2 * 0.3, 1, Math.min(0.4, f2 * 0.3)] }, wa * 0.85 * Math.max(this.wLegs, this.wHands));
    if (wc > 0) { const pf = (f2 - 0.28 * c) * 0.45 * wc, ps = s2 * 0.45 * wc; this.tilt(this.b.spine, pf, ps); this.tilt(this.b.chest, pf, ps); }
    if (p.move) this.aimChar(AIMS[p.move.kind], (0.7 - 0.4 * wc) * p.move.k);
    if (p.throwing && wc < 1) {
      const k = p.throwing.k, id = p.throwing.id;
      if (id === 'hanche' || id === 'ramene') this.aimChar(AIMS.pull, 0.8 * k * wa);
      else if (id === 'croc' || id === 'jambe') this.aimChar(AIMS.push, 0.8 * k * wa);
      else if (id === 'balayage') this.aimChar(AIMS.pivot, 0.8 * k * wa);
      else this.aimChar({ spine: [0, 1, k < 0.7 ? 0.35 : -0.35], chest: [0, 1, k < 0.7 ? 0.3 : -0.45] }, 0.9 * wa);
    }
    if (p.thrown) this.aimChar(AIMS.slip, 0.6 * p.thrown.k * (1 - 0.5 * wc));
    // the trunk's lean as drawn (own frame), for the checks
    const chest = this.b.chest; chest.getWorldQuaternion(Q1); V1.copy(Y).applyQuaternion(Q1);
    this.w.group.getWorldQuaternion(Q2); V1.applyQuaternion(Q2.invert());
    this.trunk = { f: Math.atan2(V1.z, V1.y), s: Math.atan2(V1.x, V1.y) };
  }

  /** Both hands on the hold, by two-bone IK onto the other man's bones (reaching there while the reach is under way). */
  private hands(p: PoseIn) {
    const o = p.other!, ol = p.otherLook, kind = p.reach?.kind ?? p.hold!;
    const k = this.wHands * (p.reach ? smooth(p.reach.k) : 1);
    const pt = (n: Bone, out: THREE.Vector3) => (ol ? ol.point(n, out) : out.copy(o.group.position).setY(o.group.position.y + 1.2));
    o.group.getWorldQuaternion(Q1);
    const hisLeft = V5.set(1, 0, 0).applyQuaternion(Q1).setY(0).normalize(), hisBack = P.set(0, 0, -1).applyQuaternion(Q1).setY(0).normalize();
    let gap = 0;
    for (let i = 0; i < 2; i++) {
      const [ua, fa, ha] = ARM[i], mySide = i === 0 ? 1 : -1;   // my left hand goes to his right side (we face each other)
      if (kind === 'nuque') { pt('neck', T); T.addScaledVector(hisLeft, -mySide * 0.07).addScaledVector(hisBack, 0.07); T.y -= 0.02; }
      else if (kind === 'bras') { if (i === 0) { pt('upper_armR', T); pt('forearmR', E); T.lerp(E, 0.35); } else { pt('neck', T); T.addScaledVector(hisLeft, 0.1).addScaledVector(hisBack, 0.05); } }
      else if (kind === 'ceinture') { pt('hips', T); T.addScaledVector(hisLeft, -mySide * 0.16).addScaledVector(hisBack, 0.02); T.y += 0.06; }   // the ngemb at his sides
      else { pt(i === 0 ? 'thighR' : 'thighR', T); pt('shinR', E); T.lerp(E, i === 0 ? 0.25 : 0.55); T.addScaledVector(hisBack, 0.05); }
      // the shoulder, the arm's own lengths, the elbow out and down
      const sh = this.b[ua].getWorldPosition(S), el = this.b[fa].getWorldPosition(V1), hd = this.b[ha].getWorldPosition(V2);
      const a = sh.distanceTo(el), b = el.distanceTo(hd);
      V3.subVectors(T, sh); let d = V3.length();
      if (d > (a + b) * 0.995) { V3.multiplyScalar((a + b) * 0.995 / d); d = (a + b) * 0.995; }
      const target = V4.copy(sh).add(V3);
      const ca = clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1), sa = Math.sqrt(1 - ca * ca);
      const u = V3.normalize();
      // the pole: out to his own side and down
      this.w.group.getWorldQuaternion(Q2);
      const pole = E.set(mySide * 0.8, -1, -0.2).applyQuaternion(Q2);
      pole.addScaledVector(u, -pole.dot(u)).normalize();
      const elbow = V1.copy(sh).addScaledVector(u, a * ca).addScaledVector(pole, a * sa);
      this.aimWorld(this.b[ua], V2.subVectors(elbow, sh), k);
      this.b[fa].getWorldPosition(V1);
      this.aimWorld(this.b[fa], V2.subVectors(target, V1), k);
      gap = Math.max(gap, this.b[ha].getWorldPosition(V1).distanceTo(T));
    }
    this.handGap = gap;
  }

  /** The fall, by the throw that caused it: the clip (on the back, or the four supports) turned and carried the throw's way. */
  private fallPose(p: PoseIn) {
    const g = this.w.group, f = p.fall!, t = f.t, id = f.throw;
    this.wLegs = 0; this.wHands = 0; this.handGap = -1;
    const k = smooth(t / 0.45);
    let turn = 0, lift = 0, pitch = 0;
    if (this.wClip > 0.5) {
      // the clip falls (lifted, turned over, on the back or onto the hands): only the way he goes — away from the thrower,
      // or past him to a side for a fall forward
      if (f.kind === 'appuis' || id === 'ramene') turn = Math.PI / 2;
      this.fallYaw = turn * k; g.rotation.y += this.fallYaw; g.updateMatrixWorld(true);
      return;
    }
    if (id === 'hanche') { turn = Math.PI; lift = 0.45 * Math.sin(Math.PI * clamp(t / 0.6, 0, 1)); }
    else if (id === 'souleve') { turn = Math.PI; lift = 0.8 * Math.sin(Math.PI * clamp(t / 0.75, 0, 1)); }
    else if (id === 'balayage') { turn = Math.PI / 2; lift = 0.15 * Math.sin(Math.PI * clamp(t / 0.4, 0, 1)); }
    else if (id === 'jambe') lift = 0.08 * Math.sin(Math.PI * clamp(t / 0.3, 0, 1));
    if (f.kind === 'appuis') { pitch = 1.0 * k; lift -= 0.12 * k; }        // over onto his hands: the body pitched forward, lower
    this.fallYaw = turn * k;
    g.rotation.y += this.fallYaw;
    g.position.y += lift;
    g.rotation.x = pitch;                                                  // (order YXZ: a pitch about his own side, forward)
    g.updateMatrixWorld(true);
    if (f.kind === 'appuis') {
      // the four supports: both arms straight down to the sand, a little ahead of the shoulders
      const fx = Math.sin(g.rotation.y), fz = Math.cos(g.rotation.y);
      for (const [ua, fa] of [['upper_armL', 'forearmL'], ['upper_armR', 'forearmR']] as const) {
        this.aimWorld(this.b[ua], V3.set(fx * 0.25, -1, fz * 0.25), k);
        this.aimWorld(this.b[fa], V3.set(fx * 0.1, -1, fz * 0.1), k);
      }
    }
  }

  dispose() {
    if (this.sprite) { (this.sprite.material as THREE.SpriteMaterial).map?.dispose(); (this.sprite.material as THREE.SpriteMaterial).dispose(); this.sprite.removeFromParent(); this.sprite = null; }
  }
}

/**
 * Sand thrown up at an impact (a body landing, a hard exchange): a small pool of points, one draw call while any grain is
 * in the air, none otherwise. Its own little random stream (presentation only: never the bout's seeded `rand`).
 */
export class SandDust {
  readonly points: THREE.Points;
  private pos: Float32Array; private vel: Float32Array; private life: Float32Array;
  private seed = 7; private alive = 0;
  constructor(private n = 48) {
    this.pos = new Float32Array(n * 3); this.vel = new Float32Array(n * 3); this.life = new Float32Array(n);
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xcaa874, size: 0.16, transparent: true, opacity: 0.8, depthWrite: false }));
    this.points.frustumCulled = false; this.points.visible = false; this.points.renderOrder = 5;
    for (let i = 0; i < n; i++) this.pos[i * 3 + 1] = -100;
  }
  private r() { this.seed = (this.seed * 16807) % 2147483647; return this.seed / 2147483647; }
  /** A burst at (x, y, z), `force` 0…1 (how many grains, how far they fly). */
  burst(x: number, y: number, z: number, force: number) {
    let k = Math.round(10 + 30 * force);
    for (let i = 0; i < this.n && k > 0; i++) {
      if (this.life[i] > 0) continue;
      const a = this.r() * Math.PI * 2, sp = (0.5 + 1.6 * this.r()) * (0.5 + force);
      this.pos[i * 3] = x + Math.cos(a) * 0.25; this.pos[i * 3 + 1] = y + 0.05; this.pos[i * 3 + 2] = z + Math.sin(a) * 0.25;
      this.vel[i * 3] = Math.cos(a) * sp; this.vel[i * 3 + 1] = 0.6 + 1.2 * this.r() * (0.5 + force); this.vel[i * 3 + 2] = Math.sin(a) * sp;
      this.life[i] = 0.45 + 0.45 * this.r(); k--; this.alive++;
    }
    this.points.visible = true;
  }
  tick(dt: number, floor: number) {
    if (!this.points.visible) return;
    let alive = 0;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -100; continue; }
      alive++;
      this.vel[i * 3 + 1] -= 6 * dt;
      const d = Math.exp(-2.5 * dt); this.vel[i * 3] *= d; this.vel[i * 3 + 2] *= d;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] = Math.max(floor + 0.02, this.pos[i * 3 + 1] + this.vel[i * 3 + 1] * dt); this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
    }
    this.alive = alive;
    (this.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    if (!alive) this.points.visible = false;
  }
  /** Checks: grains in the air. */
  get grains() { return this.alive; }
  dispose() { this.points.geometry.dispose(); (this.points.material as THREE.Material).dispose(); this.points.removeFromParent(); }
}
