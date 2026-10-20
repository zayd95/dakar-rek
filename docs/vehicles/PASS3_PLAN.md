# Pass 3 — vehicle condition and Garage Modou repairs (implementation plan)

Status: **S1 and S2 built** (this branch); **S3 and S4 prepared below for review, not built.** Base: the #49 tip (`vehicles/integration-20261018`), after the approved audio is integrated. The continuous-drive work (#51) is not touched.

## What already exists (so this is small)

* `src/transport/condition.ts`: pure, unit-tested rules, not wired: `damageOf(speed)` (taps cost nothing, ≈ 5 points at 6 m/s, 14 at 10, 24 at 14, max 35), bands (`whole` ≥ 70, `worn`, `rough`, `poor`, `dead` = 0), `performance`/`scaledDrive` (identity at ≥ 70 %: **driving is unchanged when whole**), `bandWarning` texts, `repairQuote`, `towFee` (free if the wallet cannot pay), `canMakeshift`/`LIMP_HP`.
* The asset model already has the health: every `AssetState` has `condition` (0–100, saved in v6, 100 for any save without one, clamped by `migrate`); `repairCost` and `repairAsset` (charges once, ledger line « Réparation · … », sets 100) exist and are tested. Every vehicle a player owns is an asset, so **no new save field** is needed.
* The contact feel (#49): `ContactTracker` gives one `Impact {kind, speed, strength}` per contact episode (a push against a wall is one hit, not sixty).
* Garage Modou: in Pikine, interactable `pikine:garage:31`, an open workshop (bench, lift, tools) and a module-built Jakarta dealer corner on its pavement (`src/transport/motoModule.ts`); Modou works at the bench 7–13 h and 15–19 h (`routines.ts`).

## Owner's decisions (Oct 2026) that shape the slices

1. **No invisible cross-district towing, no vehicle teleportation.** Recovery is local and physical until the connected-road network supports towing to Pikine.
2. **A repair bay at Garage Modou, owned by the vehicle module.** No change to Visual Pass buildings or roads.
3. **A repair takes about 30 seconds**, with Modou physically inspecting and working on the vehicle; the quote is shown first; the charge is made once, at completion.
4. **Health in the vehicle detail card**, discreet when healthy, clearer warnings under 70 % and under 30 %.
5. **At 0 % a limited, physical roadside fix** lets the car reach help, without making paid repairs pointless.

## S1 — damage and persistent health (built)
* `OwnedVehicleModule.hurt()` on every hit impact of a vehicle the player owns (never a dealer's trial car or the courier's loaner): `hitDamage(speed, headOn)` points off the asset's `condition` (a tap, a bump or a scrape costs nothing; a glancing hit 60 % of a head-on one; one hit per contact thanks to `ContactTracker`'s episodes). Written through `setCondition` (new, clamped 0–100, one decimal) into the asset the save already carries: **save v6 and every existing purchase are untouched**, a vehicle without a `condition` loads at 100.
* The band changes are said once (toast) and saved at once; the small changes are saved with the usual saves and when the player gets out.
* Below 70 % the drive spec is `scaledDrive(...)` (top speed and pick-up down); at 70 % and over it is the very same object, so a healthy vehicle drives exactly as before.
* The card: `Berline moderne · 18 km/h · 87 %` (a discreet figure once it has a scratch, nothing at 100 %); under 70 % a line « Abîmée · 54 % · moins de vitesse et de reprise »; under 30 % « Très abîmée · 22 % · elle n’ira plus loin : Garage Modou »; at 0 « En panne ». The parked vehicle's prompt carries the same figure and warning.

## S2 — an undrivable car and the roadside fix (built)
* At 0 % the engine stops where the car is (it coasts down; the player can get out), the car cannot move under full gas, **not even in reverse**, and getting back in: the starter turns and does not catch (`vehicleAudio.crank`, no engine), a toast says why. The car stays where it is, saved like any parked car.
* **Roadside fix (« Réparation de fortune »)**: offered on a parked car under 15 %, free, **only at the bonnet** (the player must stand within 2.6 m of the car's front, else the button says « Place-toi devant le capot »), a 12-second timed activity with the progress bar (the activity runner; leaving it cancels it, nothing changes); only when it finishes the car goes to **15 %**. 15 % is the « poor » band: 50 % top speed, 55 % pick-up, so it crawls to help; the paid repair (S3) is still the only way back to a healthy car, and the fix is no longer offered once the car runs (it cannot be repeated to keep a car at 15 % for free after it has been repaired: it only lifts a dead one).
* No tow, no teleport, no money involved, no wallet check: a broken car never locks the player out.
* Tested: `tests/condition.test.ts`, `tests/assets.test.ts` (unit) and `scripts/check-condition.mjs` (a phone, real fingers).

## S3 — Garage Modou: the physical repair (for review, not built)
**Where**: Garage Modou is in **Pikine** (`pikine:garage:31`); the module builds a marked **bay** and a small sign on Modou's pavement, next to its Jakarta dealer corner (the same kind of module-owned props: no change to the building, the roads, the trees or the street dressing).
**Flow**
1. The player drives the car into the bay and stops (a trigger zone; the car is then locked in place while it is worked on).
2. A mechanic walks out of the workshop to the car and **inspects it**: a short look-over (walks round the bonnet, the progress label says « Modou regarde ta voiture »).
3. **The quote first**: a sheet with the car, its condition, the exact `repairQuote` (the same number `repairAsset` charges), the wallet; nothing is paid yet. « Confirmer la réparation » / « Refuser ».
4. **About 30 seconds** of repair, the mechanic at the bonnet working (the activity runner's progress bar, the player may stand by; leaving cancels the job and charges nothing).
5. **Charged once, at completion**: `repairAsset` (one ledger line « Réparation · … »), the condition goes to 100, he hands the keys back, the player drives out.
**Open design choice (needs the owner)**: Modou himself is a recurring character of the cast who stands at his bench (`npcLife`, 7–13 h and 15–19 h). Two ways to have him physically do it: **(A) recommended** — the module spawns a *mechanic with Modou's look* for the job (like the Prestige salesperson, which the module owns), while the cast Modou stays at his bench and speaks; **(B)** take over the cast character's body for 40 seconds through an `npcLife` hook (touches a system outside the vehicle module).
**Real constraint to decide**: the only garage is in Pikine, and with the connected-road network limited to Almadies ↔ Corniche **a car in Almadies, Corniche, Plateau or the Medina cannot be driven to it**. With no towing allowed, those cars could only be roadside-fixed. Options: (i) accept it for now (repair only in Pikine; damage elsewhere is a reason to drive less); (ii) a **call-out**: Modou comes in his own vehicle to the car's district, drives up, and repairs there at a higher quote (a real vehicle driving in on the roads, no teleport); (iii) wait for the network. Recommendation: (i) now, (ii) later.
**Tests**: quote equals charge, nothing charged on cancel/refusal, one ledger line, condition 100 after, insufficient funds refuse cleanly, not outside Modou's hours, no car duplicated, reload mid-repair keeps the car and charges nothing.

## S4 — recovery by tow (for review, not built, and held)
Held until the connected-road network supports towing to Pikine (decision 1). What it would be when that time comes: a tow truck that **drives in on the roads** (the decorative-traffic path code), hooks the car, and drives it to the Pikine garage forecourt, the car moving with it every frame; fee `towFee` (free when the wallet cannot pay); a fee-free alternative of walking to the garage and having Modou come with the truck. Nothing of it is in this branch.

## Out of scope
Damage visuals (dents, smoke), engine-damage sound variants, wear from age, insurance, extending the continuous-drive network, any change to driving physics at full health.

## Risks
Balance: `damageOf` at 14 m/s costs 24 points, so a few hard crashes kill a car; the quote is 0.1 % of the price per point (a 14 M berline costs ≈ 336 000 F for 24 points). Both are numbers in `condition.ts`/`ECONOMY`, tunable after a phone session. The roadside fix is deliberately slow (12 s) and limited (15 %).
