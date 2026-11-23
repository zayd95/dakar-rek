# Player body choice (Meshy homme / femme): integration report

Branch `feature/meshy-hero-bodies-20261017` (local, from `6789c6e`, not pushed). Everything below was run on the integrated build.

## What the player gets

* **New Game** shows a choice screen: *Homme* or *Femme*, with a picture each. It cannot be dismissed (no Escape, no tap outside); nothing is saved and the world is not built until a choice is made. The choice is written to the v5 save at once (`SaveData.avatar`, an additive field of the v5 schema: no version change, same key `dakarrek.guest.save.v5`).
* **Existing saves** (v3 migrated, or v5 without the field) are not asked: they keep the current v4 body. Their progress is untouched (`check-save-compat`: ALL PASS against the schema-v3 production client).
* **Fallback**: if the Meshy file cannot be loaded (network, corrupt) the game starts on the v4 body and the identity stays in the save; the next start tries again.
* **Quality**: Low loads the light body file (`body_*_low.glb`, 0.7 and 1.4 MB), Medium and High the full one; changing the quality in Réglages swaps the file and rebuilds the body.
* The animations, the gait, the pose solvers (sit, lie, ride), the gestures and the wrestling rig are the v4 ones, unchanged. The Meshy mesh is skinned to the v4 skeleton, with a per-body fit (`BODY_FIT` in `humanoid.ts`).
* Other online players still see the standard look of the player's shirt colour (no protocol change). Crowds and NPCs are untouched.

## Tests (integrated build)

| Check | Result |
|---|---|
| `tsc`, `vitest` | clean; 1518 passed, 2 skipped (baseline 1510 + the new avatar tests) |
| `scripts/check-avatar.mjs` (choice screen, accessibility, persistence, reload, New Game, old saves, quality files, ngemb/emote stand-in, unreachable files, phone portrait and landscape, walk/run/stop) | 29 / 29 (`docs/meshy/proof/avatar/results.json`) |
| `check-gait` homme / femme | 26/26 / 22/26: the 4 femme failures are the cadence windows (see below) |
| `check-sit-stand` homme / femme | 22/22 / 22/22 |
| `check-gestures` homme / femme | 20/20 / 20/20 |
| `check-moto` homme / femme | desktop all pass; phone 3 failures (joystick throttle, steering, wall), **identical on the untouched baseline build and on v4**: not caused by this work |
| `check-save-compat` (prod v3 vs candidate) | ALL PASS |

Logs: `docs/meshy/proof/game/integ-m/log.txt`, `integ-f/log.txt`.

### The femme gait failures

`check-gait` expects 105–135 steps/min at 1.4 m/s and 135–175 at 2.0 m/s, windows set for a body of scale 1. The femme is drawn at 0.93, so the gait (which works in the body's own metres) takes more, shorter steps at the same ground speed: 147 and 176 measured vs 135 and 175 allowed; the gait's own figure is 125 and 164 (inside). No foot slides (0 cm). I did not change the check's windows; a scale-aware window (limits ÷ scale) is the honest fix and a one-line change if you want it.

## Run-to-stop (femme)

`scripts/check-stop.mjs` drives the game's own input and deceleration frame by frame, measures the mesh surface (sole of each foot, speed of the fastest surface point, planted-foot slip, pelvis) for v4, **v4 scaled to 0.93**, homme and femme, and shoots a side strip (`docs/meshy/proof/stop/sheet.jpg`); `SWEEP=1` repeats it at 16 release phases of the walk and of the jog (`docs/meshy/proof/stop-sweep/`).

* The femme is **identical to the v4 body scaled to 0.93** in every number (pelvis path, settle step, feet): what she does at a stop is what the game's gait does to any body of that scale, not something the Meshy mesh adds. No sliding feet (0 cm), no sole under the ground beyond v4's own, no extra pop at the Walk/Jog → Idle switch (fastest surface point: femme 7.1 m/s vs 6.6 homme and 6.4 v4 on the same frame, the same event).
* **A game behaviour found on the way, for every body** (v4 at scale 1 included): depending on the phase of the step at which the player lets go, the gait leaves the feet in stride, the pelvis sinks to its 0.80 m floor (up to **14.8 cm**) for about a third of a second, then a settling step brings the far foot in and the body rises. The sweep shows it at 5 of 16 phases on v4 as on homme and femme. It is the existing behaviour (`gait.ts` `stop()` / `settleFeet()` / `posture()`), visible but not a defect of the new bodies. I did **not** touch it: it is shared locomotion code for every NPC and wrestler, and you asked to keep the current Humanoid animations. A fix would be to start the settling step at once when the pelvis would sink more than ~4 cm; it needs your go-ahead and a re-run of `check-gait`.

## Phone performance (what is and is not known)

`scripts/perf-avatar.mjs`: iPhone-sized viewport, Pikine street by day, the game stepped without drawing so that only JavaScript is timed, CPU throttled ×1, ×4, ×6 by CDP (`docs/meshy/proof/perf-avatar.json`).

* JS per frame is **the same for the three bodies** within noise (for example High, running, ×4: v4 4.1, homme 4.1, femme 4.0 ms; Low ×4: 3.1 / 3.1 / 3.1 ms). The repo's rule of thumb (phone JS ≈ 3–4× this machine) puts every body at ~2–4 ms of JS a frame on a phone, inside the 4 ms budget of `check-perf-evening`.
* One Meshy body is **1 draw call** against v4's 20 (the frame totals in the table vary by a few calls either way between runs, so no scene-level gain is claimed). Body triangles: homme 6.2 k (Low) / 12.5 k, femme 12.5 k at every quality, v4 10.4 k. Skinned vertices: v4 5.8 k, homme 7.7 k / 14.4 k, femme **21.6 k** (a 3.7× increase for one body, small against a 130–210 k triangle scene, but the GPU side is the part this machine cannot tell).
* Not measured, cannot be here: the phone's GPU (skinning, fill, texture memory: 512–1024 px textures, ≈ 1.4–4 MB each) and thermal behaviour. **A run on a real phone is still needed**; `docs/meshy/DEVICE_TEST.md` and `device_frame_probe.js` are the 15-minute kit, with pass/concern/blocker thresholds written before the measurement.

## Visual review in the game (`docs/meshy/proof/avatar/play/sheet-*.jpg`)

Both bodies read well in the street at normal camera distance, at the same scale as the NPCs, with the game's lights (their dark colours are darker in shade than v4's: no grading done, as decided).

Findings, with what I did:

1. **Scarf at the mouth (fixed).** The écurie scarf sat at the v4 neck socket, which on a Meshy body is at the chin/mouth. New `BODY_FIT.scarfDrop` (0.08 homme, 0.115 femme, 0 v4) puts it on the neck; checked in close-ups of both.
2. **The cap (2,500 F) and the tee (« Maillot », 4,000 F) have no visible effect on a Meshy body** (not fixed, needs your decision). They recolour v4's `Cloth_Kufi` / `Cloth_Tee` meshes; the Meshy body's clothes and hair are baked into one mesh. Scarf and flag work (they hang on sockets). Choices: (a) hide cap and tee from the stall for a Meshy identity, (b) a small cap mesh on a head socket like the scarf (the tee stays impossible without a texture variant), (c) accept it and say so. I recommend (a)+(b) for the cap before any public build, because a player can pay for something they cannot see.
3. **The player's own shirt colour choice (profile) does not show on their own Meshy body** (others still see it). Same cause.
4. Attire preview and emotes use a v4 body in ngemb as a stand-in (the wrestling rig's ngemb and build are v4 only); the swap is instant and reversible (tested).

## Not done, by decision

No Meshy generation or credit spent (balance unchanged, 940). No NPC bodies, no protocol change, nothing pushed, merged or deployed. The 197 MB source archive was delivered to you with its sha256; it is not in git, and the Meshy tasks must stay until you have stored and verified it.

## Hands (second pass, after the first review)

The first integration kept Meshy's hands as generated: open, fingers fanned, thumb out, the palm turned whichever way the rest pose had it (the femme's the most). Fixed in the mesh and in the poses, nothing in the animation clips of v4:

* **Hand relaxed in the mesh** (`scripts/meshy/relax-hand.mjs`, used by `transplant-to-v4-rig.mjs`): the skeleton has one bone per hand and no fingers, so the pose is baked once into the rest shape. The hand's own frame is found from its vertices (finger axis, palm normal, thumb side) and put on the forearm with the palm towards the thigh; the fan is closed to 30 % of its splay, the fingers curl 85° at the tips (the little finger a little more than the index), the thumb comes in 30° and bends 25° towards the palm. Wrist straight. Same numbers for both bodies (`scripts/meshy/build-bodies.mjs`); every number is a flag if one body needs its own.
* **Sit, Kneel**: v4's mitten has no palm, so those clips left the new hand palm up. The forearm and hand are rolled half each about their own axes so the palms lie on the thighs (`rollPalmsInClips`, Meshy bodies only; v4 untouched).
* **Lie, SitFloor, Ride** (solved in code): the same palm rule (belly, knees, grips).
* **Ride, the grips**: v4's repo grips are at the wrist (a mitten holds the bar there). A hand with a palm held that way lay beside the bar with its fingers hanging. For Meshy bodies the arms are now solved (two bones, elbow out and down) so that the middle of the palm — 8.5 cm along the hand — is on the grip, scaled by the body's scale (`POSES.Ride.reach`, test in `tests/poses.test.ts`): palm-to-grip error under 2 cm for both bodies, the bar under the palm, the fingers over it, the elbows bent as a rider's are.
* **Selection screen pictures** are now taken in the game itself (`scripts/meshy/make-previews.mjs`), idle pose, head to mid-thigh, so the hands show as the game draws them (they were the viewer's raw clip, with the right hand open to the front).

Seen in `docs/meshy/proof/hands/after/` (before: `…/before/`): `sheet-idle|walk|run|stop|ride-moving.jpg` (rows: homme, femme; columns: full body, hand from the outside, from the front, from above), `pair-idle|walk|run.jpg` (front and both sides: the two hands are mirror images), `cycle-run|walk.jpg` (a cycle at game distance), `poses.jpg` (Sit, SitFloor, Lie, Kneel), the choice screen in `docs/meshy/proof/avatar/`.

Checks after the change (integrated build): unit tests 1519 passed, 2 skipped; `check-avatar` 30/30; gestures 20/20 and sit-stand 22/22 and moto (desktop) 18/18 on both bodies; gait 26/26 homme, 22/22 femme except the 4 scale-dependent cadence windows already reported. Honest limits: the fingers are curled, not wrapped (the hand cannot close round a bar without finger bones, so on the motorbike they hang over the grip); the femme's mesh has longer, pointier fingers than the homme's (her source mesh, not the pose); the Talk and emote clips were not changed (the emote preview uses v4's body in ngemb); a phone was not involved.

## Ride grip (third pass)

What the close-ups showed after the second pass: on the motorbike the fingers hung over or beside the bar, dark spikes hung under the homme's hand, and the femme's fingertips were long and pointed. Causes found: (1) the hand has no finger bones, so one shape had to serve a hand hanging at the side and a hand closed on a bar; (2) the source fingers are thin, tall blades (a few long triangles each) that cannot bend smoothly, and the four fingers sit at different heights, so a tight curl made rings of different sizes whose outer ones hung several centimetres under the bar.

* **A ride-only hand shape, as a morph target** (`grip`): the same hand, closed in a fist round a 2.2 cm bar. The skeleton and every clip are untouched; the weight is 0 everywhere except while the rider has the Ride pose (blended over 0.3 s, `Humanoid.closeFist`), so idle, walk, run, sit and gestures show exactly the hand accepted before. Built by `scripts/meshy/transplant-to-v4-rig.mjs` (the fist is the second shape of `relax-hand.mjs`: `gripRadius`, fingers flattened to one plane so the rings agree, thumb wrapped) and `scripts/meshy/grip-morph.mjs` (turns it into a sparse morph target after the quality steps; +40 kB per file).
* **The hand's long edges are halved** (edges longer than 2.5 cm between hand-weighted vertices, `--hand-subdiv`): fingers bend as arcs instead of tearing into slivers. +0.9 k / +1.3 k triangles (homme / femme, about 7–10 %), a smoother finger in idle too, same pose.
* **The arm is solved to the real grip**: the hand carries, as glTF extras, where the middle of the closed fist is in its own frame; `buildPoseClips` puts exactly that point on the rubber grip (error under 1 mm, measured in the game; test in `tests/poses.test.ts`) for both bodies and both scales.
* **Femme fingertips**: her fingers are 8 % shorter and 12 % thicker in the mesh (`--finger-scale 0.92 --finger-thick 1.12`), the one change visible in her idle hand (slightly less pointed); nothing else in idle moved.

Seen in `docs/meshy/proof/grip/grip-homme.jpg` and `grip-femme.jpg` (top row the left hand, bottom row the right; columns: from the front, the outside, above, behind, the camera 0.5 m from the hand on the actual handlebar), `docs/meshy/proof/hands/after-grip/`. Checks after the change (integrated build): unit tests 1520 passed, 2 skipped; `check-avatar` 30/30; gestures 20/20, sit-stand 22/22 and moto (desktop) 18/18 on both bodies; gait 26/26 homme, femme the same 4 scale-dependent cadence windows as before. Honest limits: seen very close from the front a fingertip or two still shows under the grip; the jacket cuff of the femme bunches a little behind the fist; the extra GPU cost of one morph target (two attributes on one mesh) was not measured on a phone.
