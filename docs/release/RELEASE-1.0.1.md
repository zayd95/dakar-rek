# Dakar Rek 1.0.1 — The city comes alive

Branch `release-1.0.1` (from the published 1.0, `450febda`), draft pull request zayd95/dakar-rek#92 into `wip/visual-pass`. **Not merged, not published.** Merging publishes the public game through Workers Builds and applies a new server migration; both need the owner's explicit approval.

## What a player gets

### Money between players (Teranga Money) and messages
- **The owner's report (1 000 F and 2 000 F sent, nothing received) was reproduced with two browsers on the 1.0 code: no money was lost.** Both sends were in the ledger; the recipient's Teranga Money was 3 000 F, but the HUD and Argent showed only the wallet, and the card said « reçus » with no action.
- Now: a notice « 💸 1 000 F reçus de … » with « Retirer » and « Voir »; Argent shows Teranga Money beside the wallet with « Retirer » and the total; the conversation card offers « Retirer 1 000 F ». The wallet changes only after the server confirms.
- A send the server has not answered says « En attente de confirmation… » until it resolves to a yes or a no (at once or at the next connection), never « Rien n'est parti ». A failing delivery is parked and retried, never dropped; the recipient's account rebuilds a missing card from the ledger (once, from the last 14 days at the first connection after the update: owner approved).
- Players: short nameplates that stack (at most 8), a city first name instead of « Dakarois 4F2A », a crown over one's own player (only on one's own screen), the friend code only under « Ton code », one player menu (Saluer, Message, Envoyer de l'argent, Inviter chez moi, Proposer un rendez-vous, Inviter au Grand Camp). The HUD « Chat » button opens Messages; proximity chat is its « À proximité » row.

### « Mes véhicules »
- Every owned vehicle with its real status (Stationné, En circulation, En panne, Pas encore sorti), its district and nearest landmark, and « Localiser »: the map centred on the recorded position, the existing guidance, a marker. « Faire sonner » within 60 m. No teleport, no position invented, no other player's vehicle.
- Five position defects fixed (vehicles left behind on the road between districts, a car sold elsewhere coming back there, the lent Tiak bike's map position, two fallbacks, four hard-coded lists).

### Housing
- The F2's monthly economy: an economic month is 7 real days; rent 50 000 F, charges 10 000 F, furnishing 300 000 F, sublet unfurnished 60 000 F or furnished 150 000 F at 80 % occupancy (not guaranteed), settled once a month with a capped catch-up.
- **Buying or renting a home now hands the keys at once** (« Les clés sont à toi », listed in Biens, its door opens, a marker leads there), asks « Emménager maintenant ? » and, in the same step, what happens to the home left: the family room (keep, free, or give back), a rented home (hand back the keys or keep the lease, sublet the F2), an owned home (let it, sell it, keep it empty), with the money shown. Furniture follows; every choice can be changed later. Older saves get the question once, from the home's sheet.

### Work and bonuses
- **Tiak Tiak in all five districts**: a rolling board, always five runs from the player's district (three local, one to a neighbour, one further), compact cards (`Plateau → Mermoz · Documents · 3 500 F · Accepter`), the next run in one tap. 36 delivery points; every run reachable (flood-filled on the built district, `planTrip` between districts).
- **« Coups de pouce »**: nine one-time bonuses, each paid once per save: first Tiak Tiak delivery 10 000 F, first furniture 15 000, vehicle found with « Mes véhicules » 20 000, delivery to another district 25 000, rooftop meal or Le Patio evening 30 000, Teranga Money send or withdrawal 35 000 (offline: a bank deposit), F2 lease or a home bought 45 000, a match at the Corniche (Grand Camp, or offline a neighbourhood match) 50 000, a home let 70 000. Total 300 000 F.

### Living places
- Le Patio (from 20 h), Toit Baobab (lunch and evening), Terrasse de Ngor (17 h–1 h) and Sunset Lounge, Ngor beach (afternoon): people arrive, meet, dance, sit, look at the view, browse a stall, take a bed, and leave, on hour windows. Simulated on each device (nothing sent over the network); their bodies come out of the street's shared budget.

### Grand Camp
- Player-organized matches under the owner's rules (`GRAND-CAMP-RULES-1.0.1.md`): the organizer sets the fee (1 000 F by default; Gratuit, 500, 1 000, 2 500, 5 000 F or any amount up to 250 000 F), 6 / 10 / 14 players, equal split for the winning team or one winner, public or private; the pool is the fees collected, no commission, no daily cap. Teams Rouge and Jaune (renameable), « Prêt » takes the fee, which comes back on leaving or cancellation before kick-off; a draw or a server stop refunds everyone; a dropped player has 60 s to come back.
- The server runs the match (20 Hz, footballSim with every player human), decides every touch of the ball, holds the fees in the ledger and settles once per match. Phone app « Grand Camp »: the district's matches, « Organiser » with the live pool and gain per winner, the lobby, invitations (lobby, player menu, a plain text message that a 1.0 client reads as text). On the Corniche pitch: PASSE · DRIBBLE · TIR in the action area, score and clock, the result and the payout only after the server's settlement.

### Presentation
- **Opening**: a 14 s in-engine glide over Pikine's roofs onto the play camera, on first launch only; a tap skips it; reduced motion gets a 1.2 s fade; « Revoir l'ouverture » in Réglages › Caméra.
- **« Autour de moi »** (the phone's first tile): Tiak Tiak runs, Grand Camp matches, friends online, places open now, activities, nearest first, one action each.
- HUD pass: offer cards kept clear of the middle, landscape cards in the right column, the delivery line under the desktop minimap, the first-job goal line uncut, 44 px wallet chip and « Retirer », a sheet no longer opens scrolled where the last one was left.
- **Public build**: on the public host `?debug` keeps 19 read-only hooks and the smoke test's moves; every hook that creates money or value (`giveMoney`, purchases, the game state, the simulated online account …) exists only on test hosts.

## Server, saves, deployment

- ⚠️ **New Durable Object class `GrandCamp`, migration `v3-grand-camp`, binding `CAMPS`** (in `durable_objects` and `previews`). It is applied to the public Worker by the deployment that publishes 1.0.1, and cannot be undone by deploying 1.0 (see Rollback).
- Ledger (`Social` `ledger`): three add-only Grand Camp tables, created at the first Grand Camp step. Accounts: one new `meta` key. Existing tables and the `ops` history are unchanged.
- `ONLINE_PROTOCOL` / `PROTOCOL_VERSION` unchanged: 1.0 clients keep working; `camp` is announced in `/api/health` and in the room welcome's `features`.
- Saves: no change of shape (docs/SAVES.md); the new marks are counters and flags read with defaults.
- **No preview URL can be built from this branch.** Workers Builds uses `wrangler versions upload` on non-production branches, which cannot apply a Durable Object class change; the check « Workers Builds: dakar-rek » fails on #92 for that reason only. A preview would need a separate staging Worker deployed with the owner's Cloudflare account.
- CI: the game checks run on `ubuntu-24.04` (GitHub's `ubuntu-latest` moved to 26.04, where Playwright 1.56 cannot install Chromium).

## Rollback

Branch `rollback/production-before-release-1.0.1` (standby draft PR zayd95/dakar-rek#93): the 1.0 game plus an empty `GrandCamp` (`server/campStub.ts`), its binding and the `v3-grand-camp` entry, because once v3 is applied a deployment must still declare the class (deleting it would destroy its storage). `wrangler deploy --dry-run` passes. Entry fees still held at rollback time stay in the ledger's Grand Camp tables, untouched, until a later release returns them.

## Balance

| | Figure | Source |
|---|---|---|
| Tiak Tiak in a district | 1 000–2 000 F (700 F + 3.2 F/m) | BALANCE-1.0.1-tiak.md |
| Tiak Tiak between districts | 2 500–10 000 F (express ×1.25) | same |
| Tiak Tiak per hour (simulated) | on foot ≈ 47–55 k F; on the bike ≈ 117–119 k F | same |
| F2 by the month | rent 50 000 + charges 10 000; furnished sublet 150 000 F at 80 % → about 60 000 F net a month, furnishing paid back in about five months | BALANCE-1.0.1-housing.md |
| « Coups de pouce » | 300 000 F in total, once per save (≈ 6 h of Tiak Tiak on foot, 2 % of the F2's price) | BALANCE-1.0.1-coups-de-pouce.md |
| Grand Camp | pool = fees collected; equal split pays each winner twice the fee | GRAND-CAMP-RULES-1.0.1.md |

## Validation

(Filled in from the release-candidate run on one exact commit.)

## Known limits

- A fresh save can collect the « Coups de pouce » again (the wallet is on the device): about 238 000 F net, which fits under Teranga Money's 500 000 F/day funding cap, so it can be moved to another account in one day.
- The HUD money figure shows the wallet only; Teranga Money is in the notice and in Argent.
- Grand Camp: spectators see the players through presence but not the ball; a Meshy avatar's shirt takes the nearest palette colour; dribble touches have no leg animation; no nameplates over the match's players; « Un seul gagnant » = the top scorer of the winning team (ties: the earliest goal), the owner's confirmation pending. The servers do not answer a client's closing handshake (the client now drops the socket itself).
- « Mes véhicules »: no light flash (the lamp material is shared by every car of a model); the horn blip has no direction.
- Living venues follow the code's body caps 10 / 16 / 26; one sample on Ngor beach (High) right after a forced hour jump counted 35 bodies.
- The opening's real 14 s and the skip delay were measured on a software renderer only.
- Nothing here is a phone measurement: headless Chromium with SwiftShader says nothing about phone frame rate.

## Decisions for the owner

1. Publish 1.0.1 (merge #92), knowing the `v3-grand-camp` migration goes to the public server; or first a separate staging Worker for a preview.
2. « Un seul gagnant » rule (proposed: top scorer of the winning team).
3. Tiak Tiak runs across two roads pay up to 10 000 F (12 500 F express), above the 5 000 F VTC cap: keep or lower.
4. The car rapide's time counts on a Tiak run's clock (a short Corniche → Almadies hop by car rapide arrives late).
