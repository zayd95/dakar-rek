import * as THREE from 'three';
import type { Humanoid } from '../actors/humanoid';
import { STRIKES, windupOf, type StandState } from './stand';

/**
 * Làmb 2.0 upper-body overlay: guard, quick strike, big strike (cocked then thrown), recoil and stagger, layered on top
 * of the wrestler's animated stance. After the mixer has posed the skeleton, each listed bone is turned so it points
 * along an aim direction (character space: +z forward, +x the wrestler's left, +y up), blended by a weight; the legs
 * keep the stance clip. Movement placeholders of our own (not a reproduction of any real technique).
 */
type Aim = Partial<Record<Bone, [number, number, number]>>;
type Bone = 'spine' | 'chest' | 'neck' | 'head' | 'upper_armL' | 'forearmL' | 'handL' | 'upper_armR' | 'forearmR' | 'handR';
const ORDER: Bone[] = ['spine', 'chest', 'neck', 'head', 'upper_armL', 'forearmL', 'handL', 'upper_armR', 'forearmR', 'handR'];

const GUARD_L: Aim = { upper_armL: [0.45, -0.55, 0.7], forearmL: [-0.28, 0.88, 0.38], handL: [-0.12, 1, 0.15] };
const GUARD_R: Aim = { upper_armR: [-0.45, -0.55, 0.7], forearmR: [0.28, 0.88, 0.38], handR: [0.12, 1, 0.15] };
export const AIMS = {
  guard: { spine: [0, 1, 0.18], ...GUARD_L, ...GUARD_R } as Aim,
  /** Quick strike: the left arm straight out at the opponent's face, the right one guarding. */
  quick: { chest: [-0.08, 1, 0.12], upper_armL: [0.08, 0.06, 1], forearmL: [0.02, 0.08, 1], handL: [0, 0.05, 1], ...GUARD_R } as Aim,
  /** Big strike, cocked: the right arm drawn back and high, the weight on the back foot. */
  cock: { spine: [0, 1, -0.12], chest: [0.1, 1, -0.18], upper_armR: [-0.72, 0.3, -0.62], forearmR: [-0.12, 0.96, 0.22], handR: [0, 1, 0.12], upper_armL: [0.4, -0.35, 0.85], forearmL: [-0.08, 0.45, 0.89] } as Aim,
  /** Big strike, thrown: the right arm swung through, the body leaning in. */
  big: { spine: [0, 1, 0.32], chest: [-0.12, 1, 0.45], upper_armR: [0.22, 0.2, 1], forearmR: [0.18, -0.08, 1], handR: [0.1, -0.15, 1], upper_armL: [0.45, -0.75, 0.3], forearmL: [0.2, -0.3, 0.9] } as Aim,
  /** Taking a clean hit: head and chest thrown back. */
  recoil: { spine: [0, 1, -0.28], chest: [0, 1, -0.42], neck: [0, 1, -0.35], head: [0, 1, -0.3] } as Aim,
  /** Staggering: off balance, leaning back and sideways, arms out. */
  stagger: { spine: [0.18, 1, -0.38], chest: [0.24, 1, -0.5], head: [0.2, 1, -0.2], upper_armL: [0.85, -0.45, -0.1], forearmL: [0.7, 0.2, 0.3], upper_armR: [-0.85, -0.3, 0.1], forearmR: [-0.6, 0.4, 0.4] } as Aim,
} as const;

const Y = new THREE.Vector3(0, 1, 0);
const q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion(), q3 = new THREE.Quaternion(), qc = new THREE.Quaternion();
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3();

export class StrikeRig {
  private bones = new Map<Bone, THREE.Object3D>();
  private root: THREE.Object3D;
  /** Smoothed guard weight. */
  private guardW = 0;

  constructor(h: Humanoid) {
    this.root = h.group.children.find(c => c.name === 'Scene') ?? h.group.children[0] ?? h.group;
    for (const b of ORDER) { const o = this.root.getObjectByName(b); if (o) this.bones.set(b, o); }
  }

  /** Turns the listed bones toward their aims, blended by `w` (0–1). Call after the mixer update. */
  apply(aim: Aim, w: number) {
    if (w <= 0.001 || !this.bones.size) return;
    w = Math.min(1, w);
    this.root.updateWorldMatrix(true, true);
    this.root.getWorldQuaternion(qc);
    for (const name of ORDER) {
      const a = aim[name], b = this.bones.get(name);
      if (!a || !b || !b.parent) continue;
      b.parent.getWorldQuaternion(q1);
      q2.copy(q1).multiply(b.quaternion);                                   // current world rotation
      v1.copy(Y).applyQuaternion(q2);                                       // where the bone points now
      v2.set(a[0], a[1], a[2]).normalize().applyQuaternion(qc);             // where it should point
      q3.setFromUnitVectors(v1, v2).multiply(q2);                           // target world rotation
      q3.premultiply(q1.invert());                                          // in the parent's space
      b.quaternion.slerp(q3, w);
      b.updateMatrixWorld(true);
    }
  }

  /** The overlay for a wrestler's stand-up state this frame. */
  pose(s: StandState, dt: number) {
    this.guardW += ((s.guard ? 1 : 0) - this.guardW) * Math.min(1, dt * 14);
    if (s.stagger > 0) { this.apply(AIMS.stagger, Math.min(1, s.stagger * 4)); return; }
    if (this.guardW > 0.01) this.apply(AIMS.guard, this.guardW);
    const st = s.strike;
    if (st) {
      const wu = windupOf(st.kind, s), t = st.t;
      if (st.kind === 'quick') this.apply(AIMS.quick, t < wu ? (t / wu) ** 1.5 : 1);
      else {
        this.apply(AIMS.cock, Math.min(1, t / (wu * 0.75)));
        if (t > wu * 0.8) this.apply(AIMS.big, Math.min(1, (t - wu * 0.8) / (wu * 0.25)));
      }
    } else if (s.recover > 0 && this.last && s.hitAgo > 0.3) {
      // the arm comes back over the recovery
      const total = STRIKES[this.last].recover;
      this.apply(this.last === 'quick' ? AIMS.quick : AIMS.big, Math.min(1, s.recover / total));
    }
    if (st) this.last = st.kind;
    if (s.hitAgo < 0.3) this.apply(AIMS.recoil, 1 - s.hitAgo / 0.3);
  }
  private last: 'quick' | 'big' | null = null;
}
