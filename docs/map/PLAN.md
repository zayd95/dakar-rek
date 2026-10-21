# MapLibre city map and continuous driving: implementation plan

Branch `feature/maplibre-corridor-20261020`, from the integration candidate `d9f46be`. Isolated: nothing here touches production, PR #56 or PRs #46–#50, and the Cloudflare configuration is untouched.

## What was audited (and what it means)

| Existing code | Finding | Consequence |
|---|---|---|
| `src/ui/fullmap.ts`, `minimap.ts`, `minimapMath.ts` | Canvas map of the **current** hub only; `mapBridge` carries hub, places, player, waypoint (`walkTo`). `phone.ts` mounts it in « Carte ». | Keep it as the « Quartier » tab. Add a « Ville » tab beside it. MapLibre is lazy and released on close. |
| `src/transport/hubLink.ts`, `ownedModule.ts` (#51) | A border-road crossing rebuilds the next hub in one synchronous frame (`crossHub` → `loadHub`), keeping speed, steering, odometer, camera. Only Almadies ↔ Corniche, hubs laid end to end. | The corridor reuses the idea (translation-only swap, the module carries the ride) and the hooks (`crossHub`, `carry`). |
| `loadHub` (main.ts) | Measured (software GL, medium): `buildHub` 210–460 ms, module `hubLoaded` 175–870 ms (venues 170–300, estate 110, pikineDna 105–130, arena 65–75), crowd/traffic/people 40–230 ms. **0.4–1.4 s in one frame.** | Phase 3: build the destination ahead of the player in slices, swap in one cheap frame, finish loading in the frames after. |
| `HubWorld`, `builder.ts` | Hubs are 260 m squares on a 5 × 5 street grid, perimeter street at ±120/±127, `bounds` ±130, a 1400 m ground plane, fog 60–300 m. Edges are bare ground with the street's end. | The corridor starts where a perimeter street ends; the district frame has a rectangle of walkable ground, so the corridor needs its own collision hook. |
| Save v6 | The parked vehicle is `{hub: index into HUB_IDS, x, z, yaw}` in the hub's frame; `resumeSpot` drops positions outside `bounds`. | `HubId` and the save are **not** changed. Corridor positions are expressed in the frame of the nearest district (swap at the middle), `resumeSpot` learns the corridor, a parked vehicle is re-homed at each swap. |

## Design

**Geography (Phase 1).** `src/geo/anchors.ts`: one anchor per district (centre ↔ lng/lat, 5 real m per game m) and, per road, anchors paired with real places (arc length ↔ lng/lat, about 9 : 1). Pure, unit-tested, with exact inverses. `src/ui/geoMap.ts` draws on MapLibre: bundled coast + reference layer offline, OpenFreeMap vector basemap online (optional), the playable layer on top. DOM markers for labels (no font server). `docs/map/PROVENANCE.md` has the data, licences and what could not be done.

**Roads (Phase 2).** A road is a centre line (`Spine`, bends rounded by `fillet`) and a ground (`Ground`, a union of capsules, with junction arms). The ends of Pikine ↔ Almadies both face west so the two district frames differ by a translation only: the swap changes nothing about heading, speed, steering or camera, the same rule as #51. The swap is on a plain stretch, 590 m from Pikine and 890 m from Almadies, beyond the fog.

```
Pikine (x−127, z−60) ── west ── dip south ── Patte d'Oie ── Foire/VDN ── Yoff·Ngor ── west ── Almadies (x+127, z−60)
        0 m                      WSW leg 690 m   751 m        984 m         1228 m          1477 m
                                       ▲ swap at 590 m (hysteresis 14 m)
```

**Streaming (Phase 3).** The corridor is streamed in 100 m chunks around the player (built ahead, disposed behind, one chunk a frame at most); chunks are small merged meshes, a few draw calls each, with their own colliders registered in the hub's `colliders` and removed with the chunk. The destination district is **built ahead** (`buildHub` made a generator that yields between blocks and runs in 4 ms slices once the player is past 25 % of the road) and the swap frame only exchanges the groups and places the player; the rest of the load (crowd, traffic, people, each module's `hubLoaded`) is spread over the next frames within a per-frame budget, critical modules (the owned vehicles) first. Modules not yet loaded skip their `update`.

**Driving.** The same `OwnedVehicleModule` drives everywhere: `blocked` asks `world.corridors` besides `bounds`; the player's on-foot clamp does the same; `resumeSpot` accepts a corridor position. Traffic on the road (kit cars and motorbikes, both directions, right-hand, braking for what is in front) registers its footprints with `transport.addObstacles`; stalls, parked cars and poles have real colliders. Stop anywhere, get out, walk, get back in: nothing special, it is the district's own mechanics on a longer ground.

## File ownership

| Area | Files | New / changed |
|---|---|---|
| Geo | `src/geo/anchors.ts`, `dakarData.ts`, `osmExtract.ts`, `data/land.json`; `scripts/geo/extract-osm.ts` | new |
| Map UI | `src/ui/geoMap.ts`, `geoMapHtml.ts`; `phone.ts` (tabs), `minimap.ts` (`mapBridge.owned`), `minimap.css` | new / small edits |
| Roads | `src/road/network.ts`, `routes.ts`, `chunks.ts`, `traffic.ts`, `corridor.ts`, `host.ts` | new |
| Engine hooks | `src/world/types.ts` (`corridors`), `builder.ts` (generator), `main.ts` (host, staged load), `core/save.ts` (`resumeSpot`), `transport/ownedModule.ts` (`blocked`, corridor swap carry), `game/modules.ts` (hook) | **shared integration files: small, reviewed edits** |
| Checks | `scripts/check-geomap.mjs`, `check-corridor.mjs`, `film-corridor.mjs`; `src/road/*.test.ts`, `src/geo/*.test.ts` | new |

Shared integration files are edited minimally and are listed here so the Visual Pass integration owner can review them first.

## Phases and what ships

1. **Phase 1**: geo anchors, data, extraction pipeline, MapLibre « Ville », docs. 
2. **Phase 2**: Pikine ↔ Almadies, playable end to end, both ways, with the same owned vehicle, traffic and roadside life.
3. **Phase 3**: streaming and the staged swap; frame-time and memory measurements, software-renderer caveat stated.
4. **Phase 4**: Pikine ↔ Plateau through the same `Road` registry; no transition code is duplicated (a road is data).
