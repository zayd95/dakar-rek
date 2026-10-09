import type { Target, TargetSource } from './types';
import type { Clip } from '../actors/humanoid';

/**
 * One sit system for every seat in Dakar: benches, chairs, stools, sofas, beds, prayer rows, vehicle seats.
 * Builders and venues register seats; the player (and later NPCs) occupy them. A seat is a target with « S'asseoir »
 * while it is free and the player is near it.
 */
export type SeatKind = 'bench' | 'chair' | 'stool' | 'sofa' | 'bed' | 'mat' | 'vehicle' | 'prayer';

export interface Seat {
  id: string;
  /** Where the hips go, on the floor plan. */
  x: number; z: number;
  /** Height of the sitting surface above the ground (a city bench is 0.58 m, a stool about 0.45 m). */
  top: number;
  /** Direction the sitter faces (game yaw: forward = sin/cos). */
  yaw: number;
  kind: SeatKind;
  /** 'street' or an interior / venue / vehicle id. */
  space: string;
  /** 'player', an NPC id, a remote player id, or null when free. */
  occupant: string | null;
  /**
   * Locked seat (a seat in a moving vehicle): moving the stick does not stand the player up and « Se lever » is not
   * offered; the module owning the seat gives the way out (src/transport: « Descendre au prochain arrêt »). Seats may
   * also move: main.ts places a seated player from the seat's x / top / z / yaw every frame.
   */
  locked?: boolean;
  /**
   * Pose held by whoever sits here (player or NPC); default 'Sit'. Floor places use 'Kneel' (a prayer row, a mat):
   * their `top` is then the floor height + SIT_HIPS, so the sitter's origin lands on the floor (see floorSeatTop).
   */
  clip?: Clip;
}

/** Height of the Sit clip's hips above the character origin (actors/humanoid.ts, corrected Sit). */
export const SIT_HIPS = 0.48;
/** Character origin height for someone sitting on this seat. */
export const sitOriginY = (s: Pick<Seat, 'top'>) => s.top - SIT_HIPS;
/** `top` of a floor place (prayer row, mat) whose sitter kneels with their origin on a floor at `floorY`. */
export const floorSeatTop = (floorY: number) => floorY + SIT_HIPS;
/** The pose someone holds on this seat. */
export const seatClip = (s: Pick<Seat, 'clip'>): Clip => s.clip ?? 'Sit';

const REACH = 1.3;

export class Seats implements TargetSource {
  readonly name = 'seats';
  /** Called when the player picks « S'asseoir » (main.ts moves the body and plays Sit). */
  onSit: (seat: Seat) => void = () => {};
  private bySpace = new Map<string, Seat[]>();
  private byId = new Map<string, Seat>();

  add(seat: Seat) {
    if (this.byId.has(seat.id)) return this.byId.get(seat.id)!;
    this.byId.set(seat.id, seat);
    const list = this.bySpace.get(seat.space) ?? []; list.push(seat); this.bySpace.set(seat.space, list);
    return seat;
  }
  addAll(seats: readonly Seat[]) { for (const s of seats) this.add({ ...s }); }
  /** Forget every seat (hub change), or only those of one space. */
  clear(space?: string) {
    if (space === undefined) { this.bySpace.clear(); this.byId.clear(); return; }
    for (const s of this.bySpace.get(space) ?? []) this.byId.delete(s.id);
    this.bySpace.delete(space);
  }
  get(id: string) { return this.byId.get(id) ?? null; }
  inSpace(space: string): readonly Seat[] { return this.bySpace.get(space) ?? []; }
  /** Every seat of every space (street, interiors, vehicles), e.g. for systems that seat NPCs anywhere. */
  all(): Seat[] { return [...this.byId.values()]; }
  get size() { return this.byId.size; }

  occupy(id: string, who: string): boolean {
    const s = this.byId.get(id); if (!s || (s.occupant && s.occupant !== who)) return false;
    s.occupant = who; return true;
  }
  release(id: string, who: string) { const s = this.byId.get(id); if (s && s.occupant === who) s.occupant = null; }
  /** Marks as taken every free seat within `r` of (x, z) — e.g. under an ambient NPC placed by a builder. */
  occupyNear(space: string, x: number, z: number, who: string, r = 0.45) {
    for (const s of this.inSpace(space)) if (!s.occupant && Math.hypot(s.x - x, s.z - z) <= r) { s.occupant = who; return s; }
    return null;
  }
  nearestFree(space: string, x: number, z: number, r = REACH): Seat | null {
    let best: Seat | null = null, bd = r;
    for (const s of this.inSpace(space)) { if (s.occupant) continue; const d = Math.hypot(s.x - x, s.z - z); if (d <= bd) { bd = d; best = s; } }
    return best;
  }

  collect(space: string, x: number, z: number, out: Target[]) {
    for (const s of this.inSpace(space)) {
      // vehicle seats are taken by boarding the vehicle (ride), never offered on their own
      if (s.occupant || s.kind === 'vehicle' || Math.abs(s.x - x) > REACH || Math.abs(s.z - z) > REACH) continue;
      out.push({
        id: 'seat:' + s.id, name: SEAT_NAME[s.kind], kind: 'seat', space, x: s.x, z: s.z, y: s.top + 0.5, radius: REACH, bias: 1,
        affordances: () => [{ id: 'sit', verb: s.kind === 'bed' ? 'sleep' : 'sit', label: s.kind === 'bed' ? 'S’allonger' : 'S’asseoir', icon: s.kind === 'bed' ? '🛏️' : '🪑', run: () => this.onSit(s) }],
      });
    }
  }
}

const SEAT_NAME: Record<SeatKind, string> = { bench: 'Banc', chair: 'Chaise', stool: 'Tabouret', sofa: 'Canapé', bed: 'Lit', mat: 'Natte', vehicle: 'Siège', prayer: 'Rang de prière' };

/**
 * Seats along a bench of length `len` centred on (x, z), facing `yaw` (the bench back is behind the sitters).
 * `count` evenly spaced places; ids are `${prefix}:0…`.
 */
export function benchSeats(prefix: string, x: number, z: number, yaw: number, top: number, space: string, len = 3.2, count = 3, kind: SeatKind = 'bench'): Seat[] {
  const ax = Math.cos(yaw), az = -Math.sin(yaw);                        // the bench's length, perpendicular to facing
  return Array.from({ length: count }, (_, i) => {
    const o = count === 1 ? 0 : (i / (count - 1) - 0.5) * (len - 0.8);
    return { id: `${prefix}:${i}`, x: x + ax * o, z: z + az * o, top, yaw, kind, space, occupant: null };
  });
}
