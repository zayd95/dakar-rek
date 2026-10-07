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

### First look (Claude, 7 Oct) — not a review

Habib's review is still required before anything is used; these are notes to speed it up.

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

Nothing from batch 1 is used in the game.

## Photos supplied by Habib (7 Oct 2026, in chat)

Five photographs used as **factual references** (not stored in the repository: their authorship and licence are unknown):
1–2. Monument de la Renaissance africaine — straight stair with railings and lamps, natural hill with scrub, bougainvillea
and palms; the group rising out of angular rock with a tall slab; man with the child on his raised arm, woman leaning
forward with an arm flung back. 3. Corniche Ouest — dual carriageway, concrete median, orange double-arm lamps,
whitewashed palm trunks, mosque minarets in the distance. 4. Aerial view of the Plateau — towers, red tile roofs, cream and
ochre blocks, greenery. 5. Corniche Ouest promenade — red path under yellow tubular railings and arches, grass, beach.
Used for: the monument, the Corniche road and promenade, Plateau towers and roofs (`src/world/builder.ts`).
