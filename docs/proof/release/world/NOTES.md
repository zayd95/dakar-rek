# World pass (release sprint): the look of the five hubs

Branch `wp/world`. Screenshots in this folder are before | after pairs of the same camera, phone viewport (390 × 844), Medium quality, taken in headless Chromium on a software renderer: they are evidence of composition and of counts, **not** of phone frame rate.

## What made the hubs look procedural (audit, before any change)

Looked at 2–4 street views per hub, by day and at 21 h:

1. **One window, everywhere.** Every building of every district was one box showing the same shuttered-window tile on all four faces from the pavement to the roof: no ground floor (no door, no shop, a window at ankle height), the same window on an office, a villa and a Pikine room, windows sliced by the building's corners and by its roof line.
2. **One colour per building.** The tile was multiplied by the wall's paint: shutters, frames and glass all came out in the wall's hue. Nothing on a wall had a colour of its own (a blue metal door, a grey roller shutter, a red board).
3. **No relief that says what a building is.** Offices and flats had the same flat faces; at night every window of every building followed the same rule.

## What changed

### The shared kit: a facade atlas (no draw call, no triangle)

`src/world/facadeAtlas.ts`, `src/world/batch.ts` (`FacadeStyle`), `src/world/grain.ts` (the facade shader).

- The single 128 px window tile is now an **atlas of eight kinds of storey, four bays each** (512 × 1024, painted in code once; night mask 256 × 512): the classic window (unchanged, bay 0), offices (glass ribbon under a concrete sun-breaker, blinds, a claustra bay, air conditioners), a ground floor of shops (roller shutter, open shop with its shelves, the building's door, a glazed front, a painted board over each), a house's ground floor (painted metal door, small barred window, closed shutters, the meter box, the dusty plinth), Mermoz's tiled fronts (white aluminium windows, balcony doors, wrought iron, a band of ceramic tiles), Pikine's self-built walls (small windows with painted metal shutters, a wax-print curtain, cement patches), the unfinished floor (bare breeze blocks between concrete posts, empty openings) and modern blocks (wide windows under sun-breakers, jalousies, loggias, claustras).
- Still **one texture, one material, one mesh per hub**: a building's box says which rows its upper storeys, its ground floor (street faces / other faces) and its top floor read, through a per-vertex attribute; the shader picks one of the row's four bays per cell (so a wall is no longer a stamp), runs the ground floor through its bays in order (shop, shop, door, shop…), **centres the whole bays on each face** (no window cut by a corner; what is left over the last whole storey is plain wall) and keeps a second layer **in its own colour** (alpha channel): doors, shutters, boards, frames, bare blocks are no longer tinted by the wall's paint.
- Night: the same mask lights windows per cell as before; a ground floor of shops is lit more often, an open shop glows, a roller shutter stays dark.
- A wall that names no style is the classic window on the same box with the same uv as before: the Almadies district, the night street's venues, the Cité Jàmm, M2's trade places and every authored place are untouched, and `tests/fixtures/almadiesOutsideDistrict.json` is **unchanged** (not regenerated).
- The kit's 3-D entrance (canopy, step) is set on the bay where the atlas paints the door.

### Per hub

- **Plateau.** The north row and the east column of blocks and every tower are **offices over shops**: ribbon windows, and a concrete fin at each bay line from over the arcade to the roof (real relief). The other blocks are flats over shops (the old shuttered windows, or a modern block), their floor slabs showing on the face. Arcades stay; the boxed shutters behind them are replaced by the painted shops. Roofs: posts left for the next floor, a terrace's tin shelter. **Médina**: the old shutters over shops and boards under the tin awnings, a floor still in bare blocks here and there.
- **Pikine.** Houses have a house's ground floor (metal door, small barred windows, meter, dust at the foot) and small shuttered windows upstairs; a house that never got its render shows its blocks; one upper floor in three is still bare. The shutter set in a compound wall is now a **boutique de quartier** at the yard's corner (open shop or roller shutter, tin awning over the pavement), solid. One wall length in three is bare breeze blocks between concrete posts. The arène, the gare, the Cité Jàmm and the street dressing are where they were.
- **Mermoz · Sacré-Cœur.** Sacré-Cœur's street: tiled fronts over a ground floor of shops (boards, shutters, open shops lit at night). Villas and apartment blocks: tiled or modern fronts by house, a house's ground floor with its door behind the kit's entrance; **a globe on each gate pier and its light on the pavement at night**. Compound walls, gates, balconies, trees: unchanged.
- **Corniche.** The residences of Fann are modern blocks (wide windows under sun-breakers, loggias, claustras) over shops, the entrance on the painted door; the dual carriageway's **median is painted black and white**.
- **Ngor / Almadies.** Nothing of the approved district, beach, night street, venues or parking was touched (see "not done").
- **Roads between districts** (`src/road/chunks.ts`, two lines): the roadside blocks read the atlas too (a house's ground floor, whole bays centred).

### Draw calls

- Batches that share a material and a shadow flag are merged into one mesh (the lamp posts with the plain batch, the pools' water with the glass): −1 or −2 draw calls per district, and as many in the shadow pass. Not in the Almadies, whose street digest names each batch.
- Triangles went **down** in four hubs: the painted ground floors replaced the plinth boxes, the boxed shutters and Pikine's splash bands, which paid for the fins, the roof pieces, the boutiques and the gate lamps.

## Budget: before → after

Method (`cap.mjs` in the session's scratch folder, not committed): a `?debug` build of each commit served locally, 390 × 844, Medium and Low presets, hour 10 and 21, the hub's spawn view (the follow camera) and a busy street view, plus two facade views. "Scenery" is every mesh of the hub's group that is not a vehicle or a person (those come and go with the hour and the day, which made whole-frame counts differ between two runs of the same build by ±10 calls): its draw calls and triangles **in the view** are the frame's `renderer.info` with and without it (shadow pass included), its meshes and triangles **in the hub** are counted on the scene graph. Before = `38aa8461`, after = this branch.

| hub | quality | scenery draw calls in view, before → after (spawn 10 h · street 10 h · spawn 21 h · street 21 h) | worst view Δ calls | hub scenery triangles before → after | Δ |
|---|---|---|---|---|---|
| pikine | medium | 24 → 24 · 22 → 22 · 25 → 25 · 23 → 23 | +0 | 145733 → 145097 | -0.4 % |
| pikine | low | 23 → 23 · 20 → 20 · 24 → 24 · 21 → 21 | +0 | 113486 → 112768 | -0.6 % |
| plateau | medium | 14 → 12 · 19 → 17 · 15 → 13 · 20 → 18 | -2 | 66196 → 62408 | -5.7 % |
| plateau | low | 14 → 12 · 19 → 17 · 15 → 13 · 20 → 18 | -2 | 52156 → 45476 | -12.8 % |
| mermoz | medium | 10 → 8 · 12 → 11 · 11 → 9 · 13 → 12 | -1 | 120509 → 119689 | -0.7 % |
| mermoz | low | 10 → 8 · 11 → 10 · 11 → 9 · 12 → 11 | -1 | 70537 → 70027 | -0.7 % |
| corniche | medium | 13 → 11 · 15 → 13 · 14 → 12 · 16 → 14 | -2 | 69310 → 66588 | -3.9 % |
| corniche | low | 13 → 11 · 15 → 13 · 14 → 12 · 16 → 14 | -2 | 54310 → 48310 | -11.0 % |
| almadies | medium | 24 → 24 · 53 → 53 · 25 → 25 · 54 → 54 | +0 | 209328 → 209328 | +0.0 % |
| almadies | low | 24 → 24 · 53 → 53 · 25 → 25 · 54 → 54 | +0 | 164006 → 164006 | +0.0 % |

Every measured view, both presets, both hours (scenery only; `f1`…`f3` are facade views):

| quality | hub | view | hour | scenery calls in view (before → after) | scenery tris in view | Δ tris | hub scenery meshes | hub scenery tris | Δ |
|---|---|---|---|---|---|---|---|---|---|
| medium | pikine | spawn | 10 h | 24 → 24 | 100642 → 100158 | -0.5 % | 61 → 59 | 145733 → 145097 | -0.4 % |
| medium | pikine | street | 10 h | 22 → 22 | 95408 → 94924 | -0.5 % | 61 → 59 | 145733 → 145097 | -0.4 % |
| medium | pikine | f1 | 10 h | 25 → 25 | 110488 → 110004 | -0.4 % | 61 → 59 | 145733 → 145097 | -0.4 % |
| medium | pikine | f2 | 10 h | 12 → 11 | 87522 → 86966 | -0.6 % | 61 → 59 | 145733 → 145097 | -0.4 % |
| medium | pikine | f3 | 10 h | 9 → 8 | 89268 → 88632 | -0.7 % | 61 → 59 | 145733 → 145097 | -0.4 % |
| medium | pikine | spawn | 21 h | 25 → 25 | 100898 → 100414 | -0.5 % | 62 → 60 | 145989 → 145353 | -0.4 % |
| medium | pikine | street | 21 h | 23 → 23 | 95664 → 95180 | -0.5 % | 62 → 60 | 145989 → 145353 | -0.4 % |
| medium | pikine | f1 | 21 h | 26 → 26 | 110744 → 110260 | -0.4 % | 62 → 60 | 145989 → 145353 | -0.4 % |
| medium | pikine | f2 | 21 h | 13 → 12 | 87778 → 87222 | -0.6 % | 62 → 60 | 145989 → 145353 | -0.4 % |
| medium | plateau | spawn | 10 h | 14 → 12 | 46484 → 42686 | -8.2 % | 43 → 42 | 66196 → 62408 | -5.7 % |
| medium | plateau | street | 10 h | 19 → 17 | 46494 → 42696 | -8.2 % | 43 → 42 | 66196 → 62408 | -5.7 % |
| medium | plateau | f1 | 10 h | 12 → 10 | 44742 → 40944 | -8.5 % | 43 → 42 | 66196 → 62408 | -5.7 % |
| medium | plateau | f2 | 10 h | 13 → 11 | 44744 → 40946 | -8.5 % | 43 → 42 | 66196 → 62408 | -5.7 % |
| medium | plateau | f3 | 10 h | 13 → 11 | 46216 → 42418 | -8.2 % | 43 → 42 | 66196 → 62408 | -5.7 % |
| medium | plateau | spawn | 21 h | 15 → 13 | 46742 → 42944 | -8.1 % | 44 → 43 | 66454 → 62666 | -5.7 % |
| medium | plateau | street | 21 h | 20 → 18 | 46752 → 42954 | -8.1 % | 44 → 43 | 66454 → 62666 | -5.7 % |
| medium | plateau | f1 | 21 h | 13 → 11 | 45000 → 41202 | -8.4 % | 44 → 43 | 66454 → 62666 | -5.7 % |
| medium | plateau | f2 | 21 h | 14 → 12 | 45002 → 41204 | -8.4 % | 44 → 43 | 66454 → 62666 | -5.7 % |
| medium | mermoz | spawn | 10 h | 10 → 8 | 120221 → 118981 | -1.0 % | 16 → 15 | 120509 → 119689 | -0.7 % |
| medium | mermoz | street | 10 h | 12 → 11 | 120453 → 119633 | -0.7 % | 16 → 15 | 120509 → 119689 | -0.7 % |
| medium | mermoz | f1 | 10 h | 11 → 10 | 120451 → 119631 | -0.7 % | 16 → 15 | 120509 → 119689 | -0.7 % |
| medium | mermoz | f2 | 10 h | 11 → 10 | 120451 → 119631 | -0.7 % | 16 → 15 | 120509 → 119689 | -0.7 % |
| medium | mermoz | f3 | 10 h | 11 → 10 | 120451 → 119631 | -0.7 % | 16 → 15 | 120509 → 119689 | -0.7 % |
| medium | mermoz | spawn | 21 h | 11 → 9 | 120461 → 119303 | -1.0 % | 17 → 16 | 120749 → 120011 | -0.6 % |
| medium | mermoz | street | 21 h | 13 → 12 | 120693 → 119955 | -0.6 % | 17 → 16 | 120749 → 120011 | -0.6 % |
| medium | mermoz | f1 | 21 h | 12 → 11 | 120691 → 119953 | -0.6 % | 17 → 16 | 120749 → 120011 | -0.6 % |
| medium | mermoz | f2 | 21 h | 12 → 11 | 120691 → 119953 | -0.6 % | 17 → 16 | 120749 → 120011 | -0.6 % |
| medium | corniche | spawn | 10 h | 13 → 11 | 59738 → 57016 | -4.6 % | 28 → 26 | 69310 → 66588 | -3.9 % |
| medium | corniche | street | 10 h | 15 → 13 | 59742 → 57020 | -4.6 % | 28 → 26 | 69310 → 66588 | -3.9 % |
| medium | corniche | f1 | 10 h | 11 → 9 | 59734 → 57012 | -4.6 % | 28 → 26 | 69310 → 66588 | -3.9 % |
| medium | corniche | f2 | 10 h | 11 → 9 | 59734 → 57012 | -4.6 % | 28 → 26 | 69310 → 66588 | -3.9 % |
| medium | corniche | f3 | 10 h | 19 → 17 | 69194 → 66472 | -3.9 % | 28 → 26 | 69310 → 66588 | -3.9 % |
| medium | corniche | spawn | 21 h | 14 → 12 | 60014 → 57292 | -4.5 % | 29 → 27 | 69586 → 66864 | -3.9 % |
| medium | corniche | street | 21 h | 16 → 14 | 60018 → 57296 | -4.5 % | 29 → 27 | 69586 → 66864 | -3.9 % |
| medium | corniche | f1 | 21 h | 12 → 10 | 60010 → 57288 | -4.5 % | 29 → 27 | 69586 → 66864 | -3.9 % |
| medium | corniche | f2 | 21 h | 12 → 10 | 60010 → 57288 | -4.5 % | 29 → 27 | 69586 → 66864 | -3.9 % |
| medium | almadies | spawn | 10 h | 24 → 24 | 176234 → 176234 | +0.0 % | 94 → 94 | 209328 → 209328 | +0.0 % |
| medium | almadies | street | 10 h | 53 → 53 | 195538 → 195538 | +0.0 % | 94 → 94 | 209328 → 209328 | +0.0 % |
| medium | almadies | f1 | 10 h | 18 → 18 | 176158 → 176158 | +0.0 % | 94 → 94 | 209328 → 209328 | +0.0 % |
| medium | almadies | f2 | 10 h | 17 → 17 | 176156 → 176156 | +0.0 % | 94 → 94 | 209328 → 209328 | +0.0 % |
| medium | almadies | spawn | 21 h | 25 → 25 | 176852 → 176852 | +0.0 % | 95 → 95 | 209946 → 209946 | +0.0 % |
| medium | almadies | street | 21 h | 54 → 54 | 196156 → 196156 | +0.0 % | 95 → 95 | 209946 → 209946 | +0.0 % |
| medium | almadies | f1 | 21 h | 19 → 19 | 176776 → 176776 | +0.0 % | 95 → 95 | 209946 → 209946 | +0.0 % |
| medium | almadies | f2 | 21 h | 18 → 18 | 176774 → 176774 | +0.0 % | 95 → 95 | 209946 → 209946 | +0.0 % |
| low | pikine | spawn | 10 h | 23 → 23 | 88013 → 87447 | -0.6 % | 61 → 59 | 113486 → 112768 | -0.6 % |
| low | pikine | street | 10 h | 20 → 20 | 85178 → 84612 | -0.7 % | 61 → 59 | 113486 → 112768 | -0.6 % |
| low | pikine | f1 | 10 h | 23 → 23 | 96304 → 95738 | -0.6 % | 61 → 59 | 113486 → 112768 | -0.6 % |
| low | pikine | f2 | 10 h | 12 → 11 | 77396 → 76758 | -0.8 % | 61 → 59 | 113486 → 112768 | -0.6 % |
| low | pikine | f3 | 10 h | 8 → 7 | 78418 → 77700 | -0.9 % | 61 → 59 | 113486 → 112768 | -0.6 % |
| low | pikine | spawn | 21 h | 24 → 24 | 88269 → 87703 | -0.6 % | 62 → 60 | 113742 → 113024 | -0.6 % |
| low | pikine | street | 21 h | 21 → 21 | 85434 → 84868 | -0.7 % | 62 → 60 | 113742 → 113024 | -0.6 % |
| low | pikine | f1 | 21 h | 24 → 24 | 96560 → 95994 | -0.6 % | 62 → 60 | 113742 → 113024 | -0.6 % |
| low | pikine | f2 | 21 h | 13 → 12 | 77652 → 77014 | -0.8 % | 62 → 60 | 113742 → 113024 | -0.6 % |
| low | plateau | spawn | 10 h | 14 → 12 | 39350 → 32660 | -17.0 % | 43 → 42 | 52156 → 45476 | -12.8 % |
| low | plateau | street | 10 h | 19 → 17 | 39360 → 32670 | -17.0 % | 43 → 42 | 52156 → 45476 | -12.8 % |
| low | plateau | f1 | 10 h | 12 → 10 | 37698 → 31008 | -17.7 % | 43 → 42 | 52156 → 45476 | -12.8 % |
| low | plateau | f2 | 10 h | 13 → 11 | 37700 → 31010 | -17.7 % | 43 → 42 | 52156 → 45476 | -12.8 % |
| low | plateau | f3 | 10 h | 12 → 10 | 39070 → 32380 | -17.1 % | 43 → 42 | 52156 → 45476 | -12.8 % |
| low | plateau | spawn | 21 h | 15 → 13 | 39608 → 32918 | -16.9 % | 44 → 43 | 52414 → 45734 | -12.7 % |
| low | plateau | street | 21 h | 20 → 18 | 39618 → 32928 | -16.9 % | 44 → 43 | 52414 → 45734 | -12.7 % |
| low | plateau | f1 | 21 h | 13 → 11 | 37956 → 31266 | -17.6 % | 44 → 43 | 52414 → 45734 | -12.7 % |
| low | plateau | f2 | 21 h | 14 → 12 | 37958 → 31268 | -17.6 % | 44 → 43 | 52414 → 45734 | -12.7 % |
| low | mermoz | spawn | 10 h | 10 → 8 | 70409 → 69439 | -1.4 % | 16 → 15 | 70537 → 70027 | -0.7 % |
| low | mermoz | street | 10 h | 11 → 10 | 70411 → 69901 | -0.7 % | 16 → 15 | 70537 → 70027 | -0.7 % |
| low | mermoz | f1 | 10 h | 10 → 9 | 70409 → 69899 | -0.7 % | 16 → 15 | 70537 → 70027 | -0.7 % |
| low | mermoz | f2 | 10 h | 11 → 10 | 70479 → 69969 | -0.7 % | 16 → 15 | 70537 → 70027 | -0.7 % |
| low | mermoz | f3 | 10 h | 11 → 10 | 70479 → 69969 | -0.7 % | 16 → 15 | 70537 → 70027 | -0.7 % |
| low | mermoz | spawn | 21 h | 11 → 9 | 70649 → 69769 | -1.2 % | 17 → 16 | 70777 → 70357 | -0.6 % |
| low | mermoz | street | 21 h | 12 → 11 | 70651 → 70231 | -0.6 % | 17 → 16 | 70777 → 70357 | -0.6 % |
| low | mermoz | f1 | 21 h | 11 → 10 | 70649 → 70229 | -0.6 % | 17 → 16 | 70777 → 70357 | -0.6 % |
| low | mermoz | f2 | 21 h | 12 → 11 | 70719 → 70299 | -0.6 % | 17 → 16 | 70777 → 70357 | -0.6 % |
| low | corniche | spawn | 10 h | 13 → 11 | 49724 → 43724 | -12.1 % | 28 → 26 | 54310 → 48310 | -11.0 % |
| low | corniche | street | 10 h | 15 → 13 | 49728 → 43728 | -12.1 % | 28 → 26 | 54310 → 48310 | -11.0 % |
| low | corniche | f1 | 10 h | 11 → 9 | 49720 → 43720 | -12.1 % | 28 → 26 | 54310 → 48310 | -11.0 % |
| low | corniche | f2 | 10 h | 11 → 9 | 49720 → 43720 | -12.1 % | 28 → 26 | 54310 → 48310 | -11.0 % |
| low | corniche | f3 | 10 h | 19 → 17 | 54194 → 48194 | -11.1 % | 28 → 26 | 54310 → 48310 | -11.0 % |
| low | corniche | spawn | 21 h | 14 → 12 | 50000 → 44000 | -12.0 % | 29 → 27 | 54586 → 48586 | -11.0 % |
| low | corniche | street | 21 h | 16 → 14 | 50004 → 44004 | -12.0 % | 29 → 27 | 54586 → 48586 | -11.0 % |
| low | corniche | f1 | 21 h | 12 → 10 | 49996 → 43996 | -12.0 % | 29 → 27 | 54586 → 48586 | -11.0 % |
| low | corniche | f2 | 21 h | 12 → 10 | 49996 → 43996 | -12.0 % | 29 → 27 | 54586 → 48586 | -11.0 % |
| low | almadies | spawn | 10 h | 24 → 24 | 139218 → 139218 | +0.0 % | 94 → 94 | 164006 → 164006 | +0.0 % |
| low | almadies | street | 10 h | 53 → 53 | 156394 → 156394 | +0.0 % | 94 → 94 | 164006 → 164006 | +0.0 % |
| low | almadies | f1 | 10 h | 18 → 18 | 139142 → 139142 | +0.0 % | 94 → 94 | 164006 → 164006 | +0.0 % |
| low | almadies | f2 | 10 h | 17 → 17 | 139140 → 139140 | +0.0 % | 94 → 94 | 164006 → 164006 | +0.0 % |
| low | almadies | spawn | 21 h | 25 → 25 | 139728 → 139728 | +0.0 % | 95 → 95 | 164516 → 164516 | +0.0 % |
| low | almadies | street | 21 h | 54 → 54 | 156904 → 156904 | +0.0 % | 95 → 95 | 164516 → 164516 | +0.0 % |
| low | almadies | f1 | 21 h | 19 → 19 | 139652 → 139652 | +0.0 % | 95 → 95 | 164516 → 164516 | +0.0 % |
| low | almadies | f2 | 21 h | 18 → 18 | 139650 → 139650 | +0.0 % | 95 → 95 | 164516 → 164516 | +0.0 % |

In no view of any hub, at either preset or hour, are the scenery's draw calls higher than before; triangles are lower in four hubs and identical in the Almadies.

**The raw `__dakar.drawCalls()` / `__dakar.tris()` of the whole frame** (the hub's spawn view and the street view), for the record. They include the people, the vehicles, the player and the sky, which differ between two runs of the same build (the hour's crowd and the day of the game's calendar, which advances with real time: the two runs fell on different days). 24 of the 40 views are lower, 3 equal, 13 higher; in every one of the 13 the scenery's own share is equal or lower and the whole difference is in the column of people and vehicles (the Almadies spawn view, where this pass changes nothing at all, reads 76 → 87). The whole-frame numbers therefore do not contradict the scenery numbers, but they cannot prove them either: that is why the scenery was measured apart.

| hub | quality | view | hour | whole frame draw calls before → after | of which people, vehicles and the rest (before → after) | whole frame triangles before → after |
|---|---|---|---|---|---|---|
| pikine | medium | spawn | 10 h | 127 → 125 | 103 → 101 | 177665 → 176137 |
| pikine | medium | street | 10 h | 77 → 76 | 55 → 54 | 169895 → 163523 |
| pikine | medium | spawn | 21 h | 184 → 203 | 159 → 178 | 211321 → 226527 |
| pikine | medium | street | 21 h | 126 → 119 | 103 → 96 | 185985 → 182491 |
| plateau | medium | spawn | 10 h | 108 → 108 | 94 → 96 | 120986 → 116646 |
| plateau | medium | street | 10 h | 100 → 105 | 81 → 88 | 107910 → 108924 |
| plateau | medium | spawn | 21 h | 110 → 111 | 95 → 98 | 118596 → 119346 |
| plateau | medium | street | 21 h | 123 → 124 | 103 → 106 | 116736 → 115518 |
| mermoz | medium | spawn | 10 h | 60 → 57 | 50 → 49 | 173635 → 172299 |
| mermoz | medium | street | 10 h | 56 → 56 | 44 → 45 | 164493 → 163121 |
| mermoz | medium | spawn | 21 h | 69 → 66 | 58 → 57 | 175841 → 173529 |
| mermoz | medium | street | 21 h | 67 → 61 | 54 → 49 | 165885 → 164379 |
| corniche | medium | spawn | 10 h | 72 → 66 | 59 → 55 | 116276 → 111370 |
| corniche | medium | street | 10 h | 98 → 79 | 83 → 66 | 129834 → 116920 |
| corniche | medium | spawn | 21 h | 81 → 79 | 67 → 67 | 116934 → 116204 |
| corniche | medium | street | 21 h | 94 → 102 | 78 → 88 | 122050 → 124114 |
| almadies | medium | spawn | 10 h | 76 → 87 | 52 → 63 | 233590 → 239272 |
| almadies | medium | street | 10 h | 122 → 113 | 69 → 60 | 273908 → 266470 |
| almadies | medium | spawn | 21 h | 82 → 81 | 57 → 56 | 236474 → 237018 |
| almadies | medium | street | 21 h | 130 → 125 | 76 → 71 | 275426 → 269786 |
| pikine | low | spawn | 10 h | 123 → 126 | 100 → 103 | 145155 → 146271 |
| pikine | low | street | 10 h | 76 → 90 | 56 → 70 | 133654 → 140466 |
| pikine | low | spawn | 21 h | 142 → 145 | 118 → 121 | 151605 → 150523 |
| pikine | low | street | 21 h | 103 → 117 | 82 → 96 | 142152 → 147766 |
| plateau | low | spawn | 10 h | 112 → 100 | 98 → 88 | 98428 → 86044 |
| plateau | low | street | 10 h | 91 → 79 | 72 → 62 | 84320 → 72048 |
| plateau | low | spawn | 21 h | 109 → 106 | 94 → 93 | 94502 → 87854 |
| plateau | low | street | 21 h | 101 → 98 | 81 → 80 | 88446 → 79254 |
| mermoz | low | spawn | 10 h | 59 → 56 | 49 → 48 | 105343 → 103681 |
| mermoz | low | street | 10 h | 53 → 55 | 42 → 45 | 101901 → 101661 |
| mermoz | low | spawn | 21 h | 67 → 62 | 56 → 53 | 106069 → 104893 |
| mermoz | low | street | 21 h | 55 → 56 | 43 → 45 | 102155 → 102193 |
| corniche | low | spawn | 10 h | 72 → 67 | 59 → 56 | 90804 → 83730 |
| corniche | low | street | 10 h | 77 → 71 | 62 → 58 | 94468 → 83576 |
| corniche | low | spawn | 21 h | 77 → 74 | 63 → 62 | 92616 → 86640 |
| corniche | low | street | 21 h | 92 → 85 | 76 → 71 | 96140 → 88952 |
| almadies | low | spawn | 10 h | 71 → 69 | 47 → 45 | 180370 → 180508 |
| almadies | low | street | 10 h | 111 → 111 | 58 → 58 | 206848 → 206442 |
| almadies | low | spawn | 21 h | 75 → 80 | 50 → 55 | 181542 → 183620 |
| almadies | low | street | 21 h | 122 → 119 | 68 → 65 | 207766 → 207182 |

Texture memory goes the other way and is the cost of this pass: the facade texture was 128 × 128 (+ its mask), it is 512 × 1024 RGBA with mipmaps (about 2.8 MB) and a 256 × 512 mask (about 0.7 MB), uploaded once per hub and once for the roads' material. The shader adds one hash and a handful of operations per facade pixel and samples with explicit gradients (`textureGrad`, WebGL 2, which three r169 already requires).

## Tests

- `npx tsc --noEmit`: clean.
- New `tests/facadeAtlas.test.ts` (5 tests): the atlas' size, the unstyled wall unchanged (36 vertices, same uv, no attribute), the style packed face by face, the stretch to given storeys, and in Pikine, Plateau, Mermoz and Corniche: one facade mesh that names at least two kinds of storey and a ground floor, and one mesh per material among the hub's merged batches.
- `tests/almadiesDistrict.test.ts` (the digest outside the district, full and lite) passes against the **unchanged** fixture; `tests/villaCompound.test.ts`, `tests/street*.test.ts`, `tests/medina.test.ts`, `tests/mermoz*.test.ts`, `tests/arenaLanes.test.ts`, `tests/gatePlaza.test.ts`, `tests/galaTraffic.test.ts`, `src/road/*.test.ts` pass.
- Full `npx vitest run` (once, at `bada7f13`, on a shared machine at load average about 20): 250 files, 247 passed, 2 skipped, 1 failed; 3 659 tests passed, 4 skipped, 1 failed. The failure is `tests/perf.evening.test.ts` (a wall-clock budget, « ms per frame on this machine »: 3.47 ms against 3 ms under that load); run alone right after, it passes. `tests/street.test.ts` timed out once (5 s limit) in a parallel run under the same load and passes alone (2.3 s).

## How far the look really moved (candid)

- **Moved a lot:** the walls. Every generic building of Pikine, the Plateau, the Médina, Mermoz, Sacré-Cœur and the Corniche now has a ground floor, a door, a kind (office, flats, house, unfinished), windows that differ from bay to bay and colours of its own. From the street the Plateau reads as offices over shops, Sacré-Cœur as a shopping street, Pikine as self-built houses behind low walls with a boutique at the corner.
- **Moved a little:** silhouettes. Buildings are still boxes with a parapet; fins, roof posts, shelters and boutiques help, but there are no setbacks, no L-shaped or stepped volumes, no pitched-roof variety beyond the Plateau's existing tile roofs.
- **Painted, not modelled:** doors, shutters, shop interiors, grilles and tile bands are texture (128 px for 3.4 m, about 2.7 cm a pixel): convincing from the pavement across the street, soft with the nose against the wall. The balconies of the kit are not aligned with the painted balcony doors (bays are drawn per cell).
- **Same door everywhere:** each row has one painted door (a blue-green metal door for houses, a dark green one between shops); only the 3-D entrance in front of it differs.

## Not done

- **Ngor / Almadies**: nothing changed, on purpose (approved district, beach, night street and parking; the digest fixture is untouched). The kiosks of every hub, the Almadies' two included, do get the atlas' ground floor behind their counter (texture only, same geometry). The "upscale villas, hotels, lounges, exterior lighting" items were not worked on beyond that.
- **VDN / BRT**: lives in `src/road/**` (outside this package but for two lines); only the roadside blocks' walls changed. No work on the BRT lanes, stations or the VDN's own identity.
- **Corniche**: only the residences' walls and the painted median. No new sea wall, public space or roadside structure; the sea view, the promenade, the railings and the arches are as they were.
- **Street furniture, sidewalks** (Plateau): no new benches, bins or bollards: every solid piece on a pavement moves the walkers' lanes and the street dressing's random stream, and a walk-through prop is worse than none.
- **Signs**: each painted sign is still its own mesh and texture (about 20 draw calls in the Plateau at most, far fewer in view). Merging them into one atlas mesh is the next real draw-call saving; it touches `HubWorld.signs`, the night emissive and the signage checks, so it was left for a pass of its own.
- **Collision geometry**: unchanged except Pikine's corner boutiques (new solid boxes inside the yards, added after the street dressing so nothing else moves). Pikine's compound walls are still not solid, as before.
- **Phone performance**: counts only. Nothing here was run on an iPhone; the new shader path (`textureGrad`, one extra vertex attribute on the facade mesh) and the larger texture should be checked on a real device.

## Second pass (release branch, commit `399e485c`): skylines, roofs, the sea front

Added after the first pass, in the same rules: everything goes into the districts' merged batches (**no draw call added**), every piece is placed from its building's own position (no random stream is drawn, so nothing else moves), and Ngor / Almadies is untouched.

- **Plateau**: set-back last storeys, oversailing roof slabs (the concrete « casquette » of the 1960s blocks), stair heads, black tanks on steel legs, masts; glass balconies on the flats' loggia bays; a concrete canopy over the side-street shops.
- **Pikine**: the floor to come (corner posts with their irons, a length of block wall already laid) on bare houses and one house in three; a blue tank on a steel stand on one house in five.
- **Mermoz · Sacré-Cœur**: four villas in ten under a hipped tile roof (clay red, or the green glazed tile); piers with caps along the compound walls and a servants' door on the side street; tanks and stair heads on the blocks; balconies on their glass doors.
- **Corniche**: a low whitewashed sea wall along the promenade with a pier and a globe at each arch (lit at night), open at the beach's way down; benches on the promenade facing the sea (solid: +8 colliders).

Static scenery, whole district (`buildHub`, counted in a unit test, full / lite):

| District | Meshes | Triangles before → after (full) | Triangles before → after (lite) | Colliders |
|---|---|---|---|---|
| Pikine | 66 → 66 | 133 507 → 135 919 (+1.8 %) | 105 632 → 107 840 | 711 → 711 |
| Plateau | 49 → 49 | 66 636 → 69 986 (+5.0 %) | 49 704 → 51 888 | 266 → 266 |
| Mermoz | 22 → 22 | 124 051 → 132 663 (+6.9 %) | 74 397 → 77 231 | 303 → 303 |
| Corniche | 33 → 33 | 70 814 → 74 170 (+4.7 %) | 52 536 → 54 324 | 151 → 159 |
| Almadies | 97 → 97 | 213 804 → 213 804 | 168 374 → 168 374 | 1 009 → 1 009 |

`13-second-pass-skylines.jpg`: seven raised views after the pass (Plateau ×2, Pikine, Mermoz ×2, Corniche ×2), phone viewport, Medium, hour 10, headless on a software renderer. Evidence of composition, not of phone frame rate.

## Third pass: the Corniche after the owner's drone reference (11 November)

The owner sent a drone video of Dakar; its first ten seconds fly along the Corniche Ouest. What it shows, and what was built from it (the video itself is not in the repository: it is other photographers' work):

| In the reference | In the game now |
|---|---|
| a great round concrete esplanade on a headland, people walking on it | `src/world/cornicheEsplanade.ts`: a headland of ochre laterite opposite the end of the street at z = −60, the round esplanade on it (a ring step round a disc, 30 m across), three people on it (none on Low). **It is walked on**: the promenade's railing and the sea wall are open there |
| wavy painted terraces in red, yellow and purple between the road and the sea | five wavy painted bands between the promenade and the disc |
| black basalt boulders at the foot of ochre banks, small beaches | basalt along the headland's edge (they mark where one can walk) and in heaps along the shore; an ochre bank at the foot of the sea wall |
| turquoise water breaking white | three bands of shallows from turquoise to the sea's blue, two wavering lines of foam, the swell breaking round the headland |
| a promenade paved in bands of dark red and purple with yellow lines | the promenade path: bands of red and purple pavers with a yellow line between them (it was one red strip) |
| a sand pitch inside a yellow kerb | the Corniche's pitch is sand inside a yellow kerb, on red pavers (it was mown grass); same size, goals and lines for the evening match |

Not built from the reference: the car park beside the esplanade, the palms in the median, the villas behind white walls on the land side, the red cycle lane. The terraces and the disc are painted flat: the game's ground has no height there.

Cost, whole district (`buildHub`): meshes 33 → 33 (**no draw call**: everything is in the `plain` batch); triangles 74 170 → 77 500 (full), 54 324 → 56 550 (lite); colliders 159 → 168 (the headland's three walls, the water's edge either side of it, which was the district's bound before, and two stops on the grass strip). The district's bound moved from x = −155 to −177 for the headland only.

Checked: `tests/cornicheEsplanade.test.ts` (the way down is clear, the disc is clear, the headland is closed on its three seaward sides, the water's edge stands everywhere else including the fish beach) and `scripts/check-corniche-esplanade.mjs` (a real finger on the stick: from the pavement through the opening onto the disc, against each edge, back up: 10/10).

`14`–`16`: before | after pairs (raised view, from above, from the promenade). `17`: the promenade's paving. `18`: the sand pitch. `19`: the esplanade at 21 h. Headless on a software renderer, Medium: composition and counts, not phone frame rate.

The reference's other shots are Dakar's sunsets over the ocean. The game's sun already went down over the western sea; two things were added so that it is seen (`20`: the esplanade at 18 h and 19 h, clear sky):
- `src/world/sky.ts`: a low sun is a larger, softer ball in a wider glow (it was a pin-point at every height). Every district's sky.
- `src/world/builder.ts`: the Corniche's sea takes the sun (a specular term on the same mesh and colours): its light lies on the water under it. The Almadies' sea, to the north, is unchanged.

## The monument on its hill (the owner's photographs, 11 November: « on a high mountain with stairs »)

`src/world/builder.ts`, case `monument` (the Corniche's block « 1,0 »). It was a cone 12 m high with the group on its middle and a stair of 34 steps at 38°.

- **The hill** is 17 m high and its summit stands toward the back of the block, so the sea side is one long slope and the back falls away steeply. Its flanks are broken ground (three uneven rings): dry grass and bougainvillea on the lower two thirds, bare rock above, outcrops breaking out of it, a crag north of the summit.
- **The stair** is 9 m wide (7 before), 58 steps at about 35°, a paler tread every fifteen (the landings' line), white parapets, two-bar steel handrails, a lamp with a flat head every other post, bougainvillea and scrub along both sides. It is climbed on foot as before (the same ramp, longer).
- **The group** is a model now, not hand-built shapes (the owner: « the monument is ugly… use my Meshy credits… make it look realistic »): `public/assets/landmarks/renaissance_group.glb`, generated with Meshy from one photograph of the monument's long side and reduced to 14 431 triangles with one 1024 colour texture (0.9 MB; 35 credits; `docs/ASSET_REGISTER.md`). `src/world/landmarks.ts` adds it to the Corniche once loaded: 20 m tall, its long side to the stair as it is seen from the steps, one mesh and one draw call. Its far side is the generator's guess. Rock is built up under its two ends (the group is 21 m long on a summit 14 m across); the terrace in front of it is 3.6 m deep.
- The hub's random stream is not disturbed: the old vegetation loop draws exactly what it drew; everything new is placed from its own position.

`21`, `22`: before | after of the hill from above and from the back (11 h, with the hand-built group of the first attempt). `23`: the stair and the model at 16 h. Checked with `scripts/check-monument-stair.mjs` (a real finger on the stick: up to the summit, the group and the parapet hold, back down, the flank is closed, the model is in the scene and textured: 9/9).

## Landmarks and Dakar 2026 on the Corniche (the owner, 11 November, evening)

« Use my Meshy credits for all Dakar landmarks… bring this Dakar world to life, incorporate few JOJ 2026 theme, act on your own. » A first set, all on the Corniche, none of it in the way of anything that was there:

- **The Mosquée de la Divinité** on the beach below the road (the owner's photograph of the Corniche road: the twin minarets over the palms). Built in code, in the hub's batch: two square white minarets side by side, six tiers of arched balconies each under a green dome, the prayer hall behind under its own dome. Solid. (A generated mosque was tried and was the wrong building.)
- **The lighthouse of the Mamelles** on a hill of laterite out in the sea north of the esplanade: the hill in code, the lighthouse a model (`src/world/landmarks.ts`). Out of reach.
- **Two baobabs** (a model, twice) at the back corners of the monument's hill, solid at the trunk.
- **Dakar 2026**: a welcome arch over the way down to the esplanade (« DAKAR 2026 · JEUX DE LA JEUNESSE », « DALAL AK JÀMM · BIENVENUE » on the sea side), a line of thirteen nations' flags on masts in the rocks at the headland's seaward edge, a banner in the national colours either side of each lamp mast on the Corniche's median. **No emblem of the Games is drawn**: the rings, the logo and the mascot belong to the organisers; the dressing is the host city's own.
- `src/world/landmarks.ts` is the general form of the statue's loader: a hub lists the models it wants (`HubWorld.landmarks`), each is fetched once, one mesh and one draw call each.

Cost on the Corniche: three more draw calls when the models have loaded (the statue group, the lighthouse, the baobabs count one each… the two baobabs are two meshes: four in all), two painted signs, 2.2 MB of models fetched on the first visit to the district. `24`: the road with its banners and the minarets, the mosque, the arch, the flags, the lighthouse, a baobab under the monument (16 h, Medium, headless).

Not done from that request: landmarks in the other districts (the Plateau's station, cathedral and Place de l'Indépendance, the Grande Mosquée), generated buildings and street furniture in general, Games dressing outside the Corniche.
