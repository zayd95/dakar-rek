# Driving, release sprint: proof

Everything here was produced headless (Chromium with a software renderer, 2–5 frames a second) against the build of branch `wp/drive`. **None of it says how the game feels or runs on a phone.**

## The compact speedometer

Real touch on phone-sized pages (the Teranga is boarded through its door, the gas pedal is held with a finger), and the keys on a desktop page.

| File | What it shows |
|---|---|
| `phone-390x844-on-foot-no-speedometer.jpg` | on foot: no speedometer |
| `phone-390x844-at-the-wheel-stopped.jpg` | at the wheel, stopped: « 0 km/h », on the left edge above the steering pad |
| `phone-390x844-at-the-wheel.jpg` | at the wheel, moving: the actual speed |
| `phone-320x568-at-the-wheel.jpg`, `phone-430x932-at-the-wheel.jpg` | the narrowest and the widest phones: 60 px and 72 px |
| `phone-844x390-on-its-side-at-the-wheel.jpg`, `phone-568x320-on-its-side-at-the-wheel.jpg` | a phone on its side: beside the pad's right end (the left column is full there) |
| `desktop-1280x720-at-the-wheel.jpg` | keyboard, no pad: the bottom-left corner |
| `speedometer-boxes.json` | for each of the six viewports: the speedometer's box and every other HUD element's (the pad, the pedals, the horn, the minimap, the phone button, the place chip, the wallet, the goal line), **no overlap** in any; absent on foot; « 0 km/h » at a stop; gone after stepping out; no page error |

The place chip (top) no longer repeats the speed: it reads « Teranga ».

## The handling audit

`audit-before.txt` and `audit-after.txt`: the table of `VITE_AUDIT=1 npx vitest run tests/driveAudit.test.ts` on the previous numbers (`38aa8461`) and on this branch (the real controls and drive step at 60 Hz, no browser). Read with `docs/DRIVING_FEEL.md`.

## Real-touch checks run against this build (`logs/`)

| Check | Result |
|---|---|
| `check-driving-feel.mjs` (the pad and pedals, steering both ways, the street's reactions, a crash, a VTC passenger's remarks on a fast stretch and a hard brake) | 18/18 |
| `check-moto.mjs`, phone (the Jakarta bought, ridden, steered, into a wall, a delivery, parked, reloads) | 18/18 |
| `check-top-speed.mjs` (the middle of the pedal passes the cruising speed; the open road at 156 km/h, the district swap at speed) | 5/5 |
| `probe-vtc-dropoff.mjs` (the last leg of the VTC journey, the one that stalled: to the Grande Mosquée's kerb) | arrived 0.7 m from the drop-off, no contact, no unstick |
| `check-vtc-ride.mjs`, `check-almadies-parking.mjs` | see the release report (the results are in `logs/` when they were run to the end) |
