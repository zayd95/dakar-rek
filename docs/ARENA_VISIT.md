# Arena — an evening inside the Pikine arena (Wave 2, 10 Oct 2026)

The visible path of a fight evening, end to end, built on the systems that already exist: buy a ticket at the window,
get past the controller, take a free place on the tiers, watch the stands fill, the wrestlers' entrance with drums and
dances, the existing làmb duel played by two NPC wrestlers, the crowd's reactions, the result, then the crowd goes home.
The combat rules are untouched (`src/lamb/duel.ts`). The street outside the walls (vendors, queue, fans arriving,
drummers outside, event days, gate position) is another lane: `src/arena/exterior.ts`.

## What a player can do

- **Buy a ticket** at the « GUICHET · BILLETS » window, left of the gate (a place of the shared registry,
  `pikine:arena:guichet`, open 17 h–23 h). « Acheter un billet (dès 1 000 F) » opens the window's sheet with the three
  tiers and their prices first (« Populaire 1 000 F · Tribune couverte 2 500 F · Tribune d’honneur 5 000 F »), one
  « Payer … » per tier and « Annuler » (see *Ticket tiers*). Paid once through the activity runner: one wallet line
  (« Billet · gala de làmb · Arène de Pikine », « Billet · gala de làmb · Tribune couverte · Arène de Pikine »…), valid
  for the whole evening; a second purchase is refused (« Tu as déjà ton billet pour ce soir »). Stored as save
  counters (`arena_ticket_day`, `arena_ticket_tier`), no schema change.
- **Go through the gate.** Without a ticket the controller turns you back to the street (« Xaaral tuuti ! »); with one
  he welcomes you and says where your places are (« Dalal ak jàmm ! » · Billet Tribune couverte — ta place : sections
  C, F et G.).
- **Take a free place on the tiers of your ticket.** Every place on the three tiers is a seat of the shared registry
  (`kind: 'stand'`, its `section`; « Place en tribune », « Place en tribune couverte », « Place d’honneur »), offered
  from the ring side and the aisles (« S'asseoir »). Another tier's places show « S'asseoir » greyed with the reason
  (« Ton billet est pour la tribune populaire (sections A, D, E et H, et le haut de la B) : cette place est en tribune
  d’honneur. »). Places the crowd holds are taken; the player never gets one twice. The view is the spectator's own eyes on the seat (the body is hidden, as on
  a car rapide seat), a slightly narrower field of view, the gaze following the action; drag looks around (±80°).
- **Watch the gala** (starts once seated while the doors are open):
  1. *Les tribunes se remplissent* (3 s) — the bill is announced: Babacar (Baobab) – Lamine (Teranga).
  1b. *Préliminaires* — short bouts between young wrestlers of the neighbourhoods, long before the main event, while the
     stands fill (see *The preliminaries*); no ceremony, a short walk-in each.
  2. *Entrée des lutteurs* (33 s) — the main event only, a ceremony (see *The entrance as a ceremony*): each wrestler
     walks out of the tunnel behind the announcer's call, does his bàkk on the sand while his people chant round him
     and his griot sings his praises, the drums change rhythm and his side of the stands rises; then he goes to his
     corner, and both come to the ring. The stands are nearly full by then (the preliminaries' fill ramp).
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

## Ticket tiers (Wave 5)

`src/arena/tickets.ts` (pure, `tests/tickets.test.ts`) and `src/arena/ticketsDecor.ts`: three tiers on the stands that
exist (sections A–H of `src/world/geew.ts`), a small item of the arena's economy where the player's wealth shows.

| Tier | Price | Places | The crowd there |
|---|---|---|---|
| Populaire | 1 000 F | sections A, D, E, H (the ends, by the gate and the tunnel) and the top row of B (behind the officials' canopy) | full |
| Tribune couverte | 2 500 F | sections C, F, G — the long sides of the ring, under a navy canvas awning hung from the roof's edge, navy cushions | 90 % |
| Tribune d’honneur | 5 000 F | the two front rows of B, behind the officials' table, close to the ring: white cushions with backs and a gold edge, the plate « TRIBUNE D’HONNEUR » on the parapet; the fewest places | 45 %, in their best (grand boubous, long dresses), a third of them the officials' guests |

- **The controller's rule**: a ticket opens its own tier's places only (`seatRefusal`), and only while the gate checks
  tickets or a gala runs; the seat registry's `refuse` greys « S'asseoir » with the reason. A fighter of tonight
  needs no ticket at the gate, but sits nowhere without one.
- **The view from every tier**: the seat camera is the same everywhere (the spectator's eyes, the gaze following the
  action). From the honneur rows the officials' canopy never hides the ring's centre (tested from every place; one
  place loses sight of one wrestler's mark behind the canopy's trim), and the top row of B — whose view it does block
  — is sold as Populaire.
- **Who sits there**: the crowd lane's spectators (`src/crowd/arenaStands.ts`) take each tier's places by its share
  (`crowdMayTake`) and dress through its new `look` option; each place's tier is a crowd group (`tribune:honneur`…).
- **Friends** (`src/arena/together.ts`): each sits where their own ticket lets them; their place is held on the others'
  devices from their position only. Nothing about tickets or money crosses the presence protocol (tested).
- No brands: the plate, the canvas and the cushions are plain colours.

## The preliminaries (`src/arena/undercard.ts`)

In a real làmb gala the stands fill while short preliminary bouts (« combats de préliminaires ») run between lesser
wrestlers. A seated spectator no longer waits with nothing on the sand.

- **How many:** two to four on a gala night (Friday–Sunday), one or two on a weekday card. The number and the names
  come from the evening's seed, so everyone gets the same card that evening.
- **Who:** generic young wrestlers of the neighbourhoods, « Modou (Thiaroye) – Assane (Yeumbeul) ». The names are a
  first name and where he comes from, never a real wrestler, écurie or promoter, and never the main event's names.
- **Each preliminary:**
  - The announcer names it, « Préliminaires 1/3 : … contre … », and the gala card shows it.
  - The two wrestlers walk from the tunnel to their marks in 5 s, with no dances; the ceremony is the main event's.
  - They fight a short bout of the existing duel: AI against AI, a 30 s round, a young wrestler's style and level 1–2.
    It is seeded by `prelimSeed(hub, day, i)` = `boutSeed(hub, day)` + 1 + i, so it is the same bout for the group.
    It runs sans frappe for now: every preliminary goes through `prelimBout(pair)` in `module.ts`, which will pass the
    pair avec frappe when the Làmb 2.0 lane (`?lamb2`) is merged.
  - The stands react less than for the main event: a murmur at a grab, about a third up at a fall, applause at the
    result. The result is announced, « Préliminaires : Modou l'emporte par chute. »
- **The stands fill along the way:** from the hour's share when the show began (at least about a third) to 95% at the
  end of the last preliminary. The main event's entrance then lands on full stands.
- **Friends follow them** like the main bout. The presence field carries `i`, which preliminary, as an integer 0–5
  validated by `parseMove`, and `t`, the time within it. ARENA_PHASES gets `prelims` between `filling` and `entrance`.

**The timeline at 1×.** These are real seconds: show time runs on the frame clock, and a frame counts at most 0.1 s, so
this holds from 10 frames a second up. `?debug` → `arena.timeline()` records each phase and preliminary on the real
clock in the browser.

| From sitting down | Phase | Lasts |
| --- | --- | --- |
| 0 s | *Les tribunes se remplissent* | 3 s |
| 3 s | first preliminary: walk-in | 5 s |
| 8 s | first preliminary: its bout | duel intro 2.2 s + up to 30 s (a fall ends it sooner) |
| … | its result, then the next preliminary | 3.5 s; up to ~41 s per preliminary |
| ≈ 1 min 25 s – 2 min 45 s (gala, 2–4); ≈ 45 s – 1 min 25 s (card, 1–2) | *Entrée des lutteurs*, the ceremony, stands ~95–100% | 33 s |
| + 33 s | the main bout | duel intro 2.2 s + up to 90 s |
| | *Résultat* | 7 s |
| | *Le public rentre* | 9 s |

The first preliminary is on the sand 3 s after sitting down, and its bout starts at 8 s, well under the minute asked
for. A gala with three preliminaries and a main bout to time-out lasts about 4 min 30 s from sitting down to the empty
stands. One voice at a time: the bill at the doors, then each preliminary's name and result (3.5 s apart from the
next one's name), and the ceremony's announcer and griots only once the last preliminary's result has been said
(the entrance starts 3.5 s after it, its first call 0.7 s in). A preliminary passed on the way to a friend's show
says nothing, as the ceremony's missed lines.

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

## The entrance as a ceremony (Wave 3)

`src/arena/ceremony.ts` (pure, `tests/ceremony.test.ts`) times and places it; `src/arena/entrance.ts` plays the
wrestlers, the lines and the sound; the entourages and griots are `src/arena/people.ts`.

| Seconds of the entrance | Left wrestler (Baobab on the fixed bill, +x) | Right wrestler (−x) |
|---|---|---|
| 0.5 – 6 | walks out of the tunnel to his bàkk spot in the ring; « 🎤 L’annonceur : À ma gauche, pour l’écurie Baobab, venu de Pikine… Babacar ! » (with his record when the roster knows it) | waits in the tunnel |
| 6 – 11.5 | **his bàkk**: four beats (dance, arms up, to his stands then to the ring); the drums switch to the bàkk's rhythm; his stands shout; his boast, his griot's praise into the microphone, his people's chant | walks out (from 8 s); named by the announcer at 11.6 s |
| 11.5 – 17 | to his corner (out through the boards' gap, round the drummers' deck), his people in file behind him; then he warms up there | |
| 13.5 – 19 | | **his bàkk**, the same way |
| 19 – 24.5 | | to his corner, his people behind him |
| 27.5 – 32 | both jog to the ring; the bout starts at 33 s | |

- **The words** are short and invented, French with everyday Wolof from the lexicon (`src/i18n/wolof.ts`: « Dama am
  doole ! » (j’ai de la force), « Gaynde ! » (lion), « sama gox » (mon quartier), plus « géew », « mbër », « bàkk »,
  « doole »): a wrestler boasts about himself — his strength, his écurie, his neighbourhood — never about his
  opponent. The griot praises his strength, his écurie and his neighbourhood. Lines are picked by the evening (the
  same evening says the same lines). The announcer and the griot speak through the arena's microphone: a
  public-address chime (`paChime`, synthesised placeholder), then the line.
- **The drums** change to a denser, faster placeholder pattern for each bàkk (`drumRhythm('bakk')` → the evening's
  percussion in `src/arena/exteriorAudio.ts`), then go back; neither pattern transcribes a real sabar rhythm.
- **Records**: the announcer reads a wrestler's season record through `setRecordSource`, which the career module
  (`src/career/module.ts`) fills from the city's ladder (`src/career/roster.ts`); a wrestler it does not know is named
  with his écurie and his neighbourhood only.
- **The card** comes from `billFor(day)` (the career's ladder): each side's people wear their wrestler's écurie colour
  (blue for an independent), and take his écurie's corner (`PREP_SIDE`); when both wrestlers are of one écurie, or
  neither has one, the right one takes the other corner (`cornerSides`).
- **The player fighting tonight** (`src/arena/bakk.ts`): on the fighter's 'walk-out' cue the announcer names them (with
  their record from the career) and « Faire ton bàkk » is offered on the way to the ring — optional, two beats (a
  dance and a boast, then the arms up), stoppable like any activity. The drums change rhythm, their people cheer and
  the stands by their corner answer (« Les tribunes de ton côté répondent : « Gaynde ! » »).
- **Respect**: no rite is staged — no bath, no amulet, no prayer — no sacred text is written, and nothing in the
  ceremony is rewarded (no money, need or counter). The wrestlers wear no accessories.
- A show joined further on (a friend's, `follow`) sets the drums right and skips the lines it missed.

## Code

| File | Role |
|---|---|
| `src/arena/program.ts` | Pure: hours (`GALA`), ticket validity, crowd fill curve, density per quality, seat layout on the tiers, show phases and timings, the bill, crowd reactions, the bout autopilot. Tested in `tests/arena.test.ts`. |
| `src/arena/module.ts` | The `arenaModule` (game module seam): ticket window, gate controller, seats, show state machine, entrance, camera from the seat, debug API. |
| `src/arena/crowd.ts` | `StandCrowd`: seated / standing figures as 4 `InstancedMesh`es, plus a few near-LOD humanoids around the player's seat. |
| `src/arena/bout.ts` | `WatchedBout`: a `LambDuel` with `spectate: true`, driven by the autopilot. |
| `src/arena/card.ts` | The gala card (title, phase, bill). |
| `src/arena/people.ts` | `FightNightPeople`: every person inside the walls (officials, judges, announcer, referee, drummers, press, vendors, corner helpers, the entourages); layout, presence by moment and counts by quality are pure and tested in `tests/arenaPeople.test.ts`. |
| `src/arena/tickets.ts`, `src/arena/ticketsDecor.ts` | Ticket tiers: prices, sections, the controller's rule, the crowd's share and dress per tier (pure, `tests/tickets.test.ts`); cushions, canvas and plate (one merged mesh). |
| `src/arena/ceremony.ts`, `src/arena/entrance.ts`, `src/arena/bakk.ts` | The entrance as a ceremony: timings, places and lines (pure, `tests/ceremony.test.ts`), the wrestlers and cues of a gala, the player's own bàkk. |
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
  - They get off at « Arène », where the car pulls in with ordinary passengers.
  - The arrivals lane (`src/crowd/arrivals.ts`) sees the car pull in through the transport's one public stop API,
    `transport.dwellingAt` (src/crowd/transportPeek.ts now reads it instead of the debug entry). It walks a group to
    the queue's tail, two more when `transport.hasFans`. A player who rides along gets off with them.

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
`arena.day(d)`, `arena.timeline()` (real seconds per phase and preliminary), `info().prelims` (the card, the one running, its stage and bout, the results); `together()` (the friend followed, jumps made, places held by friends, the presence field sent), `cheer(s)`.

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
