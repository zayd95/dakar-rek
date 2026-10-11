# Roi des Arènes — independent Three.js combat prototype

**Status:** incubating, isolated from Dakar Rek's gameplay / deployment.  
**Branch:** `lab/roi-des-arenes-threejs` (created from known-green `integration/living-dakar`).  
**Workspace:** `experiments/roi-des-arenes/`. The game must be runnable independently from this workspace, without importing Dakar Rek runtime state. Do not touch the main game's configuration, existing arena, routes, saves, deployments, or Claude agents.

## Goal

Validate whether an independent 3D game of Senegalese wrestling can feel genuinely fun and look believable. If the answer is yes, build the full stand-alone game; later adapt selected shared logic/assets to Dakar Rek as a lighter mini-game. No production deployment, merge, or PR into Dakar Rek until explicit user approval.

## Visual contract

- Big, human-proportioned adult wrestlers: powerful shoulders, neck, chest, back and legs; physically credible mass, realistic skin shading and `ngemb`; **not block/LEGO avatars**.
- Faces may be subtly stylized to control asset cost, but torsos, musculature, silhouettes and movements must look like convincing wrestlers.
- At least two distinct physiques (heavyweight and athletic); no simple global upscaling of Dakar Rek's default small avatar.
- Use original or properly licensed source assets; document Blender/rig sources and licenses.
- Target responsive graphics rather than expensive cinematic lighting.

## Proof gates (in this order)

1. **Fighter quality:** 2 strong-looking fighters, stance/front/side/back, visibly articulated anatomy, garment fitting.
2. **Locomotion:** footwork, circling, guard, feint, pivot, start/stop, no foot slide, believable weight and speed.
3. **Contact:** grip placement, synchronized reaction, hand/foot IK as necessary, pushes and resistance, off-balance, takedown, fall, satisfying impact. Inputs and outcomes must remain player-controlled; don't hide bad contact under canned cinematics.
4. **Performance:** test with two fighters and arena on desktop and a representative affordable Android phone; measure FPS, draw calls, memory, and input latency. Aspiration: 60 FPS capable PC, 30 FPS midrange mobile. Do not claim this until tested.

Only after 1–4 pass do we add audience, career, online multiplayer, event economy, customization, etc. If convincing contacts cannot be achieved cost-effectively in Three.js, revisit technology before scaling scope.

## Constraints

- This project is an **independent browser game** made with Three.js, TypeScript and Vite, not a replacement for Dakar Rek's existing làmb.
- Build code under this workspace with its own entrypoint and tests; reuse eligible ideas/assets after checking compatibility, quality and licenses, **never** by coupling to the Dakar Rek main game.
- Preserve all existing app branches, pipelines and production. Do not instruct, launch or interrupt Claude agents.
- Keep the work in **one existing Roi des Arènes ChatGPT project/session**, not several parallel development sessions.
- Commit small tested improvements on this isolated branch; report verified builds and playable prototype links only when available.
