# Integrated branch vs every open phase PR (audit, 7 Nov 2026)

Branch `integration/playable-20261107` (PR #88). Method: for every open PR head (#1 to #87), `git merge-base --is-ancestor <head> HEAD`; for each head that is not an ancestor, `git cherry` against its own base (is its patch already here under another SHA?) and a file check (what it adds that the branch does not have). Then, for the release candidate's own content, every file the candidate changed that this merge changes again.

## Contained (an ancestor of the branch)
Every PR of the Living Dakar / vehicles / Living Districts / LD2.0 line: #1 (`wip/visual-pass`), #3, #4, #17, #21 to #28, #30 to #32, #35 to #37, #40, #41, #43 to #51, #53, #54, #56 to #70, #72 to #87 (M1 Mermoz, M2 Plateau trade, M3 football and its ball-control repair, M4 and its hospitality strip, LD2.0-A, B, C, D, E and E rounds 3–4, the traversée, the Plage de Ngor, the Cité Jàmm house and modern fronts, the combined build, the device playtest kit, the Mermoz F3, the Jàmm rent, the release candidate) and #83 (the night street, Le Patio, the one rooftop).

## Not contained, and why that is (22 PRs)
| PR | What | Verdict |
|---|---|---|
| #38, #39, #52 | recovered small fixes; backlog docs; sign proportions | **patch-equivalent commits are already here** (`git cherry` marks every commit `-`); nothing missing |
| #55 | audio candidate | one **docs-only** evidence commit not here; the audio work itself is in |
| #71 | traversée | one **docs-only** commit (`TRAVERSEE.md` version 2) not here |
| #42 | Meshy city avatars (base `main`) | superseded: the studio bodies of #58–#62 are here (`public/assets/meshy/body_*.glb`) |
| #11, #15 | handshake retry; one-shot fall | recovered into #38, which is here |
| #7, #8, #10, #13, #14, #16, #18, #19, #20 | the **Codex V1 lane** on `wip/visual-pass`: Aïda's revision activity, V1 scope doc, mosque visits and advertising boards (`src/ads/*`, `src/world/mosque.ts`), duel-input reset, Ibou follow-up, billboard offset, CI navigation bounds, place-activity summaries (`src/ui/placeSummary.ts`) | **not integrated.** None is a Living Districts or LD2.0 phase and none is in the release candidate either. The game has its own mosque prayer (docs/beta/proof/mosque) and its own places directory; `placeSummary`, the ad boards and the duel-input reset do not exist here. **Owner decision:** are these lanes wanted in the playable game? |
| #6, #12 | agent-studio tooling (332 commits on #12) | tooling and docs, not game content |
| #29, #33, #34 | reference-character preview, Magic Land Lite, Portwise port spike | labelled preview / isolated / non-production by their own PRs; not integrated |

## What the merge changed of the release candidate's content
Files the candidate changed (against LD2.0-E) that this branch changes again, **by my choice** and not as a by-product:
- `src/world/almadies/plan.ts`: the candidate had taken blocks (0,0) and (1,0) out of the district's plan for M4's strip, moved Le Filao to (3,0) and swapped the two residences; **restored to LD2.0-E's own plan** (the hotels are back across from the night street).
- `tests/almadiesHotels.test.ts`, `tests/almadiesRooftop.test.ts`: restored to LD2.0-E's (they tested the strip's Terrasse and gantry); `tests/hospitalityStrip.test.ts` removed (replaced by `tests/nightStreet.test.ts`); `scripts/check-almadies-carpark.mjs` removed (replaced by `check-almadies-parking.mjs`).
- `src/world/builder.ts`, `src/venues/rooftop.ts`, `src/world/hospitalityStrip.ts`, `docs/districts/CONTRACT.md`, the fixture: the strip block, the strip's Terrasse and its gantry are gone; the night street is in.
- **Relocated:** the Terrasse de Ngor (strip → the hotel's roof); Lounge 221, Le Comptoir de Ngor, Chez Binta, Café du Phare (the strip's inland blocks → the beach side of the coast road, turned to face it, packed side by side west of the alley).
- **Reduced:** parking, from about 34 painted bays (two car parks) to **21** (one), to leave the Plage de Ngor its sand; `check-city-life` and `nightStreet.test` follow (≥ 20 bays).
- **Superseded evidence:** the candidate's `docs/proof/rc/RC-EVIDENCE.md` lines on the strip's Terrasse, the gantry pictures and the M4 journey on the strip describe a layout this branch no longer has; `docs/ld2/LD2_E.md` "Rounds 3–4 in the combined build" likewise.

Everything else of the candidate is byte-for-byte the candidate's (`git diff origin/integration/rc-20261101 HEAD` outside the Almadies night street, Le Patio and the files above is empty of candidate content).
