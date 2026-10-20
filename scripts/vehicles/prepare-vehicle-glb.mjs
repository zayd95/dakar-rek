// Turns any vehicle GLB (a free kit, a Meshy model, a Blender export) into the game's replacement for ONE kit vehicle, and verifies it.
//
//   node scripts/vehicles/prepare-vehicle-glb.mjs assets-src/vehicles/compacte.pilot.json
//
// The game keeps everything else of the vehicle (ownership, driving, parking, save, seats, doors, cameras): only the look changes,
// so the model must fit what those were built for. The manifest names the source and the kit target (`kit-target.ts` prints it);
// the script
//   1. turns the source to face +z, left = +x (rotateY), takes the wheels out (nodes matching `wheelNodes`, or the wheel library
//      when the body has none: a Meshy body is one fused shell, so its wheels are generated away and these are put on);
//   2. fits the BODY to the kit's length x width x height (per-axis scale; the stretch is reported and refused beyond `maxStretch`
//      unless the model is declared a stand-in), ground clearance as the kit's;
//   3. puts four SEPARATE wheels at the kit's axle positions and radius (node `axle_<fl|fr|rl|rr>` at the hub, child `wheel_*`
//      spinning about X; the front axles are what steers), bottoms exactly on the ground;
//   4. writes the GLB and a sidecar JSON, re-reads the GLB and checks: wheels (count, hub, radius, ground contact), overall size,
//      head room at the driver seat, triangle / draw-call / texture / file budgets. Exit code 1 if a check fails.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { MeshoptSimplifier } from 'meshoptimizer';
import { joinPrimitives, prune, dedup, textureCompress, weld, simplify } from '@gltf-transform/functions';
import { io, mat, scenePrimitives, bakePrimitive, boundsOf, triCountOf, topAt, crossingsAbove, compactPrimitive, round } from '../assets/glb-utils.mjs';

const manifestPath = path.resolve(process.argv[2] ?? '');
if (!fs.existsSync(manifestPath)) { console.error('usage: node scripts/vehicles/prepare-vehicle-glb.mjs <manifest.json>'); process.exit(2); }
const M = JSON.parse(fs.readFileSync(manifestPath, 'utf8')), dir = path.dirname(manifestPath);
const rel = p => path.isAbsolute(p) ? p : path.resolve(dir, p), repo = path.resolve(dir, '../..');
const T = JSON.parse(fs.readFileSync(rel(M.target), 'utf8'));
const srcFile = rel(M.source), outFile = path.resolve(repo, M.out), sideFile = outFile.replace(/\.glb$/, '.json');
const lim = { maxTris: 8000, maxDrawCalls: 6, textureMax: 1024, maxKB: 600, maxStretch: 1.12, clearance: T.wheels[0].r * 0.55, ...M.limits };
const checks = []; const check = (name, ok, value) => { checks.push({ name, ok: !!ok, value }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${value !== undefined ? '  ' + (typeof value === 'object' ? JSON.stringify(value) : value) : ''}`); };

const doc = await io.read(srcFile);
const rot = mat.rotY(((M.rotateY ?? 0) * Math.PI) / 180);
const wheelRe = new RegExp(M.wheelNodes ?? '^wheel', 'i');

// the game is Lambert: only the base colour counts (a generated model ships normal and metal-rough maps nobody will draw)
for (const m of doc.getRoot().listMaterials()) m.setNormalTexture(null).setOcclusionTexture(null).setMetallicRoughnessTexture(null).setEmissiveTexture(null);
const own = M.wheelFit === 'own';       // a generated car's own wheels (split-fused-body.mjs): its own hubs and radius, checked against the kit's, instead of the kit's axles

// ---- 1. split the source into body and wheels
const all = scenePrimitives(doc), srcWheels = new Map(), bodyParts = [];
for (const s of all) {
  const world = mat.mul(rot, s.world);
  if (wheelRe.test(s.node.getName())) { (srcWheels.get(s.node) ?? srcWheels.set(s.node, []).get(s.node)).push({ prim: s.prim, world }); }
  else bodyParts.push({ prim: s.prim, world });
}
const analyse = parts => {                                              // a wheel's hub, radius (half of the larger extents across the axle) and width
  const baked = parts.map(p => bakePrimitive(doc, p.prim, p.world)), b = boundsOf(baked), axle = b.size.indexOf(Math.min(...b.size));
  const cross = b.size.filter((_, k) => k !== axle);
  return { centre: b.centre, r: Math.max(...cross) / 2, width: b.size[axle], axle, parts };
};
let wheelSrc = [...srcWheels.values()].map(analyse);
let fromLibrary = false;
if (!wheelSrc.length) {
  if (!M.wheelLibrary) { console.error('no wheel nodes in the source and no wheelLibrary in the manifest'); process.exit(2); }
  const lib = await io.read(rel(M.wheelLibrary)), lp = scenePrimitives(lib);
  const adopt = lp.map(s => ({ prim: bakeInto(doc, s.prim), world: s.world }));
  wheelSrc = [analyse(adopt)]; fromLibrary = true;
}
function bakeInto(target, prim) {                                      // copies a primitive (and the accessors it reads) into this document
  const out = target.createPrimitive().setMode(prim.getMode());
  const mt = prim.getMaterial(); if (mt) out.setMaterial(target.createMaterial(mt.getName()).setBaseColorFactor(mt.getBaseColorFactor()).setRoughnessFactor(mt.getRoughnessFactor()).setMetallicFactor(mt.getMetallicFactor()));
  const cp = a => target.createAccessor().setType(a.getType()).setArray(a.getArray().slice());
  const idx = prim.getIndices(); if (idx) out.setIndices(cp(idx));
  for (const sem of prim.listSemantics()) if (!/^TEXCOORD|^COLOR|^TANGENT/.test(sem)) out.setAttribute(sem, cp(prim.getAttribute(sem)));
  return out;
}
// triangles nobody can see from outside the car (its interior, its underside, the inner faces of the wheels) are not shipped: proof/vehicles/glbvis.ts finds them
let culled = 0;
if (M.cull) {
  const vis = JSON.parse(fs.readFileSync(rel(M.cull), 'utf8'));
  for (const mesh of doc.getRoot().listMeshes()) {
    const e = vis.meshes.find(x => x.name === mesh.getName()); if (!e || /^wheel/i.test(mesh.getName())) continue;      // never the wheels: they turn, what faces the arch now will not stay there
    const keep = new Set(e.visible);
    for (const prim of mesh.listPrimitives()) {
      const idx = prim.getIndices(), a = idx.getArray(), kept = [];
      for (let t = 0; t < a.length / 3; t++) if (keep.has(t)) kept.push(a[t * 3], a[t * 3 + 1], a[t * 3 + 2]); else culled++;
      idx.setArray(new a.constructor(kept));
    }
  }
  console.log(`culled ${culled} triangles nobody sees from outside`);
}
check('wheels found in the source', wheelSrc.length >= 2, `${wheelSrc.length}${fromLibrary ? ' (library)' : ''}`);
check('wheel axles lie along X (after rotateY)', wheelSrc.every(w => w.axle === 0), wheelSrc.map(w => w.axle));

// ---- 2. fit the body to the kit's envelope
const bodyBaked = bodyParts.map(p => ({ ...p, prim: bakePrimitive(doc, p.prim, p.world) }));
const bb = boundsOf(bodyBaked.map(p => p.prim));
let sx, sy, sz, fit, aniso;
if (own) {
  // one scale for length, height and radius (so the wheels stay round and the car keeps its proportions); the width is fitted on the body WITHOUT its mirrors
  const wb = boundsOf(wheelSrc.flatMap(w => w.parts.map(p => bakePrimitive(doc, p.prim, p.world))));
  const lo = bb.min.map((v, k) => Math.min(v, wb.min[k])), hi = bb.max.map((v, k) => Math.max(v, wb.max[k]));
  const s0 = T.length / (hi[2] - lo[2]), xs = [], tmp = [0, 0, 0];
  for (const p of bodyBaked) { const a = p.prim.getAttribute('POSITION'); for (let i = 0; i < a.getCount(); i++) { a.getElement(i, tmp); xs.push(tmp[0]); } }
  xs.sort((a, b) => a - b); const pc = M.bodyWidthPercentile ?? 0.01, bodyW = xs[Math.floor((1 - pc) * (xs.length - 1))] - xs[Math.floor(pc * (xs.length - 1))];
  const rel = T.width / (bodyW * s0);                                // how much wider (> 1) or narrower (< 1) than the kit the body would be at the length's scale
  sx = rel * s0; sy = sz = s0; aniso = Math.max(rel, 1) / Math.min(rel, 1);
  fit = mat.mul(mat.translate(-(lo[0] + hi[0]) / 2 * sx, -lo[1] * s0, -(lo[2] + hi[2]) / 2 * s0), mat.scale(sx, s0, s0));
} else {
  sx = T.width / bb.size[0]; sz = T.length / bb.size[2]; sy = (T.height - lim.clearance) / bb.size[1];
  aniso = Math.max(sx, sy, sz) / Math.min(sx, sy, sz);
  fit = mat.mul(mat.translate(-bb.centre[0] * sx, lim.clearance - bb.min[1] * sy, -bb.centre[2] * sz), mat.scale(sx, sy, sz));
}
check(`${own ? 'width squeeze' : 'body stretch'} ${[sx, sy, sz].map(v => round(v, 2)).join(' x ')} (anisotropy ${round(aniso, 2)} <= ${lim.maxStretch}${M.standIn ? ', waived: stand-in' : ''})`, aniso <= lim.maxStretch || M.standIn, round(aniso, 2));

// ---- 3. rebuild the scene: body + four separate wheels
const scene = doc.getRoot().listScenes()[0];
const bodyPrims = bodyBaked.map(p => bakePrimitive(doc, p.prim, fit));
for (const n of doc.getRoot().listNodes()) n.dispose();
const byMat = new Map(); for (const p of bodyPrims) (byMat.get(p.getMaterial()) ?? byMat.set(p.getMaterial(), []).get(p.getMaterial())).push(p);
const bodyMesh = doc.createMesh('body');
for (const group of byMat.values()) bodyMesh.addPrimitive(group.length > 1 ? joinPrimitives(group) : group[0]);
const root = doc.createNode(M.id).setExtras({ standIn: !!M.standIn, kind: T.kind, length: T.length, width: T.width, height: T.height });
scene.addChild(root);
root.addChild(doc.createNode('body').setMesh(bodyMesh));
const NAMES = { '1,1': 'fl', '-1,1': 'fr', '1,-1': 'rl', '-1,-1': 'rr' };
const placed = [];
if (own) {
  for (const src of wheelSrc) {
    const hub = mat.point(fit, src.centre), id = NAMES[`${Math.sign(hub[0])},${Math.sign(hub[2])}`], r = src.r * sy;
    const m = mat.mul(mat.scale(sx, sy, sz), mat.translate(-src.centre[0], -src.centre[1], -src.centre[2]));
    const mesh = doc.createMesh(`wheel_${id}`);
    for (const p of src.parts) mesh.addPrimitive(bakePrimitive(doc, p.prim, mat.mul(m, p.world)));
    const axle = doc.createNode(`axle_${id}`).setTranslation(hub).setExtras({ r, width: src.width * sx, steer: hub[2] > 0 }).addChild(doc.createNode(`wheel_${id}`).setMesh(mesh));
    root.addChild(axle); placed.push(id);
  }
} else for (const tw of T.wheels) {
  const key = `${Math.sign(tw.x)},${Math.sign(tw.z)}`, id = NAMES[key];
  // the source wheel of the same quadrant (a library has one wheel for all four)
  const src = wheelSrc.length === 1 ? wheelSrc[0] : wheelSrc.reduce((a, b) => Math.hypot(a.centre[0] - tw.x, a.centre[2] - tw.z) < Math.hypot(b.centre[0] - tw.x, b.centre[2] - tw.z) ? a : b);
  const s = tw.r / src.r, wide = tw.width / src.width;
  const turn = fromLibrary && tw.x < 0 ? mat.rotY(Math.PI) : mat.identity();                 // the library wheel faces +x outwards; the right side turns it round
  const m = mat.mul(turn, mat.mul(mat.scale(wide, s, s), mat.translate(-src.centre[0], -src.centre[1], -src.centre[2])));
  const mesh = doc.createMesh(`wheel_${id}`);
  for (const p of src.parts) mesh.addPrimitive(bakePrimitive(doc, p.prim, mat.mul(m, p.world)));
  const wheel = doc.createNode(`wheel_${id}`).setMesh(mesh);
  const axle = doc.createNode(`axle_${id}`).setTranslation([tw.x, tw.r, tw.z]).setExtras({ r: tw.r, width: tw.width, steer: !!tw.steer }).addChild(wheel);
  root.addChild(axle); placed.push(id);
}
await doc.transform(prune(), dedup());
if (M.simplifyWheelTris) {                                           // the wheels only: their topology is clean, the paint of the body (UV islands) does not survive decimation
  await MeshoptSimplifier.ready;
  for (const mesh of doc.getRoot().listMeshes()) if (/^wheel/i.test(mesh.getName())) for (const p of mesh.listPrimitives()) {
    const pos = p.getAttribute('POSITION'), idx = p.getIndices(), n = pos.getCount(), P = new Float32Array(n * 3), t = [0, 0, 0];
    for (let i = 0; i < n; i++) { pos.getElement(i, t); P.set(t, i * 3); }
    const [out] = MeshoptSimplifier.simplify(new Uint32Array(idx.getArray()), P, 3, M.simplifyWheelTris * 3, M.simplifyWheelError ?? 0.05, ['LockBorder']);
    idx.setArray(new Uint32Array(out));
  }
  console.log('wheels simplified to', doc.getRoot().listMeshes().filter(m => /^wheel/i.test(m.getName())).map(m => m.listPrimitives()[0].getIndices().getCount() / 3).join(', '), 'triangles each');
}
if (M.simplifyTris) {                                                // a generated car is 10 times the game's budget: weld and simplify (seams locked: the paint keeps its place)
  const before = triCountOf(doc.getRoot().listMeshes().flatMap(m => m.listPrimitives()));
  await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: Math.min(1, M.simplifyTris / before), error: M.simplifyError ?? 0.01, lockBorder: M.simplifyLockBorder ?? true }));
  console.log(`simplified ${before} -> ${triCountOf(doc.getRoot().listMeshes().flatMap(m => m.listPrimitives()))} triangles`);
}
const tooBig = doc.getRoot().listTextures().filter(t => Math.max(...t.getSize()) > lim.textureMax);
if (tooBig.length || M.textureFormat) await doc.transform(textureCompress({ encoder: sharp, resize: [lim.textureMax, lim.textureMax], ...(M.textureFormat ? { targetFormat: M.textureFormat, quality: M.textureQuality ?? 85 } : {}) }));
fs.mkdirSync(path.dirname(outFile), { recursive: true });
await io.write(outFile, doc);

for (const mesh of doc.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) compactPrimitive(doc, p);
// a decimated, UV-split shell has a normal per UV island: lit, it looks crumpled. Smooth them across the seams (vertices at one place share one normal),
// keeping real creases (faces more than 55 degrees off the vertex's own normal do not count).
if (M.smoothNormals !== false) for (const mesh of doc.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) {
  const pos = p.getAttribute('POSITION'), nor = p.getAttribute('NORMAL'), idx = p.getIndices(); if (!pos || !nor || !idx) continue;
  const n = pos.getCount(), P = new Float32Array(n * 3), N0 = new Float32Array(n * 3), t = [0, 0, 0];
  for (let i = 0; i < n; i++) { pos.getElement(i, t); P.set(t, i * 3); nor.getElement(i, t); N0.set(t, i * 3); }
  const key = i => `${Math.round(P[i * 3] * 400)},${Math.round(P[i * 3 + 1] * 400)},${Math.round(P[i * 3 + 2] * 400)}`;   // 2.5 mm cells
  const groups = new Map(), faces = [];
  for (let f = 0; f < idx.getCount(); f += 3) {
    const a = idx.getScalar(f), b = idx.getScalar(f + 1), c = idx.getScalar(f + 2);
    const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2], vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
    const fn = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]; faces.push(fn);                       // area-weighted: its length is twice the area
    for (const v of [a, b, c]) { const k = key(v); (groups.get(k) ?? groups.set(k, []).get(k)).push(faces.length - 1); }
  }
  const out = new Float32Array(n * 3), cosMin = Math.cos((55 * Math.PI) / 180);
  for (let i = 0; i < n; i++) {
    const own = [N0[i * 3], N0[i * 3 + 1], N0[i * 3 + 2]]; let sx = 0, sy = 0, sz = 0;
    for (const fi of groups.get(key(i))) { const f = faces[fi], l = Math.hypot(...f) || 1; if ((f[0] * own[0] + f[1] * own[1] + f[2] * own[2]) / l >= cosMin) { sx += f[0]; sy += f[1]; sz += f[2]; } }
    const l = Math.hypot(sx, sy, sz); if (l > 1e-9) out.set([sx / l, sy / l, sz / l], i * 3); else out.set(own, i * 3);
  }
  nor.setArray(out);
}

// ---- 4. verify what was written
const out = await io.read(outFile), parts = scenePrimitives(out);
const named = n => out.getRoot().listNodes().find(x => x.getName() === n);
const bodyOut = parts.filter(p => p.node.getName() === 'body').map(p => p.prim), allOut = parts.map(p => bakePrimitive(out, p.prim, p.world));
const ob = boundsOf(allOut), bob = boundsOf(bodyOut);
check('four wheels, separate nodes (axle > wheel), named fl fr rl rr', placed.length === 4 && ['fl', 'fr', 'rl', 'rr'].every(i => named(`wheel_${i}`) && named(`axle_${i}`)), placed.join(' '));
const wheelRows = [];
const rowOf = (id, steer) => {
  const ax = named(`axle_${id}`), wn = named(`wheel_${id}`), t = ax.getTranslation();
  const wp = scenePrimitives({ getRoot: () => ({ listScenes: () => [{ listChildren: () => [wn] }] }) }).map(p => bakePrimitive(out, p.prim, p.world)), wb = boundsOf(wp);
  return { id, x: round(t[0]), y: round(t[1]), z: round(t[2]), r: round(wb.size[1] / 2), width: round(wb.size[0]), steer, bottom: round(wb.min[1]) };
};
if (own) {
  for (const id of placed) {
    const row = rowOf(id, id[0] === 'f'), kw = T.wheels.find(w => Math.sign(w.x) === Math.sign(row.x) && Math.sign(w.z) === Math.sign(row.z));
    wheelRows.push(row);
    check(`${id}: its own hub (${row.x}, ${row.y}, ${row.z}) within 0.12 m of the kit axle (${kw.x}, ${kw.z}), radius ${row.r} m within 0.25-0.42 (kit ${kw.r}), tyre bottom on the ground (2 cm)`,
      Math.abs(row.x - kw.x) < 0.12 && Math.abs(row.z - kw.z) < 0.12 && row.r >= 0.25 && row.r <= 0.42 && Math.abs(row.bottom) < 0.02 && Math.abs(row.y - row.r) < 0.02, row);      // a generated car's tyres are not all level: 2 cm
  }
} else for (const tw of T.wheels) {
  const row = rowOf(NAMES[`${Math.sign(tw.x)},${Math.sign(tw.z)}`], !!tw.steer); wheelRows.push(row);
  check(`${row.id}: hub at the kit axle (${tw.x}, ${tw.r}, ${tw.z}), radius ${tw.r}, width ${tw.width}, bottom on the ground`,
    Math.hypot(row.x - tw.x, row.y - tw.r, row.z - tw.z) < 0.005 && Math.abs(row.r - tw.r) < 0.005 && Math.abs(row.width - tw.width) < 0.01 && Math.abs(row.bottom) < 0.002, row);
}
let bodyWidthOut = null;
if (own) {
  const xs = [], tmp = [0, 0, 0]; for (const p of bodyOut) { const a = p.getAttribute('POSITION'); for (let i = 0; i < a.getCount(); i++) { a.getElement(i, tmp); xs.push(tmp[0]); } }
  xs.sort((a, b) => a - b); const pc = M.bodyWidthPercentile ?? 0.01, w = xs[Math.floor((1 - pc) * (xs.length - 1))] - xs[Math.floor(pc * (xs.length - 1))]; bodyWidthOut = round(w);
  check(`overall length ${round(ob.size[2], 2)} m = the kit's ${T.length} (2 cm); body width without mirrors ${round(w, 2)} m = ${T.width} (4 cm); height ${round(ob.size[1], 2)} m within 6 cm of ${T.height}; ground at y = 0; centred`,
    Math.abs(ob.size[2] - T.length) < 0.02 && Math.abs(w - T.width) < 0.04 && Math.abs(ob.size[1] - T.height) < 0.06 && Math.abs(ob.min[1]) < 0.002 && Math.abs((ob.min[2] + ob.max[2]) / 2) < 0.05 && Math.abs((ob.min[0] + ob.max[0]) / 2) < 0.05,
    { size: ob.size.map(v => round(v, 3)), withMirrorsWidth: round(ob.size[0], 3) });
} else check(`overall ${round(ob.size[2], 2)} x ${round(ob.size[0], 2)} x ${round(ob.size[1], 2)} m fits the kit's ${T.length} x ${T.width} x ${T.height} (L x W x H, within 2 cm; the ground at y = 0)`,
  Math.abs(ob.size[2] - T.length) < 0.02 && ob.size[0] - T.width < 0.02 && Math.abs(ob.size[1] - T.height) < 0.02 && Math.abs(ob.min[1]) < 0.002 && Math.abs((ob.min[2] + ob.max[2]) / 2) < 0.1 && Math.abs((ob.min[0] + ob.max[0]) / 2) < 0.02,
  { size: ob.size.map(v => round(v, 3)), min: ob.min.map(v => round(v, 3)) });
check('front axles (steer) are the +z pair', wheelRows.filter(w => w.steer).every(w => w.z > 0) && wheelRows.filter(w => !w.steer).every(w => w.z < 0));
const roof = topAt(bodyOut, T.driver.x, T.driver.z), eye = T.cameras.driver.pos[1];
check(`head room at the driver seat: roof ${round(roof, 2)} m over the eye at ${eye} m (>= 0.10 m)`, roof - eye >= 0.1, { roof: round(roof, 3), eye, headRoom: round(roof - eye, 3) });
// is the cabin hollow? A ray up from the driver's eye crosses an even number of surfaces in a modelled cabin (roof inner and outer face),
// an odd number inside a solid shell (a fused Meshy body, the stand-in): then the « at the wheel » camera would sit inside the body
const up = crossingsAbove(bodyOut, T.cameras.driver.pos[0], eye, T.cameras.driver.pos[2]), interior = M.cockpit === true ? false : up % 2 === 0;   // `cockpit: true`: the model's own inside is not good enough, the shared cockpit is drawn
console.log(`INFO  driver's eye ${interior ? 'is in a hollow cabin' : M.cockpit === true ? 'is inside a shell whose own interior is not used' : 'is INSIDE a solid body'} (${up} surfaces above): ${interior ? 'the model\'s own cabin is used for « Au volant »' : 'the shared cockpit is drawn for « Au volant » and the shell is hidden from inside'}`);
const tris = triCountOf(parts.map(p => p.prim)), drawCalls = parts.length, bytes = fs.statSync(outFile).size;
const texs = out.getRoot().listTextures().map(t => ({ size: t.getSize(), kB: Math.round(t.getImage().byteLength / 1024) }));
check(`triangles ${tris} <= ${lim.maxTris}`, tris <= lim.maxTris, tris);
check(`draw calls ${drawCalls} <= ${lim.maxDrawCalls} (one per primitive: body + 4 wheels)`, drawCalls <= lim.maxDrawCalls, drawCalls);
check(`textures <= ${lim.textureMax} px`, texs.every(t => Math.max(...t.size) <= lim.textureMax), texs);
check(`file ${Math.round(bytes / 1024)} kB <= ${lim.maxKB} kB`, bytes <= lim.maxKB * 1024, Math.round(bytes / 1024));

const sidecar = {
  id: M.id, standIn: !!M.standIn, provenance: M.provenance, source: path.relative(repo, srcFile), sourceSha256: crypto.createHash('sha256').update(fs.readFileSync(srcFile)).digest('hex'),
  kit: { kind: T.kind, seed: T.seed }, wheelFit: own ? 'own' : 'kit', length: round(ob.size[2]), width: round(ob.size[0]), bodyWidth: bodyWidthOut ?? round(ob.size[0]), height: round(ob.size[1]),
  stretch: { x: round(sx), y: round(sy), z: round(sz), anisotropy: round(aniso, 2) },
  wheels: wheelRows, headRoom: round(roof - eye), interior, body: { min: bob.min.map(v => round(v)), max: bob.max.map(v => round(v)) },
  tris, drawCalls, textures: texs, bytes, checks,
};
fs.writeFileSync(sideFile, JSON.stringify(sidecar, null, 1) + '\n');
const failed = checks.filter(c => !c.ok).length;
console.log(`\n${path.relative(repo, outFile)}  ${Math.round(bytes / 1024)} kB, ${tris} tris, ${drawCalls} draw calls  ->  ${failed ? failed + ' CHECK(S) FAILED' : 'all checks pass'}${M.standIn ? '  [STAND-IN: mechanics only, not the final art]' : ''}`);
process.exit(failed ? 1 : 0);
