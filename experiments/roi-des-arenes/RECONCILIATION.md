# ROI DES ARÈNES × DAKAR REK — reconciliation and integration handoff

Date: 2026-11-14. Status: `ready` for planning handoff; implementation and independent acceptance are not complete. Owner: Astra. Decision: D-015.

## Recommendation

Keep Dakar Rek as the host and reuse its existing arena, duel, career, audio, save and multiplayer lifecycle. Adapt the Roi des Arènes fighter presentation to that duel. Do not import the standalone viewer as a second game, replace the host controller with the contact exercise, or port Unity runtime code.

The fastest complete match is the existing arena fighter route against one AI opponent, with a bounded visual/animation improvement, followed by its existing result and return flow. A free exhibition avoids making the first playable integration depend on Grand Camp escrow or authoritative competitive multiplayer. This is a proposed delivery sequence, not a reduction of the unified direction.

## Evidence and exact bases

- RDA workspace: `/Users/habibdiallo/Documents/ChatGPT/ROI DES ARENES`. Local Git is an unborn `main` with untracked project contents; no committed integration base or remote was established. Do not bulk-add/commit the workspace as a shortcut.
- RDA implementation: `experiments/roi-des-arenes/`; original incoming lab snapshot `ab142b84b17bff0a420a31d03f708f89e22c3126` is historical and does not contain all subsequent local work.
- Dakar Rek remote inspected: `zayd95/dakar-rek`, `release-1.0.1`, pinned head **`8d8ebfc34b885af2e4e5083986d0e0661b848ca4`**. All remote source findings below concern that revision, not a claim that the branch cannot advance.
- Local Dakar checkout: `/Users/habibdiallo/Documents/ChatGPT/Dakar rek/dakar-rek`, clean `codex/reference-character` at `ecbe629`; it is not the inspected release. Preserve it and other branches.
- Source inspection and earlier evidence were reviewed. No fresh browser playthrough, build, automated suite, phone benchmark or independent integration review was performed for this documentation-only audit.

Technical source findings are `research-supported` by repository inspection, not runtime certification. Cultural representation remains `unverified`; no `practitioner-approved` claim is made.

## What exists and what to reuse

| Area | Existing implementation | Reuse and remaining gap |
| --- | --- | --- |
| RDA fighters | Two morph-based physiques, retained rig, face materials, original hair/shorts, arm/waist pouches and chest X with clear neck | Reuse eligible geometry/materials through an adapter. Preserve provenance boundaries; final realism and device performance are outstanding. WEB-008 final independent review remains pending. |
| RDA movement | Procedural walking/turning, start/stop, world foot placement and leg IK; earlier numerical/UI evidence | Reuse foot-contact ideas and regression cases after rig compatibility checks. Do not run two root-motion/controllers on one fighter. |
| RDA contact | Proximity-gated held contact against a stationary partner | Useful exercise and state tests; it has no actual grip animation, opponent AI, balance contest or takedown. It is not the integrated combat engine. |
| RDA Unity | Movement/clinch components and historical tests | Preserve as a separate historical prototype. Reuse behavior/test ideas, not C# code or scenes in Three.js. |
| Dakar duel | `LambDuel`: intro, fight, clinch, fall, result; AI/styles, stamina, balance, push/pull/pivot, throws/counters and outcome presentation | Primary combat foundation. Convincing paired contact, hand placement, throw weight and mobile feel still need visual/runtime assessment. |
| Dakar arena | Fighter call/tunnel/preparation/ring/bout/return route, crowd/AI preliminaries, entrance and result cues, camera and soundscape | Reuse the complete match-day shell. Improve its existing cues and reactions rather than creating a separate cinematic scene/application. |
| Dakar progression | `recordBout` updates record, rank, purse, presentation and save | Preserve existing event ownership. Calling it twice would duplicate changes; do not add a second reward/result handler. |
| Dakar identity/network/save | Existing appearance/profile, presence client, reconnect path and versioned save; arena-together presence | Keep the live host context. Shared presence/spectating does not establish authoritative player-versus-player wrestling. |
| Dakar money | Local wallet and separate server-owned Teranga Money; pending operations, reference guards and transactional server ledger | Coordinate with its owner. Existing transfers are not proof of a Grand Camp escrow/settlement system. |

Both browser projects use Three.js 0.169, which helps compatibility but does not make their rigs interchangeable. Dakar's `Humanoid`/`StrikeRig` and RDA's skeleton need explicit bone, scale, pose and attachment mapping. Existing Dakar Meshy body support is not evidence that the user's requested Meshy assets have been inspected or approved for reuse.

### Combat issue to resolve first

Advanced clinch behavior is currently coupled to the duel's `frappe` path; the non-striking path uses a simpler effort interaction. For a proposed first match without strikes, separate advanced grappling eligibility from strike eligibility. Do not enable punches merely to obtain better clinches or regress the existing striking discipline. Confirm this with focused tests before animation work.

## Integration boundaries

1. **Host ownership:** Dakar owns identity, appearance choices, wallet, progression, presence connection and saved state. Arena entry receives the existing context; it does not create a guest identity, new connection, new wallet or second application root.
2. **Presentation adapter (proposed, not an existing API):** map the host fighter pose/appearance to a compatible RDA render rig. Limit initial replacement to the two active fighters; retain crowd LOD and existing city avatars. Preserve player customization; use the current host body as a fallback where mapping is unsupported.
3. **One motion owner:** the duel owns root movement and state. A presentation layer may solve bounded feet/hands or blend paired poses, but cannot independently move gameplay roots or apply a second combat simulation.
4. **Session lifecycle:** capture and restore only arena-owned camera/input/movement state. Keep networking alive. Remove listeners, effects and arena resources on finish, abandonment or failed load. Never restore an old full save/wallet snapshot on exit: concurrent money/messages/progression could otherwise be lost.
5. **One outcome path:** keep existing career dispatch; ensure exactly one result per bout. Organized pools need their own server-authoritative, idempotent settlement, not a client-generated win or a second local purse.
6. **Isolation:** at implementation start, re-read release head and current work ownership. Create a separate worktree/branch such as `codex/roi-arena-integration` from the verified release base, using the workspace worktree tooling. Keep the stale local character checkout and the lab branch intact. Import only inventoried eligible RDA files. Do not merge the old lab branch wholesale. No merge or deployment without user approval.
7. **Protected lots:** money/messaging, vehicles, Tiak Tiak, venues, F2 and Grand Camp remain with their owners. First adapter work should stay in arena/lamb/presentation files and focused tests; any shared contract change must be recorded and coordinated before editing.

## Grand Camp: shared organizer policy, format-specific rules

The inspected release document explicitly says the owner rules are **not yet implemented**. Its 6/10/14 participants, balanced teams and equal winner shares describe football. They must not become wrestling defaults.

Retain the user's common policy: default 1,000 F, valid custom whole amounts including 0 F; supported format/count; public/private invitations; available prize rules; informed acceptance before participation; actual collected fictional fees only; no arbitrary five-match daily cap. Show estimated pool separately from collected pool. A free match skips positive-only debit operations.

Proposed shared boundary: an immutable accepted rule version, stable match/player/operation identities, collection receipts, authoritative outcome, cancellation/refund and once-only settlement. The format supplies supported participants, outcome and valid distributions. The money owner supplies reservation/escrow and ledger operations; the arena must not invent money or accept a client-reported victory for pooled payouts.

Preserve pre-start refunds, cancellation recovery, reconnect behavior and duplicate protection. A settlement retry must not pay twice; a timeout alone must not cause both refund and payout. Reconcile persisted pending operations after reconnect. Test conservation of the actual collected pool.

Open choices remain: the football document's single-winner tiebreak and proposed 60-second post-start reconnect policy are explicitly unresolved there; wrestling also needs its own dropout/draw/outcome policy. Do not silently decide those by copying football behavior. Top-three payout requires a supported ranked tournament. These decisions do not block the initial free AI exhibition.

## Shortest delivery sequence

1. **Establish a host baseline:** in the isolated release checkout, replay one existing fighter-route match through return. Record identity/avatar/save/presence before and after, existing result behavior and a small render/performance baseline. Inventory the eligible RDA files and rig mapping. No new avatar polish or paid asset work.
2. **One bounded adapter:** integrate one compatible RDA fighter presentation with reversible host fallback; then the second opponent. Exercise idle, approach, clinch, fall and return before adding presentation detail. Retain player identity and customization.
3. **One convincing exchange:** enable advanced non-striking grappling cleanly, then improve one grip → balance break → paired throw → fall/recovery sequence. Prevent slipping hands, interpenetration and contradictory root motion. Keep other duel modes intact.
4. **Complete the match-day loop:** reuse entrance, crowd/audio cues, result and return. Vary opponent/style and reactions through existing systems; allow short/skippable presentation and reduced motion. Teach with brief contextual prompts, not instruction screens. Cultural details remain placeholders pending named human review.
5. **Verify before integration:** independent review plus iPhone/Android playthrough and regression evidence. Only after compatible delivery should the Grand Camp owner connect organized wrestling to approved shared match/ledger contracts.

No estimate promises a premium result from source inspection alone. Prioritize measured contact and mobile responsiveness over further face/accessory refinement.

## Acceptance and regression gates

- Complete entry → introduction → responsive movement/grip/balance/throw → victory or defeat → return, plus replay, abandon and loading failure. One result only, no duplicated career purse.
- Preserve the same identity/avatar and live presence connection; save/reload retains progress. Concurrent Teranga Money/messages during the bout survive exit and reconnection.
- Existing striking/non-striking modes and AI bouts remain usable; no two controllers, leaked input locks or retained arena listeners.
- Mobile touch: simultaneous movement/action, cancellation/backgrounding/orientation, legible short prompts and reachable controls. Actual iPhone/Android performance and sustained memory/frame behavior must be measured; desktop/narrow viewport is not a device pass.
- Compare draw calls/triangles/frame time to the release baseline. Retain crowd LOD, cap active detailed bodies and dispose temporary assets. Existing release budget notes are planning evidence, not measurements from this audit.
- Regression checks for vehicle recovery, continuous Tiak Tiak district transitions, living venues, F2 rental and money/messaging; coordinate their existing tests with their owners rather than modifying their systems.
- Later pooled matches: free/custom/default fees, insufficient funds, agreed-rule locking, cancellation, repeated readiness/settlement, disconnect before/after start, server restart and payout/refund conservation. These are future integration gates, not tests reported as passed.

## Source index

Pinned Dakar source root: https://github.com/zayd95/dakar-rek/tree/8d8ebfc34b885af2e4e5083986d0e0661b848ca4

Inspected paths: `src/lamb/duel.ts`, `src/lamb/clinch.ts`, `src/lamb/poses.ts`, `src/lamb/strikeRig.ts`, `src/actors/humanoid.ts`, `src/arena/module.ts`, `src/arena/fighter.ts`, `src/arena/soundscape.ts`, `src/arena/together.ts`, `src/career/module.ts`, `src/core/save.ts`, `src/economy/money.ts`, `src/multiplayer/client.ts`, `server/social.ts`, `package.json`, `docs/LAMB2.md`, `docs/release/AUDIT-1.0.1.md`, `docs/release/GRAND-CAMP-RULES-1.0.1.md`.

Grand Camp rules blob: `2ef8a3abe893ab23941b1e90fbea2e7f4b3bac1c`. Career module blob: `5597639c63f01a62a5580ad5fc74aa048690fbdd`; `recordBout` inspected at lines 191–239.

Local evidence: `state/handoff.md`, `state/threejs-handoff.md`, `project/reviews/WEB-002.md`, `WEB-004.md`, `WEB-006.md`, `WEB-007.md`, `WEB-008.md`, corresponding task records, experiment source/provenance and GAME-002 record. Historical checks have not been rerun for this audit.

## Handoff

- Status: `ready` for context transfer; audit task remains in review, no playable integration accepted.
- Files changed: this report, `project/design-decisions.md`, `state/project.yaml`, `state/handoff.md`, `tasks/review/INT-001.md`.
- Evidence: local implementation/records, pinned release sources, branch inventory and explicit user direction.
- Verification: read-only code/document comparison; documentation consistency checked. No new runtime tests, packages, assets, checkout, branch, commit, merge or deployment.
- Limits: physical contact quality, rig compatibility, phone performance, integration regressions and authoritative pooled PvP remain unverified. WEB-008 final independent review is still pending.
- Cultural assumptions: anatomy/accessories, wrestling rules/techniques, introductions, rituals, music and crowd representation require appropriate rights and named Senegalese adviser review for final use. No cultural authenticity inferred from existing code, names or photographs.
- Next owner: Astra to commission one Arena Integration Builder task, with independent QA before acceptance. No parallel implementation lot is activated by this report.
- Smallest next action: establish and record one existing Dakar fighter-route match baseline in an isolated checkout of the revalidated release, before adapting a single fighter.
