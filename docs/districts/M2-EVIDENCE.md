# M2 · Plateau / Médina « Ma première affaire »: Gate A evidence (engineering)

- **Gate A** is engineering complete, evidenced here.
- **Gate B** is the owner's own iPhone playtest. It has **not happened**, and nothing here claims it.

- **Branch:** `feature/ld-m2-plateau-20261026`. It is stacked on M1 (`feature/ld-m1-mermoz-20261025` @ `7dc9deb`), in draft PR zayd95/dakar-rek#70.
- **Evidence run on:** `f4c5026` (golden path run 6 and the tests). The performance views ran on `1fab1bb`–`f4c5026`.

The design is in [`M2-PLATEAU-MEDINA.md`](M2-PLATEAU-MEDINA.md). The commerce contract with Living Dakar 2.0 is [`CONTRACT.md`](CONTRACT.md) v5, rows 9–12, agreed by LD2.0.

## What is implemented

1. **Two places in the Plateau hub, each with a loading bay at the kerb:**
   - Diallo & Frères, a Médina wholesaler;
   - the Comptoir Sall, a Plateau trading house behind an arcade.
2. **Two traders:** Oumar Diallo and Awa Sall, with lines, the shared NPC memory (`recordVisit`, `Relations`) and recognition on a later day.
3. **A trade made with the player's own money** (`src/districts/tradeRules.ts`, pure):
   - **Goods:** three, at fixed prices (tea, rice, mangoes). Mangoes spoil after 2 days.
   - **The purchase:** one debit, then the lot is numbered.
   - **Three ways to carry it:**
     - on the head, free;
     - in the player's own vehicle, loaded in the bay;
     - with the porters' pousse-pousse, which walks the kerb to the Comptoir for 1 500 F.
   - **The sale:** one credit, then a card showing revenue − purchase − transport = profit.
4. **Limits:**
   - one lot at a time;
   - Diallo sells 2 lots a day;
   - the Comptoir buys a bounded amount each day;
   - cancel refunds fully before the lot leaves, and Diallo buys it back at 70 % after;
   - after 3 trades, Diallo gives better terms on rice.
5. **No new wallet, stock or save field:**
   - money moves only through `GameState.addMoney`, wallet only, with the lot's number in every ledger line;
   - the goods are counted in `inventory`, and the lot's facts are numbers in `counters` (`pl_*`).
6. **The Médina quarter:**
   - lower and older buildings;
   - tin awnings, goods at the shopfronts and painted shop boards;
   - wax-print shade cloths over the two market streets;
   - vendors and a merchants' loading area.
   - Roads, pavements, crossings and the mosque's block are untouched (`tests/medina.test.ts`).

**What is missing, or not proven here**
- No iPhone has run M2 (Gate B).
- Prices are fixed by design, with no market. The trade adds nothing to « Mes pistes » or Affaires yet (CONTRACT.md row 12).
- The head load has no arm pose: the cartons sit on the head.
- A motorbike carries 1 unit, but no check has driven one through the bays.

## The recorded golden path

`scripts/check-trade-journey.mjs` plays the whole path with real touch, in one uninterrupted session:
- 390 × 844 portrait, touch, SwiftShader, with a video recorded;
- Chrome's own touch events through CDP: the joystick, the action button and the sheet rows;
- no synthetic clicks.

The debug shortcuts are labelled in the script:
- the starting money and hour;
- putting the player on a Plateau pavement;
- giving the player a Teranga, bought at its Pikine dealer with the wallet put back as it was;
- the next city day.

**Run 6** on `f4c5026`: **33 / 33 checks passed**, no page errors, one session of 21 min 31 s (the video). The log is [`proof/m2/golden-path-run6.log`](proof/m2/golden-path-run6.log), with a contact sheet in [`proof/m2/golden-path-run6.jpg`](proof/m2/golden-path-run6.jpg).

1. **On foot, with tea:**
   - The player walks up the Médina street to Diallo & Frères and talks to Oumar (first meeting).
   - The catalogue shows the three goods with prices and the cash on hand. The quantities show each total and the possible margin.
   - Buying 3 cartons is one debit of 9 000 F and one ledger line naming lot 1. The cartons go into the inventory.
   - The load sheet:
     - on the head: free;
     - the vehicle: refused, with « Gare ton véhicule »;
     - the pousse-pousse: 1 500 F;
     - « Annuler »: full refund.
   - The cartons go on the head.
2. **Halfway, a save and a reload:** the lot is still on the head (lot 1, 3 cartons, stage carried), and the wallet is unchanged.
3. **At the Comptoir Sall, under the arcade:** Awa offers 11 100 F.
   - The sale is one credit and one ledger line. The lot and the goods are gone.
   - The card reads « Lot 1 · +2 100 F de bénéfice »: Vente +11 100 F, Achat −9 000 F, Bénéfice +2 100 F.
   - Wallet, ledger and saved total all say +2 100 F.
   - Talking to Awa again pays nothing, and a reload pays nothing.
4. **A later city day, by car:**
   - The player drives through the Plateau streets to Diallo's bay and parks in it.
   - Diallo recognises them once: « Ah, te revoilà ! Alors, le Comptoir Sall t'a bien payé ? »
   - Two sacks of rice cost 18 000 F. Rice is too heavy for the head; the car in the bay takes 4.
   - The rice is loaded, driven to the Comptoir's bay and sold for +20 400 F once. The card shows +2 400 F.
5. **The porters:**
   - Four crates of mangoes (10 000 F) plus the pousse-pousse (1 500 F) make two ledger lines. Diallo has now served the day's two lots.
   - The porter and his cart walk the kerb toward the Comptoir.
   - Arriving ahead of him, the player is told by Awa that the pousse-pousse has not arrived; nothing is sold or paid.
   - Once he arrives, the sale pays +13 600 F. The card counts the transport: Transport −1 500 F, Bénéfice +2 100 F.
6. **Every lot reconciles:** the trade's ledger lines sum to the saved total profit.
7. **No page errors.**

The earlier runs (1 to 5) found and fixed:
- a sale card whose « Vente » row showed the amount twice;
- the card's result row, out of sight on a phone held upright, so the title now says it;
- the check's own walking and boarding round a parked car;
- the dealer's hub for the car set-up.

## Tests

- `tests/trade.test.ts` (12) covers the rules:
  - the golden path and ledger reconciliation;
  - no double payment on a retry, a double tap or a reload;
  - no purchase without the money; one lot at a time; quantity bounds;
  - stock surviving a reload;
  - cancel and buy-back; transport limits; spoilage; the daily demand; trust;
  - Diallo's 2 lots a day surviving a reload;
  - a sale clamped at the wallet ceiling still reconciling.
- `tests/medina.test.ts` (4) covers the quarter:
  - it is low;
  - its market streets keep their roads and pavements;
  - the loading area is kept clear, and nothing of it is on the mosque's block or frontage;
  - no parked car stands in any of the three bays, at every quality.
- The full suite: **182 files, 2222 passed, 2 skipped** on `f4c5026` plus `tests/medina.test.ts`'s fourth test. `tsc` is clean.

## Save, payment and memory

- **Save:**
  - The lot's facts are numbers in the existing `counters` (`pl_*`), and the goods are in `inventory` (`pl_the`, `pl_riz`, `pl_mangue`).
  - There is no schema change and no migration. The keys are listed in `M2-PLATEAU-MEDINA.md` § Save.
  - A reload with a lot in hand keeps it at its stage. A reload after a sale brings nothing back.
- **Payment:**
  - Every amount goes through `GameState.addMoney`, wallet only, and every ledger label carries « lot N ».
  - The wallet is checked before every debit. Cost, fee and revenue are what `addMoney` actually applied (it clamps), so the profit equals the sum of the lot's ledger lines.
- **Memory:**
  - Diallo: the first meeting is `pl_diallo_met`; recognition happens once per city day after a trade (`pl_diallo_seen_day`); trust after 3 trades is `pl_diallo_trust`.
  - Both traders go through the shared `recordVisit` and `Relations`, used as-is.

## Performance against the baseline

The baseline is the repo's own draw-call budget (`scripts/check-perf-evening.mjs`): **180 / 300 / 420 calls** on low / medium / high.

**Method:**
- `scripts/m2-views.mjs` puts fixed cameras on the same Plateau places.
- It runs on the M1 head (`7dc9deb`, before M2) and on this branch, the Médina and the trade (`1fab1bb` to `f4c5026`; the commits between change only the sale card's text and the check script, neither in these views).
- Both run at 390 × 844 in SwiftShader.
- Draw calls and triangles transfer to a phone. Frame times do not, and no iPhone was measured.

**Low quality**

| View | Draw calls before → after | Triangles before → after | Frame median ms before → after (SwiftShader, not a phone) |
|---|---|---|---|
| medina-street-walk | 62 → 65 | 60,280 → 67,486 | 100 → 116.6 |
| medina-z60-walk | 108 → 102 | 88,744 → 89,274 | 150 → 150 |
| medina-high | 67 → 71 | 67,546 → 74,554 | 149.9 → 150 |
| diallo-forecourt | 58 → 82 | 57,810 → 82,800 | 133.2 → 133.4 |
| comptoir-arcade | 43 → 51 | 55,916 → 66,152 | 133.3 → 133.3 |
| mosque-street | 73 → 76 | 72,260 → 79,872 | 133.3 → 150 |
| plateau-office-street | 60 → 69 | 74,104 → 86,988 | 100 → 116.7 |

**Medium quality**

| View | Draw calls before → after | Triangles before → after | Frame median ms before → after (SwiftShader, not a phone) |
|---|---|---|---|
| medina-street-walk | 64 → 69 | 75,912 → 82,448 | 216.6 → 233.3 |
| medina-z60-walk | 106 → 110 | 109,472 → 114,276 | 266.7 → 250 |
| medina-high | 76 → 80 | 94,350 → 99,028 | 300 → 316.6 |
| diallo-forecourt | 58 → 82 | 73,750 → 96,076 | 249.9 → 283.3 |
| comptoir-arcade | 45 → 51 | 74,206 → 81,118 | 233.4 → 283.3 |
| mosque-street | 77 → 92 | 96,862 → 107,812 | 266.7 → 316.8 |
| plateau-office-street | 66 → 72 | 106,112 → 111,962 | 250 → 250 |

**Reading:**
- Every view stays far inside the budget. The heaviest is 110 calls, on the market street at z = 60 at medium quality, against 300.
- The biggest rise is at Diallo's forecourt: +24 calls (58 → 82) and +25 % triangles.
  - That view now has the depot, its goods, its sign, Oumar Diallo, two porters and the shop boards, where before it had a plain block.
  - The calls have not been broken down per object.
- The market streets themselves cost 3 to 5 calls.
  - The cloths are in the shared batches.
  - Each painted shop board is its own call; the Médina has 10 at most.
- **The mosque view (+15 at medium) is not like for like:** a passing bus fills the "after" frame. The Médina adds nothing on the mosque's block (`tests/medina.test.ts`).
- The frame times (SwiftShader, CPU) move by about one frame step either way. They are not a phone's.

Before / after images at medium quality: [`proof/m2/before-after-medina-medium.jpg`](proof/m2/before-after-medina-medium.jpg). The numbers are in `proof/m2/perf-*.json`.

## Known issues (with how to reproduce them)

1. **The head load has no arm pose:** the cartons sit on the head. *Repro:* buy tea, choose « Porter sur la tête ».
2. **Seen from directly under them, the shade cloths are dark bands:** their undersides are in shade. *Repro:* stand in the street at x = −60, z 10–110, and look up.
3. **Motorbikes are not covered:** a Jakarta in a bay carries 1 unit, but no check has driven one through.
4. **The porter's speed is fixed:** he walks at 1.15 m/s and does not stop for traffic; he keeps to the kerb strip. *Repro:* the pousse-pousse option, then watch the street at x = −60.
5. **The city day can roll over during a long session.** The daily limits (Diallo's lots, the Comptoir's demand) follow the city day, as everywhere else in the game.

## The iPhone preview

- **Source:** the project's own Cloudflare Workers Builds, from the push of this branch. This session changed no configuration.
- **What the bot reports:** a successful preview build and deployment of `0ebe96b`, at `https://feature-ld-m2-plateau-20261026-dakar-rek.habibjallow95.workers.dev`. It is a branch alias, so it follows the newest push.
- **Unverified here:** this sandbox cannot reach `*.workers.dev`, so the link has not been opened from this session.
- **Checking the build:** the build id shown in the game (Réglages) must start with the PR's head SHA.
