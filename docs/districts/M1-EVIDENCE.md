# M1 · Mermoz / Sacré-Cœur: Gate A evidence (engineering)

- **Gate A** is engineering complete, evidenced here.
- **Gate B** is the owner's own iPhone playtest. It has **not happened**, and nothing here claims it.

- **Branch:** `feature/ld-m1-mermoz-20261025`.
- **Base:** `integration/unified-beta-20261022` @ `a1cf012`.
- **Evidence run on:** `cf87253` for run 4 and the low-quality numbers. **Run 5** and the medium-quality numbers were made after the owner's video, on the polish (the rond-point, the autopont and the baked depth): `852016e`, plus a test and these docs.

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
- **Sacré-Cœur's street life now works** (after the owner's « more M1 polish »). Rue de Sacré-Cœur's « busy street » had been drawn 7 m off the street's centre line, so it weighed nothing, and the street got no more life than a villa street.
  - **The fix:** it is on the centre line now (`src/crowd/streetPlan.ts`), and a test checks every district's busy streets (`tests/street.test.ts`).
  - **What the existing systems now bring to it:**
    - the street crowd;
    - the street dress: parasol stalls, painted cantines, a fruit barrow;
    - parked vehicles: lines of Jakarta motorbikes nose to the kerb, and taxis (`src/game/parkedVehicles.ts`, a busy-street mix for Mermoz).
  - **Kept for the villa streets:** 40 % of the parked cars still park there (`tests/streetDress.test.ts`).
  - **Cost:** draw calls are within 5 of before on the same cameras (43–70 at medium).
  - **Proof:** [`proof/m1/before-after-sacrecoeur-street-life.jpg`](proof/m1/before-after-sacrecoeur-street-life.jpg) and [`proof/m1/before-after-sacrecoeur-motos.jpg`](proof/m1/before-after-sacrecoeur-motos.jpg).

## The recorded golden path

- **Script:** `scripts/check-mermoz-journey.mjs`, driven by real touch with a 390 × 844 phone viewport, in one uninterrupted session.
- **Run 8 (with Sacré-Cœur's street life): 22/22 PASS, no JavaScript error, « Fais demi-tour » 0 times.** The log is [`proof/m1/golden-path-run8.log`](proof/m1/golden-path-run8.log).
- **Run 7 (with the navigation fix): 22/22 PASS, no JavaScript error, « Fais demi-tour » shown 0 times on the way to the drop-off** (35 in run 5). The log is [`proof/m1/golden-path-run7.log`](proof/m1/golden-path-run7.log).
- **Run 5 (after the polish): 22/22 PASS, no JavaScript error.**
  - The road now has the rond-point and the autopont: the car goes round the island at the BRT signals and under the autopont, both ways.
  - The log is [`proof/m1/golden-path-run5.log`](proof/m1/golden-path-run5.log). The screenshots are [`proof/m1/golden-path-run5.jpg`](proof/m1/golden-path-run5.jpg).
  - Frames from the recording at the rond-point and the autopont: [`proof/m1/golden-path-run5-rondpoint-autopont.jpg`](proof/m1/golden-path-run5-rondpoint-autopont.jpg). These are low quality, as the check runs.
  - The video is 14 min 2 s, H.264, 390 px wide. It was delivered with the report and is not committed (13 MB).
- **Run 4 (before the polish): 22/22 PASS.** The log is [`proof/m1/golden-path-run4.log`](proof/m1/golden-path-run4.log) and the screenshots are [`proof/m1/golden-path-run4.jpg`](proof/m1/golden-path-run4.jpg).
- **Software rendering.** The run is SwiftShader in headless Chromium, so the car and the clock move slower than on a phone.
- **Earlier runs:**
  - Run 1 stopped behind a parked car in the kerb lane. The check now pulls into the bay from the traffic lane, as the existing VTC check does.
  - Runs 2 and 3 had script-side failures only: matching the card by its title, reading the camera array, and the fare's narrow no-break space. Every gameplay assertion passed in both.

## Tests

| Suite | Result |
|---|---|
| `npm test` (vitest) | **2206 passed, 2 skipped, 0 failed**: 180 files, with the navigation fix's tests in `tests/navRules.test.ts` and the street-life tests in `tests/street.test.ts` and `tests/streetDress.test.ts`. This includes `tests/mermoz.test.ts` and the chunk suites « the VDN: a divided artery », « the BRT crossing at Sacré-Cœur », « the rond-point of Sacré-Cœur, the BRT through it » and « the autopont at the way into Mermoz ». |
| `npx tsc --noEmit -p .` · `npm run typecheck:server` · `npm run build` | pass |
| `npm run check:city` · `check:online` · `check:launch` (the CI browser suites, local runs on the built `cf87253`, on the polish, on the navigation fix and on the street life) | **37/37 · 46/46 · 70/70 PASS** each time |
| `scripts/check-mermoz-journey.mjs` | 22/22 (run 4; run 5 after the polish; run 7 with the navigation fix; run 8 with Sacré-Cœur's street life) |
| `scripts/check-nav-flicker.mjs` (new) | 0 « Fais demi-tour » in 10 runs across the five districts; 9 of the 10 showed it before the fix ([`proof/m1/nav-flicker-before-after.log`](proof/m1/nav-flicker-before-after.log)) |

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

## The polish after the owner's video (medium quality)

The owner watched the run-4 video and asked for more depth and shadow, a rond-point after the BRT and an autopont at the way into Mermoz, with two reference photos. What changed:

- **The rond-point de Sacré-Cœur.** The BRT runs straight through it, splitting the planted island, as in the photo (M1-MERMOZ.md § The geography).
- **The autopont de Mermoz.** Ochre leaning piers, a grey V-panel fascia, a railing and lamps, with cars crossing on the deck. It is scenery: the player drives under it.
- **Baked depth** (`src/world/batch.ts` `shade`, off by default). It is used only by Mermoz and the Corniche–Mermoz road:
  - a contact shade at the foot of walls, trunks and posts;
  - darker undersides on crowns, soffits and balconies;
  - a floor band at each storey on the blocks.
- **Real-time shadows** are the existing ones: off on low, a 1024 map on medium (the phone default), 2048 on high. Nothing was added to them.

**Method.**
- `scripts/m1-views-medium.mjs` at medium quality, 390 × 844, SwiftShader.
- *Before* is `9aff7f0` (the previous head of PR #67); *after* is `852016e`.
- The Sacré-Cœur and Mermoz cameras are identical in both runs.
- The road views are placed relative to the BRT crossing, because the road itself changed: it gained the roundabout and the autopont and grew from 1.30 to 1.39 km.

| View (medium; budget 300 calls) | Draw calls before → after | Triangles before → after |
|---|---|---|
| vdn-drive | 63 → 62 | 48,122 → 51,516 |
| brt-approach (the heaviest place) | **205 → 200** | 246,091 → 245,427 |
| brt-aerial | 183 → 165 | 230,601 → 228,621 |
| autopont-approach (new) | — → 169 | — → 238,901 |
| sacrecoeur-walk | 50 → 51 | 154,763 → 155,605 |
| sacrecoeur-drive | 52 → 51 | 159,911 → 155,619 |
| mermoz-walk | 54 → 52 | 153,845 → 154,153 |
| mermoz-drive | 54 → 53 | 153,763 → 154,077 |
| mermoz-filaos | 62 → 61 | 161,107 → 161,609 |

**Reading.**
- The baked depth costs nothing per frame. It is vertex colour inside the existing merged meshes, so it adds no draw calls.
- The floor bands add about 0.2–7 % triangles.
- The roundabout first measured 263 calls at the BRT approach. Trimming it to one person on two of its corners, and the autopont to one or two cars, brings it to 200, under the 205 it replaced. That is 67 % of the medium budget.
- The iPhone frame rate there is still unknown until Gate B.

Before/after sheets (top row before, bottom row after):
- [`proof/m1/before-after-rondpoint-autopont-medium.jpg`](proof/m1/before-after-rondpoint-autopont-medium.jpg)
- [`proof/m1/before-after-depth-medium.jpg`](proof/m1/before-after-depth-medium.jpg)

The raw numbers are `proof/m1/perf-*-medium.json`.

## Known issues (with how to reproduce them)

1. **Fixed: the directions flickered « Fais demi-tour » while driving, on every district's streets** (the owner's report, after seeing Mermoz).
   - *Causes, found by replaying the shared navigation offline* (`src/game/navigation.ts`, `src/game/navRules.ts`):
     - The way was recomputed only every 6 m, but the next turn was read from the car to the way's first point. That point was where the way had been computed, so a few metres later it was behind the car, and the turn read as a U-turn.
     - The car drives about 3.5 m right of the street's centre line. The hop onto the centre line read as « À droite », and near a junction as a diagonal.
     - The shortest way ignored the car's heading, so a near tie flipped between ahead and back.
     - Halfway round a corner, the car points between the two streets, so neither counted as its street.
   - *The fix:* `driverWay` in `navRules.ts`, used by the goal line and the minimap at the wheel:
     - It is recomputed every update, from the car's own street, level with the car.
     - It prefers going round the block to a U-turn, within `UTURN_COST` (120 m).
     - It holds its last call against a near tie (`UTURN_HYSTERESIS`, 30 m).
     - In a dead end, or when the goal is only back this way, the U-turn stands.
     - Walking directions are unchanged.
   - *Where it lives:* in the shared navigation, so it fixes every district, not only Mermoz. LD2's branch does not touch these files (checked against `f5c1207`).
   - *Proof:*
     - A straight drive on a district's grid used to change its call about 30 times in 100 m; now it changes 0 times (`tests/navRules.test.ts`). The suite also covers a simulated car that follows the directions to goals across the district, U-turns, dead ends and near ties.
     - `scripts/check-nav-flicker.mjs` runs two streets in each of the five districts. On the build before the fix it showed « Fais demi-tour » in 9 of the 10 runs (up to 8 times in one); after the fix, 0.
     - The golden path's leg to the drop-off showed it 35 times in run 5 and 0 in run 7 (see below).
2. **The BRT junction's cost.** See the performance sections. The iPhone frame rate there is unknown until Gate B.
3. **A rollback hazard.** A car parked in Mermoz, loaded by a client older than this branch, would appear at the same coordinates in that client's fallback hub. This only happens on a rollback (CONTRACT.md).
4. **The VDN has one lane each way.** See « What is missing ».
5. **The multiplayer room `mermoz`** only exists on a worker built from this branch, such as the preview, not production.

## The iPhone preview

- **Source:** the project's own Cloudflare Workers Builds (no configuration changed by this session), from the push of this branch.
- **Link and SHA check:** in the PR description.
- **Unverified here.** This sandbox cannot reach `*.workers.dev`, so the link has not been opened from this session.
- **Checking the build:** the build id shown in the game (Réglages) is `<short SHA>-<date>`. It must start with the PR's head SHA.
