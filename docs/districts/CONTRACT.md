# Living Districts ↔ Living Dakar 2.0: coordination contract

**Version 3 · 2026-10-25** (M1; v2: LD2.0-A's answer and a tested trial merge with `8496b1f`; v3: the rond-point and the autopont, and what they need from LD2's carriageway test). Bump the version whenever a row changes. Keep this file short.

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
- LD2: `integration/ld2-a-20261024`. It was @ `dc68549` at M1 start, @ `8496b1f` (draft PR #68) at v2 and @ `3620c42` at v3.
- M1's proposed integration SHA: the head of PR #67.

## Dependencies

| # | Dependency | Owner · existing implementation | Interface consumed (inputs → outputs) | Save / persistence | Integration SHA | Status |
|---|---|---|---|---|---|---|
| 1 | Paying a ride | Vehicles economy · `src/transport/vtc.ts` `alight()` → `GameState.addMoney` (one wallet ledger line, guarded by `vtc.done`) | M1 adds no payment. `vtcHooks.extra(hub, day, hour) → VtcRequest[]` adds authored requests to the phone list; these use the same `vtcFare` / `tripOf` / `accept`. `vtcHooks.paid(trip)` fires once per ride, after the payment and inside the done-check. | Nothing new. The active ride and `vtc.done` are the existing `SaveData.vtc`. | `df48f78` (this branch) | **ready**: additive hook, no behaviour change when no hook is registered |
| 2 | Money accounts (LD2.0-A, `docs/MONEY.md`) | LD2 · `src/economy/money.ts` | None today. Fares reach the wallet through `addMoney`, as before. When LD2.0-A lands, the fare is whatever `addMoney` becomes there; M1 does not call `money.move` itself. | None | LD2 `8496b1f` | **ready**: LD2.0-A confirms a fare through `addMoney` is the wallet side of its money contract; only `move()` touches savings |
| 3 | A new hub id `mermoz` | LD2 (global save) · `src/core/types.ts` `HUB_IDS`, validated by `src/core/save.ts` | `HUB_IDS` gains `'mermoz'`, **appended** (index 4), so the stored hub indices of existing saves (e.g. a parked vehicle's `vehicle:<id>:hub`) keep their meaning. | No schema change, no migration, `SCHEMA_VERSION` stays 6. A save in Mermoz loaded by an older client falls back to that client's base hub (save.ts). | `570a3b2` | **ready on LD2.0-A's side**: no objection, and its hub-keyed code (`src/economy/pistesModule.ts`) doesn't assume four hubs. The owner's sign-off is still pending. |
| 4 | Multiplayer room for Mermoz | Multiplayer · `server/` `isHub()` reads the same `HUB_IDS` | A client in Mermoz asks for room `mermoz`. A server built from this branch accepts it; the production worker does not until it is redeployed. | None | `570a3b2` | **pending**: the preview worker only; no production deployment without the owner |
| 5 | NPC memory for Pape Diouf | LD2 (shared NPC memory) · `src/social/memory.ts` `recordVisit`, `src/social/relations.ts` `Relations.change` | Consumed as-is (no change to either file): `visit_pape_filaos` / `seen_pape_filaos` counters and `rel` `pape_filaos\|player`. | M1's own keys sit in the existing `flags` / `counters`, all prefixed `mz_` (`docs/districts/M1-MERMOZ.md` § Memory). Additive, so an older client keeps them unread. | `df48f78` | **ready** (consumer only). If LD2 moves NPC memory to its own store, these keys are the migration's input. |
| 6 | Merging with LD2-A | Integration owner | Trial merge of M1 (`efbd04c`) with `8496b1f`, done locally and thrown away. **One text conflict** in `src/core/types.ts`: keep LD2's `PistesState` import and M1's `HubId`/`HUB_IDS` lines. `modules.ts`, `chunks.ts`, `builder.ts`, `roadEvents.ts` merge cleanly; `tsc` passes. **Tests: 2262 passed, 1 failed**: LD2's `tests/ld2Drive.test.ts` « nothing stands on the carriageway » flags M1's VDN median. That median is a raised island on the centre line by design, like the Plateau checkpoint the same test already exempts. Exempting it (`DIVIDED.has(profile) && |d| < MEDIAN_HALF + 0.05`) makes the file pass 18/18, BRT junction included. LD2.0-A agrees with the exemption, kept exactly that tight. It cannot carry it, because `DIVIDED` and `MEDIAN_HALF` do not exist on its branch. **So the exemption is carried by the merge that brings the two together: M1 brings it if M1 lands second, as the merge order is the owner's call.** | — | resolution agreed | **blocked on integration approval** (no unapproved merges) |
| 7 | LD2's carriageway test and M1's new road furniture (v3) | LD2 · `tests/ld2Drive.test.ts` « nothing stands on the carriageway » | M1's road now has a **rond-point** at the BRT crossing: its island and splitter islands stand on the road's centre line by design, and the lanes swing round them (`road.rounds`, `src/road/roundabout.ts`). The **autopont** needs nothing: its deck is above 4.4 m and its piers and ramps stand off the road. Run against `3620c42`'s test, `corniche-mermoz` passes with row 6's median exemption plus one line: `if (road.rounds.some(r => { const dx = x - r.x, dz = z - r.z; return Math.abs(dx * r.fx + dz * r.fz) < r.flare && (Math.hypot(dx, dz) < r.island + 0.3 \|\| Math.abs(dx * r.lx + dz * r.lz) < 1.9); })) continue;` (the island and the splitters only; anything else on the swung lanes is still caught; `chunks.test.ts` guards that with the same condition, at the suggestion of LD2.0-A, who agreed to this row). A `git merge-tree` of this branch with `3620c42` still shows only row 6's conflict in `src/core/types.ts`. Like row 6, the line depends on M1's code (`road.rounds`), so it travels with the merge, not in LD2.0-A. | — | resolution agreed | **agreed by LD2.0-A**; applied in the merge commit, with row 6's line |

## Rules for this lane

- **No second wallet, inventory, bank or memory system.** A district job pays through the existing payment path, once.
- **New save data** goes in `flags` / `counters` with the district's prefix (`mz_`, then `pl_` for M2, …) until LD2 provides a district store. Each key is listed in the district doc.
- **Hub ids are appended to `HUB_IDS`, never inserted.**
- **No change** to the approved driving controls or vehicle audio.
