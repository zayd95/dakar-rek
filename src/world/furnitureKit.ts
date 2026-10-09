import * as THREE from 'three';
import { KitBuilder, paintAtlas, type Paint, type Rect } from './kitGeometry';
import { FW, FH, FUV, FPLAIN, drawFurnitureAtlas } from './furnitureAtlas';
import type { Seat, SeatKind } from '../interact/seats';
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
  | 'shower' | 'kitchen' | 'fan' | 'rug' | 'lamp' | 'shelf' | 'mirror' | 'attaya' | 'prayerMat';
export const FURNITURE_TYPES: readonly FurnitureType[] = ['bed', 'sofa', 'armchair', 'plasticChair', 'woodenChair', 'table', 'lowTable', 'desk', 'tv', 'wardrobe', 'shower', 'kitchen', 'fan', 'rug', 'lamp', 'shelf', 'mirror', 'attaya', 'prayerMat'];
export type FurnitureId = `${FurnitureType}:${Tier}`;
export const FURNITURE_IDS: readonly FurnitureId[] = FURNITURE_TYPES.flatMap(t => TIERS.map(r => `${t}:${r}` as FurnitureId));

export interface FurnitureSeat { id: string; x: number; z: number; top: number; yaw: number; kind: SeatKind }
export interface FurnitureUse {
  /** Where the person is (stands, sits or lies), local, and which way they face (0 = +z). */
  x: number; z: number; yaw: number;
  verb: Primitive;
  /** French label for the action button. */
  label: string;
  clip: 'Idle' | 'Sit' | 'Talk';
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
const seatOf = (id: string, x: number, z: number, top: number, kind: SeatKind, yaw = 0): FurnitureSeat => ({ id, x, z, top, yaw, kind });
const standUse = (d: number, verb: Primitive, label: string, dist = 0.55): FurnitureUse => ({ x: 0, z: d / 2 + dist, yaw: Math.PI, verb, label, clip: 'Idle' });
const sitUse = (s: FurnitureSeat, verb: Primitive, label: string): FurnitureUse => ({ x: s.x, z: s.z, yaw: s.yaw, verb, label, clip: 'Sit', seat: s.id });
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
  if (tier === 'better') {
    const w = 0.66 * n + 0.36, d = 0.88, top = 0.46, f = 0x6f7f96;
    legs4(b, w - 0.1, d - 0.1, 0.1, 0.05, C.dark);
    b.slab(w, 0.28, d, 0, 0.1, 0, f, { py: { rect: FUV.fabric, paint: f } });
    b.box(w, 0.48, 0.22, 0, 0.38, -d / 2 + 0.11, f);
    for (const sx of [-1, 1]) b.slab(0.18, 0.32, d, sx * (w / 2 - 0.09), 0.38, 0, f);
    for (let k = 0; k < n; k++) { const x = (k - (n - 1) / 2) * 0.66; b.slab(0.62, 0.09, d - 0.3, x, 0.37, 0.1, dimC(f, 1.1), { py: { rect: FUV.fabric, paint: dimC(f, 1.15) } }); b.at(x, 0.46, -d / 2 + 0.28, 0, () => b.box(0.6, 0.42, 0.14, 0, 0, 0, dimC(f, 1.08)), -0.18); }
    b.at(-(w / 2 - 0.34), 0.5, -d / 2 + 0.36, 0.3, () => b.box(0.34, 0.32, 0.1, 0, 0, 0, 0xe8742c, { pz: { rect: FUV.wax1 } }), -0.25);
    return { w, d, h: 0.9, top };
  }
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
const perTier = (f: (t: Tier) => Maker): Record<Tier, Maker> => ({ basic: f('basic'), better: f('better'), premium: f('premium') });
const dimC = (c: number, k: number) => new THREE.Color(c).multiplyScalar(k).getHex();

const MAKERS: Record<FurnitureType, Record<Tier, Maker>> = {
  // -------------------------------------------------------------------------------------------------- bed
  bed: {
    basic: b => {
      b.slab(1.0, 0.015, 1.95, 0, 0, 0, W, topRect(FUV.natte));
      b.slab(0.88, 0.1, 1.84, 0, 0.015, 0.03, C.foam, topRect(FUV.wax0));
      b.slab(0.5, 0.08, 0.3, 0, 0.115, -0.72, C.white);
      b.slab(0.86, 0.05, 0.4, 0, 0.115, 0.6, 0xd9482b, topRect(FUV.wax1));
      const s = seatOf('bed', 0, 0.55, 0.13, 'mat');
      return { footprint: { w: 1.0, d: 1.95, h: 0.2 }, placement: 'free', seats: [s], use: { x: 0, z: 0.1, yaw: 0, verb: 'sleep', label: 'Dormir', clip: 'Sit' } };
    },
    better: b => {
      legs4(b, 1.45, 2.05, 0.16, 0.07, C.varnish);
      b.slab(1.45, 0.22, 2.05, 0, 0.16, 0, C.varnish, { pz: { rect: FUV.wood, paint: C.varnish } });
      b.box(1.45, 0.62, 0.07, 0, 0.38, -1.0, C.varnish, { pz: { rect: FUV.wood, paint: C.varnishLight } });
      b.slab(1.38, 0.2, 1.95, 0, 0.38, 0.02, C.foam, topRect(FUV.wax1));
      b.slab(0.6, 0.12, 0.34, -0.33, 0.58, -0.78, C.white); b.slab(0.6, 0.12, 0.34, 0.33, 0.58, -0.78, C.cream);
      b.slab(1.4, 0.06, 0.55, 0, 0.58, 0.62, 0x2f6fb3, topRect(FUV.wax0));
      const s = seatOf('bed', 0.0, 0.72, 0.58, 'bed');
      return { footprint: { w: 1.45, d: 2.05, h: 1.0 }, placement: 'wall', seats: [s], use: { x: 0, z: 0.1, yaw: 0, verb: 'sleep', label: 'Dormir', clip: 'Sit' } };
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
      const s = seatOf('bed', 0, 0.78, 0.7, 'bed');
      return { footprint: { w: w + 0.16, d: d + 0.05, h: 1.9 }, placement: 'wall', seats: [s], use: { x: 0, z: 0.1, yaw: 0, verb: 'sleep', label: 'Dormir', clip: 'Sit' } };
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
    basic: b => { b.slab(1.6, 0.008, 1.1, 0, 0, 0, W, topRect(FUV.plasticMat)); const s = [seatOf('m0', -0.4, 0, 0.01, 'mat'), seatOf('m1', 0.4, 0, 0.01, 'mat')]; return { footprint: { w: 1.6, d: 1.1, h: 0.01 }, placement: 'floor', walkable: true, seats: s, use: sitUse(s[0], 'sit', 'S’asseoir sur la natte') }; },
    better: b => { b.slab(2.0, 0.012, 1.4, 0, 0, 0, W, topRect(FUV.rug1)); const s = [seatOf('m0', -0.5, 0, 0.012, 'mat'), seatOf('m1', 0.5, 0, 0.012, 'mat')]; return { footprint: { w: 2.0, d: 1.4, h: 0.012 }, placement: 'floor', walkable: true, seats: s, use: sitUse(s[0], 'sit', 'S’asseoir sur le tapis') }; },
    premium: b => {
      b.slab(2.6, 0.025, 1.8, 0, 0, 0, 0x7a1424, topRect(FUV.rug2));
      for (const sx of [-1, 1]) for (let k = 0; k < 14; k++) b.box(0.05, 0.006, 0.012, sx * 1.325, 0, -0.84 + k * 0.13, 0xf0e1c0);
      const s = [seatOf('m0', -0.6, 0, 0.025, 'mat'), seatOf('m1', 0.6, 0, 0.025, 'mat')];
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
      legs4(b, 0.26, 0.26, 0.36, 0.035, C.raw, 0, 0.32); b.slab(0.3, 0.03, 0.3, 0, 0.36, 0.32, C.raw);
      const s = seatOf('stool', 0, 0.32, 0.39, 'stool', Math.PI);
      return { footprint: { w: 0.84, d: 0.98, h: 0.4 }, placement: 'free', seats: [s], use: sitUse(s, 'use', 'Préparer l’attaya') };
    },
    better: b => {
      const z0 = -0.2;
      b.cyl('y', 0.11, 0.11, 0.24, -0.06, 0.12, z0, C.butane, 10); b.cyl('y', 0.09, 0.1, 0.04, -0.06, 0.26, z0, 0x333333, 8);
      b.cyl('y', 0.08, 0.09, 0.12, -0.06, 0.34, z0, C.alu, 10); b.cyl('y', 0.035, 0.05, 0.04, -0.06, 0.42, z0, C.alu, 8); b.beam([0.01, 0.35, z0], [0.1, 0.41, z0], 0.022, 0.022, C.alu);
      b.cyl('y', 0.2, 0.2, 0.015, 0.22, 0.008, z0 + 0.14, C.alu, 14); for (let k = 0; k < 4; k++) b.cyl('y', 0.022, 0.018, 0.07, 0.12 + (k % 2) * 0.09, 0.05, z0 + 0.08 + Math.floor(k / 2) * 0.1, 0xe8f4ff, 6);
      b.box(0.1, 0.08, 0.08, 0.36, 0.02, z0 + 0.14, 0xf2f2ec); for (let k = 0; k < 4; k++) b.blob(0.03, 0.3 + k * 0.025, 0.04, z0 + 0.25, 0x3a9a3a);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.035, 0.38, 0.035, sx * 0.13, 0, 0.32 + sz * 0.13, C.varnish);
      b.slab(0.32, 0.035, 0.32, 0, 0.38, 0.32, C.varnish);
      const s = seatOf('stool', 0, 0.32, 0.415, 'stool', Math.PI);
      return { footprint: { w: 0.86, d: 1.0, h: 0.45 }, placement: 'free', seats: [s], use: sitUse(s, 'use', 'Préparer l’attaya') };
    },
    premium: b => {
      const z0 = -0.2;
      b.slab(0.62, 0.3, 0.42, 0, 0.04, z0, C.darker, { pz: { rect: FUV.carved, paint: C.dark }, px: { rect: FUV.carved, paint: C.dark }, nx: { rect: FUV.carved, paint: C.dark } });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.06, 0.04, 0.06, sx * 0.28, 0, z0 + sz * 0.18, C.gold);
      b.cyl('y', 0.28, 0.28, 0.02, 0, 0.34, z0, C.gold, 16, { pos: FUV.gold, neg: true });
      b.cyl('y', 0.08, 0.1, 0.13, -0.12, 0.42, z0, C.chrome, 12); b.cyl('y', 0.03, 0.06, 0.06, -0.12, 0.515, z0, C.chrome, 10); b.blob(0.02, -0.12, 0.555, z0, C.gold); b.beam([-0.04, 0.43, z0], [0.06, 0.5, z0], 0.022, 0.022, C.chrome);
      for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; b.cyl('y', 0.024, 0.02, 0.08, 0.1 + Math.cos(a) * 0.1, 0.39, z0 + Math.sin(a) * 0.1, 0xe8f4ff, 6); }
      b.cyl('y', 0.09, 0.09, 0.2, 0.42, 0.1, z0 + 0.1, C.butane, 10); b.cyl('y', 0.08, 0.08, 0.03, 0.42, 0.215, z0 + 0.1, C.chrome, 8);
      b.cyl('y', 0.17, 0.15, 0.38, 0, 0.19, 0.34, C.dark, 12); b.cyl('y', 0.18, 0.18, 0.06, 0, 0.41, 0.34, 0x9a2234, 12, { pos: FUV.velvet, neg: true });
      const s = seatOf('stool', 0, 0.34, 0.44, 'stool', Math.PI);
      return { footprint: { w: 1.04, d: 1.08, h: 0.6 }, placement: 'free', seats: [s], use: sitUse(s, 'use', 'Préparer l’attaya') };
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

/** Seats of a placed piece as interaction seats (src/interact/seats.ts); `top` becomes the world height. */
export function furnitureSeats(obj: THREE.Object3D, spec: FurnitureSpec, space: string, prefix: string): Seat[] {
  obj.updateWorldMatrix(true, false);
  const q = obj.getWorldQuaternion(new THREE.Quaternion()), f = new THREE.Vector3(0, 0, 1).applyQuaternion(q), yaw = Math.atan2(f.x, f.z);
  return spec.seats.map(s => { const v = new THREE.Vector3(s.x, s.top, s.z).applyMatrix4(obj.matrixWorld); return { id: `${prefix}:${s.id}`, x: v.x, z: v.z, top: v.y, yaw: yaw + s.yaw, kind: s.kind, space, occupant: null }; });
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
