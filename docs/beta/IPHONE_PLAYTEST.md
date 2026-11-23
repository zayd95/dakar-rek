# iPhone playtest of the release candidate (Gate B)

**Why this exists.** Every result in `docs/districts/M*-EVIDENCE.md` and `docs/ld2/LD2_*.md` comes from headless Chromium with a software renderer
(SwiftShader), at about 5 frames a second. Draw calls and triangles carry over to a phone; **frame times do not**, and the scripted drivers there
had to be slowed down (no boost) because a 5 fps page cannot steer a car at 190 km/h. So nothing yet says how the build plays on an iPhone.
This page is the playtest that does: about 25 minutes, one build, real numbers off the phone, and a report that comes back in one message.

**Not on production.** The build is a private preview (a claude.ai artifact, the same link as before) made from the **release candidate**: branch `integration/rc-20261101`, the commit named in the report that came with this guide (the remote refused a git tag, so the SHA is the identity). Réglages shows the build id at the bottom (« build `<short SHA>-<date>` »): it must be the RC's short SHA given in the report that came with this guide. `wip/visual-pass` is untouched and nothing is deployed.

## What is in the release candidate

- **Living Districts:** M1 Mermoz / Sacré-Cœur (VDN, the BRT rond-point, the autopont, Pape Diouf), M2 Plateau / Médina (« Ma première affaire »), M3 Corniche / Fann (join the match, the football repair), M4 Almadies / Ngor (« One Evening Out », the hospitality strip: La Vague, **Le Patio de Ngor**, the car parks, the lit alley; the Terrasse de Ngor), the Plage de Ngor and the traversée.
- **Living Dakar 2.0:** A (Mes pistes, Banque Teranga, the bana-bana table), B (Messages, Teranga Money transfers, home visits, meetings: **not reachable from the static preview**, see below), C (walkable homes), D (the flagship villa and its showcase), E (the Almadies district, rounds 1–4: **street life, the streetscape, the Terrasse de Ngor's name lit on its roof** and the boutique hotel's own name on its gantry).
- **Homes:** no one-room home but « Ma chambre »; the home kit; the Cité Jàmm house with its two-level interior (rent **16 700 F a day**, a lease keeps the rate it began with); **the Mermoz F3** in the Résidence Les Filaos (board by the gate, the door inside it).
- **Driving:** the steering pad and pedals, full throttle from the middle of the pedal, the boost (up to ~198 km/h), the passenger's banter, the street's reactions.
- **« Mesure de fluidité »** (this page's meter).

**What the preview cannot do.** It is a static page: **there is no server behind it.** Messages, transfers between players, home invitations and meetings need the Workers runtime and a second player; they were proved separately on a local Workers runtime (the report lists the runs) and are *not* something this preview shows. Test the single-player game, the driving and the districts on the phone.

## Before you start (2 minutes)

- iPhone with Safari, portrait, **Low Power Mode off**, battery above 50 %, brightness in the middle, other tabs closed.
- Open the preview link. On the title screen choose **« Vitrine du propriétaire »**: it has its own save (your real game is never touched),
  60 000 000 F, the Almadies villa and the Lamane Sport parked in its bay.
- Phone › **Réglages › Graphismes**: start on **Moyenne**, switch on **« Mesure de fluidité »**. A small meter appears at the bottom centre of the screen
  (« 58 img/s · 95 % < 22 ms · Almadies · à pied »). Every frame is filed under where you are: the district, and on foot, at the wheel or inside a home.
- Write down the battery percentage and the time.

## The route

Take the time each step says; the meter needs a few hundred frames in a place to say anything. The numbers come back in the report, so you only
have to note **how it felt** (1 = unplayable, 3 = fine, 5 = smooth) and anything that looks wrong.

| # | Where | What to do | Look for |
|---|---|---|---|
| 1 | Almadies, the villa | Walk the ground floor, the first floor and the roof (1 min). | Frame rate indoors, the stairs, the pool. |
| 2 | Almadies, the strip | Walk from the villa to the Terrasse de Ngor, Le Patio and La Vague (2 min), day or night, whichever the clock gives. At night, look up: the Terrasse's name is lit on its roof, and the hotel (Le Filao) has its own. | The new facades and hotels, the street crowd, the shop glow, the lit signs. |
| 3 | Ngor beach | Walk the boardwalk to the embarkation (1 min). | Sand, sea, stalls. |
| 4 | Almadies, at the wheel | Get into the Lamane Sport. Drive the strip slowly, then park in a marked bay (2 min). | Steering with the ◀ ▶ pad, the pedals, the camera. |
| 5 | The open road | Drive out of the district. On a straight, **hold the green pedal down until it boosts** (about a second), for 30 s. | Steering feel at 150–198 km/h, any freeze when the district changes in the middle of the road. |
| 6 | Corniche → Mermoz | Take the Corniche–Mermoz road: the VDN, the **Sacré-Cœur rond-point** with the BRT (the heaviest place of the build: 139 draw calls), the **autopont**. Slow through the rond-point (1 min), then boost on the VDN. | The BRT junction, buses, signals, the flyover. |
| 7 | Mermoz, on foot | Park, then walk the shaded streets to the Résidence Les Filaos and Pape Diouf's gate (2 min). | Trees, walls, the gate. |
| 8 | Pikine, Cité Jàmm | Walk the street. Walk **both floors of the house** (rent it from the phone › Biens if asked: it is not needed to look). | Interior frame rate, the staircase. |
| 8b | Mermoz, the Résidence Les Filaos | At the gate, walk up to the board « F3 · À LOUER · À VENDRE »: « Voir le logement », **Visiter**, come out by the teal door inside the gate. | The listing, the interior's frame rate. |
| 9 | Two more minutes, anywhere | Switch to **Basse**, repeat step 2 or 6. Then back to **Moyenne**. | The difference between the two. |

If a step cannot be done (a door is shut, a road is not offered), say which and carry on.

## The report (one message)

1. Phone › Réglages › **« Signaler un problème »**: it copies the build, your screen, the device **and one line of measures per place** you
   passed through. Paste it as it is.
2. Add: the iPhone model, iOS version, battery at the start and at the end, whether the phone felt warm, and your 1–5 mark for each step.
3. A screen recording of step 5 or 6, if you can.

The lines read like:
`Almadies · au volant : 47 images/s en moyenne · 95 % des images sous 31 ms · pire 96 ms · 3 à-coups (> 50 ms) · jusqu’à 118 appels et 240 k triangles · 140 s mesurées`

## What counts as good (accepted by the owner as provisional private-beta gates, 1 Nov 2026)

These are working gates for the private beta, not a final standard. They are judged on **Moyenne**, with Basse as the fallback for older phones.

| Measure | Fine | Worth fixing | Blocks the build |
|---|---|---|---|
| Frame rate, on foot | 40 img/s and more | 30–40 | under 25 |
| Frame rate, at the wheel | 35 and more | 25–35 | under 20 |
| 95 % of frames under | 33 ms | 33–50 ms | over 50 ms |
| Hitches (> 50 ms) | one every 10 s or fewer | more | a freeze of more than half a second |
| District change in the middle of the road | no freeze felt | a stutter | a freeze of more than one second |
| Heat and battery | warm, 10 % in 25 min or less | hot | the phone throttles and the game slows down |

## What this does and does not prove

- It measures **this phone, this build, this route**. One model says little about another.
- The meter itself costs a few microseconds a frame; its overlay is one small element. Compare a minute with and without it if in doubt.
- The browser reports a frame rate, not the GPU's load: a result at 60 img/s may be capped by the screen.
- It does not test the multiplayer server, which this preview does not reach.
- Nothing here is a verdict on the housing, economy or district content: only on how the build runs.

## What was measured elsewhere, for scale

Headless, software-rendered, low quality, 390 × 844 (not a phone): Almadies street about 163 k triangles and 111 draw calls, Pikine 183 k and 193,
the BRT junction 139 draw calls. Those counts hold on a phone; the milliseconds do not.
