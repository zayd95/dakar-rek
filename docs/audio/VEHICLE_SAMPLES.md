# Vehicle audio samples (shipping set)

The engines, ignition, horns and collisions of the driven vehicles are **recordings** (`public/assets/audio/vehicles/*.mp3`, 228 KB in all), played through the Web Audio graph in `src/transport/vehicleAudio.ts` (`src/transport/vehicleSamples.ts` fetches and decodes them). The door, the key chirps and the road/traffic-noise bed are still synthesised. This is the set the owner approved after listening to the review clips ("B" in every category, see `AUDIO_REVIEW.md`).

## What ships

| File | Length | Size | Kind | Made from |
|---|---|---|---|---|
| `car-idle.mp3` | 7.8 s | 46 KB | loop | Kenney racing/audio/engine.ogg |
| `car-rev.mp3` | 3.298 s | 20 KB | loop | pmndrs racing-game/public/sounds/engine.mp3 |
| `moto-idle.mp3` | 7.811 s | 46 KB | loop | Kenney racing/audio/engine-motorcycle.ogg |
| `start-car.mp3` | 1.947 s | 14 KB | one-shot | OGA car-sound-effects-pack-low-quality / Car_Engine_Start_Up.ogg |
| `horn-car.mp3` | 2.9 s | 23 KB | loop | pmndrs racing-game/public/sounds/honk.mp3 |
| `horn-moto.mp3` | 2.9 s | 23 KB | loop | pmndrs racing-game/public/sounds/honk.mp3 (pitched x1.5, lower reed removed) |
| `crash.mp3` | 1.817 s | 22 KB | one-shot | pmndrs racing-game/public/sounds/crash.mp3 |
| `thud.mp3` | 0.654 s | 6 KB | one-shot | Kenney racing/audio/impact.ogg |
| `squeal.mp3` | 3.387 s | 27 KB | loop | Kenney racing/audio/skid.ogg (Landeplage, CC0) |

`horn-moto` is `horn-car` pitched ×1.5 with the lower reed removed. The motorbike's ignition is `start-car` played ×1.3 (a CC0 stand-in: the review clip used a CC-BY-SA recording that is **not** shipped).

## Licence verification

| Source | Licence as found | How it was checked | Files |
|---|---|---|---|
| Kenney, *Starter Kit Racing*, <https://github.com/KenneyNL/starter-kit-racing> @ `2f2e5f2646dda89cb21d4e8539bab60c6e955dc8` | **CC0** | The repo README states *"3D Models & sounds (CC0 licensed)"* and *"Assets included in this package (2D sprites, 3D models and sound effects) are CC0 licensed; the skid sound effect was made by Landeplage and is also CC0 licensed"*. Code is MIT. | `car-idle`, `moto-idle`, `thud`, `squeal` |
| OpenGameArt, *Car Sound Effects Pack (Low Quality)*, <https://opengameart.org/content/car-sound-effects-pack-low-quality> | **CC0** | The page's licence field reads CC0 (fetched Oct 2026). | `start-car` |
| pmndrs, *racing-game*, <https://github.com/pmndrs/racing-game> @ `7816a5d954b75e6ad853ae4e4f0cbbd628072643` | **Claimed CC0, not verifiable per file** | The README says *"100% open source and community built, CC0 assets only"* (code: MIT). | `car-rev`, `horn-car`, `horn-moto`, `crash` |

### Remaining provenance uncertainty: pmndrs (4 of the 9 files)

* `honk.mp3` and `engine.mp3` were added by the maintainer (Paul Henschel) on 2021-06-02, `crash.mp3` on 2021-06-05; no commit, file tag, credits file or code comment names where any of them was recorded or downloaded.
* So their CC0 status rests on the project's blanket statement only. It is a statement by the people who published them, which is reasonable evidence, but it is **not** a per-file licence record.
* Risk is low but not zero. **Mitigation if it matters**: the four files are isolated (`car-rev`, `horn-car`, `horn-moto`, `crash`), loaded by name in one table (`src/transport/vehicleSamples.ts`), and can be replaced by any CC0 equivalent without code changes beyond the profile table. Candidates already vetted as CC0 on OpenGameArt are listed in `AUDIO_REVIEW.md`.

No paid asset, no generated audio, no Meshy credit. The CC-BY-SA recordings by dklon were **not** integrated.

## How they were prepared

`scripts/audio/build-vehicle-samples.py KENNEY_DIR PMNDRS_DIR OGA_DIR` (ffmpeg + numpy): mono, peak-normalised to −3 dBFS, loops closed with an equal-power cross-fade so they have no seam, encoded as small MP3 (decodes on every browser, iPhone Safari included; Ogg Vorbis does not on older iOS).

## How they are used

* **Engine**: two looped recordings per vehicle, pitched with the revs (`playbackRate`) and handed over by equal-power cross-fade (low revs → high revs); a low-pass that opens with revs and throttle and closes on lift-off; a lift in the 1.3 kHz band; a harmonic exciter (the bass note saturated, only its overtones kept) so that something of a 30–120 Hz engine is left on a phone loudspeaker. Car: Kenney idle + pmndrs rev loop. Jakarta: the Kenney motorcycle idle + the same rev loop, pitched higher, 230 Hz high-pass.
* **Start**: the recorded ignition; the loops fade in where the engine catches (`catchAt`).
* **Horn**: the recording looped while held (`horn-car`; ×0.94 luxury, ×0.84 SUV; `horn-moto` for the motorbike); 12 ms attack, 20 ms release; a press before the file is decoded starts the moment it is. **The Klaxon button is hidden on the phone** (screen space); the code, the recordings and the pad wiring remain. `?klaxon` in the URL (the checks) or the H key brings it back.
* **Collisions**: *tap* = a thud pitched up + a click from the crash's attack; *impact* = a thud + the crash's first 0.2–0.6 s + (heavy) its long tail, each with a different pitch and start; *scrape* = grains cut from the middle of the crash; *brake* = the Kenney squeal.

## Known limits

* Judged by ear on the review clips by the owner; not yet on a real iPhone speaker in the game.
* The Jakarta's character is pitch and filtering of a multi-cylinder idle, not a single-cylinder recording.
