# Handoff — visual pass in progress (6 Oct 2026, 21:55 Dakar)

Branch: `wip/visual-pass` (main = v0.2, last reviewed build).

## Decided
- Name: **Dakar Rek**. Design doc: "Dakar Rek — Game Design Document" (Claude Docs, rev 113).
- First combat form: **lutte avec frappe** (Habib, 6 Oct). Strikes ship only after the written rules are reviewed by a wrestling practitioner. No hybrid.
- Free plans/tiers only. Blender (MCP) is the only asset tool for now.
- All cultural content (dances, gestures, rhythms, ngemb, accessories) stays marked Unreviewed until Habib + practitioners review it.

## Habib's latest request
"This sucks — keep taking screenshots and improve it until it looks much better." Iterate visuals with real in-game screenshots (desktop 1280×720 and phone 390×844, day and night), compare before/after, commit, republish the preview.

## Done on this branch
- `public/assets/character_v2.glb` (+ `assets-src/character_rig_v2.blend`): shared Blender humanoid, 20-bone rig, clothing meshes (Tee, Trousers, Boubou, Dress, Kufi, Headwrap, Shoes), ngemb A/B, accessory sockets; clips Idle, Walk, Run, Talk, Sit, Stance, Grab, Fall_Back, Prep, Dance_A/B, Celebrate, Entrance_Walk.
- `src/actors/humanoid.ts`: Humanoid/Wrestler classes, random Dakar looks (boubou/bazin, tees, wax dresses, headwraps). Player, cast, crowd and scene extras now use it (box Character kept as fallback/logic stand-in).
- Arena crowd placed on three tiers (stands geometry still to build).
- `src/world/grain.ts`: world-space procedural grain shader (not yet applied to materials).
- `src/world/batch.ts`: richer 128px facade texture (window frame, shutters, sill stain, slab band).
- Design doc updated for lutte avec frappe.

## Next steps (in order)
1. Rendering in `src/main.ts`: ACES tone mapping, sky dome gradient + sun, warmer hemisphere/sun, fog = horizon colour; apply `addGrain` to plain, facade and ground materials in `world/builder.ts`.
2. Builder details: signs smaller and flush on facades above awnings; darker plinth band at every building base; roof parapets, water tanks, satellite dishes; balconies with railings, AC units, coloured metal doors/gates in Pikine; neem trees; parked cars; street stalls.
3. Arena: three-tier stands matching the crowd tiers (r 17.9/19.2/20.5, y 0.65/1.2/1.75), outer wall, banners, entrance arch, sand ring border, floodlights.
4. Fix the light band visible on the T-shirt torso (check Cloth_Tee vs body in a close-up).
5. Car rapide in Blender (planned asset; `makeCarRapide` loads `public/assets/car_rapide.glb` when present).
6. Rerun `node scripts/shots.mjs http://localhost:4173/ shots` (after `npm run build && npx vite preview --port 4173`), review images, iterate; update `docs/FEATURES.md`, `docs/ASSET_REGISTER.md`, `docs/screenshots/`; merge to main; republish the preview artifact (claude.ai artifact QZYffkk4jEThNWRM4iU1mN; GLB must be shipped as `character_v2.glb.json` base64 there because .glb is not a served type).

## Notes
- Blender files on Habib's Mac: `~/DakarRek-assets/` (character_v2.glb, character_rig_v2.blend, wrestler_v1.*).
- Headless checks: `scripts/shots.mjs` uses Chromium at /opt/pw-browsers with SwiftShader; `?debug` exposes `window.__dakar`.
