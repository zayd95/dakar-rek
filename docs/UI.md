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
| Goal hint | `#goal` (`.gi` `.gt` `.gd`) | pill under the wallet, two lines max | one suggestion at most; when there is a place to walk to, the badge becomes a compass arrow (turns with the camera) and the distance is shown; one line while a ride card (`.ridecard`) is on; hidden while seated watching an arena show (entrance, bout, result — `arenaShow.watching()`), back on standing up |
| Toasts | `#toast > .t` | top centre (portrait: under the HUD, y≈170), above sheets, never over the action area; under the arena show's card (`#galacard`) while it is on | three at most, newest on top; « part  part » becomes chips, amounts coloured; repeats refresh instead of stacking; `warn` toasts in red |
| Focus ring (3D) | `worldMarkers` | sun ring on the ground under the focused target, sized by kind (person 0.62 m … vehicle 1.9 m) | grows in on focus change, breathes softly; hidden in menus, activities and scenes |
| Bubble | `#wprompt > .wp` | above the target, with a tail | icon in a sun disc, verb, price chip, `E` keycap (desktop); greyed when unavailable; **tap it to act** |
| Action button | `#act` in `#actbar` | bottom right, ≥ 60 px tall, max 62 vw | sun pill: icon disc + verb (two lines on a touch phone in portrait, where the button is narrow beside « Courir ») + what/why line + price chip; `.dis` white with the reason in red (tap: shake + reason); `.stop` white « ✋ Arrêter » while something runs; hidden when nothing is in reach |
| More | `#actMore` | 48 px circle above `#act` | opens the quick actions |
| Quick actions | `#modal[data-kind=quick]` | icon grid (tiles ≥ 96 px) anchored bottom right above the button | every affordance of the target: icon, label, price; disabled tiles show their reason and shake when tapped |
| Sheet | `#modal[data-kind=menu]` (`.sheet > .panel`) | phone portrait: bottom sheet, full width, ≤ 56 % high (drag the grabber up: almost full height), safe-area padding; phone landscape: right side, ≤ 86 %; desktop: 400 px card bottom right | grabber, sticky title, subtitle, extra content, inset grouped rows (≥ 54 px: icon tile, label, detail, right price, disabled reason in red); close: ✕, tap outside, Escape / M, swipe down (portrait) |
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

## Checks

`node scripts/check-ui.mjs <url> <outDir> [desktop,phone,landscape]` — HUD layout and touch targets, each closing path
back to play, quick actions and disabled reasons, Escape / « Arrêter » on an activity, a plain timed action and a scene,
the phone, focus ring, way-finding pin, toast stack, wallet animation. Existing checks still pass (`check-interact`, …).
