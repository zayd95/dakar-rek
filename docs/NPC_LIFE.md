# NPC life — the city lives by place, time and day (Wave 1, NPC & Social lane)

**What the player sees.** Customers arrive at the gargotes, wait at the counter to be served, sit down to eat with a
plate in front of them and leave; people wait under the car rapide shelter and board; vendors work their stalls at
Sandaga, shoppers stop in front of them; fishermen unload at Soumbédioune and buyers crowd the fish market; men stand in
rows at the mosque at prayer times (presence and posture only — Friday's Tisbar is fuller); an attaya circle forms on
the grand-place in the evening, others watch the dames, benches fill up; pairs chat on street corners; joggers run the
Corniche in the morning and the evening, walkers stroll at sunset; football on the Fann pitch after work and on Sunday
morning; the Dibi is busiest on Saturday night. Late at night the street empties (fewer walkers, fewer cars), the Dibi
still has a few tables. Everyone can be greeted (« Saluer », « Demander son nom ») — except people praying.

## How it works

| Piece | File | Role |
| --- | --- | --- |
| Scheduler (pure) | `src/social/ambient.ts` | Activity and spot types; level of an activity by hour and day; head counts per spot (stable per ten minutes, capped by the spot's places, shared between activities of a spot); population trimmed to the nearest spots; seat choice rules; prayer rows (qibla), rings and pairs of standing places. |
| Data | `src/social/ambientData.ts` | The activities (where by spot tag, hours, days, pose, clips, stay, group size, density, look, serve time, props), prayer windows, tags for place types and legacy places, walkers/traffic by hour, budget per quality. |
| Spots | `src/social/ambientSpots.ts` | Turns the hub into spots: **any registered `PlaceSpec`** (type → tags, anchors → standing places, nearby seats, hours), legacy places of the builders (skipped when a registered place of the same family sits there), landmarks (mosque forecourt, pitch), the sea front, remaining benches and interior seats, street corners. Derives seats for street furniture the builders draw without registering (kiosk benches, Maïga bench, dibiterie chairs, station and gym benches). |
| Runtime | `src/social/ambientLife.ts` | The `GameModule` (registered in `src/game/modules.ts`): actors arrive on the sidewalks (`routines.ts` paths), queue, sit, stand, ride, jog, roam, leave; seat occupancy through the shared `Seats`; pooled bodies; far figures; debug hooks. |
| Crowd LOD | `src/actors/crowdLod.ts` | Frustum culling for humanoids, instanced far figures, and the same budget applied to the other systems' humanoids (walkers, placed people, cast, apprentices, monument life). |

Adding life to a new place needs no code: register a `PlaceSpec` whose `type` is in `PLACE_TAGS` (or add the type
there), with seats near its anchors (or in its space); `peaks` make it busier in its windows. A room of `prayer` seats
(the venues' mosque hall) is filled at prayer times by people holding the seat's pose (`Seat.clip`, Kneel), like the
venue's own congregation; prayer seats without a pose are stood on. `vehicle` seats near a `stop` take people who board
(they follow the seat while it moves and leave when it is removed). Anchors in another space than their place (a
mosque's hall) do not make standing places in the street. New behaviour = one line in `ACTIVITIES`.

Merged with `integration/living-dakar` (Wolof, assets, transport, venues, gestures): the venues' Dibi, Grande Mosquée,
Soumbédioune and Salon Awa and the transport stops are populated through their `PlaceSpec`s and seats; the legacy
spots and derived furniture seats of the lots they took over step aside. Their own roles (cook, imam, congregation,
passengers) count as characters on seats, so the free-seat share holds for everyone together.

## Rules kept

- **Seats.** Ambient people take seats only through `seats.occupy(id, 'npc:amb:<n>')` and release them when they stand
  up. Never a taken seat (player, remote player, cast, placed people, venue roles, passengers); never a seat within 2.6 m of the player or ahead
  of the player while they walk toward it (9 m cone); someone still walking to a seat gives it up when the player gets
  there first. Non-player characters together never hold more than `seatCapacity(n)` of a place's seats: at least one
  and ~a third stay free. Cast members' seats for the current hour are held for them (`npc:cast:<id>`). The density
  check verifies there is no orphan seat and no over-full place at every capture.
- **No walking through walls.** Every walk is a sidewalk path checked against the hub's colliders (`collidersClear`,
  shared with `NpcLife`); a person who cannot get there cleanly does not walk (settled out of sight, or gives up).
  Seats with a table in front are approached from behind or the side. Inside rooms, only straight or one-turn paths
  that miss the furniture.
- **Mosque.** Rows of people facing the qibla during the five prayer windows (the venues' times, `src/venues/prayer.ts`):
  standing on the forecourt, kneeling on the hall's prayer rows; more on Friday; no text, no recitation, not offered a
  conversation.
- **Places that come and go.** The spots are rebuilt whenever a place is added or removed (a street vendor's hours, a
  shop, a road event). People stay through a rebuild when their spot keeps its id and their seat, standing place,
  prayer-row place or queue place is still where it was (`keepsPlace`): a market crowd or a prayer row does not vanish
  because a vendor set up a tray down the street.
- **Focus.** Ambient people rank after places, the cast and seats in reach (focus bias 3 m): a passer-by never hides
  the counter or Tonton Ibou; someone alone can be greeted.
- **Player first at the counter.** Standing places keep 1.8 m from every interaction anchor, so the player's focus never
  lands on a customer instead of the counter.

## Density budget (per quality)

| | Low | Medium | High |
| --- | --- | --- | --- |
| Ambient people simulated | 26 | 44 | 64 |
| Pooled animated bodies (ambient) | 6 | 10 | 14 |
| Full body within | 26 m | 36 m | 50 m |
| Far figures within | 70 m | 95 m | 120 m |
| **All animated NPC humanoids (every system), nearest first** | **12** | **20** | **30** |
| Density factor | 0.6 | 0.85 | 1 |

Each animated humanoid costs ~10 draw calls (+10 in the shadow pass); a far figure is one instance of one draw call for
all of them. Spots beyond `plan` (110/130/150 m) are empty; beyond `near` they get half the people. Animation updates
every frame within 16 m, every other frame beyond. Bodies outside the camera are culled (`cullHumanoid`).

Performance: see `docs/perf/npc-density-*.json` and the table below (`scripts/perf-npc.mjs`, fixed walks, phone
viewport, SwiftShader: compare builds only).

| Quality | Walk | Draw calls before (avg / max) | after | Triangles | Animated humanoids drawn (incl. the player) | Frame ms avg / p95 (SwiftShader) |
| --- | --- | --- | --- | --- | --- | --- |
| low | pikine 13.2 h | 180 / 206 | **52 / 85** | 146k → 77k | 16 (max 16) → **5.4 (max 9)** | 833.4 / 1600.1 → 681.6 / 1337.8 |
| low | pikine 20.3 h | 201 / 231 | **56 / 72** | 161k → 79k | 17.9 (max 19) → **9.3 (max 13)** | 847.9 / 1936.8 → 639.7 / 1993.5 |
| low | plateau 19.2 h | 147 / 167 | **50 / 62** | 106k → 54k | 12.6 (max 14) → **5.6 (max 9)** | 814.1 / 1591.6 → 751.7 / 2578.7 |

Same walk at **Medium** before the change (baseline build): 240 draw calls on average (max 278), 22.4 animated
humanoids. After, on the density check's desktop captures at Medium (fixed cameras, 7/13/19/23 h): 69–182 draw calls with
at most 12 full NPC bodies (budget 20) plus 7–35 far figures — while the street holds more people (up to 36 ambient
people around the player instead of none). Before the change, standing at each hub's spawn at 13 h (Medium): 336 (Pikine,
Plateau), 406 (Corniche), 467 (Almadies) draw calls with 26–35 full humanoids drawn. Phone captures at Low: 46–111 draw
calls, at most 9 full NPC bodies (budget 12).

Frame times above were measured on a shared 4-core machine while other lanes ran browsers (load average 10–30): they are
noise-level evidence only; draw calls, triangles and humanoid counts do not depend on the load. `scripts/perf-npc.mjs`
holds the browser lock when re-run (`flock /tmp/dakar-browser.lock node scripts/perf-npc.mjs <url> <label> <out.json>`).

## Fight talk: the city around the bout

The city's people react to the evening's bout. It is built from the systems that already exist:
`src/social/fightTalk.ts` (pure, tested in `tests/fightTalk.test.ts`) and `src/social/fightTalkModule.ts`.

- **Before a gala** (Friday–Sunday, 8 h–19 h), a person greeted anywhere in the city may anticipate it: « Ce soir il y a
  gala à Pikine : Babacar contre Lamine ! ». A weekday neighbourhood card is only talked about in Pikine (12 h–19 h).
- **After the bout, that evening and the next day**, people talk about the result the city really saw:
  - the gala's result, which the arena records in the save's counters when the bout ends (`recordGalaResult`) and also
    prints on the posters;
  - or the player's own bout, from the career's record, which comes first.

  A fall is told as a fall (« Daan na ! Babacar a mis Lamine au sol ce soir ! »), a decision as a decision, a draw as a
  draw. No record means no result line: nothing is ever invented.
- **On a day without a bout and without a recent result**, nothing changes.
- **Who says it.** Everyone `ctx.people` knows (ambient life, the street crowd, the Dibi's customers, the passengers).
  After a first greeting, about half of them add the line; in small talk, the line replaces the usual exchange. The
  choice is seeded per person and per exchange. `People.setTopic` is the hook.
- **Language.** French with everyday Wolof from the lexicon (Waaw kay, Daan na, Rafet na, Ndank ndank, Bul tiit,
  Lu bees ?), glossed, with the game's typography.
- **The Dibi after the gala** (Pikine, from the end of the gala to about 1 h, on a night the arena's street was alive or a
  gala result was recorded):
  - ambient life gets `AFTER_GALA_ACTS`: a short queue at the grill and more tables of people eating and talking;
  - the Dibi spots are 1.6× busier (`ambientLife.setEvent`);
  - about one leaving spectator in six walks from the outflow to the Dibi along the pavements
    (`src/crowd/street.ts`, a walker with a goal).
- **Debug**:
  - `__dakar.fightTalk.line(name, seed)`: what a person would say now;
  - `__dakar.fightTalk.state()`: tonight's card, the recorded result, whether the Dibi night is on.

## Checks

- `npx vitest run tests/ambient.test.ts` — scheduler, calendar, seats invariants, spots from registries.
- `node scripts/check-npc-density.mjs <url>` — same streets at 7/13/19/23 h, desktop (medium) and phone (low):
  counts per place and hour, seat invariants, humanoid budget, Friday rows, the player's seat, greeting, a Dibi
  registered at run time; screenshots in `docs/screenshots/npc-density/`.
- Debug (`?debug`): `__dakar.ambient()` (who does what where, problems, budget), `ambientActors()`, `ambientSpots()`,
  `ambientDay(d)` (0 = lundi … 6 = dimanche), `ambientSettle()`, `ambientAddPlace(spec, seats)`, `humanoids()`.

## Known gaps

- **Riding.** Boarding uses free `vehicle` seats within 14 m of a stop (the density check registers a test stop and
  vehicle seats; the transport lane's car rapides are boarded the same way when they stand at a stop). A rider follows
  the seat and leaves after two city hours or when the seat is removed; no alighting animation at the next stop.
- **Derived furniture seats** (kiosk benches, Maïga bench, dibiterie chairs, station and gym benches) are registered by
  this lane until the builders or venues do it; a seat within 35 cm of an existing one is never added twice, but a
  venue lane registering its own seats *after* the first frame would get doubles.
- **Gestures.** No eating or serving clip, no prop in hand (a plate on the table only at kiosks and dibiteries); prayer
  is standing rows only (no bowing animation); football without a ball; vendors alternate Talk / Grab / Idle.
- **No local avoidance.** People keep to paths clear of walls and furniture, but walkers can pass through each other
  and through a pair chatting on a corner.
- **Other systems' hidden bodies are still animated by their owners** (only their draw calls are saved); the cast,
  walkers and placed people keep their own visibility rules on top of the budget. The apprentices of the parked car
  rapides live in the hub geometry, outside the budget (the « max 13 » at Low above is 12 NPC bodies + the player).
- Medium-quality frame times before/after along the same walk were not re-measured under the browser lock (the shared
  lock queue was hours long); draw calls and humanoid counts at Medium come from the captures listed above.
- Interiors fill only while the player is inside; arrivals in a room need a straight or one-turn clear path.
- Prayer times and opening hours are the game's own approximations (draft, to be reviewed by Habib); the city week
  (day 1 = Tuesday 6 Oct 2026) passes in under three real hours.
- Frame times come from SwiftShader on a shared CPU: they compare builds, they are not phone measurements.
