# Audio checks on 8b83310 (the engines another 6 dB quieter)

* Commit: `8b83310aaab132cd11d62ea108f63290ed167f4c` (tree `f4276d873f28312cec81ce0e015fe9986cfa583e`), branch `vehicles/audio-candidate-20261020`, PR #55 (draft, isolated candidate).
* How: a clean detached worktree of exactly that SHA (no local changes), `vite build`, `vite preview`, then `node scripts/check-<name>.mjs` against it in headless Chromium (SwiftShader, 390 × 844 phone viewport, real touch). The mix was not touched.
* The logs in this folder are the raw outputs. `run.txt` has the SHA and the times (UTC).

| Check | Result | Log |
|---|---|---|
| engine-sound | 9/9 passed (exit 0) | `engine-sound.log` |
| horn | 17/17 passed (exit 0) | `horn.log` |
| audio | 13/13 passed on attempts 2 and 3 (exit 0). **Attempt 1 failed**: a 240 s `TimeoutError` in the check's `getOn` (waiting for the trial car to report `driving`), before any audio assertion; the same unchanged build passed twice straight after, and the same check passed on the previous commits of this branch. Reported as a one-off timing failure of the boarding step, not as a pass. | `audio.attempt1.log` (failed), `audio.attempt2.log`, `audio.attempt3.log` |

Levels seen by the checks at the output (dBFS): car idle −40.3 rms / −43.9 in the speaker band, cruising −37.5 (speaker band), lifting off −48; ignition peak −9.7 against idle peak −30.4; horn −13 in the speaker band against the engine at −39.7 (26 dB of margin); the traffic bed is not measured by these checks.
