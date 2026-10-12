# DAKAR REK — A Living Senegal

Direction from Habib, 12 Oct 2026. **Not just a simulation of Dakar. A playable experience of Senegalese life.**

A beautiful street attracts attention; it does not keep anyone. What keeps people playing is what happens and who is
there: football in Yoff, friends gathering at the Corniche, children playing Langaa Buri, wrestlers training in Pikine,
and the feeling that there is always something new to find around the city.

[LIVING_DAKAR.md](LIVING_DAKAR.md) (9 Oct) built the means: one interaction system, one activity framework, an
economy, ownership, transport. This document says what they are for. Work, money and property stay — as ways into
the life of the city, not as the point of it.

## Five pillars

1. **The city keeps its own rhythm.** Things happen at their hours and on their days whether the player is there or
   not: joggers on the Corniche at sunrise, the fish landing at Soumbédioune in the afternoon, football from 17 h,
   the Sunday-morning match, attaya in the evening, Friday prayer, gala nights at the arena. Players learn the rhythm
   and plan their day around it — "I'll be at the beach for the 17 h match" is a reason to come back tomorrow.
2. **What you see, you can join.** A gathering is never only scenery. Watching is the first step, joining is the
   second, belonging is the third: the ball comes to you, a wrestler waves you into the training circle, a place
   frees up at the attaya. Every group activity of the city's people needs a way in for the player.
3. **People remember you.** Acquaintances become friends, regulars get their perks, an écurie knows its wrestlers,
   real players meet in the same place at the same moment. Being recognised is a reward. Places where friends gather
   (the Corniche terraces, the attaya on the square, the Dibi at night) and invitations bring players together.
4. **Senegalese life, played with respect.** Football and the navétanes, làmb, children's games such as Langaa Buri,
   attaya, dames, teranga, Wolof greetings. Accuracy before invention: the rules, words and customs of a game or a
   tradition are confirmed by Habib (or a verified source) before they are built — the same rule as religious text.
   The respect rules of LIVING_DAKAR.md stay (the mosque is calm; no reward for religious practice).
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

## Where we stand (12 Oct)

The rhythm already exists for the city's people (`src/social/ambientData.ts`): joggers and the outdoor gym
6 h–9 h 30 and 17 h–20 h 30, the fish landing morning and late afternoon, wrestling training at the écurie, attaya,
dames, the Friday prayer, the Dibi at night, football in the evening and on Sunday morning. What is mostly missing is
the player's way in.

| Reason to stay | In the game today | Missing |
| --- | --- | --- |
| **Football** (Yoff, the beach, the pitches) | Matches of the city's people on the pitches, 17 h–19 h 30 and Sunday mornings (`src/social/ambientData.ts` `foot`); watched only. Yoff is a car rapide destination, not a district. | Joining a match (pass, shoot, a score people talk about); football on the Corniche beach; Yoff and its football culture; the navétanes season. |
| **Friends at the Corniche** | Multiplayer presence and location-aware chat; greetings, names, regulars; the Corniche hub (running and pull-ups, Soumbédioune, the Monument, a pitch); sitting together at the arena (`src/arena/together.ts`). | The Corniche as a meeting place: the promenade, the terraces, the fitness park busy in the evening, sunset; joining a friend's activity in one step. |
| **Children playing Langaa Buri** | Children only in the arena crowds (on a lap, at the rail). | Children in the streets and their games — rules to be specified by Habib first. |
| **Wrestlers training in Pikine** | The strongest pillar: écurie, guided training with Coach Ablaye, the career ladder, gala nights, the drills (`docs/CAREER.md`, `docs/LAMB2.md`); the écurie's wrestlers train 6 h 30–10 h and 16 h–19 h. | Training with them: the player joins the group session at its hours (also on the beach), not a solo drill. |
| **Discovering new things** | Places and venues in four hubs, story beats, NPC routines, phone news, the Carnet. | Discovery as a goal: things that appear at their hour, places revealed by people, the Carnet keeping what you found. |

## The Corniche as it is now (reference photos, 12 Oct)

Habib's photos of the redeveloped Corniche Ouest: a palm-lined promenade beside the road; the outdoor fitness park
on the cliff top, full of people in the evening; stepped terraces in orange, red and ochre under an orange pergola,
where friends sit facing the sea; rock breakwaters and a T-shaped jetty; football on the sand; a round plaza by the
water; the monumental arch by the sea. The Corniche hub should feel like these places **in use**: the fitness park is
busy at 18 h, the terraces are where people meet, the beach has its matches.

The photos are other people's work (photographers' marks): references for layout, colour and use only — never traced
or used as textures; no real brand, logo or product (the asset rule of `docs/ASSET_REGISTER.md`).

## First slice, after the wave 5 integration: "the Corniche at 18 h"

Proposed, not started — nothing new begins before the wave 5 integration is validated.

1. **The evening rhythm.** Joggers on the promenade and the fitness park busy from 17 h to 20 h; the player trains
   among them on the same equipment (running and pull-ups already exist).
2. **Beach football.** A match of the city's people the player can join — a kick-about first (receive, pass,
   shoot), not a full simulation; the result comes back in the phone's news.
3. **The terraces.** Seats facing the sunset where friends gather; real players meet there; « Rejoindre » joins a
   friend's activity.
4. **Children.** Kids on the promenade and the beach, playing a game specified with Habib.

Then: training in Pikine as an event; Yoff and football (navétanes); discovery kept in the Carnet.

## Open questions for Habib

- **Langaa Buri:** how it is played — rules, who plays, where — before anything is built.
- **Yoff:** a new district, or part of an existing hub?
- **Football:** how deep — a kick-about, five-a-side with rules, the navétanes as a season?
- **The Corniche:** which stretch to model (Soumbédioune, Fann, Mermoz…)?
