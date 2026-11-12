# Continuous driving: Almadies ↔ Corniche

One route, proven end to end: the car bought at Prestige Auto in Almadies is driven south and **crosses into the Corniche on its own wheels** — same car, same seat, same speed — and back. No map trip, no fade, no menu, no teleport.

## How it works

Every district is built on the same street grid (`GRID`: 5 roads, pitch 60 m). Laid end to end, the south perimeter road of Almadies (z = +120) *is* the north perimeter road of the Corniche (z = −120). `src/transport/hubLink.ts` declares that link on the street of column 1 (x = −60):

* the car crosses the perimeter road's centre line on that street (within 5.5 m of its centre line, going the right way);
* it comes out in the other district at `z ∓ 240`, **same x, heading, speed**;
* only the hub loaded around the car changes — at the instant both worlds show a road crossing.

`OwnedVehicleModule.cross()` saves the same car as parked in the new district at the new pose and asks `ctx.crossHub` (`main.ts`). The hub is built at the **start of the next frame** (not inside a module's `update`). `hubLoaded` then puts the player in the driver's seat again (`resume()`): speed, steering, odometer, the **engine** (never stopped), the **touch pad** (never hidden — fingers stay on the pedals) and the **camera** (it lives relative to the car, so it does not jump in the new coordinates) are kept.

Not crossing: a trial car (the dealer's, not the player's), a car being left (`leaving`), anything with the game not in `play` mode, any other street, any other district pair. Those keep the map trip.

## Evidence (Chromium, real CDP touch input, `DRIVE_ON=1 scripts/check-prestige-flow.mjs`, 34/34 on the way out and back as first written; 43/43 with the return leg proven as fully as the way out, see below)

Real Prestige purchase → reload → the owner gets in through the real door → backs out with R → drives the road with a thumb on the gas and one on the stick:

| What | Result |
|---|---|
| district changes on the route | exactly one, Almadies → Corniche |
| pose across the swap | dx 0.00 m, dyaw 0.01 rad, travel 0.7–0.9 m in the swap frame at 7–9 m/s (one frame of driving) |
| speed | 6.9 → 7.2 m/s, 9.0 → 9.3 m/s (kept) |
| 80 frames around the swap | player seated, pad up, engine running, `play` mode on every one |
| camera relative to the car | moved 0.01–0.05 m |
| the car | same colour seed, still owned, saved as parked in the Corniche, one copy |
| collisions in the Corniche | the car hits a building and stays out of it |
| reload in the Corniche | player beside the same car there, not duplicated |
| the way back | Corniche → Almadies while driving, one swap, speed kept |
| JavaScript errors | none |

Unit: `tests/hubLink.test.ts` (8): both directions, a fast step cannot jump the line, no ping-pong after arrival, off-street / other districts do not cross.

## The way back, and the 33/34 (20 Oct): the route, not the game

`DRIVE_ON=1` stopped at 33/34 on `the way back works too`: after a reload the car stood across the Corniche's carriageway (heading east-south-east, where the wall test had left it, x −63) and the forward-only pilot crawled along the east kerb until its stall rule gave up (`BACK end` at x −54.5, still in the Corniche).

Diagnosed before any change, with the same save (a berline parked there) and the real touch controls:
* the game was not the cause: from that pose the same pilot **did** get through when it was given time (it grinds along the kerb for about 12 m at 0.5–1 m/s, then crosses into Almadies, one swap, speed kept); and a multi-point turn with the real controls (lock, forward, « R », back) turned the car to face north in 12 s of game time and it crossed cleanly;
* the street is the limit: the berline's turn radius is 6 m, a forward-only quarter-turn from a heading of 1.13 rad needs about 8.6 m of sweep plus the half width of the car, and the carriageway is 11 m wide with the car already 1.2 m from the west kerb. A driver reverses; the pilot (`scripts/lib/realTouch.mjs`) only goes forward and gave up on a slow, legitimate crawl.

Fix, in the checks only (no game code, the assertion is unchanged): `turnAround()` in `scripts/lib/realTouch.mjs` turns the car round with the real controls before the return leg. The check now also proves, on the way home, what it proved on the way out: pose and speed continuous across the swap, seat / pad / engine on every frame, camera offset kept, the same car and the same asset record (uid, condition neither reset nor healed), then the brake to a halt, « Descendre », the player on foot beside the parked car with the pad gone and the engine stopped, and a reload beside it. `DRIVE_ON=1 SKIP_LAP=1 scripts/check-prestige-flow.mjs`: **43/43** (it was 33/34). `scripts/film-continuous-drive.mjs` films the round trip (`docs/vehicles/continuous-drive-roundtrip.mp4`, 17/17 checks on its own run).

## The cost, honestly: a hitch at the border

The new district is built synchronously. In headless Chromium (software GL) the build takes **≈ 0.8 s** and the frame gap at the swap is **≈ 1.5 s**. The game's clock does not advance during it, so the car does not jump — but the picture freezes for that long. **Not measured on a real iPhone.** Ideas if it is too long there (not done): build the next district in slices ahead of the border, reuse shared geometry/textures between districts, or do the slow part (textures/shaders) a few seconds before the line.

## Limits / not done

* Only Almadies ↔ Corniche, column 1 street. Plateau and Pikine are not linked (the grid is the same, so adding a link is one table row — but each needs the same proof and a phone measurement first).
* The decorative traffic, crowd and people of the new district are built fresh by `loadHub` as for any arrival; nothing was changed there. The rapides/traffic obstacles are re-read from the new district.
* Multiplayer: the crossing is a district change like any other (`presence.join` for the new hub). The multiplayer check is run separately.
* Save: unchanged (v6). The car's parked record simply names the new district; a reload mid-trip puts the player beside it there.

## Visual Pass coordination

None needed: no building, road, tree, market or street dressing was touched. (Recorded for the Visual Pass: trees standing in Almadies roads.)
