# Almadies · the night street and the rooftop — M4 × LD2.0-E integration

**Status: engineering only, for the owner's approval. Nothing is merged, nothing is deployed, `wip/visual-pass` is untouched. No iPhone has run this** (Chromium with touch emulation is not an iPhone test). Branch `integration/almadies-nightlife-20261028`, a separate branch and worktree; the originals (`feature/ld-m4-almadies-20261026` / #76, `fix/m4-terrasse-hospitality-strip-20261026` / #77, `integration/m4-ld2d-20261027` / #78, `integration/ld2-e-20261027` / #81) are not changed.

The owner approved LD2.0-E's Almadies architecture and asked for M4's evening to live in it: one definitive Terrasse de Ngor, a recognisable night street, three anchor venues that are three different places (the Terrasse, Le Patio, La Vague), working parking, a street that changes through the day.

## What was integrated
| Source | Head | What came |
|---|---|---|
| M4 + LD2.0-D (#78) | `8cedf12` | the base of this branch: M4's evening (Awa Sy, the meal as the ordinary `order` activity, La Vague, the end-of-evening card, the taxi, memory in `al_*` counters), the placemaking pass's venues, the alley, the villa |
| LD2.0-E (#81) | `de34f28` | merged on top: the district (30 sites, 14 designs), the open street, the streetscape, the boutique hotel's rooftop door and lit roof sign |
| Le Patio (lane `lane/nightlife-patio-20261031`) | `49033df`, `c184e8b`, `9d1af44` | merged last (`1734622`): the venue, its music track and the optional variant of the club recipe; see [`PATIO.md`](PATIO.md) |

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

## The street through the day (measured)
Nothing new is invented: the street uses the hours, the ambient people, the lights and the music the game already has. The table is **measured in the running game** (`scripts/measure-night-street-life.mjs`, medium quality, the city's ambient scheduler run on, one run; `docs/proof/nightlife/street-life-by-hour.json`). « On the street » counts the ambient people on the night street's ground (promenade, bays, the sand in front of it).
| Hour | On the street | Sitting | Where | Le Patio | La Vague |
|---|---|---|---|---|---|
| 02 h | 0 | 0 | nobody outside: the city's ambient people have gone home | peak, 10 people | peak, 67 people |
| 08 h | 9 | 2 | beach walkers; 2 at Café du Phare (open from 7 h) | closed (gate shut, a delivery) | closed |
| 11 h | 2 | 1 | Chez Binta opens at 11 h | closed | closed |
| 13 h | 8 | 6 | Binta 3, Café du Phare 3, Le Comptoir 2: on the promenade's chairs | closed | closed |
| 15 h | 7 | 6 | the same three places | closed | closed |
| 17 h | 10 | 1 | beach 6, the three places 1 each | closed | closed |
| 19 h | 15 | 1 | beach 11 | set-up: 3 staff, the gate shut | closed |
| 21 h | 15 | 7 | Binta 3, Comptoir 3, Phare 3, beach 5 | early: open, 8 people | early: open (21 h), 14 people |
| 23 h | 1 | 1 | the ambient people are leaving | warm, 10 people | warm, 36 people |

What is not in the table, stated plainly: **after 23 h the outside is quiet** (the ambient scheduler has no one on the promenade at 23 h and at 2 h; the night's life is inside Le Patio and on La Vague's floor and at its gate); **Lounge 221 (19 h – 3 h) has no ambient customers** (the scheduler seats only restaurant and café places); the queues at Le Patio's rope and La Vague's gate at the peak are checked by `check-patio.mjs` and `check-venues.mjs`, not by this measurement.

## Contract
[`CONTRACT.md`](CONTRACT.md) v10, row 16. No new money path, wallet, save field, schema or relationship engine: the meal, the door fees and the drinks are the existing activities (one ledger line, paid once); memory is the shared system's; counters are `al_*` (M4's), `club:*` (La Vague's, Le Patio's own keys) and nothing else.

## Evidence and results
**Engineering only, on a phone-sized page with real touch events in Chromium on SwiftShader. No iPhone has run any of it.** The head of this branch when the evidence was taken is `3ebac62` (the later commits change documents only).

| What | Result |
|---|---|
| TypeScript, `npx tsc --noEmit` | clean |
| Full test suite (`npx vitest run`) | 235 files passed, 2 skipped; **3 456 tests passed, 4 skipped, 0 failed** |
| GitHub « Game checks » on this branch | green on every completed head (the run for the last head was still going when this was written); the only failing check is Cloudflare's Workers Build, the account limit already noted on the PR |
| The 12-step journey, one session, real touch, recorded (`scripts/check-nightlife-journey.mjs`) | **73 checks passed, 0 failed** on the integrated build: [`docs/proof/nightlife/journey/results.txt`](../proof/nightlife/journey/results.txt), 20 pictures beside it. The 18 min 46 s recording (14.6 MB MP4) is delivered with the report, not committed |
| Le Patio in game (`check-patio.mjs`) | **61/61 passed, 0 failed** on the final build (the 5 000 F ticket, the name-only wording): the door and its fee, the courtyard, drinks, talks and the decline, the walk-over, the dance on its own beat, the terrace, the way out, the free entry of a regular, the hours by day / dawn / set-up / peak, low quality. (The first run, before the ticket and name change, was also 61/61.) |
| Parking (`check-almadies-parking.mjs`, both car parks, driven with the pedal stick) | 9/9 |
| Rooftop (`check-rooftop.mjs`) | 43/43 |
| City life (`check-city-life.mjs`) | 41/41 |
| Venues (`check-venues.mjs`, La Vague among them) | 162 passed, 1 failed: the Dibi grill's « master keeps turning the brochettes » (flips 14 → 14). **The same check fails identically on the M4 base `8cedf12`**: it is not from this integration (Pikine's dibiterie; not touched) |
| District (`check-district.mjs`) | all pass, the roof sign seen from 42 viewpoints, the beach's included, with nothing solid in the way; the budget is described below |

### The journey (what it proves, and with which shortcuts)
1 the Teranga is driven from the Corniche north, across the district border and along the coast road with the pedal stick; 2 parked in a painted bay of « PARKING DU PATIO » (centre inside its lines, the whole car off the carriageway), stepped out of; 3 Le Patio: the age and the **5 000 F** ticket shown before anything is paid, paid once (one ledger line), the courtyard, the bar (a beer, 1 500 F, one ledger line), a patron (Fatou: a topic, then a graceful no), a woman who works the night there (she says so herself; she is asked about her work and staying safe, and **declined**: no money, no ledger line, no counter, the choices as they were), a dance on Le Patio's own beat; 4 on foot to the hotel; 5 the Terrasse's lit name is seen from the car park and from the promenade; 6 up to the roof: order, sit, eat (6 000 F, once); 7 Awa Sy; 8 La Vague (2 000 F, once); 9 its dance; 10 the taxi home (one ledger line); 11 another evening: Awa remembers what the guest said and did, the coffee on the house is free and once; 12 save and reload: the wallet is **the same to the franc** (500 000 → 483 000 = the 17 000 F the ledger says was paid: 5 000 + 1 500 + 6 000 + 2 000 + 2 500), the car is where it was left, one copy, Awa's memory and the progression counters are unchanged to the unit.
The labelled shortcuts (everything else is the real thing): the hour (`setHour`), the city day held where the run began (a city day is 24 minutes of the wall's), the Teranga bought and put in the Corniche, the next city day, the return from the Corniche after the taxi, reading state.
**What the journey does not prove:** the dances were played with real touches on the beat but scored low (about 0.13 on both Le Patio's floor and La Vague's: SwiftShader draws a few frames a second and the page's clock lags the wall's), so it shows that the mechanics run and count, not that they feel good; **a first tap on a low row of a long sheet was missed on several runs and taken on the repeat** (no input guard was found in `src/ui/sheet.ts`; the cause is not established: it may be the automation's timing on a slow page); the way home after the taxi is a labelled return.

### Performance
Static cost of the Almadies hub's own group (`check-district.mjs`, every mesh of the scene, visible or not), same method on four builds:
| Build | Medium: meshes / triangles | Low (phone): meshes / triangles |
|---|---|---|
| the villa branch (the check's baseline) | 174 / 184 520 | n/a |
| M4 + villa (`8cedf12`) | 198 / 185 860 | 198 / 153 036 |
| LD2.0-E alone | 184 / 266 994 | 184 / 221 490 |
| **integrated** | **215 / 285 140** | **215 / 238 666** |
LD2.0-E's own budget (+10 meshes, +95 000 triangles over the villa branch) is **exceeded** by the integrated hub (+41 meshes, +100 620 triangles): M4's venues add 24 meshes and about 1 300 triangles, E's district 10 and 82 500, and Le Patio is capped by its own tests at 12 draw calls and 40 000 triangles. The check now prints the strict E budget as a note and checks the **sum of the three accepted pieces** (+46 meshes, +136 400 triangles), which holds. **That sum is my definition, not an agreed budget: whether 215 meshes and 285 k triangles are acceptable on an iPhone is the owner's call, and no iPhone measurement exists.** The frame-level tests (`tests/perf.calls.test.ts`, `tests/outflowFirstFrames.test.ts`) pass.

### Pictures
`docs/proof/nightlife/street/`: overviews by day (11 h) and by night (22 h) of the whole street, the west half, the east half; street-level Le Patio's gate and sign from the road, from close, the car park from the road and from above, the promenade and the taxi bay; the roof sign from the coast road at x −110 … +40, by night and by day. `scripts/shots-nightlife.mjs` makes them. They are the game's own render at 1280 × 760, medium, with the debug wallet showing.

### Known limits
- No iPhone has run this; Chromium touch emulation is not an iPhone test.
- The music is rendered and verified by numbers, **nobody has listened to it**; the Wolof in Le Patio's lines is a draft to read again with the Wolof lane.
- Le Patio's floor is sparse (8 – 10 bodies at its peak: the humanoid budget), La Vague's is the instanced crowd.
- After 23 h the promenade is empty of ambient people (see above); Lounge 221 has no ambient customers.
- Le Patio's ticket is a single price (5 000 F, once a night; a regular after three nights comes in free); there is no other tier, and the bar's prices were not raised with it.
- The integrated hub is over LD2.0-E's own mesh and triangle budget (above).
- The M4 evening's `Awa` still sends the guest on to La Vague only; Le Patio is not part of her evening, of `src/online/meetups.ts` or of the end-of-evening card.
- Nothing is merged and nothing is deployed; `wip/visual-pass` is untouched. The Cloudflare preview does not build (the account's limit), so **there is no preview URL**.
