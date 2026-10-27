import { ENTRANCE, GATE, LOT } from '../housing/villa';

/**
 * LD2.0-D lane V-E: the rule of the villa's sliding gate (src/world/villaCompound.ts draws it, src/villa/module.ts moves it). Pure, unit-tested.
 *
 *  - It opens for the villa's people: its owner or its renter, and a guest whose invitation to it has been accepted (src/online/visit.ts), coming
 *    near it from the street on foot (6.5 m) or at the wheel (10 m: a car needs the time to slide it).
 *  - From inside the walls it opens for anyone walking up to it (3.2 m) or driving in the yard near it (6.5 m): nobody is ever shut in.
 *  - Once moving it never shuts on someone standing or driving in its opening (but standing against it, shut, opens nothing).
 *  - Otherwise it shuts behind: a visitor of the street finds it shut, and it stays shut for them.
 * Plan coordinates (src/housing/villa.ts): metres from the lot's centre, +z toward the street; the gate is in the street wall (z = GATE.z).
 */
export const GATE_REACH = { street: 6.5, streetDriving: 10, yard: 3.2, yardDriving: 6.5 } as const;
/** Seconds the panel takes to slide fully open (or shut). */
export const GATE_SECONDS = 2.4;
/** Open beyond this share, the way is free (the gate's box leaves the hub's colliders). */
export const GATE_FREE = 0.97;

export type VillaHold = 'owned' | 'rented' | null;
/** The villa's people: its owner, its renter, a guest it invited. */
export const gateFor = (hold: VillaHold, invited: boolean) => hold === 'owned' || hold === 'rented' || invited;

/** A point of the hub in the lot's plan coordinates. */
export const toPlan = (x: number, z: number) => ({ x: x - LOT.cx, z: z - LOT.cz });
/** Inside the walls (the lot less the wall). */
export const insideWalls = (px: number, pz: number) => Math.abs(px) < LOT.w / 2 - 0.3 && Math.abs(pz) < LOT.d / 2 - 0.3;
/** In the gate's opening, or just either side of it (where a shutting gate would close on someone). */
export const inOpening = (px: number, pz: number) => px > GATE.x0 - 0.6 && px < GATE.x1 + 0.6 && pz > GATE.z - 1.6 && pz < GATE.z + 1.2;

export interface GateSense {
  /** The player in plan coordinates. */
  px: number; pz: number;
  /** At the wheel of a vehicle. */
  driving: boolean;
  /** One of the villa's people (`gateFor`). */
  allowed: boolean;
}
/** Whether the gate should be open now; `open`: how far it is open now (0 shut … 1). */
export function gateWants(s: GateSense, open: number): boolean {
  const gx = (GATE.x0 + GATE.x1) / 2, d = Math.hypot(s.px - gx, s.pz - GATE.z);
  if (open > 0 && inOpening(s.px, s.pz)) return true;                       // never on someone
  if (insideWalls(s.px, s.pz)) return d <= (s.driving ? GATE_REACH.yardDriving : GATE_REACH.yard);
  return s.allowed && s.pz > GATE.z && d <= (s.driving ? GATE_REACH.streetDriving : GATE_REACH.street);
}
/** The panel's next position (0 shut … 1 open) toward what is wanted, after `dt` seconds. */
export const stepGate = (k: number, want: boolean, dt: number) => Math.max(0, Math.min(1, k + (want ? 1 : -1) * dt / GATE_SECONDS));

// ------------------------------------------------------------------------------------------------ LD2.0-D round 2 (lane R2-E): the main entrance
/**
 * The main entrance for people (ENTRANCE, src/housing/villa.ts; src/world/villaCompound.ts draws it, src/villa/module.ts swings it): a pivoting door
 * in the street wall, in line with the house's front door. Its rule is the gate's, for people on foot:
 *  - it opens for the villa's people (`gateFor`: the owner, the renter, a guest whose invitation was accepted) walking up to it from the street;
 *  - from inside the walls it opens for anyone walking up to it: nobody is ever shut in;
 *  - once moving it never shuts on someone in its swing (the leaf's sweep, either side of the wall);
 *  - at the wheel it does nothing (a door for people: the cars have the gate); otherwise it shuts behind, and a stranger finds it shut.
 * The reaches are a little longer than the leaf's time to swing needs, so a walker (even jogging) finds the way free when he reaches it.
 */
export const ENTRANCE_REACH = { street: 5, yard: 4 } as const;
/** Seconds the leaf takes to swing fully open (or shut). */
export const ENTRANCE_SECONDS = 0.9;
/** Open beyond this share (the leaf past 84°, it swings out fast and slows at the end: `entranceAngle`), the way is free: the shut door's box gives way to the open leaf's. */
export const ENTRANCE_FREE = 0.75;
/** The leaf's angle (rad) when the door is `k` open (0 shut … 1 open, 90°): quick off the latch, slowing to its stop. */
export const entranceAngle = (k: number) => (Math.PI / 2) * (1 - (1 - k) * (1 - k));
/** In the leaf's swing, either side of the wall, with a body's room round it (where a shutting door would close on someone). */
export const inSwing = (px: number, pz: number) => px > ENTRANCE.x0 - 0.5 && px < ENTRANCE.x1 + 0.5 && pz > ENTRANCE.z - 2 && pz < ENTRANCE.z + 0.75;
/** Whether the main entrance should be open now; `open`: how far it is open now (0 shut … 1). */
export function entranceWants(s: GateSense, open: number): boolean {
  const ex = (ENTRANCE.x0 + ENTRANCE.x1) / 2, d = Math.hypot(s.px - ex, s.pz - ENTRANCE.z);
  if (open > 0 && inSwing(s.px, s.pz)) return true;                          // never on someone
  if (s.driving) return false;                                              // a door for people
  if (insideWalls(s.px, s.pz)) return d <= ENTRANCE_REACH.yard;
  return s.allowed && s.pz > ENTRANCE.z && d <= ENTRANCE_REACH.street;
}
/** The leaf's next position (0 shut … 1 open) toward what is wanted, after `dt` seconds. */
export const stepEntrance = (k: number, want: boolean, dt: number) => Math.max(0, Math.min(1, k + (want ? 1 : -1) * dt / ENTRANCE_SECONDS));
