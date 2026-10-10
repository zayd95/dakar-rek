import { lotCount, type LotSpot } from './arrivalRules';

/**
 * Getting to the fight by car, as rules: pure data and functions, no Three.js, no DOM (unit-tested in
 * tests/arenaCarPark.test.ts). The module that draws it is src/arena/carPark.ts; the moto's guarded parking
 * (src/arena/arrivalRules.ts) is the pattern.
 *
 * A few car places at the kerb of the side street east of the arena, on the arena's side: off the queue lane (it
 * crosses the street in front of the gate) and off Ligne 23's evening route (`23s` goes down the arena's west side,
 * round the west blocks and back along its north side). A « gardien du parking » asks 200 F, shown before paying,
 * paid once per evening. He keeps the place nearest the gate for the player, and the one in front of it free so the
 * car pulls out forward. Other cars fill the places as the doors open (a gala night fills them), and leave after the
 * gala, at the moto parking's pace (`lotCount`).
 */

/** The gardien's fee for the evening (game balance, provisional), and the save counter of the day it was paid for. */
export const CAR_FEE = 200;
export const CAR_FEE_COUNTER = 'arena_car_day';
export const carPaidTonight = (counters: Record<string, number>, day: number) => counters[CAR_FEE_COUNTER] === day;

/** Metres between two places along the kerb (a saloon is 4.5 m long, an SUV 4.85 m). */
export const CAR_GAP = 6;
/** The side street's centre line east of the arena's centre (half the 60 m block pitch). */
export const SIDE_STREET = 30;
/** A parked car's centre from the street's centre line (src/game/parkedVehicles.ts PARK_OFFSET: the kerb lane). */
export const KERB = 4.3;
/** How many places along the kerb. */
export const CAR_PLACES = 6;

export interface CarLot {
  /** Where the gardien stands (on the pavement behind the first place, facing the cars coming up the street), and his sign (beside that place, on the sand). */
  gardien: LotSpot;
  sign: LotSpot;
  /** The places, nose to the north (driving on the right); `slots[reserved]` is his for the player, `slots[ahead]` stays free. */
  slots: LotSpot[];
  reserved: number;
  ahead: number;
  /** The kerb lane and the pavement beside it: a car left in here is in his care. */
  area: { x0: number; x1: number; z0: number; z1: number };
  /** The stretch of kerb lane kept clear of the street's parked cars (centre z of that stretch, half length). */
  kerb: { x: number; z: number; half: number };
}

/**
 * The guarded car places of an arena centred on (cx, cz): the kerb lane on the arena's side of the street east of it,
 * from 7 m past the corner with the gate's street (the first place, nearest the gate) up to 7 m short of the next
 * junction. The street's lamp posts stand on the pavement, clear of the lane.
 */
export function carLot(a: { cx: number; cz: number }): CarLot {
  const x = a.cx + SIDE_STREET - KERB, slots: LotSpot[] = [];
  for (let k = 0; k < CAR_PLACES; k++) slots.push({ x, z: a.cz - 16 + k * CAR_GAP, yaw: 0 });
  return {
    gardien: { x: a.cx + 23.4, z: a.cz - 18.8, yaw: (3 * Math.PI) / 4 },
    sign: { x: a.cx + 22.9, z: a.cz - 15.5, yaw: (3 * Math.PI) / 4 },
    slots, reserved: 0, ahead: 1,
    area: { x0: a.cx + 23.2, x1: a.cx + 27.8, z0: a.cz - 21.5, z1: a.cz + 16.5 },
    kerb: { x, z: a.cz - 2.5, half: 19 },
  };
}
export const inCarLot = (lot: CarLot, x: number, z: number) => x >= lot.area.x0 && x <= lot.area.x1 && z >= lot.area.z0 && z <= lot.area.z1;

/** Other cars in the places at most, per graphics quality (instanced: two draw calls per look whatever the number). */
export const CAR_CAP = { low: 2, medium: 3, high: 4 } as const;
/** Looks of the other cars per graphics quality (each look is one body and one glass instanced mesh). */
export const CAR_LOOKS = { low: 1, medium: 2, high: 3 } as const;

/** How many other cars stand in the places: the moto parking's rule (`lotCount`) with the cars' cap. */
export const carCount = (o: Parameters<typeof lotCount>[0]) => lotCount(o);

/**
 * Which places the other cars take, in order: a fixed shuffle (the same evening fills the same way), never the
 * reserved place nor the one in front of it.
 */
export function carOrder(lot: CarLot, seed = 29): number[] {
  const ids = lot.slots.map((_, i) => i).filter(i => i !== lot.reserved && i !== lot.ahead);
  let h = seed >>> 0 || 1;
  for (let i = ids.length - 1; i > 0; i--) { h = Math.imul(h ^ (h >>> 13), 1103515245) + 12345 >>> 0; const j = h % (i + 1); [ids[i], ids[j]] = [ids[j], ids[i]]; }
  return ids;
}
/** The first `n` of that order, never a place the player's own car stands on (left in the row unpaid). */
export function carTaken(lot: CarLot, n: number, mine: { x: number; z: number } | null, seed = 29): number[] {
  const out: number[] = [];
  for (const i of carOrder(lot, seed)) {
    if (out.length >= n) break;
    const s = lot.slots[i];
    if (mine && Math.abs(s.x - mine.x) < 2.6 && Math.abs(s.z - mine.z) < CAR_GAP * 0.8) continue;
    out.push(i);
  }
  return out;
}
