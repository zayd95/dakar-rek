import type * as THREE from 'three';
import type { GameState } from '../core/state';
import type { HubId } from '../core/types';
import type { Input } from '../core/input';
import type { Hud, MenuItem } from '../ui/hud';
import type { Interactions } from '../interact/system';
import type { Seat, Seats } from '../interact/seats';
import type { People } from '../interact/people';
import type { ActivityRunner } from '../activity/runner';
import type { Places } from '../activity/places';
import type { Inventory } from '../activity/inventory';
import type { HubWorld, Interactable } from '../world/types';
import type { Interior } from '../world/interiors';
import type { Humanoid } from '../actors/humanoid';
import type { FollowCamera } from '../actors/camera';
import { wolofModule } from '../i18n/module';
import { arenaModule } from '../arena/module';
import { assetKitModule } from './assetKit';
import { transport } from '../transport/module';
import { moto } from '../transport/motoModule';
import { car } from '../transport/carModule';
import { taxi } from '../transport/taxi';
import { arenaStreetsModule } from '../city/arena';
import { weatherModule } from '../city/weather';
import { streetVendorsModule } from '../city/vendors';
import { roadEventsModule } from '../city/roadEvents';
import { VenuesModule } from '../venues';
import { ESTATE_MODULE } from '../economy/estate';
import { ambientLife } from '../social/ambientLife';
import { arenaExteriorModule } from '../arena/exterior';
import { worldMarkers } from '../ui/worldMarkers';

export type GameMode = 'play' | 'menu' | 'busy' | 'scene';

/**
 * What a gameplay module may use from the running game (main.ts builds it once). Modules compose places, seats,
 * targets and activities on top of the shared systems instead of adding one-off code to main.ts.
 */
export interface GameCtx {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  follow: FollowCamera;
  /** Group cleared on every hub load: put per-hub objects (props, vehicles, people) here. */
  extra: THREE.Group;
  state: GameState;
  hud: Hud;
  input: Input;
  interactions: Interactions;
  seats: Seats;
  /** « Saluer » / « Demander son nom » on anyone: modules showing people add their bodies (`people.addBodies`). */
  people: People;
  places: Places;
  activities: ActivityRunner;
  inventory: Inventory;
  quality(): 'low' | 'medium' | 'high';
  world(): HubWorld | null;
  /** Interior the player is in, with its door. */
  inside(): { int: Interior; door: Interactable } | null;
  /** Interaction space: 'street', 'home' or the interior's door id. */
  space(): string;
  /** City clock (respects the debug hour override). */
  hour(): number;
  day(): number;
  /** Shared clock in ms (server time when online, the device clock otherwise): timetables every client agrees on. */
  now(): number;
  player: {
    pos: THREE.Vector3;
    facing(): number;
    body(): Humanoid | null;
    seated(): Seat | null;
    sit(seat: Seat): void;
    /** `inPlace`: clear the seat without moving the player (before a door, a trip…). */
    standUp(inPlace?: boolean): void;
    place(x: number, z: number, yaw: number): void;
  };
  mode(): GameMode;
  /** 'menu' and 'busy' lock movement; 'play' gives it back. */
  setMode(m: GameMode): void;
  /** Bottom sheet of choices; `extraHtml` (trusted markup built by the module) goes between the subtitle and the list. */
  menu(title: string, subtitle: string, items: MenuItem[], extraHtml?: string): void;
  /**
   * The next-step place to walk to, in the current hub (way-finding marker and goal compass, src/ui/worldMarkers.ts):
   * the walking destination when one is set, else the person of the suggested story beat, else (first job) the nearest
   * Tiak Tiak pick-up; null when there is none.
   */
  guide(): { name: string; x: number; z: number } | null;
  toast(msg: string): void;
  save(): void;
  /**
   * Walkable interior of the current hub behind `door` (built by the module; hidden until entered). Called again for the
   * same door, it replaces the previous interior (seats, meshes; the player inside stays in the new one).
   */
  addInterior(door: Interactable, int: Interior): void;
  enter(doorId: string): void;
  exit(): void;
  /** Set (or clear) the city's walking marker towards an interactable of the current hub (the places directory's marker). */
  walkTo(id: string | null): void;
  /**
   * Go to another hub: a short fade with `label`, the hub built (modules' hubLoaded run, a ride may seat the player in
   * its vehicle there), the player at `at` or the hub's spawn. Charges nothing: the caller has taken any fare.
   */
  travel(dest: HubId, at?: { x: number; z: number; yaw: number }, label?: string): void;
}

/** A gameplay module: hooks are called by main.ts in this order every hub / frame. */
export interface GameModule {
  name: string;
  /** Once, when the game starts (before the first hub). */
  init?(ctx: GameCtx): void;
  /** After a hub is built and the shared registries were reset: register places, seats, targets, interiors here. */
  hubLoaded?(ctx: GameCtx, hub: HubWorld): void;
  /** Every frame after the activity runner, before the interaction focus. */
  update?(ctx: GameCtx, dt: number): void;
  /** The player entered or left an interior (space = new interaction space). */
  spaceChanged?(ctx: GameCtx, space: string): void;
  /**
   * A space of the module's own the player is in right now (a vehicle id while riding), or null. While set, it is the
   * interaction space (targets, seats) and the presence / chat space; street-only content is not offered.
   */
  space?(ctx: GameCtx): string | null;
  /**
   * Presence / chat space while the module's interaction space is set, when it should differ (on one's own motorbike
   * the player stays visible to the street: 'street'). Null = same as `space`.
   */
  presenceSpace?(ctx: GameCtx): string | null;
  /**
   * Drive the camera this frame (passenger view, cut-scene…); return true when done, and the follow camera is skipped.
   * `drag` is the player's camera drag of this frame (mouse, touch, Q/R keys).
   */
  camera?(ctx: GameCtx, dt: number, drag: { yaw: number; pitch: number }): boolean;
  /**
   * Where to save the player right now instead of their position (e.g. riding: the pavement of the next stop), so a
   * reload never resumes inside a moving vehicle. Null = save the position as usual.
   */
  safePlace?(ctx: GameCtx): { x: number; z: number; yaw: number } | null;
  /** Entries merged into window.__dakar (?debug) for the checks. */
  debug?(ctx: GameCtx): Record<string, unknown>;
}

/**
 * Installed modules. Each lane adds its module here (one import + one entry), so main.ts stays the host only.
 */
export const MODULES: GameModule[] = [
  wolofModule, assetKitModule, transport, VenuesModule, moto, car, taxi, ESTATE_MODULE, arenaModule, arenaExteriorModule, arenaStreetsModule, weatherModule, streetVendorsModule, roadEventsModule,
  ambientLife,          // NPC & social life lane, after the places and seats the others register (docs/NPC_LIFE.md)
  worldMarkers(),       // UI lane: focus ring and way-finding pin, reads what the others registered (docs/UI.md)
];
