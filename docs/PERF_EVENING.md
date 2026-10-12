# Evening performance budget: Pikine on a gala night

Everything piles up on the same evening at Pikine:

- the city's ambient life;
- the street crowd;
- the fans arriving and queueing;
- the vendors, drummers and dancers at the gate;
- the stands crowd;
- the posters and the traffic;
- soon, the city lane's weather and road events.

This page fixes a budget for that evening, the tools to measure it, and what the crowd and NPC lanes changed to stay
inside it.

## How it is measured

**In the browser:** `scripts/check-perf-evening.mjs`. It covers three moments of a Friday gala, each on the low (phone 390×844), medium
(1280×720) and high (1280×720) presets:

| Moment | Where the player is | What is going on |
| --- | --- | --- |
| 17:30 | in front of the gate | the fans arrive and queue |
| 19:00 | seated on the tiers | the bout |
| 23:00 | in front of the gate | the outflow after the gala |

For each moment it records:

- the frame's draw calls and triangles, and each top-level group's share (`__dakar.renderBreakdown()`: the frame is
  rendered again with that group hidden, shadow pass included);
- the JS milliseconds per system and per module (`__dakar.perfOn()` / `perf()`, a smoothed profiler in the main loop that
  is off unless asked for);
- the frame time.

`--measure` prints the numbers and saves them (`docs/perf/evening.json`); without it the budgets are asserted. The script
also measures builds that predate the profiler: it skips the update times and keeps the draw calls.

SwiftShader renders on the CPU, so its frame times only compare builds. They are not phone numbers. The JS times are
CPU times of the machine; a mid-range phone is about 3–4× slower.

**In node:** `PERF=1 npx vitest run tests/perf.evening.test.ts`. It builds the real Pikine hub (blank canvas,
`tests/hubstub.ts`) and runs the crowd lane's systems at the three moments and three presets: the stands at the arena's
DENSITY with the gala's moments, the street crowd, and the after-gala flow. Without `PERF` it is a quick smoke test with
a loose bound, part of `npm test`.

## Budgets

| Preset | Draw calls (whole frame) | JS update (ms, this machine) | Crowd lane (ms) |
| --- | --- | --- | --- |
| low (phone) | ≤ 180 | ≤ 4 | ≤ 0.8 |
| medium | ≤ 300 | ≤ 6 | ≤ 1.2 |
| high | ≤ 420 | ≤ 8 | ≤ 1.6 |

Why these numbers:

- **Low ≤ 180.** Before the arena stack, the NPC density check put Pikine at 73–128 draw calls on the phone preset
  (docs/screenshots/npc-density/results.json), and 180 is the coordinator's target. The gala evening must fit in the
  ~50 calls left. On low the crowd lane draws no full humanoid, so it costs 2–5 calls a crowd.
- **Medium ≤ 300.** Before the stack, Pikine at 21 h was at 244 calls on desktop and 212 on phone in CI's launch check,
  and 140–215 on medium in the density check. 300 leaves room for the gala's own scene (gate, stands, ring, wrestlers)
  but not for a second shadow pass of a crowd.
- **High ≤ 420.** High has twice the shadow-map size and more full humanoids, which is about 1.4× medium.
- **Update times.** The crowd lane measures 0.02–0.28 ms a frame in node, without the full humanoids' animation. Each
  full humanoid adds about 0.1 ms of mixer and arm posing, so 0.8 / 1.2 / 1.6 ms leaves room for 0 / 6 / 10 of them with
  margin. The whole JS update gets 4 / 6 / 8 ms, so that on a phone, 3–4× slower, the update stays well under a 30 fps
  frame on low.

## What changed (crowd and NPC lanes)

| Change | Where | Saving |
| --- | --- | --- |
| The crowd's full humanoids cast no shadow (stands under the roof's shade; on the street the round ground shadow sits under them) | `src/crowd/crowd.ts` | about 10 draw calls per full humanoid on medium and high |
| Fewer full humanoids: stands at most 0 / 4 / 6 (was the arena's 0 / 4 / 8); street 0 / 1 / 2 (was 0 / 2 / 3); arrivals 0 / 1 / 2 (was 0 / 2 / 3) | `arenaStands.ts` STAND_NEAR, `streetPlan.ts`, `arrivals.ts` | high: 14 → 10; medium: 8 → 6 |
| Seated on the tiers or in the ring, the street outside the walls is not drawn: the street crowd, the arrivals and their taxis, the ambient people, and the other systems' humanoids under the shared budget (the exterior's fans, vendors, drummers and dancers) | `src/crowd/module.ts`, `src/social/ambientLife.ts` | at 19:00, everything the walls hide anyway: up to the whole street humanoid budget (12 / 20 / 30 bodies, doubled by shadows on medium and high) |

Most draw calls the crowd lane can cost (instanced crowds plus full humanoids, all crowds near the player at once):

| Preset | Before | After |
| --- | --- | --- |
| low | 11 | 11 |
| medium | 5 + 3 + 3 + 8 × 20 = 171 | 5 + 3 + 3 + 6 × 10 = 71 |
| high | 5 + 3 + 3 + 14 × 20 = 291 | 5 + 3 + 3 + 10 × 10 = 111 |

These are worst cases: full humanoids exist only next to the player, the stands' only around the player's seat.

Update cost of the crowd lane in node (ms a frame, averaged over 1800 frames):

| Preset | 17:30 street | 19:00 street + stands | 23:00 street (after-gala flow) |
| --- | --- | --- | --- |
| low | 0.06 → 0.12* | 0.03 + 0.07 → 0.03 + 0.10* | 0.02 → 0.03 |
| medium | 0.04 → 0.04 | 0.04 + 0.10 → 0.06 + 0.09 | 0.02 → 0.05 |
| high | 0.12 → 0.07 | 0.07 + 0.10 → 0.08 + 0.28* | 0.02 → 0.02 |

The starred differences are run-to-run noise of a few hundredths of a millisecond (GC, JIT). Nothing in these systems
changed between the two runs; the changes above save draw calls and humanoid animation, which node does not run.

## For the other lanes (not changed here)

- **Arena exterior** (`src/arena/exterior.ts`): with the player inside the walls, its humanoids are now hidden by the
  shared budget. Its instanced scarves and flags, stalls and drums are still drawn behind the walls. Hiding its group
  while `insideArena` holds (exported by `src/crowd/module.ts`) would save those calls too.
- **Arena module** (`src/arena/module.ts`): the stands crowd is drawn while the player is within 70 m, outside the walls
  included: 4–5 calls, a small cost.
- **City lane** (weather, road events): new systems should have their own groups under `ctx.extra` with a name, so
  `renderBreakdown()` reports them, and should keep humanoids under the shared budget (no `userData.noLod`).
- The browser numbers per group and per system come from `scripts/check-perf-evening.mjs`. Run it under the lock as:
  - `--measure` on the build before (7da7342);
  - `--measure` on this head;
  - without `--measure` to assert the budgets.

## The gala-night road (city lane, `src/city/galaTraffic.ts`)

The approach to the arena from the east adds one group, `gala_traffic`, to the evening (docs/CITY.md « The gala-night
road »):

| Preset | Draw calls at most | What |
| --- | --- | --- |
| low | 6 | 2 car looks × (body + glass) + 2 moto-taxi looks; no shadow |
| medium | 6 | the same |
| high | 8 + 3 | 3 car looks × 2 + 2 moto-taxi looks, and the 3 car bodies in the shadow pass |

- Every vehicle of the road is an instance of these meshes: the jam (up to 15 / 12 / 9 standing, a few coming and
  going), the moto-taxis (about 7 / 5 / 3 at the rush), the rank taxis after the bouts (the taxi look). A mesh with no
  instance is hidden. Nothing is drawn beyond 190 m from the junction, indoors, or from inside the arena's walls.
- The headlights come from night.ts's existing point sprites (`night_vehicles`, one call): each instance has an
  empty proxy object carrying the kit's spec, so there is no new call. The proxies are pooled (70 / 84 / 136 by
  quality); night.ts now skips a hidden one before any matrix work.
- Humanoids: the traffic agent and the fans on the 23s cars' steps (at most 4 on medium and high, 1 on low). They sit
  under the shared humanoid budget (`humanoid_v2` under `ctx.extra`), so the frame's humanoid cap does not grow. The
  moto-taxis' fans walk in the arena arrivals' instanced pool: no new body.
- JS: on the first frame the jam replays the evening's events (at most about six minutes of shared time, a few hundred
  events): about 4.5 ms once in node, at 18 h 36 on medium. After that each frame computes the jam's cars (about 25 at
  the peak), the moto-taxis on their lattice and the rank in closed form, and fills the instances: about 0.06 ms a
  frame in node (medium, the jam at its thickest). Every vehicle's place is a function of the shared clock, so
  nothing is integrated frame by frame and slow frames cost nothing extra.
- To measure: `__dakar.renderBreakdown()` reports `gala_traffic`; `__dakar.gala.info().drawCalls` counts its meshes.
  `scripts/check-perf-evening.mjs` at 17:30 sees the thin queue and the moto-taxis. The jam's peak comes later
  (its window opens between 17:36 and 18:06): `setHour(18.5)` on a gala night shows it at its thickest.

## Wave 5: the whole frame back inside the budget (`fix/w5-perf`)

The wave-5 candidate (b17bfcb) went over the update budget at every moment of every preset, and over the low preset's
calls after the gala (browser: low 6.48 / 7.43 / 6.93 ms, outflow 177 calls). What grew:

- **Every humanoid computed its gait every frame** (src/actors/gait.ts), with the mixer, wherever it was: hidden ones
  (their owner's, or those the shared budget swapped for a far figure), off-screen ones, far ones. The mixer also
  evaluated 38 position and scale tracks a clip that only ever hold the rest pose.
- **night.ts** scanned every object under `ctx.extra` for vehicles (92 % of them the bones and meshes of humanoids) and
  read their world positions by walking up the parents, by day too.
- **The gala road** computed its jam, moto-taxis and rank every frame where nothing of it is drawn.
- **The show on the sand** (bout, fête, entrance) stayed drawn after the gala behind the walls (`arena_evening` 35 calls
  at 23:00 on low), and its fête was played every frame.
- **The spotlight people** (`arena_people`) kept their weight in the shared budget for up to 2 s after the bout began
  (ambientLife cached it): 133–175 calls on high.
- Smaller: the crowd rewrote all its instances each frame; the venues updated at full rate far away and the Dibi read its
  board's text each frame; the watched bout posed its bodies and drew its HUD at every 1/60 s step; the career card was
  computed several times a frame; a walker's sidewalk entries were searched again for each path; the posters' text
  stepped down a pixel at a time; the cast and the exterior's scarves walked up the parents for world positions.

What changed, all features kept (each commit on the branch has the details and its tests):

| Change | Where |
| --- | --- |
| Animation level of detail (`ANIM_LOD`): in view within 30 m every frame with the gait; beyond, the clips alone with the mixer at 20 Hz (30–60 m) or 10 Hz (beyond); out of view 5 Hz; hidden 2 Hz. Time is owed, so loops and fades keep their pace; bodies are staggered; between updates the bones are set back to the mixer's pose. `fullRate` for the player and the strike rig. Static tracks stripped from the clips. | `src/actors/humanoid.ts`, `src/main.ts` (`setHumanoidView`) |
| Vehicle lights idle by day; the scan skips humanoids; positions from the last world matrix; lamps re-sent only when they change | `src/city/night.ts` |
| The gala road twice a second while nothing of it is drawn | `src/city/galaTraffic.ts` |
| `arena_show`: the bout, the preliminaries and the entrance drawn only when the camera sees inside the walls; the fête behind the walls at 5 Hz | `src/arena/module.ts` |
| The spotlight's weight read live by the shared budget; out of it when the bout starts | `src/social/ambientLife.ts`, `src/arena/people.ts` |
| Crowd instances written in place between layout changes; only members with something to do visited | `src/crowd/crowd.ts` |
| Venues beyond 90 m at 5 Hz; the Dibi's board read once a second | `src/venues/index.ts`, `src/venues/dibiNight.ts` |
| The watched bout poses its bodies once a frame and draws no HUD | `src/lamb/duel.ts`, `src/arena/bout.ts` |
| Caches: the career card per ladder and day; sidewalk entries per clear test; the walkers' queue check on a collider grid; the poster font size in a few measures | `src/career/module.ts`, `src/social/routines.ts`, `src/crowd/streetPlan.ts`, `src/arena/posters.ts` |
| World positions from the last matrices (cast, scarves, apprentices) | `src/venues/cast.ts`, `src/arena/exterior.ts`, `src/main.ts` |

**The whole frame in node:** `PERF=1 nice -n 19 npx vitest run tests/perf.frame.test.ts` (`tests/perfHost.ts`) runs every
module and the main loop's systems through the browser check's three moments, with the main pass's draw calls per group
as three.js would issue them (THREE.LOD levels, hidden groups, the shadow pass apart). `PERF_Q=low` picks presets,
`PERF_OUT=file.json` saves the numbers. Node's update times are about 1/1.4 of the browser profiler's on this machine,
and its call counts run a little higher than the browser's (190 against 177 at 23:00 on low before the change).

Before → after on the same machine, run one after the other (600 frames a moment; update ms, main-pass draw calls on
average with the most seen in brackets):

| Preset | 17:30 arrivals | 19:00 bout | 23:00 outflow |
| --- | --- | --- | --- |
| low | 4.84 → 2.51 ms; 121 (137) → 119 (128) | 5.30 → 2.27 ms; 118 → 118 | 5.30 → 2.58 ms; 190 (209) → 167 (186) |
| medium | 5.93 → 3.21 ms; 323 → 323 | 8.41 → 2.92 ms; 170 (223) → 163 (167) | 6.29 → 3.30 ms; 307 (344) → 273 (299) |
| high | 6.21 → 3.78 ms; 405 → 406 | 9.29 → 3.27 ms; 194 (279) → 180 (189) | 7.84 → 4.31 ms; 394 (421) → 379 (400) |

`arena_people` on high during the bout: at most 133 → 39 calls; `arena_evening` on low at 23:00: 33 → 7.

For the browser check: look at bodies crossing 30 m from the camera (gait to clips), shadows of off-screen bodies on
medium and high (5 Hz), the show when the camera looks in from a gate, and a seated or kneeling far figure (its pose
is read at 2 Hz).

## Wave 5: the transport hitch (`fix/w5-transport`)

The browser check on the wave 5 candidate passed every moment but one: **low, 17:30 arrivals, 6.97 ms of update, of which
`module:transport` 3.03 ms** (0.16–0.22 ms on earlier builds).

**What the number is.** The profiler (`__dakar.perf()`, src/main.ts `profMark`) is a moving average, 92 % of the old
value and 8 % of each new sample. A reading of 3 ms is not a steady cost: it is one frame of about 35 ms in the last
dozen frames of the window (a frame of H ms adds 0.08·H and fades by 8 % a frame). A player feels that frame.

**The cause.** The car rapide's cabin is open: the people holding seats are drawn in the vehicle's mesh. Every time the
passengers change (each stop a car pulls in at, and the fans of a fight evening, who ride in their écurie's shirts),
`Vehicle.setPassengers` asked the kit for the car rapide with those people, and every new (seats, shirts) pair was
**a builder pass over the whole model** (2 000 triangles of cabin, rack, luggage, livery, plus the near glass and the far
model, which does not even show anyone): 8 to 15 ms on this machine when the code is warm, 25 to 40 ms in the first
passes of a process (cold JIT), and slower still in a browser busy rendering on the CPU. The sets are few (4 per fill, 3
fills, with and without the fans' colours: about twenty variants in a session) but none is ready when the first car pulls in,
and a gala evening starts them all within minutes. Not the cause: materials (the colours are in the vertices; the three kit materials
are shared, tests/transport.boarding.test.ts checks it), the people at the stops (`StopPeople` builds its humanoids once, at the hub's load).

**The fix** (`src/actors/vehicleKit.ts`, no change to what is drawn). The car rapide is built in pieces, cached apart:
the cabin without anyone (once per livery, with its glass and its far model, which no longer depend on who is aboard), each head
(seat and look) and each shirt (a seat in a colour: built once in white, then only a colour). A variant is those pieces
copied into one buffer (the bounds from the pieces', no pass over the vertices): about 0.5 ms hot instead of 9–17.
The first people to get on come at the same price as the next ones: everyone in his own look is made with the cabin, at the
hub's load. `VehicleOpts.bake: 'whole'` still builds a variant in one pass; the tests compare both triangle by triangle
(and the output was checked once against the previous kit's: 60 variants, the same triangles, bounds and spec).

**Measured** (node, this machine under the integrator's load, `nice -n 19`; `module:transport` of the gala evening at the
17:30 moment, 9 000 frames = 5 minutes of game time per preset, one fresh process each, as
`PERF=1 npx vitest run tests/perf.transport.test.ts`):

| Preset | mean ms | slowest frame after the first (cold) one | frames over 4 / 16 ms | profiler reading, worst of the run |
| --- | --- | --- | --- | --- |
| low | 0.076 → 0.070 | 15.0 → 3.8 | 7 → 1 / 0 → 0 | 0.70 → 0.39 |
| medium | 0.115 → 0.100 | 24.3 → 4.3 | 11 → 2 / 4 → 0 | 1.78 → 0.28 |
| high | 0.107 → 0.100 | 25.7 → 3.3 | 10 → 1 / 1 → 0 | 2.10 → 0.40 |

The mean hardly moves (0.07–0.1 ms: the steady cost of the module was never the problem). The frames over 4 ms that
remain are the first frame of the process (every humanoid's first animation), and a few at 2–4 ms. `setPassengers`
itself: 8–34 ms a new variant before (median about 11), 1–3 ms after (in the frame: the join, the new shirt colours, the
garbage; 0.5 ms on its own in a micro-benchmark, against 9.3 ms median for a pass over the whole model).

The browser check's window, in a fresh process (`PERF_AT=<frame> PERF_Q=<preset>`, a car pulling in that many frames into the
90 the profiler averages; the reading is the profiler's at the end): car in at frame 80, low / medium / high: reading
0.66 / 0.51 / 1.55 ms → 0.12 / 0.29 / 0.25 ms; the arrival frame itself 9.5–17.3 ms → 2.0–8.2 ms (one outlier of 15 ms in
nine runs, which did not come back in three reruns of the same case: 3.5, 2.0 and 5.3 ms). The browser cannot be measured from here; a
3.03 ms reading needs about 35 ms in the last frames of the window, which is what the first passes of a process cost (25–40 ms
in node), or two builds within a few frames (the fans boarding, then the car pulling in).

**Not changed.** The first time a humanoid plays a clip (the apprentice stepping down at a stop, the people at a stop starting
to walk) costs 1–5 ms, and about 10 ms for the first body of a process: it is the humanoid's own and the same for every body in the
city, not the transport's. The kit's other vehicles keep their one-pass models (their passengers do not change while they run).

**For the browser check:** the Ligne 23 car rapide at the « Arène » stop on a gala evening (17:30, low and medium): fans in green
and red shirts get off, others get on, the heads and hats the same as before; the cars far from the camera (far model);
`module:transport` over a few arrivals (`__dakar.perfOn()` and `perf()`). The first draw of each new passenger set uploads its buffer
(about 370 kB) once, as before.

## Wave 5: headroom (`fix/w5-headroom`)

The wave-5 candidate (784d959) passed the browser check, but not by much: low 19:00 bout 3.34 then 4.25 ms (over once), low
23:00 3.6 and 3.85, low 17:30 3.3 (6.97 once, the transport hitch); medium 23:00 286 then 302 calls against 300. The aim of
this lane was about 15 % to spare at every moment and preset (low at most about 3.4 ms), with nothing removed, the gameplay
unchanged and nothing near the player drawn worse.

**What the check's number is, and how node reproduces it** (`tests/perfHost.ts`, `PERF=1 PERF_BROWSER=1 nice -n 19 npx vitest run tests/perf.frame.test.ts`):

- The loop caps `dt` at 0.1 s and a software-rendered frame lasts 0.2-1.4 s, so the check's frames are 0.1 s long. A bout
  advances six 1/60 s steps a frame and the animation tiers of 20 and 10 Hz (`ANIM_LOD`) update at every frame: work that is
  cheap per second at 60 fps weighs six times more per frame. `PERF_BROWSER=1` plays that way, with the 19:00 window running on past
  the end of the bout (as the check's 91 frames do); the host reads the profiler as the check does (20 settled frames, then
  windows of 90 frames, each section's moving average, the draw calls of the last frame) and leaves out frames during which
  the OS preempted the process (`PERF_KEEP=1` keeps them).
- The reading is the average at the end of the window: 92 % old + 8 % new at each frame, so the last twelve frames carry 63 % of it.
  One frame of 20 ms near the end adds 1.6 ms to the reading; a one-time cost matters as much as the mean.
- The bout lasts 8.3-10.5 s depending on the city day (it is seeded by hub and day; the check plays the next Friday, day = 4 mod 7,
  `PERF_DAY=<n>`), so the 19:00 window usually ends in the result phase, with the fête starting. `PERF_STOP="19:00 bout"` stops
  after that moment.
- On this shared machine two identical runs differ by 0.3-0.5 ms in one reading. Compare builds interleaved, over several
  days, as in the tables below. Node's update times are about those of the browser's profiler at the bout and 1.1-1.4 times
  lower at 17:30 and 23:00 (the browser's rendering threads share the cores); node's call counts run higher (20-25 % on medium and high).

What changed (each commit has the details and its tests):

| Change | Where |
| --- | --- |
| **The street outside the walls at 4 Hz while the camera is inside them** (seated on the tiers, in the ring): its walkers, traffic and life, the cast, the placed people, the apprentices, the crowd module (street and arrivals), the exterior's fans and vendors, the venues, the car rapide line (when no trip), the ambient life and the arena's own party. Each is called every `HIDDEN_EVERY` = 0.25 s with the time gone by, as a long frame already does, and at every frame again the moment the camera leaves the walls | `src/game/pace.ts`, `src/main.ts` (`pacer`), `src/crowd/module.ts`, `src/arena/exterior.ts`, `src/venues/index.ts`, `src/transport/module.ts`, `src/social/ambientLife.ts`, `src/arena/module.ts` |
| **Arena show: nothing rebuilt that does not change.** The watched bout's pilot reads a small view written in place (`LambDuel.pilotView`, no `info()` object at each of the six steps); the show hears of a phase change once; the gala card builds its text when it changes; the people and the stands follow at 4 Hz while the walls hide them from a player outside; a vendor's offers are built once | `src/lamb/duel.ts`, `src/arena/bout.ts`, `src/arena/module.ts`, `src/arena/people.ts`, `src/career/module.ts` |
| **Draw calls.** The street's full bodies are capped by calls, not by a count: `BODY_CALL_BUDGET` 100 / 160 / 260 over `BODY_CALLS` 10, so 10 / 16 / 26 bodies (was 12 / 20 / 30); the farthest are swapped for the cheap figure first, as before. A body farther than 14 m from the camera puts away the details of its face (eyes, brows, lips: 4 of its 10 meshes, a pixel or two tall; the head stays in its skin) and shows them again within 14 m (hysteresis 1.5 m); the player's own body and the strike rig's keep them | `src/social/ambientData.ts`, `src/actors/humanoid.ts` |
| **The first long route of the evening.** The first person to leave a spot asks for a route over the whole sidewalk graph: every stretch was tested against the hub's 778 colliders at once, on code that had never run (20-28 ms in one frame, at the end of the 17:30 window on every city day tried). The segment test is plain loops over one list (`collidersClear`, compared with the first implementation on 4000 segments); the open graph is made per node when a search first reaches it (the routes are the same node for node: `tests/planPath.test.ts` keeps the first implementation as the reference); eight routes are planned with a test of their own when the ambient life first builds its places (`warmPaths`). The ambient life's share of that frame: 20-26 ms → 4-5 ms | `src/social/routines.ts`, `src/social/ambientLife.ts` |
| **planPath.** The open graph made once per clear test (not at each call), the nearest node taken from a heap (ordered by distance then node), a route copying only the lists it adds an edge to | `src/social/routines.ts` |
| **Posters.** A new picture (a bout result, the evening's closing) is drawn in three steps, one a frame, and given to the texture once whole; the poll is once a second; while the camera is inside the walls (no poster in sight from there) a new picture waits. The first picture is still drawn when the hub loads | `src/arena/posters.ts` |
| **Small things asked for at every frame.** The city clock keeps the time of a millisecond (its label is read lazily); `Math.hypot` (40-70 ns) replaced by `len2` in the per-frame distance loops; the gate's walks measured once; the stops found once per hub; the stands counted twice a second; `findNearest` and the follow camera's canopy test compare squares; collider scans of the street's planning without closures | `src/core/clock.ts`, `src/core/math.ts`, `src/city/galaTraffic.ts`, `src/transport/module.ts`, `src/crowd/*.ts`, `src/social/*.ts`, `src/main.ts` |
| **The host.** `PERF_BROWSER`, `PERF_DAY`, `PERF_STOP`, `PERF_KEEP`, the check's windows and readings, the main loop's `Pacer` mirrored | `tests/perfHost.ts`, `tests/perf.frame.test.ts` |

Before → after, same machine, builds run one after the other for each city day (low: 16 Fridays, one window of 111 frames each;
medium and high: 4 Fridays), update ms of the frame on average, the check's reading (the profiler's moving average at the end of
the first window: mean, then 90th percentile and worst), draw calls of the main pass at the last frame (most seen) and the most
seen in any sampled frame:

| Preset | Moment | Windows | Frame ms | Reading ms | Reading p90 / worst | Calls at the last frame | Peak calls |
| --- | --- | --- | --- | --- | --- | --- | --- |
| low | 17:30 arrivals | 16 | 2.93 → 2.53 | 2.72 → 2.33 | 3.57 / 3.73 → 2.75 / 2.82 | 117 (118) → 105 (108) | 131 → 115 |
| low | 19:00 bout | 16 | 3.34 → 2.53 | 3.42 → 2.71 | 4.50 / 5.04 → 3.35 / 3.43 | 119 (120) → 99 (103) | 131 → 110 |
| low | 23:00 outflow | 16 | 3.55 → 3.09 | 3.48 → 3.10 | 4.31 / 4.35 → 3.87 / 3.99 | 177 (178) → 145 (147) | 180 → 149 |
| medium | 17:30 arrivals | 4 | 4.30 → 3.92 | 3.83 → 3.76 | worst 4.17 → 4.19 | 353 (362) → 253 (262) | 366 → 262 |
| medium | 19:00 bout | 4 | 3.90 → 3.02 | 4.24 → 3.27 | worst 5.16 → 3.64 | 181 (192) → 152 (157) | 203 → 169 |
| medium | 23:00 outflow | 4 | 4.71 → 4.16 | 4.54 → 3.95 | worst 4.85 → 4.20 | 299 (309) → 219 (225) | 315 → 231 |
| high | 17:30 arrivals | 4 | 4.37 → 4.47 | 4.07 → 4.19 | worst 4.53 → 4.69 | 434 (452) → 322 (330) | 452 → 330 |
| high | 19:00 bout | 4 | 4.44 → 3.42 | 4.74 → 3.44 | worst 5.88 → 3.82 | 220 (238) → 180 (190) | 262 → 202 |
| high | 23:00 outflow | 4 | 5.38 → 4.72 | 5.02 → 4.53 | worst 5.77 → 4.83 | 385 (394) → 296 (306) | 405 → 321 |

(The machine was busy during these runs: absolute values are higher than in a quiet run, where the bout on low read
2.87 → 2.11 ms on average, worst of ten seeds 3.70 → 2.63.) What is left of the update, low,
bout: `module:arena` 1.3 ms of 2.7 (the stands' crowd 0.4-0.5, the bout's advance 0.3, the fans on the sand 0.15, the party 0.1);
23:00: the exterior's fans and vendors 0.4, the ambient life 0.4 (half of it in bursts: its half-second reconcile, the people leaving), the crowd
module 0.3, the gala road 0.27, `module:arena` 0.29, the cast 0.22, the venues 0.19; every body in full detail within 30 m costs
roughly 25-50 µs of mixer and gait.

**For the browser check:**

- Standing up from the tiers (the 23:00 moment): the paced systems catch up in the first frame outside the walls with what they are
  owed (up to 0.3 s in one step); the walkers, the queue, the cars should look continuous.
- Faces beyond 14 m: no eyes, brows or lips on a figure that walks away from the camera (they come back within 14 m); on a phone
  (390 x 844, 58 degrees) a body at 14 m is about 100 px tall and an eye white 6 px wide.
- Fewer full bodies in a dense street (10 / 16 / 26): the farthest of them are figures a little sooner.
- The poster of the result appears 3 frames after the bout ends, and only once the camera is outside the walls.
- One frame of about 10-25 ms, the fourth after the hub's load (`warmPaths`), where it was the first leaving person's frame.
- Node cannot see: the browser's `rest of update` (0.65-0.8 ms there against 0.2 here: the DOM), canvas and texture uploads
  (the posters' first picture), shader compiles, GC pauses, the rendering threads' share of the cores.

**Not done.**

- The stands' crowd (`Crowd.update` over the members that are easing, 0.4-0.5 ms at the bout) could update the far, instanced
  members every other frame; the cheering waves would step at 30 Hz at 60 fps and 5 Hz in the check. The hidden animation tier
  (34 bodies at 2 Hz on low at 23:00) could go to 1 Hz (about 0.08 ms).
- Cold first runs of the same kind as the route's: the first play of a clip by a body (1-5 ms: the mixer binds its tracks), a new
  vehicle variant of the arena streets' flow (4-6 ms: one each time a taxi, sedan or moto of a new colour spawns; the fixed frame 32 of
  the 23:00 window is the first of them), the car rapide's passenger changes (2-8 ms). They could be built ahead, a few a frame, after the
  hub's load.
- The ambient life's half-second `reconcile` (spawns, leaves, demand: 2-4 ms in a frame at 23:00, 17 % of the frames).

## Wave 5: the outflow (`fix/w5-outflow`)

The headroom lane's candidate (441ab9f) read at 23:00 in the browser: low 4.33 ms (over its 4), 3.44, 3.60; medium 6.30 (over its 6; 4.83-5.05
on the other runs). Not a mean that was too high but bursts that fell in the last twelve frames of the window (the reading is the profiler's
moving average, 92 % old + 8 % new: one frame of 8 ms near the end adds 0.5 ms). The aim: the moment inside its budget on every run (low
at most about 3.4 ms, medium about 5.1), nothing removed, nothing near the player drawn differently, the gameplay unchanged.

**The bench** (`scripts/perf-outflow.mjs`, `tests/perf.outflow.test.ts`, node only: no browser). One process is one browser run (cold JIT and caches),
the builds alternate on each city day, the reading is the check's (the profiler's moving average at the end of the window, the sections summed) and every
frame's update is kept:

```
node scripts/perf-outflow.mjs run    --out DIR --build base=/path/to/old --build new=/path/to/new --q low --days 4,11,18,25 --settle 55 --frames 111
node scripts/perf-outflow.mjs report --out DIR --q low --moment 23:00
```

`report` prints, per build, the first window's reading (the one the check takes: mean, p50, p90, worst), the reading of every window, the frames over
4 and 8 ms (the OS-preempted ones counted apart) and the sections of the first window. `--settle` is the frames between standing up at 23:00 and the first
measured one (the check's take 50-60; 90 shows a later window). `PERF_PROF=<moment>` writes a V8 CPU profile of that moment, `PERF_HEAP=<moment>` an allocation
profile, `PERF_FRAMEPROF=<moment>` a profile in which each frame is a function of its own name, `PERF_REST=1` times the parts of the rest of the update apart. The host
(`tests/perfHost.ts`) now also mirrors what main.ts asks in the stretch of the frame that it called `rest of update`: the modules' presence fields, `findNearest`, the prompt of the focus.

**What the bursts were** (each measured in node in the frame it fell in, then taken out):

| Burst | Where | What it was |
| --- | --- | --- |
| The half-second reconcile | `AmbientLife.reconcile` | The fight-talk module sets the Dibi's event every two seconds with an object of its own: `[...ACTIVITIES, ...event.acts]` was a new array each time, so what every spot offers every activity was worked out again for all of them (2-5 ms), and the demand plan allocated its rows. Then the people: up to five route searches in one frame (a walk in, a walk out, 0.4-3 ms each, the first of a kind up to 20), and the Dibi, which nobody can walk to at that hour, was asked again three times every half second (44 failed arrivals in 90 frames). |
| People leaving | `AmbientLife.leave`, the checkout | Every person over a quota left in the same frame, each with its route search. |
| The spots' rebuild | `buildSpots` | When a place opens or closes (a vendor at 22:xx) the registry's signature changes and all the spots were built again in one frame: 15-19 ms. |
| First bodies | `AmbientLife`, `Crowd` | A full body is a skinned clone (2-8 ms), made in the frame a person first needed one: a new full body of the ambient life, a person of the street walking into the crowd's near circle. |
| First vehicles | `ArenaStreets` | The first time each taxi, sedan, moto (with or without the fan on the back) and parked-car model was drawn: 4-6 ms each, 20-30 models, in the middle of the evening. |
| Route search | `collidersClear`, `entries` | 769 colliders tested at 30 cm along every segment, the nearest sidewalk stretches sorted for every end of every route: 0.2-1 ms a route. |
| Bodies nobody sees | `Humanoid.animate` | On low there is no shadow pass: a body out of the camera's view still ran its mixer at 5 Hz; a hidden one (a far figure stands in for it) at 2 Hz, to hold a pose that had not changed since the clip started. |
| Smaller | `climbHeight`, `Impostors.addMatrix`, `curve`, `curveAt` | A sine and a cosine per body per frame, a matrix copy per figure, an iterator per call of the per-frame curves. |

Of the multi-millisecond single events left in a section (35 in the final runs), 19 fell in a frame where the JS heap dropped: a young-generation collection
(1-5 ms, now about every 80 frames; every 50 before) is attributed to whatever section runs.

**What changed** (each commit has the details):

| Change | Where |
| --- | --- |
| **A path budget.** One route search a frame (`PATHS_PER_FRAME`, more for a frame that covers more time); the reconcile only decides (`leaving`, `plan`), `work()` spends the budget: people sent off one after the other, arrivals one person at a time (a group keeps its leader), the checkout's wait and the cast's places not waiting (`force`). A spot nobody could walk to is not asked again for 8 s (3 s when it was the place that failed). Hour jumps and the far spots still settle everybody at once | `src/social/ambientLife.ts` |
| **The event kept.** The same event (activities, tags, boost) is the same object: the plans stay. What a spot offers the activities (`SpotPlan`) is kept per spot and carried over a rebuild for the spots that did not change; `curveAt` and `planDemand` allocate nothing per call | `src/social/ambientLife.ts`, `src/social/ambient.ts` |
| **The rebuild in steps.** `buildSpotsSteps` is a generator (it yields after each place, each legacy place, every eight seat groups, before the corners); `buildSpots` runs it to the end. The ambient life runs ten steps a frame (about four frames), people keep their spots until the new ones are there, the shops are found once per hub, a shop's paths are cached | `src/social/ambientSpots.ts`, `src/social/ambientLife.ts` |
| **Bodies ahead.** The ambient life makes one pooled body a frame after the first build, until its budget; a crowd keeps the bodies of those who walked away (`Humanoid.reset()`, `setLook` dresses the next) and makes one spare a frame | `src/social/ambientLife.ts`, `src/crowd/crowd.ts`, `src/actors/humanoid.ts` |
| **Models ahead.** `WarmQueue` (`src/game/warm.ts`): first-time jobs listed when a hub loads, a few a frame (two jobs, 8 ms). The arena's streets list every taxi, sedan, moto and parked-car model (`vehicleKey` says which model a seed picks without making it); done in 7 (low), 10 (medium) and 14 (high) frames after the hub loads | `src/city/arena.ts`, `src/actors/vehicleKit.ts` |
| **Route search.** `collidersClear` keeps a flat copy of the tall boxes (looked at again once a frame: the epoch), finds with the slab method which of the 30 cm points can be inside which box and tests only those, with the very test of old; `entries` on typed arrays, the nearest taken as needed (same order, ties included). `tests/planPath.test.ts` keeps the first implementations as the reference | `src/social/routines.ts` |
| **Animation nobody sees.** Without a shadow pass (low) a body out of the camera's view is a hidden one (`setAnimShadows`, set by `applyQuality`); a hidden body whose clip's pose has settled (0.3 s since the clip started) is not asked of the mixer until the clip changes or it is drawn again (then all the time it owes in one update) | `src/actors/humanoid.ts`, `src/main.ts` |
| **Small things.** `climbHeight` keeps the sine and cosine and answers null beyond the last step; impostors write their arrays directly; `curve` without destructuring; the periodic jobs of the ambient life start apart (0, 0.7, 0.4, 0.9 s: with frames of a tenth of a second the half-second, one-second and two-second ones fell on the same frame) | `src/world/arenaModules.ts`, `src/actors/crowdLod.ts`, `src/city/rules.ts`, `src/social/ambientLife.ts` |

Tests: `tests/outflow.test.ts` (the warm queue, `curveAt` and the cached demand plan against the first implementations, `buildSpotsSteps` against `buildSpots`, `climbHeight`,
`vehicleKey` against the geometry a build shares, the crowd's spare bodies), `tests/outflowBudget.test.ts` (the whole hub from 21:00 to 23:00: at most one route search a frame, a place that opens
is built in several frames and is then there), `tests/animLod.test.ts` (the hidden body left alone, back with all it owes; no shadow pass; `reset()` poses as a new body), `tests/planPath.test.ts`
(`collidersClear` on segments along an axis, through thin boxes, per epoch).

**Before → after**, same machine, same host, the two builds run one after the other for each city day (the reading at the end of the first window of each run: mean, 90th percentile,
worst; every window: the three windows of the 23:00 run; frames over 4 / 8 ms of the update; the OS-preempted frames left out). 23:00 outflow, 12 city days at settle 55 and 6 (low) or 12 (medium) at settle 90; high 6 days:

| Preset | Windows | Reading mean | p90 | worst | Every window: mean / p90 / worst | Frames > 4 ms | Frames > 8 ms |
| --- | --- | --- | --- | --- | --- | --- | --- |
| low | 18 | 3.21 → 2.53 | 3.80 → 3.19 | 4.16 → 3.21 | 2.83 / 3.36 / 4.16 → 2.50 / 3.03 / 3.23 | 10.4 % → 3.1 % | 7 → 5 |
| medium | 24 | 4.16 → 3.86 | 4.91 → 4.84 | 5.29 → 5.27 | 3.95 / 4.79 / 5.33 → 3.62 / 4.50 / 5.27 | 40.9 % → 30.0 % | 74 → 15 |
| high | 6 | 4.97 → 4.21 | 6.34 → 4.73 | 6.34 → 4.73 | 4.71 / 5.82 / 6.34 → 3.98 / 4.63 / 4.73 | 65.5 % → 40.6 % | 34 → 3 |

The ambient life's share of the low reading went from 0.49 to 0.23 ms (medium 0.53 → 0.37), the exterior's from 0.26 to 0.16 (medium 0.48 → 0.36), the venues' 0.21 → 0.15, the crowd's 0.32 → 0.27 (medium 0.66 → 0.58);
the walkers/traffic/life/world line 0.13 → 0.08. Node's readings are about those of the browser's profiler 1.2 times lower at 23:00 on low (the base read 3.2 mean, 4.16 worst here, 3.44-4.33 there).

Not worse at the other moments (12 city days; first window; mean, p90, worst):

| Preset | 17:30 arrivals | 19:00 bout |
| --- | --- | --- |
| low | 2.66 / 3.16 / 3.36 → 2.17 / 2.63 / 2.83 | 2.52 / 2.86 / 2.88 → 2.37 / 2.84 / 3.16 |
| medium | 3.87 / 4.79 / 4.85 → 3.55 / 4.08 / 4.09 | 3.21 / 3.71 / 3.76 → 3.11 / 3.64 / 4.09 |
| high (6 days) | 4.28 / 4.89 / 4.89 → 3.69 / 4.02 / 4.02 | 3.63 / 3.96 / 3.96 → 3.10 / 3.77 / 3.77 |

(The 19:00 worst went up by 0.3 on low and medium in one run each: a single event in the bout's frames (the arena module, `walkers+traffic+life+world` 4.9 ms once), as many in the base's runs; the means went down.)

**The rest of update.** The browser's `rest of update` read 0.63 then 1.31 ms at 23:00 on the same build (node: 0.26-0.35). The Pacer cannot be in it: outside the arena's walls `pacer.step` returns the frame's time at once, and
the memoised clock is cheaper than the clock it replaced (`cityTimeAt` is called once a frame). What main.ts does in that stretch and the host did not, now mirrored (presence fields, `findNearest`, the prompt's affordances twice
a frame), adds 0.03 ms in node; the HUD's goal line (refreshed every 250 ms of wall time, so at every frame of the check, whose frames last 0.2-1.4 s) was timed apart: 2 µs here, where the gala is not over, and a scan of the hub's places after it. What node cannot see is the DOM (the HUD, the bubble over the focus, the chat bubbles, the economy's panels) and the browser's own work in the frame. In node itself the section shows
an isolated 3-9 ms event about once in 2000 frames (5 in the final runs, three of them in a frame with a young-generation collection) and no doubling. The doubling was not reproduced and is **not fixed**; what the browser check should look at is below.

**For the browser check:**

- `rest of update` at 23:00 (the player standing at the gate among the crowd, a focus on a person): the HUD's prompt and bubble are the only DOM written every frame there (`hud.setWorldPrompt`'s transform, `setPrompt` compares a key); if it doubles again, `PERF_REST=1`'s split names the parts to time in the browser's profiler.
- People leaving the Dibi, the stops and the benches go one after the other (one a tenth of a second at the check's frame rate, one a frame at 60 fps): a crowd of six takes about 0.6 s to be all on its feet. A seated person asked to leave waits for its turn in place.
- The spots' rebuild takes about four frames after a vendor opens or closes: people keep the old spots till then, the new ones appear at once.
- A spot nobody can walk to (the Dibi at 23:00) is tried again every 8 s, not every half second: its customers come in fewer, later groups.
- On low, a body out of the camera's view is not animated at all once its clip is settled: when the camera turns to it, it takes the pose it owes in that frame (a walker out of view has walked on in position; its stride is from the clip's phase).
- The first seconds after a hub loads: the arena streets' models are made two jobs a frame (up to 10 ms a frame for 7-14 frames), one pooled ambient body and one spare crowd body a frame. They finish well before the 17:30 window's last frames (20 settled frames and 90 more).
- A crowd's reused body is `reset()` and dressed again (`setLook`): faces, hair, clothes, shoes, skin colour and size should be those of the person, not of the one before; the faces' details beyond 14 m come back within 14 m as before.
- Node cannot see: the DOM, canvas and texture uploads, shader compiles, the garbage collector of the browser's own heap, the rendering threads' share of the cores.

**Not fixed.**

- Medium. The mean fell by 7 % (8 % over every window), the frames over 8 ms from 74 to 15, but the 90th percentile and the worst of the first window did not move (4.84 / 5.27 against 4.91 / 5.29): they come from windows in which the whole frame is slow (the machine, the same in both builds) and from single events. What is left on medium is steady
  cost, not bursts: the street crowd 0.58 ms (its near bodies' mixers and gait, `Crowd.update`, the routes of the people leaving), the exterior's 0.36 (fans walking out: 70 % of it is `Humanoid.animate`), the arena streets' 0.39, the
  ambient life's 0.37, the rest of update 0.35. A body in full detail costs 25-50 µs a frame; the tiers update every frame at the check's 10 frames a second. Next: the gait's allocations (`gait.ts` `update`/`swingPose`/`target`: about 45 kB a frame of the 400 kB medium allocates), the iterators of the per-frame loops (about 44 kB), `motoTrip` (11 kB a frame, a trip rebuilt for each of 30 lattice slots), and the Euler synchronisation of every bone's quaternion (`onQuaternionChange`, 2-3 % of the frame).
- Single events: `galaTraffic` (the jam's timeline, the riders on the car rapide's step: 3-5 ms, a few times an evening), `arenaExterior` (4-5 ms once), the car rapide's passenger changes (`transport`, 1.7-3 ms: each passenger set of each car is built the first time it is drawn; they could be listed in the `WarmQueue` as the arena streets' models are), a cold path of the focused target (`ui-world`, 12 ms seen once), `eveningCall` saving the game (7 ms, the once-an-evening call), the first plan after the Dibi's event starts (4 ms seen once, in the first reconcile: every spot's offer for the event's activities is worked out for the new array).
- The browser's `rest of update` doubling (above).
