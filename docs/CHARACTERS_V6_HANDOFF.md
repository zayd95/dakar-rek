# Characters v6 — handoff to the lanes (Habib, 10–11 Oct 2026)

Branch `lane/characters-v6` = 8 commits on top of `ce1d9b7` (characters-only, 8 Oct). **Not merged with
`wip/visual-pass` yet** (56 commits behind): the merge touches `humanoid.ts`, `npc.ts`, `main.ts`, `hud.ts`
and the new interaction/activity framework expects the v4 rig API. Steps below.

## What is done (validated with in-game screenshots, typecheck + 27 tests green)
- **Character v6** (`public/assets/character_v6.glb`, textures `public/assets/tex/*_v6.*`): MakeHuman/MPFB2 body
  (CC0), 1.6k-vertex proxy on the 31-bone CMU rig, real skin/eyes/brows/lashes, baked AO, Blink.
- Generated garments/hair: tee, trousers, shorts, boubou (flat sleeves close to the body, embroidery), dress top +
  wrap skirt (wax), kufi, headwrap, shoes, ngemb A/B, beard, hair short/puff/braids/locs.
- Body shapes = morph targets **plus joint offsets** (`Female, Heavy, Muscular, Old` + `HeavyF, MuscularF, OldF`),
  face sliders (`FaceNose, FaceLips, FaceJaw, FaceEyes, FaceLong, FaceRound`), height (group scale).
- Clips: CMU mocap retargeted (Walk, Run, Idle, Talk, Phone at the ear, Sit/Eat at 0.5 m hip height, Wave) and
  the v5 wrestling clips (Stance, Grab, Fall_Back, Prep, Dance_A/B, Celebrate, Entrance_Walk).
- Soft cloth: sway shader on robe/skirt/braids/locs, painted fabric folds.
- Street-life pass after Habib's Accra reference video: sturdier baseline build, arms tucked to the body,
  slightly larger head, crowd/traffic +75 %, desynced walk phases, **hailable taxis** (E at the roadside →
  nearest taxi routes to you, brakes, direct ride at 2.2× the car rapide fare). Debug: `__dakar.taxi()`.
- `src/core/look.ts`: three-free look model, `encodeLook/decodeLook` (73-char code for multiplayer),
  avatar book (several avatars, active one) — **the creator UI is not built yet**.
- Source: `assets-src/people_v6/` (generator scripts + README); Blender file on Habib's Mac
  `~/DakarRek-assets/people_mpfb_v1.blend`.

## Merge into wip/visual-pass — what to adapt
1. **Bone names** (v4 → v6) for `gesture.ts`, `perform.ts`, `meals.ts` and any `h.bone(...)`:
   `hips→Hips, spine→Spine, chest→Spine1, neck→Neck1, head→Head, shoulder.L→LeftShoulder,
   upper_arm.L→LeftArm, forearm.L→LeftForeArm, hand.L→LeftHand, thigh.L→LeftUpLeg, shin.L→LeftLeg,
   foot.L→LeftFoot` (same for R/Right). Easiest: keep `bone(name)` and map legacy names inside it.
2. Re-add to v6 `Humanoid`: `overlay` hook (call it at the end of `tick`, after `tuckArms`/look),
   `bone(name)`, and export `fixSitKnees` as a no-op (v6 Sit is correct) or delete it with
   `tests/humanoid.test.ts` (that test reads `character_v4.glb`, which v6 no longer ships).
3. `npc.ts`: keep their `Crowd.bodies()`; our `Crowd.update(dt, px, pz)` respawns walkers near the player
   (keep the arguments). Keep our `DecorativeTraffic` taxi methods (`nearestTaxi/hail/release/speedOf`).
4. `main.ts`: re-apply the taxi block (prompt + `openTaxi` + `doTravel(dest, via)`) and the denser `QUAL`
   counts in their modules layout (their main.ts became a host for `game/modules.ts`).
5. Character clips only animate rotations + `Hips.position`; joint offsets are reapplied each frame in `tick`.

## Left to do
- Create-a-character screen (preview, tabs Corps/Visage/Cheveux/Tenue, several avatars) on `core/look.ts`.
- Send the full look code to other players (server accepts `code`, `RemoteAvatars` decodes it).
- Retarget with bone twist (hands/head still a bit stiff), idle variations, breathing.
- Taxi ride check on a real device (the headless check reaches "Taxi… il arrive" only).
- Cultural content stays **Unreviewed** until Habib and practitioners review it.
