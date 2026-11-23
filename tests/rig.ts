import { readFileSync } from 'node:fs';
import * as THREE from 'three';

/**
 * Reads the skeleton and the clips of the shipped character straight from the GLB bytes (no meshes, no textures),
 * with the node names GLTFLoader gives them (PropertyBinding.sanitizeNodeName: "shin.L" → "shinL").
 */
export function loadRig() {
  const glb = new Uint8Array(readFileSync(new URL('../public/assets/character_v4.glb', import.meta.url)));
  const jsonLength = new DataView(glb.buffer).getUint32(12, true);
  const gltf = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + jsonLength)));
  const binStart = 20 + jsonLength + 8;
  const read = (index: number) => {
    const acc = gltf.accessors[index], view = gltf.bufferViews[acc.bufferView];
    const size = { SCALAR: 1, VEC3: 3, VEC4: 4 }[acc.type as 'SCALAR' | 'VEC3' | 'VEC4'];
    const start = binStart + (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
    return Array.from(new Float32Array(glb.buffer.slice(start, start + acc.count * size * 4)));
  };
  const nodes: THREE.Object3D[] = gltf.nodes.map((n: { name?: string; rotation?: number[]; translation?: number[]; scale?: number[] }) => {
    const o = new THREE.Object3D(); o.name = THREE.PropertyBinding.sanitizeNodeName(n.name ?? '');
    if (n.rotation) o.quaternion.fromArray(n.rotation);
    if (n.translation) o.position.fromArray(n.translation);
    if (n.scale) o.scale.fromArray(n.scale);
    return o;
  });
  gltf.nodes.forEach((n: { children?: number[] }, i: number) => n.children?.forEach(c => nodes[i].add(nodes[c])));
  const clips = gltf.animations.map((anim: { name: string; samplers: { input: number; output: number }[]; channels: { sampler: number; target: { node: number; path: string } }[] }) => {
    // every channel, scale included, as GLTFLoader gives them to the game
    const tracks = anim.channels.map(ch => {
      const s = anim.samplers[ch.sampler], name = nodes[ch.target.node].name;
      return ch.target.path === 'rotation'
        ? new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, read(s.input), read(s.output))
        : new THREE.VectorKeyframeTrack(`${name}.${ch.target.path === 'scale' ? 'scale' : 'position'}`, read(s.input), read(s.output));
    });
    return new THREE.AnimationClip(anim.name, -1, tracks);
  });
  const root = new THREE.Group(); nodes.forEach(o => { if (!o.parent) root.add(o); });
  return { root, clips: clips as THREE.AnimationClip[], clip: (clips as THREE.AnimationClip[]).find(c => c.name === 'Sit')! };
}

/** Poses `root` with the first frame of `clip` and returns world-space helpers. */
export function posed(root: THREE.Object3D, clip: THREE.AnimationClip) {
  const mixer = new THREE.AnimationMixer(root);
  mixer.clipAction(clip).play(); mixer.update(0);
  root.updateMatrixWorld(true);
  const dir = (name: string) => new THREE.Vector3(0, 1, 0).transformDirection(root.getObjectByName(name)!.matrixWorld);
  const pos = (name: string) => root.getObjectByName(name)!.getWorldPosition(new THREE.Vector3());
  return { dir, pos, mixer };
}
