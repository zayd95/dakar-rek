# DKAG-015 — revue QA indépendante finale

Reviewer : `qa_dkag015_ci_2028`, distinct de l’auteur `gameplay_dkag015_1927`. Statut : **READY — candidate vérifiée**, non fusionnée et non publiée.

Contrôle lu explicitement au commit `30236c2e1b613e317e39980a7315693577c76516` : `AGENTS.md`, `docs/agents/STUDIO.md`, `docs/agents/STATE.json`, `docs/agents/operations/RUNBOOK.md`, `docs/agents/operations/QUEUE.json`, `docs/agents/roles/qa.md` et le rapport QA précédent. Réservation : revue seule du rapport, sans mutation de source, ref ou PR.

Source gelée : `0de3c4a7980e413b867603c770dc45dd855ef3d6`, tree `db5c4d83bb2fe3f7dc35ce82e8ba232746c6534b`, parent/base `84311a716fa722cd20b4e725a72fd15f60511291`. PR19 brouillon, branche `codex/agents/dkag-015-place-summary`.

## Périmètre et critères

Le diff GitHub de la PR contient exactement les cinq fichiers autorisés :

- `src/ui/placeSummary.ts` (ajout) ;
- `tests/place-summary.test.ts` (ajout) ;
- `src/main.ts` (import et appel du formatter uniquement) ;
- `scripts/check-city-life.mjs` (contrôles desktop/touch) ;
- `docs/agents/reports/DKAG-015-gameplay.md` (rapport auteur).

Le commit a exactement le parent et le tree enregistrés. La lecture statique et le diff confirment : données tirées des `Action` existantes pour travail/alimentation/repos ; coûts, gains, durées, besoins et raisons d’indisponibilité affichés ; actions invisibles filtrées avant `requires` ; priorité `requires` puis wallet conservée ; sélection dans l’annuaire limitée au repère ; aucune exécution d’action, écriture wallet/besoins/compteurs/save, modification de schéma, package, workflow ou asset. Les six tests du formatter couvrent les valeurs réelles, wallet dynamique, visibilité, priorité des raisons, flux spécial et non-mutation.

## CI exacte et logs inspectés

Outils : GitHub `fetch_file`, `fetch`, `fetch_workflow_job_logs` et `fetch_workflow_run_artifacts`. Les métadonnées des runs/jobs, les étapes et les logs décodés ont été relus, pas seulement leurs conclusions.

### PR run `38168543352`, job `114556077792`

Événement `pull_request`, head `0de3c4a7980e413b867603c770dc45dd855ef3d6`, checkout du merge GitHub `871e96c0406d8f2a959f389dac54a99ce3cbc64e` entre ce head et la base enregistrée. Run **completed/success**, du 11 octobre 2026 19:33:43Z au 19:43:30Z.

- `npm ci` : success, 96 packages installés. Le log signale 9 vulnérabilités npm préexistantes (3 moderate, 4 high, 2 critical) ; aucun package n’est modifié par DKAG-015.
- `npm test` : **6 fichiers, 33/33 tests PASS**, dont `tests/place-summary.test.ts` 6/6.
- `npm run typecheck:server` : success (`tsc -p server/tsconfig.json`).
- `npm run build` : success ; le script exécute aussi `tsc --noEmit`, puis Vite 5.4.21 transforme 48 modules et termine en 1,31 s.
- installation Playwright Chromium : success.
- `npm run check:city` : success. Les logs attestent sur desktop et profil phone : aperçu réel travail/récompense/durée/effets ; sélection du repère sans effet wallet/besoins/compteurs/save ; motif d’indisponibilité ; aperçu repos ; repos réel sans débit ; aperçu nourriture ; achat réel débité une fois ; aucune erreur JavaScript. Les parcours existants des quatre hubs et de Soumbédioune restent PASS.
- `npm run check:online` : success, 17 lignes PASS, incluant deux clients, avatar téléphone, mouvement, reconnexion sans doublon, changement de hubs, salle pleine, rejet des positions malformées et absence d’erreur navigateur.
- `npm run check:launch` : success. Contrôles lancement, qualité, joystick/touch, sauvegarde, budgets/rendus desktop-phone, déplacement/collisions/intérieurs, arène, làmb, voyage et scènes sociales finissent par `PASS: full desktop and phone gameplay suite` à 19:43:26Z.
- upload artifact : success, `multiplayer-checks` id `11713311443`, 18 993 658 octets, digest `sha256:101931a02dcba75b29e516651dd62087700f0581fb0001ad4fc39a8147fe19ff`.

Ce run PR complet fournit la preuve navigateur exacte demandée et suffit pour la décision READY.

### Push run `38168518669`, job `114556003538`

Événement `push`, même head exact. Run **completed/cancelled**. `npm ci`, 33/33 tests, server typecheck, build, installation Chromium, `check:city` et `check:online` ont tous terminé success. `check:launch` a émis jusque `PASS: full desktop and phone gameplay suite` à 19:48:25Z, puis GitHub a inscrit `The operation was canceled`.

La cause observable est la limite déclarée par le workflow : `timeout-minutes: 15`. Le job commence à 19:33:25Z et l’annulation intervient à 19:48:25Z, exactement quinze minutes plus tard. Il ne s’agit pas d’un échec d’assertion ; néanmoins ce run reste correctement classé cancelled et n’est pas compté comme CI verte. L’upload `if: always()` a ensuite réussi : artifact `11713561857`, 19 090 184 octets, digest `sha256:9b76227f680daeff4bfb57b8a1006aef7db9c350d18ab61e92e6d84c33e2fbf7`. Aucune autre cause n’est déduite.

## Décision

**READY / candidate vérifiée.** Tous les critères DKAG-015 sont attestés par le diff exact, les 33 tests, les typechecks/build et le run PR complet success, incluant les parcours navigateur desktop et touch au SHA attendu. Le push cancelled redondant est expliqué par le timeout de quinze minutes et ne remet pas en cause la preuve complète du run PR.

Limites : aucun appareil physique n’est attesté ; « phone » désigne le viewport/touch Playwright. La candidate complète la ville PR9 sur sa base épinglée et n’intègre pas les évolutions Living Dakar ultérieures. Contenu, textes et équilibre fictifs **unverified** ; aucune revue humaine sénégalaise nommée, donc aucune mention `practitioner-approved`. La candidate reste brouillon, non fusionnée, non déployée et non publiée.

Prochain propriétaire : producteur. Enregistrer les preuves exactes, accepter DKAG-015 comme candidate vérifiée, publier ce rapport sur le chemin réservé du contrôle, puis libérer uniquement la lease du cycle. Aucun correctif auteur requis.
