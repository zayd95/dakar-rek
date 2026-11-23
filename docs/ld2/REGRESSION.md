# LD2.0-A — regression and performance

The wider checks on the LD2.0-A build, on branch `integration/ld2-a-20261024`, compared with the unified beta it was cut from (zayd95/dakar-rek#65, `a1cf012`).
The phase's own checks are in `docs/ld2/LD2_A.md`.

- **Game code:** as of `bbbc146`. `8496b1f` and `3620c42` change only documents and two CI scripts.
- **Builds compared:** `npm run build` of each commit, served locally.

**Every number here comes from headless Chromium with a software renderer (SwiftShader), on a 4-core container.**
- Draw calls and triangles carry over to a phone.
- Frame times and frame rates do not: they only compare the two builds on the same machine.
- None of it is a measurement from a real iPhone.

## CI (« Game checks »)
| Commit | Result |
|---|---|
| `3620c42` | green, both runs (push and pull request) |
| `8496b1f` | push run green; pull-request run red (`check:city`, below) |
| `bbbc146` | red (`check:city`, below) |
| `be93ee6` | red (`check:launch`, below) |
| `b6f32fa` | green |

### The two causes, both in test scripts
- **`check:city`, the desktop walk through the Almadies mall entrance (`scripts/check-city-life.mjs`):**
  - A drawn frame moves the game at most 0.1 s (`src/main.ts`), so the 8.5 m jog takes about 20 drawn frames whatever the machine.
  - On the same machine the walk took 48 s on the base build and 50 s on LD2.0-A, against a fixed 60 s limit.
  - The two red runs were on runners where every earlier step was about 30% slower (the fishing job took 70–74 s instead of 54 s).
  - The limit is now 150 s; the walk itself is unchanged.
- **`check:launch`, the phone pass of `scripts/shots.mjs`:**
  - Ibou's menu was opened once, right after a teleport, and its first row clicked.
  - On be93ee6 the menu had never opened: the only `.item` on the page was the sheet's hidden ✕.
  - The game code was identical to b6f32fa, which passed.
  - The script now opens the menu until it is open, then clicks.
- **Locally on the LD2.0-A build:**
  - `check-city-life` 37/37, run before the limit was raised (the walk took 50 s).
  - `shots.mjs` 58/58 with the change.

### Workers Builds (the Cloudflare preview)
- It fails on every commit of this branch, and on the Living Districts branch (zayd95/dakar-rek#67) too.
- `npm run build:online` and `wrangler deploy --dry-run` pass locally.
- The likely cause is the account's limit on Durable Object namespaces for a new branch's preview. This is not confirmed: the build log is on Cloudflare's dashboard.
- The private claude.ai preview stands in for it.

## Regression on the integrated build
Each check was run on the LD2.0-A build at 390×844 with real touches, or as the script sets it.

| Check | Result |
|---|---|
| `check-ui-consistency` (every phone screen, « Mes pistes » and « Banque » included) | 80/80 |
| `check-phone-ux` | 85/85 |
| `check-phone` | 69/69 |
| `check-beta-life` | 15/15 |
| `check-residence-reload` | 32/32 |
| `check-avatar-activities` | 12/12 |
| `check-vtc-ride` | 19/19 (see below) |
| `check-keur-meubles` | 4/4 |
| `check-arena-lanes-drive` | 4/4 |
| `check-roadside` checkpoint / sellers | 2/2 · 8/8 |
| `check-polish-journeys` B · C · E · G | 4/4 · 10/10 · 8/8 · 9/9 |
| `check-polish-journeys` arena | 8/8 (see below) |
| `check-polish-journeys` almadies · card | 7/7 · 4/4 |
| `check-city-life` | 37/37 (base: 37/37) |
| `shots.mjs` (the desktop and phone gameplay suite) | 58/58 |

The phase's own checks (`docs/ld2/LD2_A.md`):
- the acceptance journey: 27/27;
- driving: 28/28;
- bank: 23/23;
- bana-bana: 31/31;
- Affaires: 23/23;
- « Mes pistes »: 15/15;
- the « Reconnexion » pill: 4/4;
- the PR #65 rollback: 6/6;
- production saves: 25/25;
- the PR #64 rollback: 8/8;
- unit tests: 2 222 passed, 2 skipped.

### Findings
- **`check-vtc-ride`, the Gare de Pikine pickup (exists in the base build too):**
  - The first run drew the Gare de Pikine pickup (rides follow the city's day). Its scripted driver was bumped against the gare's furniture while leaving the bay and stalled, after 9 passing steps.
  - Pinned to the same city day (1149), the base build stalls in the same place in the same way.
  - With the day's own pickup (the Grand-place), both builds pass 19/19.
  - Not an LD2.0-A regression. It is left to a separate task: the test's driver or the bay's placement.
- **`check-polish-journeys arena`, a knock on the Jakarta (passing traffic):**
  - One run counted a knock at the junction west of the arena zone, with a car rapide of the bus lines 16.6 m ahead.
  - Run again on both builds at the same time, both passed 8/8 with no bus there.
  - LD2.0-A changes neither the bus lines nor that junction.
- **Road events:**
  - On the same city day, the two builds place them on different streets: LD2.0-A keeps them off the ways into a district.
  - On the days checked, none stood on a test's path.

## Performance, base (`a1cf012`) against LD2.0-A
### Load, and the streets on foot (`scripts/perf.mjs`)
| | Base | LD2.0-A |
|---|---|---|
| Downloaded at start | 8 556 kB | 8 632 kB (+76 kB) |
| Time to playable, desktop / phone (one run each) | 6.8 s / 6.0 s | 7.7 s / 6.1 s |
| Draw calls, phone: Plateau 13 h · Pikine 13 h · Pikine 21 h | 95 · 187 · 236 | 104 · 173 · 222 |
| Triangles, phone: same places | 118k · 221k · 249k | 125k · 223k · 247k |

**Variance:** these frames include the street's moving life (people, traffic), which differs from run to run.

### A fixed street, without that variance (`scripts/perf-vehicles.mjs`)
- **Setup:** 12 parked vehicles on the avenue, random traffic hidden. The script was run twice per build.
- **Each vehicle model:** identical (same meshes, materials and triangles).
- **The street without the vehicles:** within the run-to-run spread, ±20 draw calls on desktop.
  - The one steady difference is Pikine by day: about +5 draw calls and +5k triangles in both runs. This matches the bana-bana table (its goods, its board, the seller), the one thing LD2.0-A adds to that street. It was not measured object by object.
  - Pikine at night is even.

### Night driving (in the Teranga, 21 h, Pikine, phone, low quality)
With the headlights lighting the road on LD2.0-A:

| View | Base | LD2.0-A |
|---|---|---|
| Chase · draw calls / triangles | 79 / 141k | 78 / 140k |
| Chase · one synchronous frame, median | 223 ms | 220 ms |
| At the wheel · draw calls / triangles | 71 / 133k | 67 / 127k |
| At the wheel · one synchronous frame, median | 206 ms | 182 ms |

- **Headlights:** they add no draw call.
- **At the wheel:** lighter, because the car's own cabin is no longer drawn in front of the eye.

### The Almadies mall, by day (desktop, 1280×720)
- **Draw calls:** 253 → 239.
- **One synchronous frame:** 1 183 → 1 199 ms (median of 24, the builds alternating).
- **Without the headlight term in the street shaders:** 1 116 ms. This was measured to rule that term out: it is skipped by day (`if (uHlK > 0.0)`), and on a phone's GPU such a uniform branch costs nothing.

## Limits
- **No real-device frame rate is claimed.** SwiftShader on a busy 4-core container renders a frame in 0.2–1.2 s.
- **The Gare de Pikine VTC pickup stalls the test's driver on both builds.** Whether a player meets the same knock there is untested.
- **The preview:** the Cloudflare preview does not build (above). The private claude.ai preview was checked in headless Chromium only.
