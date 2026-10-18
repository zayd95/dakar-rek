import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { WrestlerLook } from '../core/types';
import { ACCESSORIES, ngembTexture, type Socket } from '../lamb/look';
import type { Outfit } from './character';
import { GaitState, runCadence, walkCadence } from './gait';
import { GaitRig } from './gaitRig';
import { joinNeck } from './neckJoin';
import { reshapeCharacter } from './proportions';
import { fitEyes } from './eyes';

/**
 * Shared humanoid from Blender (public/assets/character_v4.glb, source assets-src/character_rig_v4.blend):
 * one skinned body on a 20-bone rig with clothing meshes (Tee, Trousers, Boubou, Dress, Kufi, Headwrap, Shoes),
 * two ngemb cuts and accessory sockets. Clips: Idle, Walk, Run, Talk, Sit, Stance, Grab, Fall_Back, Prep,
 * Dance_A, Dance_B, Celebrate, Entrance_Walk. Status: TEMP v2 (see docs/ASSET_REGISTER.md).
 */
export type Clip = 'Idle' | 'Walk' | 'Jog' | 'Run' | 'Talk' | 'Sit' | 'Stance' | 'Grab' | 'Fall_Back' | 'Prep' | 'Dance_A' | 'Dance_B' | 'Celebrate' | 'Entrance_Walk' | 'Kneel' | PoseClip;
/** Poses built in code from the rig's rest pose (buildPoseClips): lying on the back, sitting cross-legged, astride a two-wheeler. 'Kneel' is derived from Sit (deriveKneel). */
export type PoseClip = 'Lie' | 'SitFloor' | 'Ride';
export type Style = 'boubou' | 'tee' | 'dress';
export type Pattern = 'uni' | 'wax' | 'bazin' | 'rayure';
export interface PersonLook {
  skin: number; style: Style; top: number; bottom?: number; pattern?: Pattern; accent?: number;
  hat?: 'kufi' | 'headwrap' | null; hatColor?: number; shoes?: number; female?: boolean;
  /** Body shape (morph targets from the Blender rig, 0–1). */
  heavy?: number; muscular?: number;
  hair?: 'short' | 'puff' | 'none'; beard?: number | null; // beard colour, null = none
}

type Template = { scene: THREE.Object3D; clips: THREE.AnimationClip[] };
let template: Template | null = null;
export const humanoidReady = () => !!template;

/**
 * Other bodies on the same rig (PROOF, docs/meshy/PROOF_REPORT.md): a GLB made by scripts/meshy/transplant-to-v4-rig.mjs has the bones,
 * sockets and clips of character_v4.glb, so the gait, the pose solvers, the strike rig and the gestures run on it unchanged. A body that
 * is not loaded (or failed to load) falls back to the v4 body: `new Humanoid(look, 'meshy_m')` never throws when v4 is ready.
 */
export type BodyId = 'v4' | 'meshy_m' | 'meshy_f';
const bodies: Partial<Record<BodyId, Template>> = {};
/**
 * What differs between a body's mesh and the shared rig, in four numbers (measured by proof/meshy/harness.ts against the v4 control):
 * the scale it is drawn at; how much higher the hips sit for seated and lying poses (thicker thighs and back than v4's); how much longer
 * its hand is than v4's mitten (a gesture that puts the wrist on a target puts the fingers beyond it); where its mouth is from the head bone;
 * and how far below the neck socket a scarf must sit to be at its neck (the Meshy chin is lower than v4's: at the socket it covers the mouth).
 */
export interface BodyFit { scale: number; sitLift: number; handExtra: number; mouth: { fwd: number; up: number }; scarfDrop: number }
export const BODY_FIT: Record<BodyId, BodyFit> = {
  v4: { scale: 1, sitLift: 0, handExtra: 0, mouth: { fwd: 0.13, up: 0.02 }, scarfDrop: 0 },
  meshy_m: { scale: 1, sitLift: 0.03, handExtra: 0.08, mouth: { fwd: 0.114, up: -0.023 }, scarfDrop: 0.08 },
  meshy_f: { scale: 0.93, sitLift: 0, handExtra: 0.08, mouth: { fwd: 0.152, up: 0.008 }, scarfDrop: 0.115 },
};
export async function preloadBody(id: Exclude<BodyId, 'v4'>, url: string): Promise<boolean> {
  try {
    const res = await fetch(url);
    if (!res.ok) return false;
    bodies[id] = finishTemplate(await new GLTFLoader().parseAsync(await res.arrayBuffer(), ''), BODY_FIT[id].sitLift, BODY_FIT[id]);
    return true;
  } catch { return false; }
}
export const bodyReady = (id: BodyId) => id === 'v4' ? !!template : !!bodies[id];
export function dropBody(id: Exclude<BodyId, 'v4'>) { delete bodies[id]; }

export async function preloadHumanoid(base = import.meta.env.BASE_URL): Promise<void> {
  try {
    let buf: ArrayBuffer | null = null;
    const res = await fetch(`${base}assets/character_v4.glb`).catch(() => null);
    if (res?.ok) buf = await res.arrayBuffer();
    else {
      // Hosts that do not serve .glb (e.g. the claude.ai preview) get the same bytes as base64 JSON.
      const alt = await fetch(`${base}assets/character_v4.glb.json`).catch(() => null);
      if (!alt?.ok) return;
      const bin = atob(((await alt.json()) as { glb: string }).glb);
      const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      buf = u8.buffer;
    }
    const gltf = await new GLTFLoader().parseAsync(buf, '');
    joinNeck(gltf.scene);                                    // the head joined to the body (src/actors/neckJoin.ts)
    fitEyes(gltf.scene);                                     // the iris lenses sit in the eye whites, not in front of them
    reshapeCharacter(gltf.scene);                            // shorter neck, oval face with a jaw (src/actors/proportions.ts)
    template = finishTemplate(gltf);
  } catch { /* box characters stay in use */ }
}

/** The steps every body shares once its head is dealt with: the clips corrected, derived and stripped (the poses solved from the rest pose). */
function finishTemplate(gltf: GLTF, sitLift = 0, body?: { scale: number }): Template {
  fixSitKnees(gltf.animations);
  fixRunClip(gltf.animations);
  deriveJog(gltf.animations);
  widenWalk(gltf.animations);
  deriveKneel(gltf.animations);
  const clips = [...gltf.animations, ...buildPoseClips(gltf.scene, gltf.animations, body)];
  if (sitLift) for (const c of clips) if (c.name === 'Sit' || c.name === 'SitFloor' || c.name === 'Lie' || c.name === 'Kneel') for (const t of c.tracks) if (t.name === 'root.position') for (let i = 1; i < t.values.length; i += 3) t.values[i] += sitLift;   // (the hips' own position is in the root's turned frame: up is its z)
  if (body) rollPalmsInClips(gltf.scene, clips, ['Sit', 'Kneel']);
  stripStaticTracks(gltf.scene, clips);
  return { scene: gltf.scene, clips };
}

/**
 * Drops the position and scale tracks that hold the bone's rest value in every clip. The GLB keys all 20 bones'
 * translation, rotation and scale in all its clips, but only the root and the hips ever move: the other 38 position and
 * scale tracks repeat the rest pose, and the mixer evaluated and blended them for every body, every frame. Without them
 * the bones keep their rest values (the same pose). Rotation tracks are all kept: the gait (src/actors/gaitRig.ts) and the
 * strike rig (src/lamb/strikeRig.ts) turn bones after the mixer and rely on it to set them back each frame. A track some
 * clip moves (the hips, the root in Kneel) is kept in every clip. Returns how many tracks were dropped.
 */
export function stripStaticTracks(scene: THREE.Object3D, clips: THREE.AnimationClip[], eps = 1e-5): number {
  const keep = new Set<string>();
  for (const c of clips) for (const t of c.tracks) {
    const dot = t.name.lastIndexOf('.'), node = t.name.slice(0, dot), prop = t.name.slice(dot + 1);
    if (prop !== 'position' && prop !== 'scale') { keep.add(t.name); continue; }
    const o = scene.getObjectByName(node), rest = o ? (prop === 'position' ? o.position : o.scale).toArray() : null;
    const n = t.getValueSize(), v = t.values;
    let still = !!rest && n === 3;
    for (let i = 0; still && i < v.length; i++) if (Math.abs(v[i] - rest![i % n]) > eps) still = false;
    if (!still) keep.add(t.name);
  }
  let dropped = 0;
  for (const c of clips) {
    const before = c.tracks.length;
    c.tracks = c.tracks.filter(t => keep.has(t.name));
    dropped += before - c.tracks.length;
  }
  return dropped;
}

/**
 * The exported Sit action flexes the knees the wrong way: with the thighs level, the shins point up along the
 * chest instead of hanging to the ground. Mirror the shin rotation (−X → +X about the knee) so the feet rest on
 * the ground in front of the seat. Only applies while the shins still bend the wrong way, so it becomes a no-op
 * once the Blender action is corrected and re-exported.
 */
export function fixSitKnees(clips: THREE.AnimationClip[]) {
  const sit = clips.find(c => c.name === 'Sit'); if (!sit) return;
  for (const track of sit.tracks) {
    if (!/^shin\.?[LR]\.quaternion$/.test(track.name)) continue;
    const v = track.values;
    let backward = true;
    for (let i = 0; i < v.length; i += 4) if (v[i] > -0.3) backward = false;
    if (!backward) continue;
    for (let i = 0; i < v.length; i += 4) { v[i] = -v[i]; v[i + 1] = -v[i + 1]; v[i + 2] = -v[i + 2]; }
  }
}

/**
 * The exported Run action bends the knees the wrong way (like Sit's: the shins rotate −X about the knee, so the legs
 * fold backwards like a bird's) and leans the trunk back. Mirror those rotations. The gait (src/actors/gait.ts) drives
 * the legs and the trunk whenever the body moves, so this only shows in the short cross-fades with held poses; a no-op
 * once the Blender action is corrected and re-exported.
 */
export function fixRunClip(clips: THREE.AnimationClip[]) {
  const run = clips.find(c => c.name === 'Run'); if (!run) return;
  for (const track of run.tracks) {
    if (!/^(shin\.?[LR]|spine|chest)\.quaternion$/.test(track.name)) continue;
    const v = track.values;
    let backward = true;
    for (let i = 0; i < v.length; i += 4) if (v[i] > -0.02) backward = false;
    if (!backward) continue;
    for (let i = 0; i < v.length; i += 4) { v[i] = -v[i]; v[i + 1] = -v[i + 1]; v[i + 2] = -v[i + 2]; }
  }
}

/** A quaternion track's swing about its mean turned by `k` (1: as it is, 0: held at the mean); in place. Allocation at load only. */
function scaleSwing(values: ArrayLike<number> & { [i: number]: number }, k: number) {
  const n = values.length / 4, out = new THREE.Quaternion(), mean = new THREE.Quaternion(), q = new THREE.Quaternion(), ref = new THREE.Quaternion(values[0], values[1], values[2], values[3]);
  let x = 0, y = 0, z = 0, w = 0;
  for (let i = 0; i < n; i++) { q.set(values[4 * i], values[4 * i + 1], values[4 * i + 2], values[4 * i + 3]); if (q.dot(ref) < 0) { q.x = -q.x; q.y = -q.y; q.z = -q.z; q.w = -q.w; } x += q.x; y += q.y; z += q.z; w += q.w; }
  mean.set(x, y, z, w).normalize();
  for (let i = 0; i < n; i++) {
    q.set(values[4 * i], values[4 * i + 1], values[4 * i + 2], values[4 * i + 3]); if (q.dot(ref) < 0) { q.x = -q.x; q.y = -q.y; q.z = -q.z; q.w = -q.w; }
    out.copy(mean).slerp(q, k); q.copy(out);
    values[4 * i] = q.x; values[4 * i + 1] = q.y; values[4 * i + 2] = q.z; values[4 * i + 3] = q.w;
  }
}
/**
 * The far body (beyond the gait's reach, ANIM_LOD) plays the clips alone: at a jog the Run clip's legs and arms swing far
 * wider than the computed gait's (foot spread 1.06 m against 0.69), so bodies would change stride as they cross 30 m. 'Jog' is
 * the Run clip with the swing of the thighs, shins and arms turned down to the jog's.
 */
export function deriveJog(clips: THREE.AnimationClip[]) {
  const run = clips.find(c => c.name === 'Run'); if (!run || clips.some(c => c.name === 'Jog')) return;
  const jog = run.clone(); jog.name = 'Jog';
  for (const t of jog.tracks) {
    const m = /^(thigh|shin|upper_arm|forearm)\.?[LR]\.quaternion$/.exec(t.name); if (!m) continue;
    scaleSwing(t.values, m[1] === 'thigh' ? 0.5 : m[1] === 'shin' ? 0.68 : 0.6);
  }
  clips.push(jog);
}
/** The Walk clip's thighs swing a little less than the gait's step needs (foot spread 0.52 m against about 0.64): widened to match. */
export function widenWalk(clips: THREE.AnimationClip[]) {
  const walk = clips.find(c => c.name === 'Walk'); if (!walk) return;
  for (const t of walk.tracks) if (/^thigh\.?[LR]\.quaternion$/.test(t.name)) scaleSwing(t.values, 1.2);
}

// ---------------------------------------------------------------- poses built in code (home and social life)
/**
 * Character space: origin on the surface under the hips, +z forward (toes), +x the character's left, +y up.
 * Each pose gives the hips' height and orientation, and the direction each bone points to (its +Y axis, head to
 * tail); bones without a direction keep their rest orientation relative to their parent. Heights are chosen so
 * the body rests ON the surface the origin stands on: a mattress (Lie, head on the pillow), a mat, rug or floor
 * cushion (SitFloor). Seats carry them in Seat.clip with top = surface + SIT_HIPS (src/interact/seats.ts floorSeatTop).
 * Ride keeps the chair convention (origin SIT_HIPS under the saddle, like Sit): astride a motorbike, hands on the
 * grips and feet on the pegs of the vehicle kit's 125 cc (spec.controls.grips / pegs).
 */
interface PoseDef { hipsY: number; hipsZ?: number; hips: [number, number, number]; aim: Record<string, [number, number, number]>;
  /** Where the palm faces (character space), for a body whose hand has a palm (buildPoseClips `palm`): the hand is rolled about its own axis to it. v4's mitten has none. */
  palm?: Record<string, [number, number, number]>;
  /** Where the hands hold on (character space, for a body of scale 1): for a body whose hand has a palm, the arms are solved (two bones, elbow towards `pole`)
   * so that the middle of the palm — `along` metres from the wrist, `lift` above the palm's skin — is on the grip, not the wrist as v4's mitten has it. */
  reach?: { L: [number, number, number]; R: [number, number, number]; along: number; lift: number; pole: [number, number, number] } }
export const POSES: Record<PoseClip, PoseDef> = {
  // on the back, head towards −z on the pillow, one knee raised, hands resting on the belly
  Lie: {
    hipsY: 0.13, hips: [-Math.PI / 2, 0, 0],
    aim: {
      spine: [0, 0, -1], chest: [0, 0.08, -1], neck: [0, 0.35, -1], head: [0, 0.4, -1],
      upper_armL: [0.26, -0.04, 1], forearmL: [-0.8, 0.45, 0.4], handL: [-0.6, 0.2, 0.75],
      upper_armR: [-0.26, -0.04, 1], forearmR: [0.8, 0.45, 0.4], handR: [0.6, 0.2, 0.75],
      thighL: [0.12, 0.3, 1], shinL: [0.04, -0.33, 1], footL: [0.12, 0.95, 0.28],
      thighR: [-0.08, 0, 1], shinR: [-0.03, 0, 1], footR: [-0.15, 0.95, 0.25],
    },
    palm: { handL: [0, -1, 0], handR: [0, -1, 0] },   // resting on the belly
  },
  // cross-legged on a mat, rug or cushion (attaya circles, floor seats), hands on the knees
  SitFloor: {
    hipsY: 0.14, hips: [0, 0, 0],
    aim: {
      spine: [0, 1, 0.1], chest: [0, 1, 0.12], neck: [0, 1, 0.06], head: [0, 1, 0],
      thighL: [0.72, -0.05, 0.69], shinL: [-0.92, -0.06, 0.33], footL: [-0.75, -0.25, 0.3],
      thighR: [-0.72, -0.05, 0.69], shinR: [0.92, 0.04, 0.2], footR: [0.75, -0.3, 0.2],
      upper_armL: [0.27, -0.88, 0.42], forearmL: [0.39, -0.83, 0.39], handL: [0.2, -0.5, 0.85],
      upper_armR: [-0.27, -0.88, 0.42], forearmR: [-0.39, -0.83, 0.39], handR: [-0.2, -0.5, 0.85],
    },
    palm: { handL: [0, -1, 0], handR: [0, -1, 0] },   // flat on the knees
  },
  // astride a two-wheeler: leaning forward, hands on the handlebar grips, knees against the tank, feet on the pegs
  Ride: {
    hipsY: 0.5, hips: [0, 0, 0],
    aim: {
      spine: [0, 1, 0.3], chest: [0, 1, 0.35], neck: [0, 1, 0.2], head: [0, 1, 0.05],
      upper_armL: [0.27, -0.68, 0.68], forearmL: [0.24, -0.64, 0.73], handL: [0.1, -0.3, 1],
      upper_armR: [-0.27, -0.68, 0.68], forearmR: [-0.24, -0.64, 0.73], handR: [-0.1, -0.3, 1],
      thighL: [0.2, -0.35, 0.91], shinL: [-0.05, -0.9, -0.43], footL: [0.05, -0.2, 1],
      thighR: [-0.2, -0.35, 0.91], shinR: [0.05, -0.9, -0.43], footR: [-0.05, -0.2, 1],
    },
    palm: { handL: [0, -1, 0], handR: [0, -1, 0] },   // over the grips, the fingers round them
    reach: { L: [0.36, 0.66, 0.55], R: [-0.36, 0.66, 0.55], along: 0.085, lift: 0.03, pole: [0.5, -1, -0.1] },   // the 125 cc's grips (vehicleSpec controls.grips relative to the driver's seat)
  },
};

/** Where each hand's palm faces in the bone's own frame: at rest the palm of a body that has one turns to the thigh (the fitted frame of scripts/meshy/relax-hand.mjs). Needs the scene at rest. */
function restPalms(scene: THREE.Object3D) {
  scene.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(scene.matrixWorld).invert(), out = new Map<string, THREE.Vector3>();
  for (const side of ['L', 'R']) {
    const hand = scene.getObjectByName(`hand${side}`); if (!hand) continue;
    const q = new THREE.Quaternion(); new THREE.Matrix4().multiplyMatrices(inv, hand.matrixWorld).decompose(new THREE.Vector3(), q, new THREE.Vector3());
    const along = new THREE.Vector3(0, 1, 0).applyQuaternion(q), inward = new THREE.Vector3(side === 'L' ? -1 : 1, 0, 0);
    out.set(`hand${side}`, inward.sub(along.multiplyScalar(inward.dot(along))).normalize().applyQuaternion(q.clone().invert()));
  }
  return out;
}

/**
 * Clips made for v4's mitten (Sit, Kneel: hands on the thighs) turn a hand that has a palm face up. Rolls the forearm and the hand, half each, about their own
 * axes so the palm faces `want` (character space) at the clip's first frame; every keyframe gets the same roll. The scene is left as it was found.
 */
function rollPalmsInClips(scene: THREE.Object3D, clips: THREE.AnimationClip[], names: string[], want = new THREE.Vector3(0, -1, 0)) {
  const rest = restPalms(scene), bones: THREE.Object3D[] = [];
  scene.traverse(o => bones.push(o));
  const saved = bones.map(o => [o.position.clone(), o.quaternion.clone(), o.scale.clone()] as const);
  const inv = new THREE.Matrix4().copy(scene.matrixWorld).invert(), roll: Record<string, number> = {};
  for (const clip of clips.filter(c => names.includes(c.name))) {
    const mixer = new THREE.AnimationMixer(scene); mixer.clipAction(clip).play(); mixer.setTime(0); scene.updateMatrixWorld(true);
    for (const side of ['L', 'R']) {
      const hand = scene.getObjectByName(`hand${side}`), pl = rest.get(`hand${side}`); if (!hand || !pl) continue;
      const q = new THREE.Quaternion(); new THREE.Matrix4().multiplyMatrices(inv, hand.matrixWorld).decompose(new THREE.Vector3(), q, new THREE.Vector3());
      roll[`${clip.name}|${side}`] = palmAngle(q, pl, want);
    }
    mixer.stopAllAction(); mixer.uncacheRoot(scene);
  }
  bones.forEach((o, i) => { o.position.copy(saved[i][0]); o.quaternion.copy(saved[i][1]); o.scale.copy(saved[i][2]); }); scene.updateMatrixWorld(true);
  for (const clip of clips) for (const t of clip.tracks) {
    const m = /^(forearm|hand)([LR])\.quaternion$/.exec(t.name), a = m && roll[`${clip.name}|${m[2]}`];
    if (!m || !a) continue;
    const r = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a / 2), q = new THREE.Quaternion(), v = t.values as unknown as number[];
    for (let i = 0; i < v.length; i += 4) { q.set(v[i], v[i + 1], v[i + 2], v[i + 3]).multiply(r); v[i] = q.x; v[i + 1] = q.y; v[i + 2] = q.z; v[i + 3] = q.w; }
  }
}

/** The angle (rad) about the bone's own axis (+Y of world orientation `w`) that brings its palm (the bone-local vector `palmLocal`) to face `want` as nearly as that allows. */
function palmAngle(w: THREE.Quaternion, palmLocal: THREE.Vector3, want: THREE.Vector3): number {
  const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(w).normalize(), flat = (v: THREE.Vector3) => v.clone().sub(axis.clone().multiplyScalar(v.dot(axis)));
  const a = flat(palmLocal.clone().applyQuaternion(w)), b = flat(want.clone().normalize());
  if (a.lengthSq() < 1e-8 || b.lengthSq() < 1e-8) return 0;
  return Math.atan2(axis.dot(new THREE.Vector3().crossVectors(a, b)), a.dot(b));
}
/** `w` turned about its own axis by `angle`. */
const rolled = (w: THREE.Quaternion, angle: number) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0).applyQuaternion(w).normalize(), angle).multiply(w);

/**
 * One-frame clips for POSES, solved from the rest pose of `scene` (the rig as GLTFLoader gives it). Every track of
 * `like` (an existing clip, so cross-fades cover every bone) gets a value: the posed rotation where the pose aims the
 * bone, the rest value otherwise; the hips also get their position.
 */
export function buildPoseClips(scene: THREE.Object3D, clips: THREE.AnimationClip[], body?: { scale: number }): THREE.AnimationClip[] {
  const palm = !!body;
  const like = clips.find(c => c.name === 'Idle') ?? clips[0];
  const rootBone = scene.getObjectByName('root'), hipsBone = scene.getObjectByName('hips');
  if (!like || !rootBone || !hipsBone) return [];
  scene.updateMatrixWorld(true);
  const sceneInv = new THREE.Matrix4().copy(scene.matrixWorld).invert();
  const inScene = (o: THREE.Object3D) => { const m = new THREE.Matrix4().multiplyMatrices(sceneInv, o.matrixWorld), q = new THREE.Quaternion(); m.decompose(new THREE.Vector3(), q, new THREE.Vector3()); return q; };
  const Y = new THREE.Vector3(0, 1, 0);
  const restPalm = palm ? restPalms(scene) : new Map<string, THREE.Vector3>();
  const restPos = (o: THREE.Object3D) => new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().multiplyMatrices(sceneInv, o.matrixWorld));
  const restLen = (a: string, b: string) => { const A = scene.getObjectByName(a), B = scene.getObjectByName(b); return A && B ? restPos(A).distanceTo(restPos(B)) : 0.27; };
  const L1 = restLen('upper_armL', 'forearmL'), L2 = restLen('forearmL', 'handL');
  return (Object.keys(POSES) as PoseClip[]).map(name => {
    const def = POSES[name];
    const pos = new Map<THREE.Object3D, THREE.Vector3>([[hipsBone, new THREE.Vector3(0, def.hipsY, def.hipsZ ?? 0)]]);
    const ikAim = new Map<string, THREE.Vector3>();
    const world = new Map<THREE.Object3D, THREE.Quaternion>(), local = new Map<THREE.Object3D, THREE.Quaternion>();
    const parentQ = inScene(hipsBone.parent!);
    const hq = new THREE.Quaternion().setFromEuler(new THREE.Euler(...def.hips, 'XYZ'));
    world.set(hipsBone, hq); local.set(hipsBone, parentQ.clone().invert().multiply(hq));
    const visit = (o: THREE.Object3D) => {
      for (const c of o.children) {
        const pw = world.get(o)!;
        let w = pw.clone().multiply(c.quaternion);
        const cp = pos.get(o)!.clone().add(c.position.clone().normalize().multiplyScalar(restPos(o).distanceTo(restPos(c))).applyQuaternion(pw));
        pos.set(c, cp);
        if (palm && def.reach && /^upper_arm[LR]$/.test(c.name)) {
          // two-bone solve of the arm to the grip (see PoseDef.reach)
          const side = c.name.slice(-1), r = def.reach, k = body!.scale, sgn = side === 'L' ? 1 : -1;
          const hand = new THREE.Vector3(...def.aim[`hand${side}`]).normalize(), grip = new THREE.Vector3(...r[side as 'L' | 'R']).divideScalar(k);
          const wrist = grip.add(new THREE.Vector3(0, r.lift, 0)).addScaledVector(hand, -r.along);
          const u = wrist.clone().sub(cp), d = Math.min(Math.max(u.length(), Math.abs(L1 - L2) + 1e-3), L1 + L2 - 1e-3); u.normalize();
          const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d), hgt = Math.sqrt(Math.max(0, L1 * L1 - a * a));
          const pole = new THREE.Vector3(r.pole[0] * sgn, r.pole[1], r.pole[2]); pole.addScaledVector(u, -pole.dot(u)).normalize();
          const elbow = cp.clone().addScaledVector(u, a).addScaledVector(pole, hgt);
          ikAim.set(c.name, elbow.clone().sub(cp).normalize()); ikAim.set(`forearm${side}`, cp.clone().addScaledVector(u, d).sub(elbow).normalize());
        }
        const fixed = def.aim[c.name], aim = ikAim.get(c.name) ?? (fixed ? new THREE.Vector3(...fixed).normalize() : null);
        if (aim) w = new THREE.Quaternion().setFromUnitVectors(Y.clone().applyQuaternion(w), aim).multiply(w);
        const want = palm ? def.palm?.[c.name] : undefined;
        if (want) w = rolled(w, palmAngle(w, restPalm.get(c.name)!, new THREE.Vector3(...want)));
        else if (palm && /^forearm[LR]$/.test(c.name) && def.palm) {
          // the forearm takes half of the roll the hand will need, so the wrist is not wrung by all of it
          const hand = c.children.find(k => k.name === `hand${c.name.slice(-1)}`), hAim = hand && def.aim[hand.name], hWant = hand && def.palm[hand.name];
          if (hand && hAim && hWant) {
            let hw = w.clone().multiply(hand.quaternion);
            hw = new THREE.Quaternion().setFromUnitVectors(Y.clone().applyQuaternion(hw), new THREE.Vector3(...hAim).normalize()).multiply(hw);
            w = rolled(w, palmAngle(hw, restPalm.get(hand.name)!, new THREE.Vector3(...hWant)) / 2);
          }
        }
        world.set(c, w); local.set(c, pw.clone().invert().multiply(w));
        visit(c);
      }
    };
    visit(hipsBone);
    // hips position: in its parent's space, at (0, hipsY, hipsZ) in character space
    const hp = new THREE.Vector3(0, def.hipsY, def.hipsZ ?? 0).applyMatrix4(scene.matrixWorld);
    hipsBone.parent!.worldToLocal(hp);
    const tracks = like.tracks.map(t => {
      const [node, prop] = [t.name.slice(0, t.name.lastIndexOf('.')), t.name.slice(t.name.lastIndexOf('.') + 1)];
      const o = scene.getObjectByName(node);
      if (prop === 'quaternion') return new THREE.QuaternionKeyframeTrack(t.name, [0], (o && local.get(o) ? local.get(o)! : o?.quaternion ?? new THREE.Quaternion()).toArray());
      if (prop === 'position' && o) return new THREE.VectorKeyframeTrack(t.name, [0], (o === hipsBone ? hp : o.position).toArray());
      if (prop === 'scale' && o) return new THREE.VectorKeyframeTrack(t.name, [0], o.scale.toArray());
      // anything else (morph weights…): hold the clip's first value
      const n = t.getValueSize(), T = t.constructor as new (name: string, times: number[], values: number[]) => THREE.KeyframeTrack;
      return new T(t.name, [0], Array.from(t.values.slice(0, n)));
    });
    return new THREE.AnimationClip(name, 1, tracks);
  });
}

/**
 * 'Kneel' (derived at load, no Blender export needed): seated on the heels on the floor — knees down in front, shins
 * flat behind, the top of the feet on the ground, back straight, head slightly bowed, hands on the thighs (arms of the
 * corrected Sit). Used by floor places (prayer rows, mats): the origin stays on the floor, the hips about 0.3 m above it.
 * Angles: thigh 119° about X from the hips (29° below horizontal), knee 151° (shin pointing back), foot −6°.
 */
export const KNEEL_HIPS = 0.3;
export function deriveKneel(clips: THREE.AnimationClip[]) {
  if (clips.some(c => c.name === 'Kneel')) return;
  const sit = clips.find(c => c.name === 'Sit'); if (!sit) return;
  const kneel = sit.clone(); kneel.name = 'Kneel';
  const rx = (deg: number) => [Math.sin((deg * Math.PI) / 360), 0, 0, Math.cos((deg * Math.PI) / 360)];
  const pose: [RegExp, number[]][] = [
    [/^root\.position$/, [0, KNEEL_HIPS - 0.95, 0]],                 // hips joint 0.95 m above the root at rest
    [/^thigh\.?[LR]\.quaternion$/, rx(119)], [/^shin\.?[LR]\.quaternion$/, rx(151)], [/^foot\.?[LR]\.quaternion$/, rx(-6)],
    [/^spine\.quaternion$/, rx(4)], [/^neck\.quaternion$/, rx(6)], [/^head\.quaternion$/, rx(6)],
  ];
  for (const track of kneel.tracks) {
    const hit = pose.find(([re]) => re.test(track.name)); if (!hit) continue;
    const v = hit[1], n = v.length;
    const values = new Float32Array(track.values.length);
    for (let i = 0; i < values.length; i++) values[i] = v[i % n];
    track.values = values;
  }
  clips.push(kneel);
}

// ---------------------------------------------------------------- fabric textures (generic prints, own designs)
const fabricCache = new Map<string, THREE.Texture>();
function fabric(base: number, accent: number, pattern: Pattern): THREE.Texture | null {
  if (pattern === 'uni' || pattern === 'bazin') return null;
  const key = `${base}/${accent}/${pattern}`;
  const hit = fabricCache.get(key); if (hit) return hit;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
  g.fillStyle = hex(base); g.fillRect(0, 0, 64, 64);
  g.fillStyle = hex(accent); g.strokeStyle = hex(accent);
  if (pattern === 'wax') {           // bold circles and diamonds, a generic wax-style print
    for (let y = 0; y < 64; y += 16) for (let x = (y / 16) % 2 ? 8 : 0; x < 64; x += 16) { g.beginPath(); g.arc(x + 4, y + 8, 5, 0, Math.PI * 2); g.fill(); }
    g.lineWidth = 2; for (let x = 0; x < 64; x += 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 8, 8); g.lineTo(x, 16); g.stroke(); }
  } else if (pattern === 'rayure') { for (let x = 0; x < 64; x += 12) g.fillRect(x, 0, 4, 64); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 3); t.flipY = false; fabricCache.set(key, t); return t;
}
export function clothMat(color: number, pattern: Pattern = 'uni', accent = 0xffffff): THREE.Material {
  // Double-sided like the Blender materials: some cloth faces point inward and would otherwise vanish.
  if (pattern === 'bazin') return new THREE.MeshStandardMaterial({ color, roughness: 0.38, metalness: 0.05, side: THREE.DoubleSide }); // bazin's sheen
  const map = fabric(color, accent, pattern);
  return new THREE.MeshLambertMaterial({ color: map ? 0xffffff : color, map, side: THREE.DoubleSide });
}

/** Clips that mean « on foot »: held by remote avatars and walking roles, they get the computed gait like a free body. */
const LOCOMOTION: ReadonlySet<string> = new Set<Clip>(['Idle', 'Walk', 'Jog', 'Run']);

// ---------------------------------------------------------------- animation level of detail
/**
 * How much animation work a body gets from where the camera is (docs/PERF_EVENING.md). Close to the camera and in view:
 * all of it, every frame — the mixer, and on foot the computed gait (src/actors/gait.ts). Farther, or out of the view,
 * or hidden (by its owner, or swapped for a far figure by the shared humanoid budget, src/actors/crowdLod.ts): the
 * Walk, Run and Idle clips as they played before the gait, the mixer at a lower rate (its time accumulates, so loops
 * and cross-fades keep their pace). A body whose bones are turned after the mixer by another rig (the strike rig of a
 * bout avec frappe) sets `fullRate` and always gets every frame.
 */
export const ANIM_LOD = {
  /** The gait within this distance of the camera (m); a body leaving it keeps the gait to `gaitNear + gaitSlack`. */
  gaitNear: 30, gaitSlack: 4,
  /** Beyond this distance (m) a body in view is « far ». */
  farFrom: 60,
  /**
   * Mixer updates a second: in view between gaitNear and farFrom, in view beyond farFrom, out of view (its shadow may
   * still show on medium and high), hidden (nothing of it is drawn: the far figure standing in for it only needs to
   * know whether it sits).
   */
  mid: 20, far: 10, unseen: 5, hidden: 2,
} as const;
/** The rig's bones under a body's skinned scene (what the mixer poses). */
function boneList(root: THREE.Object3D) { const out: THREE.Object3D[] = []; root.traverse(o => { if ((o as THREE.Bone).isBone) out.push(o); }); return out; }
/** The camera of the frame (set by main.ts before the modules update; `on` false: every body animated in full). */
const view = { on: false, x: 0, y: 0, z: 0, frustum: new THREE.Frustum(), shadows: true };
/**
 * Whether the frame has a shadow pass (medium and high). Without it (the phone preset) a body out of the camera's view can
 * be seen by nobody, and is animated like a hidden one; with it its shadow may still fall in the view.
 */
export function setAnimShadows(on: boolean) { view.shadows = on; }
let madeHumanoids = 0;
const _viewM = new THREE.Matrix4(), _bodyS = new THREE.Sphere();
/** The squared distance from the camera of the body `animLod` just looked at when it is drawn and in view, else −1. */
let seenD2 = -1;
/**
 * The details of a face (the eyes, the brows, the lips: four meshes, four draw calls on a body that otherwise costs six)
 * are shown to a body within this distance of the camera (m) and put away beyond it plus FACE_SLACK: at 14 m they are
 * a pixel or two tall (the eye whites are 11 cm wide). The head stays, in its skin. Bodies animated at every frame
 * whatever their distance (the player's, the wrestlers of a strike rig: `fullRate`) keep them.
 */
export const FACE_NEAR = 14, FACE_SLACK = 1.5;
/**
 * The camera as it was last rendered (its matrices are up to date after the render): the bodies' animation detail this
 * frame. Null switches the level of detail off.
 */
export function setHumanoidView(camera: THREE.Camera | null) {
  if (!camera) { view.on = false; return; }
  camera.updateMatrixWorld();                                                // (the frames the debug steps without drawing)
  _viewM.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  view.frustum.setFromProjectionMatrix(_viewM);
  const e = camera.matrixWorld.elements;
  view.x = e[12]; view.y = e[13]; view.z = e[14]; view.on = true;
}
/**
 * The detail for a body at world (x, y, z) of scale `k`, drawn or not: 0 for everything every frame, else the mixer's
 * rate (updates a second) without the gait. `near`: it had the gait last frame (it keeps it a little farther).
 */
export function animLod(x: number, y: number, z: number, k: number, drawn: boolean, near: boolean): number {
  seenD2 = -1;
  if (!view.on) return 0;
  if (!drawn) return ANIM_LOD.hidden;
  _bodyS.center.set(x, y + 0.95 * k, z); _bodyS.radius = 1.35 * k;                  // round the standing or seated body
  if (!view.frustum.intersectsSphere(_bodyS)) return view.shadows ? ANIM_LOD.unseen : ANIM_LOD.hidden;
  const dx = x - view.x, dy = y - view.y, dz = z - view.z, d2 = dx * dx + dy * dy + dz * dz;
  seenD2 = d2;
  const g = ANIM_LOD.gaitNear + (near ? ANIM_LOD.gaitSlack : 0);
  if (d2 < g * g) return 0;
  return d2 < ANIM_LOD.farFrom * ANIM_LOD.farFrom ? ANIM_LOD.mid : ANIM_LOD.far;
}

const SOCKET_NODE: Record<Socket, string> = { armL: 'socket_armL', armR: 'socket_armR', waist: 'socket_waist', neck: 'socket_neck' };
const CLOTH = ['Cloth_Tee', 'Cloth_Trousers', 'Cloth_Shorts', 'Cloth_Boubou', 'Cloth_DressTop', 'Cloth_Skirt', 'Cloth_Kufi', 'Cloth_Headwrap', 'Cloth_Shoes', 'Ngemb_A', 'Ngemb_B', 'Hair_Short', 'Hair_Puff', 'Beard'];

export class Humanoid {
  readonly group = new THREE.Group();
  private mixer: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  private root: THREE.Object3D;
  private parts = new Map<string, THREE.Mesh>();
  /** The meshes of the face's details (eyes, brows, lips) and whether they are shown (FACE_NEAR). */
  private face: THREE.Mesh[] = [];
  private faceOn = true;
  private skinMat: THREE.MeshLambertMaterial;
  private lipsMat = new THREE.MeshLambertMaterial({ color: 0x3a1a12 });
  private beardMat = new THREE.MeshLambertMaterial({ color: 0x1a1414 });
  private morphed: THREE.Mesh[] = [];
  private accessoryMeshes: THREE.Object3D[] = [];
  clipName: Clip | null = null;
  /** When set, city movement does not change the clip (emotes, talking, sitting). Idle, Walk and Run are not held: the gait runs. */
  hold: Clip | null = null;
  /** On foot: the computed gait (src/actors/gait.ts) and its weight (0 while a pose is held). */
  private gait: GaitState | null = null;
  private gaitRig: GaitRig | null | undefined;
  private gaitW = 1;
  /** Every frame in full whatever the distance (ANIM_LOD): the player's own body, the wrestlers of a bout avec frappe. */
  fullRate = false;
  /**
   * Animation level of detail: time the mixer still owes (s), time left before its next update in a slower tier, the
   * gait in use last frame, the ground speed measured. On a frame without a mixer update the bones are set back to the
   * mixer's last pose (`saved`): owners that turn a bone over the clip after `animate` (an apprentice's arm on the grab
   * bar, the stands' clapping, the traffic agent's sweeping arm) start from the clip's pose every frame, as with the
   * mixer, and never add up their turns.
   */
  private lag = 0; private due = 0;
  private near = true;
  private bones: THREE.Object3D[] | null = null;
  private saved: Float64Array | null = null;
  /** Its place in the slower tiers' rhythm (0–1), so that bodies made together do not all update on the same frame. */
  private phase = (madeHumanoids++ * 0.618034) % 1;
  private lx = NaN; private lz = NaN; private v = 0;
  /**
   * Hidden (ANIM_LOD.hidden), a body's pose matters only through whether it sits (the far figure standing in for it): once the
   * mixer has set the pose of the clip it plays, with the cross-fade over, the bones hold it, and the mixer is not asked again
   * until the clip changes or the body is drawn again (it then gets all the time it owes in one update).
   */
  private settled = false; private sinceSwitch = 0;
  /**
   * Procedural gesture applied on top of the clip pose every frame (hand to mouth, comb, arms up…: src/actors/gesture.ts).
   * The mixer only writes a bone when the clip's value changed since the last frame (three's PropertyMixer), so a held
   * pose would keep what the overlay did and a relative gesture (a bend, a nod) would add up frame after frame: the pose
   * from before the overlay is put back first (see `withOverlay`).
   */
  overlay: ((h: Humanoid, dt: number) => void) | null = null;
  private underOverlay: Float64Array | null = null;

  /** The body drawn: the one asked for when it is loaded, else v4. */
  readonly body: BodyId;
  /** How this body's mesh differs from the rig (BODY_FIT); v4's own is all zeros. */
  readonly fit: BodyFit;

  constructor(look?: PersonLook, body: BodyId = 'v4') {
    const t = (body !== 'v4' ? bodies[body] : undefined) ?? template;
    if (!t) throw new Error('character asset not loaded');
    this.body = t === template ? 'v4' : body; this.fit = BODY_FIT[this.body];
    this.root = cloneSkinned(t.scene);
    this.group.add(this.root); this.group.name = 'humanoid_v2';
    this.skinMat = new THREE.MeshLambertMaterial({ color: 0x5b3420, side: THREE.DoubleSide });
    const hair = new THREE.MeshLambertMaterial({ color: 0x141011, side: THREE.DoubleSide });
    this.root.traverse(o => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true; m.frustumCulled = false;
      const key = CLOTH.find(n => m.name.startsWith(n));
      if (/^Head\w*_\d+$/.test(m.name)) this.face.push(m);
      if (m.morphTargetDictionary) this.morphed.push(m);
      const src = m.material as THREE.MeshStandardMaterial;
      if (key) { this.parts.set(key, m); if (key.startsWith('Hair_')) m.material = hair; if (key === 'Beard') m.material = this.beardMat; }
      else if (this.body !== 'v4' && src.map) m.material = new THREE.MeshLambertMaterial({ map: src.map, side: THREE.DoubleSide });   // a body that carries its own texture
      else if (src.name.startsWith('Skin')) m.material = this.skinMat;
      else if (src.name === 'Hair') m.material = hair;
      else if (src.name === 'Lips') m.material = this.lipsMat;
      else m.material = new THREE.MeshLambertMaterial({ color: src.color });   // eyes
    });
    this.mixer = new THREE.AnimationMixer(this.root);
    for (const c of t.clips) this.actions.set(c.name, this.mixer.clipAction(c));
    if (look) this.setLook(look);
    if (this.body !== 'v4') this.group.scale.setScalar(this.fit.scale);
  }

  /** A rig bone (`hand.R`, `forearm.R`, `upper_arm.R`, `head`, `chest`…) for props and gestures. */
  bone(name: string): THREE.Object3D | null { return this.root.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(name)) ?? null; }   // the loader drops the dots

  private show(names: string[]) { for (const [k, m] of this.parts) m.visible = names.includes(k); }
  private clearAccessories() { for (const a of this.accessoryMeshes) a.removeFromParent(); this.accessoryMeshes = []; }

  /** City clothing. */
  setLook(l: PersonLook) {
    this.clearAccessories();
    this.setSkin(l.skin);
    const vis = ['Cloth_Shoes'];
    const hair = l.hair ?? (l.female ? 'puff' : 'short');
    if (!l.hat && hair !== 'none') vis.push(hair === 'puff' ? 'Hair_Puff' : 'Hair_Short');
    if (l.beard != null) { vis.push('Beard'); this.beardMat.color.set(l.beard); }
    this.setShape(l.female ? 1 : 0, l.muscular ?? 0, l.heavy ?? 0);
    const set = (k: string, mat: THREE.Material) => { const m = this.parts.get(k); if (m) m.material = mat; vis.push(k); };
    if (l.style === 'boubou') { set('Cloth_Boubou', clothMat(l.top, l.pattern, l.accent)); set('Cloth_Trousers', clothMat(l.bottom ?? l.top, l.pattern === 'bazin' ? 'bazin' : 'uni')); }
    if (l.style === 'tee') { set('Cloth_Tee', clothMat(l.top, l.pattern, l.accent)); set('Cloth_Trousers', clothMat(l.bottom ?? 0x2b2f3a)); }
    if (l.style === 'dress') { const dm = clothMat(l.top, l.pattern ?? 'wax', l.accent ?? 0xf6e7c1); set('Cloth_DressTop', dm); set('Cloth_Skirt', dm); }
    if (l.hat === 'kufi') set('Cloth_Kufi', clothMat(l.hatColor ?? 0xf2f2ec));
    if (l.hat === 'headwrap') set('Cloth_Headwrap', clothMat(l.hatColor ?? l.top, l.pattern === 'wax' ? 'wax' : 'uni', l.accent ?? 0xf6e7c1));
    const shoes = this.parts.get('Cloth_Shoes'); if (shoes) shoes.material = clothMat(l.shoes ?? 0x3a2a1e);
    this.show(vis);
    if (this.body === 'v4') this.group.scale.set(l.female ? 0.96 : 1, l.female ? 0.95 : 1, l.female ? 0.96 : 1);
  }

  /** Body shape via morph targets shared by the body and every fitted garment. */
  setShape(female: number, muscular: number, heavy: number) {
    for (const m of this.morphed) {
      const d = m.morphTargetDictionary!, inf = m.morphTargetInfluences!;
      if (d.Female !== undefined) inf[d.Female] = female;
      if (d.Muscular !== undefined) inf[d.Muscular] = muscular;
      if (d.Heavy !== undefined) inf[d.Heavy] = heavy;
    }
  }
  private setSkin(c: number) {
    this.skinMat.color.set(c);
    this.lipsMat.color.set(c).multiplyScalar(0.62);
  }

  /** Wrestling attire: ngemb (cut A short, B long with knot) and accessories on sockets. Cosmetic only. */
  setWrestler(look: WrestlerLook, cut: 'A' | 'B' = 'A', skin?: number) {
    if (skin !== undefined) this.setSkin(skin);
    const tex = ngembTexture(look.ngembColor, look.ngembPattern).clone();
    tex.flipY = false; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(2, 1); tex.needsUpdate = true;
    const mat = new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide });
    const key = cut === 'A' ? 'Ngemb_A' : 'Ngemb_B';
    const m = this.parts.get(key); if (m) m.material = mat;
    this.show([key, 'Hair_Short']);
    this.setShape(0, 1, 0);
    this.clearAccessories();
    for (const id of look.accessories) {
      const a = ACCESSORIES.find(x => x.id === id); if (!a) continue;
      const node = this.root.getObjectByName(SOCKET_NODE[a.socket]); if (!node) continue;
      const g = a.socket === 'waist' ? new THREE.CylinderGeometry(0.21, 0.21, 0.05, 12) : a.socket === 'neck' ? new THREE.TorusGeometry(0.09, 0.016, 6, 12) : new THREE.CylinderGeometry(0.085, 0.085, 0.06, 10);
      const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: a.color }));
      if (a.socket === 'neck') mesh.rotation.x = Math.PI / 2;
      node.add(mesh); this.accessoryMeshes.push(mesh);
    }
    this.group.scale.setScalar(1.08);
  }

  play(name: Clip, fade = 0.2, offset = 0) {
    if (this.clipName === name) return;
    const next = this.actions.get(name); if (!next) return;
    this.settled = false; this.sinceSwitch = 0;
    next.reset();
    // A fall must stay on its final pose through the duel result, not stand up
    // at every loop boundary. Locomotion and all other held clips still loop.
    const once = name === 'Fall_Back';
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
    next.clampWhenFinished = once;
    next.timeScale = 1;
    if (offset) next.time = offset * next.getClip().duration;
    next.fadeIn(fade).play();
    this.current?.fadeOut(fade);
    this.current = next; this.clipName = name;
  }

  /**
   * City locomotion. On foot (no held pose) the gait is computed from the body's own motion — its group's position and
   * rotation.y, so call this after moving it — with `speed` (m/s) only saying whether the caller means a run: feet that
   * stay where they are put down, cadence and step from the ground speed (src/actors/gait.ts). The Idle, Walk and Run
   * clips stay underneath for the cross-fades with held poses (talking, sitting, emotes…), which the gait fades out for.
   */
  animate(dt: number, speed: number) {
    const b = (this.bones ??= boneList(this.root));
    const under = this.underOverlay;
    if (under) {                                                              // last frame's gesture off: the pose it was put on
      for (let i = 0, o = 0; i < b.length; i++, o += 7) { b[i].quaternion.set(under[o], under[o + 1], under[o + 2], under[o + 3]); b[i].position.set(under[o + 4], under[o + 5], under[o + 6]); }
      if (!this.overlay) this.underOverlay = null;
    }
    this.locomote(dt, speed);
    if (!this.overlay) return;
    const keep = (this.underOverlay ??= new Float64Array(b.length * 7));
    for (let i = 0, o = 0; i < b.length; i++, o += 7) {
      const q = b[i].quaternion, p = b[i].position;
      keep[o] = q.x; keep[o + 1] = q.y; keep[o + 2] = q.z; keep[o + 3] = q.w; keep[o + 4] = p.x; keep[o + 5] = p.y; keep[o + 6] = p.z;
    }
    this.overlay(this, dt);
  }

  private locomote(dt: number, speed: number) {
    const held = this.hold && !LOCOMOTION.has(this.hold) ? this.hold : null;
    const o = this.group.position;
    // the ground speed from the body's own motion (a jump is not a step): the clips' pace while the gait is not computed
    if (dt > 0) {
      const sx = o.x - this.lx, sz = o.z - this.lz, step = Math.sqrt(sx * sx + sz * sz);
      this.v = step < Math.max(0.5, 10 * dt) ? this.v + (step / dt - this.v) * Math.min(1, dt / 0.15) : 0;
    }
    this.lx = o.x; this.lz = o.z;
    // how much work this body gets (ANIM_LOD): where it was last drawn, seen or not
    const m = this.group.matrixWorld.elements, wasNear = this.near;
    const lod = this.fullRate ? 0 : animLod(m[12], m[13], m[14], this.group.scale.x, this.drawn(), wasNear);
    if (!this.fullRate && seenD2 >= 0) this.showFace(seenD2);
    if (lod === ANIM_LOD.unseen || lod === ANIM_LOD.hidden) this.gaitW = 0;  // nobody sees it go: no fade needed
    this.near = lod === 0;
    if (held) { this.play(held, 0.2); this.gaitW = Math.max(0, this.gaitW - dt / 0.2); }
    else if (lod === 0 || this.gaitW > 0) {
      const g = (this.gait ??= new GaitState());
      if (this.gaitW <= 0) g.reset(o.x, o.z, this.group.rotation.y, this.group.scale.x);        // back on foot from a held pose
      g.update(dt, o.x, o.z, this.group.rotation.y, this.group.scale.x, speed);
      if (g.moving) { this.play(g.run > 0.5 ? (g.v < 5.5 ? 'Jog' : 'Run') : 'Walk', 0.2); if (this.current) this.current.timeScale = (g.p.cadence / 2) * this.current.getClip().duration; }
      else this.play('Idle', 0.25);
      // in reach of the gait it fades in; out of it (far, out of view, hidden) it fades out, then the clips walk alone
      this.gaitW = lod === 0 ? Math.min(1, this.gaitW + dt / 0.2) : Math.max(0, this.gaitW - dt / 0.25);
    } else {
      // the clips alone, as they played before the gait: their pace from the caller's speed or the measured one
      const s = Math.max(speed, this.v);
      if (this.hold) this.play(this.hold, 0.2);
      else if (s > 3) { this.play(s < 5.5 ? 'Jog' : 'Run', 0.15); if (this.current) this.current.timeScale = (runCadence(s) / 2) * this.current.getClip().duration; }
      else if (s > 0.25) { this.play('Walk', 0.2); if (this.current) this.current.timeScale = (walkCadence(s) / 2) * this.current.getClip().duration; }   // the pace the gait keeps near: no change of stride at the LOD switch
      else this.play('Idle', 0.25);
    }
    // the mixer: every frame in full detail (and while the gait fades), else at the tier's rate with the time it owes
    this.lag += dt; this.sinceSwitch += dt;
    if (this.settled) {
      if (lod === ANIM_LOD.hidden) return;                                   // the pose it holds is the clip's; the time keeps adding up
      this.settled = false; this.due = 0;                                    // seen again: updated now, with all the time owed
    }
    if (lod !== 0 && this.gaitW <= 0) {
      if (wasNear) this.due = this.phase / lod;                              // just slowed down: now, then staggered with the others
      // not yet: the mixer's last pose (a hidden body is left as it is: its first update once drawn sets every bone)
      else if ((this.due -= dt) > 0) { if (lod !== ANIM_LOD.hidden) this.restorePose(); return; }
      else this.due = 1 / lod + Math.max(this.due, -0.5 / lod);
    }
    this.mixer.update(this.lag); this.lag = 0;
    if (lod === ANIM_LOD.hidden && this.sinceSwitch >= 0.3) this.settled = true;      // (0.3 s: longer than any cross-fade)
    if (lod !== 0) this.savePose();
    const w = this.gait ? this.gaitW * this.gait.stand : 0;
    if (w > 0) {
      if (this.gaitRig === undefined) this.gaitRig = GaitRig.from(this.root);
      this.gaitRig?.apply(this.gait!, w);
    }
  }
  /**
   * Back to the state of a body just made (its look aside: `setLook` dresses it again): no clip playing, no pose held, the
   * gait and the animation level of detail forgotten. For an owner that keeps spare bodies instead of cloning a new skinned
   * scene (2-8 ms) each time it needs one.
   */
  reset() {
    this.mixer.stopAllAction();                                              // (the bones go back to their rest values)
    this.current = null; this.clipName = null; this.hold = null;
    this.gait = null; this.gaitRig = undefined; this.gaitW = 1; this.fullRate = false;     // (the gait's rig takes its rest rotations again at its first use, as a new body's does)
    this.lag = 0; this.due = 0; this.near = true; this.settled = false; this.sinceSwitch = 0;
    this.lx = NaN; this.lz = NaN; this.v = 0; this.saved = null;
    this.faceOn = true; for (const m of this.face) m.visible = true;
    this.group.position.set(0, 0, 0); this.group.rotation.set(0, 0, 0);
  }
  /** The face's details for a body `d2` (squared m) from the camera: shown within FACE_NEAR, put away beyond FACE_NEAR + FACE_SLACK. */
  private showFace(d2: number) {
    const on = d2 < (this.faceOn ? FACE_NEAR + FACE_SLACK : FACE_NEAR) ** 2;
    if (on === this.faceOn) return;
    this.faceOn = on;
    for (const m of this.face) m.visible = on;
  }
  /** Whether the face's details are shown now (checks). */
  faceShown() { return this.faceOn; }
  /** Drawn as far as its owners are concerned: its skinned scene (a far figure may stand in for it), its group and every parent. */
  private drawn() {
    if (!this.root.visible) return false;
    for (let p: THREE.Object3D | null = this.group; p; p = p.parent) if (!p.visible) return false;
    return true;
  }
  /** Keeps the pose the mixer just set (the bones' rotations and positions). */
  private savePose() {
    const b = (this.bones ??= boneList(this.root)), s = (this.saved ??= new Float64Array(b.length * 7));
    for (let i = 0, o = 0; i < b.length; i++, o += 7) {                       // (field by field: toArray is megamorphic, slow)
      const q = b[i].quaternion, p = b[i].position;
      s[o] = q.x; s[o + 1] = q.y; s[o + 2] = q.z; s[o + 3] = q.w; s[o + 4] = p.x; s[o + 5] = p.y; s[o + 6] = p.z;
    }
  }
  /** Back to the pose the mixer last set: the bones an owner turned over it since are set back (the others are left alone). */
  private restorePose() {
    const b = this.bones, s = this.saved; if (!b || !s) return;
    for (let i = 0, o = 0; i < b.length; i++, o += 7) {
      const q = b[i].quaternion, p = b[i].position;
      if (q.x !== s[o] || q.y !== s[o + 1] || q.z !== s[o + 2] || q.w !== s[o + 3]) q.set(s[o], s[o + 1], s[o + 2], s[o + 3]);
      if (p.x !== s[o + 4] || p.y !== s[o + 5] || p.z !== s[o + 6]) p.set(s[o + 4], s[o + 5], s[o + 6]);
    }
  }
  /** The gait as computed this frame (checks: src/main.ts `__dakar.gait()`), or null while a pose is held. */
  gaitInfo() {
    const g = this.gait; if (!g || this.gaitW <= 0) return null;
    return {
      moving: g.moving, run: g.run, speed: g.v * this.group.scale.x, cadence: g.moving ? g.p.cadence : 0, step: g.moving ? g.p.step * this.group.scale.x : 0, duty: g.p.duty,
      phase: g.phase, steps: g.steps, settles: g.settles, pelvis: g.py, clip: this.clipName,
      feet: g.feet.map(f => ({ planted: f.planted, swing: f.swing, settle: f.settle, pitch: f.pitch, slipped: f.slipped })),
    };
  }
  /** Clips only (scenes that drive a body themselves): the gesture overlay still goes on top. */
  update(dt: number) { this.mixer.update(dt); this.overlay?.(this, dt); }
  dispose() { this.mixer.stopAllAction(); this.clearAccessories(); this.group.removeFromParent(); }
}

/** Wrestler: a humanoid in ngemb (used by arena and écurie scenes). */
/**
 * A wrestler on the sand (the bout, the preliminaries, the entrance ceremony, the écurie's scenes): always animated at
 * every frame (`fullRate`). From the far stands the ring is more than ANIM_LOD.gaitNear away, where a body would drop to
 * 20 mixer updates a second, and the wrestlers are what the player is watching: two to four bodies, a negligible cost.
 */
export class Wrestler extends Humanoid {
  constructor(skin = 0x5b3420) { super(); this.setWrestler({ ngembColor: 'blanc', ngembPattern: 'uni', accessories: [] }, 'A', skin); this.fullRate = true; }
  override reset() { super.reset(); this.fullRate = true; }
  setLook(look: PersonLook | WrestlerLook, cut: 'A' | 'B' = 'A') {
    if ('ngembColor' in look) this.setWrestler(look, cut); else super.setLook(look);
  }
}
export const wrestlerReady = humanoidReady;

// ---------------------------------------------------------------- looks for the crowd and the cast
const SKINS = [0x3b2216, 0x4e2e1c, 0x5b3420, 0x6b3f25, 0x7a4a2c, 0x45291a];
const BOUBOU = [0xf2f2ec, 0x9cc8e8, 0x27407a, 0x6b3fa0, 0x1f7a44, 0xd9b44a, 0xe8e2d4, 0x7a1f3d];
const TEES = [0xd9322b, 0x1a9d54, 0xf4c20d, 0x2f6fb3, 0xf2f2ec, 0x222428, 0xe8742c, 0x7fb8d8];
const DRESS = [0xe58a2f, 0xc2417f, 0x1f7a44, 0x2f6fb3, 0xd9322b, 0x6b3fa0, 0xf4c20d];
const ACC = [0xf6e7c1, 0x1c1c1f, 0xf4c20d, 0xffffff, 0x2a8f6a];
const pickR = <T,>(a: T[], r: () => number) => a[Math.floor(r() * a.length)];

export function randomLook(r: () => number): PersonLook {
  const skin = pickR(SKINS, r), u = r();
  const heavy = r() < 0.25 ? 0.4 + r() * 0.6 : 0;
  if (u < 0.36) return { skin, female: true, heavy, style: 'dress', top: pickR(DRESS, r), pattern: r() < 0.75 ? 'wax' : 'uni', accent: pickR(ACC, r), hat: r() < 0.65 ? 'headwrap' : null, shoes: 0x6b4a2e };
  if (u < 0.62) return { skin, heavy, style: 'boubou', top: pickR(BOUBOU, r), pattern: r() < 0.5 ? 'bazin' : 'uni', hat: r() < 0.5 ? 'kufi' : null, hatColor: r() < 0.6 ? 0xf2f2ec : 0x1c1c1f, shoes: 0x3a2a1e, beard: r() < 0.35 ? pickR([0xd8d4cc, 0x8a8580, 0x1a1414], r) : null };
  return { skin, muscular: r() < 0.3 ? r() : 0, beard: r() < 0.15 ? 0x1a1414 : null, style: 'tee', top: pickR(TEES, r), pattern: r() < 0.25 ? 'rayure' : 'uni', accent: 0xffffff, bottom: pickR([0x2b2f3a, 0x3d4a5c, 0x1c1c1f, 0x6b5a45], r), shoes: pickR([0xf2f2ec, 0x1c1c1f, 0x8a5a3a], r) };
}

/** Derive a look from the old box outfit (used for the cast until each has an authored look). */
export function lookFromOutfit(o: Outfit, female = false): PersonLook {
  if (female) return { skin: o.skin, female: true, style: 'dress', top: o.top, pattern: 'wax', accent: 0xf6e7c1, hat: 'headwrap', hatColor: o.hat ?? o.top };
  if (o.long) return { skin: o.skin, style: 'boubou', top: o.top, pattern: 'bazin', hat: o.hat !== undefined ? 'kufi' : null, hatColor: o.hat, beard: o.hat !== undefined ? 0xd8d4cc : null, heavy: 0.4 };
  return { skin: o.skin, style: 'tee', top: o.top, bottom: o.bottom, hat: o.hat !== undefined ? 'kufi' : null, hatColor: o.hat };
}
