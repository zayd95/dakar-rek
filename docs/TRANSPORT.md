# Transport — the car rapide passenger experience (Wave 1, 9 Oct 2026)

« Transport is an experience, not a loading screen. » Every hub now has a car rapide line that really drives through
the streets. The player walks to a stop, waits, boards at the rear door, pays the apprenti once, sits on a free seat,
watches Dakar pass, asks to get off and steps out onto the pavement. Inter-hub travel from the station is unchanged.

## What a player can do

- **Find a stop.** Four stops per hub on the pavement (yellow « ARRÊT · CAR RAPIDE » sign with the stop and line name,
  blue shelter, bench, yellow kerb mark), with people waiting — standing or on the bench, greetable (« Saluer »).
  Lines: Pikine **Ligne 23** (Arène, Marché, Gare, Rue 10), Plateau **Ligne 5** (Sandaga, Gare, Médina, Mosquée),
  Corniche **Ligne 8** (Monument, Université, Gare, Mermoz), Almadies **Ligne 31** (Ngor, Le Mall, Gare, Almadies).
  Fictional numbers; real neighbourhood names; no company, no livery, no inscription.
- **At the stop:** « Monter dans le prochain » (the `stop` recipe's board hook) — the ride card shows the line and the
  next car's countdown; « Voir la ligne » lists every stop with its next arrival; « Ne plus attendre »; sit on the bench
  while waiting. Walking more than 9 m away stops the wait.
- **The car arrives.** It pulls in to the kerb with its rear door level with the shelter; the apprenti steps down
  beside the door calling the destinations (« Guédiawaye ! Guédiawaye ! », « Am na place ! », « Ñu dem ! » before
  leaving). People waiting walk to the door and get in; a passenger gets out and walks off along the pavement.
  Standing at the door, the car itself offers « Monter · 150 F ».
- **Board:** the fare is paid once through the universal runner (verb `ride`, wallet line « Car rapide Ligne 23 ·
  Arène », counter `car_rapide`, category `transport`), the player walks to the rear door and sits on a free seat
  (pavement side first; never a seat an NPC holds, never the cab bench).
- **Ride:** the car rapide is the shared vehicle kit's, with an open cabin: the people holding seats are drawn sitting
  there (they change at stops, never onto the player's seat). Views (« Changer de vue »): behind the car, « À ta place »
  (from your own seat, looking out of the pavement-side windows), « Au marchepied » (beside the apprenti on the rear
  step) and « Vue d’en haut »; each has a phone-portrait placement. The camera
  swings smoothly in corners, can be turned by dragging and drifts back; the body sways (roll in corners, pitch when
  braking, bumps — stronger on Pikine's sandy streets). The stick does not stand the player up. « Parler au voisin »
  gives a short French / Wolof exchange. The player's space is the vehicle (`<hub>:rapide:<line>:<k>`): targets, chat
  and presence follow it.
- **Get off:** « Descendre au prochain arrêt » (or « Descendre ici » while the car still stands at a stop):
  « Apprenti, dinaa wàcc ci Gare ! » — the card shows « Arrêt demandé », « Ne pas descendre » cancels. At the stop the
  player steps out of the rear door onto the pavement in front of the shelter; the follow camera comes back.

## Architecture (`src/transport/`)

| File | Role |
| --- | --- |
| `spec.ts` | `VehicleSpec`: passenger seats and the **driver seat** (local pose, seat-top height, yaw), doors (in / out points), camera anchors (with phone-portrait placements), cabin `open`/`closed`, crew (apprenti on the step / at the door), `drive` handling for drive mode, `build()` model. `toWorld`, `seatToWorld`. |
| `carRapide.ts` | **Adapter** on the vehicle kit (`vehicleSpec('carRapide')`): seats (the cab bench is NPC-only), the rear doorway's boarding point, the apprenti's step, camera anchors; `build({ seed, seated })` draws the NPC passengers on exactly their seats (kit option `seated`, one draw call). |
| `passengers.ts` | Fixed passenger sets per line (bounded model variants, always seats left for the player), the player's seat choice, and clearing the kerb of parked vehicles where the car pulls in at a stop. |
| `drive.ts` | Drive mode as pure logic: stick → throttle / steering, bicycle model, braking then reverse, coasting, collisions (stops at walls, slides along them, creeps out if left touching). |
| `moto.ts`, `motoModule.ts` | The Jakarta motorbike: kit spec + drive handling; the dealer corner at Garage Modou (shop recipe), purchase with confirmation, get on / ride / get off, parked where left, saved; chase view, speed card. |
| `owned.ts` | Ownership adapter until the ownership lane's `Asset` store: save flag `asset:vehicle:<id>` + counters `asset:<id>:hub|x|z|yaw|seed|price|at`, `toAsset()` mapping. |
| `route.ts` | Pure math: `lanePath` (right-hand lane around road-grid nodes, rounded corners), `Path` (arc length, smooth heading, projection, curvature), `Timetable` (speed profile with corner speeds, acceleration, braking, rest and dwell at every stop; deterministic and periodic), `pullIn` (to the kerb at stops). |
| `lines.ts` | Line data (loop nodes, stops by leg + metres, fare, fleet, calls) and the French / Wolof lines (draft for review). |
| `vehicle.ts` | `Vehicle`: model + seats (Seats registry, space = vehicle id, `locked`) + sway; `place(x, z, yaw, speed, accel…)` is the controller seam. `LineVehicle`: places a Vehicle from the timetable on the shared clock, reports stops reached since the previous frame, apprenti and calls. |
| `stops.ts` | Stop placement on the pavement (slides along the kerb when a wall or stall is in the way), merged street furniture (2 draw calls per hub), people waiting / boarding / getting off. |
| `trip.ts` | `TripLogic`: wait → board → ride → request → alight, as pure logic. |
| `camera.ts` | `PassengerCamera`: anchor views, smoothing relative to the vehicle (no lag), heading easing, drag, wall pull-in. |
| `module.ts` | The `GameModule`: lines per hub, `stop` places, targets (door of a standing car, ride controls), boarding / alighting, ride card, debug API. |
| `ui.ts`, `transport.css` | The ride card (line number, state, next stop and countdown, stop requested). |

### Shared contracts touched (small, generic, documented)

- `Seat.locked` (`src/interact/seats.ts`): a seat in a moving vehicle — the stick does not stand the player up and
  « Se lever » is not offered; the owning module gives the way out. `Seats.collect` never offers `kind: 'vehicle'`
  seats on their own (they are taken by boarding).
- `GameCtx.now()`: the shared clock in ms (server time online, device clock offline).
- `GameModule.space()`: a module's own space the player is in (the vehicle while riding) → interaction space, chat and
  presence space; street-only legacy content is not offered there.
- `GameModule.camera(ctx, dt, drag)`: drive the camera this frame (returns true → the follow camera is skipped).
- `GameModule.safePlace()`: where to save the player instead of their position (riding → the pavement of the next stop;
  on the motorbike → beside it, parked there).
- `GameModule.presenceSpace()`: presence / chat space when it differs from the module's interaction space (on one's own
  motorbike the player stays visible to the street).
- `src/actors/vehicleKit.ts`: option `seated` (exactly these seats get a baked passenger) and `spec.occupied`.
- `main.ts`: the seated branch follows the seat every frame in play, busy (and menu when locked) so the body rides
  along; module space / camera / safe place hooks; the legacy source only lists street content in the street.
- `src/multiplayer/protocol.ts`: presence accepts `<hub>:rapide:<line>:<k>` spaces of the current hub (test added).
- `src/actors/vehicles.ts`: the car rapide front strip is a band of coloured diamonds — the previous religious
  inscription is removed (owner's rule: never paint religious text on vehicles).

### Shared clock and slow frames

A vehicle's place is a function of the shared clock (`Timetable.at`), so every client sees the line's cars at the same
spots and two players riding the same car share its space. Walks (to the door, onto the pavement) are timed on the
real clock too, and each vehicle reports the stops it reached since the previous frame, so a stop is never missed and
a walk never outlasts a stop, even at a few frames per second (busy test machine, cheap phone hiccup). If the car pulls
away while the player is still on the way to the door, they get in at once.

## Personal mobility: the Jakarta motorbike (drive mode)

- **Buy:** « Motos · Garage Modou » corner next to the garage in Pikine (two motorbikes on display, a sign). « Voir les
  articles » lists the Moto Jakarta 125 with its price; picking it opens a confirmation with the price and the wallet;
  « Confirmer l’achat » pays once through the runner (verb `buy`, wallet line « Moto Jakarta 125 · Motos · Garage
  Modou », counter `vehicules`). Price 75 000 F (provisional). It is delivered at the kerb in front of the garage.
- **Ride:** « Monter sur la moto » sits the player on its driver seat (locked). Stick or keys: up accelerates (about
  45 km/h flat out), down brakes then reverses slowly, left / right steers (tighter at low speed); releasing coasts to a
  stop. It never goes through walls, parked vehicles, stairs or the car rapides; it slides along a wall met at an
  angle. Chase camera from the kit's `chase` anchor (portrait placement on phones), « Vue d’en haut »; the card shows
  the speed. Interaction space = the motorbike (no shop counters while riding); presence stays « street ».
- **Get off:** « Descendre de la moto » (it brakes first if moving): the player stands beside it; it stays parked there,
  in that hub, across reloads (a reload mid-ride parks it where it was and puts the player beside it).
- **Same framework:** `VehicleSpec` (driver seat + `drive`), `Vehicle.place()`, `PassengerCamera`, the ride card.
  A car next is a new spec on the kit (`sedan`…) with its own `drive` numbers.

## Performance

- One merged mesh + one sign mesh per hub for the stops; two car rapides per line (one on Low quality), each a kit
  vehicle (1–3 draw calls, LOD; its NPC passengers are part of the same mesh) + its apprenti; people at stops drawn and
  animated only within 70 m of the camera (one waiting person per stop on Low). The motorbike is one kit vehicle.
- No per-frame allocations in the vehicle / route / seat updates (preallocated poses, motions and arrival lists).
- Measured by `scripts/check-transport.mjs` 6 m from a stop with a car standing there: **+15 to +16 draw calls** for the
  line's cars and stops with the kit (Pikine desktop 411 with / 395 without; Plateau phone portrait 359 / 344); the
  people waiting at the stops are counted in both.

## Checks

- `tests/transport.test.ts`: lane path and sampling, timetable (dwell, speeds, monotonic, periodic, next stop / ETA),
  seat transforms, camera anchors and wall pull-in, trip logic (board, ride past, request, alight, slow frames,
  cancel), stop placement and alight points, line vehicle seats and arrivals.
- `tests/moto.test.ts`: drive model (top speed, coasting, brake then reverse, steering direction, walls and sliding),
  the Jakarta spec, ownership record round trip and Asset mapping. `tests/transport.test.ts` also covers the kit
  adapter (seats, door, step, open cabin, `seated` drawn exactly), passenger sets, seat choice and kerb clearing.
- `scripts/check-transport.mjs` (desktop Pikine, phone portrait Plateau): walk to a stop, wait, board on the only free
  seat, fare paid once, stick does not stand up, phone and « Arrêter » mid-ride, four views, ride past a stop,
  request, alight on the pavement, door and hub change right after, hub change mid-ride, reload mid-ride, draw calls.
  Screenshots in `docs/screenshots/transport/`.
- `scripts/check-moto.mjs` (desktop keys, phone joystick; Pikine): dealer catalogue with the price, confirmation with
  price and wallet, paid once, not twice, get on, ride, steer, stop at a wall (never inside), get off beside it, reload
  (parked, and mid-ride), another hub and back. Screenshots in `docs/screenshots/moto/`.
- Last run (9 Oct, after merging the vehicle kit and the venues lane): transport **45/45**, motorbike **32/32**,
  `scripts/check-interact.mjs` **34/34**, `scripts/check-city-life.mjs` all pass (37).

## Known gaps

- NPC passengers are the kit's seated busts (no animation); the player's humanoid sits with the city « Sit » clip
  (no riding pose on the motorbike yet; the rider-less kit motorbike keeps its side stand down while ridden).
- The motorbike is not seen by other players (only the rider, seated); it does not follow its owner to another hub.
- Cars of the line and the decorative traffic do not see each other (they may overlap at crossings).
- Stopping is at stops only (no « Taxawal fii » anywhere along the street yet).
- The trip itself is not saved: a reload mid-ride puts the player on the next stop's pavement (fare already paid).
- Players in the street do not see car rapide riders (different presence space); riders of the same car see each other.
- The inter-hub trip from the station still fades (no departure scene yet).
- Wolof lines and calls are a draft to review with the language lane.
