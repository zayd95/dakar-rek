# Asset priority: player vehicles and furniture, pilot report

> **Update 2026-10-18:** the `clando` pilot below is now the modern sedan `compacte` (the old `clando` is retired and its owners are migrated): see `docs/assets/VEHICLE_LINEUP.md`. Ids, prices and file names in this historic report are the ones of the time.

Branch `asset/vehicles-furniture-20261018` (from baseline `6789c6e`; nothing pushed, nothing merged, nothing deployed). A trial `git merge-tree` against `feature/m1a-freedom-economy-20261017`, `feature/wrestling-ordinary-purses-20261018` and `feature/tiak-moto` is clean. **No Meshy credit spent: the balance is 940 before and after** (`docs/assets/MESHY_QUOTES.json`).

## 1. In one page

| Asked | Result |
|---|---|
| ONE purchasable car, higher-quality replacement, existing mechanics | **Done as a pilot on `clando`** (the only drivable purchasable car, 2 800 000 F). The game's ownership, driving, parking, dealer and save are **untouched** and pass their full check (20/20 desktop, 20/20 phone) with the GLB body **and** without it. The model used is a **CC0 toy truck as a stand-in** (it proves the mechanics, it is not the final art: see § 2). |
| Verify separate wheels, dimensions, rider / camera alignment, mobile performance | Wheels: four separate nodes at the kit's axles, ground contact ±2 mm, spin with the distance driven, front pair steers, rear never (§ 2.2). Dimensions: 4.50 × 1.78 × 1.43 m, the kit's, by construction and checked. Camera: a solid shell has no cabin; first answer was to drop « Au volant », **superseded**: it is kept with a shared cockpit (see `NEXT_ACTIONS.md`). Performance: model-level numbers and relative frame numbers, **not a phone measurement** (§ 2.4). |
| Furniture: Kenney Furniture Kit + Quaternius in bulk | **Blocked at the source**: `kenney.nl`, `quaternius.com`, `poly.pizza`, `opengameart.org` and `kenney.itch.io` are refused by this environment's network policy, so I could not download either pack (§ 3.1). **The import pipeline is built and proven** on real GLBs I could reach (two Khronos sample models, CC-BY, test input only, not committed) and on synthetic fixtures. |
| Reuse the furniture editor and catalogue; categories, dimensions, collisions, interaction anchors, material variants | Done through one catalogue function and one model seam: imported pieces are bought at Keur Meubles, placed with the existing home editor, sat on, and kept across reloads (§ 3.2). |
| Meshy for premium vehicles and distinctive Senegalese furniture and accessories; exact credit costs before paid generation | **Quoted, not spent** (§ 4): 9 items, 35 credits each (preview 20 + refine 10 from the CLI's own `--dry-run`, + remesh 5 as observed on our earlier tasks) = **315 credits for everything**, staged so the first approval is **35**. |

## 2. Vehicle pilot: `clando`

### 2.1 What was built

- `scripts/vehicles/prepare-vehicle-glb.mjs`: fits any vehicle GLB to a kit vehicle's envelope, builds four separate wheels at the kit's axles, writes the GLB and a sidecar, and **verifies it** (15 checks, listed in `docs/assets/README.md`). `kit-target.ts` prints the numbers to meet.
- `src/actors/glbVehicle.ts`: loader, Lambert materials, wheel rig. `animateVehicle` delegates to the rig. The model rides the kit vehicle's own group and spec.
- Wired into the used car's `build` and the dealer's displays (`OwnedDef.visual`), **behind `?vehicleModel=glb` on test hosts only**. Default behaviour is unchanged; a missing file falls back to the procedural car.
- `tests/glbVehicle.test.ts` (7 tests), `scripts/vehicles/check-pipeline.mjs` (4 gates), `scripts/check-car.mjs` (now takes `EXTRA='&vehicleModel=glb'`).

### 2.2 Separate wheels and dimensions (from the live scene and the sidecar)

| | kit target | pilot GLB |
|---|---|---|
| length × width × height | 4.50 × 1.78 × 1.43 m | 4.50 × 1.78 × 1.43 m |
| wheel hubs (x, y, z) | ±0.76, 0.31, +1.36 / −1.32 | identical (≤ 5 mm) |
| radius × width | 0.31 × 0.20 m | 0.31 × 0.20 m |
| tyre bottom | y = 0 | 0.000 m |
| spin at 8 m/s for 1 s | | 87.9° on all four (= distance / 0.31 m, modulo a turn) |
| steer 0.5 rad | | front pair 28.6°, rear pair 0° |

Picture (kit saloon left, pilot right: three views, top, steering): `docs/vehicles/pilot/sheet.jpg`. In game, driving and parked: `docs/vehicles/pilot/car-glb/desktop-5-driving.jpg`, `desktop-8-parked.jpg`, dealer `desktop-0-showroom.jpg`; phone in `car-glb-phone/`.

**The stand-in is a toy truck stretched 1.19 × 1.26 × 1.61 to the saloon's size.** That stretch (anisotropy 1.35) is exactly what the pipeline refuses (> 1.12) for a real model; the manifest declares the stand-in and the sidecar says so (`standIn: true`, a test asserts it). It looks like a pickup because it is one. It stays out of any production candidate.

### 2.3 Rider and camera alignment

The seats, doors and chase / top cameras are the kit's, and the new body has the kit's envelope and axles, so they line up by construction: the sidecar measures **17 cm of head room** over the driver's eye, and « Sortir » / « Monter » / parking collisions pass unchanged.

**Finding that matters for Meshy cars (superseded, see `docs/assets/NEXT_ACTIONS.md`):** the « Au volant » camera sits inside the body, and a fused Meshy shell (and the stand-in) is a closed solid with the dashboard painted on its skin, so from inside you see through it. First answer was to drop that view; the decision was that **no view is ever dropped**, so a solid-shell car now gets a shared lightweight cockpit drawn only in that view. `desktop-6-volant.jpg` in `car-glb/` is now the view with the cockpit.

### 2.4 Mobile performance (relative, headless Chromium + SwiftShader, 390 × 844 touch, CPU throttled: not a phone)

| | procedural kit car (near) | pilot GLB |
|---|---|---|
| draw calls (model) | 3 | 5 (body + 4 wheels, **one** shared material) |
| triangles | 688 (far LOD 78) | 946 (**no far LOD yet**) |
| texture | the shared 1024 × 512 atlas | one 512² palette, 1.3 MB on the GPU |
| file | none | 71 kB |
| animation JS per vehicle per frame | 0.2–0.5 µs | 0.9–1.9 µs at ×1…×6 CPU slowdown |

Frame at Ndiaye Auto's showroom (three displayed cars, the worst place), kit → GLB: Low 118 → 115 draw calls, 92.0k → 93.1k triangles; Medium 147 → 157 draw calls, 131.0k → 135.8k triangles. The city's random life moves these by ±10 draw calls between runs, so read them as « no visible change », not as a delta. **A device run is still required** (`docs/meshy/DEVICE_TEST.md` has the kit). For a full fleet: merge the rear axle into one mesh and add a far LOD (meshoptimizer is already in the pipeline).

### 2.5 Checks run

`scripts/check-car.mjs` (buy once, delivery, solid when parked, board, drive, steer, never through a wall, exit on the pavement side, reload, reload mid-drive, another hub): **20/20 desktop and 20/20 phone, both with `&vehicleModel=glb` and without it.** Unit tests: 126 files, 1 525 tests pass (`npx vitest run`); `tsc --noEmit` clean.

## 3. Furniture

### 3.1 Sources

| Source | Reachable? | What I did |
|---|---|---|
| Kenney Furniture Kit (kenney.nl, itch) | **no** (policy) | Rules in `scripts/furniture/categories.json` follow the kit's published naming (bedDouble, loungeSofa, tableCoffee, kitchenStove…) but are **unchecked against the real files**; anything they miss is reported as unclassified, never guessed. |
| Quaternius packs | **no** (policy) | Same pipeline; needs only a manifest and the files. |
| Khronos glTF-Sample-Assets (GitHub clone) | yes | Two **real** furniture GLBs as pipeline input: GlamVelvetSofa (5 colour variants through `KHR_materials_variants` + sheen, 4 196 triangles) and ChairDamaskPurplegold (9 984 triangles, 1 024 px PBR textures). **CC-BY 4.0: used for tests only, not committed (git-ignored), not shipped; the pack is flagged `shipping: false` and the game refuses it off test hosts.** |
| Synthetic fixtures (`make-fixtures.mjs`, our own) | yes | 12 box models named like Kenney's, one per branch: classification, skip, unclassified, a sofa authored back-to-front, a chair in centimetres, a flat rug, a variant sofa. |

**To unblock the real packs** (your call): allow `kenney.nl`, `quaternius.com` (and `poly.pizza`, `opengameart.org`, `kenney.itch.io` if you want those too) in the environment's network policy, or put the zips somewhere I can read (a Google Drive folder through the attached Drive connector, a private repo, a release asset). Then it is one manifest per pack and one command; I report the unclassified list and the prices before anything is committed.

### 3.2 Pilot result (what the pipeline did on real files)

| Model | Result |
|---|---|
| GlamVelvetSofa | classified sofa / better; 2.19 × 1.02 × 0.79 m; **3 seats at 0.45 m** (the catalogue's 2.0 m sofa also has 3, at 0.46); front found from the geometry; 4 196 → 2 498 triangles; 7 materials → 3; **5 variants** → 5 catalogue entries sharing one 60 kB GLB; price 115 000 F (the catalogue's 95 000 F anchor × footprint); effect copied from « Canapé en tissu wax » |
| ChairDamaskPurplegold | chair / better; 0.83 × 0.57 × 0.69 m; seat at 0.36 m; 9 984 → 2 496 triangles, 220 kB; 19 000 F |

In the real game (`docs/furniture/pilot/sheet.jpg`: the shop's « Salon » room, the home, the editor angled and overhead, sitting): **the shop lists the imported pieces next to the catalogue's; they are paid once at their price; they stand in the F2 apartment with their own models; the editor rotates them and gives its verdict (« Contre le mur »); the player sits on the sofa; they are still there after a reload; the game starts and plays normally when the pack is absent** (`scripts/furniture/check-import-ingame.mjs`: 8 PASS; the purchases stay in the save while the pack is absent). Pipeline checks on fixtures: 14 PASS (`check-pipeline.mjs`); 8 unit tests (`tests/furnitureImport.test.ts`).

### 3.3 What the pipeline does not do

- **Collisions are the editor's footprint rectangle** (w × d) plus the height, as for every existing piece: no concave collider (an L-shaped corner sofa blocks its bounding box).
- Wall-mounted and ceiling pieces, doors, stairs and « on top of another piece » props (toaster, laptop, books) are **skipped with a reason**: the editor places on the floor only and does not stack.
- Variants are **colours** (a variant with a different texture is flagged `approximate`).
- Names are rule-made French (« Salon canapé long »): readable, to be polished by hand with `overrides`.
- Prices come from a ladder; whether 140 new pieces belong in the economy at once is a product decision (the shop rooms can hold them; I would release a pack in tiers).

## 4. Meshy: proposed generations and exact credit costs (nothing run)

> The vehicle rows below are superseded by `docs/assets/VEHICLE_LINEUP.md` (modern sedan, sport sedan, premium SUV; same 35 credits each; Stage A first). The furniture rows stand.

Source of the numbers: `meshy make "<prompt>" --dry-run` (steps and estimate, **no API call**), run for each prompt: **preview 20 + refine 10 = 30**; a **remesh at 5** (the observed price of our earlier remeshes; the CLI's `make` does not include it) to control polycount → **35 per item**. Image-to-3D is also 30 (dry-run). Retexture is **not quoted** by the CLI and I did not run anything to find out: it is not in this proposal. Balance now 940 (925 monthly, resetting around 17 November, + 15 permanent). Prompts are in `scripts/meshy/quote-assets.mjs`; the full output in `docs/assets/MESHY_QUOTES.json`.

| Stage | Item | Game benefit | Credits | Expected output | Reuse | Accept if |
|---|---|---|---|---|---|---|
| **A** (first approval) | `clando_body`: used saloon body **without wheels** | the pilot's real look for the 2 800 000 F car | **35** (70 if I must retry) | one textured body, ≤ 12k triangles after remesh | wheels, rig, camera, tests all reused; body family for colourways | `prepare-vehicle-glb` passes **without the stand-in waiver** (stretch ≤ 1.12, wheel arches empty enough, 4 wheels fit), looks like a worn saloon from the chase camera |
| B | `berline_body`, `suv_body` | the 14 M F and 75 M F cars (`soon` today) become real, and a visible reward ladder | **70** | two bodies | same pipeline; target = the kit's `luxury` (5.15 × 1.92 × 1.45) and `suv` (4.85 × 1.94 × 1.90) | as A, after A is approved |
| C | `attaya_set`, `tabouret_sculpte` | distinctive Senegalese pieces (tea ritual, a usable carved stool) no free pack has | **70** | two props | furniture pipeline (seat found from the geometry for the stool) | footprint, seat and budget pass; reads as Senegalese, not generic |
| D | `canari_support`, `pilon_mortier`, `calebasses`, `fanal_laiton` | decor and a lamp for homes, shops and the gargote | **140** | four props | same | as C |
| | **Total** | | **315** (630 worst case with one retry each; **625 left of 940** if everything is generated once) | | | |

Risks I can see before spending: Meshy may add wheels despite « no wheels » (then wheel removal is manual work); a single fused shell has **no cabin and no steerable parts**, so **motorcycles and scooters are not in this proposal** (fork and handlebar must steer; that needs a cut or a different method); cultural accuracy of the Senegalese items needs your review (the register marks it « Unreviewed » until you do). I propose **A only (35 credits)** as the first approval; B, C, D wait for your verdict on A.

## 5. What I need from you

1. **Furniture packs**: allow the hosts (or hand me the zips), or tell me to stay with the pipeline only for now.
2. ~~Camera for Meshy cars~~ decided: keep every view (shared cockpit).
3. **Meshy**: approve stage A (35 credits) as a first step, or amend the list.
4. Still open from earlier: the two avatar bodies' archive checksum, scooter price (proposed 120 000 F), and your exported Meshy assets (the API account reachable here lists only our two characters).
5. A phone run of the pilot (`?vehicleModel=glb`) and of the furniture pilot if you want real-device numbers.

## 6. Commands

```
node scripts/vehicles/prepare-vehicle-glb.mjs assets-src/vehicles/clando.pilot.json
node scripts/vehicles/check-pipeline.mjs && node scripts/furniture/check-pipeline.mjs
ONLY=desktop EXTRA='&vehicleModel=glb' node scripts/check-car.mjs <baseUrl> <outDir>
PACK=<folder> node scripts/furniture/check-import-ingame.mjs <baseUrl> <outDir>
node scripts/meshy/quote-assets.mjs        # free: dry-run quotes and a before/after balance read
npx vitest run
```
