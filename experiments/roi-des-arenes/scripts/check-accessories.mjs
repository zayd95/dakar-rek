import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import * as T from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
const { createAccessories } = await import(pathToFileURL(process.argv[2]).href);
const { Locomotion } = await import(pathToFileURL(process.argv[3]).href);
const bytes = await readFile(new URL('../public/assets/anatomy-study.glb', import.meta.url));
const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
const checks = [], samples = [];
function make(heavy) {
  const root = new T.Group(); root.add(clone(gltf.scene)); const rest = new Map(), restPositions = new Map(); let body;
  root.traverse(o => { if (o.isBone) { rest.set(o, o.quaternion.clone()); restPositions.set(o, o.position.clone()); }
    if (o.isSkinnedMesh) { o.morphTargetInfluences.fill(0); o.morphTargetInfluences[heavy ? 1 : 0] = 1; } if (o.name === 'Body') body = o; });
  return { root, body, rest, restPositions };
}
function hashBody(body) {
  const hash = createHash('sha256');
  for (const a of [body.geometry.index, ...Object.values(body.geometry.attributes), ...Object.values(body.geometry.morphAttributes).flat()]) hash.update(Buffer.from(a.array.buffer, a.array.byteOffset, a.array.byteLength));
  return hash.digest('hex');
}
function chestCrossing(study) {
  study.root.updateMatrixWorld(true); study.body.skeleton.update();
  const pairs = [], world = (mesh, i) => mesh.localToWorld(mesh.getVertexPosition(i, new T.Vector3()));
  const holder = study.root.getObjectByName('ChestAccessoryPouch');
  let pouchGap = Infinity;
  for (const face of ['Front', 'Back']) {
    const meshes = [-1, 1].map(sign => study.root.getObjectByName(`Chest${face}Cord${sign}`));
    const rings = meshes.map(mesh => Array.from({ length: 64 }, (_, k) => {
      const points = Array.from({ length: 6 }, (_, r) => world(mesh, r * 64 + k));
      const centre = points.reduce((p, q) => p.add(q), new T.Vector3()).divideScalar(6);
      return { centre, radius: Math.max(...points.map(p => p.distanceTo(centre))) };
    }));
    let gap = Infinity;
    for (let a = 0; a < 63; a++) for (let b = 0; b < 63; b++) {
      const p = rings[0][a].centre, q = rings[0][a + 1].centre, c = rings[1][b].centre, d = rings[1][b + 1].centre;
      const onRay = new T.Vector3(), onSegment = new T.Vector3();
      let distanceSq = new T.Ray(p, q.clone().sub(p).normalize()).distanceSqToSegment(c, d, onRay, onSegment);
      if (onRay.distanceTo(p) > p.distanceTo(q)) distanceSq = new T.Line3(c, d).closestPointToPoint(q, true, onSegment).distanceToSquared(q);
      gap = Math.min(gap, Math.sqrt(Math.max(0, distanceSq)) - Math.max(rings[0][a].radius, rings[0][a + 1].radius) - Math.max(rings[1][b].radius, rings[1][b + 1].radius));
    }
    assert.ok(gap > .0004, `Chest ${face} crossing envelope collision ${gap}`);
    pairs.push({ face, conservativeGap: gap });
    if (face === 'Front') for (const mesh of meshes) for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
      const p = holder.worldToLocal(world(mesh, i));
      if (Math.abs(p.x) < .045 / 2 && Math.abs(p.y) < .055 / 2) pouchGap = Math.min(pouchGap, -.012 - p.z);
    }
  }
  assert.ok(pouchGap > .0003, 'Raised cord enters central pouch ' + pouchGap);
  return { pairs, pouchGap };
}
// Spatially bucket the actual posed body triangles; measure every accessory
// vertex against nearby flesh. A signed negative distance flags penetration.
function clearance(study, accessories) {
  study.root.updateMatrixWorld(true); study.body.skeleton.update();
  const body = study.body, vertices = Array.from({ length: body.geometry.attributes.position.count }, (_, i) => body.localToWorld(body.getVertexPosition(i, new T.Vector3())));
  const index = body.geometry.index, grid = new Map(), cell = .06, triangles = [];
  for (let i = 0; i < index.count; i += 3) {
    const tri = new T.Triangle(...[0, 1, 2].map(j => vertices[index.getX(i + j)])), n = tri.getNormal(new T.Vector3());
    const box = new T.Box3().setFromPoints([tri.a, tri.b, tri.c]).expandByScalar(.055), id = triangles.length;
    triangles.push({ tri, n });
    for (let x = Math.floor(box.min.x / cell); x <= Math.floor(box.max.x / cell); x++) for (let y = Math.floor(box.min.y / cell); y <= Math.floor(box.max.y / cell); y++) for (let z = Math.floor(box.min.z / cell); z <= Math.floor(box.max.z / cell); z++) {
      const key = `${x},${y},${z}`; if (!grid.has(key)) grid.set(key, []); grid.get(key).push(id);
    }
  }
  const report = {}; let tested = 0;
  for (const parent of [...accessories.arms, ...accessories.waist, ...accessories.chest]) parent.traverse(o => {
    if (!o.isMesh) return;
    let min = Infinity;
    for (let i = 0; i < o.geometry.attributes.position.count; i++) {
      const p = o.isSkinnedMesh ? o.getVertexPosition(i, new T.Vector3()) : new T.Vector3().fromBufferAttribute(o.geometry.attributes.position, i); o.localToWorld(p);
      assert.ok(p.toArray().every(Number.isFinite));
      const key = p.toArray().map(x => Math.floor(x / cell)).join(','); let nearest = Infinity, signed = Infinity;
      for (const j of grid.get(key) || []) {
        const { tri, n } = triangles[j], q = tri.closestPointToPoint(p, new T.Vector3()), distance = p.distanceTo(q);
        if (distance < nearest) { nearest = distance; signed = Math.sign(p.clone().sub(q).dot(n)) * distance; }
      }
      assert.ok(Number.isFinite(signed), 'No nearby body surface for ' + parent.name);
      min = Math.min(min, signed); tested++;
    }
    report[parent.name + ':' + o.type] = Math.min(report[parent.name + ':' + o.type] ?? Infinity, min);
  });
  return { tested, min: Math.min(...Object.values(report)), byPart: report };
}
for (const heavy of [false, true]) {
  const s = make(heavy), control = make(heavy), before = hashBody(s.body), set = createAccessories(s.body);
  assert.equal(hashBody(s.body), before); assert.equal(set.inspect().pouches, 6);
  let triangles = 0;
  for (const parent of [...set.arms, ...set.waist, ...set.chest]) parent.traverse(o => {
    if (!o.isMesh) return; triangles += (o.geometry.index?.count || o.geometry.attributes.position.count) / 3;
    for (const a of Object.values(o.geometry.attributes)) assert.ok([...a.array].every(Number.isFinite));
    if (o.isSkinnedMesh) {
      assert.equal(o.skeleton, s.body.skeleton);
      for (let i = 0; i < o.geometry.attributes.position.count; i++) {
        let sum = 0; for (let j = 0; j < 4; j++) { sum += o.geometry.attributes.skinWeight.getComponent(i, j); assert.ok(o.geometry.attributes.skinIndex.getComponent(i, j) < s.body.skeleton.bones.length); }
        assert.ok(Math.abs(sum - 1) < 1e-6);
      }
    }
  });
  assert.ok(triangles < 12000); const fit = set.inspect();
  fit.sections.filter(s => s.name.includes('Arm')).forEach(s => assert.ok(s.radiusMin > .03 && s.radiusMax < .13));
  set.setVisible('arms', false); assert.ok(set.arms.every(o => !o.visible)); assert.ok(set.waist.every(o => o.visible));
  set.setVisible('waist', false); set.setVisible('arms', true); assert.ok(set.waist.every(o => !o.visible)); set.setVisible('waist', true);
  set.setVisible('chest', false); assert.ok(set.chest.every(o => !o.visible)); assert.ok(set.arms.every(o => o.visible)); assert.ok(set.waist.every(o => o.visible));
  set.setVisible('waist', false); set.setVisible('chest', true); assert.ok(set.waist.every(o => !o.visible)); assert.ok(set.chest.every(o => o.visible)); set.setVisible('waist', true);
  checks.push(`${heavy ? 'Heavy' : 'Athletic'} immutable source, normalized shared-rig surface geometry, fitted contours, six pouches and independent visibility`);
  const poses = [{ pose: 'source anatomy', ...clearance(s, set), crossing: chestCrossing(s) }];
  s.root.scale.setScalar(1.07); control.root.scale.setScalar(1.07);
  const w = new Locomotion(s), baseline = new Locomotion(control); w.reset(); baseline.reset();
  for (let frame = 0; frame < 180; frame++) {
    const direction = frame < 120 ? new T.Vector3(Math.sin(frame / 65), 0, Math.cos(frame / 65)) : new T.Vector3();
    w.setInput(direction); baseline.setInput(direction); w.update(1 / 60); baseline.update(1 / 60);
    assert.deepEqual(s.root.position.toArray(), control.root.position.toArray());
    s.rest.forEach((_, bone) => assert.deepEqual(bone.quaternion.toArray(), control.root.getObjectByName(bone.name).quaternion.toArray()));
    if ([0, 45, 90, 179].includes(frame)) poses.push({ pose: frame < 120 ? `moving ${frame}` : 'stopped', ...clearance(s, set), crossing: chestCrossing(s) });
  }
  const worst = Math.min(...poses.map(p => p.min));
  assert.ok(worst > -.001, `Accessory penetration ${worst}m on ${heavy ? 'heavy' : 'athletic'}`);
  w.restore(); assert.equal(hashBody(s.body), before);
  s.restPositions.forEach((p, b) => assert.deepEqual(b.position.toArray(), p.toArray()));
  samples.push({ heavy, triangles, fit, poses });
  checks.push(`${heavy ? 'Heavy' : 'Athletic'} every accessory vertex against actual posed flesh, unchanged 180-frame gait and exact restoration`);
  checks.push(`${heavy ? 'Heavy' : 'Athletic'} chest visibility independence, separated front/back crossing envelopes and pouch clearance`);
}
await writeFile(new URL('../evidence/WEB-008-accessories.json', import.meta.url), JSON.stringify({ kind: 'Actual GLB/morph/rig geometry checks; body clearance only, not cloth physics or cultural approval', checks, samples }, null, 2) + '\n');
console.log(JSON.stringify({ passed: checks.length, samples: samples.map(s => ({ heavy: s.heavy, triangles: s.triangles, minima: s.poses.map(p => [p.pose, p.min]) })) }));
