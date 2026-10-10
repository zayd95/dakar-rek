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

## Moments: progress made visible (src/career/progress.ts)

Only real saved values. No invented numbers and no streak counters.
- **After a bout** (fought): a recap card at the top of the toast column, under which the toasts stack. It shows:
  - the result (« Victoire contre Gora »);
  - the purse;
  - the rank change with the city place (« Nouveau palier : Undercards · 11e de la ville (était 13e) »);
  - what moved among Forme / Richesse / Réputation / Influence and why (« Richesse +2 · le cachet »), or the new word
    when one is reached (« Réputation : Connu du quartier ! »).

  The result toast stays short.
- **After a gala watched to the end** (fight evenings): the result, the belt (taken or kept), and the winner's new place
  in the city's table (or the top two when nothing moved).
- **A new word on a gauge:** a small card once, with the reason (the gauge's note). The best word reached per
  dimension is kept (`career.dimBest`): falling back and rising again is not celebrated twice. The first look at an
  older save only remembers where the player stands.
- **Phone › Profil:** under each word, the change since the end of the last day played (« +6 depuis hier », « −2 depuis
  samedi »), from `career.dims` (the scores as last seen on each of the last 8 city days, updated every 2 s). There is
  nothing when there is no earlier day or the gauge did not move.
- **Cards:** a tap anywhere dismisses one. They leave by themselves after 6–12 s and are never modal; two at most. On a
  landscape phone a card keeps five lines, so it and the toasts stay above the action column.

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
and, higher up, an opponent level beaten (3, 5). Champion means holding the belt (from 500 pts), Roi des Arènes holding
it with three defences won (from 1 000 pts); losing the belt drops the rank back to the points' rung (the best rung
reached is kept apart). The arena app says what is missing for the next rung.

## The city's ladder (src/career/roster.ts)

Twelve fictional wrestlers — écurie Baobab (Babacar 5, Ousmane 4, Malick 3, Pathé 2), écurie Teranga (Lamine 5,
Daouda 4, Assane 3, Birame 2) and independents (Gora 2, Ndiaga 2, Pape 1, Saliou 1) — each with a duel style
(costaud, rapide, défensif) and a level. No real wrestler, écurie or promoter.

- **Seasons.** Four city weeks. Each season starts from the levels' points (0, 25, 80, 190, 360, 620) and a blank
  record; the belt carries over. The table, the records and the belt are the same for every player on the same city day
  (deterministic from the day, no server). The belt at each season's start is remembered, so a long-lived city costs
  one season of work; the career module also keeps the ladder of the day until a bout or a watched gala changes it.
- **Fight evenings** (Friday, Saturday, Sunday): a main event between two of the best (never the champion before
  Sunday), and three undercard bouts of neighbours in the table. Results follow the levels and the season's points
  (`winChance`) with a seeded draw per night. Weekday cards at the arena take two wrestlers from the middle of the table.
- **The player's bouts** against roster wrestlers enter their records on that night. The main event the player watched
  to the end in the stands is remembered with its live result (`career.galas`, the last 60).
- **Opponents.** Ranked bouts (the open « Petit combat de quartier » / « Combat du soir », the arena's « Combat classé »)
  face one of the three roster wrestlers closest to the player's points, rotating with the bouts fought; never the
  champion. Name, style and level come from the roster (`GameModule.opponent`).
- **Gala place** (« Place au gala · contre <nom> », at the arena, Friday–Sunday from 16 h, from Adversaires réputés):
  one gala bout an evening, against a wrestler a notch above (never one of the main event), through the fighter's path
  (`arenaFighter.begin`). Purse × 2, positive points × 1.5, fame × 2. Entries carry `kind: 'gala'`.
- **Title** (« Combat pour le titre », Sundays from 16 h, from Contender): against the champion, or the best wrestler for
  a vacant belt. Holding it, « Défendre la ceinture » against the best challenger. Purse × 3, positive points × 2,
  fame × 3, `kind: 'title'`. A belt the player does not put at stake for more than 14 days is vacant at the next Sunday,
  and the two best fight for it.
- **Posters and the arena show** name the evening's real card through `setBillSource` (src/arena/program.ts `billFor`);
  « Combat pour le titre » on Sundays, the player's own name when they are signed up for the title.

## Lutteurs: the wrestlers' cards (phone › Arène)

- **The season's log.** `Ladder.log` keeps every bout of the season as the city saw it: day, the two wrestlers (or
  the player), the result, main event, title. Each wrestler's season record is exactly his bouts in it (unit-tested).
- **His look.** `rosterLook(id)`: écurie Baobab in green with a border, Teranga in the écurie's ochre, independents by
  style (rouge rayé, indigo, noir en damier), a skin, and placeholder accessories by level. The arena's entrance and
  the watched bout dress the evening's wrestlers in it. His phone portrait (`portraitSvg`, an inline SVG silhouette,
  no canvas, no 3D) is drawn from the same data.
- **His card.** `wrestlerCard`: name, écurie, style, level word (Débutant → Vedette), place, season record and
  points, the belt with its defences, and his last five results (newest first, « combat principal », « titre »).
  The arena app shows « Lutteurs de la ville », the twelve cards in table order.
- **The city's table.** Every wrestler, and the player at their place. Each row opens that wrestler's card.
- **Suivre.** One wrestler followed (`career.fav`). No reward, just following:
  - when he fights tonight (main event, or « en lever de rideau » in the undercard: `fightsTonight`), the evening call
    adds « Ton lutteur Gora combat ce soir contre Pape » and « Ce soir » shows it first;
  - after a gala watched to the end, the recap card gives his result (`resultOn`, from the next day's ladder).

## Public record (presence `rec`)

Other players read a short line under the player's name: « Undercards · 3-1 · Écurie Baobab » (rung · ranked wins-defeats
(-draws) · écurie), nothing before the first ranked bout (`publicRecord`). It goes with the connection (`rec` URL
parameter) and as a `{ type: 'rec', rec }` message when it changes. The server accepts only that shape
(`recordTag`: a rung label, an optional `\d{1,4}-\d{1,4}(-\d{1,4})?`, an optional « Écurie <letters> », 48 characters at
most) and closes the connection otherwise; `null` clears it.

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
- `GameModule.opponent(ctx, mode)`: who the player faces in a ranked bout (the career's roster); `GameCtx.setPublicRecord`.
- Debug (`?debug`): `__dakar.career()` (rank, record, bouts, attributes, dims, line), `__dakar.careerBout(mode, winner,
  level, outcome, name)` (same path as a real bout), `__dakar.careerLadder(day?)` (table, belt, card, sign-up, rank),
  `__dakar.careerSign(kind?)` (sign up for the open bout, a gala place or the title).

## Not yet

Promoter events (§16–18, the `evenements` counter is ready); the title bout's own staging (it uses the fighter's path
and the duel as any ranked bout); the roster's wrestlers as people in the city.
