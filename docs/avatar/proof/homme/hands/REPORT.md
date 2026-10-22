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

Final state (head of this branch), on a production build served by `vite preview`:

| Check | Result |
|---|---|
| `npx vitest run` | 151 files, 1,811 passed, 2 skipped |
| `tsc --noEmit`, `npm run typecheck:server` | clean |
| `check-car` (Berline moderne: buy, board, drive, views, wall, reload) | 44/44 |
| `check-moto` (Jakarta: buy, ride, reload mid-ride) | 36/36 |
| `check-tiak-moto` | 57/57 on the re-run; one phone check (« during a Tiak run the parcel is in the box ») failed in the first run of the suite and passed in an isolated re-run of the same build |
| `check-gait`, `check-sit-stand`, `check-stride`, `check-gestures`, `check-stop` | 26/26, 22/22, 12/12, 20/20, pass |
| `check-avatar` (femme and homme, studio flow, layout) | 30/30 |
| `check-studio` (phone portrait and landscape, edit flow, career untouched) | 52/52 |
| `npm run check:online` (two browsers, local Workers/Durable Objects only) | 46/46 |
| `scripts/meshy/audit-male-hands.mjs`, full and low | pass (below) |
| two complete rebuilds from the private sources | identical bytes; femme identical to the base |

The arm part of the earlier rounds (Taubin fairing of the upper arm and forearm, 2.5 cm cap, sleeve excluded) is unchanged; its clay views are [full-arm side](male-arm-side-before-after.jpg), [Ride/Sit](male-arm-ride-sit-before-after.jpg) and [low-mesh mobile](male-arm-mobile-low-before-after.jpg).

## Final correction (textured, six tones)

The previous round fixed the three defects it was shown, but the hands still read as smooth plastic: one texel for the whole hand, fingers 13 to 16 mm wide with pointed tips, a ledge where the thumb left the palm, and four extra non-manifold edges at the wrist. This round rebuilds the hand's shape and its texture mapping, and it was judged on textured renders in matching light (the sheets below), not on clay.

### 1. Skin colour (`repair-male-hands.mjs`)

- The atlas is a patchwork of Meshy islands: the old hand's UVs are scattered over all of it (bounding box 0..1024 px on both axes), so nothing can be fitted to the new fingers. The hand is now mapped *smoothly* (no seam, hence no ring) onto a small all-skin rectangle of the atlas (40 px on the 1024 px atlas, 20 px on the 512 px low one), chosen by search: every sampled texel within 60 RGB of the forearm, mean as near the forearm's as possible, with some grain left in it (a flat patch is a flat hand). The mapping is folded (mirrored), so it never leaves the patch and never jumps.
- What the forearm shows at the wrist is what its *triangles* sweep over the atlas, not its vertices' texels (vertex mean RGB 116,66,48; triangles within 6.5 cm of the wrist 102,53,36). The target is the triangle-sampled colour. The chosen patch is within 1.5 RGB of it on the full atlas (1.0 on the low one). Rendered unlit (`raw=1`), the forearm just above the wrist and the back of the hand measure RGB 103,41,25 and 105,43,24.
- The skin shader tones every texel against the body's mean skin, so equal texels give an equal result on all six tones: the hand and the forearm match on Clair, Medium and Ébène in the sheets below, and by construction on the three between.
- The mapping is not one pixel any more: the palm and the back of the hand carry the patch's own shading. Palm and back are not the same colour (a hand's never are); they are the same *family* as the forearm.

### 2. Wrists

- No band: the collar's first ring is still a copy of the wrist cut (same place, weights, normals, morphs), but each of its vertices now takes the patch texel nearest to the colour its own forearm vertex shows; between a collar vertex and the next, and from the collar to the first generated ring, the UVs only travel inside the patch, so no quad can sweep the atlas (the gold and black band) and no texel jumps at the cut.
- The shape step is gone too: the ledge where the thumb left the palm (a socket ring whose plane was 90 degrees off the thumb's first ring) is replaced by a thumb that leaves the socket straight out and bends towards the index, with the ring's own offsets rotated along the path; the web between thumb and palm is an ordinary concave crease.
- Wrist slivers: a cut through a vertex or along a UV seam's twin left zero-area triangles with two vertices in one place, which added a face to their edge. They are dropped, and the wrist loop is welded with the same 10 micrometre key as the audit.

### 3. Sleeves

- `repair-male-arms.mjs` (unchanged this round) excludes the sleeve and its hem from the fairing: nothing more than 6.5 cm above the elbow along the upper arm moves. Audited: **0 of 1,138** sleeve vertices move on the full model (0 of 669 on the low one); nothing outside the arms and hands moves (head, face, nose, chin, shoulders, torso, legs: 0 of 11,084 vertices, 0 mm).
- The greenish fringe at the hem was not geometry. Meshy's olive bled into the atlas along the sleeve, and the skin shader carried each texel's chroma onto the bare arm (`chroma` took the texel's hue relative to the reference skin, clamped at +40% green). The homme's bare arms are skin *by position*, not by hue; their chroma now follows the texel only where the texel is skin-coloured (`meshyLook.ts`: `chromaW = mix(max(hueSkin, head), 1., uFemale)`). The femme's pixels are unchanged by construction (`uFemale = 1`). The sleeve itself is not touched: its cloth mask, print and colour are as before.

### 4. Fingers

- Widths 15 / 17 / 18.5 / 17.5 mm (pinky to index; was 13 to 16) with a 2.2 mm web and a slight fan towards the tips; lengths 56 / 76 / 82 / 73 mm; curvature 34 to 43 degrees at rest, a 28 mm radius closed on the bar. Fingertips close into hemispheres (4 rings on the full mesh, 2 on the low one), not points.
- The build **refuses** a hand whose digits touch: the centrelines are checked against the radii, open and closed. Minimum flesh between neighbours, in mm (full mesh): pinky-ring 2.6, ring-middle 2.2, middle-index 2.5 at rest (2.5, 2.2, 2.4 closed); index-thumb 2.7 at rest, thumb-fingers 11 to 17 closed.
- The knuckle line rounds off to the fingers' own thickness and the vertex normals of the new shell are angle-weighted, so a sliver of a quad no longer decides the normal where a tube meets the palm.

### 5. Mesh health and preservation (`scripts/meshy/audit-male-hands.mjs`)

| | #60 base | previous round | this PR |
|---|---:|---:|---:|
| non-manifold welded edges, full / low | 9 / 8 | 13 / 8 | **9 / 8** |
| open edges, full / low | 8 / 4 | 8 / 4 | **8 / 4** |
| vertices / triangles, full | 15,354 / 13,904 | 14,025 / 13,496 | 14,261 / 13,970 |
| vertices / triangles, low | 8,533 / 6,952 | 7,980 / 7,418 | 8,100 / 7,658 |
| bytes, full / low | 1,574,552 / 847,840 | 1,462,636 / 842,548 | 1,488,264 / 855,508 |

The audit also checks that the arm skin moves at most 25 mm, that the sleeve and everything outside the arms and hands stays put, and that the skeleton is the same. Female GLBs are byte-identical to the base (`body_f` `e5fd992c…`, `body_f_low` `51b7819c…`). No Meshy credit, generation, purchase, force push, production or Cloudflare action was used.

Determinism: two complete runs of `scripts/meshy/build-bodies.mjs` from the private source archive give identical files. Full `78eb6991f9e891a019dd2bf44dee611d0f82fbaae6d3f84e0e71be9f1ab8b7e2`, low `a568d28a4dfae6d75b7c47683c676884da78aa568a4411d9087d89fd167ec536`.

### Renders (textured, same light and cameras, #60 before / this PR)

- All six tones, wrist to fingertips, back and palm, full and low meshes: [male-hands-six-tones-textured.jpg](male-hands-six-tones-textured.jpg).
- Hands and wrists, palm / back / thumb edge / little-finger edge, both hands, full and mobile-low meshes, three tones: [Light](male-hands-textured-tone0.jpg), [Medium](male-hands-textured-tone2.jpg), [Darkest](male-hands-textured-tone5.jpg).
- Arms at rest, shoulder to wrist, three tones, full and low: [male-arms-rest-textured.jpg](male-arms-rest-textured.jpg).
- Closed on the Jakarta grips, lab (three tones): [male-hands-ride-textured.jpg](male-hands-ride-textured.jpg); in game, with the bike, four cameras per hand: [male-hands-jakarta-grip-textured.jpg](male-hands-jakarta-grip-textured.jpg) (`scripts/avatar/hands-ingame-ride.mjs`).
- Walking and sitting: [walk](male-hands-walk-textured.jpg), [sit](male-hands-sit-textured.jpg).
- At the car's wheel, in game: [male-hands-car-wheel-textured.jpg](male-hands-car-wheel-textured.jpg) (`scripts/avatar/hands-ingame-car.mjs`). The game has no hands-on-the-wheel pose: the driver uses the `Sit` pose (hands forward, resting), and the cockpit view hides the body. The renders show that pose through the door window, the windscreen and from above; no pose was added.
- The lab (`scripts/avatar/hairlab.html`, `?frame=hand&hand=L|R&views=palm,dorsal,front,back`) gained a hand-following camera, palm and dorsal views (the torso clipped away), `raw=1` (the atlas as painted, no shader) and `normals=1`.

### Known limits

- The thumb root's web reads as a small grey crease in some lights (a concave surface at grazing angle takes the shader's rim sheen); it is a crease, not a hole (the mesh is closed there; the orientation audit is identical to the base).
- The low mesh gains 706 triangles over the base (6,952 to 7,658) for the fingertips' and thumb's rings; the full mesh is +66.
- The elbow's inner crook of the *low* mesh still shows a small navy triangle where its simplified UVs reach the texture's seam colour; it is in the base GLB as well and is not part of this correction.

