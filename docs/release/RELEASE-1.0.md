# Dakar Rek 1.0: one city, one game, one public link

The owner's brief (« FINAL MASTER EXECUTION »): consolidate the game on one release branch, clean the screen, make walking and running automatic, make the phone behave like a phone, make the map reliable, make driving quicker, make the city look like Dakar, optimise end to end, run the whole regression, and publish one public playable link.

This file is the release record: what the build is, what changed, what was run and what it showed, what was measured, what is known to be wrong, and how the public build is published and taken back.

**Nothing in this file is a measurement on an iPhone.** Every browser run below is headless Chromium on a software renderer (2 to 5 frames a second). Counts (draw calls, triangles, textures) are exact; frame rate and heat on a phone are not known from here and are the owner's to observe.

## The build

| | |
|---|---|
| Branch | `release-1.0` |
| Commit | see `version.json` on the public address (and « Deployment » below) |
| Based on | the accepted playable candidate `92a6e2cf` ([PR #88](https://github.com/zayd95/dakar-rek/pull/88)), the device-playtest diagnostics ([PR #89](https://github.com/zayd95/dakar-rek/pull/89)) and the CI split ([PR #90](https://github.com/zayd95/dakar-rek/pull/90)) |
| Pull request | [PR #91](https://github.com/zayd95/dakar-rek/pull/91) (base `wip/visual-pass`, the branch Cloudflare publishes from) |

Every build carries `version.json` next to the page (`name`, `commit`, `buildId`, `mode`, `builtAtUtc`), written by the build itself (`vite.config.ts`, `buildId.ts`), so what is online can always be matched to a commit.

## What changed since the accepted candidate

### The screen

- Removed: the Sprint button, the Footing button, the stamina gauge (« Endurance ») and their styles (`src/ui/stride.ts`, `src/ui/stride.css` deleted).
- The needs rings show only when a need is not fine; the whole row hides when all are fine. The streak chip shows only when there is a streak.
- Kept: the joystick, the contextual action, the phone button, the place and time chip, the wallet, the goal line, the minimap. Vehicle controls (pad, pedals, horn) and the speedometer show only at the wheel.
- The keys' hint for a keyboard: « ZQSD avancer (ça court tout seul) · Maj marcher ».

### Walking and running

- **Touch**: the stick is analog. A light push creeps then walks, a firmer push jogs, the stick held at its edge runs (`src/game/stride.ts`: `ANALOG`, `analogSpeed`).
- **Keyboard**: a direction held walks, and after 0.3 s breaks into a run by itself; Shift held walks (`KEYS`, `keysSpeed`). No new control on screen.
- Speed follows the target smoothly (quicker to slow down than to speed up) and decays to a stop when the stick is released (`src/main.ts`).
- **No stamina.** Running never tires the player and is never refused. Distance covered still builds fitness (`forme`), as before.

### Energy

- Energy no longer drains with the passing of time (`src/core/state.ts`, `DRAIN_PER_PLAYED_MIN.energie = 0`) or with running. It goes down through the activities that already cost energy (work, football, the arena, and so on) and comes back as before (sleep, food). No new survival system was added.

### The phone

- A status bar (the game's time and day, the sky, energy as the battery, « Fermer »), a home screen of app icons with a dock (Carte, Travailler, Argent, Messages) and an apps library, a home indicator.
- Back and home behave as on a phone; the last screen is kept between openings; the common things are one or two taps away.
- **Opening or closing the phone no longer triggers a game action** (a double tap on ☰ or « Fermer », Enter or Space on « Fermer »): `scripts/check-phone-shell.mjs`.
- A wrong weekday on the phone's clock was fixed.

### The map

- The city view opens on the whole city with the **five districts apart and labelled**; the links drawn are the game's own road graph (including the Almadies ↔ Corniche border street, which was missing).
- Guidance follows roads (it led backwards on a road between two districts before); out on a road the district maps are no longer empty.
- Venues and stops are listed; the « Arène » filter became « Sorties »; every control is at least 44 px; drag and pinch work with real touch events; « Marquer » survives a tab round trip.
- Audit and what remains: `docs/proof/release/map/AUDIT.md`.

### Driving

- Each vehicle retuned on its own numbers, **not one multiplier** (`docs/DRIVING_FEEL.md` has the before/after table for all seven): 0 → 50 km/h in 1.8 to 2.8 s (3.0 to 4.0 before), cruise 72 to 86 km/h (63 to 76), tighter circles, a quicker wheel, shorter stops. Top speeds almost unchanged on purpose.
- Contacts: a glancing touch costs a little speed and a scrape, not the whole run-up; leaning on a corner slides off it; the brake backs a car out sooner after running into something.
- A compact **km/h speedometer**, shown only at the wheel, placed clear of every other control on six viewports (`docs/proof/release/driving/`).
- The scripted driver of the checks got an analog pedal and an opt-in « unstick » (it backs up when stuck, as a driver does), for the VTC journey's last leg.

### The look of Dakar

Two passes (`docs/proof/release/world/NOTES.md`, with before/after pairs). All of it is in the districts' merged batches: **no draw call added**; the approved Ngor / Almadies layout, venues and parking are untouched.

- **Plateau**: offices over shops (ribbon windows, concrete fins), flats with loggias and balconies, arcades kept; on the roofs set-back storeys, oversailing slabs, stair heads, tanks and masts.
- **Pikine**: houses with a house's ground floor, bare block walls, corner boutiques, the floor to come (posts with their irons), blue tanks.
- **Mermoz · Sacré-Cœur**: tiled fronts over shops, villas under tile roofs, wall piers, gate globes lit at night.
- **Corniche**: modern residences, the painted median, a whitewashed sea wall with globes, benches facing the sea.

### Memory and loading

- **A leak was fixed.** three.js does not free a material's textures, a skeleton's bone texture or a geometry when the object leaves the scene; every district visited stayed on the graphics card. `src/core/textureSweep.ts` notes what the scene holds before a district change and frees what the new scene no longer uses (and sweeps every 20 s for what left with a person or a vehicle). See « Performance ».
- The facades of a district share one atlas texture and one material.

### Diagnostics and CI

- « Mesure de fluidité » (frames a second, frame time, memory where the browser gives it, district changes) from the device-playtest work is in the build, off by default.
- The CI workflow « Game checks » runs as five parallel jobs (unit, build, city, online, launch) with the same commands as before.

## Validation

VALIDATION_SECTION

## Performance

Measured with `scripts/perf-hubs.mjs` on a production build served locally, phone viewport 390 × 844, one page visiting the five districts in order at 10 h then 21 h. « Before » is `38aa8461` (the accepted candidate with the diagnostics and the CI split), « after » is the release.

PERF_TABLE

- **Textures and geometries held by the renderer** are the cumulative count as the tour goes on: before, they only grew (978 textures by the fifth district on Medium); after, they stay at what the current district uses.
- **Three Plateau ↔ Corniche round trips** (Medium): textures 367 → 646 and growing before (about 52 MB of texture memory by the third trip); 162 → 177 and flat after (about 36 MB). Geometries flat at 115 to 118.
- **Draw calls** include the people and vehicles in view, which differ from run to run; the scenery itself lost 0 to 2 calls per district in the first world pass and gained none in the second.
- **Triangles**: Plateau, Corniche and Almadies are level or lower; Pikine +2 %, Mermoz +4 % at 10 h (the roofs and wall piers of the second pass).
- **First load**: Medium 38 files, 7 039 → 7 052 kB; Low 37 files, 6 368 → 6 381 kB (transferred). The whole build is 80 files, about 20 MB.
- **Not measured here**: frames a second, frame time and heat on a phone. The facade shader uses `textureGrad` and one more vertex attribute; this is to be checked on a real device with « Mesure de fluidité ».
- **Known, not fixed**: the JavaScript heap after a forced collection still creeps by about 4 to 10 MB per district round trip. The cause was not found; the graphics-memory leak, which was the large one, is closed.

## Known issues

KNOWN_ISSUES

## Deployment

DEPLOYMENT_SECTION
