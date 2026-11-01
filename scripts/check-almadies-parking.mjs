// Almadies night street, the car parks (src/world/nightStreet.ts, docs/districts/ALMADIES-NIGHTLIFE.md): the Teranga is driven with the pedal stick (real touch) from the coast road's north lane
// into a free painted bay of each row, « PARKING DU PATIO » in the west and « PARKING NGOR » (hotel, Terrasse and La Vague) in the east, and parked there: the whole car off the carriageway, its
// centre inside the bay's lines, no solid touched on the way; the player steps out and walks to the promenade. At night, 22 h, with the NPC cars in their bays.
// Debug hooks used (labelled): the hour, putting the Teranga's parking record at the start of the lane, reading its position, the night street's bay list.
// Usage: node scripts/check-almadies-parking.mjs <baseUrl> <outDir>
import { chromium } from 'playwright';
import fs from 'node:fs';
import { realTouch, pilot, boardVehicle, walkTo } from './lib/realTouch.mjs';

const [base = 'http://127.0.0.1:4980/', out = '/tmp/claude-0/nightlife/parking'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
let failed = 0; const T = { timeout: 300000 };
const check = (name, ok, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${detail}`); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const BW = 2.6, laneZ = -124.3, TURN = 5.6, yaw = -Math.PI / 2;
const errors = [];

async function scenario(lot, near, hour = 22) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await context.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'low'); } catch { /* */ } });
  const page = await context.newPage(); page.setDefaultTimeout(300000);
  page.on('pageerror', e => errors.push(e.message));
  const d = (fn, a) => page.evaluate(fn, a);
  let n = 0; const shot = async name => { await page.waitForTimeout(400); await page.screenshot({ path: `${out}/${lot}-${String(++n).padStart(2, '0')}-${name}.png` }); };
  await page.goto(`${base}?debug&touch&heure=${hour}&argent=4500000`, { timeout: 180000 });
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.teranga && window.__dakar.district, null, T);
  const t = await realTouch(page);
  await page.waitForFunction(() => window.__dakar.teranga.info().floor.length > 0, null, T);
  await d(() => window.__dakar.teranga.own());
  await page.waitForFunction(() => window.__dakar.teranga.info().owned, null, T);
  await d(() => window.__dakar.teleport('almadies'));
  await page.waitForFunction(() => window.__dakar.pos().hub === 'almadies' && window.__dakar.pos().mode === 'play' && window.__dakar.district.nightStreet(), null, T);
  const ns = await d(() => window.__dakar.district.nightStreet());
  const row = ns.bays.filter(b => b.lot === lot), isFree = x => row.some(b => Math.abs(b.x - x) < 0.3 && b.free);
  const bay = row.filter(b => b.free && isFree(b.x - BW) && isFree(b.x + BW) && isFree(b.x + 2 * BW)).sort((a, b) => Math.abs(a.x - near) - Math.abs(b.x - near))[0];
  check(`${lot}: a free bay with room to swing in, near x ${near}`, !!bay && Math.abs(bay.x - near) < 22, JSON.stringify(bay));
  const start = { x: bay.x + 34, z: laneZ };
  await d(([x, z, y]) => { const A = window.__dakar, id = A.teranga.info().id, c = A.state.data.counters; c[`vehicle:${id}:hub`] = A.hubs.indexOf('almadies'); c[`vehicle:${id}:x`] = x; c[`vehicle:${id}:z`] = z; c[`vehicle:${id}:yaw`] = y; A.save?.(); A.teleport('corniche'); }, [start.x, start.z, yaw]);
  await page.waitForFunction(() => window.__dakar.pos().hub === 'corniche' && window.__dakar.pos().mode === 'play', null, T);
  await d(([x, z]) => window.__dakar.teleport('almadies', x, z, 0), [start.x, start.z + 2.6]);
  await page.waitForFunction(() => window.__dakar.pos().hub === 'almadies' && window.__dakar.pos().mode === 'play' && window.__dakar.teranga.info().here, null, T);
  await page.waitForTimeout(1500);
  await boardVehicle(page, t, 'teranga');
  await shot('on-the-road');
  const route = [{ x: bay.x + TURN + 12, z: laneZ, tol: 2.5, speed: 4.5 }, { x: bay.x + TURN + 2, z: laneZ, tol: 1.0, speed: 2.2 },
    ...[30, 60, 90].map(a => { const r = a * Math.PI / 180; return { x: bay.x + TURN + 2 - TURN * Math.sin(r), z: laneZ - TURN * (1 - Math.cos(r)), tol: 1.0, speed: 1.8 }; }),
    { x: bay.x, z: bay.z - 0.7, tol: 0.9, speed: 1.0 }];
  await pilot(page, t, 'teranga', route, { brakeAtEnd: true, cruise: 5 });
  // a driver who stops short of the bay's back line eases forward a little (up to twice): the brake's reach depends on the page's frame rate
  for (let k = 0; k < 2; k++) {
    const at = await d(() => window.__dakar.teranga.at());
    if (at.z < -129.0 && Math.abs(at.x - bay.x) < 1.6) break;
    await pilot(page, t, 'teranga', [{ x: bay.x, z: bay.z - 1.2, tol: 0.6, speed: 0.9 }], { brakeAtEnd: true, cruise: 1.5 });
  }
  await shot('parked');
  await t.tap('#ridepad .rp-off');
  await page.waitForFunction(() => !window.__dakar.teranga.at().driving && window.__dakar.pos().mode === 'play', null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1200);
  const pk = await d(() => window.__dakar.teranga.at()), rec = await d(() => window.__dakar.teranga.info().record);
  check(`${lot}: driven with the pedal stick into the bay (centre inside its lines), the whole car off the carriageway`, Math.abs(pk.x - bay.x) <= 1.3 && Math.abs(pk.z - bay.z) <= 2.4 && pk.z < -128.6, JSON.stringify({ at: [+pk.x.toFixed(1), +pk.z.toFixed(1)], bay: [bay.x, bay.z] }));
  check(`${lot}: stepped out, the car stays where it was left, saved as parked in Almadies`, !pk.driving && rec?.hub === 'almadies' && Math.hypot(rec.x - pk.x, rec.z - pk.z) < 0.5, JSON.stringify(rec));
  // out between the bays: the car's west neighbour is free by choice of the bay; round the car's side, then north to the promenade
  await walkTo(page, t, pk.x - 2.4, pk.z, { tol: 0.8, ms: 40000 });
  const dW = await walkTo(page, t, pk.x - 2.4, -134.3, { tol: 1.0, ms: 60000 });
  check(`${lot}: on foot from the car to the promenade past the bays' cars`, dW < 1.6, `${dW.toFixed(2)} m left`);
  await shot('on-the-promenade');
  await d(() => window.__dakar.pause?.(true));
  await d(([x, z]) => { const A = window.__dakar; A.cam([x + 16, 16, -112], [x, 0.5, -132]); A.render?.(); }, [bay.x, bay.z]);
  await page.waitForTimeout(600); await shot('from-above');
  await context.close();
}
await scenario('east', -15);
await scenario('west', -109);
check('no JavaScript errors', errors.length === 0, errors.slice(0, 3).join(' | '));
console.log(failed ? `${failed} parking checks FAILED` : 'parking checks passed');
await browser.close();
process.exit(failed ? 1 : 0);
