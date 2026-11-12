# Next phase: one life, five districts (documented only, not built)

The unified beta (branch `integration/unified-beta-20261022`) makes the phone the player's life hub, keeps a home, a car
and a run of days across sessions, and gives each district one strong activity (VTC and Tiak Tiak, the Dibi grill, La
Vague, the mosque, the arena). The next phase gives each district **a reason to come back**, built on systems that
already exist. Nothing below is implemented in the beta.

Each district gets **its own** reasons to visit, work, spend time and build relationships: Pikine's activities are not
copied into every hub. Extension points are added only where they fit the current code (no speculative framework).

Principles carried over from the beta: work and play pay in game money only; no reward for repeated taps or app
reopening; streaks count meaningful in-game days; every new place has a door, a sign and a shortcut in the phone's
« Carte »; nothing breaks save v6 (additive fields, the extras backup for anything an older client drops); mobile first
(a new district's draw calls and triangles are measured against `scripts/perf.mjs` before it ships).

## 1. Pikine — the arena, and the social life of the quarter
- **What:** the wrestling arena stays Pikine's signature attraction. Around it: arena-adjacent life (training
  grounds, the fans' gatherings before a gala, the stalls on fight nights) and the street as a place to meet: attaya
  circles at the corner, the grand-place in the evening, street relationships with neighbours, the family's room as a
  real place (asking to sublet it, the conversation the beta leaves for later).
- **Built on:** NPC relationships and regulars (`docs/M1C-REGULARS.md`, `docs/M1C-SOCIAL.md`), the Cité Jàmm, the
  family room flag (`chambre:rendue`), multiplayer presence (sit together, greetings).
- **First slice:** an attaya circle with two regulars that remembers the player; a family conversation that can say yes
  to subletting « Ma chambre » (then, and only then, a rent line).
- **Risks:** text volume and Wolof quality (review with native speakers); NPC density on phones.

## 2. Corniche — football
- **What:** the existing football field becomes a real interactive activity: casual pick-up football at the end of
  the afternoon, small-sided matches with NPC teammates and a real score, social challenges with regulars (a rematch,
  a weekly tournament), the walk back along the sea.
- **Built on:** the kickabout prototype (`tests/kickabout.test.ts`, `tests/football.test.ts`), the Corniche corridor and
  stops, the crowd system.
- **First slice:** a 3-a-side pick-up game with NPC teammates, one tap to join, the score kept and shown on a result
  card, a streak day if it is played to the end.
- **Risks:** ball physics on low-end phones; readable controls with the beta's simplified HUD.

## 3. Magic Land — the amusement park
- **What:** a social and family entertainment destination: working attractions and rides seen from the queue and from
  the seat, recreational games, snacks, outings with friends or family, photos for the phone.
- **Built on:** the seat and ride systems of transport (boarding, seated poses), venues and tickets.
- **First slice:** the entrance, one ride (seated, animated, cancellable), a photo saved to the phone's history.
- **Risks:** a new location's draw calls; the place's real name and look must be checked for permission before use.

## 4. Plateau and Médina — business
- **What:** the commercial heart: business opportunities, shops and services to run or work in, office work and
  everyday urban employment, commercial relationships (suppliers in the Médina, clients, a real lender character), and
  an entrepreneurial progression from a stall to a shop.
- **Built on:** ventures and the assets model (`src/economy/assets.ts`, `business.ts`), Tiak Tiak tours, the credit
  system (`src/economy/credit.ts`), the road graph.
- **First slice:** buy stock in the Médina, sell it from a Plateau stall over an in-game day, see the margin in « Argent ».
- **Risks:** money balance with VTC and Tiak (no easy farming); the ledger stays on the device until a server ledger exists.

## 5. Almadies — nightlife
- **What:** the high end of the city: rooftop restaurants and lounges, nightclubs, luxury homes, high-end social
  circles; dining, entertainment and relationship opportunities; driving home late with the city lit.
- **Built on:** the La Vague dance and its music sync (beta), the night lighting and night rules
  (`src/city/night.ts`), the in-car radio, the VTC night fares already capped.
- **First slice:** an evening at one rooftop restaurant (a table, a meal, a conversation with a new circle), music
  and a dance-floor moment synced to the track, a VTC request on the way out.
- **Risks:** audio licensing (only recordings the project owns or may use); night performance on phones.

## 6. Ngor — la traversée (the owner's request, 25 Oct 2026)
- **Why:** the Almadies' « Port de pêche · Ngor » (`src/world/builder.ts`, actions `ACTIONS.port` in `src/world/content.ts`)
  repeats the fishing that Soumbédioune already gives the Corniche.
- **What it becomes:** a crossing to the island of Ngor that carries paying customers.
  - Customers wait on the quay, as VTC requests wait at a kerb.
  - The player chooses how to take them across:
    - **a pirogue:** the traditional painted boat. More seats, a lower fare, a rougher ride.
    - **a chaloupe:** the nicer launch. Fewer, better-paying customers, and a smoother crossing.
  - The customers board and sit, the crossing is played out on the water, and they step off at the island's landing.
  - The fare is paid once, at arrival.
- **Built on:**
  - The VTC passengers (`src/transport/vtc*.ts`): requests, seats, boarding and alighting, fare bands, one payment.
  - Ownership and credit (`src/economy/assets.ts`, the dealers' credit rules): a pirogue or a chaloupe is bought or
    rented the way a car is.
  - The existing sea and coast.
  - « Mes pistes » (`src/economy/pistes.ts`) may point to it once the facts are real.
- **What it replaces:** the quay's fishing actions (« Aider les pêcheurs », « Pirogue du matin ») go to, or stay at,
  Soumbédioune. Ousmane's recommendation must still lead to a real place, so it points to Soumbédioune.
  - The `peche` counter and the saves are unaffected.
- **First slice:**
  - The quay renamed « Embarcadère de Ngor ».
  - One pirogue crossing with 2–4 customers, there and back, paid once.
  - The chaloupe as the second boat.
- **Risks:**
  - A boat moving on the water with no new rendering engine: simple boat meshes over the existing sea.
  - People seated in a boat (the seat system).
  - Draw calls on phones.
- **Order:** in the next milestones, after the LD2.0-A review. The owner sets its place against LD2.0-B.

## Order and size
1. Pikine social (smallest new geometry, biggest daily-return effect).
2. Plateau/Médina business (deepens the economy the beta already has).
3. Corniche football.
4. Almadies nightlife.
5. Magic Land (new location, permission check first).

Each one ships the same way as the beta's lanes: an isolated branch, unit tests for its rules, a browser journey on a
phone viewport, before/after measurements, and a short write-up with what was not done.
