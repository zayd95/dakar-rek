# Crowd and social events

Wave 3 of the signature spec (§6 crowd LOD, §37 crowd and social events), built for Habib's evening: work in the
afternoon, a moto or the car rapide to Pikine, the fight at the arena with a full house, then on to La Vague. The crowd
is one reusable system. It runs the arena's stands, the fans arriving on fight evenings, and the street life of every hub
(spec §23: more people, each with a reason to be there). La Vague's dance floor can plug in without new code.

## Files

| File | What it holds |
| --- | --- |
| `src/crowd/reactions.ts` | Pure, no Three.js: the six reactions, a member's reaction state, who joins in, the rig poses (and the arm maths shared by every level of detail), the dance mood, excitement per group. |
| `src/crowd/rig.ts` | The instanced figures (mid: 14–16 boxes, far: 7–8) and the one shared material whose vertex shader poses arms, legs and upper body and shapes the look (headwear, build, prints, banners, upright legs) from a few numbers per instance. |
| `src/crowd/looks.ts` | Pure: how people look (styles, wax prints, invented football shirts, headwear, height, build), the same person per seat, the two écuries' colours. |
| `src/crowd/banners.ts` | The supporters' banners: invented slogans in Wolof and French, one shared texture atlas. |
| `src/crowd/standPlan.ts` | Pure: the stands' banner holders, children on laps, people at the barrier by the ring. |
| `src/crowd/crowd.ts` | `Crowd`: slots, presence, groups, `react`, `setMood`, levels of detail, the full humanoids next to the player, ground shadows, stats. |
| `src/crowd/arenaStands.ts` | `ArenaStands`: the arena's stands on the crowd (drop-in for the old `StandCrowd`), sections and sides, the gala's moments. |
| `src/crowd/arrivals.ts` | `ArenaArrivals`: fans arriving by taxi and car rapide on fight evenings and walking to the queue. |
| `src/crowd/streetPlan.ts` | Pure: the street's hour curves and budgets, the busy streets, the pavement lanes and places checked against the colliders, short routes round obstacles. |
| `src/crowd/street.ts` | `StreetLife`: walkers, people waiting at the stops, groups chatting, the after-gala flow. |
| `src/crowd/transportPeek.ts` | The transport lane's stop API as the crowd reads it: stops served now, cars standing there, how many get on. |
| `src/crowd/module.ts` | The lane's module: runs the arrivals and the street, makes the crowds' full humanoids greetable, debug entries. |
| `tests/crowd.test.ts`, `tests/street.test.ts`, `tests/standLooks.test.ts` | Unit tests. The street tests build the real hubs in node (`tests/hubstub.ts`, a blank canvas). |
| `scripts/check-crowd.mjs`, `scripts/check-street.mjs` | Browser checks (desktop medium, phone low), captures in `docs/screenshots/crowd/` and `docs/screenshots/street/`. |

The arena lane's `src/arena/module.ts` builds `ArenaStands` instead of `StandCrowd`. It passes the side of the wrestler
walking in and of the winner, fills the stands less for a weekday card, and feeds the camera every frame.
`src/arena/crowd.ts` (StandCrowd) is no longer imported, and the arena lane can delete it.

## The crowd

```ts
const crowd = new Crowd(slots, { quality, near?, nearRadius?, nearNeedsFocus?, seed?, name?, look?, blobs?, fidget? });
crowd.fill(n, skip?)                   // the first n slots (in the order given), minus those `skip` names
crowd.setPresent(id, on)               // or one by one
crowd.move(id, x, y, z, yaw, speed)    // walkers: speed > 0.2 m/s walks (legs and arms swing)
crowd.react(group, kind, { share?, seconds?, origin?, speed? })   // → how many join in
crowd.setMood(group, 'dance' | 'rest', bpm?)
crowd.giveFlag(id, colour)              // waved whenever the arms go up
crowd.calm(group?); crowd.level(group?)                          // excitement 0–1, for the sound
crowd.setFocus(x, z | null, yaw?); crowd.setCamera(camera); crowd.update(dt, animate)
crowd.stats(); crowd.drawCalls(); crowd.dispose()
```

- **Slots**: `{ id, x, y, z, yaw, seated, tags, with?, upright?, lap?, banner? }`. `y` is the sitting surface for seated
  slots (hips) and the ground for standing ones. Tags are the groups (`'all'` is implicit).
  - `with`: a companion of another slot (a child on a lap, someone at the rail who came with a spectator). It comes and
    goes with that slot and is not counted by `fill` or `present` (`stats().companions` counts them).
  - `upright`: drawn standing at rest with the seated figure (its thighs and shins straightened in the shader), so people
    at the rail cost no extra draw call. They stand up for reactions as usual.
  - `lap`: never stands, and is not drawn while the person it sits on stands.
  - `banner`: this person hangs that banner on the parapet in front of them.
- **The crowd never touches the seat registry**: the owner marks the seats it gives the crowd, as the arena does with its
  `arena-crowd` occupant, and never gives it the player's seat.
- **Looks** (`src/crowd/looks.ts`): a Dakar mix. Each member keeps the same look across every level of detail, and the
  owner can pass `look`.
  - Clothes: tees and trousers, boubous (plain bazin, or a wax print), long dresses (mostly wax), invented football
    shirts (stripes, hoops or a sash in an accent colour; no club, no brand).
  - Headwear: headwraps (most dresses), kufis, caps with a brim, short hair or none.
  - Height 0.92–1.07 and build 0.88–1.18 (the body's width); children 0.55–0.68.
  - All of it is per-instance numbers on the same figures, not new meshes:
    - four colours packed as 0xRRGGBB in one attribute (skin, trousers, headwear, the print's accent);
    - the crown's height, a brim, the print code and the build;
    - wax motifs (dots, diamonds, waves) and the jerseys' stripes drawn in the fragment shader, fading to their average
      colour in the distance so they never shimmer.
  - The full humanoids near the player carry the same headwrap or kufi, the wax or striped pattern and the build.

### Levels of detail (quality-scaled)

| Quality | Full humanoids | Mid figures within | Far silhouettes within | Beyond |
| --- | --- | --- | --- | --- |
| low | 0 | 14 m | 90 m | not drawn |
| medium | 4 | 34 m | 150 m | not drawn |
| high | 8 | 64 m | 220 m | not drawn |

- **Near**: the city's own humanoids and clips (Sit, Idle, Celebrate, Walk, Dance_A/B), given to the members nearest the
  focus (the player's seat, in front first) or the camera. Where no clip has the gesture (clapping, fists at the chin,
  hands on the head, pumping), their arms are posed after the mixer with the same maths as the figures, blended in and
  out. They are marked `noLod`, so the city's crowd LOD leaves them alone. Off-screen bodies are neither drawn nor
  animated. At most two new bodies are made per half second.
- **Mid**: rigged instanced figures, one draw call per posture (seated, standing) for the whole crowd.
- **Far**: silhouettes, one draw call per posture.
- **Cost**: a full stand of about 400 people costs 4 draw calls plus 10 per near humanoid, and no shadow pass. The rigged
  figures cast no shadow. Street crowds can ask for `blobs`, a soft round shadow under each standing figure, which costs
  one more draw call. Per-instance buffers are uploaded only on frames where something changes: a reaction starts or
  ends, a pose eases, someone moves, or the LOD changes.

## Reactions — `crowd.react(group, kind)`

| Kind | Seated people | Pose | Rank | Share · seconds |
| --- | --- | --- | --- | --- |
| `applause` | stay seated | clapping in front of the chest | 2 | 0.7 · 3.5 |
| `shout` | stand | fists pumping, leaning in | 3 | 0.5 · 2.4 |
| `standUp` | stand | craning forward | 2 | 0.6 · 4 |
| `grab` | stay seated | leaning in, fists at the chin | 1 | 0.55 · 2.2 |
| `fall` | stand | leap up, hands on the head | 4 | 0.85 · 3.5 |
| `celebrate` | stand | arms up and waving, hopping | 5 | 0.85 · 6 |

**Who joins in:**

- Each member joins in with probability share × keenness (0.6–1.4); `share: 1` means everyone.
- Members start after a stagger, so a reaction ripples rather than jolts. With `origin`, the ripple also spreads out from
  that point at `speed` m/s.
- Each member holds the reaction for its duration ×0.75–1.25, then settles back.
- A stronger reaction (higher rank) replaces a weaker one. A weaker one is refused while a stronger one still has more
  than 0.6 s to run.

**Dance mood:** `setMood(group, 'dance', bpm)` makes a group dance between reactions, one hop per beat with the arms
pumping in turn. Near bodies play Dance_A or Dance_B.

**Between reactions:**

- People are of different heights.
- A few calm people at a time fidget for 2–6 s: they talk with their hands, lean in or sit back. The default rate is 3 %
  of the crowd starting each second; `fidget: 0` turns it off. A fidget never counts as cheering, and a reaction ends it.
- Members given a flag (`giveFlag`) wave it from the left hand whenever their arms are up (shouting, celebrating). The
  flag sits exactly where the figure's hand is drawn (`handLocal`, the rig's maths on the CPU). All flags together cost
  one draw call.

## The arena's stands — `ArenaStands`

It is a drop-in for `StandCrowd` and keeps the same calls: constructor `(seats, nearCount, { quality })`, `group`, `taken()`,
`present`, `cheering`, `fill`, `react(share, seconds)`, `setNear`, `cull` and `update`. On top of that it adds
`react(group, kind)`, `moment(m, { side, winner })`, `level()` and `stats()`.

**Groups** follow the stand sections of the arena interior lane (`src/world/geew.ts` SECTIONS, with seats only where
`standOpen`):

- `sec:A` … `sec:H`: one reaction unit each.
- `left`: Babacar's (Baobab) supporters in B and C, the +x side he walks to.
- `right`: Lamine's (Teranga) supporters in F and G.
- `ends`: the mixed sections A and H by the wrestlers' tunnel, D and E by the public gate.
- `tier0`–`tier2` and `ringside` (tier 0).

**The gala's moments** (`momentPlan`):

| Moment | Reactions |
| --- | --- |
| entrance (side) | his side shouts (0.75), the ends applaud (0.6), the other side applauds politely (0.4); the ripple starts at the tunnel mouth |
| clinch (the wrestlers grab) | everyone tenses (0.55), a few shout (0.1) |
| fall (projection) | everyone leaps up, hands on the head (0.85) |
| decision | everyone stands (0.6) |
| result (winner) | the winner's side celebrates (0.92, 7 s), the ends applaud (0.7), the losing side mostly keeps its hands on its head (the fall outranks applause) |

**Fill:**

- The Friday–Sunday gala fills the stands, and a weekday card fills them to 55 % (`eveningSize`, the same rule as the
  street outside).
- The crowd's sound follows its excitement (`level()`).
- Since the crowd costs a handful of draw calls whatever its size, `DENSITY` (src/arena/program.ts) now takes 70 / 84 / 92 %
  of the seats on low / medium / high (it was 42 / 68 / 86 %). That still leaves free seats for the player.
- One supporter in six in B–C and F–G brought the écurie's flag (green or red).

**The stands' look** (credible stands, `src/crowd/looks.ts`, `src/crowd/standPlan.ts`):

- **The same person on a seat every evening.** A seat's look comes from its id alone (`standLook(seatId, side)`), whatever
  the fill order or the evening.
- **Two sides that read at a glance.**
  - About 68 % of a side's supporters wear their écurie's colour somewhere. It can be a tee or a boubou in it, a
    football shirt with it as the accent, a headwrap or a dress in it, or a cap.
  - That is Baobab green (yellow accent) on B–C and Teranga red (white accent) on F–G. The end sections stay mixed.
- **Banners** hang on the parapet in front of a few ringside supporters, two per side section and one neutral banner
  in A and in H.
  - They carry invented slogans in Wolof (CLAD) with the French below:
    - « Baobab du daanu ! »;
    - « Sunu mbër, sunu ndam »;
    - « Teranga, sunu kër »;
    - « Jàpp te daan ! »;
    - « Làmb ji, sunu aada »;
    - and others.
  - Each banner is part of its holder's figure, picked per instance from one texture atlas, so banners cost no draw
    call.
  - Banners keep 2.6 m apart and never hang over an aisle's gap.
- **Children**:
  - one seat in 26 (above ringside) has a child on the lap;
  - two or three people stand at the barrier by the ring in each section except by the gate, a child among them.
  - They are companions of a seat's spectator, so they come with the evening's attendance.
- **Postures**: the grabs make the bout tense. About 30 % of the calm crowd leans in, elbows on their knees, until the
  fall, the decision or the result. Keener people lean further at a grab.
- **Cost**:
  - Draw calls are unchanged: at rest the stands are still two (seated figures, near and far), and at the peak five as
    before.
  - The figures carry 2 more boxes (mid) and 2 (far), and the rig uses 15 vertex attributes, under WebGL's 16.
  - In node, the stands' update rose from about 0.10 ms to 0.12–0.17 ms a frame at 19:00 (`tests/perf.evening.test.ts`).

**The seated player's view** (`setNear` → `Crowd.setClearView`):

- The neighbours within 1 m of the player's seat are not drawn at all. A head that close fills the screen when the gaze
  follows the bout sideways.
- The people within 1.3 m, and those ahead on the sight line to the ring (the next two rows down, in a widening strip),
  never stand up. They cheer, clap and hold their heads from their seats.
- Only the player's seat is affected, and those people keep their seats, so the stands still look full.

**Greeting**: a full humanoid the player greets stands still and faces them while answering (`ctx.people`).

## Fans arriving on fight evenings — `ArenaArrivals`

- **Taxis**: while a bout is on (`arenaExterior.active()`) and the player is within 150 m of the gate, a taxi pulls in
  every 13 s on a gala night and every 32 s on a card night, alternating between two corners:
  - down the west road (heading −z, right lane), stopping before the street;
  - up the east road (heading +z), stopping before the street.

  Each taxi drops 2–4 fans (1–2 on a card night) on the pavement, waits about 4 s, and drives on.
- **Car rapide**: each time a car rapide pulls in at an « Arène » stop that is served (`transport.served`), 4–7 fans step
  down at its rear door (`transport.dwellingAt`; 2–3 on a card night). On fight evenings that is the evening route
  `23s`'s stop on the arena's west side: the day route's stop is parked.
- **The walk**: every fan walks on the pavement and the closed street to the tail of the queue lane, where the exterior's
  queue takes over. No path crosses the arena block or the écurie block (unit-tested).
- **Bodies**: up to 10, 18 or 26 walkers at low, medium or high quality. They are instanced walking figures with ground
  shadows; the nearest 0, 2 or 3 are full humanoids.

## La Vague's dancers (plug-in, no change pushed to the venues lane)

The club (`src/venues/club.ts`, local lane/w1-venues e398136, tag `la-vague-final`) has 4/7/10 cast dancers on its floor
spots and a beat of about 124 bpm (`t / 0.485`). To fill the edge of the floor and the terrace with a cheap crowd that
dances on the same beat and answers the player:

```ts
const ring: CrowdSlot[] = edgeSpots.map(([x, z], i) => ({ id: `vague${i}`, ...at(x, z), y: G0, yaw: faceFloor(x, z), seated: false, tags: ['floor'] }));
const floor = new Crowd(ring, { quality: q, near: 0, name: 'la-vague', blobs: false });
group.add(floor.group);
floor.setMood('all', 'dance', 124);
// each frame: floor.fill(Math.round(ring.length * crowdShare(clubCrowd(h)))); floor.setCamera(ctx.camera); floor.update(dt, inClubOrNear);
// a good dance: floor.react('all', 'applause', { share: 0.6 }); the contest won: floor.react('all', 'celebrate', { share: 1 });
```

The same mood serves the sabar dancers by the arena gate and the dancers at a wedding.

## Shops

The customer flow (enter → browse → buy → leave) belongs to the shops lane through the city's ambient people
(`src/social/ambientLife.ts`, `src/world/shopFlow.ts`, docs/SHOPS.md), so there is no second crowd there. A shop seen from
far away could use `Crowd` silhouettes if ever needed.

## Street life with reasons — `StreetLife` (spec §23)

One street crowd per hub: a pool of 36, 72 or 120 people (low, medium, high) with 0, 2 or 3 full humanoids, the nearest.
It costs 3 draw calls (standing figures, silhouettes, ground shadows) plus 10 per full humanoid. Everyone there has a reason:

- **Walkers** go somewhere along the pavements, from crossing to crossing.
  - They walk the front half of the pavement, on lanes checked against the hub's colliders for every road edge and side.
  - At each crossing they turn towards the busy streets more often: Sandaga's four streets round the market in Plateau,
    and the Pikine main street from the room's block past the arena to the market. Those streets weigh 6 against 1.
  - The number follows the hour: the morning rush at 7:45, a lunch bump, the evening rush at 18:45, quiet nights.
- **Waiting at the car rapide stops**: people stand on the back half of the pavement, either side of the shelter. The
  shelter, its bench, its pole and the stop's own waiting humanoids keep the middle.
  - Half of them chat with a neighbour.
  - When a car rapide pulls in (`transport.dwellingAt(stopId)`: the car, its rear door, the seconds it still waits), the
    nearest two or three walk to its door and get on one after the other, and one or two step off and walk away.
  - Only the stops served now hold people (`transport.served(stopId)`). From 16 h to midnight Ligne 23 takes its evening
    route `23s` round the arena: the day route's stops are parked and empty, and only the served stops count against
    the street's pool.
  - Nobody waits after the last car (23:15) or before 5:30.
- **Groups chatting** gather in front of the shops, kiosks and stalls, mostly in the evening when the heat drops. Each
  group is a ring of four on the back of the pavement. They take turns talking with their hands (the `chat` mood) and
  break up after a few minutes.
- **After the gala** (Pikine), the spectators come out:
  - The arena lane's outflow brings them out of the gate to both ends of the street and the side corners.
  - The street crowd takes them on from there: to the nearest served car rapide stop, to the taxi corners, or home
    along the streets.
  - **Riding home**: half of those near it head for the `23s` « Arène » stop, where a crowd waits in two rows beside
    the shelter (`crowdSlots`, up to 18). Each car that pulls in takes the front of the crowd, nearest the door first,
    one after the other (`BOARD_GAP`, 0.45 s apart), up to the car's fill: the line's share of the seats
    (`LineDef.fill`: 0.85 on gala nights) and never more than can climb in before it leaves (`boardCount`). Nobody gets
    off there after the gala. The transport lane always keeps seats free, so the player can squeeze in.
  - The arena lane's outflow (exterior.ts) also heads only for the served stops (`transport.served`).
  - At the taxi corners they wait, and taxis come for them (`ArenaArrivals` pick-ups).
  - The flow starts when the after-gala window opens (`streetAt` 'after', the gala seen to the end or closing time) on
    an evening the arena's street was alive. Fans stop arriving at that moment.
- **Nobody pops up in sight.** People appear out of view (more than 28 m away, or behind the camera) or walk in. They
  leave the same way. Walkers who wander far from the player come back near them.
- **Each hub its own street** (`HUB_STREETS`):

  | Hub | Everyone | Waiting at stops | Groups chatting | Busy streets |
  | --- | --- | --- | --- | --- |
  | Plateau | 1 | 1 | 0.9 | Sandaga |
  | Pikine | 0.9 | 1.15 | 1.25 | the main street |
  | Corniche | 0.55 | 0.75 | 1.1 | none |
  | Almadies | 0.35 | 0.5 | 0.4 | none |

  - Pikine's commuters fill the car rapide stops, its evenings are spent outside, and so are the students' at Fann.
  - The villas of Almadies keep their people indoors.
  - Stops on a busy street (Sandaga's, the Arène and Marché stops on the main street) hold two more people, and so does
    the evening route's « Arène » stop by the arena on fight evenings. On a phone (life within 90 m) it is the only
    served stop near the main street at 18:45, so it carries the street's waiting crowd.
  - The groups on the busy streets are the first to gather.
- **The street lives around the player**: stops and groups fill within 90, 120 or 150 m (low, medium, high). Elsewhere
  they would be beyond the crowd's far range anyway.
- **The walkers come first**: they keep up to 45 % of the pool (`WALKERS_KEEP`) when the hour asks for that many; the
  groups give way next, then the stops. A hub with many stops or group spots never ends up with an empty pavement.
- **Never through walls or furniture.** Lanes and places are checked against the colliders, and every straight walk (to a
  stop, into a car, across a crossing) goes round stalls and barriers with `routeClear`.
  - `tests/street.test.ts` runs the Pikine street for two and a half minutes of evening rush and checks every person
    every second.
  - `__dakar.street.blocked()` lists anyone inside a collider in the browser.
- **Greeting**: the full humanoids of every crowd (the spectator next to you, a passer-by) can be greeted like anyone in
  the street (`ctx.people`).
- **Cost**: the update takes about 0.1 ms a frame on average in node at high quality.
- **Out of scope**: traffic, weather and road events stay with the city lane.

## Debug and checks

- `__dakar.crowds.list()`: every live crowd with present, reacting, standing, near/mid/far/hidden, the kinds shown,
  level and draw calls.
- `__dakar.crowds.react(name, group, kind)` triggers a reaction; `__dakar.crowds.calm(name)` settles a crowd.
- `__dakar.arrivals`:
  - `info()`;
  - `taxi(r, close)`: `close` starts the taxi 25 m before its stop;
  - `speed(n)`: the arrivals' clock runs n× faster, for checks on slow renderers.
- The checks wait for states, never for fixed times, because SwiftShader may run the game at a few frames a second.
- `__dakar.street`:
  - `info()`: targets, roles, stops, groups, counts, LOD, draw calls;
  - `where()`;
  - `blocked()`;
  - `leaveNow(n)`: starts the after-gala flow.
- `scripts/check-street.mjs`:
  - the Pikine main street at 18:45 and Sandaga at 8:00;
  - people getting on and off a car rapide;
  - only the served stops holding people on a fight evening (the evening route `23s`, not the parked day route);
  - the after-gala flow to the `23s` « Arène » stop, and the crowd there boarding a car rapide in turns;
  - empty streets at 3 h;
  - nobody inside a collider;
  - draw calls and errors.
- `__dakar.arena.info().crowd` now carries `level` and `lod` (the stats).
- `scripts/check-crowd.mjs`:
  - a taxi drop, a car rapide group and the fans reaching the queue;
  - seated with full stands on a Friday;
  - the LOD tiers and their draw calls;
  - each reaction by its group;
  - seated people standing for a fall but not for applause;
  - the entrance making his side shout;
  - the frame's draw calls, shader compilation and page errors.

  Run it under the shared lock:
  `flock /tmp/dakar-browser.lock node scripts/check-crowd.mjs http://localhost:PORT/ docs/screenshots/crowd`.
