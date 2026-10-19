# Pass 3 — vehicle condition and Garage Modou repairs (implementation plan)

Status: **plan only, nothing built.** Base: the #49 tip (`vehicles/integration-20261018`), after the approved audio is integrated. The continuous-drive work (#51) is not touched.

## What already exists (so this is small)

* `src/transport/condition.ts`: pure, unit-tested rules, not wired: `damageOf(speed)` (taps cost nothing, ≈ 5 points at 6 m/s, 14 at 10, 24 at 14, max 35), bands (`whole` ≥ 70, `worn`, `rough`, `poor`, `dead` = 0), `performance`/`scaledDrive` (identity at ≥ 70 %: **driving is unchanged when whole**), `bandWarning` texts, `repairQuote`, `towFee` (free if the wallet cannot pay), `canMakeshift`/`LIMP_HP`.
* The asset model already has the health: every `AssetState` has `condition` (0–100, saved in v6, 100 for any save without one, clamped by `migrate`); `repairCost` and `repairAsset` (charges once, ledger line « Réparation · … », sets 100) exist and are tested. Every vehicle a player owns is an asset, so **no new save field** is needed.
* The contact feel (#49): `ContactTracker` gives one `Impact {kind, speed, strength}` per contact episode (a push against a wall is one hit, not sixty).
* Garage Modou: in Pikine, interactable `pikine:garage:31`, an open workshop (bench, lift, tools) and a module-built Jakarta dealer corner on its pavement (`src/transport/motoModule.ts`); Modou works at the bench 7–13 h and 15–19 h (`routines.ts`).

## Slices (each mergeable, each with tests; order matters)

**S1 — damage and persistent health (no new UI beyond the ride card)**
* In `OwnedVehicleModule.onImpact`: for an *owned* vehicle only (not a dealer's trial car, not the loaner), `hit` impacts call `damageOf(speed)` and lower the asset's `condition`; bumps/taps/scrapes cost nothing. The episode gating already prevents repeated charging.
* Show « État : 72 % · Un peu usée » in the existing ride card; say `bandWarning` once when a band changes (toast).
* Apply `scaledDrive` to the vehicle's drive spec only when below 70 % (physics untouched at full health).
* Saved through the existing asset save (v6 unchanged); written when a band changes, on getting off and on save.
* Tests: damage per speed, once per episode, trial/loaner exempt, round-trip through save, old saves load at 100 %, `scaledDrive` identity when whole.

**S2 — an undrivable car, and never a soft-lock**
* At 0 % the engine stalls (the car coasts and the player can get off); a dead car does not start (« Ça ne démarre pas », the ignition sound plays and fails to catch: same recordings, no new asset).
* It stays where it is parked (persisted like today). Options offered at the car and on the phone: **tow** (S4) and the **makeshift fix** (free, a short timed activity at the car, lifts a car below 15 % back to 15 %: enough to crawl at the « poor » performance). A wallet at 0 can still tow (free).
* Tests: stall, no start, makeshift only below 15 %, never charged, state kept on reload.

**S3 — Garage Modou: the physical repair**
* A **repair bay** on Modou's pavement next to the Jakarta corner, built the same way (module-owned props: a marked bay and a sign; **no change to the building, roads or street dressing**, which belong to the Visual Pass).
* Flow, all on foot and by car: drive the car into the bay and stop → talk to Modou (only when he is at the bench) → « Inspecter ma voiture » → he **walks to the car** (the NPC walk used for the Prestige salesperson) and looks it over → the **quote** is shown: the car, its condition, the exact `repairQuote`, the wallet (the price is the one charged; nothing is paid yet) → « Confirmer la réparation » → a timed repair activity (progress bar, the car stays in the bay, the player waits or stays nearby) → **paid once on completion** (`repairAsset`, one ledger line) → Modou hands back the keys → the player drives out.
* Leaving before the end cancels the job and charges nothing. No instant repair, no menu repair from anywhere, no teleport of car or player.
* Tests: quote equals the charge, nothing charged on cancel, one ledger line, condition 100 after, insufficient funds refuses cleanly, Modou off-hours.

**S4 — tow (recovery from anywhere)**
* Calling the tow (phone, or at the dead car) starts a **real tow**: a truck drives in from the edge of the hub along the roads, hooks the car and drives it away; the car is saved as « at Garage Modou » and is waiting on the garage forecourt in Pikine (the fee is `towFee`, free if the wallet cannot pay it).
* In **Pikine** the whole tow is seen on the street. From another district the truck is seen taking the car off the street and driving away; the car then appears on the Pikine forecourt after a delay, as the trial car returns to its bay today (never seen to appear or vanish, `watchTrial` style), and the player travels there by the usual means. **This is the one place where a car changes district without being driven: the owner decides if that is acceptable** (alternative: tow only inside the district and leave a dead car elsewhere to the makeshift fix).
* Tests: the truck's motion is continuous (no frame jump), the fee, free tow at 0 francs, the car arrives once and is not duplicated, reload mid-tow.

## Out of scope for now
Damage visuals (dents, smoke), engine-damage sound variants, wear from age, insurance, the continuous-drive network (still only Almadies ↔ Corniche), and any change to driving physics.

## Decisions I need
1. **Tow across districts** (above): allowed with the delayed arrival at the Pikine garage, or in-district only?
2. **Pikine coordination**: a module-owned repair bay on Modou's pavement. Fine, or hold S3 until the Visual Pass owner has seen it?
3. **Repair time**: a short wait (≈ 30–60 s real time, scaled by damage) or none beyond the quote and the walk?
4. **Show the condition on the ride card** for every car (proposed), or only below « Bon état »?

## Risks
Save: none planned (existing field; the plan adds no key). Balance: `damageOf` at 14 m/s costs 24 points, so a few hard crashes kill a car; the quote is 0.1 % of the price per point (a 14 M berline costs ≈ 336 000 F for 24 points), and the free makeshift fix prevents a soft-lock. Both are numbers in `condition.ts`/`ECONOMY` and can be tuned after one phone session.
