import type * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/** One authored preview character, from new CC0 anatomy and retargeted Quaternius motion. */
export interface CharacterTemplate { scene: THREE.Object3D; clips: THREE.AnimationClip[] }
let character: CharacterTemplate | undefined;
export const referenceCharacter = () => character;
export async function preloadReferenceCharacter(base = import.meta.env.BASE_URL): Promise<void> {
  const gltf = await new GLTFLoader().loadAsync(`${base}assets/reference_character.glb`);
  const clips = gltf.animations;
  for (const required of ['Idle', 'Walk', 'Jog', 'Run', 'Sit', 'SitEnter', 'SitExit', 'TurnLeft', 'TurnRight']) {
    if (!clips.some(c => c.name === required)) throw new Error(`Reference character missing ${required}`);
  }
  character = { scene: gltf.scene, clips };
}
