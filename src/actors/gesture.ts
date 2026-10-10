import * as THREE from 'three';
import type { Humanoid } from './humanoid';

/**
 * Procedural arm gestures on top of any clip: a two-bone reach that puts a wrist on a point in the world (the mouth,
 * a plate, a crate, a bar overhead), the elbow bending toward a pole. Works from bone positions only, whatever the
 * rig's bone axes. Called from Humanoid.overlay after the clip pose, every frame.
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

/**
 * Puts the `side` wrist on `target` (world), the elbow toward `pole` (a world direction, e.g. down and out), with
 * weight `w` (0 = the clip's own pose, 1 = fully on target). Out-of-reach targets are approached along the line.
 */
export function reach(h: Humanoid, side: 'L' | 'R', target: THREE.Vector3, pole: THREE.Vector3, w = 1) {
  if (w <= 0) return;
  const upper = h.bone(`upper_arm.${side}`), fore = h.bone(`forearm.${side}`), hand = h.bone(`hand.${side}`);
  if (!upper || !fore || !hand) return;
  h.group.updateMatrixWorld(true);
  upper.getWorldPosition(S); fore.getWorldPosition(E); hand.getWorldPosition(W);
  const a = S.distanceTo(E), b = E.distanceTo(W);
  T.copy(target).sub(S);
  const d = Math.min(Math.max(T.length(), Math.abs(a - b) + 1e-3), a + b - 1e-3);
  U.copy(T).normalize();
  V.copy(pole).addScaledVector(U, -pole.dot(U)); if (V.lengthSq() < 1e-6) V.set(0, -1, 0).addScaledVector(U, -U.y);
  V.normalize();
  const cosA = (a * a + d * d - b * b) / (2 * a * d), sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  E2.copy(S).addScaledVector(U, a * cosA).addScaledVector(V, a * sinA);       // where the elbow goes
  aim(upper, A.copy(E).sub(S), B.copy(E2).sub(S), w);
  fore.getWorldPosition(E); hand.getWorldPosition(W);
  P.copy(S).addScaledVector(U, d);                                             // the reachable target
  aim(fore, A.copy(W).sub(E), B.copy(P).sub(E), w);
}

/** World position of a point given in the body's frame: forward, up (from the feet), right. */
export function bodyPoint(h: Humanoid, fwd: number, up: number, right: number, out = new THREE.Vector3()) {
  const y = h.group.rotation.y, g = h.group.position;
  return out.set(g.x + Math.sin(y) * fwd - Math.cos(y) * right, g.y + up, g.z + Math.cos(y) * fwd + Math.sin(y) * right);
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

/** World position just past the wrist, where a held object sits. */
export function grip(h: Humanoid, side: 'L' | 'R', out = new THREE.Vector3()) {
  const f = h.bone(`forearm.${side}`), w = h.bone(`hand.${side}`);
  if (!f || !w) return bodyPoint(h, 0.3, 1.0, side === 'R' ? 0.2 : -0.2, out);
  w.getWorldPosition(out); f.getWorldPosition(A);
  return out.addScaledVector(A.sub(out).normalize(), -0.08);
}
