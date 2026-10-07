# Lancement du 8 octobre 2026

Décision de Habib : le lancement comprend la présence multijoueur. Direction visuelle : `ART_DIRECTION.md`.

## Livraison de cette branche

- Un Worker Cloudflare sert le jeu et son API sur le même domaine.
- WebSockets avec Durable Objects et hibernation : les avatars distants partagent positions, orientation, pose, pseudo et tenue.
- Un répartiteur par quartier ouvre des groupes de 24 connexions. Les groupes supplémentaires sont créés à la demande, avec 128 groupes maximum par quartier dans cette configuration. Un lien d’invitation cible un groupe précis.
- Les rues et les Maïgas/gargotes publics partagent la présence. La chambre personnelle et les scènes de lutte individuelles masquent les autres avatars.
- Le client envoie au maximum cinq mises à jour de déplacement par seconde, et seulement si son état change. Les messages de maintien de connexion utilisent la réponse automatique du serveur.
- Reconnexion avec temporisation progressive. Une coupure n’efface pas la sauvegarde locale et ne modifie pas le portefeuille.
- Les corps animés distants sont limités aux joueurs proches : 6 en qualité basse, 10 en moyenne et 14 en haute.
- Les pseudos et mouvements sont validés côté serveur. L’identité de connexion est créée côté serveur ; un client ne choisit pas l’identité d’un autre.

Cette couche est une présence partagée. Les sauvegardes et l’économie restent propres à l’appareil. Combat synchronisé, prêts, paiements, comptes et visites des logements personnels restent des livraisons distinctes. Les plafonds de groupes sont des limites de configuration, pas une preuve de capacité à cette charge.

## Vérifications

```bash
npm ci
npm test
npm run typecheck:server
npm run check:online
```

`check:online` démarre le véritable runtime Workers local, puis vérifie deux contextes Chromium indépendants : présence, avatar, mouvement, profil, chambre personnelle, Maïga public, transitions entre les quatre quartiers et reconnexion sans doublon. Il remplit ensuite un groupe avec de vraies connexions WebSocket et vérifie le groupe suivant et le rejet d’une position malformée.

Captures et résultats sont écrits dans `shots/multiplayer/`. Les captures sont des images du jeu réel avec deux clients connectés ; les performances de Chromium/SwiftShader ne représentent pas celles d’un téléphone.

Sur un Worker déjà lancé : `npm run check:online -- https://adresse-du-worker/`. Ce test crée des joueurs de test ; l’exécuter sur une adresse de recette avant ouverture publique.

Pour le développement habituel, `npm run dev` et `npm run build` gardent le mode solo. `npm run dev:online` construit le mode réseau et démarre le jeu et le serveur ensemble sur `http://127.0.0.1:8787`. Le mode en ligne utilise `.env.online`, sans clé secrète dans le client.

## Publication depuis le Mac

Après intégration de cette branche avec les changements visuels de Claude :

```bash
npm ci
npx wrangler login
npm run deploy
```

La connexion à Cloudflare se fait dans le navigateur du propriétaire du compte. Wrangler publie les assets et le serveur, applique la migration SQLite des deux classes Durable Object, puis affiche l’adresse `workers.dev`. L’API et les WebSockets utilisent automatiquement ce domaine.

Si plusieurs comptes sont disponibles, choisir le compte du projet et définir `CLOUDFLARE_ACCOUNT_ID` dans l’environnement de déploiement. Aucun achat ou changement d’abonnement n’est inclus dans ces commandes. Vérifier dans le compte les quotas applicables au trafic prévu.

## Publication depuis GitHub

Le workflow `Game checks` vérifie chaque push et PR. Le workflow `Deploy Dakar Rek` est déclenché manuellement sur la branche à publier ; aucun push ne publie automatiquement.

Configurer les secrets `CLOUDFLARE_API_TOKEN` et `CLOUDFLARE_ACCOUNT_ID` dans l’environnement GitHub `production`, puis lancer le workflow. Utiliser un token Cloudflare autorisé pour le déploiement Workers dans le compte choisi ; les autorisations exactes dépendent aussi des éventuelles routes personnalisées. Ne jamais mettre ce token dans `VITE_*`, le dépôt ou une conversation.

## Vérification finale sur le lien de recette

Ouvrir le lien sur deux vrais téléphones avec deux connexions différentes. Vérifier les quatre quartiers, les invitations, le retour après coupure réseau, la sauvegarde après rechargement, le tactile et les actions principales. Relever le modèle des téléphones et la fluidité observée. Tester les assets définitifs de Claude dans cette même version.

Le réseau d’une connexion de joueur ne permet pas de transférer de l’argent ; le futur ledger serveur restera une frontière séparée. Les scènes et assets culturels provisoires conservent leur statut de revue dans le registre.
