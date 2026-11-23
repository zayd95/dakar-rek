# Le Patio — the VIP nightclub of the Almadies night street

**Status: Gate A (engineering) only. No iPhone has run this; the in-game check uses Chromium with touch emulation and real touch events on SwiftShader, which is not an iPhone test.** Branch `lane/nightlife-patio-20261031`, started at `6ec234b`; the integration owner merges it.

Le Patio is the Almadies' **VIP clubbing spot**, an adult nightclub and bar (not a restaurant; **owner's brief of 31 Oct: « the VIP private clubbing spot, its ticket starts from 5 000 F », and « just the name Patio »**: the ticket at the door is 5 000 F, La Vague's beach terrace stays at 2 000 F; in the game it is called just « Le Patio » — the sign, the doorman, the door sheet and the neighbourhood list carry no tagline such as « club privé »; no other tier exists yet) on the empty site the night street keeps for it (`PATIO_SITE` in `src/world/nightStreet.ts`: world x −123 … −95, z −157 … −133, gate toward the road). It is known for its nightlife, **including the presence of adult sex workers among its people**; the game treats them as people with a job, with dignity, and nothing in the venue sells, prices, arranges or rewards a sexual service (see *Content rules*). It is a different place from La Vague: La Vague is an open beach deck (bamboo, thatch, a juice bar, the sea behind, bright mbalax); Le Patio is a **walled courtyard** (ochre walls, an arched gate, bougainvillea, a covered bar of bottles, sofas, a DJ booth against the back wall, amber / magenta / violet light, an afro-lounge feel).

## What it is

| | |
|---|---|
| **From the road** | an ochre street wall with an **arched gate**, a **lit sign « LE PATIO » with « 18+ » under it** (7.4 × 2.3 m, marquee bulbs, readable from the road and from tens of metres along it), two lanterns, a porch of timber with a **velvet rope**, the **doorman** (Boubacar) and, at the peak, **two people queueing**; a board at the gate says OUVERT / FERMÉ and gives the week's programme, the age (18+), the fee and the hours. By day the gate is shut (two timber leaves), the board says « FERMÉ · ouvre à 20 h », and a delivery waits at the door with crates. |
| **Inside** (the courtyard, its own presence space `almadies:venue:patio`) | a **covered bar** on the west wall (counter, shelves of bottles lit from behind, six stools registered as seats, the barwoman Coumba behind it, a chalkboard of the menu with its prices); a **dance floor** of lit tiles (ripples from the middle in the night's three colours, on the tempo of the music map), a **DJ booth** against the back wall under a ring of light, two beams; the **salon** (three sofas round low tables, six seats, the waiter serves them); a **VIP corner** (a raised platform behind a velvet rope, sofas, decor and a few seated people; not enterable); a **smoking terrace** (a raised timber deck with high tables, a « FUMEURS » sign, **its own door onto the promenade** at the east end of the street wall, steps from the courtyard, a rail); strings of lights across the courtyard, uplights and washes on the walls, bougainvillea over the wall tops. |
| **The night** | closed 04 h – 07 h; **day** 07 h – 18 h (gate shut, a delivery); **set-up** 18 h – 20 h (staff set up, the doorman at his post, gate shut, the sign half lit); **early** 20 h – 22 h (open, first guests); **warm** 22 h – 24 h; **peak** 0 h – 2 h 30 (the floor lit, the queue at the rope); **dawn** 2 h 30 – 4 h. Open **20 h – 4 h** (La Vague: 21 h – 5 h). |
| **Playable** | enter (the fee **shown before it is paid**, once a night, a regular — three nights out — free), a drink at the bar (the `order` primitive: paid once at the start, sit on a stool, drink), a drink served at a salon table by the waiter, talk to the staff and to eight guests, **dance** with the existing mechanics (`DancePlay`, the `danser` activity, in the world on the floor), ask the DJ for a song, the smoking terrace, « Sortir » by the gate (the player is put on the promenade). |

## Files

| File | What |
|---|---|
| `src/venues/patio.ts` | the venue (like `club.ts`): the recipe, the gates, the cast, the guests, the walk-overs, the night's lights, the music, the debug payload |
| `src/venues/patioPlan.ts` | pure data: hours, moments, the menu, the week, the courtyard's layout in the club frame, the cast (who is there when), `patioLook`, the walk-over geometry |
| `src/venues/patioBuild.ts` | the geometry (merged batches), the painted signs (one atlas), the board at the gate, the pools of light, `terraceHeight` |
| `src/venues/patioTrack.ts`, `public/assets/audio/music/le-patio.mp3`, `scripts/audio/render-patio.mjs`, `scripts/audio/verify-patio.mjs` | the music lane's track and its map (see *Music*) |
| `src/i18n/patioLines.ts` | all its words: the doorman, the barwoman, the DJ, the eight guests, the signs |
| `src/activity/templates.ts` | `club()` gained an optional `variant` argument (`ClubVariant`); `clubTheme` / `nightsToContest` an optional theme list |
| `src/venues/vagueMusic.ts`, `src/venues/dancePlay.ts`, `src/activity/danceRules.ts` | gained an optional `track` (and `words`): default La Vague's |
| `src/venues/index.ts`, `src/multiplayer/protocol.ts` | registration; the presence space |
| `tests/patio.test.ts`, `tests/patioLines.test.ts`, `tests/clubDigest.helper.ts`, `tests/node-crypto.d.ts` | tests |
| `scripts/check-patio.mjs` | the in-game check; its pictures are in `docs/proof/nightlife/patio/` |

## Reuse (nothing rebuilt)

- **`club()` recipe + variant.** `club(b, h, v?)`: `v` carries Le Patio's `hours` `[20, 4]`, `peaks`, `entry` (5 000 F), `regularAt` (3), `drinks`, `themes`, `labels` and `contest: false`. **Every field's default is La Vague's**: `tests/patio.test.ts` compares the recipe's output (every offer, label, detail, price, step and effect, and what `visible()` / `requires()` answer across 12 hours × 7 nights × 3 states, 2.1 MB of text) with a SHA-256 taken from the unmodified recipe at `6ec234b` — identical, for `club(b, h)`, `club(b, h, {})` and `club(b, h, undefined)`.
- **`VagueMusic(base, track)` and `DancePlay({ …, track, words })`**: the beat length, the loop points, the cue routine, the section lookup and the dance's words come from what is given (default `VAGUE_TRACK` and `VAGUE_WORDS`); `BEAT` stays La Vague's export.
- `Cast` + `randomLook` (through `patioLook`), `VenueKit` and its seats / colliders, `conversation`, `relate`, `recordVisit`, `P.talk`, `registerInWorld`, `nightOf`, `glowTexture`, the club counters helper `clubCounters(id)`.
- The instanced crowd (`VagueCrowd`) is **not** reused: Le Patio keeps to `Cast` people (8 – 10 bodies at the peak), which fits the brief's humanoid budget without parametrising La Vague's crowd.

## Music — its own track, never La Vague's

Le Patio plays **its own piece**: `public/assets/audio/music/le-patio.mp3` and the map `src/venues/patioTrack.ts` (`PATIO_TRACK`, written together by `scripts/audio/render-patio.mjs`, checked by `scripts/audio/verify-patio.mjs`; the music lane's files, committed apart). An original afro-lounge groove (D minor), **100 bpm, 32 bars, a 76.8 s seamless loop**, sections A / B / break / build, drum fills at bars 7, 15, 23, 27, 31; −16.0 LUFS, true peak −2.8 dBTP, downbeats within 0.52 ms of the grid, seam jump 0.0025 (measured by the music lane on the decoded MP3). **Nobody has listened to it: its musicality is unverified.** La Vague's is 120 bpm / 24 bars / 48 s.

The same player and the same dance as La Vague's take it as a parameter: `new VagueMusic(base, PATIO_TRACK)` (default `VAGUE_TRACK`; the beat length is `60 / bpm` of the track given, the loop points come from the track's sync tick) and `DancePlay({ …, track, words })` (the cue routine, the section lookup and the beat clock follow the track). The dance's **words** follow the music too (`DanceWords` in `src/activity/danceRules.ts`, default `VAGUE_WORDS` = La Vague's sabar): Le Patio has `PATIO_DANCE` — its break only gets the line « Le break : la musique respire, garde le temps » (no change of footwork), its drum fill is « Le roulement des congas : un pas de plus », the quick double step is « Le double pas », a low score is told « écoute la basse ». **No « sabar » and no « tambour » is ever said on this floor** (`tests/patio.test.ts` runs the routine over the whole track and checks it); La Vague's lines are byte for byte as before.

**Never both clubs on one file:** `ownTrack` compares the two file names and the venue asks for no level without it; its player is its own, its file `le-patio.mp3`. If the file were missing the player would find none and stay silent (the fetch answers 404, `available === false`, level 0) rather than ever play La Vague's. Heard within 75 m, fading and **always muffled** behind the walls (inside: clear; at the gate and in the street: `muffle` ≥ 0.55), panned by the camera; nothing is created before the player's first gesture.

## Hours, fee, drinks

Open 20 h – 4 h. Ticket at the door **5 000 F** (La Vague's is 2 000 F), once a night, shown before it is paid (the age first: « 18 ans minimum »); a regular after 3 nights comes in free (« Entrer · habitué »). The DJ's request 500 F (as at La Vague). Dancing is free; there is **no contest** (`contest: false`: its prizes would be money paid to the player).

| Alcohol | F | No alcohol | F |
|---|---|---|---|
| Bière glacée | 1 500 | Bissap glacé | 1 000 |
| Mojito | 3 000 | Jus de bouye | 1 200 |
| Dakar Sunset (la maison: rhum, mangue, bissap) | 3 500 | Jus de gingembre | 1 200 |
| Gin tonic | 3 500 | Soda | 1 000 |
| Whisky coca | 4 500 | Virgin Sunset | 2 500 |
| | | Eau fraîche | 1 000 |

The waiter brings the same drinks, at the same prices, to the salon's tables. Every payment goes through the activity runner's one path (`ActivityRunner` → `addMoney`, one ledger line, once): the venue never touches the wallet.

## Saves

Only `ctx.state.data.counters` through the club helper, `clubCounters('almadies:venue:patio')` → `club:almadies:venue:patio:{nuit,soirees,danses,concours,concours_nuit,morceaux}` (the paid night, nights out, dances, contests (unused), contest night (unused), requests), plus the shared NPC memory the game already has (`relate` → the relationship store; `recordVisit` → `visit_patio_<id>` / `seen_patio_<id>`, at most once per person per city hour). No new save field, no schema change, no wallet change.

## People and dialogue

Staff: **Boubacar** (security: the age, the fee, the house rule « un non, c'est un non », the hours, the programme), **Coumba** (the bar: the menu with prices, soft drinks, the house cocktail), **DJ Sidy**, **Pape** (the waiter). Eight guests have a word for you, by moment and place (`CAST` in `patioPlan.ts`, lines in `patioLines.ts`; French with everyday Wolof from the lexicon):

| Who | Role (data) | Age | Where / when |
|---|---|---|---|
| Tonton Ablaye | patron: the older regular who gossips about the neighbourhood and Madame Dione | 60 | bar stool; early, warm, dawn |
| Ibrahima | patron: a young man who talks football | 24 | bar stool; early |
| Aminata | patron: just promoted at the bank; a light flirt that invites to leave together — **which can only be declined** | 31 | salon sofa; early, warm |
| Fatou | patron: her birthday, with friends (Seynabou); walks over once | 27 | the floor's edge, dancing; warm, peak |
| Cheikh / Marième | patrons: a couple after an argument, he on the terrace, she in the salon | 38 / 36 | warm |
| **Rokhaya** | **worker**: works nights there, says so herself, as work: her children, the police, the owner, staying safe; walks over once | 33 | by the floor; early … dawn |
| **Ousseynou** | **worker**: the same, a man, hiding it from his family | 41 | the terrace's high table; peak, dawn |

**Who someone is comes from this data and from what they say — never from how they look or dress.** `patioLook(id, female)` takes an id and a gender and nothing else (a night-out mix from `randomLook`, seeded by the id; no kufi); `CAST` entries carry no look; staff wear authored uniforms. Not every woman is a worker (Aminata, Fatou, Marième are patrons), men work the night too, ages run 24 – 60.

**Walking over.** Rokhaya and Fatou may each walk over **once a night** to a player standing idle (3 s) in the open walk between the gate and the floor: a line through a toast, 1.5 m to a side (never in front, never on a collider, by a clear way — `approachPoint`), « Parler » offered; ignored (16 s, or the player leaves) they go back; they never follow, never repeat in the night, never block (a person has no collider and goes home at the first sign of an activity).

## Content rules (held by `tests/patioLines.test.ts` and the in-game check)

- Every conversation offers a respectful way to decline and everyone accepts it gracefully and says so (« Aucun problème, vraiment. Je ne force personne et personne ne me force. »); an answer to a no is never a question; the choices stay as they were; nothing changes in the save after a refusal.
- **No prostitution transaction, no sexual-service purchasing mechanic of any kind.** A choice is a label, an icon and an answer: no choice has a price or moves money to or from anyone; no line gives or discusses a price; the only prices written are the door's, the bar's menu and the DJ's request, in the doorman's, barwoman's and DJ's lines and on the signs. The only things the player pays for are the door and the bar (and the DJ's request). No « go upstairs / leave together » outcome: the one invitation to leave together (a patron's light flirt) has no choice that accepts it.
- No explicit sexual content, no sexual violence, no trafficking, no coercion, no minors: forbidden-vocabulary list in the test; the doorman asks for « 18 ans minimum » in the greeting, at the door and on the sign (« 18+ »); every guest is 21 or more; children appear only as someone's kids in a line (no ages).
- Stereotype-free: roles by data, mixed ages and genders; sex work is treated as work with dignity and realism (no leering, no jokes at anyone's expense, no comment on bodies or clothes — tested).

## Performance

Measured by `scripts/check-patio.mjs` on a 390 × 844 phone-sized page, SwiftShader (the numbers are the renderer's: `docs/proof/nightlife/patio/perf.json`; **not an iPhone**). The venue's geometry, built in merged batches by `drawPatio` (VenueKit's plain / wall / wood / paving, one neon batch, the lit dance-floor tiles, **one atlas** of painted signs, one board redrawn when the door opens or a night turns, **one mesh of additive light pools**, two beams, and one mesh that is either the day's (the shut leaves, the crates) or the night's (the rope and its posts)):

| | Medium | Low |
|---|---|---|
| Draw calls of the venue's own meshes, night, open (scene-graph count of what is drawn) | **12** (≤ 12 ✓) | **11** (one beam) |
| … by day (gate shut, no beams, no pools) | 9 | |
| Triangles of the venue's geometry (merged batches + sign planes), night | **11 200** (≤ 40 000 ✓): plain 5 864, neon 3 354, wood 922, night mesh 564, wall 412, day mesh 322, pools 28 … | **8 964** |
| Humanoids drawn at the peak | 10 (4 staff, 2 at the rope, 4 guests) | 7 |
| Humanoids at other moments | day 1, set-up 3, early 8, warm 10, dawn 7 | ≤ 7 |

The renderer's own count (`__dakar.renderBreakdown()`: the frame rendered again with the venue's group hidden, **shadow pass included**, the Cast's bodies not in it), before / after:

| View (night unless said) | calls without → with Le Patio | triangles without → with | the venue's share |
|---|---|---|---|
| the gate from the road | 105 → 119 | 254 838 → 266 066 | 14 calls / 11 228 tris |
| down the street | 101 → 111 | 250 500 → 261 672 | 10 / 11 172 |
| inside the courtyard | 37 → 50 | 201 956 → 213 180 | 13 / 11 224 |
| toward La Vague (the Patio behind) | 62 → 74 | 221 478 → 232 138 | 12 / 10 660 |
| the gate from the road, by day | 57 → 66 | 219 088 → 229 990 | 9 / 10 902 |

So the main pass is ≤ 12 draw calls; the widest view adds up to two more through the shadow pass (the plain, wall and wood batches cast shadows). Its bodies are `Cast` humanoids under the hub's shared budget (`ForeignBodies`: the nearest few are full bodies, the rest cheap figures). The music is a file of 821 571 B fetched once; the venue's textures are one 1 536 × 960 atlas, one 512 × 640 board and a 9 × 6 tile texture. Updates: the pools and the tiles change only when a value changes (on the beat for the tiles); the venue is updated at 5 Hz when more than 90 m from the camera (the venues module's far step) and draws its lights only while seen.


## What was run

- `npx tsc --noEmit`: clean (the tests are in its scope).
- `npx vitest run tests/club*.test.ts tests/almadies*.test.ts tests/nightStreet.test.ts tests/patio*.test.ts tests/venues*.test.ts tests/dance*.test.ts` plus `inWorldActivities`, `presence`, `presence-client`, `meetups`, `wolof`, `wolof-lines`, `activity`, `primitives`, `rooftopPlan`, `castWalk`, `audioUnlock`: 26 files, 769 tests, all green. `tests/patio.test.ts` (30 tests) and `tests/patioLines.test.ts` (18) are new; the content tests were also tried against five deliberate breakages (a price in a worker's line, an explicit word, pressure in a decline, a minor's age, a price on a choice): each makes them fail.
- The **full suite** `npx vitest run`, once, at the end: 234 files passed, 2 skipped (the existing host / live ones); 3 451 tests passed, 4 skipped; no failure.
- `scripts/check-patio.mjs`, in the game (Chromium on SwiftShader, 390 × 844, touch, **real touch events for the walks, the taps on the action button and the sheets**): **61 / 61 checks**, the last run (`docs/proof/nightlife/patio/check-results.json`). It plays the door by day and by night (the rope and the shut gate stop a thumb; the age and the fee are shown before anything is paid; paid once, one ledger line), the lane past the gate, the courtyard, a beer and a soft drink at the bar and a drink at a salon table (the wallet falls by exactly each price, one ledger line each), a patron, a worker — asked about the job, the police and safety, then **declined**: the reply is graceful, no money, no ledger line, no counter, no need changes — a flirt that invites to leave together (only declinable), a walk-over once per person and a return when ignored, a dance on the floor (the beat game is finished with the labelled `gestureFinish` shortcut, on Le Patio's own music and 0.6 s beat) and the DJ's request, the raised terrace by its own door, « Sortir », a regular's free entry the next night, 11:00 / 02:00 / 03:30 / 19:00 / 20:30, Low, and no page errors. Labelled shortcuts: `teleport` to the district, `place` onto the promenade or beside a person, `setHour`, `gestureFinish`, `cam` for the pictures, a **pin of Le Patio's night number** (the city day keeps turning while the hour is held, so a long run crosses a day boundary and the door would shut on a guest who paid; `patioShift` holds the night, La Vague's clock is untouched).
- `scripts/check-venues.mjs` (the existing check, phone, La Vague's section only: its door, floor, contest, bar, lounge, DJ, exit) against the same build: **32 / 32**. La Vague works as before.
- Found and fixed on the way by the in-game check: the unpaid player walking into the porch counted as « inside » and opened the gate (`insideNow` now stops at the doorway's thickness).

## Limits (honest)

- **Not an iPhone test.** Chromium touch emulation + real touch events (CDP) on SwiftShader; frame rates there say nothing about a phone.
- **Nobody has listened to the music**: its musicality, its mix, the muffling's feel and whether the beat game feels on the beat on a real device are unverified (the headless browser's audio output is not a speaker). What was verified is that the file is fetched, decoded and asked for at the right level, and that the dance reads its tempo.
- Le Patio is **not** a meeting place in the online catalogue (`src/online/meetups.ts`) and has no entry in the Almadies evening module (`src/districts/almadies.ts`): both are outside this lane's files.
- The cast is `Cast` bodies (8 – 10 at the peak on Medium, at most 8 on Low); there is no instanced dance-floor crowd, so the floor is sparse at the peak compared with La Vague's.
- Nothing is shared between the two clubs: a player on one terrace is not in the other's presence space.
- The raised terrace uses a wrapper of `world.heightAt` installed by the venue and restored on dispose; the follow camera's behaviour against the 3.4 m walls was checked on the pictures only.
- Wolof lines are the game's own drafts from the lexicon (to be read again with Habib and the Wolof lane), like the club's.
- `docs/districts/ALMADIES-NIGHTLIFE.md` (the owner's) is not in this branch; its pointer to `src/venues/patio.ts` resolves here.
