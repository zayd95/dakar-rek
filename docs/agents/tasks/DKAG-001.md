# DKAG-001 — Organiser les agents sans changer le jeu

- État : done pour la livraison du bootstrap en PR brouillon; aucune intégration, activation native ou publication incluse.
- Propriétaire : producteur Codex de cette conversation.
- Reviewer : session indépendante dakar_studio_qa.
- Branche : codex/agent-studio-bootstrap.
- Base : main@547bb1e8077127094a3fc647821cf6ac73d2a42c.
- Autorisation : « lets do it », après proposition de mettre en place les agents sur des branches isolées en préservant Claude et la production.
- Fichiers : nouveaux AGENTS.md, CLAUDE.md, neuf .claude/agents/dakar-*.md (sauf dakar-cloudflare-ops.md existant), et nouveaux docs/agents/** seulement.
- Réservation : ces nouveaux chemins; aucun fichier existant ne doit être remplacé.

## Critères

- [x] Rôles Claude et briefs partagés Codex cohérents, modèle hérité et responsabilités claires.
- [x] Branche dédiée; aucun changement source, assets, workflows, agent Cloudflare existant, refs protégées ou déploiement.
- [x] Une tâche = un propriétaire, fichiers réservés, commit de départ et revue indépendante.
- [x] Audits initiaux terminés avec preuves attribuées et prochaine tâche concrète.
- [x] Définitions, sessions ponctuelles et surveillance existante sont distinguées sans promesse d'IA permanente.
- [x] Revue indépendante et comparaison du Git tree confirment les seuls chemins nouveaux autorisés.
- [x] PR de revue ouverte; aucun merge ou publication.

## Limites

Pas de nouvel achat, service, compte, workflow, secret, architecture gameplay ou migration. Pas de vérification live intrusive. Rien de la session Unity n'est transféré comme règle de Dakar Rek.

## Clôture

Accepté par le producteur après revue indépendante de dakar_studio_qa : [PR #6](https://github.com/zayd95/dakar-rek/pull/6), premier commit `7520b3148efd7ec74555f58b3f43d8c38af91ec8`. Comparaison complète : 31 ajouts autorisés, 63 blobs préexistants identiques, aucune suppression; refs main, visuelle et production inchangées lors de la lecture indépendante à 20:20 UTC. Rapports DKAG-002/003 acceptés comme audits et propositions. Aucun test runtime ni chargement Claude exécuté. Les tâches DKAG-004/005 restent en backlog.
