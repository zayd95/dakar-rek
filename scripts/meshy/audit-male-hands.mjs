// Audit the male's arm and hand repair against the GLB it started from (the previous branch's body): what may move, what must not, and the mesh's health.
// Usage: node scripts/meshy/audit-male-hands.mjs <before.glb> <after.glb>   (exit 1 on any failure)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const SLEEVE = 0.065, MAX_ARM_MOVE = 0.0251, io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const load = async f => {
  const d = await io.read(f), root = d.getRoot(), p = root.listMeshes().find(m => m.getName() === 'Meshy_Body').listPrimitives()[0], joints = root.listSkins()[0].listJoints();
  return { P: p.getAttribute('POSITION').getArray(), UV: p.getAttribute('TEXCOORD_0').getArray(), J: p.getAttribute('JOINTS_0').getArray(), W: p.getAttribute('WEIGHTS_0').getArray(), I: p.getIndices().getArray(), joints, names: joints.map(j => j.getName()), root };
};
const [a, b] = await Promise.all(process.argv.slice(2, 4).map(load));
const key = (g, i) => [0, 1, 2].map(k => Math.round(g.P[3 * i + k] * 1e5)).join(',');
function health(g) {   // welded-position edges with more than two faces, and open edges
  const e = new Map();
  for (let t = 0; t < g.I.length; t += 3) for (let k = 0; k < 3; k++) { const x = key(g, g.I[t + k]), y = key(g, g.I[t + (k + 1) % 3]); if (x === y) continue; const s = x < y ? x + '|' + y : y + '|' + x; e.set(s, (e.get(s) || 0) + 1); }
  let nonManifold = 0, open = 0; for (const v of e.values()) { if (v > 2) nonManifold++; if (v === 1) open++; } return { nonManifold, open, triangles: g.I.length / 3, vertices: g.P.length / 3 };
}
const dominant = (g, i) => { let best = '', bw = 0; for (let k = 0; k < 4; k++) if (g.W[4 * i + k] > bw) { bw = g.W[4 * i + k]; best = g.names[g.J[4 * i + k]]; } return best; };
const arm = n => /^(upper_arm|forearm)\.[LR]$/.test(n);
// sleeve: further than SLEEVE metres above the elbow along the upper arm (as repair-male-arms.mjs)
const axis = {}; for (const s of ['L', 'R']) { const sh = a.joints.find(j => j.getName() === `upper_arm.${s}`).getWorldTranslation(), el = a.joints.find(j => j.getName() === `forearm.${s}`).getWorldTranslation(), u = el.map((x, k) => x - sh[k]), l = Math.hypot(...u); axis[s] = { el, u: u.map(x => x / l) }; }
const sleeve = i => { const n = dominant(a, i); if (!arm(n)) return false; const { el, u } = axis[n.slice(-1)]; return (el[0] - a.P[3 * i]) * u[0] + (el[1] - a.P[3 * i + 1]) * u[1] + (el[2] - a.P[3 * i + 2]) * u[2] > SLEEVE; };
// original vertices keep their order; the hand's clipped ones drop out, so walk both lists matching UV and first joint
const moved = {}; let j = 0, matched = 0, sleeveMoved = 0, sleeveCount = 0, otherMoved = 0;
for (let i = 0; i < a.P.length / 3 && j < b.P.length / 3; i++) {
  if (a.UV[2 * i] !== b.UV[2 * j] || a.UV[2 * i + 1] !== b.UV[2 * j + 1] || a.J[4 * i] !== b.J[4 * j]) continue;
  const d = Math.hypot(a.P[3 * i] - b.P[3 * j], a.P[3 * i + 1] - b.P[3 * j + 1], a.P[3 * i + 2] - b.P[3 * j + 2]), n = dominant(a, i), g = arm(n) ? 'arm' : /^hand\./.test(n) ? 'hand' : 'rest';
  const m = moved[g] ??= { vertices: 0, moved: 0, max: 0 }; m.vertices++; if (d > 1e-6) m.moved++; m.max = Math.max(m.max, d);
  if (g === 'rest' && d > 1e-6) otherMoved++;
  if (sleeve(i)) { sleeveCount++; if (d > 1e-6) sleeveMoved++; }
  matched++; j++;
}
const before = health(a), after = health(b);
const checks = {
  'nothing outside the arms and hands moves (head, face, shoulders, torso, legs)': otherMoved === 0,
  [`arm skin moves at most ${MAX_ARM_MOVE * 1000} mm`]: (moved.arm?.max ?? 0) <= MAX_ARM_MOVE,
  'sleeve vertices do not move': sleeveMoved === 0,
  'no new non-manifold edges': after.nonManifold <= before.nonManifold,
  'no new open edges': after.open <= before.open,
  'skeleton and animation untouched (same joints)': a.names.join() === b.names.join(),
};
console.log(JSON.stringify({ before, after, matched, moved: Object.fromEntries(Object.entries(moved).map(([k, v]) => [k, { ...v, maxMm: +(v.max * 1000).toFixed(2) }])), sleeve: { vertices: sleeveCount, moved: sleeveMoved }, checks }, null, 1));
const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([k]) => k);
if (failed.length) { console.error('FAILED:', failed.join('; ')); process.exit(1); }
