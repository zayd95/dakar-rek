# Money accounts (LD2.0 contract)

Game money only: fictional francs, no real payment, no cash-out. Code: `src/economy/money.ts`; tests: `tests/money.test.ts`.

## The accounts

| Account | Where it lives | Who may change it | History |
|---|---|---|---|
| `wallet` (Portefeuille) | `SaveData.wallet`, this device | the game, through `GameState.addMoney` (pay, prices, fares, income) and `move` | `SaveData.ledger` (last 100) |
| `savings` (Épargne Teranga) | `SaveData.bank.savings`, this device | only `move` (wallet ↔ savings) and `postSavings` (the bank's interest) | `SaveData.bank.tx` (last 200) |
| `online` (LD2.0-B) | the server (Cloudflare Worker, Durable Object) | only the server | the server's transfer ledger |

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

## What LD2.0-B adds (not built yet)
- The `online` account is server-authoritative. The client never sets its balance; it shows what the server says.
- Moving money between the local wallet and `online` is a `move` whose remote side is confirmed by the server.
  - The local side is written as pending, with the server operation id as its `ref`.
  - It is applied once the server acknowledges. It is refunded if the server refuses or the operation expires, and never both, thanks to the ref.
- A transfer between two players happens on the server only: one atomic, idempotent operation that debits A's `online` account and credits B's.
  - Chat text never triggers it; only the « Envoyer de l'argent » confirmation does.
  - Both clients then read their balance and history from the server.
- Saves made before B keep their wallet and savings. Nothing moves to `online` unless the player chooses to, so no saved wealth is replaced silently.
- Offline solo play keeps working: `wallet` and `savings` never need the server.
