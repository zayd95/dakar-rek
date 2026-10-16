import * as THREE from 'three';

type Bounds = { x0: number; x1: number; z0: number; z1: number };
type Face = { x: number; z: number; y: number; ax: number; az: number; ay: number; bx: number; bz: number; by: number; inverse: number };
const CELL = 8, BASE = -.02;

/** Index visible low ground once per hub; point queries allocate nothing and never raycast the scene. */
export function groundSurfaceAt(root: THREE.Object3D, bounds: Bounds): (x: number, z: number) => number {
  const x0 = Math.floor(bounds.x0 / CELL), z0 = Math.floor(bounds.z0 / CELL);
  const x1 = Math.floor(bounds.x1 / CELL), z1 = Math.floor(bounds.z1 / CELL), width = x1 - x0 + 1;
  const cells = new Map<number, Face[]>();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), ab = new THREE.Vector3(), ac = new THREE.Vector3(), normal = new THREE.Vector3();
  root.updateMatrixWorld(true);
  root.traverseVisible(o => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || (mesh as THREE.SkinnedMesh).isSkinnedMesh || (mesh as THREE.InstancedMesh).isInstancedMesh) return;
    const positions = mesh.geometry.getAttribute('position'), index = mesh.geometry.index;
    if (!positions) return;
    for (let i = 0, count = index?.count ?? positions.count; i < count; i += 3) {
      a.fromBufferAttribute(positions, index ? index.getX(i) : i).applyMatrix4(mesh.matrixWorld);
      b.fromBufferAttribute(positions, index ? index.getX(i + 1) : i + 1).applyMatrix4(mesh.matrixWorld);
      c.fromBufferAttribute(positions, index ? index.getX(i + 2) : i + 2).applyMatrix4(mesh.matrixWorld);
      // Base sand uses the fallback; stairs/terraces above this range keep their existing heightAt.
      if (Math.min(a.y, b.y, c.y) < 0 || Math.max(a.y, b.y, c.y) > .35) continue;
      ab.subVectors(b, a); ac.subVectors(c, a); normal.crossVectors(ab, ac);
      if (normal.y <= 1e-9 || normal.y / normal.length() < .7) continue;
      const ix0 = Math.max(x0, Math.floor(Math.min(a.x, b.x, c.x) / CELL)), ix1 = Math.min(x1, Math.floor(Math.max(a.x, b.x, c.x) / CELL));
      const iz0 = Math.max(z0, Math.floor(Math.min(a.z, b.z, c.z) / CELL)), iz1 = Math.min(z1, Math.floor(Math.max(a.z, b.z, c.z) / CELL));
      const face: Face = { x: a.x, z: a.z, y: a.y, ax: ab.x, az: ab.z, ay: ab.y, bx: ac.x, bz: ac.z, by: ac.y, inverse: -1 / normal.y };
      for (let iz = iz0; iz <= iz1; iz++) for (let ix = ix0; ix <= ix1; ix++) {
        const key = (iz - z0) * width + ix - x0, list = cells.get(key);
        if (list) list.push(face); else cells.set(key, [face]);
      }
    }
  });
  return (x, z) => {
    if (x < bounds.x0 || x > bounds.x1 || z < bounds.z0 || z > bounds.z1) return BASE;
    const faces = cells.get((Math.floor(z / CELL) - z0) * width + Math.floor(x / CELL) - x0);
    let height = BASE;
    if (faces) for (const f of faces) {
      const dx = x - f.x, dz = z - f.z;
      const u = (dx * f.bz - dz * f.bx) * f.inverse, v = (f.ax * dz - f.az * dx) * f.inverse;
      if (u >= -1e-7 && v >= -1e-7 && u + v <= 1 + 1e-7) height = Math.max(height, f.y + u * f.ay + v * f.by);
    }
    return height;
  };
}
