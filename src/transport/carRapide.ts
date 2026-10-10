import { buildVehicle, vehicleSpec, type VehicleSpec as KitSpec, type VehicleSeat } from '../actors/vehicleKit';
import type { SeatSpec, VehicleSpec } from './spec';

/**
 * Adapter: the car rapide of the shared vehicle kit (src/actors/vehicleKit.ts) as a transport VehicleSpec. Seats,
 * doors, the apprenti's step and the camera anchors all come from the kit's spec; only the framing of the passenger
 * views is the transport's own. The kit's cabin is open (glassless windows, open rear doorway): passengers holding a
 * seat are drawn by the kit itself (`seated`), which costs no extra draw call.
 */
let kit: KitSpec | null = null;
/** The kit's car rapide spec (seats, doors, step, cameras); the same for every livery. */
export function carRapideKit(): KitSpec { return (kit ??= vehicleSpec('carRapide', { seed: 1, passengers: false })); }

let cached: VehicleSpec | null = null;
export function carRapideSpec(): VehicleSpec {
  if (cached) return cached;
  const k = carRapideKit();
  const toSeat = (s: VehicleSeat): SeatSpec => ({ id: s.id, x: s.x, y: s.top, z: s.z, yaw: s.yaw, npcOnly: s.door !== 'rear' });
  const rear = k.doors.find(d => d.id === 'rear') ?? k.doors[0];
  const driver = k.seats.find(s => s.kind === 'driver') ?? k.seats[0];
  const chase = k.cameras.chase, step = k.step;
  const spec: VehicleSpec = {
    id: 'car_rapide', name: 'Car rapide', kind: 'car_rapide',
    length: k.length, width: k.width,
    seats: k.seats.filter(s => s.kind !== 'driver').map(toSeat),
    driver: toSeat(driver),
    // board at the kit's boarding point behind the open doorway; step out towards the pavement (right side, −x)
    doors: [{ id: rear.id, x: rear.board[0], z: rear.board[2], outX: rear.board[0] - 1.6, outZ: rear.board[2] - 0.2 }],
    cameras: [
      // the kit's chase anchor, pulled back a little: a passenger watches the street more than the car
      { id: 'derriere', label: 'Derrière le car', pos: [chase.pos[0], chase.pos[1] + 0.3, chase.pos[2] - 2.5], look: [chase.look[0], chase.look[1], chase.look[2]],
        portrait: { pos: [chase.pos[0], chase.pos[1] + 2.4, chase.pos[2] - 6.5], look: [chase.look[0], chase.look[1] - 0.4, chase.look[2] + 4] } },
      // from your own seat, looking out of the pavement-side windows (the kit's passenger anchor, made seat-relative)
      { id: 'place', label: 'À ta place', seat: true, inside: true, pos: [0.05, 0.86, 0.2], look: [-6, 0.5, 2.5], portrait: { pos: [0.1, 0.9, -0.1], look: [-6, 0.35, 3.5] } },
      // beside the apprenti on the rear step, looking back along the pavement side
      { id: 'marchepied', label: 'Au marchepied', pos: [(step?.riding.x ?? -0.3) - 0.8, 2.15, (step?.riding.z ?? -3.2) - 0.35], look: [-4, 1.2, (step?.riding.z ?? -3.2) - 6.5],
        portrait: { pos: [(step?.riding.x ?? -0.3) - 0.9, 2.4, (step?.riding.z ?? -3.2) - 1.2], look: [-3.6, 1.0, (step?.riding.z ?? -3.2) - 8] } },
      { id: 'haut', label: 'Vue d’en haut', pos: [0, 12.5, -15], look: [0, 0.5, 9], portrait: { pos: [0, 17, -18], look: [0, 0, 10] } },
    ],
    cabin: 'open',
    crew: step ? { step: step.riding, door: step.standing } : undefined,
    sway: 1,
    // drive mode is not offered for the car rapide (the player rides it); the numbers document the minibus for later
    drive: { maxSpeed: 14, reverseSpeed: 3, accel: 1.6, brake: 4, turnRadius: 7.5, steer: 2.5, halfWidth: k.width / 2, halfLength: k.length / 2 },
    build: o => buildVehicle('carRapide', { seed: o?.seed ?? 1, passengers: true, seated: o?.seated ?? [], driver: o?.driver !== false, colours: o?.colours }).group,
  };
  return (cached = spec);
}
