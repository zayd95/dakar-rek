# LD2.0-D « Owner flagship villa »

**The brief:** « Build the aspirational Almadies residence. »
- **The plot:** about 500 m², a modern premium Senegalese villa.
- **Outside:** two full storeys, a gated entrance and boundary wall, a driveway and SUV parking, a landscaped compound, a large pool, balconies and terraces, an accessible rooftop with a helicopter landing area and a parked helicopter.
- **Inside:**
  - ground floor: entrance, lounge, dining, kitchen, guest bathroom, guest room or office, pool access;
  - first floor: master suite with wardrobes and bathroom, family lounge, bedrooms, balcony;
  - rooftop: staircase, terrace, helicopter area.
- **Interactions:** walk both floors, open doors, sit and use furniture, a simple pool interaction, park and retrieve the SUV, furnish and decorate, invite friends from Messages, host a small gathering.
- **The owner:**
  - a protected owner-only showcase in a private build, never through editable usernames or client flags;
  - normal players can buy the same villa with in-game money.

**The acceptance:** walk from the gate to the entrance → tour the ground floor → climb upstairs → reach the rooftop → visit the pool → park the SUV → furnish a room → invite another player → verify persistence.

**Branch:** `integration/ld2-d-20261026`, from LD2.0-C (`integration/ld2-c-20261026` at `9a6478c`, after the catalogue's second round). Nothing is merged or deployed.

## What exists (the survey, 26 Oct)
- **The home:** `villa_almadies` « Villa avec piscine · Almadies »:
  - 400 M F, or 120 000 F a day;
  - lot 3 of the Almadies block (1,1), gate ≈ (−18, −7.3);
  - its street side is one of the builder's generic villas;
  - inside, one open 14 × 10 m room off the grid (x 1780).
  - A lot is 22 × 22 m (484 m²): « about 500 m² ».
- **One floor only:**
  - Indoors, y is 0.1 everywhere: `main.ts`, `apartment.ts`, `estate.ts` and `homeEditor.ts`.
  - Outdoors, height is a 2D heightfield, so storeys cannot overlap.
  - The player's collisions are 2D: `pushOut` ignores `Collider.h`.
  - Nothing has stairs. The Ngor island rooftop is only seen from the boat.
- **Vehicles:**
  - The SUVs are the Lamane Sport (`tout_terrain`, 70 M F) and the Gaïndé (65 M F).
  - A parked car's place is saved (`vehicle:<asset>:hub|x|z|yaw`).
  - `moveParked` re-parks a car; the arena's moto parking uses it.
  - There is no home parking.
- **Aircraft and water:**
  - No helicopter model, no pad and no flight; the jet is « bientôt » and must not start yet.
  - No swim clip and no water entry; the street villas' pools are decorative.
- **Visits:**
  - The principal residence is invited through Messages (LD2.0-B).
  - A guest's snapshot is `{x, z, rot}` per piece, |x|, |z| ≤ 30 m, ≤ 160 pieces.
  - Guests may only sit and use the TV and the radio.
  - There is no party or NPC guest system; the instanced `Crowd` (the island rooftop's) is reusable.
- **Owner gating:**
  - `?debug` works on every host, and the save is local, so a client-side owner flag is not safe.
  - `VITE_*` values are compiled into the bundle.
  - The private single-file build (`vite.artifact.config.ts`) is the owner-only preview, a private claude.ai artifact.
- **The economy:** the ventures run from the bana-bana (50 000 F, 400 F/h) to the immeuble (200 M F, 1.15 M F/h) and the grande entreprise (1 Md F, 5.4 M F/h). A 400 M F villa is a long-term goal that can be reached.

## Decisions
1. **The flagship is `villa_almadies`**, on its own lot (22 × 22 m).
   - The same id: owners and renters keep it.
   - Their furniture is re-checked against the new plan on load (LD2.0-C's `settleFurniture`), moved to a room of its kind, never lost.
   - The price stays 400 M F, or 120 000 F a day.
   - The way to it is the ventures ladder; « Mes pistes » shows the villa as a savings goal once the player earns enough.
2. **Two spaces, one building:**
   - **The street compound,** in the Almadies hub at real coordinates:
     - the boundary wall, with colliders;
     - a sliding gate that opens for the owner and an invited guest;
     - the driveway with two parking bays, and the front garden;
     - the house's facade with its two storeys, balconies, rooftop parapet, helipad and helicopter, so it reads from the street.
   - **Behind the front door, the off-grid interior on three levels:**
     - the ground floor with the back garden and pool terrace;
     - the first floor;
     - the rooftop.
   - The facade is drawn from the same plan as the interior, so the two always agree.
3. **Levels in the floor-plan contract** (`src/housing/plan.ts`, version 2):
   - `levels: { id, name, y, dx }[]` and `Room.level`;
   - a `stair` opening between two rooms of adjacent levels, with its flight;
   - fixtures per level (pool, helipad).
   - **Plan space is unfolded:** each level's rooms sit side by side along x (ground floor dx 0, first floor dx +22, rooftop dx −22). A placement `{x, z, rot}` stays inside ±30 m, so neither the save nor the visit snapshot changes.
   - World = origin + (x − dx, level y, z).
   - The helpers: `levelOf(y)`, `toWorld`, `toPlan`, `groundAt` (a stair is a ramp), and `reachable` across stairs.
4. **The engine, small and shared:**
   - `Interior.groundAt?(x, z, y)` replaces the fixed y 0.1 indoors in `main.ts`.
   - `Collider.y0?`: `pushOut` ignores a collider outside the player's height band.
   - `Interior.update` hides the levels above the player (a cutaway).
   - The editor's plane and markers sit at the room's level.
   - `estate.syncHome` stands each piece on its level, its seat tops lifted by the level's y.
5. **Stairs:**
   - one straight flight per storey: 3.4 m rise, 17 steps of 0.2 m;
   - a handrail;
   - the stairwell's void above, with a railing round it.
6. **The SUV:**
   - Driving an owned vehicle into a villa bay offers « Garer à la villa »: `moveParked`, saved.
   - It is still there after a reload. « Monter » takes it.
7. **The pool** (the ground floor's back garden):
   - « Se baigner » at the edge: the player in the water up to the shoulders, a slow swim loop, then « Sortir de l’eau » (hygiene, moral).
   - The loungers sold at Keur Meubles go on the terrace.
8. **The rooftop:**
   - a terrace with a parapet and the helipad (an H in a circle, edge lights);
   - a parked light helicopter, our own procedural model (≤ 2 draw calls, ≤ 3 000 triangles);
   - « Regarder l’hélicoptère » says the flights come with the airport. There is no flight.
9. **A small gathering:**
   - « Organiser une petite réception », from the lounge or the pool terrace: 150 000 F of food and drinks (ceebu jën, bissap, thiakry).
   - About eight NPC guests (the instanced `Crowd`: chat and dance) on the terrace for two in-game hours, with music; moral and social go up.
   - Friends invited through Messages come in as today.
10. **The owner's showcase:**
    - Only in a private build: `VITE_OWNER_SHOWCASE=1` set at build time for the owner's preview, never in `.env.online` or CI.
    - The title screen offers « Vitrine du propriétaire ». It opens a separate showcase save, under its own storage key: the villa owned and furnished, the Lamane Sport in its bay, money to try things. The player's real save is never touched.
    - The public bundle compiles it out; a check confirms no showcase text is in it.
    - It reaches the owner as a private claude.ai artifact, which is also the iPhone preview of the single-player journey.
11. **Performance on a phone:**
    - a furnished level ≤ 60 draw calls and ≤ 80k triangles;
    - the street compound adds ≤ 25 draw calls to Almadies;
    - the helicopter ≤ 2 calls.

## The contract (commit « LD2.0-D contract »)
- **`src/housing/villa.ts`:** the numbers both lanes build to.
  - The lot is block (1,1) lot 3, centred at (−18, −18) in Almadies, 22 × 22 m. Plan coordinates have +z toward the street, as in a floor plan.
  - **The street side:**
    - the wall, 2.4 m high;
    - the sliding gate, x 1.5…6.5 on the street edge;
    - the front yard (z 4…11) with two parking bays (2.6 × 5.4 m, centres x 3.1 and 6.1, z 7.3, the cars facing the house).
  - **The house:** x −8…8, z −5…4.
    - The front door is at x −3 in its street wall, 1.2 m wide.
    - Storeys are 3.4 m; the parapet is 1.1 m.
    - The levels are `rdc` y 0 dx 0, `etage` y 3.4 dx +20, `toit` y 6.8 dx −20.
    - The stair core is x 4.6…7.8, z −4.8…1.4, the same on every level.
  - **The back garden:** z −11…−5, with the pool x −6…4, z −9.6…−6, 1.4 m deep.
  - **The balconies:** over the front door and over the pool deck.
  - **The helipad:** centre (−3, −0.5), radius 3.2.
- **`src/world/helicopter.ts`:** `buildHelicopter()`, a stand-in of its size that lane V-E draws.
- **`src/housing/villaFacade.ts`:** `buildVillaFacade()`, the house's volume, which lane V-S draws from the plan.

## Lanes (three agents and the integration owner)
- **V-S, the villa building:**
  - the plan contract version 2 and the villa's three-level plan;
  - the shell: walls, floors, stairs, doors, windows, balconies, rooftop, pool basin;
  - the facade generator for the street, from the plan;
  - the engine changes (`groundAt`, the colliders' height band, the cutaway);
  - furnishing on levels (placement, editor, `syncHome`);
  - tests and a walk check through the three levels.
- **V-E, the villa's life and the street:**
  - the Almadies compound: wall, gate, driveway, bays and garden, placed on the lot while keeping the builder's random draws;
  - parking and retrieving the SUV;
  - the helicopter model and its sheet;
  - the swim;
  - the gathering;
  - the owner's showcase build and save;
  - the savings goal.
- **Who edits what:**
  - **V-S:**
    - `src/housing/plan.ts`, `apartment.ts`, `villaFacade.ts`, and a new villa plan module;
    - `src/economy/homeInterior.ts`, `placement.ts` and `homeEditor.ts`;
    - in `estate.ts`, `syncHome` and the home's furniture;
    - the `villa_almadies` entry of `catalog.ts`;
    - in `main.ts`, the ground and collision lines;
    - `src/world/interiors.ts`, `types.ts` (`Collider.y0`) and `src/actors/camera.ts` if needed.
  - **V-E:**
    - `src/world/helicopter.ts`;
    - the street compound, a new module placed by `src/world/builder.ts` without changing its random draws;
    - in `estate.ts`, `buildVillas` and `VILLA_GATES`;
    - `src/transport/ownedModule.ts` and `owned.ts` for the bays;
    - new modules for the swim, the reception and the showcase;
    - the « Mes pistes » savings goal;
    - `vite.config.ts` and a title-screen entry for the showcase, only behind `import.meta.env.VITE_OWNER_SHOWCASE`.
  - **K-L** (see below): `src/world/furnitureKit.ts`, `src/world/furnitureAtlas.ts`, `src/economy/furnitureKitAdapter.ts`, and the furniture list and `FurnitureSpec` type of `catalog.ts`.
  - Anything else: ask the integration owner.
- **K-L, the « Collection Almadies »** (owner's request, 26 Oct: « Attached are furniture catalogues reference to make the furnitures more premium and luxurious »):
  - **The references:** three sheets the owner sent; they are not stored in the repository, as one carries a brand.
    - a modern-living set: wingback and tufted-leather beds, a curved sectional on a bronze plinth, marble tables, a round marble dining table, lacquered storage, a crystal ring chandelier;
    - ten modern sofas: bouclé, rounded, chaise sectionals;
    - a walnut-and-greige set with real sizes in cm.
  - **Today's Prestige grade is ornate and traditional** (red velvet, gold, carving). This line is modern and calm: cream bouclé, greige linen, walnut, black and white marble, thin bronze lines, low plinths with a shadow gap, rounded cushions.
  - **About 30 pieces**, all Prestige and marked `line: 'almadies'`, from 350 000 F to 7 500 000 F:
    - living room: three sofas, two armchairs, three tables, a TV stand, a sideboard, two bookcases;
    - two dining sets;
    - bedroom: three beds, two bedside tables, a bed bench, a dresser, a chest, a wardrobe, a dressing table;
    - a desk;
    - a ring chandelier, two floor lamps, a round jute rug, an oval mirror, a planter.
  - **Kit rules, as before:** ten new `lx` kit types in the three grades; one draw call (two with crystal); under 1 500 triangles; the footprint and seats from the kit. The atlas grows to 512 × 1024, with this line in y 768…1023. New ids only, no save change.
  - **Proof:** tests, a contact sheet of the line, and the pieces that fit in the F2, by day and at night with draw calls and triangles.
- **Integration:**
  - the contract commit (types, stubs, ids);
  - the acceptance `scripts/check-ld2d.mjs`: gate → entrance → ground floor → upstairs → rooftop → pool → SUV → furnish → invite a second player (two pages, local worker) → reload;
  - a « Collection Almadies » section in the catalogue, and the owner's showcase villa furnished with the line;
  - the regression, performance, pictures and the private preview;
  - for the owner (26 Oct): screenshots of the finished villa, a video of the playthrough (the acceptance, recorded and converted to MP4), and the playable private preview.

## Results (27 Oct)
- **The acceptance** (`scripts/check-ld2d.mjs`, two players on the local Workers runtime, phone pages, real touches): 17/17 on `9fee841` (the game built from `4d74126`: the commits between change the check only).
  - The journey: Awa buys the villa for 400 000 000 F of game money → the gate slides open for her → « Entrer chez toi » → the ground floor walked with the joystick (entrée, salon, the pool garden, salle à manger, cuisine, hall) → up the first flight (the landing, the salon familial, the master suite) → up to the roof terrace, « Regarder l'hélicoptère » → down to the pool, « Se baigner », « Sortir de l'eau » → the Lamane Sport driven in through the gate, « Garer à la villa » → thirteen pieces of the « Collection Almadies » delivered, the bouclé armchair moved in « Aménager » and placed → « Inviter chez moi » from Messages, Moussa accepts, the gate opens for him, « Entrer chez Awa (invité) », both in the villa, her furniture drawn for him → a reload: the villa hers and her home, every piece where she left it, the car in its bay → no page errors.
  - Pictures and the run's video: `docs/proof/ld2d/acceptance/`.
- **Fixed by the acceptance:**
  - « Regarder l'hélicoptère » lost to the home's own « Commander des meubles » by the pad: the aircraft keeps the player 2 to 3 m from the pad's centre, where its target is (`c9da1d6`).
  - The check itself: it opens the editor's list (« ☰ ») before picking a piece, moves it toward a spot the editor accepts, and its reload step reads the furniture from the save (`8673218`, `2c54929`, `4d74126`, `9fee841`).
- **Performance on a phone page** (390 × 844, SwiftShader, quality medium; budget: a furnished level ≤ 60 draw calls and ≤ 80k triangles):

  | Where | Draw calls | Triangles |
  |---|---|---|
  | Ground floor | 17 | 24 258 |
  | First floor | 22 | 24 650 |
  | Roof terrace | 26 | 23 164 |
  | Salon furnished (13 pieces) | 23 | 27 714 |
- **For the owner:**
  - the pictures (lane V-S's look pass, by day and at 21 h: `docs/proof/ld2d/villa-look/`; the street: `docs/proof/ld2d/street/`; the line: `docs/proof/ld2d/collection/`);
  - a smooth video tour (`scripts/video-villa-tour.mjs`: the game paused and stepped a 24th of a second a frame, so it plays at 24 frames a second);
  - the playable private preview: the owner's showcase build (`npm run build:showcase`), a private claude.ai artifact, single-player.
- **Limitations:**
  - the furnishing the game sets out by itself can leave a piece where the editor then says « Laisse le passage libre » (13 pieces in the salon, the dining room and the suite);
  - interiors are nearly as bright at night as by day; flat lighting;
  - the moucharabieh is slats, not a pattern; the same view in every window; the kitchen and bathrooms are simple;
  - the reception's guests are the city's simple crowd figures;
  - the gate moves on each player's screen by its own rule, not synchronised between players;
  - the Almadies street dressing is drawn anew around the villa (the mall's way in kept open);
  - not tried on a real iPhone.

## Round 2: the owner's review (27 Oct)
**The owner, on the screenshots, the videos and the preview:** « The villa look good but it needs a main door different from the car garage door and easy access without going behind the car, the swimming is not smooth and animated at all I want freedom to move and swim, the helicopter need more realism right now it look like a toy. Save all the assets for the villa we will replicate this design to other houses to give almadies the luxurious feel. »

**Decisions:**
1. **The main entrance** (lane R2-E):
   - A door for people of its own in the street wall, `ENTRANCE` (src/housing/villa.ts), in line with the house's front door; the sliding gate is left to the cars.
   - A grand entrance: a framed portal higher than the wall, a pivoting door (teak and bronze, like the house's), a canopy, the house number, an intercom, lights at night; it opens for the villa's people (the owner, a renter, an invited guest) by the gate's rule, and stays shut to others.
   - The walk from it to the front door (`ENTRY_WALK`) is a straight paved path through the garden, kept clear: no bay, car, palm, bed or bollard on it.
2. **The swim** (lane R2-W):
   - Free swimming: in the water the joystick moves the swimmer anywhere in the pool (held inside its walls), at a swimming pace; still, the swimmer treads water.
   - A real animation: a swim stroke and treading water as clips built in code with the rig's pose solver (src/actors/humanoid.ts), several keys a cycle, cross-faded; the body level with the water when swimming, upright when treading; ripples and a wake.
   - Smooth in and out: down the steps at the west end, or « Se baigner » at an edge (a short blended slide in); « Sortir de l'eau » at any edge, or up the steps.
   - The gains, the debug hooks (`__dakar.villa.swim`) and the rule of who may swim stay as they are.
3. **The helicopter** (lane R2-H):
   - The proportions of a real light single-engine helicopter (no maker's model or brand): a sculpted cabin and engine fairing, tinted wraparound glazing with reflections, a tapered tail boom, a stabiliser with end plates, a shrouded or open tail rotor, a three-blade main rotor with its hub and droop, skids with cross tubes and steps, doors, vents, antennas, navigation lights, a Senegalese registration.
   - Paint and glass that catch the light (metallic paint, glossy glass), within a phone's budget: at most 4 draw calls and 12 000 triangles.
4. **The Almadies villa kit** (lane R2-E, after the entrance; « save all the assets »):
   - Every piece of the villa as a named, reusable builder with its parameters (the plan, the facade and its finishes, the wall, the car gate, the main entrance, the bays, the garden, the pool, the pergola, the helipad, the helicopter, the furniture layout), so another Almadies lot can be built from it.
   - A catalogue (`docs/kits/`) with a picture of each piece, and each piece saved as a 3D file (GLB) beside it.
   - Building other houses from the kit is the next step, once the owner has seen it.

**Lanes:** R2-E (the main entrance, then the kit), R2-W (the swim), R2-H (the helicopter); the integration owner merges, runs the acceptance (its first step now walks in by the main entrance), the pictures, the videos and the preview.

### Round 2 results (27 Oct)
- **Merged:** R2-W `bf941e5`, R2-H `ab398f7`, R2-E `429c510` (the last change to the game); after it, the checks and the video tour only.
- **The acceptance, 17/17** (`scripts/check-ld2d.mjs`, two players on the local Workers runtime, phone pages, real touches; the game built from `429c510`):
  - 1a: Awa walks up from the street to the main entrance; it swings open for her while the car gate stays shut; she walks up the path, and the door shuts behind her.
  - 5: in the water the stick steers her across the pool (3.6 m, the stroke), she treads water once it is let go, swims back, « Sortir de l'eau ».
  - 8b: Moussa, the invited guest, comes in by the same door.
  - The rest as in round 1: the floors, the roof, the car in its bay, the Collection, the reload, no page errors.
  - Pictures and results: `docs/proof/ld2d/acceptance-r2/` (round 1's stay in `docs/proof/ld2d/acceptance/`).
- **Performance on a phone page** (390 × 844, quality medium; budget per furnished level 60 draw calls, 80k triangles):

  | Where | Draw calls | Triangles |
  |---|---|---|
  | Ground floor | 17 | 24 258 |
  | First floor | 22 | 24 650 |
  | Roof terrace | 29 (was 26) | 32 184 (was 23 164): the new helicopter |
  | Salon furnished (13 pieces) | 23 | 27 714 |
- **Unit tests and types** on the code of this commit (the game as at `429c510`): tsc clean; vitest 215 files passed (1 skipped), 2 751 tests passed (3 skipped).
- **The lanes' checks:**
  - the entrance, 33/33 (`docs/proof/ld2d/r2-entrance/results.json`); the compound, 14 draw calls and 15 288 triangles in a view of the entrance (budget ≤ 25);
  - the swim, 13/13 on each of the three bodies (`docs/proof/ld2d/r2-swim/`);
  - the street check (`scripts/check-villa-street.mjs`, updated below), 43/43 on the round-2 game (run without round 1's comparison against the contract's build);
  - the helicopter: 4 draw calls, 10 220 triangles (budget 4 and 12 000); `scripts/check-heli-roof.mjs` 6/6, the roof walked with real touches round it (`docs/proof/ld2d/r2-heli/roof-walk.json`); before and after pictures.
- **Fixed during integration** (the checks, not the game):
  - the acceptance and the video tour walk in by the main entrance;
  - the swim step waits for the swimmer to glide to a stop before it asks for treading water;
  - it swims back before « Sortir de l'eau »: the far end is by the steps, which take a swimmer out onto the west deck, across the pool from the house, where the walk to the dining room met the pool's wall;
  - the street check (`scripts/check-villa-street.mjs`) swam in round 1's debug basin, removed, and waited for a timer, gone: it now swims in the villa's pool and ends a long swim with « Sortir de l'eau ».
- **Limitations:**
  - other players see a swimmer as a standing figure;
  - the camera does not swing behind a swimmer; a hand can dip about 10 cm into a pool wall;
  - the helicopter's lights do not glow; it casts no shadow on the roof;
  - the main entrance and the car gate move on each player's screen by their own rule, not synchronised;
  - the kit: another `storeys` count changes the street view only (the interior keeps the flagship's three levels); the gate's collider assumes the flagship's orientation; the GLB files leave out the game's own shader touches (the grain, the travertine and oak detail maps);
  - round 1's limitations stand.

## Not in this slice
- Helicopter flights, the airport and the jet.
- Other villas and the Ngor residence keep their open room.
