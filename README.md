# Dakar Rek

Open-world life sim set in Dakar, with Senegalese wrestling (làmb) as its signature experience. Browser-first, built for cheap Android phones.

Stack: Three.js + TypeScript + Vite. Design document: "Dakar Rek — Game Design Document".

## Run

```bash
npm install
npm run dev        # desktop: http://localhost:5173 · phone on the same Wi-Fi: http://<your-computer-ip>:5173
npm run build      # typecheck + production build in dist/
npm run preview    # serve the production build
npm test           # unit tests (clock, save, needs, relationships, beats, arena sightlines)
```

Add `?debug` to the URL for the test hooks (`window.__dakar`). Add `?touch` on a desktop browser to show the touch controls.

## Layout

- `src/core` — clock, save, needs, input (no rendering)
- `src/world` — hub generation, content (actions, prices, travel)
- `src/actors` — character, crowd, decorative traffic, camera
- `src/social` — recurring cast, relationships, story beats (draft content)
- `src/lamb` — wrestling look, poses, percussion and arena/écurie scenes (unreviewed cultural drafts)
- `src/ui` — HUD and menus
- `assets-src` — Blender sources; `public/assets` — exported GLB
- `scripts/shots.mjs` — headless checks and screenshots (`node scripts/shots.mjs http://localhost:4173/ shots`)
- `docs/FEATURES.md` — implemented / partial / pending
- `docs/ASSET_REGISTER.md` — every asset and whether it is temporary
- `prototypes/` — earlier La Vie (2D) and Rue (3D driving) prototypes, kept for reuse

Guest saves live in the browser on one device. Transferable money will be server-authoritative (PostgreSQL ledger) once the backend exists.
