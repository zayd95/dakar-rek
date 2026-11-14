# Published Roi des Arènes prototype — 2026-11-14

This directory contains the local Three.js implementation requested for reuse in Dakar Rek: both physiques, face/eye textures, procedural locomotion/contact practice, and original arm/waist/chest accessories. The chest X continues over the shoulders; there is no neck loop.

## Start

Run `npm ci`, then `npm run dev -- --port 5178` from this directory. Open the HTTP URL printed by Vite. `npm run build` includes strict typechecking. All runtime assets are included under `public/assets`; do not reconstruct the accessory from a prose description.

## Reuse map

- `public/assets/anatomy-study.glb` and `anatomy-study.json`: two physique morphs and retained rig.
- `src/character-finish.ts`, `src/face-material.ts`, `public/assets/face-atlas.json` and PNG maps: current face/hair/material work.
- `src/accessories.ts`: original fitted arm/waist sets and chest X without a neck loop.
- `src/locomotion.ts`, `src/motion-input.ts`: procedural walking and input.
- `src/contact-practice.ts`: proximity-held contact exercise; not a full combat controller.
- `ASSET_PROVENANCE.md` and `evidence/`: scope of reviewed asset rights and historical verification.
- `RECONCILIATION.md`: host integration audit pinned to the inspected release revision; repository-relative coordination paths in that report refer to the separate local RDA workspace.
- `UPSTREAM_BRIEF.md`: preserved original README from this lab branch before publication.

## Delivery limits

Build/typecheck passed again before publication on 2026-11-14; the existing bundle-size advisory remains. Historical browser/numerical evidence is included, not represented as a new phone or integration test. WEB-008 final independent review is pending. Representation remains culturally unverified.

Preparation scripts refer to external original asset inputs recorded in provenance; those full source assets are not redistributed. The supplied runtime derivative and eligible texture maps are sufficient to run this prototype.

This is a lab-branch source delivery, not a merge, deployment or finished Dakar integration. Keep Dakar's combat, identity, appearance choices, money, progression, save and presence ownership. Next owner: Dakar arena integration developer. Smallest next action: inspect the existing rig/pose contract and adapt one fighter in an isolated integration branch, using the included assets.
