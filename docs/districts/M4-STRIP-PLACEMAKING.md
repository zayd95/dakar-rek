# M4 · Almadies / Ngor — the strip as a real place (placemaking pass)

**Status: Gate A (engineering) only. No iPhone has run this.** Written after the owner's playtest of PR #77: « the terrace of Ngor and the restaurants around still look like residential homes, the same building architecture, old looking. Picture a rooftop restaurant in Dakar, a nightclub alley; improve the building architecture, give identity to the structures and the street; create parkings. It should feel like real places. »

The criticism was right: #77 moved the venues out of villa compounds but built them from the same box with the same window grid, shutters and awning. This pass replaces that with six different buildings, a street, two car parks and an alley. Code: [`src/world/hospitalityStrip.ts`](../../src/world/hospitalityStrip.ts) (one module, called from the generator's `hospitality` case). Nothing else of the generator changed except two additions listed below.

## What the online research gave, and what it did not
Searches (Almadies / Ngor rooftop restaurants, nightlife, beach restaurants) returned travel guides and listings, **no architecture, plans or photographs**. What they did give is the *kinds of places* that make the strip, which the design follows:

| Found | Used for |
|---|---|
| Rooftop bars and sea-view terraces on the Almadies corniche (Jet Café Beach, 3 Flamingos, Le Carré); « Bayékou », an open-sided roof terrace | the Terrasse de Ngor: a roof terrace you can see from the street (pergola, umbrellas, string lights, a lit sign) |
| Le Patio « in the centre of the Ngor strip, with a tree-filled patio » | Le Patio de Ngor: a courtyard house behind a wall and an arched gate, bougainvillea |
| Open-air pavilions and sand-level seafood places (La Mer à Table, Noflaye Beach, Black and White Beach) | Chez Binta: a thatched pavilion over a grill counter |
| Ngor/Almadies as « calm by day, lively at night », a « club and restaurant strip », clubs that start late, live-music venues | a night street: neon, festoons, velvet ropes, a lit alley to La Vague |
| The lighthouse (Phare des Mamelles) next door | Café du Phare: a red-and-white tower on the café |
| Dakar street cooking (grill drums, counters, market halls) | Le Comptoir de Ngor: a market hall with a saw-tooth roof and open counters |

Everything beyond that (shapes, colours, proportions) is **my reading of those venue types, not a copy of a building**; the names are invented. The sources: [au-senegal.com — Jet Café Beach](https://au-senegal.com/jet-cafe-beach,6757.html), [3 Flamingos](https://au-senegal.com/3-flamingos,6760.html), [Chez Fatou (mapstr)](https://mapstr.com/place/uRv8PHRBD8g), [Dakar city guide](https://www.wingie.ae/en/dakar-city-guide/), [TripBase — Almadies](https://www.tripbase.com/destinations/dakar-extra/neighborhoods/almadies/), [Almadies (Wanderlog)](https://wanderlog.com/place/details/11179182/almadies), [coolest bars in Dakar (Culture Trip)](https://theculturetrip.com/africa/senegal/articles/the-9-coolest-bars-in-dakar-senegal).

## The six buildings (each its own massing, material and silhouette)
| Venue | What you see from the street |
|---|---|
| **Terrasse de Ngor** (the interactive one) | limestone ground floor behind a glass curtain wall, a timber portal and warm door; an upper floor **cantilevered 1.2 m** over the forecourt behind vertical timber slats; a **roof terrace** with glass balustrade, pergola, shade sail, umbrellas, a stair tower, string lights and a big cyan-outlined sign; a valet stand and the marked visitor bay |
| **Lounge 221** | a dark, wider upper floor on a black ground floor, magenta/cyan neon strips, a tall pink **vertical fin sign** above the roof, a DJ deck on the roof, brass stanchions, a red rope and a doorman |
| **Le Comptoir de Ngor** | a **saw-tooth roof** with glazed uprights, three open counters under rolled shutters, a painted green/yellow/red band, stools, crates, festoons |
| **Chez Binta** | a **thatched A-frame** on log posts over an open grill counter, a smoking grill drum, whitewashed kitchen behind with blue trim |
| **Café du Phare** | a red-and-white **lighthouse tower** (gallery, glass lamp room, red cap, a glow) on a glazed café with striped awnings and a roof deck |
| **Le Patio de Ngor** | an ochre courtyard house: a tall **arched gate** with a cream surround, a timber balcony, bougainvillea over the wall, a tiled roof behind |

## The street
- **Forecourts:** an ochre paved walk along the fronts, bollards along the kerb (the Terrasse's bay stays open), planters with palms between the buildings, lamp poles and festoons, café sets.
- **Two public car parks** behind the venues (« PARKING NGOR » behind block 1, « PARKING DU PATIO » behind block 0): asphalt, painted bays with **wheel stops**, an aisle, a **way in with a gantry sign, a booth and a raised barrier**, lamp poles, palms in planters, **parked cars** that are solid, and the venues' **backs** (service door, bin, air-conditioner, pipe). The Terrasse's own visitor bay in its forecourt is unchanged (door at (−30, −105.1), bay at (−30, −109.5)).
- **The alley to La Vague:** from the coast road to the gate, a timber boardwalk edged by cyan/pink light lines, two **neon arches**, a **rope queue**, a mural wall of colour blocks on its west edge, a painted **container bar** with a hatch and stools on its east edge, festoons across, a lit gantry « ALLÉE LA VAGUE · SOIRÉES ». The queue's walkers (src/crowd/clubPlan.ts) come from the west: the west edge is kept clear (a test caught the first layout putting the container in their way).

## Constraints kept
- **No random draws from the generator's stream** (a local stream feeds the parked cars), no change to other districts or the venue interiors; `Batch.slab` gained an optional `roll` (backwards compatible).
- Merged batches only (the same ones the strip already used); the only new draw calls are sign planes: six venue boards as before, plus a valet sign, the alley's gantry sign and the container's sign, and one gantry sign per car park.
- Colliders: venue footprints as before; added: bollards, planters, lamp poles, parked cars, booth, container, mural wall, the car park gantry posts. `STRIP_KEEP_CLEAR` tells the street dressing (billboards, stalls, parked traffic) to stay off the forecourts, car parks and the alley.
- The M4 journey, the Terrasse door and bay, La Vague's gate and taxi rank, the queue walkers: unchanged and re-run (see [`M4-EVIDENCE.md`](M4-EVIDENCE.md)).

## Not done / honest limits
- **No iPhone.** These are Chromium screenshots (SwiftShader). Whether it *feels* like Dakar is the owner's call; I had no photographs to check against.
- Shapes are boxes, cylinders and slabs in the game's own style: no new modelled assets, no Meshy/Blender.
- The venues are still not enterable except the Terrasse (the others are facades with a person or two outside).
- Cars park by driving in; there is no valet, no parking fee, no reversing assistance. The run drives into the lot and along the aisle (real touch); it does not park in a painted bay.
- Daylight and night were checked on desktop framing and one phone framing, not every camera.

## Results (Chromium, touch emulation, SwiftShader; logs in [`proof/m4/strip/`](proof/m4/strip/))
- **M4 journey** (real touch; park in the Terrasse bay → meal → Awa → La Vague → card → taxi home → later evening → reload): **40/40**, [`journey.log`](proof/m4/strip/journey.log). A run before the bay check was relaxed to the painted rectangle stopped the car 1.9 m past the bay's centre (still inside the paint): 39/40 on the old 1.2 m tolerance, the same tolerance #78 already uses.
- **Car park drive-in** (new, [`scripts/check-almadies-carpark.mjs`](../../scripts/check-almadies-carpark.mjs), real touch): from the south road, through the way in, to the aisle between the rows, no solid in the way: pass, [`carpark.log`](proof/m4/strip/carpark.log), [capture](proof/m4/strip/carpark-drive-in.jpg).
- **Rooftop check** (Plateau, Corniche, Almadies): passes, [`rooftop.log`](proof/m4/strip/rooftop.log). **City-life** (desktop and phone captures, the bay free of colliders): passes, [`city-life.log`](proof/m4/strip/city-life.log).
- **Unit tests:** `tsc` clean; full suite 2285 passed, 2 skipped (188 files); new `tests/hospitalityStrip.test.ts` (6 venues, door and bay clear, a way into each car park and an aisle, the alley clear for the queue); `tests/clubCrowd.test.ts` (the taxi-rank-to-queue walk) caught the first alley layout and passes on the final one.
- **Performance** (`scripts/m4-views.mjs`, street view at the Terrasse door; budget 300 draw calls): low **76 calls / 93 722 triangles** (before this pass, PR #77: 77 / 80 648), medium **77 / 122 900** (79 / 109 336). About **+13 000 triangles** in this view (palms, parked cars, the lighthouse, festoon lamps, planters); draw calls unchanged. Headless counts, not frame times on a phone: **the iPhone may feel the extra triangles on the medium setting; that is for the owner's playtest.**
