import * as THREE from 'three';
import { buildFurniture, furnitureSeats, TIERS, type FurnitureId, type Tier } from '../world/furnitureKit';
import { Humanoid, humanoidReady, randomLook } from '../actors/humanoid';
import { seatClip, sitOriginY, SIT_HIPS } from '../interact/seats';
import { buildVehicle, vehicleSeats, vehicleSpec } from '../actors/vehicleKit';

/** Motorbikes (the 125 cc and a scooter) with a rider on the driver seat: `before` = chair Sit, else the seat's Ride. */
export function rideScene(x0: number, z0: number, before: boolean, rand: () => number) {
  const g = new THREE.Group(); g.name = 'kit_showroom';
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), floorMat(0x9a9488)); floor.rotation.x = -Math.PI / 2; floor.position.set(x0, 0, z0); floor.receiveShadow = true; g.add(floor);
  const people: Humanoid[] = [];
  const seedOf = (scooter: boolean) => { let s = 1; while ((vehicleSpec('moto', { seed: s }).controls.pegs![0][2] > 0) !== scooter) s++; return s; };
  [seedOf(false), seedOf(true)].forEach((seed, i) => {
    const v = buildVehicle('moto', { seed, driver: false, passengers: false });
    v.group.position.set(x0 - 0.8 + i * 1.6, 0, z0); v.group.rotation.y = 0.5; g.add(v.group); g.updateMatrixWorld(true);
    const s = vehicleSeats(v.group, v.spec, 'showroom')[0];
    if (!humanoidReady()) return;
    const h = new Humanoid(randomLook(rand));
    h.hold = before ? 'Sit' : seatClip(s);
    h.group.position.set(s.x, sitOriginY(s), s.z); h.group.rotation.y = s.yaw;
    g.add(h.group); people.push(h);
  });
  return { group: g, people };
}

/**
 * Debug showrooms for the asset captures (scripts/shots-assets.mjs): furniture lined up by tier against a wall, and
 * one furnished room per tier. Built far from the hub; never used in play.
 */
const wallMat = () => new THREE.MeshLambertMaterial({ color: 0xece4d4 });
const floorMat = (c = 0xd8d2c6) => new THREE.MeshLambertMaterial({ color: c });

/** Rows of furniture (each row against its own wall); returns where each row stands for the camera. */
export function furnitureRows(rows: FurnitureId[][], x0: number, z0: number, night: boolean) {
  const g = new THREE.Group(); g.name = 'kit_showroom';
  const out: { ids: FurnitureId[]; cx: number; wallZ: number; width: number; height: number }[] = [];
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), floorMat()); floor.rotation.x = -Math.PI / 2; floor.position.set(x0, 0, z0); floor.receiveShadow = true; g.add(floor);
  rows.forEach((ids, r) => {
    const wallZ = z0 - r * 9, gap = 0.7;
    const items = ids.map(id => buildFurniture(id));
    const width = items.reduce((a, f) => a + f.footprint.w, 0) + gap * (items.length - 1);
    let x = x0 - width / 2;
    for (const f of items) { f.group.position.set(x + f.footprint.w / 2, 0, wallZ + f.footprint.d / 2 + 0.02); g.add(f.group); x += f.footprint.w + gap; }
    const wall = new THREE.Mesh(new THREE.BoxGeometry(width + 3, 3, 0.1), wallMat()); wall.position.set(x0, 1.5, wallZ - 0.05); wall.receiveShadow = true; g.add(wall);
    if (night) { const l = new THREE.PointLight(0xffd9a0, 9, 10, 1.6); l.position.set(x0, 2.8, wallZ + 1.6); g.add(l); }
    out.push({ ids, cx: x0, wallZ, width, height: Math.max(...items.map(f => f.footprint.h)) });
  });
  return { group: g, rows: out };
}

/** One furnished room per tier (7 × 6 m, back and left walls): the home loop at a glance. */
export function furnishedRooms(x0: number, z0: number, night: boolean, tiers: readonly Tier[] = TIERS) {
  const g = new THREE.Group(); g.name = 'kit_showroom';
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), floorMat(0xbdb6a8)); floor.rotation.x = -Math.PI / 2; floor.position.set(x0, 0, z0); floor.receiveShadow = true; g.add(floor);
  const rooms: { tier: Tier; cx: number; cz: number }[] = [];
  tiers.forEach((t, i) => {
    const cx = x0 + i * 10, cz = z0;
    const tile = new THREE.Mesh(new THREE.PlaneGeometry(7, 6), floorMat(t === 'basic' ? 0xb8ad98 : t === 'better' ? 0xe6e0d4 : 0xf2efe8)); tile.rotation.x = -Math.PI / 2; tile.position.set(cx, 0.005, cz); tile.receiveShadow = true; g.add(tile);
    const back = new THREE.Mesh(new THREE.BoxGeometry(7, 2.9, 0.12), wallMat()); back.position.set(cx, 1.45, cz - 3.06); back.receiveShadow = true; g.add(back);
    const left = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.9, 6), wallMat()); left.position.set(cx - 3.56, 1.45, cz); left.receiveShadow = true; g.add(left);
    const put = (type: string, x: number, z: number, yaw = 0, against: 'back' | 'left' | null = null) => {
      const f = buildFurniture(`${type}:${t}` as FurnitureId), d = f.footprint.d;
      let px = cx + x, pz = cz + z;
      if (type === 'sofa') px = cx + 3.5 - d / 2;
      if (against === 'back') pz = cz - 3 + d / 2;
      if (against === 'left') px = cx - 3.5 + d / 2;
      f.group.position.set(px, 0.006, pz); f.group.rotation.y = yaw; g.add(f.group);
    };
    put('wardrobe', -2.55, 0, 0, 'back'); put('bed', -0.45, 0, 0, 'back'); put('kitchen', 2.25, 0, 0, 'back');
    put('desk', 0, -0.6, Math.PI / 2, 'left'); put('mirror', 0, 1.0, Math.PI / 2, 'left'); put('shower', 0, 2.4, Math.PI / 2, 'left');
    put('rug', 1.7, 0.9); put('sofa', 0, 0.9, -Math.PI / 2); put('tv', 0.3, 0.9, Math.PI / 2); put('lowTable', 1.7, 0.9, Math.PI / 2);
    put('prayerMat', -1.6, 2.35, Math.PI); put('attaya', -0.5, 2.45, Math.PI); put('fan', 3.1, -1.2); put('lamp', 3.1, 2.6); put('plasticChair', 1.2, 2.6, Math.PI);
    if (night) { const l = new THREE.PointLight(0xffd9a0, 10, 12, 1.5); l.position.set(cx, 2.8, cz); g.add(l); }
    rooms.push({ tier: t, cx, cz });
  });
  return { group: g, rooms };
}

/**
 * Pose scenes for the captures: furniture with people on its seats. `before` reproduces the old logic (every seat
 * held the chair Sit clip 0.48 m below the surface), otherwise each seat takes its own pose and height
 * (Seat.clip / sitOriginY: Lie on beds, SitFloor on mats, rugs and floor cushions).
 */
export function poseScene(kind: 'bed' | 'mat' | 'attaya', x0: number, z0: number, before: boolean, rand: () => number) {
  const g = new THREE.Group(); g.name = 'kit_showroom';
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), floorMat(0xd8d2c6)); floor.rotation.x = -Math.PI / 2; floor.position.set(x0, 0, z0); floor.receiveShadow = true; g.add(floor);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(12, 3, 0.1), wallMat()); wall.position.set(x0, 1.5, z0 - 1.6); g.add(wall);
  const ids: FurnitureId[] = kind === 'bed' ? ['bed:basic', 'bed:better', 'bed:premium'] : kind === 'mat' ? ['rug:basic', 'rug:better', 'rug:premium'] : ['attaya:basic', 'attaya:premium'];
  const people: Humanoid[] = [];
  let x = x0 - (kind === 'attaya' ? 1.1 : 2.4);
  for (const id of ids) {
    const f = buildFurniture(id);
    const zc = kind === 'bed' ? z0 - 1.55 + f.footprint.d / 2 : z0;
    f.group.position.set(x, 0, zc); g.add(f.group); g.updateMatrixWorld(true);
    furnitureSeats(f.group, f.spec, 'showroom', id).forEach((s, i) => {
      if (!humanoidReady()) return;
      const h = new Humanoid(randomLook(rand));
      // before: the chair Sit 0.48 m under the real surface (the furniture seat's own top), after: the seat's pose
      h.hold = before ? 'Sit' : seatClip(s);
      h.group.position.set(s.x, before ? f.spec.seats[i].top - SIT_HIPS : sitOriginY(s), s.z); h.group.rotation.y = s.yaw;
      g.add(h.group); people.push(h);
    });
    x += kind === 'attaya' ? 2.2 : 2.4;
  }
  return { group: g, people };
}
