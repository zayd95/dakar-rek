// Connected pieces of a Meshy body (triangles joined where positions coincide): is the hair, the jacket, the shoes a separate shell that could be swapped?
// node proof/meshy/components.mjs <rigged.glb>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(process.argv[2]);
const pr = doc.getRoot().listMeshes()[0].listPrimitives()[0], P = pr.getAttribute('POSITION').getArray(), I = pr.getIndices().getArray();
const key = i => `${Math.round(P[i*3]*1e4)},${Math.round(P[i*3+1]*1e4)},${Math.round(P[i*3+2]*1e4)}`, id = new Map(); const vid = i => { const k = key(i); if (!id.has(k)) id.set(k, id.size); return id.get(k); };
const parent = []; const find = a => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
const tri = []; for (let t = 0; t < I.length; t += 3) tri.push([vid(I[t]), vid(I[t+1]), vid(I[t+2]), I[t]]);
for (let i = 0; i < id.size; i++) parent[i] = i;
for (const [a, b, c] of tri) { parent[find(a)] = find(b); parent[find(b)] = find(c); }
const comp = new Map(); for (const [a, , , v0] of tri) { const r = find(a); const o = comp.get(r) ?? { tris: 0, y: [9, -9], x: [9, -9] }; o.tris++; const y = P[v0*3+1], x = P[v0*3]; o.y = [Math.min(o.y[0], y), Math.max(o.y[1], y)]; o.x = [Math.min(o.x[0], x), Math.max(o.x[1], x)]; comp.set(r, o); }
const rows = [...comp.values()].sort((a, b) => b.tris - a.tris);
console.log(`${rows.length} connected pieces, ${tri.length} triangles`); for (const r of rows.slice(0, 12)) console.log(`${String(r.tris).padStart(6)} tris  y ${r.y[0].toFixed(2)}..${r.y[1].toFixed(2)}  x ${r.x[0].toFixed(2)}..${r.x[1].toFixed(2)}`);
