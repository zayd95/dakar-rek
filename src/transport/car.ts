import { buildVehicle, vehicleSpec, type VehicleSeat } from '../actors/vehicleKit';
import type { SeatSpec, VehicleSpec } from './spec';

/**
 * The player's first car: a used saloon (« berline d'occasion ») from the shared vehicle kit, as a transport
 * VehicleSpec with a driver seat (left-hand drive: Senegal drives on the right) and car handling — no lean, a wider
 * turning circle than the motorbike, a little faster. Built empty: the player drives it, nobody else is drawn inside.
 */

/** Its catalogue entry (src/economy/catalog.ts « Voiture d'occasion »: name and price, owned through the asset model). */
export const CAR_ASSET = 'clando' as const;
export const CAR_DETAIL = 'Une berline d’occasion · 5 places · se gare où tu la laisses';

/** Kit body colours used at the dealer: the one sold (silver) and the two on display. */
export const SEDAN_SILVER = 0xb9bdc2, SEDAN_WHITE = 0xf2f2f0, SEDAN_BLUE = 0x1f3f78;

const seeds = new Map<number, number>();
/** First kit seed giving a saloon of that body colour (the same on every client). */
export function sedanSeed(color = SEDAN_SILVER): number {
  const hit = seeds.get(color); if (hit) return hit;
  for (let s = 1; s < 400; s++) {
    if (vehicleSpec('sedan', { seed: s, driver: false, passengers: false }).colors.body === color) { seeds.set(color, s); return s; }
  }
  seeds.set(color, 1); return 1;
}

/** How much lower than the kit's seat top the player sits at the wheel (m). */
export const DRIVER_DROP = 0.12;

let cached: VehicleSpec | null = null;
export function carSpec(): VehicleSpec {
  if (cached) return cached;
  const seed = sedanSeed(), k = vehicleSpec('sedan', { seed, driver: false, passengers: false });
  const toSeat = (s: VehicleSeat): SeatSpec => ({ id: s.id, x: s.x, y: s.top, z: s.z, yaw: s.yaw, npcOnly: s.kind !== 'driver' });
  const driver = k.seats.find(s => s.kind === 'driver') ?? k.seats[0];
  const door = k.doors.find(d => d.seats.includes(driver.id)) ?? k.doors[0];
  const chase = k.cameras.chase, wheel = k.cameras.driver;
  const v3 = (p: readonly number[]): [number, number, number] => [p[0], p[1], p[2]];
  const spec: VehicleSpec = {
    id: 'car', name: 'Berline', kind: 'car',
    length: k.length, width: k.width,
    seats: k.seats.filter(s => s.kind !== 'driver').map(toSeat),
    // the player's humanoid sits taller than the kit's seated busts: 12 cm lower, the head stays under the roof
    driver: { ...toSeat(driver), y: driver.top - DRIVER_DROP },
    doors: [{ id: door.id, x: door.board[0], z: door.board[2], outX: door.board[0] + 0.3, outZ: door.board[2] }],
    cameras: [
      // behind the car (the kit's chase anchor); on a phone held upright, higher and further back to see the road ahead
      { id: 'chase', label: 'Derrière la voiture', pos: v3(chase.pos), look: v3(chase.look),
        portrait: { pos: [chase.pos[0], chase.pos[1] + 2.2, chase.pos[2] - 3.4], look: [chase.look[0], chase.look[1] - 0.1, chase.look[2] + 4] } },
      // at the wheel (the kit's driver anchor): the dashboard and the street through the windscreen
      { id: 'volant', label: 'Au volant', pos: v3(wheel.pos), look: v3(wheel.look), inside: true,
        portrait: { pos: [wheel.pos[0], wheel.pos[1] + 0.04, wheel.pos[2] - 0.15], look: [wheel.look[0], wheel.look[1] - 0.25, wheel.look[2]] } },
      { id: 'haut', label: 'Vue d’en haut', pos: [0, 11, -12], look: [0, 0, 7], portrait: { pos: [0, 16, -14], look: [0, 0, 8] } },
    ],
    cabin: 'closed',
    sway: 0.6,
    // town driving: about 60 km/h flat out (the motorbike: 45), slower to pick up and to stop, a wide turning circle
    drive: { maxSpeed: 16.5, reverseSpeed: 3, accel: 2.8, brake: 6.5, turnRadius: 5.6, steer: 2.6, halfWidth: k.width / 2, halfLength: k.length / 2, lean: false },
    build: o => buildVehicle('sedan', { seed: o?.seed ?? seed, driver: false, passengers: false }).group,
  };
  return (cached = spec);
}
