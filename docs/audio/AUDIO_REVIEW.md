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
