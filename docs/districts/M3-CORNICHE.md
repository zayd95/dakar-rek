# M3 · Corniche / Fann — « Join the match »

**Status: Gate A (engineering) evidenced in [`M3-EVIDENCE.md`](M3-EVIDENCE.md); Gate B (the owner's iPhone) pending.** The player can join the evening match on the Corniche's pitch.

## The idea

A player stops what they are doing and plays football because it is fun. There is no money in it: no stake, no prize, no wager.

What a match leaves behind:
- the player's record;
- two regulars who remember them.

## What already existed (and is improved, not replaced)

- **The NPC match** (`src/game/footballSim.ts`, `src/game/football.ts`):
  - two teams of the city's footballers on the Corniche's pitch, futsal rules;
  - every touch is a contact planned by the match;
  - the leg reaches the ball at that frame;
  - goals, celebrations, kick-offs, spectators.
- **The kickabout** (`src/game/kickabout.ts`): when no match is played, a ball anyone may dribble, pass and shoot (« Passer », the held « Frappe »).

**One ball simulation at a time:** while a match is on, the kickabout waits.

## What M3 adds

### 1. The player in the match (`footballSim.ts`, `human`)
- **Movement:** the player's body is placed in the match every frame (`setHuman`). The match never steers or pushes it.
- **Touches:**
  - running into the ball gives a dribbling touch toward where the player runs;
  - standing in a fast ball's way traps it;
  - « Passer » (to a teammate ahead) and « Tirer », or the held « Frappe » (power from the hold), play the ball once it is at the foot. An asked pass or shot reaches 1 m from the foot (a dribble's touch 0.6 m), and waits 1.2 s for the ball, so a press with the ball just ahead is never lost. The kickabout's button strikes within 1.6 m of the body, so both feel the same.
- **Every touch goes through the match's own contacts:** passes, shots, goals and stats count as any player's.
- **The player is never the taker** of a kick-off or a restart, and never fetches the ball, so a player who just stands never stalls the match.
- **The NPCs play with the player:** teammates pass to them, opponents press them when they have the ball.

### 2. Joining and leaving (`football.ts`)
- **Joining:** at the touchline during a match, the action button offers « Rejoindre le match ». The sheet shows the team and the rules.
- **Team size:** the player joins the smaller side. If that side already has five, one of its footballers (never a regular, never the keeper) waits at the touchline in their place.
- **The short match:** first to 3 goals, or 4 minutes of play at most (`matchRules.ts` `SHORT`).
- **The end:**
  1. The result card: « Victoire 3–1 » / « Défaite » / « Match nul », with the player's goals, passes and shots, and their record.
  2. The regulars' words.
  3. A sheet: « Rejouer », « L'ataya avec Babou », « Partir ».
- **Leaving early:** walking off the grass (more than 6 m), getting into a vehicle or leaving the hub ends the player's part. Nothing is recorded, and the NPCs play on.
- **Not leaving by accident:** opening the phone only leaves the player standing, still in the match. During the match the action button is the ball's alone (an `exclusive` interaction source), so a tap never greets a passer-by or sits on a bench.
- **The second thumb:** « Passer » on the action button works with the other thumb still on the stick. The HUD acts on a second finger's tap, which the browser gives no click.
- **After the match:** the controls are the ordinary ones. Nothing about movement was changed.

### 3. The regulars (`matchRules.ts`, `REGULARS`)
- **Babou,** the pitch's regular, plays on the player's side. **Khadim** captains the other side.
- **Their faces stay fixed:** each has his own skin, hair and build, with the kit over it, so the player knows them again.
- **Their words:**
  - Babou introduces himself when the player first joins.
  - Both comment on the result and on the player's goals.
- **The ataya:** Babou comes off to the touchline next to the player for « L'ataya avec Babou », then goes back on.
- **Recognition:** on a later city day near the pitch, Babou knows the player again, once a day, and names their last match: « Eh, le buteur ! On t'attendait. Tu joues avec nous ce soir ? »

### 4. When the match is on
- **The evening match now runs 15:30–20:30**, plus Sunday mornings. A city hour is a minute of play, so the old 17:00–19:36 window was gone in under three minutes.
- **A match the player has joined lasts until it ends:** the footballers stay as long as the match drives them.

## Save (CONTRACT.md row 13)

- **Where:** numbers in the existing `counters`, prefix `ft_`:
  - `ft_match_seq`, `ft_match_recorded`: each match is recorded once;
  - `ft_matches`, `ft_wins`, `ft_draws`, `ft_goals`;
  - `ft_last`, `ft_last_day`, `ft_last_goals`;
  - `ft_ataya`;
  - `ft_babou_met`, `ft_babou_seen_day`, `ft_khadim_met`, `ft_khadim_seen_day`.
- **Shared memory:** the regulars' visits and relations go through the shared NPC memory (`recordVisit`, `Relations`), used as is, under the ids `foot_babou` and `foot_khadim`.
- **What is not saved:** no schema change, no migration. A match in progress is not saved: a reload simply leaves the player out of it.
