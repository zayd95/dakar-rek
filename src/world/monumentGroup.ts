import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { HubWorld } from './types';

/**
 * The Monument de la Renaissance africaine's statue group, as a model (the owner, 11 Nov: the hand-built figures were « ugly »; « make it look realistic »).
 * public/assets/monument/renaissance_group.glb: 14 431 triangles, one colour texture (1024, bronze), 0.9 MB. Generated with Meshy from one photograph of the
 * monument's long side, then reduced; its far side is the generator's guess (docs/ASSET_REGISTER.md).
 *
 * The file is fetched once and kept; each visit to the Corniche gets a mesh of the same geometry and texture. It is one mesh and one draw call, lit as the
 * rest of the city is (a Lambert surface: the game has no reflections for a metal to show). If the file cannot be fetched the hill stands without its group:
 * nothing else depends on it.
 */
const FILE = 'assets/monument/renaissance_group.glb';
/** The model's own box (metres in the file): its long axis is x, it is seen from +z, it stands on y = MIN_Y. */
const MODEL = { minY: -0.9015, height: 1.8063 };

let loading: Promise<{ geometry: THREE.BufferGeometry; map: THREE.Texture | null } | null> | null = null;
function load() {
  loading ??= new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}${FILE}`).then(g => {
    let found: THREE.Mesh | null = null;
    g.scene.traverse(o => { if (!found && (o as THREE.Mesh).isMesh) found = o as THREE.Mesh; });
    if (!found) return null;
    const m = (found as THREE.Mesh).material as THREE.MeshStandardMaterial;
    return { geometry: (found as THREE.Mesh).geometry, map: m.map ?? null };
  }).catch(e => { console.warn('[monument] the statue group did not load', e); loading = null; return null; });
  return loading;
}

/** Adds the group to a hub that has the monument (the Corniche). Resolves to the mesh, or null when there is none to add. */
export async function attachMonumentGroup(hub: HubWorld, alive: () => boolean = () => true): Promise<THREE.Mesh | null> {
  const at = hub.monument?.group; if (!at) return null;
  const src = await load();
  if (!src || !alive()) return null;                                   // (the player left the district while it loaded)
  const mesh = new THREE.Mesh(src.geometry, new THREE.MeshLambertMaterial({ map: src.map, color: 0xffffff }));
  const k = at.height / MODEL.height;
  mesh.name = 'monument_group';
  mesh.scale.setScalar(k);
  mesh.rotation.y = -Math.PI / 2;                                       // the side the photograph shows faces the stair (−x); the child points south
  mesh.position.set(at.x, at.y - MODEL.minY * k, at.z);
  mesh.castShadow = true; mesh.receiveShadow = false;
  hub.group.add(mesh);
  return mesh;
}
