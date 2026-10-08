# DKAG-005 — Traçabilité de la production

**Status : blocked pour l'attestation du déploiement actif; rapport prêt pour revue indépendante.** Lectures en seule lecture le 7 octobre 2026 vers 20:36–20:40 UTC, puis actualisation directe le **8 octobre 2026 vers 01:30 UTC** après changement d'environnement. L'accès manquant concerne cette session; il ne démontre aucune panne du jeu. Aucun probe, déclenchement de workflow, changement externe ou déploiement effectué.

## Source → build → version produite → version active

| Maillon | Preuve directement inspectée | Résultat et limite |
| --- | --- | --- |
| Branche documentée | Guide/profil Cloudflare lus à `main@547bb1e8077127094a3fc647821cf6ac73d2a42c`; GET [branche codex/launch-controls](https://api.github.com/repos/zayd95/dakar-rek/branches/codex/launch-controls), relu le 8 octobre | Ref encore `6216bb80db6bb7d777997e70d1681fa71240b057`. Cela ne confirme pas la configuration actuelle des builds Cloudflare. |
| Build du commit | GET [check-runs de 6216bb80](https://api.github.com/repos/zayd95/dakar-rek/commits/6216bb80db6bb7d777997e70d1681fa71240b057/check-runs), relu le 8 octobre; check `112967201125`, `Workers Builds: dakar-rek`, completed/success à `2026-10-07T19:09:56Z` | Build ID `d21c89a4-2e84-4cfb-b87d-556cb4818c0a`; résumé : Version ID **`3660d3b7-c936-4810-be90-7729279dd029`**. Liaison commit → build → version produite présente. |
| Version réellement active | Recherche des noms/descriptions d'outils Cloudflare et découverte d'outils dans les deux environnements | Aucun outil Cloudflare authentifié ou `tool_search` callable exposé. Compte/Worker non lus directement; version active, répartition de trafic, version précédente et configuration de branche inconnus. Version produite ≠ version active attestée. |

Le check publie un lien dashboard vers le Worker `dakar-rek` dans le compte documenté. Cette métadonnée GitHub ne remplace pas une lecture authentifiée du compte/Worker. La page dashboard n'a pas été ouverte avec une session supposée; aucun fichier de credential, token, autre projet ou compte Sites inspecté.

## Surveillance réellement exécutée

| Lecture datée | Exécution inspectée | Preuve réelle |
| --- | --- | --- |
| 7 octobre, 20:36–20:40 UTC | [Run 37675418116](https://github.com/zayd95/dakar-rek/actions/runs/37675418116), événement **push**, checkout `main@547bb1e`; job `112977544016`, logs décodés | **10/10 PASS à 19:34:29 UTC** sur `https://dakar-rek.habibjallow95.workers.dev/`, branche suivie `codex/launch-controls`. À cette lecture historique, collection complète de 17 runs : 2 watches push, aucun schedule observé. Ce constat n'est plus l'état actuel. |
| **8 octobre, vers 01:30 UTC** | GET [run 37706512672](https://github.com/zayd95/dakar-rek/actions/runs/37706512672), créé `2026-10-08T00:12:19Z`, événement **schedule**, checkout `main@547bb1e`, completed/success; GET jobs puis logs décodés du job `113082050946` | **10/10 PASS à `2026-10-08T00:13:00Z`**, même URL et branche suivie. L'exécution planifiée est maintenant directement attestée. |

Le 8 octobre, GET `/actions/runs?per_page=50` retourne **18 runs au total et 18 lus**, dont trois watches : les deux pushes historiques et ce schedule. Aucun watch plus récent observé à cette lecture. Cela atteste une exécution planifiée réussie, pas une continuité horaire sans interruption.

Les logs récents vérifient HTML/health, deux clients et mouvement dans Pikine/Plateau/Corniche/Almadies, emote, départ/reconnexion, rejet malformed et dernier build de branche. Ils n'identifient pas la version active/les assets servis et ne prouvent ni rendu, combat partagé, capacité mesurée ni expérience sur téléphone physique. **Aucun nouveau test runtime lancé par cette tâche**; preuves issues des exécutions existantes.

## Limites d'accès

- Le 7 octobre, GET GitHub `/deployments?per_page=10` a été refusé par la whitelist du connecteur (`INVALID_ARGUMENT`). Cela ne signifie pas « aucun déploiement ».
- Le 8 octobre, les endpoints collection de runs d'un workflow par nom ou ID ont été refusés par la whitelist. La collection globale complète de 18 runs a donc été lue; aucun endpoint, API ou résultat inventé.
- La définition MCP dans le profil existant ne démontre pas une connexion disponible dans Codex. Aucune connexion interactive, installation, modification de configuration ou publication n'a été tentée.
- Anciennes adresses de preview, candidate visuelle et adresse propriétaire restent distinctes. Aucun build réussi ne permet de remplacer la ref visuelle par une ref dite « publiée ».

## Handoff

- **Status : blocked** pour le critère Cloudflare actif; **ready** pour revue du rapport et du blocage. L'auteur ne s'auto-approuve pas.
- **Fichier changé :** `docs/agents/reports/DKAG-005-deployment.md` uniquement dans l'environnement isolé assigné. Root possède état/tâche et intégration.
- **Vérification :** contrats/brief QA/tâche/guide/profil/rapport DKAG-002 lus au 7 octobre; GET branche/checks relus au 8 octobre; run/job/logs du schedule et collection complète de runs directement inspectés. Source/build/version produite retrouvés; déploiement actif non attesté.
- **Hypothèses culturelles :** aucune nouvelle; contenus du jeu restent `unverified`.
- **Prochain propriétaire :** QA indépendante, puis agent existant `dakar-cloudflare-ops` dans une session propriétaire effectivement connectée.
- **Plus petite prochaine action :** lire le Worker `dakar-rek` et son déploiement actif via les outils Cloudflare authentifiés disponibles, comparer version/trafic à `3660d3b7-c936-4810-be90-7729279dd029` et documenter toute absence de lien au commit. Aucune publication nécessaire; autres travaux isolés continuent pendant le blocage.
