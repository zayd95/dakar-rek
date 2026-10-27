# The home kit: every home is a floor plan, every hub wears it its own way

**The owner (27 Oct):** « Apply the same logic to the residences and villas of the other hubs: let's remove all the one-room homes. Even an apartment like the Résidence Jàmm needs a room, a bathroom and a kitchenette, like a studio or a mini-studio. *Ma chambre* stays as it is. Save everything as usable assets and variations for hubs like Mermoz / Sacré-Cœur, but with their own identity. »

## What changed in the game
- **No home is one open room any more but *Ma chambre*** (the starter room, `src/interact/interiors.ts`, untouched). Every other home of the catalogue is built from a floor plan by the shell of `src/housing/apartment.ts`: the Résidence Jàmm's F2 (room, bathroom, kitchen, since LD2.0-C), the Cité Jàmm family house (two levels, `src/housing/maisonPlan.ts`), the Almadies villa (three levels, `villaPlan.ts`) and, new, **the Ngor residence** (`src/housing/residencePlan.ts`): a whole floor of the tower, 22 m × 15 m (330 m²): a hall, a reception salon of 9 × 5.5 m opening on a 22 m sea terrace, a kitchen with an island, a dining room, a master suite with its dressing room and a 30 m² bathroom, a second bedroom, a second bathroom, a gallery joining them. The catalogue says 330 m² (it said 1 200 m² of one empty room). `buildHomeInterior` refuses a catalogue home that has no plan (it used to draw the old one-room builder, deleted): `tests/homeKit.test.ts` holds « every home but Ma chambre has a plan with a room to live in, a bathroom and a kitchen or a kitchenette ».
- The listing texts (`src/economy/estate.ts`) read the plan: « sur un étage / sur deux étages », « terrasse sur la mer », « cour, balcons », « piscine, toit-terrasse et hélipad ».

## The kit (`src/housing/kit/`)
A **template** is a plan; an **identity** is the colours a hub gives it; `instantiate(template, { id, identity, mirror })` is a copy under a catalogue id.

| Template | Area | Levels | What it has | Start price / daily rent |
|---|---|---|---|---|
| `mini_studio` | 26.7 m² | 1 | one room to live and sleep in with its kitchenette along the wall, a bathroom, an entrance | 4.5 M F / 2 500 F |
| `studio` | 35 m² | 1 | a big room to live and sleep in, a kitchenette room opening on it, a bathroom with a door | 8 M F / 3 800 F |
| `f2` | 63 m² | 1 | the Résidence Jàmm's: entrance, séjour, kitchen, bedroom, bathroom, short hall | 15 M F / 6 000 F |
| `f3` | 82.5 m² | 1 | entrance, séjour, kitchen, two bedrooms, bathroom, corridor | 30 M F / 11 000 F |
| `house` | 216 m² | 2 | the Cité Jàmm house: salon, dining room, kitchen, guest room, shower room, stairs, courtyard; three bedrooms, bathroom, family lounge, balconies | 150 M F / 30 000 F |
| `villa` | 312 m² | 3 | the Almadies villa (signature: one place's own, not re-coloured) | 400 M F / 120 000 F |
| `residence` | 330 m² | 1 | the Ngor residence (signature) | 2.5 Md F / 600 000 F |

(The prices are a start for a hub's listing; the owner sets the catalogue's.) Pictures: `docs/kits/homes/` (`echelle.png` the ladder, `identites-mini-studio.png` and `identites-f3.png` the same plan under each identity, `f3-mermoz-miroir.png` the mirror, `studio-mermoz-nuit.png` by night). Regenerate with `node scripts/shots-home-kit.mjs` (the viewer: `tools/home-viewer`, `src/housing/kit/viewer.ts`).

### Identities (`kit/identity.ts`, `FloorPlan.look`: `PlanLook`)
Only colours — the walls above the dado and the dado, the tint of the floors and the colour of the walls by kind of room (bedroom, bathroom, kitchen, dining room…), the doors' and trims' colours; the premium finish (a plan on levels: the villa, the house, the residence) keeps its walnut doors and bronze trims. A home bought « peinture neuve » is repainted over it.
| Identity | Hub | Reads as |
|---|---|---|
| `pikine` | Pikine | the shell's own finish: sand dado, warm white, blue doors (no override) |
| `mermoz` | Mermoz · Sacré-Cœur | cool whites, a soft teal band, deep-teal doors, pale large tiles |
| `plateau` | Plateau | ochre walls, a dark-wood dado, parquet, heavy dark doors |
| `corniche` | Corniche | white and sea blue, navy doors, pale floors |
| `almadies` | Almadies | warm white, travertine, walnut and bronze, cream marble |

### Variations
- **Mirror** (`mirrorPlan`, `kit/mirror.ts`): the same home the other way round (rooms, door hinges, windows' sides, fittings' fronts, the stairs' way up; each level about its own middle line). Two blocks of the same template do not look alike.
- **Identity** × **template** × **mirror**: 7 × 6 × 2 plans, each held to the same checks (`tests/homeKit.test.ts`, `tests/helpers/planChecks.ts`): no room overlapping another, every room at least 2.4 m inside (the bathrooms, kitchenettes and entrances 1.8 m, the corridors 1.1 m), every opening on the wall its two rooms share with 0.15 m of wall each side and no wall across it, every fitting inside its room and clear of the others, every window on an outside wall, the street door in the spawn's room, every room and opening reachable from it.

### Listing one in a hub
```ts
const spec = homeSpecFromTemplate('studio', {
  id: 'studio_filaos_1', identity: 'mermoz', mirror: true,
  name: 'Studio · Résidence Les Filaos', hub: 'mermoz', place: 'filaos', where: 'Mermoz', door: 'mermoz:home:filaos',
});            // the plan is registered under the id (`registerPlan`); push `spec` onto HOMES, after the existing entries
```
The hub still draws the building, its street door (an interactable `<hub>:home:<place>`) and the listing board, as `src/economy/citeJamm.ts` does in Pikine and `VILLA_GATES` in Almadies: the kit gives the inside and the catalogue entry. New entries go at the **end** of `HOMES` (a home's slot in the interior zone is its index: `homeOrigin`, so the order of the existing ones must not move). Nothing of Mermoz is listed yet: that is the next step, with the building.

## Limits
- No listing of a kit home in Mermoz or elsewhere yet (the kit is the assets; each needs its building and door).
- Furniture saved in the old one-room Ngor residence would not match its new plan (it costs 2.5 Md F: nobody owns it in the game).
- Real phone untested; the shells are measured headless (draw calls per shell, tests/homeKit.test.ts: ≤ 24 for the flats, ≤ 60 for the premium ones).
