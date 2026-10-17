# DKAG-008 — Revue QA indépendante

Date : 8 octobre 2026, UTC. Reviewer : `qa_resume_1655`, distinct de l'auteur `combat_resume_1655`. Reprise après interruption de `qa_20261008_1328`, sans reprendre son accord ou inventer ses tests.

Autorité relue : contrôle `feac8c3da1cefd766f43794133d135ea6a99853e`, AGENTS, STUDIO, RUNBOOK, rôle QA, QUEUE et STATE dans `resume-context.json`; réservation du rapport au registre `a26b4e6eae411d13b5f4aa187e4a02eec8e2377a`. Ancien rapport local lu pour continuité.

Base : `0af76c38b152df885c0c27352aa43ac320aa71af`. Source figée et revue : `55def6b14e7cdf47d9ca0e0885a6e5950219c920`. Branche : `codex/agents/dkag-008-duel-input-reset`. [PR #13](https://github.com/zayd95/dakar-rek/pull/13), brouillon. **Statut QA final : ready pour acceptation de candidate isolée; validation locale indépendante et CI push/PR complètes réussies, relues à 17:15 UTC.** Aucun défaut bloquant. Aucune fusion/publication attestée.

## Diff et critères

GitHub `github_compare_commits` exécuté sur base/source exactes : un commit, cinq fichiers seulement, tous réservés. Diff complet également lu via Git dans le checkout QA détaché au commit exact. Les autres blobs, packages, lock, workflows, assets et modules réseau/sauvegarde sont préservés. `duel.ts` ne change que la propriété et la consommation des entrées, l'initialisation et le nettoyage; règles, phases, récompenses et animations inchangées.

| Critère | Preuve indépendante |
| --- | --- |
| Blur/hidden effacent garde et saisies en attente | Tests unitaires et fixture navigateur, état du fighter et style UI vérifiés; callback purge `Input.takeAction()` et `me.guard` |
| Nouvelle touche/tap après retour | Tests unitaires et vrai clavier/tap Playwright; une saisie seulement consommée |
| Annulation/perte du pointeur | `pointercancel` et `lostpointercapture` sur boutons, annulation fenêtre, release/leave et touches simultanées; reset sans replay; capture implicite perdue après release normal ne supprime pas le tap |
| Saisie formulaire inactive en combat | input, textarea, select et contenu éditable; navigateur avec `contenteditable=""` et descendant; focus reset, `isContentEditable`, suppression avant consommation de l'action partagée |
| Dispose et remplacement | Retrait de tous les listeners détenus par DuelInput, idempotence, ancienne UI inerte et une seule nouvelle instance active; un seul grab |
| Périmètre du combat préservé | Diff GitHub/Git limité aux cinq fichiers; constants, loop physique, AI, résultat, clips inchangés |
| Tests significatifs et source exacte | 16 nouveaux tests déterministes, exécution indépendante des 48 tests et 28 vérifications navigateur; CI push au SHA exact et CI PR au merge synthétique explicitement identifié réussies |

Aucun défaut bloquant trouvé dans le diff ou les exécutions locales. Les tests ne sont pas des assertions supprimées pour faire passer une suite : le test de capture implicite conserve précisément la régression trouvée par l'auteur. QA n'a corrigé ni source ni assertion.

## Exécution indépendante réelle

Checkout QA isolé : `/workspace/scratch/5677b8b0fdd0/qa-combat`, créé par `git fetch origin 55def6b14e7cdf47d9ca0e0885a6e5950219c920` puis `git worktree add --detach`; `git rev-parse HEAD` confirme ce SHA. `git status --short` vide après les contrôles.

Environnement : Node `v24.19.0`, Vitest `2.1.9`, Vite `5.4.21`, Chromium installé pour Playwright. `npm ci` utilise le lock inchangé (96 packages), sans ajout de dépendance.

| Commande exécutée par QA | Résultat |
| --- | --- |
| `npm test` | 48/48, six fichiers; 16 tests dans duel-input.test.ts, à 17:01:46 UTC |
| `npm run build` | PASS : typecheck client et 44 modules compilés |
| `npm run typecheck:server` | PASS |
| `git diff --check` | PASS |
| `node scripts/check-duel-input.mjs /workspace/scratch/5677b8b0fdd0/qa-combat-evidence` | 28/28 PASS, 14 desktop + 14 viewport tactile, zéro erreur runtime |

Résultats navigateur et captures locales : `/workspace/scratch/5677b8b0fdd0/qa-combat-evidence/results.json`, `desktop-duel-input-fixture.png`, `touch-duel-input-fixture.png`. Le test charge les vrais modules LambDuel/Input/DuelInput et leur vraie UI, sans renderer/chargement 3D; événements interruption synthétiques, touches/taps Playwright réels. Il n'est pas intégré au runner CI existant; réussite locale distincte de la CI.

## CI distante

Lecture GitHub actuelle : `github_fetch_commit_workflow_runs` source exacte, puis `github_fetch_workflow_run_jobs`.

Événements et source lus indépendamment via `github_fetch` de l'API runs filtrée par head_sha : PR `37813286790` (`event=pull_request`) et push `37813282258` (`event=push`), tous deux `head_sha=55def6b14e7cdf47d9ca0e0885a6e5950219c920`. Les wrappers résumés masquaient l'event et ne renvoyaient qu'un des runs; le JSON complet a permis de corriger un label provisoire.

[Run push 37813282258](https://github.com/zayd95/dakar-rek/actions/runs/37813282258), job `113435326707` : completed/success, logs complets relus. Checkout **direct** `55def6b14e7cdf47d9ca0e0885a6e5950219c920` confirmé par fetch et `git log -1 --format=%H` à 17:01:08 UTC; pas un merge synthétique.

- CI Ubuntu 24.04, Node 22.23.3 : npm ci, 48/48 tests dont les 16 nouveaux, typecheck serveur et build PASS.
- Réseau : 17 lignes PASS, aucune ligne FAIL.
- Launch : contrôles invitation, joystick/focus, petites vues et restauration de sauvegarde PASS; Aïda 52/52.
- Parcours général bureau et viewport tactile : PASS, dont duel local avec victoire observée à 17:07:22 UTC, tribunes/gate/toiture/foule, scènes et sauvegarde; wrapper full desktop/phone success à 17:09:53 UTC.
- Artefact `multiplayer-checks`, ID `11566476982`, upload success. Le fixture dédié de 28 vérifications n'est pas lancé par cette CI; il reste preuve QA locale séparée.

[Run PR 37813286790](https://github.com/zayd95/dakar-rek/actions/runs/37813286790), job `113435340683` : completed/success, API raw/run, job/étapes et logs relus indépendamment à 17:15 UTC. Checkout **merge synthétique** `0a05d5c727f40db583f862321fc2e6b8ff7ead73`, annoncé dans les logs comme merge de `55def6b14e7cdf47d9ca0e0885a6e5950219c920` dans la base `0af76c38b152df885c0c27352aa43ac320aa71af`. Aucun merge réel de branche attesté. Logs : 48/48 unitaires, serveur/build PASS, 17 contrôles réseau PASS, Aïda 52/52, gameplay bureau/tactile PASS (duel gagné à 17:10:42 UTC), wrapper complet success à 17:14:36 UTC. Artifact `11566063680` upload success. Les BlobNotFound temporaires constatés pendant exécution ne sont plus un blocage; la preuve finale vient des vrais logs disponibles, pas de l'état partiel ancien.

Signal secondaire dans npm ci distant : 9 vulnérabilités annoncées (3 moderate, 4 high, 2 critical). Aucun audit détaillé réalisé ni exploit affirmé. Le lock étant inchangé, ce signal n'est pas une régression attribuée au correctif et ne donne pas autorité de modifier les dépendances; à commissionner séparément.

## Limites et handoff

L'attestation culturelle du làmb reste provisoire/unverified; aucune nouvelle règle culturelle n'est ajoutée. Un viewport tactile n'est pas un téléphone physique; ce fixture UI n'est pas un parcours 3D complet. La CI existante couvre séparément le parcours 3D et le duel normal; elle ne couvre pas le fixture dédié interruption, exécuté localement par QA. Aucune vérification de version active Cloudflare ou de production.

Prochain propriétaire : producteur. Plus petite action : accepter la candidate vérifiée au SHA ci-dessus dans le registre, publier ce rapport réservé par CAS, puis libérer les réservations de ce lot. Le reviewer n'effectue aucun commit, push, mutation GitHub ou auto-approbation de l'auteur; toute publication/déploiement reste hors autorisation.
