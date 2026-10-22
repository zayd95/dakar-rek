# Saves: storage keys and the rules that protect them

The game saves on the device only (`localStorage`, `src/core/save.ts`).

| Key | Written by | Read by |
|---|---|---|
| `dakarrek.guest.save` (legacy) | clients up to schema v3 (production before the v5 launch) | the v5 and v6 clients read it **once**, to migrate; they never write it |
| `dakarrek.guest.save.v5` | the schema-5 client (the launch build) | the v5 client; the v6 client reads it **once**, to migrate, and never writes or removes it |
| `dakarrek.guest.save.legacy` | the v5 client | `migrated` / `declined` (its New Game). The v6 client only reads it (to leave a declined legacy save alone), never writes it |
| `dakarrek.guest.save.v6` | the v6 client (current) | the v6 client |
| `dakarrek.guest.save.v6.import` | the v6 client, at a New Game (`declined`) | the v6 client: the older saves are not imported again |
| `dakarrek.guest.save.v6.extras` | the v6 client, with every save | the v6 client: the fields an older v6 client drops (see below) |

## Why v6
The Tiak Tiak tour adds an active-run field (`jobs.active.tour`) that only a v6 build understands. Under the v5 key an older client that was served again (a rollback) would read the run as a route it does not know, cancel it and write the save back, losing the tour. A schema number that stays the same is not compatibility: the tour data is in a new schema with its own key, so the older client never sees it and never writes to it.

## Rules
1. A schema owns its key. A client never writes a key of an older or newer schema. The next schema gets its own key.
2. Migration is one-time and happens at load, from the newest older save: v5, else the legacy one. The v6 key is written at once (not at the first autosave); the older bytes and the markers the older client owns are never touched.
3. A v6 save always wins. If it is unreadable (or written by a newer client) the game starts a new game; it does not fall back to the v5 or legacy save (no silent rewind). A v5 save that cannot be read is not replaced by the legacy one either.
4. New Game removes the v6 save and writes `…v6.import = declined`; neither the v5 nor the legacy save is imported again, and both stay on the device for an older client. If the storage is full the marker is retried right after the v6 save is removed (that frees the room it needs).
5. If the storage is full or blocked at the migration, the migrated save is still used in memory and the older saves are intact; the next save tries again.
6. A v6 build never migrates **into** an older key: nothing flows back to v5 or v3.

## Fields that other lanes add
`migrate()` rebuilds the save field by field, so a field it does not list is dropped on the next load. Every field a lane adds to `SaveData` must be listed there (with a default for older saves) and covered by a migration test. Carried today: the cosmetic city-player model `avatar` (`'homme' | 'femme'`, the Meshy avatar lane, branch `claude/lucid-cori-60vlgt`: same names and values as on that branch, so the two merge without a semantic conflict; tests in `tests/saveV6.test.ts`). The vehicles lane adds one field, `basis` on an asset of `assets.list` (what the owner of a retired vehicle paid, so resale carries no windfall; listed in `assetsOf`, absent for everyone else); the owned vehicle ids are ordinary assets and where each is parked is `vehicle:<asset>:hub|x|z|yaw` in `counters` (tests in `tests/vehicleSaveV6.test.ts` and `tests/legacyVehicles.test.ts`: the avatar, the tour and the vehicles come back together; a v5 save that owns the retired `clando` ends up with the same car as `compacte`). The permanent identity (`guestId`, `createdAt`) and the wrestler look were already carried. A **New Game starts with the default look** and only *suggests* the previous choice: `clearSave` records it in `dakarrek.guest.save.v6.avatar-suggestion` (v6's own namespace) and `suggestedAvatar(store)` reads it back. Nothing applies it: when the Meshy picker is integrated it shows the suggestion pre-selected and the player confirms or chooses again. The device-level identity (`dakarrek.presence.profile`: name and look, and the chat key) lives outside the save and is never touched by a migration or a New Game.

## What an older v6 client erases, and how it comes back
Older v6 clients rebuild the save from the fields they know: the build before the vehicles economy (PR #61) drops `loans` (Pape Sarr's credit, Modou's slate) and `vtc`; the build before this pass (PR #63) keeps the debts but drops `play` (the player's days) and `streak` (the run of days worked), and each loan's `share` (Pape Sarr's share of the VTC fares). Served again (a rollback, a stale tab, a cached preview), such a client would silently wipe a debt.

So every save also writes those fields a second time, under `dakarrek.guest.save.v6.extras`, with the guest id (`EXTRA_FIELDS` in `src/core/save.ts`). An older client never touches that key. At load, when the v6 save lacks one of those fields, it is taken back from the backup **of the same guest**: the debt exactly as it stood (whatever the older client did with the wallet is kept), the rides already paid (a ride that was in hand is not resumed: the passenger is long gone), the days and the run. A loan that came back without its `share` gets it from the same loan in the backup; its due dates are left as that client left them and are moved onto the player's days by the credit clock (`onPlayClock`). The player is told once: « Tes crédits en cours ont été retrouvés ». A save this client wrote itself is never changed by the backup; another guest's backup is never applied; a New Game removes it.

Vehicles never needed this: an older client keeps the assets it does not know (`src/economy/assets.ts` ignores unknown catalogue ids; checked by `scripts/check-save-vehicles.mjs` and `scripts/check-save-debts.mjs`).

## Rollback to the older client
The older client only knows its own key. It opens its own save (the state at the moment of migration), plays and saves there, and never touches the v6 key. When the v6 client is served again the v6 save is intact and wins: an active tour, the stops already paid, the trust, the wallet — all exactly as they were left. Progress made on the older client after the rollback stays in its own key and is not merged back (a known limit). A New Game on either client leaves the other one's save alone.

## Known limits
- Two v6 tabs on the same device: the last one to save wins (a tab that is hidden saves what it holds). This is how saves always worked.
- Progress made on an older client after a rollback is not carried back to v6.
- A rollback to a client older than the vehicles economy (before `loans` and `vtc`) keeps every vehicle; while that client is the one played, the debts are not shown or collected (it does not know them), and they come back exactly as they stood when this client is served again (the extras backup above). A VTC ride in hand at the rollback is not resumed. Clearing the site's storage, or another device, loses both copies: the save is local.
- A v5-keyed save written by an earlier **tour-pilot preview build** (a tour under the v5 key) is carried over to v6 with its tour; an older client reading *that* v5 key would still cancel the tour. Only preview builds ever wrote it; the production client is v3.

## Checks
- `tests/saveKeys.test.ts` (production v3 → v6) and `tests/saveV6.test.ts` (v5 → v6; new → older v5 client → new with a tour half done; reload; New Game; a full storage at New Game; unreadable, newer and malformed saves). The older client in those tests is a **frozen copy of the schema-5 `save.ts`** (`tests/fixtures/saveV5Client.ts`) running on the same fake storage.
- `node scripts/check-save-v6.mjs <v5-dist> <current-dist>`: two real builds on one origin; the first tour stop is ridden for real, the older client is served, the current one returns, the second stop and the bonus are paid once.
- `node scripts/check-save-vehicles.mjs <old-dist> <current-dist>`: the build before the vehicles economy (PR #61) buys four vehicles in their dealerships; the current one loads them (same uids, prices paid, parking spots, paints; no debt, no ride), reload, rollback, return.
- `tests/saveExtras.test.ts`: the backup, an older client's rewrite (debts, rides, days, run back; what that client changed kept), a PR #63-style loan without its share, another guest, a New Game.
- `node scripts/check-save-debts.mjs <pr61-dist> <pr63-dist> <current-dist>`: three real builds on one origin: a financed Teranga and a run of days, the PR #61 client saves (the debt really is dropped), this client brings it back and says so; the PR #63 client saves (the days dropped), this client brings them back; the vehicles never leave.
- `node scripts/check-save-compat.mjs <prod-dist> <current-dist>`: the production v3 build and the current one: migration, reload, rollback, return, several tabs, New Game, an unreadable v6 save.
