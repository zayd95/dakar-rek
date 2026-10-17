// Puts a Meshy body on the game's own skeleton: the output is character_v4.glb with its skeleton, skin and ALL its clips
// kept byte-for-byte, and the v4 meshes replaced by the Meshy mesh, posed into v4's rest pose and skinned to v4's 20 bones.
// The clips, the computed gait, the pose solvers, the strike rig and the gesture overlay then run on it unchanged.
//
// Usage (repo root; needs: npm i --no-save @gltf-transform/core@4 @gltf-transform/functions@4 @gltf-transform/extensions@4 sharp):
//   node scripts/meshy/transplant-to-v4-rig.mjs <rigged.glb from Meshy> <out.glb> [--twist -75] [--tex 1024]
//        [--torso-warp 1] [--hand-align 1] [--lateral 1] [--foot-fit 1]     (0 turns each fit step off; --lateral 0..1 = how much of the sideways
//        gap between the Meshy shoulders/hips and v4's joints is closed by moving the limb geometry; 1 = exact pivots)
//
// Method (a linear-blend bake, nothing is re-authored): uniform scale so the straightened leg reaches v4's hip height (0.95 m);
// legs and arms are rotated and stretched segment by segment onto v4's knee, elbow and wrist positions; hands and feet stay rigid
// (feet flat and pointing forward, hands twisted so the palms face the thighs); the torso, neck and head keep their shape.
// Skin weights are Meshy's own, merged onto v4's bones. Base colour only, JPEG.
import fs from 'node:fs';
import * as THREE from 'three';
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune } from '@gltf-transform/functions';

const args = process.argv.slice(2);
const [meshyPath, outPath] = args;
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i < 0 ? d : args[i + 1]; };
const TWIST = (Number(opt('twist', -75)) * Math.PI) / 180, TEX = Number(opt('tex', 1024));
const WARP = Number(opt('torso-warp', 1)), HANDALIGN = Number(opt('hand-align', 1)), LATERAL = Number(opt('lateral', 1)), FOOTFIT = Number(opt('foot-fit', 1));
const FOOT = { heel: -0.035, toe: 0.178 };      // the gait's foot model (src/actors/gait.ts RIG): heel 3.5 cm behind the ankle, toe tip 17.8 cm ahead
const V4 = 'public/assets/character_v4.glb';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const v4 = await io.read(V4), my = await io.read(meshyPath);
const v4root = v4.getRoot(), myRoot = my.getRoot();
const M4 = n => new THREE.Matrix4().fromArray(n.getWorldMatrix());
const pos = m => new THREE.Vector3().setFromMatrixPosition(m);

// ---- v4 targets (world, rest) and Meshy bind joints (world)
const v4joint = Object.fromEntries(v4root.listSkins()[0].listJoints().map(j => [j.getName(), j]));
const T = name => pos(M4(v4joint[name]));
const mySkin = myRoot.listSkins()[0], myJoints = mySkin.listJoints(), myNames = myJoints.map(j => j.getName());
const B = Object.fromEntries(myJoints.map(j => [j.getName(), pos(M4(j))]));

// ---- uniform scale and body offset: the straightened leg (ankle height + shin + thigh) reaches v4's hip height
const legLen = side => B[`${side}Foot`].y + B[`${side}Leg`].distanceTo(B[`${side}Foot`]) + B[`${side}UpLeg`].distanceTo(B[`${side}Leg`]);
const G = T('thigh.L').y / ((legLen('Left') + legLen('Right')) / 2);
const hipMid = B.LeftUpLeg.clone().add(B.RightUpLeg).multiplyScalar(0.5).multiplyScalar(G);
const T0 = new THREE.Vector3(-hipMid.x, 0, -hipMid.z);                // hip joints centred on x = 0, z = 0 like v4's
const A = Object.fromEntries(Object.entries(B).map(([k, p]) => [k, p.clone().multiplyScalar(G).add(T0)]));   // anatomical, scaled

// ---- vertical warp of the trunk: the Meshy hip-joint and neck heights are moved to v4's (0.95 and 1.55) so the shoulders land where v4's joints are
const yHip = (A.LeftUpLeg.y + A.RightUpLeg.y) / 2, yNeck = A.neck.y, vHip = T('thigh.L').y, vNeck = T('neck').y;
const warpY = y => (WARP ? (y <= yHip ? y * (vHip / yHip) : y <= yNeck ? vHip + (y - yHip) * ((vNeck - vHip) / (yNeck - yHip)) : vNeck + (y - yNeck)) : y);
const warpK = WARP ? (vNeck - vHip) / (yNeck - yHip) : 1;
const rigid = { p: x => { const q = x.clone().multiplyScalar(G).add(T0); q.y = warpY(q.y); return q; }, n: n => n.clone() };
// ---- per-bone transforms (functions on world points / directions)
const minRot = (a, t) => new THREE.Quaternion().setFromUnitVectors(a.clone().normalize(), t.clone().normalize());
/** Segment O→E (anatomical) placed on o→e: rotate about O by the minimal rotation (plus a twist about the target axis), stretch along it. */
function segment(O, E, o, e, twist = 0, twistPivot = o) {
  const a = E.clone().sub(O), t = e.clone().sub(o), axis = t.clone().normalize();
  const R = minRot(a, t).premultiply(new THREE.Quaternion().setFromAxisAngle(axis, twist));
  const k = t.length() / a.length();
  return { R, k, o, O, axis, twistPivot, stretch: k,
    p: x => { const u = x.clone().multiplyScalar(G).add(T0).sub(O).applyQuaternion(R); return o.clone().add(u).addScaledVector(axis, (k - 1) * u.dot(axis)); },
    n: n => n.clone().applyQuaternion(R) };
}
const out = {};          // Meshy bone name -> { p, n }
const report = [];
for (const [bone] of Object.entries(B)) out[bone] = rigid;
for (const [s, S, sign] of [['L', 'Left', 1], ['R', 'Right', -1]]) {
  const hip = A[`${S}UpLeg`], knee = A[`${S}Leg`], ankle = A[`${S}Foot`], toe = A[`${S}ToeBase`];
  const tKnee = T(`shin.${s}`), tAnkle = new THREE.Vector3(T(`foot.${s}`).x, ankle.y, T(`foot.${s}`).z);   // the anatomical ankle (sole 0.16 below), not v4's pivot
  const thigh = segment(hip, knee, hip, tKnee), shin = segment(knee, ankle, tKnee, tAnkle);
  // foot: rigid, flat, turned to point straight ahead (Meshy's feet toe out)
  const ta = toe.clone().sub(ankle), yaw = Math.atan2(ta.x * sign, ta.z) * sign, Ry = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -yaw);
  // the shoe's length is fitted to the gait's foot model (the gait plants a heel and a ball that sit where v4's tiny feet have them)
  const footZ = (() => { const pr = myRoot.listMeshes()[0].listPrimitives()[0], Pp = pr.getAttribute('POSITION').getArray(), Jj = pr.getAttribute('JOINTS_0').getArray(), Ww = pr.getAttribute('WEIGHTS_0').getArray(); const ids = [myNames.indexOf(`${S}Foot`), myNames.indexOf(`${S}ToeBase`)]; let lo = 9, hi = -9; for (let v = 0; v < Pp.length / 3; v++) { let w = 0; for (let k = 0; k < 4; k++) if (ids.includes(Jj[v * 4 + k])) w += Ww[v * 4 + k]; if (w < 0.6) continue; const u = new THREE.Vector3(Pp[v * 3], Pp[v * 3 + 1], Pp[v * 3 + 2]).multiplyScalar(G).add(T0).sub(ankle).applyQuaternion(Ry); if (u.y < -0.08) lo = Math.min(lo, u.z); hi = Math.max(hi, u.z); } return { lo, hi }; })();
  const fs = FOOTFIT ? (FOOT.toe - FOOT.heel) / (footZ.hi - footZ.lo) : 1, fz = FOOTFIT ? FOOT.heel - footZ.lo * fs : 0;
  const foot = { p: x => { const u = x.clone().multiplyScalar(G).add(T0).sub(ankle).applyQuaternion(Ry); u.z = u.z * fs + fz; return tAnkle.clone().add(u); }, n: n => n.clone().applyQuaternion(Ry) };
  report.push([`shoe_length.${s}`, fs]);
  out[`${S}UpLeg`] = thigh; out[`${S}Leg`] = shin; out[`${S}Foot`] = foot; out[`${S}ToeBase`] = foot;
  report.push([`thigh.${s}`, thigh.k], [`shin.${s}`, shin.k]);
  // arm
  const sh = A[`${S}Arm`], el = A[`${S}ForeArm`], wr = A[`${S}Hand`];
  const shW = rigid.p(B[`${S}Arm`]);                                            // where the trunk warp puts the anatomical shoulder
  const dx = (1 - LATERAL) * (shW.x - T(`upper_arm.${s}`).x);                    // sideways gap left open (0 with --lateral 1)
  const lat = v => v.clone().add(new THREE.Vector3(dx, 0, 0));
  const tSh = lat(T(`upper_arm.${s}`)), tEl = lat(T(`forearm.${s}`)), tWr = lat(T(`hand.${s}`));
  const up = segment(sh, el, tSh, tEl);
  const fa = segment(el, wr, tEl, tWr, (TWIST / 2) * sign);
  // the hand's own axis (wrist to the centre of the hand's vertices) is brought in line with the forearm, so the wrist is straight
  const handCentre = (() => { const pr = myRoot.listMeshes()[0].listPrimitives()[0], Pp = pr.getAttribute('POSITION').getArray(), Jj = pr.getAttribute('JOINTS_0').getArray(), Ww = pr.getAttribute('WEIGHTS_0').getArray(); const ih = myNames.indexOf(`${S}Hand`), c = new THREE.Vector3(); let n = 0; for (let v = 0; v < Pp.length / 3; v++) { let w = 0; for (let k = 0; k < 4; k++) if (Jj[v * 4 + k] === ih) w += Ww[v * 4 + k]; if (w > 0.6) { c.x += Pp[v * 3]; c.y += Pp[v * 3 + 1]; c.z += Pp[v * 3 + 2]; n++; } } return c.multiplyScalar(1 / Math.max(n, 1) * G).add(T0); })();
  const handAxis = HANDALIGN ? handCentre.clone().sub(wr) : wr.clone().sub(el);
  const handR = minRot(handAxis, tWr.clone().sub(tEl)).premultiply(new THREE.Quaternion().setFromAxisAngle(tWr.clone().sub(tEl).normalize(), TWIST * sign));
  const hand = { p: x => { const u = x.clone().multiplyScalar(G).add(T0).sub(wr).applyQuaternion(handR); return tWr.clone().add(u); }, n: n => n.clone().applyQuaternion(handR) };
  out[`${S}Arm`] = up; out[`${S}ForeArm`] = fa; out[`${S}Hand`] = hand;
  report.push([`upper_arm.${s}`, up.k], [`forearm.${s}`, fa.k]);
}

// ---- map Meshy bones onto v4's
const MAP = { Hips: 'hips', Spine02: 'spine', Spine01: 'chest', Spine: 'chest', neck: 'neck', Head: 'head', head_end: 'head', headfront: 'head' };
for (const [s, S] of [['L', 'Left'], ['R', 'Right']]) Object.assign(MAP, { [`${S}Shoulder`]: `shoulder.${s}`, [`${S}Arm`]: `upper_arm.${s}`, [`${S}ForeArm`]: `forearm.${s}`, [`${S}Hand`]: `hand.${s}`, [`${S}UpLeg`]: `thigh.${s}`, [`${S}Leg`]: `shin.${s}`, [`${S}Foot`]: `foot.${s}`, [`${S}ToeBase`]: `foot.${s}` });
const v4skin = v4root.listSkins()[0], v4Index = Object.fromEntries(v4skin.listJoints().map((j, i) => [j.getName(), i]));
for (const n of myNames) if (!MAP[n]) throw new Error(`unmapped Meshy bone ${n}`);

// ---- bake
const prim = myRoot.listMeshes()[0].listPrimitives()[0];
const P = prim.getAttribute('POSITION').getArray(), N = prim.getAttribute('NORMAL').getArray(), UV = prim.getAttribute('TEXCOORD_0').getArray();
const J = prim.getAttribute('JOINTS_0').getArray(), W = prim.getAttribute('WEIGHTS_0').getArray(), IDX = prim.getIndices().getArray();
const nV = P.length / 3, P2 = new Float32Array(nV * 3), N2 = new Float32Array(nV * 3), J2 = new Uint8Array(nV * 4), W2 = new Float32Array(nV * 4);
const v = new THREE.Vector3(), nn = new THREE.Vector3(), acc = new THREE.Vector3(), accN = new THREE.Vector3();
for (let i = 0; i < nV; i++) {
  acc.set(0, 0, 0); accN.set(0, 0, 0);
  const merged = new Map();
  for (let k = 0; k < 4; k++) {
    const w = W[i * 4 + k]; if (w <= 0) continue;
    const name = myNames[J[i * 4 + k]], tf = out[name];
    v.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); nn.set(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]);
    acc.addScaledVector(tf.p(v), w); accN.addScaledVector(tf.n(nn), w);
    const t = v4Index[MAP[name]]; merged.set(t, (merged.get(t) ?? 0) + w);
  }
  P2.set([acc.x, acc.y, acc.z], i * 3); accN.normalize(); N2.set([accN.x, accN.y, accN.z], i * 3);
  const top = [...merged].sort((a, b) => b[1] - a[1]).slice(0, 4); const sum = top.reduce((s, [, w]) => s + w, 0);
  top.forEach(([j, w], k) => { J2[i * 4 + k] = j; W2[i * 4 + k] = w / sum; });
}

// ---- write: v4 document minus its meshes, plus the Meshy body
for (const node of v4root.listNodes()) if (node.getMesh()) node.dispose();
const buffer = v4root.listBuffers()[0], acc3 = (type, arr, sem) => v4.createAccessor(sem).setType(type).setArray(arr).setBuffer(buffer);
const image = await sharp(Buffer.from(prim.getMaterial().getBaseColorTexture().getImage())).resize(TEX, TEX).jpeg({ quality: 84, mozjpeg: true }).toBuffer();
const tex = v4.createTexture('meshy_base').setImage(new Uint8Array(image)).setMimeType('image/jpeg');
const mat = v4.createMaterial('Meshy').setBaseColorTexture(tex).setMetallicFactor(0).setRoughnessFactor(0.85).setDoubleSided(true);
const mesh = v4.createMesh('Meshy_Body').addPrimitive(v4.createPrimitive()
  .setAttribute('POSITION', acc3('VEC3', P2, 'pos')).setAttribute('NORMAL', acc3('VEC3', N2, 'nrm')).setAttribute('TEXCOORD_0', acc3('VEC2', UV, 'uv'))
  .setAttribute('JOINTS_0', acc3('VEC4', J2, 'j')).setAttribute('WEIGHTS_0', acc3('VEC4', W2, 'w'))
  .setIndices(acc3('SCALAR', IDX instanceof Uint32Array ? IDX : Uint16Array.from(IDX), 'i')).setMaterial(mat));
const rig = v4root.listNodes().find(n => n.getName() === 'DR_Rig');
rig.addChild(v4.createNode('Meshy_Body').setMesh(mesh).setSkin(v4skin));
await v4.transform(prune({ keepLeaves: true }));   // keepLeaves: the socket_* empties are leaves that props attach to
await io.write(outPath, v4);

// ---- report
const bb = new THREE.Box3(); for (let i = 0; i < nV; i++) bb.expandByPoint(v.set(P2[i * 3], P2[i * 3 + 1], P2[i * 3 + 2]));
console.log(JSON.stringify({ out: outPath, bytes: fs.statSync(outPath).size, scaleG: +G.toFixed(4), height: +(bb.max.y - bb.min.y).toFixed(3), minY: +bb.min.y.toFixed(3), vertices: nV, triangles: IDX.length / 3,
  segmentStretch: Object.fromEntries(report.map(([k, s]) => [k, +s.toFixed(3)])), twistDeg: +(TWIST * 180 / Math.PI).toFixed(1), torsoWarp: WARP ? +warpK.toFixed(3) : 0, handAlign: HANDALIGN, lateral: LATERAL }, null, 1));
