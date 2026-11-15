# Balance 1.0.1: « Coups de pouce », the one-time bonus ladder

Work package B2. All amounts are the game's own money. Rules: `src/economy/pouce.ts` (pure, `tests/pouce.test.ts`); in the game: `src/economy/pouceModule.ts`
(payment and notice), `src/social/beats.ts` `leads` (the goal line), `src/ui/phone/apps/work.ts` (« Travailler »). Browser check: `scripts/check-coups-de-pouce.mjs`.

## The ladder (from the code)

| # | Step | Met when (read from the save) | Pays | Total |
|---|---|---|---|---|
| 1 | Ta première livraison Tiak Tiak | `livraisons` ≥ 1 | 10 000 F | 10 000 F |
| 2 | Un premier meuble chez toi | a piece of furniture held | 15 000 F | 25 000 F |
| 3 | Un véhicule retrouvé avec « Mes véhicules » | a parked vehicle reached (or got on) while « Localiser » marks it (`vehicule:retrouve`) | 20 000 F | 45 000 F |
| 4 | Une livraison vers un autre quartier | a run handed over in another district (`livraisons:quartiers`) | 25 000 F | 70 000 F |
| 5 | Un repas ou une soirée dans un lieu vivant | a dish on a rooftop (Toit Baobab, Terrasse de Ngor, Sunset Lounge: `terrasse`) or an evening at a dance terrace (Le Patio: `club:<id>:soirees` / `:nuit`) | 30 000 F | 100 000 F |
| 6 | Un envoi ou un retrait Teranga Money | the server's yes to a send or a withdrawal (`teranga:envois` / `teranga:retraits`); offline: a first deposit at the Banque Teranga (money put in: opening the account, which is free, is not one) | 35 000 F | 135 000 F |
| 7 | Locataire au mois ou propriétaire | the F2's monthly lease, or a home bought (a lease by the day does not count) | 45 000 F | 180 000 F |
| 8 | Un match au terrain de la Corniche | a neighbourhood match played to the end (`ft_matches`), or a Grand Camp (`camp:matchs`, for the Grand Camp's screens to count) | 50 000 F | 230 000 F |
| 9 | Un premier loyer de locataire | the first rent a tenant actually pays (`loyers:percus`): an owned home let, at the next city hour's payout; the F2 sublet, at its settlement (a real week after the offer; a month with no tenant pays nothing and does not count). Putting a home on offer is not enough | 70 000 F | **300 000 F** |

Steps 1–3 take about a quarter of an hour of a new game (`scripts/check-coups-de-pouce.mjs` plays them); 4–6 come with the first trips across the city; 7–8 with
housing and the pitch; 9 with the first rent a tenant pays (for the F2, a real week after it is put on offer).

## Against work and the F2

- An hour of Tiak Tiak (docs/release/BALANCE-1.0.1-tiak.md, simulated ceilings): 47 000–55 000 F net on foot, 60 000–67 000 F on a clean run, about 117 000 F on the
  bike. The whole ladder is **5.5 to 6.4 hours of deliveries on foot, about 2.6 hours on the bike**, paid once; active play in general earns 195 000–343 000 F an hour.
- The F2: the ladder is **2 % of its price** (15 000 000 F), 83 % of its first month and furnishing pack (360 000 F), five months of its rent (60 000 F).
- Early on it is generous on purpose: the first three steps (45 000 F) are about three times what a new player earns in the same quarter of an hour.

## No loops

- Paid once per save by step id: `pouce:<id>` in `counters` (kept by every client) is written in the same synchronous step as the wallet line, and the game saves at once.
  A reload, a district change, a repeated event, a sale and a re-purchase find the mark and pay nothing; a reload before the save loses the payment and its mark together.
- No step is met by an action that pays more than it costs and can be undone: work, a meal, a match, finding a parked bike cost something or nothing and pay nothing back;
  furniture cannot be resold from the game; a home bought loses 10 % at once on resale (1 500 000 F for the F2); the F2's lease costs its first month, 60 000 F, more
  than step 7 pays (45 000 F). A lease by the day, handed back at once for almost nothing, does not count. Opening a savings account (free) does not meet step 6:
  money must be put in.
- One F2 lease can meet steps 7 and 9, but no longer at once (1.0.1 review: signing it and putting it on offer paid 45 000 F + 70 000 F = 115 000 F the same minute,
  for a 60 000 F lease). Step 7 is paid at the signature (net −15 000 F); step 9 only at the first settlement where a tenant paid, a real week later, nine months in
  ten. A player who signs, sublets from the first day and gives notice at once nets over that week −60 000 F + 45 000 F + the tenant's rent (60 000 F × the month's
  occupancy: 48 000 F on average, 52 200 F at 87 %) + 70 000 F: about **+103 000 F** (+107 200 F at 87 %), once per save, for a real tenant's month. That is the
  intended reward for the two housing steps; what the review flagged was that both came at the offer.
- An older save is credited once for the steps already done (the counters it already has), in one notice.

## Known limit: a fresh save, and how much it can move

The wallet is in the local save: a New Game, an import of an older copy or a rollback can collect the ladder again. What a fresh save keeps is 300 000 F less what its
steps cost (at least the F2's first month 60 000 F, the cheapest piece of furniture and a rooftop coffee, about 62 000 F): **about 238 000 F**, plus what its deliveries
paid and its tenant's rent: steps 1–8 (230 000 F) in an hour or two of play, step 9 (70 000 F) a real week later at the earliest (the F2 sublet's first settlement;
the cheapest home to buy and let instead is the F2 itself, 15 000 000 F). To reach another player it must go through Teranga Money, whose server caps what an account brings in from the wallet at
**500 000 F per server day** (`fundDayMax`), 250 000 F per operation, sends at 500 000 F a day and what one account receives at 1 000 000 F a day. So one fresh save's
ladder fits inside one day's cap: it can move it all in a day; an account can bring in at most two such ladders a day, and a recipient take at most four.
