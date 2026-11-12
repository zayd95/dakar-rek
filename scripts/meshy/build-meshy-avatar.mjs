// Builds a game-ready avatar GLB from the raw Meshy downloads (rigged.glb, walking.glb, running.glb in <dir>).
// Usage: node scripts/build-meshy-avatar.mjs <dir with the three Meshy GLBs> <out.glb> [palmTwistDegrees=0] [textureSize=1024]
// Needs, outside package.json: npm i --no-save @gltf-transform/core@4 @gltf-transform/functions@4 @gltf-transform/extensions@4 sharp
// Merges Walk/Run, bakes a palm-inward forearm+hand twist (-75 was used for both avatars), makes Idle from the first Walk frame,
// keeps only the base colour texture as a 1024 px JPEG and drops tangents.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup } from '@gltf-transform/functions';
import sharp from 'sharp';
const [dir, out, twistArg = '0', maxArg = '1024'] = process.argv.slice(2);
const TWIST = Number(twistArg) * Math.PI / 180; // palm-inward twist spread over forearm and hand
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const base = await io.read(`${dir}/walking.glb`);
const root = base.getRoot();
const nodeByName = new Map(root.listNodes().map(n => [n.getName(), n]));
const rename = (a, n) => a.setName(n);
rename(root.listAnimations()[0], 'Walk');
for (const [file, name] of [['running.glb', 'Run']]) {
  const src = await io.read(`${dir}/${file}`);
  const a = src.getRoot().listAnimations()[0];
  const anim = base.createAnimation(name);
  for (const ch of a.listChannels()) {
    const target = nodeByName.get(ch.getTargetNode().getName());
    if (!target) { console.warn('missing node', ch.getTargetNode().getName()); continue; }
    const s = ch.getSampler();
    const mk = acc => base.createAccessor().setType(acc.getType()).setArray(acc.getArray().slice());
    const sampler = base.createAnimationSampler().setInput(mk(s.getInput())).setOutput(mk(s.getOutput())).setInterpolation(s.getInterpolation());
    anim.addSampler(sampler).addChannel(base.createAnimationChannel().setTargetNode(target).setTargetPath(ch.getTargetPath()).setSampler(sampler));
  }
}
// Palms: the stock clips keep the generated open-palm rotation. Twist forearm and hand about the bone axis so palms face the thighs.
function twist(anim) {
  for (const ch of anim.listChannels()) {
    const n = ch.getTargetNode().getName(), side = n.startsWith('Left') ? -1 : n.startsWith('Right') ? 1 : 0;
    if (!side || ch.getTargetPath() !== 'rotation') continue;
    const isHand = n.endsWith('Hand'), isFore = n.endsWith('ForeArm');
    if (!isHand && !isFore) continue;
    const child = isHand ? ch.getTargetNode() : root.listNodes().find(x => x.getName() === n.replace('ForeArm', 'Hand'));
    const t = child.getTranslation(); const L = Math.hypot(...t); const ax = t.map(v => v / L);
    const half = side * TWIST / 2 * 0.5 * 2 / 2; // each of the two joints takes half the total
    const sn = Math.sin(side * TWIST / 4), cs = Math.cos(side * TWIST / 4);
    const q = [ax[0] * sn, ax[1] * sn, ax[2] * sn, cs];
    const arr = ch.getSampler().getOutput().getArray();
    for (let i = 0; i < arr.length; i += 4) {
      const [x, y, z, w] = [arr[i], arr[i + 1], arr[i + 2], arr[i + 3]];
      const [qx, qy, qz, qw] = q; // q * r
      arr[i] = qw * x + qx * w + qy * z - qz * y; arr[i + 1] = qw * y - qx * z + qy * w + qz * x;
      arr[i + 2] = qw * z + qx * y - qy * x + qz * w; arr[i + 3] = qw * w - qx * x - qy * y - qz * z;
    }
  }
}
if (TWIST) for (const a of root.listAnimations()) twist(a);
// Idle: hold the first Walk frame (feet together, arms hanging at the sides) instead of the generated arms-out rest pose.
const idle = base.createAnimation('Idle');
for (const ch of root.listAnimations().find(a => a.getName() === 'Walk').listChannels()) {
  const o = ch.getSampler().getOutput(), n = o.getElementSize(), first = Array.from(o.getArray().slice(0, n));
  const input = base.createAccessor().setType('SCALAR').setArray(new Float32Array([0, 1 / 30]));
  const output = base.createAccessor().setType(o.getType()).setArray(new Float32Array([...first, ...first]));
  const sampler = base.createAnimationSampler().setInput(input).setOutput(output).setInterpolation('LINEAR');
  idle.addSampler(sampler).addChannel(base.createAnimationChannel().setTargetNode(ch.getTargetNode()).setTargetPath(ch.getTargetPath()).setSampler(sampler));
}
// textures: keep base colour only, 1024 JPEG
const mat = root.listMaterials()[0];
const bc = mat.getBaseColorTexture();
const jpg = await sharp(Buffer.from(bc.getImage())).resize(Number(maxArg), Number(maxArg)).jpeg({ quality: 84, mozjpeg: true }).toBuffer();
bc.setImage(new Uint8Array(jpg)).setMimeType('image/jpeg');
mat.setNormalTexture(null).setMetallicRoughnessTexture(null).setMetallicFactor(0).setRoughnessFactor(0.85);
for (const m of root.listMeshes()) for (const p of m.listPrimitives()) p.setAttribute('TANGENT', null);
await base.transform(prune(), dedup());
await io.write(out, base);
console.log('wrote', out, root.listAnimations().map(a => a.getName()));
