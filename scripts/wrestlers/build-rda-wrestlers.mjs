// Puts the two Roi des Arènes physiques on Dakar Rek's own wrestler rig, offline, the way the Meshy bodies came in
// (scripts/meshy/transplant-to-v4-rig.mjs, docs/meshy/PROOF_REPORT.md). Output: public/assets/wrestlers/rda_wrestlers.glb (high) and
// rda_wrestlers_m.glb (medium: smaller face, eye, brow and lash textures; the same geometry): character_v4.glb's skeleton (20 bones, four
// sockets) and ALL its clips, its meshes replaced by RDA's body (both physiques as morph targets), eyes, brows, lashes, short hair, two
// ngemb cuts, and the arm / waist / chest accessory pieces of each physique, posed into v4's rest pose and skinned to v4's bones.
// Everything that moves a wrestler (clips, the gait, StrikeRig, the fête's carry, the referee's arm) then runs on it unchanged.
//
// Usage (repo root; the RDA experiment extracted from origin/lab/roi-des-arenes-threejs @ 809a9817, its hashes are checked):
//   git archive 809a9817 experiments/roi-des-arenes | tar -x -C <dir>
//   node scripts/wrestlers/build-rda-wrestlers.mjs <dir>/experiments/roi-des-arenes [--out public/assets/wrestlers] [--report docs/wrestling/rda/build-report.json]
//
// Method (docs/wrestling/RDA-INTEGRATION.md has the bone map and the numbers):
// - The face atlas (RDA face-atlas.json) splits the body's UV seams first: 6 322 → 6 965 vertices, every attribute and morph copied exactly.
// - The pieces RDA generates on the body (its WEB-007/008 accessories, its short hair; our ngemb cut the way RDA cut its study shorts) are
//   made in RDA's own space, on each physique as morphed, with RDA's own fitting constants (scripts/wrestlers/rda-*.mjs), and carry the
//   body's skin weights interpolated: they go through the same transplant as the body, so they fit it on v4's rig as they fitted RDA's.
// - Transplant (a linear-blend bake, nothing re-authored): uniform scale so the straightened leg reaches v4's hip height (0.95 m); the trunk
//   warped vertically so RDA's hips and neck land on v4's joints (the head rigid above); legs rotated and stretched onto v4's knee and ankle
//   (v4's leg bones are kept exactly: the gait's two-bone IK, src/actors/gait.ts RIG, is built on them); feet rigid, flat and pointing ahead;
//   arms rotated from RDA's A-pose onto v4's rest directions with RDA's own lengths (the body's own copy of the skeleton gets its shoulder,
//   elbow and wrist where RDA's are, like the Meshy homme's --joint-fit: clips turn bones, they never move them), the hand turned about the
//   forearm so the palm faces the thigh with the thumb ahead (half of that turn on the forearm).
// - 31 MPFB `cmu_mb` joints → 20 v4 bones (weights merged, top four): see MAP below; LowerBack's share goes to hips or spine by height.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as THREE from 'three';
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune } from '@gltf-transform/functions';
import { createAccessories } from './rda-accessories.mjs';
import { shortHair } from './rda-finish.mjs';
import { ngemb } from './rda-ngemb.mjs';

const args = process.argv.slice(2);
const SRC = args[0];
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i < 0 ? d : args[i + 1]; };
const OUT = opt('out', 'public/assets/wrestlers'), REPORT = opt('report', 'docs/wrestling/rda/build-report.json');
if (!SRC) { console.error('usage: node scripts/wrestlers/build-rda-wrestlers.mjs <experiments/roi-des-arenes> [--out dir]'); process.exit(2); }
const V4 = 'public/assets/character_v4.glb';

// ---------------------------------------------------------------- inputs, checked against RDA's provenance records
const EXPECT = {
  'public/assets/anatomy-study.glb': '990f1806a19e940e66b67a1482dcda8509a90e206cae948bbf89f6b4274d9257',
  'public/assets/face-atlas.json': '866c1cb5e5432d1f702498f93992944413b9f203da668e7bf8f50008c53e4515',
  'public/assets/skin_m.png': 'e3f0dbb634e4c68561338f0087f7a122444e84ec56df102212f1222aa12e4d50',
  'public/assets/eye_brown.png': '4659691c7295ad6206c78b003e5fd0e5f91dcd53032fa914a229bb48cabe424b',
  'public/assets/brows.png': '9940f7d0b1b223709a19b05156ba6f6e9e4dbdbced02d7574f4d51d72c58967b',
  'public/assets/lashes.png': '4b69c0fff2648874460e9caf80c31413c444218a5c50afebc425aeaa65484a35',
};
const file = f => path.join(SRC, f);
for (const [f, h] of Object.entries(EXPECT)) {
  const got = crypto.createHash('sha256').update(fs.readFileSync(file(f))).digest('hex');
  if (got !== h) throw new Error(`${f}: sha256 ${got}, expected ${h} (RDA ASSET_PROVENANCE.md / evidence/WEB-004-texture-provenance.json)`);
}
const report = { source: { commit: '809a9817', files: EXPECT }, v4: V4 };

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const rdaDoc = await io.read(file('public/assets/anatomy-study.glb'));
const atlas = JSON.parse(fs.readFileSync(file('public/assets/face-atlas.json'), 'utf8'));
const rdaRoot = rdaDoc.getRoot(), rdaSkin = rdaRoot.listSkins()[0], rdaJoints = rdaSkin.listJoints(), NAMES = rdaJoints.map(j => j.getName());
const J = name => { const i = NAMES.indexOf(name); if (i < 0) throw new Error('no RDA joint ' + name); return i; };

/** A primitive's attributes as plain float arrays (normalized integers decoded). */
function floats(acc) {
  if (!acc) return null;
  const n = acc.getCount(), k = acc.getElementSize(), out = new Float32Array(n * k), e = [];
  for (let i = 0; i < n; i++) { acc.getElement(i, e); for (let c = 0; c < k; c++) out[i * k + c] = e[c]; }
  return out;
}
function readMesh(name) {
  const m = rdaRoot.listMeshes().find(x => x.getName() === name), p = m.listPrimitives()[0];
  return {
    P: floats(p.getAttribute('POSITION')), N: floats(p.getAttribute('NORMAL')), UV: floats(p.getAttribute('TEXCOORD_0')), C: floats(p.getAttribute('COLOR_0')),
    J: floats(p.getAttribute('JOINTS_0')), W: floats(p.getAttribute('WEIGHTS_0')), IDX: Uint32Array.from(p.getIndices().getArray()),
    MP: p.listTargets().map(t => floats(t.getAttribute('POSITION'))), MN: p.listTargets().map(t => floats(t.getAttribute('NORMAL'))),
    targetNames: m.getExtras()?.targetNames,
  };
}

// ---------------------------------------------------------------- the face atlas: split the UV seams (RDA face-material.ts applyFaceAtlas)
const src = readMesh('Body');
{
  const count = src.P.length / 3;
  if (atlas.study_sha256 !== EXPECT['public/assets/anatomy-study.glb'] || atlas.original_vertices !== count || atlas.uv.length !== atlas.source_vertices.length * 2 || atlas.indices.length !== src.IDX.length) throw new Error('face atlas does not match the body');
  if (!atlas.indices.every((v, i) => atlas.source_vertices[v] === src.IDX[i])) throw new Error('invalid face atlas seam mapping');
}
const SV = atlas.source_vertices, nB = SV.length;
const pick = (a, k) => { if (!a) return null; const o = new Float32Array(nB * k); SV.forEach((s, i) => { for (let c = 0; c < k; c++) o[i * k + c] = a[s * k + c]; }); return o; };
const body = { P: pick(src.P, 3), N: pick(src.N, 3), C: pick(src.C, 4), J: pick(src.J, 4), W: pick(src.W, 4), IDX: Uint32Array.from(atlas.indices),
  MP: src.MP.map(a => pick(a, 3)), MN: src.MN.map(a => pick(a, 3)), UV: Float32Array.from(atlas.uv) };
report.faceAtlas = { vertices: nB, fromVertices: src.P.length / 3, triangles: body.IDX.length / 3 };
const TARGETS = src.targetNames;                      // ['AthleticStudy', 'HeavyStudy']
if (!(TARGETS?.[0] === 'AthleticStudy' && TARGETS?.[1] === 'HeavyStudy')) throw new Error('unexpected morph names ' + TARGETS);

// ---------------------------------------------------------------- RDA's rig as Three.js objects (the generators run on it, at rest)
function sourceScene(influences) {
  const objs = new Map();
  const make = n => {
    const o = rdaJoints.includes(n) ? new THREE.Bone() : new THREE.Object3D(); o.name = n.getName();
    o.position.fromArray(n.getTranslation()); o.quaternion.fromArray(n.getRotation()); o.scale.fromArray(n.getScale());
    objs.set(n, o); for (const c of n.listChildren()) o.add(make(c)); return o;
  };
  const scene = new THREE.Group(); for (const n of rdaRoot.listScenes()[0].listChildren()) scene.add(make(n));
  scene.updateMatrixWorld(true);
  const ibm = rdaSkin.getInverseBindMatrices().getArray();
  const bones = rdaJoints.map(j => objs.get(j)), inverses = rdaJoints.map((_, k) => new THREE.Matrix4().fromArray(Array.from(ibm.slice(k * 16, k * 16 + 16))));
  const rig = objs.get(rdaRoot.listScenes()[0].listChildren()[0]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(body.P.slice(), 3)); g.setAttribute('normal', new THREE.BufferAttribute(body.N.slice(), 3));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(Uint16Array.from(body.J), 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(body.W.slice(), 4));
  g.setIndex(new THREE.BufferAttribute(body.IDX.slice(), 1));
  g.morphAttributes.position = body.MP.map(a => new THREE.BufferAttribute(a.slice(), 3)); g.morphAttributes.normal = body.MN.map(a => new THREE.BufferAttribute(a.slice(), 3));
  g.morphTargetsRelative = true;
  const mesh = new THREE.SkinnedMesh(g, new THREE.MeshStandardMaterial()); mesh.name = 'Body';
  rig.add(mesh); mesh.bind(new THREE.Skeleton(bones, inverses), new THREE.Matrix4());
  mesh.morphTargetInfluences = [...influences];
  scene.updateMatrixWorld(true); mesh.skeleton.update();
  return { scene, rig, bones, body: mesh };
}
const rest = sourceScene([1, 0]);
const B = Object.fromEntries(rest.bones.map(b => [b.name, b.getWorldPosition(new THREE.Vector3())]));

// ---------------------------------------------------------------- pieces generated in RDA's space
/** A geometry (and its world matrix) as a piece: arrays, skin in RDA joint indices, optional morphs, uv, colour, rigid joint. */
function pieceOf(g, matrix, color, rigidJoint = -1, anchor = null) {
  const n = g.getAttribute('position').count, P = new Float32Array(n * 3), N = new Float32Array(n * 3);
  const nm = new THREE.Matrix3().getNormalMatrix(matrix), v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(g.getAttribute('position'), i).applyMatrix4(matrix); P.set([v.x, v.y, v.z], i * 3);
    v.fromBufferAttribute(g.getAttribute('normal'), i).applyMatrix3(nm).normalize(); N.set([v.x, v.y, v.z], i * 3);
  }
  const JJ = new Float32Array(n * 4), WW = new Float32Array(n * 4);
  if (rigidJoint >= 0) for (let i = 0; i < n; i++) { JJ[i * 4] = rigidJoint; WW[i * 4] = 1; }
  else { JJ.set(g.getAttribute('skinIndex').array); WW.set(g.getAttribute('skinWeight').array); }
  const IDX = g.index ? Uint32Array.from(g.index.array) : Uint32Array.from({ length: n }, (_, i) => i);
  const C = color ? new Float32Array(n * 3).map((_, i) => [color.r, color.g, color.b][i % 3]) : null;
  const RG = rigidJoint >= 0 ? anchor.toArray() : null;
  return { P, N, J: JJ, W: WW, IDX, C, RG, MP: [], MN: [] };
}
function mergePieces(list) {
  const out = { P: [], N: [], J: [], W: [], IDX: [], C: [], RGV: [], MP: [], MN: [] }; let base = 0;
  for (const p of list) {
    const n = p.P.length / 3;
    out.P.push(...p.P); out.N.push(...p.N); out.J.push(...p.J); out.W.push(...p.W); out.C.push(...(p.C ?? new Float32Array(n * 3).fill(1)));
    for (const i of p.IDX) out.IDX.push(i + base);
    for (let i = 0; i < n; i++) out.RGV.push(...(p.RG ?? [NaN, NaN, NaN]));
    base += n;
  }
  return { P: Float32Array.from(out.P), N: Float32Array.from(out.N), J: Float32Array.from(out.J), W: Float32Array.from(out.W), IDX: Uint32Array.from(out.IDX),
    C: Float32Array.from(out.C), RGV: Float32Array.from(out.RGV), MP: [], MN: [] };
}
function accessoryPieces(objs, bones) {
  const list = [];
  for (const o of objs) {
    o.updateWorldMatrix(true, true);
    if (o.isSkinnedMesh) list.push(pieceOf(o.geometry, o.matrixWorld, o.material.color));
    else o.traverse(m => {
      if (!m.isMesh) return;
      const joint = bones.indexOf(o.parent), anchor = o.getWorldPosition(new THREE.Vector3());
      if (joint < 0) throw new Error('pouch not on a bone: ' + o.name);
      list.push(pieceOf(m.geometry, m.matrixWorld, m.material.color, joint, anchor));
    });
  }
  return mergePieces(list);
}
const acc = {}, accStats = {};
for (const [build, inf] of [['athletic', [1, 0]], ['heavy', [0, 1]]]) {
  const s = sourceScene(inf), set = createAccessories(s.body), info = set.inspect();
  if (info.pouches !== 6) throw new Error('expected six pouches, got ' + info.pouches);
  const side = (objs, S) => objs.filter(o => o.name.startsWith(S));
  acc[build] = { armL: accessoryPieces(side(set.arms, 'Left'), s.bones), armR: accessoryPieces(side(set.arms, 'Right'), s.bones), waist: accessoryPieces(set.waist, s.bones), chest: accessoryPieces(set.chest, s.bones) };
  accStats[build] = { pouches: info.pouches, sections: info.sections.map(x => ({ name: x.name, rMin: +x.radiusMin.toFixed(4), rMax: +x.radiusMax.toFixed(4) })), anchors: info.anchors.map(a => ({ name: a.name, bone: a.bone })) };
}
// the hair (on the athletic build's surface; it carries both morphs) and the two ngemb cuts
const athletic = sourceScene([1, 0]);
shortHair(athletic.body);
const hairMesh = athletic.rig.getObjectByName('OriginalShortHair');
const hair = pieceOf(hairMesh.geometry, new THREE.Matrix4(), null);
hair.MP = hairMesh.geometry.morphAttributes.position.map(a => Float32Array.from(a.array)); hair.MN = hairMesh.geometry.morphAttributes.normal.map(a => Float32Array.from(a.array));
const garment = (top, bottom) => {
  const g = ngemb(athletic.body, top, bottom, 0.015), n = g.position.length / 3;
  return { P: Float32Array.from(g.position), N: Float32Array.from(g.normal), J: Float32Array.from(g.skinIndex), W: Float32Array.from(g.skinWeight), UV: Float32Array.from(g.uv),
    IDX: Uint32Array.from({ length: n }, (_, i) => i), MP: g.morphPosition.map(a => Float32Array.from(a)), MN: g.morphNormal.map(a => Float32Array.from(a)) };
};

// ---------------------------------------------------------------- v4: the target rig
const v4 = await io.read(V4), v4root = v4.getRoot(), v4skin = v4root.listSkins()[0];
const v4joint = Object.fromEntries(v4skin.listJoints().map(j => [j.getName(), j]));
const M4 = n => new THREE.Matrix4().fromArray(n.getWorldMatrix());
const T = name => new THREE.Vector3().setFromMatrixPosition(M4(v4joint[name]));
const v4Index = Object.fromEntries(v4skin.listJoints().map((j, i) => [j.getName(), i]));

// ---- uniform scale (straightened leg → v4's hip height) and centring
const legLen = S => B[`${S}Foot`].y + B[`${S}Leg`].distanceTo(B[`${S}Foot`]) + B[`${S}UpLeg`].distanceTo(B[`${S}Leg`]);
const G = T('thigh.L').y / ((legLen('Left') + legLen('Right')) / 2);
const hipMid = B.LeftUpLeg.clone().add(B.RightUpLeg).multiplyScalar(0.5 * G);
const T0 = new THREE.Vector3(-hipMid.x, 0, -hipMid.z);
const s = x => x.clone().multiplyScalar(G).add(T0);
const A = Object.fromEntries(Object.entries(B).map(([k, p]) => [k, s(p)]));
// ---- the trunk's vertical warp: RDA's hips and neck onto v4's (0.95, 1.55); the head rigid above
const yHip = (A.LeftUpLeg.y + A.RightUpLeg.y) / 2, yNeck = A.Neck.y, vHip = T('thigh.L').y, vNeck = T('neck').y;
const kLow = vHip / yHip, kMid = (vNeck - vHip) / (yNeck - yHip);
const warpY = y => (y <= yHip ? y * kLow : y <= yNeck ? vHip + (y - yHip) * kMid : vNeck + (y - yNeck));
const slope = y => (y <= yHip ? kLow : y <= yNeck ? kMid : 1);
const ID = new THREE.Quaternion();
const rigid = { R: ID, scale: G,
  p: x => { const q = s(x); q.y = warpY(q.y); return q; },
  n: (n, x) => { const k = slope(s(x).y); return new THREE.Vector3(n.x, n.y / k, n.z).normalize(); } };
/** Segment O→E (scaled RDA) placed on o→e: rotated about O, stretched along the target axis. */
function segment(O, E, o, e) {
  const a = E.clone().sub(O), t = e.clone().sub(o), axis = t.clone().normalize(), R = new THREE.Quaternion().setFromUnitVectors(a.clone().normalize(), axis), k = t.length() / a.length();
  return { R, k, scale: G,
    p: x => { const u = s(x).sub(O).applyQuaternion(R); return o.clone().add(u).addScaledVector(axis, (k - 1) * u.dot(axis)); },
    n: n => { const m = n.clone().applyQuaternion(R); return m.addScaledVector(axis, (1 / k - 1) * m.dot(axis)).normalize(); } };
}
/** Rigid: scaled RDA point about pivot O, turned by R, put at o. */
const turned = (O, o, R) => ({ R, scale: G, p: x => o.clone().add(s(x).sub(O).applyQuaternion(R)), n: n => n.clone().applyQuaternion(R).normalize() });

const TF = new Array(NAMES.length).fill(null);
for (const n of ['Hips', 'LHipJoint', 'RHipJoint', 'LowerBack', 'Spine', 'Spine1', 'Neck', 'Neck1', 'Head', 'LeftShoulder', 'RightShoulder']) TF[J(n)] = rigid;
const stretch = {}, arms = {};
const vertsOf = (names, min = 0.5) => {                      // body vertices (scaled RDA space) skinned mostly to these joints
  const ids = names.map(J), out = [];
  for (let i = 0; i < nB; i++) { let w = 0; for (let k = 0; k < 4; k++) if (ids.includes(body.J[i * 4 + k])) w += body.W[i * 4 + k]; if (w > min) out.push(s(new THREE.Vector3(body.P[i * 3], body.P[i * 3 + 1], body.P[i * 3 + 2]))); }
  return out;
};
for (const [sd, S, sign] of [['L', 'Left', 1], ['R', 'Right', -1]]) {
  // legs: onto v4's knee and ankle (v4's leg bones are the gait's), the anatomical ankle height kept; the foot rigid, flat, pointing ahead
  const hip = A[`${S}UpLeg`], knee = A[`${S}Leg`], ankle = A[`${S}Foot`], toe = A[`${S}ToeBase`];
  const tAnkle = new THREE.Vector3(T(`foot.${sd}`).x, ankle.y, T(`foot.${sd}`).z);
  const thigh = segment(hip, knee, T(`thigh.${sd}`), T(`shin.${sd}`)), shin = segment(knee, ankle, T(`shin.${sd}`), tAnkle);
  const ta = toe.clone().sub(ankle), yaw = Math.atan2(ta.x, ta.z), Ry = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -yaw);
  const foot = turned(ankle, tAnkle, Ry);
  TF[J(`${S}UpLeg`)] = thigh; TF[J(`${S}Leg`)] = shin; TF[J(`${S}Foot`)] = foot; TF[J(`${S}ToeBase`)] = foot;
  const fv = vertsOf([`${S}Foot`, `${S}ToeBase`], 0.6).map(p => p.sub(ankle).applyQuaternion(Ry));
  stretch[`thigh.${sd}`] = +thigh.k.toFixed(3); stretch[`shin.${sd}`] = +shin.k.toFixed(3);
  stretch[`foot.${sd}`] = { yawOutDeg: +(yaw * sign * 180 / Math.PI).toFixed(1), heelBehindAnkle: +(-Math.min(...fv.map(p => p.z))).toFixed(3), toeAheadOfAnkle: +Math.max(...fv.map(p => p.z)).toFixed(3), soleBelowAnkle: +(-Math.min(...fv.map(p => p.y))).toFixed(3) };
  // arms: RDA's own lengths on v4's rest directions; the arm's root where RDA's shoulder is (on the warped trunk)
  const aSh = A[`${S}Arm`], aEl = A[`${S}ForeArm`], aWr = A[`${S}Hand`];
  const tSh = rigid.p(B[`${S}Arm`]), lenUp = aEl.distanceTo(aSh), lenFa = aWr.distanceTo(aEl);
  const dUp = T(`forearm.${sd}`).sub(T(`upper_arm.${sd}`)).normalize(), dFa = T(`hand.${sd}`).sub(T(`forearm.${sd}`)).normalize();
  const Rup = new THREE.Quaternion().setFromUnitVectors(aEl.clone().sub(aSh).normalize(), dUp);
  const tEl = tSh.clone().addScaledVector(dUp, lenUp), tWr = tEl.clone().addScaledVector(dFa, lenFa);
  const faNow = aWr.clone().sub(aEl).normalize().applyQuaternion(Rup);
  const Rfa0 = new THREE.Quaternion().setFromUnitVectors(faNow, dFa).multiply(Rup);
  // the palm: the hand's flattest axis (its normal) turned about the forearm to face the thigh, the thumb ahead
  const handPts = vertsOf([`${S}Hand`, `${S}FingerBase`, `${S}HandFinger1`, sd === 'L' ? 'LThumb' : 'RThumb']).map(p => p.sub(aWr).applyQuaternion(Rfa0));
  const thumb = vertsOf([sd === 'L' ? 'LThumb' : 'RThumb']).map(p => p.sub(aWr).applyQuaternion(Rfa0));
  const mean = handPts.reduce((m, p) => m.add(p), new THREE.Vector3()).multiplyScalar(1 / handPts.length);
  const cov = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (const p of handPts) { const d = p.clone().sub(mean).toArray(); for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) cov[r * 3 + c] += d[r] * d[c]; }
  let nrm = null, best = Infinity;                                       // smallest-variance direction ⊥ forearm, by a sweep
  const u1 = new THREE.Vector3(1, 0, 0).sub(dFa.clone().multiplyScalar(dFa.x)).normalize(), u2 = new THREE.Vector3().crossVectors(dFa, u1);
  for (let a = 0; a < 180; a += 0.5) {
    const d = u1.clone().multiplyScalar(Math.cos(a * Math.PI / 180)).addScaledVector(u2, Math.sin(a * Math.PI / 180)), x = d.toArray();
    let vv = 0; for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) vv += x[r] * cov[r * 3 + c] * x[c];
    if (vv < best) { best = vv; nrm = d; }
  }
  const thumbC = thumb.reduce((m, p) => m.add(p), new THREE.Vector3()).multiplyScalar(1 / Math.max(1, thumb.length)).sub(mean);
  let phi = 0, bestZ = -Infinity;
  for (const target of [u1, u1.clone().negate()]) {
    const ang = Math.atan2(dFa.dot(new THREE.Vector3().crossVectors(nrm, target)), nrm.dot(target));
    const z = thumbC.clone().applyAxisAngle(dFa, ang).z;
    if (z > bestZ) { bestZ = z; phi = ang; }
  }
  const twist = a => new THREE.Quaternion().setFromAxisAngle(dFa, a);
  const Rfa = twist(phi / 2).multiply(Rfa0), Rh = twist(phi).multiply(Rfa0);
  TF[J(`${S}Arm`)] = turned(aSh, tSh, Rup);
  TF[J(`${S}ForeArm`)] = turned(aEl, tEl, Rfa);
  for (const n of [`${S}Hand`, `${S}FingerBase`, `${S}HandFinger1`, sd === 'L' ? 'LThumb' : 'RThumb']) TF[J(n)] = turned(aWr, tWr, Rh);
  arms[sd] = { tSh, tEl, tWr, lenUp, lenFa, shoulderShift: tSh.clone().sub(T(`upper_arm.${sd}`)), palmTwistDeg: phi * 180 / Math.PI,
    v4Up: T(`forearm.${sd}`).distanceTo(T(`upper_arm.${sd}`)), v4Fa: T(`hand.${sd}`).distanceTo(T(`forearm.${sd}`)) };
}
if (TF.some(t => !t)) throw new Error('unmapped RDA joint ' + NAMES.filter((_, i) => !TF[i]));

// ---- the 31 MPFB joints onto v4's 20 bones (LowerBack: hips below v4's spine joint, spine above, blended over 10 cm)
const MAP = { Hips: 'hips', LHipJoint: 'hips', RHipJoint: 'hips', LowerBack: 'spine', Spine: 'spine', Spine1: 'chest', Neck: 'neck', Neck1: 'neck', Head: 'head' };
for (const [sd, S] of [['L', 'Left'], ['R', 'Right']]) Object.assign(MAP, {
  [`${S}Shoulder`]: `shoulder.${sd}`, [`${S}Arm`]: `upper_arm.${sd}`, [`${S}ForeArm`]: `forearm.${sd}`, [`${S}Hand`]: `hand.${sd}`, [`${S}FingerBase`]: `hand.${sd}`,
  [`${S}HandFinger1`]: `hand.${sd}`, [`${sd === 'L' ? 'L' : 'R'}Thumb`]: `hand.${sd}`, [`${S}UpLeg`]: `thigh.${sd}`, [`${S}Leg`]: `shin.${sd}`, [`${S}Foot`]: `foot.${sd}`, [`${S}ToeBase`]: `foot.${sd}`,
});
for (const n of NAMES) if (!MAP[n]) throw new Error('unmapped ' + n);
const LB = J('LowerBack'), ySpine = T('spine').y;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------- the bake
const vx = new THREE.Vector3(), vn = new THREE.Vector3(), acP = new THREE.Vector3(), acN = new THREE.Vector3();
function bakeOne(piece, i, dx, dn) {
  const x = vx.set(piece.P[i * 3] + (dx?.[i * 3] ?? 0), piece.P[i * 3 + 1] + (dx?.[i * 3 + 1] ?? 0), piece.P[i * 3 + 2] + (dx?.[i * 3 + 2] ?? 0)).clone();
  const n = vn.set(piece.N[i * 3] + (dn?.[i * 3] ?? 0), piece.N[i * 3 + 1] + (dn?.[i * 3 + 1] ?? 0), piece.N[i * 3 + 2] + (dn?.[i * 3 + 2] ?? 0)).clone();
  if (piece.RGV && !Number.isNaN(piece.RGV[i * 3])) {          // a pouch: rigid on its bone (no stretch, no warp)
    const tf = TF[piece.J[i * 4]], a = new THREE.Vector3(piece.RGV[i * 3], piece.RGV[i * 3 + 1], piece.RGV[i * 3 + 2]);
    return { p: tf.p(a).add(x.sub(a).multiplyScalar(G).applyQuaternion(tf.R)), n: n.applyQuaternion(tf.R).normalize() };
  }
  acP.set(0, 0, 0); acN.set(0, 0, 0); let sum = 0;
  for (let k = 0; k < 4; k++) { const w = piece.W[i * 4 + k]; if (w <= 0) continue; const tf = TF[piece.J[i * 4 + k]]; acP.addScaledVector(tf.p(x), w); acN.addScaledVector(tf.n(n, x), w); sum += w; }
  return { p: acP.clone().multiplyScalar(1 / sum), n: acN.clone().normalize() };
}
function bake(piece) {
  const n = piece.P.length / 3, P = new Float32Array(n * 3), N = new Float32Array(n * 3), JO = new Uint8Array(n * 4), WO = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const r = bakeOne(piece, i); P.set(r.p.toArray(), i * 3); N.set(r.n.toArray(), i * 3);
    const merged = new Map();
    for (let k = 0; k < 4; k++) {
      const w = piece.W[i * 4 + k], j = piece.J[i * 4 + k]; if (w <= 0) continue;
      if (j === LB) { const f = smooth(ySpine - 0.05, ySpine + 0.05, r.p.y); merged.set(v4Index.hips, (merged.get(v4Index.hips) ?? 0) + w * (1 - f)); merged.set(v4Index.spine, (merged.get(v4Index.spine) ?? 0) + w * f); }
      else { const t = v4Index[MAP[NAMES[j]]]; merged.set(t, (merged.get(t) ?? 0) + w); }
    }
    const top = [...merged].filter(([, w]) => w > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4), tot = top.reduce((a, [, w]) => a + w, 0);
    top.forEach(([j, w], k) => { JO[i * 4 + k] = j; WO[i * 4 + k] = w / tot; });
  }
  const MP = piece.MP.map((d, t) => { const o = new Float32Array(n * 3); for (let i = 0; i < n; i++) o.set(bakeOne(piece, i, d, piece.MN[t]).p.sub(new THREE.Vector3(P[i * 3], P[i * 3 + 1], P[i * 3 + 2])).toArray(), i * 3); return o; });
  const MN = piece.MN.map((d, t) => { const o = new Float32Array(n * 3); for (let i = 0; i < n; i++) o.set(bakeOne(piece, i, piece.MP[t], d).n.sub(new THREE.Vector3(N[i * 3], N[i * 3 + 1], N[i * 3 + 2])).toArray(), i * 3); return o; });
  return { ...piece, P, N, J: JO, W: WO, MP, MN };
}
/** Welds identical vertices (position, normal, uv, colour, skin) of a baked piece. */
function weld(p) {
  const n = p.P.length / 3, key = new Map(), remap = new Uint32Array(n), keep = [];
  const r = (a, i, k, s = 1e5) => Array.from({ length: k }, (_, c) => Math.round(a[i * k + c] * s)).join(',');
  for (let i = 0; i < n; i++) {
    const kk = [r(p.P, i, 3), r(p.N, i, 3, 1e3), p.UV ? r(p.UV, i, 2) : '', p.C ? r(p.C, i, 3, 1e3) : '', r(p.J, i, 4, 1), r(p.W, i, 4, 1e3), ...p.MP.map(m => r(m, i, 3))].join('|');
    if (!key.has(kk)) { key.set(kk, keep.length); keep.push(i); }
    remap[i] = key.get(kk);
  }
  const sel = (a, k) => { if (!a) return a; const o = new a.constructor(keep.length * k); keep.forEach((s, i) => { for (let c = 0; c < k; c++) o[i * k + c] = a[s * k + c]; }); return o; };
  const IDX = Uint32Array.from(p.IDX, i => remap[i]);
  return { ...p, P: sel(p.P, 3), N: sel(p.N, 3), J: sel(p.J, 4), W: sel(p.W, 4), UV: sel(p.UV, 2), C: sel(p.C, 3), FW: sel(p.FW, 1), RGV: sel(p.RGV, 3), MP: p.MP.map(a => sel(a, 3)), MN: p.MN.map(a => sel(a, 3)), IDX };
}

// ---- the body: its face weight and the face's crop of the skin atlas
const faceLo = 1.58, faceHi = 1.64, faceU = 0.6;               // RDA blends the photographic skin over the head (1.50–1.60); here the head only
const FW = new Float32Array(nB);
for (let i = 0; i < nB; i++) FW[i] = body.UV[i * 2] < faceU ? 0 : smooth(faceLo, faceHi, body.P[i * 3 + 1]);
let u0 = 1, v0 = 1, u1 = 0, v1 = 0;
for (let i = 0; i < nB; i++) if (FW[i] > 0) { u0 = Math.min(u0, body.UV[i * 2]); u1 = Math.max(u1, body.UV[i * 2]); v0 = Math.min(v0, body.UV[i * 2 + 1]); v1 = Math.max(v1, body.UV[i * 2 + 1]); }
const SKIN_PX = 2048, pad = 8 / SKIN_PX;
u0 = Math.max(0, u0 - pad); v0 = Math.max(0, v0 - pad); u1 = Math.min(1, u1 + pad); v1 = Math.min(1, v1 + pad);
const crop = { left: Math.floor(u0 * SKIN_PX), top: Math.floor(v0 * SKIN_PX) }; crop.width = Math.ceil(u1 * SKIN_PX) - crop.left; crop.height = Math.ceil(v1 * SKIN_PX) - crop.top;
const UVc = new Float32Array(nB * 2);
for (let i = 0; i < nB; i++) { UVc[i * 2] = (body.UV[i * 2] * SKIN_PX - crop.left) / crop.width; UVc[i * 2 + 1] = (body.UV[i * 2 + 1] * SKIN_PX - crop.top) / crop.height; }
const bodyColour = new Float32Array(nB * 3); for (let i = 0; i < nB; i++) bodyColour.set([body.C[i * 4], body.C[i * 4 + 1], body.C[i * 4 + 2]], i * 3);

const baked = {};
baked.body = bake({ P: body.P, N: body.N, J: body.J, W: body.W, IDX: body.IDX, MP: body.MP, MN: body.MN, UV: UVc, C: bodyColour, FW });
for (const name of ['Eyes', 'Brows', 'Lashes']) {
  const m = readMesh(name);
  let IDX = m.IDX;
  if (name === 'Lashes') IDX = Uint32Array.from(Array.from({ length: m.IDX.length / 3 }, (_, t) => [m.IDX[t * 3], m.IDX[t * 3 + 1], m.IDX[t * 3 + 2]]).filter(t => t.some(v => m.P[v * 3 + 1] >= 1.678)).flat());   // RDA hides the lower lash cards (face-material.ts)
  baked[name] = bake({ P: m.P, N: m.N, J: m.J, W: m.W, IDX, UV: m.UV, MP: m.MP, MN: m.MP.map(a => new Float32Array(a.length)) });
}
baked.hair = weld(bake(hair));
// the ngemb's two cuts, from v4's own: A from the waist to above the knee (v4 0.64 m), B to the knee (v4 0.50 m); heights in RDA's space
const unwarp = y => { const ys = y <= vHip ? y / kLow : y <= vNeck ? yHip + (y - vHip) / kMid : yNeck + (y - vNeck); return (ys - T0.y) / G; };
const NGEMB = { top: unwarp(1.02), A: unwarp(0.64), B: unwarp(0.5) };
baked.ngembA = weld(bake(garment(NGEMB.top, NGEMB.A)));
baked.ngembB = weld(bake(garment(NGEMB.top, NGEMB.B)));
for (const b of ['athletic', 'heavy']) for (const part of ['armL', 'armR', 'waist', 'chest']) baked[`acc_${b}_${part}`] = weld(bake(acc[b][part]));

// pouch probes: for each pouch (rigid) the vertex nearest its anchor, its bone and its distance to the bone at rest (the checks follow it)
const probes = {};
for (const b of ['athletic', 'heavy']) for (const part of ['armL', 'armR', 'waist', 'chest']) {
  const raw = acc[b][part], seen = new Map();
  for (let i = 0; i < raw.P.length / 3; i++) {
    if (Number.isNaN(raw.RGV[i * 3])) continue;
    const key = raw.RGV.slice(i * 3, i * 3 + 3).join(','); if (!seen.has(key)) seen.set(key, { joint: raw.J[i * 4], anchor: new THREE.Vector3(...raw.RGV.slice(i * 3, i * 3 + 3)) });
  }
  const bk = baked[`acc_${b}_${part}`];
  probes[`${b}_${part}`] = [...seen.values()].map(({ joint, anchor }) => {
    const want = TF[joint].p(anchor); let best = -1, d = Infinity;
    for (let i = 0; i < bk.P.length / 3; i++) { if (bk.RGV[i * 3] !== anchor.x || bk.RGV[i * 3 + 1] !== anchor.y || bk.RGV[i * 3 + 2] !== anchor.z) continue; const e = Math.hypot(bk.P[i * 3] - want.x, bk.P[i * 3 + 1] - want.y, bk.P[i * 3 + 2] - want.z); if (e < d) { d = e; best = i; } }
    return { vertex: best, bone: MAP[NAMES[joint]] };
  });
}

// ---------------------------------------------------------------- the body's own copy of v4's skeleton: arms, sockets
const parentOf = n => v4root.listNodes().find(p => p.listChildren().includes(n));
const setWorld = (node, world) => node.setTranslation(world.clone().applyMatrix4(M4(parentOf(node)).invert()).toArray());
const refit = [];
for (const sd of ['L', 'R']) {
  const a = arms[sd];
  setWorld(v4joint[`upper_arm.${sd}`], a.tSh);
  const fl = new THREE.Vector3(...v4joint[`forearm.${sd}`].getTranslation()), hl = new THREE.Vector3(...v4joint[`hand.${sd}`].getTranslation());
  v4joint[`forearm.${sd}`].setTranslation(fl.clone().setLength(a.lenUp).toArray());
  v4joint[`hand.${sd}`].setTranslation(hl.clone().setLength(a.lenFa).toArray());
  const sock = v4root.listNodes().find(n => n.getName() === `socket_arm${sd}`);
  sock.setTranslation(fl.clone().setLength(a.lenUp * 0.7).toArray());   // where RDA's arm band sits (70 % down the upper arm)
  refit.push(`upper_arm.${sd}`, `forearm.${sd}`, `hand.${sd}`);
}
{ // the waist socket at RDA's belt, the neck socket at the middle of RDA's neck
  const waist = v4root.listNodes().find(n => n.getName() === 'socket_waist'), neck = v4root.listNodes().find(n => n.getName() === 'socket_neck');
  const belt = rigid.p(new THREE.Vector3(0, 0.997, 0)); belt.x = 0; belt.z = 0;
  setWorld(waist, belt);
  setWorld(neck, rigid.p(B.Neck.clone().lerp(B.Neck1, 0.5)));
}
for (const name of refit) {
  const node = v4joint[name], local = node.getTranslation();
  for (const anim of v4root.listAnimations()) for (const ch of anim.listChannels()) {
    if (ch.getTargetNode() !== node || ch.getTargetPath() !== 'translation') continue;
    const smp = ch.getSampler(), n = smp.getOutput().getCount(), arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) arr.set(local, i * 3);
    smp.setOutput(v4.createAccessor(`${name}_rda_rest`).setType('VEC3').setArray(arr).setBuffer(v4root.listBuffers()[0]));
  }
}
{
  const js = v4skin.listJoints(), ibm = new Float32Array(js.length * 16);
  js.forEach((j, k) => ibm.set(M4(j).invert().toArray(), k * 16));
  v4skin.setInverseBindMatrices(v4.createAccessor('ibm_rda').setType('MAT4').setArray(ibm).setBuffer(v4root.listBuffers()[0]));
}

// ---------------------------------------------------------------- textures
const lin = c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const skinCrop = sharp(file('public/assets/skin_m.png')).extract(crop);
const cropRaw = await skinCrop.clone().removeAlpha().raw().toBuffer({ resolveWithObject: true });
const faceMean = [0, 0, 0]; { const d = cropRaw.data, n = d.length / 3; for (let i = 0; i < d.length; i++) faceMean[i % 3] += lin(d[i] / 255) / n; }
// the eye atlas: RDA mutes its strong red iris saturation in a shader (face-material.ts); the same, baked into the pixels
const eyeRaw = await sharp(file('public/assets/eye_brown.png')).removeAlpha().raw().toBuffer({ resolveWithObject: true });
for (let i = 0; i < eyeRaw.data.length; i += 3) {
  const [r, g, b] = [eyeRaw.data[i] / 255, eyeRaw.data[i + 1] / 255, eyeRaw.data[i + 2] / 255];
  if (!(r >= g * 1.45 && r >= b * 1.5)) continue;
  const v = 0.2126 * r + 0.7152 * g + 0.0722 * b, m = 0.9;
  eyeRaw.data[i] = Math.round(255 * (r + (v * 0.95 - r) * m)); eyeRaw.data[i + 1] = Math.round(255 * (g + (v * 0.72 - g) * m)); eyeRaw.data[i + 2] = Math.round(255 * (b + (v * 0.5 - b) * m));
}
const eyeImg = sharp(eyeRaw.data, { raw: { width: eyeRaw.info.width, height: eyeRaw.info.height, channels: 3 } });
const TEX = {
  high: { face: 512, eye: 512, brow: 256 },
  medium: { face: 256, eye: 256, brow: 128 },
};
async function textures(level) {
  const t = TEX[level];
  return {
    face: await skinCrop.clone().removeAlpha().resize(t.face, Math.round(t.face * crop.height / crop.width)).jpeg({ quality: 86, mozjpeg: true }).toBuffer(),
    eye: await eyeImg.clone().resize(t.eye, t.eye).jpeg({ quality: 86, mozjpeg: true }).toBuffer(),
    brow: await sharp(file('public/assets/brows.png')).resize(t.brow, t.brow).png({ compressionLevel: 9 }).toBuffer(),
    lash: await sharp(file('public/assets/lashes.png')).resize(t.brow, t.brow).png({ compressionLevel: 9 }).toBuffer(),
  };
}

// ---------------------------------------------------------------- write
for (const node of v4root.listNodes()) if (node.getMesh()) node.dispose();
const buffer = v4root.listBuffers()[0];
const accessor = (type, arr, normalized = false) => v4.createAccessor().setType(type).setArray(arr).setBuffer(buffer).setNormalized(normalized);
const tex = { face: v4.createTexture('rda_face').setMimeType('image/jpeg'), eye: v4.createTexture('rda_eyes').setMimeType('image/jpeg'),
  brow: v4.createTexture('rda_brows').setMimeType('image/png'), lash: v4.createTexture('rda_lashes').setMimeType('image/png') };
const mats = {
  skin: v4.createMaterial('RDA_Skin').setBaseColorTexture(tex.face).setMetallicFactor(0).setRoughnessFactor(0.76).setDoubleSided(true),
  eyes: v4.createMaterial('RDA_Eyes').setBaseColorTexture(tex.eye).setMetallicFactor(0).setRoughnessFactor(0.3),
  brows: v4.createMaterial('RDA_Brows').setBaseColorTexture(tex.brow).setAlphaMode('MASK').setAlphaCutoff(0.25).setDoubleSided(true),
  lashes: v4.createMaterial('RDA_Lashes').setBaseColorTexture(tex.lash).setAlphaMode('MASK').setAlphaCutoff(0.45).setDoubleSided(true),
  hair: v4.createMaterial('Hair').setBaseColorFactor([0.006, 0.006, 0.005, 1]),
  cloth: v4.createMaterial('RDA_Ngemb'),
  leather: v4.createMaterial('RDA_Leather').setRoughnessFactor(0.9).setDoubleSided(true),
};
const rigNode = v4root.listNodes().find(n => n.getName() === 'DR_Rig');
const tris = {};
function addMesh(name, p, material, o = {}) {
  const n = p.P.length / 3, prim = v4.createPrimitive().setMaterial(material)
    .setAttribute('POSITION', accessor('VEC3', p.P)).setAttribute('NORMAL', accessor('VEC3', p.N))
    .setAttribute('JOINTS_0', accessor('VEC4', Uint8Array.from(p.J))).setAttribute('WEIGHTS_0', accessor('VEC4', Float32Array.from(p.W)))
    .setIndices(accessor('SCALAR', n < 65536 ? Uint16Array.from(p.IDX) : Uint32Array.from(p.IDX)));
  if (p.UV && o.uv !== false) prim.setAttribute('TEXCOORD_0', accessor('VEC2', Float32Array.from(p.UV)));
  if (p.C && o.color !== false) prim.setAttribute('COLOR_0', accessor('VEC3', Uint8Array.from(p.C, c => Math.round(Math.min(1, Math.max(0, c)) * 255)), true));
  if (p.FW) prim.setAttribute('_FACEW', accessor('SCALAR', Float32Array.from(p.FW)));
  const mesh = v4.createMesh(name).addPrimitive(prim);
  if (o.morph && p.MP.length) {
    p.MP.forEach((d, t) => { const tgt = v4.createPrimitiveTarget(TARGETS[t]).setAttribute('POSITION', accessor('VEC3', d)); if (p.MN[t]?.some(x => x !== 0)) tgt.setAttribute('NORMAL', accessor('VEC3', p.MN[t])); prim.addTarget(tgt); });
    mesh.setWeights(p.MP.map(() => 0)).setExtras({ targetNames: TARGETS });
  }
  const node = v4.createNode(name).setMesh(mesh).setSkin(v4skin);
  if (o.extras) node.setExtras(o.extras);
  rigNode.addChild(node);
  tris[name] = p.IDX.length / 3;
}
addMesh('RDA_Body', baked.body, mats.skin, { morph: true, extras: { rdaFaceMean: faceMean.map(x => +x.toFixed(5)) } });
addMesh('HeadRdaEyes_1', baked.Eyes, mats.eyes, { morph: true });
addMesh('HeadRdaBrows_2', baked.Brows, mats.brows, { morph: true });
addMesh('HeadRdaLashes_3', baked.Lashes, mats.lashes, { morph: true });
addMesh('Hair_Short', baked.hair, mats.hair, { morph: true });
addMesh('Ngemb_A', baked.ngembA, mats.cloth, { morph: true });
addMesh('Ngemb_B', baked.ngembB, mats.cloth, { morph: true });
for (const b of ['athletic', 'heavy']) for (const part of ['armL', 'armR', 'waist', 'chest']) addMesh(`RDA_Acc_${b}_${part}`, baked[`acc_${b}_${part}`], mats.leather, { extras: { rdaProbes: probes[`${b}_${part}`] } });
await v4.transform(prune({ keepLeaves: true, keepAttributes: true }));   // (keepAttributes: the ngemb's uv has no texture in the file: the game gives it its canvas)
fs.mkdirSync(OUT, { recursive: true });
const outputs = {};
for (const [level, name] of [['high', 'rda_wrestlers.glb'], ['medium', 'rda_wrestlers_m.glb']]) {
  const t = await textures(level);
  tex.face.setImage(new Uint8Array(t.face)); tex.eye.setImage(new Uint8Array(t.eye)); tex.brow.setImage(new Uint8Array(t.brow)); tex.lash.setImage(new Uint8Array(t.lash));
  const out = path.join(OUT, name); await io.write(out, v4);
  const meta = {}; for (const [k, b] of Object.entries(t)) { const m = await sharp(b).metadata(); meta[k] = { w: m.width, h: m.height, bytes: b.length, decodedRGBA: m.width * m.height * 4 }; }
  outputs[level] = { file: out, bytes: fs.statSync(out).size, sha256: crypto.createHash('sha256').update(fs.readFileSync(out)).digest('hex'), textures: meta };
}

// ---------------------------------------------------------------- report
const bb = new THREE.Box3(); for (let i = 0; i < baked.body.P.length; i += 3) bb.expandByPoint(new THREE.Vector3(baked.body.P[i], baked.body.P[i + 1], baked.body.P[i + 2]));
const bbH = new THREE.Box3(); for (let i = 0; i < baked.body.P.length; i += 3) bbH.expandByPoint(new THREE.Vector3(baked.body.P[i] + baked.body.MP[1][i], baked.body.P[i + 1] + baked.body.MP[1][i + 1], baked.body.P[i + 2] + baked.body.MP[1][i + 2]));
const r3 = v => v.toArray().map(x => +x.toFixed(4));
Object.assign(report, {
  scaleG: +G.toFixed(4), centre: r3(T0), trunkWarp: { hip: [+yHip.toFixed(4), vHip], neck: [+yNeck.toFixed(4), vNeck], belowHips: +kLow.toFixed(4), hipsToNeck: +kMid.toFixed(4) },
  legStretch: stretch,
  arms: Object.fromEntries(Object.entries(arms).map(([k, a]) => [k, { shoulder: r3(a.tSh), elbow: r3(a.tEl), wrist: r3(a.tWr), upperArm: +a.lenUp.toFixed(4), forearm: +a.lenFa.toFixed(4),
    shoulderFromV4: r3(a.shoulderShift), v4UpperArm: +a.v4Up.toFixed(4), v4Forearm: +a.v4Fa.toFixed(4), palmTwistDeg: +a.palmTwistDeg.toFixed(1) }])),
  boneMap: MAP, lowerBackSplit: { hipsBelow: +(ySpine - 0.05).toFixed(3), spineAbove: +(ySpine + 0.05).toFixed(3) },
  height: { athletic: +(bb.max.y - bb.min.y).toFixed(3), heavy: +(bbH.max.y - bbH.min.y).toFixed(3), soleMinY: +bb.min.y.toFixed(4) },
  face: { blend: [faceLo, faceHi], cropPx: crop, faceMeanLinear: faceMean.map(x => +x.toFixed(4)) },
  ngemb: { cutsRdaSpace: Object.fromEntries(Object.entries(NGEMB).map(([k, v]) => [k, +v.toFixed(4)])) },
  triangles: tris, accessories: accStats, probes, outputs,
});
fs.mkdirSync(path.dirname(REPORT), { recursive: true });
fs.writeFileSync(REPORT, JSON.stringify(report, null, 1) + '\n');
console.log(JSON.stringify({ outputs, scaleG: report.scaleG, legStretch: stretch, arms: report.arms, height: report.height, triangles: tris }, null, 1));
