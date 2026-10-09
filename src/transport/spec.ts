import type * as THREE from 'three';

/**
 * One vehicle framework (docs/LIVING_DAKAR.md, rule 3): every vehicle — car rapide, Dem Dikk bus, taxi, moto, the
 * player's own motorbike or car — is described by a VehicleSpec. Local frame: origin on the ground at the vehicle's
 * centre, front towards +z, left side towards +x (so the right-hand, pavement side is −x when driving on the right).
 * The model comes from `build()`: today the car rapide adapter (carRapide.ts) wraps the existing model of
 * src/actors/vehicles.ts; the shared vehicle kit replaces it there without touching the rest.
 *
 * Who moves a vehicle is separate (vehicle.ts): a line's timetable (passenger mode, Wave 1) or, next, the player at
 * the driver seat (drive mode: owned motorbike, then car), using `drive` for the handling.
 */
export interface LocalPose { x: number; y: number; z: number; yaw: number }

/** A seat: x, z on the floor plan; y = height of the sitting surface above the ground origin; yaw relative to the vehicle. */
export interface SeatSpec extends LocalPose { id: string }

export interface DoorSpec {
  id: string;
  /** Where a passenger stands to get in (local, on the ground). */
  x: number; z: number;
  /** Where a passenger steps out to, on the pavement side (local, on the ground). */
  outX: number; outZ: number;
}

export interface CameraAnchor {
  id: string;
  /** Shown in « Changer de vue ». */
  label: string;
  /** Camera position and look-at point in the vehicle's frame. */
  pos: [number, number, number];
  look: [number, number, number];
  /** Phone portrait (narrow field of view): further back and higher so the street stays readable. */
  portrait?: { pos: [number, number, number]; look: [number, number, number] };
}

/** Handling for drive mode (the player at the driver seat). Not used by timetabled lines. */
export interface DriveSpec {
  /** m/s */
  maxSpeed: number;
  reverseSpeed: number;
  /** m/s² */
  accel: number; brake: number;
  /** Tightest turning radius (m) and how fast the steering follows the stick (1/s). */
  turnRadius: number; steer: number;
  /** Ground clearance of the body for collisions (m), half-extents for the collider box. */
  halfWidth: number; halfLength: number;
  /** Two-wheeler: leans into turns instead of rolling out. */
  lean?: boolean;
}

export interface VehicleSpec {
  id: string;
  name: string;
  kind: 'car_rapide' | 'bus' | 'taxi' | 'moto' | 'car';
  length: number; width: number;
  /** Passenger seats (the player and NPCs). */
  seats: SeatSpec[];
  /** The driver's seat: an NPC driver on a line, the player in drive mode. */
  driver: SeatSpec;
  doors: DoorSpec[];
  /** Passenger camera views; the first one is the default. */
  cameras: CameraAnchor[];
  /** 'open': the cabin can be seen from outside (passengers get bodies); 'closed': seats are only occupied. */
  cabin: 'open' | 'closed';
  /** Conductor (car rapide apprenti): on the rear step while moving, beside the door when stopped. */
  crew?: { step: LocalPose; door: LocalPose };
  /** Handling in drive mode (owned vehicles, Wave 2). */
  drive?: DriveSpec;
  /** How much the body sways: 1 = a loaded minibus on worn springs. */
  sway?: number;
  /** The 3D model (front +z). Instances may share geometry and materials (userData.shared). */
  build(): THREE.Object3D;
}

/** A pose in the world (x, z on the ground plane, y the ground height under the vehicle). */
export interface WorldPose { x: number; y: number; z: number; yaw: number }

/**
 * Local point of a vehicle → world (same rotation as three.js rotation.y = yaw):
 * x' = x cos + z sin, z' = −x sin + z cos.
 */
export function toWorld(v: WorldPose, lx: number, lz: number, out: { x: number; z: number }) {
  const c = Math.cos(v.yaw), s = Math.sin(v.yaw);
  out.x = v.x + lx * c + lz * s;
  out.z = v.z - lx * s + lz * c;
  return out;
}

/** World pose of a seat on a vehicle (seat top height included), written into a Seat-like object. */
export function seatToWorld(v: WorldPose, seat: SeatSpec, out: { x: number; z: number; top: number; yaw: number }, lift = 0) {
  toWorld(v, seat.x, seat.z, out);
  out.top = v.y + seat.y + lift;
  out.yaw = v.yaw + seat.yaw;
  return out;
}
