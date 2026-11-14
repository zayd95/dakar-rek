// Pure simulation checks: uses the same retained GLB and controller, no browser.
// First bundle src/locomotion.ts with the existing Vite/esbuild dependency.
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { pathToFileURL } from 'node:url';
const { Locomotion } = await import(pathToFileURL(process.argv[2]).href);
const bytes = await readFile(new URL('../public/assets/anatomy-study.glb', import.meta.url));
const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
function make(heavy = false) {
  const root = new THREE.Group(); root.scale.setScalar(1.07); root.add(clone(gltf.scene));
  const rest = new Map(), restPositions = new Map(); let body;
  root.traverse(o => {
    if (o.isBone) { rest.set(o, o.quaternion.clone()); restPositions.set(o, o.position.clone()); }
    if (o.isSkinnedMesh) { o.morphTargetInfluences.fill(0); o.morphTargetInfluences[heavy ? 1 : 0] = 1; }
    if (o.name === 'Body') body = o;
  });
  const walker = new Locomotion({ root, body, rest, restPositions }); walker.reset(); return walker;
}
const checks = [], samples = [];
function run(w, seconds, hz = 60) { for (let i = 0; i < seconds * hz; i++) w.update(1 / hz); return w.inspect(); }
for (const heavy of [false, true]) {
  const w = make(heavy);
  const idle = w.inspect();
  assert.equal(idle.feet.length, 2);
  idle.feet.forEach(f => { assert.ok(f.sampledVertices > 0); assert.ok(Math.abs(f.actualSoleMinY) < .03, String(f.actualSoleMinY)); });
  w.setInput(new THREE.Vector3(0, 0, 1));
  const moving = run(w, 1.5);
  assert.ok(moving.position[2] > 1.3 && moving.position[2] < 1.8);
  assert.ok(moving.feet.some(f => f.swinging));
  w.setInput(new THREE.Vector3());
  const stopped = run(w, 2);
  const later = run(w, 1);
  assert.equal(stopped.speed, 0);
  assert.deepEqual(stopped.position, later.position);
  stopped.feet.forEach((f, i) => {
    assert.equal(f.swinging, false);
    assert.ok(Math.abs(f.actualSoleMinY) < .03, String(f.actualSoleMinY));
    assert.ok(new THREE.Vector3(...f.actualSoleCentre).distanceTo(new THREE.Vector3(...later.feet[i].actualSoleCentre)) < .0001);
  });
  samples.push({ heavy, idle, moving, stopped });
  checks.push({ name: `${heavy ? 'Heavy' : 'Athletic'} travel, mid-swing release, actual sole grounding and stable idle`, passed: true });
  w.setInput(new THREE.Vector3(1, 0, 0)); run(w, 6);
  const boundary = w.inspect();
  assert.ok(Math.abs(boundary.position[0]) <= boundary.boundary);
  assert.equal(boundary.speed, 0);
  assert.equal(boundary.feet.some(f => f.swinging), false);
  assert.ok(Math.abs(Math.atan2(Math.sin(boundary.heading - Math.PI / 2), Math.cos(boundary.heading - Math.PI / 2))) < .01);
  checks.push({ name: `${heavy ? 'Heavy' : 'Athletic'} turns, stays bounded and stops gait against edge`, passed: true });
  for (let i=0;i<8;i++) {
    w.reset(); assert.deepEqual(w.inspect().position, [0, 0, 0]); assert.equal(w.inspect().speed, 0);
    const replacement = new Locomotion(w.study); replacement.reset();
    assert.deepEqual(replacement.inspect().feet.map(f=>f.actualSoleMinY),idle.feet.map(f=>f.actualSoleMinY));
    replacement.restore();
    w.study.restPositions.forEach((p,b)=>assert.deepEqual(b.position.toArray(),p.toArray()));
  }
  checks.push({name:`${heavy?'Heavy':'Athletic'} repeated reset/reconstruction and exact original viewer translation restoration`,passed:true});
}
const stanceMetrics=[];
for (const heavy of [false,true]) for (const abrupt of [false,true]) {
  const w=make(heavy); let previous; let maxHeight=0,maxDrift=0,worst;
  for(let frame=0;frame<240;frame++) {
    // Include a gradual quarter turn, keeping stance feet in world space.
    const angle=abrupt ? (frame<60?0:frame<120?Math.PI:frame<180?Math.PI/2:-Math.PI/2) : frame<120?0:(frame-120)/120*Math.PI/2;
    w.setInput(new THREE.Vector3(Math.sin(angle),0,Math.cos(angle))); w.update(1/60);
    const s=w.inspect();
    s.feet.forEach((f,i)=>{
      if(!f.swinging && Math.abs(f.actualSoleMinY)>maxHeight) { maxHeight=Math.abs(f.actualSoleMinY); worst={frame,s}; }
      if(previous && !f.swinging && !previous.feet[i].swinging) maxDrift=Math.max(maxDrift,new THREE.Vector3(...f.actualSoleCentre).distanceTo(new THREE.Vector3(...previous.feet[i].actualSoleCentre)));
    }); previous=s;
  }
  stanceMetrics.push({heavy,abrupt,maxHeight,maxDrift});
  assert.ok(maxHeight<.012,JSON.stringify({stanceMetrics,worst}));
  assert.ok(maxDrift<.002,JSON.stringify(stanceMetrics));
  checks.push({name:`${heavy?'Heavy':'Athletic'} actual stance soles grounded/stable throughout walking and ${abrupt?'abrupt':'gradual'} turns`,passed:true});
}
const travel = [];
for (const hz of [30, 60, 120]) {
  for (const diagonal of [false, true]) {
    const w = make(); w.setInput(new THREE.Vector3(diagonal ? 1 : 0, 0, 1));
    const s = run(w, 1.5, hz); travel.push({ hz, diagonal, distance: Math.hypot(s.position[0], s.position[2]) });
  }
}
assert.ok(Math.max(...travel.map(t => t.distance)) - Math.min(...travel.map(t => t.distance)) < .002);
checks.push({ name: 'Equal elapsed travel at 30/60/120 Hz; normalized cardinal/diagonal speeds', passed: true });
const report = { timestamp: new Date().toISOString(), kind: 'Pure same-controller/same-GLB simulation, not a device/browser performance test', checks, travel, samples,stanceMetrics };
await writeFile(new URL('../evidence/locomotion-simulation.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ passed: checks.length, travel }));
