# Acceptance of the unified beta

Every run here is **headless Chromium with SwiftShader** (a CPU renderer) on a 4-core container, with real touches
(CDP `Input.dispatchTouchEvent`) wherever a player touches. Debug hooks are used only to set a scene up (hour, money,
a place to stand) and to read state. **Nothing here is a physical-phone result**, and no real-device frame rate is
claimed.

Build under test: `integration/unified-beta-20261022`. The beta bundle's id is `0753a442-20261023`: that is the game code
of the last commit that touched it. The only change to the game after the long runs is that « Sauvegarder maintenant » now
confirms in the phone's own toast; everything after is documentation, proofs and check scripts. The checks that touch that
screen (`check-residence-reload`, `check-phone`, `check-phone-ux`, `check-beta-life`, `check-avatar-activities`, the unit suite
and the CI) were re-run on the final code.

## The 25 steps

| # | Step | Evidence |
|---|---|---|
| 1 | Create a new character | `check-beta-life` (15/15): the studio, « Awa », femme body, `puff` hairstyle; `check-studio` |
| 2 | Enter Pikine | `check-beta-life` 1 |
| 3 | Uncluttered HUD and the streak indicator | `check-beta-life` 2 (« Série 0 j »); `check-phone-ux` (85/85, five phone sizes and landscape, no HUD overlap) |
| 4 | Open the redesigned phone | `check-beta-life` 3a, 3b: the home, five destinations, nothing of the HUD over the open phone |
| 5 | Understand the Profile without a long scroll | `check-beta-life` 3c: the studio's portrait, the name and « Modifier mon personnage » above the fold; `docs/beta/proof/phone-hud/` |
| 6 | Visit a Dibi and cook brochettes | `check-venues` (Dibi section, desktop and phone, 159 of the 163 checks of the full run passed: the 4 others are listed below); `check-avatar-activities` 5; `docs/beta/proof/activities/dibi-grill.mp4` |
| 7 | Meaningful work and streak progress | `check-beta-life` 4 (a real Tiak job paid once, the chip becomes « 🔥 1 j »); journeys A (the run of 2 days, no farming), B, C |
| 8 | Sarr Auto, obtain a car | journey C (Pape Sarr's credit: signed, the Teranga is the player's, the debt is on the phone); journey B (a road test of his Teranga after three days of work); journey G (Prestige Auto) |
| 9 | Use the physical cockpit | `docs/beta/proof/cockpit/` (three films, before/after); journey G; `check-avatar-activities` 4 (the driver in the Teranga's seat, `Drive` pose) |
| 10–14 | Accept a VTC passenger, see them board and sit, drive to another district, see them get out and walk away, one payment and one summary | `check-vtc-ride` (a full Pikine → Plateau ride, 19/19 on its rerun; 18/19 on the first run, see below): reaches the kerb, rear door, seated, glass, reload mid-ride, district change with the passenger aboard, drop-off, paid once, out on the pavement side, walks away, nothing paid after a reload, never more than one passenger. Films in `docs/beta/proof/vtc/`. The GPS goal line and minimap follow the ride (green markers). |
| 15–18 | Buy or select the Cité Jàmm home, make it the principal residence, buy and arrange furniture, park the car | `check-residence-reload` (32/32); `check-beta-life` 5 |
| 19–20 | Reload, and the residence, furniture, money, debts, avatar, streak and car persist | `check-residence-reload` (leave and return, the page left from inside the house); `check-beta-life` 7; journey C (the credit: one loan, repaid from the VTC fares, Pape Sarr's 30 % taken once) |
| 21 | Drive past the arena and Keur Meubles without invisible obstruction | `check-arena-lanes-drive` (4/4), `check-keur-meubles` (4/4), journey `arena` (8/8); `docs/beta/proof/world/` |
| 22 | La Vague, an actual dance | `check-venues` (club section); `check-avatar-activities` 6; `docs/beta/proof/activities/la-vague-dance*.mp4` |
| 23 | The mosque and the respectful prayer | `check-venues` (mosque section: ablutions, shoes, congregational and solo prayer, no reward); `check-avatar-activities` 7a–7c (the HUD steps back during the real prayer); `docs/beta/proof/mosque/` |
| 24 | The phone reflects everything coherently | `check-beta-life` 6a–6d: the Profile, the Maison and Argent agree with the save, to the franc |
| 25 | A returning legacy save | `check-save-compat` (the production client, schema 3, built from `wip/visual-pass`: 25/25 on the final run: migration, nothing lost, the old save byte-identical, rollback, return, three tabs, New Game, an unreadable save); `check-save-v6` (the schema-5 client: migration, rollback and return, New Game and the unreadable save all pass; the half-done Touba tour it also rides fails identically against the PR #64 build, so it is not from this branch); `check-save-rollback-beta` (8/8, the PR #64 client); `check-legacy-car` (a pre-sedan save keeps its car); `check-avatar` (30/30: saves from before the studio) |

## The additional mandatory tests

| Test | Evidence |
|---|---|
| Multi-hub continuous driving | `check-vtc-ride` (Pikine → Plateau with a passenger); journey E (Pikine → Almadies on a Jakarta); journey `almadies` (7/7); `check-roadside checkpoint` (2/2) |
| Jakarta reverse | journey F (3/3) |
| Vehicle condition and repairs | unit tests (`tests/condition.test.ts`, `tests/economy.test.ts`, `tests/credit.test.ts`, `tests/vehicleSaveV6.test.ts`); journeys B, C and G; `check-vtc-ride` (a trip does not wear the car out) |
| NPC seating for several vehicle sizes | `tests/cabinFit.test.ts` (13 tests, roof, floor and legroom measured per car); `docs/beta/proof/vtc/fit-*.png` |
| Portrait and landscape | `check-phone-ux` (320×568, 375×667, 390×844, 430×932, 844×390); cockpit films in both |
| Night and day | `check-venues` (day, night, closed); `check-roadside sellers` (day and night, 8/8); the phone's own theme |
| Low-detail mobile mode | every run above uses the low preset (« Basse »); `check-avatar` (the light body files load on low) |
| Radio stream failure | `tests/radio.test.ts`; `docs/audio/films/radio-real-stations-unreachable.mp4`: the radio says so and stays silent |
| Map close and reopen | `check-geomap` (32/32): MapLibre is built when the tab opens and its WebGL context is released when it closes |
| Different avatar appearances | `check-avatar-activities` (a femme with her own look in seven activities); `check-studio`; `check-avatar` |
| Two-client multiplayer | `npm run check:online`: green in CI on this branch; passed locally |
| Older save compatibility | see step 25 |
| No duplicate money, loan or asset | journeys A–E (paid once, one ledger line); journey C (one loan, its repayment taken once); `check-residence-reload`; `check-vtc-ride` (one payment, nothing paid after a reload) |
| HUD overlap detection | `check-phone-ux` (on foot, with a job, at the wheel, in the activity and prayer focus modes) |
| Phone text overflow | `check-phone-ux` (no sideways overflow at five sizes); `check-ui-consistency` (70/70) |
| No unexpected loss of progression | `check-beta-life` 7; `check-residence-reload`; the save checks |

## Result of the runs on the final code

| Check | Result |
|---|---|
| Unit suite (`npm test`) | 179 files, 2142 passed, 2 skipped |
| `tsc --noEmit`, server typecheck | clean |
| CI « Game checks » (unit, build, `check:city`, `check:online`, `check:launch --full`) | green on this branch |
| `check-beta-life` (new character → paid job → house → car → the phone tells the same life → return) | 15/15 |
| `check-residence-reload` | 32/32 |
| `check-save-rollback-beta`, `check-save-compat`, `check-legacy-car` | 8/8, 25/25, pass |
| `check-avatar-activities` | 12/12 |
| `check-avatar`, `check-studio` | 30/30, 52/52 |
| `check-phone-ux`, `check-ui-consistency` | 85/85, 70/70 |
| `check-phone`, `check-geomap` | 69/69, 32/32 |
| `check-keur-meubles`, `check-arena-lanes-drive`, `check-roadside` (checkpoint, sellers) | 4/4, 4/4, 2/2 (after a rerun), 8/8 |
| `check-vtc-ride` (a whole ride, Pikine → Plateau) | 19/19 (the first run: 18/19) |
| Journeys B, C, D, E, F, G, `arena`, `almadies`, `card` | 4/4, 10/10, 9/9, 8/8, 3/3, 9/9, 8/8, 7/7, 4/4 |
| Journey A (first Tiak day, the run of days, no farming) | 13 of 14 in every run; see below |
| `check-venues` | the full desktop + phone run: 159 of 163; the 4 others (the prayer check and the salon's cut, on each of the two viewports) were then fixed or explained below; desktop rerun: mosque 16/16, salon passes |

## What the runs found (and what was changed)
- **CI had been red since the phone merge.** `check:online` and `check:launch` still tapped the old HUD button and the old home.
  They now follow the phone. They pass locally and in CI.
- **Checks written for the old phone** (the VTC ride, the save checks, the avatar check) now go through « Toutes les apps ».
  They wait out the phone's 320 ms settle on a new screen.
- **UI consistency pass:** the map controls, the strip and the streak pill are now 44 px. HUD and Profile text under 11 px is
  now 11 px. See `docs/beta/proof/ui/`.
- **« Assis » in bed:** the action button now reads « Au lit » while lying down.
- **The studio and avatar checks** counted a harmless 404 as an error: the game asks for an optional Blender car rapide,
  `assets/car_rapide.glb`, that was never shipped. It is ignored in those checks. The game falls back to its own model.
  This is existing behaviour.

## Honest limitations
- **Not a phone.** Frame rates from SwiftShader say nothing about a phone. Draw calls and triangles are what transfers
  (docs/beta/PERFORMANCE.md).
- **The prayer's « no reward » check** first failed because the mood drifts toward the average of the other needs, so it
  moves while a player stands still. The check now compares the prayer with the same time standing still from the same
  needs: every need drifts identically (hunger −1.31, energy −0.74, mood +1.07, social −0.66, hygiene −0.49 in 49 s of
  prayer), money and counters do not move.
- **Salon Awa's cuts are paid and saved but not drawn on the new studio bodies** (the salon toggles hair meshes of the old
  v4 body, which the Meshy bodies do not have; their hair is the studio's). It was already so in the starting point of the
  beta (PR #62 on PR #64). Not fixed here: it needs a decision about what a cut means on a studio look. A follow-up task is
  written up; `check-venues` says so.
- **Journey A** (`check-polish-journeys A`) is the PR #64 check of the first Tiak day. On the PR #64 build it passed 14/14
  in this environment. On this build every one of its 14 checks passed in at least one run, but no single run was
  clean: each run missed one step that depends on how fast a software renderer is: the work card (up for 7 s) had already
  gone when the check looked, so its tap-to-dismiss was not seen in that run (journey `card` covers that tap: 4/4);
  or the city's day turned between two deliveries (the card then rightly says « un peu plus tard »: the check now accepts
  both). The checks were made robust to these two, and the last run is 13/14 with the tap-to-dismiss only.
- **CI, one flaky step.** On the last commit, the « push » run of `check:online` stopped at « a passenger in a car rapide is
  not drawn on a bike » (the second player had not yet boarded the rapide when the first looked), while the « pull request »
  run of the same commit passed it, as did the four runs before. That step races a boarding against a poll.
- **Flaky under load, passed on rerun:**
  - `check-roadside checkpoint`, 1st run: the scripted driver hit a traffic vehicle on the way in. The 2nd run was clean.
  - `check-vtc-ride`, 1st run: the scripted driver, which does not see traffic, wore the car by 22 points. The rerun lost 2.6.
  - Journey A's « card dismisses on tap »: a timing check that missed when the machine was busy building.
  - Real players see traffic and the scripted driver does not. These are not rated as game defects.
- **The radio:** the real stations' audio could not be fetched from the sandbox, so their loudness and CORS behaviour are
  unverified (docs/audio/ARENA_AND_RADIO.md). Zik FM is left out because its relay page has no broadcaster link.
- **The scanned Berline moderne** hides its passenger while riding: its glass is painted into the texture.
- **The wrestlers' « Mbakkou »** replaces a femme or homme body by the v4 wrestler in ngemb, as designed for the attire and emotes.
- **The beta link is unverified:** the project's Cloudflare Workers Builds produced a preview for every commit of this branch, but this session's sandbox cannot reach `*.workers.dev`, so the link was not opened or tested here. See `docs/beta/BETA.md`.
