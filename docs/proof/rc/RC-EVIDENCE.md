# Release candidate rc-20261101 — evidence

**What the RC is.** Branch `integration/rc-20261101`, tag `rc-20261101` on its last commit (the tag's SHA is the RC SHA; the build id in the game's
Réglages is that SHA's first 8 characters). Base: `integration/combined-20261027` (zayd95/dakar-rek#82, `dac784d4`). Features are frozen: since the merges
below, the only code changes are the three fixes listed under "Changes made while testing".

**Not done, by instruction:** no production merge, no deployment, no change to `wip/visual-pass`.

## Included

| Part | Source | State in the RC |
|---|---|---|
| Living Districts M1 Mermoz/Sacré-Cœur, M2 trade (Médina/Plateau), M3 football, M4 Almadies strip | already in the combined build | journeys re-run on the RC, all pass |
| LD2.0-A, B, C, D | already in the combined build | A, C, D re-run; B and D on the local Workers runtime |
| LD2.0-C two late commits | `integration/ld2-c-20261026` | the jar placement and its evidence only (checked before merging) |
| LD2.0-E rounds 3–4: street life, streetscape, illuminated name | `origin` lane E-V/E-R/E-H round 3 + round 4 | merged; two conflicts resolved (below) |
| Mermoz F3 apartment « Résidence Les Filaos » | PR #85 | merged; `check-mermoz-home` 11/11 |
| Jàmm house rent: **16 700 F per city day**, leases pinned at their signed rate | PR #86 | merged; no price-per-m² ladder applied |
| Frame meter (Réglages › Graphismes › « Mesure de fluidité ») and report lines | PR #84 | in the base of the guide; `check-frame-meter` 7/7 |
| Refreshed `docs/beta/IPHONE_PLAYTEST.md` | this branch | accepted gates recorded as provisional private-beta gates |

### The two conflicts

1. `src/crowd/streetPlan.ts`: both sides added a row. Kept E's busy Almadies streets (Route des Almadies, Avenue du Littoral, Rue du Mall) **and** the Mermoz row.
2. `src/venues/rooftop.ts`: E put the rooftop restaurant on the boutique hotel, M4 has it on the strip. Resolved as: **one** Terrasse de Ngor, the strip's (M4 journey
   intact); the boutique hotel stays at the approved location and carries its **own** gantry with the hotel's own name. The Terrasse's sign is the new illuminated
   gantry (front board and two blades, four lit faces) on the strip's building. Le Patio (nightclub/bar), the nightlife street and the car parks are untouched.

### Changes made while testing (all found by the checks)

- `src/game/parkedVehicles.ts`: E's round 3 parked cars in the coast road's kerb lane (z ≈ −115.7) where the M4 journey's car starts → `KERB_FREE` for the strip's frontage
  (test: `tests/almadiesParkedKerb.test.ts`). M4 journey went from 39/40 to 40/40.
- `src/world/almadies/streetscape.ts`: one narrow no-planting rectangle so both quality presets plant the same 97 kerb palms (a parity test).
- `tests/fixtures/almadiesOutsideDistrict.json`: regenerated, because the gantry adds 8 plain boxes to the strip (the fixture guards everything outside E's district).

## Results on the RC

Environment: headless Chromium, software renderer (SwiftShader), about 5 frames a second, 390 × 844 real-touch pages. **None of this is iPhone evidence.**

| Check | Result | File (`docs/proof/rc/journeys/`) |
|---|---|---|
| `tsc --noEmit` | clean | — |
| Full `vitest run` at the final code | **3561 passed**, 4 skipped, 243 files | — |
| M1 Mermoz journey | 22/22 (see note 1) | `M1-mermoz-journey.txt` |
| M2 trade journey | 33/33 (see note 1) | `M2-trade-journey.txt` |
| M3 football match | 25/25 | `M3-match-journey.txt` |
| M4 Almadies strip journey | 40/40 | `M4-almadies-journey.txt` |
| LD2.0-A | 27/27 | `LD2A-journey.txt` |
| LD2.0-C | 28/28 | `LD2C.txt` |
| LD2.0-D villa walk | 21/21 | `villa-walk-LD2D.txt` |
| Rooftop | 43 pass, 0 fail | `rooftop.txt` |
| Almadies car parks / parking | 3/3 | `almadies-carpark.txt` |
| Ngor traversée | 37/37 | `traversee.txt` |
| Ngor beach | 16/16 | `ngor-beach.txt` |
| Mermoz F3 apartment | 11/11 | `mermoz-home-F3.txt` |
| Top speed (open road, hub swap pikine → almadies) | 5/5 (see note 1) | `top-speed.txt` |
| Navigation-flicker regression | **passes on 3 of 5 runs; see note 2** | `nav-flicker-pass.txt`, `nav-flicker-intermittent-RC.txt` |
| Frame meter | 7/7 | — |
| LD2.0-B on `wrangler dev --local`, two real pages | **14/14** (clean single run) | `../workers/ld2b-journey.txt`, `../workers/ld2b/*.jpg` |
| LD2.0-D acceptance on `wrangler dev --local` | **17/17** | `../workers/ld2d-acceptance.txt` |

**Workers evidence (two players).** B: private messages both ways with badges and read state; a 5 000 F request paid once from the confirmation card (double tap),
server ledger and both wallets, paying again refused; both reload and keep balances, history and conversation (persistence); a home invitation accepted, « Y aller »
to the door, « Entrer chez Awa (invité) », both visible in `home:<tag>`; a meeting at the Grand-place at a city time met on both sides. D: the villa vitrine
acceptance, 17 checks. The static artifact **cannot** show any of this: it has no server.

### Notes

1. **First batch, scripted-driver failures.** In the first full batch the M1 Mermoz journey (drop-off stall), the M2 trade journey (car in Awa's bay, no « Vendre » sheet)
   and top-speed (3/5, stalls) failed. Each passed when re-run alone (files `first-batch-FAIL-*.txt` keep the failures). A scripted car at 5 frames a second is not a
   driver; these are the flakes already known on the combined build. They remain the reason a real device must drive these routes.
2. **Navigation-flicker: intermittent, not new.** The check sometimes (RC: 2 of 5 full runs; 1 of 6 in a probe that alternates Almadies and Corniche) reports one
   « Fais demi-tour » as the **first** sample after a debug teleport from the Almadies to the Corniche at x = −63.5, z = −110; never on later samples, never elsewhere.
   The **unmodified combined head `dac784d4` shows the same thing** (2 of 6 in the same probe; `nav-flicker-intermittent-BASELINE-dac784d4.txt`), and 5 plain full runs
   there passed. So it was not introduced by the RC, but it is not fixed either: it is a stale-way transient right after a debug teleport, at 5 fps. It has not been
   seen outside the harness. A real drive across the Corniche on the phone is the test.
3. **E's own `check-district.mjs`: 15/19.** Four assertions describe the villa branch alone (one lit mesh of five faces on the hotel; the visibility count; the
   triangle and mesh baseline against the villa branch). They are stale on the combined build by construction (the Terrasse's gantry adds lit faces; the strip adds
   triangles). They are replaced by the rooftop unit tests and the static counts below. Log kept in `E-own-check-district-15of19.txt`.

## Static cost (low / full quality, no timing)

| | meshes | triangles |
|---|---|---|
| Almadies, combined head `dac784d4` | 99 | 179 k / 140 k |
| Almadies, RC | 98 | 202 k / 160 k |
| Other hubs | identical | identical |

The Almadies gains about 23 k triangles (street life, streetscape, the gantries). Pikine (183 k) and the Sacré-Cœur BRT junction (139 draw calls) stay the
heaviest places; they are unchanged. These counts carry over to a phone; milliseconds do not.

## Remaining blockers and caveats

1. **No iPhone run yet (Gate B).** Everything above is headless. The gates in `docs/beta/IPHONE_PLAYTEST.md` are provisional until a phone has measured them.
2. **Multiplayer is not in the static preview.** B and D are proven on the local Workers runtime only; nothing is deployed.
3. Navigation-flicker intermittent (note 2) — inherited, not fixed.
4. Scripted-driver flakes at 5 fps (note 1) — inherited; real driving feel is unproven.
5. Almadies +23 k triangles — the district most likely to dip first on the phone; Basse is the fallback.
6. E's `check-district` stale assertions (note 3).
7. Cloudflare Workers Builds is red on every PR of the repository (account setup, unrelated to the code). `deploy.yml` is manual and was not run.
8. PRs #84, #85, #86 and the E rounds are now contained in the RC; they stay open as drafts until the owner decides how to land the RC.
