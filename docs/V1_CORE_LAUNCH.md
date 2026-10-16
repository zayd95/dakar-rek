# Dakar Rek — périmètre du premier lancement

Décision produit du 8 octobre 2026, Habib : les panneaux d'annonces sont aussi des emplacements publicitaires et une source de revenus. Lancer avec les fonctions centrales de vie quotidienne, l'arène de làmb et la mosquée, puis développer les extensions avec les retours des utilisateurs.

Ce document fixe un objectif de livraison. Il ne certifie ni une mise en production ni l'achèvement des fonctionnalités.
Base inspectée : `wip/visual-pass@00abf96`, documents FEATURES et INTEGRATION_2026-10-07. Les résultats historiques cités dans ces documents ne remplacent pas la recette de la version à publier. Le candidat Aïda de la PR #7 reste une livraison séparée.

## Promesse

Vivre une première journée à Dakar : se déplacer, travailler, manger, se reposer, rencontrer des personnages et d'autres joueurs, fréquenter la mosquée et participer à la vie de l'arène.

Boucle principale : besoin ou objectif → lieu → action → résultat visible → progression sauvegardée → prochain choix.
Chaque lieu de la V1 propose une interaction réelle avec coût, durée et effet compréhensibles.

## Fonctions centrales et recette attendue

| Pilier | Première version | Recette |
| --- | --- | --- |
| Personnage et sauvegarde | Nom, apparence, besoins, humeur, progression ; reprise de la partie | Rechargement sans perte ni duplication des gains ; état d'échec compréhensible |
| Maison | Chambre de départ, sommeil et hygiène | Entrer, interagir, récupérer un besoin, sortir et reprendre après rechargement |
| Vie quotidienne | Gargote, Maïga, dibiterie ; un petit travail accessible ; progression simple | Effectuer un travail, recevoir le gain une seule fois, payer un repas et voir son effet |
| Déplacements et ville | Hubs existants, marche et car rapide ; lieux repérables et destination claire | Aller à un lieu, terminer l'action et revenir, sur téléphone comme sur ordinateur |
| Relations | PNJ récurrents, dialogues et souvenirs ; présence d'autres joueurs, invitations et émotes | Deux clients se rejoignent ; déconnexion/reconnexion sans avatar fantôme permanent |
| Làmb | Écurie, entraînement, entrée d'arène, tribunes, combat contre un adversaire local, résultat | Parcours complet avec victoire et défaite ; récompense unique ; règles et gestes relus avec des pratiquants |
| Mosquée | Lieu accessible, accueil, espace calme et interaction de prière facultative ; réunion de joueurs | Parcours entrée → interaction → sortie ; contenu et gestes relus avec une personne compétente |
| Publicité | Panneaux intégrés à la rue et emplacements de sponsoring autour de l'arène ; campagnes de vrais annonceurs | Création, validation, diffusion, expiration et retrait d'une campagne ; lien correct et mesure vérifiable |

La mosquée relève de la vie du quartier : aucune obligation de pratiquer pour progresser, aucun classement de religiosité et aucune promesse de récompense spirituelle. Les effets de jeu éventuels relèvent du repos ou de l'humeur.

## Publicité : vente d'espace, puis automatisation

Les annonces entre joueurs et les publicités commerciales ont deux usages. Les panneaux peuvent accueillir les deux, avec une identification claire du contenu sponsorisé.

Pour démarrer, un administrateur gère les campagnes. La réservation autonome et le paiement intégré peuvent suivre après les premiers annonceurs.

Une campagne contient :
- annonceur et contact commercial ;
- visuel, titre, destination HTTPS, emplacements choisis ;
- date de début et de fin, statut brouillon/validé/actif/expiré/suspendu ;
- prix convenu et statut de règlement, gérés hors du portefeuille fictif du joueur.

Formats initiaux : panneau de rue et sponsoring visible dans l'arène. Ajouter des lieux à forte fréquentation après mesure de l'usage. Le nombre d'emplacements doit préserver la lisibilité de la ville.

Rapport annonceur : durée de diffusion, emplacements, affichages visibles et clics. Une impression correspond à un panneau effectivement visible, avec une règle de durée et de déduplication documentée. Ne pas compter les chargements hors champ comme des vues. Distinguer visites, joueurs et impressions publicitaires. Filtrer les événements de test et les répétitions abusives ; ne pas vendre les compteurs clients non vérifiés comme une audience attestée.

Tarification : premier test commercial au forfait emplacement/période ; prix à définir avec les premiers annonceurs et l'audience mesurée. Aucun revenu ou volume d'audience n'est garanti dans le plan.

La monnaie du jeu reste distincte des paiements réels des annonceurs. Les contenus soumis par les joueurs ou annonceurs nécessitent validation, signalement et retrait.

## Parcours des premières minutes

1. Créer ou reprendre son personnage dans sa chambre.
2. Recevoir un objectif simple, gagner son premier revenu par une action.
3. Acheter un repas et constater son effet sur les besoins.
4. Rencontrer un PNJ, puis apprendre à rejoindre un ami.
5. Repérer la mosquée et l'arène ; choisir son activité.
6. S'entraîner et terminer un premier combat local.
7. Revenir plus tard et retrouver sa progression.

La mosquée et l'arène doivent être découvrables dès la première session ; ce parcours n'oblige pas à les visiter dans un ordre unique.

## État constaté et priorité de travail

| Lot | État d'après les documents inspectés | Suite |
| --- | --- | --- |
| Besoins, chambre, restauration, travail, déplacements et PNJ | Présents dans le candidat ; limites listées dans FEATURES | Recette de la boucle complète et simplicité du premier objectif |
| Présence multijoueur | Intégrée et testée en local | Attester le déploiement propriétaire, tester deux appareils réels et la reconnexion |
| Combat local et présentation du làmb | Présents ; règles/gestes provisoires | Revue culturelle et recette mobile |
| Mosquée | À construire | Petit lieu complet avec interaction facultative et contenu relu |
| Publicité | Pas de système de campagnes établi dans les documents inspectés | Inventaire de panneaux, campagnes administrées, expiration, retrait, rapport d'affichage |
| Publication et performance mobile | Restent à attester | Vérifier l'URL propriétaire et le commit livré ; recette sur de vrais téléphones |
| Mesure de l'usage | À préparer | Activation, retour des joueurs, activités et incidents ; comptage publicitaire distinct |

Ordre recommandé : stabiliser la journée jouable ; livrer la mosquée ; livrer les spots publicitaires et leur gestion ; recetter ensemble arène et présence sociale ; ouvrir le pilote.

Soumbédioune, banques et Dakar Life Mall restent dans la direction produit déjà demandée. Ils entrent dans la V1 lorsqu'ils apportent une action minimale complète sans retarder les piliers ci-dessus ; les métiers et systèmes complexes qui leur sont associés viennent ensuite.

## Conditions concrètes d'ouverture du pilote

- Un nouveau joueur comprend son premier objectif et accomplit une boucle revenu → repas → repos.
- Mosquée et làmb sont accessibles, fonctionnels et relus ; les éléments provisoires sont identifiés.
- La sauvegarde reprend correctement après fermeture, trajet et action interrompue.
- Deux appareils indépendants rejoignent le même groupe et se reconnectent.
- Les contrôles restent utilisables sur Android modeste et iPhone réels ; définir et consigner un budget de chargement et de fluidité à partir de ces mesures.
- Build, tests du client/serveur et parcours de lancement passent sur le commit exact candidat.
- L'URL publique du compte propriétaire sert le commit attendu ; suivi des erreurs et possibilité de revenir à la version précédente vérifiés.
- Une campagne publicitaire de test s'affiche, expire et se retire ; son rapport exclut les tests.
- L'état local de l'économie est annoncé honnêtement : aucune promesse de transactions partagées ou de duel synchronisé tant que ces fonctions ne sont pas livrées.

## Développer avec les utilisateurs

Observer : premier objectif accompli, repas/repos effectués, première visite d'arène, premier combat terminé, invitations réussies, retours de joueurs, lenteurs et blocages. Recueillir les demandes dans le jeu avec un moyen simple de signaler un problème.

Décider des extensions selon les usages : pêche/livraison à Soumbédioune, banque et épargne fictive, achats/emplois au mall, logement évolutif, métiers de conduite, chat, événements puis duel synchronisé et économie partagée. Ne pas attribuer d'avance ces usages aux joueurs.

La V1 vise une boucle agréable et rejouable, une identité dakaroise et des emplacements publicitaires exploitables. Le reste constitue le développement après ouverture.
