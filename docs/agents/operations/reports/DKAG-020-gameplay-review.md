# DKAG-020 — revue QA indépendante initiale

Reviewer : `qa_dkag020_0128`, distinct de l’auteur `gameplay_dkag020_0128`. Statut : **REVIEW — CI navigateur en cours**, candidate non fusionnée et non publiée.

## Autorité et périmètre

Briefs lus explicitement depuis la branche de contrôle au commit `03c696527d6dc084ee9465487a5cf8ec35183781` : `AGENTS.md`, `docs/agents/STUDIO.md`, `docs/agents/STATE.json`, `docs/agents/operations/RUNBOOK.md`, `docs/agents/operations/QUEUE.json`, `docs/agents/roles/qa.md` et la revue finale DKAG-015. Le registre a ensuite été réconcilié par le producteur au commit `2c4766e5d7a24357470eb4349b62bb0b0f626283` avec la source gelée ci-dessous. La QA est réservée au présent rapport uniquement ; aucune source, ref ou PR n’a été mutée.

Source gelée : `9632c7666cf76dbd23a8de4b50d44c31fe85e07e`, tree `3e8c90f8f68ea3c87d83939ff1562fd85158800e`, parent/base `e6c678a0e0ab9c6d5a000c58740b6231d59cf187`. PR20 brouillon, branche `codex/agents/dkag-020-place-summary-current`, base `wip/visual-pass`.

## Diff exact et lecture statique

Outils GitHub utilisés : `fetch_commit`, `fetch_pr`, `list_pr_changed_filenames`, `fetch_pr_patch`, `fetch_file`, lecture des runs/jobs/étapes. Le diff GitHub contient exactement les cinq chemins réservés :

- `src/ui/placeSummary.ts` ;
- `tests/place-summary.test.ts` ;
- `src/main.ts` ;
- `scripts/check-city-life.mjs` ;
- `docs/agents/reports/DKAG-020-gameplay.md`.

`src/main.ts` ne reçoit que l’import du formatter et son appel dans le champ `detail` de `openPlaces`; le gestionnaire `onPick` reste strictement la pose du repère, fermeture de modale et toast. Aucun ancien `main.ts` n’est recopié et les mouvements, animations, performances, activités, économie et sauvegarde de la base courante restent hors diff.

Le formatter lit les objets `Action` actuels : filtre `visible` avant `requires`, montre coûts/gains, durée ou flux spécial, effets de besoins, puis applique la priorité `requires` avant insuffisance du wallet. Il ne lance aucune action et ne modifie pas l’état. Les six tests dédiés couvrent valeurs courantes, wallet dynamique, repos, invisibilité avant prérequis, priorité du motif et flux spécial.

Le script navigateur conserve la suite Living Dakar existante et ajoute les assertions desktop/tactile demandées : travail, nourriture, repos, motif d’indisponibilité, repère sans effet wallet/besoins/compteurs/save et exécution réelle du repos. Aucun retrait d’assertion observé.

## Preuves disponibles

L’auteur rapporte sur la source gelée : `npm test` **128/128 PASS** sur 13 fichiers (formatter 6/6), `npm run typecheck`, `npm run typecheck:server`, `npm run build`, `node --check scripts/check-city-life.mjs` et `git diff --check` PASS. Le navigateur local est correctement déclaré `local_not_run`; cette session QA n’a pas disposé d’un checkout indépendant et ne transforme pas les résultats auteur en exécution indépendante.

À la dernière lecture :

- run PR `38192271378`, job `114627363316`, head exact `9632c766…` : `in_progress`; checkout/setup/npm ci/npm test/typecheck serveur/build/installation Chromium réussis, `check:city` en cours, `check:online`, `check:launch` et artifact encore pending ;
- run push `38192251481`, job `114627304089`, même head exact : état identique, `in_progress` sur `check:city`.

Aucun résultat navigateur ni artifact complet n’est donc attesté dans ce cycle. Les conclusions finales et logs doivent être relus au SHA exact au prochain cycle, sans refaire le code.

## Décision

**REVIEW / pending CI.** Le diff exact est borné, cohérent avec les critères et ne présente pas de défaut statique reproductible. La qualification READY reste interdite tant qu’au moins une exécution exacte n’a pas terminé avec succès les contrôles navigateur requis et que ses logs/artifacts n’ont pas été inspectés.

Limites : le profil `phone` est un viewport/touch Playwright, pas un appareil physique. Prix, textes français et équilibre sont fictifs et **unverified** ; aucune revue humaine sénégalaise nommée, donc aucune attestation `practitioner-approved`. PR brouillon seulement, non fusionnée, non déployée et non publiée.

Prochain propriétaire : QA d’un prochain cycle. Relire les runs `38192271378` et `38192251481`, leurs jobs/logs/artifacts au SHA gelé, puis décider READY ou renvoyer un défaut précis à l’auteur. Aucun correctif auteur demandé à ce stade.
