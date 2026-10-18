# Player-owned vehicles: inventory and plan

Scope (decided): vehicles a player earns money to buy, own, drive, park and retrieve. Not part of character creation, never given for free, kept separate from the Tiak Tiak loaner. **No change** to traffic, taxis, car rapides, buses or any public transport. No Meshy credit, no new generated asset. This document is an inventory and a plan: nothing below is implemented yet (the avatar work is; see `docs/meshy/PLAYER_SELECTION_REPORT.md`).

Branch: `feature/meshy-hero-bodies-20261017`, from `6789c6e`. A trial merge (`git merge-tree`) with `feature/m1a-freedom-economy-20261017`, `feature/wrestling-ordinary-purses-20261018` and `feature/tiak-moto` is clean today.

## 1. What exists

### Ownership, driving, parking, saving: one generic system, already working for two vehicles

| Piece | Where | What it does |
|---|---|---|
| Catalogue | `src/economy/catalog.ts` `VEHICLES` | name, price, tier, where sold; a `soon:` text blocks buying |
| Ownership | `src/economy/assets.ts` (`buyAsset`, « Biens », sale) | one wallet line « Achat : … », paid once, listed, sellable; unknown ids are ignored by older code (`!!specOf` guards) |
| Parking spot | `src/transport/owned.ts` | counters `vehicle:<asset>:hub\|x\|z\|yaw` in the v5 save, **no schema change**; no record = waits at its dealer's kerb; unparked when sold |
| Module | `src/transport/ownedModule.ts` `OwnedVehicleModule(def)` | dealer corner (sign, displays, price card, desk), « Voir les articles » → price shown → « Confirmer » → delivered at the kerb; « Monter » / drive (collisions, stairs, hub edge) / « Descendre » → parked as a solid footprint, saved, a reload mid-drive parks it where it is |
| Spec | `src/transport/moto.ts`, `car.ts` | the kit model turned into a transport `VehicleSpec`: seats, doors, **cameras** (chase, wheel, top; phone-portrait variants), handling (`drive`: max speed, accel, brake, turn radius, lean) |
| Loaner | `tiakMoto` in `motoModule.ts`, asset id `tiak` | lent, free, in every hub, never owned or sold: **separate and stays separate** |
| Guards | `tests/moto.test.ts`, `car.test.ts`, `carDealer.test.ts`, `tiakMoto.test.ts`, `poses.test.ts`, `vehicleKit.test.ts`; `scripts/check-moto.mjs`, `check-car.mjs`, `check-tiak-moto.mjs`, `check-vehicle-assets.mjs`, `perf-vehicles.mjs` | buying once, delivery, boarding, driving, reload, parking, both vehicles owned side by side (`car.test.ts`) |

Catalogue today:

| id | name | price | state |
|---|---|---|---|
| `jakarta` | Moto Jakarta | 150 000 F | **drivable**, dealer « Motos · Garage Modou » (Pikine) |
| `clando` | Voiture d'occasion (used saloon) | 2 800 000 F | **drivable**, dealer « Ndiaye Auto » (Plateau showroom, 3 lots) |
| `berline` | Berline neuve | 14 000 000 F | in the catalogue, `soon` (« avec la conduite ») |
| `tout_terrain` | 4 × 4 de luxe | 75 000 000 F | in the catalogue, `soon` |
| `camion` | Camion de livraison | 32 000 000 F | `soon`; out of scope here |
| (none) | urban scooter | — | **not in the catalogue** |

### Models available (procedural vehicle kit, `src/actors/vehicleKit.ts`, free, already LOD'd)

Picture of each (three views): `docs/vehicles/proof/lineup.jpg`; numbers: `docs/vehicles/proof/inventory.json` (regenerate: `npx vite --port 5199` then `node proof/vehicles/run.mjs`).

| model | kit | colour | size L×W×H (m) | seats | far LOD tris |
|---|---|---|---|---|---|
| jakarta — owned today | moto (seed 8, variant 0) | #c0392b | 1.95 × 0.75 × 1.15 | 2 | 34 |
| tiak loaner (not owned) | moto (seed 2, variant 4) | #2e8b3c | 1.95 × 0.75 × 1.15 | 2 | 34 |
| scooter candidate | moto (seed 1, variant 13) | #e8e8e4 | 1.95 × 0.75 × 1.15 | 2 | 34 |
| used saloon — owned today | sedan (seed 18, variant 3) | #b9bdc2 | 4.5 × 1.78 × 1.43 | 5 | 78 |
| saloon white / blue (dealer displays) | sedan (seeds 7, 1) | #f2f2f0 / #1f3f78 | 4.5 × 1.78 × 1.43 | 5 | 78 |
| modern saloon candidate (`berline`) | luxury (seed 1, variant 5) | #9da3a9 | 5.15 × 1.92 × 1.45 | 5 | 78 |
| premium SUV candidate (`tout_terrain`) | suv (seed 6 black, 7 white) | #1a1b1d / #f2f2f0 | 4.85 × 1.94 × 1.9 | 5 | 142 |
| pickup, truck | pickup, truck | — | 5.2 / 7.4 long | — | out of scope |

Every kit kind has the anchors the owned-vehicle system needs: driver seat, doors, `chase` / `driver` / `passenger` / `side` cameras. **The Jakarta is the kit's red 125 cc**; the owned asset is procedural, there is no Meshy Jakarta in the game (see § 4).

## 2. Honest findings

1. **The pieces for a modern saloon and a premium SUV exist as models, but they do not look the part.** In the lineup the kit's `luxury` is the same boxy 1980s saloon as the used one with a different grille and rims, and the `suv` is a boxy 1990s estate. Painted metallic black and with bigger rims they would pass as « neuve » and « 4 × 4 de luxe » only with some procedural work (below). A truly premium look would need a new asset: **not done, no credit spent**.
2. **The kit's scooter (a moto variant ≥ 10) is a cargo scooter** (a box behind the rider), white, not a clean urban scooter. Usable as « scooter de livraison »; an « urban » look needs paint and removing the box (procedural, free).
3. **The Ride pose is calibrated for the 125 cc only** (hips, aims, grips; `POSES.Ride.reach` uses the 125 cc's grips). A scooter has a different seat height, floorboard instead of pegs, and grips elsewhere (`vehicleKit.ts`: `scooter ? … : …`). It needs its own pose entry (`RideScooter`, same machinery: aims + palm + arm solve + the `grip` morph already on both bodies).
4. **One module = one vehicle + one dealer** (`OwnedVehicleModule` is built around a single `asset`). Three more vehicles = three more module definitions (or generalise the dealer to several assets: bigger change, not needed).
5. `VehicleAsset` (`owned.ts`) is a closed union `'jakarta' | 'clando' | 'tiak'`: extended for each new id; the parking counters are keyed by it, so no save change.
6. Presence (other players seeing an owned vehicle) is part of `OwnedVehicleModule` (`presenceSpace`), so new modules inherit it; the multiplayer check (`check:online`) should be re-run once a new vehicle exists.

## 3. Plan (vehicles only, in this order, each step small and testable)

| # | Step | Reuses | New code | Risk |
|---|---|---|---|---|
| 1 | **Modern saloon** (`berline`, 14 M F): drop `soon`, `carModule`-style module with `kit: 'luxury'`, its own dealer (a second lot of the Plateau showroom or an Almadies dealer), handling a little faster/softer than the used car | `carSpec` (made kind- and seed-parametric), `kerbDealer`, parked counters | one `OwnedVehicleModule` def, `carSpec(kind, seed)`, dealer site, tests copied from `car.test.ts` | low |
| 2 | **Premium SUV** (`tout_terrain`, 75 M F): same, `kit: 'suv'`, higher camera anchors (already in the kit), heavier handling (turn radius 6.4, accel 2.4) | as 1 | one def + dealer (Almadies, premium) | low |
| 3 | **Urban scooter** (new catalogue entry, proposed 120 000 F, tier 1, Pikine next to the Jakarta): `RideScooter` pose, scooter handling (slower, tight turns), paint without the cargo box | `motoSpec` parametric, the fist/arm-solve machinery, `check-moto` adapted | new pose + spec + module + catalogue entry; **the one step with real geometry/pose work** | medium |
| 4 | Visual differentiation of the cars, procedural and free: metallic paint, rims, tinted glass, a chrome grille on the premium models; optional | kit palettes (`SEDAN_COLORS`, `SUV_COLORS`) | palette + small geometry options | low |
| 5 | Persistence tests across all five owned vehicles (buy, drive, park in different hubs, reload, sell, rollback): extend `car.test.ts` « side by side » and `check-save-compat` | existing tests | tests only | low |

Rules kept: no vehicle is given at creation (the avatar choice screen has no vehicle); no « free » path (every one goes through `buyAsset` and the wallet); the Tiak loaner and its `tiak` asset are not touched; `traffic`, `taxi`, `carRapide`, buses, `lines`, `trip`, `stops` are not touched; save stays v5 (assets list + counters); older code ignores unknown asset ids.

Prices keep the existing ladder (tier 1 → 4): scooter 120 000 < Jakarta 150 000 < used saloon 2.8 M < modern saloon 14 M < SUV 75 M. The scooter being cheaper than the Jakarta is a design choice to confirm.

## 4. What I could not inventory

The Meshy account reachable from here (read-only API listing, no credit spent, balance 940) holds **only the two characters** (four text-to-3D tasks, two rigs, two remeshes). The « Jakarta motorcycle » and the other characters you mentioned are not in it: they are in another workspace or the web library. To reuse a Meshy Jakarta (or any of them) I need the GLB files or their task ids and the account/profile they are in. Until then « reuse our existing asset » means the kit's Jakarta, which is what the game already owns and what the Ride pose, grips and tests are calibrated to.
