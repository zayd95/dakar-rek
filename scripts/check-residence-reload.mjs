// The persistence release blocker, end to end on a phone page (390 × 844, real touches): buy the Teranga, park it in front of the Cité Jàmm, buy the
// family house through its sheet and make it the principal residence (« Définir comme domicile principal »), furnish it, move and turn a piece in
// « Aménager », then RELOAD THE PAGE (a real reload, from inside the house) — the house, the residence, every piece with its spot and turn, the car
// where it was left, the wallet and the spawn come back. Then « Ma chambre »'s options, the save card (honest status, copy), an import into a wiped
// browser, and a browser whose storage refuses every write (never shown as saved).
// Usage: node scripts/check-residence-reload.mjs <baseUrl> [outDir]   (a localhost preview: ?argent= is honoured there)
import { chromium } from 'playwright';
import fs from 'node:fs';
import { realTouch, boardVehicle } from './lib/realTouch.mjs';

const [base = 'http://localhost:4601/', out = '/tmp/claude-0/beta/u1'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok: !!ok, extra: String(extra).slice(0, 300) }); console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`, extra ? String(extra).slice(0, 300) : ''); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true };
const URL_ = `${base}?debug&touch&heure=11&argent=200000000`;
const ready = page => page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.estate && window.__dakar.teranga, null, { timeout: 300000 });
const pick = async (page, text) => { await page.locator('#modal.on .item', { hasText: text }).first().click(); await page.waitForTimeout(300); };
const title = page => page.evaluate(() => document.querySelector('#modal.on h2')?.textContent ?? '');
const items = page => page.evaluate(() => [...document.querySelectorAll('#modal.on .item')].map(e => ({ text: e.textContent.replace(/\s+/g, ' ').trim(), disabled: e.classList.contains('disabled') || e.hasAttribute('disabled') || e.getAttribute('aria-disabled') === 'true' })));
const pieces = (e, uid) => e.assets.filter(a => a.home === uid && a.kind === 'furniture').map(a => ({ spec: a.spec, at: a.at })).sort((a, b) => a.spec.localeCompare(b.spec));

try {
  // ------------------------------------------------------------------ 1. a game, a car, a house, furniture
  const ctx = await browser.newContext(phone);
  await ctx.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'low'); } catch { /* */ } });
  const page = await ctx.newPage(); page.setDefaultTimeout(300000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const d = (fn, a) => page.evaluate(fn, a);
  await page.goto(URL_, { timeout: 180000 }); await ready(page);
  const t = await realTouch(page);
  const wallet0 = await d(() => window.__dakar.state.wallet);

  // the Teranga, bought outright at Sarr Auto, parked in front of the Cité Jàmm
  await page.waitForFunction(() => window.__dakar.teranga.info().floor.length > 0, null, { timeout: 300000 });
  await d(() => window.__dakar.teranga.own());
  await page.waitForFunction(() => window.__dakar.teranga.info().owned && window.__dakar.teranga.info().here, null, { timeout: 300000 });
  // the car in the open lane beside the Cité Jàmm house (7 m from its door: the door is not what the player faces), the player at the car's door
  // (as the drive checks do), then in and out: the spot is saved where the car is left
  const SPOT = { x: -26, z: -92, yaw: 0 };
  await d(s => { window.__dakar.teranga.place(s.x, s.z, s.yaw); window.__dakar.place(s.x + 2.4, s.z, -Math.PI / 2); }, SPOT);
  await page.waitForTimeout(1200);
  await boardVehicle(page, t, 'teranga');
  await page.waitForTimeout(1500);
  await t.tap('#ridepad .rp-off');
  await page.waitForFunction(() => !window.__dakar.teranga.at()?.driving, null, { timeout: 60000 });
  await page.waitForTimeout(800);
  const rec0 = await d(() => window.__dakar.teranga.info().record);
  check('the Teranga is bought and parked where it was left, beside the Cité Jàmm house', rec0 && rec0.hub === 'pikine' && Math.hypot(rec0.x - SPOT.x, rec0.z - SPOT.z) < 1.5, JSON.stringify(rec0));

  // the family house through its sheet: buy, then the decision « Définir comme domicile principal ? »
  await d(() => window.__dakar.assetSheet('maison_cite')); await page.waitForSelector('#modal.on .item');
  await pick(page, 'Acheter');
  check('the purchase asks for one confirmation', /^Acheter : /.test(await title(page)), await title(page));
  await pick(page, 'Acheter');
  const ask = await title(page), askText = await d(() => document.querySelector('#modal.on .panel')?.textContent ?? '');
  await page.screenshot({ path: `${out}/1-domicile-principal.png` });
  check('right after buying: « Définir comme domicile principal ? », with « Plus tard »', /Définir comme domicile principal/.test(ask) && (await items(page)).some(i => /Plus tard/.test(i.text)), ask);
  check('the question says where furniture goes either way, and that the family keeps the room', /Keur Meubles livrera ici|pièces te suivent/.test(askText) && /la famille te la garde/.test(askText), askText.slice(0, 240));
  const e1 = await d(() => window.__dakar.estate());
  check('bought, not yet the principal residence', e1.home !== 'maison_cite' && e1.assets.some(a => a.spec === 'maison_cite' && a.how === 'owned'), `home=${e1.home}`);
  await pick(page, 'Définir comme domicile principal');
  const e2 = await d(() => window.__dakar.estate());
  check('« Définir comme domicile principal » makes the house the home', e2.home === 'maison_cite', `home=${e2.home}`);
  await d(() => window.__dakar.hud?.closeModal?.()); await page.keyboard.press('Escape').catch(() => {});

  // the « Maison » app names it
  await d(() => window.__dakar.homeApp2()); await page.waitForSelector('#modal.on .item');
  const homeSub = await d(() => document.querySelector('#modal.on .sub, #modal.on h2 + *')?.textContent ?? document.querySelector('#modal.on')?.textContent ?? '');
  check('the Maison app shows it as « Domicile principal »', /Domicile principal/.test(homeSub) && /Maison familiale/.test(await title(page) + homeSub), homeSub.slice(0, 160));
  await page.screenshot({ path: `${out}/2-maison-app.png` });
  await page.keyboard.press('Escape').catch(() => {}); await d(() => document.querySelector('#modal.on .close, #modal.on [data-close]')?.click());

  // furniture from Keur Meubles, delivered there
  const house = e2.assets.find(a => a.spec === 'maison_cite').uid;
  for (const id of ['canape_wax', 'table_basse', 'lit_bois', 'chaise_bois']) await d(i => window.__dakar.buyPiece(i), id);
  const e3 = await d(() => window.__dakar.estate());
  check('four pieces delivered to the principal residence', pieces(e3, house).length >= 4 && pieces(e3, house).every(p => p.at), JSON.stringify(pieces(e3, house).map(p => p.spec)));

  // inside: « Aménager », one piece moved and turned
  await d(() => window.__dakar.enterHome('maison_cite'));
  await page.waitForFunction(() => window.__dakar.homeView()?.spec === 'maison_cite', null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  await d(() => window.__dakar.placer.open()); await page.waitForTimeout(800);
  const target = pieces(e3, house).find(p => p.spec === 'chaise_bois');
  const chair = e3.assets.find(a => a.spec === 'chaise_bois');
  await d(uid => window.__dakar.placer.select(uid), chair.uid);
  await d(() => { window.__dakar.placer.rotate(); window.__dakar.placer.rotate(); window.__dakar.placer.rotate(); });
  await d(() => window.__dakar.placer.move(0.5, 0)); await d(() => window.__dakar.placer.put());
  await page.waitForTimeout(500);
  await d(() => window.__dakar.placer.close()); await page.waitForTimeout(800);
  const e4 = await d(() => window.__dakar.estate()), chair4 = e4.assets.find(a => a.uid === chair.uid);
  check('« Aménager »: the chair moved and turned three quarters', chair4.at && chair4.at.rot === (((target.at?.rot ?? 0) + 3) % 4) && Math.abs(chair4.at.x - target.at.x - 0.5) < 0.01, JSON.stringify({ before: target.at, after: chair4.at }));
  await page.screenshot({ path: `${out}/3-amenage.png` });
  const before = { wallet: await d(() => window.__dakar.state.wallet), home: e4.home, furniture: pieces(e4, house), car: await d(() => window.__dakar.teranga.info().record) };
  check('the wallet paid the car, the house and the furniture', wallet0 - before.wallet > 90_000_000, `${wallet0} → ${before.wallet}`);

  // ------------------------------------------------------------------ 2. leave and come back: a real reload, from inside the house
  await page.reload({ timeout: 180000 }); await ready(page);
  await page.waitForTimeout(2500);
  const e5 = await d(() => window.__dakar.estate());
  check('after reload: the house is still owned and still the principal residence', e5.home === 'maison_cite' && e5.assets.some(a => a.spec === 'maison_cite' && a.how === 'owned'), `home=${e5.home}`);
  check('after reload: every piece is in the house, at its spot and turn', JSON.stringify(pieces(e5, house)) === JSON.stringify(before.furniture), JSON.stringify(pieces(e5, house)));
  const car5 = await d(() => window.__dakar.teranga.info());
  check('after reload: the Teranga is owned and parked where it was left', car5.owned && car5.record && Math.hypot(car5.record.x - before.car.x, car5.record.z - before.car.z) < 0.05 && (!car5.here || Math.hypot(car5.x - before.car.x, car5.z - before.car.z) < 0.5), JSON.stringify({ rec: car5.record, here: car5.here, x: car5.x, z: car5.z }));
  check('after reload: the wallet is the same to the franc', (await d(() => window.__dakar.state.wallet)) === before.wallet, `${before.wallet}`);
  const spots = await d(() => window.__dakar.citeSpots()), me = await d(() => window.__dakar.pos());
  const door = spots?.homes?.maison_cite?.door;
  check('after reload: the player comes back at the house\'s street door (saved from inside)', me.hub === 'pikine' && door && Math.hypot(me.x - door.x, me.z - door.z) < 3, JSON.stringify({ me, door }));
  await page.screenshot({ path: `${out}/4-after-reload.png` });

  // ------------------------------------------------------------------ 3. « Ma chambre »: kept, given back, (later) sublet
  await d(() => window.__dakar.assetSheet('chambre_pikine')); await page.waitForSelector('#modal.on .item');
  const roomItems = await items(page);
  await page.screenshot({ path: `${out}/5-ma-chambre.png` });
  check('« Ma chambre » offers: kept as a family room (current), give it back, sublet (later, disabled)',
    roomItems.some(i => /Garder comme chambre familiale/.test(i.text)) && roomItems.some(i => /Rendre la chambre à la famille/.test(i.text) && !i.disabled) && roomItems.some(i => /Sous-louer/.test(i.text) && i.disabled), JSON.stringify(roomItems.map(i => i.text.slice(0, 50))));
  await pick(page, 'Rendre la chambre à la famille'); await pick(page, 'Rendre la chambre');
  const flags = await d(() => window.__dakar.state.data.flags);
  check('given back: the story flag is set, the room is not a home to move into', flags.includes('chambre:rendue'), JSON.stringify(flags.slice(-3)));
  await d(() => window.__dakar.assetSheet('chambre_pikine')); await page.waitForSelector('#modal.on .item');
  check('and it can be asked back', (await items(page)).some(i => /Redemander ma chambre/.test(i.text)));
  await pick(page, 'Redemander ma chambre');
  check('asked back', !(await d(() => window.__dakar.state.data.flags)).includes('chambre:rendue'));

  // ------------------------------------------------------------------ 4. the save card: honest status, copy
  await d(() => window.__dakar.phone('reglages')); await page.waitForTimeout(600);
  await d(() => document.querySelector('.ph-save')?.scrollIntoView({ block: 'center' }));
  const line = await d(() => { const l = document.querySelector('.ph-save-line'); return l ? { cls: l.className, text: l.textContent } : null; });
  check('Réglages › Partie: one honest line (saved, when, on this device)', line && /ok/.test(line.cls) && /Sauvegardée il y a/.test(line.text) && /sur cet appareil/.test(line.text), JSON.stringify(line));
  await page.locator('[data-sv="copy"]').click(); await page.waitForTimeout(600);
  const code = await d(() => document.querySelector('.ph-code[readonly]')?.value ?? '');
  check('« Copier ma sauvegarde » shows the code (and copies it where the clipboard allows)', /^DAKARREK6:[A-Za-z0-9+/=]+\.[0-9a-f]{8}$/.test(code), code.slice(0, 40) + '…');
  await page.screenshot({ path: `${out}/6-save-card.png` });
  check('no JavaScript errors in the journey', errors.length === 0, errors.join(' | '));
  await ctx.close();

  // ------------------------------------------------------------------ 5. a wiped browser: import the code, the game comes back whole
  const ctx2 = await browser.newContext(phone);
  await ctx2.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'low'); } catch { /* */ } });
  const p2 = await ctx2.newPage(); p2.setDefaultTimeout(300000);
  const errors2 = []; p2.on('pageerror', e => errors2.push(e.message));
  await p2.goto(`${base}?debug&touch&heure=11`, { timeout: 180000 }); await ready(p2);
  check('a wiped browser starts a new game in « Ma chambre »', (await p2.evaluate(() => window.__dakar.estate().home)) === 'chambre_pikine');
  await p2.evaluate(() => window.__dakar.phone('reglages')); await p2.waitForTimeout(500);
  await p2.locator('[data-sv="import"]').click(); await p2.waitForTimeout(300);
  await p2.locator('.ph-save-io textarea').fill(code.slice(0, code.length - 30));
  await p2.locator('[data-sv="check"]').click(); await p2.waitForTimeout(300);
  check('a code cut short is refused with a reason, nothing replaced', /incomplet|illisible/.test(await p2.evaluate(() => document.querySelector('.ph-save-io [role="alert"]')?.textContent ?? '')));
  await p2.locator('.ph-save-io textarea').fill(code.replace(/(.{70})/g, '$1\n'));
  await p2.locator('[data-sv="check"]').click(); await p2.waitForTimeout(300);
  const summary = await p2.evaluate(() => document.querySelector('.ph-save-io')?.textContent.replace(/\s+/g, ' ') ?? '');
  await p2.screenshot({ path: `${out}/7-import-summary.png` });
  check('the summary before importing: the house, the car, the furniture, the money', /Maison familiale/.test(summary) && /1 véhicule/.test(summary) && /4 meubles/.test(summary), summary.slice(0, 200));
  await Promise.all([p2.waitForNavigation({ timeout: 180000 }), p2.locator('[data-sv="apply"]').click()]);
  await ready(p2); await p2.waitForTimeout(2000);
  const e6 = await p2.evaluate(() => window.__dakar.estate());
  check('imported: the house is the principal residence with every piece at its spot', e6.home === 'maison_cite' && JSON.stringify(pieces(e6, house)) === JSON.stringify(before.furniture), JSON.stringify(pieces(e6, house).map(p => p.spec)));
  check('imported: the Teranga, parked where it was', await p2.evaluate(r => { const i = window.__dakar.teranga.info(); return i.owned && i.record && Math.hypot(i.record.x - r.x, i.record.z - r.z) < 0.05; }, before.car));
  await p2.evaluate(() => window.__dakar.phone('reglages')); await p2.waitForTimeout(500);
  check('« Revenir à la partie d’avant l’import » is offered', await p2.locator('[data-sv="undo"]').count() === 1);
  check('no JavaScript errors in the import', errors2.length === 0, errors2.join(' | '));
  await ctx2.close();

  // ------------------------------------------------------------------ 6. a browser that refuses every write: never shown as saved
  const ctx3 = await browser.newContext(phone);
  await ctx3.addInitScript(() => { const set = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (String(k).startsWith('dakarrek.guest')) throw new DOMException('QuotaExceededError', 'QuotaExceededError'); return set.call(this, k, v); }; });
  const p3 = await ctx3.newPage(); p3.setDefaultTimeout(300000);
  await p3.goto(`${base}?debug&touch&heure=11`, { timeout: 180000 }); await ready(p3); await p3.waitForTimeout(9500);   // past the first autosave
  await p3.evaluate(() => window.__dakar.phone('reglages')); await p3.waitForTimeout(500);
  const bad = await p3.evaluate(() => { const l = document.querySelector('.ph-save-line'); return l ? { cls: l.className, text: l.textContent } : null; });
  check('storage refusing writes: the status says the save failed, never « Sauvegardée »', bad && /bad/.test(bad.cls) && /échoué|impossible/.test(bad.text) && !/Sauvegardée il y a/.test(bad.text), JSON.stringify(bad));
  await p3.locator('[data-sv="now"]').click(); await p3.waitForTimeout(400);
  const toast = await p3.evaluate(() => document.querySelector('#toast, .toast')?.textContent ?? '');
  check('« Sauvegarder maintenant » says it is impossible', /impossible/i.test(toast), toast);
  await p3.evaluate(() => window.__dakar.phone('portefeuille')); await p3.waitForTimeout(400);
  const walletNote = await p3.evaluate(() => document.querySelector('#phone')?.textContent ?? '');
  check('the wallet does not claim the money is saved', !/enregistré sur cet appareil|gardée sur cet appareil/.test(walletNote), walletNote.match(/Partie invité[^.]*\./)?.[0] ?? '');
  await p3.screenshot({ path: `${out}/8-storage-refused.png` });
  await ctx3.close();
} finally {
  fs.writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 1));
  const failed = results.filter(r => !r.ok).length;
  console.log(`${results.length - failed}/${results.length} passed`);
  await browser.close();
  process.exitCode = failed ? 1 : 0;
}
