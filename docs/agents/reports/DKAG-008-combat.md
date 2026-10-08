# DKAG-008 — interruption des commandes du duel

Auteur : `combat_resume_1655`, Codex. Réalisation terminée pour revue indépendante, le 8 octobre 2026 à 17:00 UTC. Aucun accord de QA, commit distant, fusion ou déploiement émis par l'auteur.

## Périmètre et reprise

Base assignée : `0af76c38b152df885c0c27352aa43ac320aa71af`. Briefs et critères transmis depuis le contrôle `feac8c3da1cefd766f43794133d135ea6a99853e`; affectation réservée au registre `a26b4e6eae411d13b5f4aa187e4a02eec8e2377a`. Checkout isolé : `/workspace/scratch/608bc7678079/dakar-rek-cycle`. Reprise des modifications partielles du writer interrompu, sans recommencer le lot ni toucher d'autres refs.

Fichiers réalisés : `src/lamb/duel.ts`, `src/lamb/duelInput.ts`, `tests/duel-input.test.ts`, `scripts/check-duel-input.mjs`, et ce rapport. Aucun package, lock, workflow, asset, protocole ou sauvegarde modifié. Les phases, règles, récompenses et animations du duel restent inchangées; seul le cycle de vie des commandes est remplacé.

## Comportement

- `blur` et document masqué : garde, style du bouton, saisies tactiles en attente et action partagée sont effacés immédiatement; une nouvelle pression est nécessaire au retour.
- Les touches de garde et les identifiants des pointeurs sont suivis séparément : relâcher une touche ne supprime pas une autre pression active.
- Annulation du pointeur ou perte de capture sur les boutons : aucune saisie annulée ne se rejoue, la garde visuelle est libérée.
- Entrées éditables (`input`, `textarea`, `select`, contenu éditable et ses descendants) : reset au focus et suppression des commandes reçues, y compris les actions partagées avant consommation.
- `dispose()` retire tous les listeners détenus par le duel; les boutons détachés et une instance remplacée n'accumulent pas leurs handlers.

## Exécution réelle

Environnement : Node 24.19.0, Vitest 2.1.9, Vite 5.4.21; dépendances existantes du lock, sans installation additionnelle.

| Commande | Résultat final |
| --- | --- |
| `npm test` | 48/48, dont 16 tests déterministes dédiés aux interruptions/entrées du duel |
| `npm run build` | PASS, typecheck client et compilation de 44 modules |
| `npm run typecheck:server` | PASS |
| `git diff --check` | PASS |
| `node scripts/check-duel-input.mjs /tmp/dkag008-resume-browser` | 28/28 contrôles navigateur, 14 desktop et 14 viewport tactile |

Logs locaux complets : `/tmp/dkag008-resume-logs/unit.log`, `build.log`, `server.log`, `browser.log`. Résultats navigateur et captures du fixture UI : `/tmp/dkag008-resume-browser/results.json`, `desktop-duel-input-fixture.png`, `touch-duel-input-fixture.png`. La première tentative de build a signalé que le faux bouton de test ne fournissait pas tout `DOMTokenList`. Correction ciblée 1/2 : déclarer précisément la seule méthode `toggle` consommée par le contrôle. La première exécution navigateur a ensuite révélé un vrai défaut tactile : la perte de capture implicite après un relâchement normal annulait la saisie avant sa consommation. Correction ciblée 2/2 : identifier les pointeurs encore actifs, distinguer capture perdue pendant geste et release normal; test déterministe supplémentaire. Aucune assertion supprimée ou affaiblie. Toutes les suites finales passent.

Empreintes SHA-256 des sources figées pour handoff :

| Fichier | SHA-256 |
| --- | --- |
| `src/lamb/duel.ts` | `779555adb196b372519611fd0ec1cd8fbdadfb4da2b11b5b7e7f77513cd54c6d` |
| `src/lamb/duelInput.ts` | `b9a57662a1f83be75db9a16da765171e90ae7bab96d99ebf65f3993af27f3083` |
| `tests/duel-input.test.ts` | `89e489100b2f3bc5ba4a4836aeb16eec8b63acfea1e0f8160bf3a61bef81c67c` |
| `scripts/check-duel-input.mjs` | `086ef3ec8475619c1ff05453cca8010251fdffe42fe724fc13d7e87c3671a058` |

## Limites et handoff

Chromium 1194 initialement absent; le coordinateur a installé le navigateur existant attendu par Playwright, puis l'auteur a exécuté le contrôle dédié. Le script démarre seulement Vite sur localhost, charge les vrais modules `LambDuel`, `Input` et `DuelInput`, et instancie leur vraie UI. Les pressions clavier et clic/tap utilisent Playwright; blur/hidden/cancellation sont des événements de fixture synthétiques. Les contrôles vérifient le fighter et le bouton, les entrées éditables réelles (dont contenteditable sans valeur et descendant), la saisie normale tactile et le remplacement d'instance. Sans renderer/chargement 3D, ce n'est pas une preuve du parcours complet du jeu ou d'un téléphone physique. Aucun accès production ni asset distant.

La CI distante au commit candidate reste à obtenir par le coordinateur; ces résultats locaux ne remplacent pas sa preuve. Le script dédié n'est pas ajouté aux workflows existants; QA peut le rejouer explicitement au SHA figé. Contenu et règles de làmb toujours provisoires/unverified, aucune attestation culturelle. La tâche est prête pour `qa_resume_1655`, pas auto-approuvée. Plus petite action : figer/publier par CAS les cinq fichiers autorisés, puis revue indépendante du diff et des CI exactes; conserver review tant que les preuves distantes manquent.
