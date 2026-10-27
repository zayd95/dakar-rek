import * as THREE from 'three';
import type { Batch } from '../batch';
import type { KeepClear } from '../types';
import type { PersonLook } from '../../actors/humanoid';
import { makeDraw, planFrame, type CompoundKit, type CompoundPalette, type Draw, type Facing, type Frame } from '../villaCompound';

/**
 * LD2.0-E « The Almadies district » (docs/ld2/LD2_E.md): the contract the lanes build to. A district is a list of SITES (src/world/almadies/plan.ts),
 * each a building of a KIND on one, two or four lots; each kind has VARIANTS (the lanes' designs, houses.ts, villas.ts, hotels.ts, residences.ts) that
 * draw the site in the villa's style on the villa's drawing context (`makeDraw`, src/world/villaCompound.ts): plan coordinates, metres from the site's
 * origin, +z toward the street, x along it, y up, the ground at GROUND (0.1).
 *
 * Plan frame of a site: the street wall is at plan z = E (11 m in front of the origin, as the flagship's lot); the site reaches back to z = E − depth.
 * A 22 m lot's origin is its centre; a 46 m deep site's is 11 m behind its street edge (so the same street-side parts fit every site). The site's
 * boundary wall stands on its outer edge (the wall's collider 5 cm inside it).
 */
export type SiteKind = 'house' | 'villa' | 'hotel' | 'residence';
/** 1 lot: S (22 × 22), 2 lots side by side: M (46 × 22), the whole block: L (46 × 46). */
export type SiteSize = 'S' | 'M' | 'L';
export interface Rect { x0: number; z0: number; x1: number; z1: number }

/** The Almadies' grid (src/world/builder.ts: PITCH, BLK, ROAD, NB, HALF; tests/almadiesDistrict.test.ts checks they match). */
export const GRID = { pitch: 60, blk: 46, road: 14, nb: 4, lot: 22, gap: 2 } as const;
export const HALF = (GRID.nb * GRID.pitch + GRID.road) / 2;
/** The hub's ground (characters stand at 0.1) and the street wall's plan z. */
export const GROUND = 0.1;
export const E = 11;
/** A storey's height (m) and the roof's parapet, as the villa's (src/housing/villa.ts). */
export const STOREY = 3.4, PARAPET = 1.1, WALL_H = 2.4;

/** The palettes a site can wear: the villa's finishes in other proportions (ivory render, travertine, oak, bronze, glass, a coloured accent). */
export interface SitePalette {
  /** The render (the walls), a second render for the recessed or upper volumes, the slabs' edges. */
  render: number; render2: number; slab: number;
  /** The stone cladding and its joints, the wood (oak slats, decks), the bronze of the frames, the glass, the roof's finish. */
  stone: number; stoneDark: number; wood: number; frame: number; glass: number; roof: number;
  /** The accent (a feature wall, the awnings, the planters' flowers) and the lit sign's panel. */
  accent: number; board: number;
}
export type PaletteName = 'ivory' | 'sand' | 'greige' | 'oak' | 'terracotta' | 'azur';
export const PALETTES: Record<PaletteName, SitePalette> = {
  ivory:      { render: 0xf8f4ec, render2: 0xe9e2d4, slab: 0xfaf7f1, stone: 0xe4d2b2, stoneDark: 0xb7a482, wood: 0xb98a5a, frame: 0x2b2d2f, glass: 0x1d2a35, roof: 0xdad6cc, accent: 0xc9a14b, board: 0x14323a },
  sand:       { render: 0xefe3cc, render2: 0xe0cfae, slab: 0xf6efe0, stone: 0xd9bf93, stoneDark: 0xa98f66, wood: 0xa97848, frame: 0x3a3028, glass: 0x22303a, roof: 0xd5c8ae, accent: 0xb5532f, board: 0x3b2a1e },
  greige:     { render: 0xe7e3dc, render2: 0xcfcac1, slab: 0xf1eee8, stone: 0xc9c1b2, stoneDark: 0x9d9484, wood: 0x8c6a48, frame: 0x24272a, glass: 0x1b2730, roof: 0xc4c0b6, accent: 0x4f7f78, board: 0x1f2a2e },
  oak:        { render: 0xfaf8f3, render2: 0xece6da, slab: 0xffffff, stone: 0xdccdb4, stoneDark: 0xb0a086, wood: 0xc29561, frame: 0x30302f, glass: 0x213039, roof: 0xe2ded4, accent: 0x7a5434, board: 0x2c2018 },
  terracotta: { render: 0xf3e6d6, render2: 0xe8cdb0, slab: 0xf9f0e4, stone: 0xdcb88a, stoneDark: 0xa6845a, wood: 0x9c6f45, frame: 0x3b2c24, glass: 0x23303a, roof: 0xcdb596, accent: 0xc2663a, board: 0x4a2a1c },
  azur:       { render: 0xf4f7f8, render2: 0xdde7ea, slab: 0xfafcfc, stone: 0xd4cdbd, stoneDark: 0xa39c8b, wood: 0xb08458, frame: 0x22303a, glass: 0x17283a, roof: 0xd3d9db, accent: 0x2b86b0, board: 0x0e3a52 },
};

/** The sign board, the hub's own (src/world/builder.ts `addSign`): text, background and foreground colours (CSS), position, yaw, size. */
export type SignFn = (text: string, bg: string, fg: string, x: number, y: number, z: number, yaw: number, w?: number, h?: number) => void;
/** The hub's batches and helpers a site draws into (the villa's kit, plus the glass, the facade batch, the painted metal and the signs). */
export interface DistrictKit extends CompoundKit {
  /** `glass`: the windows' panes (they glow warm at night: src/world/almadies/night.ts); `glassDark`: glass that never glows (guards, balustrades, a roof's glass). */
  glass: Batch; glassDark: Batch; fac: Batch; metal: Batch; sign: SignFn;
}

export type GateSide = 'centre' | 'left' | 'right';
/** One building of the district. */
export interface Site {
  id: string;
  kind: SiteKind;
  /** Which design of its kind and size (the lanes' list, wrapped): neighbours differ. */
  variant: number;
  /** The block (i, j) and the lots it covers (0 north-west, 1 north-east, 2 south-west, 3 south-east): 1, 2 (a row) or 4. */
  block: readonly [number, number];
  lots: readonly number[];
  /** The lots' union in the hub (metres) and which way the street is (the north row's lots face north, the south row's south). */
  rect: Rect;
  facing: Facing;
  /** The plan mirrored (x → −x): the gate and the entrance on the other side. */
  mirror: boolean;
  storeys: number;
  palette: PaletteName;
  /** A hotel's or residence's name and the house number on the plaque. */
  name?: string;
  number: string;
  /** Where the car gate stands on the street wall (plan, before mirroring): the middle or toward one end. */
  gate: GateSide;
  /** Which of the site's side and back edges (plan: left −x, right +x, back −z) run by a road, when the rectangle is not on the hub's grid (the district viewer); the plan's own sites leave it out (`roadEdges` reads the grid). */
  roads?: Partial<Record<'left' | 'right' | 'back', boolean>>;
}
export const sizeOf = (s: Pick<Site, 'lots'>): SiteSize => s.lots.length === 1 ? 'S' : s.lots.length === 2 ? 'M' : 'L';
/** The site's extent (m): along the street and deep. */
export const extentOf = (s: Pick<Site, 'rect'>) => ({ w: s.rect.x1 - s.rect.x0, d: s.rect.z1 - s.rect.z0 });
/** The plan's frame in the hub for a site: its origin E metres inside the street edge, at the middle of it. */
export function siteFrame(s: Pick<Site, 'rect' | 'facing' | 'mirror'>): Frame {
  const cx = (s.rect.x0 + s.rect.x1) / 2, cz = (s.rect.z0 + s.rect.z1) / 2;
  const at = s.facing === 'south' ? { x: cx, z: s.rect.z1 - E } : s.facing === 'north' ? { x: cx, z: s.rect.z0 + E } : { x: cx, z: cz };
  return planFrame(at, s.facing, s.mirror);
}

/** What a site draws on: the villa's `Draw` (frame, palette, `box`, `slab`, `solid`, …) plus the district's batches, the site and its palette. */
export interface SiteDraw extends Draw {
  glass: Batch; glassDark: Batch; fac: Batch; metal: Batch; sign: SignFn;
  site: Site; p: SitePalette; w: number; depth: number;
}
export function siteDraw(kit: DistrictKit, site: Site): SiteDraw {
  const { w, d } = extentOf(site), p = PALETTES[site.palette];
  const palette: Partial<CompoundPalette> = { wall: p.render, coping: p.slab, plinth: p.stoneDark, stone: p.stone, stoneDark: p.stoneDark, teak: p.wood, frame: p.frame, glassDark: p.glass, bronze: p.frame, slab: p.slab, clad: p.stone, deck: p.stone, bloom: p.accent, door: p.wood };
  const base = makeDraw(kit, siteFrame(site), { w, d }, palette);
  return Object.assign(base, { glass: kit.glass, glassDark: kit.glassDark, fac: kit.fac, metal: kit.metal, sign: kit.sign, site, p, w, depth: d });
}

/**
 * The life a design puts on its ground floor (LD2.0-E round 3: « several buildings look impressive from a distance but need more life at ground level »). All in the
 * plan: a SEAT is registered with the hub's seats, where the player may sit and the city's people sit when the hour suits (src/social/ambientSpots.ts takes every free
 * seat); a PERSON is placed as the hub's builder-placed people are (a doorman, a waiter, a shopkeeper, a guard, someone on a balcony), drawn within the humanoid budget
 * nearest first. `yaw`: the way they face, in the plan (0 = toward the street, +z; π/2 = toward +x).
 */
export interface PlanSeat { x: number; z: number; yaw: number; kind: 'chair' | 'stool' | 'bench'; /** Height of the seat's top above the ground (a chair 0.49 on the 0.1 ground, a bench 0.55). */ top: number; /** The table in front, where a plate or a glass goes (plan x, height, plan z). */ table?: { x: number; y: number; z: number } }
export interface PlanPerson { x: number; z: number; yaw: number; clip: 'Idle' | 'Talk' | 'Sit'; /** Height of their feet above the ground when it is not the street's (a balcony's floor; a sitter's own: −0.05). */ y?: number; look?: PersonLook }
export interface SiteLife { seats?: PlanSeat[]; people?: PlanPerson[] }
/** What a site may put out (the humanoid budget is the game's: the nearest few are drawn, the rest wait): people and seats per site. */
export const LIFE_CAP: Record<SiteKind, { people: number; seats: number }> = { house: { people: 2, seats: 6 }, villa: { people: 2, seats: 8 }, hotel: { people: 10, seats: 44 }, residence: { people: 8, seats: 32 } };

/** What a builder hands back (the colliders and canopies are read from the draw itself). */
export interface SiteResult {
  /** Ground the street keeps open (a gate's apron, a porte-cochère); the hub's `keepClear`. */
  keepClear?: KeepClear[];
  /** Anything with its own materials (kept to a minimum: every mesh is a draw call). */
  group?: THREE.Object3D;
  /**
   * Where the hub's rooftop restaurant has its stair door (src/venues/rooftop.ts): a plan point 1.1 m in front of a face that looks to the street (+z), reachable from the pavement.
   * The venue dresses the door and hangs its sign there; without one it takes the first free side of the nearest tall building, which can be a back yard.
   */
  rooftopDoor?: { x: number; z: number };
  /** The seats and the people of the site's ground floor (see `SiteLife`). */
  life?: SiteLife;
}
export type SiteBuilder = (d: SiteDraw) => SiteResult | void;
/** One design of a kind: the lane's builder, its name for the catalogue, the site size it fits. */
export interface Variant { id: string; name: string; size: SiteSize; build: SiteBuilder }

/** Triangle budgets per site (medium quality, gross; the low preset draws about 60 %), docs/ld2/LD2_E.md decision 5. They include the open boundary (a railing on a plinth along the street and the road-side edges: about 250 triangles for a 22 m lot's street edge and one road side, 550 for two lots, 900 for a block) and the street life of round 3 (parked cars, scooters, menu boards, benches: about 150 to 700 more). */
export const TRI_CAP: Record<SiteKind, Partial<Record<SiteSize, number>>> = {
  house: { S: 1950 }, villa: { S: 3050 }, hotel: { M: 6000, L: 9900 }, residence: { S: 4200, M: 5600, L: 8900 },
};
