# Asset register

Every asset has a row. **TEMP** = temporary, to be replaced or revised through the visual review process (design doc, Art direction and visual production). **Unreviewed** = cultural content not yet reviewed by Habib and wrestling practitioners. Nothing here has passed a visual review yet.

| Asset | Source | Origin / licence | Triangles | Status | Review |
| --- | --- | --- | --- | --- | --- |
| Hub buildings (facade boxes, arcades, roofs) | `src/world/builder.ts` | Own code | merged, ~15–30k per hub | TEMP | Not reviewed |
| Facade window texture | `src/world/batch.ts` (canvas) | Own code | — | TEMP | Not reviewed |
| Props: palms, lamp posts, stalls, awnings, pier, boats | `src/world/builder.ts` | Own code | merged | TEMP | Not reviewed |
| Landmarks: mosque, monument, arena (with gate), écurie, gym, pitch | `src/world/builder.ts` | Own code | merged | TEMP | Not reviewed |
| Shop signs (canvas text) | `src/world/batch.ts` | Own code; fictional shop names | 2 per sign | TEMP | Not reviewed |
| City player, cast and crowd (boxes) | `src/actors/character.ts` | Own code | ~200 each | TEMP | Not reviewed |
| Car rapide, taxi | `src/actors/vehicles.ts` | Own code | ~100–120 | TEMP | Not reviewed |
| **Wrestler rig v1** | `assets-src/wrestler_rig_v1.blend` → `public/assets/wrestler_v1.glb` | Own work, made in Blender 5.2 via MCP for Blender, 6 Oct 2026 | body 370; ngemb A 52, B 64 | TEMP | Not reviewed; deformation in grabs/falls to check in paired animations |
| Ngemb cuts A and B, colours, patterns | wrestler GLB + `src/lamb/look.ts` | Own work | in rig | TEMP | **Unreviewed** |
| Accessory sockets (armL, armR, waist, neck) and placeholder items | wrestler GLB + `src/lamb/look.ts` | Own work | <100 | TEMP | **Unreviewed** (placeholders, no real gris-gris) |
| Clips: Idle, Walk, Stance, Grab, Fall_Back | wrestler GLB | Own work | — | TEMP | Not reviewed |
| Clips: Dance_A, Dance_B, Celebrate, Prep, Entrance_Walk | wrestler GLB | Own work, placeholder motion | — | TEMP | **Unreviewed** |
| Procedural poses for box characters (dance, drill, drums, crowd) | `src/lamb/poses.ts` | Own code, placeholder motion | — | TEMP | **Unreviewed** |
| Percussion and crowd sound | `src/lamb/audio.ts` (WebAudio synthesis) | Own code, generic pattern | — | TEMP | **Unreviewed** |

Wrestler rig v1: 20 bones (root, hips, spine, chest, neck, head, shoulders, upper arms, forearms, hands, thighs, shins, feet), rigid-segment skinning with 50/50 blending at joints, socket empties parented to bones. Next: a continuous body mesh, hands and face, paired grab/throw animations, clipping checks from the combat camera on in-game footage.
