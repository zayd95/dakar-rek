# DKAG-018 — décalage du panneau publicitaire de l’arène

## Périmètre

- Base exacte : `e4f1c291117fb61633d169a008823efd59dce19f` (tête observée de la PR #10).
- Branche isolée : `codex/agents/dkag-018-arena-billboard-offset`.
- Fichiers modifiés : `src/world/builder.ts`, `scripts/check-v1-core.mjs` et ce rapport.
- Aucune modification de la branche ou des contenus de la PR #10, des règles de jeu, des assets, des workflows, des paquets ou de l’économie.

## Correction

L’ancre d’interaction de l’arène était à `(cx, cz - 24)` et celle du panneau à environ `(cx, cz - 23,9)`. Les deux menus occupaient donc pratiquement le même point devant la porte : un déplacement de quelques centimètres pouvait changer le choix proposé.

Le panneau `pikine-arena` est maintenant décalé de 17 m vers l’est. L’axe central de la porte reste réservé à l’interaction `Arène · làmb`, tandis que le panneau demeure volontairement accessible hors axe. Le panneau conserve son orientation, son contenu, sa campagne et son emplacement général aux abords de l’arène.

Le contrôle géométrique porte sur le joueur de rayon 0,5 m : le passage de 3,8 m entre les deux poteaux reste libre. Le poteau le plus proche garde plus de 1,5 m de vide jusqu’au volume de l’étal voisin ; le mât, le mur circulaire, les tribunes et les barrières de file ne coupent pas l’approche centrale du panneau.

## Contrôles ajoutés

Le parcours `scripts/check-v1-core.mjs` vérifie désormais :

- trois positions proches sur l’axe central (`-3 m`, `0 m`, `+3 m`) qui conservent toutes le menu arène ;
- un écart latéral d’au moins 15 m entre les ancres arène et panneau ;
- une marche réelle au clavier en qualité moyenne vers la porte, puis vers le panneau hors axe ;
- une marche réelle au joystick tactile en qualité basse vers les mêmes deux destinations ;
- quatre captures dédiées au cadrage porte/ring et panneau, ordinateur et mobile.

## Résultats locaux

- `npm ci` : réussi, lockfile inchangé.
- `npm test` : **34/34 réussis** (6 fichiers).
- `npm run build` : réussi (`tsc --noEmit` et build Vite).
- `npm run typecheck:server` : réussi.
- `git diff --check` : réussi.
- Parcours Playwright et captures : **non exécutables localement dans ce conteneur**. Chromium a été obtenu sans modifier le projet, mais son démarrage est bloqué par la politique du runtime (`socket() failed: Operation not permitted`). Les assertions restent destinées à la CI existante ; aucun succès navigateur ni aucune capture ne sont revendiqués ici.

Première exécution CI (`37855312799`) : compilation et 34/34 tests réussis ; les contrôles de séparation et les trois positions centrales ont réussi. Le premier contrôle de navigation a échoué avant que ses positions soient journalisées. La première correction ciblée part maintenant à 10 m, avance jusqu’à l’état d’interaction attendu dans une boucle bornée à 3 s, garantit le relâchement de la commande et journalise les positions avant l’assertion. Le parcours mobile injecte de vrais événements tactiles Chromium (`Input.dispatchTouchEvent`) au lieu d’événements souris. Aucune assertion n’a été retirée ou assouplie.

## Statut

Candidate d’auteur prête pour CI et revue QA indépendante. Pas d’auto-approbation, pas de merge et pas de déploiement.
