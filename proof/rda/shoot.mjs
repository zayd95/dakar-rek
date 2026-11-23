// Review shots of the RDA wrestlers through proof/rda/viewer.html. Usage (a vite server on the repo root at PORT):
//   PORT=5341 node proof/rda/shoot.mjs <outPrefix> '<setup JSON>' 'clip:t:view[:zoom[:ty]],...' [w] [h] [level]
import { chromium } from 'playwright';
const [prefix, setup, shots, w = '640', h = '640', level = 'high'] = process.argv.slice(2);
const exe = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const p = await b.newPage({ viewport: { width: +w, height: +h } });
p.on('pageerror', e => console.log('PAGEERR', String(e)));
p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('CONSOLE', m.text()); });
await p.goto(`http://127.0.0.1:${process.env.PORT ?? 5341}/proof/rda/viewer.html?w=${w}&h=${h}&level=${level}`);
await p.waitForFunction(() => window.ready, null, { timeout: 120000 });
console.log(JSON.stringify(await p.evaluate(s => window.setup(JSON.parse(s)), setup)));
let k = 0;
for (const s of shots.split(',')) {
  const [clip, t, view, zoom, ty] = s.split(':');
  const info = await p.evaluate(([c, t, v, z, y]) => window.show(c, +t, v, { zoom: z ? +z : 1, ty: y ? +y : undefined }), [clip, t, view, zoom, ty]);
  const file = `${prefix}-${String(k++).padStart(2, '0')}-${clip}-${view}.png`;
  await p.screenshot({ path: file }); console.log(file, JSON.stringify(info));
}
await b.close();
