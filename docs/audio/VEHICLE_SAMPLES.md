# Vehicle audio samples

The engines, ignitions, horns and collisions of the driven vehicles are **recordings** (`public/assets/audio/vehicles/*.mp3`, 441 KB for the review set, to be pruned to the chosen ones), played through the Web Audio graph in `src/transport/vehicleAudio.ts` (`src/transport/vehicleSamples.ts` fetches and decodes them). They replace the oscillator/noise synthesis. The door, the key chirps and the road/traffic-noise bed are still synthesised.

## Sources and licences

| File | Length | Size | Kind | Made from |
|---|---|---|---|---|
| `car-idle-a.mp3` | 7.8 s | 46 KB | loop | Kenney racing/audio/engine.ogg |
| `car-rev-a.mp3` | 3.298 s | 20 KB | loop | pmndrs racing-game/public/sounds/engine.mp3 |
| `car-idle-b.mp3` | 2.816 s | 17 KB | loop | OGA car-sound-effects-pack-low-quality / Car_Engine_Loop.ogg |
| `car-rev-b.mp3` | 3.835 s | 23 KB | loop | OGA car-sound-effects-pack-low-quality / Car_Engine_Loop_2.ogg |
| `moto-idle-a.mp3` | 7.811 s | 46 KB | loop | Kenney racing/audio/engine-motorcycle.ogg |
| `moto-idle-b.mp3` | 7.75 s | 54 KB | loop | OGA engines-startup-idle-rev / 090912-022.mp3 0.3-8.3 s (dklon, CC-BY-SA 3.0) |
| `moto-rev-b.mp3` | 2.4 s | 17 KB | loop | OGA engines-startup-idle-rev / 090912-022.mp3 9.0-11.6 s (dklon, CC-BY-SA 3.0) |
| `start-car.mp3` | 1.947 s | 14 KB | one-shot | OGA car-sound-effects-pack-low-quality / Car_Engine_Start_Up.ogg |
| `start-moto.mp3` | 2.0 s | 14 KB | one-shot | OGA engines-startup-idle-rev / 090912-002.mp3 1.0-3.0 s (dklon, CC-BY-SA 3.0) |
| `horn-car.mp3` | 2.9 s | 23 KB | loop | pmndrs racing-game/public/sounds/honk.mp3 |
| `horn-moto-a.mp3` | 2.9 s | 23 KB | loop | pmndrs racing-game/public/sounds/honk.mp3 (pitched x1.5, lower reed removed) |
| `horn-moto-b.mp3` | 0.32 s | 3 KB | loop | OGA car-sound-effects-pack-low-quality / Car_Horn.ogg 0.06-0.46 s |
| `thud-1.mp3` | 0.456 s | 4 KB | one-shot | OGA 75-cc0-breaking-falling-hit-sfx / bfh1_hit_07.ogg |
| `thud-2.mp3` | 0.797 s | 7 KB | one-shot | OGA 75-cc0-breaking-falling-hit-sfx / bfh1_hit_02.ogg |
| `thud-3.mp3` | 0.418 s | 4 KB | one-shot | OGA metal-impact-sounds / thud3.wav |
| `metal-1.mp3` | 0.55 s | 5 KB | one-shot | OGA 75-cc0-breaking-falling-hit-sfx / bfh1_metal_hit_02.ogg |
| `metal-2.mp3` | 0.46 s | 4 KB | one-shot | OGA 75-cc0-breaking-falling-hit-sfx / bfh1_metal_hit_03.ogg |
| `metal-3.mp3` | 0.371 s | 4 KB | one-shot | OGA 75-cc0-breaking-falling-hit-sfx / bfh1_metal_hit_06.ogg |
| `metal-4.mp3` | 0.406 s | 4 KB | one-shot | OGA 75-cc0-breaking-falling-hit-sfx / bfh1_metal_hit_04.ogg |
| `clink-1.mp3` | 0.255 s | 2 KB | one-shot | OGA metal-impact-sounds / clink2.wav |
| `clink-2.mp3` | 0.29 s | 3 KB | one-shot | OGA metal-impact-sounds / clink3.wav |
| `crash.mp3` | 1.817 s | 22 KB | one-shot | pmndrs racing-game/public/sounds/crash.mp3 |
| `crash-2.mp3` | 0.584 s | 5 KB | one-shot | OGA crash-collision / qubodup-crash.ogg |
| `rattle.mp3` | 0.741 s | 6 KB | one-shot | OGA 75-cc0-breaking-falling-hit-sfx / bfh1_metal_falling_02.ogg |
| `scrape-1.mp3` | 1.144 s | 9 KB | one-shot | OGA scrapes / scrape-1.ogg |
| `scrape-2.mp3` | 1.285 s | 11 KB | one-shot | OGA scrapes / scrape-2.ogg |
| `scrape-3.mp3` | 1.4 s | 11 KB | one-shot | OGA scrapes / scrape-4.ogg |
| `scrape-4.mp3` | 1.33 s | 11 KB | one-shot | OGA scrapes / scrape-7.ogg |
| `squeal.mp3` | 3.387 s | 27 KB | loop | Kenney racing/audio/skid.ogg (Landeplage, CC0) |

Upstream pages (all fetched in October 2026):

| Source | Licence | Used for |
|---|---|---|
| Kenney, Starter Kit Racing, <https://github.com/KenneyNL/starter-kit-racing> @ `2f2e5f2646dda89cb21d4e8539bab60c6e955dc8` | CC0 (README: *"sound effects are CC0 licensed"*; skid by Landeplage, CC0) | `car-idle-a`, `moto-idle-a`, `squeal` |
| pmndrs, racing-game, <https://github.com/pmndrs/racing-game> @ `7816a5d954b75e6ad853ae4e4f0cbbd628072643` | README: *"CC0 assets only"*; **no per-file origin is recorded upstream** | `car-rev-a`, `horn-car`, `horn-moto-a`, `crash` |
| OpenGameArt, *Car Sound Effects Pack (Low Quality)*, <https://opengameart.org/content/car-sound-effects-pack-low-quality> | CC0 | `car-idle-b`, `car-rev-b`, `start-car`, `horn-moto-b` |
| OpenGameArt, *75 CC0 breaking, falling, hit SFX*, <https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx> | CC0 | `thud-1`, `thud-2`, `metal-1..4`, `rattle` |
| OpenGameArt, *Metal sounds* (metal-impact-sounds), <https://opengameart.org/content/metal-impact-sounds> | CC0 | `thud-3`, `clink-1..2` |
| OpenGameArt, *Crash / Collision*, <https://opengameart.org/content/crash-collision> | CC0 | `crash-2` |
| OpenGameArt, *Scrapes*, <https://opengameart.org/content/scrapes> | CC0 | `scrape-1..4` |
| OpenGameArt, *Engines - Startup, Idle & Rev* by **dklon**, <https://opengameart.org/content/engines-startup-idle-rev> | **CC-BY-SA 3.0**: credit "dklon"; adaptations (these trimmed loops) must be shared under the same licence | `moto-idle-b`, `moto-rev-b`, `start-moto` (review option only) |

No paid asset, no generated audio, no Meshy credit. If the CC-BY-SA motorcycle set is not accepted, the Jakarta falls back to the CC0 set A and the files above marked dklon are deleted.

## How they were prepared

`scripts/audio/build-vehicle-samples.py KENNEY_DIR PMNDRS_DIR OGA_DIR` (ffmpeg + numpy): mono, peak-normalised to −3 dBFS, loops closed with an equal-power cross-fade so they have no seam, encoded as small MP3 (decodes on every browser, iPhone Safari included; Ogg Vorbis does not on older iOS).

## How they are used

* **Engine**: two looped recordings per vehicle, pitched with the revs (`playbackRate`) and handed over by equal-power cross-fade; a low-pass that opens with revs and throttle and closes on lift-off; a lift in the 1.3 kHz band; a harmonic exciter so that something of a low engine note is left on a phone loudspeaker.
* **Start**: the recorded ignition; the loops fade in where the engine catches (`catchAt`).
* **Horn**: the recording looped while held; 12 ms attack, 20 ms release; a press before the file is decoded starts the moment it is.
* **Collisions**: *tap* = a soft thud + a small clink; *impact* = a body thump + a metal hit picked at random among four (+ crash layers and a rattling tail as it gets heavier), each pitched a little differently; *scrape* = 220 ms grains cut at random from the recorded scrapes, mid ones when slow, brighter ones when fast; *brake* = the recorded squeal.

## Known limits

* Chosen by analysis and by the owner's ears on the review clips; not yet judged on a real iPhone speaker.
* The synthesised review set ("before") is the previous implementation; the review build keeps every candidate decodable (≈ 0.4 MB) so they can be compared in one build.
