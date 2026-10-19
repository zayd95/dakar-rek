# Pikine Street DNA — round 4: signage that reads, and the road to the arena

Same branch (`feature/pikine-street-dna-p2-20261019`, local, **not pushed**, no preview build, nothing deployed, Cloudflare untouched, PRs #46–#50 untouched).
Round 3 (`9f5945c`) is the baseline. Pictures are iPhone-sized (390 × 844, @2×), medium quality, software GL; the HUD weekday and the player's shirt change between runs
(city clock, random default avatar): not part of the change.

## 1. Draft PR #52, reviewed before it was integrated

PR #52 (`fix/pikine-signage-proportions-20261019`, 3 files, +37 −2, draft, based on the same `03477aa` as this branch) paints every builder sign on a canvas that has its plane's
proportions (`signCanvasSize`: 96 px high at most, 1 536 px wide at most) and adds a unit test of the helper. Its own description says the game had not been run.

**What it gets right.** The cause is real: `addSign` painted a fixed 256 × 64 canvas (768 × 112 for names over 18 letters) on boards from 2.6 m to 21 m wide. « BOUTIQUE DIALLO » is a
16.5 × 0.8 m board (20.6 : 1) on a 4 : 1 canvas: **5 × stretched** (`before/` shows « …QUE TE… » for « BANQUE TERANGA »). The fix is the right one, it applies to every `addSign` board of every hub, and it clears
the base `03477aa` cleanly (cherry-picked as it is, commits `0b8613a`, `5998047`, `e8d769e`).

**What it leaves, found by measuring every sign on the game (`scripts/check-pikine-signs.mjs`, which reads each sign's canvas and plane in the scene):**
1. **It only reaches `addSign`.** Six other places call `signTexture` with a size of their own and kept their stretch: « KEUR MEUBLES » (×0.60), « CEEBU JËN · YASSA » (×1.67),
   « QUINCAILLERIE · MEUBLES » (×0.73), « RÉSIDENCE JÀMM » (×0.62), « APPARTEMENTS · À LOUER · À VENDRE » (×0.73), « MAISON · CITÉ JÀMM » (×0.62), the tagline under « KEUR MEUBLES » (×0.44).
   Three of those files are `src/economy/*` and the arena's: not touched here (a standing rule). **Fix: `src/game/signFit.ts`**, a module that, after each hub is built, repaints any sign whose canvas and plane
   differ (`refitSign` in `batch.ts`; the sign keeps its text and colours in `texture.userData.sign`). One place, no caller edited, and a future caller cannot bring the stretch back.
2. **A 16 m board with a 4 m name.** The font rule is unchanged (53 % of the canvas height), so on the long boards the name covers a quarter of the board. Now 60 %, and on a board lower than 1 : 7 the
   letters are **spaced out** (drawn glyph by glyph, never widened), which is how such boards are painted. « BOUTIQUE DIALLO » reads as a shop board, not as a tiny label on a ribbon.
3. **Small boards stay small.** « PARKING MOTOS · GARDIEN » (1.6 × 0.4 m) has letters 0.10 m high: unreadable from the phone camera. A sign whose letters would be under 0.2 m on a board narrower than 2.4 m is made up to 1.6 × larger by `signFit`
   (letters 0.16 m, the best that board can do without changing its text).
4. **Memory.** TBD_MEM
5. **Tests.** It tests the helper only. `check-pikine-signs.mjs` now fails on any stretched, clipped or too-small sign in the running game (below).

Verdict: integrate, with the three additions above. They are in this branch as commits on top of PR #52's three, so the PR can be rebased out cleanly if it is merged first.

## 2. Signage

### « Télécentre » is gone
Two places had it: the Street DNA's shop (`TÉLÉCENTRE · Crédit · Transfert · Factures`) and the street-dress module's cantine board (`src/game/streetDress.ts`, the base's own, on every hub). They are now:

- the shop: **MULTISERVICE JÀMM**, with its two lines **Wave · Orange Money** / **Impression · Photocopie** (the trade's palette, parasol and stools kept; the cyber café's second line no longer repeats « Impression »);
- the street-dress board: **MULTISERVICE** / *Wave · Orange Money* (the board is 1.7 m wide: the longer name would be 0.15 m high, so it keeps the short one). The teal « MULTISERVICES » board that stood next to it became **ESPACE SERVICES** / *Crédit · Factures*, so the two do not repeat.

### Names: one identity per trade, one owner per shop
Each trade keeps its palette, its goods and its forecourt (`SHOP_TRAIT`, `forecourt`); each shop of a trade has its own name. TBD_NAMES

### Every sign, measured (`check-pikine-signs.mjs`, on the final build)
TBD_SIGNCHECK

### Before / after, iPhone-sized, from three distances
The player stands 2 m, 8 m and 14 m in front of the sign and the follow camera rides 10.5 m behind him: the sign is seen from 12.5, 18.5 and 24.5 m, the way the game is played.
`signs/before-vs-after/` (left: round 3, right: now). TBD_SHOTS

## 3. Arena Street DNA

TBD_ARENA

## 4. Validation

TBD_VALIDATION

## 5. Left for your call

TBD_DECISIONS
