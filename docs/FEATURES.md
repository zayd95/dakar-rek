# Dakar Rek — feature status

Legend: **Implemented** = works and was verified (unit tests and/or headless browser checks). **Partial** = a first working version with stated limits. **Pending** = not started. Placeholders are never listed as implemented. Cultural content is always marked **Unreviewed** until Habib and wrestling practitioners have reviewed it.

Last updated: phone, economy, arena, NPC life and chat lanes merged on top of city life (8 October 2026). The city extends the latest visual/arena pass while retaining the existing multiplayer integration. Acceptance commands and limits: `docs/CITY_LIFE.md`; earlier visual comparisons: `docs/VISUAL_PASS.md`.

## Implemented

| Feature | Notes | Verified by |
| --- | --- | --- |
| Populated city blocks | Soumbédioune landing beach, painted pirogues, fish market and crafts; Dakar Life Mall and four shops; two Banque Teranga agencies; neighbourhood boutiques, repair shop, salon and four meeting squares. Timed services, food and social activities; public spaces remain in the existing presence rooms | `npm run check:city`; details and limits in `docs/CITY_LIFE.md` |
| Places directory | Current neighbourhood's new venues, direction/distance walking marker, automatic arrival, reusable phone hook | desktop/touch acceptance |
| In-game phone | ☰ / Échap / M opens it (movement off while open): status bar with city time and FCFA balance; Portefeuille (ledger), Carte (four hubs, travel cost/time, "Choisir un repère à pied"), Arène (sporting profile), Carnet, Aide, Réglages (quality that keeps you in the room, sound on/off, camera sensitivity, save now, new game with confirmation); module apps appear only when their hook exists: Coins du quartier, Travail, Maison et proches, Habitants, Messages (online build). Replaces the old system menu | `scripts/check-phone.mjs` (55/55, desktop, 390×844, landscape) |
| Text chat between players (online build) | Proximity messages (30 m, same space) with bubbles, private messages within the group, mute / block / report per device, 200 characters, 5 messages per 10 s, server-side identity and dedupe across reconnects; private spaces refuse chat. Report is logged, not yet reviewed by moderators | `tests/chat.test.ts`, `npm run check:chat` (30/30, local Workers runtime, two clients) |
| Vite + TypeScript + Three.js project | `npm run dev`, `npm run build`, `npm test` | build, tests |
| Four hubs reachable | Plateau · Médina, Corniche · Fann · Mamelles, Almadies · Ngor · Yoff, Pikine · Guédiawaye · Parcelles, each with its own look | headless: all four load, day and night, desktop and phone |
| Travel between hubs | Car rapide station in every hub; costs FCFA and some fatigue | headless: Pikine → Corniche |
| Third-person camera, desktop and touch movement | Joystick + drag on touch; WASD/ZQSD/arrows + mouse on desktop | headless |
| Contextual action button and data-driven actions | Cost, gain, needs, duration, requirements, visibility | headless |
| Needs and mood | Drain with personal played time | unit tests |
| Guest save (schema v3) | Device-local, versioned, migrated from v1 and v2 (v3 adds wallet history, furniture, deliveries; old saves start with an empty ledger and no furniture), autosave | unit tests, headless reload, old off-map v2 save |
| Wallet history (ledger) | Every money change goes through `GameState.addMoney(amount, label)` and is kept in the save (last 100): meals, travel, timed jobs and the city's paid services (with the place name), purchases, story rewards, deliveries, furniture. Exposed as `phoneHooks.ledger` (newest first) and in the phone (Portefeuille). **Local to the device; no server ledger.** | unit tests, `scripts/check-economy.mjs` |
| Tiak Tiak deliveries (on foot) | `src/economy/jobs.ts`: 5 routes in Pikine, 4 in Plateau, each between existing places (gargotes, dibiteries, Maïga, Boutique Diallo, Salon Awa, Banque Teranga, squares, Sandaga, Atelier Ndeye, Dakar Réparation); accept at the pick-up (or from the jobs app, then collect the parcel), glowing ring + the city's walking arrow + HUD line with distance and generous timer; paid on arrival, late pays 60 %, small fatigue; each run has an id and is paid once; cancel pays nothing; the first client recommends a better-paid run. Pay table provisional (`src/economy/config.ts`) | unit tests, `scripts/check-economy.mjs` |
| Jobs app | `phoneHooks.openJobs`: Tiak Tiak offers + every paid service of the current hub's places (pay, energy, distance); picking a service sets the city's walking marker (no teleport) | `scripts/check-economy.mjs` |
| Starter-room furniture | `src/economy/furniture.ts`: mirror, rug, two chairs, radio (no real station, no sound), better mattress, small TV; bought at the "Quincaillerie · meubles" stall next to the Maïga du marché (Pikine) or from `phoneHooks.openHome`; drawn in the room with its action; the room rebuilds after a purchase. Prices provisional | unit tests, `scripts/check-economy.mjs` (room before/after) |
| Tonton Ibou reacts | Draft beats after the first delivery and the first furniture; each sets the next goal shown by the suggestion chip | unit tests, headless (UI) |
| Recurring cast with NPC–NPC relationships | 15 characters across the four hubs (with the Diallo family — Mamadou, boutiquier at the Boutique Diallo, and his niece Kadiatou, student at Fann — and Ndeye, couturière at the Atelier Ndeye); 19 authored links | unit tests |
| Persistent relationship states | Levels, flags, completed beats; saved; no offline decay | unit tests |
| Short branching story beats | 17 beats, 1–3 choices; recommendation, rival introduction, vendor remembering help, écurie celebration, news travelling between friends, the Diallo delivery, Kadiatou's survey, Ndeye's festival order | unit tests, headless (UI choice) |
| NPC daily routines | Each recurring character has a schedule by city hour (home, work, meals seated at the gargote/Maïga/café, attaya on the grand-place, Place de la Médina, Fann square, Soumbédioune beach); walks between places on the sidewalks (collision-checked graph), holds a pose (seated with knees fixed, talking, waiting, stance); can be talked to anywhere; respects `setHour` | unit tests, `scripts/check-npc.mjs` (paths audited in all four hubs, poses at 8h/12h/14h30/20h) |
| NPC memory and recognition | Visits (one per city hour) and services at their place counted in the existing save counters/flags; regular after 3; greetings vary with remembered help, commitments, activity and hour; regular perks; introductions unlock someone's beat; "Les gens du quartier" list (`phoneHooks.openPeople`) | unit tests, `scripts/check-npc.mjs` |
| Everyday situations | Shared meal at the Maïga (pay for Babacar or not → he remembers, favour later) and attaya on the grand-place (news unlock a delivery job or the port); once per city day, texts vary with who is there and earlier choices | unit tests, `scripts/check-npc.mjs` |
| Beats unlock jobs and discounts | Trusted rate at Modou's garage, Ousmane's morning pirogue, friends' prices at two gargotes, paid service at Le Pointe | unit tests |
| One suggested next step | HUD chip + journal (Carnet) | headless |
| Walkable interiors | Starter room (Pikine) and gargotes (Plateau, Corniche, Pikine): Entrer/Sortir, collisions, room camera, ceiling light, actions inside (sleep, wash, order); saving indoors stores the door position | headless (enter, wall collision, exit) |
| Maïga | Smaller, dirtier gargote (Habib's definition) in Pikine and at Fann: walk-in narrow room, cheapest dishes | headless (enter) |
| Codex integration | PR #2 (vehicle GLTF materials), #3 (multiplayer presence, Cloudflare Worker), #4 (launch controls) fast-forwarded into `wip/visual-pass` on top of the visual pass; 23 unit tests, server typecheck, 17 online checks and 11 launch checks + full gameplay suite pass | Deployment from the owner's Cloudflare account; real phones |
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
| Combat (làmb) | Controlled bout against local opponents, discipline "sans frappe" (`src/lamb/rules.ts`, `docs/LAMB_RULES_PROVISIONAL.md`, "Adaptation de jeu — provisoire, à valider"): referee call, 90 s timer, camera-relative movement, guard, grab, **dégagement** (timed break-away in a losing empoignade, step back in neutral), **response window** on the opponent's grabs, readable **openings** after failed grabs, empoignade tug bar, projection, referee decision on points at time-out, **Abandonner** with confirmation (recorded apart, no reward), recap screen. Three fictional opponent styles (costaud, rapide, défensif) with levels 1–5 from the record. Modes: guided training with Coach Ablaye at the écurie (5 tutorial steps, `lamb_skill`), friendly and ranked at the arena with separate records (`lamb_amical_*`, `lamb_classe_*`; `combats`/`victoires` kept). Phone arena profile hook. Verified by `tests/lamb.test.ts` and `scripts/check-lamb.mjs` | Practitioner review of every rule and gesture (list in the rules doc); strikes ("avec frappe" config is ready but disabled); paired throw animations; synchronised two-player duel (server match state, interface sketched in the rules doc) |
| City clock | From the device clock | Server time |
| Jobs | Simple timed jobs in each hub + trusted-rate variants; Tiak Tiak deliveries on foot | Driving (Tiak Tiak by scooter, clando, Yango); Tiak Tiak in Corniche and Almadies |
| Food venues | Order and eat; friends' discounts; walkable gargote interiors with tables and counter | Sitting animation at tables, Maïga-style spot, dibiterie, nightlife |
| NPCs | Routines, memory, situations (see above); background walkers | **Brouillon à relire par Habib**: sheets, lines, origins and humour in `src/social/profiles.ts`; Wolof/Pulaar/Sérère expressions are TODO placeholders; NPCs stay in their hub; no eating/serving props in hand |
| Quality settings | Low / Medium / High; Low also drops grain, detail textures and decorative props | Automatic choice from measured performance; real-phone measurements |
| Multiplayer presence | Cloudflare Worker + hibernatable Durable Objects; groups per hub; visible remote avatars, profiles, movement/poses, shared public interiors, invite links and reconnects; local two-client checks | Production deployment, real-phone verification and load testing; accounts, shared economy, chat, invitations to personal homes and multiplayer combat |
| Generated references and textures | 100 authorised Higgsfield credits used; 50 references and textures with prompts and provenance (`docs/HIGGSFIELD_PLAN.md`, `assets-src/references/PROVENANCE.md`); textures in game | Review of batch 3 and the latest views by Habib; elevations still to be turned into the Blender facade kit |

## Pending

Driving (Tiak Tiak by scooter, clando, Yango) · vehicle radio · shared vehicles and anti-blocking · family home and apartment interiors · nightlife and dance areas · voice notes, group chats and personal home visits · moderation queue for reports · social money · bills and tontines · housing progression beyond the starter room · mosque and collective prayer · Quran reading · traits, wishes, aspiration · skills beyond counters · city milestones · photo mode · live statistics · accounts, server ledger, migrations (Supabase + Drizzle) · production deployment and load testing · monitoring.

## Provisional decisions taken without review

- Cast names, roles, links and all beat text are an editable draft (`src/social/cast.ts`, `src/social/beats.ts`).
- NPC sheets, routines, reactions and situations are a draft (`src/social/profiles.ts`, `routines.ts`, `situations.ts`): origins, households and humour invented for the prototype; no Wolof, Pulaar or Sérère text beyond words already in the game.
- The exported `Sit` clip bends the knees backwards; the cast uses a derived `Seated` clip (knee rotation mirrored at load). The ambient sitters still use `Sit`.
- Écurie names "Baobab" and "Teranga" are fictional placeholders, chosen so no real écurie is represented.
- Ngemb cut B is shown when the "Bordure" pattern is picked (temporary mapping until a cut selector exists).
- Percussion is synthesised in the browser from a generic pattern, not a sabar rhythm.
