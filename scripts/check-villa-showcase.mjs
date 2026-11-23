// LD2.0-D lane V-E: the owner's private showcase build (npm run build:showcase: VITE_OWNER_SHOWCASE=1, the private single-file preview's config), on a phone page.
// The player's own game is in the browser's storage; the start card offers « Ma partie » and « Vitrine du propriétaire »; the showcase opens on the villa owned
// and furnished, the Lamane Sport in its bay, a comfortable wallet; the player's real save is never touched (byte for byte); « Ma partie » is the real game.
// Usage: node scripts/check-villa-showcase.mjs <showcaseBuildUrl> <outDir> [publicBuildUrl]
import { chromium } from 'playwright';
import fs from 'node:fs';

const [base = 'http://127.0.0.1:4964/vitrine/', out = 'docs/proof/ld2d/street', pub = ''] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
let failed = 0, total = 0;
const check = (name, ok, detail = '') => { total++; if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ' ' + detail : ''}`); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
// the player's own game, as a v6 save would hold it (a few marks to recognise it)
const REAL = JSON.stringify({ schemaVersion: 6, guestId: 'g-real-player', createdAt: 1, savedAt: 2, playedMs: 600000, hub: 'pikine', x: 0, z: 0, yaw: 0, wallet: 4321, needs: { faim: 70, energie: 70, moral: 70, social: 70, hygiene: 70 }, counters: {}, flags: ['ma-vraie-partie'] });
const KEY = 'dakarrek.guest.save.v6';

async function open(url) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await context.addInitScript(([k, v]) => { try { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, v); localStorage.setItem('dakarrek.quality', 'medium'); sessionStorage.setItem('seeded', '1'); } } catch { /* */ } }, [KEY, REAL]);
  const page = await context.newPage(); page.setDefaultTimeout(300000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${url}?debug&touch`, { timeout: 180000 });
  return { context, page, errors, d: (fn, arg) => page.evaluate(fn, arg) };
}

// ---- the showcase build: the start card, then the showcase
const s = await open(base);
const card = await s.page.waitForSelector('#owner-showcase', { timeout: 120000 }).then(() => true, () => false);
const texts = await s.d(() => [...document.querySelectorAll('#owner-showcase button')].map(b => b.textContent.trim()));
check('the start card offers « Ma partie » and « Vitrine du propriétaire »', card && texts.includes('Ma partie') && texts.includes('Vitrine du propriétaire'), JSON.stringify(texts));
await s.page.screenshot({ path: `${out}/07-showcase-start.png` });
await s.page.tap('#owner-showcase button[data-pick="showcase"]');
await s.page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub === 'almadies' && window.__dakar.pos().mode === 'play', null, { timeout: 300000 });
await s.page.waitForTimeout(3000);
const st = await s.d(() => ({ e: window.__dakar.estate(), wallet: window.__dakar.state.wallet, suv: window.__dakar.suv.info(), pos: window.__dakar.pos(), flags: window.__dakar.state.data.flags }));
const villa = st.e.assets.find(a => a.spec === 'villa_almadies');
check('the showcase: the villa owned and lived in, its pieces furnished', villa?.how === 'owned' && st.e.home === 'villa_almadies' && st.e.assets.filter(a => a.home === villa.uid && a.at).length >= 8, JSON.stringify({ home: st.e.home, pieces: st.e.assets.filter(a => a.home === villa?.uid).map(a => [a.spec, !!a.at]) }));
check('the Lamane Sport in the villa\'s first bay, a comfortable wallet', st.suv.owned && st.suv.here && Math.hypot(st.suv.x - (-14.9), st.suv.z - (-10.7)) < 0.05 && st.wallet >= 50_000_000, JSON.stringify({ x: st.suv.x, z: st.suv.z, wallet: st.wallet }));
check('the showcase game is not the player\'s', !st.flags.includes('ma-vraie-partie') && st.flags.includes('vitrine'));
await s.d(() => window.__dakar.save());
await s.page.waitForTimeout(500);
const store1 = await s.d(() => Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)])));
check('the player\'s real save is untouched, byte for byte; the showcase\'s is under its own keys', store1[KEY] === REAL && Object.keys(store1).some(k => k.startsWith('dakarrek.vitrine/dakarrek.guest.save.v6')), JSON.stringify(Object.keys(store1)));
await s.d(() => window.__dakar.cam([-4, 9, 4], [-18, 2, -14]));
await s.page.waitForTimeout(1500);
await s.page.screenshot({ path: `${out}/08-showcase-villa.png` });
// a reload: the card again; « Ma partie » is the real game
await s.page.reload({ timeout: 180000 });
await s.page.waitForSelector('#owner-showcase', { timeout: 120000 });
await s.page.tap('#owner-showcase button[data-pick="own"]');
await s.page.waitForFunction(() => window.__dakar?.state && window.__dakar.pos?.().hub, null, { timeout: 300000 });
const mine = await s.d(() => ({ wallet: window.__dakar.state.wallet, flags: window.__dakar.state.data.flags, guest: window.__dakar.state.data.guestId }));
check('« Ma partie » opens the player\'s own game', mine.guest === 'g-real-player' && mine.flags.includes('ma-vraie-partie'), JSON.stringify(mine));
check('no error on the showcase page', s.errors.length === 0, JSON.stringify(s.errors.slice(0, 3)));
await s.context.close();

// ---- the public build: no card, no showcase
if (pub) {
  const p = await open(pub);
  await p.page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub, null, { timeout: 300000 });
  const none = await p.d(() => !document.querySelector('#owner-showcase') && !Object.keys(localStorage).some(k => k.startsWith('dakarrek.vitrine/')));
  const g = await p.d(() => window.__dakar.state.data.guestId);
  check('the public build: no start card, the player\'s own game at once', none && g === 'g-real-player', JSON.stringify({ none, g }));
  await p.context.close();
}
await browser.close();
for (const f of ['07-showcase-start.png', '08-showcase-villa.png']) if (fs.existsSync(`${out}/${f}`)) { const n = fs.statSync(`${out}/${f}`).size; check(`picture ${f} under 400 kB`, n < 400_000, `${Math.round(n / 1024)} kB`); }
console.log(`\n${total - failed}/${total} passed`);
process.exit(failed ? 1 : 0);
