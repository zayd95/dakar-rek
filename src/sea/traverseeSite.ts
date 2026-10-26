import type * as THREE from 'three';

/**
 * « La traversée » (docs/TRAVERSEE.md): the Almadies' fishing quay becomes the Embarcadère de Ngor, where the player takes paying customers across to
 * the island of Ngor by pirogue or by chaloupe. This file is the contract between the world (the quay, the beaches, the island, the boats' models:
 * src/world/builder.ts, src/world/boats.ts) and the crossing (src/venues/embarcadere.ts): where things are, in the Almadies' hub-local metres.
 *
 * Frames: the game's yaw faces +z at 0 (forward = (sin yaw, cos yaw)). A boat is built along its local z, bow at −z and stern (the motor) at +z, so a
 * boat at yaw Y points its bow at (−sin Y, −cos Y), and someone seated facing the bow has the seat yaw Y + π (as src/venues/beach.ts).
 */
export const TRAVERSEE_HUB = 'almadies' as const;

export interface P2 { x: number; z: number }
export interface Pose extends P2 { yaw: number }

/**
 * Version 2 (the owner's reference photos of Ngor, 26 Oct): the boats are boarded and left on the sand, as at Ngor. On the mainland both are pulled up
 * on the Almadies' beach east of the pier, bows on the sand and sterns in the water; at the island the boat runs its bow up the landing beach. The
 * customers cross the sand, wade into the shallows and climb in over the gunwale near the bow (life jackets on), and step off the same way. The pier
 * and the pontoon stay as the quay's scenery (other boats moor there); the island has no jetty.
 */
export const TRAVERSEE_SITE = {
  /** Sea level: the Almadies' sea plane (src/world/builder.ts). A boat's origin floats here; the hull's own y offset is in its model. */
  seaY: 0.05,
  /** The mainland's waterline: the Almadies' north beach (sand) ends and the sea begins at this z. */
  shoreZ: -163,
  /** The place's anchor: on the sand at the water's edge between the two beached boats, inside the walkable bounds (the player stops at z −157). */
  anchor: { x: 48.5, z: -154.5 } as P2,
  /** Scenery since version 2: the pier (x 27…33) carried over the beach to z −158, and the floating pontoon (x 28…32) out to z −172. */
  pier: { x0: 27, x1: 33, z0: -158, z1: -103 },
  pontoon: { x0: 28, x1: 32, z0: -172, z1: -158 },
  beach: {
    /** The two boats pulled up on the mainland beach, bows on the sand (toward the beach, +z: yaw π), sterns in the water. The crossing brings a boat
     *  back to its own pose. */
    pirogue: { x: 44, z: -167, yaw: Math.PI } as Pose,
    chaloupe: { x: 53, z: -166.5, yaw: Math.PI } as Pose,
    /** Where the customers of the next crossing wait, on the sand above the waterline (up to 4 standing). */
    waiting: [{ x: 42.5, z: -151 }, { x: 45, z: -150.2 }, { x: 51, z: -150.5 }, { x: 53.5, z: -151.2 }] as P2[],
    /** Kept clear for the beached boats, their pushing off and their turn: no static boat, rock, collider or mooring here. */
    clear: { x0: 37, x1: 60, z0: -200, z1: -158 },
  },
  island: {
    /** The island of Ngor, offshore: its centre and its size (x by z). Its south shore is at z −300. Out of the walkable bounds: nobody walks on it but the customers. */
    centre: { x: 40, z: -335 } as P2,
    size: { x: 120, z: 70 },
    /** The boat run up on the island's landing beach, bow first (yaw 0: bow north, toward the island), its bow on the sand at about z −299. */
    beached: { x: 40, z: -294, yaw: 0 } as Pose,
    /** Kept clear for the landing, the pushing off and the turn: no rock, jetty, moored boat or parasol here (the beach's sand slopes gently into the sea). */
    clear: { x0: 30, x1: 52, z0: -301, z1: -268 },
    /** From the shallows beside the bow up the beach among the parasols to the restaurants: where those who land walk off (and those going back come from). */
    path: [{ x: 38.6, z: -298 }, { x: 38.4, z: -302 }, { x: 36.5, z: -309 }, { x: 37.5, z: -317 }] as P2[],
    /** Where the island's customers going back wait, on the beach under the parasols (up to 3). */
    waiting: [{ x: 35.5, z: -304.5 }, { x: 38.2, z: -305.5 }, { x: 42.5, z: -304.8 }] as P2[],
    /**
     * The island's rooftop restaurant and lounge bar (the owner, 26 Oct: « an open rooftop restaurant with lounge bar at the island for food and
     * entertainment »): the landmark above the landing beach, where the path from the boat ends. A ground floor (the kitchen, a shaded front) on a level
     * plinth, an outside stair, and on the roof an open terrace under a light pergola and shade sails: dining tables, the lounge's low sofas, the bar
     * along the back, the DJ's corner, a balustrade, plants, and strings of warm bulbs lit at night. It faces the sea (+z), seen from the boat arriving.
     *
     * Heights: the building stands level at ngorGroundY at its box's centre (src/world/ngor.ts); the roof terrace's floor is `roofY` above that. Every
     * pose below is on the roof terrace (y = that floor), in hub-local metres; a pose's yaw is the way the person faces. The world builds the furniture
     * to these poses (src/world/ngor.ts), the crossing's venue seats its people on them (src/venues/embarcadere.ts and the crowd).
     */
    rooftop: {
      box: { x0: 36, x1: 50, z0: -331, z1: -320 },
      roofY: 3.4,
      /** Three tables of four, the diners facing across the table (a table's centre: the mean of its four seats). */
      dining: [
        ...[{ x: 44, z: -322.5 }, { x: 47.5, z: -322.5 }, { x: 47.5, z: -326 }].flatMap(t => [
          { x: t.x - 0.75, z: t.z - 0.45, yaw: Math.PI / 2 }, { x: t.x - 0.75, z: t.z + 0.45, yaw: Math.PI / 2 },
          { x: t.x + 0.75, z: t.z - 0.45, yaw: -Math.PI / 2 }, { x: t.x + 0.75, z: t.z + 0.45, yaw: -Math.PI / 2 },
        ]),
      ] as Pose[],
      /** The lounge: a U of low sofas round a low table at (39, −323), open to the sea. */
      lounge: [
        { x: 37.4, z: -322.4, yaw: Math.PI / 2 }, { x: 37.4, z: -323.8, yaw: Math.PI / 2 }, { x: 39, z: -325, yaw: 0 },
        { x: 40.6, z: -323.8, yaw: -Math.PI / 2 }, { x: 40.6, z: -322.4, yaw: -Math.PI / 2 },
      ] as Pose[],
      /** Standing at the bar (the counter along the back, x 39…47 at z −329.5), facing it; the barman behind it, facing the terrace. */
      bar: [{ x: 40, z: -328.6, yaw: Math.PI }, { x: 42, z: -328.6, yaw: Math.PI }, { x: 44, z: -328.6, yaw: Math.PI }, { x: 46, z: -328.6, yaw: Math.PI }] as Pose[],
      barman: { x: 43, z: -330.3, yaw: 0 } as Pose,
      /** The DJ's corner, between the bar and the lounge, facing the terrace; the evening's dancers in front of it. */
      dj: { x: 41.6, z: -327, yaw: 0 } as Pose,
      dance: [{ x: 41.6, z: -325.4 }, { x: 42.9, z: -325.0 }, { x: 43.4, z: -326.2 }, { x: 40.6, z: -326.0 }] as P2[],
      /** The outside stair up the west wall (from the beach side at z −320 up to the roof at z −330). */
      stair: { x0: 34.6, x1: 36, z0: -330, z1: -320 },
    },
  },
  /** A way across that stays in open water, between the two beaches (the crossing pushes off, turns the boat round and lands bow first at either end). */
  route: [{ x: 44, z: -182 }, { x: 43, z: -230 }, { x: 41, z: -272 }] as P2[],
} as const;

/** The deck a person walks on at (x, z) on the quay's scenery: the pier's planks or the pontoon; null elsewhere (sand, shallows: the world's ground). */
export function deckY(x: number, z: number): number | null {
  const S = TRAVERSEE_SITE, inBox = (b: { x0: number; x1: number; z0: number; z1: number }) => x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1;
  if (inBox(S.pontoon)) return 0.32;
  if (inBox(S.pier)) return 0.54;
  return null;
}
/** How deep a person wading off the mainland's beach stands (feet below the sea's surface), to wading depth at most; 0 on the sand. */
export const wadeDepth = (z: number) => Math.max(0, Math.min(0.45, (TRAVERSEE_SITE.shoreZ - z) * 0.18));

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
  /** Where a customer climbs in or out, in the boat's frame: on the gunwale near the bow (the end run up on the sand), from the shallows beside it. */
  step: P2;
  /** Draw calls and triangles the model adds (one boat), for the performance budget. */
  cost: { draws: number; tris: number };
  dispose(): void;
}
