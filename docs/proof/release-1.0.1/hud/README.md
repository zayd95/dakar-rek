# 1.0.1 HUD pass: before and after

The whole HUD as the 1.0.1 packages left it, captured by `scripts/shots-hud-101.mjs` (390 × 844 and 360 × 780 portrait, 844 × 390 and 780 × 360
landscape, 1280 × 800 desktop; deviceScaleFactor 2; low quality) at eight moments: the street by day, a Tiak Tiak run in hand, the notices
stacked over it (the money-received card, a moment waiting behind it, a refusal, a spoken line), the card after a delivery with the next run,
the Almadies at night, inside the Terrasse de Ngor at 21 h, riding the moto at night, the opening's « Passer ». « Before » is `3a77882e`, « after »
is the branch's head. `quiet-measure.json`: for each of the 35 moments, what `__dakar.quiet()` counts over the middle of the screen.

| # | What was wrong | Fix | Pictures |
| --- | --- | --- | --- |
| 1 | Portrait: the money-received and « Mes pistes » offers ran to half the screen, over the quiet middle, their buttons one under the other, and covered the delivery line | No icon, buttons in one row kept in view at the card's foot, ends above 33 % of the height like any card, starts under the delivery line; the money line is one line | `p390-stacked-*`, `p360-venue-*` |
| 2 | Portrait: the card after a delivery with the next run reached half the screen; its « Accepter » lay over the rows, the run's line a column of single words, « Payé 1250 / F » broken | The gain on the title's line, the run's line over the button's width, « Accepter › » under it; ends above the middle | `p390-next-*`, `p360-next-*` |
| 3 | Landscape: cards on the left covered the minimap and the delivery line; the offer's title ran to four lines beside its button; the next-run button covered its card's title | Cards on the right under the phone button and the streak chip; title above the button; the same compact delivery card | `l780-stacked-*`, `l844-next-*` |
| 4 | Desktop: the minimap was drawn over the delivery line | The delivery line goes under the minimap when they share the left column | `desk-tiak-*`, `desk-next-*` |
| 5 | Portrait: the first job's goal line cut (« … à la… »); « à le Café Touba » in Mermoz and the Almadies | The goal line as wide as the minimap's column allows; « Gagne ta vie : Tiak Tiak à la Gargote Mame Diarra. », « au Café Touba » | `p390-day-*` |
| 6 | 360 px phone: the action button read « Des-cen… » | A smaller icon there: « Des-cendre » on its two lines | `p360-venue-*` |
| 7 | The wallet chip was 33 px tall (a tap target under 44 px, beside the 44 px phone button) | 44 px | `p390-day-*` (top left) |
| 8 | A sheet opened scrolled where the last one was left (110 px down: the board's first run hidden), the reset being made while `#modal` was hidden | Reset once the sheet is shown | `sheet-reopened-*` |

Measured: moments with an overlay over the middle, 8 of 35 before (`.mo.of` or `.mo.bc.go`: 390 and 360 portrait), 2 after: the driving pad's box
in landscape (its container reaches 11–30 px into the middle; no visible control is there; unchanged). Unchanged and kept as they are:
`l844-ride-*` (the pad), `p390-tiak-*`, `p390-opening-*` (« Passer » in its corner, clear of everything).
