# Living city (lane `w3-city`)

Spec: `docs/SPEC_SIGNATURE_2026-10-10.md` §21, §23–27. The wave's goal is one excellent evening: work in the afternoon,
take your moto or a car rapide to the arena, watch a fight, go on to La Vague at Ngor. Everything here serves that
evening first, then the city's everyday density. No new map.

## The fight evening (Pikine)

- **Getting there by car rapide.** From 16 h to midnight (a bout every evening) the road in front of the arena gate
  holds the queue between its barriers (`src/arena/exterior.ts` closes it to traffic). Ligne 23 then runs its evening
  route (`lines.ts`, line `23s`: round the arena block, never across the queue) with an « Arène » stop on the arena's
  west side, ~30 m from the gate; the day route is parked meanwhile (`LineDef.runs`, the shared clock: every client
  agrees; a player riding a car keeps it until they get off). The evening cars are fuller (`LineDef.fill`: 85 % of the
  seats on gala nights Friday–Sunday, 65 % on a weekday card), always with seats left for the player.
- **The street.** Taxis, clandos and moto-taxis come along the arena's north road, queue at the kerb when it is busy
  (a visible jam), let their supporters out (in their écurie's colours) who walk on to the queue's tail; the moto-taxi's
  pillion steps off. After the main bout (from 22 h 24) they come back, wait at the kerb and the crowd walks out to
  them. Cars park all round the block (6 on medium, 12 on high, none on low; fewer on a weekday card). How busy follows
  `src/city/rules.ts` (`arenaArrivals`, `arenaDepartures`: a ramp from 16 h to a peak at 18 h 30–19 h 45, quiet during
  the bouts, the wave after), the evening's size (`eveningSize`: gala / card) and the rain.
- **Going on to La Vague.** A taxi rank across the road from the arena (`src/transport/taxi.ts`): « Prendre un taxi »
  lists the other neighbourhoods with the fare (shown before paying, paid once to the driver: 5 000 F Pikine → Ngor);
  the player sits in front; the taxi pulls out and drives through Pikine to the edge that faces Ngor, a short fade
  (`ctx.travel`), then it comes into Almadies from the facing side along the coast road and stops at the Ngor rank by
  La Vague, where the player gets out on the pavement. Views: behind the taxi, from the front seat, from above. A trip
  paid is a trip owed (`taxi:to` in the save): a reload mid-ride finishes it at the destination, never charged twice.
  Every hub has a rank (Ngor by La Vague; elsewhere near where people arrive), so the ride back works the same way.

## Everyday density

- **Traffic by hour.** Up to 4 / 7 / 10 decorative cars (low / medium / high) at rush hour; ambient life
  (`src/social/ambientLife.ts`, NPC lane) thins them and the walkers by hour; the weather multiplies on top
  (`streetLevel` in `src/actors/npc.ts`) and slows the cars in the rain.
- **Weather** (`src/city/weather.ts`, `weatherAt` in rules): the same sky for everyone from the city day — mostly sun,
  some overcast days, an afternoon shower about one day in six (between noon and 5 pm, an hour or two), the streets wet
  for three hours after (sometimes on the way to the bouts). The sky greys and the sun dims (`Sky.overcast`, main.ts),
  the haze closes in under rain, rain streaks fall round the camera (one draw call, not indoors), the roads darken with
  puddles (one merged overlay, two draw calls), fewer people are out, the cars slow down, fewer fans come.
- **Street vendors** (`src/city/vendors.ts`): Touba coffee (dawn and evening), cold water and bissap, roasted peanuts
  (afternoon), phone credit, at crossroads corners and beside the car rapide stops; more at the busy hours, fewer in the
  rain; they set up and leave out of sight. Each is a place of the shared registry with quick purchases (price shown,
  paid once). Fictional sellers, the game's own prices.
- **Road events** (`src/city/roadEvents.ts`): one or two a day per hub, a few hours each — a police checkpoint (cones,
  a pickup, two officers), a broken-down car rapide with its passengers waiting, an accident with onlookers, roadworks
  behind barriers, a jam at rush hour. Never on the roads of the car rapide lines, the taxis, the arena drop-off or the
  gate road, so no trip is blocked; the decorative traffic takes another way (`trafficClosures.more`), and the scene is
  solid for a player driving or walking. The same events for everyone (the city day and the hub seed them).

## Contracts touched

- `GameCtx.travel(dest, at?, label?)`: go to another hub with a short fade; the caller charges any fare.
- `LineDef.runs(day, hour)`, `LineDef.fill(day, hour)`; `passengerPatterns(…, fill)`; `StopPeople.hideAll()`.
- `trafficClosures.more` (a set of closures next to the arena's), `streetLevel` (weather's share of walkers and cars,
  car pace) in `src/actors/npc.ts`; ambient life multiplies its hourly shares by it.
- `Sky.overcast(c, night)` and the weather in `updateLighting` (main.ts).
- `openLanePath` (open routes) in `src/transport/route.ts`.

## For the other lanes

- `transport.dwellingAt(stopId)` — the car rapide standing at a stop now (`stop:<line>:<stop>` or `<line>:<stop>`):
  its id, its rear door in the world, the seconds it still waits; null when none or its line does not run now.
  `transport.served(stopId)` — whether the stop is served now (Ligne 23's day stops are not on fight evenings).
- Groups under `ctx.extra` (draw-call breakdown): `arena_streets` (fight-evening vehicles, fans, parked cars),
  `weather` (`wet_roads`, `puddles`, `rain`), `street_vendors`, `road_events`, `taxi:rank` (sign), `taxi:waiting` and
  `vehicle:<hub>:taxi:*` (taxis). Every humanoid added here is a `humanoid_v2` under `ctx.extra`, so the shared crowd
  budget (`src/actors/crowdLod.ts` ForeignBodies) covers them.

## Checks

- Unit: `tests/taxi.test.ts` (sides, fares, kerb spots, routes out and in, open lane paths, the evening line never
  crosses the queue), `tests/city.test.ts` (arena rush curves, card vs gala, fuller cars, weather days, showers and
  drying, rain on the street, road events off everyone's routes and at fitting hours, vendors' hours).
- Browser (run by the integrator's queue): `scripts/check-taxi.mjs` — 26/26 desktop + phone on 7cba20c; `scripts/check-city.mjs`
  — 25/26 on 7cba20c (one desktop drop-off missed after a long frame, fixed in 7b9aaac: a taxi now stops at the kerb
  even when a frame carries it past). Then: `scripts/check-taxi.mjs` (evening line and its Arène stop, no car through the queue, the rank, fare shown and
  paid once, the ride out, the front-seat view, into Almadies, out at Ngor, reload mid-ride), `scripts/check-city.mjs`
  (drop-offs and fans, vehicles on the road, parked cars, the evening line, draw calls at the peak, pick-ups after the
  bouts, an ordinary morning, a shower and the wet streets after it, a coffee from a vendor, today's road event).

## Not yet

- The arena's own crowd (`src/arena/exterior.ts`) and these fans are separate systems; they meet at the queue's tail.
- No police interaction (a checkpoint is scenery that closes the road to the decorative traffic).
- Taxis are for the player only (no NPC passengers seen getting in at the ranks); no clando shared rides yet.
- Traffic lights do not exist, so vendors do not walk between cars at a red light.
