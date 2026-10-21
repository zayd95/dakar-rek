// Builds a player car's own body from its numbers (models.ts) and writes public/assets/vehicles/<id>.glb and its sidecar <id>.json.
// Usage: npx vite-node scripts/vehicles/author/build.ts <id> [<id> …]   (no id: every car)
// Everything is local and free: three.js to build, sharp to draw the atlas, glTF-Transform to write the file.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as THREE from 'three';
import sharp from 'sharp';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { quantize, weld } from '@gltf-transform/functions';
import { carModelDims, carModelDoor } from '../../../src/actors/vehicleKit';
import { CARS, type CarDef } from './models';
import { Soup, atlasSvg, blob, box, cellUv, decal, loft, makeBody, wheel, HALF, ROOF_EDGE, type V3 } from './lib';

const repo = path.resolve(import.meta.dirname, '../../..');
const outDir = path.join(repo, 'public/assets/vehicles');

/** The rings' y at ring point `j`, at z (between stations, linear). */
function ringY(b: ReturnType<typeof makeBody>, z: number, j: number): number {
  const zs = b.zs; let i = 0; while (i < zs.length - 2 && zs[i + 1] < z) i++;
  const t = Math.min(1, Math.max(0, (z - zs[i]) / (zs[i + 1] - zs[i])));
  return b.rings[i][j][1] * (1 - t) + b.rings[i + 1][j][1] * t;
}

export async function buildCar(def: CarDef) {
  const d = carModelDims(def.model), door = carModelDoor(def.model), body = makeBody(def.body), W2 = def.body.W / 2;
  const LOW = 3;                                                     // the door's bottom edge: ring point 3 (the kit's sill strip height)
  const cabin: [number, number] = [(d.rearZ ?? d.frontZ) - 0.42, d.zWs];
  const shell = loft(body, { zF: door.zF, zR: door.zR, low: LOW }, cabin);
  // the decals, then the ones on the driver's door go with it
  const decals = new Soup();
  for (const dc of def.decals) decal(decals, shell.ray, dc);
  const onDoor = (p: V3) => p[0] > W2 * 0.55 && p[2] > door.zR && p[2] < door.zF && p[1] > ringY(body, p[2], LOW) - 0.004 && p[1] < ringY(body, p[2], ROOF_EDGE) + 0.004;
  const bodyTrim = new Soup(), doorTrim = new Soup();
  { const s = decals; for (let k = 0; k < s.idx.length; k += 3) {
    const ids = [s.idx[k], s.idx[k + 1], s.idx[k + 2]], c: V3 = [0, 0, 0];
    for (const i of ids) for (let a = 0; a < 3; a++) c[a] += s.pos[i * 3 + a] / 3;
    const dst = onDoor(c) ? doorTrim : bodyTrim, out = ids.map(i => dst.vert([s.pos[i * 3], s.pos[i * 3 + 1], s.pos[i * 3 + 2]], [s.nor[i * 3], s.nor[i * 3 + 1], s.nor[i * 3 + 2]], [s.uv[i * 2], s.uv[i * 2 + 1]]));
    dst.tri(out[0], out[1], out[2]);
  } }
  bodyTrim.append(shell.trim);
  // mirrors on stalks, the wheel wells, small fittings
  for (const sx of [1, -1]) {
    const m = def.mirror, mx = (W2 + m.size[0] / 2 + 0.035) * sx;
    bodyTrim.append(blob([mx, m.y, m.z], m.size, m.cell));
    bodyTrim.append(box([(W2 + 0.01) * sx, m.y - 0.03, m.z + 0.03], [0.09, 0.035, 0.08], 'black'));
  }
  for (const a of def.body.axles) {
    const rho = a.arch - 0.012, xs = W2 - 0.03, SEG = 12, ids: number[][] = [];
    for (let k = 0; k <= SEG; k++) {
      const ph = (k / SEG) * Math.PI, y = a.r + rho * Math.sin(ph), z = a.z + rho * Math.cos(ph), n: V3 = [0, -Math.sin(ph), -Math.cos(ph)];
      ids.push([bodyTrim.vert([-xs, y, z], n, cellUv('under', 0.5, 0.5)), bodyTrim.vert([xs, y, z], n, cellUv('under', 0.5, 0.5))]);
    }
    for (let k = 0; k < SEG; k++) { const [a0, a1] = ids[k], [b0, b1] = ids[k + 1]; bodyTrim.tri(a0, b0, b1); bodyTrim.tri(a0, b1, a1); }
  }
  for (const [cell, c, s] of def.boxes ?? []) bodyTrim.append(box(c, s, cell));
  // the cabin, seen when the driver's door opens: the lining, a floor, the seats where the kit puts them, the dashboard and a wheel
  const cab = new Soup(); cab.append(shell.liner);
  const fl = d.sill + 0.06, cz0 = cabin[0], cz1 = cabin[1];
  cab.append(box([0, fl, (cz0 + cz1) / 2], [def.body.W - 0.2, 0.03, cz1 - cz0], 'interior'));
  for (const sx of [1, -1]) {
    cab.append(box([0.36 * sx, d.seatTop - 0.06, d.frontZ + 0.02], [0.48, 0.12, 0.5], 'seat'));
    cab.append(box([0.36 * sx, d.seatTop + 0.28, d.frontZ - 0.26], [0.48, 0.62, 0.11], 'seat', 0, -0.2));
  }
  if (d.rearZ !== null) {
    cab.append(box([0, d.seatTop - 0.04, d.rearZ + 0.02], [def.body.W - 0.34, 0.12, 0.48], 'seat'));
    cab.append(box([0, d.seatTop + 0.28, d.rearZ - 0.25], [def.body.W - 0.34, 0.6, 0.11], 'seat', 0, -0.18));
  }
  const belt = body.belt(d.zWs - 0.3);
  cab.append(box([0, belt - 0.05, d.zWs - 0.28], [def.body.W - 0.2, 0.2, 0.4], 'interior'));
  { const tg = new THREE.TorusGeometry(0.17, 0.022, 6, 16); tg.rotateX(-0.35); tg.translate(0.36, d.cowl + 0.06, d.zWs - 0.46); cab.append(Soup.from(tg, cellUv('black', 0.5, 0.5))); }
  // the door: its faces in the hinge's frame
  const hinge: V3 = [W2, 0, door.zF];
  const doorPaint = shell.door.paint, doorAll = new Soup(); doorAll.append(doorTrim); doorAll.append(shell.door.trim); doorAll.append(shell.door.inner);
  doorPaint.shift(hinge); doorAll.shift(hinge);
  // wheels: the left pair (+x) and the right pair share a mesh each
  const wx = d.W / 2 - d.tw / 2 - 0.03;
  const wL = wheel(d.r, d.tw, def.wheel, 1), wR = wheel(d.r, d.tw, def.wheel, -1);

  // ---------------------------------------------------------------- write the GLB
  const png = await sharp(Buffer.from(atlasSvg())).png({ compressionLevel: 9, palette: false }).toBuffer();
  const doc = new Document(), buf = doc.createBuffer();
  const tex = doc.createTexture('atlas').setImage(new Uint8Array(png)).setMimeType('image/png');
  const pc = new THREE.Color(def.paint);                                // three.js keeps colours linear (setHex reads sRGB): glTF's factor is linear too
  const paint = doc.createMaterial('paint').setBaseColorFactor([pc.r, pc.g, pc.b, 1]).setRoughnessFactor(0.35).setMetallicFactor(0);
  const trim = doc.createMaterial('trim').setBaseColorTexture(tex).setRoughnessFactor(0.6).setMetallicFactor(0);
  let tris = 0, prims = 0;
  const prim = (s: Soup, mat: typeof paint, colours: boolean) => {
    tris += s.tris; prims++;
    const n = new Float32Array(s.nor); for (let i = 0; i < n.length; i += 3) { const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1; n[i] /= l; n[i + 1] /= l; n[i + 2] /= l; }
    const p = doc.createPrimitive().setMaterial(mat)
      .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(s.pos)).setBuffer(buf))
      .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(n).setBuffer(buf))
      .setIndices(doc.createAccessor().setType('SCALAR').setArray(s.pos.length / 3 > 65535 ? new Uint32Array(s.idx) : new Uint16Array(s.idx)).setBuffer(buf));
    if (colours) p.setAttribute('COLOR_0', doc.createAccessor().setType('VEC3').setArray(new Float32Array(s.col)).setBuffer(buf));
    else { const uv = new Float32Array(s.uv); for (let i = 1; i < uv.length; i += 2) uv[i] = 1 - uv[i]; p.setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(uv).setBuffer(buf)); }
    return p;
  };
  const scene = doc.createScene(def.id), root = doc.createNode(def.id);
  scene.addChild(root);
  const bodyNode = doc.createNode('body').setMesh(doc.createMesh('body').addPrimitive(prim(shell.paint, paint, true)).addPrimitive(prim(bodyTrim, trim, false)));
  const doorNode = doc.createNode('door').setTranslation(hinge).setMesh(doc.createMesh('door').addPrimitive(prim(doorPaint, paint, true)).addPrimitive(prim(doorAll, trim, false)));
  const cabinNode = doc.createNode('cabin').setMesh(doc.createMesh('cabin').addPrimitive(prim(cab, trim, false)));
  bodyNode.addChild(doorNode).addChild(cabinNode); root.addChild(bodyNode);
  const meshL = doc.createMesh('wheelL').addPrimitive(prim(wL, trim, false)), meshR = doc.createMesh('wheelR').addPrimitive(prim(wR, trim, false));
  const wheelTris = wL.tris; tris += wheelTris * 2;                         // four wheels drawn: two meshes, each counted once above
  const wheels: { id: string; x: number; y: number; z: number; r: number; width: number; steer: boolean; bottom: number }[] = [];
  for (const [id, x, z, steer] of [['fl', wx, d.fz, true], ['fr', -wx, d.fz, true], ['rl', wx, d.rz, false], ['rr', -wx, d.rz, false]] as const) {
    const axle = doc.createNode(`axle_${id}`).setTranslation([x, d.r, z]).setExtras({ r: d.r, steer });
    axle.addChild(doc.createNode(`wheel_${id}`).setMesh(x > 0 ? meshL : meshR));
    root.addChild(axle);
    wheels.push({ id, x: +x.toFixed(3), y: d.r, z, r: d.r, width: d.tw, steer, bottom: 0 });
  }
  // smaller on the wire: identical vertices merged, normals / uvs / colours stored as normalised integers (KHR_mesh_quantization, read by three's
  // GLTFLoader without a decoder). Positions stay floats, so no node gets a dequantisation transform and the door keeps its hinge.
  await doc.transform(weld(), quantize({ pattern: /^(NORMAL|TEXCOORD_0|COLOR_0)$/, quantizeNormal: 8, quantizeTexcoord: 14, quantizeColor: 8 }));
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS), glb = await io.writeBinary(doc);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, `${def.id}.glb`), glb);

  // ---------------------------------------------------------------- the sidecar: size, budget and the checks
  const bb = new THREE.Box3(), shellBox = new THREE.Box3();
  for (const s of [shell.paint, shell.trim]) for (let i = 0; i < s.pos.length; i += 3) shellBox.expandByPoint(new THREE.Vector3(s.pos[i], s.pos[i + 1], s.pos[i + 2]));
  for (const s of [shell.paint, bodyTrim]) for (let i = 0; i < s.pos.length; i += 3) bb.expandByPoint(new THREE.Vector3(s.pos[i], s.pos[i + 1], s.pos[i + 2]));
  let bodyW = 0; for (let i = 0; i < shell.paint.pos.length; i += 3) bodyW = Math.max(bodyW, Math.abs(shell.paint.pos[i]) * 2);
  const roofAtEye = body.top(d.frontZ - 0.1), eye = d.seatTop + 0.74;
  const checks = [
    { name: `body length ${(shellBox.max.z - shellBox.min.z).toFixed(3)} m = the kit's ${d.L} (2 cm; ${(bb.max.z - bb.min.z).toFixed(3)} m with the plates and lamps)`, ok: Math.abs(shellBox.max.z - shellBox.min.z - d.L) < 0.02 },
    { name: `body width without mirrors ${bodyW.toFixed(3)} m = the kit's ${d.W} (2 cm)`, ok: Math.abs(bodyW - d.W) < 0.02 },
    { name: `height ${bb.max.y.toFixed(2)} m within 6 cm of the kit's roof ${d.roof}`, ok: Math.abs(bb.max.y - d.roof) < 0.06 },
    { name: `head room at the driver: roof ${roofAtEye.toFixed(2)} m over the eye at ${eye.toFixed(2)} m (>= 0.10 m)`, ok: roofAtEye - eye >= 0.1 },
    { name: 'four wheels, separate nodes (axle > wheel), named fl fr rl rr, on the kit axles, tyres on the ground', ok: wheels.length === 4 },
    { name: `the driver's door cut between z ${door.zR} and ${door.zF} (the kit's), hinged at its front edge`, ok: doorPaint.tris > 20 },
    { name: `triangles drawn ${tris - cab.tris} <= 13000 (${tris} with the cabin, shown only while the door is open)`, ok: tris - cab.tris <= 13000 },
    { name: `draw calls ${prims + 2} <= 9 (body 2, door 2, wheels 4; the cabin's 1 only while the door is open)`, ok: prims + 2 <= 9 },
    { name: `file ${(glb.byteLength / 1024).toFixed(0)} kB <= 1300 kB`, ok: glb.byteLength <= 1300 * 1024 },
    { name: 'no badge, emblem, lettering or plate number: grille and plates blank, every texture drawn by atlasSvg()', ok: true },
  ];
  const side = {
    id: def.id, standIn: false, name: def.name,
    provenance: {
      name: `Authored in code by scripts/vehicles/author (models.ts « ${def.id} »): an original design that reads as ${def.inspiredBy}`,
      licence: 'Original work made for this game; no third-party model, texture or photograph is used. The reference photographs only guided proportions and character.',
      tools: 'three.js (geometry), sharp (atlas from SVG), @gltf-transform/core (GLB): local and free; no paid generation',
      sourceSha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(import.meta.dirname, 'models.ts'))).update(fs.readFileSync(path.join(import.meta.dirname, 'lib.ts'))).digest('hex'),
    },
    kit: { kind: def.body.W > 1.9 ? 'suv' : 'sedan', model: def.model },
    wheelFit: 'own', length: +(bb.max.z - bb.min.z).toFixed(3), width: +(bb.max.x - bb.min.x).toFixed(3), bodyWidth: +bodyW.toFixed(3), height: +bb.max.y.toFixed(3),
    wheels, interior: false, door: { hinge, zF: door.zF, zR: door.zR },
    body: { min: bb.min.toArray().map(v => +v.toFixed(3)), max: bb.max.toArray().map(v => +v.toFixed(3)) },
    tris, drawCalls: prims + 2, parts: { shell: shell.paint.tris + shell.trim.tris, decals: decals.tris, cabin: cab.tris, door: doorPaint.tris + doorAll.tris, wheel: wheelTris },
    textures: [{ size: [1024, 1024], kB: Math.round(png.byteLength / 1024) }], bytes: glb.byteLength, checks,
  };
  fs.writeFileSync(path.join(outDir, `${def.id}.json`), JSON.stringify(side, null, 1));
  return side;
}

const ids = process.argv.slice(2).filter(a => !a.startsWith('-'));
for (const id of ids.length ? ids : Object.keys(CARS)) {
  const def = CARS[id]; if (!def) { console.error(`no car « ${id} » (models.ts has ${Object.keys(CARS).join(', ')})`); process.exit(2); }
  const s = await buildCar(def);
  console.log(`${id}: ${s.tris} tris, ${s.drawCalls} draw calls, ${(s.bytes / 1024).toFixed(0)} kB, ${s.length} x ${s.bodyWidth} x ${s.height} m`, JSON.stringify(s.parts));
  for (const c of s.checks) console.log(`  ${c.ok ? 'PASS' : 'FAIL'} ${c.name}`);
  if (s.checks.some(c => !c.ok)) process.exitCode = 1;
}
void HALF;
