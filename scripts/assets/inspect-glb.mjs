// Prints a GLB's node tree, meshes (triangles, material, bounds), materials and textures. Usage: node scripts/assets/inspect-glb.mjs a.glb [b.glb…]
import { io } from './glb-utils.mjs';
for (const f of process.argv.slice(2)) {
  const doc = await io.read(f), root = doc.getRoot();
  console.log('==', f);
  const walk = (n, d) => { const m = n.getMesh(); let info = ''; if (m) { const p = m.listPrimitives(); info = ' mesh ' + p.map(q => (q.getIndices()?.getCount() ?? q.getAttribute('POSITION').getCount()) / 3 + 'tri/' + (q.getMaterial()?.getName())).join(','); const b = p[0].getAttribute('POSITION'); info += ' min ' + b.getMinNormalized([]).map(x => x.toFixed(2)) + ' max ' + b.getMaxNormalized([]).map(x => x.toFixed(2)); }
    console.log(' '.repeat(d * 2) + n.getName(), 't=' + n.getTranslation().map(x => +x.toFixed(3)), 's=' + n.getScale().map(x => +x.toFixed(2)), info); n.listChildren().forEach(c => walk(c, d + 1)); };
  root.listScenes()[0].listChildren().forEach(n => walk(n, 0));
  console.log('materials', root.listMaterials().map(m => m.getName() + ':' + m.getBaseColorFactor().map(x => +x.toFixed(2))), 'textures', root.listTextures().map(t => t.getMimeType() + ' ' + t.getSize()));
}
