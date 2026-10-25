# LD2.0-B « Belong Online »

The second phase of the Living Dakar 2.0 season.
- **Branch:** `integration/ld2-b-20261025`, stacked on LD2.0-A (`b16f8d5`, zayd95/dakar-rek#68).
- **Draft PR:** zayd95/dakar-rek#69.
- **Design and boundaries:** `docs/ld2/LD2_B_CONTRACT.md`.
- **Not on production:** `wip/visual-pass` is untouched, nothing was deployed, and the new Durable Object class exists only in the local runtime.

**How the results here were obtained:**
- headless Chromium with a software renderer (SwiftShader), on a 4-core container;
- the real Workers runtime run locally (`wrangler dev --local`);
- the phone pages at 390×844 with real touches.

None of it is a measurement from a real iPhone. The owner's two-phone review is still due, and it needs this branch's Cloudflare preview (below).

## The acceptance (from the brief)
`scripts/check-ld2b-journey.mjs`: **14/14**.

**Setup:**
- Two players, Awa and Moussa, each in their own phone-sized page, with their own device key and so their own account.
- The real local runtime, with fresh state.
- Every action is a real tap; Moussa walks to her door with the joystick.
- Debug hooks only set the scene: names, Awa's F2 and four pieces of furniture, Moussa's cash, where to stand, and the last stretch to the Grand-place. They also read the state.

**Evidence:** `docs/ld2/proof/journey-b/`.

1. **Connect and exchange private messages.**
   - Awa opens Messages and finds Moussa under « Nouveau message › À côté de toi ».
   - She writes; her message shows « envoi… », then « envoyé ».
   - His unread badge shows 1 and the list shows her line. He opens it and answers; she reads it.
2. **Request and transfer 5 000 F, exactly once.**
   - Awa asks: « + › Demander de l'argent », 5 000 F, « Pour le taxi ».
   - Moussa gets the card with « Payer » / « Refuser ». « Payer » shows how it is paid: 5 000 F from his wallet, since his Teranga Money is empty, and today's limits.
   - A real double tap on the confirmation gives **one** operation on the server's ledger, with the confirmation's id and the request's id.
     - His wallet: −5 000 F exactly.
     - Her Teranga Money: +5 000 F exactly.
     - The request reads « Payée ✓ » on both sides.
   - Paying the same request again with a new operation id is refused by the server, and nothing moves.
3. **Reconnect with correct balances and history.** Both pages are closed and opened again.
   - Her Teranga Money is 5 000 F, as the server says it now.
   - His wallet is as saved.
   - Both server histories hold the one transfer.
   - The conversation is intact, and nothing is left pending on his device.
4. **Send and accept a home invitation.**
   - « + › Inviter chez moi » invites him to her F2.
   - He taps « Accepter » on the card; « Acceptée » shows on her side too.
   - « Y aller » marks her street door.
5. **Enter the host's residence together.**
   - She goes in. He walks to her door and is offered « Entrer chez Awa (invité) ».
   - Both are then in `home:<her tag>`. Her four pieces are drawn for him where she has them.
   - Each player's game draws the other inside.
6. **Create and attend a scheduled meetup.**
   - « + › Proposer un rendez-vous »: the Grand-place de Pikine at « À 8 h » (a city time, sent as server ms). He accepts.
   - Both get there in its window. The meeting turns `met` on both sides, and the card « Vous êtes au rendez-vous ✓ » shows once on each.

No page errors in either game.

## What was built
**Server (`server/social.ts`, `server/worker.ts`):**
- **One new SQLite Durable Object class, `Social`, on one binding.** One class because each branch preview needs a namespace per binding, and the account's namespace limit is what blocks the previews.
- **`acct:<tag>`, a player's account.** One per player; it holds:
  - conversations (500 items each, idempotent by id);
  - delivery between accounts by RPC, with an outbox retried by an alarm;
  - blocking, enforced by the account that blocks;
  - reports (a counter and a log line);
  - invitations (the host's account decides);
  - meetings (the proposer's account decides);
  - `where` / `find` (only between players with an accepted invitation or meeting);
  - « vu il y a… »;
  - lookup by friend code.
- **`ledger`, Teranga Money:**
  - every operation is one transaction, idempotent by its id;
  - a request is paid at most once;
  - daily limits.
- **`/api/me`:** the account's socket. It is reached with the device key presence already uses, and the account's address is the presence tag.
- **Presence in a home:**
  - A home is the space `home:<tag>`. The host, or a guest the host's account confirms, may be in it.
  - Positions inside go only to the players in that same home. The street sees « at home », with no position.
  - Talk in a home is heard by the people in it.

**Device (`src/online/client.ts`, `src/economy/money.ts`, `SaveData.online`):**
- **Before a top-up leaves:** the wallet is debited, the operation is written as pending, and the save is written synchronously.
- **The server's answer:** a refusal refunds once. No answer means the same id is sent again at the next connection.
- **A withdrawal** credits the wallet once.
- **Rollback:** `online` is also in a fourth extras backup, so a rollback to the LD2.0-A client keeps a pending top-up.
- **The device key travels with the save code** (« Partie »). The settings say the code then also opens the online account, so it must not be shared.

**Messages (`src/ui/phone/apps/messages.ts`):** a phone app.
- **The list:** state in words, unread badges, « Nouveau message » (nearby players, « Ajouter par code », recent ones, the player's own code), and a privacy line.
- **The conversation:** bubbles by day, sending/failed with « Réessayer », and the field above the keyboard.
- **The « + » menu:** exactly the five actions: send money, request money, invite home, propose a meetup, share location.
- **Cards:** money, requests, invitations, meetings and positions, each updated in place.
- **The header:** block, report and delete.
- **Shared rules:**
  - Each money sheet shows how it will be paid and today's limits, before one confirmation.
  - The confirmation's id is made when it shows, behind the tap guard.
- **« Argent »:** shows Teranga Money (balance and when, Recharger, Retirer, the history, the limits).
- **The floating Chat:** keeps the proximity talk. Its « Messages privés » and a player's name open Messages.

**Visits (`src/online/visit.ts`, `src/economy/estate.ts`):**
- **The guest's game:** draws the host's home from the host's snapshot, at the same origin, so positions agree, and read-only.
  - The guest can never arrange, buy, sell or use the host's bed.
  - Seats and the TV only with the host's « Peut s'asseoir et utiliser la télé ».
- **Leaving:** puts the guest's own homes back exactly as they were.
- **A revocation or a block:** takes the guest out with one sentence.

**Meetups (`src/online/meetups.ts`):**
- **The places:** 15 existing ones in the four districts, and « Chez moi ».
- **The time:** « Maintenant » or a city time.
- **The window:** from 5 real minutes before to 10 after. The city's clock runs 60 times faster, so a player needs real minutes to get there.
- **Being there:** `here` is sent once. When both are there, the meeting is `met`, the card shows once, and the social need gets a small lift once a city day.
- **« Chez moi »:** an accepted meeting there also opens the visit.

## Checks

| Check | Result |
|---|---|
| `npx tsc --noEmit`, `npm run typecheck:server` | clean |
| `npx vitest run` (whole suite, integrated branch) | 195 files passed, 1 skipped; 2 357 tests passed, 3 skipped |
| `scripts/check-ld2b-journey.mjs` (the acceptance, real runtime) | **14/14** |
| `scripts/check-online-account.mjs` (raw sockets on the real runtime) | 39/39 |
| CI's game checks run locally: `check:online` · `check:launch` (+ the full `shots.mjs` suite) · `check:city` | 46/46 · 70/70 · 37/37 |
| `scripts/check-messages.mjs` · `check-visit.mjs` · `check-phone.mjs` · `check-ui-consistency.mjs` · `check-chat.mjs` (integrated online build) | see « Regression » |

`check-online-account.mjs` covers:
- the same `pay` sent twice, and at once from two sockets of the same account;
- a reconnect in the middle of an operation;
- the limits;
- a blocked recipient;
- an unknown recipient;
- a request paid twice;
- invitation, visit and revocation;
- a home space without an invitation;
- meetings (met, missed by the alarm);
- frames and rates;
- two real account clients.

### Regression
The phase's other browser checks, on the integrated branch. Each was run alone; a check's own fixes are named under it.

| Check | Build | Result |
|---|---|---|
| `scripts/check-messages.mjs` | online build, served without its server (`?fakeonline`'s account) | **43/43** |
| `scripts/check-chat.mjs` | real local runtime, two players | **30/30** |
| `scripts/check-visit.mjs` | online build | **55/55** |
| `scripts/check-phone.mjs` | online build, desktop and phone | **69/69** |
| `scripts/check-ui-consistency.mjs` | online build | **95/95** |

**What the first runs found, and what changed:**
- **In the game:**
  - « Discussion » was 40 px tall. It is now 44 px, the HUD's touch size, and the desktop moment card moved 4 px lower to stay clear of it.
  - In portrait, the chat button sat over the place's title when the presence pill was hidden. It now goes under the title.
  - The account client could send 16 frames in one second on a busy page (unit test, CI). Each frame of a burst now counts at its own time.
- **In the scripts:** they had been written against the stub world or the panel's old private tab.
  - `check-messages`: the nearest place's real name, « Y aller » marking a destination, and step 10 for an online build with no server.
  - `check-chat`: private messages through the Messages app.
  - `check-multiplayer` (CI's `check:online`): the car rapide step waits for B's seat to reach A instead of a fixed 1.5 s. CI failed it once on `e035704`. That runner took 59.5 s to bring the second page online (60.8 s on LD2.0-A's own green run), and A still had B at the stop. Here it is 46/46, A seeing B seated 14 ms after B's trip turned « riding ».
  - `check-messages` 9d (the keyboard) failed once while another check loaded the machine: the phone's animation ran late and the field was measured mid-way. It now measures the field once it has stopped moving.

### Performance
**Builds compared:** `vite build --mode online` of LD2.0-A (`b16f8d5`) and of this branch, served locally, the runs alternating. Same machine and renderer as above: frame rates only compare the two builds.

**Load, and the streets (`scripts/perf.mjs`, two runs each):**

| | LD2.0-A | LD2.0-B |
|---|---|---|
| Downloaded at start | 8 641 kB | 8 778 kB (+137 kB) |
| Time to playable, desktop / phone | 3.6 s / 3.1 s · 3.5 s / 3.0 s | 3.5 s / 3.0 s · 3.4 s / 2.8 s |
| Draw calls, phone: Plateau 13 h | 100 · 99 | 98 · 99 |
| Draw calls, phone: Pikine 13 h | 167 · 160 | 178 · 179 |
| Draw calls, phone: Pikine 21 h | 216 · 221 | 232 · 252 |

**Pikine on the phone looked higher, so it was measured again at fixed places** (the phone's viewport, the player placed and turned the same way; draw calls in three runs, frame rates in two):
- **Draw calls:** the same or fewer. On the north–south avenue (x 5.8, z −30), 13 h, steady: 77 → 72, 79 → 74 and 82 → 82 in three runs.
- **No new scene object:** the scene's top-level groups are the same in both builds. What differs is the street's moving life (people, vehicles), which is never the same from one run to the next.
- **Frame rates, the same at three places of four:**
  - 3.84 → 4.09 and 3.79 → 3.85 fps on the avenue by day;
  - 3.55 → 3.56 and 3.41 → 3.44 there at night;
  - 2.86 → 2.90 and 2.94 → 2.84 at the door of « Ma chambre » (x −42, z −54.5) at night.
- **The exception:** at that door by day, 2.74 → 2.53 and 2.68 → 2.48, about 8 % lower in both runs, with no more draw calls (66 → 58, 82 → 88). It is not explained yet. A software renderer's frame rate is not a phone's, so the iPhone review is where it would show.

**Other measures:**
- **In a furnished home, host and guest draw exactly the same:** F2 is 24 draw calls / 10 730 triangles, the family room 23 / 10 110 (`check-visit.mjs`).
- **The street gains no geometry.** Messages and Teranga Money are phone UI, and a peer at home is not drawn outside.
- **One more socket per online player** (`/api/me`). The client paces its frames (15 a second at most).

## Limits
- **The iPhone review needs a reachable server.**
  - This branch's Cloudflare preview fails on every commit, as zayd95/dakar-rek#67 and #68 do. The likely cause is the account's Durable Object namespace limit; it is not confirmed without the build log.
  - A claude.ai artifact cannot open a WebSocket, so it cannot stand in for this phase.
  - **The owner's call:** free preview namespaces, or name another host.
- **Money a device brings into Teranga Money is that device's own game money.**
  - The whole single-player economy lives on the device, so a modified device could bring money it never earned.
  - The daily limits bound it, and nothing else in the server can know.
- **Rooms:** two players see each other only in the same presence room. A visit or a meeting joins the other's room; two friends who just meet in the street are usually in the same one, since rooms fill one after another.
- **A guest sees the host's home as it was when they entered.** Furniture moved afterwards shows at the next entry.
- **Greetings are off inside a shared home.** Greetings (« salut », « merci ») treat a home as private.
- **No « Annuler » on an operation waiting for the server.** It resolves at the next connection.
- **Moderation is provisional:** reports are counted and logged; no moderator queue yet.
- **The keyboard over the conversation** was verified by simulating the visual viewport in headless Chromium only.
