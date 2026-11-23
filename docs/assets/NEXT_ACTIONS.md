> **Stage A is delivered (2026-10-18):** the Berline moderne is generated (35 credits, balance 905), integrated and playable on desktop and phone. See `VEHICLE_LINEUP.md` section 1c. The text below is the plan that led to it.

# Asset pilot: next actions (decisions of 2026-10-18 applied)

Branch `asset/vehicles-furniture-20261018`. Nothing pushed, merged or deployed. **Meshy balance 940, nothing spent.**

## Done since the pilot report

| Decision | Result |
|---|---|
| 3. Keep every camera, « Au volant » included | A solid-shell body gets a **shared lightweight cockpit** (`src/actors/cockpit.ts`): dashboard, a steering wheel that turns with the steering, windscreen pillars, header, headliner, mirror, built from the kit spec of the car it sits in. 2 meshes, 1 shared material, < 500 triangles, **not drawn outside the inside view**. The camera list is the kit's again (`chase`, `volant`, `haut`; a unit test pins it). `check-car` with the GLB body: **20/20 desktop, 20/20 phone**, « Au volant » cycles. Pictures: `docs/vehicles/pilot/cockpit/sheet.jpg`, `car-glb/desktop-6-volant.jpg`. A model with a hollow cabin (`interior: true` in its sidecar) needs no cockpit. Limits: stylised and plain (the stand-in's hood shows through); a real model deserves a nicer dash later, same slot. |
| 2. Kenney Furniture Kit + Quaternius Ultimate House Interior | **Still blocked**: `kenney.nl`, `quaternius.com`, `kenney.itch.io`, `poly.pizza`, `opengameart.org` refused by the network policy (re-tested). **Waiting for the ZIPs.** Intake is ready: drop them in `assets-src/furniture/zips/`, then `unpack-zip.mjs`, `import-furniture.mjs <manifest> --list`, import. `kenney-starter.json` names the **first 15 functional pieces** (2 beds, 2 sofas, armchair, chair, coffee table, table, desk, stove, fridge, bookcase, TV, rug, floor lamp); `quaternius-house-starter.json` waits for a `--list` of the real files. Names are unverified and any not found is reported as missing. The CC-BY Khronos test models are out of the repo, out of `public/` (moved to `/tmp`), never shipped. |
| 4. Stage A | See below. Nothing spent; the paid steps **refuse to run** without a step-named approval (shown). |
| 5. | Priorities held: wheels, dimensions, performance are pipeline checks; no NPC vehicle touched. |
| 6. | All on the asset branch; no production change. |

## The old clando is retired; Stage A is the modern sedan (see `docs/assets/VEHICLE_LINEUP.md`)

The lineup is now three original, unbranded player-owned cars: **1 modern sedan (Elantra class, its own catalogue entry `compacte`; the old `clando` is retired)**, 2 sport sedan (AMG class, `berline`), 3 premium SUV (Range Rover class, `tout_terrain`). Stage A is the modern sedan only; B and C are written briefs, **not released** (the runner refuses them). Prompt, look, guide, cost and gates: `VEHICLE_LINEUP.md`. First step: **preview, 20 credits**, on your go; refine 10 and remesh 5 only after you approve each result by eye. Balance 940, nothing spent.

## What I need from you

1. **Go / no-go on the 20-credit preview of the modern sedan** (and the prompt wording, if you want changes).
2. **The two ZIPs** (Kenney Furniture Kit, Quaternius Ultimate House Interior Pack): allow the hosts, or put them in a Google Drive folder / private repo / release asset I can read.


## Update: Stage A closed

The Berline moderne passed its final pass (cockpit roof structure, badge/plate cleanup, wheels and parking re-verified; real-iPhone performance still unverified: see `VEHICLE_LINEUP.md`). Stage B is prepared and waiting for your approval of the 20-credit preview: `STAGE_B_PREP.md`. Nothing is generated; Stage C untouched.
