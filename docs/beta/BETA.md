# External beta (not tied to a Claude account)

**Status: bundle and instructions ready; no public link published.** No authorised non-production host was available to
this session, and publishing an unapproved public URL is out of bounds. Below: what the beta is, how to build the bundle,
the exact blocker on the intended host, and the options for the owner.

## What testers get
- The unified beta branch `integration/unified-beta-20261022`: the life-sim beta (phone hub, HUD, persistence, cockpit,
  VTC, world fixes, activities, audio, Avatar Studio).
- A **visible build id** (`src/core/build.ts`): `<commit>-<yyyymmdd>` at the bottom of Réglages, and at the top of every
  report copied with Réglages › « Signaler un problème ». The Claude artifact preview shows `…-apercu`.
- Their game is kept in their browser on their device, with « Copier ma sauvegarde » / « Importer une sauvegarde » to move
  it (docs/SAVES.md § « Where the save lives »). Nothing synchronises between devices.
- The report template: `docs/beta/FEEDBACK_TEMPLATE.md` (French, for testers).

## Build the bundle
```bash
npm ci
npm run build            # solo bundle: dist/ (static files; plays fully, without the other players)
npm run build:online     # online bundle: dist/ + the Worker (server/worker.ts) for multiplayer presence
```
`dist/` is a static site (relative paths, `base: './'`): any static host serves it. Set `BUILD_ID=<name>` in the
environment to name the build (otherwise `<commit>-<date>`). The solo bundle never contacts a game server; the online one
needs the Worker and its two Durable Objects (`wrangler.jsonc`).

## The intended host and its exact blocker
The project's beta path is a **Cloudflare Worker Preview** of the branch (`npx wrangler preview`, Workers Builds on a
non-production branch). `wrangler.jsonc` gives every preview its own two Durable Object namespaces (`ROOMS`, `LOBBIES`),
so test players never join production rooms.

**Blocker:** the Cloudflare account has reached its Durable Object namespace limit, so a new preview cannot create its
namespaces and the « Workers Builds » preview check fails (it fails on this branch's base too:
zayd95/dakar-rek#63, zayd95/dakar-rek#64). This session did **not** delete namespaces, upgrade the plan, change
production settings or deploy anything: those are the owner's decisions.

Production safety: **`wip/visual-pass` is Workers Builds' production branch** (docs/LAUNCH.md): any push there redeploys the
public recette. The beta lives on its own branch and must not be merged there for a beta.

## Options for the owner (any one unblocks a link)
1. **Free capacity in Cloudflare** (owner, in the dashboard): remove obsolete preview Durable Object namespaces of old preview
   Workers (an earlier read-only audit in this project listed candidates; nothing was deleted), then re-run the preview build
   of this branch: multiplayer beta, isolated from production.
2. **A static solo beta** on a host the owner approves (Cloudflare Pages, Netlify, GitHub Pages, Vercel…): upload
   `dist/` from `npm run build`. No game server, no Durable Object, no production impact; testers play solo.
3. **The Claude artifact preview** stays available for the owner (needs a Claude account; keeps a copy of the save on
   that account, docs/SAVES.md).

After a link exists: `npm run check:online -- https://<link>/` (online bundle only), then share the link with
`docs/beta/FEEDBACK_TEMPLATE.md`.
