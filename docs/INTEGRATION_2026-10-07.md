# Intégration Claude + Codex — 7 octobre 2026

Branche : `wip/visual-pass` (PR [#1](https://github.com/zayd95/dakar-rek/pull/1) vers `main`).
Les PR Codex #2 (`e20b9f7`), #3 (`792a455`) et #4 (`061e004`) partaient toutes du dernier commit Claude (`bf1a226`) :
elles ont été intégrées par **avance rapide**, dans l'ordre #2 → #3 → #4, sans conflit ni perte des changements visuels.
Les commits suivants (duel de làmb, contrôles) s'ajoutent au-dessus.

## Contrôles (session cloud, Chromium + SwiftShader, pas un téléphone)

| Contrôle | Résultat |
| --- | --- |
| `npm test` | 23/23 |
| `npm run typecheck:server`, `npm run build` | OK |
| `npm run check:online` (runtime Workers local, deux clients) | 17/17 |
| `npm run check:launch` (11 contrôles de lancement + suite gameplay complète, bureau et téléphone) | tous réussis : 11 contrôles de lancement + résumé, 49 contrôles gameplay, 0 échec |

La suite gameplay compte désormais **49 contrôles** : les 48 précédents, plus le combat de làmb contrôlé.
Le test de voyage attend maintenant l'arrivée, jusqu'à 15 s, au lieu d'un délai fixe de 2,5 s : le voyage met environ 3 s sous SwiftShader.

## État des fonctions

| Fonction | État |
| --- | --- |
| Quatre hubs, jour/nuit, passe visuelle, landmarks de la Corniche, car rapide + apprenti, dibiterie, Maïga, intérieurs, escalier du monument, textures Higgsfield | **Intégré, testé** |
| Présence multijoueur (Worker, Durable Objects, groupes de 24, invitations, reconnexion, intérieurs publics partagés) | **Intégré, testé en local** ; **pas en ligne** (voir déploiement) |
| Corrections de lancement Codex (qualité dans un intérieur, joystick bloqué, sauvegarde hors carte, petit écran) | **Intégré, testé** |
| Combat de làmb contre un adversaire local : déplacement, garde, endurance, saisie, réponse de l'IA, empoignade, chute, résultat, compteur de victoires | **Intégré, testé** ; **règles provisoires, sans frappe**, à faire valider par des lutteurs |
| Duel synchronisé entre deux joueurs | **À construire** : état de match côté serveur, deux places, phases, délais, reconnexion, résultat validé |
| Économie partagée, dons/prêts, comptes, propriétés, évolution commune de la ville | **À construire** : ledger serveur persistant, opérations atomiques et idempotentes |
| Tiak Tiak, clando, Yango, radio, club, mosquée et prière collective, Coran, logement | **À construire** (document de conception) |
| Routines et fiches de personnalité des PNJ | **À construire** ; le cast actuel a des relations, des histoires et des souvenirs simples (flags) |
| Mesures sur de vrais téléphones | **À faire** |

## Déploiement

Aucune recette publique ne répond au 7 octobre vers 18 h (Dakar) : `dakar-rek.ludicrous-emoji.workers.dev` ne se résout
plus (DNS), et `cyclic-echinodon` ne répondait déjà plus. Il faut déployer depuis le compte Cloudflare propriétaire
(`docs/LAUNCH.md`). L'aperçu claude.ai (sans multijoueur, pas de Worker) est à jour avec cette intégration.
