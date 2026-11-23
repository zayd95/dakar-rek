import * as THREE from 'three';
import { Batch } from '../world/batch';
import { addGrain } from '../world/grain';
import { generatedTexture } from '../world/textures';
import { waxTexture } from '../world/interiors';
import type { FurnitureSpec, FurnitureType, Grade } from './catalog';

/**
 * Furniture models by catalogue id, behind one lookup. These are simple models built from primitives (the starter pieces
 * keep the geometry they had in the starter room); the 3D asset lane's kit (src/world/furnitureKit.ts, basic / better /
 * premium tiers) replaces them piece by piece through `setFurnitureKit` at integration, with no other change.
 * Contract: the piece stands centred on the origin, its base at y = 0, facing +z (its back towards −z), within its
 * catalogue footprint (w along x, d along z). Materials are shared (`userData.shared`): disposing a room keeps them.
 */
export type FurnitureKit = (id: string, type: FurnitureType, grade: Grade) => THREE.Object3D | null;
let kit: FurnitureKit | null = null;
/** Integration seam for the 3D asset lane: a kit returning a model (or null to keep the built-in one). */
export function setFurnitureKit(k: FurnitureKit | null) { kit = k; }

let mats: Record<'plain' | 'wood' | 'metal' | 'glow' | 'glass', THREE.Material> | null = null;
function materials() {
  if (mats) return mats;
  const lam = () => new THREE.MeshLambertMaterial({ vertexColors: true });
  mats = {
    plain: addGrain(lam(), 0.5, 2),
    wood: addGrain(lam(), 0.2, 1, false, generatedTexture('wood'), 1),
    metal: addGrain(lam(), 0.2, 1),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
    glass: new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x223344, emissiveIntensity: 0.4 }),
  };
  for (const m of Object.values(mats)) m.userData.shared = true;
  return mats;
}
const fabrics = new Map<string, THREE.Material>();
/** Wax-print fabric (own designs), one shared material per colour set. */
function fabric(a: string, b: string, c: string): THREE.Material {
  const key = a + b + c;
  let m = fabrics.get(key);
  if (!m) { m = new THREE.MeshLambertMaterial({ map: waxTexture(a, b, c) }); m.userData.shared = true; fabrics.set(key, m); }
  return m;
}

/** The model of a catalogue piece: the kit's when it has one, else the built-in one. */
export function furnitureModel(f: FurnitureSpec): THREE.Object3D {
  const fromKit = kit?.(f.id, f.type, f.grade);
  const g = fromKit ?? build(f);
  g.userData.furniture = f.id;
  return g;
}

/** Collects the pieces of a model, by material, then builds them into a group. */
class Parts {
  plain = new Batch(); wood = new Batch(); metal = new Batch(); glow = new Batch(); glass = new Batch();
  extra: THREE.Object3D[] = [];
  /** A box covered with a wax-print fabric (cushions, sheets, rugs). */
  cloth(w: number, h: number, d: number, x: number, y: number, z: number, cols: [string, string, string]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), fabric(...cols)); m.position.set(x, y + h / 2, z); m.castShadow = true; m.receiveShadow = true; this.extra.push(m);
  }
  rug(w: number, d: number, cols: [string, string, string]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), fabric(...cols)); m.rotation.x = -Math.PI / 2; m.position.y = 0.008; m.receiveShadow = true; this.extra.push(m);
  }
  group(): THREE.Group {
    const M = materials(), g = new THREE.Group();
    for (const [b, m, cast] of [[this.plain, M.plain, true], [this.wood, M.wood, true], [this.metal, M.metal, true], [this.glow, M.glow, false], [this.glass, M.glass, false]] as [Batch, THREE.Material, boolean][]) {
      const mesh = b.build(m, true, cast); if (mesh) g.add(mesh);
    }
    for (const e of this.extra) g.add(e);
    return g;
  }
}

/** Monobloc plastic chair facing +z (seat top 0.43 above the floor). */
function monobloc(p: Parts, x: number, col: number) {
  p.plain.box(0.46, 0.05, 0.44, x, 0.38, 0, col);
  for (const [dx, dz] of [[-0.2, -0.18], [0.2, -0.18], [-0.2, 0.18], [0.2, 0.18]]) p.plain.box(0.04, 0.46, 0.04, x + dx, -0.05, dz, col);
  p.plain.box(0.46, 0.42, 0.04, x, 0.43, -0.2, col);
}
const WAX_A: [string, string, string] = ['#c2417f', '#f4c20d', '#1a9d54'];
const WAX_B: [string, string, string] = ['#1f5aa8', '#f4c20d', '#f2f2ec'];
const WAX_C: [string, string, string] = ['#e8742c', '#1f3a5f', '#f2e6c8'];

function build(f: FurnitureSpec): THREE.Group {
  const p = new Parts(), W = f.w, D = f.d;
  switch (f.id) {
    // ---------------------------------------------------------------- chairs
    case 'chaises': monobloc(p, -0.29, 0x2a8fd1); monobloc(p, 0.29, 0xf2f2ee); break;
    case 'chaise_plastique': monobloc(p, 0, 0x1a9d54); break;
    case 'chaise_bois': {
      const c = 0x7a4a26;
      p.wood.box(0.46, 0.05, 0.44, 0, 0.35, 0, c);
      for (const [dx, dz] of [[-0.2, -0.18], [0.2, -0.18], [-0.2, 0.18], [0.2, 0.18]]) p.wood.box(0.05, 0.35, 0.05, dx, 0, dz, c);
      for (const dx of [-0.2, 0.2]) p.wood.box(0.05, 0.55, 0.05, dx, 0.4, -0.2, c);
      for (let k = 0; k < 3; k++) p.wood.box(0.4, 0.05, 0.03, 0, 0.5 + k * 0.15, -0.2, 0x8b5a32);
      break;
    }
    case 'fauteuil_cuir': {
      const leather = 0x8b4a22, dark = 0x4a2a14;
      for (const [dx, dz] of [[-0.35, -0.3], [0.35, -0.3], [-0.35, 0.3], [0.35, 0.3]]) p.wood.box(0.06, 0.1, 0.06, dx, 0, dz, dark);
      p.plain.box(0.85, 0.16, 0.78, 0, 0.1, 0, leather);
      p.plain.box(0.62, 0.1, 0.6, 0, 0.26, 0.06, 0x9a5428);                   // seat cushion (top 0.36)
      for (const sx of [-1, 1]) p.plain.box(0.12, 0.3, 0.76, sx * 0.365, 0.26, 0, leather);
      p.plain.box(0.85, 0.56, 0.16, 0, 0.26, -0.31, leather);
      break;
    }
    // ---------------------------------------------------------------- sofas
    case 'banquette': {
      const c = 0x6b4a2e;
      p.wood.box(W, 0.3, D, 0, 0, 0, c);
      p.wood.box(W, 0.5, 0.08, 0, 0.3, -D / 2 + 0.04, c);
      for (const sx of [-1, 1]) p.wood.box(0.08, 0.22, D, sx * (W / 2 - 0.04), 0.3, 0, c);
      p.cloth(W - 0.2, 0.08, D - 0.15, 0, 0.3, 0.05, WAX_A);               // seat cushion (top 0.38)
      p.cloth(0.5, 0.3, 0.12, -0.4, 0.38, -D / 2 + 0.14, WAX_B); p.cloth(0.5, 0.3, 0.12, 0.4, 0.38, -D / 2 + 0.14, WAX_C);
      break;
    }
    case 'canape_wax': case 'canape_cuir': {
      const leather = f.id === 'canape_cuir', body = leather ? 0x3d2416 : 0x2f5d7c;
      if (leather) {
        p.plain.box(W, 0.26, D, 0, 0.06, 0, body);
        p.plain.box(W - 0.3, 0.1, D - 0.25, 0, 0.26, 0.08, 0x4a2c1a);       // seat (top 0.36)
        p.plain.box(W, 0.6, 0.22, 0, 0.26, -D / 2 + 0.11, body);
        for (const sx of [-1, 1]) p.plain.box(0.15, 0.36, D, sx * (W / 2 - 0.075), 0.26, 0, body);
        for (let k = 0; k < 7; k++) for (let r = 0; r < 2; r++) p.plain.sphere(0.018, -W / 2 + 0.3 + k * (W - 0.6) / 6, 0.5 + r * 0.18, -D / 2 + 0.225, 0x2a180e);   // tufting
        for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.metal.box(0.05, 0.06, 0.05, dx * (W / 2 - 0.1), 0, dz * (D / 2 - 0.1), 0xc9a14a);
      } else {
        p.plain.box(W, 0.26, D, 0, 0.05, 0, body);
        p.cloth(W - 0.3, 0.1, D - 0.25, 0, 0.26, 0.08, WAX_B);              // seat (top 0.36)
        p.plain.box(W, 0.55, 0.2, 0, 0.26, -D / 2 + 0.1, body);
        for (const sx of [-1, 1]) p.plain.box(0.15, 0.32, D, sx * (W / 2 - 0.075), 0.26, 0, body);
        for (let k = 0; k < 3; k++) p.cloth(0.5, 0.36, 0.12, -0.6 + k * 0.6, 0.36, -D / 2 + 0.26, k === 1 ? WAX_A : WAX_C);
        for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.wood.box(0.06, 0.06, 0.06, dx * (W / 2 - 0.1), 0, dz * (D / 2 - 0.1), 0x3a2416);
      }
      break;
    }
    // ---------------------------------------------------------------- beds
    case 'matelas_sol':
      p.plain.box(W, 0.06, D, 0, 0, 0, 0xe8e2d0);
      p.cloth(W - 0.04, 0.08, D - 0.04, 0, 0.06, 0, WAX_A);                    // top 0.14
      p.plain.box(0.6, 0.1, 0.3, 0, 0.14, -D / 2 + 0.2, 0xf2f2ec);
      break;
    case 'lit_bois': case 'lit_king': {
      const king = f.id === 'lit_king', frame = king ? 0xd8cfc0 : 0x8b5a32;
      (king ? p.plain : p.wood).box(W, 0.35, D, 0, 0, 0, frame);
      (king ? p.plain : p.wood).box(W, king ? 1.25 : 0.8, king ? 0.16 : 0.08, 0, 0, -D / 2 + (king ? 0.08 : 0.04), king ? 0xe9e1d3 : 0x7a4c28);
      if (king) for (let k = 0; k < 6; k++) for (let r = 0; r < 3; r++) p.plain.sphere(0.02, -W / 2 + 0.25 + k * (W - 0.5) / 5, 0.55 + r * 0.22, -D / 2 + 0.165, 0xb9ad98);
      p.cloth(W - 0.1, king ? 0.17 : 0.13, D - 0.2, 0, 0.35, 0.05, king ? ['#f4f1ea', '#c9a14a', '#e8dcc6'] : WAX_B);   // mattress top 0.48 / 0.52
      const top = king ? 0.52 : 0.48;
      p.plain.box(W / 2 - 0.15, 0.14, 0.34, -W / 4, top, -D / 2 + 0.35, 0xf2f2ec); p.plain.box(W / 2 - 0.15, 0.14, 0.34, W / 4, top, -D / 2 + 0.35, 0xf4e6c8);
      if (king) p.cloth(W - 0.08, 0.04, 0.6, 0, top, D / 2 - 0.45, ['#7a1f3d', '#c9a14a', '#3d0f1f']);   // throw
      break;
    }
    // ---------------------------------------------------------------- tables
    case 'table_basse':
      p.wood.box(W, 0.06, D, 0, 0.3, 0, 0x8b6a47);
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.wood.box(0.05, 0.3, 0.05, dx * (W / 2 - 0.06), 0, dz * (D / 2 - 0.06), 0x6b4a2e);
      p.metal.cyl(0.07, 0.09, 0.12, -0.15, 0.36, 0, 0x9aa0a6, 10); p.metal.cyl(0.015, 0.015, 0.06, -0.07, 0.42, 0, 0x9aa0a6, 4, [0, 0, -1]);   // ataya teapot
      for (let k = 0; k < 3; k++) p.glass.cyl(0.025, 0.02, 0.07, 0.12 + k * 0.08, 0.36, 0.05, 0xe8f4ff, 6);
      break;
    case 'table_manger':
      p.wood.box(W, 0.05, D, 0, 0.72, 0, 0x7a4a26);
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.wood.box(0.06, 0.72, 0.06, dx * (W / 2 - 0.08), 0, dz * (D / 2 - 0.08), 0x6b3f20);
      p.cloth(W - 0.3, 0.005, D - 0.25, 0, 0.77, 0, WAX_C);
      p.plain.cyl(0.16, 0.12, 0.1, 0, 0.775, 0, 0xf2f2ec, 12);
      break;
    case 'table_marbre':
      p.plain.box(W, 0.06, D, 0, 0.72, 0, 0xf1efe9);
      for (const sx of [-1, 1]) { p.metal.box(0.06, 0.72, D - 0.3, sx * (W / 2 - 0.25), 0, 0, 0xc9a14a); }
      p.glass.cyl(0.08, 0.06, 0.28, 0, 0.78, 0, 0x9ec9d9, 8); p.plain.blob(0.12, 0, 1.1, 0, 0xd94a8c, 0.8, 0);
      break;
    // ---------------------------------------------------------------- televisions
    case 'tele':
      p.wood.box(W, 0.45, D, 0, 0, 0, 0x6b4a2e);
      p.plain.box(0.5, 0.38, 0.3, 0, 0.45, -0.03, 0x1d1d1f); p.glow.box(0.42, 0.3, 0.01, 0, 0.49, 0.125, 0x3b5f8a);
      break;
    case 'tele_plate':
      p.wood.box(W, 0.42, D, 0, 0, 0, 0x2b2b2e); p.wood.box(W - 0.1, 0.02, 0.01, 0, 0.2, D / 2, 0x555555);
      p.plain.box(0.25, 0.05, 0.18, 0, 0.42, -0.05, 0x111111); p.plain.box(0.05, 0.1, 0.05, 0, 0.47, -0.05, 0x111111);
      p.plain.box(1.05, 0.62, 0.05, 0, 0.55, -0.05, 0x0d0d0f); p.glow.box(0.99, 0.56, 0.01, 0, 0.58, -0.02, 0x2e5a86);
      break;
    case 'home_cinema':
      p.wood.box(W, 0.4, D, 0, 0, 0, 0x1f1f22);
      p.plain.box(1.6, 0.92, 0.06, 0, 0.48, -0.1, 0x0b0b0d); p.glow.box(1.54, 0.86, 0.01, 0, 0.51, -0.065, 0x335f8f);
      p.plain.box(0.06, 0.08, 0.2, 0, 0.4, -0.1, 0x111111);
      for (const sx of [-1, 1]) { p.plain.box(0.18, 1.0, 0.22, sx * (W / 2 - 0.09), 0.4, 0, 0x151517); p.metal.cyl(0.05, 0.05, 0.01, sx * (W / 2 - 0.09), 1.1, 0.115, 0x777777, 10, [Math.PI / 2, 0, 0]); }
      break;
    // ---------------------------------------------------------------- music
    case 'radio':                                                           // low shelf with a small radio (no real station)
      p.wood.box(W, 0.5, 0.3, 0, 0, -0.025, 0x7a5a3c);
      p.plain.box(0.36, 0.2, 0.14, 0, 0.5, -0.005, 0x2b2b33); p.plain.cyl(0.06, 0.06, 0.01, -0.08, 0.6, 0.075, 0x9aa0a6, 10, [Math.PI / 2, 0, 0]);
      p.plain.box(0.07, 0.03, 0.02, 0.1, 0.64, 0.075, 0xf4c20d); p.plain.cyl(0.006, 0.006, 0.35, 0.14, 0.7, -0.045, 0xbbbbbb, 4, [0, 0, -0.5]);
      break;
    case 'chaine_hifi':
      p.wood.box(W, 0.4, D, 0, 0, 0, 0x4a3426);
      p.plain.box(0.4, 0.18, 0.28, 0, 0.4, 0, 0x2b2b33); p.glow.box(0.12, 0.03, 0.01, 0, 0.5, 0.145, 0x5ad1ff);
      for (const sx of [-1, 1]) { p.plain.box(0.18, 0.3, 0.2, sx * 0.33, 0.4, 0, 0x1d1d1f); p.metal.cyl(0.06, 0.06, 0.01, sx * 0.33, 0.55, 0.105, 0x666666, 10, [Math.PI / 2, 0, 0]); }
      break;
    case 'enceintes':
      p.wood.box(0.6, 0.45, D - 0.05, 0, 0, 0, 0x2a1d14); p.plain.box(0.4, 0.1, 0.3, 0, 0.45, 0, 0x2b2b33);
      for (const sx of [-1, 1]) {
        p.wood.box(0.3, 1.1, 0.35, sx * (W / 2 - 0.15), 0, 0, 0x3a2416);
        for (const y of [0.35, 0.75]) p.metal.cyl(0.1, 0.1, 0.01, sx * (W / 2 - 0.15), y, 0.18, 0x555555, 12, [Math.PI / 2, 0, 0]);
      }
      break;
    // ---------------------------------------------------------------- rugs (flat)
    case 'tapis': p.rug(W, D, ['#b5452b', '#f2d16b', '#2a5b8f']); break;
    case 'tapis_tisse': p.rug(W, D, ['#8a5a2b', '#e8d5b0', '#2f2a26']); break;
    case 'tapis_soie': p.rug(W, D, ['#4a1f5c', '#d4b24a', '#7a2f8a']); break;
    // ---------------------------------------------------------------- mirrors
    case 'miroir':                                                          // tall mirror with a wooden frame, against the wall
      p.wood.box(0.65, 1.4, 0.04, 0, 0.45, -0.03, 0x6e4426); p.glass.box(0.52, 1.25, 0.02, 0, 0.52, 0.0, 0xc8dce6);
      break;
    case 'coiffeuse':
      p.wood.box(W, 0.75, D, 0, 0, 0, 0xe8dcc8); p.wood.box(W - 0.1, 0.02, 0.01, 0, 0.5, D / 2, 0x8b6a47);
      p.wood.box(0.75, 0.9, 0.05, 0, 0.75, -D / 2 + 0.03, 0xe8dcc8); p.glass.box(0.65, 0.8, 0.01, 0, 0.8, -D / 2 + 0.06, 0xc8dce6);
      p.plain.cyl(0.03, 0.03, 0.12, 0.3, 0.75, 0.05, 0xd94a8c, 8);
      break;
    case 'miroir_dore':
      p.metal.box(0.9, 1.9, 0.08, 0, 0, -0.03, 0xc9a14a); p.glass.box(0.76, 1.74, 0.02, 0, 0.08, 0.02, 0xd6e4ec);
      p.glow.box(0.7, 0.03, 0.01, 0, 1.78, 0.04, 0xfff1c8);
      break;
    // ---------------------------------------------------------------- plants
    case 'plante':
      p.plain.cyl(0.14, 0.11, 0.3, 0, 0, 0, 0xb5452b, 10);
      p.plain.blob(0.2, 0, 0.45, 0, 0x3f7a35, 0.9, 0); p.plain.blob(0.14, 0.08, 0.6, 0.04, 0x4c8a3c, 0.9, 0);
      break;
    case 'palmier':
      p.plain.cyl(0.24, 0.2, 0.4, 0, 0, 0, 0xd9c7a8, 10);
      p.wood.cyl(0.04, 0.05, 1.1, 0, 0.4, 0, 0x8a6d4a, 6);
      for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2; p.plain.box(0.14, 0.03, 0.55, Math.sin(a) * 0.22, 1.42, Math.cos(a) * 0.22, k % 2 ? 0x2f7f3e : 0x3d9450, a); }
      break;
    case 'jardiniere':
      p.wood.box(W, 0.45, D, 0, 0, 0, 0x6e4426); p.wood.box(W + 0.04, 0.05, D + 0.04, 0, 0.45, 0, 0x5a3820);
      for (let k = 0; k < 4; k++) p.plain.blob(0.2, -0.36 + k * 0.24, 0.62, 0, k % 2 ? 0xd94a8c : 0x3f7a35, 0.8, 0);
      break;
    // ---------------------------------------------------------------- desks (the chair stands in front, facing the desk)
    case 'bureau_simple': case 'bureau_bois': case 'bureau_direction': {
      const big = f.id === 'bureau_direction', mid = f.id === 'bureau_bois', top = big ? 0x3a2416 : mid ? 0x7a4a26 : 0xd9d2c4, dd = big ? 0.8 : 0.6, zb = -D / 2 + dd / 2;
      (f.id === 'bureau_simple' ? p.metal : p.wood).box(W, 0.04, dd, 0, 0.72, zb, top);
      if (big) p.wood.box(W, 0.72, dd - 0.1, 0, 0, zb, 0x2a1a10);
      else for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.metal.box(0.04, 0.72, 0.04, dx * (W / 2 - 0.05), 0, zb + dz * (dd / 2 - 0.05), 0x444444);
      if (mid || big) {                                                     // screens
        for (const sx of big ? [-0.3, 0.3] : [0]) { p.plain.box(0.5, 0.32, 0.03, sx, 0.84, zb - 0.12, 0x111111); p.glow.box(0.46, 0.28, 0.01, sx, 0.86, zb - 0.1, 0x3e6d9c); p.plain.box(0.05, 0.1, 0.05, sx, 0.76, zb - 0.14, 0x111111); }
        p.plain.box(0.4, 0.02, 0.14, 0, 0.76, zb + 0.12, 0x222222);
      } else { p.plain.box(0.3, 0.02, 0.22, -0.2, 0.76, zb, 0xf2f2ec); p.plain.cyl(0.03, 0.03, 0.12, 0.3, 0.76, zb - 0.1, 0x2a8fd1, 6); }   // papers and a pen pot
      const cz = D / 2 - (big ? 0.32 : 0.27), seat = big ? 0x1d1d1f : mid ? 0x2f4f86 : 0xf2f2ee;
      p.plain.box(0.46, 0.06, 0.44, 0, big ? 0.3 : 0.37, cz, seat);
      p.plain.box(0.46, 0.45, 0.05, 0, big ? 0.36 : 0.43, cz + 0.2, seat);                // back to the room: it faces the desk
      if (big) { p.metal.cyl(0.03, 0.03, 0.3, 0, 0, cz, 0x888888, 6); p.metal.cyl(0.24, 0.24, 0.03, 0, 0, cz, 0x666666, 5); }
      else for (const [dx, dz] of [[-0.2, -0.18], [0.2, -0.18], [-0.2, 0.18], [0.2, 0.18]]) p.plain.box(0.04, 0.38, 0.04, dx, 0, cz + dz, seat);
      break;
    }
    // ---------------------------------------------------------------- kitchen
    case 'rechaud':
      p.wood.box(W, 0.6, D, 0, 0, 0, 0x7a5a3c);
      p.metal.cyl(0.12, 0.12, 0.05, -0.15, 0.6, 0, 0x333333, 10); p.metal.cyl(0.17, 0.15, 0.22, -0.15, 0.65, 0, 0x9da2a6, 10);   // gas ring, pot
      p.metal.cyl(0.13, 0.13, 0.42, 0.24, -0.4, 0, 0x2a6fb3, 10);                                                      // butane bottle (under)
      p.metal.cyl(0.07, 0.08, 0.1, 0.24, 0.6, 0.05, 0xb8bcc0, 8);
      break;
    case 'cuisiniere':
      p.plain.box(W, 0.88, D, 0, 0, 0, 0xe8e2d6); p.plain.box(W + 0.02, 0.04, D + 0.02, 0, 0.88, 0, 0x5a5a5e);
      p.metal.box(0.6, 0.86, 0.6, -0.45, 0, 0.01, 0xd9d9d9); p.glass.box(0.4, 0.3, 0.01, -0.45, 0.3, 0.31, 0x222222);
      for (const [dx, dz] of [[-0.6, -0.12], [-0.3, -0.12], [-0.6, 0.14], [-0.3, 0.14]]) p.plain.cyl(0.08, 0.08, 0.02, dx, 0.92, dz, 0x111111, 10);
      p.metal.box(0.45, 0.06, 0.38, 0.4, 0.86, 0, 0xb8bcc0); p.metal.cyl(0.02, 0.02, 0.28, 0.4, 0.92, -0.2, 0x9aa0a6, 6);
      break;
    case 'cuisine_equipee':
      p.plain.box(W, 0.9, D, 0, 0, 0, 0x2b2b2e); p.plain.box(W + 0.04, 0.05, D + 0.04, 0, 0.9, 0, 0xf1efe9);
      for (const [dx, dz] of [[-0.7, -0.15], [-0.4, -0.15], [-0.7, 0.15], [-0.4, 0.15]]) p.plain.cyl(0.09, 0.09, 0.01, dx, 0.95, dz, 0x111111, 10);
      p.metal.box(0.55, 0.05, 0.4, 0.45, 0.93, 0, 0xc0c4c8); p.metal.cyl(0.02, 0.02, 0.35, 0.45, 0.95, -0.25, 0xc9a14a, 6);
      p.glow.box(W - 0.1, 0.02, 0.02, 0, 0.82, D / 2 + 0.01, 0xfff1d0);
      for (let k = 0; k < 3; k++) p.plain.box(0.02, 0.6, 0.01, -0.8 + k * 0.8, 0.12, D / 2 + 0.005, 0x444444);
      break;
    // ---------------------------------------------------------------- lamps
    case 'lampe':
      p.wood.box(0.3, 0.45, 0.3, 0, 0, 0, 0x7a5a3c);
      p.plain.cyl(0.05, 0.06, 0.2, 0, 0.45, 0, 0xd9d2c4, 8); p.glow.cyl(0.09, 0.13, 0.16, 0, 0.65, 0, 0xffe4b0, 10);
      break;
    case 'lampadaire': case 'lampadaire_laiton': {
      const brass = f.id === 'lampadaire_laiton', c = brass ? 0xc9a14a : 0x333333;
      p.metal.cyl(0.16, 0.18, 0.04, 0, 0, 0, c, 12); p.metal.cyl(0.02, 0.02, 1.45, 0, 0.04, 0, c, 6);
      p.glow.cyl(brass ? 0.16 : 0.13, brass ? 0.26 : 0.2, 0.3, 0, 1.45, 0, brass ? 0xffe7b8 : 0xfff1d6, 12);
      break;
    }
    // ---------------------------------------------------------------- wardrobes
    case 'armoire_metal':
      p.metal.box(W, 1.8, D, 0, 0, 0, 0x8a9aa6); p.metal.box(0.01, 1.7, 0.01, 0, 0.05, D / 2, 0x55606a);
      for (const sx of [-0.06, 0.06]) p.metal.box(0.02, 0.12, 0.02, sx, 0.9, D / 2 + 0.01, 0x333333);
      break;
    case 'armoire_bois':
      p.wood.box(W, 2.0, D, 0, 0, 0, 0x6e4426); p.wood.box(W + 0.04, 0.06, D + 0.04, 0, 2.0, 0, 0x5a3820);
      p.wood.box(0.01, 1.85, 0.01, 0, 0.08, D / 2, 0x3a2416);
      for (const sx of [-0.06, 0.06]) p.metal.box(0.02, 0.14, 0.02, sx, 1.0, D / 2 + 0.01, 0xc9a14a);
      break;
    case 'dressing':
      p.wood.box(W, 2.1, D, 0, 0, 0, 0xe9e1d3);
      for (let k = 0; k < 3; k++) {
        const x = -W / 2 + W / 6 + k * W / 3;
        if (k === 1) p.glass.box(W / 3 - 0.08, 1.9, 0.01, x, 0.1, D / 2 + 0.005, 0xc8dce6); else p.wood.box(0.02, 0.2, 0.02, x + (k ? -0.25 : 0.25), 1.0, D / 2 + 0.01, 0xc9a14a);
      }
      break;
    default:                                                                // a piece without a model yet: a plain crate of its size
      p.wood.box(W, 0.5, D, 0, 0, 0, 0x8b6a47);
  }
  return p.group();
}

/** Ghost of a piece for the placement mode: its footprint on the floor, green where it fits, red where it does not. */
export function footprintMarker(): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x34d399, transparent: true, opacity: 0.35, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.renderOrder = 3;
  return m;
}
