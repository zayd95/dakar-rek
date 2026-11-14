import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { pathToFileURL } from 'node:url';
const { ContactPractice, ContactHold } = await import(pathToFileURL(process.argv[2]).href);
const bytes = await readFile(new URL('../public/assets/anatomy-study.glb', import.meta.url));
const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
function study(heavy) {
  const root = new THREE.Group(); root.scale.setScalar(1.07); root.add(clone(gltf.scene));
  const rest = new Map(), restPositions = new Map(); let body;
  root.traverse(o => {
    if (o.isBone) { rest.set(o, o.quaternion.clone()); restPositions.set(o, o.position.clone()); }
    if (o.isSkinnedMesh) { o.morphTargetInfluences.fill(0); o.morphTargetInfluences[heavy ? 1 : 0] = 1; }
    if (o.name === 'Body') body = o;
  });
  return { root, body, rest, restPositions };
}
const zero = new THREE.Vector3(), forward = new THREE.Vector3(0, 0, -1);
const checks = [], samples = [];
const h = new ContactHold(); h.press('Space'); h.press('p1'); h.press('p2'); h.release('p1'); assert.ok(h.held); h.release('Space'); assert.ok(h.held); h.release('p2'); assert.ok(!h.held); h.press('p1'); h.clear(); assert.ok(!h.held);
checks.push('Independent keyboard/pointer ownership and cancellation');
for (const heavy of [false, true]) {
  const c = new ContactPractice(study(heavy), study(!heavy));
  const tick = (n, direction = zero, held = false, hz = 60) => { for (let i = 0; i < n; i++) c.update(1 / hz, direction, held); };
  const initial = c.inspect();
  initial.player.feet.forEach(f => { assert.ok(f.reachError < 1e-5); assert.ok(Math.abs(f.actualSoleMinY) < .03); });
  tick(10, forward, true); assert.ok(!c.active); assert.deepEqual(c.player.study.root.position.toArray(), initial.player.position);
  tick(1); tick(10, zero, true); assert.ok(!c.active);
  for (let i = 0; i < 180 && !c.active; i++) tick(1, forward, true);
  assert.ok(c.active); assert.ok(c.distance <= 1.0); assert.ok(c.distance >= .72);
  const heldPosition = c.player.study.root.position.clone();
  tick(120, forward, true);
  assert.ok(c.player.study.root.position.distanceTo(heldPosition) < 1e-6, 'Held contact leaked translation');
  assert.deepEqual(c.opponent.study.root.position.toArray(), initial.opponent.position);
  c.inspect().player.feet.forEach(f => assert.ok(Math.abs(f.actualSoleMinY) < .03));
  c.opponent.study.root.position.z -= .1; tick(1, zero, true); assert.ok(c.active, 'Hysteresis should retain contact');
  c.opponent.study.root.position.z -= .4; tick(1, zero, true); assert.ok(!c.active, 'Break distance');
  c.reset(); tick(1); for (let i = 0; i < 180 && !c.active; i++) tick(1, forward, true);
  tick(1, forward, false); assert.ok(!c.active); const released = c.player.study.root.position.clone(); tick(30, forward); assert.ok(c.player.study.root.position.distanceTo(released) < 1e-6);
  tick(1); tick(60, new THREE.Vector3(0, 0, 1)); assert.ok(c.player.study.root.position.distanceTo(released) > .3);
  c.cancel(); tick(10, forward, true); assert.ok(!c.active); assert.ok(c.inspect().awaitNeutral);
  c.reset(); tick(10, zero, true); assert.ok(c.inspect().awaitNeutral); tick(1); assert.ok(!c.inspect().awaitNeutral);
  samples.push({ heavy, initial, contactPosition: heldPosition.toArray(), releaseRecovered: c.inspect() });
  c.dispose();
  for (const s of [c.player.study, c.opponent.study]) {
    assert.deepEqual(s.root.position.toArray(), [0, 0, 0]); assert.equal(s.root.rotation.y, 0);
    s.rest.forEach((q, b) => assert.deepEqual(b.quaternion.toArray(), q.toArray()));
    s.restPositions.forEach((p, b) => assert.deepEqual(b.position.toArray(), p.toArray()));
  }
  checks.push(`${heavy ? 'Heavy' : 'Athletic'} rigid spawn/feet, held approach, suspension, hysteresis, release neutral latch, cancel/reset and exact viewer restore`);
}
for (const heavy of [false, true]) for (const hz of [30, 60, 120]) {
  const c = new ContactPractice(study(heavy), study(!heavy)); c.update(1 / hz, zero, false);
  let minDistance = Infinity, maxStanceHeight = 0;
  for (let frame = 0; frame < hz * 6; frame++) {
    // Pursue the opponent from multiple directions while never requesting contact.
    const d = c.opponent.study.root.position.clone().sub(c.player.study.root.position).setY(0).normalize();
    if (frame > hz * 2 && frame < hz * 4) d.applyAxisAngle(new THREE.Vector3(0, 1, 0), .7);
    c.update(1 / hz, d, false);
    minDistance = Math.min(minDistance, c.distance);
    if (frame % 10 === 0) c.inspect().player.feet.filter(f => !f.swinging).forEach(f => { maxStanceHeight = Math.max(maxStanceHeight, Math.abs(f.actualSoleMinY)); });
    assert.ok(c.distance >= .72 - 1e-7, `Collision penetration ${c.distance} at ${hz} Hz`);
    assert.ok(!c.active);
  }
  assert.ok(maxStanceHeight < .04, `Floating stance ${maxStanceHeight}`);
  samples.push({ heavy, hz, minDistance, maxStanceHeight });
  checks.push(`${heavy ? 'Heavy' : 'Athletic'} ${hz} Hz obstacle collision, glancing approach and stance grounding`);
}
for (const heavy of [false, true]) for (const hz of [30, 60, 120]) {
  const c = new ContactPractice(study(heavy), study(!heavy)); c.update(1 / hz, zero, false);
  let minDistance = Infinity, maxStanceHeight = 0, maxReachError = 0;
  for (let frame = 0; frame < hz * 20; frame++) {
    const time = frame / hz;
    const d = c.opponent.study.root.position.clone().sub(c.player.study.root.position).setY(0).normalize();
    if (time >= 2) d.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.sin(time * 2.5) * 1.8);
    c.update(1 / hz, d, false);
    minDistance = Math.min(minDistance, c.distance);
    assert.ok(c.distance >= .72 - 1e-7, `Reversing tangent penetration ${c.distance}`);
    if (frame % 10 === 0) c.inspect().player.feet.filter(f => !f.swinging).forEach(f => {
      maxStanceHeight = Math.max(maxStanceHeight, Math.abs(f.actualSoleMinY));
      maxReachError = Math.max(maxReachError, f.reachError);
    });
  }
  assert.ok(maxStanceHeight < .04); assert.ok(maxReachError < .001);
  samples.push({ heavy, hz, reversingTangent: true, minDistance, maxStanceHeight, maxReachError });
  checks.push(`${heavy ? 'Heavy' : 'Athletic'} ${hz} Hz reversing tangent retains separation and planted-foot reach`);
}
await writeFile(new URL('../evidence/WEB-006-contact.json', import.meta.url), JSON.stringify({ kind: 'Actual GLB/controller simulation, not a browser or human feel verdict', checks, samples }, null, 2) + '\n');
console.log(JSON.stringify({ passed: checks.length }));
