# Grand Camp 5 contre 5: proposed stake rules (for the owner's approval)

Status: **proposal, not implemented.** The brief asks for explicit rules before any pooled stake exists. Until the owner approves this page, organized Grand Camp matches are built and tested with the stake switched off (a match costs nothing and pays nothing). All money here is the game's fictional F; nothing is bought or cashed out for real money.

## The stake

- Fixed at 1 000 F per player. The organizer cannot change it. Ten players make a pot of 10 000 F.
- A player's 1 000 F is taken when they press « Prêt », not when they are invited or when they join the lobby. Pressing « Prêt » again (not ready) gives it back at once.
- The stake is held by the server (the same account that holds Teranga Money), never by a player. A player who does not have 1 000 F cannot be ready and is told why.
- A player can hold one stake at a time: one lobby, one match.

## Before kick-off

- The match starts only when ten players are ready, five a side.
- Anyone who leaves the lobby, is removed by the organizer or loses the connection before kick-off gets their stake back.
- If the organizer leaves, the lobby passes to the longest-present player. If the lobby empties or is not full 10 minutes after it opened, it closes and every stake is returned.

## Settlement

- Win: the five winners share the pot equally, 2 000 F each (their own 1 000 F and 1 000 F won). The losers get nothing back.
- Draw at full time: every stake is returned. No extra time, no penalties in 1.0.1.
- The server settles each match once, under the match's id; a repeat of the same settlement changes nothing. A player sees the result only after the server has written it.

## Disconnections during a match

- A player who drops has 60 seconds to come back to the same team; the team plays one short meanwhile.
- A player who does not come back keeps their place in the result: their stake is lost if the team loses and paid if it wins. Leaving never recovers a stake and never forfeits a win for the others.
- If a team falls below three connected players for more than 60 seconds, the match is abandoned and every stake is returned. The same applies if the server stops the match for any reason.

## Abuse limits

- At most five staked matches per player per economic day.
- The same ten players can settle at most three staked matches together per economic day; after that their matches are friendly (no stake).
- A stake cannot be sent, lent or paid by another player.
- Abandoned matches are counted per player; three abandoned in a day by leaving turns staked play off for that player until the next day.

## What the owner is asked

1. Approve, change or refuse these rules. If refused, organized matches ship in 1.0.1 without stakes.
2. Winner payout: equal split (proposed) or something else.
3. The daily limits above (five matches, three with the same ten).
