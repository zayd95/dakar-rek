import * as THREE from 'three';
import { buildFurniture, furnitureSpec as kitSpec, type FurnitureId } from '../world/furnitureKit';
import { FURNITURE_SPECS } from './catalog';
import { setFurnitureKit } from './furnitureModels';

/**
 * The 3D asset lane's furniture kit (src/world/furnitureKit.ts) standing in for the catalogue's pieces, through the
 * `setFurnitureKit` seam. Each catalogue piece maps to one kit piece (or several side by side: the starter pair of
 * chairs). The model is squeezed on the floor plane to fit the catalogue footprint (never enlarged; heights untouched),
 * and the piece's seat heights follow the kit model so the sitting pose matches it. Since LD2.0-C every piece of the catalogue has its kit model
 * (one draw call, a second only for glass): the radio and the speakers, the plants, the dressing table, the small stove, the lamps and the dressing
 * got theirs then (src/world/furnitureKit.ts HOME_TYPES); furnitureModels.ts's built-in models stay as the fallback when no kit is installed.
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
  lampadaire_laiton: 'lamp:premium',
  armoire_metal: 'wardrobe:basic', armoire_bois: 'wardrobe:better',
  // LD2.0-C: the pieces still drawn with the built-in models, and the premium pieces that were boxes (speakers, carved planter, dressing)
  radio: 'audio:basic', chaine_hifi: 'audio:better', enceintes: 'audio:premium',
  plante: 'plant:basic', palmier: 'plant:better', jardiniere: 'plant:premium',
  coiffeuse: 'dresser:better', rechaud: 'cooker:basic', lampe: 'bedside:basic', lampadaire: 'floorLamp:basic', dressing: 'closet:premium',
  matelas: 'bed:better',                                                       // never placed (it improves the home's own bed): drawn only if ever shown
  // LD2.0-C: the new pieces (src/economy/catalog.ts « the furnishing upgrade »)
  salle_manger_simple: 'dining:basic', salle_manger_bois: 'dining:better', salle_manger_marbre: 'dining:premium',
  table_cuisine: 'kitchenTable:basic', table_cuisine_bois: 'kitchenTable:better', bar_cuisine: 'kitchenTable:premium', gaziniere: 'cooker:better', piano_cuisson: 'cooker:premium',
  micro_ondes_desserte: 'microwave:basic', micro_ondes: 'microwave:better', colonne_four: 'microwave:premium',
  canari: 'waterDispenser:basic', fontaine_eau: 'waterDispenser:better', fontaine_inox: 'waterDispenser:premium',
  ventilateur: 'fan:basic', ventilo_pied: 'fan:better', ventilo_colonne: 'fan:premium',
  lavabo_colonne: 'vanity:basic', meuble_vasque: 'vanity:better', vasque_marbre: 'vanity:premium',
  miroir_sdb: 'bathMirror:basic', armoire_toilette: 'bathMirror:better', miroir_lumineux: 'bathMirror:premium',
  porte_serviettes: 'towelRail:basic', porte_serviettes_bois: 'towelRail:better', seche_serviettes: 'towelRail:premium',
  lampadaire_trepied: 'floorLamp:better', lampadaire_arc: 'floorLamp:premium',
  suspension_osier: 'pendant:basic', suspension_calebasse: 'pendant:better', lustre: 'pendant:premium',
  chevet_bois: 'bedside:better', chevet_sculpte: 'bedside:premium',
  commode: 'dresser:basic', penderie: 'closet:basic', armoire_3portes: 'closet:better', coiffeuse_doree: 'dresser:premium',
  affiche: 'wallArt:basic', sous_verre: 'wallArt:better', toile_artiste: 'wallArt:premium',
  tele_etagere: 'tvWall:basic', meuble_tv: 'tvWall:better', mur_tv: 'tvWall:premium',
  etagere: 'shelf:basic', bibliotheque: 'shelf:better', vitrine: 'shelf:premium',
  transat: 'lounger:basic', bain_soleil: 'lounger:better', bain_soleil_teck: 'lounger:premium',
  parasol: 'parasol:basic', parasol_bois: 'parasol:better', parasol_deporte: 'parasol:premium',
  salon_jardin: 'gardenSet:basic', salon_fer_forge: 'gardenSet:better', salon_teck: 'gardenSet:premium',
  // ---- the catalogue's second round, comfort lane (K-C): its mappings here
  //
  // (the comfort lane's mappings above, the decoration lane's below)
  //
  // ---- the catalogue's second round, decoration lane (K-D): its mappings here
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
