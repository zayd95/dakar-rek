# LD2.0-E · The Almadies district

**The owner, on the villa (27 Oct):** « I love the villa .. now make adapt this style to almadies hub change all the old facades, create distinctive shapes like this with doors balcony etc .. we should have houses, villas, hotels and apartment complexes that what makes almadies different. »

Stacked on LD2.0-D (zayd95/dakar-rek#75): this phase uses the villa's drawing context and style (`src/world/villaCompound.ts`, `src/housing/villaFacade.ts`, `docs/kits/ALMADIES_VILLA_KIT.md`) and changes only how the Almadies' street looks. Nothing here touches production, saves or the economy.

## What the Almadies has today (the survey, 27 Oct)
- 4 × 4 blocks (`PITCH` 60, `BLK` 46, 14 m roads), four 22 × 22 m lots per block. Specials stay as they are: the port (2,0), the station (1,2), the mall (2,2), the square (3,2), Prestige Auto (0,2), the restaurant (0,1 lot 0) and the café (3,1 lot 1), the flagship villa (1,1 lot 3).
- Every other lot (41 of them, the Ngor residence at (1,1) lot 2 among them) is `genericVilla` in `src/world/builder.ts`: one windowed box with a terrace slab, a pool and a wall. Same silhouette 41 times (pictures: `docs/proof/ld2e/before/`).
- Cost of the view on a phone page (390 × 844, medium, SwiftShader): the street 163 k triangles / 111 draw calls, the aerial 205 k / 176. Other hubs for scale: Pikine 183 k / 193 k, Corniche 105 k / 159 k, Plateau 95 k / 119 k.

## Decisions
1. **A district of four kinds of building**, each with several designs in the villa's style (ivory render, travertine, oak, bronze, glass; cantilevered slabs, glass balustrades, deep balconies, a real front door, a roof terrace):
   - **houses** (1 lot): compact, two storeys, street balcony, carport, small garden;
   - **villas** (1 lot): premium, two or three storeys, balconies and terraces, a pool, a gated forecourt;
   - **hotels** (2 or 4 lots): a boutique hotel on the sea front (a lobby under a canopy, a balcony on every room, a rooftop pool and bar), a resort (a long sea-front block, a pool court), a tower (a podium and a crown); fictional names on illuminated signs;
   - **apartment complexes** (1, 2 or 4 lots): residences with stacked and staggered balconies, brise-soleil screens, a gated parking court, a lobby with an intercom and a number; the Ngor residence (1,1 lot 2, for sale in the game) among them.
2. **The plan is curated, not random** (`src/world/almadies/plan.ts`): hotels and the large residences on the sea front and the avenues, villas round the flagship, houses in the quiet rows; neighbours never repeat a design and the mirrored ones face each other. 30 sites cover the 41 lots.
3. **The street is exterior only in this phase.** The doors, lobbies and balconies are drawn to be read from the street; the only homes with an inside stay the flagship villa and the Ngor residence's open room. Interiors for the hotels and the apartment complexes are a later phase (they would reuse LD2.0-C's apartment).
4. **Same hub, same street**: the generic villas' random draws are still made (a dry run, as the flagship's lot does since LD2.0-D), so the builder's own street dressing (trees, palms, stalls, people) and every other lot stay exactly where they were (`tests/almadiesDistrict.test.ts` digests everything outside the district's sites against the villa branch's last commit, `3ca9e39`, at both qualities). The district is drawn after the dressing into the hub's merged batches (no draw call per building). The only change outside the sites: each gate's apron is kept clear of parked cars and stalls (`keepClear`).
5. **A phone's budget** (medium; the low preset draws about 60 % of it): the district adds at most +60 k triangles net on the Almadies view and no more than +10 draw calls (a sign board is a draw call of its own: at most one per site, only the hotels and residences have one). Per site, gross, on medium: house 1.5 k, villa 2.6 k, hotel 5 k (2 lots) / 8 k (4), residence 4.5 k (2) / 7 k (4) / 3.5 k (1). Doors, balconies and the glazing are the budget's first spend; no interior, no hidden geometry.
6. **The kit**: every design is a named builder with its parameters (palette, storeys, mirror, name, number), exported with its picture, as the villa's pieces are (`docs/kits/ALMADIES_DISTRICT.md`).

7. **Open to the street** (the owner, 27 Oct, on the first pictures: « This is cool, I don't want them in isolated areas they part of what makes the city »; chosen: keep them in the Almadies, open their ground floors onto the pavement). The district is part of the street, not a set of compounds behind walls:
   - **the boundary is see-through**: a bronze railing of flat bars on a 45 cm stone plinth with stone piers and short trimmed hedges (`perimeter()` in `parts.ts`, 1.3 m) along the street edge **and every edge that runs by a road** (the lot's road side, a block's three outer sides); a 2.4 m wall only stays between two neighbours. The car gate is a bar gate (the street sees through it); it is still shut and solid. `entries: [{ x, w }]` cuts a walk-in opening in the railing (a forecourt, a lobby, a porte-cochère: open ground between two lantern piers, nothing solid across it); `front: 'open'` for a site whose own front stands on the line;
   - **the ground floor is for the street**: hotels (a walkable forecourt and drop-off, a café-restaurant terrace on the pavement side, an open lobby), residences (lobby, café or shop units with awnings and display glazing at street level, the courtyard's porte-cochère open and walkable), villas and houses (the façade, the front door and the garden read from the pavement);
   - same budgets in spirit: the railing costs about 250 triangles for a 22 m lot's street edge plus one road side (550 for two lots, 900 for a block), so the caps rise by that: house 1.8 k, villa 2.85 k, hotel 5.6 k / 9.2 k, residence 3.9 k / 5.2 k / 8.2 k; the district's net budget (+60 k triangles, +10 draw calls) is unchanged and checked.

8. **Life on the ground** (the owner, 27 Oct, after the first playable look: « some streets feel too empty, the open sandy areas need more landscaping and street activity, and several buildings look impressive from a distance but need more life at ground level »). Three jobs, all on the game's own systems (docs/NPC_LIFE.md, src/game/parkedVehicles.ts, src/crowd/streetPlan.ts), no new engine:
   - **the streets**: the Almadies' street crowd is tuned very low (`HUB_STREETS.almadies.level` 0.35, groups « almost nobody standing about ») and its parked cars are the same count as every hub's: both go up (walkers, groups by the cafés, kerbside cars), still quieter than Pikine;
   - **the open sand** (the square (3,2), the station (1,2), Prestige Auto (0,2), the port (2,0), the sea-front strip, the avenues' pavements): a streetscape layer (`src/world/almadies/streetscape.ts`, drawn after the sites into the hub's batches, deterministic, clear of colliders, keep-clear ground, doors, seats, the pavement lanes of the street crowd): palms and shade trees, hedged beds, paved paths, benches (seats), planters, kerb palms;
   - **the buildings' ground floors**: each design hands `SiteResult.life` = seats (terrace chairs, benches: the player and the city's people sit on them) and placed people (a doorman, a bellhop, waiters, a shopkeeper at her door, a guard at the gate, someone on a balcony), within `LIFE_CAP`, plus small props (`parkedCar`, `scooter`, `bench`, `menuBoard` in `parts.ts`, menu boards, flower buckets, a luggage trolley…). The humanoid budget is the game's (the nearest 20 are drawn at Medium, 12 at Low; the rest wait): more people to choose from near the player, not more bodies drawn.
   - **budget**: the per-design caps rise by the street life (house 1.95 k, villa 3.05 k, hotel 6 k / 9.9 k, residence 4.2 k / 5.6 k / 8.9 k) and the district's net budget against the villa branch becomes **+95 k triangles and +10 draw calls** (the streetscape and the life use the hub's own batches: no new mesh).

## The contract (`src/world/almadies/`)
- `contract.ts`: `Site` (kind, variant, block, lots, rect, facing, mirror, storeys, palette, name, number, gate), `SiteDraw` (the villa's `Draw` plus the district's batches: `glass`, `fac`, `metal`, `sign`), `SiteBuilder`, `Variant`, the palettes, the budgets, `siteFrame`.
- `parts.ts`: the shared pieces, in plan coordinates (+z toward the street, y up, the ground 0.1): `volume`, `slabEdge`, `glazing`, `balcony`, `canopy`, `door`, `louvres`, `planter`, `roofPlant`, `perimeter`, `nameBoard`, `solidBox`.
- `plan.ts`: the 30 sites. `district.ts`: `buildDistrict(kit)` draws them; `variantsFor(kind, size)` is the registry the lanes fill.
- The lanes' files: `houses.ts`, `villas.ts` (lane E-V), `hotels.ts` (lane E-H), `residences.ts` (lane E-R). Each exports `VARIANTS: Variant[]`; a lane edits only its own files and its tests, never `parts.ts`, `plan.ts` or `builder.ts` (it asks the integration owner for what it lacks).
- Placeholders stand in each file until its lane lands (a plain massing), so the game and the tests run at every commit.

## Lanes (an integration owner and three agents)
| Lane | Files | Delivers |
|---|---|---|
| E-V | `houses.ts`, `villas.ts`, their tests and pictures | 3 house designs (1 lot), 4 villa designs (1 lot) |
| E-H | `hotels.ts`, its tests and pictures | 2 boutique hotels (2 lots), 1 resort (4 lots) |
| E-R | `residences.ts`, its tests and pictures | 2 apartment blocks (2 lots), 1 courtyard complex (4 lots), the Ngor residence (1 lot, gate at the lot's centre) |
| Integration | `plan.ts`, `district.ts`, `builder.ts`, the checks, the pictures, the preview | the plan, the dry run, the budgets, the acceptance |

## Acceptance
Walk the Almadies from the sea front to the mall: every lot has its new building, no two neighbours alike; doors, balconies and signs read from the street by day and at 21 h; the flagship villa, the Ngor residence's board and door, the port, the mall, the station, Prestige Auto and the kiosks are as they were; the street dressing, traffic and people are where they were; the budgets hold; no page errors; saves untouched.

## Results
**Built:** the Almadies' 41 generic villa lots are 30 sites of 14 designs in the villa's style, open to the street (decision 7). The catalogue is `docs/kits/ALMADIES_DISTRICT.md` (pictures, GLB files, numbers); the pictures of the district in the game, day and 21 h, are `docs/proof/ld2e/after/` (the villa branch's, for comparison, `docs/proof/ld2e/before/`); the flythrough is `docs/proof/ld2e/district-tour.mp4` (70 s, 24 fps, a free camera at street height: the sea-front hotels, the avenue and its villas, the Ngor residence, the mall's street, the courtyard residence; day, golden hour, night).

| Kind | Sites | Designs |
|---|---|---|
| houses | 10 | house-m1 Maison empilée, house-m2 Maison en L, house-m3 Maison à gradins |
| villas | 12 | villa-c1 Porte-à-faux, villa-c2 Arcades, villa-c3 Pavillons, villa-c4 Tour |
| hotels | 3 | hotel-boutique (HÔTEL LE FILAO), hotel-tower (HÔTEL OCÉANE, 8 storeys), hotel-resort (HÔTEL BAOBAB AZUR, the whole block) |
| residences | 5 | residence-ngor (the one for sale), residence-stack (LES ALIZÉS), residence-screen (KËR SALAM, LES CORMORANS), residence-courtyard (JARDINS DE NGOR, the whole block) |

**Open to the street (decision 7), as built:** `perimeter()` draws a railing on a plinth along the street and every road-facing edge; every design has a walk-in opening to its door, lobby or passage (each lane's tests walk a body's circle from the pavement through it); the hotels have a café terrace beside the opening (tables, parasols, string lights) and an 8 m drop-off, the tower's podium has six shopfront bays with awnings and two shop doors, the residences have a lobby and one to three café/shop units with awnings and tables at street level, the courtyard residence a porte-cochère you can walk through into its courtyard. The flagship villa keeps its walls (the owner's favourite, unchanged).

**Checks (on the head of this branch):**
- `npx tsc --noEmit -p .`: clean. `npx vitest run`: 222 files passed, 2 skipped; 3 163 tests passed, 4 skipped, 0 failed (the district's own: `almadiesDistrict` 39, `almadiesBoundary` 48, `almadiesRooftop` 5, `almadiesHouses`, `almadiesVillas`, `almadiesHotels` 33, `almadiesResidences` 69, plus the street-unchanged digest at both qualities).
- `scripts/check-district.mjs` in the game (a phone page, low and medium): 14/14: it builds with no page error; every one of the 30 sites has a building two storeys tall inside it; nothing stands on a carriageway; the pavement round every block is free (6 208 points walked, 0 blocked, 507 district colliders); the Ngor residence's door, entry and gate are where the estate put them and nothing solid covers them; the rooftop restaurant's stair door is on a hotel's street face and a body walks to it from the pavement; the cost stays in the budgets; no page error through the walk.
- Cost against the villa branch's hub (the Almadies' own group of meshes, medium, the same to the mesh on every run: `scripts/check-district.mjs` explains why the rest of the scene is left out): **+57 238 triangles** (budget +60 000: 241 758 against 184 520) and **+10 meshes** (budget +10: 184 against 174: eight sign boards and the two glass meshes). Per view on the phone page (medium, the whole scene): the street 218–221 k triangles / 103–110 draw calls, the aerial 209–224 k / 97–137. (An earlier figure here, +55.8 k and +1 mesh, measured the whole scene while the ambient people were still arriving, which drifts by about 50 meshes and 29 k triangles in the first seconds on any build.)
- The street dressing, traffic, the port, the mall, the station, Prestige Auto and the kiosks are where they were: `tests/almadiesDistrict.test.ts` digests everything outside the sites against the villa branch's last commit at both qualities. The only changes outside a site: each gate's apron (and a hotel's drop-off) is kept clear.

**Limits:**
- **Exterior only.** The hotels' lobbies and cafés and the residences' units have no interior and nobody in them (static tables and chairs); the only homes with an inside are still the flagship villa and the Ngor residence's open room. Interiors and people at the terraces are a next phase.
- **Real phone untested.** Everything was measured and looked at in Chromium with a software renderer on a phone-sized page: triangles and draw calls are exact, the frame time on an iPhone is not measured. The low preset draws about 65–80 % of the medium triangles per design.
- The district's window glow at night is its own shared material (about three panes in four lit): the hub's `glassMat` still has a constant emissive.
- A villa whose car gate is at the centre of the street edge has no room for its walk-in opening (villa-c2/c3/c4); the plan uses no centre gate for houses or villas.
- The hub's own street palms stand in front of some entries from some camera angles (street dressing, unchanged on purpose).
- The viewer's pictures of a design show it with its road side on the right; the real sites have it where the grid says (`roadEdges`).
- Workers Builds fails on every push (the Cloudflare account's preview limit, as on #72 and #75); the `check` job is the CI that tests this branch.

## After the first review: « the terrace is behind the building » (27 Oct)
The Almadies' rooftop restaurant, « Terrasse de Ngor » (`src/venues/rooftop.ts`), finds its stair door by taking the first free side of the tall building nearest to a reference point; with the district's buildings there it landed on the boutique hotel's back yard, behind the building. The hotel now gives the door itself (`SiteResult.rooftopDoor` → `District.rooftopDoor` → `HubWorld.rooftopDoor`, which the venue uses before its search; the other hubs keep the search): on the street face, in the first bay beside the lobby's portal, under the balconies, with the venue's lit sign « TERRASSE DE NGOR · RESTAURANT & LOUNGE ». `tests/almadiesRooftop.test.ts` walks a body from the pavement to it on every gate side and mirror of the site, and the in-game check does the same on the built hub.

## Not in this slice
- Interiors of the hotels and the apartment complexes; buying a room or a suite in them.
- Other hubs' facades.
