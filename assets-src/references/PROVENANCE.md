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

### First look (Claude, 7 Oct) and review

**Validated by Habib in chat (7 Oct).** Same limits as batch 1: references only; cultural details stay Unreviewed;
the wood planks stay unused (seam check failed; replaced by #19). Paving #14 is replaced by #21.

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

Batch-2 textures used in the game: see "Used in the game" below.

## Higgsfield — Maïga eatery (7 Oct 2026, 13:08 UTC)

Habib (chat, 7 Oct): a Maïga is the same kind of eatery as a gargote, **smaller and dirtier**. Same model and settings,
cost checked first, **2 credits** (balance 76 → 74).

| # | File | Job id | Aspect | Credits | Prompt |
| --- | --- | --- | --- | --- | --- |
| 18 | `18_maiga.jpg` | `47a3b778-eed0-4abd-b312-e9a5435c53ea` | 16:9, 2752×1536 | 2 | Interior of a tiny, cramped and grimy neighbourhood Maïga eatery in Dakar, Senegal, smaller and dirtier than a typical gargote: one narrow room, stained and peeling painted walls, a worn tiled floor, a short counter with two or three large dented aluminium cooking pots, one long table with a faded patterned oilcloth, a wooden bench and a few mismatched plastic chairs, a small fan, a single bare bulb, smoke-darkened ceiling, midday light from the open doorway. No faces in focus, no readable text, no brand logos. |

First look (not reviewed): a narrow corridor-like room, blue-green walls stained and peeling, soot-black ceiling, pots on
gas rings on a battered wooden counter, a bench and an oilcloth table along one wall, a wall fan, a bare bulb, the open
door to a busy street (figures blurred). Useful for: the Maïga as a cramped, dirtier variant of the gargote interior.

## Higgsfield — texture redo and làmb arena (7 Oct 2026, 13:10 UTC)

Asked by Habib (chat, 7 Oct: redo the failed textures, then the làmb arena). Same model and settings, cost checked first.
6 jobs, **12 credits** (balance 74 → 62). #20 and #22 took about 12 minutes to finish; nothing was resubmitted. The arena prompts ask for a generic arena, not a specific real stadium (plan rule 4).

| # | File | Job id | Aspect | Credits | Prompt |
| --- | --- | --- | --- | --- | --- |
| 19 | `19_texture_wood_planks_v2.jpg` (raw) + `19_texture_wood_planks_v2_tiled.jpg` (seam fixed) | `65b95405-1a67-49aa-8afc-a4aebbb62634` | 1:1, 2048×2048 | 2 | Seamless tileable texture of weathered wooden planks, exactly six vertical planks of equal width, each plank running unbroken from the top edge to the bottom edge with no horizontal joints, continuous vertical grain, natural faded brown wood, front-facing orthographic view, flat even lighting, no nails, no shadows, no text. |
| 20 | `20_texture_plaster_v2.jpg` | `1cc5b308-9a19-49d2-9a75-b6bc35fd3be1` | 1:1, 2048×2048 | 2 | Seamless tileable texture of weathered painted cement plaster wall, pale ochre, fine evenly distributed hairline cracks and tiny chips only, no large peeled patches, no stains, no repeated motifs, front-facing orthographic view, flat even lighting, no shadows, no objects, no text, fills the whole frame. |
| 21 | `21_texture_paving_v2.jpg` | `278e7d8d-9bf2-45cf-b54f-a667ff36fff3` | 1:1, 2048×2048 | 2 | Seamless tileable texture of worn grey concrete paving slabs seen straight from above, a perfectly regular grid of exactly four by four identical square slabs, all slabs the same size, straight thin joints, half a joint width along every edge of the image, light sand in the joints, flat even lighting, no shadows, no perspective, no text. |
| 22 | `22_arena_stands.jpg` | `8fd6f4ae-ba9a-4a9a-9101-e8c988b0b570` | 16:9, 2752×1536 | 2 | Wide photo-style view of a large open-air Senegalese traditional wrestling (lamb) arena in Dakar in late afternoon, seen from high in the stands: a round sand ring bordered by a low ring of sandbags, tiered concrete stands packed with a colourful crowd, tall floodlight masts, groups of drummers seated at the ring side, coloured fabric canopies, haze and dust in warm light. Not a specific real stadium. No faces in focus, no readable text, no logos. |
| 23 | `23_arena_ring_ground.jpg` | `2ec09d3e-e99d-4b7e-8887-30e6a3d2fc8b` | 16:9, 2752×1536 | 2 | Ground-level photo-style view from the edge of an empty Senegalese wrestling (lamb) ring in Dakar before the bouts: smooth raked sand, a low boundary of stacked sandbags, plastic chairs and a small officials' table under a canopy, drums resting on the sand at the ring side, concrete stands behind a fence, floodlights not yet on, late afternoon light. No people, no readable text, no logos. |
| 24 | `24_arena_exterior.jpg` | `3d0adb5c-f47e-4d43-b455-db540b6bdff9` | 16:9, 2752×1536 | 2 | Exterior of a large open-air wrestling arena in Dakar, Senegal, on fight day in the early afternoon: a high painted perimeter wall, a wide entrance gate with metal barriers, a long queue of spectators, street vendors with parasols selling drinks and snacks, parked motorbikes and taxis, flags and fabric banners without text, dust and bright light. Not a specific real stadium. No faces in focus, no readable text, no logos. |

### Checks and first look (Claude, 7 Oct) — not a review

- **#19 wood v2:** left/right wrap clean; the top/bottom wrap still showed a grain break (edge difference 27.3 vs 11.6
  between neighbouring rows). Fixed by a crossfade: the last 256 rows are blended into the first 256, the image is cut to
  1792 rows and resized back to 2048 (Pillow/numpy). After the fix: 12.4 vs 10.4, no visible seam at full
  resolution or tiled 3×3. **Pass** (use the `_tiled` file; colour map only). Replaces #17.
- **#20 plaster v2:** fine hairline cracks and pinholes, no large patches. Both wraps invisible at full resolution (left/right
  edge difference 7.4 vs 4.5 between columns, but no visible line); a faint repeat when tiled 3×3. **Pass.** Replaces #4.
- **#21 paving v2:** a regular 4×4 grid of equal slabs; joints line up across both wraps (the higher edge numbers come from
  the joint sitting on the edge). **Pass.** Replaces #14.
- **#22 arena from the stands:** sandbag ring in a wide sand field, packed stands all round, floodlight masts, coloured
  canopies over seated officials and guests, drummers at the ring side, warm dusty light.
- **#23 arena ring:** sandbag ring on raked sand, officials' table and plastic chairs under a canopy, drums at the ring side,
  concrete stands behind a wire fence, floodlight masts. **#24 arena exterior:** painted perimeter wall with invented murals,
  a gate with crowd barriers, a dense queue, vendors with parasols, taxis and motorbikes, Senegalese flags and fabric
  banners. Drums, set-up and crowd are **Unreviewed** cultural content. Useful for: `src/world/builder.ts` arena (ring
  boundary, canopy, stands fence, perimeter wall and gate) and the arena-day street scene.

## Higgsfield — batch 3: last credits (8 Oct 2026, 22:03–22:08 UTC)

Asked by Habib (chat, 8 Oct: "use the remaining credits fast and usefully"), within his 100-credit authorisation. Same model
and settings (`nano_banana_pro`, 2k), cost checked first per aspect ratio (1:1, 16:9, 21:9: 2 credits each). 26 images,
**52 credits** (balance 62 → 10, checked against the balance after each round). Authorised total now **100 / 100**; the
remaining 10 account credits are outside the authorisation and were not used. Chosen for what the next steps need: textures
for materials still in placeholder colours (arena roof, roads, floors, roofs, trees, walls), orthographic elevations for the
Blender facade kit and the car rapide (handoff step 2), and references for the arena roof and the places added by the
city-life work (bank, shopping gallery, fishing beach) plus home spaces (courtyard, rooftop) and a night street.

| # | File | Job id | Aspect | Credits | Prompt |
| --- | --- | --- | --- | --- | --- |
| 25 | `25_texture_corrugated_galvanized.jpg` | `af981784-fe20-43d9-bc83-32c52d96d641` | 1:1 | 2 | Seamless tileable texture of corrugated galvanized steel roof sheet, exactly eight vertical corrugations of equal width filling the frame edge to edge, slightly dull zinc grey with faint even weathering, front-facing orthographic view, flat even lighting, no shadows, no perspective, no rivets, no text. |
| 26 | `26_texture_corrugated_rusty.jpg` | `9dc8da99-bb52-4ec8-8f26-3f7e57a89f7f` | 1:1 | 2 | Seamless tileable texture of rusty old corrugated tin roof sheet, exactly eight vertical corrugations of equal width filling the frame edge to edge, patchy orange-brown rust evenly spread over grey zinc, small fine spots only, no large distinctive stains, no repeated motifs, front-facing orthographic view, flat even lighting, no shadows, no text. |
| 27 | `27_texture_asphalt.jpg` | `fd93f958-8d1e-41fb-b069-1e83b2bf372d` | 1:1 | 2 | Seamless tileable texture of worn dark grey asphalt road surface seen straight from above, fine aggregate, a few thin hairline cracks evenly spread, light dust, no road markings, no large patches, no repeated motifs, flat even lighting, no shadows, no text, fills the whole frame. |
| 28 | `28_texture_terrazzo.jpg` (raw) + `28_texture_terrazzo_tiled.jpg` (seam fixed) | `c8164e5d-da26-4a46-b8f2-71f811b81cfe` | 1:1 | 2 | Seamless tileable texture of a polished terrazzo floor seen straight from above, cream base with small evenly scattered chips of grey, black and terracotta, no tile joints, no large features, no repeated motifs, flat even lighting, no reflections, no text, fills the whole frame. |
| 29 | `29_texture_clay_roof_tiles.jpg` | `22d5aaa6-6b9a-4bd9-b762-48c7e18e444e` | 1:1 | 2 | Seamless tileable texture of old red clay roof tiles seen straight from above, exactly six rows of overlapping curved tiles and six tiles per row filling the frame edge to edge, faded terracotta with slight even weathering, flat even lighting, no shadows, no perspective, no text. |
| 30 | `30_texture_render_pink.jpg` | `745ba895-7a53-4d68-b005-0a276c477ef5` | 1:1 | 2 | Seamless tileable texture of a cement-rendered house wall painted in faded pastel pink, fine even trowel marks, small hairline cracks and a light dust tone evenly spread, no large stains or patches, no repeated motifs, front-facing orthographic view, flat even lighting, no shadows, no objects, no text, fills the whole frame. |
| 31 | `31_texture_sand_trampled.jpg` | `45594ee7-2387-4201-9df6-87bcdd4a3690` | 1:1 | 2 | Seamless tileable texture of trampled pale beige sand seen straight from above, many small shallow footprints and scuffs evenly spread over the whole frame, fine grains, no large features, no repeated motifs, flat even lighting, no shadows, no text. |
| 32 | `32_texture_palm_trunk.jpg` | `33c41004-10f9-4ef4-b529-ef2d4ce55e5d` | 1:1 | 2 | Seamless tileable texture of a palm tree trunk bark, grey-brown overlapping diamond-shaped leaf scars in a regular grid exactly four across and four down filling the frame edge to edge, front-facing orthographic view, flat even lighting, no shadows, no text. |
| 33 | `33_elev_pikine_house.jpg` | `d00b5bc3-ae9b-402f-96ab-75b872d68127` | 16:9 | 2 | Orthographic front elevation, architectural reference, of a two-storey cement block family house in a Dakar suburb, Senegal: painted render on the ground floor, bare grey breeze block on the unfinished upper floor with protruding rebar, a painted metal entrance gate, two small windows with metal grilles, a flat roof with a low parapet, straight-on view, no perspective, flat even daylight, plain sky background, no people, no text. |
| 34 | `34_elev_plateau_arcade.jpg` | `bfd0bab4-73ee-46fc-bc7e-f44acaf56a9f` | 16:9 | 2 | Orthographic front elevation, architectural reference, of a colonial-era four-storey building in central Dakar, Senegal: a ground-floor arcade of round arches on square pillars, three upper storeys with tall windows, wooden louvred shutters and wrought-iron balconies, cornice and parapet at the top, cream and ochre render, straight-on view, no perspective, flat even daylight, plain background, no people, no text. |
| 35 | `35_elev_boutique.jpg` | `4d7b9979-e0aa-4099-b30a-687203f40113` | 16:9 | 2 | Orthographic front elevation, architectural reference, of a ground-floor neighbourhood shop (boutique) in Dakar, Senegal: two bays, one with a rolled-up corrugated metal shutter showing a counter and shelves of goods, one with the shutter half down, a small concrete step, a plain painted wall above with an empty sign board, straight-on view, no perspective, flat even daylight, no people, no readable text, no logos. |
| 36 | `36_elev_balconies_windows.jpg` | `9b6f6f30-b4eb-438f-b86b-5ab0e1661273` | 16:9 | 2 | Orthographic front elevation, architectural reference, of three typical balcony and window types on Dakar apartment buildings side by side: a concrete balcony with a wrought-iron railing, a window with a metal security grille, and a window with blue metal louvres, on a plain painted wall, straight-on view, no perspective, flat even daylight, no people, no text. |
| 37 | `37_elev_medina_block.jpg` | `acd90dce-7f7d-44c6-bb12-5525e301b48d` | 16:9 | 2 | Orthographic front elevation, architectural reference, of a three-storey residential block in the Medina district of Dakar, Senegal: narrow frontage, small shops on the ground floor, two upper floors with balconies and laundry, flat roof with a water tank and a satellite dish, faded painted render, straight-on view, no perspective, flat even daylight, plain background, no people, no readable text. |
| 38 | `38_car_rapide_side.jpg` | `ac8fd97d-4820-40c0-a6f1-fcd7113f3fef` | 21:9 | 2 | Orthographic side elevation, vehicle modelling reference, of a Dakar car rapide minibus (old Renault SG2-style van body): boxy body, roof rack with luggage rails, rear door step with a ladder, painted in yellow and blue with decorative stripes and geometric patterns, small side windows, straight-on side view, no perspective, flat even light, plain white background, no people, no readable text, no logos. |
| 39 | `39_car_rapide_front_rear.jpg` | `d5104daa-af0d-47c3-b25b-b239d3f14172` | 16:9 | 2 | Vehicle modelling reference sheet showing the front view and the rear view side by side of a Dakar car rapide minibus (old Renault SG2-style van body): boxy body painted yellow and blue with decorative stripes, round headlights, roof rack, rear open doorway with a step where the apprentice stands, orthographic straight-on views, no perspective, flat even light, plain white background, no people, no readable text, no logos. |
| 40 | `40_arena_stands_roof.jpg` | `ac8524bf-f887-4e8f-b1f4-b38e5ba8b30c` | 16:9 | 2 | Photo-style view of the covered concrete stands of a large open-air wrestling arena in Dakar, Senegal, seen from the sand field in the early afternoon: stepped grey concrete terraces with painted risers, a low wall with blank coloured banners in front, a roof of corrugated metal sheets on steel columns and cantilever trusses above the upper rows, empty seats, strong shadows under the roof. Not a specific real stadium. No people, no readable text, no logos. |
| 41 | `41_arena_roof_underside.jpg` | `9828804a-b268-46df-be2a-e80d2e0e6274` | 16:9 | 2 | Photo-style view looking up at the underside of a stadium stand roof in Dakar, Senegal: corrugated metal roof sheets on steel purlins, tapered steel cantilever trusses fixed to concrete columns at the back of the stands, a painted fascia along the front edge, daylight through the gap above the back wall. Not a specific real stadium. No people, no readable text, no logos. |
| 42 | `42_bank_interior.jpg` | `d509d3de-9207-47f1-8f5e-215b5f35a665` | 16:9 | 2 | Interior of a small bank branch in Dakar, Senegal: tiled floor, a counter with glass screens and three teller windows, a short queue line with stanchions, plastic chairs along the wall, a ceiling fan and fluorescent lights, an ATM by the door, eye-level view, daylight. No faces in focus, no readable text, no logos, not a specific real bank. |
| 43 | `43_shopping_gallery.jpg` | `a2d153e9-739b-4d7b-b3b8-2a30d0ee39c7` | 16:9 | 2 | Interior of a covered shopping gallery in Dakar, Senegal: a long tiled corridor with small shops on both sides selling phones, fabrics, shoes and cosmetics, metal roller shutters, fluorescent lights, a skylight, a few shoppers in the distance, eye-level view. No faces in focus, no readable text, no logos, not a specific real mall. |
| 44 | `44_fishing_beach_market.jpg` | `fdacfe28-085d-40f9-9b45-cb4c221bef39` | 16:9 | 2 | Photo-style view of a busy fishing beach in Dakar, Senegal, in the late afternoon: colourful wooden pirogues pulled up on the sand, fishermen unloading crates, women with basins of fish, a covered fish market hall with a corrugated roof behind, cliffs and buildings above the beach, the Atlantic Ocean. Not a specific real place. No faces in focus, no readable text, no logos. |
| 45 | `45_family_courtyard.jpg` | `832933a3-c21f-4cae-b5a6-a2ac3a369648` | 16:9 | 2 | Photo-style view of the inner courtyard of a family house in a Dakar suburb, Senegal: tiled courtyard open to the sky, a shade tree, doors of several rooms around, a water tap and plastic buckets, a clothesline, plastic chairs and a low wooden bench, a charcoal stove for tea, afternoon light. No people, no readable text. |
| 46 | `46_rooftop_terrace.jpg` | `874eb15f-2d86-47ab-a25b-7adb89df29ba` | 16:9 | 2 | Photo-style view of a flat rooftop terrace of a house in Dakar, Senegal, at golden hour: a parapet wall, a black plastic water tank on a stand, a satellite dish, laundry on lines, protruding rebar from an unfinished next floor, neighbouring rooftops and a minaret in the distance. No people, no readable text. |
| 47 | `47_pikine_street_night.jpg` | `e643759e-011f-48f9-b1e5-f63182bd89ac` | 16:9 | 2 | Street-level photo-style view of a residential street in a Dakar suburb, Senegal, at night: one- and two-storey houses, a few lit windows, a small neighbourhood shop with a fluorescent tube under a rolled-up shutter, warm street lamps making pools of light on the sandy road, a parked taxi, deep blue sky. No people in the foreground, no readable text, no logos. |
| 48 | `48_car_rapide_side_ortho.jpg` | `7054ff8e-1ab7-4b76-b892-b49c9b661c82` | 21:9 | 2 | Strict orthographic side elevation, flat 2D vehicle blueprint style, of a Dakar car rapide minibus (boxy 1970s van body): perfectly side-on, both wheels as perfect circles, no perspective, no three-quarter view, roof rack with luggage rails, rear step and ladder, painted yellow and blue with decorative stripes and geometric patterns, flat even light, plain white background, no people, no readable text, no logos, no badges. |
| 49 | `49_texture_palm_trunk_v2.jpg` (raw) + `49_texture_palm_trunk_v2_tiled.jpg` (seam fixed) | `103fdfbc-06db-4f80-8888-3fb4e4de28a4` | 1:1 | 2 | Seamless tileable texture of a coconut palm tree trunk, grey-brown fibrous bark with fine horizontal ring scars evenly spaced every few centimetres, vertical fibres running unbroken from the top edge to the bottom edge, no large diamond scars, no knots, front-facing orthographic view, flat even lighting, no shadows, no text, fills the whole frame. |
| 50 | `50_texture_hollow_block.jpg` | `efcc58b4-b545-4b6e-af15-b5bf80f2ca28` | 1:1 | 2 | Seamless tileable texture of a bare wall of large grey hollow cement blocks as used in Dakar, Senegal, each block 40 cm long and 20 cm high (twice as long as high), exactly three blocks wide and six courses high in a running bond, thin grey mortar joints, rough porous cement surface, front-facing orthographic view, flat even lighting, no shadows, no perspective, no text, fills the frame edge to edge. |

### Checks and first look (Claude, 8 Oct) — not a review

Textures (tiled 3×3, both wrap joins viewed at full resolution):

| # | Verdict | Notes |
| --- | --- | --- |
| 25 galvanized corrugated | pass | faint horizontal banding when tiled |
| 26 rusty corrugated | pass | — |
| 27 asphalt | pass | — |
| 28 terrazzo | pass after fix | chips cut along the top/bottom join; crossfade fix (`_tiled`, edge difference 3.7 vs 4.5 between rows) |
| 29 clay roof tiles | pass | the top/bottom join falls on a tile row, reads as a normal overlap |
| 30 pink render | pass | — |
| 31 trampled sand | pass | candidate for the arena ring floor |
| 32 palm trunk | **fail**, not used | bark cut on both joins, obvious repeat; replaced by #49 |
| 49 palm trunk v2 | pass after fix | top/bottom seam crossfaded (`_tiled`, 9.5 vs 8.8) |
| 50 hollow cement block | pass | 2:1 blocks, answers the "looks like brick" note on #12 |

References:

- **#33–37 elevations:** clean straight-on views, usable for the facade kit (Pikine house with unfinished breeze-block floor,
  Plateau arcade building, two-bay boutique, balcony and window types, narrow Médina block).
- **#38 car rapide side:** came out in three-quarter view, not orthographic; colour and decoration reference only. **#48** is
  the true side elevation. **#39 front/rear:** usable, but the grille shows a manufacturer badge: **do not reproduce it**.
  Car rapide paint patterns are generated: **Unreviewed** cultural content.
- **#40–41 arena:** stepped concrete terraces with painted risers, roof of corrugated sheets on cantilever trusses, blank
  banners; underside of the roof with purlins and trusses. Material and structure reference for the géew stands and roof.
- **#42 bank, #43 shopping gallery:** faces blurred, no logos seen; shop-sign shapes are not to be copied. **#44 fishing
  beach:** resembles the Soumbédioune setting (cliffs, market hall); artistic interpretation only, not a reconstruction.
- **#45 family courtyard, #46 rooftop terrace, #47 night street:** usable for home interiors and night lighting.

Batch 3 textures are used in the game since 8 Oct ("Used in the game" below) and were remastered the same night (section after it).

## Used in the game (7 Oct 2026, cloud session)

Derived 512 px JPEGs in `public/assets/tex/` (loaded on demand; switched off on Low quality):

| Game file | From | Processing | Used for |
| --- | --- | --- | --- |
| ~~`breeze_block.jpg`~~ (removed 8 Oct, replaced by `hollow_block.jpg`) | #12 | greyscale, contrast ×1.7, mean normalised to 0.84 so it modulates the wall colour | raw breeze-block yard walls (Pikine), 1.6 m per repeat |
| `sand.jpg` | #13 | tint neutralised (mean 0.9) | ground plane of every hub, 3 m per repeat |
| `painted_metal.jpg` | #16 | greyscale, contrast ×1.5, mean 0.82 | gates and boutique shutters, 1.2 m per repeat |
| `floor_tiles_terracotta.jpg` | #15 | resized only (colour kept) | gargote floors, 1.2 m per repeat (4 × 4 tiles of 30 cm) |
| `paving.jpg` | #21 (paving v2) | greyscale, mean 0.8 | sidewalks and plazas (replaces the procedural paving), 2 m per repeat |
| `wood.jpg` | #19 (wood v2, `_tiled` seam-fixed file) | greyscale, contrast ×1.3, mean 0.82 | interior furniture (beds, counters, benches), 1 m per repeat |
| `hollow_block.jpg` | #50 | remastered (block tones equalised, joints kept); greyscale, contrast ×1.5, mean 0.84; relief 2 cm | raw breeze-block walls (replaces `breeze_block.jpg`, whose units read as bricks), 1.2 m per repeat = 3 × 6 blocks of 40 × 20 cm |
| `asphalt.jpg` | #27 | remastered (blotches equalised); greyscale, contrast ×1.4, mean 0.9; no relief (roads fill the frame) | roads in Plateau, Corniche and Almadies (Pikine's stay sandy), 3 m per repeat |
| `clay_tiles.jpg` | #29 | remastered (tile tones equalised); greyscale, contrast ×1.15, darkest values lifted (row gaps were black lines), mean 0.86; relief 4 cm | Plateau red hipped roofs, 1.8 m per repeat (6 rows of 30 cm) |
| `corrugated.jpg` | #25 | remastered (banding along the ribs flattened, top/bottom join crossfaded); greyscale, contrast ×1.4, mean 0.88; three.js bump map from the same file | arena roof sheets, mapped on each panel's UVs (4 × 5 repeats per panel, about 11 cm pitch) so the ribs run down the slope; plain colour on Low |
| `corrugated_rusty.jpg` | #26 | remastered (large blotches equalised); colour kept, mean 0.86; relief 1.5 cm | dibiterie tin awnings, 1.2 m per repeat |
| `concrete.jpg` | #11 | greyscale, contrast ×1.4, mean 0.9 | arena tiers, 2 m per repeat |
| `palm_trunk.jpg` | #49 (palm trunk v2, `_tiled` seam-fixed file) | remastered (light columns equalised); greyscale, contrast ×1.3, mean 0.86; relief 0.6 cm | palm trunks (whitewashed ones too), 1 m per repeat |
| `terrazzo.jpg` | #28 (`_tiled` seam-fixed file) | remastered (base tone equalised, chips kept); colour kept, mean 0.92; no relief (polished) | bank hall and mall courtyard floors, 1.5 m per repeat |
| `sand_trampled.jpg` | #31 | remastered (blotches equalised); tint neutralised (mean 0.9); relief 4 cm (footprints) | arena sand floor, 2.5 m per repeat |

Each was tiled 3×3 after processing: no visible seam (batch 3 files also checked by wrap-edge difference; the clay tile and
corrugated top/bottom edges fall on a tile row and a flat run, and read as continuous when tiled 2×2). Not used: #4 plaster,
#17 wood and #32 palm trunk (seam failures), #14 paving (replaced by #21), #12 breeze block (replaced by #50 on 8 Oct),
#20 plaster v2 and #30 pink render (facades already carry their own window texture). References #10 (dibiterie), #18 (Maïga) and #22–24 (arena) guided those builds.

Terms (checked 7 Oct 2026, Higgsfield help centre "Who owns my generations", dated 2 Aug 2026, citing Terms of Use §4–5):
the user owns inputs and outputs; commercial use is not restricted and not limited to paid plans; outputs are not
guaranteed exclusive; outputs may not be used to train or improve AI/ML models. Re-check before a public release.

## Remaster of the batch 3 game textures (8 Oct 2026, night, no credits)

Asked by Habib (chat: "make the 23 images even better"). No Higgsfield credits were spent: the 100 authorised are used,
and the 10 left on the account are outside the authorisation. Local processing only, from the unchanged 2048 px sources,
reproducible with `python3 scripts/tex/remaster.py --report` (numpy and Pillow; every filter wraps around the tile, so the
textures stay seamless).

- **Fewer visible repeats.** Brightness is equalised at the scale that showed as a grid when tiled (periodic Gaussian local
  mean; the darkest pixels are left out of the mean so mortar joints, tile gaps and terrazzo chips keep their depth): the
  palm bark's light columns, the light and dark hollow blocks, clay tile tones, asphalt blotches, banding down the
  galvanized ribs. The galvanized sheet's top/bottom join is crossfaded (its streaks were cut there).
- **Contrast retuned:** clay tiles ×1.15 with the darkest values lifted (the row gaps were black lines), hollow blocks ×1.5,
  galvanized sheet ×1.4.
- **Relief in the shader** (`src/world/grain.ts`): the world-space detail map's brightness is read as height (dark = low)
  and tilts the normal by its slope (Mikkelsen surface-gradient bump, forward differences one pixel apart), with a depth
  per material in metres (column "Processing" above). Only on surfaces where it reads and that cover little of the
  screen (walls, roof tiles, tin, palm trunks, the ring); the arena roof sheets use three.js's bump map with the same
  texture. No new files to download; Medium and High only (Low has no detail textures).
- **Cost.** The first version also put relief on the ground, paving, asphalt, arena tiers and Maïga floor. In the
  software renderer used by CI that cost up to 30 % of the frame rate (Almadies mall 1.75 → 1.23 fps) and the mall
  walk-through check timed out on CI. Those surfaces fill most of the frame for little visible gain, so they lost their
  relief: mall 1.84 fps, Pikine street 2.52 (2.49 before), block wall close-up 2.46 (2.72), arena sand 1.76 (1.98).
  Software-rendering figures from one 6 s sample each; they show the relative per-pixel cost, not phone frame rates.

Measured on the game files (old → new). Tone spread: spread of a 1/32-tile blur over the mean, lower repeats less. Seam:
difference across the wrap edge over the difference between neighbouring rows, about 1 is invisible; the clay tile and
hollow block values stay high because their edge falls on a tile row and a mortar joint, as checked on 7–8 Oct.

| Game file | Tone spread | Seam |
| --- | --- | --- |
| `hollow_block.jpg` | 0.039 → 0.029 | 1.61 → 1.60 |
| `asphalt.jpg` | 0.006 → 0.004 | 0.97 → 0.99 |
| `clay_tiles.jpg` | 0.050 → 0.035 | 6.71 → 6.34 |
| `corrugated.jpg` | 0.025 → 0.018 | 2.41 → 1.63 |
| `corrugated_rusty.jpg` | 0.022 → 0.021 | 1.11 → 1.09 |
| `palm_trunk.jpg` | 0.019 → 0.008 | 1.31 → 1.33 |
| `terrazzo.jpg` | 0.008 → 0.008 | 0.84 → 0.84 |
| `sand_trampled.jpg` | 0.004 → 0.004 | 1.16 → 1.16 |

In-game before/after (same camera, 15:00): `docs/screenshots/textures/` (block wall, arena sand, palm trunk). The
first relief setting for the palm trunk (1.5 cm, height slope from `dFdx`) showed blocky 2×2 pixel artefacts close up; it
was lowered and switched to forward differences before the captures. Total texture size slightly smaller (1.15 → 1.13 MB for the 14 files).

**Reference #39:** `39_car_rapide_front_rear_clean.jpg` replaces the manufacturer badge on the grille with the plain
slats beside it (same rows); the raw file is kept. Use the clean copy for modelling. The other references (#33–38,
#40–48) are unchanged: they guide modelling and colour, players never see them, and better versions would need new
generations, so new credits.

## Photos supplied by Habib (7 Oct 2026, in chat)

Five photographs used as **factual references** (not stored in the repository: their authorship and licence are unknown):
1–2. Monument de la Renaissance africaine — straight stair with railings and lamps, natural hill with scrub, bougainvillea
and palms; the group rising out of angular rock with a tall slab; man with the child on his raised arm, woman leaning
forward with an arm flung back. 3. Corniche Ouest — dual carriageway, concrete median, orange double-arm lamps,
whitewashed palm trunks, mosque minarets in the distance. 4. Aerial view of the Plateau — towers, red tile roofs, cream and
ochre blocks, greenery. 5. Corniche Ouest promenade — red path under yellow tubular railings and arches, grass, beach.
Used for: the monument, the Corniche road and promenade, Plateau towers and roofs (`src/world/builder.ts`).

## Arena photos supplied by Habib (7 Oct 2026, in chat)

Three photographs used as **factual references** for the làmb arena (not stored in the repository: authorship and licence
unknown; they show real venues, sponsors and people). 1. A large modern arena seen from the upper stands: a bowl of two
tiers under a canopy roof, a wide sand field, the fighting area outlined in white sandbags with sponsor boards and feather
flags around it, crowd barriers, security staff in orange vests. 2. A stadium bout at ground level: a circle of white
sandbags on deep sand, judges in white on folding chairs at the bags, an officials' table at the barriers, banners on the
barrier fence, two tiers of stands. 3. An older arena from the stands: concrete terraces, a parapet wall covered in sponsor
banners, sponsor boards just outside the ring, the ring a white traced circle with sandbags. Used for: the arena ring side in
`src/world/builder.ts` (white sandbags, traced line, blank sponsor boards, judges' chairs, officials' table and canopy,
barriers, bannered parapet, feather flags). No sponsor names, logos or people are reproduced.
Also used (7 Oct, later) for the height and roof of the stands: three raised tiers under a roof carried on the outer wall.
These photos are visual references only; they do not validate the arena culturally (layout, roles, set-up stay Unreviewed).
