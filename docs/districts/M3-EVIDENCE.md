# M3 · Corniche / Fann « Join the match »: Gate A evidence (engineering)

- **Gate A** is engineering complete, evidenced here.
- **Gate B** is the owner's own iPhone playtest. It has **not happened**, and nothing here claims it.

- **Branch:** `feature/ld-m3-corniche-20261026`. It is stacked on M2 (`feature/ld-m2-plateau-20261026` @ `c26d9ac`, zayd95/dakar-rek#70).
- **Evidence run on:** `f684dd5` (golden path run 9, the tests, the football check and the performance views). The commit after it adds only this document and `proof/m3/`.

The design is in [`M3-CORNICHE.md`](M3-CORNICHE.md). The contract with Living Dakar 2.0 is [`CONTRACT.md`](CONTRACT.md) v6, row 13, agreed by LD2.0.

## What is implemented

1. **The player joins the existing NPC match** on the Corniche's pitch:
   - `footballSim.ts`, a `human` player, with no second ball simulation;
   - the match never moves or pushes the player's body;
   - every touch the player makes is one of the match's own contacts.
2. **Joining:** « Rejoindre le match » at the touchline. The sheet names the team and the rules.
   - The player takes the smaller side.
   - If that side already has five, one of its footballers (never a regular, never the keeper) waits at the touchline.
3. **Playing with the ordinary controls:**
   - the stick runs;
   - running into the ball dribbles it, and standing in its way traps it;
   - « Passer » on the action button passes to a teammate ahead;
   - « Frappe », held, shoots, with the power set by the hold.
   - Teammates pass to the player, and opponents press them.
4. **A short match:** first to 3 goals, or 4 minutes. Goals are the match's own, and the scorer celebrates.
5. **The end:**
   - the result card (« Victoire / Défaite / Match nul » with the score, then the player's goals, passes and shots, then their record);
   - Babou's and Khadim's words;
   - a sheet: « Rejouer », « L'ataya avec Babou », « Partir ».
6. **The social moment:** Babou comes off to the street-side touchline, the player joins him for the ataya, then he goes back on.
7. **Recognition:** on a later city day near the pitch, Babou knows the player again, once a day, and names their last match.
8. **Leaving:**
   - Walking off the grass (more than 6 m), sitting, getting into a vehicle or leaving the hub ends the player's part. Nothing is recorded, and the NPCs play on.
   - Opening the phone mid-match does not end it.
9. **No money anywhere:** no stake, no prize, no wager. The ledger is untouched.

**What is missing, or not proven here**
- No iPhone has run M3 (Gate B).
- **The player's body has no kick gesture:** the ball leaves the foot point, but the legs keep running. The NPCs' kicks are animated as before.
- **Unproven touch timing on a phone:** the buttons' timing was tuned with a slow headless browser (a few frames a second). How it feels at 60 fps on a phone is not proven.
- **One small-sided match:** no tournament, career or league, by the brief.

## What the review found and fixed

The first recorded runs passed their checks, but the logs showed the player's « Frappe » and « Passer » were mostly lost. These fixes are in `fc27fd3`:

1. **The match's asked kick only reached 0.6 m from the foot,** where the kickabout's button strikes within 1.6 m of the body. An asked pass or shot now reaches 1 m from the foot, and a dribble's touch stays at 0.6 m.
2. **The buttons flickered while dribbling,** because each touch pushes the ball out of instant reach. While the player has the ball (their touch last, within 3 m), the buttons stay up.
3. **A tap with the other thumb on the stick did nothing:** browsers give a second finger's tap no click. This was reproduced with CDP touch: the stick held, then a tap on `#act` gives a pointerup but no click. The HUD's action button now acts on that pointerup, and a single tap still goes through the click.
4. **Mid-match, the action button could focus a passer-by** (run 6: « Salaam aleekum ! »), and that greeting dropped the player out of the match. An interaction source can now hold the button (`exclusive`), so in the match only the ball is focused. A sheet or the phone no longer ends the match.
5. **The result card was cut short on a phone held upright.** The player's own row now comes first.

## The recorded golden path

`scripts/check-match-journey.mjs` plays the whole path with real touch, in one uninterrupted session:
- 390 × 844 portrait, touch, SwiftShader, with a video recorded;
- Chrome's own touch events through CDP: the stick, the action button, « Frappe » and the sheet rows;
- no synthetic clicks.

The debug shortcuts are labelled in the script:
- the hour (17:30);
- putting the player on the Corniche street 16 m from the pitch;
- the next city day;
- reading state.

**Run 9** on `f684dd5`: **25 / 25 checks passed**, no page errors, one session of 11 min 54 s (the video). The log is [`proof/m3/golden-path-run9.log`](proof/m3/golden-path-run9.log), with a contact sheet in [`proof/m3/golden-path-run9.jpg`](proof/m3/golden-path-run9.jpg).

1. **Arriving:** on a new save, nothing is remembered. At the pitch, the evening's footballers play 5 against 5, with Babou and Khadim among them.
2. **Joining:**
   - « Rejoindre le match » shows at the touchline.
   - The offer: « Jouer — Avec les Jaunes, Babou · premier à 3 buts, 4 minutes au plus » / « Pas maintenant ».
   - Babou introduces himself: « Tu joues avec nous ? Moi c'est Babou… »
   - The player is on a team at 0–0, a side of five kept to five, and the save remembers meeting both regulars.
3. **Match 1, played with the stick, « Passer » and « Frappe »:**
   - It ends **Défaite 1–3**, and the result is recorded once.
   - The card reads « Toi : 0 but · 1 passe · 0 tir », the score, and « Tes matchs : 1 joué ».
   - Babou: « On les aura la prochaine fois. Viens, on boit l'ataya quand même. » Khadim: « Pas mal, mais il faut courir plus ! »
   - The end sheet offers Rejouer / L'ataya avec Babou / Partir. No money moved.
4. **« Rejouer »:**
   - A new match starts at once at 0–0.
   - Match 2 ends Défaite 0–3, with « 0 but · 2 passes · 2 tirs ». It is recorded as the second match, with no double count.
   - Across both cards, the match counted the player's own shots and passes.
5. **« L'ataya avec Babou »:**
   - He comes off to the street-side touchline, and the player walks to him.
   - The ataya line plays, the save counts it, and Babou goes back on.
6. **A save and a reload:** the record, the regulars' memory and the ataya are kept, nothing is counted twice, and there is no « te revoilà » the same day.
7. **A later city day:** Babou: « Te revoilà ! Il faut prendre notre revanche, tu viens ? », once.
8. **Joining again:**
   - The phone is opened and closed mid-match: the player is still in it, and the stick plays.
   - Walking off the pitch ends the player's part, unrecorded, while the NPCs play on.
   - The ordinary controls are back: playing, the stick, no « Frappe » button.
9. **No page errors.**

**Scoring:** the player scored no goal in run 9. Run 7, on the fixes' first version, won match 1 **3–2 with 2 goals by the player** (3 passes, 2 shots); its log is not in `proof/`. The match is fair, and the scripted thumb is no star: see Known issues 4.

**The earlier runs (1 to 8) found and fixed:**
- the bench spot on the walled side;
- the join hiding the ataya;
- a timing check;
- the shot and pass buttons (§ What the review found);
- the passer-by greeting;
- the card.

## Tests

- `tests/footballHuman.test.ts` (8) covers the player in the match:
  - never moved by it;
  - never a taker, so standing still never stalls the match;
  - dribbles and traps;
  - a pass goes to a teammate;
  - shots, and the player scores;
  - an asked shot with the ball just ahead;
  - the ball pushed ahead is still the player's;
  - removed mid-match, the NPCs play on.
- `tests/matchRules.test.ts` (4) covers the rules:
  - the short match and the result;
  - recorded once (a retry, a rematch or a reload never counts twice), and no money moves;
  - recognition on a later day, once a day;
  - the regulars' lines.
- `tests/interact.test.ts` adds the exclusive focus: in the match, never a passer-by or a bench.
- The full suite: **184 files, 2235 passed, 2 skipped**. `tsc` is clean.
- The existing NPC football check, `scripts/check-football.mjs` at low quality: **19 / 19**.
  - It covers the ball, the drawn foot on the ball at every measured contact (max 3.8 cm), goals, celebrations, kick-offs, passes, the draw-call budget near the pitch, and the match put away far from it.
  - The NPC match itself is unchanged.

## Acceptance

| | |
|---|---|
| No competing ball simulations | One ball: the player is a player of the existing `Match`. The kickabout waits while a match is on, as before. |
| No stuck movement state | The match never moves the player. After the result, after walking off, and after the phone mid-match, the stick plays and the « Frappe » button is gone (journey checks). |
| No broken camera | The ordinary follow camera throughout (video). |
| Touch on a phone-sized screen | 390 × 844 portrait, CDP touch, including the two-thumb tap. |
| Reload and normal gameplay | A reload keeps the record and the regulars' memory, and counts nothing twice. The full suite passes. |

## Save, payment and memory

- **Save:**
  - Numbers live in the existing `counters`, prefix `ft_` (`FT` in `src/districts/matchRules.ts`, CONTRACT.md row 13).
  - Each match is recorded once, keyed by its own number (`ft_match_seq` / `ft_match_recorded`).
  - There is no schema change and no migration. A match in progress is not saved.
- **Payment:** none. The journey checks that the ledger stays empty.
- **Memory:**
  - Babou and Khadim go through the shared NPC memory, used as is (`recordVisit`, `Relations.change`, ids `foot_babou` / `foot_khadim`).
  - Recognition happens once per city day (`ft_babou_seen_day`).

## Performance against the baseline

The baseline is the repo's own draw-call budget: **180 / 300 / 420 calls** on low / medium / high.

**Method:**
- `scripts/m3-views.mjs` puts fixed cameras on the pitch at 17:30 with the evening match on (5 a side, the fans).
- It runs on the M2 head (`c26d9ac`, before M3) and on this branch.
- Both run at 390 × 844 in SwiftShader.
- Draw calls and triangles transfer to a phone. Frame times do not, and no iPhone was measured.

**Low quality**

| View | Draw calls before → after | Triangles before → after | Frame median ms before → after (SwiftShader, not a phone) |
|---|---|---|---|
| pitch-touchline | 66 → 67 | 100,034 → 100,166 | 150 → 150 |
| pitch-grass | 104 → 105 | 107,726 → 107,660 | 166.6 → 183.3 |
| pitch-high | 80 → 86 | 114,036 → 114,564 | 183.4 → 200 |
| corniche-street | 45 → 46 | 82,984 → 82,960 | 100 → 116.6 |

**Medium quality**

| View | Draw calls before → after | Triangles before → after | Frame median ms before → after (SwiftShader, not a phone) |
|---|---|---|---|
| pitch-touchline | 76 → 78 | 135,636 → 135,662 | 333.3 → 300 |
| pitch-grass | 119 → 121 | 138,392 → 139,370 | 383.3 → 366.7 |
| pitch-high | 115 → 120 | 165,220 → 166,182 | 416.6 → 400 |
| corniche-street | 51 → 59 | 107,308 → 111,688 | 250 → 266.8 |

**Reading:**
- M3 adds no geometry: the regulars are two of the evening's footballers, with fixed looks.
- Every change is within the run-to-run noise of live traffic, pedestrians and fans: the fans numbered 5 before and 6 after at medium, and the street view's +8 calls is traffic.
- The heaviest view is 121 calls (medium) against 300.
- The frame times (SwiftShader, CPU) move both ways by about one frame step.

Before / after images at medium quality: [`proof/m3/before-after-pitch-medium.jpg`](proof/m3/before-after-pitch-medium.jpg). The numbers are in `proof/m3/perf-*.json`.

## Known issues (with how to reproduce them)

1. **No kick gesture on the player's body:** the ball leaves the foot point while the legs keep running. *Repro:* join, run at the ball, hold and release « Frappe ».
2. **The pitch's south side is walled:** the touchline, the join and the ataya are all on the north (street) side. *Repro:* walk round the pitch.
3. **The buttons' timing is unproven on a phone** (see above). *Repro:* play a match on the preview with two thumbs.
4. **The NPCs play a fair match, not an easy one:** a player who just runs can lose 0–3. The win rate was not tuned.
5. **The city day can roll over during a long session.** Recognition follows the city day, as everywhere else in the game.

## The iPhone preview

- **Source:** the project's own Cloudflare Workers Builds, from the push of this branch. This session changed no configuration.
- **The link:** the bot posts the preview's link on the PR once it has built the push. It is recorded in the PR's body, not here, because committing it would move the SHA.
- **Unverified here:** this sandbox cannot reach `*.workers.dev`, so the link has not been opened from this session.
- **Checking the build:** the build id shown in the game (Réglages) must start with the PR's head SHA.
