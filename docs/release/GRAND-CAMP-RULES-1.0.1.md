# Grand Camp: player-organized matches (rules set by the owner)

Status: **rules decided by the owner on 13 November 2026; not yet implemented.** They replace the earlier proposal (fixed 1 000 F stake, five paid matches a day). All money here is the game's fictional F; nothing is bought or cashed out for real money.

## What the organizer decides

- **Entry fee.** 1 000 F by default. Shortcuts: Gratuit, 500 F, 1 000 F, 2 500 F, 5 000 F, or any whole amount typed in, 0 F included (a free match).
- **Participants.** 6, 10 or 14 players (3, 5 or 7 a side), within what the football mode supports.
- **Prize distribution.** « Équipe gagnante — partage égal » or « Un seul gagnant ».
- **Public or private.** Open to everyone nearby, or by invitation to friends.

The prize pool is the sum of the entry fees actually collected, nothing else. With ten players at 1 000 F: pool 10 000 F, 2 000 F per winner under equal split. No commission, no fixed prize, no daily cap on paid matches.

## Joining

- Before accepting, a player sees the entry fee, the pool if the match fills, the distribution and whether it is public or private.
- The fee is taken when the player presses « Prêt » and given back at once if they un-ready, leave, are removed or lose the connection before kick-off.
- The match starts when every place is filled and ready, the two teams equal.

## Cancelling and leaving

- Cancelled before kick-off (by the organizer, or because the lobby empties): every fee is returned.
- After kick-off the agreed rules apply. A player who drops has 60 seconds to come back to the same team. A player who does not come back follows their team's result: paid if it wins, not refunded if it loses.
- Draw at full time: every fee is returned.
- If the server has to stop a match, every fee is returned.

## Technical safeguards (the only restrictions)

- No negative balance: a player who cannot cover the fee cannot be ready, and is told why.
- The fee and the distribution cannot be changed once another player has joined; to change them the organizer cancels and opens a new match.
- No money from nowhere: payouts always add up to exactly the fees collected. With equal teams both distributions divide exactly (each winner gets twice the fee, or one winner gets the whole pool), so nothing is rounded.
- No duplicate payout: the server holds the pool and settles each match once under its id; a repeated settlement changes nothing. A player sees a result only after the server has written it.
- One pending fee per player at a time (one lobby, one match).

## Points that need the owner's word

1. **« Un seul gagnant » in a team match.** Proposed: the top scorer of the winning team takes the whole pool; if two are level, the one who scored first. Say if another rule is meant.
2. **« Top three ».** A football match has two sides, so there is no third place to pay. It will be offered when a mode with three or more ranked sides exists (a tournament); it is not in 1.0.1.
3. **Leaving after kick-off.** The owner's text says "apply the agreed match rules"; the 60-second return and "follows the team's result" above are the proposed reading.
