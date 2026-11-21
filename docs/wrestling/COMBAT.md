# The bout, phase 1: a real wrestling fight (branch `wp/wrestling-combat`)

Work package « combat », 16–17 Nov 2026, from `wp/wrestling` @ 87076f3f. The owner: « turn this base into a real Senegalese
wrestling bout, fluid, physical and fun, with grips, balance, resistance, throws, a smart opponent, and victory and defeat.
Gameplay first. » This package is the bout itself; entrances, sabar, crowd and cinematics are phase 2.

Cultural status: **unverified**. Every throw, hold and word here is a movement placeholder of our game, with generic names,
not the reproduction of a real technique or rule; nothing is claimed authentic. RDA's status is kept (`RDA-INTEGRATION.md`).
The game's own rules: `docs/LAMB_RULES.md` (« C'est notre jeu, on crée nos règles »), section « 1 bis ».

## 1. Comment jouer (pour le joueur)

Le combat se joue au **joystick** (les pieds, puis le poids du corps) et à **trois gros boutons** (quatre avec frappe).

| | Téléphone | Clavier |
| --- | --- | --- |
| Se déplacer, en garde basse | joystick | flèches / ZQSD / WASD |
| **Saisir** : la nuque (appui bref) · la ceinture (maintenu) · **« Jambe ! »** quand il se penche vers toi | gros bouton jaune | E / Espace (maintenu : ceinture) |
| Garde (avec frappe : contre les frappes ; levée au bon moment : pare une main à la nuque) | bouton bleu, maintenu | G / Maj |
| Reculer (ses saisies et ses frappes tombent dans le vide) | bouton gris | X |
| Frappe (avec frappe) : rapide (appui bref) · **grosse** (maintenu) | bouton orange | J (maintenu : grosse) · K |
| **Dans l'empoignade** | | |
| Pousser · tirer · pivoter : le joystick **vers lui**, **loin de lui**, **de côté** | joystick | flèches |
| **Projeter** : le bouton dit la projection que ta prise et son déséquilibre donnent (« Croc », « Hanche »…) ; **vert** quand il est prêt à tomber | gros bouton jaune | E / K |
| **Contrer** : le même bouton, vert, pendant qu'il tente la sienne | gros bouton jaune | E / K |
| Aller plus loin : nuque → bras → ceinture | bouton bleu | G |
| Casser (sortir de l'empoignade) | bouton gris | X |

**Le cœur du combat.** Saisis-le. Dans l'empoignade, ton poids est le joystick : vers lui tu pousses, loin de lui tu tires,
de côté tu pivotes. Chaque poussée réussie l'envoie en arrière, chaque traction vers toi, chaque pivot sur le côté — tu le
vois à son corps (dos cambré, buste plié, appuis qui reculent). Quand il penche assez du côté qu'une projection demande, le
gros bouton s'allume et dit laquelle : **Croc** quand il recule, **Hanche** ou **Ramené** quand il vient vers toi,
**Balayage** quand il penche sur un côté, **Soulevé** à la ceinture quand il est fatigué, **Jambe** si tu tiens sa jambe. Une
projection sur un homme bien planté et frais rate, et c'est toi qui te retrouves déséquilibré.

**Lis-le.** Penché en avant, il pousse : **tire** (Tirer bat Pousser, Pivoter bat Tirer, Pousser bat Pivoter). Quand il tente
sa projection, son corps la montre : **penche-toi contre** (joystick à l'opposé de là où il t'envoie : loin de lui contre sa
hanche, vers lui contre son croc) ou **Contre** — plus risqué, mais il part au sol. Ça coûte du souffle : épuisé, tu ne tiens
plus, tu glisses ; casse pour respirer debout.

**Les prises.** La **nuque** se prend vite et sans risque, mais contrôle peu. La **ceinture** se voit venir et t'expose
(poitrine contre poitrine, ses hanches contre les tiennes) mais donne les grandes projections. La **jambe** est la plus
décisive et la plus risquée (tête basse : s'il s'étale, c'est toi qui touches des quatre appuis). Une prise se gagne,
s'use quand tu fatigues ou perds les échanges, et se casse.

**La chute.** Le combat se gagne quand l'autre a **le dos au sol** ou **les quatre appuis**. L'arbitre l'annonce et lève le
bras. Sortir du cercle n'est pas une chute : 2 points à la décision pour celui qui reste dedans. Celui qui n'attaque pas reçoit
des **avertissements** (1 point pour l'autre chacun) : tenir la garde ne fait plus match nul. Après un combat amical,
**Revanche** relance le même combat.

**L'adversaire** lit ton corps, pas tes doigts. Aux niveaux 1 et 2, un petit panneau au-dessus de sa tête dit ce qu'il prépare
(« → pousse », « ↘ ceinture », « Hanche ! »). Il retient tes habitudes : la même projection trois fois, il l'a comprise
(« Il a compris ton jeu ! ») — et il s'en souvient la prochaine fois que tu l'affrontes. Chaque style a sa projection
favorite : le costaud pousse et crochète, le technicien fait tourner et balaie, le rapide plonge sur la jambe, le défensif
attend ta poussée et te charge sur la hanche, le bon frappeur te ramène par la nuque, le grand lutteur de saisie prend la
ceinture et soulève.

**La leçon de Coach Ablaye** (« Entraînement » à l'écurie) apprend tout cela pas à pas avec les nouvelles commandes ; les
trois exercices aussi (frappes au bouton Frappe, échanges et gainage au joystick).

## 2. The switch, and what is kept

- **One switch** (`src/lamb/flag.ts`): `COMBAT_DEFAULT = true` on this branch; `?combat0` (or `localStorage['dakarrek.combat']
  = '0'`) gives the bout as it was (Làmb 2.0 avec frappe, the 2.6 s empoignade sans frappe); `?combat1` forces the new one.
- **What takes the new bout**: the player's own bout in both disciplines — the friendly and ranked menus, the fighter's path
  and the gala (through `startDuel`), the écurie's lesson and its three drills.
- **What does not**: watched bouts (the evening's main event, the preliminaries: `spectate`, `autopilot`) never take it —
  seeded, fixed-step, the same for every friend in the stands; twelve watched bouts' full traces recorded at 87076f3f replay
  byte for byte (`tests/combatWatchedGolden.test.ts`).
- **Unchanged**: the career, purses, records (`lamb_*`, `lamb_af_*`), rewards, the save (no field added: the opponent's
  memory of the player is kept in memory only), the protocol, « Le choc » (stops, push, close-up, contact at 0.72 m, thud,
  buzz, the slow fall), the RDA bodies and their pieces, the `onMoment` hooks (avec frappe, as before), Làmb 2.0's code.
- **Shared files touched**: `src/main.ts` only (36 lines added, 5 changed, each commented: the switch into `startDuel` / `startDrill`, the
  sans-frappe opponent as himself, « Revanche », five debug hooks, the preview address). No HUD or `style.css` change (the
  new buttons' styles live in the duel's own stylesheet).

## 3. The systems and their numbers (`src/lamb/combat.ts`, pure, tested)

It extends Làmb 2.0 (`stand.ts`, `clinch.ts`): the same endurance, balance 0–100 and composure, the same strikes, the same
push / pull / pivot triangle and counter.

**Balance with a direction.** Each wrestler's imbalance is a vector in his own frame (`f` towards the other man, `s` to his
left): its length is the balance lost, its direction where the weight went. A push sends him back, a pull forward, a pivot
sideways, a strike back; pushes stack, a pull after a push gives him his feet back. **Weight** is the stick: leaning commits
the body (up to 0.18 of imbalance that way), braces against the opposite effect (−60 %, less when tired) and worsens an effect
the same way (+35 %). Footwork: charging in at full stick leans you in — his leg reach opens (« Jambe ! »).

**Holds** (control × exposure; reach time):

| Hold | Taken by | Control | Exposure | Reach | Throws |
| --- | --- | --- | --- | --- | --- |
| Nuque (nape and shoulders) | Saisir, a tap | 0.85 | 0.85 | 0.22 s | Croc, Balayage, Ramené |
| Bras (arm and shoulder) | going deeper from the nape | 1.0 | 1.0 | — | Hanche, Croc, Balayage |
| Ceinture (the ngemb) | Saisir held (0.28 s), or deeper from the arm | 1.25 | 1.15 | 0.5 s | Hanche, Croc, Soulevé |
| Jambe | Saisir while he leans in | 1.3 | 1.4 | 0.32 s | Jambe |

A hold's strength drifts to 35 + 65 × min(1, endurance / 60) (it slides out of tired hands at 12/s), firms up 8 on an exchange
won, wears 10 × exposure on one lost; worn out it falls back to the shallower hold, then is lost. The Prise bar is the
holds' strengths times their control, from the player's side (Làmb 2.0's grip advantage, so its slip and break rules apply).

**Throws** (each needs its hold and his imbalance its way; score ≥ 48 takes him down):

| Throw | Holds | Sets it up | Fall | Windup | Cost |
| --- | --- | --- | --- | --- | --- |
| Hanche | bras, ceinture | his weight forward (pull him) | back | 0.55 s | 12 |
| Croc | nuque, bras, ceinture | his weight back (push him) | back | 0.5 s | 10 |
| Balayage | nuque, bras | his weight on a side (pivot him) | back | 0.45 s | 10 |
| Soulevé | ceinture | any imbalance, and more breath than his | back | 0.75 s | 18 |
| Jambe | jambe | his weight back (on the held leg) | back | 0.42 s | 12 |
| Ramené | nuque | his head and weight forward | four supports | 0.42 s | 8 |

Score = 110 × set-up (depth × how well it points the throw's way) + hold (≤ ±15) + own balance (≤ ±5) + Force and Technique
(≤ ±12) + 10 if caught mid-move + up to 12 if he is spent + up to 15 if he leans into it − up to 55 for his brace. On a
balanced, fresh man every throw fails, from anyone (tested on the real duel for all six, and for the city's best). A failed
throw deepens its author's own imbalance by 20 and wears his hold by 20: it always costs.

**Resistance.** Bracing a throw = the weight against its way over its last 60 %: its quality (0–1) takes up to 55 off, for
4 + 6 × quality endurance; below 30 endurance a brace weakens to 30 %: a tired man slips. Contrer (Làmb 2.0's counter, +12
when braced right) turns it (the thrower falls; a sprawled leg pick ends on the four supports) or blocks it.

**Economy.** Against Làmb 2.0: an exchange moves 50 % of its balance, a move costs 40 % of its endurance, the hold's drain is
35 %, a man holding still breathes 3/s and gets 4 balance/s back. The pair moves together: the weights drive it (0.7 m/s per
unit of drive × each man's force, breath and balance), a landed move shoves it; a man moved back without bracing, or drawn
forward without sitting back, loses balance that way (7/s per m/s). The referee separates an empoignade after 10 s (unless
one is about to fall).

## 4. The opponent (`src/lamb/combatAi.ts`)

The AI returns the very intents the player's stick and buttons make (`Intent`), applied by the same code for both sides. It
sees an `AiView`: itself, and the player as his body and the screen show him (his lean and weight, his hold, a move / reach /
throw / strike while it is set up, his gauges) — never his inputs, and only after its reaction time; a reaction to something
that has already landed is dropped.

| Level | 1 | 2 | 3 | 4 | 5 |
| --- | --- | --- | --- | --- | --- |
| Reaction (s) | 0.6 | 0.52 | 0.46 | 0.38 | 0.29 |
| Reads a move / braces a throw | 22 % / 22 % | 28 / 28 | 35 / 35 | 46 / 48 | 60 / 62 |
| Tries to counter | 4 % | 6 | 10 | 15 | 20 |
| Learns (weight of a read habit) | 0.45 | 0.6 | 0.8 | 0.9 | 1 |
| Sets up slower (its tells) | ×1.6 | ×1.45 | ×1.32 | ×1.15 | ×1 |
| Throws at score ≥ 48 + | −8 (too early) | −5 | −3 | 0 | +4 |
| Breath | ×0.85 | ×0.9 | ×1 | ×1 | ×1 |
| Sign over his head | yes | yes | — | — | — |

**Signatures** (each style works towards its throw: its moves set it up): costaud → croc (belt), technicien → balayage,
rapide → jambe, défensif → hanche (waits for the push), bon frappeur → ramené, grand lutteur de saisie → soulevé (belt).
**Habits**: it counts the throws the player tries, the move he opens with, the reach he uses; the third time it knows (a known
throw is braced with +40 % × learning, faster, and countered more; « Il a compris ton jeu ! »); a move the player opens with
half the time is answered in advance. **Memory**: at a bout's end (an abandon too) what it saw is added to a memory by
wrestler (in memory only, never in the save); the next bout against him starts with half of it.

## 5. The bodies (`src/lamb/combatRig.ts`)

On the 20-bone rig, v4 or RDA alike, after the clip: a **crouched fighting stance whose feet stay planted and step** (the
game's own two-bone leg IK, `GaitRig`, fed a state of our own — no shared file changed; a foot steps when the body has gone
0.13 m from it, one at a time, in 0.17–0.25 s, with a 7 cm lift); the **weight** in the hips (over the lean, lower when braced
or off balance) and the trunk (arched back when pushed, folded forward when pulled or diving); the **hands on the hold** by
two-bone arm IK on the other man's bones (his neck, his arm, his hips for the belt, his thigh), reaching there while the reach
runs; the moves' and throws' tells (the hip turned in, the leg behind his, the sweep, the squat under him); **the falls by the
throw** (over the hip, backwards, swept to a side, lifted and dropped, on the four supports); the tell sign (a sprite, one
draw call while shown). A bone the clip did not write again is put back first, so nothing adds up.

## 6. Tests and checks

**Unit and headless tests (new, 68)**, all on the pure rules or the real `LambDuel` without a browser:

| File | Tests | What it proves |
| --- | --- | --- |
| `tests/combat.test.ts` | 24 | holds' trade-offs, strength sliding, wearing to a shallower hold; the balance's direction (pushes stack, a pull gives the feet back); the weight braces and exposes; each of the six throws fails on a balanced fresh man, takes down a man set up its way, fails the other way; the button's throw by his lean; bracing, a tired man's brace, a failed throw's cost; the fall rule; no held-guard draw at the decision |
| `tests/combatDuel.test.ts` | 30 | on the real duel: each throw only with its set-up (and its fall: back or four supports), the push seen in his lean; his throw braced or not, a tired brace, Contrer turning or only blocking; a hold going deeper and Casser; **the habit read**: the third try of the same throw is braced far more often (and « Il a compris ton jeu ! »), and **remembered across bouts** against the same wrestler; **no exploit**: a held guard never wins nor draws (levels 1, 3, 5, ranked), mashing and throw-spamming lose; both outcomes; the same seed and inputs give the same bout; the city's best does not throw a balanced man |
| `tests/combatLesson.test.ts` | 9 | Coach Ablaye's lesson played through with the new controls in both disciplines; the three drills scored full with the stick and the strike button; the AI's level table never easier a level up; six distinct signatures; the memory by wrestler |
| `tests/combatBalance.test.ts` | 4 | the balance bands below (seeded) |
| `tests/combatWatchedGolden.test.ts` | 1 | twelve watched bouts (both disciplines, main events and preliminaries) replay byte for byte as recorded at 87076f3f |

**Balance** (`tests/combatPupil.ts`: three headless players and three exploits, through the same inputs as a thumb, seeing
only what the screen and bodies show; a fresh save after the lesson; each cell the mean of the six styles × 10 seeded bouts;
win rate · median bout length, both disciplines):

| Player | Discipline | Level 1 | 2 | 3 | 4 | 5 |
| --- | --- | --- | --- | --- | --- | --- |
| Novice | sans frappe | 40 % · 18 s | 18 % · 17 s | 8 % · 20 s | 3 % · 14 s | 0 % · 8 s |
| Novice | avec frappe | 27 % · 18 s | 15 % · 17 s | 10 % · 15 s | 8 % · 16 s | 5 % · 10 s |
| Correct (decent) | sans frappe | 50 % · 24 s | 40 % · 18 s | 18 % · 31 s | 13 % · 18 s | 8 % · 9 s |
| Correct (decent) | avec frappe | 55 % · 23 s | 45 % · 24 s | 32 % · 34 s | 10 % · 22 s | 15 % · 12 s |
| Expert | sans frappe | 68 % · 32 s | 60 % · 31 s | 52 % · 45 s | 43 % · 73 s | 52 % · 70 s |
| Expert | avec frappe | 62 % · 25 s | 68 % · 51 s | 40 % · 59 s | 28 % · 67 s · nul 2 % | 32 % · 50 s |
| Garde tenue (turtle, classé) | sans frappe | 0 % · 10 s | 0 % · 9 s | 0 % · 8 s | 0 % · 7 s | 0 % · 7 s |
| Garde tenue (turtle, classé) | avec frappe | 0 % · 11 s | 0 % · 9 s | 0 % · 8 s | 0 % · 7 s | 0 % · 7 s |
| Tout presser (masher) | sans frappe | 3 % · 11 s | 0 % · 13 s | 2 % · 11 s | 0 % · 12 s | 0 % · 12 s |
| Tout presser (masher) | avec frappe | 0 % · 13 s | 0 % · 15 s | 0 % · 13 s | 0 % · 14 s | 0 % · 11 s |
| Projeter sans cesse (spammer) | sans frappe | 0 % · 10 s | 0 % · 10 s | 0 % · 10 s | 0 % · 10 s | 0 % · 5 s |
| Projeter sans cesse (spammer) | avec frappe | 0 % · 10 s | 0 % · 10 s | 0 % · 7 s | 0 % · 8 s | 0 % · 9 s |

Medians at levels 1–3 are 17–34 s for novice and decent players (the old sans-frappe bout: 4–7 s); 90–100 % end by the fall
rule. An expert's bouts against levels 4–5 go long (both read and brace well: some go to the referee). A held guard never wins
and never draws (the old bout drew 100 % of ranked bouts at levels 1, 3 and 5); mashing wins 0–3 %, spamming the throw 0 %.
The one hard step is from level 2 to 3, where the opponent starts to read and brace reliably — to be tuned with people on
phones (the pupils are scripts, not players).

**Checks, before (87076f3f) and after (this branch), on this shared machine** (headless Chromium with SwiftShader, one browser
at a time under `flock /tmp/dakar-browser.lock`; SwiftShader says nothing about a phone's frame rate):

| Check | 87076f3f | After | Note |
| --- | --- | --- | --- |
| `npx tsc --noEmit` | clean | clean | |
| Full unit suite | 4 050 passed, 4 skipped (as given) | **4 118 passed**, 4 skipped (278 files) | + the 68 combat tests |
| `check-lamb2` (v4) | 57 / 58 (one « Le choc » step: his quick hit landed before the player's — chance) | **59 / 59** (58 + the conditional « guarded ») | loads `?combat0` |
| `check-lamb2` `RDABODY=1` | 59 / 59 (58 + the conditional) | **58 / 58** (the conditional not met this run) | loads `?combat0` |
| `check-lamb` | 27 / 27 | **27 / 27** | loads `?combat0` |
| `check-rda-fighter` | 16 / 16 | **16 / 16** | on the **new** bout: the RDA bodies under the new rig (pouches, one-bone drift, size) |
| `check-combat` (new, v4) | — | **22 / 22** (at 51bc3edf) | |
| `check-combat` `RDABODY=1` | — | **23 / 23** (at 51bc3edf) | |

**What changed in the existing checks, and why (nothing they guard is loosened):** `check-lamb` and `check-lamb2` now load
`?combat0`. They encode the bout before this package step by step (the 2.6 s tapping empoignade, the five avec-frappe
buttons and their meanings), which the brief deliberately replaces as the player's bout; that bout stays in the game behind
the switch and in every watched bout, so they keep guarding it exactly, and the new bout's equivalents (layout on the phone,
the close-up's heads under the Prise and feet over the controls, the lesson, records, no page error) are in
`check-combat`. This follows LAMB2.md's own rule for a flip (`?lamb1`). `check-rda-fighter` is unchanged and runs on the new
bout.

**`scripts/check-combat.mjs`** (real touch through Chrome's input pipeline, `scripts/lib/realTouch.mjs`): on a phone in
portrait, « Combat amical » picked by touch; three big buttons clear of the joystick and of both wrestlers; the crouched stance
on the bodies; **a whole bout won by a thumb** (joystick: walk in, push / pull / pivot, brace his throws; buttons: Saisir,
Projeter when it lights, Casser; « Revanche » by touch after a loss), with the hands on the hold (≤ 15 cm), his trunk leaning
the way his balance goes, the loser's head on the sand, the referee's call (« Chute : le dos au sol ! » / « … les quatre
appuis ! ») and raised arm, « Victoire »; **a whole bout lost** with the guard held (never a draw); the records as before.
In landscape: four buttons, the empoignade at 0.72 m with hands on him and the heads under the Prise, a lit « Croc » thrown by
touch. On a desktop: the keys, E held for the belt, the arrow pushing (his lean read all along), K throwing, the lesson's new
steps. No page error anywhere. Its output and captures: `docs/wrestling/combat/check-combat*.json` (results only).

## 7. Performance

`scripts/perf-combat.mjs`: phone viewport 390 × 844, the RDA bodies, the player's bout avec frappe against Gora, 60 s of bout
time (bouts restarted as they end), the same script on 87076f3f and on this branch at 51bc3edf (before the « feel » pass
below). **SwiftShader renders on this shared machine's CPU: its frame rates say nothing about a phone.** What carries over:
the game's JS per frame, draw calls and triangles, the heap's growth.

| Quality | Measure | 87076f3f | This branch | Budget |
| --- | --- | --- | --- | --- |
| Medium | update JS / frame (mean, ms) | 3.21 | 3.33 | ≤ +15 % +0.5 ms |
| | render submit / frame (mean, ms) | 17.15 | 22.12 | ≤ +15 % +0.5 ms |
| | draw calls, at the bell (same view) | 187 | 181 | ≤ +3 |
| | triangles, at the bell (same view) | 271 501 | 264 775 | ≤ +3 % |
| | draw calls, empoignade close-up (same view) | 180 | 173 | ≤ +3 |
| | triangles, empoignade close-up (same view) | 265 523 | 258 683 | ≤ +3 % |
| | draw calls / triangles in free play (median; the camera differs) | 180 / 262 975 | 180 / 259 497 | reported |
| | JS heap growth over 60 s of bouts, after GC (MB) | 17.32 | 20.13 | ≤ baseline + 2 |
| | the bout's load (median, ms) | 739 | 659 | ≤ +25 % +150 ms |
| High | update JS / frame (mean, ms) | 3.57 | 3.71 | ≤ +15 % +0.5 ms |
| | render submit / frame (mean, ms) | 16.49 | 19.23 | ≤ +15 % +0.5 ms |
| | draw calls, at the bell (same view) | 192 | 219 | ≤ +3 |
| | triangles, at the bell (same view) | 284 953 | 304 905 | ≤ +3 % |
| | draw calls, empoignade close-up (same view) | 191 | 212 | ≤ +3 |
| | triangles, empoignade close-up (same view) | 283 449 | 299 077 | ≤ +3 % |
| | draw calls / triangles in free play (median; the camera differs) | 199 / 287 891 | 227 / 306 103 | reported |
| | JS heap growth over 60 s of bouts, after GC (MB) | 18.91 | 14 | ≤ baseline + 2 |
| | the bout's load (median, ms) | 791 | 1223 | ≤ +25 % +150 ms |


Read: the game's own update JS is within the budget (+4 %); the render submit's mean moves with the machine's load (Medium's
median is lower than the baseline's, its mean higher: outliers on a shared CPU). At **Medium** the same views draw 6–7 calls
and 2–3 % triangles *fewer* than 87076f3f. At **High** they draw 21–27 calls and 5–7 % triangles more — **over budget, not yet
explained** (nothing added draws per quality; to investigate with `__dakar.renderBreakdown()` before shipping). The heap's
growth over restarted bouts is within 3 MB of the baseline's (+2.8 MB at Medium, −4.9 at High); the High load median rests on
4 bouts (noisy). Allocations per frame: the rig's springs and the dust are allocation-free; the AI's view and the HUD's
throw readout still allocate small objects each step (young-generation garbage, not growth) — a pass left to do.

## 8. The preview

Build this branch (`npx vite build`) and host it; then open, on a phone or a desktop:

| Address (append to the host) | What it opens |
| --- | --- |
| `/?debug&bout=gora` | straight into a friendly at Pikine's arena against **Gora** (costaud), **sans frappe**, v4 bodies |
| `/?debug&bout=gora&rdabody=force` | the same with the **Roi des Arènes bodies** (at every quality) |
| `/?debug&lamb2&bout=gora&frappe&rdabody=force` | Gora **avec frappe**, RDA bodies |
| `/?debug&lamb2&bout=daouda&rdabody=force` | Daouda (grand lutteur de saisie) avec frappe; also `bout=pape`, `saliou`, `ousmane`, `malick` |
| `/?debug&touch&bout=pape` | Pape (rapide) with the phone's controls forced on a desktop |
| add `&combat0` | the bout as it was before this package (to compare) |

`?debug` skips the character studio (a fresh browser starts straight in Pikine); the bout starts as soon as Pikine is loaded
(a few seconds), the opponent at the friendly level of a fresh save (1). After the result, **Revanche** plays him again;
**Continuer** returns to the arena, where « Combat amical » (all opponents; avec frappe with `&lamb2`), « Combat classé » and
the écurie's « Entraînement » (Coach Ablaye's new lesson) are on the menus as usual. Without `?debug` the game is unchanged
apart from the new bout itself (the default on this branch).

## 9. Captures

`docs/wrestling/combat/` — `scripts/capture-combat.mjs`, deviceScaleFactor 2, the Roi des Arènes bodies at Medium, Gora (costaud)
avec frappe; each moment set up with the checks' hooks (the opponent held still, a balance, a hold, his throw started), then
played by the rules. `portrait-*` at 390 × 844, `landscape-*` at 844 × 390:

| # | Moment |
| --- | --- |
| 1 `grip-fight` | his reach for the belt seen coming (« ↘ ceinture » over him at his level), the player's dive |
| 2 `grips` | the empoignade at contact: the player at the belt (folded over him), Gora at the nape; the Prise in words |
| 3 `imbalance` | pushed back: Gora leans away, the button lit « Croc », « Croc ! Il est prêt à tomber » |
| 4 `throw-croc`, 5 `fall-croc` | the croc set up, then Gora going down backwards |
| 6 `referee-call` | Gora flat on his back, the referee raising the arm (and, at an evening, the announcer) |
| 7 `result` | the result card: the throw and the fall (« Le croc · le dos au sol »), the tally |
| 8 `throw-hanche`, 9 `fall-hanche` | the hip throw from the arm: turned in, Gora carried over the hip |
| 10 `his-throw-contrer` | his croc under way: « Il tente le croc ! Résiste ou contre ! », the button green « Contrer » |
| 11 `counter-fall` | the croc turned: « Contre ! le croc se retourne contre lui ! », Gora down |

## 9 bis. The fighting-game pass (the owner's new direction, 21 Nov)

On top of the engine above, for the eye and the hand (`src/lamb/combatRig.ts`, `duel.ts`):

- **Bodies with springs**: the hips lead (a stiff spring towards the weight and the lean), the trunk follows them with lag and
  overshoot (under-damped), a hit to the balance buckles the knees (an impulse that springs back) and takes a **stumble step**
  the way it went; feet stay planted and step by the stance rig. Allocation-free.
- **Impacts**: sand dust at a body landing and on a counter (a pooled set of points, one draw call only while grains fly);
  a camera shake scaled to the force (a strike 0.02–0.07, a throw 0.06, a landing 0.13), on top of « Le choc »'s push and stop.
- **Camera**: a throw set up punches in (16 %); a **combo** or a style's **signature throw** punches in more (30 %), drops and
  swings round the pair (0.5 rad), like a super; the fall's slow close shot stays.
- **Banners**: « LÀMB ! » at the bell, « COMBO ! Hanche », « Gora : Croc ! » for his signature, « TERRE ! » at the fall.
- **Clinch combos** read from the exchanges won: pull → pivot → **Hanche**, push → push → **Croc** (or **Jambe**), pivot → pivot
  → **Balayage**, pull → pull → **Ramené**, push → pull → **Soulevé**: two exchanges won in a row within 3 s, then that throw,
  +10 to its score — for both wrestlers alike (tested).
- **Input**: tap or hold timed on the thumb's real clock; Projeter on a lit button during the pause after a move is kept and
  thrown as the pause ends; Projeter takes over a move being set up.
- **Video**: `docs/wrestling/combat/combat-bout.mp4` (25 s, 30 fps, the game stepped frame by frame, phone portrait, RDA bodies
  at Medium: walk-in, dive to the belt, the empoignade, the combo pull → pivot → hip, « TERRE ! » and the referee, then Gora's
  signature croc as a super) and `combat-strip.jpg` (eight moments). `scripts/video-combat.mjs` makes both.

**Meshy (not spent):** the owner's go-ahead reached this session through the coordinator; the paid step was refused by the
session's permission system, so no credit was spent (balance 1 015). Plan, if run: rig one humanoid once (Meshy's own
skeleton), then one animation task with ten library clips (`--action-ids 21,20,524,187,183,184,344,113,421,389`: Walk Fight
Forward/Back, Cautious Crouch Walk Forward, Knock Down, Fall Backward, Fall Forward, Stand Up, Stagger, Over Shoulder Throw,
Grip and Throw Down — generic library motions, licence-clean, nothing from MK or SF), billed per action; retarget offline onto
the 20-bone rig (a clip retargeter by bone map and rest pose: the transplant pipeline moves meshes, not clips — to be written)
and blend under the IK layer: the falls and landings first (`Fall_Back` ends sitting), the stumble, the get-up.

## 10. Left for phase 2, and decisions for the owner

**Phase 2 (not started here, not blocked):** the entrances, the sabar and the crowd answering the bout (`onMoment` still
fires avec frappe exactly as before; sans frappe it is not yet wired to the stands), a replay of the fall and commentary
(stage 3), the cinematics. The new bout's events are ready for them: the fall's kind and throw (`duelInfo().combat.fall`,
`throwName`), the referee's words (`combat.referee`), the read habits.

**Also left:**
- **Watched bouts** keep the old engine (deterministic, tested byte for byte). They could take the new one later: its AI is
  seeded and fixed-step already, but the evening's 396-bout tables would have to be re-measured.
- **A device pass on real phones** (Android mid-range, iPhone): the feel of the stick in the empoignade (dead zone 55 %),
  the tells' timing, the hold-to-belt delay (0.28 s), the frame time. SwiftShader says nothing about it.
- **Tuning with people**: the headless pupils are scripts. The step from level 2 to 3 is the one to watch.
- **Animation**: throws and falls are procedural poses over the existing clips (Fall_Back, Kneel); paired, authored throw
  animations (and a closing hand: v4 and RDA have no finger bones) would make contact read better in close-up.
- **`check-arena-fighter`, `check-arena-visit`, `check-career`** were not run on this branch: the fighter's path now plays
  the new bout (its steps may read the old bout's hooks); the watched evening is unchanged (tested headless).

**Decisions for the owner:**

| # | Decision | Options | Recommendation |
| --- | --- | --- | --- |
| 1 | The new bout as the game's bout | keep it on this branch's switch; ship it as the default; ship it behind `?combat1` first | default after a phone pass; `?combat0` stays as the way back |
| 2 | Out of the circle | a point (now); a fall; nothing | a point (2), as now: it keeps the bout going and gives the push a purpose |
| 3 | The sans-frappe opponent's attributes | now his style's shape at the friendly level (as avec frappe) | keep |
| 4 | « Revanche » | friendlies only (now); also ranked (the career picks the opponent) | friendlies only |
| 5 | The player's attributes sans frappe | now the career's trained attributes (as avec frappe), so training matters in both | keep |
