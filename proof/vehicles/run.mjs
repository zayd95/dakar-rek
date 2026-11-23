// node proof/vehicles/run.mjs [outDir=docs/vehicles/proof]  (dev server on 5199): writes inventory.json and one sheet of three views per vehicle
import { chromium } from 'playwright';
import fs from 'node:fs';
import sharp from 'sharp';
const out = process.argv[2] ?? 'docs/vehicles/proof'; fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 1500, height: 900 } }); p.on('pageerror', e => console.log('PAGEERR', String(e)));
await p.goto('http://127.0.0.1:5199/proof/vehicles/lineup.html'); await p.waitForFunction(() => window.ready, null, { timeout: 120000 });
const inv = await p.evaluate(() => window.inventory()); fs.writeFileSync(`${out}/inventory.json`, JSON.stringify(inv, null, 1));
const tiles = [];
for (let i = 0; i < inv.length; i++) { const row = []; for (const v of ['threeq', 'side', 'front']) { await p.evaluate(([i, v]) => window.show(i, v), [i, v]); row.push(await sharp(await p.screenshot()).resize(480, 288).toBuffer()); } tiles.push(row); }
await sharp({ create: { width: 480 * 3, height: 288 * inv.length, channels: 3, background: '#9bd3f3' } }).composite(tiles.flatMap((r, ri) => r.map((t, ci) => ({ input: t, left: ci * 480, top: ri * 288 })))).jpeg({ quality: 82 }).toFile(`${out}/lineup.jpg`);
for (const e of inv) console.log(e.id.padEnd(13), e.kind.padEnd(7), 'seed', String(e.seed).padEnd(4), 'var', e.variant, e.bodyColour, JSON.stringify(e.size_m), 'seats', e.seats, 'cams', e.cameras, 'near', JSON.stringify(e.near), 'far', e.far.tris);
await b.close();
