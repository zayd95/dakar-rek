import * as THREE from 'three';
import { Batch, signTexture } from './batch';
import { ACTIONS } from './content';
import type { Interior } from './interiors';
import type { Collider } from './types';

let welcomeTexture: THREE.CanvasTexture | undefined;

/** Fictional calm space. No asserted prayer direction, ritual animation or religious score. */
export function buildMosqueInterior(ox: number, oz: number, name: string, hub: string): Interior {
  const group = new THREE.Group(), b = new Batch();
  const W = 12, D = 16, H = 4.2;
  const x0 = ox - W / 2, x1 = ox + W / 2, z0 = oz - D / 2, z1 = oz + D / 2;
  b.box(W, 0.1, D, ox, 0, oz, 0x276450);
  b.box(W + 0.4, H, 0.2, ox, 0.1, z0 - 0.1, 0xf2ecda);
  b.box(W + 0.4, H, 0.2, ox, 0.1, z1 + 0.1, 0xf2ecda);
  for (const x of [x0 - 0.1, x1 + 0.1]) {
    b.box(0.2, H, D, x, 0.1, oz, 0xf2ecda);
    for (const z of [oz - 5, oz, oz + 5]) {
      b.box(0.025, 1.7, 1.2, x + (x < ox ? 0.12 : -0.12), 1.4, z, 0x9dc7be);
    }
  }
  // Simple carpet rows; open floor keeps the walking route clear.
  for (let z = z0 + 2; z < z1 - 2; z += 2) b.box(W - 0.8, 0.01, 0.035, ox, 0.105, z, 0xc5ae73);
  b.box(W - 0.5, 0.02, 0.14, ox, 0.11, z0 + 0.25, 0xc5ae73);
  // Shoe shelves by the entrance.
  b.box(2.4, 0.65, 0.45, x0 + 1.5, 0.1, z1 - 0.5, 0x916c46);
  for (let i = 0; i < 5; i++) b.box(0.24, 0.08, 0.22, x0 + 0.55 + i * 0.42, 0.76, z1 - 0.5, 0x39413e);
  b.box(1.5, 2.6, 0.025, ox + 3, 0.1, z1 - 0.02, 0x3e6a59);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = b.build(mat, true, false); if (mesh) group.add(mesh);
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.4, D + 0.4), new THREE.MeshLambertMaterial({ color: 0xf3edde }));
  ceiling.rotation.x = Math.PI / 2; ceiling.position.set(ox, H + 0.1, oz); group.add(ceiling);
  const tex = welcomeTexture ??= signTexture('BIENVENUE · UN MOMENT AU CALME', '#163f32', '#f3ecd0', 1024, 112);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(7, 0.8), new THREE.MeshLambertMaterial({ map: tex }));
  sign.position.set(ox, 2.7, z0 + 0.03); group.add(sign);
  const colliders: Collider[] = [
    { x0: x0 - 1, x1: x1 + 1, z0: z0 - 1, z1: z0, h: H },
    { x0: x0 - 1, x1: x1 + 1, z0: z1, z1: z1 + 1, h: H },
    { x0: x0 - 1, x1: x0, z0, z1, h: H },
    { x0: x1, x1: x1 + 1, z0, z1, h: H },
    { x0: x0 + 0.3, x1: x0 + 2.7, z0: z1 - 0.725, z1: z1 - 0.275, h: 0.75 },
  ];
  return {
    kind: 'mosque', name, group, colliders,
    interactables: [
      { id: `${hub}:in:mosque:calm`, name: 'Un moment au calme', kind: 'actions', x: ox, z: oz, radius: 3, actions: ACTIONS.mosque },
      { id: `${hub}:in:mosque:exit`, name: 'Sortir', kind: 'actions', x: ox + 3, z: z1 - 1, radius: 1.5, actions: [{ id: 'sortir', label: 'Sortir', seconds: 0, special: 'exit' }] },
    ],
    bounds: { x0: x0 + 0.3, x1: x1 - 0.3, z0: z0 + 0.3, z1: z1 - 0.3 },
    cameraBox: { x0: x0 + 0.15, x1: x1 - 0.15, z0: z0 + 0.15, z1: z1 - 0.15 },
    spawn: { x: ox + 3, z: z1 - 2, yaw: Math.PI + 0.2 },
    light: new THREE.Vector3(ox, H - 0.4, oz), lightColor: 0xffefd2,
  };
}
