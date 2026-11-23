import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * The Tiak Tiak courier's box on the back of a motorbike: an open crate (five panels merged into one mesh) with a parcel in
 * it while a run is in hand. Two meshes, two shared materials; `dispose()` frees them.
 */
export interface CourierBox { group: THREE.Group; parcel: THREE.Mesh; dispose(): void }

const W = 0.5, D = 0.46, H = 0.34, T = 0.025;

export function buildCourierBox(): CourierBox {
  const panel = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  const shell = mergeGeometries([
    panel(W, T, D, 0, T / 2, 0),                                        // floor
    panel(T, H, D, -W / 2 + T / 2, H / 2, 0), panel(T, H, D, W / 2 - T / 2, H / 2, 0),         // sides
    panel(W, H, T, 0, H / 2, -D / 2 + T / 2), panel(W, H * 0.8, T, 0, H * 0.4, D / 2 - T / 2),  // back, front (a little lower)
  ], false)!;
  const crate = new THREE.MeshLambertMaterial({ color: 0xf2a900 });
  const cardboard = new THREE.MeshLambertMaterial({ color: 0xc89b62 });
  const group = new THREE.Group(); group.name = 'courierBox';
  group.add(new THREE.Mesh(shell, crate));
  const parcelGeo = new THREE.BoxGeometry(0.3, 0.24, 0.32).translate(0, T + 0.12, 0);
  const parcel = new THREE.Mesh(parcelGeo, cardboard); parcel.name = 'parcel'; parcel.visible = false; group.add(parcel);
  return { group, parcel, dispose() { shell.dispose(); parcelGeo.dispose(); crate.dispose(); cardboard.dispose(); group.removeFromParent(); } };
}
