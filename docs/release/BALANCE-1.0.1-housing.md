# Balance report — 1.0.1, the F2 as a rental and furnishing progression

Stage B2 of Dakar Rek 1.0.1. All amounts are fictional in-game money. Code: `src/economy/calendar.ts`, `src/economy/monthly.ts`, `ECONOMY.monthly` in
`src/economy/config.ts`, the sheets in `src/economy/estate.ts`. Tests: `tests/monthly.test.ts`. Browser check: `scripts/check-f2-rental.mjs`.

## The numbers (the owner's targets, as implemented)

| | per economic month |
|---|---|
| Rent of the F2 (Résidence Jàmm) | 50 000 F |
| Operating charges | 10 000 F |
| Sublet empty, potential at full occupancy | 60 000 F |
| Let furnished, potential at full occupancy | 150 000 F |
| Furnishing pack (once) | 300 000 F |
| Average occupancy (never guaranteed) | 80 % |

One economic month is **seven real days**. Rent and charges are paid in advance: the first month at the signature, then once per month.

## Profit by occupancy

Monthly result = potential × occupancy − 50 000 − 10 000.

| Occupancy | Lived in (no tenant) | Sublet empty | Let furnished |
|---|---|---|---|
| 0 % (a vacant month) | −60 000 F | −60 000 F | −60 000 F |
| 50 % | — | −30 000 F | +15 000 F |
| 80 % (the average) | — | −12 000 F | **+60 000 F** |
| 100 % | — | 0 F | +90 000 F |

- **Payback of the furniture: 300 000 ÷ 60 000 = 5 economic months** (35 real days) at the average. Break-even occupancy furnished: 40 %.
- Sublet empty never makes a profit: at best it carries the home for nothing (100 %), on average it costs 12 000 F a month instead of 60 000 F. That is its
  use: keep the F2 cheaply while saving for the furniture, or while living elsewhere. The profit is in the furnishing step, as intended.
- How occupancy is drawn (`occupancy()`): one draw per player, home and month. One month in ten finds no tenant (0 %); the others are let 78–100 % of the
  month (89 % on average): 0,9 × 0,89 = 80,1 %. Measured over 20 000 seeded months in the test: mean between 78,5 and 81,5 %, 8–12 % of months empty,
  standard deviation above 20 points. Over 3 000 simulated furnished months the average result is 56 000–64 000 F, with 6–14 % of months at a loss.

## What a player must earn to hold the F2

- To live in it: **60 000 F per real week**.
- Measured earning rates (docs/M1A-ECONOMY.md): 195 000–277 000 F per hour of active play depending on the lifestyle and the skill (up to 316 000 F/h for
  the best single shift). The audit quotes 195 000–343 000 F/h. In `src/economy/config.ts` a Tiak Tiak course pays 1 000–6 500 F, a petit boulot 1 500–4 200 F.
- So the rent is **13 to 18 minutes of active play per real week**; the first month plus the pack (360 000 F) is **1 h 20 to 1 h 50 of play**. A new player
  can sign on the first evening and furnish within the first week. Against the old lease (6 000 F per city day, charged per played hour: 15 000 F per hour of
  play) the monthly lease is cheaper for anyone who plays more than four hours a week and dearer for anyone who plays less; it is the same for everybody
  per real week, which is the point.
- The furnished profit (60 000 F a week on average) is what **13–18 minutes of play** earn. It is a small, steady supplement, not a way to stop playing.

## Is « one month = seven real days » right?

Checked against the rates in the code: yes, with one remark.

- At seven days the furnished F2 returns 20 % of its furniture per week and the rent is a quarter of an hour of play: affordable and worth doing, and too
  small to distort anything. A shorter month (one real day) would multiply both the rent pressure and the passive income by seven: 420 000 F a week of
  rent is two hours of play, which would push casual players out, the opposite of an affordable first step. A longer month (30 days) would make the
  five-month payback last five real months: nobody would see it.
- The remark: the existing hourly properties dwarf it. A 3 000 000 F plot brings 4 500 F per city hour of play, that is 270 000 F per hour of play; the
  first venture tiers bring 400–10 500 F per city hour. The F2's 60 000 F a week does not compete with those and is not meant to: it is the step before
  them, reachable with 360 000 F instead of millions, and it pays even when the player is away (within the catch-up cap).

## The effect of the calendar

- The city clock (one day in 24 real minutes) is untouched. 420 city days pass in one economic month. Nothing monthly is ever read from the city clock or
  from played time: 50 000 F a month can never be collected every few minutes.
- The monthly contract is the first thing in the game that runs while the player is away. That is why the catch-up is capped (below).
- Per-day leases of every other home, and F2 leases signed before 1.0.1, still run per city hour of play, unchanged. A per-day F2 lease shows « Passer au
  bail au mois ».

## Exploits and inflation risks, and what was done

| Risk | What was done |
|---|---|
| Monthly amounts collected by the fast clock | A separate calendar. A contract counts its own months from the signature; `k` months settled are never settled again. Each settlement also records `rent:<asset uid>:<month>` in the save (`assets.settled`, last 32). |
| The same month settled twice (many ticks, a reload, a clock set back) | The month counter only moves forward; tested by calling the settlement fifty times, after a reload, and with the clock a year back. |
| Device clock set forward (offline) | When the game is online the server's clock is used (`presence.serverNow()`), and the device clock does nothing. Offline it cannot be prevented: the wallet is in the local save. It is bounded: at most four months per batch (the cap) and one batch per **half hour of real play**, so at the very best 4 × 90 000 F per half hour of play (every month at 100 %; 4 × 60 000 F on average, about 480 000 F per hour): one and a half to three times honest play, for someone who keeps changing the clock, and nothing a player who edits the save could not do faster. A clock moved back later earns nothing again. |
| Passive income piling up during a long absence | Capped catch-up: **four months** (28 real days) are settled, oldest first; the months beyond are skipped whole: no rent charged, no revenue paid, the last month paid covers the month in hand. Four because it covers a real month away, bounds the windfall at 360 000 F and the bill of a tenant who lives there at 240 000 F. |
| Re-rolling a vacant month | The draw is seeded by the player, the home and the global month: asking again, reloading, or ending and signing again in the same week gives the same answer. Signing again also costs a new first month. |
| Back-pay by offering just before a settlement | Revenue is counted for the time on offer only (offered at mid-month earns half); a home cannot be put on offer while a settlement is pending. |
| Furnishing for less than 300 000 F | « Furnished » means the pack's own pieces are in the home, not any furniture. The pack is eight catalogue pieces at their catalogue prices (299 500 F) plus 500 F of delivery; resold they bring half, like any furniture: no gain. A pack piece cannot be sold while the home is let furnished, and it stays behind when the player moves out. |
| Living in it and letting it at once; two tenants | Exclusive: a home on offer cannot be the principal residence and the other way round; one tenancy per home; a tenant in place stays to the end of the month. |
| Recursive subletting | Tenants are tenants of the city, with no right to sublet; only a lease the player signed with the landlord can be offered; a home on offer cannot be rented a second time. |
| Many sublets | At most **two** homes on offer per player (`maxSublets`). Only the F2 has a monthly lease in this release, so the cap is already coded for the homes that will follow. |
| Walking away from arrears (the per-day leases drop the debt at eviction) | Not for the monthly contract. Unpaid rent stays on the contract and is taken as money comes in. After **two unpaid months** the landlord takes the keys back and the debt (always under 180 000 F: two months, plus at most the part of a third that small payments had kept open) stays on the player (`assets.owed`): taken as money comes in, never dropped, and no new monthly lease until it is paid. Handing the keys back or buying the home keeps the debt too. |
| Inflation | Bounded by design: one F2 per player, 90 000 F a week at the very best, 60 000 F on average, against 195 000–343 000 F per hour of play. Money enters only through occupancy that is not guaranteed; 60 000 F a week leaves for every contract. |
| `?debug` and `giveMoney` on the public build | **Not gated**, on purpose: see below. |

## What is not guaranteed without server-held wallets

- The wallet and the contract are in the local save. Anyone who edits the save, or sets the device clock forward while offline, can give themselves
  money; the rules above bound the clock, not the editor.
- Two tabs: the save is written whole, last tab wins (docs/SAVES.md). The stored save therefore never holds the same month twice, but each tab settles in
  its own memory and shows its own message, and what the losing tab did since is lost, as for everything else in the save. Money moved to Teranga Money
  (server-held) from one tab before the other tab overwrites the save is the existing two-tab weakness of the local wallet, not new here.
- A rollback to a client older than 1.0.1 drops the contract (`lease`) and the debt (`owed`): that client sees a per-day F2 lease at 6 000 F a day.
- Real guarantees need the settlement on the server (the month, the key and the wallet in one transaction). The key format is ready for it.

## No player-to-player rentals in this release

Tenants are simulated. Renting to another player needs what the game does not have yet: a server-held wallet for both sides (so rent is never shown as paid
before the server commits it), a contract both clients agree on, rules for a tenant who stops playing, and a shared interior. Money transfers between
players are out of scope for this stage.

## `?debug` on the public build: not gated, the owner decides

`scripts/check-public-smoke.mjs` loads the **public address** with `?debug&touch&heure=10&argent=50000` and drives the game through `window.__dakar`
(position, teleport between districts, the phone). Gating `?debug` to test hosts would break the live smoke test, so nothing was gated. The trade-off:

- Today: anyone can add `?debug` on the public build and call `giveMoney`, or load with `?argent=`.
- Option A: gate everything → the live smoke test must change (a signed test token, or a smoke build).
- Option B (smaller): keep `?debug` and its read-only hooks and teleport on every host, and gate only the money hooks (`giveMoney`, `?argent=`) to test
  hosts. The smoke test passes `argent=50000` but never checks the wallet, so it should keep passing; the list of test hosts (localhost, the previews) is
  the owner's to give. Not done here: it changes what the public build accepts, and the save can be edited anyway.
