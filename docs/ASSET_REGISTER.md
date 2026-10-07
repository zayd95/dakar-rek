# Asset register

Every asset has a row. **TEMP** = temporary, to be replaced or revised through the visual review process (design doc, Art direction and visual production). **Unreviewed** = cultural content not yet reviewed by Habib and wrestling practitioners. Nothing here has passed a visual review yet.

| Asset | Source | Origin / licence | Triangles | Status | Review |
| --- | --- | --- | --- | --- | --- |
| Hub buildings (facade boxes, arcades, roofs, parapets, tanks, dishes, AC units, shutters, balconies, gates) | `src/world/builder.ts` | Own code | merged, ~40–60k per hub (High), less on Low | TEMP | Not reviewed |
| Procedural seamless textures: paving, breeze block, floor tile, wood, metal, plaster | `src/world/textures.ts` (canvas, seeded) | Own code; colour maps only (no normal/roughness) | — | TEMP | Not reviewed; seams by construction (tile grid divides the canvas, wrapped speckle) |
| Surface grain and night-window shader | `src/world/grain.ts` | Own code | — | TEMP | Not reviewed |
| Sky dome | `src/world/sky.ts` | Own code | 960 | TEMP | Not reviewed |
| Interiors: starter room, gargote (furniture, pots, fridge, fan, ataya set, prayer mat) | `src/world/interiors.ts` | Own code; generic wax-style prints of own design; menu board text authored in code | ~2k each | TEMP | **Unreviewed** layout and furnishing |
| Trees (neem/flamboyant style), palms, bougainvillea, street stalls | `src/world/builder.ts` | Own code | merged | TEMP | Not reviewed |
| Facade window texture | `src/world/batch.ts` (canvas) | Own code | — | TEMP | Not reviewed |
| Props: palms, lamp posts, stalls, awnings, pier, boats | `src/world/builder.ts` | Own code | merged | TEMP | Not reviewed |
| Landmarks: mosque, monument, arena (with gate), écurie, gym, pitch | `src/world/builder.ts` | Own code | merged | TEMP | Not reviewed |
| Shop signs (canvas text) | `src/world/batch.ts` | Own code; fictional shop names | 2 per sign | TEMP | Not reviewed |
| City player, cast and crowd (boxes) — fallback only when the GLB fails to load | `src/actors/character.ts` | Own code | ~200 each | TEMP | Not reviewed |
| Car rapide (Blender v1, baked AO) | `assets-src/vehicles_v1.blend` → `car_rapide.glb` | Own work, 7 Oct 2026 | 3.8k | TEMP | **Unreviewed** (paint scheme) |
| Sedan / taxi + decimated parked copy | `vehicles_v1.blend` → `sedan.glb`, `sedan_low.glb` | Own work, 7 Oct 2026 | 2.3k / 0.47k | TEMP | Not reviewed |
| Street props: lamp post, power pole, bench, drum bin | `assets-src/props_v1.blend` → `props.glb` | Own work, 7 Oct 2026 | 50–380 each | TEMP | Not reviewed |
| Wires, parked cars, canopies, palm fronds, road textures, facade atlas, clouds | `src/world/*` | Own code | — | TEMP | Not reviewed |
| **Character v5 (shared humanoid)** | `assets-src/character_rig_v5.blend` → `public/assets/character_v5.glb` | Own work, Blender 5.2 via MCP for Blender, 6–7 Oct 2026; baked AO in vertex colours | body 1.7k, head 2k, hands 1.4k, garments 0.2–2.6k each | TEMP | Not reviewed |
| Character v5 garments: tee, trousers, shorts, shoes, dress top + skirt, grand boubou (rebuilt 7 Oct: draped sleeves, flared robe), kufi, headwrap; hair short/puff; beard | character GLB | Own work | see above | TEMP | Not reviewed |
| Garment prints and embroidery (wax, stripes, bazin damask, boubou collar/chest chevrons/hem bands) | `src/actors/humanoid.ts` (canvas) | Own designs, generic | — | TEMP | **Unreviewed** (embroidery motifs) |
| Character v5 body shapes: Female, Muscular, Heavy (morph targets shared by body and fitted garments) | character GLB | Own work | — | TEMP | Not reviewed |
| **Wrestler rig v1** (superseded by v4) | `assets-src/wrestler_rig_v1.blend` → `public/assets/wrestler_v1.glb` | Own work, made in Blender 5.2 via MCP for Blender, 6 Oct 2026 | body 370; ngemb A 52, B 64 | TEMP | Not reviewed; deformation in grabs/falls to check in paired animations |
| Ngemb cuts A (brief with rolled waist) and B (thicker roll, back knot and two tails), colours, patterns | character v5 GLB + `src/lamb/look.ts` | Own work, rebuilt 7 Oct from the body surface | A 0.6k, B 0.9k | TEMP | **Unreviewed** |
| Accessory sockets (armL, armR, waist, neck) and placeholder items | wrestler GLB + `src/lamb/look.ts` | Own work | <100 | TEMP | **Unreviewed** (placeholders, no real gris-gris) |
| Clips: Idle, Walk, Stance, Grab, Fall_Back | wrestler GLB | Own work | — | TEMP | Not reviewed |
| Clips: Dance_A, Dance_B, Celebrate, Prep, Entrance_Walk | wrestler GLB | Own work, placeholder motion | — | TEMP | **Unreviewed** |
| Procedural poses for box characters (dance, drill, drums, crowd) | `src/lamb/poses.ts` | Own code, placeholder motion | — | TEMP | **Unreviewed** |
| Percussion and crowd sound | `src/lamb/audio.ts` (WebAudio synthesis) | Own code, generic pattern | — | TEMP | **Unreviewed** |

Wrestler rig v1: 20 bones (root, hips, spine, chest, neck, head, shoulders, upper arms, forearms, hands, thighs, shins, feet), rigid-segment skinning with 50/50 blending at joints, socket empties parented to bones. Next: a continuous body mesh, hands and face, paired grab/throw animations, clipping checks from the combat camera on in-game footage.

No AI-generated images are in the game or the repository yet. When they are added, each one is logged in `assets-src/references/PROVENANCE.md` (prompt, model, cost, date, job id) and labelled an artistic interpretation.
