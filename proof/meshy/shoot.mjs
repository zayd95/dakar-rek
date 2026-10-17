// Renders review shots of one or more GLBs. Usage: node proof/meshy/shoot.mjs <outPrefix> <files comma list> <shots "clip:t:view[:LEFT],..."> [size]
import { chromium } from 'playwright';
const [prefix, files, shots, size = '560'] = process.argv.slice(2);
const exe = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const p = await b.newPage({ viewport: { width: +size, height: +size } });
p.on('pageerror', e => console.log('PAGEERR', String(e)));
await p.goto(`http://127.0.0.1:5199/proof/meshy/viewer.html?files=${encodeURIComponent(files)}&w=${size}&h=${size}`);
await p.waitForFunction(() => window.ready, null, { timeout: 60000 });
let k = 0;
for (const s of shots.split(',')) { const [clip, t, view, focus] = s.split(':'); await p.evaluate(([c, t, v, f]) => window.show(c, +t, v, f), [clip, t, view, focus ?? 'RIGHT']); await p.screenshot({ path: `${prefix}-${String(k++).padStart(2, '0')}-${clip}-${view}.png` }); }
await b.close();
