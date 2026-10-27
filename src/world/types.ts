import type * as THREE from 'three';
import type { HubId, Needs } from '../core/types';
import type { GameState } from '../core/state';
import type { PersonLook } from '../actors/humanoid';
import type { Seat } from '../interact/seats';
import type { Step } from '../activity/types';
import type { Site } from './sites';

export interface Action {
  id: string;
  label: string;
  detail?: string;
  cost?: number;
  gain?: number;
  needs?: Partial<Needs>;
  seconds: number;
  counter?: string;
  requires?: (s: GameState) => string | null;
  /** Hidden unless this returns true (e.g. a trusted-rate job after a recommendation). */
  visible?: (s: GameState) => boolean;
  /** Handled by a dedicated flow instead of the timed action (scenes, outfit, emotes). */
  /** Composed activity (src/activity): when present, the universal runner plays these steps (price = `cost`). */
  steps?: Step[];
  /** With `steps`: no « ✓ » toast at the end (a hand-over that starts another system says what happens itself). */
  quiet?: boolean;
  /** One emoji for buttons and sheets when the verb's default does not fit (« 🤼 » for a bout, « 🥊 » for a drill). */
  icon?: string;
  special?: 'entrance' | 'prep' | 'training' | 'outfit' | 'emote' | 'watch' | 'enter' | 'exit' | 'combat' | 'combat_classe' | 'combat_entrainement' | 'jobs' | 'shop' | 'business' | 'bank' | 'bankAdvice';
}
export interface Interactable {
  id: string;
  name: string;
  /** 'walk': a way out of the neighbourhood on foot (src/world/walk.ts: « Partir à pied », free). */
  kind: 'actions' | 'travel' | 'walk';
  x: number; z: number; radius: number;
  actions: Action[];
  /** Short greeting/context spoken by the host of this place. */
  description?: string;
  /** Set when this interactable is a recurring cast member. */
  npc?: string;
  /** How its action menu looks (presentation only): 'shop' = compact action rows of the shared UI primitives (src/ui/primitives.ts). */
  menu?: 'shop';
}
export interface Collider {
  x0: number; z0: number; x1: number; z1: number; h: number;
  /**
   * LD2.0-D: a collider that does not stand on the ground (a wall, a piece of furniture or a railing on an upper floor of the villa): it spans the
   * heights `y0`…`h`, and a body whose feet are above its top (less a step) or whose head is under its bottom passes it (`inBand`, main.ts pushOut).
   * Absent: from the ground up to `h`, as every collider before.
   */
  y0?: number;
}
/** LD2.0-D: a standing body's height (m) and the step it climbs: does a collider stop a body whose feet are at `y`? (Always, without `y0`.) */
export const BODY_H = 1.6, BODY_STEP = 0.25;
export const inBand = (c: Collider, y: number) => c.y0 === undefined || (y + BODY_H > c.y0 && y < c.h - BODY_STEP);
/** A tree top seen by the follow camera: a vertical cylinder of leaves (centre, radius, bottom and top heights). */
export interface Canopy { x: number; z: number; r: number; y0: number; y1: number }

/** The ground of a road that leaves the district (src/road): beyond `bounds`, vehicles and walkers may stand where this says they may. */
export interface RoadGround { contains(x: number, z: number, r: number): boolean }

export interface HubWorld {
  id: HubId;
  group: THREE.Group;
  colliders: Collider[];
  interactables: Interactable[];
  bounds: { x0: number; x1: number; z0: number; z1: number };
  /** The roads between districts attached to this one (src/road/host.ts), once the district is loaded: their ground extends the walkable and drivable area beyond `bounds`. */
  corridors?: RoadGround[];
  spawn: { x: number; z: number; yaw: number };
  edges: RoadEdge[];
  nodes: { x: number; z: number }[][];
  lamps: THREE.MeshBasicMaterial;
  facadeMat: THREE.MeshLambertMaterial;
  /** Additive light pools under street lamps, shown at night. */
  lampGlow: THREE.Mesh;
  /** Painted sign boards (lit a little at night). */
  signs: THREE.Mesh[];
  skyDay: number;
  arena: { cx: number; cz: number; r: number } | null;
  /** Per-frame ambient animation of the hub (grill smoke…). */
  tick(dt: number): void;
  /** Ground height above the street level at (x, z): stairs and terraces the player can climb. */
  heightAt(x: number, z: number): number;
  /** Ambient people placed by the builder (grill cook, seated customers…): position, facing, clip. */
  people: { x: number; z: number; yaw: number; clip: 'Idle' | 'Talk' | 'Sit'; y?: number; look?: PersonLook; walkTo?: { x: number; z: number } }[];
  /** Parked car rapides at the station (they get an apprentice calling for passengers). */
  rapides: THREE.Object3D[];
  /** Monument hill: stair run (x0→x1 at stairZ, rising y0→y1), summit terrace height, festive ground spots. */
  monument: { cx: number; cz: number; stairX0: number; stairX1: number; stairZ: number; y0: number; y1: number; spots: { x: number; z: number }[] } | null;
  ecurie: { cx: number; cz: number } | null;
  /** Every street seat of the hub (benches…): src/interact/seats.ts. */
  seats: Seat[];
  /** Lots and blocks left to a gameplay module (src/world/sites.ts, composed by src/venues). */
  sites?: Site[];
  /** Where the rooftop restaurant has its stair door when the district's own building gives it one (the Almadies: the boutique hotel's street face): the spot in front of the face and the face's outward normal. src/venues/rooftop.ts. */
  rooftopDoor?: { x: number; z: number; nx: number; nz: number };
  /** Tree tops and palm fronds the follow camera keeps out of (src/actors/camera.ts). */
  canopies?: Canopy[];
  /** Roofs open on one side (the dibiterie): under one, the camera stays below `h` so the slab never hides the player. */
  roofs?: Collider[];
  /**
   * Ground kept open whatever the street dressing would put there: a shop's frontage and the walk to its door, a loading bay at the kerb. The builder's
   * street trees and stalls, the street furniture (src/game/streetDress.ts), the painted walls (src/game/pikineDna.ts) and the parked cars
   * (src/game/parkedVehicles.ts) keep off it. `why` names it (the checks).
   */
  keepClear?: KeepClear[];
  dispose(): void;
}
/** A rectangle of the ground kept open (HubWorld.keepClear). */
export interface KeepClear { x0: number; z0: number; x1: number; z1: number; why: string }
export interface RoadEdge { ax: number; az: number; bx: number; bz: number }
