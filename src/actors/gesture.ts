import * as THREE from 'three';
import type { Humanoid } from './humanoid';

/**
 * Procedural gestures on top of any clip: a two-bone reach that puts a wrist on a point in the world (the mouth,
 * a plate, a crate, a bar overhead), the elbow bending toward a pole; a torso bend, a nod, a crouch that keeps the
 * feet on the ground. Works from bone positions only, whatever the rig's bone axes. Called from Humanoid.overlay
 * after the clip pose, every frame (the Humanoid puts the clip pose back first, so nothing adds up).
 */
const S = new THREE.Vector3(), E = new THREE.Vector3(), W = new THREE.Vector3(), T = new THREE.Vector3(), P = new THREE.Vector3();
const U = new THREE.Vector3(), V = new THREE.Vector3(), E2 = new THREE.Vector3(), A = new THREE.Vector3(), B = new THREE.Vector3();
const Q = new THREE.Quaternion(), QP = new THREE.Quaternion(), QW = new THREE.Quaternion(), Q0 = new THREE.Quaternion();

/** Turns `bone` so that the world direction `from` becomes `to` (both from the bone's origin), blended by `w`. */
function aim(bone: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3, w: number) {
  Q.setFromUnitVectors(from.normalize(), to.normalize());
  bone.getWorldQuaternion(QW);
  bone.parent!.getWorldQuaternion(QP);
  Q0.copy(bone.quaternion);
  bone.quaternion.copy(QP.invert().multiply(Q).multiply(QW));
  if (w < 1) bone.quaternion.copy(Q0.slerp(bone.quaternion, w));
  bone.updateMatrixWorld(true);
}

/** Two-bone IK: `a`→`b`→`c` (shoulder, elbow, wrist or hip, knee, ankle) so that `c` lands on `target`, the middle joint toward `pole`. */
function limb(h: Humanoid, a: string, b: string, c: string, target: THREE.Vector3, pole: THREE.Vector3, w: number) {
  const upper = h.bone(a), fore = h.bone(b), end = h.bone(c);
  if (!upper || !fore || !end) return;
  h.group.updateMatrixWorld(true);
  upper.getWorldPosition(S); fore.getWorldPosition(E); end.getWorldPosition(W);
  const la = S.distanceTo(E), lb = E.distanceTo(W);
  T.copy(target).sub(S);
  const d = Math.min(Math.max(T.length(), Math.abs(la - lb) + 1e-3), la + lb - 1e-3);
  U.copy(T).normalize();
  V.copy(pole).addScaledVector(U, -pole.dot(U)); if (V.lengthSq() < 1e-6) V.set(0, -1, 0).addScaledVector(U, -U.y);
  V.normalize();
  const cosA = (la * la + d * d - lb * lb) / (2 * la * d), sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  E2.copy(S).addScaledVector(U, la * cosA).addScaledVector(V, la * sinA);     // where the middle joint goes
  aim(upper, A.copy(E).sub(S), B.copy(E2).sub(S), w);
  fore.getWorldPosition(E); end.getWorldPosition(W);
  P.copy(S).addScaledVector(U, d);                                             // the reachable target
  aim(fore, A.copy(W).sub(E), B.copy(P).sub(E), w);
}

/**
 * Puts the `side` wrist on `target` (world), the elbow toward `pole` (a world direction, e.g. down and out), with
 * weight `w` (0 = the clip's own pose, 1 = fully on target). Out-of-reach targets are approached along the line.
 */
export function reach(h: Humanoid, side: 'L' | 'R', target: THREE.Vector3, pole: THREE.Vector3, w = 1) {
  if (w > 0) limb(h, `upper_arm.${side}`, `forearm.${side}`, `hand.${side}`, target, pole, Math.min(1, w));
}

/** World position of a point given in the body's frame: forward, up (from the feet), right. */
export function bodyPoint(h: Humanoid, fwd: number, up: number, right: number, out = new THREE.Vector3()) {
  const y = h.group.rotation.y, g = h.group.position;
  return out.set(g.x + Math.sin(y) * fwd - Math.cos(y) * right, g.y + up, g.z + Math.cos(y) * fwd + Math.sin(y) * right);
}

/** The body's forward and right directions (horizontal). */
export function bodyAxes(h: Humanoid, fwd = new THREE.Vector3(), right = new THREE.Vector3()) {
  const y = h.group.rotation.y;
  fwd.set(Math.sin(y), 0, Math.cos(y)); right.set(-Math.cos(y), 0, Math.sin(y));
  return { fwd, right };
}

/** World position of the mouth (just in front of the head bone). */
export function mouth(h: Humanoid, out = new THREE.Vector3()) {
  const head = h.bone('head'); if (!head) return bodyPoint(h, 0.12, 1.62, 0, out);
  head.getWorldPosition(out);
  const y = h.group.rotation.y;
  return out.add(new THREE.Vector3(Math.sin(y) * 0.13, 0.02, Math.cos(y) * 0.13));
}

const AX = new THREE.Vector3();
/** Leans the torso forward by `angle` (radians) around the body's left-right axis (spine then chest), before any reach. */
export function bend(h: Humanoid, angle: number) {
  if (Math.abs(angle) < 1e-3) return;
  const y = h.group.rotation.y;
  AX.set(-Math.cos(y), 0, Math.sin(y));                                          // the body's right
  for (const [name, share] of [['spine', 0.6], ['chest', 0.4]] as const) {
    const b = h.bone(name); if (!b) continue;
    b.getWorldQuaternion(QW); b.parent!.getWorldQuaternion(QP);
    Q.setFromAxisAngle(AX, -angle * share);                                     // about the right axis, minus = forward
    b.quaternion.copy(QP.invert().multiply(Q).multiply(QW));
    b.updateMatrixWorld(true);
  }
}

/** Turns the head around the body's left-right axis (a nod: positive looks down). */
export function nod(h: Humanoid, angle: number) {
  const b = h.bone('head'); if (!b) return;
  const y = h.group.rotation.y;
  AX.set(-Math.cos(y), 0, Math.sin(y));
  b.getWorldQuaternion(QW); b.parent!.getWorldQuaternion(QP);
  Q.setFromAxisAngle(AX, -angle);
  b.quaternion.copy(QP.invert().multiply(Q).multiply(QW));
  b.updateMatrixWorld(true);
}

const F0 = new THREE.Vector3(), F1 = new THREE.Vector3(), FQ0 = new THREE.Quaternion(), FQ1 = new THREE.Quaternion(), HP = new THREE.Vector3();
/**
 * Lowers the hips by `depth` metres and bends the knees so the feet stay where they were (a squat to pick something
 * up from the ground, wash at a bucket…). Call it first: the torso and the arms then work from the lowered body.
 */
export function crouch(h: Humanoid, depth: number) {
  if (depth < 1e-3) return;
  const hips = h.bone('hips'), fl = h.bone('foot.L'), fr = h.bone('foot.R');
  if (!hips || !fl || !fr || !hips.parent) return;
  h.group.updateMatrixWorld(true);
  fl.getWorldPosition(F0); fr.getWorldPosition(F1); fl.getWorldQuaternion(FQ0); fr.getWorldQuaternion(FQ1);
  hips.getWorldPosition(HP); HP.y -= depth;
  hips.parent.worldToLocal(HP); hips.position.copy(HP); hips.updateMatrixWorld(true);
  const y = h.group.rotation.y;
  for (const [side, foot, at, q] of [['L', fl, F0, FQ0], ['R', fr, F1, FQ1]] as const) {
    const out = side === 'R' ? 0.3 : -0.3, knees = new THREE.Vector3(Math.sin(y) - Math.cos(y) * out, 0, Math.cos(y) + Math.sin(y) * out);   // forward, a little apart
    limb(h, `thigh.${side}`, `shin.${side}`, `foot.${side}`, at, knees, 1);
    foot.parent!.getWorldQuaternion(QP);                                         // the sole stays flat on the ground
    foot.quaternion.copy(QP.invert().multiply(q)); foot.updateMatrixWorld(true);
  }
}

/** World position just past the wrist, where a held object sits. */
export function grip(h: Humanoid, side: 'L' | 'R', out = new THREE.Vector3()) {
  const f = h.bone(`forearm.${side}`), w = h.bone(`hand.${side}`);
  if (!f || !w) return bodyPoint(h, 0.3, 1.0, side === 'R' ? 0.2 : -0.2, out);
  w.getWorldPosition(out); f.getWorldPosition(A);
  return out.addScaledVector(A.sub(out).normalize(), -0.08);
}

/** Direction of the forearm (elbow → wrist), e.g. to lay a tool along the hand. */
export function forearmDir(h: Humanoid, side: 'L' | 'R', out = new THREE.Vector3()) {
  const f = h.bone(`forearm.${side}`), w = h.bone(`hand.${side}`);
  if (!f || !w) return out.set(0, -1, 0);
  w.getWorldPosition(out); f.getWorldPosition(A);
  return out.sub(A).normalize();
}

/**
 * Puts the `side` ankle on `target` (world), the knee toward `pole` (a world direction: forward and up for a kick), with
 * weight `w` — a foot to the ball (src/game/football.ts). Call `crouch` first when the other leg should bend too.
 */
export function legTo(h: Humanoid, side: 'L' | 'R', target: THREE.Vector3, pole: THREE.Vector3, w = 1) {
  if (w > 0) limb(h, `thigh.${side}`, `shin.${side}`, `foot.${side}`, target, pole, Math.min(1, w));
}

/** The point of a foot that meets the ball, in the foot bone's frame: the middle of the instep (+y toward the toes, +z the sole). */
export const STRIKE = [0, 0.1, 0.05] as const;
/** World position of the foot's strike point (STRIKE). */
export function footStrike(h: Humanoid, side: 'L' | 'R', out = new THREE.Vector3()) {
  const f = h.bone(`foot.${side}`); if (!f) return bodyPoint(h, 0.3, 0.12, side === 'R' ? 0.12 : -0.12, out);
  f.updateMatrixWorld(true);
  return out.set(STRIKE[0], STRIKE[1], STRIKE[2]).applyMatrix4(f.matrixWorld);
}

/** Turns a foot so that it points (ankle → toes) along `dir` (world), blended by `w`: toes down for a strike, out for a side-foot pass. */
export function pointFoot(h: Humanoid, side: 'L' | 'R', dir: THREE.Vector3, w = 1) {
  const f = h.bone(`foot.${side}`); if (!f || w <= 0) return;
  f.getWorldQuaternion(Q0);
  aim(f, A.set(0, 1, 0).applyQuaternion(Q0), B.copy(dir), Math.min(1, w));
}
