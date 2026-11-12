// The pilot vehicle against the procedural kit vehicle it replaces: three views, then wheels spinning and the front pair steering.
// Usage: node scripts/vehicles/shoot-pilot.mjs [baseUrl=http://127.0.0.1:5199/] [outDir=docs/vehicles/pilot] [id=compacte] [kind=sedan] [seed=14]
// Reads the numbers back from the live scene (wheel angles, positions) so the sheet says what the picture shows.
import { chromium } from 'playwright';
import fs from 'node:fs';
import sharp from 'sharp';

const [,, base = 'http://127.0.0.1:5199/', out = 'docs/vehicles/pilot', id = 'compacte', kind = 'sedan', seed = '14'] = process.argv;
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } }); page.setDefaultTimeout(180000);
const errors = []; page.on('pageerror', e => errors.push(String(e)));
await page.goto(`${base}?debug&vehicleModel=glb`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__dakar?.pos?.().hub);
await page.evaluate(() => { window.__dakar.setHour(11); document.body.querySelectorAll(':scope > *:not(canvas):not(script)').forEach(e => { e.style.visibility = 'hidden'; }); });
const info = await page.evaluate(async ([id, kind, seed]) => {
  const D = window.__dakar;
  D.kitShowroom({ vehicles: [{ kind, seed: Number(seed) }], x: 4000, z: 0, gap: 30 });
  const root = D.three.scene.getObjectByName('kit_showroom');
  const g = await D.kitGlb(id, kind, Number(seed));
  if (!g) return null;
  g.position.set(4000 + 34.5, 0.02, 0); root.add(g);
  return { stats: D.glbStats(id), kitX: 4000, glbX: 4034.5 };
}, [id, kind, seed]);
if (!info) { console.error('the GLB did not load'); process.exit(1); }
const shot = async (name, which, view, zoom = 1) => {
  await page.evaluate(([which, view, zoom, X]) => {
    const D = window.__dakar, x = which === 'kit' ? X.kit : X.glb, L = 4.5;
    const eye = { threeq: [x + 4.6 / zoom, 2.2, -5.6 / zoom], side: [x + 7.5 / zoom, 1.1, 0], front: [x, 1.2, 7.5 / zoom], rear: [x, 1.4, -7.2 / zoom], top: [x, 9, -0.5] }[view];
    D.cam(eye, [x, 0.7, 0]); D.render();
  }, [which, view, zoom, { kit: info.kitX, glb: info.glbX }]);
  await page.waitForTimeout(250);
  const f = `${out}/${name}.png`; await page.screenshot({ path: f }); return f;
};
const tiles = [];
for (const view of ['threeq', 'side', 'front', 'top']) { tiles.push([await shot(`kit-${view}`, 'kit', view), await shot(`glb-${view}`, 'glb', view)]); }
// wheels: drive the showroom for one second at 8 m/s, steering left, and read the angles back
const rig = await page.evaluate(() => {
  const D = window.__dakar, root = D.three.scene.getObjectByName('kit_showroom'), g = root.children.find(c => c.name.startsWith('glb_'));
  const read = () => Object.fromEntries(g.userData.glbRig.wheels.map(w => [w.spin.parent.name, { spinDeg: +(w.spin.rotation.x * 180 / Math.PI).toFixed(1), steerDeg: +((w.steer?.rotation.y ?? 0) * 180 / Math.PI).toFixed(1) }]));
  const before = read(); D.kitDrive(8, 0.5, 1); const after = read(); D.kitDrive(0, 0, 0.1);
  return { before, after, r: g.userData.glbRig.wheels.map(w => w.r) };
});
await page.evaluate(() => window.__dakar.kitDrive(8, 0.5, 0.5));
tiles.push([await shot('kit-steer', 'kit', 'threeq'), await shot('glb-steer', 'glb', 'threeq')]);
const W = 480, H = 270, comp = [];
for (const [i, [a, b]] of tiles.entries()) for (const [f, left] of [[a, 0], [b, W]]) comp.push({ input: await sharp(f).resize(W, H).toBuffer(), left, top: i * H });
await sharp({ create: { width: W * 2, height: H * tiles.length, channels: 3, background: '#222' } }).composite(comp).jpeg({ quality: 84 }).toFile(`${out}/sheet.jpg`);
fs.writeFileSync(`${out}/wheels.json`, JSON.stringify({ info, rig, errors }, null, 1));
console.log(JSON.stringify({ rig, errors }, null, 1));
await browser.close();
