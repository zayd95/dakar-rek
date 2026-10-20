# Ordinary-bout purses (separate PR, stacked on M1-A)

## Which làmb the numbers come from (read first)

The game's default làmb is the original **sans frappe** (`LAMB2_DEFAULT = false`; Làmb 2.0 « avec frappe » is only on with `?lamb2`). The first set of tables below (`duel-matrix.json`, `stall-matrix.json`) was measured in Làmb 2.0, the one shipped behind the flag. The tables in « Validation in the default làmb » were measured in the default one (`sans-matrix.json`, `DUEL_MATRIX=sans`) and are the ones that apply to the launch candidate. The conclusions hold in both; the figures differ.

## The change

`purseOf` in `src/career/career.ts`:
- **Ordinary ranked bout**: base by the opponent's level, `ORDINARY_BASE = [5 000, 6 500, 8 500, 11 000, 14 000]` for levels 1–5, times the unchanged win `1.5 × (1 + 0.1 × level)` / draw 1 / defeat 0.6 factor. The player's rung no longer matters.
- **Gala place (× 2) and title bout (× 3)**: exactly as before (`RUNGS[].purse` × factor, same two roundings). `tests/ordinaryPurse.test.ts` compares every gala and title value to a copy of the previous implementation over 7 rungs (plus the clamps outside), 9 levels and 4 results, and pins literal values, including the double rounding.
- Friendly bouts and abandons pay nothing, as before. No cap, timer, fatigue cost or new state.

Why: an ordinary bout used to pay the rung's purse, so at rungs 4–6 the same three neighbours paid 0.4–2.5 M F base every 75 s.

## Results (`scripts/m1a-sim/wrestling3-report.ts`)

Real ladder (`ladderAt`, `opponentFor`, `rankOf`, `galaBlock`, `titleBout`), real `purseOf`, bout results and lengths from headless players in the real duel code against the twelve roster wrestlers (`duel-matrix.json`, `stall-matrix.json`), 55 s of ritual per bout, greedy reinvestment, seven start dates over a season. Net worth ÷ the jobs mean (rate-parity pay of PR #43: 253 k F/h of active income, 251 k / 628 k / 2.2 M / 7.7 M / 34.1 M at 1 / 2 / 5 / 10 / 20 h).

**Weekend fighters stay viable** (net worth ÷ jobs at 1 / 2 / 5 / 10 / 20 h), previous rule → implemented:

| player | previous | implemented |
|---|---|---|
| casual (3 bouts an evening), novice | ×1.0 / 1.0 / 1.1 / 1.2 / 2.1 | ×1.0 / 1.0 / 1.0 / 1.1 / 1.4 |
| casual, decent | ×1.1 / 1.1 / 1.2 / 1.9 / 3.8 | ×1.1 / 1.1 / 1.1 / 1.4 / 2.5 |
| all evening, decent | ×1.1 / 1.2 / 2.2 / 5.8 / 8.1 | ×1.1 / 1.1 / 1.3 / 2.7 / 3.8 |
| all evening, expert | ×1.7 / 2.2 / 7.0 / 14.5 / 17.7 | ×1.5 / 1.5 / 3.0 / 5.5 / 7.4 |

**The ordinary-bout loop** (income per hour of bouts alone, 20 h, × the jobs' 253 k F/h):

| | previous | implemented | heavier table 5 / 8 / 12 / 17 / 24 k |
|---|---|---|---|
| honest decent grinder | 39.5 M/h ×156 | 786 k/h ×3.1 | 1.2 M/h ×4.9 |
| honest expert grinder | 85.3 M/h ×337 | 1.1 M/h ×4.3 | 1.8 M/h ×7.0 |
| quick losses after climbing to rung 5 | 28.2 M/h ×112 | 547 k/h ×2.2 | 851 k/h ×3.4 |
| quick losses from the start | 165 k/h ×0.7 | 233 k/h ×0.9 | 300 k/h ×1.2 |

The implemented table is the lighter one: the 5 / 8 / 12 / 17 / 24 k starting hypothesis leaves the honest loop at ×4.9 and the quick-loss floor at ×3.4, with the same weekend viability.

**Deliberate behaviours under the implemented rule** (net worth ÷ jobs at 1 / 2 / 5 / 10 / 20 h):

| behaviour | result |
|---|---|
| honest grinder, decent | ×2.7 / 5.2 / 8.1 / 8.9 / 7.9 |
| pure staller (guards, never attacks; expert-level defence) | ×5.7 / 7.1 / 10.7 / 9.5 / 8.1: a skill result, not a loophole |
| quick losses from the start (8 s bouts) | ×0.7 / 0.8 / 0.9 / 0.9 / 0.9: never worth it |
| honest to rung 3, then quick losses | ×2.1 / 2.6 / 2.8 / 2.4 / 2.3 |
| honest to rung 5, then quick losses | ×2.7 / 5.2 / 7.6 / 8.2 / 7.0: the rank was earned honestly; throwing bouts afterwards earns about half of playing them |
| abandon every bout | 0 |

Draws: none occurred in the duel matrix (40 bouts for each of 72 skill × training × wrestler pairings) or in the stalling matrix (30 for each of 24 pairings), so a draw (paid at factor 1) cannot be farmed. Repeated wins against the same opponents: the purse is a pure function of opponent level and result, so n wins pay n times one win at any rung (tested).

## Validation in the default làmb (sans frappe), and the minimal-input staller

**Real keyboard in the real game** (`scripts/m1a-sim/staller-browser.mjs`, ranked bouts through the game's own flow, 2 bouts per strategy) and **headless** (`staller-check.ts`, 108 bouts per strategy: 3 levels × 3 styles × 12):

| strategy (default làmb) | result | what it paid |
|---|---|---|
| no input at all | lost by projection in 6–8 s (browser and headless, 100 %) | the loss purse (3 000 F at level 1) |
| hold Garde (one key, KeyG), nothing else | **a time-out draw, 90 s, in 100 % of bouts at levels 1, 3 and 5** | the draw purse: 5 000 F (level 1), 6 500 F (level 2): factor 1.0, more than a loss |
| hold Garde + Dégager in the clinch window | the same draw, 100 % | the same |

In the default làmb nobody wins by guarding: a win needs moving in, timing the grab, guarding the opponent's grab at the right moment and tapping in the clinch (the headless players that do this win 79 % of their bouts; the one that does not cannot win at all). So a win always needs play, but **a guaranteed paid draw needs one held key**: about 255 k F/h when repeated (ritual and 90 s of holding), the jobs' level (net worth ×0.5 to ×1.0 the jobs' at 1 to 20 h), on rung 0 for ever since a draw is not a win (`rankedWins` gates the rungs). It is not above a job and it opens no prestige, but it is an AFK-able income. Options, none implemented, for you to decide: a draw in an ordinary bout pays the loss factor (0.6) when the player never grabbed; or leave it (it is at job level).

In Làmb 2.0 (flag off) the same strategies lose (idle and Garde held: 92–100 % losses, 9–36 s); only the reactive staller of the earlier matrix wins (63–100 % against levels 5 to 1), and it needs expert-level reactions (0.2–0.3 s, 95 % of attacks answered, 90 % of throws countered): meaningful counterplay skill, not minimal input.

**Economics in the default làmb** (`DUEL_MATRIX=sans npx vite-node scripts/m1a-sim/wrestling3-report.ts`: bouts last 4–7 s, so the 55 s ritual is nearly the whole cycle; a decent player wins 79 %). Net worth ÷ the jobs mean at 1 / 2 / 5 / 10 / 20 h, previous rule → implemented:

| player | previous | implemented |
|---|---|---|
| casual weekend fighter, novice | ×1.1 / 1.2 / 1.2 / 1.6 / 2.6 | ×1.1 / 1.1 / 1.1 / 1.3 / 1.7 |
| casual weekend fighter, decent | ×1.3 / 1.3 / 2.6 / 4.1 / 4.6 | ×1.1 / 1.1 / 1.8 / 2.4 / 2.8 |
| all evening, decent | ×3.6 / 4.4 / 8.6 / 9.5 / 8.3 | ×2.4 / 2.4 / 3.4 / 3.9 / 3.6 |
| all evening, expert | ×3.9 / 4.8 / 14 / 21 / 22 | ×2.4 / 2.6 / 4.6 / 8.0 / 9.6 |
| bout grinder, decent | ×102 / 109 / 106 / 79 / 51 | ×8.8 / 8.7 / 8.6 / 6.9 / 5.1 |
| bout grinder, expert | ×133 / 176 / 249 / 189 / 169 | ×10.7 / 11.8 / 15.5 / 14.3 / 13.9 |

The ordinary-bout loop alone: decent ×155 → ×4.3 the jobs' hourly income, expert ×663 → ×5.7; quick losses from the start ×0.9. Weekend fighters stay viable at every horizon. Over 20 h the decent grinder earns 22.0 M from ordinary bouts, 19.3 M from galas and 4.6 M from titles; the all-evening weekend fighter 2.4 M, 19.1 M and 4.1 M: in the default làmb the prestige income is the same (24.0 M against 23.2 M, it is calendar-limited), and the grinder's extra comes from the ordinary loop (×4.3 the jobs per hour), which is the skill and time premium the owner accepted. The decent player reaches rung 4 and not the belt (the champion, Babacar, a level-5 « costaud », beats the headless decent player every time; the expert reaches rung 5).

## What this does not solve

The honest decent grinder still ends around ×8 the jobs' net worth at 10–20 h. That is no longer an ordinary-bout loop (that loop fell from ×156 to ×3.1 per hour); it is the prestige economy the owner chose to keep:

| 20 h, decent | ordinary | galas | titles | total | net worth |
|---|---|---|---|---|---|
| grinder | 15.7 M | 39.0 M | 27.7 M | 82.4 M (×16 the jobs' active income) | 268 M (×7.9) |
| all-evening weekend fighter | 1.5 M | 18.7 M | 14.0 M | 34.2 M | 129 M (×3.8) |
| casual weekend fighter | 0.8 M | 12.4 M | 10.1 M | 23.4 M | 84 M (×2.5) |

Galas and titles are calendar-limited (one bout an evening, Friday to Sunday; the belt on Sundays), so volume cannot raise them; the grinder simply reaches rungs 3, 4 and 5 sooner (about 36, 59 and 294 minutes) and so collects about twice the prestige income of a weekend fighter over 20 hours. Levers that would lower the residual, none implemented because each is an owner decision: the gala and title purses themselves, the pace of the rank climb (a ladder-points decay for repeated opponents was simulated: it slows the first two hours, ×3.2 to ×1.8 at 1 h, but leaves ×6.3 at 20 h, and slows weekend fighters too), or access rules for the top rungs. A duration rule for quick losses was considered and rejected: honest weak players lose in 10 s against levels 4–5 and would be penalised.
