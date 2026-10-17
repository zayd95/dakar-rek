import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { Humanoid, preloadHumanoid } from '../src/actors/humanoid';

vi.mock('three/examples/jsm/loaders/GLTFLoader.js', () => ({
  GLTFLoader: class {
    async parseAsync() {
      const scene = new THREE.Group();
      const root = new THREE.Object3D(); root.name = 'root'; scene.add(root);
      const clip = (name: string, duration: number) => new THREE.AnimationClip(name, duration, [
        new THREE.VectorKeyframeTrack('root.position', [0, duration], [0, -0.14, 0, 0, -0.85, -0.9]),
      ]);
      return { scene, animations: [clip('Fall_Back', 0.6), clip('Stance', 1.333), clip('Grab', 0.667), clip('Celebrate', 0.533)] };
    }
  },
}));

describe('Humanoid one-shot fall with real Three AnimationMixer', () => {
  let person: Humanoid;
  const root = () => person.group.getObjectByName('root')!;
  beforeEach(async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) })));
    await preloadHumanoid('/'); person = new Humanoid();
  });
  afterEach(() => { person.dispose(); vi.unstubAllGlobals(); });

  it('clamps the actual final transform across all fall/result duration', () => {
    person.hold = 'Fall_Back'; person.animate(0.3, 0);
    expect(root().position.y).toBeCloseTo(-0.495, 5);
    person.animate(0.31, 0);
    expect(root().position.toArray()).toEqual([0, expect.closeTo(-0.85, 5), expect.closeTo(-0.9, 5)]);
    const final = root().position.clone();
    for (let i = 0; i < 50; i++) { person.animate(0.1, 0); expect(root().position.distanceTo(final)).toBeLessThan(1e-7); }
  });

  it('restarts a completed fall after changing back to Stance', () => {
    person.play('Fall_Back', 0); person.update(1);
    person.play('Stance', 0); person.update(0.1);
    person.play('Fall_Back', 0); person.update(0.3);
    expect(root().position.y).toBeCloseTo(-0.495, 5);
    person.update(0.31); expect(root().position.y).toBeCloseTo(-0.85, 5);
    person.update(2); expect(root().position.y).toBeCloseTo(-0.85, 5);
  });

  for (const [name, duration] of [['Stance', 1.333], ['Grab', 0.667], ['Celebrate', 0.533]] as const) {
    it(`${name} retains repeat behavior beyond its duration`, () => {
      person.play(name, 0); person.update(duration + duration / 2);
      expect(root().position.y).toBeCloseTo(-0.495, 5);
      person.update(duration); expect(root().position.y).toBeCloseTo(-0.495, 5);
    });
  }
});
