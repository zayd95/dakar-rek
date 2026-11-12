# Pikine Street DNA — round 3: a street that is lived in, and checked against the phone camera

Same branch (`feature/pikine-street-dna-p2-20261019`, local, not pushed, no preview build). Still one new game file
(`src/game/pikineDna.ts`) and its one line in `src/game/modules.ts`; the road topology, the builder, the colliders of other modules, vehicles,
showrooms, avatars, economy and saves are untouched. Pictures are iPhone-sized (390 × 844, @2×), medium quality; **left = round 2, right =
round 3**. The HUD weekday and the player's shirt change between runs (city clock, random default avatar): not part of the change.

## 1. The phone camera, audited first

The follow camera rides **5.1 m up, 10.5 m behind the player** (portrait), with a 66° vertical field of view. Anything hanging between about 4 and 6 m
over a road, or over an entrance the player walks through, is either in the lens or between the lens and the player. I had not measured that;
`scripts/check-pikine-camera.mjs` now does. A scripted walker (the real input and collision, the game paused and stepped, as in the walkthroughs)
walks the route; at every sample the page tests the slice's own triangles: four rays from the camera to the avatar (feet, waist, chest, head), three rays down
the way ahead, and the distance from the lens to the nearest piece of the slice.

**What it found in round 2** (`camera/before-fix-*.json`, one frame in `camera/before-fix-plaza-gateway-board-in-the-lens.png`):

| walk | frames | player hidden by the slice | piece inside 0.6 m of the lens | view down the street blocked | closest |
|---|---|---|---|---|---|
| the route | 635 | **23** | **8** | **26** | 0.14 m |
| the home street | 195 | 0 | **4** | 0 | 0.16 m |

The culprits: the **grand-place gateway's board** (3.9–5.1 m, at the camera's own height: the camera passed through it and the player vanished, 23 frames in all on the route),
the **market gate's beam and boards** (3.2–4.6 m), the **bunting across the roads** (4.7–6.2 m), the **blade signs** hung on poles and on the gare's portal
(4–5.3 m, over the roadway), and the **service wires** whose ends fell over the crossing road.

**What changed**
- The two gateways keep their identity and gain height: pylons 7 m, the span board at 5.95–7.15 m, above the lens at any distance. The camera can never be
  below a span board and see the player through it, and never inside one.
- Bunting over the roads hangs from 7.3 m and clears 6.3 m at its lowest flag; the wires cross at 7 m and above.
- Blades hang on the house side of a pole at 5.9 m (never over the roadway); the gare portal's blades moved to its yard side at 5.9 m, its pylons to 6.6 m.
- The wire drops go straight to the houses, never along the crossing road.
- A stricter lane check caught a **pole standing in the roadway of a crossing** (the avenue at z = 56): poles now keep 6.8 m from a crossing's centre.

**After** (`camera/after-fix-*.json`, on the final build):

| walk | frames | player hidden | inside 0.6 m of the lens | view blocked | closest |
|---|---|---|---|---|---|
| the route (market gate included) | 636 | 0 | 0 | 1 (the market gate's pylon and a pole in the way ahead as the player turns in; the player is fully visible: `camera/after-fix-market-gate-pylon.png`) | 1.04 m |
| the home street | 195 | 0 | 0 | 0 | 1.31 m |
| the avenue's side lanes (2.4 m off the centre line) | 407 | 0 | 0 | 0 | 1.08 m |

And a static rule in `check-pikine-dna.mjs`, so it cannot come back: **nothing of the slice between 0.4 and 4.6 m over any carriageway** (a car rapide with its
luggage is 3.8 m) and **nothing between 3.8 and 6.2 m within 5.6 m of a road's centre line** (the camera's band, lateral margin included).

## 2. Sidewalk and roadside life, without touching the road

Nothing is placed in the carriageway or the pedestrian lanes (5.05–5.95 m from the centre line); the new pieces stand on the pavement's back strip,
6.25–6.75 m out, are small and solid like the rest, and are refused on any collider, place, seat or crossing.

- **Roadside clusters** in the gaps between the wall units (and on the gare's block edge), seven kinds: *tontine* (three plastic chairs round a low table),
  *attaya* (brazier, kettles, a tray of glasses, two stools, a sack of charcoal), a *tray* of fruit on a stool, *sacks* of charcoal and grain, a plank *bench*
  with a bucket, a **washing line** between two stakes with five cloths, and the vendor's **parasol** (a tall coloured cone over a table of small goods, the silhouette
  that calls from the end of the street). On this seed: 12 clusters on the route.
- **Shopfronts as individual businesses.** Eight trades, each with its own palette, goods and forecourt:
  *Boutique Abdou* (sacks of rice, a strip of sachets across the door, a stool and a crate), *Couture Fatou* (a mannequin in wax print, cloths hung off the awning, a
  sewing machine), *Quincaillerie Ndiaye & Fils* (buckets, bags of cement, a ladder), *Télécentre* (a parasol over a table, two stools), *Cantine Mame* (a bench, the
  pots, a brazier), *Pharmacie Teranga* (a lit green cross on the roof edge, a bench), *Coiffure Pape* (a barber's chair in the doorway, a mirror that glows at night),
  *Cyber · Photocopie* (three lit screens). Each also draws one of three awnings (striped canvas, a plain tarpaulin, a tin visor) and keeps a chalkboard of prices.
- **Lit at night** by the same cell and pools as round 2 (lit windows, bulbs, warm pools); the pharmacy cross, the mirror and the screens glow.

Pictures: `life/shops-and-roadside-11.jpg` and `-20.jpg` (each shop and each cluster of the route, seen from the road in front of it), `details/`, `route/`.

## 3. The ground no longer repeats

The sand's own stripes repeat along every road. The roadway now carries **long soft drifts** (darker and lighter, one side of the centre line then the other),
**slanted lenses of blown sand** a few times per street, a **dark patch where something dripped**; the pavements get dust and swept strips, every shop and gate a
patch of trodden earth. All of it is **vertex-coloured blotches whose rim is the ground's own colour** (measured as rendered: its grain takes a few per cent off), so no
edge shows: no texture, no transparency, no extra draw call. Round 2's hard-edged discs are gone.

## 4. The budget went down

| | round 2 | round 3 |
|---|---|---|
| slice triangles, medium / Low | 12 982 / 4 182 | **10 771 / 3 910** |
| draw calls added | 2 (the slice and the night pools) | 2 |
| textures | atlas 1024 × 1280 + glow 512 × 640 | the same (nothing added; ~8.7 MB with mipmaps) |
| vertex data of the slice | ~1.7 MB | ~1.4 MB |
| slice off-and-on in the same frame, medium | +2 calls, +13.6 k tris | +0.9 calls, +10.7 k tris (+4.4 % of ~244 k) |
| slice off-and-on in the same frame, Low | +1.1 calls, +4.2 k tris | +1.7 calls, +4.4 k tris |
| frame time off-and-on (software GL, noise ±40 ms) | +12 ms / +10 ms | +18 ms / +7 ms: inside the noise |

Where the triangles went (medium): the overhead layer **5 350 → 2 140** (two strands per side instead of three, longer rods, no insulators, one service drop per pole),
the painted kerbs **940 → 538** (2 m stripes), the ground **1 328 → 1 230**; and the new life costs **1 556** (shops, forecourts) + **1 414** (roadside clusters). Low keeps the
shopfronts' own details and drops the forecourts, clusters, wires, bunting and kerbs.

## 5. Evidence

| | result |
|---|---|
| `check-pikine-dna.mjs` | all pass (`measure/check-pikine-dna.log`): one mesh, one material; 79 solid pieces on no other collider; none in the carriageway or the pavement lanes; the road clear overhead (below); the route and the home street clear for the 0.5 m body; rhythm; night pools; the same slice on every load; the 12 original places intact |
| `check-pikine-camera.mjs` | 0 frames with the player hidden, 0 with a piece inside 0.6 m of the lens, 1 of 636 with the view down the street partly blocked (above) |
| collision sweep of the route | 0 blocked, 0 by the slice |
| scripted walks (real input and collision) | see the table at the end of this file |

## 6. Left for your call

- The **1 frame** at the market gate is the gate's pylon and a pole standing in the way ahead as the player turns in; the player stays fully visible. Moving the pylons out would widen the gate to 16 m, so I left it.
- The **parasol and awnings** hang at 2.1–2.5 m over the pavement's back strip: above every head and every vehicle, below the camera.
- **Next**, only on your word.

## 7. Walks

`walkthrough/avenue-route-round3.mp4` and `home-street-round3.mp4` (a scripted walker on the real input and collision, one frame per 0.37 m).

| walk | completed | metres / game time | stalls | errors |
|---|---|---|---|---|
| the avenue route (room → avenue → gare → grand-place → market court; the last legs run 3 m off the centre line, clear of a road-event cone that stands on it today) | yes | 343 m / 169.6 s | 0 | 0 |
| the home street (east of the room → the avenue → past the bank) | yes | 104 m / 52 s | 0 | 0 |

## 8. Regressions

Re-run on the final build:

| check | result |
|---|---|
| `npm test` | 128 files, 1 581 passed, 2 skipped |
| `check-pikine-gare` | all pass |
| `check-crowd` (the street crowd's lanes and pavements) | 24 / 24 |
| `check-night` (lamps, lit shops and signs) | 18 / 18 |
| `check-pikine-mosque` | all pass |
| `check-city-life` (the CI check `check:city`, desktop and phone) | 37 pass, 0 fail |

`check-minimap` and `check-npc-density` (which has two gargote failures that the baseline has too) were not re-run: nothing in this round touches either.
