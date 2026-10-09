# DKAG-017 — revue indépendante de la chute unique

Statut : **review — validation locale réussie, CI en cours**. Reviewer : `qa_animation_1707`, distinct de l’auteur `animation_resume_1655`. Date : 8 octobre 2026. Source exacte : `25bbb40e7882ccbd06e2181689982d0f0085b504`; base : `0af76c38b152df885c0c27352aa43ac320aa71af`. PR brouillon : https://github.com/zayd95/dakar-rek/pull/15. Briefs AGENTS/STUDIO/RUNBOOK/STATE/QA/tâche/design transmis depuis contrôle `e3cdf9ad3c697a51d50bca3766f6ea51364befda`; réservation QA : `d0cb9128d3333efd0face85255aedcc6eef88775`.

## Isolation et revue de périmètre

Après publication et gel annoncés par le coordinateur, `git fetch origin 25bbb40…` puis `git worktree add --detach /workspace/scratch/5677b8b0fdd0/qa-animation 25bbb40…` ont créé un checkout indépendant. Aucun test ou changement du checkout auteur, aucune mutation GitHub ou push par QA.

`git diff 0af76… HEAD --stat` et lecture complète des quatre fichiers confirment exactement les chemins réservés : `src/actors/humanoid.ts`, `tests/humanoid-animation.test.ts`, `scripts/check-fall-animation.mjs`, `docs/agents/reports/DKAG-017-animation.md`. Tous les autres blobs sont inchangés, notamment duel/règles/phases, assets, package/lock, sauvegarde/réseau et workflows.

Le code configure seulement Fall_Back en LoopOnce/clampWhenFinished; reset() précède la configuration et permet sa reprise après un autre clip. Les autres clips restent LoopRepeat/Infinity avec clamp=false. Le garde-fou déjà existant sur clipName empêche un redémarrage automatique à chaque update. Aucun défaut bloquant trouvé dans le diff.

## Exécution indépendante au SHA exact

- `npm ci --offline --ignore-scripts` : PASS, 96 packages installés depuis lock/cache, sans changement de package ou lock.
- `npm test` : **37/37**, six fichiers; cinq tests dédiés emploient le vrai THREE.AnimationMixer et un loader/clip synthétique. Pose intermédiaire, clamp final maintenu cinq secondes, retour Stance→Fall_Back, boucles Stance/Grab/Celebrate vérifiées.
- `npm run build` : PASS, tsc client/Vite 5.4.21, 43 modules, build généré localement.
- `npm run typecheck:server` : PASS.
- Dans une seule commande shell : `npm run dev -- --host 127.0.0.1 --port 5187` avec attente locale bornée, puis `node scripts/check-fall-animation.mjs http://127.0.0.1:5187/` : **PASS**, Chromium local/WebGL SwiftShader. Les premiers curl ont constaté l’attente normale du démarrage; aucun échec d’assertion ni correction n’a été nécessaire.

Le navigateur charge réellement le GLB existant et les sources Vite Humanoid/LambDuel, calcule les deux issues depuis des efforts contrôlés en fin de clinch, puis rend les modèles avec la caméra réelle du duel (17 draw calls pour chaque issue). Pour victoire joueur et victoire adversaire, à 0,7 / 1,3 / 2,5 / 4,3 s, root.position reste `[0,-0.8500000238418579,-0.8999999761581421]`, action.time `0.6000000238418579`, paused=true. Les échantillons 2,5 et 4,3 s sont en result. Celebrate conserve LoopRepeat. Le défaut de retour de la racine à chaque raccord de 0,6 s est donc corrigé avec l’asset réel.

## CI réellement observée

Lecture GitHub directe `actions/runs?head_sha=25bbb40…` : deux runs au SHA exact, **encore in_progress**, sans conclusion ni logs finaux disponibles lors de la revue :

| Événement | Run | SHA source |
| --- | --- | --- |
| push | https://github.com/zayd95/dakar-rek/actions/runs/37814723950 | `25bbb40e7882ccbd06e2181689982d0f0085b504` |
| pull_request #15 | https://github.com/zayd95/dakar-rek/actions/runs/37814728980 | `25bbb40e7882ccbd06e2181689982d0f0085b504` |

Le wrapper fetch_commit_workflow_runs ne retournait que le run PR; les métadonnées brutes ont permis de distinguer push et PR. Aucune CI success inventée. Le nouveau check navigateur dédié n’est pas raccordé au workflow existant, volontairement inchangé; il a été exécuté localement, les tests mixer sont découverts par npm test.

## Limites et handoff

Les issues sont des fixtures d’effort, pas deux parcours gagnés via commandes UI. Playback réellement rendu mais aucune capture inspectée visuellement; cette revue ne certifie pas clipping, contact au sol, articulations, performance FPS, téléphone physique ou authenticité culturelle. L’asset demeure TEMP/unverified. Le fallback de chargement et les raccords des autres clips restent hors tâche, inchangés. Aucun achat/génération/service, merge ou déploiement.

Avis QA : critères techniques locaux satisfaits, aucun correctif demandé. Prochain propriétaire : coordinateur, pour publier ce seul rapport réservé et conserver review tant que les CI ne sont pas terminées. Plus petite action : relire les deux runs et leurs journaux finaux au SHA exact; si succès, accepter comme candidate vérifiée, jamais comme version publiée.
