# LD2.0-A — Earn & Guidance

The first phase of the Living Dakar 2.0 season, on branch `integration/ld2-a-20261024`.

- It was cut from the unified beta (zayd95/dakar-rek#65, `a1cf012`).
- Draft PR: zayd95/dakar-rek#68.
- It is not on production: `wip/visual-pass` is untouched and nothing was deployed.

**Every result here comes from headless Chromium with a software renderer (SwiftShader), on a 4-core container.** The phone checks run at 390×844, plus 844×390 where it says so, with real touches. None of it is a measurement from a real iPhone. The owner's iPhone review is still due before acceptance.

## The acceptance journey
`scripts/check-ld2a-journey.mjs`: **27/27**.

- **Real taps:** wherever a player taps.
- **Debug hooks only for:** the money the player already had (70 000 F), where to stand, and the passing of played time. They also read the state.

### A — following the leads
1. **Tiak delivery:** paid once; its work card shows first.
2. **One lead offered:** Pape Sarr and a car on credit, without promising the loan. The player chooses « Plus tard ».
3. **The phone's « Mes pistes »:** « Mettre de côté » marks the Pikine agency.
4. **At the counter:** the player opens an account and deposits 25 000 F. The wallet loses 25 000 F, the savings gain 25 000 F, and nothing is created or lost.
5. **The goal « Bana-bana »:** at its real price, 50 000 F.
6. **The conseillère's advice:** it comes from the real state.
   - It says the table is within reach of wallet + savings.
   - It says Pape Sarr wants to know the player first.
7. **From the phone:** 10 000 F withdrawn.
8. **« Ta première affaire »:** leads to the table in the world.
9. **The purchase:** once, −50 000 F.
10. **Running it:** stocked (5 600 F), four customers served, the till paid once. The sheet's sum (recette − marchandise = bénéfice) is the money paid.
11. **The venture's hourly income:** unchanged.
12. **After a reload:** the wallet, the account and its history, the table, the leads and what is owned are as they were.

### B — ignoring every lead
- The street lead is closed with « Plus tard », and every lead in the phone with « Pas maintenant ».
- Another delivery is paid once.
- The same lead is not offered again.
- Nothing is locked behind a lead: the bana-bana stays open to whoever pays.
- After a reload, none of the leads comes back.

## A0 — the playtest of 24 October
Each finding was reproduced before its fix; before/after evidence is in `docs/ld2/proof/`.

### Almadies road obstruction (blocker)
- **What it was:** the last villa wall of the Pikine → Almadies road (`src/road/chunks.ts`).
  - `frame()` took the road's heading from two points either side of a distance along it. Past the road's end both points were the end, so the heading came out as 0.
  - That turned the wall 90° onto the carriageway at the Almadies mouth: 10 m long, 2.35 m high.
  - It had no collider. A car drove through a wall it could see, so collider-based tests never caught it.
- **Fix:** the end keeps its own heading.
- **Road events hardened as well:**
  - They keep off the ways into a district.
  - Every kind leaves more than 3.5 m of carriageway.
  - Their colliders match what is drawn.
- **Check:** `scripts/check-ld2-drive.mjs`, 10/28 on the starting build and 28/28 now.

### Cockpit visibility (blocker)
- **What it was:** the car's own cabin mesh (drawn so people outside see the driver) stood in front of the windscreen.
- **Fix:**
  - The mesh is hidden while the camera is at the wheel.
  - The eye point is the seated body's own (homme, femme, v4).
  - The dash is lowered.
- **Result:** the road is seen from 5 to 10 m, in portrait and landscape.

### Night roads
- **Headlights:** the player's headlights light the road in the road surfaces' own shading. There is no light source and no extra draw call.
- **Lamp pools:** they multiply what is under them, so the markings no longer wash out.
- **Night ground:** a little less blue.

### Hands (`docs/ld2/proof/hands/`)
- **What it was:** the studio bodies have no finger bones, and their mesh hands are spread wide open.
- **Fix:** the `grip` morph is now set by pose: gently curled at rest, closed on the wheel and the handlebars, open in prayer.
- **Not changed:** the wrist's angle comes from the clips.

### « Reconnexion » during play
- **What it was:** in portrait, the HUD hid the online pill except while it read « Reconnexion… ». Every short socket drop therefore showed it over the game: the phone put aside, a district change, a slow handshake.
- **Fix:** reconnecting is quiet. The pill speaks only after 15 s down, and only to a player who was with others.
- **Check:** `scripts/check-presence-quiet.mjs`, 2/4 on the starting build and 4/4 now.

### Overloaded Affaires
- **Main screen:** what the player owns, with its income, the bana-bana table's card, and the next venture they can afford.
- **On demand:** the full ladder and the explanations.

### Phone map dealers (found on the way)
- **What it was:** the dealers' directory names a dealer with its district (`teranga:dealer:pikine`), while its place is `teranga:dealer`.
- **Effect:** a dealer marked from the phone's map was dropped after 5 s.
- **Fix:** it now resolves.

## A1 — « Mes pistes »
- **Code:** rules in `src/economy/pistes.ts` (pure, `tests/pistes.test.ts`); runtime in `src/economy/pistesModule.ts`.
- **Facts the leads read:**
  - work done (Tiak deliveries, VTC rides), cash and savings, cars owned, ventures owned, furniture;
  - the needs, and the district the player is in;
  - activities not practised lately;
  - Pape Sarr's real answer: `dealerOffer` with the player's real trust in him.
- **What a lead never does:**
  - point to a service this build lacks: the bank and the table register themselves;
  - suggest a credit that his rules refuse for a debt or a broken promise;
  - promise a loan.
- **Repeats:** each lead has a key, the facts it depends on. Dismissed or followed, it stays away until those facts change.
- **When a lead is offered in the street:**
  - At most one, after a Tiak delivery or a VTC ride, once its card has gone.
  - Only on foot and outside any activity, never at the wheel.
  - Once per situation, and at most every 8 min of play.
  - A small card with « Y aller » and « Plus tard ». In landscape it is one row: title, « Y aller », ✕.
- **In the phone:** « Mes pistes » lists the open leads, and the home screen shows one row when no other shortcut is there. « Y aller » marks the real place and gives directions to another district.
- **Optional:** nothing is locked behind a lead.

## A2 — Banque Teranga
### The contract (`docs/MONEY.md`)
- **Two local accounts:** `wallet` and `savings`.
- **`move`:** checked completely first, then both sides are applied, or it is refused with the reason.
- **Idempotency:** one ref is applied once.
- **The online account:** named for LD2.0-B; no local operation accepts it.
- **Saves:**
  - The new fields are additive: `bank`, `pistes`, `bana`.
  - A third extras backup (`dakarrek.guest.save.v6.extras.3`) that only LD2.0 clients write brings them back after a rollback to an older client.
  - The older client's wallet is kept, so nothing is counted twice: `scripts/check-ld2a-rollback.mjs` passes 6/6 through the real PR #65 client.

### Where to bank
- **Both agencies (Pikine, Plateau):**
  - Open an account.
  - Deposit or withdraw: 5 000, 10 000, 25 000 or 50 000 F, « Tout », or a typed amount; then a confirmation whose double tap is refused.
  - History.
  - A goal at a venture's real price.
  - The conseillère's advice.
- **The phone « Banque »:** the same operations. An account is opened at a counter only.

### Interest and the conseillère
| Savings from | Interest per player day | Daily cap |
|---|---|---|
| 0 F | +0,5 % | 100 F |
| 25 000 F | +1 % | 250 F |
| 100 000 F | +1 % | 500 F |
| 500 000 F | +1 % | 1 000 F |

- Interest is paid once per player day played: never offline, never for the days away.
- The conseillère gives 1 to 3 lines from the real state: late debts, the goal, a venture within reach of wallet + savings, cars, Pape Sarr's answer, the next savings level.

## A3 — the bana-bana table
1. **Discover it:** a table « à céder » on the Maïga du marché's lot in Pikine, off the carriageway, with its seller.
2. **Buy it:** the same venture purchase, so there is one accounting system.
3. **See it:** the goods on the cloth, the player's own board, and Mor the cousin.
4. **Run it:** « Tenir la table » — restock at cost, then serve the customers with one tap each.
   - The till is paid once, at « Fermer » or when walking away.
   - The sheet shows recette − marchandise vendue = bénéfice.
   - Customers build up with played time only: 4 at the start, then 1 per in-game hour, up to 12.
5. **Income:** a full table makes about 1 600 F of profit, about one Tiak delivery. The venture's 400 F per hour is unchanged.
6. **The phone's Affaires:** the table's card (stock, customers, the last session, today and in total) and « Y aller ».
7. **The neighbour:** Modou says one line about it, once.

## The owner's second playtest (25 Oct, on the iPhone preview)
### Standing arms (`docs/ld2/proof/arms/`)
- **What it was:** the Idle clip holds the elbow nearly straight (2.9°), with the hand behind the hip; a Meshy mesh pinches at that elbow. Running looked right because the gait bends the arms.
- **Fix:** standing, the studio bodies' elbow bends 16° and the upper arm comes 4° forward, on top of the clip (`src/actors/humanoid.ts` `relaxArms`, `BODY_FIT.idleArms`).
  - It never adds up from frame to frame: three's mixer leaves a bone alone when the clip's value does not change.
  - It is eased out as the gait's arms take over.
- **Unchanged:** walking, running, sitting, the wheel and the v4 bodies.
- **Check:** `scripts/check-standing-arms.mjs`, 10/10 (the build before fails all 6 standing checks).

### The interior at the wheel (`docs/ld2/proof/interior/`)
- **What was added:**
  - a sculpted dashboard: a padded top with a rolled lip, the cluster's hood, vents, a glovebox seam;
  - a centre console: gear lever and gaiter, handbrake, cup holders, armrest;
  - sport seats: city charcoal fabric with ribbed grey inserts, premium black leather with tan inserts and stitching;
  - a wheel with spokes and an airbag pad;
  - door cards with an armrest and a pull.
- **The pale band under the windscreen** in the owner's screenshot was a slit through to the ground. It is closed by a scuttle under the bonnet, and a second slit is closed by the floor.
- **Budget:** the same 3 draw calls; 3 304 / 3 328 triangles (it was 1 122).

### The Ngor fishing port
It becomes « la traversée » in the next milestones (`docs/ROADMAP_NEXT.md` §6). Nothing in the world changes yet.

## Checks run on the integrated build
| Check | Result |
|---|---|
| `tsc --noEmit` | clean |
| Unit suite | 185 files, 2 222 passed, 2 skipped |
| Acceptance journey (A and B) | 27/27 |
| Driving (Almadies, cockpit, night) | 28/28 |
| Bank | 23/23 |
| Bana-bana | 31/31 |
| Affaires | 23/23 |
| Mes pistes | 15/15 |
| Reconnexion pill | 4/4 |
| Rollback through the PR #65 client | 6/6 |
| Production client's saves (`check-save-compat`) | 25/25 |
| PR #64 client rollback (`check-save-rollback-beta`) | 8/8 |

The wider regression run (phone, UI consistency, VTC, journeys, city) and the performance comparison are recorded in `docs/ld2/REGRESSION.md`.

## Limits (honest)
- **Not a phone:** no real-device frame rate is claimed.
- **The barrier:** it is the only thing the audit found standing across a carriageway on the ways into the Almadies. That it is exactly what the owner met is inferred, not proven.
- **Wrists:** the angle is unchanged (the clips').
- **Night look:** to be judged by eye.
  - A Pikine dirt road under the headlights reads quite bright; the strength is one constant.
  - Lamp pools look less orange.
- **Banking:** the account is opened at a counter only; the phone shows the way there.
- **The bana-bana table:**
  - It is local to each device: in multiplayer, each player sees their own table.
  - Modou's line is heard only by a player who walks up to him.

## Next: LD2.0-B (not started)
Messages, real transfers between players on the server's authoritative ledger, home invitations and meetups, on the contract in `docs/MONEY.md`.

Also in the next milestones, from the owner's review of the preview (25 Oct): the Ngor fishing port becomes a crossing to the island
(« la traversée »), carrying paying customers by pirogue or chaloupe; see `docs/ROADMAP_NEXT.md` §6. The owner sets its order against LD2.0-B.
