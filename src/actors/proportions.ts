import * as THREE from 'three';

/**
 * The shared humanoid's head is a ball on a long neck (public/assets/character_v4.glb, bind pose: head mesh y 1.673–1.932,
 * 0.222 wide, 0.253 deep, 0.259 tall; the bare neck between collar and chin is about 11 cm). Habib, 12 Oct: « the faces
 * are too rounded, the neck too long », with a reference (low-poly people with a short neck and an oval face, a defined jaw).
 *
 * Done at load, in the bind pose, on vertices only (skinning, morph deltas, clips and draw calls are unchanged):
 *  - the head is lowered by `drop` (every vertex weighted mostly to the head bone: the head meshes, the face's details,
 *    hair, beard, kufi, headwrap — one position warp, so they stay on each other), and the jaw is lengthened by `jaw`
 *    (the lower half of the head is stretched down, the chin the most);
 *  - the width narrows with height (`cheek` at the cheeks, `chin` at the chin, `crown` at the top) and the depth a little
 *    (`depth`): an oval with a jaw instead of a sphere;
 *  - the body's neck vertices (weighted to the neck bone, above `from`) are lowered by the same drop, ramped from nothing
 *    at `from` to all of it at the head's base: the neck gets shorter, the joint (joinNeck, called first) stays inside the head.
 * Garments weighted to the neck (collars) do not move: the shoulders, the collar and the neck socket stay where they were.
 * Returns how many vertices moved.
 */
export interface Proportions { drop: number; jaw: number; chin: number; cheek: number; crown: number; depth: number; from: number }
export const PROPORTIONS: Proportions = { drop: 0.05, jaw: 0.022, chin: 0.84, cheek: 0.9, crown: 0.95, depth: 0.96, from: 1.56 };

const HEAD_BASE = 1.673, HEAD_TOP = 1.932;                     // the head mesh's bounding box in the bind pose
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => { const c = Math.min(1, Math.max(0, t)); return c * c * (3 - 2 * c); };

/** Where the head's bind-pose point (x, y, z) goes. */
export function warpHead(p: THREE.Vector3, o: Proportions = PROPORTIONS): THREE.Vector3 {
  const t = (p.y - HEAD_BASE) / (HEAD_TOP - HEAD_BASE);             // 0 chin .. 1 crown
  // width: chin -> cheeks (reached at 45 %) -> crown
  const sx = t < 0.45 ? lerp(o.chin, o.cheek, smooth(t / 0.45)) : lerp(o.cheek, o.crown, smooth((t - 0.45) / 0.55));
  const sz = lerp(1, o.depth, Math.sin(Math.PI * Math.min(1, Math.max(0, t))));   // depth: rounder back and face flattened mid-height
  // jaw: the part below 45 % is stretched down, the chin by `jaw`
  const stretch = o.jaw * Math.pow(Math.max(0, 1 - t / 0.45), 1.5);
  return p.set(p.x * sx, p.y - o.drop - stretch, p.z * sz);
}

export function reshapeCharacter(scene: THREE.Object3D, o: Proportions = PROPORTIONS): number {
  let moved = 0;
  const v = new THREE.Vector3();
  scene.traverse(m => {
    const s = m as THREE.SkinnedMesh;
    if (!s.isSkinnedMesh || !s.skeleton) return;
    const g = s.geometry, pos = g.getAttribute('position'), si = g.getAttribute('skinIndex'), sw = g.getAttribute('skinWeight');
    if (!pos || !si || !sw) return;
    const bones = s.skeleton.bones, head = bones.findIndex(b => b.name === 'head'), neck = bones.findIndex(b => b.name === 'neck');
    const isBody = s.name === 'DR_Body';
    let n = 0;
    for (let i = 0; i < pos.count; i++) {
      let b = 0;
      for (let c = 1; c < 4; c++) if (sw.getComponent(i, c) > sw.getComponent(i, b)) b = c;
      const bone = si.getComponent(i, b);
      if (bone === head && head >= 0) {
        v.set(pos.getX(i), pos.getY(i), pos.getZ(i)); warpHead(v, o); pos.setXYZ(i, v.x, v.y, v.z); n++;
      } else if (isBody && bone === neck && pos.getY(i) > o.from) {
        const y = pos.getY(i);
        pos.setY(i, y - o.drop * smooth((y - o.from) / (HEAD_BASE - o.from))); n++;
      }
    }
    if (!n) return;
    moved += n; pos.needsUpdate = true;
    g.computeBoundingBox(); g.computeBoundingSphere();
  });
  return moved;
}
