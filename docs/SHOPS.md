# Shops: inventory and the shop interior kit

Owner's order #4 (10 Oct 2026): no shop may read as an empty box, and shops are stocked by one reusable kit rather than
modelled one by one. Brands are fictional; words on goods are generic (riz, lait, téléphonie…).

## The kit — `src/world/shopKit.ts`

`buildShopInterior(type, { w, d }, seed, { detail, shell, at, reserve, variant })` →
`{ group, colliders, seats, anchors, bounds, budget }`.

- **Types**: `grocery`, `phone`, `clothing`, `furniture`, `pharmacy`, `cafe`, `bank`, `hardware`, `craft` (variants:
  baskets, leather and wood, painted pirogues and carved wood), `beauty`.
- **One plan for every size**: the counter (left, centred or a desk), the keeper's corridor behind it, the aisle, the
  customers' lane in front and the doorway are kept clear; shelf runs line the walls; the type then lays its floor
  displays (fridges, gondola, racks and mannequins, TV wall, glass cube of phones, sofa set from the furniture kit,
  guichets behind glass with a queue between posts, a juice bar with stools and tables…). `reserve` leaves areas to
  another module (Salon Awa's chairs).
- **Anchors** (world): `counter` (where a customer buys, the place's sheet goes there), `till`, `keeper`, `staff`,
  `queue`, `browse`, `door`. **Seats** go to the shared registry (bank chairs, café stools and chairs, showroom sofa).
- **Budget**: one merged mesh on a shared atlas material (`src/world/shopAtlas.ts`), plus glass when the shop has some,
  plus the showroom's furniture: **1–3 draw calls a shop**. Low paints whole shelf rows on single quads; Medium models
  the middle shelves; High all of them, within a triangle budget (13k for goods).
- **Shell mode** (`shell: true`) builds the room too (tiled floor, walls with a doorway at +z, ceiling) for walk-in
  interiors placed off the map.

Tests: `tests/shopFlow.test.ts` (paths inside every type, the shop spots of the city), `tests/shopKit.test.ts` (every type × footprint × quality × open/walk-in: draw calls, triangles, anchors inside,
colliders inside, nothing standing on an anchor, the counter / keeper / displays reachable from the door, unique seats,
determinism, reserve respected, the shop owners' routes of `src/social/routines.ts` kept clear).
Browser: `scripts/check-shops.mjs` (walk in from the street, buy at the counter, customers who come in, queue and pay, a walk-in café, desktop and phone),
`scripts/shots-shops.mjs` (every stocked shop, front and inside, plus the kit showroom). Captures in
`docs/screenshots/shops/`.

## Customers (spec 10 Oct, §31: enter → browse → buy → leave, without the player)

The customers are the city's own ambient people (`src/social/ambientLife.ts`, NPC lane), not a second crowd: every
stocked shop is one of their spots (`src/social/ambientSpots.ts`, `AmbientSpot.shop`) with the kit's door, displays
(`browse` → stands), checkout line (`queue`, the counter first) and the seats inside. People walk from the sidewalk to
the door and around the furniture (`src/world/shopFlow.ts`, grid paths over the shop's colliders) to a display or a
chair, stay their activity's time (« Faire des courses », « Attendre à la banque », « Commander au comptoir »…), then
join the line, move up as it frees, pay at the counter (Talk) and walk out. They never take the player's place in the
line, share the one humanoid budget (crowd LOD) and are greetable like anyone in the street. `ambientShops()` (debug)
tallies how many entered, queued and paid per shop; `ambientRun(s)` fast-forwards them for the checks.

## Inventory (four hubs)

| Place | Hub | Before | Now | What it sells / offers |
| --- | --- | --- | --- | --- |
| Boutique Diallo | Pikine (shops block) | open-front shell, two planks, 8 boxes | kit `grocery` 17 × 8 — wall shelves of goods, gondola, two fridges, rice sacks, sweets jars, bread basket, scale; Mamadou's aisle and stool kept | Pain et lait 400 F (order with the price asked in Wolof), stock job, chat with Mamadou |
| Atelier Ndeye · couture | Plateau (shops block) | shell, 8 cloth rolls | kit `clothing` 17 × 8 — cubbies of folded wax, racks, mannequins, mirror, the tailor at her machine | **Pagne wax 3 000 F** (new), wrestling outfits preview, sorting job |
| Salon Awa | Pikine (shops block) | shell, 8 pots; chairs by the venues lane | kit `beauty` on the left and back (products, wig heads, towels, reception desk); the right half reserved for the venue's chairs, mirrors and dryer | salon services (venue) |
| Dakar Réparation | Plateau (shops block) | shell, 8 screens | kit `phone` 17 × 8 — accessories pegboard, vitrine counter, repair bench, TV wall, glass cube, waiting chair | **Crédit 500 F** (new), helping job, chat with the repairer |
| Ndar Tech | Almadies (mall) | shell, screens | kit `phone` 12 × 8 | same as above |
| Style Rek | Almadies (mall) | shell, cloth rolls | kit `clothing` 12 × 8 | pagne wax, outfits, sorting job |
| Maison Dakar | Almadies (mall) | shell, pots | kit `furniture` 12 × 8 — homeware shelves, sofa set on a rug (sit on it), armchair, lamp, wardrobe, TV, dining set, fan | **Furniture catalogue** (new: the economy's « Voir les meubles », delivered to the room), unpacking job, ideas |
| Jus & Go | Almadies (mall courtyard) | shade + table | kit `cafe` under the shade — juice counter with bottles and juicer, fruit crates, fridge, lit menu, stools, two tables | Bouye 500 F, bissap + sandwich 1 000 F |
| Banque Teranga · Pikine / · Plateau | Pikine, Plateau | open hall, one table, two benches | kit `bank` 31.6 × 21.6 — five guichets behind glass, tellers, back office (desks, files, vault door), queue lane between posts, ticket machine, rows of waiting chairs, plants, posters | courier job, adviser (no account yet: the ATM outside is scenery) |
| Ateliers de Soumbédioune (Vannerie, Cuir & bois, Pirogues peintes) | Corniche | three shells, 3 items each | kit `craft` variants 0/1/2 — baskets and mats; bags, sandals, bowls, drums; model pirogues on stands, a big one on trestles; the artisan's bench | **Petit panier 1 500 F** (new), order job, discovering the crafts |
| Café Touba · Sandaga / Fann / Ngor / Parcelles | one per hub (kiosk) | **facade only** | **walk-in café** (`src/game/shops.ts`): « Entrer », a room stocked by kit `cafe` in shell mode, the menu at the counter inside, barista, a regular on a stool | Café Touba 100 F, stay and chat |
| Gargotes, Maïgas, the starter room | all | walk-in interiors (`src/world/interiors.ts`) | unchanged | meals, rest |
| Dibiteries, Grande Mosquée, Soumbédioune beach | — | venues lane (`src/venues`) | unchanged | — |
| Restaurant Le Pointe (Almadies), Garage Modou (Pikine) | kiosks | facade only | **still facade only** (next batch: kit `cafe` / a garage type) | fish, bissap; garage jobs |
| Quincaillerie · meubles (by the Maïga du marché, Pikine) | economy lane | hand-built stall | unchanged (candidate for kit `hardware`) | furniture catalogue |

Every stocked shop's sheet now stands at its counter (`anchors.counter`), so buying happens there through the same
activity system as before; the keeper stands on `anchors.keeper` at every quality (Low thins out the customers only),
greetable like anyone in the street. Salon Awa's sheet stays where the venue expects it.
