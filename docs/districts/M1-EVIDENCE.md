# M1 · Mermoz / Sacré-Cœur: Gate A evidence (engineering)

- **Gate A** is engineering complete, evidenced here.
- **Gate B** is the owner's own iPhone playtest. It has **not happened**, and nothing here claims it.

- **Branch:** `feature/ld-m1-mermoz-20261025`.
- **Base:** `integration/unified-beta-20261022` @ `a1cf012`.
- **Evidence run on:** `cf87253`. The commits after it add only this doc, the proof files and a log-only probe in the check.

How M1 relates to Living Dakar 2.0 is in [`CONTRACT.md`](CONTRACT.md); the design is in [`M1-MERMOZ.md`](M1-MERMOZ.md).

## What is implemented

| Golden-path step | State | Where |
|---|---|---|
| 1. A VTC ride offered on the Corniche, free to take or ignore | ✅ The first in the list, among the ordinary ones | `src/districts/mermozRules.ts`, `src/transport/vtc.ts` `vtcHooks.extra` |
| 2. A believable route out (Corniche → Fann/Point E → VDN) | ✅ | `src/road/routes.ts` `corniche-mermoz` |
| 3. Traffic slows, yields and queues | ✅ Existing corridor traffic, plus stopping at the BRT signals (cars held at the red were counted in the check) | `src/road/traffic.ts`, `src/road/brt.ts` |
| 4. The BRT corridor and station near Sacré-Cœur | ✅ The corridor crosses at right angles, separate from the VDN. It has a red busway, separator kerbs, bollards, an island station, 2 buses (approach, dwell, departure into the portals) and signals. The busway is not driveable ground. | `src/road/brt.ts` |
| 5. A quieter Mermoz street | ✅ A villa street under the trees (x = 60) | `src/world/builder.ts` (`mermozLot`, `mermozShade`, `filaos`) |
| 6. A real kerbside bay | ✅ The existing VTC kerb bay, kept clear of parked cars | `VTC_POINTS.mermoz` |
| 7. Paid once through the existing payment | ✅ One wallet line; a reload pays nothing again | `vtc.ts` `alight()` (unchanged payment) |
| 8. A completion card | ✅ The existing card (« Course terminée · Aminata Ndiaye », fare, duration, distance) | `streak.done` |
| 9. An NPC acknowledges it | ✅ Pape Diouf, gardien of Résidence Les Filaos | `src/districts/mermoz.ts` |
| 10. Later recognition plus one more legitimate job | ✅ Mme Ndiaye's ride to Banque Teranga · Plateau, offered once | `mermozRules.ts` `recognition`, `mermozRequests` |
| 11. Drive home or keep exploring | ✅ | — |
| 12. Free exploration with no job | ✅ The road, BRT and district all work with no ride in hand | — |

**What is missing, or not proven here**

- **The VDN is narrow.** It has one lane each way plus a wide shoulder and a median, because the corridor system uses one road width for every road. A 2 × 2 carriageway would mean changing the lane model shared by all the roads.
- **Café Touba · Sacré-Cœur** exists (the existing kiosk and its actions) but the journey check does not exercise it.
- **The phone's full map** listing Mermoz as playable was not checked separately. The minimap and the goal line work in Mermoz; they appear in every screenshot.
- **The "later visit"** in the check is a labelled debug shortcut (`__dakar.nextDay`). In real play it needs 2 city hours, which is 2 real minutes, and a new arrival in Mermoz.
- **Sacré-Cœur's street life** is not done. Pedestrians and parked vehicles come from the existing systems; there are no extra parked motorbikes.

## The recorded golden path

- **Script:** `scripts/check-mermoz-journey.mjs`, driven by real touch with a 390 × 844 phone viewport, in one uninterrupted session.
- **Run 4: 22/22 PASS, no JavaScript error.** The log is [`proof/m1/golden-path-run4.log`](proof/m1/golden-path-run4.log) and the screenshots are [`proof/m1/golden-path-run4.jpg`](proof/m1/golden-path-run4.jpg).
- **The video** (13 min 45 s, H.264, 390 px wide) was delivered with this report. It is not committed (14 MB).
- **Software rendering.** The run is SwiftShader in headless Chromium, so the car and the clock move slower than on a phone.
- **Earlier runs:**
  - Run 1 stopped behind a parked car in the kerb lane. The check now pulls into the bay from the traffic lane, as the existing VTC check does.
  - Runs 2 and 3 had script-side failures only: matching the card by its title, reading the camera array, and the fare's narrow no-break space. Every gameplay assertion passed in both.

## Tests

| Suite | Result |
|---|---|
| `npm test` (vitest) | **2182 passed, 2 skipped, 0 failed**: 180 files, including `tests/mermoz.test.ts` and the new chunk suites « the VDN: a divided artery » and « the BRT crossing at Sacré-Cœur » |
| `npx tsc --noEmit -p .` · `npm run typecheck:server` · `npm run build` | pass |
| `npm run check:city` · `check:online` · `check:launch` (the CI browser suites, local run on the built `cf87253`) | **37/37 · 46/46 · 70/70 PASS** |
| `scripts/check-mermoz-journey.mjs` | 22/22 (run 4) |

## Save, payment and memory

- **No save schema change.** `SCHEMA_VERSION` stays 6 and no migration was added.
- **New keys only in the existing `flags` / `counters`, prefixed `mz_`** (listed in M1-MERMOZ.md § Memory).
- **The check proves these points:**
  - One wallet line for the ride.
  - The wallet is unchanged after a reload and after the drive home.
  - Pape's memory (`mz_first_ride`, `mz_filaos_rides`, `mz_pape_met`) survives a reload.
  - The recognition counts once per day.
  - The first ride is never offered again.
- **`tests/mermoz.test.ts` proves:**
  - The rides cannot be farmed.
  - The memory survives a JSON round trip.
  - Rides that end elsewhere change nothing.
- **`HUB_IDS` gains `'mermoz'` at the end**, so the stored hub indices of existing saves keep their meaning. This needs LD2's sign-off (CONTRACT.md row 3).

## Performance against the baseline

The baseline is the repo's own draw-call budget (`scripts/check-perf-evening.mjs`): **180 / 300 / 420 calls** on low / medium / high.

**Method.** `scripts/m1-views.mjs` puts fixed cameras on the same places, on the build before the visual pass (`df48f78`) and after it (`cf87253`). Both runs use low quality at 390 × 844 in SwiftShader.

**What transfers to a phone.** Draw calls and triangles do. The frame times do not: they are a CPU renderer's, and no iPhone was measured.

| View | Draw calls before → after | Triangles before → after | Frame median ms (SwiftShader, not a phone) |
|---|---|---|---|
| ref-plateau-walk (existing hub, for scale) | 69 → 70 | 75,718 → 75,920 | 83 → 83 |
| vdn-drive | 60 → 59 | 40,268 → 36,322 | 67 → 67 |
| pointe-drive | 79 → 81 | 49,892 → 51,224 | 67 → 100 |
| brt-drive | **139 → 139** | 142,484 → 147,557 | 133 → 133 |
| sacrecoeur-approach-drive | 128 → 131 | 127,096 → 136,555 | 117 → 133 |
| sacrecoeur-walk | 54 → 54 | 93,302 → 99,191 | 117 → 133 |
| sacrecoeur-drive | 55 → 52 | 95,642 → 101,001 | 117 → 117 |
| mermoz-walk | 52 → 52 | 93,808 → 97,211 | 117 → 117 |
| mermoz-drive | 46 → 46 | 87,784 → 92,791 | 100 → 100 |
| mermoz-filaos | 58 → 59 | 95,004 → 100,315 | 100 → 100 |
| mermoz-high | 46 → 46 | 87,346 → 92,371 | 100 → 117 |

**Reading.**
- The visual pass costs at most 3 draw calls and about 5–7 % more triangles.
- **The BRT junction is the heaviest place on the trip: 139 calls, 77 % of the low budget, double the Plateau reference.** It is the first thing to trim if the iPhone run is slow. Candidates are the station's people and the frontage buildings.
- Each corridor chunk now has one more mesh (the window texture); `chunks.test.ts` allows 6.

Before/after views from matching cameras: [`proof/m1/before-after-corridor.jpg`](proof/m1/before-after-corridor.jpg) and [`proof/m1/before-after-mermoz.jpg`](proof/m1/before-after-mermoz.jpg) (top row before, bottom row after). The raw numbers are `proof/m1/perf-*-low.json`.

## Known issues (with how to reproduce them)

1. **The directions flicker « Fais demi-tour » on Mermoz's streets.**
   - *Seen:* in the run-3 recording, on the way to the Filaos. The goal line alternates « À gauche dans … m » and « Fais demi-tour » while the car keeps getting closer.
   - *Likely cause:* the street route (`src/ui/minimapMath.ts routePath`) ignores the driver's heading. When the way ahead and the way back are nearly the same length, the recomputation every 6 m flips between them. That is the shared navigation, not Mermoz's.
   - *Not confirmed in an offline replay* of the same route. `check-mermoz-journey.mjs` now logs every change of the goal line on that leg, to pin it down.
   - *Repro:* take the first ride, drive the corridor and follow Sacré-Cœur's street then the Mermoz streets to the Filaos, watching the goal line.
   - *Proposed fix:* bias the route toward the driver's heading, or add hysteresis before a U-turn is announced. It is not done here because `navigation.ts` is shared.
2. **The BRT junction's cost.** See the performance section. The iPhone frame rate there is unknown until Gate B.
3. **A rollback hazard.** A car parked in Mermoz, loaded by a client older than this branch, would appear at the same coordinates in that client's fallback hub. This only happens on a rollback (CONTRACT.md).
4. **The VDN has one lane each way.** See « What is missing ».
5. **The multiplayer room `mermoz`** only exists on a worker built from this branch, such as the preview, not production.

## The iPhone preview

- **Source:** the project's own Cloudflare Workers Builds (no configuration changed by this session), from the push of this branch.
- **Link and SHA check:** in the PR description.
- **Unverified here.** This sandbox cannot reach `*.workers.dev`, so the link has not been opened from this session.
- **Checking the build:** the build id shown in the game (Réglages) is `<short SHA>-<date>`. It must start with the PR's head SHA.
