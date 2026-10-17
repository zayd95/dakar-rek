# M1-A — Freedom-first economy

Branch `feature/m1a-freedom-economy-20261017`, based on `6789c6e`. Production, #37 and the Meshy work are not touched. Save schema stays v5.

## Implemented in this PR

| Rule | Before | Now |
|---|---|---|
| Business tiers | n different activities ever practised **and** one unit of the tier below | money only (`business.ts` `lockedWhy` only rejects an unknown id) |
| Venture / rent income | × polyvalence multiplier (up to ×2) | base income (+ the ad boost); no variety effect (`assets.ts`, `business.ts`) |
| Variety (polyvalence) | +20 % per extra category, ×2 at 6 categories, on active pay **and** venture income | +5 % per extra category, **+15 % cap**, on active pay only (`config.ts` `polyvalence`) |

Tests: tier reachability with no activity and no previous tier, no chain, passive income identical at 1 and 7 categories, variety bounds, save round-trip (wallet, assets, income). Browser checks `check-business`, `check-economy`, `check-gestures` updated for the new numbers.

Expected side effect: the whole-ladder income is the plain sum of the tiers (6.86 M F per in-game hour for one of each), the toy pacing simulation now reaches a billion after ≈ 66 h whatever the variety (it was under 60 h with 4+ recent activities). Production is still schema v3 and the candidate has not shipped, so no live player sees a drop.

## Proposals awaiting approval (none implemented)

Simulations: `scripts/m1a-sim/` (`npx vite-node scripts/m1a-sim/<file>.ts`). Real `ECONOMY`, ladder, roster and duel code; every other number is an explicit assumption in the file header.

### F1 — Targeted pay rebalancing (owner: approved in principle, no flat rate)

`seconds: 4` in `content.ts` is only the fallback of a gesture shift. Measured in the browser by a human-like bot (`measure-gestures.mjs`, gesture clock, 5 trials each): `meca` 13.7 s, `roue` 6.9 s, `vendre` 11.8 s (`pecheurs` 6.0 s, but the bot played it badly: pay factor 0.44; `pirogue` could not be started by the bot, so the Almadies fishing shifts stay out of the table). Plain shifts are 4–6 s.

Targets reward skill and effort, not a flat rate: plain shifts 220 k F/h, gesture shifts 270 k F/h (a perfect play already pays +20 %), each × (1 + 1 % per energy point above 18), Corniche × 1.2 for the walking between its three stops.

| shift | kind | pay now | proposed | rate now → after (k F/h) |
|---|---|---|---|---|
| meca | gesture | 2 000 | 3 300 | 163 → 268 |
| meca_conf | gesture | 2 800 | 3 300 | 228 → 268 |
| roue | gesture | 1 500 | 2 000 | 192 → 256 |
| vendre | gesture | 2 500 | 3 400 | 206 → 277 |
| stock | plain | 1 500 | 1 650 | 196 → 216 |
| courrier | plain | 2 400 | 1 950 | 279 → 227 |
| couture | plain | 1 800 | 1 250 | 316 → 220 |
| debarq | plain | 3 200 | 3 100 | 295 → 285 |
| poisson | plain | 2 200 | 1 850 | 319 → 270 |
| filets | plain | 1 800 | 1 400 | 326 → 254 |
| atelier | plain | 1 600 | 1 400 | 291 → 254 |

Lifestyles after (variety only, zero mastery, k F/h): garage 265, market 277, fishing 220, diversified 272 at competent play; sloppy gesture play 190–198, perfect play 335–349 (±27 % for skill). Not covered: `expo`, `tech-service`, `maison-service`, `pecheurs`, `pirogue` and the story rewards. `pay-table.ts` reproduces the table.

### F2 — Mastery (deferred)

Kept as a proposal only: `M = 1 + A·L`, A ≤ 0.15, `L` from quality (gesture score), distinct tasks and trusted places, credited once per completed activity run (never per step) and never from repetition alone. See `mastery-grid.ts`. Not implemented; revisit after the pay rebalancing and the wrestling decision.

### F3 — Wrestling: corrected simulation (`wrestling2*.ts`, `duel-matrix.*`)

Built on the game's own `ladderAt`, `opponentFor` (three nearest in points; gala opponent a notch above, never the main event), `rankOf` eligibility, `galaBlock` and `titleBout` (Fri–Sun evenings from 16 h, one gala bout an evening, belt on Sundays), `purseOf`. Bout results and lengths come from headless players in the real duel code against each of the twelve roster wrestlers (`duel-matrix.ts`, 40 bouts each): bouts last 9–36 s (mean about 17 s), draws almost never happen, and the win rate depends strongly on skill and training (a decent untrained player wins 5–38 % against levels 3–5, a trained one about 50 %, a trained expert 70–95 %). The ritual around a bout (sign-up, walk to the wrestlers' gate, tunnel, corner, ring, result cards, walk back) is assumed 55 s (40–90 s tested).

Current rules (purse = rung purse, galas ×2, titles ×3, no fatigue), net worth with reinvestment against the jobs mean (parity pay), seven start dates spread over a season:

| player | 1 h | 2 h | 5 h | 10 h | 20 h |
|---|---|---|---|---|---|
| bout grinder, decent, trains after 15 bouts | ×25 | ×64 | ×85 | ×73 | ×49 |
| bout grinder, novice | ×14 | ×33 | ×69 | ×59 | ×43 |
| bout grinder, decent, never trains | ×7 | ×15 | ×30 | ×30 | ×24 |
| bout grinder, expert | ×76 | ×129 | ×182 | ×146 | ×117 |
| weekend fighter (jobs by day, bouts Fri–Sun evenings), decent, trains | ×1.2 | ×1.3 | ×2.5 | ×4.4 | ×7.1 |
| weekend fighter, novice | ×1.1 | ×1.1 | ×1.7 | ×2.8 | ×4.0 |
| weekend fighter, expert | ×1.6 | ×1.9 | ×7.3 | ×14.9 | ×17.1 |

What drives it: ordinary ranked bouts, not the prestige purses. For the decent grinder at 20 h, ordinary bouts bring 763 M F against 22 M from galas and 12 M from titles; for the weekend fighter 70 M against 16 M and 12 M. Rungs (decent, trains): rung 3 after about 36 min of continuous bouts, rung 4 after 61 min, rung 5 (belt) after about 7 h, rung 6 not reached in 20 h. Bouts are short, so volume, not energy, is the limit (no fatigue cost today).

Option only, not proposed for implementation: an ordinary purse table of 6 k to 16 k with 25 / 35 energy leaves the galas and titles untouched and brings the decent weekend fighter to ×1.1 / ×1.1 / ×1.4 / ×2.9 / ×3.8 (1 / 2 / 5 / 10 / 20 h) and the grinder to ×2.3 / ×4.7 / ×8 / ×8 / ×6, where the prestige purses carry most of the remaining gap.

## Not modelled

Hygiene (no price or gate found), rent beyond the free starter room, Tiak (M1-B), the Almadies fishing shifts and other plain services not in the simulated set, training time.
