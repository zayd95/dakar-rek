# The Almadies district kit

**The owner (27 Oct):** « I love the villa .. now make adapt this style to almadies hub change all the old facades, create distinctive shapes like this with doors balcony etc .. we should have houses, villas, hotels and apartment complexes that what makes almadies different. » and, on the first pictures: « This is cool, I don't want them in isolated areas they part of what makes the city ».

Fourteen designs in the flagship villa's style (ivory render, travertine, oak, bronze, glass; cantilevered slabs, glass guards, deep balconies, a real front door, a roof terrace), in four kinds, on 30 sites that cover 41 lots of the Almadies (`src/world/almadies/plan.ts`). Every design is a named builder, drawn on the villa's drawing context (`src/world/villaCompound.ts` `makeDraw`) into the hub's merged batches: no draw call per building (a sign board is one, at most one per hotel or residence).

**Open to the street.** The district is part of the city, not a set of compounds. The boundary is a railing on a low plinth along the street and every edge that runs by a road, a wall only between neighbours; every design has a walk-in way from the pavement to its door, lobby or passage; the hotels and residences have cafés, shops and lobbies at street level.

**Files:**
- this catalogue;
- the pictures: `docs/kits/almadies-district/<id>-front.png`, `-street.png` (eye level, from the pavement), `-night.png` (21 h);
- each design as a 3D file: `docs/kits/almadies-district/glb/<id>.glb` (colours, no textures);
- the numbers: `docs/kits/almadies-district/cost.json`.

`scripts/shots-district-designs.mjs docs/kits/almadies-district --views front,street --glb docs/kits/almadies-district/glb` makes the pictures, the numbers and the GLB files in a real browser, through the district viewer (`tools/district-viewer/`, `src/world/almadies/viewer.ts`: `window.district.show({ kind, variant, facing, mirror, palette, storeys, night, lite, roads })`).

## How a design is built
- **A site** (`contract.ts` `Site`): kind, variant, block and lots, rectangle, facing (the street side), mirror, storeys, palette, name and house number, the car gate's side. `siteDraw(kit, site)` is the plan's frame (metres from the site's origin, +z toward the street, x along it, y up, the ground at 0.1) and the batches.
- **A design** is `Variant { id, name, size, build }`; `build(d)` draws and returns what it keeps clear and its group. The registries are `houses.ts`, `villas.ts`, `hotels.ts`, `residences.ts`; `district.ts` `buildDistrict(kit)` draws the plan.
- **The shared pieces** (`parts.ts`): `volume`, `slabEdge`, `parapet`, `glazing` (about three panes in four lit at night), `louvres`, `balcony`, `canopy`, `pergola`, `door`, `nameBoard`, `planter`, `roofPlant`, `palm`, `paving`, `solidBox`, and `perimeter`.
- **`perimeter(d, { gate, entries, front, h })`**: the open boundary. A bronze railing of flat bars (1.3 m) on a 45 cm stone plinth, stone piers, short trimmed hedges, along the street edge and every edge that runs by a road (`roadEdges(d)`: the site reaches the block's edge); 2.4 m walls between neighbours; a bar gate, shut and solid, where the site says; `entries: [{ x, w }]` cuts a walk-in opening (open ground between two lantern piers, nothing solid across it). About 250 triangles for a 22 m lot's street edge and one road side, 550 for two lots, 900 for a block.
- **Palettes** (`contract.ts` `PALETTES`): ivory, sand, greige, oak, terracotta, azur.
- **Budgets** (`TRI_CAP`, medium, gross; the low preset draws about 70–85 % of it): house 1.95 k, villa 3.05 k, hotel 6 k (2 lots) / 9.9 k (4), residence 4.2 k (1 lot) / 5.6 k (2) / 8.9 k (4); they include the open boundary and the life on the ground (below). The figures in the tables are the design's own triangles on its plan site, the viewer's scenery (the road, the kerb, the person for scale, the capsules that stand for the people a design places) not counted.
- **Life on the ground** (round 3): `SiteResult.life` = the **seats** a design registers (terrace chairs with their tables, benches: the player sits on them and the city's ambient people take every free one at the hours that suit) and the **people** it places (a doorman and a bellhop at a lobby, a valet at the drop-off, a waiter and seated customers on a terrace, a shopkeeper at her door, a guard at the gate or the car gate, someone talking on a balcony), within `LIFE_CAP` (house 2 people / 6 seats, villa 2 / 8, hotel 10 / 44, residence 8 / 32), and the small props of a lived-in street from `parts.ts`: `parkedCar` (about 80 triangles, solid), `scooter` (70, solid), `bench` (50, hands its seats), `menuBoard` (24). In the viewer the people are capsules (blue standing, orange talking, green seated); in the game they are the humanoids of the hub's placed people.
- **Never** `Math.random` (every client draws the same street); no mesh of its own beyond the batches and one sign.

## Houses (1 lot, 2–3 storeys)
| | Design | Medium / low triangles |
|---|---|---|
| ![](almadies-district/house-m1-street.png) | **house-m1 · Maison empilée**: offset stacked boxes, a big glass-guarded balcony over the street, an oak-slatted carport slab. | 1 644 / 1 320 |
| ![](almadies-district/house-m2-street.png) | **house-m2 · Maison en L**: two wings under one deep flat roof, a loggia in the L's corner with a terrace and a timber pergola, a stone plinth, a garage with a green roof. | 1 710 / 1 444 |
| ![](almadies-district/house-m3-street.png) | **house-m3 · Maison à gradins**: three masses stepping back, terraces with glass guards, an oak screen, a corner window, a roof room. | 1 718 / 1 418 |

**Life (round 3):** each house has a car or a scooter and one or two people: house-m1 a resident on the doorstep and a visitor on the path, a sedan in the carport and a scooter by the door; house-m2 a man talking from the street balcony, a sedan and a scooter on the lawn; house-m3 a woman on the first terrace, a sedan and a scooter.

## Villas (1 lot, 2–3 storeys, a pool)
| | Design | Medium / low triangles |
|---|---|---|
| ![](almadies-district/villa-c1-street.png) | **villa-c1 · Villa Porte-à-faux**: a long white volume cantilevered 5.6 m over the carport, a deep balcony, an oak claustra on the end. | 2 648 / 2 182 |
| ![](almadies-district/villa-c2-street.png) | **villa-c2 · Villa des Arcades**: a portico of square piers and a deep lintel, a sand ground floor, accent bands, a small stepped tower, a roof terrace. | 2 570 / 2 128 |
| ![](almadies-district/villa-c3-street.png) | **villa-c3 · Villa des Pavillons**: a tall living pavilion and a low suite/garage pavilion under deep thin roofs, a glazed link with the door, a long water mirror in front, a long pool and a pergola behind. | 2 612 / 2 146 |
| ![](almadies-district/villa-c4-street.png) | **villa-c4 · Villa de la Tour**: a stair tower in vertical oak slats rising a storey above the house, stacked and staggered balconies, a rooftop lounge. | 2 722 / 2 198 |

All seven: a walk-in opening in the railing in line with the front door and a short stone path to the step (a test walks a body from the pavement to the door on 2 and 3 storeys, both facings, every gate side, mirrored or not), the car gate shut and solid, the house number on the pier, a bench and bougainvillea by the entry on the villas.

**Life (round 3):** every villa has two people (a guard or a gardener at the entry or the car gate, someone talking on a balcony), a car on the drive or in the carport (an SUV on the cantilevered and the tower villas) and two benches by the entry (2 or 4 seats).

## Hotels (fictional names on lit signs)
| | Design | Medium / low triangles |
|---|---|---|
| ![](almadies-district/hotel-boutique-street.png) | **hotel-boutique · Hôtel boutique, façade de balcons** (2 lots; HÔTEL LE FILAO): a balcony on every room, a lobby under a porte-cochère canopy, a café terrace beside the opening, a rooftop pool and lounge; **the rooftop restaurant « Terrasse de Ngor »** (the venue, `src/venues/rooftop.ts`): its stair door in the bay beside the lobby's portal (a small plaque: « TERRASSE · ACCÈS AU TOIT ↑ »), its name **on the roof**, a lit board 14 m long over the street (one face each way) and a blade across each end of the roof, so the sea road sees it from 130 m east to 50 m west, the avenue and the cross street at the hotel's sides, the beach. | 5 548 / 4 082 |
| ![](almadies-district/hotel-tower-street.png) | **hotel-tower · Hôtel tour sur son podium** (2 lots; HÔTEL OCÉANE, 8 storeys): shopfront bays with awnings and two shop doors at the podium, an open lobby, a restaurant floor, the tower and its crown. | 5 472 / 4 146 |
| ![](almadies-district/hotel-resort-street.png) | **hotel-resort · Resort autour de la cour de la piscine** (the whole block; HÔTEL BAOBAB AZUR, 5 storeys): a long sea-front block, a pool court, an 8 m drop-off through the railing, a café terrace, garden suites on the road sides. | 9 140 / 7 002 |

**Life (round 3):** a doorman and a bellhop either side of each lobby door (the bellhop with a luggage trolley), a valet at the drop-off lane, a waiter and three seated customers on the terrace, every terrace chair a registered seat at its bistro table (boutique 16 seats and 8 people, tower 12 and 9, resort 14 and 9), a car at the drop-off, scooters by the staff door; the boutique has a second doorman at the rooftop restaurant's stair door, the tower a shopkeeper at each shop door and a menu board at the café bay, the resort a guard at the service gate and a bench on each flank.

## Residences (apartment complexes)
| | Design | Medium / low triangles |
|---|---|---|
| ![](almadies-district/residence-ngor-street.png) | **residence-ngor · Résidence de Ngor** (1 lot, for sale in the game): the gate at the lot's centre, a 3.2 m opening to a glazed lobby under the terrace canopy with intercom and name board, a café with an awning, forecourt paving and topiary. The estate's door, entry and sale board on the pavement stay free. | 3 364 / 2 404 |
| ![](almadies-district/residence-stack-street.png) | **residence-stack · Balcons décalés sur pilotis** (2 lots; RÉSIDENCE LES ALIZÉS): staggered balconies on pilotis, a stone gateway over the lobby opening carrying the name sign, a café and a shop with awnings, the gated parking court. | 5 230 / 3 700 |
| ![](almadies-district/residence-screen-street.png) | **residence-screen · Brise-soleil sur loggias** (2 lots; KËR SALAM, LES CORMORANS mirrored): brise-soleil blades over loggias, a glass lobby that wraps its corner, a café, a shop and a boutique along the plinth. | 5 086 / 3 780 |
| ![](almadies-district/residence-courtyard-street.png) | **residence-courtyard · Cour-jardin à portail** (the whole block; RÉSIDENCE JARDINS DE NGOR): four wings round a courtyard and its pool, a 5.2 m porte-cochère you can walk through from the pavement, the car gate at the side, a café and a shop either side of the passage. | 8 226 / 6 028 |

**Life (round 3):** every café has two tables with two chairs each (registered seats; a customer already in the first and the last chair), a waiter at the door and a menu board; every shop its shopkeeper at the door with flower buckets, a fruit-crate stack and a newspaper rack at the window; every lobby a doorman; cars (the stack's three under the pilotis, Ngor's on the drive, the courtyard's in the side court), scooters, a bench with a resident, someone on a balcony or a terrace (Ngor 6 seats and 6 people, Les Alizés 6 and 7, Kër Salam and Les Cormorans 6 and 8, the courtyard 12 and 8).

## Between the buildings: the streetscape (round 3)
`src/world/almadies/streetscape.ts` plants and furnishes what the sites leave: the **port's plaza** (a paved approach to the pier with terracotta edging, a round plaza, palm avenues, two hedged lawns, beds, benches to the sea and to the pier, the market's three stalls with their sellers, a fish stall and a tea stall, crates, two fishermen), the **square's sand** (paths from the road to the centre's disc, four hedged lawns, beds, palms, an ice-cream cart and a corn grill with their sellers), the **gare's garden** (palms, beds, benches facing the station, a tea stall with stools), and **kerb palms** every 11 m on the three busy avenues and every 20 m on the cross streets. About 20 k triangles in the hub's own batches; every spot is checked against the colliders, the keep-clear ground, the sites and their walk-in openings, the bus stops and the pavement's walking lanes; `STREETSCAPE.on = false` draws none of it. `tests/almadiesStreetscape.test.ts`.

## Night
Each design's `-night.png` (21 h) shows the lit panes (about three in four; the rest stay dark by the district's own rule), the uplights, pendant lamps and string lights of the terraces, the lantern piers and the lit sign. The panes' glow is the district's own shared material (`src/world/almadies/night.ts`, driven by the hub's night like the villa's facade).
