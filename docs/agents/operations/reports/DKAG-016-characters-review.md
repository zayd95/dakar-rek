# DKAG-016 — Revue indépendante Personnages

Reviewer : `qa_ibou_1701`, distinct de l'auteur `characters_resume_1655`. 8 octobre 2026, vérifications de 17:08 à 17:18:22 UTC. Statut final de cette revue : **review — CI push en cours**, aucun défaut bloquant identifié dans le code ou les parcours exécutés. Candidate, jamais publiée.

## Sources et périmètre

Briefs AGENTS/STUDIO/RUNBOOK/STATE/tâche/design/Personnages intégralement lus dans `ibou-task-context.json` (contrôle `c089dce66e972d8785208e0cb64055ddb954430f`, réservation `e3cdf9ad3c697a51d50bca3766f6ea51364befda`). Brief QA intégralement lu dans `resume-context.json`, contrôle `feac8c3da1cefd766f43794133d135ea6a99853e`.

Sources publiées figées `a26e90543641c1fe0ef396f8938598de9897940f`, base `0af76c38b152df885c0c27352aa43ac320aa71af`. Checkout détaché indépendant `/workspace/scratch/5677b8b0fdd0/qa-ibou`, créé après fin de l'auteur par `git fetch origin codex/agents/dkag-016-ibou-followup` puis `git worktree add --detach ... a26e905...` depuis `/workspace/scratch/608bc7678079/dakar-rek-cycle`.

Compare GitHub exact et diff Git local inspectés : seulement les quatre fichiers réservés, 216 ajouts, aucune suppression : `src/social/beats.ts`, `tests/social.test.ts`, `scripts/check-ibou-followup.mjs`, `docs/agents/reports/DKAG-016-characters.md`. Tous les autres blobs préservés. PR #14 relue : open/draft, non fusionnée, head exact, base exacte.

## Critères inspectés et réellement testés

| Critère | Preuve | Résultat |
| --- | --- | --- |
| Accueil terminé ET `modou_trust`; shifts seul insuffisant | Test trois combinaisons négatives, appel direct sans effets; menus accueil seul puis Modou réel | PASS |
| Confirmation +2 joueur–Ibou, flag et completion uniquement | Comparaison état entier en test et dans les deux navigateurs | PASS |
| Refus neutre répétable et beat toujours disponible | Cinq refus unité, deux par viewport puis reload réel | PASS |
| Rejeu/double appel/choice étrangère/préconditions manquantes | Garde identitaire limitée au nouvel ID; tests foreign/clone/beat clone/stale; double clic/bouton conservé navigateur | PASS |
| Save roundtrip et absence de replay après reload | migrate/JSON unité et UI Sauvegarder/reload navigateur | PASS |
| Ordre existant, Aïda/Modou et cast préservés | Ajout à la fin, aucun ancien beat changé, test ordre exact, tests Aïda et Modou historiques relancés; chat Ibou disponible | PASS |

## Exécution indépendante

Node `v24.19.0`, `npm ci --offline` : 96 packages, lock inchangé. Vitest `2.1.9`, Vite `5.4.21`.

- `npm test` : **37/37**, cinq fichiers; sociaux 20/20, dont cinq nouveaux.
- `npm run build` : **PASS**, tsc puis Vite, 43 modules.
- `npm run typecheck:server` : **PASS**.
- `git diff --check 0af76... HEAD` : **PASS**.
- `node scripts/check-ibou-followup.mjs /workspace/scratch/5677b8b0fdd0/qa-ibou-evidence` : **22/22**, exit 0; 11 desktop, 11 viewport tactile. Menus, choix et sauvegardes réels; fixture position/qualité uniquement; requêtes externes bloquées; dist compilé exact servi localement. Screenshots vus : texte/choix lisibles, aucun débordement apparent.
- `git status --short` après exécution : vide; aucune source/assertion modifiée par QA.

Résultats et captures : `qa-ibou-evidence/results.json`, `desktop-ibou-followup.png`, `touch-ibou-followup.png` dans le cwd indiqué. SHA-256 identiques au rapport auteur : beats `064ce220ba669b8d11fccaa8eb5c92156548c5a2bec04c431c3e3d5fccfa0bbb`, tests `d6a60b1aad137329bdabb58d5f2a5b82133cf89e8e9dd3c10592ad9b24f21320`, harness `3c2e84bfc45466156dd5b1354c1a53541d07c03b3d5f1bf07fa41f2f601278ca`.

## CI actuelle et limites

GitHub `fetch_commit_workflow_runs` n'a retourné que le run PR **37814046695**, ce qui ne prouve pas l'absence d'autres runs. Lecture directe `/actions/runs?head_sha=a26e90543641c1fe0ef396f8938598de9897940f&per_page=20` : deux runs exacts, PR **37814046695** / job **113437958694**, et push **37814040671** / job **113437938276**, tous deux in_progress. Leurs steps npm ci/test/typecheck serveur/build/install Chromium/check:online sont success; check:launch en cours et upload artifact pending lors de la lecture. Logs job PR 404 BlobNotFound pendant l'exécution : absence transitoire de logs finalisés, pas un résultat CI inventé. Recherche du merge SHA PR `a91153fd4050a141ebcec7f9a1b642a5a1746378` : aucun run retourné alors; la métadonnée du run PR confirme bien head a26e905/base0af76.

Lecture finale PR à 17:16 UTC : **37814046695 completed/success**, logs complets du job113437958694 obtenus et lus. Checkout réel de CI `a91153fd4050a141ebcec7f9a1b642a5a1746378` (merge PR14), pas le head directement. `git fetch origin a91153...` puis `git rev-parse HEAD^{tree} a91153...^{tree}` prouvent un arbre identique à a26e905 : **d2c69af87e9bceb18995ddcd103e4ae69a0bb120**. Logs : 37/37 unités, build/typecheck serveur PASS, 17 checks réseau PASS, Aïda 52/52 PASS, suite gameplay desktop/tactile complète PASS, artifact **11566637617** (56 fichiers, 18153582 octets). Le push reste pending à la dernière lecture, donc statut global review.

Le harness Ibou dédié n'est pas raccordé au workflow existant : ses 22/22 sont une preuve locale indépendante, pas une CI dédiée. Les logs npm ci signalent **9 vulnérabilités : 3 moderate, 4 high, 2 critical**, sans détail de packages inspecté; dette des dépendances lock inchangées, hors tâche et aucun autofix exécuté. Pas de téléphone physique, test de production, attestation Cloudflare, conseiller culturel ni génération payante. Dialogue français fictif **unverified**. Les défauts globaux de replay d'anciens beats hors Aïda/Ibou restent hors périmètre; cette candidate n'en revendique pas la correction.

## Handoff

Dernière lecture directe à **17:18:22 UTC** : PR37814046695 completed/success, push37814040671 in_progress/conclusion null au head exact inchangé. Attente terminée à la borne assignée, aucun test refait ni assertion changée.

Prochain propriétaire : producteur. Plus petite action : reprendre uniquement la CI push37814040671/job113437938276 et ses logs finalisés au head a26e905 avant classement candidate vérifiée; aucune réimplémentation nécessaire. Aucune fusion/déploiement ni modification de ref effectuée par QA.
