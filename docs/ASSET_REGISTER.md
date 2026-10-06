# Asset register

Every asset has a row. **TEMP** = temporary procedural placeholder, built in code, to be replaced through the visual review process (see design doc, Art direction and visual production). Nothing here has passed a visual review yet.

| Asset | Source | Origin / licence | Triangles | Status | Review |
| --- | --- | --- | --- | --- | --- |
| Hub buildings (facade boxes, arcades, roofs) | `src/world/builder.ts` | Own code | merged, ~5–15k per hub | TEMP | Not reviewed |
| Facade window texture | `src/world/batch.ts` (canvas) | Own code | — | TEMP | Not reviewed |
| Props: palms, lamp posts, stalls, awnings, pier, boats | `src/world/builder.ts` | Own code | merged | TEMP | Not reviewed |
| Landmarks: mosque, monument, arena, écurie, gym, pitch | `src/world/builder.ts` | Own code | merged | TEMP | Not reviewed |
| Shop signs (canvas text) | `src/world/batch.ts` | Own code; fictional shop names | 2 per sign | TEMP | Not reviewed |
| Player and NPC character (boxes) | `src/actors/character.ts` | Own code | ~200 | TEMP | Not reviewed |
| Car rapide | `src/actors/vehicles.ts` | Own code | ~120 | TEMP | Not reviewed |
| Taxi | `src/actors/vehicles.ts` | Own code | ~100 | TEMP | Not reviewed |

## Blender asset kit (planned)

First Blender targets, in order: car rapide, rigged player character, modular building kit. Each becomes a `.blend` source plus a compressed GLB, a register row, and in-game screenshots on phone and desktop (day and night) before being accepted.
