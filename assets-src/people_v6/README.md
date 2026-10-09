# Character v6 (people) — how it is built

Source file: `~/DakarRek-assets/people_mpfb_v1.blend` on Habib's Mac (Blender 5.2 + MPFB2 extension). Not in the repo yet (large, references MPFB data).

1. MPFB2 human: male, age 0.5, muscle 0.6, weight 0.5, proportions 0.6, height 0.46, African 1.0; `cmu_mb` rig;
   proxy `male1591` (1.6k vertices), skin `young_african_male`, eyes `low-poly`, `eyebrow001`, `eyelashes01`
   (MakeHuman system assets, CC0).
2. `garm_v5.py` + `specs_v5.py`: garments and hair generated around the proxy (cut from the body surface, lofted tubes,
   head caps, strands). Each has a fixed topology, so every body shape becomes a shape key.
3. `asm_v3.py`: builds the game meshes (collection `Game`), then captures the shapes Female, Heavy, Muscular, Old and
   HeavyF, MuscularF, OldF by refitting MPFB, plus the joint offsets (`morph_bones` on the rig, glTF axes).
   Blink is added on the eyelids and lashes; ambient occlusion is baked to vertex colours (Cycles).
4. `anim_v2.py`: CMU motion capture (mocap.cs.cmu.edu, cgspeed BVH) retargeted by bone direction matching, loops closed;
   Sit and Eat lowered to a 0.5 m hip height with two-bone IK on the legs; the v5 wrestling clips retargeted from
   `character_v5.glb`.
5. Export glTF (NLA tracks), then `node scripts/slim-character.mjs in.glb public/assets/character_v6.glb`
   (drops scale and non-hip translation tracks, softens the AO, keeps UVs and sockets).

Clip windows: Walk 93_07 f20+33, Run 09_01 f3+22, Idle 18_08 f130+102, Talk 18_08 f298+120, Phone 80_25 f98+110,
Sit 114_05 f6+156, Eat legs 114_05 f6 + upper body 79_15 f64 (124), Wave 13_26 f630+40.
