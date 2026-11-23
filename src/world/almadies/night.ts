import * as THREE from 'three';

/**
 * LD2.0-E: the district's windows at night. The panes (`DistrictKit.glass`) wear one shared material: bluish glass by day, warm light behind it at night
 * (`setDistrictNight`, called by src/main.ts with the street's lighting, as the villa's façade is: src/housing/villaFacade.ts). Shared, never disposed.
 */
let mat: THREE.MeshLambertMaterial | null = null;
const DAY = new THREE.Color(0x335577), NIGHT = new THREE.Color(0xffb560);
export function districtGlassMaterial(): THREE.MeshLambertMaterial {
  if (mat) return mat;
  mat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: DAY.getHex(), emissiveIntensity: 0.25 });
  mat.userData.shared = true;
  return mat;
}
/** 0 by day … 1 at night. */
export function setDistrictNight(night: number) {
  const m = districtGlassMaterial();
  m.emissive.copy(DAY).lerp(NIGHT, Math.min(1, night * 1.2)); m.emissiveIntensity = 0.25 + 0.6 * night;
}
