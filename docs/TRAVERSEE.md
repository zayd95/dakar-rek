# La traversée — Embarcadère de Ngor

The owner's request (25 Oct 2026, on the LD2.0-A preview): « The Port de pêche Ngor is not needed, we have Soumbédioune, so let's turn it into a croisière that can move customers. You have the choice between pirogues or a nice chaloupe for the crossing. »

The roadmap entry is `docs/ROADMAP_NEXT.md` §6. This document is the first slice's design and the contract its lanes build against.

- **Branch:** `feature/ngor-traversee-20261026`, stacked on LD2.0-B (`integration/ld2-b-20261025`).
- **Not for production:** `wip/visual-pass` is untouched and nothing is deployed.

## Version 2: boarding and landing on the sand (the owner's references, 26 Oct)
The owner's reference photos of Ngor, and the owner's words: « create a beach sand like feel when getting on the boats and on arriving ».

**What the photos show:**
- The long white-and-red pirogue is pulled up at the water's edge on the mainland beach. Its passengers wear orange life jackets, and people wade around it.
- White launches with outboards ride at anchor in the bay.
- The island has golden sand with dark rocks in turquoise shallows, colourful parasols (orange, pink, red, blue) over plastic chairs and tables, beach restaurants, palms and green trees, and houses in red, ochre and yellow behind stone walls.
- The boats come in bow first onto the island's beach.

**What changes (`src/sea/traverseeSite.ts`, version 2):**
- **Boarding on the sand:**
  - Both boats are pulled up on the Almadies' beach east of the pier, bows on the sand and sterns in the water: the pirogue at x 44, the chaloupe at x 53.
  - The place's anchor is on the sand at the water's edge between them, at (48.5, −154.5).
  - The customers wait on the sand, put on orange life jackets, cross the sand, wade into the shallows and climb in over the gunwale near the bow.
- **Leaving:** the boat is pushed off stern first, turns round and crosses.
- **Landing on the island's beach:**
  - The boat runs its bow up the landing beach at (40, −294).
  - The customers step down into the shallows and walk up the sand among the parasols and the beach restaurants.
  - Those going back wait under the parasols.
  - The island has no jetty any more.
- **The way back:** the same, onto the mainland beach.
- **The look:**
  - turquoise shallows along both shores;
  - white launches at anchor in the bay (static);
  - more pirogues on the sand;
  - the island's landing beach dressed as in the photos.
- **The pier and the pontoon stay:** they are the quay's scenery, and other boats moor there.

### The island's rooftop restaurant and lounge bar, and more trees (the owner, 26 Oct)
The owner's words: « more trees and an open rooftop restaurant with lounge bar at the island for food and entertainment ».
- **More trees:** palms and green trees on the island's hill and round its houses, as in the photos, and more palms along the Almadies' beach, outside the boats' clear zones.
- **The rooftop restaurant (`TRAVERSEE_SITE.island.rooftop`):**
  - It is the island's landmark above the landing beach, where the path from the boat ends. It faces the sea, so the boat sees it arriving.
  - The ground floor holds the kitchen and a shaded front. An outside stair climbs the west wall.
  - The roof is an open terrace under a pergola and shade sails. It has three tables of four, a lounge of low sofas round a low table, the bar along the back with its barman, the DJ's corner, a balustrade, plants, and strings of warm bulbs lit at night.
- **Its life:**
  - Diners at lunch, more people from the evening, and the bar and the lounge busy at night.
  - The DJ plays, with a few dancers in front of the booth in the evening.
  - Its music is heard from the boat at the island.
  - The people are the reusable crowd's cheap figures (`src/crowd/crowd.ts`), seen from the boat.
- **Not in this slice:** the player can't step off the boat onto the island yet. Eating and dancing there yourself would need part of the island to be walkable, and that is a later slice.

## What the player does (version 1; boarding and landing as changed above)
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

### As built (version 2, beyond the contract)
- **The boats on the sand:** both rest at their own `beach` pose, run up bow first: the bow lifted 0.045 rad, the hull raised 0.05 m, the rocking cut to about a tenth. The boat not in use never moves.
- **Pushing off and landing:** each leg goes 14 m straight back, stern first (the first 2 m by hand), turns round in a 3.5 m half circle toward its clear zone's open side, crosses through `route`, and comes in bow first from 10 m out, braking. The chaloupe lands 1 m further up the island's beach than the pirogue (`islandPose(length)`), so both bows reach the sand.
- **The customers:** they wait on the sand, put on a life jacket where they stand (1.2 s), walk down, wade out alongside the hull and climb in over the gunwale near the bow (the model's `step`), one at a time. Landing, they step down into the shallows, wade ashore and take the jacket off on the first dry sand. The feet follow the world's wet sand (`beachSandY`) and wade to 0.45 m at most.
- **The life jacket** is no new mesh: `setVest(on)` (`src/actors/humanoid.ts`) swaps the garment on the trunk to a vest version of its own geometry painted orange. It costs no draw call (10 / 10 per body with or without it). Meshy bodies have none; the customers all use the default body.
- **The cameras:** boarding from up the sand behind the bow, down the boat's length to the island (the owner's photo 1); arriving over the helm and the seated heads toward the beach (photo 3), for the last 36 m and each landing.
- **« Arrêter » or a reload in the middle of a crossing:** the player is set down on the sand by the anchor, both boats are back on the beach, and an unfinished leg pays nothing.
- **Timings, headless:** a pirogue round trip about 147 s (boarding 25, out 37, landing 9–12, boarding back 20–23, back 37, last landing 13–14); the chaloupe about 124 s.
- **The world (lane W2):**
  - **The mainland beach:** the dry sand stops 3.5 m from the water; a band of wet sand slopes gently into the sea under the beached bows. The old opaque « surf line » is gone; the foam is part of the translucent turquoise shallows along the beach and round the island (one mesh, one draw call, fading at night).
  - **The bay:** six white launches with consoles and outboards, five at anchor, one at the pontoon; more pirogues drawn up on the beach, all outside the boats' clear zones and away from the waiting spots.
  - **The island's landing beach:** no jetty; sand sloping about 1 in 12 into the sea; dark rocks in the water either side; parasols in orange, pink, red, blue and teal over plastic tables and chairs, loungers; three beach-restaurant shacks; houses in red, ochre and yellow behind low stone walls; dense palms and leafy trees, and 18 more palms along the mainland beach.
  - **The rooftop restaurant and lounge bar, « Sunu Toit »:** on a level plinth above the beach, facing the sea, its name on the roof's front edge; the kitchen behind a warm ochre wall, the shaded front on pillars, the outside stair; on the roof a pergola, two shade sails, a balustrade, potted plants, the three tables of four, the lounge's sofas, the bar, the DJ's booth, and strings of warm bulbs whose light pools on the terrace at night.
  - **Budgets:** the island 7 184 triangles (Low 3 856), the launches 1 272, the shallows 1 560; the island, the restaurant and the trees in the hub's batches.
- **The rooftop's life (lane R, `src/venues/islandRooftop.ts`, `src/venues/rooftopPlan.ts`):**
  - Open 11 h to 1 h. Lunch: 5 to 9 diners and the barman. Afternoon: a few at the lounge and the bar. Evening: the tables nearly full, the lounge full, 2 to 4 at the bar, the DJ from 19 h and 2 to 4 dancers from 20 h. Late: the lounge, the bar and the dancers. The same people for every player on the same day and hour.
  - The people are the reusable crowd's instanced figures: 2 draw calls with 9 or 26 people, never a full humanoid. Drawn within 200 m and when the roof is in view.
  - The music is La Vague's own track on the game's audio bus: soft and muffled by day, louder with the beat clear once the DJ plays; full within 40 m of the roof and silent beyond 110 m (not heard on the mainland); none while closed, with the sound off or before the first touch.
  - Debug: `__dakar.islandRooftop()`. The Almadies also keep the older interior rooftop « Terrasse de Ngor » on the mainland; the two are different places.
- **The VTC points, the minimap, `PlaceSpec.closedWhy`, `Venue.camera/active/safePlace`, and the gesture measurement moved to Soumbédioune** are as in version 1.

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

## Results
**How they were obtained:** headless Chromium with a software renderer (SwiftShader) on a 4-core container, phone pages at 390×844 with real touches. None of it is a measurement from a real iPhone.

### Version 2, on `a801174` (the integrated lanes) and `c1d2c76` (the restaurant's sign)
| Check | Result |
|---|---|
| `npx tsc --noEmit`, `npm run typecheck:server`, `vite build` | 0 errors |
| `npx vitest run` (the whole suite) | 200 files passed, 1 skipped; 2 440 tests passed, 3 skipped, 0 failed (on both commits) |
| `scripts/check-traversee.mjs` (the acceptance, a phone page) | 37/37 passed, no page errors |
| `scripts/check-phone.mjs` | 69/69 passed |
| `scripts/check-ui-consistency.mjs` | 95/95 passed |

The acceptance plays a pirogue round trip by taps (the jackets on the sand, the wading, the climb aboard, pushing off stern first, the bow run up the island's beach, each leg paid once on arrival, the jackets off ashore), unlocks and plays the chaloupe, reloads in the middle of a crossing (the player on the sand, both boats on the beach, nothing paid), checks that no crossing runs at night, that the quay offers no fishing and that Soumbédioune still does.

Pictures: `docs/proof/traversee/v2` (the crossing at lunchtime and the island at night), `crossing2` (the acceptance's own), `world2` (the world lane's, staged), `references` (the owner's photos).

### Performance against LD2.0-B (`21f0337`)
**Setup:** solo builds served locally; a phone viewport; the player placed and turned the same way; two runs per build.

| Place | LD2.0-B: draw calls / triangles / fps | La traversée v2 |
|---|---|---|
| The anchor on the sand, facing the island, 13 h | 34 / 92k / 8.5 · 33 / 92k / 8.3 | 53 / 108k / 6.4 · 43 / 109k / 6.4 |
| The anchor, 21 h | 41 / 94k / 8.3 · 37 / 93k / 8.3 | 49 / 114k / 6.6 · 47 / 113k / 6.9 |
| The quay from the block, 13 h | 51 / 106k / 5.7 · 44 / 101k / 6.0 | 61 / 126k / 4.2 · 60 / 136k / 4.7 |
| The beach east, 13 h | 35 / 92k / 8.9 · 55 / 106k / 7.9 | 38 / 108k / 7.0 · 58 / 119k / 6.3 |
| Pikine's avenue (control) | 69 / 173k / 4.1 · 64 / 168k / 4.3 | 61 / 164k / 3.8 · 64 / 168k / 4.0 |

During a pirogue crossing at lunchtime (one run): boarding with the customers wading 70 / 126k / 3.4; mid-way 62 / 109k / 8.8; arriving at the island with the rooftop open 60 / 117k / 6.4; landing on the island's beach 70 / 121k / 7.6; the island's beach at 21 h, the rooftop busy and lit, 72 / 123k / 6.6.

**What it costs:**
- At the anchor, the customers waiting on the sand (about 10 draw calls each, the game's usual person), the boats on the beach, the shallows (1) and the island's dressing (about 16k triangles more where the island is in view). It is lighter than version 1 at its pier's end (77–80 draw calls).
- During a crossing, at most 72 draw calls, well under the phone budget of 180 (`docs/PERF_EVENING.md`). The heaviest moment is the boarding, with four customers in jackets near the camera.
- On the software renderer the anchor's frame rate drops by about a quarter; Pikine's control is unchanged.

## Later slices (not in this one)
- Buying a pirogue or a chaloupe (`src/economy/assets.ts`, credit), with no share then.
- Walking on the island.
- Other players seeing the boat.
- « Mes pistes » pointing at the traversée.
- Steering the boat by hand.
