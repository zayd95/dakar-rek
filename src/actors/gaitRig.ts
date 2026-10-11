import * as THREE from 'three';
import { RIG, solveKnee, type Foot, type GaitState } from './gait';

/**
 * Puts a GaitState (src/actors/gait.ts) on the shared humanoid's bones, after the mixer has posed them (clips stay the
 * base: what is not driven here, and the cross-fades with held poses). Legs by two-bone IK onto the feet's targets, the
 * pelvis from its height, turn and tilt, the trunk, the head and the arms by small rotations from the rest pose.
 * `w` blends the whole gait in and out (a held pose takes over), `up` the trunk and arms (0 standing: the Idle clip).
 * Allocation-free per frame.
 */
const NAMES = ['root', 'hips', 'spine', 'chest', 'neck', 'head', 'shoulderL', 'upper_armL', 'forearmL', 'handL', 'shoulderR', 'upper_armR', 'forearmR', 'handR', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'] as const;
type BoneName = (typeof NAMES)[number];

const QH = new THREE.Quaternion(), QP = new THREE.Quaternion(), QW = new THREE.Quaternion(), QA = new THREE.Quaternion(), QL = new THREE.Quaternion();
const QC = new THREE.Quaternion(), QS = new THREE.Quaternion(), QU = new THREE.Quaternion(), QR = new THREE.Quaternion(), QI = new THREE.Quaternion();
const V1 = new THREE.Vector3(), V2 = new THREE.Vector3(), HIP = new THREE.Vector3(), PEL = new THREE.Vector3(), LAT = new THREE.Vector3();
const DIR1 = new THREE.Vector3(), DIR2 = new THREE.Vector3(), SOLE = new THREE.Vector3(), UPV = new THREE.Vector3(), SIDE = new THREE.Vector3();
const Y = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0), ZERO = new THREE.Vector3();
const E = new THREE.Euler(0, 0, 0, 'YXZ');
const ANK = { x: 0, y: 0, z: 0 }, KNEE = { x: 0, y: 0, z: 0 };
const TILT_C = Math.cos(RIG.footTilt), TILT_S = Math.sin(RIG.footTilt);

export class GaitRig {
  private constructor(private b: Record<BoneName, THREE.Object3D>, private rest: Record<BoneName, THREE.Quaternion>, private rootPos: THREE.Vector3) {}

  /** The rig's bones under `root` (a clone of the humanoid, in its rest pose), or null when one is missing. */
  static from(root: THREE.Object3D): GaitRig | null {
    const b = {} as Record<BoneName, THREE.Object3D>, rest = {} as Record<BoneName, THREE.Quaternion>;
    for (const n of NAMES) { const o = root.getObjectByName(n); if (!o) return null; b[n] = o; rest[n] = o.quaternion.clone(); }
    return new GaitRig(b, rest, b.root.position.clone());
  }

  /** Bone `name` turned (minimal rotation from its rest pose under its current parent) to point its +Y along `dir`; returns its world rotation. */
  private aim(name: BoneName, parent: THREE.Quaternion, dir: THREE.Vector3, w: number, out: THREE.Quaternion) {
    QW.copy(parent).multiply(this.rest[name]);
    V1.copy(Y).applyQuaternion(QW);
    QA.setFromUnitVectors(V1, dir);
    QW.premultiply(QA);
    QI.copy(parent).invert();
    QL.copy(QI).multiply(QW);
    const bone = this.b[name];
    bone.quaternion.slerp(QL, w);
    return out.copy(parent).multiply(bone.quaternion);
  }
  /** Bone `name` at its rest rotation turned by `angle` about the world axis `axis` (given in the character's space), blended by `w`. */
  private turn(name: BoneName, parent: THREE.Quaternion, axis: THREE.Vector3, angle: number, w: number, out: THREE.Quaternion) {
    QI.copy(parent).invert();
    V2.copy(axis).applyQuaternion(QI).normalize();
    QL.setFromAxisAngle(V2, angle).multiply(this.rest[name]);
    const bone = this.b[name];
    bone.quaternion.slerp(QL, w);
    return out.copy(parent).multiply(bone.quaternion);
  }

  apply(g: GaitState, w: number) {
    if (w <= 0) return;
    const b = this.b, up = w * g.m;
    // pelvis: its centre in the character's space (root-local: the root bone turns the rig upright), turn and tilt
    b.root.position.lerp(this.rootPos, w);
    QR.copy(b.root.quaternion);
    PEL.set(g.px, g.py, g.pz).sub(b.root.position).applyQuaternion(QI.copy(QR).invert());
    b.hips.position.lerp(PEL, w);
    E.set(0, g.pyaw, g.proll); QP.setFromEuler(E);
    QL.copy(this.rest.hips).multiply(QP);
    b.hips.quaternion.slerp(QL, w);
    QH.copy(QR).multiply(b.hips.quaternion);                                        // the pelvis as posed (character space)
    PEL.copy(b.hips.position).applyQuaternion(QR).add(b.root.position);
    // legs
    this.leg(g.feet[0], 'thighL', 'shinL', 'footL', w);
    this.leg(g.feet[1], 'thighR', 'shinR', 'footR', w);
    if (up <= 0) return;
    // trunk: leans with the speed, turns against the pelvis, stays level across; the head looks ahead
    const twist = g.twist - g.pyaw;
    E.set(g.lean * 0.6, twist * 0.5, -g.proll * 0.5); QL.setFromEuler(E).premultiply(this.rest.spine);
    b.spine.quaternion.slerp(QL, up);
    E.set(g.lean * 0.6, twist * 0.5, -g.proll * 0.5); QL.setFromEuler(E).premultiply(this.rest.chest);
    b.chest.quaternion.slerp(QL, up);
    E.set(-g.lean * 0.45, -g.twist * 0.5, 0); QL.setFromEuler(E).premultiply(this.rest.neck);
    b.neck.quaternion.slerp(QL, up);
    E.set(-g.lean * 0.45, -g.twist * 0.5, 0); QL.setFromEuler(E).premultiply(this.rest.head);
    b.head.quaternion.slerp(QL, up);
    QC.copy(QH).multiply(b.spine.quaternion).multiply(b.chest.quaternion);
    LAT.copy(X).applyQuaternion(QC);                                                 // the chest's left-right axis
    this.arm('shoulderL', 'upper_armL', 'forearmL', 'handL', g.armL, g.elbowL, up);
    this.arm('shoulderR', 'upper_armR', 'forearmR', 'handR', g.armR, g.elbowR, up);
  }

  private leg(f: Foot, thigh: BoneName, shin: BoneName, foot: BoneName, w: number) {
    HIP.copy(this.b[thigh].position).applyQuaternion(QH).add(PEL);
    ANK.x = f.ax; ANK.y = f.ay; ANK.z = f.az;
    const fx = Math.sin(f.yaw), fz = Math.cos(f.yaw);
    solveKnee(HIP.x, HIP.y, HIP.z, ANK, fx, fz, KNEE);
    DIR1.set(KNEE.x - HIP.x, KNEE.y - HIP.y, KNEE.z - HIP.z).normalize();
    DIR2.set(ANK.x - KNEE.x, ANK.y - KNEE.y, ANK.z - KNEE.z).normalize();
    this.aim(thigh, QH, DIR1, w, QS);
    this.aim(shin, QS, DIR2, w, QU);
    // the sole: over the ground at the foot's pitch, or (swinging) held at an angle against the shin
    const cp = Math.cos(f.pitch);
    SOLE.set(fx * cp, Math.sin(f.pitch), fz * cp);
    if (f.shinW > 0) {
      const d = fx * DIR2.x + fz * DIR2.z;
      V1.set(fx - d * DIR2.x, -d * DIR2.y, fz - d * DIR2.z).normalize();
      V1.multiplyScalar(Math.cos(f.alpha)).addScaledVector(DIR2, Math.sin(f.alpha));
      SOLE.lerp(V1, f.shinW).normalize();
    }
    // the foot bone points a little below the sole's line
    SIDE.set(fz, 0, -fx);
    UPV.crossVectors(SOLE, SIDE).normalize();
    if (UPV.equals(ZERO)) UPV.copy(Y);
    V2.copy(SOLE).multiplyScalar(TILT_C).addScaledVector(UPV, TILT_S).normalize();
    this.aim(foot, QU, V2, w, QW);
  }

  private arm(shoulder: BoneName, upper: BoneName, fore: BoneName, hand: BoneName, swing: number, elbow: number, w: number) {
    const b = this.b;
    b[shoulder].quaternion.slerp(this.rest[shoulder], w);
    QS.copy(QC).multiply(b[shoulder].quaternion);
    this.turn(upper, QS, LAT, -swing, w, QU);
    this.turn(fore, QU, LAT, -elbow, w, QW);
    b[hand].quaternion.slerp(this.rest[hand], w);
  }
}
