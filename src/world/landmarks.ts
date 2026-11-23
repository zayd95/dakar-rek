import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { HubWorld, LandmarkSpot } from './types';

/**
 * The city's landmarks that are models, not shapes built in code (the owner, 11 Nov: the hand-built monument was « ugly »; « use my Meshy credits for all Dakar
 * landmarks »): the Monument de la Renaissance's statue group, the lighthouse of the Mamelles, the baobabs. Each is one file under public/assets/landmarks/
 * (one mesh, one colour texture, generated with Meshy and reduced: docs/ASSET_REGISTER.md) and a list of places a hub wants it (`HubWorld.landmarks`, set by the
 * builder with the solid box each one needs).
 *
 * A file is fetched once and kept; each visit to the district gets meshes of the same geometry and texture: one draw call per landmark, lit as the rest of the
 * city is (a matt surface: the game has no reflections for a metal to show). A file that cannot be fetched leaves its place empty: nothing else depends on it.
 */
type Model = { geometry: THREE.BufferGeometry; map: THREE.Texture | null; minY: number; height: number };
const cache = new Map<string, Promise<Model | null>>();
function load(file: string) {
  let p = cache.get(file);
  if (!p) {
    p = new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}assets/landmarks/${file}`).then(g => {
      let found: THREE.Mesh | null = null;
      g.scene.traverse(o => { if (!found && (o as THREE.Mesh).isMesh) found = o as THREE.Mesh; });
      if (!found) return null;
      const mesh = found as THREE.Mesh, geometry = mesh.geometry;
      geometry.computeBoundingBox();
      const b = geometry.boundingBox!;
      return { geometry, map: (mesh.material as THREE.MeshStandardMaterial).map ?? null, minY: b.min.y, height: b.max.y - b.min.y };
    }).catch(e => { console.warn(`[landmarks] ${file} did not load`, e); cache.delete(file); return null; });
    cache.set(file, p);
  }
  return p;
}

function place(hub: HubWorld, at: LandmarkSpot, m: Model): THREE.Mesh {
  const mesh = new THREE.Mesh(m.geometry, new THREE.MeshLambertMaterial({ map: m.map, color: at.tint ?? 0xffffff }));
  const k = at.height / m.height;
  mesh.name = `landmark_${at.name}`;
  mesh.scale.setScalar(k);
  mesh.rotation.y = at.yaw;
  mesh.position.set(at.x, at.y - m.minY * k, at.z);
  mesh.castShadow = at.shadow !== false; mesh.receiveShadow = false;
  hub.group.add(mesh);
  return mesh;
}

/** Adds a hub's landmarks as their files arrive (`alive`: the player is still in that district). Resolves to the meshes added. */
export async function attachLandmarks(hub: HubWorld, alive: () => boolean = () => true): Promise<THREE.Mesh[]> {
  const spots = hub.landmarks ?? [], out: THREE.Mesh[] = [];
  await Promise.all(spots.map(async at => { const m = await load(at.file); if (m && alive()) out.push(place(hub, at, m)); }));
  return out;
}
