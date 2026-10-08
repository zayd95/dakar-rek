# DKAG-007 — Connexion de présence bornée

Date : 8 octobre 2026, UTC.
Rôle : réseau, propriétaire unique de l'implémentation.
Base exacte : `0af76c38b152df885c0c27352aa43ac320aa71af` (Aïda).
Branche : `codex/agents/dkag-007-network-handshake`.
État auteur : candidat testé, revue indépendante requise avant intégration.

## Problème et correction

Le client crée une WebSocket et attend `welcome`. Avant ce message, aucun délai ne force une nouvelle tentative ; le heartbeat ne commence qu'après `welcome`. Une connexion qui reste CONNECTING ou qui s'ouvre sans envoyer ce message reste donc « connecting » indéfiniment.

La correction ajoute un délai de 8 secondes dès la création du transport. Sans `welcome` valide, elle réutilise le backoff existant. Ce délai couvre l'ouverture et l'accueil du serveur ; sa valeur est un choix de récupération client, pas une latence garantie du service.

Un accueil valide annule le délai. Les événements hors ligne, le masquage de page, les changements de quartier/profil et toute fermeture le nettoient aussi. La génération et l'identité du socket empêchent un ancien délai d'affecter la session suivante. Les callbacks déjà invalidés conservent leur garde existante.

La correction ne change ni le protocole, ni le serveur, ni la capacité des salles, ni les sauvegardes locales.

## Périmètre réservé

- `src/multiplayer/client.ts`
- `tests/presence-client.test.ts` (nouveau)
- Le présent rapport (nouveau)

Aucun autre chemin candidat modifié. Le commit distant est construit depuis l'arbre Git exact de la base, sans importer l'historique d'une autre copie locale.

## Vérification auteur réelle

Copie isolée : `/tmp/dakar-rek-dkag-007`. Les textes runtime/config/tests proviennent de la base épinglée. Les assets publics ont été copiés d'une copie locale existante, laissée intacte ; cette vérification locale ne certifie pas leur rendu.

`npm ci --ignore-scripts --cache /tmp/dakar-dkag-007-npm-cache` a réussi. Le premier essai sans cache isolé a échoué sur les permissions du cache npm personnel ; aucun réglage personnel modifié.

Versions du lock vérifiées : Vitest 2.1.9, TypeScript 5.9.3, Vite 5.4.21, Playwright 1.56.0, Wrangler 4.148.0, Three 0.169.0.

À 12:00 UTC :
- Client original + nouveaux tests transport : **2 échecs attendus**, 8 autres tests ignorés. Le client reste connecting et le socket silencieux ne ferme jamais.
- Client corrigé : **10/10** nouveaux tests réussis.
- `npm test` : **42/42** tests réussis, 6 fichiers.
- `npm run build` : typecheck client et compilation Vite réussis.
- `npm run typecheck:server` : réussi.

Les tests utilisent une WebSocket factice et des horloges contrôlées dans l'environnement Node existant. Ils couvrent le transport jamais ouvert, le transport ouvert mais silencieux, l'accueil avant échéance, les événements offline/online et pagehide/pageshow, les changements de quartier/profil, les callbacks périmés, la republication du dernier déplacement après reconnexion et l'accueil incompatible.

Ces résultats ne remplacent pas les contrôles CI navigateur/Worker ni la revue indépendante. Aucun test public ou déploiement lancé par ce rôle.

## État observé du watch existant

Le dernier run planifié observé est [37735729906](https://github.com/zayd95/dakar-rek/actions/runs/37735729906), job `113174680914`, source `main` / `547bb1e8077127094a3fc647821cf6ac73d2a42c`. Les logs décodés donnent **10/10 PASS** à `2026-10-08T06:06:09.9421582Z`, job terminé à 06:06:20 UTC.

Il vérifie HTML, health/protocole/capacité annoncée, déplacements sur quatre quartiers, emote, départ/reconnexion sans ancienne présence, rejet d'un mouvement mal formé et état du dernier build Cloudflare. Artifact `11532160255`, SHA256 du ZIP `e4655290aa2b352c033cc5b4e83bf3ba61b838d251c601d3cd14ae774f33068f`.

Le workflow source annonce `17 * * * *`, mais l'API des runs planifiés renvoie seulement deux exécutions : 00:12:19 UTC et 06:05:29 UTC le 8 octobre. Le dernier contrôle est bon ; la cadence horaire et la fraîcheur continue ne sont pas démontrées. Le workflow existant n'est pas modifié.

Les fichiers client/protocole/Worker sont identiques sur la production documentée `6216bb80db6bb7d777997e70d1681fa71240b057`, la base visuelle `00abf96efeadcc8bdb8d4c859eb1d0258b0978b7` et cette base Aïda pour le client. Blob client avant changement : `960f510c9ef05b41db3eb68a8051f910f8f6a609`.

## Limites opérationnelles

La présence réplique positions et poses ; elle ne synchronise pas les combats ni l'économie. La capacité configurée est 24 joueurs par salle et au plus 128 salles par quartier ; elle ne constitue pas une mesure de charge ou de FPS téléphone.

Aucun outil authentifié Cloudflare applicable à ce Worker n'est exposé dans cette session. Les outils Cloudflare de Sites concernent leurs sites gérés. La version active du Worker reste non attestée ; un build réussi seul ne prouve pas son activation.

Aucune modification de main, de la branche Claude, de la branche de production ou de Unity. Aucune fusion ni aucun déploiement.
