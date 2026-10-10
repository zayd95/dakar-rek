import { WALL_R } from '../world/geew';
import { ECURIES } from './exteriorRules';
import { GALA, type Street } from './program';

/**
 * Getting to the fight (Habib's evening: « prendre sa moto ou un Car Rapide »), as rules: pure data and functions, no
 * Three.js, no DOM (unit-tested in tests/arenaArrival.test.ts). The module that draws it is src/arena/arrival.ts.
 *
 * By moto: a guarded moto parking on the sand beside the arena, east of the gate, off the queue lane and the drummers.
 * A « gardien de motos » asks 100 F, shown before paying, paid once per evening. He keeps the place next to him for the
 * player's moto. The other motos fill the rows as the doors open (more on a gala night), and leave after the gala.
 * By car rapide: on a fight evening the Ligne 23 cars (its evening route round the arena block, `23s`, src/transport/lines.ts)
 * carry fans in their écurie's colours towards the « Arène » stop.
 */

/** The gardien's fee for the evening (game balance, provisional), and the save counter of the day it was paid for. */
export const MOTO_FEE = 100;
export const MOTO_FEE_COUNTER = 'arena_moto_day';
export const paidTonight = (counters: Record<string, number>, day: number) => counters[MOTO_FEE_COUNTER] === day;

/** Space between two motos side by side in a row (a Jakarta is 0.84 m wide). */
export const SLOT_GAP = 1.1;
export interface LotSpot { x: number; z: number; yaw: number }
export interface MotoLot {
  /** Where the gardien stands (facing the street), and his sign. */
  gardien: LotSpot;
  sign: LotSpot;
  /** The places of the rows, nose to the wall; `slots[reserved]` is the one he keeps for the player. */
  slots: LotSpot[];
  reserved: number;
  /** The parking's ground: a moto left in here is in his care. */
  area: { x0: number; x1: number; z0: number; z1: number };
  /** The kerb lane in front of it, kept clear of the street's parked cars (centre x of that stretch, half length). */
  kerb: { x: number; z: number; half: number };
}

/**
 * The guarded parking of an arena centred on (cx, cz): the sand between the wall and the street, east of the gate.
 * - Row 1, along the street: nine places from 12.6 m east of the gate.
 * - Row 2, behind it, near the block's corner: four places. It stays clear of the floodlight mast.
 * The reserved place is the first of row 1, next to the gardien, with nothing behind it so the moto backs out freely.
 */
export function motoLot(a: { cx: number; cz: number }): MotoLot {
  const gz = a.cz - WALL_R, slots: LotSpot[] = [];
  for (let k = 0; k < 9; k++) slots.push({ x: a.cx + 12.6 + k * SLOT_GAP, z: gz + 0.1, yaw: 0 });
  for (let k = 0; k < 4; k++) slots.push({ x: a.cx + 18.2 + k * SLOT_GAP, z: gz + 3.0, yaw: 0 });
  return {
    gardien: { x: a.cx + 11.2, z: gz - 0.9, yaw: Math.PI },
    sign: { x: a.cx + 10.4, z: gz - 0.2, yaw: Math.PI },
    slots, reserved: 0,
    area: { x0: a.cx + 10, x1: a.cx + 22.6, z0: gz - 1.9, z1: gz + 4.3 },
    kerb: { x: a.cx + 16.5, z: gz - 8.3 + 4.3, half: 6.5 },
  };
}
export const inLot = (lot: MotoLot, x: number, z: number) => x >= lot.area.x0 && x <= lot.area.x1 && z >= lot.area.z0 && z <= lot.area.z1;

/** Other motos in the rows at most, per graphics quality (instanced: a few draw calls whatever the number). */
export const LOT_CAP = { low: 6, medium: 10, high: 12 } as const;
/** Share of the rows taken on a weekday card (a gala night fills them). */
export const CARD_SHARE = 0.45;
/** Game seconds for the rows to empty after the gala. */
export const LOT_EMPTIES = 150;

/**
 * How many other motos stand in the rows: none on a quiet street, two while the arena is set up, filling as the doors
 * open (full on a gala night by 19 h), then fewer and fewer after the gala (`after.t` seconds since it ended, from the
 * `after.from` motos there were).
 */
export function lotCount(o: { street: Street; size: 'gala' | 'card'; hour: number; cap: number; after?: { t: number; from: number } }): number {
  if (o.street === 'quiet' || o.cap <= 0) return 0;
  const full = Math.max(1, Math.round(o.cap * (o.size === 'gala' ? 1 : CARD_SHARE)));
  if (o.street === 'setup') return Math.min(full, 2);
  if (o.street === 'doors') return Math.max(Math.min(full, 2), Math.round(full * Math.min(1, 0.35 + (o.hour - GALA.doors) * 0.33)));
  const from = o.after?.from ?? full;
  return Math.max(0, Math.round(from * (1 - (o.after?.t ?? 0) / LOT_EMPTIES)));
}

/**
 * Which places the other motos take, in order: a fixed shuffle of the rows (the same evening fills the same way), never
 * the reserved place and never a place the player's own moto stands on or right next to.
 */
export function lotOrder(lot: MotoLot, seed = 13): number[] {
  const ids = lot.slots.map((_, i) => i).filter(i => i !== lot.reserved);
  let h = seed >>> 0 || 1;
  for (let i = ids.length - 1; i > 0; i--) { h = Math.imul(h ^ (h >>> 13), 1103515245) + 12345 >>> 0; const j = h % (i + 1); [ids[i], ids[j]] = [ids[j], ids[i]]; }
  return ids;
}
export function lotTaken(lot: MotoLot, n: number, mine: { x: number; z: number } | null, seed = 13): number[] {
  const out: number[] = [];
  for (const i of lotOrder(lot, seed)) {
    if (out.length >= n) break;
    const s = lot.slots[i];
    if (mine && Math.hypot(s.x - mine.x, s.z - mine.z) < SLOT_GAP * 0.9) continue;
    out.push(i);
  }
  return out;
}

/**
 * Shirts of the fans aboard the Ligne 23 cars on a fight evening (the car rapide kit's `colours`): both écuries,
 * with a few people in their own clothes (−1).
 */
export const FAN_COLOURS: readonly number[] = [ECURIES[0].colour, ECURIES[1].colour, ECURIES[0].colour, -1, ECURIES[1].colour, ECURIES[0].colour, -1];
/** The stop the fans ride to, and the line that serves it on fight evenings (Ligne 23's evening route, 16 h – midnight). */
export const FAN_STOP = 'arene', FAN_LINE = '23s';
/** Fans ride towards the arena while it is set up and while the doors are open (not after the gala). */
export const fansRide = (street: Street) => street === 'setup' || street === 'doors';
