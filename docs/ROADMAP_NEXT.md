# Next phase: one life, five districts (documented only, not built)

The unified beta (branch `integration/unified-beta-20261022`) makes the phone the player's life hub, keeps a home, a car
and a run of days across sessions, and gives each district one strong activity (VTC and Tiak Tiak, the Dibi grill, La
Vague, the mosque, the arena). The next phase gives each district **a reason to come back**, built on systems that
already exist. Nothing below is implemented in the beta.

Principles carried over from the beta: work and play pay in game money only; no reward for repeated taps or app
reopening; streaks count meaningful in-game days; every new place has a door, a sign and a shortcut in the phone's
« Carte »; nothing breaks save v6 (additive fields, the extras backup for anything an older client drops); mobile first
(a new district's draw calls and triangles are measured against `scripts/perf.mjs` before it ships).

## 1. Pikine — social life of the quarter
- **What:** the street as a place to meet: attaya circles at the corner, the grand-place in the evening, visits to
  neighbours, the family's room as a real place (asking to sublet it, the conversation the beta leaves for later).
- **Built on:** NPC relationships and regulars (`docs/M1C-REGULARS.md`, `docs/M1C-SOCIAL.md`), the Cité Jàmm, the
  family room flag (`chambre:rendue`), multiplayer presence (sit together, greetings).
- **First slice:** an attaya circle with two regulars that remembers the player; a family conversation that can say yes
  to subletting « Ma chambre » (then, and only then, a rent line).
- **Risks:** text volume and Wolof quality (review with native speakers); NPC density on phones.

## 2. Corniche — football
- **What:** the beach and street football of the Corniche at the end of the afternoon: pick-up games, a small weekly
  tournament, the walk back along the sea.
- **Built on:** the kickabout prototype (`tests/kickabout.test.ts`, `tests/football.test.ts`), the Corniche corridor and
  stops, the crowd system.
- **First slice:** a 3-a-side pick-up game with NPCs, one tap to join, a result card (no stars), and a streak day if it
  is played to the end.
- **Risks:** ball physics on low-end phones; readable controls with the beta's simplified HUD.

## 3. Magic Land — the amusement park
- **What:** a family outing: a few rides seen from the queue and from the seat, snacks, photos for the phone.
- **Built on:** the seat and ride systems of transport (boarding, seated poses), venues and tickets.
- **First slice:** the entrance, one ride (seated, animated, cancellable), a photo saved to the phone's history.
- **Risks:** a new location's draw calls; the place's real name and look must be checked for permission before use.

## 4. Plateau and Médina — business
- **What:** the commercial heart: a stall or a shop that grows from the ventures ladder, suppliers in the Médina,
  deliveries across districts, credit with a real lender character.
- **Built on:** ventures and the assets model (`src/economy/assets.ts`, `business.ts`), Tiak Tiak tours, the credit
  system (`src/economy/credit.ts`), the road graph.
- **First slice:** buy stock in the Médina, sell it from a Plateau stall over an in-game day, see the margin in « Argent ».
- **Risks:** money balance with VTC and Tiak (no easy farming); the ledger stays on the device until a server ledger exists.

## 5. Almadies — nightlife
- **What:** the evening: the seafront terraces, a club night, driving home late with the city lit.
- **Built on:** the La Vague dance and its music sync (beta), the night lighting and night rules
  (`src/city/night.ts`), the in-car radio, the VTC night fares already capped.
- **First slice:** an evening at one terrace with music, a dance-floor moment synced to the track, a VTC request on
  the way out.
- **Risks:** audio licensing (only recordings the project owns or may use); night performance on phones.

## Order and size
1. Pikine social (smallest new geometry, biggest daily-return effect).
2. Plateau/Médina business (deepens the economy the beta already has).
3. Corniche football.
4. Almadies nightlife.
5. Magic Land (new location, permission check first).

Each one ships the same way as the beta's lanes: an isolated branch, unit tests for its rules, a browser journey on a
phone viewport, before/after measurements, and a short write-up with what was not done.
