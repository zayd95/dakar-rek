// Builds the four shipped player-body files from the Meshy sources (rigged.glb per body, in the private archive, never in git):
//   public/assets/meshy/body_m.glb, body_m_low.glb, body_f.glb, body_f_low.glb
// Usage (repo root): node scripts/meshy/build-bodies.mjs [sources=private-archive/meshy-20261017/sources] [out=public/assets/meshy]
// Needs, outside package.json: npm i --no-save @gltf-transform/core@4 @gltf-transform/functions@4 @gltf-transform/extensions@4 meshoptimizer sharp
// Each body: transplant onto the v4 skeleton (with its relaxed hand, scripts/meshy/relax-hand.mjs, and the fist for the motorbike grip), the free quality steps, then the fist becomes a morph target.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
const [src = 'private-archive/meshy-20261017/sources', out = 'public/assets/meshy'] = process.argv.slice(2);
const tmp = 'proof/meshy/out'; fs.mkdirSync(tmp, { recursive: true }); fs.mkdirSync(out, { recursive: true });
const run = (script, args) => execFileSync('node', [`scripts/meshy/${script}`, ...args], { stdio: ['ignore', 'pipe', 'inherit'] }).toString();
// the hand of each body (see relax-hand.mjs for what the numbers are): the same relaxed shape, tuned per body where its mesh needs it
const HAND = {
  homme: ['--curl', '85', '--fan', '0.3', '--thumb-in', '30', '--thumb-flex', '25'],
  femme: ['--curl', '85', '--fan', '0.3', '--thumb-in', '30', '--thumb-flex', '25', '--finger-scale', '0.92', '--finger-thick', '1.12'],   // her source mesh has long, thin, pointed fingers
};
// the homme's own fit (scripts/meshy/transplant-to-v4-rig.mjs): his arm joints moved to his real shoulders (Meshy's rig put his spine line in front of his chest), the
// elbow straightened with dual quaternions over a smooth weight transition, its surface relaxed; the femme is built as she always was
const FIT = { homme: ['--joint-fit', '1', '--dqs', '1', '--elbow-fit', '1'], femme: [] };
// full: homme as transplanted (1024 px texture); femme with smooth normals across her split vertices. low: half the triangles for the homme, the femme at full detail with a 512 px texture (her mesh does not simplify without smearing the face)
const STEPS = {
  homme: { id: 'm', full: null, low: ['--smooth', '60', '--ratio', '0.5', '--error', '0.004', '--tex', '512'] },
  femme: { id: 'f', full: ['--smooth', '60', '--ratio', '1', '--tex', '1024'], low: ['--smooth', '60', '--ratio', '1', '--tex', '512'] },
};
for (const [body, { id, full, low }] of Object.entries(STEPS)) {
  const t = `${tmp}/${id}_t.glb`;
  run('transplant-to-v4-rig.mjs', [`${src}/${body}/rigged.glb`, t, ...HAND[body], ...FIT[body]]);
  if (body === 'homme') run('../avatar/sculpt-homme.mjs', [t]);   // his jaw, beard line and nose (before the low version is made from it)
  if (full) run('simplify-body.mjs', [t, `${out}/body_${id}.glb`, ...full]); else { fs.copyFileSync(t, `${out}/body_${id}.glb`); run('../avatar/smooth-normals.mjs', [`${out}/body_${id}.glb`]); }   // (the homme's full body is not simplified: its seams still get smooth light)
  run('simplify-body.mjs', [t, `${out}/body_${id}_low.glb`, ...low]);
  for (const f of [`${out}/body_${id}.glb`, `${out}/body_${id}_low.glb`]) { run('grip-morph.mjs', [f, f]); run('../avatar/add-hair.mjs', [f]); run('../avatar/pad-texture.mjs', [f]); }   // the fist for the motorbike grip, as a morph target (after simplify: simplify drops morph targets); then the studio's hair: the `_HAIR` attribute and the 'shave' morph target (read from the texture as made); then the texture's edge padding (no ground bleeding into the seams)
  console.log(body, fs.statSync(`${out}/body_${id}.glb`).size, fs.statSync(`${out}/body_${id}_low.glb`).size);
}
