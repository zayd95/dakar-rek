# Male arm and hand repair — PR #60 avatar branch

## Diagnosis

Reviewed `feature/avatar-studio-v6-20261020` at `951fe34`, the supplied studio-flow video and screenshot, and fixed-camera renders of the male GLBs. The hand close-up alone was misleading: the deformation extended through the upper-arm/forearm skin, and the same angular folds appear in the base GLB before the hand patch. Matched clay renders rule out lighting, texture, and camera framing as the cause. The mesh is closed (8 boundary edges on the whole primitive, none in the arm region), so this is not an open hole. It is a geometry-shape problem, present before this repair.

The existing transplant script documents that the male source arms were bent about 100 degrees before fitting them to the game rig. Its DQS and elbow-weight fitting preserve the original mesh, but the remaining arm surface still has folds in the side view. The private source archive is absent from this checkout, so the exact source-stage cause cannot be reproduced here.

## Change

The final male-only pipeline now fairies the exposed upper-arm and forearm surface, then rebuilds the hands, then smooths normals across UV seams. The fairing welds UV duplicates for topology, uses bounded Taubin surface smoothing on vertices weighted to the male upper-arm/forearm bones, and caps movement at 2.5 cm per vertex. It leaves the shirt/shoulder seam and hands fixed. The hand rebuild remains offline and procedural, using the existing skeleton and motorcycle `grip` morph.

The female assets and all body geometry outside the male exposed arms and hands are unchanged. Bone transforms, inverse binds, skin weights, textures, animation clips, face and clothing were preserved. No Meshy generation, paid credits, force push, production or Cloudflare action was used.

## Measurements

| Asset | Before | After |
|---|---:|---:|
| `body_m.glb` | 15,354 vertices / 13,904 triangles / 1,574,552 bytes | 13,958 / 13,496 / 1,458,884 bytes |
| `body_m_low.glb` | 8,533 vertices / 6,952 triangles / 847,840 bytes | 7,930 / 7,418 / 839,748 bytes |

The arm fairing affects 656 welded vertices in the full model and 375 in the low model; the displacement cap is 25 mm. Independent runs of the complete local male repair sequence produced identical SHA-256 outputs: full `4e5707cfaf752805efdd9e9feca6f6b703667d3d4bb1ab39b3c3121e71cb6df7`; low `2d750627d37e5bdd913bbc1cd99822c703a724e0238ed43e2dcf021dc003070d`.

The low model remains 42.4% smaller than full by bytes. In a 375×667 CSS-pixel mobile emulation at DPR 2, the earlier close-up measured 731 rendered hand triangles after repair versus 462 before; this is a browser simulation, not a physical-device benchmark.

## Verification

- `npm test`: 151 files, 1,811 passed, 2 skipped. `npm run build` and `npm run typecheck:server` passed.
- Desktop and phone gait checks: 26/26 passed. Maximum measured foot slide was 1.3 cm per step on desktop and 1.7 cm on phone.
- Fixed-camera clay views cover the full arm at rest and in Ride/Sit, plus low-mesh mobile views. Side-profile folds are reduced; the rig and pose are unchanged. See [full-arm side views](male-arm-side-before-after.jpg), [Ride/Sit views](male-arm-ride-sit-before-after.jpg), and [low-mesh mobile views](male-arm-mobile-low-before-after.jpg).
- Earlier interactive car/Jakarta checks verified purchase, Ride/Sit driving poses, steering and vehicle controls but stalled in later reload-while-moving stages. Those interactive checks were not repeated after the arm fairing; the updated Ride/Sit proof is visual.
- Female GLBs remain byte-identical to the base branch: full SHA `e5fd992c872a222895b1a67192fcab1ec4e7baaa8fe0c50555456d47583e35e3`; low SHA `51b7819cda3e3968e9f8c10adfdcae88a3acf887d97981dcfbbe5c1b05eaeee8`.

## Review corrections (textured view)

The first version of this repair was judged from clay renders, which cannot show colour or texture. In the textured view three defects showed:

1. **Hands the wrong colour.** The rebuilt hands took one UV texel from the palm (RGB 220,137,112), about twice as bright as the forearm (116,63,44); the studio's skin shader tones each texel against the body's mean skin, so on the lightest tone the hands read nearly white. `repair-male-hands.mjs` now takes the candidate texel whose colour is nearest the forearm's own mean.
2. **Gold and black band at both wrists.** The collar's quads interpolated the wrist cut's old UVs towards the palm texel and swept the atlas between them. The collar's first ring is now a copy of the wrist cut (same place, weights, normals, morphs) carrying the skin texel's UV; the forearm keeps the original cut vertices.
3. **Olive fringe along the sleeve hem.** `repair-male-arms.mjs` also faired the sleeve and its hem vertices, which pulled the hem's olive rim into view. Vertices more than 6.5 cm above the elbow along the upper arm (the sleeve and its hem) are no longer moved.

Textured before/after: [hands on three skin tones](male-hands-skin-tones-textured-before-after.jpg), [arm](male-arm-textured-before-after.jpg), [low model hands](male-hands-mobile-low-textured-before-after.jpg), [low model arm](male-arm-mobile-low-textured-before-after.jpg). Top rows are the base (PR #60), bottom rows this branch.

The Measurements section above predates these corrections; the current figures are: `body_m.glb` 14,025 vertices / 13,496 triangles / 1,462,636 bytes (SHA-256 `8b12adcc222d39c2aa5156d354425671556b071e72b0401cbfb3255959bc7a3f`); `body_m_low.glb` 7,980 / 7,418 / 842,548 bytes (`31be7db61a7daca49f09f100b183d39dc59bc19142272f017183eb24f7548f21`). A full four-asset rebuild from the Meshy source (`scripts/meshy/build-bodies.mjs`, source archive present) reproduces both male files byte for byte and leaves the female GLBs byte-identical to the base. Rig, inverse binds, 13 clips, morph names and textures are unchanged. The car, Jakarta, moto, Tiak moto, gait, sit/stand, stride, gestures, stop, avatar and studio checks and the unit tests were re-run on this build.

Remaining limits: the hands are smooth and thin, without knuckle or nail detail; a faint olive tint can remain at the sleeve hem of the low model; the new hands add four non-manifold edges to the full model.

## Limitation

The checkout lacks `private-archive/meshy-20261017/sources`, so the complete four-asset source build could not be rerun. The two male GLBs were corrected directly and reproducibly, and both male-only passes are integrated into `scripts/meshy/build-bodies.mjs`.
