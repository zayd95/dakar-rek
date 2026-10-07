# DKAG-003 — Une personnalité qui produit une activité jouable

Statut du handoff : **ready pour revue indépendante**. Rapport du 7 octobre 2026. Lecture seule du jeu; une proposition de backlog, aucune implémentation commandée.

## Périmètre et preuves

Source commune : `zayd95/dakar-rek`, candidate `wip/visual-pass@00abf96efeadcc8bdb8d4c859eb1d0258b0978b7`. Ce commit n'est pas une preuve de version publiée. Le bootstrap documentaire part séparément de `main@547bb1e8077127094a3fc647821cf6ac73d2a42c`.

Lectures locales : `evidence/SOURCES.md`, snapshot `evidence/visual/src/social/{cast,relations,beats}.ts`, `docs/{ART_DIRECTION,FEATURES,INTEGRATION_2026-10-07}.md`, `package.json`. Lectures GitHub supplémentaires, toutes au SHA candidat exact : `src/core/{types,state}.ts`, `src/world/{content,types}.ts`, `src/ui/hud.ts`, `src/main.ts`, `tests/social.test.ts`. L'environnement est un audit de fichiers, pas une exécution du jeu. Aucune commande de test, visite de production, capture ou mesure sur appareil n'a été réalisée.

Sources consultables : [candidate exacte](https://github.com/zayd95/dakar-rek/tree/00abf96efeadcc8bdb8d4c859eb1d0258b0978b7), [beats](https://github.com/zayd95/dakar-rek/blob/00abf96efeadcc8bdb8d4c859eb1d0258b0978b7/src/social/beats.ts), [contrôleur](https://github.com/zayd95/dakar-rek/blob/00abf96efeadcc8bdb8d4c859eb1d0258b0978b7/src/main.ts), [actions](https://github.com/zayd95/dakar-rek/blob/00abf96efeadcc8bdb8d4c859eb1d0258b0978b7/src/world/content.ts), [tests sociaux existants](https://github.com/zayd95/dakar-rek/blob/00abf96efeadcc8bdb8d4c859eb1d0258b0978b7/tests/social.test.ts).

## Ce que Claude a déjà construit, à réutiliser

| Existant dans les sources | Preuve exacte | Limite de la conclusion |
| --- | --- | --- |
| 12 personnages nommés dans quatre hubs, 11 liens entre PNJ | `src/social/cast.ts`, `CAST`, `START_LINKS` | Noms, métiers et liens explicitement fictifs/provisoires |
| 13 interactions écrites, recommandations, aide, rivalité et célébration | `src/social/beats.ts`, `BEATS` | Texte français authored; aucun besoin de générer des dialogues en direct pour cette étape |
| Relations, flags et histoires terminées conservés dans la sauvegarde locale | `src/core/types.ts:SaveData`; `src/social/relations.ts:Relations`; tests de round-trip dans `tests/social.test.ts` | Tests lus, pas relancés; pas d'autorité économique serveur |
| Conséquences concrètes de certaines relations | `src/world/content.ts`: `meca_conf`, `pirogue`, `ami`, conditions sur `modou_trust`, `ousmane_trust`, `mame_helped`, `fatou_friend` | Tarifs et usages sont des valeurs de jeu provisoires, pas une étude économique locale |
| Activités avec durée, besoins, compteur, coût/gain et disponibilité | `src/world/types.ts:Action`; `src/main.ts:runAction`, lignes 434–457; `src/world/content.ts:ACTIONS` | Activités abstraites avec progression; l'animation spécifique n'est pas prouvée |
| Discussion et rencontres accessibles près des PNJ | `src/main.ts:loadHub`, ligne 200; `openActions`, `openBeat` | Sauf Ibou, les activités hors histoire utilisent actuellement la même liste `CHAT` |
| Carnet et une piste suggérée | `src/main.ts:openJournal`, `frame`; `src/ui/hud.ts:setGoal`; `src/social/beats.ts:suggestion` | La piste est la première histoire éligible dans l'ordre du tableau, sans priorité au quartier courant |

Le rapport d'intégration attribue à une session précédente 23 tests unitaires, 17 contrôles réseau locaux et 49 contrôles gameplay réussis. Ce sont des preuves historiques rapportées, pas des résultats produits par cet audit. Les déclarations contradictoires de `FEATURES.md` — par exemple escalier à la fois accessible et encore inaccessible, combat à la fois partiel et pending, textures indiquées non générées — empêchent d'utiliser ce fichier comme état de livraison unique. Le contrôleur calcule désormais `cityTimeAt(presence.serverNow())`; la mention « device clock / server time pending » de ce même document est également insuffisante pour décrire le comportement courant. Les mécanismes de synchronisation de cette horloge n'ont pas été audités ici.

## Les écarts qui comptent pour la simulation de vie

1. **Les biographies ne sont pas encore des contraintes vécues.** `CastMember` contient identité, rôle, hub, ancrage et tenue; pas d'ambition ou de routine comportementale. Le contrôleur place les personnages à leur ancrage et les anime à vitesse zéro (`loadHub`, `frame`). Le document d'intégration confirme que routines et fiches de personnalité restent à construire. Les déplacements et horaires demanderaient un travail séparé; ils ne sont pas implicitement approuvés.
2. **Certains engagements deviennent immédiatement des accomplissements.** `aida_revise/venir` ajoute relation +10, social +12, énergie −6, compteur `etudes` et `aida_friend` à la sélection « Je viens ». `openBeat` appelle directement `applyChoice`; aucun déplacement à la bibliothèque ni séance distincte n'est requis par ce chemin. C'est un constat statique du code, pas un retour de joueur. Adja et Khady condensent aussi leur service dans le choix écrit; ne pas prétendre qu'ils sont des missions spatiales.
3. **Les reports peuvent répéter leurs effets.** Les choix `modou_reco/plus_tard`, `mame_gaz/refuser`, `ablaye_join/regarder`, `aida_revise/non` appliquent des deltas de relation tout en laissant l'histoire inachevée. La répétition via le menu semble possible d'après `openActions`/`openBeat`; aucun garde d'idempotence n'apparaît dans ce chemin. C'est une hypothèse de risque issue des sources, non un bug reproduit. La discussion générique répétable avec gain +1 est un mécanisme distinct qu'il ne faut pas supprimer implicitement.
4. **La prochaine piste ne tient pas compte du report.** Une histoire toujours disponible reste candidate à `suggestion`, qui choisit le premier résultat sans mémoire du refus ni du contexte local. Elle peut donc conserver la même priorité. Ce mécanisme mérite un diagnostic séparé; ce lot ne propose pas de refaire tout le Carnet.
5. **Une grande partie du personnage disparaît hors de son histoire.** Les onze PNJ autres qu'Ibou reçoivent la même action `CHAT`; après un beat terminé, beaucoup de spécificités passent seulement par les flags. L'opportunité immédiate consiste à faire accomplir une activité propre à un personnage existant, avec une conséquence mémorisée.

## Une seule tâche proposée : DKAG-004 — Réviser réellement avec Aïda

**Lifecycle : backlog proposé, non commissionné.** Producteur à confirmer : Astra. Propriétaire d'implémentation proposé : une session Codex explicitement assignée, avec capacité d'édition et périmètre réservé dans une tâche séparée. dakar-gameplay reste responsable de la conception en lecture seule; dakar-characters relit le texte en lecture seule. Reviewer indépendant proposé : dakar-qa. Aucun outil de ces profils n'est étendu par ce brief. Ce rapport ne réserve aucun fichier gameplay et n'autorise aucun travail sur la branche visuelle de Claude.

**Résultat joueur.** Aïda devient une personne dont le projet d'examens conduit à une activité identifiable : le joueur accepte une invitation, accomplit une courte séance au point de rencontre déjà existant, puis Aïda reconnaît cette participation. Une promesse ne vaut plus une séance terminée. Le joueur peut refuser et revenir sans pénalité répétée ni obligation de jouer à une heure réelle.

**Parcours minimal proposé.**

| État | Choix / action | Conséquence proposée |
| --- | --- | --- |
| Invitation disponible | Accepter dans le beat `aida_revise` | Conserver l'ID historique du beat; poser un nouveau flag d'invitation. Ne pas accorder encore les gains de séance, `etudes` ou `aida_friend`. Réponse indiquant de fermer la fenêtre puis choisir « Réviser avec Aïda » au même PNJ |
| Invitation reportée | « Une autre fois » | Invitation disponible plus tard, effets vides pour ce report; pas de gain de relation répétable par refus |
| Invitation acceptée, séance non faite | Action dédiée « Réviser avec Aïda » dans le menu du PNJ | Gratuite; durée courte déclarée comme abstraction de jeu, par exemple 4 s; énergie minimale 6; progression existante; social +12, énergie −6; compteur dédié `aida_revisions` à la fin |
| Séance finie, reconnaissance non faite | Nouveau beat d'Aïda conditionné par flag d'invitation et `aida_revisions >= 1` | Réaction authored rappelant la séance; poser `aida_friend`, incrémenter `etudes` une fois et donner +9 de relation. `runAction` ajoute déjà +1 au PNJ, ce qui conserve +10 sur l'ensemble du parcours |
| Rencontre terminée | Discussions génériques existantes | Séance unique masquée; beat de reconnaissance terminé; pas de nouvelle récompense par réouverture du menu |

Le compteur `etudes` représente alors une séance accomplie puis reconnue; il n'est plus accordé à l'invitation. Les bénéfices de besoins sont accordés au terme de l'activité. Ce compromis réutilise l'action et les effets de beat existants sans ajouter un moteur de quêtes ou un hook général d'effets. Ce n'est pas encore une routine quotidienne répétable.

**Écriture narrative proposée, encore `unverified`.** Aïda prépare ses examens — motivation déjà authored. Pour cette petite livraison, elle propose une séance au point de rencontre actuel du café; supprimer la promesse d'un trajet à la bibliothèque de l'UCAD et d'un rendez-vous « ce soir/après le cours » tant que ces lieux et états ne sont pas jouables. Habib doit approuver cette adaptation du texte; aucune nouvelle traduction, pratique locale ou horaire réel n'est affirmé.

**Fichiers proposés, à réserver lors d'une tâche séparée.**

- `src/social/beats.ts` : adapter uniquement l'invitation d'Aïda et ajouter son beat de reconnaissance; garder les autres arcs et IDs.
- `src/world/content.ts` : liste d'actions spécifique à Aïda, avec visibilité sur invitation + compteur dédié, condition d'énergie et activité existante de discussion.
- `src/main.ts` : choisir cette liste pour `npc:aida` dans l'affectation des actions du cast, au lieu de `CHAT`. Réutiliser `runAction`; aucune réécriture du contrôleur et aucun changement réseau.
- `tests/social.test.ts` : tests de la transition, du report sans récompense et des sauvegardes; assertions sur visibilité/prérequis de l'action en réutilisant les conditions de données. Les tests doivent vérifier le parcours, pas simplement recopier les objets.
- Le fichier existant de contrôle navigateur approprié sera identifié et réservé après lecture de son contenu. `scripts/shots.mjs` est mentionné par les docs, mais son contenu n'a pas été inspecté; ne pas l'ajouter aux réservations sans cette lecture.

**Dépendances.** Handoff de Claude et refs actualisées avant création d'une branche isolée; approbation du texte et du compromis de séance locale par Habib; revue de la sauvegarde actuelle avant réalisation pour vérifier le traitement des flags/counters inconnus; contrôle des actions effectivement accessibles à `npc:aida`. Aucun nouveau package, service, asset, frais, compte, scheduler, lieu, animation, règle de combat ou changement de protocole. Le schéma `SaveData` a déjà flags et counters extensibles; aucune migration n'est proposée sans vérifier `src/core/save.ts`, qui n'a pas été lu dans cet audit.

**Cas limites et comportement attendu.**

- Ancienne sauvegarde avec `aida_friend` et `aida_revise` terminé : considérer l'ancienne rencontre comme accomplie; ni remise à zéro, ni séance imposée, ni récompense rétroactive.
- Nouvelle invitation acceptée, sauvegarde/rechargement avant la séance : invitation et activité conservées. Reload pendant progression : pas de gain si la fin n'a pas eu lieu; séance de nouveau disponible. Vérifier réellement le comportement du runner existant.
- Énergie <6 : action visible mais désactivée avec motif; aucune dépense, relation ou compteur accordé. À énergie suffisante : action accessible sans paiement.
- Séance accomplie puis changement de hub, de qualité ou reconnexion présence : compteur conservé; reconnaissance disponible au retour; état personnel jamais envoyé comme vérité partagée.
- Menu rouvert / clics rapides / double déclenchement : au plus une séance et une reconnaissance récompensées. Si les gardes UI existants ne suffisent pas à le prouver, ajouter un garde ciblé dans le périmètre réservé et le tester, sans modifier tous les beats.
- Refus répétés : pas de gain de relation et pas de fermeture définitive de l'arc. L'ordre global de suggestion reste une limite connue de cette tâche.
- Sauvegarde incohérente importée : ne pas inventer une migration ni garantir son support; inspecter le chargeur et documenter le comportement choisi avant implémentation.

**Critères d'acceptation observables.**

1. En partie neuve à la Corniche, accepter l'invitation ne change ni besoins, ni `etudes`, ni `aida_friend`; le dialogue indique une action réellement disponible au PNJ.
2. Le menu d'Aïda expose la séance seulement après invitation et avant accomplissement; le menu d'un autre café/PNJ ne l'expose pas.
3. La séance affiche la progression, applique ses besoins et `aida_revisions` seulement à sa fin; les états avant/après sont conservés comme preuve. Le bonus générique +1 lié à `npc:aida` est compté une seule fois.
4. Le beat de reconnaissance est absent avant la séance, présent après, puis termine l'arc avec `aida_friend`, `etudes +1` et relation +9 une seule fois.
5. Refus, manque d'énergie, reload aux trois étapes, ancienne sauvegarde et répétition des menus respectent les cas ci-dessus. Les tests sociaux existants des autres personnages restent verts.
6. `npm test` et `npm run build`, scripts présents au SHA inspecté, réussissent sur le futur commit. Une vérification navigateur du parcours réel et une capture du menu sont liées à ce commit, au navigateur et au viewport; aucune ne vaut test sur téléphone physique. Ne pas déclencher `deploy`.
7. Reviewer indépendant contrôle les preuves et la réserve de fichiers; producteur accepte ou retourne la tâche. Mise en production hors périmètre.

## Trajectoire après ce premier parcours — pas de tâches actives

Après validation, généraliser uniquement à partir des besoins démontrés : fiches de persona brèves liées à états observables; activités propres aux métiers; souhaits/priorités du joueur et pistes contextuelles; puis horaires, déplacements et contraintes d'accès après une décision sur le temps de ville et les états hors ligne. Les routines visibles, animations d'assise et relations avec conséquences pourraient ensuite former une tranche de quartier complète. Multijoueur et économie partagée demandent leurs contrats et autorité propres; ne pas les déduire des flags personnels. Cette trajectoire n'approuve aucune extension d'architecture.

## Handoff

- **Status : ready**, rapport à relire; DKAG-004 demeure backlog proposé.
- **Fichier changé :** `docs/agents/reports/DKAG-003-gameplay.md` uniquement.
- **Evidence :** lectures locales et GitHub au SHA `00abf96…` listées ci-dessus; critères rédigés, aucune nouvelle capture ou exécution.
- **Verification :** cohérence statique entre beat, effets, Action, affectation du cast, runAction, Carnet et tests sociaux inspectée. Aucun test déclaré passé par cet agent.
- **Known limitations :** snapshot daté; production et appareil physique non inspectés; absence de routine animée, d'horaire exécutable ou de nouvelle scène; save loader à lire avant commissionnement; suggestion globale non refaite.
- **Cultural assumptions :** cast, texte, rôles, durées et lieux de rencontre sont des drafts `unverified`; validation créative par Habib; toute affirmation culturelle sensible exige un conseiller sénégalais nommé et une revue documentée. Aucun élément n'est `practitioner-approved` par ce rapport.
- **Next owner :** session dakar_studio_qa pour revue indépendante de ce rapport, puis producteur pour décider de la commission.
- **Smallest next action :** relire les critères de DKAG-004 contre les sources et obtenir l'accord sur la séance au café avant de réserver une branche et des fichiers.
