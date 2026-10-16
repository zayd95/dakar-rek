# Saves: storage keys and the rules that protect them

The game saves on the device only (`localStorage`, `src/core/save.ts`).

| Key | Written by | Read by |
|---|---|---|
| `dakarrek.guest.save` (legacy) | clients up to schema v3 (production before the v5 launch) | the v5 client reads it **once**, to migrate; it never writes it |
| `dakarrek.guest.save.v5` | the v5 client | the v5 client |
| `dakarrek.guest.save.legacy` | the v5 client | `migrated` (the legacy save was carried over) or `declined` (New Game): the legacy save is not read again |

## Rules
1. A schema owns its key. A client never writes a key of an older or newer schema. The next schema gets its own key.
2. Migration is one-time and happens at load: the v5 key is written at once (not at the first autosave), the legacy bytes are left untouched.
3. A v5 save always wins. If it is unreadable the game starts a new game; it does not fall back to the legacy save.
4. New Game removes the v5 save and marks the legacy one `declined`. The legacy save stays on the device for an older client.
5. If the storage is full or blocked the migrated save is still used in memory and the legacy save is intact; the next save tries again.

## Rollback to the older client
The older client only knows its own key. It opens the legacy save (the state at the moment of migration), plays and saves there, and never touches the v5 key. When the v5 client is served again the v5 save is intact and wins: progress made on the older client after the rollback stays in the legacy key and is not merged. A New Game on v5 does not affect what an older client sees.

## Known limits
- Two v5 tabs on the same device: the last one to save wins (a tab that is hidden saves what it holds). This is how saves always worked.
- Progress made on an older client after a rollback is not carried back to v5.

## Check
`node scripts/check-save-compat.mjs <prod-dist> <cand-dist>` runs the production build and the candidate on one origin: migration, reload, rollback, return to v5, several tabs, New Game, an unreadable v5 save. `tests/saveKeys.test.ts` covers the same rules on a fake storage.
