# Stage B: Mercedes-inspired sport sedan, prepared, not generated

**Status: nothing generated, no credits spent (balance 905), brief still `released: false`.** The brief (`assets-src/vehicles/briefs.json` `sport_sedan`, prompt in `VEHICLE_LINEUP.md` § 2, guide `docs/assets/guides/sport_sedan.png`) is unchanged. This note is what Stage A taught and what is ready.

## What is ready
- The slot is already **live on the kit's `luxury` body** (`src/transport/premiumCars.ts`, « Prestige Auto · Berlines », Almadies; `docs/assets/VEHICLE_COVERAGE.md`). A Stage B body replaces it through the module's `visual` hook; the dealer, ownership, driving, parking and saves are done and tested (`scripts/check-prestige.mjs`).
- Slot `berline` (Berline neuve · 14 000 000 F · tier 3, marked « soon »), kit `luxury` seed 1: `assets-src/vehicles/target-berline.json` (5.15 × 1.92 × 1.45 m, wheelbase 3.20, wheel radius 0.35, hubs ±0.805 / +1.68 / −1.52).
- Inert templates, copied and filled in after the remesh: `berline.split.template.json`, `berline.paintout.template.json`, `berline.pilot.template.json` (Stage A's tuned values; limits 9 000 triangles, 1 500 KB for the larger car).
- Tools, all proven on Stage A: `split-fused-body.mjs` (wheels cut out of the fused shell, badges and plates painted out of the texels they own, local relax), `visible-triangles.mjs` (the cull list), `prepare-vehicle-glb.mjs` (fit to the kit target, own wheels, checks), the shared cockpit, `check-car.mjs` (44 checks incl. wheels), `shoot-glb.mjs`, `proof/vehicles/glbview.html` (`look` / `pick` to measure boxes).

## What Stage A taught (apply to the Stage B prompt, for your approval)
1. **Meshy ignored « no wheels ».** It returned a fused car with wheels, a grille badge, a boot badge and two plates, whatever the prompt says. The pipeline handles that now, so keep the prompt's no-badge / no-plate wording but expect them; do not spend a retry on it.
2. **What does matter in the preview:** four clean, round, evenly placed wheels with the tyre touching the ground (the cut-out finds them from the ground contact), a symmetrical body, a flat plate area. Reject a preview with a visible lopsided stance or merged wheel arches; accept cosmetic lettering.
3. **Budget:** a generated car's atlas is a scatter of tiny islands: do not decimate the body; cull what nobody sees, simplify the wheels only. Expect about 7–9k triangles.

## Order of work once you approve the 20-credit preview
preview → you look against the guide → (approve) refine 10 → (approve) remesh 5 → split + paint-out boxes (measured with `pick`) → cull list → `prepare` → game checks → close-ups of grille / boot / bumpers **before** showing it.

## Decisions I need only at that point
Its price and handling in the economy pass (the dealer, Prestige Auto in the Almadies, is already in).
