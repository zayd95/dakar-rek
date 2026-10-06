import type * as THREE from 'three';
import type { HubId, Needs } from '../core/types';
import type { GameState } from '../core/state';

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
  special?: 'entrance' | 'prep' | 'training' | 'outfit' | 'emote' | 'watch';
}
export interface Interactable {
  id: string;
  name: string;
  kind: 'actions' | 'travel';
  x: number; z: number; radius: number;
  actions: Action[];
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
  skyDay: number;
  arena: { cx: number; cz: number; r: number } | null;
  ecurie: { cx: number; cz: number } | null;
  dispose(): void;
}
export interface RoadEdge { ax: number; az: number; bx: number; bz: number }
