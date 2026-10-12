# DAKAR REK — A Living Senegal

Product vision, from Habib, 12 Oct 2026. **Not just a simulation of Dakar. A playable experience of Senegalese life.**

A beautiful street attracts attention; it does not keep anyone. What keeps people playing is what happens and who is
there: football in Yoff, friends gathering at the Corniche, children playing Langaa Buri, wrestlers training in Pikine,
and the feeling that there is always something new to find around the city.

This document complements [LIVING_DAKAR.md](LIVING_DAKAR.md) (9 Oct). That document sets the systems and the design
rules: one interaction system, one activity framework, the economy, ownership and transport. This one says what they
are for and records the product decisions. Work, money and property stay — as ways into the life of the city, not as
the point of it.

**Status.** Only what is marked **in the game** exists and has been checked. Everything else in this document is a
**proposal** until it is built and verified.

## Five pillars

1. **The city keeps its own rhythm.** Things happen at their hours and on their days whether the player is there or
   not: joggers on the Corniche at sunrise, the fish landing at Soumbédioune, football in the evening, the
   Sunday-morning match, attaya, Friday prayer, gala nights at the arena. Players learn the rhythm and plan their day
   around it — "I'll be there for the 17 h match" is a reason to come back tomorrow.
2. **What you see, you can join.** A gathering is never only scenery. Watching is the first step, joining is the
   second, belonging is the third: the ball comes to you, a wrestler waves you into the training circle, a place
   frees up at the attaya. Every group activity of the city's people needs a way in for the player.
3. **People remember you.** Acquaintances become friends, regulars get their perks, an écurie knows its wrestlers,
   real players meet in the same place at the same moment. Being recognised is a reward. Places where friends gather
   and invitations bring players together.
4. **Senegalese life, played with respect.** Football and the navétanes, làmb, Langaa Buri, attaya, dames, teranga,
   Wolof greetings. Accuracy before invention: the rules, words and customs of a game or a tradition come from Habib
   (or a verified source) and are confirmed before they are built — the same rule as religious text. The respect
   rules of LIVING_DAKAR.md stay (the mosque is calm; no reward for religious practice).
5. **The city rewards curiosity.** A place you did not know, a person with a story, something that only happens at a
   certain hour, a view at sunset. People's talk and the phone's news point to things; the world does not list
   everything on a map.

## The "why stay" test

It extends the activity density rule of LIVING_DAKAR.md. Every district — and every new feature — answers:

| | Question |
| --- | --- |
| **Rhythm** | What happens here, at what hours and on what days? |
| **Join** | What can I take part in, and with whom? |
| **Belong** | Who knows me here, and what changes when they do? |
| **Discover** | What is here that I would not find on my first visit? |

A feature that adds scenery but answers none of these comes after one that does.

## Decisions (12 Oct)

### 1. Dakar Street DNA

Each playable neighbourhood develops a recognisable spatial identity: its street layouts, ground surfaces, building
typologies, courtyards, roads and public spaces. Pikine, Parcelles, Plateau and Almadies must not look like identical
rectangular blocks in different colours.

- **In the game:** every hub comes from the same generator — a 4 × 4 grid of 46 m square blocks between 14 m roads
  (`src/world/builder.ts`: `BLK`, `ROAD`, `NB`) — varied by a building style per hub (dense, student, villa,
  banlieue), palette, number of floors, ground colours and a few special blocks (arena, market, mosque, port…). Parcelles has no area of its own: a café of the Pikine hub carries
  its name.
- **Proposal:** start by validating **one convincing street in Pikine** — its layout, ground, buildings, courtyards
  and the life in it — before extending the approach to other streets and neighbourhoods.

### 2. Corniche V2

**Primary spatial reference:** Habib's latest aerial photograph (12 Oct) — the central **circular concrete plaza**, a
major social gathering space where **children play**; the **curved amphitheatre** of stepped seats in bands of colour
facing the water; the **turquoise bay** closed by **rocky breakwaters**; the **sandy coastline**; the **boulevard**
behind its palms; and the **paths** connecting them. Habib's other Corniche photos (the palm promenade, the outdoor
fitness park, the stepped terraces under the orange pergola, the T-shaped jetty, football on the sand) are secondary
references. All are other people's work: references for layout, colour and use only — never traced or used as
textures, no real brand, logo or product (`docs/ASSET_REGISTER.md`); they are not stored in the repository.

- **In the game:** the Corniche hub (« Corniche · Fann · Mamelles ») has the Monument, an outdoor gym, a pitch, a
  promenade with joggers at their hours, and the actions « Courir » and « Faire les barres ».
- **Proposal:** the first playable activity reuses the existing running and movement mechanics (for example, a run
  round the plaza, along the amphitheatre and the breakwater paths, among the city's joggers).
- **Rule:** the environment must offer meaningful gameplay, not just better scenery — the plaza is where children
  play and friends meet, the amphitheatre's steps are seats, the paths lead somewhere. Each element answers the
  "why stay" test.

### 3. Langaa Buri — rules supplied by Habib

- **The game:** an object — traditionally a knotted cloth or rope — is hidden. Players follow clues to discover it.
  The finder then chases the other participants and playfully strikes or tags them with the object.
- **Memory:** Habib remembers the interregional competitions televised on RTS1.
- **Rule:** preserve these fundamentals. Before implementation, clarify the remaining details: how points are scored,
  who hides the object and gives the clues, how a round ends, and how many rounds make a game.
- **In the game:** nothing yet; children appear only in the arena crowds.

### 4. Yoff football

- **In the game:** at match hours (17 h–19 h 30, and Sunday morning) people of the city run about inside the pitch
  of the Corniche hub (`src/social/ambientData.ts` `foot`): a running animation, with no ball, no passes and no
  goals. **This is not a football simulation.** Yoff is part of the Almadies hub (« Almadies · Ngor · Yoff »), which
  has no field yet.
- **Proposal, first:** believable NPC football on the existing field, built on the existing movement architecture
  and kept light. In order: synchronised ball contact (the foot meets the ball), passing, dribbling, shooting, goals
  and celebrations.
- **Benchmark:** the MonkeyPost video Habib supplied (12 Oct; a 15 s screen recording of a post presenting a street
  football game made in Nigeria), for natural movement and enjoyable play. What it shows: five-a-side on a painted
  concrete court with small goals, between colourful houses and shops, people watching along the walls; an elevated
  camera that reads the whole court, with closer shots at the goal; the ball kept at the players' feet; a scoreboard
  with both teams, the score and a short match clock (2 min 30 s halves); a « GOAL! » moment naming the scorer; a
  training mode; a street nickname and play-style tags for the player. A reference for feel and pace only — another
  studio's game: learn from it, never copy its art, code or interface. It is not stored in the repository.
- **Proposal, later:** playable navétanes, once the NPC football is convincing.

### 5. Rewards and rankings

- **FCFA** stays the everyday economy: wallet, prices, jobs, purchases.
- **Proposal:** earnable **gems**, **achievements**, **cosmetics**, **collectibles** and **trophies** for meaningful
  accomplishments, not for routine actions (and never for religious practice).
- **Proposal:** start with **one simple weekly leaderboard per competitive activity**, showing verified player
  results only.
- **Rule:** no invented regional rankings; never assume a player's geographic origin.
- **In the game:** the làmb career has its ladder, points and a seasonal city table, and « Combat classé » keeps a
  ranking on the device; there is no shared, verified leaderboard yet.

### 6. Development priorities

1. **Finish wave 5 and the animation integration** (in progress).
2. **Lightweight NPC football**, using the existing movement architecture (proposal).
3. **Dakar Street DNA** (one Pikine street first) and **Corniche V2**, as two distinct environmental milestones
   (proposals).
4. **Langaa Buri prototype**, once the movement and social systems it needs are stable (proposal).

## Where we stand (12 Oct)

The rhythm already exists for the city's people (`src/social/ambientData.ts`): joggers and the outdoor gym
6 h–9 h 30 and 17 h–20 h 30, the fish landing morning and late afternoon, wrestling training at the écurie, attaya,
dames, the Friday prayer, the Dibi at night, people running on the pitch in the evening. What is mostly missing is the
player's way in.

| Reason to stay | In the game | Missing (proposals) |
| --- | --- | --- |
| **Football** | People running on the Corniche hub's pitch at match hours; no ball. | NPC football (decision 4), then the navétanes. |
| **Friends at the Corniche** | Multiplayer presence and location-aware chat; greetings, names, regulars; jogging and pull-ups; sitting together at the arena (`src/arena/together.ts`). | Corniche V2 (decision 2): the plaza, the amphitheatre and the paths as places to meet and play; joining a friend's activity in one step. |
| **Children playing Langaa Buri** | Children only in the arena crowds. | Children in the streets and Langaa Buri (decision 3). |
| **Wrestlers training in Pikine** | The strongest part: écurie, guided training with Coach Ablaye, the career ladder, gala nights, the drills (`docs/CAREER.md`, `docs/LAMB2.md`); the écurie's wrestlers train 6 h 30–10 h and 16 h–19 h. | Training with them: the player joins the group session at its hours, not a solo drill. |
| **Neighbourhoods you recognise** | One block generator for every hub. | Dakar Street DNA (decision 1), one Pikine street first. |
| **Discovering new things** | Places and venues in four hubs, story beats, NPC routines, phone news, the Carnet. | Things that appear at their hour, places revealed by people, the Carnet keeping what you found. |
| **Rewards** | FCFA; the làmb ladder and a ranking kept on the device. | Gems, achievements, cosmetics, collectibles, trophies; weekly verified leaderboards (decision 5). |

## Open questions for Habib

- **Langaa Buri:** the scoring and round details listed in decision 3.
- **The football field:** the existing field is in the Corniche hub. Is it the Yoff field for now, or does Yoff get its own field in the Almadies hub later?
- **Weekly leaderboards:** what counts as a verified result for each competitive activity, and which day the week resets.
