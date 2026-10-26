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

## Not in this slice
- Houses and villas with several storeys, stairs, balconies, terraces and compounds come after the apartment has been reviewed.
- The owner's flagship villa is LD2.0-D.
- The other homes keep their open room for now.
