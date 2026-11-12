import * as THREE from 'three';
import type { PoseDef } from './humanoid';

/**
 * LD2.0-D round 2, lane R2-W (docs/ld2/LD2_D.md, « Round 2 », decision 2: « the swimming is not smooth and animated at all »): the swim's clips, built
 * at load from the shared rig's rest pose with the same solver as the home and prayer poses (humanoid.ts `buildPoseClips`), so every body of the rig
 * swims the same way: the v4 body and the player's Meshy bodies.
 *  - 'Swim': a calm breaststroke with the head up (legible from above): glide, the arms sweep out, in under the chest as the head rises to breathe,
 *    the hands meet under the chin while the heels come up, the frog kick as the arms shoot forward, the glide again. Six keys a cycle.
 *  - 'Tread': treading water, upright, the head and shoulders out: the hands scull out and in under the surface, the legs pedal in turn. Four keys.
 *  - 'SwimClimb': one pose, half out at the pool's edge: the hands flat on the coping, the arms straight, a knee coming up onto the deck.
 * A looping clip is the keys passed through a periodic Catmull-Rom spline (each bone's aim, the hips' height and pitch), sampled into STROKE_FRAMES /
 * TREAD_FRAMES poses, each solved by `buildPoseClips`, then laid end to end as one clip of 1 s whose last frame is its first (`assembleSwimClips`): the
 * mixer slerps between close samples, so the limbs ease in and out of each key instead of turning at a constant rate. The player's swim
 * (src/villa/swim.ts) plays the stroke faster or slower with the swimming speed (Humanoid.holdRate) and cross-fades it with the treading.
 *
 * Character space (as POSES): +z where the swimmer heads, +x their left, +y up; the origin under the body. In every swim clip the water line is at
 * SWIM_WATERLINE above the origin (body units): the swim puts the origin that far under the water's surface, times the body's scale. Swimming, the
 * body lies near-horizontal face down, the back at the surface, the head up and out; treading, it stands with the shoulders at the surface.
 * Its own module (not humanoid.ts), as the prayer postures are: it needs the PoseDef type only.
 */
export type SwimClip = 'Swim' | 'Tread' | 'SwimClimb';
export const SWIM_CLIPS: readonly SwimClip[] = ['Swim', 'Tread', 'SwimClimb'];
/** The water line's height above the origin in 'Swim' and 'Tread' (m, a body of scale 1). */
export const SWIM_WATERLINE = 1.33;
/** In 'SwimClimb': the height of the hands (flat on the coping) above the origin, and how far ahead of it they are (m, a body of scale 1). */
export const CLIMB_HANDS = { y: 0.93, z: 0.55 } as const;
/** Poses sampled a cycle (the clip's keyframes). */
export const STROKE_FRAMES = 24, TREAD_FRAMES = 16;

type V3 = [number, number, number];
type Aims = Record<string, V3>;
/** A key of a cycle: when (0…1 of the cycle), the hips (height, pitch forward about x), the bones' aims, the palms (bodies with a palm). */
export interface SwimKey { at: number; hipsY: number; pitch: number; aim: Aims; palm?: Aims }

/** The left side's aims mirrored onto the right (x → −x). */
const both = (l: Record<string, V3>): Aims => {
  const out: Aims = {};
  for (const [k, v] of Object.entries(l)) { out[`${k}L`] = v; out[`${k}R`] = [-v[0], v[1], v[2]]; }
  return out;
};

// ------------------------------------------------------------------------------------------------ the breaststroke (heads up)
// face down along +z: the hips pitched forward by `pitch` (π/2: level), the trunk rising a little toward the head, which stays up and out
const trunk = (sp: number, ch: number, nk: number, hd: [number, number]): Aims => ({ spine: [0, sp, 1], chest: [0, ch, 1], neck: [0, nk, 1], head: [0, hd[0], hd[1]] });
const ARMS_FWD = both({ upper_arm: [-0.05, -0.1, 1], forearm: [-0.1, -0.08, 1], hand: [-0.08, -0.06, 1] });
const LEGS_LONG = both({ thigh: [0.06, -0.14, -1], shin: [0.03, -0.09, -1], foot: [0.02, 0.12, -1] });
const PALMS_DOWN = both({ hand: [0, -1, 0] });
/** The shoulders drawn forward toward the head by `f` (0: square, as at rest) as the arms reach out in front. */
const SHOULDERS = (f: number) => both({ shoulder: [Math.sqrt(1 - f * f), 0.03, f] });
export const STROKE_KEYS: readonly SwimKey[] = [
  // the glide: stretched long, the arms out in front, the legs together, the face forward just over the water
  { at: 0, hipsY: 1.19, pitch: 1.45, aim: { ...trunk(0.15, 0.2, 0.5, [0.86, 0.5]), ...SHOULDERS(0.5), ...ARMS_FWD, ...LEGS_LONG }, palm: PALMS_DOWN },
  // the outsweep: the hands part and press out and down, palms turned out; the head starts to rise
  { at: 0.2, hipsY: 1.18, pitch: 1.42, aim: { ...trunk(0.17, 0.24, 0.55, [0.9, 0.44]), ...SHOULDERS(0.3), ...both({ upper_arm: [0.62, -0.22, 0.75], forearm: [0.58, -0.4, 0.7], hand: [0.48, -0.45, 0.75] }), ...LEGS_LONG },
    palm: both({ hand: [0.7, -0.3, -0.6] }) },
  // the insweep and the breath: elbows high and wide, the hands sweep down and in under the chest, the chest and head up; the heels start to rise
  { at: 0.4, hipsY: 1.15, pitch: 1.3, aim: { ...trunk(0.3, 0.42, 0.66, [0.97, 0.24]), ...SHOULDERS(0.15), ...both({ upper_arm: [0.85, -0.45, 0.12], forearm: [-0.35, -0.85, 0.38], hand: [-0.6, -0.55, 0.55] }),
    ...both({ thigh: [0.18, -0.42, -0.9], shin: [0.2, 0.5, -0.85], foot: [0.35, -0.15, -0.92] }) }, palm: both({ hand: [-0.7, 0, -0.7] }) },
  // the recovery: the hands together under the chin, pushing forward; the heels drawn up to the seat, the knees apart, the feet turned out
  { at: 0.58, hipsY: 1.15, pitch: 1.33, aim: { ...trunk(0.25, 0.35, 0.6, [0.95, 0.3]), ...SHOULDERS(0.3), ...both({ upper_arm: [-0.12, -0.8, 0.55], forearm: [-0.45, 0.22, 0.86], hand: [-0.3, 0.08, 0.95] }),
    ...both({ thigh: [0.45, -0.75, -0.45], shin: [0.25, 0.85, -0.45], foot: [0.75, 0.15, -0.6] }) }, palm: both({ hand: [-0.8, -0.55, 0] }) },
  // the kick: the arms shoot forward, the feet push out, round and back, the head goes forward again
  { at: 0.74, hipsY: 1.18, pitch: 1.42, aim: { ...trunk(0.17, 0.23, 0.55, [0.88, 0.47]), ...SHOULDERS(0.47), ...both({ upper_arm: [0, -0.28, 1], forearm: [-0.1, -0.2, 1], hand: [-0.08, -0.15, 1] }),
    ...both({ thigh: [0.4, -0.3, -0.86], shin: [0.55, -0.15, -0.8], foot: [0.72, -0.25, -0.62] }) }, palm: PALMS_DOWN },
  // the legs snap together into the glide
  { at: 0.88, hipsY: 1.19, pitch: 1.46, aim: { ...trunk(0.14, 0.19, 0.48, [0.85, 0.52]), ...SHOULDERS(0.5), ...ARMS_FWD, ...both({ thigh: [0.08, -0.15, -1], shin: [0.05, -0.1, -1], foot: [0.03, 0.14, -1] }) }, palm: PALMS_DOWN },
];
/**
 * How fast the swimmer goes along the stroke (× the mean speed, averaging 1 over a cycle): a surge after the kick, a smaller one on the pull, slowest
 * as the heels come up. `phase` is the clip's (0…1).
 */
export function strokeSurge(phase: number): number {
  const bump = (c: number, w: number) => { const d = ((phase - c + 1.5) % 1) - 0.5; return Math.exp(-(d * d) / (2 * w * w)); };
  return (0.72 + 0.62 * bump(0.83, 0.075) + 0.3 * bump(0.33, 0.07)) / SURGE_MEAN;
}
const SURGE_MEAN = (() => { let s = 0; const n = 200; for (let i = 0; i < n; i++) { const p = i / n, b = (c: number, w: number) => { const d = ((p - c + 1.5) % 1) - 0.5; return Math.exp(-(d * d) / (2 * w * w)); }; s += 0.72 + 0.62 * b(0.83, 0.075) + 0.3 * b(0.33, 0.07); } return s / n; })();

// ------------------------------------------------------------------------------------------------ treading water
// upright, a little forward, the shoulders at the water line; the hands scull out and in at the chest's height, the legs pedal in turn
const UP: Aims = { spine: [0, 1, 0.12], chest: [0, 1, 0.1], neck: [0, 1, 0.08], head: [0, 1, 0] };
const KNEE_UP = (s: 1 | -1): Aims => ({ [s > 0 ? 'thighL' : 'thighR']: [s * 0.22, -0.45, 0.86], [s > 0 ? 'shinL' : 'shinR']: [s * 0.1, -0.98, -0.12], [s > 0 ? 'footL' : 'footR']: [s * 0.05, -0.55, 0.83] });
const LEG_DOWN = (s: 1 | -1): Aims => ({ [s > 0 ? 'thighL' : 'thighR']: [s * 0.15, -0.8, 0.58], [s > 0 ? 'shinL' : 'shinR']: [s * 0.05, -0.85, -0.52], [s > 0 ? 'footL' : 'footR']: [s * 0.05, -0.45, 0.88] });
const LEGS_MID = both({ thigh: [0.16, -0.66, 0.72], shin: [0.07, -0.9, -0.42], foot: [0.05, -0.5, 0.86] });
export const TREAD_KEYS: readonly SwimKey[] = [
  // the hands sweep out, palms pitched out; the left knee up, the right leg pushing down
  { at: 0, hipsY: 0.855, pitch: 0.15, aim: { ...UP, ...both({ upper_arm: [0.5, -0.8, 0.3], forearm: [0.85, -0.25, 0.45], hand: [0.85, -0.15, 0.5] }), ...KNEE_UP(1), ...LEG_DOWN(-1) },
    palm: both({ hand: [0.7, -0.45, -0.3] }) },
  // the hands out wide; the legs crossing
  { at: 0.25, hipsY: 0.87, pitch: 0.16, aim: { ...UP, ...both({ upper_arm: [0.6, -0.76, 0.2], forearm: [0.92, -0.15, 0.12], hand: [0.95, -0.1, 0] }), ...LEGS_MID },
    palm: both({ hand: [0.3, -0.75, -0.6] }) },
  // the hands sweep in, palms pitched in; the right knee up, the left leg pushing down
  { at: 0.5, hipsY: 0.855, pitch: 0.15, aim: { ...UP, ...both({ upper_arm: [0.45, -0.82, 0.35], forearm: [0.05, -0.25, 1], hand: [-0.3, -0.15, 0.95] }), ...KNEE_UP(-1), ...LEG_DOWN(1) },
    palm: both({ hand: [-0.6, -0.5, 0.3] }) },
  // the hands together in front; the legs crossing
  { at: 0.75, hipsY: 0.87, pitch: 0.16, aim: { ...UP, ...both({ upper_arm: [0.35, -0.82, 0.45], forearm: [-0.35, -0.2, 0.92], hand: [-0.55, -0.1, 0.83] }), ...LEGS_MID },
    palm: both({ hand: [-0.3, -0.75, 0.6] }) },
];

// ------------------------------------------------------------------------------------------------ climbing out
/** Half out at the edge, facing it: leaning over it on straight arms, the hands flat on the coping (CLIMB_HANDS), the left knee coming up. */
export const CLIMB_POSE: PoseDef = {
  hipsY: 0.95, hips: [0.35, 0, 0],
  aim: {
    spine: [0, 1, 0.36], chest: [0, 1, 0.42], neck: [0, 1, 0.3], head: [0, 1, 0.12],
    ...both({ upper_arm: [0.12, -0.85, 0.5], forearm: [0.08, -0.88, 0.47], hand: [0.05, -0.2, 1] }),
    thighL: [0.12, -0.3, 0.95], shinL: [0.05, -0.95, -0.3], footL: [0.05, -0.4, 0.9],
    thighR: [-0.08, -1, 0.08], shinR: [-0.03, -1, -0.12], footR: [-0.03, -0.5, 0.85],
  },
  palm: PALMS_DOWN,
};

// ------------------------------------------------------------------------------------------------ the clips
/** A value of a periodic spline through `ys` at times `ts` (0 ≤ t < 1, increasing), at time `s` (Catmull-Rom tangents, uneven spacing). */
export function periodicSpline(ts: readonly number[], ys: readonly number[], s: number): number {
  const n = ts.length, T = (i: number) => ts[((i % n) + n) % n] + Math.floor(i / n), Y = (i: number) => ys[((i % n) + n) % n];
  s = ((s % 1) + 1) % 1;
  let i = n - 1; for (let k = 0; k < n; k++) if (ts[k] <= s) i = k;
  if (s < ts[0]) i = -1;                                                   // before the first key: the segment from the last one (a cycle back)
  const t0 = T(i), t1 = T(i + 1), h = t1 - t0, u = (s - t0) / h;
  const m0 = (Y(i + 1) - Y(i - 1)) / (T(i + 1) - T(i - 1)), m1 = (Y(i + 2) - Y(i)) / (T(i + 2) - T(i));
  const u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * Y(i) + (u3 - 2 * u2 + u) * h * m0 + (-2 * u3 + 3 * u2) * Y(i + 1) + (u3 - u2) * h * m1;
}
/** The pose at `s` (0…1) of a cycle of keys: every aim and palm through the spline, normalised. */
export function poseAt(keys: readonly SwimKey[], s: number): PoseDef {
  const ts = keys.map(k => k.at), at = (f: (k: SwimKey) => number) => periodicSpline(ts, keys.map(f), s);
  const vec = (pick: (k: SwimKey) => V3): V3 => { const v = new THREE.Vector3(at(k => pick(k)[0]), at(k => pick(k)[1]), at(k => pick(k)[2])).normalize(); return [v.x, v.y, v.z]; };
  const aim: Aims = {}, palm: Aims = {};
  for (const b of Object.keys(keys[0].aim)) aim[b] = vec(k => new THREE.Vector3(...k.aim[b]).normalize().toArray() as V3);
  for (const b of Object.keys(keys[0].palm ?? {})) palm[b] = vec(k => new THREE.Vector3(...(k.palm?.[b] ?? keys[0].palm![b])).normalize().toArray() as V3);
  return { hipsY: at(k => k.hipsY), hips: [at(k => k.pitch), 0, 0], aim, palm };
}
/** Every pose `buildPoseClips` solves for the swim: the cycles' samples (`Swim.00`…, `Tread.00`…) and the climb. */
export const SWIM_POSES: Readonly<Record<string, PoseDef>> = (() => {
  const out: Record<string, PoseDef> = {};
  for (let k = 0; k < STROKE_FRAMES; k++) out[`Swim.${String(k).padStart(2, '0')}`] = poseAt(STROKE_KEYS, k / STROKE_FRAMES);
  for (let k = 0; k < TREAD_FRAMES; k++) out[`Tread.${String(k).padStart(2, '0')}`] = poseAt(TREAD_KEYS, k / TREAD_FRAMES);
  out.SwimClimb = CLIMB_POSE;
  return out;
})();
/**
 * The swim's clips from the solved poses: each cycle's samples laid end to end over 1 s, its first pose again at the end (a seamless loop), every
 * track in the order of the samples' (the solver gives each the rig's whole list of tracks); the climb as it is.
 */
export function assembleSwimClips(built: readonly THREE.AnimationClip[]): THREE.AnimationClip[] {
  const out: THREE.AnimationClip[] = [];
  for (const [name, n] of [['Swim', STROKE_FRAMES], ['Tread', TREAD_FRAMES]] as const) {
    const frames = built.filter(c => c.name.startsWith(`${name}.`)).sort((a, b) => (a.name < b.name ? -1 : 1));
    if (frames.length !== n) continue;
    const times = Float32Array.from({ length: n + 1 }, (_, k) => k / n);
    const tracks = frames[0].tracks.map((t, j) => {
      const size = t.getValueSize(), v = new Float32Array((n + 1) * size);
      for (let k = 0; k <= n; k++) v.set(frames[k % n].tracks[j].values.subarray(0, size), k * size);
      const T = t.constructor as new (name: string, times: ArrayLike<number>, values: ArrayLike<number>) => THREE.KeyframeTrack;
      return new T(t.name, times, v);
    });
    out.push(new THREE.AnimationClip(name, 1, tracks));
  }
  const climb = built.find(c => c.name === 'SwimClimb'); if (climb) out.push(climb);
  return out;
}
