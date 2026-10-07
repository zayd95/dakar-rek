# Handoff — after the visual pass (7 Oct 2026)

`main` now includes the visual pass (see `docs/VISUAL_PASS.md` for before/after captures, what changed and performance).

## Decided
- Name: **Dakar Rek**. Design doc: "Dakar Rek — Game Design Document" (Claude Docs).
- First combat form: **lutte avec frappe** (Habib, 6 Oct). Strikes ship only after the written rules are reviewed by a wrestling practitioner. No hybrid.
- Free plans/tiers only, except Higgsfield: Habib authorised up to the 100 available credits (3-day validity from 6–7 Oct, no purchases).
- All cultural content (dances, gestures, rhythms, ngemb, accessories, interiors' furnishing) stays marked Unreviewed until Habib + practitioners review it.

## Done in the visual pass
- Rendering: ACES, sky dome (`src/world/sky.ts`), horizon fog, warmer sun/moon; grain + world-space procedural textures (`src/world/grain.ts`, `src/world/textures.ts`); partial night windows; lamp light pools.
- Builder: plinths, cornices, parapets, roof clutter, AC units, boutiques with shutters, balconies, gates, raw breeze-block walls, trees, palms, stalls, zebra crossings, kerbs; flush signs; arena stands/wall/arch/floodlights; station with two car rapides.
- Procedural car rapide v2 (shared mesh). Tee light band fixed (double-sided cloth). Walkable slabs lowered.
- Walkable interiors (`src/world/interiors.ts`): starter room and gargotes; Entrer/Sortir; room camera; ceiling light only while indoors.
- Quality Low: no grain/detail textures, no decorative props.
- Scripts: `scripts/compare.mjs` (identical-position before/after), `scripts/perf.mjs` (load + fps, headless), `scripts/quickshots.mjs`; `scripts/shots.mjs` has interior checks (45 checks pass).

## Avatar v4 (done after this handoff was first written)
- `public/assets/character_v4.glb` (source `assets-src/character_rig_v4.blend`) replaces v2: continuous skin-modifier body with automatic weights, shaped head (eyes, brows, nose, lips, ears), garments cut from the body surface (tee, trousers, shorts, shoes, dress top + skirt, grand boubou, kufi, headwrap), short hair / puff / beard, and Female / Muscular / Heavy morphs shared by body and garments.
- `scripts/portrait.mjs` takes close-up avatar review shots (desktop + phone).
- Known limits: mitten hands, head ~2k triangles, boubou sleeves clip when forearms rise, beard edge jagged, muscular morph subtle.

## Next steps (in order)
1. Higgsfield: **batches 1 and 2 done** (34 credits, 76 left) in `assets-src/references/higgsfield/`; batch 1 validated by Habib. Batch 2 (streets of Plateau, Corniche/Fann, Almadies/Ngor; salon; kitchen; dibiterie; 7 textures) awaits his review: notes and seam checks in `assets-src/references/PROVENANCE.md` (wood planks and the batch 1 plaster fail; paving layout uneven). Still to do: confirm what a Maïga-style eatery is, then generate it; optionally redo the failed textures. Credits expire around 9–10 Oct.
2. Blender (Mac): car rapide GLB; modular facade kit (bays, shop ground floor, balcony, parapet) guided by the reviewed references; export GLB with a shared texture atlas; load per hub on demand.
3. Real-phone tests: load time and fps on a mid-range Android and an iPhone at Low/Medium; then pick the default quality automatically.
4. Family home and apartment interiors; dibiterie; Maïga-style eatery (confirm what Habib means first).
5. Phone interior camera (room feels tight at 390×844).

## Notes
- Preview artifact: claude.ai artifact QZYffkk4jEThNWRM4iU1mN. The GLB is shipped there as `assets/character_v4.glb.json` (base64) because .glb is not a served type.
- Headless checks: Chromium at /opt/pw-browsers with SwiftShader (CPU): frame rates compare builds only; they are not phone numbers. `?debug` exposes `window.__dakar` (teleport, setHour, enter/exit, meshStats…).
- Blender files on Habib's Mac: `~/DakarRek-assets/`.
