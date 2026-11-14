# Balance 1.0.1: Tiak Tiak everywhere

What a courier earns on the rolling board of 1.0.1 (`src/economy/tiakOffers.ts`), in each of the five districts, and how many deliveries the first goals of 1.0.1 cost. All money is the game's own.

**What is measured and what is not.** Three kinds of numbers are below and each table says which it is:

- **From the code**: the pay bands, the fixed routes' table, prices, the needs. Exact.
- **Played by a script**: `scripts/check-tiak-everywhere.mjs`, a headless phone driven with real touch, walked seven deliveries; their times are the game's own clock (played seconds). A headless renderer says nothing about a phone's frame rate, and a script's thumb is not a player's.
- **Simulated**: `scripts/tiak-balance.ts` (`npx vite-node scripts/tiak-balance.ts`) draws the real boards hour after hour and has a courier take the best run each time. The boards, lengths and pay are the game's; the speeds and handling times are assumptions written in that file. Nobody played an hour.

No delivery was played by a person for this report.

## 1. Pay (from the code)

`ECONOMY.tiak.band` in `src/economy/config.ts`. The pay is fixed when the run is accepted; the variety bonus (up to +15 %) is applied at hand-over as before; a late delivery pays 60 % as before.

| Run | Pay | Examples |
|---|---|---|
| Inside a district | 700 F + 3.2 F per metre of street, rounded to 50 F, between 1 000 F and 2 000 F | 60 m: 1 000 F · 144 m (Maïga → Chez Pathé): 1 150 F · 210 m (Chez Mame → Boutique): 1 350 F · 400 m: 2 000 F |
| To another district | 1 500 F + 2.2 F per metre of road (and of street at both ends) + 400 F per district crossed beyond the first, rounded to 100 F, between 2 500 F and 10 000 F | Corniche → Almadies (0.4 km, the border street): 2 500 F · Pikine → Plateau (≈ 1.6 km): ≈ 5 000 F · Mermoz → Corniche (≈ 1.8 km): ≈ 5 200 F · Plateau → Mermoz (≈ 3.8 km, two roads): 10 000 F |
| Express (one of the five runs, on about six boards in ten) | × 1.25, with 70 % of the usual time | 12 500 F at most |
| The fixed routes of 1.0 | their table, unchanged | 1 000–1 400 F, recommended 2 200 / 2 400 F, between districts 5 000–6 500 F |

What the boards actually offered over 30 city days (simulated draw of the real generator, base pay):

| District | Inside the district: min – mean – max | To another district: min – mean – max | Express share |
|---|---|---|---|
| Plateau | 1 000 – 1 182 – 1 800 F | 4 800 – 7 202 – 12 500 F | 12 % |
| Corniche | 1 000 – 1 208 – 1 900 F | 2 500 – 5 708 – 8 400 F | 12 % |
| Almadies · Ngor | 1 000 – 1 203 – 2 050 F | 2 500 – 5 507 – 8 900 F | 11 % |
| Pikine | 1 000 – 1 275 – 2 050 F | 4 800 – 6 908 – 12 500 F | 12 % |
| Mermoz · Sacré-Cœur | 1 000 – 1 227 – 2 000 F | 5 200 – 7 268 – 12 500 F | 12 % |

(An express inside a district can reach 2 500 F: 2 000 F × 1.25.)

## 2. Deliveries played by the script (real touch, game clock)

One run of `scripts/check-tiak-everywhere.mjs` (SwiftShader, the joystick pushed to its edge, the way found round the buildings). « Walked » is the path really covered, pick-up leg included; a leg longer than about 170 m was cut to its last 80 m with a debug hook, so these are not full approach times.

| District | Run | Pay | Way counted for the pay | Walked | Pick-up leg | Delivery leg | Time allowed |
|---|---|---|---|---|---|---|---|
| Pikine | Maïga → Chez Pathé | 1 150 F | 144 m | 266 m | 41 s | 39 s | 104 s |
| Plateau | Dibiterie → Chez Fatou | 1 000 F | 26 m | 102 m | 23 s | 7 s | 60 s |
| Mermoz | Boulangerie → Arrêt du car | 1 000 F | 89 m | 142 m | 21 s | 18 s | 80 s |
| Corniche | Salle de sport → Café Touba | 1 000 F | 82 m | 190 m | 30 s | 13 s | 77 s |
| Almadies | Place → Café Touba | 1 000 F | 88 m | 234 m | 33 s | 28 s | 79 s |
| Corniche → Almadies (car rapide) | Marché au poisson → Le Pointe | 2 500 F stated, **1 500 F paid: late** | 417 m | 286 m | 39 s | 35 s + the car rapide | 226 s |
| Mermoz (with a reload) | Boulangerie → Café Touba | 1 000 F | 46 m | 113 m | 21 s | 10 s | 61 s |

Read from it: the script covered 3.3 to 4.4 m per played second on foot (3.7 on average), slower than the 5.6 m/s the time limits assume, and every delivery on foot inside a district was well inside its limit. **The short hop to the next district is late when the car rapide is taken**: the car rapide's journey counts on the run's clock (18 min of road × 0.15 = 162 s) and Corniche → Almadies allows 226 s. That is today's rule (the limit comes from the length of the way); a ride of 1.5 km or more allows 700 s and more and keeps room for it. See « For the owner » below.

## 3. Deliveries and income per real hour (simulated)

Assumptions (in `scripts/tiak-balance.ts`): the board opened and a run chosen in 6 s, 4 s to pick up, 4 s to hand over; on the bike 9 m/s in a district, 15 m/s on a road between districts, 12 s to get on and off at each end; the courier always takes the run that pays most per second, from where the last one ended; a Café Touba (100 F, +6 energy, 15 s) whenever too tired for the next run, the cheapest meal (500 F, +40, 30 s) when hungry. Mean of 20 city days per row, base pay without the variety bonus.

| How | Starting district | Deliveries per real hour | Income per real hour | Coffee and meals | Net per hour | Mean pay |
|---|---|---|---|---|---|---|
| On foot at 3.7 m/s (as the script walked), inside the district | Plateau | 48 | 56 500 F | 6 100 F | 50 500 F | 1 179 F |
| | Corniche | 47 | 56 300 F | 6 000 F | 50 300 F | 1 196 F |
| | Almadies · Ngor | 54 | 61 900 F | 6 800 F | 55 200 F | 1 155 F |
| | Pikine | 42 | 52 600 F | 5 200 F | 47 400 F | 1 268 F |
| | Mermoz · Sacré-Cœur | 49 | 59 600 F | 6 200 F | 53 400 F | 1 214 F |
| On foot at 5.6 m/s (a clean run), inside the district | Plateau | 61 | 72 200 F | 7 900 F | 64 400 F | 1 191 F |
| | Corniche | 58 | 70 800 F | 7 500 F | 63 300 F | 1 215 F |
| | Almadies · Ngor | 65 | 75 900 F | 8 300 F | 67 500 F | 1 163 F |
| | Pikine | 53 | 67 200 F | 6 600 F | 60 600 F | 1 272 F |
| | Mermoz · Sacré-Cœur | 62 | 75 200 F | 8 000 F | 67 200 F | 1 209 F |
| On the Tiak bike, any run (all of them rides to another district) | Plateau | 17 | 118 700 F | 2 000 F | 116 700 F | 6 983 F |
| | Corniche | 18 | 119 200 F | 2 100 F | 117 200 F | 6 795 F |
| | Almadies · Ngor | 17 | 120 100 F | 2 000 F | 118 100 F | 6 924 F |
| | Pikine | 16 | 119 300 F | 1 900 F | 117 400 F | 7 482 F |
| | Mermoz · Sacré-Cœur | 16 | 120 600 F | 1 900 F | 118 600 F | 7 328 F |

These are ceilings of a courier who never stops, never misses a turn and always finds the best run: a player will earn less. The five districts are within about a sixth of each other on foot (Pikine is the widest, so its runs are longer and better paid but fewer), and equal on the bike. The existing documents put 1.0's active play at 195 000–343 000 F an hour, so Tiak Tiak stays below the other ways of earning, as before.

## 4. What the goals cost in deliveries

Deliveries at the mean pay of that row; hours at the net income of that row (simulated, base pay).

| Goal | Price | On foot at 3.7 m/s | On foot at 5.6 m/s | On the bike (rides to other districts) |
|---|---|---|---|---|
| First monthly rent of the F2, 50 000 F + 10 000 F charges | 60 000 F | 48–52 deliveries (1.1–1.3 h) | 48–52 (0.9–1.0 h) | 9 (0.5 h) |
| A Jakarta | 150 000 F | 119–130 (2.7–3.2 h) | 118–129 (2.2–2.5 h) | 21–23 (1.3 h) |
| The F2's furnishing | 300 000 F | 237–260 (5.4–6.3 h) | 236–258 (4.4–5.0 h) | 41–45 (2.5–2.6 h) |

**Typical repairs** (from the code, `workCost` in `src/transport/condition.ts`: priced by the damage, times the vehicle's class (price ÷ 6 000 000)^0.3 kept between 0.3 and 2.2, rounded to 500 F; the figures below are that function's own output):

| Damage | A Jakarta (150 000 F) | A city car of the reference class (6 000 000 F) | Deliveries inside a district at ≈ 1 200 F (Jakarta / car) |
|---|---|---|---|
| Under 5 points | free | free | 0 / 0 |
| 15 points | 2 500 F | 8 000 F | 3 / 7 |
| 40 points | 11 000 F | 33 000 F | 10 / 28 |
| 100 points (a wreck) | 21 000 F | 63 000 F | 18 / 53 |

**Basic living costs per played hour** (from the code):

- Hunger falls 1.6 points a played minute (`src/core/state.ts`, one played minute is one real minute), 96 an hour; the cheapest meal is riz au poisson, 500 F for 40 points, a ceebu jën 1 000 F for 45: **1 200 to 2 100 F an hour**.
- Each delivery costs 6 energy, 3 hunger and 3 hygiene (`ECONOMY.tiak.fatigue`), and a courier under 8 energy cannot take one. Sleeping (+70 energy) and washing at home are free (`ACTIONS.home`); kept going with Café Touba (100 F, +6 energy) it is **about 100 F and 40 F of food per delivery**: 5 000 to 8 000 F an hour for a courier on foot who never rests (the « coffee and meals » column above), about 2 000 F on the bike.
- Company falls 0.8 a played minute, 48 an hour: the attaya on a square (100 F, +18) or at the gargote (200 F, +14), about three times an hour, **300 to 700 F**.
- Housing: the starter room is lent by the family, free. Today's per-day lease of the F2 is 6 000 F a city day, charged by the played hour: **15 000 F per real hour of play** (a city day is 24 real minutes). The 1.0.1 monthly rent (50 000 F + 10 000 F for seven real days) is another package's; at any pace above it is about one hour of deliveries on foot per month.

## For the owner

1. **The level of pay was kept, not changed.** A run inside a district pays what the fixed routes paid (1 000–1 400 F for the same hops, up to 2 000 F for the longest); a ride to another district pays by its length around the 5 000–6 500 F of 1.0. Two things are new and are yours to confirm: a ride across two roads reaches 10 000 F (12 500 F as an express), twice the dearest VTC ride (5 000 F), and the first month of the F2 costs about an hour of deliveries.
2. **The short hop Corniche ↔ Almadies (2 500 F) is late by car rapide** (section 2). Riding or walking the border street it is on time. If the car rapide should stay a fair way to deliver, the time limit of a ride to another district needs a floor (not changed here: the brief asked for the limit as today).
3. The variety bonus (+5 % per other activity practised, up to +15 %) is not in any number above.
