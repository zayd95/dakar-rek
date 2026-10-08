# DKAG-017 — chute unique et maintien final

Statut : code-ready, revue indépendante et CI au SHA publié attendues. Auteur : animation_resume_1655; reviewer assigné : qa_animation_1707. Date : 8 octobre 2026. Base : `0af76c38b152df885c0c27352aa43ac320aa71af`. Brief de contrôle : `e3cdf9ad3c697a51d50bca3766f6ea51364befda`; réservation : `d0cb9128d3333efd0face85255aedcc6eef88775`. Checkout isolé `animation-candidate`.

## Correction

Dans Humanoid.play, seul Fall_Back utilise LoopOnce avec clampWhenFinished=true. Les autres clips gardent LoopRepeat/Infinity et clamp=false. reset() reste exécuté avant la configuration : après Stance, une seconde chute repart et termine correctement. Aucun changement de phase, résultat, règle, input, sauvegarde, réseau, GLB, rig, package ou workflow. L'auteur ne valide pas sa propre candidate.

## Vérifications réellement exécutées

- `npm ci --offline --ignore-scripts` : dépendances lock installées sans réseau, 96 packages; package/lock inchangés.
- `npm test` : **37/37**, six fichiers, dont cinq nouveaux tests `humanoid-animation.test.ts` avec vrai THREE.AnimationMixer. Fixture loader synthétique, sans DOM ni asset payé : pose intermédiaire, pose finale stable pendant 5 secondes, retour Stance→Fall_Back, et répétition maintenue pour Stance/Grab/Celebrate.
- `npm run build` : **PASS**, tsc client et Vite; 43 modules transformés.
- `npm run typecheck:server` : **PASS**.
- `npm run dev -- --host 127.0.0.1 --port 5179` et `node scripts/check-fall-animation.mjs http://127.0.0.1:5179/` dans le même shell : **PASS**, Chromium 1194, WebGL SwiftShader. Les requêtes hors origine locale et WebSockets sont bloqués.

Le check navigateur charge réellement `/src/actors/humanoid.ts`, `/src/lamb/duel.ts` et le GLB existant via Vite. Il instancie le vrai duel et fixe uniquement l'effort des deux combattants en fin de clinch pour produire indépendamment victoire joueur et victoire adversaire; update calcule les résultats et conduit les phases. Ce n'est pas une victoire obtenue par les commandes UI, ni le test d'une version déployée/compilée. Un renderer THREE dessine les modèles sur un sol de fixture et utilise la caméra renvoyée par le duel (17 draw calls par issue).

Pour les deux issues, à 0,7 / 1,3 / 2,5 / 4,3 s : root.position est exactement `[0,-0.8500000238418579,-0.8999999761581421]`, action.time=`0.6000000238418579`, paused=true. Les deux derniers échantillons sont en phase result. Le vainqueur conserve Celebrate/LoopRepeat. Cela prouve le maintien numérique de la pose avec l'export réel au-delà du raccord auparavant défectueux.

Incident d'exécution : le premier serveur lancé dans une commande séparée s'est terminé avant le check (curl et Chromium ont confirmé connection refused). Le premier import direct THREE a été remplacé par le module optimisé Vite; un second essai restait bloqué par le serveur absent. Le check a ensuite réussi en lançant serveur et navigateur dans la même commande avec attente de disponibilité bornée. Aucune assertion supprimée ou affaiblie, aucun correctif du comportement requis après échec des tests mixer.

## Limites et handoff

Playback réellement rendu en navigateur, mais aucune capture inspectée visuellement : clipping, articulations, contact au sol, authenticité culturelle, rendu téléphone et performances ne sont pas certifiés. L'asset demeure TEMP/unverified. Le fallback de chargement relevé dans DKAG-012 reste hors périmètre et inchangé. Aucun achat, génération, merge, déploiement ou mutation de ref par l'auteur.

Fichiers remis figés : `src/actors/humanoid.ts`, `tests/humanoid-animation.test.ts`, `scripts/check-fall-animation.mjs`, le présent rapport. Prochain propriétaire : coordinateur pour commit CAS/PR brouillon, puis QA distincte pour reproduire les contrôles et lire les CI au SHA exact. Runner navigateur : lancer Vite et le script dans une seule session shell sur un port local libre; aucune infrastructure ou modification de workflow requise. Plus petite action : publier les quatre blobs et transmettre le SHA à QA.
