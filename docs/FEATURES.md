# Dakar Rek — feature status

Legend: **Implemented** = works and was verified (unit tests and/or headless browser checks). **Partial** = a first working version with stated limits. **Pending** = not started. Placeholders are never listed as implemented. Cultural content is always marked **Unreviewed** until Habib and wrestling practitioners have reviewed it.

Last updated: visual pass (7 October 2026). Verification: 17 unit tests; 48 headless Chromium checks at 1280×720 and 390×844 (`scripts/shots.mjs`), all passing. Before/after captures: `docs/VISUAL_PASS.md`.

## Implemented

| Feature | Notes | Verified by |
| --- | --- | --- |
| Vite + TypeScript + Three.js project | `npm run dev`, `npm run build`, `npm test` | build, tests |
| Four hubs reachable | Plateau · Médina, Corniche · Fann · Mamelles, Almadies · Ngor · Yoff, Pikine · Guédiawaye · Parcelles, each with its own look | headless: all four load, day and night, desktop and phone |
| Travel between hubs | Car rapide station in every hub; costs FCFA and some fatigue | headless: Pikine → Corniche |
| Third-person camera, desktop and touch movement | Joystick + drag on touch; WASD/ZQSD/arrows + mouse on desktop | headless |
| Contextual action button and data-driven actions | Cost, gain, needs, duration, requirements, visibility | headless |
| Needs and mood | Drain with personal played time | unit tests |
| Guest save (schema v2) | Device-local, versioned, migrated from v1, autosave | unit tests, headless reload |
| Recurring cast with NPC–NPC relationships | 12 characters across the four hubs; 11 authored links (friends, cousins, rivals…) | unit tests |
| Persistent relationship states | Levels, flags, completed beats; saved; no offline decay | unit tests |
| Short branching story beats | 13 beats, 1–3 choices; recommendation, rival introduction, vendor remembering help, écurie celebration, news travelling between friends | unit tests, headless (UI choice) |
| Beats unlock jobs and discounts | Trusted rate at Modou's garage, Ousmane's morning pirogue, friends' prices at two gargotes, paid service at Le Pointe | unit tests |
| One suggested next step | HUD chip + journal (Carnet) | headless |
| Walkable interiors | Starter room (Pikine) and gargotes (Plateau, Corniche, Pikine): Entrer/Sortir, collisions, room camera, ceiling light, actions inside (sleep, wash, order); saving indoors stores the door position | headless (enter, wall collision, exit) |
| Maïga | Smaller, dirtier gargote (Habib's definition) in Pikine and at Fann: walk-in narrow room, cheapest dishes | headless (enter) |
| Dibiterie | Walk-in grilled-meat shop in Pikine (next to the starter home) and the Plateau: dibi mouton, brochettes, sit on the bench; grill smoke, cook, butcher and customers | headless (walk in from the street, counter prompt) |
| Monument stair | The player can climb the monument stair to the statue's terrace; the camera follows the slope | headless (climb) |
| Car rapide and apprentice | Painted car rapide after Habib's references at every station and in traffic; the apprentice calls destinations at the door when the player is near, and rides the step on moving ones | headless captures |
| Corniche landmarks | Monument de la Renaissance after Habib's photos (straight stair, rock base, bronze group) with joggers on the stair, people training at the top and festive groups at the foot; Corniche Ouest road and the yellow-arched promenade (walkable) | headless captures (`__dakar.cam`); player cannot climb the stair yet |
| Rendering pass | Tone mapping, sky dome with haze/sun/stars, procedural grain and seamless textures, partial night windows, lamp light pools; Low quality turns per-pixel extras off | headless captures day/night, desktop/phone |
| Training, entrance and stands scenes are distinct | Separate settings, camera, sound and on-screen label | headless (each scene runs and ends) |

## Partial

| Feature | What exists | What is missing |
| --- | --- | --- |
| Làmb presentation | Écurie training, arena entrance (walk-in, dance, preparation), preparation, stands, écurie celebration; crowd reactions; percussion | **Unreviewed**: dances, gestures, rhythms are placeholders; real sabar recordings or validated rhythms; entourage roles |
| Ngemb and accessories | 6 colours, 4 patterns, 2 cuts on the Blender rig; 4 accessory sockets with neutral placeholder items; cosmetic only | **Unreviewed**: real attire references, gris-gris chosen from validated references |
| Mbakkou emotes | 3 placeholder emotes (Blender clips), started from the écurie | Real steps validated by practitioners; playable performance (later, needs design) |
| Wrestling character (Blender) | Skinned rig with 20 bones, 2 ngemb cuts, 4 sockets, 10 clips including Stance, Grab, Fall_Back | Mesh is segmented (rigid joint blending), no hands/face detail; grab/fall deformation not yet checked with paired animations; not yet used for the city player |
| Combat | Arena entry point and stance/grab/fall clips | Rule set unresolved (lutte simple or avec frappe); no fight implemented |
| City clock | From the device clock | Server time |
| Jobs | Simple timed jobs in each hub + trusted-rate variants | Tiak Tiak, clando and Yango driving jobs |
| Food venues | Order and eat; friends' discounts; walkable gargote interiors with tables and counter | Sitting animation at tables, Maïga-style spot, dibiterie, nightlife |
| NPCs | Recurring cast standing at their places; background walkers | Daily routines and movement between places |
| Quality settings | Low / Medium / High; Low also drops grain, detail textures and decorative props | Automatic choice from measured performance; real-phone measurements |
| Generated references and textures | Plan, prompts and provenance rules in `docs/HIGGSFIELD_PLAN.md` | Not run: Higgsfield sign-in not available in the cloud session; 0 credits spent |

## Pending

Driving (Tiak Tiak, clando, Yango) · vehicle radio · shared vehicles and anti-blocking · family home and apartment interiors · nightlife and dance areas · shared meals · multiplayer (presence, chat, home visits, invitations) · social money · bills and tontines · housing progression · mosque and collective prayer · Quran reading · làmb combat · traits, wishes, aspiration · skills beyond counters · city milestones · photo mode · live statistics · accounts, server ledger, migrations (Supabase + Drizzle) · session servers (Durable Objects) · asset CDN · monitoring.

## Provisional decisions taken without review

- Cast names, roles, links and all beat text are an editable draft (`src/social/cast.ts`, `src/social/beats.ts`).
- Écurie names "Baobab" and "Teranga" are fictional placeholders, chosen so no real écurie is represented.
- Ngemb cut B is shown when the "Bordure" pattern is picked (temporary mapping until a cut selector exists).
- Percussion is synthesised in the browser from a generic pattern, not a sabar rhythm.
