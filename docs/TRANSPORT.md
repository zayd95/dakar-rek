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
| `drive.ts` | Drive mode as pure logic: stick → throttle / steering, bicycle model, braking then reverse, coasting, collisions (a row of footprint circles front to back: stops at walls, slides along them, creeps out if left touching). |
| `ownedModule.ts` | `OwnedVehicleModule(def)`: one owned, drivable vehicle — dealer corner (shop recipe, price → confirmation → paid once, delivered at the kerb), get in / drive / get out (beside it; a car: on the pavement side), solid when parked, parked where left and saved per hub, the kit's camera views, speed card, debug API `__dakar.<key>`. `kerbDealer()` lays a dealer out on the pavement of the nearest road. |
| `moto.ts`, `motoModule.ts` | The Jakarta motorbike: kit spec + drive handling (leans); its def — the dealer corner at Garage Modou (Pikine). |
| `car.ts`, `carModule.ts` | The used car (catalogue `clando`, a kit `sedan`) + car handling (no lean, wider turning circle, faster); its def — « Voitures d’occasion · Ndiaye Auto » on the Plateau pavement beside Dakar Réparation. |
| `owned.ts` | Where each owned vehicle is parked, keyed to its catalogue id: counters `vehicle:<asset>:hub|x|z|yaw`. Ownership itself is the asset model (`src/economy/assets.ts`). `migrateOwned()` moves saves from the earlier flag (`asset:vehicle:moto_jakarta`) to the `jakarta` asset at what was paid. |
| `route.ts` | Pure math: `lanePath` (right-hand lane around road-grid nodes, rounded corners), `Path` (arc length, smooth heading, projection, curvature), `Timetable` (speed profile with corner speeds, acceleration, braking, rest and dwell at every stop; deterministic and periodic), `pullIn` (to the kerb at stops). |
| `lines.ts` | Line data (loop nodes, stops by leg + metres, fare, fleet, calls) and the French / Wolof lines (draft for review). |
| `vehicle.ts` | `Vehicle`: model + seats (Seats registry, space = vehicle id, `locked`) + sway; `place(x, z, yaw, speed, accel…)` is the controller seam. `LineVehicle`: places a Vehicle from the timetable on the shared clock, reports stops reached since the previous frame, apprenti and calls. |
| `stops.ts` | Stop placement on the pavement (slides along the kerb when a wall or stall is in the way), merged street furniture (2 draw calls per hub), people waiting / boarding / getting off. |
| `trip.ts` | `TripLogic`: wait → board → ride → request → alight, as pure logic. |
| `camera.ts` | `PassengerCamera`: anchor views, smoothing relative to the vehicle (no lag), heading easing, drag, wall pull-in. |
| `module.ts` | The `GameModule`: lines per hub, `stop` places (registered only while the line runs: Ligne 23's day stops step aside on fight evenings for the 23s, so a stop is never listed twice), targets (door of a standing car, ride controls), boarding / alighting, ride card, debug API. |
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
- `src/actors/vehicleKit.ts`: option `seated` (exactly these seats get a baked passenger) and `spec.occupied`; option
  `stand` (a rider-less motorbike's side stand, up while the player rides it).
- `VehicleSpec.build({ ridden })` and `Vehicle.setRidden()`: the model while the player is at the controls.
- `SeatSpec.clip` (copied to the `Seat`): the pose held on that seat — the kit's motorbike seats give 'Ride'.
- `Vehicle.animate(speed, steer, dt)`: the kit's `animateVehicle` (wheels, steering, a motorbike's lean, near model
  only), called by drive mode every frame and by the car rapides near the camera.
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
  articles » lists the catalogue's « Moto Jakarta » (`jakarta`, d'occasion, **150 000 F**) with its price; picking it
  opens a confirmation with the price and the wallet; « Confirmer l’achat » pays once through the asset model
  (`cannotBuy` / `buyAsset`: wallet line « Achat : Moto Jakarta », counters `biens` and `vehicules`). It is listed in
  « Biens » (once; it can be sold there) and delivered at the kerb in front of the garage. Bought from « Biens »
  instead, it waits at that kerb.
- **Tiak Tiak:** deliveries work on the motorbike (or in the car): the parcel is picked up and handed over on arrival,
  without getting off.
- **Ride:** « Monter sur la moto » sits the player on its driver seat (locked). Stick or keys: up accelerates (about
  45 km/h flat out), down brakes then reverses slowly, left / right steers (tighter at low speed); releasing coasts to a
  stop. It never goes through walls, parked vehicles, stairs or the car rapides; it slides along a wall met at an
  angle. Chase camera from the kit's `chase` anchor (portrait placement on phones), « Vue d’en haut »; the card shows
  the speed. Interaction space = the motorbike (no shop counters while riding); presence stays « street ».
- **Get off:** « Descendre de la moto » (it brakes first if moving): the player stands beside it; it stays parked there,
  in that hub, across reloads (a reload mid-ride parks it where it was and puts the player beside it).
- **Parked:** solid (three boxes along it: the player walks around it, the other vehicles stop at it); side stand down
  when parked, up while ridden.
- **Alive:** the rider sits astride in the kit seat's « Ride » pose (hands on the grips) and leans with the motorbike in
  turns, about the same ground line; the wheels spin and the front end steers (the kit's `animateVehicle`, near model
  only). Top speed stays well above running on foot (12.5 m/s against 7).
- **Same framework:** `VehicleSpec` (driver seat + `drive`), `Vehicle.place()`, `PassengerCamera`, the ride card; the
  motorbike and the car are two `OwnedVehicleModule` instances with their own def.

## Personal mobility: the used saloon

- **Buy:** « Voitures d’occasion · Ndiaye Auto » (fictional) on the Plateau, on the pavement of the road east of the
  shops block, beside Dakar Réparation: a desk, a sign « OCCASIONS », two saloons on display at the kerb. « Voir les
  articles » lists the catalogue's « Voiture d’occasion » (`clando`, **2 800 000 F**) with its price; a confirmation
  shows the price and the wallet; « Confirmer l’achat » pays once through the asset model (wallet line « Achat :
  Voiture d’occasion »), listed in « Biens ». The silver saloon is delivered at the kerb, facing the traffic of that
  side.
- **Drive:** « Monter (conducteur) » sits the player on the driver seat (left-hand drive). Same controls as the
  motorbike, car numbers: about 60 km/h flat out (motorbike 45), slower to pick up and to stop, a 5.6 m turning radius
  (motorbike 3.2), no lean (the body rolls a little out of the corners). Collisions as for the motorbike, on a
  footprint of seven circles (no gap a post or a wall corner can slip into). Views from the kit's anchors: behind the
  car (`chase`; higher and further back on a phone held upright), « Au volant » (the kit's `driver` anchor, the
  player's body hidden: the dashboard and the street through the windscreen), « Vue d’en haut ». The wheels spin and
  the front wheels steer; the driver sits (« Sit »).
- **Get out:** « Sortir de la voiture » (it brakes first if moving): the player stands on the pavement side — the side
  farther from the road's centre line, the right-hand side when parked at a kerb — else the other side, else behind.
  It stays parked there, solid, in that hub, across reloads (a reload while driving parks it where it was).
- **Ownership:** the `clando` asset; `owned.ts` keeps where it is parked.

## Fight evenings and taxis (lane `w3-city`)

- Ligne 23 has an evening variant (`23s`, `LineDef.runs`) from 16 h to midnight, round the arena block with an « Arène »
  stop by the arena's west side; the day route is parked meanwhile (cars and waiting people hidden, its stops offer no
  boarding); a player on a car keeps it to the end of the trip. Evening cars are fuller (`LineDef.fill`).
- Taxis between neighbourhoods (`taxi.ts`, `taxiRules.ts`): ranks, fare, the ride out, `ctx.travel`, the ride in, the
  trip owed in the save until the player is out. See `docs/CITY.md`.

## Performance

- One merged mesh + one sign mesh per hub for the stops; two car rapides per line (one on Low quality), each a kit
  vehicle (1–3 draw calls, LOD; its NPC passengers are part of the same mesh) + its apprenti; people at stops drawn and
  animated only within 70 m of the camera (one waiting person per stop on Low). The motorbike and the car are one kit
  vehicle each (2–3 draw calls near, 1 far); the car dealer adds two kit saloons, a desk and a sign (about 9 draw calls
  near it, fewer kit cars parked there).
- No per-frame allocations in the vehicle / route / seat updates (preallocated poses, motions and arrival lists).
- Measured by `scripts/check-transport.mjs` 6 m from a stop with a car standing there: **+15 to +16 draw calls** for the
  line's cars and stops with the kit (Pikine desktop 411 with / 395 without; Plateau phone portrait 359 / 344); the
  people waiting at the stops are counted in both.

## Checks

- `tests/transport.test.ts`: lane path and sampling, timetable (dwell, speeds, monotonic, periodic, next stop / ETA),
  seat transforms, camera anchors and wall pull-in, trip logic (board, ride past, request, alight, slow frames,
  cancel), stop placement and alight points, line vehicle seats and arrivals.
- `tests/moto.test.ts`: drive model (top speed, coasting, brake then reverse, steering direction, walls and sliding),
  the Jakarta spec, ownership record round trip and Asset mapping. `tests/car.test.ts`: the saloon spec (left-hand
  drive, seats, kit cameras with portrait placements, the wheel view inside), car numbers against the motorbike
  (faster, wider turning, no lean), the footprint (a post at the side, a wall ahead, parked boxes), the kerb dealer
  layout on either kind of road, the pavement side, the car and the motorbike owned side by side, the side stand. `tests/transport.test.ts` also covers the kit
  adapter (seats, door, step, open cabin, `seated` drawn exactly), passenger sets, seat choice and kerb clearing.
- `scripts/check-transport.mjs` (desktop Pikine, phone portrait Plateau): walk to a stop, wait, board on the only free
  seat, fare paid once, stick does not stand up, phone and « Arrêter » mid-ride, four views, ride past a stop,
  request, alight on the pavement, door and hub change right after, hub change mid-ride, reload mid-ride, draw calls.
  Screenshots in `docs/screenshots/transport/`.
- `scripts/check-moto.mjs` (desktop keys, phone joystick; Pikine): dealer catalogue with the catalogue price,
  confirmation with price and wallet, paid once through the asset model, listed once in « Biens », not twice, get on
  (Ride pose), ride, steer, stop at a wall (never inside), a Tiak Tiak pick-up and hand-over while riding, get off
  beside it, reload (parked, owned once, charged once; and mid-ride), another hub and back. Screenshots in `docs/screenshots/moto/`.
- `scripts/check-car.mjs` (desktop keys, phone joystick; Plateau): dealer catalogue with the price, confirmation with
  price and wallet, paid once and delivered at the kerb, not twice, the parked car is solid, « Monter (conducteur) »,
  drive, steer, brake, the three views, stop at a wall (never inside), « Sortir de la voiture » on the pavement side,
  reload (parked, and mid-drive), another hub and back. Screenshots in `docs/screenshots/car/`.
- Last run (10 Oct, on integration 57bc29c + the car, desktop and phone): motorbike **36/36** (asset model, « Biens »
  once, a Tiak Tiak delivery while riding, charged once after a reload), car **38/38**. Earlier (9 Oct): transport
  **45/45**, `scripts/check-interact.mjs` **34/34**, `scripts/check-city-life.mjs` all pass (37).

## Known gaps

- NPC passengers are the kit's seated busts (no animation); the player's humanoid sits with the city « Sit » clip
  (the motorbike's rider: the kit's « Ride » pose).
- Owned vehicles are not seen by other players (only the driver, seated); they do not follow their owner to another
  hub. Nobody can ride along yet (the car's other seats are not offered; no taxi job yet).
- The car rapides do not see the player's vehicle (the player's vehicle stops at them).
- Cars of the line and the decorative traffic do not see each other (they may overlap at crossings).
- Stopping is at stops only (no « Taxawal fii » anywhere along the street yet).
- The trip itself is not saved: a reload mid-ride puts the player on the next stop's pavement (fare already paid).
- Players in the street do not see car rapide riders (different presence space); riders of the same car see each other.
- The inter-hub trip from the station still fades (no departure scene yet).
- Wolof lines and calls are a draft to review with the language lane.
