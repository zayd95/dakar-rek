# Prestige Auto: a physical dealership (pilot)

Branch `vehicles/integration-20261018` (PR #49), save v6 untouched, driving physics untouched, no Meshy credits, nothing in production. Ndiaye Auto is unchanged.

## What the player does

1. Walks in from the pavement (joystick) through the doorway of a glass showroom on its own parcel of the Almadies.
2. The **salesperson** notices them, walks over (real walk, no jump) and greets once in French with a little Wolof. Nothing is forced: walking away, or going to a car, is an answer.
3. Picks an **actual car on the floor** (« Essayer cette voiture » or « Acheter · prix »). The salesperson walks to that car, **unlocks it** (two chirps) and offers the keys (« Prendre les clés »).
4. Walks to the **driver's side** and taps **« Ouvrir »**: the driver's door (a separate leaf on a hinge) swings open with a sound, the body slips onto the seat, the door shuts with a sound, the engine starts, the player has the controls. A door camera shows it: no fade, no cut.
5. Drives **the same car** out through the 18 m bay and round the block, parks on the forecourt, taps « Descendre » (door opens, they step out, door shuts).
6. The salesperson walks to them. « Parler au vendeur » › « Acheter · … » shows the price and the wallet, « Confirmer l'achat » pays once: the car **is theirs where it stands** (position kept, parking record written, the paint of the chosen car saved). No delivery, no copy, no vanishing display car.

## Where things live

| Piece | File |
| --- | --- |
| Reserved parcel (block (0, 2) of the Almadies), hall, glass front/roof, bay, doorway, desk, motorbike plinth (display only), pylon; the layout constants everything shares | `src/world/prestige.ts`, `src/world/city.ts` (`CITY_BLOCKS.almadies['0,2'] = 'prestige'`) |
| Walking map for the salesperson (grid + A*, built from the hub's colliders each walk) | `src/world/navgrid.ts` |
| Salesperson: notice › walk › greet (once per visit, long pause), the keys, meeting the customer back from the drive, « Parler au vendeur », the desk's catalogue | `src/transport/prestigeSales.ts` |
| Floor cars (real `Vehicle`s), targets, « Ouvrir », door entry/exit sequences and door camera, trial, purchase in place, trial recovery | `src/transport/ownedModule.ts` |
| Two berlines (white, navy) + two SUVs (white, green) in their bays | `src/transport/premiumCars.ts` |
| The driver's door of the kit cars: an opening cut in the body (`KitBuilder.prism` `holePos`), a closed dark footwell, a hinged leaf with its own window glass | `src/actors/vehicleKit.ts` (`VehicleOpts.openable`, `setKitDoor`), `src/world/kitGeometry.ts` |
| Paint of a car bought from the floor (`vehicle:<asset>:seed`) | `src/transport/owned.ts` |
| Remote chirp | `src/transport/vehicleAudio.ts` (`unlock`) |

## Rules worth knowing

- **Parcel**: the whole block is reserved in the generator, so no villa, wall, tree or lamp is generated there; `tests/prestige.test.ts` builds the real Almadies and checks that nothing else touches the parcel, that every bay has a clear straight lane out through the bay to the road, that the doorway and the desk's counter are free, and that the glass front is solid except doorway and bay.
- **Collisions**: glass panes, side/back walls, desk, plinth, pylon are colliders; floor cars are solid (their boxes make way for the vehicle's own when it is taken).
- **Motorbikes** at Prestige are displays; Jakarta sales stay at Garage Modou.
- **Trial vehicle** = the floor car itself. Nothing is paid, owned or saved. If it is handed back (« Rendre la voiture d'essai ») or left, it stays exactly where it is, solid; it goes back to its bay only when neither the car nor its bay is on screen and the player is more than 14 m away (and, if merely left, after 40 s). It is never seen to vanish or to appear. A reload or another hub also puts it back.
- **Existing owners**: a berline / 4×4 bought before keeps its parking spot and its catalogue paint (no seed counter); it is not duplicated on the floor. A phone purchase (Biens) is delivered on the forecourt.
- **Sold bay**: the car chosen leaves its bay empty (card hidden); if the car is sold back, the bay is restocked out of sight.

## Honest asset limits

- The kit bodies are solid shells with a lid at belt height. The door is real (own leaf, own glass, an opening in the body, a closed dark footwell) but the **interior seen through the opening is a simplified dark well and the seat**, not a modelled cabin.
- Only the **driver's door** opens. Passenger and rear doors are still part of the body.
- The generated GLB body of Ndiaye Auto's saloon has fused doors; it is out of scope and untouched.
- NPC customers browsing were left out on purpose (no cost to movement or frame rate).
- When the player steps out right beside the parked car, the salesperson stops on a free spot within reach and in sight of them (not on the far side of the car), and his prompt wins over the car's for as long as he is waiting for them.

## Checks

- `tests/prestige.test.ts`, `tests/navgrid.test.ts`, `tests/premiumCars.test.ts`: parcel, bays, walking map, door geometry, paint counters.
- `scripts/check-prestige-flow.mjs`: the whole journey above in one portrait session with real CDP touches, then a reload. `RECORD=1` films it (`prestige-journey.webm`).
- `scripts/check-prestige-trial.mjs`: handing back, abandoning and recovering the trial car (leaves the bay with the real pedals and the real « Descendre » button).
- Screenshots of every step and the recording: `docs/screenshots/prestige/` (`prestige-journey.mp4`, 10 min of wall time, 23/23 checks).

### About the recording

It is a real-touch journey (CDP `Input.dispatchTouchEvent`: joystick, Gas, Brake, « Ouvrir », « Descendre », the menus), played by a script in **headless Chromium with software GL**, portrait 390 × 844. The simulation runs at roughly a third of real time there, so the film is slower than a phone would be; it is **not** a capture of a physical iPhone, and frame rate on a real iPhone is still to be measured by hand (`?debug` shows it). The lap is steered by a small pilot (`scripts/lib/realTouch.mjs`) that only moves the two thumbs; it has no access to the car.

`SKIP_LAP=1 node scripts/check-prestige-flow.mjs …` puts the car at the end of the lap and checks the rest of the journey in a few minutes (development only).
