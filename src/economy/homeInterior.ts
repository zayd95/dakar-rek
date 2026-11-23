import type * as THREE from 'three';
import type { Interior } from '../world/interiors';
import type { HomeLevel, HomeSpec } from './catalog';
import { planFor } from '../housing/plan';
import { buildApartment } from '../housing/apartment';

/**
 * Interiors of the homes above the starter room (apartment, house, villa, luxury residence): each is built from its floor plan (src/housing/plan.ts, the kit of
 * src/housing/kit) by the shell of src/housing/apartment.ts, finished by the level (`FINISH`: the standard finish) and by the plan's identity (`FloorPlan.look`).
 * Empty: the player furnishes it. Built off the street grid like every interior and entered through the home's street door (src/economy/estate.ts).
 * (Until 27 Oct the others were one open room with a counter and a shower: no home but « Ma chambre » is one now.)
 */
export interface Finish { lower: number; upper: number; h: number; door: number; trim: number; glass: boolean; kitchen: number; top: number }
const FINISH: Record<Exclude<HomeLevel, 'room'>, Finish> = {
  apartment: { lower: 0xd9c7a8, upper: 0xf3efe6, h: 2.9, door: 0x1e6fd9, trim: 0x8a7a6a, glass: false, kitchen: 0x8b6a47, top: 0xd9d2c4 },
  house: { lower: 0x9fc2a0, upper: 0xf6f1e7, h: 3.1, door: 0x2f8f4e, trim: 0x6e5a44, glass: false, kitchen: 0x6e4426, top: 0xe8e2d6 },
  villa: { lower: 0xeee9df, upper: 0xf7f5f0, h: 3.3, door: 0x6e4426, trim: 0xc9bfae, glass: true, kitchen: 0xf2f0ec, top: 0x2b2b2e },
  residence: { lower: 0xe6dfd2, upper: 0xfaf8f3, h: 3.4, door: 0x3a2416, trim: 0xc9a14a, glass: true, kitchen: 0x2b2b2e, top: 0xf1efe9 },
};

/** `spots`: where the kitchen and the shower are used from (world x, z; LD2.0-D: `y`, the height of their level's floor above the ground floor's). */
export interface HomeInterior { int: Interior; spots: { kitchen: { x: number; z: number; y?: number }; shower: { x: number; z: number; y?: number } }; ceiling: THREE.Object3D[] }

/**
 * `upgrades`: the home's upgrades that show in the shell (« peinture »: freshly painted walls). A home with a floor plan (src/housing/plan.ts
 * PLANS: the F2 of the Résidence Jàmm) is built from it, room by room (src/housing/apartment.ts); the others keep their one open room.
 */
export function buildHomeInterior(h: HomeSpec, ox: number, oz: number, hub: string, upgrades: readonly string[] = []): HomeInterior {
  const level = h.home.level === 'room' ? 'apartment' : h.home.level;
  const base = FINISH[level];
  const plan = planFor(h.id), ov = plan?.look;
  // the hub's identity over the level's finish (a plan's `look`, docs/kits/HOMES.md); a repainted home keeps its own paint over it
  const own: Finish = ov ? { ...base, lower: ov.dado ?? base.lower, upper: ov.wall ?? base.upper, door: ov.door ?? base.door, trim: ov.trim ?? base.trim } : base;
  const F = upgrades.includes('peinture') ? { ...own, lower: 0x7fb7c9, upper: 0xfbf3e2, trim: 0x2f6f86 } : own;
  // no home but « Ma chambre » (src/interact/interiors.ts) is one open room: a home without a floor plan is a mistake of the catalogue, not a smaller home
  if (!plan) throw new Error(`the home ${h.id} has no floor plan (src/housing/plan.ts PLANS, or registerPlan: a template of src/housing/kit)`);
  return buildApartment(plan, h, ox, oz, hub, F, upgrades);
}
