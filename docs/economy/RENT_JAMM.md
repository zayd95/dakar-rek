# The rent of the Cité Jàmm house

**The owner's decision (28 Oct 2026):** evaluate **500 000 F per in-game month** for the Maison familiale · Cité Jàmm (now priced 150 000 000 F), against the existing economy and what a player earns; adjust if needed; do not copy a real-world rental ratio; **keep every existing lease and save as it is.**

## The units

- A city day lasts **24 minutes of play** (`CITY_DAY_MS`, `src/core/clock.ts`). The game has no calendar month; this page takes **one in-game month = 30 city days = 12 hours of play**.
- A rent is stored **per in-game day** and charged by the hour (rent ÷ 24) while the player plays (`chargeOf`, `src/economy/assets.ts`).
- What a player earns by active play (`docs/M1A-ECONOMY.md` F1, the economy simulation): **195 k / 271 k / 343 k F per played hour** for sloppy, competent and perfect play. Passive income from ventures comes on top and is far larger later in the game, so the active rate is the harsh measure.

## The evaluation (`npx vite-node scripts/economy/rent-ladder.ts`)

| Home | m² | Price | Rent / day | Rent / month | F per m² per month | Rent ÷ price per month | Share of a month's active pay (sloppy / competent / perfect) |
|---|---|---|---|---|---|---|---|
| Appartement F2 · Résidence Jàmm | 63 | 15 000 000 | 6 000 | 180 000 | 2 857 | 1.20 % | 7.7 / 5.5 / 4.4 % |
| **Maison familiale · Cité Jàmm, before** | 216 | 150 000 000 | 30 000 | 900 000 | 4 167 | 0.60 % | 38 / 28 / 22 % |
| **Maison familiale · Cité Jàmm, now** | 216 | 150 000 000 | **16 700** | **501 000** | 2 319 | 0.33 % | **21 / 15 / 12 %** |
| Villa avec piscine · Almadies | 288 | 400 000 000 | 120 000 | 3 600 000 | 12 500 | 0.90 % | 154 / 111 / 88 % |
| Résidence de luxe · Ngor | 330 | 2 500 000 000 | 600 000 | 18 000 000 | 54 545 | 0.72 % | 769 / 554 / 437 % |

## The verdict

**500 000 F a month holds; the house's rent is set at 16 700 F a day (501 000 F over 30 city days).** Nothing in the economy asks for a different number:

- **It sits on the ladder.** It is 2.8 × the apartment's rent for 3.4 × the floor, and a fraction of the villa's. A competent player pays a month of it with about 1 h 50 of work out of the 12 hours that month lasts (15 %); the apartment takes 5.5 %, the villa more than a month's active pay. The villa and the residence are meant to be paid from ventures, not from shifts, and the house is the first rung where that starts to matter, not yet a burden.
- **The old 30 000 F a day was the outlier.** It was set when the house cost far less; at 900 000 F a month it took 28 % of a competent player's pay for a 216 m² house, more than the apartment's share five times over.
- **Renting stays the cheap way in.** The price is 300 months of rent (3 600 hours of play), so buying is a choice of wealth, not a way to stop paying.
- **A day's rent in hand** is the only thing asked to start a lease (`cannotRent`): 16 700 F.

**One judgment call, for the owner.** Per square metre the house (2 319 F a month) is now **19 % below the apartment** (2 857). A house outside the Almadies renting cheaper per m² than a flat in a residence is true to Dakar, and the price ladder is unchanged. If the owner wants the per-m² rent to rise with the rung, the house must ask **at least 20 600 F a day (618 000 F a month)**; that is a one-number change (`rent` of `maison_cite` in `src/economy/catalog.ts`), and the pinning below makes it safe whenever it is made.

An owner who lets the house out earns `rent ÷ 24 × 0.85` an hour (`letIncome`): 591 F an hour now, 1 063 before. That is the `income` of the catalogue entry and follows the rent; it never covered the 100 F an hour of upkeep by much, and it is not a way to make money at a 150 M F price.

## Existing leases and saves are untouched

Before this change a lease stored nothing about its rent: the catalogue's rent was read **live** at every charge, so changing a catalogue number would have re-priced every tenant overnight. Now:

- **A lease keeps its rate.** `AssetState.rate` (`src/core/types.ts`) is the daily rent at the moment the lease began, set by `rentAsset`; `rentOf(asset)` (`src/economy/assets.ts`) is what is charged, what the eviction threshold counts (three days of *that* rent), and what the Biens screens show.
- **A lease made before this change has no `rate`.** It is charged the rent the catalogue asked then, `LEGACY_RENT` (`maison_cite: 30 000`), and nothing else: the save is not rewritten, there is no migration, no schema bump, and a reload does not change it. For every other home it falls back to the catalogue, which has not changed.
- **Ending a lease** (« Rendre les clés ») or **buying the home** (the lease becomes ownership) drops the rate; a new lease starts at the rent of the day.
- **The save sanitiser** (`assetsOf`, `src/core/save.ts`) keeps a positive numeric `rate` on a rented asset only, and ignores anything else.
- **What the listings show:** « Louer · 16 700 F / jour » for a new tenant; « Loué par toi · 30 000 F / jour » for an old lease, until it ends.
- **A rollback.** A client older than this change rebuilds each asset from the fields it knows and so drops `rate`. A lease made at 16 700 F and then rewritten by such a client would be charged 30 000 F by this one afterwards. That only happens on a rollback; it is the same hazard `docs/SAVES.md` describes for every field a lane adds.

Tests: `tests/assets.test.ts` (« the Jàmm house rent »): the price and its month, a new lease's rate, the rate after a later catalogue change, the old lease at 30 000 F, a reload, the sanitiser, the buy-out, and the eviction on either rate.

Not tested on a phone; not deployed.
