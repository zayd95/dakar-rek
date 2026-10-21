// Fair only the male's bent upper-arm/forearm skin surface, in place on the existing rigged GLBs.
// No source archive, Blender, remote generation, bones, bind matrices, textures, or animation data are needed.
// The shirt/shoulder transition and hands are fixed boundaries; the hand reconstruction runs after this pass.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const VERSION = 1, CYCLES = 16, LAMBDA = 0.24, MU = -0.252, MAX_MOVE = 0.025;
const qkey = p => p.map(x => Math.round(x * 1e6)).join(',');
export async function repairMaleArms(file) {
  if (!/^body_m(?:_low)?\.glb$/.test(path.basename(file))) throw Error('Male-only pass: expected body_m.glb or body_m_low.glb');
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS), doc = await io.read(file), root = doc.getRoot();
  const mesh = root.listMeshes().find(m => m.getName() === 'Meshy_Body');
  if (!mesh) throw Error('Expected Meshy_Body');
  if (mesh.getExtras().maleArmFairing === VERSION) return { file, alreadyRepaired: true };
  const prim = mesh.listPrimitives()[0], skin = root.listSkins()[0], bones = skin.listJoints().map(j => j.getName());
  const posAcc = prim.getAttribute('POSITION'), joints = prim.getAttribute('JOINTS_0').getArray(), weights = prim.getAttribute('WEIGHTS_0').getArray();
  const pos = Array.from(posAcc.getArray()), originalVertices = pos.length / 3, indices = prim.getIndices().getArray();
  const representatives = new Int32Array(originalVertices), vertexForKey = new Map(), points = [];
  for (let i = 0; i < originalVertices; i++) {
    const p = pos.slice(3 * i, 3 * i + 3), key = qkey(p);
    if (!vertexForKey.has(key)) { vertexForKey.set(key, points.length); points.push(p); }
    representatives[i] = vertexForKey.get(key);
  }
  const neighbors = Array.from({ length: points.length }, () => new Set());
  for (let t = 0; t < indices.length; t += 3) {
    const tri = [indices[t], indices[t + 1], indices[t + 2]].map(i => representatives[i]);
    for (let k = 0; k < 3; k++) { const a = tri[k], b = tri[(k + 1) % 3]; if (a !== b) { neighbors[a].add(b); neighbors[b].add(a); } }
  }
  // The shoulder seam and existing hand are fixed boundaries. Fair exposed upper-arm/forearm skin only.
  const arm = new Float32Array(originalVertices), shoulder = new Float32Array(originalVertices), hand = new Float32Array(originalVertices);
  for (let i = 0; i < originalVertices; i++) for (let k = 0; k < 4; k++) {
    const name = bones[joints[4 * i + k]], w = weights[4 * i + k];
    if (name === 'upper_arm.L' || name === 'forearm.L' || name === 'upper_arm.R' || name === 'forearm.R') arm[i] += w;
    if (name === 'shoulder.L' || name === 'shoulder.R') shoulder[i] += w;
    if (name === 'hand.L' || name === 'hand.R') hand[i] += w;
  }
  const selected = new Uint8Array(points.length).fill(1), seen = new Uint8Array(points.length);
  for (let i = 0; i < originalVertices; i++) {
    const r = representatives[i], eligible = arm[i] >= 0.35 && shoulder[i] < 0.20 && hand[i] < 0.08;
    if (seen[r]) selected[r] &= Number(eligible); else { seen[r] = 1; selected[r] = Number(eligible); }
  }
  if (selected.reduce((a, b) => a + b, 0) < 100) throw Error('Unexpected arm topology: refusing to modify the model');
  const start = points.map(p => p.slice()), current = points.map(p => p.slice());
  function step(amount) {
    const next = current.map(p => p.slice());
    for (let i = 0; i < current.length; i++) if (selected[i] && neighbors[i].size) {
      const avg = [0, 0, 0]; for (const j of neighbors[i]) for (let k = 0; k < 3; k++) avg[k] += current[j][k] / neighbors[i].size;
      for (let k = 0; k < 3; k++) next[i][k] += amount * (avg[k] - current[i][k]);
    }
    for (let i = 0; i < current.length; i++) current[i] = next[i];
  }
  const cycles = file.includes('_low') ? 10 : CYCLES;
  for (let i = 0; i < cycles; i++) { step(LAMBDA); step(MU); }
  let maxMove = 0, movedVertices = 0;
  for (let i = 0; i < points.length; i++) if (selected[i]) {
    const d = Math.hypot(current[i][0] - start[i][0], current[i][1] - start[i][1], current[i][2] - start[i][2]);
    const scale = d > MAX_MOVE ? MAX_MOVE / d : 1;
    for (let k = 0; k < 3; k++) current[i][k] = start[i][k] + (current[i][k] - start[i][k]) * scale;
    const finalD = d * scale; maxMove = Math.max(maxMove, finalD); if (finalD > 1e-5) movedVertices++;
  }
  const output = Float32Array.from(pos);
  for (let i = 0; i < originalVertices; i++) output.set(current[representatives[i]], 3 * i);
  posAcc.setArray(output);
  // Rebuild normals for affected triangles; the existing smooth-normal pass joins UV seams afterward.
  const normalAcc = prim.getAttribute('NORMAL'), normal = Array.from(normalAcc.getArray()), accum = new Float64Array(normal.length);
  for (let t = 0; t < indices.length; t += 3) {
    const ids = [indices[t], indices[t + 1], indices[t + 2]], a = current[representatives[ids[0]]], b = current[representatives[ids[1]]], c = current[representatives[ids[2]]];
    const u = b.map((x, k) => x - a[k]), v = c.map((x, k) => x - a[k]), n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    for (const id of ids) for (let k = 0; k < 3; k++) accum[3 * id + k] += n[k];
  }
  for (let i = 0; i < originalVertices; i++) if (selected[representatives[i]]) {
    const n = accum.slice(3 * i, 3 * i + 3), len = Math.hypot(...n) || 1; for (let k = 0; k < 3; k++) normal[3 * i + k] = n[k] / len;
  }
  normalAcc.setArray(Float32Array.from(normal)); mesh.setExtras({ ...mesh.getExtras(), maleArmFairing: VERSION });
  await io.write(file, doc);
  return { file, version: VERSION, cycles, vertices: originalVertices, weldedVertices: points.length, affectedWeldedVertices: selected.reduce((a, b) => a + b, 0), movedVertices, maxDisplacementMeters: maxMove };
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) console.log(JSON.stringify(await repairMaleArms(process.argv[2]), null, 2));
