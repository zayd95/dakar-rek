# Audio review (kept for the record)

Three rounds on the owner's real iPhone; the report page (private): <https://claude.ai/artifact/7unwTdtvdbZNKzEz12eJwt>.

* **Round 0** (synthesised engines, horns, collisions): rejected: "engine sounds, horn and collision audio are not acceptable… the horn sounds like a squeezed toy".
* **Round 1** (recordings from Kenney's racing kit and pmndrs racing-game).
* **Round 2** (three candidates per category). **Decision: B in every category.** Car engine B = Kenney + pmndrs loops with a recorded ignition; Jakarta B = the shared engine recordings pitched for the motorbike; horns B = the Round 1 recorded horns; collisions B = the Round 1 collision sounds. Klaxon button hidden from the mobile controls.

## Candidates that were **not** chosen (not shipped, listed so they can be reused)

| Candidate | Where | Licence |
|---|---|---|
| Car engine loops "set B": `Car_Engine_Loop.ogg`, `Car_Engine_Loop_2.ogg` | OpenGameArt *Car Sound Effects Pack (Low Quality)* | CC0 |
| Other CC0 car sounds: `Car_Horn.ogg`, `Car_Acceleration*.ogg`, `Car_Engine_Turning_Off.ogg` | same pack | CC0 |
| Layered impacts: `bfh1_metal_hit_*`, `bfh1_hit_*`, `bfh1_metal_falling_02` | OpenGameArt *75 CC0 breaking, falling, hit SFX* | CC0 |
| `clink*`, `thud*` | OpenGameArt *metal-impact-sounds* | CC0 |
| `qubodup-crash.ogg` | OpenGameArt *crash-collision* | CC0 |
| `scrape-1…8` (real scrapes) | OpenGameArt *scrapes* | CC0 |
| Racing engine RPM loops `loop_0…5` | OpenGameArt *racing-car-engine-sound-loops* | CC0 |
| Real motorcycle idle / rev / start recordings (dklon) | OpenGameArt *engines-startup-idle-rev* | **CC-BY-SA 3.0** (credit dklon; share-alike): declined, not integrated |

The build of the review set (all candidates, ~0.44 MB) is in the git history of `vehicles/audio-overhaul-20261019` (commit `335e67f`).

## Jakarta riding level (owner's two mixing requests)

The approved B recordings, ignition and engine character are unchanged; only the riding/rev gain of the Jakarta was brought down, in two steps measured at the speaker (master output, after the limiter, which flattens loud input — so the gain trim is not the dB figure):

| Step | `topTrim` (moto) | Riding (speaker) | Idle |
|---|---|---|---|
| shipped in the audition | 1 | reference | reference |
| first request (4–6 dB) | 0.2 | about −5 dB | about −1 dB |
| second request | 0.08 | about −8 dB | unchanged (audible) |

The trim only acts above idle: `trim = 1 + (topTrim − 1)·k^0.6`, `k = (rpm − 0.12)/0.88`. Cars use `topTrim: 1` (untouched).

## Understated engine mix (final direction: a life simulation, not a racing game)

The owner's direction: the engine is a quiet background presence you feel rather than hear. Recordings, ignition character and RPM behaviour are the approved B set; only gains, the level's relationship to the revs, the tone at high revs, the ignition's level and the cabin changed. Horns, collisions, doors, brakes and scrapes were not touched.

| | Idle | Cruising | Accelerating |
|---|---|---|---|
| Car before (rms at the output, limiter included) | −19 dB | −19 dB | −17.5 dB |
| Car now | about −34 dB | about −34 dB | about −31 dB |
| Jakarta before | −22 dB | −25 dB | −23 dB |
| Jakarta now | about −34 dB | about −33 dB | about −30 dB |

* `EngineProfile.drive` is now the engine's gain at idle (cars 0.04–0.045, Jakarta 0.048); `swell` says how much throttle and speed lift it (cars 1: about 5 dB at full throttle; Jakarta 0.5: about 3 dB). The level hardly follows the revs (they show in the pitch and the tone). The old top-speed trim is gone.
* Revs de-emphasised: the high-revs loop is held back (weight 0.55 instead of 0.8), the tone closes earlier (low-pass at top revs about 30 % lower), the cars' peak brightness lower.
* Ignition: gain 0.55 → 0.12 of the recorded sample, a slower first 70 ms and a 3.6 kHz low-pass: peak −5 → about −14.5 dBFS.
* Cabin: in a car's wheel view (`camera.inside`) the engine is 6 dB lower, its top end and the tyre noise shut in (`vehicleAudio.cabin`, set by the vehicle module every frame); the chase and bird's-eye views are outside. The motorbike has no cabin.
* Street ambience, measured: the game's only continuous street sound is the traffic bed (about −53 dB rms) with a distant horn now and then (about −36 dB). The engine sits above that bed so the vehicle is felt to be running; one global step of 3 dB is the remaining knob (`drive` of the four profiles).
* `scripts/audio/render-street.mjs` records the in-game audition (video and the game's own audio output, real touch) used for the owner's listening.

Final step (owner: « make it quieter »): every engine's `drive` halved again (−6 dB): cars 0.0225 (luxury 0.02), Jakarta 0.024. The table above is therefore 6 dB lower still (idle about −40 dB at the output, against the traffic bed at about −53 dB).
