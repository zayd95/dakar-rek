# DKAG-019 — Navigation CI déterministe

## Défaut reproduit dans la CI

Le run PR `37856146883` a expiré à deux reprises pendant la navigation réelle vers une interaction, avec un plafond fixe de 3 secondes. Le run push exact `37856142783` a validé la même arborescence, ce qui isole une sensibilité à la cadence de rendu du runner plutôt qu'un défaut de géométrie ou de produit.

## Correction bornée

- aucun code produit, workflow, paquet, schéma ou asset modifié ;
- budget commun de navigation porté de 3 à 10 secondes pour les deux marches clavier et la marche tactile CDP ;
- toutes les interactions restent pilotées par les entrées réelles ;
- seuil de déplacement strictement supérieur à 3,5 m conservé ;
- assertions de menu arène et panneau conservées ;
- événements tactiles CDP et libérations dans les blocs `finally` conservés ;
- journaux des positions initiales et finales conservés.

## Vérifications auteur

- `node --check scripts/check-v1-core.mjs` : succès ;
- `git diff --check` : succès ;
- `npm test` : 6 fichiers, 34 tests réussis ;
- `npm run typecheck` : succès ;
- `npm run build` : succès, 46 modules transformés ;
- harnais Playwright local : non exécuté, car cette exécution ne fournit aucune distribution Chrome (`/opt/google/chrome/chrome` absent). Aucune installation de navigateur n'a été ajoutée. La CI existante doit donc fournir la preuve navigateur au SHA publié.

## Limite de revue

Ce rapport est une preuve auteur. La validation finale reste réservée à une QA indépendante sur le SHA exact et aux résultats CI associés.
