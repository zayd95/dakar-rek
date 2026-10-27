# M4 × LD2.0-D · one Almadies

**Status: engineering only. No iPhone has run this.** Chromium with touch emulation. The branch is `integration/m4-ld2d-20261027`; neither source branch was changed. Contract: [`CONTRACT.md`](CONTRACT.md) v9, row 15.

## What is combined
- **M4** (PR #77's head, `0320068`; first merged at `4d48c2c`, then again after its placemaking pass): the evening out (the Terrasse de Ngor on its hospitality strip, Awa Sy, La Vague, the card), stacked on the football repair, M3, M2 and M1.
- **LD2.0-D** (`integration/ld2-d-20261026` @ `628c45f`): the owner's Almadies villa (street compound, three levels, helicopter, swim, SUV bays) and the owner's showcase.

They stand in different blocks of the same hub: the villa on (1,1) lot 3, the strip on (0,0) and (1,0).

## What the merge needed
Five text conflicts, all resolved by keeping both sides; three test changes and one catalogue line, each listed in the contract row. The only ones with judgement in them:
- the villa's regression fixture was taken again on the merged generator, and checked the other way round (villa switched off, same digest outside the lot);
- the two road-test exemptions that rows 6 and 7 had already agreed with LD2.0-A.

## Run on the merged tree
| Check | Result |
|---|---|
| `tsc --noEmit` | clean |
| Full unit suite | 219 files, 2852 passed, 3 skipped |
| `scripts/check-rooftop.mjs` | passes on the three hubs |
| `scripts/check-almadies-journey.mjs`, real touch | 40 / 40 |
| `scripts/check-villa-street.mjs` (the villa's gate, bays, front door, a non-owner kept out) | 43 / 43 |
| `npm run build:showcase` | builds; opens on « Ma partie » and « Vitrine du propriétaire »; the showcase starts in the villa's front yard |

## One change to the M4 journey script
The bay check was the car's centre within ±1.3 m by ±1.2 m of the bay's centre. On the merged page the stop landed 1.9 m past it, in a bay the car was still inside. The check is now the car's centre inside the painted rectangle (7.2 × 5.0 m) shrunk by 0.5 m, and the last waypoint is aimed less deep. The stop is hand-steered and the brake's reach depends on the page's frame rate.

## Not run
- `scripts/check-ld2d.mjs`, the two-player acceptance on a local Workers runtime, and `check-villa-walk.mjs` and `check-villa-showcase.mjs`: not run here.
- Not on an iPhone; no verified Cloudflare preview.

## Second merge: the strip's placemaking pass (PR #77 → `0320068`)
The owner's playtest asked for real places (not villa-like boxes): [`M4-STRIP-PLACEMAKING.md`](M4-STRIP-PLACEMAKING.md). Merged here: two text conflicts (the journey script's bay check, resolved by taking the line #78 already had; the Almadies `keepClear`, now the Embarcadère's pier and the strip's forecourts, car parks and alley together). The villa fixture (`tests/fixtures/almadiesOutsideVilla.json`, base `0320068`) was taken again on the merged generator, and checked the other way round: with the villa compound switched off (the generic villa drawn for real) the digest outside the lot is identical, so the villa's lot still disturbs nothing.

Checked on the merged tree (Chromium, touch emulation): full suite 2857 passed, 3 skipped; the M4 journey **40/40** ([log](proof/m4/strip/integration-journey.log)); the villa's street check (`scripts/check-villa-street.mjs`) **43/43** ([log](proof/m4/strip/integration-villa-street.log)); the car park drive-in ([log](proof/m4/strip/integration-carpark.log)). Not run: `check-ld2d.mjs`, `check-villa-walk.mjs`, `check-villa-showcase.mjs`. No iPhone.
