# The Roi des Arènes wrestlers in Dakar Rek (wrestling stage 6, first fighter)

Work package W1, 14 Nov 2026, branch `wp/wrestling-rda` from `wp/wrestling`. Source: the owner's « Roi des Arènes » (RDA) prototype,
`origin/lab/roi-des-arenes-threejs` @ 809a9817, `experiments/roi-des-arenes/` (its `INTEGRATION_HANDOFF.md`, `README.md`,
`ASSET_PROVENANCE.md`, `RECONCILIATION.md`, `src/*`). We follow its own instruction: its included assets are used as they are (the
accessories are its own generator's geometry, not a rebuild from a description); Dakar keeps its combat, identity, appearance choices,
money, progression, save and presence. Cultural status of every representation here: **unverified** (RDA's, kept): no claim of
authenticity, original generic forms, a named Senegalese adviser before any prominent use. Licence status of RDA's elements:
**research-supported** (its reviewed records; not legal advice). Rows in `docs/ASSET_REGISTER.md`.

## 1. What it does

Behind `?rdabody` (or the dev setting `localStorage['dakarrek.rdabody'] = '1'`), every wrestler of a bout is an RDA body on Dakar's own
rig: the opponent and the player's wrestler in the duel, the écurie lesson and drills, on the fighter's path the bout in the ring and
the opponent's walk-out on the player's gala night (the player walks the tunnel in their own body, as today), the evening's entrance
ceremony, its preliminaries and its watched main event, and the fête that carries the winner. Every clip (Stance,
Grab, Fall_Back, Prep, Celebrate, Dance_A/B, Entrance_Walk), the `StrikeRig` aims, the computed gait, the fête's carry and the referee
scenes run unchanged: they address the same 20 bones.

- **Two physiques**, one file: RDA's AthleticStudy and HeavyStudy morphs. Heavy for the heavy style (« costaud »: Gora, Babacar the
  écurie partner, Daouda, Pathé), athletic for the others (`buildOf`, `src/actors/rdaFlag.ts`; the bill's roster ids at the arena).
- **The face**: RDA's CC0 skin atlas (cropped to the head), eyes, brows and lashes with `face-atlas.json`'s seams.
- **The ngemb** in the look's colours and pattern (cut A, or B for « Bordure »), cut from the RDA body's own surface. Every wrestler
  wears the look Dakar already gives him, exactly as on v4: his écurie's colours and his level's pieces at the entrance, the
  preliminaries and the watched bout (`rosterLook`); in the player's duel the style's plain colour, as today (giving the duel's opponent
  his card look is stage 2, « Qui est qui »).
- **Accessory pieces, off by default** (owner decision): `?rdaparts=arms` puts on the arm and waist sets (one switch; they then stand
  for the look's arm and waist placeholders), `?rdaparts=chest` the chest X without a neck loop (its own switch); `arms,chest` both.
- **v4 stays**: the default, the Low quality's body (unless `?rdabody=force`, for measurements), and the fallback whenever the file is
  missing, corrupt, not yet loaded or fails validation (`validRdaScene`). The game never waits on the file.

## 2. The rig: how RDA's 31 joints come onto Dakar's 20 bones

Offline, the way the Meshy bodies came in (`scripts/meshy/transplant-to-v4-rig.mjs`, `docs/meshy/PROOF_REPORT.md`):
`scripts/wrestlers/build-rda-wrestlers.mjs` writes `public/assets/wrestlers/rda_wrestlers.glb` (high) and `rda_wrestlers_m.glb`
(medium): `character_v4.glb`'s skeleton (20 bones, four sockets) and all its clips, its meshes replaced by RDA's, baked into v4's rest
pose and skinned to v4's bones. It checks every source file's SHA-256 against RDA's provenance records first, and is deterministic.

**Bone map** (MPFB `cmu_mb` → v4; weights merged, the four largest kept):

| v4 bone | RDA joints |
|---|---|
| `hips` | Hips, LHipJoint, RHipJoint, LowerBack (below v4's spine joint) |
| `spine` | Spine, LowerBack (above v4's spine joint; blended between 1.07 and 1.17 m) |
| `chest` | Spine1 |
| `neck` / `head` | Neck, Neck1 / Head |
| `shoulder.L/R` | LeftShoulder / RightShoulder |
| `upper_arm.L/R`, `forearm.L/R` | LeftArm, LeftForeArm (and Right…) |
| `hand.L/R` | LeftHand, LeftFingerBase, LeftHandFinger1, LThumb (and Right…, RThumb): v4 has no finger bones |
| `thigh`, `shin`, `foot` (L/R) | LeftUpLeg, LeftLeg, LeftFoot + LeftToeBase (and Right…) |
| `root` | (none: it carries no skin, as in v4) |

**How the mesh is posed and fitted** (numbers from `docs/wrestling/rda/build-report.json`):

- **Scale**: uniform ×0.9848 so RDA's straightened leg reaches v4's hip height (0.95 m). The RDA body is then 1.79 m tall at the rig's
  scale, **1.94 m in a bout** (the wrestler's ×1.08), hips at 1.03 m — v4's wrestler is 2.09 m, most of the difference his large head.
- **Legs, hips, trunk, neck, head: v4's joints exactly.** The gait's two-bone IK (`src/actors/gait.ts` `RIG`) is built on v4's legs, so
  RDA's legs are fitted to them: the thigh stretched ×1.055 and the shin ×0.953 (RDA's knee sits a little lower), the anatomical ankle
  height kept; the feet rigid, flat, turned 6.4° in to point ahead. The trunk is warped vertically so RDA's hips and neck land on v4's
  (×1.046 between them; the head rigid above, lifted 3.4 cm). The planted sole lands on the gait's ground (unit test).
- **Arms: RDA's own lengths on v4's rest directions.** v4's upper arm is a cartoon's (0.306 m); RDA's is 0.256 m, its forearm 0.285 m.
  Stretching RDA's arm onto v4's joints would lengthen the biceps by 20 % and lift the shoulder 6 cm off the trunk; instead this body's
  own copy of the skeleton has its shoulder, elbow and wrist where RDA's are (the Meshy homme's `--joint-fit` precedent): the
  `upper_arm`, `forearm` and `hand` translations and the inverse bind matrices are rewritten, and so are those three bones' rest
  translations in the clips (clips turn bones, they never move them; `stripStaticTracks` then drops them). Every rest **rotation** is
  v4's, so every clip, aim and gait swing turns the arm exactly as on v4. The arm placeholder socket sits where RDA's band is (70 % down
  the upper arm), the waist socket at RDA's belt, the neck socket mid-neck.
- **Hands**: turned about the forearm so the palm faces the thigh with the thumb ahead (7.5°, half of it on the forearm), as the game's
  pose solvers expect (`restPalms`).
- **Face atlas** first: RDA's `face-atlas.json` splits the body's UV seams (6 322 → 6 965 vertices, every attribute and morph copied).
- **Generated pieces fit as on RDA**: RDA's own generators (`scripts/wrestlers/rda-accessories.mjs` and `rda-finish.mjs`, its
  `accessories.ts` and `character-finish.ts` with the types stripped, logic unchanged) and our ngemb cut (`rda-ngemb.mjs`, RDA's
  study-shorts method) run on the RDA body in RDA's own space, on each physique as morphed, with RDA's own fitting constants; their
  vertices carry the body's skin weights, so the same transplant carries them onto v4's rig: they fit the transplanted body exactly as
  they fitted RDA's. Pouches stay rigid on their bone (no stretch).

**Runtime** (`src/actors/rdaLook.ts`, `rdaFlag.ts`, a few lines in `humanoid.ts`): a body id `rda` (`BODY_FIT` row), `new Wrestler()`
picks it when it is loaded, `Wrestler.setBuild()` switches the physique (morph weights; the accessory pieces of that physique),
`Wrestler.setRdaParts()` the pieces. Materials in Dakar's conventions: Lambert in the wrestler's own skin colour (`setSkin`: the same
`Color` object) times RDA's per-vertex shading; on the head only, the photographic atlas adds its detail normalised to its own mean colour
(the wrestler keeps his skin tone); Phong eyes, alpha-tested brows and lashes (RDA hides the lower lash cards: dropped at build), the
humanoid's hair material. `src/main.ts` loads the file for the quality in the background (`loadRdaBodies`) and gives the duel's opponent
his physique; `src/arena/entrance.ts`, `module.ts` (preliminaries, the watched bout) give theirs. **Not touched**: `src/lamb/duel.ts`,
`strikeRig.ts`, `audio.ts`, `fx.ts` (« Le choc », the other package), the rules, the career, saves, the protocol.

## 3. Measured

Exact numbers from the files (`scripts/wrestlers/build-rda-wrestlers.mjs` report, the GLB accessors), per wrestler drawn:

| | v4 wrestler (today) | RDA wrestler | + arm/waist pieces | + chest X |
|---|---|---|---|---|
| Triangles (ngemb A / B) | 4 212 / 4 292 (body 1 908, head 1 980, ngemb 48 / 128, hair 276) | 14 776 / 14 988 (body 12 560, eyes 172, brows 192, lashes 192, hair 736, ngemb 924 / 1 136) | + 5 704 | + 5 600 |
| Draw calls (colour pass) | 8 (body, five head parts, ngemb, hair) | 6 (body, eyes, brows, lashes, hair, ngemb) | + 3 | + 1 |
| Draw calls (shadow pass, Medium/High) | 8 | 3 (the face details cast none) | + 3 | + 1 |

Shared by every RDA wrestler, loaded once (in the background, never waited on):

| | High (`rda_wrestlers.glb`) | Medium and forced Low (`rda_wrestlers_m.glb`) | v4 (`character_v4.glb`, all humanoids) |
|---|---|---|---|
| File | 2.25 MB | 2.17 MB | 0.62 MB |
| Geometry on the GPU | 1.47 MB vertex data + 0.58 MB morph texture (two physiques) | same | 0.32 + 0.18 MB |
| Textures, decoded (RGBA8; ×1.33 with mipmaps) | 4.1 MB (5.4 MB): face 512×1230, eyes 512², brows and lashes 256² | 1.0 MB (1.4 MB): face 256×615, eyes 256², brows and lashes 128² | — (the ngemb canvas 64², shared) |
| Load and set-up, local server (parse, clips, pose solvers) | 268 ms | 177–273 ms | — |

Of the 2.2 MB, the accessory pieces of both physiques are 0.87 MB (a separate file loaded only when their switch is on would save it:
§6). It is fetched in the background as the game starts (when the switch is on): 2.2 MB more per session over a phone's network
(a later version could fetch it only on the way to the arena or the écurie).

In the game (`scripts/perf-rda.mjs`, phone viewport 390×844, `docs/wrestling/rda/perf-rda.json`): the player's bout avec frappe at
the arena (two wrestlers, the referee, the duel's crowd) and the evening's entrance (two wrestlers walking out, the evening's stands).
Headless SwiftShader renders on the CPU of a shared machine: its frame rates only compare the two bodies on this machine, and say
**nothing** about a phone; the entrance's numbers move with the crowd's state at the moment of the sample.

| Quality | Bout: triangles v4 → RDA | Bout: draw calls | Entrance: triangles | Entrance: draw calls | Bout fps (SwiftShader) |
|---|---|---|---|---|---|
| Low (`?rdabody=force`) | 176.8k → 197.7k (+12 %) | 132 → 125 | 183.8k → 218.7k | 123 → 143 | 6.5 → 5.1 |
| Medium | 239.9k → 267.6k (+12 %) | 182 → 185 | 214.0k → 273.5k | 79 → 127 | 1.6 → 1.3 |
| High | 268.8k → 285.4k (+6 %) | 204 → 194 | 223.1k → 244.3k | 80 → 75 | 2.5 → 2.1 |

**Proposal**: Medium and High draw the RDA bodies **without** the accessory pieces (+~10.6k triangles per wrestler, fewer draw calls
than v4, 1.4 MB of textures on Medium); Low keeps v4 (the file and the extra triangles are what a low-end phone can least afford); the
pieces, if the owner wants them, on High first. All of it after a frame-rate pass on a real mid-range Android and an iPhone, in a bout
and at the entrance, which this machine cannot give.

## 4. Checks

Headless Chromium with SwiftShader, one browser at a time under `flock /tmp/dakar-browser.lock`, on a machine shared with other agents;
the build of this branch served by `vite preview`. `RDABODY=1` loads the games with `?rdabody=force` (the RDA bodies at every quality, so
the checks' phone runs at Low draw them too) and waits for the file; the outputs go to `<outDir>-rda`.

| Check | W0 baseline (794c0ac9) | Without the flag (this branch) | With the RDA bodies |
|---|---|---|---|
| `npx tsc --noEmit` | — | clean | — |
| `tests/rdaWrestler.test.ts` (new) | — | **15 / 15** | — |
| Wrestling unit stack (37 files) + body tests (`humanoid`, `gait`, `wrestlerRate`, `humanoid-animation`, `cabinFit`) | 37 files / 392 | 37 / 392 (+ 15 new) · 6 files / 60 | — |
| `check-rda-fighter` (new) | — | (its v4 half: 3 / 3) | **16 / 16** |
| `check-lamb2` | 53 / 53 | **53 / 53** | 43 / 51 at the default time budget; **53 / 53** with `LAMB_SLOW=8` |
| `check-lamb` | 24 / 24 | **24 / 24** | **24 / 24** (`LAMB_SLOW=8`) |
| `check-arena-fighter` | 40 / 44 | **40 / 44** (the same four) | **40 / 44**, the same four failures as the baseline |
| `check-arena-fighter` `LAMB2=1` | 44 / 48 | **44 / 48** (the same four) | **44 / 48** (the same four) |

- `check-lamb2` with the RDA bodies at the default budget: one sequence of the desktop bout failed and the next seven checks of the
  same bout followed it. This first reading (a time budget) was wrong: see « With Le choc » below — the guard step was a coin toss on
  every build (about one run in five), now made deterministic.
- Without the flag every check gives the baseline's count (the RDA code is not reached: no file is fetched, `new Wrestler()` makes the
  v4 body, `setBuild` does nothing on it).
- `check-arena-fighter`'s four failures are the baseline's, with and without the RDA bodies, both disciplines (the gala night's « préliminaires d'abord » and « Prêt » toasts, which W0
  traced to a check out of step with the 1.0.1 HUD; « Le choc » owns that fix).
- `check-rda-fighter` (`scripts/check-rda-fighter.mjs`, phone 390×844, touch, Medium, deviceScaleFactor 2; results in
  `docs/wrestling/rda/check-rda-fighter.json`): the medium file loads and validates (177–273 ms locally); the entrance's two wrestlers,
  the watched gala bout's two and the player's bout avec frappe draw RDA bodies, the player athletic and Gora heavy, face maps on; with
  the pieces on, the **12 pouches** (six per physique) stay on their bones over **266 sampled frames** through the entrance, the watched
  bout, the fête (the winner carried) and the player's bout (**drift 0 mm**); every body's skinned box under 2.37 m and every sampled
  vertex within 1.47 m of its hips (no detached or exploded vertex); a **missing** and a **corrupt** file each give the v4 wrestlers and
  the bout as always, no page error; v4's run (no flag) loads nothing and its bout runs as before.
- Phone captures, today's v4 (left) and the RDA bodies (right), at the moments of W0's « before » set: `docs/wrestling/rda/1-entrance.jpg`,
  `2-standing.jpg`, `3-clinch.jpg`, `4-throw.jpg`, `5-fall.jpg`, `6-result.jpg` (the pieces switched on for the captures). Review
  images: `bodies-v4-athletic-heavy.jpg` (v4, athletic, heavy with the pieces; front and back), `bodies-clips.jpg` (Stance, Celebrate),
  `face.jpg` (the game's light, `proof/rda/viewer.html`).

### With « Le choc » (`wp/wrestling` @ f17f293f, fixed in 30be5b95 and bc7b0d31)

On the combined branch `check-lamb2` with the RDA bodies gave 48 / 57: the desktop guard step and the seven checks of its bout, and the
844×390 close-up's `headGap 11` (≥ 12 wanted).

- **The guard step was a coin toss, on every build.** It waited for Gora to strike a raised guard; free, he grabs it about as often
  (`decide` in `src/lamb/stand.ts`: a guard stops strikes, not a grab), and after a grab the player's break can fail and he throws.
  Replayed headless on the real duel (300 seeds each; headless means no body at all), the old step met no strike in **15.7 %** of runs
  at the 0.1 s frame step of a slow renderer and **19.7 %** at 1/60 s, **identical with « Le choc »'s effects forced on**; Gora struck
  before grabbing in 48–52 % of his choices. Not the bodies, not the frame time, not « Le choc »: chance. The step now holds him
  (`duelHold`, as « Le choc »'s steps do: no decision, no grab of his), the player raises the guard and steps into reach, and he throws
  his big strike (`duelAiStrike`, a check-only control: the strike his AI starts, landing by the rules); the check still asks that the
  strike is guarded and counted, and now also that the last strike is his, guarded (`tests/lamb2Hold.test.ts`, eight seeds).
  Why this is the same test, not a weaker one: what the step checks is the player's guard against his strike, and that path is
  untouched. `duelAiStrike` calls `startStrike`, the very function his AI calls when it decides to strike (same endurance cost, same
  windup); the strike then lands through the bout's own `strikeLands` → `land` (`src/lamb/stand.ts`), which reads the player's guard
  as it is (held, not busy, not open, not staggering), takes the guard's endurance and balance cost and counts the guard, exactly as
  for a strike he chose. Only his *choice* of a strike over a grab is taken out of this step — that choice is the AI's (tested
  headless in `lamb2Styles` and `lamb2Balance`), not the guard's, and it is what made the step fail one run in five. The check is
  also stricter than before: it now asks that the last strike be his and guarded, not only that a guard was counted.
- **The close-up's heads were read before the camera arrived.** The head points were a fixed 1.8 m (no body involved) and the camera
  eases to its framing at 3/s; the check called it settled after two reads 250 ms apart with < 0.5 px of movement, which a slow
  software renderer can satisfy with one frame drawn twice. Measured: heads 208–209 px, short of the framing's 210.6. The check now
  reads them once still across three drawn frames (< 0.1 px). And, as asked, the framing and the head points now use the **top of the
  body drawn** (`Humanoid.headTop`: v4's wrestler 2.09 m — its hair — the RDA body 1.94 m, so it is not taller), so the whole head sits
  under the Prise for either body (on v4 the old 1.8 m point left the top 0.29 m of the head unaccounted for); the four phone screens
  keep the feet over the controls (`tests/duelFx.test.ts`).
- **Frame time** in the player's bout (standing, the opponent held), phone 390×844, SwiftShader (median of the game's frame interval;
  the game's own JS: update + render submit; one render forced to completion with the game paused):

  | Build | Medium: frame / JS / forced render | High: frame / JS / forced render | Triangles (Medium) |
  |---|---|---|---|
  | v4 alone (17fa9811) | 283 / 3 + 14 / 300 ms | 317 / 3 + 14 / 332 ms | 249k |
  | RDA alone (94a86de1) | 317 / 3 + 14 / 297 ms | 350 / 3 + 15 / 358 ms | 263k |
  | « Le choc » alone (c9be8f58) | 267 / 3 + 13 / 287 ms | 317 / 3 + 13 / 345 ms | 238k |
  | Combined (f17f293f), RDA | 300 / 3 + 12 / 331 ms | 350 / 3 + 16 / 373 ms | 264k |
  | Combined, v4 | 283 / 3 + 13 / 305 ms | — | 243k |

  The RDA bodies cost 6–12 % more frame time here and « Le choc » nothing measurable; the game's own CPU work (update 3 ms, submit
  12–16 ms) is the same in every build: the rest is SwiftShader rasterising and vertex-shading on the CPU. On a phone that part runs on
  the GPU, where two 7k-vertex skinned bodies are a small share; it is not a reason to expect a 5× slowdown on a phone (a device pass
  is still owed: decision 1). The 45-minute RDA run was the failing steps waiting out their budgets at `LAMB_SLOW=8`; with the fix the
  same run takes 6 minutes.

- **The detached-vertex check of `check-rda-fighter`** gave 15 / 16 on the fix's first run: a body measured 2.50 m across (bound 2.4)
  with a 1.52 m reach and no pouch drift. The 2.4 m was a guess below a real pose (a 1.94 m body lying with its arms overhead spans
  about 2.5 m). It is now judged by what skinning guarantees: every vertex the skin carries on one bone alone keeps its rest
  distance to that bone within 5 mm (exact under linear blend skinning; tested on the GLB under a stride and a strike), with
  anatomical bounds beside it (reach from the hips < 1.7 m, size < 2.6 m). A detached vertex now shows from 5 mm, not 40 cm.
- **Counts on the combined branch**, before (f17f293f) → after (the fix): `check-lamb2` without the RDA bodies 58 / 58 → 58 / 58; with
  them (`LAMB_SLOW=8`) 48 / 57 → 58 / 58, and 58 / 58 at the default budget too (6 minutes instead of 45); `check-lamb` 27 / 27 →
  27 / 27; `check-rda-fighter` 16 / 16 → 15 / 16 at 30be5b95 (the 2.4 m bound) → **16 / 16** (one-bone drift 0 mm over 1 349 vertices and 186 frames, reach 1.52 m, size 2.50 m); wrestling unit stack 39 files / 424 → 39 / 434 (+ the body tests, 5 files / 46).

## 5. Decisions for the owner

| # | Decision | Options | Recommendation |
|---|---|---|---|
| 1 | When the RDA bodies become the wrestlers | (a) keep them behind `?rdabody`; (b) the default on Medium and High, v4 on Low and as the fallback; (c) every quality | (b), after a frame-rate pass on a real mid-range Android and an iPhone in a bout and at the evening's entrance (headless says nothing about it) |
| 2 | The accessory pieces | (a) never; (b) an option in « Tenue de lutte » for the player only; (c) worn by the roster's wrestlers whose look has pieces (level 3 up, as the placeholders today); (d) every RDA wrestler | Arm and waist sets: (c), replacing today's grey placeholder cylinders, once seen in game. The chest X: an option only (b), unrewarded, never on posters or as a default look, after a Senegalese adviser has reviewed it (RDA's WEB-008 review is also pending) |
| 3 | A woman player's wrestler | (a) as today: every player, a woman included, is drawn as the male wrestler (now the athletic RDA body) with a fixed skin; (b) the same body in the player's own skin tone (`Appearance.skin`); (c) her own Meshy « femme » body in a sports top and ngemb, transplanted the same way; (d) a female physique from RDA's MakeHuman source (not delivered: needs RDA's source and its own review) | (b) now for every player (no save field: the appearance exists), and (c) or (d) decided with the art direction; today's behaviour is kept until then |
| 4 | Who is heavy | heavy for « costaud » only (now); also by level or weight class; or a choice in « Tenue de lutte » for the player (a save field) | as now; the player's build chosen by the owner with stage 2 |
| 5 | Licence records | RDA's status is « research-supported » (its own review of CC0 headers and hashes, not legal advice) | a legal look at the MakeHuman CC0 / MPFB export records before the bodies ship by default |

## 6. What remains

- **A phone frame-rate pass** (a mid-range Android, an iPhone) in a bout and at the entrance, with and without the pieces: the condition
  for decision 1. Headless SwiftShader says nothing about it.
- **Hands**: v4 has no finger bones; RDA's hands are open and relaxed, they do not close on a grip (the Meshy bodies have a `grip`
  morph; RDA's would need one: a second hand shape baked from its finger joints, as `scripts/meshy/grip-morph.mjs` does).
- **Contact**: the bodies are bigger and anatomically shaped, so in the empoignade (1.1 m apart today, « Le choc » brings 0.72 m) arms
  and chests can pass through each other: paired poses at chest distance (plan stage 1–2) should be checked on these bodies.
- **Far wrestlers**: at the arena the watched bout is seen from 10–25 m; a far level of detail (v4, or a decimated RDA body, as
  `scripts/meshy/simplify-body.mjs` makes for Meshy) would save most of the extra triangles there.
- **The pieces' file**: 0.87 MB of the 2.2 MB are the accessory pieces of both physiques; while they are off by default they could live
  in a second file loaded with their switch.
- **The hair** is RDA's generated short-hair shell, here in the humanoid's plain dark hair material: it reads as a cap in a close shot
  (`docs/wrestling/rda/face.jpg`). The CC0 atlas carries a photographic short-hair scalp under it, which could replace the shell (an
  art-direction choice).
- **The face** is RDA's single study face for every wrestler (different skin tones, physiques and hair cut; the same features):
  variety needs more faces, which RDA does not have yet (MakeHuman CC0 targets could give them, with their own review).
- **Not done here** (other stages): the player's own skin tone or body in bouts (owner decision 3, stage 2), the duel opponent's card
  look (stage 2), the stance gait, a woman wrestler, RDA's locomotion or contact code (not used: Dakar's gait
  and duel stay the owners of motion and contact, as RDA's reconciliation asks).
