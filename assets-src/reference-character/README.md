# Reference character source

One reconstruction of the human's uploaded low-poly, Sims-inspired reference: angular human face,
short textured hair, goatee, five-finger hands, cream crew-neck tee/sneakers and teal cuffed trousers.
The reference image remains in the private workspace. Rear/occluded details are reconstruction choices.

## Sourcing decision

Fresh MakeHuman anatomy plus a fitted licensed tee was the efficient reusable model source. It provides
continuous facial anatomy, ears, realistic proportions and individual fingers, with weights for a new
52-bone Mixamo-compatible rig. The generator starts from `HS.create_human`; V4/V6 meshes and their
proportion/gait patches are not inputs. This is one fixed appearance, not a character creator.

| Source | Grant / provenance | Use |
| --- | --- | --- |
| MakeHuman hm08, targets, rig/weights bundled with MPFB | [Official asset/output license](https://github.com/makehumancommunity/makehuman/blob/master/makehuman/license.txt), CC0; saved legal dedication in `LICENSE-MakeHuman-assets.md` | Fresh anatomy and finger rig; generator parameters/face targets in `model.json` |
| `elvs_crude_t-shirt_male`, MakeHuman edited by Elvaerwyn | [Official shirts01 pack](https://static.makehumancommunity.org/assets/assetpacks/shirts01.html), CC0 both on the listing and `.mhclo` header | Connected garment, fitted to the new body; loosened 7 mm, neckline adjusted, decimated and recolored |
| Quaternius Universal Animation Library, current free Standard pack | [Author's download](https://quaternius.itch.io/universal-animation-library), CC0; original notice in `LICENSE-Quaternius.txt` | Walk, jog, sprint, sit/enter/exit, talk, celebration, kneel and driving motion |
| CMU Graphics Lab capture, cgspeed Daz-friendly BVH conversion by Bruce Hahne | [CMU usage permission](https://mocap.cs.cmu.edu/faqs.php), [conversion notice](https://sites.google.com/a/cgspeed.com/cgspeed/motion-capture/the-daz-friendly-bvh-release-of-cmus-motion-capture-database/readmefirst-file-for-daz-friendly-primary-release); saved in `LICENSE-CMU.txt` | Excerpts `18_08` frames 130–490 and `13_26` frames 977–1121 for relaxed idle and a real quarter-turn |

Hair curls, eye surfaces/brows, goatee, trouser cuffs and sneaker upper/sole/laces are authored by the
new generator. Upstream source grants apply to the listed inputs. No EA/The Sims asset is used.
Mixamo's account-based animation service was considered; the available CC0/capture route avoids an
account dependency. The official Standard library has no dedicated turn, hence the CMU capture.

`sources.json` records upstream input hashes, toolchain and the exported GLB hash. The upstream
tee fit data/OBJ/material (text whitespace normalized, original hashes retained) are in `tee-source`; its texture material is not shipped in the vertex-color GLB.

## Motion adaptation

`animate_reference.py` maps bone directions and rest rolls onto this rig, removes horizontal root
travel so game physics owns translation, and bakes at 60 Hz. This is a new retarget, not V4's numerical
gait. Idle uses an authored relaxed arm/body pose with attenuated captured motion and a closed
three-second loop. Turn retains the captured lower-body stepping with a calm upper body; game yaw
owns facing. Sole contact is measured from the actual shoe vertices, with bounded running flight and
5 mm interpolation clearance. A two-bone solve adapts the source's ankle paths to this anatomy while
preserving its knee bend plane, foot orientation and phase (walk ×1.35, jog ×0.48, sprint ×0.65).
Ground-speed retiming uses median backward sole speed during stance; the bake writes these measured
values to `src/actors/referenceMotion.json`, so runtime timing stays synchronized with the asset.
In the game, the reference body aligns that contact level with roads, sidewalks, block slabs and the
interior floor; raised paths use the existing `heightAt` data. Seated bodies retain the seat's origin.

The legacy seat contract is butt contact at 0.48 m above the origin. This anatomy needs its pelvis at
0.62 m for that contact, rather than putting the pelvis itself at 0.48 m. Sit transitions are one-shot;
moving can interrupt the exit. `animations.json` records clip sources/durations/contact offsets.
The seated arm retarget fits each wrist to its own thigh using a two-bone solve, preserves the
captured elbow bend plane and torso motion, and calibrates palm orientation from the finger spread.
Hands settle palm-down on the trousers. Entry/exit blend the fit and lift the hand briefly so curled
fingertips clear the fabric. Exported skin-to-trouser clearance is tested through all three clips;
this remains an adaptation of the licensed Quaternius capture, not a new capture source.

## Rebuild

The `.blend` contains the final mesh, rig and baked clips. Full regeneration needs Blender 5.2.2 with
the installed official MPFB extension (build 20260722), and the official Quaternius Standard GLB from
the archive pinned in `sources.json`. Scripts write only beneath the repository argument.

```sh
Blender --background --python scripts/character/build_reference.py -- /absolute/path/to/dakar-rek
Blender --background --python scripts/character/animate_reference.py -- /absolute/path/to/dakar-rek /absolute/path/to/UAL1_Standard.glb
npx vitest run tests/referenceCharacter.test.ts
```

Check logs for `REFERENCE_MODEL` / `REFERENCE_ANIMATIONS` and Python errors; Blender may return
zero even if an embedded script fails. MPFB authoring software is a separate dependency; exported
assets have the upstream asset grants described above.
