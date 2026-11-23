# Collision feel

Driving physics are **unchanged** (`src/transport/drive.ts`: contact response, slide, bounce, creep-out). This layer only decides what a contact *feels like*. Vehicle health, damage and repair are not part of it (Pass 3 is deferred).

## Three kinds of contact

`src/transport/contact.ts` (`ContactTracker`) is told each frame whether `driveStep` ran into something, and the speed before and after the step.

| Kind | When | Sound | Body / camera | Phone buzz (where possible) |
|---|---|---|---|---|
| **bump** | first touch of an episode, speed 0.5 … 2.5 m/s (`IMPACT_SPEED`) | soft thud (`tap`) | tiny jolt, no shake | one 12 ms tick |
| **hit** | speed ≥ 2.5 m/s | crunch (`impact`), louder with strength | speed cut by the existing bounce, body kick (`translateZ/X`), camera shake up to ~0.7 | `[25–70, 30, 15–50]` ms, longer for harder hits |
| **scrape** | sliding (`speed` kept, not a head-on bounce) faster than 0.8 m/s | continuous grind following the speed, stops when the slide stops | none | none |

Strength = `(speed − 2.5) / (12 − 2.5)` clamped to 0…1, times 0.6 for a glancing (non head-on) blow.

## No endless knocking

A contact is an **episode**: it starts at the first contact after 0.3 s without one (`REARM`) and fires exactly one bump or hit. A second hit in the same episode needs a real new run-up (speed ≥ 2.5 and 0.7 s since the last, `RE_HIT`). Pushing the gas against a wall therefore knocks once, then only the (very quiet) pressing contact remains; the shake decays and dies. The scrape also has a watchdog in `vehicleAudio` so a grind never outlives its contact.

## Safety properties (tested)

* the vehicle never ends up inside a solid (footprint circles; verified at dt up to 0.1 s);
* never permanently stuck: reverse + gas always gets out (`stuck` creep-out in `drive.ts` is untouched);
* arcade handling kept: the slide along a wall still keeps 60 % of the speed.

## Haptics — honesty

* Vibration is used **only where `navigator.vibrate` exists** (Android Chrome and similar). `haptics.ts` feature-detects; Réglages shows a *Vibrations* toggle only there.
* **iPhone Safari has no Web Vibration API.** We do not claim haptics there. On iPhone the feel is sound + camera shake + body kick. Réglages shows a plain note instead of a toggle.
* With vibrations off (or unsupported) sound, shake and kick are unchanged.

## Evidence

* Unit: `tests/collisionFeel.test.ts` (14), `tests/vehicleAudio.test.ts`.
* Browser (Chromium, real CDP touch input, `scripts/check-collision.mjs`): hard head-on hit, slow bump, scrape along a wall at an angle, pushing the gas against a wall (≤ 2 knocks, shake dies, never inside), backing away, vibration setting on/off, a second session without `navigator.vibrate`.
* **Not verified on a real iPhone.** The Chromium run cannot judge how the thud sounds through the phone speaker; use `?audiodebug` on the device (see `AUDIO_ON_DEVICE.md`).

## Not done on purpose

Parked vehicles and traffic use the same contact path (unit-tested); a browser scenario against them is not scripted. Vehicle condition, repair and damage visuals are Pass 3.
