# Roi des Arènes — atelier des lutteurs

WEB-001, première étude visuelle indépendante sous D-005. Deux anatomies adultes, athlétique et puissante, à une même échelle. Comparaison, vues face/profil/dos/¾, rotation, zoom, pose de repos/anatomie et inspection en argile/maillage. Le mode Déplacements (WEB-002) permet maintenant de marcher et tourner un lutteur dans une zone d’essai. Il n’y a pas encore de combat.

Cette réalisation locale correspond au dossier de la branche `lab/roi-des-arenes-threejs` de `zayd95/dakar-rek`, inspectée à `ab142b84b17bff0a420a31d03f708f89e22c3126`. Le transfert initial et son brief restent dans `state/threejs-handoff.md` à la racine du workspace. Aucun fichier du runtime Dakar Rek n’est importé. Aucun changement n’a été poussé sur GitHub.

## Utilisation locale

Depuis ce dossier, avec Node et npm disponibles :

```sh
npm ci --ignore-scripts
npm run dev -- --port 5178 --strictPort
```

Ouvrir `http://127.0.0.1:5178/`. Glisser pour tourner, utiliser la molette ou le pincement pour zoomer. Les boutons sont accessibles au clavier. Lorsque la scène a le focus, les flèches gauche/droite tournent, `+`/`-` zooment et `Home` recentre. Les modèles sont locaux, sans CDN ni service externe.

```sh
npm run typecheck
npm run build
npm run preview -- --port 5179 --strictPort
```

Le build autonome est produit dans `dist/`. Les dépendances sont limitées à Three.js 0.169.0, @types/three 0.169.0, TypeScript 5.9.3 et Vite 5.4.21, avec leurs dépendances transitives verrouillées. Le dossier possède son propre manifeste et verrou npm ; il ne modifie pas ceux d’un autre projet.

## Modèles et reproduction

Le GLB livré est déjà prêt dans `public/assets/`. Sa provenance, les restrictions de la revue et les transformations sont décrites dans `ASSET_PROVENANCE.md`. La régénération nécessite le fichier source local existant, non livré ici, dont l’empreinte est vérifiée avant lecture :

```sh
python3 scripts/prepare-study.py /absolute/path/to/character_v6.glb
```

Ces scripts utilisent la bibliothèque standard Python, sans installation supplémentaire. Les shorts neutres et les pupilles sont créés par le viewer ; aucune tenue ou animation héritée du personnage source n’est utilisée. La pose de repos est générique, sans technique sportive revendiquée.

## Vérification de WEB-001

`evidence/build.log` contient le build contrôlé. `evidence/browser-checks.json` et les captures contiennent la vérification dans Chrome installé : 18 contrôles réussis, zéro erreur sur le parcours normal, notamment sélection, quatre vues, rotation, clavier, pointeur, options, largeur 390 px et erreurs de modèle/WebGL. Pour les reproduire, utiliser un runtime Playwright déjà installé et Chrome ; le script ne télécharge ni package ni navigateur :

```sh
node scripts/check-viewer.mjs /absolute/path/to/playwright http://127.0.0.1:5178/
```

Le rendu contrôlé est Chrome desktop headless avec SwiftShader. Les messages GPU `ReadPixels` concernent les captures dans cet environnement. Ce n’est ni une mesure de FPS sur téléphone, ni une validation de performance Android. Vite signale encore un bundle JavaScript supérieur à 500 kB ; l’optimisation doit être évaluée au jalon de performance, sur appareils représentatifs.

## Limites de la livraison

Les silhouettes, visages, mains, vêtements et poses restent des études de travail. Les deux figures partagent un visage et un rig de base ; les formes corporelles sont des morphs différents, pas un changement d’échelle globale. Les shorts épousent la surface du corps, sans simulation ni vêtement final. Le lissage ne remplace pas une sculpture finale ou la vérification des déformations en locomotion. Les corps ne reçoivent pas les ombres portées pour éviter les artefacts du rendu d’étude ; ils en projettent sur le sol.

Le directeur créatif a accepté cette première passe pour le moment (`looks good for now`, 2026-10-11, D-006). Les silhouettes actuelles servent de base provisoire ; la qualité finale des personnages reste à revoir. L’anatomie, les couleurs, le vêtement et la pose sont `unverified` culturellement ; ils ne représentent ni une tenue authentifiée, ni une règle sportive, ni une personne réelle. Toute représentation culturelle à fort impact requiert un conseiller sénégalais nommé. Les jalons déplacement, contact et performance restent ouverts. Le projet Unity `game/` est conservé séparément.

## WEB-002 — déplacement de travail

Choisir Déplacements, puis un gabarit. Cliquer la scène pour lui donner le focus : flèches, ZQSD et WASD commandent une marche relative à la caméra. Les boutons directionnels se maintiennent au pointeur ou au toucher. « Arrêter » relâche les commandes ; « Repartir du centre » réinitialise le personnage. Silhouettes retrouve la comparaison initiale. La caméra suit le lutteur et reste orientable/zoomable. La limite du sol est une zone de test neutre, sans règle sportive.

L’animation est procédurale et originale : accélération/freinage, orientation, pas alternés, jambes résolues avec deux segments, appuis conservés en coordonnées du monde et rotation des bras. Les pas tiennent compte de la portée des jambes, de la zone et des changements de direction ; le bassin est abaissé pour la portée. Les translations/quaternions de repos sont conservés pour restaurer exactement la vue initiale. Il ne s’agit pas de motion capture ni d’une démarche finale déjà approuvée.

Vérifications WEB-002 : build/typecheck, 11 groupes de simulation sur le GLB/controller réellement utilisés, 4 groupes de contrôles de l’état d’entrée et 10 contrôles dans le navigateur intégré, avec captures larges et à 390 px. Les contrôles de simulation incluent les deux corps, changements de direction/retournements, appuis réels, arrêt, limites, réinitialisations répétées et cohérence 30/60/120 Hz. Les deux pointeurs sont testés dans le véritable état d’entrée ; aucun essai physique à deux doigts sur Android n’est revendiqué. Les handlers blur/hidden/cancel sont examinés dans le source. Les erreurs modèle/WebGL de WEB-001 n’ont pas été réinjectées pour WEB-002. Voir `evidence/WEB-002-browser.json`, `locomotion-simulation.json`, `motion-input.json` et `build-WEB-002.log`.

Reproduire les contrôles de simulation avec esbuild, déjà fourni transitivement par Vite :

```sh
node_modules/.bin/esbuild src/locomotion.ts --bundle --format=esm --platform=node --outfile=/private/tmp/rda-locomotion-checked.mjs
node scripts/check-locomotion.mjs /private/tmp/rda-locomotion-checked.mjs
node_modules/.bin/esbuild src/motion-input.ts --bundle --format=esm --platform=node --outfile=/private/tmp/rda-input-checked.mjs
node scripts/check-motion-input.mjs /private/tmp/rda-input-checked.mjs
```

La simulation ne mesure pas les FPS d’un appareil. Le ressenti humain de la marche, les déformations vestimentaires dans toutes les poses et la performance Android restent à vérifier. La marche peut raccourcir/ralentir lors d’un virage pour conserver la portée des appuis. Les mains/visages restent provisoires. La référence IMG_1455.PNG fournie par le directeur créatif (D-008) fixe un objectif supérieur de visage, cheveux, anatomie et matières ; les personnages actuels ne sont pas présentés comme atteignant cette finition.

### WEB-003 character finish

Use **Examiner le visage** in Silhouettes to inspect each face from the existing front/profile/back buttons; press it again for the full body. Generic original close-crop scalp, per-physique seated irises/pupils and restrained mesh-local surface detail improve the provisional study. Body morphs and procedural walking are retained. Source topology, fine brow/lash strands, hands and facial finish still differ from D-008's reference; final equivalence and physical-device performance are unverified.

For reproducible same-camera comparisons, `?qa=1&finish=baseline` restores the WEB-001 materials/eyes and omits new hair; `?qa=1` uses the refined candidate. This diagnostic is local-only. Build with `npm run build`. Numerical integration: bundle `src/character-finish.ts` and `src/locomotion.ts` to temporary `.mjs` files with the existing esbuild, then `node scripts/check-finish.mjs <finish-bundle> <locomotion-bundle>`.

### WEB-004 face realism

The face now uses reviewed CC0 photographic skin detail for lips, eyelids and surface variation, plus native eye/brow/lash atlas maps and restrained eye gloss. Runtime UV seam reconstruction preserves the exact existing body/physique/rig geometry; comparison, clay/wire views and walking remain available. Source images/models are unchanged. New resources add roughly 4 MB before transfer compression; physical-device memory/performance remain untested.

Use **Examiner le visage** and Face / ¾ / Profil. `?face=previous` restores WEB-003; `?finish=baseline` restores WEB-001. Face maps are optional: missing/invalid resources or the six-second timeout preserve the older finish with a note. Failure/timeout paths are source-reviewed and invalid remapping is unit-checked; full browser failure injection was not performed.

Regenerate the separate UV sidecar locally with `python3 scripts/prepare-face-atlas.py` (expects the reviewed original source path recorded in that script). It verifies exact topology/order and both GLB hashes without overwriting them. For numeric integration, bundle `src/face-material.ts` and `src/locomotion.ts` to temporary ESM files with the existing esbuild, then run `node scripts/check-face-atlas.mjs <face-bundle> <locomotion-bundle>`. Five groups check every duplicated attribute/morph/triangle, rejection of invalid remaps, identical face anchors/turn-stop trajectories for both bodies and shader-cache distinction.

### WEB-006 — contact de travail

Meshy est reporté à la demande du directeur créatif (D-011). Ouvrir `http://127.0.0.1:5178/?mode=contact`, ou choisir **Contacts**. Approcher le partenaire immobile avec les commandes de marche ; maintenir **Espace** dans la scène ou **Maintenir le contact** à moins de 1,0 m. Le cercle au sol devient vert, l'état indique « Contact maintenu » et le déplacement s'arrête. Relâcher puis relâcher les directions avant de repartir. Changer de gabarit échange les rôles ; **Replacer les deux** réinitialise l'exercice. Après une réinitialisation ou un changement de mode, un nouvel appui est nécessaire.

Le contact est une interaction de distance et d'état, représentée par le cercle au sol, sans animation de prise ni simulation physique. Le partenaire ne réagit pas. Séparation minimale des racines : 0,72 m ; rupture du contact au-delà de 1,25 m. Ces valeurs sont des réglages de prototype, culturellement `unverified`, pas des règles de Laamb. Aucun travail supplémentaire sur l'avatar, nouveau service/package ou changement Unity.

Contrôles reproductibles avec les dépendances existantes :

```sh
node_modules/.bin/esbuild src/contact-practice.ts --bundle --platform=node --format=esm --outfile=/private/tmp/rda-contact-checked.mjs
node scripts/check-contact.mjs /private/tmp/rda-contact-checked.mjs
```

`evidence/WEB-006-contact.json` enregistre les contrôles du vrai GLB/controller : propriétaires d'entrée indépendants, placement/appuis, approche maintenue, suspension, hystérésis, relâchement/reprise neutre, annulation/reset/restauration et collision/appuis des deux gabarits à 30/60/120 Hz. Quinze groupes de contact passent, dont six régressions de virages tangents alternés après correction du conflit collision/appui. En cas de conflit, le déplacement proposé est rejeté avant de planifier les pieds ; un virage peut donc ralentir ou s’arrêter près du partenaire. Les onze groupes de marche existants restent passants. Build/typecheck passants avec l'avertissement de taille du bundle déjà connu.

La validation visuelle WEB-006 reste à faire : cette session ne dispose d'aucun navigateur CUA connecté ; l'aperçu intégré est indisponible et Chrome n'expose pas le contenu de la page/capture exploitable. Réponse HTTP 200 vérifiée, mais aucun test UI ni capture du nouveau rendu n'est revendiqué. Ressenti humain, toucher physique, performance mobile et authenticité culturelle restent non vérifiés.

### WEB-007 — accessoires portés

Le directeur créatif accepte le prototype pour le moment (D-012) et demande les accessoires gris-gris (D-013). Première proposition originale : deux brassards à pochettes et une ceinture à trois pochettes, avec rabats, coutures et cordons. **Aux bras** et **À la taille** retirent/remettent chaque ensemble sur les deux figures, en Silhouettes, Déplacements ou Contacts. Les interrupteurs au pointeur conservent les commandes de scène maintenues ; le clavier peut les atteindre et les activer avec Espace.

Les bandes/cordons sont ajustés aux sections réelles de chaque morph et partagent le skinning existant ; les pochettes sont ancrées aux bras/Hips en coordonnées locales.5,704 triangles ajoutés par figure. Pas de simulation de tissu, d'inscription, de contenu religieux, d'effet ou de rituel. Formes/placement provisoires, culturellement `unverified` (CULT-ASSET-005) ; avis sénégalais nommé nécessaire pour une utilisation culturelle finale.

Vérification : build/typecheck, quatre groupes numériques sur géométrie/rig réels et onze groupes UI natifs CUA, dont changement d'équipement pendant W/Espace maintenus, marche des deux figures, pose anatomique, vues face/profil/dos, comparaison, argile/maillage et largeur390px. Aucun nouvel avertissement/erreur renderer/texture dans les logs du candidat final inspectés. Revue indépendante du source/captures et relance build/numérique ; elle n'a pas rejoué l'UI. Les captures/relevés sont dans `evidence/WEB-007-*` ; l'indisponibilité navigateur de WEB-006 reste un constat historique, cette session dispose d'un aperçu CUA fonctionnel.

Pour reproduire les contrôles sans navigateur :

```sh
node_modules/.bin/esbuild src/accessories.ts --bundle --platform=node --format=esm --outfile=/private/tmp/rda-accessories-check.mjs
node_modules/.bin/esbuild src/locomotion.ts --bundle --platform=node --format=esm --outfile=/private/tmp/rda-accessory-motion-check.mjs
node scripts/check-accessories.mjs /private/tmp/rda-accessories-check.mjs /private/tmp/rda-accessory-motion-check.mjs
```

Clearance minimale des vertices testés :1,45mm /2,31mm, avec échantillonnage indépendant des centres de triangles également extérieur au corps. Cela ne garantit pas toutes les poses/frames, les contacts avec le short ou les collisions entre accessoires. Marche identique pendant180frames ;115 fichiers Unity/assets protégés inchangés. Toucher physique, performance mobile, finition artistique et authenticité culturelle restent à revoir.

### WEB-008 — cordons croisés sur le torse

**Sur la poitrine** retire/remet le X devant et derrière, les attaches sur les épaules, le cordon bas et la pochette centrale. Le cou est dégagé après la correction demandée le 23 octobre. Les trois ensembles restent indépendants, avec les mêmes commandes en marche/contact et au clavier. Géométrie originale ajustée aux deux morphs, sans nouvelle texture/photo ou service ; total accessoires 11 304 triangles et six pochettes par figure.

Build/typecheck et six groupes numériques passent : source/rig préservés, marche identique pendant180frames, visibilité indépendante, vertices extérieurs au corps sur les poses échantillonnées, séparation des X et de la pochette. Cinq groupes CUA supplémentaires vérifient les deux figures/vues/pose anatomique, la marche, le changement poitrine avec W et Espace maintenus, et le clavier/largeur390px. Captures finales : `evidence/WEB-008-no-neck-*`; les captures WEB-008 antérieures avec collier sont historiques. Logs candidat inspectés sans erreur/avertissement. Vérifications et limites détaillées dans `project/reviews/WEB-008.md` à la racine.

La conception exacte reste provisoire, culturellement `unverified` (CULT-ASSET-006), sans simulation de tissu ni garantie de collision continue. Performance sur téléphone et avis culturel humain restent à vérifier.
