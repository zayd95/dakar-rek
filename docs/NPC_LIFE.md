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
there), with seats near its anchors (or in its space). A seat of kind `prayer`/`mat` is used standing by the prayer rows;
`vehicle` seats near a `stop` take people who board (they follow the seat while it moves and leave when it is removed).
New behaviour = one line in `ACTIVITIES`.

## Rules kept

- **Seats.** Ambient people take seats only through `seats.occupy(id, 'npc:amb:<n>')` and release them when they stand
  up. Never a taken seat (player, remote player, cast, placed people); never a seat within 2.6 m of the player or ahead
  of the player while they walk toward it (9 m cone); someone still walking to a seat gives it up when the player gets
  there first. Non-player characters together never hold more than `seatCapacity(n)` of a place's seats: at least one
  and ~a third stay free. Cast members' seats for the current hour are held for them (`npc:cast:<id>`). The density
  check verifies there is no orphan seat and no over-full place at every capture.
- **No walking through walls.** Every walk is a sidewalk path checked against the hub's colliders (`collidersClear`,
  shared with `NpcLife`); a person who cannot get there cleanly does not walk (settled out of sight, or gives up).
  Seats with a table in front are approached from behind or the side. Inside rooms, only straight or one-turn paths
  that miss the furniture.
- **Mosque.** Rows of people standing quietly facing the qibla during the five prayer windows (approximate Dakar
  times, game-own), more on Friday; no text, no recitation, not offered a conversation.
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

PERF_TABLE

## Checks

- `npx vitest run tests/ambient.test.ts` — scheduler, calendar, seats invariants, spots from registries.
- `node scripts/check-npc-density.mjs <url>` — same streets at 7/13/19/23 h, desktop (medium) and phone (low):
  counts per place and hour, seat invariants, humanoid budget, Friday rows, the player's seat, greeting, a Dibi
  registered at run time; screenshots in `docs/screenshots/npc-density/`.
- Debug (`?debug`): `__dakar.ambient()` (who does what where, problems, budget), `ambientActors()`, `ambientSpots()`,
  `ambientDay(d)` (0 = lundi … 6 = dimanche), `ambientSettle()`, `ambientAddPlace(spec, seats)`, `humanoids()`.

## Known gaps

KNOWN_GAPS
