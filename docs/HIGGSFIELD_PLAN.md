# Higgsfield reference and texture generation — plan (batch 1 run)

Status (7 Oct 2026, 13:20 UTC): **batches 1 and 2 validated by Habib, plus the Maïga, a texture redo and làmb arena
references; 48 credits spent (62 left).** Files and notes in `assets-src/references/higgsfield/` and
`assets-src/references/PROVENANCE.md`. Passing textures: concrete, breeze block, sand, floor tiles, painted metal, plaster v2,
paving v2, wood planks v2 (after a top/bottom crossfade). Arena: view from the stands, ring at ground level, exterior. Credits expire around 9–10 Oct.

Earlier update (CLI sign-in): the cloud session signed in with the CLI (workspace "Private",
plus plan, 110 credits) after `higgsfield.ai` was allowed in the environment's network settings. Cost estimates work
(Nano Banana Pro 2k: 2 credits/image; Seedream 5.0 Pro 2.5; FLUX.2 1; GPT Image 2 6.5; Z Image 0.15), but every
`generate create` is refused with `only_mcp_usage_on_trial_is_available`: on the trial, generation is only allowed through
the Higgsfield **MCP connector**, not the CLI. Nothing was charged. Next: finish connecting the Higgsfield connector at
claude.ai → Customize → Connectors, start a new session, and run batch 1 with Nano Banana Pro 2k (8 credits).

Earlier status: **no credits spent.** Habib authorised up to the 100 available Higgsfield credits (3-day validity, no purchases).
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
| 7 Oct | — (4 jobs refused: trial is MCP-only) | nano_banana_pro | 2k, 16:9 / 1:1 | 0 | — | — |
| 7 Oct 02:34 | `3a050f14-e6e2-4cb2-a9d1-ae63463e5220` | nano_banana_pro (MCP) | 2k, 16:9 | 2 | `01_pikine_street.jpg` | #1 Pikine street ref |
| 7 Oct 02:34 | `bab52e8f-8598-4231-9e38-d96df96077f0` | nano_banana_pro (MCP) | 2k, 16:9 | 2 | `02_starter_room.jpg` | #2 starter room ref |
| 7 Oct 02:34 | `99db7326-b74a-4c79-b9a0-221d3314fc42` | nano_banana_pro (MCP) | 2k, 16:9 | 2 | `03_gargote.jpg` | #3 gargote ref |
| 7 Oct 02:34 | `5ca06dff-cfdd-4382-bbef-e636a68af495` | nano_banana_pro (MCP) | 2k, 1:1 | 2 | `04_texture_plaster_ochre.jpg` | #4 plaster texture — seam check failed, not used |
| 7 Oct 12:11–12:12 | batch 2, 13 jobs (ids in PROVENANCE.md) | nano_banana_pro (MCP) | 2k, 16:9 ×6 / 1:1 ×7 | 26 | `05_…` to `17_…` | streets, interiors, dibiterie, textures |
| 7 Oct 12:11 | 5 submissions refused ("Out of credits", spurious) | nano_banana_pro (MCP) | — | 0 | — | resubmitted |
| 7 Oct 13:08 | `47a3b778-eed0-4abd-b312-e9a5435c53ea` | nano_banana_pro (MCP) | 2k, 16:9 | 2 | `18_maiga.jpg` | Maïga eatery ref |
| 7 Oct 13:10 | 6 jobs #19–24 (ids in PROVENANCE.md) | nano_banana_pro (MCP) | 2k, 1:1 ×3 / 16:9 ×3 | 12 | `19_…` to `24_…` | texture redo (wood, plaster, paving), làmb arena |

Running total: **48 / 100 credits** (account balance 110 → 62, checked against the Higgsfield transactions list).


## Terms check (7 Oct 2026)

Higgsfield help centre, "Who owns my generations, and can I use them commercially?" (dated 2 Aug 2026, citing Terms of Use §4–5): you own inputs and outputs; commercial use is not restricted and not limited to paid plans; outputs are not guaranteed to be exclusive; outputs may not be used to train AI/ML models. Four batch-2 textures are now in the game (see `assets-src/references/PROVENANCE.md`). Re-check the terms before a public release.
