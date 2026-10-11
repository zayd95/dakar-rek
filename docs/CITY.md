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
- **The gate's pedestrian zone** (`gatePlaza` in src/arena/exteriorRules.ts) is the street in front of the gate with
  both its pavements, between the stalls' outer edges with a margin, and the apron up to the gate. The world's crowd
  barriers stand across that street at all hours, with the stalls and, on fight evenings, the drummers and the queue.
  No vehicle drives or stops there, at any hour:
  - neither Ligne 23 route takes that street (TRANSPORT.md);
  - the decorative traffic never takes it, by day too (a permanent `trafficClosures.more` entry for the arena's hub);
  - the evening flows, the arrivals' taxis and the gala road keep out;
  - the player's car stops at the zone (`transport.obstacles(out, kind)`); their moto still reaches its guarded place
    beside it.

  The fans come from, and the crowd goes to, the pavement corners at the street's two ends (`streetEnds`), never a
  junction's carriageway where Ligne 23 turns or the gala road's agent stands. `__dakar.arenaPlaza()` lists the zone
  and the car rapides and decorative cars in it now (none). Checks: tests/gatePlaza.test.ts, and step 11 of
  `scripts/check-gala-traffic.mjs` (each moment over a whole loop, with a look at the gate).
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

## The gala-night road (Pikine)

`src/city/galaTraffic.ts` draws it, `src/city/galaRules.ts` decides it (pure, `tests/galaTraffic.test.ts`). It is the
road that comes in to the arena from the east, to the junction at the arena block's north-east corner (60, −60), 30 m
from the gate. Every position is a function of the shared clock (seconds of server time; one city hour is one real
minute) and of `galaSeed(hub, day)`, a sibling of the bout's seed, so every player sees the same cars at the same
places. It follows the arena's street (`arenaExterior.phase()` and `size()`, debug forces included): arriving while
the doors are open, leaving after the result, nothing on a quiet evening.

- **Thickening from the doors.** From 16 h 45 a thin queue waits at the junction (one car a column). The jam forms in
  its window, 17 h 36 – 18 h 06 on a gala night (about half an hour later on a weekday card), and lasts 1 h 12 – 1 h 42
  (a card: 36 – 54 min), with a quarter-hour ramp at each end (`jamWindow`, `jamLevel`). It drains by 21 h 30.
- **The jam.** Three columns of the kit's cars on the carriageway, kerb to kerb, 3.4 m apart (`galaGeo`, `jamLayout`):
  5 / 4 / 3 cars a column at its thickest (high / medium / low). The pavements stay the walkers' (src/crowd/streetPlan.ts
  `PAVE`), and the cars stop short of the crossing. Each column is a timeline (`JamTimeline`): cars join its tail from
  the east edge, one a second at most, while the column is shorter than the jam's depth then. They are let through at
  its front, two a column a cycle, only while the agent lets the jam go (`releaseTimes`). Events fall on whole
  seconds and on the release times of the shared clock, so the same cars stand in the same places whatever the frames.
  The front cars turn right, up the north road, away from the gate road (`releaseRoute`).
- **The agent.** A traffic agent in a hi-vis vest stands in the junction's middle, clear of every lane, from 16 h 45 to
  the end of the evening (`agentOn`). On a 26-s cycle of the shared clock (`agentPhase`) he faces the jam, a flat hand
  up, for 16 s: the moto-taxis, the taxis and the people crossing go. Then he turns to the north and sweeps the jam's
  front cars round for 10 s. His whistle marks each change. He is solid for drive mode.
- **Filtering.** The gaps between the columns are 1.46–1.70 m: a Jakarta (0.84 m) rides through either gap, a car
  (1.78 m) fits through none (`filterLanes`). The jam's cars near the player are solid for drive mode through
  `transport.addObstacles` (the same box test as the car rapides), so the player's moto filters through and their car
  stops at the tail. On foot the jam is scenery, like the rest of the decorative traffic.
- **Moto-taxis.** Jakarta moto-taxis, each with a fan on the back, ride in along the north gap (`motoRoute`,
  `motoTrip`), wait beside the front cars while the jam goes, and cross the junction north of the agent to a drop-off on
  the gate road's north lane, east of the stalls and the moto parking. There the fan steps off and walks to the queue's
  tail, taken from the arena arrivals' walker pool (`crowd/arrivals.ts spawn`, no new humanoid). The moto-taxi turns
  round, waits before the junction if the jam is going, and leaves along the south gap. About 7 / 5 / 3 are on the
  road at once at the rush, fewer at quiet hours (the arrivals' curve).
- **Car rapides.** The Ligne 23 evening cars (`23s`) carrying fans (`transport.lineCars`, fans aboard per car) have one
  or two of them on the rear step beside the apprenti (`stepSpot`): Baobab green with yellow stripes, Teranga red with
  white. Each holds the bar, and near the arena the other arm goes up. Close to the arena they toot
  « tiit-tiit-tuuut » (`rapideHorn`, once in a 7-s slot at most).
- **Horns.** The jam's cars sound their horns in one-second slots of the shared clock (`hornAt`): about one every
  3.5 s at a gala's thickest, one every 9 s on a card. The sound fades out by 70 m (`hornVolume`, src/city/galaAudio.ts,
  synthesised). There is no sound before the first gesture, with the sound off, or indoors.
- **After the result.** The jam faces east from the junction (its front 34 m further on). It is fed from the parking
  along the arena, up the road on its east side, only while the agent lets the jam's side go (`feedOpen`), and its front
  cars leave east. Taxis come to the rank at the corner's kerb north of the junction (`rankRoute`, 3 / 2 / 2 places). Two
  of the crowd walk out of the gate to each taxi, and it leaves south through the junction's west lane as the jam's
  side goes, never across the moto-taxis. The moto-taxis come for fans at their drop-off: one walks out of the gate to
  each. The crowd's walk to the 23s « Arène » stop and the riding home stay the street crowd's
  (docs/CROWD.md « After the gala »).
- **A weekday card** is the same evening at 40 % (`SIZE_SHARE`, as the exterior and the street flows): 2 cars a
  column at most on high, about 40 % of the moto-taxis, one rank taxi, one fan on the step (none on low), fewer horns.
- **Kept clear.** The decorative traffic keeps off the gala's roads while the evening runs (a `trafficClosures.more`
  closure): the east approach, the north road, the road down the arena's east side. Road events never land there
  (`busyEdges` → `galaRoads`). There is no parking on the jam's stretch or at the rank's kerb (`clearKerb`).
- **Night.** Each vehicle shown has an invisible proxy carrying the kit's spec, so src/city/night.ts lights its
  headlights and tail lights. The jam's are marked `userData.engineOn`: standing in the jam with the engine running,
  they keep their lights. night.ts skips a hidden vehicle (a pooled proxy not in use, a parked line) before any
  matrix work.
- **Cost.** Each car look is one instanced mesh for its body and one for its glass. The taxi is always a look; low and
  medium have 2 looks, high has 3. The moto-taxis are one mesh with the fan and one without. The rank taxis share the
  taxi look. At most 6 draw calls on low and medium, 8 on high plus 3 in its shadow pass (only high's car bodies cast a
  shadow). The agent and the step riders are humanoids under the shared crowd budget. The road is drawn while the
  camera is within 190 m of the junction, not indoors, not from inside the arena's walls. The update replays at most
  the evening's six minutes of events once, then a few events a second.
- **Debug.** `__dakar.gala.info()` returns the mode, level and depth, the agent, the jam's columns and cars, the gaps a
  moto and a car find, the moto-taxis, the rank, the riders, the counts (fans off and on, horns, whistles) and the draw
  calls. `gala.force('in' | 'out' | null)` sets the mode (undefined: follow the street again). `gala.size('gala' |
  'card' | null)` sets the size. `gala.probe('moto' | 'car', z)` drives drive mode's own step straight through the jam
  as it stands. Browser check: `scripts/check-gala-traffic.mjs` (not run yet).

## The city at night

`src/city/night.ts` draws it, `src/city/nightRules.ts` decides it (pure, `tests/night.test.ts`). It follows the sky's
darkness (`nightOf(daylight(hour))`, the ramp main.ts already uses for the lamps and facades) and the shared clock, so
everyone sees the same lamps out and the same floodlights on. Off indoors.

- **Street lamps.** The hub's warm light pools and bulbs (`src/world/builder.ts`, one merged mesh each) get a colour
  per lamp: a soft halo round each working bulb (one point-sprite draw call), each lamp its own warmth, about one in
  fourteen out (dark pool, dim bulb) and one in twenty flickering (stutters and short cut-outs on its own rhythm). The
  lamps on the way to the arena gate are all on and those round the arena brighter. No real lights.
- **Vehicles.** Every kit vehicle under `ctx.extra` (traffic, car rapides, taxis, motos, the fight-evening flows, the
  player's own) that moved in the last 20 s shows warm headlights and red tail lights (one point-sprite draw call for
  up to 72 vehicles within 140 m; the kit's own lamp emissives light up as before). Parked ones stay dark. The sprites
  are placed in `scene.onBeforeRender`, after the traffic moved, so they never trail the car.
- **The arena.** From the doors (17 h) to just after the close (23 h 30), once dusk falls (from about 17 h 45, full
  by 18 h 15): the four masts' heads blaze, faint beams fall onto the ring, a haze glows over the walls (seen from the
  street round the arena) and the ring is washed in light. One real `SpotLight` (`arena_spot`, made once at start so
  no material recompiles; not on the low setting) lights the ring and the stands; four draw calls for the rest.
- **Shops and kiosks.** The stocked shops of the city (`userData.shop` with an open front) show a warm lit room behind
  the front (inside faces of a box, additive) and a pool of light on the pavement; the kiosks, gargotes, cafés,
  restaurants and the Dibi glow at their counter while they are open (`LEGACY_TAGS` hours: the cafés go dark at 22 h,
  the Dibi stays lit until 2 h). The shops' sign glow is unchanged. Three draw calls.
- **Budget.** About nine draw calls in all (fewer by day: everything hides), one real light. Debug:
  `__dakar.night.info()`, `__dakar.night.force(night, hour?)` (null to follow the clock).

## Contracts touched

- `GameCtx.travel(dest, at?, label?)`: go to another hub with a short fade; the caller charges any fare.
- `LineDef.runs(day, hour)`, `LineDef.fill(day, hour)`; `passengerPatterns(…, fill)`; `StopPeople.hideAll()`.
- `trafficClosures.more` (a set of closures next to the arena's), `streetLevel` (weather's share of walkers and cars,
  car pace) in `src/actors/npc.ts`; ambient life multiplies its hourly shares by it.
- `Sky.overcast(c, night)` and the weather in `updateLighting` (main.ts).
- `openLanePath` (open routes) in `src/transport/route.ts`.
- `transport.addObstacles(fn)` (other systems' solid vehicles for drive mode), `transport.lineCars(line)` (a running
  line's cars: body, place, heading, speed, fans aboard), `arenaExterior.phase()` / `size()`, `arenaArrivalsNow()`
  (src/crowd/module.ts: the arrivals' walker pool), night.ts's `userData.engineOn`.

## For the other lanes

- `transport.dwellingAt(stopId)` — the car rapide standing at a stop now (`stop:<line>:<stop>` or `<line>:<stop>`):
  its id, its rear door in the world, the seconds it still waits; null when none or its line does not run now.
  `transport.served(stopId)` — whether the stop is served now (Ligne 23's day stops are not on fight evenings).
- Groups under `ctx.extra` (draw-call breakdown): `arena_streets` (fight-evening vehicles, fans, parked cars),
  `weather` (`wet_roads`, `puddles`, `rain`), `street_vendors`, `road_events`, `taxi:rank` (sign), `taxi:waiting` and
  `vehicle:<hub>:taxi:*` (taxis), `gala_traffic` (the gala road: `gala_<look>_body` / `_glass`, `gala_moto*`, light proxies), `night_lamps`, `night_vehicles`, `night_arena`, `night_shops` (the night; the light
  `arena_spot` is on the scene). Every humanoid added here is a `humanoid_v2` under `ctx.extra`, so the shared crowd
  budget (`src/actors/crowdLod.ts` ForeignBodies) covers them.

## Checks

- Unit: `tests/galaTraffic.test.ts` (the schedule and the 40 % card, the agent's cycle, releases only while the jam
  goes, the jam on the carriageway and off the crossing, a moto through both gaps and a car through none with drive
  mode's own step, the same jam whatever the frames, no car into another or the agent, the moto-taxis' trips, the
  rank, the step spots, the kit's sizes, road events kept off; the module on the real Pikine hub: routes clear of walls,
  instanced draw calls, light proxies, solid jam, the card, the outflow, quiet).
- Unit: `tests/taxi.test.ts` (sides, fares, kerb spots, routes out and in, open lane paths, the evening line never
  crosses the queue), `tests/city.test.ts` (arena rush curves, card vs gala, fuller cars, weather days, showers and
  drying, rain on the street, road events off everyone's routes and at fitting hours, vendors' hours),
  `tests/night.test.ts` (lamps out and flickering, the floodlights' window on the clock, vehicle lights, shop washes,
  kiosk hours; the module on the real Pikine hub: groups, draw calls, one light, all off by day).
- Browser (run by the integrator's queue): `scripts/check-taxi.mjs` — 26/26 desktop + phone on 7cba20c; `scripts/check-city.mjs`
  — 25/26 on 7cba20c (one desktop drop-off missed after a long frame, fixed in 7b9aaac: a taxi now stops at the kerb
  even when a frame carries it past). Then: `scripts/check-taxi.mjs` (evening line and its Arène stop, no car through the queue, the rank, fare shown and
  paid once, the ride out, the front-seat view, into Almadies, out at Ngor, reload mid-ride), `scripts/check-city.mjs`
  (drop-offs and fans, vehicles on the road, parked cars, the evening line, draw calls at the peak, pick-ups after the
  bouts, an ordinary morning, a shower and the wet streets after it, a coffee from a vendor, today's road event).
  `scripts/check-night.mjs` (not run yet: the floodlights on after dark and off by day, the spot light, lamps out and
  flickering, lit shops and open kiosks, moving vehicles' lights, the night's draw calls, a street at night in the
  quality's budget; screenshots from the street to the arena, the ring, a street).
  `scripts/check-gala-traffic.mjs` (not run yet; desktop medium and phone low). It checks the thin queue and the agent
  at the doors, the jam in its window with its two moto gaps and none for a car, the agent's cycle and whistle, the
  front cars sent north, the player's own moto ridden through the north gap past the tail, drive mode's probe of a
  car stopping at the tail, a moto-taxi's fan stepping off and walking to the queue, fans on a 23s car's step, horns,
  the weekday card at about 40 %, the outflow (the jam facing east, taxis at the rank, fans walking out to them),
  quiet the next morning, the draw calls and the page errors. Screenshots: the jam from the junction, the agent,
  filtering, the step, the rank.

## Not yet

- The arena's own crowd (`src/arena/exterior.ts`) and these fans are separate systems; they meet at the queue's tail.
- No police interaction (a checkpoint is scenery that closes the road to the decorative traffic).
- Taxis are for the player only (no NPC passengers seen getting in at the ranks); no clando shared rides yet.
- Traffic lights do not exist, so vendors do not walk between cars at a red light.
- The gala road's jam is solid only for drive mode. On foot it is scenery, like the decorative traffic, and the
  moto-taxis are scenery for the player's moto too. A car may still get round the jam over the pavement. The other
  systems' taxis (the arrivals' pick-ups on the north road, the street flows) are not synchronised with it, so a rank
  taxi may rarely meet one.
- At night the headlights are glowing sprites: they throw no light on the road ahead, and the lamps light the ground
  only through their painted pools (no per-lamp real lights, by budget).
