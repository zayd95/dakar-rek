# Backlog and status of the old work (17 Oct 2026)

Baseline: `candidate/launch-final-20261016` at `9ce15a5` (PR #37, draft, not merged). Production is `wip/visual-pass` at `e6c678a` and is untouched.
Everything below was checked against that baseline (`git cherry`, ancestry, and a look at the code), not against the old task list.

## ACTIVE
Nothing is active. The next phase is gameplay (see the end of this file).

## DONE (in the baseline, with evidence)
| Work | Evidence |
|---|---|
| Wave 1 to 5 lanes, arena, crowd, career, perf (`fix/w5-*`, `lane/w3-night`) | no unintegrated patch left (`git cherry`) |
| PR #24 release reconcile (PR #28, `claude/reconcile-candidate`), busy street round 1 + minimap (#30), `ui/v2` step 1, `pilot/almadies-dusk` branch point, `claude/combined-candidate` | all ancestors of the baseline |
| Tiak moto (#31), furnishing UX (#32), Pikine (#35) | in the baseline; CI green on #36 and #37 |
| `agent/gameplay-audit` (6 commits: work hours, served perks, story-beat postponing, greeted people, phone news) | every change found in the baseline (`during()`, `state.hour`, `served`, `completes === false`, `resting` WeakMap, phone text); git sees them as different patches only because the conflicts were resolved by hand |
| `agent/perform-polish` (6 commits) | same: brisk walk, whole sips, knee-height piles, `watch` kind and `scripts/check-perform.mjs` are all in `src/game/perform.ts` |
| Save protection: v5 under its own key | `9ce15a5`, `docs/SAVES.md`, `scripts/check-save-compat.mjs` (25 checks) |
| Presence handshake timeout (DKAG-007) and one-shot fall (DKAG-017) | recovered on `recover/small-fixes-20261017` (`1c93cba`); not yet in the baseline, see below |

## WORK RECOVERED, WAITING FOR APPROVAL
- `recover/small-fixes-20261017` (`1c93cba`, on top of `9ce15a5`): presence retries a socket that never gets `welcome` after 8 s (`src/multiplayer/client.ts`); `Fall_Back` plays once and holds its last pose (`src/actors/humanoid.ts`). 15 new unit tests; 1 510 tests, `tsc`, server typecheck, build and `check-multiplayer` pass. Not merged into #37.
- Unpushed work that only lived in a container, now backed up on the remote (nothing was removed from the worktrees):
  - committed: `backup/busy-street-2-20261017` (`27f1a57`), `backup/ui-v2-skin-20261017` (`6635586`, includes `d09c26d`);
  - uncommitted, saved as snapshot commits: `backup/almadies-dusk-uncommitted-20261017` (real WIP, +564 lines), `backup/busy-street-2-uncommitted-20261017` (2-line tweak), `backup/ui-v2-skin-uncommitted-20261017` (2 files), and two that are mostly staged deletions of a stale checkout and probably noise: `backup/ui-v2-uncommitted-20261017`, `backup/mygala-online-uncommitted-20261017`.
  - screenshots, images and `node_modules` are not included in the snapshots.

## FUTURE BACKLOG (worth keeping, not started now)
| Item | Where | State and remaining work | Risk |
|---|---|---|---|
| Busy street round 2 | `backup/busy-street-2-20261017` (`28a7eb7`, `27f1a57`: 11 files, +613/-111, traffic tests) | WIP, never verified; needs a draw-call and traffic check (low preset budget 180) before anything else | medium to high (traffic, perf) |
| HUD redesign to Habib's mockup | `backup/ui-v2-skin-20261017` (`d09c26d`: dark skin, bundled Inter, HUD cards, online pill, dock; 14 files, +409/-199); plan on `origin/ui/v2-plan` (`f18d20c`, `ee41913`, with Habib's two mandatory corrections as acceptance criteria) | step 1 is in the baseline; the skin is not; the mockup re-skin has not been started; check the skin against the two corrections first | medium (touches the whole HUD, mobile layouts) |
| Almadies dusk visual pilot | uncommitted WIP saved on `backup/almadies-dusk-uncommitted-20261017` (`28b37cb`: new `src/world/pilotAlmadies.ts`, `scripts/check-pilot-almadies.mjs`, edits to `main.ts`, `builder.ts`, `sky.ts`; +564/-7); the branch `pilot/almadies-dusk` itself has no commits | in progress, never committed or verified; needs a review of the look (Habib's approval of the direction) and a perf check | low to medium |
| Duel input reset on focus loss and pointer interruption (DKAG-008) | `origin/codex/agents/dkag-008-duel-input-reset` (`55def6b`: `duelInput.ts` + tests + `scripts/check-duel-input.mjs`) | small and tested, good next candidate; port onto the current `src/lamb/duel.ts` | low |
| Ibou follow-up (DKAG-016), place activity summaries (DKAG-015/020), Aïda revision activity (PR #7) | `codex/agents/dkag-016-ibou-followup`, `dkag-020-place-summary-current`, `codex/aida-revision-activity` | optional content or features written against the older line; port only if wanted | low to medium |
| Arena car park | `origin/lane/w5-car-parking` (`70d915c`, unfinished and untested; `carPark.ts`, `arenaCarPark.test.ts`) | the baseline already has `arrival.ts` (guarded moto parking); decide whether cars are still wanted | medium |
| Port of Dakar prototype (#34), Magic Land Lite (#33) | `feature/portwise-dakar-spike` (13 commits), `feature/magic-land` | opt-in prototypes, CI green earlier; #33 is based on `feature/home-editor-ux` which is now in the baseline (retarget) | low (opt-in) |
| Reference character (#29, `codex/reference-character`, 12 commits) | open PR | a candidate for the character base; decide with Habib | medium |
| Radios sénégalaises en direct | no branch | not started | medium |
| The « sarette » (horse cart) | no branch | not started, its own feature | medium |
| Corniche, complete Magic Land, VDN | none | later, after the gameplay phase | n/a |
| `lab/roi-des-arenes-threejs` | 1 commit, isolated combat prototype | lab, keep | n/a |

## KNOWN BUGS (all older than #37, none introduced by it)
- `scripts/check-life-loop.mjs`: « rest — awake, standing beside the bed » fails on desktop and phone (58 of 60 pass), same result on the candidate before the save fix.
- `scripts/check-economy.mjs`: « service rows show pay, energy cost and distance » fails on the Pikine gare rows (48 of 49 pass); the check expects the older row format.
- Two v5 tabs on one device: the last to save wins. Progress made on an older client after a rollback is not merged into v5 (docs/SAVES.md).
- `docs/LAUNCH.md` still says to put the production branch back on `main` after PR #1; the Cloudflare Branch control has to be read in the dashboard before any release (`wip/visual-pass` is the documented production branch).

## ARCHIVED (closed, history kept, no branch deleted)
- Character V6 (`lane/characters-v6`, `lane/characters-v6-archive-fullwork`): rejected by Habib on 12 Oct. Do not restart.
- Codex agent-studio scaffolding (`codex/agent-studio-active`, `codex/agent-studio-bootstrap`): role and review documents, no game code needed.
- Codex PRs #3, #4, #8, #10 and the other `codex/*` v1 lanes: the same features exist in the Claude line by feature, not by code (multiplayer presence in all hubs, launch controls, mosque and advertising boards); kept for reference only.
- `worktree-agent-*` branches (all one old Cloudflare agent commit), `lane/deep3`, `lane/deep4`, `lane/w3-city-old-arena-merge`, `ui/v2-skin` local merges: merge commits only.
- Plan items « Publish isolated test preview », « Morning report »: replaced by the per-branch Cloudflare previews and the PR reports.

## Handoff for the gameplay session
1. Read `docs/SAVES.md` first: never write a save key of another schema.
2. Work from `9ce15a5` (or `recover/small-fixes-20261017` once approved); never push to `wip/visual-pass`, `candidate/launch-20261016` or `candidate/launch-final-20261016`.
3. Priority order: existing gameplay systems; player freedom and world reactivity; Tiak, housing, business and social systems; later Corniche, Magic Land, VDN.
4. A good first step is DKAG-008 (duel input reset), then the two known check failures above.
