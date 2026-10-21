# Saves: storage keys and the rules that protect them

The game saves on the device only (`localStorage`, `src/core/save.ts`).

| Key | Written by | Read by |
|---|---|---|
| `dakarrek.guest.save` (legacy) | clients up to schema v3 (production before the v5 launch) | the v5 and v6 clients read it **once**, to migrate; they never write it |
| `dakarrek.guest.save.v5` | the schema-5 client (the launch build) | the v5 client; the v6 client reads it **once**, to migrate, and never writes or removes it |
| `dakarrek.guest.save.legacy` | the v5 client | `migrated` / `declined` (its New Game). The v6 client only reads it (to leave a declined legacy save alone), never writes it |
| `dakarrek.guest.save.v6` | the v6 client (current) | the v6 client |
| `dakarrek.guest.save.v6.import` | the v6 client, at a New Game (`declined`) | the v6 client: the older saves are not imported again |

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

## Rollback to the older client
The older client only knows its own key. It opens its own save (the state at the moment of migration), plays and saves there, and never touches the v6 key. When the v6 client is served again the v6 save is intact and wins: an active tour, the stops already paid, the trust, the wallet — all exactly as they were left. Progress made on the older client after the rollback stays in its own key and is not merged back (a known limit). A New Game on either client leaves the other one's save alone.

## Known limits
- Two v6 tabs on the same device: the last one to save wins (a tab that is hidden saves what it holds). This is how saves always worked.
- Progress made on an older client after a rollback is not carried back to v6.
- A rollback to a client older than the vehicles economy (before `loans` and `vtc`) keeps every vehicle (checked by `scripts/check-save-vehicles.mjs`) but, once that client saves, forgets the debts (Sarr's credit, Modou's slate) and a VTC ride in hand: it rebuilds the save from the fields it knows.
- A v5-keyed save written by an earlier **tour-pilot preview build** (a tour under the v5 key) is carried over to v6 with its tour; an older client reading *that* v5 key would still cancel the tour. Only preview builds ever wrote it; the production client is v3.

## Checks
- `tests/saveKeys.test.ts` (production v3 → v6) and `tests/saveV6.test.ts` (v5 → v6; new → older v5 client → new with a tour half done; reload; New Game; a full storage at New Game; unreadable, newer and malformed saves). The older client in those tests is a **frozen copy of the schema-5 `save.ts`** (`tests/fixtures/saveV5Client.ts`) running on the same fake storage.
- `node scripts/check-save-v6.mjs <v5-dist> <current-dist>`: two real builds on one origin; the first tour stop is ridden for real, the older client is served, the current one returns, the second stop and the bonus are paid once.
- `node scripts/check-save-vehicles.mjs <old-dist> <current-dist>`: the build before the vehicles economy (PR #61) buys four vehicles in their dealerships; the current one loads them (same uids, prices paid, parking spots, paints; no debt, no ride), reload, rollback, return.
- `node scripts/check-save-compat.mjs <prod-dist> <current-dist>`: the production v3 build and the current one: migration, reload, rollback, return, several tabs, New Game, an unreadable v6 save.
