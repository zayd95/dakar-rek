import * as THREE from 'three';
import { buildVehicle, vehicleSpec, type VehicleSpec as KitSpec } from '../actors/vehicleKit';
import type { V3 } from '../world/kitGeometry';
import { glbVehicle } from '../actors/glbVehicle';
import { SIT_HIPS } from '../interact/seats';
import { jakartaSeed } from './moto';
import type { CameraAnchor, SeatSpec, VehicleSpec } from './spec';

/**
 * The « Sabar 600 »: the sport motorbike, a faired 600 cm³ with low clip-ons and a raised tail (an original design: no brand, badge or lettering). Its body is
 * a Meshy model cut into parts by scripts/vehicles/build-sport-moto.mjs (public/assets/vehicles/sabar.glb): the shell, the rear wheel, and the front end
 * (fork, mudguard, clip-ons) on a node turned about the raked steering axis with the front wheel in it; both wheels spin (src/actors/glbVehicle.ts).
 * Everything else is the owned-vehicle system's (src/transport/sportMotoModule.ts): sold in two colourways at two dealers, ridden, parked, saved.
 *
 * The numbers below are the built model's (its sidecar, public/assets/vehicles/sabar.json; tests/sportMoto.test.ts holds them together): the seat, the
 * grips and the pegs the rider's 'RideSport' pose reaches for (src/actors/humanoid.ts), the wheels, the axis.
 */
/** Its catalogue entry (src/economy/catalog.ts: name and price). */
export const SABAR_ASSET = 'sabar' as const;
export const SABAR_MODEL = 'sabar';
export const SABAR_DETAIL = 'Neuve · moto sportive carénée · 600 cm³ · se gare où tu la laisses';

/** The two colourways, one per dealer (src/transport/sportMotoModule.ts): their names on the price card, their main colour. Seed 1000 + i, saved with the bike. */
export interface SabarPaint { id: string; name: string; hex: number }
export const SABAR_PAINTS: readonly SabarPaint[] = [
  { id: 'rouge-blanc', name: 'rouge et blanc', hex: 0xc3121e },
  { id: 'jaune-noir', name: 'jaune et noir', hex: 0xf2b705 },
];
export const sabarSeedOf = (i: number) => 1000 + i;
/** The colourway of a saved paint seed (anything else: the first). */
export const sabarPaintOf = (seed: number): SabarPaint => SABAR_PAINTS[seed - 1000] ?? SABAR_PAINTS[0];

/** The built body (the vehicle's frame: +z forward, +x its left, y up, the ground at 0). */
export const SABAR_BODY = {
  length: 2.0, width: 0.89, height: 1.31,
  wheels: { front: { z: 0.664, r: 0.334 }, rear: { z: -0.661, r: 0.33 } },
  /** The steering axis: a point on it (the top clamp) and its rake from the vertical (rad). */
  steer: { pivot: [0, 0.977, 0.34] as V3, rake: 0.484 },
  /** Where the rider sits (the front of the seat, behind the tank), the middle of each grip of the clip-ons, each rear-set peg. */
  seat: { z: -0.28, top: 0.85 },
  grips: [[0.31, 1.04, 0.36], [-0.31, 1.04, 0.36]] as [V3, V3],
  pegs: [[0.15, 0.36, -0.14], [-0.15, 0.36, -0.14]] as [V3, V3],
  lights: { head: [[0.07, 0.76, 0.85], [-0.07, 0.76, 0.85]] as V3[], tail: [[0, 0.88, -0.97]] as V3[] },
};
/** The grips and the pegs in the rider's own space (origin SIT_HIPS under the saddle, as every seat pose): what 'RideSport' reaches for. */
const rider = (g: V3): V3 => [g[0], g[1] - (SABAR_BODY.seat.top - SIT_HIPS), g[2] - SABAR_BODY.seat.z];
export const SABAR_RIDER = {
  grips: [rider(SABAR_BODY.grips[0]), rider(SABAR_BODY.grips[1])] as [V3, V3],
  pegs: [rider(SABAR_BODY.pegs[0]), rider(SABAR_BODY.pegs[1])] as [V3, V3],
};

let kitCache: KitSpec | null = null;
/**
 * The kit spec the body carries (`userData.vehicleSpec`: the lamps at night, the minimap, the lean and the steering limit of animateVehicle): the kit's
 * motorbike with this bike's own size, wheels, seat, controls and steering axis.
 */
export function sabarKit(): KitSpec {
  if (kitCache) return kitCache;
  const k = vehicleSpec('moto', { seed: jakartaSeed(), driver: false, passengers: false }), B = SABAR_BODY, W = B.wheels;
  const rake = B.steer.rake, seat = { id: 'driver', x: 0, z: B.seat.z, top: B.seat.top, yaw: 0, kind: 'driver' as const, door: 'left', clip: 'RideSport' as const };
  return (kitCache = {
    ...k, label: 'Sabar 600', length: B.length, width: B.width, height: B.height, wheelbase: W.front.z - W.rear.z,
    wheels: [{ x: 0, y: W.front.r, z: W.front.z, r: W.front.r, width: 0.12, steer: true }, { x: 0, y: W.rear.r, z: W.rear.z, r: W.rear.r, width: 0.19, steer: false }],
    seats: [seat], doors: [{ ...k.doors[0], seats: ['driver'] }],
    lights: { head: B.lights.head, tail: B.lights.tail },
    controls: { steering: [0, B.grips[0][1], B.grips[0][2]], grips: B.grips, pegs: B.pegs },
    // the front end turns about the raked axis (the kit's convention: pivot and axis); the bike leans a little further than the Jakarta into a corner
    drive: { wheelRadius: W.rear.r, steerMax: 0.6, lean: 0.55, pivot: B.steer.pivot, axis: [0, Math.cos(rake), -Math.sin(rake)] },
  });
}

/** The prepared body in the colourway of `seed`, or null (not loaded: the kit's motorbike in that colour stands in). */
export function sabarVisual(seed: number): THREE.Group | null {
  const i = SABAR_PAINTS.indexOf(sabarPaintOf(seed));
  return glbVehicle(SABAR_MODEL, sabarKit(), i);
}

let cached: VehicleSpec | null = null;
/**
 * The transport spec: the rider's seat with the tucked 'RideSport' pose, the getting-on side, the views (« Derrière la moto », « Au guidon » over the
 * rider's shoulders, « Vue d'en haut », each with its phone-portrait framing) and the handling.
 */
export function sabarSpec(): VehicleSpec {
  if (cached) return cached;
  const B = SABAR_BODY, k = sabarKit(), door = k.doors[0];
  const driver: SeatSpec = { id: 'driver', x: 0, y: B.seat.top, z: B.seat.z, yaw: 0, npcOnly: false, clip: 'RideSport' };
  const cameras: CameraAnchor[] = [
    { id: 'chase', label: 'Derrière la moto', pos: [0, B.height + 1.4, -B.length / 2 - 4.6], look: [0, B.height * 0.55, 0.6], portrait: { pos: [0, B.height + 3, -B.length / 2 - 7.2], look: [0, B.height * 0.55, 3.1] } },
    { id: 'guidon', label: 'Au guidon', pos: [0, 1.85, -1.15], look: [0, 1.0, 5], portrait: { pos: [0, 2.1, -1.6], look: [0, 0.9, 5] } },
    { id: 'haut', label: 'Vue d’en haut', pos: [0, 9, -10], look: [0, 0, 6], portrait: { pos: [0, 13, -12], look: [0, 0, 7] } },
  ];
  const fallback = (seed: number, ridden: boolean) => buildVehicle('moto', { seed: jakartaSeed(), color: sabarPaintOf(seed).hex, driver: false, passengers: false, stand: !ridden }).group;
  cached = {
    id: 'sabar', name: 'Sabar 600', kind: 'moto', length: B.length, width: 0.78,
    seats: [], driver, doors: [{ id: door.id, x: door.board[0], z: door.board[2], outX: door.board[0] + 0.2, outZ: door.board[2] }],
    cameras, cabin: 'open', sway: 1,
    // a sport bike: a higher top speed and a much quicker pull than the Jakarta (8.6 m/s²), stronger brakes, more grip; a slightly wider circle (a longer
    // wheelbase, a steeper lock). Within what the streets, the collisions and the roads between districts carry: the cars reach 46–56 m/s boosted.
    drive: { maxSpeed: 24, boostSpeed: 50, reverseSpeed: 1.6, accel: 11.5, brake: 14, turnRadius: 2.9, steer: 8, grip: 18, halfWidth: 0.42, halfLength: B.length / 2, lean: true },
    build: o => sabarVisual(o?.seed ?? sabarSeedOf(0)) ?? fallback(o?.seed ?? sabarSeedOf(0), !!o?.ridden),
  };
  return cached;
}
