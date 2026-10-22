import * as THREE from 'three';

/** The studio's light: a soft warm key from the front left, a cool fill, a rim from behind, under an open sky (close to the game's daylight, a little kinder). */
export function STUDIO_LIGHT(): THREE.Light[] {
  const hemi = new THREE.HemisphereLight(0xf6f3ee, 0x86705a, 1.05);
  const key = new THREE.DirectionalLight(0xfff0de, 1.75); key.position.set(-1.7, 3.1, 2.7);
  const fill = new THREE.DirectionalLight(0xe0e8ff, 0.42); fill.position.set(2.3, 1.3, 1.9);
  const rim = new THREE.DirectionalLight(0xc4d2ff, 0.85); rim.position.set(1.1, 2.4, -2.8);
  return [hemi, key, fill, rim];
}
/** The game's own light at noon and at night (src/main.ts updateLighting), for checks that a look holds outside the studio. */
export function gameLight(night: boolean): { lights: THREE.Light[]; exposure: number } {
  const hemi = new THREE.HemisphereLight(night ? 0x5a6ea8 : 0xd7e6f7, night ? 0x2a2620 : 0x9a7a52, night ? 0.75 : 1.05);
  const sun = new THREE.DirectionalLight(night ? 0x9fb4ff : 0xfff1dc, night ? 0.55 : 2.3);
  sun.position.copy(night ? new THREE.Vector3(-0.35, 0.85, 0.3) : new THREE.Vector3(0.1, 0.95, 0.42)).multiplyScalar(10);
  return { lights: [hemi, sun], exposure: night ? 1.3 : 1 };
}
