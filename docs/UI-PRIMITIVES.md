# Shared UI tokens and primitives

Branch `ui/shared-primitives-20261018`, stacked on PR #46. Presentation only: no gameplay logic changed, no HUD redesign. The reference is the Tiak Tiak delivery card (approved): white rounded cards on the grey sheet, a big green price, one yellow button with a darker edge.

## What is shared

- `src/ui/tokens.css` — names for spacing (`--ui-s1…s5`, 4-point scale), radii (`--ui-r-*`), type (`--ui-t-*`, `--ui-w-*`), the touch size (`--ui-tap` 48 px), surfaces and ink, price colours, the **states** of a row or card (`--ui-hover`, `--ui-press`, `--ui-selected`, `--ui-ring`), the primary button (`--ui-btn-*`) and the card shadow. Defined on `body`, not `:root`, so the existing `--row`, `--ink`… they borrow resolve with the night overrides (`body.theme-night`): one set of names, both scenes.
- `src/ui/primitives.css` — `.ui-card`, `.ui-line` (a compact one-line action row), `.ui-star` (the gold objective star), `.ui-price` (`.gain` / `.cost` / `.xl`), `.ui-btn` (the primary button, used by the delivery cards), states `.is-selected`, `.is-disabled`, `:hover` only on a real pointer, `:active`, `:focus-visible`.
- `src/ui/primitives.ts` — `shopRow`, `starEl`, `priceTag`, `primaryButton`, `priceTone`; `src/ui/glyphs.ts` (line icons and the star). They take what to show and a callback; they never read the game.
- A sheet opts in with `hud.openMenu(…, variant)` (`'shop'`), an interactable with `menu: 'shop'`. Other menus are unchanged.

Layouts stay different on purpose: a shop is one compact list of one-line rows; a delivery is a route card. Both are built from the same tokens (the Tiak cards now take their card surface, price and yellow button from `.ui-card`, `.ui-price.xl`, `.ui-btn`; their look is unchanged).

## Boutique Diallo (Pikine): compact rows (final density pass)

- **One grouped list of one-line rows**, 58 px each (checked 56–64 px): small line icon, action name, price or reward, chevron. No featured purchase card, no inline Buy button, no kind lines. A cost is shown without its minus (« 400 F »); a gain keeps its plus, in green (« +1 500 F »). Tapping a row does the action exactly as before; confirmations and the full description (the row's title / accessible name) only appear after the tap, as the game already did.
- **A sheet of about half the screen** on a phone in portrait (`max-height: 50%` for the shop variant, 378 of 844 px with the five rows), its list scrolling inside if a place has more actions. Day and night themes unchanged; Tiak Tiak's route cards are untouched.
- **The gold ⭐** marks an action that belongs to the current objective, and only that. It is derived, not named: `src/social/objectiveMarks.ts` reads the game's own lead (`suggestion()` in `src/social/beats.ts`, the same one the goal line and the Carnet show): a story beat marks its person's menu entry, an economic step marks the kind of action it points at (`goal_tiak` / `goal_pickup` / `goal_deliver` → the Tiak Tiak jobs action, `goal_buy` → the furniture shop). Once the objective is done (e.g. after a first delivery) the star is gone; ordinary activities never have one. « Parler à Mamadou » is not linked to any objective (Mamadou's story beat starts from his own interaction), so it carries no star today; if a beat ever points at him, his entry gets it from the same rule. The star is an SVG with `role="img"` and the label « Objectif en cours ».
- All five actions and every price are kept. Short wording is presentation only, keyed by action id in `src/ui/shopCopy.ts`. An unavailable action is dimmed and, when tapped, shakes and shows its reason as a toast (not-enough-money, too-tired).
- **White-on-white fixed.** `#modal .item:hover` was a fixed `#fafafa` while the night ink is `#f5f5f7`: a tapped row stayed white with white text. Now hover is a tint token over the row, only on a real pointer (`hover: hover and pointer: fine`). This one rule is global (it fixes every sheet).

## Screenshots

`docs/screenshots/ui-primitives/`: `before-*` (the old rows) and `after-*` for day (11 h) and night (22 h) on a 390 × 844 phone: `-menu`, `-hover`, `-disabled` (money 100 F, energy 5), `after-night-hover-desktop` (a real pointer). `compact/`: `-objective` (the star on the Tiak row while the first delivery is the objective), `-ordinary` (no star once a delivery is done), `-disabled`. `scripts/shots-shop.mjs` regenerates the first set for any place.

## Checks

- `tests/primitives.test.ts`: price tones, the boutique copy, every state token for both scenes (incl. `--ui-star`), no fixed colour in a row state, the old `#fafafa` hover gone, and the objective marks (no objective → no star; `goal_tiak` → the jobs action only; `goal_buy` → the shop action; a beat → its person only).
- `scripts/check-menu-density.mjs` (phone, day and night, 28 checks): every row is a compact line of 56–64 px, no featured card or Buy button, the sheet ≤ 56 % of the screen, exactly the Tiak row has the visible, labelled star while the first delivery is the objective, none after a delivery, all actions and prices present, a disabled row still explains itself.
- Full unit suite and `tsc`; `check-tiak-tour` on this build (Tiak cards unchanged).

## Known

`check-tiak-tour.mjs` rides a scripted route; the city day follows the device clock and some days put a road event (works, a checkpoint) on the stretch the script rides, which makes that run flaky (one phone run failed on such a day, passed on rerun). The game itself is unaffected — the player rides around. Pinning the day in the check is a follow-up.

## Next (not done)

Plateau's Atelier Ndeye shares the builder but keeps its old rows until it is opted in (`menu: 'shop'`); then the phone's apps, housing and transport menus, one at a time, each keeping the layout its interaction needs.
