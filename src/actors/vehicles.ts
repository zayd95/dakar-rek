import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Batch } from '../world/batch';

const lam = (c: number) => new THREE.MeshLambertMaterial({ color: c });
function bx(w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = true; return m;
}

/** Blender-made car rapide (public/assets/car_rapide.glb), loaded at start-up when present. */
let rapideTemplate: THREE.Group | null = null;
export const assetStatus = { carRapide: 'TEMP procedural' as 'TEMP procedural' | 'Blender GLB' };

export async function preloadAssets(base = import.meta.env.BASE_URL): Promise<void> {
  try {
    const res = await fetch(`${base}assets/car_rapide.glb`);
    if (!res.ok) return;
    const buf = await res.arrayBuffer();
    const gltf = await new GLTFLoader().parseAsync(buf, '');
    const g = new THREE.Group(); g.name = 'car_rapide_blender';
    gltf.scene.traverse(o => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        const old = m.material as THREE.MeshStandardMaterial;
        m.material = new THREE.MeshLambertMaterial({ color: old.color });
      }
    });
    g.add(gltf.scene);
    rapideTemplate = g; assetStatus.carRapide = 'Blender GLB';
  } catch { /* keep the temporary model */ }
}

/** Shared vertex-coloured material for procedural vehicles (one draw call per vehicle). */
const vehicleMat = new THREE.MeshLambertMaterial({ vertexColors: true });
let rapideGeo: THREE.BufferGeometry | null = null;

/**
 * TEMPORARY procedural car rapide (until car_rapide.glb is modelled in Blender): yellow and blue Saviem-style
 * minibus with a white roof, roof rack and luggage, rear ladder and open rear step, painted bands and
 * decorative panels (no text: lettering stays a separately authored asset). Built once, shared by all.
 */
function carRapideGeometry(): THREE.BufferGeometry {
  if (rapideGeo) return rapideGeo;
  const b = new Batch();
  const Y = 0xf2c230, BL = 0x1e5fb4, W = 0xf4f1e8, D = 0x1d1d1f, GL = 0x23313f, CH = 0xb8bcc0;
  b.box(2.3, 1.15, 6.6, 0, 0.55, 0, Y);                        // lower body
  b.box(2.32, 0.32, 6.62, 0, 1.05, 0, BL);                     // blue belt band
  b.box(2.34, 0.08, 6.64, 0, 1.4, 0, 0xd9322b);                // red pinstripe
  b.box(2.2, 1.0, 5.3, 0, 1.48, -0.55, Y);                     // passenger cabin
  b.box(2.24, 0.62, 5.0, 0, 1.68, -0.6, GL);                   // window row
  for (let k = 0; k < 6; k++) b.box(2.26, 0.62, 0.12, 0, 1.68, -2.9 + k * 0.92, Y); // window pillars
  b.box(2.22, 0.18, 5.4, 0, 2.46, -0.55, W);                   // white roof
  b.box(2.1, 0.9, 1.3, 0, 1.0, 2.75, Y);                       // bonnet
  b.box(2.12, 0.25, 1.32, 0, 1.75, 2.0, W);                    // cab roof
  b.box(2.14, 0.55, 0.1, 0, 1.4, 2.12, GL);                    // windscreen
  b.box(2.2, 0.25, 0.2, 0, 0.45, 3.45, CH);                    // front bumper
  b.box(1.4, 0.4, 0.06, 0, 0.95, 3.42, 0x9aa0a6);              // grille
  for (const sx of [-1, 1]) {
    b.box(0.3, 0.3, 0.05, sx * 0.85, 1.0, 3.42, 0xfff5d0);     // headlights
    b.box(0.05, 0.35, 1.6, sx * 1.17, 0.7, 0.4, sx > 0 ? 0x2f8f4e : 0xd9322b); // painted side panels
    b.box(0.05, 0.35, 1.0, sx * 1.17, 0.7, -2.2, 0xf4f1e8);
    for (const z of [-2.2, 2.4]) { b.cyl(0.45, 0.45, 0.32, sx * 1.02, 0.45, z, D, 12, [0, 0, Math.PI / 2]); b.cyl(0.2, 0.2, 0.34, sx * 1.02, 0.45, z, CH, 8, [0, 0, Math.PI / 2]); }
  }
  b.box(1.9, 0.08, 4.2, 0, 2.62, -0.8, D);                     // roof rack frame
  for (const sx of [-1, 1]) b.box(0.06, 0.25, 4.2, sx * 0.95, 2.6, -0.8, D);
  b.box(1.0, 0.5, 0.8, -0.35, 2.68, -1.6, 0x6b3fa0); b.box(0.7, 0.4, 0.7, 0.4, 2.68, -0.5, 0x8b6a47); b.box(0.9, 0.35, 0.6, 0.1, 2.68, 0.6, 0x1a9d54); // luggage
  b.box(0.5, 2.0, 0.06, 0.7, 0.6, -3.32, D);                   // rear ladder rails
  for (let k = 0; k < 5; k++) b.box(0.5, 0.05, 0.08, 0.7, 0.8 + k * 0.38, -3.33, D);
  b.box(1.0, 0.1, 0.5, -0.4, 0.3, -3.5, CH);                   // rear step (apprentice's perch)
  b.box(0.9, 1.4, 0.05, -0.4, 0.55, -3.31, GL);                // open rear door
  rapideGeo = b.build(vehicleMat, false, false)!.geometry;
  return rapideGeo;
}

/** Car rapide: Blender asset when loaded, otherwise the TEMPORARY procedural placeholder. */
export function makeCarRapide(): THREE.Group {
  if (rapideTemplate) return rapideTemplate.clone(true);
  const g = new THREE.Group(); g.name = 'TEMP_car_rapide';
  const m = new THREE.Mesh(carRapideGeometry(), vehicleMat); m.castShadow = true; m.userData.shared = true; g.add(m);
  return g;
}

/** TEMPORARY decorative taxi (yellow/black). Visual only: decorative traffic has no gameplay collisions. */
export function makeTaxi(color = 0xf0b800): THREE.Group {
  const g = new THREE.Group(); g.name = 'TEMP_taxi';
  const body = lam(color), dark = lam(0x1d1d1d), glass = lam(0x4a6b8a);
  g.add(bx(1.9, 0.8, 4.2, 0, 0.7, 0, body)); g.add(bx(1.7, 0.7, 2.2, 0, 1.4, -0.2, body)); g.add(bx(1.72, 0.45, 2.1, 0, 1.45, -0.2, glass));
  for (const sx of [-1, 1]) for (const z of [-1.4, 1.4]) g.add(bx(0.3, 0.7, 0.7, sx * 0.95, 0.35, z, dark));
  return g;
}
