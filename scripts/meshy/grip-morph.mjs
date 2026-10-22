// Turns the temporary _GRIPD / _GRIPN vertex attributes written by transplant-to-v4-rig.mjs (and carried through simplify-body.mjs) into a glTF morph target named
// "grip": the hand closed on a handlebar grip. The game sets its weight to 1 while the rider has the Ride pose (src/actors/humanoid.ts); at weight 0 the mesh is the
// relaxed hand, unchanged. Usage: node scripts/meshy/grip-morph.mjs <in.glb> <out.glb>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const [inp, outp] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS), doc = await io.read(inp);
let moved = 0;
for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
  const gd = prim.getAttribute('_GRIPD'), gn = prim.getAttribute('_GRIPN'); if (!gd || !gn) continue;
  const D = gd.getArray(), n = D.length / 3, keep = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (Math.hypot(D[i * 3], D[i * 3 + 1], D[i * 3 + 2]) > 1e-6) { keep[i] = 1; moved++; }
  const target = doc.createPrimitiveTarget('grip').setAttribute('POSITION', doc.createAccessor('grip_pos').setType('VEC3').setArray(Float32Array.from(D)).setBuffer(gd.getBuffer()).setSparse(true))
    .setAttribute('NORMAL', doc.createAccessor('grip_nrm').setType('VEC3').setArray(Float32Array.from(gn.getArray())).setBuffer(gd.getBuffer()).setSparse(true));
  prim.addTarget(target); prim.setAttribute('_GRIPD', null).setAttribute('_GRIPN', null);
  mesh.setWeights([0]).setExtras({ ...(mesh.getExtras() ?? {}), targetNames: ['grip'] });
}
await doc.transform(async d => { for (const a of d.getRoot().listAccessors()) if (a.listParents().every(p => p.propertyType === 'Root')) a.dispose(); });
await io.write(outp, doc);
console.log(JSON.stringify({ out: outp, verticesMoved: moved }));
