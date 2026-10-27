# Cité Jàmm — la maison familiale moderne (Pikine)

La « Maison · Cité Jàmm » (`homes.maison_cite`) n'est plus une boîte rose :
c'est une villa R+1 moderne de Dakar, d'après les photos de référence.

## Ce qui a changé (`src/economy/citeJamm.ts`)
- **Volume** : R+1 enduit sable/ocre, corniche, pilastres, toit-terrasse avec
  fers d'attente, bac à eau et antenne, acrotère central.
- **Façade** : trois baies vitrées à l'étage avec balcons à garde-corps vitré
  et consoles, fenêtres à grille au rez-de-chaussée.
- **Entrée** : porte noire ornementée sous un petit auvent de tuiles rouges,
  marches bleues, portail ouvert entre deux pilastres, enseigne « Maison · Jàmm ».
- **Clôture** : muret bas enduit + panneaux de fer forgé noir à volutes,
  cour dallée, arbre et pots.
- **Ancrages** : porte W(31, 16.2), enseigne W(31, 16.0), entrée W(31, 23.4)
  — le chemin portail → cour → porte est libre de colliders.

## Preuves
- `scripts/check-cite-maison.mjs` (toucher réel) : portail, cour, focus
  « Voir le logement », fiche Acheter/Louer/Visiter, intérieur, « Sortir » — 6/6
  (`docs/proof/cite-jamm/check-cite-maison.log`).
- Captures jour/nuit : `docs/proof/cite-jamm/`.
- Perf (medium, vue de face) : 26 draw calls / 133 837 tris contre 29 / 132 435 avant.
- `tsc` propre ; vitest 2857 passés, 3 ignorés.

Non testé : iPhone réel.
