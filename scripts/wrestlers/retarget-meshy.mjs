// Retargets the wrestling animations generated with Meshy (assets-src/meshy_output/wrestling_anim/, git-excluded: the library
// clips on Meshy's own skeleton in a GLB, the text-to-motion clips on an SMPL-H skeleton in FBX) onto Dakar's 20-bone rig
// (public/assets/character_v4.glb; the Roi des Arènes bodies share its bone rotations, so one set of clips serves both), and
// writes them small: public/assets/wrestlers/combat_clips.json (Int16-quantised quaternions per bone, the hips' path).
//
// Per frame (30 fps): the trunk, neck, head, hips and feet take the source's world rotation change from its rest (both rests
// stand upright); the arms and legs take the source bone's direction (the rests differ: a T-pose against v4's arms down) — no
// twist on those; the hips' path is scaled by the hip heights; the source's facing is turned onto the rig's. In-place clips
// (locomotion, the stance) lose their drift so they loop.
// Usage: node scripts/wrestlers/retarget-meshy.mjs [srcDir] [out.json]
import fs from 'node:fs';
import * as THREE from 'three';
import { NodeIO } from '@gltf-transform/core';
globalThis.self = globalThis; globalThis.window = globalThis;
globalThis.document = { createElementNS: () => ({ style: {}, getContext: () => null, addEventListener() {} }), createElement: () => ({ style: {}, getContext: () => null }) };
const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
const warn = console.warn; console.warn = (...a) => { if (!/skinning weights/.test(String(a[0]))) warn(...a); };

const [,, SRC = '/home/user/dakar-rek/assets-src/meshy_output/wrestling_anim', OUT = 'public/assets/wrestlers/combat_clips.json'] = process.argv;
const san = n => n.replace(/[.\s]/g, '');

/** A glTF file's nodes as an Object3D tree, and its animations as clips (by gltf-transform: no textures, no DOM). */
async function gltfTree(file) {
  const doc = await new NodeIO().read(file), root = doc.getRoot(), map = new Map(), top = new THREE.Group();
  for (const n of root.listNodes()) { const o = new THREE.Object3D(); o.name = san(n.getName()); o.position.fromArray(n.getTranslation()); o.quaternion.fromArray(n.getRotation()); o.scale.fromArray(n.getScale()); map.set(n, o); }
  for (const n of root.listNodes()) for (const c of n.listChildren()) map.get(n).add(map.get(c));
  for (const n of root.listNodes()) if (!map.get(n).parent) top.add(map.get(n));
  const clips = root.listAnimations().map(a => new THREE.AnimationClip(a.getName(), -1, a.listChannels().map(ch => {
    const s = ch.getSampler(), times = Array.from(s.getInput().getArray()), vals = Array.from(s.getOutput().getArray()), name = `${san(ch.getTargetNode().getName())}.${ch.getTargetPath() === 'rotation' ? 'quaternion' : ch.getTargetPath() === 'translation' ? 'position' : 'scale'}`;
    return ch.getTargetPath() === 'rotation' ? new THREE.QuaternionKeyframeTrack(name, times, vals) : new THREE.VectorKeyframeTrack(name, times, vals);
  })));
  top.updateMatrixWorld(true);
  return { top, clips };
}
function fbxTree(file) {
  const b = fs.readFileSync(file), g = new FBXLoader().parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '');
  g.updateMatrixWorld(true);
  return { top: g, clips: g.animations };
}

const TARGET = ['hips', 'spine', 'chest', 'neck', 'head', 'shoulderL', 'upper_armL', 'forearmL', 'handL', 'shoulderR', 'upper_armR', 'forearmR', 'handR', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'];
/** Bone maps: target bone → [source bone, how ('rot': world rotation change; a name: aim at that source bone)]; the target child the direction is measured to. */
const MAPS = {
  meshy: { hips: ['Hips', 'rot'], spine: ['Spine02', 'rot'], chest: ['Spine', 'rot'], neck: ['neck', 'rot'], head: ['Head', 'rot'],
    shoulderL: ['LeftShoulder', 'LeftArm'], upper_armL: ['LeftArm', 'LeftForeArm'], forearmL: ['LeftForeArm', 'LeftHand'], handL: ['LeftHand', 'keep'],
    shoulderR: ['RightShoulder', 'RightArm'], upper_armR: ['RightArm', 'RightForeArm'], forearmR: ['RightForeArm', 'RightHand'], handR: ['RightHand', 'keep'],
    thighL: ['LeftUpLeg', 'LeftLeg'], shinL: ['LeftLeg', 'LeftFoot'], footL: ['LeftFoot', 'rot'], thighR: ['RightUpLeg', 'RightLeg'], shinR: ['RightLeg', 'RightFoot'], footR: ['RightFoot', 'rot'],
    legs: ['LeftUpLeg', 'RightUpLeg'] },
  smpl: { hips: ['Pelvis', 'rot'], spine: ['Spine1', 'rot'], chest: ['Spine3', 'rot'], neck: ['Neck', 'rot'], head: ['Head', 'rot'],
    shoulderL: ['L_Collar', 'L_Shoulder'], upper_armL: ['L_Shoulder', 'L_Elbow'], forearmL: ['L_Elbow', 'L_Wrist'], handL: ['L_Wrist', 'keep'],
    shoulderR: ['R_Collar', 'R_Shoulder'], upper_armR: ['R_Shoulder', 'R_Elbow'], forearmR: ['R_Elbow', 'R_Wrist'], handR: ['R_Wrist', 'keep'],
    thighL: ['L_Hip', 'L_Knee'], shinL: ['L_Knee', 'L_Ankle'], footL: ['L_Ankle', 'rot'], thighR: ['R_Hip', 'R_Knee'], shinR: ['R_Knee', 'R_Ankle'], footR: ['R_Ankle', 'rot'],
    legs: ['L_Hip', 'R_Hip'] },
};
const CHILD = { shoulderL: 'upper_armL', upper_armL: 'forearmL', forearmL: 'handL', shoulderR: 'upper_armR', upper_armR: 'forearmR', forearmR: 'handR', thighL: 'shinL', shinL: 'footL', thighR: 'shinR', shinR: 'footR' };

// the target rig at rest
const tgt = await gltfTree('public/assets/character_v4.glb');
const T = {}; for (const n of [...TARGET, 'root']) { T[n] = tgt.top.getObjectByName(n); if (!T[n]) throw new Error('target bone ' + n); }
const tRestW = {}, tRestP = {}, tRest = {}, tRestHips = T.hips.position.clone();
for (const n of TARGET) tRest[n] = T[n].quaternion.clone();
for (const n of TARGET) { tRestW[n] = T[n].getWorldQuaternion(new THREE.Quaternion()); tRestP[n] = T[n].getWorldPosition(new THREE.Vector3()); }
const facing = (lp, rp) => { const l = new THREE.Vector3().subVectors(lp, rp).setY(0).normalize(); return new THREE.Vector3().crossVectors(l, new THREE.Vector3(0, 1, 0)).normalize(); };
const tFwd = facing(tRestP.thighL, tRestP.thighR);

/** The first bone of that name in the source (FBX files carry many copies of the skeleton): the one under the first root. */
function finder(top) { const cache = new Map(); return name => { if (cache.has(name)) return cache.get(name); let f = null; top.traverse(o => { if (!f && o.name === name && (o.isBone || o.type === 'Object3D')) f = o; }); cache.set(name, f); return f; }; }

function retarget(src, kind, clip, { inPlace = false, plant = false, trim = false, fps = 30 } = {}) {
  const M = MAPS[kind], find = finder(src.top);
  // every clip starts from the source's bind pose (a mixer leaves the last clip's pose on the bones)
  if (!src.bind) { src.bind = []; src.top.traverse(o => src.bind.push([o, o.position.clone(), o.quaternion.clone(), o.scale.clone()])); }
  for (const [o, p, r, sc] of src.bind) { o.position.copy(p); o.quaternion.copy(r); o.scale.copy(sc); }
  for (const [k, v] of Object.entries(M)) if (k !== 'legs' && !find(v[0])) throw new Error(`${clip.name}: no source bone ${v[0]}`);
  src.top.updateMatrixWorld(true);
  // the source at rest (before the clip): world rotations, the hips' height, the facing
  const sRestW = {}, sRestP = {};
  for (const n of TARGET) { const b = find(M[n][0]); sRestW[n] = b.getWorldQuaternion(new THREE.Quaternion()); sRestP[n] = b.getWorldPosition(new THREE.Vector3()); }
  const sFwd = facing(find(M.legs[0]).getWorldPosition(new THREE.Vector3()), find(M.legs[1]).getWorldPosition(new THREE.Vector3()));
  const align = new THREE.Quaternion().setFromUnitVectors(sFwd, tFwd);
  // the scale from the legs' lengths (the hips' height at rest differs with the rest pose)
  const leg = (P, a, b, c) => P[a].distanceTo(P[b]) + P[b].distanceTo(P[c]);
  const k = (leg(tRestP, 'thighL', 'shinL', 'footL') + leg(tRestP, 'thighR', 'shinR', 'footR')) / (leg(sRestP, 'thighL', 'shinL', 'footL') + leg(sRestP, 'thighR', 'shinR', 'footR'));
  const groundT = Math.min(tRestP.footL.y, tRestP.footR.y);
  const mixer = new THREE.AnimationMixer(src.top), act = mixer.clipAction(clip); act.play();
  // (Meshy's library clips end on a copy of their first pose, for looping: `trim` leaves it out)
  const frames = Math.max(2, Math.round(clip.duration * fps) + (trim ? 0 : 1)), q = {}, hp = [], sh = [], sFoot = [], stride = [];
  // the source's ground: its lowest ankle over the clip; its start: the hips at frame 0
  let groundS = Infinity;
  for (let f = 0; f < frames; f++) { mixer.setTime(Math.min(clip.duration, f / fps)); src.top.updateMatrixWorld(true); groundS = Math.min(groundS, find(M.footL[0]).getWorldPosition(new THREE.Vector3()).y, find(M.footR[0]).getWorldPosition(new THREE.Vector3()).y); }
  for (const n of TARGET) q[n] = new Float32Array(frames * 4);
  const Qv = new THREE.Vector3(), W = {}, Qw = new THREE.Quaternion(), Qp = new THREE.Quaternion(), V = new THREE.Vector3(), D = new THREE.Vector3(), C = new THREE.Vector3();
  const rootW = T.root.getWorldQuaternion(new THREE.Quaternion()), rootM = new THREE.Matrix4().copy(T.root.matrixWorld).invert();
  for (let f = 0; f < frames; f++) {
    mixer.setTime(Math.min(clip.duration, f / fps)); src.top.updateMatrixWorld(true);
    for (const n of TARGET) {
      const [sb, how] = M[n], b = find(sb), parent = T[n].parent.name === 'root' ? rootW : W[T[n].parent.name];
      if (how === 'keep') Qw.copy(parent).multiply(T[n].quaternion);
      else if (how === 'rot') {
        // the world rotation change from the source's rest, turned to the rig's facing, applied to the rig's rest
        Qw.copy(b.getWorldQuaternion(Qp)).multiply(sRestW[n].clone().invert());
        Qw.premultiply(align).multiply(align.clone().invert()).multiply(tRestW[n]);
      } else {
        // the source bone's direction (to its child), turned to the facing; the rig's bone aimed along it from its rest under the posed parent
        D.subVectors(find(how).getWorldPosition(C), b.getWorldPosition(V)).normalize().applyQuaternion(align);
        Qw.copy(parent).multiply(T[n].quaternion);
        const rest = T[CHILD[n]].position.clone().normalize().applyQuaternion(Qw);
        Qw.premultiply(new THREE.Quaternion().setFromUnitVectors(rest, D));
      }
      W[n] = Qw.clone();
      const local = parent.clone().invert().multiply(Qw);
      q[n].set([local.x, local.y, local.z, local.w], f * 4);
    }
    // the hips' path: from frame 0 across the ground, above the clip's ground in height; scaled and turned, in the rig's root space
    V.copy(find(M.hips[0]).getWorldPosition(C));
    if (f === 0) sh.push(V.x, V.z);
    stride.push(D.subVectors(find(M.footL[0]).getWorldPosition(D), find(M.hips[0]).getWorldPosition(Qv)).dot(sFwd) * k);
    sFoot.push((Math.min(find(M.footL[0]).getWorldPosition(D).y, find(M.footR[0]).getWorldPosition(D).y) - groundS) * k);
    V.set(V.x - sh[0], V.y - groundS, V.z - sh[1]).multiplyScalar(k).applyQuaternion(align);
    V.x += tRestP.hips.x; V.z += tRestP.hips.z; V.y += groundT;
    V.applyMatrix4(rootM);
    hp.push(V.x, V.y, V.z);
  }
  // the travel's speed (m/s, along the rig's forward), kept for time-warping the steps to the game's pace
  // the travel's speed (m/s, along the rig's forward), for time-warping the steps to the game's pace: in place, from the stride
  const n1 = frames - 1, dur = n1 / fps;
  const speed = inPlace ? 2 * (Math.max(...stride) - Math.min(...stride)) / dur
    : new THREE.Vector3(hp[n1 * 3] - hp[0], hp[n1 * 3 + 1] - hp[1], hp[n1 * 3 + 2] - hp[2]).applyQuaternion(rootW).dot(tFwd) / dur;
  if (inPlace) {                                                        // in place: the hips kept over the spot across the ground (the game moves the body)
    const rest = tRestHips.clone().applyQuaternion(rootW);
    for (let f = 0; f < frames; f++) { V.fromArray(hp, f * 3).applyQuaternion(rootW); V.x = rest.x; V.z = rest.z; V.applyQuaternion(rootW.clone().invert()).toArray(hp, f * 3); }
  }
  // on the ground, frame by frame: the rig's lower foot as high above the sand as the source's (the legs' proportions differ)
  const Wp = new THREE.Vector3(), rootInv = rootW.clone().invert();
  for (let f = 0; f < frames; f++) {
    for (const n of TARGET) T[n].quaternion.fromArray(q[n], f * 4);
    T.hips.position.fromArray(hp, f * 3); tgt.top.updateMatrixWorld(true);
    const low = Math.min(T.footL.getWorldPosition(Wp).y, T.footR.getWorldPosition(Wp).y);
    Wp.set(0, (plant ? 0 : sFoot[f]) + groundT - low, 0).applyQuaternion(rootInv);   // the root is turned (z up): the lift in its space
    hp[f * 3] += Wp.x; hp[f * 3 + 1] += Wp.y; hp[f * 3 + 2] += Wp.z;
  }
  for (const n of TARGET) T[n].quaternion.copy(tRest[n]); T.hips.position.copy(tRestHips); tgt.top.updateMatrixWorld(true);
  // fewer keys: the lowest rate (10, 15 or 30 a second) that keeps every bone within 2.5° of the full one (slerp between keys)
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), qf = new THREE.Quaternion();
  let step = 1;
  for (const s of [3, 2]) {
    let worst = 0;
    for (const n of TARGET) for (let f = 0; f < frames; f++) {
      const i = Math.floor(f / s) * s, j = Math.min(i + s, frames - 1);
      if (j <= i) continue;
      qa.fromArray(q[n], i * 4); qb.fromArray(q[n], j * 4); qa.slerp(qb, (f - i) / (j - i)); qf.fromArray(q[n], f * 4);
      worst = Math.max(worst, qa.angleTo(qf));
    }
    if (worst < 2.5 * Math.PI / 180) { step = s; break; }
  }
  const keep = []; for (let f = 0; f < frames; f += step) keep.push(f);
  // quantised: quaternions as Int16 (sign-continuous), the path in millimetres; constant tracks kept as one key
  const out = { name: clip.name, fps: fps / step, frames: keep.length, speed: +speed.toFixed(3), bones: {}, hips: null };
  for (const n of TARGET) {
    const a = new Float32Array(keep.length * 4); keep.forEach((f, i) => a.set(q[n].subarray(f * 4, f * 4 + 4), i * 4));
    for (let f = 1; f < keep.length; f++) if (a[f * 4] * a[f * 4 - 4] + a[f * 4 + 1] * a[f * 4 - 3] + a[f * 4 + 2] * a[f * 4 - 2] + a[f * 4 + 3] * a[f * 4 - 1] < 0) for (let c = 0; c < 4; c++) a[f * 4 + c] *= -1;
    let still = true; for (let f = 1; f < keep.length && still; f++) for (let c = 0; c < 4; c++) if (Math.abs(a[f * 4 + c] - a[c]) > 2e-3) still = false;
    const i16 = Int16Array.from(still ? a.subarray(0, 4) : a, x => Math.round(Math.max(-1, Math.min(1, x)) * 32767));
    out.bones[n] = Buffer.from(i16.buffer).toString('base64');
  }
  out.hips = Buffer.from(Int16Array.from(keep.flatMap(f => [hp[f * 3], hp[f * 3 + 1], hp[f * 3 + 2]]), x => Math.round(x * 1000)).buffer).toString('base64');
  return out;
}

const lib = await gltfTree(`${SRC}/lib/animation_glb.glb`);
// id, in place (loops), feet kept on the sand (the actor stays up through it)
const LIB = { Walk_Fight_Forward: ['walk_fwd', true, true], Walk_Fight_Back: ['walk_back', true, true], Cautious_Crouch_Walk_Forward: ['crouch_walk', true, true], Knock_Down: ['knock_down'], Shot_and_Fall_Backward: ['fall_back'], Shot_and_Fall_Forward: ['fall_fwd'], Stand_Up1: ['stand_up'], Mummy_Stagger: ['stagger', true, true], Over_Shoulder_Throw: ['shoulder_throw', false, true], Grip_and_Throw_Down: ['grip_throw', false, true] };
const clips = {};
for (const c of lib.clips) {
  const [id, inPlace, plant] = LIB[c.name] ?? [];
  if (!id) { console.log('skip', c.name); continue; }
  clips[id] = retarget(lib, 'meshy', c, { inPlace, plant, trim: true });
}
for (const m of ['stance', 'hip_throw', 'lift_drop', 'push_drive', 'thrown_back', 'resist_sprawl', 'victory']) {
  const s = fbxTree(`${SRC}/motion/${m}/motion.fbx`);
  clips[m] = retarget(s, 'smpl', s.clips[0], { inPlace: ['stance', 'push_drive', 'resist_sprawl', 'victory'].includes(m), plant: m !== 'thrown_back' });
}
fs.mkdirSync(OUT.replace(/\/[^/]+$/, ''), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ source: 'Meshy animation library and text-to-motion (task ids: assets-src/meshy_output/wrestling_anim/tasks.txt, kept out of git), retargeted by scripts/wrestlers/retarget-meshy.mjs', bones: TARGET, restHips: tRestHips.toArray(), clips }));
console.log(Object.entries(clips).map(([k, c]) => `${k}:${c.frames}f@${c.fps}`).join(' '), (fs.statSync(OUT).size / 1024).toFixed(0) + ' KB');
