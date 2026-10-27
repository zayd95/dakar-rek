/**
 * LD2.0-D « Owner flagship villa » (docs/ld2/LD2_D.md): the numbers both lanes build to, so the street compound (lane V-E) and the villa's
 * three-level interior (lane V-S) always agree.
 *
 * Plan coordinates: metres from the lot's centre, +z toward the street (south), the frame of a floor plan (src/housing/plan.ts). The lot is the
 * Almadies block (1,1)'s lot 3, x −29…−7, z −29…−7 in the hub (src/world/builder.ts lotRect; src/economy/estate.ts VILLA_GATES): 22 × 22 m.
 */
export const VILLA_ID = 'villa_almadies';
/** The lot in the Almadies hub: its centre and size. A plan point (x, z) stands at (cx + x, cz + z) in the street. */
export const LOT = { cx: -18, cz: -18, w: 22, d: 22 } as const;
export interface Box { x0: number; x1: number; z0: number; z1: number }

// ------------------------------------------------------------------------------------------------ the street side (lane V-E)
/** The boundary wall, along the lot's edges (its height, m). */
export const WALL_H = 2.4;
/** The sliding gate in the street side of the wall (vehicles and people). */
export const GATE = { x0: 1.5, x1: 6.5, z: 11 } as const;
/** The front yard between the gate and the house: the driveway, the two parking bays, the garden and the path to the door. */
export const FRONT_YARD: Box = { x0: -11, x1: 11, z0: 4, z1: 11 };
/**
 * LD2.0-D round 2 (the owner's review, 27 Oct: « a main door different from the car garage door, and easy access without going behind the car »):
 * the main entrance for people, a door of its own in the street wall, in line with the house's front door (FRONT_DOOR.x), the car gate (GATE) left
 * to the cars. The walk from it to the front door (ENTRY_WALK) is kept clear: no bay, car, palm, bed or bollard on it.
 */
export const ENTRANCE = { x0: -3.8, x1: -2.2, z: 11 } as const;
export const ENTRY_WALK: Box = { x0: -4.0, x1: -2.0, z0: 4, z1: 11 };
/** Two parking bays side by side (2.6 × 5.4 m), a car facing the house (yaw π: toward −z). */
export const BAYS = [{ x: 3.1, z: 7.3, yaw: Math.PI }, { x: 6.1, z: 7.3, yaw: Math.PI }] as const;

// ------------------------------------------------------------------------------------------------ the house (lane V-S)
/** The house's outside walls (the interior's level 0 and 1 rooms stand inside, the roof terrace on top). */
export const HOUSE: Box = { x0: -8, x1: 8, z0: -5, z1: 4 };
/** The front door, in the house's street wall (its middle and width; it faces +z). The street « Entrer chez toi » stands in front of it. */
export const FRONT_DOOR = { x: -3, z: 4, width: 1.2 } as const;
/** Floor to floor (m), and the roof's parapet. */
export const STOREY = 3.4, PARAPET = 1.1;
/**
 * The interior's three levels. Plan space is unfolded: each level's rooms sit side by side along x (`dx`), so a piece of furniture keeps its
 * placement { x, z, rot } inside ±30 m (src/online/visitRules.ts REACH) and the save does not change. A plan point (x, z) of a level stands in the
 * interior at origin + (x − dx, y + 0.1, z) (origin: src/economy/placement.ts homeOrigin).
 */
export const LEVELS = [
  { id: 'rdc', name: 'Rez-de-chaussée', y: 0, dx: 0 },
  { id: 'etage', name: 'Étage', y: STOREY, dx: 20 },
  { id: 'toit', name: 'Toit-terrasse', y: 2 * STOREY, dx: -20 },
] as const;
export type VillaLevel = (typeof LEVELS)[number]['id'];
/** Where the stairs go up, from the ground floor to the roof (in house plan coordinates, the same on every level). */
export const STAIR_CORE: Box = { x0: 4.6, x1: 7.8, z0: -4.8, z1: 1.4 };
/** The back garden behind the house (level 0 of the interior): the pool and its deck. */
export const BACK_GARDEN: Box = { x0: -11, x1: 11, z0: -11, z1: -5 };
export const POOL: Box & { depth: number } = { x0: -6, x1: 4, z0: -9.6, z1: -6, depth: 1.4 };
/** The balconies of the first floor: over the front door, and over the pool deck. */
export const BALCONIES: readonly Box[] = [{ x0: -6, x1: 0, z0: 4, z1: 5.4 }, { x0: -8, x1: 2, z0: -6.6, z1: -5 }];
/** The helipad on the roof terrace: its centre and radius (the helicopter stands on it, its nose toward +z). */
export const HELIPAD = { x: -3, z: -0.5, r: 3.2 } as const;

/** A plan point of the street side in the Almadies hub. */
export const onLot = (x: number, z: number) => ({ x: LOT.cx + x, z: LOT.cz + z });
