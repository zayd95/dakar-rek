# Arena — an evening inside the Pikine arena (Wave 2, 10 Oct 2026)

The visible path of a fight evening, end to end, built on the systems that already exist: buy a ticket at the window,
get past the controller, take a free place on the tiers, watch the stands fill, the wrestlers' entrance with drums and
dances, the existing làmb duel played by two NPC wrestlers, the crowd's reactions, the result, then the crowd goes home.
The combat rules are untouched (`src/lamb/duel.ts`). The street outside the walls (vendors, queue, fans arriving,
drummers outside, event days, gate position) is another lane: `src/arena/exterior.ts`.

## What a player can do

- **Buy a ticket** at the « GUICHET · BILLETS » window, left of the gate (a place of the shared registry,
  `pikine:arena:guichet`, open 17 h–23 h). « Acheter un billet (1 000 F) » shows the price and asks for confirmation
  (« Payer 1 000 F » / « Annuler »). Paid once through the activity runner: one wallet line
  « Billet · gala de làmb · Arène de Pikine », valid for the whole evening; a second purchase is refused
  (« Tu as déjà ton billet pour ce soir »). Stored as a save counter (`arena_ticket_day`), no schema change.
- **Go through the gate.** Without a ticket the controller turns you back to the street (« Xaaral tuuti ! »); with one
  he welcomes you (« Dalal ak jàmm ! »).
- **Take a free place on the tiers.** Every place on the three tiers is a seat of the shared registry
  (`kind: 'stand'`, « Place en tribune »), offered from the ring side (« S'asseoir »). Places the crowd holds are
  taken; the player never gets one twice. The view is the spectator's own eyes on the seat (the body is hidden, as on
  a car rapide seat), a slightly narrower field of view, the gaze following the action; drag looks around (±80°).
- **Watch the gala** (starts once seated while the doors are open):
  1. *Les tribunes se remplissent* (3 s) — the bill is announced: Babacar (Baobab) – Lamine (Teranga).
  2. *Entrée des lutteurs* (14 s) — the two wrestlers walk out of their tunnel, each with his entourage behind him; the
     drummers' group plays on its deck (the evening's one rhythm, `src/arena/exteriorAudio.ts`), dances; the crowd
     stands up and cheers (see *The people of fight night*).
  3. *Combat · lutte sans frappe* — the existing `LambDuel` in spectate mode (no player input, no duel HUD), the
     « player » side driven by an autopilot (`pilot()` in `program.ts`) that presses the same buttons a player has;
     the other side is the duel's own AI. The crowd reacts on clinches and falls.
  4. *Résultat* (7 s) — the winner and how (projection, or the referee's decision; otherwise « Match nul »), the
     crowd stands and shouts « Daan na ! » (il a gagné).
  5. *Le public rentre* (9 s) — the stands empty; the gala is over for that day (`arena_gala_day`).
- **Stand up and leave.** After the gala the gate no longer checks tickets and the stands stay empty until the next
  day's evening.

Names are the game's fictional cast and écuries; no real wrestler, écurie, promoter or brand. No ritual or religious
text in the show: drums, dances and the crowd.

## The people of fight night (Wave 3)

`src/arena/people.ts` (`FightNightPeople`, driven by the arena evening) is every person inside the walls, on the venues'
Cast and roles (`src/venues/cast.ts`): each one is shown only in the moments of the evening they belong to
(`peopleMoment(phase, street)` → `PRESENT`), seated ones on real seats of the shared registry. Their places are the
structure of the arena interior (`src/world/arenaModules.ts`: `interiorSpots`, `prepCorner` and `PREP_SIDE`, `WALKWAY_R`, the tunnel);
`src/arena/interior.ts` draws nobody and keeps the debug view (`__dakar.arenaIn()`).

| Who | Where | When |
|---|---|---|
| Officials (2 / 3 / 3 by quality) | at the officials' table under its canopy (+x side), on its chairs (`pikine:arena:officiel:i`) | from the set-up (16 h) until the crowd leaves |
| The announcer (purple boubou) | standing by the table, talking | doors open → result |
| Judges (2 / 3 / 5) | the folding chairs at the sandbags (`pikine:arena:juge:i`); the chair on the wrestlers' runner only on high | the gala: filling → result |
| The referee (white shirt) | in the ring | filling and entrance; the duel (`LambDuel`) brings its own referee for the bout |
| The drummers' group (3 / 5 / 6) | the drummers on their deck by the tunnel, behind their sabars; one or two dancers on the sand in front | the two middle drummers warm up while the doors are open; all play from the filling until the crowd leaves |
| The press (1 / 2 / 2) and cameramen (0 / 1 / 2) | at the press table (`pikine:arena:presse:i`) and behind the cameras, −x side | doors open → result |
| Vendors (1 / 2 / 3) — Sokhna (café Touba, bissap), Binta (water), Abdou (peanuts), with a kettle or a basin on the head | walking to and fro along the walkway in front of the parapet (two arcs, never into the public gate nor the tunnel); a call now and then (« Café Touba ! Café Touba chaud ! »), one vendor at a time and never over the entrance or the result | doors open → result |
| A helper in each écurie's corner | by the buckets at the back of the corner | doors open → the crowd leaves |
| Each wrestler's entourage (1 / 2 / 4 per side) — the écurie's flag first, the coach in a bazin boubou of the écurie's colour, helpers in its colour with a bucket | walk out of the tunnel behind their wrestler (left at 0.9 s, right at 3.9 s of the entrance), round in front of the drummers' deck, into their corner by its open side (those who arrive first go furthest, so nobody walks through another); wait there during the bout; the winner's run onto the sand through the gap in the boards by the tunnel and celebrate; back into the tunnel with the crowd | entrance → leaving |

- **Each écurie in its corner.** The side of each écurie's preparation corner is read from `PREP_SIDE`
  (`src/world/arenaModules.ts`, the one place that sets it, owned by the fighter's path); its people stand round the
  mat's centre (`cornerSpots` in `people.ts`). Baobab's entourage walks in behind the left wrestler of the bill,
  Teranga's behind the right one; the winner's run onto the sand.
- **When the player fights tonight** (`src/arena/fighter.ts`, `arenaFighter.onCue`): from the tunnel on, the player's
  écurie's people (and its corner helper) wait in its corner; when the player reaches it (`prep`) they gather round and
  turn to them; they cheer as the player walks out to the ring (`walk-out`) and after the bout (`result`); they go
  once the player is back outside (`exit`) or the bout is given up.
- **Buying in the stands.** A vendor who passes within 3 m of the player stops for a few seconds, turns to them and
  talks; « Sokhna · vendeuse » offers what she sells at the prices of the stalls outside (café Touba 150 F, bissap
  300 F, water 50 F, peanuts 200 F), through the activity runner, counted with the evening's purchases
  (`arene:achats`).
- **The ring side is theirs.** The judges', officials' and press chairs are kept for them between two shows (`keep` on
  a Cast role): no passer-by of the ambient life and not the player sits at the ring side.
- **Performance.** Their group (`arena_people`) is *not* `noLod`: the shared humanoid budget of the crowd LOD
  (`src/actors/crowdLod.ts`, `src/social/ambientLife.ts`) keeps the nearest as full bodies and swaps the far ones for
  cheap figures. Each person carries a weight in that budget (`LOD_PRIO`, set through the Cast's `setLodPrio` and the
  body's `userData.lodPrio`): the people in the spotlight — the entourages walking in, the winner's people, a vendor
  by the player, the player's own corner — count at their distance; the others as if 2.4 times farther, so on low and
  medium they get a full body only within 15 m of the camera (from most seats: cheap figures). Behind the walls nobody
  inside is drawn unless the camera is inside or by one of the two gates (`seenFrom`). What they carry is one merged
  mesh each. This keeps the arena's own draw calls within the visit check's budget (desktop < 160 with the people;
  on w4 they measured seat +154 and entrance +208 before).

## Code

| File | Role |
|---|---|
| `src/arena/program.ts` | Pure: hours (`GALA`), ticket validity, crowd fill curve, density per quality, seat layout on the tiers, show phases and timings, the bill, crowd reactions, the bout autopilot. Tested in `tests/arena.test.ts`. |
| `src/arena/module.ts` | The `arenaModule` (game module seam): ticket window, gate controller, seats, show state machine, entrance, camera from the seat, debug API. |
| `src/arena/crowd.ts` | `StandCrowd`: seated / standing figures as 4 `InstancedMesh`es, plus a few near-LOD humanoids around the player's seat. |
| `src/arena/bout.ts` | `WatchedBout`: a `LambDuel` with `spectate: true`, driven by the autopilot. |
| `src/arena/card.ts` | The gala card (title, phase, bill). |
| `src/arena/people.ts` | `FightNightPeople`: every person inside the walls (officials, judges, announcer, referee, drummers, press, vendors, corner helpers, the entourages); layout, presence by moment and counts by quality are pure and tested in `tests/arenaPeople.test.ts`. |
| `src/arena/interior.ts`, `src/world/arenaModules.ts` | The interior's structure (stands, aisles, tunnel, deck, media zone, corners) and its debug view `arenaIn()`; tested in `tests/arenaInterior.test.ts`. |
| `src/venues/cast.ts` | The venues' Cast and roles (moments, seats, walks, cheers; `place`, `attach`, `keep`). |
| `src/lamb/duel.ts` | Presentation only: `spectate` option (no key listeners, no HUD) and `axes()`. Rules unchanged. |
| `src/interact/seats.ts` | `SeatKind` `'stand'`, optional per-seat `reach`. |
| `src/i18n/lines.ts` | `ARENA` lines (ticket, welcome, stop, bill, entrance, result, over). |

**Density** (`DENSITY` in `program.ts`): share of the tier places the crowd fills and near-LOD humanoids —
low 42 % / 0, medium 68 % / 4, high 86 % / 8. The crowd is 4 instanced meshes whatever its size; the near-LOD
humanoids sit in the row in front when there is one and are not drawn when out of view. The people at the ring side
follow the quality too (below).

**Integration point (exterior lane).** Until `src/arena/exterior.ts` is in integration a gala can be watched every
evening (doors 17 h–23 h). The TODO at the top of `src/arena/module.ts` wires the shared rule: galas on
`arenaExterior.isEventDay(day, hour)` (Friday–Sunday evenings) and `arenaExterior.schedule(() => evening.showing())`
so the street stays alive while a gala runs. The ambient NPCs (`src/social/ambientSpots.ts`) never take the tiers'
places (`kind: 'stand'`), and the arena's group is `userData.noLod` (its bodies are never swapped for far figures).

## Getting there (`src/arena/arrival.ts`, rules in `src/arena/arrivalRules.ts`)

Habib's evening: « prendre sa moto ou un Car Rapide ».

- **By moto.** A guarded parking sits on the sand east of the gate, off the queue lane and the drummers. It has two
  rows (13 places) with a sign « PARKING MOTOS · GARDIEN ».
  - Getting off there, the « gardien de motos » greets the player and names his price, 100 F for the evening.
  - « Faire garder ta moto (100 F) » opens « Payer 100 F » before anything is paid. It is paid once per evening
    (save counter `arena_moto_day`, one wallet line through the runner).
  - He puts the moto in the place he keeps next to him. `ownedModule.moveParked` saves it like any parking spot, so
    it is found again after the bout. Coming back the same evening costs nothing.
  - The other motos are instanced (three looks, ≤ 3 draw calls) and solid. Two stand there while the arena is set up.
    The rows fill as the doors open, full by 19 h on a gala night and about half on a weekday card (cap by quality
    6 / 10 / 12). They empty over 150 game seconds after the gala.
  - When the player rides away, the gardien says « Ñibbil ak jàmm ! Ba beneen yoon ! » (rentre bien · à la
    prochaine).
  - The evening's goal line suggests the moto to a player who owns one in this hub and is far (pin on the moto).
    Once they are riding it points to the parking.
- **By car rapide.** While the arena is set up and its doors are open, the Ligne 23 cars of the evening route round
  the arena block (`23s`, 16 h – midnight, src/transport/lines.ts) carry fans in green and red: Baobab, Teranga, and
  a few in their own clothes. They ride on every leg towards « Arène ».
  - These are the transport's own passengers: `transport.setFans(line, { colours, dest })` and the car rapide kit's
    `colours`.
  - They get off at « Arène », where the car pulls in with ordinary passengers. Each car keeps the fans aboard until
    their stop (`fansAtStop` / `fansOnSet`, src/transport/passengers.ts): if the street leaves its doors phase during
    the ride (the gala over, a slow phone's clock), no more get on, but those aboard still ride to « Arène » and get off.
  - The arrivals lane (`src/crowd/arrivals.ts`) hears each car pull in the frame it happens (`transport.onArrival`: its
    key, the car, whether fans rode to this stop), so a slow frame never misses one — a look every half second at who
    stands there could miss a whole stop on a phone at a few frames a second. It walks a group to the queue's tail, two
    more when fans got off. The player's own car (`transport.ridingVehicle()`) always lets its group off: with the
    walker pool full, the walkers furthest along (nearly at the queue) arrive at once and make room (`furthestAlong`).
    A player who rides along gets off with them.

`?debug` → `__dakar.arrival.info()` (street, gardien, places, other motos, the player's moto, paid, what he said),
`arrival.skip(sec)` (the after-gala emptying). `flock /tmp/dakar-browser.lock node scripts/check-arena-arrival.mjs
[baseUrl] [outDir]` runs it on desktop and phone: ride in, greeting, price, pay once, the moto in his place, walk to the
gate, rows emptying after the gala, ride away and the goodbye, fans aboard from « Marché », off at « Arène » with a group.

## Friends at the arena (`src/arena/together.ts`)

Players in the same hub group watch the gala together. Everything goes through presence: positions, poses and one
optional field. No money, inventory, save, fight record, reward or outcome roll ever crosses the protocol.

- **Seated together.** A remote player on a place in the stands is drawn seated there, from the protocol's `Sit` pose
  and height. That place is taken on every other device too: the crowd's figure moves off it and nobody else can sit
  on it. It is freed when the friend gets up or leaves. **Encourager** (a second action on the seated player,
  `ctx.player.cheer`) stands the player up on the tier for 2.5 s with their arms up. It is sent as `Celebrate`, a
  pose already on the whitelist.
- **One bout for the group.** While a show runs (filling → leaving) and the player is inside the walls, presence
  carries `arena: { d, p, t, w?, o? }`. That is the city day, the phase index (`ARENA_PHASES` = `SHOW_PHASES`), the
  time in half-second steps, and once known the result (winner 0/1/2, outcome index). `parseMove` validates it: keys,
  integer ranges, 0 ≤ t ≤ 900, and it refuses the whole move otherwise. The evening's bout is seeded by
  `boutSeed(hub, day)` (the duel's opponent AI and the autopilot) and played in fixed 1/60 s steps
  (`src/arena/bout.ts`), so every device plays the same bout.
  - The friend furthest on (the earliest in) is the reference. A device behind by a phase, or by 1.5 s or more,
    jumps forward to their phase and second. On the way it sets up the entrance, then plays the seeded bout up to that
    second, at most 4 s of bout per frame. It also takes the result the friend saw if its own differs.
  - A player inside the walls during the doors whose own show has not started joins the running one.
- **Leaving is presence.** A friend who leaves the arena or the game stops sending the field. Their place is freed and
  nobody follows them any more.

**Later: a server-authoritative show.** The alignment is client-side, and a device that drifts never pulls others
backwards. A floating-point difference between browsers could still make two devices' bouts diverge, in which case the
reference's result is shown. The next step is a show clock kept by the room (`server/worker.ts`): start time, seed and
result, with clients only rendering it. A crowd-noise level shared by the group could come with it.

## Debug and checks

`?debug` → `__dakar.arena.info()` (street, event, day, phase, t, ticket, seats, crowd, entrance, bout, result, gate,
centre, people: moment, judges, officials, announcer, referee, drummers, drums, vendors, entourage, seats), `arena.cam()`, `arena.speed(n)` (fast-forward), `arena.go(phase)`, `arena.freeSeat(x, z)`, `arena.visible(on)`,
`arena.day(d)`.

centre), `arena.cam()`, `arena.speed(n)` (fast-forward), `arena.go(phase)`, `arena.freeSeat(x, z)`, `arena.visible(on)`,
`arena.day(d)`; `together()` (the friend followed, jumps made, places held by friends, the presence field sent), `cheer(s)`.

`npm run check:online` (scripts/check-multiplayer.mjs, CI) seats two clients side by side in the stands at 18 h: each
sees the other seated (pose and height), the later one joins the earlier one's show (same bout phase within 3 s), a
cheer is seen by the other, and both get one result.

`flock /tmp/dakar-browser.lock node scripts/check-arena-visit.mjs [baseUrl] [outDir] [--view=desktop|phone]` plays
the whole path on desktop (medium quality) and phone (low quality), captures in `docs/screenshots/arena-visit/`.
Draw calls are measured at the gate, on the seat and during the entrance: the arena's own share (the same frame with
everything `src/arena` draws hidden; budget desktop < 160, phone < 60) and the whole frame (desktop < 600, phone < 300).

`flock /tmp/dakar-browser.lock node scripts/check-arena-people.mjs [baseUrl] [outDir] [--view=desktop|phone]` checks
the people (desktop medium, phone low), captures in `docs/screenshots/arena-people/`: the officials and two drummers
at doors-open, vendors walking, a vendor stopping and selling, the chairs kept, judges and referee at the filling, the
drummers' group and the entourages walking in (whole-frame draw calls), the entourages in their corners during the
bout, the winner's people on the sand, everyone gone after the gala.
