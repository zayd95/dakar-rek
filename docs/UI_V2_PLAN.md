# UI V2: design study and work plan (no code yet)

Base: `origin/lane/w5-candidate` at 00886a2. UI V2 starts only after wave 5 is validated. It is then built on an
isolated branch cut from the validated state, in the small playable steps of §7.

Habib's brief, in short: improve what exists; don't rebuild the game or the interaction system. The look is premium,
compact and discreet (night-blue / charcoal surfaces, light transparency, high contrast), because the 3D world is the
attraction. The plan covers:
- a four-entry dock (Carte · Personnes · Téléphone · Vues);
- three camera views;
- an eye button that hides the non-essential UI;
- a smart HUD;
- contextual actions;
- consistency everywhere;
- one playability case that must never leave the player stuck.

Not in scope: onboarding, police, BRT, advanced construction, new districts, car models, background NPCs.

---

## 1. What exists, and its role in V2

### 1.1 `src/ui`

| Piece | Today | V2 role |
| --- | --- | --- |
| `hud.ts` `Hud` | Builds `#ui`, with these parts:<br>• `#stats`: wallet, need rings, tap for bars<br>• `#place`: hub, weekday and time, « Gala ce soir »<br>• `#menuBtn`: the phone<br>• `#goal`: one suggestion, compass, distance<br>• `#sceneTag`<br>• `#wprompt`: the bubble<br>• `#joy` and `#hint`<br>• `#progress`<br>• `#actbar` (`#act` and `#actMore`)<br>• `#temp`, `#toast`, `#fade`, `#modal`<br>It also handles the touch zones (`setupTouch`), toasts, the moment and after-bout cards, and the sheets. | Stays the HUD's single owner. It gains three things: the dock (`#dock`), the eye (`#eye`) and the `ui-min` state; see §3. `#menuBtn` disappears, because the phone moves into the dock. `#place` becomes the centre cartouche. `#stats` stays top-left. `#goal` becomes collapsible. `#temp` moves out of the bottom centre (the dock takes it). |
| `sheet.ts` `Sheet` | The one `#modal`, in two forms: `menu` (bottom sheet on a phone, side sheet in landscape, card on desktop) and `quick` (the « ⋯ » grid). | Unchanged in behaviour and restyled dark. It is the one « compact sheet » of point 6. Personnes, Vues (on a phone) and Carte's place list reuse it. |
| `worldMarkers.ts` | The 3D focus ring (grey when nothing can be done) and the way-finding pin. | Kept. The ring stays even with the UI hidden, because it is how the player knows what the action will act on. The pin is hidden with the UI. In the high view, a small « toi » ring under the player marks where they are. |
| `stride.ts` + `stride.css` | `#stamina` gauge (bottom centre) and the touch « Courir » toggle `#runBtn` (left 168 px). | Kept. On desktop `#stamina` moves above the dock: it sits at 64 px today, where the dock will be. « Courir » is an essential control: it stays visible with the UI hidden, but only on touch and only while moving. |
| `gesture.ts` + `gesture.css` | `#gesture` card for the trades' gestures, bottom centre (150 px up on a phone, 52 vw wide in landscape). | Kept and restyled. While it shows, the dock hides: the player is in an activity (`mode === 'busy'`). |
| `journal.ts` | `journalView` for the phone's Carnet. | Kept as the phone's Carnet. The collapsible objectives (point 5) read the same data (`suggestion`, `homeGoalLine`). |
| `phone.ts` + `phone.css` + `phoneHooks.ts` | The character's phone: apps grid, its own little dock, Carte (a hub list with fares and remembered places), Ce soir, Arène, Profil, Réglages… z-index 40; `lock()` drives mode and input. | Dock entry « Téléphone ». Kept. The phone's own internal dock keeps Portefeuille, Carnet and Réglages. Carte stays one of its screens but opens from the dock (§2.1). |
| `style.css` | Tokens (`--surface` 94 % white, `--ink`, `--sun`, `--warn`, `--sa-*`) and every component. | The V2 skin is mostly here. The tokens are redefined for dark (`--surface: rgba(16,22,34,.82)` night-blue/charcoal, ink `#f2f4f8`) and every contrast is kept ≥ 4.5:1. The dark legacy tokens (`--card`, `--gold`…) merge into it. |

### 1.2 The map

There is no drawn map today. The phone's **Carte** screen (`Phone.mapHtml`) lists:
- the four hubs, with the car rapide fare and duration (`travelLeg`);
- the places already seen in each hub (`PLACES_KEY`, kept on the device);
- a button « Choisir un repère à pied » that opens `openPlaces` (main.ts), a sheet of the hub's `:city:` places sorted by distance.

Picking a place sets `destination`, and the pin and the goal line then lead to it. Travel itself happens at each hub's
gare (`kind: 'travel'`, `openTravel` / `doTravel`).

**In V2**, dock entry « Carte » opens the same Carte screen, with one new piece on top: a small SVG plan of the current
hub (§2.1). The hub list, fares and « repère » logic stay as they are.

### 1.3 People and relations

| Piece | Today |
| --- | --- |
| `src/social/relations.ts` `Relations` | Levels −100…100 per pair, `label()`. |
| `src/social/npcLife.ts` `openPeople` / `openSheet` | « Les gens du quartier »: the people met, where they are now, what they remember of the player. Reached from phone › Habitants (`phoneHooks.openPeople`). |
| `src/social/cast.ts`, `profiles.ts`, `memory.ts`, `routines.ts` | Who they are, their days, their memories. |
| `src/multiplayer/ui.ts` `PresenceUi` | `#presenceBtn` (top right): status, profile, invite link. |
| `src/multiplayer/chat.ts` `ChatUi` | `#chatBtn` (top right, 114 px) and the chat panel: near, DM, quick phrases. |
| `src/multiplayer/avatars.ts` | Remote players and their name tags. |

**In V2:**
- Dock entry « Personnes » opens one sheet with two segments (the existing `.seg` block): **Habitants** (the
  `npcLife.openPeople` rows) and **Joueurs** (presence peers: name, public `rec` line, distance, « Écrire » opens the
  chat in DM).
- The top-right cluster keeps only presence status and chat (point 5).

### 1.4 Cameras

In `main.ts` the camera is decided in this order every frame:
1. the làmb scene or duel (`lambScene.update` → `f.cam` / `f.look`);
2. the modules' `camera()` hooks (`MODULES.some(m => m.camera?.(…))`);
3. otherwise `follow.update(…)`;
4. then the debug overrides: `camOverride` (`__dakar.portrait`) and `freeCam` (`__dakar.cam`).

| Camera | File | What it does | V2 role |
| --- | --- | --- | --- |
| Follow cam | `src/actors/camera.ts` `FollowCamera` | Third person:<br>• walls are sampled (`clearFraction`);<br>• leaves and awnings are `HubWorld.canopies`;<br>• `pullClear` keeps 0.9 m around the lens;<br>• in tight spots it swings or lifts;<br>• indoors it is clamped to `cameraBox`, y ≤ 2.6;<br>• `groundAt` keeps it above stairs and terraces;<br>• the player's drag always wins. | View 1, **Troisième personne**, unchanged. It becomes one of three rigs behind a small `ViewRig` switch. |
| Vehicle cams | `src/transport/camera.ts` `PassengerCamera`, used by `transport/module.ts` (car rapide), `taxi.ts` and `ownedModule.ts` (own car, moto) | Anchors per vehicle spec (`cameras: CameraAnchor[]`, each with a `label`). The kit already has a chase view (« Derrière la voiture »), an inside or seat view (`inside: true`: the body is hidden) and « Vue d'en haut ». Pulled in front of walls (`clearOfWalls`). Cycled by the « Changer de vue » affordance (`cam.next`). | In a vehicle, the **Vues** selector maps onto these anchors: third → chase, first → the `inside` / `seat` anchor, high → `haut`. No new vehicle camera. |
| Arena seat cam | `src/arena/module.ts` `ArenaEvening.camera` | The spectator's own eyes, body hidden, narrower FOV, drag ±80°. | Already first person. While seated in the stands, Vues shows « Tribune » (this view) and greys the others with the reason; stand up to change. |
| Duel / scene cam | `src/lamb/duel.ts`, `scenes.ts` (src/lamb: another agent owns it) | Its own camera from `update()`. | Vues hidden during the duel (`body.induel`) and scenes (`body.inscene`). Not touched. |
| Home editor cam | `src/economy/homeEditor.ts` `camera()` | Top-down over the room while placing (Aménager); ceiling fixtures hidden (`HomeView.ceiling`). | Unchanged. The dock hides while the placer is open, and the editor's way of hiding the ceiling is reused by the indoor high view (§2.3). |
| `freeCam`, `camOverride` | `main.ts` (debug only) | The checks' framing. | Kept for the checks. The high view is a new rig, not `freeCam`. |
| Occluders | `nearOccluders`, `clearFraction`, `crowded`, `pullClear`, `underLeaves` (`camera.ts`); `canopies` from `builder.ts` (trees, palms, shop awnings, stall parasols) | | Reused by the high view's line-of-sight check (§2.3). |

### 1.5 Touch zones and controls

- **Joystick.** `#joy` is a floating joystick: a finger anywhere in the left 45 % moves its base under the finger. It
  is shown on touch, and also during the duel (`body.induel.touch #joy`).
- **Camera drag.** The right 55 %; on desktop, the mouse drag (`Input`) plus Q / R.
- **Excluded from both:** `setupTouch` ignores touches that start on
  `#act,#actMore,#actbar,#menuBtn,#modal,#stats,#wprompt,#sceneTag`. The phone, the placer, the moment cards and the
  presence button stop the pointerdown themselves.
- **Action bar.** `#act` is the primary verb, with its price or reason. `#actMore` opens « ⋯ ». Tapping `#wprompt` (the
  bubble) also acts.
- **« Courir ».** `#runBtn` sits right of the joystick, shown on touch while free to walk.
- **Duel.** `.duel-btns` (five round buttons, bottom right) and its HUD (`src/lamb/duel.ts`, restyled from
  `style.css`).
- **Keyboard:**
  - ZQSD / WASD / arrows to walk; Shift to run;
  - E / Enter / Space to act;
  - Escape / M opens the phone or stops what runs (`takeMenu`);
  - Q / R to turn the camera.
- **Modes:** `mode` is `'play' | 'menu' | 'busy' | 'scene'`. `input.enabled` is set in 21 places in main.ts, through
  `ctx.setMode`, `ctx.menu`, `phone.lock`, the `#modal` MutationObserver, `endScene`, `doTravel` and the legacy runner.
  The MutationObserver gives movement back whenever a sheet closes in menu mode.
- **z-order today:** `#wprompt` 1 · `#place`, `#menuBtn` 2 · `#stats`, `#actbar`, `#progress` 3 · chat panel 5 ·
  `#modal` 20 (the placer and `#runBtn` are also 20) · `#toast` 22 · `#fade` 25 · `#gesture`, `.duel-ui` 30 ·
  `#phone` 40.

---

## 2. Points 2–8: files, new pieces, risks

The new pieces are kept to five:
- `#dock` (DOM in `hud.ts`);
- `#eye` (DOM in `hud.ts`);
- `src/ui/views.ts`: the view rigs and their context rules (pure where possible);
- `src/ui/mapPlan.ts`: the hub plan as SVG text (pure);
- a `ceiling` tag on interior ceiling meshes.

Everything else is a change to an existing piece.

### 2.1 Point 2: the dock (Carte · Personnes · Téléphone · Vues)

- **Files:**
  - `hud.ts`: builds `#dock`; removes `#menuBtn`; adds `onDock(entry)` callbacks; adds `#dock` to the `setupTouch`
    exclusions.
  - `main.ts` wires the four entries:
    - Carte: `phone.open('carte')`;
    - Personnes: the people sheet (§1.3);
    - Téléphone: `phone.open()`;
    - Vues: §2.3.
  - `style.css`.
  - `phone.ts`: the Carte screen gets the plan; `phone.remember` is unchanged.
  - `npcLife.ts`: `openPeople` gains the Joueurs segment through a hook. No new state.
- **Layout:**

  | Where | Size and place | Behaviour |
  | --- | --- | --- |
  | Desktop | Dark pill, bottom centre, 4 × 44 px icons with short labels on hover-free text, `bottom: 16px` | No joystick. `#stamina` moves to `bottom: 84px`; `#temp` moves top right under the social cluster. |
  | Phone, landscape | Bottom centre, between the joystick plus « Courir » (≤ 226 px) and the action column (≥ 76 vw) | The free span is about 400 px at 844 wide. |
  | Phone, portrait | Bottom centre, just above the controls row, `bottom: calc(var(--sa-b) + 140px)` | The bottom 130 px are taken by the joystick, « Courir » and the action button. While the joystick is held, the dock shrinks to 32 px icons at 60 % opacity (hit area kept at 44 px through padding) and comes back 1 s after release. |
  | All | Hidden in `busy` / `scene`, during the gesture card, the placer, the duel and the phone | `body.inscene`, `body.induel`, `body.sheet-open` already exist. |

- **The plan (new, `mapPlan.ts`).**
  - The current hub drawn as SVG text from data already there: the block grid (`BLK`/`PITCH`/`ROAD` from
    `builder.ts`, as `estate.ts` uses them), `world.interactables` (`:city:` places, the gare), the car rapide stops
    (`transport/stops.ts`), the player and the pin.
  - Tapping a place sets `destination` (the existing `walkTo` path).
  - It is pure and unit-tested (positions and scaling), and costs no draw call.
- **Risks:**
  - The phone opening from the dock goes through `phone.lock(true)` as today, so mode and input are unchanged.
  - The Personnes sheet uses `ctx.menu` (mode `menu`); closing it is covered by the MutationObserver.
  - The dock must sit under `#modal` (20) and `#toast` (22): z 4.
  - Safe areas: `bottom: calc(var(--sa-b) + …)`, `left`/`right` from `--sa-l`/`--sa-r`.
  - On iOS the home bar needs `--sa-b`.
  - With the browser's URL bar, `#ui` is `position: fixed; inset: 0`, which follows the dynamic viewport in current
    Chrome and Safari. The check must include a scrolled URL bar (`visualViewport` resize).

### 2.2 Point 4: the eye button

See §3 for its state machine.

- **Files:**
  - `hud.ts`: `#eye`; the `ui-min` class on `body`; `setMinimal(on)`.
  - `style.css`: the `body.ui-min` rules.
  - `main.ts`: the H key; Escape restores before opening the phone.
  - `worldMarkers.ts`: hides the pin under `ui-min`.
  - `multiplayer/avatars.ts`: hides name tags under `ui-min`.
- **Placement:** the top-right corner, where `#menuBtn` is today, at 44 × 44 px with the safe area. The social cluster
  sits to its left (desktop, landscape) or under it (portrait). It is never in the dock.
- **Risks:**
  - Hidden elements must not take taps or focus: `visibility: hidden` plus `pointer-events: none`, so touches on their
    place fall through to the joystick or camera drag, which is the intended behaviour.
  - The eye's z-order is 19, just under `#modal`. With a sheet open, the dimmed backdrop covers it and closing the sheet
    is the way back. That way it never fights the sheet's « tap outside ».
  - Toasts: info toasts are hidden under `ui-min`; `warn` toasts (refusals, « Pas assez d'argent ») still show, because
    they are answers to the player's own action.

### 2.3 Point 3: Vues (three views)

- **Files:**
  - `src/ui/views.ts` (new).
  - `main.ts`: the frame's camera block calls `views.update(…)` instead of `follow.update(…)` when no scene or module
    takes the camera, and it hides `playerBody` in first person.
  - `actors/camera.ts`: `FollowCamera` is untouched; the first-person and high rigs live beside it.
  - `transport/*`: the anchor mapping, through a `viewAnchor(kind)` helper on `PassengerCamera`'s owners.
  - `arena/module.ts`: `viewContext()` returns 'tribune' while seated.
  - The interior builders (`world/interiors.ts`, `world/shopKit.ts` room, `economy/estate.ts` homes, venues with
    interiors) tag their ceilings and hanging fixtures `userData.ceiling = true`. A ceiling inside a merged mesh is split
    into its own mesh: +1 draw call for the one interior visible at a time.
- **The three rigs:**
  - **Troisième personne:** the current `FollowCamera`.
  - **Première personne:**
    - Eye at head height (1.62 m standing, the seat's eye when seated); yaw and pitch from the drag, the stick or Q / R.
      Walking goes where the camera looks.
    - The body is hidden (as on a car rapide seat). The near plane drops from 0.3 to 0.06 while it is on: the push-out
      radius (0.3 m indoors, 0.5 m outdoors) keeps the eye at least that far from any collider, so 0.06 never shows the
      inside of a wall.
    - Ceilings: rooms are 2.9 m high, so the eye is far under them.
    - Interiors are « truly explorable »: the same rooms, walls and colliders. The tight 4–4.6 m room camera stops
      hiding corners.
  - **Vue haute (free high view):**
    - Orbits the player at 14–40 m (25 m maximum on the low preset), pitch 35°–70°.
    - Drag turns it; pinch / wheel / « + − » zoom it. The « + − » buttons sit in the Vues popover, so there is no
      two-finger gesture to add to `setupTouch` on a phone.
    - The player keeps walking: the stick moves them relative to the view's yaw.
    - A `clearFraction` check from the head to the eye: when a tall building hides the player, the « toi » ring and a
      thin outline show through (worldMarkers, `depthTest: false`).
    - **Indoors:** the camera is placed above the room like the home editor's. The ceiling meshes and hanging fixtures
      are hidden while it is on and restored when it leaves. That is the « roofs hidden smartly » of the brief.
      Outdoors the roofs stay, because the view is above the city.
- **Transitions:** 0.35 s ease of position, look and FOV between rigs (the exponential lerp the follow cam already
  uses). The body fades or hides at the end of the move into first person and shows at the start of the move out.
- **Context (pure, `views.ts`, unit-tested):**

  | Context | Third | First | High |
  | --- | --- | --- | --- |
  | Street, home, shop, bank, gargote, La Vague | follow | eye | orbit (indoors: room from above, ceiling hidden) |
  | Car rapide, taxi, own car or moto | chase anchor | `inside` / seat anchor (if the spec has one, else greyed: « Pas de vue de l'intérieur ») | `haut` anchor |
  | Seated in the arena stands | greyed: « Lève-toi pour changer de vue » | « Tribune » (the arena's own) | greyed |
  | Duel, làmb scene, Aménager (placer), activity with its own camera | Vues hidden: the context's own camera (combat, editor) is kept | | |

- **Keys:** V cycles the views. It is ignored while `lambScene` runs, because the duel's own V is a strike key.
  Escape closes the popover.
- **Risks:**
  - FOV: the arena seat changes `cam.fov` and restores it. The rigs must leave FOV alone except during the transition
    (the arena stores `baseFov` on its first seated frame).
  - Vehicles:
    - hand-over: `PassengerCamera.begin()` starts from the current camera, so a first-person camera handing over to a
      vehicle is smooth;
    - getting off returns to the view chosen on foot;
    - the body-hiding rule must not fight `a.inside` (one owner per frame: whoever drove the camera hides the body).
  - First person and NPC LOD: the camera at the player brings near people closer, so `crowdLod` keeps more full
    humanoids within its fixed count. That is a cap, not a rise. Measure it.
  - The high view widens the frustum. See the budget in §7, step 6.
  - Saves are unaffected: `saveNow` reads `pos`, not the camera.

### 2.4 Point 5: the smart HUD

- **Files:** `hud.ts`, `style.css`, `main.ts` (where `setPlace` gets the weather).
- **Top left:** `#stats` (wallet plus five rings).
  - It is already collapsible (tap shows bars; the state is remembered).
  - Under `ui-min` it collapses to one critical chip: the lowest need under 25 %, pulsing, tappable to show the bars.
    « Critical needs easy to spot » works even when hidden.
- **Centre cartouche:** `#place`, with the hub's first name, weekday and time, the gala tag, and a weather glyph from
  `src/city/weather.ts` `weatherNow` (sun, cloud, rain; « Pluie » in the label for screen readers).
- **Top right:**
  - presence (`#presenceBtn`) and chat (`#chatBtn`), restyled into one cluster; they are positioned by
    `PresenceUi.position()` from `#place` today and get one shared slot instead;
  - the eye in the corner;
  - `#temp` under the cluster.
- **Objectives:**
  - `#goal` gets a chevron to collapse it to its badge (the compass keeps turning). The state is per device.
  - It is contextual by the rules it already follows: hidden while watching an arena show (`arenaShow.watching`), one
    line while a ride card shows.
- **No overlap:**
  - Toasts sit under the cartouche and above sheets (the rules exist).
  - The gala card and the ride card keep their slot under the cartouche.
  - The dock sits under the action column's top on a phone.
  - Bottom elements get `max-height: calc(100dvh − …)` and the `visualViewport` lift that the sheet already uses for
    the keyboard.
- **Risks:**
  - `#goal`'s top is computed for each orientation. Collapsing must not move `#toast`, which is positioned by `top`, not
    by flow.
  - The duel hides `#stats`, `#place`, `#goal` and `#menuBtn`. `#dock` and `#eye` are added to that list in the duel's
    rule, through `style.css` (`body.induel #dock, body.induel #eye { display: none }`), so src/lamb is not touched.

### 2.5 Point 6: contextual actions

- **Reuse:** `interactions.focus` / `primary` / `all`, `hud.setPrompt`, `setWorldPrompt` (the bubble, with the reason
  card from wave 5), `openQuick` (the « ⋯ » grid), the sheets.
- **Changes:**
  - Dark restyle.
  - A key for « ⋯ »: F. It is free today; `Input` maps E/Enter/Space/Escape/M/Q/R/ZQSD/arrows/Shift.
  - Hover is used only by `title` attributes, so nothing essential depends on it.
  - Touch: the bubble, the button and the grid are all ≥ 44 px.
- **Under `ui-min`:**
  - `#act` (and « ⋯ ») appears only when a target is in focus or something runs (« ✋ Arrêter »).
  - The bubble stays: it is in the world.
- **Risks:**
  - `#act` hides with the `off` class when nothing is in reach. Under `ui-min` it must still appear for « Descendre »
    (vehicles) and « Arrêter », which come through `setPrompt` like any other target, so nothing special is needed.
  - Check that `.dis` reasons stay readable on the dark surface (`--warn` on charcoal: use `#ff8a80` for ≥ 4.5:1).

### 2.6 Point 7: consistency (what shows where)

| Context | Dock | Eye | Action | Others |
| --- | --- | --- | --- | --- |
| Street | yes | yes | target's verb | goal, pin, cartouche |
| Home / Aménager | yes / hidden (the placer owns the bottom) | yes / yes | verb / the placer's buttons | the placer panel, z 20 |
| Shops, bank (sheets) | under the sheet | under the backdrop | sheet rows | the sheet |
| Taxi, car rapide, own car or moto | yes (Vues = anchors) | yes | « Descendre », « Changer de vue » | ride card under the cartouche, delivery card |
| La Vague | yes | yes | door fee, dance (gesture card: dock hidden) | sheets |
| Arena (street, gate, window) | yes | yes | ticket sheet (wave 5) | gala card |
| Arena stands | yes (Vues = Tribune) | yes | « Se lever », « Encourager » | gala card, after-gala cards |
| Combat (duel) | hidden | hidden | the duel's own buttons | duel HUD (wave 5 gauges) |
| Làmb scene | hidden | hidden | « ✋ Arrêter » on the scene banner | |

### 2.7 Point 8: the playability case

See §4.

---

## 3. The eye: state machine and every way out

Two states for the non-essential UI: **SHOWN** (default) and **MIN** (`body.ui-min`). The eye button itself is never
hidden by MIN.

| From | Event | To | Notes |
| --- | --- | --- | --- |
| SHOWN | tap / click the eye, or H | MIN | Hides the dock, the cartouche, top-right social, `#goal`, the pin, name tags, info toasts, the gala and ride cards, `#hint`, `#temp`. `#stats` collapses to the critical chip when a need is under 25 %. |
| MIN | tap / click the eye, or H | SHOWN | |
| MIN | Escape (nothing running, no sheet, no phone) | SHOWN | Escape's first job in MIN is to bring the UI back; the next Escape opens the phone as today. |
| MIN | M | phone opens (MIN kept) | Explicit request: the phone shows. On close, back to MIN. |
| MIN | an interaction opens a sheet (shop, ticket, people) | sheet shows (MIN kept) | The sheet is an answer to the player. Closing it returns to MIN, with control restored by the existing MutationObserver. |
| MIN | a target comes into reach, an activity runs, a vehicle is boarded | MIN | `#act` appears for that target, « Arrêter » or « Descendre ». `#joy` keeps appearing under the finger and `#runBtn` while moving (touch). |
| MIN | duel or làmb scene starts | MIN (eye hidden by `body.induel` / `inscene`) | The scene's own controls (duel buttons, « Abandonner », « ✋ Arrêter ») are the way out. At its end the eye shows again in MIN. |
| any | page reload | SHOWN | Not persisted, so nobody comes back to a bare screen without knowing why. |
| MIN | 0 interactions for a long time | MIN | No auto-restore. The eye is always on screen, so none is needed. |

The invariants are what the checks assert:
1. In `play`, `busy` and `vehicle` the eye is visible, on screen, ≥ 44 px, and not covered by any HUD element.
2. MIN never changes `mode` or `input.enabled`: it is CSS only.
3. Under MIN a touch on any hidden element's place reaches the joystick or the camera drag.
4. Every state above has its way back in the table.

---

## 4. The Almadies case: 58 F, 0 % energy

### 4.1 What that player can do today (traced in the code)

- **Walk.** Zero energy blocks running only (`src/game/stride.ts`: `RUN_MIN_ENERGY`, « Trop fatigué pour courir »).
  Nothing else happens at 0 %: `GameState.tick` only drains, and no fainting rule exists.
- **Rest for free.** At « Place des voisins · Ngor » (`world/city.ts`, Almadies block 3,2 is a `square`), the action
  « Se poser à l'ombre » (`cityContent.ts` `square.banc`) gives +10 energie and +6 moral in 4 s. It is free, has no
  requirement and no limit.
  - Sitting on a public bench (« S'asseoir », the seat registry) gives nothing: only that action rests.
- **Sleep.** Only in a home the player lives in. The starter room is in Pikine (`STARTER_HOME`, `interiors.ts`
  « Dormir » +70; owned homes `estate.ts` `P.sleep`). There is no bed in Almadies unless they own or rent one there.
- **Buy energy.**
  - Café Touba, 100 F (+8; street vendors 6–11 h and 16:30–23 h, `city/vendors.ts`).
  - Jus de bouye, 500 F (+5, Jus & Go).
  - With 58 F, only a « Sachet d'eau » at 50 F (no energy).
- **Travel to another hub.** Only from the gare (« Car rapide · changer de quartier », `openTravel`), and paid:
  Almadies → Corniche 1 000 F, → Plateau 1 500 F, → Pikine 2 000 F (`world/content.ts` legs).
  - Ligne 31 (inside Almadies) costs 200 F. Taxis cost more.
  - There is **no free way** between hubs.
- **Paid work in Almadies.** Every job has an energy floor (`cityContent.ts` `energy(n)`: « Repose-toi avant ce
  service »):

  | Job | Place | Pay | Energy floor |
  | --- | --- | --- | --- |
  | Aider à préparer une commande | Style Rek | +1 800 F | 16 |
  | Aider à préparer les commandes | Ndar Tech | +2 000 F | 17 |
  | Ranger les arrivages | Maison Dakar | +2 100 F | 19 |
  | Installer les stands d'une exposition | Dakar Life Mall | +2 800 F | 22 |

  - Tiak Tiak deliveries, the low-energy work (minEnergy 8, −6 per run), exist only in Pikine and Plateau
    (`economy/config.ts` route ids `pk_*`, `pl_*`).
- **So the player is not stuck, but only by a path nothing points to:** two « Se poser à l'ombre » (20 energie), then
  « Aider à préparer une commande » at Style Rek (+1 800 F, energie back to 4), repeated. After two rounds they can pay
  Corniche; after three, Pikine and their bed.

### 4.2 The real holes

1. **The goal line points away.** With no delivery done yet, `economyStep` returns « Gagne ta vie : prends une
   livraison Tiak Tiak à la Gargote Mame Diarra (Pikine) » (`economy/progress.ts`) for every hub but Plateau. In
   Almadies or Corniche that is another hub, 1 000–2 000 F away, which the player can't pay. Nothing in the goal line
   reacts to a critical need.
2. **No free way to travel between hubs.** Below 1 000 F a player in Almadies can't leave until they earn. The brief
   asks for a free way.
3. **Rest is undiscoverable.** The only free energy (« Se poser à l'ombre ») sits on one place of the hub. The tired
   work refusals say « Repose-toi avant ce service » without saying where. Phone › Santé says « Dors dans ta chambre ou
   repose-toi à l'ombre » without a place.
4. **Public benches don't rest** (minor). « S'asseoir » on the mall's benches gives nothing, unlike the square's action.

### 4.3 Minimal fixes (no new needs system, no new beds)

- **For hole 1 (pure, unit-tested).** A needs-first goal: when energie < 15, or faim < 10 with money for food, and no
  delivery or fighter path is on, the goal line becomes, for example, « Fatigué : repose-toi à l'ombre — Place des
  voisins · 120 m ». It names the nearest place in this hub with a rest action, with the way-finding target. In the
  home hub it says « Dors dans ta chambre ». `goal_tiak` names the hub's own pick-up, or Petits boulots when the hub has
  no Tiak Tiak.
- **For hole 2, two options (Habib chooses):**
  - **(a) recommended:** « Se faire dépanner par l'apprenti », a free car rapide ride once per city day when the
    wallet can't pay the leg. It is stored in a counter (`depanne_day`, no schema change), takes the usual duration, and
    the apprentice gets a line.
  - **(b)** « À pied » at no cost: 3 × the duration, energy ≥ 10 required, the needs drained by the time.
- **For hole 3.** The refusal of tired work appends the place: « Repose-toi avant ce service · Place des voisins, « Se
  poser à l'ombre » ». Santé lists the hub's rest spot.
- **For hole 4 (optional, Habib).** On a public bench or chair (not vehicle, not stand seats), energie +1 every
  20 played seconds while seated, capped at 40 %. It is cheap and reuses the seated loop in main.ts.

These fixes come first in the order (§7, step 1): they are logic, unit-testable, and independent of the skin.

---

## 5. Risks across all points (summary)

- **`mode` / `input.enabled`.**
  - The dock opens only things that already manage the mode (phone `lock`, `ctx.menu` sheets).
  - The eye and the views never touch either.
  - Vues changes the camera only in `play` (on foot) or as a vehicle anchor while riding.
- **z-order.** The new layers are:
  - dock 4;
  - eye 19 (under `#modal` 20 and `#toast` 22);
  - the Vues popover 21 (above the dock, under toasts).

  The phone (40), gesture (30), duel (30) and fade (25) stay above them all.
- **Safe areas.** Every new element uses `--sa-*`. The portrait dock lift is computed from the controls row, not a
  fixed number.
- **Duel HUD.** `body.induel` already hides the city HUD. The dock and eye join that rule in `style.css`; src/lamb is
  not touched.
- **Arena seats.** The seat camera is the arena's; Vues only reports it. The goal and gala card rules already exist.
- **Vehicles.**
  - Views map to existing anchors.
  - The body is hidden by whoever drives the camera that frame.
  - Getting off restores the on-foot view.
- **Interruptions.** On `blur` / `visibilitychange`, `hud.resetTouch` and `Input.reset` already run. The dock's
  « shrink while moving » state is reset there too, so it never stays shrunk after a phone call.

---

## 6. Validation the coordinator runs (point 9) and how it maps

| Validation | Script |
| --- | --- |
| Dock, eye always recoverable, the three views, touch resuming, moving with the HUD hidden | new steps in `check-ui.mjs`: desktop, phone portrait, phone landscape, plus a `visualViewport` resize |
| Interactions near buildings and NPCs | `check-interact.mjs`, `check-npc.mjs` |
| Interiors and roofs | `check-ownership.mjs` (homes, Aménager), `check-shops.mjs`, `check-venues.mjs` |
| Saves and travel | `check-phone.mjs` (Carte), `check-transport.mjs`, `check-taxi.mjs`, `check-car.mjs`, `check-moto.mjs` |
| No regression: arena, shops, transport | `check-arena-visit.mjs`, `check-arena-fighter.mjs`, `check-lamb2.mjs` (LAMB2=1), `check-shops.mjs`, `check-transport.mjs` |
| Frame rate on a phone | `check-perf-evening.mjs` (draw calls and JS ms per preset) plus a new « high view » moment |
| Before / after screenshots | `scripts/shots-ui.mjs` → `docs/screenshots/ui/`: the same frames before (wave-5 validated head) and after each step |

---

## 7. Work order: small playable steps

Each step is one PR-sized commit set, green on tsc, server typecheck, vitest and build, then queued.

The baseline budget is `docs/PERF_EVENING.md`: whole frame, gala evening, low ≤ 180 / medium ≤ 300 / high ≤ 420 draw
calls, JS update ≤ 4 / 6 / 8 ms. DOM-only steps must add 0 draw calls and stay under 0.05 ms per frame of JS: they write
the DOM only on change, as the HUD does now.

| # | Step | Files | Checks to queue | Budget |
| --- | --- | --- | --- | --- |
| 1 | **Playability holes** (§4.3): needs-first goal; dépanne or à pied; refusal names the rest place; (optional) bench rest | `economy/progress.ts` or `social/beats.ts` (goal), `main.ts` `openTravel`/`doTravel`, `cityContent.ts` `energy()`, `phone.ts` Santé | vitest (pure goal and travel rules); `check-life-loop.mjs`, `check-economy.mjs`, `check-transport.mjs`, `check-phone.mjs` | 0 draw calls; < 0.01 ms (the goal runs at 4 Hz) |
| 2 | **Dark skin** (tokens and every component, no layout change) | `style.css`, `phone.css`, `gesture.css`, `stride.css`, `multiplayer/*.css`, `transport.css`, `economy.css` | `check-ui.mjs` (contrast and targets), `check-phone.mjs`, `shots-ui.mjs` before / after | 0 / 0 |
| 3 | **Dock** (four entries; phone button removed; desktop, landscape, portrait; shrink while moving) plus Personnes' two segments | `hud.ts`, `main.ts`, `npcLife.ts`, `style.css` | `check-ui.mjs` (dock steps), `check-phone.mjs`, `check-chat.mjs`, `check-npc.mjs`, `check-lamb2.mjs` (duel hides it) | 0 / ≤ 0.05 ms |
| 4 | **Eye** (state machine §3, H, Escape, the critical chip) | `hud.ts`, `main.ts`, `worldMarkers.ts`, `multiplayer/avatars.ts`, `style.css` | `check-ui.mjs` (MIN: walk, run, drive, interact, every way out, touch after blur), `check-interact.mjs`, `check-transport.mjs` | 0 / ≤ 0.05 ms |
| 5 | **Smart HUD** (cartouche weather, social cluster, collapsible goal, no overlap with `visualViewport`) | `hud.ts`, `main.ts`, `style.css`, `multiplayer/ui.ts`, `chat.css` | `check-ui.mjs`, `check-chat.mjs`, `check-arena-visit.mjs` (gala card and toasts), `check-taxi.mjs` (ride card) | 0 / ≤ 0.05 ms |
| 6 | **Vues: first person and the switch** (on foot; body hidden; near plane; transitions; vehicles mapped to their anchors) | `ui/views.ts` (new), `main.ts`, `transport/*` (anchor lookup), `arena/module.ts` (context) | `check-ui.mjs` (views), `check-interact.mjs` (near walls and NPCs), `check-ownership.mjs` and `check-shops.mjs` (interiors), `check-car.mjs`, `check-moto.mjs`, `check-arena-visit.mjs` (seat), `check-perf-evening.mjs` | first person ≤ third person + 5 draw calls (body hidden saves 3–8; near-LOD capped); JS ≤ 0.1 ms |
| 7 | **Vues: high view** (outdoor orbit, zoom, line-of-sight ring; indoor room from above with ceilings hidden) | `ui/views.ts`, `worldMarkers.ts`, the interior builders (ceiling tags) | `check-ui.mjs`, `check-ownership.mjs`, `check-shops.mjs`, `check-venues.mjs`, `check-perf-evening.mjs` with a « high view » moment on each preset | ≤ the preset's total (low 180, medium 300, high 420); if over, cap the altitude per preset (low 25 m). Shadows stay ±60 m around the player. JS ≤ 0.1 ms; ceilings +1 draw call for the visible interior only |
| 8 | **Carte plan** (SVG of the hub, tap a place to set the pin) | `ui/mapPlan.ts` (new, pure), `phone.ts`, `phone.css` | vitest (plan geometry); `check-phone.mjs`, `check-city.mjs` | 0 / only while the phone shows |
| 9 | **Contextual actions polish** (F for « ⋯ », MIN rules, dark reasons) and the consistency pass (§2.6) | `hud.ts`, `main.ts`, `style.css` | `check-interact.mjs`, `check-ui.mjs`, `check-venues.mjs`, `check-arena-visit.mjs`, `check-shops.mjs`, `check-business.mjs` | 0 / 0 |

Steps 1–5 change no camera and no world. Step 6 is the first that can move frame time, and step 7 the first that can
move draw calls; both are measured before they are queued for the others.

---

## 8. Questions for Habib

1. Free travel: **(a) the apprentice's dépanne** (once per city day when broke) or **(b) à pied** (long and tiring)?
2. Public benches resting a little (hole 4): yes or no?
3. The phone in portrait: is a dock 140 px up from the bottom, above the controls row, acceptable? The alternative is a
   vertical mini-dock on the right edge, at the cost of a little of the camera-drag zone.
4. The eye in the top-right corner (where the phone button is today): agreed?
