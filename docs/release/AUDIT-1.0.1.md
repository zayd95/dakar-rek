# Dakar Rek 1.0.1: technical audit

Baseline: `450febda` on `wip/visual-pass` (the published 1.0). Branch for this release: `release-1.0.1`. Four read-only investigations of the code on 13 November 2026; findings come from reading the code unless a line says "measured". Nothing here is a phone measurement.

## 1. Releases, deployment, migrations

- Public address: `https://dakar-rek.habibjallow95.workers.dev/`, Cloudflare Workers Builds on pushes to `wip/visual-pass`; `main` does not carry the online build. Rollback branch `rollback/production-before-release-1.0`.
- Server classes: `CityRoom`, `HubLobby` (migration `v1-presence`), `Social` (`v2-social`). A new class needs a `v3-…` migration and its binding in `durable_objects` and `previews`. `ONLINE_PROTOCOL` / `PROTOCOL_VERSION` must not be bumped (clients disconnect on a mismatch). New `Social` tables are add-only.
- Decision: 1.0.1 is built and reviewed on `release-1.0.1` and a preview; nothing is merged or deployed without the owner.

## 2. Multiplayer, identity, messages, Teranga Money

- Identity: a presence session id (random per connection), a `tag` (16 hex characters from the device key; also the account address), a `name` (nickname; default « Dakarois <4 chars of guestId> »). Nameplates draw the name only, within 35 m. Rooms: 24 players, up to 128 rooms per district.
- **Teranga Money: no server-side loss was found.** Debit, credit and the op row are written in one transaction; the op id is a primary key (idempotent); the sender sees success after the server's ack. The recipient is credited on the **server-held Teranga Money balance**, while the HUD and Argent › Solde show only the **local wallet**; money reaches the wallet only through « Retirer ». The recipient's card reads « 1 000 F reçus » with no action. Most likely cause of the owner's report (about 80 % confidence, to be confirmed by a two-browser reproduction in Stage A).
- Other defects: after 15 s the pay sheet says « Rien n'est parti » while the op may still commit; a delivery that fails 40 times is dropped silently; the 16-hex friend code shows in every conversation header; the HUD « Chat » button opens a separate proximity-chat panel next to the phone's Messages.
- Reusable: `PlayerSocial` street targets (emotes), the Messages « + » menu (pay, ask, invite, meet, location), `moneySheet`, `phoneHooks.openPhone('messages:<tag>')`.
- Decisions: make received money visible and one tap from the wallet without weakening server authority; an honest pending state; keep undelivered cards for the recipient's next connection; one shared player menu that later packages extend; HUD Chat opens the phone's inbox.

## 3. Vehicles, phone, map

- Position: `data.counters` `vehicle:<asset>:hub|x|z|yaw|seed`, written on getting off, on each save while driving, at district borders and by the corridor swap. A vehicle can stay in another district; that persists. There is **no "at garage" state** (repairs happen parked in the bay).
- Defects: the corridor swap omits the Teranga, the Rafet and the Gaïndé (one left on a road between districts keeps the old district's coordinates); a car sold while in another district keeps its record and comes back there when bought again; the lent Tiak bike's map position can be wrong; two different fallbacks for an unknown district; four hard-coded vehicle lists.
- Phone and map: « Biens » lists vehicles with no location; the « Ville » map draws a non-clickable icon per car; map focus accepts a district or a named place only; guidance is keyed to places, not coordinates. Horn audio exists (not positioned); no per-vehicle light flash.
- Decisions: fix the five defects; a « Mes véhicules » screen with « Localiser » through the existing map (a `point` focus) and the existing guidance; one short horn blip nearby; statuses from the game's real states.

## 4. Economy, housing, Tiak Tiak

- Clock: one city day is 24 real minutes, from a wall-clock epoch. Rent is charged **per played hour** (rent ÷ 24), not on a calendar; nothing economic runs on real days.
- Housing: the F2 Résidence Jàmm costs **15 000 000 F** (`src/economy/catalog.ts:72`, `src/housing/kit/index.ts:37`) or 6 000 F a day; an owned home can be let (rent ÷ 24 × 0.85 per hour; the template says 0.6); no sublet, tenant or occupancy mechanic; furniture is bought piece by piece and does not change income.
- Earnings (from the code): Tiak Tiak 1 000–1 400 F in a district, 5 000–6 500 F between districts; petits boulots 1 500–4 200 F; VTC 1 000–5 000 F a ride; docs measure 195 000–343 000 F per hour of active play.
- **Tiak Tiak: fixed routes in Pikine (7) and Plateau (6) only. Almadies, Corniche and Mermoz offer none.** Four inter-district routes. All five districts are connected in the road graph; `planTrip(a, b) !== null` is the reachability check.
- Exploits seen: `?debug` works on the public build and exposes `giveMoney`; the save is editable; a saved job's pay is not capped; eviction forgives arrears.
- Decisions: an economic month of seven real days on the server's clock for the F2's rental model (50 000 F rent, 10 000 F charges, 300 000 F furnishing, furnished sublet 150 000 F at 80 % occupancy, not guaranteed), settled once per month with an idempotency key and a capped catch-up; existing per-day leases unchanged; a seeded rolling Tiak Tiak offer list with at least three valid, reachable jobs in every district; saved pay clamped; `?debug` gated to test hosts.

## 5. Football, NPCs, cameras

- Football today is a single-player match against NPCs on each device (up to 5 a side, first to 3 goals or 240 s, no money). Only the kickabout ball is shared between players (last touch owns it, relayed at most 15 times a second). The server has no game loop.
- **A server-authoritative 5-versus-5 needs new server architecture**: a match object with a fixed tick running `footballSim` (pure TypeScript), input and snapshot messages, lobby/team/ready state, reconnect handling, and a `v3` migration. A phone lobby with invitations fits what exists.
- Venues: Le Patio has 7–10 named cast and no crowd; the Terrasse de Ngor has one person; Ngor beach has 16 static figures and nobody walks. « Terrasse Baobab » does not exist: the closest are « Toit Baobab » (Plateau) and « Terrasse de Ngor » (the hotel roof).
- Budgets: animated bodies 12 / 20 / 30 (low / medium / high); a full body costs about 10 draw calls plus shadows; far figures are one instanced call; frame budgets 180 / 300 / 420 draw calls.
- Cameras: a module can take the camera (`camera?()`); `FrameCam` frames scenes; first launch is `isNewGame`. One district is loaded and fog ends at 240–320 m: there is no skyline to open on. Reduced motion is CSS only.
- Decisions: instanced venue crowds on hour windows within the body budget; a low fly-in over the starting district, skippable, first launch only, cut for reduced motion; Grand Camp as a lobby first, the authoritative match as its own server object, stakes only after the owner approves the settlement rules.

## 6. Performance baseline

The 1.0 measurements stand as the baseline (`docs/release/RELEASE-1.0.md`): Medium, hour 10, draw calls / triangles: Pikine 132 / 180 545, Plateau 98 / 115 716, Corniche 72 / 147 545, Almadies 77 / 233 988, Mermoz 61 / 182 007. Re-measured at the release candidate with `scripts/perf-hubs.mjs`.

## 7. Decisions the owner will be asked for

1. Grand Camp stakes: cancellation, disconnection and settlement rules before any pooled stake exists.
2. « Terrasse Baobab »: which venue is meant.
3. The new server class for football matches (a migration on the public server when 1.0.1 is published).
