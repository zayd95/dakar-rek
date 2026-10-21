import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { isTestHost } from '../core/testParams';
import type { VehicleSpec } from './vehicleKit';
import { buildCockpit } from './cockpit';

/**
 * Hand-made / generated replacement bodies for the player's vehicles (public/assets/vehicles/<id>.glb, prepared and checked by
 * scripts/vehicles/prepare-vehicle-glb.mjs). Only the LOOK changes: ownership, driving, parking, seats, doors, cameras and the
 * save all stay the kit vehicle's, so the GLB is fitted to the kit's dimensions and axle positions and takes its place in the
 * same group, carrying the same `userData.vehicleSpec`.
 *
 * Wheels are separate nodes, `axle_<fl|fr|rl|rr>` (at the hub; the front pair is turned about Y to steer) > `wheel_*` (spun about
 * X by the distance driven). Materials are made Lambert (the game's lighting, cheaper than glTF's PBR on a phone).
 *
 * Used by default. `?vehicleModel=kit` on local / preview hosts (never honoured on the production host) forces the procedural kit model for comparison; when
 * the file is missing or fails to load the procedural model is used as before.
 */
export interface GlbWheel { spin: THREE.Object3D; steer: THREE.Object3D | null; r: number }
export interface GlbRig { wheels: GlbWheel[]; angle: number; steerMax: number; /** The cockpit's steering wheel (a solid-shell body only). */ cockpitWheel?: THREE.Object3D }

interface Prepared { scene: THREE.Object3D; wheels: { id: string; r: number; steer: boolean }[]; tris: number; drawCalls: number; interior: boolean; far: THREE.Object3D | null; far2: THREE.Object3D | null }
/** Beyond this distance an authored body is drawn as its far model: the same shell and details merged into two meshes, wheels fixed (8 draw calls → 2). */
export const FAR_LOD = 38;
/** Beyond this one, the far model coarser still: its vertices gathered on a grid of CLUSTER metres (a car across a district is a few pixels; it keeps its paint). */
export const FAR2_LOD = 70;
const CLUSTER = 0.16;
const prepared = new Map<string, Prepared | null>();

/** The prepared bodies are used, except on a test host (local, preview) with `?vehicleModel=kit`. */
export function glbVehiclesWanted(hostname: string, search: string): boolean {
  return !(isTestHost(hostname) && new URLSearchParams(search).get('vehicleModel') === 'kit');
}
let enabled = typeof location === 'undefined' || glbVehiclesWanted(location.hostname, location.search);
/** Tests and checks switch it directly. */
export const setGlbVehicles = (on: boolean) => { enabled = on; };
export const glbVehiclesEnabled = () => enabled;

/** Why a model is not there (checks and the showroom's diagnosis read it: a silent fallback to the kit was how Ndiaye Auto came to show box cars). */
const failures = new Map<string, string>();
export const glbFailure = (id: string) => failures.get(id) ?? null;

/**
 * Loads the prepared models (once; a missing or broken one is remembered as absent, the kit model stays). A failed load is tried once more (a
 * dropped request on a phone network) and then reported on the console with its reason, never silently.
 */
export async function preloadGlbVehicles(ids: readonly string[], base = import.meta.env.BASE_URL): Promise<void> {
  if (!enabled) return;
  await Promise.all(ids.filter(id => !prepared.has(id)).map(async id => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const gltf = await new GLTFLoader().loadAsync(`${base}assets/vehicles/${id}.glb`);
        // the sidecar of the pipeline says whether the cabin is hollow; without it the model is taken as a solid shell (no « at the wheel » view)
        const side = await fetch(`${base}assets/vehicles/${id}.json`).then(r => r.ok ? r.json() : null, () => null) as { interior?: boolean } | null;
        prepared.set(id, prepare(gltf.scene, side?.interior === true)); failures.delete(id);
        return;
      } catch (e) {
        failures.set(id, String((e as Error)?.message ?? e));
      }
    }
    prepared.set(id, null);
    console.warn(`[vehicles] ${id}.glb did not load (${failures.get(id)}): the procedural model stands in for it`);
  }));
}

const lamberts = new Map<string, THREE.Material>();                         // one per source material: the wheels and the body share it
const lambert = (m: THREE.Material): THREE.Material => {
  const hit = lamberts.get(m.uuid); if (hit) return hit;
  const s = m as THREE.MeshStandardMaterial;
  const out = new THREE.MeshLambertMaterial({ color: s.color ?? 0xffffff, map: s.map ?? null, emissive: s.emissive ?? 0x000000, emissiveMap: s.emissiveMap ?? null, transparent: s.transparent, opacity: s.opacity, alphaTest: s.alphaTest, vertexColors: s.vertexColors });
  out.name = m.name; out.userData.shared = true;
  lamberts.set(m.uuid, out);
  return out;
};

/** Makes a loaded scene game-ready: Lambert materials, shadows, shared resources, wheel list. */
export function prepare(scene: THREE.Object3D, interior = false): Prepared {
  let tris = 0, drawCalls = 0; const wheels: Prepared['wheels'] = [];
  scene.traverse(o => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.material = Array.isArray(m.material) ? m.material.map(lambert) : lambert(m.material);
      m.castShadow = true; m.userData.shared = true;
      const g = m.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; drawCalls++;
    }
    if (/^axle_/.test(o.name)) wheels.push({ id: o.name.slice(5), r: o.userData.r ?? 0.3, steer: !!o.userData.steer });
  });
  const far = farModel(scene);
  return { scene, wheels, tris, drawCalls, interior, far, far2: far && coarse(far) };
}

/** Float copies of a geometry's attributes (quantised normals and uvs become plain floats), so pieces from different meshes merge. */
function plain(g: THREE.BufferGeometry, m: THREE.Matrix4): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  for (const [k, a] of Object.entries(g.attributes)) {
    const n = a.count, s = a.itemSize, arr = new Float32Array(n * s);
    for (let i = 0; i < n; i++) for (let c = 0; c < s; c++) arr[i * s + c] = c === 0 ? a.getX(i) : c === 1 ? a.getY(i) : c === 2 ? a.getZ(i) : a.getW(i);
    out.setAttribute(k, new THREE.BufferAttribute(arr, s));
  }
  if (g.index) out.setIndex(Array.from(g.index.array as ArrayLike<number>));
  out.applyMatrix4(m);
  return out;
}
/**
 * The far model of an authored body (one with a `paint` material: scripts/vehicles/author): everything but the cabin, the door shut and the wheels where
 * they stand, merged by material into one paint mesh and one trim mesh. Null for any other body (it keeps a single level).
 */
function farModel(scene: THREE.Object3D): THREE.Object3D | null {
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  let painted = false;
  scene.updateMatrixWorld(true);
  scene.traverse(o => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || Array.isArray(m.material)) return;
    for (let p: THREE.Object3D | null = m; p; p = p.parent) if (p.name === 'cabin') return;
    if (m.material.name === 'paint') painted = true;
    const list = byMat.get(m.material) ?? []; list.push(plain(m.geometry, m.matrixWorld)); byMat.set(m.material, list);
  });
  if (!painted) return null;
  const far = new THREE.Group(); far.name = 'far';
  for (const [mat, gs] of byMat) {
    const merged = mergeGeometries(gs, false); for (const g of gs) g.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mat); mesh.name = mat.name === 'paint' ? 'far_paint' : 'far_trim'; mesh.castShadow = true; mesh.userData.shared = true;
    far.add(mesh);
  }
  return far;
}

/** The far model with its meshes coarsened (vertex clustering): the same materials, a fraction of the triangles. */
function coarse(far: THREE.Object3D): THREE.Object3D {
  const out = new THREE.Group(); out.name = 'far2';
  for (const c of far.children) {
    const m = c as THREE.Mesh; if (!m.isMesh) continue;
    const mesh = new THREE.Mesh(clustered(m.geometry, CLUSTER), m.material); mesh.name = m.name; mesh.castShadow = true; mesh.userData.shared = true;
    out.add(mesh);
  }
  return out;
}
/** Every vertex moves onto the first vertex of its grid cell (its normal and uv too); the triangles that collapse are dropped. */
function clustered(g: THREE.BufferGeometry, cell: number): THREE.BufferGeometry {
  const pos = g.attributes.position, n = pos.count, idx = g.index ? (g.index.array as ArrayLike<number>) : null;
  const slot = new Map<string, number>(), remap = new Int32Array(n), keep: number[] = [];
  for (let i = 0; i < n; i++) {
    const k = `${Math.round(pos.getX(i) / cell)},${Math.round(pos.getY(i) / cell)},${Math.round(pos.getZ(i) / cell)}`;
    let j = slot.get(k); if (j === undefined) { j = keep.length; slot.set(k, j); keep.push(i); }
    remap[i] = j;
  }
  const out = new THREE.BufferGeometry();
  for (const [name, a] of Object.entries(g.attributes)) {
    const s = a.itemSize, src = a.array as ArrayLike<number>, arr = new Float32Array(keep.length * s);
    keep.forEach((i, j) => { for (let c = 0; c < s; c++) arr[j * s + c] = src[i * s + c]; });
    out.setAttribute(name, new THREE.BufferAttribute(arr, s));
  }
  const tri: number[] = [], len = idx ? idx.length : n;
  for (let t = 0; t + 2 < len; t += 3) {
    const a = remap[idx ? idx[t] : t], b = remap[idx ? idx[t + 1] : t + 1], c = remap[idx ? idx[t + 2] : t + 2];
    if (a !== b && b !== c && a !== c) tri.push(a, b, c);
  }
  out.setIndex(tri);
  return out;
}

/** The wheels of a model built with the node names above (what the pipeline writes). */
export function rigOf(root: THREE.Object3D, steerMax = 0.6): GlbRig {
  const wheels: GlbWheel[] = [];
  root.traverse(o => {
    if (!/^axle_/.test(o.name)) return;
    const spin = o.getObjectByName(`wheel_${o.name.slice(5)}`);
    if (spin) wheels.push({ spin, steer: o.userData.steer ? o : null, r: o.userData.r ?? 0.3 });
  });
  return { wheels, angle: 0, steerMax };
}

/**
 * A fresh copy of the prepared model for this vehicle, ready to take the kit vehicle's place: same group name and spec,
 * wheels rigged. null when the flag is off or the model is not there (the caller builds the kit model).
 */
export function glbVehicle(id: string, kit: VehicleSpec): THREE.Group | null {
  const p = enabled ? prepared.get(id) : null;
  if (!p) return null;
  const g = new THREE.Group(); g.name = `glb_${id}`;
  const body = p.scene.clone(true);
  if (p.far) {                                                   // near: the whole rig; far (FAR_LOD): two merged meshes; farther (FAR2_LOD): the same, coarse
    const lod = new THREE.LOD(); lod.name = 'glb_lod';
    lod.addLevel(body, 0); lod.addLevel(p.far.clone(true), FAR_LOD);
    if (p.far2) lod.addLevel(p.far2.clone(true), FAR2_LOD);
    g.add(lod);
  } else g.add(body);
  g.userData.vehicleSpec = kit;
  const rig = rigOf(g, kit.drive.steerMax);
  if (!p.interior) {                                              // a solid shell has no cabin: the shared cockpit, shown in the « Au volant » view only
    const ck = buildCockpit(kit);
    g.add(ck.group); g.userData.glbCockpit = ck.group; rig.cockpitWheel = ck.wheel;
    const shell = body.getObjectByName('body'); if (shell) g.userData.glbHide = [shell];     // seen from inside, the shell's own interior would be a mess: it is not drawn, the cockpit is
  }
  g.userData.glbRig = rig;
  // a body with its own driver's door (scripts/vehicles/author): the kit's door code swings it about its hinge, and the cabin behind it is drawn only while it is open
  const door = body.getObjectByName('door'), cabin = body.getObjectByName('cabin');
  if (door) { g.userData.kitDoor = door; if (cabin) { cabin.visible = false; g.userData.kitCabin = cabin; } }
  return g;
}

const tints = new Map<string, THREE.Material>();
/**
 * Paints the body of a prepared car another colour (a multiplier on its paint texture: the showroom's other lots). The wheels keep theirs; a body
 * with a material named `paint` (the authored ones) has only that tinted, its glass, lamps and trim stay as they are.
 */
export function tintBody(g: THREE.Object3D, hex: number) {
  const body0 = g.getObjectByName('body'); if (!body0) return;
  let painted = false; body0.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh && !Array.isArray(m.material) && m.material.name === 'paint') painted = true; });
  const body = painted ? g : body0;                                 // an authored body: its far model is painted too
  body.traverse(o => {
    const m = o as THREE.Mesh; if (!m.isMesh || Array.isArray(m.material)) return;
    if (painted && m.material.name !== 'paint') return;
    const key = `${m.material.uuid}:${hex}`; let t = tints.get(key);
    if (!t) { t = m.material.clone(); (t as THREE.MeshLambertMaterial).color.setHex(hex); t.userData.shared = true; tints.set(key, t); }
    m.material = t;
  });
}

/** One frame: wheels spin with the distance driven (m/s, + forward = +z), the front pair turns about Y (rad, + = left). */
export function animateGlbRig(rig: GlbRig, speed: number, steer: number, dt: number) {
  const s = THREE.MathUtils.clamp(steer, -rig.steerMax, rig.steerMax);
  for (const w of rig.wheels) {
    w.spin.rotation.x = (w.spin.rotation.x + (speed * dt) / w.r) % (Math.PI * 2);
    if (w.steer) w.steer.rotation.y = s;
  }
  rig.angle = s;
  if (rig.cockpitWheel) rig.cockpitWheel.rotation.z = -s * 3;       // 0.6 rad of road wheel is about a third of a turn at the wheel
}

/** Stats of a prepared model (checks, reports). */
export const glbStats = (id: string) => { const p = prepared.get(id); return p ? { tris: p.tris, drawCalls: p.drawCalls, wheels: p.wheels } : null; };
