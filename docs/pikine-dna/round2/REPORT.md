# Pikine Street DNA — round 2: rhythm, ground, night, and the room's own street

Same branch (`feature/pikine-street-dna-p2-20261019`, local, not pushed, no preview build). Round 1 stays the baseline: every change
below is in `src/game/pikineDna.ts` (still the only game file touched, plus its one line in `src/game/modules.ts`).
Pictures are iPhone-sized (390 × 844, @2×), medium quality; **left = round 1** (the slice you approved) and **right = round 2** except where
a folder says otherwise. The HUD weekday and the player's shirt change between runs (city clock, random default avatar): not part of the change.

## What your review asked for, and what changed

**1. Rhythm, not just density.** The wall units no longer come every ~7 m. Each side of a road is now a run of *clusters* (three to five
units almost touching, every cluster with a mural), *gaps* (an empty yard, 6–17 m) and, now and then, an *unfinished stretch* (raw breeze
blocks with the top course missing, rebar waiting, one end painted). Gates, the most repeated piece, are the rarest. On the avenue the east
frontage (z −51…−8) is now 5 units with 3 touching and a 13 m empty stretch (58 % covered); the west (z 8…51) is 4 units, 3 touching, an
19 m empty stretch (48 %). `scripts/check-pikine-dna.mjs` now asserts it: a cluster, an empty stretch of 8 m or more on each side, never a continuous wall.

**2. Ground still too clean.** Restrained: darker and lighter *worn patches* in the roadway along the three roads (elongated with the road,
low contrast against the sand), *dust* drifts along the kerbs, *darker soil* in front of every shop, gate and mural, wet earth under the
standpipe. About a hundred flat discs, no objects, nothing on the pavement lanes; Low draws half of them.

**3. Night readability.** Three layers, all warm: the shops' *inside* is now a lit cell in the atlas (dark brown by day, an orange window at
night), a bulb at each end of every awning and over every gate, and a *pool of warm light on the ground* in front of each shop, gate, the
bank's flank, the gare's portal, the gateways and the standpipe (one extra additive mesh, off by day, following the same night measure as the
street lamps; the pools fade in from dusk). `nightOf(daylight(hour))` is the one clock; the check asserts off at noon, on at 20 h.
Pictures: `route/*-20h.jpg` (round 1 at 20:00 on the left) and `details/*-20h.jpg`.

**4. Identity carriers over repeated geometry.** The shopfronts went from four names to eight (Boutique Abdou, Couture Fatou, Quincaillerie
Ndiaye & Fils, Télécentre, **Cantine Mame, Pharmacie Teranga, Coiffure Pape, Cyber · Photocopie**), the murals still carry the wall, and two
new boards do the rest of the talking: **Banque Teranga** on the bank's flank and a **Cité Jàmm** blade hung over the room's road. No new
wall piece was added; walls are fewer and each one says something. Names are invented.

## The home street → Cité Jàmm / bank frontage

Only that, as asked. The room's road (z = −60) had no overhead layer, no paint and no frontage; the lots on both sides are the player's own
block and the estate's, already full of their own pieces, so the slice adds around them and never in front of a door:

- **The room's road:** poles at irregular spacing (they take the first free place within a few metres of where they were wanted), three strands
  along each side, spans across the road, service drops, bunting between the room and the Cité Jàmm, painted kerbs, worn patches. A **«Cité Jàmm · Résidences · Parcelles · Keur» blade** hangs over the road from the first pole on the estate's side.
- **The Cité Jàmm side:** wall units are allowed there, but only where nothing of the estate stands (the placement still refuses any collider, place or seat); on this seed the estate's frontage is full, so it gets the overhead layer and the blade, not walls.
- **The bank's flank on the avenue:** the wall that faced the street blank now carries the **bank's name board**, two lamps, a pool of light at
  night and two painted-tyre planters at its foot. Pictures: `home/h07`–`h09`.
- **The dibiterie and the home** themselves are the builder's, untouched; they gain the kerb, the wires and the night pools around them (`home/h01`–`h06`).

Before/after in `home/` is **the original baseline (left) against round 2 (right)**, since round 1 did not touch this street.

## Evidence

| | result |
|---|---|
| `check-pikine-dna.mjs` | all pass (log in `measure/check-pikine-dna.log`): one mesh and one material; 59 solid pieces on no other collider; none in the crowd's pavement lanes or on the roadway; the walk **and the home street** (12 legs) clear for the 0.5 m body; the same slice on every load; the 12 original places intact; rhythm; night pools off at noon / on at 20 h; Low keeps walls, shops and landmarks, drops wires, bunting, kerb paint, props |
| avenue walk (scripted walker on the real input and collision) | 342 m, 169.3 s, 0 stalls, 0 errors, same as before the change |
| home-street walk (east of the room → the avenue → past the bank) | 104 m, 52 s, 0 stalls, 0 errors, same on the baseline |
| collision sweep of the route (`measure/`) | 0 blocked, 0 by the slice |

Walkthroughs (`walkthrough/`): `round1-vs-round2.mp4` (the avenue walk, in step) and `home-street-before-after.mp4` (baseline against round 2).

### Performance

| | round 1 | round 2 |
|---|---|---|
| slice triangles, medium / Low | 8 456 / 2 952 | 12 982 / 4 182 |
| slice off-and-on in the same frame, medium | +0.5 calls, +8.0 k tris | +2 calls, +13.6 k tris (+5.6 % of ~243 k) |
| slice off-and-on in the same frame, Low | −1.1 calls, +1.7 k tris | +1.1 calls, +4.2 k tris (+2.5 % of ~168 k) |
| frame time off-and-on (software GL, noise ±40 ms) | inside the noise | +12 ms of ~540 medium, +10 ms of ~225 Low: inside the noise |
| draw calls added | 1 | 2 (the night pools' mesh, hidden by day) |
| GPU memory of the atlas | ~7 MB | ~8.7 MB (1024 × 1280 + a 512 × 640 glow map, with mipmaps) |

The growth is the overhead layer on the room's road (23 poles against 11, with their wires), the ground discs and the lit cells. If you want it
back nearer round 1's figure, the cheapest levers are fewer poles on the plaza road, fewer ground discs, or splitting the mesh per stretch so it is culled when off screen.

### Regressions

Re-run on the final build:

| check | result |
|---|---|
| `npm test` | 128 files, 1 581 passed, 2 skipped |
| `check-pikine-gare` | all pass |
| `check-crowd` (the street crowd's lanes and pavements: the new poles stand outside them) | 24 / 24 |
| `check-night` (lamps, lit shops and signs) | 18 / 18 |
| `check-pikine-mosque` | all pass |
| `check-city-life` (the CI check `check:city`, desktop and phone) | 37 pass, 0 fail |

`check-minimap` and `check-npc-density` (which has two gargote failures that the baseline has too) were not re-run: nothing in this round touches either.

## Left for your call

- The **ground patches** are deliberately faint; if they read too much on a bright phone, lower their contrast (one constant, `0x93724b / 0xa88557`).
- The **night pools** are strong enough to read in the screenshots but they add to the lamps' pools; `opacity = 1.0 × night` in `pikineDnaModule.update`.
- **Next**, only on your word: the arena street and the east side of the grid; nothing else started.
