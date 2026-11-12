# Façades modernes — le vocabulaire de la maison Jàmm dans les autres quartiers

Suite de la maison de Cité Jàmm (`docs/CITE_JAMM_MAISON.md`) : le même langage (enduit sable, balcons à garde-corps vitré, porte noire sous auvent) sur
les bâtiments ordinaires, et de la profondeur cuite dans les couleurs de sommet pour mieux lire les surfaces. Rien n'est ajouté au budget de draw calls.

## Ce qui change
- **Profondeur** (`src/world/builder.ts`, bloc `depth`) : l'ombre de contact au pied des murs, troncs et poteaux et le dessous plus sombre des balcons, auvents
  et cimes — déjà celle de Mermoz — vaut désormais pour tous les quartiers (un peu plus douce hors Mermoz). Couleurs de sommet seulement : 0 draw call, 0 triangle.
- **Balcon vitré** (`src/world/modernFront.ts`, `glassBalcony`) : dalle claire, garde-corps vitré pâle, main courante en fer fin, console dessous (pas en Low).
  Remplace les rambardes filaires et les barreaux : Sacré-Cœur et Mermoz (villas, blocs, Les Filaos), blocs étudiants de la Corniche, immeubles du Plateau
  (un étage sur deux, façade sur rue), terrasse des villas de l'Almadies.
- **Entrée** (`entrance`) : porte noire, petit auvent rouge tuile, marche bleue — villas et blocs de Mermoz, blocs de la Corniche, villas de l'Almadies.
- **Enduit sable** : palette de l'Almadies (qui était blanc pur) passée au sable/ocre/crème.
- Pikine garde ses maisons auto-construites (fers d'attente, parpaings) : elle reçoit seulement la profondeur.

## Budget
Tout va dans le lot `plain` du quartier (le verre du garde-corps est une couleur pâle, pas un second matériau) : **le nombre de maillages (draw calls
statiques) est identique avant/après dans les cinq quartiers, High et Low** (`static-*.json`). Aucun tirage dans le flux aléatoire du générateur :
aucune disposition ne bouge (la fixture de l'Almadies est régénérée, et identique avec la parcelle de la villa désactivée).

| Quartier | Maillages | Triangles (statique) | Écart |
| --- | --- | --- | --- |
| plateau | 50 → 50 | 68 224 → 70 424 | +3.2 % |
| plateau-lite | 50 → 50 | 54 824 → 56 384 | +2.8 % |
| corniche | 35 → 35 | 76 722 → 73 536 | -4.2 % |
| corniche-lite | 35 → 35 | 63 032 → 58 536 | -7.1 % |
| almadies | 77 → 77 | 117 622 → 117 688 | +0.1 % |
| almadies-lite | 77 → 77 | 85 864 → 85 270 | -0.7 % |
| pikine | 68 → 68 | 134 143 → 134 143 | +0.0 % |
| pikine-lite | 68 → 68 | 106 350 → 106 350 | +0.0 % |
| mermoz | 23 → 23 | 118 237 → 124 789 | +5.5 % |
| mermoz-lite | 23 → 23 | 70 887 → 74 817 | +5.5 % |

Mesure navigateur (SwiftShader, mêmes caméras, `perf-*`) : triangles de −6,6 % à +4,5 %, draw calls dans le bruit de la circulation et des passants.
Non testé sur iPhone réel.

## Preuves
`docs/proof/modern-fronts/` : Corniche avant/après, Corniche · Mermoz · Almadies, Plateau · Almadies.
