# DKAG-015 — revue QA indépendante

Reviewer : qa_dkag015_1927, distinct de gameplay_dkag015_1927. Statut : **review — CI navigateur en cours**, aucune acceptation finale.

Source GitHub gelée : `0de3c4a7980e413b867603c770dc45dd855ef3d6`, tree `db5c4d83bb2fe3f7dc35ce82e8ba232746c6534b`. Base : `84311a716fa722cd20b4e725a72fd15f60511291`. PR19 brouillon. Briefs AGENTS/STUDIO/RUNBOOK/qa/QUEUE/STATE explicitement transmis depuis contrôle et lus, réservation contrôle `962e07aeaec9e07dc503897e22f6e485ab71d8aa`.

## Revue des critères au SHA exact

- Les activités travail/alimentation/repos proviennent des `Action` réelles. Coûts, gains, secondes et variations de besoins sont affichés sans nouvelle valeur de balance. Le besoin `faim` positif signifie satiété augmentée dans GameState.adjust; le formatter le nomme explicitement.
- Le filtrage `visible` précède les `requires`, identique au menu d'action. La priorité requires puis wallet reproduit main.ts. Les flux spéciaux sont décrits comme menu dédié. Les actions invisibles sont omises et le cas vide est explicite.
- Main.ts change uniquement par import et remplacement du détail générique. Le handler de repère est inchangé et ne lance pas `runAction`. Aucune écriture wallet/needs/counters/save dans le formatter. Prix, économie, progression et sauvegarde existants inchangés par lecture du diff.
- Six tests vérifient les valeurs réelles, raison d'épuisement, wallet dynamique, invisibilité sans évaluation de requirement, priorité de raisons et non-mutation. Le script navigateur conserve les checks préexistants et ajoute aperçu job/food/rest, motif indisponible, click/tap réel avec comparaison synchrone de wallet/needs/counters/save et action repos réelle.
- Les cinq fichiers réservés sont les seuls fichiers du commit API. Chaque blob hydraté depuis GitHub a été vérifié par `git hash-object` : placeSummary `54303b2647067b6486ddd0d5931805ef41c93b0f`, test `1d8f50d52611ea1775589c79e7e1125b30c3e025`, main `9614a601c3f7cfb2d9061a45ec6b3fd4dde2aa78`, script `7f86486618fc96494a50b200826d877915b978f3`, rapport auteur `37cefe4e7a4a3aa19dae7451b120892a441d3448`. Le parent a construit le tree depuis la base exacte; aucune ref d'autre session modifiée par QA.

## Exécution indépendante

Checkout séparé `dkag015-qa`, clone partagé en lecture des objets de base puis hydratation des cinq fichiers au SHA distant exact. Dépendances déjà présentes via lien node_modules vers dkag019; aucun package installé ou modifié.

- `npm test` : 33/33 PASS, six fichiers, dont six tests formatter.
- `npm run typecheck` : PASS.
- `npm run build` : PASS, Vite5.4.21,48modules.
- `npm run typecheck:server` : PASS.
- `node --check scripts/check-city-life.mjs` : PASS.
- `git diff --check -- src/main.ts scripts/check-city-life.mjs` : PASS après hydratation byte-exacte. Un premier essai ajoutait une ligne EOF lors de la copie QA; copie corrigée depuis contenu GitHub, aucun correctif source demandé.
- Essai `chromium.launch` réel : executable chromium_headless_shell1194 absent. **local_not_run navigateur**; aucune capture, rendu ou appareil physique attesté.

Trois JPG historiques de la base sont absents dans le clone partagé; cela empêche le diff global local complet, sans effet sur les tests et le build. Le diff distant est la preuve du périmètre source.

## CI réelle inspectée

Lecture directe GitHub le11octobre2026 vers19:35UTC : push38168518669/job114556003538 et PR38168543352/job114556077792, tous deux source `0de3c4a7980e413b867603c770dc45dd855ef3d6`, encore **in_progress**. Étapes npm ci,33tests,server-typecheck,build et installation Chromium terminées success; check:city en cours; online/launch pas encore terminés. Tentative de logs job pendant exécution : BlobNotFound404, donc aucun résultat navigateur déduit.

## Handoff

Aucun défaut concret découvert dans la revue statique et les tests indépendants. Conserver **review** jusqu'aux logs city desktop/touch et CI complète au SHA exact. Prochain propriétaire : producteur, reprendre les runs existants sans refaire le code. Candidate isolée complémentaire à la ville PR9, pas intégration avec Living Dakar actuel; aucune fusion/publication. Contenu et balance fictifs **unverified**, aucune attestation humaine sénégalaise.
