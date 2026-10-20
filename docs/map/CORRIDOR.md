# Roads between districts: how they work, how they were checked

Branch `feature/maplibre-corridor-20261020` (from the integration candidate `d9f46be`). Plan and file ownership: `PLAN.md`. Map data and licences: `PROVENANCE.md`.

## What a player gets

Pikine ↔ Almadies (1.48 km, from Pikine's west street) and Pikine ↔ Plateau (1.18 km, from Pikine's south street) are real, continuous roads. The player drives the **same owned car or motorbike** the whole way, keeps the wheel (or gets out anywhere, walks, gets back in), meets traffic in both directions and roadside life, arrives in the other district's own street, and can turn round and drive back. No loading screen, no teleport, no map jump. Save v6, `HubId` and the multiplayer protocol are unchanged.

## How it works

* **A road is data** (`src/road/routes.ts`): control nodes in the first district's frame, a bend radius, anchors to real places, junctions, the roadside profile along it. `Road` derives a centre line (`Spine`, bends rounded by `fillet`), the drivable ground (`Ground`: capsules round the centre line and the junction arms) and the offset between the two districts' frames.
* **Two frames, one translation.** Both ends of a road face the same way, so the second district's frame is the first's moved by `(dx, dz)` (Almadies: `1665, −48`; Plateau: `190, −1387`). Crossing the middle of the road changes only which district is loaded: heading, speed, steering, camera and the vehicle's state are not touched (the same rule as #51's border road). The swap is on a plain stretch, 591 m / 886 m from the ends (beyond the 300 m fog), with 14 m of hysteresis.
* **Chunks** (`chunks.ts`): 100 m of road each, deterministic from their index, 3–5 merged meshes, their own colliders. Streamed round the player (nearest first, one a frame, freed beyond 470 m). They live in the road's own frame under one group; the swap moves that group, nothing is rebuilt.
* **Collision.** `HubWorld.corridors` extends the district's `bounds`: the owned vehicle's `blocked`, the walker's clamp and `resumeSpot` (reload on the road) ask it. Stalls, lamps, poles, parked vehicles are real colliders; the carriageway and both lanes are guaranteed clear (unit-tested for every chunk).
* **Traffic** (`traffic.ts`): kit vehicles both ways, right-hand lanes, slowing and stopping behind a car, a parked vehicle or a solid thing; their footprints are solid for the player's vehicle (`transport.addObstacles`).
* **Vehicle carry.** `OwnedVehicleModule.corridorCross` records the pose in the new frame (as `cross()` does at a border), `hubLoaded` re-seats the player. A vehicle parked on the road is re-homed to the new district's frame at each swap (`corridorSwap`, `main.ts`), so it is never duplicated or lost.
* **Streaming the next district** (Phase 3). `buildHub` is now `buildHubSteps`, a generator with 18 pause points. Once the player is 130 m out on a road the district at its other end is built ahead, 4 ms a frame; when done its meshes are drawn once, off screen (1 × 1 pixel, a layer the player's camera ignores), so buffers and textures are on the GPU, and `compileAsync` links its programs. At the swap, `loadHubStaged` does only what must happen at once (the vehicle's `hubLoaded`, the player's place); crowd, traffic, people, interiors and every other module's `hubLoaded` follow a few ms a frame (`hubLoadedSteps` lets a module split its own load: venues does, one venue a step). Modules not yet loaded are not updated, so none runs on a half-built district. Disposal of the old district comes last. `?nostage` restores the old all-in-one swap for comparison.

## Adding a road

Add a `RouteDef` to `ROUTES` (two districts, nodes, anchors, junctions, profile) with matching end headings. Nothing else: `roadsOf(hub)` attaches it, the host streams it, the swap, the carry, the map layer and `scripts/check-corridor.mjs` (`ROAD=<id>`, one line in its table) follow. Pikine ↔ Plateau was added exactly like this.

## Measurements (software renderer, NOT an iPhone)

Headless Chromium + SwiftShader on a shared 2-core VM (frames of 140–190 ms median): absolute numbers say nothing about a phone; the comparisons on the same machine are the evidence. `scripts/perf-corridor.mjs` (real touch, both directions, medium quality), medians of one run each:

| | Pikine → Almadies | Almadies → Pikine |
|---|---|---|
| Swap frame, old (`?nostage`) | 849 ms | 1 600 ms |
| Swap frame, now | 34–47 ms | 25–32 ms |
| Longest gap between two frames in the run, old | 1 085 ms | 2 638 ms |
| Longest gap, now | 560–780 ms | 1 335–2 150 ms |
| Build ahead (CPU) | 280–310 ms over 74 steps of ≤ 4 ms | 500–620 ms over 74 steps |
| Longest single step of the staged load | 57–74 ms | 334 ms (venues) |

Reading them honestly: the swap frame is 25–50 times cheaper and the build is no longer in a frame. What is left is not the swap: **shader link/compile** (about 400 ms per new program in SwiftShader: a CPU profile shows `getShaderInfoLog`/`getProgramInfoLog` and ~450 ms of garbage collection round the swap), plus the largest single module steps on the way back to Pikine (venues, estate, pikineDna). On a real GPU a compile is a small fraction of that and `compileAsync` runs it in parallel; I could not measure either here. Memory, Almadies → Pikine: the renderer holds both districts for a few seconds (geometries 99 → 196, textures 66 → 303 after the load; the old district's are freed at the end), JS heap 129 → 222 MB peak in this run. Chunk build: 12–23 ms slowest (a budget of one a frame).

**Not measured:** a real iPhone (frame rate, thermal, memory ceiling), a real GPU's compile and upload cost, the hosted multiplayer.

## What was checked (all with the real touch controls unless noted)

| Check | What it proves |
|---|---|
| `check-corridor.mjs` (both roads) | out and back: exactly one swap at the middle; pose, speed, seat, pad, engine, camera kept on every frame around it; stop at 250 m, get out, walk 14 m, get back in; arrival in the other district; same car (uid, paint, condition), one copy; reload with the car parked on the road and the player on foot beside it; multi-point turn-round; traffic in both directions |
| `check-corridor-moto.mjs` | the same with the Jakarta |
| `check-corridor-hazards.mjs` | traffic stops behind a vehicle parked in its lane; the car runs into what stands at the roadside, stops, is hurt, backs away |
| `check-corridor-online.mjs` | two real clients on local Workers/Durable Objects: the driver is in Pikine's room, then Almadies's after the middle and seen there; the connection dropped over the swap, the drive continues and the player is back online in the new room; back across the middle the other client no longer sees them |
| `check-geomap.mjs` | MapLibre not loaded until « Ville » opens, one WebGL context while open and none after (tab switch, phone close); bundled layers offline and the message; a served basemap style, its credit and the playable layer on top; markers, cards, waypoint |
| unit tests | geometry, anchors and their inverses, OSM extraction on a fixture, every chunk's lanes clear, view streaming and rebase, swap logic |
| `scripts/profile-swap.mjs`, `perf-corridor.mjs` | the numbers above |

## Known limits

* Hand-placed, approximate geography (see PROVENANCE): the roads are in the right order and the right part of town, not surveyed; the OSM extraction has not been run on real data.
* One observed flake: in one of five full runs the car stalled for a minute 114 m from Pikine on the way home with a traffic car stopped behind it; not reproduced in the following runs; diagnostics are in `scripts/lib/roadDrive.mjs`.
* A car parked within the swap's 14 m margin is re-homed at the swap; a vehicle left far out on a road is only drawn while a district whose frame contains it is loaded.
* The corridor traffic is visual and physical only (nothing saved or shared), like the districts' own.
