# Pikine Street DNA — phase 2: review pack

Branch `feature/pikine-street-dna-p2-20261019` (local, not pushed; no preview build, nothing deployed, no production change).
Design and build notes: [`docs/PIKINE-DNA.md`](../PIKINE-DNA.md). Code: `src/game/pikineDna.ts` (one new module, registered last) and nothing else in the game.

All pictures are iPhone-sized (390 × 844, @2×), medium quality, software GL in a headless Chromium. Left = before (the baseline
`03477aa`), right = after. Two things differ between the pictures that are not part of the change: the weekday in the HUD (the
city clock runs 24-minute days in real time) and the colour of the player's shirt (the default avatar is drawn at random).

## 1. Before / after

The walk: the room → west along the first road → south down the avenue past the gare → east along the road to the grand-place →
into the square → the shops' court.

**Overview** (12 waypoints, day 11:00 and dusk 18:30; left to right, top to bottom):
[`sheets/route-before-11.jpg`](sheets/route-before-11.jpg) · [`sheets/route-after-11.jpg`](sheets/route-after-11.jpg) ·
[`sheets/route-before-185.jpg`](sheets/route-before-185.jpg) · [`sheets/route-after-185.jpg`](sheets/route-after-185.jpg)

**Each waypoint, side by side** (`route/<waypoint>-11h.jpg` is day, `-185h.jpg` is 18:30):

| # | Waypoint | What to look at |
|---|---|---|
| 01 | `01-room-door` | the room's door; the baobab's crown over the roof |
| 02 | `02-road-west` | the first road, poles and wires closing in |
| 03 | `03-avenue-south-a` | the avenue: poles, wires, bunting, painted kerbs, the speed bump |
| 04 | `04-avenue-south-b` | the same, further on, the portal's blade sign far ahead |
| 05 | `05-avenue-south-c` | the gare's portal and « GARE ROUTIÈRE » |
| 06 | `06-gare-west-gate` | under the portal's board, the yard beyond |
| 07 | `07-avenue-to-place` | the avenue's end, the bunting before the corner |
| 08 | `08-road-east` | the road to the grand-place, kerbs, the gateway's blade sign |
| 09 | `09-place-approach` | the grand-place's gateway and its bunting |
| 10 | `10-grand-place` | from inside the square, back to the gateway |
| 11 | `11-shops-court` | the market gateway, the court beyond |
| 12 | `12-boutique-diallo` | Boutique Diallo's front, the A-board and crates |

**Close-ups of what was added** (`details/<name>-11h.jpg`, `-185h.jpg`): `d01-baobab-corner`, `d02-gates-and-shops-east`
(Boutique Abdou, Couture Fatou), `d03-painted-walls-east` (the wrestler, the Lions), `d04-painted-walls-west`, `d05-gare-portal`,
`d06-standpipe`, `d07-grand-place-gateway`, `d08-market-gate`, `d09-salon-awa-flank` (the shop's blank flank is now its mural),
`d10-shops-court`.

## 2. Walking walkthrough

[`walkthrough/before-after.mp4`](walkthrough/before-after.mp4) (side by side, in step), [`walkthrough/after.mp4`](walkthrough/after.mp4) and [`walkthrough/before.mp4`](walkthrough/before.mp4): 42 s each, one frame
per 0.37 m, the same 342 m: room → avenue → the road to the grand-place → into the square and back → the shops' court. It is not a
camera fly-through: a scripted walker holds *forward* on the game's real input, steered by the camera yaw, with the game paused
and advanced in fixed steps, so the movement goes through the game's own collision (`pushOut`, 0.5 m body) and the frame rate of
the machine does not matter (`scripts/walk-pikine-route.mjs`).

| | before | after |
|---|---|---|
| route completed (9 legs) | yes | yes |
| metres walked / game time | 342 m / 169.3 s | 342 m / 169.3 s |
| stalls (no progress for 6 steps) | 0 | 0 |
| page errors | 0 | 0 |

The identical time and distance are the point: nothing on the walk slows the walker down or steers it around anything new.

## 3. Collision checks

`scripts/check-pikine-dna.mjs` (all pass; output in [`measure/check-pikine-dna.log`](measure/check-pikine-dna.log)):

- the slice is **one mesh with one material**, 8 456 triangles at medium (budget 30 000), 2 952 at Low;
- **48 solid pieces** (19 on Low) stand on **no other collider**;
- **no solid piece in the crowd's pavement lanes** (5.05–5.95 m from a road's centre line, `PAVE` in `src/crowd/streetPlan.ts`) or on the roadway: poles at 6.55 m, gates, walls and boutiques at 7.1 m, the gare's pylons and the market's on the block's kerb line;
- the whole walk, swept every 0.25 m for a 0.5 m body, is **clear of the slice**;
- the 12 places and ways out the hub already had (home, station, grand-place, Salon Awa, Boutique Diallo, café, bank, dibiterie, arena, gare's apprentice, two exits) are all still there;
- the same pieces at the same places on **every load**, dropped with the hub and made once on return; none outside Pikine;
- Low keeps the walls, gates, boutiques and landmarks and drops wires, bunting, kerb paint and props.

One thing the sweep also showed, unrelated to the slice: on some days the **road events** put two 0.5 × 0.5 m, 0.7 m-high obstacles
on the avenue (at z ≈ 83 and 92). They are there on the baseline too (`measure/measure-before-*.json`, `blockedBySlice: 0` on every run).

## 4. Performance

`scripts/measure-pikine-route.mjs`, 12 waypoints, 390 × 844, software GL (SwiftShader): absolute milliseconds mean nothing, and the
run-to-run swing of this machine (±40 ms on a 650 ms frame) is larger than anything the slice adds, so the cost is measured two ways.

**Static geometry and what is on screen** (whole hub; worst waypoint of the walk):

| | before | after | |
|---|---|---|---|
| medium, hub triangles | 257 445 | 267 185 | +9 740 (the slice is 8 456; the rest is the traffic of that run) |
| medium, triangles on screen (max) | 224 702 | 236 744 | traffic and people differ run to run |
| medium, draw calls (max) | 200 | 197 | the slice is one |
| Low, hub triangles | 209 646 | 208 478 | the slice is 2 952; run noise is larger |
| Low, draw calls (max) | 152 | 158 | |

**The slice switched off and on in the same build, same frame, interleaved twice** (mean over the 12 waypoints):

| | draw calls | triangles | frame time |
|---|---|---|---|
| medium | +0.5 | +7 969 (+3.4 % of ~237 k) | −11.9 ms of ~680 (inside the noise) |
| Low | −1.1 | +1 651 (+1 % of ~170 k) | +4.1 ms of ~235 (inside the noise) |

Memory: one 1024² atlas and a 512² glow map (about 7 MB on the GPU with mipmaps), the merged geometry (about 1 MB), no per-frame work, no
update loop. The mesh is one piece spanning the route, so it is drawn whenever any part of it is on screen: that is the +8 k
triangles above at every waypoint. If later districts push the budget, splitting it per stretch is the lever.

## 5. Nothing else moved

- `npm test`: 128 files, **1 581 passed**, 2 skipped (the repository's own two).
- Browser checks run on the final build (outputs kept out of the tracked screenshot folders):

| check | result |
|---|---|
| `check-pikine-gare` (the gare's density and its interactions) | all pass |
| `check-crowd` (the street crowd, its lanes and pavements) | 24 / 24 |
| `check-city-life` (the CI check `check:city`, desktop and phone) | 37 pass, 0 fail, no JavaScript errors |
| `check-night` (lamps, lit shops and signs) | 18 / 18 |
| `check-minimap` | 93 / 93 |
| `check-pikine-mosque` | all pass |
| `check-npc-density`, phone | 65 / 67 — the two failures are at the **gargote** (« people eat seated at the gargote at lunch », « the player sits on a free gargote bench »), on the east side of the grid, nowhere near the slice. The **baseline `03477aa` fails the same two** (64 / 67, plus one 11/10 humanoid budget flake). Not touched here. |

- `src/world/builder.ts`, `src/world/city.ts`, the save schema, the multiplayer code and every other module are unchanged; the diff is `src/game/pikineDna.ts`, one line (two with the import) in `src/game/modules.ts`, scripts and docs.

## 6. For the review

- **Look.** The slice is deliberately a layer on the street the builder made: the long views gained their overhead layer and a
  landmark each, the short views gained walls, gates and shopfronts. The houses behind the walls are the builder's own, unchanged.
- **Names and art are invented**: Jamm Télécom, Bissap Léer, Boutique Abdou, Couture Fatou, Quincaillerie Ndiaye & Fils, Keur Mbaye / Sarr / Gueye. The wrestler
  and the Lions murals are generic. No religious figure is depicted; nothing is a real brand (the gare's board says « Ndiaga Ndiaye », which is what Dakar calls the car rapides themselves).
- **Decisions for you**: (1) the look and density of the walls (about one unit every 7 m on the two house frontages); (2) the
  baobab at the first corner (a landmark you can steer by from the door); (3) whether the next stretch is the Cité Jàmm / bank
  frontage (the room's own street), the arena street, or the east side of the grid.
- **Not done on purpose**: other districts, vehicles, animals, the builder's own façades, generated textures. The atlas is painted in code, so re-skinning the murals costs no credits.

## Reproduce

```
npm run build && npx vite preview --port 4323 &
node scripts/check-pikine-dna.mjs http://127.0.0.1:4323/
node scripts/measure-pikine-route.mjs http://127.0.0.1:4323/ out.json medium
node scripts/capture-pikine-route.mjs http://127.0.0.1:4323/ shots 11,18.5
node scripts/capture-pikine-details.mjs http://127.0.0.1:4323/ shots-details 11,18.5
node scripts/walk-pikine-route.mjs http://127.0.0.1:4323/ shots-walk 11
```
