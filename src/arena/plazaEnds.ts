import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Batch } from '../world/batch';
import { gatePlaza, plazaBollards } from './exteriorRules';

/**
 * The two ends of the arena gate's pedestrian zone (src/arena/exteriorRules.ts gatePlaza): a line of steel bollards across the street and its pavements,
 * and a « ZONE PIÉTONNE » board on a post facing the traffic at each end. A car is stopped exactly at these bollards (the zone's footprint ends there:
 * src/arena/exterior.ts); before them, it stopped in the middle of an empty road. One merged mesh, the two boards; no collider (people walk between).
 */
export function buildPlazaEnds(a: { cx: number; cz: number }): { group: THREE.Group; dispose(): void } {
  const group = new THREE.Group(); group.name = 'arena_plaza_ends';
  const b = new Batch(), r = gatePlaza(a)[0], G = 0.12;
  for (const p of plazaBollards(a)) {
    b.cyl(0.11, 0.12, 0.92, p.x, G, p.z, 0x3a3d42, 8);
    b.cyl(0.115, 0.115, 0.12, p.x, G + 0.62, p.z, 0xf2f0ea, 8);                      // the reflective band
    b.cyl(0.13, 0.13, 0.05, p.x, G + 0.92, p.z, 0x2a2c30, 8);
  }
  const boards: { x: number; z: number; yaw: number }[] = [
    { x: r.x0 - 0.9, z: r.z0 + 0.35, yaw: -Math.PI / 2 },                                 // the west end, read by a driver coming from the west (facing −x)
    { x: r.x1 + 0.9, z: r.z1 - 0.35, yaw: Math.PI / 2 },                                  // the east end, read from the east
  ];
  for (const s of boards) b.cyl(0.05, 0.05, 2.6, s.x, G, s.z, 0x555a60, 6);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = b.build(mat, true, true); if (mesh) group.add(mesh);
  const own: { dispose(): void }[] = [mat];
  if (mesh) own.push(mesh.geometry);
  if (typeof document !== 'undefined') {
    // both boards, both faces: one plane each, merged, one texture (the zone's name over its use): one draw call
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 224;
    const g = cv.getContext('2d')!;
    g.fillStyle = '#1d4f9c'; g.fillRect(0, 0, 512, 128); g.fillStyle = '#ffffff'; g.fillRect(0, 128, 512, 96);
    g.strokeStyle = '#ffffff'; g.lineWidth = 6; g.strokeRect(3, 3, 506, 218);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#ffffff'; g.font = '800 62px system-ui, sans-serif'; g.fillText('ZONE PIÉTONNE', 256, 66, 480);
    g.fillStyle = '#1d4f9c'; g.font = '700 40px system-ui, sans-serif'; g.fillText('ARÈNE · ACCÈS À PIED', 256, 177, 480);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const faces: THREE.BufferGeometry[] = [];
    for (const s of boards) for (const side of [1, -1]) {
      const yaw = s.yaw + (side < 0 ? Math.PI : 0), f = new THREE.PlaneGeometry(1.6, 0.7);
      f.rotateY(yaw); f.translate(s.x + Math.sin(yaw) * 0.03, G + 2.2, s.z + Math.cos(yaw) * 0.03); faces.push(f);
    }
    const geo = mergeGeometries(faces, false)!; for (const f of faces) f.dispose();
    const signMat = new THREE.MeshLambertMaterial({ map: tex });
    group.add(new THREE.Mesh(geo, signMat));
    own.push(tex, signMat, geo);
  }
  return { group, dispose() { for (const o of own) o.dispose(); group.removeFromParent(); } };
}
