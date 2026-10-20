# Character creator — what it does, what it cannot, how it is built

Branch `feature/avatar-creator-20261020` (from `feature/meshy-hero-bodies-20261017`). No Meshy credit was spent; no new asset was generated.

## The flow

* **Step 1 — name.** A first name (2–16 letters, digits, space, `'`, `-`), eight suggested names, one *Continuer* button (Enter on the keyboard does the same). A device that already has a chosen name shows it; the automatic guest name (`Dakarois 1A2B`) is not offered as a name.
* **Step 2 — Mon personnage.** The live 3D avatar (the real `Humanoid`: same GLB, rig, shader as in the game; drag to turn it; the camera comes close for the skin and the hair) and five rows: **Corps** (Homme / Femme), **Peau** (6), **Cheveux** (4), **Tenue** (3), **Couleur** (6). One action: **C'est moi → Jouer**. It starts the existing Pikine game: same house, 3 000 F, Tonton Ibou's welcome, nothing else changes.
* **Later.** Phone › Profil › **Modifier mon personnage** opens the same screen on the current look over the paused game (*Enregistrer* / *Annuler*). Body, skin, hair, outfit and colour can change at any time; nothing else is touched (tested: money, hub, counters, flags, relations, owned assets, inventory, jobs, ledger).
* A save made before the creator is never asked to create a character; it keeps its body exactly as it was (`appearance: null` = no tint, baked hair). Opened from the Profile, such a save starts the creator on the default look of its body.

## What each choice really does on a Meshy body

Each Meshy body is **one fused shell** (skin, clothes, shoes and hair in one surface with one base-colour texture): a garment or a hairstyle is not a layer that can be swapped. So only variations that work on that shell are offered.

| Choice | How | Limit |
|---|---|---|
| Body | the two existing Meshy bodies | — |
| Skin (6 tones, *Clair → Ébène*) | fragment shader (`src/actors/meshyLook.ts`): the texture's skin pixels are found by hue (per body) and re-lit to the tone, the texture's shading kept (lips, shadows, blush stay readable) | eyes, teeth, hair and clothes are untouched; the darkest tone loses some facial detail in shade |
| Outfit colour (6) | same shader on the main garment (homme: the tee; femme: the bomber) | a few small pixels of the same hue also follow (the femme's laces) |
| Outfit (3) | **Décontracté** (baked cut, plain colour), **Sport** (striped top, grey trousers), **Wax** (printed top, sand trousers). Prints are drawn in the shell's own model space, so they follow the animation; the trousers are recoloured between hips and shoes. The femme's inner top turns cream in Sport/Wax | **the silhouette is the same in all three** (a tee stays a tee, a bomber a bomber, jeans stay trousers). They are treatments, not new garments: no boubou, shorts, dress or suit is offered because the file cannot carry one |
| Hair (4) | **Court** (homme) / **Locks** (femme): the baked hair. **Rasé**: the `shave` morph target pulls the baked hair onto the skull and the `_HAIR` vertex attribute makes that scalp read as skin. **Afro**: procedural volume on the shaved head. **Foulard**: procedural headwrap (in the outfit colour) on the shaved head | no hair colour choice; the afro is a stylised low-poly volume, not Meshy hair; no braids or other cuts |

`scripts/avatar/add-hair.mjs` adds the `shave` target and `_HAIR` to the four shipped GLBs (in place, idempotent; `scripts/meshy/build-bodies.mjs` now runs it after `grip-morph.mjs`). `tests/appearance.test.ts` fails if a rebuilt GLB loses them. The GLBs grew by ~0.1 MB (homme) and ~0.4 MB (femme: 15 k hair vertices).

## Persistence

* `SaveData.appearance: Appearance | null` — additive field, **no schema bump**, no new key (`{ skin 0–5, hair, outfit 0–2, color 0–5 }`, sanitised on load; ignored when there is no body). The body stays `SaveData.avatar`.
* The first name goes to the existing presence profile (`dakarrek.presence.profile`, what other players read), as the multiplayer panel already does.
* **Save v6.** This branch is on the avatar lane (`dakarrek.guest.save.v5`, `avatar` nullable). The v6 line (integration candidate) has `avatar: Avatar` (never null) and no `appearance`: merging adds the same one optional field in `types.ts`/`save.ts` (`appearanceOf` already treats a missing or invalid value as « no look »). The creator must be offered on the v6 line when the New Game screen is shown (`settleAvatar`), as `avatarPick` was.

## What other players see

The online protocol carries a **name and a colour index (0–5) and nothing else** (`lookIndex`), and the standard v4 body. The six outfit colours are the six online shirt colours in the same order, so other players see the player's chosen colour on a standard body, with the chosen name. They do **not** see the Meshy body, the skin tone, the hair or the print: that needs a protocol and server change, not made here (no deploy).

## Checks

* `tests/appearance.test.ts` (rules, saves, shader uniforms, hair meshes, GLB contents) and `tests/avatar.test.ts`.
* `scripts/check-creator.mjs` (phone, real touch): the two steps, every row changes the live avatar (picture difference), six tones and six colours distinct, the save, reload, district change, edit/cancel/save, nothing lost, old saves, no console errors. `scripts/check-avatar.mjs` follows the creator now.
* `scripts/avatar/record-flow.mjs`: the whole journey as one MP4. Pictures and video: `docs/avatar/proof/`.
