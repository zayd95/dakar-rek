# Male hand repair — PR #60 avatar branch

## Scope and diagnosis

Audited `feature/avatar-studio-v6-20261020` at `951fe34` and repaired only `body_m.glb` and `body_m_low.glb`. The source body has one welded `Meshy_Body` primitive and a 20-joint skeleton. Its 13 animation clips use the same skeleton; there are no finger joints. The hand surface is too coarse and welded across the finger gaps. The existing relaxation step only offsets vertices and cannot split those connected surfaces into separate digits. In the clay close-ups at fixed camera poses, the webbing and elongated/spiky finger silhouette remain visible without the production texture, which rules out lighting, texture, or camera framing as the cause.

The replacement is an offline procedural mesh operation. It cuts each hand at a reproducible wrist plane, preserves the forearm-side boundary, and rebuilds only the palm, four fingers and thumb. The wrist collar blends hand and forearm weights; new hand vertices follow the existing `hand.L` / `hand.R` bones. Existing `grip` is used for the motorcycle grip; no finger articulation is claimed because the rig has no phalanx bones. The repair pass runs last after simplification so finger gaps cannot be re-welded. It is male-only and guarded to accept only the two male GLB filenames.

No arm orientation, bone transform, inverse-bind matrix, face, nose, chin, shoulders, body geometry outside the wrist cut, female asset, texture, animation clip, or paid generation service was changed. The complete and low male GLBs remain complete, textured, rigged assets.

## Measurements

| Asset | Before | After | Change |
|---|---:|---:|---:|
| `body_m.glb` | 15,354 vertices / 13,904 triangles / 1,574,552 bytes | 13,958 / 13,496 / 1,458,864 bytes | -1,396 vertices; -408 triangles; -115,688 bytes |
| `body_m_low.glb` | 8,533 vertices / 6,952 triangles / 847,840 bytes | 7,930 / 7,418 / 839,732 bytes | -603 vertices; +466 triangles; -8,108 bytes |

The low model remains 42.4% smaller than full by bytes. In a 375×667 CSS-pixel mobile emulation at DPR 2, the rendered close-up used 731 hand triangles after repair versus 462 before (+269, +58% for the cropped hand surface). The low GLB transferred 839,732 bytes. The page reported no runtime errors. This is browser emulation, not a physical-device benchmark.

Independent repair runs on the same original inputs produced identical SHA-256 outputs: full `611fe9e20c2799a996c6d6665ae68a591d08d72aa8369b1cd519d1e4242719b7`; low `c5371b1de602b6dadd8b6bf8a183f9fbe36ab3cc523a8dba750585a7bde98fce`.

## Integrity and checks

- Both male assets retain all 20 joints, the same inverse bind matrices, the same 13 clips and animation accessor values, and morph targets `grip` and `shave`; all vertex weights remain normalized. Texture hashes are unchanged.
- Female GLBs are byte-identical to the base branch.
- Fixed-camera before/after clay close-ups cover left and right hands from palm, back and profile, at rest and during idle, walk, run, motorcycle grip and representative gestures. Matched comparison sheets are included alongside this report.
- `npm test`: 151 files, 1,811 passed, 2 skipped. `npm run build` and `npm run typecheck:server` passed. Gait check: 26/26 desktop/phone scenarios passed; maximum measured slide was 1.3 cm per step (2 cm threshold).
- Phone-emulated car check passed showroom and purchase, parked interaction, Sit driver pose, driving, wheel rotation and steering, three camera views, wall stop, and curb exit. It stalled in a later reload-while-driving scenario; the full car script is therefore partial.
- Phone-emulated motorcycle check passed showroom/purchase, ownership, Ride pose, acceleration, steering, wall stop, riding delivery and exit/save-reload park. It stalled at a later repeated mid-ride reload scenario; the full motorcycle script is partial.

## Limitations

The branch checkout does not contain `private-archive/meshy-20261017/sources`, so the full source-to-four-assets build could not be run. The repair was tested directly and repeatably on the branch's existing male GLBs, and its final male-only invocation is integrated into `scripts/meshy/build-bodies.mjs`. The supplied attachment previews show the studio flow but do not include diagnostic close-ups of the male hands; fixed-camera mesh captures from the branch assets were used to isolate the geometry. Car uses the existing `Sit` animation and has no car-specific wrist/wheel IK, so the hand repair does not alter its arm pose.
