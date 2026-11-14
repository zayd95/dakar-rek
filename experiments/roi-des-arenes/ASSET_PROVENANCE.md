# Provenance de l’étude anatomique WEB-001

Statut des éléments de licence : `research-supported`. Statut des représentations culturelles : `unverified`. Aucun élément n’est `practitioner-approved`.

## Source locale et périmètre retenu

Source en lecture seule : `/Users/habibdiallo/DakarRek-assets/character_v6.glb` (2 246 304 octets).

SHA-256 : `43fd6955e610bcf1d5a1258c2ca610d24c2c253d27bf1d759c61ef505cfcbcb2`.

Le fichier source comporte 20 meshes et 18 animations. Le dérivé ne conserve que Body, Eyes, Brows et Lashes, leurs attributs anatomiques et le rig à 31 joints. Le GLB dérivé ne contient aucun vêtement, coiffure, chaussure, texture ou animation du fichier complet. Des textures CC0 vérifiées séparément sont ajoutées au runtime sous WEB-004 (voir plus bas). La licence du fichier complet n’est pas inférée de celle de ses composants retenus.

Les identifiants de composants suivants correspondent aux en-têtes du pack système MakeHuman CC0 local (`mh_packs/makehuman_system_assets_cc0.zip`) et aux métadonnées des composants de l’export :

| Mesh | Composant | UUID |
|---|---|---|
| Body | male1591 | d7e4934e-daed-4ad5-a055-18c9cba487dc |
| Eyes | low-poly eyes | 1cc97a30-85a1-42e6-a9f7-b3e753732baa |
| Brows | eyebrow001 | 9c81ec3a-faa5-4c94-9cdb-992300ba3084 |
| Lashes | eyelashes01 | d533836f-13ad-4836-8b65-051108253cd2 |

Les quatre en-têtes indiquent explicitement la mise à disposition CC0 en septembre 2020, avec Data Collection AB, Joel Palmius et Jonas Hauquier comme titulaires à cette date. Copies des en-têtes et empreintes des fichiers du pack : `evidence/asset-license-headers.txt`. Les politiques officielles de [MPFB](https://github.com/makehumancommunity/mpfb2/blob/master/LICENSE.md) et [son usage dans des productions fermées](https://static.makehumancommunity.org/mpfb/faq/use_in_closed_source.html) distinguent la licence de l’outil de celle des exports et des assets. L’exemption d’export ne constitue pas une validation d’un vêtement tiers.

Le rig installé `cmu_mb` de MPFB présente les mêmes 31 noms de joints que l’export. Il s’agit d’une correspondance de noms, pas d’une preuve d’identité des poids ou de toute la géométrie. Le fichier `.blend` voisin n’a pas été vérifié : l’inspection Blender a échoué avant son chargement. Les scripts et identifiants de source ne prouvent aucune authenticité ethnique ou culturelle.

## Dérivé livré

`public/assets/anatomy-study.glb` : 1 103 544 octets, SHA-256 `990f1806a19e940e66b67a1482dcda8509a90e206cae948bbf89f6b4274d9257`. Le manifeste voisin consigne quatre meshes, 31 joints, deux morphs, zéro animation et zéro texture. Body contient 6 322 vertices et 12 560 triangles après un passage de lissage Loop. La source originale est vérifiée inchangée par le script.

`scripts/prepare-study.py` extrait les composants autorisés, reconstruit les buffers nécessaires et crée AthleticStudy / HeavyStudy à partir des cibles anatomiques de la source, avec des ajustements localisés des épaules, poitrine, taille, cuisses et cou. `scripts/smooth_mesh.py` lisse le corps et ses deux morphs, recalcule les normales et interpole les poids de skinning. Les deux figures utilisent exactement la même échelle d’affichage 1,07.

Le viewer crée des shorts d’étude en découpant la surface du bas du corps entre deux hauteurs, interpolant les attributs et les poids aux intersections, puis décalant la surface selon les normales morphées. Ce vêtement original minimal couvre les figures ; ce n’est pas un ngemb authentifié. Les pupilles/iris sont de nouvelles sphères simples. Les matériaux, socles, lumière, interface et icône sont créés pour cette étude. Les dérivés anatomiques gardent le périmètre CC0 des composants examinés ; aucune cession de droits sur la source complète n’est affirmée.

## Limites de la revue

Le reviewer indépendant a inspecté les licences, les empreintes, les buffers, les indices, les morphs et le skinning. Cette revue ne remplace ni une décision artistique du directeur créatif, ni un conseil juridique, ni l’avis culturel d’un praticien sénégalais. Anatomie et morphologie sont des approximations visuelles à revoir, sans likeness, tenue, geste ou règle culturelle approuvés.

## WEB-002 original procedural motion

`src/locomotion.ts` creates generic walking from the retained rig using two-bone leg solving, world-space foot placement and restrained arm motion. It uses no inherited animation clip, capture, third-party animation package or culturally named technique. New neutral practice grid/control UI adds no external asset. The rig/GLB hash is unchanged. Motion remains prototype fiction, culturally `unverified`. D-008’s supplied screenshot is a quality reference only; no model or texture is extracted from it.

## WEB-003 original finish

`src/character-finish.ts` authors an original short scalp surface from the reviewed body triangles, clips a neutral hairline with interpolated skin weights/morphs and offsets it 4 mm along the normals. It shares the unchanged body rig. The resulting caps contain 736 / 730 triangles for the two profiles. This is a generic study haircut, not a culturally approved style.

New curved iris/pupil patches derive their anchors from each physique's actual morphed eye surface and attach in Head-local space. No likeness, eye/hair texture, screenshot geometry or source clothing is copied. Skin/hair/fabric variation is original deterministic mesh-local procedural shader work; no image files, external calls or new packages are used. Source body and exported GLB remain unchanged. The supplied IMG_1455.PNG sets a quality target only; this first pass does not establish equivalent realism.

The original brow strip coordinate/mask is fitted from inspected neutral boundaries over the reviewed cloned Brow geometry, alpha-tested with matching shadow casting disabled. Untextured source eyelash cards are hidden because they read as solid eyeliner; their source geometry remains unchanged. This first-pass simplification leaves fine lashes and individual hair strands unresolved.

## WEB-004 reviewed face atlas and feature maps — 2026-10-13

Added runtime `skin_m.png`, `eye_brown.png`, `brows.png` and `lashes.png` are byte-identical to reviewed system-pack entries, not original-generated textures. Exact hashes, archive paths, archive hash and corresponding `.mhmat` names are in `evidence/WEB-004-texture-provenance.json`; full matching licence headers in `evidence/WEB-004-texture-licenses.txt` explicitly record CC0 release in September 2020. Source Body UVs independently match reviewed male1591 OBJ coordinates after the glTF V flip within 4.47e-8. Status: `research-supported`; photographic asset detail establishes neither identity nor cultural/creative approval.

`prepare-face-atlas.py` reads the original and retained GLBs without changing them. It replays the existing Loop ordering, verifies all retained basis positions (max rounding difference 5.96e-8), and reconstructs per-source-face corner UVs using linear face-varying subdivision. A separate `face-atlas.json` maps 643 UV seam duplicates: runtime Body has 6,965 vertices / unchanged 12,560 triangles. Every position, normal, colour, skin index/weight and physique morph is copied exactly; seam UVs are never averaged across atlas islands. Native Eyes/Brows/Lashes keep their reviewed UVs and geometry.

`face-material.ts` blends the licensed skin albedo over the head/neck only, uses restrained shader tinting and physical eye gloss, mutes the source eye atlas's red saturation, and attenuates lower lash cards. Old procedural eye/brow overlays are omitted in this mode; the original generic short scalp remains. Shader program keys include physique-specific tint variants. Atlas/component validation and bounded six-second loading precede committing the optional finish; unavailable/invalid face details retain the prior study with a visible note. `?face=previous` reproduces WEB-003 for comparison.

No likeness is extracted from the supplied IMG_1455.PNG. Original source/study GLBs, 108 Unity files and approved physique/rig/movement remain unchanged. Head/body detail contrast, inherited expression/topology, baked scalp hair under the short shell and sharp brow edges remain provisional. Reference equivalence, human taste, cultural authenticity and physical-device performance remain `unverified`.

## WEB-007 original worn accessories — 2026-10-20

`src/accessories.ts` creates original external leather pouch, flap, seam, band and cord geometry; no downloaded model/texture/photo or paid operation. It samples closed contours from each actual morphed body, retaining interpolated skin weights for surface strips/tubes. Pouches are fitted to the local flesh patch and attached to LeftArm/RightArm/Hips in bone-local coordinates. Both physiques keep the original rig/body/face and 1.07 common scale. There are five original pouches and5,704 added triangles per physique. No cloth physics or final contact behaviour is claimed.

Documentary references: [AP / Misper Apawu wrestling gallery](https://www.ap.org/news-highlights/spotlights/2026/in-senegals-wrestling-arenas-rituals-share-the-spotlight-with-the-fight-in-photos/), [British Museum leather case Af.5109](https://www.britishmuseum.org/collection/object/E_Af-5109_1). They were consulted for context, not copied as textures, scans, decoration or a person's individual arrangement. Exact authored placement/design is `unverified` creative placeholder fiction, CULT-ASSET-005. Named Senegalese human advice is required before final culturally specific use. No inscriptions, religious contents, ritual, claimed effects, real likeness, source-photo licence or cultural approval is inferred.

## WEB-008 original crossed chest cords — 2026-10-23

Seven user-supplied photographs guide the requested X arrangement only; no photo is imported, traced as a texture, or used to reproduce an individual kit/likeness. Original front/back cords are projected onto each actual morphed torso with interpolated rig weights. A separate shoulder bridge joins each front/back upper attachment; the earlier neck loop was removed at the user's request. A lower torso cord and one uninscribed Spine1-local pouch complete the chest-owned set. The independent chest switch retains arm/waist sets. All accessories total 11,304 added triangles and six pouches per physique. Source assets and body/face/rig remain unchanged; no new dependencies or services.

Exact design is culturally `unverified` (CULT-ASSET-006); named Senegalese human advice is required for final culturally specific use. No ritual, inscription, religious contents, claimed powers or photo reproduction rights inferred. Numeric clearance and selected UI poses do not establish continuous cloth/accessory collision or physical-device performance.
