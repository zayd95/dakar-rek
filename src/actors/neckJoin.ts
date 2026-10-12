import * as THREE from 'three';

/**
 * The shared humanoid's neck ends under the head instead of in it (public/assets/character_v4.glb, measured in the bind
 * pose: the body's neck stops at y 1.661 with a 6 cm radius, the head mesh starts at y 1.673): from the front or the
 * side every character's head looks set on the body, not joined to it (Habib, 12 Oct: « the head is detached »).
 *
 * The neck's upper part — the body's vertices weighted mostly to the neck bone, above `from` — is carried up into the
 * head (`lift` at the top, less lower down) and widened a little around its own axis (`widen` at the top), in the bind
 * pose: the joint is inside the head from every angle, and stays there as the head nods or turns. Skinning, morph targets
 * (relative deltas), clips and draw calls are unchanged. Returns how many vertices moved.
 */
export function joinNeck(scene: THREE.Object3D, { body = 'DR_Body', from = 1.62, lift = 0.05, widen = 0.25 } = {}): number {
  let moved = 0;
  scene.traverse(o => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isSkinnedMesh || m.name !== body || !m.skeleton) return;
    const g = m.geometry, pos = g.getAttribute('position'), si = g.getAttribute('skinIndex'), sw = g.getAttribute('skinWeight');
    const neck = m.skeleton.bones.findIndex(b => b.name === 'neck');
    if (!pos || !si || !sw || neck < 0) return;
    const dominant = (i: number) => {
      let b = 0;
      for (let c = 1; c < 4; c++) if (sw.getComponent(i, c) > sw.getComponent(i, b)) b = c;
      return si.getComponent(i, b);
    };
    const upper: number[] = [];
    let top = -Infinity, cx = 0, cz = 0;
    for (let i = 0; i < pos.count; i++) {
      if (dominant(i) !== neck || pos.getY(i) <= from) continue;
      upper.push(i); top = Math.max(top, pos.getY(i)); cx += pos.getX(i); cz += pos.getZ(i);
    }
    if (!upper.length || !(top > from)) return;
    cx /= upper.length; cz /= upper.length;                         // the neck's own axis (it is not on the body's)
    for (const i of upper) {
      const t = (pos.getY(i) - from) / (top - from), k = 1 + widen * t;
      pos.setXYZ(i, cx + (pos.getX(i) - cx) * k, pos.getY(i) + lift * t, cz + (pos.getZ(i) - cz) * k);
    }
    moved += upper.length;
    pos.needsUpdate = true;
    g.computeBoundingBox(); g.computeBoundingSphere();
  });
  return moved;
}
