# DKAG-009 — compatibilité Monde, reprise du 8 octobre 2026

Statut : review-ready. Auteur indépendant : world_resume_1655. Aucun fichier de jeu, ref ou checkout d'une autre session modifié. Rapport seul, publication réservée au producteur.

## Périmètre et preuves

Brief entièrement lu dans specialist-context.json : AGENTS, STUDIO, RUNBOOK, rôle Monde, QUEUE/STATE au contrôle feac8c3da1cefd766f43794133d135ea6a99853e et réservation 9ce5330f4302cab2724a5d352c8ca3be223a7746. Rapport historique DKAG-009 lu directement sur GitHub au même contrôle. Son entrée PR10 1610e51 est historique, pas la candidate actuelle.

Entrées épinglées : PR9 ville 84311a716fa722cd20b4e725a72fd15f60511291 ; PR10 mosquée/publicité e4f1c291117fb61633d169a008823efd59dce19f. Le parent a revérifié les heads actuels ; ce reviewer a relu via GitHub les listes de fichiers des deux PR, billboard.ts, city.ts, mosque.ts, geew.ts et les collections de CI filtrées par SHA. Les copies locales des deux builder.ts ont été contrôlées par git hash-object : 9733b564e8cdedd80852842c54780384550a408a et 1e4031ce69a434f9fa7ceede5cd215365a333ef9, identiques aux blobs de la réponse PR files. city.ts/mosque.ts ont été relus directement au SHA après constat que les copies de commodité locales n'avaient pas le hash attendu ; elles ne servent pas de preuve byte-identical.

Commandes réellement exécutées : rg des ancres/colliders/rebuild ; diff -u des heads (builder/main/types/phoneHooks) ; sed ciblé ; git hash-object ; node -e pour les distances et bornes. GitHub fetch en lecture seule : pulls/9/files, pulls/10/files, actions/runs?head_sha=… et raw files ci-dessus. Aucun navigateur, build, merge, test de jeu local ou capture exécuté par ce reviewer. Les calculs sont des reproductions statiques exécutées, pas un parcours joueur.

CI exacte relue, terminée success : PR9 runs [37716867199](https://github.com/zayd95/dakar-rek/actions/runs/37716867199) et [37716751826](https://github.com/zayd95/dakar-rek/actions/runs/37716751826) ; PR10 runs [37777353838](https://github.com/zayd95/dakar-rek/actions/runs/37777353838) et [37777345566](https://github.com/zayd95/dakar-rek/actions/runs/37777345566). Métadonnées de conclusion seulement : logs complets non relus, pas de nombre de tests revendiqué. Deux CI vertes séparées ne vérifient pas l'assemblage.

## Géométrie, navigation et ancres

Ville PR9 : dix clés CITY_BLOCKS, distinctes des clés landmarks de SPECS. Corniche 0,3 et 2,3 ; Plateau 3,1/1,3/3,3 ; Almadies 2,2/3,2 ; Pikine 0,1/0,3/1,3. Elles ne remplacent ni la mosquée Plateau 1,1 ni l'arène Pikine 2,1, ni les stations/spawns. Les banques ont murs arrière/latéraux, non une boîte solide scellant l'accueil ; le mall conserve un axe central entre pylônes ±20 m et jardinières ±7 m ; les shops laissent un comptoir partiel et un devant ouvert. Vérification statique : pas une preuve de tous les itinéraires.

Soumbédioune exige ses trois changements associés dans builder : rail ouest discontinu sur z64…116, bounds.x0=−155, et exclusion des cityRects du placement aléatoire de mobilier. PR10 seule conserve un rail continu et bounds.x0=−133.2 ; appliquer son builder entier à PR9 supprimerait les lieux et rendrait l'ancre débarquement x−138 hors bornes. Ce n'est pas une régression dans PR10 indépendante : c'est une contrainte d'assemblage. Conserver les colliders de pirogues et les accès de PR9, puis jouer le passage depuis un croisement (pas uniquement téléporter sur l'ancre).

Mosquée PR10 : porte à (cx,cz−11.5), face avant collider à cz−9, donc marge statique 2.5 m ; rayons d'action 3 m. Intérieur 12×16 m ; spawn (ox+3,oz+6), sortie (ox+3,oz+7), calme (ox,oz). Étagère de chaussures côté gauche, hors axe spawn→sortie. Le collider du mur est fermé : sortie par interaction/transition, pas traversée physique du mur. Les intérieurs sont créés avec IDs stables dans loadHub ; exitInterior retourne à door.x/z ; saveNow sauvegarde la porte de rue ; le rebuild qualité mémorise roomId et position, reconstruit puis restaure la pièce. Pas de changement des IDs entre low/medium observé dans les branches concernées. La conservation réelle après reload/qualité est couverte par un script existant PR10 mais n'a pas été rejouée ici.

Les panneaux sont ajoutés indépendamment de lite. Les ancres de rue sont au bord des blocs de départ, non dans un nouveau CITY_BLOCK. Le nombre de lieux et les IDs ville restent stables en low ; lite réduit habitants, pirogues et détails, pas le répertoire. Aucun budget GPU ni performance téléphone mesuré.

## Défaut concret conservé dans PR10 actuelle

builder.ts place pikine-arena à (cx,cz−WALL_R−0.7), yaw π, WALL_R=21.7. addBillboard déporte son approche de 1.5 m vers −z : ancre publicité (cx,cz−23.9). L'ancre de l'arène est (cx,cz−24). findNearest choisit la plus petite distance, sans priorité fonctionnelle.

Reproduction node à x=cx : z=cz−24.04 → distances arène0.04/publicité0.14 → arène ; z=cz−23.94 → distances arène0.06/publicité0.04 → publicité. Le déplacement de 10 cm change donc le menu de la même entrée. Le script PR10 place directement le joueur sur l'ancre publicité et attend le menu publicité : il ne vérifie pas l'approche normale ni l'absence de concurrence avec l'arène.

Billboard inspecté : cadre largeur5.25, hauteur2.75, base2.35 ; face largeur5 à y3.725 ; pieds x±2, colliders0.2×0.2. Il est posé au centre de la porte, à 0.7 m devant le mur. Cela justifie un contrôle de cadrage, mais ne prouve pas qu'il scelle physiquement le passage : la face commence en hauteur et le centre n'a pas de collider. Ne pas qualifier cela de porte impassable sans exécution.

Plus petit correctif proposé, non réalisé : déplacer seulement le panneau et son approche hors axe de porte, sur un emplacement latéral réellement libre de stands, marchands, mât et barrières. Ne pas changer arbitrairement la priorité globale de findNearest. Base PR10 exacte, branche isolée nouvelle commissionnée ; fichiers minimaux src/world/builder.ts et scripts/check-v1-core.mjs ; aucune ref externe modifiée. Critères : approche centrale et menu arène stables ; publicité reste explicitement accessible ; pieds hors trajet avec marge joueur0.5 m ; parcours desktop/tactile et qualité low/medium ; capture cadrage porte/ring. Le choix des coordonnées nécessite examen local des voisins : pas de valeur prétendument validée fournie.

## Chevauchements et assemblage

Liste actuelle des fichiers modifiés par LES DEUX PR : .github/workflows/checks.yml, src/main.ts, src/world/builder.ts, src/world/types.ts. Les différences content.ts/interiors.ts/phoneHooks entre heads ne signifient pas chevauchement d'auteurs : PR10 seule ajoute mosquée/content/interiors ; PR9 seule ajoute phoneHooks.openPlaces/batch/PlacedPeople/city. Ne pas remplacer un head entier par l'autre.

builder : conserver imports CITY_BLOCKS/BAY/buildCityBlock ET createBillboard/AdSlot ; conserver builder ville, rail/bounds et filtre cityRects ET porte mosquée/panneaux/tick/dispose. types : conserver PersonLook/look/walkTo/description ET AdSlot/adSlot. main : conserver PlacedPeople/update/dispose, descriptions, répertoire et walkingHint ET traitement adSlot, contextual menus, mosquée et light distance. La simple reprise de main PR10 perdrait les routines/look spécifiques ville et le repère. checks.yml : conserver les deux contrôles déjà introduits et leurs preuves dans une future intégration, sans autoriser un changement de workflow dans ce lot.

Le rapport historique reproduisait des conflits textuels via git merge-file contre leur base ; ces conflits n'ont pas été rejoués dans cette reprise. Les chevauchements ci-dessus sont actuels et les pertes fonctionnelles sont tirées du diff réel des heads, pas d'un assemblage exécuté. Aïda reste une troisième candidate séparée : garder ses guards busy/scene/interactionVersion dans openActions, puis ajouter publicité avec revalidation sponsor. Pas de compatibilité combinée auto-approuvée.

## Handoff

Critères DKAG-009 satisfaits comme revue statique bornée : ancres/navigation/colliders/qualité inspectés, chevauchements exacts nommés, défaut concret reproduit, correctif minimal proposé, zéro duplication ville/mosquée/publicité. Culture et dialogues unverified ; aucune attestation de praticien. Prochain propriétaire : producteur pour enregistrer commission et base compatibles ; plus petite action : réserver le déplacement latéral du panneau sur nouvelle branche isolée avec QA distincte, ou transmettre ce diagnostic au propriétaire PR10. Aucun merge, déploiement ou publication du jeu demandé par ce rapport.
