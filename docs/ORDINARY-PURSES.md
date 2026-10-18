# Ordinary-bout purses (separate PR, stacked on M1-A)

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

## What this does not solve

The honest decent grinder still ends around ×8 the jobs' net worth at 10–20 h. That is no longer an ordinary-bout loop (that loop fell from ×156 to ×3.1 per hour); it is the prestige economy the owner chose to keep:

| 20 h, decent | ordinary | galas | titles | total | net worth |
|---|---|---|---|---|---|
| grinder | 15.7 M | 39.0 M | 27.7 M | 82.4 M (×16 the jobs' active income) | 268 M (×7.9) |
| all-evening weekend fighter | 1.5 M | 18.7 M | 14.0 M | 34.2 M | 129 M (×3.8) |
| casual weekend fighter | 0.8 M | 12.4 M | 10.1 M | 23.4 M | 84 M (×2.5) |

Galas and titles are calendar-limited (one bout an evening, Friday to Sunday; the belt on Sundays), so volume cannot raise them; the grinder simply reaches rungs 3, 4 and 5 sooner (about 36, 59 and 294 minutes) and so collects about twice the prestige income of a weekend fighter over 20 hours. Levers that would lower the residual, none implemented because each is an owner decision: the gala and title purses themselves, the pace of the rank climb (a ladder-points decay for repeated opponents was simulated: it slows the first two hours, ×3.2 to ×1.8 at 1 h, but leaves ×6.3 at 20 h, and slows weekend fighters too), or access rules for the top rungs. A duration rule for quick losses was considered and rejected: honest weak players lose in 10 s against levels 4–5 and would be penalised.
