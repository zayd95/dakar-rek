# DKAG-011 — Routine réactive de Tonton Ibou

Statut : design livré, à commissionner ; contenu `unverified`. Auteur : `characters_resume_1655`, 8 octobre 2026. Aucun code de jeu modifié, aucun test exécuté et aucune validation culturelle revendiquée.

## Sources réellement inspectées

Briefs AGENTS/STUDIO/RUNBOOK/Personnages lus intégralement depuis `specialist-context.json`, transmis par le coordinateur au contrôle `feac8c3da1cefd766f43794133d135ea6a99853e`. Affectation et réservation DKAG-011 : registre `9ce5330` transmis ; tâche design uniquement.

Sources lues par `git show` dans `/workspace/scratch/608bc7678079/dakar-rek-cycle`, toutes au commit `0af76c38b152df885c0c27352aa43ac320aa71af` :

- `src/social/cast.ts`, blob `5427e414ec88fd9b3a2ea91d1030ed9add5bcb38` : Ibou existe à Pikine, ancre `home`, décalage `(6, 0)` ; lien Ibou–Modou initial 70.
- `src/social/beats.ts`, blob `065d27cb19983bff7e5c029cb0853f81fc0c696f` : accueil Ibou → `reco_modou` → choix de confiance Modou → `modou_trust`. Aucun retour narratif à Ibou après cette étape.
- `src/social/relations.ts`, blob `44d4d21d454a13eed936f598ab56285626e690f7` : relations, flags et choix achevés persistants ; pas de décroissance hors ligne.
- `src/main.ts` : placement par ancre contenant `:home`, puis interactable `npc:ibou` de rayon 3,2 ; `availableBeat` et `openBeat` fournissent le parcours de dialogue ; le journal exploite `suggestion`. Ancre absente = personnage non créé.
- `src/core/types.ts`, `src/core/state.ts`, `tests/social.test.ts`, `src/world/content.ts` : sauvegarde générique flags/beats/rel ; temps personnel joué, pas d'heure locale diégétique ; prix de confiance au garage commandé par `modou_trust`, pas par le score Ibou.

Une tentative de lecture de `src/social/npcs.ts` a échoué : ce fichier n'existe pas à ce commit. Aucune API de déplacement quotidien des PNJ n'a donc été supposée.

## Livraison proposée : « Des nouvelles de Modou »

Objectif d'Ibou : prendre des nouvelles de la recommandation qu'il a déjà faite. Le joueur peut revenir vers lui ; ce retour referme un lien social existant sans créer une activité Aïda bis, un employeur, un emploi ou une récompense monétaire.

Routine bornée : Ibou reste au même emplacement ; sa disponibilité conversationnelle réagit à la mémoire du joueur, non à une horloge inventée. Aucun déplacement, calendrier, nouvelle animation ou mise à jour de ville.

| État | Réaction | Conséquence vérifiable |
| --- | --- | --- |
| Accueil non terminé | Dialogue d'accueil actuel inchangé | Nouveau beat absent |
| Accueil terminé, `modou_trust` absent | Menu actuel inchangé | Aucun résultat de travail supposé |
| Accueil terminé, `modou_trust` présent, retour non terminé | Beat `ibou_modou_followup` disponible | Réaction liée au vrai choix chez Modou |
| Choix « Merci pour la recommandation » | « Content que vous ayez pu parler. Pour la suite, vois directement avec lui. » | Relation joueur–Ibou +2, flag `ibou_modou_followup`, choix sauvegardé une seule fois |
| Choix « Je te raconterai plus tard » | « D'accord, on en reparlera. » | Aucun effet ; beat disponible lors d'une prochaine visite |
| Retour terminé puis rechargement | Nouveau beat absent ; menu normal conservé | Aucune répétition du +2 |

Texte proposé : « Tu as pu parler avec Modou ? » Titre : « Des nouvelles de Modou ». Piste : « Tu peux donner des nouvelles à Tonton Ibou, devant ta chambre à Pikine. » Ces textes sont fictifs, français uniquement, à relire humainement. Ils ne disent ni que le joueur a effectué un service ni qu'Ibou aurait été informé à distance : `modou_trust` prouve seulement la rencontre et la confiance, et le compteur `shifts` mélange plusieurs employeurs.

Ajouter le beat à la fin de `BEATS` pour ne pas déplacer les pistes existantes dans le journal. L'accès direct par `availableBeat('ibou', ...)` fonctionne indépendamment de la priorité de la piste globale. Les deux choix restent facultatifs et aucun refus n'entraîne une sanction.

## Futur lot technique borné

Proposition, pas affectation : branche `codex/agents/ibou-followup`, base compatible à vérifier et réserver par le producteur avant réalisation. Fichiers seulement `src/social/beats.ts`, `tests/social.test.ts`, rapport de tâche. Ne pas réserver `main.ts`, cast, relations, contenu de ville, schema, assets, packages ou workflows.

Implémentation : un beat utilisant les API existantes. Dans `applyChoice`, protéger spécifiquement `ibou_modou_followup` contre beat déjà terminé, précondition fausse et choice non membre ; même niveau de garde que celui actuellement limité à Aïda, sans refactor ni changement des effets des autres beats. Ce besoin est réel : les appels directs à `applyChoice` contournent les gardes UI pour les PNJ autres qu'Aïda. Le fix global de ce comportement reste hors lot.

Critères d'acceptation :

1. Un accueil achevé ET `modou_trust` rendent le retour disponible ; chacun manquant séparément le masque. `shifts` seul ne le déclenche pas.
2. Retour confirmé : exactement +2 Ibou et mémoire enregistrée ; portefeuille, besoins, compteurs, liens entre PNJ et tarifs existants identiques avant/après.
3. Refus répété cinq fois : sauvegarde entière identique ; pas de pénalité ni fermeture du beat.
4. Rejeu direct, double appel, choice étrangère et appel avant préconditions : aucun effet. Après aller-retour sauvegarde/migration : retour toujours terminé et +2 non rejoué.
5. Cast, ordre des beats préexistants et parcours Ibou→Modou existant préservés ; tests sociaux existants, suite unité, typecheck et build exécutés au SHA livré puis CI exacte lue par reviewer distinct.
6. Contrôle navigateur séparé si possible : Pikine → accueil → Modou confiance → retour Ibou → refus → reprise → confirmation → reload ; menu actuel et ancre inchangés. Sinon marquer navigateur non exécuté, sans inventer de capture.

## Handoff

Prochain propriétaire : producteur, puis réalisateur Personnages et QA distincte. Plus petite action : vérifier que `beats.ts` et `social.test.ts` n'ont pas de propriétaire concurrent, acquérir la réservation et épingler une base compatible avant code. Limites : inspection statique seulement, pas de test de navigation/visuel ; le lieu et le rôle fictifs ne constituent pas une attestation culturelle. La revue humaine du dialogue ne bloque pas le correctif combat indépendant.
