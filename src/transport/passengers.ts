import type * as THREE from 'three';
import type { Collider } from '../world/types';
import type { Seat } from '../interact/seats';
import type { SeatSpec } from './spec';

/**
 * Who sits where in a line's vehicles, and the kerb at the stops (pure helpers, unit-tested).
 */
const hash = (a: number, b: number) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

/**
 * `n` fixed sets of NPC passengers (seat ids) for a vehicle spec, about `fill` full (half by default), always leaving
 * at least `free` seats the player can take. Fixed sets keep the number of drawn variants (cached models) small.
 */
export function passengerPatterns(seats: readonly SeatSpec[], n: number, salt = 1, free = 3, fill = 0.5): string[][] {
  return Array.from({ length: n }, (_, k) => {
    const taken = seats.filter((_s, i) => hash(i + 1, k * 13 + salt) < fill);
    let open = seats.filter(s => !s.npcOnly && !taken.includes(s)).length;
    for (let i = taken.length - 1; i >= 0 && open < free; i--) if (!taken[i].npcOnly) { taken.splice(i, 1); open++; }
    return taken.map(s => s.id);
  });
}

/**
 * The seat the player takes when boarding: free, not an NPC-only seat, on the pavement side (lowest x, the right-hand
 * side when driving on the right) when there is one. −1 when the vehicle is full.
 */
export function pickSeat(specSeats: readonly SeatSpec[], seats: readonly Seat[], rand: () => number): number {
  const open = specSeats.map((_s, i) => i).filter(i => !seats[i].occupant && !specSeats[i].npcOnly);
  if (!open.length) return -1;
  const minX = Math.min(...open.map(i => specSeats[i].x));
  const side = open.filter(i => specSeats[i].x < minX + 0.05);
  return side[Math.floor(rand() * side.length)];
}

/** A stretch of kerb at a stop: around the stop's spot (`offset` m right of the centre line), from `from` to `to` m along the road. */
export interface KerbZone { x: number; z: number; dx: number; dz: number; rx: number; rz: number; offset: number; from: number; to: number }

/** Where a point lies relative to a kerb zone: metres along the road, metres right of the centre line. */
export function kerbCoords(zone: KerbZone, x: number, z: number) {
  const ax = x - zone.x, az = z - zone.z;
  return { along: ax * zone.dx + az * zone.dz, lateral: zone.offset + ax * zone.rx + az * zone.rz };
}
const inLane = (zone: KerbZone, x: number, z: number) => { const c = kerbCoords(zone, x, z); return c.along >= zone.from && c.along <= zone.to && c.lateral > 3 && c.lateral < 5.2; };

/**
 * No parking at a bus stop: removes the vehicles parked along the kerb (src/game/parkedVehicles.ts puts them 4.3 m off
 * the centre line, in a group named `kit_parked`) and their colliders where a car rapide pulls in. Returns how many
 * vehicles were removed.
 */
export function clearKerb(root: THREE.Object3D, colliders: Collider[], zones: readonly KerbZone[]): number {
  let removed = 0;
  for (const g of root.children) {
    if (g.name !== 'kit_parked') continue;
    for (const v of [...g.children]) if (zones.some(zn => inLane(zn, v.position.x, v.position.z))) { g.remove(v); removed++; }
  }
  for (let i = colliders.length - 1; i >= 0; i--) {
    const c = colliders[i], cx = (c.x0 + c.x1) / 2, cz = (c.z0 + c.z1) / 2;
    if (c.h <= 2.6 && zones.some(zn => inLane(zn, cx, cz))) colliders.splice(i, 1);
  }
  return removed;
}

// ------------------------------------------------------------------ fans aboard (fight evenings)
/** Fans aboard a car: their shirt colours, and the stop they ride to (src/arena/arrival.ts sets a line's on fight evenings). */
export interface LineFans { colours: readonly number[]; dest: string }

/**
 * Who rides a car after it pulls in at `stop` (pure): the fans aboard get off at their own stop (`off`) and nowhere else,
 * whatever the line does meanwhile (the arena's street may leave its doors phase mid-ride: those aboard still ride to
 * their stop); the line's fans of now (`line`, null when none) get on at every stop but theirs.
 */
export function fansAtStop(aboard: LineFans | null, line: LineFans | null, stop: string): { off: boolean; aboard: LineFans | null } {
  const off = !!aboard && aboard.dest === stop;
  if (line && stop !== line.dest) return { off, aboard: line };
  return { off, aboard: aboard && !off ? aboard : null };
}
/**
 * A line's fans change (pure): with fans, every car takes them at once unless it stands at their stop now (they just got
 * off there); without, the cars keep those already aboard until their stop.
 */
export function fansOnSet(aboard: LineFans | null, line: LineFans | null, dwellingAt: string | null): LineFans | null {
  if (!line) return aboard;
  return dwellingAt === line.dest ? null : line;
}
