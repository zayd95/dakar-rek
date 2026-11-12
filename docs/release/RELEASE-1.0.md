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

Three passes (`docs/proof/release/world/NOTES.md`, with before/after pairs). All of it is in the districts' merged batches: **no draw call added**; the approved Ngor / Almadies layout, venues and parking are untouched.

- **Plateau**: offices over shops (ribbon windows, concrete fins), flats with loggias and balconies, arcades kept; on the roofs set-back storeys, oversailing slabs, stair heads, tanks and masts.
- **Pikine**: houses with a house's ground floor, bare block walls, corner boutiques, the floor to come (posts with their irons), blue tanks.
- **Mermoz · Sacré-Cœur**: tiled fronts over shops, villas under tile roofs, wall piers, gate globes lit at night.
- **Corniche**: modern residences, the painted median, a whitewashed sea wall with globes, benches facing the sea.
- **Corniche, after the owner's drone video of 11 November** (third pass): a headland of ochre laterite with the great **round esplanade** on it, reached on foot from the end of the street; wavy painted terraces in red, yellow and purple; black basalt along the shore; turquoise shallows and foam; the promenade paved in bands of red and purple with yellow lines; the pitch in sand inside a yellow kerb. The evening sun is a larger, softer ball as it goes down over the sea, and its light lies on the water.

### Memory and loading

- **A leak was fixed.** three.js does not free a material's textures, a skeleton's bone texture or a geometry when the object leaves the scene; every district visited stayed on the graphics card. `src/core/textureSweep.ts` notes what the scene holds before a district change and frees what the new scene no longer uses (and sweeps every 20 s for what left with a person or a vehicle). See « Performance ».
- The facades of a district share one atlas texture and one material.

### Diagnostics and CI

- « Mesure de fluidité » (frames a second, frame time, memory where the browser gives it, district changes) from the device-playtest work is in the build, off by default.
- The CI workflow « Game checks » runs as five parallel jobs (unit, build, city, online, launch) with the same commands as before.

## Validation

Final run on a quiet machine, production build of the game code at `6a6b371f` (journeys) and `bcd12c3e` (the mosque's removal: unit suite, Corniche walk and smoke test run again). Headless Chromium, phone viewport, real touch events.

| What | Result |
|---|---|
| Type check, production build, online build, `wrangler deploy --dry-run` | pass |
| Unit suite | 253 files, 3 744 tests pass (4 skipped) |
| Automatic walk/run; no Sprint, Footing or stamina control (`check-stride`) | 18/18 |
| Phone (`check-phone-shell`) | 23/23 |
| Map (`check-geomap`) | 32/32 |
| Thumb held through the end of a dance (`check-thumb-after-activity`) | 6/6 |
| Corniche esplanade on foot (`check-corniche-esplanade`) | 10/10 |
| Monument stair (`check-monument-stair`) | 9/9 |
| Smoke test of the build: stamp, first screen, HUD, stick, phone, map, five districts, save after reload (`check-public-smoke`) | 15/15 |
| Journey: nightlife | 73/73 |
| Journey: Almadies evening | 42/42 |
| Journey: VTC ride (pick-up, cross-district drive, drop-off, pay) | 19/19 |
| Journey: football match on the Corniche | 25/25 |
| Journey: earning, guidance, bank | 27/27 |
| Journey: day and night | 18/18 |
| Almadies district plan and budgets | 19/19 |
| Online: presence in every district, dropped connection and reconnection (local worker) | 46/46 |

Run earlier the same day on the release before the Corniche work, not run again since (they do not touch the Corniche): Almadies parking 9/9, rooftop 43/43, Le Patio 61/61, Ngor beach 16/16, boats to the island 37/37, Mermoz 22/22, Mermoz home 11/11, Cité Jàmm house 6/6, trade 33/33.

Not verified: anything on a real phone; driving feel beyond the scripted drivers; the public server's online features (see « Known issues »).

## Performance

Measured with `scripts/perf-hubs.mjs` on a production build served locally, phone viewport 390 × 844, one page visiting the five districts in order at 10 h then 21 h. « Before » is `38aa8461` (the accepted candidate with the diagnostics and the CI split), « after » is the release.

| Quality | District | Hour | Draw calls | Triangles | Geometries held | Textures held |
|---|---|---|---|---|---|---|
| medium | pikine | 10 h | 127 → 144 | 176,831 → 184,581 (+4.4 %) | 171 → 160 | 223 → 145 |
| medium | pikine | 21 h | 182 → 186 | 209,695 → 215,031 (+2.5 %) | 204 → 181 | 362 → 255 |
| medium | plateau | 10 h | 104 → 99 | 118,194 → 117,360 (-0.7 %) | 165 → 119 | 463 → 282 |
| medium | plateau | 21 h | 107 → 110 | 115,444 → 116,300 (+0.7 %) | 171 → 124 | 492 → 228 |
| medium | corniche | 10 h | 71 → 72 | 115,712 → 147,545 (+27.5 %) | 140 → 85 | 546 → 225 |
| medium | corniche | 21 h | 82 → 84 | 115,916 → 150,121 (+29.5 %) | 152 → 92 | 599 → 236 |
| medium | almadies | 10 h | 81 → 77 | 234,398 → 234,194 (-0.1 %) | 190 → 115 | 792 → 308 |
| medium | almadies | 21 h | 82 → 84 | 232,876 → 234,674 (+0.8 %) | 196 → 118 | 936 → 321 |
| medium | mermoz | 10 h | 62 → 62 | 174,421 → 181,951 (+4.3 %) | 161 → 74 | 956 → 206 |
| medium | mermoz | 21 h | 61 → 68 | 165,149 → 182,869 (+10.7 %) | 161 → 79 | 978 → 210 |
| low | pikine | 10 h | 122 → 125 | 144,301 → 145,159 (+0.6 %) | 145 → 131 | 110 → 55 |
| low | pikine | 21 h | 146 → 143 | 152,495 → 150,807 (-1.1 %) | 176 → 149 | 138 → 59 |
| low | plateau | 10 h | 98 → 98 | 91,468 → 88,474 (-3.3 %) | 147 → 102 | 153 → 53 |
| low | plateau | 21 h | 109 → 105 | 92,364 → 88,444 (-4.2 %) | 153 → 105 | 168 → 47 |
| low | corniche | 10 h | 72 → 70 | 91,126 → 116,679 (+28.0 %) | 124 → 73 | 184 → 47 |
| low | corniche | 21 h | 74 → 77 | 90,110 → 117,619 (+30.5 %) | 132 → 77 | 199 → 46 |
| low | almadies | 10 h | 72 → 70 | 180,436 → 181,044 (+0.3 %) | 144 → 80 | 219 → 49 |
| low | almadies | 21 h | 75 → 77 | 179,790 → 181,734 (+1.1 %) | 142 → 83 | 244 → 54 |
| low | mermoz | 10 h | 56 → 56 | 104,079 → 107,487 (+3.3 %) | 129 → 64 | 266 → 46 |
| low | mermoz | 21 h | 64 → 62 | 105,133 → 107,881 (+2.6 %) | 133 → 67 | 288 → 46 |

- **Textures and geometries held by the renderer** are the cumulative count as the tour goes on: before, they only grew (978 textures by the fifth district on Medium); after, they stay at what the current district uses.
- **Three Plateau ↔ Corniche round trips** (Medium): textures 367 → 646 and growing before (about 52 MB of texture memory by the third trip); 162 → 177 and flat after (about 36 MB). Geometries flat at 115 to 118.
- **Draw calls** include the people and vehicles in view, which differ from run to run; the scenery itself lost 0 to 2 calls per district in the first world pass and gained none in the second.
- **Triangles**: Plateau and Almadies are level or lower; Pikine +2 %, Mermoz +4 % at 10 h. **The Corniche is up about 27 %** (115 712 → 147 545 on Medium at 10 h): the esplanade, the monument's hill and stair, and the three models (statue 14 431, lighthouse 5 403, two baobabs 4 873 each). Its draw calls are level (71 → 72). It stays below Pikine (180 000) and the Almadies (234 000), which the accepted candidate already carried.
- **First load**: Medium 38 files, 7 039 → 7 052 kB; Low 37 files, 6 368 → 6 381 kB (transferred). The whole build is 80 files, about 20 MB.
- **Not measured here**: frames a second, frame time and heat on a phone. The facade shader uses `textureGrad` and one more vertex attribute; this is to be checked on a real device with « Mesure de fluidité ».
- **Known, not fixed**: the JavaScript heap after a forced collection still creeps by about 4 to 10 MB per district round trip. The cause was not found; the graphics-memory leak, which was the large one, is closed.

## Known issues

Severity: **high** blocks a player; **medium** is seen by a player and has a way round; **low** is cosmetic, rare, or only affects the checks.

| # | Severity | What | Where it stands |
|---|---|---|---|
| 1 | medium | **Nothing was measured on a phone.** Frame rate, heat, loading time on a mobile network and touch feel are unknown from here. The Corniche is the heaviest it has been (about 110 000 triangles of scenery with its models; the Almadies is heavier still at about 234 000 in view) | « Mesure de fluidité » is in the build for the owner's device test (`docs/mobile/MOBILE-01.md`) |
| 2 | medium | **Online play is verified against a local server only.** Presence in every district and a dropped connection coming back are checked by `check:online` on a local worker; messages, money transfers between players and home visits were not exercised on the public server | treat multiplayer on the public address as experimental until two phones have tried it |
| 3 | low | The JavaScript heap still creeps by about 4 to 10 MB per district round trip after a forced collection; cause not found. The graphics-memory leak (the large one) is fixed | a very long session may slow down; a reload clears it |
| 4 | low | `?debug` works on the public build, as on every earlier one: it lets anyone who types it change their own local save (hour, money, position). It exposes nobody else's data | to be removed or gated before a real launch |
| 5 | low | On foot the goal line gives the distance as the crow flies; the minimap's dotted route and the map's card give the distance by the streets. The two figures differ | by design; `docs/proof/release/map/AUDIT.md` |
| 6 | low | The esplanade's terraces and disc are painted flat (the ground has no height there); the statue group's far side is the generator's guess; the lighthouse is a lighthouse on a keeper's house, not a survey of the Mamelles' | `docs/proof/release/world/NOTES.md`, `docs/ASSET_REGISTER.md` |
| 7 | low | Landmarks and Dakar 2026 dressing are on the Corniche only | the other districts are as they were |
| 8 | low (checks) | The scripted drivers and walkers of the journeys are sensitive to a loaded machine: the trade journey's game day rolled over once while the machine was building something else; the night check's screenshot timed out once the same way. Both pass on a quiet machine | no change to the game |
| 9 | low (hosting) | Cloudflare's preview builds for branches other than the production one have failed since 25 October (no log reachable from here; the account's Durable Object namespace limit is the likely cause) | previews are not needed for the public address |

Fixed during this release, for the record: a thumb already on the stick when an activity ended did not move the player until it was lifted and put down again (found by the Almadies evening journey, red in two runs out of four; `scripts/check-thumb-after-activity.mjs`).

## Deployment

- **How**: Cloudflare Workers Builds publishes every push to the production branch `wip/visual-pass` (`docs/LAUNCH.md`): `npm run build:online`, then `npx wrangler deploy`. Publication is a fast-forward of that branch to the validated commit of `release-1.0`; `main` is not touched.
- **Rollback**: the tag `rollback/production-before-release-1.0` marks what was public before (`e6c678a0`, 11 October). The release adds a server class (`Social`, migration `v2-social`); Cloudflare cannot go back to a version from before a migration, so the practical way back is forward: push a commit that restores the game of the accepted candidate `92a6e2cf` (which already has that class) to `wip/visual-pass`.
- **Status and the public address**: recorded in the pull request ([PR #91](https://github.com/zayd95/dakar-rek/pull/91)) at publication, with the deployed commit and the result of the smoke test against the public address.
- **12 November, publication note**: the merge commit `1ca70ad4` reached `wip/visual-pass` but no production build ran for it; the public address kept an older build, and at 20:03 UTC a manual build put the branch `backup/ui-v2-skin-20261017` (`66355861`) on it. The preview of `wip/visual-pass` served `1ca70ad4` and passed the smoke test 16/16. This commit is pushed to `wip/visual-pass` to make Workers Builds publish the release to the public address.
