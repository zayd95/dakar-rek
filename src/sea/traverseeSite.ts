import type * as THREE from 'three';

/**
 * « La traversée » (docs/TRAVERSEE.md): the Almadies' fishing quay becomes the Embarcadère de Ngor, where the player takes paying customers across to
 * the island of Ngor by pirogue or by chaloupe. This file is the contract between the world (the quay, the pontoon, the island, the boats' models:
 * src/world/builder.ts, src/world/boats.ts) and the crossing (src/venues/embarcadere.ts): where things are, in the Almadies' hub-local metres.
 *
 * Frames: the game's yaw faces +z at 0 (forward = (sin yaw, cos yaw)). A boat is built along its local z, bow at −z and stern (the motor) at +z, so a
 * boat at yaw Y points its bow at (−sin Y, −cos Y), and someone seated facing the bow has the seat yaw Y + π (as src/venues/beach.ts).
 */
export const TRAVERSEE_HUB = 'almadies' as const;

export interface P2 { x: number; z: number }
export interface Pose extends P2 { yaw: number }

export const TRAVERSEE_SITE = {
  /** Sea level: the Almadies' sea plane (src/world/builder.ts). A boat's origin floats here; the hull's own y offset is in its model. */
  seaY: 0.05,
  /** The place's anchor: the pier's end, inside the walkable bounds (the player stops at z −157). The crossing starts here. */
  anchor: { x: 30, z: -152 } as P2,
  /** The pier (x 27…33) and its walkway, extended over the beach to z −158; then the floating pontoon (x 28…32) out over the water to z −172 (the water starts at z −163). */
  pier: { x0: 27, x1: 33, z0: -158, z1: -103 },
  pontoon: { x0: 28, x1: 32, z0: -172, z1: -158 },
  /** Where the customers of the next crossing wait, on the pier, before boarding (up to 4 standing). */
  waiting: [{ x: 28.6, z: -145.5 }, { x: 31.4, z: -146 }, { x: 28.9, z: -148.2 }, { x: 31.1, z: -148.8 }] as P2[],
  /** From the waiting spots to the pontoon's edge beside the moored boat (and back up, for those who land at the quay). */
  quayPath: [{ x: 30, z: -147 }, { x: 30, z: -158 }, { x: 30.8, z: -167 }, { x: 32, z: -168.5 }] as P2[],
  /** The boat moored at the quay: alongside the pontoon's east edge, bow to the open sea (north, −z), its stern clear of the sand. The crossing brings it
   *  back to this pose (its west gunwale against the pontoon) whichever way it came in. */
  quayMooring: { x: 34.2, z: -168.5, yaw: 0 } as Pose,
  island: {
    /** The island of Ngor, offshore: its centre and its size (x by z). Its south shore is at z −300. Out of the walkable bounds: nobody walks on it but the customers. */
    centre: { x: 40, z: -335 } as P2,
    size: { x: 120, z: 70 },
    /** The island's landing jetty, from the sand (z −302) out over the water (z −286). */
    jetty: { x0: 34, x1: 38, z0: -302, z1: -286 },
    /** The boat moored at the island: alongside the jetty's east edge, its west gunwale against it. */
    mooring: { x: 40.2, z: -290, yaw: 0 } as Pose,
    /** From the jetty's edge beside the boat up onto the island, where the customers who land walk off (and those going back come from). */
    path: [{ x: 38, z: -290 }, { x: 36, z: -291 }, { x: 36, z: -302 }, { x: 38, z: -312 }] as P2[],
  },
  /** A way across that stays in open water, quay to island (the crossing may smooth it and turns the boat round at either end). */
  route: [{ x: 34.2, z: -168.5 }, { x: 36, z: -190 }, { x: 40, z: -240 }, { x: 41.5, z: -272 }, { x: 40.2, z: -290 }] as P2[],
} as const;

/** The deck a person walks on at (x, z) near the quay or the island's jetty: the pier's planks, the pontoon, or the island's jetty; null elsewhere. */
export function deckY(x: number, z: number): number | null {
  const S = TRAVERSEE_SITE, inBox = (b: { x0: number; x1: number; z0: number; z1: number }) => x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1;
  if (inBox(S.pontoon)) return 0.32;
  if (inBox(S.pier)) return 0.54;
  if (inBox(S.island.jetty)) return 0.45;
  return null;
}

export type BoatKind = 'pirogue' | 'chaloupe';
export const BOAT_KINDS: readonly BoatKind[] = ['pirogue', 'chaloupe'];

/** A seat in a boat, in the boat's frame: where the hips go (x, z), the sitting surface's height above the boat's origin (y), and the way the sitter faces. */
export interface LocalSeat { id: string; x: number; y: number; z: number; yaw: number }

/**
 * A boat's model (src/world/boats.ts builds it): one group to move and rock, in a few merged draw calls; the wake to show while it moves; the helm
 * (the player, at the motor) and the customers' seats; where a person steps aboard from a quay on its west side (−x).
 */
export interface BoatModel {
  kind: BoatKind;
  group: THREE.Group;
  /** The wake behind the stern: its material's opacity is the crossing's to set (0 when still). */
  wake: THREE.Mesh;
  length: number;
  beam: number;
  helm: LocalSeat;
  seats: LocalSeat[];
  /** On the boat's west gunwale (−x), mid-length: where a customer steps over from the pontoon or the island's jetty. */
  step: P2;
  /** Draw calls and triangles the model adds (one boat), for the performance budget. */
  cost: { draws: number; tris: number };
  dispose(): void;
}
