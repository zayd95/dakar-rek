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
(to come)

## Not in this slice
- Interiors of the hotels and the apartment complexes; buying a room or a suite in them.
- Other hubs' facades.
