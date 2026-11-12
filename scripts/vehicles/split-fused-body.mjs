// A generated car (Meshy…) is ONE fused mesh with its wheels on it, whatever the prompt said. This turns it into the source prepare-vehicle-glb.mjs
// expects: a `body` node and four `wheel-*` nodes, each wheel cut out of the shell by its own cylinder and centred on its hub, so the game can spin and
// steer them. It also paints out what a car of ours must not carry (badges, plates, lettering): triangles whose centroid lies in a measured 3D box get
// their texels in the base-colour texture filled (a flat colour or the colour sampled next to it). Normal / metal-rough maps are dropped (the game is Lambert).
//
//   node scripts/vehicles/split-fused-body.mjs assets-src/vehicles/compacte.split.json
//
// Manifest: source (the fused GLB, private), rotateY (to face +z, left +x), out (the split GLB, private), wheels { radius (source units), contact (fraction of height
// counted as ground contact), margin (m, source units, added to the radius for the cut), lateralPad }, paintOut (a JSON of boxes in the SOURCE frame).
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { Document } from '@gltf-transform/core';
import { io, mat, scenePrimitives, round } from '../assets/glb-utils.mjs';

const manifestPath = path.resolve(process.argv[2] ?? '');
if (!fs.existsSync(manifestPath)) { console.error('usage: node scripts/vehicles/split-fused-body.mjs <manifest.json>'); process.exit(2); }
const M = JSON.parse(fs.readFileSync(manifestPath, 'utf8')), dir = path.dirname(manifestPath), rel = p => path.isAbsolute(p) ? p : path.resolve(dir, p);
const doc = await io.read(rel(M.source)), sp = scenePrimitives(doc);
if (sp.length !== 1) { console.error(`expected one fused primitive, found ${sp.length}`); process.exit(2); }
const { prim, world } = sp[0], posA = prim.getAttribute('POSITION'), uvA = prim.getAttribute('TEXCOORD_0'), nrmA = prim.getAttribute('NORMAL'), idxA = prim.getIndices();
const nV = posA.getCount(), nT = idxA.getCount() / 3, mtl = prim.getMaterial();
const src = new Float32Array(nV * 3), uv = new Float32Array(nV * 2), nor = new Float32Array(nV * 3), v = [0, 0, 0], ix = idxA.getArray();
for (let i = 0; i < nV; i++) { posA.getElement(i, v); src.set(mat.point(world, v), i * 3); uvA.getElement(i, v); uv.set([v[0], v[1]], i * 2); nrmA.getElement(i, v); nor.set(mat.dir(world, v), i * 3); }

// ---- 1. paint out badges, plates, lettering (SOURCE frame)
let texBytes = null, painted = 0;
const baseTex = mtl.getBaseColorTexture();
if (M.paintOut && baseTex) {
  const regions = JSON.parse(fs.readFileSync(rel(M.paintOut), 'utf8'));
  const { data, info } = await sharp(Buffer.from(baseTex.getImage())).ensureAlpha().raw().toBuffer({ resolveWithObject: true }), W = info.width, H = info.height;
  const texel = (u, vv) => { const px = Math.min(W - 1, Math.max(0, Math.round(u * W))), py = Math.min(H - 1, Math.max(0, Math.round(vv * H))); const o = (py * W + px) * 4; return [data[o], data[o + 1], data[o + 2]]; };
  // Who owns which texel: the atlas is a scatter of tiny islands, and a triangle's own pixels sit right beside those of other parts (the bonnet, the boot lid).
  // Painting a margin around a cut triangle would stain them, so only the texels a cut triangle covers are painted (and the one-texel gaps between those).
  const owner = new Int32Array(W * H).fill(-1);
  const rasterTri = (a, b, c, visit) => {                                // a, b, c: [px, py]
    const minx = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]))), maxx = Math.min(W - 1, Math.ceil(Math.max(a[0], b[0], c[0]))), miny = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]))), maxy = Math.min(H - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
    const d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]); if (Math.abs(d) < 1e-9) return;
    for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) {
      const px = x + 0.5, py = y + 0.5, l1 = ((b[1] - c[1]) * (px - c[0]) + (c[0] - b[0]) * (py - c[1])) / d, l2 = ((c[1] - a[1]) * (px - c[0]) + (a[0] - c[0]) * (py - c[1])) / d, l3 = 1 - l1 - l2;
      if (l1 >= 0 && l2 >= 0 && l3 >= 0) visit(y * W + x);
    }
  };
  const triUv = t => [0, 1, 2].map(k => [uv[ix[t * 3 + k] * 2] * W, uv[ix[t * 3 + k] * 2 + 1] * H]);
  for (let t = 0; t < nT; t++) { const [a, b, c] = triUv(t); rasterTri(a, b, c, o => { owner[o] = t; }); }
  for (const r of regions) {
    const col = r.colour ?? (r.fillUv ? texel(r.fillUv[0], r.fillUv[1]) : [128, 128, 128]), [x0, y0, z0, x1, y1, z1] = r.box, pad = 0.004, cut = new Set(); let tris = 0;
    for (let t = 0; t < nT; t++) {
      const i = [ix[t * 3], ix[t * 3 + 1], ix[t * 3 + 2]], cx = (src[i[0] * 3] + src[i[1] * 3] + src[i[2] * 3]) / 3, cy = (src[i[0] * 3 + 1] + src[i[1] * 3 + 1] + src[i[2] * 3 + 1]) / 3, cz = (src[i[0] * 3 + 2] + src[i[1] * 3 + 2] + src[i[2] * 3 + 2]) / 3;
      if (cx < x0 - pad || cx > x1 + pad || cy < y0 - pad || cy > y1 + pad || cz < z0 - pad || cz > z1 + pad) continue;
      cut.add(t); tris++;
    }
    const paintTexel = o => { const q = o * 4; data[q] = col[0]; data[q + 1] = col[1]; data[q + 2] = col[2]; painted++; };
    const mine = new Uint8Array(W * H); for (let o = 0; o < W * H; o++) if (cut.has(owner[o])) mine[o] = 1;
    for (let o = 0; o < W * H; o++) if (mine[o]) paintTexel(o);
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const o = y * W + x; if (!mine[o] && owner[o] < 0 && (mine[o - 1] || mine[o + 1] || mine[o - W] || mine[o + W])) paintTexel(o); }
    console.log(`painted out ${r.id}: ${tris} triangles -> rgb(${col.join(',')})`);
  }
  texBytes = await sharp(data, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
}

// ---- 1b. relax rough areas (SOURCE frame): where a badge or a plate was cut out, the shell keeps its jagged relief. The vertices inside each box
// are smoothed over their neighbours (the box's own border stays put, so the surface still meets what is around it) and re-lit with one smooth normal.
if (M.relax) {
  const cell = 1e-4, key = i => `${Math.round(src[i * 3] / cell)},${Math.round(src[i * 3 + 1] / cell)},${Math.round(src[i * 3 + 2] / cell)}`;
  const id = new Int32Array(nV), rep = [], members = []; const ids = new Map();
  for (let i = 0; i < nV; i++) { const k = key(i); let g = ids.get(k); if (g === undefined) { g = rep.length; ids.set(k, g); rep.push(i); members.push([]); } id[i] = g; members[g].push(i); }
  const nb = rep.map(() => new Set());
  for (let t = 0; t < nT; t++) { const g = [id[ix[t * 3]], id[ix[t * 3 + 1]], id[ix[t * 3 + 2]]]; for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) if (a !== b) nb[g[a]].add(g[b]); }
  const P = rep.map(i => [src[i * 3], src[i * 3 + 1], src[i * 3 + 2]]);
  for (const r of M.relax) {
    const [x0, y0, z0, x1, y1, z1] = r.box, free = []; P.forEach((q, g) => { if (q[0] >= x0 && q[0] <= x1 && q[1] >= y0 && q[1] <= y1 && q[2] >= z0 && q[2] <= z1) free.push(g); });
    for (let it = 0; it < (r.iterations ?? 4); it++) {
      const next = free.map(g => { const n = [...nb[g]]; const m = [0, 0, 0]; for (const h of n) for (let k = 0; k < 3; k++) m[k] += P[h][k] / n.length; return P[g].map((v, k) => v + (r.lambda ?? 0.5) * (m[k] - v)); });
      free.forEach((g, i) => { P[g] = next[i]; });
    }
    console.log(`relaxed ${r.id}: ${free.length} vertices, ${r.iterations ?? 4} passes`);
    r.free = free;
  }
  for (let g = 0; g < rep.length; g++) for (const i of members[g]) src.set(P[g], i * 3);
  // one smooth normal per place, from every face that meets there
  const fn = new Float32Array(nV * 3).fill(0), acc = rep.map(() => [0, 0, 0]);
  for (let t = 0; t < nT; t++) {
    const a = ix[t * 3], b = ix[t * 3 + 1], c = ix[t * 3 + 2], ux = src[b * 3] - src[a * 3], uy = src[b * 3 + 1] - src[a * 3 + 1], uz = src[b * 3 + 2] - src[a * 3 + 2], vx = src[c * 3] - src[a * 3], vy = src[c * 3 + 1] - src[a * 3 + 1], vz = src[c * 3 + 2] - src[a * 3 + 2];
    const f = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]; for (const v of [a, b, c]) for (let k = 0; k < 3; k++) acc[id[v]][k] += f[k];
  }
  for (const r of M.relax) for (const g of r.free) {
    const l = Math.hypot(...acc[g]); if (l < 1e-12) continue; const v = acc[g].map(x => x / l);
    for (const i of members[g]) { nor[i * 3] = v[0]; nor[i * 3 + 1] = v[1]; nor[i * 3 + 2] = v[2]; }
  }
}

// ---- 2. turn the car to face +z and find the four wheels from where the tyres touch the ground
const rot = mat.rotY(((M.rotateY ?? 0) * Math.PI) / 180), pos = new Float32Array(nV * 3), nrm = new Float32Array(nV * 3);
for (let i = 0; i < nV; i++) { pos.set(mat.point(rot, [src[i * 3], src[i * 3 + 1], src[i * 3 + 2]]), i * 3); nrm.set(mat.dir(rot, [nor[i * 3], nor[i * 3 + 1], nor[i * 3 + 2]]), i * 3); }
let yMin = Infinity, yMax = -Infinity; for (let i = 0; i < nV; i++) { yMin = Math.min(yMin, pos[i * 3 + 1]); yMax = Math.max(yMax, pos[i * 3 + 1]); }
const R = M.wheels.radius, contactY = yMin + (M.wheels.contact ?? 0.02) * (yMax - yMin), hubY = yMin + R;
const bySide = { 1: [], '-1': [] };
for (let i = 0; i < nV; i++) if (pos[i * 3 + 1] < contactY) bySide[Math.sign(pos[i * 3]) || 1].push([pos[i * 3], pos[i * 3 + 2]]);
const wheels = [];
for (const side of [1, -1]) {
  const pts = bySide[side].sort((a, b) => a[1] - b[1]), groups = [];
  for (const p of pts) { const g = groups.at(-1); if (g && p[1] - g.at(-1)[1] < 0.08) g.push(p); else groups.push([p]); }
  for (const g of groups.filter(g => g.length > 8)) {
    const zs = g.map(p => p[1]), xs = g.map(p => Math.abs(p[0]));
    wheels.push({ side, z: (Math.min(...zs) + Math.max(...zs)) / 2, in: Math.min(...xs), out: Math.max(...xs) });
  }
}
console.log(`ground contacts: ${wheels.length} wheels`, wheels.map(w => `${w.side > 0 ? 'L' : 'R'} z ${round(w.z, 3)} |x| ${round(w.in, 3)}..${round(w.out, 3)}`).join(' · '));
if (wheels.length !== 4) { console.error('expected four wheels'); process.exit(1); }
const NAME = w => `wheel-${w.z > 0 ? 'f' : 'r'}${w.side > 0 ? 'l' : 'r'}`;
const cut = R + (M.wheels.margin ?? 0.004), pad = M.wheels.lateralPad ?? 0.04;
const owner = new Int8Array(nT).fill(-1);
for (let t = 0; t < nT; t++) {
  const a = ix[t * 3], b = ix[t * 3 + 1], c = ix[t * 3 + 2];
  const cx = (pos[a * 3] + pos[b * 3] + pos[c * 3]) / 3, cy = (pos[a * 3 + 1] + pos[b * 3 + 1] + pos[c * 3 + 1]) / 3, cz = (pos[a * 3 + 2] + pos[b * 3 + 2] + pos[c * 3 + 2]) / 3;
  wheels.forEach((w, k) => { if (Math.sign(cx) === w.side && Math.abs(cx) >= w.in - pad && Math.abs(cx) <= w.out + 0.012 && Math.hypot(cz - w.z, cy - hubY) <= cut) owner[t] = k; });
}

// ---- 3. write the split source: a body and four wheels, each wheel centred on its hub
const out = new Document(); out.createBuffer();
const material = out.createMaterial('paint').setBaseColorFactor([1, 1, 1, 1]).setMetallicFactor(0).setRoughnessFactor(1);
if (texBytes || baseTex) { const t = out.createTexture('base').setMimeType('image/png').setImage(new Uint8Array(texBytes ?? baseTex.getImage())); material.setBaseColorTexture(t); }
function subMesh(name, picks, origin) {
  const remap = new Map(), P = [], N = [], U = [], I = [];
  for (const t of picks) for (let k = 0; k < 3; k++) {
    const vi = ix[t * 3 + k]; let n = remap.get(vi);
    if (n === undefined) { n = P.length / 3; remap.set(vi, n); P.push(pos[vi * 3] - origin[0], pos[vi * 3 + 1] - origin[1], pos[vi * 3 + 2] - origin[2]); N.push(nrm[vi * 3], nrm[vi * 3 + 1], nrm[vi * 3 + 2]); U.push(uv[vi * 2], uv[vi * 2 + 1]); }
    I.push(n);
  }
  const acc = (type, arr, T) => out.createAccessor().setType(type).setArray(new T(arr));
  const p = out.createPrimitive().setAttribute('POSITION', acc('VEC3', P, Float32Array)).setAttribute('NORMAL', acc('VEC3', N, Float32Array)).setAttribute('TEXCOORD_0', acc('VEC2', U, Float32Array)).setIndices(acc('SCALAR', I, Uint32Array)).setMaterial(material);
  return out.createMesh(name).addPrimitive(p);
}
const scene = out.createScene(); out.getRoot().setDefaultScene(scene);
const bodyTris = []; for (let t = 0; t < nT; t++) if (owner[t] < 0) bodyTris.push(t);
scene.addChild(out.createNode('body').setMesh(subMesh('body', bodyTris, [0, 0, 0])));
const report = [];
wheels.forEach((w, k) => {
  const tris = []; for (let t = 0; t < nT; t++) if (owner[t] === k) tris.push(t);
  const origin = [(w.side > 0 ? 1 : -1) * ((w.in + w.out) / 2), hubY, w.z];
  scene.addChild(out.createNode(NAME(w)).setTranslation(origin).setMesh(subMesh(NAME(w), tris, origin)));
  report.push(`${NAME(w)} ${tris.length}`);
});
fs.mkdirSync(path.dirname(rel(M.out)), { recursive: true });
await io.write(rel(M.out), out);
console.log(`body ${bodyTris.length} triangles; wheels: ${report.join(', ')}; ${painted} texels painted; wrote ${path.relative(process.cwd(), rel(M.out))}`);
