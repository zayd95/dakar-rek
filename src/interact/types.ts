/**
 * Contextual interaction contracts shared by every module (docs/LIVING_DAKAR.md, « the world is the interface »).
 * A Target is something in the world the player can act on — a seat, a person, a vehicle, a door, a counter, a shelf,
 * a plot of land, a billboard, a piece of furniture. Modules expose their targets through a TargetSource; the
 * Interactions system (system.ts) focuses the best one in front of the player and shows its primary verb.
 */
import type { Primitive } from '../activity/types';

/** The verbs of the world are the activity primitives (src/activity/types.ts). */
export type Verb = Primitive;

export type TargetKind =
  | 'seat' | 'person' | 'vehicle' | 'door' | 'counter' | 'shop' | 'place' | 'land' | 'billboard' | 'furniture' | 'spot' | 'self';

export interface Affordance {
  /** Unique within its target. */
  id: string;
  verb: Verb;
  /** Short French verb phrase shown on the button: « S'asseoir », « Saluer », « Commander ». */
  label: string;
  /** One emoji shown next to the label. */
  icon?: string;
  detail?: string;
  cost?: number;
  gain?: number;
  /** Why it cannot be done right now (shown greyed out); null or absent when available. */
  disabled?: string | null;
  run(): void;
}

export interface Target {
  id: string;
  name: string;
  kind: TargetKind;
  /** 'street', or the id of the interior / venue / vehicle the target is in (same ids as presence spaces). */
  space: string;
  x: number;
  /** Height of the prompt anchor above the ground (defaults by kind). */
  y?: number;
  z: number;
  /** Reach in metres. */
  radius: number;
  /** Metres added to the distance when ranking targets in reach (a seat next to a counter should not steal it). */
  bias?: number;
  /** Current affordances; the first available one is the primary action. */
  affordances(): Affordance[];
}

/** A module that knows some targets (seats, people, vehicles, shops…). Called every frame with the player's position. */
export interface TargetSource {
  readonly name: string;
  collect(space: string, x: number, z: number, out: Target[]): void;
}
