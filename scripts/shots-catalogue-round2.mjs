// LD2.0-C, the catalogue's second round (docs/ld2/LD2_C.md « Catalogue, round 2 »): the F2 furnished with the new pieces, each delivered and set up by
// the game where it puts them (the room of its kind), photographed from the game's own camera on a phone page (390 × 844) by day and at 21 h,
// with the draw calls and triangles of each view against the furnished budget (≤ 60 draw calls, ≤ 80k triangles). No page errors.
// Usage: node scripts/shots-catalogue-round2.mjs <baseUrl> [outDir=docs/proof/ld2c/catalogue2]
import { chromium } from 'playwright';
import fs from 'node:fs';
import sharp from 'sharp';

const [base = 'http://127.0.0.1:4991/', out = 'docs/proof/ld2c/catalogue2'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const PIECES = ['canape_angle_velours', 'pouf_velours', 'table_basse_sculptee', 'aquarium_meuble', 'miroir_soleil', 'candelabre_cristal', 'vase_orchidees', 'bronze_marbre',
  'tapis_soie', 'lit_baldaquin', 'paravent_bois', 'masques_sculptes', 'chevet_sculpte', 'console_marbre', 'jarre_herbes', 'attaya_service'];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok: !!ok, detail: String(extra).slice(0, 600) }); console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`, extra ? String(extra).slice(0, 300) : ''); };
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await ctx.newPage(); page.setDefaultTimeout(300000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const d = (fn, a) => page.evaluate(fn, a);
  await page.goto(`${base}?debug&touch&argent=50000000`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.estate && window.__dakar.home, null, { timeout: 300000 });
  await d(() => { const D = window.__dakar; D.buyAsset('appart_jamm'); D.moveIn('appart_jamm'); D.setHour(10); D.teleport('pikine'); });
  await page.waitForTimeout(2500);
  const bought = await d(ids => ids.map(id => [id, !!window.__dakar.buyPiece(id)]), PIECES);
  await d(() => window.__dakar.enterHome('appart_jamm'));
  await page.waitForFunction(() => window.__dakar.home() && window.__dakar.pos().mode === 'play', null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  const view = await d(() => window.__dakar.homeView()), O = { x: view.ox, z: view.oz };
  const set = await d(() => window.__dakar.homeView().pieces.map(p => [p.spec, window.__dakar.homeRules?.()?.roomOf?.(p) ?? null]));
  check(`the ${PIECES.length} new pieces are delivered to the F2 and set up`, bought.every(([, ok]) => ok) && view.pieces.length >= PIECES.length, JSON.stringify(bought));
  const shots = { sejour: [-1.0, 2.2, Math.PI * 0.85], chambre: [-2.4, -1.4, Math.PI], entree: [3.15, 2.5, Math.PI] };
  const perf = {}, sizes = [];
  const picture = async name => {
    let buf = await page.screenshot({ scale: 'css' });
    if (buf.length > 380_000) buf = await sharp(buf).png({ palette: true, quality: 92, effort: 8 }).toBuffer();
    fs.writeFileSync(`${out}/${name}.png`, buf); sizes.push([name, buf.length]);
  };
  for (const [hour, tag] of [[10, 'day'], [21, 'night']]) {
    await d(h => window.__dakar.setHour(h), hour);
    for (const [room, [x, z, yaw]] of Object.entries(shots)) {
      await d(([x, z, yaw]) => window.__dakar.place(x, z, yaw), [O.x + x, O.z + z, yaw]);
      await page.waitForTimeout(1800);
      await picture(`f2-${room}-${tag}`);
      if (tag === 'day') perf[room] = await d(() => ({ calls: window.__dakar.drawCalls(), tris: window.__dakar.tris() }));
    }
  }
  check('each room furnished with the new pieces: ≤ 60 draw calls and ≤ 80k triangles (phone page)', Object.values(perf).every(p => p.calls <= 60 && p.tris <= 80_000), JSON.stringify(perf));
  check('pictures of the séjour, the chambre and the entrée by day and at 21 h, each PNG under 400 kB', sizes.length === 6 && sizes.every(([, n]) => n < 400_000), sizes.map(([k, n]) => `${k} ${Math.round(n / 1000)} kB`).join(', '));
  check('no page errors', errors.length === 0, errors.join(' | '));
  fs.writeFileSync(`${out}/f2-round2.json`, JSON.stringify({ base, pieces: view.pieces.length, set, perf, pictures: sizes, results }, null, 1));
} finally { await browser.close(); }
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
