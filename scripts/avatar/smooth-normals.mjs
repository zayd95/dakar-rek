// Smooth normals across a Meshy body's split vertices (its UV seams: down the middle of the homme's face, for one), except over creases sharper than 60°: the
// light then runs across a seam instead of breaking on it, which shows on lighter skin tones. The same step scripts/meshy/simplify-body.mjs takes with --smooth,
// for a body that is not simplified; in place, keeps everything else (morph targets, skin). Usage: node scripts/avatar/smooth-normals.mjs <body.glb> [crease°=60]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const [file, crease = '60'] = process.argv.slice(2), cos = Math.cos(Number(crease) * Math.PI / 180);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS), doc = await io.read(file);
let changed = 0;
for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) {
  const P = p.getAttribute('POSITION').getArray(), I = p.getIndices().getArray(), N = p.getAttribute('NORMAL'), before = N.getArray(), out = Float32Array.from(before);
  const T = I.length / 3, fn = new Float32Array(T * 3), key = v => `${Math.round(P[v * 3] * 1e4)},${Math.round(P[v * 3 + 1] * 1e4)},${Math.round(P[v * 3 + 2] * 1e4)}`, at = new Map();
  for (let t = 0; t < T; t++) {
    const [a, b, c] = [I[t * 3], I[t * 3 + 1], I[t * 3 + 2]], e1 = [P[b * 3] - P[a * 3], P[b * 3 + 1] - P[a * 3 + 1], P[b * 3 + 2] - P[a * 3 + 2]], e2 = [P[c * 3] - P[a * 3], P[c * 3 + 1] - P[a * 3 + 1], P[c * 3 + 2] - P[a * 3 + 2]];
    fn.set([e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]], t * 3);
    for (const v of [a, b, c]) { const k = key(v); (at.get(k) ?? at.set(k, []).get(k)).push(t); }
  }
  const unit = (x, y, z) => { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };
  for (let t = 0; t < T; t++) for (const v of [I[t * 3], I[t * 3 + 1], I[t * 3 + 2]]) {
    const own = unit(fn[t * 3], fn[t * 3 + 1], fn[t * 3 + 2]); let x = 0, y = 0, z = 0;
    for (const f of at.get(key(v))) { const n = unit(fn[f * 3], fn[f * 3 + 1], fn[f * 3 + 2]); if (n[0] * own[0] + n[1] * own[1] + n[2] * own[2] >= cos) { x += fn[f * 3]; y += fn[f * 3 + 1]; z += fn[f * 3 + 2]; } }
    out.set(unit(x, y, z), v * 3);
  }
  for (let i = 0; i < out.length; i++) if (Math.abs(out[i] - before[i]) > 1e-3) { changed++; }
  N.setArray(out);
}
await io.write(file, doc);
console.log(JSON.stringify({ file, normalComponentsChanged: changed }));
