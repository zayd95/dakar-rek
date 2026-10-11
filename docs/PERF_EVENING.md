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
