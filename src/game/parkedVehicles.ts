import * as THREE from 'three';
import { buildVehicle, type VehicleKind } from '../actors/vehicleKit';
import { rng } from '../core/rng';
import type { HubWorld } from '../world/types';

/**
 * Parked vehicles along the kerbs (vehicle kit, empty, no driver): street density that follows the graphics quality
 * (none on Low). Placed from the hub seed so a neighbourhood keeps its parked cars between visits; kept clear of
 * intersections, buildings, places people use and the car rapide station. Each one gets a collider.
 */
export const PARKED_COUNT = { low: 0, medium: 5, high: 9 } as const;
const PARKED_MIX: Record<HubWorld['id'], [VehicleKind, number][]> = {
  plateau: [['sedan', 30], ['taxi', 25], ['suv', 15], ['luxury', 8], ['moto', 12], ['pickup', 10]],
  corniche: [['sedan', 30], ['taxi', 20], ['suv', 18], ['luxury', 12], ['moto', 12], ['pickup', 8]],
  almadies: [['suv', 32], ['luxury', 28], ['sedan', 22], ['taxi', 8], ['moto', 6], ['pickup', 4]],
  pikine: [['moto', 26], ['sedan', 20], ['taxi', 18], ['pickup', 18], ['suv', 8], ['carRapide', 10]],
};
/** Distance from the road centre line to the parked vehicle's centre (sidewalks start at 5 m). */
export const PARK_OFFSET = 4.3;

export function placeParked(world: HubWorld, count: number, seedSalt = 0): THREE.Group {
  const g = new THREE.Group(); g.name = 'kit_parked';
  if (count <= 0 || !world.edges.length) return g;
  const R = rng(0x5eed + seedSalt + world.id.length * 977 + Math.round(world.spawn.x * 13 + world.spawn.z * 7));
  const mix = PARKED_MIX[world.id] ?? PARKED_MIX.plateau, total = mix.reduce((a, [, w]) => a + w, 0);
  const pickKind = () => { let x = R() * total; for (const [k, w] of mix) { x -= w; if (x <= 0) return k; } return mix[0][0]; };
  const taken: { x0: number; z0: number; x1: number; z1: number }[] = [];
  const hits = (r: { x0: number; z0: number; x1: number; z1: number }) =>
    world.colliders.some(c => r.x0 < c.x1 && r.x1 > c.x0 && r.z0 < c.z1 && r.z1 > c.z0) || taken.some(c => r.x0 < c.x1 && r.x1 > c.x0 && r.z0 < c.z1 && r.z1 > c.z0);
  const busy = (x: number, z: number) =>
    world.interactables.some(i => Math.hypot(i.x - x, i.z - z) < 6) || world.rapides.some(o => Math.hypot(o.position.x - x, o.position.z - z) < 10)
    || Math.hypot(world.spawn.x - x, world.spawn.z - z) < 7 || world.seats.some(s => Math.hypot(s.x - x, s.z - z) < 2.5);
  let tries = 0;
  while (g.children.length < count && tries++ < count * 30) {
    const e = world.edges[Math.floor(R() * world.edges.length)];
    const len = Math.hypot(e.bx - e.ax, e.bz - e.az); if (len < 30) continue;
    const t = 0.22 + R() * 0.56, side = R() < 0.5 ? 1 : -1;
    const dx = (e.bx - e.ax) / len, dz = (e.bz - e.az) / len;
    const x = e.ax + (e.bx - e.ax) * t - dz * side * PARK_OFFSET, z = e.az + (e.bz - e.az) * t + dx * side * PARK_OFFSET;
    if (x < world.bounds.x0 + 4 || x > world.bounds.x1 - 4 || z < world.bounds.z0 + 4 || z > world.bounds.z1 - 4 || busy(x, z)) continue;
    const kind = pickKind(), seed = Math.floor(R() * 1e6);
    if (kind === 'moto') {
      // two or three motorbikes side by side, nose to the kerb
      const n = 2 + Math.floor(R() * 2), span = n * 0.85;
      const r = { x0: x - (Math.abs(dx) * span / 2 + Math.abs(dz) * 1.05), x1: x + (Math.abs(dx) * span / 2 + Math.abs(dz) * 1.05), z0: z - (Math.abs(dz) * span / 2 + Math.abs(dx) * 1.05), z1: z + (Math.abs(dz) * span / 2 + Math.abs(dx) * 1.05) };
      if (hits(r)) continue;
      for (let k = 0; k < n; k++) {
        const o = (k - (n - 1) / 2) * 0.85, v = buildVehicle('moto', { seed: seed + k, driver: false });
        v.group.position.set(x + dx * o - dz * side * 0.2, 0.06, z + dz * o + dx * side * 0.2);
        v.group.rotation.y = Math.atan2(-dz * side, dx * side) + (R() - 0.5) * 0.25;        // facing the sidewalk
        g.add(v.group);
      }
      taken.push(r); world.colliders.push({ ...r, h: 1.1 });
      continue;
    }
    const v = buildVehicle(kind, { seed, driver: false, passengers: false });
    const hl = v.spec.length / 2 + 0.35, hw = v.spec.width / 2 + 0.1;
    const r = { x0: x - (Math.abs(dx) * hl + Math.abs(dz) * hw), x1: x + (Math.abs(dx) * hl + Math.abs(dz) * hw), z0: z - (Math.abs(dz) * hl + Math.abs(dx) * hw), z1: z + (Math.abs(dz) * hl + Math.abs(dx) * hw) };
    if (hits(r)) continue;
    v.group.position.set(x, 0.06, z);
    v.group.rotation.y = Math.atan2(dx * side, dz * side);                                  // parked with the traffic of its side
    g.add(v.group); taken.push(r); world.colliders.push({ ...r, h: Math.min(2.4, v.spec.height) });
  }
  return g;
}
