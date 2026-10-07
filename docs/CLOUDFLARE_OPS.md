# Dakar Rek — agent Cloudflare et suivi de production

7 octobre 2026. Ce lot ajoute l'exploitation ; il ne fusionne pas les branches
visuelles ni les PR de gameplay.

## Trois composants

| Composant | Rôle | Exécution |
| --- | --- | --- |
| `.claude/agents/dakar-cloudflare-ops.md` | Agent IA de diagnostic, correction et accompagnement des livraisons | Session Claude Code connectée au compte Cloudflare |
| `scripts/check-production-presence.mjs` | Contrôle léger du site et du protocole réseau | Node 22 ou plus, sans installation npm |
| `Dakar Rek production watch` | Contrôle public et suivi du dernier build, avec rapport conservé | GitHub Actions à chaque heure, minute 17, après intégration sur la branche par défaut |

Le workflow horaire tourne même quand le Mac est éteint. Un fichier d'agent
Claude ne fournit pas à lui seul une exécution IA permanente. Le workflow fournit
les preuves ; une session Claude peut les utiliser pour enquêter et corriger.
L'onboarding est la connexion aux outils, pas la preuve d'un agent déjà actif.

## Onboarding officiel Cloudflare dans Claude Code

Source : https://developers.cloudflare.com/agent-setup/claude-code/

Dans une session Claude Code du projet, exécuter :

```text
/plugin marketplace add cloudflare/skills
/plugin install cloudflare@cloudflare
```

Ces commandes installent le plugin officiel et ses intégrations. Si le plugin
est déjà installé, ne pas le réinstaller. Vérifier `/mcp` et compléter OAuth dans
Safari pour le compte propriétaire. Le compte doit être confirmé par une lecture
du Worker `dakar-rek` avant une opération de gestion.

Le fichier d'agent dispose aussi d'une définition inline du serveur officiel
`https://mcp.cloudflare.com/mcp` pour les versions de Claude Code compatibles.
Si le plugin expose déjà ce serveur, réutiliser sa connexion ; aucune clé n'est
stockée dans le fichier. Un sous-agent en arrière-plan ne peut pas terminer à
la place de Habib une connexion interactive manquante : connecter le serveur
avant de déléguer ce travail.

Cette étape doit avoir lieu sur le Mac du propriétaire ; la connexion Safari
au dashboard n'autorise pas automatiquement le MCP de cette session Codex.

## Utiliser l'agent sans interrompre la livraison visuelle

Dans la branche de Claude, récupérer les deux fichiers de définition et de
guide depuis `origin/main` après leur intégration, en conservant ses changements
locaux. S'ils existent déjà localement et ont été modifiés, comparer avant de
les remplacer. Le script de surveillance peut être récupéré avec eux.

Demander dans une session dédiée :

```text
Utilise dakar-cloudflare-ops pour vérifier le compte et le Worker existants,
lire le dernier rapport de production et les logs utiles, puis traiter les
incidents réseau sur un worktree séparé. Préserve la livraison visuelle en
cours. Vérifie la branche et le commit réellement publiés avant de modifier
ou de déployer. Continue les opérations réversibles déjà autorisées et
rapporte seulement les changements importants ou les blocages concrets.
```

Si la session ne détecte pas son premier dossier `.claude/agents`, ouvrir une
nouvelle session dédiée ; ne pas fermer la session visuelle existante.
L'agent hérite du modèle choisi dans la session.

## Surveillance effectivement disponible

Le contrôle ouvre au plus trois connexions diagnostiques simultanées, dans le
groupe 128, puis les ferme. Les quatre quartiers, les messages de déplacement,
une emote, le départ/reconnexion et le rejet d'une position invalide sont testés.
Le site HTML et la réponse `/api/health` sont vérifiés avec une seconde tentative
en cas d'erreur HTTP.

Le token GitHub automatique du workflow lit uniquement la branche de production
et ses checks. Pas de secret Cloudflare requis pour cette surveillance. Le build
en cours est distingué du déploiement actuel ; un commit récent ne prouve pas
qu'il est déjà actif. L'agent authentifié peut comparer les versions.

Les tests navigateur complets de la branche de production restent nécessaires
après un changement du client ou du serveur. Ce contrôle léger ne prouve pas
la qualité des modèles, des duels partagés, d'un registre économique ou des
performances sur de vrais téléphones.

Rapports : **Actions → Dakar Rek production watch**, résumé de chaque exécution
et artifact `production-presence` conservé sept jours. Pour les notifications,
utiliser les préférences de notification GitHub du propriétaire ; ce lot ne
modifie pas ses préférences et n'envoie pas de messages externes.

GitHub peut retarder les horaires. Le déclencheur programmé ne devient actif
qu'une fois le workflow présent sur la branche par défaut. Une exécution
immédiate est déclenchée par l'intégration de ce lot ; le déclencheur manuel
reste disponible ensuite.

Les variables de dépôt optionnelles `DAKAR_GAME_URL` et
`DAKAR_PRODUCTION_BRANCH` permettent de suivre une nouvelle adresse ou branche
confirmée sans modifier le script. Elles ne contiennent aucun secret.

## Gestion et évolution

Aujourd'hui le Worker de production est lié à `codex/launch-controls`. Les pushes
sur cette branche peuvent publier immédiatement. Conserver cette configuration
tant que l'intégration visuelle et gameplay n'est pas prête ; le lot
d'exploitation sur `main` n'en change pas la branche.

L'agent peut lire les logs, préparer des corrections et gérer les livraisons
autorisées après OAuth. Une réparation IA lancée automatiquement à chaque
incident demanderait en plus un exécuteur connecté au modèle et une politique
d'exécution testée. Cela n'est pas activé par ce lot. Ne pas utiliser un quota
de génération ou un abonnement supplémentaire sans autorisation.

Prochaines extensions selon les vraies livraisons : cohérence des matchs,
autorisations des chats et notes vocales, persistance des comptes et transactions
idempotentes. Ne pas annoncer ces systèmes comme opérationnels avant recette.

## Blocage de la tâche ChatGPT

La création d'une veille horaire ChatGPT a été refusée le 7 octobre : plafond de
cinq tâches actives déjà atteint. Aucune tâche existante n'a été modifiée. Le
workflow GitHub fournit la surveillance récurrente sans dépendre de ce quota.
