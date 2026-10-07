# DKAG-001 — Organiser les agents sans changer le jeu

- État : review; profils et audits relus, PR/diff distants à vérifier avant clôture.
- Propriétaire : producteur Codex de cette conversation.
- Reviewer : session indépendante dakar_studio_qa.
- Branche : codex/agent-studio-bootstrap.
- Base : main@547bb1e8077127094a3fc647821cf6ac73d2a42c.
- Autorisation : « lets do it », après proposition de mettre en place les agents sur des branches isolées en préservant Claude et la production.
- Fichiers : nouveaux AGENTS.md, CLAUDE.md, neuf .claude/agents/dakar-*.md (sauf dakar-cloudflare-ops.md existant), et nouveaux docs/agents/** seulement.
- Réservation : ces nouveaux chemins; aucun fichier existant ne doit être remplacé.

## Critères

- [ ] Rôles Claude et briefs partagés Codex cohérents, modèle hérité et responsabilités claires.
- [ ] Branche dédiée; aucun changement source, assets, workflows, agent Cloudflare existant, refs protégées ou déploiement.
- [ ] Une tâche = un propriétaire, fichiers réservés, commit de départ et revue indépendante.
- [ ] Audits initiaux terminés avec preuves attribuées et prochaine tâche concrète.
- [ ] Définitions, sessions ponctuelles et surveillance existante sont distinguées sans promesse d'IA permanente.
- [ ] Revue indépendante et comparaison du Git tree confirment les seuls chemins nouveaux autorisés.
- [ ] PR de revue ouverte; aucun merge ou publication.

## Limites

Pas de nouvel achat, service, compte, workflow, secret, architecture gameplay ou migration. Pas de vérification live intrusive. Rien de la session Unity n'est transféré comme règle de Dakar Rek.
