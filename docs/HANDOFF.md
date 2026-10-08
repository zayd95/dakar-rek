# Handoff — after the visual pass (7 Oct 2026)

`main` now includes the visual pass (see `docs/VISUAL_PASS.md` for before/after captures, what changed and performance).

## Decided
- Name: **Dakar Rek**. Design doc: "Dakar Rek — Game Design Document" (Claude Docs).
- First combat form: **lutte avec frappe** (Habib, 6 Oct). Strikes ship only after the written rules are reviewed by a wrestling practitioner. No hybrid.
- Free plans/tiers only, except Higgsfield: Habib authorised up to the 100 available credits (3-day validity from 6–7 Oct, no purchases).
- All cultural content (dances, gestures, rhythms, ngemb, accessories, interiors' furnishing) stays marked Unreviewed until Habib + practitioners review it.

## Done in the visual pass
- Rendering: ACES, sky dome (`src/world/sky.ts`), horizon fog, warmer sun/moon; grain + world-space procedural textures (`src/world/grain.ts`, `src/world/textures.ts`); Higgsfield detail maps with shader relief (bump from the map's brightness, depth per material; batch 3 remastered with `scripts/tex/remaster.py`); partial night windows; lamp light pools.
- Builder: plinths, cornices, parapets, roof clutter, AC units, boutiques with shutters, balconies, gates, raw breeze-block walls, trees, palms, stalls, zebra crossings, kerbs; flush signs; arena stands/wall/arch/floodlights; station with two car rapides.
- Procedural car rapide v2 (shared mesh). Tee light band fixed (double-sided cloth). Walkable slabs lowered.
- Walkable interiors (`src/world/interiors.ts`): starter room and gargotes; Entrer/Sortir; room camera; ceiling light only while indoors.
- Quality Low: no grain/detail textures, no decorative props.
- Scripts: `scripts/compare.mjs` (identical-position before/after), `scripts/perf.mjs` (load + fps, headless), `scripts/quickshots.mjs`; `scripts/shots.mjs` has interior checks (45 checks pass).

## Avatar v4 (done after this handoff was first written)
- `public/assets/character_v4.glb` (source `assets-src/character_rig_v4.blend`) replaces v2: continuous skin-modifier body with automatic weights, shaped head (eyes, brows, nose, lips, ears), garments cut from the body surface (tee, trousers, shorts, shoes, dress top + skirt, grand boubou, kufi, headwrap), short hair / puff / beard, and Female / Muscular / Heavy morphs shared by body and garments.
- `scripts/portrait.mjs` takes close-up avatar review shots (desktop + phone).
- Known limits: mitten hands, head ~2k triangles, boubou sleeves clip when forearms rise, beard edge jagged, muscular morph subtle.

## Parallel lanes merged (8 Oct, evening)
Phone (replaces the system menu), first-ascent economy (Tiak Tiak on foot, wallet history, furniture, save v3), deeper local làmb bout (rules sans frappe, three modes, three styles), NPC life (sheets, routines, memory, situations, Diallo family) and player text chat (online build) are in `wip/visual-pass`, wired onto the city's existing places. Seated characters' knees fixed on load (`fixSitKnees`). Report, checks and status (intégré / testé / provisoire / à construire): `docs/INTEGRATION_2026-10-08.md`. Lane checks: `scripts/check-{phone,economy,lamb,npc}.mjs`, `npm run check:chat`.

## Next steps (in order)
1. Higgsfield: **all 100 authorised credits used** (8 Oct). 50 numbered references and textures in `assets-src/references/higgsfield/`, logged and checked in `assets-src/references/PROVENANCE.md`; batches 1 and 2 validated by Habib, the Maïga, texture redo, arena views and batch 3 await review. Batch 3 gives the next steps material: textures for placeholder surfaces (galvanized and rusty corrugated sheet for the arena roof and shacks, asphalt, terrazzo, clay roof tiles, pink render, trampled sand for the ring, palm trunk, 2:1 hollow blocks), orthographic elevations for the Blender facade kit (#33–37) and the car rapide (#48 side, #39 front/rear: use `39_car_rapide_front_rear_clean.jpg`, badge removed), arena roof structure (#40–41), bank, gallery and fishing beach (#42–44), courtyard, rooftop and night street (#45–47).
   In game since 8 Oct: hollow blocks (#50) on raw walls, asphalt (#27) on roads outside Pikine, clay tiles (#29) on Plateau roofs, galvanized sheet (#25) on the arena roof, concrete (#11) on the tiers, trampled sand (#31) on the arena floor, rusty tin (#26) on dibiterie awnings, palm bark (#49) on palm trunks, terrazzo (#28) in the bank hall and the mall courtyard. Still references only: the elevations and car rapide views (for the Blender kit) and the place photos.
2. Blender (Mac): car rapide GLB; modular facade kit (bays, shop ground floor, balcony, parapet) guided by the reviewed references; export GLB with a shared texture atlas; load per hub on demand.
3. Real-phone tests: load time and fps on a mid-range Android and an iPhone at Low/Medium; then pick the default quality automatically.
4. Family home and apartment interiors; dibiterie; Maïga (a smaller, dirtier gargote; reference `18_maiga.jpg`).
5. Phone interior camera (room feels tight at 390×844).

## Notes
- Preview artifact: claude.ai artifact QZYffkk4jEThNWRM4iU1mN. The GLB is shipped there as `assets/character_v4.glb.json` (base64) because .glb is not a served type.
- Headless checks: Chromium at /opt/pw-browsers with SwiftShader (CPU): frame rates compare builds only; they are not phone numbers. `?debug` exposes `window.__dakar` (teleport, setHour, enter/exit, meshStats…).
- Blender files on Habib's Mac: `~/DakarRek-assets/`.
- Deployment (8 Oct): Cloudflare Workers Builds deploys every push to `wip/visual-pass` (production branch set there until PR #1 is merged; then set it back to `main`). Details in `docs/LAUNCH.md`.
