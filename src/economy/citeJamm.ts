import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Batch, signTexture } from '../world/batch';
import { addGrain } from '../world/grain';
import { generatedTexture } from '../world/textures';
import { HALF, PITCH, ROAD } from '../world/builder';
import type { Collider, HubWorld } from '../world/types';
import type { Seat } from '../interact/seats';
import { furnitureSpec } from './catalog';
import { furnitureModel } from './furnitureModels';
import { footprint, toHome, yawOf } from './placement';
import type { Placement } from '../core/types';

/**
 * The Cité Jàmm, an open block of Pikine across the street from the starter room (world/builder.ts reserves it): where
 * a player sees what can be owned. Keur Meubles (walk-in furniture showroom: pieces on display, some to try, the till),
 * the Résidence Jàmm (apartments), a family house, two plots for sale and a 4 × 3 billboard on the corner. Everything is
 * fictional. Static geometry is merged into a few draw calls; plots and the billboard change with their owner's choices
 * (estate.ts redraws them). Coordinates: (u, v) metres from the block's north-west corner, v = 46 faces the starter room.
 */
const BX = -HALF + ROAD + 1 * PITCH, BZ = -HALF + ROAD + 0 * PITCH;
const W = (u: number, v: number) => ({ x: BX + u, z: BZ + v });
const G = 0.12;
export const CITE_HUB = 'pikine';

export interface Spot { x: number; z: number }
export interface CiteJamm {
  /** Keur Meubles: the till (shop anchor), where the seller stands, the directory entry. */
  shop: { till: Spot; seller: Spot & { yaw: number }; entry: Spot };
  /** Street doors (exit spot), listing signs and directory entries of the homes on sale here. */
  homes: Record<string, { door: Spot; sign: Spot; entry: Spot; name: string }>;
  plots: Record<string, { sign: Spot; rect: { x0: number; z0: number; x1: number; z1: number }; group: THREE.Group; board: THREE.Mesh }>;
  billboard: { specId: string; sign: Spot; entry: Spot; panel: THREE.Mesh; lights: THREE.Group };
  plotsEntry: Spot;
  /** Seats to try in the showroom and the bench outside (street space). */
  seats: Seat[];
}

let mats: { plain: THREE.Material; block: THREE.Material; wood: THREE.Material } | null = null;
function materials() {
  if (mats) return mats;
  mats = {
    plain: addGrain(new THREE.MeshLambertMaterial({ vertexColors: true }), 1, 1),
    block: addGrain(new THREE.MeshLambertMaterial({ vertexColors: true }), 0.4, 1, false, generatedTexture('hollow_block'), 1.2, 0.02),
    wood: addGrain(new THREE.MeshLambertMaterial({ vertexColors: true }), 0.2, 1, false, generatedTexture('wood'), 1),
  };
  for (const m of Object.values(mats)) m.userData.shared = true;
  return mats;
}

/** Canvas sign as a lit-at-night panel (the hub's signs list dims and lights them with the sun). */
export function signPanel(tex: THREE.Texture, w: number, h: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0 }));
  return m;
}

/** Merges static models (display furniture) into one mesh per material: a dozen pieces cost a handful of draw calls. */
function mergeStatic(objects: THREE.Object3D[]): THREE.Mesh[] {
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const o of objects) {
    o.updateMatrixWorld(true);
    o.traverse(c => {
      const m = c as THREE.Mesh; if (!m.isMesh || Array.isArray(m.material)) return;
      let g = m.geometry.clone(); if (g.index) g = g.toNonIndexed();
      g.applyMatrix4(m.matrixWorld);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      const list = byMat.get(m.material) ?? []; list.push(g); byMat.set(m.material, list);
    });
  }
  const out: THREE.Mesh[] = [];
  for (const [mat, list] of byMat) {
    const keep = ['position', 'normal', 'uv', ...(list.every(g => g.attributes.color) ? ['color'] : [])];
    for (const g of list) for (const k of Object.keys(g.attributes)) if (!keep.includes(k)) g.deleteAttribute(k);
    const merged = mergeGeometries(list, false); if (!merged) continue;
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, mat); mesh.castShadow = true; mesh.receiveShadow = true; out.push(mesh);
    for (const g of list) g.dispose();
  }
  return out;
}

export function buildCiteJamm(hub: HubWorld, lite: boolean): CiteJamm {
  const M = materials();
  const plain = new Batch(), wood = new Batch(), fac = new Batch(), blocks = new Batch();
  const cols: Collider[] = [];
  const solid = (u0: number, v0: number, u1: number, v1: number, h: number) => cols.push({ x0: BX + u0, z0: BZ + v0, x1: BX + u1, z1: BZ + v1, h });
  const seats: Seat[] = [];
  const signs: THREE.Mesh[] = [];
  const sign = (text: string, bg: string, fg: string, u: number, y: number, v: number, w: number, h: number, yaw = 0) => {
    const m = signPanel(signTexture(text, bg, fg, text.length > 18 ? 768 : 512, 112), w, h); const p = W(u, v); m.position.set(p.x, y, p.z); m.rotation.y = yaw;
    hub.group.add(m); signs.push(m); return m;
  };
  const tree = (u: number, v: number, s = 1) => {
    const p = W(u, v);
    plain.cyl(0.22 * s, 0.3 * s, 2.6 * s, p.x, 0.1, p.z, 0x6e5a44, 6);
    for (let k = 0; k < 5; k++) { const a = k * 1.3, r = k ? 1.2 * s : 0; plain.blob(1.4 * s, p.x + Math.sin(a) * r, 3.4 * s, p.z + Math.cos(a) * r, [0x3f6e2e, 0x4c7d36, 0x365f28][k % 3], 0.75, 0); }
    cols.push({ x0: p.x - 0.3, z0: p.z - 0.3, x1: p.x + 0.3, z1: p.z + 0.3, h: 2.4 });
  };

  // ---------------------------------------------------------------- Keur Meubles: a walk-in showroom, open on the street
  {
    const c = W(9, 36.5);
    plain.box(14, 0.03, 9, c.x, G, c.z, 0xe9e1cf);                                         // tiled showroom floor
    for (let k = 0; k < 13; k++) plain.box(0.02, 0.031, 9, BX + 2.5 + k, G, c.z, 0xd8ccb4);
    const wallCol = 0xf0e6d2;
    plain.box(14, 3.6, 0.3, c.x, G, BZ + 32.15, wallCol); plain.box(0.3, 3.6, 9, BX + 2.15, G, c.z, wallCol); plain.box(0.3, 3.6, 9, BX + 15.85, G, c.z, wallCol);
    plain.box(14, 0.6, 0.32, c.x, G, BZ + 32.15, 0xb98a5a); plain.box(0.32, 0.6, 9, BX + 2.15, G, c.z, 0xb98a5a); plain.box(0.32, 0.6, 9, BX + 15.85, G, c.z, 0xb98a5a);
    plain.slab(14.6, 0.25, 9.8, c.x, G + 3.72, c.z + 0.2, 0xd2cdc2);                         // roof (overhang over the entrance)
    for (const u of [2.2, 15.8]) plain.box(0.3, 3.6, 0.3, BX + u, G, BZ + 41.2, 0xb98a5a);
    plain.box(14.6, 0.35, 0.3, c.x, G + 3.3, BZ + 41.25, 0xb98a5a);
    solid(2, 32, 16, 32.3, 3.6); solid(2, 32, 2.3, 41.35, 3.6); solid(15.7, 32, 16, 41.35, 3.6);
    sign('KEUR MEUBLES', '#3b2414', '#ffd98a', 9, G + 4.35, 41.45, 7.2, 0.95);
    sign('Simple · Confort · Prestige — livré chez toi', '#f4ead6', '#3b2414', 9, G + 2.95, 41.42, 6.6, 0.42);
    // the till: a counter near the entrance, the seller behind it
    plain.box(2.2, 1.0, 0.6, BX + 13.5, G, BZ + 36.0, 0x6e4426); plain.box(2.3, 0.05, 0.7, BX + 13.5, G + 1.0, BZ + 36.0, 0xd9cbb3);
    plain.box(0.3, 0.2, 0.25, BX + 12.9, G + 1.05, BZ + 36.0, 0x2b2b33);                   // till
    solid(12.4, 35.7, 14.6, 36.3, 1.1);
  }
  // display pieces: [catalogue id, u, v, quarter turns], set out room by room (LD2.0-C: the dining set, the kitchen and bathroom corners, the pictures,
  // the hanging lamps and the outdoor furniture on the forecourt). The seats of the sofas, armchair, chairs, dining set, garden set and bed can be tried.
  // The way in (u 7.5 … 11.5 from the door to the till) stays free: scripts/check-keur-meubles.mjs walks it.
  const display: [string, number, number, number][] = [
    // the living room: the sofa on its rug, the coffee table and a velvet pouf, the armchair, the crystal candelabra, the TV unit, the desk, a canvas
    // above the sofa and carved masks above the desk (the catalogue's second round: the pouf, the candelabra, the masks)
    ['canape_wax', 5.0, 32.85, 0], ['tapis_soie', 5.0, 34.6, 0], ['table_basse', 5.0, 34.5, 0], ['pouf_velours', 6.4, 34.5, 0], ['fauteuil_cuir', 7.6, 33.0, 0],
    ['candelabre_cristal', 8.5, 32.65, 0], ['meuble_tv', 10.0, 32.55, 0], ['bureau_bois', 11.9, 33.0, 0], ['armoire_bois', 14.8, 32.6, 0], ['toile_artiste', 5.0, 32.38, 0],
    ['masques_sculptes', 11.9, 32.345, 0],
    // the bedroom: the canopy bed with its voiles, its bedside table, a chest of drawers and the sous-verre above it; the reef tank on the east wall
    ['lit_baldaquin', 3.45, 38.2, 1], ['chevet_bois', 2.51, 36.95, 1], ['commode', 2.52, 34.4, 1], ['sous_verre', 2.32, 34.4, 1], ['aquarium_mer', 15.45, 34.6, 3],
    // the dining set under a woven hanging lamp
    ['salle_manger_bois', 9.5, 36.6, 0], ['suspension_osier', 9.5, 36.6, 0],
    // the kitchen corner: the cooker, a kitchen table and its stools, the microwave and the water dispenser
    ['cuisiniere', 2.6, 40.2, 1], ['table_cuisine_bois', 4.4, 40.0, 0], ['micro_ondes', 5.65, 40.3, 0], ['fontaine_eau', 6.45, 40.32, 0],
    // the bathroom corner on the east wall: a vanity, its lit mirror, a heated towel rail
    ['meuble_vasque', 15.46, 37.7, 3], ['miroir_lumineux', 15.63, 37.7, 3], ['seche_serviettes', 15.65, 38.65, 3],
    // out front: the bench and the planter, a deck chair, and the garden set under its parasol and a sun lounger on the forecourt
    ['banquette', 5.0, 42.7, 0], ['jardiniere', 11.0, 42.3, 0], ['transat', 2.9, 43.0, 0], ['salon_teck', 14.4, 43.5, 0], ['bain_soleil', 17.0, 43.4, 0],
    ['jarre_herbes', 6.25, 42.7, 0], ['lanternes_fer', 2.75, 41.6, 0],
    ...(lite ? [] : [['lampadaire_laiton', 2.8, 32.8, 0], ['palmier', 15.2, 40.4, 0], ['plante', 2.7, 36.0, 0], ['enceintes', 12.5, 39.8, 3],
      ['lustre', 5.0, 34.6, 0], ['vitrine', 13.35, 32.55, 0], ['lampadaire_arc', 6.6, 32.9, 3], ['ventilo_pied', 4.0, 36.6, 0], ['canari', 7.05, 40.6, 0]] as [string, number, number, number][]),
  ];
  const models: THREE.Object3D[] = [];
  display.forEach(([id, u, v, rot], n) => {
    const f = furnitureSpec(id); if (!f) return;
    const p = W(u, v), at: Placement = { x: p.x, z: p.z, rot };
    const lift = f.mount === 'ceiling' ? 3.72 - 0.03 - 2.8 : 0;                                // a hanging lamp hangs from the showroom's roof
    const g = furnitureModel(f); g.position.set(p.x, G + 0.03 + lift, p.z); g.rotation.y = yawOf(at); models.push(g);
    if (!f.flat && !f.mount) { const r = footprint(f, at); cols.push({ ...r, h: 1.0 }); }
    (f.seats ?? []).forEach((s, k) => { const [x, z] = toHome(at, s.x, s.z); seats.push({ id: `pikine:jamm:display:${n}:${k}`, x, z, top: s.top - 0.1 + G + 0.03, yaw: yawOf(at) + s.yaw, kind: s.kind, space: 'street', occupant: null }); });
  });
  for (const m of mergeStatic(models)) hub.group.add(m);
  for (const m of models) m.traverse(o => { const mesh = o as THREE.Mesh; if (mesh.isMesh && !mesh.userData.shared) mesh.geometry.dispose(); });   // kit geometry is cached

  // ---------------------------------------------------------------- Résidence Jàmm: four storeys of apartments
  {
    const c = W(31, 36), h = 4 * 3.2;
    fac.facade(14, h, 10, c.x, G - 0.02, c.z, 0xe8d8b8);
    plain.box(14.4, 0.3, 10.4, c.x, G + h - 0.02, c.z, 0xd2cdc2);
    for (const [w, d, du, dv] of [[14.4, 0.22, 0, -5.09], [14.4, 0.22, 0, 5.09], [0.22, 10.4, -7.09, 0], [0.22, 10.4, 7.09, 0]] as const) plain.box(w, 0.8, d, c.x + du, G + h + 0.26, c.z + dv, 0xd9c7a0);
    plain.box(14.1, 0.75, 10.1, c.x, G - 0.02, c.z, 0xb59f78);
    for (let f = 1; f < 4; f++) for (const du of [-4.6, 4.6]) {                               // balconies on the street side
      plain.slab(3, 0.15, 1.1, c.x + du, G + f * 3.2, BZ + 41.55, 0xd2cdc2);
      for (let k = 0; k < 6; k++) plain.box(0.05, 0.9, 0.05, c.x + du - 1.4 + k * 0.56, G + f * 3.2 + 0.07, BZ + 42.05, 0x333333);
      plain.box(3, 0.06, 0.06, c.x + du, G + f * 3.2 + 0.97, BZ + 42.05, 0x333333);
    }
    plain.box(2.2, 2.6, 0.08, c.x, G, BZ + 41.03, 0x2b2622);                                 // entrance recess
    plain.box(1.4, 2.4, 0.1, c.x, G, BZ + 41.06, 0x1e6fd9);                                  // blue metal door
    plain.box(0.1, 0.06, 0.12, c.x - 0.5, G + 1.1, BZ + 41.14, 0xd4b24a);
    plain.slab(2.8, 0.12, 1.3, c.x, G + 2.8, BZ + 41.6, 0xd2cdc2);                          // canopy
    solid(24, 31, 38, 41.1, h);
    sign('RÉSIDENCE JÀMM', '#1f3a5f', '#fde68a', 31, G + 3.35, 41.2, 4.6, 0.62);
    sign('APPARTEMENTS · À LOUER · À VENDRE', '#c2410c', '#fff7e0', 31, G + 7.9, 41.08, 8.4, 0.9);
  }
  // ---------------------------------------------------------------- the family house at the back of the cité: a modern two-storey Dakar house behind its wall
  // (the owner's references, 27 Oct: a rendered villa in sand and ochre, balconies with glass railings and corbels, a black ornamental door under a small red-tile
  // canopy on blue steps, a plinth, cornices and pilasters, a flat roof with its rebar stubs, a water tank; a low wall under black wrought-iron panels with a gate)
  {
    const X = (u: number) => BX + u, Zv = (v: number) => BZ + v;
    const U0 = 29, U1 = 41, V0 = 5.8, VF = 14.6, H1 = 3.3, H = 6.6, YW = 21.6;      // the body (u 29…41, v 5.8…14.6), its ground floor, its height, the wall's line
    const cx = X((U0 + U1) / 2), cz = Zv((V0 + VF) / 2), fz = Zv(VF);
    const SAND = 0xedd6a6, SAND_D = 0xd2b47f, CREAM = 0xf8eed6, WHITE = 0xf4f1ea, IRON = 0x1c1c20, GLASS = 0x6d93a8, GLASS_L = 0x9fc4d4, TILE = 0xc4552e, BLUE = 0x2f64b3;
    plain.box(12, H, 8.8, cx, G - 0.02, cz, SAND);
    plain.box(12.2, 0.8, 9.0, cx, G - 0.02, cz, SAND_D);                                       // the plinth
    plain.box(12.2, 0.2, 0.2, cx, G + H1 - 0.12, fz + 0.06, CREAM);                              // the band between the floors
    for (const [u, w] of [[U0 + 0.1, 0.5], [U1 - 0.1, 0.5], [33, 0.35], [37, 0.35]] as const) plain.box(w, H, 0.22, X(u), G - 0.02, fz + 0.06, SAND_D);   // pilasters
    // the roof: a slab, a parapet with a raised middle, a cornice, the rebar left standing for the next floor, a water tank on its stand, an aerial
    plain.box(12.6, 0.25, 9.2, cx, G + H - 0.02, cz, 0xd3ccbd);
    for (const [w, d, du, dv] of [[12.6, 0.24, 0, -4.48], [12.6, 0.24, 0, 4.48], [0.24, 9.2, -6.18, 0], [0.24, 9.2, 6.18, 0]] as const) plain.box(w, 0.55, d, cx + du, G + H + 0.23, cz + dv, SAND);
    plain.box(12.7, 0.3, 0.4, cx, G + H - 0.28, fz + 0.14, CREAM);
    plain.box(4.4, 0.9, 0.26, X(35), G + H + 0.78, fz + 0.04, SAND); plain.box(4.7, 0.12, 0.38, X(35), G + H + 1.68, fz + 0.06, CREAM);
    for (let k = 0; k < 8; k++) plain.box(0.04, 1.1 + (k % 3) * 0.12, 0.04, X(29.9 + k * 0.4), G + H + 0.23, Zv(6.4), 0x3b2f27);
    for (const sx of [-0.55, 0.55]) for (const sz of [-0.55, 0.55]) plain.box(0.07, 0.9, 0.07, X(38.6) + sx, G + H + 0.23, Zv(8.6) + sz, 0x3a3f44);
    plain.cyl(0.8, 0.8, 1.25, X(38.6), G + H + 1.13, Zv(8.6), 0x20365c, 12);
    plain.box(0.04, 2.2, 0.04, X(30.4), G + H + 0.23, Zv(7.2), 0x3a3f44); plain.box(0.9, 0.04, 0.04, X(30.4), G + H + 2.1, Zv(7.2), 0x3a3f44);
    // a window: white frame, tinted glass, a mullion and a sill; the ground floor's with a black iron grille
    const win = (u: number, y0: number, w: number, h: number, grille: boolean) => {
      plain.box(w + 0.3, h + 0.3, 0.1, X(u), G + y0 - 0.15, fz + 0.03, WHITE);
      plain.box(w, h, 0.06, X(u), G + y0, fz + 0.09, GLASS); plain.box(0.05, h, 0.07, X(u), G + y0, fz + 0.1, WHITE);
      plain.box(w + 0.5, 0.1, 0.3, X(u), G + y0 - 0.22, fz + 0.12, CREAM);
      if (grille) for (let k = 0; k < Math.round(w / 0.28); k++) plain.box(0.025, h, 0.03, X(u - w / 2 + 0.14 + k * 0.28), G + y0, fz + 0.16, IRON);
    };
    // a balcony: a slab with a glass railing in white rails, corbels under it
    const balcony = (u0: number, u1: number, depth: number) => {
      const w = u1 - u0, m = X((u0 + u1) / 2), y = G + H1;
      plain.box(w, 0.2, depth, m, y - 0.02, fz + depth / 2, CREAM);
      plain.box(w - 0.1, 0.95, 0.04, m, y + 0.18, fz + depth - 0.04, GLASS_L);
      plain.box(w, 0.06, 0.08, m, y + 1.1, fz + depth - 0.04, WHITE); plain.box(w, 0.06, 0.08, m, y + 0.14, fz + depth - 0.04, WHITE);
      for (const sx of [-1, 1]) { plain.box(0.06, 1.0, 0.06, m + sx * (w / 2 - 0.03), y + 0.18, fz + depth - 0.04, WHITE); plain.box(0.04, 0.95, depth - 0.1, m + sx * (w / 2 - 0.05), y + 0.18, fz + depth / 2, GLASS_L); }
      for (const sx of [-1, 1]) plain.box(0.28, 0.5, 0.65, m + sx * (w / 2 - 0.4), y - 0.5, fz + 0.4, CREAM);
    };
    balcony(U0 + 0.8, 33 - 0.5, 1.2); balcony(33.5, 36.6, 1.6); balcony(37.6, U1 - 0.7, 1.3);
    win(31, H1 + 0.75, 1.6, 1.7, false); win(35, H1 + 0.55, 1.5, 2.1, false); win(39.2, H1 + 0.75, 1.6, 1.7, false);
    win(35, 1.15, 1.7, 1.25, true); win(39.2, 1.15, 1.7, 1.25, true);
    // the entrance (u 31): a black door with ornamental panels in a cream frame, blue steps, a small canopy of red tiles on two iron brackets, a lantern
    plain.box(1.7, 2.6, 0.12, X(31), G - 0.02, fz + 0.04, CREAM);
    plain.box(1.35, 2.3, 0.12, X(31), G + 0.06, fz + 0.1, IRON);
    for (const dy of [0.5, 1.5]) for (const du of [-0.33, 0.33]) plain.box(0.4, 0.6, 0.02, X(31) + du, G + 0.06 + dy - 0.1, fz + 0.17, 0x3a3a42);
    plain.box(0.1, 0.06, 0.12, X(31) - 0.5, G + 1.1, fz + 0.2, 0xd4b24a);
    plain.box(2.2, 0.1, 0.55, X(31), G, fz + 0.5, BLUE); plain.box(1.8, 0.1, 0.4, X(31), G + 0.1, fz + 0.42, BLUE);
    plain.slab(2.7, 0.1, 1.3, X(31), G + 2.78, fz + 0.65, TILE, 0, -0.12);
    for (let k = 0; k < 5; k++) plain.box(2.7, 0.03, 0.05, X(31), G + 2.86 - k * 0.0, fz + 0.2 + k * 0.24, 0xa5421f);
    for (const sx of [-1.2, 1.2]) plain.box(0.05, 0.4, 0.05, X(31) + sx, G + 2.45, fz + 0.1, IRON);
    plain.box(0.18, 0.3, 0.18, X(32.45), G + 2.0, fz + 0.14, 0xf6ecb8);
    // the yard behind its wall: paving, a pale path from the gate to the door, pots with bougainvillea, a young neem
    plain.flat(12.4, 6.6, X(35), G + 0.03, Zv(18.1), 0xcdbfa6);
    plain.flat(1.6, 6.6, X(31), G + 0.04, Zv(18.1), 0xe9e1cf);
    for (const u of [29.5, 40.5]) { const p = W(u, 20.4); plain.cyl(0.35, 0.3, 0.6, p.x, G, p.z, 0xb5452b, 10); plain.blob(0.5, p.x, G + 0.95, p.z, 0xd94a8c, 0.8, 0); cols.push({ x0: p.x - 0.4, z0: p.z - 0.4, x1: p.x + 0.4, z1: p.z + 0.4, h: 1 }); }
    tree(38.6, 18.2, 0.62);
    // the wall: a rendered base with a cream cap, black wrought-iron panels with discs between pilasters, the gate (u 30.1…31.9) open, its leaves swung back
    const pil = (u: number) => { plain.box(0.4, 2.1, 0.4, X(u), G - 0.02, Zv(YW), SAND); plain.box(0.52, 0.1, 0.52, X(u), G + 2.08, Zv(YW), CREAM); plain.box(0.2, 0.2, 0.2, X(u), G + 2.18, Zv(YW), SAND_D); };
    const panel = (u0: number, u1: number) => {
      const w = u1 - u0, m = X((u0 + u1) / 2);
      plain.box(w, 0.9, 0.3, m, G - 0.02, Zv(YW), SAND); plain.box(w, 0.08, 0.36, m, G + 0.88, Zv(YW), CREAM);
      plain.box(w - 0.4, 1.0, 0.05, m, G + 0.96, Zv(YW) + 0.05, IRON); plain.box(w - 0.4, 0.06, 0.07, m, G + 1.94, Zv(YW) + 0.05, IRON);
      const n = Math.max(1, Math.round((w - 0.4) / 0.95));
      for (let k = 0; k < Math.floor((w - 0.5) / 0.2); k++) plain.box(0.025, 0.95, 0.03, m - (w - 0.5) / 2 + 0.1 + k * 0.2, G + 0.97, Zv(YW) + 0.09, 0x3d3d45);   // the bars
      for (let k = 0; k < n; k++) { const dx = m - (w - 0.4) / 2 + ((k + 0.5) * (w - 0.4)) / n; plain.cyl(0.27, 0.27, 0.03, dx, G + 1.1, Zv(YW) + 0.11, 0xc2a76b, 12, [Math.PI / 2, 0, 0]); plain.cyl(0.19, 0.19, 0.03, dx, G + 1.1, Zv(YW) + 0.125, 0x1c1c20, 12, [Math.PI / 2, 0, 0]); }   // ornamental discs
      cols.push({ x0: m - w / 2, z0: Zv(YW) - 0.2, x1: m + w / 2, z1: Zv(YW) + 0.2, h: 1.9 });
    };
    for (const u of [28.8, 30.1, 31.9, 35.1, 38.3, 41.2]) pil(u);
    panel(28.8, 30.1); panel(31.9, 35.1); panel(35.1, 38.3); panel(38.3, 41.2);
    for (const u of [30.3, 31.7]) plain.box(0.06, 1.8, 0.85, X(u), G + 0.1, Zv(YW - 0.55), IRON);                    // the gate's two leaves, swung back along the wall
    for (const u of [28.6, 41.4]) { plain.box(0.3, 1.9, 6.9, X(u), G - 0.02, Zv(18.1), SAND); plain.box(0.4, 0.08, 6.9, X(u), G + 1.88, Zv(18.1), CREAM); cols.push({ x0: X(u) - 0.2, z0: Zv(14.65), x1: X(u) + 0.2, z1: Zv(YW), h: 1.9 }); }
    cols.push({ x0: X(U0), z0: Zv(V0), x1: X(U1), z1: Zv(VF + 0.05), h: H });
    sign('MAISON · JÀMM', '#5a3a1e', '#fff1d0', 29.45, G + 0.5, YW + 0.2, 1.1, 0.3);
  }
  // ---------------------------------------------------------------- plots: stakes and string, a board on two posts
  const plots: CiteJamm['plots'] = {};
  const plot = (id: string, u0: number, v0: number, u1: number, v1: number, label: string) => {
    const a = W(u0, v0), b = W(u1, v1), su = (u0 + u1) / 2, sv = v1 + 0.3, sp = W(su, sv);
    plain.flat(u1 - u0, v1 - v0, (a.x + b.x) / 2, G + 0.03, (a.z + b.z) / 2, 0xd4b88c);
    for (const [x, z] of [[a.x, a.z], [b.x, a.z], [a.x, b.z], [b.x, b.z]]) { plain.cyl(0.05, 0.05, 1.0, x, G, z, 0xd9322b, 6); plain.cyl(0.055, 0.055, 0.2, x, G + 0.6, z, 0xf2f2ec, 6); }
    for (const [w, d, x, z] of [[b.x - a.x, 0.02, (a.x + b.x) / 2, a.z], [b.x - a.x, 0.02, (a.x + b.x) / 2, b.z], [0.02, b.z - a.z, a.x, (a.z + b.z) / 2], [0.02, b.z - a.z, b.x, (a.z + b.z) / 2]] as const) plain.box(w, 0.02, d, x, G + 0.85, z, 0xf2f2ec);
    for (const du of [-0.7, 0.7]) wood.box(0.1, 2.2, 0.1, sp.x + du, G, sp.z, 0x6b4a2e);
    cols.push({ x0: sp.x - 0.85, z0: sp.z - 0.1, x1: sp.x + 0.85, z1: sp.z + 0.1, h: 2.2 });
    const board = signPanel(signTexture(label, '#f4ead6', '#7c2d12', 512, 320), 1.6, 1.0); board.position.set(sp.x, G + 1.75, sp.z + 0.07); hub.group.add(board); signs.push(board);
    const group = new THREE.Group(); hub.group.add(group);
    plots[id] = { sign: W(su, sv + 1.25), rect: { x0: a.x, z0: a.z, x1: b.x, z1: b.z }, group, board };
  };
  plot('parcelle_150', 2, 4, 12, 19, 'À VENDRE · 150 m²');
  plot('parcelle_300', 13, 4, 28, 24, 'À VENDRE · 300 m²');
  // ---------------------------------------------------------------- the billboard on the corner, facing the crossroads
  const bb = W(42, 44), yaw = 0.35, fx = Math.sin(yaw), fz = Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
  for (const s of [-1.5, 1.5]) { const x = bb.x + rx * s, z = bb.z + rz * s; plain.box(0.25, 3.3, 0.25, x, G, z, 0x5c6266, yaw); cols.push({ x0: x - 0.2, z0: z - 0.2, x1: x + 0.2, z1: z + 0.2, h: 3 }); }
  plain.box(4.4, 3.3, 0.18, bb.x - fx * 0.05, G + 3.2, bb.z - fz * 0.05, 0x3a3f44, yaw);
  plain.box(4.4, 0.08, 0.6, bb.x + fx * 0.25, G + 3.1, bb.z + fz * 0.25, 0x5c6266, yaw);          // service walkway
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(4, 3), new THREE.MeshLambertMaterial({ emissive: 0xffffff, emissiveIntensity: 0 }));
  panel.position.set(bb.x + fx * 0.05, G + 4.85, bb.z + fz * 0.05); panel.rotation.y = yaw; hub.group.add(panel); signs.push(panel);
  const lights = new THREE.Group();
  for (const s of [-1.2, 1.2]) { const lb = new Batch(); lb.box(0.25, 0.15, 0.25, bb.x + rx * s + fx * 0.9, G + 6.55, bb.z + rz * s + fz * 0.9, 0x222222, yaw); const m = lb.build(M.plain, false, false); if (m) lights.add(m); }
  lights.visible = false; hub.group.add(lights);
  // ---------------------------------------------------------------- the shop's loading bay at the kerb (src/world/builder.ts citeFronts keeps it free of
  // parked cars and street furniture): a painted yellow box with its hatching, LIVRAISON on the asphalt, and a board on the pavement that a driver reads
  const bay = hub.keepClear?.find(r => r.why === 'loading_bay');
  if (bay) {
    const cx = (bay.x0 + bay.x1) / 2, cz = (bay.z0 + bay.z1) / 2, w = bay.x1 - bay.x0 - 0.3, d = bay.z1 - bay.z0 - 0.2, Y = 0.088, YEL = 0xf2c230;
    plain.flat(w, 0.16, cx, Y, bay.z1 - 0.18, YEL); plain.flat(0.16, d, bay.x0 + 0.23, Y, cz, YEL); plain.flat(0.16, d, bay.x1 - 0.23, Y, cz, YEL);
    for (let k = 0; k < 5; k++) plain.flat(0.14, d * 1.25, bay.x0 + 0.8 + k * 0.45, Y, cz, YEL, 0.65);            // the hatching at the bay's west end
    const word = signPanel(signTexture('LIVRAISON', '#4d4f55', '#f2c230', 512, 112), 4.2, 0.92);
    word.rotation.x = -Math.PI / 2; word.position.set(cx + 1.4, Y + 0.004, cz + 0.05); hub.group.add(word);
    const b = { x: bay.x1 + 0.9, z: bay.z0 - 0.75 };                                                               // the board, on the pavement past the bay's east end
    for (const dx of [-0.62, 0.62]) plain.box(0.08, 2.5, 0.08, b.x + dx, G, b.z, 0x3b2414);
    cols.push({ x0: b.x - 0.7, z0: b.z - 0.08, x1: b.x + 0.7, z1: b.z + 0.08, h: 2.5 });
    sign('KEUR MEUBLES', '#3b2414', '#ffd98a', b.x - BX, G + 2.15, b.z - BZ + 0.05, 1.5, 0.5);
    sign('Livraison · arrêt 10 min', '#f2c230', '#3b2414', b.x - BX, G + 1.72, b.z - BZ + 0.05, 1.5, 0.3);
  }
  // ---------------------------------------------------------------- shade and a bench by the street
  tree(1.6, 44.4, 1); tree(45, 28, 1.1); tree(20.5, 28.5, 0.9);
  {
    const p = W(19.6, 44.6);
    wood.box(3.0, 0.1, 0.6, p.x, 0.46, p.z, 0x8c6542); wood.box(3.0, 0.45, 0.08, p.x, 0.55, p.z - 0.28, 0x8c6542);
    for (const s of [-1.3, 1.3]) plain.box(0.14, 0.4, 0.55, p.x + s, G, p.z, 0x253d43);
    cols.push({ x0: p.x - 1.5, z0: p.z - 0.35, x1: p.x + 1.5, z1: p.z + 0.35, h: 0.7 });
    for (let k = 0; k < 3; k++) seats.push({ id: `pikine:jamm:bench:${k}`, x: p.x - 1 + k, z: p.z, top: 0.58, yaw: 0, kind: 'bench', space: 'street', occupant: null });
  }

  for (const [b, m, cast] of [[plain, M.plain, true], [wood, M.wood, true], [blocks, M.block, true], [fac, hub.facadeMat, true]] as [Batch, THREE.Material, boolean][]) {
    const mesh = b.build(m, true, cast); if (mesh) hub.group.add(mesh);
  }
  hub.colliders.push(...cols);
  hub.signs.push(...signs);
  return {
    shop: { till: W(13.5, 37.6), seller: { ...W(13.5, 35.15), yaw: 0 }, entry: W(9, 43.4) },
    homes: {
      appart_jamm: { door: W(31, 42.3), sign: W(31, 42.2), entry: W(28, 43.5), name: 'Résidence Jàmm · appartements' },
      maison_cite: { door: W(31, 16.2), sign: W(31, 16.0), entry: W(31, 23.4), name: 'Maison · Cité Jàmm' },
    },
    plots, billboard: { specId: 'panneau_jamm', sign: W(42.4, 45.3), entry: W(39.5, 45.6), panel, lights }, plotsEntry: W(20.5, 26.3), seats,
  };
}

// ---------------------------------------------------------------- dynamic visuals (estate.ts redraws them on change)
const ADS: [string, string, string, string][] = [
  ['BANQUE TERANGA', 'Ton projet commence ici', '#0c4a6e', '#fde68a'],
  ['JUS & GO', 'Bissap, bouye, gingembre : frais !', '#be123c', '#fff7e0'],
  ['DAKAR LIFE MALL', 'Ouvert tous les jours', '#1f2937', '#fbbf24'],
  ['NDAR TECH', 'Le téléphone qui suit ta vie', '#14532d', '#d9f99d'],
  ['KEUR MEUBLES', 'Ta maison, ton style', '#3b2414', '#ffd98a'],
];
/** Billboard face: to let, an advertiser's poster (fictional brands of the game), or the player's own ad. */
export function billboardTexture(state: 'vacant' | 'leased' | 'own', day: number, own = ''): THREE.CanvasTexture {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 384;
  const c = cv.getContext('2d')!;
  const [title, line, bg, fg] = state === 'vacant' ? ['ESPACE À LOUER', 'Panneau 4 × 3 · Cité Jàmm', '#f4ead6', '#c2410c']
    : state === 'own' ? [own.toUpperCase() || 'TON AFFAIRE', 'Viens nous voir à Pikine !', '#7c2d12', '#fde68a'] : ADS[((day % ADS.length) + ADS.length) % ADS.length];
  c.fillStyle = bg; c.fillRect(0, 0, 512, 384);
  c.fillStyle = fg; c.fillRect(0, 300, 512, 84);
  c.fillStyle = fg; c.textAlign = 'center'; c.textBaseline = 'middle';
  let size = 72; c.font = `900 ${size}px system-ui, sans-serif`;
  while (c.measureText(title).width > 470 && size > 24) { size -= 4; c.font = `900 ${size}px system-ui, sans-serif`; }
  c.fillText(title, 256, 150);
  c.fillStyle = bg; c.font = '700 30px system-ui, sans-serif'; c.fillText(line, 256, 342);
  if (state === 'vacant') { c.strokeStyle = fg; c.lineWidth = 10; c.strokeRect(14, 14, 484, 272); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
/** Plot board text by state. */
export function plotBoardTexture(label: string, sub: string): THREE.CanvasTexture {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 320;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#f4ead6'; c.fillRect(0, 0, 512, 320); c.strokeStyle = '#7c2d12'; c.lineWidth = 10; c.strokeRect(8, 8, 496, 304);
  c.fillStyle = '#7c2d12'; c.textAlign = 'center'; c.textBaseline = 'middle';
  let size = 64; c.font = `900 ${size}px system-ui, sans-serif`;
  while (c.measureText(label).width > 460 && size > 20) { size -= 4; c.font = `900 ${size}px system-ui, sans-serif`; }
  c.fillText(label, 256, 125); c.font = '700 36px system-ui, sans-serif'; c.fillText(sub, 256, 220);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
/** What stands on a plot: bare, vegetable beds (let to a market gardener), a block wall with a gateway (upgrade). Returns the wall's colliders. */
export function dressPlot(group: THREE.Group, rect: { x0: number; z0: number; x1: number; z1: number }, leased: boolean, wall: boolean): Collider[] {
  for (const c of [...group.children]) { group.remove(c); (c as THREE.Mesh).geometry?.dispose(); }
  const b = new Batch(), M = materials();
  if (leased) {
    const rows = Math.floor((rect.x1 - rect.x0 - 1) / 1.2);
    for (let k = 0; k < rows; k++) {
      const x = rect.x0 + 1 + k * 1.2;
      b.box(0.7, 0.12, rect.z1 - rect.z0 - 2.4, x, G, (rect.z0 + rect.z1) / 2 - 0.4, 0x6b4a2e);
      for (let z = rect.z0 + 1.4; z < rect.z1 - 1.8; z += 0.6) b.blob(0.2, x, G + 0.22, z, (k + Math.round(z)) % 3 ? 0x3f8a35 : 0x5aa84f, 0.7, 0);
    }
    b.cyl(0.3, 0.32, 0.5, rect.x1 - 0.8, G, rect.z0 + 0.8, 0x2a6fb3, 10);                    // watering barrel
  }
  const cols: Collider[] = [];
  const wb = new Batch();
  if (wall) {
    const w = rect.x1 - rect.x0, d = rect.z1 - rect.z0, cx = (rect.x0 + rect.x1) / 2, cz = (rect.z0 + rect.z1) / 2, side = w / 2 - 1.6;
    const seg = (sw: number, sd: number, x: number, z: number) => { wb.box(sw, 1.2, sd, x, G, z, 0xe8e2d6); cols.push({ x0: x - sw / 2, z0: z - sd / 2, x1: x + sw / 2, z1: z + sd / 2, h: 1.2 }); };
    seg(w, 0.2, cx, rect.z0); seg(0.2, d, rect.x0, cz); seg(0.2, d, rect.x1, cz);
    seg(side, 0.2, rect.x0 + side / 2, rect.z1); seg(side, 0.2, rect.x1 - side / 2, rect.z1);   // a 3.2 m gateway faces the board
    for (const sx of [-1.6, 1.6]) b.box(0.3, 1.6, 0.3, cx + sx, G, rect.z1, 0x2f8f4e);          // gate posts (painted green)
  }
  const mesh = b.build(M.plain, true, true); if (mesh) group.add(mesh);
  const walls = wb.build(M.block, true, true); if (walls) group.add(walls);
  return cols;
}
