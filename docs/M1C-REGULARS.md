# M1-C, first slice: Mamadou recognises a regular

Branch `feature/m1c-regular-mamadou-20261018`, based on PR #47's head (which carries PR #46's save v6). One slice of the « Dakar reacts to the player » milestone, not the milestone: a shopkeeper remembering a regular customer. Nothing new is stored and no new system: the memory the game already keeps does the work.

## What the player sees
- Three qualifying interactions with Mamadou (a purchase or a service at Boutique Diallo, a talk, once per city hour) make him recognise the customer: the existing toast « Mamadou Diallo te reconnaît : tu es un habitué ▲ », the existing relation bonus.
- From then on the shop's sheet greets in a few words under the title instead of « Que veux-tu faire ? » — « Ah, l'habitué ! Entre, entre. » (« Mon client fidèle ! Prix de voisin pour toi. » for the customer who also delivered his rice).
- The benefit is on the row, in the same one-line format: « Sucre et thé » shows the neighbour price 200 F with the full 300 F struck through; the 300 F row is gone (one row, not two). The price charged is the 200 F.
- The other four actions, their prices and the compact layout are unchanged. A stranger sees today's sheet.

## What it reuses
- `src/social/memory.ts`: `visit_<id>` / `served_<id>` counters, `regular_<id>` flag at `REGULAR_AT` = 3, the relation bonus, the toast (all existing).
- `src/social/profiles.ts`: Mamadou's `regular` reactions (each gets a `short` line for the sheet), his `sells` (300 F) and `perk` (200 F, « prix de voisin »).
- `src/social/regular.ts` (new, pure): `shopRegular(placeId, state, relations, hour)` → the greeting, the full-price row to hide, the price a row replaces. It only looks at the character whose profile names the place as its own.
- UI: `MenuItem.was` / `RowOptions.was` (struck price, `.ui-was`), and the shop sheet takes the caller's subtitle.

## Persistence, reset, isolation
Counters and flag are in the save: a reload keeps the recognition (two interactions before a reload count towards the third after it); New Game starts a stranger again (the old save is not imported). Nobody else is affected: three interactions with Mamadou make no other character a regular, and no other place's sheet changes.

## Also in this branch: the avatar field
Save v6 now carries the Meshy lane's `avatar` field (`'homme' | 'femme'`), which the field-by-field migration would otherwise have dropped (docs/SAVES.md « Fields that other lanes add »). Own commit, same names as on `claude/lucid-cori-60vlgt`. A New Game keeps the chosen avatar (`freshSave`, docs/SAVES.md); the rest of the game is reset.

## Checks
`tests/regular.test.ts` (13: stranger, third interaction, visits + services, greeting and struck price, relation, trust, no effect on others, reload, New Game) and `tests/saveV6.test.ts` (avatar). `node scripts/check-regular-mamadou.mjs [url] [shotsDir]` (phone, real game, 18 checks): three real purchases, the toast, the greeting, one sugar row at 200 F with 300 F struck, the charge, day and night, another place unchanged, reload, New Game. `scripts/check-menu-density.mjs` still passes (its sheet closing is now robust to a missed key).

## Not in this slice
Wrestling reactions, a favour that someone remembers, other shopkeepers (the helper is data-driven, so a shop opts in with `menu: 'shop'` and a profile `perk` + `short` lines), spoken greeting as the player walks up. Each is a later slice.
