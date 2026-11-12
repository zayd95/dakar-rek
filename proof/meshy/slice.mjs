import * as THREE from 'three';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { fitHand } from '../../scripts/meshy/relax-hand.mjs';
const [path, S='Left', side=1] = process.argv.slice(2);
const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(path), root = doc.getRoot();
const skin = root.listSkins()[0], joints = skin.listJoints(), names = joints.map(j => j.getName());
const wp = n => new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(joints[names.indexOf(n)].getWorldMatrix()));
const pr = root.listMeshes()[0].listPrimitives()[0], P = pr.getAttribute('POSITION').getArray(), J = pr.getAttribute('JOINTS_0').getArray(), Wt = pr.getAttribute('WEIGHTS_0').getArray();
const ih = names.indexOf(`${S}Hand`), wr = wp(`${S}Hand`), pts = [];
for (let v = 0; v < P.length / 3; v++) { let w = 0; for (let k = 0; k < 4; k++) if (J[v*4+k] === ih) w += Wt[v*4+k]; if (w > 0.5) pts.push(new THREE.Vector3(P[v*3],P[v*3+1],P[v*3+2]).sub(wr)); }
const hm = fitHand(pts, +side);
const fr = pts.map(q => [q.dot(hm.X), q.dot(hm.Y), q.dot(hm.N)]);
console.log('L', hm.L.toFixed(3), 'verts', pts.length);
for (const [lo, hi] of [[0.5,0.6],[0.6,0.7],[0.7,0.8],[0.8,0.9],[0.9,1.0]]) { const sel = fr.filter(c => c[1] >= lo*hm.L && c[1] < hi*hm.L); if (!sel.length) continue; const cs = sel.map(c => c[2]), as = sel.map(c => c[0]); console.log(`b ${lo}-${hi} L: n=${sel.length} across ${Math.min(...as).toFixed(3)}..${Math.max(...as).toFixed(3)}  thickness c ${Math.min(...cs).toFixed(3)}..${Math.max(...cs).toFixed(3)} (range ${(Math.max(...cs)-Math.min(...cs)).toFixed(3)})`); }
