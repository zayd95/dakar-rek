// Contact sheet of an authored body from every side, in the game's materials. Usage: node scripts/vehicles/author/shoot.mjs <id> <out.jpg> [tint]
// (a dev server on 5199: npx vite --port 5199)
import { chromium } from 'playwright';
import sharp from 'sharp';
const [,, id, out, tint = ''] = process.argv;
const b = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 960, height: 600 } }); p.setDefaultTimeout(240000); p.on('pageerror', e => console.log('PAGEERR', String(e))); p.on('console', m => { if (m.type() === 'error') console.log('ERR', m.text()); });
await p.goto(`http://127.0.0.1:5199/scripts/vehicles/author/view.html?id=${id}${tint ? `&tint=${tint}` : ''}`);
await p.waitForFunction(() => window.ready);
console.log('size', await p.evaluate(() => window.size.map(v => +v.toFixed(3))), await p.evaluate(() => window.stats));
const views = (process.env.VIEWS ?? 'threeq,side,front,rear,threeqr,top,low,door,wheel').split(',');
const tiles = [];
for (const v of views) { await p.evaluate(v => window.show(v), v); tiles.push(await sharp(await p.screenshot()).resize(640, 400).toBuffer()); }
const cols = 3, rows = Math.ceil(tiles.length / cols);
await sharp({ create: { width: 640 * cols, height: 400 * rows, channels: 3, background: '#222' } }).composite(tiles.map((t, i) => ({ input: t, left: (i % cols) * 640, top: Math.floor(i / cols) * 400 }))).jpeg({ quality: 86 }).toFile(out);
await b.close(); console.log('written', out);
