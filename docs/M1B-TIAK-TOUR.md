# M1-B — Tiak Tiak tour (pilot)

Branch `feature/m1b-tiak-tour-20261018`, based on the M1-A head `2c82709` (PR #43). One tour, in Pikine, optional. No new engine, vehicle, district or asset. Save schema stays v5.

## What it is

One pick-up (Café Touba · Parcelles), two clients (L'accueil de l'agence Teranga at the Banque; Les joueurs de dames at the Grand-place), both parcels in the courier box. **The player chooses who is served first.** Each client has a time limit counted from departure (the clock starts when the courier is 8 m from the pick-up, so getting on the bike costs nothing). The second client served is reached after the first *and* the leg between them, so the order decides who waits.

| | Agence (🏦) | Dames (♟️) |
|---|---|---|
| Pay | 1 300 F | 2 000 F |
| Limit at trust 0 | 12 s | 17 s |
| Reached first (measured) | 4.9 s | 10.4 s |
| Reached second (measured) | 4.9 + 15.4 = 20.3 s | 10.4 + 14.8 = 25.2 s |

At trust 0 each order delivers one client on time and the other late (late = the usual 60 % of that stop, −1 trust): **Agence first = 3 700 F, Dames first = 3 980 F**. A full tour pays a 1 200 F bonus (both stops delivered). Base total 4 500 F, scaled by the variety bonus like any active pay.

## Measured travel (not simulated)

`scripts/m1b-tour/`: the real Pikine hub (colliders as the running game has them, `dump-colliders.mjs`), the real drive model and bike spec, the free path on a 0.5 m grid (`legs.ts`, `paths.ts`), then ridden **in the browser** with the game paused and stepped at 30 frames/s, the rider pressing the game's own keys (W+A/D normalise to 0.707 each) or the touch pad (`rider.mjs`, `measure-rides.mjs`). Game seconds, from rest:

| Leg | Keyboard | Touch | Headless |
|---|---|---|---|
| pick-up → Banque | 6.6 | 6.6 | 6.6 |
| pick-up → Grand-place | 13.2 | 12.8 | 13.2 / 14.0 |
| Banque → Grand-place | 16.4 | 15.4 | 16.3 / 15.5 |
| Grand-place → Banque | 15.5 | 15.2 | 15.3 |
| same two legs, leaving the first stop at 5 m/s | 15.4 / 14.2 | 14.5 / 13.9 | |

In the real tour the first stop is reached at tour clock **4.9 s (Banque) / 10.4–10.6 s (Grand-place)** (the first 8 m are before the clock) and the second at **20.0–20.8 s / 24.6–25.2 s**, within a second of what the order menu predicts. A first attempt from Chez Pathé was dropped: street dress around the kiosk leaves the bike no way east (the planner found 17 m, then stuck), and `buildHub` alone misses those boxes — hence the run-time collider dump.

## Client memory

Per client, whole number −3…+5 in the open `counters` map (`tiak_trust_<stop>`, `tiak_ok_…`, `tiak_late_…`, `tiak_drop_…`; no schema change, old saves start at 0): +1 for a stop on time, −1 for a late one or one abandoned. It adds to that client's **pay** (+4 % per level above 0, up to +20 %) and moves their **patience** (the limit −18 % … +30 %). Limits and pay are fixed when the tour is accepted, so what was shown is what is paid, across reloads. The client served first can always be reached with ≥ 20 % to spare even at −3. At trust 5 with the Grand-place client the Agence-first order is on time twice: serving the Dames first a few times (they gain trust, the Agence loses some, harmlessly) opens the perfect order. Nothing is ever refused; three on-time stops bring a client from −3 back to 0.

## Abandoning

Before leaving the pick-up: free. After: the stops already delivered stay paid, no bonus, −1 trust with each client not delivered. Said in one line on the confirmation, and one tap away (« ℹ️ Si j'abandonne ? ») in the order picker. Each stop pays once (run id, leg index, saved after each hand-over); a reload in the middle restores the run exactly; an ordinary delivery cannot pay or cancel a tour. Quitting after every first stop earns less per run than a tour and sinks the abandoned client to the floor (`tests/tour.test.ts`).

## Interface (UX correction)

Cards of icons, short French words, one big reward and one yellow button — no paragraphs, no variety/business/technical text in the panel. A route card: pick-up ring, numbered stops on a dotted line, « Gain estimé » on the right, chips (📍 2 arrêts, 🎁 Bonus), a big « Choisir › » / « Livrer › ». The order picker: two cards, each client with 🔥 urgency, ⏱ limit (red when late), a ✓ / ! verdict beside the price, « Partir › »; trust shows as ★ or 😒 when not neutral. Ride HUD: the next place and distance, ●○ progress, the countdown. Ordinary deliveries are the same cards (« Pour débuter » badge on the first). The first-time hint is one line under the title. Names on cards are short (« Chez Mame », « Banque », « Grand-place »). Screenshots: `docs/screenshots/tiak-tour/` (desktop and phone). `src/economy/deliveryCards.ts`, `economy.css`; the logic files are unchanged by this correction.

## Tests

`tests/tour.test.ts` (27): data, the dilemma at trust 0, achievable first stop at the lowest trust, the perfect order at top trust, acceptance gating, both orders' pay and trust, variety bonus, paid-once and stale copies, reload mid-tour, abandon before/after, abandon farming, classic cannot touch a tour, trust clamps and recovery, memory in a later offer, old saves, save round trips and rejected tours. `scripts/check-tiak-tour.mjs` (58, desktop + phone/touch): offered at the pick-up with no delivery done, the cards' content and size, the order picker, both orders ridden for real (stops handed over at the tour clock, ledger, counters), different pay and trust, the later offer remembering, reload mid-run, abandon flows, the HUD (before leaving: « Va ! »; riding: next place, ●○, countdown), word counts of each panel, no page errors.

Not rerun after the card redesign (held at the owner's request): `check-economy`, `check-tiak-moto`, `check-business` (their text expectations for the delivery panel were updated in `check-economy.mjs`); they passed before the redesign.

## Not done

Other tours, Plateau, cross-hub runs, a bump/damage rule, road-event avoidance. The first-use player is on foot or on the lent bike at their choice; on foot the Agence-first order is late for the Dames, as in the table.
