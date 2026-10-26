# La traversée — Embarcadère de Ngor

The owner's request (25 Oct 2026, on the LD2.0-A preview): « The Port de pêche Ngor is not needed, we have Soumbédioune, so let's turn it into a croisière that can move customers. You have the choice between pirogues or a nice chaloupe for the crossing. »

The roadmap entry is `docs/ROADMAP_NEXT.md` §6. This document is the first slice's design and the contract its lanes build against.

- **Branch:** `feature/ngor-traversee-20261026`, stacked on LD2.0-B (`integration/ld2-b-20261025`).
- **Not for production:** `wip/visual-pass` is untouched and nothing is deployed.

## What the player does
1. **The quay.** In the Almadies, the old fishing quay is now the **Embarcadère de Ngor**: a new sign, the pier carried over the beach, and a floating pontoon out on the water.
   - Customers wait on the pier for the next crossing, and a pirogue and a chaloupe are moored at the pontoon.
   - The island of Ngor lies offshore, about 150 m out, with its landing jetty, sand, rocks, a few houses and palms.
2. **Two choices at the pier's end:** « Traversée en pirogue » and « Traversée en chaloupe ». Each shows its fare, how many passengers are waiting, and Ousmane's share.
   - **The pirogue:** more seats, a lower fare, a rougher ride.
   - **The chaloupe:** fewer customers who pay better, and a faster, smoother crossing. It is open once Ousmane has seen the player take the pirogue across three times.
3. **The crossing.**
   - The player takes the helm (seated at the motor).
   - The customers walk down the pier and the pontoon, step aboard and sit.
   - The boat leaves the pontoon and crosses the open water, with its wake behind and the hull rocking more for the pirogue. It turns in to moor at the island's jetty.
4. **At the island.**
   - The customers step off onto the jetty and walk up onto the island.
   - The leg's fares are paid once, minus Ousmane's share.
   - Then the customers going back to the mainland, if any, walk down the jetty and board.
5. **The return.** The boat crosses back and moors at the pontoon with its west side against it. Those customers step off and walk up the pier, and their fares are paid once.
6. **Hours.** Crossings run from 7 h to 19 h (city time). Outside those hours the choice says when they start again, and the boats stay moored.

## Rules (`src/sea/traverseeRules.ts`, pure and unit-tested; numbers in `ECONOMY.traversee`)
| | Pirogue | Chaloupe |
|---|---|---|
| Customers to the island | 3–4 (4 in the busy hours 9–12 h and 16–18 h) | 2–3 |
| Customers back | 1–3 | 1–2 |
| Fare, per person and per leg | 1 000 F | 2 500 F |
| Ousmane's share (the boats are his) | 40 %; 30 % with `ousmane_trust` | 40 %; 30 % with `ousmane_trust` |
| Speed on the water | about 5.5 m/s (about 22 s per leg) | about 7.5 m/s (about 16 s per leg) |
| Opens | always, in the hours | after 3 completed pirogue round trips |

- **Payment:** once per leg, on arrival. One wallet line names the leg, the passengers, the fares and the share, for example « Traversée vers Ngor · 4 passagers · 4 000 F − part d'Ousmane 1 600 F ».
  - It is paid by the step's own effects, so a reload or a second tap can never pay a leg twice.
  - An unfinished leg pays nothing.
- **Counters (in the existing `counters`; no new save field, no migration):**
  - `traversees` and `traversees_pirogue` / `traversees_chaloupe`, for completed round trips;
  - `passagers_ngor`, for passengers carried.
- **Needs:** a round trip costs some energy (about −8) and gives some morale (about +4, the sea air).
- **Category:** `'transport'`, for the polyvalence.
- **Optional:** a « Garde le cap dans la houle » timing gesture halfway across, whose score gives a small tip (at most 100 F a passenger).
  - Keep it only if it plays well on the phone, with the boat still moving.
  - It never lowers the fare itself.

## What the quay stops doing
The quay's fishing actions are removed: `ACTIONS.port` « Aider les pêcheurs » and « Pirogue du matin ». Fishing is Soumbédioune's (Corniche), which already has its pirogue trip and the mareyeuses.

What changes with them:
- **Ousmane** becomes the « chef de l'embarcadère ». He hires out the boats and takes the share. His beat's `ousmane_trust` now lowers his share.
- **His texts:** his profile, routines and lines say so, and his recommendation points at the traversée, which is a real place.
- **Polyvalence:** `peche` says Soumbédioune only. The quay's place counts as `transport`.
- **VTC points:** each Almadies point names a real place. The `port` point becomes the Embarcadère de Ngor. The duplicate `embarcadere` point at (16, −75) becomes another real place of that block or a different one, and the hub keeps at least 9 points.
- **Tests and scripts that named the port's fishing follow:** `tests/economy.test.ts`, `tests/business.test.ts`, `scripts/check-perform.mjs`, `scripts/m1a-sim/measure-gestures.mjs`. The gestures they measured stay measured at Soumbédioune.
- **The interactable's id stays `almadies:port`.** Ousmane's place, his routines' anchor and any save that counted the place keep working; only its name and actions change.

## Architecture
- **The contract:** `src/sea/traverseeSite.ts` holds the coordinates, the frame, the deck heights and the `BoatModel` interface.
  - **The frame:** a boat is built along its local z, with the bow at −z.
  - **Moored:** at yaw 0, with its west gunwale (−x) against the pontoon or the island's jetty.
- **The world (`src/world/builder.ts`, `src/world/boats.ts`, an island builder):**
  - the static quay, the pontoon and the island, all merged into the hub's batches (no new draw call for the static scene);
  - the two boat models, each one group with a merged mesh and its wake.
- **The crossing (`src/venues/embarcadere.ts` and a place recipe in `src/activity/templates.ts`):** a venue, like Soumbédioune's pirogue (`src/venues/beach.ts`). It owns:
  - the place: anchor at the pier's end, offers, hours, peaks;
  - the moored boats;
  - the helm seat (kind `'vehicle'`, space `'street'`, locked while crossing);
  - the customers (`Humanoid`s, as the VTC passengers: walk, step aboard, sit, step off, walk away, fade);
  - the boat's motion along the route, turning it at either end, with its rocking and wake;
  - a framing camera while crossing;
  - the steps' `until`s (the activity runner waits on the venue's state).
- **The player is never walked past the bounds:** the step that boards the helm seats them directly from the pier's end, as a vehicle seat does.
- **Presence:** while crossing, the player is in space `'street'`, seated, as on Soumbédioune's pirogue. Other players see them sitting but do not see the boat (a limit of this slice).
- **Reload in the middle of a crossing:** the player is put back on the pier at the anchor, and the boats are back at their moorings. Nothing is paid for the unfinished leg, and counters stay as they were.
- **Debug:** `window.__dakar.traversee()` returns what a check needs: the phase, the boat and its pose, the customers (state, seated or not, where), the legs paid with their amounts, the counters, and why a choice is closed.

### As built (beyond the contract)
- **The boat not in use** waits on the pontoon's west side, at x = 28 − 0.35 − beam/2 with z and yaw as at the quay mooring. The boats swap during the cut to black that starts a crossing.
- **Turning room:**
  - The return turns the boat round east of the island's mooring (x 39…49, z −296…−286) and east of the quay's (sweeping to z −165).
  - Nothing static stands there: the island's rocks and the beach pirogues keep clear.
- **The island's ground:** `ngorGroundY(x, z)` (`src/world/ngor.ts`). The customers who land walk up the island's sand on it.
- **Timings:** a pirogue round trip takes about 91 game-seconds headless.
  - Boarding ≈ 18 s;
  - out ≈ 26 s, which includes easing in and out;
  - landing ≈ 4 s;
  - boarding back ≈ 6 s;
  - back ≈ 33 s, which includes both turns;
  - landing ≈ 3 s.
  - The chaloupe goes out in about 20 s.
- **« Arrêter » or a reload in the middle of a crossing:** both put the player on the pier at (31.1, −153) facing the sea, through the venues' `safePlace()`. A player seated out at sea is never saved, so the hub's bounds never clamp them onto the beach.
- **The VTC points of the Almadies (9, all real places):**
  - The `port` point is now « Embarcadère de Ngor ».
  - The duplicate `embarcadere` point became « La Vague · plage de Ngor ».
  - « Résidence des Almadies », which was no place in the game, became « Villa avec piscine · Almadies ».
- **The minimap** shows the embarcadère as transport.
- **Shared framework additions:** all optional, unused by other venues.
  - `PlaceSpec.closedWhy` (the reason a closed place shows);
  - `Venue.camera(dt, drag)`, `active()` and `safePlace()`.
- **The gesture measurement** (`scripts/m1a-sim/measure-gestures.mjs`, `scripts/check-perform.mjs`) moved from the quay's haul to Soumbédioune's net, which pays fish rather than money.
- **The optional « Garde le cap » gesture is not built.**

## Lanes (at most two implementation agents; one integration owner)
| Lane | Owns | Delivers |
|---|---|---|
| **W — the world** | `src/world/builder.ts` (the `port` case: sign, pier extension, pontoon, beach pirogues clear of the pier), `src/world/boats.ts` (replaces the placeholder), a new island builder (e.g. `src/world/ngorIsland.ts`), `tests/boats.test.ts` | <ul><li>The quay, pontoon and island as in the contract.</li><li>The pirogue: painted, thwarts, outboard motor.</li><li>The chaloupe: a white launch with a coloured band, benches, a canopy on posts, a motor and life rings.</li><li>Quality tiers (fewer details on low).</li><li>Budget: the island ≤ 3 000 triangles and no extra draw call; a boat ≤ 2 draw calls and ≤ 1 500 triangles.</li><li>Screenshots from the pier, the beach and the water.</li></ul> |
| **G — the crossing** | `src/venues/embarcadere.ts`, `src/venues/index.ts` (registration), `src/activity/templates.ts` (the recipe), `src/sea/traverseeRules.ts`, `src/economy/config.ts` (`ECONOMY.traversee`), `src/world/content.ts` (`ACTIONS.port`), the `${id}:port` interactable line in `builder.ts`, Ousmane (`src/social/*`), `src/economy/polyvalence.ts`, `src/transport/vtcRules.ts`, tests and scripts that name the port, the debug hook | Everything in « What the player does », against the contract and the placeholder boats; unit tests of the rules |
| **Integration (owner)** | the contract, the merge, `scripts/check-traversee.mjs`, the report | the acceptance below, regression, performance, the draft PR |

Each lane works in its own worktree on its own branch, from the contract's commit, and does not push. The integration owner merges.

## Acceptance (`scripts/check-traversee.mjs`, a phone-sized page, 390×844, touch)
1. **In the Almadies:**
   - the sign reads « EMBARCADÈRE DE NGOR »;
   - the quay offers no fishing;
   - Soumbédioune still offers its fishing trip.
2. **At the pier's end:** « Traversée en pirogue » shows its fare, passengers and share. « Traversée en chaloupe » is closed, saying how many pirogue crossings remain.
3. **A pirogue round trip, with real taps:**
   - The player sits at the helm.
   - 3–4 customers walk down and sit aboard.
   - The boat moves across the water to the island's jetty: its position changes, it rocks, and its wake shows.
   - The customers step off and walk away.
   - The leg is paid once, by the exact amount: fares − share.
   - The return customers board, the boat comes back to the pontoon, and that leg is paid once.
   - The counters move by one round trip.
4. **The chaloupe:** after three pirogue round trips (the first by taps; debug hooks may set the counter for the other two), it opens and a chaloupe round trip pays its own fares.
5. **A reload in the middle of a leg:** the player is back on the pier, the leg is not paid, and nothing is paid twice.
6. **At night:** no crossing, and the reason is shown.
7. **Overall:** no page errors, and screenshots of the quay, the island from the pier, the crossing, and the landing.

## Quality gates
- `tsc` and `typecheck:server`, build, the whole vitest suite.
- `check:city`, `check:online` and `check:launch` as in CI.
- `check-phone` and `check-ui-consistency`.
- Performance at the quay against LD2.0-B (fixed places, as in `docs/ld2/LD2_B.md`).
- Phone-sized checks only here; the owner's iPhone review is still due.

## Later slices (not in this one)
- Buying a pirogue or a chaloupe (`src/economy/assets.ts`, credit), with no share then.
- Walking on the island.
- Other players seeing the boat.
- « Mes pistes » pointing at the traversée.
- Steering the boat by hand.
