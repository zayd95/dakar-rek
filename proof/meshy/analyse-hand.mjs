// What the Meshy hand looks like in the source rig: its frame (finger axis, palm normal, across), the fingers' spread and where the knuckles are.
// node proof/meshy/analyse-hand.mjs <rigged.glb> [Left|Right]
import * as THREE from 'three';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const [, , path, S = 'Left'] = process.argv;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS), doc = await io.read(path), root = doc.getRoot();
const skin = root.listSkins()[0], joints = skin.listJoints(), names = joints.map(j => j.getName());
const wp = n => new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(joints[names.indexOf(n)].getWorldMatrix()));
const pr = root.listMeshes()[0].listPrimitives()[0], P = pr.getAttribute('POSITION').getArray(), J = pr.getAttribute('JOINTS_0').getArray(), Wt = pr.getAttribute('WEIGHTS_0').getArray();
const ih = names.indexOf(`${S}Hand`), wrist = wp(`${S}Hand`), elbow = wp(`${S}ForeArm`);
const pts = []; for (let v = 0; v < P.length / 3; v++) { let w = 0; for (let k = 0; k < 4; k++) if (J[v * 4 + k] === ih) w += Wt[v * 4 + k]; if (w > 0.5) pts.push(new THREE.Vector3(P[v * 3], P[v * 3 + 1], P[v * 3 + 2])); }
const c = pts.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / pts.length);
const Y = c.clone().sub(wrist).normalize();
// PCA of the hand's points around the finger axis: the thinnest direction is the palm normal
const q = pts.map(p => p.clone().sub(c)), cov = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
for (const p of q) { const a = [p.x, p.y, p.z]; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) cov[i][j] += a[i] * a[j]; }
// power iteration for the three axes
const mul = (m, v) => new THREE.Vector3(m[0][0] * v.x + m[0][1] * v.y + m[0][2] * v.z, m[1][0] * v.x + m[1][1] * v.y + m[1][2] * v.z, m[2][0] * v.x + m[2][1] * v.y + m[2][2] * v.z);
const eig = (m, excl = []) => { let v = new THREE.Vector3(0.3, 0.5, 0.8); for (let i = 0; i < 200; i++) { v = mul(m, v); for (const e of excl) v.addScaledVector(e, -v.dot(e)); v.normalize(); } return v; };
const e1 = eig(cov), e2 = eig(cov, [e1]), e3 = new THREE.Vector3().crossVectors(e1, e2);
const f = v => `(${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)})`;
console.log(S, 'hand points', pts.length, 'wrist', f(wrist), 'centre-wrist axis Y', f(Y), 'forearm dir', f(wrist.clone().sub(elbow).normalize()));
console.log('PCA: widest', f(e1), 'mid', f(e2), 'thinnest (palm normal)', f(e3));
const ext = (axis) => { const d = pts.map(p => p.clone().sub(wrist).dot(axis)); return [Math.min(...d), Math.max(...d)].map(x => +x.toFixed(3)); };
console.log('extent along Y', ext(Y), 'across e1', ext(e1), 'across e2', ext(e2), 'along normal', ext(e3));
// the lateral spread by distance along Y (bins): where the fingers fan out
const Z = e3.clone(), X = new THREE.Vector3().crossVectors(Y, Z).normalize();
for (let b = 0; b < 10; b++) { const lo = b * 0.02, hi = lo + 0.02, sel = pts.filter(p => { const d = p.clone().sub(wrist).dot(Y); return d >= lo && d < hi; }); if (!sel.length) continue; const xs = sel.map(p => p.clone().sub(wrist).dot(X)), zs = sel.map(p => p.clone().sub(wrist).dot(Z)); console.log(`d ${lo.toFixed(2)}-${hi.toFixed(2)} n=${sel.length} across ${Math.min(...xs).toFixed(3)}..${Math.max(...xs).toFixed(3)}  thick ${Math.min(...zs).toFixed(3)}..${Math.max(...zs).toFixed(3)}`); }
