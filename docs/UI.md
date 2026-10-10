# Dakar Rek — UI system (Wave 1, 9 Oct 2026)

« The world is the interface »: what you can do is shown on the thing itself (a ring on the ground, a bubble above it),
the choices are compact and sit at the bottom of the screen near the thumb, and the HUD stays light. Visual language:
the phone's iOS-like look (light grouped sheets, rounded chips, the sun-yellow of the game), never Lagos Life's.

Files: `src/ui/style.css` (tokens and every component), `src/ui/hud.ts` (HUD API), `src/ui/sheet.ts` (sheets),
`src/ui/worldMarkers.ts` (3D focus ring and way-finding pin, a `GameModule`). Checks: `scripts/check-ui.mjs`;
captures: `scripts/shots-ui.mjs` → `docs/screenshots/ui/`.

## Tokens (`:root` in style.css)

| Token | Value | Use | Contrast |
| --- | --- | --- | --- |
| `--surface` | `rgba(255,255,255,.94)` | HUD chips, bubble, toasts, progress pill | — |
| `--surface-2` | `#f2f2f7` | sheet background (grouped) | — |
| `--row` | `#fff` | rows and info cards inside a sheet | — |
| `--ink` | `#111114` | text | 18.9:1 on #fff, 16.9:1 on #f2f2f7 |
| `--ink-2` | `#48484f` | secondary text (details, subtitles) | 9.1:1 / 8.1:1 |
| `--ink-3` | `#6e6e73` | tertiary, disabled labels | 5.1:1 / 4.5:1 |
| `--sun` | `#ffc83d` | primary action fill, icon badges | ink on sun 12.2:1 |
| `--gain` | `#047857` | « +1 200 F » | 5.5:1 on #fff |
| `--cost` | `#111114` | « −500 F » (neutral: spending is not an error) | 18.9:1 |
| `--warn` | `#b42318` | reasons (« Pas assez d’argent », « Fermé · ouvre à 7 h ») | 6.6:1 / 5.9:1 |
| `--ocean` | `#0b6e8a` | focus outline (the phone wallpaper's teal) | 5.8:1 |
| `--need-ok/mid/low` | `#22c55e` `#f59e0b` `#ef4444` | need rings and bars (fills only) | — |
| `--r-chip` / `--r-sheet` | 14 px / 20 px | radii | — |
| `--tap` | 44 px | minimum touch target | — |
| `--sa-t/r/b/l` | `env(safe-area-inset-*)` | notches and home bar | — |

All small text is ≥ 4.5:1 against its surface. Surfaces are opaque enough (94 %) to keep that over any scene.
The legacy dark tokens (`--card`, `--line`, `--gold`, `--green`, `--red`) stay for the dark panels of other modules
(chat panel, duel). **No `backdrop-filter`** anywhere in the HUD: blurring the live 3D view costs every frame on cheap
phones. Animations only use `transform` and `opacity`; `prefers-reduced-motion` turns them off.

## Components

| Component | Selector | Size / place | Behaviour |
| --- | --- | --- | --- |
| Wallet + needs | `#stats` (`#money`, `.ring`, `#mood`) | top left; wallet 17 px bold; five 24 px rings (faim 🍽️, énergie ⚡, moral = mood face, social 💬, hygiène 🚿) | tap/Enter opens labelled bars with % and the mood (remembered per device); a need under 25 % turns red and pulses; money changes count up and float « +1 200 F » / « −500 F » beside the wallet |
| Place and time | `#place` (`#hubName`, `#clock`, `#placeTag`) | top centre (desktop, landscape); right of the wallet in portrait | the weekday and time (« Samedi · 15:00 », never a city day number) and a red « Gala ce soir » chip Friday–Sunday until the gala is over (inline; own line in portrait); in portrait only the hub's first name (« Pikine ») |
| Phone | `#menuBtn` | 44 × 44, top right | opens the phone |
| Goal hint | `#goal` (`.gi` `.gt` `.gd`) | pill under the wallet, two lines max | one suggestion at most; when there is a place to walk to, the badge becomes a compass arrow (turns with the camera) and the distance is shown; a distance at the end of a line (« … · 72 m ») always sits in the right-hand slot (never wrapped away from its number, the « · » kept for screen readers); one line while a ride card (`.ridecard`) is on; hidden while seated watching an arena show (entrance, bout, result — `arenaShow.watching()`), back on standing up |
| Moment card | `#toast > .mo` (`hud.moment`) | first in the toast column, the toasts under it; never over the action button or the joystick | icon, title, a few lines (a bout's recap, a new word on a gauge); tap anywhere or ✕ to dismiss, 6–12 s, two at most; five lines on a landscape phone |
| After-bout card | `#toast > .mo.bc` (`hud.boutCard`) | a larger moment card, first in the toast column (≤ 420 px; portrait: a 30 px icon) | after a bout on the arena's fighter path (docs/CAREER.md): the result and who against, rows `Palmarès` · `Classement` · `Réputation` · `Influence` · `Cachet` (· `Forme` · `Ceinture`) — what (12 px), where it stands now (13.5 px), the change in green or red, a short note — then « Ensuite » on a sun-tinted block; 16–24 s, tap anywhere or ✕ to dismiss; landscape phone: no icon, notes inline, the first next step only |
| Toasts | `#toast > .t` | top centre (portrait: under the HUD, y≈170), above sheets, never over the action area; under the arena show's card (`#galacard`) while it is on; the evening's matchup is on that card only (no toast repeating it) | three at most, newest on top; « part  part » becomes chips, amounts coloured; repeats refresh instead of stacking; `warn` toasts in red |
| Focus ring (3D) | `worldMarkers` | sun ring on the ground under the focused target, sized by kind (person 0.62 m … vehicle 1.9 m) | grows in on focus change, breathes softly; grey (`#8e8e93`) when nothing can be done there now (every affordance disabled: another tier's place on the arena's stands, a closed counter); hidden in menus, activities and scenes |
| Bubble | `#wprompt > .wp` | above the target, with a tail | icon in a sun disc, verb, price chip, `E` keycap (desktop); **tap it to act**. Unavailable (`.why`): greyed, and the pill becomes a small card with the reason in full under the verb (12.5 px, `--warn`), at most `min(280px, 78vw)` wide; `bubbleX` keeps the card 8 px inside the screen and moves its tail to keep pointing at the target (the action button's line is cut short on a phone) |
| Action button | `#act` in `#actbar` | bottom right, ≥ 60 px tall, max 62 vw | sun pill: icon disc + verb (two lines on a touch phone in portrait, where the button is narrow beside « Courir ») + what/why line + price chip; `.dis` white with the reason in red (tap: shake + reason); `.stop` white « ✋ Arrêter » while something runs; hidden when nothing is in reach |
| More | `#actMore` | 48 px circle above `#act` | opens the quick actions |
| Quick actions | `#modal[data-kind=quick]` | icon grid (tiles ≥ 96 px) anchored bottom right above the button | every affordance of the target: icon, label, price; disabled tiles show their reason and shake when tapped |
| Sheet | `#modal[data-kind=menu]` (`.sheet > .panel`) | phone portrait: bottom sheet, full width, ≤ 56 % high (drag the grabber up: almost full height), safe-area padding; phone landscape: right side, ≤ 86 %; desktop: 400 px card bottom right | grabber, sticky title, subtitle, extra content, inset grouped rows (≥ 54 px: icon tile, label, detail, right price, disabled reason in red); a right column « Payer » (`em.pay`, after a price said first in the label) is a sun pill, grey on a disabled row, and its rows get a little more room in portrait; close: ✕, tap outside, Escape / M, swipe down (portrait) |
| Progress | `#progress` | slim pill directly above `#act`, right-aligned | icon, activity title, step label · n/m, %, 4 px bar; the button below says « ✋ Arrêter » |
| Joystick | `#joy` | 124 px, bottom left (touch only) | floating: a finger on the base drives it from its centre; anywhere else in the left 45 % moves the base under the finger |
| Scene banner | `#sceneTag` | bottom centre during làmb scenes | « ✋ Arrêter » leaves the scene (no reward) |
| Keyboard hint | `#hint` | bottom left, desktop only | keycaps; dims after 14 s |

## Every way out gives the controls back

The `on` class of `#modal` is the state (checks and `main.ts` read it; a `MutationObserver` in `main.ts` gives movement
back when a sheet closes in menu mode). Closing: ✕, tap outside, Escape, M, swipe down, a row's own action. Stopping:
`✋ Arrêter` (button, Escape, M, E) stops a composed activity (`ActivityRunner.cancel`), a plain timed action (content
without steps: nothing paid, nothing applied) and a làmb scene (no reward). Duels keep their own « Abandonner ».

## API (`Hud`, backward compatible)

- `openMenu(title, subtitle, items, extraHtml?, afterRender?)` — unchanged signature; `MenuItem` gains an optional
  `reason` (said when a disabled row is tapped; defaults to `detail`). `right` starting with `+` is a gain (green),
  with `−` a cost.
- `openQuick(title, items)` — the « ⋯ » grid.
- `setPrompt(label, sub?, more?, { icon, cost, gain, disabled, stop })` and `setWorldPrompt(at, icon, label, { cost, gain, disabled })` — DOM touched only on change (they run every frame). A leading emoji in `label` still becomes the icon.
- `progress(on, pct, label, { title, icon, step, steps })`, `deny(reason)`, `toast(msg, 'info' | 'warn')`,
  `setGuide({ angle, dist } | null)`, `setScene(label, note, stoppable)` + `onSceneStop`.
- `GameCtx.guide()` (src/game/modules.ts): the next-step place in this hub — the walking destination, else the person of
  the suggested story beat, else (first job) the nearest Tiak Tiak pick-up.

## Sheet content (for every lane)

Sheets are light. Inside `#modal .panel` text colour is **inherited from the sheet** (a compat rule), so greys written
for the old dark panel never vanish. Use the existing blocks — `.kv` (info card), `h3` (section header), `.rel`
(two-column card), `.draft` (small provisional note), `.seg`, `.swatches`, inputs — and the tokens (`var(--ink-2)`,
`var(--gain)`, `var(--warn)`) with a selector starting `#modal …` when a colour matters. Fills may keep `--gold`/`--green`.

## Living with the other lanes' UI

- `#gesture` (src/ui/gesture.ts, the trades' gesture card) sits bottom-centre, ~150 px above the bottom on phones: the
  progress pill (bottom 92 px + 46 px) and the action button stay below it in portrait; in landscape the card is 52 vw
  wide at the bottom, so the action column (button and pill) is limited to 24 vw on the right.
- `#ride` (transport), `#delivery` (economy), `#placer` (furniture placement), `#presenceBtn` / `#chatBtn` (multiplayer)
  are `.card`s: light now, with their text colours remapped in style.css (« other modules' HUD elements »); the
  ownership confirmation rows (`.est-rows`) get light rows inside sheets.
- `#runBtn` (stride, touch: right of the joystick): in portrait the action button is capped at `100vw − 248px` so it
  never covers « Courir »; the wallet chip uses the economy lane's `fcfaShort` (full amount as its accessible label).
- Wolof glosses: HUD text is plain DOM text, resolved by the gloss observer (src/i18n/dom.ts) like any other text.
- HUD buttons drop the focus after a tap or click, so Space/Enter (the game's action keys) never fire them twice.

## The ticket window on a phone (src/arena/tickets.ts `tierRows`)

The « Billet · gala de làmb » sheet, readable in portrait (390 × 844) without scrolling:
- **One row per tier, the price first**: « 1 000 F · Populaire », « 2 500 F · Tribune couverte », « 5 000 F · Tribune
  d’honneur » (15 px), then « Payer » on the right as a sun pill. The subtitle keeps the three prices in one line.
- **A line on what each tier gets** under it (`TIER_NOTE`, ≤ 40 characters, two lines at most beside « Payer »): « Les
  deux bouts du cercle, par la porte », « Grands côtés, sous la toile, coussins », « Premiers rangs, derrière les
  officiels ».
- **A tier the wallet can't pay** is greyed (icon, label, pill), its note replaced in red by what is missing (« Il te
  manque 1 500 F »); tapped, it shakes and says it, and nothing is paid.
- **On the stands**, another tier's place has a grey focus ring and its bubble gives the controller's reason in full
  (`seatRefusal`, « Ton billet est pour la tribune populaire (…) : cette place est en tribune d’honneur. »); the same
  reason is on the greyed action button and in the toast when it is tapped. `__dakar.focus().why` lists it.

## Phone › Ce soir (src/arena/tonight.ts)

The evening plans itself from what the game already knows. Nothing is invented: the page is a pure assembly
(`tonightPage`, tests/tonight.test.ts) of live facts (`tonightFacts`). It is laid out as light cards of rows like
Profil, with an icon, a line and its detail; « Y aller » (44 px) sits on the right.
- **Ce soir à l'arène.**
  - The card from the career's ladder (`billFor`), « Grand gala de lutte » (Friday–Sunday) or « Combat de quartier »,
    « titre en jeu » when the belt is.
  - The doors and the closing time.
  - The ticket: in hand, or 1 000 F at the window with « Y aller ».
  - On the card itself (the fighter's path; a gala place or the title from the career): « Tu combats ce soir contre … »
    first, with no ticket row.
  - Once tonight's gala is over: tomorrow's card.
- **Y aller.**
  - On foot with the distance to the gate.
  - Ligne 23 to the « Arène » stop: fare, and the nearest stop served now to board at.
  - The player's own moto / car: where it is parked, or « tu es dessus ».
  - From another hub: « Va à Pikine » with a link to the Carte.
  - Inside the walls: « Tu es à l'arène ».
- **Après le combat.** The evening call's `afterPlace`, open when the gala ends, with its closing hour and its distance
  from the arena (Pikine only).
- **Aujourd'hui à <hub>.** The day's weather (`weatherAt`: a shower to come or going on, wet streets, an overcast
  sky; nothing on a plain sunny day). Today's road events still to come (`roadEvents`), each with its hours and
  distance.
- **« Y aller ».** It closes the phone and sets the way-finding pin and the goal line (an invisible marker
  `cesoir:<key>` in this hub, like the fighter's path).
- **Debug.** `__dakar.tonight()`, `__dakar.tonightGo(key)`.

## Follow camera (src/actors/camera.ts)

Behind and above the player, never inside a wall or inside a tree's leaves:
- **Walls.** The way from the head to the camera is sampled (12 points) against the walls near the player (a short list
  refreshed every 2 m or second, not the whole hub). A wall cuts it short as before.
- **Tight spot** (less than 3 m free behind, e.g. the ticket window or a counter at the player's back). Four times a
  second at most, a few other views are tried: over the shoulder (higher), a three-quarter or side angle, from the front
  three-quarter, lower. The one that frees the most room wins, with a small cost for a bigger turn. Standing, the
  camera swings there smoothly. Walking, it only tilts, because a turn would bend the walk under the player's thumb. It
  eases back behind 2 s later, or as soon as the plain view is clear again.
- **Nothing at the lens.** The camera keeps `CAM_CLEAR` (0.9 m) of room around itself (`pullClear`). A trunk, a wall,
  an awning or a parasol closer than that would fill the view, so the camera comes in front of it along its way.
  Shop and stall awnings and the stalls' parasols are camera obstacles like tree tops, built as short cylinders in
  `HubWorld.canopies`.
- **Leaves.** Tree tops and palm fronds (`HubWorld.canopies`, from the builder's trees) block the camera like walls.
  Only when coming in front of them would leave less than 3 m behind the player (standing under the tree), the camera
  goes low under them (0.55 m below the leaves), if they hang high enough, rather than against the head.
- **Who wins.** A drag of the view always wins: nothing changes for 0.8 s after it. A view set on purpose (`follow.pin()`,
  the checks' `look`, `lookYaw`, `faceCamera`, `lookAtPlayer`) is kept until the player walks.
- **Debug.** `__dakar.camInfo()` gives the free room, tight, lift and swinging; `__dakar.camInLeaves()` is never true.

## Checks

`node scripts/check-ui.mjs <url> <outDir> [desktop,phone,landscape]` — HUD layout and touch targets, each closing path
back to play, quick actions and disabled reasons, Escape / « Arrêter » on an activity, a plain timed action and a scene,
the phone, focus ring, way-finding pin, toast stack, wallet animation. Existing checks still pass (`check-interact`, …).
