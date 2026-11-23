import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { fixSitKnees, deriveKneel, deriveJog, widenWalk, KNEEL_HIPS } from '../src/actors/humanoid';

/** Reads the skeleton and the Sit clip of the shipped character straight from the GLB bytes (no meshes, no textures). */
function loadRig() {
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
  // Same names as GLTFLoader gives them (PropertyBinding.sanitizeNodeName: "shin.L" → "shinL").
  const nodes: THREE.Object3D[] = gltf.nodes.map((n: { name?: string; rotation?: number[]; translation?: number[] }) => {
    const o = new THREE.Object3D(); o.name = THREE.PropertyBinding.sanitizeNodeName(n.name ?? '');
    if (n.rotation) o.quaternion.fromArray(n.rotation);
    if (n.translation) o.position.fromArray(n.translation);
    return o;
  });
  gltf.nodes.forEach((n: { children?: number[] }, i: number) => n.children?.forEach(c => nodes[i].add(nodes[c])));
  const anim = gltf.animations.find((a: { name: string }) => a.name === 'Sit');
  const tracks = anim.channels.filter((ch: { target: { path: string } }) => ch.target.path !== 'scale').map((ch: { sampler: number; target: { node: number; path: string } }) => {
    const s = anim.samplers[ch.sampler], name = nodes[ch.target.node].name;
    return ch.target.path === 'rotation'
      ? new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, read(s.input), read(s.output))
      : new THREE.VectorKeyframeTrack(`${name}.position`, read(s.input), read(s.output));
  });
  const root = new THREE.Group(); nodes.forEach(o => { if (!o.parent) root.add(o); });
  return { root, clip: new THREE.AnimationClip('Sit', -1, tracks) };
}

/** World-space direction of a bone (its local +Y axis, from head to tail) after posing the first frame of the clip. */
function boneDirections(root: THREE.Object3D, clip: THREE.AnimationClip) {
  const mixer = new THREE.AnimationMixer(root);
  mixer.clipAction(clip).play(); mixer.update(0);
  root.updateMatrixWorld(true);
  const dir = (name: string) => new THREE.Vector3(0, 1, 0).transformDirection(root.getObjectByName(name)!.matrixWorld);
  const pos = (name: string) => root.getObjectByName(name)!.getWorldPosition(new THREE.Vector3());
  return { dir, pos };
}

describe('humanoid: seated pose', () => {
  it('flexes the knees so the shins hang to the ground in front of the seat', () => {
    const { root, clip } = loadRig();
    fixSitKnees([clip]);
    const { dir, pos } = boneDirections(root, clip);
    for (const side of ['L', 'R']) {
      expect(dir(`thigh${side}`).z).toBeGreaterThan(0.9);    // thighs level, pointing forward
      expect(dir(`shin${side}`).y).toBeLessThan(-0.9);       // shins hang down from the knee
      expect(pos(`foot${side}`).y).toBeLessThan(0.12);       // ankles near the ground
      expect(pos(`foot${side}`).z).toBeGreaterThan(0.3);     // feet in front of the seat, not under or behind it
    }
  });

  it('is applied once and leaves a corrected clip alone', () => {
    const { clip } = loadRig();
    fixSitKnees([clip]);
    const once = clip.tracks.map(t => Array.from(t.values));
    fixSitKnees([clip]);
    expect(clip.tracks.map(t => Array.from(t.values))).toEqual(once);
  });

  it('does not touch other clips', () => {
    const walk = new THREE.AnimationClip('Walk', 1, [new THREE.QuaternionKeyframeTrack('shinL.quaternion', [0], [-0.69, 0, 0, 0.72])]);
    fixSitKnees([walk]);
    expect(Array.from(walk.tracks[0].values)).toEqual([...new Float32Array([-0.69, 0, 0, 0.72])]);
  });
});

describe('humanoid: kneeling on a floor place (prayer row)', () => {
  it('folds the legs under: knees down in front, shins flat behind, hips about 0.3 m up', () => {
    const { root, clip } = loadRig();
    fixSitKnees([clip]);
    const clips = [clip]; deriveKneel(clips);
    const kneel = clips.find(c => c.name === 'Kneel')!;
    const { dir, pos } = boneDirections(root, kneel);
    for (const side of ['L', 'R']) {
      expect(pos(`shin${side}`).y).toBeLessThan(0.16);       // knee joint just above the floor
      expect(pos(`shin${side}`).z).toBeGreaterThan(0.25);    // knees in front of the hips
      expect(dir(`shin${side}`).z).toBeLessThan(-0.9);       // shins lying back along the floor
      expect(pos(`foot${side}`).y).toBeLessThan(0.16);       // ankles on the floor
      expect(Math.abs(pos(`foot${side}`).z)).toBeLessThan(0.15);   // feet under the hips
    }
    expect(pos('hips').y).toBeCloseTo(KNEEL_HIPS, 1);
    deriveKneel(clips);
    expect(clips.filter(c => c.name === 'Kneel')).toHaveLength(1);   // derived once
  });
});

describe('humanoid: the far body\'s clips keep the near gait\'s swing', () => {
  const swing = (t: THREE.KeyframeTrack) => { const q = [0, 1, 2].map(k => new THREE.Quaternion(t.values[4 * k], t.values[4 * k + 1], t.values[4 * k + 2], t.values[4 * k + 3])); return Math.max(q[0].angleTo(q[1]), q[1].angleTo(q[2]), q[0].angleTo(q[2])); };
  const track = (name: string, amp: number) => new THREE.QuaternionKeyframeTrack(name, [0, 0.5, 1], [0, 0, 0, 1, Math.sin(amp / 2), 0, 0, Math.cos(amp / 2), 0, 0, 0, 1]);
  it('Jog is the Run clip with a narrower swing (Run itself is left alone); Walk\'s thighs swing wider', () => {
    const run = new THREE.AnimationClip('Run', 1, [track('thighL.quaternion', 1), track('forearmL.quaternion', 1), track('spine.quaternion', 1)]);
    const walk = new THREE.AnimationClip('Walk', 1, [track('thighR.quaternion', 0.6), track('shinR.quaternion', 0.6)]);
    const clips = [run, walk]; deriveJog(clips); widenWalk(clips);
    const jog = clips.find(c => c.name === 'Jog')!;
    expect(jog).toBeDefined(); expect(clips.filter(c => c.name === 'Jog').length).toBe(1);
    expect(swing(jog.tracks[0])).toBeLessThan(swing(run.tracks[0]) * 0.8); expect(swing(jog.tracks[1])).toBeLessThan(swing(run.tracks[1]) * 0.8);
    expect(swing(jog.tracks[2])).toBeCloseTo(swing(run.tracks[2]), 6);
    expect(swing(walk.tracks[0])).toBeGreaterThan(0.6 * 1.1); expect(swing(walk.tracks[1])).toBeCloseTo(0.6, 3);
    deriveJog(clips); expect(clips.filter(c => c.name === 'Jog').length).toBe(1);
  });
});
