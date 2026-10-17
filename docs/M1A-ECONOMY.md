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

## Proposals awaiting approval (not implemented)

Simulations: `scripts/m1a-sim/` (`npx vite-node scripts/m1a-sim/<file>.ts`). They use the real `ECONOMY`, ladder functions and world positions; every other number is an explicit assumption in the file header.

### F1 — Pay per second of real play is not level (new finding)

`seconds: 4` in `content.ts` is only the fallback of a gesture shift. The garage, the stall and the pirogue shifts play 8–18 s of gestures for the same pay as a 4–6 s plain shift. Competent play, single shift, 60 min (`shift-rates.ts`):

| shift | kind | pay | seconds | k F/h |
|---|---|---|---|---|
| filets / poisson / couture | plain | 1 800 / 2 200 / 1 800 | 4–5 | 316–326 |
| debarquement, atelier, courrier | plain | 3 200 / 1 600 / 2 400 | 5–6 | 279–295 |
| meca_conf, stock, vendre, roue | gesture/plain | 2 800 / 1 500 / 2 500 / 1 500 | 4–18 | 182–202 |
| meca | gesture | 2 000 | 18 | 144 |

Max/median 1.17, min/median 0.52. Proposal: re-price the 11 simulated shifts so each earns ≈ 260 k F/h at competent play (meca 3 600, meca_conf 3 600, roue 2 150, stock 2 000, courrier 2 250, debarq 2 850, filets 1 450, poisson 1 800, atelier 1 450, vendre 3 400, couture 1 500), then do the rest of the table the same way in the PR.

### F2 — Mastery v2 (quality, experience, trust; no duplicates)

Per category: `M = 1 + A × L`, `L = 0.5 L_q + 0.3 L_e + 0.2 L_t`, A = 0.15 (provisional).
- `L_q = EMA(quality) × (1 − e^(−n/40))`: quality is the mean gesture score mapped `(s − 0.5)/0.5`; plain shifts have no quality signal and count 0.5.
- `L_e`: distinct tasks of the category done at quality ≥ 0.5, over the tasks that exist.
- `L_t`: places trusted (6 completions at quality ≥ 0.5), over the places that exist.
- Credited once per completed activity run (runner `finish()` or a job's `runId`), never per step; stored in open counters (`mq_`, `mn_`, `me_`, `mp_`), so no schema bump.

### F3 — Wrestling (W-A)

Ordinary ranked bouts get their own purse table (6 k, 7 k, 8.5 k, 10 k, 12 k, 14 k, 16 k base, same win/draw/loss factors) and cost 25 energy; galas and title bouts keep `RUNGS[].purse × 2 / × 3` and cost 35. Results in `wrestling-vs-jobs.ts`.

## Not modelled

Hygiene (no price or gate found), rent beyond the free starter room, Tiak (M1-B), Almadies fishing shifts and other plain services not in the simulated set.
