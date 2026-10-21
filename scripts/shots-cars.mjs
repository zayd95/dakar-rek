// In-game pictures of the four new cars on their dealers' floors (front three-quarter, side, rear three-quarter; the player stands by for scale) and of the three dealerships, on a
// phone-sized page at noon. Debug hooks: teleport, place, the hour, the camera's heading. Usage: node scripts/shots-cars.mjs <baseUrl> <outDir>
import { chromium } from 'playwright';
import fs from 'node:fs';

const [base = 'http://127.0.0.1:4422/', out = '/tmp/claude-0/veh/cars'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await context.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'high'); } catch { /* */ } });
const page = await context.newPage(); page.setDefaultTimeout(300000);
const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (/\[vehicles\]/.test(m.text())) errors.push(m.text()); });
const d = (fn, a) => page.evaluate(fn, a);
await page.goto(`${base}?debug&touch&heure=12`, { timeout: 180000 });
await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub, null, { timeout: 300000 });
await d(() => { document.querySelector('#hud')?.style.setProperty('opacity', '0'); });
const go = async hub => { if ((await d(() => window.__dakar.pos().hub)) === hub) return; await d(h => window.__dakar.teleport(h), hub); await page.waitForFunction(h => window.__dakar.pos().hub === h, hub, { timeout: 240000 }); await page.waitForTimeout(4000); };
const stand = async (x, z, look) => { const yaw = Math.atan2(look.x - x, look.z - z); await d(([x, z, yaw]) => { window.__dakar.place(x, z, yaw); window.__dakar.lookYaw(yaw); }, [x, z, yaw]); await page.waitForTimeout(2600); };
const snap = async name => { await d(() => document.querySelectorAll('.toast, #toast').forEach(e => { e.style.display = 'none'; })); await page.screenshot({ path: `${out}/${name}.png` }); };

const CARS = [
  { name: 'teranga', hub: 'pikine', key: 'teranga', pick: f => f[0] },
  { name: 'rafet', hub: 'plateau', key: 'rafet', pick: f => f[0] },
  { name: 'lamane-sport', hub: 'almadies', key: 'suv', pick: f => f.find(c => c.colour === 'rouge') ?? f[0] },
  { name: 'gainde', hub: 'almadies', key: 'gainde', pick: f => f[0] },
];
const report = {};
for (const c of CARS) {
  await go(c.hub);
  await page.waitForFunction(k => window.__dakar[k]?.info().floor.some(f => f.here), c.key, { timeout: 240000 });
  const floor = (await d(k => window.__dakar[k].info().floor, c.key)), car = c.pick(floor);
  const yaw = await d(([k, s]) => window.__dakar.three.scene.getObjectByName(`${k}:floor:${s}`)?.rotation.y ?? null, [c.key, car.slot]);
  const F = { x: Math.sin(yaw ?? 0), z: Math.cos(yaw ?? 0) }, L = { x: F.z, z: -F.x };
  report[c.name] = { slot: car.slot, colour: car.colour, x: car.x, z: car.z, yaw };
  for (const [label, along, lat] of [['front', 5.6, 3.2], ['side', 0.4, 6.2], ['rear', -5.8, 3.0], ['front-other-side', 5.4, -3.4]]) {
    await stand(car.x + F.x * along + L.x * lat, car.z + F.z * along + L.z * lat, { x: car.x, z: car.z });
    await snap(`${c.name}-${label}`);
  }
}
// the dealerships, from where a customer arrives
const lot = await (async () => { await go('pikine'); return d(() => window.__dakar.sarr.info().lot); })();
await stand(lot.counter.x - 4, -6.5, { x: lot.counter.x + 2, z: lot.counter.z }); await snap('dealer-sarr-auto');
await stand(lot.counter.x + 14, -2, { x: lot.counter.x - 4, z: lot.counter.z }); await snap('dealer-sarr-auto-2');
await go('plateau');
const nd = await d(() => window.__dakar.rafet.info().floor[0]);
await stand(nd.x + 10, nd.z - 6, { x: nd.x - 3, z: nd.z }); await snap('dealer-ndiaye-auto');
await go('almadies');
await stand(-100.5, 4.6, { x: -95, z: 25 }); await snap('dealer-prestige-forecourt');
await stand(-88.6, 18.2, { x: -95, z: 26 }); await snap('dealer-prestige-hall');
fs.writeFileSync(`${out}/cars.json`, JSON.stringify({ report, errors }, null, 1));
console.log(JSON.stringify(report), 'errors', errors.length);
await browser.close();
