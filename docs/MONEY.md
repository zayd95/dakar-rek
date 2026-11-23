# Money accounts (LD2.0 contract)

Game money only: fictional francs, no real payment, no cash-out. Code: `src/economy/money.ts`; tests: `tests/money.test.ts`.

## The accounts

| Account | Where it lives | Who may change it | History |
|---|---|---|---|
| `wallet` (Portefeuille) | `SaveData.wallet`, this device | the game, through `GameState.addMoney` (pay, prices, fares, income) and `move` | `SaveData.ledger` (last 100) |
| `savings` (Épargne Teranga) | `SaveData.bank.savings`, this device | only `move` (wallet ↔ savings) and `postSavings` (the bank's interest) | `SaveData.bank.tx` (last 200) |
| `online` (Teranga Money, LD2.0-B) | the server (`server/social.ts`, the `ledger` object) | only the server | the server's ledger (`online.history()`) |

Rules every operation keeps:
- Whole francs, never below 0, never above `MONEY_MAX` (2^53 − 1).
- All or nothing: `move` checks everything first, then applies both sides. It refuses with a reason (`insufficient`, `amount`, `same`, `duplicate`, `overflow`, `unsupported`) and changes nothing.
- One `ref` (an idempotency key, at most 64 characters) is applied once. The last 200 refs are kept in `SaveData.bank.refs`. A UI creates the ref when it shows the confirmation, so a double tap is refused.
- `wallet + savings` is the cash the player owns on the device. A deposit or withdrawal never changes it.

## The save
- `bank` is an additive field of the v6 save (no version change). A save without it has an empty account.
- An older v6 client rebuilds the save from the fields it knows, so it drops `bank` at its next save. This client writes a third backup, `dakarrek.guest.save.v6.extras.3`. It holds the older backups' fields plus `bank`. The beta client (PR #65) never writes that key.
- On load, a missing `bank` is taken back from that backup, for the same guest only. Savings dropped by a rollback come back exactly as the last LD2.0 save left them.
- Nothing is counted twice: the older client never saw the savings, and its wallet is kept as it is.

## Banque Teranga v1 (built on this contract)
Rules: `src/economy/bank.ts` (pure, `tests/bank.test.ts`). Counter: `src/economy/bankModule.ts`. Phone: `src/ui/phone/apps/bank.ts`. Numbers: `ECONOMY.bank` in `src/economy/config.ts`. Browser check: `scripts/check-bank.mjs`.
- The account is opened at an agency counter, Pikine or Plateau, for free (`BankState.opened`). Until then the phone's « Banque » shows the way there.
- Deposits and withdrawals are `move`s.
  - Quick amounts (5 000, 10 000, 25 000, 50 000 F), « Tout », or a typed amount.
  - The confirmation makes its ref when it is shown, so a double tap or a replay is refused.
  - A tap whose finger went down within 320 ms of a new sheet or screen is dropped (`src/ui/tapGuard.ts`).
  - Both histories say where the operation was made: « agence de Pikine », « agence du Plateau », « téléphone ».
- Interest is paid once per player day (`SaveData.play.day`, `interestDay`), on the savings carried into that day.
  - Never offline, never for the days away, never on the day the account was opened.
  - The rate and cap come from the level the balance reaches: +0,5 % (100 F max), then from 25 000 F +1 % (250 F max), from 100 000 F 500 F max, from 500 000 F 1 000 F max.
  - Each level above the first is celebrated once (`milestones`).
- The goal is a venture at the price the next unit costs (`ECONOMY.business` through `nextPrice`: Bana-bana, Kiosque, Boutique), or a free amount.
- The conseillère's advice (`bankAdvice`) gives 1–3 lines from the real state only: wallet, savings, goal, ventures and their next prices, debts and where they stand, cars owned, and Pape Sarr's answer.
  - Pape Sarr's answer is `dealerOffer` with the player's real trust in him.
  - He « étudiera ta demande » only when his rules would not refuse. When they would, the advice says what is missing (his trust, the late debt) or says nothing.
  - A venture is called « à ta portée » only when wallet + savings cover its price.

## Teranga Money (LD2.0-B, built)
The design is in `docs/ld2/LD2_B_CONTRACT.md`. The code:
- the ledger: `server/social.ts`, with its rules in `src/online/ledgerRules.ts`;
- the device's side: `src/economy/money.ts` (`reserveOnline`, `settleOnline`, `quotePay`) and `SaveData.online`;
- the client: `src/online/client.ts`.

**The account:**
- **Server-held:** the device never sets its balance. It shows the server's balance, with when it was given (« il y a 3 min · hors ligne »).
- **One ledger object:** each operation is one transaction, applied whole or not at all, and idempotent by its id (the id made when the confirmation showed).
- **The operations:**
  - `fund` (« Recharger »): wallet → Teranga Money.
  - `cashout` (« Retirer »): Teranga Money → wallet.
  - `pay`: one player's Teranga Money → another's, with a top-up from the sender's wallet in the same operation when the balance is short.
- **A money request** is paid at most once, by the payment that names it.
- **Limits (`ECONOMY.online`):** 250 000 F per operation; per server day, 500 000 F topped up, 500 000 F sent and 1 000 000 F received; 5 000 000 F balance.

**The device's side:**
1. Before a top-up leaves, the wallet is debited (« Teranga Money · recharge ») and the operation written as pending in `SaveData.online`.
2. The save is written synchronously; nothing is sent if it fails.
3. Then:
   - The server says yes: the pending entry closes.
   - It says no: the wallet is refunded once (« recharge annulée »).
   - No answer: the same id is sent again at the next connection, so the server applies it or returns its first answer.
- A withdrawal credits the wallet once, by its id, when the server has debited.
- `online` is in the fourth extras backup (`dakarrek.guest.save.v6.extras.4`), so a rollback to the LD2.0-A client never loses a pending top-up.

**What it cannot guarantee:** money a device brings in comes from that device's own wallet. The whole single-player economy lives on the device, so a modified device could bring money it never earned. The daily limits bound that.

**Unchanged:**
- Saves made before B keep their wallet and savings. Nothing moves to Teranga Money unless the player chooses to.
- Offline solo play never needs the server.
- Chat text never moves money.
