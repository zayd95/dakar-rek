/**
 * What the street's people and the decorative traffic say to each other, as plain shared state (no objects made per
 * frame): the walkers who are crossing the road (cars slow down and stop for them), and the kerb spots where a taxi or a
 * minibus pulls in, waits while someone climbs in or gets out, and drives on (src/actors/npc.ts, src/crowd/street.ts).
 */
export interface Crossing { on: boolean; x: number; z: number }
/** The walkers crossing now (the street crowd fills it, the cars read it). */
export const crossings: Crossing[] = Array.from({ length: 16 }, () => ({ on: false, x: 0, z: 0 }));

/** Lateral distance from the road's centre line where a car stands when it has pulled in (the kerb is at 5, parked cars at 4.3). */
export const STOP_LANE = 3.95;

/**
 * A place by the kerb for a car to pull in. The directed edge a→b is the way the car comes (right-hand traffic, the kerb
 * on the +p side, p = (-dz, dx)); `s` the metres from a to the car's centre when it stands.
 */
export interface KerbSpot {
  ax: number; az: number; bx: number; bz: number; s: number;
  /** The car's centre when it stands, and the unit vector from the road to the pavement. */
  x: number; z: number; px: number; pz: number;
  /** A minibus's spot (longer) rather than a taxi's. */
  long: boolean;
  /** People at the kerb waiting to get in now, and how many are wanted (the street crowd sets both). */
  waiting: number; want: number;
  /** A car is on its way to it, or standing at it (with its position). */
  claimed: boolean; halted: boolean; cx: number; cz: number;
  /** Set when a car has just stopped: the street crowd lets someone out (and clears it). */
  fresh: boolean;
  /** Not before this time (`kerb.clock`). */
  cool: number;
}
export const kerbSpots: KerbSpot[] = [];
export const kerb = { clock: 0 };
