import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

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

/** Car rapide: Blender asset when loaded, otherwise the TEMPORARY procedural placeholder. */
export function makeCarRapide(): THREE.Group {
  if (rapideTemplate) return rapideTemplate.clone(true);
  const g = new THREE.Group(); g.name = 'TEMP_car_rapide';
  const yellow = lam(0xf2c230), blue = lam(0x1e5fb4), dark = lam(0x222222), glass = lam(0x4a6b8a);
  g.add(bx(2.3, 1.4, 6.4, 0, 1.0, 0, yellow)); g.add(bx(2.34, 0.45, 6.44, 0, 1.3, 0, blue));
  g.add(bx(2.2, 0.9, 5.2, 0, 2.05, -0.4, yellow)); g.add(bx(2.22, 0.5, 4.6, 0, 2.2, -0.4, glass));
  g.add(bx(2.3, 0.9, 1.4, 0, 1.0, 3.5, yellow));
  g.add(bx(2.0, 0.12, 4.6, 0, 2.62, -0.4, dark));
  for (const sx of [-1, 1]) for (const z of [-2.1, 2.3]) { const w = bx(0.35, 0.9, 0.9, sx * 1.1, 0.45, z, dark); g.add(w); }
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
