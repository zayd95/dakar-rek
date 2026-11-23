// Triangles of a body that the 'grip' morph stretches: longest edge before / after. node proof/meshy/stretch.mjs <body.glb>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(process.argv[2]);
const prim = doc.getRoot().listMeshes().find(m => m.getName() === 'Meshy_Body').listPrimitives()[0];
const P = prim.getAttribute('POSITION').getArray(), I = prim.getIndices().getArray(), D = prim.listTargets()[0].getAttribute('POSITION');
const Dd = new Float32Array(P.length); for (let i = 0; i < P.length / 3; i++) { const v = D.getElement(i, []); Dd.set(v, i * 3); }
const len = (a, b, off) => Math.hypot(...[0, 1, 2].map(k => (P[a * 3 + k] + (off ? Dd[a * 3 + k] : 0)) - (P[b * 3 + k] + (off ? Dd[b * 3 + k] : 0))));
const rows = [];
for (let t = 0; t < I.length; t += 3) { const [a, b, c] = [I[t], I[t + 1], I[t + 2]]; const moved = [a, b, c].some(i => Math.hypot(Dd[i * 3], Dd[i * 3 + 1], Dd[i * 3 + 2]) > 1e-6); if (!moved) continue;
  const e0 = Math.max(len(a, b), len(b, c), len(c, a)), e1 = Math.max(len(a, b, 1), len(b, c, 1), len(c, a, 1)); rows.push({ t: t / 3, e0: +(e0 * 100).toFixed(1), e1: +(e1 * 100).toFixed(1), ratio: +(e1 / e0).toFixed(2), at: [a, b, c].map(i => [0, 1, 2].map(k => +(P[i * 3 + k]).toFixed(2)).join(',')).slice(0, 1)[0] }); }
rows.sort((x, y) => y.e1 - x.e1);
console.log('triangles moved by the morph:', rows.length, '| longest edge after (cm), top 12:'); for (const r of rows.slice(0, 12)) console.log(JSON.stringify(r));
console.log('longest edge before, max (cm):', Math.max(...rows.map(r => r.e0)));
