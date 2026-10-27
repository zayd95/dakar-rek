import * as THREE from 'three';

/**
 * Light laid on a surface without a light source (night: the street lamps' pools, the player's headlights on the road, src/transport/headlightPool.ts):
 * the surface drawn under it is multiplied by 1 + the light (destination × (1 + source)), so it keeps its own colour and contrast — the white
 * markings and the pale kerbs come out of the dark asphalt as they do under a real lamp — where an additive glow laid the same orange over the asphalt
 * and the markings alike (the markings washed out first). The source is clamped to 1: a pool at most doubles what is under it.
 */
export const LIGHT_BLEND = { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.DstColorFactor, blendDst: THREE.OneFactor } as const;

/** A material for a pool of light: its texture's alpha shapes it (premultiplied into the colour), never fogged, never tone-mapped, never written to depth. */
export function lightPoolMaterial(o: THREE.MeshBasicMaterialParameters): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, premultipliedAlpha: true, toneMapped: false, fog: false, ...LIGHT_BLEND, ...o });
}
