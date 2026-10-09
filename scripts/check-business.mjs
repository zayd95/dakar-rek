// « Affaires » headless check: first venture → hourly income → polyvalence → a billion in the HUD (compact) and the phone (full).
// Usage: npm run build && npx vite preview --port 4206 --strictPort, then node scripts/check-business.mjs [baseUrl] [outDir]
// Chromium + SwiftShader (CPU rendering): this is not a phone measurement. Played time is advanced with the debug hook.
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:4206/';
const out = process.argv[3] ?? 'docs/screenshots/affaires';
fs.mkdirSync(out, { recursive: true });
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok: !!ok, extra: String(extra) }); console.log(ok ? 'PASS' : 'FAIL', name, extra); };
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const D = (page, fn, arg) => page.evaluate(fn, arg);
const ready = page => page.waitForFunction(() => window.__dakar?.pos().hub, null, { timeout: 60000 });
const closeModal = page => D(page, () => document.querySelector('#modal')?.classList.remove('on'));
const modal = page => D(page, () => ({ title: document.querySelector('#modal.on h2')?.textContent ?? '', text: document.querySelector('#modal.on .panel')?.textContent ?? '', items: [...document.querySelectorAll('#modal.on .item:not(.close)')].map(e => e.textContent ?? '') }));
const pick = async (page, text, touch = false) => { const l = page.locator('#modal.on .item', { hasText: text }).first(); await (touch ? l.tap() : l.click()); await page.waitForTimeout(250); };
const money = page => D(page, () => ({ text: document.querySelector('#money').textContent, label: document.querySelector('#money').getAttribute('aria-label'), fits: document.querySelector('#money').getBoundingClientRect().right <= document.querySelector('#stats').getBoundingClientRect().right - 4, wallet: window.__dakar.state.wallet }));
const watchErrors = page => { const errors = []; page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error' && !m.location().url.endsWith('/assets/car_rapide.glb')) errors.push(m.text()); }); return errors; };
const NB = '\u00a0', NN = '\u202f';
const full = n => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, NN) + NB + 'F';

let savedJson = null;
// ------------------------------------------------------------------ desktop 1280×720: the whole ladder
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await page.goto(`${base}?debug`, { waitUntil: 'load' }); await ready(page);
  await D(page, () => { localStorage.clear(); localStorage.setItem('dakarrek.quality', 'low'); }); await page.reload({ waitUntil: 'load' }); await ready(page);
  await page.waitForTimeout(1000);
  await D(page, () => { window.__dakar.setHour(10); window.__dakar.teleport('pikine'); });
  await page.waitForTimeout(600);

  // the phone shows the Affaires app; on a fresh save every tier is locked
  await page.locator('#menuBtn').click(); await page.locator('#phone [data-app="affaires"]').waitFor({ state: 'visible', timeout: 10000 }).catch(() => {}); await page.waitForTimeout(900);
  const tiles = await page.locator('#phone [data-app]').evaluateAll(els => els.map(e => e.dataset.app));
  check('phone home shows the « Affaires » app', tiles.includes('affaires'), tiles.join(','));
  await page.screenshot({ path: `${out}/desktop-phone-home.png` });
  await page.locator('#phone [data-app="affaires"]').click(); await page.waitForTimeout(400);
  let m = await modal(page);
  check('the tile opens the Affaires menu (fresh save: first tier needs an activity)', m.title === 'Affaires' && m.items.length === 7 && /une première activité/.test(m.items[0]) && m.items.slice(1).every(t => /Bloqué/.test(t)), m.items[0]);
  await closeModal(page);

  // one delivery (an activity), money for the first venture, then buy it through the menu with confirmation
  await D(page, () => { window.__dakar.acceptJob('pk_mame_boutique'); window.__dakar.completeJob(); });
  await D(page, () => window.__dakar.giveMoney(60000));
  const w0 = await D(page, () => window.__dakar.state.wallet);
  await D(page, () => window.__dakar.businessApp()); await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/desktop-affaires-first.png` });
  await pick(page, 'Table de bana-bana');
  m = await modal(page);
  check('picking a venture asks for confirmation', /^Acheter : Table de bana-bana/.test(m.title) && m.items.some(t => /Confirmer l’achat/.test(t) && /50\s000\sF/.test(t)), `${m.title} | ${m.items.join(' | ')}`);
  await page.screenshot({ path: `${out}/desktop-affaires-confirm.png` });
  await pick(page, 'Confirmer l’achat');
  let b = await D(page, () => window.__dakar.business());
  const w1 = await D(page, () => window.__dakar.state.wallet);
  check('bought the first venture: charged once, owned, ledger line', b.owned.bana === 1 && w0 - w1 === 50000 && (await D(page, () => window.__dakar.ledger()[0].label)) === 'Achat : Table de bana-bana', `${w0} → ${w1} · ${JSON.stringify(b.owned)}`);
  m = await modal(page);
  check('back on the Affaires menu after buying: next unit ×1.15', m.title === 'Affaires' && /Table de bana-bana ×1/.test(m.items[0]) && /57\s500\sF/.test(m.items[0]), m.items[0]);
  await closeModal(page);

  // income: the frame loop pays on the hour of played time (nudged to just before the hour, then the game runs)
  const hourMs = b.hourMs;
  await D(page, ms => window.__dakar.advancePlayed(ms), hourMs - 1500);
  const wBefore = await D(page, () => window.__dakar.state.wallet);
  await page.waitForFunction(w => window.__dakar.state.wallet > w, wBefore, { timeout: 30000 }).catch(() => {});
  const led = await D(page, () => window.__dakar.ledger()[0]);
  const wAfter = await D(page, () => window.__dakar.state.wallet);
  check('income arrives on the in-game hour while playing (one ledger line)', led?.label === 'Revenus · Table de bana-bana' && wAfter - wBefore === led.amount && led.amount >= 400, JSON.stringify(led));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/desktop-income-hud.png` });
  const paid = await D(page, ms => window.__dakar.advancePlayed(ms), 3 * hourMs);
  check('three in-game hours later: one batch for the three', paid >= 3 * 400 && (await D(page, () => window.__dakar.ledger()[0].amount)) === paid, paid);

  // polyvalence: four recent activities → ×1,6, shown in the app and applied to the income
  await D(page, () => { for (const a of ['livraison', 'commerce', 'peche', 'social']) window.__dakar.practise(a); });   // the first two aged out over the 4 h
  b = await D(page, () => window.__dakar.business());
  await D(page, () => window.__dakar.businessApp()); await page.waitForTimeout(300);
  m = await modal(page);
  check('polyvalence shown: « 4 activités → revenus ×1,6 »', b.poly === 4 && b.mult === 1.6 && m.text.includes('Polyvalence : 4 activités → revenus ×1,6') && b.perHour === 640, `${b.line} · ${b.perHour} F/h`);
  await page.screenshot({ path: `${out}/desktop-affaires-polyvalence.png` });
  await closeModal(page);

  // a billion: compact in the HUD, full in the phone wallet
  await D(page, () => window.__dakar.giveMoney(1250000000 - window.__dakar.state.wallet));
  await page.waitForFunction(() => /Md/.test(document.querySelector('#money').textContent), null, { timeout: 15000 }).catch(() => {});   // the HUD refreshes 4×/s (slow frames here)
  let mo = await money(page);
  check('HUD: 1 250 000 000 F shows as « 1,25 Md F » inside the stat card', mo.text === `1,25${NB}Md${NB}F` && mo.fits && mo.label === full(mo.wallet), `${mo.text} · ${mo.label}`);
  await page.screenshot({ path: `${out}/desktop-hud-billion.png` });
  await D(page, () => window.__dakar.phone('portefeuille')); await page.waitForTimeout(400);
  const bal = await D(page, () => { const e = document.querySelector('#phone .ph-balance b'); return { text: e.textContent, fits: e.scrollWidth <= e.clientWidth + 1, screen: document.querySelector('#phone .ph-screen').textContent }; });
  check('phone wallet: the full amount on one line, with total wealth', bal.text === full(1250000000) && bal.fits && /Fortune totale/.test(bal.screen) && /Valeur des biens/.test(bal.screen) && /Polyvalence : 4 activités/.test(bal.screen), bal.text);
  await page.screenshot({ path: `${out}/desktop-phone-wallet-billion.png` });
  await D(page, () => window.__dakar.phoneClose());

  // the whole ladder once every activity is known: up to the big company
  await D(page, () => { for (const a of ['service', 'combat', 'artisanat']) window.__dakar.practise(a); window.__dakar.giveMoney(1500000000); });
  const ladder = await D(page, () => ['kiosque', 'boutique', 'car_rapide', 'restaurant', 'immeuble', 'entreprise'].map(id => window.__dakar.buyVenture(id)));
  b = await D(page, () => window.__dakar.business());
  check('every tier can be bought in order once unlocked (bana-bana → grande entreprise)', ladder.every(Boolean) && Object.keys(b.owned).length === 7 && b.mult === 2, `${JSON.stringify(b.owned)} · ×${b.mult} · ${b.perHour} F/h`);
  const big = await D(page, ms => window.__dakar.advancePlayed(ms), hourMs);
  check('big ventures pay millions per in-game hour', big >= 10000000 && big === (await D(page, () => window.__dakar.ledger()[0].amount)), big);
  await D(page, () => window.__dakar.businessApp()); await page.waitForTimeout(300);
  m = await modal(page);
  check('Affaires lists all seven with income, total earned and wealth', m.items.length === 7 && m.items.every(t => /\/h/.test(t)) && /Total gagné/.test(m.text) && /Fortune totale/.test(m.text), m.items[6]);
  await page.screenshot({ path: `${out}/desktop-affaires-ladder.png` });
  await closeModal(page);
  await page.waitForFunction(w => document.querySelector('#money').getAttribute('aria-label') === w, (await D(page, () => window.__dakar.state.wallet)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, NN) + NB + 'F', { timeout: 15000 }).catch(() => {});
  mo = await money(page);
  check('HUD stays compact and inside the card; its label keeps the full amount', /^\d{1,3}(,\d{1,2})?\u00a0(M|Md)\u00a0F$/.test(mo.text) && mo.fits && mo.label === full(mo.wallet), `${mo.text} · ${mo.label}`);

  // a bank agency offers the same menu in the city
  const bank = await D(page, () => window.__dakar.cityPlaces().find(p => /:city:bank/.test(p.id)));
  check('Banque Teranga offers « Investir dans une affaire »', bank?.actions.some(a => a.id === 'affaires'), bank?.name);

  // reload: everything persisted in schema v5
  await D(page, () => window.__dakar.state.data.jobs.active = null);
  const before = await D(page, () => ({ b: window.__dakar.business(), w: window.__dakar.state.wallet }));
  await D(page, () => window.__dakar.phone('reglages')); await page.locator('#phone [data-act="save"]').click(); await D(page, () => window.__dakar.phoneClose());
  await page.reload({ waitUntil: 'load' }); await ready(page); await page.waitForTimeout(1200);
  const after = await D(page, () => ({ b: window.__dakar.business(), w: window.__dakar.state.wallet, ver: JSON.parse(localStorage.getItem('dakarrek.guest.save')).schemaVersion }));
  check('reload: ventures, earnings, activities and wallet persisted (schema v5)', after.ver === 5 && JSON.stringify(after.b.owned) === JSON.stringify(before.b.owned) && after.b.earned === before.b.earned && after.b.known.length === 7 && after.w >= before.w, `${after.w} F · earned ${after.b.earned}`);
  savedJson = await D(page, () => localStorage.getItem('dakarrek.guest.save'));
  check('desktop: no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// ------------------------------------------------------------------ phone 390×844 touch: same save, compact HUD, full wallet, touch purchase
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  await ctx.addInitScript(s => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('dakarrek.guest.save', s); localStorage.setItem('dakarrek.quality', 'low'); sessionStorage.setItem('seeded', '1'); } }, savedJson);
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await page.goto(`${base}?debug&touch`, { waitUntil: 'load' }); await ready(page); await page.waitForTimeout(1200);
  await D(page, () => { window.__dakar.setHour(16); window.__dakar.teleport('pikine'); }); await page.waitForTimeout(600);
  let mo = await money(page);
  check('phone HUD: compact amount inside the 138 px card', /\u00a0(M|Md)\u00a0F$/.test(mo.text) && mo.fits, mo.text);
  await page.screenshot({ path: `${out}/phone-hud.png` });
  await page.locator('#menuBtn').tap(); await page.locator('#phone [data-app="affaires"]').waitFor({ state: 'visible', timeout: 10000 }).catch(() => {}); await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/phone-home.png` });
  await page.locator('#phone [data-app="portefeuille"]').tap(); await page.waitForTimeout(300);
  const bal = await D(page, () => { const e = document.querySelector('#phone .ph-balance b'); return { text: e.textContent, fits: e.scrollWidth <= e.clientWidth + 1, wallet: window.__dakar.state.wallet }; });
  check('phone wallet: full amount on one line at 390 px', bal.text === full(bal.wallet) && bal.fits, bal.text);
  await page.screenshot({ path: `${out}/phone-wallet.png` });
  await page.locator('#phone .ph-btn[data-app="affaires"]').tap(); await page.waitForTimeout(400);
  let m = await modal(page);
  check('wallet → Affaires button opens the menu', m.title === 'Affaires' && m.items.length === 7, m.title);
  await page.screenshot({ path: `${out}/phone-affaires.png` });
  const owned0 = await D(page, () => window.__dakar.business().owned.kiosque);
  await pick(page, 'Kiosque', true);
  await page.screenshot({ path: `${out}/phone-affaires-confirm.png` });
  await pick(page, 'Confirmer l’achat', true);
  check('touch: a kiosque bought after confirmation', (await D(page, () => window.__dakar.business().owned.kiosque)) === owned0 + 1);
  await closeModal(page);
  check('phone: no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

await browser.close();
fs.writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 1));
console.log(`${results.filter(r => r.ok).length}/${results.length} passed`);
process.exit(results.every(r => r.ok) ? 0 : 1);
