# Vehicle, navigation and gameplay polish

A finish-and-delight pass on top of the vehicles economy (PR #63): the player knows where to go, driving feels good, work pays fairly, finishing feels
satisfying, the cars are desirable and not free toys, and coming back tomorrow matters. Nothing here adds a district, a collectible or a new engine.

## 1. The blockers (P0)

| What was wrong | What it was | What it is now |
|---|---|---|
| A car stopped dead in the arena's street (Pikine) with nothing in sight | The gate's pedestrian zone (`src/arena/exteriorRules.ts` `gatePlaza`) was a 29 m invisible box across the street for cars, and nothing for the Jakarta (which rode through the queue's crowd barriers) | It ends at two visible lines of steel bollards (1.72 m apart, a gap on each kerb lane: a person or a motorbike passes between two with room to spare, a car does not) and a « ZONE PIÉTONNE · ARÈNE · ACCÈS À PIED » board at each end (`src/arena/plazaEnds.ts`, one merged mesh each). The Jakarta rides between the posts and is stopped by the queue's barriers, which are drawn. What stops a vehicle is what the driver sees. |
| The Almadies coast road was blocked | The fishing port's pier (`src/world/builder.ts`) was a 0.4 m platform laid across the coast road (z = −120) | The pier is split: a boardwalk on the beach side, the pier beyond the road, two ramps; the pirogues moved off the road. |
| Opposing blocks at the mouths of streets | Parked cars stood up to the junctions | The first parked car stands 17 m from a junction's centre (`JUNCTION_CLEAR`, `src/game/parkedVehicles.ts`): the mouth of a street is clear both ways. |
| A Prestige trial car could not leave cleanly | Trials were full road drives with no rule; the edge of the district was an invisible wall | Trials are « à l'arrêt » by default (sit, look, start the engine: the salesperson keeps the handbrake on, and says so when the player presses the pedal). A road test needs the dealer's reason (§ 5). A road test near a way out of the district is slowed to a stop and the salesperson says « L'essai reste dans le quartier » — never an invisible wall. Driven back to the bay and left, the car goes back on display when it is out of sight (the same car, the same paint); nothing is owned, paid or saved. |
| Older clients could wipe a debt | An older v6 client rebuilds the save from the fields it knows | Every save keeps `loans`, `vtc`, `play`, `streak` a second time (`dakarrek.guest.save.v6.extras`); a save an older client rewrote gets them back, for the same guest only, and the player is told once (docs/SAVES.md). |

## 2. Work that pays fairly and feels finished

**The card.** After every Tiak delivery, Tiak tour and VTC ride (`src/economy/workCard.ts`, shown by `src/economy/streakModule.ts`): the job, from where to where,
what it paid (paid once, before the card: the card only says it), the real duration and the real distance travelled since the job was taken, Pape Sarr's
share of a fare while his credit runs, where the run of days stands, and one line read from what happened (late, bumps on the way, a long clean ride).
No stars. It sits clear of the stick and the action button, a tap dismisses it, it goes by itself after 7 s, and the car radio steps back while it shows.

**VTC fares** (`src/transport/vtcRules.ts` `vtcFare`, `src/economy/config.ts` `vtc`): by road distance, shown on the offer before it is taken, fixed when it is
taken, paid once, no multiplier.

| Ride | Band |
|---|---|
| a short hop inside a district | 1 000 – 2 000 F |
| across a district | up to 3 500 F |
| to the next district (e.g. Corniche → Plateau) | 3 500 – 4 500 F |
| two districts away | 3 500 – 5 000 F at most |

**Pape Sarr's credit** (`src/economy/credit.ts`, `creditModule.ts`): the Teranga stays at 4 000 000 F and his trust still decides the advance (15 000 F at his
best terms). The rest is repaid like a Dakar driver pays a car's owner: 10 000 F per day of play, more whenever the player likes (« Verser 10 000 F »,
50 000, 200 000, what the wallet holds, all of it), and 30 % of each VTC fare while the credit runs (shown on the card; « Crédits » turns it off). Two
installments behind is « à rattraper », not yet late; the days are the player's days (§ 3), so a week away in real life never makes a debt late. « Crédits »
shows the balance, what is repaid (and the percentage), the next payment and what is behind. Debts opened before this pass move onto the new clock as they
stand. The 70 000 000 F Lamane Sport is not made easier.

**Modou's slate**: installments on the player's days, one of grace.

## 3. Coming back tomorrow: the run of days

`src/economy/streak.ts` (rules, unit-tested), `src/economy/streakModule.ts`.

- **The player's days** (`play` in the save): one more each time a city day begins while they play, or when they come back on a later city day. The city days
  that go by while they are away neither break the run nor count for it.
- **A day counts** when the player did real work in it, paid once: a delivery, a VTC ride, a paid shift, a dealer's errand, a repayment of 1 000 F or more, a
  bout. Greeting someone, opening a menu, or taking a job and dropping it does not count.
- **Once per day**; two counted days are at least 10 minutes of play apart unless the player was really away (no 23:59 / 00:01 farming).
- **One skipped day is forgiven**, given back every full week.
- **Profil › Régularité**: « 1 jour actif », « 3 jours d'affilée », the best run, the days worked in all, what the run opens now and next.
- **Milestones** (a short card once the job's card is gone, the first time each one is reached):

| Days | Opens (another way in, never the only one, never money, a car or a debt written off) |
|---|---|
| 2 | the dealers recognise the player: a warmer word when they greet |
| 3 | a road test of a city car (Sarr Auto, Ndiaye Auto) without the errands first; Pape Sarr's trust a little higher, once |
| 5 | a supervised road test at Prestige Auto (a short loop in the Almadies; he calls the car back after about two and a half minutes), on Moussa Ndiaye's word |
| 7 | « travailleur fiable »: Modou makes his arrangements as for a customer he trusts |

## 4. Knowing where to go

`src/game/navigation.ts`, rules in `src/game/navRules.ts` (unit-tested).

- The goal is the job in hand (a VTC passenger, then their stop; a Tiak parcel's pick-up, then its client; a dealer's errand), else a district or a place the
  player chose on the map with « 🚗 Itinéraire en voiture » (first, and alone, while at the wheel; « Arrêter l'itinéraire » to stop).
- While driving or riding, the goal line says the next turn and the distance left by road: « ↱ À droite dans 80 m · Restaurant Le Pointe · 2,4 km ». In the
  goal's district the way follows the streets; elsewhere it follows them to the way out toward the next district of the trip; out on a road between districts
  it is « Tout droit sur la route » with the kilometres left. The minimap's dotted route and the phone's map follow the same point; the car's centre screen
  shows the same turn. It survives crossing into the next district, switches from pick-up to drop-off by itself and clears when the job ends. At the wheel
  the way keeps off the streets closed to cars (the arena's pedestrian zone, a street a road event has closed), as the city's own cars do; on foot it does not.
- **On the ground**: a green welcome board at each way into a district (« PIKINE · Bienvenue · la banlieue qui bouge », …) on the right of the arriving traffic
  (`src/world/arrivalSigns.ts`); on the roads between districts a board every 500 m each way with the district ahead and the kilometres left
  (`src/road/chunks.ts`).

## 5. Dealerships and trials

- **Free trial = « à l'arrêt »** everywhere: walk round the car, open the door, sit, look at the cockpit, start the engine where it stands.
- **The road** (`src/transport/trialRules.ts`): for a customer who could pay for it now (any dealer); at Sarr Auto for someone Pape Sarr trusts (his errands) or a
  worker of 3 days in a row; at Ndiaye Auto for a worker of 3 days in a row; at Prestige Auto for a worker of 5 days in a row, supervised. A dealer's errand
  with his car is always on the road. Enough money simply buys the car.
- **Prestige Auto** (`src/world/prestige.ts`): the outdated procedural saloon is off the floor (still its owners' car, still delivered from the catalogue, no
  longer listed); a second Gaïndé takes its bay. The red Lamane Sport stands on its own platform under a feature wall with its name, plaques with the price at
  each car, spot lights, a second lounge, a rug, plants.
- **Sarr Auto**: a modest office behind Pape Sarr's desk (a whitewashed wall with a window, a key board, a calendar, low partitions, a filing cabinet): a street
  lot, not a showroom.
- **Paint**: light paints (the Gaïndé's white) get a small lift so they read as white, not grey, under the game's light.

## 6. Driving, the cockpit and the sound

- **Steering** (`src/transport/drive.ts`): finer around the centre at a walking pace (an exponent that fades out by 8 m/s), in proportion at speed, a readier
  return to straight; the brake builds up over 0.3 s from 45 % instead of biting at once. The chase camera swings more calmly. Analog throttle, « Accélérer »,
  the brake held at a standstill to reverse and the Jakarta's foot paddle are unchanged. « Descendre » asked while the vehicle still rolls brakes to a
  standstill and no further (it used to ask for the other way, which on a slow frame swung past the stop for ever and kept the rider on the bike).
- **At the wheel** (`src/transport/carInterior.ts`, since the cockpit lane: it replaced the camera-space kit): a physical interior in the car's own frame,
  the eye fixed at the driver's seat and only the head turning with a drag: the dashboard, a wheel that turns with the steering, the speed in km/h and the
  revs, a centre screen with the next turn (or the radio's station, or the time), door cards, pillars, header, headliner, mirror, seats. Two trims: « city » (grey
  plastic: the Teranga, the Rafet, the saloons) and « premium » (dark leather, a metal strip, a wider screen: the Lamane Sport, the Gaïndé, the berline).
  Five draw calls; the screens are redrawn at most four times a second.
- **Sound** (the same Web Audio graph and the same approved recordings, `src/transport/vehicleAudio.ts`): the Jakarta about 3.5 dB quieter; the brake squeal
  about 9 dB softer and only on a real hard stop; the city's traffic bed and its far horns only where traffic is near (silent on an empty road); softer tyre
  noise; deeper, smoother engines for the dear cars. Horn, ignition and knocks unchanged.
- **The car radio** (`src/transport/radio.ts`, the 📻 button by « Vue »): Sénégal Hits (music), Radio Téranga (talk), Corniche FM (calmer), made in the browser
  (no stream, no file). Under the engine when accelerating; lowered by the horn, a knock, the phone and the job's card; its volume in Réglages › Son; only in a
  car, never in the street; only after the first tap; muted with the game.

## 7. Checks and results

Everything below ran in headless Chromium with SwiftShader (a CPU renderer) on a 4-core machine, at 2–6 frames a second: it shows what the page does, not
how it feels on a phone (§ 8). The game's code is final at `a9e88c9`; the commits after it change only the checks and this document. Most journeys ran on
`8f8bb87`, which differs from it only by the arena bollards' spacing (§ 1); the arena journey and the save, garage, Prestige-trial and sound checks ran on
`a9e88c9`. A run on an earlier build says so.

**Unit tests** (`npm test`, 168 files: 1 984 passed and 2 skipped on `8f8bb87`; on `a9e88c9` the same, except `tests/venues.test.ts` timing out its
5 s import while three browsers loaded this machine — CI's `npm test` passes it): `tests/streak.test.ts`, `workCard.test.ts`, `navRules.test.ts` (the way at the wheel keeps
off closed streets), `trialRules.test.ts`, `saveExtras.test.ts`, `radio.test.ts`, `arrivalSigns.test.ts`, `vtc.test.ts` (bands), `credit.test.ts` (player
days, grace, the 30 % share of every fare), `gatePlaza.test.ts` (bollards, the Jakarta's way), `prestige.test.ts`, `vehicleAudio.test.ts`,
`driveRoads.test.ts`, `trafficStress.test.ts`, `moto.test.ts` (« Descendre » while rolling).

**The acceptance journeys** (`scripts/check-polish-journeys.mjs <base> <out> <journey>`, one per run, a 390 × 844 phone page, real CDP touches wherever a
player touches; debug hooks only to set a start and to read state, each named where it is used; every run films itself). Pictures and short silent films
are in `docs/vehicles/polish/` (`journey-<x>-<n>.jpg`, `journey-<x>.mp4`, `results-<x>.json`).

| Brief | Run | Build | Result |
|---|---|---|---|
| A. A new player, real work, the first milestone | `A` | 8f8bb87 | 12/14. Two days of Tiak deliveries on the Jakarta by the directions; a second delivery the same day pays and its card says the day is already counted; the next day « 2 jours d'affilée », its milestone card (« Les vendeurs te reconnaissent »), Profil › Régularité, the run in the v6 save. The 2 misses are the first card: read after its 7 s (the test's rider was slow to the kerb), it said « Livré en retard », which that run's check did not yet accept (`2b8c8c6`); its tap is checked by `card`. A second run (8/9): the first card on time (« Livraison réussie … Livré à l'heure »), then the test's rider missed the second pick-up's door on foot. |
| (the card) | `card` | 8f8bb87 | 4/4: up after the job, clear of the stick and the action button, a tap puts it away, left alone it goes after 7.5 s. |
| B. Three days in a row, an early Teranga road test, back | `B` | 8f8bb87 | 3/4: Pape Sarr lets it go on the road for three days of work, no errand, no money (« Tu travailles tous les jours, ça se voit »); the loop; walked away, his car is back on the lot, nothing paid or owned. Miss: the test's driver left it 2.9 m from its spot (the check asks 1.6 m). 4/4 on `4685e63`. |
| C. Little money, Pape Sarr's trust, a Teranga on credit, a VTC ride by the directions | `C` | 8f8bb87 | 9/10: the offer at trust 45 (200 000 F now, then 10 000 F a day of play and 30 % of fares), signed, « Crédits », a 1 000 F ride in Pikine offered with its fare, the directions to the passenger and then to the drop-off by themselves, paid once (300 F to Pape Sarr, 700 F to the wallet), the directions cleared. Miss: the check's own pattern for the card's « reste … F » (no-break spaces, `baad800`); the card did read « Pape Sarr 300 F remboursés reste 3 799 700 F sur la Teranga ». Two later runs lost the test's driver before the drop-off (a parked pickup, a house corner). |
| D. Corniche → Plateau, 5 000 F at most | `D` | 8f8bb87 | 9/9 (the fares below; the directions out of the Corniche, « Tout droit sur la route … 1,9 km », the card). |
| E. A Tiak parcel to Le Pointe by the directions, the card | `E` | 8f8bb87 | 8/8: the next turn to the Maïga; the parcel aboard, the way out of Pikine (1,9 km); « Tout droit sur la route … 1,7 km »; in the Almadies the street directions (260 m); 6 825 F paid once; the card (4 min 23 s, 2,0 km); the directions cleared. |
| F. The Jakarta backed out with the feet | `F` | 8f8bb87 | 3/3: « Frein » held at a standstill, after a short pause the rider pushes it back with the feet, a slow walk at most, « RidePaddle », no « R ». |
| G. A Lamane Sport at Prestige: look, sit, start, an authorised road test, back | `G` | 8f8bb87 | 9/9: the floor car offers the trial and the purchase; the very car (no copy); a supervised road test on five days of work, not money (300 000 F); out of the hall and round the block; back into its own bay (0.15 m); walked away, back on display, nothing owned, saved or paid; one car per bay; the same paint. |
| H. Modou's repair arrangement, repaid later | `check-garage-credit` | a9e88c9 | 14/14. |
| I. An old save: vehicles, money, progress, debts | `check-save-vehicles`, `check-save-debts` | a9e88c9 | 9/9 and 10/10: older clients and this one in turn; every vehicle kept (same uid, spec, price, place, paint), the wallet unchanged; the Sarr credit, the rides and the run of days back exactly after an older client dropped them, the player told once. |
| J. Multiplayer smoke | `check:online` (CI) | each push | Presence, a remote avatar on a phone page, the phone's menu, hub membership following travel to all four districts, a rider seen on a bike, a passenger in a car rapide, arena seats. Green on every push but two (`4fc3d01`, `35432dd`), where the same code also passed: the check's step at Ligne 23's Marché stop missed « waiting » (B moved there while still getting off the bike, or taken at once by a car standing there). The check now waits for B to be on foot, accepts either, and says what it saw. |
| P0: the arena's zone | `arena` | a9e88c9 | 8/8: the bollards and boards drawn; a car straight through both junctions beside the zone; a car toward the gate stops at the bollards and only there; the Jakarta in by the kerb lane between two posts, held only by a stall; the Jakarta through the west junction. |
| P0: the ways into the Almadies | `almadies` | 8f8bb87 | 6/7: from Pikine and along the coast road past the pier, no knock and nothing solid on the lane. Miss: on the Corniche road's way in, the test's driver ran into a car rapide 3.6 m ahead in its lane (traffic). |

**Fares seen** (journey D, the city's own offers from the Corniche, one an hour from 6 h to 22 h, `vtc-fares-corniche.json`): to the Plateau 17 × 4 000 F,
to Pikine (two districts away) 17 × 4 000 F, inside the Corniche 1 000 F or 1 500 F. Taken: Café Touba · Fann → Gargote Chez Fatou, 4 000 F on the offer,
4 000 F fixed, 4 000 F paid once; the card « Durée 4 min 42 s · Distance 2,3 km ». Journey C: Maïga du marché → Gargote Mame Diarra (Pikine), 1 000 F, of
which 300 F to Pape Sarr (700 F in the wallet). Journey E: a Tiak parcel Maïga → Restaurant Le Pointe (Almadies), 6 825 F, 4 min 23 s, 2,0 km.

**The vehicles' other checks** (`scripts/check-*.mjs`, as on PR #63, rerun here):

- `check-collision` 17/17, `check-drive-feel` 12/12, `check-first-car` 16/16 (the first car on credit, a ride, the part payment beside Pape Sarr's share),
  `check-vtc-ride` 13/13 (Pikine → Plateau: the passenger in the right rear seat, kept through a reload and across the road, paid once),
  `check-jakarta-courier` 15/15: on `8f8bb87`.
- `check-sound-test` 23/23, `check-prestige-trial` 7/7, `check-prestige-flow` 23/23 (`SKIP_LAP`: the car set by the forecourt): on `a9e88c9`. Its lap itself was
  driven in a full run on `8f8bb87` (16 checks, then its wait for the salesperson ran out on a loaded machine).
- `check-prestige-suv` 9/11 on `8f8bb87`: its lap ends on the forecourt 2 m short of the box it asks for, and the walk-away return (40 s of game time
  with the car out of sight) did not come within its wait on a loaded machine; journey G shows the same car back in its bay and back on display.
- `check-trial` (PR #63's kerb test drives): the same 12 passed / 7 failed on PR #63's head and on this branch, line for line: its floor-dealer half
  expects the kerb test drive that PR #63's dealer floors replaced, and its Jakarta half reads the player's own bike first.

**The sound** (`scripts/capture-polish-av.mjs`: the same scenes driven on PR #63's build and on this one, alone on the machine, the page's own output
recorded; the page's sound clock ran at 0.999× the wall clock; loudness in dBFS on that clock, `sound-levels-before.json` / `-after.json`; films
`sound-<scene>-before-after.mp4`, PR #63 first, and `sound-radio.mp4`):

| Scene, moment | PR #63 peak / rms | This pass peak / rms |
|---|---|---|
| Teranga, hard stop from speed (empty street, 4 h) | −5.7 / −21.7 dB | −17.5 / −35.4 dB |
| Teranga, idle · full throttle · cruise | −26.4 / −38.6 · −22.1 / −35.7 · −22.4 / −35.8 | −27.1 / −39.3 · −22.1 / −35.9 · −21.5 / −35.9 |
| Lamane Sport (Prestige), cruise | −5.9 / −27.7 dB | −20.9 / −37.1 dB |
| Lamane Sport, idle · full throttle | −22.7 / −37.0 · −22.2 / −36.3 | −24.9 / −38.6 · −24.6 / −37.3 |
| Jakarta, getting on · idle | −4.4 / −30.0 · −22.6 / −38.1 | −12.0 / −36.2 · −28.9 / −42.8 |

The Jakarta's film stops after its idle on both builds (the motorbike scene outlasts what the recorder kept: 24.7 s of sound for 39.6 s); its throttle,
brake and stop are not compared. The radio film (this pass only): the three stations in turn, pulling away with the radio on, the horn over it, a stop and
« off »; its loud moment at the stop (−1.4 dB) is a knock: a car rapide pulled in just ahead and the Teranga touched it.

**Performance** (`scripts/perf.mjs`, PR #63's head `44aebef` against this pass `43da335`, the last change with a cost, `8f8bb87` only changes a rounding;
QUALITY=low, two runs each, alternating; frames a second on a CPU renderer are for comparison only):

| Page | FPS | Draw calls | Triangles |
|---|---|---|---|
| Desktop, Plateau 13 h | 3.0 → 3.0 | 134 → 146 | 93.7 k → 95.6 k |
| Desktop, Pikine 13 h | 3.1 → 3.0 | 170 → 171 | 150.7 k → 150.6 k |
| Desktop, Pikine 21 h | 2.4 → 2.3 | 216 → 205 | 169.2 k → 160.3 k |
| Phone, Plateau 13 h | 5.8 → 5.9 | 97 → 104 | 81.2 k → 81.5 k |
| Phone, Pikine 13 h | 5.3 → 5.5 | 133 → 128 | 144.4 k → 137.1 k |
| Phone, Pikine 21 h | 4.7 → 4.2 | 156 → 149 | 153.1 k → 142.1 k |

Download 6 771 → 6 815 kB; ready on the desktop page 4.5 → 3.8 s, on the phone page 3.0 → 3.0 s. These are street views on foot; at the wheel the
cockpit adds five draw calls. The Plateau's views draw 7–12 more calls; Pikine's draw fewer, with fewer triangles.

**Found and fixed by these runs** (the game, not the checks):

- **Pape Sarr's 30 % came to nothing on a short ride**: rounded down to 500 F, the share of a 1 000 F or 1 500 F ride was 0 (`fareShare`, now to 50 F).
- **« Descendre » while still rolling could keep the rider on the bike for ever** on a slow frame (the brake asked for the other way and swung past
  the stop); now an analog brake to 0 (`stopping()`). This was the CI multiplayer check's failure.
- **The goal line could send a driver into the arena's bollards** or a road event's cones: the way at the wheel now leaves out the streets closed to cars.
- **A Jakarta could hardly pass between the arena's bollards**: posts 1.5 m apart left 0.21 m either side of the bike, and the journey's rider, 0.3 m off
  the gap, stayed on a post. They are now 1.72 m apart with a gap on each kerb lane: 0.32 m either side, still narrower than any car.

## 8. Limits

- **No physical iPhone test.** Every browser run is headless Chromium with SwiftShader on a 4-core machine: it proves what the page does, not how it feels
  or sounds on a phone, nor its frame rate there.
- **The test's driver is not a player.** `scripts/lib/realTouch.mjs` `pilot` steers a few times a second on a page drawing 2–6 frames a second; some
  journey failures are its own (a corner cut into a wall, a car rapide ahead it cannot see, a walk to a door that misses). They are named in the table,
  and none of them is a stop the game made.
- **The sound films** show the balance between sounds as the page makes them, not what a phone's speaker does. The Jakarta's film is incomplete (above).
- The radio is synthesised in the browser: three stations of generated music and talk-like voice, not real broadcasts.
- The optional sport motorbike was not made; Ouakam, Mermoz and Sacré-Cœur are not on the boards.
- **Tests that did not pass, all named above**: journey A's first card (late, then gone), B's parking 2.9 m off, C's later runs, the Almadies drive
  that met a car rapide, `check-prestige-suv`, `check-trial`'s floor half. None is a stop the game made; each is the test's driver, a test's own
  pattern, this machine's load, or a check older than PR #63's floors.
- **The test's driver cannot back out**: when it noses a car into a wall the run stays there. A player backs out with « Frein ».
