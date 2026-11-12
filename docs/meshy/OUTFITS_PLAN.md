# Player outfits and hairstyles: plan

Decided: the starting identity (Homme / Femme) is permanent, forces no career, and is a body. Everyday, Office, Sport and Prestige are **clothing styles of that identity, not separate characters**. Reuse before generating. **Never pretend baked clothing is interchangeable.** No Meshy credit is spent by this document.

## 1. What the two bodies really are

| Fact | Evidence |
|---|---|
| Each Meshy body is **one fused shell**: skin, clothes, shoes and hair are one connected surface of 12.5 k triangles (the 12 k remesh welded them). | `proof/meshy/components.mjs` on both `remesh_12k.glb`: **1 connected piece** each |
| So a garment or a hairstyle cannot be taken off, swapped or hidden on them. Clothes and hair are texture and shape, baked. | same |
| Each body is exactly one outfit: Homme = blue tee, black jeans, black sneakers, beard, short hair; Femme = khaki bomber over a yellow tee, jeans, white sneakers, locs, hoop earrings. That is the **Everyday** of each identity. | `public/assets/meshy/body_m.glb`, `body_f.glb` |
| The old body (v4) is the opposite: separate fitted garment meshes (`Cloth_Tee`, `Cloth_Trousers`, `Cloth_Boubou`, `Cloth_DressTop`, `Cloth_Skirt`, `Cloth_Kufi`, `Cloth_Headwrap`, `Cloth_Shoes`, `Hair_Short`, `Hair_Puff`, `Beard`) following one set of body morphs. They fit v4's body only: they cannot be put over a Meshy body (they would sit inside or poke through the baked clothes, and the baked ones cannot be removed). | `src/actors/humanoid.ts` `CLOTH`, `PersonLook` |

Consequence: **a different garment on a Meshy identity is a different texture set or a different body file, never a layer.**

## 2. What is possible, by tier

| Tier | What the player gets | How | Cost | Honest limit |
|---|---|---|---|---|
| **A. Everyday** | the baked look of the identity | shipped | none | the only real outfit today |
| **B. Colourways of Everyday** | the same garments in other colours (tee, jacket) | build-time recolour of the base-colour texture, one extra 1024 px JPEG (~150 kB) per colourway, swapped at runtime on the same mesh (`scripts/meshy/colourway.mjs`; picture: `docs/meshy/proof/outfits/colourways.jpg`) | free | colours only, never a new garment. Works well on a plain garment (the homme's tee), less well on a textured one (the femme's jacket comes out mottled); dark denim and skin are left alone by a value and saturation key |
| **C. Attachments** | cap, scarf, small flag, glasses, watch, bag, headwrap | small meshes on the existing sockets (`socket_neck`, hands, head) with a per-body fit like `BODY_FIT.scarfDrop`; the scarf and flag already work on both bodies | free (procedural meshes) | they sit over the baked hair and clothes; a cap hides nothing of the baked hair, so it must be a little larger than each head's hair volume (a fit value per body). The supporter **cap and tee** bought today at the stall do nothing on a Meshy body: decide: hide them for Meshy identities or add the cap here |
| **D. Outfit texture sets** (Office, Sport) | other clothes of the **same silhouette** | Meshy `retexture` of the existing mesh with `--input-task-id` and `--enable-original-uv true` (keeps mesh, UVs, rig: the transplant, hands and grip build run unchanged), one texture set per outfit | **credits, estimate not yet known** (the CLI quotes before spending: I will report it, and nothing runs without approval) | the silhouette stays: a tee can become a shirt, jeans can become trousers; **shorts, a boubou, a suit jacket or a robe cannot** (legs and cuffs keep their shape). Hair, face and shoes' shape do not change |
| **E. Alternate bodies** (Prestige, anything with a new silhouette) | a real different garment | a new Meshy body of the same face brief, then the existing pipeline (transplant → hands → grip → previews: `scripts/meshy/build-bodies.mjs`) | observed price of one body: **40 credits** (20 + 10 + 5 + 5); six bodies = 240 of the 940 | a new generation is **not** guaranteed to keep the face: identity continuity has to be checked before it ships. Needs approval with the usual sheet (purpose, cost, output, reuse, acceptance) |

**Hairstyles.** The hair is baked in the fused shell (§ 1), so a hairstyle swap is not available on the current heads at any tier. What is possible: (1) hair **colour** by a hue key on the texture (free, same limits as tier B, dark hair only shifts a little); (2) headwear (tier C); (3) later, a hairless head plus separate hair meshes, which means new generations of both (tier E), or procedural hair cards (art work, free of credits). I do not promise styles that the files cannot carry.

**The Meshy assets you already own** (2 male, 3 female, a Jakarta): the API account reachable from here lists **only our two characters** (read-only listing, balance still 940), so I cannot inventory the others. If they are exported (GLB or task ids and their workspace) they can be used, in this order of preference: (a) as **image-style references** for tier D retextures (`--image-style-url`: cost only the retexture), (b) as **named NPC bodies** (phase 2, same pipeline, rigging 5 credits each if not rigged), (c) as extra identities only if you want more than two (they are other faces: that changes « permanent identity », so it is a product decision, not an outfit).

## 3. Data model (save v5 additive, no schema change)

* `SaveData.avatar` (done): the identity, permanent.
* `SaveData.outfit?: string | null` (to add): the worn outfit id, default `null` = Everyday. Unknown id, unowned outfit or missing file → Everyday, never an error (same fallback chain as `loadPlayerBody`).
* A registry (`src/actors/outfits.ts`, to add): `{ id, style: 'everyday' | 'office' | 'sport' | 'prestige', identity: Avatar, kind: 'baked' | 'colourway' | 'texture' | 'body', file, label, price? }`. A colourway or texture set is a texture swap on the loaded body (cheap, no new mesh); only a `body` kind loads another GLB. The four **styles** are the shop's categories, not four characters.
* Owned outfits are goods: the existing asset model (`buyAsset`, « Biens »), a « Garde-robe » shop recipe, prices on the economy ladder; Prestige gated by wealth. Purely cosmetic: no stat, no reward, no career.
* Others online keep seeing the standard look (no protocol change) until a later, approved presence change.
* Attachments are items in the same way (`WEAR`-like), worn independently of the outfit.

## 4. Phases

1. **Now (done):** two identities, permanent, no career, preview package.
2. **Free, next:** outfit registry and save field; colourways (tier B) for both bodies, a wardrobe sheet reusing the phone UI, supporter cap decision; attachments with per-body fit (tier C). Acceptance: switching colourway or attachment is instant, survives reload, falls back to Everyday on any missing file, adds < 200 kB per colourway, idle/gait/ride unchanged.
3. **Needs your approval and a quote:** tier D retextures (Office, Sport) on the existing meshes: one test retexture first, judged on silhouette, face and hands before more.
4. **Only if wanted:** tier E bodies (Prestige), after the 240-credit sheet is approved; or your exported assets as references/NPCs.

## 5. What I need from you

* The GLBs (or task ids and workspace) of the other characters and the Jakarta, if you want them used.
* Which of: hide the supporter cap/tee for Meshy identities, or add the cap as an attachment.
* A go/no-go on a single test retexture once its quote is shown.
