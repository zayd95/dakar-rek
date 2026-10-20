// The driver's door of the premium cars, shut / half / wide open, from the front-left: node scripts/vehicles/shoot-door.mjs [outDir=docs/vehicles/prestige]
// (dev server on 5199: npx vite --port 5199). Drawn by the game itself (the kit's procedural models with `openable`).
import { chromium } from 'playwright';
import fs from 'node:fs';
import sharp from 'sharp';

const out = process.argv[2] ?? 'docs/vehicles/prestige';
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 700, height: 440 } }); p.setDefaultTimeout(240000);
await p.goto('http://127.0.0.1:5199/?debug&vehicleModel=kit'); await p.waitForFunction(() => window.__dakar?.pos?.().hub);
await p.evaluate(() => { window.__dakar.setHour(11); document.body.querySelectorAll(':scope > *:not(canvas):not(script)').forEach(e => { e.style.visibility = 'hidden'; }); });
const tiles = [];
for (const kind of ['luxury', 'suv', 'sedan']) for (const k of [0, 0.5, 1]) {
  await p.evaluate(([kind, k]) => {
    const D = window.__dakar; D.kitShowroom({ vehicles: [{ kind, seed: 12, opts: { driver: false, passengers: false, openable: true } }], x: 4000, z: 0, gap: 30 });
    const root = D.three.scene.getObjectByName('kit_showroom'), v = root.children.find(c => c.userData.vehicleSpec);
    const door = v.userData.kitDoor; if (door) door.rotation.y = -1.12 * k;
    D.cam([4000 + 4.2, 1.9, 3.8], [4000 + 0.4, 0.7, 0.2]); D.render();
  }, [kind, k]);
  await p.waitForTimeout(350);
  const shot = await sharp(await p.screenshot()).resize(467, 293).toBuffer();
  tiles.push({ input: shot, left: ([0, 0.5, 1].indexOf(k)) * 470, top: ['luxury', 'suv', 'sedan'].indexOf(kind) * 296 });
}
await sharp({ create: { width: 1410, height: 888, channels: 3, background: '#0b0c0f' } }).composite(tiles).jpeg({ quality: 86 }).toFile(`${out}/door.jpg`);
console.log('wrote', `${out}/door.jpg`);
await b.close();
