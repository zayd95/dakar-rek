# Meshy body proof (local, not part of the game)

Proves whether a Meshy body can share the game's `Humanoid` rig and animation interfaces. Nothing in `src/` imports this folder, and nothing here is built or deployed.

## Pipeline

    # 1. the Meshy body on the game's own skeleton (character_v4.glb: skeleton, skin and all clips kept)
    node scripts/meshy/transplant-to-v4-rig.mjs <rigged.glb> proof/meshy/out/meshy_m_v4rig.glb
    # 2. free quality and weight steps (optional)
    node scripts/meshy/simplify-body.mjs in.glb out.glb --smooth 60 --ratio 1 --tex 1024     # smooth normals (flat-shaded meshes)
    node scripts/meshy/simplify-body.mjs in.glb out.glb --smooth 60 --ratio 0.5 --error 0.004 --tex 512   # a low-detail version

Needs (not in package.json): `npm i --no-save @gltf-transform/core@4 @gltf-transform/functions@4 @gltf-transform/extensions@4 sharp meshoptimizer gl-matrix` (one command: npm prunes the others otherwise).
The sources are in the private archive (`private-archive/meshy-20261017/sources/<homme|femme>/rigged.glb`, never in git).

## Harness

    npx vite --port 5199 &                 # serves the repo root
    node proof/meshy/run-proof.mjs         # writes docs/meshy/proof/results.json (add --shots for the review images)

`harness.ts` drives the real `Humanoid` (gait, pose solvers, gestures, animation LOD, clip transitions) on four bodies: the shipped v4 male and female (control) and the two Meshy bodies, and measures the mesh surface, not only the bones: soles against the ground on foot, the seat contact, the grips and pegs of the real moto spec, the gestures' reach, the largest sudden movement across clip changes, body switching and fallback, and the cost of a body.

`viewer.html` and `shoot.mjs` render review shots (the game's lights and tone mapping); `debug.mjs` is a scratch probe.

## Real-game checks

The repo's own scripts run unchanged against builds where `assets/character_v4.glb` is replaced by a Meshy body (a temporary one-line material relaxation is needed so the texture shows; it is not committed): `check-gait`, `check-sit-stand`, `check-moto`, `check-gestures`. Logs: `docs/meshy/proof/game/<control|swap-m|swap-f>/`.
