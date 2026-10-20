# Character studio — first launch and « Modifier mon personnage »

Branch `feature/avatar-studio-v6-20261020`, built on the v6 integration candidate (`integration/candidate-vehicles-pikine-20261020`, PR #56's head) with the Meshy avatar
lane merged in. No Meshy credit spent, no asset bought, nothing deployed.

## What the player sees

1. **Welcome** (on screen as soon as the page loads — nothing 3D is needed yet; the bodies load meanwhile): « Bienvenue à Dakar. », a first name (any name, accents and
   spaces welcome; six Senegalese suggestions and a button for others; never required), one action: **Continuer**. A device that already has a chosen name shows it.
2. **Studio**: the real avatar large in the middle (the same GLB, rig, animation and shader as in the game), alive (idle, breathing, a slow sway), turned by a drag
   (with inertia), at a three-quarter angle. Four categories — **Corps · Peau · Coiffure · Tenue** — in one compact panel; only the open one shows its choices; they can be
   visited in any order or not at all. The camera comes to the face for Peau and Coiffure and goes back to the whole body for Corps and Tenue. Corps and Coiffure show
   pictures of the actual avatar in each choice (drawn by the studio's own renderer). One action stays on screen: **C'est moi → Jouer**.
3. **Into Dakar**: the panels go, the camera steps back, an arrival card (« Pikine — Bienvenue, Awa. ») covers the building of the world and fades once the game
   draws. The game is the existing start: the room in Pikine, 3 000 F, Tonton Ibou waiting — nothing added, nothing reset.
4. **Later**: Phone › Profil shows the avatar's own picture and **Modifier mon personnage**, which opens the same studio on the current body and look over the paused
   game (*Annuler* restores everything; *Enregistrer* changes the body and look only — checked: money, place, counters, flags, relations, owned things, inventory, jobs,
   ledger, career).

A save made before the studio never sees it. The future « choose your neighbourhood » step slots in between the name and the studio (the steps are panes of one
layer; the arrival card already takes the origin's name), without a redesign; no fake neighbourhood choice is offered now.

## The look, on fused Meshy shells

Each Meshy body is one surface with one texture (skin, clothes, hair together), so:

| Category | Choices | How |
|---|---|---|
| Corps | Homme, Femme | the two Meshy bodies; switching keeps the look (a style the other body lacks becomes its nearest: Kufi ↔ Foulard, Chignon → Afro) |
| Peau | Clair, Doré, Caramel, Cannelle, Brun, Ébène | shader: skin found by hue and, on the head, by elimination (not hair, eyes, teeth, gold, cloth); re-toned in gamma space, the texture's shading and local colour (lips, blush, shadows) carried onto the tone, highlights compressed (no chalky faces), gentler contrast and a soft sheen on dark tones (no crushed faces); checked in the studio light and in the game's noon and night light |
| Coiffure | homme: Court, Rasé, Afro, Kufi · femme: Locks, Afro, Chignon, Foulard | the baked hair taken in onto **each body's own skull** (`src/actors/headFit.json`, measured from the GLBs: the femme's head is 5 cm lower and smaller than the homme's) by the `shave` morph target; the scalp then reads as stubble (Rasé) or close-combed hair, the forehead the fringe covered as skin. Procedural styles grown on the same skull: an afro thick at the crown and thin at the hairline, with a coiled texture and a soft outline (three alpha-tested shells); a chignon (combed back to a puff, a tie in the garment's colour); a headwrap of three overlapping turns crossing over the forehead, with a knot and two wings, in the garment's colour and print; a kufi, flat-topped, ivory, with an embroidered band |
| Tenue | Uni, Rayé, Imprimé × six colours (Émeraude, Indigo, Terracotta, Safran, Prune, Ivoire) | shader on the main garment (homme: the tee; femme: the bomber, her top turning cream with a print): plain, stripes, or a geometric print in the spirit of West African printed and mud-dyed cloth (diamonds, dots, chevrons — not called « wax »), drawn in the body's own space so it follows the animation; Rayé and Imprimé come with grey and sand trousers, Uni with each body's own jeans repainted in their own colour. Nothing reaches the skin or the shoes |

**Clean seams.** Meshy bakes each body's texture as islands on a black (femme) or navy (homme) ground with no margin, so filtering pulled the ground into every seam:
dark and light lines on the clothes, and cloth texels the recolouring missed. `scripts/avatar/pad-texture.mjs` gives each texture a 16-texel edge padding (the
islands themselves unchanged; +110 KB for the homme's full body, +70 KB for the femme's), the garment mask also takes the seam texels between the waist and the collar,
the femme's painted waist under her bomber reads as trousers, and the texture's folds shade the new colour more softly (creases, not dirt).

**Limits that remain.** The silhouette of the clothes never changes (a tee stays a tee, a bomber a bomber, jeans stay trousers): the three outfits are treatments of the same
garments and are named for what they are. The afro, chignon, headwrap and kufi are lightweight procedural shapes, not sculpted hair; there is no hair colour. The
homme's « Rasé » keeps his beard. A strand painted into the femme's texture can show as a thin curl at the hairline, a few creases painted into her bomber stay
faintly visible, and on the lightest tones the homme's shaved head keeps a soft hairline at the forehead and temples. His mesh is Meshy's: a low-detail face (the eyes
are painted), and a few long triangles on the inner forearm that show as faint streaks up close.

## The homme: anatomy fixed in the asset pipeline

The homme was rebuilt from his Meshy source by the same pipeline (`node scripts/meshy/build-bodies.mjs <sources> <out>`, then both `body_m.glb` and
`body_m_low.glb` copied to `public/assets/meshy/`). The femme goes through it untouched: her two GLBs come out byte-identical, and her renders are pixel-identical to
before this pass (checked with the shader as it stood, 5 looks × 3 views). What changed, and why:

* **Detached arms.** Meshy's rig put his spine and neck joints ~8 cm in front of his chest, so v4's arm joints sat 7.7 cm in front of his real shoulders: fitted onto
  them, the arms were dragged forward off the torso (a stretched deltoid, a gap from the side). `transplant-to-v4-rig.mjs --joint-fit 1` gives his own copy of the
  skeleton its upper-arm joints at his shoulders (the remaining shift is 0); the inverse bind matrices and the clips' rest translations of those two bones are
  rewritten to match, so every clip still plays.
* **Elbows.** His source arms are bent ~100° and Meshy's elbow weights are a blend ~20 cm wide and uneven; in that pose the sleeve's inner hem lies against the
  forearm. Straightened, that gave a crumpled sleeve hem, a dent behind the elbow and a pinched crook, and the game's own bending folded them again.
  `--dqs 1 --elbow-fit 1`: the share of the forearm is solved over the arm's surface (harmonic weights, held at 0 on the sleeve and at 1 on the forearm 8 cm below the
  elbow), the elbow is straightened with dual quaternions over it, and the unfolded crook is relaxed (Taubin, volume kept); the solved weights stay as the skin weights,
  so a bent elbow in the game (moto, car, sitting, gestures) folds smoothly too.
* **Jaw, chin, beard, nose.** `scripts/avatar/sculpt-homme.mjs`: smooth displacement fields on the head only (nothing below the collar moves; weights, UVs and morph
  inputs unchanged). The beard's lower edge that hung forward under the jaw (a wedge pointing at the chest in profile) is lifted and drawn back to the throat, the chin's
  front eased, the lower jaw tapered (no box from the front), the nose's tip drawn back a little and its pinched bridge filled (nostril width kept). His features stay his.
* **Shaved head.** The shave morph's copies along a UV seam share their final normal (no crease on the crown); the cap meets the forehead at the skin's own level; the
  scalp takes the face's sheen (no helmet on dark tones); his tee's blue never paints a texel of his hair; the nape's painted hairline is skin.
* **Cost.** Same triangles (13 904 full, 6 952 low), vertices, 20 joints, 13 clips, 2 morphs, textures; +1.3 KB and +0.6 KB on the files.

Evidence (real Three.js renders, before | after, regenerated by `node scripts/avatar/homme-proof.mjs`): `docs/avatar/proof/homme/`.

## Persistence, multiplayer

* Save v6: `avatar` (never null; default homme) and `appearance: Appearance | null` (additive, sanitised: a broken value falls back to the body's defaults; missing =
  the body as made). No schema bump, no new save key. The Profile picture is kept apart (`dakarrek.portrait`, a 160 px JPEG with the look it shows; drawn again when
  the look changes; kept for the session when the device's storage refuses it, and drawn at most once per look). « Modifier mon personnage » on a save without a look
  starts from the body's own look in the shirt colour other players already see.
* The first name and the garment colour go to the presence profile (as before: what older clients and servers read). The look itself travels as an optional `app`
  parameter of the presence connection (five characters, strictly parsed, `appearanceCode`); a server that relays it (`server/worker.ts`, this branch — **not
  deployed**) adds it to the peer, and other players draw that peer's complexion, garment colour and print, trousers, femme shape and hairstyle or headwear on the
  standard body. An older server ignores the parameter and an older client the field: presence works as before either way. Other players are not drawn with the
  Meshy bodies (memory and draw cost with many players at once). A Meshy body's dances (played by its v4 stand-in) now reach the others as they did with the v4
  body: the pose sent is the stand-in's while it shows.

## Files

* `src/ui/characterStudio.ts` · `.css` — the layer: welcome, studio, arrival; `src/ui/studioStage.ts` — the live stage (own renderer while open, disposed with it).
* `src/actors/appearance.ts` — choices, rules, wire code; `src/actors/meshyLook.ts` — the skin and garment shader; `src/actors/hairStyles.ts` — hair and headwear;
  `src/actors/glslTextile.ts` — the print; `src/actors/portrait.ts` — stills from an existing renderer; `src/actors/studioLight.ts`; `src/actors/headFit.json`.
* `scripts/meshy/transplant-to-v4-rig.mjs` (`--joint-fit`, `--dqs`, `--elbow-fit`: the homme's shoulders and elbows), `scripts/avatar/sculpt-homme.mjs` (his jaw,
  chin and nose), `scripts/avatar/add-hair.mjs` (per-body skull, strands beside and over the face), `scripts/avatar/smooth-normals.mjs` (the homme's face seam),
  `scripts/avatar/pad-texture.mjs` (the textures' edge padding), all run by `scripts/meshy/build-bodies.mjs`; `scripts/avatar/hairlab.html` + `lab-shot.mjs` (any body × look × view × light × clip in one picture, `clay=1` for the geometry alone); `scripts/avatar/homme-proof.mjs`; `scripts/avatar/record-flow.mjs`.
* Checks: `tests/appearance.test.ts`, `tests/avatar.test.ts`, `scripts/check-studio.mjs`, `scripts/check-avatar.mjs`. Evidence: `docs/avatar/proof/`.
