# Career — progression without classes (lane `lane/w3-career`, 10 Oct 2026)

Spec: `docs/SPEC_SIGNATURE_2026-10-10.md` §1–2, §13–15. The game never asks « combattant, promoteur ou businessman ? ».
What the player becomes is read from what they did; no path closes another.

Files: `src/career/career.ts` (pure logic, unit-tested in `tests/career.test.ts`), `src/career/module.ts` (the
`GameModule`), `src/career/career.css` (profile card), `scripts/check-career.mjs` (browser check). The save gains an
additive `career` field (`{ bouts, best }`, sanitised in `src/core/save.ts`; no schema version change: older saves start
with an empty record).

## The four dimensions (§2) — phone › Profil

| Dimension | Read from | Words |
| --- | --- | --- |
| Forme | `forme` (running in Dakar, open-air gym), écurie sessions, gainage | À reprendre → Au sommet |
| Richesse | net worth (wallet + everything owned, `src/economy/assets.ts`) on a log scale | Modeste → Très riche |
| Réputation | fame points: ranked wins weighted by the opponent's level, projections, entrances | Inconnu → Légende |
| Influence | friends and acquaintances, ventures and billboards owned, events organised (counter `evenements`, for the promoter later), rank | Discret → Incontournable |

Four slim gauges with a word and one reason line each — no points to spend, no screen of stats. The headline under the
name says « Une vie à Dakar », or « Lutteur · <rang> » once the player has fought.

## Fighter attributes (§7, §13) — data for the làmb 2.0 lane

`fighterAttributes(counters)` → Force, Équilibre, Technique, Explosivité, Endurance, Frappe, Défense, Sang-froid, each
20 at the start and growing slower and slower towards 100 (no attribute guarantees a win). Fed by what already exists
plus three écurie drills (plain timed actions on Coach Ablaye's écurie, also in « ⋯ »):

| Practice | Counter | Attributes |
| --- | --- | --- |
| Running in Dakar | `forme` | Endurance, Explosivité |
| Session with Coach Ablaye | `lutte` | Force, Équilibre, Endurance |
| Sac de frappe | `entr_frappe` | Frappe, Explosivité |
| Travail des saisies | `entr_saisies` | Technique, Équilibre |
| Gainage et pompes | `entr_force` | Force, Explosivité |
| Guided sparring | `lamb_skill` | Technique, Défense, Équilibre |
| Bouts, entrances | `combats`, `victoires`, `entrees` | Sang-froid, Défense, Technique |

## Ladder towards « Roi des Arènes » (§14)

Petits combats → Undercards → Combats classés → Adversaires réputés → Contender → Champion → Roi des Arènes. The rank
score is the sum of the bouts' points (ranked win 12 + 6 × opponent level, +4 for a projection; draw 4 + level; defeat
−6 + level (min −2): it costs less against a stronger opponent and never goes below zero; friendly bouts count a little;
abandon −3) plus regularity (3 per city day with a bout in the last seven). Each rung also asks ranked wins (1, 3, 6, 10)
and, higher up, an opponent level beaten (3, 5). Champion and Roi des Arènes wait for title bouts (counter `titres`, not
built yet). The arena app says what is missing for the next rung.

## Purse and record (§14–15)

A ranked bout pays a purse by the rung at the start of the bout: 5 000 F (petits combats), 15 000, 50 000, 150 000,
400 000, 1 000 000, 2 500 000 F (Roi des Arènes) — × 1.5 × (1 + 0.1 × level) for a win, × 1 for a draw, × 0.6 for a
defeat (« baisse de cachet »), nothing for an abandon or a friendly bout. Paid once, with a wallet line « Cachet · combat
classé contre <nom> ». Every finished bout is kept (day, mode, opponent, style, level, result, how, purse, points; the
last 300): totals, the rival (most history, or a defeat), the biggest purse, the current streak, the last bouts, and
one shareable line for presence later (`recordLine`: « 4 combats · 3 V · 1 D · Undercards · rivalité avec Gora · plus
gros cachet 8 250 F »). A defeat suggests the revenge (« Revanche à prendre contre Gora »).

## Integration points

- `GameModule.lamb(ctx, e)` (src/game/modules.ts): main.ts reports every finished bout (mode, outcome, winner, opponent,
  level) and every écurie session; modules return lines for the result toast. The career module is the first user.
- `phoneHooks.profileDims`, `phoneHooks.profileHeadline` (src/ui/phoneHooks.ts); the career wraps `arenaProfile`.
- Debug (`?debug`): `__dakar.career()` (rank, record, bouts, attributes, dims, line), `__dakar.careerBout(mode, winner,
  level, outcome, name)` (same path as a real bout).

## Not yet

Title bouts and defences (Champion, Roi des Arènes), promoter events (§16–18, the `evenements` counter is ready), the
record shown to other players through presence (the line is ready), opponents beyond the three fictional styles.
