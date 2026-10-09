# Dakar Rek — a life inside Dakar (direction from 9 Oct 2026)

Habib's brief, condensed. **Not "more scenery": turn Dakar Rek from an explorable 3D city into a living open-world life
simulator.** Lagos Life showed the missing ingredient — *interaction density*: the player should rarely walk for long
without something to enter, use, buy, ride, talk to, earn from, customise or join. Learn from the principle; never copy its
art, code or UI.

## The loop

Explore → interact → work → earn → spend → own → upgrade → socialise → discover → progress.

Players start with little and can grow without a cap (the economy is fully virtual, decision of 9 Oct): a furnished home,
several properties, land, businesses, motorbikes, cars, luxury cars, commercial vehicles — and, much later, aspirational
assets such as a private jet. Progress must be *visible*: room → apartment → house → villa → luxury residence; basic →
better → premium furniture; walking / public transport → motorbike → car → luxury car; small hustle → business →
several businesses and investments.

Players are free: no scripted path, no artificial approvals or permission chains. Two players spending the same day
completely differently is the goal.

## Design rules

1. **The world is the interface.** Contextual interactions next to objects and people (sit on a chair, greet a person,
   enter a vehicle, order at a counter). Small bottom sheets and context/radial menus, diegetic prompts, a light HUD.
   No giant panels of buttons.
2. **Activity density rule.** Every important area must answer:
   *What can I do here? Who can I interact with here? What can I earn / spend / own here? Why would I return tomorrow?*
   An area that cannot answer all four is not finished. Progress is measured in meaningful player experiences, not in
   buildings.
3. **One system, many places.** One sit system for every chair; one shop framework for every shop; one property model
   for every property; one vehicle framework for every vehicle; one contextual interaction system for the whole world; one
   NPC activity system for the whole city. No pile of one-off scripts.
4. **Mobile-first performance.** Three.js + TypeScript, browser-first. Ambition never at the cost of cheap Android
   phones: instancing, LODs, texture budgets, draw-call budgets, lazy interiors, district streaming.
5. **Transport is an experience, not a loading screen.** Walk, ride as a passenger and watch Dakar pass, drive.
6. **Respect.** The mosque is a calm, distinct place. Religious text only from a verified source, verbatim, attributed —
   never written from memory. Language: French with Wolof (no Pulaar, Sérère or Diola for now).
7. **Social freedom with safety tools.** Greet, talk, befriend, exchange contacts, invite; real players talk freely in
   location-aware chats (the Dibi, the car rapide, the club, the neighbourhood). Personal tools stay: block, mute.

## Architecture (shared contracts)

| System | Module | Contract |
| --- | --- | --- |
| Contextual interaction | `src/interact/` | `Target` (something in the world: seat, person, vehicle, door, counter, shelf, plot, billboard, furniture) with `affordances()` (verb, label, icon, cost/gain, disabled reason, `run`). Modules register a `TargetSource`; the system focuses the best target in front of the player and shows its primary verb; other verbs in a small context sheet. Legacy `Interactable`/`Action` content is adapted automatically. |
| Seats | `src/interact/seats.ts` | `Seat` (position, facing, height, kind, space, occupant). Every bench, chair, stool, sofa, bed, prayer row and vehicle seat is a seat; players and NPCs occupy them. |
| Spaces | `presenceSpace()` | `street`, an interior/venue id, a vehicle id. Chat, NPC visibility and multiplayer presence are scoped by space. |
| Venues | `src/venues/` | A venue = interior + seats + roles (cook, imam, hairdresser…) + offers + schedule. Dibi, mosque, salon, shops, club, furniture store share it. |
| Ownership | `src/economy/assets*` | Generic `Asset` (home, land, vehicle, business, billboard, furniture, aircraft): price, location, size, owner, condition, income/expenses, upgrades. Catalogue data separate from save state. |
| Vehicles | `src/transport/` + `src/actors/vehicleKit*` | Vehicle spec (seats, doors, driver seat, camera anchors, model builder); passenger, chase and drive modes; routes on the hub road graph. |
| NPC activity | `src/social/` | People pick activities by place, time and day (eat, wait, board, work, pray, exercise, fish, sell, gather, go home), using seats and venues. |

## Universal activity framework (built 9 Oct)

Habib: « build a universal interaction/activity framework — enter, sit, talk, buy, sell, eat, use, work, own, ride,
invite… — then locations compose those primitives differently. »

| Layer | Module | What it does |
| --- | --- | --- |
| Primitives | `src/activity/primitives.ts` | Builders for every verb: `order` (pay → prepared → sit → eat/drink), `buy`, `sell`, `work`, `use`, `sleep`, `wash`, `pray`, `dance`, `fish`, `greet`, and hand-over verbs that start a dedicated system at once (`talk`, `invite`, `own`, `rent`, `ride`, `enter`, `browse`, `inspect`). |
| Activity | `src/activity/types.ts` | An `ActivitySpec` is data: a price paid at the start and `Step`s (label, seconds, clip, seat to take, prop, effects, follow-up). |
| Runner | `src/activity/runner.ts` | Plays any activity the same way: charges the price, takes a seat when a step asks for one, holds a clip, shows progress, applies each step's effects when it ends, can be stopped (« Arrêter »). |
| Effects | `src/activity/effects.ts` | One place applies money (with a wallet history label), needs, counters, items, relationships, flags and the activity category (polyvalence). |
| Places | `src/activity/places.ts` | A place = anchors (counter, grill, prayer row, mirror, plot sign…) + the activities offered at each + opening hours + location chat. Every Dibi, mosque, salon, shop, club, home, beach or plot is a `PlaceSpec`, served by the same registry. |
| Interaction | `src/interact/` | Targets in reach (places' anchors, seats, people, legacy content, vehicles…) are focused in front of the player; the primary verb is on the action button and in a prompt above the target; « ⋯ » lists the others. |
| Seats | `src/interact/seats.ts` | One sit system: benches, chairs, stools, sofas, beds, prayer rows, vehicle seats — players and NPCs occupy them. |
| People | `src/interact/people.ts` | Everyone in the street can be greeted and asked their name (greet / talk primitives). |
| Inventory | `src/activity/inventory.ts` | Items carried (fish to sell, goods…); stored in save counters until the save schema gets an inventory field. |

Composition examples:

- **Dibi** = counter: `order(dibi mouton)`, `order(bissap, drink)`; grill: `work(aider au grill)`; tables: seats; chat for
  players inside.
- **Mosque** = entrance: `enter` (shoes off); taps: `wash`; prayer hall: `pray` on prayer-row seats; imam: `talk`;
  reading: only from a verified source.
- **Salon** = chairs: seats; counter: `buy(service)` whose follow-up changes the appearance; clients: `talk`.
- **Soumbédioune** = pirogues: `fish`/`work`; mareyeuses: `buy`/`sell` fish; benches: seats.
- **Furniture store / shops** = shelves: `browse`, `buy` (item to the home or inventory).
- **Plot / billboard** = sign: `inspect`, `own`, `rent`.
- **Car rapide** = door: `ride` (board a vehicle seat); stops: `alight`.

Already composed: the Maïga meals (pay → the plate is prepared → sit on a free bench or chair → eat → stay seated).

## Waves

**Wave 1 — the vertical slice that proves the feeling:** interaction system + UI overhaul, a usable Dibi, an improved
mosque, the car rapide passenger experience, the home / furniture / property loop (with land and billboards in the data
model), NPC activity density, better vehicle models.

**Wave 2:** buses and taxis, owned motorbikes and cars (drive mode), salon, shops framework everywhere, nightclub at
night, Soumbédioune fishing economy (fish, buy, sell), player businesses on the generic model, billboard rentals,
friends and contacts between real players, Dakar Port (ships, containers, trucks, warehouses, jobs).

**Wave 3:** airport and Dakar Rek Airlines (terminal, ticket, boarding, seated flight), travel to other Senegalese cities,
aviation assets for the wealthiest, district streaming across a larger Dakar.

## Parallel lanes

Each lane works on its own branch (worktree), commits freely there and never pushes to production; integration (tests,
captures, performance) happens before anything reaches `wip/visual-pass`, which Cloudflare publishes.

World & Activities · 3D Asset Factory (with asset register and provenance) · NPC & Social Life · Economy & Ownership ·
Transport · UI/UX · Performance · QA / Integration.

## Not possible from the cloud session yet

- **Quran text:** tanzil.net, quran.com and api.alquran.cloud are blocked by the session's network policy. The mosque
  can offer "read a verse" only once a verified source is reachable (allow `tanzil.net` in the environment) or the text
  is supplied from a verified file.
