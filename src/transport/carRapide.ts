import { makeCarRapide } from '../actors/vehicles';
import type { SeatSpec, VehicleSpec } from './spec';

/**
 * Adapter: the car rapide as a VehicleSpec. The model is the existing one (src/actors/vehicles.ts: Blender GLB when
 * present, otherwise the procedural Saviem-style minibus). The shared vehicle kit swaps in here — `build`, and seats or
 * cameras if its proportions differ — and nothing else in src/transport has to change.
 *
 * The current model has a closed cabin (no visible interior), so passengers are seated logically (their seats are
 * taken) but not drawn, and the camera views stay outside the vehicle.
 */
const ROWS = [1.45, 0.55, -0.35, -1.25, -2.15];
const COLS = [0.62, 0, -0.62];                 // left (+x) → right (−x, pavement side)
const SEAT_TOP = 1.15;

const seats: SeatSpec[] = [
  { id: 'avant', x: -0.58, y: SEAT_TOP, z: 2.3, yaw: 0 },          // beside the driver
  ...ROWS.flatMap((z, r) => COLS.map((x, c) => ({ id: `r${r}c${c}`, x, y: SEAT_TOP, z, yaw: 0 }))),
];

export const CAR_RAPIDE: VehicleSpec = {
  id: 'car_rapide',
  name: 'Car rapide',
  kind: 'car_rapide',
  length: 6.9, width: 2.3,
  seats,
  driver: { id: 'chauffeur', x: 0.58, y: SEAT_TOP, z: 2.3, yaw: 0 },
  doors: [{ id: 'arriere', x: -0.45, z: -3.95, outX: -1.95, outZ: -4.25 }],
  cameras: [
    { id: 'derriere', label: 'Derrière le car', pos: [0, 4.4, -12.5], look: [0, 1.7, 6], portrait: { pos: [0, 6.6, -16.5], look: [0, 1.2, 9] } },
    // just outside the pavement-side windows, ahead of the stop's shelter when the car stands at a stop
    { id: 'fenetre', label: 'À la fenêtre', pos: [-1.5, 2.1, 0.6], look: [-3.4, 1.4, 9], portrait: { pos: [-1.6, 2.4, -1.2], look: [-3.0, 1.2, 9] } },
    { id: 'haut', label: 'Vue d’en haut', pos: [0, 12.5, -15], look: [0, 0.5, 9], portrait: { pos: [0, 17, -18], look: [0, 0, 10] } },
  ],
  cabin: 'closed',
  crew: {
    step: { x: -0.45, y: 0.24, z: -3.62, yaw: Math.PI - 0.9 },          // hanging on the rear step, hand on the grab bar
    door: { x: -1.55, y: -0.02, z: -4.0, yaw: -Math.PI / 2 - 0.5 },     // on the pavement beside the open door
  },
  sway: 1,
  // drive mode is not offered for the car rapide (the player rides it); the numbers document the minibus for later
  drive: { maxSpeed: 14, reverseSpeed: 3, accel: 1.6, brake: 4, turnRadius: 7.5, steer: 2.5, halfWidth: 1.15, halfLength: 3.45 },
  build: () => makeCarRapide(),
};
