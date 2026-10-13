import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { fitEyes } from '../src/actors/eyes';
import { reshapeCharacter } from '../src/actors/proportions';

async function load() {
  const b = readFileSync(new URL('../public/assets/character_v4.glb', import.meta.url));
  return (await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, '')).scene;
}
const eyes = (scene: THREE.Object3D) => scene.getObjectByName('DR_Head')!.children.filter(o => (o as THREE.Mesh).isMesh) as THREE.Mesh[];
const pick = (scene: THREE.Object3D, material: string) => eyes(scene).find(m => !Array.isArray(m.material) && m.material.name === material)!;
const bounds = (m: THREE.Mesh) => { m.geometry.computeBoundingBox(); return m.geometry.boundingBox!.clone(); };

describe('V4 eye fit', () => {
  it('seats the detached iris in the whites, including after the existing head reshape', async () => {
    const scene = await load(), white = pick(scene, 'EyeWhite'), iris = pick(scene, 'Iris');
    expect(bounds(iris).min.z).toBeGreaterThan(bounds(white).max.z); // the actual exported defect
    expect(fitEyes(scene)).toBe(288);
    expect(fitEyes(scene)).toBe(0);
    for (const reshape of [false, true]) {
      if (reshape) reshapeCharacter(scene);
      const w = bounds(white), i = bounds(iris);
      expect(i.min.z).toBeLessThan(w.max.z);
      expect(i.max.z - w.max.z).toBeLessThan(.001); // a lens on the surface, no floating gap
      expect(i.max.z).toBeGreaterThan(w.max.z);
      expect(w.max.y - w.min.y).toBeLessThan(.02);
    }
  });
  it('preserves head, clothing, weights, topology and unit normals', async () => {
    const scene = await load();
    const snapshot = eyes(scene).map(m => ({ m, position: m.geometry.attributes.position.array.slice(), index: m.geometry.index?.array.slice(), weights: m.geometry.attributes.skinWeight?.array.slice() }));
    fitEyes(scene);
    for (const { m, position, index, weights } of snapshot) {
      expect(m.geometry.index?.array).toEqual(index);
      expect(m.geometry.attributes.skinWeight?.array).toEqual(weights);
      if (!['EyeWhite', 'Iris'].includes((m.material as THREE.Material).name)) expect(m.geometry.attributes.position.array).toEqual(position);
      const n = m.geometry.getAttribute('normal');
      for (let i = 0; i < n.count; i++) expect(Math.hypot(n.getX(i), n.getY(i), n.getZ(i))).toBeCloseTo(1, 5);
    }
  });
  it('leaves a different or missing face kit alone', () => {
    expect(fitEyes(new THREE.Group())).toBe(0);
    const root = new THREE.Group(), head = new THREE.Group(); head.name = 'DR_Head'; root.add(head);
    expect(fitEyes(root)).toBe(0);
  });
});
