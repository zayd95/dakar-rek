import type * as THREE from 'three';
import type { GameState } from '../core/state';
import type { Input } from '../core/input';
import type { Hud, MenuItem } from '../ui/hud';
import type { Interactions } from '../interact/system';
import type { Seat, Seats } from '../interact/seats';
import type { ActivityRunner } from '../activity/runner';
import type { Places } from '../activity/places';
import type { Inventory } from '../activity/inventory';
import type { HubWorld, Interactable } from '../world/types';
import type { Interior } from '../world/interiors';
import type { Humanoid } from '../actors/humanoid';
import type { FollowCamera } from '../actors/camera';
import { wolofModule } from '../i18n/module';

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
  menu(title: string, subtitle: string, items: MenuItem[]): void;
  toast(msg: string): void;
  save(): void;
  /** Walkable interior of the current hub behind `door` (built by the module; hidden until entered). */
  addInterior(door: Interactable, int: Interior): void;
  enter(doorId: string): void;
  exit(): void;
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
  /** Entries merged into window.__dakar (?debug) for the checks. */
  debug?(ctx: GameCtx): Record<string, unknown>;
}

/**
 * Installed modules. Each lane adds its module here (one import + one entry), so main.ts stays the host only.
 */
export const MODULES: GameModule[] = [wolofModule];
