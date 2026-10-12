# DKAG-020 — aperçu des activités sur la base Living Dakar actuelle

Auteur : gameplay_dkag020_0128. Candidate isolée, sans auto-approbation.
Base exacte : e6c678a0e0ab9c6d5a000c58740b6231d59cf187.
Contrôle assigné : 03c696527d6dc084ee9465487a5cf8ec35183781.

## Réalisé

Le répertoire « Coins du quartier » décrit maintenant les actions réellement visibles de chaque lieu depuis les objets `Action` de la base courante : libellé, coût ou gain, durée, effets sur les besoins et raison d’indisponibilité. Les actions invisibles sont omises avant l’évaluation de leurs prérequis. Les flux spéciaux sont annoncés comme « menu dédié » sans leur inventer une durée.

Le portage est sémantique : `src/main.ts` et `scripts/check-city-life.mjs` proviennent intégralement de la base e6c678a et ne reçoivent que l’import/appel du formatter et les assertions dédiées. Les mouvements, animations, performances, activités composées, économie et sauvegarde actuels sont préservés. Choisir une entrée reste uniquement la pose d’un repère à pied : aucun lancement d’action, achat, gain, compteur ou sauvegarde n’est ajouté.

## Vérification

- `npm test` : **128/128 PASS**, 13 fichiers, dont 6 tests dédiés au formatter.
- `npm run typecheck` : PASS.
- `npm run typecheck:server` : PASS.
- `npm run build` : PASS, Vite 5.4.21, 82 modules.
- `node --check scripts/check-city-life.mjs` : PASS.
- `git diff --check` sur les cinq chemins réservés : PASS.
- Navigateur local : **local_not_run** ; le parcours exact reste à exécuter par la CI. Le script couvre desktop et tactile, l’aperçu travail/alimentation/repos, la raison d’indisponibilité, l’absence d’effet du repère et l’activité de repos existante.

## Limites et culture

Les prix, effets et libellés français sont ceux de l’équilibre fictif existant. Statut culturel : **unverified** ; aucune attestation de praticien sénégalais n’est revendiquée. La QA indépendante et la CI exacte restent nécessaires avant qualification de la candidate.

## Handoff

Les cinq fichiers réservés sont remis au parent pour gel et publication CAS. Aucun push, update de ref, PR, merge ou déploiement n’a été effectué par l’auteur.
