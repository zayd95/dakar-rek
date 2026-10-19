# Vehicle audio samples

The engines, horns and collisions of the driven vehicles are **recordings** (`public/assets/audio/vehicles/*.mp3`, 214 KB in all), played through the Web Audio graph in `src/transport/vehicleAudio.ts` (`src/transport/vehicleSamples.ts` fetches and decodes them). They replace the oscillator/noise synthesis. The door, the key chirps and the road/traffic-noise bed are still synthesised.

## Sources and licences

| File | Length | Size | Kind | Made from |
|---|---|---|---|---|
| `car-idle.mp3` | 7.8 s | 46 KB | loop | Kenney racing/audio/engine.ogg |
| `car-rev.mp3` | 3.298 s | 20 KB | loop | pmndrs racing-game/public/sounds/engine.mp3 |
| `moto-idle.mp3` | 7.811 s | 46 KB | loop | Kenney racing/audio/engine-motorcycle.ogg |
| `horn-car.mp3` | 2.9 s | 23 KB | loop | pmndrs racing-game/public/sounds/honk.mp3 |
| `horn-moto.mp3` | 2.9 s | 23 KB | loop | pmndrs racing-game/public/sounds/honk.mp3 (pitched x1.5, lower reed removed) |
| `crash.mp3` | 1.817 s | 22 KB | one-shot | pmndrs racing-game/public/sounds/crash.mp3 |
| `thud.mp3` | 0.654 s | 6 KB | one-shot | Kenney racing/audio/impact.ogg |
| `squeal.mp3` | 3.387 s | 27 KB | loop | Kenney racing/audio/skid.ogg (Landeplage, CC0) |

Upstream, with the exact commits the files were taken from:

* **Kenney – Starter Kit Racing**, <https://github.com/KenneyNL/starter-kit-racing> @ `2f2e5f2646dda89cb21d4e8539bab60c6e955dc8`. Its README: *"Assets included in this package (2D sprites, 3D models and sound effects) are CC0 licensed"*; the skid sound is by Landeplage, also CC0. Used: `audio/engine.ogg`, `audio/engine-motorcycle.ogg`, `audio/impact.ogg`, `audio/skid.ogg`.
* **pmndrs – racing-game**, <https://github.com/pmndrs/racing-game> @ `7816a5d954b75e6ad853ae4e4f0cbbd628072643`. Its README: *"CC0 assets only, everyone is invited to participate"* (MIT for the code). **The repository does not record where each sound came from**, so the CC0 status of `honk.mp3`, `engine.mp3` and `crash.mp3` rests on that project statement only. Used: `public/sounds/honk.mp3`, `engine.mp3`, `crash.mp3`.

No paid asset, no generated audio, no Meshy credit.

## How they were prepared

`scripts/audio/build-vehicle-samples.py KENNEY_DIR PMNDRS_DIR` (ffmpeg + numpy): mono, peak-normalised to −3 dBFS, loops closed with an equal-power cross-fade so they have no seam, encoded as small MP3 (MP3 decodes on every browser, iPhone Safari included; Ogg Vorbis does not on older iOS). The motorbike horn is the car horn pitched ×1.5 with the lower reed removed.

## How they are used

* **Engine**: two looped recordings per vehicle, pitched with the revs (`playbackRate`) and handed over by equal-power cross-fade (low revs → high revs); a low-pass that opens with revs and throttle and closes on lift-off; a lift in the 1.3 kHz band; a harmonic exciter (the bass note saturated, only its overtones kept) so that something of a 30–120 Hz engine is left on a phone loudspeaker. Car: Kenney idle + pmndrs rev loop. Jakarta: the Kenney "motorcycle" idle + the same rev loop, pitched higher, with a 230 Hz high-pass.
* **Start**: the idle loop cranking with a stuttering, climbing pitch until it catches.
* **Horn**: the recording looped while held (`horn-car`; ×0.94 luxury, ×0.84 SUV; `horn-moto` for the motorbike); 12 ms attack, 20 ms release; if the press comes before the file is decoded it starts the moment it is.
* **Collisions**: *tap* = thud (pitched up, short) + a click from the crash's attack; *impact* = thud + the crash's first 0.2–0.6 s + (heavy) its long tail, each hit with a different pitch/start so none repeats; *scrape* = 120 ms grains cut from the middle of the crash, scheduled every 60 ms at a pitch/level that follow the speed along the wall; *brake* = the Kenney squeal, longer and louder the harder.

## Known limits

* The only motorcycle recording reachable is a re-take of the same multi-cylinder idle as the car's (firing rate ≈ 28 Hz), not a 125 cc single. The Jakarta's identity comes from pitch, filtering and the shared rev loop. **A real single-cylinder recording is needed** (see the review notes).
* There is no recording of a metal scrape; it is made of grains of the crash.
* Judged by ear only on the clips in the audio review; not yet on a real iPhone.
