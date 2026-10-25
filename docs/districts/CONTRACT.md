# Living Districts ↔ Living Dakar 2.0: coordination contract

**Version 1 · 2026-10-25** (M1). Bump the version whenever a row changes. Keep this file short.

**Who owns what.** Living Districts (this lane) owns the districts' places, roads, local people and authored activities. Living Dakar 2.0 (LD2) owns:

- the shared economy (accounts, banking, deposits, credit);
- recommendations (« Mes pistes »);
- business ownership and assets;
- online messaging, transfers and invitations;
- the shared NPC relationship and memory systems;
- housing;
- the global save architecture and its migrations.

This lane changes none of LD2's modules without an agreed row below and integration approval.

**Branches.**
- District work: `feature/ld-m1-mermoz-20261025`, based on `integration/unified-beta-20261022` @ `a1cf012`.
- LD2: `integration/ld2-a-20261024`. It was @ `dc68549` at M1 start and is @ `da866e5` on 2026-10-25.

## Dependencies

| # | Dependency | Owner · existing implementation | Interface consumed (inputs → outputs) | Save / persistence | Integration SHA | Status |
|---|---|---|---|---|---|---|
| 1 | Paying a ride | Vehicles economy · `src/transport/vtc.ts` `alight()` → `GameState.addMoney` (one wallet ledger line, guarded by `vtc.done`) | M1 adds no payment. `vtcHooks.extra(hub, day, hour) → VtcRequest[]` adds authored requests to the phone list; these use the same `vtcFare` / `tripOf` / `accept`. `vtcHooks.paid(trip)` fires once per ride, after the payment and inside the done-check. | Nothing new. The active ride and `vtc.done` are the existing `SaveData.vtc`. | `df48f78` (this branch) | **ready**: additive hook, no behaviour change when no hook is registered |
| 2 | Money accounts (LD2.0-A, `docs/MONEY.md`) | LD2 · `src/economy/money.ts` | None today. Fares reach the wallet through `addMoney`, as before. When LD2.0-A lands, the fare is whatever `addMoney` becomes there; M1 does not call `money.move` itself. | None | LD2 `da866e5` | **pending**: must be re-checked after the merge (row 6) |
| 3 | A new hub id `mermoz` | LD2 (global save) · `src/core/types.ts` `HUB_IDS`, validated by `src/core/save.ts` | `HUB_IDS` gains `'mermoz'`, **appended** (index 4), so the stored hub indices of existing saves (e.g. a parked vehicle's `vehicle:<id>:hub`) keep their meaning. | No schema change, no migration, `SCHEMA_VERSION` stays 6. A save in Mermoz loaded by an older client falls back to that client's base hub (save.ts). | `570a3b2` | **pending LD2 approval**: owner's sign-off needed on the HUB_IDS row |
| 4 | Multiplayer room for Mermoz | Multiplayer · `server/` `isHub()` reads the same `HUB_IDS` | A client in Mermoz asks for room `mermoz`. A server built from this branch accepts it; the production worker does not until it is redeployed. | None | `570a3b2` | **pending**: the preview worker only; no production deployment without the owner |
| 5 | NPC memory for Pape Diouf | LD2 (shared NPC memory) · `src/social/memory.ts` `recordVisit`, `src/social/relations.ts` `Relations.change` | Consumed as-is (no change to either file): `visit_pape_filaos` / `seen_pape_filaos` counters and `rel` `pape_filaos\|player`. | M1's own keys sit in the existing `flags` / `counters`, all prefixed `mz_` (`docs/districts/M1-MERMOZ.md` § Memory). Additive, so an older client keeps them unread. | `df48f78` | **ready** (consumer only). If LD2 moves NPC memory to its own store, these keys are the migration's input. |
| 6 | Merging with LD2-A | Integration owner | `git merge-tree` of this branch with `da866e5` gives one textual conflict in `src/core/types.ts` (LD2's `import type { PistesState }` next to M1's `HubId` line). Keep both lines; `src/game/modules.ts` merges cleanly. | — | to be fixed at the merge | **blocked on integration approval** (no unapproved merges) |

## Rules for this lane

- **No second wallet, inventory, bank or memory system.** A district job pays through the existing payment path, once.
- **New save data** goes in `flags` / `counters` with the district's prefix (`mz_`, then `pl_` for M2, …) until LD2 provides a district store. Each key is listed in the district doc.
- **Hub ids are appended to `HUB_IDS`, never inserted.**
- **No change** to the approved driving controls or vehicle audio.
