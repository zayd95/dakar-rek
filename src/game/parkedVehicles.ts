import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildVehicle, vehicleMaterials, type VehicleKind } from '../actors/vehicleKit';
import { rng } from '../core/rng';
import type { HubWorld } from '../world/types';
import { HUB_STREETS, edgeWeight } from '../crowd/streetPlan';

/**
 * Parked vehicles along the kerbs (vehicle kit, empty, no driver): street density that follows the graphics quality.
 * Placed from the hub seed so a neighbourhood keeps its parked cars between visits; most along the busy streets (a run
 * of cars down the kerb), some half on the pavement (« stationnement sauvage », as in the Plateau and at Sandaga); kept
 * clear of intersections, buildings, places people use, the arena gate and the car rapide station. Each one gets a
 * collider. They are drawn merged (`ParkedBake`: one body and one glass draw call per quarter of the hub in view).
 */
export const PARKED_COUNT = { low: 22, medium: 34, high: 48 } as const;
const PARKED_MIX: Record<HubWorld['id'], [VehicleKind, number][]> = {
  plateau: [['sedan', 30], ['taxi', 25], ['suv', 15], ['luxury', 8], ['moto', 12], ['pickup', 10]],
  corniche: [['sedan', 30], ['taxi', 20], ['suv', 18], ['luxury', 12], ['moto', 12], ['pickup', 8]],
  almadies: [['suv', 32], ['luxury', 28], ['sedan', 22], ['taxi', 8], ['moto', 6], ['pickup', 4]],
  pikine: [['moto', 26], ['sedan', 20], ['taxi', 18], ['pickup', 18], ['suv', 8], ['carRapide', 10]],
};
/** Distance from the road centre line to the parked vehicle's centre (sidewalks start at 5 m). */
export const PARK_OFFSET = 4.3;
/** Weight of a busy street's places against a side street's when the cars are drawn. */
const BUSY_PARK = 14;
/** Parked cars keep this far from the arena gate (its queue lane, the drop-off and the outflow are the arena lane's). */
const ARENA_CLEAR = 46;
/** Distance from a junction's centre to the first parking place of a street (m, the car's centre). */
export const JUNCTION_CLEAR = 17;
/** « Stationnement sauvage »: this share of the cars stands half on the pavement, at this distance from the centre line. */
const ON_PAVEMENT = { share: 0.3, off: 4.65 };

/** A side street near the spawn: a little busier than the far ones (the first streets a player sees). */
const nearSpawn = (world: HubWorld, e: { ax: number; az: number; bx: number; bz: number }) =>
  Math.hypot((e.ax + e.bx) / 2 - world.spawn.x, (e.az + e.bz) / 2 - world.spawn.z) < 90;

export function placeParked(world: HubWorld, count: number, seedSalt = 0): THREE.Group {
  const g = new THREE.Group(); g.name = 'kit_parked';
  if (count <= 0 || !world.edges.length) return g;
  const R = rng(0x5eed + seedSalt + world.id.length * 977 + Math.round(world.spawn.x * 13 + world.spawn.z * 7));
  const mix = PARKED_MIX[world.id] ?? PARKED_MIX.plateau, total = mix.reduce((a, [, w]) => a + w, 0);
  const pickKind = () => { let x = R() * total; for (const [k, w] of mix) { x -= w; if (x <= 0) return k; } return mix[0][0]; };
  const taken: { x0: number; z0: number; x1: number; z1: number }[] = [...(world.keepClear ?? [])];   // ground kept open (a loading bay, a shop's frontage): no car parks there
  const hits = (r: { x0: number; z0: number; x1: number; z1: number }) =>
    world.colliders.some(c => r.x0 < c.x1 && r.x1 > c.x0 && r.z0 < c.z1 && r.z1 > c.z0) || taken.some(c => r.x0 < c.x1 && r.x1 > c.x0 && r.z0 < c.z1 && r.z1 > c.z0);
  const gate = world.arena ? { x: world.arena.cx, z: world.arena.cz - 30 } : null;
  const busy = (x: number, z: number) =>
    world.interactables.some(i => Math.hypot(i.x - x, i.z - z) < 6) || world.rapides.some(o => Math.hypot(o.position.x - x, o.position.z - z) < 10)
    || Math.hypot(world.spawn.x - x, world.spawn.z - z) < 16 ||   // the first view of a new game (camera behind the player) stays clear
    (gate !== null && Math.hypot(gate.x - x, gate.z - z) < ARENA_CLEAR) ||
    world.seats.some(s => Math.hypot(s.x - x, s.z - z) < 2.5);
  // every place along every kerb, the busy streets' first (weighted draw without replacement)
  const busyStreets = HUB_STREETS[world.id]?.busy ?? [];
  const slots: { e: number; side: 1 | -1; t: number; w: number; main: boolean }[] = [];
  world.edges.forEach((e, ei) => {
    const len = Math.hypot(e.bx - e.ax, e.bz - e.az); if (len < 30) return;
    const main = edgeWeight(e, busyStreets) > 1, w = main ? BUSY_PARK : nearSpawn(world, e) ? 3 : 1;
    // never at a junction's mouth: a parked car's near end stays ≥ 13 m from the junction's centre (6 m past its box), so two cars on opposite kerbs
    // never make a chicane of the way into a street
    for (const side of [1, -1] as const) for (let t = JUNCTION_CLEAR; t <= len - JUNCTION_CLEAR; t += 6.4) slots.push({ e: ei, side, t: t + (R() - 0.5) * 2, w: w * (0.6 + R() * 0.8), main });
  });
  let tries = 0;
  while (g.children.length < count && slots.length && tries++ < count * 40) {
    // the first 70 % go to the busy streets (a run of cars down the kerb), the rest anywhere
    const wOf = (s: { w: number; main: boolean }) => g.children.length < count * 0.7 && !s.main ? s.w * 0.02 : s.w;
    let sum = 0; for (const s of slots) sum += wOf(s);
    let u = R() * sum, k = 0; for (; k < slots.length - 1; k++) { u -= wOf(slots[k]); if (u <= 0) break; }
    const slot = slots.splice(k, 1)[0], e = world.edges[slot.e], side = slot.side;
    const len = Math.hypot(e.bx - e.ax, e.bz - e.az), t = slot.t / len;
    const dx = (e.bx - e.ax) / len, dz = (e.bz - e.az) / len;
    const off = R() < ON_PAVEMENT.share ? ON_PAVEMENT.off : PARK_OFFSET + (R() - 0.5) * 0.2;
    const x = e.ax + (e.bx - e.ax) * t - dz * side * off, z = e.az + (e.bz - e.az) * t + dx * side * off;
    if (x < world.bounds.x0 + 4 || x > world.bounds.x1 - 4 || z < world.bounds.z0 + 4 || z > world.bounds.z1 - 4 || busy(x, z)) continue;
    const kind = pickKind(), seed = Math.floor(R() * 1e6);
    if (kind === 'moto') {
      // two or three motorbikes side by side, nose to the kerb
      const n = 2 + Math.floor(R() * 2), span = n * 0.85;
      const r = { x0: x - (Math.abs(dx) * span / 2 + Math.abs(dz) * 1.05), x1: x + (Math.abs(dx) * span / 2 + Math.abs(dz) * 1.05), z0: z - (Math.abs(dz) * span / 2 + Math.abs(dx) * 1.05), z1: z + (Math.abs(dz) * span / 2 + Math.abs(dx) * 1.05) };
      if (hits(r)) continue;
      for (let k2 = 0; k2 < n; k2++) {
        const o = (k2 - (n - 1) / 2) * 0.85, v = buildVehicle('moto', { seed: seed + k2, driver: false, lod: 'near' });
        v.group.position.set(x + dx * o - dz * side * 0.2, 0.06, z + dz * o + dx * side * 0.2);
        v.group.rotation.y = Math.atan2(-dz * side, dx * side) + (R() - 0.5) * 0.25;        // facing the sidewalk
        g.add(v.group);
      }
      taken.push(r); world.colliders.push({ ...r, h: 1.1 });
      continue;
    }
    const v = buildVehicle(kind, { seed, driver: false, passengers: false, lod: 'near' });
    const hl = v.spec.length / 2 + 0.35, hw = v.spec.width / 2 + 0.02;
    const r = { x0: x - (Math.abs(dx) * hl + Math.abs(dz) * hw), x1: x + (Math.abs(dx) * hl + Math.abs(dz) * hw), z0: z - (Math.abs(dz) * hl + Math.abs(dx) * hw), z1: z + (Math.abs(dz) * hl + Math.abs(dx) * hw) };
    if (hits(r)) continue;
    v.group.position.set(x, 0.06, z);
    v.group.rotation.y = Math.atan2(dx * side, dz * side);                                  // parked with the traffic of its side
    g.add(v.group); taken.push(r); world.colliders.push({ ...r, h: Math.min(2.4, v.spec.height) });
  }
  return g;
}

/**
 * Draws the parked vehicles of a `kit_parked` group as a few merged meshes (body, glass), one pair per quarter of the
 * hub so the quarters out of the view are culled: the vehicle groups stay (colliders, `clearKerb` removing the ones at
 * a stop) but are hidden; when their number changes the meshes are built again.
 */
export class ParkedBake {
  readonly group = new THREE.Group();
  private built = -1;
  private geos: THREE.BufferGeometry[] = [];
  constructor(private parked: THREE.Group, private mid = { x: 0, z: 0 }, private shadows = false) { this.group.name = 'kit_parked_baked'; }

  /** Call every frame (cheap: compares a count); rebuilds when vehicles were added or removed. */
  update() {
    if (this.parked.children.length === this.built) return;
    this.built = this.parked.children.length;
    this.rebuild();
  }
  private rebuild() {
    for (const m of [...this.group.children]) this.group.remove(m);
    for (const g of this.geos) g.dispose();
    this.geos = [];
    const M = vehicleMaterials();
    const q: Record<string, { body: THREE.BufferGeometry[]; glass: THREE.BufferGeometry[] }> = {};
    this.parked.updateMatrixWorld(true);
    for (const v of this.parked.children) {
      v.visible = false;                                                      // (the merged meshes draw it)
      const lod = v.children.find(c => (c as THREE.LOD).isLOD) as THREE.LOD | undefined;
      const near = lod ? lod.levels[0].object : v.children.find(c => c.name === 'near');
      if (!near) { v.visible = true; continue; }                               // (no near model: draw it as it is)
      const key = (v.position.x < this.mid.x ? 'w' : 'e') + (v.position.z < this.mid.z ? 'n' : 's');
      const slot = q[key] ?? (q[key] = { body: [], glass: [] });
      v.updateMatrix();
      for (const m of near.children) {
        const mesh = m as THREE.Mesh;
        if (!mesh.isMesh || (m.name !== 'body' && m.name !== 'glass')) continue;
        let geo = mesh.geometry.clone();
        if (geo.index) geo = geo.toNonIndexed();
        geo.applyMatrix4(v.matrix);
        (m.name === 'body' ? slot.body : slot.glass).push(geo);
      }
    }
    for (const [key, s] of Object.entries(q)) {
      for (const [list, mat, name, cast] of [[s.body, M.body, 'body', true], [s.glass, M.glass, 'glass', false]] as const) {
        if (!list.length) continue;
        const geo = mergeGeometries(list, false);
        for (const l of list) l.dispose();
        if (!geo) continue;
        geo.computeBoundingSphere();
        const mesh = new THREE.Mesh(geo, mat); mesh.name = `parked_${key}_${name}`;
        mesh.castShadow = cast && this.shadows; mesh.receiveShadow = false;
        mesh.userData.shared = true;                                            // (the kit's material is shared; the geometry is ours)
        this.group.add(mesh); this.geos.push(geo);
      }
    }
  }
  dispose() { for (const g of this.geos) g.dispose(); this.geos = []; this.group.removeFromParent(); }
}
