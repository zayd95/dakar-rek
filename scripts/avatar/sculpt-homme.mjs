// Surgical corrections to the homme's head (the Meshy mesh as transplanted onto the v4 rig, before it is simplified for the low preset), as smooth displacement
// fields in the head's own space (metres; +y up, +z forward; measured from body_m: eyes 1.78, nose tip 1.745 at z 0.113, mouth 1.70, chin 1.655):
//   * the beard's lower edge hung forward and down under the jaw, a wedge pointing at the chest in profile: the under-chin is lifted and drawn back toward the throat
//     so the jaw meets the neck at a believable angle, and the chin's front comes back a little;
//   * the jaw's lower corners were squared off (a box from the front): the lower jaw is tapered toward the chin;
//   * the nose's tip stood out as a wedge with a pinched bridge: the tip is drawn back a little and the bridge eased (the nostrils' width kept).
// Only vertices above the collar move (and the weights, UVs, morph inputs stay as they are), so the rig, the animations and the texture keep working. The femme is never
// passed through it. In place, deterministic. Usage: node scripts/avatar/sculpt-homme.mjs <body.glb> [--strength 1]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const [file, ...rest] = process.argv.slice(2), opt = (n, d) => { const i = rest.indexOf(`--${n}`); return i < 0 ? d : Number(rest[i + 1]); };
const K = opt('strength', 1);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS), doc = await io.read(file);
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const bump = (x, c, w) => Math.exp(-(((x - c) / w) ** 2));

/** The displacement at a point of the head (never below the collar). */
function field(x, y, z) {
  if (y < 1.56) return [0, 0, 0];
  const ax = Math.abs(x), sx = Math.sign(x) || 1;
  let dx = 0, dy = 0, dz = 0;
  // 1. the under-chin: lifted (most at the chin's bottom, nothing at the throat) and drawn back; the lips and the neck's front stay
  const under = ss(0.005, 0.06, z) * (1 - ss(1.655, 1.69, y)) * ss(1.585, 1.615, y) * (1 - ss(0.055, 0.085, ax));
  dy += 0.011 * under * ss(0.02, 0.075, z);
  dz += -0.009 * under * ss(0.03, 0.085, z);
  // 2. the chin's front, a touch back (its point, not the lip)
  dz += -0.002 * bump(y, 1.652, 0.016) * ss(0.06, 0.088, z) * (1 - ss(0.03, 0.05, ax));
  // 3. the lower jaw tapered toward the chin (from the angle of the jaw down): its sides come in, its corners round off
  const jaw = ss(0.025, 0.06, ax) * (1 - ss(1.665, 1.72, y)) * ss(1.6, 1.63, y) * ss(-0.03, 0.02, z) * (1 - ss(0.09, 0.105, ax));
  dx += -sx * 0.007 * jaw;
  dy += 0.003 * jaw * ss(0.04, 0.07, ax);
  // 4. the nose: the tip drawn back and eased, the bridge filled a little where it was pinched (the width at the nostrils kept)
  const nose = (1 - ss(0.016, 0.03, ax)) * bump(y, 1.748, 0.014) * ss(0.095, 0.113, z);
  dz += -0.0045 * nose;
  const bridge = (1 - ss(0.008, 0.02, ax)) * bump(y, 1.772, 0.01) * ss(0.075, 0.095, z);
  dz += 0.0015 * bridge;
  return [dx * K, dy * K, dz * K];
}

let moved = 0, maxD = 0;
for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
  const pos = prim.getAttribute('POSITION'), p = [0, 0, 0];
  for (let i = 0; i < pos.getCount(); i++) {
    pos.getElement(i, p);
    const d = field(p[0], p[1], p[2]), m = Math.hypot(...d);
    if (m < 1e-6) continue;
    pos.setElement(i, [p[0] + d[0], p[1] + d[1], p[2] + d[2]]); moved++; maxD = Math.max(maxD, m);
  }
}
await io.write(file, doc);
console.log(JSON.stringify({ file, moved, maxDisplacementMm: +(maxD * 1000).toFixed(1), strength: K }));
