# Vehicle, navigation and gameplay polish

A finish-and-delight pass on top of the vehicles economy (PR #63): the player knows where to go, driving feels good, work pays fairly, finishing feels
satisfying, the cars are desirable and not free toys, and coming back tomorrow matters. Nothing here adds a district, a collectible or a new engine.

## 1. The blockers (P0)

| What was wrong | What it was | What it is now |
|---|---|---|
| A car stopped dead in the arena's street (Pikine) with nothing in sight | The gate's pedestrian zone (`src/arena/exteriorRules.ts` `gatePlaza`) was a 29 m invisible box across the street for cars, and nothing for the Jakarta (which rode through the queue's crowd barriers) | It ends at two visible lines of steel bollards (1.5 m apart: a person or a motorbike passes between two, a car does not) and a « ZONE PIÉTONNE · ARÈNE · ACCÈS À PIED » board at each end (`src/arena/plazaEnds.ts`, one merged mesh each). The Jakarta rides between the posts and is stopped by the queue's barriers, which are drawn. What stops a vehicle is what the driver sees. |
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
- **At the wheel** (`src/transport/cockpitKit.ts`): one cockpit kit for every car, framed in the camera's view above the touch pad: the dashboard, a wheel that
  turns with the steering, the speed in km/h and the revs, a centre screen with the next turn (or the radio's station, or the time). Two trims: « city » (grey
  plastic: the Teranga, the Rafet, the saloons) and « premium » (dark leather, a metal strip, a wider screen: the Lamane Sport, the Gaïndé, the berline).
  Five draw calls; the screens are redrawn at most four times a second.
- **Sound** (the same Web Audio graph and the same approved recordings, `src/transport/vehicleAudio.ts`): the Jakarta about 3.5 dB quieter; the brake squeal
  about 9 dB softer and only on a real hard stop; the city's traffic bed and its far horns only where traffic is near (silent on an empty road); softer tyre
  noise; deeper, smoother engines for the dear cars. Horn, ignition and knocks unchanged.
- **The car radio** (`src/transport/radio.ts`, the 📻 button by « Vue »): Sénégal Hits (music), Radio Téranga (talk), Corniche FM (calmer), made in the browser
  (no stream, no file). Under the engine when accelerating; lowered by the horn, a knock, the phone and the job's card; its volume in Réglages › Son; only in a
  car, never in the street; only after the first tap; muted with the game.

## 7. Checks

Unit tests (part of `npm test`): `tests/streak.test.ts`, `workCard.test.ts`, `navRules.test.ts`, `trialRules.test.ts`, `saveExtras.test.ts`, `radio.test.ts`,
`arrivalSigns.test.ts`, `vtc.test.ts` (bands), `credit.test.ts` (player days, grace, share), `gatePlaza.test.ts` (bollards, the Jakarta's way), `prestige.test.ts`,
`vehicleAudio.test.ts`, `driveRoads.test.ts`, `trafficStress.test.ts`.

Browser journeys (`scripts/check-polish-journeys.mjs`, one per run, real CDP touches on a 390 × 844 phone page, filmed; `scripts/check-save-debts.mjs`;
`scripts/capture-polish-av.mjs`): results in the PR and in § 8.

## 8. Limits

- **No physical iPhone test.** Every browser run is headless Chromium with SwiftShader (CPU rendering): it proves what the page does, not how it feels or
  sounds on a phone. The sound films are the page's own output, recorded in the browser.
- The radio is synthesised in the browser: three stations of generated music and talk-like voice, not real broadcasts.
- The optional sport motorbike was not made; Ouakam, Mermoz and Sacré-Cœur are not on the boards.
