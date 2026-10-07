# Dakar Rek — démarrage du studio d'agents

Décision D-AG-001, 7 octobre 2026 : Habib a autorisé le démarrage des agents de Dakar Rek sur des branches isolées, après avoir séparé le travail Unity. Ce lot ne change ni le jeu ni sa production.

## Responsabilités

| Rôle | Mission | Configuration |
| --- | --- | --- |
| Producteur | Dépendances, réservations, décisions, version candidate, handoffs | dakar-producer |
| Gameplay / simulation | Boucles, progression et critères observables | dakar-gameplay |
| Monde / architecture | Quartiers, intérieurs, navigation et contraintes graphiques | dakar-world |
| Personnages / narration | Personnalités, routines, dialogues et conséquences | dakar-characters |
| Assets / animation | Modèles, rigs, mouvements, provenance et intégration | dakar-animation |
| Combat | Ressenti, états et vérification du làmb provisoire | dakar-combat |
| Réseau / données | Contrats client/serveur et persistance approuvée | dakar-network |
| QA indépendante | Preuves, défauts, critères et limites des tests | dakar-qa |
| Culture / droits | Sources, statut, consentement et revue humaine | dakar-culture |
| Exploitation Cloudflare | Builds, surveillance, incidents et livraison autorisée | dakar-cloudflare-ops, déjà existant |

Les neuf nouvelles configurations héritent du modèle de la session; aucun modèle payant supplémentaire n'est imposé. Les briefs partagés servent aussi à Codex. Les fichiers Claude sont des sous-agents de projet, pas un service permanent.

## Exécution présente et automatisations

- Les sessions de ce bootstrap exécutent des audits ponctuels et la préparation de tâches. Leur résultat est conservé dans les rapports; elles ne continuent pas seules après leur arrêt.
- La surveillance horaire existante est le workflow `Dakar Rek production watch` introduit par PR #5. Son code/configuration restent inchangés. Lire une exécution réelle avant d'annoncer son résultat.
- Le workflow n'est pas un déclencheur d'IA autonome. Aucun nouveau scheduler, hook, accès, MCP ou quota n'est installé.
- Les spécialistes de conception et le reviewer Claude sont configurés avec Read/Grep/Glob. Ils renvoient un brief au parent, qui le conserve dans les seuls fichiers de tâche autorisés. Cette restriction ne confère aucun accès GitHub/Cloudflare.
- Les rôles de réalisation disposent d'outils d'édition et de l'option Claude isolation: worktree, mais restent en lecture seule sans tâche explicite. Cette configuration prépare un environnement séparé pour une future tâche autorisée; aucun worktree d'implémentation n'est lancé par le bootstrap. Les réservations sont un protocole de coordination, pas une barrière de sécurité filesystem/GitHub. Les règles d'accès réelles et protections de branches ne sont pas modifiées par ce lot.
- Avant toute écriture d'une future tâche, vérifier le répertoire isolé et le HEAD contre le commit de départ assigné. Un worktree Claude peut partir de la branche par défaut, pas de la candidate visuelle; le parent prépare donc la bonne base et refuse tout décalage. En mode équipe de sessions, le frontmatter seul ne prouve pas l'isolation: le parent vérifie effectivement le répertoire séparé avant d'autoriser l'édition. Ne pas lancer une équipe dans le checkout actif de Claude.
- Les tests existants tournent via les contrôles autorisés et CI. Le reviewer vérifie leur preuve et ne transforme pas une lecture de code en nouveau test passé.

## Boucle de livraison

1. Producteur : vérifier les refs actuelles, choisir une tâche prête, réserver ses fichiers et son environnement.
2. Spécialiste : réaliser la tâche ou préparer une proposition dans son périmètre.
3. Contrôles : exécuter seulement les commandes présentes au commit concerné; conserver logs, captures réelles et contexte.
4. Reviewer indépendant : chaque critère doit avoir une preuve; rendre un verdict sans modifier silencieusement le travail de l'auteur.
5. Producteur : accepter, retourner pour au plus deux corrections ou documenter le blocage. Mise à jour de l'état après preuves.
6. Intégration/publication : tâche séparée avec autorité explicitement autorisée, refs revérifiées et contrôles de compatibilité. Pas de publication implicite par la boucle.

## Première livraison

DKAG-001 prépare cette organisation. DKAG-002 établit la carte source → candidate → production, les contrôles existants et les prochaines actions. DKAG-003 prépare un brief concret d'amélioration de l'expérience à partir des sources. Ces audits ne modifient pas le jeu.

La branche de ce lot part de `main@547bb1e8077127094a3fc647821cf6ac73d2a42c`. La candidate visuelle inspectée est `wip/visual-pass@00abf96efeadcc8bdb8d4c859eb1d0258b0978b7`. Elle est distincte du site publié. Ces refs sont datées; les revérifier à chaque nouveau travail.

## Utilisation

Après revue du lot, récupérer ses seuls nouveaux fichiers dans un environnement isolé, en comparant d'abord tout chemin local existant; ne pas remplacer la session visuelle ni fusionner toute sa pile.

Claude : demander au parent de session « Consulte dakar-producer pour proposer les affectations, puis invoque toi-même les spécialistes indépendants et dakar-qa sur leurs tâches réservées. Ne modifie aucune branche réservée. » Le profil producteur est en lecture seule et ne possède pas l'outil de délégation; le parent exécute les affectations et conserve les rapports. Si un nouveau dossier d'agents n'est pas détecté, ouvrir une session dédiée sans fermer la session visuelle.

Codex : donner au spécialiste `AGENTS.md`, son brief partagé et sa tâche; le parent lui transmet les mêmes réservations et contexte. Ce registre n'installe pas automatiquement des profils natifs Codex.

Les mesures sur vrais téléphones et la revue culturelle humaine demeurent distinctes des vérifications automatiques. Aucun résultat ne doit être inventé.

Source du format Claude : https://code.claude.com/docs/en/sub-agents
