// Renders a generated body from six views (and its measured size) with proof/vehicles/glbview. Usage: node scripts/vehicles/shoot-glb.mjs <path under the project> <outPrefix> [yawDeg=0] [extra query]
// (dev server on 5199: npx vite --port 5199)
import { chromium } from 'playwright';
import fs from 'node:fs';
import sharp from 'sharp';
const [,, src, out, yaw = '0', extra = ''] = process.argv;
fs.mkdirSync(out.replace(/\/[^/]*$/, '') || '.', { recursive: true });
const b = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 800, height: 500 } }); p.setDefaultTimeout(240000); p.on('pageerror', e => console.log('PAGEERR', String(e)));
await p.goto(`http://127.0.0.1:5199/proof/vehicles/glbview.html?src=${encodeURIComponent('/' + src)}&yaw=${yaw}${extra}`);
await p.waitForFunction(() => window.ready);
console.log('size (x y z m):', (await p.evaluate(() => window.size)).map(v => +v.toFixed(3)).join(' x '));
const tiles = [];
for (const v of ['side', 'front', 'rear', 'threeq', 'threeqr', 'top']) { await p.evaluate(v => window.show(v), v); tiles.push(await sharp(await p.screenshot()).resize(480, 300).toBuffer()); }
await sharp({ create: { width: 480 * 3, height: 300 * 2, channels: 3, background: '#222' } }).composite(tiles.map((t, i) => ({ input: t, left: (i % 3) * 480, top: Math.floor(i / 3) * 300 }))).jpeg({ quality: 85 }).toFile(`${out}.jpg`);
await b.close(); console.log('written', `${out}.jpg`);
