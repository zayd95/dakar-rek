# Visual pass — 7 October 2026

Before = `main` (v0.2, the published preview). After = this pass. Images in `docs/screenshots/visual-pass/` are
real in-game captures (headless Chromium + SwiftShader) from **identical player positions and camera yaw**
(`scripts/compare.mjs`). Building colours and props differ between the two because the extra props change the
random sequence that lays out each hub; the street grid, the camera and the player position are the same.

No generated images were used: Higgsfield could not be signed in from the cloud session (see `HIGGSFIELD_PLAN.md`).
Every texture here is procedural, written in code.

## What changed

| Area | Change |
| --- | --- |
| Rendering | ACES tone mapping; sky dome (zenith gradient, dust haze band, sun disc and glow, stars at night); fog takes the horizon colour; warmer sun with a south lean so facades get raking light; cool moonlight at night |
| Surfaces | World-space procedural grain on ground, plaster and facades; seamless procedural textures: concrete paving (Plateau, Corniche, Almadies sidewalks and plazas), raw breeze blocks (40 % of Pikine yard walls), floor tiles, wood, weathered metal, interior plaster |
| Night | Only some windows lit, at varying brightness, a few with cool fluorescent light; light pools under street lamps; shop signs faintly lit |
| Streets | Narrower sidewalks with kerbs, road markings only between intersections, zebra crossings (not in Pikine), sand drifts in Pikine, lamp posts with arms over the road, neem and flamboyant-style shade trees, better palms, street vendors with parasols |
| Buildings | Dusty plinth band, cornice, parapets, water tanks, satellite dishes, stair heads, washing lines, split AC units, ground-floor boutiques with metal shutters and painted boards, student-block balconies with railings and laundry, Pikine yard walls with coping and coloured metal gates, villas with terraces, pool decks and bougainvillea |
| Signs | Shop signs flush on the facade between awning and roof (were floating, oversized and tilted above roofs) |
| Landmarks | Arena: sand floor, sandbag ring, three-tier stands matching the crowd tiers, painted wall with banners, entrance arch, four floodlight masts. Station: two car rapides, shelter, stalls, trees. Market, mosque, gym, monument, port details |
| Car rapide | New procedural model (TEMP until the Blender asset): yellow and blue body, white roof, window row, roof rack with luggage, rear ladder and step, painted panels; one shared mesh |
| Characters | Light band on the T-shirt fixed: runtime clothing materials are now double-sided like the Blender materials |
| Ground level | Walkable slabs lowered so feet no longer sink into the arena sand and sidewalks |
| Interiors (new) | Walkable starter room (“Ma chambre”) and gargote interiors, entered through an **Entrer** action; room camera; ceiling light; bed and washing actions in the room, ordering at the gargote counter |

## Performance (headless, not a phone)

SwiftShader renders on the CPU, so absolute frame rates are meaningless; only the ratio between builds means something.
**No test on a real phone was possible from this environment.** Raw data: `docs/perf/*.json` (`scripts/perf.mjs`).

| Build | Quality | Phone 390×844 fps (Plateau / Pikine day) | Triangles | Draw calls | Ready (phone) |
| --- | --- | --- | --- | --- | --- |
| main (v0.2, box characters) | High | 5.9 / 5.8 | 16–20k | 59–79 | 0.7 s |
| previous branch head (Blender humanoids) | High | 5.1 / 5.4 | 33–40k | 120–124 | 1.4 s |
| this pass | High | 4.4 / 4.7 | 64–74k | 112–156 | 2.0 s |
| previous branch head | Low | 15.7 / 13.1 | 25–32k | 82–83 | 0.7 s |
| this pass | Low | 10.4 / 9.3 | 46–58k | 68–86 | 0.7 s |

Low quality now switches off the procedural grain and the world-space detail textures, and skips purely decorative
props (roof clutter, AC units, laundry, zebra crossings, flowers, wall copings, rebar stubs, gate slats). The interior
ceiling light is only in the scene while indoors. Remaining cost is mostly triangle count (SwiftShader is vertex-bound);
on real phone GPUs this should matter less, but that must be measured on actual devices before calling it done.

## Known issues and what remains

- Interiors are not the same footprint as the street building (common game shortcut). Enterable: the Pikine home and the gargotes of Plateau, Corniche and Pikine; cafés, the restaurant and the garage are not.
- Phone interior camera is tight in the small room.
- Building colours and layout differ from v0.2 at the same coordinates (random sequence changed).
- Car rapide is still procedural; the Blender model is pending (needs the Blender MCP on Habib's Mac).
- Generated references and textures (Higgsfield) not done: see `HIGGSFIELD_PLAN.md`.
- Dibiterie and Maïga-style venues, family home and apartment interiors: not built.
- Real-phone frame rate and load time: not measured.
