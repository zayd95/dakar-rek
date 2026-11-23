import * as THREE from 'three';
import { NodeIO } from '@gltf-transform/core';
import { buildVehicle, type VehicleKind } from '../../src/actors/vehicleKit';

/**
 * Measures a car body for its cabin (tests/cabinFit.test.ts): the authored bodies from their GLB (public/assets/vehicles/<id>.glb: the shell and the
 * driver's door, as the game draws them shut), the procedural kit cars from the kit itself (the near model, its opaque meshes). Rays are cast both ways
 * through every face (a shell's inside is its back faces).
 */
export function glbBody(id: string): Promise<THREE.Object3D> {
  return new NodeIO().read(`public/assets/vehicles/${id}.glb`).then(doc => {
    const g = new THREE.Group();
    for (const n of doc.getRoot().listNodes()) {
      if (!['body', 'door'].includes(n.getName())) continue;
      const m = n.getMesh(); if (!m) continue;
      for (const p of m.listPrimitives()) {
        const pos = p.getAttribute('POSITION'), idx = p.getIndices(); if (!pos) continue;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(Array.from(pos.getArray() as Float32Array), 3));
        if (idx) geo.setIndex(Array.from(idx.getArray() as Uint16Array));
        const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
        mesh.position.fromArray(n.getTranslation()); g.add(mesh);
      }
    }
    g.updateMatrixWorld(true);
    return g;
  });
}

export function kitBody(kind: VehicleKind, seed: number): THREE.Object3D {
  const v = buildVehicle(kind, { seed, driver: false, passengers: false, lod: 'near' });
  const g = new THREE.Group();
  v.group.updateMatrixWorld(true);
  v.group.traverse(o => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m.material as THREE.Material).transparent || /far|beam/i.test(m.name)) return;
    const c = new THREE.Mesh(m.geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })); c.applyMatrix4(m.matrixWorld); g.add(c);
  });
  g.updateMatrixWorld(true);
  return g;
}

const rc = new THREE.Raycaster();
/** Nearest hit distance from `o` along `d`, or null. */
export function cast(body: THREE.Object3D, o: [number, number, number], d: [number, number, number]): number | null {
  rc.set(new THREE.Vector3(...o), new THREE.Vector3(...d).normalize()); rc.far = 10;
  const h = rc.intersectObject(body, true)[0];
  return h ? h.distance : null;
}

/**
 * One seat row of a body, the hips at (x, hip, z): the lowest roof over where the head can be (x ± 0.1 m, from 0.25 m behind the hips to 0.05 m ahead:
 * the reclined head is behind them), the highest bottom of the body where the shoes go (0.3 to 0.8 m ahead of the hips: the underside of the floor pan,
 * met from below, or the bottom edge of the side for a body that has no floor pan, the kit's), and the clear room ahead of the hips at knee height.
 */
export function measureRow(body: THREE.Object3D, x: number, z: number, hip: number) {
  let roof = Infinity, floor = -Infinity;
  for (const dx of [-0.1, 0, 0.1]) for (let dz = -0.25; dz <= 0.051; dz += 0.05) {
    const up = cast(body, [x + dx, hip + 0.6, z + dz], [0, 1, 0]);
    if (up !== null) roof = Math.min(roof, hip + 0.6 + up);
  }
  const s = Math.sign(x) || 1;
  for (const dx of [-0.08, 0, 0.08]) for (let dz = 0.3; dz <= 0.81; dz += 0.1) {
    const under = cast(body, [x + dx, -1, z + dz], [0, 1, 0]);
    if (under !== null && under - 1 < hip - 0.15) floor = Math.max(floor, under - 1);
    for (let y = 0.05; y < hip; y += 0.01) { if (cast(body, [s * 3, y, z + dz], [-s, 0, 0]) !== null) { floor = Math.max(floor, y); break; } }
  }
  const ahead = cast(body, [x, hip + 0.08, z + 0.05], [0, 0, 1]);
  return { roof: +roof.toFixed(3), floor: +floor.toFixed(3), ahead: ahead === null ? null : +(ahead + 0.05).toFixed(3) };
}
