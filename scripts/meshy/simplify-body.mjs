// Free level-of-detail for a transplanted Meshy body: welds the mesh, simplifies it with meshoptimizer (the skin weights travel with the
// vertices), optionally shrinks the texture. Usage: node scripts/meshy/simplify-body.mjs <in.glb> <out.glb> [--ratio 0.5] [--error 0.002] [--tex 512]
//   [--smooth 60]   re-computes the normals smooth across split vertices (seams, flat-shaded meshes) except over creases sharper than 60 degrees
// Needs: npm i --no-save @gltf-transform/core@4 @gltf-transform/functions@4 @gltf-transform/extensions@4 meshoptimizer sharp
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, simplify, prune } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
const args = process.argv.slice(2), [inp, out] = args, opt = (n, d) => { const i = args.indexOf(`--${n}`); return i < 0 ? d : Number(args[i + 1]); };
const ratio = opt('ratio', 0.5), error = opt('error', 0.002), tex = opt('tex', 0), smooth = opt('smooth', 0);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS), doc = await io.read(inp);
const count = () => { let t = 0, v = 0; for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) { t += p.getIndices().getCount() / 3; v += p.getAttribute('POSITION').getCount(); } return [t, v]; };
const before = count();
await MeshoptSimplifier.ready;
if (smooth) for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) {
  const P = p.getAttribute('POSITION').getArray(), I = p.getIndices().getArray(), N = p.getAttribute('NORMAL'), out = Float32Array.from(N.getArray()), cos = Math.cos(smooth * Math.PI / 180);
  const T = I.length / 3, fn = new Float32Array(T * 3), key = v => `${Math.round(P[v * 3] * 1e4)},${Math.round(P[v * 3 + 1] * 1e4)},${Math.round(P[v * 3 + 2] * 1e4)}`, at = new Map();
  for (let t = 0; t < T; t++) {
    const [a, b, c] = [I[t * 3], I[t * 3 + 1], I[t * 3 + 2]], e1 = [P[b * 3] - P[a * 3], P[b * 3 + 1] - P[a * 3 + 1], P[b * 3 + 2] - P[a * 3 + 2]], e2 = [P[c * 3] - P[a * 3], P[c * 3 + 1] - P[a * 3 + 1], P[c * 3 + 2] - P[a * 3 + 2]];
    fn.set([e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]], t * 3);   // area-weighted
    for (const v of [a, b, c]) { const k = key(v); (at.get(k) ?? at.set(k, []).get(k)).push(t); }
  }
  const unit = (x, y, z) => { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };
  for (let t = 0; t < T; t++) for (const v of [I[t * 3], I[t * 3 + 1], I[t * 3 + 2]]) {
    const own = unit(fn[t * 3], fn[t * 3 + 1], fn[t * 3 + 2]); let x = 0, y = 0, z = 0;
    for (const f of at.get(key(v))) { const n = unit(fn[f * 3], fn[f * 3 + 1], fn[f * 3 + 2]); if (n[0] * own[0] + n[1] * own[1] + n[2] * own[2] >= cos) { x += fn[f * 3]; y += fn[f * 3 + 1]; z += fn[f * 3 + 2]; } }
    out.set(unit(x, y, z), v * 3);
  }
  N.setArray(out);
}
await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio, error, lockBorder: false }), prune({ keepLeaves: true }));
if (tex) for (const t of doc.getRoot().listTextures()) t.setImage(new Uint8Array(await sharp(Buffer.from(t.getImage())).resize(tex, tex).jpeg({ quality: 84, mozjpeg: true }).toBuffer())).setMimeType('image/jpeg');
await io.write(out, doc);
console.log(JSON.stringify({ out, trianglesBefore: before[0], trianglesAfter: count()[0], verticesBefore: before[1], verticesAfter: count()[1], texture: tex || 'unchanged' }));
