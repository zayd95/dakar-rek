# Arena — an evening inside the Pikine arena (Wave 2, 10 Oct 2026)

The visible path of a fight evening, end to end, built on the systems that already exist: buy a ticket at the window,
get past the controller, take a free place on the tiers, watch the stands fill, the wrestlers' entrance with drums and
dances, the existing làmb duel played by two NPC wrestlers, the crowd's reactions, the result, then the crowd goes home.
The combat rules are untouched (`src/lamb/duel.ts`). The street outside the walls (vendors, queue, fans arriving,
drummers outside, event days, gate position) is another lane: `src/arena/exterior.ts`.

## What a player can do

- **Buy a ticket** at the « GUICHET · BILLETS » window, left of the gate (a place of the shared registry,
  `pikine:arena:guichet`, open 17 h–23 h). « Acheter un billet (1 000 F) » shows the price and asks for confirmation
  (« Payer 1 000 F » / « Annuler »). Paid once through the activity runner: one wallet line
  « Billet · gala de làmb · Arène de Pikine », valid for the whole evening; a second purchase is refused
  (« Tu as déjà ton billet pour ce soir »). Stored as a save counter (`arena_ticket_day`), no schema change.
- **Go through the gate.** Without a ticket the controller turns you back to the street (« Xaaral tuuti ! »); with one
  he welcomes you (« Dalal ak jàmm ! »).
- **Take a free place on the tiers.** Every place on the three tiers is a seat of the shared registry
  (`kind: 'stand'`, « Place en tribune »), offered from the ring side (« S'asseoir »). Places the crowd holds are
  taken; the player never gets one twice. The view is the spectator's own eyes on the seat (the body is hidden, as on
  a car rapide seat), a slightly narrower field of view, the gaze following the action; drag looks around (±80°).
- **Watch the gala** (starts once seated while the doors are open):
  1. *Les tribunes se remplissent* (3 s) — the bill is announced: Babacar (Baobab) – Lamine (Teranga).
  2. *Entrée des lutteurs* (14 s) — the two wrestlers walk in from the gate with their people, drummers inside the
     gate, drums (`Percussion`), dances; the crowd stands up and cheers.
  3. *Combat · lutte sans frappe* — the existing `LambDuel` in spectate mode (no player input, no duel HUD), the
     « player » side driven by an autopilot (`pilot()` in `program.ts`) that presses the same buttons a player has;
     the other side is the duel's own AI. The crowd reacts on clinches and falls.
  4. *Résultat* (7 s) — the winner and how (projection, or the referee's decision; otherwise « Match nul »), the
     crowd stands and shouts « Daan na ! » (il a gagné).
  5. *Le public rentre* (9 s) — the stands empty; the gala is over for that day (`arena_gala_day`).
- **Stand up and leave.** After the gala the gate no longer checks tickets and the stands stay empty until the next
  day's evening.

Names are the game's fictional cast and écuries; no real wrestler, écurie, promoter or brand. No ritual or religious
text in the show: drums, dances and the crowd.

## Code

| File | Role |
|---|---|
| `src/arena/program.ts` | Pure: hours (`GALA`), ticket validity, crowd fill curve, density per quality, seat layout on the tiers, show phases and timings, the bill, crowd reactions, the bout autopilot. Tested in `tests/arena.test.ts`. |
| `src/arena/module.ts` | The `arenaModule` (game module seam): ticket window, gate controller, seats, show state machine, entrance, camera from the seat, debug API. |
| `src/arena/crowd.ts` | `StandCrowd`: seated / standing figures as 4 `InstancedMesh`es, plus a few near-LOD humanoids around the player's seat. |
| `src/arena/bout.ts` | `WatchedBout`: a `LambDuel` with `spectate: true`, driven by the autopilot. |
| `src/arena/card.ts` | The gala card (title, phase, bill). |
| `src/lamb/duel.ts` | Presentation only: `spectate` option (no key listeners, no HUD) and `axes()`. Rules unchanged. |
| `src/interact/seats.ts` | `SeatKind` `'stand'`, optional per-seat `reach`. |
| `src/i18n/lines.ts` | `ARENA` lines (ticket, welcome, stop, bill, entrance, result, over). |

**Density** (`DENSITY` in `program.ts`): share of the tier places the crowd fills and near-LOD humanoids —
low 42 % / 0, medium 68 % / 4, high 86 % / 8. The crowd is 4 instanced meshes whatever its size; the near-LOD
humanoids sit in the row in front when there is one and are not drawn when out of view. The entrance cast follows the
quality too (low: the two wrestlers and one drummer, no followers).

**Integration point.** The schedule (`streetAt`, every day 17 h–23 h) is provisional: the exterior lane's
`isEventDay(day, hour)` and gate position should replace it when both lanes are merged.

## Debug and checks

`?debug` → `__dakar.arena.info()` (street, phase, t, ticket, seats, crowd, entrance, bout, result, gate, centre),
`arena.cam()`, `arena.speed(n)` (fast-forward), `arena.go(phase)`, `arena.freeSeat(x, z)`.

`flock /tmp/dakar-browser.lock node scripts/check-arena-visit.mjs [baseUrl] [outDir] [--view=desktop|phone]` plays
the whole path on desktop (medium quality) and phone (low quality), captures in `docs/screenshots/arena-visit/`.
Draw calls are measured at the gate, on the seat and during the entrance: the arena's own share (the same frame with
everything `src/arena` draws hidden; budget desktop < 160, phone < 60) and the whole frame (desktop < 600, phone < 300).
