# Asset register

Every asset has a row. **TEMP** = temporary, to be replaced or revised through the visual review process (design doc, Art direction and visual production). **Unreviewed** = cultural content not yet reviewed by Habib and wrestling practitioners. Nothing here has passed a visual review yet.

| Asset | Source | Origin / licence | Triangles | Status | Review |
| --- | --- | --- | --- | --- | --- |
| Hub buildings (facade boxes, arcades, roofs, parapets, tanks, dishes, AC units, shutters, balconies, gates) | `src/world/builder.ts` | Own code | merged, ~40–60k per hub (High), less on Low | TEMP | Not reviewed |
| Procedural seamless textures: paving, breeze block, floor tile, wood, metal, plaster | `src/world/textures.ts` (canvas, seeded) | Own code; colour maps only (no normal/roughness) | — | TEMP | Not reviewed; seams by construction (tile grid divides the canvas, wrapped speckle) |
| Higgsfield-generated textures in game: breeze block, sand, painted metal (desaturated detail maps), terracotta floor tiles | `public/assets/tex/*.jpg` from `assets-src/references/higgsfield/` #12, #13, #16, #15 | Generated with Higgsfield (Nano Banana Pro), owned by Habib per Higgsfield terms (checked 7 Oct 2026); processing in `assets-src/references/PROVENANCE.md` | — | TEMP | Seam-checked 3×3; textures await Habib's review |
| Dibiterie (open front, tin awning, charcoal grill with smoke, butcher's counter, hanging meat, bench, tables, cook, butcher, customers) | `src/world/builder.ts` (`dibiterie`), Pikine and Plateau | Own code, guided by Higgsfield reference #10 | merged | TEMP | Not reviewed |
| Maïga interior and front (peeling walls, gas rings, dented pots, long oilcloth table, bench, wall fan, strip curtain) | `src/world/interiors.ts`, `src/world/builder.ts` | Own code, after Higgsfield reference #18 | ~1.5k | TEMP | Not reviewed |
| Arena additions: wire fence, officials' canopies with tables, chairs and drums, crowd barriers, vendors at the gate | `src/world/builder.ts` (`case 'arena'`) | Own code, after Higgsfield references #22–24 | merged | TEMP | **Unreviewed** set-up |
| Higgsfield textures v2 in game: paving (sidewalks, plazas), wood planks (interior furniture) | `public/assets/tex/paving.jpg`, `wood.jpg` from #21, #19 (seam-fixed) | Generated with Higgsfield; processing in PROVENANCE.md | — | TEMP | Seam-checked 3×3 |
| Surface grain and night-window shader | `src/world/grain.ts` | Own code | — | TEMP | Not reviewed |
| Sky dome | `src/world/sky.ts` | Own code | 960 | TEMP | Not reviewed |
| Interiors: starter room, gargote (furniture, pots, fridge, fan, ataya set, prayer mat) | `src/world/interiors.ts` | Own code; generic wax-style prints of own design; menu board text authored in code | ~2k each | TEMP | **Unreviewed** layout and furnishing |
| Monument de la Renaissance africaine (natural hill, straight stair with parapets/railings/lamps, rock base and slab, bronze group) | `src/world/builder.ts` (`case 'monument'`) | Own code, modelled after reference photos supplied by Habib (7 Oct 2026; photos not stored, rights unknown) | merged | TEMP, stylised and scaled down | Pose and proportions follow the photos; not yet reviewed in game by Habib |
| Corniche Ouest: dual carriageway with concrete median and orange double-arm lamps, whitewashed palms, red promenade under yellow tubular railings and arches, grass verge | `src/world/builder.ts` (`sp.sea === 'west'`) | Own code, after Habib's reference photos | merged | TEMP | Not reviewed. (The earlier invented A-frame arch was removed; the Porte du Troisième Millénaire is not built — needs a photo) |
| Plateau towers (11–18 storeys, glazed stair core, antennas) and red clay hipped roofs | `src/world/builder.ts` | Own code, after Habib's aerial photo of the Plateau | merged | TEMP | Not reviewed |
| Monument life: joggers on the stair, training on the summit, festive groups with drummers, canopies, speakers, bunting | `src/actors/life.ts`, `src/world/builder.ts` | Own code; dance and drumming clips are placeholders | humanoids | TEMP | **Unreviewed** (dances, drumming) |
| Trees (neem/flamboyant style), palms, bougainvillea, street stalls | `src/world/builder.ts` | Own code | merged | TEMP | Not reviewed |
| Facade window texture | `src/world/batch.ts` (canvas) | Own code | — | TEMP | Not reviewed |
| Props: palms, lamp posts, stalls, awnings, pier, boats | `src/world/builder.ts` | Own code | merged | TEMP | Not reviewed |
| Landmarks: mosque, monument, arena (with gate), écurie, gym, pitch | `src/world/builder.ts` | Own code | merged | TEMP | Not reviewed |
| Shop signs (canvas text) | `src/world/batch.ts` | Own code; fictional shop names | 2 per sign | TEMP | Not reviewed |
| City player, cast and crowd (boxes) — fallback only when the GLB fails to load | `src/actors/character.ts` | Own code | ~200 each | TEMP | Not reviewed |
| Car rapide (procedural v3 after Habib's references: indigo/white/yellow body, rounded roof front, short bonnet, yellow roof rack with luggage, ladder, open rear door, step; painted panels drawn in code: TRANSPORT EN COMMUN, diamond, fish, birds, stars, crescent, flag stripes, eyes, ALHAMDOULILAH) | `src/actors/vehicles.ts` | Own code; reference images supplied by Habib (not stored) | ~1.5k + 4 decal quads, shared | TEMP until a Blender model | **Unreviewed** motifs and lettering |
| Car rapide apprentice (stands at the open rear door calling destinations in a speech bubble; rides the rear step on moving cars) | `src/actors/apprenti.ts` | Own code; destination calls are real Dakar neighbourhoods, list provisional | humanoid | TEMP | **Unreviewed** calls and gestures |
| Taxi | `src/actors/vehicles.ts` | Own code | ~100 | TEMP | Not reviewed |
| **Character v4 (shared humanoid)** | `assets-src/character_rig_v4.blend` → `public/assets/character_v4.glb` | Own work, Blender 5.2 via MCP for Blender, 6 Oct 2026 | body 1.9k, head 2k, garments 0.2–2.3k each | TEMP | Not reviewed |
| Character v4 garments: tee, trousers, shorts, shoes, dress top + skirt, grand boubou, kufi, headwrap; hair short/puff; beard | character GLB | Own work | see above | TEMP | Not reviewed |
| Character v4 body shapes: Female, Muscular, Heavy (morph targets shared by body and fitted garments) | character GLB | Own work | — | TEMP | Not reviewed |
| **Wrestler rig v1** (superseded by v4) | `assets-src/wrestler_rig_v1.blend` → `public/assets/wrestler_v1.glb` | Own work, made in Blender 5.2 via MCP for Blender, 6 Oct 2026 | body 370; ngemb A 52, B 64 | TEMP | Not reviewed; deformation in grabs/falls to check in paired animations |
| Ngemb cuts A and B, colours, patterns | wrestler GLB + `src/lamb/look.ts` | Own work | in rig | TEMP | **Unreviewed** |
| Accessory sockets (armL, armR, waist, neck) and placeholder items | wrestler GLB + `src/lamb/look.ts` | Own work | <100 | TEMP | **Unreviewed** (placeholders, no real gris-gris) |
| Clips: Idle, Walk, Stance, Grab, Fall_Back | wrestler GLB | Own work | — | TEMP | Not reviewed |
| Clips: Dance_A, Dance_B, Celebrate, Prep, Entrance_Walk | wrestler GLB | Own work, placeholder motion | — | TEMP | **Unreviewed** |
| Procedural poses for box characters (dance, drill, drums, crowd) | `src/lamb/poses.ts` | Own code, placeholder motion | — | TEMP | **Unreviewed** |
| Percussion and crowd sound | `src/lamb/audio.ts` (WebAudio synthesis) | Own code, generic pattern | — | TEMP | **Unreviewed** |

Wrestler rig v1: 20 bones (root, hips, spine, chest, neck, head, shoulders, upper arms, forearms, hands, thighs, shins, feet), rigid-segment skinning with 50/50 blending at joints, socket empties parented to bones. Next: a continuous body mesh, hands and face, paired grab/throw animations, clipping checks from the combat camera on in-game footage.

No AI-generated images are in the game yet. Higgsfield references and textures (batches 1 and 2, the Maïga, a texture redo and làmb arena views, 7 Oct) are stored in `assets-src/references/higgsfield/` as modelling and colour references only, logged in `assets-src/references/PROVENANCE.md`; batches 1 and 2 are validated by Habib, the later ones are not reviewed yet, and none is used in the game yet. Every generated image is logged in `assets-src/references/PROVENANCE.md` (prompt, model, cost, date, job id) and labelled an artistic interpretation.
