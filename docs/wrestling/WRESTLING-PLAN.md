# Làmb in Dakar Rek: what we have, what « Roi des Arènes » brings, and a staged plan for a great wrestling experience

Work package W0, 14 Nov 2026, branch `wp/wrestling` from `release-1.0.1` (794c0ac9). Documentation only: no game code
changed. The owner asked: « before adapting, understand what it is and how it can be added without losing anything,
make it better go wild we want a good wrestling experience for the game ».

Sources read: `src/lamb/*`, `src/arena/*`, `src/career/*`, the duel's wiring in `src/main.ts`, the shared humanoid and
its gait (`src/actors/humanoid.ts`, `gait.ts`, `gaitRig.ts`), the Grand Camp server (`server/camp.ts`,
`src/multiplayer/camp*.ts`), `docs/LAMB_RULES.md`, `docs/LAMB2.md`, `docs/CAREER.md`, `docs/ARENA_VISIT.md`,
`docs/SPEC_SIGNATURE_2026-10-10.md` §7–21, `docs/ORDINARY-PURSES.md`, the Roi des Arènes handoff (14 Nov) and the
README on `origin/lab/roi-des-arenes-threejs`. Played: the baseline checks and a phone capture of real bouts (§1).

## 0. In one page

**What we have is much more than a mini-game.** A whole fight evening exists end to end (arrival by moto or car rapide,
tickets in three tiers, the stands filling, preliminaries, an entrance ceremony with bàkk, griots and drums, the bout,
the fête, the crowd going home), a career with a city ladder of twelve wrestlers, purses, gala places and a belt, and two
disciplines: **« sans frappe »**, the live default, and **Làmb 2.0 « avec frappe »** behind `?lamb2`, a real wrestling
system (distance, strikes that open, grip advantage, push/pull/pivot, slip, throw, counter, the fall, six styles, a
lesson and played drills).

**What is weak is the bout itself, on a phone, in the hand.** The default bout is a grab and 2.6 s of tapping, over in
4–7 s for a decent player; one held « Garde » key draws a ranked bout to a paid 90 s time-out (100 % of the measured bouts at levels 1, 3 and 5). The deep Làmb 2.0
bout is hidden behind a flag and reads as text: small bodies far away, a rule line « Tirer bat Pousser · Pivoter bat
Tirer · Pousser bat Pivoter » under a bar, tells shown by a lean of the upper body on a figure 106 px tall, partly under the HUD. Nothing hits: no hit-stop, no camera
jolt, no vibration, no thud of a body on the sand; the two wrestlers hold each other from more than an arm's length.
The player's own body is replaced by a generic wrestler (a woman player fights as a man), and the opponent changes clothes between
his entrance and the bout (Ousmane walks in in Baobab's green and fights in indigo).

**Roi des Arènes (RDA) brings fighter presentation, not a combat engine.** Its two anatomical physiques and face pass
are what our wrestlers lack most; they can come in **as new body ids on our own 20-bone rig** (the Meshy transplant
pipeline already does this for the player's bodies), with the current body as the fallback, so every rule, clip, check
and screen keeps working. Its planted-feet locomotion duplicates our own gait (we lack only a crouched fighting-stance
gait, which we can build). Its contact practice gives a number (0.72 m) and a feel target, not mechanics. Its WEB-008
chest X can be rebuilt from its description as an original optional cosmetic. **Its code and files are on the owner's
computer**: the physiques and face need the owner to push `experiments/roi-des-arenes` (or hand over the GLBs and their
licence records).

**The plan, in eight stages after a few fixes, each playable and checked on its own** (impact for the player / cost):

| # | Stage | What the player feels | Impact | Cost | Owner decision |
|---|---|---|---|---|---|
| 0 | **Les petites réparations** | What the baseline found broken on a phone: the tunnel camera behind the sign, the streak chip over the duel, a stale hint, a wrapped card, the Prise over the heads | medium | very low | none |
| 1 | **Le choc** | Hits land: hit-stop, camera jolt and close-up in the clinch, bodies in contact, sand thud, phone buzz, the slow fall in both disciplines | high | low | none |
| 2 | **Qui est qui** | The opponent in his own colours and build, the player's own skin, wrestlers that circle without gliding, the clinch tells readable at a glance | high | low–medium | the woman player's wrestler; the chest X (optional) |
| 3 | **Le spectacle** | A replay of the fall, short commentary in French with a little Wolof, the referee and the crowd in every bout, drums that follow the bout | high | medium | none (text only); recorded voices later |
| 4 | **La lutte simple** | The default « sans frappe » gets Làmb 2.0's clinch (push, pull, pivot, slip, throw, counter) and a referee who presses passive wrestlers | high | medium | yes: changes the default rules (and the staller draw) |
| 5 | **Lire et être lu** | Opponents who learn your habits, a signature move per wrestler, a real revenge bout against your rival, sparring | medium–high | medium | none |
| 6 | **Les corps de Roi des Arènes** | Big, believable wrestlers (two physiques, faces) | high | medium (with RDA files) | yes: the files and their licences; the phone budget |
| 7 | **La bascule et le titre** | Làmb 2.0 becomes the evening's làmb; the belt and the « Roi des Arènes » moment get their own staging | high | low–medium | yes: when to flip (LAMB2.md option (b)) |
| 8 | **Le défi** | Challenge a player met in the street to a friendly bout, server-refereed, friends watching | very high | high | yes: a new server object; staked bouts |

**The first stage, recommended now: « Le choc »** (§5): presentation only, in `src/lamb/duel.ts` and
`src/lamb/audio.ts`, both disciplines, the player's own bout only (watched bouts and headless tests unchanged), no new
button, no rule touched. It is the change a player notices in the first second of every bout.

**Decisions needed from the owner** (§6): when Làmb 2.0 becomes the default; whether « sans frappe » gets the deep
clinch (and what the held-guard draw pays); how a woman player's character wrestles; the RDA files and their licence
records; whether the chest X ships as an option before an adviser has seen it; a new server object for player-vs-player
bouts, and whether any are staked.

## 1. Baseline: the checks as they are, and a bout played on a phone

`release-1.0.1` at 794c0ac9, built with `npx vite build`, served by `vite preview` on 127.0.0.1, Chromium 1194 with
SwiftShader (a software renderer: these runs say nothing about a phone's frame rate), one browser at a time under
`flock /tmp/dakar-browser.lock`, 14 Nov 2026, on a machine shared with other agents.

**Unit tests** of the wrestling stack (`npx vitest run` on the 37 files `lamb*`, `career`, `roster`, `boutCardLayout`,
`arena*`, `celebration`, `ceremony`, `frappeMoments`, `myGala`, `supporters`, `tickets`, `undercard`, `watchedBout`,
`campMatch`, `campRules`, `campProtocol`): **37 files, 392 tests passed**, 56 s.

**Browser checks**, each run once (PASS / FAIL lines as the script prints them):

| Check | Result | Time | Notes |
|---|---|---|---|
| `check-lamb` | **24 / 24** | 761 s | the default bout: lesson, friendly, response window, break, abandon, ranked, phone portrait and landscape |
| `check-lamb2` | **53 / 53** | 678 s | Làmb 2.0 on desktop and phone: strikes, stagger, clinch, slip, break, throw, fall, lesson, a drill, gauges on four phone sizes |
| `check-arena-fighter` | **40 / 44** | 591 s | 4 FAIL, the same two on desktop and phone, both on the player's gala night: « their corner is held while the preliminaries run (told so) » and « Je suis prêt: the preliminary under way fought to its end, then their entrance ». In the output the show does what the docs say (timeline `filling → prelims → prelim 1 → prelim 1 result → entrance`, only the opponent walks out); what the check does not find are the toasts « Les préliminaires d’abord… » and « Prêt : … ». The corner's words show on screen as the goal line instead (`entrance-2-corner`). Likely a check out of step with the 1.0.1 HUD; to confirm (stage 0) |
| `check-arena-fighter` `LAMB2=1` | **44 / 48** | 1 157 s | the same 4 FAIL; the bout avec frappe and its announced knockdown pass |
| `check-career`, `check-duel-guard`, `check-arena-visit` (with and without `LAMB2=1`), `check-arena-people`, `-interior`, `-exterior`, `-arrival`, `-hype`, `-outflow`, `-lanes-drive`, `check-gestures`, `check-trial` | running when this table was first committed | | results in the following commit |

**Screenshots** (`docs/wrestling/baseline/`, phone 390 × 844, touch, low quality). The bouts were played through the
game's own `?debug` hooks, as `check-lamb2` does (`duelStart`, `duelGrab`, `duelStrike`, `duelMove`; for the throw, the
opponent held still and set off balance with `duelHold`/`duelSet`); the fighter's path is `check-arena-fighter`'s own
phone run.

| Moment | Sans frappe (the default) | Avec frappe (`?lamb2`) |
|---|---|---|
| Entrance | `entrance-1-tunnel` (the tunnel: the camera behind the sign), `entrance-2-corner` (the corner on a gala night), `entrance-3-referee` (« Arbitre : prêts ? » at the ring) | the same path; in its bout `af-2-knockdown-announced` (`check-arena-fighter` with `LAMB2=1`: « Gora vacille ! Il n’est pas tombé ») |
| Standing | `sf-1-standing` | `af-1-standing`, `af-3-strike-landed` |
| Clinch | `sf-2-clinch` | `af-4-clinch` |
| Throw | (automatic at the end of the empoignade) | `af-5-throw-attempt` |
| Fall | `sf-3-fall` | `af-6-fall-slow`, `af-7-referee-arm` |
| Result | `sf-5-result` (« Durée : 4 s »), `entrance-4-after-bout-card` | (the same recap, with strikes and staggers) |

Numbers read during those bouts (`duelScreen`, `duelInfo`): each wrestler is 73 px tall at the bell (8.7 % of the
screen's height), 106 px in the empoignade, 183 px in the slow fall's close shot; in the empoignade the two centres are
1.11 m (sans frappe) and 1.13 m (avec frappe) apart.

## 2. What exists

### 2.1 The systems

| Layer | Files | What it does |
|---|---|---|
| Rules (pure, tested) | `src/lamb/rules.ts` (255 lines), `stand.ts` (292), `clinch.ts` (314), `opponents.ts` (127) | Two disciplines (`RULES.sans_frappe`, `RULES.avec_frappe`), stamina/balance/composure, strikes, grip entry, clinch moves and exchanges, throw and counter scores, six styles, AI by level, referee decision, records (`lamb_*`, `lamb_af_*`), rewards without money |
| The bout | `src/lamb/duel.ts` (1 486) | `LambDuel`: one class for the player's bout, the écurie lesson and drills (`lesson.ts`, `drills.ts`), and AI-vs-AI watched bouts (`spectate`, `autopilot`, seeded `rand`, fixed steps); its HUD (DOM), its referee and a small crowd of its own, its side camera |
| Presentation | `src/lamb/strikeRig.ts` (100), `audio.ts` (118), `poses.ts`, `look.ts` | Upper-body aims on the 20-bone rig (guard, strikes, recoil, push/pull/pivot, slip, stagger); synthesized hit/slap/swish, crowd one-shots, drums; ngemb colours and four placeholder accessory sockets |
| The body | `src/actors/humanoid.ts` (`Wrestler`), `public/assets/character_v4.glb` | The shared low-poly v4 humanoid in ngemb; clips Stance, Grab, Fall_Back, Prep, Celebrate, Dance_A/B, Entrance_Walk; the computed planted-feet gait for Idle/Walk/Run only |
| The arena evening | `src/arena/module.ts` (986) and 32 other files: `program`, `bout`, `undercard`, `ceremony`, `entrance`, `bakk`, `celebration`, `party`, `people`, `crowd`, `supporters`, `tickets`, `exterior`, `arrival`, `posters`, `soundscape`, `soundBank`, `frappeMoments`, `myGala`, `fighter`, `together`, `tonight`, `eveningCall`… | The fight night end to end, the watched bout (seeded, same for friends), the fighter's path (tunnel → corner → ring → duel → tunnel), the player's own gala night, the fête, authored sabar loops and crowd beds |
| Career | `src/career/career.ts`, `module.ts`, `roster.ts`, `progress.ts`, `world.ts`, `portrait.ts` | Four dimensions (Forme, Richesse, Réputation, Influence), the ladder to « Roi des Arènes », purses (1.0.1 economy, `docs/ORDINARY-PURSES.md`), the city's twelve wrestlers and their season, gala places, the belt, the after-bout card, fight talk |
| Online | `src/arena/together.ts`, presence (`src/multiplayer/protocol.ts`), Grand Camp (`server/camp.ts`, `src/multiplayer/camp*.ts`) | Friends watch the same seeded gala bout; a player's own main event is shown to friends by presence (in the ring, in a stance, then the result). No player-vs-player bout. Grand Camp: one Durable Object per football match at 20 Hz, a fee ledger |

### 2.2 What a player can do today (the live default, without `?lamb2`)

- **Learn** at the écurie de Pikine: « Entraînement » with Coach Ablaye, five guided steps against Babacar (move,
  guard his slow grab, grab, tap in the empoignade, break free on the green window); `lamb_skill` +1. The three drills
  (Sac de frappe, Travail des saisies, Gainage) are 5-second progress bars that feed the career attributes.
- **Fight** at the arène de Pikine: « Combat amical » against Gora, Pape or Saliou (costaud, rapide, défensif), the
  level following the friendly record; « Combat classé » once trained (the career's ranked opponent); « Petit combat de
  quartier » / « Combat du soir » through the fighter's path; « Place au gala » (Friday–Sunday, from Adversaires
  réputés: the player is the main event, with preliminaries, a ceremony, « Faire ton bàkk », the fête); « Combat pour
  le titre » on Sundays from Contender.
- **The bout « sans frappe »**: joystick to move; **Garde** (held) blocks his grab and exposes him 0.9 s; **Saisir**
  grabs at once within 1.5 m (a guarded grab exposes the grabber); **Dégager** steps back, or in a losing empoignade
  breaks free on a 0.38 s green window. The empoignade lasts 2.6 s: whoever taps more (plus endurance) throws the other.
  90 s round, referee's decision on points (guards, grabs, breaks), abandon apart. Three phone buttons.
- **Watch**: buy a ticket, sit, follow preliminaries and the main event (sans frappe, AI vs AI), cheer, wear the écurie's
  colours, see the result on posters and hear it in the street; friends see the same bout.
- **Progress**: the record, the ladder, purses (5 000–14 000 F for an ordinary ranked bout by the opponent's level, a
  gala ×2 and a title ×3 the rung's purse), the after-bout card, the phone's « Arène » app (record, ladder, wrestler
  cards, follow one).

### 2.3 With `?lamb2` (Làmb 2.0, `docs/LAMB2.md`)

Everything above, plus: six « Avec frappe » friendlies (Gora, Pape, Saliou, Ousmane, Malick, Daouda), the fighter's path
and « Combat classé » avec frappe against the roster wrestler as himself, Coach Ablaye's seven-step lesson, the three
drills played (scored calls), the watched evening and the preliminaries avec frappe. Five phone buttons: Frappe,
Grosse frappe, Saisir, Garde, Reculer; in the empoignade they become Pousser, Tirer, Pivoter, Casser, Projeter (green
« Contrer » while he throws). Three gauges per wrestler (Endurance, Équilibre, Sang-froid) and the « Prise » bar; no
life bar. On a fall: 0.9 s at 0.3× with a low close camera, the referee walks up and raises the winner's arm, the
stands split, the announcer tells it in the gala. Records apart (`lamb_af_*`), same career points and purses.

### 2.4 What works well (keep it)

- **The evening around the bout** is the game's signature and it is rich: ceremony, griots, drums, fête, friends in the
  stands, posters and talk in the city. It does not need rebuilding; the bout needs to be worthy of it.
- **Làmb 2.0's design is right** (spec §7–12): no health bar, strikes that open rather than damage, a grip that slides,
  « I am losing this position » felt before the fall, the fall decided by position, not `power > defence`. The six
  styles really differ (tested pair by pair), the AI is tuned by level for a new player (`docs/LAMB2.md` « Équilibrage »).
- **Determinism and tests**: watched bouts are seeded and fixed-step (friends see one bout); 392 unit tests in the
  wrestling stack, headless pupils that play the real duel, browser checks for every path.
- **The data model is ready for more**: attributes from training, the roster with records, `onMoment` hooks, the
  `autopilot` that already plays the « player » side with the same buttons (the seed of a two-player bout).
- **Respect rules** are clear and kept: invented names, no rite staged, no accessory with power, Wolof from the lexicon
  with its gloss.

### 2.5 What feels weak (specific)

Measured on a phone viewport (390 × 844, touch, low quality) in the captures of §1, and read in the code.

| Topic | What we see |
|---|---|
| **The player's entrance** | On the fighter's path the player walks the tunnel themselves behind a marker, waits in the corner, walks out, and may do a two-beat bàkk. On a phone, **in the wrestlers' tunnel the follow camera sits behind the « ENTRÉE DES LUTTEURS » sign, which fills the screen** (`entrance-1-tunnel`), and walking back out the tunnel's roof cuts the screen in two (`entrance-4-after-bout-card`). The corner moment is good (people round them, `entrance-2-corner`). |
| **HUD in the bout** | The city's streak chip (🔥 « 1 j », `#streakChip`, newer than the duel's hide list in `duel.ts`) stays over the opponent's gauge, and the hint « Avant le cercle : « Faire ton bàkk »… » is still on screen when the referee says « prêts ? » (`entrance-3-referee`). After an abandon, the after-bout card's « Palmarès » column wraps one character per line on 390 px (« 0 / V / · / 0 / D », `entrance-4-after-bout-card`). |
| **Pacing (default)** | The « sans frappe » bout is one grab, 2.6 s of tapping, a fall. My phone bout's recap: « Durée : 4 s ». `docs/ORDINARY-PURSES.md` measured 4–7 s for a decent player against about 55 s of ritual on the fighter's path (tunnel, corner, walk-out): the bout is the shortest part of the fighter's evening. One held « Garde » key draws a ranked bout to a 90 s time-out paid at the draw factor, in 100 % of the measured bouts at levels 1, 3 and 5 (same doc). |
| **Controls** | Sans frappe: the empoignade is button mashing (« tape Saisir le plus vite possible ») and the stronger tapper throws automatically; the only choice is a break on a 0.38 s green window, and only when losing. Avec frappe: five buttons that change meaning in the clinch (Saisir → Pousser, Garde → Tirer, Frappe → Pivoter, Reculer → Casser, Grosse frappe → Projeter / Contrer) — learnable, and the lesson teaches it, but « Tirer » is the guard button pressed, not held. |
| **Camera** | One side camera, always from the gate side, 8.5 m + 1.1 × the gap away in portrait. At the bell each wrestler is **73 px tall on an 844 px screen (8.7 %)**, 106 px (12.6 %) in the empoignade; most of the screen is sand and stands. It never moves on an event: no jolt on a big hit, no closer framing in the clinch. The only close shot is avec frappe's 0.9 s slow fall (183 px). |
| **Readability** | Avec frappe, the tells are leans of the upper body on a 106 px figure, and **in portrait the « Prise » panel sits over the wrestlers' heads and shoulders** (the panel ends near y = 373, the heads are at y ≈ 358; `af-4-clinch`, `af-5-throw-attempt`) — the part that shows which move is coming. The rule « Tirer bat Pousser · Pivoter bat Tirer · Pousser bat Pivoter » is a permanent text line under the bar; six gauges, the Prise, a message and that line compete. `check-lamb` checks that the buttons never cover the fighters (`duelScreen`); `check-lamb2` checks the gauges and the Prise against the buttons and the joystick, not against the fighters. |
| **Contact** | In the empoignade the wrestlers stay where the grab found them: **1.11–1.13 m between centres** (RDA's contact separation: 0.72 m). Sans frappe, both stand with their arms up in the air (`sf-2-clinch`); nobody holds a back, a shoulder or a waist. The throw moves nobody: the loser plays `Fall_Back` where he stands while the winner raises an arm (`sf-3-fall`). |
| **Animation and bodies** | The shared low-poly v4 humanoid (TEMP in `docs/ASSET_REGISTER.md`) with placeholder clips; strikes and clinch moves are upper-body aims over the clip; no paired animation. The computed planted-feet gait runs for Idle/Walk/Run only, so **the opponent glides across the sand in a static Stance clip**, and the player switches between an upright walk and the crouched stance. |
| **Identity** | The player's own body (their Meshy « homme » or « femme », skin, hair) is replaced by `new Wrestler(0x6b3f25)`: a fixed skin, and **a woman player fights as the male v4 wrestler** (`Wrestler` is a v4 body and `setWrestler` sets `setShape(0, 1, 0)`: no female shape, muscular, short hair; the outfit preview does the same through `showProxy`). The opponent fights in his base style's colour, plain (`STYLES[style].ngemb`), with a fixed skin and no accessories, not in the look he wore at the entrance and on his card (`rosterLook`: Baobab green with a border, Teranga ochre, independents by style; his own skin; arm and waist pieces from level 3), which the ceremony uses and the player's duel does not: Ousmane (Baobab) walks in green and fights in indigo, Gora's red stripes become plain red; Teranga's wrestlers happen to match (ochre both times). |
| **Feel** | No hit-stop, no camera kick, no vibration (the game has a « Vibrations » setting, used by vehicles only), no thud of a body on the sand, no sound for a grip or a push. A clean big hit and a guarded one differ by a text message and a synthesized thump. |
| **AI** | Sans frappe: dice every 0.4–1.4 s by style (guard, grab, break chances); it reads nothing. Avec frappe: it reads the player's strike and current clinch move through its attributes and is tuned by level for a new player — good — but it has no memory: it never learns a habit within a bout or across bouts. Against levels 3–4 a new player loses in 6–21 s (`docs/LAMB2.md`, « a matter of the empoignade's rules »). |
| **Sound** | Avec frappe: synthesized hit, slap and swish, a low note when the player is about to fall, crowd one-shots on a stagger and a fall. Sans frappe: a cheer at the fall. No breath, no effort, no voice. The announcer's lines exist only at a fight evening (seen in `af-7-referee-arm`); a friendly outside an evening is silent apart from the drums. |
| **Crowd** | The duel brings its own 12–24 figures on the tiers, plus the evening's stands when a show runs. Avec frappe, the stands answer strikes, staggers and the fall (`frappeMoments.ts`); **sans frappe nothing reacts during the player's bout** (`onMoment` fires only avec frappe), only the result fête at a gala. |
| **Spectacle** | No replay of the fall, no commentary of the exchanges, the referee raises the arm only avec frappe; « sans frappe » ends on « Il est à terre ! » and a recap table. |
| **Rewards** | The recap is a table of counts (« Parades réussies 0 · Saisies engagées 1 · Dégagements 0 ») and needs (« Moral +14 »); the career's after-bout card (record, place, purse, next steps) is the good part and comes after it. |
| **Career** | The ladder, purses, galas and belt are solid. But the ranked opponent rotates among the three nearest on points with no memory (a defeat gives a line « Revanche à prendre contre … », never a booked revenge); the title bout uses the ordinary path (`docs/CAREER.md` « Not yet »); the roster wrestlers are not people in the city. |
| **Online** | Friends watch one seeded gala bout together — good. A friend's own main event is seen as a body standing in a stance, then the result. No player-vs-player bout. |

## 3. Roi des Arènes: what it can bring, and how without losing anything

### 3.1 What it is

A separate project (a Unity prototype of movement and clinch, then a Three.js browser experiment run by another agent
team) whose goal is « big, human-proportioned adult wrestlers… not block/LEGO avatars » (its README's visual contract)
and convincing contact. Delivered so far: WEB-001 two physiques on an anatomical CC0/MPFB-derived base mesh; WEB-002
procedural locomotion with planted feet; WEB-003/004 finish and face realism (a face atlas, native eyes/brows/lashes);
WEB-006 « contact practice » (approach, hold, release at 0.72 m; no grips, no AI, no takedown); WEB-008 a chest X of
cords over the shoulders to the back, no neck loop, a central pouch, six pouches in all, original uninscribed forms.
Its own recommendation (INT-001): keep Dakar Rek's arena, duel, career, audio, save and network systems; adapt RDA's
fighter presentation; first a free AI exhibition bout through the existing entrance → bout → result → return route;
RDA contact practice is not a combat engine; Dakar's advanced clinch is coupled to striking and must be separated
carefully for a non-striking bout. Its code is on the owner's computer: the lab branch holds a README only. Its
cultural status, which we keep: every wrestling, ritual, accessory and arena representation is unverified, no claim of
authenticity, original generic forms only, a Senegalese adviser to review high-impact final content.

### 3.2 Piece by piece

| RDA piece | What it would do in Dakar Rek | Replaces or adds | Needs from the owner | What we can build ourselves now |
|---|---|---|---|---|
| **Two anatomical physiques** (heavyweight, athletic; CC0/MPFB-derived) | The wrestler body of every bout: the player's, the opponent's, the entrance, watched bouts, preliminaries | **Adds** two body ids on our 20-bone v4 rig through `scripts/meshy/transplant-to-v4-rig.mjs` (adapted from Meshy's to MPFB's bone names), so `Wrestler`, the clips, `StrikeRig`, the gait, the fête and every check run unchanged. The transplant scales a body to v4's leg length; a heavyweight keeps his size through `BODY_FIT.scale` (the Meshy « femme » uses 0.93). `preloadBody` already falls back to v4 when a body is missing; v4 stays the low-quality body | The GLBs (or `experiments/roi-des-arenes` pushed to `lab/roi-des-arenes-threejs`), the source `.blend`/MPFB export, the licence records (CC0 headers, MPFB policy) | Per-style builds from v4's own morphs (`heavy`, `muscular`): Gora heavy, Pape lean (stage 2) |
| **Face realism** (WEB-004 atlas, eyes, brows, lashes) | Faces in the close shots: the fall camera, the replay, the entrance | **Adds** with the bodies | The atlas PNGs and their licence record; ~4 MB more to measure on a phone | Nothing needed before the bodies |
| **Planted-feet locomotion** (WEB-002) | Wrestlers stepping and circling without sliding | Dakar already has one (`src/actors/gait.ts`: feet planted, no moonwalk) for Idle/Walk/Run; the duel's Stance/Grab clips bypass it, so the opponent glides | Nothing (RDA's code would only be a reference) | A crouched fighting-stance gait in `gait.ts` (stage 2) |
| **Contact practice** (WEB-006) | The distance and the hold/release of the empoignade | **Not a combat engine**: we keep ours. We take its numbers (0.72 m separation, the approach/hold/release timings) for the clinch's presentation | Nothing | The clinch at chest distance (stage 1) |
| **Chest X, no neck loop** (WEB-008) | An optional cosmetic in « Tenue de lutte », worn at the entrance and in bouts | **Adds** a fifth accessory next to today's four placeholders (arm, waist, neck) | A go to ship it as an option (cultural status unverified); an adviser before it becomes prominent (posters, the default look) | Yes, from the description: cords from the chest over the shoulders to the back, a central pouch, six plain pouches, on the `chest`/`spine` bones, one merged mesh |
| **Unity prototype** (movement, clinch) | Ideas only | Nothing | Nothing | Nothing |
| **INT-001's « free AI exhibition first »** | A bout through the full route with nothing at stake | The fighter's path already takes `mode: 'amical'`: an « Exhibition » is a small addition | Nothing | Yes (stage 3) |

### 3.3 How it comes in without losing anything

- **Nothing is deleted.** The v4 `Wrestler` stays the body for low quality, for any body that fails to load, and for
  every check until the new bodies pass the same checks. New bodies are chosen by quality (or by `?rdabody` while they
  are measured), never by replacing `character_v4.glb`.
- **One rig.** Everything that moves a wrestler (clips, `StrikeRig` aims, the gait, the fête's carry, the referee's
  arm) addresses the 20 bones and four sockets of v4. A body that does not run on that rig does not come in. This is
  how the Meshy bodies arrived (`docs/meshy/PROOF_REPORT.md`).
- **Rules stay ours.** RDA's contact practice is a distance-and-state exercise; our duel decides everything. Its
  numbers inform the presentation only.
- **The non-striking clinch is a rules change, done apart** (stage 4): `LambDuel` uses one flag `frappe` for strikes
  *and* the deep clinch. We split it into two (`strikes`, `deepClinch`) with `avec_frappe` = both, and the current
  `sans_frappe` = neither until the owner chooses; headless golden tests prove both disciplines unchanged by the split.
- **Culture**: no claim of authenticity; original generic forms; the chest X and any new ritual-looking content stay
  options, unrewarded, until reviewed. This agrees with the spec's « on ne bloque pas les décisions de game design » for
  mechanics, and with RDA's note for high-impact representations.

## 4. A great wrestling experience, staged

Ranked by impact on the player and by cost, in the recommended order. Each stage is playable and verifiable on its own,
keeps both disciplines working, and adds no permanent HUD button (detailed choices live on the phone, as today). Every
stage runs at least: `npx tsc --noEmit`; the unit tests of the stack (`tests/lamb*.test.ts`, `watchedBout`,
`lamb2Watch` for determinism, `lamb2Balance` and `lamb2Styles` for the tuned tables, `career`, `arena*`); and the
browser checks it touches, phone first, one browser at a time under `flock /tmp/dakar-browser.lock`. Headless runs say
nothing about a phone's frame rate; a stage that adds anything drawn is measured on a phone before it is called done.

### Stage 0 · « Les petites réparations » — what the baseline found (independent fixes, any time)

- **For the player**: in the wrestlers' tunnel the camera no longer sits behind the « ENTRÉE DES LUTTEURS » sign (the
  sign and the tunnel's roof seen by the follow camera like a wall or an awning, `pullClear` in `src/actors/camera.ts`); during a bout the streak chip is hidden with the
  rest of the city HUD; the bàkk hint goes when the referee calls; the after-bout card's « Palmarès » reads on one line
  on 390 px; in portrait the « Prise » panel sits above the wrestlers' heads, not over them.
- **Files**: `src/lamb/duel.ts` (the `body.induel` hide list: `#streakChip`; the Prise's place in portrait lives in
  `src/ui/style.css` « the Làmb 2.0 duel HUD »), `src/arena/bakk.ts` or `fighter.ts` (the hint's end), `src/career/progress.ts`
  / `src/ui/style.css` (the card), the sign and roof as camera obstacles (`src/actors/camera.ts`, `src/world/arenaModules.ts`).
- **Also**: the four failures of `check-arena-fighter` at the baseline (§1: the gala night's « préliminaires d’abord »
  and « Prêt : … » toasts never seen by the check while the show itself behaves as documented) are investigated first:
  a check out of step with 1.0.1 or a lost toast.
- **Checks**: `check-arena-fighter` (both), `check-lamb2` (a new step: the heads below the Prise panel, by `duelScreen`),
  `check-career` (the card), a phone capture of the tunnel.
- **Owner decision**: none.

### Stage 1 · « Le choc » — every contact is felt (recommended first; detail in §5)

- **For the player**: a clean hit freezes the picture for a few hundredths of a second and jolts the camera; a big hit
  or a stagger hits harder; the empoignade brings the camera in and the two bodies chest to chest; the fall is slow and
  close in both disciplines, with a thud of a body on the sand; an Android phone buzzes on a hit taken and on the fall
  (the existing « Vibrations » setting).
- **Files**: `src/lamb/duel.ts` (`update`, `frame`, `poseBodies`, `startClinch`, `end`, `strikeLands`,
  `clinchExchange`), `src/lamb/audio.ts` (two synthesized sounds), `src/transport/haptics.ts` (reused as is).
- **Risks**: the watched bout must stay identical on every device (the effects never touch `spectate`, `headless` or
  the seeded `rand`); the close clinch camera must not put the HUD over the bodies on 360 × 640; too much shake.
- **Checks**: `check-lamb`, `check-lamb2` (layout steps included), `check-arena-fighter` with and without `LAMB2=1`,
  `check-arena-visit` with `LAMB2=1` (the watched bout unchanged), a new phone step reading `duelInfo().fx`.
- **Owner decision**: none.

### Stage 2 · « Qui est qui » — identity, build and readable bodies

- **For the player**: the opponent fights in the look he walked in with and wears on his card — Ousmane in Baobab's
  green, Gora in his red stripes, his own skin and his level's pieces (`rosterLook(id)`, used by the ceremony and the
  portraits, not yet by the player's bout); the player's wrestler has the player's own skin tone (`Appearance.skin`), not a
  fixed brown; Gora is heavy and Pape lean (v4's `heavy`/`muscular` morphs, by style); both wrestlers step and circle in
  a crouched stance with planted feet instead of gliding in a static Stance clip (a stance mode of `src/actors/gait.ts`,
  the idea RDA's WEB-002 proved); in the empoignade, his move is shown by a small sign above him (→ pousse, ← tire,
  ↻ pivote) in the lesson and against levels 1–2, fading out above (the words stay); the rule line under the Prise moves
  to the lesson. Optional: the chest X (WEB-008 description, built on our rig) in « Tenue de lutte ».
- **Files**: `src/main.ts` (`startDuel`: the opponent's look and skin, the player's skin), `src/lamb/duel.ts` (`mk`,
  the tell sign, the clinch HUD line), `src/actors/gait.ts` + `gaitRig.ts` (stance mode), `src/actors/humanoid.ts`
  (shape per style), `src/lamb/look.ts` (+ one accessory), `src/career/portrait.ts` (the chest X in the portrait).
- **Risks**: the gait in stance must keep the strike overlay on top (it poses the legs, `StrikeRig` the upper body);
  morph shapes must not open the ngemb; the woman player's body (below).
- **Checks**: `check-lamb2`, `check-arena-fighter` (the opponent's colours equal his card), `tests/gait.test.ts` (new
  cases: stance stepping keeps feet planted), `check-career` (portraits), a phone capture before/after.
- **Owner decision**: **how a woman player's character wrestles** (today she becomes the male v4 wrestler in every bout;
  options: her own Meshy body in a sports top and ngemb on the same rig, or bouts kept as they are); the chest X as an
  option before an adviser has seen it.

### Stage 3 · « Le spectacle » — the moments are staged in every bout

- **For the player**: after a decisive fall, **a replay** (about 2.5 s, from a low angle, then a second angle, half
  speed; a tap skips it) before the referee raises the arm; **short commentary** at the bottom of the screen in every
  arena bout, friendly or ranked, not only at the gala: « Il le tient ! », « Il glisse… il glisse ! », « Contre ! Waaw
  kay ! », « Daan na ! » (Wolof from the lexicon, with its gloss when it is on), one line at a time, never over the
  buttons; the **referee raises the arm in « sans frappe »** too; **the stands react to the player's sans-frappe bout**
  (clinch, fall) as they already do avec frappe (`frappeMoments.ts` generalized); the **drums and the crowd bed follow
  the bout** (the tension bed when a wrestler slips, the bàkk's rhythm at the fall); **the player's own bàkk** gets
  three beats they choose on the phone in « Tenue de lutte » from the dances already in the game (« Mbakkou »), the
  drums answering each beat (today: two fixed beats); **« Combat d'exhibition »**: a friendly through the full
  fighter's path, no purse (RDA's INT-001 first step).
- **Files**: `src/lamb/duel.ts` (a ring buffer of both bodies' bone rotations, Float32Array, about 120 kB; the replay
  phase between 'fall' and the arm), `src/lamb/commentary.ts` (new, pure: lines by moment, seeded so a watched bout says
  the same everywhere; `tests/commentary.test.ts`), `src/arena/frappeMoments.ts`, `src/arena/soundscape.ts`,
  `src/i18n/lines.ts`, `src/arena/bakk.ts` (the chosen beats), `src/career/module.ts` (exhibition).
- **Risks**: one voice at a time with the announcer and the griots (the gala's rule); the replay must not delay the
  result for friends (their show waits on the presence result, sent when the bout ends, before the replay); text volume
  and Wolof quality.
- **Checks**: `check-lamb2` (a replay step: `duelInfo().replay`, skip by tap), `check-lamb` (the referee's arm sans
  frappe), `check-arena-fighter` (lines, no double voice), `check-arena-visit` (the watched bout's lines), a phone
  capture of the replay.
- **Owner decision**: none for text; recorded voices later (who records them; no synthetic imitation of a real voice).

### Stage 4 · « La lutte simple » — depth for the default discipline

- **For the player**: the live « sans frappe » bout stops being 2.6 s of tapping. It keeps its own identity (no
  strikes) and gets Làmb 2.0's clinch: the grip from how you entered, push/pull/pivot read and answered, the slip felt
  before the fall, the throw and the counter. The referee presses a bout that goes nowhere (as avec frappe) and a passive
  wrestler loses the decision, so holding « Garde » no longer draws a paid 90 s time-out. Coach Ablaye's « sans frappe »
  training gains the clinch steps from his avec-frappe lesson.
- **Files**: `src/lamb/duel.ts` (split `frappe` into `strikes` and `deepClinch`; `clinchFrappe` → `clinchDeep`),
  `src/lamb/rules.ts` (a third rule set, `sans_frappe` v2, with `enabled` and its own label, behind `?lamb2` first),
  `src/lamb/lesson.ts`, `src/lamb/clinch.ts` (styles' clinch data for the three sans-frappe opponents), `src/main.ts`
  (menus), `docs/LAMB_RULES.md`.
- **Risks**: the economy was measured on 4–7 s bouts (`docs/ORDINARY-PURSES.md`): longer bouts lower purses per hour
  (good) and the « staller » table must be re-run (`scripts/m1a-sim/staller-check.ts`); the watched evening must stay
  deterministic; golden tests must prove `avec_frappe` and the current `sans_frappe` identical after the split.
- **Checks**: new golden tests (seeded bouts before/after the split, both disciplines), `lamb2Balance`-style pupils for
  the new sans frappe, `check-lamb` (+ the clinch steps), `check-arena-visit`, the staller check.
- **Owner decision**: **yes** — the default rules change; what a draw without a single grab pays (the doc's own
  options: the loss factor 0.6, or leave it).

### Stage 5 · « Lire et être lu » — opponents with a memory, a rival, training that matters

- **For the player**: an opponent **learns your habits** within a bout (if you answer every push with a pull, he
  starts pivoting; the commentary says « Il a compris ton jeu ! »), bounded by his level and Technique, never reading
  inputs the screen does not show; each roster wrestler has **one signature move** (a named throw or entry with its own
  tell and counter timing, invented names: « le crochet de Daouda », « la poussée de Gora »), shown on his card; **the
  rival is real**: after a defeat, « Revanche » is booked at the arena with his line before the bout and on the posters
  (today only a line says « Revanche à prendre »); **sparring** at the écurie (a 30 s live bout against Babacar at your
  level, counted as the guided sparring counter `lamb_skill`); a **scouting card** on the phone before a ranked bout
  (his style, his favourite move, your history against him).
- **Files**: `src/lamb/clinch.ts` and `stand.ts` (a small per-bout habit model, pure), `src/lamb/opponents.ts`
  (signature data), `src/career/roster.ts` + `module.ts` (revenge booking, scouting), `src/lamb/drills.ts` (sparring),
  `src/ui/phone/apps/*` (the card).
- **Risks**: an AI that reads too well is unfair on a phone (cap it by level, keep `lamb2Balance` bands); a signature
  move must stay a position game, not a scripted win.
- **Checks**: unit tests per signature move and for the habit model (a pupil that repeats one answer loses more, a
  varied one does not), `lamb2Balance` re-run, `check-career` (revenge on the bill and posters), `check-lamb2`.
- **Owner decision**: none.

### Stage 6 · « Les corps de Roi des Arènes » — believable wrestlers

- **For the player**: two physiques (heavyweight, athletic) and real faces for every wrestler, the player included
  (their skin tone, their build chosen by their training or picked in « Tenue de lutte »).
- **How**: RDA's GLBs → `transplant-to-v4-rig.mjs` adapted to MPFB bone names → `public/assets/wrestlers/*.glb` →
  two new `BodyId`s preloaded at the arena and the écurie only, used by `Wrestler` on medium/high quality, v4 kept on
  low and as the fallback. The face atlas comes with them if the phone budget allows.
- **Files**: `scripts/meshy/transplant-to-v4-rig.mjs` (an `--mpfb` bone map), `src/actors/humanoid.ts` (`BODY_FIT`
  rows, `Wrestler` body choice), `src/actors/playerBody.ts`, `docs/ASSET_REGISTER.md` (provenance rows).
- **Risks**: memory and draw calls on a phone (two more skinned bodies of a few MB, decoded textures); deformation in
  grabs and falls (paired poses at chest distance); licence records must be complete before anything ships.
- **Checks**: the proof harness used for the Meshy bodies (`proof/meshy`), `check-lamb2`, `check-arena-fighter`,
  `check-arena-people` (the fête's carry on the new bodies), `scripts/perf.mjs`, a device frame-rate pass on a phone.
- **Owner decision**: **yes** — push `experiments/roi-des-arenes` to `lab/roi-des-arenes-threejs` or hand over the GLBs,
  sources and licence records; accept the phone budget.

### Stage 7 · « La bascule et le titre » — the evening's làmb becomes Làmb 2.0

- **For the player**: once stages 1–4 have been played on phones, the switch prepared in `src/lamb/flag.ts`
  (`LAMB2_DEFAULT`) is flipped as `docs/LAMB2.md` recommends (option (b): the evening and the lesson first, the ranked
  menu after); the title bout gets its own staging (the belt carried in, the champion's entrance last, the belt on the
  winner's shoulder at the fête) and the once-in-a-career « Roi des Arènes » night when the player earns the rung
  (the announcer, the posters across the city the next day). Purses stay those of the 1.0.1 economy.
- **Files**: `src/lamb/flag.ts`, `tests/lamb2Flag.test.ts`, the checks that must load `?lamb1` after the flip (listed
  in `docs/LAMB2.md` « La bascule »), `src/arena/ceremony.ts`, `celebration.ts`, `posters.ts`, `src/career/module.ts`.
- **Risks**: friends on different settings see different bouts (same seed, other discipline); every check without the
  flag changes meaning after the flip.
- **Checks**: all wrestling checks twice (with `?lamb1` and without a flag), `check-career`, `check-arena-hype`.
- **Owner decision**: **yes** — when to flip, and in which order.

### Stage 8 · « Le défi » — two players, one bout, a server referee

- **For the player**: next to another player in the street, « Défier » on the phone sends a friendly challenge (a row
  in « Autour de moi », or a sheet like Grand Camp's « Inviter », which already lists « À côté de toi · 12 m » players by
  tag through `messagesDeps.nearby()`; no new HUD button); accepted, both walk to the nearest sand (the écurie's or the
  arena's ring), the referee calls « prêts ? », they fight, friends nearby watch the same bout; the result is told to both and recorded
  apart (`lamb_defi_*`), never in the career ladder at first. A disconnect is not a sporting win.
- **What Grand Camp already gives** (`server/camp.ts`): one Durable Object per match, named by role (`camp:<match>`,
  `list:<hub>`); a fixed-tick authority (20 Hz) with a snapshot to every player each tick; requests answered once
  (`ack`, idempotent by id), rate limits, a feature-versioned protocol inside its own feature (`CAMP_FEATURE`,
  `CAMP_VERSION`: no `ONLINE_PROTOCOL` bump), the player's tag from the device key, private lobbies by invitation of
  tags, a 60 s return after a drop, an alarm watchdog, and a fee ledger that holds at « Prêt » and settles exactly once.
- **What a wrestling bout needs on top**:
  1. **A pure, shared simulation.** The duel's rules loop (`fightFrappe`, `clinchFrappe`, `throwStep`, the timers) is
     inside `LambDuel` with Three.js vectors and its DOM. It must be extracted into a pure `LambSim` (plain numbers, no
     DOM), run by the single-player duel locally (one code path) and by the server. Golden tests: the same seed gives
     the same bout before and after, for both disciplines and the watched bouts. This is the big piece of work, and it
     pays for stages 4–5 too.
  2. **Two human sides.** The sim already drives its « player » side by buttons and has an `autopilot`; the opponent side
     needs the same input path (today it is AI only).
  3. **Timing under latency.** Tells last 0.36–0.6 s (clinch moves, a grab's response window, a throw's windup); a phone
     round trip is 100–250 ms. The server judges an answer by the tick the client saw when it pressed (Camp's `in`
     frames carry a sequence `s`; a wrestling frame adds the last snapshot tick drawn), accepted up to about 150 ms back; online bouts may also lengthen
     the tells (×1.3). To be measured with two phones before it is promised.
  4. **A two-seat lobby** (`CampLobby` is football-sized: 6, 10, 14), a challenge from presence, accept/decline, « Prêt ».
  5. **Watchers**: a read-only seat for friends in range; the stands react from the snapshots.
  6. **Server object**: either a new role `lamb:<match>` in the existing `GrandCamp` class (no migration, but football
     and wrestling share a class), or **a new class `LambBout`, which needs a new migration tag (e.g.
     `v4-lamb-bout`, `new_sqlite_classes`) and its binding in both `durable_objects` and `previews` in
     `wrangler.jsonc`**. Recommended: the new class, add-only, applied when the owner publishes.
- **Risks**: the extraction (stage 4's golden tests reduce it); fairness under latency; abuse (rate limits as Camp).
- **Checks**: `tests/lambSim.test.ts` (golden), a two-client browser check on a local worker (as
  `check-multiplayer.mjs` and `check-grand-camp.mjs` do), a two-phone latency session.
- **Owner decision**: **yes** — the server object (and its migration); whether any bout is ever staked (spec §17, §19:
  the ledger's hold/settle exists; a draw returns both fees; a disconnect follows the agreed rule).

## 5. The first stage: « Le choc »

Why first: it is what a player notices in the first second of every bout, in both disciplines and in every place a
bout happens (the écurie, a friendly, the fighter's path, the gala); it changes no rule, no number of the career or the
economy, no save field, no protocol; it is small enough to review in one sitting and to verify fully.

**Scope.** The player's own bout only: `LambDuel` without `spectate` and with a DOM. Watched bouts (seeded, fixed
steps, the same on every device) and every headless test run exactly as today. Both disciplines; the lesson and the
drills get the same feel (a drill's timing is in game time, so a stop pauses its clock too).

| Piece | What happens | Numbers (to tune on a phone) |
|---|---|---|
| **Hit-stop** | The bout's clock stops for an instant (the duel's `update` advances by 0; presses made meanwhile are kept, not dropped), the bodies hold their pose | quick hit 0.05 s · big hit 0.09 s · stagger 0.12 s · a throw that lands or a counter that turns it 0.12 s · a big strike guarded 0.04 s; the longest wins, never summed |
| **Camera kick** | A short push of the camera towards the pair along its own axis, then back; no random shake (calmer on a phone, readable) | quick 4 %, big/stagger 8 %, fall 10 % of the distance, back over 0.25 s |
| **Clinch close-up** | Entering the empoignade, the camera eases closer and lower; it eases back when they separate. Its look point is set so that, in portrait, the heads stay below the « Prise » panel (today the panel already overlaps them: §2.5) | 70 % of the fight distance, 0.4 m lower, over 0.4 s; heads ≥ 12 px below the panel on 390 × 844 and 360 × 640 |
| **Bodies in contact** | Entering the empoignade the two wrestlers close to chest distance along their line and stay there through the exchanges (which already move both together); arms on the other's shoulders and back by one more `StrikeRig` aim under the push/pull/pivot aims (the rig is then made in both disciplines; today only avec frappe) | 0.72 m between centres (RDA's measured contact separation), over 0.15 s; `separate` already puts them 2.2 m apart |
| **The slow fall sans frappe** | The projection that ends a « sans frappe » bout gets the 0.9 s slow-down and the low close camera that « avec frappe » has (today `fallFx` exists only avec frappe) | as avec frappe: 0.3× for 0.9 s |
| **Sound** | `fallThud()`: a body on the sand (a low thump and a short burst of filtered noise) when the loser lands; `gripSlap()`: skin on skin as the empoignade starts. Synthesized like `strikeSound`, no new file | thump 55 Hz 0.25 s; slap 2 × 0.04 s |
| **Haptics** | Through `src/transport/haptics.ts` `buzz`, which the « Vibrations » setting already controls (Android only; nothing pretends on iPhone) | 30 ms on a clean hit taken, 40-30-60 ms on the player's fall, 25 ms on a counter landed |

**Debug and checks.** `duelInfo().fx`: `{ stops, lastStop, cam: 'fight' | 'clinch' | 'fall', kick, clinchDist, thuds,
buzzes }`. The plan of each event (stop, kick, buzz, sound) is a pure function in a new `src/lamb/fx.ts`, unit-tested
(`tests/duelFx.test.ts`); the duel only applies it.

**Files.** `src/lamb/duel.ts` (`update`: the stop; `poseBodies`: the kick and the clinch camera; `startClinch`: the
closing; `end` and `resolveClinch`: the sans-frappe slow fall; `strikeLands`, `clinchExchange`, `throwStep`: the
events), `src/lamb/strikeRig.ts` (one `grip` aim; the rig made sans frappe too), `src/lamb/audio.ts` (two sounds), `src/lamb/fx.ts` (new, pure),
`tests/duelFx.test.ts` (new). Roughly 200 lines.

**Acceptance.**
1. `npx tsc --noEmit`; `npx vitest run tests/duelFx.test.ts tests/lamb*.test.ts tests/watchedBout.test.ts` — the
   balance, styles and watch tables unchanged to the number (they are headless).
2. `check-lamb2` with a new phone step: a quick hit adds a stop, a big hit a longer one; in the empoignade
   `fx.cam === 'clinch'`, `fx.clinchDist <= 0.8`, and both heads (`duelScreen`) below the Prise panel; every existing layout step still passes on 390 × 844, 844 × 390,
   360 × 640 and 667 × 375 (the closer camera must not bring the bodies under the buttons or the gauges).
3. `check-lamb` with a new step: a « sans frappe » projection has `fall.slow` and a thud.
4. `check-arena-fighter` with and without `LAMB2=1`; `LAMB2=1 check-arena-visit` gives the same watched result for the
   same evening as before the change.
5. Phone captures at the same moments as §1's « before » set, side by side in this folder.
6. On a real phone (owner or device lane): the stops are felt, not a stutter; the kick is not sickening. Headless says
   nothing about this.

**Not in this stage**: the replay, commentary, the referee's arm sans frappe (stage 3); the opponent's colours and the
stance gait (stage 2); any rule.

## 6. Decisions for the owner

| # | Decision | Options | Recommendation | Blocks |
|---|---|---|---|---|
| 1 | When Làmb 2.0 « avec frappe » becomes the game's làmb | (a) keep sans frappe by default, avec frappe offered beside it; (b) the evening and the lesson first, the ranked menu after; (c) all at once after a week of real games | (b), after stages 1–4 have been played on phones (`docs/LAMB2.md`) | stage 7 |
| 2 | Does « sans frappe » get the deep clinch, and what does a held-guard draw pay | keep the 2.6 s tap race; or « La lutte simple » (stage 4). For the draw: pay the loss factor (0.6) when the player never grabbed, or leave it (`docs/ORDINARY-PURSES.md`) | the deep clinch behind `?lamb2` first; a passive draw paid as a loss | stage 4 |
| 3 | How a woman player's character wrestles | today she fights as the male v4 wrestler; her own Meshy body on the same rig in a sports top and ngemb; or keep it | her own body, decided with the art direction | stage 2 (that part) |
| 4 | RDA's physiques and faces | push `experiments/roi-des-arenes` to `lab/roi-des-arenes-threejs`, or hand over the GLBs, sources and licence records | push the experiment (we read it; nothing of it runs in the game until transplanted and measured) | stage 6 |
| 5 | The chest X (WEB-008) before an adviser has seen it | ship it as an optional cosmetic now (original, uninscribed, no power); or wait for the review | optional now, never on posters or as a default look until reviewed | stage 2 (that part) |
| 6 | Player-vs-player bouts: the server object | a role in `GrandCamp` (no migration) or a new `LambBout` class (new migration tag and bindings in `durable_objects` and `previews`) | the new class, published with a release | stage 8 |
| 7 | Staked player-vs-player bouts | friendly only; or a fee held at « Prêt », the winner takes both, a draw returns both (the Grand Camp ledger) | friendly only first; stakes after a season of friendly bouts | after stage 8 |
| 8 | Recorded voices for the commentary and the announcer | text only; or recorded lines by speakers the project may use | text first (stage 3) | none now |

## 7. What is kept, whatever the stage

- Our rules (`docs/LAMB_RULES.md`: « C'est notre jeu, on crée nos règles »), invented wrestlers, écuries and moves; no
  real wrestler, écurie, promoter or brand.
- No rite staged (no bath, no amulet, no prayer), no sacred text; accessories are cosmetic and never change a bout;
  money never buys a win (`levelFactor` and the attributes' ±20 % rule).
- No claim of cultural authenticity for any wrestling, ritual, accessory or arena representation (RDA's status, kept);
  a Senegalese adviser reviews high-impact final content (the default look, posters, the title night).
- All money is the game's; purses stay those of the 1.0.1 economy; no reward is paid twice; the server decides any
  result between players.
- Saves stay compatible (additive fields only); `ONLINE_PROTOCOL` / `PROTOCOL_VERSION` are not bumped (a two-player bout
  is versioned inside its own feature, as Grand Camp is).
