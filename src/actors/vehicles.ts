import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { buildVehicle, type VehicleOpts } from './vehicleKit';

/** Blender-made car rapide (public/assets/car_rapide.glb), loaded at start-up when present. */
let rapideTemplate: THREE.Group | null = null;
/** 'TEMP procedural' = the vehicle kit's car rapide (until a reviewed Blender model is exported). */
export const assetStatus = { carRapide: 'TEMP procedural' as 'TEMP procedural' | 'Blender GLB' };

export async function preloadAssets(base = import.meta.env.BASE_URL): Promise<void> {
  try {
    // Let the loader resolve any external textures relative to the model's URL.
    const gltf = await new GLTFLoader().loadAsync(`${base}assets/car_rapide.glb`);
    const g = new THREE.Group(); g.name = 'car_rapide_blender';
    gltf.scene.traverse(o => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        // Keep Blender's textures, transparency and PBR materials, including material arrays.
        // Group.clone shares geometry/materials: hub cleanup must not dispose the template's resources.
        m.userData.shared = true;
      }
    });
    g.add(gltf.scene);
    rapideTemplate = g; assetStatus.carRapide = 'Blender GLB';
  } catch { /* keep the temporary model */ }
}

/**
 * Car rapide: the Blender asset when public/assets/car_rapide.glb is present, otherwise the procedural kit model
 * (src/actors/vehicleKit.ts: hand-painted livery of our own, fictional nickname, no religious inscription).
 * The kit group carries its spec in `userData.vehicleSpec` (seats, doors, step, camera anchors).
 */
export function makeCarRapide(opts: VehicleOpts = {}): THREE.Group {
  if (rapideTemplate) return rapideTemplate.clone(true);
  return buildVehicle('carRapide', opts).group;
}

/** Decorative taxi (kit): yellow and black Dakar taxi. Visual only: decorative traffic has no gameplay collisions. */
export function makeTaxi(opts: VehicleOpts = {}): THREE.Group {
  return buildVehicle('taxi', opts).group;
}
