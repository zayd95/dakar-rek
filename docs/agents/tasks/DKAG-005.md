# DKAG-005 — Attester la version réellement publiée

- État : backlog lecture seule; prêt à affecter seulement si les outils authentifiés sont disponibles.
- Propriétaire proposé : agent existant dakar-cloudflare-ops.
- Reviewer : dakar-qa; acceptance par producteur.
- Préparation : `docs/agents/reports/DKAG-002-release.md`, `docs/CLOUDFLARE_OPS.md` et profil Cloudflare existant.
- Fichier à réserver : `docs/agents/reports/DKAG-005-deployment.md` sur une branche documentaire dédiée; aucune réservation active dans ce bootstrap.

## Résultat

Relier, ou signaler explicitement comme non traçables, compte/Worker confirmé, configuration actuelle de branche, version active, commit, build et URL. Les anciennes adresses temporaires et la candidate visuelle sont distinguées.

## Critères

- Lecture authentifiée du compte/Worker et de la version active, avec date/source; aucun secret republié.
- Table source → build → version; aucune inférence « build vert = version active ».
- Écart, manque de métadonnée ou absence d'accès documentés honnêtement; une erreur d'accès n'est pas une panne du jeu.
- Aucun changement de configuration, ref de production, version, données, accès, service ou dépense; aucun probe WebSocket ou test de charge live.
- Reviewer indépendant inspecte les preuves avant acceptance.

Si la connexion n'est pas disponible, conserver le blocage d'accès et poursuivre les autres tâches indépendantes autorisées. Cette tâche ne lance aucun onboarding interactif ou déploiement par défaut.
