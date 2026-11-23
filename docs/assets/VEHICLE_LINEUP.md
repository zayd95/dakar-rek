# Player vehicle lineup: design brief and priority order

Decided 2026-10-18 (revised the same day: **the old `clando` is retired**). Three **original, unbranded** player-owned cars, each **inspired by a class of real car** (silhouette, stance and level of finish only). Player-owned: **no NPC vehicle is generated**, traffic, taxis and public transport are untouched. The game's **ownership, driving, save, cameras and wheel system are kept as they are**: the modern sedan has its **own identity** (`compacte`) and the other two fill their existing catalogue entries; each body is fitted to its kit envelope by `scripts/vehicles/prepare-vehicle-glb.mjs`. No new system is created. **No Meshy credit is spent until you approve each step.** Data: `assets-src/vehicles/briefs.json`.

## 1. Priority order

| # | Car | Inspired by | Catalogue entry | Kit envelope L × W × H, wheelbase, wheel r | Stage |
|---|---|---|---|---|---|
| **1** | **Modern sedan** « Berline moderne » | 2020s Hyundai Elantra | **`compacte`** (new entry) · price provisional · tier 2 | 4.50 × 1.78 × 1.43 m, 2.68 m, 0.31 | **A: DELIVERED (generated, integrated, playable)** |
| 2 | Sport sedan | modern Mercedes-AMG sedan | `berline` · 14 000 000 F · tier 3 | 5.15 × 1.92 × 1.45 m, 3.20 m, 0.35 | B: brief ready, not released |
| 3 | Premium SUV | modern Range Rover | `tout_terrain` · 75 000 000 F · tier 4 | 4.85 × 1.94 × 1.90 m, 2.89 m, 0.39 | C: brief ready, not released |

**Stage A is done** (35 of the 35 credits, balance 905): see section 1c. Order of work: **A alone first.** B is released only after A's body has passed the pipeline checks and you have approved it in the game; C only after B. Each brief is its own approval: nothing in B or C can run (the runner refuses an unreleased brief, checked).

The ladder to one scale: `docs/assets/guides/lineup.png`. The real cars are about 4.68 m (Elantra class), 4.8–5.0 m (AMG sedan class) and 5.05 m long, 2.0 m wide, 1.87 m tall (Range Rover class), from memory and approximate: each is within about 4 to 7 % of its slot's envelope, so a body needs little stretch (the pipeline refuses more than 1.12).

## 1b. The old clando is retired (not renamed, not re-skinned)

- **Catalogue:** `clando` (« Voiture d'occasion », 2 800 000 F) is gone: nobody can buy it, the dealer does not list it. The modern sedan is a **new catalogue entry, `compacte`** (« Berline moderne »: its own id, name, description, vehicle definition `src/transport/car.ts` / `carModule.ts`, interaction space, GLB id and texts). Until its own body is generated it shows as the shared kit's saloon in a new silver-grey; the Stage A body replaces that.
- **Price: PROVISIONAL** (still). The old 2 800 000 F is **not** carried over. `compacte` carries a placeholder (6 000 000 F, `src/economy/catalog.ts`, flagged in the code) so the purchase flow can be tested; the economy balance pass sets the real price and the handling numbers (the car still drives with the old car's numbers, also provisional).
- **Showroom:** the Plateau showroom (« Ndiaye Auto », still named « Voitures d'occasion ») stocks the new car for sale. Its two other lots are generic kit saloons until bodies exist. The showroom's name is a decision for you (below).
- **Existing owners lose nothing (legacy migration, `migrateLegacyVehicles` in `src/transport/owned.ts`, run when the car module starts):** a save that owns `clando` gets the **same asset** (uid, what they paid, condition, since, home) under `compacte`, its parking spot moves to the `compacte` counters, the old counters are removed; **no charge, no refund, wallet and ledger untouched**; idempotent; never merges if both ids are somehow present. The save format does not change (v5, catalogue ids and counters). `scripts/check-legacy-car.mjs` loads such a save in the real game: the car is theirs, parked where it was left, « Monter (conducteur) » is offered, the dealer lists only the new car. Unit tests: `tests/legacyVehicles.test.ts` (6) and the updated car / dealer / catalogue tests.
- **Value of an old owner's car:** worth follows what they paid, through `AssetState.basis` (see 1c): no windfall from the placeholder price, whatever the economy pass sets.
- **Rollback:** an older client opening a migrated save ignores the unknown `compacte` asset (guarded) but does not delete it.

## 1c. Stage A delivered: the Berline moderne

- **Generated** with Meshy from the approved prompt: preview (20) → refine (10) → remesh 15k (5) = **35 credits, balance 940 → 905**. The preview was a convincing modern sedan on the first try. The one miss: it came **with wheels** (the prompt asked for none), and with a **grille emblem, a boot emblem and two plates with lettering**.
- **Made playable:** `scripts/vehicles/split-fused-body.mjs` cuts the four wheels out of the fused shell (a cylinder per tyre round its hub, found from where the tyres touch the ground) so they spin and steer as separate nodes, and **paints the emblems and plate lettering out of the texture**; `prepare-vehicle-glb.mjs` fits it to the kit (length 4.50 m, body width 1.78 m mirrors apart, height 1.47 m, hubs within 2 cm of the kit's axles, tyre radius 0.37–0.39 m: bigger wheels than the kit's 0.31, which suits it), culls 5 800 triangles nobody sees from outside, smooths the normals across the UV seams, simplifies the wheels. Result **7 606 triangles, 5 draw calls, 1.1 MB, one 1024 px JPEG**. The body is not decimated: Meshy's texture is split into tiny islands that do not survive it.
- **In the game by default** (`?vehicleModel=kit` on a test host brings the old procedural car back for comparison). « Au volant » is kept: the shared cockpit is drawn and the shell is hidden from inside. The showroom now draws all three lots itself: the car for sale and two more of the same car in other paint.
- **Player-facing:** « Berline moderne »; dealer « Ndiaye Auto » (sign, price cards and shop label no longer say « occasion »).
- **Legacy owners:** a migrated `clando` keeps its purchase as the **worth basis** (`AssetState.basis`, additive and sanitised by the loader): resale and net worth follow what they paid (2 800 000 F), not the placeholder price, so there is **no windfall**. A buyer from the catalogue has no basis and follows the catalogue price.
- Private sources: `assets-src/meshy_output/modern_sedan/` (git-excluded). Committed: the split / pipeline manifests, the paint-out and visibility data, the game GLB and its sidecar.

## 2. Why each car is a visible step up

| | Modern sedan | Sport sedan | Premium SUV |
|---|---|---|---|
| Message | sensible and stylish | fast and elegant | arrived |
| Size | 4.50 m, 1.43 m tall | **+0.65 m longer, wider, same low height** | tallest, 1.90 m |
| Stance | neutral | **low, wide, flared arches** | high, upright |
| Wheels (kit) | r 0.31 | **r 0.35** | **r 0.39** |
| Roofline | fastback-ish, short deck | **long hood, short deck, coupe-like** | flat floating roof |
| Surface | creased, sharp lights | **cleaner and richer: slatted grille, hood lines, light strip** | **clean slabs, minimal ornament** |
| Paint | silver-grey | dark graphite | deep black |

Review gate between cars: the new body is shown **next to the previous one** in the game's showroom, and it must read as the step up from 5 m away on a phone before it is accepted.

## 3. Originality rules (every brief)

- Inspired by, never copied: class, proportions and finish only. **No brand name in any prompt** (a brand name invites its badge and its signature details); the names appear only in this document.
- No logo, badge, lettering or number plate text on any body. Reject a preview that carries one, or that reproduces a real car's most recognisable details (grille, light signature) too closely.
- Wheels are never part of the body: arches empty, four separate wheels from the game's wheel system.

## 4. The briefs

### 1. Modern sedan (Stage A): first, gated, nothing run

- **Inspired by** a 2020s Hyundai Elantra (class and proportions only); **fills** `clando` (Voiture d’occasion · 2 800 000 F · tier 2); kit `sedan seed 18`; dealer: Ndiaye Auto · Plateau.
- **Role:** affordable but stylish: the first car a player can own, attractive but not luxury-tier. **Paint:** silver-grey metallic (the slot's silver).
- **Look:** sharp, slim, angular headlights; clean realistic compact-sedan proportions; crisp shoulder line, fastback-ish roof; plain but tidy: no chrome, no flares.
- **Prompt** (660 characters; no brand name in it, on purpose):
  > A compact modern four-door sedan from the 2020s, affordable but stylish, silver-grey metallic paint, clean realistic proportions, long low hood, sloping fastback-style roofline with a short rear deck, sharply creased bodywork with a strong shoulder line, slim angular LED headlights with a sharp light signature, wide lower grille, LED tail lights, about 4.5 m long, 1.8 m wide and 1.4 m tall. Original design, no badges, no logos, no lettering, no number plate text, symmetrical, game asset, neutral studio pose. IMPORTANT: car body only. The four wheel arches are EMPTY and dark. No wheels, no tyres, no rims, no brake discs, no suspension, no ground shadow.
- **Guide to judge against:** `docs/assets/guides/modern_sedan.png`.

### 2. Sport sedan (Stage B): prepared, not released

- **Inspired by** a modern Mercedes-AMG sedan (class and proportions only); **fills** `berline` (Berline neuve · 14 000 000 F · tier 3 (marked « soon » until it can be driven)); kit `luxury seed 1`; dealer: to choose (a second lot of the Plateau showroom, or Almadies).
- **Role:** more premium and sporty: must clearly read as an upgrade over the modern sedan at a glance. **Paint:** dark graphite metallic.
- **Look:** longer, lower, wider than the modern sedan; bigger wheel arches (kit wheel radius 0.35 against 0.31); elegant coupe-like roofline, stronger road presence; cleaner, richer detailing: slatted grille, hood lines, rear light strip.
- **Prompt** (741 characters; no brand name in it, on purpose):
  > An elegant modern four-door performance saloon, premium and sporty, dark graphite metallic paint, long hood and short rear deck, low wide stance, sleek coupe-like roofline, wide flared wheel arches, pronounced power-dome lines on the hood, slim LED headlights, wide grille with vertical slats, aggressive lower air intakes, clean upscale detailing, subtle rear lip spoiler, quad exhaust outlets, full-width LED tail light strip, about 5.0 m long, 1.9 m wide and 1.45 m tall. Original design, no badges, no logos, no lettering, no number plate text, symmetrical, game asset, neutral studio pose. IMPORTANT: car body only. The four wheel arches are EMPTY and dark. No wheels, no tyres, no rims, no brake discs, no suspension, no ground shadow.
- **Guide to judge against:** `docs/assets/guides/sport_sedan.png`.

### 3. Premium SUV (Stage C): prepared, not released

- **Inspired by** a modern Range Rover (class and proportions only); **fills** `tout_terrain` (4 × 4 de luxe · 75 000 000 F · tier 4 (marked « soon » until it can be driven)); kit `suv seed 6`; dealer: to choose (Almadies, premium).
- **Role:** luxury SUV, the top-tier ownership goal: upright, prestigious, strong presence. **Paint:** deep black metallic.
- **Look:** tallest and most upright of the three (1.90 m); largest wheels (kit radius 0.39) and most ground clearance; flat roof, clean slab surfaces, minimal ornament; dark, quiet, expensive: presence from proportion, not decoration.
- **Prompt** (706 characters; no brand name in it, on purpose):
  > A full-size luxury SUV with an upright, prestigious silhouette, deep black metallic paint, tall clamshell hood, flat floating roofline, clean slab sides with minimal creases and a continuous beltline, slim horizontal LED headlights, wide horizontal-bar grille, short overhangs, large flush wheel arches, near-vertical tailgate, slim LED tail light strip, premium proportions and clean surfaces, about 4.9 m long, 2.0 m wide and 1.9 m tall. Original design, no badges, no logos, no lettering, no number plate text, symmetrical, game asset, neutral studio pose. IMPORTANT: car body only. The four wheel arches are EMPTY and dark. No wheels, no tyres, no rims, no brake discs, no suspension, no ground shadow.
- **Guide to judge against:** `docs/assets/guides/premium_suv.png`.

## 5. Cost and gates

Each car: **preview 20** (the initial approval) + refine 10 + remesh 5 = **35**; refine and remesh each need your approval after you have looked at the previous result. All three: 105 of 940 credits. The CLI's own dry-run quotes 20 + 10 for each prompt (`docs/assets/MESHY_QUOTES.json`; the remesh 5 is the price observed on our earlier tasks; Ultra geometry is billed on top and not used). Run state: balance 940, nothing spent.

```
node scripts/meshy/stage-a.mjs plan                                          # free: all three briefs, gates, balance
MESHY_APPROVED=modern_sedan:preview node scripts/meshy/stage-a.mjs preview modern_sedan      # 20 credits, only on your go
```

Every paid step needs the brief `released` in `briefs.json` **and** `MESHY_APPROVED=<brief>:<step>`; it reads the balance before and after, and writes only to the private, git-excluded `assets-src/meshy_output/<brief>/`.

## 6. What happens after a preview (per car)

1. You look at it against its guide. Accept, or I stop and report (no automatic retry, no extra spend).
2. Refine, then remesh, each after your approval.
3. `prepare-vehicle-glb` **without the stand-in waiver**: stretch ≤ 1.12 on the slot's target, four wheels at the kit's hubs, head room, budgets; the shared cockpit gives « Au volant » to the solid shell. Then the car check in the game.
4. Mobile numbers (draw calls, triangles, a far LOD) before it is called done.

## 7. What B and C need before they can be driven (existing system only)

`berline` and `tout_terrain` are **already drivable on the kit's bodies** (2026-10-18, `src/transport/premiumCars.ts`, dealers « Prestige Auto » in the Almadies; `docs/assets/VEHICLE_COVERAGE.md`). Stage B / C bodies replace them through the `visual` hook of the module (as `glbCar` does for the modern sedan): a GLB under `public/assets/vehicles/`, its id in `preloadGlbVehicles`, nothing else.

## 8. Decisions I need from you

1. **Economy pass** (yours, separate): the price and handling of the Berline moderne (placeholder 6 000 000 F, the old car's handling).
2. **Stage B** (sport sedan, 35 credits) when you want it: the same recipe now takes hours, not days, and the cut-out wheels are a solved step.
3. **Dealer for the sport sedan and the SUV**: only needed at their stage.

## Stage A delivered: « Berline moderne » (Ndiaye Auto)

- Meshy: 35 credits (20 preview, 10 refine, 5 remesh), balance 905 after. Stages B and C not started.
- In game: 7 606 triangles, 5 draw calls, 1.1 MB GLB; four separate wheels (spin, front pair steers); chase, « Au volant » (shared cockpit) and top views kept. Screenshots: `docs/vehicles/stage-a/{desktop,phone}/`.
- Meshy's preview carried wheels, badges and plates on the shell: wheels were cut out and animated, badges and plates painted out of the texture.
- Measured at the Plateau showroom (SwiftShader, so relative only, not a phone): low quality 130 draw calls / 110k tris with the GLBs against 131 / 98k with the kit cars; medium 153 / 145k against 164 / 136k. The model's own JS cost per frame is a few microseconds. Real-phone numbers still need a device.
- Legacy « clando » owners keep their car as `compacte` (same uid, condition, parking) and resale is computed from what they paid (`AssetState.basis`), not from the provisional 6 000 000 F catalogue price.
- Price, handling and stats are provisional until the economy pass.

### Stage A final pass (after approval)

- **« Au volant » obstruction.** Tested with the car in an open street, nowhere near the dealership: hiding only `cockpit_body` removes the whole band, and nothing else changes. So it was not the building's awning and not the shell (the shell is hidden inside, and showing it changes nothing). It was the shared cockpit's own roof structure: a 7 cm-thick header 0.5 m ahead of the eye (5° above it), and a headliner lower than the roof that the camera's 0.3 m near plane cut away, leaving a strip of sky above a dark lid. Fixed in `src/actors/cockpit.ts`: slim header 0.7 m ahead (about 10° up), slimmer pillars, headliner just under the roof line (the near plane no longer cuts it), pale and lit as if facing the sky, a smaller mirror. `tests/glbVehicle.test.ts` now holds the numbers (what the driver looks through starts above 8°; at most a 3° sliver cut by the near plane). Shots: `docs/vehicles/stage-a/final-pass/volant-open-street-*.jpg`.
- **Badge and plate cleanup, local edits only (no regeneration).** The cut-out plates had been painted pale and the paint spilled onto neighbouring texture islands. `split-fused-body.mjs` now paints only the texels a cut triangle owns (no margin); the front plate and its frame take the bumper's dark, the boot plate the boot's paint (both sampled from the ring around them, not guessed); the plate zones are re-lit with one smooth normal and the rear bumper is relaxed (`relax` in `compacte.split.json`). A Laplacian flatten of the recesses was tried and dropped: it made spikes and a V crease. Before and after: `final-pass/bumpers-before-after.jpg`.
- **Verified in game (desktop 1280 × 800 and phone 390 × 844, `scripts/check-car.mjs`):** 44/44, now including the four wheels spinning while it rolls and steering turning the front pair only; parking: solid, found again after a reload, also mid-drive; legacy saves pass `scripts/check-legacy-car.mjs`.
- **Real iPhone: unverified.** No device was reachable from here. The only numbers are from a software renderer (relative cost only): at the Plateau showroom the three generated cars add about 10–12k triangles and no draw calls to the old procedural cars. To test: open the build on the phone with `?debug` and compare against `?vehicleModel=kit` (the old procedural cars) at Low and Medium, in the showroom (three cars at once) and on the road; the GLB is 1.1 MB with a 1024 px JPEG texture.
