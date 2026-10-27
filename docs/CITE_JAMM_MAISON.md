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

## L'intérieur (`src/housing/maisonPlan.ts`)
Même ordre de maison dedans que dehors : la maison avait une seule pièce ouverte ; elle a maintenant un plan de **deux niveaux** (12 m × 9 m, 108 m² par étage, 216 m²), construit par la même coque que la villa d'Almadies (`src/housing/apartment.ts`, plan à niveaux, escalier, découpe par étage).
- **Rez-de-chaussée** : entrée (porte d'entrée, arches vers le salon et la salle à manger), grand salon (mur de pierre), salle à manger (mur de lames de bois), cuisine (plan de travail sous la fenêtre côté rue, évier, cuisinière, frigo, îlot), chambre d'amis (porte), salle d'eau (douche, WC, vasque) sous le palier, hall de l'escalier, et **la cour** derrière (baies vitrées du salon et de la salle à manger).
- **Escalier** droit de 17 marches (1,25 m de large) contre le mur est, de l'entrée de la salle à manger au palier.
- **Étage** : palier, salon familial (baie sur le balcon côté rue, verre comme la façade), couloir (parquet), chambre parentale (balcon sur rue), deux autres chambres, salle de bain (baignoire, WC, vasque).
- Les meubles s'achètent et se posent comme dans l'appartement et la villa : puces de niveau (RDC, Étage) et de pièce dans « Aménager ».
- `maison_cite` : `size` 216 m², `home` 12 × 9 (marbre) ; l'annonce dit « deux étages, cour, balcons » (`levelsBlurb` dans `estate.ts`, qui ne parle plus de piscine ni d'hélipad pour un plan sans eux).
- Le terrain autour (pelouse, allée, murs, palmiers) de la coque lit maintenant la porte (`gate`) et la cour d'entrée (`yard`) du plan au lieu de celles de la villa.
- Les placements enregistrés dans l'ancienne pièce ouverte ne correspondent plus à ce plan (la maison coûte 150 M F : personne ne la possède encore en jeu).

## Preuves
- `scripts/check-maison-walk.mjs` (toucher réel, joystick) : 74 étapes à pied dans les 17 pièces des deux niveaux, l'escalier monté et descendu, 6 portes ouvertes au passage, jamais dans un mur (490 relevés, au plus près 0,30 m), toujours vu, « Sortir » ; 10 meubles posés ; puces « Aménager » ; coque ≤ 17 appels de dessin par niveau (≤ 30) — 18/18 (`docs/proof/cite-maison/interior/`).
- `tests/maisonPlan.test.ts` : pièces, ouvertures, fenêtres, appareils, escalier, atteignabilité.
- `scripts/check-cite-maison.mjs` (toucher réel) : portail, cour, focus
  « Voir le logement », fiche Acheter/Louer/Visiter, intérieur, « Sortir » — 6/6
  (`docs/proof/cite-jamm/check-cite-maison.log`).
- Captures jour/nuit : `docs/proof/cite-jamm/`.
- Perf (medium, vue de face) : 26 draw calls / 133 837 tris contre 29 / 132 435 avant.
- `tsc` propre ; vitest 2868 passés, 3 ignorés.

Non testé : iPhone réel.
