import * as THREE from 'three';
import type { Humanoid } from './humanoid';
import { bend, bodyPoint, legTo, nod, reach } from './gesture';

/**
 * Dance moves on the existing rig, procedural (Humanoid.overlay, on top of whatever clip it holds), driven by the music's
 * beat (src/venues/vagueMusic.ts) and by the player's own touches (src/venues/dancePlay.ts):
 *  - a groove that never stops: the knees bounce down on every beat, the hips sway, the arms swing bent;
 *  - « pas »: a step out to the side and back, the hips following it, the other arm swinging across;
 *  - « sabar »: the sabar's knee lift, high and quick, the opposite arm thrown up and out, the chest over the knee;
 *  - « bras »: both arms up, hands waving on the beat;
 *  - « tour »: a full turn on the spot in one beat, arms out.
 * Sides are the SCREEN's: the dancer faces the camera, so a step to the screen's left is the body's right foot.
 * Its own module (not src/actors/humanoid.ts): a body and the shared IK helpers of src/actors/gesture.ts are all it needs.
 */
export type Step = 'L' | 'R' | 'up' | 'spin';
export type MoveStyle = 'pas' | 'sabar' | 'bras' | 'tour';

const UP = new THREE.Vector3(0, 1, 0);
const T = new THREE.Vector3(), P = new THREE.Vector3(), F = new THREE.Vector3(), R = new THREE.Vector3();
const HP = new THREE.Vector3(), FL = new THREE.Vector3(), FR = new THREE.Vector3();
const QL = new THREE.Quaternion(), QR = new THREE.Quaternion(), QP = new THREE.Quaternion();

interface Hit { step: Step; style: MoveStyle; at: number; strength: number }

export class DanceBody {
  private hits: Hit[] = [];
  /** 0.35 (just the groove) … 1 (on fire): grows with good steps, settles back slowly. */
  energy = 0.45;
  /** The yaw the body faces (world), set by the dance each frame (the turn adds to it). */
  facing = 0;
  /** Debug: what the body did last frame. */
  last = { step: '' as Step | '', style: '' as MoveStyle | '', spin: 0, lift: 0, out: 0, arms: 0 };

  /** The player stepped (`strength` 0.3 … 1 from how well it landed). `beat`: when, on the music. */
  hit(step: Step, style: MoveStyle, beat: number, strength: number) {
    this.hits.push({ step, style, at: beat, strength });
    if (this.hits.length > 8) this.hits.shift();
    this.energy = Math.min(1, this.energy + 0.12 * strength);
  }
  settle(dt: number) { this.energy = Math.max(0.35, this.energy - dt * 0.06); }

  /** The pose for this frame (call from the body's overlay). `beat`: the music heard now (fractional). */
  pose(h: Humanoid, beat: number) {
    const A = this.energy;
    // the latest move still going (a step lasts most of a beat, arms up two, a turn one)
    let cur: Hit | null = null, k = 0;
    for (let i = this.hits.length - 1; i >= 0; i--) {
      const x = this.hits[i], len = x.step === 'up' ? 2 : x.step === 'spin' ? 1.1 : x.style === 'sabar' ? 0.5 : 0.9, p = (beat - x.at) / len;
      if (p >= 0 && p < 1) { cur = x; k = p; break; }
    }
    const env = cur ? Math.sin(Math.PI * k) : 0;
    // the turn: the whole body round the spot (the group itself: the clip and the IK below work in the turned frame)
    const spin = cur?.step === 'spin' ? Math.PI * 2 * (k * k * (3 - 2 * k)) : 0;
    h.group.rotation.y = this.facing + spin;
    h.group.updateMatrixWorld(true);
    const yaw = h.group.rotation.y;
    F.set(Math.sin(yaw), 0, Math.cos(yaw)); R.set(-Math.cos(yaw), 0, Math.sin(yaw));
    // screen side → body side (facing the camera: the screen's left is the body's right)
    const bodySide = (s: Step): 1 | -1 => (s === 'L' ? 1 : -1);
    const side = cur && (cur.step === 'L' || cur.step === 'R') ? bodySide(cur.step) : 0;
    const style = cur?.style ?? 'pas';
    // ---------------------------------------------------------------- hips: bounce on the beat, sway, a drop into the move
    const bounce = 0.5 + 0.5 * Math.cos(Math.PI * 2 * beat);
    const groove = cur ? 0.6 : 1;                                             // without a touch, the body still grooves (smaller)
    let down = 0.035 + 0.045 * A * bounce * groove;
    let sway = 0.05 * A * Math.sin(Math.PI * beat) * groove;
    let out = 0, lift = 0, fwdKnee = 0;
    if (side) {
      if (style === 'sabar') { lift = 0.34 * env * (0.6 + 0.4 * cur!.strength); fwdKnee = 0.16 * env; down += 0.05 * env; sway += side * 0.05 * env; }
      else { out = 0.24 * env * (0.6 + 0.4 * cur!.strength); sway += side * 0.08 * env; down += 0.02 * env; }
    }
    if (cur?.step === 'up') down += 0.03 * Math.sin(Math.PI * 2 * k * 2);
    const hips = h.bone('hips'), fl = h.bone('foot.L'), fr = h.bone('foot.R');
    if (!hips || !fl || !fr || !hips.parent) return;
    fl.getWorldPosition(FL); fr.getWorldPosition(FR); fl.getWorldQuaternion(QL); fr.getWorldQuaternion(QR);
    // the feet: where the clip put them, brought to a dancer's stance (shoulder width, flat on the floor)
    const g = h.group.position, ankle = Math.max(0.05, Math.min(0.13, Math.min(FL.y, FR.y) - g.y));
    const stance = (s: 1 | -1, o: THREE.Vector3) => o.copy(g).addScaledVector(R, s * 0.13).addScaledVector(F, 0.02).setY(g.y + ankle);
    stance(-1, FL); stance(1, FR);
    if (side) {
      const foot = side > 0 ? FR : FL;                                        // body right (+1) or left (−1)
      foot.addScaledVector(R, side * out).addScaledVector(F, fwdKnee * 1.2);
      foot.y += lift;
    }
    hips.getWorldPosition(HP);
    HP.addScaledVector(R, sway); HP.y -= down;
    hips.parent.worldToLocal(HP); hips.position.copy(HP);
    // the hips turn a little toward the stepping foot
    if (side || sway) {
      hips.getWorldQuaternion(QP);
      const q = new THREE.Quaternion().setFromAxisAngle(UP, -(side * 0.22 * env + sway * 1.2));
      const parent = new THREE.Quaternion(); hips.parent.getWorldQuaternion(parent);
      hips.quaternion.copy(parent.invert().multiply(q).multiply(QP));
    }
    hips.updateMatrixWorld(true);
    for (const [s, foot, q] of [[-1, FL, QL], [1, FR, QR]] as const) {
      const knee = T.copy(F).addScaledVector(R, s * 0.25).add(UP.clone().multiplyScalar(lift > 0 && ((s > 0) === (side > 0)) ? 0.6 : 0));
      legTo(h, s > 0 ? 'R' : 'L', foot, knee, 1);
      const b = h.bone(s > 0 ? 'foot.R' : 'foot.L');
      if (b?.parent) { b.parent.getWorldQuaternion(QP); b.quaternion.copy(QP.invert().multiply(q)); b.updateMatrixWorld(true); }
    }
    // ---------------------------------------------------------------- the torso: a lean into the move, the head with the beat
    bend(h, 0.06 + (style === 'sabar' && side ? 0.22 * env : 0) + 0.03 * bounce);
    nod(h, -0.05 + 0.08 * bounce);
    // ---------------------------------------------------------------- the arms
    const arm = (s: 1 | -1, fwd: number, up: number, right: number, pole: THREE.Vector3) =>
      reach(h, s > 0 ? 'R' : 'L', bodyPoint(h, fwd, up, s * right, P), pole, 1);
    const pole = (s: 1 | -1, down = 1, back = 0.4, outw = 0.7) => T.copy(UP).multiplyScalar(-down).addScaledVector(R, s * outw).addScaledVector(F, -back).normalize();
    let arms = 0;
    for (const s of [-1, 1] as const) {
      if (cur?.step === 'up') {                                                // both arms up, waving
        const wave = Math.sin(Math.PI * 2 * beat) * 0.12 * s;
        arm(s, 0.08, 1.55 + 0.42 * env, 0.24 + wave, pole(s, -0.2, 0.2, 1)); arms = 1;
      } else if (cur?.step === 'spin') {                                       // arms out for the turn
        arm(s, 0.1, 1.3 + 0.1 * env, 0.55, pole(s, 0.6, 0.6, 0.2)); arms = 2;
      } else if (side && style === 'sabar' && s === -side) {                   // the arm opposite the knee thrown up and out
        arm(s, 0.18, 1.2 + 0.55 * env, 0.32 + 0.18 * env, pole(s, 0.2, 0.3, 1)); arms = 3;
      } else {
        // the groove: bent arms swinging with the hips; the arm across from a step swings forward
        const across = side && s === -side ? env : 0, same = side && s === side ? env : 0;
        const swing = Math.sin(Math.PI * beat + (s > 0 ? 0 : Math.PI)) * 0.06 * A;
        arm(s, 0.24 + swing + 0.12 * across - 0.06 * same, 1.0 + 0.06 * bounce + 0.16 * across, 0.2 - 0.06 * across, pole(s));
      }
    }
    this.last = { step: cur?.step ?? '', style: cur ? style : '', spin: +spin.toFixed(2), lift: +lift.toFixed(3), out: +out.toFixed(3), arms };
  }
}
