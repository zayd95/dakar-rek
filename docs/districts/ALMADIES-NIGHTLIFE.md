# Almadies · the night street and the rooftop — M4 × LD2.0-E integration

**Status: engineering only, for the owner's approval. Nothing is merged, nothing is deployed, `wip/visual-pass` is untouched. No iPhone has run this** (Chromium with touch emulation is not an iPhone test). Branch `integration/almadies-nightlife-20261028`, a separate branch and worktree; the originals (`feature/ld-m4-almadies-20261026` / #76, `fix/m4-terrasse-hospitality-strip-20261026` / #77, `integration/m4-ld2d-20261027` / #78, `integration/ld2-e-20261027` / #81) are not changed.

The owner approved LD2.0-E's Almadies architecture and asked for M4's evening to live in it: one definitive Terrasse de Ngor, a recognisable night street, three anchor venues that are three different places (the Terrasse, Le Patio, La Vague), working parking, a street that changes through the day.

## What was integrated
| Source | Head | What came |
|---|---|---|
| M4 + LD2.0-D (#78) | `8cedf12` | the base of this branch: M4's evening (Awa Sy, the meal as the ordinary `order` activity, La Vague, the end-of-evening card, the taxi, memory in `al_*` counters), the placemaking pass's venues, the alley, the villa |
| LD2.0-E (#81) | `de34f28` | merged on top: the district (30 sites, 14 designs), the open street, the streetscape, the boutique hotel's rooftop door and lit roof sign |

The textual merge had four conflicts (the Almadies busy streets, `src/venues/rooftop.ts`, the villa test and its fixture), all resolved keeping both sides. The semantic conflict was bigger and had no text conflict at all: M4's hospitality strip and E's resort / boutique hotel / villas both drew on the sea-front blocks (0,0) and (1,0), one inside the other. That is what this branch resolves.

## Decisions
1. **One Terrasse de Ngor: the boutique hotel's roof** (Hôtel Le Filao, block (1,0), lots 0-1). M4's standalone frontage at (−30, −105.1) and its visitor bay are gone (`site` removed from `src/venues/rooftop.ts`). The stair door is the district's (`hub.rooftopDoor`, (−40, −105.6) beside the lobby), the name is the lit sign on the hotel's roof (LD2.0-E round 4), the map entry, Awa Sy, the order / sit / eat flow, the evening card and the taxi are M4's and unchanged. The door opens from 17 h to 1 h (hours on the door outside them); the other terraces are as they were.
2. **E's blocks are E's again**: the two sea-front blocks go back to the resort, the boutique hotel and the villas; `specials` no longer holds the strip. The hub's main random stream is *exactly* LD2.0-E's (checked by counting every draw of every stream at both qualities, and by `tests/almadiesDistrict.test.ts`, whose digest fixture was taken again at the villa branch `3ca9e39` with the night street's rectangles left out).
3. **The night street is on the beach side of the coast road**, across from the hotels (`src/world/nightStreet.ts`): M4's Lounge 221, Le Comptoir de Ngor, Chez Binta and Café du Phare, turned half a turn to face the road (`turned`, one primitive at a time: position through the building's centre, yaw + π), the lit alley to La Vague kept, a promenade, two car parks, a taxi bay, a zebra to the hotel. M4's Patio house and Terrasse building are not drawn any more: Le Patio is the courtyard club below, the Terrasse the hotel's roof. A hotel avenue on one side and a beach-front strip of venues on the other is what keeps both teams' work whole: no LD2.0-E site was removed, no M4 building was redrawn, only turned.
4. **Le Patio and La Vague are different places.** La Vague (existing, unchanged): the open beach dance terrace, bamboo and thatch, juices, mbalax, 21 h-5 h. Le Patio (`src/venues/patio.ts`, merged from lane `lane/nightlife-patio-20261031`, see [`PATIO.md`](PATIO.md)): **the VIP clubbing spot, called just « Le Patio »**, a walled courtyard bar and club for adults behind an arched gate and a velvet rope, **a 5 000 F ticket at the door** (once a night; La Vague is 2 000 F), a covered bar with beer and spirits as well as soft drinks, lounge sofas, a VIP corner, a DJ booth, a smoking terrace, its own music, 20 h-4 h.

## The street, from the road to the sea (the carriageway's north edge is z −127)
| z | What |
|---|---|
| −127 … −128 | a metre of asphalt apron (a car that stops short is still off the carriageway) |
| −128 … −132.8 | **two rows of painted bays**, nose to the beach, open to the road: « PARKING DU PATIO » (x −122 … −55, with a gap for the taxi bay in front of Le Patio's gate) and « PARKING NGOR · HÔTEL · TERRASSE · LA VAGUE » (x −22 … 10) |
| −133.2 … −137 | the **promenade**: ochre paving, lamp poles with festoons, seven café sets whose chairs are the street's seats |
| −137 … | the fronts: Le Patio (x −123 … −95), Chez Binta, Café du Phare, **La Vague's alley and gate** (x −52 … −24), Lounge 221, Le Comptoir de Ngor; the pirogues stay east of x 11 where the Embarcadère has them |

Across the road: the resort and the boutique hotel with its roof sign; a **zebra at x −30** joins the alley's mouth to the hotel's forecourt gap, on the way between the east car park and the stair door.

### Parking and access (what is checked)
- No marking is on the carriageway: every bay lies beyond z −128 (`tests/nightStreet.test.ts`); the bays are on the sand verge, so a car in one is out of every traffic lane.
- The NPC cars leave runs of **free bays by every door** (±12 m of Le Patio's gate, ±6 m of each venue, the hotel side of the east row), with room to swing in; every free bay is clear of solids and so is its way in from the road. About 40 % or more of the bays are free.
- A grid walk (0.25 m cells, a 0.3 m body) over the colliders reaches from the road to every front, the alley's gate, the taxi bay, both ends of each promenade and the hotel's side of the road.
- Street dressing, parked traffic and the beach's palms keep off the night street's ground (`NIGHT_KEEP_CLEAR`); the beach palms inside it are not drawn, the others keep their fronds and their random numbers.
- `scripts/check-almadies-parking.mjs` (real touch, 22 h): the Teranga is driven with the pedal stick into a free bay of each row, parked, stepped out of, and walked to the promenade.

## The street through the day
**Draft: the table below is the design. Which parts are measured in the running game is stated in the results section when the run is done; Le Patio's rows depend on its lane being merged.** Nothing new is invented: the street uses the hours, the ambient people, the lights and the music the game already has.
| When | What the street does |
|---|---|
| Morning, afternoon (7-17 h) | **Café du Phare** (7-22 h) and the grill and the comptoir (11 h on) are open: their counters serve (the ordinary `order` activity, `src/districts/nightStreet.ts`), the ambient people come by place type and hours and sit on the promenade's chairs; the placed staff stand at their doors; the car parks are half empty; Le Patio's gate is shut with its hours on the sign; La Vague's gate is shut. The hotel's own life is LD2.0-E's (valet, bellhop, café units). |
| Evening (17-21 h) | **the Terrasse opens** (17 h) and Awa Sy greets; the restaurants fill; Lounge 221 opens (19 h); the lamps and the festoons come on with the city's night; Le Patio opens at 20 h with its doorman at his post. The taxi rank by La Vague and the dépose-minute bay take guests. |
| Night (21-4/5 h) | La Vague (21 h) and Le Patio (20 h) are alive: lights on the beat, music heard fading down the street, the crowd by the hour (empty → warming → peak), the queue at La Vague's gate, taxis for the way home; the cafés close (the lounge goes on to 3 h). |

## Contract
[`CONTRACT.md`](CONTRACT.md) v10, row 16. No new money path, wallet, save field, schema or relationship engine: the meal, the door fees and the drinks are the existing activities (one ledger line, paid once); memory is the shared system's; counters are `al_*` (M4's), `club:*` (La Vague's, Le Patio's own keys) and nothing else.

## Evidence and results
*(filled in at the end of the run: see the section below)*
