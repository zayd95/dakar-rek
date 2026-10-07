# DKAG-002 — Livraison et exploitation de Dakar Rek

Audit en lecture seule, 7 octobre 2026. Statut : **ready pour revue indépendante**, pas une autorisation de publier. Aucun test runtime, probe du jeu, déclenchement de workflow ou changement externe n'a été effectué par cet audit.

## Carte factuelle

| Niveau | Source inspectée | Ce que la preuve établit | Ce qu'elle n'établit pas |
| --- | --- | --- | --- |
| Base du bootstrap | `main@547bb1e8077127094a3fc647821cf6ac73d2a42c` | Guide/agent Cloudflare et watcher existants; package principal avec commandes solo | N'est pas la candidate visuelle ni une preuve du serveur publié |
| Candidate visuelle | `wip/visual-pass@00abf96efeadcc8bdb8d4c859eb1d0258b0978b7` | Package réseau, suites Chromium, workflow Game checks et documentation d'intégration | Ne prouve pas que cette candidate est déployée |
| Branche documentée de production | Guide `docs/CLOUDFLARE_OPS.md` à `main@547bb1e` : `codex/launch-controls` | GET GitHub du 7 octobre résout cette branche à `6216bb80db6bb7d777997e70d1681fa71240b057`; check `Workers Builds: dakar-rek` completed/success | La lecture GitHub ne confirme ni la configuration Cloudflare actuelle ni la version active du Worker |
| Site surveillé | Logs du run [37675418116](https://github.com/zayd95/dakar-rek/actions/runs/37675418116), checkout `main@547bb1e`, Ubuntu 24.04, Node 22.23.3 | URL effective `https://dakar-rek.habibjallow95.workers.dev/`, branche suivie `codex/launch-controls`; 10/10 checks protocolaires PASS, 19:34:29 UTC | Ne relie pas les assets servis à `00abf96` ou `6216bb80`; aucune mesure de rendu ou de téléphone |
| CI candidate | Run [37666914815](https://github.com/zayd95/dakar-rek/actions/runs/37666914815), head `00abf96`, créé 18:27:01 UTC | Conclusion success; étapes test, typecheck serveur, build, check:online et check:launch success | Résultat historique, pas une nouvelle exécution dans ce bootstrap |

## Contrôles réellement présents

| Commande | Snapshot et portée inspectée | Limites |
| --- | --- | --- |
| `npm test` | `main@547bb1e` et `visual@00abf96` : `vitest run` | Pas une preuve de parcours complet ou d'intérêt du jeu; inventaire des assertions unitaires non audité ici |
| `npm run typecheck`, `npm run build` | Les deux packages : TypeScript client; build Vite | Validité de compilation seulement; build solo par défaut |
| `npm run typecheck:server` | Package visual; TypeScript `server/tsconfig.json` | Absent du package main inspecté; ne mesure pas le comportement réseau |
| `npm run check:online` | Visual : `scripts/check-multiplayer.mjs`, runtime Wrangler local par défaut, deux contextes Chromium, quatre hubs, avatar/mouvement/emote/profil, intérieur public/privé, reconnexion, 25 connexions supplémentaires pour débordement, message invalide | Peut cibler un Worker externe et créer des joueurs de test; ne pas l'exécuter sur production dans ce lot. Débordement d'un groupe de 24 ≠ capacité maximale mesurée |
| `npm run check:launch` | Visual : `scripts/check-launch-controls.mjs --full`, Wrangler local, qualité/intérieurs, joystick/focus, profil/invitation, viewport étroit, scroll tactile simulé, récupération de sauvegarde; appelle `scripts/shots.mjs` | Chromium/SwiftShader avec viewports et hasTouch, pas deux téléphones. Usage important de `window.__dakar` pour placer/ouvrir les scènes : ne prouve pas le parcours sans debug depuis la première page |
| `node scripts/shots.mjs <base> <out>` | Visual, appelé par check:launch : hubs, déplacements/intérieurs, dibiterie, combat local, arène/visibilité/toiture/foule, voyage, sauvegarde, social et scènes; captures et erreurs navigateur | Quelques assertions étroites : collision « position finie » ne garantit pas tous les obstacles. Captures ne valent pas revue artistique/culturelle ou retour de joueurs |
| `node scripts/check-production-presence.mjs` | Main : HTML, health protocole 1 et valeur roomCapacity 24, deux clients dans chaque hub, emote, départ/reconnexion, rejet malformed; jusqu'à trois connexions diagnostiques, groupe 128; lecture optionnelle des checks GitHub | Smoke réseau sans rendu. Health annonce un plafond; aucune preuve de charge. Un build pending/missing peut laisser PASS; un build terminé success/neutral/skipped est accepté. PASS ≠ attestation du commit déployé |

Les comptes 23/23 unitaires, 17/17 réseau et 49 contrôles gameplay sont **rapportés historiquement** par `docs/INTEGRATION_2026-10-07.md@00abf96`, en session cloud Chromium/SwiftShader. Cet audit a directement lu les étapes CI réussies, mais n'a pas recompilé ni recompté les logs de cette suite.

## Surveillance et publication : réutiliser l'existant

- `.claude/agents/dakar-cloudflare-ops.md@547bb1e` existe, avec isolation worktree et MCP Cloudflare nécessitant une connexion OAuth confirmée. Sa définition ne démontre pas une session connectée ou une IA permanente.
- `.github/workflows/cloudflare-ops.yml@547bb1e` définit `17 * * * *`, push ciblé et workflow_dispatch. Il lit contents/checks, conserve `production-presence` sept jours, sans secret Cloudflare. Le job et les logs du run 37675418116 attestent une exécution **push**, pas encore une exécution schedule. La collection des 16 runs retournés contient deux watches push réussis et aucun watch schedule à cette lecture.
- Les logs attestent l'upload de l'artifact [11505898395](https://github.com/zayd95/dakar-rek/actions/runs/37675418116/artifacts/11505898395). L'archive JSON n'a pas été téléchargée ici; les preuves de 10/10 sont les logs du job 112977544016.
- Le workflow visual `Deploy Dakar Rek` est manuel. Le guide plus récent main décrit en plus Workers Builds lié à la branche de production et une publication possible à chaque push. Ne pas interpréter « aucun push ne publie » dans l'ancien LAUNCH comme une protection actuelle.
- Le watcher produit des preuves; aucune réparation IA déclenchée automatiquement n'est démontrée. Ce bootstrap n'installe aucun scheduler, service, accès ou quota.

## Conflits et limites à résoudre

1. `LAUNCH.md` et `INTEGRATION_2026-10-07.md@00abf96` décrivent vers 18 h les anciens previews `ludicrous-emoji`/`cyclic-echinodon` inaccessibles et la présence « pas en ligne ». Le guide main et le watch exécuté à 19:34 concernent l'adresse propriétaire différente. Les anciens constats restent datés; **ils ne prouvent pas une panne actuelle** de cette adresse.
2. `main@547bb1e` n'a pas `typecheck:server`, check:online ou check:launch dans son package. Les commandes conseillées par l'agent ops exigent de partir du vrai code de production/candidate, pas du seul bootstrap main. Ref et contenu doivent être vérifiés avant affectation.
3. Branches, checks et URL surveillée ne composent pas encore une attestation source → build → déploiement actif. Une vérification authentifiée Cloudflare en lecture seule est nécessaire avant toute publication ou récupération.
4. La présence partagée n'est pas un combat partagé, compte persistant ou ledger économique; ces livraisons sont encore à construire selon la documentation visual. Les limites 24 joueurs/groupe et 128 groupes/quartier ne sont pas une capacité validée.
5. Aucun parcours novice sans debug, benchmark sur téléphone physique, test longue durée/charge, retour joueur ou validation culturelle n'a été produit ici. Combat sans frappe et représentations restent `unverified`; revue d'un praticien/conseiller sénégalais nommé requise pour toute affirmation culturelle importante.

## Trois prochaines tâches proposées (aucune publication implicite)

| Tâche | Propriétaire | Dépendances | Preuve attendue |
| --- | --- | --- | --- |
| Relier source, build et version active | Agent **dakar-cloudflare-ops existant** | Session dédiée; OAuth et compte/Worker confirmés; lecture seule, refs revérifiées | Compte/Worker, configuration de branche, version active, commit connu ou explicitement non traçable, date et URL; tableau signé par reviewer |
| Préparer une candidate unique sans modifier les branches réservées | Producteur/intégrateur | Handoff explicite de Claude, carte précédente, contrat client/serveur et comparaison des refs | Plan d'intégration réversible sur branche dédiée, fichiers réservés, version précédente identifiée et critères; aucune fusion/push production sans tâche autorisée |
| Recetter la candidate depuis la première page | QA indépendante | Candidate accessible sur environnement de recette approuvé; commandes présentes à son commit | Logs et captures datés, parcours sans API debug, deux téléphones nommés/connexions distinctes, tactile/reconnexion/sauvegarde; limites et défauts reproductibles |

## Handoff

- **Status : ready** pour reviewer; l'auteur n'approuve pas son rapport.
- **Fichier changé :** `docs/agents/reports/DKAG-002-release.md` uniquement.
- **Preuves directement inspectées :** contrats/tâche/état/snapshots locaux; packages main/visual, scripts de contrôle aux commits explicites, workflows/guide/agent existants; GET GitHub des runs, jobs, logs watch, branche et check-runs (7 octobre 2026). Sources GitHub : `/actions/runs?per_page=20`, `/actions/runs/37675418116/jobs`, logs du job 112977544016, `/branches/codex/launch-controls`, `/commits/6216bb80db6bb7d777997e70d1681fa71240b057/check-runs`.
- **Résultats :** lecture statique et historique CI seulement; watch historique 10/10, candidate CI success. Zéro nouveau test/runtime/probe/déploiement. Pas de credential lu ou changé.
- **Limites :** configuration/version Cloudflare active, continuité horaire, expérience réelle, appareils physiques et charge non attestés; archive artifact non ouverte.
- **Hypothèses culturelles :** contenu/làmb provisoire `unverified`; aucune certification ni traduction inventée.
- **Prochain propriétaire :** dakar_studio_qa pour revue, puis producteur pour acceptation et affectation.
- **Plus petite prochaine action :** reviewer compare ce rapport aux preuves et accepte/retourne les écarts, puis affectation lecture seule à l'agent Cloudflare existant.
