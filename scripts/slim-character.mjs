// Slims the Blender export of the v6 character for the game. Needs @gltf-transform/core and @gltf-transform/functions (v4),
// e.g. installed in a scratch folder: npm i @gltf-transform/core@4 @gltf-transform/functions@4. Usage: node slim-character.mjs in.glb out.glb
import { NodeIO } from '@gltf-transform/core';
import { prune, dedup, resample, sparse } from '@gltf-transform/functions';
const [,, src, dst] = process.argv;
const io = new NodeIO();
const doc = await io.read(src);
const root = doc.getRoot();
let removed = 0;
for (const anim of root.listAnimations()) {
  for (const ch of anim.listChannels()) {
    const path = ch.getTargetPath(), node = ch.getTargetNode()?.getName();
    if (path === 'scale' || (path === 'translation' && node !== 'Hips')) { ch.dispose(); removed++; }
  }
}
for (const n of root.listNodes()) {
  const ex = n.getExtras();
  if (ex && Object.keys(ex).length) { const keep = ex.morph_bones ? { morph_bones: ex.morph_bones } : {}; n.setExtras(keep); }
  n.setName(n.getName().replace(/\.\d+$/, ''));
}
for (const m of root.listMeshes()) {
  // morph deltas below 0.05 mm are refit noise: zero them so mostly-still targets become sparse
  for (const p of m.listPrimitives()) for (const t of p.listTargets()) {
    const a = t.getAttribute('POSITION'); if (!a) continue;
    const arr = a.getArray(); for (let i = 0; i < arr.length; i++) if (Math.abs(arr[i]) < 5e-5) arr[i] = 0;
    a.setArray(arr);
  }
  m.setName(m.getName().replace(/\.\d+$/, ''));
  // baked ambient occlusion in COLOR_0: soften it (0.42 + 0.58 * ao), keep it as 3 floats
  for (const p of m.listPrimitives()) {
    const c = p.getAttribute('COLOR_0'); if (!c) continue;
    const n = c.getCount(), out = new Float32Array(n * 3), el = [];
    for (let i = 0; i < n; i++) { c.getElement(i, el); for (let k = 0; k < 3; k++) out[i * 3 + k] = 0.42 + 0.58 * el[k]; }
    c.setArray(out).setType('VEC3').setNormalized(false);
  }
}
root.listScenes().forEach(s => s.setExtras({}));
await doc.transform(resample({ tolerance: 1e-4 }), sparse({ ratio: 0.3 }), prune({ keepLeaves: true, keepAttributes: true }), dedup());
await io.write(dst, doc);
console.log('removed channels', removed);
