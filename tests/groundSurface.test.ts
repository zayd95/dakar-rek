import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { groundSurfaceAt } from '../src/world/groundSurface';

const bounds = { x0: -16, x1: 16, z0: -16, z1: 16 };
function slab(root: THREE.Group, x: number, z: number, top: number, width = 4) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, .05, width));
  mesh.position.set(x, top - .025, z); root.add(mesh); return mesh;
}

describe('cached rendered street surface', () => {
  it('uses the top visible overlapping slab, including its cell boundaries', () => {
    const root = new THREE.Group(); slab(root, 0, 0, .08, 24); slab(root, 0, 0, .11, 16); slab(root, 0, 0, .14);
    const height = groundSurfaceAt(root, bounds);
    expect(height(10, 0)).toBeCloseTo(.08); expect(height(6, 0)).toBeCloseTo(.11);
    expect(height(0, 0)).toBeCloseTo(.14); expect(height(2, 0)).toBeCloseTo(.14);
    expect(height(8, 0)).toBeCloseTo(.11); expect(height(13, 0)).toBe(-.02);
    expect(height(40, 0)).toBe(-.02);
  });
  it('interpolates a transformed shallow ground triangle rather than its bounding box', () => {
    const root = new THREE.Group(), group = new THREE.Group(); group.position.set(8, 0, 8); root.add(group);
    const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([-1,.1,-1, -1,.1,1, 1,.2,-1],3));
    group.add(new THREE.Mesh(geometry));
    const height = groundSurfaceAt(root, bounds);
    expect(height(7.5, 7.5)).toBeCloseTo(.125);
    expect(height(8.8, 8.8)).toBe(-.02);
  });
  it('ignores hidden rooms and high props, and caches until a hub is rebuilt', () => {
    const root = new THREE.Group(), ground = slab(root, 0, 0, .11, 8);
    slab(root, 0, 0, 1); const room = new THREE.Group(); room.visible = false; root.add(room); slab(room, 0, 0, .3);
    const height = groundSurfaceAt(root, bounds);
    expect(height(0, 0)).toBeCloseTo(.11);
    ground.position.y = .2;
    expect(height(0, 0)).toBeCloseTo(.11);
    expect(groundSurfaceAt(root, bounds)(0, 0)).toBeCloseTo(.225);
  });
});
