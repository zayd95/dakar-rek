# M4 · Almadies / Ngor — « One Evening Out »

**Status: Gate A (engineering) evidenced in [`M4-EVIDENCE.md`](M4-EVIDENCE.md); Gate B (the owner's iPhone) pending.** One evening in Almadies, made of things the game already had, joined up.

## The idea

One evening the player can repeat in different ways, not several venue menus:

1. park near the independent Terrasse de Ngor frontage on the Almadies restaurant strip and go up to the open-air roof terrace;
2. order, sit at a table, be served, eat;
3. talk with Awa Sy, the venue's host;
4. go down to La Vague and dance;
5. go home (the taxi at the rank, or the car still parked);
6. come back another evening: Awa remembers.

Nothing is compulsory: no drinking, no spending, no nightlife. Every step is an existing activity the player can skip.

## What already existed (and is reused, not replaced)

- **Terrasse de Ngor** (`src/venues/rooftop.ts`): a dedicated commercial plot with its own street-facing entrance, forecourt and outdoor seating, leading to an open-air roof terrace and a bar with « Commander ». The neighbouring blocks form a visible restaurant-and-lounge strip.
- **The activity runner** (`src/activity/`): the `order` primitive (pay, prepare, sit, eat), seats with tables, the plate of `src/game/meals.ts`.
- **La Vague** (`src/venues/club.ts`): entry fee, the dance floor and its beat game, the music, the crowd, its own counters.
- **The shared NPC memory** (`src/social/memory.ts`, `relations.ts`), the owned vehicle's parking, the taxi rank.

## What M4 adds

### 1. A real meal at the rooftop (`rooftop.ts`)
Before, « Commander » charged, fed and toasted at once. Now it starts the ordinary `order` activity:
- the price is charged **once, at the start**, by the activity runner (one ledger line);
- the dish is prepared, the guest **walks to a table and sits** (a seat with a table first, the stools last), the **plate is set on the table** and eaten;
- the needs rise **at the last bite**; the meal is counted once (`terrasse`);
- « Se lever » to finish. This holds on the three rooftops (Plateau, Corniche, Ngor); the shared check follows it.
- The east side of the terrace is now kept clear from the stairs to the bar: the tables stood across the way in, and walking in by the stick worked only by luck. Six tables instead of seven.

### 2. Awa Sy (`src/districts/almadies.ts`, rules in `almadiesRules.ts`)
- She hosts the venue, at the west end of the bar. Her body is a `Humanoid` in the terrace's own group, so it exists only while the terrace is on screen.
- **First word:** she introduces herself and asks what brings the guest: nothing special, a good job, a new life in Dakar. Her answer follows the choice and sends them to La Vague (the walking marker is set to its entry; at 21 h it opens, before that she says so). A real word gives `social +8, moral +3`, **once an evening**.
- **A later evening:** on returning to the terrace she remembers what the guest said and what they did; her words are not the first evening's, and the venue offers **one coffee, free, once an evening** (the same `order` activity at price 0).
- **Not farmable:** asking again the same evening gives no word, no coffee, no visit; a visit counts at most once per city hour (`recordVisit`).

### 3. The evening and its card
An **evening** is the club's night (`clubNight`: the hours before noon belong to the night before). Its stages are *dinner*, *talk*, *dance*. A stage counts only when **the activity's own counter moves** (`terrasse`, `club:almadies:venue:club:danses`), never from a tap, and a loaded save invents none.
When the player leaves La Vague after dancing, or leaves Almadies (taxi, drive), one card shows what was done (« Ta première soirée à Almadies »). It comes once per evening, only if something was done, and counts the evenings.

## What it does not do (on purpose)
- No new money path, wallet, menu system, nightclub framework or relationship engine (CONTRACT row 14).
- No waiter walks the food to the table at the rooftop: the guest sits and the plate appears (La Vague's table service is unchanged).
- No valet: the car stays where it was left (it is a solid, saved parking record, as everywhere).
- No new hub or road. Two generic villa blocks are replaced by six visible hospitality frontages on the existing street grid. Terrasse de Ngor has its own commercial plot and is no longer attached to a randomly selected residential facade.

## Save (CONTRACT row 14)
Numbers in `counters` with the prefix `al_`, from a small fixed set (`AL` in `almadiesRules.ts`): `al_awa_met`, `al_awa_met_night`, `al_awa_seen_night`, `al_toast`, `al_dine_night`, `al_talk_night`, `al_dance_night`, `al_terrasse_seen`, `al_danses_seen`, `al_end_night`, `al_evenings`, `al_last_mask`, `al_gift_night`. No flag, no schema change, no migration. Beside them, the shared memory's `visit_terrasse_awa`, `served_terrasse_awa`, `freesvc_terrasse_awa` and the relation `terrasse_awa`.

## Files
- `src/districts/almadiesRules.ts` (pure rules, tests in `tests/almadies.test.ts`), `src/districts/almadies.ts` (the module), registered in `src/game/modules.ts`.
- `src/venues/rooftop.ts` (the order, the aisle), `scripts/check-rooftop.mjs` (follows the new flow), `scripts/check-almadies-journey.mjs` (the golden path, real touch).
