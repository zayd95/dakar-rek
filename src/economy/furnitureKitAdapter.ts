import * as THREE from 'three';
import { buildFurniture, furnitureSpec as kitSpec, type FurnitureId } from '../world/furnitureKit';
import { FURNITURE_SPECS } from './catalog';
import { setFurnitureKit } from './furnitureModels';

/**
 * The 3D asset lane's furniture kit (src/world/furnitureKit.ts) standing in for the catalogue's pieces, through the
 * `setFurnitureKit` seam. Each catalogue piece maps to one kit piece (or several side by side: the starter pair of
 * chairs). The model is squeezed on the floor plane to fit the catalogue footprint (never enlarged; heights untouched),
 * and the piece's seat heights follow the kit model so the sitting pose matches it. Pieces without a fitting kit model
 * (radio and speakers, plants, dressing table, small stove, table lamp, the mattress upgrade) keep the built-in one.
 */
export const KIT_PIECES: Record<string, FurnitureId | [FurnitureId, number][]> = {
  // the starter room (src/economy/furniture.ts ids)
  miroir: 'mirror:better', tapis: 'rug:basic', chaises: [['plasticChair:basic', -0.29], ['plasticChair:basic', 0.29]], tele: 'tv:basic',
  // seats
  chaise_plastique: 'plasticChair:basic', chaise_bois: 'woodenChair:better', fauteuil_cuir: 'armchair:better',
  banquette: 'sofa:basic', canape_wax: 'sofa:better', canape_cuir: 'sofa:premium',
  matelas_sol: 'bed:basic', lit_bois: 'bed:better', lit_king: 'bed:premium',
  bureau_simple: 'desk:basic', bureau_bois: 'desk:better', bureau_direction: 'desk:premium',
  // the rest of the home
  table_basse: 'lowTable:better', table_manger: 'table:better', table_marbre: 'table:premium',
  tele_plate: 'tv:better', home_cinema: 'tv:premium',
  tapis_tisse: 'rug:better', tapis_soie: 'rug:premium', miroir_dore: 'mirror:premium',
  cuisiniere: 'kitchen:better', cuisine_equipee: 'kitchen:premium',
  lampadaire: 'lamp:better', lampadaire_laiton: 'lamp:premium',
  armoire_metal: 'wardrobe:basic', armoire_bois: 'wardrobe:better', dressing: 'wardrobe:premium',
};

/** Height of the home floor the catalogue's seat tops are measured with (kit seat tops are above the piece's base). */
const FLOOR = 0.1;
const partsOf = (m: FurnitureId | [FurnitureId, number][]): [FurnitureId, number][] => Array.isArray(m) ? m : [[m, 0]];

let installed = false;
/** Installs the kit for every mapped piece (once, at start: the seat heights of the catalogue follow the kit models). */
export function installFurnitureKit() {
  if (installed) return;
  installed = true;
  for (const f of FURNITURE_SPECS) {
    const m = KIT_PIECES[f.id]; if (!m || !f.seats?.length) continue;
    const top = kitSpec(partsOf(m)[0][0]).seats[0]?.top;
    if (top !== undefined) for (const s of f.seats) s.top = Math.round((top + FLOOR) * 1000) / 1000;
  }
  setFurnitureKit(id => {
    const m = KIT_PIECES[id], f = FURNITURE_SPECS.find(x => x.id === id);
    if (!m || !f) return null;
    const inner = new THREE.Group();
    let w = 0, d = 0;
    for (const [kid, x] of partsOf(m)) {
      const b = buildFurniture(kid);
      b.group.position.x = x; inner.add(b.group);
      w = Math.max(w, Math.abs(x) * 2 + b.footprint.w); d = Math.max(d, b.footprint.d);
    }
    inner.scale.set(Math.min(1, f.w / w), 1, Math.min(1, f.d / d));
    const g = new THREE.Group(); g.name = `kit_${id}`; g.add(inner);
    return g;
  });
}
