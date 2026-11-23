# VTC passengers: proofs

These films and contact sheets are frame-stepped, so they play at game speed whatever the frame rate. They were shot on headless SwiftShader, not on a phone.

- `vtc-boarding.mp4` / `sheet-board.png`: the passenger waits on the pavement and greets the driver. They walk to the rear door on their side, the door opens, they duck in and sit, and the door shuts.
- `vtc-riding.mp4` / `sheet-ride.png`: the passenger is seated in the rear, seen through the glass, and sways with the body.
- `vtc-exit-walkaway.mp4` / `sheet-exit.png`: at the drop-off the door opens on the pavement side and the passenger steps out. They walk away along the pavement and fade only once far from the camera, after about 20 m in the tests.
- `fit-4cars.png`, `fit-2cars.png`, `fit-measured.json`: seat fit per car, with the head under the roof and the shoes above the floor. Measured in game for the driver and the tallest passenger look (headwrap).
- `marks-vtc-vs-tiak.png`: the same street, a VTC ride on the left and a Tiak Tiak delivery on the right.
  - VTC: a green car badge and a green kerb bay where to stop.
  - Tiak: an orange parcel badge.
- `payonce.log`: a ride inside Pikine.
  - The 1,000 F fare is paid once, with one ledger line.
  - The completion card shows.
  - The passenger walks 20.3 m before fading.
  - Reloading pays nothing again.
- `check-vtc-ride.lane.log`: the long Pikine → Plateau ride, 13/19 on the lane's build.
  - Boarding, riding, the reload mid-ride and the markers passed.
  - The touch-driven car did not reach the Plateau drop-off in that run (traffic and route), so the 6 arrival checks did not run to the end.

The films predate the last two lane fixes: see-through glass only on the authored bodies, and the Sandaga spot. Fares are unchanged: Corniche → Plateau stays at most 5,000 F.
