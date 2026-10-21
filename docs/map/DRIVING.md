# Continuous driving 2.0: controls, tuning, living roads, the stall

Branch `feature/driving-2-20261021` (from PR #59). The roads: `CORRIDOR.md`. The network of districts: `NETWORK.md`. Data and what is approximate: `PROVENANCE.md`.

## Controls (phone)

One left thumb on the stick, two buttons under the right thumb. Nothing else to find.

| | Stick forward | Stick sideways | Right thumb |
|---|---|---|---|
| **On foot** | the push sets the speed along ONE smooth curve: a light push is a slow walk through a shop, a moderate one the normal walk of a market, a strong one a jog, the stick fully out for a moment a sprint (it must be held ≥ 0.93 for 0.3 s: brushing the edge never sprints) | the way you go | nothing: the Footing / Sprint buttons are gone on mobile (Shift and double-tap Shift stay on desktop) |
| **Car** | throttle: a partial push is a lower, steady speed, a full push the cruising speed; releasing coasts down gradually | steering; a diagonal does both (steering into a bend keeps most of the throttle) | **Accélérer** (held): opens the boosted top speed (not a nitro: it builds over ≈ 0.9 s and fades over ≈ 1.6 s, never a step); **Frein**: progressive braking; stopped and still held for 0.7 s it eases into a gentle reverse (≤ 3 m/s), released it stops. A subtle « R » shows only while the car really moves backwards. There is no R button and no jump between forward and reverse: it has to stop first |
| **Jakarta** | same analog throttle | steering, with its lean | same Accélérer; the brake only ever brakes, it never reverses |

The logic is pure and unit-tested (`src/transport/controls.ts`, `tests/controls.test.ts`; walking: `src/game/stride.ts` `analogSpeed`). Stamina, exhaustion, fitness, gait animations and collisions are untouched: the analog walk goes through the same stamina rules as the old buttons (`Stride.analog`).

## Tuning (calibrated by travel time, not by taste)

Free-road top speeds (m/s; the previous values in brackets) and what that means on the 1.2–1.7 km roads, from `tests/driveRoads.test.ts` (a simulated driver with the real controls and physics on every road) and `scripts/check-drive-feel.mjs` (real touch, real browser, game seconds):

| Vehicle | Cruise | With Accélérer | Accel | Grip (v²/R limit) |
|---|---|---|---|---|
| Berline | 21 (19.5) | 32 | 4.6 | 10 |
| SUV | 19.5 (17.5) | 28.5 | 3.8 | 8.2 |
| Compact | 19 (16.5) | 29 | 4.0 | 9.5 |
| Jakarta | 17.5 (12.5) | 26.5 | 5.2 | 12.5 |

Berline and SUV are heavier and steadier (larger turning radius, lower grip, calmer steering response); the Jakarta is the nimble one (small radius, quick steering, lean). Steering gets calmer with speed (`steer / (1 + 0.035 v)`) and the radius grows with `v²/grip`, so no vehicle can turn tighter than its tyres hold; a worn car is slower and boosts less (`scaledDrive`, damage-scaled as before). The camera pulls back and widens a little with speed (`PassengerCamera.update`), and collisions are unchanged. **Audio is untouched**: the engine pitch follows the boosted range, not the volume; the approved mix is as it was.

## Why traffic stalled, and what was done

Two causes were found, each reproduced deterministically before being fixed (`tests/trafficStress.test.ts`):

1. **A stopped car could never restart on a fast device.** The traffic did `v += min(2.6·dt, …)` and then `if (v < 0.05) v = 0`. At 60 fps one frame of acceleration is 0.043 m/s, below that threshold, so a car at rest was zeroed again by the very step that set it moving. At 2–30 fps (every headless check I had run) the step is larger and the bug never showed, which is why it looked like a flake. The test fails on the old line at 1/60 and 1/120 s and passes at 1/20 and 1/30. PR #59 has the same line (it only masked the freeze by removing a car after 14 s). I cannot prove it is the exact cause of the one ~114 m / ~1 min stall seen once in five runs; it is the one defect found that fits and it is closed.
2. **The "deadlock recovery" never ran.** The test for it read `!c.pause` where `pause` is a countdown that goes negative: it was always false. A car stopped for good now passes through the player as a "ghost" after 22 s (11 s when it is the player it is stuck against), or is put elsewhere when far from the player. The player's own vehicle is never moved.

A third finding, in the roads rather than the traffic: **a road view attached round a player already far along it** (a reload, a swap) projected the player with a stale hint at the start of the road and decided the player was before the middle, so a reload at the far end flipped the district to the wrong one and back. It projects over the whole road when the hint is wrong (`corridorView.test.ts`, which fails without the fix on all three roads).

## Living roads

Reused kits, no heavy assets, free passing space always kept (the lanes are unit-tested clear):

* **Mixes by stretch**: lively dusty Pikine (car rapides, motos, pickups), fast arteries (buses, trucks, saloons), calm walled Almadies (saloons, SUVs, luxury), the dense approach to the Plateau (taxis, buses), the coastal mix on the Corniche. Pace follows the stretch (a market crawls, an artery flows).
* **Stops**: taxis, car rapides and buses see the kerb stops of the road (`Road.stops`), pull in, stand a few seconds with a few people waiting, and go on. Waiting people stand at the stops and the junctions' corners, off the carriageway.
* **Safe overtaking**: a car stuck behind a stopped one passes it by the other lane only when that lane is clear for a good way (and gives up, or never starts, when it is not).
* **Irregularities**: some cars hesitate for a moment; waiting drivers sound a quiet horn now and then (the game's own very quiet recorded horn; the mix is not raised); one or two vehicles wait at the side roads of a junction.
* **Nobody is trapped**: a car nose to nose with the player's vehicle backs off a few metres when nothing is behind it (a Jakarta cannot reverse); a stopped car recovers as above.

## What the checks run

| | |
|---|---|
| `tests/controls.test.ts`, `stride.test.ts` | the analog curves, boost, brake-to-reverse, no jump between forward and reverse, the walker's stamina rules |
| `tests/driveRoads.test.ts` | the simulated driver on every road, both ways, stick only and with Accélérer, for the berline, the SUV and the Jakarta: holds its lane to the end, never leaves the road, steering calm |
| `tests/trafficStress.test.ts` | deterministic stress of the real traffic against that driver: 40 seeds × 2 vehicles with a stopped car ahead (he always gets by), a car nose to a wall (the brake backs it away), 24 seeds × both directions × 70 s (never stuck for 20 s), the waiters off the carriageway, a stopped car moving off at 20/30/60/120 fps |
| `src/road/graph.test.ts`, `carteRoute.test.ts`, `corridorView.test.ts` | the ring of roads, routing through intermediate districts, frames closing, planned districts not routable, the map's card |
| `scripts/check-drive-feel.mjs` | real touch, game seconds: travel times, speeds, boost, brake-to-reverse and its « R » badge, the Jakarta never reversing |
| `scripts/check-network-trip.mjs` | Almadies → Corniche → Plateau and back (border street and road), Corniche → Almadies → Pikine and back: the districts crossed in order, the game in play mode on every frame, the driver in the seat with the pad and the speed kept, the same car (uid, paint, one copy) saved where the trip ends |
| `scripts/check-corridor.mjs` (each road) | the corridor flow, including stopping, getting out, walking, getting in, and a reload on the road |
