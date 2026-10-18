# Shared UI tokens and primitives

Branch `ui/shared-primitives-20261018`, stacked on PR #46. Presentation only: no gameplay logic changed, no HUD redesign. The reference is the Tiak Tiak delivery card (approved): white rounded cards on the grey sheet, a big green price, one yellow button with a darker edge.

## What is shared

- `src/ui/tokens.css` — names for spacing (`--ui-s1…s5`, 4-point scale), radii (`--ui-r-*`), type (`--ui-t-*`, `--ui-w-*`), the touch size (`--ui-tap` 48 px), surfaces and ink, price colours, the **states** of a row or card (`--ui-hover`, `--ui-press`, `--ui-selected`, `--ui-ring`), the primary button (`--ui-btn-*`) and the card shadow. Defined on `body`, not `:root`, so the existing `--row`, `--ink`… they borrow resolve with the night overrides (`body.theme-night`): one set of names, both scenes.
- `src/ui/primitives.css` — `.ui-card`, `.ui-line` (an outlined action card), `.ui-feature` (a raised card with its own button), `.ui-price` (`.gain` / `.cost` / `.xl`), `.ui-btn` (the primary button; `.quiet` = ink on the card), states `.is-selected`, `.is-disabled`, `:hover` only on a real pointer, `:active`, `:focus-visible`.
- `src/ui/primitives.ts` — `shopRow`, `shopFeature`, `priceTag`, `primaryButton`, `priceTone`; `src/ui/glyphs.ts` (line icons). They take what to show and a callback; they never read the game.
- A sheet opts in with `hud.openMenu(…, variant)` (`'shop'`), an interactable with `menu: 'shop'`. Other menus are unchanged.

Layouts stay different on purpose: a shop is a stack of compact cards; a delivery is a route card. Both are built from the same tokens (the Tiak cards now take their card surface, price and yellow button from `.ui-card`, `.ui-price.xl`, `.ui-btn`; their look is unchanged).

## Boutique Diallo (Pikine) first

Follows the owner's reference (black-and-white cards, line icons, a featured purchase with its own button):

- **A stack of compact cards**, not a grouped list. The first available purchase (here « Pain et lait », 400 F) is the **featured card**: line icon, title, a kind line (« Petit-déjeuner »), the price, and one big **Acheter** button (ink on the card colour: a light pill at night, a dark one by day). The other actions are outlined cards: line icon, short title, kind line, the price (green for a gain, « +1 500 F »), a chevron. Actions without a price (« Parler à Mamadou », « Livraisons Tiak Tiak ») are title + chevron.
- All five actions and every price are kept (a cost is shown without its minus sign, « 400 F »; a gain keeps its plus). Tapping anywhere on a card does the action; the featured card's button does the same.
- **Short wording is presentation only**, keyed by action id in `src/ui/shopCopy.ts` (short title, kind line, line icon from `src/ui/glyphs.ts`); the action itself, its label in the content and its logic are untouched, and the full description stays as the card's title (tooltip / accessible name). The subtitle is the plain « Que veux-tu faire ? ».
- An unavailable action keeps its **reason** in the kind line, in the warning colour (« Pas assez d'argent », « Repose-toi avant ce service… »), dimmed, and shakes when tapped.
- **White-on-white fixed.** `#modal .item:hover` was a fixed `#fafafa` while the night ink is `#f5f5f7`: a tapped row stayed white with white text (touch devices keep `:hover` after a tap). Now hover is a tint token over the card, only on a real pointer (`hover: hover and pointer: fine`), so a phone never shows it and a desktop pointer shows a subtle lighter card in both scenes. This one rule is global (it fixes every sheet); nothing else outside the boutique and the Tiak cards changes look.

## Screenshots

`docs/screenshots/ui-primitives/`: `before-*` / `after-*` for day (11 h) and night (22 h) on a 390 × 844 phone: `-menu` (the panel), `-hover` (a row under the pointer), `-disabled` (money 100 F, energy 5), `after-night-hover-desktop` (a real pointer). `scripts/shots-shop.mjs` regenerates them for any place (`node scripts/shots-shop.mjs [url] [dir] [prefix] [placeFrag]`).

## Checks

`tests/primitives.test.ts`: price tones, the boutique copy covers every boutique action with a known line icon, every state token defined for both scenes, no fixed colour in a row state, the old `#fafafa` hover gone. Full unit suite and `tsc`. `check-tiak-tour` on this build: desktop + phone pass (the Tiak cards are unchanged in look and behaviour).

## Known

`check-tiak-tour.mjs` rides a scripted route; the city day follows the device clock and some days put a road event (works, a checkpoint) on the stretch the script rides, which makes that run flaky (one phone run failed on such a day, passed on rerun). The game itself is unaffected — the player rides around. Pinning the day in the check is a follow-up.

## Next (not done)

Plateau's Atelier Ndeye shares the builder but keeps its old rows until it is opted in (`menu: 'shop'`); then the phone's apps, housing and transport menus, one at a time, each keeping the layout its interaction needs.
