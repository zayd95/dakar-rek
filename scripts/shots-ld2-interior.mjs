// LD2.0-A « l'intérieur »: the driver's-seat view (« Au volant ») of the Teranga (city trim, Pikine), the Gaïndé and the Lamane Sport (premium,
// Almadies) on a phone held upright (390 × 844) and on its side (844 × 390), and the head turned to the right (the console, the gear lever, the
// glovebox) and further round (the passenger's seat); the draw calls and triangles at the wheel (the frame, and the interior's own). Boarded and « Vue » switched with a real finger
// (scripts/lib/realTouch.mjs); debug hooks set the start (the hour, money, a car bought and placed) and turn the head (`<car>.lookAt`).
// Headless Chromium + SwiftShader: a software renderer, NOT a phone; nothing here says anything about frame rates on a device.
//
// Usage: node scripts/shots-ld2-interior.mjs <baseUrl> <outDir> [cars=teranga,gainde,suv]
import { chromium } from 'playwright';
import fs from 'node:fs';
import { realTouch, boardVehicle } from './lib/realTouch.mjs';

const [base = 'http://127.0.0.1:4620/', out = '/tmp/claude-0/ld2/interior-shots', carsArg = 'teranga,gainde,suv'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const PORTRAIT = { width: 390, height: 844 }, LANDSCAPE = { width: 844, height: 390 };
const context = await browser.newContext({ viewport: PORTRAIT, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await context.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'medium'); } catch { /* */ } });   // a phone's own class
const page = await context.newPage(); page.setDefaultTimeout(300000);
const errors = []; page.on('pageerror', e => errors.push(e.message));
const d = (fn, a) => page.evaluate(fn, a);
const wait = (fn, a, ms = 240000) => page.waitForFunction(fn, a, { timeout: ms });
const jpg = async name => { await page.waitForTimeout(300); await page.screenshot({ path: `${out}/${name}.jpg`, quality: 80 }); };

await page.goto(`${base}?debug&touch&heure=11&argent=900000000`, { timeout: 180000 });
await wait(() => window.__dakar?.pos && window.__dakar.pos().hub === 'pikine' && window.__dakar.teranga?.info().floor);
const t = await realTouch(page);
const goHub = async hub => { if ((await d(() => window.__dakar.pos().hub)) === hub) return; await d(h => window.__dakar.teleport(h), hub); await wait(h => window.__dakar.pos().hub === h, hub); await page.waitForTimeout(1500); };
const intoCar = async (key, x, z, yaw) => {
  if (!(await d(k => window.__dakar[k].info().owned, key))) { await d(k => window.__dakar[k].own(), key); await wait(k => window.__dakar[k].info().owned && window.__dakar[k].info().here, key, 120000); }
  await d(([k, x, z, y]) => window.__dakar[k].place(x, z, y), [key, x, z, yaw]);
  await d(([x, z, y]) => window.__dakar.place(x + Math.cos(y) * 2.4, z - Math.sin(y) * 2.4, y), [x, z, yaw]);
  await page.waitForTimeout(500);
  await boardVehicle(page, t, key);
};
const view = async (key, id) => { for (let i = 0; i < 4 && (await d(k => window.__dakar[k].info().view, key)) !== id; i++) { await t.tap('#ridepad .rp-view'); await page.waitForTimeout(500); } return d(k => window.__dakar[k].info().view, key); };
const getOff = async key => { if (!(await d(k => window.__dakar[k].info().driving, key))) return; await t.tap('#ridepad .rp-off'); await wait(k => !window.__dakar[k].info().driving && window.__dakar.pos().mode === 'play', key).catch(() => {}); await page.waitForTimeout(500); };
/** The frame's draw calls and triangles (paused, one render) and the interior's own triangles. */
const measure = key => d(k => { const D = window.__dakar; D.pause(true); D.render(); const r = { calls: D.drawCalls(), tris: D.tris(), interiorTris: D[k].interior()?.tris ?? null }; D.pause(false); return r; }, key);

const PLACES = { teranga: ['pikine', -62.1, -100, 0], gainde: ['almadies', -57.9, 100, Math.PI], suv: ['almadies', -57.9, 80, Math.PI] };
const report = {};
for (const key of carsArg.split(',')) {
  const [hub, x, z, yaw] = PLACES[key];
  await goHub(hub);
  await intoCar(key, x, z, yaw);
  for (const [vp, o] of [[PORTRAIT, 'portrait'], [LANDSCAPE, 'landscape']]) {
    await page.setViewportSize(vp); await page.waitForTimeout(800);
    const v = await view(key, 'volant'); await page.waitForTimeout(1800);
    const m = await measure(key);
    await jpg(`${key}-${o}`);
    report[`${key}-${o}`] = { view: v, ...m };
    console.log(key, o, JSON.stringify(report[`${key}-${o}`]));
    // the head turned to the right (the console, the gear lever, the glovebox) and further round (the passenger's seat)
    for (const [tag, yaw, pitch] of o === 'portrait' ? [['right', -0.9, -0.2], ['seat', -1.6, -0.3]] : [['right', -0.9, -0.2], ['seat', -1.5, -0.25]]) {
      await d(([k, y, p]) => window.__dakar[k].lookAt(y, p, 30), [key, yaw, pitch]); await page.waitForTimeout(1800);
      await jpg(`${key}-${o}-${tag}`);
    }
    await d(k => window.__dakar[k].lookAt(0, 0, 0.01), key); await page.waitForTimeout(800);
  }
  await page.setViewportSize(PORTRAIT); await page.waitForTimeout(600);
  await view(key, 'chase'); await getOff(key);
}
report.errors = errors.slice(0, 10);
fs.writeFileSync(`${out}/numbers.json`, JSON.stringify(report, null, 1));
console.log(JSON.stringify(report));
await context.close(); await browser.close();
process.exit(errors.length ? 1 : 0);
