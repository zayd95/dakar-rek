import * as THREE from 'three';
import { daylight } from '../core/clock';
import { clamp } from '../core/rng';
import type { GameModule } from './modules';
import { furnitureRows, furnishedRooms, poseScene } from './assetShowroom';
import type { Humanoid } from '../actors/humanoid';
import { rng } from '../core/rng';
import { placeParked, PARKED_COUNT } from './parkedVehicles';
import type { FurnitureId } from '../world/furnitureKit';
import { animateVehicle, buildVehicle, scaleVehicleLods, setVehicleNight, VEHICLE_KINDS, type VehicleKind, type VehicleOpts } from '../actors/vehicleKit';

/**
 * 3D asset kit module: drives the kit's night lamps from the city clock, and gives the checks a showroom (?debug):
 * `kitVehicle(kind, seed)`, `kitShowroom({ vehicles | furniture })`, `kitClear()`.
 */
let showroom: THREE.Group | null = null;
let nightOverride: number | null = null;
let posers: Humanoid[] = [];
function clearShowroom() { if (showroom) { showroom.removeFromParent(); showroom = null; } for (const h of posers) h.dispose(); posers = []; }

/** LOD distance factor per quality level: the far models take over closer on Low. */
export const KIT_LOD_SCALE = { low: 0.6, medium: 0.85, high: 1 } as const;

export const assetKitModule: GameModule = {
  name: 'assetKit',
  hubLoaded(ctx, hub) {
    // parked vehicles along the kerbs: none on Low, more on High (density follows the graphics quality)
    ctx.extra.add(placeParked(hub, PARKED_COUNT[ctx.quality()]));
    // traffic and parked vehicles were just built: their far models take over closer on lower quality
    const k = KIT_LOD_SCALE[ctx.quality()];
    scaleVehicleLods(hub.group, k); scaleVehicleLods(ctx.extra, k);
  },
  update(ctx, dt) {
    for (const h of posers) h.animate(dt, 0);
    const night = 1 - clamp(daylight(ctx.hour()) * 3.2, 0, 1);
    setVehicleNight(nightOverride ?? night);
  },
  debug(ctx) {
    const lodOf = () => KIT_LOD_SCALE[ctx.quality()];
    return {
      kitKinds: () => [...VEHICLE_KINDS],
      kitVehicle(kind: VehicleKind, seed = 1, opts: VehicleOpts = {}) {
        const v = buildVehicle(kind, { seed, ...opts });
        scaleVehicleLods(v.group, lodOf());
        return v.group;
      },
      kitSpec: (kind: VehicleKind, seed = 1) => buildVehicle(kind, { seed, lod: 'far' }).spec,
      /** Line items up on a plain floor far from the hub; returns where each one stands. */
      kitShowroom(o: { vehicles?: { kind: VehicleKind; seed?: number; opts?: VehicleOpts }[]; x?: number; z?: number; gap?: number; yaw?: number; floor?: number }) {
        clearShowroom();
        const g = new THREE.Group(); g.name = 'kit_showroom';
        const x0 = o.x ?? 4000, z0 = o.z ?? 0, gap = o.gap ?? 4;
        const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ color: o.floor ?? 0x8f8a80 }));
        ground.rotation.x = -Math.PI / 2; ground.position.set(x0, 0.0, z0); ground.receiveShadow = true; g.add(ground);
        const spots: { x: number; z: number; kind: string; length: number; width: number; height: number }[] = [];
        let cx = x0;
        for (const item of o.vehicles ?? []) {
          const v = buildVehicle(item.kind, { seed: item.seed ?? 1, ...item.opts });
          const w = Math.max(v.spec.width, 1);
          cx += w / 2;
          v.group.position.set(cx, 0.02, z0); v.group.rotation.y = o.yaw ?? 0;
          g.add(v.group);
          spots.push({ x: cx, z: z0, kind: item.kind, length: v.spec.length, width: v.spec.width, height: v.spec.height });
          cx += w / 2 + gap;
        }
        ctx.scene.add(g); showroom = g;
        return spots;
      },
      /** Furniture rows (each row against a wall), with a warm room light at night. */
      kitFurniture(rows: FurnitureId[][], o: { x?: number; z?: number; night?: boolean } = {}) {
        clearShowroom();
        const r = furnitureRows(rows, o.x ?? 4000, o.z ?? 0, !!o.night);
        ctx.scene.add(r.group); showroom = r.group;
        return r.rows;
      },
      /** One furnished room per tier (basic, better, premium). */
      kitRooms(o: { x?: number; z?: number; night?: boolean } = {}) {
        clearShowroom();
        const r = furnishedRooms(o.x ?? 4000, o.z ?? 0, !!o.night);
        ctx.scene.add(r.group); showroom = r.group;
        return r.rooms;
      },
      /** People on furniture seats: `before` = old logic (chair Sit 0.48 m under every surface), else the seat's pose. */
      kitPoses(kind: 'bed' | 'mat' | 'attaya', o: { x?: number; z?: number; before?: boolean } = {}) {
        clearShowroom();
        const r = poseScene(kind, o.x ?? 4000, o.z ?? 0, !!o.before, rng(7));
        ctx.scene.add(r.group); showroom = r.group; posers = r.people;
        return r.people.map(h => h.group.position.toArray());
      },
      /** Drives every showroom vehicle for `seconds` (wheels spin, front wheels / fork steer, motos lean). */
      kitDrive(speed: number, steer: number, seconds = 1) {
        const vs: THREE.Object3D[] = []; showroom?.traverse(o => { if (o.userData.vehicleSpec) vs.push(o); });
        for (let t = 0; t < seconds; t += 1 / 30) for (const v of vs) animateVehicle(v, speed, steer, 1 / 30);
        return vs.length;
      },
      kitClear: clearShowroom,
      /** Force the lamps on (1) or off (0); null follows the clock. */
      kitNight(f: number | null) { nightOverride = f; },
    };
  },
};
