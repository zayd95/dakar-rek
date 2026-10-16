import * as THREE from 'three';

/**
 * V4 exports round eye whites and separate iris lenses floating in front of them. Fit the lenses into flatter,
 * oval whites at load time, preserving the existing materials, skin weights and mesh count. Call before reshaping
 * the head so both parts then follow the same proportions warp.
 */
export function fitEyes(scene: THREE.Object3D): number {
  const head = scene.getObjectByName('DR_Head');
  if (!head) return 0;
  const eyeMesh = (name: string) => head.children.find(o => {
    const m = o as THREE.Mesh;
    return m.isMesh && !Array.isArray(m.material) && m.material.name === name;
  }) as THREE.Mesh | undefined;
  const white = eyeMesh('EyeWhite'), iris = eyeMesh('Iris');
  if (!white || !iris) return 0;
  white.geometry.computeBoundingBox(); iris.geometry.computeBoundingBox();
  const wb = white.geometry.boundingBox!, ib = iris.geometry.boundingBox!;
  if (ib.min.z <= wb.max.z) return 0; // already fitted, or a corrected export
  const whiteY = (wb.min.y + wb.max.y) / 2, whiteZ = (wb.min.z + wb.max.z) / 2;
  const irisY = (ib.min.y + ib.max.y) / 2, irisZ = (ib.min.z + ib.max.z) / 2;
  const whiteDepth = .65, irisDepth = .55, height = .8;
  const front = whiteZ + (wb.max.z - whiteZ) * whiteDepth;
  const lensZ = front + .0002 - (ib.max.z - irisZ) * irisDepth;
  let moved = 0;
  for (const [m, cy, cz, z, depth] of [[white, whiteY, whiteZ, whiteZ, whiteDepth], [iris, irisY, irisZ, lensZ, irisDepth]] as const) {
    const g = m.geometry, p = g.getAttribute('position'), n = g.getAttribute('normal');
    const normal = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      p.setXYZ(i, p.getX(i), whiteY + (p.getY(i) - cy) * height, z + (p.getZ(i) - cz) * depth);
      // Inverse transpose of the local scale: keep smooth normals and seams from the exported mesh.
      if (n) { normal.set(n.getX(i), n.getY(i) / height, n.getZ(i) / depth).normalize(); n.setXYZ(i, normal.x, normal.y, normal.z); }
    }
    moved += p.count; p.needsUpdate = true; if (n) n.needsUpdate = true;
    g.computeBoundingBox(); g.computeBoundingSphere();
  }
  return moved;
}
