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

Nothing from batch 2 is used in the game yet.

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
