import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { KitBuilder, paintAtlas, seeded } from './kitGeometry';
import { SH, SW, SCOL, SPLAIN, SUV, drawShopAtlas, shopSlot, type ShopKey } from './shopAtlas';
import { buildFurniture, furnitureMaterials, type FurnitureId } from './furnitureKit';
import { buildVehicle, vehicleMaterials, vehicleSpec, type VehicleKind } from '../actors/vehicleKit';
import type { Collider } from './types';
import type { Seat, SeatKind } from '../interact/seats';

/**
 * Shop interior kit: `buildShopInterior(type, footprint, seed)` stocks any shop of the city from data — shelves full of
 * goods, a counter with its till, the shopkeeper's place behind it, the customers' spot and queue in front, displays
 * and decor of the trade — instead of each shop being modelled by hand. One plan serves every size: the counter, the
 * lanes the keeper and the customers walk, the shelf runs along the walls and the floor displays are laid out from the
 * footprint, then filled by the type's goods. Quality scales the detail (Low paints whole rows of goods on one quad).
 *
 * Geometry: everything is merged into ONE mesh on a shared vertex-coloured material with a painted atlas
 * (src/world/shopAtlas.ts), plus one mesh on a shared glass material when the shop has glass (vitrines, a fridge door,
 * bank partitions), plus one for the furniture showroom's pieces (src/world/furnitureKit.ts): 1–3 draw calls a shop.
 *
 * Local frame: centre of the footprint, open front (or door) toward +z, floor at y = 0. `at` places it in the world
 * (any yaw; colliders are the world AABBs). Words in the shop are generic (riz, lait, téléphonie…): no brand, no logo.
 */
export type ShopType = 'grocery' | 'phone' | 'clothing' | 'furniture' | 'pharmacy' | 'cafe' | 'bank' | 'hardware' | 'craft' | 'beauty' | 'garage' | 'restaurant' | 'showroom_cars';
export const SHOP_TYPES: readonly ShopType[] = ['grocery', 'phone', 'clothing', 'furniture', 'pharmacy', 'cafe', 'bank', 'hardware', 'craft', 'beauty', 'garage', 'restaurant', 'showroom_cars'];
export const SHOP_TYPE_NAME: Record<ShopType, string> = {
  grocery: 'Boutique · alimentation', phone: 'Téléphonie · réparation', clothing: 'Couture · prêt-à-porter', furniture: 'Meubles · maison',
  pharmacy: 'Santé · soins', cafe: 'Café · jus', bank: 'Banque · agence', hardware: 'Quincaillerie', craft: 'Artisanat', beauty: 'Beauté',
  garage: 'Garage · atelier', restaurant: 'Restaurant', showroom_cars: 'Voitures · occasions',
};
export type ShopDetail = 'low' | 'medium' | 'high';
/** Rectangle on the floor plan (local or world): x0 < x1, z0 < z1. */
export interface ShopRect { x0: number; x1: number; z0: number; z1: number }
/** A spot on the floor and the way a person there faces (game yaw: forward = sin / cos). */
export interface ShopSpot { x: number; z: number; yaw: number }
/** A car showroom's lot: where a vehicle stands (its nose toward `yaw`), and its price card on a stand at the nose. */
export interface ShopLot extends ShopSpot { card: ShopSpot }
/** What stands on a showroom lot: a kit vehicle, or null — the module that sells it draws it there (the one bought leaves). */
export type ShopLotVehicle = { kind: VehicleKind; seed: number } | null;
export interface ShopAnchors {
  /** Where a customer stands to buy, facing the counter: the shop's place anchor. */
  counter: ShopSpot;
  /** On the counter, by the till (prompt height `y`). */
  till: ShopSpot & { y: number };
  /** Behind the counter, facing the customers. */
  keeper: ShopSpot;
  /** More staff (bank tellers, a tailor at the machine, an artisan at the bench). */
  staff: ShopSpot[];
  /** Customers waiting their turn, the first at the counter. */
  queue: ShopSpot[];
  /** In front of the displays, facing them (customers looking around). */
  browse: ShopSpot[];
  /** Just inside the entrance, facing in. */
  door: ShopSpot;
  /** A car showroom's lots, the first nearest the aisle (`showroom_cars`). */
  lots?: ShopLot[];
}
export interface ShopOptions {
  detail?: ShopDetail;
  /**
   * Build the room too (tiled floor, walls with a doorway at +z, ceiling): a walkable interior placed off-map. 'open':
   * back and side walls inside the footprint, the ceiling and a header beam across a front left wide open (a showroom).
   */
  shell?: boolean | 'open';
  /** World placement of the local origin (y: floor height) and yaw of the local +z. */
  at?: { x: number; z: number; y?: number; yaw?: number };
  /** Prefix of the seat ids. */
  id?: string;
  /** Space of the seats ('street' for open shopfronts, the interior's id otherwise). */
  space?: string;
  /** Variant inside the type (craft: 0 baskets, 1 leather and wood, 2 painted pirogues). */
  variant?: number;
  /** Local areas to leave empty (another module's furniture: the salon's chairs…). */
  reserve?: ShopRect[];
  /** Room height (underside of the roof); default 3.6. */
  height?: number;
  /** Cast shadows (default true); a shop under its own roof can skip the shadow pass. */
  shadows?: boolean;
  /** `showroom_cars`: what stands on each lot, in order (default: three kit saloons). */
  lots?: readonly ShopLotVehicle[];
}
export interface ShopInterior {
  type: ShopType;
  group: THREE.Group;
  /** World AABBs (append to the hub's or the interior's colliders). */
  colliders: Collider[];
  /** Seats of the shared registry (waiting chairs, stools, a showroom's sofa). */
  seats: Seat[];
  anchors: ShopAnchors;
  /** World rectangle of the footprint. */
  bounds: ShopRect;
  /** Middle of the open front (or of the doorway), world. */
  front: { x: number; z: number };
  budget: { drawCalls: number; tris: number };
  dispose(): void;
}

// ------------------------------------------------------------------------------------------------------------ materials
let mats: { body: THREE.MeshLambertMaterial; glass: THREE.MeshLambertMaterial } | null = null;
/** The two materials shared by every shop interior (atlas body, glass). */
export function shopMaterials() {
  if (mats) return mats;
  const { map, glow } = paintAtlas(SW, SH, 4, drawShopAtlas);
  // screens, the fridge, the café menu, tubes and the green cross glow through the emissive atlas
  const body = new THREE.MeshLambertMaterial({ vertexColors: true, map, emissive: glow ? 0xffffff : 0x000000, emissiveMap: glow, emissiveIntensity: 0.75 });
  const glass = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false });
  mats = { body, glass };
  for (const m of Object.values(mats)) m.userData.shared = true;
  return mats;
}
/** Night (0 day … 1 night): tubes, screens and signs inside the shops shine brighter. */
export function setShopNight(n: number) { if (mats) mats.body.emissiveIntensity = 0.75 + 0.55 * n; }

// ------------------------------------------------------------------------------------------------------------ palette
const C = {
  frame: 0x5b3d26, board: 0x8b6a47, back: 0xe8dcc4, metal: 0x9aa0a6, steel: 0x5b6168, white: 0xf2f2ee, cream: 0xefe6d2, dark: 0x2b2f36,
  black: 0x1d1f24, glass: 0xd8eef2, wood: 0x9a6a3e, woodDark: 0x6b4a2e, chrome: 0xc9cdd2, terracotta: 0xb5652e, leaf: 0x3f8b3a, leaf2: 0x2e6b30,
  red: 0xc8322a, blue: 0x2f6fb3, yellow: 0xf2c230, green: 0x2e8b4c, plastic: [0x2a8fd1, 0xf2f2ee, 0x1a9d54, 0xd9322b] as const,
};
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const hit = (a: ShopRect, b: ShopRect) => a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;
const rect = (x0: number, x1: number, z0: number, z1: number): ShopRect => ({ x0, x1, z0, z1 });
const PI = Math.PI;

interface LCol extends ShopRect { h: number }
interface LSeat { id: string; x: number; z: number; top: number; yaw: number; kind: SeatKind }
/** Fill of one shelf board, in the unit's own frame (front toward +z): x0..x1 along the board, y its top, zf its front edge. */
type Fill = (R: Room, lvl: number, levels: number, x0: number, x1: number, y: number, zf: number, dp: number, gap: number, u: number) => void;
interface UnitStyle { dp: number; h: number; levels: number; frame: number; board: number; back: number }

/** The plan being built: geometry writers, colliders, seats and spots in the local frame, and the areas kept clear. */
class Room {
  readonly b = new KitBuilder(SPLAIN);
  readonly g = new KitBuilder(SPLAIN);
  readonly cols: LCol[] = [];
  readonly seats: LSeat[] = [];
  readonly browse: ShopSpot[] = [];
  readonly staff: ShopSpot[] = [];
  readonly furn: { id: FurnitureId; x: number; z: number; rotY: number }[] = [];
  /** Kit vehicles standing in the shop (a garage's motorbikes for sale, the car on the lift): merged at build time. */
  readonly veh: { kind: VehicleKind; seed: number; x: number; y: number; z: number; rotY: number }[] = [];
  /** Lanes the plan keeps clear (counter front, the keeper's corridor, the aisle, the doorway). */
  readonly keep: ShopRect[] = [];
  readonly xl: number; readonly xr: number; readonly zb: number;
  private units = 0;
  constructor(readonly W: number, readonly D: number, readonly H: number, readonly det: 0 | 1 | 2, readonly r: () => number, readonly reserve: ShopRect[], readonly prefix: string) {
    this.xl = -W / 2 + 0.15; this.xr = W / 2 - 0.15; this.zb = -D / 2 + 0.15;
  }
  rnd(a: number, b: number) { return a + (b - a) * this.r(); }
  pick<T>(l: readonly T[]): T { return l[Math.floor(this.r() * l.length) % l.length]; }
  /** True when the rectangle is clear of the reserved areas and of the lanes. */
  ok(q: ShopRect) { return !this.reserve.some(a => hit(a, q)) && !this.keep.some(a => hit(a, q)); }
  free(q: ShopRect) { return !this.reserve.some(a => hit(a, q)); }
  solid(q: ShopRect, h: number) { this.cols.push({ ...q, h }); }
  /** Floor rectangle of a w × d piece centred at (x, z), turned by a quarter turn. */
  foot(x: number, z: number, w: number, d: number, rotY = 0): ShopRect {
    const q = Math.abs(Math.sin(rotY)) > 0.5, hw = (q ? d : w) / 2, hd = (q ? w : d) / 2;
    return rect(x - hw, x + hw, z - hd, z + hd);
  }
  /**
   * 3D goods on this board (else a painted row): every board at High, the middle ones at Medium, none at Low — and no
   * more once the shop's triangle budget is spent (a big shop paints its last shelves).
   */
  full(lvl: number, levels: number) {
    if (this.b.triangles > (this.det === 2 ? 13000 : 8000)) return false;
    return this.det === 2 || (this.det === 1 && lvl >= 1 && lvl <= levels - 2);
  }
  seat(x: number, z: number, yaw: number, top: number, kind: SeatKind) { this.seats.push({ id: `${this.prefix}:seat:${this.seats.length}`, x, z, top, yaw, kind }); }

  // ---------------------------------------------------------------- shelving
  /** A shelving unit centred at (cx, cz), front facing rotY, `len` wide; returns false when the spot is taken. */
  unit(cx: number, cz: number, rotY: number, len: number, s: UnitStyle, fill: Fill, levels = s.levels, h = s.h): boolean {
    const f = this.foot(cx, cz, len, s.dp, rotY);
    if (!this.ok(f) || len < 0.5) return false;
    this.solid(f, h);
    const u = this.units++;
    this.b.at(cx, 0, cz, rotY, () => {
      const b = this.b, dp = s.dp;
      for (const sx of [-1, 1]) b.box(0.04, h, dp, sx * (len / 2 - 0.02), 0, 0, s.frame);
      b.box(len - 0.08, h - 0.03, 0.02, 0, 0, -dp / 2 + 0.01, s.back);
      b.slab(len, 0.03, dp, 0, h - 0.03, 0, s.frame);
      b.box(len - 0.08, 0.1, 0.02, 0, 0, dp / 2 - 0.01, s.frame);
      const step = (h - 0.16) / levels;
      for (let i = 0; i < levels; i++) {
        const y = 0.1 + i * step;
        b.slab(len - 0.08, 0.025, dp - 0.03, 0, y, 0.005, s.board);
        fill(this, i, levels, -len / 2 + 0.07, len / 2 - 0.07, y + 0.025, dp / 2 - 0.03, dp - 0.06, step - 0.035, u);
      }
    });
    return true;
  }
  /** Units along a wall from a to b (along x for the back wall, along z for the sides), each at most `max` long. */
  run(wall: 'back' | 'left' | 'right', a: number, b: number, s: UnitStyle, fill: Fill, max = 2.4, levels = s.levels, h = s.h) {
    const len = b - a; if (len < 0.6) return 0;
    const n = Math.max(1, Math.ceil(len / max)), l = len / n;
    let placed = 0;
    for (let i = 0; i < n; i++) {
      const m = a + (i + 0.5) * l, w = l - 0.04;
      const ok = wall === 'back' ? this.unit(m, this.zb + s.dp / 2, 0, w, s, fill, levels, h)
        : wall === 'left' ? this.unit(this.xl + s.dp / 2, m, PI / 2, w, s, fill, levels, h)
        : this.unit(this.xr - s.dp / 2, m, -PI / 2, w, s, fill, levels, h);
      if (ok) placed++;
    }
    return placed;
  }
  /** Two units back to back (a gondola), centred at (cx, cz), along x. */
  gondola(cx: number, cz: number, len: number, s: UnitStyle, fill: Fill, levels = 3, h = 1.45) {
    const f = this.foot(cx, cz, len, s.dp * 2);
    if (!this.ok(f)) return false;
    this.unit(cx, cz + s.dp / 2, 0, len, s, fill, levels, h);
    this.unit(cx, cz - s.dp / 2, PI, len, s, fill, levels, h);
    this.browse.push({ x: cx, z: cz + s.dp + 0.7, yaw: PI });
    return true;
  }

  // ---------------------------------------------------------------- goods (unit frame: front toward +z)
  strip(x0: number, x1: number, y: number, zf: number, gap: number, key: ShopKey) {
    const hh = Math.min(gap - 0.02, 0.34), len = x1 - x0; if (hh <= 0.05 || len <= 0.1) return;
    const n = Math.max(1, Math.round(len / (hh * 4))), sw = len / n;
    this.b.box(len, hh * 0.7, 0.04, (x0 + x1) / 2, y, zf - 0.16, 0x3a2e24);             // shadowed depth behind the painted row
    for (let i = 0; i < n; i++) this.b.decal([x0 + sw * (i + 0.5), y + hh / 2, zf - 0.02], [1, 0, 0], [0, 1, 0], sw, hh, SUV[key]);
  }
  cartons(x0: number, x1: number, y: number, zf: number, dp: number, gap: number, keys: readonly ShopKey[], w: [number, number] = [0.1, 0.2], hMax = 0.26) {
    let x = x0;
    while (x1 - x > w[0]) {
      const k = this.pick(keys), ww = Math.min(this.rnd(w[0], w[1]), x1 - x), hh = Math.max(0.05, Math.min(gap - 0.03, this.rnd(0.7, 1) * hMax)), dd = Math.min(dp, this.rnd(0.16, 0.28));
      const n = 1 + Math.floor(this.r() * 3);                                           // a few facings of the same product
      for (let i = 0; i < n && x1 - x >= ww; i++) {
        if (this.r() > 0.06) this.b.box(ww * 0.95, hh, dd, x + ww / 2, y, zf - dd / 2, SCOL[k] ?? C.white, { pz: { rect: SUV[k] } });
        x += ww;
      }
    }
  }
  tins(x0: number, x1: number, y: number, zf: number, gap: number, keys: readonly ShopKey[], r = 0.045, h = 0.11) {
    let x = x0 + r;
    while (x < x1 - r) {
      const k = this.pick(keys), n = 3 + Math.floor(this.r() * 4), two = gap > h * 2 + 0.05 && this.r() < 0.5;
      for (let i = 0; i < n && x < x1 - r; i++, x += r * 2.1) {
        for (let s = 0; s < (two ? 2 : 1); s++) this.b.cyl('y', r, r, h, x, y + h / 2 + s * h, zf - r, SCOL[k] ?? C.white, 6, { pos: true, neg: false, capPaint: C.chrome, side: SUV[k] });
      }
      x += 0.03;
    }
  }
  bottles(x0: number, x1: number, y: number, zf: number, gap: number, keys: readonly ShopKey[], r = 0.04, h = 0.26) {
    const hh = Math.min(h, gap - 0.04); if (hh < 0.1) return;
    let x = x0 + r;
    while (x < x1 - r) {
      const k = this.pick(keys), n = 3 + Math.floor(this.r() * 4), col = SCOL[k] ?? C.white;
      for (let i = 0; i < n && x < x1 - r; i++, x += r * 2.2) {
        this.b.cyl('y', r, r, hh * 0.72, x, y + hh * 0.36, zf - r, col, 5, { pos: false, neg: false, side: SUV[k] });
        this.b.cyl('y', r, r * 0.3, hh * 0.28, x, y + hh * 0.86, zf - r, col, 5, { pos: true, neg: false, capPaint: C.red });
      }
      x += 0.04;
    }
  }
  /** Folded stacks (cloth, towels, files): one box a stack, its front painted from a strip's slots. */
  stacks(x0: number, x1: number, y: number, zf: number, dp: number, gap: number, key: ShopKey, slots: number, w: [number, number] = [0.28, 0.38], col = C.cream) {
    let x = x0;
    while (x1 - x > w[0]) {
      const ww = Math.min(this.rnd(w[0], w[1]), x1 - x), hh = Math.min(gap - 0.04, this.rnd(0.18, 0.3)), dd = Math.min(dp, 0.32);
      if (this.r() > 0.08) this.b.box(ww - 0.03, hh, dd, x + ww / 2, y, zf - dd / 2, col, { pz: { rect: shopSlot(key, Math.floor(this.r() * slots), slots) } });
      x += ww;
    }
  }
  phones(x0: number, x1: number, y: number, zf: number, step = 0.16) {
    for (let x = x0 + 0.08; x < x1 - 0.06; x += step) {
      this.b.box(0.1, 0.03, 0.08, x, y, zf - 0.08, C.dark);                              // stand
      this.b.at(x, y + 0.02, zf - 0.09, 0, () => this.b.box(0.075, 0.15, 0.012, 0, 0, 0, C.black, { pz: { rect: this.r() < 0.5 ? SUV.screen : SUV.screen2 } }), -0.25);
    }
  }
  speakers(x0: number, x1: number, y: number, zf: number, gap: number) {
    let x = x0;
    while (x1 - x > 0.25) {
      const w = Math.min(this.rnd(0.22, 0.34), x1 - x), h = Math.min(gap - 0.04, w * 1.3), d = 0.22;
      this.b.box(w * 0.92, h, d, x + w / 2, y, zf - d / 2, this.r() < 0.6 ? C.black : 0x7a4a26);
      this.b.cyl('z', w * 0.28, w * 0.28, 0.02, x + w / 2, y + h * 0.4, zf + 0.005, 0x3a3d44, 8, { pos: true, neg: false });
      x += w;
    }
  }
  pots(x0: number, x1: number, y: number, zf: number, gap: number, keys: readonly ShopKey[], r = 0.12, h = 0.2) {
    let x = x0 + r;
    while (x < x1 - r) {
      const k = this.pick(keys), hh = Math.min(h, gap - 0.04), two = gap > hh * 2 + 0.04 && this.r() < 0.4;
      for (let s = 0; s < (two ? 2 : 1); s++) this.b.cyl('y', r, r, hh, x, y + hh / 2 + s * hh, zf - r, SCOL[k] ?? C.white, 8, { pos: true, neg: false, capPaint: C.chrome, side: SUV[k] });
      x += r * 2.2;
    }
  }
  homeware(x0: number, x1: number, y: number, zf: number, gap: number) {
    let x = x0;
    while (x1 - x > 0.25) {
      const kind = Math.floor(this.r() * 4), w = 0.3;
      if (kind === 0) for (let s = 0; s < 6; s++) this.b.cyl('y', 0.12, 0.13, 0.025, x + 0.15, y + 0.0125 + s * 0.027, zf - 0.14, s % 2 ? C.white : 0xe8e2d4, 8, { pos: true, neg: false });   // plates
      else if (kind === 1) { this.b.cyl('y', 0.12, 0.12, 0.16, x + 0.15, y + 0.08, zf - 0.14, C.chrome, 8, { pos: true, neg: false }); this.b.cyl('y', 0.02, 0.02, 0.03, x + 0.15, y + 0.175, zf - 0.14, C.black, 5); }   // pot
      else if (kind === 2) this.b.cyl('y', 0.06, 0.06, Math.min(0.32, gap - 0.04), x + 0.15, y + Math.min(0.32, gap - 0.04) / 2, zf - 0.08, this.pick([C.red, C.blue, 0x1a9d54, C.yellow]), 6, { pos: true, neg: false, capPaint: C.black });   // thermos
      else { this.b.cyl('y', 0.13, 0.08, 0.1, x + 0.15, y + 0.05, zf - 0.14, this.pick([0xe8742c, 0x2a8fd1, 0xd9322b]), 8, { pos: true, neg: false }); }   // basin
      x += w;
    }
  }
  baskets(x0: number, x1: number, y: number, zf: number, gap: number) {
    let x = x0;
    while (x1 - x > 0.25) {
      const r = Math.min(this.rnd(0.1, 0.18), (x1 - x) / 2), h = Math.min(gap - 0.04, r * 1.4);
      this.b.cyl('y', r * 0.75, r, h, x + r, y + h / 2, zf - r, 0xd9b77a, 8, { pos: false, neg: true, side: SUV.basket });
      x += r * 2 + 0.03;
    }
  }
  leather(x0: number, x1: number, y: number, zf: number, gap: number) {
    let x = x0;
    while (x1 - x > 0.25) {
      if (this.r() < 0.5) {                                                                // a bag with its handle
        const w = 0.3, h = Math.min(gap - 0.12, 0.24);
        this.b.box(w, h, 0.1, x + w / 2, y, zf - 0.06, SCOL.leather!, { pz: { rect: SUV.leather } });
        this.b.beam([x + 0.07, y + h, zf - 0.06], [x + w / 2, y + h + 0.08, zf - 0.06], 0.02, 0.02, 0x5a3418);
        this.b.beam([x + w / 2, y + h + 0.08, zf - 0.06], [x + w - 0.07, y + h, zf - 0.06], 0.02, 0.02, 0x5a3418);
        x += w + 0.05;
      } else {                                                                             // a pair of sandals
        const col = this.pick([0x7a4a26, 0x5a3418, 0xc9a043]);
        for (const dx of [0.05, 0.15]) this.b.box(0.08, 0.025, 0.24, x + dx, y, zf - 0.13, col);
        x += 0.24;
      }
    }
  }
  /** A model pirogue (two cones nose to nose, painted stripes), along x. */
  pirogue(x: number, y: number, z: number, len: number, rotY = 0) {
    this.b.at(x, y, z, rotY, () => {
      for (const dx of [-len * 0.22, len * 0.22]) this.b.box(0.04, 0.05, Math.max(0.1, len * 0.18), dx, 0, 0, C.woodDark);   // its stand
      this.b.with(new THREE.Matrix4().makeTranslation(0, 0.03, 0).multiply(new THREE.Matrix4().makeScale(1, 0.85, 0.6)), () => {
        const r = len * 0.19;
        this.b.cyl('x', 0.001, r, len / 2, -len / 4, r, 0, 0xffffff, 6, { pos: false, neg: false, side: SUV.pirogue });
        this.b.cyl('x', r, 0.001, len / 2, len / 4, r, 0, 0xffffff, 6, { pos: false, neg: false, side: SUV.pirogue });
      });
    });
  }
  /** Carved wood: bowls, small drums, a mortar and its pestle. */
  woodcraft(x0: number, x1: number, y: number, zf: number, gap: number) {
    let x = x0;
    while (x1 - x > 0.25) {
      const k = Math.floor(this.r() * 3);
      if (k === 0) { const r = this.rnd(0.1, 0.14); this.b.cyl('y', r * 0.6, r, 0.09, x + r, y + 0.045, zf - r, this.pick([0x8a5a32, 0x6b3a1e, 0xa8723f]), 8, { pos: true, neg: true, capPaint: 0x4a2c18 }); x += r * 2 + 0.04; }
      else if (k === 1) { const h = Math.min(gap - 0.04, 0.3); this.b.cyl('y', 0.07, 0.1, h, x + 0.1, y + h / 2, zf - 0.11, 0x6b3a1e, 8, { pos: true, neg: false, capPaint: 0xd9c4a0 }); x += 0.24; }
      else { this.b.cyl('y', 0.09, 0.11, 0.17, x + 0.11, y + 0.085, zf - 0.12, 0x8a5a32, 8, { pos: true, neg: false, capPaint: 0x3a2418 }); this.b.beam([x + 0.08, y + 0.1, zf - 0.12], [x + 0.16, y + Math.min(gap - 0.05, 0.38), zf - 0.12], 0.035, 0.035, 0xa8723f); x += 0.26; }
    }
  }
  wigs(x0: number, x1: number, y: number, zf: number) {
    for (let x = x0 + 0.15; x < x1 - 0.12; x += 0.34) {
      this.b.cyl('y', 0.025, 0.025, 0.12, x, y + 0.06, zf - 0.12, C.chrome, 5);
      this.b.blob(0.09, x, y + 0.2, zf - 0.12, 0x8a5a3a, [0.9, 1.15, 0.95]);
      this.b.blob(0.11, x, y + 0.25, zf - 0.14, this.pick([0x1a1414, 0x3a2418, 0x6b3a1e]), [1.05, 0.9, 1.05]);
    }
  }

  /** A kit vehicle at (x, z) facing rotY (its nose toward local +z of that turn), standing at height y. */
  vehicle(kind: VehicleKind, seed: number, x: number, z: number, rotY: number, y = 0, solid = true): boolean {
    const sp = buildVehicle(kind, { seed, lod: 'near', driver: false, passengers: false }).spec;
    const f = this.foot(x, z, sp.width + 0.1, sp.length + 0.1, rotY);
    if (!this.ok(f)) return false;
    this.veh.push({ kind, seed, x, y, z, rotY });
    if (solid) this.solid(f, Math.min(2.4, sp.height + y));
    return true;
  }

  // ---------------------------------------------------------------- furniture of the trade
  counter(x0: number, x1: number, z: number, d: number, h: number, body: number, top: number, panel: ShopKey, vitrine = false) {
    const b = this.b, len = x1 - x0, cx = (x0 + x1) / 2;
    b.box(len, h - 0.04, d, cx, 0, z, body);
    b.box(len + 0.02, 0.08, d + 0.02, cx, 0, z, 0x2b2b2b);
    b.slab(len + 0.08, 0.04, d + 0.1, cx, h - 0.04, z, top);
    const n = Math.max(1, Math.floor(len / 1.9)), pw = Math.min(1.6, len / n - 0.2), ph = pw / 4;
    for (let i = 0; i < n; i++) b.decal([x0 + (i + 0.5) * (len / n), h * 0.56, z + d / 2 + 0.006], [1, 0, 0], [0, 1, 0], pw, ph, SUV[panel]);
    if (vitrine) {
      const vz = z + d * 0.22, vd = d * 0.48, vl = len - 0.16;
      this.g.box(vl, 0.28, vd, cx, h, vz, C.glass);
      for (const sx of [-1, 1]) b.box(0.03, 0.28, vd, cx + sx * vl / 2, h, vz, C.chrome);
      for (let x = x0 + 0.2; x < x1 - 0.16; x += 0.17) b.box(0.08, 0.012, 0.15, x, h, vz, C.black, { py: { rect: this.r() < 0.5 ? SUV.screen : SUV.screen2 } });
    }
    this.solid(rect(x0 - 0.05, x1 + 0.05, z - d / 2 - 0.06, z + d / 2 + 0.06), h);
  }
  till(x: number, z: number, h: number) {
    this.b.box(0.36, 0.11, 0.32, x, h, z, C.dark);
    this.b.box(0.26, 0.17, 0.03, x, h + 0.11, z + 0.08, C.dark, { pz: { rect: SUV.tag } });   // the customer's display: the price
  }
  fridge(x: number, z: number, rotY: number, w = 0.72, h = 1.95, d = 0.68): boolean {
    const f = this.foot(x, z, w, d, rotY);
    if (!this.ok(f)) return false;
    this.solid(f, h);
    this.b.at(x, 0, z, rotY, () => {
      this.b.box(w, h, d, 0, 0, 0, C.white, { pz: { rect: SUV.fridge } });
      this.b.box(w, 0.2, d + 0.02, 0, h - 0.2, 0, C.red);
    });
    this.browse.push({ x: x + Math.sin(rotY) * (d / 2 + 0.7), z: z + Math.cos(rotY) * (d / 2 + 0.7), yaw: rotY + PI });
    return true;
  }
  table(x: number, z: number, w: number, d: number, h: number, top: number, legs = C.woodDark, rotY = 0): boolean {
    const f = this.foot(x, z, w, d, rotY);
    if (!this.ok(f)) return false;
    this.solid(f, h);
    this.b.at(x, 0, z, rotY, () => {
      this.b.slab(w, 0.05, d, 0, h - 0.05, 0, top);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.b.box(0.05, h - 0.05, 0.05, sx * (w / 2 - 0.06), 0, sz * (d / 2 - 0.06), legs);
    });
    return true;
  }
  chair(x: number, z: number, rotY: number, col: number, top = 0.46, kind: SeatKind = 'chair', solid = true, seat = true) {
    this.b.at(x, 0, z, rotY, () => {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.b.box(0.035, top - 0.03, 0.035, sx * 0.19, 0, sz * 0.18, col);
      this.b.slab(0.44, 0.04, 0.42, 0, top - 0.04, 0, col);
      this.b.box(0.44, 0.4, 0.04, 0, top, -0.2, col);
    });
    if (solid) this.solid(this.foot(x, z, 0.46, 0.46, rotY), 0.5);
    if (seat) this.seat(x, z, rotY, top, kind);
  }
  /** A bench of n seats along x at (x, z), sitters facing rotY (0 or π). */
  bench(x: number, z: number, rotY: number, n: number, col: number): boolean {
    const len = n * 0.6, f = this.foot(x, z, len, 0.45);
    if (!this.ok(f)) return false;
    this.b.slab(len, 0.05, 0.42, x, 0.41, z, col);
    for (const sx of [-1, 1]) this.b.box(0.06, 0.41, 0.36, x + sx * (len / 2 - 0.1), 0, z, C.steel);
    this.b.box(len, 0.36, 0.04, x, 0.48, z - Math.cos(rotY) * 0.2, col);
    for (let i = 0; i < n; i++) this.seat(x - len / 2 + 0.3 + i * 0.6, z, rotY, 0.46, 'bench');
    this.solid(f, 0.5);
    return true;
  }
  stool(x: number, z: number, yaw: number, top = 0.68, col = C.red) {
    this.b.cyl('y', 0.17, 0.17, 0.05, x, top - 0.025, z, col, 8);
    for (let k = 0; k < 3; k++) { const a = k * 2.094; this.b.beam([x + Math.sin(a) * 0.11, top - 0.05, z + Math.cos(a) * 0.11], [x + Math.sin(a) * 0.19, 0, z + Math.cos(a) * 0.19], 0.03, 0.03, C.chrome); }
    this.b.cyl('y', 0.15, 0.15, 0.02, x, 0.28, z, C.chrome, 8, { pos: false, neg: false });
    this.solid(this.foot(x, z, 0.36, 0.36), 0.7);
    this.seat(x, z, yaw, top, 'stool');
  }
  plant(x: number, z: number, s = 1): boolean {
    const f = this.foot(x, z, 0.5 * s, 0.5 * s);
    if (!this.ok(f)) return false;
    this.b.cyl('y', 0.16 * s, 0.22 * s, 0.42 * s, x, 0.21 * s, z, C.terracotta, 8, { pos: true, neg: false, capPaint: 0x4a3222 });
    for (let k = 0; k < 4; k++) { const a = k * 1.7 + this.r(); this.b.blob(0.22 * s, x + Math.sin(a) * 0.12 * s, (0.62 + k * 0.22) * s, z + Math.cos(a) * 0.12 * s, k % 2 ? C.leaf : C.leaf2, [1, 1.3, 1]); }
    this.solid(f, 1.2 * s);
    return true;
  }
  sacks(x: number, z: number, rotY: number, layers: number, key: ShopKey): boolean {
    const f = this.foot(x, z, 1.0, 0.8, rotY);
    if (!this.ok(f)) return false;
    this.b.at(x, 0, z, rotY, () => {
      for (let l = 0; l < layers; l++) for (let i = 0; i < (l % 2 ? 1 : 2); i++) {
        const dx = (l % 2 ? 0 : (i - 0.5) * 0.5) + (this.r() - 0.5) * 0.06;
        this.b.at(dx, l * 0.17, 0, (l % 2 ? PI / 2 : 0) + (this.r() - 0.5) * 0.15, () => this.b.box(0.46, 0.17, 0.74, 0, 0, 0, SCOL[key] ?? C.cream, { py: { rect: SUV[key] } }));
      }
    });
    this.solid(f, layers * 0.17);
    return true;
  }
  crate(x: number, z: number, y: number, fruit: number, rotY = 0) {
    this.b.at(x, y, z, rotY, () => {
      this.b.box(0.5, 0.22, 0.36, 0, 0, 0, 0xb48c5c);
      for (let k = 0; k < (this.det ? 8 : 4); k++) this.b.blob(0.055, -0.17 + (k % 4) * 0.11, 0.24, k < 4 ? -0.07 : 0.07, fruit);
    });
  }
  rack(x: number, z: number, rotY: number, len: number): boolean {
    const f = this.foot(x, z, len, 0.55, rotY);
    if (!this.ok(f)) return false;
    this.solid(f, 1.6);
    this.b.at(x, 0, z, rotY, () => {
      const b = this.b, h = 1.62;
      for (const sx of [-1, 1]) { b.box(0.04, h, 0.04, sx * len / 2, 0, 0, C.chrome); b.box(0.06, 0.03, 0.5, sx * len / 2, 0, 0, C.chrome); }
      b.beam([-len / 2, h, 0], [len / 2, h, 0], 0.025, 0.025, C.chrome);
      const n = Math.floor((len - 0.15) / (this.det === 2 ? 0.07 : this.det === 1 ? 0.1 : 0.16));
      for (let i = 0; i < n; i++) {
        const gx = -len / 2 + 0.1 + i * ((len - 0.2) / Math.max(1, n - 1)), k = this.pick(['wax0', 'wax1', 'wax2', 'wax3', 'wax4', 'wax5', 'bazin'] as const), gh = this.rnd(0.7, 1.05);
        b.box(0.035, gh, 0.44, gx, h - 0.05 - gh, 0, SCOL[k] ?? C.cream, { px: { rect: SUV[k] }, nx: { rect: SUV[k] } });
        b.box(0.012, 0.05, 0.3, gx, h - 0.05, 0, C.dark);                                   // hanger
      }
    });
    this.browse.push({ x: x + Math.sin(rotY) * 0.95, z: z + Math.cos(rotY) * 0.95, yaw: rotY + PI });
    return true;
  }
  mannequin(x: number, z: number, rotY: number, key: ShopKey): boolean {
    const f = this.foot(x, z, 0.5, 0.5);
    if (!this.ok(f)) return false;
    this.solid(f, 1.7);
    this.b.at(x, 0, z, rotY, () => {
      this.b.cyl('y', 0.2, 0.2, 0.04, 0, 0.02, 0, C.dark, 8);
      this.b.cyl('y', 0.02, 0.02, 0.4, 0, 0.24, 0, C.chrome, 5);
      this.b.cyl('y', 0.3, 0.17, 1.0, 0, 0.92, 0, 0xffffff, 10, { pos: true, neg: true, capPaint: SCOL[key] ?? C.cream, side: SUV[key] });   // the dress
      this.b.blob(0.11, 0, 1.55, 0, 0xd9c4a0, [0.85, 1.1, 0.9]);
    });
    return true;
  }
  /** A full-height wall panel (a mirror, a pegboard, a poster) facing rotY at (x, z). */
  panel(x: number, y: number, z: number, rotY: number, w: number, h: number, key: ShopKey) {
    const c = Math.cos(rotY), s = Math.sin(rotY);
    this.b.decal([x + s * 0.012, y, z + c * 0.012], [c, 0, -s], [0, 1, 0], w, h, SUV[key]);
  }
  /** Ceiling tube along x (lit by the glow atlas). */
  tube(x: number, z: number, len = 1.2) {
    this.b.box(len, 0.03, 0.1, x, this.H - 0.03, z, C.white);
    this.b.decal([x, this.H - 0.033, z], [1, 0, 0], [0, 0, 1], len - 0.04, 0.07, SUV.light);
  }
  fan(x: number, z: number) {
    const y = this.H - 0.45;
    this.b.cyl('y', 0.02, 0.02, 0.42, x, this.H - 0.21, z, C.white, 5, { pos: false, neg: false });
    this.b.cyl('y', 0.09, 0.09, 0.08, x, y, z, C.white, 8);
    for (let k = 0; k < 3; k++) this.b.at(x, y, z, k * 2.094 + 0.3, () => this.b.box(0.1, 0.012, 0.55, 0, 0, 0.36, C.cream));
  }
  stanchions(pts: [number, number][], sides: [number, number][][]) {
    for (const [x, z] of pts) {
      this.b.cyl('y', 0.14, 0.14, 0.03, x, 0.015, z, C.steel, 8);
      this.b.cyl('y', 0.025, 0.025, 0.95, x, 0.5, z, C.chrome, 6, { pos: false, neg: false });
      this.b.blob(0.04, x, 0.98, z, C.chrome);
    }
    for (const line of sides) for (let i = 1; i < line.length; i++) {
      const [ax, az] = line[i - 1], [bx, bz] = line[i];
      this.b.beam([ax, 0.86, az], [bx, 0.86, bz], 0.035, 0.035, 0x8a1a2a);
      this.solid(rect(Math.min(ax, bx) - 0.08, Math.max(ax, bx) + 0.08, Math.min(az, bz) - 0.08, Math.max(az, bz) + 0.08), 1.0);
    }
  }
}

// ------------------------------------------------------------------------------------------------------------ fills
const GROCERY_PK: readonly ShopKey[] = ['pk0', 'pk1', 'pk2', 'pk3', 'pk4', 'pk5', 'pk6'];
const TINS: readonly ShopKey[] = ['tin0', 'tin1', 'tin2', 'tin3'];
const PHARMA: readonly ShopKey[] = ['ph0', 'ph1', 'ph2', 'ph3'];

const groceryFill: Fill = (R, lvl, levels, x0, x1, y, zf, dp, gap, u) => {
  if (!R.full(lvl, levels)) return R.strip(x0, x1, y, zf, gap, lvl % 2 ? 'sBottles' : 'sGrocery');
  const kind = (lvl + u) % 4;
  if (lvl === 0) R.cartons(x0, x1, y, zf, dp, gap, ['sack0'], [0.3, 0.4], 0.28);           // 5 kg bags of rice on the bottom board
  else if (lvl === levels - 1) R.cartons(x0, x1, y, zf, dp, gap, GROCERY_PK, [0.2, 0.32], 0.34);
  else if (kind === 0) R.tins(x0, x1, y, zf, gap, TINS);
  else if (kind === 1) R.bottles(x0, x1, y, zf, gap, ['bt0', 'bt1', 'bt0', 'bt3']);
  else R.cartons(x0, x1, y, zf, dp, gap, GROCERY_PK);
};
const techFill: Fill = (R, lvl, levels, x0, x1, y, zf, dp, gap, u) => {
  if (!R.full(lvl, levels)) return R.strip(x0, x1, y, zf, gap, 'sTech');
  if (lvl === 0 || (lvl + u) % 3 === 0) R.speakers(x0, x1, y, zf, gap);
  else if (lvl % 2) R.phones(x0, x1, y, zf);
  else R.cartons(x0, x1, y, zf, dp, gap, ['pk7'], [0.1, 0.14], 0.2);
};
const clothFill: Fill = (R, lvl, levels, x0, x1, y, zf, dp, gap) => {
  if (!R.full(lvl, levels)) return R.strip(x0, x1, y, zf, gap, lvl === 0 ? 'sShoes' : 'sFabric');
  if (lvl === 0) R.stacks(x0, x1, y, zf, dp, gap, 'sShoes', 8, [0.3, 0.34], C.dark);
  else R.stacks(x0, x1, y, zf, dp, gap, 'sFabric', 8);
};
const homeFill: Fill = (R, lvl, levels, x0, x1, y, zf, dp, gap) => {
  if (!R.full(lvl, levels)) return R.strip(x0, x1, y, zf, gap, 'sHome');
  R.homeware(x0, x1, y, zf, gap);
  void dp;
};
const pharmaFill: Fill = (R, lvl, levels, x0, x1, y, zf, dp, gap, u) => {
  if (!R.full(lvl, levels)) return R.strip(x0, x1, y, zf, gap, 'sPharma');
  if ((lvl + u) % 3 === 2) R.bottles(x0, x1, y, zf, gap, ['bt1', 'bt3'], 0.03, 0.16);
  else R.cartons(x0, x1, y, zf, dp, gap, PHARMA, [0.09, 0.15], 0.15);
};
const hardwareFill: Fill = (R, lvl, levels, x0, x1, y, zf, dp, gap, u) => {
  if (!R.full(lvl, levels)) return R.strip(x0, x1, y, zf, gap, 'sHardware');
  if (lvl === 0 || (lvl + u) % 2 === 0) R.pots(x0, x1, y, zf, gap, ['paint0', 'paint1']);
  else R.cartons(x0, x1, y, zf, dp, gap, ['pk7', 'pk5'], [0.12, 0.2], 0.16);
};
const craftFill = (v: number): Fill => (R, lvl, levels, x0, x1, y, zf, _dp, gap, u) => {
  if (!R.full(lvl, levels)) return R.strip(x0, x1, y, zf, gap, 'sCraft');
  const alt = (lvl + u) % 2 === 1;
  if (v === 0) R.baskets(x0, x1, y, zf, gap);
  else if (v === 1) { if (alt) R.woodcraft(x0, x1, y, zf, gap); else R.leather(x0, x1, y, zf, gap); }
  else if (alt) R.woodcraft(x0, x1, y, zf, gap);
  else for (let x = x0 + 0.33; x < x1 - 0.3; x += 0.66) R.pirogue(x, y, zf - 0.14, 0.6);
};
const beautyFill: Fill = (R, lvl, levels, x0, x1, y, zf, dp, gap) => {
  if (!R.full(lvl, levels)) return R.strip(x0, x1, y, zf, gap, 'sBeauty');
  if (lvl === levels - 1) R.wigs(x0, x1, y, zf);
  else if (lvl === 0) R.stacks(x0, x1, y, zf, dp, gap, 'sFabric', 8, [0.3, 0.36], C.white);
  else R.bottles(x0, x1, y, zf, gap, ['bt2', 'bt3', 'bt1'], 0.03, 0.18);
};
const filesFill: Fill = (R, lvl, levels, x0, x1, y, zf, dp, gap) => {
  if (!R.full(lvl, levels)) return R.strip(x0, x1, y, zf, gap, 'sFiles');
  R.stacks(x0, x1, y, zf, dp, gap, 'sFiles', 14, [0.3, 0.45], C.dark);
};

// ------------------------------------------------------------------------------------------------------------ plans
interface Plan {
  counter: ShopSpot; till: ShopSpot & { y: number }; keeper: ShopSpot; queue: ShopSpot[]; door: ShopSpot; lots?: ShopLot[];
}
interface Zones {
  /** Behind the keeper's corridor, left of the counter's end. */
  behind: ShopRect;
  /** Back of the shop right of `behind` (a gondola, a rack, a living-room set). */
  middle: ShopRect;
  /** Along the right wall, past the aisle. */
  right: ShopRect;
  /** The open floor right of the counter (an island display). */
  island: ShopRect;
  cz: number; x0: number; x1: number; ch: number; cd: number;
}
interface Style {
  counter: 'left' | 'centre' | 'desk';
  body: number; top: number; panel: ShopKey; vitrine?: boolean;
  unit: UnitStyle; back: Fill; side: Fill;
  /** Wall behind the counter: a pegboard instead of shelves (phone accessories, tools). */
  peg?: ShopKey;
  sides?: 'behind' | 'both';
  /** The way behind the counter starts right at its end (a workshop: the bay takes the rest of the floor). */
  aisleNext?: boolean;
  onCounter(R: Room, x0: number, x1: number, z: number, h: number, v: number): void;
  floor(R: Room, Z: Zones, v: number): void;
  posters?: ShopKey[];
}

const U = (dp: number, h: number, levels: number, frame: number, board: number, back: number): UnitStyle => ({ dp, h, levels, frame, board, back });

const garageFill: Fill = (R, lvl, levels, x0, x1, y, zf, dp, gap, u) => {
  if (!R.full(lvl, levels)) return R.strip(x0, x1, y, zf, gap, 'sParts');
  if (lvl === 0) {                                                                       // tyres standing on the bottom board
    const r = Math.min(0.27, gap / 2 - 0.02);
    for (let x = x0 + r; x < x1 - r; x += r * 2 + 0.03) R.b.cyl('z', r, r, 0.18, x, y + r, zf - 0.12, 0xffffff, 10, { pos: true, neg: false, capPaint: 0x2b2b2e, side: SUV.tyre });
  } else if ((lvl + u) % 2) R.bottles(x0, x1, y, zf, gap, ['oil0', 'oil1', 'oil0'], 0.06, 0.24);
  else R.stacks(x0, x1, y, zf, dp, gap, 'sParts', 10, [0.22, 0.32], 0xb08d5e);
};

const STYLES: Record<Exclude<ShopType, 'cafe' | 'bank' | 'restaurant' | 'showroom_cars'>, Style> = {
  garage: {
    counter: 'left', aisleNext: true, body: 0x5b6168, top: 0x6b4a2e, panel: 'pnlGarage', peg: 'pegTools',
    unit: U(0.5, 2.4, 4, C.steel, 0x7d858d, 0xd8d2c2), back: garageFill, side: garageFill,
    onCounter(R, x0, x1, z, h) {
      R.b.box(0.2, 0.12, 0.16, x0 + 0.3, h, z - 0.12, C.steel); R.b.box(0.32, 0.06, 0.1, x0 + 0.3, h + 0.12, z - 0.12, 0x3a4048);   // the vice
      R.b.box(0.55, 0.24, 0.28, x0 + 1.05, h, z - 0.12, C.red); R.b.box(0.55, 0.03, 0.28, x0 + 1.05, h + 0.24, z - 0.12, 0x8a1a1a);   // toolbox
      R.b.cyl('y', 0.2, 0.2, 0.09, (x0 + x1) / 2 + 0.35, h + 0.045, z + 0.05, 0x9aa0a6, 10, { pos: true, neg: false, capPaint: 0x5b6168 });   // a wheel rim
      R.bottles(x1 - 1.4, x1 - 0.9, h, z + 0.15, 0.4, ['oil0'], 0.06, 0.24);
      for (let k = 0; k < 3; k++) R.b.beam([x0 + 1.6 + k * 0.12, h + 0.01, z + 0.15], [x0 + 1.72 + k * 0.12, h + 0.01, z - 0.12], 0.025, 0.012, C.chrome);   // spanners
    },
    floor(R, Z) {
      // the bay: a two-post lift with a customer's car up, motorbikes for sale nose to the street
      const bay = Z.middle, bw = bay.x1 - bay.x0, bd = bay.z1 - bay.z0;
      if (bw > 2.6 && bd > 4.8) {
        const car = buildVehicle('sedan', { seed: 3141, lod: 'near', driver: false, passengers: false }).spec;
        const hw = car.width / 2 + 0.32, cx = bay.x1 - hw - 0.25, cz = bay.z0 + 2.45;
        if (R.ok(R.foot(cx, cz, car.width + 0.9, car.length + 0.2))) {
          for (const sx of [-1, 1]) {
            R.b.box(0.28, 2.7, 0.3, cx + sx * hw, 0, cz, 0x2f6fb3); R.b.box(0.5, 0.06, 0.5, cx + sx * hw, 0, cz, 0x2b2f36);
            for (const dz of [-0.9, 0.9]) R.b.beam([cx + sx * hw, 0.95, cz], [cx + sx * (car.width / 2 - 0.35), 0.98, cz + dz], 0.08, 0.06, 0xf2c230);
            R.solid(R.foot(cx + sx * hw, cz, 0.4, 0.4), 2.7);
          }
          R.vehicle('sedan', 3141, cx, cz, 0, 1.0, false);
          R.solid(R.foot(cx, cz, car.width, car.length), 0.9);                               // nobody walks under it
          R.browse.push({ x: cx - hw - 0.7, z: cz, yaw: PI / 2 });
          if (R.det) {                                                                    // a jack and a drain tray under the car
            R.b.box(0.5, 0.02, 0.4, cx, 0.01, cz + 0.3, 0x3a3d44);
            R.b.box(0.3, 0.25, 0.6, cx - 0.4, 0, cz - 1.4, C.red);
          }
        }
        const mz = bay.z1 - 1.75, mx = bay.x0 + 0.45;
        let shown = 0;
        for (let k = 0; k < 2; k++) if (mx + k * 1.05 + 0.4 < cx - hw - 0.3 && R.vehicle('moto', 7000 + k * 13, mx + k * 1.05, mz, 0)) {
          shown++;
          R.b.box(0.04, 0.6, 0.04, mx + k * 1.05 + 0.38, 0, mz + 0.85, C.chrome);
          R.b.box(0.3, 0.2, 0.03, mx + k * 1.05 + 0.38, 0.6, mz + 0.85, C.white, { pz: { rect: SUV.tag } });   // its price card
        }
        if (shown) R.browse.push({ x: mx + (shown - 1) * 0.52, z: bay.z1 - 0.2, yaw: PI });
      }
      // tyres and oil drums behind the bench
      const t = Z.behind;
      for (let k = 0; k < 2; k++) {
        const x = t.x0 + 0.4 + k * 0.7, z = t.z0 + 0.4;
        if (!R.ok(R.foot(x, z, 0.62, 0.62))) continue;
        for (let n = 0; n < (R.det ? 5 : 3); n++) R.b.cyl('y', 0.3, 0.3, 0.19, x, 0.095 + n * 0.19, z, 0xffffff, 12, { pos: true, neg: false, capPaint: 0x2b2b2e, side: SUV.tyre });
        R.solid(R.foot(x, z, 0.62, 0.62), 1);
      }
      const dx = t.x1 - 0.35, dz = t.z0 + 0.35;
      if (R.ok(R.foot(dx, dz, 0.6, 0.6))) { R.b.cyl('y', 0.29, 0.29, 0.88, dx, 0.44, dz, 0x2f6fb3, 12, { pos: true, neg: false, capPaint: 0x2b2f36 }); R.b.cyl('y', 0.3, 0.3, 0.04, dx, 0.6, dz, 0x1f4a7a, 12, { pos: false, neg: false }); R.solid(R.foot(dx, dz, 0.6, 0.6), 0.9); }
    },
  },
  grocery: {
    counter: 'left', body: 0x2a6f6d, top: 0x9a6a3e, panel: 'pnlGrocery',
    unit: U(0.45, 2.5, 5, C.frame, C.board, C.back), back: groceryFill, side: groceryFill,
    onCounter(R, x0, x1, z, h) {
      for (let k = 0; k < (R.det ? 4 : 2); k++) {                                          // jars of sweets
        const x = x0 + 0.35 + k * 0.3;
        R.g.cyl('y', 0.1, 0.1, 0.26, x, h + 0.13, z + 0.12, C.glass, 8, { pos: true, neg: false });
        for (let s = 0; s < 3; s++) R.b.blob(0.05, x + (s - 1) * 0.04, h + 0.06 + (s % 2) * 0.05, z + 0.12, [C.red, C.yellow, 0x1a9d54, 0xc2417f][(k + s) % 4]);
        R.b.cyl('y', 0.105, 0.105, 0.03, x, h + 0.275, z + 0.12, C.red, 8);
      }
      const bx = (x0 + x1) / 2 + 0.3;                                                      // bread basket
      R.b.box(0.7, 0.14, 0.4, bx, h, z, 0xc49a58);
      for (let k = 0; k < 5; k++) R.b.cyl('x', 0.035, 0.035, 0.66, bx, h + 0.17, z - 0.14 + k * 0.07, 0xd9a050, 6);
      R.b.box(0.34, 0.06, 0.3, x1 - 1.05, h, z, C.chrome); R.b.cyl('y', 0.14, 0.14, 0.02, x1 - 1.05, h + 0.1, z, C.chrome, 10); R.b.box(0.06, 0.06, 0.06, x1 - 1.05, h + 0.04, z, C.dark);   // scale
      R.b.box(0.5, 0.22, 0.02, x0 + 0.5, h, z - 0.25, C.white, { pz: { rect: SUV.transfer } });
    },
    floor(R, Z) {
      const sx = Z.behind.x0 + 0.6;
      R.sacks(sx, Z.behind.z0 + 0.5, PI / 2, R.det ? 4 : 2, 'sack0');
      if (Z.middle.x1 - Z.middle.x0 > 1.6) R.gondola((Z.middle.x0 + Z.middle.x1) / 2, (Z.middle.z0 + Z.middle.z1) / 2, Math.min(4.2, Z.middle.x1 - Z.middle.x0), U(0.4, 1.45, 3, C.frame, C.board, C.back), groceryFill);
      R.fridge(Z.right.x1 - 0.36, Z.right.z0 + 0.45, -PI / 2);
      if (Z.right.z1 - Z.right.z0 > 3) R.fridge(Z.right.x1 - 0.36, Z.right.z0 + 1.25, -PI / 2);
      R.sacks(Z.right.x1 - 0.42, Z.right.z1 - 0.6, PI / 2, R.det ? 3 : 2, 'sack0');
      if (R.det && Z.island.x1 - Z.island.x0 > 1.2) {
        const ix = (Z.island.x0 + Z.island.x1) / 2, iz = Z.island.z0 + 0.6;
        if (R.table(ix, iz, 1.1, 0.7, 0.6, 0x9a6a3e)) {
          for (let k = 0; k < 3; k++) R.crate(ix - 0.27 + (k % 2) * 0.54, iz - 0.12 + Math.floor(k / 2) * 0.28, 0.6, [0xe8822c, 0x7fb03a, 0xd9322b][k]);
          R.browse.push({ x: ix, z: iz + 0.95, yaw: PI });
        }
      }
    },
  },
  phone: {
    counter: 'left', body: 0x1d2a44, top: 0xe6e6e6, panel: 'pnlPhone', vitrine: true, peg: 'pegPhone',
    unit: U(0.4, 2.3, 4, 0xe6e6e6, C.white, 0xdfe6ea), back: techFill, side: techFill,
    onCounter(R, x0, x1, z, h) {
      const mx = x0 + 0.6;                                                                  // repair mat: an open phone, tools, a lamp
      R.b.box(0.5, 0.01, 0.34, mx, h, z - 0.18, 0x1a7a5a);
      R.b.box(0.08, 0.012, 0.15, mx - 0.08, h + 0.01, z - 0.18, C.black); R.b.box(0.08, 0.012, 0.15, mx + 0.06, h + 0.01, z - 0.18, 0x3a6a8a);
      R.b.beam([mx + 0.17, h + 0.015, z - 0.25], [mx + 0.2, h + 0.015, z - 0.05], 0.012, 0.012, C.yellow);
      R.b.cyl('y', 0.06, 0.06, 0.02, x0 + 0.2, h + 0.01, z - 0.22, C.dark, 6); R.b.beam([x0 + 0.2, h, z - 0.22], [x0 + 0.28, h + 0.38, z - 0.18], 0.02, 0.02, C.dark);
      R.b.cyl('y', 0.07, 0.03, 0.08, x0 + 0.3, h + 0.36, z - 0.16, C.dark, 6, { pos: false, neg: true, capPaint: 0xfff4dc });
      void x1;
    },
    floor(R, Z) {
      if (R.table(Z.behind.x0 + 0.8, Z.behind.z0 + 0.4, 1.4, 0.6, 0.85, 0xdcdcdc, C.steel)) {          // the repair bench
        const bx = Z.behind.x0 + 0.8, bz = Z.behind.z0 + 0.4;
        R.b.box(0.4, 0.25, 0.3, bx - 0.35, 0.85, bz - 0.08, C.dark, { pz: { rect: SUV.screen2 } });
        R.b.box(0.3, 0.08, 0.2, bx + 0.3, 0.85, bz, C.yellow);
        R.staff.push({ x: bx, z: bz + 0.75, yaw: PI });
      }
      if (Z.middle.x1 - Z.middle.x0 > 1.6) R.gondola((Z.middle.x0 + Z.middle.x1) / 2, (Z.middle.z0 + Z.middle.z1) / 2, Math.min(3.6, Z.middle.x1 - Z.middle.x0), U(0.36, 1.2, 2, 0xe6e6e6, C.white, 0xdfe6ea), techFill);
      // TV wall on the right: screens above a low cabinet of speakers
      const rl = Math.min(3.2, Z.right.z1 - Z.right.z0 - 0.4);
      if (rl > 1.2) {
        const rz = Z.right.z0 + rl / 2 + 0.1;
        if (R.unit(Z.right.x1 - 0.2, rz, -PI / 2, rl, U(0.4, 0.8, 1, 0xe6e6e6, C.white, 0xdfe6ea), techFill)) {
          for (let k = 0; k < (R.det ? 3 : 2); k++) {
            const tz = rz - rl / 2 + (k + 0.5) * (rl / (R.det ? 3 : 2));
            R.b.at(Z.right.x1 - 0.06, 1.35, tz, -PI / 2, () => R.b.box(0.9, 0.52, 0.05, 0, 0, 0, C.black, { pz: { rect: SUV.tv } }));
          }
          R.browse.push({ x: Z.right.x1 - 1.2, z: rz, yaw: PI / 2 });
        }
      }
      if (Z.island.x1 - Z.island.x0 > 1.2) {                                               // glass cube of phones
        const ix = (Z.island.x0 + Z.island.x1) / 2, iz = Z.island.z0 + 0.6;
        const f = R.foot(ix, iz, 0.9, 0.6);
        if (R.ok(f)) {
          R.b.box(0.9, 0.85, 0.6, ix, 0, iz, C.white);
          R.g.box(0.86, 0.4, 0.56, ix, 0.85, iz, C.glass);
          R.phones(ix - 0.42, ix + 0.42, 0.85, iz + 0.15, 0.2);
          R.solid(f, 1.25); R.browse.push({ x: ix, z: iz + 0.95, yaw: PI });
        }
      }
      R.chair(Z.right.x0 + 0.35, Z.right.z1 - 0.5, -PI / 2, C.plastic[0]);
    },
    posters: ['poster2'],
  },
  clothing: {
    counter: 'left', body: 0x8b5a32, top: 0xd9c4a0, panel: 'pnlCloth',
    unit: U(0.42, 2.5, 5, C.woodDark, C.board, C.cream), back: clothFill, side: clothFill,
    onCounter(R, x0, x1, z, h) {
      const fx = (x0 + x1) / 2;
      R.b.cyl('x', 0.07, 0.07, 1.4, fx, h + 0.07, z - 0.05, 0xffffff, 8, { pos: true, neg: true, capPaint: SCOL.wax1, side: SUV.wax1 });   // a roll of cloth
      R.b.box(1.0, 0.004, 0.55, fx + 0.9, h, z + 0.02, SCOL.wax4!, { py: { rect: SUV.wax4 } });                                         // a length cut on the table
      R.b.beam([fx + 0.55, h + 0.01, z - 0.2], [fx + 0.75, h + 0.01, z - 0.1], 0.03, 0.01, C.dark);                                      // scissors
      R.b.beam([fx - 0.9, h + 0.005, z + 0.25], [fx + 0.4, h + 0.005, z + 0.25], 0.02, 0.003, C.yellow);                                // tape
    },
    floor(R, Z, v) {
      const bx = Z.behind.x0 + 0.7, bz = Z.behind.z0 + 0.45;                               // the tailor's machine
      if (R.table(bx, bz, 1.1, 0.55, 0.76, 0x8b6a47)) {
        R.b.box(0.42, 0.14, 0.18, bx, 0.76, bz, C.black); R.b.box(0.08, 0.2, 0.16, bx - 0.17, 0.9, bz, C.black); R.b.box(0.4, 0.07, 0.14, bx, 1.1, bz, C.black);
        R.b.cyl('x', 0.05, 0.05, 0.03, bx + 0.22, 1.0, bz, C.chrome, 8);
        R.chair(bx, bz + 0.6, PI, C.woodDark, 0.46, 'chair', false, false);
        R.staff.push({ x: bx, z: bz + 0.6, yaw: PI });
      }
      if (Z.behind.x1 - Z.behind.x0 > 2.4) R.mannequin(Z.behind.x1 - 0.4, Z.behind.z0 + 0.5, 0.4, 'wax5');
      if (Z.middle.x1 - Z.middle.x0 > 1.4) R.rack((Z.middle.x0 + Z.middle.x1) / 2, (Z.middle.z0 + Z.middle.z1) / 2, 0, Math.min(2.6, Z.middle.x1 - Z.middle.x0 - 0.2));
      const rl = Z.right.z1 - Z.right.z0;
      R.rack(Z.right.x1 - 0.35, Z.right.z0 + Math.min(1.4, rl / 3), -PI / 2, Math.min(2.2, rl / 2.2));
      if (rl > 4) R.rack(Z.right.x1 - 0.35, Z.right.z0 + rl * 0.62, -PI / 2, Math.min(1.8, rl / 3));
      R.panel(Z.right.x1 + 0.13, 1.1, Z.right.z1 - 0.7, -PI / 2, 0.6, 1.7, 'mirror');
      if (Z.island.x1 - Z.island.x0 > 1.2) {
        const ix = (Z.island.x0 + Z.island.x1) / 2, iz = Z.island.z0 + 0.55;
        if (R.table(ix, iz, 1.1, 0.7, 0.75, 0xd9c4a0)) {
          for (let k = 0; k < 4; k++) R.b.box(0.32, 0.12 + (k % 2) * 0.06, 0.26, ix - 0.36 + (k % 2) * 0.42, 0.75, iz - 0.15 + Math.floor(k / 2) * 0.3, 0xffffff, { pz: { rect: shopSlot('sFabric', k + v, 8) }, py: { rect: SUV[(['wax0', 'wax1', 'wax2', 'wax3'] as const)[k]] } });
          R.browse.push({ x: ix, z: iz + 0.9, yaw: PI });
        }
        R.mannequin(Z.island.x1 - 0.3, Z.island.z1 - 0.3, 0.3, 'wax0');
      }
      R.mannequin(Z.right.x0 + 0.1, Z.right.z1 - 0.2, -0.5, 'bazin');
    },
    posters: ['poster3'],
  },
  furniture: {
    counter: 'desk', body: 0x9a472d, top: 0xe6dccb, panel: 'pnlHome',
    unit: U(0.45, 2.3, 4, C.woodDark, C.board, C.cream), back: homeFill, side: homeFill,
    onCounter(R, x0, x1, z, h) { R.b.box(0.5, 0.3, 0.02, (x0 + x1) / 2 - 0.4, h, z - 0.2, C.white, { pz: { rect: SUV.poster3 } }); },
    floor(R, Z) {
      // vignettes: a living room on a rug, a dining set, a TV corner — real pieces of the furniture kit
      const ox = Z.middle.x0, oz = Z.middle.z0, w = Z.island.x1 - ox;
      const put = (id: FurnitureId, x: number, z: number, rotY = 0, browse?: ShopSpot) => {
        const sp = buildFurniture(id).spec, f = R.foot(x, z, sp.footprint.w, sp.footprint.d, rotY);
        if (!(sp.walkable ? R.free(f) : R.ok(f))) return false;
        R.furn.push({ id, x, z, rotY });
        if (!sp.walkable) R.solid(f, sp.footprint.h);
        for (const s of sp.seats) if (!s.clip || s.clip === 'Sit') {
          const c = Math.cos(rotY), si = Math.sin(rotY);
          R.seat(x + s.x * c + s.z * si, z - s.x * si + s.z * c, s.yaw + rotY, s.top, s.kind);
        }
        if (browse) R.browse.push(browse);
        return true;
      };
      const lx = ox + Math.min(2.2, w / 2);
      put('rug:premium', lx, oz + 1.55);
      put('sofa:better', lx, oz + 0.55, 0, { x: lx, z: oz + 2.6, yaw: PI });
      put('lowTable:better', lx, oz + 1.75);
      put('lamp:better', lx - 1.55, oz + 0.35);
      put('armchair:better', lx + 1.75, oz + 1.6, -PI / 2);
      if (w > 4.4) { put('wardrobe:better', Z.right.x1 - 0.32, Z.right.z0 + 0.7, -PI / 2); put('tv:better', Z.right.x1 - 0.25, Z.right.z0 + 2.0, -PI / 2, { x: Z.right.x1 - 1.5, z: Z.right.z0 + 2.0, yaw: PI / 2 }); }
      const tx = Z.island.x1 - 1.4, tz = Z.island.z0 + 0.8;
      if (put('table:better', tx, tz, 0, { x: tx, z: tz + 1.0, yaw: PI })) { put('woodenChair:better', tx - 0.85, tz, PI / 2); put('woodenChair:better', tx + 0.85, tz, -PI / 2); }
      put('fan:better', Z.island.x0 + 0.3, Z.island.z0 + 0.3);
      put('plasticChair:basic', Z.behind.x0 + 0.4, Z.behind.z0 + 0.4);
    },
  },
  pharmacy: {
    counter: 'centre', body: C.white, top: 0xdfe6ea, panel: 'pnlPharma', vitrine: true, sides: 'both',
    unit: U(0.38, 2.4, 6, C.white, 0xf7f7f4, 0xe6efe9), back: pharmaFill, side: pharmaFill,
    onCounter(R, x0, x1, z, h) {
      R.b.box(0.3, 0.12, 0.2, x0 + 0.4, h, z - 0.2, 0xd9b77a); R.b.box(0.06, 0.18, 0.06, x1 - 0.9, h, z - 0.2, 0x2a8fd1);
      R.cartons(x0 + 0.8, x0 + 1.6, h, z - 0.05, 0.25, 0.3, PHARMA, [0.07, 0.11], 0.13);
    },
    floor(R, Z) {
      R.panel(0, Math.min(R.H - 0.5, 3.0), R.zb + 0.02, 0, 0.55, 0.55, 'cross');
      R.panel(0, R.H - 0.45, R.D / 2 - 0.3, PI, 0.5, 0.5, 'cross');
      const sx = Z.right.x0 + 0.1, sz = Z.right.z1 - 0.6;                                  // a scale to weigh oneself
      if (R.ok(R.foot(sx, sz, 0.4, 0.4))) { R.b.box(0.36, 0.06, 0.4, sx, 0, sz, C.white); R.b.box(0.06, 1.1, 0.06, sx, 0, sz - 0.17, C.chrome); R.b.cyl('z', 0.12, 0.12, 0.04, sx, 1.15, sz - 0.15, C.white, 10, { pos: SUV.clock, neg: true }); R.solid(R.foot(sx, sz, 0.4, 0.4), 1.2); }
      R.bench(Z.behind.x0 + 0.9, R.D / 2 - 1.0, PI, 3, C.blue);
      R.plant(Z.right.x1 - 0.3, R.D / 2 - 0.5, 0.9);
    },
    posters: ['poster1'],
  },
  hardware: {
    counter: 'left', body: 0x2b2f36, top: 0x8b6a47, panel: 'pnlHardware', peg: 'pegTools',
    unit: U(0.5, 2.5, 4, C.steel, 0x7d858d, 0xd8d2c2), back: hardwareFill, side: hardwareFill,
    onCounter(R, x0, x1, z, h) {
      R.b.box(0.4, 0.12, 0.25, x0 + 0.5, h, z - 0.15, 0x7d858d); R.b.box(0.3, 0.1, 0.2, x0 + 1.0, h, z - 0.1, C.yellow);
      R.b.cyl('z', 0.08, 0.08, 0.06, x1 - 1.0, h + 0.08, z - 0.1, C.red, 10);
    },
    floor(R, Z) {
      R.sacks(Z.behind.x0 + 0.6, Z.behind.z0 + 0.5, PI / 2, R.det ? 4 : 2, 'sack1');
      // pipes on brackets along the right wall, buckets and coils
      const rz0 = Z.right.z0 + 0.2, rz1 = Math.min(Z.right.z1 - 0.8, rz0 + 3.2);
      if (rz1 - rz0 > 1 && R.ok(rect(Z.right.x1 - 0.5, Z.right.x1, rz0, rz1))) {
        for (const y of [0.5, 1.1, 1.7]) R.b.box(0.45, 0.04, 0.05, Z.right.x1 - 0.22, y, (rz0 + rz1) / 2, C.steel);
        for (let k = 0; k < (R.det ? 9 : 4); k++) R.b.cyl('z', 0.04, 0.04, rz1 - rz0, Z.right.x1 - 0.1 - (k % 3) * 0.12, 0.58 + Math.floor(k / 3) * 0.6, (rz0 + rz1) / 2, [C.white, 0x9aa0a6, 0x2f6fb3][k % 3], 6, { pos: true, neg: true });
        R.solid(rect(Z.right.x1 - 0.5, Z.right.x1, rz0, rz1), 2);
        R.browse.push({ x: Z.right.x1 - 1.3, z: (rz0 + rz1) / 2, yaw: PI / 2 });
      }
      if (Z.middle.x1 - Z.middle.x0 > 1.6) R.gondola((Z.middle.x0 + Z.middle.x1) / 2, (Z.middle.z0 + Z.middle.z1) / 2, Math.min(3.6, Z.middle.x1 - Z.middle.x0), U(0.45, 1.3, 2, C.steel, 0x7d858d, 0xd8d2c2), hardwareFill);
      if (Z.island.x1 - Z.island.x0 > 1.2) {                                               // a pallet of paint and stacked buckets
        const ix = (Z.island.x0 + Z.island.x1) / 2, iz = Z.island.z0 + 0.6, f = R.foot(ix, iz, 1.1, 0.9);
        if (R.ok(f)) {
          R.b.box(1.1, 0.12, 0.9, ix, 0, iz, 0xb48c5c);
          for (let l = 0; l < 3; l++) for (let k = 0; k < 3 - l; k++) R.b.cyl('y', 0.14, 0.14, 0.26, ix - 0.3 + l * 0.15 + k * 0.3, 0.25 + l * 0.26, iz + 0.15, 0xffffff, 8, { pos: true, neg: false, capPaint: C.chrome, side: SUV[l % 2 ? 'paint1' : 'paint0'] });
          for (let s = 0; s < 4; s++) R.b.cyl('y', 0.15, 0.12, 0.3, ix + 0.35, 0.27 + s * 0.08, iz - 0.25, C.plastic[s % 4], 8, { pos: s === 3, neg: false });
          R.solid(f, 0.9); R.browse.push({ x: ix, z: iz + 1.0, yaw: PI });
        }
      }
      if (R.det === 2) {                                                                   // a ladder leaning on the right wall
        const lx = Z.right.x1, lz = Z.right.z1 - 0.45, f = R.foot(lx - 0.3, lz, 0.6, 0.5);
        if (R.ok(f)) {
          for (const dz of [-0.2, 0.2]) R.b.beam([lx - 0.6, 0, lz + dz], [lx - 0.05, 2.4, lz + dz], 0.05, 0.05, 0xb48c5c);
          for (let k = 1; k < 7; k++) { const t = k / 7; R.b.beam([lx - 0.6 + t * 0.55, t * 2.4, lz - 0.2], [lx - 0.6 + t * 0.55, t * 2.4, lz + 0.2], 0.03, 0.03, 0xb48c5c); }
          R.solid(f, 1);
        }
      }
    },
  },
  craft: {
    counter: 'left', body: 0x8a5a32, top: 0xc49a58, panel: 'pnlCraft',
    unit: U(0.45, 2.3, 4, C.woodDark, C.wood, 0xe8d5b0), back: craftFill(0), side: craftFill(0),
    onCounter(R, x0, x1, z, h, v) {
      const cx = (x0 + x1) / 2;
      if (v === 0) { R.baskets(x0 + 0.2, cx, h, z + 0.15, 0.4); R.b.cyl('x', 0.1, 0.1, 0.9, cx + 0.6, h + 0.1, z, 0xffffff, 8, { pos: true, neg: true, capPaint: 0xd9b77a, side: SUV.natte }); }
      else if (v === 1) R.leather(x0 + 0.2, x1 - 0.2, h, z + 0.15, 0.4);
      else { R.pirogue(cx - 0.6, h + 0.02, z, 0.8, 0.1); R.pirogue(cx + 0.5, h + 0.02, z - 0.05, 1.0, -0.15); }
    },
    floor(R, Z, v) {
      const bx = Z.behind.x0 + 0.7, bz = Z.behind.z0 + 0.4;                                // the artisan's bench and stool
      if (R.table(bx, bz, 1.2, 0.6, 0.8, 0xb48c5c)) {
        R.b.box(0.5, 0.06, 0.3, bx - 0.2, 0.8, bz, v === 1 ? 0x7a4a26 : 0xd9b77a);
        R.b.beam([bx + 0.25, 0.81, bz - 0.1], [bx + 0.45, 0.81, bz + 0.05], 0.03, 0.03, C.steel);
        R.staff.push({ x: bx, z: bz + 0.7, yaw: PI });
      }
      const ix = (Z.island.x0 + Z.island.x1) / 2, iz = Z.island.z0 + 0.5;
      if (v === 0) {                                                                       // big baskets and rolled mats on the floor
        for (let k = 0; k < (R.det ? 4 : 2); k++) { const x = Z.right.x1 - 0.35, z = Z.right.z0 + 0.4 + k * 0.7; if (R.ok(R.foot(x, z, 0.6, 0.6))) { R.b.cyl('y', 0.22, 0.3, 0.5, x, 0.25, z, 0xffffff, 10, { pos: false, neg: true, side: SUV.basket }); R.solid(R.foot(x, z, 0.6, 0.6), 0.5); if (k === 1) R.browse.push({ x: x - 0.9, z, yaw: PI / 2 }); } }
        for (let k = 0; k < 3; k++) { const z = Z.right.z1 - 0.4 - k * 0.3; if (R.ok(R.foot(Z.right.x1 - 0.6, z, 1.1, 0.28))) { R.b.cyl('x', 0.12, 0.12, 1.0, Z.right.x1 - 0.6, 0.12, z, 0xffffff, 8, { pos: true, neg: true, capPaint: 0xd9b77a, side: SUV.natte }); R.solid(R.foot(Z.right.x1 - 0.6, z, 1.1, 0.28), 0.3); } }
      } else if (v === 1) {                                                                // leather poufs and a carved stool
        for (let k = 0; k < (R.det ? 3 : 2); k++) { const x = Z.right.x1 - 0.4, z = Z.right.z0 + 0.5 + k * 0.75; if (R.ok(R.foot(x, z, 0.6, 0.6))) { R.b.cyl('y', 0.26, 0.26, 0.38, x, 0.19, z, 0xffffff, 10, { pos: true, neg: false, capPaint: 0x8a5a32, side: SUV.leather }); R.solid(R.foot(x, z, 0.6, 0.6), 0.4); if (k === 1) R.browse.push({ x: x - 0.9, z, yaw: PI / 2 }); } }
      } else {                                                                             // a big painted pirogue on trestles
        const x = Z.right.x1 - 0.45, z = (Z.right.z0 + Z.right.z1) / 2, f = R.foot(x, z, 0.6, 2.6);
        if (R.ok(f)) { for (const dz of [-0.8, 0.8]) R.b.box(0.5, 0.45, 0.08, x, 0, z + dz, C.woodDark); R.pirogue(x - 0.05, 0.45, z, 2.2, PI / 2 - 0.4); R.solid(f, 0.9); R.browse.push({ x: x - 1.1, z, yaw: PI / 2 }); }
      }
      if (Z.island.x1 - Z.island.x0 > 1.2 && R.table(ix, iz, 1.0, 0.6, 0.7, 0xc49a58)) {
        if (v === 0) R.baskets(ix - 0.45, ix + 0.45, 0.7, iz + 0.25, 0.4); else if (v === 1) R.leather(ix - 0.45, ix + 0.45, 0.7, iz + 0.25, 0.4); else R.pirogue(ix, 0.72, iz, 0.8);
        R.browse.push({ x: ix, z: iz + 0.85, yaw: PI });
      }
    },
  },
  beauty: {
    counter: 'desk', body: 0x6b3fa0, top: 0xf2f2ee, panel: 'pnlBeauty',
    unit: U(0.35, 2.2, 5, C.white, 0xf7f7f4, 0xf1e4f0), back: beautyFill, side: beautyFill,
    onCounter(R, x0, x1, z, h) { R.bottles(x0 + 0.2, x0 + 0.9, h, z + 0.1, 0.3, ['bt2', 'bt3'], 0.03, 0.16); R.b.box(0.3, 0.1, 0.2, x1 - 0.5, h, z - 0.1, 0xc2417f); },
    floor(R, Z) {
      if (R.table(Z.behind.x0 + 0.5, Z.behind.z0 + 0.4, 0.8, 0.5, 0.8, C.white)) {
        for (let k = 0; k < 3; k++) R.b.box(0.3, 0.08, 0.25, Z.behind.x0 + 0.5, 0.8 + k * 0.08, Z.behind.z0 + 0.4, k % 2 ? 0xc2417f : C.white);
      }
      R.plant(Z.middle.x0 + 0.4, Z.middle.z1 - 0.3, 0.8);
    },
    posters: ['poster3'],
  },
};

/** The plan shared by every shop with a counter: lanes, counter and till, wall runs, then the type's floor. */
function counterShop(R: Room, st: Style, v: number): Plan {
  const { W, D, xl, xr, zb } = R;
  const cd = 0.7, ch = 1.0, cz = D >= 7 ? D / 2 - 2.7 : D / 2 - 2.1;
  let x0: number, x1: number;
  if (st.counter === 'centre') { const cw = clamp(W * 0.5, 2.0, 6.5); x0 = -cw / 2; x1 = cw / 2; }
  else if (st.counter === 'desk') { x0 = xl + 0.45; x1 = x0 + clamp(W * 0.19, 1.4, 2.4); }
  else { const cw = clamp(W * 0.4, 1.8, 7), cm = -W * 0.23; x0 = cm - cw / 2; x1 = cm + cw / 2; }
  const cxm = (x0 + x1) / 2;
  const corZ0 = cz - cd / 2 - 1.75, corZ1 = cz - cd / 2;
  const ax0 = st.counter === 'left' && !st.aisleNext ? Math.max(W / 2 - 3.4, x1 + 0.3) : x1 + 0.3, ax1 = Math.min(xr - 0.6, ax0 + 1.4);
  const aisle = rect(ax0, ax1, corZ0, D / 2);
  R.keep.push(rect(x0 - 0.15, ax1, corZ0, corZ1), aisle, rect(x0, x1, corZ1 + cd, D / 2), rect(-0.3, 1.3, D / 2 - 1.1, D / 2));
  // counter, till and what is on it
  R.counter(x0, x1, cz, cd, ch, st.body, st.top, st.panel, st.vitrine);
  R.till(x1 - 0.4, cz - 0.17, ch);
  st.onCounter(R, x0, x1, cz, ch, v);
  // shelves on the walls
  const u = st.unit, sd = Math.min(u.dp, 0.42);
  const side: UnitStyle = { ...u, dp: sd };
  if (st.peg) {
    const pegX1 = Math.min(x1 + 0.4, ax0 - 0.2), pl = pegX1 - xl - 0.1;
    R.panel((xl + pegX1) / 2, 1.75, R.zb + 0.005, 0, pl, Math.min(1.5, R.H - 2.2), st.peg);
    R.run('back', xl, pegX1, { ...u, h: 0.9, levels: 1 }, st.back, 2.4, 1, 0.9);
    R.run('back', pegX1 + 0.05, xr, u, st.back);
  } else R.run('back', xl, xr, u, st.back);
  const sz0 = zb + u.dp + 0.05;
  R.run('left', sz0, st.sides === 'both' ? D / 2 - 0.4 : corZ0 - 0.05, side, st.side);
  if (st.sides === 'both') R.run('right', sz0, D / 2 - 0.4, side, st.side);
  // the type's floor
  const Z: Zones = {
    behind: rect(xl + sd + 0.1, Math.max(xl + sd + 0.6, Math.min(x1 - 0.9, ax0 - 0.3)), sz0 + 0.05, corZ0 - 0.05),
    middle: rect(st.counter === 'left' ? x1 - 0.4 : ax1 + 0.2, (st.counter === 'left' ? ax0 : xr - 1.4) - 0.35, sz0 + 0.7, corZ0 - 0.7),
    right: rect(ax1 + 0.15, st.sides === 'both' ? xr - sd : xr, sz0, D / 2 - 0.3),
    island: rect(x1 + 0.8, ax0 - 0.3, cz - 0.2, D / 2 - 0.9),
    cz, x0, x1, ch, cd,
  };
  if (st.counter !== 'left') { Z.middle = rect(ax1 + 0.2, xr - 0.2, sz0 + 0.1, cz + 0.6); Z.island = rect(ax1 + 0.2, xr - 1.2, cz + 0.6, D / 2 - 0.5); }
  if (st.aisleNext) { Z.middle = rect(ax1 + 0.3, xr - 0.15, sz0 + 0.15, D / 2 - 0.25); Z.island = rect(0, 0, 0, 0); }
  st.floor(R, Z, v);
  if (!R.browse.length) R.browse.push({ x: (ax0 + ax1) / 2, z: corZ0 + 0.3, yaw: PI });   // the back shelves, from the aisle
  // light and decor
  const nt = Math.max(1, Math.round(W / 4));
  for (let i = 0; i < nt; i++) R.tube(-W / 2 + (i + 0.5) * (W / nt), cz - 1.6);
  if (R.det === 2 && W >= 8 && st.counter !== 'centre') R.fan(Z.island.x0 + 1, cz + 0.6);
  (st.posters ?? []).forEach((p, i) => R.panel(xl + 0.002, 1.9, cz + 0.4 - i * 0.9, PI / 2, 0.5, 0.75, p));
  if (R.det) R.panel(xr - 0.002, R.H - 0.7, cz - 0.3, -PI / 2, 0.36, 0.36, 'clock');
  const spot = { x: cxm, z: cz + cd / 2 + 0.62, yaw: PI };
  const queue = [spot, { x: cxm + 0.8, z: Math.min(D / 2 - 0.35, spot.z + 0.7), yaw: PI - 0.5 }, { x: cxm + 1.6, z: Math.min(D / 2 - 0.3, spot.z + 1.2), yaw: PI - 0.7 }];
  return { counter: spot, till: { x: x1 - 0.4, z: cz, yaw: PI, y: ch + 0.8 }, keeper: { x: cxm, z: cz - cd / 2 - 0.55, yaw: 0 }, queue, door: { x: 0.5, z: D / 2 - 0.5, yaw: PI } };
}

/** Café / juice bar: the counter toward the back, the bar behind it, stools and two small tables in front. */
function cafePlan(R: Room): Plan {
  const { W, D, xl, xr, zb } = R;
  const cd = 0.6, ch = 1.05, cz = -D / 2 + 2.0, cw = clamp(W * 0.6, 2.4, 6), x0 = -cw / 2, x1 = cw / 2;
  R.keep.push(rect(-0.6, 0.6, cz + cd / 2, D / 2), rect(x0 - 1.1, x0 - 0.1, zb, cz + cd / 2));
  R.counter(x0, x1, cz, cd, ch, 0x49704b, 0xd9c4a0, 'pnlJuice');
  R.till(x1 - 0.4, cz - 0.08, ch);
  // on the counter: bottles of juice in a cooler, glasses, a basket of sandwiches
  R.b.box(0.9, 0.26, 0.4, -0.75, ch, cz - 0.05, 0x2f6fb3);
  for (let k = 0; k < 6; k++) { const key = (['bt2', 'bt0', 'bt3'] as const)[k % 3]; R.b.cyl('y', 0.035, 0.035, 0.22, -1.1 + k * 0.13, ch + 0.37, cz - 0.05, 0xffffff, 5, { pos: true, neg: false, capPaint: C.white, side: SUV[key] }); }
  for (let k = 0; k < 4; k++) R.g.cyl('y', 0.035, 0.03, 0.1, 0.25 + k * 0.1, ch + 0.05, cz + 0.12, C.glass, 6, { pos: false, neg: true });
  R.b.box(0.5, 0.12, 0.32, 0.9, ch, cz - 0.04, 0xc49a58); for (let k = 0; k < 3; k++) R.b.cyl('x', 0.04, 0.04, 0.42, 0.9, ch + 0.15, cz - 0.12 + k * 0.08, 0xd9a050, 6);
  // the bar behind: a work table with the juicer and fruit, the fridge, the lit menu
  const bz = zb + 0.3;
  if (R.table(0, bz, Math.min(3.2, cw), 0.5, 0.9, 0xdcdcdc, C.steel)) {
    R.b.box(0.22, 0.2, 0.22, -0.6, 0.9, bz, C.dark); R.g.cyl('y', 0.08, 0.1, 0.24, -0.6, 1.22, bz, C.glass, 8, { pos: true, neg: false });   // juicer
    R.crate(0.2, bz, 0.9, 0xe8822c); R.crate(0.85, bz, 0.9, 0x7fb03a);
    if (R.det) for (let k = 0; k < 3; k++) R.crate(-0.9 + k * 0.6, bz, 0.02, [0xe8822c, 0xd9322b, 0xe6c35a][k]);
  }
  R.fridge(Math.min(xr - 0.4, x1 + 0.5), zb + 0.38, 0);
  const mx = 0, mz = zb + 0.04;
  for (const dx of [-0.85, 0.85]) R.b.box(0.06, 2.6, 0.06, mx + dx, 0, mz, C.dark);
  R.b.box(1.7, 1.0, 0.05, mx, 1.7, mz, C.dark, { pz: { rect: SUV.menu } });
  // front: stools at the counter's ends, two small tables with chairs
  R.stool(x0 + 0.35, cz + cd / 2 + 0.42, PI); R.stool(x1 - 0.35, cz + cd / 2 + 0.42, PI);
  if (R.det) R.stool(x0 + 0.85, cz + cd / 2 + 0.42, PI);
  for (const sx of [-1, 1]) {
    const tx = sx * Math.min(W * 0.3, xr - 1.3), tz = cz + 2.4;
    if (tz + 0.8 > D / 2 - 0.2 || !R.ok(R.foot(tx, tz, 1.8, 0.8))) continue;
    R.b.cyl('y', 0.32, 0.32, 0.04, tx, 0.72, tz, C.white, 12); R.b.cyl('y', 0.04, 0.04, 0.72, tx, 0.36, tz, C.chrome, 6); R.b.cyl('y', 0.22, 0.22, 0.03, tx, 0.015, tz, C.chrome, 8);
    R.solid(R.foot(tx, tz, 0.66, 0.66), 0.75);
    R.chair(tx - 0.62, tz, PI / 2, C.plastic[(sx + 1) / 2 + 1]); R.chair(tx + 0.62, tz, -PI / 2, C.plastic[(sx + 1) / 2 + 1]);
  }
  if (R.det) { R.plant(xl + 0.35, D / 2 - 0.5, 0.8); }
  for (let i = 0; i < Math.max(1, Math.round(W / 4)); i++) R.tube(-W / 2 + (i + 0.5) * (W / Math.max(1, Math.round(W / 4))), cz);
  const spot = { x: 0, z: cz + cd / 2 + 0.6, yaw: PI };
  return { counter: spot, till: { x: x1 - 0.4, z: cz, yaw: PI, y: ch + 0.8 }, keeper: { x: 0, z: cz - cd / 2 - 0.5, yaw: 0 },
    queue: [spot, { x: 0, z: Math.min(D / 2 - 0.3, spot.z + 0.8), yaw: PI }, { x: 0.3, z: Math.min(D / 2 - 0.3, spot.z + 1.6), yaw: PI }], door: { x: 0, z: D / 2 - 0.5, yaw: PI } };
}

/**
 * Restaurant: the kitchen behind a wall at the back with its pass (plates under heat lamps), the cash desk on the left
 * in front of it, tables with their chairs filling the room, the menu on the wall and a painting of the sea.
 */
function restaurantPlan(R: Room): Plan {
  const { W, D, xl, xr, zb, b } = R;
  const kz = zb + 1.2, cd = 0.6, ch = 1.05;                                            // kitchen wall's front face
  const x0 = xl + 0.45, x1 = x0 + clamp(W * 0.2, 1.8, 2.6), cz = kz + 1.05, cxm = (x0 + x1) / 2;
  // the lanes: in front of the desk, behind it from its right end, from the door to the desk
  R.keep.push(rect(x0, x1, cz + cd / 2, cz + cd / 2 + 2.0), rect(x1 + 0.1, x1 + 1.1, kz, cz + cd / 2 + 2.0), rect(x0 - 0.1, x1 + 1.1, kz, cz - cd / 2),
    rect(-0.8, 0.8, D / 2 - 1.4, D / 2), rect(x0, 0.8, cz + cd / 2 + 1.2, cz + cd / 2 + 2.4));
  // kitchen wall with the pass and a door, the kitchen glimpsed through them
  const pw = Math.min(2.8, W * 0.3), px = (x1 + xr) / 2 - 0.4, dx0 = xr - 1.5, dx1 = xr - 0.5;
  const wall = (a: number, c: number, y0: number, y1: number) => { if (c - a > 0.01) b.box(c - a, y1 - y0, 0.2, (a + c) / 2, y0, kz - 0.1, 0xe9e1d0); };
  wall(xl, px - pw / 2, 0, R.H); wall(px + pw / 2, dx0, 0, R.H); wall(dx1, xr, 0, R.H); wall(dx0, dx1, 2.2, R.H);
  wall(px - pw / 2, px + pw / 2, 0, 1.0); wall(px - pw / 2, px + pw / 2, 1.95, R.H);
  b.box(pw + 0.2, 0.05, 0.5, px, 1.0, kz + 0.05, C.chrome);                               // the pass shelf
  b.decal([px, 1.48, kz - 0.18], [1, 0, 0], [0, 1, 0], pw - 0.1, 0.9, SUV.pass);
  for (let k = 0; k < 3; k++) b.cyl('y', 0.13, 0.13, 0.02, px - pw / 2 + 0.5 + k * (pw - 1) / 2, 1.06, kz + 0.1, C.white, 10, { pos: SUV.plate, neg: false });
  b.box(0.9, 0.9, 0.6, px - 0.6, 0, zb + 0.4, C.chrome); b.box(0.9, 0.9, 0.6, px + 0.5, 0, zb + 0.4, C.dark);     // stove and worktop behind
  R.solid(rect(xl, xr, zb - 0.05, kz), R.H);
  R.staff.push({ x: px, z: kz + 0.55, yaw: PI });                                        // the waiter at the pass
  // the cash desk
  R.counter(x0, x1, cz, cd, ch, 0x0c4a6e, 0xd9c4a0, 'pnlResto');
  R.till(x1 - 0.35, cz - 0.1, ch);
  R.b.box(0.6, 0.12, 0.3, x0 + 0.45, ch, cz - 0.08, 0xb48c5c); for (let k = 0; k < 3; k++) R.b.cyl('x', 0.035, 0.035, 0.5, x0 + 0.45, ch + 0.15, cz - 0.16 + k * 0.08, 0xd9a050, 6);   // bread
  R.panel(xl + 0.002, 2.1, cz + 0.2, PI / 2, 1.3, 0.98, 'menuResto');
  R.panel(xr - 0.002, 1.8, (kz + D / 2) / 2, -PI / 2, 2.0, 1.0, 'seaview');
  // tables and chairs, packed in the room around the lanes
  const per = R.det === 2 ? 4 : 2;
  for (let zz = kz + 1.6; zz < D / 2 - 1.0; zz += 2.35) for (let xx = xl + 1.4; xx < xr - 1.0; xx += 2.4) {
    if (!R.ok(rect(xx - 1.1, xx + 1.1, zz - (per > 2 ? 1.1 : 0.55), zz + (per > 2 ? 1.1 : 0.55)))) continue;
    R.table(xx, zz, 0.9, 0.9, 0.75, C.white, C.woodDark);
    b.decal([xx, 0.756, zz], [1, 0, 0], [0, 0, -1], 0.9, 0.9, SUV.cloth2);
    if (R.r() < 0.6) b.cyl('y', 0.13, 0.13, 0.02, xx - 0.2, 0.76, zz + 0.15, C.white, 10, { pos: SUV.plate, neg: false });
    R.chair(xx - 0.72, zz, PI / 2, 0x8b5a32); R.chair(xx + 0.72, zz, -PI / 2, 0x8b5a32);
    if (per > 2) { R.chair(xx, zz - 0.72, 0, 0x8b5a32); R.chair(xx, zz + 0.72, PI, 0x8b5a32); }
  }
  if (R.det) { R.plant(xl + 0.4, D / 2 - 0.5, 1); R.plant(xr - 0.4, D / 2 - 0.5, 1); }
  for (let i = 0; i < Math.max(2, Math.round(W / 4)); i++) R.tube(-W / 2 + (i + 0.5) * (W / Math.max(2, Math.round(W / 4))), (kz + D / 2) / 2);
  if (R.det === 2) R.fan(0, (kz + D / 2) / 2 + 1);
  const spot = { x: cxm, z: cz + cd / 2 + 0.62, yaw: PI };
  return { counter: spot, till: { x: x1 - 0.35, z: cz, yaw: PI, y: ch + 0.8 }, keeper: { x: cxm, z: cz - cd / 2 - 0.45, yaw: 0 },
    queue: [spot, { x: cxm + 0.75, z: spot.z + 0.6, yaw: PI - 0.4 }, { x: cxm + 1.5, z: spot.z + 1.0, yaw: PI - 0.6 }], door: { x: 0, z: D / 2 - 0.5, yaw: PI } };
}

/** Bank hall: guichets behind glass, the back office, a queue lane between posts, rows of waiting chairs. */
function bankPlan(R: Room): Plan {
  const { W, D, xl, xr, zb } = R;
  const cd = 0.8, ch = 1.1, cz = -D / 2 + Math.min(9, D * 0.42), len = clamp(W * 0.47, 4, 15), x0 = -len / 2, x1 = len / 2;
  const n = len >= 12 ? 5 : len >= 7 ? 3 : 2, win = (i: number) => x0 + (i + 0.5) * (len / n);
  R.keep.push(rect(-1.0, 1.0, cz + cd / 2, D / 2));
  R.counter(x0, x1, cz, cd, ch, 0xe9e4d9, 0x145d5b, 'pnlBank');
  // glass partitions with a speaking slot at each window, plates above
  for (let i = 0; i <= n; i++) R.b.box(0.06, 1.2, 0.06, x0 + i * (len / n), ch, cz + 0.1, C.steel);
  R.b.box(len, 0.1, 0.1, 0, ch + 1.2, cz + 0.1, C.steel);
  for (let i = 0; i < n; i++) {
    const wx = win(i), pw = len / n - 0.08;
    R.g.box(pw, 0.9, 0.02, wx, ch + 0.3, cz + 0.1, C.glass);
    R.b.decal([wx, ch + 1.42, cz + 0.16], [1, 0, 0], [0, 1, 0], 0.9, 0.3, SUV.guichet);
    R.b.box(0.42, 0.3, 0.05, wx - 0.5, ch, cz - 0.22, C.dark, { nz: { rect: SUV.screen2 } });   // the teller's screen, facing the teller
    R.chair(wx, cz - cd / 2 - 0.95, 0, C.dark, 0.5, 'chair', false, false);
    if (i !== Math.floor(n / 2)) R.staff.push({ x: wx, z: cz - cd / 2 - 0.45, yaw: 0 });
  }
  R.b.box(len, 0.12, 0.3, 0, 0, cz + cd / 2 + 0.15, 0xc9cdd2);                               // foot rail
  // back office: desks with screens, filing shelves, the vault door
  const files = U(0.45, 2.2, 5, C.steel, 0x7d858d, 0xd8d2c2);
  R.run('back', xl, -1.0, files, filesFill);
  R.run('back', 1.0, xr, files, filesFill);
  R.panel(0, 1.25, zb + 0.005, 0, 1.2, 1.8, 'safe');
  if (cz - zb > 4) for (const dx of [-0.32, 0.32]) for (let i = 0; i < 2; i++) {
    const x = dx * len * (i ? 0.6 : 1.4), z = zb + 2.2;
    if (R.table(x, z, 1.4, 0.7, 0.76, 0xd9c4a0, C.steel)) { R.b.box(0.5, 0.36, 0.05, x, 0.76, z - 0.1, C.dark, { pz: { rect: SUV.screen } }); R.chair(x, z + 0.6, PI, C.dark, 0.48, 'chair', false, false); }
  }
  // the queue lane from the entrance to the middle window, ticket machine and brochures
  const q0 = cz + cd / 2 + 0.9, q1 = Math.min(D / 2 - 2.2, q0 + 4.5), mid = win(Math.floor(n / 2));
  const posts: [number, number][] = [], L: [number, number][] = [], Rr: [number, number][] = [];
  for (let z = q0; z <= q1 + 0.01; z += 1.1) { posts.push([mid - 0.75, z], [mid + 0.75, z]); L.push([mid - 0.75, z]); Rr.push([mid + 0.75, z]); }
  R.stanchions(posts, [L, Rr]);
  const tk = { x: mid + 1.6, z: q1 + 0.6 };
  if (R.ok(R.foot(tk.x, tk.z, 0.5, 0.4))) { R.b.box(0.45, 1.35, 0.35, tk.x, 0, tk.z, 0x145d5b, { pz: { rect: SUV.ticket } }); R.solid(R.foot(tk.x, tk.z, 0.5, 0.4), 1.4); R.browse.push({ x: tk.x, z: tk.z + 0.75, yaw: PI }); }
  // waiting chairs in rows facing the guichets
  const per = R.det === 2 ? 6 : R.det ? 5 : 4;
  for (const sx of [-1, 1]) for (let row = 0; row < 2; row++) {
    const z = cz + 3.2 + row * 1.6, xa = sx < 0 ? xl + 1.4 : mid + 2.2, xb = sx < 0 ? mid - 2.2 : xr - 1.4;
    const m = Math.min(per, Math.floor((xb - xa) / 0.58)); if (m < 2) continue;
    const xs = (xa + xb) / 2 - ((m - 1) * 0.58) / 2;
    if (!R.ok(rect(xs - 0.3, xs + (m - 1) * 0.58 + 0.3, z - 0.3, z + 0.3))) continue;
    R.b.box((m - 1) * 0.58 + 0.4, 0.05, 0.08, xs + ((m - 1) * 0.58) / 2, 0.3, z, C.steel);
    for (let k = 0; k < m; k++) R.chair(xs + k * 0.58, z, PI, 0x145d5b, 0.46, 'chair', false);
    R.solid(rect(xs - 0.25, xs + (m - 1) * 0.58 + 0.25, z - 0.25, z + 0.25), 0.5);
  }
  for (const [x, z] of [[xl + 0.6, D / 2 - 0.8], [xr - 0.6, D / 2 - 0.8], [xl + 0.6, cz + 1.2], [xr - 0.6, cz + 1.2]] as [number, number][]) R.plant(x, z, 1.2);
  R.panel(xl + 0.002, 2.0, cz + 2.5, PI / 2, 1.0, 1.5, 'poster0'); R.panel(xr - 0.002, 2.0, cz + 2.5, -PI / 2, 1.0, 1.5, 'poster0');
  if (R.det) R.panel(0, R.H - 0.9, zb + 0.005, 0, 0.5, 0.5, 'clock');
  for (let i = 0; i < Math.max(2, Math.round(W / 5)); i++) R.tube(-W / 2 + (i + 0.5) * (W / Math.max(2, Math.round(W / 5))), cz - 1.8, 1.6);
  const spot = { x: mid, z: cz + cd / 2 + 0.62, yaw: PI };
  const queue = [spot]; for (let z = q0 + 0.4; z < q1 + 0.6; z += 0.8) queue.push({ x: mid, z, yaw: PI });
  return { counter: spot, till: { x: mid, z: cz, yaw: PI, y: ch + 1.0 }, keeper: { x: mid, z: cz - cd / 2 - 0.5, yaw: 0 }, queue, door: { x: mid, z: D / 2 - 0.6, yaw: PI } };
}

/** What a showroom shows when nobody says (a silver, a white and a blue saloon of the kit). */
const SHOWROOM_LOTS: readonly ShopLotVehicle[] = [{ kind: 'sedan', seed: 18 }, { kind: 'sedan', seed: 7 }, { kind: 'sedan', seed: 1 }];
/** The price card of each lot the kit fills: for sale, then the ones already taken (reserved, sold). */
const LOT_CARDS: readonly ShopKey[] = ['carCard0', 'carCard1', 'carCard2'];

/**
 * Used-car showroom: saloons on lots nose to the street (white lines on a light tiled floor, a price card on a stand at
 * each nose), the aisle up the middle to the salesman's desk at the back, the keys on a board behind him, a waiting
 * bench with brochures, a shelf of oil and parts. Lots given as null are left for the module that sells that vehicle
 * (src/transport/ownedModule.ts draws it and its card there, so the one bought can leave the floor): no car, no card.
 */
function showroomPlan(R: Room, lots: readonly ShopLotVehicle[], floor: boolean): Plan {
  const { W, D, xl, xr, zb, b } = R;
  const sp = vehicleSpec('sedan', { seed: 1, driver: false, passengers: false });
  // the cars' noses 0.9 m from the front (0.6 in a shallow room), the desk as far back as leaves 1.1 m in front of it
  const cw = sp.width + 0.1, nose = D / 2 - (D >= 8.8 ? 0.9 : 0.6), cz = nose - sp.length / 2, rear = cz - sp.length / 2 - 0.05, ah = 1.3;
  const dd = 0.75, dh = 0.78, deskZ = clamp(rear - 1.1 - dd / 2, zb + 1.175, zb + 1.35), front = deskZ + dd / 2, back = deskZ - dd / 2;
  // the lanes: the aisle from the street, the customers' side of the desk, the salesman's way round it to his place
  R.keep.push(rect(-ah, ah, rear, D / 2), rect(-ah, ah, front, rear), rect(1.0, 1.9, zb, rear), rect(-1.1, 1.9, zb, back));
  if (floor) for (let x = -W / 2; x < W / 2 - 0.01; x += 2) for (let z = -D / 2; z < D / 2 - 0.01; z += 2) {
    const w = Math.min(2, W / 2 - x), d = Math.min(2, D / 2 - z);
    b.decal([x + w / 2, 0.003, z + d / 2], [1, 0, 0], [0, 0, -1], w, d, SUV.floorShow);
  }
  // the lots: beside the aisle on each side, then further left when the floor is wide enough
  const out: ShopLot[] = [];
  const at = [-(ah + 0.2 + cw / 2), ah + 0.2 + cw / 2, -(ah + 0.2 + cw / 2) - (cw + 1.15)];
  for (let k = 0; k < Math.min(lots.length, at.length); k++) {
    const x = at[k];
    if (x - cw / 2 < xl + 0.05 || x + cw / 2 > xr - 0.05) continue;
    for (const s of [-1, 1]) b.box(0.05, 0.004, sp.length + 0.4, x + s * (cw / 2 + 0.1), 0.004, cz, C.white);   // its white lines
    const sx = x + 0.55, sz = Math.min(D / 2 - 0.5, nose + 0.35), v = lots[k];
    if (v && R.vehicle(v.kind, v.seed, x, cz, 0)) {
      b.cyl('y', 0.12, 0.12, 0.02, sx, 0.01, sz, C.steel, 8);
      b.box(0.03, 0.92, 0.03, sx, 0, sz, C.chrome);
      b.box(0.52, 0.36, 0.015, sx, 0.9, sz, C.white);
      R.panel(sx, 1.08, sz + 0.008, 0, 0.5, 0.333, LOT_CARDS[k % LOT_CARDS.length]);
      R.solid(R.foot(sx, sz, 0.24, 0.24), 1.3);
    }
    out.push({ x, z: cz, yaw: 0, card: { x: sx, z: sz, yaw: 0 } });
    // a customer looks at it from the aisle (the far one from the gap beside it)
    R.browse.push(k === 2 ? { x: x + cw / 2 + 0.575, z: cz, yaw: -PI / 2 } : { x: x - Math.sign(x) * (cw / 2 + 0.5), z: cz + 0.6, yaw: Math.sign(x) * PI / 2 });
  }
  // the salesman's desk: the dealer's panel in front, his screen, papers and a set of keys; the client's chair
  R.counter(-1.0, 1.0, deskZ, dd, dh, 0x1b2a7a, 0xe6e6e6, 'pnlCars');
  b.box(0.06, 0.12, 0.06, 0.45, dh, deskZ - 0.12, C.dark); b.box(0.52, 0.32, 0.03, 0.45, dh + 0.12, deskZ - 0.12, C.black, { nz: { rect: SUV.screen2 } });
  b.box(0.32, 0.015, 0.24, -0.45, dh, deskZ + 0.05, C.white); b.beam([-0.25, dh + 0.02, deskZ + 0.1], [-0.12, dh + 0.02, deskZ + 0.02], 0.012, 0.012, C.blue);
  b.box(0.025, 0.012, 0.07, -0.02, dh, deskZ + 0.2, C.chrome); b.box(0.045, 0.008, 0.05, -0.02, dh, deskZ + 0.27, C.yellow);   // the keys to hand over
  R.chair(-0.75, front + 0.45, PI, 0x2b2f36);
  // the keys on their board behind him, the clock above, a poster on the wall
  const kx = 1.35;
  b.box(1.02, 0.7, 0.03, kx, 1.2, zb + 0.015, C.woodDark);
  R.panel(kx, 1.55, zb + 0.03, 0, 0.96, 0.64, 'keys');
  if (R.det) R.panel(0, R.H - 0.6, zb + 0.005, 0, 0.36, 0.36, 'clock');
  R.panel(xl - 0.008, 1.7, Math.min(rear - 0.8, zb + 1.6), PI / 2, 0.6, 0.87, 'posterCars');
  // waiting: a bench facing the cars, a low table with brochures, a plant
  const bx = Math.max(xl + 1.0, (xl - 1.1) / 2);
  if (R.bench(bx, zb + 0.35, 0, 3, 0x1b2a7a) && R.det && R.table(bx, zb + 1.05, 1.0, 0.45, 0.42, 0xe6e6e6, C.steel)) {
    for (let k = 0; k < 3; k++) b.box(0.21, 0.01 + k * 0.004, 0.28, bx - 0.3 + k * 0.3, 0.42, zb + 1.05, [C.white, 0xf2c230, 0x1b2a7a][k]);
  }
  R.plant(xl + 0.35, zb + 0.35, 0.9);
  // oil and parts on a shelf at the back right, tyres and a plant by the right wall
  const units = R.run('back', 2.0, xr, U(0.45, 2.0, 4, C.steel, 0x7d858d, 0xd8d2c2), garageFill);
  if (units) R.browse.push({ x: (2.0 + xr) / 2, z: zb + 0.45 + 0.7, yaw: PI });
  const r1 = out.find(l => l.x > 0);
  if (r1) {
    R.staff.push({ x: r1.x + cw / 2 + 0.45, z: cz, yaw: -PI / 2 });                     // someone shining the cars
    const tx = xr - 0.45, tz = cz + 1.0;
    if (tx - 0.35 > r1.x + cw / 2 + 0.9 && R.ok(R.foot(tx, tz, 0.62, 0.62))) {
      for (let n = 0; n < (R.det ? 4 : 2); n++) b.cyl('y', 0.3, 0.3, 0.19, tx, 0.095 + n * 0.19, tz, 0xffffff, 12, { pos: true, neg: false, capPaint: 0x2b2b2e, side: SUV.tyre });
      R.solid(R.foot(tx, tz, 0.62, 0.62), 1);
    }
    if (xr - (r1.x + cw / 2) > 1.6) R.plant(xr - 0.4, D / 2 - 0.5, 1.1);
  }
  const nt = Math.max(2, Math.round(W / 3.5));
  for (let i = 0; i < nt; i++) { R.tube(-W / 2 + (i + 0.5) * (W / nt), cz); R.tube(-W / 2 + (i + 0.5) * (W / nt), deskZ + 0.6); }
  const spot = { x: 0, z: front + 0.62, yaw: PI };
  return { counter: spot, till: { x: 0.6, z: deskZ, yaw: PI, y: dh + 0.9 }, keeper: { x: 0, z: back - 0.5, yaw: 0 },
    queue: [spot, { x: 0.5, z: spot.z + 0.75, yaw: PI - 0.4 }, { x: -0.4, z: spot.z + 1.5, yaw: PI + 0.3 }], door: { x: 0, z: D / 2 - 0.5, yaw: PI }, lots: out };
}

/**
 * The room itself for a walkable interior: tiled floor, plastered walls with a doorway at +z, ceiling. `open`: a
 * showroom's shell instead — back and side walls inside the footprint, the ceiling, a header beam over the open front.
 */
function shell(R: Room, open = false) {
  const { W, D, H, b } = R, T = 0.2, door = 1.6;
  if (open) {
    const t = 0.14, wall = 0xf2f2ee;
    b.box(W, H, t, 0, 0, -D / 2 + t / 2, wall);
    for (const s of [-1, 1]) b.box(t, H, D, s * (W / 2 - t / 2), 0, 0, wall);
    b.box(W - 2 * t, 0.12, 0.02, 0, 0, -D / 2 + t + 0.01, 0x9a8a72);
    b.slab(W + 0.3, 0.25, D + 0.3, 0, H, 0, 0xf4efe6);
    b.box(W, 0.7, 0.25, 0, H - 0.7, D / 2 - 0.125, 0x2b2f36);
    R.solid(rect(-W / 2, W / 2, -D / 2, -D / 2 + t), H);
    R.solid(rect(-W / 2, -W / 2 + t, -D / 2, D / 2), H); R.solid(rect(W / 2 - t, W / 2, -D / 2, D / 2), H);
    return;
  }
  for (let x = -W / 2; x < W / 2 - 0.01; x += 2) for (let z = -D / 2; z < D / 2 - 0.01; z += 2) {
    const w = Math.min(2, W / 2 - x), d = Math.min(2, D / 2 - z);
    b.decal([x + w / 2, 0.004, z + d / 2], [1, 0, 0], [0, 0, -1], w, d, SUV.tiles);
  }
  const wall = 0xefe6d4, skirt = 0x9a8a72;
  b.box(W + 2 * T, H, T, 0, 0, -D / 2 - T / 2, wall); b.box(W, 0.12, 0.02, 0, 0, -D / 2 + 0.01, skirt);
  for (const s of [-1, 1]) { b.box(T, H, D, s * (W / 2 + T / 2), 0, 0, wall); b.box(0.02, 0.12, D, s * (W / 2 - 0.01), 0, 0, skirt); }
  const seg = (W - door) / 2;
  for (const s of [-1, 1]) b.box(seg, H, T, s * (door / 2 + seg / 2), 0, D / 2 + T / 2, wall);
  b.box(door, H - 2.3, T, 0, 2.3, D / 2 + T / 2, wall);
  b.slab(W + 2 * T, 0.1, D + 2 * T, 0, H, 0, 0xf4efe6);
  R.solid(rect(-W / 2 - T, W / 2 + T, -D / 2 - T, -D / 2), H);
  for (const s of [-1, 1]) R.solid(s < 0 ? rect(-W / 2 - T, -W / 2, -D / 2, D / 2 + T) : rect(W / 2, W / 2 + T, -D / 2, D / 2 + T), H);
  for (const s of [-1, 1]) R.solid(s < 0 ? rect(-W / 2, -door / 2, D / 2, D / 2 + T) : rect(door / 2, W / 2, D / 2, D / 2 + T), H);
  R.keep.push(rect(-door / 2 - 0.2, door / 2 + 0.2, D / 2 - 1.3, D / 2));
}

// ------------------------------------------------------------------------------------------------------------ API
const TYPE_SEED: Record<ShopType, number> = { grocery: 1, phone: 2, clothing: 3, furniture: 4, pharmacy: 5, cafe: 6, bank: 7, hardware: 8, craft: 9, beauty: 10, garage: 11, restaurant: 12, showroom_cars: 13 };
const ONE = new THREE.Vector3(1, 1, 1), UP = new THREE.Vector3(0, 1, 0);

/**
 * Builds and stocks a shop interior of `footprint` (w along x, d along z, local front +z). Deterministic for a seed.
 * Open shopfronts pass the inside of their shell (`shell: false`); walkable interiors pass `shell: true`.
 */
export function buildShopInterior(type: ShopType, footprint: { w: number; d: number }, seed = 1, o: ShopOptions = {}): ShopInterior {
  const W = footprint.w, D = footprint.d, H = o.height ?? 3.6;
  const det = ({ low: 0, medium: 1, high: 2 } as const)[o.detail ?? 'high'];
  const R = new Room(W, D, H, det, seeded(seed * 7919 + TYPE_SEED[type] * 104729), o.reserve ?? [], o.id ?? `shop:${type}`);
  if (o.shell) shell(R, o.shell === 'open');
  const plan = type === 'cafe' ? cafePlan(R) : type === 'bank' ? bankPlan(R) : type === 'restaurant' ? restaurantPlan(R)
    : type === 'showroom_cars' ? showroomPlan(R, o.lots ?? SHOWROOM_LOTS, o.shell !== true) : counterShop(R, type === 'craft' ? { ...STYLES.craft, back: craftFill(o.variant ?? 0), side: craftFill(o.variant ?? 0) } : STYLES[type], o.variant ?? 0);

  // meshes: the atlas body, its glass, the showroom's furniture
  const M = shopMaterials();
  const group = new THREE.Group(); group.name = `shop_${type}`;
  const geos: THREE.BufferGeometry[] = [];
  const add = (g: THREE.BufferGeometry, m: THREE.Material, shadow: boolean) => { const mesh = new THREE.Mesh(g, m); mesh.castShadow = shadow && o.shadows !== false; mesh.receiveShadow = true; group.add(mesh); geos.push(g); };
  add(R.b.build(), M.body, true);
  const vBodies: THREE.BufferGeometry[] = [], vGlass: THREE.BufferGeometry[] = [];
  for (const v of R.veh) {
    const vg = buildVehicle(v.kind, { seed: v.seed, lod: 'near', driver: false, passengers: false }).group;
    const m = new THREE.Matrix4().compose(new THREE.Vector3(v.x, v.y, v.z), new THREE.Quaternion().setFromAxisAngle(UP, v.rotY), ONE);
    vg.traverse(o => {
      const mesh = o as THREE.Mesh; if (!mesh.isMesh) return;
      if (mesh.name === 'body') { const g = mesh.geometry.clone(); g.applyMatrix4(m); vBodies.push(g); }
      else if (mesh.name === 'glass') { const g = mesh.geometry.clone(); g.deleteAttribute('wheel'); g.applyMatrix4(m); vGlass.push(g); }
    });
  }
  const shopGlass = R.g.triangles ? R.g.build() : null;
  const glassParts = [...(shopGlass ? [shopGlass] : []), ...vGlass];
  if (glassParts.length) {
    const merged = glassParts.length > 1 ? mergeGeometries(glassParts.map(g => { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color', 'uv'].includes(k)) g.deleteAttribute(k); return g; }), false) : glassParts[0];
    if (merged) add(merged, M.glass, false);
    if (glassParts.length > 1) for (const g of glassParts) g.dispose();
  }
  if (vBodies.length) { const merged = mergeGeometries(vBodies, false); for (const g of vBodies) g.dispose(); if (merged) add(merged, vehicleMaterials().body, true); }
  if (R.furn.length) {
    const parts = R.furn.map(f => {
      const mesh = buildFurniture(f.id).group.children[0] as THREE.Mesh, g = mesh.geometry.clone();
      g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(f.x, 0, f.z), new THREE.Quaternion().setFromAxisAngle(UP, f.rotY), ONE));
      return g;
    });
    const merged = mergeGeometries(parts, false); for (const p of parts) p.dispose();
    if (merged) add(merged, furnitureMaterials().body, true);
  }

  // world placement
  const at = o.at ?? { x: 0, z: 0 }, y = at.y ?? 0, yaw = at.yaw ?? 0, c = Math.cos(yaw), s = Math.sin(yaw);
  group.position.set(at.x, y, at.z); group.rotation.y = yaw;
  const w = (x: number, z: number) => ({ x: at.x + x * c + z * s, z: at.z - x * s + z * c });
  const spot = (p: ShopSpot): ShopSpot => ({ ...w(p.x, p.z), yaw: p.yaw + yaw });
  const box = (q: ShopRect): ShopRect => {
    const ps = [w(q.x0, q.z0), w(q.x1, q.z0), w(q.x0, q.z1), w(q.x1, q.z1)];
    return { x0: Math.min(...ps.map(p => p.x)), x1: Math.max(...ps.map(p => p.x)), z0: Math.min(...ps.map(p => p.z)), z1: Math.max(...ps.map(p => p.z)) };
  };
  const space = o.space ?? 'street';
  const tris = geos.reduce((t, g) => t + g.attributes.position.count / 3, 0);
  return {
    type, group,
    colliders: R.cols.map(q => { const b = box(q); return { x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1, h: q.h }; }),
    seats: R.seats.map(st => ({ id: st.id, ...w(st.x, st.z), top: y + st.top, yaw: st.yaw + yaw, kind: st.kind, space, occupant: null })),
    anchors: {
      counter: spot(plan.counter), till: { ...spot(plan.till), y: y + plan.till.y }, keeper: spot(plan.keeper), staff: R.staff.map(spot),
      queue: plan.queue.map(spot), browse: R.browse.map(spot), door: spot(plan.door),
      ...(plan.lots ? { lots: plan.lots.map(l => ({ ...spot(l), card: spot(l.card) })) } : {}),
    },
    bounds: box(rect(-W / 2, W / 2, -D / 2, D / 2)),
    front: w(0, D / 2),
    budget: { drawCalls: group.children.length, tris },
    dispose() { group.removeFromParent(); for (const g of geos) g.dispose(); },
  };
}

/**
 * The pavement `out` m in front of a stocked shop's open front, found among the hub's stocked shops by its place key
 * (src/world/city.ts stores `userData.shop`); null when that shop is not stocked. Other lanes that placed things by a
 * shop's sheet use it now that the sheet stands at the counter inside (the old sheet stood 1.7 m out).
 */
export function stockedShopFront(root: THREE.Object3D, key: string, out = 1.7): { x: number; z: number } | null {
  const h = stockedShop(root, key);
  if (!h?.front) return null;
  const cx = (h.bounds.x0 + h.bounds.x1) / 2, cz = (h.bounds.z0 + h.bounds.z1) / 2, dx = h.front.x - cx, dz = h.front.z - cz, d = Math.hypot(dx, dz) || 1;
  return { x: h.front.x + (dx / d) * out, z: h.front.z + (dz / d) * out };
}

/** What a stocked shop keeps on its group (`userData.shop`: src/world/city.ts, src/world/builder.ts, src/game/shops.ts). */
export interface StockedShop { key: string; type: ShopType; anchors: ShopAnchors; bounds: ShopRect; front?: { x: number; z: number }; room?: boolean }
/** A hub's stocked shop by its key (its anchors: a showroom's lots, the salesman's desk…), or null. */
export function stockedShop(root: THREE.Object3D, key: string): StockedShop | null {
  let hit: StockedShop | null = null;
  root.traverse(o => { if (!hit && o.userData.shop?.key === key) hit = o.userData.shop as StockedShop; });
  return hit;
}

/** Draw-call-free check used by tests and the showroom: a local copy of a placed point (inverse of `at`). */
export function shopLocal(at: { x: number; z: number; yaw?: number }, p: { x: number; z: number }) {
  const yaw = at.yaw ?? 0, dx = p.x - at.x, dz = p.z - at.z, c = Math.cos(yaw), s = Math.sin(yaw);
  return { x: dx * c - dz * s, z: dx * s + dz * c };
}
