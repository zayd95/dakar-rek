# Map and navigation: release audit

Package `wp/map`. The owner's words: « make sure the map works fine and all hubs stand apart ». What was run, what was wrong, what was changed, what is left.

## How it was checked

A headless phone page (Chromium + SwiftShader, 390 × 844, touch, the basemap blocked as it is in this sandbox, quality `low`) on a production build, before the changes and after them, with the same script. In each of the five districts (`pikine`, `plateau`, `corniche`, `almadies`, `mermoz`):

* the places the maps list against `__dakar.interactables()` and the place registry (position, kind, inside a building or not, outside the district's plan or not);
* « Quartier »: opens on the player (`fullMapAt(pos)` against the canvas), a one-finger drag, a two-finger pinch (real touch events through CDP), `+ − ◎`, a tap on a place, « Marquer », then the goal line, the minimap's dotted route (each leg tested against the buildings' footprints) and `nav.to(<another district>)`;
* « Ville »: the player's marker against the position recomputed from `__dakar.pos()` and the district's anchor, the five names and rectangles (in view, overlapping or not), the lines drawn against the road graph, drag, pinch, the buttons, a tap near a place, the pin of the marked place, one live WebGL context while open and none after;
* the page's scroll before and after every gesture; every control's size.

Then: a district change with the map open, the player out on a road between two districts (minimap, « Quartier », « Ville », directions to the next district), « Marquer » after leaving « Ville » and coming back, a landscape phone (844 × 390), and `scripts/check-geomap.mjs`. Not driven: a vehicle with the real controls (the directions were read through `nav.info()`, which computes the same thing on foot, as `scripts/check-nav-flicker.mjs` does); the online basemap (blocked here; the fixture style of `check-geomap` stands in for it).

## What was wrong (each seen in the run before the changes)

| # | Defect | Evidence (before) |
|---|---|---|
| 1 | **The city view did not show the hubs apart.** It opened on one district at zoom 12.4 (the other four out of view); zoomed out, 28 pairs of names overlapped a district's name: the quarters of the offline layer under the districts (« Plateau × Plateau », « Almadies × Ngor »…), the planned districts over the playable ones (« Mermoz × Ouakam »), the player's arrow under them, the 17 px rectangles hidden. | `02-ville-avant.png` |
| 2 | **Mermoz's road ran across two districts.** On the map the Corniche → Mermoz road crossed Mermoz's whole rectangle to reach its far (west) edge (438 of its 1 389 game metres drawn inside it) and cut the Corniche's corner on the way out (228 m). | unit probe, now `tests/cityMap.test.ts` |
| 3 | **A way of the game was missing.** The Almadies ↔ Corniche border street (an edge of the road graph, `src/transport/hubLink.ts`) was not drawn; a trip through it was a straight blue line from centre to centre. | 4 lines for 5 edges |
| 4 | **Guidance led backwards on a road.** Heading for another district, the point steered for stayed the way out of the district just left until the districts swapped at mid-road: the minimap's route and arrow pointed behind the player (« ↓ 248 m ») while the directions said « Tout droit sur la route ». | probe, Pikine → Plateau and Corniche → Mermoz |
| 5 | **Out on a road the district maps were empty.** The minimap was an arrow on a blank disc; « Quartier » opened with the player 270 px off the canvas; the dotted route cut straight across the ground to the nearest street. | `corridor` section of the run |
| 6 | **« Marquer » did nothing on the city map after a tab round trip.** The card kept the listeners of the first visit: the marker was set, then cleared. | set on the first visit, `null` on the second |
| 7 | **A district loaded under the open map left the old one on screen** (plan, strip, filters; the player off it). The phone stops the player, so this takes a load from outside the player's hands (a rebuild after a quality change, the debug hook used here); cheap to make right. | Pikine's plan in Mermoz |
| 8 | **Places missing or doubled.** Chez Binta, Le Comptoir de Ngor, Café du Phare, Lounge 221, the Plage de Ngor and every bus stop (16 in four districts) were on no map: the maps listed the hub's interactables and the dealers only. The Mermoz F3 and the Almadies villa had two icons each. La Vague was filed under « Arène ». | places listed, before → after: Pikine 30 → 34, Plateau 18 → 22, Corniche 13 → 18, Almadies 20 → 28, Mermoz 8 → 7 |
| 9 | **Touch.** The city map had no zoom buttons; its place dots are 11 px and its names 20 px high; in landscape the map's buttons are 34 px and its tabs 28 px. Drag and pinch worked on both maps and never scrolled the page. | sizes in the run |
| 10 | Smaller: the city map's arrow showed the camera's heading, not the player's; « ≈ km en vrai » was 9 × the game length for every road (two are condensed otherwise: Corniche ↔ Plateau said 15 km, its line on the map is 2.1 km long); the offline notice stayed over the top of the map for good; `scripts/check-geomap.mjs` still expected 4 districts, 3 roads and 4 planned districts; `tests/navRules.test.ts` and `docs/map/NETWORK.md` still knew four districts. | |

What was right and is unchanged: the five rectangles never overlapped (the nearest two are 1.3 km apart) and each lies where the real quarter does; every listed place is at its interactable's position, none inside a building, none off the plan; the player's marker is exact on both maps in the five districts; the dotted route follows the streets (4 to 6 legs, no building crossed in the five routes tested); MapLibre is loaded only for « Ville » and released on leaving it.

## What was changed

1. **City view** (`src/ui/geoMap.ts`, `src/geo/anchors.ts`): opens on the whole city, fitted to the five rectangles; a district's name stands on the top edge of its rectangle; names are drawn by rank and never over one another (`declutter`); a quarter that is already a district is not named twice; `⌂` returns to that view, `◎` goes to the player, `+ −` added. → `01-ville-apres.png`
2. **Ways** : the map draws `mapLinks()`, one line per edge of the road graph (the four roads and the border street, drawn as the coast road past the Mamelles). Mermoz's road now leaves the Corniche by its east edge, goes round and enters Mermoz by its west edge, as in the game; Mermoz's anchor moved 480 m east so that edge is the VDN. Map data only: no road of the game moved. `docs/map/PROVENANCE.md` §3 says what is hand-placed.
3. **Guidance** (`src/game/navigation.ts`, `navRules.ts`): on a road toward another district the point steered for is the end of the road ahead; the roads are part of the network a route is found on when either end is out on one (`roadEdges`), so the dotted line runs along the road.
4. **District maps** (`src/ui/minimap.ts`, `minimapDraw.ts`, `fullmap.ts`): the roads that leave the district are drawn past its streets; the view reaches the player and stays on them until the map is touched; names are drawn wherever there is room (they were hidden until zoomed in close); the screen is drawn again when the district changes under it; listeners end with their mount. → `03` to `07-quartier-*.png`
5. **Places** (`src/ui/minimapMath.ts`): the registry's street places are listed (stops, restaurants, cafés, bar, beach, dealers), one place under one name is one icon, « Sorties » replaces « Arène » and holds the arène, the écurie, La Vague, Le Patio, the roof terraces and the beach. No new filter, no new kind.
6. **Touch**: 44 px to touch around every name, road marker and (landscape) small control; a tap within 26 px of a place on the city map picks it; in landscape the whole-city view keeps less room clear, so the five names still fit (the Corniche's gave way to the Plateau's on the first try).
7. **Checks**: `tests/cityMap.test.ts` (new, 17 tests), `tests/navRules.test.ts` (+4, and the trips over all five districts), `tests/minimap.test.ts` (+3), `scripts/check-geomap.mjs` brought up to date.

## After

The same script on the final build, all five districts, then the district change and the road: **0 defects, 89 checks passed, no page error** (before: 10 defects recorded by the script as it then was, plus those found by the separate probes of rows 2, 4 and 6).

| | Before | After |
|---|---|---|
| City view when it opens | 1 district in view (2 from the Corniche and Mermoz), zoom 12.4 | the 5 districts in view, each named, zoom 10.49 (portrait), 10.17 (landscape) |
| Names over a district's name, whole city | 28 pairs | 0 (7 lesser names give way: 2 road markers, Ouakam, Parcelles Assainies, Médina, HLM · Grand Dakar, the Monument; they show as the map is zoomed in) |
| Ways drawn / ways of the game | 4 / 5 | 5 / 5, none across a district |
| Places listed (Pikine, Plateau, Corniche, Almadies, Mermoz) | 30, 18, 13, 20, 8 | 34, 22, 18, 28, 7 |
| Player's marker against the game's position, both maps | exact in the 5 districts | exact in the 5 districts |
| Route to a marked place (5 tested) | along the streets, no building crossed | the same: 76, 99, 101, 158 and 200 m in 4 to 6 legs |
| On a road, heading for the next district | route and arrow lead back to the district left | 78 points ahead, all on the road, 1 217 m to its end |
| On a road, « Quartier » | player 270 px off the canvas | player at the centre, the road drawn |
| « Marquer » on the city map after a tab round trip | nothing set | set |
| A district loaded under the open map | old plan, old strip, player off it | new plan, strip and filters, player at the centre |
| Controls under 44 px to touch | 12 on the city map (names 20 px, markers 20 px); 34 px buttons and 28 px tabs in landscape | none, portrait and landscape |
| Drag, pinch, buttons; page scroll under the map | work; never scrolls | work (and `+ −` on the city map); never scrolls |
| MapLibre contexts: while « Ville » is open / after | 1 / 0 | 1 / 0 |

`scripts/check-geomap.mjs` (offline and with a fixture basemap): 32 of 32. `npx tsc --noEmit`: clean. The whole unit suite, once, at the end: 248 files passed and 2 skipped, 3 679 tests passed and 4 skipped (the skips are not this package's).

## What remains

* **On foot the goal line is a compass**: an arrow and the distance as the crow flies (« ↑ Banque Teranga · 51 m »), by design; the walk along the streets is the dotted line on the minimap and the distance on the map's card (75 m for the same place). It never claims a street route, but the two figures differ. Changing it is in `src/main.ts`, outside this package.
* **The hotels** of the Almadies are buildings with no place of their own (nothing to interact with from the street): they are on the plan as buildings, not as named places. The Terrasse de Ngor on the hotel roof is listed.
* **Mermoz** has seven places because the district has seven; the map lists all of them.
* **The offline coast** (Natural Earth, a few dozen points) is coarse: a corner of the Almadies' and the Plateau's rectangles is over the water. With the online basemap the real coast shows.
* **A vehicle was not driven** with the touch controls in this audit, and the online basemap was not reachable from the sandbox.
* Places of other districts are not on the city map (their worlds are not loaded); a place marked in another district is pinned on its district.
