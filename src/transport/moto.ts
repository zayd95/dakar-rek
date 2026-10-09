import { buildVehicle, vehicleSpec, type VehicleSeat } from '../actors/vehicleKit';
import type { SeatSpec, VehicleSpec } from './spec';

/**
 * The « Jakarta » motorbike (the everyday 125 cm³ of Dakar's streets) from the shared vehicle kit, as a transport
 * VehicleSpec with a driver seat and drive handling. Built without a baked rider: the player rides it, with the side
 * stand down when parked and up while ridden (`build({ ridden })`).
 */
export const MOTO_CATALOGUE = {
  id: 'moto_jakarta' as const,
  name: 'Moto Jakarta 125',
  /** Game price (provisional, to review with the economy design table). */
  price: 75000,
  detail: 'Neuve · 125 cm³ · se gare où tu la laisses',
};

/** First kit seed giving a red, non-scooter motorbike (the classic Jakarta look); the same on every client. */
let seedCache = 0;
export function jakartaSeed(): number {
  if (seedCache) return seedCache;
  for (let s = 1; s < 400; s++) {
    const sp = vehicleSpec('moto', { seed: s, driver: false, passengers: false });
    if (sp.variant < 10 && sp.colors.body === 0xc0392b) return (seedCache = s);
  }
  return (seedCache = 1);
}

let cached: VehicleSpec | null = null;
export function motoSpec(): VehicleSpec {
  if (cached) return cached;
  const seed = jakartaSeed(), k = vehicleSpec('moto', { seed, driver: false, passengers: false });
  const toSeat = (s: VehicleSeat): SeatSpec => ({ id: s.id, x: s.x, y: s.top, z: s.z, yaw: s.yaw, npcOnly: s.kind !== 'driver' });
  const driver = k.seats.find(s => s.kind === 'driver') ?? k.seats[0];
  const door = k.doors[0], chase = k.cameras.chase;
  const spec: VehicleSpec = {
    id: 'moto', name: 'Moto Jakarta', kind: 'moto',
    length: k.length, width: k.width,
    seats: k.seats.filter(s => s.kind !== 'driver').map(toSeat),
    driver: toSeat(driver),
    doors: [{ id: door.id, x: door.board[0], z: door.board[2], outX: door.board[0] + 0.2, outZ: door.board[2] }],
    cameras: [
      { id: 'chase', label: 'Derrière la moto', pos: [chase.pos[0], chase.pos[1], chase.pos[2]], look: [chase.look[0], chase.look[1], chase.look[2]],
        portrait: { pos: [chase.pos[0], chase.pos[1] + 1.6, chase.pos[2] - 2.6], look: [chase.look[0], chase.look[1], chase.look[2] + 2.5] } },
      { id: 'haut', label: 'Vue d’en haut', pos: [0, 9, -10], look: [0, 0, 6], portrait: { pos: [0, 13, -12], look: [0, 0, 7] } },
    ],
    cabin: 'open',
    sway: 1,
    // town riding: about 45 km/h flat out, quick to stop, tight turns, leans into corners
    drive: { maxSpeed: 12.5, reverseSpeed: 1.6, accel: 3.4, brake: 7.5, turnRadius: 3.2, steer: 4, halfWidth: 0.42, halfLength: k.length / 2, lean: true },
    build: o => buildVehicle('moto', { seed: o?.seed ?? seed, driver: false, passengers: false, stand: !o?.ridden }).group,
  };
  return (cached = spec);
}
