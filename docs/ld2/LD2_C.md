# LD2.0-C « Walkable Homes »

**The brief:** « Housing must stop feeling like four walls with furniture inside. » The first implementation is one complete apartment you can walk through, and better furnishing. Houses and villas follow on the same architecture once the apartment works. The brief also says: « Do not create an enormous generic building framework before producing one excellent apartment. »

**The acceptance:** buy or rent an apartment → enter → walk through real rooms → furnish two rooms → leave → reload → return to the same correct layout.

**Branch:** `integration/ld2-c-20261026`, from the traversée (`c1d2c76`). That carries LD2.0-A, LD2.0-B and the traversée, none merged yet.

## Where housing is today (the survey, 26 Oct)
- **Five homes** (`src/economy/catalog.ts`): the starter room, the F2 of the Résidence Jàmm, the family house, the Almadies villa and the Ngor residence.
  - Each has its own interior, built off the street grid (`src/economy/placement.ts` `homeOrigin`).
  - Each is entered through its street door, with a fade (`main.ts` `enterInterior`).
- **The interiors are one open room** (`src/economy/homeInterior.ts`): no ceiling, the camera high above looking down, walls all round, a door in the south wall, windows on the north wall only, a built-in kitchen counter and a shower corner.
  - The F2 has two « bedrooms » behind waist-high partitions with doorways but no doors.
  - Nothing has stairs, an upper floor or a door that opens.
- **Furniture:**
  - 41 pieces in three grades, sold at Keur Meubles in Cité Jàmm.
  - Most are procedural kit models at 1 draw call each. A few premium pieces are still boxes.
  - Placement is on a 25 cm grid with quarter turns, refusing walls, built-ins, door and fitting passages, and overlaps.
  - Every move is saved at once, with an orbit/drag/pinch editor (`src/economy/homeEditor.ts`).
- **Saves:** a placement is `{ x, z, rot }` in the home's metres. An older client drops unknown fields, and a visiting guest's client rejects a snapshot with unknown keys (`docs/SAVES.md`, `src/online/visitRules.ts`). **So this phase adds no save field:** a piece's room is found from where it stands.

## The apartment: the F2 of the Résidence Jàmm becomes walkable
The catalogue's `appart_jamm` (buy 15 M F, or rent 6 000 F a day) gets a real floor plan. It grows to 9 m by 7 m (63 m²), as a Dakar F2.

```
     x −4.5          −1.0           1.8           4.5
 z −3.5 ┌──────────────┬─────────────┬─────────────┐
        │   chambre    │     sdb     │   cuisine   │
   −1.3 │              ├──door───────┤             │
        │            door dégagement │             │
    0.0 ├──────────────┴───arch──────┤             │
        │                            door          │
    1.4 │           séjour           ├─────────────┤
        │                           arch   entrée  │
    3.5 └────────────────────────────┴────front────┘
```

**The rooms:**
- The street door opens into the **entrée**.
- The entrée opens through an arch into the **séjour** (living and dining, 22 m²).
- The **cuisine** has its own door off the séjour: a counter with the sink and the stove, and the fridge, along the east wall under a window.
- An arch from the séjour leads to a short **dégagement**, with doors to the **chambre** (wood floor, two windows) and the **salle de bain** (shower, WC, basin, a small high window).

**The contract** is `src/housing/plan.ts`, tested in `tests/housingPlan.test.ts`. It holds the plan as data, in the home's own metres: origin at the centre, +z toward the street door. Its pure helpers are used by both lanes:
- `roomAt` and `fitsRoom`: the room a point or a footprint is in.
- `wallPieces`: the walls, from the rooms, less the openings.
- `passage`: an opening's way through its wall.
- `clearZones`: each door's swing, each arch's and the street door's step, each fitting's front.
- `whyNotPlan`: why a footprint can't go there.
- `reachable`: can a person still walk from the street door to every room and through every opening, on a 10 cm grid with a 28 cm body.

`PLANS` names the homes built from a plan. Today that is only `appart_jamm`; the others keep their open room until the apartment is right.

## The two lanes
At most two implementation agents. Integration and QA stay with the integration owner.

### Lane H, the home's shell (`lane/ld2c-shell`)
Owns:
- `src/housing/apartment.ts` (new);
- the plan dispatch in `src/economy/homeInterior.ts`;
- the shell parts of `src/economy/estate.ts` (`syncHome`'s shell, the guest's `VisitDraw` shell);
- the `appart_jamm` entry of `src/economy/catalog.ts` (9 × 7, 63 m², its description);
- what `main.ts` and `src/world/interiors.ts` need: optional additions to `Interior` only.

What to build:
- **The shell from the plan:**
  - full-height walls (2.8 m) with a skirting and a two-tone finish, the floors by room;
  - door frames, and door leaves that swing open as the player comes near and close behind;
  - the street door with « Sortir »;
  - windows with daylight behind them (louvred shutters and glass), and built-in fittings modelled to their footprints;
  - a ceiling lamp per room that glows at night;
  - the interior light following the player's room.
- **Seeing in:**
  - no ceiling: the camera stays above, as today;
  - wherever a wall stands between the camera and the player, a soft round hole opens in it around the player (one wall material, no per-wall draw call);
  - the camera may go anywhere above the home.
- **Collisions:**
  - the wall pieces and the fittings;
  - the player can never pass through a wall or a closed door (doors open for the player);
  - spawn inside the street door, facing in.
- **A guest's view of the host's F2** is the same shell.
- **Proof:**
  - unit tests;
  - `scripts/check-apartment-walk.mjs`: walk entrée → séjour → cuisine → séjour → dégagement → chambre → dégagement → salle de bain → back out, on a phone page, with the doors opening, never inside a wall, and the player always visible;
  - pictures of each room by day and at night.

### Lane F, the furnishing (`lane/ld2c-furnish`)
Owns:
- `src/economy/placement.ts`;
- `src/economy/homeEditor.ts`;
- the furniture parts of `src/economy/assets.ts` (settling and re-validating on load);
- `FURNITURE_SPECS` in `src/economy/catalog.ts`;
- `src/world/furnitureKit.ts`, `src/economy/furnitureKitAdapter.ts` and `src/economy/furnitureModels.ts`;
- Keur Meubles' showroom (`src/economy/citeJamm.ts`);
- the catalogue UI in `src/economy/estate.ts` (`openCatalogue`, `ROOMS`, `openHomeApp`).

What to build:
- **Rooms in the editor:**
  - room chips (Entrée, Séjour, Cuisine, Chambre, Salle de bain) that frame the camera on that room;
  - a new piece goes into the chosen room;
  - place, rotate and move as today.
- **The plan's rules for a plan home:**
  - a piece must fit inside one room;
  - never through a wall, on a fitting, in a door's swing, in front of an arch or a fitting, or in the entry (rugs may lie in a passage);
  - after the move every room and opening must still be reachable from the street door;
  - each refusal is said plainly in French.
- **Saves:**
  - when a save is loaded, the F2's existing pieces are re-checked against the plan;
  - a piece that no longer fits goes to a suitable room by its kind (bed and wardrobe to the chambre, sofa and television to the séjour, and so on), else into storage, never lost.
- **Furnishing upgrade, by the brief's list:**
  - sofas and armchairs; dining; beds and wardrobes; kitchens and appliances; bathrooms; lighting and decoration; televisions and entertainment; outdoor and poolside;
  - fill the gaps with quality procedural pieces in the kit's style (one draw call each);
  - replace the premium pieces that are still boxes;
  - show the new pieces at Keur Meubles.
- **Proof:**
  - unit tests;
  - `scripts/check-furnish-rooms.mjs`: in the F2, choose a room, buy and place pieces in two rooms, see a refusal in a doorway, reload, find the same layout;
  - pictures.

## The acceptance (integration: `scripts/check-ld2c.mjs`, a phone page, touches)
1. With money, at the Résidence Jàmm's door: buy or rent the F2. Both are played: rent in one run, buy in the other.
2. Enter and walk through the real rooms: the entrée, the séjour, the cuisine (its door opens), the dégagement, the chambre and the salle de bain. Never inside a wall, and the player always visible.
3. Furnish two rooms: the séjour (a sofa, a table, a television) and the chambre (a bed, a wardrobe).
   - Bought at Keur Meubles or through the phone, then placed in the editor by room.
   - A placement in a doorway is refused.
4. Leave by the street door.
5. Reload the page, return, enter: the same pieces in the same rooms, at the same places and turns.
6. A visiting guest sees the same layout (the LD2.0-B visit check, re-run).

## Quality gates
- `tsc`, `typecheck:server`, build; the whole vitest suite.
- The browser checks: `check-ownership`, `check-home-editor`, `check-home-move`, `check-residence-reload`, `check-keur-meubles`, `check-visit`, `check-save-compat`, `check-phone`, `check-ui-consistency`, plus the lanes' new checks.
- Interior collision and furniture placement, from the lanes' tests and checks.
- **Save:** a v6 save from before this phase, with the old F2 furnished, loads with every piece kept.
- **Performance inside the F2** on a phone viewport: the shell alone ≤ 14 draw calls; furnished (10 pieces) ≤ 60 draw calls and ≤ 80k triangles. The street is hidden indoors.
- Pictures of every room, by day and at night.

## Results (the integrated branch, 26 Oct)
Both lanes are merged into `integration/ld2-c-20261026` (draft PR #72), with the fixes the integration needed:
- the cuisine's and the chambre's doors are hinged toward the wall, so an open leaf no longer sweeps across the way in;
- the editor's see-through hole follows the framed room;
- the F2's sheet names its rooms;
- a window's daylight panel faces only the room: from the camera above the outside of a wall, a window shows its blue louvred shutters instead of a flat pale slab;
- two older checks are brought up to date with the phone since U2 (`check-ownership`, `check-visit`).

### The acceptance (`scripts/check-ld2c.mjs`): 28/28, on a phone page, by touches
- **Buy or rent:** the F2 is rented at the Résidence Jàmm's sign, made the principal residence, and entered by « Entrer chez toi ». A second, fresh game buys it at the sign and enters the same apartment.
- **Walk through the real rooms:** 22 joystick legs: entrée → séjour → cuisine → séjour → dégagement → chambre → dégagement → salle de bain → entrée.
  - Every room was visited, and the three inner doors opened as the player came.
  - Over 125 samples, the player was never inside a wall, a fitting or a door (closest 0.30 m), and always seen.
- **Furnish two rooms:**
  - five pieces bought at Keur Meubles by touch, then placed by touch in the editor with its room chips;
  - in the séjour, the sofa, the coffee table and the television; in the chambre, the bed and the wardrobe;
  - the wardrobe is refused in the bedroom door's swing, with a plain reason, and its saved spot is kept.
- **Leave and reload:** « Sortir » by a tap, then a reload. The player is still renting and living in the F2. The same five pieces stand at the same places and turns, each in its room, valid under the plan, every room still reachable.
- No page errors.

### The other checks
| Check | Result |
|---|---|
| `tsc`, `typecheck:server`, build | clean |
| vitest | 203 files; 2 539 passed, 3 skipped, 0 failed |
| `check-apartment-walk` (lane H: the walk, the doors, pictures, draw calls) | 15/15 |
| `check-furnish-rooms` (lane F: rooms, refusals, reload, a save from the older build) | 24/24 |
| `check-ownership` | 63/63 |
| `check-home-editor` | 34/34 |
| `check-home-move` | 12/12 |
| `check-residence-reload` | 32/32 |
| `check-keur-meubles` | 4/4 |
| `check-visit` (two players: a guest sees the host's furnished F2) | 55/55 |
| `check-save-compat` (a v3 save migrated to v6, rollback to the older client, tabs side by side, New Game) | 25/25 |
| `check-phone` | 69/69 |
| `check-ui-consistency` | 95/95 |

**Failed:** none.

**The guest's view:** in `check-visit`, the guest draws the host's walkable F2 with all 10 pieces at the host's places and turns, each within 1 cm. The guest's frame costs what the host's does: 26 draw calls and 17 860 triangles.

**A save from before this phase:** an F2 furnished by the older build (bed, sofa, dining table, wardrobe and rug, all in its one open room) loads here with all five kept. Each is moved to a room of its kind, valid under the plan, with every room reachable (`check-furnish-rooms`).

### Performance inside the F2 (phone page, 390 × 844, SwiftShader)
The old F2 (one open room, the traversée build) and the walkable F2, each with the same 10 pieces bought (sofa, coffee table, television, bed, wardrobe, chair, plant, radio, rug, floor lamp). Low quality, at 10 h. Measured by `scripts/perf-f2.mjs`; the numbers are in `docs/proof/ld2c/perf-f2.json`.

| View | Draw calls | Triangles | Whole frame (SwiftShader) |
|---|---|---|---|
| Old F2, the room's middle | 17 | 16 800 | 83 ms |
| Old F2, near the door / at the back | 13 / 16 | 16 528 / 16 720 | 89 / 89 ms |
| **Walkable F2, séjour** | **21** | **23 064** | **121 ms** |
| Walkable F2, chambre | 23 | 23 602 | 105 ms |
| Walkable F2, entrée | 14 | 22 512 | 108 ms |
| Walkable F2, cuisine | 17 | 22 796 | 94 ms |
| *The street at the Résidence Jàmm (for reference)* | *78–81* | *163 000–165 000* | *272–282 ms for the renderer alone* |

- **The budget holds:** at most 23 draw calls and 24k triangles, furnished, against 60 and 80k. The shell alone is 10 draw calls and 7 432 triangles (`check-apartment-walk`, budget 14).
- **The walkable F2 is slower than the old room in the software renderer**, by about 10–40 % a frame (measured again after the window fix).
  - The renderer alone in the séjour takes about 116 ms.
  - It drops to 71 ms with the shell's walls, faience, fittings, doors, lamps and windows hidden (its floors kept), and to 55 ms with the whole home hidden.
  - The full-height walls cover far more of the screen than the old low walls, and every wall pixel is lit.
  - The see-through hole (a shader that may discard) accounts for about 12 % of the frame (102 ms without it). The shadow pass is negligible.
- **For scale:** the street outside costs about 280 ms a frame in the same renderer. Inside, the F2 costs under half of what the player's phone already draws outdoors, so the shell is left as it is.
- **Not measured on an iPhone:** these are SwiftShader numbers (a CPU rasteriser), which follow fragment cost. A real phone's GPU is far faster, but this is no substitute for the owner's iPhone review once a preview can be built.

### Pictures
- `docs/proof/ld2c/acceptance/`: the acceptance's own views, from the entrée on arrival to the séjour after the reload.
- `docs/proof/ld2c/shell/`: each room by day and at 21 h.
- `docs/proof/ld2c/furnish/`: the editor's room chips, the two rooms furnished, the doorway refusal, the reloaded rooms, Keur Meubles, and the new catalogue (`catalogue.png`).

### Limitations
- **No iPhone preview yet.** The Cloudflare preview build fails on the account's namespace limit (as on PRs #69 and #71), so the phase is checked on a phone-sized page in Chromium, not on a real iPhone.
- **The street door is modelled shut.** The player goes in and out by « Entrer chez toi » and « Sortir » at the door, with a fade, as in every other home.
- **An older client and a newer save.** A client from before this phase rejects a visit snapshot that holds one of the new furniture ids. This is the rule from LD2.0-B (`src/online/visitRules.ts`); both players need this build.
- **The other homes keep their open room.** That is the brief: one excellent apartment first.

## Not in this slice
- Houses and villas with several storeys, stairs, balconies, terraces and compounds come after the apartment has been reviewed.
- The owner's flagship villa is LD2.0-D.
- The other homes keep their open room for now.
