import * as THREE from 'three';
import { rdaPartsDefault, type Build, type RdaPartsOn } from './rdaFlag';

/**
 * A Roi des Arènes body on the shared rig (public/assets/wrestlers/rda_wrestlers*.glb, built by scripts/wrestlers/build-rda-wrestlers.mjs;
 * docs/wrestling/RDA-INTEGRATION.md): its materials in Dakar Rek's conventions and its switches. Used by `Humanoid` for the body 'rda'.
 *
 * - The skin is the body's own Lambert colour (the wrestler's skin, `setSkin`), times RDA's per-vertex shading; on the head only (the
 *   vertex weight `faceW`), RDA's licensed CC0 skin atlas adds its detail (lips, eyelids, pores) normalised to its own mean colour, so the
 *   wrestler keeps his skin tone. Eyes, brows and lashes keep their CC0 maps (RDA's red iris muting baked into the eye map).
 * - Two physiques are two morph targets of one mesh (`AthleticStudy`, `HeavyStudy`): `setBuild` switches them, the hair, the ngemb and the
 *   face following; the accessory pieces are made per physique and shown with it.
 * - Accessory pieces (original geometry, cultural status unverified, off by default): `armsWaist` (the arm sets and the waist set, which
 *   then stand for the look's arm and waist placeholders) and `chest` (the chest X, its own switch).
 * Cosmetic only: nothing here changes a bout.
 */
export const RDA_TARGETS = ['AthleticStudy', 'HeavyStudy'] as const;
const PARTS = ['armL', 'armR', 'waist', 'chest'] as const;
type Part = (typeof PARTS)[number];
const BONES = ['root', 'hips', 'spine', 'chest', 'neck', 'head', 'shoulderL', 'upper_armL', 'forearmL', 'handL', 'shoulderR', 'upper_armR', 'forearmR', 'handR', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'];

/** A loaded RDA scene has the rig, the body with both physiques and every piece: else it is not used (v4 stays). */
export function validRdaScene(scene: THREE.Object3D): boolean {
  if (!BONES.every(n => scene.getObjectByName(n))) return false;
  const body = scene.getObjectByName('RDA_Body') as THREE.SkinnedMesh | undefined;
  if (!body?.isSkinnedMesh || !body.morphTargetDictionary || RDA_TARGETS.some(t => body.morphTargetDictionary![t] === undefined)) return false;
  if (!body.geometry.getAttribute('_facew') && !body.geometry.getAttribute('faceW')) return false;
  for (const b of ['athletic', 'heavy']) for (const p of PARTS) if (!scene.getObjectByName(`RDA_Acc_${b}_${p}`)) return false;
  return ['Ngemb_A', 'Ngemb_B', 'Hair_Short'].every(n => scene.getObjectByName(n));
}

const shared = new WeakMap<THREE.Texture, THREE.Material>();
let leather: THREE.MeshLambertMaterial | null = null;
const one = <M extends THREE.Material>(map: THREE.Texture | null, make: () => M): M => {
  if (!map) return make();
  const hit = shared.get(map) as M | undefined; if (hit) return hit;
  const m = make(); shared.set(map, m); return m;
};

/** The skin: Lambert in the wrestler's colour (the same Color object as the humanoid's skin material), RDA's face detail on the head. */
function skinMaterial(map: THREE.Texture | null, color: THREE.Color, faceMean: number[]): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ map, vertexColors: true, side: THREE.DoubleSide });
  m.color = color;
  const gain = new THREE.Vector3(...faceMean.map(x => 1 / Math.max(1e-3, x)));
  m.customProgramCacheKey = () => 'rda-skin-v1';
  m.onBeforeCompile = shader => {
    shader.uniforms.faceGain = { value: gain };
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float faceW; varying float vFaceW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFaceW = faceW;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 faceGain; varying float vFaceW;')
      .replace('#include <map_fragment>', `#ifdef USE_MAP
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * texture2D(map, vMapUv).rgb * faceGain, vFaceW);
      #endif`);
  };
  return m;
}

/** Live RDA bodies (the debug API reads them: src/main.ts `rda`). */
const live = new Set<WeakRef<RdaParts>>();
export function liveRdaParts(): RdaParts[] {
  const out: RdaParts[] = [];
  for (const r of live) { const p = r.deref(); if (!p || p.disposed) live.delete(r); else out.push(p); }
  return out;
}

export class RdaParts {
  build: Build = 'athletic';
  parts: RdaPartsOn = rdaPartsDefault();
  disposed = false;
  /** Dresses the wrestler again (its look's placeholders follow the piece switches): set by its humanoid. */
  redress: (() => void) | null = null;
  readonly body: THREE.SkinnedMesh;
  readonly pieces = new Map<string, THREE.SkinnedMesh>();
  private morphed: THREE.Mesh[] = [];
  /** Whether the face maps are on (the skin atlas on the body, the eye map). */
  readonly faceMaps: boolean;

  /** `meshes`: the RDA scene's meshes that are not the humanoid's own parts (body, face details, accessory pieces). */
  constructor(readonly root: THREE.Object3D, meshes: THREE.Mesh[], skinColor: THREE.Color) {
    let body: THREE.SkinnedMesh | null = null;
    for (const m of meshes) {
      const src = m.material as THREE.MeshStandardMaterial, map = src.map ?? null;
      if (m.name === 'RDA_Body') {
        body = m as THREE.SkinnedMesh;
        const g = m.geometry; if (!g.getAttribute('faceW')) g.setAttribute('faceW', g.getAttribute('_facew'));   // (the loader's name for _FACEW)
        if (map) map.anisotropy = 4;
        m.material = skinMaterial(map, skinColor, (m.userData.rdaFaceMean as number[] | undefined) ?? [1, 1, 1]);
      } else if (m.name.startsWith('HeadRdaEyes')) m.material = one(map, () => new THREE.MeshPhongMaterial({ map, color: 0xeee8dc, shininess: 70, specular: 0x2a2a2a }));
      else if (m.name.startsWith('HeadRdaBrows')) m.material = one(map, () => new THREE.MeshLambertMaterial({ map, color: 0xc6bcb0, alphaTest: 0.25, side: THREE.DoubleSide }));
      else if (m.name.startsWith('HeadRdaLashes')) m.material = one(map, () => new THREE.MeshLambertMaterial({ map, color: 0xc6bcb0, alphaTest: 0.45, side: THREE.DoubleSide }));
      else if (m.name.startsWith('RDA_Acc_')) { m.material = (leather ??= new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })); this.pieces.set(m.name, m as THREE.SkinnedMesh); }
      if (m.name.startsWith('HeadRda')) m.castShadow = false;
    }
    if (!body) throw new Error('RDA body missing');
    this.body = body;
    this.faceMaps = !!(body.material as THREE.MeshLambertMaterial).map;
    root.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh && m.morphTargetDictionary?.[RDA_TARGETS[0]] !== undefined) this.morphed.push(m); });
    this.setBuild('athletic');
    live.add(new WeakRef(this));
  }

  /** The physique: the heavy or the athletic morph at full weight (the base mesh between them is never shown). */
  setBuild(b: Build) {
    this.build = b;
    for (const m of this.morphed) {
      const d = m.morphTargetDictionary!, inf = m.morphTargetInfluences!;
      inf[d.AthleticStudy] = b === 'athletic' ? 1 : 0; inf[d.HeavyStudy] = b === 'heavy' ? 1 : 0;
    }
    this.refresh();
  }
  setParts(p: Partial<RdaPartsOn>) { Object.assign(this.parts, p); this.refresh(); }
  /** Whether an RDA piece stands for the look's placeholder on this socket. */
  replaces(socket: string) { return this.parts.armsWaist && (socket === 'armL' || socket === 'armR' || socket === 'waist'); }
  private refresh() {
    for (const [name, m] of this.pieces) {
      const [, , build, part] = name.split('_') as [string, string, Build, Part];
      m.visible = build === this.build && (part === 'chest' ? this.parts.chest : this.parts.armsWaist);
    }
  }
  /** The accessory pieces shown now. */
  shown(): THREE.SkinnedMesh[] { return [...this.pieces.values()].filter(m => m.visible); }
  /** Whether this body is drawn in a scene (for the debug API). */
  inScene(): boolean { let o: THREE.Object3D | null = this.root; while (o) { if ((o as THREE.Scene).isScene) return true; if (!o.visible) return false; o = o.parent; } return false; }
  dispose() { this.disposed = true; }
}

const PV = new THREE.Vector3(), BV = new THREE.Vector3();
/**
 * For the checks: each shown pouch's probe vertex (skinned, morphed: where it is drawn) and its distance to the bone it hangs on; the
 * body's skinned bounding box from every 12th vertex (a detached or exploded vertex would stretch it).
 */
export function measureRda(p: RdaParts) {
  const probes: { piece: string; bone: string; d: number }[] = [];
  p.root.updateWorldMatrix(true, true);
  // (the renderer refreshes an attached skinned mesh's bindMatrixInverse each frame; a body moved since its last frame needs it now)
  p.root.traverse(o => { const m = o as THREE.SkinnedMesh; if (m.isSkinnedMesh && m.bindMode === THREE.AttachedBindMode) m.bindMatrixInverse.copy(m.matrixWorld).invert(); });
  for (const m of p.shown()) for (const pr of (m.userData.rdaProbes as { vertex: number; bone: string }[] | undefined) ?? []) {
    const bone = p.root.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(pr.bone)); if (!bone) continue;
    m.getVertexPosition(pr.vertex, PV); m.localToWorld(PV);
    probes.push({ piece: m.name, bone: pr.bone, d: +PV.distanceTo(bone.getWorldPosition(BV)).toFixed(4) });
  }
  const box = new THREE.Box3(), pos = p.body.geometry.getAttribute('position'), hips = p.root.getObjectByName('hips')!.getWorldPosition(new THREE.Vector3());
  let reach = 0;
  for (let i = 0; i < pos.count; i += 12) { p.body.getVertexPosition(i, PV); p.body.localToWorld(PV); box.expandByPoint(PV); reach = Math.max(reach, PV.distanceTo(hips)); }
  const size = box.getSize(BV);
  // reach: the farthest sampled vertex from the hips (a body is about 1.2 m from its hips to a raised hand; a detached vertex is not)
  return { build: p.build, parts: { ...p.parts }, faceMaps: p.faceMaps, probes, reach: +reach.toFixed(3), box: { min: box.min.toArray().map(x => +x.toFixed(3)), size: size.toArray().map(x => +x.toFixed(3)) } };
}
