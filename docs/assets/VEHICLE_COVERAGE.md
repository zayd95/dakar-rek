# Drivable vehicle categories: what we already own

Picture: `docs/vehicles/coverage.jpg` (every body the game owns, drawn by the game, labelled). Regenerate: `npx vite --port 5199` then `node scripts/vehicles/shoot-coverage.mjs`.
No Meshy credit spent for this. Branch `asset/vehicles-furniture-20261018`, local only.

## Coverage

| Category | Catalogue entry | Body we own | Drivable | Tested in game |
|---|---|---|---|---|
| Motorbike | `jakarta` · Moto Jakarta · 150 000 F · Garage Modou, Pikine | the kit's red 125 cc (procedural) | **yes** | `check-moto`: desktop all pass; **phone: 3 of 18 fail (joystick does not move the bike), identical on the original baseline `6789c6e`, so not from this work, not yet investigated** |
| Courier bike (lent, never owned) | `tiak` | the kit's green moto | **yes** | `check-tiak-moto` 57 / 57 (one parcel check flaked once under load, 18 / 18 alone) |
| Modern compact sedan | `compacte` · Berline moderne · provisional price · Ndiaye Auto, Plateau | **generated GLB** (Stage A, 7 606 tris) | **yes** | `check-car` 44 / 44 |
| Premium saloon | `berline` · Berline neuve · 14 000 000 F · Prestige Auto, Almadies | the kit's `luxury` saloon, **interim** | **yes, new** | `scripts/check-prestige-flow.mjs`, `tests/prestige.test.ts`, `tests/premiumCars.test.ts` |
| Luxury SUV | `tout_terrain` · 4 × 4 de luxe · 75 000 000 F · Prestige Auto, Almadies | the kit's `suv`, **interim** | **yes, new** | `scripts/check-prestige-flow.mjs` |
| Urban scooter | none | the kit's scooter (a cargo scooter, white) | no | model only |
| Pick-up | none | the kit's `pickup` (traffic, deliveries) | no | model only |
| Delivery truck | `camion` · 32 000 000 F · still « soon » | the kit's `truck` | no | model only |
| Taxis, car rapides, buses | not player-owned | kit models | untouched | n/a |
| Aircraft | `soon` only | none | no | n/a |

Four vehicles can now be bought, driven, parked and found again, all on **one** system (`OwnedVehicleModule`): price shown then confirmed, paid once, delivered at the kerb, drive, park where left, saved (save v5 unchanged, counters keyed by asset id), listed and sellable in « Biens ». The two new ones are the kit's bodies behind the existing recipe; when Stage B / C bodies exist they plug in through `visual` and nothing else changes.

## The Jakarta you generated: not found

- **Meshy account** (CLI, read-only, signed in as the account that holds the 905 credits): three projects only, the two characters and the modern sedan (every task type listed: text-to-3d 6, remesh 3, rigging 2, nothing else). No motorbike.
- **Google Drive** (titles containing « jakarta », « .glb », « moto »): nothing.
- **Higgsfield** generation history: the connector errored twice, so unchecked.
- **Repo, every local and remote branch, this machine's disk:** no motorbike GLB. The game's Jakarta is the kit's procedural 125 cc. The only other bike on disk is the Kenney *Starter Kit Racing* motorcycle (code MIT, models CC0; the kit also has four trucks), in `/tmp`, not in the repo, toy-styled; nothing uses it.

If it exists, send the GLB (or the Meshy task id and the account / profile it is in). A generated motorbike is **harder than a car** here: `docs/assets/README.md` « Not yet handled: two-wheelers » (the fork and handlebar must steer, a fused shell cannot do it without a manual cut), and the **Ride pose, the grips and the lean are calibrated to the kit's 125 cc**. Expect a half day to a day of work, not hours.

## What I did not touch
Traffic, taxis, car rapides, buses, the Tiak loaner, the economy numbers (the two new prices and handling are the catalogue's old placeholders and a guess, **provisional until the economy pass**), save format.

## Honest quality note
The kit's `luxury` saloon and `suv` are the boxy 1980s-1990s bodies (see the sheet). Drivable and correct, but they do not look like a 14 M F or 75 M F purchase. Stages B and C exist to fix exactly that; nothing else about them has to be redone.
