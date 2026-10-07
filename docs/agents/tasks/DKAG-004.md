# DKAG-004 — Une rencontre avec Aïda qui mène à une activité

- État : backlog proposé, non commissionné.
- Design : dakar-gameplay; relecture narrative : dakar-characters.
- Propriétaire d'implémentation proposé : session Codex avec capacité d'édition, explicitement assignée plus tard.
- Reviewer proposé : dakar-qa, indépendant de l'implémenteur.
- Brief complet : `docs/agents/reports/DKAG-003-gameplay.md`.
- Réservations actuelles : aucune; aucun fichier gameplay ne peut être écrit sur la base de ce document.

## Résultat proposé

Accepter une invitation ne vaut plus une séance accomplie : invitation d'Aïda, activité de révision au point de rencontre existant, puis reconnaissance et conséquence personnelle mémorisée.

## Avant commissionnement

Confirmer la direction créative de cette adaptation narrative, lire le chargeur de sauvegarde, actualiser les refs et obtenir le handoff des fichiers de Claude. Le contrôleur `src/main.ts` n'est pas disponible simplement parce qu'il est mentionné dans le brief.

Une tâche d'implémentation distincte doit fixer sa branche, son commit de départ, ses fichiers et son environnement isolé. Le brief propose `src/social/beats.ts`, `src/world/content.ts`, `src/main.ts`, `tests/social.test.ts`; le script de contrôle navigateur doit d'abord être inspecté et réservé.

## Critères à reprendre dans cette future tâche

- Invitation, séance et reconnaissance constituent trois états observables; aucun gain de séance à la promesse seule.
- Refus répétés, énergie insuffisante, double clic et réouverture de menu n'accordent pas plusieurs récompenses.
- Reload avant/pendant/après et anciennes sauvegardes conservent un comportement explicite sans remise à zéro.
- Les autres histoires restent couvertes; compilation, tests et parcours navigateur sont liés au commit réellement testé.
- Aucun nouveau lieu, package, scheduler, système réseau ou déploiement n'est inclus.

Les textes, lieux de rencontre et durées restent des drafts `unverified`. Le brief est une proposition, pas une nouvelle architecture approuvée ni un résultat de playtest.
