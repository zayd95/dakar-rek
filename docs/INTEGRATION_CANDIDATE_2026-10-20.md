# Integration candidate, 20 Oct 2026 (local, isolated, not for production)

Branch `integration/candidate-vehicles-pikine-20261020`. Code commit `41399ac` (this file is the only addition after it).
Built from the PR #53 head (`8ba4508`, Pikine Street DNA, which already contains the PR #52 signage commits) by merging, in this order:

| # | Merged | Head | Result |
|---|---|---|---|
| 1 | #50 M1-C Social Stickiness | `bf4fd34` | clean |
| 2 | #54 vehicle condition, roadside repair, Garage Modou S3 (carries #49 owned vehicles) | `8ebfed4` | clean |
| 3 | #51 continuous driving | `ff2510a` | 2 conflicts in `src/transport/ownedModule.ts` |
| 4 | #55 approved final audio mix B | `8b83310` | 5 conflicts (audio files, `ownedModule.ts`) |
| 5 | #44 ordinary wrestling purses | `ed7a8c2` | clean |

No published branch was rewritten, rebased or force-pushed; #52 is not duplicated (its commits come once, through #53).

## Conflicts and how they were resolved

* **#51 × #54, `ownedModule.ts`.** Both kept. The per-vehicle fields `fixAff` (roadside repair) and `carry` (crossing into the next district) sit side by side; the drive step uses #54's `scaledDrive(...)` (a worn car is slower) and #51's `z0` (the z before the step, which the crossing test needs): `const drv = scaledDrive(...); const z0 = this.st.z, hit = driveStep(this.st, input, drv, ...)`.
* **#55 audio, five files.** The approved mix replaces the earlier one. Every audio path (`vehicleAudio.ts`, `vehicleSamples.ts`, `public/assets/audio/vehicles/*`, the audio tests and checks, `docs/audio/*`) is **byte-identical to the #55 head** (verified file by file with `git rev-parse`), with two necessary exceptions:
  * `src/transport/vehicleAudio.ts` = #55's file **plus** `crank(prof)`, the sound of a dead car that will not start (from #54). It uses the recorded ignition at #55's approved ignition level and softening (`IGNITION`, 3.6 kHz low-pass, 70 ms attack): the same sample and level as the approved ignition, cut off before the engine catches. No level of the approved mix was changed.
  * `ownedModule.ts` takes #55's `cabin` line and #54's rule that a dead car (`hp() <= 0`) never starts the engine loops: `if (!running && hp() > 0) run(...)`, `cabin = insideCar()`, `if (running) update(...)`.
* The earlier-mix commits (`a1c8d04`, `e19bba3`) are in the history through #54 and #51 (as merged by those branches); their audio content does not survive in the tree.

## Not included

PR #42 Meshy avatars (separate later integration; the stack already carries the save field), #52 as a separate branch, the east grid, any new gameplay, visual round or cleanup.

## What was run (software renderer: frame rates are not phone numbers)

Unit/type/build: `tsc` clean, server `tsc` clean, `vite build` OK, **Vitest 149 files, 1772 passed, 2 skipped**.

| Area | Check | Result |
|---|---|---|
| Vehicle condition | `check-condition` (real touch) | 16/16 |
| **Garage Modou S3** | `check-garage` | 15/15 |
| Collision | `check-collision` | 17/17 |
| Pedals | `check-pedals` | 13/13 |
| Dealers | `check-dealers` | 8/8 |
| Legacy car | `check-legacy-car` | 7/7 |
| Berline moderne | `check-car` | 44/44 |
| Jakarta | `check-moto` | 36/36 |
| Ownership | `check-ownership` | 63/63 |
| **Prestige Auto** | `check-prestige-flow` (`SKIP_LAP=1`), `check-prestige-trial` | 23/23, 7/7 |
| Audio | `check-engine-sound`, `check-audio`, `check-horn` | 9/9, 13/13, 17/17 (first run 16/17, see below) |
| Pikine | `check-pikine-dna`, `check-pikine-signs` | 13/13, 13/13 |
| Pikine camera | route / home / kerb | 636 samples 0 hidden 0 near lens 1 blocked (same single market-gate frame as round 3); 195 clean; 407 clean |
| Minimap, city, career, economy | `check-minimap`, `check-city-life`, `check-career`, `check-economy` | 93/93, 37/37, 73/73, 49/49 |
| Arena | `check-arena-exterior` | 42/42 |
| Tiak moto | `check-tiak-moto` | 57/57 |
| UI / phone | `check-ui`, `check-phone` | 149/149 on rerun (see below), 69/69 |
| **Multiplayer** | `npm run check:online` (real local Workers/Durable Objects, two browsers) | 44/44 |
| Social (#50) | `check-anchors`, `check-regular-mamadou`, `check-social`, `check-recognition` | 25/25, 19/19, 24/24 on rerun, 20/20 on rerun |
| **Save compatibility** | `check-save-compat` (production build ↔ candidate), `check-save-v6` (schema 5 ↔ candidate) | 25/25, 18/18 |
| Full gameplay suite | `npm run check:launch` (CI's `check-launch-controls --full`: shots.mjs desktop and phone, social and scenes, local Workers) | 70/70, rc 0 |
| Mobile performance (software) | `check-perf-evening` low/medium arena evening; `tests/perf.*` budgets | low 69–129 draw calls, medium 104–236; budgets held (unit tests green) |

## Failures, and what they are

Pre-existing (identical on the base, recorded separately, not caused by the merge):
* `check-npc-density`: 4 failures, all gargote (`people eat seated at the gargote at lunch`, `the player sits on a free gargote bench`, desktop and phone).
* `check-arena-arrival`: 24/28, the same four-check shape as #53 alone (24/28).
* `check-tiak-tour`: 51/58, the same seven ride-timing failures on #53 alone (51/58).
* `check-prestige-flow` with `DRIVE_ON=1` (#51's return leg): 33/34, `the way back works too`. The **identical** failure and count on #51's own head built alone, so not introduced by the merge. The forward crossing, the collision, the reload and the same-car checks pass. Left to the Vehicles session.

Timing flakes (failed once, passed on rerun; each rerun with nothing else running): `check-horn` 16/17 → 17/17 (and #55 alone 17/17 twice); `check-ui` 147/149 → 149/149 (#53 alone 149/149, #55 alone 149/149); `check-social` 23/24 → 24/24; `check-recognition` 19/20 and 18/20 → 20/20 twice on the candidate (20/20 on #50 alone and on the candidate without #44).

Not run: a real phone (iPhone frame rate, thermal, audio session, haptics), hosted multiplayer.
