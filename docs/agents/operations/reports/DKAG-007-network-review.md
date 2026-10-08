# DKAG-007 — Revue indépendante du client de présence

Date : 8 octobre 2026, 12:03 UTC.
Rôle : QA indépendante ; aucun fichier de l'implémentation modifié.
Candidat : `183311c58185678421a70969371fed625d6347c2`.
Base : `0af76c38b152df885c0c27352aa43ac320aa71af`.
Verdict : **candidat prêt pour revue et intégration contrôlée** ; suite navigateur CI encore en cours à cette observation.

## Revue et identité de la source

Le diff distant comporte seulement `src/multiplayer/client.ts`, le nouveau `tests/presence-client.test.ts` et le rapport auteur. Un seul commit descend directement de la base Aïda. Aucun protocole, serveur, wallet, sauvegarde, workflow ou asset n'est modifié.

Les blobs distants sont identiques aux fichiers exécutés indépendamment :
- client : `c653bc078712274cb48f9f5648f71972e35d3c78` ;
- tests : `e16f53fbb2d84496f963c3ac20d11802e2a1f41b`.

Le délai de 8 secondes commence dès la création de chaque socket ; il couvre CONNECTING et OPEN sans welcome. Un welcome compatible l'annule. Toute invalidation passe par stopSocket, qui annule le délai et incrémente la génération. Le callback du délai vérifie aussi l'identité du socket ; les anciennes réponses/fermetures vérifient la génération. Le backoff existant est réutilisé, les anciens peers sont supprimés, et le dernier déplacement publié pendant la reconnexion reste disponible après le welcome suivant.

Le changement ne modifie pas le comportement financier ou les conditions de matchmaking. Le nettoyage page concerne précisément l'événement pagehide, pas chaque changement de visibilité d'onglet.

## Exécutions indépendantes

Copie séparée : `/tmp/dakar-rek-dkag-007-qa`. Les dépendances exactes du lock ont été copiées après la fin de npm ci ; aucun node_modules ou fichier auteur n'a été modifié par la QA. Node 22.16.0 ; Vitest 2.1.9 ; TypeScript 5.9.3 ; Vite 5.4.21 ; Playwright 1.56.0 ; Wrangler 4.148.0.

- npm test : **42/42 PASS**, 6 fichiers dont 10 tests de lifecycle présence.
- npm run typecheck : **PASS**.
- npm run typecheck:server : **PASS**.
- npm run build : **PASS**, typecheck client puis compilation Vite.

Logs temporaires : `/tmp/dkag-007-qa-unit.log`, `/tmp/dkag-007-qa-server.log`, `/tmp/dkag-007-qa-build.log`.

Les dix nouveaux tests utilisent un faux transport et des horloges contrôlées : ils testent le délai sans attente réelle, les interruptions, la récupération et les callbacks périmés. La QA a également relu le transport réel et ses appels depuis main. Cette exécution ne constitue pas un test navigateur ou Worker réel. Les assets locaux copiés pour le build ne sont pas certifiés par cette revue.

## CI observée

Run push [37774079135](https://github.com/zayd95/dakar-rek/actions/runs/37774079135), job `113300458040`, SHA exact du candidat. À 12:03 UTC, npm ci, unités, typecheck serveur et build réussis ; installation Chromium en cours ; check:online et check:launch encore attendus. Aucun échec de code observé. Le candidat reste isolé, sans fusion ni déploiement.

## Preuve CI complète ajoutée à 12:14 UTC

Lecture indépendante des étapes et des logs du run PR [37774210307](https://github.com/zayd95/dakar-rek/actions/runs/37774210307), job `113300900972` : **completed / success**, terminé à `2026-10-08T12:12:45Z`. Toutes les étapes réussissent, notamment npm run check:online et npm run check:launch.

Les logs confirment le checkout du merge de test `ef083c3c6dccc739c37faf606a556bd3d431dc8a`, qui rassemble le head `183311c58185678421a70969371fed625d6347c2` dans la base exacte `0af76c38b152df885c0c27352aa43ac320aa71af`. Ce checkout est le merge simulé GitHub de la PR ; il ne constitue pas une fusion réelle de branches.

Résultats décodés : **17/17 réseau réel**, **52/52 Aïda desktop et tactile**, **58/58 gameplay général desktop et téléphone** et contrôles de lancement réussis. Aucun FAIL ni marqueur d'erreur. La fin annonce PASS full desktop and phone gameplay suite.

Artifact `11549408045` : ZIP SHA256 `c2faf76e774074df5d1f6ebec16073a96152f2ddeb0fac3cad5204118a529649`, 56 fichiers. La branche dédiée relue reste exactement au head `183311c58185678421a70969371fed625d6347c2` ; aucun commit de registre ou documentation de contrôle ne l'a déplacée.

Verdict confirmé : **candidat vérifié et prêt pour intégration contrôlée**, PR #11 en brouillon, sans fusion ni déploiement. Le deuxième run push n'est pas requis pour compléter cette preuve et n'a pas été relancé.
