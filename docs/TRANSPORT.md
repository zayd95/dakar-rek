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
  (a window seat on the pavement side when there is one; never a seat an NPC holds).
- **Ride:** the passenger camera hangs behind the car (or « À la fenêtre », or « Vue d’en haut » — « Changer de vue »),
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
| `carRapide.ts` | **Adapter** for the existing car rapide model (`makeCarRapide`, Blender GLB when present). The vehicle kit swaps in here (`build`, and seats/cameras if its proportions differ). Closed cabin: passengers are seated logically, not drawn; camera views stay outside. |
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
- `GameModule.safePlace()`: where to save the player instead of their position (riding → the pavement of the next stop).
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

## Next: personal mobility on the same framework

The API is ready for drive mode (owned motorbike, then car): `VehicleSpec.driver` + `VehicleSpec.drive`
(max/reverse speed, acceleration, braking, turning radius, steering rate, collider half-extents, `lean` for
two-wheelers) and `Vehicle.place()` as the controller seam. A `DriveController` reads the stick (throttle / steer),
integrates a bicycle model, collides with the hub's colliders using the half-extents, and calls `place()`; the player
sits on `vehicle.driverSeat` (locked); the passenger camera's anchors serve as chase views. Ownership comes from the
economy lane's `Asset` (kind `vehicle`): buying spawns a `Vehicle` from the catalogue's spec near the player.

## Performance

- One merged mesh + one sign mesh per hub for the stops; two car rapides per line (one on Low quality), each the shared
  vehicle geometry (5 draw calls) + its apprenti; people at stops drawn and animated only within 70 m of the camera
  (one waiting person per stop on Low).
- No per-frame allocations in the vehicle / route / seat updates (preallocated poses, motions and arrival lists).
- Measured by `scripts/check-transport.mjs` 6 m from a stop with a car standing there: **+16 to +18 draw calls** for the
  line's cars and stops (Pikine desktop 445 with / 429 without; Plateau phone at Low-equivalent framing 308 / 290); the
  people waiting at the stops are counted in both.

## Checks

- `tests/transport.test.ts`: lane path and sampling, timetable (dwell, speeds, monotonic, periodic, next stop / ETA),
  seat transforms, camera anchors and wall pull-in, trip logic (board, ride past, request, alight, slow frames,
  cancel), stop placement and alight points, line vehicle seats and arrivals.
- `scripts/check-transport.mjs` (desktop Pikine, phone portrait Plateau): walk to a stop, wait, board on the only free
  seat, fare paid once, stick does not stand up, phone and « Arrêter » mid-ride, three views, ride past a stop,
  request, alight on the pavement, door and hub change right after, hub change mid-ride, reload mid-ride, draw calls.
  Screenshots in `docs/screenshots/transport/`. Last run (9 Oct): **45/45** (desktop 23, phone 22);
  `scripts/check-interact.mjs` 34/34 and `scripts/check-city-life.mjs` all pass with the transport module.

## Known gaps

- The current model's cabin is closed: no visible interior, so NPC passengers have seats but no bodies and the
  camera views are outside the car (the vehicle kit with an interior will add an inside view and passenger bodies:
  `cabin: 'open'`).
- Cars of the line and the decorative traffic do not see each other (they may overlap at crossings).
- Stopping is at stops only (no « Taxawal fii » anywhere along the street yet).
- The trip itself is not saved: a reload mid-ride puts the player on the next stop's pavement (fare already paid).
- Players in the street do not see riders (different presence space); riders of the same car see each other.
- The inter-hub trip from the station still fades (no departure scene yet).
- Wolof lines and calls are a draft to review with the language lane.
