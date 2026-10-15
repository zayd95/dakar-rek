# Prototype du port de Dakar — Portwise (branche isolée)

Branche : `feature/portwise-dakar-spike`. Point de départ : `feature/tiak-moto` au commit `1f5ab885`.

## Décision d'architecture

Adapter le **rendu 3D Three.js** de Portwise, **ne pas** intégrer sa SPA React, ses simulations AIS ni ses tableaux de bord. Dakar Rek utilise directement Three.js et `GameModule` ; Portwise utilise React Three Fiber. Le prototype possède uniquement :
- une petite extension walkable à l'est du hub Plateau, avec quai et eau ;
- un porte-conteneurs stylisé, sa pile de conteneurs instanciés ;
- une grue portique dont le chariot et le spreader sont animés ;
- 50 conteneurs instanciés à terre ;
- deux camions animés sur une boucle fermée ;
- un point d'interaction libre « Port Autonome de Dakar ».

Il n'ajoute ni travail de docker, ni salaire, ni gestion de stockage, ni second moteur.
C'est une **maquette jouable de quartier**, pas encore une intégration validée du Port de Dakar réel.

## Activation réversible

Le module est enregistré mais **inactif** normalement. Activer dans une prévisualisation de la branche uniquement avec :

`?debug&hub=plateau&portPrototype=1&portVisit=1`

Le test `portVisit=1` fait apparaître le joueur devant les grues (x=166, z=37) sur le Plateau, exclusivement en prévisualisation. Sans `portVisit`, rejoindre le port à pied par la route est du Plateau : arche signalée « PORT AUTONOME DE DAKAR » autour de x=136, z=0. Sans `portPrototype`, le module ne crée aucun objet, ne change aucune collision, aucun sol, aucune limite et aucun argent.

Pour annuler l'essai, enlever `portPrototype=1` de l'URL. Le module n'est activable que sur `localhost` et les hôtes Cloudflare de prévisualisation ; jamais sur le domaine de production. Aucun état n'est écrit en sauvegarde par ce module. Ne fusionner ni dans `release` ni dans `wip/visual-pass` et ne pas modifier les réglages Cloudflare.

## Contrôles nécessaires avant toute fusion

1. `npm run build`, `npx vitest run tests/portwiseDakar.test.ts`, puis `node scripts/check-port-preview.mjs` pour les arrivées et captures navigateur téléphone/ordinateur.
2. Démarrer une prévisualisation **non-production** ; sur téléphone, Plateau normal sans le paramètre : scène inchangée.
3. Avec le paramètre : marcher depuis le bord du Plateau jusqu'au quai ; vérifier 1 navire, 1 grue, 2 camions, conteneurs, collisions de l'eau, retour au quartier.
4. Test de fermeture / changement de hub / retour au Plateau (pas de duplication d'objets ou de fuite mémoire).
5. Mesurer les budgets low/medium/high et vérifier la caméra, le joystick, la minimap et les trajets existants.
6. Validation physique sur Android abordable et iPhone, séparément des tests Chromium.

Limites délibérées : la forme et l'emplacement sont une approximation stylisée ; le plan urbain du Plateau n'a pas encore été revu par un level designer. Le navire et les camions ne sont pas interactifs ; les camions sont décoratifs et n'ont pas de collisions dynamiques. Les marchandises ne modifient aucun inventaire. Aucun test sur téléphone physique n'est revendiqué.

## Origine et licence

Inspiré/adapté des méthodes de construction procédurale de `Vessel.tsx`, `QuayCrane.tsx`, `Yard.tsx` et de la logique de déplacement cadencée de `Trucks.tsx` du projet [Portwise](https://github.com/alexngdev99/rork-seaport-logistics-3d), licence MIT, copyright (c) 2026 Portwise contributors.

MIT License

Copyright (c) 2026 Portwise contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Géographie (recherche, 15 oct.)

Le Port Autonome de Dakar longe la côte est du Plateau (baie de Hann) : zone sud avec môles I–III (marchandises, passagers, liaison Gorée), zone nord avec môles IV–VI/VIII et le terminal à conteneurs. La maquette garde donc la mer à l'est : navire accosté au quai (x≈200), portique et conteneurs sur le quai, jetée de fermeture au large, et une petite jetée sud avec embarcadère « Gorée » (seul accès à l'eau, le reste du quai est clos). Forme volontairement stylisée ; sources à confirmer sur portdakar.sn. `node scripts/check-port-walk.mjs` : marche route → arche → quai → embarcadère, collisions, budget (port seul ≈ 11 appels de rendu, ≈ 1,6 k triangles, mise à jour < 0,02 ms).

## Vie du port (données seulement, runner d'actions existant)

- **Mamadou (docker)**, près des piles : « Discuter » (social, moral, drapeau `met_docker`, répliques aléatoires ensuite) et « Aider à pousser une caisse » (+1 500 F, fatigue, refusé si énergie < 20, drapeau `helped_docker`).
- **Embarcadère Gorée**, au bout de la jetée sud : « Regarder vers Gorée » (moral, drapeau `seen_goree`), « Parler au passeur » (réplique différente après avoir regardé), « Prendre la chaloupe » affiché « bientôt disponible ».
- **Café Touba du Port**, à l'arche : 100 F.
- Gorée est visible au sud-est, dans la brume (silhouette légère : île, fort, maisons).
- `node scripts/check-port-life.mjs` joue ces actions dans le navigateur (téléphone).

## Chaloupe Dakar–Gorée (décor, sur l'horloge du jeu)

Bateau blanc à deux ponts (d'après la photo de la nouvelle chaloupe : toit débordant, canots sur le toit, radar, bandeau LED rouge). Cycle de 2 h entre 6 h et 20 h : file d'attente de 5 passagers sur la jetée, embarquement, départ vers Gorée, absence, retour, débarquement. Hors horaires, elle reste à quai sans passagers. Pas encore de traversée jouable : elle viendra avec l'île de Gorée. `node scripts/check-port-chaloupe.mjs` ; planning testé dans `tests/portwiseDakar.test.ts`.

## Formes réelles (passe « pas des boîtes »)

`src/game/portModels.ts` : coques (plan extrudé avec étrave pointue et tableau arrière arrondi), ponts arrondis à toit débordant, tubes (rambardes, treillis, haubans, roues), profils latéraux (cabines de camion, pignon du hangar) et conteneurs 20 pieds ondulés (6 × 2,6 × 2,4 m), le tout fusionné en un seul dessin par objet. Chaloupe (2 ponts, canots, radar, rambardes, passerelle), cargo (coque rouge/bleue, château de poupe à trois niveaux, cheminée, mât), portique treillis avec pylône et haubans, camions-remorques avec conteneur, hangar à toit à deux pans, bollards et mâts d'éclairage. Budget : ≈ 12 appels de rendu, ≈ 10 k triangles pour le port. Prises de vue de jour : `node scripts/shoot-port.mjs '[["nom",[camx,camy,camz],[cibx,ciby,cibz]]]'`.
