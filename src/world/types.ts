import type * as THREE from 'three';
import type { HubId, Needs } from '../core/types';
import type { GameState } from '../core/state';
import type { PersonLook } from '../actors/humanoid';

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
  special?: 'entrance' | 'prep' | 'training' | 'outfit' | 'emote' | 'watch' | 'enter' | 'exit' | 'combat' | 'combat_classe' | 'combat_entrainement' | 'jobs' | 'shop' | 'business';
}
export interface Interactable {
  id: string;
  name: string;
  kind: 'actions' | 'travel';
  x: number; z: number; radius: number;
  actions: Action[];
  /** Short greeting/context spoken by the host of this place. */
  description?: string;
  /** Set when this interactable is a recurring cast member. */
  npc?: string;
}
export interface Collider { x0: number; z0: number; x1: number; z1: number; h: number }

export interface HubWorld {
  id: HubId;
  group: THREE.Group;
  colliders: Collider[];
  interactables: Interactable[];
  bounds: { x0: number; x1: number; z0: number; z1: number };
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
  dispose(): void;
}
export interface RoadEdge { ax: number; az: number; bx: number; bz: number }
