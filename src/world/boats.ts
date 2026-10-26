import * as THREE from 'three';
import { Batch } from './batch';
import { pirogue } from './city';
import type { BoatKind, BoatModel, LocalSeat } from '../sea/traverseeSite';

/**
 * The traversée's boats (docs/TRAVERSEE.md, the contract in src/sea/traverseeSite.ts): a painted pirogue with thwarts and an outboard motor, and a
 * chaloupe, the nicer launch. Each is one group (merged geometry) plus its wake, built along its local z, bow at −z.
 *
 * PLACEHOLDER (the contract's stub): the pirogue is src/world/city.ts `pirogue()`, the chaloupe a plain box hull. The world lane replaces both models;
 * the interface, the seats' ids and the frame stay.
 */
export function buildBoat(kind: BoatKind, material: THREE.Material, lite = false): BoatModel {
  const b = new Batch(), group = new THREE.Group();
  const length = kind === 'pirogue' ? 10 : 8, beam = kind === 'pirogue' ? 1.9 : 2.6;
  let helm: LocalSeat, seats: LocalSeat[];
  if (kind === 'pirogue') {
    pirogue(b, 0, 0, length, 0, 0, 0.08);
    helm = { id: 'helm', x: 0.15, y: 0.7, z: 4.0, yaw: Math.PI };
    seats = [-2.5, 0, 2.5].flatMap((z, k) => [-1, 1].map((s, j) => ({ id: `p${k * 2 + j}`, x: s * 0.42, y: 0.68, z, yaw: Math.PI })));
  } else {
    b.box(beam, 0.9, length, 0, 0.05, 0, 0xf4f4ef);
    b.box(beam + 0.05, 0.12, length + 0.05, 0, 0.8, 0, 0x1e5fa8);
    for (const z of [-1.4, 0.6]) b.box(beam - 0.4, 0.08, 0.45, 0, 0.55, z, 0x8b6a47);
    if (!lite) b.box(beam - 0.2, 0.06, 3.4, 0, 2.1, -0.4, 0x1e5fa8);
    helm = { id: 'helm', x: 0, y: 0.65, z: 3.0, yaw: Math.PI };
    seats = [-1.4, 0.6].flatMap((z, k) => [-1, 1].map((s, j) => ({ id: `c${k * 2 + j}`, x: s * 0.6, y: 0.63, z, yaw: Math.PI })));
  }
  const hull = b.build(material, true, true)!; group.add(hull);
  const wakeMat = new THREE.MeshBasicMaterial({ color: 0xf4f6f2, transparent: true, opacity: 0, depthWrite: false });
  const wakeG = new THREE.PlaneGeometry(beam + 0.8, 5); wakeG.rotateX(-Math.PI / 2);
  const wake = new THREE.Mesh(wakeG, wakeMat); wake.position.set(0, 0.07, length / 2 + 2.4); group.add(wake);
  const tris = (hull.geometry.index ? hull.geometry.index.count : hull.geometry.attributes.position.count) / 3 + 2;
  return {
    kind, group, wake, length, beam, helm, seats, step: { x: -beam / 2, z: 0 }, cost: { draws: 2, tris: Math.round(tris) },
    dispose() { hull.geometry.dispose(); wakeG.dispose(); wakeMat.dispose(); group.removeFromParent(); },
  };
}
