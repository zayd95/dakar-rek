// Compatibility proof: the real Humanoid (gait, pose solvers, gestures, LOD, clip transitions) driven on three bodies:
// the shipped v4 body (control) and the two Meshy bodies transplanted onto the same skeleton. Everything is measured on the
// mesh surface (skinned vertex positions), not only on the bones. Not part of the game; nothing here is imported by src/.
import * as THREE from 'three';
import { Humanoid, preloadHumanoid, preloadBody, dropBody, bodyReady, humanoidReady, type BodyId, type PersonLook, type Clip } from '../../src/actors/humanoid';
import { reach, mouth, grip, forearmDir, bodyPoint } from '../../src/actors/gesture';
import { vehicleSpec } from '../../src/actors/vehicleKit';
import { SIT_HIPS } from '../../src/interact/seats';

const MALE: PersonLook = { skin: 0x6b3f25, style: 'tee', top: 0x2f6fb3, bottom: 0x2b2f3a, shoes: 0xf2f2ec };
const FEMALE: PersonLook = { skin: 0x6b3f25, female: true, style: 'tee', top: 0xf4c20d, bottom: 0x2b2f3a, shoes: 0xf2f2ec };
export const CASES: { id: string; body: BodyId; look: PersonLook; label: string }[] = [
  { id: 'v4_m', body: 'v4', look: MALE, label: 'v4 male (control)' },
  { id: 'v4_f', body: 'v4', look: FEMALE, label: 'v4 female (control)' },
  { id: 'meshy_m', body: 'meshy_m', look: MALE, label: 'Meshy homme' },
  { id: 'meshy_f', body: 'meshy_f', look: FEMALE, label: 'Meshy femme' },
];
const url = (f: string) => `/proof/meshy/out/${f}`;

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(720, 480); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x9bd3f3);
scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a60, 0.9)); const sun = new THREE.DirectionalLight(0xffffff, 1); sun.position.set(4, 8, 5); scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshLambertMaterial({ color: 0xb8a98a })); ground.rotation.x = -Math.PI / 2; scene.add(ground);
const camera = new THREE.PerspectiveCamera(35, 720 / 480, 0.1, 100);

// ---------------------------------------------------------------- mesh sampling
interface Sampler { meshes: { mesh: THREE.SkinnedMesh; sets: Record<string, Uint32Array> }[] }
const SETS: Record<string, string[]> = { footL: ['footL'], footR: ['footR'], handL: ['handL'], handR: ['handR'], hipsThigh: ['hips', 'thighL', 'thighR'], head: ['head'] };
function sampler(h: Humanoid): Sampler {
  const meshes: Sampler['meshes'] = [];
  h.group.traverse(o => {
    const m = o as THREE.SkinnedMesh; if (!m.isSkinnedMesh || !m.visible) return;
    for (let p: THREE.Object3D | null = m; p; p = p.parent) if (!p.visible) return;
    const names = m.skeleton.bones.map(b => b.name), si = m.geometry.getAttribute('skinIndex'), sw = m.geometry.getAttribute('skinWeight');
    const sets: Record<string, number[]> = Object.fromEntries(Object.keys(SETS).map(k => [k, []]));
    for (let v = 0; v < si.count; v++) {
      const acc: Record<string, number> = {};
      for (let k = 0; k < 4; k++) { const w = sw.getComponent(v, k); if (w > 0) { const n = names[si.getComponent(v, k)]; acc[n] = (acc[n] ?? 0) + w; } }
      for (const [set, bones] of Object.entries(SETS)) if (bones.reduce((s, b) => s + (acc[b] ?? 0), 0) >= 0.5) sets[set].push(v);
    }
    meshes.push({ mesh: m, sets: Object.fromEntries(Object.entries(sets).map(([k, a]) => [k, Uint32Array.from(a)])) });
  });
  return { meshes };
}
const _v = new THREE.Vector3();
function update(h: Humanoid) { h.group.updateMatrixWorld(true); h.group.traverse(o => { const m = o as THREE.SkinnedMesh; if (m.isSkinnedMesh) m.skeleton.update(); }); }
/** World positions of the vertices of `set` over every visible skinned mesh. */
function points(s: Sampler, set: string, out: THREE.Vector3[] = []) {
  out.length = 0;
  for (const { mesh, sets } of s.meshes) for (const i of sets[set]) { mesh.getVertexPosition(i, _v); out.push(_v.clone().applyMatrix4(mesh.matrixWorld)); }
  return out;
}
const minY = (pts: THREE.Vector3[]) => pts.reduce((m, p) => Math.min(m, p.y), Infinity);
const minDist = (pts: THREE.Vector3[], target: THREE.Vector3) => pts.reduce((m, p) => Math.min(m, p.distanceTo(target)), Infinity);
const pct = (a: number[], q: number) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : NaN; };
const r3 = (x: number) => Math.round(x * 1000) / 1000;

function make(c: typeof CASES[number]) { const h = new Humanoid(c.look, c.body); h.fullRate = true; scene.add(h.group); return h; }
const dispose = (h: Humanoid) => { h.dispose(); };

// ---------------------------------------------------------------- 1. on foot: idle, walk, jog, run; arm swing; feet on the ground
function onFoot(c: typeof CASES[number], speed: number, seconds = 8) {
  const h = make(c), dt = 1 / 60, S = sampler(h);
  const clear: number[] = [], pen: number[] = [], handZ: Record<'L' | 'R', number[]> = { L: [], R: [] }, pelvis: number[] = [], slip = { L: 0, R: 0 };
  const clips = new Set<string>(); let steps = 0;
  for (let f = 0; f < seconds * 60; f++) {
    h.group.position.z += speed * dt; h.animate(dt, speed);
    if (f < 2 * 60) continue;
    update(h);
    const g = h.gaitInfo(); if (g) { steps = g.steps; pelvis.push(g.pelvis); g.feet.forEach((ft, i) => { slip[i ? 'R' : 'L'] += ft.slipped || 0; if (ft.planted) { const p = minY(points(S, i ? 'footR' : 'footL')); clear.push(p); if (p < 0) pen.push(-p); } }); }
    if (h.clipName) clips.add(h.clipName);
    const hips = h.bone('hips')!.getWorldPosition(new THREE.Vector3());
    for (const side of ['L', 'R'] as const) handZ[side].push(h.bone(`hand.${side}`)!.getWorldPosition(new THREE.Vector3()).z - hips.z);
  }
  const res = {
    speed, travelled: r3(h.group.position.z), steps,
    soleClearance_m: { p5: r3(pct(clear, 0.05)), median: r3(pct(clear, 0.5)), p95: r3(pct(clear, 0.95)) }, penetrationMax_m: r3(Math.max(0, ...pen)),
    armSwing_m: { L: r3(Math.max(...handZ.L) - Math.min(...handZ.L)), R: r3(Math.max(...handZ.R) - Math.min(...handZ.R)) },
    pelvisRange_m: r3(Math.max(...pelvis) - Math.min(...pelvis)), footSlip_m: { L: r3(slip.L), R: r3(slip.R) }, clips: [...clips],
  };
  dispose(h); return res;
}

// ---------------------------------------------------------------- 1b. the foot's shape against what the gait assumes (RIG: heel 0.035 behind the ankle, ball 0.12 ahead, ankle 0.09 above the sole)
function footShape(c: typeof CASES[number]) {
  const h = make(c), S = sampler(h); for (let f = 0; f < 90; f++) h.animate(1 / 60, 0); update(h);
  const out: Record<string, number> = {};
  for (const side of ['L', 'R'] as const) {
    const ankle = h.bone(`foot.${side}`)!.getWorldPosition(new THREE.Vector3()), pts = points(S, `foot${side}`), lo = minY(pts), sole = pts.filter(p => p.y < lo + 0.02);
    const heel = Math.min(...sole.map(p => p.z)), toe = Math.max(...pts.map(p => p.z));
    out[`${side}_ankleAboveSole`] = r3(ankle.y - lo); out[`${side}_heelBehindAnkle`] = r3(ankle.z - heel); out[`${side}_toeAheadOfAnkle`] = r3(toe - ankle.z); out[`${side}_soleLength`] = r3(toe - heel);
    out[`${side}_width`] = r3(Math.max(...pts.map(p => p.x)) - Math.min(...pts.map(p => p.x)));
  }
  dispose(h); return out;
}

// ---------------------------------------------------------------- 2. sit and stand (chair convention: origin = seat top - SIT_HIPS)
function sitStand(c: typeof CASES[number]) {
  const seatTop = 0.46, h = make(c), dt = 1 / 60, S = sampler(h);
  h.group.position.set(0, seatTop - SIT_HIPS, 0);
  for (let f = 0; f < 90; f++) h.animate(dt, 0);
  update(h); const standHips = h.bone('hips')!.getWorldPosition(new THREE.Vector3()).y, standFeet = minY([...points(S, 'footL'), ...points(S, 'footR')]);
  h.hold = 'Sit'; for (let f = 0; f < 120; f++) h.animate(dt, 0); update(h);
  const hipsY = h.bone('hips')!.getWorldPosition(new THREE.Vector3()).y;
  // the buttocks and the back of the thighs: vertices over the seat's footprint (not the knees, not the legs hanging down)
  const footprint = points(S, 'hipsThigh').filter(p => Math.abs(p.x) < 0.2 && p.z > -0.25 && p.z < 0.2 && p.y > seatTop - 0.15);
  const under = minY(footprint);
  const feetY = minY([...points(S, 'footL'), ...points(S, 'footR')]);
  const knee = h.bone('shin.L')!.getWorldPosition(new THREE.Vector3()), hip = h.bone('thigh.L')!.getWorldPosition(new THREE.Vector3());
  const seated = { hipsBone_m: r3(hipsY - seatTop), seatContact_m: r3(under - seatTop), feetToFloor_m: r3(feetY - (seatTop - SIT_HIPS)), thighSlope_deg: r3(THREE.MathUtils.radToDeg(Math.atan2(knee.y - hip.y, Math.hypot(knee.x - hip.x, knee.z - hip.z)))) };
  // stand again: the body returns to the idle pose
  h.hold = null; for (let f = 0; f < 120; f++) h.animate(dt, 0); update(h);
  const back = { hips_m: r3(h.bone('hips')!.getWorldPosition(new THREE.Vector3()).y - standHips), feet_m: r3(minY([...points(S, 'footL'), ...points(S, 'footR')]) - standFeet), clip: h.clipName };
  dispose(h); return { seated, backToStanding: back, standingFeetToFloor_m: r3(standFeet - (seatTop - SIT_HIPS)) };
}

// ---------------------------------------------------------------- 3. riding the moto (hands on grips, feet on pegs)
function ride(c: typeof CASES[number]) {
  const rows = []; const seeds: number[] = [];
  for (let seed = 1; seeds.length < 5 && seed < 60; seed++) if (vehicleSpec('moto', { seed, driver: false, passengers: false }).controls.pegs![0][2] <= 0) seeds.push(seed);   // the 125 cc, as tests/poses.test.ts (the scooter pose is not calibrated to its bars in the baseline)
  for (const seed of seeds) {
    const spec = vehicleSpec('moto', { seed, driver: false, passengers: false }), seat = spec.seats.find(s => s.kind === 'driver')!, ctl = spec.controls;
    const h = make(c), S = sampler(h), dt = 1 / 60;
    h.group.position.set(seat.x, seat.top - SIT_HIPS, seat.z); h.group.rotation.y = seat.yaw; h.hold = 'Ride';
    for (let f = 0; f < 120; f++) h.animate(dt, 0); update(h);
    const world = (p: readonly number[]) => new THREE.Vector3(p[0], p[1], p[2]);
    const sides = ['L', 'R'] as const;
    const palmTip = sides.map((side, i) => { const b = h.bone(`hand.${side}`)!; return new THREE.Vector3(0, 0.07, 0).applyMatrix4(b.matrixWorld).distanceTo(world(ctl.grips[i])); });   // the repo's measure
    const handMesh = ['handL', 'handR'].map((set, i) => minDist(points(S, set), world(ctl.grips[i])));
    const footBone = sides.map((side, i) => h.bone(`foot.${side}`)!.getWorldPosition(new THREE.Vector3()).distanceTo(world(ctl.pegs![i])));
    const pegMesh = ['footL', 'footR'].map((set, i) => minDist(points(S, set), world(ctl.pegs![i])));
    rows.push({ seed, palmTipToGrip_m: palmTip.map(r3), handMeshToGrip_m: handMesh.map(r3), footBoneToPeg_m: footBone.map(r3), footMeshToPeg_m: pegMesh.map(r3), hipsAboveSaddle_m: r3(h.bone('hips')!.getWorldPosition(new THREE.Vector3()).y - seat.top) });
    dispose(h);
  }
  const flat = (k: 'palmTipToGrip_m' | 'handMeshToGrip_m' | 'footBoneToPeg_m' | 'footMeshToPeg_m') => rows.flatMap(r => r[k]);
  const sum = (k: Parameters<typeof flat>[0]) => ({ median: r3(pct(flat(k), 0.5)), max: r3(Math.max(...flat(k))) });
  return { seeds, palmTipToGrip_m: sum('palmTipToGrip_m'), handMeshToGrip_m: sum('handMeshToGrip_m'), footBoneToPeg_m: sum('footBoneToPeg_m'), footMeshToPeg_m: sum('footMeshToPeg_m'), hipsAboveSaddle_m: { min: r3(Math.min(...rows.map(r => r.hipsAboveSaddle_m))), max: r3(Math.max(...rows.map(r => r.hipsAboveSaddle_m))) }, rows };
}

// ---------------------------------------------------------------- 4. gestures and held objects
/** Where the mouth really is on this body: between the nose tip (furthest-forward head vertex) and the chin, from the mesh. */
function faceLandmarks(h: Humanoid, S: Sampler) {
  update(h); const head = points(S, 'head'); let nose = head[0]; for (const p of head) if (p.z > nose.z) nose = p;
  const chinPool = head.filter(p => p.z > nose.z - 0.1 && p.y < nose.y - 0.03); const chin = chinPool.reduce((m, p) => (p.y < m.y ? p : m), chinPool[0] ?? nose);
  return { nose, chin, mouth: new THREE.Vector3(nose.x, chin.y + (nose.y - chin.y) * 0.38, nose.z - 0.015) };
}
function gestures(c: typeof CASES[number]) {
  const h = make(c), S = sampler(h), dt = 1 / 60; h.group.position.set(0, 0, 0);
  for (let f = 0; f < 60; f++) h.animate(dt, 0);
  const lm = faceLandmarks(h, S), game = mouth(h);
  // the game's own "hand to mouth": wrist reaches mouth(h), elbow down and out
  h.overlay = hh => reach(hh, 'R', mouth(hh), new THREE.Vector3(0.4, -1, 0.1), 1);
  for (let f = 0; f < 30; f++) h.animate(dt, 0); update(h);
  const wrist = h.bone('hand.R')!.getWorldPosition(new THREE.Vector3());
  const handMesh = points(S, 'handR'), reachErr = wrist.distanceTo(game);
  const fingerToMouth = minDist(handMesh, lm.mouth), fingerToGameMouth = minDist(handMesh, game);
  // two-hand "arms up"
  h.overlay = hh => { reach(hh, 'L', new THREE.Vector3(-0.25, 2.1, 0.1), new THREE.Vector3(-0.5, 0, 0), 1); reach(hh, 'R', new THREE.Vector3(0.25, 2.1, 0.1), new THREE.Vector3(0.5, 0, 0), 1); };
  for (let f = 0; f < 30; f++) h.animate(dt, 0); update(h);
  const armsUp = [h.bone('hand.L')!.getWorldPosition(new THREE.Vector3()).y, h.bone('hand.R')!.getWorldPosition(new THREE.Vector3()).y];
  // a held object (a 7 cm cup) at the game's grip point, along the forearm
  h.overlay = null; h.animate(dt, 0); h.group.updateMatrixWorld(true);
  const g = grip(h, 'R'), dir = forearmDir(h, 'R'); const palm = points(S, 'handR');
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.12, 12), new THREE.MeshLambertMaterial({ color: 0xd9482b })); cup.position.copy(g); cup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir); scene.add(cup);
  update(h);
  const cupToHand = minDist(palm, g), insideCount = palm.filter(p => p.distanceTo(g) < 0.02).length;
  scene.remove(cup); cup.geometry.dispose();
  const res = { mouthTargetVsMesh_m: r3(game.distanceTo(lm.mouth)), mouthTargetDy_m: r3(game.y - lm.mouth.y), mouthTargetDz_m: r3(game.z - lm.mouth.z), wristReachError_m: r3(reachErr), fingersToMeshMouth_m: r3(fingerToMouth), fingersToGameMouth_m: r3(fingerToGameMouth), armsUpHandY_m: armsUp.map(r3), heldObject: { gripToNearestHandVertex_m: r3(cupToHand), handVerticesWithin2cm: insideCount } };
  dispose(h); return res;
}

// ---------------------------------------------------------------- 5. transitions between clips: the largest sudden movement of the body surface
function transitions(c: typeof CASES[number]) {
  const h = make(c), dt = 1 / 60, S = sampler(h), body = S.meshes.reduce((a, b) => (b.mesh.geometry.getAttribute('position').count > a.mesh.geometry.getAttribute('position').count ? b : a)).mesh;
  const n = body.geometry.getAttribute('position').count, pick: number[] = []; for (let i = 0; i < 400; i++) pick.push(Math.floor((i / 400) * n));
  let prev: THREE.Vector3[] | null = null;
  const local = (): THREE.Vector3[] => { update(h); const inv = new THREE.Matrix4().copy(h.group.matrixWorld).invert(); return pick.map(i => { body.getVertexPosition(i, _v); return _v.clone().applyMatrix4(body.matrixWorld).applyMatrix4(inv); }); };
  const phases: [string, number, number, Clip | null][] = [['idle', 1, 0, null], ['idle→walk', 2, 1.4, null], ['walk→run', 2, 5.6, null], ['run→stop', 1.5, 0, null], ['talk', 1, 0, 'Talk'], ['sit', 1.5, 0, 'Sit'], ['stand', 1.5, 0, null], ['dance', 1, 0, 'Dance_A'], ['celebrate', 1, 0, 'Celebrate'], ['back to idle', 1.2, 0, null]];
  const out: Record<string, { maxSpeed_mps: number; p99_mps: number }> = {};
  for (const [name, secs, speed, hold] of phases) {
    h.hold = hold; const sp: number[] = [];
    for (let f = 0; f < secs * 60; f++) { h.group.position.z += speed * dt; h.animate(dt, speed); const cur = local(); if (prev) { let mx = 0; for (let i = 0; i < cur.length; i++) mx = Math.max(mx, cur[i].distanceTo(prev[i]) / dt); sp.push(mx); } prev = cur; }
    out[name] = { maxSpeed_mps: r3(Math.max(...sp)), p99_mps: r3(pct(sp, 0.99)) };
  }
  dispose(h); return out;
}

// ---------------------------------------------------------------- 6. switching bodies, fallback, leaks
async function switching() {
  const log: string[] = []; const seq: BodyId[] = ['v4', 'meshy_m', 'meshy_f', 'meshy_m', 'v4', 'meshy_f'];
  const t0 = performance.now(); let h: Humanoid | null = null, errors = 0; const memBefore = { ...renderer.info.memory };
  const ms: Record<string, number[]> = {};
  for (let i = 0; i < 60; i++) {
    const id = seq[i % seq.length], t = performance.now();
    try { const prevPos = h ? h.group.position.clone() : new THREE.Vector3(0, 0, i * 0.01), prevHold = h?.hold ?? null; if (h) dispose(h);
      h = new Humanoid(id === 'v4' ? MALE : MALE, id); h.fullRate = true; h.group.position.copy(prevPos); h.hold = prevHold; scene.add(h.group); for (let f = 0; f < 5; f++) h.animate(1 / 60, 0);
      if (h.body !== id) { errors++; log.push(`asked ${id} got ${h.body}`); } } catch (e) { errors++; log.push(String(e)); }
    (ms[id] ??= []).push(performance.now() - t);
  }
  if (h) dispose(h); renderer.render(scene, camera);
  const memAfter = { ...renderer.info.memory };
  // fallback: a body that is not loaded, then one whose file is missing
  dropBody('meshy_f'); const notLoaded = new Humanoid(MALE, 'meshy_f'); const fbA = notLoaded.body; dispose(notLoaded);
  const okMissing = await preloadBody('meshy_f', '/proof/meshy/out/does_not_exist.glb'); const afterMissing = new Humanoid(MALE, 'meshy_f'); const fbB = afterMissing.body; dispose(afterMissing);
  const okBack = await preloadBody('meshy_f', url('meshy_f_v4rig.glb')); const restored = new Humanoid(MALE, 'meshy_f'); const fbC = restored.body; dispose(restored);
  return { switches: 60, errors, log, createMs: Object.fromEntries(Object.entries(ms).map(([k, a]) => [k, { median: r3(pct(a, 0.5)), max: r3(Math.max(...a)) }])), totalSeconds: r3((performance.now() - t0) / 1000), geometriesBefore: memBefore.geometries, geometriesAfter: memAfter.geometries, texturesBefore: memBefore.textures, texturesAfter: memAfter.textures,
    fallback: { notLoadedBodyGot: fbA, missingFileLoadResult: okMissing, missingFileBodyGot: fbB, reloadResult: okBack, reloadedBodyGot: fbC } };
}

// ---------------------------------------------------------------- 7. cost
function cost(c: typeof CASES[number], count = 40, frames = 300) {
  const one = make(c); renderer.info.reset(); renderer.render(scene, camera); const calls = renderer.info.render.calls - 1, tris = renderer.info.render.triangles - 2; // minus the ground
  const S = sampler(one); let verts = 0, bones = 0; for (const m of S.meshes) { verts += m.mesh.geometry.getAttribute('position').count; bones = Math.max(bones, m.mesh.skeleton.bones.length); }
  let geoBytes = 0, texBytes = 0; const seen = new Set<unknown>();
  for (const m of S.meshes) { for (const a of Object.values(m.mesh.geometry.attributes)) geoBytes += a.array.byteLength; if (m.mesh.geometry.index) geoBytes += m.mesh.geometry.index.array.byteLength;
    const mat = m.mesh.material as THREE.MeshLambertMaterial; const map = mat.map; if (map && !seen.has(map)) { seen.add(map); const im = map.image as { width: number; height: number }; texBytes += im.width * im.height * 4 * 1.33; } }
  dispose(one);
  const hs: Humanoid[] = []; for (let i = 0; i < count; i++) { const h = make(c); h.group.position.set((i % 8) * 1.2 - 4, 0, Math.floor(i / 8) * 1.2); hs.push(h); }
  for (let f = 0; f < 30; f++) hs.forEach(h => h.animate(1 / 60, 1.4));          // warm-up (JIT)
  const t = performance.now(); for (let f = 0; f < frames; f++) hs.forEach(h => { h.group.position.z += 1.4 / 60; h.animate(1 / 60, 1.4); });
  const msPerBodyFrame = (performance.now() - t) / (frames * count);
  for (const h of hs) h.group.updateMatrixWorld(true);
  camera.position.set(0, 4, -9); camera.lookAt(0, 1, 0.5); renderer.info.reset(); renderer.render(scene, camera);          // (SwiftShader: only relative)
  const frameCalls = renderer.info.render.calls, frameTris = renderer.info.render.triangles;
  const tr = performance.now(); for (let f = 0; f < 12; f++) renderer.render(scene, camera); const renderMs = (performance.now() - tr) / 12;
  hs.forEach(dispose);
  return { drawCallsPerBody: calls, trianglesPerBody: tris, skinnedVertices: verts, bones, geometryKB: Math.round(geoBytes / 1024), textureMB: r3(texBytes / 1048576), jsMsPerBodyPerFrame: r3(msPerBodyFrame), crowd40: { drawCalls: frameCalls - 1, triangles: frameTris - 2, softwareRenderMs: r3(renderMs) } };
}

// ---------------------------------------------------------------- shots
function shot(name: string, setup: () => void, cam: [number, number, number], look: [number, number, number]) {
  setup(); camera.position.set(...cam); camera.lookAt(...look); renderer.render(scene, camera); return name;
}
function lineup(clip: Clip | null, speed = 0, frames = 40, y = 0) {
  const hs = CASES.map((c, i) => { const h = make(c); h.group.position.set((i - 1.5) * 1.1, y, 0); h.group.rotation.y = 0; h.hold = clip; return h; });
  for (let f = 0; f < frames; f++) hs.forEach(h => { h.group.position.z += speed / 60; h.animate(1 / 60, speed); });
  return hs;
}

function clipInfo(c: typeof CASES[number], clipName: Clip) {
  const h = make(c); h.hold = clipName; for (let f = 0; f < 120; f++) h.animate(1 / 60, 0); h.group.updateMatrixWorld(true);
  const clip = (h as unknown as { actions: Map<string, THREE.AnimationAction> }).actions.get(clipName)!.getClip();
  const out = { tracks: clip.tracks.filter(t => /^(root|hips)\./.test(t.name)).map(t => `${t.name} n=${t.times.length} first=${Array.from(t.values.slice(0, 3)).map(x => +x.toFixed(3))}`), hipsWorldY: r3(h.bone('hips')!.getWorldPosition(new THREE.Vector3()).y), rootWorldY: r3(h.bone('root')!.getWorldPosition(new THREE.Vector3()).y) };
  dispose(h); return out;
}

const api = {
  clipInfo,
  async init() {
    const t0 = performance.now(); await preloadHumanoid('/'); const tV4 = performance.now() - t0;
    const t1 = performance.now(), a = await preloadBody('meshy_m', url('meshy_m_v4rig.glb')); const tM = performance.now() - t1;
    const t2 = performance.now(), b = await preloadBody('meshy_f', url('meshy_f_v4rig.glb')); const tF = performance.now() - t2;
    const size = async (f: string) => (await (await fetch(f)).arrayBuffer()).byteLength;
    return { v4: humanoidReady(), meshy_m: a && bodyReady('meshy_m'), meshy_f: b && bodyReady('meshy_f'),
      loadMs: { v4: r3(tV4), meshy_m: r3(tM), meshy_f: r3(tF) }, downloadKB: { v4: Math.round(await size('/assets/character_v4.glb') / 1024), meshy_m: Math.round(await size(url('meshy_m_v4rig.glb')) / 1024), meshy_f: Math.round(await size(url('meshy_f_v4rig.glb')) / 1024) } };
  },
  /** Swaps the template of a body for another file (the free low-detail variants) and reports the load time. */
  async loadVariant(id: 'meshy_m' | 'meshy_f', file: string) { const t = performance.now(); const ok = await preloadBody(id, url(file)); return { ok, ms: r3(performance.now() - t), kb: Math.round((await (await fetch(url(file))).arrayBuffer()).byteLength / 1024) }; },
  onFoot, footShape, sitStand, ride, gestures, transitions, switching, cost,
  cases: CASES.map(c => c.id),
  caseOf: (id: string) => CASES.find(c => c.id === id)!,
  /** Line-up shots for the visual review (all four bodies side by side); clears the scene afterwards. */
  lineup(kind: 'idle' | 'walk' | 'run' | 'sit' | 'talk' | 'gesture') {
    const hs = kind === 'sit' ? lineup('Sit', 0, 90, 0.0) : kind === 'talk' ? lineup('Talk', 0, 60) : kind === 'walk' ? lineup(null, 1.4, 80) : kind === 'run' ? lineup(null, 5.6, 80) : lineup(null, 0, 40);
    if (kind === 'sit') hs.forEach(h => h.group.position.y = 0);   // origin = seat top - SIT_HIPS; chairs omitted: the body shows the seated pose
    if (kind === 'gesture') hs.forEach(h => { h.overlay = hh => reach(hh, 'R', mouth(hh), new THREE.Vector3(0.4, -1, 0.1), 1); for (let f = 0; f < 30; f++) h.animate(1 / 60, 0); });
    const z = hs[0].group.position.z;
    camera.position.set(0.0, 1.5, z + (kind === 'run' ? 7.2 : 6.2)); camera.lookAt(0, kind === 'sit' ? 0.7 : 0.95, z); renderer.render(scene, camera);
    return () => hs.forEach(dispose);
  },
  closeUp(id: string, view: 'face' | 'hands' | 'back' | 'side' | 'front' | 'threeq', clip: Clip | null = null) {
    const c = api.caseOf(id), h = make(c); h.hold = clip; for (let f = 0; f < 30; f++) h.animate(1 / 60, 0); update(h);
    const head = h.bone('head')!.getWorldPosition(new THREE.Vector3()); const g = h.group.scale.y;
    const cams: Record<string, [[number, number, number], [number, number, number]]> = {
      face: [[0.25, head.y + 0.06, 1.0], [0, head.y + 0.05, 0]], hands: [[0.9, 0.95, 0.95], [0.25, 0.9, 0]],
      front: [[0, 1.0, 5.2], [0, 0.95, 0]], back: [[0, 1.0, -5.2], [0, 0.95, 0]], side: [[5.2, 1.0, 0], [0, 0.95, 0]], threeq: [[3.4, 1.4, 3.8], [0, 0.95, 0]],
    };
    void g; camera.fov = view === 'face' || view === 'hands' ? 30 : 30; camera.updateProjectionMatrix(); camera.position.set(...cams[view][0]); camera.lookAt(...cams[view][1]); renderer.render(scene, camera);
    return () => dispose(h);
  },
  resize(w: number, h: number) { renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); },
  sceneCount: () => scene.children.length,
};
declare global { interface Window { proof: typeof api; ready: boolean } }
window.proof = api; window.ready = true;
