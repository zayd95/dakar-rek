/**
 * LD2.0-D look pass (docs/ld2/LD2_D.md): the Almadies villa furnished with the « Collection Almadies » (lane K-L's line, `line: 'almadies'`) and its
 * teak outdoor pieces, room by room on its three levels: one plain list the owner's showcase can furnish the villa from (each placement in the plan's
 * space: the ground floor at its house x, the first floor at x + 20, the roof at x − 20; rot in quarter turns, 0 facing +z). Every spot passes the
 * home editor's own rules (src/economy/placement.ts whyNot) beside the pieces before it, and every room stays reachable (tests/villaFurnish.test.ts);
 * scripts/shots-villa-look.mjs sets it out in the game piece by piece and takes the pictures.
 */
export interface LaidPiece { spec: string; x: number; z: number; rot: 0 | 1 | 2 | 3; room: string }
export const VILLA_ALMADIES_LAYOUT: readonly LaidPiece[] = [
  // ---------------------------------------------------------------- the grand salon: the curved sofa against the oak slats, facing the pool
  { spec: 'canape_courbe', room: 'salon', x: -5.9, z: -0.72, rot: 2 },
  { spec: 'tapis_rond_jute', room: 'salon', x: -5.9, z: -2.25, rot: 0 },
  { spec: 'table_basse_marbre_noir', room: 'salon', x: -5.9, z: -2.2, rot: 0 },
  { spec: 'fauteuil_boucle', room: 'salon', x: -6.9, z: -3.58, rot: 0 },
  { spec: 'fauteuil_boucle', room: 'salon', x: -4.9, z: -3.58, rot: 0 },
  { spec: 'gueridon_marbre', room: 'salon', x: -3.95, z: -3.6, rot: 0 },
  { spec: 'lampadaire_champignon', room: 'salon', x: -7.55, z: -1.75, rot: 0 },
  { spec: 'lustre_couronne', room: 'salon', x: -5.9, z: -2.25, rot: 0 },
  { spec: 'pot_cannele', room: 'salon', x: -7.55, z: -4.5, rot: 0 },
  // ---------------------------------------------------------------- the dining room: the round marble table under a second crown, the sideboard on the stone wall
  { spec: 'salle_manger_ronde', room: 'manger', x: 1.6, z: -2.4, rot: 0 },
  { spec: 'lustre_couronne', room: 'manger', x: 1.6, z: -2.4, rot: 0 },
  { spec: 'enfilade_bronze', room: 'manger', x: 4.09, z: -1.7, rot: 3 },
  { spec: 'pot_cannele', room: 'manger', x: -0.55, z: -0.45, rot: 0 },
  // ---------------------------------------------------------------- the study, the entrance
  { spec: 'bureau_caisson', room: 'bureau', x: -6.4, z: 0.7, rot: 0 },
  { spec: 'bibliotheque_bronze', room: 'bureau', x: -4.86, z: 2.6, rot: 3 },
  { spec: 'pot_cannele', room: 'entree', x: -1.8, z: 3.4, rot: 0 },
  // ---------------------------------------------------------------- the master suite: the black tufted bed against the oak slats, facing its balcony
  { spec: 'lit_capitonne_noir', room: 'suite', x: 14.3, z: -1.82, rot: 2 },
  { spec: 'chevet_greige', room: 'suite', x: 12.95, z: -0.88, rot: 2 },
  { spec: 'chevet_greige', room: 'suite', x: 15.65, z: -0.88, rot: 2 },
  { spec: 'banc_lit', room: 'suite', x: 14.3, z: -3.25, rot: 2 },
  { spec: 'dressing_bronze', room: 'suite', x: 16.81, z: -3.8, rot: 3 },
  { spec: 'miroir_ovale', room: 'suite', x: 12.15, z: -4.3, rot: 1 },
  { spec: 'coiffeuse_ronde', room: 'dressing', x: 19.1, z: -1.2, rot: 3 },
  // ---------------------------------------------------------------- the guest room (chambre 2), chambre 3
  { spec: 'lit_lin_greige', room: 'chambre2', x: 20.82, z: -3.2, rot: 1 },
  { spec: 'chevet_noyer', room: 'chambre2', x: 19.92, z: -4.6, rot: 1 },
  { spec: 'chiffonnier_noyer', room: 'chambre2', x: 22.72, z: -2.5, rot: 3 },
  { spec: 'commode_six', room: 'chambre3', x: 13.83, z: -0.27, rot: 0 },
  // ---------------------------------------------------------------- the family lounge: the TV on the stone wall, the bouclé sofa facing it
  { spec: 'meuble_tv_laque', room: 'salon_familial', x: 15.9, z: 1.5, rot: 1 },
  { spec: 'canape_boucle', room: 'salon_familial', x: 19.0, z: 1.55, rot: 3 },
  { spec: 'tapis_rond_jute', room: 'salon_familial', x: 17.4, z: 1.55, rot: 0 },
  { spec: 'bibliotheque_noyer', room: 'salon_familial', x: 18.3, z: -0.38, rot: 0 },
  { spec: 'lampadaire_arc_plisse', room: 'salon_familial', x: 20.1, z: 2.4, rot: 3 },
  { spec: 'pot_cannele', room: 'salon_familial', x: 23.0, z: 3.5, rot: 0 },
  // ---------------------------------------------------------------- the pool deck
  { spec: 'bain_soleil_teck', room: 'jardin', x: 5.6, z: -7.8, rot: 0 },
  { spec: 'bain_soleil_teck', room: 'jardin', x: 6.6, z: -7.8, rot: 0 },
  { spec: 'parasol_deporte', room: 'jardin', x: 8.6, z: -9.6, rot: 0 },
  // ---------------------------------------------------------------- the roof terrace: the teak dining set under the pergola, two loungers by the glass
  { spec: 'salon_teck', room: 'terrasse', x: -17.8, z: 1.85, rot: 0 },
  { spec: 'bain_soleil_teck', room: 'terrasse', x: -26.85, z: 3.3, rot: 1 },
  { spec: 'bain_soleil_teck', room: 'terrasse', x: -26.85, z: -4.4, rot: 1 },
];
