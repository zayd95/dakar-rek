# DKAG-015 — aperçu des activités du quartier

Auteur : gameplay_dkag015_1927. Candidate isolée, sans auto-approbation.
Base : 84311a716fa722cd20b4e725a72fd15f60511291 (ville PR9).
Briefs : contrôle d9f5c84267c560863c8bdc41d281d17d489c9d9a ; réservation initiale 391e8d0aaf331e9975845b6b30b3641dbc54dc7d.

## Réalisé

Le répertoire affiche les activités visibles de chaque lieu depuis ses Action existantes : libellé, coût et gain FCFA, durée réelle des actions temporisées, variations des besoins et raison d’indisponibilité. `faim` positive est décrite comme satiété positive, conformément à GameState.adjust. Les flux spéciaux sont décrits comme menu dédié, sans inventer de durée jouable. Un lieu sans action visible le dit explicitement.

`openPlaces` conserve son handler de repère inchangé. Aucun lancement d’action, achat, gain, compteur ou save ajouté. Main ne reçoit que l’import et l’appel du formatter. Les prix, les actions, le schéma et les assets restent ceux de la base. Présentation française et équilibre fictif : unverified, aucune attestation culturelle.

## Vérification réellement exécutée

- `npm test` : 33/33 PASS dont six tests du formatter (travail, alimentation, repos, visibilité, priorité requires/coût, flux spécial et non-mutation du save).
- `npm run typecheck` : PASS.
- `npm run build` : PASS (Vite 5.4.21, 48 modules).
- `node --check scripts/check-city-life.mjs` : PASS.
- `git diff --check -- src/main.ts scripts/check-city-life.mjs` : PASS.
- Essai réel `chromium.launch` : executable Chromium1194 absent. Parcours navigateur local_not_run, aucune capture locale prétendue. Le script existant conserve ses assertions ville et ajoute desktop/touch : aperçu travail/alimentation/repos, raison d’épuisement, sélection réelle click/tap sans effet wallet/besoins/compteurs/save, action repos réelle. Les observations avant/après repère sont synchrones dans l’événement pour isoler le changement du drainage normal au frame suivant.

Node_modules est le lien vers les dépendances existantes du checkout dkag019 ; aucun package/lock modifié. Trois blobs JPG historiques absents empêchent diff global local : seuls les chemins réservés sont publiés par le parent à partir du tree GitHub de base intact.

## Handoff

Les cinq fichiers autorisés sont prêts pour freeze source et reviewer distinct qa_dkag015_1927. Parent publie par CAS, conserve PR brouillon et attend la CI réelle au SHA exact. Pas de push, mutation GitHub, merge ni déploiement de l’auteur. Les contrôles navigateur sont ajoutés mais restent non vérifiés avant CI.
