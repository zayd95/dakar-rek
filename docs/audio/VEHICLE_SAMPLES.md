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

## Licence verification (final)

**Verified** = the licence is stated by the rights holder or the host for these very files. **Project-level claim** = a statement about the whole project, with nothing per file.

| Files | Status | Evidence |
|---|---|---|
| `car-idle`, `moto-idle`, `thud`, `squeal` (Kenney) | **Verified CC0** | Kenney's *Starter Kit Racing* README: *"Assets included in this package (2D sprites, 3D models and sound effects) are CC0 licensed"*, and the skid sound by Landeplage *"is also CC0 licensed"*. The assets are Kenney's own and the statement is the author's. Repo <https://github.com/KenneyNL/starter-kit-racing> @ `2f2e5f2646dda89cb21d4e8539bab60c6e955dc8`. |
| `start-car` (OpenGameArt) | **Verified CC0** (host's licence field) | <https://opengameart.org/content/car-sound-effects-pack-low-quality>: licence field CC0, read from the page in October 2026. The page gives no author name that could be checked beyond the uploader's own submission. |
| `car-rev`, `horn-car`, `horn-moto` (derived from `horn-car`), `crash` (pmndrs) | **Project-level CC0 claim only** | <https://github.com/pmndrs/racing-game> @ `7816a5d954b75e6ad853ae4e4f0cbbd628072643`. README: *"This project is 100% open source and community built, CC0 assets only"*. The repository's `LICENSE.md` is the MIT licence of the **code**. |

### What was checked on the pmndrs files, and what is still unknown

* The sounds were added by the maintainer (Paul Henschel, *drcmda*): `honk.mp3` and `engine.mp3` on 2021-06-02 (a merge commit), `crash.mp3` on 2021-06-05 ("better sounds"). The history (400 commits fetched) contains licence commits only for the code (MIT, 2021-06-03); **no commit message, file tag, credits file, code comment or issue names where any of the three sounds came from**, and no per-file licence.
* So it is **unknown** who recorded them, whether they were downloaded from a CC0 library or edited from something else, and under what terms. The only assurance is the maintainers' own statement that the project uses CC0 assets only.
* This is a real but small risk. It is **not resolved** and cannot be from here (the sources are not named). The decision whether to accept it belongs to the owner.
* **Replacement path, if the owner prefers certainty**: the four files are the only ones in the shipping set that carry it. Verified-CC0 alternatives already identified: engine loops and a horn from the OpenGameArt car pack above (`Car_Engine_Loop*.ogg`, `Car_Horn.ogg`), and the crash/impact set (`75-cc0-breaking-falling-hit-sfx`, `crash-collision`). Swapping them changes the approved sound, so it is not done without the owner's say-so.

### Declined audio is absent from the shipping build

The CC-BY-SA 3.0 motorcycle recordings by *dklon* (`moto-idle-b`, `moto-rev-b`, `start-moto`) are **not** in the build: the build's audio folder holds exactly the nine files in the table above (checked by listing and by comparing the SHA-256 of every `.mp3` in `public/`, `src/` and the built `dist` to the three declined files: no match), and the string "dklon" appears nowhere in the source, the assets or the build script. They exist only in the history of the review commit `335e67f` on `vehicles/audio-overhaul-20261019`; when this branch is integrated into the main line, it is integrated as a **single squashed commit** so that they do not enter that history.

No paid asset, no generated audio, no Meshy credit.

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
