# MOBILE-01 — real-device playtest of the accepted candidate

**Status: a private playtest build for the owner's iPhone. Not a release, not deployed, not merged.** `main`, production and the deploy workflow are untouched. The candidate it is made from (PR #88) is accepted *for real-device testing only*.

## 1. What you are testing, and how to know

| | |
|---|---|
| **Private preview** (claude.ai artifact, private to the owner) | <https://claude.ai/artifact/BQPT4s4sbbARMrWLAoAGnT> — title « Dakar Rek Playtest », version `1794073637-9ce7` |
| **Accepted candidate** (the game) | `92a6e2cf5e2c2ee322774fdcd2d6887142eaf152` — head of `integration/playable-20261107`, PR #88 |
| **Preview's own commit** (candidate + diagnostics only) | `804a19f40fe6b83d7a10e844e618ebee7653ef18` on `mobile-01/device-playtest` |
| **Build id on screen** | `804a19f4-20261107-apercu` |
| **Build manifest** | 64 files, 23 365 216 bytes, SHA-256 `5e285497a06ebed0be6fec6a5c80798853efad65cf79476ba8c22f64ca9bc8c9` |

**On the phone:** phone icon (top right) › **Réglages**, bottom of the page: « Dakar Rek · bêta · build **804a19f4-20261107-apercu** · candidat accepté **92a6e2cf** ». The report you copy (§ 5) starts with the same line. If either differs, you are not testing this build: say so and stop.

**In the repository:** `git diff 92a6e2cf 804a19f4 --stat` is the whole difference between the accepted candidate and the preview. `scripts/build-preview.mjs` refuses to build if any file outside this list differs:

| File | What changed |
|---|---|
| `src/core/frameStats.ts` | the measure also files memory, district changes and notes (§ 3); can start on in a playtest build |
| `src/ui/frameMeter.ts` | the on-screen meter has a second line for them |
| `src/core/build.ts`, `src/ui/betaInfo.ts` | the build id and the accepted candidate's commit in Réglages and in the report |
| `src/main.ts` | wiring only (10 lines added, 2 changed): the memory probe and three event notes after the renderer is made; the start and the end of a district load report to the measure (`loadHub`, `stagedStep`, `loadHubSteps`) |
| `vite.preview.config.ts`, `scripts/build-preview.mjs`, `scripts/check-preview.mjs` | how the preview is built and checked |
| `tests/frameStats.test.ts`, `.gitignore` | tests of the new diagnostics; the build folder ignored |

No gameplay, world, economy, vehicle, venue or UI-flow file is touched. Unit tests on the branch: 3 655 pass (the candidate's 3 648 and 7 new).

**What the build is, in four sentences.** The same game as the candidate (same code, same assets) built by `vite.preview.config.ts`. « Mesure de fluidité » starts on. The owner's showcase start (« Vitrine du propriétaire », its own save, 60 M F, the Almadies villa and the Lamane Sport in its bay) is compiled in, as in the earlier private previews: your own game (« Ma partie ») is never touched by it. The ten `.glb` models are shipped inside one JSON file because the artifact host serves no `.glb`; the page's head hands them to the game's own `fetch`, so the vehicles and bodies are the real models, not stand-ins.

## 2. Before you start (3 minutes)

- iPhone, Safari (or the Claude app), portrait, **Low Power Mode off**, battery above 50 %, brightness in the middle, other tabs closed. Note the model, iOS version, battery and time.
- Open the link. **The first load is heavy** (the whole build is 23 MB: 3.6 MB of game code, one 12 MB file of models, the textures; the music and sounds come as they are needed): on mobile data it can take a minute, and the page stays blank until the game is ready. If a **red box** appears at the top, tap it to dismiss and screenshot it first: it names what failed to load.
- Choose **« Vitrine du propriétaire »**. (Optional second pass: « Ma partie » is a fresh game that starts in Pikine, which is the true first-run experience.)
- Phone › **Réglages › Graphismes**: the iPhone default is **Moyenne**: do the route on it; step 11 repeats a place on **Basse**.
- **« Mesure de fluidité »** is on (you can switch it off there; the choice is kept). At the bottom centre, two lines:
  1. `47 img/s · 95 % < 31 ms · Almadies · au volant` — frames per second and the 95th-percentile frame time in the current place and mode (on foot, at the wheel, inside a home);
  2. `1 240 géom. · 310 tex.` (or `85 Mo` where the browser gives its JS heap: **Safari does not**, so on an iPhone you will see the renderer's own counts of geometries and textures instead) — and, for 12 s after a district change, `quartier 340 ms (pire image 210)`: how long the load took and the worst frame until two seconds after it.

## 3. What the measure files (and what it cannot)

| Item | Source | Notes |
|---|---|---|
| Frames per second, frame time (average, 95th percentile, worst), hitches over 50 ms, draw calls and triangles | the page's frame clock, per place and mode | existing since the release candidate (`docs/beta/IPHONE_PLAYTEST.md`) |
| Memory | `performance.memory` (Chrome, Android) and three.js `renderer.info` (every browser): JS heap, geometries, textures, programs; now and at the peak | **iOS Safari gives no JS heap and no GPU memory**: the geometry and texture counts are a proxy, not bytes |
| District changes | the district loader: from, to, `par la route` (a staged road crossing) or `direct`, load time, longest single block, worst frame until 2 s after | a freeze you feel at a crossing shows up as the worst-frame figure |
| Notes | a lost WebGL context (« la page a perdu sa carte graphique »), the page hidden and shown again | what makes iOS reload or blank a heavy page |

Not measured by anything in the build: battery, temperature, the GPU's load, whether the OS throttled the phone. Write the battery % and the feel of the phone yourself (§ 5).

## 4. The route — about 30 minutes, five districts

The roads form one chain: **Almadies — Pikine — Plateau — Corniche — Mermoz** (`docs/map/CORRIDOR.md`; Almadies has no road to the Corniche). You start in Almadies, so the route goes out along the chain and comes back. Each crossing is a district change the measure files. The game's clock runs a day in 24 real minutes: if it is day when you reach Almadies at step 3, do steps 4–5 first and come back to the night street at step 10.

| # | Where | What to do | Look for | min |
|---|---|---|---|---|
| 1 | **Almadies, the villa** | Walk the ground floor, the first floor and the roof; look at the pool. | frame rate indoors, the stairs | 2 |
| 2 | **Almadies, Ngor** | Walk the coast road to the **Plage de Ngor**: the boardwalk, the sand, the stalls, the embarkation. | the beach, the sea, the stalls | 2 |
| 3 | **Almadies, the night street** (day or night) | Walk the **night street** on the beach side of the coast road: Chez Binta, Café du Phare, Lounge 221, Le Comptoir de Ngor, La Vague's alley; across the road, the **hotel with the Terrasse de Ngor on its roof** (the stair door beside the lobby; its name is lit on the roof at night). | the street crowd, the lit signs, the density of the street | 3 |
| 4 | **Parking** | Get into the Lamane Sport (the villa bay), drive to the night street's car park (« PARKING DU PATIO ») and **park in a painted bay** by Le Patio. Try twice. | steering with the pad and pedals, whether the swing-in feels fair (21 bays, light traffic by design) | 3 |
| 5 | **Nightlife** (at night) | **Le Patio**: the door asks 5 000 F once a night; the courtyard, a drink, a conversation. Then La Vague's dance terrace and, if you like, the hotel roof. | frame rate in the busiest place of the build, the music, the crowd | 4 |
| 6 | **Driving out** | Leave Almadies by the road to Pikine (1.5 km): on a straight, **hold the green pedal down until it boosts** for about 30 s. Do not stop at the crossing. | steering at speed; **any freeze when the district changes in the middle of the road** | 2 |
| 7 | **Pikine, housing** | Walk the street to the **Cité Jàmm house** and walk both floors (phone › Biens, if the game offers to rent it: rent 16 700 F a day; renting is not needed to look). | interior frame rate, the staircase | 3 |
| 8 | **Plateau → Corniche** | Drive on: Pikine → Plateau (1.2 km), then the Plateau → Corniche road. At the Corniche, stop at **la gare des cars**: walk a minute. | two more crossings; the Corniche's life | 3 |
| 9 | **Corniche → Mermoz** | Take the Corniche–Mermoz road: the **VDN**, the **Sacré-Cœur rond-point** with the BRT (the heaviest place of the build: about 139 draw calls) and the **autopont**. Slow through the rond-point for a minute, then boost on the VDN. | the BRT junction, buses, signals, the flyover | 3 |
| 10 | **Mermoz, housing** | Park, walk to the **Résidence Les Filaos** and Pape Diouf's gate. At the board « F3 · À LOUER · À VENDRE »: « Voir le logement », **Visiter**, come out by the teal door inside the gate. | the listing, the interior's frame rate | 3 |
| 11 | **Back, on Basse** | Réglages › Graphismes › **Basse**; repeat step 3 or 9 for a minute. Then back to **Moyenne**. | the difference between the two presets | 2 |
| 12 | **Report** | Phone › Réglages › **« Signaler un problème »**: it copies the report. Paste it into one message (§ 5). | | 1 |

If a step cannot be done (a door is shut, a road is not offered, a place is empty), say which and carry on. If the game blanks, reloads or says the page had a problem: note the step; the report's « notes » lines will carry a lost WebGL context if that was the cause.

## 5. The report — one message

1. Phone › Réglages › **« Signaler un problème »** and paste what it copies, as it is. It carries: the build and the accepted candidate, the date, your screen and device, where you were, **one line per place** (average fps, 95th percentile, worst frame, hitches, draw calls, triangles, seconds measured), the memory now and at its peak, **one line per district change**, and the notes (lost context, hidden page).
2. Then add what only you know: iPhone model, iOS version, battery at the start and at the end, whether the phone felt warm or hot, and for each step of § 4 a mark from **1** (unplayable) to **3** (fine) to **5** (smooth), with anything that looked wrong.
3. A screen recording of step 6 or step 9, if you can.

`docs/mobile/MOBILE-01-REPORT.md` is the same thing as a form to fill in.

**What counts as good** — the owner's provisional private-beta gates (1 Nov 2026), judged on **Moyenne**; Basse is the fallback:

| Measure | Fine | Worth fixing | Blocks the build |
|---|---|---|---|
| Frame rate, on foot | 40 img/s and more | 30–40 | under 25 |
| Frame rate, at the wheel | 35 and more | 25–35 | under 20 |
| 95 % of frames under | 33 ms | 33–50 ms | over 50 ms |
| Hitches (> 50 ms) | one every 10 s or fewer | more | a freeze of more than half a second |
| District change in the middle of the road | no freeze felt | a stutter | a freeze of more than one second |
| Heat and battery | warm, 10 % in 25 min or less | hot | the phone throttles and the game slows down |

The accepted hub geometry (Almadies 230 meshes / 299 338 triangles, the candidate's own figure) is **provisional pending these numbers**: a result under « Blocks the build » in Almadies is the evidence that an optimisation pass is needed before anything else.

## 6. Limits — read before judging

- **Single-player only.** The page is static: no server behind it. Messages, transfers, home visits, meetings and the two-player presence are not reachable (they were proved separately on a local Workers runtime: `docs/proof/playable/online/`).
- **The artifact host is the one thing not proved from here.** The build boots from a sub-path under a strict same-origin policy (`docs/proof/mobile-01/`), and the files the host stores match the manifest byte for byte. But nobody has opened this artifact in the claude.ai viewer on an iPhone: its sandbox, its safe-area padding on the top and bottom of the page and its behaviour when the OS is short of memory are unknown. If the page does not start, tell me what you see (the red box, a blank page) and I will serve the same build from a live preview URL instead (it lives as long as the session).
- **The heavy first load** and the decode of the 12 MB model file at start are part of what you test; on mobile data the first minute is download, not rendering.
- **One iPhone is one iPhone.** Frame times are this phone, this build, this route. The browser reports frames, not the GPU's load: 60 img/s may be capped by the screen.
- **The optional `car_rapide.glb` is absent** in every build (a 404 the game ignores; the car rapide is the procedural model).
- **Two open items from the acceptance report are not fixed here:** the intermittent VTC drop-off stall (a scripted driver, one in seven runs) and the `check:online` rapide timeout in CI. They do not stop you playing; if a VTC ride stalls short of its drop-off, note where and what the car touched. Their investigation is `docs/mobile/MOBILE-01-INVESTIGATION.md`.
- **No automated result here says the game is enjoyable.** That is what the 1–5 marks are for.

## 7. Rebuilding and verifying

```
git checkout 804a19f40fe6b83d7a10e844e618ebee7653ef18      # the preview's own commit
npm ci
node scripts/build-preview.mjs --base 92a6e2cf5e2c2ee322774fdcd2d6887142eaf152 --branch mobile-01/device-playtest
node scripts/check-preview.mjs dist-preview /tmp/preview-check     # boots it under a strict policy, on a made-up sub-path
```

`dist-preview/version.json` names both commits and the files that differ from the candidate; `build-manifest.json` has the size and SHA-256 of every shipped file. A rebuild gives the same files except that the build date, the version and the manifest change with the day. The published artifact's stored copies of `index-DJDIreEt.js`, `glb-bundle.json`, `index-9KSOV-u4.css`, `owned-BnHH9wNG.js` and `start-C6APxtEN.js` were read back and match the manifest (`docs/proof/mobile-01/published-vs-manifest.txt`). The page file is the build's `index.html` inside the host's own document wrapper.

Nothing was deployed, merged or pushed to `main`; the acceptance evidence under `docs/proof/playable/` is unchanged.
