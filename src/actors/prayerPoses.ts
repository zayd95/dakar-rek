import * as THREE from 'three';
import type { PoseDef } from './humanoid';

/**
 * The postures of the prayer (salat), as one-frame pose clips built at load from the shared rig's rest pose (the same
 * solver as the home poses: humanoid.ts `buildPoseClips`), so that every body of the rig — the congregation, the imam,
 * the player's Meshy body — bows and prostrates the same way, and the mixer cross-fades from one posture to the next.
 *
 * Character space (as POSES): origin on the floor of the prayer place, +z toward the qibla, +x the worshipper's left,
 * +y up. One footprint for every posture: the feet stand at the back of the place (z ≈ −0.3) and stay there; in
 * prostration the toes are still there (tucked, pointing to the qibla), the knees at z ≈ +0.1, the hands flat on the
 * floor either side of the head and the forehead and nose on the floor at z ≈ +0.66 — the whole body inside its own
 * 0.9 × 1.4 m place of the carpet, clear of the row in front.
 *
 * Standing arms hang at the sides (sadl, as most people pray in Senegal, Maliki school); the sittings are on the feet
 * (the left foot laid flat, the right one upright on its toes), hands on the thighs. The salutation turns the head right
 * then left (derived from the sitting: `deriveSalam`). No recitation, no text: postures only.
 */
export type PrayerClip = 'PrayStand' | 'PrayTakbir' | 'PrayBow' | 'PrayDown' | 'PraySujud' | 'PraySit' | 'PraySalamR' | 'PraySalamL';
type Built = Exclude<PrayerClip, 'PraySalamR' | 'PraySalamL'>;

/** Where the feet stand in every posture (z, character space): the back of the place. */
export const PRAY_FEET_Z = -0.05;

const F = PRAY_FEET_Z;
const LEGS_UP = {
  thighL: [0.01, -1, 0], shinL: [0, -1, -0.01], footL: [0, -0.35, 0.94],
  thighR: [-0.01, -1, 0], shinR: [0, -1, -0.01], footR: [0, -0.35, 0.94],
} satisfies Record<string, [number, number, number]>;
export const PRAYER_POSES: Record<Built, PoseDef> = {
  // qiyam (and i'tidal, back upright after the bow): straight, arms by the sides, the gaze lowered to the place of prostration
  PrayStand: {
    hipsY: 0.955, hipsZ: F, hips: [0, 0, 0],
    aim: {
      spine: [0, 1, 0], chest: [0, 1, 0.02], neck: [0, 1, 0.1], head: [0, 1, 0.32],
      upper_armL: [0.13, -1, 0.02], forearmL: [0.07, -1, 0.07], handL: [0.04, -1, 0.05],
      upper_armR: [-0.13, -1, 0.02], forearmR: [-0.07, -1, 0.07], handR: [-0.04, -1, 0.05],
      ...LEGS_UP,
    },
    palm: { handL: [-1, 0, 0], handR: [1, 0, 0] },
  },
  // the opening takbir: the hands raised to the ears, palms toward the qibla
  PrayTakbir: {
    hipsY: 0.955, hipsZ: F, hips: [0, 0, 0],
    aim: {
      spine: [0, 1, 0], chest: [0, 1, 0.02], neck: [0, 1, 0.08], head: [0, 1, 0.25], shoulderL: [0.957, -0.154, 0.247], shoulderR: [-0.957, -0.154, 0.247],
      upper_armL: [0.25, -0.5, 0.8], forearmL: [-0.2, 1, -0.25], handL: [-0.05, 1, 0.02],
      upper_armR: [-0.25, -0.5, 0.8], forearmR: [0.2, 1, -0.25], handR: [0.05, 1, 0.02],
      ...LEGS_UP,
    },
    palm: { handL: [0, 0, 1], handR: [0, 0, 1] },
  },
  // ruku: the back level, the head in line with it, the hands on the knees, the legs straight
  PrayBow: {
    hipsY: 0.945, hipsZ: F - 0.08, hips: [1.15, 0, 0],
    aim: {
      spine: [0, 0.02, 1], chest: [0, 0, 1], neck: [0, -0.03, 1], head: [0, -0.12, 1],
      upper_armL: [0.004, -0.671, -0.741], forearmL: [-0.371, -0.660, -0.653], handL: [0, -1, -0.1],
      upper_armR: [-0.004, -0.671, -0.741], forearmR: [0.371, -0.660, -0.653], handR: [0, -1, -0.1],
      thighL: [0.01, -1, 0.2], shinL: [0, -1, 0], footL: [0, -0.35, 0.94],
      thighR: [-0.01, -1, 0.2], shinR: [0, -1, 0], footR: [0, -0.35, 0.94],
    },
    palm: { handL: [0, 0, -1], handR: [0, 0, -1] },
  },
  // going down to prostrate (and coming up from it): knees bent, on the toes, the hands reaching the floor first (Maliki)
  PrayDown: {
    hipsY: 0.45, hipsZ: -0.075, hips: [0.85, 0, 0],
    aim: {
      spine: [0, 0.05, 1], chest: [0, -0.2, 1], neck: [0, -0.35, 1], head: [0, -0.6, 1], shoulderL: [0.953, -0.301, 0.054], shoulderR: [-0.953, -0.301, 0.054],
      upper_armL: [0.199, -0.98, 0.029], forearmL: [-0.268, -0.564, 0.781], handL: [0, -0.05, 1],
      upper_armR: [-0.199, -0.98, 0.029], forearmR: [0.268, -0.564, 0.781], handR: [0, -0.05, 1],
      thighL: [0.03, -0.489, 0.873], shinL: [0, -0.176, -0.984], footL: [0, -0.85, 0.52],
      thighR: [-0.03, -0.489, 0.873], shinR: [0, -0.176, -0.984], footR: [0, -0.85, 0.52],
    },
    palm: { handL: [0, -1, 0], handR: [0, -1, 0] },
  },
  // sujud: forehead and nose on the floor, hands flat beside the head, elbows raised and apart, knees and toes down
  PraySujud: {
    hipsY: 0.49, hipsZ: 0.19, hips: [1.6, 0, 0],
    aim: {
      spine: [0, -0.55, 1], chest: [0, -0.85, 1], neck: [0, -1.35, 1], head: [0, -0.08, 1], shoulderL: [0.97, -0.2, 0.12], shoulderR: [-0.97, -0.2, 0.12],
      upper_armL: [0.58, -0.542, -0.608], forearmL: [-0.524, -0.046, 0.85], handL: [-0.05, -0.3, 1],
      upper_armR: [-0.58, -0.542, -0.608], forearmR: [0.524, -0.046, 0.85], handR: [0.05, -0.3, 1],
      thighL: [0.03, -0.966, 0.259], shinL: [0, 0.21, -0.978], footL: [0, -0.85, 0.52],
      thighR: [-0.03, -0.966, 0.259], shinR: [0, 0.21, -0.978], footR: [0, -0.85, 0.52],
    },
    palm: { handL: [0, -1, 0], handR: [0, -1, 0] },
  },
  // the sitting between the prostrations and for the tashahhud (iftirash): on the left foot laid flat, the right one
  // upright on its toes, back straight, hands on the thighs — also how one sits on the rows the rest of the time
  PraySit: {
    hipsY: 0.21, hipsZ: -0.1, hips: [0, 0, 0],
    aim: {
      spine: [0, 1, 0.04], chest: [0, 1, 0.05], neck: [0, 1, 0.12], head: [0, 1, 0.3],
      upper_armL: [-0.039, -0.919, 0.393], forearmL: [-0.25, -0.837, 0.487], handL: [0, -0.35, 1],
      upper_armR: [0.039, -0.919, 0.393], forearmR: [0.25, -0.837, 0.487], handR: [0, -0.35, 1],
      thighL: [0.08, -0.29, 1], shinL: [0, -0.06, -1], footL: [0, -0.15, -1],
      thighR: [-0.08, -0.29, 1], shinR: [0, 0.21, -0.978], footR: [0, -0.85, 0.52],
    },
    palm: { handL: [0, -1, 0], handR: [0, -1, 0] },
  },
};

/** The salutation's head turn (rad), shared by the neck (a third) and the head: over the shoulder, as people do. */
export const SALAM_TURN = 1.05;
const _q = new THREE.Quaternion(), _t = new THREE.Quaternion(), _y = new THREE.Vector3(0, 1, 0);
/**
 * 'PraySalamR' and 'PraySalamL': the sitting with the head turned to the right, then to the left (the worshipper's right
 * is −x). Each is PraySit with the neck and the head turned about their own axis (both nearly upright when sitting).
 */
export function deriveSalam(clips: THREE.AnimationClip[]) {
  const sit = clips.find(c => c.name === 'PraySit'); if (!sit) return;
  for (const [name, sign] of [['PraySalamR', -1], ['PraySalamL', 1]] as const) {
    if (clips.some(c => c.name === name)) continue;
    const c = sit.clone(); c.name = name;
    for (const t of c.tracks) {
      const share = t.name === 'neck.quaternion' ? 0.35 : t.name === 'head.quaternion' ? 0.65 : 0;
      if (!share) continue;
      _t.setFromAxisAngle(_y, sign * SALAM_TURN * share);
      const v = Float32Array.from(t.values);
      for (let i = 0; i < v.length; i += 4) { _q.set(v[i], v[i + 1], v[i + 2], v[i + 3]).multiply(_t); v[i] = _q.x; v[i + 1] = _q.y; v[i + 2] = _q.z; v[i + 3] = _q.w; }
      t.values = v;
    }
    clips.push(c);
  }
}

/** The prayer clips whose body rests on the floor (a Meshy body's thicker thighs lift the sitting: BODY_FIT.sitLift). */
export const PRAY_SEATED: readonly PrayerClip[] = ['PraySit', 'PraySalamR', 'PraySalamL'];

const PRESENCE: Readonly<Record<PrayerClip, 'Idle' | 'Kneel'>> = {
  PrayStand: 'Idle', PrayTakbir: 'Idle', PrayBow: 'Idle', PrayDown: 'Kneel', PraySujud: 'Kneel', PraySit: 'Kneel', PraySalamR: 'Kneel', PraySalamL: 'Kneel',
};
/**
 * What other players see of a prayer posture: the presence protocol carries a short list of clips
 * (src/multiplayer/protocol.ts), so a worshipper is shown standing or kneeling there. Null for any other clip.
 */
export const prayerPresence = (clip: string): 'Idle' | 'Kneel' | null => PRESENCE[clip as PrayerClip] ?? null;

// ---------------------------------------------------------------- the floor during the blends
/** What the guard needs of a body (a Humanoid, or a bare rig in the checks). */
export interface PosedBody { group: THREE.Object3D; bone(name: string): THREE.Object3D | null }
interface GuardBones { hips: THREE.Object3D; feet: THREE.Object3D[]; shins: THREE.Object3D[]; forearms: THREE.Object3D[]; hands: THREE.Object3D[]; head: THREE.Object3D }
const guardBones = new WeakMap<PosedBody, GuardBones | null>();
const bonesOf = (h: PosedBody) => {
  let g = guardBones.get(h);
  if (g === undefined) {
    const n = ['hips', 'foot.L', 'foot.R', 'shin.L', 'shin.R', 'forearm.L', 'forearm.R', 'hand.L', 'hand.R', 'head'].map(x => h.bone(x));
    g = n.every(Boolean) ? { hips: n[0]!, feet: [n[1]!, n[2]!], shins: [n[3]!, n[4]!], forearms: [n[5]!, n[6]!], hands: [n[7]!, n[8]!], head: n[9]! } : null;
    guardBones.set(h, g);
  }
  return g;
};
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
/**
 * Points of the skin checked against the floor, in their bone's frame (the shared rig's v4 mesh: +y along the bone; the
 * foot's +z is its sole, the shin's −z the kneecap): the toes (tip, top, sole), the heel, the wrists and hands, the face.
 */
const FOOT = [V(0, 0.175, 0), V(0, 0.16, -0.03), V(0, 0.15, 0.03), V(0, -0.01, 0.07), V(0, 0.04, -0.035)];
const SHIN = [V(0, 0.2, -0.065), V(0, 0.36, -0.06)], FOREARM = [V(0, 0.29, -0.06), V(0, 0.29, 0.06)], HAND = [V(0, 0.11, 0), V(0, 0.06, 0.035), V(0, 0.06, -0.05)];
const FACE = [V(0, 0.07, 0.115), V(0, 0, 0.123), V(0, -0.12, 0.03), V(0, 0.15, 0)];
/** Heights the joints themselves keep above the floor: a knee on it, the hips of someone seated on the feet. */
const KNEE = 0.055, SEAT = 0.1;
const _p = new THREE.Vector3(), _a = new THREE.Vector3(), _r = new THREE.Vector3(), _ax = new THREE.Vector3(), _f = new THREE.Vector3();
const _gq = new THREE.Quaternion(), _qw = new THREE.Quaternion(), _qp = new THREE.Quaternion();
/** The deepest point under the floor found so far in this frame's check (m), and the floor and scale it is checked against. */
let _lift = 0, _floor = 0, _k = 1;
const low = (y: number, clear: number) => { const d = _floor + clear * _k - y; if (d > _lift) _lift = d; };
const lowest = (bone: THREE.Object3D, pts: readonly THREE.Vector3[], out: THREE.Vector3) => {
  let y = Infinity;
  for (const pt of pts) { _p.copy(pt).applyMatrix4(bone.matrixWorld); if (_p.y < y) { y = _p.y; out.copy(_p); } }
  return y;
};

/**
 * Keeps a praying body out of the floor while it blends from one posture to the next (the mixer's cross-fade turns the
 * joints and slides the hips linearly, so half-way through a sit-down the feet would dip under the carpet): each foot is
 * pitched up about its ankle until its toes are on the floor, then the whole body is lifted by what still goes under
 * (knees, forearms, hands, face, seat). The postures themselves rest on the floor, so this only acts in the blends.
 * Set as the body's overlay (Humanoid.overlay): runs after the mixer every frame; no allocation.
 */
export function groundGuard(h: PosedBody) {
  const b = bonesOf(h); if (!b) return;
  const g = h.group, yaw = g.rotation.y;
  _floor = g.position.y; _k = g.scale.y; _lift = 0;
  g.updateMatrixWorld(true);
  _ax.set(Math.cos(yaw), 0, -Math.sin(yaw));                                   // the body's left: the axis a foot pitches about
  _f.set(Math.sin(yaw), 0, Math.cos(yaw));
  for (const f of b.feet) {
    const want = _floor + 0.004 * _k;
    if (lowest(f, FOOT, _r) >= want) continue;
    f.getWorldPosition(_a); _r.sub(_a);
    const along = _r.dot(_f), up = _r.y, rho = Math.hypot(along, up), need = want - _a.y;
    if (rho < 1e-4 || Math.abs(need) > rho) continue;                          // the ankle itself is too low: the lift below takes it
    const turn = Math.atan2(up, along) - Math.atan2(need, Math.sign(along || 1) * Math.sqrt(rho * rho - need * need));
    f.getWorldQuaternion(_qw); f.parent!.getWorldQuaternion(_qp);
    _gq.setFromAxisAngle(_ax, turn);
    f.quaternion.copy(_qp.invert().multiply(_gq.multiply(_qw)));
    f.updateMatrixWorld(true);
  }
  for (const f of b.feet) low(lowest(f, FOOT, _r), 0);
  for (const s of b.shins) { s.getWorldPosition(_p); low(_p.y, KNEE); low(lowest(s, SHIN, _r), 0); }
  for (const a of b.forearms) low(lowest(a, FOREARM, _r), 0);
  for (const w of b.hands) low(lowest(w, HAND, _r), 0);
  low(lowest(b.head, FACE, _r), 0);
  b.hips.getWorldPosition(_p); low(_p.y, SEAT);
  if (_lift <= 0.002 * _k) return;
  b.hips.getWorldPosition(_p); _p.y += _lift;
  b.hips.parent!.worldToLocal(_p); b.hips.position.copy(_p); b.hips.updateMatrixWorld(true);
}
