# Asset import pipelines (vehicles, furniture)

Two reusable pipelines turn GLB files from any source (a free kit, a Meshy generation, a Blender export) into game assets that **plug into the systems the game already has**. Neither changes ownership, driving, parking, placement, shop or save code beyond one seam each. Both are checked by scripts and tests, and both refuse or warn instead of guessing.

Tooling: `@gltf-transform/*`, `sharp`, `meshoptimizer` (dev dependencies). Everything runs offline from files on disk.

## Vehicles: `scripts/vehicles/`

A player-owned vehicle keeps its kit spec (seats, doors, cameras, handling, parking, save). Only the look is replaced, so the new model is **fitted to the kit's numbers**.

```
npx vite-node scripts/vehicles/kit-target.ts sedan 14 > assets-src/vehicles/target-compacte.json   # what to meet
node scripts/vehicles/prepare-vehicle-glb.mjs assets-src/vehicles/compacte.pilot.json              # fit, build, verify
node scripts/vehicles/check-pipeline.mjs                                                         # the pipeline's own gates
node scripts/vehicles/shoot-pilot.mjs | perf-pilot.mjs                                           # pictures, cost (dev server / preview)
```

The manifest names the source GLB, the kit target, the wheel nodes (or a wheel library for a body without wheels) and whether it is a stand-in. The script:

1. turns the source to face +z with the left side at +x (`rotateY`) and takes the wheels out of it;
2. fits the **body** to the kit's length × width × height (per-axis scale; the stretch is printed and the build **fails above 1.12** unless the model is declared a stand-in);
3. puts **four separate wheels** at the kit's axle positions and radius: `axle_<fl|fr|rl|rr>` (at the hub, the front pair turns about Y to steer) `> wheel_*` (spins about X);
4. writes `public/assets/vehicles/<id>.glb` and a sidecar `<id>.json`, re-reads the GLB and checks: wheel count, hub position, radius and width, tyre bottoms on the ground (±2 mm), overall size within 2 cm of the kit's, head room at the driver's seat, whether the **cabin is hollow** (a ray from the driver's eye crosses an even number of surfaces; a solid shell gets the shared cockpit), triangle / draw-call / texture / file budgets. Exit code 1 if a check fails.

A generated car is one fused shell with its wheels on it: `scripts/vehicles/split-fused-body.mjs <manifest>` first cuts the four wheels out (found from where the tyres touch the ground) and paints out badges, plates and lettering (boxes in `*.paintout.json`), writing the `wheel-*` + `body` source this script expects; the manifest then sets `wheelFit: "own"` (its own hubs and radius, checked against the kit's), `bodyWidthPercentile` (fit the width without the mirrors), `cull` (a visibility list from `scripts/vehicles/visible-triangles.mjs`: triangles nobody sees from outside, the wheels never), `simplifyWheelTris`, `cockpit: true`, `textureFormat`. Normals are smoothed across UV seams (creases kept). `scripts/vehicles/shoot-glb.mjs` renders any GLB from six views.

Runtime (`src/actors/glbVehicle.ts`): loads the GLB, makes its materials Lambert (the game's cheap lighting), rigs the wheels, and `animateVehicle` (called every frame by the owned vehicle) delegates to the rig. The model takes the kit vehicle's group and `vehicleSpec`, so night lamps, minimap and the rest are unchanged. **Used by default**; `?vehicleModel=kit` on a local / preview host forces the procedural model for comparison, and a missing file falls back to it. A solid shell has no cabin to sit in, so it gets the **shared cockpit** (`src/actors/cockpit.ts`: dashboard, a steering wheel that turns, pillars, header, headliner, mirror; two meshes, one material, under 500 triangles) drawn only in the « Au volant » view: no camera is ever dropped. `scripts/vehicles/shoot-cockpit.mjs` pictures it.

Not yet handled: two-wheelers (the fork and handlebar must steer: a fused shell cannot do it without a manual cut), a far LOD, paint variants, lamps of the model's own.

## Furniture: `scripts/furniture/`

```
node scripts/furniture/import-furniture.mjs assets-src/furniture/<pack>.json [--only=a,b] [--dry]
node scripts/furniture/unpack-zip.mjs <pack.zip>                           # raw ZIP into assets-src/furniture/packs/ (git-ignored)
node scripts/furniture/import-furniture.mjs <pack.json> --list             # what the rules make of every model, importing nothing
node scripts/furniture/check-pipeline.mjs                                  # classification, normalisation, seats, variants, ZIP intake: on synthetic fixtures
PACK=<folder> node scripts/furniture/check-import-ingame.mjs               # buy, deliver, place, sit, reload, pack absent: in the real game
```

A pack manifest names the folder of GLBs (or a list), licence, output folder (`public/assets/furniture/<pack>/`) and per-model overrides. `scripts/furniture/categories.json` holds the rules; all of them are data you can edit:

- **Classify** from the file name (type, French name, placement, seating). A model matching a `skip` rule (wall, door, stairs, things that stand on other things) is skipped with its reason; a model matching nothing is listed as **unclassified**. Nothing is guessed.
- **Normalise**: lights and cameras dropped; metres (a plausibility range per type warns on a wrong unit, it never rescales silently); the front towards +z (found from the geometry for seats and beds: the back is the taller side across the middle of the width); origin on the floor at the centre of the footprint; one mesh.
- **Measure**: footprint w × d × h (the collision footprint the home editor uses), seat surfaces from the upward-facing geometry (`FurnitureSeat` form: sofa seats spaced like the catalogue's, one chair seat, one lying seat on a bed), the standing spot in front (interaction anchor).
- **Flatten materials** for the game's lighting: base colours and base-colour textures only; `KHR_materials_variants` and sheen resolved to plain colours; textures ≤ 512 px; meshes merged by material; **simplified** to the triangle budget (2 500 by default).
- **Price on the existing ladder** (`categories.json` `ladder`: the catalogue's own anchors per type and grade, scaled by footprint) and **copy the effect** of an existing piece of the same type and grade (`useFrom` / `sleepFrom`): an imported piece adds no new income or needs effect.

Runtime (`src/economy/furnitureImport.ts`, `registerFurniture` in the catalogue, one seam in `furnitureModels.ts`): the index becomes catalogue entries on the **existing** ownership model, shop (Keur Meubles, by room), placement editor and save (catalogue ids only: save v5 unchanged). A material variant is a catalogue entry that shares the piece's GLB. Packs come from `public/assets/furniture/packs.json` (empty today) and, on test hosts, `?furniturePack=<folder>`; a pack declared `shipping: false` is refused anywhere else. Four furniture types were added (`shelf`, `appliance`, `bath`, `decor`) with their shop rooms.

An id that is already in the catalogue is never replaced, and **a pack that has shipped must never lose a piece** (a save that owns it keeps its id; without the pack the piece is kept in the save but cannot be shown).
