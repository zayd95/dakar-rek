/**
 * Release 1.0: textures are freed when a district is left.
 *
 * three.js frees a geometry and a material when asked, but `material.dispose()` leaves the material's TEXTURES on the graphics card: they have to be freed one by one. A district's
 * dispose (src/world/builder.ts) freed geometries and materials only, so every sign, facade, awning and painted board of every district ever visited stayed in GPU memory: measured on
 * the accepted candidate, eight changes between two districts left 679 textures on the card for a scene that used 63. On a phone that is what ends in a lost WebGL context or a page
 * reloaded by the system.
 *
 * The sweep is deliberately generic (it does not need to know who made a texture): just before a district is left, note every texture the scene uses; once the next district stands,
 * free the ones the scene no longer uses. A freed texture that turns out to be needed again (a cached image shared between districts, a vehicle that comes back) is simply uploaded
 * again by three.js on its next draw: freeing is always safe, at worst it costs that upload. Render targets and video frames are never touched.
 *
 * The same goes for skeletons: every animated character has its own small bone texture (12 × 12 for the game's rig), which three.js frees only on `skeleton.dispose()`. Nobody
 * called it, so each passer-by of each district ever visited left one behind (about 90 a district change). The sweep frees the bone texture of every skeleton that has left the
 * scene; a pooled character that comes back gets a new one on its next draw.
 */
interface TextureLike { isTexture?: boolean; isRenderTargetTexture?: boolean; isVideoTexture?: boolean; uuid: string; dispose(): void }
interface MaterialLike { [k: string]: unknown; uniforms?: Record<string, { value: unknown }> }
interface SkeletonLike { uuid: string; boneTexture?: unknown; dispose(): void }
interface ObjectLike { material?: MaterialLike | MaterialLike[]; traverse(cb: (o: ObjectLike) => void): void; background?: unknown; environment?: unknown; isSkinnedMesh?: boolean; skeleton?: SkeletonLike }

const isTex = (v: unknown): v is TextureLike => !!v && typeof v === 'object' && (v as TextureLike).isTexture === true;
const keep = (t: TextureLike) => t.isRenderTargetTexture === true || t.isVideoTexture === true;

/** Every texture the objects under `root` draw with: the materials' maps (any property holding a texture) and the textures in a shader material's uniforms. */
export function texturesIn(root: ObjectLike, into = new Map<string, TextureLike>()): Map<string, TextureLike> {
  const add = (v: unknown) => { if (isTex(v) && !keep(v)) into.set(v.uuid, v); };
  add(root.background); add(root.environment);
  root.traverse(o => {
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      for (const k in m) { const v = m[k]; if (v && typeof v === 'object') add(v); }
      if (m.uniforms) for (const u in m.uniforms) { const v = m.uniforms[u]?.value; if (Array.isArray(v)) v.forEach(add); else add(v); }
    }
  });
  return into;
}

/** Every skeleton of the skinned meshes under `root`. */
export function skeletonsIn(root: ObjectLike, into = new Map<string, SkeletonLike>()): Map<string, SkeletonLike> {
  root.traverse(o => { if (o.isSkinnedMesh && o.skeleton) into.set(o.skeleton.uuid, o.skeleton); });
  return into;
}

export class TextureSweep {
  /** Textures seen in the scene since the last sweep (those of the district being left, and what its life added). */
  private seen = new Map<string, TextureLike>();
  private seenBones = new Map<string, SkeletonLike>();
  /** How many textures the sweeps have freed in all (the playtest report and the checks read it). */
  freed = 0;

  /** Note what the scene uses now. Called just before a district is left, and may be called at any quiet moment (a new sign, an interior entered). */
  note(scene: ObjectLike) { texturesIn(scene, this.seen); skeletonsIn(scene, this.seenBones); }

  /** The next district stands: free every noted texture (and bone texture) the scene no longer uses. Returns how many were freed. */
  sweep(scene: ObjectLike): number {
    const live = texturesIn(scene);
    let n = 0;
    for (const [id, t] of this.seen) if (!live.has(id)) { t.dispose(); n++; }
    this.seen = live;
    const bones = skeletonsIn(scene);
    for (const [id, k] of this.seenBones) if (!bones.has(id) && k.boneTexture) { k.dispose(); n++; }   // (a skeleton never drawn has no bone texture to free)
    this.seenBones = bones;
    this.freed += n;
    return n;
  }
}

/** The page's one sweep. */
export const textureSweep = new TextureSweep();
