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

Already composed:

- **The Maïga meals** (pay → the plate is prepared → sit on a free bench or chair → eat → stay seated).
- **The Dibi** (`src/venues/dibi.ts`, wave 1): one open-air venue on the old dibiterie lots — « Chez Pathé » next to the
  starter home in Pikine and « de la Médina » on the Plateau (same plan, own owner and colours). Painted low walls on two
  streets, the charcoal grill smoking at the corner (embers glow at night), the butcher's counter under a concrete roof,
  long tables with benches and plastic tables under a rusty tin roof, a hand-wash kettle, a TV and a string of bulbs.
  *Do:* order at the counter (pay → grilled → sit at a free table → eat with the dish on the table → stay seated): dibi
  mouton, brochettes, the day's special, bissap, attaya in the evening; wash your hands; help at the grill (stand beside
  the cook, a timed `work` step for now — the integration turns it into the shared timing gesture). *Who:* the owner
  (short French/Wolof exchange: news, work, today's special), the cook, clients to greet (they sit on real seats).
  *Earn / spend / own:* meals; a grill ladder (helper → grill → head of grill → evening service, 900 → 6 000 F a shift,
  unlocked by shifts at that grill); a `ownership` hook is ready for the business lane. *Why return:* the special
  changes every city day, the regular's price after five meals, the next rung of the ladder, the evening crowd and
  attaya. Open 11 h–2 h (« Fermé · ouvre à 11 h », shutter down, cold grill); lively at night; location chat.
  *At night* (`src/venues/dibiNight.ts`, wave 5: the place the evening ends, where the evening call sends players after
  the gala): a bed of coals that glows at night (dull by day, cold when closed) and sparks (one point cloud, near the
  camera only); the dibi master turns the brochettes on the grate one by one (Grab) — the grill job beside him is
  unchanged; a ceiling of string lights zigzagging between the posts; a TV corner (three low benches round a low table
  of the furniture kit) facing the TV that shows tonight's bout from the city's card (live 17 h – 23 h, then its replay,
  with the arena's result once there is one — never an invented one); posters (tonight's card, « ouvert jusqu'à 2 h »,
  the attaya); the menu board under the counter's fascia, drawn from the counter's own offers (dibi mouton · oignons,
  moutarde, pain; brochettes; bissap; attaya; the pot); under the neem, the furniture kit's attaya set on its cushions:
  « Une théière d'attaya sous le neem » (500 F, the evening, paid once, sits you on a free cushion). The city's people
  sit and eat at every table, in the TV corner and on the cushions (the place's `area` claims the tables' seats);
  someone makes the attaya and someone watches the TV in the evening. Draw calls: +3 by day, +4 at night (board, coals,
  brochettes, furniture; sparks), the painted menu sign it replaces deducted; the whole Dibi is about 26 at night
  without its people (`tests/dibiNight.test.ts`).
- **The Grande Mosquée** (`src/venues/mosque.ts`, wave 1, Plateau): walled courtyard with two shade trees and benches
  for the elders, a covered row of ablution taps with low stools and plastic kettles, a portico of arches with the shoe
  racks, a white hall with green bands, a pale green dome and one minaret (green light ring at night). Ablutions seated at
  a tap → « Entrer · laisser ses chaussures » (your pair waits on the rack, you are barefoot inside) → pray on a free
  place of a row, kneeling (derived `Kneel` pose on `prayer` seats) or sit quietly → talk with the imam (greetings,
  prayer times, how to help) → sweep the courtyard as a volunteer. **No reward for religious practice** (Habib, 9 Oct):
  ablutions, prayer and the calm seat change no need, no money, no counter, no activity category. No commerce, no
  location chat, always open. Quranic calligraphy and « Lire le Coran » come verbatim from Tanzil (see « Quranic text »). The rows fill up around the
  five prayer times (`src/venues/prayer.ts`, Wolof names; also the place's `peaks` for the NPC lane).
- **Soumbédioune's pirogue and mareyeuses** (`src/venues/beach.ts`, Corniche, on the existing beach block): « Partir avec
  les pêcheurs » boards you on the pirogue's thwart; the boat pushes out to sea with you and its crew aboard, you pull
  the net, it comes back to the sand (catch in the inventory: 6 fish in the morning, 4 by day, 3 late); then sell to
  Coumba and the mareyeuses (600 F a fish, or buy one at 700 F) and talk prices. Open 6 h–20 h. The landing's unloading
  and net repairs stay as they were.
- **Salon Awa's chairs** (`src/venues/salon.ts`, Pikine): two styling chairs facing mirrors, the stylist working behind
  you, a client in the other chair. Cuts (short, afro, shaved) and the beard change your character and stay (saved,
  every hub, `src/venues/style.ts`). Open 9 h–21 h.
- **La Vague, the night club** (`src/venues/club.ts`, Almadies, on Ngor's beach; `club` recipe; the owner's « Nightclub
  MVP »): a wooden terrace behind a bamboo fence, a lit sign over the gate (fictional name), the doorman and his rope, a
  dance floor whose tiles light up on the beat, the DJ booth under a truss of coloured beams, a thatched bar with five
  stools (juices of Dakar and a fruit cocktail, no alcohol), lounge benches with low tables, string lights, the sea
  behind. *Do:* « Entrer » at the door shows the fee first (2 000 F, once for the whole night) and only « Payer 2 000 F et
  entrer » pays; dance (the shared timing gesture `G.dance` on the drum's beat, two steps, the second faster, while your
  body dances); drink on a free stool at the bar, or sit at a free lounge table and the waiter walks the drink over; ask
  the DJ for a song; on the « Nuit du sabar » enter the dance contest after 23 h (three faster rounds, prize scaled by how
  well each is danced, up to 7 200 F, once a night); « Sortir » by the gate. *Who:* Lamine the doorman (the week's
  programme, regulars), Saliou at the bar, the lounge waiter, DJ Mbaye, clubbers on stools, benches and at a high table
  with a short French/Wolof exchange (« Na nga def ? », « Dama sonn » at dawn, « Nanu dem ! », « Ñibbil ak jàmm »),
  dancers who make room for you and cheer a good dance. *The hour:* almost empty at 21 h, building before midnight, the
  peak after it, thinning at dawn (4 / 7 / 10 dancers by graphics quality); NPCs sit on real seats, never on yours.
  *Why return:* a theme every night of a seven-night week (mbalax, afro, rap galsen, salsa, zouk, the sabar contest,
  retro) on the board by the gate; after three nights you are a regular and come in free. Inside, the terrace is its own
  presence space (`almadies:venue:club`, accepted by `parseMove`): its location chat and quick phrases (« Rafet na »).
  Open 21 h–5 h: by day the gate is shut (« Fermé · ouvre à 21 h »); it never closes on someone inside.

Composition seams added for this: `HubWorld.sites` (`src/world/sites.ts`: lots and blocks a module composes — the
builder keeps the place's identity interactable and leaves the ground free, with the street dressing unchanged),
`PlaceSpec.peaks` (busy hours), `Anchor.space` (one place across a courtyard and a hall), `Seat.clip` (the pose held on
a seat: `Kneel` on prayer rows), seat kind `prayer`, `GameCtx.addInterior` used by a module's own interior; for the
terrace: `Role.phase` / `Role.yieldR` / `Cast.burst` (dancers out of step, stepping aside for the player,
cheering), `Cast.walkTo` (the waiter), `Venue.space` (a venue's own presence space while the player is in it), the
data-only gesture `G.dance`; the runner keeps a seated player on a fitting seat for a second order.

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

## Quranic text (Grande Mosquée)

Source: **Tanzil Project** (https://tanzil.net), *Tanzil Quran Text (Simple)*, CC BY 3.0, verbatim copies only. The
verses used are copied byte for byte by `scripts/quran-extract.mjs` into `src/venues/quran.json`, which keeps Tanzil's
copyright block; `node scripts/quran-extract.mjs --verify <tanzil-simple.xml>` re-checks them against the file. Never
type or edit Arabic text by hand; lines break only between words (pause marks stay with their word).

| Where (prayer hall only) | Text |
|---|---|
| Framed panel on the qibla wall, left of the mihrab (its pair on the right is geometric tiles) | Âyat al-Kursî, 2:255 |
| Cartouche above the mihrab's arch | Al-Ikhlâs, 112:1–4 |
| Band over the door, seen when facing the way out | 1:1 |
| Mushaf open on its folding stand (rahla) on a low table in front of the shelf — « Lire le Coran » | Al-Fâtiha, 1:1–7, with the reference and « Texte coranique : Tanzil Project — tanzil.net » (link) |

Rules: nothing outside the hall (no floors, goods, vehicles, other venues), nothing to buy, **no reward** (reading is a
hand-over with no effect: no money, need, counter or activity category), no recitation audio, no translation (Tanzil's
translations have their own terms) — French labels give only the surah and verse numbers. Fonts: the device's Arabic
fonts (Naskh / Quranic faces first); if none can join Arabic letters, the panels stay plain frames. Check:
`scripts/check-quran.mjs`, `tests/quran.test.ts`.

## Not possible from the cloud session yet

- ~~**Quran text**~~: done on 10 Oct — Habib allowed `tanzil.net` in the environment; see « Quranic text » above.
