# Higgsfield reference and texture generation — plan (not yet run)

Status (7 Oct 2026): **no credits spent.** Habib authorised up to the 100 available Higgsfield credits (3-day validity, no purchases).
The cloud build session could not sign in: the CLI's browser login redirects to `localhost` on the machine that started it,
and the claude.ai Higgsfield connector was not connected in that session. The prompts below are ready to run from Habib's Mac,
where `higgsfield` (v1.1.26) is signed in to the "Private" workspace.

## Rules for every job

1. Before each job: `hf generate cost <model> ...` (same arguments). Record the cost in the log below. If a cost cannot be
   determined, do not run the job.
2. Stop when the running total reaches 100 credits. Never buy credits.
3. Start with **batch 1** (4 images). Review it before running anything else.
4. Generated images are **artistic interpretations**, used as modelling and colour references only. They are never used to
   reconstruct a real landmark, and no readable French/Wolof text from a generated image is used (signs are authored separately
   in `src/world/batch.ts` → `signTexture`).
5. Textures: a texture is only used after a seam check (tile it 3×3 and look) and is treated as a colour map only. No normal or
   roughness maps are derived from it unless they are verified separately.
6. Before any public distribution of a generated image (or of a texture derived from one), read Higgsfield's current terms of
   use for generated assets and note the result here.
7. Save every output in `assets-src/references/higgsfield/` with its prompt, model, settings, cost, date and job id appended
   to `assets-src/references/PROVENANCE.md`.

## Batch 1 — representative (4 images, review before expanding)

| # | Use | Prompt |
| --- | --- | --- |
| 1 | Pikine street reference | Street-level photo-style view of a residential street in Pikine, Dakar suburbs, Senegal: one- and two-storey cement block houses, some painted in faded pastel colours and some bare grey breeze block, flat roofs with protruding rebar, painted metal gates, sandy unpaved roadside, a small boutique with a rolled-up metal shutter, a neem tree, afternoon light, dust in the air. No people in the foreground, no readable text. |
| 2 | Starter room interior | Interior of a modest rented single room in a family house in Dakar: tiled floor with simple pattern, walls painted pale blue to waist height and white above, a wooden bed with a wax-print sheet, a wooden wardrobe with a mirror, a plastic chair, a standing fan, a prayer mat, a small window with blue metal louvres, a single ceiling bulb. Eye-level, natural light. No text. |
| 3 | Gargote interior | Interior of a small neighbourhood gargote (cheap eatery) in Dakar: tiled floor, walls painted green and yellow, a counter with large aluminium cooking pots, tables with patterned oilcloth, white and blue plastic chairs, a fridge with a glass door, a ceiling fan, a fluorescent tube. Midday, busy but no faces in focus. No readable text. |
| 4 | Texture: painted plaster | Seamless tileable texture of weathered painted cement plaster wall, pale ochre, front-facing orthographic view, flat even lighting, no perspective, no shadows, no objects, no text, fills the whole frame. |

## Batch 2 — only after batch 1 is reviewed

Street references: Plateau/Médina (colonial-era arcades, 3–6 storeys), Corniche/Fann (student blocks with balconies, sea wall),
Almadies/Ngor (white villas with walls, bougainvillea, fishing pirogues on the beach). Interiors: family home living room
(salon with sofas and a TV), apartment kitchen. Food venues: dibiterie (grilled meat with a charcoal grill), a small
Maïga-style eatery (check the term and typical layout with Habib before generating). Textures (same seamless wording as #4):
unfinished concrete, breeze blocks, sand, concrete paving, floor tiles, weathered painted metal, wood planks.

## Log

| Date | Job id | Model | Settings | Credits | Output | Used for |
| --- | --- | --- | --- | --- | --- | --- |
| — | — | — | — | 0 | — | — |

Running total: **0 / 100 credits.**
