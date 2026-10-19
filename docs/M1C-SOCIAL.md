# M1-C — Social Stickiness: « Dakar remembers you, and people make the city worth returning to »

Branch `feature/m1c-social-stickiness-20261019`, on PR #48's head (the M1-C baseline: save v6 + Mamadou recognises a regular). Three bounded slices, each extending what exists in `src/social/`, `src/multiplayer/` and `src/venues/` — no new system, no save-schema change, nothing for the Meshy/vehicles lanes to merge around.

## What already existed (audit)
- **Memory** (`src/social/memory.ts`): `visit_/served_/seen_` counters, `regular_<id>` flag at 3, the relation bonus, `greeting()` (ordered reactions per profile), `lastMemory()` for the People sheet.
- **Relations** (`relations.ts`): the player↔NPC and NPC↔NPC levels in the save; no decay offline.
- **Cast, routines, seats** (`cast.ts`, `routines.ts`, `npcLife.ts`): who is where by city hour, seated at benches and stools, attaya on the grand-place, the shop counter.
- **Story beats and favours** (`beats.ts`, `situations.ts`): Mame's gas bottle, Modou's trust, Mamadou's rice, Babacar's meal (a favour owed, then repaid).
- **Wrestling talk** (`fightTalk.ts`, `fightTalkModule.ts`): the street talks about the gala and its result; the player's own bouts are in `career.bouts`.
- **Multiplayer** (`src/multiplayer/`): presence (`Move`: position, pose clip, optional validated fields), proximity chat, block/report, name labels within 35 m; `server/worker.ts` relays and validates.

## C2 — Personal recognition (this slice)
**What the player sees.** Walk up to someone who knows you and they say a few words, in a toast with their name: « Mamadou : « Na nga def ? Toujours là, l'habitué ! » ». Someone you helped thanks you on a later visit (Mame: the gas bottle; Babacar: the meal he still owes, then « on est quittes »; Modou: the job; Ablaye: Moussa's recommendation; Mamadou: the rice). After a win or a defeat in the ring, those who follow wrestling greet you for two city days with something about it — in the street and on their menu line — and the People sheet remembers it for two weeks.

**What it reuses.** `memory.ts` (new: `Cond.bout` and `recordFreeService`), `profiles.ts` (new optional `walkup` lines for Ibou, Modou, Mame, Mamadou, Babacar, Ablaye; bout reactions and memories added to their existing lists), `npcLife.ts` (the per-frame distance it already computes), the HUD toast. New pure module `src/social/walkup.ts` (rules, no Three.js). One small debug entry, `cityDay`.

**Not repetitive, not farmable.**
- At most one greeting per person per city hour; never the same line twice in a row; a once-line (a favour acknowledged) is said once; the player must walk away 9 m before the same person greets again; 8 s between two people's greetings; only while walking about (no menu, scene or activity); only to someone met (familiarity ≥ 1 or relation ≥ 5). A talk in a menu counts as that hour's greeting.
- Walking up earns nothing: no relation, no counter, no need.
- A free action (a chat) counts as a service and gives its +1 relation once per city hour per person; paid services still count every time (the money is the price). Spamming « Discuter » no longer makes a regular.

**Persistence.** Three counters in the save (`wu_at_<id>`, `wu_last_<id>`, `wu_<id>_<line>`), plus `freesvc_<id>` / `freerel_<id>`: no schema change, carried by the v6 migration like every counter; the bout (`career`) already was. New Game starts everyone as a stranger.

**Checks.** `tests/walkup.test.ts` (20: who greets, a different reaction on return, a remembered favour, bouts, no repetition/farming, reload, v5→v6 migration, New Game). `node scripts/check-recognition.mjs [url] [shotsDir]` (phone, real game, 20 checks): a stranger is not greeted; three real purchases; the greeting; no second one in the hour; a different line next hour; the favour at the gargote (done through the real menus) thanked later and once; a win then a defeat change Tonton Ibou's greeting; four chats count once; reload; New Game. `check-regular-mamadou.mjs` (slice 1) still passes.

## C3 — Neighbourhood social anchors
**What the player finds.** Four places that have something to share, once per city day, never required:
- **Boutique Diallo** — the « Parler à Mamadou » row becomes « Un moment avec Mamadou » while the moment is available (same row, same compact sheet): Mamadou at the counter, with Tonton Ibou at his elbow around noon. A stranger gets a polite shopkeeper; a regular who delivered the rice is told it sold like bread; a boxer back from the ring is told the customers talk of nothing else. Choices: hear the news (and where tonight's attaya is), help tidy the shelves, accept the first glass (regulars), or just pass.
- **The gargote at noon** (Mame's menu): a place kept for the player who carried her gas bottle, a heavier ladle after a win, a plate and a kind word after a defeat; Coach Ablaye at the end of the bench when he is there. Help with the service (a little esteem, a bite to eat), listen to the room, or talk training.
- **The grand-place attaya** (Tonton Ibou's evening moment, already there): now answers to a recent bout — the glasses rise for a win, a verre without a word for a defeat — and the player can tell the bout.
- **Garage Modou's bench** (Modou's menu): the job, the meal Babacar paid back, the ring — each changes what he says; hold the lamp or listen to his breakdown stories.

**What it reuses.** The existing moment engine (`situations.ts`: one per city day, a choice, the memory of the last choice and how many times), the characters' routines (a moment is offered only when its host really stands at the place at that hour — `PlaceSpec.id` names the boutique counter and the garage bench, which are fixed spots), the NPC menus' ★ entries, the shop sheet's own talk row. No new store: `sit_<id>_n/_day/_last` counters in the save.

**Not an obligation.** A moment gives a good moment and a little esteem (+1/+2 at most, never money, never a flag, never a debt); skipping it costs nothing; it is simply there again the next city day. No streak, no daily bonus, nothing that expires.

**Reasons to come back** (People app, « À revoir »). Up to three lines read from the schedules and the favours: a favour someone owes (« Babacar se souvient de toi … (à la Maïga du marché) »), a moment happening now at a place the player knows, or starting within three hours (« Au comptoir de la Boutique Diallo : Mamadou, dès 9 h »). Nothing is invented and no offline time is counted: the same inputs always give the same lines, late at night there are none, no notification.

**Checks.** `tests/anchors.test.ts` (15: reachable by the schedules, different history → different moment, a second visit remembers the first, once a day, effects bounded, reasons). `node scripts/check-anchors.mjs [url] [shotsDir]` (phone, real game, 25 checks): the boutique row and its moment in the compact sheet, the gargote at noon after a win, the attaya with the bout told, the garage after the job, the People app's reasons by day and by night, reload, New Game; `check-menu-density.mjs` and `check-regular-mamadou.mjs` still pass.
