# Meshy characters: integration audit, plan, credit budget and acceptance criteria

17 October 2026. Status: **plan only, nothing implemented against the current baseline.** No Meshy generation, refine, remesh or rigging has run since the freeze, and nothing was merged or deployed.

Baseline audited: `origin/fix/duel-guard-and-checks-20261017` at `6789c6e` (read-only worktree; no commit, comment or push on that branch or on the Red Team work).
PR #42 (`claude/lucid-cori-60vlgt`) targets the old `main`. It must not be merged: its `main.ts`, `save.ts` (schema 2, `avatar` field) and `cityPlayer.ts` are a competing character system.

## 1. Meshy account

| | |
|---|---|
| Balance (exact, `GET /balance`, 17 Oct) | **940 credits** = 925 monthly + 15 permanent |
| Monthly credits reset | 2026-11-17 18:05 UTC (monthly credits appear to reset rather than roll over; confirm) |
| Spent on these two characters | 80 credits: homme 40 (20 preview earlier, 20 this session), femme 40 |
| Licensing tier | **Not exposed by the CLI or the API** (the balance endpoint returns credits only). A monthly allowance of about 1,000 credits is far above the free plan (published as roughly 100–200 a month), so the account looks like a paid plan, but that is an inference. **Confirm the plan name and terms in the Meshy account before release.** |
| Licence terms found (search results; `docs.meshy.ai` and the help centre are not reachable from the sandbox, so not read first-hand) | Free-plan outputs: CC BY 4.0, commercial use with attribution. Paid plans: commercial use, no attribution required, user owns outputs, conditional on not publishing to the Meshy Community and on the inputs not infringing copyright. Models made on a paid plan stay downloadable after a downgrade. |

Sources: [Meshy pricing and credits](https://docs.meshy.ai/en/webapp/pricing), [Can I use Meshy assets commercially?](https://intercom.help/meshy/en/articles/16102098-can-i-use-meshy-assets-commercially), [Free plan](https://intercom.help/meshy/en/articles/15696428-what-is-included-on-the-free-plan).

Observed prices (`consumed_credits` on the finished tasks): text-to-3D preview 20, refine 10, remesh 5, rigging 5, so **40 credits for one complete rigged character**. The CLI planner (`make --dry-run`, no API call) confirms preview + refine = 30. Retexture, animation and image-to-3D prices are **unknown** (not in the planner; the price page is unreachable here) and must be read from Meshy's price list before any estimate.

## 2. What is preserved

`docs/meshy/MESHY_ASSETS_MANIFEST.json` lists, per character: prompt, every task id with stage, credits and time, and every source file with size and SHA-256. Signed download URLs are not recorded.

| | homme | femme |
|---|---|---|
| Task ids | preview `01a14b42-884b-75e4-be5e-3b36162636b2`, refine `01a14b59-707b-70d4-bb1c-cd2fb19fd087`, remesh `01a14b5a-c535-70a4-833a-7435d1b48307`, rigging `01a14b5c-20ca-7755-97cb-e45fe001ee25` | preview `01a14b63-cdfb-7226-b681-99182fb1107e`, refine `01a14b64-d3ef-7731-bad3-250961005d4d`, remesh `01a14b65-dac4-730e-95f9-728b5a2ec829`, rigging `01a14b67-c804-76f2-a5c3-699f245dfd3d` |
| Source files (`assets-src/meshy_output/…`, git-ignored, about 204 MB in all) | refine (high-res), remesh 12k, rigged, walking, running | same five |
| Shipped, optimised | `public/assets/city_player_meshy.glb` (1.08 MB, 12,482 tris) | `public/assets/city_player_femme.glb` (1.61 MB, 12,528 tris) |

All 8 tasks still answer `SUCCEEDED` on the Meshy account (checked 17 Oct), so the account is the canonical store. **The raw files exist only in the session container and in Meshy.** Where to keep a durable copy (see decisions) is for you to choose; nothing was pushed or uploaded. The prompts: the homme prompt was written before this session (it asked for stylised, low-poly proportions; Meshy returned realistic proportions); the femme prompt is ours and the A-pose and braids requests were not honoured.

## 3. Audit against the current `Humanoid` system

What the baseline is: one shared body (`public/assets/character_v4.glb`, 20 bones; asset register: body 1.9k tris, head 2k, garments 0.2–2.3k each, so roughly 5–8k tris dressed) with Blender-authored Female/Muscular/Heavy morphs, separate garment and hair meshes recoloured by `PersonLook`, face detail meshes culled beyond 14 m, a computed gait (`gait.ts`, `gaitRig.ts`) that drives bones by name after the mixer, rest-pose pose solvers (`Lie`, `SitFloor`, `Ride`), a `strikeRig` and a gesture overlay that aim bones by name, an animation LOD, and a shared humanoid budget. The whole game (player, cast, crowd, wrestlers, remote peers) goes through it.

Skeleton facts (measured on the files):

| | v4 (baseline) | Meshy homme (1.75 m) | Meshy femme (1.70 m) |
|---|---|---|---|
| Bones | 20: `root, hips, spine, chest, neck, head, shoulder/upper_arm/forearm/hand .L/.R, thigh/shin/foot .L/.R` | 24: `Hips, Spine02, Spine01, Spine, neck, Head, head_end, headfront, Left/RightShoulder, Arm, ForeArm, Hand, UpLeg, Leg, Foot, ToeBase` (no `root`, three spine bones, spine order reversed) | same layout |
| Bone +Y along the bone | yes | **yes** (verified for every joint) | yes |
| Rest pose | arms hanging | **arms out** (generated pose) | arms out |
| Hip joint height | 0.950 | 0.853 | 0.865 |
| Thigh / shin | 0.430 / 0.430 | 0.361 / 0.355 | 0.363 / 0.376 |
| Hip→ankle | 0.86 | 0.71 (about 11% short once scaled to v4's 1.9 m) | 0.72 |
| Finger bones | none (`hand` only) | none | none |
| Morph targets / separate garments, hair, eyes | yes | **none**: one mesh, one 1024² texture, clothes, hair and eyes baked | none |

Verdict per area (compatible with an adapter / needs core change / blocker):

| Area | Verdict | Why |
|---|---|---|
| Movement (gait, Walk, Run, Jog) | **Adapter**, then one small core question | `gaitRig` looks bones up by the 20 v4 names and starts arms from the rest rotation; `gait.ts` has fixed leg lengths (`RIG.thigh 0.4301`, `shin 0.4305`) for its two-bone IK. Meshy legs are 11% short, so feet would slide. Fix in the adapter by rescaling the skeleton to v4's leg length and setting a relaxed rest pose; if that distorts the body, make `RIG` per body (a few lines in `gait.ts`, shared with the Red Team area, so agree first). |
| Ride | **Adapter** | `Ride` is solved from the rest pose by aiming bones, so it works with +Y bones. Hands and feet land on the moto's grips and pegs only if arm length matches: Meshy upper arm / forearm 0.243 / 0.292 against 0.306 / 0.273, so expect a few cm of error; the check below decides. |
| Sit, Kneel, floor poses | **Adapter** | `Sit` is a clip retargeted from v4; `SIT_HIPS = 0.48` and the seat heights assume v4 thigh length (0.43). Shorter Meshy thighs leave the feet about 7 cm off the floor unless the leg is rescaled. |
| Grab, Fall_Back, Stance (duel) | **Blocker for the arena as a clothed body** | The clips can be retargeted by world-space bone deltas (both rigs have +Y bones), but paired holds depend on arm length and torso width, and the Meshy bodies are dressed (tee, bomber jacket) with no ngemb and no bare torso. **Keep the existing v4 `Wrestler` for every làmb scene** and swap bodies at the arena door, as the box/proxy swap already does. |
| Gestures (hand to mouth, comb, arms up) | **Adapter** | Bone aims by name; contact accuracy depends on proportions (`check-gestures.mjs`). |
| Wardrobe and `PersonLook` | **Blocker for garments** | `setLook` shows and recolours `Cloth_*` meshes and hair meshes; Meshy has none, and the v4 garments are fitted to the Blender body and its morphs, so they will not fit a Meshy body. What survives: skin and region tints (section 5), sockets for scarves, caps and flags. |
| Multiplayer | **Local only, no protocol change** | A peer's look is one index (`look: 0–5`, shirt colour) and every client draws it as a v4 tee; clips go over the wire from the allowlist `PRESENCE_CLIPS` (15 names). A Meshy body would be visible to its owner only, and all 15 clips must exist on it. Extending the protocol needs a version bump and a worker deploy: not in this phase. |
| Save v5 | **Compatible if additive** | PR #42's `avatar` field and schema 2 are incompatible. `docs/SAVES.md` rules: a schema owns its key, no schema change without a new key. Store the body choice the way worn gear is stored (`WORN_COUNTER` in `src/economy/wear.ts`): a counter in `counters`, no schema change; run `check-save-compat.mjs`. |
| Mobile performance | **Acceptable for the player and a few cast, not for crowds** | v4: roughly 5–8k tris dressed, about 6 draw calls per body (`humanoid.ts` counts four face meshes on top of six). Meshy: 12.5k tris, **1** draw call, 24 bones, one 1024² texture (about 5.6 MB of GPU memory with mips, each). Budgets (`docs/PERF_EVENING.md`): whole frame ≤ 180 draw calls on low, JS update ≤ 4 ms, a full humanoid costs about 0.1 ms. As the player only it adds one body; as extras it would not fit the shared humanoid budget. |
| Animation LOD and far figures | **Compatible** | Keep `group.name = 'humanoid_v2'` and no `userData.noLod` so `crowdLod` still manages it; the player body is `fullRate`. |
| Head helpers (`neckJoin`, `fitEyes`, `reshapeCharacter`) | **Skip for Meshy bodies** | They operate on named v4 head meshes. |
| Materials | **Small change** | `Humanoid` replaces any unknown material with a colour-only Lambert and would drop the Meshy texture; the Meshy mesh needs a `map`-preserving branch. |

## 4. Recommendation: port into an isolated branch, extend `Humanoid`, add no second system

Branch `feature/meshy-hero-bodies-20261018` from `6789c6e` (not from `main`, not from PR #42). Do not copy `cityPlayer.ts`, PR #42's `main.ts` or `save.ts`.

1. **Offline adapter, zero runtime fork.** `scripts/build-meshy-body.mjs` (a generalisation of the `build-meshy-avatar.mjs` already written) turns a Meshy rigged GLB into a v4-compatible GLB: rename and re-parent bones to the 20 v4 names (add `root`; Spine02→`spine`, Spine01→`chest`, the top Spine kept as an extra child; ToeBase and head helpers kept as extras); set the rest pose to a relaxed standing pose while keeping the inverse bind matrices; rescale legs to 0.43/0.43 and hips to 0.95; add the four `socket_*` empties; **retarget the v4 clips** (Idle, Walk, Run, Talk, Sit, Stance, Grab, Fall_Back, Prep, Dance_A/B, Celebrate, Entrance_Walk) by world-space deltas, so `Jog`, `Kneel`, `Lie`, `SitFloor` and `Ride` are derived at load by the existing code; palms and Idle as already fixed (forearm and hand twisted 75°, Idle from a Walk frame); 1024 px JPEG, no PBR maps.
2. **One runtime hook in `Humanoid`:** an optional body id (`'v4'` default, `'meshy_m'`, `'meshy_f'`) that selects the template and skips the v4-only steps; the `map`-preserving material branch; everything else (gait, LOD, overlays, hold, `bone()`, `reset()`) stays shared.
3. **Scope:** the player body (and optionally a few named cast within the shared budget). Crowd and NPC extras stay v4. The arena swaps to the v4 `Wrestler`.
4. **Choice and save:** a counter in `counters` (the `WORN_COUNTER` pattern), a menu entry in the existing system menu, no schema change.
5. **Land in small steps:** (a) assets, manifest, adapter and its tests, no runtime change; (b) the `Humanoid` hook behind a flag, off by default; (c) the player choice. Each step is its own commit and can be reverted alone. No changes to `server/`, `protocol.ts`, `main.ts` beyond the one call that builds the player body, or the Red Team files.

## 5. Reusing the bodies with other clothing and hairstyles

Short answer: **colours yes, shapes no.**

- **Not possible with these assets:** swapping garments or hairstyles. Clothes and hair are baked into the one mesh and texture, and the v4 garments and hair do not fit a Meshy body (different proportions, no morphs).
- **Zero credits:** colour variants of the same outfit. Split the texture offline by region (skin, hair, top, bottom, shoes, jacket) into a mask, then tint per region at runtime (vertex colours or a mask channel, no extra draw call). That gives skin tones, shirt and trouser colours, jacket colour, hair colour. It reuses the existing `SKINS` palette idea.
- **Credits, small:** `retexture` on the same geometry for new prints or fabrics on the same garment shapes (price unknown until read from Meshy; roughly the cost of a refine is plausible but unverified). A T-shirt cannot become a boubou by retexturing: the silhouette is fixed.
- **Rigid headwear:** kufi and headwrap from v4 could be attached to the head socket with a per-body fit transform. Hair volume under them will clip on the curly-haired femme; test before promising.
- **Not recommended:** generating one bare base body per sex and re-fitting every v4 garment and morph to it in Blender. That is weeks of Blender work, Meshy may refuse or blur a bare body, and v4 already provides the wardrobe. Improve v4's textures and faces instead of replacing it.
- **Practical rule:** use Meshy bodies as a few hero looks (the player's city identities, perhaps three cast members), keep v4 for variety, wrestlers and crowds. A new silhouette costs a complete 40-credit character.

## 6. Visual shortcomings and the cheapest fix

| Shortcoming (seen in renders) | Cheapest fix | Credits |
|---|---|---|
| Hands were palms-forward and stiff in motion (no finger bones; the baseline v4 has none either) | Already fixed in the clips (twist) and Idle (Walk frame); finger detail stays blocky | 0 |
| Remeshed hands and shoes are blocky in close-up (12k tris spread over the whole body) | Remesh at 20–25k with the hands weighted, or accept at game distance (camera 8 m) | 5 per body if redone |
| Style mismatch: realistic photo-like skin and baked lighting next to a flat Lambert low-poly world; the homme prompt asked for stylised low-poly | Flatten lighting (already `remove-lighting`), gentle colour grade to the world's palette; judge in a portrait capture before spending anything | 0 |
| Femme: bomber jacket and loose curls instead of the braids and tee that were asked for; A-pose ignored | Accept as an alternate look, or re-roll (preview only, 20) once the style is chosen | 0 or 20 |
| Baked skin tone and clothes: no variation across people | Region masks and tints (section 5) | 0 |
| 12.5k tris and a 1024² texture per body | Free local simplification (meshoptimizer) to about 6k tris and 512² for the low preset; compare against `check-perf-evening` | 0 |
| No bare-torso body, so no ngemb and no arena use | Keep the v4 `Wrestler`; if a Meshy wrestler is wanted, generate one purpose-built body (needs approval, see budget) | 40 |
| No expression or eye animation, no face meshes | Acceptable at conversation distance; check the portrait capture | 0 |
| Clips: only Walk and Run from Meshy | Retarget the v4 clips offline | 0 |

## 7. Credit budget

Balance 940 (925 monthly resetting 17 Nov, 15 permanent). **Nothing below is authorised; each line needs your explicit approval and an updated estimate first.**

| Phase | Work | Credits |
|---|---|---|
| 0, proposed first | Adapter, retargeting, tint masks, simplification, tests, captures | **0** |
| 1, only if approved | One purpose-built bare-torso wrestler body with ngemb for làmb (preview 20 + refine 10 + remesh 5 + rig 5), one re-roll of the preview allowed | 40 (+20) |
| 2, only if approved | Remesh a body at a higher polycount for hands | 5 per body |
| 3, only if approved | Retexture variants on existing bodies | unknown, to be read from Meshy before approval |
| Ceiling proposed | Phases 1 and 2 with one re-roll | **≤ 110, about 12% of the balance** |
| Not planned | Extra complete characters for variety; Meshy animation actions (cost unknown, and they would not match the duel clips) | 0 |

## 8. Acceptance criteria

Each criterion names the existing check where one exists (scripts and tests in the baseline). All must pass on a branch from `6789c6e` before any merge request is opened.

1. **Preservation.** The manifest matches the files' SHA-256; the eight tasks are still retrievable; no signed URL or credential in the repository; a PROVENANCE-style entry (prompt, settings, cost, date, job id) and the licence tier are recorded.
2. **Asset contract.** The adapted GLB contains the 20 v4 bone names (extras allowed), the four `socket_*` nodes, all clips of the v4 set plus those `Humanoid` derives (Jog, Kneel, Lie, SitFloor, Ride), one material, ≤ 6k triangles on the low preset (≤ 12.5k otherwise), ≤ 1.2 MB, one texture. The `humanoid`, `gait`, `proportions`, `eyes` and `neckJoin` tests pass for both `character_v4` and the Meshy bodies, parametrised on the GLB path.
3. **Gait.** `check-gait.mjs`, `check-stride.mjs`: foot slip and pelvis range for each Meshy body within 10% of the v4 figures over a 60 s walk, jog and run.
4. **Poses.** Sit: thighs level within 5°, feet within 3 cm of the floor, hips within 2 cm of `SIT_HIPS` (`check-sit-stand.mjs`). Ride: hands within 3 cm of the grips and feet within 3 cm of the pegs (`check-moto.mjs`, `check-tiak-moto.mjs`). Lie, SitFloor, Kneel: no penetration of the surface over 1 cm. Gestures: `check-gestures.mjs` passes, hand-to-mouth gap ≤ 2 cm.
5. **Arena unchanged.** The v4 `Wrestler` is used in every làmb scene; the swap at the door shows no pop; `check-duel-guard.mjs`, `check-lamb.mjs`, `check-lamb2.mjs`, `check-arena-fighter.mjs` are unchanged.
6. **Performance.** `check-perf-evening.mjs` budgets hold (≤ 180 draw calls on low, JS update ≤ 4 ms); the Meshy body adds at most one draw call; its download is only fetched when chosen; `check-phone.mjs` and `check-mobile-controls.mjs` pass on the phone preset.
7. **Saves and multiplayer.** No schema bump and no new key; `check-save-compat.mjs` and `tests/saveKeys.test.ts` pass; a save from the baseline loads unchanged and a choice persists; no change to `protocol.ts` or `server/`; `check:online` and `check-multiplayer.mjs` pass; remote peers see the v4 fallback.
8. **Visuals** (the reception criteria of `docs/ART_DIRECTION.md`). Portrait captures at conversation distance, day, night and interior light: face readable, hands and feet grounded, no holes or major deformation walking and sitting; captures attached to the PR.
9. **Isolation.** Branch from `6789c6e`; PR #42 closed or left unmerged; the diff touches no Red Team file and changes `main.ts` and `save.ts` only by the single call and counter described above; every step reverts alone.

## 9. Decisions needed from you

1. Confirm the target: branch `feature/meshy-hero-bodies-20261018` from `6789c6e`, and that PR #42 is abandoned (close it, or leave it open as a draft).
2. Where to keep a durable copy of the raw sources (about 204 MB): a Drive folder, an archive branch with Git LFS, or rely on the Meshy account. Nothing was uploaded or pushed.
3. Confirm the Meshy plan name and its licence terms (I cannot read them from here).
4. Scope: Meshy bodies for the player only, or for a few named cast members too.
5. Whether to allow phase 1 (a Meshy wrestler body) at all, given the existing v4 `Wrestler` works for làmb.
