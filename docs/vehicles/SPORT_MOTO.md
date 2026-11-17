# The sport motorbike: the « Sabar 600 » (Dakar Rek 1.0.1)

The owner asked for « the sport motorcycle … more affordable like 2.000.000 … in two concessionaire with different colors », with Meshy credits allowed.
The Sabar 600 is a faired sport bike (low clip-ons, a raised tail, rear-set pegs), an original design with no brand, badge, lettering or plate, sold at
**2 000 000 F** at **Garage Modou (Pikine) in « rouge et blanc »** and at **Ndiaye Auto (Plateau) in « jaune et noir »**. It is one ownable asset (`sabar`, a
new catalogue id: the save format is unchanged) on the same owned-vehicle system as every other vehicle.

| | |
|---|---|
| Code | `src/transport/sportMoto.ts` (the body's numbers, the kit spec, the transport spec, the handling), `src/transport/sportMotoModule.ts` (the two stands, the module) |
| Body | `public/assets/vehicles/sabar.glb` (+ `sabar.json`, `sabar.jaune-noir.jpg`), built by `node scripts/vehicles/build-sport-moto.mjs` from `assets-src/vehicles/sabar.build.json` |
| Pose | `RideSport` in `src/actors/humanoid.ts` |
| Checks | `tests/sportMoto.test.ts`, `scripts/check-sport-moto.mjs` |
| Captures | `docs/vehicles/sport-moto/` |

## The model and its source

Meshy text-to-3D through the pinned CLI (`npm exec --package=meshy-cli@0.4.0`, credentials in `~/.config/meshy`), every preview looked at (rendered from six
sides) before paying for the next step. Balance **840 → 785: 55 credits**.

| Step | Task id | Credits | Kept? |
|---|---|---|---|
| Preview 1 | `01a1e27e-4e1f-754c-bb2e-40654fe9642d` | 20 | No: a half-faired sport-tourer with raised bars and an exposed engine |
| Preview 2 (« supersport », full fairing, belly pan, clip-ons under the screen) | `01a1e283-6404-772c-a16f-a4c2dcbceedb` | 20 | Yes |
| Refine of preview 2 (texture 2k, no PBR: the game is Lambert) | `01a1e288-4764-7498-81f0-d170875f5da1` | 10 | Yes: the source of the GLB |
| Remesh of the refine to 9 000 triangles | `01a1e28a-fa99-7236-a34e-325b5b011d24` | 5 | No: it lost the windscreen; the triangles were cut locally instead |

The prompt (in the manifest) names no brand and asks for no logo, lettering or plate. The refine still drew a winged round badge on the tank, a lettered decal on
each flank of the fairing, small lettering on the nose and on each side of the tail: the build paints all of them plain (`paintout`, below). The raw Meshy files stay
in the git-excluded `assets-src/meshy_output/sport_moto/`.

## The parts, and how it steers

A generated motorbike is one fused, textured shell. `scripts/vehicles/build-sport-moto.mjs` cuts it by geometry alone (no hand edit; the same output every run):

1. turned to face +z with its left at +x, scaled **uniformly** to 2.0 m long (the wheels stay round), on the ground, centred;
2. each **wheel** found by a circle fitted to its tread (side view, the outer half and the bottom of the tyre only) and cut out: whole triangles inside the tyre's
   disc and within 7 cm of the centre plane (tyre, rim and discs; the fork legs and the swingarm stay). Node `axle_fr|rr` at the hub > `wheel_*`, spun about X;
3. the **steering axis**: a line fitted to the fork legs in the side view, **27.8° of rake**, through the top clamp (0, 0.977, 0.340) and within 1.5 cm of the
   front hub. The **front end** is every whole triangle of the fork legs (within 11 cm of the axis), the front mudguard (just outside the front tyre) and the
   clip-ons with their grips and levers (the mirrors stay on the fairing). Node `steer` (at the top clamp, its +Y IS the axis) > `fork` (turned about its own Y by
   the game) > the front end's mesh and the front axle with its wheel. So the fork, the front wheel, the mudguard and the clip-ons turn together about the raked
   axis, as on a real bike; the fairing, the screen and the headlights stay with the frame (a sport bike's upper fairing is frame-mounted);
4. **paint**: the badge-like marks painted plain in texture space (the triangles inside four spheres, mirrored on both sides); the white panels and the red accents
   classified per texel and recoloured into each colourway with their shading kept: rouge et blanc (red panels, white accents) is the GLB's own texture,
   jaune et noir (yellow panels, black accents) a 1024-px JPEG beside it;
5. the shell's triangles nobody ever sees (81 orthographic ID renders from round and above, the shell alone as the occluder) are dropped: 2 082 of 9 924;
6. written with KHR_mesh_quantization, read back and checked (both wheels on the ground and round, wheelbase, rake, the node tree, size, triangles, file size).

At run time (`src/actors/glbVehicle.ts`) the rig finds the `fork` node and turns it with the steering (±0.6 rad at most, as the kit's), the wheels spin with the
distance ridden, and `animateVehicle` leans the whole body into a corner (up to 0.55 rad, the Jakarta 0.45) and reports the lean the rider follows. A body that
fails to load falls back to the kit's motorbike in the stand's main colour.

## The numbers

| | Sabar 600 | Jakarta 125 |
|---|---|---|
| Price | 2 000 000 F | 150 000 F |
| Top speed / boosted (m/s) | 24 / 50 | 20 / 39 |
| Pick-up / brakes (m/s²) | 11.5 / 14 | 8.6 / 12 |
| Turning circle (m) / grip | 2.9 / 18 | 2.5 / 16 |
| Length × width × height (m) | 2.00 × 0.89 × 1.31 (mirrors included) | 1.95 × 0.75 × 1.15 |
| Wheelbase, wheels | 1.32 m, r 0.334 / 0.330 | 1.27 m, r 0.30 |
| Seat, grips, pegs (vehicle frame) | seat 0.85 m at z −0.28; grips (±0.31, 1.04, 0.36); pegs (±0.15, 0.36, −0.14) | seat 0.90; grips (±0.36, 1.08, 0.33) |
| Triangles, meshes, file | 14 099 (shell 7 842, front end 2 072, wheels 2 319 + 1 866), 4 meshes, 1 material, 860 kB + 228 kB (second colourway) | the kit's procedural model |

Its boosted top speed stays under the cars' (the berline 56 m/s, the Gaïndé 53): the streets, the collisions and the roads between districts already carry those.
The shipped cars are 7 600–12 900 triangles and 0.28–1.2 MB: the Sabar is in that range. Beyond 38 m its four meshes merge into one (the existing far model of
glbVehicle), beyond 70 m a coarse one.

Sound: the Jakarta's recordings through a `sport` profile (`src/transport/vehicleAudio.ts`): a lower idle, revs that climb higher, six gears, a little more
swell with the throttle, still quieter than a car; the motorbike's horn a touch lower.

The rider: `RideSport`, tucked: the back leaning forward over the tank, the neck lifted to look up the road, the hands down on the clip-ons (on a Meshy body the
arms are solved so the palm closes on the grip), the knees on the tank, the feet up and back on the rear-set pegs. Others online see the usual `Ride`.

Views: « Derrière la moto » (chase), « Au guidon » (over the rider's shoulders, the bars and the screen in view) and « Vue d’en haut », each with its framing for
a phone held upright.

## The two dealers and their colours

| | Garage Modou (Pikine) | Ndiaye Auto (Plateau) |
|---|---|---|
| Colourway | **rouge et blanc** | **jaune et noir** |
| Stand | on the pavement just west of the workshop, in the gap between it and the quincaillerie (clear of the repair bay and the Jakarta's corner), the road z = 0 | on the pavement just past the showroom's south corner, the road x = 120 |
| Bike on show | the Sabar in red, nose turned to the road, its price card « MOTO · Sabar 600 · 2 000 000 F · ROUGE ET BLANC · PRIX FIXE » | the same in yellow, « … JAUNE ET NOIR · PRIX FIXE » |
| Sign | « SABAR 600 · Garage Modou · Pikine » | « SABAR 600 · Ndiaye Auto · Plateau » |

Garage Modou's own corner has no room for a third bike between its two Jakartas and the crossroads, and Ndiaye Auto's hall has its three car lots: each stand is
therefore beside the dealer, on its own pavement, with its own counter (« Garage Modou · Motos sportives », « Ndiaye Auto · Motos sportives »).

The sale works like every other vehicle: « Voir les articles » → « Essayer gratuitement » (that stand's colour at the kerb, handed back when the rider gets off)
or « Acheter · Sabar 600 <colour> » → the price, the wallet and the colour shown → « Confirmer l’achat » → paid once through the asset model (one wallet line),
delivered at the kerb in front of the stand in that colour (its paint seed saved), listed in « Biens », sold there, parked where left, saved across reloads.

**One bike.** Bought at one dealer, the other keeps its own on show (its stock, in its colour) but its two offers are greyed « Tu as déjà ta Sabar 600 rouge et
blanc » (or jaune et noir): the player owns one Sabar, in the colour of the dealer where it was bought. Sold, both dealers sell it again.

Elsewhere: the phone's dealers list has both stands; « Mes véhicules » finds it (🏍️); the arena's guarded moto lot and its « Ce soir » sheet take it as they take
the Jakarta; the villa's bays take it; the bank's advice and the pistes do not count it as a car (no VTC). « Autour de moi » lists no vehicles and no dealers: nothing
to add there.

## Checks

- `npx tsc --noEmit`: clean; the server's typecheck (`tsc -p server/tsconfig.json`): clean (nothing it covers changed).
- `tests/sportMoto.test.ts`: 14 tests (the catalogue entry and price, the two dealers and paints, the price card, the stands' places, the handling, the
  sound, the shipped GLB and sidecar against the game's numbers, the fork turning about the raked axis and both wheels spinning, the lean, RideSport on the v4 rig
  and on palm bodies, owning it once with its colour saved). The 21 neighbouring files (poses, glbVehicle, moto, tiakMoto, audio, findVehicle, premiumCars,
  carDealer, garage, vehicleKit, arenaArrival, hands, presence, driveAudit…): 222 tests, all passing.
- The full suite, once: 4 077 passed, 4 skipped, 1 failed: `tests/assets.test.ts` listed the drivable vehicles without the Sabar; updated to the new
  behaviour (the Sabar is drivable and for sale at 2 000 000 F), 39/39 since.
- `scripts/check-sport-moto.mjs` (desktop 1280×800 and phone 390×844 with real touch, then the pose on three bodies): **44/44** on the final build.
  The first run was 40/44: the check read a greyed item's class wrongly and read the sale's record a frame too early (both fixed in the check, not the game).
  Over 3 s of game time from a standstill: Sabar 35.2 m/s, Jakarta 26.5 m/s (desktop, boost held); 35.0 against 25.4 on the phone. The fork turned 0.31 rad
  (desktop) and 0.58 rad (phone) under the stick.

The regression checks the brief names, on the unchanged branch point and on this branch:

| Check | before (9b82218a) | after |
|---|---|---|
| `check-moto` (the Jakarta) | 36 pass, exit 0 | 36 pass, exit 0 |
| `check-garage` | 15/15 | 15/15 |
| `check-tiak-moto` | 57 pass, exit 0 | 56 pass, 1 fail: phone/Pikine « during a Tiak run the parcel is in the box » (the same step passed on desktop in that run; the lent bike's box code is not changed here; a re-run waited two hours for the shared browser lock and never ran) |
| `check-dealers` | fails at its first step: it expects four dealers in the Carte's list, which had seven already | fails at the same step (nine rows: the two Sabar stands added) |

`check-dealers` was already failing before this package (its expected list is older than the dealers the game has); it was not changed here. The
`check-tiak-moto` step is most likely a timing flake of the headless phone run (the check forces a run and reads the box 600 ms later), but that is not verified.

Captures (`docs/vehicles/sport-moto/`, desktop and phone): `*-modou-stand.jpg`, `*-ndiaye-stand.jpg` (the two stands), `*-riding.jpg` (ridden at speed),
`*-rider-pose.jpg` and `pose-v4|homme|femme.jpg` (the tucked rider up close on the three bodies), `*-fork-steered.jpg` (the front end turned, the bike leaning).

## Limits

- The mirror stalks stay on the fairing while the clip-ons turn under them: at full lock a bar passes close to a stalk. A few tiny shards of the levers stay on the
  frame (a centimetre or two, seen only up close at full lock).
- The wheels keep Meshy's triangles (2 300 and 1 900): simplifying them without welding their UV seams did not reduce them, and welding smeared their texture.
- The colourways are recoloured texels: where Meshy drew a soft edge between white and red a thin pinkish line can remain; a small red mark stays at the front of
  each flank decal.
- No side stand: the bike stands upright when parked (the Jakarta shows its stand).
- The body is preloaded with the other bodies at start: about 1.1 MB more to download (GLB and the second colourway).
- The tucked pose is checked numerically on the shipped v4 rig and on palm bodies at two scales, and seen on the v4 and the two Meshy bodies in the captures;
  it was not checked on a phone's GPU.
