import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
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

interface Prepared { scene: THREE.Object3D; wheels: { id: string; r: number; steer: boolean }[]; tris: number; drawCalls: number; interior: boolean }
const prepared = new Map<string, Prepared | null>();

/** The prepared bodies are used, except on a test host (local, preview) with `?vehicleModel=kit`. */
export function glbVehiclesWanted(hostname: string, search: string): boolean {
  return !(isTestHost(hostname) && new URLSearchParams(search).get('vehicleModel') === 'kit');
}
let enabled = typeof location === 'undefined' || glbVehiclesWanted(location.hostname, location.search);
/** Tests and checks switch it directly. */
export const setGlbVehicles = (on: boolean) => { enabled = on; };
export const glbVehiclesEnabled = () => enabled;

/** Loads the prepared models (once; a missing or broken one is remembered as absent, the kit model stays). */
export async function preloadGlbVehicles(ids: readonly string[], base = import.meta.env.BASE_URL): Promise<void> {
  if (!enabled) return;
  await Promise.all(ids.filter(id => !prepared.has(id)).map(async id => {
    try {
      const gltf = await new GLTFLoader().loadAsync(`${base}assets/vehicles/${id}.glb`);
      // the sidecar of the pipeline says whether the cabin is hollow; without it the model is taken as a solid shell (no « at the wheel » view)
      const side = await fetch(`${base}assets/vehicles/${id}.json`).then(r => r.ok ? r.json() : null, () => null) as { interior?: boolean } | null;
      prepared.set(id, prepare(gltf.scene, side?.interior === true));
    } catch { prepared.set(id, null); }
  }));
}

const lamberts = new Map<string, THREE.Material>();                         // one per source material: the wheels and the body share it
const lambert = (m: THREE.Material): THREE.Material => {
  const hit = lamberts.get(m.uuid); if (hit) return hit;
  const s = m as THREE.MeshStandardMaterial;
  const out = new THREE.MeshLambertMaterial({ color: s.color ?? 0xffffff, map: s.map ?? null, emissive: s.emissive ?? 0x000000, emissiveMap: s.emissiveMap ?? null, transparent: s.transparent, opacity: s.opacity, alphaTest: s.alphaTest });
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
  return { scene, wheels, tris, drawCalls, interior };
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
  g.add(body);
  g.userData.vehicleSpec = kit;
  const rig = rigOf(g, kit.drive.steerMax);
  if (!p.interior) {                                              // a solid shell has no cabin: the shared cockpit, shown in the « Au volant » view only
    const ck = buildCockpit(kit);
    g.add(ck.group); g.userData.glbCockpit = ck.group; rig.cockpitWheel = ck.wheel;
    const shell = body.getObjectByName('body'); if (shell) g.userData.glbHide = [shell];     // seen from inside, the shell's own interior would be a mess: it is not drawn, the cockpit is
  }
  g.userData.glbRig = rig;
  return g;
}

const tints = new Map<string, THREE.Material>();
/** Paints the body of a prepared car another colour (a multiplier on its paint texture: the showroom's other lots). The wheels keep theirs. */
export function tintBody(g: THREE.Object3D, hex: number) {
  g.getObjectByName('body')?.traverse(o => {
    const m = o as THREE.Mesh; if (!m.isMesh || Array.isArray(m.material)) return;
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
