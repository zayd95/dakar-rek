# Vehicle sound on a real phone: what was wrong, what is fixed, how to check on the iPhone

Branch `vehicles/integration-20261018` (PR #49). Synthesised sound only, nothing generated, nothing paid, save untouched.

## The report

« No audible klaxon » on a real iPhone (Prestige Auto preview 58a813a). The button, the `hornOn/hornOff` code, the Web Audio bus, the sound setting and the first-gesture unlock all existed and passed in headless Chromium. Headless Chromium has no loudspeaker, so those checks counted calls; they could not say what comes out of an iPhone.

## What was found (and what could not be)

**I cannot run iOS Safari here** (no WebKit in this environment) **and I could not reproduce the silence on a phone.** What I could do is read every step between the thumb and the speaker, measure what the page really sends to the speaker in a browser held to the same gesture rule, and fix every iPhone-specific weakness that step by step turned up. These are the causes that were real in the code, in the order I think they matter; the first two are on-device facts I cannot verify from here, the rest are measured.

| # | Cause | Where | Status |
| --- | --- | --- | --- |
| 1 | **The horn was a low, soft two-note square wave** (392 + 494 Hz, a 1.9 kHz low-pass, level 0.14). An iPhone loudspeaker gives next to nothing under ~300 Hz and little at 400–500 Hz; a square wave filtered like that has almost nothing above. On paper it played; in the hand it was quiet next to everything else. The engine (34–140 Hz fundamentals) had the same problem. | `vehicleAudio.hornOn` | **Fixed, measured**: reeds from 349 Hz up, sawtooth/square, lifted at 1.4–2.6 kHz, detuned pairs for the buzz. In the check the horn is **12.6 dB above the engine in the 300 Hz+ band**, 67 % of its energy above 800 Hz, peak −2.8 dBFS. |
| 2 | **The sound could stay asleep for good.** The unlock listener removed itself after the *first* event of `pointerdown`/`touchend`/`keydown`. iOS only lets a context start from the *end* of a touch, a click or a key, not at the start of one; if the first event was a `pointerdown` the unlock was spent and never retried. And the page only resumed a context that was `suspended`: after a call, the lock screen or another tab Safari sets **`interrupted`**, which was never resumed. | `unlockOnGesture`, `open()` | **Fixed**: `src/transport/audioUnlock.ts` keeps its listeners for the whole life of the page, nudges a context that is `suspended` or `interrupted` at every touch end, click, key, return to the page (`visibilitychange`, `pageshow`, `focus`), and creates it inside the gesture. Unit-tested against a fake that only starts from `touchend`/`click`. |
| 3 | **The silent switch.** On iPhone, Web Audio follows the ringer switch by default: with it on, a page makes no sound at all unless it asks for a *playback* audio session. | whole page | **Mitigated, unverified on device**: while a vehicle is driven the page asks for `navigator.audioSession.type = 'playback'` (Safari 16.4+), and goes back to `auto` on getting off. It is in-game muted by Réglages › Son as before. Where the API is missing nothing changes. |
| 4 | **The horn started a frame late.** It was read from `ridePad.horn` once per frame; on a phone that runs the sim at 20–30 fps that is 30–50 ms, and a tap shorter than a frame could be missed. | `ownedModule`, `ridePad` | **Fixed**: the button tells the horn from the event itself (`ridePad.onHorn`); the frame loop stays as a safety net. A short tap is heard (check: two taps, two horns). |
| 5 | **A touch the system takes away leaves the horn on** (a call, the app switcher: no `pointerup` ever comes). | `ridePad` | **Fixed**: blur / page hidden lets go of gas, brake and horn. |
| 6 | **Three fingers.** Stick (left thumb) + gas (right thumb) + horn is three touches. | `ridePad.css` | **Verified** with three real CDP touches (speed 9 m/s and turning while the horn is held). The Klaxon button is now 92 × 56 px in amber with a clear 12 px gap to the gas (it was 46 px tall). The right thumb must still leave the gas, or another finger be used, to hit it: that is a layout choice you may want to change after trying it. |

Also added: a **limiter** (compressor + soft clip) on the vehicle bus so a horn over an engine over a crash cannot clip, and the engine trimmed ~5 dB so the horn is not fighting it.

## Evidence

`scripts/check-horn.mjs` (portrait, real CDP touches, Chromium started with `--autoplay-policy=document-user-activation-required`), 17/17 on this branch:

- before any touch the page makes no sound; after the taps the context runs;
- the horn starts with the touch itself, goes on while held with gas and stick working, stops on release, short taps are heard;
- **measured at the speaker** (after limiter and sound setting): engine alone −25.9 dBFS in the speaker band, horn −13.3, peak −2.8 (no clipping);
- the sound setting silences it (−120 dBFS) and brings it back;
- a context put to sleep wakes at the next touch and the horn is heard again;
- the system taking the touch away lets the horn go.

**These are Chromium results.** They show the page sends a loud, clean, speaker-friendly horn to the output and that the unlock/resume logic is robust. They do **not** prove an iPhone speaker plays it.

## Checking on the iPhone (30 seconds)

Open the preview with `?audiodebug` appended (e.g. `…workers.dev/?audiodebug`), get into a car (Essayer), and read the panel at the top left:

```
context running · session playback · gesture yes · muted no
resumes 2 (last: touchend) · engine on · horn ON
klaxon touches: down 3 up 3 cancel 0
level: peak -3 dB · rms -13 dB · speaker band -13 dB · >800 Hz 67 %
vibration API: no · bip: started
```

How to read it:

- `context` not `running` while you drive → the unlock failed: send the screenshot (and say whether you came back from the background).
- `session unsupported` → this Safari has no Audio Session API; then **the silent switch (side of the phone) still mutes the game**: flip it to ring and retry.
- `klaxon touches: down 0` when you press Klaxon → the thumb is not reaching the button (layout), not a sound problem.
- `down` rises but `horn` stays off → muted (Réglages › Son) or no gesture yet.
- `level` moves while `horn ON` but you hear nothing → the phone's output (volume, silent switch, Bluetooth route). **« Bip »** plays a 880 Hz test tone through the same path: heard = the audio path works, so the horn is the issue; not heard = the phone's output.

A screenshot of that panel while holding Klaxon is the evidence still missing.

## Haptics

See the collision doc (`docs/vehicles/COLLISION_FEEL.md`): vibration only where `navigator.vibrate` exists. iPhone Safari does not implement it; there, sound + camera + visual impact carry the feedback.
