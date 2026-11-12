// Release 1.0: the smoke test of a PUBLISHED build (docs/release/RELEASE-1.0.md). It is run against the public address after a publication, and against a local build before one.
// Usage: node scripts/check-public-smoke.mjs <baseUrl> [expectedCommit] [outDir=/tmp/public-smoke]
// What it checks, on a phone-sized touch page, with nothing but what the address serves:
//   1. version.json is served and names the expected commit (when one is given);
//   2. the page as a visitor gets it (no query string): it loads, draws, shows its first screen, no uncaught error, nothing the page asks for is missing or refused;
//   3. the game itself (?debug, to move between districts quickly; the files served are the same): the player is in play, the screen has no Sprint / Footing / stamina control,
//      the stick moves the player, the phone opens on its home screen and closes, the map opens, each of the five districts loads, a save survives a reload;
//   4. an online build (version.json mode « online »): the presence server answers /api/health.
// It says that the published build STARTS and its main paths work from that address. It does not say how the game runs on a phone.
import fs from 'node:fs';
import { chromium } from 'playwright';
import { realTouch } from './lib/realTouch.mjs';

const [baseArg, expected = '', out = '/tmp/public-smoke'] = process.argv.slice(2);
if (!baseArg) { console.error('usage: node scripts/check-public-smoke.mjs <baseUrl> [expectedCommit] [outDir]'); process.exit(2); }
const base = baseArg.endsWith('/') ? baseArg : baseArg + '/';
fs.mkdirSync(out, { recursive: true });
const T = { timeout: 300000 };
let fails = 0; const check = (n, ok, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${n}${d ? ' ' + d : ''}`); if (!ok) fails++; };
const HUBS = ['pikine', 'plateau', 'corniche', 'almadies', 'mermoz'];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const open = async (query) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await context.addInitScript(() => { try { if (!localStorage.getItem('dakarrek.quality')) localStorage.setItem('dakarrek.quality', 'low'); } catch { /* */ } });
  const page = await context.newPage(); page.setDefaultTimeout(300000);
  const problems = [];
  const optional = u => /car_rapide\.glb$|\/favicon\.ico$/.test(u) || !u.startsWith(base);   // an optional model the game does without; anything not served by this address (the online basemap) is not this build's
  page.on('pageerror', e => problems.push('pageerror: ' + e.message.slice(0, 200)));
  page.on('requestfailed', r => { if (!optional(r.url())) problems.push('requestfailed: ' + r.url().slice(-90)); });
  page.on('response', r => { if (r.status() >= 400 && !optional(r.url())) problems.push(`http ${r.status()}: ${r.url().slice(-90)}`); });
  await page.goto(base + query, { timeout: 240000 });
  return { page, context, problems };
};

// 1. the build's own stamp
let version = null;
{
  const { page, context } = await open('');
  version = await page.evaluate(async () => { try { const r = await fetch('version.json', { cache: 'no-store' }); return r.ok ? await r.json() : { error: r.status }; } catch (e) { return { error: String(e) }; } });
  check('version.json is served next to the page', !!version?.commit, JSON.stringify(version).slice(0, 200));
  if (expected) check('it names the expected commit', (version?.commit ?? '').startsWith(expected) || expected.startsWith(version?.commit ?? 'x'), `${(version?.commit ?? '').slice(0, 12)} / expected ${expected.slice(0, 12)}`);
  // 2. the page as a visitor gets it
  await page.waitForFunction(() => { const c = document.querySelector('canvas'); return !!c && c.width > 0 && document.body.innerText.trim().length > 0; }, null, T);
  await page.waitForTimeout(8000);
  const first = await page.evaluate(() => ({ text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 160), canvas: !!document.querySelector('canvas'), boot: [...document.querySelectorAll('pre')].some(p => /toucher pour fermer/.test(p.textContent ?? '')) }));
  check('a visitor gets a drawn page with its first screen, and no boot-error box', first.canvas && first.text.length > 0 && !first.boot, JSON.stringify(first.text));
  await page.screenshot({ path: `${out}/01-visitor-first-screen.png` });
  await context.close();
}

// 3. the game
{
  const { page, context, problems } = await open('?debug&touch&heure=10&argent=50000');
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.pos().mode === 'play', null, T);
  await page.waitForTimeout(4000);
  const hud = await page.evaluate(() => ({
    gauge: !!document.getElementById('stamina'),
    words: /Courir|Footing|Sprint|Endurance/.test(document.getElementById('ui').innerText),
    runButton: [...document.querySelectorAll('#ui button, #ui [role=button]')].some(b => /Courir|Footing|Sprint/i.test(b.textContent + ' ' + (b.getAttribute('aria-label') ?? ''))),
    stick: !!document.getElementById('joy'),
  }));
  check('in play, the stick on screen; no Sprint, Footing or stamina control', hud.stick && !hud.gauge && !hud.words && !hud.runButton, JSON.stringify(hud));
  await page.screenshot({ path: `${out}/02-in-play.png` });

  // the stick moves the player (a real touch held at the stick's edge)
  const p0 = await page.evaluate(() => window.__dakar.pos());
  const tt = await realTouch(page), jc = await tt.centre('#joy');
  await tt.down(1, jc.x, jc.y); await tt.move(1, jc.x, jc.y - 60, 4);
  await page.waitForFunction(p => { const q = window.__dakar.pos(); return Math.hypot(q.x - p.x, q.z - p.z) > 1.5; }, p0, { timeout: 120000 }).catch(() => {});
  await tt.up(1);
  const p1 = await page.evaluate(() => window.__dakar.pos());
  check('the stick moves the player', Math.hypot(p1.x - p0.x, p1.z - p0.z) > 1.5, `${Math.hypot(p1.x - p0.x, p1.z - p0.z).toFixed(1)} m`);

  // the phone and the map
  await page.evaluate(() => window.__dakar.phone('home'));
  await page.waitForFunction(() => window.__dakar.phoneInfo?.()?.open, null, { timeout: 60000 }).catch(() => {});
  const ph = await page.evaluate(() => window.__dakar.phoneInfo?.());
  check('the phone opens', !!ph?.open, JSON.stringify(ph).slice(0, 160));
  await page.waitForTimeout(1500); await page.screenshot({ path: `${out}/03-phone.png` });
  await page.evaluate(() => window.__dakar.phone('carte')).catch(() => {});
  await page.waitForTimeout(5000);
  const mp = await page.evaluate(() => window.__dakar.phoneInfo?.());
  check('the map opens in the phone', !!mp?.open && mp.screen === 'carte', JSON.stringify(mp).slice(0, 200));
  await page.screenshot({ path: `${out}/04-map.png` });
  await page.evaluate(() => window.__dakar.phoneClose());
  await page.waitForFunction(() => !window.__dakar.phoneInfo?.()?.open, null, { timeout: 30000 }).catch(() => {});
  check('the phone closes and the game is in play again', await page.evaluate(() => !window.__dakar.phoneInfo?.()?.open && window.__dakar.pos().mode === 'play'));

  // the five districts
  for (const h of HUBS) {
    await page.evaluate(hub => window.__dakar.teleport(hub), h);
    const ok = await page.waitForFunction(hub => window.__dakar.pos().hub === hub && window.__dakar.pos().mode === 'play', h, { timeout: 240000 }).then(() => true).catch(() => false);
    await page.waitForTimeout(2500);
    const n = ok ? await page.evaluate(() => ({ calls: window.__dakar.drawCalls?.(), tris: window.__dakar.tris?.() })) : null;
    check(`district ${h} loads and draws`, ok && (n?.tris ?? 0) > 10000, JSON.stringify(n));
    await page.screenshot({ path: `${out}/05-${h}.png` });
  }

  // a save survives a reload
  const before = await page.evaluate(() => window.__dakar.pos().hub);
  await page.waitForTimeout(3000);
  await page.reload({ timeout: 240000 });
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.pos().mode === 'play', null, T);
  const after = await page.evaluate(() => window.__dakar.pos().hub);
  check('after a reload the player is where the save left them', after === before, `${before} → ${after}`);
  check('no uncaught error, nothing missing or refused among the files this address serves', problems.length === 0, JSON.stringify(problems.slice(0, 6)));
  await context.close();
}

// 4. the presence server of an online build
if (version?.mode === 'online') {
  const { page, context } = await open('');
  const h = await page.evaluate(async () => { try { const r = await fetch('/api/health', { cache: 'no-store' }); return { status: r.status, body: await r.json() }; } catch (e) { return { error: String(e) }; } });
  check('online build: the presence server answers /api/health', h.status === 200 && h.body?.ok === true, JSON.stringify(h).slice(0, 160));
  await context.close();
} else console.log(`(mode « ${version?.mode ?? '?'} »: no presence server to check)`);

await browser.close();
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
