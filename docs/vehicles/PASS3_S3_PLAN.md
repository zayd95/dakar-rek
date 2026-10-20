# Pass 3 · S3 — Garage Modou repair service: implementation plan (nothing coded yet)

Owner decisions applied (20 Oct): physical repair in **Pikine only** for now (no teleporting cars or mechanics across districts; cars in districts not yet joined by continuous roads keep the roadside fix and cannot reach the garage — accepted); **Option B** (the real Modou does the work) if a safe, isolated hook exists, otherwise a separate apprentice, never a duplicate Modou; ~30 s physical repair, **quote before confirmation, one payment at completion, no charge on cancel**; damage and repair prices reviewed so a crash matters without making driving a chore.

S1/S2 (damage, dead car, roadside fix) are already in PR #54. This plan is only S3.

## 1. What the player lives through

1. Drives (or limps, after the roadside fix) to the **repair bay** in front of Garage Modou and stops in it. The bay is a painted pad and a small sign drawn by the vehicle module (`motoModule.ts` already builds the Jakarta corner there). No Visual Pass building, road or tree is touched.
2. Steps out. The parked-car card now offers **« Faire réparer · Garage Modou »** (only if the car is below 100 %, the car is in the bay, and Modou is on shift: 7–13 h and 15–19 h from his routine; otherwise the row is disabled and says when he is back).
3. **Modou walks** from his bench to the car (his own walking, sidewalks and colliders as on any day), kneels at the bonnet for ~4 s (« Il regarde ») and the **quote card** opens: current health, what is wrong in a line, **price in FCFA**, duration (~30 s), `[Réparer]` `[Pas maintenant]`. Inspecting is free and changes nothing.
4. `[Réparer]` runs the existing activity runner for **30 s** in three visible steps (« Il démonte », « Il change les pièces », « Essai moteur »). The player is busy (progress bar) and can cancel; Modou works on the car (his Work clip; the recorded thud/crash one-shots serve as the taps of tools, no new sample).
5. At completion only: **one charge** of exactly the quoted price (`repairAsset`), health → 100 %, a short engine run and a horn tap from the car, one line from Modou, he walks back to his bench and his routine continues.
6. Cancel, refuse, a reload, a hub change or running out of money before the end: **nothing is charged**, the car keeps its health, Modou returns to his bench.

Nothing is instant and nothing is teleported: the car is driven in, Modou walks over.

## 2. Modou on the real NPC (Option B): the hook, and why it is isolated

How NPCs work today (`src/social/npcLife.ts`): each cast member follows `currentPlan(routine, hour)`; a change of plan key triggers `retarget()` which plans a sidewalk path and walks there; walking NPCs also pause and face the player when closer than 2.2 m.

**Proposed seam (additive, ~25 lines in `npcLife.ts` + one new file):**

* `src/social/errands.ts` (new, no imports from the game): a tiny registry `errandHooks = { borrow: null }` in the same style as the existing `phoneHooks`. `NpcLife`'s constructor installs the implementation, so **`main.ts` is not touched** and the vehicle module only imports this one file.
* `borrow(id, spot, act) → Loan | null`: refuses (returns null) unless that NPC exists in the current hub, is on shift and not already borrowed. `Loan` has `arrived()`, `act(clip)`, `release()`.
* Inside `NpcLife`: `plan = this.loans.get(n.id) ?? currentPlan(...)` at the two existing plan lookups (`update`, `retarget`), `n.paused` is bypassed for a borrowed NPC (otherwise he stops 2 m from the player standing at the bay), `release()` clears the loan and calls the existing `retarget()` so he **walks back by his own routine** (no snap). `load()` (hub change) drops all loans.
* The borrowed place has its own id (`'bay'`), so `hostAt()` / situations (`place.id ?? place.at`, from #50) correctly see him as **away from the garage** while he works; `walkUp` greetings are already suppressed during an activity (`ctx.idle()` is false).

Nothing else of the social system changes: no cast, routine, relation, memory, situation or multiplayer code is edited. **One Modou exists at all times** (the same object is moved by the same walking code).

**Fallback if you prefer not to touch `npcLife.ts` at all:** a `Mechanic` interface (`walkTo`, `work`, `release`) with an *Apprentice* implementation owned by the vehicle module: a separate humanoid (not in the cast, never saved) that walks out of the garage aisle, works, and walks back in, then is disposed. Both implementations share all the S3 logic (quote, activity, payment), so choosing later costs one adapter. Recommendation: **Modou, through the seam, landed as its own micro-PR** (below).

## 3. Conflicts with PR #50 (M1-C social stickiness) — checked

* Files changed by #50: `main.ts`, `ui/minimap.ts`, `social/{npcLife,routines,situations,profiles,memory,walkup,revisit}.ts`, `multiplayer/*`, tests and scripts.
* **#49/#51/#54 versus #50, as they stand: no textual conflict** (a trial merge of #50 into the #49 tip and into the #51 tip is clean; #49 and #50 both change `main.ts` and `minimap.ts`, in different places).
* **S3 would conflict textually in `npcLife.ts` only**: #50 adds `this.sinceGreet += dt; this.walkUp(n, dP);` right next to the plan lookup in `update()`, and changes `hostAt/presentAt`. My two one-line plan edits sit next to those lines → expect a small, mechanical conflict in whichever of the two lands second.
* Semantic points to respect, all handled above: `place.id` (#50) is what situations key on; routines for Modou carry `id: 'garage'` in #50; `walkUp` and recognition depend on the NPC being idle and on a place id.
* Not done, on purpose: a paid repair counting as a « service » that makes Modou recognise the player as a regular (`recordService`). It is a good M1-C tie but it is the social system's rule; a one-line call once you and #50 agree.

**Coordination proposal (needs your go-ahead, I will not edit the social files before it):**

1. I open a **micro-PR** « NpcLife errand seam » from the M1-C base (#48), touching only `social/errands.ts` and the few lines of `npcLife.ts`, with a unit test of the loan state machine and a browser check that a borrowed Modou walks, works, and returns to his bench while the social checks of #50 stay green (I run `check-social`, `check-recognition`, `check-anchors` on the merged result).
2. Whoever lands second (#50 or the seam) resolves the small context conflict; I do it for the seam.
3. S3 itself (bay, quote, activity, payment) then lives entirely in `src/transport/` and the economy asset model, on the vehicles stack, behind the `Mechanic` interface.

## 4. Technical shape (vehicle side only)

* `src/transport/garage.ts` (pure, unit-tested): bay geometry test (car within the pad and aligned), `quote()` (health, price, line, duration), the job state machine `idle → inspecting → quoted → repairing → done | cancelled`, opening hours from the routine (read-only).
* `OwnedVehicleModule`: bay pad + sign meshes for Pikine, the parked-car affordance, the quote card (existing sheet), the 30 s activity through `ctx.activities.start`, `repairAsset` at the last step. The price shown is `repairCost(asset)` at inspection and is re-checked at completion (the wallet may have changed; if it cannot pay, nothing is taken and the card says so).
* Save: no new key (condition lives in the asset, v6). The job is not persisted: a reload cancels it with no charge.
* Audio: uses the recorded set (ignition, horn, thud/crash for the tool taps); no new sample is added.
* Tests: unit (quote, state machine, hours, no charge on every cancel path), browser with real touch (park in bay, Modou walks over, quote, cancel = no charge, repair = one charge and 100 %, reload keeps health, wallet delta exactly the quote, still one Modou, he resumes his routine), plus the S1/S2 checks.

## 5. Damage and repair pricing review

The rules today: contact under 2.5 m/s (9 km/h) costs nothing; above that `0.9·(v−2.5)^1.35` points, capped at 35 per contact, a glancing blow 60 % of a head-on one; one damaging contact per 0.8 s; scrapes never cost anything. Repair = 0.1 % of the vehicle price per missing point (10 % of the price for a wreck), the asset model's own rule.

| Speed | Head-on | Glancing | Jakarta (150 000) | Berline moderne (6 M) | Berline neuve (14 M) | 4 × 4 (75 M) |
|---|---|---|---|---|---|---|
| 14 km/h (4 m/s) | 1.6 pts | 1.0 | 240 F | 9 600 F | 22 400 F | 120 000 F |
| 22 km/h (6 m/s) | 4.9 | 2.9 | 735 F | 29 400 F | 68 600 F | 368 000 F |
| 29 km/h (8 m/s) | 9.0 | 5.4 | 1 350 F | 54 000 F | 126 000 F | 675 000 F |
| 43 km/h (12 m/s) | 18.8 | 11.3 | 2 820 F | 113 000 F | 263 000 F | 1.4 M F |
| 58 km/h (16 m/s) | 30.2 | 18.1 | 4 530 F | 181 000 F | 423 000 F | 2.3 M F |
| wreck (0 %) | 100 | | 15 000 F | 600 000 F | 1.4 M F | 7.5 M F |

(For scale: a Tiak Tiak delivery pays ~1 000–2 400 F.)

Findings and what I propose to adjust **in S3 (numbers only, easy to tune, with your say)**:

1. **The rule is consistent with the rest of the economy** (repair = share of price), so a richer car costs more to fix; keep it. A parking tap or a scrape stays free, so low-speed manoeuvring is never punished.
2. **A moderate hit (≈30 km/h) on the Jakarta costs about one delivery** — a real but small consequence; on the Berline moderne it is ≈54 000 F, which is meaningful at the time the player first owns it but not ruinous. Keep.
3. **Frustration risks to remove:** (a) a quote for a few points (< 2 pts) is a nuisance: **under 3 % lost the car is not worth a visit — Modou says « ça va, ce n'est que de la peinture » and charges nothing** (cosmetic, health stays; the card keeps the figure); (b) prices rounded to **the nearest 500 F** (cars) / 100 F (Jakarta) so quotes read cleanly; (c) a **minimum job of 1 000 F** for any real repair (the visit); (d) two hits in a row cannot stack more than the cap per 0.8 s (already).
4. **Premium cars are punishing in absolute terms** (4 × 4: a 43 km/h hit ≈ 1.4 M F). That is proportionate to a 75 M vehicle and is the intended weight of owning one; if it tests as too harsh I would apply a soft ceiling on a single repair of **4 % of the price** (a 100 % wreck still costs 10 %). Open to your call.
5. **Dead-car loop is safe:** the roadside fix is free and always available at 0 %, so a crash never locks the player out; paid repair is for getting performance back, and the performance penalty (top speed 88 / 72 / 50 % in the worn / rough / poor bands) is what makes it worth paying. Not changed.

## 6. Order of work (once you approve)

1. Micro-PR: NpcLife errand seam + tests (needs your explicit OK on touching `npcLife.ts`; otherwise the Apprentice adapter).
2. `garage.ts` pure rules + unit tests.
3. Bay, sign, quote card, 30 s activity, payment, on `vehicles/pass3-condition-20261019` (PR #54), behind the `Mechanic` interface.
4. Browser check with real touch and the full regression set; S4 stays held.

## 7. Known limits (unchanged, accepted)

* Repair only in Pikine; cars elsewhere keep the roadside fix and cannot reach the garage until continuous roads connect the districts. No towing, no teleport.
* NPC behaviour is local to the device like the rest of the cast.
