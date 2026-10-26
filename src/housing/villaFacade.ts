import * as THREE from 'three';
import { HOUSE, PARAPET, STOREY } from './villa';

/**
 * LD2.0-D (docs/ld2/LD2_D.md): the villa as seen from the street, drawn from the same plan as its interior (lane V-S): outside walls, windows
 * and doors where the rooms have them, the balconies, the roof's parapet, the stair head and the helipad (the helicopter is added by the street
 * compound, src/world/helicopter.ts). Lane V-E places it on the lot. Local frame: the lot's plan coordinates, y 0 the ground.
 * Until lane V-S draws it: the house's volume.
 */
export function buildVillaFacade(): THREE.Group {
  const g = new THREE.Group(); g.name = 'villa-facade';
  const w = HOUSE.x1 - HOUSE.x0, d = HOUSE.z1 - HOUSE.z0, h = 2 * STOREY + PARAPET;
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: 0xf2ece0 }));
  m.position.set((HOUSE.x0 + HOUSE.x1) / 2, h / 2, (HOUSE.z0 + HOUSE.z1) / 2); g.add(m);
  return g;
}
