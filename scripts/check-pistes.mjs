// « Mes pistes » in the game (LD2.0-A1, src/economy/pistesModule.ts): after a paid Tiak delivery and its card, one honest lead is offered on foot;
// « Y aller » marks the real place (Sarr Auto) and the goal line points to it; the same lead is not offered again; the phone lists the leads and
// « Pas maintenant » keeps one away; never offered at the wheel. Phone 390×844, real taps where the player taps.
// Usage: node scripts/check-pistes.mjs <baseUrl> <outDir>
import { chromium } from 'playwright';
import fs from 'node:fs';
import { realTouch, boardVehicle } from './lib/realTouch.mjs';

const [base = 'http://localhost:4604/', out = '/tmp/claude-0/ld2/pistes'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const results = []; let failed = 0;
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail: String(detail).slice(0, 300) }); if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${String(detail).slice(0, 300)}`); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'low'); } catch { /* */ } });
  const page = await ctx.newPage(); page.setDefaultTimeout(300000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const d = (fn, a) => page.evaluate(fn, a);
  const until = (fn, a, ms = 60000) => page.waitForFunction(fn, a, { timeout: ms, polling: 250 }).then(() => true, () => false);
  await page.goto(`${base}?debug&touch&heure=11`, { timeout: 180000 });
  await page.waitForFunction(() => window.__dakar?.pos?.().hub && window.__dakar.pistes && !document.getElementById('studio'), null, { timeout: 300000 });
  const t = await realTouch(page);
  await page.waitForTimeout(2000);

  check('a new player: no lead to chase', (await d(() => window.__dakar.pistes.list().length)) === 0, JSON.stringify(await d(() => window.__dakar.pistes.list().map(p => p.id))));
  // two deliveries already done (a returning player), then a real third one, paid once
  await d(() => { window.__dakar.state.data.counters.livraisons = 2; });
  const job = await d(() => window.__dakar.jobs()[0]);
  await d(id => window.__dakar.acceptJob(id), job.id);
  const done = await d(() => window.__dakar.completeJob());
  check('a Tiak delivery is paid', done && done.paid > 0, JSON.stringify(done));
  const card = await until(() => !!document.querySelector('#toast .mo.bc'), null, 10000);
  check('its work card is shown first', card);
  check('no lead is offered over the work card', !(await d(() => !!document.querySelector('#toast .mo.of'))));
  const offered = await until(() => !!document.querySelector('#toast .mo.of'), null, 40000);
  const text = await d(() => document.querySelector('#toast .mo.of')?.textContent ?? '');
  await page.screenshot({ path: `${out}/1-offer.png` });
  const whole = () => d(() => { const c = document.querySelector('#toast .mo.of')?.getBoundingClientRect(), b = document.querySelector('#toast .mo.of .of-b.on')?.getBoundingClientRect();
    return c && b ? { inside: b.top >= c.top - 0.5 && b.bottom <= c.bottom + 0.5 && b.left >= c.left - 0.5 && b.right <= c.right + 0.5, h: +b.height.toFixed(2), card: [Math.round(c.top), Math.round(c.bottom)], mid: innerHeight / 2 } : null; });
  const fit = await whole();
  check('portrait: the offer\'s « Y aller » is whole (not cut by the card), 44 px tall, and the card ends above the middle', fit && fit.inside && fit.h >= 43.5 && fit.card[1] <= fit.mid, JSON.stringify(fit));
  check('then ONE lead is offered: Pape Sarr and a car on credit, in words that do not promise a loan', offered && /Pape Sarr/.test(text) && /Sarr Auto|pourrait t’expliquer/.test(text), text);
  // « Y aller » (a real tap)
  await t.tap('#toast .mo.of .of-b.on');
  await page.waitForTimeout(800);
  const marked = await d(() => window.__dakar.destination());
  check('« Y aller » marks Sarr Auto', /dealer/.test(marked ?? ''), String(marked));
  const goal = await until(() => /Sarr Auto/.test(document.getElementById('goal')?.textContent ?? ''), null, 15000);
  await page.screenshot({ path: `${out}/2-goal.png` });
  check('the goal line leads there', goal, await d(() => document.getElementById('goal')?.textContent ?? ''));
  check('the followed lead is not offered or listed again with the same facts', !(await d(() => window.__dakar.pistes.list().some(p => p.id === 'credit_sarr'))));

  // the phone: Mes pistes, « Pas maintenant »
  await d(() => { window.__dakar.giveMoney(30_000); window.__dakar.state.data.needs.social = 20; });
  await d(() => window.__dakar.phone('pistes')); await page.waitForTimeout(900);
  const listed = await d(() => [...document.querySelectorAll('#phone .pi b')].map(b => b.textContent));
  await page.screenshot({ path: `${out}/3-phone.png` });
  check('the phone lists the open leads (no service this build lacks)', listed.length > 0 && listed.every(Boolean), listed.join(' · '));
  const n = listed.length;
  await page.waitForTimeout(400);
  await t.tap('#phone [data-act="drop"]');
  await page.waitForTimeout(900);
  check('« Pas maintenant » keeps one away', (await d(() => document.querySelectorAll('#phone .pi').length)) === n - 1);
  await d(() => window.__dakar.phoneClose()); await page.waitForTimeout(600);

  // at the wheel: nothing is offered (the lead waits until the player is on foot again)
  await d(() => { window.__dakar.giveMoney(8_000_000); window.__dakar.teranga.own(); });                      // (bought at its price: the debug purchase)
  await until(() => window.__dakar.teranga.info().owned && window.__dakar.teranga.info().here, null, 300000);
  await d(s => { window.__dakar.teranga.place(s.x, s.z, s.yaw); window.__dakar.place(s.x + 2.4, s.z, -Math.PI / 2); }, { x: -26, z: -92, yaw: 0 });   // the kerb the avatar check uses
  await page.waitForTimeout(1200);
  let boarded = true; try { await boardVehicle(page, t, 'teranga'); } catch { boarded = false; }
  await until(() => !!window.__dakar.teranga.at()?.driving, null, 30000);
  await d(() => { const s = window.__dakar.state.data; s.pistes.offered = {}; s.pistes.lastMs = 0; s.pistes.off = {}; window.__dakar.pistes.afterWork(0); });
  await page.waitForTimeout(4000);
  check('never offered at the wheel', boarded && !(await d(() => !!document.querySelector('#toast .mo.of'))), JSON.stringify({ boarded, driving: await d(() => !!window.__dakar.teranga.at()?.driving) }));
  await t.tap('#ridepad .rp-off').catch(() => {});
  await until(() => !window.__dakar.seated() && window.__dakar.pos().mode === 'play', null, 60000);
  const after = await until(() => !!document.querySelector('#toast .mo.of'), null, 20000);
  const afterText = await d(() => document.querySelector('#toast .mo.of')?.textContent ?? '');
  check('…and offered once back on foot, from the facts as they are now (a car owned: no more car credit)', after && !/crédit/.test(afterText), afterText);
  // landscape: the offer is one compact row, its button whole, clear of the joystick
  await page.setViewportSize({ width: 844, height: 390 }); await page.waitForTimeout(1200);
  await d(() => { const s = window.__dakar.state.data; s.pistes.offered = {}; s.pistes.lastMs = 0; s.pistes.off = {}; window.__dakar.pistes.afterWork(0); });
  await until(() => !!document.querySelector('#toast .mo.of'), null, 20000);
  await page.waitForTimeout(600);                                                        // past the card's entry animation
  const fitL = await whole(), joy = await d(() => { const j = document.getElementById('joy')?.getBoundingClientRect(), c = document.querySelector('#toast .mo.of')?.getBoundingClientRect(); return j && c ? c.bottom <= j.top + 0.5 || c.left >= j.right || c.right <= j.left : true; });
  await page.screenshot({ path: `${out}/4-landscape.png` });
  check('landscape: the offer\'s « Y aller » is whole and 44 px tall, the card clear of the joystick', fitL && fitL.inside && fitL.h >= 43.5 && joy, JSON.stringify({ fitL, joy }));
  check('no JavaScript errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
  fs.writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 2));
  console.log(`${results.length - failed}/${results.length} passed`);
  process.exitCode = failed ? 1 : 0;
}
