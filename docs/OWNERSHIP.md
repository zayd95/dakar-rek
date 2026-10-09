# Ownership — homes, furniture, land, billboards (Wave 1, 9 Oct 2026)

One property model for every property (docs/LIVING_DAKAR.md). The game's own rules: buying or renting is one tap after a
confirmation that shows what it costs and brings — no approval, no paperwork, no waiting. The economy is virtual and
uncapped (Habib, 9 Oct): the ladders climb to hundreds of millions and billions.

## What a player can do

- **Earn → buy → furnish.** Keur Meubles, a walk-in showroom in the Cité Jàmm (Pikine, across the street from the starter
  room), sells furniture in three grades — Simple, Confort, Prestige — by room: salon, chambre, cuisine, bureau, télé et
  musique, déco (from 1 800 F to 1 500 000 F). Pieces on display can be tried (sofas, armchair, bed). Every purchase is
  delivered to the home the player lives in and set up where it fits; the six starter pieces are still sold at the
  quincaillerie stall too. The first piece is affordable from the starting wallet.
- **Use it.** Beds sleep (more energy with a better bed and comfort upgrades), sofas rest, chairs seat, the TV and the
  radio lift the mood, the kitchen cooks a meal cheaper than a gargote, the desk pays a little work once per in-game
  hour, the shower washes. Every seat of every piece is a seat of the shared sit system.
- **Arrange it.** « Aménager » (the action button when nothing else is at hand at home, or the phone's Maison app): the
  camera looks down on the room; pick a piece, move it on a 25 cm grid (arrows, keys, or a tap on the floor), turn it,
  « Poser » where the footprint is green, or « Ranger » it. Saved at once.
- **Move up.** Homes ladder: room (lent by the family) → apartment (Résidence Jàmm, rent 6 000 F a day or buy
  15 M F) → house (Cité Jàmm, 90 M F) → villa (Almadies, 400 M F) → luxury residence (Ngor, 2,5 Md F). Visit before
  renting; « Emménager » moves in and the furniture follows (set up again where it fits, stored otherwise — never lost).
  An owned home the player does not live in can be let.
- **Invest.** Two plots (150 and 300 m²) let to a market gardener; a 4 × 3 billboard let to advertisers, or showing the
  player's own ad (+10 % on the ventures), or ad space rented for a day. Upgrades (wall, night lighting, comfort), wear and
  repair, resale at 90 % of the value at once. Ventures (« Affaires », bana-bana table → big company) are assets too.
- **See it.** Phone « Biens »: net worth, value of the assets, income and charges per hour, everything held, listings
  (vehicles and the jet are in the model, marked as coming later). Wallet: cash, assets, total wealth, income, charges.

Income and charges count per in-game hour **of play** (1 city hour = 1 real minute), nothing offline, at most a city day at
once, settled in one ledger line each way. Unpaid rent piles up; after three in-game days of it the landlord takes the keys
back (the debt is dropped, the furniture comes home). Religious practice brings no reward and never counts for
polyvalence.

## Code

| Piece | File |
| --- | --- |
| Catalogue (data, prices) | `src/economy/catalog.ts` · rules in `src/economy/config.ts` (`property`) |
| Asset logic (buy, rent, let, upgrade, sell, income, charges, net worth) | `src/economy/assets.ts` (pure, unit-tested) |
| Ventures on the model | `src/economy/business.ts` |
| Furniture purchases, starter pieces | `src/economy/furniture.ts` |
| Placement rules (walls, built-ins, passages, auto-placement) | `src/economy/placement.ts` (pure) |
| Placement mode | `src/economy/homeEditor.ts` |
| Furniture models by id (kit seam: `setFurnitureKit`) | `src/economy/furnitureModels.ts` |
| Home interiors (apartment and up) | `src/economy/homeInterior.ts` · starter room: `src/world/interiors.ts` |
| Cité Jàmm block | `src/economy/citeJamm.ts` (Pikine block 1,0 is reserved as a `plaza` in `src/world/builder.ts`) |
| The module (homes, places, sheets, phone apps, debug) | `src/economy/estate.ts`, registered in `src/game/modules.ts` |

Places use the shared recipes: `shop` (Keur Meubles: browse → catalogue, talk to the seller) and `ownable` (plots,
billboard, homes: look / manage / enter). Furniture activities are a `home:<id>` place per home; « Aménager » is a
`self` target. Save schema **v5**: `assets` (migrated from v3 `furniture` and v4 `business`) and `inventory` (from the
`inv:*` counters). GameCtx gained `setCamera` and `walkTo`; `addInterior` replaces the interior behind a door.

**3D kit integration:** `setFurnitureKit((id, type, grade) => model | null)` swaps any piece's model; the contract is in
`furnitureModels.ts` (centred, base at y = 0, facing +z, inside the catalogue footprint).

## Checks

`npx vitest run` (tests/assets.test.ts, business, economy) and `node scripts/check-ownership.mjs` (desktop 1280×800 and
phone 390×844: earn → buy a chair at Keur Meubles → it is at home → move it → sit on it; plot and billboard bought and let,
hourly income; apartment rented, moved in, cook and shower; phone Biens and wallet; reload mid-flow and at the end; a v4
save migrating). Screenshots in `docs/screenshots/ownership/`.

## Known gaps

Building on a plot, buying vehicles (drive mode) and the jet come later; NPC visits and other players' homes are not
shown; the lying pose (sleeping sits on the bed for now) and the final furniture models come from the asset lane.
