# Pikine Street DNA — phase 2: the first walk

One polished neighbourhood slice, for review before any other district gets the same treatment.

**Route.** The player's room (Ma chambre, Cité Jàmm side) → west along the first road → south down the avenue (x = −60) past the
gare's west gate → east along the road to the grand-place → into the square → back and west into the shops' court
(Salon Awa, Boutique Diallo). About 360 m on foot.

**Branch.** `feature/pikine-street-dna-p2-20261019`, local only: not pushed, no preview build, nothing deployed. Based on
`03477aa` (the save-v6 baseline). It does not contain M1-C (PR #50), the Meshy avatars or any vehicle work.

**Not touched:** Meshy, vehicles, dealer showrooms, social gameplay, save schema, multiplayer, `src/world/builder.ts`, `src/world/city.ts`.
The slice is one new module registered last in `src/game/modules.ts`.

## What the street was missing

The baseline walk is a wide sand road between low plain walls: a good gare and a good square, and between them nothing that says
*Dakar*. No overhead layer (poles, wires, bunting), no painted walls, no shopfronts or gates at the street's edge, no landmark
you can steer by, blank backs and flanks on the shops. Roads were empty of paint.

## What the slice adds

| Layer | Pieces | Where |
|---|---|---|
| Painted walls | 2 m compound walls with murals: the wrestler (« LÀMB »), the Lions, an invented telecom advert, bissap, « PIKINE · Sunu quartier », wax print, « Défense de déposer les ordures » | avenue east z −51…−8, avenue west z 8…51, the room's flanks |
| House gates | double leaf in painted metal with ribs, cap-stone pillars, « Keur Mbaye / Sarr / Gueye » name plates | same frontage, never two in a row |
| Boutiques | built into the wall: dark shop, rolled shutter, shelf with goods, fascia (« Boutique Abdou », « Couture Fatou », « Quincaillerie Ndiaye », « Télécentre »), striped awning | same frontage |
| Overhead | utility poles with crossarms and transformer boxes, wires along and across the avenue, service drops, bunting in the national colours | the avenue, the road to the square, the gare portal, the gateways |
| Landmarks | a baobab at the first corner; the gare's portal (two tricolour pylons, beam, blade signs); the grand-place's gateway; the market gateway of the shops' court | first corner, gare west gate, square's north side, court entrance |
| Shops' court | Salon Awa's blank east flank becomes its painted mural; tiled aprons, chalk A-boards and crates in front of both shops | block (0,3) |
| Ground | painted kerbs (white and blue over the broken stones), yellow-and-black speed bumps, a standpipe with its jerrycans, whitewashed-tyre planters | avenue, gare gate, square corners |

Everything is the existing vocabulary: the street-dress module's `SUN` palette and sign conventions, invented advertisers only,
French and Wolof. No paid asset, no new network request.

## How it is built

`src/game/pikineDna.ts`, a `GameModule` whose `hubLoaded` runs for Pikine only, after every other module:

- **One draw call, one texture.** A 1024² canvas atlas painted in code (8 murals at 512×176, 12 signs at 256×100, a white cell
  for the plain parts) and one merged `BufferGeometry` with vertex colours, the same technique as `streetDress.ts`. Night glow:
  the signs and a little of the murals via an emissive map, lit by `hub.signs` with the other shop signs.
- **No random stream of the hub is touched.** The slice draws after the builder from a seed of its own, so every tree, stall,
  car and person of Pikine is where it was. `src/world/builder.ts` is unchanged.
- **Placement is checked, not assumed.** A piece goes down only if no collider, interaction place, seat, rapide or crossing is
  there. Solid pieces get colliders; none stands in the crowd's pavement lanes (`PAVE`, 5.05–5.95 m from a road's centre line).
  The roadway is never narrowed: the first free corner is chosen for the baobab, poles stand at 6.55 m, gates and walls at 7.1 m.
- **Quality.** Low keeps the walls, gates, boutiques and landmarks; it drops wires, bunting, kerb paint and props.
- **Disposal.** The mesh, geometry and material go with the hub; the atlas is cached for the session like the street-dress atlas.

## Verification

`scripts/check-pikine-dna.mjs` (assertions), `scripts/measure-pikine-route.mjs` (draw calls, triangles, frame time, collision sweep),
`scripts/capture-pikine-route.mjs` and `capture-pikine-details.mjs` (iPhone-sized 390×844 @2x screenshots), `scripts/walk-pikine-route.mjs`
(a scripted walker on the real input and collision, stepped at fixed time, assembled into an mp4). The walk and the two shot lists
live in `scripts/pikine-route.mjs`.

Results are in `docs/pikine-dna/REPORT.md`; the screenshots and walkthrough in `docs/pikine-dna/`.

## Round 2 (after the first review)

Rhythm, ground, night and the room's own street: see `docs/pikine-dna/round2/REPORT.md`. In the module: wall units placed as clusters,
gaps and unfinished stretches (`unit(..., 'rough')`); worn patches, dust and darker soil as flat discs; a lit cell in the atlas for windows
and bulbs plus one additive mesh of warm pools, driven by the same night measure as the street lamps (`pikineDnaModule.update`); poles
generalised to any line (`network`) with a free-place search; the bank's flank sign and the Cité Jàmm blade on the room's road.

## Round 3 (phone camera, roadside life, ground)

See `docs/pikine-dna/round3/REPORT.md`. The follow camera (5.1 m up, 10.5 m behind) is audited by `scripts/check-pikine-camera.mjs`; gateways,
bunting, wires and blade signs were lifted clear of its band (static rule in `check-pikine-dna.mjs`). Roadside clusters (tontine, attaya, tray, sacks,
bench, washing line, parasol) stand on the pavement's back strip; eight trades each have their own forecourt; the roadway's ground is broken up by
vertex-coloured drifts whose rim is the ground's own colour. Slice triangles went down (12 982 → 10 771 medium), still 2 draw calls and the same atlas.

## Not done, on purpose

- Other districts (the Cité Jàmm block, the bank's frontage, the arena street, the east side of the grid).
- Façade upgrades for the builder's own houses (they stay behind the new walls; changing them means touching the builder's random streams).
- Anything that moves: animals, a goat, children's games; vehicles on this stretch.
- A Higgsfield or other generated texture for the murals: the painted atlas is code, so the slice costs no credits and can be re-skinned in one function.
