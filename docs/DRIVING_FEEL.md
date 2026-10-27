# Driving feel: the pad, the passenger, the street

After the owner's play-test (27 Oct): « Replace the joystick with a Pad for easy left and right direction. Change the Frein and Accélérer shape to pedal shape. Add gist with the passenger on a VTC ride, like *dawalal ndank* (slow down) when speeding or *dama yakamti* (I am in a hurry). Create scenarios and variations. Create some gist with NPC passers-by: if I pass through one or am about to hit a car, I want reactions from the street. The street should react to me. »

## The pad (`src/transport/ridePad.ts`, `ridePad.css`)
- **Steering pad** under the left thumb (`#steerpad`), a joystick laid on its side: a wide pill with an arrow at each end and a knob. The thumb lands anywhere on it and **slides** left or right, never pressing a side: the wheel follows how far it has slid from where it landed (56 px is full lock, a small dead zone, a gentle curve; `rockerSteer`), the knob follows the wheel, and lifting the thumb brings it back to the middle. The wheel follows smoothly (`tick`).
- **Pedals** under the right thumb, upright, ribbed and **without words**: the green accelerator (the lower the toe on the pedal, the more throttle: from 0.35 at the heel; with the toe on the floor for 0.6 s the boosted range opens; a light fills the pedal from the toe up) and the red brake, a little shorter (a car held at a standstill still backs up, as before).
- The joystick is hidden and not read while driving (`ownedModule`: `fwd` from the pedal, `steer` from the pad). The camera is not dragged by a thumb on the pad. Desktop keys unchanged.
- The Klaxon button is shown on the pad now (it was hidden for screen space): the passengers and the street answer it.

## What the drive tells the city (`src/transport/driveFeel.ts`)
The driven vehicle reports each frame; listeners get `fast` (above 15.5 m/s ≈ 56 km/h for 1.8 s), `veryFast` (22 m/s), `hardBrake` (one per braking), `crawl`, `smooth` (26 s without any of it), `crash` and `bump` (from the contact model), `honk`.

## The passenger (`src/transport/vtcBanter.ts`, played by `vtc.ts`)
- A temper by the passenger's seed and the hour: **calm**, **hurried** (the rush hours make calm and chatty ones hurried), **nervous**, **chatty**.
- Scenarios, each with variations by temper: `fast`, `veryFast`, `hardBrake`, `crash`, `bump`, `crawl`, `stopped`, `late`, `smooth`, `honk`, `chat`. The nervous say « Dawalal ndank ! » and « Dama tiit… », the hurried say « Dama yakamti ! Gaawal ! » when the car crawls or stands and approve a fast stretch, the calm smile, the chatty talk. The third « fast » of a ride gets the sharper lines.
- A pause between two lines (6 s), a longer one before the same scenario (16 s), a remark held back by the pause is made a moment later if it still stands, never the same variation twice in a row.
- The farewell follows how the ride went (rough, smooth, slow, plain).
- Wolof is the game's lexicon (`src/i18n/wolof.ts`, with the French gloss that Réglages › Langue can hide). Added: *Dawalal ndank*, *Dama yakamti*, *Bul gaaw*, *Dama tiit*, *Xoolal*, *Fii rekk*, *Wóoy*. The owner wrote « dawalal dank »: the standard spelling is *ndank* (as in the lexicon's *Ndank ndank*), so that is what the game says.

## The street (`src/crowd/streetReact.ts`, `streetVoice.ts`, played by `crowd/street.ts`)
For each person near the car (ten times a second, two at most per tick): `danger` (in its path within a second: a quick step aside, hands on the head, « Wóoy ! », « Tu veux ma mort ?! »), `close` (within a metre or two of the bodywork: a step, a fist, « Doucement ! », « Dawalal ndank ! »), `notice` (a fast pass: a look, sometimes a remark), `thanks` (a slow, careful pass: « Jërëjëf ! », applause). A crash makes the people within 22 m turn, stand up and ask « Ça va ? »; a horn is answered by someone ahead. Speech bubbles over the speaker (three at a time), a cool-down per person, nobody pops in or out in front of the player. No new draw call: poses are the crowd's existing reactions, bubbles are sprites.

## Checks
`tests/driveFeel.test.ts`, `vtcBanter.test.ts`, `streetReact.test.ts`, `ridePadControls.test.ts`; `scripts/check-driving-feel.mjs` (real touch on a phone page: pad and pedals, a resting thumb that does not steer, sliding right and left, heel and toe, a walker driven at, a crash, a passenger aboard). `scripts/lib/realTouch.mjs` and `roadDrive.mjs` drive with the pad and the pedals, so the journeys that drive (Mermoz, trade, VTC) use the new controls.

## Not done
Other players do not see the street's reactions to your car (single-player feel). Traffic does not honk back. Not tried on a real iPhone.
