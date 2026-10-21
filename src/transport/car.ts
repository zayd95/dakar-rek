import { buildVehicle, vehicleSpec, type VehicleKind, type VehicleSeat } from '../actors/vehicleKit';
import { glbVehicle, tintBody } from '../actors/glbVehicle';
import type { DriveSpec, SeatSpec, VehicleSpec } from './spec';

/**
 * The player's first car: the modern compact sedan « Berline moderne » (`compacte`, Stage A of docs/assets/VEHICLE_LINEUP.md), as a transport
 * VehicleSpec with a driver seat (left-hand drive: Senegal drives on the right) and car handling — no lean, a wider
 * turning circle than the motorbike, a little faster. Built empty: the player drives it, nobody else is drawn inside.
 * Its look is the shared kit's saloon until its own body is generated and approved (then src/actors/glbVehicle.ts takes over); the handling numbers
 * are the old car's, PROVISIONAL until the economy balance pass. It replaces the old `clando`, which is retired (src/transport/owned.ts keeps its owners' cars).
 */

/** Its catalogue entry (src/economy/catalog.ts « Berline moderne »: name and price, owned through the asset model). */
export const CAR_ASSET = 'compacte' as const;
export const CAR_DETAIL = 'Moderne et soignée · 4 portes · 5 places · se gare où tu la laisses';

/** Kit body colours used at the dealer: the one sold (silver-grey) and the two on display. */
export const COMPACTE_GREY = 0xa9adb2, SEDAN_WHITE = 0xf2f2f0, SEDAN_BLUE = 0x1f3f78;

const seeds = new Map<string, number>();
/** First kit seed giving a body of that colour in that kit kind (the same on every client). */
export function kitSeedFor(kind: VehicleKind, color: number): number {
  const k = `${kind}:${color}`, hit = seeds.get(k); if (hit) return hit;
  for (let s = 1; s < 400; s++) {
    if (vehicleSpec(kind, { seed: s, driver: false, passengers: false }).colors.body === color) { seeds.set(k, s); return s; }
  }
  seeds.set(k, 1); return 1;
}
/** First kit seed giving a saloon of that body colour. */
export const sedanSeed = (color = COMPACTE_GREY): number => kitSeedFor('sedan', color);

/** How much lower than the kit's seat top the player sits at the wheel (m). */
export const DRIVER_DROP = 0.12;

/**
 * The prepared GLB body of the modern sedan (public/assets/vehicles/compacte.glb) when the test link asks for it and the file loaded;
 * null keeps the procedural saloon. The kit's spec of the same seed travels with it (seats, doors, cameras, lamps).
 */
export function glbCar(seed: number) {
  const g = glbVehicle(CAR_ASSET, vehicleSpec('sedan', { seed, driver: false, passengers: false }));
  const tint = displayTints().get(seed); if (g && tint) tintBody(g, tint);                         // the showroom's other lots: the same car in another paint
  return g;
}

/** The two other lots of the showroom (their kit seeds are what the dealer knows them by): graphite and blue. */
const DISPLAY_TINT = new Map<number, number>();
export const displayTints = () => { if (!DISPLAY_TINT.size) { DISPLAY_TINT.set(sedanSeed(SEDAN_WHITE), 0x7d7f85); DISPLAY_TINT.set(sedanSeed(SEDAN_BLUE), 0x7a92e0); } return DISPLAY_TINT; };

/** What a kit-bodied car of the owned-vehicle system needs besides the kit's own numbers. */
export interface KitCarOpts {
  id: string; name: string; kind: 'sedan' | 'luxury' | 'suv'; seed: number;
  /** Handling (the body's half extents come from the kit). PROVISIONAL until the economy balance pass. */
  drive: Omit<DriveSpec, 'halfWidth' | 'halfLength' | 'lean'>;
  /** A prepared GLB body for a kit seed, or null for the kit's own model. */
  visual?: (seed: number) => ReturnType<typeof glbCar>;
  /** The kit body has a driver's door of its own that opens (src/actors/vehicleKit.ts `openable`). */
  openable?: boolean;
}

/** A kit car as a transport VehicleSpec with a driver seat (left-hand drive), no lean and car handling. Built empty: the player drives it. */
export function kitCarSpec(o: KitCarOpts): VehicleSpec {
  const seed = o.seed, k = vehicleSpec(o.kind, { seed, driver: false, passengers: false });
  const toSeat = (s: VehicleSeat): SeatSpec => ({ id: s.id, x: s.x, y: s.top, z: s.z, yaw: s.yaw, npcOnly: s.kind !== 'driver' });
  const driver = k.seats.find(s => s.kind === 'driver') ?? k.seats[0];
  const door = k.doors.find(d => d.seats.includes(driver.id)) ?? k.doors[0];
  const chase = k.cameras.chase, wheel = k.cameras.driver;
  const v3 = (p: readonly number[]): [number, number, number] => [p[0], p[1], p[2]];
  return {
    id: o.id, name: o.name, kind: 'car',
    length: k.length, width: k.width,
    seats: k.seats.filter(s => s.kind !== 'driver').map(toSeat),
    // the player's humanoid sits taller than the kit's seated busts: 12 cm lower, the head stays under the roof
    driver: { ...toSeat(driver), y: driver.top - DRIVER_DROP },
    doors: [{ id: door.id, x: door.board[0], z: door.board[2], outX: door.board[0] + 0.3, outZ: door.board[2] }],
    cameras: [
      // behind the car, lower and closer than the kit's anchor, looking well down the road: the car sits in the lower third and the street ahead stays readable
      { id: 'chase', label: 'Derrière la voiture', pos: [chase.pos[0], chase.pos[1] - 0.5, chase.pos[2] + 0.5], look: [chase.look[0], chase.look[1] + 0.15, chase.look[2] + 4],
        portrait: { pos: [chase.pos[0], chase.pos[1] - 0.25, chase.pos[2] - 0.6], look: [chase.look[0], chase.look[1] + 0.35, chase.look[2] + 8] } },
      // at the wheel (the kit's driver anchor): the street through the windscreen. On a phone held upright the eye is a little higher and the gaze
      // tilted down, so the dashboard and the roof lining take less of a narrow screen (the camera also opens its field of view, OwnedVehicleModule.camera)
      { id: 'volant', label: 'Au volant', pos: v3(wheel.pos), look: v3(wheel.look), inside: true,
        portrait: { pos: [wheel.pos[0], wheel.pos[1] + 0.06, wheel.pos[2] - 0.1], look: [wheel.look[0], wheel.look[1] - 1.1, wheel.look[2]] } },
      { id: 'haut', label: 'Vue d’en haut', pos: [0, 11, -12], look: [0, 0, 7], portrait: { pos: [0, 16, -14], look: [0, 0, 8] } },
    ],
    cabin: 'closed',
    sway: 0.6,
    drive: { ...o.drive, halfWidth: k.width / 2, halfLength: k.length / 2, lean: false },
    build: b => o.visual?.(b?.seed ?? seed) ?? buildVehicle(o.kind, { seed: b?.seed ?? seed, driver: false, passengers: false, ...(o.openable ? { openable: true } : {}) }).group,
  };
}

let cached: VehicleSpec | null = null;
/** The modern sedan. Town driving: about 60 km/h flat out (the motorbike: 45), slower to pick up and to stop, a wide turning circle. */
export function carSpec(): VehicleSpec {
  return (cached ??= kitCarSpec({
    id: 'car', name: 'Berline moderne', kind: 'sedan', seed: sedanSeed(), visual: glbCar,
    drive: { maxSpeed: 19, boostSpeed: 29, reverseSpeed: 3, accel: 4, brake: 7.5, turnRadius: 5.6, steer: 2.8, grip: 9.5 },
  }));
}
