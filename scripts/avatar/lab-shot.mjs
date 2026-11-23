// Renders the hair lab (scripts/avatar/hairlab.html, dev server) to a PNG: node scripts/avatar/lab-shot.mjs "<query>" <out.png> [width] [height] — e.g. "rows=f:wrap:2:2:3,m:kufi:4:0:1&views=front,34,side,back"
import { chromium } from 'playwright';
const [, , query, out, w = '1200', h = '900'] = process.argv;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const p = await browser.newPage({ viewport: { width: +w, height: +h } });
p.on('pageerror', e => console.log('pageerror', e.message)); p.on('console', m => { if (m.type() === 'error') console.log('console', m.text().slice(0, 400)); });
await p.goto(`${process.env.BASE ?? 'http://127.0.0.1:4501/'}scripts/avatar/hairlab.html?${query}`);
await p.waitForFunction(() => window.__ready, null, { timeout: 180000 });
await p.locator('#c').screenshot({ path: out });
await browser.close();
