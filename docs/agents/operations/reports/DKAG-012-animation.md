# DKAG-012 — inspection des animations existantes

Statut : inspection terminée, défaut concret à commissionner. Propriétaire : animation_resume_1655. Date : 8 octobre 2026. Contrôle lu : `feac8c3da1cefd766f43794133d135ea6a99853e`, réservation : `9ce5330f4302cab2724a5d352c8ca3be223a7746`. Sources inspectées exclusivement au commit `0af76c38b152df885c0c27352aa43ac320aa71af`.

## Preuves et méthode

Lecture par `git show <SHA>:src/lamb/duel.ts`, `src/actors/humanoid.ts`, `docs/ASSET_REGISTER.md`, `vite.config.ts`; recherche `git grep` des fallbacks et scripts. Script Node en mémoire utilisant `execFileSync('git', …)` : lecture du header GLB, JSON glTF et accessors float32 du chunk BIN. Aucun fichier source, ref, asset ou checkout auteur modifié. Aucun test du checkout auteur lancé.

Il s'agit d'une inspection statique et numérique de l'export, **pas d'un playback visuel**, ni d'une compilation ou CI. Aucun screenshot, mesure FPS ou contrôle de clipping en jeu n'est revendiqué.

## Export et raccordement

`public/assets/character_v4.glb` : 615 796 octets, header glTF version 2 cohérent, exporteur Khronos glTF Blender I/O v5.2.40, rig DR_Rig à 20 joints. 13 clips : Celebrate, Dance_A, Dance_B, Entrance_Walk, Fall_Back, Grab, Idle, Prep, Run, Sit, Stance, Talk, Walk. Chaque clip de combat inspecté possède 60 canaux (translation/rotation/scale des 20 joints).

| Clip demandé par le duel | Présent | Durée exportée |
| --- | --- | --- |
| Stance | oui | 1,333333 s |
| Grab | oui | 0,666667 s |
| Fall_Back | oui | 0,600000 s |
| Celebrate | oui | 0,533333 s |

`preloadHumanoid` charge le GLB via fetch puis GLTFLoader.parseAsync; `Humanoid` clone la scène par SkeletonUtils et crée une action par nom exact. Les sockets neck/armL/armR/waist et les nodes Ngemb_A/Ngemb_B/Hair_Short sont présents. Les noms des meshes peuvent différer, mais la recherche vestimentaire porte sur les noms des nodes THREE, correspondant aux nodes glTF inspectés.

Le fallback `assets/character_v4.glb.json` est tenté si la réponse GLB échoue. Ce fichier n'existe pas dans le tree au SHA inspecté (`git show` retourne exit 128); aucune génération trouvée dans package/scripts/vite.config. Le chemin alternatif est donc **non disponible dans cette candidate**. Surtout, une réponse GLB HTTP200 mais invalide ne tente pas ce fallback : parseAsync échoue et le catch quitte silencieusement.

La ville conserve ses personnages box si template manque selon le commentaire et le registre. Dans `LambDuel`, mk renvoie au contraire `w:null` et la foule est omise si wrestlerReady est false : le duel poursuit ses règles/UI mais ne crée aucun lutteur visible. Pas de fallback géométrique duel dans ce fichier. `Humanoid.play` ne substitue pas de clip absent : il retourne sans changer l'action; les quatre clips requis existent ici.

## Défaut concret prioritaire : chute qui boucle

`Humanoid.play` applique systématiquement `next.setLoop(THREE.LoopRepeat, Infinity)`, y compris à Fall_Back. Le duel conserve Fall_Back pour le perdant pendant la phase fall (2,4 s) puis result (2,4 s); il ne réinitialise pas ce clip durant ces phases. Le clip de 0,6 s est donc rejoué pendant environ huit cycles, au lieu de conserver sa pose finale.

Accessors BIN réellement lus : root.translation de Fall_Back commence à `[0,-0.1400000006,0]` et finit à `[0,-0.8500000238,-0.8999999762]`. Le retour de boucle rétablit donc un écart local de +0,71 m en Y et +0,90 m en Z avant scale du lutteur 1,08. Cela établit une discontinuité numérique; l'apparence exacte et le clipping restent à filmer. Ce défaut est indépendant des entrées corrigées par DKAG-008.

Grab boucle également : root.translation passe de `[0,-0.14,0]` à `[0,-0.14,0.08]`; le raccord numérique n'est pas fermé. Stance raccorde sa translation root, Celebrate également. Cela ne prouve pas que tous les joints se raccordent ni que Grab soit visuellement acceptable.

## Échelle et contrôles de playback à effectuer

La scène exportée DR_Rig n'a pas de scale ajouté. Humanoid.setWrestler applique group.scale=1,08; la position du duel est Y=0,1. Les bornes POSITION mesh locales vont approximativement de Y=-0,00955 (corps) à Y=1,93814 (cheveux courts); leur lecture n'est **pas** une mesure de silhouette animée/skinnée ou morphée. Le mesh d'origine plus le scale ne suffit pas à certifier l'ancrage des pieds.

Contrôles reproductibles à commissionner, assets existants seulement :

1. Stance→Grab→Stance puis Grab→Fall_Back→result : enregistrer t=0, t=0,2, t=0,59, t=0,61 et fin des phases; vérifier continuité, maintien au sol et winner Celebrate, pour les deux gagnants.
2. Pendant Grab/clinch, inspecter les mains/avant-bras et Ngemb_A/B aux distances existantes 0,75–1,5 m; le duel ne réalise pas de contact IK ni de repositionnement apparié. Un entrelacement est un risque à mesurer, pas une défaillance visuelle observée.
3. Mesurer bounding box skinnée aux échantillons et contact pieds/sol, avec morph Muscular=1, ngemb A/B et accessoires existants; garder positions, rotation et caméra du duel exactes. Vérifier la translation de chute près du bord : le clamp RING agit sur f.pos, pas sur les vertices déplacés par animation.
4. Tester chargement GLB normal, GLB HTTP404, GLB corrompu HTTP200 et clip absent via fixture contrôlée; annoncer clairement ce que le joueur voit. Capture desktop et viewport tactile, sans les présenter comme essai téléphone réel.

## Lot suivant proposé, non autorisé par ce rapport

Objet : **Fall_Back one-shot et maintien final**. Prochain propriétaire : producteur pour réservation, puis animation; reviewer QA distinct. Réserver `src/actors/humanoid.ts`, un test d'animation isolé et un check navigateur dédié; dépendre du handoff DKAG-008 avant toute éventuelle lecture/écriture de duel.ts. Ne pas changer phases/règles/récompenses, rig, clips, packages, workflows ou assets. Enregistrer explicitement une décision de frontière si un autre propriétaire réserve humanoid.ts.

Critères : Fall_Back utilise LoopOnce et clampWhenFinished; sa pose finale demeure stable jusqu'à changement explicite de clip; Stance/Grab/Celebrate gardent leur comportement actuel; retour vers Stance réinitialise correctement l'action; tests au SHA exact plus playback/capture montrant les deux issues du duel et absence de reset à 0,6 s. Le producteur doit commissionner ce lot dans QUEUE/STATE avant réalisation. Fallback duel/JSON : besoin distinct à prioriser, pas glissé dans ce correctif.

Culture/droits : le registre déclare l'export propre au projet, TEMP et non revu. Inspection de métadonnées ne vérifie ni les droits externes ni une authenticité de mouvement. Contenu culturel demeure **unverified**; aucune attestation practitioner-approved. Plus petite action : réserver le correctif one-shot et préparer le test de pose finale.
