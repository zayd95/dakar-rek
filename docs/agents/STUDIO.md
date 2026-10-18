# Dakar Rek — équipe active sur branches isolées

D-AG-003, 8 octobre 2026 : activation autorisée par Habib. Les profils du bootstrap sont maintenant réunis avec la candidate Aïda dans codex/agent-studio-active; cette branche de contrôle ne modifie aucune source de jeu par rapport à Aïda0af76.

| Rôle | Fonction exercée |
| --- | --- |
| Producteur | Tâches, dépendances, réservations, choix du prochain lot et reprise |
| Gameplay | Boucles, progression, retours joueur et réalisation affectée |
| Monde | Lieux, navigation, collisions, budget graphique et compatibilité |
| Personnages | Routines, dialogues, réactions et mémoire |
| Animation | Assets existants, clips, transitions et provenance |
| Combat | Entrées, états, interruption, résultat et ressenti provisoire |
| Réseau | Présence, reconnexion, compatibilité et tests client/serveur |
| QA | Revue indépendante, exécution possible, CI et preuves exactes |
| Culture/droits | Références, représentation, droits et besoins de revue humaine |

Le coordinateur récurrent Codex est désormais enabled, sur cadence horaire Africa/Dakar, après la pause de la seule veille paiements Nattoo choisie par Habib le 8 octobre. Il lit la file GitHub durable et délègue les rôles à la demande. Le premier refus de création (plafond5/5) est conservé comme historique dans ACTIVATION.json; une première exécution autonome achevée n'est pas encore attestée. Neuf fonctions, pas neuf démons permanents. Les profils Claude sont aussi disponibles dans ce checkout isolé; aucun chargement natif Claude n'est attesté ni aucune session Claude actuelle modifiée. Aucun modèle supplémentaire imposé.

Les profils Gameplay et Personnages possèdent maintenant les outils de réalisation réservée. QA peut exécuter les contrôles sans corriger le code de l'auteur. Le parent Codex assure les mutations du registre et la délégation quand le profil producteur prépare ses affectations.

Lire operations/RUNBOOK.md et STATE.json. Une seule réalisation code au départ, analyses indépendantes en parallèle; frontières et décisions permettent de développer davantage de modules ensuite. En cas de manque de capacité, conserver un blocage concret et poursuivre ailleurs.

Cycle courant : producteur et réseau ont inspecté les sources; QA a vérifié les refs/CI et la conception d'activation; réseau réalise DKAG-007 (délai de handshake), Monde examine #9/#10. Le défaut combat vérifié est prêt ensuite (DKAG-008). Les autres fonctions ont des affectations conditionnelles concrètes dans QUEUE.json.

Aïda0af76 : CI push37714474684 et PR37714480696 terminées success. PR7 toujours candidate, aucune publication. Les autres sessions possèdent ville#9 et mosquée/panneaux#10. Les branches main/visuelle/production restent inchangées.

Le workflow de surveillance Cloudflare existant reste distinct de l'IA. Dernier schedule inspecté37735729906/job113174680914 :10/10PASS à06:06UTC; seules deux exécutions schedule observées depuis minuit malgré cron horaire, donc aucune continuité horaire attestée. La version active reste inconnue sans outil Cloudflare authentifié.
