import * as THREE from 'three';
import { flatten, loadGlb } from '../actors/vehicles';

/**
 * Street props modelled in Blender (public/assets/props.glb, source assets-src/props_v1.blend): lamp post, wooden
 * power pole, bench, oil-drum bin. Each is flattened to one coloured geometry and merged into the hub's batches,
 * so they add no draw calls. Missing file = the builder keeps its box versions.
 */
export interface PropSet { lamp: THREE.BufferGeometry; lampBulb: THREE.BufferGeometry; pole: THREE.BufferGeometry; bench: THREE.BufferGeometry; drum: THREE.BufferGeometry }
export let props: PropSet | null = null;

export async function preloadProps(base = import.meta.env.BASE_URL) {
  const root = await loadGlb(`${base}assets/props.glb`); if (!root) return;
  const part = (name: string, keep: (m: string) => boolean = () => true) => {
    const node = root.getObjectByName(name); if (!node) return null;
    const holder = new THREE.Group(); holder.add(node.clone(true)); node.position.set(0, 0, 0);
    holder.children[0].position.set(0, 0, 0);
    return flatten(holder, keep, () => true);
  };
  const lamp = part('LampPost', m => m !== 'Bulb'), lampBulb = part('LampPost', m => m === 'Bulb');
  const pole = part('PowerPole'), bench = part('Bench'), drum = part('Drum');
  if (lamp && lampBulb && pole && bench && drum) props = { lamp, lampBulb, pole, bench, drum };
}
