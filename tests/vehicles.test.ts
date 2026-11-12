import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

const { loadAsync } = vi.hoisted(() => ({ loadAsync: vi.fn() }));
vi.mock('three/examples/jsm/loaders/GLTFLoader.js', () => ({
  GLTFLoader: class { loadAsync = loadAsync; },
}));

beforeEach(() => { vi.resetModules(); loadAsync.mockReset(); });

describe('Blender vehicle integration', () => {
  it('preserves textured PBR materials and shared resources across vehicle instances', async () => {
    const map = new THREE.Texture();
    const normalMap = new THREE.Texture();
    const paint = new THREE.MeshStandardMaterial({ map, normalMap, roughness: 0.35, metalness: 0.6 });
    const glass = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.4 });
    const geometry = new THREE.BoxGeometry();
    const scene = new THREE.Group();
    scene.add(new THREE.Mesh(geometry, [paint, glass]));
    scene.add(new THREE.Mesh(geometry, paint));
    loadAsync.mockResolvedValue({ scene });

    const { preloadAssets, makeCarRapide, assetStatus } = await import('../src/actors/vehicles');
    await preloadAssets('/dakar/');
    expect(loadAsync).toHaveBeenCalledWith('/dakar/assets/car_rapide.glb');
    expect(assetStatus.carRapide).toBe('Blender GLB');

    const first = makeCarRapide();
    const second = makeCarRapide();
    const meshes: THREE.Mesh[] = [];
    first.traverse(o => { if (o instanceof THREE.Mesh) meshes.push(o); });
    expect(meshes[0].material).toEqual([paint, glass]);
    expect(meshes[1].material).toBe(paint);
    expect(paint.map).toBe(map);
    expect(paint.normalMap).toBe(normalMap);
    expect(glass.opacity).toBe(0.4);

    // The world cleanup uses this marker to retain the template's shared GPU resources.
    expect(meshes.every(m => m.userData.shared)).toBe(true);
    const nextMesh = second.children[0].children[0] as THREE.Mesh;
    expect(nextMesh).not.toBe(meshes[0]);
    expect(nextMesh.geometry).toBe(geometry);
    expect(nextMesh.material).toEqual([paint, glass]);
    expect(nextMesh.userData.shared).toBe(true);
    expect(nextMesh.castShadow).toBe(true);
    first.position.x = 20;
    expect(second.position.x).toBe(0);
  });

  it('keeps the procedural fallback when the optional GLB cannot load', async () => {
    loadAsync.mockRejectedValue(new Error('404'));
    const { preloadAssets, assetStatus } = await import('../src/actors/vehicles');
    await expect(preloadAssets('./')).resolves.toBeUndefined();
    expect(assetStatus.carRapide).toBe('TEMP procedural');
  });
});
