# Mobile takeover — 13 October 2026

Inspected live GitHub refs before starting: integration `0cbf0d410cdf1ed891cd340c359b90ddfb9075ff`, release
`f2335f177f2b8f56b9d3ce3bb83d4e583888b121`. PR #24 is merged into release. This isolated candidate starts at that
current integration head, not an older Codex branch.

Integration already includes shorter-neck/oval-head V4 proportions, grounded walking, relaxed jogging, sprinting,
quiet notifications and the landscape run-button position. Do not rebuild these. V6 is visually rejected and is not
used here. The open historical PRs are not an authoritative backlog: release already shipped #21–23 through #24.
Integration and release have diverged; integration still lacks release's football/kickabout and seated-meal/perform
port. Reconciling those is separate integration work, not part of this control patch.

## Control fixes

- A resting thumb moving 5 px used to walk 0.432 m in two seconds and turn the player. The 6 px radial dead zone now
  stays still and eases into fine movement; beyond 12 px the original response and gait thresholds are preserved.
- After standing for more than a second, tapping Courir used to lose the selection next frame. The selection now gets
  its own one-second window to begin moving. The existing idle reset still works after stopping.
- Event-only joystick arithmetic; no new per-frame work, UI elements, meshes, assets or draw calls.

## Evidence

`scripts/check-mobile-controls.mjs` drives the actual game touch handlers at 390×844, 844×390 and 360×640. Before is a
source export of the pinned integration SHA; after is the compiled candidate. It reproduces both defects before, then
passes on all three viewports after: zero drift, selection retained, walk 1.996 / jog 4.196 / sprint 6.995 m/s, pointer
cancellation and idle reset, clear central HUD, no page errors. Exact stepped simulation makes these comparable.

- [Before captures/results](screenshots/mobile-controls/before/)
- [After captures/results](screenshots/mobile-controls/after/)
- Build and client/server typechecks pass. Unit suite: 1,392 passed, 2 skipped; 36 focused tests pass.
- Low-quality gala budget: 10/10 pass. Arrivals/bout/outflow: 108/102/122 calls (budget 180), JS update
  0.48/0.37/0.42 ms (budget 4 ms), crowd update 0.056/0.009/0.046 ms (budget 0.8 ms).
  [Raw measurements](screenshots/mobile-controls/perf-low.json).

Chrome phone emulation is not a physical-phone test. Existing large-bundle build warning remains. Release, Cloudflare
configuration and production are unchanged. Draft PR targets integration; no merge.

## Next work

Continue reviewing V4's facial details and mobile framing in small visual candidates, then natural direction changes
and touch interruptions. Keep before/after captures and existing evening budgets. Re-read the live integration head
before each new branch and check what has shipped before picking any older PR work.
