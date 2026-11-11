# Driving feel: the pad, the speedometer, the passenger, the street

## Release tuning: faster and more responsive (the owner: « MAKE DRIVING FASTER AND MORE ENJOYABLE »)

Every vehicle the player controls goes through one module (`src/transport/ownedModule.ts`) with its own `DriveSpec`: the Jakarta (and the Tiak Tiak loaner, the same bike), the Teranga, the Rafet, the Berline moderne (`compacte`), the Berline neuve, the Gaïndé and the Lamane Sport. Each was retuned on its own character, **never with one multiplier** (the gains differ from one vehicle to the next: `tests/driveAudit.test.ts` checks it).

### Before and after, measured

`tests/helpers/driveAudit.ts` drives each vehicle with the real controls (`DriveControls`) and the real drive step (`driveSteps`) at 60 Hz, no browser: `VITE_AUDIT=1 npx vitest run tests/driveAudit.test.ts` prints the table. « Before » is the same measurement on the previous numbers (commit `38aa8461`). Game seconds and metres: what the physics does, **not what a phone feels like**.

| | 0 → 50 km/h | 0 → cruise | 0 → 100 km/h (foot down) | cruise | top (foot held down) | stop from cruise | stop from 100 km/h |
|---|---|---|---|---|---|---|---|
| Jakarta | 3.0 → **1.8 s** | 3.8 → 2.6 s | 5.7 → 3.5 s | 63 → **72 km/h** | 130 → 140 | 19.2 → 17.3 m | 47.3 → **33.0 m** |
| Teranga | 3.6 → **2.3 s** | 5.0 → 3.6 s | 6.6 → 4.3 s | 68 → **77 km/h** | 166 → 166 | 25.0 → 21.7 m | 52.7 → **36.0 m** |
| Rafet | 3.3 → **1.9 s** | 4.8 → 3.3 s | 5.9 → 3.6 s | 72 → **85 km/h** | 176 → 187 | 26.7 → 22.7 m | 50.7 → **31.5 m** |
| Berline moderne | 3.8 → **2.5 s** | 5.3 → 4.1 s | 7.0 → 4.7 s | 68 → **79 km/h** | 151 → 162 | 25.4 → 23.1 m | 53.3 → **36.6 m** |
| Berline neuve | 3.2 → **2.1 s** | 5.0 → 3.8 s | 5.8 → 3.9 s | 76 → **86 km/h** | 198 → 202 | 29.0 → 24.8 m | 50.1 → **33.0 m** |
| Gaïndé | 3.4 → **2.3 s** | 5.1 → 4.0 s | 6.2 → 4.3 s | 74 → **83 km/h** | 184 → 191 | 28.3 → 24.4 m | 51.4 → **35.3 m** |
| Lamane Sport | 4.0 → **2.8 s** | 5.7 → 4.5 s | 7.3 → 5.1 s | 70 → **79 km/h** | 162 → 173 | 27.0 → 24.4 m | 54.0 → **38.7 m** |

(The stop from cruise is from a higher cruise than before, and still shorter.)

| | circle at a walking pace (radius) | U-turn between walls | radius the tyres allow at 50 km/h | full lock, standing | full lock, at cruise | backs 3 m (brake held) | reverse |
|---|---|---|---|---|---|---|---|
| Jakarta | 3.2 → **2.5 m** | 7.2 → 5.8 m | 15.4 → 12.1 m | 0.53 → **0.30 s** | 0.87 → 0.53 s | 4.7 → 3.5 s | pushed with the feet, 3.1 → 4.1 km/h |
| Teranga | 5.2 → **4.2 m** | 12.1 → **10.1 m** | 19.7 → 14.3 m | 0.78 → **0.40 s** | 1.32 → 0.75 s | 2.6 → 1.9 s | 10.8 → 16.2 km/h |
| Rafet | 5.3 → **4.5 m** | 12.3 → 10.7 m | 18.9 → 12.4 m | 0.75 → **0.37 s** | 1.30 → 0.72 s | 2.6 → 1.9 s | 10.8 → 16.2 km/h |
| Berline moderne | 5.6 → **4.8 m** | 12.9 → 11.3 m | 20.3 → 14.8 m | 0.82 → **0.45 s** | 1.35 → 0.85 s | 2.6 → 1.9 s | 10.8 → 15.1 km/h |
| Berline neuve | 6.0 → **5.2 m** | 13.8 → 12.2 m | 19.3 → 13.3 m | 0.85 → **0.47 s** | 1.47 → 0.93 s | 2.6 → 1.9 s | 10.8 → 15.1 km/h |
| Gaïndé | 6.1 → **5.4 m** | 14.3 → 12.7 m | 21.9 → 15.4 m | 0.92 → **0.48 s** | 1.57 → 0.95 s | 2.6 → 1.9 s | 10.8 → 14.4 km/h |
| Lamane Sport | 6.3 → **5.6 m** | 14.7 → 13.1 m | 23.5 → 16.8 m | 0.95 → **0.53 s** | 1.60 → 1.02 s | 2.6 → 1.9 s | 10.8 → 14.4 km/h |

Contacts (every vehicle): a wall met at 20° at 45 km/h with the pedal kept down left **1 %** of the speed a second later; it leaves **90–92 %**. A wall met square on at 30 km/h, then the brake held: 2.5 m clear of it in 2.4 s before, **1.8 s** now (a car; the Jakarta, pushed with the feet, 4.1 → 3.0 s).

The roads between districts, simulated driver (`tests/helpers/pilot.ts`), cruise / foot held down, game seconds, no contact in any run:

| Road | Jakarta | Teranga | Rafet | Berline moderne | Berline neuve | Gaïndé | Lamane Sport |
|---|---|---|---|---|---|---|---|
| Pikine ↔ Almadies, 1 477 m — before | 82 / 43 | 76 / 41 | 72 / 39 | 76 / 43 | 69 / 37 | 71 / 39 | 74 / 43 |
| — now | 71 / 39 | 67 / 37 | 61 / 33 | 65 / 38 | 60 / 33 | 63 / 35 | 66 / 38 |
| Corniche ↔ Plateau, 1 720 m — before | 96 / 53 | 89 / 49 | 84 / 47 | 89 / 52 | 81 / 44 | 83 / 47 | 87 / 53 |
| — now | 83 / 47 | 78 / 45 | 71 / 41 | 77 / 46 | 70 / 40 | 73 / 43 | 77 / 46 |

### What changed, and why it is not one multiplier

- **Each vehicle its own numbers** (`src/transport/modelCars.ts`, `premiumCars.ts`, `car.ts`, `moto.ts`): the **Jakarta** is the quick, tight one (the best launch, a 2.5 m circle, the quickest wheel, its lean; the lowest top speed); the **Teranga** the nimble city car (the tightest circle of the cars: a U-turn in a street); the **Rafet** the sporty, stiff one (the strongest pickup and brakes, the most grip, the most direct wheel); the **Berline moderne** its steadier big sister; the **Berline neuve** the grand saloon (the highest top speed, a long pull, a calmer wheel); the **Gaïndé** quick in a straight line and heavy in the turn; the **Lamane Sport** the heaviest (the slowest to launch, to stop and to turn, the calmest wheel, the least grip).
- **The wheel answers the thumb** (`src/transport/drive.ts`): each vehicle's steering follows about twice as fast as it did, and still calms with the speed (`STEER_CALM`), so a car at 150 km/h does not twitch. The pad's own smoothing is shorter (`PAD_FOLLOW`, `ridePad.ts`).
- **Brakes**: 10.2–12.6 m/s² (7.4–8.5 before), biting at 55 % at once and fully in 0.2 s (45 %, 0.3 s). The braking **sound is judged as it was mixed** (a full stop sounds as before, not louder); « hard brake » for the passenger is still a firm, held pedal.
- **Reverse**: the brake held at a standstill backs a car after 0.55 s (0.7), at 3.2 m/s² (1.6), up to 14–16 km/h (11); right after running into something, after **0.15 s**. The Jakarta is still pushed with the feet, a little faster.
- **Contacts** (`drive.ts`): the old response lost 40 % of the speed on **every frame** of a slide (frame-rate dependent: any touch at any angle was a dead stop, then a crawl along the wall with the pedal down), and a wall met exactly square on the city's grid was a « slide on the spot » (no rebound, reported as a scrape). Now: steeper than about 65° is running into it (a stop, a short roll back that clears the bumper, a head-on knock); a shallower contact slides and loses only what went into the wall, by the time in contact; from about 53° the nose is turned along the wall, fully under 30°, and a hair past it, so the car comes off the wall by itself. A slide in a slow frame keeps the rest of the frame (it dropped it: two thirds of the speed at 30 fps). Damage is unchanged per knock (`condition.ts`); a head-on stop now counts as head-on.
- **Camera** (`src/transport/camera.ts`, driving only): the chase view's heading and place catch up in proportion to how far they are behind. At full lock at 25 km/h the view fell about 60° behind (the driver saw the car's flank); it stays within 35° (`tests/vehicleCamera.test.ts`). A gentle bend is followed as calmly as before; a passenger's ride (car rapide, taxi) is unchanged. The pull-back and the wider angle with speed are as they were.
- **« Fast »** for the passenger and the street is 94 km/h (76), « very fast » 133 (119): above every cruising speed, as before.

### Do the streets and the roads take it?

- **District streets** are 14 m between the blocks' edges (a 10 m carriageway, 2 m pavements; `src/world/builder.ts` `ROAD`, blocks every 60 m). The three city cars turn round in 10.1–11.3 m (they needed 12.1–12.9: a three-point turn), the big ones in 12.2–13.1 m; the Jakarta in 5.8 m. A junction (a 6–9 m radius in the lane) is taken at about 32–42 km/h on the tyres' grip (28–34 before). On a 60 m block a car now reaches about 75–80 km/h and brakes back to junction speed in under 20 m.
- **The roads between districts**: `tests/driveRoads.test.ts` drives all seven vehicles down every road, both ways, at cruise and with the foot down: in lane to the end, no contact, the steering calm (it covered four vehicles; the Teranga, the Rafet and the Gaïndé were added).
- **Top speeds are almost unchanged on purpose** (140–202 km/h; 130–198 before): the road streams 340 m round the car, six seconds at 200 km/h, and the half-metre sub-steps (`driveSteps`) hold at that speed. The gain is in how fast a vehicle gets to its speed, turns and stops.

### What a tester on a real phone should feel (not verified on a device here)

1. **Pull away**: a thumb on the gas and the car is at town speed in two to three seconds, the motorbike sooner. It should feel eager, not violent; no lurch when the thumb only rests on the top of the pedal (a slow creep).
2. **Steer**: the wheel follows the thumb with no perceptible wait at parking speed; on the open road the same slide of the thumb moves the car less, and it never twitches.
3. **Brake**: the red pedal stops the car in about two car lengths from town speed, and the nose does not snap. Keep the thumb on it at the standstill: after half a second the car backs up, and « R » shows.
4. **Turn round** in a street with the Teranga in one sweep; with the Lamane Sport it takes the whole width.
5. **Touch a wall at an angle** at speed: a scrape, a little speed lost, the car straightens along the wall and goes on. **Hit one square on**: a knock, the car stops; the thumb on the brake backs it out at once.
6. **Corners**: the view swings with the car and still shows the street being turned into. If the swing feels too quick (queasy), say so: it is one number (`CAM_CHASE`, `ownedModule.ts`).
7. **Each vehicle is different**: the Rafet is the sharpest, the Lamane Sport the heaviest, the Jakarta the liveliest.

## The compact speedometer (`src/transport/speedo.ts`, `speedo.css`)

A 60–72 px disc with the speed and « km/h », shown **only while the player drives** (never on foot, never as a passenger). It stands on the left edge above the steering pad, with a gap that grows with the screen's height (the left thumb comes up from the corner: the disc is above its tip), away from the pedals, the minimap and the phone button, inside the safe areas, in both orientations; with a keyboard (no pad) it sits in the bottom-left corner. It reads **what the vehicle really covered in the frame** (the drive's odometer over the frame's time): a car held against a wall reads 0. Its text is written only when the whole number changes, at most ten times a second; its size is fixed and its figures tabular, so a new number moves nothing (`contain: strict`). The place chip no longer repeats the speed: it keeps the vehicle's name and its condition (« Teranga · 87 % »), and no longer shows the keyboard's hint under a thumb. Proof: `docs/proof/release/driving/`. Checks: `tests/speedo.test.ts`.


After the owner's play-test (27 Oct): « Replace the joystick with a Pad for easy left and right direction. Change the Frein and Accélérer shape to pedal shape. Add gist with the passenger on a VTC ride, like *dawalal ndank* (slow down) when speeding or *dama yakamti* (I am in a hurry). Create scenarios and variations. Create some gist with NPC passers-by: if I pass through one or am about to hit a car, I want reactions from the street. The street should react to me. »

## The pad (`src/transport/ridePad.ts`, `ridePad.css`)
- **Steering pad** under the left thumb (`#steerpad`), a joystick laid on its side: a wide pill with an arrow at each end and a knob. The thumb lands anywhere on it and **slides** left or right, never pressing a side: the wheel follows how far it has slid from where it landed (56 px is full lock, a small dead zone, a gentle curve; `rockerSteer`), the knob follows the wheel, and lifting the thumb brings it back to the middle. The wheel follows smoothly (`tick`).
- **Pedals** under the right thumb, upright, ribbed and **without words**: the green accelerator and the red brake, a little shorter (a car held at a standstill still backs up, as before). The accelerator: the top edge is a gentle throttle (0.35, for creeping into a bay); **from 40 % of the pedal down it is full throttle** (the cruising speed, 77–86 km/h for a car), and held there for 0.8 s the boosted range opens, so the longer the foot stays down the faster the car goes. (First version: a thumb on the middle of the pedal was only half throttle, about 36 km/h, and the boost needed the last 10 % of the pedal: the car felt stuck at 0–40 km/h.)
- The joystick is hidden and not read while driving (`ownedModule`: `fwd` from the pedal, `steer` from the pad). The camera is not dragged by a thumb on the pad. Desktop keys unchanged.
- The Klaxon button is shown on the pad now (it was hidden for screen space): the passengers and the street answer it.

## Speed: up to about 200 km/h
(The numbers of this section are in the table above since the release tuning.) The boosted top speed, opened by the held accelerator: Teranga 166 km/h, Rafet 187, Lamane 173, Gaïndé 191, the grand saloon (Prestige) 202, the Berline moderne 162, the Jakarta motorbike 140. The top is reached in well under 40 s (tests/drive.substep.test.ts); the wheel turns less sharply the faster the car goes (the tyres' grip: a bend at 160 km/h needs the brake). Each frame is cut into steps of at most half a metre (`driveSteps`, `src/transport/drive.ts`) so a fast car in a slow frame cannot jump through a thin wall. The road ahead streams in 340 m round the car (6 s at 200 km/h). The passenger's and the street's thresholds follow: « fast » is above 94 km/h, « very fast » above 133 km/h.

## What the drive tells the city (`src/transport/driveFeel.ts`)
The driven vehicle reports each frame; listeners get `fast` (above 26 m/s ≈ 94 km/h for 1.8 s), `veryFast` (37 m/s ≈ 133 km/h), `hardBrake` (one per braking), `crawl`, `smooth` (26 s without any of it), `crash` and `bump` (from the contact model), `honk`.

## The passenger (`src/transport/vtcBanter.ts`, played by `vtc.ts`)
- A temper by the passenger's seed and the hour: **calm**, **hurried** (the rush hours make calm and chatty ones hurried), **nervous**, **chatty**.
- Scenarios, each with variations by temper: `fast`, `veryFast`, `hardBrake`, `crash`, `bump`, `crawl`, `stopped`, `late`, `smooth`, `honk`, `chat`. The nervous say « Dawalal ndank ! » and « Dama tiit… », the hurried say « Dama yakamti ! Gaawal ! » when the car crawls or stands and approve a fast stretch, the calm smile, the chatty talk. The third « fast » of a ride gets the sharper lines.
- A pause between two lines (6 s), a longer one before the same scenario (16 s), a remark held back by the pause is made a moment later if it still stands, never the same variation twice in a row.
- The farewell follows how the ride went (rough, smooth, slow, plain).
- Wolof is the game's lexicon (`src/i18n/wolof.ts`, with the French gloss that Réglages › Langue can hide). Added: *Dawalal ndank*, *Dama yakamti*, *Bul gaaw*, *Dama tiit*, *Xoolal*, *Fii rekk*, *Wóoy*. The owner wrote « dawalal dank »: the standard spelling is *ndank* (as in the lexicon's *Ndank ndank*), so that is what the game says.

## The street (`src/crowd/streetReact.ts`, `streetVoice.ts`, played by `crowd/street.ts`)
For each person near the car (ten times a second, two at most per tick): `danger` (in its path within a second: a quick step aside, hands on the head, « Wóoy ! », « Tu veux ma mort ?! »), `close` (within a metre or two of the bodywork: a step, a fist, « Doucement ! », « Dawalal ndank ! »), `notice` (a fast pass: a look, sometimes a remark), `thanks` (a slow, careful pass: « Jërëjëf ! », applause). A crash makes the people within 22 m turn, stand up and ask « Ça va ? »; a horn is answered by someone ahead. Speech bubbles over the speaker (three at a time), a cool-down per person, nobody pops in or out in front of the player. No new draw call: poses are the crowd's existing reactions, bubbles are sprites.

## Checks
`tests/driveAudit.test.ts` (the audit above, and each vehicle's character), `collisionFeel.test.ts` (contacts and the way out), `speedo.test.ts`, `vehicleCamera.test.ts`, `driveFeel.test.ts`, `vtcBanter.test.ts`, `streetReact.test.ts`, `ridePadControls.test.ts`; `scripts/check-driving-feel.mjs` (real touch on a phone page: pad and pedals, a resting thumb that does not steer, sliding right and left, heel and toe, a walker driven at, a crash, a passenger aboard). `scripts/lib/realTouch.mjs` and `roadDrive.mjs` drive with the pad and the pedals, so the journeys that drive (Mermoz, trade, VTC) use the new controls.

## Not done
Other players do not see the street's reactions to your car (single-player feel). Traffic does not honk back. Not tried on a real iPhone.
