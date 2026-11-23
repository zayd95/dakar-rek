# Meshy bodies: compatibility proof, visual report, mobile cost, credit plan

17 October 2026. Local branch `feature/meshy-hero-bodies-20261017`, from `6789c6e`. **Nothing was pushed, merged or deployed. Zero Meshy credits were spent in this phase** (balance 940 = 925 monthly, resetting 17 Nov 18:05 UTC, + 15 permanent). The wrestling rig, the crowd characters, `main.ts`, `save.ts`, `protocol.ts` and `server/` are untouched. PR #42 stays an unmerged historical reference. The Red Team branches were not touched.

## 1. Answer

**The Meshy bodies can share the existing rig and animation interfaces completely, but only through an offline transplant, and bone-name conversion alone would not have been enough.**

- Transplanted onto the baseline's own skeleton, the two bodies run the unchanged gait, pose solvers, gesture helpers, animation level of detail, clip cross-fades and all 13 clips of `character_v4.glb`. No change to `gait.ts`, `gaitRig.ts`, `strikeRig.ts`, `seats.ts`, `vehicleKit.ts`, `main.ts`, `save.ts`, the protocol or the server.
- The repo's own scripts, run unchanged on real-game builds where every humanoid is a Meshy body: **gait 13/13, sit-and-stand 11/11, moto 18/18, gestures 20/20, for the male and the female build, identical to the control** (section 4).
- What bone names alone would have missed was measured (section 3): rest pose, limb and torso proportions, shoe length against the gait's foot model, thigh thickness at the seat, hand length in gestures, the mouth point, the material policy, the scale.
- So the safe integration is **a small visual fit adapter, not a second character system**: an offline converter, a four-number `BodyFit` record per body, and three small runtime hooks (about 60 lines in `humanoid.ts`, 10 in `gesture.ts`). Section 7.
- Limits that remain: no wardrobe or hair swap on these bodies, no finger bones (as v4), not usable for làmb (clothed, no ngemb), a style gap with the cartoon crowd, and **other online players cannot see the chosen Meshy body** (no protocol change in this phase).

## 2. What was built and how it was tested

| Piece | File | Role |
|---|---|---|
| Transplant converter | `scripts/meshy/transplant-to-v4-rig.mjs` | Keeps `character_v4.glb`'s skeleton, skin, sockets and all clips byte for byte; replaces the meshes by the Meshy mesh baked into v4's rest pose and skinned to v4's 20 bones (Meshy's own weights, merged). |
| Free quality and weight steps | `scripts/meshy/simplify-body.mjs` | Smooth normals across seams, welding, simplification, texture size. |
| Body registry (dormant unless a Meshy body is asked for) | `src/actors/humanoid.ts` | `preloadBody`, `new Humanoid(look, body)`, fallback to v4, `BodyFit`, a material branch that keeps a body's own texture. |
| Gesture fit | `src/actors/gesture.ts` | `reach` stops the wrist short by the body's extra hand length; `mouth` uses the body's mouth point. |
| Harness | `proof/meshy/harness.ts`, `run-proof.mjs` | The real `Humanoid` on four bodies (v4 male and female as control, Meshy homme and femme), measured on the **mesh surface**, not only the bones. |
| Real-game runs | `docs/meshy/proof/game/` | The repo's own check scripts on a control build and on builds where `assets/character_v4.glb` is replaced by each Meshy body. |

Checks run on the branch: `tsc --noEmit` clean, **1510 tests pass (2 skipped), the same count as the untouched baseline**.

## 3. Results

Control = the shipped v4 body, same code, same clips. All tables are generated from `docs/meshy/proof/results.json` (`node proof/meshy/report-tables.mjs`).

#### On foot (soles against the ground while planted, cm; negative = below the ground)

| Speed | v4 male (control) | v4 female (control) | Meshy homme | Meshy femme |
|---|---|---|---|---|
| walk: sole 5th percentile / median | -2.6 / -1.9 | -2.5 / -1.8 | -1.9 / 0.0 | -1.5 / 0.0 |
| walk: deepest sole | -2.8 | -2.8 | -2.3 | -2.0 |
| walk: arm swing L / R (cm) | 55.4 / 55.4 | 53.5 / 53.5 | 55.4 / 55.4 | 52.0 / 52.0 |
| walk: foot slip, gait's own count (cm) | 0.0 / 0.0 | 0.0 / 0.0 | 0.0 / 0.0 | 0.0 / 0.0 |
| jog: sole 5th percentile / median | -3.3 / -1.9 | -3.4 / -1.8 | -2.9 / 0.0 | -2.4 / 0.0 |
| jog: deepest sole | -3.7 | -3.6 | -3.5 | -3.0 |
| jog: arm swing L / R (cm) | 45.4 / 45.4 | 43.9 / 43.9 | 45.4 / 45.4 | 42.8 / 42.8 |
| jog: foot slip, gait's own count (cm) | 0.0 / 0.0 | 0.0 / 0.0 | 0.0 / 0.0 | 0.0 / 0.0 |
| run: sole 5th percentile / median | -3.7 / -1.9 | -3.5 / -1.8 | -3.4 / 0.0 | -3.2 / 0.0 |
| run: deepest sole | -4.1 | -3.9 | -3.9 | -3.6 |
| run: arm swing L / R (cm) | 44.5 / 44.5 | 42.0 / 42.0 | 44.5 / 44.5 | 40.3 / 40.3 |
| run: foot slip, gait's own count (cm) | 0.0 / 0.0 | 0.0 / 0.0 | 0.0 / 0.0 | 0.0 / 0.0 |

#### Sit and stand (chair convention, seat top 0.46 m)

| Measure | v4 male (control) | v4 female (control) | Meshy homme | Meshy femme |
|---|---|---|---|---|
| buttocks/thighs against the seat top (cm) | -9.9 | -13.7 | -11.3 | -13.9 |
| soles against the floor (cm) | -7.8 | -7.4 | -3.1 | -5.6 |
| thigh slope (deg) | -5.03 | -4.977 | -5.03 | -5.03 |
| after standing: hips / feet back to the start (cm) | 0.2 / 0.2 (Idle) | 0.2 / 0.2 (Idle) | 0.2 / 0.2 (Idle) | 0.2 / 0.2 (Idle) |

#### Riding the 125 cc moto (5 seeds, the repo's own test: palm tip within 10 cm of a grip, foot within 12 cm of a peg)

| Measure | v4 male (control) | v4 female (control) | Meshy homme | Meshy femme |
|---|---|---|---|---|
| palm tip to grip, median / worst (cm) | 5.3 / 5.3 | 6.5 / 6.5 | 5.3 / 5.3 | 7.6 / 7.6 |
| nearest hand vertex to grip, worst (cm) | 1.1 | 2.3 | 1.3 | 5.4 |
| foot bone to peg, worst (cm) | 4.0 | 3.2 | 4.0 | 2.8 |
| nearest foot vertex to peg, worst (cm) | 2.4 | 2.5 | 3.4 | 3.0 |

#### Gestures and held objects

| Measure | v4 male (control) | v4 female (control) | Meshy homme | Meshy femme |
|---|---|---|---|---|
| hand to mouth: fingers to the mouth, mesh (cm) | 10.1 | 9.9 | 1.4 | 3.0 |
| hand to mouth: fingers to the game's mouth point (cm) | 1.5 | 1.4 | 2.4 | 4.6 |
| arms up: hand height L / R (m) | 1.949 / 1.949 | 1.875 / 1.875 | 1.949 / 1.949 | 1.842 / 1.842 |
| held cup: grip point to nearest hand vertex (cm) | 2.0 | 1.8 | 0.6 | 2.0 |

#### Transitions: fastest-moving point of the body surface (m/s; same clips, so equal values mean no new pop)

| Transition | v4 male (control) | v4 female (control) | Meshy homme | Meshy femme |
|---|---|---|---|---|
| idle | 0.163 | 0.163 | 0.169 | 0.17 |
| idle→walk | 4.831 | 4.898 | 5.082 | 5.43 |
| walk→run | 9.962 | 8.984 | 10.314 | 6.585 |
| run→stop | 9.244 | 10.517 | 10.657 | 14.333 |
| talk | 3.94 | 3.94 | 4.48 | 4.311 |
| sit | 3.843 | 3.843 | 4.09 | 4.129 |
| stand | 10.264 | 10.264 | 9.712 | 10.27 |
| dance | 10.81 | 10.81 | 11.836 | 12.224 |
| celebrate | 10.795 | 10.795 | 11.885 | 12.379 |
| back to idle | 8.98 | 8.979 | 9.852 | 10.038 |

#### Cost of one body

| Measure | v4 male (control) | v4 female (control) | Meshy homme | Meshy femme |
|---|---|---|---|---|
| draw calls | 10 | 10 | 1 | 1 |
| triangles | 5324 | 5516 | 12482 | 12528 |
| skinned vertices | 2787 | 2885 | 14419 | 21625 |
| bones | 20 | 20 | 20 | 20 |
| texture memory with mipmaps (MB) | 0 | 0 | 5.32 | 5.32 |
| JS per body per frame, gait on (ms; this machine) | 0.018 | 0.011 | 0.009 | 0.008 |
| 40 bodies: draw calls / triangles | 400 / 212960 | 400 / 220640 | 40 / 499280 | 40 / 501120 |

Switching, fallback, load times and the low-detail variants are in `docs/meshy/proof/results.json`.

### What each result says

- **Idle, Walk, Run, arm swing, foot placement.** Skeleton motion is identical to the control to the millimetre (arm swing, pelvis range, gait's own slip count 0). On the surface, planted soles sit at the ground (median 0.0 cm; the control's own soles sit 1.9 cm below it) and the deepest dip at a run is 3.9 cm (homme) and 3.6 cm (femme) against 4.1 and 3.9 for the control.
- **Sit and stand.** The thighs reach the seat 1.4 cm deeper than the control for the homme and equal for the femme; the soles end closer to the floor than the control's; standing again returns hips and feet to the start (0.2 cm, Idle).
- **Moto.** The repo's own test (palm tip within 10 cm of a grip, foot within 12 cm of a peg) passes for both: palm tip 5.3 cm (homme, equal to the control) and 7.6 cm (femme); the femme's nearest finger is 5.4 cm from the grip against the control's 2.3 cm, so her hands sit visibly a little high above the bar.
- **Gestures and objects.** With the fit, fingers reach the mouth within 1.4 cm (homme) and 3.0 cm (femme); the control's own mitten reaches within 1.5 cm of the game's mouth point. A held cup sits within 2 cm of a hand vertex.
- **Transitions.** The same clips cross-fade on the same bones, so no new pop appears. The surface peaks differ only by body size: the homme is 5–15% above the control; the femme's `run→stop` peak is 14.3 m/s against 10.5, from hair and jacket far from the joints. That one deserves a look in motion on a device.
- **Switching and fallback.** 60 switches between v4, homme and femme: 0 errors, geometry and texture counts unchanged (no leak), 0.2–0.5 ms to make a body. A body not loaded, or whose file is missing (404), falls back to v4 without an exception; reloading restores it.

### What bone-name conversion alone would have missed (measured)

| Gap | Measured | What closed it |
|---|---|---|
| Rest pose: generated arms out, palms up/forward | The Meshy rest arms point out; v4's hang | Posed into v4's rest pose in the transplant; palms twisted to face the thighs |
| Legs and arms against the rig's joints | Homme: thigh +4–6%, shin −8%, upper arm +8–14%, forearm −15%. **Femme: upper arm +28–38%, torso +25% (her shoulder joints sit 13 cm below v4's)** | Per-segment fit and a trunk warp; unfitted, the femme's jacket grew shoulder "wings" |
| Shoe length against the gait's foot model | Meshy sneakers are 28–32 cm; v4's feet about 14 cm. Before the shoe fit, planted soles dipped up to **6.3 cm (femme) and 4.1 cm (homme) at a walk, 9.6 and 6.5 cm at a run** | Shoes fitted to the gait's heel and toe (to 66–71% of their length): dips are now below the control's |
| Thicker thighs and back | Before the lift, the homme's thighs sat 14.3 cm into the seat against the control's 9.9 | `sitLift` 3 cm on seated and lying poses |
| Longer hands in wrist-targeted gestures | Before the fit, fingers ended 6.3 cm (homme) and 8.9 cm (femme) from the mouth, over the forehead for the homme | `handExtra` 8 cm and a per-body mouth point |
| Material policy | `Humanoid` replaces unknown materials by a flat colour and would drop the texture | A branch that keeps a Meshy body's texture |
| Scale | The femme transplant is 1.97 m | `BODY_FIT.scale` 0.93 (1.83 m) |

## 4. The repo's own scripts on real-game builds

Builds where `assets/character_v4.glb` is replaced by a Meshy body, so every humanoid in the game (player, cast, crowd, wrestlers) is that body, a harsher test than player-only. A one-line material relaxation was needed in the build so the texture shows (not committed). Logs: `docs/meshy/proof/game/`.

| Script | Control | Meshy homme build | Meshy femme build |
|---|---|---|---|
| `check-gait` (desktop): no sliding, cadence of the speed, starts, stops, turns | 13/13 | 13/13 | 13/13 |
| `check-sit-stand` | 11/11 | 11/11 | 11/11 |
| `check-moto` | 18/18 | 18/18 | 18/18 |
| `check-gestures` | 20/20 | 20/20 | 20/20 |

These scripts judge behaviour through bones and game state, so they confirm that the interfaces hold; the surface measurements in section 3 are what catch the mesh-level gaps. The wrestling scenes were not exercised (excluded by decision).

## 5. Visual review

Renders are in `docs/meshy/proof/` (`meshy_m-*`, `meshy_f-*`, `v4_m-*` from front, side, back, face, hands; `lineup-*` for idle, walk, run, sit, talk and the hand-to-mouth gesture), with the game's lights and tone mapping.

**Compatibility with the visual direction (`docs/ART_DIRECTION.md`).** The brief asks for expressive faces, separated hands, credible clothing, feet on the ground. The Meshy bodies meet it better than the baseline's v4 (smooth head, mitten hands, flat clothing). But they are **a different style**: photographic skin and fabric next to a flat low-poly world and v4 crowd. The player and a few named people could carry the realism; a whole street would not match. The call on that is yours; the proof makes both options possible.

| | Homme | Femme |
|---|---|---|
| Face | Readable and well proportioned, beard, frozen smile; slight faceting along the jaw | Painted look with heavy red cheek patches; the flat-shaded facets are gone after the smooth-normals fix |
| Hair | Short hair reads well | Flat black mass with spiky locks, no strand detail |
| Hands | Separate fingers, blocky tips; palms to the thighs after the fix; no finger animation | Fingers merged and blocky; same fix |
| Clothes and colours | Blue tee matches the game's player blue; jeans and sneakers fine | Olive jacket and yellow top; dark jacket back loses detail in game light |
| Motion | v4 clips on a realistic body look natural; clothes are rigid (no secondary motion) | Same; sleeves deform acceptably |
| Against the brief | Matches | Not what was asked: loose curls and bomber jacket instead of braids and tee, A-pose ignored |

At the extremes (arms overhead in Celebrate, wide dance reaches, the wrestling stance, grab and fall clips: `docs/meshy/proof/motion-extremes.png`) shoulders, elbows and the jackets deform acceptably, with no collapse or tearing seen. The wrestling clips were viewed for information only; they are not part of this phase.

### Cheapest fixes, free first (done = in this branch)

| Shortcoming | Fix | Credits | Status |
|---|---|---|---|
| Hands palm-forward and stiff, Idle with arms out | Posed into v4's rest pose, palms twisted | 0 | done |
| Gait, seat, moto and gesture mismatches | Transplant plus `BodyFit` | 0 | done |
| Femme faceted shading (flat normals, two vertices per triangle) | Smooth normals across seams (`simplify-body --smooth 60`) | 0 | done (21.6k vertices instead of 25.5k) |
| Weight on phones | Homme low-detail version: 6.2k triangles, 512 px, 656 KB (`meshy_m_low.glb`), face and hands still read at game distance | 0 | done |
| Femme cannot be simplified | Aggressive simplification smears her eye and tears the trousers; keep her at full detail, 512 px for the low preset (1.33 MB of texture instead of 5.32) | 0 | decided |
| Blocky hands, faceted face on the homme | Bake a normal map from the 388k-face source (needs Blender; none in this environment) | 0 | open, needs a Blender session |
| Femme hair and blush, jacket back too dark | Texture tweak (brightness, blush) offline | 0 | open |
| Style gap with the cartoon crowd | Decide player-only realism, or a colour grade to the world's palette | 0 | your decision |
| No wardrobe, no hair swap | Region tint masks for skin, shirt, trousers, shoes, hair, jacket (offline) | 0 | open |
| Femme brief not met (braids, tee, A-pose) | Re-roll the preview | 20 (35 more to finish) | only if you reject the current look |

## 6. Mobile performance (measured, with the limits stated)

Headless Chromium with SwiftShader: counts (draw calls, triangles, vertices, bytes) are exact; times compare builds and are **not phone numbers**. The repo's rule of thumb is JS about 3–4 times slower on a mid-range phone (`docs/PERF_EVENING.md`).

| One body | v4 | Meshy homme | Meshy femme | Homme low | Femme low |
|---|---|---|---|---|---|
| Draw calls | 10 | **1** | **1** | 1 | 1 |
| Triangles | 5.3–5.5k | 12.5k | 12.5k | **6.2k** | 12.5k |
| Skinned vertices | 2.8–2.9k | 14.4k | 21.6k | **7.7k** | 21.6k |
| Texture memory (with mipmaps) | none | 5.3 MB | 5.3 MB | **1.3 MB** | **1.3 MB** |
| Download | 601 KB (shared by every v4 body) | 1136 KB | 1456 KB | 656 KB | 1383 KB |
| JS per body per frame (gait on, this machine) | 0.011–0.018 ms | 0.009 ms | 0.008 ms | 0.012 ms | 0.010 ms |
| Parse and load | 55 ms | 77 ms | 56 ms | 30 ms | 29 ms |

Reading:
- **CPU is a non-issue**: the animation cost is the skeleton's, identical to v4 (0.01 ms a body; budget: a full humanoid about 0.1 ms).
- **Draw calls fall ten-fold** (10 to 1 a body; the phone budget is 180 a frame), **triangles and skinned vertices rise** (2.3× and 5–8×). Forty Meshy bodies at once would be 500k triangles: too many for a cheap phone. The existing humanoid budget already keeps full bodies to a handful, and `crowdLod` swaps far ones for instanced figures.
- GPU memory is per body type, not per body (geometry and texture are shared by clones): about 1 MB of vertices and 5.3 MB of texture per Meshy type, 1.3 MB with the 512 px low texture.
- The body is only fetched when chosen (1.1–1.5 MB), not for everyone.
- Real-game numbers with every humanoid a Meshy body (worst case), phone preset, from `scripts/perf.mjs` and `scripts/check-perf-evening.mjs`:
  - `scripts/perf.mjs`, phone viewport, low quality, draw calls / triangles: Plateau 13 h, control 79 / 79k, Meshy 61–62 / 103k; Pikine 13 h, 99 / 132k against 86–87 / 148k; Pikine 21 h, 120 / 138k against 103–108 / 152–166k.
  - `scripts/check-perf-evening.mjs`, low preset, the three gala moments (17:30, 19:00, 23:00): draw calls 127 / 108 / 116 for the control and 88–91 / 75–76 / 86 for the Meshy builds (budget 180); triangles 169k / 157k / 180k against 213–225k / 183k / 214–220k; JS update 3.1 / 2.5 / 3.0 ms against 3.7–3.9 / 2.6–3.1 / 2.9–3.0 ms (budget 4 ms). In this all-Meshy worst case the update gains 0.6–0.8 ms at 17:30 and keeps little headroom; with only the player Meshy it is one body. The software-render frame time rises with the triangles (177 to 209–228 ms at 17:30), as a CPU rasteriser does; it is not a phone number.
- **Not measured**: a real phone. Frame time on a mid-range Android with the player Meshy plus a few named NPCs needs a device run (acceptance criterion 6).

Recommendation: Meshy body for the player and a few named people only; the low-detail version on the phone preset; the femme at 512 px there.

## 7. Smallest safe integration

1. **Offline** (no runtime cost): the converter turns a Meshy `rigged.glb` into a drop-in GLB with v4's bone names, hierarchy, clips and sockets; `simplify-body` makes the low-detail version. Output is a normal asset beside `character_v4.glb`.
2. **Runtime, three hooks, dormant by default:** `preloadBody(id, url)` and `new Humanoid(look, body)` (v4 when the body is absent or fails), the material branch that keeps a body's texture, and `BodyFit` (scale, seat lift, hand length, mouth point) read by `reach` and `mouth` in `gesture.ts`. v4 bodies take the old path with all-zero fit; the 1510 tests and the real-game scripts confirm it.
3. **What stays out:** gait, strike rig, seats, vehicles, save, protocol, server, crowd, wrestlers. The choice of body is a client preference stored the way worn gear is (a counter in `counters`, no schema change), when the UI step is approved; it is not part of this proof.
4. **Known follow-ups before Phase 2 (named NPCs):**
   - the shared humanoid budget swaps far bodies for an instanced figure coloured from `Cloth_*` meshes; a Meshy body has none, so a far Meshy NPC would turn beige. It needs a per-body far colour;
   - the arena must hand the player to the v4 `Wrestler` at the door;
   - other online players see the v4 tee for everyone: **the chosen Meshy body is visible only to its owner** until a protocol version bump (not in this phase).

## 8. Staged credit plan

Balance 940 (925 monthly, resetting 17 Nov 18:05 UTC; 15 permanent). The monthly credits probably expire at the reset (not confirmed); that is not a reason to spend them. Observed prices: preview 20, refine 10, remesh 5, rigging 5 = 40 for a complete rigged body. Retexture, animation and image-to-3D prices are unknown (price list unreachable from here).

| Stage | Condition | Spend |
|---|---|---|
| 0, now | Visual and animation assessment under review | **0** |
| 1 | You accept the assessment and the player-only scope | 0 (free steps in section 5: tint masks, texture work, a Blender normal bake session) |
| 2 | Phase 2 approved: one named-NPC pilot | 40 (card B) |
| 3 | Pilot accepted | up to two more NPCs, 40 each, or one re-roll (card A) |
| Ceiling proposed | | **≤ 140 before 17 Nov, about 15% of the balance; anything unspent is left unspent** |

Every card below needs your approval and an updated estimate before it runs.

| Card | A. Femme re-roll | B. Named NPC body (Phase 2) | C. Retexture variants | D. Hero wrestler base |
|---|---|---|---|---|
| Purpose and game benefit | Braids, tee, A-pose as briefed | A recurring cast member with a realistic body beside the player | New prints on the same garment shapes | A bare-torso body with ngemb for làmb parity |
| Credit cost | 20 preview; 20 more to finish (40 total) | 40 (preview 20, refine 10, remesh 5, rigging 5); pilot first | **Unknown**: price must be read first | 40 (+20 per re-roll) |
| Expected output | A new femme rigged body, the current one kept as an alternate | One rigged body, 12k triangles, textured | A re-textured GLB on unchanged geometry | One rigged body |
| Reuse potential | Replaces the femme for every player who picks her | One body plus free region tints: several colourways without new credits | High per garment shape, none across shapes | Low: v4 `Wrestler` already serves |
| Acceptance | Proof suite green; arms within 30° of the body; braids; face and hands reviewed; art review | Proof suite green; `BodyFit` measured; far-figure colour fixed; art and persona review | Region tints cannot do it; price confirmed | Only if the v4 `Wrestler` is judged insufficient |
| Recommendation | Only if the current femme is rejected | The only planned spend | Defer | Defer |

## 9. Acceptance criteria: where each stands

| # | Criterion | State |
|---|---|---|
| 1 | Preservation: manifest, task ids, checksums, no signed URL, private archive | Done and verified locally (section 10); a durable independent copy still pending your choice |
| 2 | Asset contract: v4 bone names, sockets, clips, one material | Met for both bodies; low-detail variants made |
| 3 | Gait within 10% of control | Met: arm swing and slip identical; soles at or better than control |
| 4 | Sit, ride, gestures within the repo's own tolerances | Met (palm 5.3 and 7.6 cm against 10; feet against pegs 4.0 and 2.8 against 12) |
| 5 | Arena unchanged | Met: nothing touched; the hand-over at the door is designed, not built |
| 6 | Performance on phone preset | Counts measured; **a device run is still needed** |
| 7 | Saves and multiplayer | Met: no schema, key or protocol change; visibility limitation documented |
| 8 | Visual review | Done (section 5); the style-gap call is yours |
| 9 | Isolation | Met: local branch from `6789c6e`, no push |

## 10. Archive and files

`private-archive/meshy-20261017/` and `.tar.gz` (git-ignored, about 190 MB): the Meshy outputs (refine, remesh, rigged, walking, running) for both bodies, the first optimised GLBs, sanitised task snapshots (no signed URL), `MANIFEST.json` and `SHA256SUMS`, the scripts, the notes, the proof output. Rebuilt and verified by `node scripts/meshy/make-archive.mjs` (extraction and checksum check pass). **It lives on one machine until you copy it somewhere durable and verify its checksums there.** The Meshy account keeps all eight tasks (`SUCCEEDED`); do not delete them before that.

Reproduce: see `proof/meshy/README.md`.
