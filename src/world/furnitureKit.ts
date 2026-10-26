import * as THREE from 'three';
import { KitBuilder, paintAtlas, type Paint, type Rect, type V3 } from './kitGeometry';
import { FW, FH, FUV, FPLAIN, drawFurnitureAtlas } from './furnitureAtlas';
import { floorSeatTop, type Seat, type SeatKind } from '../interact/seats';
import type { Clip } from '../actors/humanoid';
import type { Primitive } from '../activity/types';

/**
 * Furniture kit: home furniture in three visible quality tiers (docs/ASSET_REGISTER.md), procedural and our own.
 *
 *   const f = buildFurniture('sofa:premium');   // { group, footprint, seats, spec }
 *
 * Local frame: origin on the floor at the centre of the footprint, front = +z (the side people use or sit on),
 * back = −z (against the wall for `placement: 'wall'`). Place the group on the floor top (interiors: y 0.1).
 * Every piece is ONE mesh on a shared vertex-coloured material with a painted atlas (prints, rugs, screens, mirror,
 * tiles); the few pieces with real glass (premium shower and table) add one mesh on a shared glass material.
 * Each spec gives its seats (sit system) and a `use` anchor: where the person stands or sits, which way they face,
 * the activity verb and a clip — the home becomes usable (bed, shower, kitchen corner, sofa, TV, desk, chairs, table,
 * wardrobe, mirror, attaya, prayer mat…).
 */
export type Tier = 'basic' | 'better' | 'premium';
export const TIERS: readonly Tier[] = ['basic', 'better', 'premium'];
export type FurnitureType =
  | 'bed' | 'sofa' | 'armchair' | 'plasticChair' | 'woodenChair' | 'table' | 'lowTable' | 'desk' | 'tv' | 'wardrobe'
  | 'shower' | 'kitchen' | 'fan' | 'rug' | 'lamp' | 'shelf' | 'mirror' | 'attaya' | 'prayerMat' | HomeType;
/**
 * LD2.0-C « Walkable Homes », the furnishing upgrade (docs/ld2/LD2_C.md): dining sets, a kitchen table, appliances that suit a kitchen with built-in
 * fittings, bathroom pieces, floor and hanging lamps, bedside tables, dressers and wardrobes, pictures, a TV wall unit, music, plants, and outdoor and
 * poolside furniture. `bathMirror`, `towelRail` and `wallArt` hang on a wall, `pendant` from the ceiling (src/economy/catalog.ts `mount`).
 */
export type HomeType =
  | 'dining' | 'kitchenTable' | 'microwave' | 'waterDispenser' | 'cooker' | 'vanity' | 'bathMirror' | 'towelRail' | 'floorLamp' | 'pendant'
  | 'bedside' | 'dresser' | 'closet' | 'wallArt' | 'tvWall' | 'audio' | 'plant' | 'lounger' | 'parasol' | 'gardenSet'
  // the catalogue's second round (docs/ld2/LD2_C.md « Catalogue, round 2 »): comfort and prestige pieces…
  | 'pouf' | 'cornerSofa' | 'canopyBed' | 'console'
  // …and decoration
  | 'floorVase' | 'sculpture' | 'wallDecor' | 'screen' | 'lantern' | 'aquarium';
export const HOME_TYPES: readonly HomeType[] = ['dining', 'kitchenTable', 'microwave', 'waterDispenser', 'cooker', 'vanity', 'bathMirror', 'towelRail', 'floorLamp', 'pendant',
  'bedside', 'dresser', 'closet', 'wallArt', 'tvWall', 'audio', 'plant', 'lounger', 'parasol', 'gardenSet',
  'pouf', 'cornerSofa', 'canopyBed', 'console',
  'floorVase', 'sculpture', 'wallDecor', 'screen', 'lantern', 'aquarium'];
export const FURNITURE_TYPES: readonly FurnitureType[] = ['bed', 'sofa', 'armchair', 'plasticChair', 'woodenChair', 'table', 'lowTable', 'desk', 'tv', 'wardrobe', 'shower', 'kitchen', 'fan', 'rug', 'lamp', 'shelf', 'mirror', 'attaya', 'prayerMat', ...HOME_TYPES];
export type FurnitureId = `${FurnitureType}:${Tier}`;
export const FURNITURE_IDS: readonly FurnitureId[] = FURNITURE_TYPES.flatMap(t => TIERS.map(r => `${t}:${r}` as FurnitureId));

/**
 * A seat of a piece: `top` is the real height of the surface (seat, mattress, mat or cushion); `clip` the pose held
 * there (default Sit; Lie on beds, SitFloor on mats, rugs and floor cushions). furnitureSeats() turns it into an
 * interaction seat following src/interact/seats.ts (floor poses: top = surface + SIT_HIPS, origin on the surface).
 */
export interface FurnitureSeat { id: string; x: number; z: number; top: number; yaw: number; kind: SeatKind; clip?: Extract<Clip, 'Sit' | 'Lie' | 'SitFloor' | 'Kneel'> }
/** Poses whose origin stands on the surface instead of 0.48 m under it. */
const FLOOR_POSES = new Set<string>(['Lie', 'SitFloor', 'Kneel']);
export interface FurnitureUse {
  /** Where the person is (stands, sits or lies), local, and which way they face (0 = +z). */
  x: number; z: number; yaw: number;
  verb: Primitive;
  /** French label for the action button. */
  label: string;
  /** Body pose (Humanoid.hold): a seat's own clip (Lie on beds, SitFloor on mats and cushions), else Idle / Sit. */
  clip: Extract<Clip, 'Idle' | 'Sit' | 'Talk' | 'Lie' | 'SitFloor' | 'Kneel'>;
  /** Seat taken while using it, when there is one. */
  seat?: string;
}
export interface FurnitureSpec {
  id: FurnitureId; type: FurnitureType; tier: Tier; name: string;
  /** Size of the piece: w along x, d along z, h height (m), centred on the origin. */
  footprint: { w: number; d: number; h: number };
  /** 'wall': back against a wall; 'floor': flat on the floor, walkable (rugs, mats); 'free': anywhere. */
  placement: 'wall' | 'floor' | 'free';
  walkable: boolean;
  seats: FurnitureSeat[];
  use: FurnitureUse;
  budget: { tris: number; drawCalls: number };
}
export interface FurnitureBuild { group: THREE.Group; footprint: FurnitureSpec['footprint']; seats: FurnitureSeat[]; spec: FurnitureSpec }

export const FURNITURE_NAME: Record<FurnitureType, [string, string, string]> = {
  bed: ['Natte et matelas mousse', 'Lit en bois', 'Grand lit sculpté'],
  sofa: ['Banquette en bois', 'Canapé en tissu', 'Canapé de salon en velours'],
  armchair: ['Fauteuil en bois', 'Fauteuil rembourré', 'Fauteuil de salon doré'],
  plasticChair: ['Chaise en plastique', 'Fauteuil en plastique', 'Chaise en résine tressée'],
  woodenChair: ['Chaise en bois brut', 'Chaise vernie', 'Chaise sculptée'],
  table: ['Petite table et toile cirée', 'Table en bois verni', 'Table en verre'],
  lowTable: ['Petite table basse', 'Table basse', 'Table basse sculptée'],
  desk: ['Planche sur tréteaux', 'Bureau en bois', 'Grand bureau'],
  tv: ['Petite télé cathodique', 'Télé écran plat', 'Grand écran et meuble'],
  wardrobe: ['Armoire en toile', 'Armoire deux portes', 'Grande armoire à miroir'],
  shower: ['Coin douche au seau', 'Douche carrelée', 'Cabine de douche vitrée'],
  kitchen: ['Coin cuisine au réchaud', 'Plan de cuisine', 'Cuisine équipée'],
  fan: ['Petit ventilateur', 'Ventilateur sur pied', 'Ventilateur colonne'],
  rug: ['Natte en plastique', 'Tapis tissé', 'Grand tapis épais'],
  lamp: ['Lampe rechargeable', 'Lampe de chevet', 'Lampadaire doré'],
  shelf: ['Étagère en planches', 'Bibliothèque', 'Vitrine de salon'],
  mirror: ['Petit miroir', 'Miroir encadré', 'Grand miroir sur pied'],
  attaya: ['Attaya au fourneau', 'Attaya au gaz', 'Grand service à attaya'],
  prayerMat: ['Tapis de prière simple', 'Tapis de prière tissé', 'Tapis de prière en velours'],
  dining: ['Table et quatre chaises en plastique', 'Salle à manger en bois', 'Salle à manger en marbre'],
  kitchenTable: ['Table de cuisine et tabourets', 'Table de cuisine en bois', 'Bar de cuisine'],
  microwave: ['Micro-ondes sur desserte', 'Micro-ondes sur meuble', 'Colonne four et micro-ondes'],
  waterDispenser: ['Canari sur son support', 'Fontaine à eau', 'Fontaine inox'],
  cooker: ['Réchaud à gaz et marmite', 'Cuisinière à gaz', 'Piano de cuisson et hotte'],
  vanity: ['Lavabo sur colonne', 'Meuble vasque en bois', 'Double vasque en marbre'],
  bathMirror: ['Miroir rond', 'Armoire de toilette', 'Miroir lumineux'],
  towelRail: ['Porte-serviettes', 'Porte-serviettes en bois', 'Sèche-serviettes chromé'],
  floorLamp: ['Lampadaire à abat-jour', 'Lampadaire trépied', 'Lampadaire arc'],
  pendant: ['Suspension en osier', 'Suspension calebasse', 'Lustre doré'],
  bedside: ['Petite table et sa lampe', 'Table de chevet', 'Chevet sculpté'],
  dresser: ['Commode', 'Coiffeuse', 'Coiffeuse à triple miroir'],
  closet: ['Penderie ouverte', 'Armoire trois portes', 'Dressing'],
  wallArt: ['Affiche encadrée', 'Peintures sous-verre', 'Grande toile'],
  tvWall: ['Télé sur étagère', 'Meuble télé et étagères', 'Mur télé sculpté'],
  audio: ['Radiocassette', 'Chaîne hi-fi', 'Enceintes et platine'],
  plant: ['Plante en pot', 'Palmier d’intérieur', 'Jardinière de bougainvilliers'],
  lounger: ['Transat en toile', 'Bain de soleil tressé', 'Bain de soleil en teck'],
  parasol: ['Parasol de plage', 'Parasol en bois', 'Parasol déporté'],
  gardenSet: ['Salon de jardin en plastique', 'Salon de jardin en fer forgé', 'Salon de jardin en teck'],
  // the catalogue's second round: comfort and prestige
  pouf: ['Pouf en cuir', 'Pouf en wax', 'Pouf capitonné en velours'],
  cornerSofa: ['Banquette d’angle', 'Canapé d’angle en tissu', 'Grand canapé d’angle en velours'],
  canopyBed: ['Lit et sa moustiquaire', 'Lit à baldaquin en bois', 'Lit à baldaquin et voilages'],
  console: ['Console et vide-poche', 'Console en bois et miroir', 'Console en marbre et miroir doré'],
  // the catalogue's second round: decoration
  floorVase: ['Jarre en terre et herbes sèches', 'Vase en céramique et bouquet', 'Grand vase doré et orchidées'],
  sculpture: ['Statuette en bois sculpté', 'Sculpture en ébène sur socle', 'Bronze sur socle de marbre'],
  wallDecor: ['Paniers tressés au mur', 'Masques sculptés', 'Miroir soleil doré'],
  screen: ['Paravent en raphia', 'Paravent en bois sculpté', 'Paravent laqué et doré'],
  lantern: ['Lanterne tempête', 'Lanternes en fer ajouré', 'Candélabre en cristal'],
  aquarium: ['Bocal et poissons rouges', 'Aquarium sur meuble', 'Grand aquarium d’eau de mer'],
};

// ------------------------------------------------------------------------------------------------------------ materials
let mats: { body: THREE.MeshLambertMaterial; glass: THREE.MeshLambertMaterial } | null = null;
/** The two materials shared by every piece of furniture. */
export function furnitureMaterials() {
  if (mats) return mats;
  const { map, glow } = paintAtlas(FW, FH, 4, drawFurnitureAtlas);
  // screens, bulbs and lamp shades glow a little through the emissive atlas (always on: lit, plugged-in objects)
  const body = new THREE.MeshLambertMaterial({ vertexColors: true, map, emissive: glow ? 0xffffff : 0x000000, emissiveMap: glow, emissiveIntensity: 0.9 });
  const glass = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false });
  mats = { body, glass };
  for (const m of Object.values(mats)) m.userData.shared = true;
  return mats;
}

// ------------------------------------------------------------------------------------------------------------ palette
const C = {
  raw: 0xb48c5c, rawDark: 0x8f6a42, varnish: 0x8b5a32, varnishLight: 0xa8723f, dark: 0x4a2c18, darker: 0x2e1a0e, gold: 0xc9a043,
  chrome: 0xc9cdd2, white: 0xf2f2ee, cream: 0xefe6d2, black: 0x1c1c1e, grey: 0x8a8e93, cement: 0x9c968a, foam: 0xe9e2cf,
  bluePl: 0x2a7fd1, redPl: 0xc8322a, greenPl: 0x2e8b4c, alu: 0xb8bcc0, enamel: 0x2f6fb3, butane: 0x2a6fb3,
};
const W = 0xffffff;
interface Part { footprint: FurnitureSpec['footprint']; placement: FurnitureSpec['placement']; seats?: FurnitureSeat[]; use: FurnitureUse; walkable?: boolean }
type Maker = (b: KitBuilder, g: KitBuilder) => Part;
const legs4 = (b: KitBuilder, w: number, d: number, h: number, t: number, col: Paint, y0 = 0, z = 0) => { for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(t, h, t, sx * (w / 2 - t / 2), y0, z + sz * (d / 2 - t / 2), col); };
const seatOf = (id: string, x: number, z: number, top: number, kind: SeatKind, yaw = 0, clip?: FurnitureSeat['clip']): FurnitureSeat => ({ id, x, z, top, yaw, kind, ...(clip ? { clip } : {}) });
const standUse = (d: number, verb: Primitive, label: string, dist = 0.55): FurnitureUse => ({ x: 0, z: d / 2 + dist, yaw: Math.PI, verb, label, clip: 'Idle' });
const sitUse = (s: FurnitureSeat, verb: Primitive, label: string): FurnitureUse => ({ x: s.x, z: s.z, yaw: s.yaw, verb, label, clip: s.clip ?? 'Sit', seat: s.id });
/** Top face of a box painted with an atlas rect (prints, rugs, mats). */
const topRect = (r: Rect) => ({ py: { rect: r } });

/** Monobloc / resin chair (seat top ≈ 0.45). */
function plasticChair(b: KitBuilder, col: number, arms: boolean, weave = false) {
  const st = 0.45;
  b.slab(0.46, 0.04, 0.44, 0, st - 0.04, 0.02, col, weave ? { py: { rect: FUV.rattan } } : {});
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.beam([sx * 0.215, 0.02, sz * 0.215 + 0.02], [sx * 0.19, st - 0.03, sz * 0.18 + 0.02], 0.045, 0.045, col);
  b.at(0, st - 0.02, -0.19, 0, () => b.box(0.44, 0.44, 0.035, 0, 0, 0, col, weave ? { pz: { rect: FUV.rattan } } : {}), -0.16);
  if (arms) for (const sx of [-1, 1]) { b.beam([sx * 0.24, st + 0.2, -0.18], [sx * 0.24, st + 0.18, 0.18], 0.05, 0.035, col); b.beam([sx * 0.24, st + 0.18, 0.18], [sx * 0.215, st - 0.02, 0.2], 0.04, 0.04, col); }
  if (weave) b.slab(0.42, 0.06, 0.4, 0, st, 0.03, 0xd9cfb8, { py: { rect: FUV.cloth } });
}
/** Upholstered seat family (sofa / armchair): n seats of 0.62 m. */
function couch(b: KitBuilder, tier: Tier, n: number): { w: number; d: number; h: number; top: number } {
  if (tier === 'basic') {
    const w = 0.62 * n + 0.16, d = 0.72, top = 0.43;
    legs4(b, w, d, 0.28, 0.06, C.raw);
    b.slab(w, 0.06, d, 0, 0.28, 0, C.raw);
    b.box(w, 0.42, 0.06, 0, 0.34, -d / 2 + 0.03, C.raw);                                 // plank back
    for (const sx of [-1, 1]) b.box(0.07, 0.3, d, sx * (w / 2 - 0.035), 0.34, 0, C.rawDark);
    for (let k = 0; k < n; k++) { const x = (k - (n - 1) / 2) * 0.62; b.slab(0.58, 0.08, d - 0.12, x, 0.34, 0.03, 0xc96a2a); b.box(0.56, 0.32, 0.07, x, 0.42, -d / 2 + 0.09, 0xc96a2a); }
    return { w, d, h: 0.78, top };
  }
  // the catalogue's second round (lane K-C): the sofa in wax prints (« Canapé en tissu wax »), the armchair in tan buttoned leather (« Fauteuil en cuir »)
  if (tier === 'better') return n === 1 ? kcLeatherArmchair(b) : kcWaxSofa(b, n);
  // premium: Dakar salon — burgundy velvet, carved and gilded frame with a crest, rolled arms, cushions
  const w = 0.7 * n + 0.5, d = 0.95, top = 0.48, v = 0x9a2234;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl('y', 0.035, 0.05, 0.14, sx * (w / 2 - 0.12), 0.07, sz * (d / 2 - 0.1), C.gold, 6);
  b.slab(w, 0.1, d, 0, 0.13, 0, C.darker, { pz: { rect: FUV.carved, paint: C.dark } });
  b.slab(w - 0.06, 0.2, d - 0.06, 0, 0.23, 0, v, { py: { rect: FUV.velvet } });
  b.box(w, 0.62, 0.16, 0, 0.42, -d / 2 + 0.08, v, { pz: { rect: FUV.velvet } });
  b.box(w + 0.04, 0.1, 0.2, 0, 1.0, -d / 2 + 0.08, C.dark, { pz: { rect: FUV.carved, paint: C.gold }, py: { paint: C.gold } });
  b.box(0.5, 0.14, 0.12, 0, 1.08, -d / 2 + 0.08, C.gold, { pz: { rect: FUV.gold } });               // crest
  for (const sx of [-1, 1]) { b.slab(0.2, 0.36, d, sx * (w / 2 - 0.1), 0.42, 0, v, { px: { rect: FUV.velvet }, nx: { rect: FUV.velvet } }); b.cyl('z', 0.12, 0.12, d, sx * (w / 2 - 0.1), 0.8, 0, v, 8); b.cyl('z', 0.125, 0.125, 0.04, sx * (w / 2 - 0.1), 0.8, d / 2 - 0.02, C.gold, 8); }
  for (let k = 0; k < n; k++) { const x = (k - (n - 1) / 2) * 0.7; b.slab(0.66, 0.1, d - 0.28, x, 0.43, 0.1, dimC(v, 1.12), { py: { rect: FUV.velvet } }); b.at(x, 0.5, -d / 2 + 0.25, 0, () => b.box(0.58, 0.4, 0.14, 0, 0, 0, C.cream, { pz: { rect: FUV.wax2 } }), -0.2); }
  return { w: w + 0.06, d: d + 0.05, h: 1.22, top };
}
/**
 * Three floor cushions around an attaya set centred at z0 (front, left, right), each a cross-legged floor seat
 * facing the set: the attaya circle. `cushion(x, z)` draws one; returns the seats (the front one makes the tea).
 */
function attayaCircle(z0: number, top: number, cushion: (x: number, z: number) => void): FurnitureSeat[] {
  const spots: [string, number, number, number][] = [['front', 0, z0 + 0.52, Math.PI], ['left', -0.58, z0, Math.PI / 2], ['right', 0.58, z0, -Math.PI / 2]];
  return spots.map(([id, x, z, yaw]) => { cushion(x, z); return seatOf(id, x, z, top, 'floor', yaw, 'SitFloor'); });
}
const perTier = (f: (t: Tier) => Maker): Record<Tier, Maker> => ({ basic: f('basic'), better: f('better'), premium: f('premium') });
const dimC = (c: number, k: number) => new THREE.Color(c).multiplyScalar(k).getHex();

// ============================================================================================================ LD2.0-C: the furnishing upgrade
const K = {
  teak: 0x9a6a3c, teakDark: 0x7a4f2a, iron: 0x26262a, clay: 0xb5653a, clayDark: 0x8f4a28, leaf: 0x3f7a35, leaf2: 0x4c8a3c, leaf3: 0x2f6b2e,
  bloom: 0xd94a8c, bloom2: 0xe86aa6, steel: 0xc4c8cc, lacquer: 0xf1ece2, walnut: 0x5a3a22, granite: 0x55565a, taupe: 0xa89a86, ecru: 0xefe6d2,
  teal: 0x3f7f86, water: 0x6fb6e0, sky: 0x7fb0d8, towel: 0xf6f4ee,
};
const r3 = (v: number) => Math.round(v * 1000) / 1000;
/** Builds `draw` (drawn at the origin, facing +z) at (x, z), turned by `yaw` (0: facing +z). */
const placedAt = (b: KitBuilder, x: number, z: number, yaw: number, draw: () => void, y = 0) => b.at(x, y, z, yaw, draw);
/** The seat of a chair of a set standing at (x, z) and facing `yaw`, its own seat `local` m in front of its centre. */
const setSeat = (id: string, x: number, z: number, yaw: number, top: number, kind: SeatKind = 'chair', local = 0.03): FurnitureSeat =>
  seatOf(id, r3(x + Math.sin(yaw) * local), r3(z + Math.cos(yaw) * local), top, kind, r3(yaw));
/** Chairs of a set: [x, z, yaw] each, drawn by `draw`; returns their seats. */
function chairsAt(b: KitBuilder, spots: readonly (readonly [number, number, number])[], top: number, draw: (i: number) => void, kind: SeatKind = 'chair', local = 0.03): FurnitureSeat[] {
  return spots.map(([x, z, yaw], i) => { placedAt(b, x, z, yaw, () => draw(i)); return setSeat(`s${i}`, x, z, yaw, top, kind, local); });
}

/** Wooden dining chair with a wax cushion (seat top 0.54): x ±0.23, z −0.25 … 0.22. */
function woodChair(b: KitBuilder) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.04, 0.45, 0.04, sx * 0.19, 0, sz * 0.18, C.varnish);
  for (const sx of [-1, 1]) b.box(0.03, 0.03, 0.34, sx * 0.19, 0.16, 0, C.varnish);
  b.slab(0.46, 0.04, 0.44, 0, 0.45, 0, C.varnish, { py: { rect: FUV.wood, paint: C.varnishLight } });
  b.slab(0.42, 0.05, 0.4, 0, 0.49, 0.01, W, topRect(FUV.wax1));
  b.at(0, 0.49, -0.19, 0, () => {
    for (const sx of [-1, 1]) b.box(0.04, 0.5, 0.04, sx * 0.19, 0, 0, C.varnish);
    b.box(0.42, 0.09, 0.03, 0, 0.41, 0, C.varnish, { pz: { rect: FUV.wood, paint: C.varnishLight } }); b.box(0.42, 0.05, 0.025, 0, 0.24, 0, C.varnishLight);
  }, -0.08);
}
/** Upholstered dining chair, velvet and carved wood (seat top 0.52): x ±0.26, z −0.29 … 0.25. */
function velvetChair(b: KitBuilder) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { b.box(0.05, 0.4, 0.05, sx * 0.2, 0.02, sz * 0.2, C.dark); b.box(0.065, 0.02, 0.065, sx * 0.2, 0, sz * 0.2, C.gold); }
  b.slab(0.5, 0.05, 0.5, 0, 0.42, 0, C.dark, { pz: { rect: FUV.carved, paint: C.dark } });
  b.slab(0.46, 0.06, 0.46, 0, 0.46, 0.01, 0x9a2234, topRect(FUV.velvet));
  b.at(0, 0.47, -0.21, 0, () => {
    b.box(0.48, 0.64, 0.05, 0, 0, 0, C.dark, { pz: { rect: FUV.carved, paint: 0x6a3e22 } });
    b.box(0.38, 0.48, 0.03, 0, 0.08, 0.035, 0x9a2234, { pz: { rect: FUV.velvet } });
    b.box(0.52, 0.06, 0.07, 0, 0.62, 0, C.gold, { pz: { rect: FUV.gold } });
  }, -0.06);
}
/** Round plastic stool (seat top 0.47): r 0.16. */
function plasticStool(b: KitBuilder, col: number) {
  b.cyl('y', 0.15, 0.15, 0.04, 0, 0.45, 0, col, 12);
  for (let k = 0; k < 4; k++) { const a = Math.PI / 4 + k * Math.PI / 2; b.beam([Math.sin(a) * 0.1, 0.43, Math.cos(a) * 0.1], [Math.sin(a) * 0.14, 0.01, Math.cos(a) * 0.14], 0.035, 0.035, col); }
  b.cyl('y', 0.11, 0.11, 0.015, 0, 0.18, 0, col, 10);
}
/** Square wooden stool with a woven top (seat top 0.48): ±0.17. */
function woodStool(b: KitBuilder) {
  legs4(b, 0.3, 0.3, 0.44, 0.035, C.varnish);
  for (const s of [-1, 1]) { b.box(0.26, 0.025, 0.025, 0, 0.14, s * 0.13, C.varnish); b.box(0.025, 0.025, 0.26, s * 0.13, 0.14, 0, C.varnish); }
  b.slab(0.34, 0.04, 0.34, 0, 0.44, 0, C.varnish, { py: { rect: FUV.rattan } });
}
/** Bar stool, chrome and leather, with a low back on its −z side (seat top 0.77): r 0.2. */
function barStool(b: KitBuilder) {
  b.cyl('y', 0.2, 0.2, 0.02, 0, 0.01, 0, C.chrome, 14);
  b.cyl('y', 0.025, 0.025, 0.68, 0, 0.36, 0, C.chrome, 8);
  for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, c = (k + 1) * Math.PI / 4; b.beam([Math.sin(a) * 0.16, 0.32, Math.cos(a) * 0.16], [Math.sin(c) * 0.16, 0.32, Math.cos(c) * 0.16], 0.015, 0.015, C.chrome); }
  for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) b.beam([0, 0.32, 0], [Math.sin(a) * 0.16, 0.32, Math.cos(a) * 0.16], 0.012, 0.012, C.chrome);
  b.cyl('y', 0.19, 0.18, 0.07, 0, 0.735, 0, C.black, 14, { neg: true, pos: FUV.leather });
  b.beam([-0.12, 0.77, -0.13], [-0.12, 0.88, -0.15], 0.02, 0.02, C.chrome); b.beam([0.12, 0.77, -0.13], [0.12, 0.88, -0.15], 0.02, 0.02, C.chrome);
  b.box(0.32, 0.1, 0.04, 0, 0.86, -0.16, C.black, { pz: { rect: FUV.leather } });
}
/** Iron garden chair with a green cushion (seat top 0.49): x ±0.24, z −0.25 … 0.23. */
function ironChair(b: KitBuilder) {
  for (let k = 0; k < 4; k++) { const a = Math.PI / 4 + k * Math.PI / 2; b.beam([Math.sin(a) * 0.15, 0.44, Math.cos(a) * 0.15], [Math.sin(a) * 0.2, 0.012, Math.cos(a) * 0.2], 0.025, 0.025, K.iron); }
  b.cyl('y', 0.21, 0.21, 0.025, 0, 0.44, 0, K.iron, 14);
  b.cyl('y', 0.2, 0.2, 0.04, 0, 0.465, 0.01, 0x3f7a35, 14, { neg: false, pos: FUV.fabric });
  const hoop = (t: number): V3 => [Math.sin(t) * 0.2, 0.47 + Math.cos(t) * 0.4, -0.15 - Math.cos(t) * 0.05];
  for (let k = 0; k < 6; k++) { const t0 = -Math.PI / 2 + k * Math.PI / 6; b.beam(hoop(t0), hoop(t0 + Math.PI / 6), 0.022, 0.022, K.iron); }
  for (const x of [-0.1, 0, 0.1]) b.beam([x, 0.47, -0.15], hoop(Math.asin(x / 0.2)), 0.015, 0.015, K.iron);
}
/** Teak garden armchair with a cream cushion (seat top 0.46): x ±0.3, z −0.3 … 0.3. */
function teakChair(b: KitBuilder) {
  for (const sx of [-1, 1]) {
    b.box(0.05, 0.62, 0.05, sx * 0.26, 0, 0.25, K.teak); b.box(0.05, 0.42, 0.05, sx * 0.26, 0, -0.22, K.teak);
    b.box(0.08, 0.03, 0.6, sx * 0.26, 0.62, 0.0, K.teak, { py: { rect: FUV.wood, paint: K.teak } });
    b.box(0.04, 0.04, 0.44, sx * 0.26, 0.12, 0.02, K.teakDark);
  }
  b.slab(0.48, 0.04, 0.5, 0, 0.36, 0.02, K.teak);
  b.slab(0.46, 0.08, 0.46, 0, 0.4, 0.03, K.ecru, { py: { rect: FUV.fabric, paint: K.ecru } });
  b.at(0, 0.38, -0.22, 0, () => { for (const sx of [-1, 1]) b.box(0.05, 0.46, 0.04, sx * 0.24, 0, 0, K.teak); for (let k = 0; k < 4; k++) b.box(0.46, 0.06, 0.025, 0, 0.12 + k * 0.1, 0, K.teak); b.box(0.42, 0.34, 0.06, 0, 0.12, 0.05, K.ecru, { pz: { rect: FUV.fabric, paint: K.ecru } }); }, -0.12);
}
/** A garment on its hanger, hanging from a rail at height `top`, across it (along z): `len` long, `w` wide, printed with `rect`. */
function garment(b: KitBuilder, x: number, top: number, z: number, len: number, rect: Rect, w = 0.4) {
  b.beam([x, top - 0.05, z - w / 2 + 0.02], [x, top + 0.005, z], 0.008, 0.008, C.chrome); b.beam([x, top + 0.005, z], [x, top - 0.05, z + w / 2 - 0.02], 0.008, 0.008, C.chrome);
  b.box(0.045, len, w, x, top - 0.05 - len, z, W, { px: { rect }, nx: { rect }, pz: { rect }, nz: { rect } });
}
/** A round canopy of `n` panels from its apex down to a rim of radius `r` at `rim`: alternate panels in `c1` and `c2`, both faces, ribs below. */
function canopy(b: KitBuilder, rim: number, apex: number, r: number, n: number, c1: number, c2: number, ribs: number) {
  for (let k = 0; k < n; k++) {
    const a0 = k * Math.PI * 2 / n, a1 = (k + 1) * Math.PI * 2 / n, c = k % 2 ? c2 : c1;
    const A: V3 = [0, apex, 0], P: V3 = [Math.sin(a0) * r, rim, Math.cos(a0) * r], Q: V3 = [Math.sin(a1) * r, rim, Math.cos(a1) * r];
    b.toward([A, P, Q], [0, 1, 0], c); b.toward([A, Q, P], [0, -1, 0], dimC(c, 0.78));
    b.beam([0, apex - 0.3, 0], [P[0] * 0.96, rim - 0.015, P[2] * 0.96], 0.016, 0.016, ribs);
  }
}

// ------------------------------------------------------------------------------------------------ the catalogue's second round, comfort lane (K-C)
// Pouf, corner sofa, canopy bed, entrance console. The lane owns this block (and nothing else of this file but sofa:better and armchair:better).
// Its helpers are prefixed `kc` (the decoration lane writes its own beside them).
const KCP = {
  tan: 0xb26a33, velvet: 0x9a2234, sand: 0xd6c3a2, ochre: 0xd99a2b, iron: 0x2f6f86, cotton: 0xf4f1ea, clay: 0xa85a32,
  net: 0xeef4f6, sheer: 0xfff3e2, ivory: 0xf3ead6, orange: 0xc96a2a,
};
/** The part of an atlas rect from its bottom-left corner: `a` × `c` of it (each at most the whole). */
const kcPart = (r: Rect, a: number, c: number): Rect => [r[0], r[1], r[0] + (r[2] - r[0]) * Math.min(1, a), r[1] + (r[3] - r[1]) * Math.min(1, c)];
/**
 * A box upholstered in the print `r`, one tile of it covering `t` m: each face takes the part of the tile its size needs (a face longer than a
 * tile stretches it), so a long sofa built of seat-wide boxes keeps its motifs at one scale. `paint` tints it; `skip` leaves faces out.
 */
function kcPrint(b: KitBuilder, w: number, h: number, d: number, x: number, y: number, z: number, r: Rect, t: number, o: { paint?: number; skip?: readonly string[] } = {}) {
  const tint = o.paint ?? W, f = (k: string, a: number, c: number) => o.skip?.includes(k) ? { skip: true } : { rect: kcPart(r, a / t, c / t), paint: tint };
  b.box(w, h, d, x, y, z, tint, { pz: f('pz', w, h), nz: f('nz', w, h), px: f('px', d, h), nx: f('nx', d, h), py: f('py', w, d) });
}
/** A flat print over a rectangle from the corner `o` along the unit axes `u` (lu m) and `v` (lv m), facing u × v, in tiles of at most `t` m (a spread, a sheet's drop). */
function kcPanel(b: KitBuilder, o: V3, u: V3, lu: number, v: V3, lv: number, r: Rect, t: number, paint = W) {
  const nu = Math.max(1, Math.ceil(lu / t - 1e-6)), nv = Math.max(1, Math.ceil(lv / t - 1e-6));
  const P = (a: number, c: number): V3 => [o[0] + u[0] * a + v[0] * c, o[1] + u[1] * a + v[1] * c, o[2] + u[2] * a + v[2] * c];
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const a0 = i * t, a1 = Math.min(lu, a0 + t), c0 = j * t, c1 = Math.min(lv, c0 + t);
    b.quad(P(a0, c0), P(a1, c0), P(a1, c1), P(a0, c1), paint, kcPart(r, (a1 - a0) / t, (c1 - c0) / t));
  }
}
/** A spread or a sheet w wide and `len` long (centred on z), laid on a mattress whose top is `y`, its sides and foot falling by `drop`, printed with `r` in tiles of `t` m. */
function kcSpread(b: KitBuilder, w: number, len: number, z: number, y: number, drop: number, r: Rect, t: number, ground: number) {
  const x0 = -w / 2, z1 = z + len / 2, z0 = z - len / 2, th = 0.014;
  b.box(w, th, len, 0, y, z, ground, { py: { skip: true }, pz: { skip: true }, px: { skip: true }, nx: { skip: true } });
  kcPanel(b, [x0, y + th, z1], [1, 0, 0], w, [0, 0, -1], len, r, t);
  kcPanel(b, [-x0 + 0.002, y + th - drop, z1], [0, 0, -1], len, [0, 1, 0], drop, r, t); kcPanel(b, [x0 - 0.002, y + th - drop, z0], [0, 0, 1], len, [0, 1, 0], drop, r, t);
  kcPanel(b, [x0, y + th - drop * 0.5, z1 + 0.002], [1, 0, 0], w, [0, 1, 0], drop * 0.5, r, t);
}
/**
 * A cushion (a mattress, a pouf's top, an arm): a box w × h × d standing on y, centred on x, z, its top edges softened by a chamfer `c` all round.
 * The print `r` (one tile = t m) is laid from above over the top and the chamfers, and on each side; without one it is plain `paint`.
 */
function kcCushion(b: KitBuilder, w: number, h: number, d: number, x: number, y: number, z: number, paint: number, r: Rect | null, t = 0.66, c = 0.035) {
  const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2, y1 = y + h, ym = y1 - c;
  const uv = (p: V3): [number, number] => r ? [r[0] + (r[2] - r[0]) * Math.min(1, (p[0] - x0) / t), r[1] + (r[3] - r[1]) * Math.min(1, (z1 - p[2]) / t)] : [b.plain[0], b.plain[1]];
  const ring = (yy: number, k: number): V3[] => [[x0 + k, yy, z1 - k], [x1 - k, yy, z1 - k], [x1 - k, yy, z0 + k], [x0 + k, yy, z0 + k]];
  const lo = ring(ym, 0), hi = ring(y1, c), n: V3[] = [[0, 1, 1], [1, 1, 0], [0, 1, -1], [-1, 1, 0]];
  b.toward(hi, [0, 1, 0], paint, hi.map(uv));
  for (let k = 0; k < 4; k++) { const q = [lo[k], lo[(k + 1) % 4], hi[(k + 1) % 4], hi[k]]; b.toward(q, n[k], paint, q.map(uv)); }
  const side = (a: number) => r ? { rect: kcPart(r, a / t, (ym - y) / t), paint } : {};
  b.cuboid(x0, x1, y, ym, z0, z1, paint, { py: { skip: true }, pz: side(w), nz: side(w), px: side(d), nx: side(d) });
}
/**
 * A back cushion `w` wide, `h` high and `t` thick, the foot of its back face at (x, y, z), leaning back by `tilt` (its top goes back by h·sin tilt),
 * its soft face toward +z before turning by `rotY`.
 */
function kcBack(b: KitBuilder, x: number, y: number, z: number, w: number, h: number, t: number, paint: number, r: Rect | null, tile = 0.6, tilt = 0.2, rotY = 0) {
  b.at(x, y, z, rotY, () => kcCushion(b, w, t, h, 0, 0, -h / 2, paint, r, tile, 0.03), Math.PI / 2 - tilt);
}
/**
 * A round body of `seg` sides through `rings` ([radius, y], from the bottom up), centred on x, z: its side printed with `r` repeated `rep` times
 * round it (`seg` a multiple of `rep`; `paint` tints it), or plain; its top a disc printed with a rect, plain (true) or open (false).
 */
function kcDrum(b: KitBuilder, x: number, z: number, rings: readonly (readonly [number, number])[], seg: number, paint: number, r: Rect | null, rep = 1, top: Rect | boolean = true, topPaint = paint) {
  const y0 = rings[0][1], H = rings[rings.length - 1][1] - y0;
  const P = (i: number, rr: number, yy: number): V3 => { const a = i / seg * Math.PI * 2; return [x + Math.sin(a) * rr, yy, z + Math.cos(a) * rr]; };
  for (let k = 0; k + 1 < rings.length; k++) {
    const [ra, ya] = rings[k], [rb, yb] = rings[k + 1];
    for (let i = 0; i < seg; i++) {
      const q = [P(i, ra, ya), P(i + 1, ra, ya), P(i + 1, rb, yb), P(i, rb, yb)];
      if (!r) { b.poly(q, paint); continue; }
      const va = r[1] + (r[3] - r[1]) * (ya - y0) / H, vb = r[1] + (r[3] - r[1]) * (yb - y0) / H;
      const f0 = (i * rep / seg) % 1, u0 = r[0] + (r[2] - r[0]) * f0, u1 = r[0] + (r[2] - r[0]) * (f0 + rep / seg);
      b.poly(q, paint, [[u0, va], [u1, va], [u1, vb], [u0, vb]]);
    }
  }
  if (top === false) return;
  const [rt, yt] = rings[rings.length - 1], rect = top === true ? null : top;
  const cuv: [number, number] = rect ? [(rect[0] + rect[2]) / 2, (rect[1] + rect[3]) / 2] : [b.plain[0], b.plain[1]];
  const uv = (i: number): [number, number] => { if (!rect) return cuv; const a = i / seg * Math.PI * 2; return [cuv[0] + Math.sin(a) * (rect[2] - rect[0]) / 2, cuv[1] + Math.cos(a) * (rect[3] - rect[1]) / 2]; };
  for (let i = 0; i < seg; i++) b.poly([[x, yt, z], P(i, rt, yt), P(i + 1, rt, yt)], rect ? W : topPaint, [cuv, uv(i), uv(i + 1)]);
}
/**
 * A see-through net or voile (on the glass builder) hung from a small ring at the top, down through rings [rx, rz, y, box]: an ellipse, or with
 * `box` a rectangle (its corners kept, so the net falls straight round a bed's corners). `seg` is a multiple of 8.
 */
function kcVeil(g: KitBuilder, rings: readonly (readonly [number, number, number, boolean?])[], seg: number, col: number) {
  const sq = (i: number): [number, number] => {                                   // round the square [−1, 1]² from (0, 1) towards +x, in eight half sides
    const u = (i % seg) / seg * 8;
    return u < 1 ? [u, 1] : u < 3 ? [1, 2 - u] : u < 5 ? [4 - u, -1] : u < 7 ? [-1, u - 6] : [u - 8, 1];
  };
  const P = (i: number, r: readonly [number, number, number, boolean?]): V3 => {
    const [qx, qz] = sq(i); if (r[3]) return [qx * r[0], r[2], qz * r[1]];
    const a = Math.atan2(qx, qz); return [Math.sin(a) * r[0], r[2], Math.cos(a) * r[1]];
  };
  for (let k = 0; k + 1 < rings.length; k++) for (let i = 0; i < seg; i++) g.quad(P(i, rings[k + 1]), P(i + 1, rings[k + 1]), P(i + 1, rings[k]), P(i, rings[k]), col);
  const t = rings[0]; for (let i = 0; i < seg; i++) g.poly([[0, t[2], 0], P(i, t), P(i + 1, t)], col);
}
/**
 * The places of a corner sofa W × D whose seats are `s` deep and whose ends have arms `aw` wide: along the back run facing +z (from the corner
 * outwards), the corner itself facing into the room diagonally, then along the return on the −x side facing +x.
 */
function kcCornerSeats(W: number, D: number, s: number, aw: number, top: number, nMain: number, nRet: number): FurnitureSeat[] {
  const xa = -W / 2 + s, xb = W / 2 - aw, za = -D / 2 + s, zb = D / 2 - aw, zMain = r3(-D / 2 + s / 2 + 0.06), xRet = r3(-W / 2 + s / 2 + 0.06);
  const main = Array.from({ length: nMain }, (_, k) => seatOf(`s${k}`, r3(xa + (k + 0.5) * (xb - xa) / nMain), zMain, top, 'sofa'));
  const corner = seatOf(`s${nMain}`, r3(-W / 2 + s / 2 + 0.08), r3(-D / 2 + s / 2 + 0.08), top, 'sofa', Math.PI / 4);
  const ret = Array.from({ length: nRet }, (_, k) => seatOf(`s${nMain + 1 + k}`, xRet, r3(za + (k + 0.5) * (zb - za) / nRet), top, 'sofa', Math.PI / 2));
  return [...main, corner, ...ret];
}
/** The six feet of an L (the back run's ends, the return's ends, the inner corner), `i` in from the edges. */
const kcLFeet = (W: number, D: number, s: number, i: number): [number, number][] =>
  [[-W / 2 + i, -D / 2 + i], [W / 2 - i, -D / 2 + i], [W / 2 - i, -D / 2 + s - i], [-W / 2 + i, D / 2 - i], [-W / 2 + s - i, D / 2 - i], [-W / 2 + s - i, -D / 2 + s - i]];

/**
 * « Canapé en tissu wax » (sofa:better): the same frame as before (3 seats of 0.66 m, seat top 0.46), upholstered seat by seat in an indigo and
 * ochre wax so the motifs keep one scale, its seat cushions in the same print, its back cushions in two others.
 */
function kcWaxSofa(b: KitBuilder, n: number) {
  const w = 0.66 * n + 0.36, d = 0.88, top = 0.46, T = 0.6, R = FUV.waxA, xs = (k: number) => (k - (n - 1) / 2) * 0.66;
  legs4(b, w - 0.1, d - 0.1, 0.1, 0.05, C.dark);
  for (let k = 0; k < n; k++) {
    kcPrint(b, 0.66, 0.28, d, xs(k), 0.1, 0, R, T, { skip: ['px', 'nx'] });                            // the base under each seat
    kcPrint(b, 0.66, 0.48, 0.22, xs(k), 0.38, -d / 2 + 0.11, R, T, { skip: ['px', 'nx'] });             // its back
    kcCushion(b, 0.62, 0.09, d - 0.3, xs(k), 0.37, 0.1, W, R, T, 0.03);                                 // its seat cushion
    kcBack(b, xs(k), 0.46, -d / 2 + 0.3, 0.6, 0.42, 0.14, W, k % 2 ? FUV.waxB : FUV.wax1, 0.5, 0.18);    // its back cushion
  }
  for (const sx of [-1, 1]) {
    kcPrint(b, 0.18, 0.6, d, sx * (w / 2 - 0.09), 0.1, 0, R, T);                                      // the arms
    b.box(0.19, 0.02, 0.02, sx * (w / 2 - 0.09), 0.69, d / 2 - 0.005, KCP.ochre);                      // their ochre piping
  }
  b.box(w - 0.36, 0.02, 0.02, 0, 0.37, d / 2 - 0.005, KCP.ochre);
  b.at(-(w / 2 - 0.36), 0.5, -d / 2 + 0.4, 0.3, () => b.box(0.34, 0.32, 0.1, 0, 0, 0, 0x127a4c, { pz: { rect: FUV.waxB }, nz: { rect: FUV.waxB } }), -0.25);   // a throw cushion
  return { w, d, h: 0.9, top };
}
/** « Fauteuil en cuir » (armchair:better): a tan club armchair, its back buttoned, rolled arms studded with brass nails, a stitched seat cushion. */
function kcLeatherArmchair(b: KitBuilder) {
  const w = 0.85, d = 0.8, top = 0.46, L = KCP.tan, aw = 0.16;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl('y', 0.024, 0.032, 0.08, sx * (w / 2 - 0.09), 0.04, sz * (d / 2 - 0.09), C.darker, 6);
  b.box(w - 0.04, 0.29, d - 0.04, 0, 0.08, 0, L, { pz: { rect: FUV.leatherTan } });                    // the seat's base
  b.box(w, 0.66, 0.16, 0, 0.08, -d / 2 + 0.08, L);                                                      // the back, behind the arms
  b.box(w - 2 * aw, 0.34, 0.006, 0, 0.4, -d / 2 + 0.163, W, { pz: { rect: FUV.leatherTuft } });         // buttoned
  b.cyl('x', 0.08, 0.08, w, 0, 0.78, -d / 2 + 0.08, L, 10);                                             // its rolled top
  for (const sx of [-1, 1]) {
    b.box(aw, 0.52, d - 0.03, sx * (w / 2 - aw / 2), 0.08, 0.015, L, { pz: { rect: FUV.nailFront } });
    b.cyl('z', 0.08, 0.08, d - 0.03, sx * (w / 2 - 0.08), 0.6, 0.015, L, 10, { neg: true, pos: FUV.leatherTan });
  }
  kcCushion(b, w - 2 * aw - 0.01, 0.09, d - 0.22, 0, 0.37, 0.1, W, FUV.leatherTan, 0.55, 0.035);
  return { w, d, h: 0.86, top };
}

const ROUND2_COMFORT: Record<'pouf' | 'cornerSofa' | 'canopyBed' | 'console', Record<Tier, Maker>> = {
  // ------------------------------------------------------------------------------------------------ poufs: one low seat each
  pouf: {
    // Senegalese leather: a bulging drum, its stitched side embossed with red and green points, a rosette on top
    basic: b => {
      kcDrum(b, 0, 0, [[0.2, 0], [0.24, 0.07], [0.25, 0.2], [0.24, 0.33], [0.2, 0.4]], 16, W, FUV.poufSide, 4, FUV.poufTop);
      const s = seatOf('s0', 0, 0, 0.4, 'stool');
      return { footprint: { w: 0.5, d: 0.5, h: 0.4 }, placement: 'free', seats: [s], use: sitUse(s, 'sit', 'S’asseoir') };
    },
    // wax: a square pouf in one print, a softer cushion top in another, ochre piping, a button, little wooden feet
    better: b => {
      const s = 0.54;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl('y', 0.028, 0.022, 0.05, sx * 0.21, 0.025, sz * 0.21, C.varnish, 6);
      kcPrint(b, s, 0.31, s, 0, 0.05, 0, FUV.waxA, 0.54);
      for (const y of [0.05, 0.36]) for (const [a, c] of [[[-1, 1], [1, 1]], [[1, 1], [1, -1]], [[1, -1], [-1, -1]], [[-1, -1], [-1, 1]]] as const)
        b.beam([a[0] * s / 2, y, a[1] * s / 2], [c[0] * s / 2, y, c[1] * s / 2], 0.02, 0.02, KCP.ochre, false);
      kcCushion(b, s, 0.09, s, 0, 0.36, 0, W, FUV.waxB, 0.54, 0.045);
      b.cyl('y', 0.028, 0.028, 0.012, 0, 0.456, 0, KCP.ochre, 8);
      const st = seatOf('s0', 0, 0, 0.45, 'stool');
      return { footprint: { w: 0.56, d: 0.56, h: 0.46 }, placement: 'free', seats: [st], use: sitUse(st, 'sit', 'S’asseoir') };
    },
    // buttoned velvet: a burgundy drum tufted all round with gold buttons, a gold band and piping, four gilded feet
    premium: b => {
      for (let k = 0; k < 4; k++) {
        const a = Math.PI / 4 + k * Math.PI / 2, sa = Math.sin(a), ca = Math.cos(a);
        b.beam([sa * 0.2, 0.12, ca * 0.2], [sa * 0.235, 0.025, ca * 0.235], 0.034, 0.034, C.gold); b.blob(0.024, sa * 0.237, 0.024, ca * 0.237, C.gold);
      }
      b.cyl('y', 0.27, 0.275, 0.035, 0, 0.1275, 0, C.gold, 20, { neg: true, pos: false });
      kcDrum(b, 0, 0, [[0.28, 0.145], [0.296, 0.27], [0.287, 0.39]], 20, W, FUV.velvetTuft, 5, false);
      kcDrum(b, 0, 0, [[0.287, 0.39], [0.266, 0.44], [0.22, 0.462]], 20, KCP.velvet, null, 1, FUV.velvetTuft);
      b.cyl('y', 0.291, 0.291, 0.014, 0, 0.39, 0, C.gold, 20, { neg: false, pos: false });
      const s = seatOf('s0', 0, 0, 0.46, 'stool');
      return { footprint: { w: 0.6, d: 0.6, h: 0.47 }, placement: 'free', seats: [s], use: sitUse(s, 'sit', 'S’asseoir') };
    },
  },
  // ------------------------------------------------------------------------------------------------ corner sofas: an L, its back run along the wall (−z), its return on the −x side
  cornerSofa: {
    // a raw wood frame and plank backs, foam cushions in orange cotton, two wax pillows
    basic: b => {
      const W2 = 2.2, D = 1.7, s = 0.72, x0 = -W2 / 2, z0 = -D / 2, xc = x0 + s, zc = z0 + s, cu = KCP.orange, ys = 0.32, top = 0.44;
      for (const [x, z] of kcLFeet(W2, D, s, 0.04)) b.box(0.06, 0.26, 0.06, x, 0, z, C.raw);
      b.slab(W2, 0.06, s, 0, 0.26, z0 + s / 2, C.raw); b.slab(s, 0.06, D - s, x0 + s / 2, 0.26, zc + (D - s) / 2, C.raw);
      b.box(W2 / 2 - xc, 0.1, 0.03, (xc + W2 / 2) / 2, 0.17, zc - 0.015, C.rawDark); b.box(0.03, 0.1, D - s, xc - 0.015, 0.17, zc + (D - s) / 2, C.rawDark);
      b.box(W2, 0.4, 0.05, 0, 0.32, z0 + 0.025, C.raw, { pz: { rect: FUV.wood, paint: C.raw } });                       // plank backs
      b.box(0.05, 0.4, D - 0.05, x0 + 0.025, 0.32, 0.025, C.raw, { px: { rect: FUV.wood, paint: C.raw } });
      b.box(W2, 0.05, 0.08, 0, 0.72, z0 + 0.04, C.rawDark); b.box(0.08, 0.05, D - 0.08, x0 + 0.04, 0.72, 0.04, C.rawDark);
      b.box(0.05, 0.3, s, W2 / 2 - 0.025, 0.32, z0 + s / 2, C.rawDark); b.box(s, 0.3, 0.05, x0 + s / 2, 0.32, D / 2 - 0.025, C.rawDark);   // end boards
      const cw = s - 0.05, L = W2 / 2 - 0.05 - xc, R = D / 2 - 0.05 - zc, ch = top - ys;
      kcCushion(b, cw, ch, cw, x0 + 0.05 + cw / 2, ys, z0 + 0.05 + cw / 2, cu, FUV.fabric, 0.6, 0.03);
      for (let k = 0; k < 2; k++) kcCushion(b, L / 2 - 0.01, ch, cw, xc + L / 4 + k * L / 2, ys, z0 + 0.05 + cw / 2, cu, FUV.fabric, 0.6, 0.03);
      kcCushion(b, cw, ch, R - 0.01, x0 + 0.05 + cw / 2, ys, zc + R / 2, cu, FUV.fabric, 0.6, 0.03);
      const bh = 0.34, tl = 0.18, lean = bh * Math.sin(tl) + 0.06;
      kcBack(b, x0 + 0.05 + cw / 2 + 0.06, top, z0 + lean, cw - 0.14, bh, 0.12, cu, FUV.fabric, 0.6, tl);
      for (let k = 0; k < 2; k++) kcBack(b, xc + L / 4 + k * L / 2, top, z0 + lean, L / 2 - 0.04, bh, 0.12, cu, FUV.fabric, 0.6, tl);
      kcBack(b, x0 + lean, top, zc + R / 2, R - 0.04, bh, 0.12, cu, FUV.fabric, 0.6, tl, Math.PI / 2);
      kcBack(b, x0 + 0.24, top + 0.02, z0 + 0.24, 0.34, 0.3, 0.1, W, FUV.wax1, 0.4, 0.3, Math.PI / 4);                    // wax pillows
      kcBack(b, W2 / 2 - 0.3, top + 0.02, z0 + 0.2, 0.32, 0.28, 0.1, W, FUV.wax0, 0.4, 0.32, -0.25);
      const seats = kcCornerSeats(W2, D, s, 0.05, top, 2, 1);
      return { footprint: { w: W2, d: D, h: 0.8 }, placement: 'wall', seats, use: sitUse(seats[0], 'sit', 'S’asseoir') };
    },
    // upholstered in sand fabric, soft arms, its back cushions in three wax prints
    better: b => {
      const W2 = 2.6, D = 1.9, s = 0.86, bt = 0.2, aw = 0.18, x0 = -W2 / 2, z0 = -D / 2, xc = x0 + s, zc = z0 + s, f = KCP.sand, ys = 0.38, top = 0.48;
      for (const [x, z] of kcLFeet(W2, D, s, 0.07)) b.box(0.05, 0.1, 0.05, x, 0, z, C.dark);
      b.box(W2, 0.28, s, 0, 0.1, z0 + s / 2, f); b.box(s, 0.28, D - s, x0 + s / 2, 0.1, zc + (D - s) / 2, f);
      b.box(W2 / 2 - xc, 0.018, 0.018, (xc + W2 / 2) / 2, 0.37, zc + 0.002, KCP.ochre); b.box(0.018, 0.018, D - s - aw, xc + 0.002, 0.37, zc + (D - s - aw) / 2, KCP.ochre);   // a piping
      kcCushion(b, W2, 0.5, bt, 0, ys, z0 + bt / 2, f, null, 0.6, 0.06);                                                 // the backs
      kcCushion(b, bt, 0.5, D - bt, x0 + bt / 2, ys, z0 + bt + (D - bt) / 2, f, null, 0.6, 0.06);
      kcCushion(b, aw, 0.32, s, W2 / 2 - aw / 2, ys, z0 + s / 2, f, null, 0.6, 0.07);                                    // the arms
      kcCushion(b, s, 0.32, aw, x0 + s / 2, ys, D / 2 - aw / 2, f, null, 0.6, 0.07);
      const cs = s - bt, L = W2 / 2 - aw - xc, R = D / 2 - aw - zc, sc = dimC(f, 1.04);
      kcCushion(b, cs, top - ys, cs, x0 + bt + cs / 2, ys, z0 + bt + cs / 2, sc, FUV.fabric, 1.2, 0.04);
      for (let k = 0; k < 2; k++) kcCushion(b, L / 2 - 0.01, top - ys, cs, xc + L / 4 + k * L / 2, ys, z0 + bt + cs / 2, sc, FUV.fabric, 1.2, 0.04);
      kcCushion(b, cs, top - ys, R - 0.01, x0 + bt + cs / 2, ys, zc + R / 2, sc, FUV.fabric, 1.2, 0.04);
      const bh = 0.4, tl = 0.2, lean = bh * Math.sin(tl) + 0.005;
      kcBack(b, x0 + bt + cs / 2 + 0.08, top, z0 + bt + lean, cs - 0.2, bh, 0.15, W, FUV.waxA, 0.5, tl);
      [FUV.waxB, FUV.wax1].forEach((r, k) => kcBack(b, xc + L / 4 + k * L / 2, top, z0 + bt + lean, L / 2 - 0.05, bh, 0.15, W, r, 0.5, tl));
      kcBack(b, x0 + bt + lean, top, zc + R / 2, R - 0.06, bh, 0.15, W, FUV.waxA, 0.5, tl, Math.PI / 2);
      kcBack(b, x0 + bt + 0.24, top + 0.02, z0 + bt + 0.24, 0.34, 0.3, 0.11, W, FUV.wax0, 0.4, 0.3, Math.PI / 4);            // a throw pillow in the corner
      const seats = kcCornerSeats(W2, D, s, aw, top, 2, 1);
      return { footprint: { w: W2, d: D, h: 0.9 }, placement: 'wall', seats, use: sitUse(seats[0], 'sit', 'S’asseoir') };
    },
    // burgundy velvet on a carved base, buttoned backs under a carved gilt rail and its crest, rolled arms with gold caps, damask and velvet cushions
    premium: b => {
      const W2 = 3.0, D = 2.1, s = 0.95, bt = 0.17, aw = 0.22, x0 = -W2 / 2, z0 = -D / 2, xc = x0 + s, zc = z0 + s, v = KCP.velvet, ys = 0.43, top = 0.52;
      const cv = { rect: FUV.carved, paint: C.dark }, vt = { rect: FUV.velvet }, gc = { rect: FUV.carved, paint: C.gold };
      for (const [x, z] of kcLFeet(W2, D, s, 0.1)) b.cyl('y', 0.035, 0.05, 0.14, x, 0.07, z, C.gold, 6);
      b.slab(W2, 0.1, s, 0, 0.13, z0 + s / 2, C.darker, { pz: cv, px: cv }); b.slab(s, 0.1, D - s, x0 + s / 2, 0.13, zc + (D - s) / 2, C.darker, { pz: cv, px: cv });
      b.box(W2 / 2 - xc, 0.02, 0.012, (xc + W2 / 2) / 2, 0.22, zc + 0.006, C.gold); b.box(0.012, 0.02, D - s, xc + 0.006, 0.22, zc + (D - s) / 2, C.gold);
      b.slab(W2 - 0.04, 0.2, s - 0.04, 0, 0.23, z0 + s / 2, v, { py: vt }); b.slab(s - 0.04, 0.2, D - s, x0 + s / 2, 0.23, zc + (D - s) / 2 - 0.02, v, { py: vt });
      // buttoned backs, seat-wide panels so the buttons keep their size
      const nb = 5, sb = W2 / nb; for (let k = 0; k < nb; k++) kcPrint(b, sb, 0.57, bt, x0 + (k + 0.5) * sb, 0.41, z0 + bt / 2, FUV.velvetTuft, 0.5, { skip: k ? ['nx'] : [] });
      const nr = 3, sr = (D - bt) / nr; for (let k = 0; k < nr; k++) b.at(x0 + bt / 2, 0.41, z0 + bt + (k + 0.5) * sr, Math.PI / 2, () => kcPrint(b, sr, 0.57, bt, 0, 0, 0, FUV.velvetTuft, 0.5));
      b.box(W2 + 0.02, 0.1, bt + 0.04, 0, 0.98, z0 + bt / 2 + 0.01, C.dark, { pz: gc, py: { paint: C.gold } });            // carved gilt rails
      b.box(bt + 0.04, 0.1, D - bt - 0.04, x0 + bt / 2 + 0.01, 0.98, z0 + bt + (D - bt) / 2 - 0.02, C.dark, { px: gc, py: { paint: C.gold } });
      b.box(0.62, 0.13, 0.1, (xc + W2 / 2) / 2, 1.08, z0 + bt / 2 + 0.01, C.gold, { pz: { rect: FUV.carved, paint: C.gold } });   // the crest
      b.box(0.3, 0.08, 0.08, (xc + W2 / 2) / 2, 1.21, z0 + bt / 2 + 0.01, C.gold, { pz: { rect: FUV.gold } });
      b.blob(0.07, x0 + bt / 2, 1.11, z0 + bt / 2, C.gold, [1, 1, 1], 1);                                                  // a gilt ball on the corner
      // rolled arms with gold caps
      b.slab(aw, 0.34, s, W2 / 2 - aw / 2, ys, z0 + s / 2, v, { px: vt, nx: vt }); b.cyl('z', 0.12, 0.12, s - 0.02, W2 / 2 - 0.11, 0.78, z0 + s / 2 - 0.01, v, 8);
      b.cyl('z', 0.125, 0.125, 0.04, W2 / 2 - 0.11, 0.78, zc - 0.02, C.gold, 8);
      b.slab(s, 0.34, aw, x0 + s / 2, ys, D / 2 - aw / 2, v, { pz: vt, nz: vt }); b.cyl('x', 0.12, 0.12, s - 0.02, x0 + s / 2 + 0.01, 0.78, D / 2 - 0.11, v, 8);
      b.cyl('x', 0.125, 0.125, 0.04, xc - 0.02, 0.78, D / 2 - 0.11, C.gold, 8);
      // velvet seat cushions: the corner, three along the back, one along the return
      const cs = s - bt, L = W2 / 2 - aw - xc, R = D / 2 - aw - zc, sc = dimC(v, 1.1);
      kcCushion(b, cs, top - ys, cs, x0 + bt + cs / 2, ys, z0 + bt + cs / 2, W, FUV.velvet, 0.66, 0.035);
      for (let k = 0; k < 3; k++) kcCushion(b, L / 3 - 0.01, top - ys, cs, xc + (k + 0.5) * L / 3, ys, z0 + bt + cs / 2, W, FUV.velvet, 0.66, 0.035);
      kcCushion(b, cs, top - ys, R - 0.01, x0 + bt + cs / 2, ys, zc + R / 2, W, FUV.velvet, 0.66, 0.035);
      // back cushions: damask and buttoned velvet in turn, a damask one on the return, bolsters at the arms
      const bh = 0.4, tl = 0.2, lean = bh * Math.sin(tl) + 0.005;
      kcBack(b, x0 + bt + cs / 2 + 0.08, top, z0 + bt + lean, cs - 0.2, bh, 0.15, W, FUV.wax2, 0.5, tl);
      for (let k = 0; k < 3; k++) kcBack(b, xc + (k + 0.5) * L / 3, top, z0 + bt + lean, L / 3 - 0.06, bh, 0.15, k % 2 ? sc : W, k % 2 ? FUV.velvetTuft : FUV.wax2, 0.5, tl);
      kcBack(b, x0 + bt + lean, top, zc + R / 2, R - 0.06, bh, 0.15, W, FUV.wax2, 0.5, tl, Math.PI / 2);
      b.cyl('z', 0.09, 0.09, 0.42, W2 / 2 - aw - 0.1, top + 0.09, z0 + bt + 0.35, v, 8); for (const dz of [-0.215, 0.215]) b.cyl('z', 0.092, 0.092, 0.012, W2 / 2 - aw - 0.1, top + 0.09, z0 + bt + 0.35 + dz, C.gold, 8);
      const seats = kcCornerSeats(W2, D, s, aw, top, 3, 1);
      return { footprint: { w: W2, d: D, h: 1.3 }, placement: 'wall', seats, use: sitUse(seats[0], 'sit', 'S’asseoir') };
    },
  },
  // ------------------------------------------------------------------------------------------------ canopy beds: head to the wall (−z), lying along +z
  canopyBed: {
    // a painted iron bed, a foam mattress and a wax sheet, under a mosquito net hung from the ceiling (see-through: the glass builder)
    basic: (b, g) => {
      const w = 1.42, d = 2.0, ir = KCP.iron, top = 0.48;
      for (const sx of [-1, 1]) {
        b.cyl('y', 0.022, 0.022, 0.95, sx * w / 2, 0.475, -d / 2, ir, 6); b.cyl('y', 0.022, 0.022, 0.7, sx * w / 2, 0.35, d / 2, ir, 6);
        b.blob(0.032, sx * w / 2, 0.96, -d / 2, ir); b.blob(0.03, sx * w / 2, 0.71, d / 2, ir);
        b.box(0.04, 0.07, d, sx * (w / 2 - 0.02), 0.24, 0, ir);
      }
      for (const [z, y0, y1] of [[-d / 2, 0.42, 0.9], [d / 2, 0.4, 0.66]] as const) {
        b.cyl('x', 0.018, 0.018, w, 0, y1, z, ir, 6); b.cyl('x', 0.016, 0.016, w, 0, y0, z, ir, 6);
        for (let k = 1; k <= 5; k++) b.beam([-w / 2 + k * w / 6, y0, z], [-w / 2 + k * w / 6, y1, z], 0.014, 0.014, ir, false);
      }
      kcCushion(b, w - 0.06, 0.17, d - 0.08, 0, 0.31, 0, KCP.cotton, FUV.fabric, 0.7, 0.04);
      kcSpread(b, w - 0.04, 1.25, 0.33, top, 0.15, FUV.wax1, 0.6, 0x1f5aa8);                                                       // the wax sheet
      kcCushion(b, 0.62, 0.1, 0.34, 0, top, -d / 2 + 0.27, C.white, null, 0.6, 0.04);
      b.slab(0.5, 0.05, 0.3, 0.26, top + 0.012, d / 2 - 0.32, W, topRect(FUV.wax0));                                                  // a folded pagne
      b.beam([0, 2.09, 0], [0, 2.2, 0], 0.008, 0.008, C.white); b.cyl('y', 0.085, 0.085, 0.02, 0, 2.08, 0, C.white, 10, { neg: false, pos: false });
      kcVeil(g, [[0.085, 0.085, 2.08], [0.42, 0.56, 1.88], [0.66, 0.92, 1.4], [0.745, 1.045, 1.0, true], [0.745, 1.045, 0.3, true]], 16, KCP.net);
      const s = seatOf('bed', 0, 0.02, top, 'bed', 0, 'Lie');
      return { footprint: { w: 1.5, d: 2.1, h: 2.2 }, placement: 'wall', seats: [s], use: sitUse(s, 'sleep', 'Dormir') };
    },
    // a wooden four-poster: carved and turned posts, a canopy frame with carved pelmets, a carved headboard, a wax bedspread
    better: b => {
      const w = 1.62, d = 2.14, H = 2.24, wd = C.varnish, wl = C.varnishLight, top = 0.62;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const x = sx * (w / 2 - 0.045), z = sz * (d / 2 - 0.045);
        b.box(0.09, 0.5, 0.09, x, 0, z, wd);
        b.cyl('y', 0.055, 0.055, 0.04, x, 0.52, z, wl, 8);
        kcDrum(b, x, z, [[0.036, 0.54], [0.044, 0.9], [0.032, 1.5], [0.04, 1.84]], 8, wd, FUV.carved, 2, false);
        b.cyl('y', 0.052, 0.052, 0.04, x, 1.86, z, wl, 8);
        b.box(0.07, H - 0.09 - 1.88, 0.07, x, 1.88, z, wd);
        b.blob(0.042, x, H - 0.05, z, wl, [1, 1.15, 1]);
      }
      for (const sz of [-1, 1]) b.box(w, 0.07, 0.05, 0, H - 0.18, sz * (d / 2 - 0.045), wd);
      for (const sx of [-1, 1]) b.box(0.05, 0.07, d - 0.14, sx * (w / 2 - 0.045), H - 0.18, 0, wd);
      for (const sx of [-1, 1]) b.box(0.02, 0.16, d - 0.14, sx * (w / 2 - 0.012), H - 0.32, 0, wd, { px: { rect: FUV.carved, paint: wl }, nx: { rect: FUV.carved, paint: wd } });   // pelmets
      b.box(w - 0.14, 0.16, 0.02, 0, H - 0.32, d / 2 - 0.012, wd, { pz: { rect: FUV.carved, paint: wl } });
      b.slab(w - 0.1, 0.24, d - 0.1, 0, 0.2, 0, wd, { pz: { rect: FUV.carved, paint: wd }, px: { rect: FUV.wood, paint: wd }, nx: { rect: FUV.wood, paint: wd } });
      b.box(w - 0.09, 0.82, 0.06, 0, 0.44, -d / 2 + 0.05, wd, { pz: { rect: FUV.carved, paint: wl } });                                 // the headboard
      b.box(0.62, 0.12, 0.06, 0, 1.26, -d / 2 + 0.05, wd, { pz: { rect: FUV.carved, paint: wl } });
      b.box(w - 0.09, 0.2, 0.05, 0, 0.44, d / 2 - 0.05, wd, { pz: { rect: FUV.carved, paint: wl } });                                   // the footboard
      kcCushion(b, w - 0.14, 0.18, d - 0.2, 0, 0.44, 0, KCP.cotton, FUV.fabric, 0.7, 0.04);
      kcSpread(b, w - 0.12, 1.3, 0.33, top, 0.16, FUV.waxA, 0.5, 0x1f3f8a);                                                         // a wax bedspread
      for (const sx of [-1, 1]) kcBack(b, sx * 0.34, top, -d / 2 + 0.27, 0.6, 0.34, 0.12, sx < 0 ? C.white : KCP.ivory, null, 0.6, 0.55);
      kcBack(b, 0, top + 0.02, -d / 2 + 0.47, 0.44, 0.28, 0.1, W, FUV.wax0, 0.4, 0.45);
      const s = seatOf('bed', 0, 0.02, top, 'bed', 0, 'Lie');
      return { footprint: { w, d, h: H }, placement: 'wall', seats: [s], use: sitUse(s, 'sleep', 'Dormir') };
    },
    // gilded posts, a gilt pelmet and its crest over a velvet valance, sheer voiles tied back at each post and a sheer canopy (the glass builder),
    // a buttoned velvet headboard, a brocade spread, a velvet throw, pillows, cushions and a bolster
    premium: (b, g) => {
      const w = 1.96, d = 2.3, H = 2.44, gd = C.gold, top = 0.69;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const x = sx * (w / 2 - 0.055), z = sz * (d / 2 - 0.055);
        b.box(0.11, 0.48, 0.11, x, 0, z, C.darker, { px: { rect: FUV.carved, paint: gd }, nx: { rect: FUV.carved, paint: gd }, pz: { rect: FUV.carved, paint: gd }, nz: { rect: FUV.carved, paint: gd } });
        b.cyl('y', 0.065, 0.065, 0.05, x, 0.505, z, gd, 8, { neg: false, pos: true });
        kcDrum(b, x, z, [[0.042, 0.53], [0.052, 0.88], [0.038, 1.55], [0.048, 1.92]], 8, gd, FUV.carved, 2, false);
        b.cyl('y', 0.062, 0.062, 0.05, x, 1.945, z, gd, 8, { neg: true, pos: false });
        b.box(0.075, H - 0.1 - 1.97, 0.075, x, 1.97, z, gd);
        b.blob(0.05, x, H - 0.055, z, gd, [1, 1.1, 1]);
      }
      // the canopy: gilt rails, carved gilt pelmets, a velvet valance with a gold fringe under them, a crest over the head
      for (const sz of [-1, 1]) b.box(w, 0.07, 0.06, 0, H - 0.2, sz * (d / 2 - 0.055), gd);
      for (const sx of [-1, 1]) b.box(0.06, 0.07, d - 0.16, sx * (w / 2 - 0.055), H - 0.2, 0, gd);
      for (const sx of [-1, 1]) {
        b.box(0.025, 0.18, d - 0.16, sx * (w / 2 - 0.0125), H - 0.36, 0, gd, { px: { rect: FUV.carved, paint: gd }, nx: { rect: FUV.carved, paint: gd } });
        b.box(0.018, 0.14, d - 0.2, sx * (w / 2 - 0.03), H - 0.5, 0, KCP.velvet); b.box(0.022, 0.025, d - 0.2, sx * (w / 2 - 0.03), H - 0.525, 0, gd);
      }
      for (const sz of [-1, 1]) {
        b.box(w - 0.16, 0.18, 0.025, 0, H - 0.36, sz * (d / 2 - 0.0125), gd, { pz: { rect: FUV.carved, paint: gd }, nz: { rect: FUV.carved, paint: gd } });
        b.box(w - 0.2, 0.14, 0.018, 0, H - 0.5, sz * (d / 2 - 0.03), KCP.velvet); b.box(w - 0.2, 0.025, 0.022, 0, H - 0.525, sz * (d / 2 - 0.03), gd);
      }
      b.box(0.56, 0.16, 0.04, 0, H - 0.2, -d / 2 + 0.03, gd, { pz: { rect: FUV.gold } });
      // sheer voiles, two layers: from the canopy at each post, gathered at a gold tie-back, falling to the floor (none behind the head posts, against the wall)
      const tieY = 1.08, hang = H - 0.22;
      const voile = (x: number, z: number, ux: number, uz: number, nx: number, nz: number) => {
        // a panel in the plane through (x, z) along (ux, uz): its top 0.6 m wide, its waist at the tie-back, its hem 0.32 m; three pleats
        const at = (along: number, y: number, out: number): V3 => [x + ux * along + nx * out, y, z + uz * along + nz * out];   // `out`: a pleat's fold, outwards
        for (const [lay, top0] of [[0, 0.7], [-0.025, 0.55]] as const) for (let k = 0; k < 4; k++) {
          const a0 = k / 4, a1 = (k + 1) / 4, o0 = lay + (k % 2 ? 0.02 : 0), o1 = lay + (k % 2 ? 0 : 0.02);
          g.toward([at(top0 * a0, hang, o0), at(top0 * a1, hang, o1), at(0.08 * a1, tieY, lay + 0.01), at(0.08 * a0, tieY, lay + 0.01)], [nx, 0, nz], KCP.sheer);
          g.toward([at(0.08 * a0, tieY, lay + 0.01), at(0.08 * a1, tieY, lay + 0.01), at(0.36 * a1, 0.01, o1), at(0.36 * a0, 0.01, o0)], [nx, 0, nz], KCP.sheer);
        }
        b.box(0.05, 0.05, 0.05, x + ux * 0.035 - nx * 0.01, tieY - 0.025, z + uz * 0.035 - nz * 0.01, gd);
      };
      for (const sx of [-1, 1]) {
        const px = sx * (w / 2 - 0.015);
        voile(px, d / 2 - 0.015, 0, -1, sx, 0); voile(px, d / 2 - 0.015, -sx, 0, 0, 1); voile(px, -d / 2 + 0.12, 0, 1, sx, 0);
      }
      // the bed: a carved base trimmed in gold, a buttoned velvet headboard in a carved gilt frame, a low carved footboard
      b.slab(w - 0.14, 0.26, d - 0.14, 0, 0.18, 0, C.darker, { pz: { rect: FUV.carved, paint: C.dark }, px: { rect: FUV.carved, paint: C.dark }, nx: { rect: FUV.carved, paint: C.dark } });
      b.box(w - 0.12, 0.025, 0.012, 0, 0.42, d / 2 - 0.064, gd);
      b.box(w - 0.11, 1.18, 0.08, 0, 0.44, -d / 2 + 0.06, gd, { pz: { rect: FUV.carved, paint: gd } });
      const tuft = { pz: { rect: kcPart(FUV.velvetTuft, 1, 0.85) }, px: { skip: true }, nx: { skip: true }, py: { skip: true }, nz: { skip: true } };
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) b.box((w - 0.4) / 3, 0.44, 0.012, -(w - 0.4) / 3 + i * (w - 0.4) / 3, 0.64 + j * 0.44, -d / 2 + 0.106, W, tuft);
      b.box(0.62, 0.18, 0.08, 0, 1.62, -d / 2 + 0.06, gd, { pz: { rect: FUV.carved, paint: gd } }); b.blob(0.06, 0, 1.82, -d / 2 + 0.06, gd, [1, 1, 0.8]);
      b.box(w - 0.11, 0.3, 0.06, 0, 0.44, d / 2 - 0.1, C.darker, { pz: { rect: FUV.carved, paint: gd } });
      // the bedding: a deep mattress, a brocade spread over its foot, a velvet throw, pillows, buttoned cushions, a bolster
      kcCushion(b, w - 0.16, 0.24, d - 0.26, 0, 0.44, -0.01, KCP.cotton, FUV.fabric, 0.8, 0.05);
      kcSpread(b, w - 0.14, 1.3, 0.33, 0.68, 0.2, FUV.brocade, 0.55, KCP.ivory);
      b.slab(w - 0.12, 0.03, 0.42, 0, 0.696, d / 2 - 0.44, KCP.velvet); for (const dz of [-0.2, 0.2]) b.box(w - 0.12, 0.012, 0.025, 0, 0.726, d / 2 - 0.44 + dz, gd);   // a velvet throw
      for (const sx of [-1, 1]) { kcBack(b, sx * 0.42, top, -d / 2 + 0.32, 0.66, 0.42, 0.14, KCP.ivory, FUV.fabric, 0.7, 0.5); kcBack(b, sx * 0.38, top + 0.02, -d / 2 + 0.5, 0.56, 0.34, 0.12, C.white, null, 0.6, 0.42); }
      for (const sx of [-1, 1]) kcBack(b, sx * 0.24, top + 0.04, -d / 2 + 0.66, 0.36, 0.3, 0.1, W, FUV.velvetTuft, 0.45, 0.36, sx * 0.12);
      b.cyl('x', 0.085, 0.085, 0.86, 0, top + 0.09, -d / 2 + 0.84, KCP.ivory, 10, { neg: FUV.brocade, pos: FUV.brocade });
      for (const sx of [-1, 1]) b.cyl('x', 0.088, 0.088, 0.02, sx * 0.43, top + 0.09, -d / 2 + 0.84, gd, 10, { neg: false, pos: false });
      const s = seatOf('bed', 0, 0.02, top, 'bed', 0, 'Lie');
      return { footprint: { w, d, h: H }, placement: 'wall', seats: [s], use: sitUse(s, 'sleep', 'Dormir') };
    },
  },
  // ------------------------------------------------------------------------------------------------ entrance consoles, against a wall (a mirror on the wall above)
  console: {
    // a raw wood console, a calabash bowl for the keys, a phone, a little plant, a basket and sandals below, a key board on the wall
    basic: b => {
      const w = 0.8, d = 0.3, ht = 0.78;
      legs4(b, w - 0.04, d - 0.02, ht, 0.035, C.raw);
      b.slab(w - 0.06, 0.02, d - 0.06, 0, 0.15, 0, C.raw);
      b.box(w - 0.06, 0.08, d - 0.04, 0, ht - 0.08, 0, C.rawDark);
      b.slab(w, 0.03, d, 0, ht, 0, C.raw, { py: { rect: FUV.wood, paint: C.raw } });
      const t = ht + 0.03;
      b.cyl('y', 0.05, 0.11, 0.06, 0.17, t + 0.03, 0.0, W, 10, { neg: true, pos: false, side: FUV.calabash }); b.cyl('y', 0.095, 0.095, 0.004, 0.17, t + 0.05, 0, 0x5a3416, 10, { neg: false, pos: true });
      b.box(0.05, 0.012, 0.02, 0.15, t + 0.05, 0.03, C.chrome); b.box(0.035, 0.012, 0.025, 0.2, t + 0.05, -0.02, 0xd9322b);
      b.box(0.08, 0.012, 0.15, -0.06, t, 0.03, C.black, { py: { paint: 0x2a2f3a } });
      b.cyl('y', 0.05, 0.04, 0.09, -0.29, t + 0.045, -0.04, K.clay, 8); for (let k = 0; k < 4; k++) b.blob(0.04, -0.29 + (k % 2 ? 0.02 : -0.02), t + 0.12 + (k > 1 ? 0.04 : 0), -0.04 + (k % 3 - 1) * 0.02, [K.leaf, K.leaf2][k % 2]);
      b.cyl('y', 0.1, 0.09, 0.12, -0.16, 0.22, 0, W, 10, { neg: true, pos: false, side: FUV.rattan });
      for (const [x, c] of [[0.14, 0xd9322b], [0.25, 0xd9322b]] as const) { b.box(0.08, 0.02, 0.22, x, 0.17, 0.0, 0x3a2418); b.box(0.06, 0.012, 0.03, x, 0.19, 0.03, c); }
      b.box(0.34, 0.12, 0.02, 0.05, 1.22, -d / 2 + 0.01, C.raw, { pz: { rect: FUV.wood, paint: C.raw } });
      for (let k = 0; k < 3; k++) { const x = -0.06 + k * 0.11; b.beam([x, 1.26, -d / 2 + 0.02], [x, 1.27, -d / 2 + 0.06], 0.012, 0.012, C.chrome); if (k !== 1) { b.box(0.012, 0.07, 0.006, x, 1.18, -d / 2 + 0.055, C.chrome); b.box(0.03, 0.03, 0.01, x, 1.15, -d / 2 + 0.055, [0x1f5aa8, 0xf4c20d, 0xd9322b][k]); } }
      return { footprint: { w, d, h: 1.34 }, placement: 'wall', use: standUse(d, 'use', 'Vider ses poches', 0.55) };
    },
    // varnished wood, two drawers and a shelf, a wood-framed mirror on the wall, a clay incense burner, a woven bowl, a photo
    better: b => {
      const w = 1.1, d = 0.36, ht = 0.8, f = d / 2, wd = C.varnish, wl = C.varnishLight;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl('y', 0.018, 0.026, ht - 0.12, sx * (w / 2 - 0.05), (ht - 0.12) / 2, sz * (d / 2 - 0.05), wd, 6);
      b.box(w - 0.06, 0.12, d - 0.04, 0, ht - 0.12, 0, wd, { pz: { rect: FUV.wood, paint: wl } });
      b.box(0.006, 0.1, 0.005, 0, ht - 0.11, f - 0.0175, C.dark); for (const sx of [-1, 1]) b.cyl('z', 0.014, 0.014, 0.02, sx * 0.24, ht - 0.06, f - 0.01, C.gold, 8);
      b.slab(w - 0.1, 0.02, d - 0.08, 0, 0.14, 0, wd, { py: { rect: FUV.wood, paint: wl } });
      b.slab(w, 0.035, d, 0, ht, 0, wd, { py: { rect: FUV.wood, paint: wl } });
      for (const x of [-0.3, 0.3]) kcPrint(b, 0.26, 0.14, 0.22, x, 0.16, 0, FUV.rattan, 0.3);
      b.box(0.74, 0.86, 0.035, 0, 0.88, -f + 0.0175, wd, { pz: { rect: FUV.wood, paint: wd } }); b.box(0.62, 0.74, 0.006, 0, 0.94, -f + 0.038, W, { pz: { rect: FUV.mirror } });
      const t = ht + 0.035;
      b.cyl('y', 0.045, 0.06, 0.03, -0.34, t + 0.015, -0.02, KCP.clay, 8); b.cyl('y', 0.065, 0.06, 0.07, -0.34, t + 0.065, -0.02, KCP.clay, 8); b.blob(0.055, -0.34, t + 0.1, -0.02, dimC(KCP.clay, 0.9), [1, 0.6, 1]); b.blob(0.018, -0.34, t + 0.14, -0.02, K.clayDark);
      b.cyl('y', 0.06, 0.12, 0.05, 0.3, t + 0.025, 0.02, W, 10, { neg: true, pos: false, side: FUV.rattan }); b.cyl('y', 0.11, 0.11, 0.004, 0.3, t + 0.04, 0.02, 0x6b4a2e, 10, { neg: false, pos: true });
      b.at(0.02, t, -0.06, 0, () => b.box(0.15, 0.2, 0.015, 0, 0, 0, C.dark, { pz: { rect: FUV.art0 } }), -0.15);
      return { footprint: { w, d, h: 1.74 }, placement: 'wall', use: standUse(d, 'use', 'Se préparer', 0.55) };
    },
    // gilded and carved, a white marble top edged in gold, a tall gilt mirror and its crest, a brass incense burner on a gold tray, scent bottles
    premium: b => {
      const w = 1.3, d = 0.42, ht = 0.84, f = d / 2, gd = C.gold, cg = { rect: FUV.carved, paint: gd };
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const knee: V3 = [sx * (w / 2 - 0.07), ht - 0.12, sz * (d / 2 - 0.07)], mid: V3 = [sx * (w / 2 - 0.035), 0.42, sz * (d / 2 - 0.04)], foot: V3 = [sx * (w / 2 - 0.09), 0.035, sz * (d / 2 - 0.08)];
        b.beam(knee, mid, 0.07, 0.07, gd); b.beam(mid, foot, 0.055, 0.055, gd); b.blob(0.038, foot[0], 0.038, foot[2], gd, [1.2, 1, 1.2]); b.blob(0.04, mid[0], mid[1], mid[2], gd);
      }
      for (const sz of [-1, 1]) b.beam([-(w / 2 - 0.1), 0.16, sz * (d / 2 - 0.09)], [w / 2 - 0.1, 0.16, sz * (d / 2 - 0.09)], 0.03, 0.03, gd);
      b.beam([0, 0.16, -(d / 2 - 0.09)], [0, 0.16, d / 2 - 0.09], 0.03, 0.03, gd); b.cyl('y', 0.04, 0.06, 0.1, 0, 0.225, 0, gd, 8); b.blob(0.035, 0, 0.3, 0, gd, [1, 1, 1], 1);
      b.box(w - 0.08, 0.14, d - 0.06, 0, ht - 0.14, 0, gd, { pz: cg, px: cg, nx: cg });
      b.box(0.24, 0.1, 0.03, 0, ht - 0.21, f - 0.035, gd, { pz: { rect: FUV.gold } });
      b.slab(w, 0.045, d, 0, ht, 0, W, { py: { rect: FUV.marble }, pz: { rect: kcPart(FUV.marble, 1, 0.1) }, px: { rect: kcPart(FUV.marble, 0.5, 0.1) }, nx: { rect: kcPart(FUV.marble, 0.5, 0.1) } });
      b.cuboid(-w / 2, w / 2, ht - 0.006, ht + 0.006, f - 0.004, f + 0.008, gd, { bottom: true });
      b.box(0.92, 0.94, 0.05, 0, 0.92, -f + 0.025, gd, { pz: cg }); b.box(0.76, 0.78, 0.006, 0, 1.0, -f + 0.053, W, { pz: { rect: FUV.mirror } });
      // its pediment: a carved gilt gable and a gold medallion
      const zf = -f + 0.05, zb = -f, gy = 1.86, gh = 0.2, C2 = FUV.carved, cu = (x: number, y: number): [number, number] => [C2[0] + (C2[2] - C2[0]) * (x + 0.46) / 0.92, C2[1] + (C2[3] - C2[1]) * (y - gy) / 0.46];
      b.toward([[-0.46, gy, zf], [0.46, gy, zf], [0, gy + gh, zf]], [0, 0, 1], gd, [cu(-0.46, gy), cu(0.46, gy), cu(0, gy + gh)]);
      for (const sx of [-1, 1]) b.toward([[sx * 0.46, gy, zf], [0, gy + gh, zf], [0, gy + gh, zb], [sx * 0.46, gy, zb]], [sx * gh, 0.46, 0], dimC(gd, 1.08));
      b.cyl('z', 0.065, 0.065, 0.02, 0, gy + 0.085, zf + 0.01, gd, 12, { neg: false, pos: FUV.gold });
      const t = ht + 0.045;
      b.cyl('y', 0.16, 0.16, 0.012, 0.3, t + 0.006, 0.02, gd, 14, { neg: false, pos: FUV.gold });
      b.cyl('y', 0.035, 0.05, 0.04, 0.3, t + 0.032, 0.02, gd, 8); b.cyl('y', 0.075, 0.05, 0.07, 0.3, t + 0.087, 0.02, gd, 10); b.blob(0.07, 0.3, t + 0.125, 0.02, gd, [1, 0.75, 1], 1); b.blob(0.02, 0.3, t + 0.19, 0.02, gd);
      for (const [x, z, c, hh] of [[0.12, -0.05, 0xc98a2a, 0.12], [0.18, 0.06, 0xd98ab0, 0.09]] as const) { b.cyl('y', 0.032, 0.036, hh, x, t + hh / 2, z, c, 8); b.cyl('y', 0.014, 0.014, 0.04, x, t + hh + 0.02, z, gd, 6); }
      b.box(0.16, 0.08, 0.11, -0.34, t, 0.0, C.darker, { pz: cg, py: { paint: gd } });
      return { footprint: { w, d, h: 2.06 }, placement: 'wall', use: standUse(d, 'use', 'Se préparer', 0.55) };
    },
  },
};
// ------------------------------------------------------------------------------------------------ the catalogue's second round, decoration lane (K-D)
// Floor vases, sculptures, wall decoration, folding screens, lanterns and candelabra, aquariums. The lane owns this block.
// Each grade a clear step up: earth and straw (Simple), glaze, ebony, carved wood and iron (Confort), gold, bronze, marble, lacquer and crystal (Prestige).
// The figures are our own, in the manner of the Senegalese carvers (a woman at her mortar, a calabash carrier, a wrestler on guard): no real person or work.
type DecoType = 'floorVase' | 'sculpture' | 'wallDecor' | 'screen' | 'lantern' | 'aquarium';
/** The lane's makers, its palette and helpers kept inside (nothing of it clashes with the rest of the kit). */
function decoMakers(): Record<DecoType, Record<Tier, Maker>> {
  const D = {
    ebony: 0x241a16, sapwood: 0xc9a06a, bronze: 0x8a5a2c, bronzeDark: 0x5a3a1c, bronzeHi: 0xa8743a, stone: 0xe2d8c4, lacquer: 0x171213,
    iron: 0x2b2522, brass: 0xb8913c, candle: 0xf4ecd8, enamel: 0xb8322a, glass: 0xd6edf5, water: 0x5fb4dc, sea: 0x3f98e6, sand: 0xece0c4,
    gravel: 0xa89270, weed: 0x3f8a3a, weed2: 0x5aa84a, magenta: 0xcf2a7c,
  };
  const UPY = new THREE.Vector3(0, 1, 0);
  /** Part of an atlas rect: u from a to b, v from c to d (fractions; v from the image's bottom). */
  const subRect = (r: Rect, a: number, e: number, c = 0, d = 1): Rect => [r[0] + (r[2] - r[0]) * a, r[1] + (r[3] - r[1]) * c, r[0] + (r[2] - r[0]) * e, r[1] + (r[3] - r[1]) * d];
  /** A round limb, stalk or rod of n sides from a (radius ra) to c (radius rc), its ends capped. */
  function limb(b: KitBuilder, a: V3, c: V3, ra: number, rc: number, paint: Paint, n = 6, caps = true) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...c), dir = B.clone().sub(A), len = dir.length();
    if (len < 1e-6) return;
    const m = new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(UPY, dir.normalize()), new THREE.Vector3(1, 1, 1));
    b.with(m, () => b.cyl('y', ra, rc, len, 0, 0, 0, paint, n, { neg: caps, pos: caps }));
  }
  /** n flat panels round a vertical axis at (cx, cz), radius r0 at y0 to r1 at y1, each showing the whole `rect` (else plain `paint`). */
  function facets(b: KitBuilder, n: number, r0: number, r1: number, y0: number, y1: number, cx: number, cz: number, paint: Paint, rect?: Rect, phase = Math.PI / n) {
    const p = (t: number, y: number, r: number): V3 => [cx + r * Math.sin(t), y, cz + r * Math.cos(t)];
    for (let k = 0; k < n; k++) { const t0 = phase + k * Math.PI * 2 / n, t1 = t0 + Math.PI * 2 / n; b.quad(p(t0, y0, r0), p(t1, y0, r0), p(t1, y1, r1), p(t0, y1, r1), rect ? W : paint, rect); }
  }
  /** A turned profile ([y, r] pairs from the foot up) on a vertical axis at (x, z): stacked open cylinders, band i showing `rects[i]` on each face when given. */
  function turned(b: KitBuilder, x: number, z: number, prof: readonly (readonly [number, number])[], paint: Paint, seg: number, rects: (Rect | undefined)[] = []) {
    for (let i = 0; i + 1 < prof.length; i++) {
      const [y0, r0] = prof[i], [y1, r1] = prof[i + 1], rect = rects[i];
      if (rect) facets(b, seg, r0, r1, y0, y1, x, z, W, rect, 0);
      else b.cyl('y', r0, r1, y1 - y0, x, (y0 + y1) / 2, z, paint, seg, { neg: false, pos: false });
      if (i === 0) b.cyl('y', r0, r0, 0.002, x, y0 + 0.001, z, paint, seg, { neg: true, pos: false });
    }
  }
  /** The front half of an ellipsoid (a mask's face), radii rx, ry and depth rz toward +z, open at the back against the wall. */
  const halfShell = (b: KitBuilder, x: number, y: number, z: number, rx: number, ry: number, rz: number, paint: Paint) =>
    b.geometry(new THREE.SphereGeometry(1, 8, 7, 0, Math.PI), paint, x, y, z, [rx, ry, rz]);
  /** A fish swimming along x (dir 1: toward +x), `len` long and `tall` high (× len): its body, its tail and its back fin. */
  function fish(b: KitBuilder, x: number, y: number, z: number, len: number, body: number, fin: number, dir = 1, tall = 0.42) {
    b.blob(len / 2, x, y, z, body, [1, tall, 0.3]);
    const T: V3[] = [[x - dir * len * 0.4, y, z], [x - dir * len * 0.74, y + len * 0.24, z], [x - dir * len * 0.74, y - len * 0.24, z]];
    const F: V3[] = [[x - dir * len * 0.2, y + len * tall * 0.4, z], [x + dir * len * 0.12, y + len * tall * 0.42, z], [x - dir * len * 0.3, y + len * tall * 0.78, z]];
    for (const P of [T, F]) { b.toward(P, [0, 0, 1], fin); b.toward(P, [0, 0, -1], fin); }
  }
  /** A folding screen of n panels pw wide, zigzagging th off the line: `panel(i)` draws panel i in its own frame (across x, facing +z, on the floor). */
  function zigzag(b: KitBuilder, n: number, pw: number, th: number, panel: (i: number) => void) {
    const dx = pw * Math.cos(th), dz = pw * Math.sin(th);
    for (let i = 0; i < n; i++) { const za = i % 2 ? -dz / 2 : dz / 2; b.at(-n * dx / 2 + (i + 0.5) * dx, 0, 0, Math.atan2(2 * za, dx), () => panel(i)); }
  }
  /** A half disc of radius r standing on (x, y) at depth z, t thick (a crest): both faces (the front with `rect` tinted by `paint`, when given), its rim. */
  function crest(b: KitBuilder, x: number, y: number, z: number, r: number, t: number, paint: Paint, n = 8, rect?: Rect) {
    const pt = (k: number, zz: number): V3 => { const a = Math.PI * k / n; return [x + Math.cos(a) * r, y + Math.sin(a) * r, zz]; };
    const front: V3[] = [], back: V3[] = [];
    for (let k = 0; k <= n; k++) { front.push(pt(k, z + t / 2)); back.push(pt(k, z - t / 2)); }
    const uv = rect ? front.map(p => [rect[0] + (rect[2] - rect[0]) * (p[0] - x + r) / (2 * r), rect[1] + (rect[3] - rect[1]) * (p[1] - y) / r] as [number, number]) : undefined;
    b.toward(front, [0, 0, 1], paint, uv); b.toward(back, [0, 0, -1], paint);
    for (let k = 0; k < n; k++) { const a = Math.PI * (k + 0.5) / n; b.toward([pt(k, z + t / 2), pt(k + 1, z + t / 2), pt(k + 1, z - t / 2), pt(k, z - t / 2)], [Math.cos(a), Math.sin(a), 0], paint); }
  }
  /**
   * A carved mask hung on the wall (its back on z0): an oval face of hw × hh, `dep` deep, a brow, eyes, a long nose and a mouth; style 0 horns and
   * kaolin-white eyes and cheek lines, 1 a crest of three fins, 2 round ears and a beard.
   */
  function mask(b: KitBuilder, x: number, y: number, z0: number, hw: number, hh: number, dep: number, wood: number, accent: number, style: 0 | 1 | 2) {
    halfShell(b, x, y, z0, hw, hh, dep, wood);
    const zs = (dx: number, dy: number) => z0 + dep * Math.sqrt(Math.max(0, 1 - (dx / hw) ** 2 - (dy / hh) ** 2));
    const dark = dimC(wood, 0.42), light = dimC(wood, 1.18);
    b.box(hw * 1.3, hh * 0.08, 0.02, x, y + hh * 0.2, zs(0, hh * 0.24) - 0.012, light);
    for (const s of [-1, 1]) b.box(hw * 0.38, hh * 0.055, 0.014, x + s * hw * 0.36, y + hh * 0.05, zs(hw * 0.4, hh * 0.08) - 0.005, style === 0 ? 0xf2efe6 : dark);
    limb(b, [x, y + hh * 0.18, zs(0, hh * 0.18) - 0.004], [x, y - hh * 0.36, zs(0, -hh * 0.36) + 0.006], hw * 0.06, hw * 0.13, light, 4);
    b.box(hw * 0.42, hh * 0.09, 0.022, x, y - hh * 0.64, zs(0, -hh * 0.58) - 0.01, style === 1 ? dark : accent);
    if (style === 0) {
      for (const s of [-1, 1]) {
        limb(b, [x + s * hw * 0.45, y + hh * 0.82, z0 + dep * 0.45], [x + s * hw * 0.95, y + hh * 1.2, z0 + dep * 0.45], 0.017, 0.012, wood);
        limb(b, [x + s * hw * 0.95, y + hh * 1.2, z0 + dep * 0.45], [x + s * hw * 0.7, y + hh * 1.55, z0 + dep * 0.4], 0.012, 0.004, wood);
        for (const k of [0, 1]) b.box(hw * 0.3, 0.008, 0.008, x + s * hw * 0.55, y - hh * (0.18 + k * 0.12), zs(hw * 0.55, -hh * (0.18 + k * 0.12)) - 0.003, 0xf2efe6);
      }
    } else if (style === 1) {
      for (const k of [-1, 0, 1]) b.box(0.012, hh * (0.42 - Math.abs(k) * 0.12), dep * 0.7, x + k * hw * 0.42, y + hh * 0.8, z0 + dep * 0.36, dimC(wood, 0.85));
      for (const s of [-1, 1]) b.box(0.008, hh * 0.3, 0.006, x + s * hw * 0.55, y - hh * 0.25, zs(hw * 0.55, -hh * 0.25) - 0.002, dark);
    } else {
      for (const s of [-1, 1]) b.blob(hw * 0.28, x + s * hw * 1.05, y + hh * 0.05, z0 + dep * 0.3, wood, [0.6, 1, 0.6]);
      limb(b, [x, y - hh * 0.72, zs(0, -hh * 0.72) - 0.01], [x, y - hh * 1.2, z0 + dep * 0.55], hw * 0.2, hw * 0.06, dark, 4);
      b.box(hw * 1.1, 0.01, 0.01, x, y + hh * 0.5, zs(0, hh * 0.5) - 0.004, dark);
    }
  }
  /** A pierced iron lantern on (x, z), `s` its scale (s = 1: 0.74 m high), its lit body and dome, a ring on top. */
  function ironLantern(b: KitBuilder, x: number, z: number, s: number) {
    const pr = FUV.pierced;
    facets(b, 8, 0.11 * s, 0.1 * s, 0, 0.05 * s, x, z, D.iron);
    facets(b, 8, 0.1 * s, 0.092 * s, 0.05 * s, 0.07 * s, x, z, D.brass);
    for (let k = 0; k < 3; k++) facets(b, 8, 0.092 * s, 0.092 * s, (0.07 + k * 0.13) * s, (0.2 + k * 0.13) * s, x, z, D.iron, pr);
    facets(b, 8, 0.1 * s, 0.1 * s, 0.46 * s, 0.5 * s, x, z, D.brass);
    facets(b, 8, 0.1 * s, 0.035 * s, 0.5 * s, 0.62 * s, x, z, D.iron, subRect(pr, 0, 1, 0.3, 0.7));
    for (let k = 0; k < 8; k++) { const a = Math.PI / 8 + k * Math.PI / 4; b.box(0.012 * s, 0.39 * s, 0.012 * s, x + Math.sin(a) * 0.094 * s, 0.07 * s, z + Math.cos(a) * 0.094 * s, D.iron); }
    b.cyl('y', 0.035 * s, 0.02 * s, 0.05 * s, x, 0.645 * s, z, D.brass, 8, { neg: false, pos: true });
    b.blob(0.024 * s, x, 0.69 * s, z, D.brass);
    limb(b, [x - 0.03 * s, 0.7 * s, z], [x, 0.74 * s, z], 0.006 * s, 0.006 * s, D.iron, 4); limb(b, [x, 0.74 * s, z], [x + 0.03 * s, 0.7 * s, z], 0.006 * s, 0.006 * s, D.iron, 4);
  }
  /** A candle standing on (x, y, z), h tall, its flame lit (the glow layer): two crossed panes. */
  function candle(b: KitBuilder, x: number, y: number, z: number, h: number, r = 0.021) {
    b.cyl('y', r, r, h, x, y + h / 2, z, D.candle, 6, { neg: false, pos: true });
    for (const [u, v] of [[1, 0], [0, 1]] as const) { b.decal([x, y + h + 0.04, z], [u, 0, v], [0, 1, 0], 0.042, 0.08, FUV.flame); b.decal([x, y + h + 0.04, z], [-u, 0, -v], [0, 1, 0], 0.042, 0.08, FUV.flame); }
  }

  return {
    // -------------------------------------------------------------------------------------------------- floor vases
    floorVase: {
      basic: b => {
        // a terracotta jar, an incised band round its belly, dried grasses with pale plumes
        turned(b, 0, 0, [[0, 0.1], [0.05, 0.14], [0.2, 0.172], [0.32, 0.168], [0.45, 0.12], [0.52, 0.078], [0.57, 0.08], [0.6, 0.096]], K.clay, 12, [undefined, undefined, FUV.clayBand]);
        b.cyl('y', 0.09, 0.09, 0.004, 0, 0.594, 0, 0x3a2414, 12, { neg: false, pos: true });
        for (let k = 0; k < 9; k++) {
          const a = k * 2.4 + 0.3, lean = 0.24 + (k % 3) * 0.1, len = 0.34 + ((k * 7) % 5) * 0.025, tx = Math.sin(a) * Math.sin(lean) * len, tz = Math.cos(a) * Math.sin(lean) * len, ty = 0.56 + Math.cos(lean) * len;
          limb(b, [Math.sin(a) * 0.02, 0.55, Math.cos(a) * 0.02], [tx, ty, tz], 0.005, 0.004, 0xb8a272, 4, false);
          b.blob(0.03, tx * 1.04, ty + 0.03, tz * 1.04, k % 2 ? 0xe6d4a6 : 0xd6bf8a, [0.55, 2.1, 0.55]);
        }
        for (let k = 0; k < 3; k++) { const a = k * 2.1 + 1.0; limb(b, [0, 0.56, 0], [Math.sin(a) * 0.17, 0.72, Math.cos(a) * 0.17], 0.008, 0.002, 0xa89060, 3, false); }
        return { footprint: { w: 0.38, d: 0.36, h: 1.08 }, placement: 'free', use: standUse(0.36, 'use', 'Arranger les herbes', 0.5) };
      },
      better: b => {
        // a cobalt-glazed vase with its band of triangles, a dome of bougainvillea and its leaves, a spray falling over the rim
        b.cyl('y', 0.085, 0.09, 0.03, 0, 0.015, 0, 0xe6dcc6, 12, { neg: true, pos: false });
        turned(b, 0, 0, [[0.03, 0.09], [0.06, 0.115], [0.17, 0.155], [0.31, 0.16], [0.44, 0.11], [0.54, 0.066], [0.6, 0.07], [0.64, 0.094]], 0x24479a, 12, [undefined, undefined, FUV.glaze]);
        b.cyl('y', 0.088, 0.088, 0.004, 0, 0.634, 0, 0x14214a, 12, { neg: false, pos: true });
        for (let k = 0; k < 5; k++) { const a = k * 1.26; limb(b, [0, 0.6, 0], [Math.sin(a) * 0.1, 0.78, Math.cos(a) * 0.1], 0.008, 0.006, 0x5a6a2a, 4, false); }
        const pinks = [D.magenta, 0xe0479a, 0xb81e6a, 0xd83a8a, 0xe85aa8];
        for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4 + 0.2; b.blob(0.055, Math.sin(a) * 0.15, 0.71 + (k % 2) * 0.03, Math.cos(a) * 0.15, k % 2 ? K.leaf : K.leaf3, [1.3, 0.4, 0.9]); }
        for (let k = 0; k < 24; k++) {
          const y = 1 - (k / 23) * 1.25, r = Math.sqrt(Math.max(0, 1 - y * y)), a = k * 2.39996;
          b.blob(0.046 + (k % 3) * 0.006, Math.sin(a) * r * 0.19, 0.8 + y * 0.16, Math.cos(a) * r * 0.19, k === 5 || k === 17 ? 0xf6eef2 : pinks[k % 5], [1, 0.75, 1]);
        }
        const spray: V3[] = [[0.05, 0.66, 0.06], [0.15, 0.7, 0.13], [0.21, 0.6, 0.17], [0.22, 0.48, 0.18]];
        for (let k = 0; k < 3; k++) { limb(b, spray[k], spray[k + 1], 0.006, 0.005, 0x5a6a2a, 4, false); b.blob(0.04 - k * 0.004, ...spray[k + 1], pinks[k], [1, 0.8, 1]); }
        return { footprint: { w: 0.5, d: 0.48, h: 1.0 }, placement: 'free', use: standUse(0.48, 'use', 'Arranger le bouquet', 0.5) };
      },
      premium: b => {
        // a black marble foot, a tall gilded vase with a frieze, white orchids arching from it over broad leaves
        b.at(0, 0, 0, 0, () => {
          b.box(0.36, 0.05, 0.36, 0, 0, 0, 0x1e1e22, { py: { paint: 0x2a2a30 } });
          const gl = FUV.gold;
          turned(b, 0, 0, [[0.05, 0.1], [0.09, 0.13], [0.28, 0.19], [0.44, 0.18], [0.62, 0.11], [0.74, 0.074], [0.8, 0.08], [0.84, 0.104]], C.gold, 14, [gl, gl, gl, gl, gl, gl, gl]);
          b.cyl('y', 0.196, 0.196, 0.03, 0, 0.36, 0, 0xa87a2a, 14, { neg: false, pos: false }); b.cyl('y', 0.198, 0.198, 0.008, 0, 0.36, 0, C.gold, 14, { neg: false, pos: false });
          b.cyl('y', 0.098, 0.098, 0.004, 0, 0.834, 0, 0x2a1a0e, 12, { neg: false, pos: true });
          for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.5, ca = Math.cos(a), sa = Math.sin(a);
            const q: V3[] = [[sa * 0.03 - ca * 0.04, 0.8, ca * 0.03 + sa * 0.04], [sa * 0.03 + ca * 0.04, 0.8, ca * 0.03 - sa * 0.04], [sa * 0.2 + ca * 0.05, 0.86, ca * 0.2 - sa * 0.05], [sa * 0.2 - ca * 0.05, 0.86, ca * 0.2 + sa * 0.05]];
            b.toward(q, [0, 1, 0], 0x2f6b2e); b.toward(q, [0, -1, 0], 0x24521f);
            b.toward([q[3], q[2], [sa * 0.27, 0.8, ca * 0.27]], [0, 1, 0], 0x2f6b2e); b.toward([q[3], q[2], [sa * 0.27, 0.8, ca * 0.27]], [0, -1, 0], 0x24521f); }
          // four arching stems, each with its row of white flowers and their magenta lips
          for (let s = 0; s < 4; s++) {
            const az = -1.2 + s * 0.8, dir: V3 = [Math.sin(az), 0, Math.cos(az)];
            const pt = (t: number): V3 => { const r = 0.02 + t * 0.21, y = 0.82 + Math.sin(t * Math.PI * 0.85) * (0.36 + (s % 2) * 0.07) + t * 0.04; return [dir[0] * r, y, dir[2] * r]; };
            for (let k = 0; k < 4; k++) limb(b, pt(k / 4), pt((k + 1) / 4), 0.008, 0.006, 0x5a7a2a, 4, false);
            for (let f = 0; f < 5; f++) {
              const [fx, fy, fz] = pt(0.4 + f * 0.14), sz = 0.06 - f * 0.005;
              b.at(fx, fy - 0.03, fz, az * 0.6, () => {
                b.blob(sz * 0.8, 0, 0, 0, 0xfbf7f8, [1.25, 1, 0.35]);
                b.box(sz * 0.42, sz * 0.36, 0.012, 0, -sz * 0.32, sz * 0.22, 0xc8287a);
              });
            }
          }
        });
        return { footprint: { w: 0.5, d: 0.48, h: 1.3 }, placement: 'free', use: standUse(0.48, 'use', 'Arranger les orchidées', 0.5) };
      },
    },
    // -------------------------------------------------------------------------------------------------- sculptures
    sculpture: {
      basic: b => {
        // a woman at her mortar, the pestle raised, cut from one block of light wood with its base
        const wd = 0x9c6a3a, dk = 0x5e3a1e, lt = 0xc29560;
        b.cyl('y', 0.15, 0.15, 0.04, 0, 0.02, 0, dk, 12, { neg: true, pos: true });
        const mx = 0.08, mz = 0.08;
        b.cyl('y', 0.05, 0.036, 0.07, mx, 0.075, mz, dk, 8, { neg: false, pos: false }); b.cyl('y', 0.036, 0.072, 0.09, mx, 0.155, mz, dk, 8, { neg: false, pos: true, capPaint: 0x2a1a0e });
        limb(b, [mx, 0.19, mz], [mx, 0.86, mz], 0.014, 0.016, lt);
        const fx = -0.04, fz = -0.03;
        b.cyl('y', 0.09, 0.062, 0.32, fx, 0.2, fz, wd, 8, { neg: false, pos: false });
        b.cyl('y', 0.058, 0.068, 0.18, fx, 0.45, fz, wd, 8, { neg: false, pos: true });
        limb(b, [fx, 0.53, fz], [fx, 0.6, fz], 0.022, 0.02, wd);
        b.blob(0.045, fx, 0.64, fz + 0.005, wd, [0.85, 1.1, 0.95], 1);
        b.blob(0.052, fx, 0.685, fz - 0.012, dk, [1.0, 0.72, 1.05]); b.blob(0.024, fx + 0.03, 0.72, fz - 0.03, dk);
        const elR: V3 = [fx + 0.13, 0.48, fz + 0.05], elL: V3 = [fx - 0.06, 0.6, fz + 0.1], hU: V3 = [mx, 0.7, mz], hD: V3 = [mx, 0.6, mz];
        limb(b, [fx + 0.06, 0.52, fz], elR, 0.02, 0.017, wd); limb(b, elR, hD, 0.017, 0.014, wd);
        limb(b, [fx - 0.06, 0.52, fz], elL, 0.02, 0.017, wd); limb(b, elL, hU, 0.017, 0.014, wd);
        b.blob(0.019, ...hU, wd); b.blob(0.019, ...hD, wd);
        return { footprint: { w: 0.3, d: 0.3, h: 0.88 }, placement: 'free', use: standUse(0.3, 'inspect', 'Admirer la sculpture', 0.5) };
      },
      better: b => {
        // a calabash carrier in ebony, very tall and slender, the calabash in pale sapwood, on a stone plinth with an ebony cap
        const eb = D.ebony;
        b.box(0.34, 0.05, 0.34, 0, 0, 0, 0x8a8478); b.box(0.3, 0.46, 0.3, 0, 0.05, 0, D.stone); b.slab(0.34, 0.035, 0.34, 0, 0.51, 0, eb);
        const y0 = 0.545;
        b.cyl('y', 0.1, 0.1, 0.025, 0, y0 + 0.0125, 0, eb, 10, { neg: false, pos: true });
        b.cyl('y', 0.072, 0.047, 0.34, 0, y0 + 0.195, 0, eb, 8, { neg: false, pos: false });
        b.cyl('y', 0.045, 0.062, 0.19, 0, y0 + 0.46, 0, eb, 8, { neg: false, pos: true });
        limb(b, [0, y0 + 0.55, 0], [0, y0 + 0.66, 0.006], 0.019, 0.017, eb);
        b.blob(0.042, 0, y0 + 0.7, 0.008, eb, [0.82, 1.15, 0.95], 1);
        b.cyl('y', 0.04, 0.036, 0.02, 0, y0 + 0.75, 0, D.sapwood, 8, { neg: false, pos: true });
        b.blob(0.078, 0, y0 + 0.8, 0, D.sapwood, [1, 0.6, 1], 1); b.cyl('y', 0.05, 0.05, 0.006, 0, y0 + 0.845, 0, 0x8a6a3a, 10, { neg: false, pos: true });
        const elR: V3 = [0.135, y0 + 0.66, 0.01], elL: V3 = [-0.1, y0 + 0.44, 0.03];
        limb(b, [0.058, y0 + 0.535, 0], elR, 0.018, 0.015, eb); limb(b, elR, [0.07, y0 + 0.79, 0.01], 0.015, 0.012, eb);
        limb(b, [-0.058, y0 + 0.535, 0], elL, 0.018, 0.015, eb); limb(b, elL, [-0.045, y0 + 0.37, 0.04], 0.015, 0.012, eb);
        for (const s of [-1, 1]) b.blob(0.022, s * 0.056, y0 + 0.535, 0, eb);
        return { footprint: { w: 0.34, d: 0.34, h: 1.41 }, placement: 'free', use: standUse(0.34, 'inspect', 'Admirer la sculpture', 0.5) };
      },
      premium: b => {
        // a wrestler on guard in bronze, crouched, arms forward, his gris-gris on his arms and belt, on a white marble plinth with a gold plate
        const m = { rect: FUV.marble };
        b.box(0.54, 0.07, 0.54, 0, 0, 0, K.granite, { py: { paint: 0x3a3b3f } });
        b.box(0.46, 0.64, 0.46, 0, 0.07, 0, W, { pz: m, nz: m, px: m, nx: m });
        b.slab(0.52, 0.05, 0.52, 0, 0.71, 0, W, { py: m, pz: m, nz: m, px: m, nx: m });
        b.box(0.16, 0.06, 0.006, 0, 0.48, 0.233, W, { pz: { rect: FUV.gold } });
        b.cyl('y', 0.21, 0.22, 0.03, 0, 0.775, 0, D.bronzeDark, 14, { neg: false, pos: true });
        const S = 0.9, br = 0x74491f, hi = 0xc0904a, dk = 0x4a2e14;
        b.at(0, 0.79, -0.085, 0.28, () => {
          const P = (x: number, y: number, z: number): V3 => [x * S, y * S, z * S];
          const fL = P(-0.17, 0.03, 0.05), fR = P(0.16, 0.03, -0.09), kL = P(-0.2, 0.25, 0.14), kR = P(0.21, 0.26, 0.0), hL = P(-0.085, 0.43, -0.03), hR = P(0.085, 0.43, -0.05);
          const pel = P(0, 0.44, -0.04), nk = P(0, 0.72, 0.12), sL = P(-0.15, 0.7, 0.09), sR = P(0.15, 0.7, 0.08), eL = P(-0.22, 0.55, 0.23), eR = P(0.23, 0.57, 0.2), wL = P(-0.13, 0.46, 0.33), wR = P(0.14, 0.5, 0.32);
          b.box(0.06 * S, 0.035 * S, 0.12 * S, fL[0], 0, fL[2] + 0.02, dk, { rotY: 0.3 }); b.box(0.06 * S, 0.035 * S, 0.12 * S, fR[0], 0, fR[2] + 0.02, dk, { rotY: -0.3 });
          limb(b, fL, kL, 0.03 * S, 0.042 * S, br); limb(b, fR, kR, 0.03 * S, 0.042 * S, br);
          limb(b, kL, hL, 0.046 * S, 0.06 * S, br); limb(b, kR, hR, 0.046 * S, 0.06 * S, br);
          b.blob(0.044 * S, ...kL, hi); b.blob(0.044 * S, ...kR, hi);
          b.blob(0.1 * S, ...pel, br, [1.1, 0.75, 0.9]);
          b.cyl('y', 0.108 * S, 0.1 * S, 0.085 * S, pel[0], pel[1] + 0.005, pel[2], dk, 10, { neg: true, pos: true });
          b.box(0.08 * S, 0.11 * S, 0.02 * S, pel[0], pel[1] - 0.1 * S, pel[2] + 0.095 * S, dk);
          for (const k of [-1, 0, 1]) b.box(0.022 * S, 0.03 * S, 0.016 * S, pel[0] + k * 0.05 * S, pel[1] + 0.005, pel[2] + 0.1 * S, D.brass);
          limb(b, pel, nk, 0.09 * S, 0.12 * S, br, 10);
          b.at(0, 0.64 * S, 0.07 * S, 0, () => b.blob(0.1 * S, 0, 0, 0, hi, [1.42, 0.9, 0.8], 1), 0.55);
          b.blob(0.055 * S, ...sL, hi); b.blob(0.055 * S, ...sR, hi);
          limb(b, nk, P(0, 0.79, 0.19), 0.042 * S, 0.036 * S, br);
          b.blob(0.07 * S, ...P(0, 0.835, 0.21), br, [0.85, 1.05, 0.95], 1);
          limb(b, sL, eL, 0.045 * S, 0.035 * S, br); limb(b, sR, eR, 0.045 * S, 0.035 * S, br);
          limb(b, eL, wL, 0.034 * S, 0.027 * S, br); limb(b, eR, wR, 0.034 * S, 0.027 * S, br);
          b.blob(0.034 * S, ...wL, hi, [1, 0.8, 1.2]); b.blob(0.034 * S, ...wR, hi, [1, 0.8, 1.2]);
          for (const [sh, el] of [[sL, eL], [sR, eR]] as const) { const at = (t: number): V3 => [sh[0] + (el[0] - sh[0]) * t, sh[1] + (el[1] - sh[1]) * t, sh[2] + (el[2] - sh[2]) * t]; limb(b, at(0.4), at(0.52), 0.05 * S, 0.048 * S, dk); }
        });
        return { footprint: { w: 0.54, d: 0.54, h: 1.62 }, placement: 'free', use: standUse(0.54, 'inspect', 'Admirer la sculpture', 0.5) };
      },
    },
    // -------------------------------------------------------------------------------------------------- wall decoration, on the wall
    wallDecor: {
      basic: b => {
        // coiled basket plates in bright colours, a cluster of six
        const z0 = -0.02;
        for (const [x, y, r, rect] of [[0, 1.56, 0.2, FUV.basket0], [-0.31, 1.66, 0.13, FUV.basket1], [0.294, 1.63, 0.15, FUV.basket2], [-0.27, 1.34, 0.12, FUV.basket2], [0.24, 1.33, 0.105, FUV.basket0], [-0.03, 1.27, 0.08, FUV.basket1]] as const) {
          b.cyl('z', r * 0.78, r, 0.026, x, y, z0 + 0.013, 0x9a7438, 14, { neg: false, pos: rect });
          b.cyl('z', r + 0.006, r + 0.006, 0.012, x, y, z0 + 0.026, 0x8a6430, 14, { neg: false, pos: false });
        }
        return { footprint: { w: 0.9, d: 0.04, h: 1.8 }, placement: 'wall', use: standUse(0.04, 'inspect', 'Regarder les paniers', 0.8) };
      },
      better: b => {
        // three carved masks: dark wood with kaolin white and horns, red wood with its crest, pale wood with ears and a beard
        const z0 = -0.045;
        mask(b, 0, 1.47, z0, 0.135, 0.28, 0.065, 0x3e2414, 0xf2efe6, 0);
        mask(b, -0.36, 1.41, z0, 0.105, 0.21, 0.05, 0x8a4a26, 0x1c1410, 1);
        mask(b, 0.35, 1.43, z0, 0.1, 0.2, 0.05, 0xb07a44, 0xa8322a, 2);
        return { footprint: { w: 0.94, d: 0.09, h: 1.91 }, placement: 'wall', use: standUse(0.09, 'inspect', 'Regarder les masques', 0.8) };
      },
      premium: b => {
        // a gilded sunburst round a convex mirror: long and short faceted rays, a bead at each long ray's tip, a ring of small petals
        const z0 = -0.025, cy = 1.5, gl = FUV.gold, gu = (s: number, t: number): [number, number] => [gl[0] + (gl[2] - gl[0]) * s, gl[1] + (gl[3] - gl[1]) * t];
        b.cyl('z', 0.235, 0.235, 0.035, 0, cy, z0 + 0.0175, C.gold, 24, { neg: false, pos: gl });
        b.cyl('z', 0.19, 0.19, 0.006, 0, cy, z0 + 0.038, W, 24, { neg: false, pos: FUV.mirror });
        b.cyl('z', 0.2, 0.2, 0.012, 0, cy, z0 + 0.04, C.gold, 24, { neg: false, pos: false });
        for (let k = 0; k < 24; k++) {
          const a = (k + 0.5) * Math.PI / 12, ca = Math.cos(a), sa = Math.sin(a), at = (r: number, t: number): V3 => [ca * r - sa * t, cy + sa * r + ca * t, z0 + 0.006];
          b.toward([at(0.22, -0.012), at(0.385, 0), at(0.22, 0.012)], [0, 0, 1], 0xa87a2a);
        }
        for (let k = 0; k < 24; k++) {
          const a = k * Math.PI / 12, long = k % 2 === 0, r0 = 0.225, r1 = long ? 0.42 : 0.35, w0 = long ? 0.024 : 0.017, zb = z0 + 0.012, hz = 0.022;
          const ca = Math.cos(a), sa = Math.sin(a), at = (r: number, t: number, z: number): V3 => [ca * r - sa * t, cy + sa * r + ca * t, z];
          const bl = at(r0, -w0, zb), bR = at(r0, w0, zb), tip = at(r1, 0, zb), rb = at(r0, 0, zb + hz);
          b.toward([bl, tip, rb], [0, 0, 1], W, [gu(0, 0), gu(0.5, 1), gu(0.5, 0.3)]); b.toward([bR, rb, tip], [0, 0, 1], W, [gu(1, 0), gu(0.6, 0.4), gu(0.5, 1)]);
          if (long) b.blob(0.017, ...at(0.43, 0, zb + 0.004), C.gold);
          else { const p0 = at(0.245, -0.016, zb + 0.02), p1 = at(0.245, 0.016, zb + 0.02), p2 = at(0.29, 0, zb + 0.012); b.toward([p0, p2, p1], [0, 0, 1], 0xe8c870); }
        }
        return { footprint: { w: 0.9, d: 0.05, h: 1.95 }, placement: 'wall', use: standUse(0.05, 'use', 'Se préparer', 0.6) };
      },
    },
    // -------------------------------------------------------------------------------------------------- folding screens (four panels)
    screen: {
      basic: b => {
        // raffia stretched in a raw-wood frame
        const pw = 0.42, hw = pw / 2;
        zigzag(b, 4, pw, 0.5, () => {
          for (const sx of [-1, 1]) b.box(0.032, 1.62, 0.032, sx * (hw - 0.016), 0, 0, C.raw);
          b.slab(pw - 0.064, 0.035, 0.03, 0, 1.5, 0, C.rawDark); b.slab(pw - 0.064, 0.035, 0.03, 0, 0.1, 0, C.rawDark);
          b.box(pw - 0.064, 1.365, 0.01, 0, 0.135, 0, W, { pz: { rect: FUV.raffia }, nz: { rect: FUV.raffia } });
        });
        return { footprint: { w: 1.5, d: 0.23, h: 1.62 }, placement: 'free', use: standUse(0.23, 'use', 'Se changer', 0.5) };
      },
      better: b => {
        // dark carved wood, openwork panels, turned finials, an arched crest on each panel
        const pw = 0.44, hw = pw / 2;
        zigzag(b, 4, pw, 0.5, () => {
          for (const sx of [-1, 1]) { b.box(0.04, 1.62, 0.04, sx * (hw - 0.02), 0, 0, C.dark); b.blob(0.028, sx * (hw - 0.02), 1.65, 0, C.dark, [1, 1.3, 1]); }
          b.box(pw - 0.08, 1.44, 0.024, 0, 0.12, 0, W, { pz: { rect: FUV.carvedPanel }, nz: { rect: FUV.carvedPanel }, py: { paint: C.dark } });
          b.slab(pw - 0.08, 0.04, 0.036, 0, 1.56, 0, C.darker); b.slab(pw - 0.08, 0.04, 0.036, 0, 0.08, 0, C.darker);
          crest(b, 0, 1.6, 0, 0.11, 0.03, C.dark, 8, FUV.carved);
        });
        return { footprint: { w: 1.57, d: 0.25, h: 1.72 }, placement: 'free', use: standUse(0.25, 'use', 'Se changer', 0.5) };
      },
      premium: b => {
        // black lacquer and gold leaf, one picture across the four panels, gilded frames, bun feet, carved kick panels and crests
        const pw = 0.46, hw = pw / 2, g0 = { rect: FUV.gold }, cg = { rect: FUV.carved, paint: C.gold };
        zigzag(b, 4, pw, 0.5, i => {
          for (const sx of [-1, 1]) { b.box(0.045, 1.66, 0.045, sx * (hw - 0.0225), 0.06, 0, C.gold, { pz: g0, nz: g0, px: g0, nx: g0 }); b.blob(0.036, sx * (hw - 0.0225), 0.034, 0, C.gold, [1, 1.1, 1]); b.blob(0.03, sx * (hw - 0.0225), 1.74, 0, C.gold); }
          b.box(pw - 0.09, 1.28, 0.026, 0, 0.36, 0, D.lacquer, { pz: { rect: subRect(FUV.lacquer, i / 4, (i + 1) / 4) }, nz: { paint: 0x4a1016 } });
          b.box(pw - 0.09, 0.2, 0.026, 0, 0.13, 0, C.gold, { pz: cg, nz: cg });
          for (const y of [0.1, 0.33, 1.64]) b.slab(pw - 0.09, 0.03, 0.034, 0, y, 0, C.gold, { pz: g0, nz: g0 });
          crest(b, 0, 1.67, 0, 0.12, 0.03, C.gold, 8, FUV.carved);
        });
        return { footprint: { w: 1.65, d: 0.27, h: 1.8 }, placement: 'free', use: standUse(0.27, 'use', 'Se changer', 0.5) };
      },
    },
    // -------------------------------------------------------------------------------------------------- lanterns and a candelabrum (they light up: the glow layer)
    lantern: {
      basic: b => {
        // a hurricane lamp in red enamel, its amber globe lit, on a little wooden stool
        b.cyl('y', 0.15, 0.15, 0.035, 0, 0.3175, 0, C.raw, 12, { neg: true, pos: true, capPaint: C.varnishLight });
        for (let k = 0; k < 3; k++) { const a = k * Math.PI * 2 / 3 + 0.5; b.beam([Math.sin(a) * 0.08, 0.3, Math.cos(a) * 0.08], [Math.sin(a) * 0.13, 0.008, Math.cos(a) * 0.13], 0.035, 0.035, C.rawDark); }
        const y = 0.335, red = D.enamel, gl = FUV.lampGlass;
        b.cyl('y', 0.08, 0.085, 0.025, 0, y + 0.0125, 0, red, 12, { neg: false, pos: false });
        b.cyl('y', 0.085, 0.06, 0.05, 0, y + 0.05, 0, red, 12, { neg: false, pos: true });
        b.cyl('y', 0.04, 0.04, 0.025, 0, y + 0.0875, 0, D.brass, 8, { neg: false, pos: true }); b.cyl('x', 0.012, 0.012, 0.03, 0.05, y + 0.088, 0, D.brass, 6);
        b.cyl('y', 0.042, 0.066, 0.06, 0, y + 0.13, 0, W, 10, { neg: false, pos: false, side: subRect(gl, 0, 1, 0, 0.5) });
        b.cyl('y', 0.066, 0.04, 0.07, 0, y + 0.195, 0, W, 10, { neg: false, pos: false, side: subRect(gl, 0, 1, 0.5, 1) });
        for (let k = 0; k < 4; k++) { const a = Math.PI / 4 + k * Math.PI / 2, ax = Math.sin(a), az = Math.cos(a); b.beam([ax * 0.06, y + 0.075, az * 0.06], [ax * 0.074, y + 0.16, az * 0.074], 0.006, 0.006, red); b.beam([ax * 0.074, y + 0.16, az * 0.074], [ax * 0.056, y + 0.232, az * 0.056], 0.006, 0.006, red); }
        for (const sx of [-1, 1]) { b.beam([sx * 0.09, y + 0.03, 0], [sx * 0.09, y + 0.25, 0], 0.014, 0.014, red); b.beam([sx * 0.09, y + 0.25, 0], [sx * 0.04, y + 0.25, 0], 0.012, 0.012, red); }
        b.cyl('y', 0.07, 0.035, 0.035, 0, y + 0.2475, 0, red, 10, { neg: true, pos: false }); b.cyl('y', 0.025, 0.025, 0.02, 0, y + 0.275, 0, red, 8, { neg: false, pos: true });
        for (let k = 0; k < 6; k++) { const t0 = Math.PI * k / 6, t1 = Math.PI * (k + 1) / 6; b.beam([Math.cos(t0) * 0.09, y + 0.25 + Math.sin(t0) * 0.11, 0], [Math.cos(t1) * 0.09, y + 0.25 + Math.sin(t1) * 0.11, 0], 0.007, 0.007, 0x8a8e93); }
        return { footprint: { w: 0.3, d: 0.3, h: 0.7 }, placement: 'free', use: standUse(0.3, 'use', 'Allumer la lanterne', 0.45) };
      },
      better: b => {
        // a pair of pierced iron lanterns, tall and short, the light coming through in stars
        ironLantern(b, -0.136, -0.042, 1.22); ironLantern(b, 0.174, 0.078, 0.86);
        return { footprint: { w: 0.54, d: 0.36, h: 0.92 }, placement: 'free', use: standUse(0.36, 'use', 'Allumer les lanternes', 0.45) };
      },
      premium: b => {
        // a crystal candelabrum: a marble foot, a gilded stem threaded with cut crystal, five arms and a central candle, crystal drops
        const cr = FUV.crystal;
        b.cyl('y', 0.2, 0.18, 0.05, 0, 0.025, 0, W, 16, { neg: true, pos: FUV.marble }); b.cyl('y', 0.205, 0.205, 0.015, 0, 0.0075, 0, C.gold, 16, { neg: false, pos: false });
        b.cyl('y', 0.13, 0.04, 0.12, 0, 0.11, 0, W, 12, { neg: false, pos: false, side: FUV.gold });
        b.cyl('y', 0.016, 0.016, 1.3, 0, 0.82, 0, C.gold, 6, { neg: false, pos: false });
        for (const [y0, y1, r] of [[0.22, 0.44, 0.09], [0.54, 0.78, 0.07], [0.88, 1.04, 0.085]] as const) {
          const ym = (y0 + y1) / 2;
          facets(b, 8, 0.028, r, y0, ym, 0, 0, W, cr); facets(b, 8, r, 0.028, ym, y1, 0, 0, W, cr);
          b.cyl('y', 0.032, 0.032, 0.02, 0, y0 - 0.01, 0, C.gold, 8, { neg: false, pos: false }); b.cyl('y', 0.032, 0.032, 0.02, 0, y1 + 0.01, 0, C.gold, 8, { neg: false, pos: false });
        }
        b.cyl('y', 0.05, 0.1, 0.05, 0, 1.125, 0, C.gold, 10, { neg: true, pos: true, capPaint: 0xd8b860 });
        const tips: V3[] = [];
        for (let k = 0; k < 5; k++) {
          const a = k * Math.PI * 2 / 5 + Math.PI / 5, sa = Math.sin(a), ca = Math.cos(a), at = (r: number, y: number): V3 => [sa * r, y, ca * r];
          b.beam(at(0.08, 1.14), at(0.18, 1.12), 0.018, 0.018, C.gold, false); b.beam(at(0.18, 1.12), at(0.235, 1.22), 0.018, 0.018, C.gold, false);
          b.cyl('y', 0.032, 0.042, 0.02, ...at(0.235, 1.23), C.gold, 8, { neg: true, pos: true, capPaint: 0xd8b860 });
          candle(b, ...at(0.235, 1.24), 0.12);
          tips.push(at(0.235, 1.215));
        }
        b.cyl('y', 0.035, 0.045, 0.02, 0, 1.47, 0, C.gold, 8, { neg: true, pos: true, capPaint: 0xd8b860 }); candle(b, 0, 1.48, 0, 0.15, 0.019);
        for (let k = 0; k < 5; k++) {
          const A = tips[k], B = tips[(k + 1) % 5];
          for (let d = 0; d < 2; d++) b.blob(0.017, A[0] * (1 - d * 0.1), A[1] - 0.05 - d * 0.05, A[2] * (1 - d * 0.1), d ? 0xd8e8f8 : 0xf2f8ff, [0.7, 1.6, 0.7]);
          for (const t of [0.33, 0.67]) b.blob(0.013, A[0] + (B[0] - A[0]) * t, A[1] - 0.06 - Math.sin(t * Math.PI) * 0.03, A[2] + (B[2] - A[2]) * t, 0xe8f2fc);
        }
        for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; b.blob(0.015, Math.sin(a) * 0.1, 1.06, Math.cos(a) * 0.1, 0xeef6ff, [0.7, 1.7, 0.7]); }
        return { footprint: { w: 0.54, d: 0.56, h: 1.72 }, placement: 'free', use: standUse(0.56, 'use', 'Allumer les bougies', 0.45) };
      },
    },
    // -------------------------------------------------------------------------------------------------- aquariums (glass and water: the second draw call)
    aquarium: {
      basic: (b, g) => {
        // a round bowl of goldfish on a little wooden pedestal table
        b.cyl('y', 0.15, 0.12, 0.04, 0, 0.02, 0, C.varnish, 12, { neg: true, pos: true }); b.cyl('y', 0.03, 0.04, 0.48, 0, 0.28, 0, C.varnish, 8, { neg: false, pos: false });
        b.cyl('y', 0.19, 0.19, 0.03, 0, 0.535, 0, C.varnish, 14, { neg: true, pos: true, capPaint: C.varnishLight });
        const yc = 0.7;
        b.cyl('y', 0.04, 0.1, 0.045, 0, 0.5755, 0, D.gravel, 10, { neg: true, pos: true, capPaint: (x: number, _y: number, z: number) => [0xb8a070, 0x8a7a5a, 0xd8c8a0, 0xa0603a][Math.abs(Math.round(x * 97 + z * 61)) % 4] });
        for (let k = 0; k < 3; k++) { const a = k * 2.1; limb(b, [Math.sin(a) * 0.03, 0.59, Math.cos(a) * 0.03 - 0.03], [Math.sin(a) * 0.05, 0.7 + k * 0.02, Math.cos(a) * 0.05 - 0.05], 0.006, 0.003, D.weed2, 4, false); b.blob(0.018, Math.sin(a) * 0.05, 0.71 + k * 0.02, Math.cos(a) * 0.05 - 0.05, D.weed, [0.8, 1.4, 0.8]); }
        fish(b, -0.03, 0.68, 0.035, 0.075, 0xf07a1a, 0xf4b050, 1, 0.5); fish(b, 0.045, 0.72, -0.02, 0.065, 0xe85a10, 0xf09040, -1, 0.5);
        b.cyl('y', 0.088, 0.092, 0.012, 0, 0.827, 0, 0xbcd8e2, 14, { neg: false, pos: false });
        g.blob(0.17, 0, yc, 0, D.glass, [1, 0.88, 1], 1);
        g.cyl('y', 0.11, 0.135, 0.16, 0, 0.68, 0, D.water, 12, { neg: false, pos: true });
        return { footprint: { w: 0.38, d: 0.38, h: 0.85 }, placement: 'free', use: standUse(0.38, 'inspect', 'Regarder les poissons', 0.5) };
      },
      better: (b, g) => {
        // a planted freshwater tank on its wooden cabinet: driftwood, a stone, waving grass, angelfish, neon tetras and platies, a lit lid
        const w = 1.0, d = 0.42, f = d / 2;
        b.box(w - 0.04, 0.06, d - 0.04, 0, 0, 0, C.dark);
        b.box(w, 0.66, d, 0, 0.06, 0, C.varnish, { pz: { rect: FUV.wood, paint: C.varnishLight } });
        b.box(0.006, 0.6, 0.005, 0, 0.09, f + 0.0025, C.dark); for (const sx of [-1, 1]) b.cyl('z', 0.016, 0.016, 0.012, sx * 0.05, 0.42, f + 0.006, C.gold, 8);
        b.slab(w + 0.02, 0.03, d + 0.02, 0, 0.72, 0, C.varnish, { py: { rect: FUV.wood, paint: C.varnishLight } });
        const y0 = 0.75, y1 = 1.22, tw = w - 0.04, td = d - 0.02, zb = -td / 2, zf = td / 2, xr = tw / 2;
        b.box(tw, 0.025, td, 0, y0, 0, 0x1c1c1e); b.slab(tw + 0.01, 0.045, td + 0.01, 0, y1, 0, 0x1c1c1e, { ny: { rect: FUV.led } });
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.014, y1 - y0, 0.014, sx * (xr - 0.007), y0, sz * (td / 2 - 0.007), 0x1c1c1e);
        b.box(tw - 0.02, y1 - y0 - 0.02, 0.008, 0, y0 + 0.02, zb + 0.008, W, { pz: { rect: FUV.aquaFresh } });
        b.box(tw - 0.03, 0.05, td - 0.03, 0, y0 + 0.025, 0, D.gravel, { py: { paint: (x: number, _y: number, z: number) => [0xb8a070, 0x8a7a5a, 0xc8b890][Math.abs(Math.round(x * 31 + z * 53)) % 3] } });
        b.blob(0.08, -0.3, y0 + 0.1, -0.08, 0x8a8a84, [1.3, 0.75, 0.9]); b.blob(0.05, -0.2, y0 + 0.08, -0.02, 0x7a7a74, [1.2, 0.8, 1]);
        limb(b, [-0.05, y0 + 0.08, -0.06], [0.22, y0 + 0.3, -0.12], 0.022, 0.012, 0x5a3a22, 5); limb(b, [0.12, y0 + 0.2, -0.1], [0.2, y0 + 0.36, -0.05], 0.012, 0.006, 0x5a3a22, 4);
        for (let k = 0; k < 9; k++) { const x = -0.44 + k * 0.1 + (k % 2) * 0.02, h = 0.22 + ((k * 7) % 4) * 0.04, zz = zb + 0.05 + (k % 3) * 0.02, q: V3[] = [[x - 0.012, y0 + 0.07, zz], [x + 0.012, y0 + 0.07, zz], [x + 0.03 + (k % 2) * 0.02, y0 + 0.07 + h, zz], [x + 0.012 + (k % 2) * 0.02, y0 + 0.07 + h, zz]];
          b.toward(q, [0, 0, 1], k % 2 ? D.weed : D.weed2); b.toward(q, [0, 0, -1], D.weed); }
        for (let k = 0; k < 5; k++) b.blob(0.045, 0.3 + (k % 3) * 0.05, y0 + 0.1 + Math.floor(k / 3) * 0.06, -0.04 + (k % 2) * 0.05, k === 2 ? 0xc84a3a : D.weed2, [1, 1.3, 0.9]);
        fish(b, -0.12, y0 + 0.27, 0.02, 0.09, 0xd8d8cc, 0x2a2a2a, 1, 1.05); fish(b, 0.08, y0 + 0.33, -0.04, 0.08, 0xe8e0c8, 0x3a3a3a, -1, 1.05);
        for (let k = 0; k < 4; k++) fish(b, -0.3 + k * 0.07, y0 + 0.16 + (k % 2) * 0.03, 0.06 - (k % 2) * 0.04, 0.035, 0x2a8fe0, 0xd83a3a, 1);
        fish(b, 0.24, y0 + 0.2, 0.07, 0.05, 0xf08a2a, 0xf0a040, -1, 0.5); fish(b, -0.36, y0 + 0.32, 0.04, 0.05, 0xf06a2a, 0xf0a040, 1, 0.5);
        const pane = (pts: V3[], n: V3, col: number) => g.toward(pts, n, col);
        pane([[-xr, y0 + 0.025, zf], [xr, y0 + 0.025, zf], [xr, y1, zf], [-xr, y1, zf]], [0, 0, 1], D.glass);
        pane([[-xr + 0.01, y0 + 0.025, zf - 0.008], [xr - 0.01, y0 + 0.025, zf - 0.008], [xr - 0.01, y1 - 0.05, zf - 0.008], [-xr + 0.01, y1 - 0.05, zf - 0.008]], [0, 0, 1], D.water);
        for (const sx of [-1, 1]) pane([[sx * xr, y0 + 0.025, zb], [sx * xr, y0 + 0.025, zf], [sx * xr, y1, zf], [sx * xr, y1, zb]], [sx, 0, 0], D.water);
        pane([[-xr + 0.01, y1 - 0.05, zb], [xr - 0.01, y1 - 0.05, zb], [xr - 0.01, y1 - 0.05, zf - 0.008], [-xr + 0.01, y1 - 0.05, zf - 0.008]], [0, 1, 0], 0x9fd8ec);
        return { footprint: { w: 1.02, d: 0.44, h: 1.27 }, placement: 'wall', use: standUse(0.44, 'inspect', 'Regarder les poissons', 0.55) };
      },
      premium: (b, g) => {
        // a reef tank on a walnut cabinet with gold trims: live rock, corals of every colour, a sea fan, an anemone and its clownfish, tangs, a blue-white lit lid
        const w = 1.8, d = 0.5, f = d / 2;
        b.box(w - 0.06, 0.07, d - 0.06, 0, 0, 0, 0x1a1a1c);
        const fc = f - 0.02;
        b.box(w, 0.72, d - 0.02, 0, 0.07, -0.01, K.walnut, { pz: { rect: FUV.wood, paint: 0x7a5232 }, px: { rect: FUV.wood, paint: 0x6a4428 }, nx: { rect: FUV.wood, paint: 0x6a4428 } });
        for (const x of [-0.3, 0.3]) b.box(0.006, 0.66, 0.005, x, 0.1, fc + 0.0025, 0x2e1a0e);
        for (const x of [-0.36, -0.24, 0.24, 0.36, -0.06, 0.06]) b.box(0.016, 0.22, 0.016, x, 0.36, fc + 0.008, C.gold);
        b.box(w, 0.02, 0.006, 0, 0.07, fc + 0.003, C.gold); b.slab(w, 0.035, d, 0, 0.79, 0, 0x2a1a10, { pz: { paint: C.gold } });
        const y0 = 0.825, y1 = 1.55, tw = w - 0.04, td = d - 0.04, zb = -td / 2, zf = td / 2, xr = tw / 2;
        b.box(tw, 0.03, td, 0, y0, 0, 0x111214); b.slab(w, 0.05, d, 0, y1, 0, 0x111214);
        b.box(tw - 0.06, 0.012, 0.02, 0, y1 - 0.012, zf - 0.03, W, { ny: { rect: FUV.led }, pz: { rect: FUV.led } });
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.016, y1 - y0, 0.016, sx * (xr - 0.008), y0, sz * (td / 2 - 0.008), 0x111214);
        b.box(tw - 0.02, y1 - y0 - 0.03, 0.008, 0, y0 + 0.03, zb + 0.008, W, { pz: { rect: FUV.aquaSea } });
        b.box(tw - 0.03, 0.06, td - 0.03, 0, y0 + 0.03, 0, D.sand);
        const ys = y0 + 0.09;
        ([[-0.62, 0.08, -0.12, 0.12, [1.4, 0.8, 0.8]], [-0.4, 0.1, -0.14, 0.1, [1.2, 1.1, 0.8]], [-0.2, 0.05, -0.12, 0.09, [1.5, 0.7, 0.9]], [0.18, 0.07, -0.13, 0.11, [1.3, 0.9, 0.8]],
          [0.42, 0.12, -0.14, 0.12, [1.1, 1.3, 0.8]], [0.66, 0.06, -0.1, 0.09, [1.3, 0.8, 1]]] as const).forEach(([x, y, z, r, s], k) => b.blob(r, x, ys + y, z, [0x8a7a90, 0x7a6a80, 0x9a8a8a][k % 3], s));
        b.blob(0.08, -0.42, ys + 0.24, -0.1, 0xb8c84a, [1, 0.7, 1]);
        b.blob(0.06, 0.4, ys + 0.3, -0.12, 0x6ab0a0, [1.5, 0.35, 1.2]);
        for (const [x, z, col] of [[-0.62, -0.08, 0x9a5ad0], [0.18, -0.08, 0xf08a3a], [0.68, -0.05, 0x9a5ad0]] as const) for (let k = 0; k < 4; k++) {
          const a = k * 1.6 + x * 3, tip: V3 = [x + Math.sin(a) * 0.07, ys + 0.2 + (k % 2) * 0.06, z + Math.cos(a) * 0.04 + 0.03];
          limb(b, [x, ys + 0.1, z], tip, 0.014, 0.009, col, 4, false); b.blob(0.014, ...tip, dimC(col, 1.2));
        }
        for (const [x, z] of [[-0.05, -0.06], [0.52, 0.0], [-0.78, 0.02]] as const) for (let k = 0; k < 3; k++) b.blob(0.038, x + (k - 1) * 0.035, ys + 0.05 + (k % 2) * 0.04, z + (k % 2) * 0.015, [0xf07ab0, 0xf59ac8, 0xe05a98][k]);
        const fan: V3[] = [[0.62, ys + 0.1, -0.15]];
        for (let k = 0; k <= 6; k++) { const a = Math.PI * (0.18 + k * 0.64 / 6); fan.push([0.62 + Math.cos(a) * 0.2, ys + 0.1 + Math.sin(a) * 0.3, -0.15]); }
        const fuv = fan.map(p => [FUV.carved[0] + (FUV.carved[2] - FUV.carved[0]) * (0.5 + (p[0] - 0.62) / 0.4), FUV.carved[1] + (FUV.carved[3] - FUV.carved[1]) * (p[1] - ys - 0.1) / 0.3] as [number, number]);
        b.toward(fan, [0, 0, 1], 0xe0583a, fuv); b.toward(fan, [0, 0, -1], 0xb83a2a); limb(b, [0.62, ys + 0.02, -0.15], [0.62, ys + 0.12, -0.15], 0.012, 0.01, 0xb83a2a, 4);
        b.cyl('y', 0.05, 0.06, 0.05, -0.12, ys + 0.025, 0.06, 0xf5a07a, 10, { neg: false, pos: true });
        for (let k = 0; k < 7; k++) { const a = k * Math.PI * 2 / 7; limb(b, [-0.12 + Math.sin(a) * 0.035, ys + 0.05, 0.06 + Math.cos(a) * 0.035], [-0.12 + Math.sin(a) * 0.07, ys + 0.11, 0.06 + Math.cos(a) * 0.07], 0.01, 0.006, 0xf8b890, 4); }
        for (const [x, y, dir] of [[-0.02, ys + 0.14, -1], [-0.22, ys + 0.12, 1]] as const) { fish(b, x, y, 0.08, 0.07, 0xf06a1a, 0x1a1a1a, dir, 0.5); b.box(0.008, 0.03, 0.024, x + dir * 0.008, y - 0.015, 0.068, 0xf8f8f4); }
        for (const [x, y, z, dir] of [[-0.5, ys + 0.42, 0.04, 1], [0.3, ys + 0.5, 0.08, -1]] as const) fish(b, x, y, z, 0.13, 0x2a5ad8, 0xf4d020, dir, 0.55);
        for (const [x, y, z, dir] of [[0.05, ys + 0.38, 0.0, 1], [0.6, ys + 0.24, 0.06, -1]] as const) fish(b, x, y, z, 0.11, 0xf4d43a, 0xf4d43a, dir, 0.8);
        for (let k = 0; k < 4; k++) fish(b, -0.75 + k * 0.42, ys + 0.3 + (k % 2) * 0.12, 0.1 - (k % 2) * 0.06, 0.045, 0x5ad0a0, 0x48b890, k % 2 ? -1 : 1);
        const pane = (pts: V3[], n: V3, col: number) => g.toward(pts, n, col), yw = y1 - 0.05;
        pane([[-xr, y0 + 0.03, zf], [xr, y0 + 0.03, zf], [xr, y1, zf], [-xr, y1, zf]], [0, 0, 1], D.glass);
        pane([[-xr + 0.01, y0 + 0.03, zf - 0.008], [xr - 0.01, y0 + 0.03, zf - 0.008], [xr - 0.01, yw, zf - 0.008], [-xr + 0.01, yw, zf - 0.008]], [0, 0, 1], D.sea);
        for (const sx of [-1, 1]) pane([[sx * xr, y0 + 0.03, zb], [sx * xr, y0 + 0.03, zf], [sx * xr, y1, zf], [sx * xr, y1, zb]], [sx, 0, 0], D.sea);
        pane([[-xr + 0.01, yw, zb], [xr - 0.01, yw, zb], [xr - 0.01, yw, zf - 0.008], [-xr + 0.01, yw, zf - 0.008]], [0, 1, 0], 0x8fd0f4);
        return { footprint: { w: 1.8, d: 0.5, h: 1.6 }, placement: 'wall', use: standUse(0.5, 'inspect', 'Regarder les poissons', 0.55) };
      },
    },
  };
}
const ROUND2_DECO = decoMakers();

const HOME_MAKERS: Record<HomeType, Record<Tier, Maker>> = {
  // -------------------------------------------------------------------------------------------------- dining sets: a table and its chairs
  dining: {
    basic: b => {
      legs4(b, 1.0, 0.6, 0.7, 0.05, C.raw); b.box(0.96, 0.08, 0.56, 0, 0.62, 0, C.rawDark);
      b.slab(1.1, 0.03, 0.7, 0, 0.7, 0, W, { py: { rect: FUV.cloth }, pz: { rect: FUV.cloth }, nz: { rect: FUV.cloth }, px: { rect: FUV.cloth }, nx: { rect: FUV.cloth } });
      b.cyl('y', 0.06, 0.07, 0.2, -0.22, 0.83, -0.05, 0x2a8fd1, 8); b.cyl('y', 0.05, 0.05, 0.02, -0.22, 0.94, -0.05, 0x2a8fd1, 8);
      for (const [x, z] of [[0.12, 0.1], [0.24, 0.06], [0.2, -0.12]]) b.cyl('y', 0.03, 0.025, 0.08, x, 0.77, z, 0xe8f4ff, 6);
      const seats = chairsAt(b, [[-0.28, -0.5, 0], [0.28, -0.5, 0], [-0.28, 0.5, Math.PI], [0.28, 0.5, Math.PI]], 0.45, i => plasticChair(b, i < 2 ? C.white : C.bluePl, false));
      return { footprint: { w: 1.12, d: 1.6, h: 0.97 }, placement: 'free', seats, use: sitUse(seats[0], 'eat', 'Manger à table') };
    },
    better: b => {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) { b.cyl('y', 0.035, 0.045, 0.34, sx * 0.6, 0.17, sz * 0.33, C.varnish, 8); b.cyl('y', 0.045, 0.03, 0.36, sx * 0.6, 0.52, sz * 0.33, C.varnish, 8); }
      b.box(1.26, 0.1, 0.72, 0, 0.6, 0, C.varnish);
      b.slab(1.4, 0.045, 0.85, 0, 0.7, 0, C.varnish, { py: { rect: FUV.wood, paint: C.varnishLight } });
      b.slab(0.9, 0.006, 0.34, 0, 0.745, 0, W, topRect(FUV.wax2));
      b.cyl('y', 0.15, 0.1, 0.08, 0, 0.791, 0, C.white, 10); for (const [x, z, c] of [[-0.05, 0.02, 0xf2a03a], [0.05, -0.03, 0x6fbf6a], [0.0, 0.05, 0xd9322b]]) b.blob(0.045, x, 0.86, z, c);
      const seats = chairsAt(b, [[-0.36, -0.6, 0], [0.36, -0.6, 0], [-0.36, 0.6, Math.PI], [0.36, 0.6, Math.PI]], 0.54, () => woodChair(b));
      return { footprint: { w: 1.42, d: 1.72, h: 1.02 }, placement: 'free', seats, use: sitUse(seats[0], 'eat', 'Manger à table') };
    },
    premium: b => {
      for (const sx of [-1, 1]) {
        b.cyl('y', 0.07, 0.11, 0.6, sx * 0.55, 0.38, 0, C.dark, 8, { neg: true, pos: true, side: FUV.carved });
        b.box(0.14, 0.08, 0.72, sx * 0.55, 0, 0, C.dark); b.box(0.5, 0.08, 0.14, sx * 0.55, 0, 0, C.dark);
        for (const [dx, dz] of [[0, 0.34], [0, -0.34], [0.23, 0], [-0.23, 0]]) b.box(0.08, 0.02, 0.08, sx * 0.55 + dx, 0.08, dz, C.gold);
        b.box(0.22, 0.04, 0.22, sx * 0.55, 0.66, 0, C.gold);
      }
      b.beam([-0.55, 0.25, 0], [0.55, 0.25, 0], 0.05, 0.05, C.gold);
      b.slab(1.9, 0.05, 0.95, 0, 0.7, 0, W, { py: { rect: FUV.marble } });
      b.cuboid(-0.95, 0.95, 0.69, 0.75, 0.465, 0.478, C.gold, { bottom: true }); b.cuboid(-0.95, 0.95, 0.69, 0.75, -0.478, -0.465, C.gold, { bottom: true });
      b.cyl('y', 0.16, 0.09, 0.09, 0, 0.795, 0, C.gold, 12); for (const [x, z, c] of [[-0.05, 0.02, 0xd9322b], [0.06, -0.03, 0xf2a03a], [0.0, 0.06, 0x6fbf6a], [0.02, -0.06, 0xf4c20d]]) b.blob(0.045, x, 0.87, z, c);
      for (const sx of [-1, 1]) { b.cyl('y', 0.045, 0.03, 0.22, sx * 0.45, 0.86, 0, C.gold, 8); b.cyl('y', 0.016, 0.016, 0.1, sx * 0.45, 1.02, 0, C.cream, 6); }
      const seats = chairsAt(b, [[-0.62, -0.66, 0], [0, -0.66, 0], [0.62, -0.66, 0], [-0.62, 0.66, Math.PI], [0, 0.66, Math.PI], [0.62, 0.66, Math.PI]], 0.52, () => velvetChair(b));
      return { footprint: { w: 1.92, d: 1.92, h: 1.18 }, placement: 'free', seats, use: sitUse(seats[0], 'eat', 'Manger à table') };
    },
  },
  // -------------------------------------------------------------------------------------------------- kitchen table, its stools on the room side (+z)
  kitchenTable: {
    basic: b => {
      const tz = -0.2;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.03, 0.72, 0.03, sx * 0.37, 0, tz + sz * 0.24, C.chrome);
      b.slab(0.8, 0.03, 0.55, 0, 0.72, tz, 0xe8e4d8, { py: { paint: 0xf4f1e8 } });
      b.cuboid(-0.4, 0.4, 0.715, 0.755, tz + 0.275, tz + 0.285, 0xd9322b, { bottom: true });
      b.cyl('y', 0.045, 0.05, 0.2, -0.26, 0.85, tz - 0.12, C.redPl, 8); b.cyl('y', 0.03, 0.03, 0.03, -0.26, 0.965, tz - 0.12, C.white, 8);
      b.cyl('y', 0.08, 0.05, 0.05, 0.02, 0.775, tz + 0.02, C.white, 10); b.box(0.3, 0.05, 0.07, 0.2, 0.75, tz - 0.1, 0xd9a35a);
      const seats = chairsAt(b, [[-0.2, 0.28, Math.PI], [0.2, 0.28, Math.PI]], 0.47, i => plasticStool(b, i ? C.bluePl : C.redPl), 'stool', 0);
      return { footprint: { w: 0.82, d: 0.96, h: 1.0 }, placement: 'wall', seats, use: sitUse(seats[0], 'eat', 'Manger un morceau') };
    },
    better: b => {
      const tz = -0.2;
      legs4(b, 0.94, 0.54, 0.72, 0.05, C.varnish, 0, tz); b.box(0.9, 0.1, 0.5, 0, 0.62, tz, C.varnish);
      b.box(0.34, 0.07, 0.012, 0, 0.635, tz + 0.256, C.varnishLight); b.box(0.06, 0.02, 0.02, 0, 0.66, tz + 0.266, C.gold);
      b.slab(1.0, 0.04, 0.6, 0, 0.72, tz, C.varnish, { py: { rect: FUV.wood, paint: C.varnishLight } });
      b.cyl('y', 0.13, 0.09, 0.07, -0.25, 0.795, tz - 0.05, C.white, 10); for (const [x, z, c] of [[-0.27, -0.05, 0xf2a03a], [-0.22, -0.02, 0x6fbf6a]]) b.blob(0.04, x, 0.85, tz + z, c);
      b.cyl('y', 0.07, 0.08, 0.12, 0.22, 0.82, tz - 0.08, C.enamel, 10); b.beam([0.29, 0.82, tz - 0.08], [0.36, 0.88, tz - 0.08], 0.02, 0.02, C.enamel);
      const seats = chairsAt(b, [[-0.24, 0.31, Math.PI], [0.24, 0.31, Math.PI]], 0.48, () => woodStool(b), 'stool', 0);
      return { footprint: { w: 1.0, d: 1.0, h: 0.91 }, placement: 'wall', seats, use: sitUse(seats[0], 'eat', 'Manger un morceau') };
    },
    premium: b => {
      const tz = -0.25, w = 1.1;
      for (const sx of [-1, 1]) b.box(0.05, 1.0, 0.5, sx * (w / 2 - 0.025), 0, tz, W, { px: { rect: FUV.marble }, nx: { rect: FUV.marble }, pz: { rect: FUV.marble } });
      b.slab(w, 0.04, 0.5, 0, 1.0, tz, W, { py: { rect: FUV.marble }, pz: { rect: FUV.marble } });
      b.box(w - 0.1, 0.6, 0.03, 0, 0.4, tz - 0.2, 0x3a3a3c);
      b.beam([-0.5, 0.26, tz + 0.2], [0.5, 0.26, tz + 0.2], 0.025, 0.025, C.chrome);
      b.cyl('y', 0.14, 0.08, 0.06, -0.3, 1.07, tz, C.chrome, 12); for (const [x, z, c] of [[-0.32, 0.0, 0xf2a03a], [-0.27, 0.03, 0xd9322b], [-0.3, -0.03, 0x6fbf6a]]) b.blob(0.04, x, 1.12, tz + z, c);
      b.box(0.18, 0.3, 0.22, 0.32, 1.04, tz - 0.06, 0x2a2a2c); b.box(0.1, 0.08, 0.05, 0.32, 1.06, tz + 0.07, C.chrome);   // a coffee machine
      const seats = chairsAt(b, [[-0.27, 0.28, Math.PI], [0.27, 0.28, Math.PI]], 0.77, () => barStool(b), 'stool', 0);
      return { footprint: { w: 1.12, d: 1.0, h: 1.36 }, placement: 'wall', seats, use: sitUse(seats[0], 'eat', 'Manger un morceau') };
    },
  },
  // -------------------------------------------------------------------------------------------------- a microwave on its trolley, its cabinet, or an oven column
  microwave: {
    basic: b => {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) { b.box(0.025, 0.82, 0.025, sx * 0.26, 0.03, sz * 0.18, C.chrome); b.cyl('x', 0.025, 0.025, 0.02, sx * 0.26, 0.025, sz * 0.18, C.black, 8); }
      b.slab(0.55, 0.02, 0.4, 0, 0.16, 0, 0x8a8e93); b.slab(0.56, 0.025, 0.41, 0, 0.82, 0, 0x8a8e93);
      b.box(0.48, 0.28, 0.34, 0, 0.845, -0.02, C.white);
      b.box(0.47, 0.26, 0.006, 0, 0.855, 0.153, W, { pz: { rect: FUV.mwave } });
      b.box(0.02, 0.18, 0.025, 0.1, 0.895, 0.165, C.grey);
      b.cyl('y', 0.15, 0.12, 0.1, -0.1, 0.23, 0, C.redPl, 10); b.box(0.14, 0.22, 0.12, 0.16, 0.18, 0.02, 0xe8d8b0);
      return { footprint: { w: 0.56, d: 0.42, h: 1.13 }, placement: 'wall', use: standUse(0.42, 'use', 'Réchauffer un plat', 0.5) };
    },
    better: b => {
      b.box(0.56, 0.06, 0.4, 0, 0, -0.01, C.dark);
      b.box(0.6, 0.78, 0.44, 0, 0.06, 0, C.varnish, { pz: { rect: FUV.wood, paint: C.varnishLight } });
      b.box(0.006, 0.7, 0.005, 0, 0.1, 0.2225, C.dark); for (const sx of [-1, 1]) b.box(0.02, 0.12, 0.025, sx * 0.05, 0.6, 0.232, C.gold);
      b.slab(0.62, 0.03, 0.46, 0, 0.84, 0, W, { py: { rect: FUV.marble } });
      b.box(0.5, 0.29, 0.36, 0, 0.87, -0.03, C.white, { py: { paint: 0xf4f4f0 } });
      b.box(0.49, 0.27, 0.006, 0, 0.88, 0.153, W, { pz: { rect: FUV.mwave } });
      b.box(0.02, 0.18, 0.025, 0.105, 0.925, 0.165, C.grey);
      return { footprint: { w: 0.62, d: 0.5, h: 1.17 }, placement: 'wall', use: standUse(0.5, 'use', 'Réchauffer un plat', 0.5) };
    },
    premium: b => {
      const w = 0.62, z0 = -0.02, f = 0.28 + z0;
      b.box(w - 0.04, 0.08, 0.5, 0, 0, z0 - 0.02, C.black);
      b.box(w, 2.0, 0.56, 0, 0.08, z0, C.white);
      for (const [y, h] of [[0.1, 0.2], [0.32, 0.2]]) { b.box(w - 0.04, h, 0.02, 0, y, f + 0.01, 0xf4f2ec); b.box(0.3, 0.015, 0.025, 0, y + h - 0.045, f + 0.032, C.chrome); }
      b.box(w - 0.04, 0.58, 0.02, 0, 0.56, f + 0.01, 0x1c1c1e); b.box(w - 0.14, 0.3, 0.005, 0, 0.64, f + 0.022, W, { pz: { rect: FUV.mwave } });
      b.box(0.42, 0.02, 0.03, 0, 1.04, f + 0.035, C.chrome);
      for (let k = 0; k < 4; k++) b.cyl('z', 0.018, 0.018, 0.02, -0.21 + k * 0.06, 1.1, f + 0.03, C.chrome, 10);
      b.box(0.12, 0.035, 0.005, 0.16, 1.085, f + 0.022, W, { pz: { rect: FUV.led } });
      b.box(w - 0.04, 0.36, 0.02, 0, 1.18, f + 0.01, 0x2a2a2c); b.box(w - 0.12, 0.3, 0.005, 0, 1.21, f + 0.022, W, { pz: { rect: FUV.mwave } });
      b.box(w - 0.04, 0.48, 0.02, 0, 1.58, f + 0.01, 0xf4f2ec); b.box(0.02, 0.2, 0.025, 0.22, 1.62, f + 0.032, C.chrome);
      return { footprint: { w: 0.62, d: 0.62, h: 2.08 }, placement: 'wall', use: standUse(0.62, 'use', 'Réchauffer un plat', 0.5) };
    },
  },
  // -------------------------------------------------------------------------------------------------- water: the canari, a dispenser and its bottle, a steel one
  waterDispenser: {
    basic: b => {
      legs4(b, 0.34, 0.34, 0.3, 0.04, C.raw); for (const s of [-1, 1]) b.box(0.3, 0.03, 0.03, 0, 0.1, s * 0.15, C.rawDark);
      b.slab(0.4, 0.03, 0.4, 0, 0.3, 0, C.raw, { py: { rect: FUV.wood, paint: C.raw } });
      b.cyl('y', 0.11, 0.17, 0.12, 0, 0.39, 0, K.clay, 10, { neg: false, pos: false }); b.cyl('y', 0.17, 0.19, 0.12, 0, 0.51, 0, K.clay, 10, { neg: false, pos: false });
      b.cyl('y', 0.19, 0.13, 0.13, 0, 0.635, 0, K.clayDark, 10, { neg: false, pos: false }); b.cyl('y', 0.13, 0.12, 0.04, 0, 0.72, 0, K.clay, 10, { neg: false, pos: false });
      b.cyl('y', 0.135, 0.135, 0.02, 0, 0.75, 0, C.raw, 10); b.blob(0.02, 0, 0.77, 0, C.rawDark);
      b.cyl('y', 0.035, 0.035, 0.06, 0.07, 0.79, 0.03, C.alu, 8);
      return { footprint: { w: 0.4, d: 0.4, h: 0.83 }, placement: 'free', use: standUse(0.4, 'drink', 'Boire de l’eau fraîche', 0.45) };
    },
    better: (b, g) => {
      const z0 = -0.04;
      b.box(0.3, 0.96, 0.3, 0, 0, z0, C.white);
      b.box(0.22, 0.26, 0.012, 0, 0.56, z0 + 0.156, 0x3a3a3c); b.box(0.18, 0.025, 0.08, 0, 0.56, z0 + 0.18, C.grey);
      b.box(0.035, 0.05, 0.05, -0.05, 0.75, z0 + 0.185, 0x2f6fb3); b.box(0.035, 0.05, 0.05, 0.05, 0.75, z0 + 0.185, 0xd9322b);
      b.box(0.22, 0.32, 0.008, 0, 0.1, z0 + 0.154, 0xf4f4f0); b.box(0.08, 0.015, 0.02, 0, 0.38, z0 + 0.162, C.grey);
      b.cyl('y', 0.12, 0.12, 0.04, 0, 0.98, z0, C.grey, 12);
      g.cyl('y', 0.05, 0.13, 0.1, 0, 1.05, z0, K.water, 12); g.cyl('y', 0.13, 0.13, 0.3, 0, 1.25, z0, K.water, 12); g.cyl('y', 0.13, 0.11, 0.04, 0, 1.42, z0, K.water, 12);
      return { footprint: { w: 0.32, d: 0.38, h: 1.45 }, placement: 'wall', use: standUse(0.38, 'drink', 'Boire de l’eau fraîche', 0.45) };
    },
    premium: (b, g) => {
      const z0 = -0.03, f = z0 + 0.16;
      b.box(0.32, 1.02, 0.32, 0, 0, z0, K.steel);
      b.box(0.27, 0.42, 0.012, 0, 0.5, f + 0.006, C.black);
      b.box(0.12, 0.04, 0.005, 0, 0.85, f + 0.014, W, { pz: { rect: FUV.led } });
      for (const [x, c] of [[-0.08, 0xd9322b], [0, 0x2f6fb3], [0.08, 0xf2f2ee]] as const) b.box(0.03, 0.05, 0.045, x, 0.7, f + 0.03, c);
      b.box(0.24, 0.02, 0.07, 0, 0.52, f + 0.035, C.grey);
      b.box(0.28, 0.4, 0.008, 0, 0.06, f + 0.004, K.steel, { pz: { paint: 0xd8dcdf } }); b.box(0.015, 0.3, 0.02, 0.11, 0.1, f + 0.018, C.chrome);
      for (let k = 0; k < 5; k++) b.box(0.006, 0.18, 0.004, -0.16, 0.6 + k * 0.0, z0 - 0.1 + k * 0.05, C.grey);
      for (let k = 0; k < 5; k++) b.box(0.006, 0.18, 0.004, 0.16, 0.6, z0 - 0.1 + k * 0.05, C.grey);
      for (let k = 0; k < 3; k++) b.cyl('z', 0.01, 0.01, 0.01, -0.08 + k * 0.08, 0.79, f + 0.017, [0xd9322b, 0x2f6fb3, 0x7dffb0][k], 8);
      b.cyl('y', 0.16, 0.16, 0.02, 0, 0.01, z0, C.chrome, 16, { neg: false, pos: true });
      b.slab(0.28, 0.02, 0.26, 0, 1.02, z0, C.chrome);
      for (const x of [-0.08, 0.0]) g.cyl('y', 0.035, 0.03, 0.1, x, 1.09, z0 - 0.02, 0xe8f4ff, 8);
      g.cyl('y', 0.06, 0.06, 0.16, 0.08, 1.12, z0 + 0.02, 0xbfe0ea, 10); g.cyl('y', 0.06, 0.025, 0.06, 0.08, 1.23, z0 + 0.02, 0xbfe0ea, 10);
      return { footprint: { w: 0.34, d: 0.4, h: 1.27 }, placement: 'wall', use: standUse(0.4, 'drink', 'Boire de l’eau fraîche', 0.45) };
    },
  },
  // -------------------------------------------------------------------------------------------------- cooking: a gas ring and its pot, a gas cooker, a range and its hood
  cooker: {
    basic: b => {
      legs4(b, 0.74, 0.44, 0.45, 0.04, C.raw); b.slab(0.78, 0.03, 0.48, 0, 0.45, 0, C.raw, { py: { rect: FUV.wood, paint: C.raw } });
      b.slab(0.34, 0.02, 0.4, -0.19, 0.12, 0, C.rawDark);
      b.cyl('y', 0.12, 0.13, 0.05, -0.15, 0.505, 0, 0x333333, 10);
      b.cyl('y', 0.17, 0.15, 0.22, -0.15, 0.64, 0, C.alu, 12); b.cyl('y', 0.175, 0.175, 0.015, -0.15, 0.757, 0, 0x9aa0a6, 12); b.blob(0.025, -0.15, 0.78, 0, 0x333333);
      for (const s of [-1, 1]) b.box(0.05, 0.02, 0.03, -0.15 + s * 0.19, 0.7, 0, C.alu);
      b.cyl('y', 0.08, 0.09, 0.13, 0.2, 0.545, 0.05, C.enamel, 10); b.cyl('y', 0.03, 0.05, 0.03, 0.2, 0.625, 0.05, C.enamel, 8); b.beam([0.27, 0.56, 0.05], [0.34, 0.62, 0.05], 0.022, 0.022, C.enamel);
      b.cyl('y', 0.12, 0.12, 0.34, 0.2, 0.17, 0.02, C.butane, 12); b.cyl('y', 0.04, 0.05, 0.06, 0.2, 0.37, 0.02, C.chrome, 8);
      b.cyl('y', 0.14, 0.11, 0.08, -0.19, 0.18, 0.02, C.redPl, 12); for (let k = 0; k < 4; k++) b.blob(0.035, -0.23 + (k % 2) * 0.07, 0.24, -0.02 + Math.floor(k / 2) * 0.07, 0xb24a6a);
      return { footprint: { w: 0.8, d: 0.5, h: 0.81 }, placement: 'wall', use: standUse(0.5, 'use', 'Cuisiner', 0.5) };
    },
    better: b => {
      const w = 0.6, d = 0.6, f = d / 2 - 0.02;
      b.box(w, 0.86, d - 0.04, 0, 0, -0.02, C.white);
      b.box(w, 0.02, d - 0.04, 0, 0.86, -0.02, 0x2a2a2c);
      for (const z of [-0.16, 0.11]) b.box(0.54, 0.004, 0.25, 0, 0.88, z, W, topRect(FUV.hob));
      b.box(w, 0.14, 0.03, 0, 0.86, -d / 2 + 0.005, C.white);
      b.box(0.52, 0.48, 0.02, 0, 0.12, f + 0.01, 0xe9e9e4); b.box(0.38, 0.24, 0.005, 0, 0.26, f + 0.022, 0x1c1c1e);
      b.box(0.44, 0.02, 0.03, 0, 0.64, f + 0.03, C.chrome);
      for (let k = 0; k < 5; k++) b.cyl('z', 0.022, 0.022, 0.025, -0.2 + k * 0.1, 0.77, f + 0.0125, C.black, 8);
      b.cyl('y', 0.11, 0.1, 0.15, -0.14, 0.955, 0.11, C.chrome, 12); b.cyl('y', 0.112, 0.112, 0.012, -0.14, 1.036, 0.11, 0x9aa0a6, 12);
      return { footprint: { w: 0.6, d: 0.66, h: 1.05 }, placement: 'wall', use: standUse(0.66, 'use', 'Cuisiner', 0.5) };
    },
    premium: b => {
      const w = 0.9, d = 0.62, f = d / 2 - 0.02;
      b.box(w - 0.02, 0.08, d - 0.08, 0, 0, -0.03, C.black);
      b.box(w, 0.8, d - 0.04, 0, 0.08, -0.02, K.steel);
      b.box(w, 0.03, d - 0.04, 0, 0.88, -0.02, 0x1c1c1e);
      for (const [x, z] of [[-0.22, -0.15], [0.22, -0.15], [-0.22, 0.12]] as const) b.box(0.4, 0.004, 0.25, x, 0.91, z, W, topRect(FUV.hob));
      b.cyl('y', 0.1, 0.1, 0.012, 0.22, 0.916, 0.12, 0x333333, 12); b.cyl('y', 0.05, 0.05, 0.01, 0.22, 0.927, 0.12, 0x6a6e73, 10);
      for (const z of [-0.15, 0.12]) b.beam([-0.43, 0.925, z], [0.43, 0.925, z], 0.012, 0.012, 0x2a2a2c);
      b.box(0.5, 0.5, 0.02, -0.18, 0.15, f + 0.01, K.steel, { pz: { paint: 0xd8dcdf } }); b.box(0.36, 0.26, 0.005, -0.18, 0.27, f + 0.022, 0x1c1c1e); b.box(0.42, 0.02, 0.03, -0.18, 0.67, f + 0.035, C.chrome);
      b.box(0.32, 0.5, 0.02, 0.27, 0.15, f + 0.01, K.steel, { pz: { paint: 0xd8dcdf } }); b.box(0.2, 0.26, 0.005, 0.27, 0.27, f + 0.022, 0x1c1c1e); b.box(0.24, 0.02, 0.03, 0.27, 0.67, f + 0.035, C.chrome);
      for (let k = 0; k < 6; k++) b.cyl('z', 0.024, 0.024, 0.03, -0.35 + k * 0.14, 0.78, f + 0.015, C.black, 8);
      b.cyl('y', 0.12, 0.11, 0.17, -0.22, 1.0, -0.15, C.chrome, 12); b.cyl('y', 0.13, 0.13, 0.015, -0.22, 1.092, -0.15, 0x2a2a2c, 12);
      b.cyl('y', 0.13, 0.11, 0.05, 0.22, 0.95, 0.12, 0x2a2a2c, 12); b.beam([0.35, 0.95, 0.12], [0.48 - 0.04, 0.96, 0.12], 0.03, 0.02, 0x2a2a2c);
      b.box(w, 0.1, 0.5, 0, 1.62, -0.06, K.steel, { bottom: true, ny: { rect: FUV.bulb } });
      b.box(0.32, 0.5, 0.26, 0, 1.72, -0.18, K.steel);
      return { footprint: { w: 0.92, d: 0.66, h: 2.24 }, placement: 'wall', use: standUse(0.66, 'use', 'Cuisiner', 0.5) };
    },
  },
  // -------------------------------------------------------------------------------------------------- bathroom: a basin on its column, a vanity, a double vanity
  vanity: {
    basic: b => {
      b.cyl('y', 0.1, 0.07, 0.68, 0, 0.34, -0.06, C.white, 12);
      b.box(0.54, 0.16, 0.4, 0, 0.68, -0.02, C.white);
      b.box(0.42, 0.004, 0.26, 0, 0.84, 0.0, W, topRect(FUV.sink));
      b.beam([0, 0.84, -0.18], [0, 0.97, -0.18], 0.03, 0.03, C.chrome); b.beam([0, 0.97, -0.18], [0, 0.95, -0.08], 0.025, 0.025, C.chrome);
      b.box(0.08, 0.025, 0.05, 0.19, 0.84, -0.15, 0xd98ab0);
      return { footprint: { w: 0.56, d: 0.44, h: 0.99 }, placement: 'wall', use: standUse(0.44, 'wash', 'Se rafraîchir', 0.45) };
    },
    better: b => {
      const w = 0.7, d = 0.46, f = d / 2 - 0.02;
      b.box(w - 0.04, 0.08, d - 0.08, 0, 0, -0.03, C.dark);
      b.box(w, 0.72, d - 0.04, 0, 0.08, -0.02, C.varnish, { pz: { rect: FUV.wood, paint: C.varnishLight } });
      b.box(0.006, 0.66, 0.005, 0, 0.11, f + 0.0025, C.dark); for (const sx of [-1, 1]) b.box(0.02, 0.12, 0.025, sx * 0.05, 0.6, f + 0.012, C.gold);
      b.slab(w + 0.02, 0.04, d + 0.02, 0, 0.8, 0, W, { py: { rect: FUV.marble } });
      b.box(0.44, 0.004, 0.28, 0, 0.84, 0.02, W, topRect(FUV.sink));
      b.beam([0, 0.84, -0.17], [0, 0.98, -0.17], 0.03, 0.03, C.chrome); b.beam([0, 0.98, -0.17], [0, 0.96, -0.07], 0.025, 0.025, C.chrome); b.box(0.05, 0.02, 0.03, 0.06, 0.95, -0.17, C.chrome);
      b.cyl('y', 0.035, 0.03, 0.1, -0.26, 0.89, -0.15, 0x8fd0c0, 8); for (let k = 0; k < 2; k++) b.beam([-0.27 + k * 0.02, 0.9, -0.15], [-0.28 + k * 0.04, 0.99, -0.14], 0.01, 0.01, [0xd9322b, 0x2f6fb3][k]);
      b.box(0.08, 0.025, 0.05, 0.26, 0.84, -0.14, 0xf4c20d);
      return { footprint: { w: 0.72, d: 0.48, h: 1.02 }, placement: 'wall', use: standUse(0.48, 'wash', 'Se rafraîchir', 0.45) };
    },
    premium: b => {
      const w = 1.2, d = 0.52, f = d / 2 - 0.05;
      b.box(w, 0.42, d - 0.06, 0, 0.4, -0.03, K.walnut, { pz: { rect: FUV.wood, paint: 0x7a5232 } });
      b.box(w - 0.04, 0.006, 0.005, 0, 0.61, f + 0.0025, C.darker); b.box(0.006, 0.4, 0.005, 0, 0.41, f + 0.0025, C.darker);
      for (const sx of [-1, 1]) for (const y of [0.53, 0.74]) b.box(0.26, 0.015, 0.02, sx * 0.3, y, f + 0.01, C.gold);
      b.slab(w + 0.02, 0.05, d, 0, 0.82, 0, W, { py: { rect: FUV.marble }, pz: { rect: FUV.marble } });
      for (const sx of [-1, 1]) {
        b.cyl('y', 0.16, 0.2, 0.13, sx * 0.3, 0.935, 0.03, C.white, 14, { neg: false, pos: FUV.sink });
        b.beam([sx * 0.3, 0.87, -0.2], [sx * 0.3, 1.12, -0.2], 0.03, 0.03, C.chrome); b.beam([sx * 0.3, 1.12, -0.2], [sx * 0.3, 1.1, -0.08], 0.025, 0.025, C.chrome);
        b.box(0.03, 0.4, 0.03, sx * 0.56, 0, -0.03, C.chrome);
      }
      b.cyl('y', 0.035, 0.035, 0.16, 0, 0.95, -0.17, 0xd8d2c8, 8); b.cyl('y', 0.008, 0.008, 0.05, 0, 1.055, -0.17, C.chrome, 4);
      b.slab(w - 0.06, 0.025, 0.4, 0, 0.12, -0.03, K.walnut);
      for (const [x, c] of [[-0.36, K.towel], [-0.2, K.sky], [-0.04, K.towel]] as const) b.cyl('x', 0.06, 0.06, 0.14, x, 0.205, 0.0, c, 10, { neg: true, pos: true, side: FUV.towel });
      b.cyl('y', 0.13, 0.11, 0.16, 0.3, 0.225, -0.02, 0xb98a52, 12, { neg: true, pos: false, side: FUV.rattan });
      return { footprint: { w: 1.22, d: 0.54, h: 1.16 }, placement: 'wall', use: standUse(0.54, 'wash', 'Se rafraîchir', 0.45) };
    },
  },
  // -------------------------------------------------------------------------------------------------- bathroom mirrors, on the wall
  bathMirror: {
    basic: b => {
      b.cyl('z', 0.26, 0.26, 0.03, 0, 1.55, -0.015, 0xb98a52, 20, { neg: true, pos: true, side: FUV.rattan });
      b.cyl('z', 0.22, 0.22, 0.006, 0, 1.55, 0.003, W, 20, { neg: false, pos: FUV.mirror });
      return { footprint: { w: 0.52, d: 0.06, h: 1.81 }, placement: 'wall', use: standUse(0.06, 'use', 'Se préparer', 0.6) };
    },
    better: b => {
      const z0 = -0.075;
      b.box(0.6, 0.66, 0.13, 0, 1.16, z0 + 0.065, C.white);
      b.box(0.56, 0.62, 0.006, 0, 1.18, z0 + 0.133, W, { pz: { rect: FUV.mirror } });
      b.box(0.012, 0.1, 0.012, 0.24, 1.46, z0 + 0.142, C.chrome);
      b.box(0.5, 0.05, 0.08, 0, 1.82, z0 + 0.06, C.chrome, { ny: { rect: FUV.bulb }, pz: { rect: FUV.bulb } });
      b.slab(0.5, 0.02, 0.12, 0, 1.08, z0 + 0.06, C.white);
      b.cyl('y', 0.035, 0.03, 0.1, -0.12, 1.15, z0 + 0.07, 0x8fd0c0, 8); for (let k = 0; k < 2; k++) b.beam([-0.13 + k * 0.02, 1.15, z0 + 0.07], [-0.14 + k * 0.04, 1.24, z0 + 0.08], 0.01, 0.01, [0xd9322b, 0x2f6fb3][k]);
      b.box(0.06, 0.12, 0.05, 0.12, 1.1, z0 + 0.07, 0xf2f2ec);
      return { footprint: { w: 0.6, d: 0.15, h: 1.88 }, placement: 'wall', use: standUse(0.15, 'use', 'Se préparer', 0.6) };
    },
    premium: (b, g) => {
      const z0 = -0.07;
      b.box(0.9, 0.8, 0.03, 0, 1.1, z0 + 0.015, 0x2a2a2c);
      b.box(0.84, 0.74, 0.005, 0, 1.13, z0 + 0.0325, W, { pz: { rect: FUV.mirror } });
      b.box(0.86, 0.02, 0.008, 0, 1.86, z0 + 0.034, W, { pz: { rect: FUV.led }, py: { rect: FUV.led } }); b.box(0.86, 0.02, 0.008, 0, 1.115, z0 + 0.034, W, { pz: { rect: FUV.led } });
      for (const sx of [-1, 1]) b.box(0.02, 0.74, 0.008, sx * 0.43, 1.125, z0 + 0.034, W, { pz: { rect: FUV.led } });
      g.slab(0.7, 0.012, 0.11, 0, 1.0, z0 + 0.065, 0xd8eef4);
      for (const sx of [-1, 1]) b.box(0.02, 0.04, 0.1, sx * 0.3, 0.97, z0 + 0.06, C.chrome);
      for (let k = 0; k < 4; k++) { const h = [0.16, 0.1, 0.13, 0.08][k]; b.cyl('y', 0.025, 0.03, h, -0.22 + k * 0.13, 1.012 + h / 2, z0 + 0.065, [0xf2f2ec, 0xd98ab0, 0x8fd0c0, C.gold][k], 8); }
      return { footprint: { w: 0.92, d: 0.14, h: 1.92 }, placement: 'wall', use: standUse(0.14, 'use', 'Se préparer', 0.6) };
    },
  },
  // -------------------------------------------------------------------------------------------------- towel rails, on the wall
  towelRail: {
    basic: b => {
      const z0 = -0.05;
      for (const sx of [-1, 1]) b.box(0.03, 0.05, 0.07, sx * 0.26, 0.975, z0 + 0.035, C.chrome);
      b.cyl('x', 0.012, 0.012, 0.56, 0, 1.0, z0 + 0.06, C.chrome, 8);
      b.box(0.4, 0.4, 0.006, -0.02, 0.6, z0 + 0.075, W, { pz: { rect: FUV.towel } }); b.box(0.4, 0.36, 0.006, -0.02, 0.64, z0 + 0.045, W, { nz: { rect: FUV.towel } });
      b.cyl('x', 0.018, 0.018, 0.4, -0.02, 1.003, z0 + 0.06, K.towel, 8);
      return { footprint: { w: 0.58, d: 0.1, h: 1.04 }, placement: 'wall', use: standUse(0.1, 'use', 'Prendre une serviette', 0.5) };
    },
    better: b => {
      const z0 = -0.1;
      b.box(0.62, 0.32, 0.02, 0, 1.18, z0 + 0.01, C.varnish, { pz: { rect: FUV.wood, paint: C.varnishLight } });
      for (const sx of [-1, 1]) { b.box(0.03, 0.12, 0.17, sx * 0.29, 1.4, z0 + 0.105, C.varnish); b.box(0.03, 0.22, 0.15, sx * 0.29, 1.12, z0 + 0.095, C.varnish); }
      b.slab(0.62, 0.025, 0.2, 0, 1.52, 0, C.varnish, { py: { rect: FUV.wood, paint: C.varnishLight } });
      b.box(0.24, 0.07, 0.16, -0.15, 1.545, 0.0, K.towel, { pz: { rect: FUV.towel }, px: { rect: FUV.towel } }); b.box(0.24, 0.06, 0.16, 0.15, 1.545, 0.0, K.sky);
      for (const y of [1.16, 1.3]) b.cyl('x', 0.015, 0.015, 0.56, 0, y, z0 + 0.15, C.varnish, 8);
      b.box(0.36, 0.38, 0.006, 0.05, 0.78, z0 + 0.168, W, { pz: { rect: FUV.towel } }); b.box(0.36, 0.34, 0.006, 0.05, 0.82, z0 + 0.132, W, { nz: { rect: FUV.towel } });
      b.cyl('x', 0.02, 0.02, 0.36, 0.05, 1.163, z0 + 0.15, K.towel, 8);
      return { footprint: { w: 0.62, d: 0.2, h: 1.6 }, placement: 'wall', use: standUse(0.2, 'use', 'Prendre une serviette', 0.5) };
    },
    premium: b => {
      const z0 = -0.05, zr = z0 + 0.06;
      for (const sx of [-1, 1]) { b.cyl('y', 0.016, 0.016, 1.2, sx * 0.25, 1.05, zr, C.chrome, 8); for (const y of [0.55, 1.55]) b.box(0.03, 0.03, 0.06, sx * 0.25, y, z0 + 0.03, C.chrome); }
      for (let k = 0; k < 9; k++) b.cyl('x', 0.011, 0.011, 0.5, 0, 0.5 + k * 0.14, zr, C.chrome, 6);
      b.box(0.36, 0.36, 0.006, 0, 1.0, zr + 0.018, W, { pz: { rect: FUV.towel } }); b.box(0.36, 0.32, 0.006, 0, 1.04, zr - 0.018, W, { nz: { rect: FUV.towel } });
      b.cyl('x', 0.02, 0.02, 0.36, 0, 1.36, zr, K.towel, 8);
      b.box(0.22, 0.2, 0.005, -0.1, 0.52, zr + 0.016, K.sky); b.cyl('x', 0.018, 0.018, 0.22, -0.1, 0.72, zr, K.sky, 8);
      b.cyl('x', 0.025, 0.025, 0.04, 0.29, 0.6, zr, C.white, 8);
      return { footprint: { w: 0.62, d: 0.1, h: 1.67 }, placement: 'wall', use: standUse(0.1, 'use', 'Prendre une serviette', 0.5) };
    },
  },
  // -------------------------------------------------------------------------------------------------- floor lamps
  floorLamp: {
    basic: b => {
      b.cyl('y', 0.18, 0.2, 0.04, 0, 0.02, 0, C.varnish, 14);
      b.cyl('y', 0.018, 0.018, 1.4, 0, 0.74, 0, C.varnish, 6);
      b.cyl('y', 0.04, 0.04, 0.06, 0, 1.44, 0, C.gold, 8);
      b.cyl('y', 0.21, 0.19, 0.3, 0, 1.58, 0, W, 14, { neg: FUV.bulb, pos: false, side: FUV.shade });
      return { footprint: { w: 0.44, d: 0.44, h: 1.74 }, placement: 'free', use: standUse(0.44, 'use', 'Allumer la lampe', 0.45) };
    },
    better: b => {
      const top = 1.3;
      for (let k = 0; k < 3; k++) { const a = k * Math.PI * 2 / 3 + Math.PI / 6; b.beam([0, top, 0], [Math.sin(a) * 0.24, 0.016, Math.cos(a) * 0.24], 0.03, 0.03, C.varnish); }
      b.cyl('y', 0.035, 0.035, 0.1, 0, top + 0.02, 0, C.dark, 8);
      b.cyl('y', 0.26, 0.15, 0.32, 0, top + 0.2, 0, W, 16, { neg: FUV.bulb, pos: false, side: FUV.shade });
      b.beam([0, top - 0.05, 0], [0.1, 0.4, -0.08], 0.008, 0.008, C.black);
      return { footprint: { w: 0.56, d: 0.56, h: 1.67 }, placement: 'free', use: standUse(0.56, 'use', 'Allumer la lampe', 0.45) };
    },
    premium: b => {
      const bz = -0.36, sz = 0.34;
      const m = { rect: FUV.marble };
      b.box(0.3, 0.24, 0.3, 0, 0, bz, W, { pz: m, nz: m, px: m, nx: m, py: m });
      const P0: V3 = [0, 0.24, bz], P1: V3 = [0, 2.35, bz + 0.05], P2: V3 = [0, 1.84, sz];
      const pt = (t: number): V3 => [0, (1 - t) ** 2 * P0[1] + 2 * (1 - t) * t * P1[1] + t * t * P2[1], (1 - t) ** 2 * P0[2] + 2 * (1 - t) * t * P1[2] + t * t * P2[2]];
      for (let k = 0; k < 10; k++) b.beam(pt(k / 10), pt((k + 1) / 10), 0.024, 0.024, C.chrome);
      b.cyl('y', 0.22, 0.06, 0.2, 0, 1.72, sz, C.chrome, 16, { neg: FUV.bulb, pos: true });
      return { footprint: { w: 0.44, d: 1.12, h: 1.98 }, placement: 'free', use: standUse(1.12, 'use', 'Allumer la lampe', 0.45) };
    },
  },
  // -------------------------------------------------------------------------------------------------- hanging lamps, from the ceiling (2.8 m)
  pendant: {
    basic: b => {
      b.cyl('y', 0.06, 0.06, 0.03, 0, 2.785, 0, C.white, 10);
      b.cyl('y', 0.006, 0.006, 0.36, 0, 2.59, 0, C.black, 4);
      b.cyl('y', 0.24, 0.07, 0.24, 0, 2.3, 0, W, 16, { neg: FUV.bulb, pos: FUV.rattan, side: FUV.rattan });
      return { footprint: { w: 0.5, d: 0.5, h: 2.8 }, placement: 'free', use: standUse(0.5, 'use', 'Allumer la lumière', 0.5) };
    },
    better: b => {
      b.cyl('y', 0.06, 0.06, 0.03, 0, 2.785, 0, C.white, 10);
      b.cyl('y', 0.006, 0.006, 0.33, 0, 2.605, 0, C.black, 4);
      b.cyl('y', 0.28, 0.25, 0.08, 0, 2.14, 0, W, 16, { neg: FUV.bulb, pos: false, side: FUV.calabash });
      b.cyl('y', 0.25, 0.17, 0.1, 0, 2.23, 0, W, 16, { neg: false, pos: false, side: FUV.calabash });
      b.cyl('y', 0.17, 0.05, 0.1, 0, 2.33, 0, W, 16, { neg: false, pos: true, capPaint: 0xc99a55, side: FUV.calabash });
      b.cyl('y', 0.04, 0.03, 0.06, 0, 2.41, 0, C.gold, 8);
      return { footprint: { w: 0.58, d: 0.58, h: 2.8 }, placement: 'free', use: standUse(0.58, 'use', 'Allumer la lumière', 0.5) };
    },
    premium: (b, g) => {
      b.cyl('y', 0.07, 0.07, 0.03, 0, 2.785, 0, C.gold, 10);
      b.cyl('y', 0.012, 0.012, 0.42, 0, 2.56, 0, C.gold, 6);
      b.cyl('y', 0.06, 0.1, 0.16, 0, 2.27, 0, C.gold, 10); b.blob(0.07, 0, 2.15, 0, C.gold, [1, 0.8, 1], 1);
      for (let k = 0; k < 6; k++) {
        const a = k * Math.PI / 3, c = (k + 1) * Math.PI / 3, x = Math.sin(a) * 0.34, z = Math.cos(a) * 0.34;
        b.beam([0, 2.2, 0], [x, 2.12, z], 0.02, 0.02, C.gold);
        b.beam([x, 2.1, z], [Math.sin(c) * 0.34, 2.1, Math.cos(c) * 0.34], 0.018, 0.018, C.gold);
        b.cyl('y', 0.035, 0.025, 0.04, x, 2.14, z, C.gold, 8);
        b.cyl('y', 0.014, 0.014, 0.08, x, 2.2, z, W, 6, { neg: false, pos: FUV.bulb, side: FUV.bulb });
        g.blob(0.022, Math.sin(a + 0.5) * 0.3, 2.02, Math.cos(a + 0.5) * 0.3, 0xe8f4ff, [0.8, 1.4, 0.8]);
      }
      g.blob(0.04, 0, 2.0, 0, 0xe8f4ff, [1, 1.5, 1], 1);
      return { footprint: { w: 0.8, d: 0.8, h: 2.8 }, placement: 'free', use: standUse(0.8, 'use', 'Allumer la lumière', 0.5) };
    },
  },
  // -------------------------------------------------------------------------------------------------- bedside tables and their lamps
  bedside: {
    basic: b => {
      legs4(b, 0.3, 0.3, 0.4, 0.035, C.raw); b.slab(0.34, 0.03, 0.34, 0, 0.4, 0, C.raw, { py: { rect: FUV.wood, paint: C.raw } });
      b.slab(0.28, 0.02, 0.28, 0, 0.12, 0, C.rawDark); b.slab(0.2, 0.04, 0.16, 0, 0.14, 0.02, W, topRect(FUV.wax0));
      b.box(0.12, 0.18, 0.12, 0, 0.43, 0, C.white, { pz: { rect: FUV.bulb }, nz: { rect: FUV.bulb } }); b.slab(0.14, 0.03, 0.14, 0, 0.61, 0, 0xd9322b);
      b.beam([-0.05, 0.64, 0], [0, 0.71, 0], 0.015, 0.015, 0x333333); b.beam([0.05, 0.64, 0], [0, 0.71, 0], 0.015, 0.015, 0x333333);
      return { footprint: { w: 0.34, d: 0.34, h: 0.73 }, placement: 'free', use: standUse(0.34, 'use', 'Allumer la lampe', 0.45) };
    },
    better: b => {
      legs4(b, 0.42, 0.36, 0.12, 0.04, C.varnish);
      b.box(0.46, 0.42, 0.4, 0, 0.12, 0, C.varnish, { pz: { rect: FUV.wood, paint: C.varnishLight }, px: { rect: FUV.wood, paint: C.varnish }, nx: { rect: FUV.wood, paint: C.varnish } });
      b.box(0.38, 0.16, 0.01, 0, 0.36, 0.205, C.varnishLight); b.box(0.04, 0.03, 0.025, 0, 0.43, 0.215, C.gold);
      b.box(0.38, 0.17, 0.01, 0, 0.15, 0.2, C.darker);
      b.box(0.24, 0.06, 0.16, -0.04, 0.16, 0.1, W, { pz: { rect: FUV.books } });
      b.slab(0.48, 0.03, 0.42, 0, 0.54, 0, C.varnish, { py: { rect: FUV.wood, paint: C.varnishLight } });
      b.cyl('y', 0.06, 0.07, 0.14, 0.1, 0.64, -0.05, 0xd9cfb8, 10); b.cyl('y', 0.012, 0.012, 0.12, 0.1, 0.77, -0.05, C.gold, 6);
      b.cyl('y', 0.13, 0.1, 0.18, 0.1, 0.9, -0.05, W, 12, { neg: FUV.bulb, pos: false, side: FUV.shade });
      b.box(0.18, 0.03, 0.13, -0.12, 0.57, 0.05, 0x8a1c1c);
      return { footprint: { w: 0.48, d: 0.46, h: 0.99 }, placement: 'free', use: standUse(0.46, 'use', 'Allumer la lampe', 0.45) };
    },
    premium: b => {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.06, 0.08, 0.06, sx * 0.21, 0, sz * 0.16, C.gold);
      b.box(0.5, 0.52, 0.4, 0, 0.08, 0, C.darker, { pz: { rect: FUV.carved, paint: C.dark }, px: { rect: FUV.carved, paint: C.dark }, nx: { rect: FUV.carved, paint: C.dark } });
      b.box(0.46, 0.006, 0.005, 0, 0.34, 0.2025, C.gold); for (const y of [0.2, 0.46]) b.box(0.14, 0.02, 0.025, 0, y, 0.21, C.gold);
      b.slab(0.52, 0.03, 0.42, 0, 0.6, 0, W, { py: { rect: FUV.marble } });
      b.cyl('y', 0.08, 0.05, 0.05, 0.1, 0.655, -0.05, C.gold, 12); b.cyl('y', 0.015, 0.02, 0.2, 0.1, 0.78, -0.05, C.gold, 6); b.blob(0.05, 0.1, 0.72, -0.05, C.gold, [1, 1.2, 1], 1);
      b.cyl('y', 0.15, 0.1, 0.2, 0.1, 0.96, -0.05, W, 14, { neg: FUV.bulb, pos: false, side: FUV.shade }); b.cyl('y', 0.152, 0.152, 0.015, 0.1, 0.86, -0.05, C.gold, 14, { neg: false, pos: false });
      b.cyl('y', 0.03, 0.05, 0.12, -0.14, 0.69, 0.06, 0x1f5aa8, 8); b.blob(0.04, -0.14, 0.78, 0.06, 0xd94a8c);
      return { footprint: { w: 0.52, d: 0.45, h: 1.07 }, placement: 'free', use: standUse(0.45, 'use', 'Allumer la lampe', 0.45) };
    },
  },
  // -------------------------------------------------------------------------------------------------- chests and dressing tables
  dresser: {
    basic: b => {
      legs4(b, 0.76, 0.38, 0.1, 0.05, C.rawDark);
      b.box(0.8, 0.75, 0.42, 0, 0.1, -0.015, K.teal);
      for (let k = 0; k < 3; k++) { const y = 0.13 + k * 0.24; b.box(0.74, 0.21, 0.012, 0, y, 0.201, 0x5aa0a6); for (const sx of [-1, 1]) b.cyl('z', 0.02, 0.02, 0.025, sx * 0.2, y + 0.105, 0.219, C.gold, 8); }
      b.slab(0.82, 0.03, 0.44, 0, 0.85, 0, C.raw, { py: { rect: FUV.wood, paint: C.raw } });
      b.box(0.14, 0.22, 0.02, -0.25, 0.88, -0.1, C.raw); b.box(0.11, 0.17, 0.004, -0.25, 0.905, -0.088, W, { pz: { rect: FUV.mirror } });
      b.cyl('y', 0.11, 0.09, 0.12, 0.22, 0.94, 0.0, W, 12, { neg: true, pos: false, side: FUV.rattan });
      b.cyl('y', 0.025, 0.03, 0.1, 0.0, 0.93, 0.06, 0xd98ab0, 8);
      return { footprint: { w: 0.82, d: 0.47, h: 1.1 }, placement: 'wall', use: standUse(0.47, 'use', 'Se changer', 0.55) };
    },
    better: b => {
      const d = 0.46;
      for (const sx of [-1, 1]) {
        b.box(0.3, 0.72, 0.42, sx * 0.35, 0, -0.01, C.varnish, { pz: { rect: FUV.wood, paint: C.varnishLight } });
        for (let k = 0; k < 3; k++) { b.box(0.27, 0.005, 0.005, sx * 0.35, 0.24 * k + 0.24, 0.2, C.dark); b.box(0.06, 0.02, 0.02, sx * 0.35, 0.24 * k + 0.12, 0.205, C.gold); }
      }
      b.slab(1.0, 0.035, d, 0, 0.72, 0, C.varnish, { py: { rect: FUV.wood, paint: C.varnishLight } });
      b.box(0.66, 0.78, 0.03, 0, 0.755, -d / 2 + 0.035, C.varnish, { pz: { rect: FUV.wood, paint: C.varnishLight } });
      b.box(0.54, 0.66, 0.005, 0, 0.815, -d / 2 + 0.053, W, { pz: { rect: FUV.mirror } });
      for (let k = 0; k < 3; k++) b.cyl('y', 0.025, 0.03, 0.08 + k * 0.02, -0.12 + k * 0.08, 0.795 + k * 0.01, -0.08, [0xd98ab0, 0xf4c20d, 0x8fd0c0][k], 8);
      b.cyl('y', 0.16, 0.16, 0.04, 0, 0.36, 0.04, C.varnish, 12); b.cyl('y', 0.15, 0.15, 0.06, 0, 0.41, 0.04, 0x9a2234, 12, { neg: false, pos: FUV.velvet });
      for (let k = 0; k < 4; k++) { const a = Math.PI / 4 + k * Math.PI / 2; b.box(0.03, 0.34, 0.03, Math.sin(a) * 0.11, 0, 0.04 + Math.cos(a) * 0.11, C.varnish); }
      return { footprint: { w: 1.0, d: 0.46, h: 1.54 }, placement: 'wall', use: standUse(0.46, 'use', 'Se préparer', 0.55) };
    },
    premium: b => {
      const d = 0.5;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.beam([sx * 0.52, 0.62, sz * 0.18], [sx * 0.56, 0.012, sz * 0.21], 0.05, 0.05, W);
      b.box(1.16, 0.16, 0.44, 0, 0.6, -0.01, W, { pz: { rect: FUV.carved, paint: 0xf2ece0 } });
      for (const sx of [-1, 1]) b.box(0.12, 0.025, 0.02, sx * 0.3, 0.67, 0.22, C.gold);
      b.slab(1.2, 0.04, d, 0, 0.76, 0, W, { py: { rect: FUV.marble }, pz: { paint: C.gold } });
      b.box(0.5, 0.86, 0.04, 0, 0.8, -d / 2 + 0.04, C.gold, { pz: { rect: FUV.carved, paint: C.gold } }); b.box(0.42, 0.74, 0.005, 0, 0.85, -d / 2 + 0.062, W, { pz: { rect: FUV.mirror } });
      b.box(0.3, 0.14, 0.04, 0, 1.66, -d / 2 + 0.04, C.gold, { pz: { rect: FUV.gold } });
      for (const sx of [-1, 1]) b.at(sx * 0.25, 0.82, -d / 2 + 0.04, -sx * 0.55, () => { b.box(0.3, 0.72, 0.03, sx * 0.15, 0, 0, C.gold, { pz: { rect: FUV.carved, paint: C.gold } }); b.box(0.24, 0.62, 0.005, sx * 0.15, 0.05, 0.018, W, { pz: { rect: FUV.mirror } }); });
      for (let k = 0; k < 4; k++) b.cyl('y', 0.025, 0.035, 0.1 + (k % 2) * 0.04, -0.33 + k * 0.08, 0.85 + (k % 2) * 0.02, -0.06, [0xd98ab0, C.gold, 0x8fd0c0, 0x9a2234][k], 8);
      b.cyl('y', 0.17, 0.17, 0.06, 0, 0.4, 0.06, C.gold, 14, { neg: true, pos: false }); b.cyl('y', 0.16, 0.16, 0.08, 0, 0.47, 0.06, 0x9a2234, 14, { neg: false, pos: FUV.velvet });
      for (let k = 0; k < 4; k++) { const a = Math.PI / 4 + k * Math.PI / 2; b.beam([Math.sin(a) * 0.12, 0.38, 0.06 + Math.cos(a) * 0.12], [Math.sin(a) * 0.14, 0.012, 0.06 + Math.cos(a) * 0.14], 0.03, 0.03, C.gold); }
      return { footprint: { w: 1.2, d: 0.52, h: 1.8 }, placement: 'wall', use: standUse(0.52, 'use', 'Se préparer', 0.55) };
    },
  },
  // -------------------------------------------------------------------------------------------------- wardrobes: an open rail, a three-door wardrobe, a dressing
  closet: {
    basic: b => {
      for (const sx of [-1, 1]) { b.box(0.03, 1.62, 0.03, sx * 0.47, 0.02, 0, C.chrome); b.box(0.04, 0.03, 0.46, sx * 0.47, 0, 0, C.chrome); }
      b.cyl('x', 0.016, 0.016, 0.98, 0, 1.62, 0, C.chrome, 8);
      b.slab(0.9, 0.02, 0.4, 0, 0.12, 0, 0x8a8e93);
      const prints = [FUV.wax0, FUV.wax1, FUV.cloth, FUV.wax2, FUV.canvas, FUV.wax1];
      prints.forEach((r, k) => garment(b, -0.35 + k * 0.14, 1.62, 0, [0.95, 1.05, 0.7, 1.1, 0.75, 0.9][k], r, 0.38));
      for (let k = 0; k < 3; k++) b.box(0.12, 0.08, 0.22, -0.25 + k * 0.25, 0.14, 0.02, [0x3a2418, C.black, 0xc8322a][k]);
      return { footprint: { w: 1.0, d: 0.5, h: 1.72 }, placement: 'wall', use: standUse(0.5, 'use', 'Se changer', 0.6) };
    },
    better: b => {
      const w = 1.5, d = 0.6, f = d / 2 - 0.02;
      b.box(w - 0.04, 0.08, d - 0.08, 0, 0, -0.03, C.dark);
      b.box(w, 1.86, d - 0.04, 0, 0.08, -0.02, C.varnish, { pz: { rect: FUV.wood, paint: C.varnishLight } });
      for (const x of [-0.25, 0.25]) b.box(0.006, 1.8, 0.005, x, 0.11, f + 0.0025, C.dark);
      b.box(0.42, 1.5, 0.004, 0, 0.25, f + 0.004, W, { pz: { rect: FUV.mirror } });
      for (const x of [-0.29, 0.29, -0.21, 0.21]) b.box(0.02, 0.16, 0.025, x, 0.95, f + 0.012, C.gold);
      b.slab(w + 0.04, 0.08, d, 0, 1.94, -0.01, C.varnish);
      b.box(0.5, 0.14, 0.4, 0.3, 2.02, -0.05, 0x1f5aa8); b.box(0.06, 0.02, 0.1, 0.3, 2.16, -0.05, C.black);
      return { footprint: { w: 1.54, d: 0.62, h: 2.18 }, placement: 'wall', use: standUse(0.62, 'use', 'Se changer', 0.65) };
    },
    premium: b => {
      const w = 2.2, d = 0.62, back = -d / 2, f = d / 2 - 0.02, L = K.lacquer;
      b.box(w, 0.08, d - 0.06, 0, 0, -0.03, 0x8a8478);
      for (const x of [-1.09, -0.36, 0.36, 1.09]) b.box(0.03, 2.08, d - 0.02, x, 0.08, -0.01, L);
      b.box(w, 2.08, 0.02, 0, 0.08, back + 0.01, 0xd8cfbf);
      b.slab(w, 0.08, d, 0, 2.16, 0, L);
      b.box(w - 0.04, 0.02, 0.02, 0, 2.13, f - 0.01, W, { ny: { rect: FUV.led } });
      for (const x of [-0.905, -0.545]) { b.box(0.34, 2.0, 0.02, x, 0.12, f, L, { pz: { rect: FUV.mirror } }); b.box(0.015, 0.9, 0.02, x + (x < -0.7 ? 0.15 : -0.15), 0.6, f + 0.02, C.gold); }
      for (let k = 0; k < 3; k++) { const y = 0.1 + k * 0.17; b.box(0.68, 0.15, 0.02, 0, y, f, L); b.box(0.24, 0.015, 0.02, 0, y + 0.1, f + 0.02, C.gold); }
      for (let s = 0; s < 4; s++) {
        const y = 0.66 + s * 0.36; b.slab(0.7, 0.02, d - 0.04, 0, y, -0.01, L);
        for (let k = 0; k < 3; k++) b.box(0.18, 0.05 + (k % 2) * 0.03, 0.3, -0.22 + k * 0.22, y + 0.02, 0.0, [0xd9322b, 0x1f5aa8, 0xf2e6c8, 0x2e8b4c, 0xf4c20d, 0x8a1c1c][(s + k * 2) % 6], { py: { rect: [FUV.wax0, FUV.cloth, FUV.wax1][k], paint: W } });
      }
      b.cyl('x', 0.015, 0.015, 0.7, 0.725, 1.9, -0.02, C.gold, 8);
      [FUV.wax2, FUV.wax0, FUV.cloth, FUV.wax1, FUV.velvet].forEach((r, k) => garment(b, 0.45 + k * 0.13, 1.9, -0.02, [1.2, 1.3, 0.9, 1.25, 1.0][k], r, 0.42));
      b.at(0.725, 0.12, 0.0, 0, () => { b.box(0.68, 0.02, 0.4, 0, 0, 0, L); for (let k = 0; k < 4; k++) b.box(0.1, 0.07, 0.22, -0.24 + k * 0.16, 0.02, 0.0, [C.black, 0xc9a043, 0x8a1c1c, 0xf2f2ec][k]); }, 0.25);
      return { footprint: { w: 2.2, d: 0.64, h: 2.24 }, placement: 'wall', use: standUse(0.64, 'use', 'Se changer', 0.65) };
    },
  },
  // -------------------------------------------------------------------------------------------------- pictures, on the wall
  wallArt: {
    basic: b => {
      const z0 = -0.02;
      b.box(0.5, 0.7, 0.008, 0, 1.25, z0 + 0.004, C.white);
      b.box(0.44, 0.64, 0.004, 0, 1.28, z0 + 0.012, W, { pz: { rect: FUV.art0 } });
      b.box(0.52, 0.03, 0.02, 0, 1.94, z0 + 0.01, C.black); b.box(0.52, 0.03, 0.02, 0, 1.24, z0 + 0.01, C.black);
      for (const sx of [-1, 1]) b.box(0.03, 0.73, 0.02, sx * 0.245, 1.24, z0 + 0.01, C.black);
      return { footprint: { w: 0.52, d: 0.04, h: 1.97 }, placement: 'wall', use: standUse(0.04, 'inspect', 'Regarder le tableau', 0.8) };
    },
    better: b => {
      const z0 = -0.02, flip: Rect = [FUV.art1[2], FUV.art1[1], FUV.art1[0], FUV.art1[3]];
      for (const [x, y, r] of [[-0.2, 1.3, FUV.art1], [0.2, 1.38, flip]] as const) {
        const w = 0.34, h = 0.46;
        b.box(w - 0.04, h - 0.04, 0.004, x, y + 0.02, z0 + 0.012, W, { pz: { rect: r } });
        b.box(w, 0.03, 0.022, x, y + h - 0.03, z0 + 0.011, 0xd9322b); b.box(w, 0.03, 0.022, x, y, z0 + 0.011, 0xd9322b);
        for (const sx of [-1, 1]) b.box(0.03, h - 0.06, 0.022, x + sx * (w / 2 - 0.015), y + 0.03, z0 + 0.011, 0x1a9d54);
      }
      return { footprint: { w: 0.76, d: 0.04, h: 1.86 }, placement: 'wall', use: standUse(0.04, 'inspect', 'Regarder les sous-verre', 0.8) };
    },
    premium: b => {
      const z0 = -0.08, gd = { rect: FUV.gold };
      b.box(1.36, 0.88, 0.03, 0, 1.03, z0 + 0.015, W, { pz: { rect: FUV.art2 } });
      b.box(1.46, 0.06, 0.06, 0, 1.91, z0 + 0.03, C.gold, { pz: gd, py: gd }); b.box(1.46, 0.06, 0.06, 0, 0.97, z0 + 0.03, C.gold, { pz: gd });
      for (const sx of [-1, 1]) b.box(0.06, 0.88, 0.06, sx * 0.7, 1.03, z0 + 0.03, C.gold, { pz: gd });
      for (const sx of [-1, 1]) b.beam([sx * 0.2, 1.97, z0 + 0.03], [sx * 0.2, 2.02, z0 + 0.115], 0.015, 0.015, C.gold);
      b.cyl('x', 0.022, 0.022, 0.56, 0, 2.025, z0 + 0.12, C.gold, 8); b.box(0.5, 0.006, 0.02, 0, 1.998, z0 + 0.12, W, { ny: { rect: FUV.bulb } });
      return { footprint: { w: 1.46, d: 0.16, h: 2.06 }, placement: 'wall', use: standUse(0.16, 'inspect', 'Regarder le tableau', 1.0) };
    },
  },
  // -------------------------------------------------------------------------------------------------- TV wall units
  tvWall: {
    basic: b => {
      for (const x of [-0.5, 0.5]) { b.box(0.2, 0.19, 0.3, x, 0, 0, C.cement); b.box(0.2, 0.19, 0.3, x, 0.22, 0, C.cement); }
      b.slab(1.3, 0.03, 0.36, 0, 0.19, 0, C.raw); b.slab(1.3, 0.03, 0.36, 0, 0.41, 0, C.raw, { py: { rect: FUV.wood, paint: C.raw } });
      b.box(0.26, 0.02, 0.16, 0, 0.44, -0.04, C.black); b.box(0.04, 0.08, 0.04, 0, 0.46, -0.05, C.black);
      b.box(0.82, 0.5, 0.05, 0, 0.5, -0.05, C.black); b.box(0.77, 0.45, 0.006, 0, 0.525, -0.022, W, { pz: { rect: FUV.flat } });
      b.box(0.24, 0.05, 0.18, 0.0, 0.22, 0.0, 0x2a2a2c); b.box(0.02, 0.01, 0.005, 0.08, 0.25, 0.092, 0x7dffb0);
      for (const sx of [-1, 1]) b.box(0.12, 0.2, 0.14, sx * 0.56, 0.44, -0.03, 0x2a2a2c, { pz: { rect: FUV.grille } });
      return { footprint: { w: 1.32, d: 0.36, h: 1.0 }, placement: 'wall', use: standUse(0.36, 'use', 'Regarder la télé', 1.8) };
    },
    better: b => {
      const f = 0.21;
      b.box(1.16, 0.08, 0.38, 0, 0, -0.01, C.dark);
      b.box(1.2, 0.36, 0.42, 0, 0.08, 0, C.varnish, { pz: { rect: FUV.wood, paint: C.varnishLight } });
      b.box(0.36, 0.22, 0.006, 0, 0.15, f + 0.003, C.darker); b.box(0.26, 0.05, 0.04, 0, 0.18, f - 0.01, 0x2a2a2c); b.box(0.02, 0.01, 0.005, 0.09, 0.2, f + 0.012, 0x7dffb0);
      for (const sx of [-1, 1]) { b.box(0.36, 0.006, 0.005, sx * 0.39, 0.27, f + 0.003, C.dark); for (const y of [0.17, 0.33]) b.box(0.12, 0.015, 0.02, sx * 0.39, y, f + 0.01, C.gold); }
      b.slab(1.24, 0.03, 0.44, 0, 0.44, 0, C.varnish, { py: { rect: FUV.wood, paint: C.varnishLight } });
      b.box(0.3, 0.02, 0.18, 0, 0.47, -0.06, C.black); b.box(0.05, 0.08, 0.04, 0, 0.49, -0.08, C.black);
      b.box(1.12, 0.66, 0.05, 0, 0.53, -0.08, 0x111112); b.box(1.06, 0.6, 0.006, 0, 0.56, -0.052, W, { pz: { rect: FUV.flat } });
      for (const sx of [-1, 1]) {
        const x = sx * 0.76;
        for (const s of [-1, 1]) b.box(0.02, 1.6, 0.32, x + s * 0.13, 0, -0.06, C.varnish);
        b.box(0.26, 1.6, 0.01, x, 0, -0.215, C.dark);
        for (let k = 0; k < 5; k++) b.slab(0.26, 0.02, 0.3, x, k * 0.39 + (k === 4 ? 0.0 : 0.0), -0.06, C.varnish);
        for (let k = 1; k < 4; k++) b.box(0.2 - (k % 2) * 0.07, 0.26, 0.2, x - (k % 2) * 0.03, k * 0.39 + 0.02, -0.08, W, { pz: { rect: FUV.books } });
        b.cyl('y', 0.04, 0.06, 0.2, x + 0.04, 1.4, -0.06, sx > 0 ? 0x1f5aa8 : 0xc9a043, 8);
      }
      return { footprint: { w: 1.8, d: 0.46, h: 1.62 }, placement: 'wall', use: standUse(0.46, 'use', 'Regarder la télé', 2.0) };
    },
    premium: b => {
      const w = 2.4, f = 0.21;
      b.box(w - 0.04, 0.05, 0.4, 0, 0, -0.01, C.gold);
      b.box(w, 0.4, 0.42, 0, 0.05, 0, C.darker, { pz: { rect: FUV.carved, paint: C.dark } });
      for (const x of [-0.6, 0, 0.6]) b.box(0.006, 0.38, 0.005, x, 0.06, f + 0.003, C.gold);
      for (const x of [-0.9, -0.3, 0.3, 0.9]) b.box(0.14, 0.02, 0.02, x, 0.36, f + 0.01, C.gold);
      b.slab(w, 0.03, 0.44, 0, 0.45, 0, C.dark, { py: { rect: FUV.wood, paint: 0x5a3a22 } });
      b.box(1.6, 1.3, 0.04, 0, 0.48, -0.2, C.dark, { pz: { rect: FUV.carved, paint: 0x6a3e22 } });
      b.box(1.6, 0.3, 0.03, 0, 1.78, -0.2, C.gold, { pz: { rect: FUV.carved, paint: C.gold } });
      b.box(1.44, 0.82, 0.04, 0, 0.78, -0.16, 0x0d0d0f); b.box(1.38, 0.76, 0.006, 0, 0.81, -0.137, W, { pz: { rect: FUV.flat } });
      b.box(0.9, 0.07, 0.1, 0, 0.48, 0.06, 0x1c1c1e, { pz: { rect: FUV.grille } });
      for (const sx of [-1, 1]) { b.box(0.38, 1.6, 0.36, sx * 1.0, 0.48, -0.03, C.darker, { pz: { rect: FUV.vitrine } }); b.box(0.03, 0.1, 0.03, sx * 0.85, 1.2, 0.165, C.gold); }
      b.slab(w, 0.06, 0.4, 0, 2.08, -0.02, C.dark, { ny: { rect: FUV.led } });
      return { footprint: { w: 2.4, d: 0.46, h: 2.15 }, placement: 'wall', use: standUse(0.46, 'use', 'Regarder la télé', 2.4) };
    },
  },
  // -------------------------------------------------------------------------------------------------- music: a radio-cassette on its shelf, a hi-fi, tower speakers and a turntable
  audio: {
    basic: b => {
      legs4(b, 0.56, 0.3, 0.4, 0.04, C.raw); b.slab(0.6, 0.03, 0.34, 0, 0.4, 0, C.raw, { py: { rect: FUV.wood, paint: C.raw } }); b.slab(0.52, 0.02, 0.28, 0, 0.1, 0, C.rawDark);
      for (let k = 0; k < 3; k++) b.box(0.11, 0.02, 0.07, -0.12 + k * 0.02, 0.12 + k * 0.02, 0.02, [0x1f3f78, 0xd9322b, 0xf2f2ec][k]);
      b.box(0.42, 0.2, 0.13, 0, 0.43, -0.02, 0x2b2b33);
      for (const sx of [-1, 1]) b.cyl('z', 0.065, 0.065, 0.012, sx * 0.13, 0.52, 0.051, 0x2a2a2c, 14, { neg: false, pos: FUV.grille });
      b.box(0.1, 0.08, 0.006, 0, 0.46, 0.048, 0x111111); b.box(0.12, 0.03, 0.006, 0, 0.585, 0.048, 0xf4c20d);
      b.beam([-0.15, 0.63, -0.02], [-0.12, 0.69, -0.02], 0.02, 0.02, 0x2b2b33); b.beam([-0.12, 0.69, -0.02], [0.12, 0.69, -0.02], 0.02, 0.02, 0x2b2b33); b.beam([0.12, 0.69, -0.02], [0.15, 0.63, -0.02], 0.02, 0.02, 0x2b2b33);
      b.beam([0.18, 0.63, -0.06], [0.08, 0.95, -0.1], 0.008, 0.008, C.chrome);
      return { footprint: { w: 0.6, d: 0.34, h: 0.96 }, placement: 'wall', use: standUse(0.34, 'use', 'Écouter la radio', 0.6) };
    },
    better: b => {
      legs4(b, 0.86, 0.34, 0.06, 0.04, C.dark);
      b.box(0.9, 0.36, 0.38, 0, 0.06, 0, C.dark, { px: { rect: FUV.wood, paint: C.dark }, nx: { rect: FUV.wood, paint: C.dark } });
      b.box(0.84, 0.3, 0.008, 0, 0.09, 0.19, 0x1c1410); b.box(0.5, 0.2, 0.02, -0.12, 0.1, 0.18, W, { pz: { rect: FUV.books } });
      b.slab(0.9, 0.03, 0.4, 0, 0.42, 0, C.dark, { py: { rect: FUV.wood, paint: C.varnish } });
      b.box(0.36, 0.1, 0.28, 0, 0.45, 0, C.black); b.box(0.12, 0.025, 0.005, -0.06, 0.5, 0.142, W, { pz: { rect: FUV.led } });
      for (const x of [0.06, 0.12]) b.cyl('z', 0.022, 0.022, 0.02, x, 0.5, 0.15, C.chrome, 8);
      b.box(0.36, 0.07, 0.26, 0, 0.55, 0, 0x2a2a2c); b.box(0.2, 0.01, 0.005, -0.04, 0.585, 0.132, C.black);
      for (const sx of [-1, 1]) {
        b.box(0.2, 0.3, 0.24, sx * 0.34, 0.45, 0, K.walnut, { pz: { rect: FUV.grille } });
        b.cyl('z', 0.06, 0.06, 0.01, sx * 0.34, 0.55, 0.125, 0x1c1c1e, 12); b.cyl('z', 0.025, 0.025, 0.01, sx * 0.34, 0.68, 0.125, 0x1c1c1e, 10);
      }
      return { footprint: { w: 0.9, d: 0.4, h: 0.76 }, placement: 'wall', use: standUse(0.4, 'use', 'Écouter de la musique', 0.6) };
    },
    premium: b => {
      for (const sx of [-1, 1]) {
        const x = sx * 0.57;
        for (const dx of [-0.09, 0.09]) for (const dz of [-0.12, 0.12]) b.cyl('y', 0.005, 0.02, 0.03, x + dx, 0.015, dz, C.gold, 6);
        b.box(0.26, 1.06, 0.34, x, 0.03, 0, K.walnut, { pz: { rect: FUV.grille }, px: { rect: FUV.wood, paint: K.walnut }, nx: { rect: FUV.wood, paint: K.walnut } });
        b.cyl('z', 0.035, 0.035, 0.012, x, 0.97, 0.176, 0x1c1c1e, 10);
        for (const y of [0.5, 0.76]) { b.cyl('z', 0.095, 0.095, 0.008, x, y, 0.174, C.chrome, 14, { neg: false, pos: true }); b.cyl('z', 0.08, 0.08, 0.012, x, y, 0.178, 0x1c1c1e, 14, { neg: false, pos: true }); }
      }
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.04, 0.06, 0.04, sx * 0.33, 0, sz * 0.16, C.gold);
      b.box(0.76, 0.34, 0.4, 0, 0.06, 0, 0x111111);
      b.box(0.7, 0.26, 0.006, 0, 0.1, 0.2, 0x050505);
      b.box(0.6, 0.12, 0.3, 0, 0.12, 0.04, K.steel); for (const sx of [-1, 1]) b.box(0.12, 0.06, 0.005, sx * 0.13, 0.15, 0.191, W, { pz: { rect: FUV.bulb } });
      for (const x of [-0.26, 0.26]) b.cyl('z', 0.025, 0.025, 0.02, x, 0.17, 0.2, C.black, 8);
      b.box(0.46, 0.08, 0.36, 0, 0.4, 0, K.walnut);
      b.cyl('y', 0.15, 0.15, 0.02, -0.04, 0.49, 0, C.black, 18); b.cyl('y', 0.045, 0.045, 0.004, -0.04, 0.502, 0, 0xd9322b, 10);
      b.cyl('y', 0.02, 0.02, 0.03, 0.17, 0.495, -0.12, C.chrome, 8); b.beam([0.17, 0.51, -0.12], [0.07, 0.52, 0.06], 0.012, 0.012, C.chrome);
      return { footprint: { w: 1.4, d: 0.44, h: 1.1 }, placement: 'wall', use: standUse(0.44, 'use', 'Écouter de la musique', 0.6) };
    },
  },
  // -------------------------------------------------------------------------------------------------- plants: a pot plant, an indoor palm, a carved planter of bougainvillea
  plant: {
    basic: b => {
      b.cyl('y', 0.12, 0.16, 0.26, 0, 0.13, 0, K.clay, 12); b.cyl('y', 0.17, 0.17, 0.04, 0, 0.28, 0, K.clayDark, 12); b.cyl('y', 0.15, 0.15, 0.01, 0, 0.295, 0, 0x4a3426, 12);
      for (let k = 0; k < 6; k++) { const a = k * 1.05; b.blob(0.1, Math.sin(a) * 0.08, 0.45 + (k % 3) * 0.08, Math.cos(a) * 0.08, [K.leaf, K.leaf2, K.leaf3][k % 3], [1.2, 0.6, 1.2]); }
      for (let k = 0; k < 5; k++) { const a = k * 1.26 + 0.3; b.beam([0, 0.3, 0], [Math.sin(a) * 0.15, 0.72 + (k % 2) * 0.08, Math.cos(a) * 0.15], 0.035, 0.008, K.leaf2); }
      b.blob(0.08, 0, 0.7, 0, K.leaf);
      return { footprint: { w: 0.4, d: 0.4, h: 0.84 }, placement: 'free', use: standUse(0.4, 'use', 'Arroser la plante', 0.5) };
    },
    better: b => {
      // an areca palm: stems from a woven basket, each frond rising then arching out and down, its leaflets in a shallow V
      b.cyl('y', 0.2, 0.25, 0.36, 0, 0.18, 0, W, 14, { neg: true, pos: false, side: FUV.rattan }); b.cyl('y', 0.22, 0.22, 0.01, 0, 0.33, 0, 0x4a3426, 12);
      const frond: [number, number][] = [[0.02, 0.36], [0.09, 0.95], [0.2, 1.3], [0.28, 1.2]];
      for (let k = 0; k < 7; k++) {
        const a = k * Math.PI * 2 / 7 + 0.3, ca = Math.cos(a), sa = Math.sin(a), sc = 0.85 + (k % 3) * 0.08, col = [K.leaf, K.leaf2, K.leaf3][k % 3];
        const pt = (i: number): V3 => [sa * frond[i][0] * sc, 0.36 + (frond[i][1] - 0.36) * sc, ca * frond[i][0] * sc];
        b.beam(pt(0), pt(1), 0.022, 0.022, 0x8a7a3a); b.beam(pt(1), pt(2), 0.016, 0.016, 0x6b7a3a);
        for (let i = 1; i < 3; i++) {
          const A = pt(i), B = pt(i + 1), hw = 0.085 - (i - 1) * 0.015, dr = 0.05, sx = ca * hw, sz = -sa * hw;
          for (const s of [1, -1]) {
            const q: V3[] = [A, B, [B[0] + s * sx, B[1] - dr, B[2] + s * sz], [A[0] + s * sx, A[1] - dr, A[2] + s * sz]];
            b.toward(q, [0, 1, 0], col); b.toward(q, [0, -1, 0], dimC(col, 0.75));
          }
        }
      }
      return { footprint: { w: 0.6, d: 0.6, h: 1.32 }, placement: 'free', use: standUse(0.6, 'use', 'Arroser la plante', 0.5) };
    },
    premium: b => {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.06, 0.06, 0.06, sx * 0.45, 0, sz * 0.16, C.gold);
      const cv = { rect: FUV.carved, paint: C.dark };
      b.box(0.96, 0.4, 0.38, 0, 0.06, 0, C.darker, { pz: cv, nz: cv, px: cv, nx: cv });
      b.slab(1.0, 0.04, 0.42, 0, 0.46, 0, C.dark); b.box(0.92, 0.01, 0.34, 0, 0.5, 0, 0x4a3426);
      for (let k = 0; k < 7; k++) b.blob(0.13, -0.38 + k * 0.127, 0.62 + (k % 2) * 0.06, ((k % 3) - 1) * 0.05, [0x4f8f3e, 0x5c9a44, 0x3f7a35][k % 3], [1, 0.8, 0.9]);
      for (let k = 0; k < 16; k++) b.blob(0.05, -0.43 + k * 0.057, 0.7 + ((k * 37) % 7) * 0.035, (((k * 13) % 5) - 2) * 0.05, [0xec5fa8, 0xf47cc0, 0xd94a9c][k % 3]);
      for (const [x0, x1] of [[-0.3, -0.38], [0.05, 0.12], [0.32, 0.4]]) { b.beam([x0, 0.55, 0], [x1, 0.9, 0.03], 0.02, 0.02, 0x6b4a2e); b.blob(0.06, x1, 0.93, 0.03, 0xf47cc0); }
      return { footprint: { w: 1.0, d: 0.42, h: 1.0 }, placement: 'wall', use: standUse(0.42, 'use', 'Arroser les fleurs', 0.5) };
    },
  },
  // -------------------------------------------------------------------------------------------------- loungers: a deck chair, a woven chaise longue, a teak sun lounger
  lounger: {
    basic: b => {
      for (const sx of [-1, 1]) {
        b.beam([sx * 0.27, 0.015, 0.05], [sx * 0.27, 0.95, -0.55], 0.04, 0.03, C.raw);
        b.beam([sx * 0.25, 0.015, 0.56], [sx * 0.25, 0.45, 0.3], 0.04, 0.03, C.raw);
        b.beam([sx * 0.29, 0.015, -0.56], [sx * 0.29, 0.42, -0.2], 0.04, 0.03, C.rawDark);
        b.beam([sx * 0.285, 0.47, 0.3], [sx * 0.285, 0.5, -0.18], 0.05, 0.025, C.raw);
      }
      b.cyl('x', 0.02, 0.02, 0.56, 0, 0.93, -0.52, C.raw, 8); b.cyl('x', 0.02, 0.02, 0.52, 0, 0.44, 0.3, C.raw, 8); b.cyl('x', 0.018, 0.018, 0.6, 0, 0.42, -0.2, C.rawDark, 8);
      const s0: V3 = [0, 0.92, -0.5], s1: V3 = [0, 0.26, 0.0], s2: V3 = [0, 0.43, 0.29], hw = 0.23;
      const band = (a: V3, c: V3, v0: number, v1: number) => {
        const R = FUV.stripes0, u0 = R[0], u1 = R[2], va = R[1] + (R[3] - R[1]) * v0, vb = R[1] + (R[3] - R[1]) * v1;
        b.toward([[-hw, a[1], a[2]], [hw, a[1], a[2]], [hw, c[1], c[2]], [-hw, c[1], c[2]]], [0, 1, 0.3], W, [[u0, va], [u1, va], [u1, vb], [u0, vb]]);
        b.toward([[-hw, a[1] - 0.005, a[2]], [hw, a[1] - 0.005, a[2]], [hw, c[1] - 0.005, c[2]], [-hw, c[1] - 0.005, c[2]]], [0, -1, -0.3], 0xb8b0a0);
      };
      band(s0, s1, 1, 0.3); band(s1, s2, 0.3, 0);
      const s = seatOf('s0', 0, 0.05, 0.3, 'chair');
      return { footprint: { w: 0.62, d: 1.22, h: 0.97 }, placement: 'free', seats: [s], use: sitUse(s, 'sit', 'Se détendre') };
    },
    better: b => {
      const r = { rect: FUV.rattan };
      for (const sx of [-1, 1]) for (const z of [-0.8, 0.8]) b.box(0.05, 0.1, 0.05, sx * 0.3, 0, z, C.dark);
      b.box(0.68, 0.18, 1.86, 0, 0.1, 0.02, W, { px: r, nx: r, pz: r, nz: r, py: r });
      b.at(0, 0.28, -0.38, 0, () => { b.box(0.66, 0.08, 0.6, 0, 0, -0.3, W, { py: r, px: r, nx: r, nz: r, pz: r }); b.slab(0.6, 0.07, 0.52, 0, 0.08, -0.29, K.ecru, { py: { rect: FUV.fabric, paint: K.ecru } }); b.cyl('x', 0.07, 0.07, 0.5, 0, 0.2, -0.46, C.cream, 10); }, 0.6);
      b.slab(0.6, 0.07, 1.26, 0, 0.28, 0.27, K.ecru, { py: { rect: FUV.fabric, paint: K.ecru } });
      const s = seatOf('s0', 0, 0.15, 0.35, 'bed', 0, 'Lie');
      return { footprint: { w: 0.7, d: 1.9, h: 0.86 }, placement: 'free', seats: [s], use: sitUse(s, 'sit', 'Se détendre') };
    },
    premium: b => {
      for (const sx of [-1, 1]) {
        b.box(0.04, 0.09, 1.9, sx * 0.34, 0.2, 0.02, K.teak);
        b.box(0.05, 0.2, 0.05, sx * 0.34, 0, 0.88, K.teak);
        b.cyl('x', 0.09, 0.09, 0.04, sx * 0.34, 0.09, -0.84, K.teakDark, 12);
      }
      for (let k = 0; k < 12; k++) b.box(0.66, 0.025, 0.07, 0, 0.27, -0.13 + k * 0.088, K.teak, { py: { rect: FUV.wood, paint: K.teak } });
      b.at(0, 0.29, -0.2, 0, () => {
        for (const sx of [-1, 1]) b.box(0.04, 0.05, 0.72, sx * 0.32, 0, -0.36, K.teak);
        for (let k = 0; k < 7; k++) b.box(0.6, 0.02, 0.07, 0, 0.03, -0.06 - k * 0.1, K.teak);
        b.slab(0.62, 0.09, 0.62, 0, 0.05, -0.34, C.cream, { py: { rect: FUV.fabric, paint: C.cream } });
      }, 0.62);
      b.slab(0.62, 0.1, 1.06, 0, 0.29, 0.38, C.cream, { py: { rect: FUV.fabric, paint: C.cream } });
      b.cyl('x', 0.05, 0.05, 0.5, 0, 0.44, -0.12, K.sky, 10, { neg: true, pos: true, side: FUV.towel });
      const s = seatOf('s0', 0, 0.25, 0.39, 'bed', 0, 'Lie');
      return { footprint: { w: 0.76, d: 1.96, h: 0.93 }, placement: 'free', seats: [s], use: sitUse(s, 'sit', 'Se détendre') };
    },
  },
  // -------------------------------------------------------------------------------------------------- parasols
  parasol: {
    basic: b => {
      b.cyl('y', 0.22, 0.24, 0.1, 0, 0.05, 0, C.white, 14);
      b.cyl('y', 0.02, 0.02, 2.2, 0, 1.15, 0, C.white, 6);
      canopy(b, 1.95, 2.25, 0.8, 8, 0xd9322b, 0xf6f1e4, C.white);
      b.blob(0.035, 0, 2.27, 0, C.white);
      return { footprint: { w: 1.6, d: 1.6, h: 2.31 }, placement: 'free', use: standUse(1.6, 'use', 'Se mettre à l’ombre', 0.3) };
    },
    better: b => {
      b.box(0.9, 0.08, 0.1, 0, 0, 0, C.varnish); b.box(0.1, 0.08, 0.9, 0, 0, 0, C.varnish);
      b.cyl('y', 0.03, 0.03, 2.35, 0, 1.255, 0, C.varnish, 8); b.box(0.06, 0.1, 0.06, 0, 1.2, 0.035, C.chrome);
      canopy(b, 2.05, 2.43, 1.0, 8, K.ecru, dimC(K.ecru, 0.94), C.varnish);
      for (let k = 0; k < 8; k++) {
        const a0 = k * Math.PI / 4, a1 = (k + 1) * Math.PI / 4, m = (a0 + a1) / 2, P: V3 = [Math.sin(a0) * 1.0, 2.05, Math.cos(a0) * 1.0], Q: V3 = [Math.sin(a1) * 1.0, 2.05, Math.cos(a1) * 1.0];
        b.toward([P, Q, [Q[0], 1.93, Q[2]], [P[0], 1.93, P[2]]], [Math.sin(m), 0, Math.cos(m)], 0xc9a46a);
        b.toward([P, Q, [Q[0], 1.93, Q[2]], [P[0], 1.93, P[2]]], [-Math.sin(m), 0, -Math.cos(m)], 0xb8945a);
      }
      b.blob(0.045, 0, 2.45, 0, C.varnish);
      return { footprint: { w: 2.0, d: 2.0, h: 2.5 }, placement: 'free', use: standUse(2.0, 'use', 'Se mettre à l’ombre', 0.3) };
    },
    premium: b => {
      b.box(0.7, 0.12, 0.7, 0, 0, -0.7, K.granite); for (const sx of [-1, 1]) b.box(0.3, 0.06, 0.3, sx * 0.17, 0.12, -0.7, 0x6a6b70);
      b.box(0.08, 2.1, 0.08, 0, 0.12, -0.7, 0x3a3a3c); b.box(0.1, 0.06, 0.06, 0.07, 1.1, -0.7, C.chrome);
      const arm: V3[] = [[0, 2.2, -0.7], [0, 2.42, -0.5], [0, 2.52, -0.25], [0, 2.55, 0]];
      for (let k = 0; k < 3; k++) b.beam(arm[k], arm[k + 1], 0.06, 0.06, 0x3a3a3c);
      const apex = 2.62, rim = 2.3, h = 1.1, T = 0x9a8c78;
      const corners: V3[] = [[-h, rim, -h], [h, rim, -h], [h, rim, h], [-h, rim, h]];
      corners.forEach((p, k) => {
        const q = corners[(k + 1) % 4], c = k % 2 ? K.taupe : T;
        b.toward([[0, apex, 0], p, q], [0, 1, 0], c); b.toward([[0, apex, 0], q, p], [0, -1, 0], dimC(c, 0.8));
        b.beam([0, apex - 0.06, 0], [p[0] * 0.97, rim - 0.02, p[2] * 0.97], 0.02, 0.02, 0x3a3a3c);
        const out: V3 = [(p[0] + q[0]) / 2, 0, (p[2] + q[2]) / 2], lo = rim - 0.12;
        b.toward([p, q, [q[0], lo, q[2]], [p[0], lo, p[2]]], out, c); b.toward([p, q, [q[0], lo, q[2]], [p[0], lo, p[2]]], [-out[0], 0, -out[2]], dimC(c, 0.8));
        b.box(0.05, 0.02, 0.05, p[0] * 0.5, (apex + rim) / 2 - 0.03, p[2] * 0.5, 0x3a3a3c, { ny: { rect: FUV.bulb } });
      });
      b.cyl('y', 0.06, 0.06, 0.12, 0, apex - 0.12, 0, 0x3a3a3c, 12);
      for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4, A: V3 = [0, apex + 0.08, 0]; b.toward([A, [Math.sin(a) * 0.16, apex - 0.01, Math.cos(a) * 0.16], [Math.sin(a + Math.PI / 2) * 0.16, apex - 0.01, Math.cos(a + Math.PI / 2) * 0.16]], [0, 1, 0], K.taupe); }
      b.blob(0.03, 0, apex + 0.09, 0, 0x3a3a3c);
      return { footprint: { w: 2.2, d: 2.2, h: 2.74 }, placement: 'free', use: standUse(2.2, 'use', 'Se mettre à l’ombre', 0.3) };
    },
  },
  // -------------------------------------------------------------------------------------------------- garden sets: a table and four chairs (the teak one under its parasol)
  gardenSet: {
    basic: b => {
      b.cyl('y', 0.42, 0.42, 0.03, 0, 0.705, 0, C.white, 18); b.cyl('y', 0.025, 0.025, 0.004, 0, 0.722, 0, 0x555555, 8);
      for (let k = 0; k < 4; k++) { const a = Math.PI / 4 + k * Math.PI / 2; b.beam([Math.sin(a) * 0.28, 0.69, Math.cos(a) * 0.28], [Math.sin(a) * 0.34, 0.015, Math.cos(a) * 0.34], 0.05, 0.03, C.white); }
      b.cyl('y', 0.035, 0.04, 0.24, 0.12, 0.84, -0.08, 0x2e8b4c, 8); for (const [x, z] of [[-0.12, 0.1], [-0.02, 0.16]]) b.cyl('y', 0.03, 0.025, 0.08, x, 0.76, z, 0xe8f4ff, 6);
      const seats = chairsAt(b, [[0, -0.62, 0], [0.62, 0, -Math.PI / 2], [0, 0.62, Math.PI], [-0.62, 0, Math.PI / 2]], 0.45, () => plasticChair(b, C.white, true));
      return { footprint: { w: 1.82, d: 1.82, h: 0.96 }, placement: 'free', seats, use: sitUse(seats[0], 'sit', 'S’asseoir') };
    },
    better: b => {
      b.cyl('y', 0.4, 0.4, 0.025, 0, 0.7125, 0, W, 18, { neg: true, pos: FUV.tiles }); b.cyl('y', 0.41, 0.41, 0.03, 0, 0.7, 0, K.iron, 18, { neg: false, pos: false });
      b.cyl('y', 0.03, 0.03, 0.6, 0, 0.4, 0, K.iron, 8);
      for (let k = 0; k < 3; k++) { const a = k * Math.PI * 2 / 3; b.beam([0, 0.16, 0], [Math.sin(a) * 0.3, 0.015, Math.cos(a) * 0.3], 0.03, 0.03, K.iron); b.beam([Math.sin(a) * 0.3, 0.015, Math.cos(a) * 0.3], [Math.sin(a) * 0.34, 0.07, Math.cos(a) * 0.34], 0.025, 0.025, K.iron); }
      b.cyl('y', 0.07, 0.05, 0.12, 0.1, 0.785, 0.05, 0x9a2234, 8); b.blob(0.06, 0.1, 0.88, 0.05, K.bloom);
      const seats = chairsAt(b, [[0, -0.62, 0], [0.62, 0, -Math.PI / 2], [0, 0.62, Math.PI], [-0.62, 0, Math.PI / 2]], 0.49, () => ironChair(b));
      return { footprint: { w: 1.72, d: 1.72, h: 0.92 }, placement: 'free', seats, use: sitUse(seats[0], 'sit', 'S’asseoir') };
    },
    premium: b => {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.06, 0.7, 0.06, sx * 0.62, 0, sz * 0.36, K.teak);
      for (const s of [-1, 1]) { b.box(1.3, 0.06, 0.04, 0, 0.64, s * 0.38, K.teak); b.box(0.04, 0.06, 0.76, s * 0.64, 0.64, 0, K.teak); }
      for (let k = 0; k < 8; k++) b.box(1.4, 0.025, 0.09, 0, 0.7, -0.37 + k * 0.106, K.teak, { py: { rect: FUV.wood, paint: K.teak } });
      b.cyl('y', 0.022, 0.022, 2.42, 0, 1.21, 0, C.white, 8);
      canopy(b, 2.1, 2.45, 1.05, 8, K.ecru, dimC(K.ecru, 0.92), C.white);
      b.blob(0.04, 0, 2.47, 0, C.white);
      const seats = chairsAt(b, [[-0.35, -0.72, 0], [0.35, -0.72, 0], [-0.35, 0.72, Math.PI], [0.35, 0.72, Math.PI]], 0.48, () => teakChair(b));
      return { footprint: { w: 2.1, d: 2.1, h: 2.52 }, placement: 'free', seats, use: sitUse(seats[0], 'sit', 'S’asseoir') };
    },
  },
  ...ROUND2_COMFORT,
  ...ROUND2_DECO,
};

const MAKERS: Record<FurnitureType, Record<Tier, Maker>> = {
  ...HOME_MAKERS,
  // -------------------------------------------------------------------------------------------------- bed
  bed: {
    basic: b => {
      b.slab(1.0, 0.015, 1.95, 0, 0, 0, W, topRect(FUV.natte));
      b.slab(0.88, 0.1, 1.84, 0, 0.015, 0.03, C.foam, topRect(FUV.wax0));
      b.slab(0.5, 0.08, 0.3, 0, 0.115, -0.72, C.white);
      b.slab(0.86, 0.05, 0.4, 0, 0.115, 0.6, 0xd9482b, topRect(FUV.wax1));
      const s = seatOf('bed', 0, 0.02, 0.115, 'bed', 0, 'Lie');
      return { footprint: { w: 1.0, d: 1.95, h: 0.2 }, placement: 'free', seats: [s], use: sitUse(s, 'sleep', 'Dormir') };
    },
    better: b => {
      legs4(b, 1.45, 2.05, 0.16, 0.07, C.varnish);
      b.slab(1.45, 0.22, 2.05, 0, 0.16, 0, C.varnish, { pz: { rect: FUV.wood, paint: C.varnish } });
      b.box(1.45, 0.62, 0.07, 0, 0.38, -1.0, C.varnish, { pz: { rect: FUV.wood, paint: C.varnishLight } });
      b.slab(1.38, 0.2, 1.95, 0, 0.38, 0.02, C.foam, topRect(FUV.wax1));
      b.slab(0.6, 0.12, 0.34, -0.33, 0.58, -0.78, C.white); b.slab(0.6, 0.12, 0.34, 0.33, 0.58, -0.78, C.cream);
      b.slab(1.4, 0.06, 0.55, 0, 0.58, 0.62, 0x2f6fb3, topRect(FUV.wax0));
      const s = seatOf('bed', 0, 0.02, 0.58, 'bed', 0, 'Lie');
      return { footprint: { w: 1.45, d: 2.05, h: 1.0 }, placement: 'wall', seats: [s], use: sitUse(s, 'sleep', 'Dormir') };
    },
    premium: b => {
      const w = 1.85, d = 2.15;
      legs4(b, w, d, 0.14, 0.09, C.gold);
      b.slab(w, 0.24, d, 0, 0.14, 0, C.darker, { pz: { rect: FUV.carved, paint: C.dark }, px: { rect: FUV.carved, paint: C.dark }, nx: { rect: FUV.carved, paint: C.dark } });
      b.box(w, 1.18, 0.12, 0, 0.38, -d / 2 + 0.06, C.dark, { pz: { rect: FUV.velvet } });                 // upholstered headboard
      b.box(w + 0.12, 0.14, 0.16, 0, 1.56, -d / 2 + 0.06, C.gold, { pz: { rect: FUV.gold }, py: { rect: FUV.gold } });
      b.box(0.6, 0.18, 0.1, 0, 1.7, -d / 2 + 0.06, C.gold, { pz: { rect: FUV.carved, paint: C.gold } });
      for (const sx of [-1, 1]) { b.box(0.12, 1.5, 0.12, sx * (w / 2 + 0.02), 0.14, -d / 2 + 0.06, C.dark); b.blob(0.07, sx * (w / 2 + 0.02), 1.72, -d / 2 + 0.06, C.gold, [1, 1, 1], 1); b.box(0.1, 0.62, 0.1, sx * (w / 2 + 0.01), 0.14, d / 2 - 0.05, C.dark); b.blob(0.055, sx * (w / 2 + 0.01), 0.8, d / 2 - 0.05, C.gold); }
      b.box(w, 0.42, 0.07, 0, 0.38, d / 2 - 0.04, C.dark, { pz: { rect: FUV.carved, paint: C.dark } });
      b.slab(w - 0.08, 0.3, d - 0.2, 0, 0.38, -0.04, C.cream);
      b.slab(w - 0.02, 0.05, d - 0.5, 0, 0.68, 0.16, 0x7a1424, { py: { rect: FUV.wax2 }, px: { rect: FUV.wax2 }, nx: { rect: FUV.wax2 }, pz: { rect: FUV.wax2 } });
      for (const sx of [-1, 1]) { b.slab(0.7, 0.16, 0.38, sx * 0.42, 0.68, -0.85, C.white); b.at(sx * 0.4, 0.76, -0.6, 0, () => b.box(0.46, 0.4, 0.12, 0, 0, 0, 0x9a2234, { pz: { rect: FUV.velvet } }), -0.35); }
      const s = seatOf('bed', 0, 0.02, 0.72, 'bed', 0, 'Lie');
      return { footprint: { w: w + 0.16, d: d + 0.05, h: 1.9 }, placement: 'wall', seats: [s], use: sitUse(s, 'sleep', 'Dormir') };
    },
  },
  // -------------------------------------------------------------------------------------------------- sofa / armchair
  sofa: perTier(t => (b: KitBuilder) => {
    const c = couch(b, t, 3), seats = [-1, 0, 1].map((k, i) => seatOf(`s${i}`, k * (t === 'basic' ? 0.62 : t === 'better' ? 0.66 : 0.7), 0.06, c.top, 'sofa'));
    return { footprint: { w: c.w, d: c.d, h: c.h }, placement: 'wall', seats, use: sitUse(seats[1], 'sit', 'S’asseoir') };
  }),
  armchair: perTier(t => (b: KitBuilder) => {
    const c = couch(b, t, 1), seats = [seatOf('s0', 0, 0.06, c.top, 'chair')];
    return { footprint: { w: c.w, d: c.d, h: c.h }, placement: 'free', seats, use: sitUse(seats[0], 'sit', 'S’asseoir') };
  }),
  // -------------------------------------------------------------------------------------------------- chairs
  plasticChair: {
    basic: b => { plasticChair(b, C.white, false); const s = seatOf('s0', 0, 0.03, 0.45, 'chair'); return { footprint: { w: 0.5, d: 0.58, h: 0.88 }, placement: 'free', seats: [s], use: sitUse(s, 'sit', 'S’asseoir') }; },
    better: b => { plasticChair(b, C.bluePl, true); const s = seatOf('s0', 0, 0.03, 0.45, 'chair'); return { footprint: { w: 0.56, d: 0.58, h: 0.88 }, placement: 'free', seats: [s], use: sitUse(s, 'sit', 'S’asseoir') }; },
    premium: b => { plasticChair(b, 0xb98a52, true, true); const s = seatOf('s0', 0, 0.03, 0.5, 'chair'); return { footprint: { w: 0.56, d: 0.58, h: 0.9 }, placement: 'free', seats: [s], use: sitUse(s, 'sit', 'S’asseoir') }; },
  },
  woodenChair: {
    basic: b => {
      legs4(b, 0.42, 0.4, 0.44, 0.05, C.raw);
      b.slab(0.44, 0.035, 0.42, 0, 0.44, 0, C.raw);
      for (const sx of [-1, 1]) b.box(0.05, 0.42, 0.05, sx * 0.185, 0.47, -0.18, C.rawDark);
      b.box(0.42, 0.1, 0.03, 0, 0.78, -0.18, C.raw); b.box(0.42, 0.08, 0.03, 0, 0.6, -0.18, C.raw);
      const s = seatOf('s0', 0, 0.03, 0.475, 'chair'); return { footprint: { w: 0.44, d: 0.42, h: 0.9 }, placement: 'free', seats: [s], use: sitUse(s, 'sit', 'S’asseoir') };
    },
    better: b => {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl('y', 0.022, 0.026, 0.45, sx * 0.19, 0.225, sz * 0.18, C.varnish, 6);
      b.slab(0.46, 0.04, 0.44, 0, 0.45, 0, C.varnish, { py: { rect: FUV.wood, paint: C.varnishLight } });
      for (const sx of [-1, 1]) b.at(sx * 0.19, 0.49, -0.19, 0, () => b.box(0.04, 0.5, 0.04, 0, 0, 0, C.varnish), -0.08);
      for (let k = 0; k < 4; k++) b.at(-0.105 + k * 0.07, 0.55, -0.195, 0, () => b.box(0.035, 0.36, 0.02, 0, 0, 0, C.varnishLight), -0.08);
      b.at(0, 0.92, -0.215, 0, () => b.box(0.42, 0.08, 0.035, 0, 0, 0, C.varnish));
      const s = seatOf('s0', 0, 0.03, 0.49, 'chair'); return { footprint: { w: 0.46, d: 0.46, h: 1.0 }, placement: 'free', seats: [s], use: sitUse(s, 'sit', 'S’asseoir') };
    },
    premium: b => {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl('y', 0.025, 0.035, 0.44, sx * 0.21, 0.22, sz * 0.2, C.dark, 6);
      b.slab(0.5, 0.06, 0.48, 0, 0.42, 0, C.dark); b.slab(0.46, 0.07, 0.44, 0, 0.48, 0.01, 0x9a2234, topRect(FUV.velvet));
      b.at(0, 0.5, -0.22, 0, () => { b.box(0.48, 0.62, 0.05, 0, 0, 0, C.dark, { pz: { rect: FUV.carved, paint: 0x6a3e22 } }); b.box(0.36, 0.42, 0.03, 0, 0.1, 0.03, 0x9a2234, { pz: { rect: FUV.velvet } }); b.box(0.52, 0.06, 0.07, 0, 0.62, 0, C.gold, { pz: { rect: FUV.gold } }); }, -0.06);
      const s = seatOf('s0', 0, 0.03, 0.55, 'chair'); return { footprint: { w: 0.52, d: 0.6, h: 1.2 }, placement: 'free', seats: [s], use: sitUse(s, 'sit', 'S’asseoir') };
    },
  },
  // -------------------------------------------------------------------------------------------------- tables
  table: {
    basic: b => {
      legs4(b, 0.76, 0.56, 0.7, 0.045, C.raw);
      b.slab(0.86, 0.03, 0.66, 0, 0.7, 0, W, { py: { rect: FUV.cloth }, pz: { rect: FUV.cloth }, nz: { rect: FUV.cloth }, px: { rect: FUV.cloth }, nx: { rect: FUV.cloth } });
      for (const sx of [-1, 1]) b.box(0.012, 0.12, 0.66, sx * 0.43, 0.61, 0, 0xf4f1e8, { px: { rect: FUV.cloth }, nx: { rect: FUV.cloth } });
      b.cyl('y', 0.1, 0.1, 0.02, 0.1, 0.74, 0.05, C.white, 10); b.cyl('y', 0.035, 0.035, 0.12, -0.2, 0.79, -0.1, 0x6fbf6a, 6);
      return { footprint: { w: 0.86, d: 0.66, h: 0.92 }, placement: 'free', use: standUse(0.66, 'eat', 'Manger à table', 0.45) };
    },
    better: b => {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl('y', 0.03, 0.035, 0.7, sx * 0.53, 0.35, sz * 0.33, C.varnish, 8);
      b.box(1.12, 0.1, 0.72, 0, 0.6, 0, C.varnish);
      b.slab(1.24, 0.045, 0.82, 0, 0.7, 0, C.varnish, { py: { rect: FUV.wood, paint: C.varnishLight } });
      b.cyl('y', 0.16, 0.12, 0.08, 0, 0.745, 0, 0xd98b3a, 10); for (const [x, z] of [[-0.05, 0.02], [0.06, -0.03], [0.0, 0.06]]) b.blob(0.045, x, 0.84, z, 0xf2a03a);
      return { footprint: { w: 1.24, d: 0.82, h: 0.9 }, placement: 'free', use: standUse(0.82, 'eat', 'Manger à table', 0.45) };
    },
    premium: (b, g) => {
      b.cyl('y', 0.05, 0.08, 0.66, -0.45, 0.33, 0, C.dark, 8, { neg: true, pos: true, side: FUV.carved }); b.cyl('y', 0.05, 0.08, 0.66, 0.45, 0.33, 0, C.dark, 8, { neg: true, pos: true, side: FUV.carved });
      for (const sx of [-1, 1]) { b.box(0.12, 0.06, 0.7, sx * 0.45, 0, 0, C.dark); b.box(0.14, 0.05, 0.14, sx * 0.45, 0.66, 0, C.gold); }
      b.beam([-0.45, 0.2, 0], [0.45, 0.2, 0], 0.06, 0.06, C.gold);
      g.slab(1.62, 0.025, 0.92, 0, 0.71, 0, 0xbfe0ea);
      b.cuboid(-0.81, 0.81, 0.71, 0.735, 0.455, 0.47, C.gold, { bottom: true }); b.cuboid(-0.81, 0.81, 0.71, 0.735, -0.47, -0.455, C.gold, { bottom: true });
      b.cyl('y', 0.14, 0.08, 0.1, 0, 0.735, 0, C.gold, 10); for (const [x, z] of [[-0.05, 0.02], [0.06, -0.03], [0.0, 0.06]]) b.blob(0.045, x, 0.86, z, 0xd9322b);
      return { footprint: { w: 1.62, d: 0.94, h: 0.92 }, placement: 'free', use: standUse(0.94, 'eat', 'Manger à table', 0.45) };
    },
  },
  lowTable: {
    basic: b => { legs4(b, 0.46, 0.46, 0.27, 0.04, C.raw); b.slab(0.5, 0.035, 0.5, 0, 0.27, 0, C.raw, { py: { rect: FUV.wood, paint: C.raw } }); return { footprint: { w: 0.5, d: 0.5, h: 0.31 }, placement: 'free', use: standUse(0.5, 'use', 'Poser quelque chose', 0.45) }; },
    better: b => {
      legs4(b, 0.96, 0.52, 0.4, 0.05, C.varnish); b.slab(0.9, 0.025, 0.46, 0, 0.12, 0, C.varnish);
      b.slab(1.02, 0.04, 0.56, 0, 0.4, 0, C.varnish, { py: { rect: FUV.wood, paint: C.varnishLight } });
      b.slab(0.3, 0.04, 0.22, 0.25, 0.145, 0, 0x2f6fb3, topRect(FUV.books));
      return { footprint: { w: 1.02, d: 0.56, h: 0.44 }, placement: 'free', use: standUse(0.56, 'use', 'Poser quelque chose', 0.45) };
    },
    premium: b => {
      b.slab(1.1, 0.34, 0.56, 0, 0.04, 0, C.darker, { pz: { rect: FUV.carved, paint: C.dark }, nz: { rect: FUV.carved, paint: C.dark }, px: { rect: FUV.carved, paint: C.dark }, nx: { rect: FUV.carved, paint: C.dark } });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.08, 0.04, 0.08, sx * 0.53, 0, sz * 0.26, C.gold);
      b.slab(1.22, 0.05, 0.66, 0, 0.38, 0, C.white, { py: { rect: FUV.marble } }); b.cuboid(-0.62, 0.62, 0.375, 0.39, -0.335, 0.335, C.gold, { bottom: true });
      b.cyl('y', 0.12, 0.08, 0.06, 0.25, 0.43, 0, C.gold, 10);
      return { footprint: { w: 1.24, d: 0.68, h: 0.46 }, placement: 'free', use: standUse(0.68, 'use', 'Poser quelque chose', 0.45) };
    },
  },
  // -------------------------------------------------------------------------------------------------- desk (with its chair)
  desk: {
    basic: b => {
      const D = 0.5, d = D + 0.65, zc = -d / 2 + D / 2;
      for (const sx of [-1, 1]) { b.beam([sx * 0.45, 0.02, zc - 0.2], [sx * 0.45, 0.72, zc], 0.04, 0.05, C.rawDark); b.beam([sx * 0.45, 0.02, zc + 0.2], [sx * 0.45, 0.72, zc], 0.04, 0.05, C.rawDark); }
      b.slab(1.1, 0.035, D, 0, 0.72, zc, C.raw, { py: { rect: FUV.wood, paint: C.raw } });
      b.slab(0.22, 0.02, 0.3, -0.1, 0.755, zc + 0.02, C.white); b.slab(0.2, 0.03, 0.28, 0.25, 0.755, zc - 0.05, 0x1f3f78);
      legs4(b, 0.32, 0.32, 0.44, 0.04, C.rawDark, 0, d / 2 - 0.3); b.slab(0.36, 0.035, 0.36, 0, 0.44, d / 2 - 0.3, C.raw);
      const s = seatOf('chair', 0, d / 2 - 0.3, 0.475, 'stool', Math.PI);
      return { footprint: { w: 1.1, d, h: 0.8 }, placement: 'wall', seats: [s], use: sitUse(s, 'work', 'Travailler au bureau') };
    },
    better: b => {
      const D = 0.6, d = D + 0.65, zc = -d / 2 + D / 2;
      b.box(0.04, 0.72, D, -0.58, 0, zc, C.varnish); b.box(0.42, 0.72, D, 0.4, 0, zc, C.varnish, { pz: { paint: C.varnishLight } });
      for (let k = 0; k < 3; k++) { b.box(0.38, 0.004, 0.01, 0.4, 0.24 * k + 0.24, zc + D / 2 + 0.003, C.dark); b.box(0.1, 0.02, 0.02, 0.4, 0.24 * k + 0.12, zc + D / 2 + 0.01, C.gold); }
      b.slab(1.24, 0.04, D + 0.04, 0, 0.72, zc, C.varnish, { py: { rect: FUV.wood, paint: C.varnishLight } });
      b.box(0.3, 0.18, 0.2, -0.35, 0.76, zc - 0.15, W, { pz: { rect: FUV.books } });
      b.cyl('y', 0.07, 0.08, 0.02, 0.25, 0.77, zc - 0.15, C.black, 8); b.beam([0.25, 0.78, zc - 0.15], [0.22, 1.12, zc - 0.05], 0.02, 0.02, C.black); b.cyl('y', 0.1, 0.05, 0.1, 0.22, 1.08, zc - 0.02, W, 8, { neg: FUV.bulb, pos: true, side: FUV.shade });
      const cz = d / 2 - 0.32;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.035, 0.45, 0.035, sx * 0.19, 0, cz + sz * 0.18, C.varnish);
      b.slab(0.44, 0.04, 0.42, 0, 0.45, cz, C.varnish); b.at(0, 0.49, cz + 0.19, 0, () => b.box(0.42, 0.42, 0.035, 0, 0, 0, C.varnish), 0.08);
      const s = seatOf('chair', 0, cz, 0.49, 'chair', Math.PI);
      return { footprint: { w: 1.24, d, h: 1.15 }, placement: 'wall', seats: [s], use: sitUse(s, 'work', 'Travailler au bureau') };
    },
    premium: b => {
      const D = 0.78, d = D + 0.7, zc = -d / 2 + D / 2;
      for (const sx of [-1, 1]) { b.box(0.46, 0.72, D, sx * 0.55, 0, zc, C.darker, { pz: { rect: FUV.carved, paint: C.dark } }); for (let k = 0; k < 2; k++) b.box(0.12, 0.025, 0.02, sx * 0.55, 0.25 + k * 0.3, zc + D / 2 + 0.01, C.gold); }
      b.box(0.66, 0.5, 0.03, 0, 0.22, zc - D / 2 + 0.06, C.dark);
      b.slab(1.62, 0.05, D + 0.04, 0, 0.72, zc, C.darker, { py: { rect: FUV.leather } });
      b.cuboid(-0.81, 0.81, 0.72, 0.77, zc + D / 2 + 0.005, zc + D / 2 + 0.025, C.gold, { bottom: true });
      b.slab(0.38, 0.02, 0.26, 0, 0.77, zc - 0.05, 0x2a2a2c); b.at(0, 0.79, zc - 0.18, 0, () => b.box(0.38, 0.25, 0.015, 0, 0, 0, 0x2a2a2c, { pz: { rect: FUV.laptop } }), -0.25);
      b.cyl('y', 0.05, 0.06, 0.2, 0.55, 0.87, zc - 0.2, C.gold, 8); b.slab(0.24, 0.05, 0.3, -0.5, 0.77, zc, 0x8a1c1c);
      const cz = d / 2 - 0.34;
      for (let k = 0; k < 5; k++) { const a = k * Math.PI * 2 / 5; b.beam([0, 0.08, cz], [Math.sin(a) * 0.3, 0.04, cz + Math.cos(a) * 0.3], 0.04, 0.04, C.black); }
      b.cyl('y', 0.03, 0.03, 0.38, 0, 0.27, cz, C.chrome, 6);
      b.slab(0.52, 0.1, 0.5, 0, 0.42, cz, C.black, topRect(FUV.leather)); b.at(0, 0.52, cz + 0.24, 0, () => b.box(0.5, 0.66, 0.1, 0, 0, 0, C.black, { nz: { rect: FUV.leather } }), 0.1);
      for (const sx of [-1, 1]) b.beam([sx * 0.27, 0.62, cz + 0.2], [sx * 0.27, 0.62, cz - 0.15], 0.05, 0.04, C.black);
      const s = seatOf('chair', 0, cz, 0.52, 'chair', Math.PI);
      return { footprint: { w: 1.66, d, h: 1.2 }, placement: 'wall', seats: [s], use: sitUse(s, 'work', 'Travailler au bureau') };
    },
  },
  // -------------------------------------------------------------------------------------------------- TV
  tv: {
    basic: b => {
      b.box(0.56, 0.42, 0.42, 0, 0, 0, C.rawDark, { pz: { rect: FUV.wood, paint: C.raw }, px: { rect: FUV.wood, paint: C.raw }, nx: { rect: FUV.wood, paint: C.raw } });
      b.box(0.5, 0.4, 0.44, 0, 0.42, -0.01, 0x3a3a3c); b.box(0.4, 0.3, 0.02, -0.03, 0.47, 0.22, W, { pz: { rect: FUV.crt } });
      b.box(0.06, 0.2, 0.02, 0.2, 0.52, 0.215, 0x222222);
      b.beam([0, 0.82, -0.05], [-0.18, 1.12, -0.08], 0.012, 0.012, C.chrome); b.beam([0, 0.82, -0.05], [0.18, 1.1, -0.06], 0.012, 0.012, C.chrome);
      return { footprint: { w: 0.56, d: 0.46, h: 1.12 }, placement: 'wall', use: { ...standUse(0.46, 'use', 'Regarder la télé', 1.8) } };
    },
    better: b => {
      b.box(1.0, 0.04, 0.42, 0, 0.42, 0, C.varnish); b.box(1.0, 0.04, 0.42, 0, 0.12, 0, C.varnish);
      for (const sx of [-1, 1]) b.box(0.04, 0.46, 0.42, sx * 0.48, 0, 0, C.varnish);
      b.box(0.36, 0.06, 0.24, -0.2, 0.16, 0, C.black); b.slab(0.3, 0.02, 0.2, 0.25, 0.16, 0.02, 0xd9d2c4);
      b.box(0.24, 0.02, 0.16, 0, 0.46, -0.02, C.black); b.box(0.04, 0.08, 0.04, 0, 0.48, -0.03, C.black);
      b.box(0.8, 0.48, 0.05, 0, 0.55, -0.04, C.black); b.box(0.75, 0.42, 0.01, 0, 0.58, -0.012, W, { pz: { rect: FUV.flat } });
      return { footprint: { w: 1.0, d: 0.42, h: 1.03 }, placement: 'wall', use: standUse(0.42, 'use', 'Regarder la télé', 2.0) };
    },
    premium: b => {
      b.box(1.9, 0.44, 0.46, 0, 0.06, 0, C.darker, { pz: { rect: FUV.carved, paint: C.dark } });
      for (const sx of [-1, 1]) b.box(0.08, 0.06, 0.4, sx * 0.88, 0, 0, C.gold);
      b.box(1.92, 0.025, 0.48, 0, 0.5, 0, C.gold);
      b.box(0.42, 0.06, 0.26, 0.55, 0.525, 0, C.black);
      b.box(0.5, 0.03, 0.22, 0, 0.525, -0.04, C.black); b.box(0.06, 0.12, 0.05, 0, 0.555, -0.06, C.black);
      b.box(1.3, 0.76, 0.05, 0, 0.66, -0.06, 0x111112); b.box(1.24, 0.7, 0.01, 0, 0.69, -0.032, W, { pz: { rect: FUV.flat } });
      for (const sx of [-1, 1]) { b.box(0.2, 0.95, 0.22, sx * 1.12, 0, 0, C.black); b.cyl('z', 0.07, 0.07, 0.01, sx * 1.12, 0.72, 0.11, 0x333336, 10); b.cyl('z', 0.05, 0.05, 0.01, sx * 1.12, 0.4, 0.11, 0x333336, 10); }
      return { footprint: { w: 2.44, d: 0.48, h: 1.45 }, placement: 'wall', use: standUse(0.48, 'use', 'Regarder la télé', 2.4) };
    },
  },
  // -------------------------------------------------------------------------------------------------- wardrobe
  wardrobe: {
    basic: b => {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.025, 1.68, 0.025, sx * 0.44, 0, sz * 0.21, C.chrome);
      b.box(0.9, 1.5, 0.44, 0, 0.12, 0, 0x2f6fb3, { pz: { rect: FUV.canvas }, px: { rect: FUV.canvas }, nx: { rect: FUV.canvas }, nz: { rect: FUV.canvas } });
      b.slab(0.92, 0.06, 0.46, 0, 1.62, 0, 0x2a5aa0);
      b.box(0.02, 0.025, 0.02, 0.02, 1.4, 0.225, C.chrome);
      return { footprint: { w: 0.92, d: 0.46, h: 1.7 }, placement: 'wall', use: standUse(0.46, 'use', 'Se changer', 0.6) };
    },
    better: b => {
      b.box(1.0, 0.08, 0.55, 0, 0, 0, C.dark);
      b.box(1.0, 1.72, 0.55, 0, 0.08, 0, C.varnish, { pz: { rect: FUV.wood, paint: C.varnishLight } });
      b.box(1.06, 0.08, 0.6, 0, 1.8, 0, C.varnish);
      b.box(0.01, 1.6, 0.01, 0, 0.14, 0.28, C.dark);
      for (const sx of [-1, 1]) b.box(0.02, 0.16, 0.03, sx * 0.05, 0.95, 0.285, C.gold);
      b.box(0.8, 0.005, 0.005, 0, 0.5, 0.278, C.dark);
      return { footprint: { w: 1.06, d: 0.6, h: 1.88 }, placement: 'wall', use: standUse(0.6, 'use', 'Se changer', 0.6) };
    },
    premium: b => {
      const w = 1.62;
      b.box(w, 0.1, 0.6, 0, 0, 0, C.darker);
      b.box(w, 1.86, 0.6, 0, 0.1, 0, C.dark, { pz: { rect: FUV.carved, paint: 0x6a3e22 } });
      b.box(0.46, 1.6, 0.01, 0, 0.22, 0.305, W, { pz: { rect: FUV.mirror } });
      for (const x of [-0.27, 0.27]) b.box(0.025, 1.7, 0.02, x, 0.16, 0.305, C.gold);
      for (const x of [-0.33, 0.33]) b.box(0.03, 0.2, 0.03, x, 1.0, 0.315, C.gold);
      b.box(w + 0.1, 0.12, 0.66, 0, 1.96, 0, C.dark); b.box(0.7, 0.2, 0.06, 0, 2.08, 0.25, C.gold, { pz: { rect: FUV.carved, paint: C.gold } });
      return { footprint: { w: w + 0.1, d: 0.66, h: 2.28 }, placement: 'wall', use: standUse(0.66, 'use', 'Se changer', 0.65) };
    },
  },
  // -------------------------------------------------------------------------------------------------- shower
  shower: {
    basic: b => {
      b.slab(1.0, 0.03, 1.0, 0, 0, 0, C.cement); b.cyl('y', 0.04, 0.04, 0.005, 0.25, 0.03, 0.25, 0x333333, 8);
      b.box(1.0, 0.08, 0.06, 0, 0, 0.47, C.cement);
      b.box(1.0, 1.8, 0.06, 0, 0, -0.47, 0xbcb6a8); b.box(0.06, 1.2, 0.94, 0.47, 0, 0.0, 0xbcb6a8);
      b.beam([-0.25, 1.0, -0.44], [-0.25, 1.0, -0.38], 0.03, 0.03, C.chrome); b.box(0.06, 0.04, 0.03, -0.25, 0.98, -0.37, C.chrome);
      b.cyl('y', 0.16, 0.13, 0.36, -0.22, 0.21, -0.2, 0x2a8fd1, 10, { neg: true, pos: false }); b.cyl('y', 0.145, 0.145, 0.01, -0.22, 0.34, -0.2, 0x6fb6e0, 10);
      b.cyl('y', 0.09, 0.11, 0.22, 0.2, 0.14, -0.25, 0x1a9d54, 8); b.beam([0.2, 0.2, -0.16], [0.2, 0.26, -0.05], 0.03, 0.03, 0x1a9d54);
      b.cyl('y', 0.05, 0.04, 0.08, -0.05, 0.07, 0.05, 0xd9322b, 8);
      return { footprint: { w: 1.0, d: 1.0, h: 1.8 }, placement: 'wall', use: { x: 0, z: 0.05, yaw: Math.PI, verb: 'wash', label: 'Se laver', clip: 'Idle' } };
    },
    better: b => {
      b.slab(0.95, 0.06, 0.95, 0, 0, 0, W, topRect(FUV.tiles)); b.cyl('y', 0.04, 0.04, 0.005, 0, 0.06, 0, 0x777777, 8);
      b.box(0.95, 2.1, 0.06, 0, 0, -0.475, W, { pz: { rect: FUV.tiles } }); b.box(0.06, 2.1, 0.95, -0.475, 0, 0, W, { px: { rect: FUV.tiles } });
      b.beam([0.1, 1.95, -0.44], [0.1, 1.95, -0.25], 0.03, 0.03, C.chrome); b.cyl('y', 0.08, 0.05, 0.04, 0.1, 1.9, -0.25, C.chrome, 10, { neg: FUV.fan, pos: true });
      b.beam([0.1, 0.4, -0.44], [0.1, 1.95, -0.44], 0.025, 0.025, C.chrome); b.box(0.1, 0.06, 0.04, 0.1, 1.05, -0.42, C.chrome);
      b.beam([0.47, 2.0, -0.45], [0.47, 2.0, 0.47], 0.025, 0.025, C.chrome); b.beam([-0.45, 2.0, 0.47], [0.47, 2.0, 0.47], 0.025, 0.025, C.chrome);
      b.box(0.04, 1.75, 0.3, 0.45, 0.22, 0.3, W, { px: { rect: FUV.curtain }, nx: { rect: FUV.curtain } });
      b.box(0.14, 0.02, 0.08, -0.3, 1.2, -0.42, C.white);
      return { footprint: { w: 1.02, d: 1.02, h: 2.1 }, placement: 'wall', use: { x: 0, z: 0.05, yaw: Math.PI, verb: 'wash', label: 'Prendre une douche', clip: 'Idle' } };
    },
    premium: (b, g) => {
      b.slab(1.05, 0.06, 1.05, 0, 0, 0, W, topRect(FUV.marble)); b.box(0.5, 0.005, 0.06, 0, 0.06, 0.3, 0x888888);
      b.box(1.05, 2.25, 0.06, 0, 0, -0.525, W, { pz: { rect: FUV.marble } }); b.box(0.06, 2.25, 1.05, -0.525, 0, 0, W, { px: { rect: FUV.marble } });
      b.beam([0, 2.15, -0.49], [0, 2.15, -0.15], 0.03, 0.03, C.chrome); b.cyl('y', 0.16, 0.16, 0.02, 0, 2.1, -0.15, C.chrome, 12, { neg: FUV.fan, pos: true });
      b.box(0.14, 0.14, 0.04, 0.2, 1.05, -0.49, C.chrome); b.cyl('z', 0.03, 0.03, 0.05, 0.2, 1.12, -0.46, C.black, 8);
      b.beam([-0.49, 1.3, -0.2], [-0.49, 1.3, 0.25], 0.025, 0.025, C.chrome); b.box(0.04, 0.5, 0.3, -0.47, 0.82, 0.02, 0xf2f2ec);
      for (const [a, c] of [[[0.52, 0, -0.5], [0.52, 0, 0.52]], [[-0.5, 0, 0.52], [0.0, 0, 0.52]]] as const) {
        const ax = a[0], az = a[2], cx = c[0], cz = c[2];
        g.toward([[ax, 0.06, az], [cx, 0.06, cz], [cx, 2.0, cz], [ax, 2.0, az]], ax === cx ? [1, 0, 0] : [0, 0, 1], 0xd8eef4);
        b.beam([ax, 2.0, az], [cx, 2.0, cz], 0.025, 0.025, C.chrome); b.beam([cx, 0.06, cz], [cx, 2.0, cz], 0.025, 0.025, C.chrome);
      }
      b.beam([0.52, 0.06, 0.52], [0.52, 2.0, 0.52], 0.03, 0.03, C.chrome);
      b.box(0.36, 0.3, 0.08, -0.2, 1.25, -0.48, 0xd8d2c8); b.slab(0.36, 0.02, 0.1, -0.2, 1.25, -0.47, C.chrome);
      for (let k = 0; k < 3; k++) b.cyl('y', 0.03, 0.03, 0.14 + k * 0.03, -0.32 + k * 0.11, 1.33 + k * 0.015, -0.46, [0xf2f2ec, 0x8fd0c0, 0xd98ab0][k], 8);
      b.box(0.04, 0.3, 0.32, -0.47, 1.0, 0.02, 0x2f6fb3, { px: { rect: FUV.cloth } });
      b.cyl('y', 0.05, 0.05, 0.02, 0.32, 1.0, -0.47, C.chrome, 8); b.box(0.07, 0.03, 0.05, 0.32, 1.02, -0.46, 0xf4c20d);
      return { footprint: { w: 1.08, d: 1.08, h: 2.25 }, placement: 'wall', use: { x: -0.05, z: 0.05, yaw: Math.PI, verb: 'wash', label: 'Prendre une douche', clip: 'Idle' } };
    },
  },
  // -------------------------------------------------------------------------------------------------- kitchen corner
  kitchen: {
    basic: b => {
      legs4(b, 0.8, 0.5, 0.6, 0.045, C.raw, 0, -0.03); b.slab(0.86, 0.035, 0.56, 0, 0.6, -0.03, C.raw, { py: { rect: FUV.wood, paint: C.raw } });
      b.cyl('y', 0.16, 0.16, 0.42, 0.52, 0.21, -0.05, C.butane, 10); b.cyl('y', 0.13, 0.15, 0.08, 0.52, 0.44, -0.05, 0x333333, 8); b.cyl('y', 0.2, 0.18, 0.22, 0.52, 0.59, -0.05, C.alu, 10);
      b.cyl('y', 0.15, 0.13, 0.14, -0.2, 0.69, -0.05, C.alu, 10); b.cyl('y', 0.12, 0.12, 0.08, 0.15, 0.66, 0.0, 0xe8e8e4, 10);
      b.cyl('y', 0.26, 0.2, 0.12, -0.15, 0.06, 0.12, 0xd9322b, 12); b.cyl('y', 0.15, 0.13, 0.3, 0.2, 0.15, 0.15, 0x2a8fd1, 10);
      for (let k = 0; k < 4; k++) b.blob(0.035, -0.32 + k * 0.05, 0.65, -0.18, 0xb24a6a);
      return { footprint: { w: 1.46, d: 0.8, h: 0.82 }, placement: 'wall', use: standUse(0.8, 'use', 'Cuisiner', 0.5) };
    },
    better: b => {
      const w = 1.6, d = 0.62;
      b.box(w, 0.86, d, 0, 0, 0, 0x8fc3a8, { pz: { rect: FUV.tiles, paint: 0xd8ece2 } });
      b.slab(w + 0.04, 0.04, d + 0.04, 0, 0.86, 0, W, topRect(FUV.tiles));
      b.box(0.56, 0.008, 0.36, -0.4, 0.9, -0.02, W, topRect(FUV.hob)); b.box(0.5, 0.008, 0.36, 0.42, 0.9, 0.0, W, topRect(FUV.sink));
      b.beam([0.42, 0.9, -0.24], [0.42, 1.12, -0.24], 0.025, 0.025, C.chrome); b.beam([0.42, 1.12, -0.24], [0.42, 1.12, -0.1], 0.025, 0.025, C.chrome);
      b.cyl('y', 0.14, 0.12, 0.16, -0.52, 0.91, -0.02, C.alu, 10);
      b.box(w, 0.03, 0.26, 0, 1.45, -d / 2 + 0.13, C.varnish);
      for (let k = 0; k < 6; k++) b.cyl('y', 0.04, 0.04, 0.14, -0.65 + k * 0.26, 1.48, -d / 2 + 0.13, [0xd9322b, 0xf4c20d, 0xe8742c, 0x6fbf6a, 0xf2f2ec, 0x8a5a3a][k], 6);
      return { footprint: { w: w + 0.04, d: d + 0.04, h: 1.62 }, placement: 'wall', use: standUse(d, 'use', 'Cuisiner', 0.5) };
    },
    premium: b => {
      const w = 2.4, d = 0.64, fx = w / 2 - 0.36;
      b.box(w - 0.74, 0.86, d, -0.37, 0, 0, 0xf4f2ec);
      for (let k = 0; k < 4; k++) { const x = -1.2 + 0.05 + k * 0.415; b.box(0.006, 0.78, 0.005, x + 0.39, 0.04, d / 2 + 0.003, 0x9a9a96); b.box(0.12, 0.02, 0.02, x + 0.2, 0.74, d / 2 + 0.012, C.chrome); }
      b.slab(w - 0.72, 0.04, d + 0.04, -0.37, 0.86, 0, W, topRect(FUV.marble));
      b.box(0.58, 0.008, 0.4, -0.85, 0.9, -0.02, W, topRect(FUV.hob)); b.box(0.58, 0.008, 0.4, -0.3, 0.9, -0.02, W, topRect(FUV.hob));
      b.box(0.5, 0.008, 0.38, 0.3, 0.9, 0.0, W, topRect(FUV.sink)); b.beam([0.3, 0.9, -0.24], [0.3, 1.2, -0.24], 0.03, 0.03, C.chrome); b.beam([0.3, 1.2, -0.24], [0.3, 1.16, -0.06], 0.025, 0.025, C.chrome);
      b.box(w - 0.74, 0.6, 0.36, -0.37, 1.5, -d / 2 + 0.18, 0xf4f2ec, { ny: { paint: 0xdedad2 } });
      b.box(w - 0.74, 0.62, 0.02, -0.37, 0.88, -d / 2 + 0.01, W, { pz: { rect: FUV.tiles } });
      for (let k = 0; k < 4; k++) b.box(0.12, 0.02, 0.02, -1.0 + k * 0.42, 1.55, -d / 2 + 0.37, C.chrome);
      b.box(0.7, 1.86, 0.66, fx, 0, 0, 0xd8dcdf); b.box(0.005, 1.8, 0.005, fx, 0.03, 0.333, 0x8a8e93);
      b.box(0.02, 0.6, 0.03, fx - 0.05, 1.0, 0.345, C.chrome); b.box(0.02, 0.4, 0.03, fx - 0.05, 0.3, 0.345, C.chrome); b.box(0.66, 0.006, 0.005, fx, 0.75, 0.333, 0x8a8e93);
      // pots on the hob, kettle, microwave, fruit bowl, utensil rail, bottles
      b.cyl('y', 0.13, 0.12, 0.16, -0.95, 0.91, -0.02, C.chrome, 12); b.cyl('y', 0.135, 0.135, 0.015, -0.95, 1.07, -0.02, 0x2a2a2c, 12);
      b.cyl('y', 0.11, 0.11, 0.06, -0.72, 0.91, 0.05, 0x2a2a2c, 12); b.beam([-0.6, 0.94, 0.05], [-0.45, 0.94, 0.12], 0.03, 0.02, 0x2a2a2c);
      b.cyl('y', 0.08, 0.09, 0.18, -0.25, 0.91, -0.1, 0xc8322a, 10); b.beam([-0.17, 0.98, -0.1], [-0.12, 1.04, -0.1], 0.02, 0.02, 0xc8322a);
      b.box(0.46, 0.28, 0.34, 0.7, 0.9, -0.12, 0xe8e8e4, { pz: { rect: FUV.laptop } });
      b.cyl('y', 0.15, 0.09, 0.08, 0.05, 0.9, 0.12, C.white, 12); for (let k = 0; k < 4; k++) b.blob(0.045, 0.0 + (k % 2) * 0.08, 0.99 + (k > 1 ? 0.05 : 0), 0.1 + (k % 3) * 0.03, [0xf2a03a, 0xd9322b, 0x6fbf6a, 0xf4c20d][k]);
      b.beam([-1.0, 1.32, -d / 2 + 0.03], [-0.4, 1.32, -d / 2 + 0.03], 0.02, 0.02, C.chrome); for (let k = 0; k < 4; k++) b.beam([-0.92 + k * 0.15, 1.32, -d / 2 + 0.04], [-0.92 + k * 0.15, 1.12, -d / 2 + 0.05], 0.015, 0.03, [C.chrome, C.black, C.chrome, 0x8b5a32][k]);
      for (let k = 0; k < 3; k++) b.cyl('y', 0.035, 0.04, 0.24 - k * 0.03, 0.55 + k * 0.1, 0.91, -d / 2 + 0.08, [0x2e8b4c, 0xf4c20d, 0x8a1c1c][k], 8);
      return { footprint: { w, d: 0.72, h: 2.1 }, placement: 'wall', use: { x: -0.37, z: d / 2 + 0.5, yaw: Math.PI, verb: 'use', label: 'Cuisiner', clip: 'Idle' } };
    },
  },
  // -------------------------------------------------------------------------------------------------- fan
  fan: {
    basic: b => {
      b.cyl('y', 0.11, 0.12, 0.04, 0, 0.02, 0, C.white, 10); b.cyl('y', 0.02, 0.02, 0.16, 0, 0.12, 0, C.white, 6);
      b.cyl('z', 0.06, 0.07, 0.14, 0, 0.26, -0.05, C.white, 8); b.cyl('z', 0.15, 0.15, 0.04, 0, 0.26, 0.05, 0x2a7fd1, 12, { pos: FUV.fan, neg: FUV.fan });
      return { footprint: { w: 0.32, d: 0.28, h: 0.42 }, placement: 'free', use: standUse(0.28, 'use', 'Allumer le ventilateur', 0.5) };
    },
    better: b => {
      for (const a of [0, Math.PI / 2]) b.beam([Math.sin(a) * -0.25, 0.02, Math.cos(a) * -0.25], [Math.sin(a) * 0.25, 0.02, Math.cos(a) * 0.25], 0.04, 0.04, C.black);
      b.cyl('y', 0.018, 0.018, 1.0, 0, 0.55, 0, C.chrome, 6); b.cyl('z', 0.08, 0.09, 0.18, 0, 1.12, -0.06, C.black, 8);
      b.cyl('z', 0.24, 0.24, 0.06, 0, 1.12, 0.07, 0x333333, 14, { pos: FUV.fan, neg: FUV.fan });
      return { footprint: { w: 0.5, d: 0.5, h: 1.36 }, placement: 'free', use: standUse(0.5, 'use', 'Allumer le ventilateur', 0.5) };
    },
    premium: b => {
      b.cyl('y', 0.18, 0.2, 0.05, 0, 0.025, 0, C.chrome, 14); b.box(0.24, 1.0, 0.24, 0, 0.05, 0, 0x2a2a2c, { pz: { rect: FUV.books, paint: 0x3a3a3c } });
      b.box(0.14, 0.82, 0.01, 0, 0.12, 0.122, 0x1a1a1a); for (let k = 0; k < 10; k++) b.box(0.14, 0.012, 0.012, 0, 0.16 + k * 0.08, 0.13, C.chrome);
      b.slab(0.26, 0.04, 0.26, 0, 1.05, 0, C.chrome); b.box(0.12, 0.01, 0.06, 0, 1.09, 0, 0x8fd0ff);
      return { footprint: { w: 0.4, d: 0.4, h: 1.1 }, placement: 'free', use: standUse(0.4, 'use', 'Allumer le ventilateur', 0.5) };
    },
  },
  // -------------------------------------------------------------------------------------------------- rugs (walkable)
  rug: {
    basic: b => { b.slab(1.6, 0.008, 1.1, 0, 0, 0, W, topRect(FUV.plasticMat)); const s = [seatOf('m0', -0.4, 0, 0.01, 'mat', 0, 'SitFloor'), seatOf('m1', 0.4, 0, 0.01, 'mat', 0, 'SitFloor')]; return { footprint: { w: 1.6, d: 1.1, h: 0.01 }, placement: 'floor', walkable: true, seats: s, use: sitUse(s[0], 'sit', 'S’asseoir sur la natte') }; },
    better: b => { b.slab(2.0, 0.012, 1.4, 0, 0, 0, W, topRect(FUV.rug1)); const s = [seatOf('m0', -0.5, 0, 0.012, 'mat', 0, 'SitFloor'), seatOf('m1', 0.5, 0, 0.012, 'mat', 0, 'SitFloor')]; return { footprint: { w: 2.0, d: 1.4, h: 0.012 }, placement: 'floor', walkable: true, seats: s, use: sitUse(s[0], 'sit', 'S’asseoir sur le tapis') }; },
    premium: b => {
      b.slab(2.6, 0.025, 1.8, 0, 0, 0, 0x7a1424, topRect(FUV.rug2));
      for (const sx of [-1, 1]) for (let k = 0; k < 14; k++) b.box(0.05, 0.006, 0.012, sx * 1.325, 0, -0.84 + k * 0.13, 0xf0e1c0);
      const s = [seatOf('m0', -0.6, 0, 0.025, 'mat', 0, 'SitFloor'), seatOf('m1', 0.6, 0, 0.025, 'mat', 0, 'SitFloor')];
      return { footprint: { w: 2.7, d: 1.8, h: 0.025 }, placement: 'floor', walkable: true, seats: s, use: sitUse(s[0], 'sit', 'S’asseoir sur le tapis') };
    },
  },
  // -------------------------------------------------------------------------------------------------- lamps
  lamp: {
    basic: b => {
      b.box(0.13, 0.2, 0.13, 0, 0, 0, C.white, { pz: { rect: FUV.bulb }, nz: { rect: FUV.bulb } }); b.slab(0.15, 0.03, 0.15, 0, 0.2, 0, 0xd9322b);
      b.beam([-0.05, 0.23, 0], [0, 0.29, 0], 0.015, 0.015, 0x333333); b.beam([0.05, 0.23, 0], [0, 0.29, 0], 0.015, 0.015, 0x333333);
      return { footprint: { w: 0.15, d: 0.15, h: 0.3 }, placement: 'free', use: standUse(0.15, 'use', 'Allumer la lampe', 0.45) };
    },
    better: b => {
      legs4(b, 0.44, 0.38, 0.5, 0.04, C.varnish); b.box(0.44, 0.18, 0.38, 0, 0.32, 0, C.varnish, { pz: { paint: C.varnishLight } }); b.slab(0.48, 0.03, 0.42, 0, 0.5, 0, C.varnish);
      b.box(0.08, 0.015, 0.015, 0, 0.4, 0.195, C.gold);
      b.cyl('y', 0.07, 0.09, 0.12, 0.05, 0.59, -0.02, 0xd9cfb8, 10); b.cyl('y', 0.015, 0.015, 0.16, 0.05, 0.73, -0.02, C.gold, 6);
      b.cyl('y', 0.11, 0.17, 0.22, 0.05, 0.9, -0.02, W, 12, { neg: FUV.bulb, pos: false, side: FUV.shade });
      return { footprint: { w: 0.48, d: 0.42, h: 1.01 }, placement: 'free', use: standUse(0.42, 'use', 'Allumer la lampe', 0.45) };
    },
    premium: b => {
      b.cyl('y', 0.2, 0.22, 0.04, 0, 0.02, 0, C.gold, 14); b.cyl('y', 0.05, 0.08, 0.14, 0, 0.11, 0, C.gold, 10);
      b.cyl('y', 0.018, 0.018, 1.3, 0, 0.83, 0, C.gold, 6); b.blob(0.05, 0, 0.82, 0, C.gold, [1, 1, 1], 1);
      b.cyl('y', 0.16, 0.26, 0.3, 0, 1.6, 0, W, 14, { neg: FUV.bulb, pos: false, side: FUV.shade });
      return { footprint: { w: 0.52, d: 0.52, h: 1.75 }, placement: 'free', use: standUse(0.52, 'use', 'Allumer la lampe', 0.45) };
    },
  },
  // -------------------------------------------------------------------------------------------------- shelves
  shelf: {
    basic: b => {
      for (const x of [-0.42, 0, 0.42]) { b.box(0.2, 0.19, 0.2, x, 0, 0, C.cement); b.box(0.2, 0.19, 0.2, x, 0.31, 0, C.cement); }
      b.slab(1.04, 0.03, 0.26, 0, 0.19, 0, C.raw); b.slab(1.04, 0.03, 0.26, 0, 0.5, 0, C.raw);
      b.box(0.3, 0.18, 0.12, -0.3, 0.53, 0.02, 0x2b2b33); b.cyl('z', 0.05, 0.05, 0.01, -0.34, 0.62, 0.085, 0x9aa0a6, 10);
      for (let k = 0; k < 3; k++) b.cyl('y', 0.045, 0.045, 0.14, 0.1 + k * 0.12, 0.53, 0.0, [0xd9322b, 0xf4c20d, 0x6fbf6a][k], 6);
      b.box(0.3, 0.12, 0.2, 0.25, 0.22, 0, W, { pz: { rect: FUV.books } });
      return { footprint: { w: 1.04, d: 0.26, h: 0.72 }, placement: 'wall', use: standUse(0.26, 'use', 'Ranger', 0.55) };
    },
    better: b => {
      const w = 0.9, d = 0.32, h = 1.6;
      for (const sx of [-1, 1]) b.box(0.03, h, d, sx * (w / 2 - 0.015), 0, 0, C.varnish);
      b.box(w, h, 0.015, 0, 0, -d / 2 + 0.008, C.dark);
      for (let k = 0; k < 5; k++) b.slab(w - 0.06, 0.025, d, 0, k * 0.385, 0, C.varnish);
      for (let k = 0; k < 4; k++) b.box(w - 0.1 - (k % 2) * 0.25, 0.26, 0.22, -(k % 2) * 0.12, k * 0.385 + 0.025, -0.02, W, { pz: { rect: FUV.books } });
      return { footprint: { w, d, h }, placement: 'wall', use: standUse(d, 'browse', 'Prendre un livre', 0.55) };
    },
    premium: b => {
      const w = 1.0, d = 0.42, h = 1.8;
      legs4(b, w, d, 0.12, 0.06, C.gold);
      b.box(w, h - 0.12, d, 0, 0.12, 0, C.darker, { pz: { rect: FUV.vitrine } });
      b.box(w + 0.08, 0.1, d + 0.06, 0, h, 0, C.dark); b.box(0.5, 0.16, 0.05, 0, h + 0.1, d / 2 - 0.02, C.gold, { pz: { rect: FUV.carved, paint: C.gold } });
      b.box(0.03, 0.12, 0.03, 0.04, 1.0, d / 2 + 0.015, C.gold);
      // vases and a covered dish on top of the display cabinet
      for (const [x, r, hh, col] of [[-0.38, 0.06, 0.26, 0x1f5aa8], [0.36, 0.05, 0.2, 0xc9a043], [0.24, 0.045, 0.16, 0x9a2234]] as const) { b.cyl('y', r * 0.6, r, hh * 0.6, x, h + 0.1 + hh * 0.3, 0, col, 10); b.cyl('y', r * 0.5, r * 0.6, hh * 0.4, x, h + 0.1 + hh * 0.8, 0, col, 10); }
      b.cyl('y', 0.14, 0.14, 0.02, -0.12, h + 0.11, 0.02, C.gold, 12); b.blob(0.1, -0.12, h + 0.14, 0.02, C.chrome, [1, 0.6, 1], 1);
      return { footprint: { w: w + 0.08, d: d + 0.06, h: h + 0.4 }, placement: 'wall', use: standUse(d, 'use', 'Sortir les verres', 0.55) };
    },
  },
  // -------------------------------------------------------------------------------------------------- mirrors
  mirror: {
    basic: b => {
      b.box(0.3, 0.4, 0.015, 0, 1.3, -0.01, 0xe8742c); b.box(0.26, 0.36, 0.005, 0, 1.32, 0.0, W, { pz: { rect: FUV.mirror } });
      b.beam([0, 1.7, -0.01], [-0.1, 1.62, -0.005], 0.006, 0.006, 0x333333); b.beam([0, 1.7, -0.01], [0.1, 1.62, -0.005], 0.006, 0.006, 0x333333);
      return { footprint: { w: 0.3, d: 0.03, h: 1.72 }, placement: 'wall', use: standUse(0.03, 'use', 'Se préparer', 0.7) };
    },
    better: b => {
      b.box(0.64, 0.94, 0.04, 0, 0.9, -0.01, C.varnish, { pz: { rect: FUV.wood, paint: C.varnishLight } }); b.box(0.52, 0.82, 0.005, 0, 0.96, 0.012, W, { pz: { rect: FUV.mirror } });
      b.slab(0.6, 0.03, 0.1, 0, 0.88, 0.05, C.varnish); b.cyl('y', 0.03, 0.03, 0.12, -0.15, 0.91, 0.05, 0xc2417f, 6);
      return { footprint: { w: 0.64, d: 0.2, h: 1.84 }, placement: 'wall', use: standUse(0.12, 'use', 'Se préparer', 0.7) };
    },
    premium: b => {
      for (const sx of [-1, 1]) b.beam([sx * 0.32, 0.03, 0.12], [sx * 0.32, 0.1, -0.1], 0.06, 0.05, C.gold);
      b.box(0.74, 1.84, 0.06, 0, 0.08, 0, C.gold, { pz: { rect: FUV.carved, paint: C.gold } });
      b.box(0.6, 1.64, 0.006, 0, 0.18, 0.032, W, { pz: { rect: FUV.mirror } });
      b.box(0.36, 0.16, 0.06, 0, 1.92, 0, C.gold, { pz: { rect: FUV.gold } });
      return { footprint: { w: 0.74, d: 0.3, h: 2.08 }, placement: 'free', use: standUse(0.3, 'use', 'Se préparer', 0.75) };
    },
  },
  // -------------------------------------------------------------------------------------------------- attaya (tea) set, with a stool
  attaya: {
    basic: b => {
      const z0 = -0.18;
      b.cyl('y', 0.12, 0.1, 0.16, 0, 0.08, z0, 0x3a3a3a, 10); b.cyl('y', 0.13, 0.12, 0.03, 0, 0.175, z0, 0x555555, 10); b.cyl('y', 0.1, 0.1, 0.005, 0, 0.19, z0, 0xff6a20, 8);
      b.cyl('y', 0.09, 0.1, 0.13, 0, 0.255, z0, C.enamel, 10); b.cyl('y', 0.04, 0.06, 0.04, 0, 0.34, z0, C.enamel, 8); b.beam([0.08, 0.27, z0], [0.17, 0.33, z0], 0.025, 0.025, C.enamel);
      b.cyl('y', 0.15, 0.15, 0.015, 0.25, 0.008, z0 + 0.12, C.alu, 12); for (let k = 0; k < 2; k++) b.cyl('y', 0.022, 0.018, 0.07, 0.2 + k * 0.08, 0.05, z0 + 0.12, 0xe8f4ff, 6);
      const seats = attayaCircle(z0, 0.012, (x, z) => b.slab(0.44, 0.012, 0.44, x, 0, z, W, topRect(FUV.natte)));
      return { footprint: { w: 1.6, d: 1.1, h: 0.4 }, placement: 'free', seats, use: sitUse(seats[0], 'use', 'Préparer l’attaya') };
    },
    better: b => {
      const z0 = -0.2;
      b.cyl('y', 0.11, 0.11, 0.24, -0.06, 0.12, z0, C.butane, 10); b.cyl('y', 0.09, 0.1, 0.04, -0.06, 0.26, z0, 0x333333, 8);
      b.cyl('y', 0.08, 0.09, 0.12, -0.06, 0.34, z0, C.alu, 10); b.cyl('y', 0.035, 0.05, 0.04, -0.06, 0.42, z0, C.alu, 8); b.beam([0.01, 0.35, z0], [0.1, 0.41, z0], 0.022, 0.022, C.alu);
      b.cyl('y', 0.2, 0.2, 0.015, 0.22, 0.008, z0 + 0.14, C.alu, 14); for (let k = 0; k < 4; k++) b.cyl('y', 0.022, 0.018, 0.07, 0.12 + (k % 2) * 0.09, 0.05, z0 + 0.08 + Math.floor(k / 2) * 0.1, 0xe8f4ff, 6);
      b.box(0.1, 0.08, 0.08, 0.36, 0.02, z0 + 0.14, 0xf2f2ec); for (let k = 0; k < 4; k++) b.blob(0.03, 0.3 + k * 0.025, 0.04, z0 + 0.25, 0x3a9a3a);
      const seats = attayaCircle(z0, 0.07, (x, z) => b.slab(0.46, 0.07, 0.46, x, 0, z, 0x1f5aa8, topRect(FUV.wax1)));
      return { footprint: { w: 1.6, d: 1.12, h: 0.45 }, placement: 'free', seats, use: sitUse(seats[0], 'use', 'Préparer l’attaya') };
    },
    premium: b => {
      const z0 = -0.2;
      b.slab(0.62, 0.3, 0.42, 0, 0.04, z0, C.darker, { pz: { rect: FUV.carved, paint: C.dark }, px: { rect: FUV.carved, paint: C.dark }, nx: { rect: FUV.carved, paint: C.dark } });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.06, 0.04, 0.06, sx * 0.28, 0, z0 + sz * 0.18, C.gold);
      b.cyl('y', 0.28, 0.28, 0.02, 0, 0.34, z0, C.gold, 16, { pos: FUV.gold, neg: true });
      b.cyl('y', 0.08, 0.1, 0.13, -0.12, 0.42, z0, C.chrome, 12); b.cyl('y', 0.03, 0.06, 0.06, -0.12, 0.515, z0, C.chrome, 10); b.blob(0.02, -0.12, 0.555, z0, C.gold); b.beam([-0.04, 0.43, z0], [0.06, 0.5, z0], 0.022, 0.022, C.chrome);
      for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; b.cyl('y', 0.024, 0.02, 0.08, 0.1 + Math.cos(a) * 0.1, 0.39, z0 + Math.sin(a) * 0.1, 0xe8f4ff, 6); }
      b.cyl('y', 0.09, 0.09, 0.2, 0.42, 0.1, z0 + 0.1, C.butane, 10); b.cyl('y', 0.08, 0.08, 0.03, 0.42, 0.215, z0 + 0.1, C.chrome, 8);
      const seats = attayaCircle(z0, 0.1, (x, z) => { b.slab(0.5, 0.1, 0.5, x, 0, z, 0x9a2234, { py: { rect: FUV.velvet } }); for (const [dx, dz] of [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]]) b.blob(0.03, x + dx, 0.08, z + dz, C.gold); });
      return { footprint: { w: 1.72, d: 1.18, h: 0.6 }, placement: 'free', seats, use: sitUse(seats[0], 'use', 'Préparer l’attaya') };
    },
  },
  // -------------------------------------------------------------------------------------------------- prayer mats (walkable)
  prayerMat: {
    basic: b => { b.slab(0.62, 0.008, 1.12, 0, 0, 0, W, topRect(FUV.prayer0)); return { footprint: { w: 0.62, d: 1.12, h: 0.01 }, placement: 'floor', walkable: true, use: { x: 0, z: 0.2, yaw: Math.PI, verb: 'pray', label: 'Prier', clip: 'Idle' } }; },
    better: b => { b.slab(0.66, 0.012, 1.16, 0, 0, 0, W, topRect(FUV.prayer1)); return { footprint: { w: 0.66, d: 1.16, h: 0.012 }, placement: 'floor', walkable: true, use: { x: 0, z: 0.2, yaw: Math.PI, verb: 'pray', label: 'Prier', clip: 'Idle' } }; },
    premium: b => {
      b.slab(0.7, 0.022, 1.2, 0, 0, 0, 0x6a1020, topRect(FUV.prayer2));
      for (const sz of [-1, 1]) for (let k = 0; k < 8; k++) b.box(0.012, 0.006, 0.05, -0.3 + k * 0.086, 0, sz * 0.62, 0xd4a944);
      return { footprint: { w: 0.7, d: 1.3, h: 0.022 }, placement: 'floor', walkable: true, use: { x: 0, z: 0.2, yaw: Math.PI, verb: 'pray', label: 'Prier', clip: 'Idle' } };
    },
  },
};

// ------------------------------------------------------------------------------------------------------------ API
const cache = new Map<FurnitureId, { body: THREE.BufferGeometry; glass: THREE.BufferGeometry | null; part: Part }>();
export const isFurnitureId = (id: string): id is FurnitureId => (FURNITURE_IDS as readonly string[]).includes(id);

/** Spec of a piece (no mesh): footprint, seats, use anchor, budget. */
export function furnitureSpec(id: FurnitureId): FurnitureSpec { return buildFurniture(id).spec; }

/** Builds a piece of furniture: a group named `furn_<type>_<tier>` with one mesh (two with glass) and its spec. */
export function buildFurniture(id: FurnitureId): FurnitureBuild {
  if (!isFurnitureId(id)) throw new Error(`Unknown furniture id: ${id}`);
  const [type, tier] = id.split(':') as [FurnitureType, Tier];
  let hit = cache.get(id);
  if (!hit) {
    const b = new KitBuilder(FPLAIN), g = new KitBuilder(FPLAIN);
    const part = MAKERS[type][tier](b, g);
    hit = { body: b.build(), glass: g.triangles ? g.build() : null, part };
    cache.set(id, hit);
  }
  const M = furnitureMaterials();
  const group = new THREE.Group(); group.name = `furn_${type}_${tier}`;
  const body = new THREE.Mesh(hit.body, M.body); body.castShadow = true; body.receiveShadow = true; body.userData.shared = true; group.add(body);
  if (hit.glass) { const gm = new THREE.Mesh(hit.glass, M.glass); gm.userData.shared = true; group.add(gm); }
  const p = hit.part, tierIdx = TIERS.indexOf(tier);
  const spec: FurnitureSpec = {
    id, type, tier, name: FURNITURE_NAME[type][tierIdx], footprint: { ...p.footprint }, placement: p.placement, walkable: !!p.walkable,
    seats: (p.seats ?? []).map(s => ({ ...s })), use: { ...p.use },
    budget: { tris: (hit.body.attributes.position.count + (hit.glass?.attributes.position.count ?? 0)) / 3, drawCalls: hit.glass ? 2 : 1 },
  };
  group.userData.furnitureSpec = spec;
  return { group, footprint: spec.footprint, seats: spec.seats, spec };
}

/**
 * Seats of a placed piece as interaction seats (src/interact/seats.ts): world position and facing, and `top` in the
 * seats' convention — the surface for chairs, the surface + SIT_HIPS for floor poses (Lie, SitFloor), so that
 * sitOriginY(seat) stands the body on the mattress, mat or cushion; `clip` carries the pose (seatClip).
 */
export function furnitureSeats(obj: THREE.Object3D, spec: FurnitureSpec, space: string, prefix: string): Seat[] {
  obj.updateWorldMatrix(true, false);
  const q = obj.getWorldQuaternion(new THREE.Quaternion()), f = new THREE.Vector3(0, 0, 1).applyQuaternion(q), yaw = Math.atan2(f.x, f.z);
  return spec.seats.map(s => {
    const v = new THREE.Vector3(s.x, s.top, s.z).applyMatrix4(obj.matrixWorld);
    const floor = !!s.clip && FLOOR_POSES.has(s.clip);
    return { id: `${prefix}:${s.id}`, x: v.x, z: v.z, top: floor ? floorSeatTop(v.y) : v.y, yaw: yaw + s.yaw, kind: s.kind, space, occupant: null, ...(s.clip ? { clip: s.clip } : {}) };
  });
}
/** The use anchor of a placed piece in world coordinates (x, z, facing yaw). */
export function furnitureUseAt(obj: THREE.Object3D, spec: FurnitureSpec) {
  obj.updateWorldMatrix(true, false);
  const q = obj.getWorldQuaternion(new THREE.Quaternion()), f = new THREE.Vector3(0, 0, 1).applyQuaternion(q), yaw = Math.atan2(f.x, f.z);
  const v = new THREE.Vector3(spec.use.x, 0, spec.use.z).applyMatrix4(obj.matrixWorld);
  return { x: v.x, z: v.z, yaw: yaw + spec.use.yaw };
}
/** Which kit piece stands in for each item of the current starter-room catalogue (src/economy/furniture.ts). */
export const LEGACY_FURNITURE: Record<string, FurnitureId | null> = { miroir: 'mirror:better', tapis: 'rug:better', chaises: 'plasticChair:basic', matelas: 'bed:better', tele: 'tv:basic', radio: null };
