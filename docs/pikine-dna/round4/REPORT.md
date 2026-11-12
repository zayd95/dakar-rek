# Pikine Street DNA — round 4: signage that reads, and the road to the arena

Same branch (`feature/pikine-street-dna-p2-20261019`, local, **not pushed**, no preview build, nothing deployed, Cloudflare untouched, PRs #46–#50 untouched).
Round 3 (`9f5945c`) is the baseline. Pictures are iPhone-sized (390 × 844, @2×), medium quality, software GL; the HUD weekday and the player's shirt change between runs
(city clock, random default avatar): not part of the change.

## 1. Draft PR #52, reviewed before it was integrated

PR #52 (`fix/pikine-signage-proportions-20261019`, 3 files, +37 −2, draft, based on the same `03477aa` as this branch) paints every builder sign on a canvas that has its plane's
proportions (`signCanvasSize`: 96 px high at most, 1 536 px wide at most) and adds a unit test of the helper. Its own description says the game had not been run.

**What it gets right.** The cause is real: `addSign` painted a fixed 256 × 64 canvas (768 × 112 for names over 18 letters) on boards from 2.6 m to 21 m wide. « BOUTIQUE DIALLO » is a
16.5 × 0.8 m board (20.6 : 1) on a 4 : 1 canvas: **5 × stretched** (`signs/03-banque-teranga.jpg`, top row, shows « …QUE TE… » for « BANQUE TERANGA »). The fix is the right one, it applies to every `addSign` board of every hub, and it clears
the base `03477aa` cleanly (cherry-picked as it is, commits `0b8613a`, `5998047`, `e8d769e`).

**What it leaves, found by measuring every sign on the game (`scripts/check-pikine-signs.mjs`, which reads each sign's canvas and plane in the scene):**
1. **It only reaches `addSign`.** Other places (`interiors.ts`, `economy/citeJamm.ts`, `economy/stall.ts`, the arena's modules) call `signTexture` with a size of their own and kept their stretch: « KEUR MEUBLES » (×0.60), « CEEBU JËN · YASSA » (×1.67),
   « QUINCAILLERIE · MEUBLES » (×0.73), « RÉSIDENCE JÀMM » (×0.62), « APPARTEMENTS · À LOUER · À VENDRE » (×0.73), « MAISON · CITÉ JÀMM » (×0.62), the tagline under « KEUR MEUBLES » (×0.44).
   Some of those files are `src/economy/*` and the arena's: not touched here (a standing rule). **Fix: `src/game/signFit.ts`**, a module that, after each hub is built, repaints any sign whose canvas and plane
   differ (`refitSign` in `batch.ts`; the sign keeps its text and colours in `texture.userData.sign`). One place, no caller edited, and a future caller cannot bring the stretch back.
2. **A 16 m board with a 4 m name.** The font rule is unchanged (53 % of the canvas height), so on the long boards the name covers a quarter of the board. Now 60 %, and on a board lower than 1 : 7 the
   letters are **spaced out** (drawn glyph by glyph, never widened), which is how such boards are painted. « BOUTIQUE DIALLO » reads as a shop board, not as a tiny label on a ribbon.
3. **Small boards stay small.** « PARKING MOTOS · GARDIEN » (1.6 × 0.4 m) has letters 0.10 m high: unreadable from the phone camera. A sign whose letters would be under 0.2 m on a board narrower than 2.4 m is made up to 1.6 × larger by `signFit`
   (letters 0.16 m, the best that board can do without changing its text).
4. **Memory.** The PR's caps (96 px high, 1 536 px wide) raised the Pikine sign canvases from about 7.0 MB to 9.15 MB (33 boards; the tagline under « KEUR MEUBLES » alone became 1 509 × 96, 0.58 MB). `signCanvasSize` is now also
   capped at **80 px a metre** (a name's 0.4 m letters stay 1 : 1 seen from 12 m on the phone): the 33 canvases take **6.1 MB**, and the picture memory of the hub's plane boards goes from 14.4 MB (round 3) to **13.5 MB**
   (`scripts/measure-textures.mjs`, RGBA8 without mipmaps, same hub, same hour). The three tests of the PR still pass.
5. **Tests.** It tests the helper only. `check-pikine-signs.mjs` now fails on any stretched, clipped or too-small sign in the running game (below).

Verdict: integrate, with the additions above. They are in this branch as commits on top of PR #52's three, so the PR can be rebased out cleanly if it is merged first.

## 2. Signage

### « Télécentre » is gone
Two places had it: the Street DNA's shop (`TÉLÉCENTRE · Crédit · Transfert · Factures`) and the street-dress module's cantine board (`src/game/streetDress.ts`, the base's own, on every hub). They are now:

- the shop: **MULTISERVICE JÀMM**, with its two lines **Wave · Orange Money** / **Impression · Photocopie** (the trade's palette, parasol and stools kept; the cyber café's second line no longer repeats « Impression »);
- the street-dress board: **MULTISERVICE** / *Wave · Orange Money* (the board is 1.7 m wide: the longer name would be 0.15 m high, so it keeps the short one). The teal « MULTISERVICES » board that stood next to it became **ESPACE SERVICES** / *Crédit · Factures*, so the two do not repeat.

### Names: one identity per trade, one owner per shop
Each trade keeps its palette, its goods and its forecourt (`SHOP_TRAIT`, `forecourt`); each shop of a trade has its own name.

| trade | name | what it says | |
|---|---|---|---|
| boutique | **BOUTIQUE ABDOU** | Alimentation générale | on the route |
| boutique | BOUTIQUE MARIAMA | Riz · Huile · Sucre · Lait | |
| couture | **COUTURE FATOU** | Modèles sur mesure · wax | on the route |
| couture | TAILLEUR MODOU | Boubous · Costumes · Retouches | |
| quincaillerie | **QUINCAILLERIE** | Ndiaye & Fils · ciment · fer | on the route |
| multiservice | **MULTISERVICE JÀMM** | Wave · Orange Money / Impression · Photocopie | on the route |
| cantine | CANTINE MAME | Thiéboudienne · midi | |
| cantine | **CHEZ TANTE YACINE** | Mafé · Yassa · Dibi · Bissap | arena street |
| pharmacie | PHARMACIE TERANGA | De garde · Ouverte la nuit | |
| coiffure | COIFFURE PAPE | Hommes · Dames · Enfants | |
| coiffure | BARBER MOUSTAPHA | Dégradé · Barbe · Rasage | |
| cyber | CYBER NDOYE | Internet · Jeux · Scan | |
| supporters | **LÀMB SHOP** | Maillots · Écharpes / Drapeaux des écuries | arena street |

Six shopfronts stand on the route today, six different names (round 3: four). The names that no shop uses today (not bold) are **not painted**: the atlas now holds a cell only for the boards the
layout really asks for (it is laid out twice with the same seeds, the first time on a stand-in atlas), so a spare name costs nothing and a new shop in a later round brings its own.

**Vocabulary and spelling** (checked line by line): *Thiéboudienne* (the common French spelling; the menu inside keeps the Wolof orthography « CEEBU JËN »), *Jàmm* and *attaya* as everywhere in the game, *dibi* (grilled meat),
*Chez Tante …* and *Barber* (how a Dakar street says it today), *Wave · Orange Money* (the two mobile-money services people actually use, as plain text, no logos), *De garde · Ouverte la nuit* (a pharmacy's two ways of saying it),
*GAB 24 h/24* (« guichet automatique de banque ») on the bank's flank, *palabres* on the grand-place's gateway. Names are invented; none is a real business. The 33 **builder boards** (Boutique Diallo, Salon Awa, Dibiterie chez Pathé, Café Touba ·
Parcelles, Garage Modou, Gargote Mame Diarra, Maïga, Banque Teranga, Keur Meubles, Résidence Jàmm, Écurie Baobab, Arène · Làmb, Entrée des lutteurs, Couleurs du Géew…) were read too: spelling and vocabulary are right, and their names are in files this round does not own (builder, economy, arena), so they are unchanged.

Two **one-word** boards got a second line so their names stay short and big: the street-dress cantine boards (`streetDress.ts`) became *MULTISERVICE / Wave · Orange Money*, *ESPACE SERVICES / Crédit · Factures*, *CHEZ ABDOU / Boutique · Alimentation*, *CYBER / Impression · Photocopie*, *QUINCAILLERIE / Ciment · Fer · Peinture*,
and their boards, plates and billboards were given the proportions of their cells (1.7 × 0.53 m, 1.0 × 0.31 m, 4.6 × 2.3 m).

### Every sign, measured (`check-pikine-signs.mjs`, on the final build)
`check-pikine-signs.mjs` reads every sign **in the running game**: the canvas against its plane, the measured width of the text against the board, the height of the letters in metres.

| | round 3 | now |
|---|---|---|
| canvas boards of the hub stretched by more than 5 % | **29 of 51** (« BANQUE TERANGA » ×6.7, « BOUTIQUE DIALLO » and « SALON AWA » ×5.3, « GRAND-PLACE DE PIKINE » ×3.3…) | 4, none with text (pattern tiles of floors and awnings) |
| text boards (33) with stretched letters | at least 25 | **0** (canvas : plane within 2 %) |
| name running past its board, or cut at an edge | the long names clipped (« …QUE TE… ») | **0** |
| smallest letters (em) | 0.10 m (« PARKING MOTOS ») | 0.16 m (the same board, made 1.6 × larger); every storefront name ≥ 0.2 m |
| Street DNA boards (22 placed) | one 256 × 100 cell for every board (gare ×1.9, grand-place ×5.7, market ×4.2…) | each cut at its own proportions: **0** off by more than 2 % |
| Street DNA text lines | not measured (the cells were not the boards' shape) | **0** overflow, **0** touching the cell's edge; names ≥ 0.26 m, second lines ≥ 0.11 m |
| « Télécentre » | on the route and on the street-dress boards | **gone** |

The Street DNA's sign cells follow the same rule at any scale: a 8.4 × 1.0 m gateway panel is a 504 × 60 cell, a 4.5 × 1.0 m fascia a 338 × 75 cell, a 1.7 × 0.6 m name plate a 255 × 90 cell. The atlas is **1 024 × 1 200** (round 3: 1 024 × 1 280): it is cut only for the boards in use.

### Before / after, iPhone-sized, from three distances
The player stands 2 m, 8 m and 14 m in front of the sign and the follow camera rides 10.5 m behind him: the sign is seen from 12.5, 18.5 and 24.5 m, the way the game is played.
Each strip is **before (round 3) over after (now), each at 2 m, 8 m and 14 m**, in `docs/pikine-dna/round4/signs/`: `04-boutique-diallo.jpg` (the board you asked about), `03-banque-teranga.jpg`, `06-keur-meubles.jpg`, `00-dibiterie-chez-pathe.jpg`,
`05-garage-modou.jpg`, `01-guichet-billets.jpg`, `02-parking-motos-gardien.jpg`, the six fascias (`fascia-*.jpg`: « MULTISERVICE JÀMM » is `fascia-multiservice-jamm.jpg`; on the round-3 side the same place says « TÉLÉCENTRE », and the two arena shops are bare wall),
the gare's and the Cité Jàmm's blade signs (`14`…`16`). The fascia now stands **above** the awning (it was half behind it: the second line of « MULTISERVICE JÀMM » was hidden by the yellow tarpaulin in the first pictures).

## 3. Arena Street DNA

The road z = −60 east of the junction at x = 0, from the home street to the arena's gate, was a 14 m ribbon of sand with the gate's barriers, stalls and parvis at the end of it and nothing on either side (`arena/*-before.jpg`).
The arena's own world (the queue lane, the apron up to the gate, the four stalls' customers, the pavement corners where the fans come from and go to, the guarded moto lot) belongs to `src/arena` and is **kept open**:
`keepOpen` is built from its own rules (`gateOf`, `gatePlaza`, `stallFronts`, `streetEnds` in `exteriorRules.ts`, `motoLot` in `arrivalRules.ts`, read only), the slice refuses any piece on it, and the check asserts it.
**One thing the arena's own check caught:** my first arrangement put a shop and a dibi grill on the south back strip between the gate and the guarded moto parking, on the line the fans walk from one to the other (`check-arena-arrival`: « from the parking to the gate the way is clear » failed, desktop and phone). The parking, and the way from it to the gate, are now kept open too, the south frontage there is bare as it was, and the check is back to its baseline result (below).

| what | where |
|---|---|
| **Gateway « RUE DE L'ARÈNE »** (pylons in the écuries' colours, Baobab green and Teranga red; a beam whose underside is 6.27 m, above the camera's band; the name on both faces: *Làmb · billets · attaya · jàmm*) | x = 13.2, past the fans' corner at x = 6.5 |
| **Painted walls on the yard side:** the wrestler « LÀMB », and « ALLEZ LES LIONS » | north frontage, x 14–19.5 and 44.5–50 |
| **Two shops** that a fight evening needs: **LÀMB SHOP** (a rail of jerseys in the écuries' colours, scarves, a flag on a pole), across the street from the gate; **CHEZ TANTE YACINE** (dibi, mafé, a bench) | north x 38.9–43.9; south x 14–19 |
| **Roadside life:** a dibi grill on the kerb (drum, grate, skewers, chopping table), a jersey rack, tea and stools, chairs | the pavement's back strips outside the gate's open ground |
| **The overhead layer** of the home street goes on: six poles and their wires, two lines of bunting in green, white, red and gold across the parvis (7.3 m, lowest flag 6.3 m) | x 10–50 |
| **Transitions on the ground:** a speed bump before each end, a zebra crossing at each end of the parvis, kerbs painted blue and white at the approaches and **green and white across the parvis**, drifts and dust like the rest of the slice | the carriageway and kerbs |

It has a random stream of its own (the avenue's every piece is where it was: I compared round 3's list of pieces with this one, every one of round 3's is still there at the same place; `check-pikine-dna.mjs` asserts the same slice on every load), two draw calls still (the slice and the night pools),
and no new texture: the slice is **13 349 triangles at medium, 4 812 at Low** (round 3: 10 771 / 3 910: the arena street and the taller names are +2 578 / +902: about 1 % of the hub's ~245 k).
Pictures: `docs/pikine-dna/round4/arena/` (left: round 3, right: now; `night-*.jpg`: 20:00).

## 4. Validation

### Round 3's gates, unchanged

| gate | round 3 | now |
|---|---|---|
| camera, the avenue route (636 samples) | 0 hidden, 0 near the lens, 1 blocked view (the market gate's pylon) | **the same**: 0 / 0 / 1 |
| camera, the home street (195) | 0 / 0 / 0 | 0 / 0 / 0 |
| camera, the avenue's side lanes (407) | 0 / 0 / 0 | 0 / 0 / 0 |
| collision sweep of the route (every 0.25 m, 0.5 m body) | 0 blocked, 0 by the slice | 0 blocked, 0 by the slice |
| walking route, real input and collision, game paused and stepped | 343 m, 169.6 s, 0 stalls | **343 m, 169.6 s, 0 stalls** (`walkthrough/avenue-route-round4.mp4`) |
| walking the home street | 104 m, 52 s, 0 stalls | 104 m, 52 s, 0 stalls (`home-street-round4.mp4`) |
| `check-pikine-dna.mjs` | all pass | all pass, plus the new arena assertions: the slice keeps off the gate's queue, apron, stalls, fans' corners, moto parking; the arena street on three lanes is clear for the 0.5 m body; the road is clear overhead (nothing under 4.6 m over a carriageway, nothing in the camera's band) |

### The arena street, new gates
- **Camera** (`check-pikine-camera.mjs arena` and `arenakerb`: out along one side, round the east end, back along the other; real input): carriageway lanes 169 samples, **0 hidden, 0 near the lens**, 1 blocked view (a corner turn at the east end); pavement lanes 201 samples, **0 hidden, 0 near the lens, 0 blocked**.
  Both walks stop at the arena's own colliders (the ticket window on the south pavement at x = 26, a stall on the south lane at x = 44), which are not the slice's.
- **Walk** (`walkthrough/arena-street-round4.mp4`): from the home street east along the arena street to the gate's parvis and back along its south side: 96 m, 47 s, **0 stalls**, no page error.
- **The arena's own checks** (`check-arena-exterior` 42/42, `check-arena-outflow` 16/16 pass). `check-arena-arrival` gives **24/28 on this build and 24/28 on the base `03477aa`**: the same four failures
  (the gardien's « paid tonight » line on desktop and phone, « walked to the gate » on desktop, his goodbye on the phone), all in the arrival module, none new. My first arrangement made it 21/28 (the way from the parking to the gate): fixed, see above.

### Performance
| | round 3 | now |
|---|---|---|
| slice triangles, medium / Low | 10 771 / 3 910 | 13 349 / 4 812 |
| draw calls the slice adds (off-and-on, the route / the arena street) | +0.9 / – | −0.7 / +0.9 (still 2 meshes) |
| triangles the slice adds, medium: the route / the arena street | +10.7 k | +12.2 k / +13.2 k (~5 % of the frame's ~243 k) |
| triangles the slice adds, Low: the route / the arena street | +4.4 k | +4.0 k / +4.8 k |
| frame time off-and-on (software GL, noise ±40 ms), medium / Low | +18 ms / +7 ms | +12 ms / +12 ms (route), +22 ms / +11 ms (arena street): inside the noise |
| textures | atlas 1 024 × 1 280 + glow 512 × 640 | atlas **1 024 × 1 200** + glow 512 × 600: nothing added |
| picture memory of the plane boards (the hub's signs, billboards…) | 14.4 MB | **13.5 MB** |
| draw calls, the frame's max over the route (medium) | – | 202 (the base: 198) |

Round 3's slice was 10.8 k because it had cut the overhead layer from 5.4 k to 2.1 k; the arena street (a gateway, a pole line, two shops with forecourts, two walls, ground paint) and the taller shop boards bring it back to where round 2 was.

### Regressions
On the final build: `check-pikine-gare` all pass, `check-pikine-mosque` all pass, `check-city-life` (the CI check `check:city`) 37 pass 0 fail, `check-crowd` 24/24, `check-night` 18/18, `check-minimap` **93/93**.

**Recorded separately: the pre-existing gargote failures.** `check-npc-density` (phone): this build **64/67** on the last run (65/67 on the one before), the base `03477aa` **64/67**. Every failure is at the gargote, on the east side of the grid, nowhere near the slice:
« people eat seated at the gargote at lunch » and « the player sits on a free gargote bench » on every run of both builds, and « the gargote is closed at 23 h » (one person still on a bench) on the last run of this build only: it comes and goes with the city's randomness. The base also failed a flaky « animated humanoids within the low budget 11/10 » at 19 h in this run, which this build did not.

`npm test`: **130 files, 1 589 passed, 2 skipped** (round 3: 128 files, 1 581; the new file is `tests/pikineSigns.test.ts`, the others are PR #52's `signCanvasSize.test.ts`). `npm run build` (typecheck and vite build): passes (it also prints a CSS-syntax warning from a stylesheet this branch does not touch).

## 5. Left for your call

- **The arena street's frontage is short on purpose.** The gate's parvis, queue, stalls, moto parking and the fans' corners leave about 10 m of wall on the yard side west of the queue and 12 m east of it, and none on the parking side. I filled
  that with what a fight evening needs and kept the rest of the road open. If you want the south side (the parking's) dressed, the parking's guard and the way from it to the gate would have to move: that is the arena module's call, not this branch's.
- **Names that no shop uses are not painted** (Boutique Mariama, Tailleur Modou, Cantine Mame, Pharmacie Teranga, Coiffure Pape, Barber Moustapha, Cyber Ndoye): they wait in `SHOP_NAMES` for the next stretch.
- **The builder's own boards** (Boutique Diallo & co.) were repainted, not renamed: their names are in the builder, economy and arena files. Tell me if any should change.
- **Two small boards stay small.** « PARKING MOTOS · GARDIEN » is 1.6 × 0.4 m with a 23-letter text: 0.16 m letters (1.6 × larger than it was), the most that board can do without a shorter text or a larger board (arena module).
- **PR #52.** Reviewed and integrated here (see section 1), not touched on GitHub: nothing commented, pushed or merged. Its three commits are first on this branch (`0b8613a`, `5998047`, `e8d769e`) and my changes follow them.
- **Not pushed.** The branch is local: say when, and whether PR #52 should be rebased first or this branch carries it.
