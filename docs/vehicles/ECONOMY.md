# Vehicle ownership, dealerships and the transport economy

Branch `feature/vehicles-economy-20261021` (child of `feature/driving-2-20261021`, PR #61). Everything here is game money: no real payment, no real ride-hailing service, no external dispatch.
The architecture of PR #61 / #59 is kept as it is: continuous roads between districts, analog controls, physical ownership (a bought car is the car you drove, parked where you leave it),
Garage Modou and Lamine, NPC relationships, the v6 save, multiplayer presence, the Prestige showroom, the `compacte.glb` saloon and the approved « B » audio set.

## 1. The cars

Four new bodies, authored in this repository from scratch (no photo used as a texture, no badge, no trademark, original names), built by `scripts/vehicles/author/` into the existing GLB
pipeline (`body` › `door` + `cabin`, four `axle_*` › `wheel_*`, a sidecar `.json` with its own checks). Real dimensions; the same wheels, seats, door and collision footprint for every use:
**the car on display is the car test-driven, bought, parked, saved and driven.**

| In game | Inspired by | Where | Price | Length × width × height | GLB | Triangles · draw calls |
|---|---|---|---|---|---|---|
| **Teranga** (white, black roof; silver, blue, red) | a modern 5-door city car (Yaris-like) | Sarr Auto (Pikine), Ndiaye Auto (Plateau) | 4 000 000 F | 3.96 × 1.75 × 1.53 m | 275 kB | 12.9k · 9 |
| **Rafet** (yellow, white) | a sporty 5-door hatch (208-like) | Ndiaye Auto (Plateau) | 5 500 000 F | 4.08 × 1.75 × 1.46 m | 277 kB | 13.1k · 9 |
| **Lamane Sport** (red, black; floating black roof) | a large luxury SUV (Range Rover Sport-like) | Prestige Auto (Almadies) | 70 000 000 F | 4.90 × 1.98 × 1.83 m | 278 kB | 12.9k · 9 |
| **Gaïndé** (white, black) | an SUV coupé (X6-like), clearly distinct from the Lamane: falling roof, shorter glasshouse | Prestige Auto (Almadies) | 65 000 000 F | 4.96 × 2.00 × 1.72 m | 290 kB | 13.8k · 9 |
| Berline moderne (`compacte.glb`, unchanged) | — | Ndiaye Auto (Plateau) | 6 000 000 F | as before | as before | as before |

* **The Ndiaye Auto « box cars »** were the procedural kit drawn because `compacte.glb` failed to load **silently** in the playable preview: its asset shim answered `fetch(url)`
  but not `fetch(Request)`, which is how the GLTF loader asks. The shim now answers both; the loader tries a failed model once more and reports why (`glbFailure`, a console warning)
  instead of falling back without a word. IDs are unchanged: a car already bought keeps its asset, its uid and its paint.
* **`tout_terrain` kept its id** and became the Lamane Sport: an owner's existing SUV is now drawn with the new body, nothing is replaced or lost (save untouched).
* A **far LOD** (38 m) merges paint and trim so a street of parked cars stays within the frame budget (`perf.frame` passes).
* **Motorbike (CBR-like)**: not done. The four cars took the time; adding a fast sports bike before the four were solid was out of order, as the brief asked.

## 2. Dealerships (data-driven: `src/transport/modelCars.ts`, `prestigeSales.ts`)

| Dealership | District | Who | What | How it sells |
|---|---|---|---|---|
| **Sarr Auto** | Pikine (kerb lot by the market road) | **Pape Sarr**, owner, a real walking person with hours | Teranga (white, silver) on the kerb, a sold saloon and Modou's Jakarta on display | first cars, **credit** (§3) |
| **Ndiaye Auto** | Plateau | Moussa Ndiaye, salesperson (the old static keeper is gone) | Berline moderne, Teranga, Rafet | try, drive out, buy in place |
| **Prestige Auto** | Almadies (the showroom of PR #59) | the Prestige salesperson | Berline neuve, Lamane Sport ×2, Gaïndé | inspect, try, buy in place |

Every salesperson walks (no teleport), notices the customer once per visit, hands over the keys of **the** car chosen, and takes a trial car back out of sight. A test drive is the same
car, nothing saved; buying after a drive buys that car where it stands.

## 3. A first car through a relationship: Pape Sarr's credit (`src/transport/sarrAuto.ts`, `src/economy/credit.ts`)

* **Trust is earned by doing things**, never by a button: a greeting is worth 4; each of his errands, once per city day, is paid and reported back to him, worth less the more you do in a day
  (10, 8, 6, 4): **move a client's car** to the client spot, **take the silver Teranga into Modou's bay** across the road (driven), **wash the sold saloon**, **carry his papers** to the bank (on foot).
  Paid on time: +2; a missed due date: −6; a debt repaid in full: +6.
* **Credit is his decision** (pure rules, unit-tested): a stranger is refused; from trust 20 he accepts with a large down payment and a short schedule, and the terms soften with trust:

  | Trust | Down payment (Teranga) | Instalments | Each (every 2 city days) |
  |---|---|---|---|
  | < 20 | refused | — | — |
  | 20 | 1 200 000 F | 20 | 140 000 F |
  | 30 | 600 000 F | 30 | 113 500 F |
  | 45 | 200 000 F | 36 | 106 000 F |
  | 60 | 15 000 F | 40 | 100 000 F |

  Not enough for the down payment: he **counters** (same terms, signing waits). One credit at a time, city cars only (≤ 6 000 000 F), refused after letting him down, or with Modou's slate in arrears.
* **The same car**: signing hands over the Teranga that stands on his kerb (`buyInPlace`): same place, same paint, one copy, nothing delivered.
* **The debt is tied to the car's asset uid** (`loans` in the save, an additive field, no schema bump); **credit never creates money** (only the down payment leaves the wallet); a financed car
  **cannot be sold** while the debt is open (no buy-on-credit-and-sell); an instalment is **missed only when its due day ends unpaid** (on the day itself it is today's, not late),
  counted once; **no repossession**: after repeated misses the only consequence is that he will not lend again. The car is usable for work from the first minute (VTC, deliveries).
* Repayments: the phone's **« Crédits »** app or at the dealer: the late part, one instalment ahead, « Payer ce que j'ai » (part of an instalment), or all of it. Amounts in `src/economy/config.ts` (`credit`).

## 4. VTC rides (`src/transport/vtc.ts`, `vtcRules.ts`)

Phone › **VTC** lists the rides asked for in the district this hour (the same list after a reload): one to the long-distance district (Plateau → Almadies, Pikine → Plateau, Corniche → Pikine,
Almadies → Plateau by the Corniche), one to a neighbour, one inside the district. Accepted: the fare is fixed. Drive your own car to the kerb; stop; **the passenger is a person on the pavement who
walks to the car and sits in its right rear seat** (the seat registry: they ride in it). Drive on — across districts on the roads; the passenger crosses with the car (rebuilt with it, never a
copy) and survives a reload. At the destination kerb they get out and walk off; the fare is paid **once** (the ride id is remembered: a reload never pays twice). Cancel: nothing paid.

Placeholder fares (`ECONOMY.vtc`): 2 500 F base + 9 F/m + 2 500 F per district boundary, by 500 F. Examples: inside Pikine ≈ 3 500 F; Pikine → Plateau ≈ 18 000 F; Plateau → Almadies ≈ 28 000 F.

**Player-to-player rides: not implemented.** The multiplayer layer syncs presence, greetings, emotes and sitting together; it does not sync a driven vehicle's seats. Faking it (a ghost
passenger) was ruled out by the brief; doing it for real needs vehicle-seat replication in the server protocol, a separate change.

## 5. Jakarta and Tiak (`src/transport/controls.ts`, `ownedModule.ts`)

* **Foot-paddle reverse** on the real Jakarta (and the Tiak bike): stopped, « Frein » held for 0.7 s → the rider puts both feet down (`RidePaddle` pose) and pushes the bike backwards,
  0.85 m/s at most, eased in; let go → it stops at once and the rider sits normally. No R badge, no reverse gear, collisions stay on (it stops against a car, never through it).
* **Cross-district deliveries**: four new routes (Pikine → Plateau, Plateau → Pikine, Pikine → Almadies, Plateau → Corniche) priced on the roads' length, handed over in the other district,
  paid once, kept in the v6 save like every delivery. The existing Tiak tour and lent bike are unchanged.

## 6. Damage and repairs (`src/transport/condition.ts`, `garage.ts`, `garageModule.ts`)

* **Damage**: nothing below 3.6 m/s (13 km/h: parking bumps and scrapes cost nothing), then `0.35·(v − 3.6)^1.55` %, at most 45 % in one hit: 8 m/s ≈ 3.5 %, 12 m/s ≈ 9.5 %, 16 m/s ≈ 17 %.
  Contact is counted once per impact, never per frame against a wall. A worn car keeps most of its pace; roadside recovery is unchanged.
* **Repairs are separate from property maintenance** and priced by damage, scaled gently by the car's class (× (price / 6 M)^0.3, between 0.3 and 2.2):

  | Damage | Teranga (4 M) | Berline neuve (14 M) | Lamane Sport (70 M) |
  |---|---|---|---|
  | 3 % (touch-up) | 1 000 F | 1 000 F | 1 000 F |
  | 7 % | 3 000 F | 4 000 F | 6 500 F |
  | 15 % | 7 000 F | 10 500 F | 16 500 F |
  | 30 % | 20 500 F | 29 500 F | 48 000 F |
  | 50 % | 33 500 F (to 70 %: 11 500 F) | 49 000 F (17 000 F) | 79 500 F (27 000 F) |

  (The case in the brief, a 14 M berline at 7 % quoted 1 302 000 F before, is now 4 000 F.) Full or **partial** (to 70 %).
* Lamine still inspects first, works in front of you, the price is taken **once at the end**, cancelling costs nothing.
* **« Discuter avec Modou »**: by what he thinks of you (`modou` relation, `modou_trust`) and your record with him: a stranger pays the full price; someone he knows pays part now (60 %, 35 % when
  trusted) and **the rest goes on his slate** (3 instalments, one city day apart); a trusted customer who has repaid him before may get 10 % off; refused while a slate is open, after two
  missed instalments, or above 60 000 F of debt. The slate is a debt, never money; it is distinct from the dealer's credit; « Rembourser Modou » at the garage or « Crédits » on the phone.

## 7. Audio

Not a second engine: `src/transport/vehicleAudio.ts` as approved (recordings and mix unchanged). Added: **Réglages › Son › « Tester le son »** (`src/ui/soundTest.ts`): ignition, idle,
acceleration, horn, light and heavy impact and a test tone, for the car or the Jakarta, through the game's own path, with a plain-words state panel (sound on/off, the phone's audio
running or asleep, the 9 recordings decoded or which failed, whether the silent switch can be got round, the level sent to the speaker) and what to check when nothing is heard.
Details, results and the licences: `docs/vehicles/AUDIO_ON_DEVICE.md`, `docs/audio/VEHICLE_SAMPLES.md`.

## 8. Save

Additive fields of the v6 save (no version bump): `loans` (`{ list, seq }`) and `vtc` (`{ active, done, seq, trips, earned }`), sanitised on load (malformed debts dropped, a debt repaid in
full closed, a ride already paid never back in hand). Older saves load owing nothing. Purchased vehicles keep their ids, uids and paints.

## 9. Checks

Unit tests: `tests/credit.test.ts`, `tests/vtc.test.ts`, `tests/condition.test.ts`, `tests/garage.test.ts`, `tests/controls.test.ts`, `tests/premiumCars.test.ts`, `tests/prestige.test.ts`,
`tests/carDealer.test.ts`, `tests/assets.test.ts`, `tests/economy.test.ts` (part of `npm test`).

Browser journeys (real CDP touches on a 390 × 844 phone page, Chromium + SwiftShader; debug hooks only where each script says so):

| Journey | Script |
|---|---|
| A · new player → Sarr's errands over two days → trust → credit → the Teranga → first VTC passenger → repayment → reload | `scripts/check-first-car.mjs` |
| B · Prestige: the red Lamane Sport looked at, test-driven, cannot be afforded, left | `scripts/check-prestige-suv.mjs` |
| C · Jakarta backed out of a tight gap with the feet; a parcel Pikine → Plateau | `scripts/check-jakarta-courier.mjs` |
| D · damaged Teranga → Modou → arrangement → Lamine → slate repaid | `scripts/check-garage-credit.mjs` |
| E · a VTC passenger from Pikine to the Plateau by the road, reload mid-ride | `scripts/check-vtc-ride.mjs` |
| sound test (gesture rule, every voice, mute, sleep/wake, a missing recording) + MP4 | `scripts/check-sound-test.mjs` |

These run in headless Chromium with a software renderer. They prove what the page does; **they are not an iPhone test**.
