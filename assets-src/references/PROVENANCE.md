# Reference provenance

Every AI-generated reference or texture: prompt, model, settings, cost, date, job id. Generated images are **artistic
interpretations** used as modelling and colour references only (rules in `docs/HIGGSFIELD_PLAN.md`).

## Higgsfield — batch 1 (7 Oct 2026, 02:34 UTC)

Submitted through the Higgsfield MCP connector, workspace "Private" (plus plan). Requested model `nano_banana_pro`, 2k;
the job records name it `nano_banana_2` and the transactions list bills it as "Nano Banana Pro". Cost checked before
submission (2 credits each); 4 × 2 = 8 credits charged (transactions, 02:34:04 UTC).

Files: in `assets-src/references/higgsfield/`, downloaded 7 Oct after the CDN host `d8j0ntlcm91z4.cloudfront.net` was
allowed in the environment's network settings. Stored as JPEG at full resolution (quality 92, texture 95) to keep the
repository small; the original PNGs (~8 MB each) stay in the Higgsfield library under the job ids below.

| # | File (`assets-src/references/higgsfield/`) | Job id | Aspect / size | Credits | Prompt |
| --- | --- | --- | --- | --- | --- |
| 1 | `01_pikine_street.jpg` | `3a050f14-e6e2-4cb2-a9d1-ae63463e5220` | 16:9, 2752×1536 | 2 | Street-level photo-style view of a residential street in Pikine, Dakar suburbs, Senegal: one- and two-storey cement block houses, some painted in faded pastel colours and some bare grey breeze block, flat roofs with protruding rebar, painted metal gates, sandy unpaved roadside, a small boutique with a rolled-up metal shutter, a neem tree, afternoon light, dust in the air. No people in the foreground, no readable text. |
| 2 | `02_starter_room.jpg` | `bab52e8f-8598-4231-9e38-d96df96077f0` | 16:9, 2752×1536 | 2 | Interior of a modest rented single room in a family house in Dakar: tiled floor with simple pattern, walls painted pale blue to waist height and white above, a wooden bed with a wax-print sheet, a wooden wardrobe with a mirror, a plastic chair, a standing fan, a prayer mat, a small window with blue metal louvres, a single ceiling bulb. Eye-level, natural light. No text. |
| 3 | `03_gargote.jpg` | `99db7326-b74a-4c79-b9a0-221d3314fc42` | 16:9, 2752×1536 | 2 | Interior of a small neighbourhood gargote (cheap eatery) in Dakar: tiled floor, walls painted green and yellow, a counter with large aluminium cooking pots, tables with patterned oilcloth, white and blue plastic chairs, a fridge with a glass door, a ceiling fan, a fluorescent tube. Midday, busy but no faces in focus. No readable text. |
| 4 | `04_texture_plaster_ochre.jpg` | `5ca06dff-cfdd-4382-bbef-e636a68af495` | 1:1, 2048×2048 | 2 | Seamless tileable texture of weathered painted cement plaster wall, pale ochre, front-facing orthographic view, flat even lighting, no perspective, no shadows, no objects, no text, fills the whole frame. |

Download URL pattern for the originals: `https://d8j0ntlcm91z4.cloudfront.net/user_3J7IyVV0T7wCwVUC7I9Ah5lYqNg/hf_20261007_023404_<job id>.png`.

### First look (Claude, 7 Oct) and review

**Validated by Habib in chat (7 Oct)** as modelling and colour references. Cultural details (prayer mat, prints) stay
Unreviewed until practitioners review them; #4 stays unused (seam check failed).

- **#1 Pikine street:** close to the brief: sandy road, pastel and bare breeze-block houses, rebar on flat roofs, painted
  gates, a boutique with a rolled shutter, a large tree, dusty low sun. A few small figures in the distance; no readable text
  seen. Useful for: facade colours, breeze-block walls, gate patterns, kerb-less sand street. Check: is it believable for Pikine?
- **#2 Starter room:** close to the brief: blue-to-waist walls, patterned floor tiles, louvred blue window, standing fan,
  plastic chair, mirrored wardrobe, bare bulb, prayer mat. The bed is metal-framed (the prompt asked for wood). Prayer mat
  and print are **Unreviewed** cultural content. Useful for: room proportions, wall paint split, furniture set.
- **#3 Gargote:** green and yellow walls, counter with aluminium pots, oilcloth tables, white and blue plastic chairs,
  drinks fridge, fan, fluorescent tube. Faces came out blurred (looks artificial); fridge bottles have label-like marks, so
  no product or brand detail is to be copied. Useful for: layout (counter along one wall), colours, chair mix.
- **#4 Plaster texture — seam check failed.** Tiled 3×3: the image is itself a near-2×2 repeat of a ~1024 px tile
  (horizontal 1024 px shift differs by 6.7/255 on average vs ~16 for unrelated rows), so the grey peeled patches repeat
  every half-image and the pattern is obvious. Left/right wrap is seamless (edge difference 8.3 vs 7.5–7.9 between
  neighbouring columns); top/bottom wrap is not (13.8, about 1.8× normal), a visible horizontal seam. **Not used.** Colour
  reference only. If a generated texture is wanted, the next try should ask for fewer large features or be fixed by an
  offset-and-blend pass, then re-checked.

Nothing from batch 1 is used in the game yet.

## Higgsfield — batch 2 (7 Oct 2026, 12:11–12:12 UTC)

Run after Habib validated batch 1. Same model and settings (`nano_banana_pro`, 2k; job records say `nano_banana_2`), cost
checked first (2 credits each). 13 images, **26 credits** (balance 102 → 76, matches the transactions list). On the first
submission 5 of the 6 scene jobs were refused with "Out of credits" while 86 credits remained (a concurrency limit, it
seems); nothing was charged for them and they were resubmitted once. The Maïga-style eatery was **not** generated: the term
and layout are to be confirmed with Habib first. Texture prompts were reworded after batch 1 (fine evenly spread detail, no
repeated motifs, an exact block/slab/plank count so the grid divides the frame).

Files in `assets-src/references/higgsfield/` (JPEG, full resolution; original PNGs in the Higgsfield library).

| # | File | Job id | Aspect | Credits | Prompt |
| --- | --- | --- | --- | --- | --- |
| 5 | `05_plateau_street.jpg` | `46e4f632-0322-4182-818d-a466e2562ae5` | 16:9, 2752×1536 | 2 | Street-level photo-style view in the Plateau district of Dakar, Senegal: colonial-era buildings of three to six storeys with ground-floor arcades, cream, ochre and faded yellow facades, wooden shutters, wrought-iron balconies, mixed with plain concrete office blocks, parked cars and yellow-and-black taxis, morning light. No people in the foreground, no readable text. |
| 6 | `06_corniche_fann.jpg` | `a2f529c8-838a-49c0-bfb2-fac01a60597e` | 16:9, 2752×1536 | 2 | Street-level photo-style view along the Corniche near Fann, Dakar, Senegal: four- to five-storey residential blocks with rows of balconies and laundry, painted in cream and pale blue, a low sea wall with the Atlantic Ocean beyond, a wide pavement, palm trees, late afternoon light, sea haze. No people in the foreground, no readable text. |
| 7 | `07_almadies_ngor.jpg` | `fc6d223f-9455-4a87-89ef-e405f2bbe3f8` | 16:9, 2752×1536 | 2 | Photo-style view of a quiet residential lane in Almadies near Ngor, Dakar, Senegal: white two-storey villas behind high white walls, bougainvillea spilling over the walls, a sandy lane, and beyond it a beach with colourful wooden fishing pirogues pulled up on the sand, bright midday light, ocean in the background. No people in the foreground, no readable text. |
| 8 | `08_family_salon.jpg` | `9af0a384-ddcc-4ab9-8696-c9a738942092` | 16:9, 2752×1536 | 2 | Interior of the living room (salon) of a middle-class family home in Dakar, Senegal: tiled floor with a large rug, a set of upholstered sofas and armchairs arranged around a low coffee table, a TV on a wooden cabinet, curtains on a large window, framed pictures on the walls, a ceiling fan, eye-level view, warm natural light. No people, no readable text, no screens showing content. |
| 9 | `09_apartment_kitchen.jpg` | `9c45be22-e4f6-4fc8-baec-da2f3bf203be` | 16:9, 2752×1536 | 2 | Interior of a small apartment kitchen in Dakar, Senegal: tiled walls and floor, a tiled counter with a sink, a gas cooker with a butane bottle, aluminium pots and a large enamel basin, plastic food containers, a fridge, a small window with metal louvres, eye-level view, daylight. No people, no readable text, no brand logos. |
| 10 | `10_dibiterie.jpg` | `e4630e95-70be-45c7-9a17-e0ae7ee82f8f` | 16:9, 2752×1536 | 2 | Small neighbourhood dibiterie (grilled meat eatery) in Dakar, Senegal, at early evening: a simple open front, a charcoal grill with smoke and skewers of mutton, a butcher's counter, a wooden bench and a couple of plastic tables and chairs, a single bulb and a fluorescent tube, painted walls, eye-level view from the street. No faces in focus, no readable text. |
| 11 | `11_texture_concrete.jpg` | `0e85d648-ca33-4c80-aa51-efa3bc656393` | 1:1, 2048×2048 | 2 | Seamless tileable texture of unfinished cast concrete wall, grey, front-facing orthographic view, flat even lighting, fine evenly distributed small-scale detail, no large distinctive marks or stains, no repeated motifs, no text, fills the whole frame. |
| 12 | `12_texture_breeze_block.jpg` | `9e6ae246-a2ec-487f-b5a4-ebc79bc8c5ac` | 1:1, 2048×2048 | 2 | Seamless tileable texture of a bare grey cement breeze-block wall with mortar joints, exactly four blocks wide and eight courses high in a running bond filling the frame edge to edge, front-facing orthographic view, flat even lighting, no shadows, no perspective, no text. |
| 13 | `13_texture_sand.jpg` | `d90f5d85-7387-413f-a0f6-ffb386682d1e` | 1:1, 2048×2048 | 2 | Seamless tileable texture of pale beige sand ground seen straight from above, fine evenly distributed grains with a few tiny pebbles, no footprints, no large features, no repeated motifs, flat even lighting, no shadows, no text, fills the whole frame. |
| 14 | `14_texture_paving.jpg` | `2594ebf0-77fa-458d-bd3f-a4d8e1523649` | 1:1, 2048×2048 | 2 | Seamless tileable texture of worn grey concrete paving slabs seen straight from above, exactly four by four square slabs filling the frame edge to edge, thin joints, light sand in the joints, flat even lighting, no shadows, no perspective, no text. |
| 15 | `15_texture_floor_tiles.jpg` | `5d0ba5b4-7acd-4c32-9eb4-a15e7a42a021` | 1:1, 2048×2048 | 2 | Seamless tileable texture of patterned ceramic floor tiles seen straight from above, exactly four by four square tiles with a simple beige and terracotta geometric pattern, thin grout lines, slightly worn, filling the frame edge to edge, flat even lighting, no shadows, no perspective, no text. |
| 16 | `16_texture_painted_metal.jpg` | `72d3d4e8-f408-45a8-b9d4-f57cfecb3ba8` | 1:1, 2048×2048 | 2 | Seamless tileable texture of weathered painted sheet metal, faded turquoise paint with small evenly spread scratches and light rust spots, front-facing orthographic view, flat even lighting, no large distinctive marks, no repeated motifs, no rivets, no text, fills the whole frame. |
| 17 | `17_texture_wood_planks.jpg` | `d19198da-55b6-4cf4-aad3-3b216f375672` | 1:1, 2048×2048 | 2 | Seamless tileable texture of weathered wooden planks, exactly six vertical planks of equal width filling the frame edge to edge, natural brown wood with faded grain, front-facing orthographic view, flat even lighting, no knots that repeat, no nails, no shadows, no text. |

### First look (Claude, 7 Oct) — not a review

- **#5 Plateau:** arcaded colonial blocks, iron balconies, plain concrete blocks, taxis. One taxi shows a plate-like number:
  no text to be copied. **#6 Corniche/Fann:** balconied blocks with laundry, sea wall, palms, haze; shop signs blurred.
  **#7 Almadies/Ngor:** white walls, bougainvillea, sandy lane to a beach with pirogues.
- **#8 Salon:** sofas around a coffee table, TV cabinet, curtains, ceiling fan. The framed photos show generated faces and
  the wall art is invented: not to be reproduced. **#9 Kitchen:** blue patterned wall tiles, tiled counter, two-ring gas
  cooker with a butane bottle, enamel basins, fridge, louvred window. **#10 Dibiterie:** open front under a tin awning,
  charcoal grill with skewers, counter, bench, plastic tables; faces blurred.
- Textures, 3×3 tiling plus full-resolution views of both wrap joins:

| # | Wrap joins | Notes | Verdict |
| --- | --- | --- | --- |
| 11 concrete | invisible | slight half-image repeat visible at 3×3 | pass (colour map) |
| 12 breeze block | invisible (joints on the edges) | units read more like bricks/pavers than Dakar breeze blocks | pass, check proportions |
| 13 sand | invisible | — | pass |
| 14 paving | invisible | slabs are not the 4×4 asked for: uneven sizes | seams pass, layout to judge |
| 15 floor tiles | invisible | one chipped tile | pass |
| 16 painted metal | invisible | half-image repeat visible at 3×3 | pass (colour map) |
| 17 wood planks | **top/bottom seam**: every plank breaks at the same height | — | **fail**, not used |

Nothing from batch 2 is used in the game yet.

## Used in the game (7 Oct 2026, cloud session)

Derived 512 px JPEGs in `public/assets/tex/` (loaded on demand; switched off on Low quality):

| Game file | From | Processing | Used for |
| --- | --- | --- | --- |
| `breeze_block.jpg` | #12 | greyscale, contrast ×1.7, mean normalised to 0.84 so it modulates the wall colour | raw breeze-block yard walls (Pikine), 1.6 m per repeat |
| `sand.jpg` | #13 | tint neutralised (mean 0.9) | ground plane of every hub, 3 m per repeat |
| `painted_metal.jpg` | #16 | greyscale, contrast ×1.5, mean 0.82 | gates and boutique shutters, 1.2 m per repeat |
| `floor_tiles_terracotta.jpg` | #15 | resized only (colour kept) | gargote floors, 1.2 m per repeat (4 × 4 tiles of 30 cm) |

Each was tiled 3×3 after processing: no visible seam. Not used: #4 plaster and #17 wood (seam failures), #14 paving
(slab layout to be judged by Habib), #11 concrete (no use yet). Reference images #10 (dibiterie) guided the dibiterie build.

Terms (checked 7 Oct 2026, Higgsfield help centre "Who owns my generations", dated 2 Aug 2026, citing Terms of Use §4–5):
the user owns inputs and outputs; commercial use is not restricted and not limited to paid plans; outputs are not
guaranteed exclusive; outputs may not be used to train or improve AI/ML models. Re-check before a public release.

## Photos supplied by Habib (7 Oct 2026, in chat)

Five photographs used as **factual references** (not stored in the repository: their authorship and licence are unknown):
1–2. Monument de la Renaissance africaine — straight stair with railings and lamps, natural hill with scrub, bougainvillea
and palms; the group rising out of angular rock with a tall slab; man with the child on his raised arm, woman leaning
forward with an arm flung back. 3. Corniche Ouest — dual carriageway, concrete median, orange double-arm lamps,
whitewashed palm trunks, mosque minarets in the distance. 4. Aerial view of the Plateau — towers, red tile roofs, cream and
ochre blocks, greenery. 5. Corniche Ouest promenade — red path under yellow tubular railings and arches, grass, beach.
Used for: the monument, the Corniche road and promenade, Plateau towers and roofs (`src/world/builder.ts`).
