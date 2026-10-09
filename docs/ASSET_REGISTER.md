# Asset register

Every asset has a row. **TEMP** = temporary, to be replaced or revised through the visual review process (design doc, Art direction and visual production). **Unreviewed** = cultural content not yet reviewed by Habib and wrestling practitioners. Nothing here has passed a visual review yet.

| Asset | Source | Origin / licence | Triangles | Status | Review |
| --- | --- | --- | --- | --- | --- |
| Hub buildings (facade boxes, arcades, roofs, parapets, tanks, dishes, AC units, shutters, balconies, gates) | `src/world/builder.ts` | Own code | merged, ~40–60k per hub (High), less on Low | TEMP | Not reviewed |
| Procedural seamless textures: paving, breeze block, floor tile, wood, metal, plaster | `src/world/textures.ts` (canvas, seeded) | Own code; colour maps only (no normal/roughness) | — | TEMP | Not reviewed; seams by construction (tile grid divides the canvas, wrapped speckle) |
| Higgsfield-generated textures in game: hollow cement blocks, sand, painted metal, paving, wood, asphalt, clay roof tiles, concrete, palm bark (desaturated detail maps); terracotta floor tiles, terrazzo, rusty corrugated tin (colour kept); trampled sand (neutralised); galvanized corrugated sheet (UV-mapped on the arena roof) | `public/assets/tex/*.jpg` from `assets-src/references/higgsfield/` (#11, #13, #15, #16, #19, #21, #25–29, #31, #49, #50) | Generated with Higgsfield (Nano Banana Pro), owned by Habib per Higgsfield terms (checked 7 Oct 2026); processing in `assets-src/references/PROVENANCE.md` | — | TEMP | Seam-checked; batch 3 textures remastered 8 Oct (`scripts/tex/remaster.py`: fewer visible repeats) and given shader relief (Medium/High); await Habib's review |
| Dibiterie (open front, tin awning, charcoal grill with smoke, butcher's counter, hanging meat, bench, tables, cook, butcher, customers) | `src/world/builder.ts` (`dibiterie`), Pikine and Plateau | Own code, guided by Higgsfield reference #10 | merged | TEMP | Not reviewed |
| Maïga interior and front (peeling walls, gas rings, dented pots, long oilcloth table, bench, wall fan, strip curtain) | `src/world/interiors.ts`, `src/world/builder.ts` | Own code, after Higgsfield reference #18 | ~1.5k | TEMP | Not reviewed |
| Arena exterior: open steel crowd barriers along the gate queue, vendors under parasols | `src/world/builder.ts` (`case 'arena'`) | Own code, after Higgsfield reference #24 | merged | TEMP | **Unreviewed** set-up |
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
| Arena ring side: white sandbag ring and traced line, blank sponsor boards, judges' chairs, officials' table and canopy, crowd barriers, bannered parapet, feather flags | `src/world/builder.ts` | Own code, after Habib's arena photos (7 Oct; not stored) | merged, ~10k | TEMP | **Unreviewed** layout |
| Géew stands and roof: three raised tiers (1.1 / 2.0 / 2.9 m, one level only), worn seat edges, roof on columns along the outer wall with cantilever beams and struts, painted fascia; gate left open | `src/world/builder.ts`, dimensions in `src/world/geew.ts` | Own code; placeholder colours (concrete, sheet metal), no credits spent; batch-3 textures since 8 Oct (concrete tiers, galvanized roof sheets, trampled sand); Habib's arena photos used as visual references only | merged, ~3k | TEMP | **Unreviewed** — photos are not a cultural validation of the arena |
| Shop signs (canvas text) | `src/world/batch.ts` | Own code; fictional shop names | 2 per sign | TEMP | Not reviewed |
| City player, cast and crowd (boxes) — fallback only when the GLB fails to load | `src/actors/character.ts` | Own code | ~200 each | TEMP | Not reviewed |
| **Vehicle kit** — shared materials (one vertex-coloured body material with a painted atlas whose emissive map lights the lamps at night, one tinted-glass material, one additive headlight-beam material shown only at night) and the 1024 × 512 paint atlas (lamps, rims, grilles, plates without real characters, liveries) | `src/actors/vehicleKit.ts`, `src/actors/vehicleAtlas.ts`, `src/world/kitGeometry.ts` | Own code (procedural, 9 Oct 2026); every name and decoration invented | — | TEMP | Not reviewed |
| Car rapide (kit): Saviem/SG2-style van of our own design — blue skirt, yellow body, chevron band, white pinstripe, blue waist, geometric frieze, rear quarter art (flowers and birds / fish and waves / painted eye), painted nose with V stripes and round lamps, chrome bumper and bull-bar, open window band with sliding glass and passengers, open rear doorway with the apprentice's step, swung-open door, ladder, roof rack with luggage (3 layouts), fictional nickname boards TERANGA / NDANK NDANK / JÀMM. **No religious inscription, no crescent** (the previous procedural model's ALHAMDOULILAH and crescent are gone) | `src/actors/vehicleKit.ts` (`carRapide`) | Own code; colours and proportions guided by Habib's references and Higgsfield #38/#39/#48 (references only) | near 1.97–2.07k, far 114; 2 draw calls by day, 3 at night | TEMP until a reviewed Blender GLB (the GLB still takes over when `public/assets/car_rapide.glb` exists) | **Unreviewed** motifs and Wolof nicknames |
| Car rapide apprentice (stands at the open rear door calling destinations in a speech bubble; rides the rear step on moving cars) | `src/actors/apprenti.ts` | Own code; destination calls are real Dakar neighbourhoods, list provisional | humanoid | TEMP | **Unreviewed** calls and gestures |
| City bus « SAMA BUS » (fictional line; white, blue skirt, yellow-green swoosh evoking a Dakar city bus by colours only), glazed sides with seated passengers, two right-hand doors, amber destination boards lit at night (8 PIKINE / 15 PLATEAU / 23 PARCELLES), roof AC unit | `src/actors/vehicleKit.ts` (`bus`) | Own code | near 2.25–2.33k, far 80; 2 / 3 draw calls | TEMP | Not reviewed |
| Taxi (yellow and black Dakar taxi: black roof, black bonnet and boot on the older variant, roof sign « TAXI », steel rims) | `src/actors/vehicleKit.ts` (`taxi`) | Own code | near 740–780, far 88; 2 / 3 | TEMP | Not reviewed |
| Jakarta-style motorbike (125 cc) and scooter, rider with or without helmet, sometimes a pillion; parked variant on its side stand | `src/actors/vehicleKit.ts` (`moto`) | Own code; no make or badge | near 686–1,076 (with riders), far 64; 1 / 2 | TEMP | Not reviewed |
| Private cars: sedan, 4×4 (roof rails, spare wheel, optional bull-bar), luxury saloon (chrome grille and trims, alloy rims), pickup (bed with load: sacks, jerrycans or empty; passengers on the bed rails) | `src/actors/vehicleKit.ts` (`sedan`, `suv`, `luxury`, `pickup`) | Own code; invented shapes, no manufacturer badge | near 726–962, far 78–142; 2 / 3 | TEMP | Not reviewed |
| Truck (cab-over lorry, slatted body painted in stripes, red rims, sacks or tarp load, painted board « DAKAR · THIÈS ») | `src/actors/vehicleKit.ts` (`truck`) | Own code | near 774–894, far 80; 2 / 3 | TEMP | Not reviewed |
| **Furniture kit** — 19 types × basic / better / premium, one shared material + one glass material, 512 × 512 atlas (wax-style prints, woven and plastic mats, rugs, prayer mats with a plain arch and geometric borders and no text, abstract TV pictures, mirror, tiles, marble, display cabinet with tea glasses and plates) | `src/world/furnitureKit.ts`, `src/world/furnitureAtlas.ts` | Own code (procedural, 9 Oct 2026); no brand or real product | per piece below; 1 draw call (2 for the glass shower and glass table) | TEMP | **Unreviewed** tiers and layout |
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

Higgsfield references and textures (batches 1–3, the Maïga, a texture redo and làmb arena views, 7–8 Oct; 100 credits) are stored in `assets-src/references/higgsfield/`, logged in `assets-src/references/PROVENANCE.md`; batches 1 and 2 are validated by Habib, the later ones are not reviewed yet. The textures listed in the rows above are used in the game; the rest are modelling and colour references (#39: use `39_car_rapide_front_rear_clean.jpg`, badge removed). Every generated image is logged in `assets-src/references/PROVENANCE.md` (prompt, model, cost, date, job id) and labelled an artistic interpretation.

## Kit budgets (9 Oct 2026, `src/actors/vehicleKit.ts`, `src/world/furnitureKit.ts`)

Triangles measured by the unit tests over seeds 1–6 (`tests/vehicleKit.test.ts`, `tests/furnitureKit.test.ts`).
Draw calls: day / night (the headlight beam only renders at night). The far model replaces the near one beyond the
LOD distance (× 0.6 on Low, × 0.85 on Medium quality).

| Vehicle | Near tris | Far tris | Draw calls | LOD (m) | Seats | Doors |
| --- | --- | --- | --- | --- | --- | --- |
| Car rapide | 1,974–2,074 | 114 | 2 / 3 | 60 | 14 (driver, 2 cab, 11 bench) | rear (open), driver, cab |
| Bus | 2,252–2,332 | 80 | 2 / 3 | 70 | 39 | front, middle |
| Taxi | 740–780 | 88 | 2 / 3 | 40 | 5 | 4 doors |
| Moto | 686–1,076 | 64 | 1 / 2 | 32 | 2 + handlebar grips | left |
| Sedan | 726–766 | 78 | 2 / 3 | 40 | 5 | 4 doors |
| 4×4 | 874–962 | 142 | 2 / 3 | 40 | 5 | 4 doors |
| Luxury | 764–804 | 78 | 2 / 3 | 40 | 5 | 4 doors |
| Pickup | 806–866 | 112 | 2 / 3 | 40 | 2 + 4 on the bed | 2 doors, tailgate |
| Truck | 774–894 | 80 | 2 / 3 | 60 | 3 | 2 doors |

Before the kit: old taxi 7 meshes / 3 materials / 84 tris; old car rapide 5 meshes / 4 materials / 1,916 tris.

| Furniture (tris) | Basic | Better | Premium |
| --- | --- | --- | --- |
| Bed | Natte et matelas mousse 48 | Lit en bois 110 | Grand lit sculpté 400 |
| Sofa | Banquette en bois 148 | Canapé en tissu 162 | Canapé de salon en velours 368 |
| Armchair | Fauteuil en bois 104 | Fauteuil rembourré 118 | Fauteuil de salon doré 324 |
| Plastic chair | Chaise en plastique 70 | Fauteuil en plastique 118 | Chaise en résine tressée 130 |
| Wooden chair | Chaise en bois brut 92 | Chaise vernie 178 | Chaise sculptée 150 |
| Table | Petite table et toile cirée 136 | Table en bois verni 250 | Table en verre 252 + glass |
| Low table | Petite table basse 52 | Table basse 76 | Table basse sculptée 116 |
| Desk (with its chair) | Planche sur tréteaux 136 | Bureau en bois 240 | Grand bureau 290 |
| TV | Petite télé cathodique 64 | Télé écran plat 102 | Grand écran et meuble 270 |
| Wardrobe | Armoire en toile 72 | Armoire deux portes 70 | Grande armoire à miroir 90 |
| Shower | Coin douche au seau 242 | Douche carrelée 182 | Cabine de douche vitrée 400 + glass |
| Kitchen corner | Coin cuisine au réchaud 412 | Plan de cuisine 260 | Cuisine équipée 770 |
| Fan | Petit ventilateur 144 | Ventilateur sur pied 136 | Ventilateur colonne 198 |
| Rug | Natte en plastique 12 | Tapis tissé 12 | Grand tapis épais 292 |
| Lamp | Lampe rechargeable 46 | Lampe de chevet 172 | Lampadaire doré 242 |
| Shelf | Étagère en planches 216 | Bibliothèque 130 | Vitrine de salon 448 |
| Mirror | Petit miroir 44 | Miroir encadré 56 | Grand miroir sur pied 54 |
| Attaya set (with stool) | Attaya au fourneau 344 | Attaya au gaz 450 | Grand service à attaya 548 |
| Prayer mat | Tapis de prière simple 12 | Tapis de prière tissé 12 | Tapis de prière en velours 172 |

Every piece has a `use` anchor (where the person stands, sits or lies, facing, verb, label, clip) and its seats.
Captures: `docs/screenshots/assets/` (`node scripts/shots-assets.mjs`).
