import * as THREE from 'three';

/**
 * LD2.0-D (docs/ld2/LD2_D.md): the light helicopter parked on the villa's roof, seen from the street and on the roof terrace. Lane V-E draws it
 * (our own procedural model: at most 2 draw calls and 3 000 triangles; a rotor about 7.2 m across). Until then: a stand-in of its size.
 * Local frame: origin on the ground under its skids, nose toward +z.
 */
export interface HelicopterBuild { group: THREE.Group; footprint: { w: number; d: number; h: number } }
export function buildHelicopter(): HelicopterBuild {
  const g = new THREE.Group(); g.name = 'helicopter';
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.6, 4.2), new THREE.MeshLambertMaterial({ color: 0xe8e4dc }));
  body.position.y = 1.0; g.add(body);
  return { group: g, footprint: { w: 7.2, d: 8.6, h: 2.9 } };
}
