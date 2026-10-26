# M2 · Plateau / Médina — « Ma première affaire » (My First Trade)

**Status: in progress.** The world is built. The trade itself waits for Living Dakar 2.0's answer to the commerce contract (`CONTRACT.md`, rows 9–12).

## The idea

The player trades with their own money. They buy a lot of goods from a Médina wholesaler, move it across town, and sell it to a Plateau trading house. Then they see what the trip was worth, and whether it was worth doing again.

It is not a delivery job:
- **The player chooses** what to buy, how much, and how to move it.
- **The result depends on those choices:**
  - margin;
  - capital tied up;
  - perishability;
  - what the transport costs.

## Places (`src/districts/tradePlaces.ts`, built by `src/world/builder.ts`)

### Diallo & Frères · grossiste (Médina)
- **Where:** the Plateau hub's south-west, block (0, 2), on the corner of the street at x = −60 and the main street at z = 0.
- **The building:** an old two-storey depot with its mouth open under a striped awning.
- **The forecourt:** stacked with rice sacks, cartons of tea and crates of mangoes. The trader stands at his table; there are porters and their pousse-pousse.
- **The loading bay:** yellow, hatched, at the kerb in front.

### Comptoir Sall · gros et demi-gros (Plateau)
- **Where:** the Plateau hub's north-east, block (3, 0), on the corner of the streets at x = 60 and z = −60, near Banque Teranga.
- **The building:** a four-storey trading house behind an arcade. The arcade stays a walkway.
- **The loading bay:** at the kerb.

### Between them
- About 200 m by road, with two turns.
- Both bays are kept clear of parked cars and street dressing (`keepClear`).

## The goods (first catalogue: three, no market)

| Good | Buys at | Sells at | Margin | Carried by hand | Perishes |
|---|---|---|---|---|---|
| Thé vert, carton de 20 paquets | 3 000 F | 3 700 F | +700 F (23 %) | yes, up to 3 | no |
| Riz brisé, sac de 25 kg | 9 000 F | 10 200 F | +1 200 F (13 %) | no: a vehicle or the pousse-pousse | no |
| Mangues, cagette | 2 500 F | 3 400 F | +900 F (36 %) | 1 | after 2 in-game days, the Comptoir pays 30 % |

### The decisions
- **Tea** is light and safe, and can be done on foot with little capital.
- **Rice** ties up the most capital at a thin margin, and needs transport.
- **Mangoes** pay best but can spoil.

### Transport
- **By hand:** free; tea up to 3 cartons, or 1 crate.
- **The player's own vehicle**, loaded at the bay: a car takes 4 units, a pickup 10.
- **The porters' pousse-pousse:** 1 500 F, up to 6 units of anything. The porter takes the goods to the Comptoir's arcade at walking pace.

## The golden path

1. The player discovers the wholesaler.
2. They talk to the trader.
3. They choose goods and a quantity, seeing the price and their cash.
4. They buy with their own money.
5. They load the goods.
6. They move them to the Comptoir.
7. They sell the lot.
8. They are paid.
9. A card shows the real result: revenue − purchase − transport = profit.
10. They save, reinvest or spend; the city does not decide.
11. On a later visit, the wholesaler recognises them. After 3 trades he gives better terms: −5 % on rice.

## Rules (anti-exploit)

- **A lot in hand:** one at a time, numbered (`pl_lot_seq`). Its number is in every ledger line.
- **Paying:** all money goes through the existing `GameState.addMoney` (one ledger line each). There is no other wallet and no other stock: the goods are counted in the existing player `inventory` (`pl_the`, `pl_riz`, `pl_mangue`).
- **Selling:** only while the lot is loaded or delivered. The stage becomes `sold` in the same step as the credit, then the save is written. A retry, a double tap or a reload never pays twice.
- **Cancelling:**
  - Before the lot leaves the forecourt, « Annuler » refunds it fully.
  - After that, the wholesaler buys it back at 70 %, or it is sold at the Comptoir.
- **The Comptoir's demand per in-game day:** tea 10, rice 8, mangoes 8. Moving between hubs creates no stock and no money.
- **Reload:** a bought lot survives a reload at its stage.

## Save (pending the contract)

- **Proposed:** the lot's facts in the existing `counters` with the `pl_` prefix:
  - `pl_lot_seq`, `pl_lot_good`, `pl_lot_qty`, `pl_lot_cost`, `pl_lot_fee`, `pl_lot_stage`, `pl_lot_day`;
  - the totals `pl_trades`, `pl_rev_total`, `pl_profit_total`;
  - the Comptoir's daily demand `pl_sold_<good>_day`.
- **The goods themselves:** in `inventory`.
- **No schema change.**
