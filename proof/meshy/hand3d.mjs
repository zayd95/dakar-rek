// The hand mesh alone (vertices of the hand bone, in the bone's frame, normal-coloured) from four fixed views, idle or with the grip morph at 1.
// Needs the dev server (npx vite --port 5199). node proof/meshy/hand3d.mjs <homme|femme> <L|R> <0|1 grip> <out.png>
import { chromium } from 'playwright';
import sharp from 'sharp';
const [av = 'homme', side = 'L', grip = '0', outFile = '/tmp/hand3d.png'] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const p = await (await b.newContext({ viewport: { width: 800, height: 800 } })).newPage(); p.setDefaultTimeout(120000);
await p.goto(`http://127.0.0.1:5199/?debug&avatar=${av}`, { waitUntil: 'load' });
await p.waitForFunction(() => window.__dakar?.pos?.().hub); await p.waitForTimeout(1500);
await p.evaluate(() => window.__dakar.pause(true)); await p.evaluate(() => window.__dakar.step(1 / 60, 60));
const data = await p.evaluate(([side, grip]) => {
  const g = window.__dakar.body().group; g.updateMatrixWorld(true); const m = []; g.traverse(o => { if (o.isSkinnedMesh) m.push(o); });
  const sk = m[0]; if (sk.morphTargetDictionary?.grip !== undefined) sk.morphTargetInfluences[sk.morphTargetDictionary.grip] = +grip;
  const bone = g.getObjectByName('hand' + side), idx = sk.skeleton.bones.indexOf(bone), gm = sk.geometry, si = gm.getAttribute('skinIndex'), sw = gm.getAttribute('skinWeight'), pos = gm.getAttribute('position');
  const inv = bone.matrixWorld.clone().invert(), v = new g.position.constructor(), keep = new Uint8Array(pos.count), P = new Float32Array(pos.count * 3); sk.skeleton.update();
  for (let i = 0; i < pos.count; i++) { let w = 0; for (let k = 0; k < 4; k++) if (si.getComponent(i, k) === idx) w += sw.getComponent(i, k); keep[i] = w > 0.5 ? 1 : 0; sk.getVertexPosition(i, v); v.applyMatrix4(sk.matrixWorld).applyMatrix4(inv); P.set([v.x, v.y, v.z], i * 3); }
  const I = gm.index.array, tris = []; for (let t = 0; t < I.length; t += 3) if (keep[I[t]] && keep[I[t + 1]] && keep[I[t + 2]]) tris.push(I[t], I[t + 1], I[t + 2]);
  return { P: Array.from(P), tris };
}, [side, grip]);
const views = [[[0, 0.1, -0.45], 'palm'], [[0, 0.1, 0.45], 'back'], [[0.45, 0.1, 0], 'edge'], [[-0.45, 0.1, 0], 'edge2']];
const shots = [];
for (const [cam] of views) {
  const png = await p.evaluate(async ({ data, cam }) => {
    const THREE = await import('/node_modules/three/build/three.module.js'); const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); r.setSize(400, 400);
    const sc = new THREE.Scene(); sc.background = new THREE.Color(0x2a2a2a); const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(data.P, 3)); g.setIndex(data.tris); g.computeVertexNormals();
    sc.add(new THREE.Mesh(g, new THREE.MeshNormalMaterial({ side: THREE.DoubleSide }))); const c = new THREE.PerspectiveCamera(30, 1, 0.01, 5); c.position.set(...cam); c.up.set(0, 1, 0); c.lookAt(0, 0.1, 0); r.render(sc, c); const u = r.domElement.toDataURL('image/png'); r.dispose(); return u;
  }, { data, cam });
  shots.push(Buffer.from(png.split(',')[1], 'base64'));
}
await sharp({ create: { width: 1600, height: 400, channels: 3, background: '#000' } }).composite(shots.map((s, i) => ({ input: s, left: i * 400, top: 0 }))).png().toFile(outFile);
await b.close();
