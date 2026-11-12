# Meshy provenance

Every AI-generated asset: prompt, tool, settings, cost, date, task id (the repository's rule, as for `assets-src/references/PROVENANCE.md`). Generated with the Meshy CLI 0.4.0 on one account (17 October 2026). **Licence tier not confirmed**: the API exposes credits only (balance 940 on 17 Oct: 925 monthly + 15 permanent, monthly reset 2026-11-17 18:05 UTC). Free-plan outputs are published as CC BY 4.0 (attribution), paid plans as commercial use without attribution, conditional on not publishing to the Meshy Community; confirm the plan and terms in the Meshy account before release. Raw outputs are not in git; see `private-archive/` and `MESHY_ASSETS_MANIFEST.json` (checksums).

Costs are the `consumed_credits` Meshy reported. Total for the two bodies: 80 credits.

## homme

**Prompt** (read back from the Meshy task (created before this session)): Stylized game-ready sim character, young Senegalese man from Dakar, warm dark brown skin, short black hair, friendly face, wearing a bright blue short-sleeve shirt, dark charcoal trousers and simple sneakers, relaxed standing A-pose with arms slightly away from body, full body, clean readable silhouette, mobile-game low-poly stylized proportions

| Stage | Resource | Task id | Credits | When |
|---|---|---|---|---|
| preview | text-to-3d | `01a14b42-884b-75e4-be5e-3b36162636b2` | 20 | 2026-10-17 (earlier session) |
| refine | text-to-3d | `01a14b59-707b-70d4-bb1c-cd2fb19fd087` | 10 | 2026-10-17 19:31 UTC |
| remesh 12k tris | remesh | `01a14b5a-c535-70a4-833a-7435d1b48307` | 5 | 2026-10-17 19:33 UTC |
| rigging 1.75 m | rigging | `01a14b5c-20ca-7755-97cb-e45fe001ee25` | 5 | 2026-10-17 19:35 UTC |

## femme

**Prompt** (this session (--pose-mode a-pose was passed and ignored by Meshy)): Full body realistic young Senegalese woman from Dakar, about 25, standing straight in a neutral A-pose, arms slightly away from the body, hands relaxed with fingers together and straight. Hair in neat braids tied back. Casual city outfit: fitted warm yellow t-shirt, dark blue high-waisted jeans, clean white sneakers. Natural proportions, game character, matte fabric, no accessories.

**Texture prompt** (refine): olive green bomber jacket, warm yellow top underneath, dark blue jeans, white sneakers, brown skin, black hair, small gold hoop earrings

| Stage | Resource | Task id | Credits | When |
|---|---|---|---|---|
| preview | text-to-3d | `01a14b63-cdfb-7226-b681-99182fb1107e` | 20 | 2026-10-17 19:43 UTC |
| refine | text-to-3d | `01a14b64-d3ef-7731-bad3-250961005d4d` | 10 | 2026-10-17 19:45 UTC |
| remesh 12k tris | remesh | `01a14b65-dac4-730e-95f9-728b5a2ec829` | 5 | 2026-10-17 19:46 UTC |
| rigging 1.7 m | rigging | `01a14b67-c804-76f2-a5c3-699f245dfd3d` | 5 | 2026-10-17 19:47 UTC |

## Notes on the results

- homme: the prompt asked for a stylised low-poly look; Meshy returned realistic proportions and texture. The preview was made before this phase; its settings were read back from the task.
- femme: `--pose-mode a-pose` was passed and Meshy returned the generated open-palm pose; the braids were not honoured (loose curls) and a bomber jacket appeared where a tee was asked.
- Refine used 2k textures with PBR maps; the game uses the base colour only (1024 px JPEG; 512 px low-detail variants).
- Remesh to 12,000 triangles (triangle topology) before rigging, because the refined models have about 388k faces and Meshy rigging refuses more than 320k (a first rigging attempt on the homme was refused before it ran, no charge).
- Rigging heights: 1.75 m (homme), 1.70 m (femme); Meshy's walking and running clips are in the sources and are not used by the game (the game's own clips drive the transplanted body).
- Transformations applied by this repository: posed into the shared rig's rest pose, limbs fitted to its joints, shoes shortened to the gait's foot model, smooth normals (femme), optional 50% simplification (homme). Scripts: `scripts/meshy/`.
