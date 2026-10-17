# M1-A — Freedom-first economy

Branch `feature/m1a-freedom-economy-20261017`, based on `6789c6e`. Production, #37 and the Meshy work are not touched. Save schema stays v5.

## Implemented in this PR

| Rule | Before | Now |
|---|---|---|
| Business tiers | n different activities ever practised **and** one unit of the tier below | money only (`business.ts` `lockedWhy` only rejects an unknown id) |
| Venture / rent income | × polyvalence multiplier (up to ×2) | base income (+ the ad boost); no variety effect (`assets.ts`, `business.ts`) |
| Variety (polyvalence) | +20 % per extra category, ×2 at 6 categories, on active pay **and** venture income | +5 % per extra category, **+15 % cap**, on active pay only (`config.ts` `polyvalence`) |
| Gesture shifts (D1, browser-measured) | `meca` 2 000, `meca_conf` 2 800, `roue` 1 500, `vendre` 2 500 | 3 000, 4 200 (trust premium ×1.4 kept), 2 000, 3 400 (`content.ts`) |
| Plain shifts whose 4–6 s were verified in the browser (D1) | `courrier` 2 400, `filets` 1 800, `poisson-service` 2 200, `atelier` 1 600 | 2 100, 1 550, 2 050, 1 500 (`cityContent.ts`) |

Gesture durations measured in the browser by a human-like bot (`scripts/m1a-sim/measure-gestures.mjs`, gesture clock, 5 trials): `meca` 13.7 s, `roue` 6.9 s, `vendre` 11.8 s; the content's `seconds: 4` is only the fallback. Plain-shift durations verified the same way (`measure-plain-shifts.mjs`, game clock): `courrier` 4.96 s, `boutique-stock` 3.88 s, `debarquement` 5.95 s, `filets` 5.00 s, `poisson-service` 4.95 s, `atelier` 5.00 s, all within 3 % of the content's 4–6 s. Not located by the script (closed, or the place id differs), so left unchanged: `couture`, `tech-service`, `expo`, `maison-service`. Also unchanged: `debarquement` and `boutique-stock` (verified, but not reduced: the first is the highest-effort shift at −26 energy, the second is the lowest-paid), `pecheurs` and `pirogue` (the bot could not play them well). No flat rate: competent-play rates before → after (k F/h): `meca` 163 → 244, `meca_conf` 228 → 341, `roue` 192 → 256, `vendre` 206 → 277, `courrier` 279 → 244, `filets` 326 → 282, `poisson` 319 → 299, `atelier` 291 → 272; unchanged `debarquement` 295, `boutique-stock` 196, `couture` 316. A perfect play still pays +20 %.

Tests: tier reachability with no activity and no previous tier, no chain, passive income identical at 1 and 7 categories, variety bounds, save round-trip (wallet, assets, income). Browser checks `check-business`, `check-economy`, `check-gestures` updated for the new numbers.

Expected side effect: the whole-ladder income is the plain sum of the tiers (6.86 M F per in-game hour for one of each), the toy pacing simulation now reaches a billion after ≈ 66 h whatever the variety (it was under 60 h with 4+ recent activities). Production is still schema v3 and the candidate has not shipped, so no live player sees a drop.

## Proposals awaiting approval (none implemented)

Simulations: `scripts/m1a-sim/` (`npx vite-node scripts/m1a-sim/<file>.ts`). Real `ECONOMY`, ladder, roster and duel code; every other number is an explicit assumption in the file header.

### F1 — Remaining pay work

`couture` (316 k F/h, −25 % would level it), `boutique-stock` (196 k F/h) and the shifts above that could not be verified or played by the bot are left for a later pass; `pay-table.ts` reproduces the targets. Lifestyles after the implemented changes (variety only, zero mastery, k F/h, garage / market / fishing / diversified): 271 / 277 / 236 / 277 at competent play, 195 / 198 / 236 / 245 with sloppy gesture play, 343 / 349 / 236 / 306 with perfect play (`implemented-rates.ts`).

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

### D3 — Minimal anti-exploit proposal for ordinary ranked bouts (awaiting approval, not coded)

Cause: an ordinary ranked bout pays `RUNGS[player's rung].purse × k`. The base follows the player's rank, not the opponent, so a player at rung 4–6 collects 0.4–2.5 M F base for beating the same three neighbours in points (levels 3–5) every 75 s. Rematch decay was simulated and rejected: with 2–3 free rematches per opponent per city day or per 3 days it only takes the decent grinder from ×66 to ×42 / ×25 at 10 h, because even the floor pays far above any job at those rungs, and it is one more rule to explain.

Proposal: the base of an ordinary ranked bout comes from the opponent's level (the legitimate opponent and the challenge), `ORDINARY_BASE = [5 000, 8 000, 12 000, 17 000, 24 000]` for levels 1 to 5, with the win / draw / loss factors of `purseOf` unchanged (win `1.5 × (1 + 0.1 × level)`, draw 1, loss 0.6). Galas (`RUNGS[rung].purse × 2`) and title bouts (`× 3`) are untouched. Friendly and training bouts are untouched (they pay nothing). No cap, timer, fatigue cost or new state. Code: `purseOf` in `src/career/career.ts` (about 8 lines), its test, and the doc comment of `RUNGS[].purse`; the « cachet … si tu gagnes » lines in `module.ts` follow automatically.

| opponent | win | loss | today at rung 2 / 4 / 6 (win) |
|---|---|---|---|
| level 1 | 8 250 | 3 000 | 82 k / 660 k / 4.1 M |
| level 3 | 23 400 | 7 200 | 97 k / 780 k / 4.9 M |
| level 5 | 54 000 | 14 400 | 112 k / 900 k / 5.6 M |

Net worth with reinvestment ÷ the jobs mean, 1 / 2 / 5 / 10 / 20 h, seven start dates, real ladder and duels (`level-report.ts`):

| player | today | proposed |
|---|---|---|
| casual weekend fighter (3 ordinary bouts an evening), decent | ×1.10 / 1.09 / 1.21 / 1.93 / 4.6 | ×1.09 / 1.08 / 1.09 / 1.37 / 2.6 |
| weekend fighter (all evening), decent | ×1.3 / 1.3 / 2.5 / 5.9 / 8.5 | ×1.13 / 1.11 / 1.49 / 3.2 / 4.3 |
| casual weekend fighter, novice | ×1.05 / 1.05 / 1.07 / 1.26 / 2.0 | ×1.06 / 1.06 / 1.06 / 1.11 / 1.4 |
| weekend fighter (all evening), expert | ×1.7 / 2.1 / 7.6 / 14.9 / 15.7 | ×1.23 / 1.47 / 2.8 / 6.5 / 7.5 |
| bout grinder (no jobs), decent | ×33 / 75 / 115 / 92 / 63 | ×5.2 / 7.1 / 9.6 / 9.7 / 8.1 |
| bout grinder, expert | ×76 / 126 / 182 / 138 / 103 | ×8.7 / 11 / 16 / 14 / 11 |

Weekend fighters stay at or above the jobs line at every horizon (the weakest case, a novice who fights three bouts an evening, is ×1.06 to ×1.4), so the change does not make a normal weekend career non-viable; they lose most of the ordinary-bout income, which was never what a weekend career lived on (galas and titles carry it). The decent grinder falls from ×92 to ×10 at 10 h: ordinary bouts bring 26 M F over 20 h against 29 M from galas and 22 M from titles (today 1 019 M against 31 M and 23 M). What remains is the prestige purses, which the owner asked to keep, reached through the fast rank climb; the ladder's points and eligibility are unchanged.

Alternatives simulated: tables of 5 / 6.5 / 8.5 / 11 / 14 k (grinder ×8 at 10 h, casual novice ×1.10) and 5 / 10 / 17 / 26 / 38 k (×11, ×1.14); a heavier 5 / 12 / 25 / 45 / 70 k gives ×14.

## Not modelled

Hygiene (no price or gate found), rent beyond the free starter room, Tiak (M1-B), the Almadies fishing shifts and other plain services not in the simulated set, training time.
