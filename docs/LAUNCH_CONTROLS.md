# Corrections de lancement — branche Codex

Cette livraison reste sur `codex/launch-controls`, basée sur `codex/multiplayer-launch`. Elle ne modifie ni `main`, ni `wip/visual-pass`, ni les modèles, textures ou animations de Claude.

## Problèmes reproduits et corrigés

- **Qualité depuis un intérieur** : changer Low/Medium reconstruisait le quartier avec les coordonnées de la pièce, puis perdait l’état intérieur. Le joueur restait vers x = 1040 et la sortie ne fonctionnait plus. La reconstruction conserve maintenant la porte dans la rue et restaure la pièce et la position du joueur.
- **Commande coincée après une perte de focus** : un joystick maintenu continuait à déplacer le personnage. Les commandes, les identifiants des doigts et le glissement de caméra sont remis à zéro à la perte de focus, au masquage de la page et à l’ouverture d’un menu. Un nouveau toucher fonctionne au retour.
- **Ancienne sauvegarde hors de la carte** : une position hors des limites du quartier revient au point de départ de ce quartier. L’argent, les besoins, les relations et les autres données de la partie sont conservés.
- **Petit écran** : à 320 pixels, le bouton multijoueur recouvrait le titre du quartier. Sa position suit maintenant la hauteur réelle du titre, y compris après rotation.

## Vérification

```bash
npm ci
npx playwright install chromium
npm test
npm run typecheck:server
npm run check:launch
```

`check:launch` démarre le runtime Workers local et vérifie les invitations, les changements de qualité dans le Maïga et la maison, le joystick et son retour après perte de focus, le profil, le petit écran, le défilement natif tactile en paysage et la récupération d’une sauvegarde hors de la carte avec 7 777 F conservés. Il lance ensuite la suite de gameplay sur ordinateur et viewport téléphone : quatre quartiers jour/nuit, déplacement, collisions, interactions, intérieurs, voyage, sauvegarde/rechargement, choix de dialogue et scènes de làmb.

Résultats et captures : `shots/launch-controls/` et `shots/launch-gameplay/`. Le workflow de vérification conserve ces captures en artifacts. Les fichiers de résultats de cette livraison sont également dans `docs/checks/launch-controls/`.

Le script de captures utilise maintenant le Chromium installé par Playwright, sans chemin Linux fixé. Le seul 404 toléré par la suite est celui du modèle optionnel `car_rapide.glb`, absent tant que son export Blender n’est pas livré ; la voiture procédurale reste utilisée. Les erreurs de page et les autres erreurs de ressources restent des échecs.

Ces vérifications utilisent Chromium et SwiftShader. Elles ne constituent pas des mesures de performances sur téléphone ni une validation culturelle des gestes provisoires.
