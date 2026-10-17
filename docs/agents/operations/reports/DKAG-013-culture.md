# DKAG-013 — Revue culture et provenance

Date : 8 octobre 2026. Auteur indépendant : `culture_resume_1655`. Statut : revue documentaire achevée, rapport **unverified** ; aucune certification culturelle humaine.

## Autorité et preuves

Briefs AGENTS, STUDIO, RUNBOOK et culture lus intégralement dans `specialist-context.json`, transmis depuis contrôle `feac8c3da1cefd766f43794133d135ea6a99853e`. Affectation et réservation QUEUE/STATE au registre `9ce5330f4302cab2724a5d352c8ca3be223a7746`. Aucun registre, source ou ref externe modifié par ce spécialiste.

Sources inspectées directement via GitHub `fetch_file`, à des commits figés :

| Candidate | Sources | Blobs particulièrement utiles |
| --- | --- | --- |
| PR9 `84311a716fa722cd20b4e725a72fd15f60511291` | `src/world/city.ts`, `cityContent.ts`, `src/social/cast.ts`, `beats.ts` | city `9e161399166e92c742f85dbee08fd39bf409cd22`; actions `d657548a84b79ce95b8807aec1ae823f26ae87bf`; cast `5427e414ec88fd9b3a2ea91d1030ed9add5bcb38`; beats `57c1e86dd3650ecd5c14942584edcb5fd034f21e` |
| PR10 `e4f1c291117fb61633d169a008823efd59dce19f` | `src/ads/campaigns.ts`, `public/ad-campaigns.json`, `docs/AD_CAMPAIGNS.md` | campaigns `6804edc79f138278700ac8b8d3842e523519232c`; manifeste `fd7a055fea5b51523759fd18788c33e1f5a5c3c6`; docs `1f55e05d8818174cf3b71739ec64477fe047367a` |
| PR10 même SHA | `src/world/mosque.ts`, `content.ts`, `geew.ts` | mosque `1e6baff999de5e5cffbbf204f81dec4b6c1bc28b`; content `b1718f60110d78c37bdf809af00a5700622740a8`; geew `49169ddc57318f987f3ec3218b3800ae04aa6902` |
| PR9 et PR10 | `assets-src/references/PROVENANCE.md` | même blob `622a53340209fc0cc41692cc748cd25c4a0ad423` |

Lecture complémentaire des fichiers récupérés sous `/workspace/scratch/608bc7678079/world-review/` aux dossiers SHA assignés : PR10 `src/world/content.ts`, `src/main.ts`, `scripts/check-v1-core.mjs`; copies locales `mosque.ts` et `geew.ts`. Les copies hors dossier SHA ne constituent pas à elles seules une nouvelle preuve de HEAD ; aucune prétention à leur exécution. GitHub tree PR10 confirme les chemins `src/world/mosque.ts` et `src/world/geew.ts`. Deux demandes initiales de `PROVENANCE.md` à la racine ont renvoyé 404 ; chemin correct ensuite trouvé et lu. Aucun test, rendu, visite réelle ou conseil humain effectué dans cette revue.

## Constats concrets

### Pêche, ville et sociabilité

`city.ts` représente Soumbédioune dans un découpage géographique explicitement compact/stylisé : pirogues colorées, débarquement, filets, caisses, étals, mareyeuses et ateliers. Ce n'est pas un simulateur de pêche. `cityContent.ts` indique explicitement que commerces, prix et activités courtes relèvent de l'équilibrage fictif. Les gains 3 200 F pour débarquement, 1 800 F pour filets et 2 200 F pour vente/nettoyage ne doivent pas être présentés comme salaires réels.

Les phrases `Nanga def`, `Jën bu bees`, `Dalal ak jàmm`, `Ñu naan attaya` et `Jaaraama` sont réellement présentes. Leur graphie, registre et emploi contextuel n'ont pas été validés ici. Tenues pêcheurs/mareyeuses, composition de la foule, attaya, nourriture et objets artisanaux sont des choix de prototype, pas des généralisations attestées sur les habitants.

`cast.ts` qualifie noms, rôles, liens et écuries de fictifs/provisoires ; `beats.ts` qualifie ses textes français de draft. Les liens de confiance, recommandations familiales et prix d'ami sont des mécanismes narratifs. Des formulations précises méritent une revue humaine : « Que Dieu te le rende », la présentation du respect des anciens à l'écurie, la rivalité et la célébration avec tambours. Aucune attestation de praticien nommé n'est visible dans ces preuves.

### Mosquée facultative : invariant à conserver

PR10 `ACTIONS.mosque` propose `priere` (« Prendre un moment pour prier ») avec `seconds:4` et **sans** coût, argent, needs, affiliation ni compteur religieux. `calme` est une pause ordinaire distincte, avec moral +8 et énergie +4. Ne pas attribuer ces effets à la prière ni inventer une récompense spirituelle.

`docs/AD_CAMPAIGNS.md` confirme les actions facultatives, sans animation rituelle, et l'absence de panneau commercial dans la mosquée. `mosque.ts`, ensuite également vérifié directement sur GitHub au SHA PR10, décrit un espace fictif sans direction de prière revendiquée, affiche un accueil neutre et expose une sortie. Ces éléments sont compatibles avec le périmètre demandé ; l'absence de condition dans l'action ne remplace pas un test de parcours complet. Aucun rite, direction, affiliation, geste ou validation religieuse ne doit être ajouté sans tâche dédiée et revue appropriée.

### Publicité et droits

Le manifeste PR10 inspecté contient `campaigns: []` : aucun sponsor livré. Les emplacements sont rue/quartier et entrée d'arène ; le type `AD_SLOTS` ne comporte pas de mosquée. Le booléen `approved` filtre des campagnes, mais ne prouve ni autorisation contractuelle du sponsor, ni droits du contenu, ni revue culturelle. Les URL HTTPS et le clic explicite sont protections techniques, pas certifications de l'annonceur. Aucune audience ou vente réelle attestée.

`PROVENANCE.md` documente prompts, jobs, transformations et références Higgsfield ; il distingue interprétation artistique et authenticité. Les photos Habib restent décrites, non stockées, droits inconnus ; sponsor/personne photographiés ne doivent pas être copiés. Il maintient les tambours, organisation de l'arène et vêtements/prayer mat en Unreviewed. Habib y est cité pour une direction artistique et des références, non comme praticien culturel attestant chaque détail. La description « Maïga … smaller and dirtier » est une référence de prototype à revoir pour éviter d'en faire un jugement global sur une communauté.

**Lacune ciblée :** le même blob de provenance dans PR9 et PR10 ne comporte pas de dossier de sources spécifique au nouveau débarquement/marché/ateliers de Soumbédioune ni à l'intérieur mosquée. Les références générées et les photos d'arène ne constituent pas cette validation. Le texte historique sur les droits Higgsfield signale lui-même de revérifier avant publication ; ce cycle n'a pas inspecté les conditions actuelles et ne leur donne aucune conclusion juridique.

## Revue humaine utile, bornée

| Contenu exact | Question à remettre au reviewer humain sénégalais nommé | État |
| --- | --- | --- |
| Dialogues de `city.ts/cityContent.ts` | Graphies Wolof/Pulaar, registre, locuteur et emploi naturel des cinq expressions listées | unverified |
| Soumbédioune : débarquement, mareyeuses, filets, pirogues, ateliers | Organisation crédible, costumes et diversité ; éviter l'impression de reproduction géographique exacte ou de salaires réels | unverified |
| Mosquée fictive : tapis/rangées, rangement chaussures, libellés prière/pause | Traitement respectueux et optionalité ; aucune animation rituelle ou qibla attestée | unverified |
| Écuries/dialogues/tambours/termes géew, mbër, ngemb | Sens et usage des termes, rôles et célébration ; distinguer mini-jeu provisoire et pratique réelle | unverified |
| « Maïga plus sale », tenues et métiers genrés récurrents | Formulations/visuels sans stigmatisation ni présentation comme norme culturelle | unverified |

Pour practitioner-approved, consigner identité du conseiller, domaine, date, fichiers et SHA revus, réponses et corrections ; aucune personne n'est mandatée/contactée par ce rapport. Les droits de campagnes réelles nécessitent séparément l'accord du propriétaire et les pièces d'autorisation, avant diffusion.

## Handoff

Fichier créé uniquement : `/workspace/scratch/5677b8b0fdd0/DKAG-013-culture.md`, à publier par coordinateur dans le chemin réservé `docs/agents/operations/reports/DKAG-013-culture.md`. Statut proposé de tâche : revue documentaire terminée ; contenus sensibles toujours unverified. Sources internes inspectées autorisent des constats sur le code et son registre, **pas research-supported culturel**, ni practitioner-approved.

Prochain propriétaire : coordinateur ; plus petite action : rattacher cette liste de contenus à leurs SHAs dans le backlog de revue humaine, sans modifier les branches PR9/PR10. Pour une future tâche documentaire, compléter provenance Soumbédioune/mosquée avec preuves véritablement inspectées. **DKAG-008, correction générique des entrées combat, n'est pas bloquée par cette revue** : elle ne change ni règles culturelles, ni récompenses, ni animation/rite. Pas de nouveaux assets, dépenses ou dépendances proposés ici.
