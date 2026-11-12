# LD2.0-B « Belong Online »: the shared contract

**Scope:** simple Messages, real money transfers between players, home invitations and meetups.
- **Built on:** LD2.0-A (`integration/ld2-a-20261024`, `b16f8d5`).
- **Branch:** `integration/ld2-b-20261025`.
- **Shared code:**
  - the wire: `src/online/protocol.ts`;
  - what the UI and world code may use: `src/online/api.ts`.
- **Ownership:** each lane owns its files (below). A change to a shared file goes through the integration owner.

## Acceptance (from the brief)
Two players must successfully:
1. connect and exchange private messages;
2. request and transfer 5 000 F exactly once;
3. reconnect with correct balances and transaction history;
4. send and accept a home invitation;
5. enter the host's residence together;
6. create and attend a scheduled meetup.

No fake local transfers or confirmation-only demonstrations. Offline solo play keeps working.

It is checked by `scripts/check-ld2b-journey.mjs`:
- two Chromium clients (one phone-sized);
- the real local Workers runtime (`wrangler dev --local`);
- real taps.

## Identity: the minimum account
- **The credential:** the device key that presence already uses (`dakarrek.chat.key`, 32 hex, `src/multiplayer/client.ts`).
- **The public id:** the tag the server derives from that key (`publicTag`, SHA-256, 16 hex). Every peer already shows it.
- **One player, one address:** a player's account address and their presence tag are the same. A peer met in the street can therefore be messaged.
- **The friend code:** the tag in four groups, `7F3A-91C2-0B4E-55D1`. « Ajouter par code » reaches a player in another district.
- **An account exists once its client has connected to `/api/me` once.** A player who never did is shown as « pas encore sur Messages » and cannot be paid or invited.
- **The key moves with the save** (`src/core/saveTransfer.ts`: an additive field of the transfer code). A player who changes phone keeps their Teranga Money.
  - The UI says that the code is then also the key to the online account, and must not be shared.

## Server
**The Worker** (`server/worker.ts`): a new route, `GET /api/me?key=…&name=…&look=…&app=…`.
- It is a WebSocket, with the same Origin check as `/api/presence`.
- Without a valid key it answers 400.
- It hands the socket to the player's account.

**One new Durable Object class, `Social`** (`server/social.ts`), on one binding, `SOCIAL`.
- **Why one class:** each Workers Builds preview gets a namespace per binding, and the account's namespace limit is the likely cause of the failing previews (`docs/ld2/REGRESSION.md`).
- It has two roles, chosen by the object's name:
  - `acct:<tag>`: a player's account.
  - `ledger`: the single money ledger. One object, so every transfer is a single transaction.
- **Migration:** a new tag `v2-social` with `new_sqlite_classes: ["Social"]`, and the `SOCIAL` binding in `previews` too.
- **Production:** nothing is deployed by this phase.

### The account (`acct:<tag>`)
It is the client's session hub: one or more sockets per player (WebSocket hibernation, as `CityRoom`).

**It stores (SQLite):**
- the profile (name, look, app; refreshed at each connection);
- conversations: items by `(with, id)`, with the newest 500 kept per conversation;
- unread counts;
- the block list;
- the reports made;
- the home snapshot of the open invitations;
- `where` (presence hub and room).

**Delivery from A to B:**
1. A's account stores the item.
2. It forwards the item to B's account (Durable Object RPC).
3. B's account stores it and pushes it to B's sockets.
- Every item is idempotent by `id` on both sides.
- A forward that fails is kept in an outbox and retried by an alarm.
- **Authority over stateful items:**
  - requests: the ledger;
  - invitations: the host's account;
  - meetings: the proposer's account.
- A state change goes to the authority first. The authority then pushes the new state to both accounts (an `item` with the same id).

**Blocking is enforced by the account that blocks.**
- Text and locations from a blocked player are accepted but not delivered; the sender is not told.
- Money, requests, invitations and meetings to someone who blocked you are refused, with reason `unavailable`.
- Blocking revokes the invitations between the two players and cancels their meetings.
- The client's existing local block list (`dakarrek.chat.v1`) is sent to the account at the first connection, so a block made before B still holds.

**Rates and sizes:**
- frames up to `ONLINE_MAX_FRAME`;
- 20 messages a second, with the room's rule: more closes the socket;
- text: the chat rules (`src/multiplayer/chatRules.ts`: cleaned, 500 characters, a 10-per-window rate);
- snapshot: at most 12 000 characters.

### The ledger (`ledger`): Teranga Money
- **The account:** Teranga Money is the player's server-held account. Senegal's mobile money is the model: cash in the wallet, money on the phone.
  - The device never sets its balance; it shows what the server says.
  - Names in the UI: « Teranga Money », beside « Portefeuille » and « Épargne Teranga ».
- **Tables:**
  - `accounts(tag, balance, day, funded, sent, received)`;
  - `ops(id PRIMARY KEY, kind, a, b, amount, fund, req, note, at)`;
  - `asks(id PRIMARY KEY, payee, payer, amount, note, state, paidBy, at)`.
- **Atomic:** each operation is one `transactionSync`.
  - Inside it: check the id has not been seen, the limits, the balance and the request; then debit, credit and insert.
  - It is applied whole or not at all.
- **Idempotent:** an id already in `ops` returns the stored result (`duplicate: true`).
  - A refusal is not stored. The device never resends a refused id.
- **Kinds of operation:**
  - `fund`: wallet → Teranga Money.
  - `cashout`: Teranga Money → wallet.
  - `pay`: A → B, optionally with a top-up from A's wallet (`fund`) and a request (`req`).
  - A request is paid at most once: its state goes `open → paid` in the transaction of the payment that names it, with the right payer, payee and amount.
- **Limits (`ECONOMY.online`, sent in `welcome`):**

  | Limit | Value |
  |---|---|
  | One operation | 250 000 F |
  | Top-ups per server day | 500 000 F |
  | Sent per server day | 500 000 F |
  | Received per server day | 1 000 000 F |
  | Balance | 5 000 000 F |
- **What the server can guarantee, and what it cannot:**
  - Inside Teranga Money it guarantees conservation, exactly-once, and that nobody spends another's balance.
  - Money that comes in from a device (`fund`) is that device's own game money. The whole single-player economy lives on the device, so a modified device could bring in money it never earned.
  - The daily limits bound that. This is written in the report as a limit, not hidden.

### Presence: being in someone's home (the `CityRoom` change)
- **A new presence space:** `home:<tag>` (`src/multiplayer/protocol.ts` `parseMove`). A client inside a home uses it in place of the old `home`.
  - Older clients keep sending `home`. Nothing changes for them; nobody sees them there.
- **Who may be in that space:**
  - the player whose tag it is;
  - a guest whose account the host's account confirms. `CityRoom` calls `SOCIAL acct:<host>.mayVisit(<guest>)` and keeps the answer 30 s.
  - Any other move in that space is refused (the move only; the socket stays).
- **Relay:** a peer in `home:<tag>` is sent only to sessions in the same space. A home's positions do not go to the whole room.
- **Rooms:** the two players must be in the same room to see each other.
  - When a meeting or a visit is accepted, `find` gives the other's district and room.
  - The visiting player's client joins that room (`PresenceClient.join(hub, room)`, as the « lien pour un ami » does).

## The device's side of money (`src/economy/money.ts`, `SaveData.online`)
- **A new additive field of the v6 save, `online`:** the device's operations that the server has not answered yet, the refs already applied, the last balance and when it was known, and the tag.
  - It also goes in the third extras backup (`EXTRA_FIELDS_V3`), so a rollback keeps a reserved top-up.
- **Before a `fund` or a `pay` with a top-up is sent:**
  1. The wallet is debited (`GameState.addMoney`, label « Teranga Money · recharge »).
  2. A pending entry with the op id is written.
  3. The save is written synchronously.
  4. Only then is it sent.
  - If the save cannot be written, nothing is sent and nothing is debited.
- **Server says yes:** the pending entry is closed and its id joins the refs.
- **Server says no:** the wallet is refunded once (by ref).
- **No answer (closed socket, app closed):** at the next connection the same id is sent again. The server either applies it or returns the first result, so the device never has to guess.
  - « Annuler » on a pending operation is not offered in v1. It is written in the limits.
- **A `cashout`:**
  - the server debits first;
  - on `ok`, the wallet is credited once, by ref (a duplicate answer never credits twice);
  - the save is written at once.
- **Offline:** the wallet and savings never need the server. Teranga Money shows its last known balance and when, and its operations are greyed out with the reason.

## The UI (`src/online/api.ts`)
- **Messages is a phone app:** `registry.ts` `messages` becomes a screen, not the old chat panel's private tab.
  - The floating « Chat » panel keeps the proximity talk (bubbles).
  - Its « Messages privés » tab opens the Messages app.
- **The list:** contacts with name and avatar, last message, unread count, « Nouveau message ».
  - « Nouveau message » offers the players nearby (presence), recent conversations, and « Ajouter par code ».
- **A conversation:**
  - bubbles left and right, timestamps, natural scroll;
  - a field and « Envoyer »;
  - one « + » menu with exactly: Envoyer de l'argent · Demander de l'argent · Inviter chez moi · Proposer un rendez-vous · Partager ma position.
  - There is no camera, no attachment and no gallery.
- **States always said in words:**
  - online, reconnecting, offline;
  - a message sending, failed (« Réessayer »);
  - the other player online, last seen, or not yet on Messages.
- **Money cards:**
  - sent and received;
  - a request with « Payer » / « Refuser » (its payee: « Annuler »), then its outcome.
  - Each money sheet shows how it will be paid (`payQuote`: from Teranga Money, from the wallet) and the limits, before the one confirmation.
  - The confirmation makes the op id when it is shown, and the tap guard (`src/ui/tapGuard.ts`) applies.
- **Invitation and meeting cards:** with their state, and « Y aller » once accepted (`onlineHooks.goTo*`).
- **Privacy:**
  - block, report and forget, from the conversation's header;
  - one line under the list: the conversations are kept on the game's server to follow the player from one device to another, and no message can pay anything.
- **« Argent »:** shows Teranga Money beside the wallet and the savings: the balance and when it was known, « Recharger », « Retirer », the history, today's limits.

## The world (`onlineHooks`, lane H)
**Inviting:** the host's home (`assets.home`: the room at the family's, an apartment, a house, a villa) and a snapshot of it.
- The snapshot holds the catalogue id, the street door, the upgrades and the furniture with its placement.
- The host's client refreshes it (`home`) when furniture moves while invitations are open.

**Visiting:**
1. An accepted invitation's « Y aller » guides the guest to the host's street door, the same interactable in every client's world.
2. The guest's client joins the host's room.
3. At the door, the guest sees « Entrer chez <nom> (invité) ».
4. Going in asks `visit`. The guest's client then draws the host's home from the snapshot, at the same off-grid origin as the host's client, so positions agree.
5. Its presence space is `home:<host>`.

The guest's side is read-only:
- no « Aménager », no buying, selling or moving, no « Dormir ici » on the host's bed;
- seats, the TV and the radio only with `perms.use`.

A revocation or a block takes the guest out to the street with one sentence. Leaving puts the guest's own homes back exactly as they were.

**Meetings:**
- **The places:** existing destinations (the Corniche pitch, the arena, a gargote or restaurant, La Vague…), and « Chez moi » (when accepted, it also opens a visit).
- **The time:** « Maintenant » or a city time (the shared clock `src/core/clock.ts`; 1 city hour = 1 real minute), sent as server ms.
- **The window:** from 10 city minutes before to 1 city hour after.
- **Being there:** being within the place's radius in that window sends `here` once. When both are there, the meeting becomes `met`, with one card and a small social lift (the needs' social, at most once a city day).
- **Past the window:** without both, it becomes `missed`.

## Lanes (at most three, plus integration and QA)

| Lane | Owns | Builds against |
|---|---|---|
| **S, server and account client** | `server/worker.ts`, `server/social.ts`, `wrangler.jsonc`, `src/online/protocol.ts` (validators), `src/online/client.ts`, `src/online/ledgerRules.ts`, `src/online/accountRules.ts`, `src/economy/money.ts` (online side), `src/core/save.ts` + `types.ts` (the `online` field), `src/core/saveTransfer.ts` (the key), `src/multiplayer/protocol.ts` (`home:<tag>`), `ECONOMY.online` | the real runtime: `wrangler dev` |
| **M, Messages app** | `src/ui/phone/apps/messages.ts` + css, `src/ui/phone/registry.ts` (Messages screen), `src/online/fake.ts`, `src/ui/phone/apps/money.ts` (Teranga Money), `src/multiplayer/chat.ts` (the DM tab hands over) | `src/online/fake.ts` until S lands |
| **H, visits and meetups** | `src/online/visit.ts`, `src/online/meetups.ts`, `src/economy/estate.ts` (drawing a visited home), `src/multiplayer/avatars.ts` (peers in `home:<tag>`) | `src/online/fake.ts` (M's) or a small one of its own |
| **Integration and QA (owner)** | `main.ts` wiring, `scripts/check-ld2b-journey.mjs`, the report | everything |

**Each lane:**
- adds unit tests (vitest, node: pure rules) and a browser or raw-socket check of its own;
- keeps `tsc` clean;
- commits on its own branch;
- never edits another lane's files. It writes what it needs from them in its report.

## Quality gates
- TypeScript (game and server).
- vitest: ledger and account rules, protocol validators, the save field and the rollback.
- Raw-socket checks on `wrangler dev`:
  - the same `pay` sent twice, and sent at once from two sockets of the same account: one debit, one credit;
  - a reconnect in the middle of an operation;
  - limits;
  - blocked;
  - a request paid twice;
  - a home space without an invitation.
- The two-player browser journey (the acceptance above), on a phone viewport, with real taps.
- Save migration and reload; rollback to the LD2.0-A client.
- Performance: draw calls and triangles, at home with a guest, against `b16f8d5`.
- The real iPhone review.
  - It needs a reachable server: the branch's Cloudflare preview.
  - That is blocked by the account's preview Durable Object namespaces until the owner frees some (`docs/ld2/REGRESSION.md`).
  - A claude.ai artifact cannot open a WebSocket, so it cannot stand in this time.
