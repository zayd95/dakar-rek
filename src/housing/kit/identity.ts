import type { PlanLook } from '../plan';

/**
 * The identity a hub gives the same floor plan (docs/kits/HOMES.md): its colours, nothing else. A template (src/housing/kit/templates.ts) is a plan; an
 * identity is how a district wears it — Pikine's sand dados and blue doors, Mermoz's cool whites and teal, the Plateau's ochre and dark wood, the
 * Corniche's sea blue, the Almadies' travertine and walnut. The kit adds an identity to a plan as `FloorPlan.look` (src/housing/plan.ts `PlanLook`);
 * the shell reads it (src/housing/apartment.ts `wearIdentity`, src/economy/homeInterior.ts). Colours are 0xRRGGBB.
 */
export type IdentityId = 'pikine' | 'mermoz' | 'plateau' | 'corniche' | 'almadies';
export interface HomeIdentity {
  id: IdentityId;
  /** Where it belongs (a hub of the game, or the district it is drawn from). */
  hub: 'pikine' | 'mermoz' | 'plateau' | 'corniche' | 'almadies';
  name: string;
  /** One line for the listing and the docs. */
  about: string;
  look: PlanLook;
}

export const IDENTITIES: Record<IdentityId, HomeIdentity> = {
  // The Cité Jàmm's own finish: the shell's default (sand dado, warm white, blue doors): no override, so the F2 and the family house read as they always did.
  pikine: {
    id: 'pikine', hub: 'pikine', name: 'Cité Jàmm', about: 'Sable chaud, soubassement ocre, portes bleues : la cité telle qu’on la connaît.',
    look: {},
  },
  // Mermoz · Sacré-Cœur: the new middle-class blocks near the Corniche: bright cool whites, a soft teal band, deep-teal doors, pale large tiles.
  mermoz: {
    id: 'mermoz', hub: 'mermoz', name: 'Mermoz · Sacré-Cœur', about: 'Blancs frais, bandeau vert d’eau, portes bleu-vert, grands carreaux clairs : les immeubles de Mermoz et de Sacré-Cœur.',
    look: {
      wall: 0xf6f7f4, dado: 0x9cc7c4, door: 0x1f6f78, trim: 0xcfd6d4,
      kinds: {
        chambre: { upper: 0xe9f1f2, lower: 0xb9d3d6, floor: 0xc9a37a }, sdb: { upper: 0xf2f6f6, lower: 0x8fbfc2, floor: 0xdfe6e6 }, cuisine: { upper: 0xf4f6f2, lower: 0xe5ebe6, floor: 0xe9e6df },
        sejour: { floor: 0xe8e5de }, entree: { floor: 0xe3dfd6 }, manger: { upper: 0xeef3f1, lower: 0xcfe2df, floor: 0xe8e5de }, degagement: { floor: 0xcdb08a },
      },
    },
  },
  // The Plateau: old administrative buildings: ochre walls, a dark-wood dado, parquet, heavy dark doors.
  plateau: {
    id: 'plateau', hub: 'plateau', name: 'Plateau', about: 'Ocre, boiseries sombres, parquet : les vieux immeubles du Plateau.',
    look: {
      wall: 0xf1e2b8, dado: 0x9b6b3a, door: 0x4a2f1c, trim: 0x6a4a2e,
      kinds: {
        chambre: { upper: 0xf0dcae, lower: 0x8d5f35, floor: 0x8b5a2b }, sdb: { upper: 0xf2ecd8, lower: 0xb6a47a, floor: 0xd8d0b8 }, cuisine: { upper: 0xf3e8c8, lower: 0xe2d4a6, floor: 0xd9cfae },
        sejour: { floor: 0x8b5a2b }, entree: { floor: 0x7e5226 }, manger: { upper: 0xeed9a8, lower: 0x8d5f35, floor: 0x8b5a2b }, degagement: { floor: 0x7e5226 },
      },
    },
  },
  // The Corniche: the sea front: white and sea blue, navy doors, pale floors.
  corniche: {
    id: 'corniche', hub: 'corniche', name: 'Corniche', about: 'Blanc et bleu marine, bandeau bleu mer : les appartements face à l’océan.',
    look: {
      wall: 0xf8fafc, dado: 0x9ec4e6, door: 0x14548f, trim: 0xdbe6f0,
      kinds: {
        chambre: { upper: 0xeef4fa, lower: 0xb7d3ec, floor: 0xd6c3a2 }, sdb: { upper: 0xf3f8fb, lower: 0x86b6de, floor: 0xe3ebf0 }, cuisine: { upper: 0xf7f9fb, lower: 0xe3eef7, floor: 0xece9e2 },
        sejour: { floor: 0xeceae4 }, entree: { floor: 0xe6e3dc }, manger: { upper: 0xf0f6fb, lower: 0xc9def0, floor: 0xeceae4 }, degagement: { floor: 0xd6c3a2 },
      },
    },
  },
  // The Almadies: the villa's palette on the standard finish: warm white above a travertine dado, walnut doors, bronze trims, cream marble.
  almadies: {
    id: 'almadies', hub: 'almadies', name: 'Almadies', about: 'Blanc chaud, travertine, noyer et bronze, marbre crème : le style de la villa.',
    look: {
      wall: 0xf6f1e8, dado: 0xe6d5b8, door: 0x5c3d28, trim: 0xc9b79a,
      kinds: {
        chambre: { upper: 0xd9e2da, lower: 0xd9e2da, floor: 0xc79c6e }, sdb: { upper: 0xece8e0, lower: 0xece8e0, floor: 0xe9e4da }, cuisine: { upper: 0xf6f1e8, lower: 0xe6d5b8, floor: 0xeae3d6 },
        sejour: { floor: 0xf4ece0 }, entree: { floor: 0xf4ece0 }, manger: { upper: 0xe6ecef, lower: 0xe6ecef, floor: 0xf4ece0 },
      },
    },
  },
};
export const IDENTITY_IDS = Object.keys(IDENTITIES) as IdentityId[];
