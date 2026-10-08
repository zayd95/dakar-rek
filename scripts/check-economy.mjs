// Lot B "Première ascension" headless check: Tiak Tiak delivery → paid once → furniture → room → Ibou → reload.
// Usage: npx vite preview --port 4202 (after npm run build), then node scripts/check-economy.mjs [baseUrl] [outDir]
// Chromium + SwiftShader (CPU rendering): this is not a phone measurement.
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:4202/';
const out = process.argv[3] ?? 'docs/screenshots/economy';
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
const pick = async (page, text) => { await page.locator('#modal.on .item', { hasText: text }).first().click(); await page.waitForTimeout(250); };
/** Place the player and wait until the frame loop sees the expected nearby place (SwiftShader frames can be slow). */
const goNear = async (page, x, z, yaw, name) => {
  await D(page, ([a, b, c]) => window.__dakar.place(a, b, c), [x, z, yaw]);
  await page.waitForFunction(n => window.__dakar.pos().near === n, name, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(200);
};
const toast = page => D(page, () => document.querySelector('#toast').textContent);
const insideRoom = async page => { await page.waitForFunction(() => window.__dakar.pos().x > 900, null, { timeout: 8000 }).catch(() => {}); await page.waitForTimeout(400); return D(page, () => window.__dakar.pos()); };
const outside = async page => { await D(page, () => window.__dakar.exit()); await page.waitForFunction(() => window.__dakar.pos().x < 900, null, { timeout: 8000 }).catch(() => {}); await page.waitForTimeout(300); };
/** Fixed camera in the starter room (same view before/after), from the door corner towards the bed. */
const roomCam = (page, ox) => D(page, o => window.__dakar.cam([o + 2.65, 2.45, 2.15], [o - 1.0, 0.55, -0.9]), ox);
const watchErrors = page => { const errors = []; page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error' && !m.location().url.endsWith('/assets/car_rapide.glb')) errors.push(m.text()); }); return errors; };

let savedJson = null;
// ------------------------------------------------------------------ desktop: the whole loop
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await page.goto(`${base}?debug`, { waitUntil: 'load' }); await ready(page);
  await D(page, () => localStorage.clear()); await page.reload({ waitUntil: 'load' }); await ready(page);
  await page.waitForTimeout(1200);
  await D(page, () => { window.__dakar.setHour(10); window.__dakar.teleport('pikine'); });
  await page.waitForTimeout(800);
  check('fresh save: first suggestion is still Ibou’s welcome', (await D(page, () => window.__dakar.suggestion())) === 'ibou_welcome');
  check('fresh save: empty ledger and no furniture', await D(page, () => window.__dakar.ledger().length === 0 && window.__dakar.furniture().owned.length === 0));

  // starter room before any purchase
  await D(page, () => window.__dakar.enter('home'));
  const room0 = await insideRoom(page);
  const ox = room0.x - 1.1;                       // room spawn is 1.1 m east of the room centre
  await roomCam(page, ox); await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}/desktop-room-before.png` });
  await D(page, () => window.__dakar.cam(null)); await outside(page);

  // Ibou's welcome (story), then the chip points to the first delivery
  await D(page, () => window.__dakar.playBeat('ibou_welcome', 'oui'));
  check('after the welcome, the chip points to Tiak Tiak', (await D(page, () => window.__dakar.suggestion())) === 'goal_tiak');

  // accept a delivery at the pick-up point (Gargote Mame Diarra), through the action menu
  const its = await D(page, () => window.__dakar.interactables());
  const garg = its.find(i => i.id === 'pikine:gargote:32') ?? its.find(i => /Mame Diarra/.test(i.name));
  const garage = its.find(i => /:garage:/.test(i.id));
  const shop = its.find(i => i.id.includes(':shop:'));
  check('furniture stall exists in Pikine', !!shop, shop ? `${shop.name} ${shop.x.toFixed(0)},${shop.z.toFixed(0)}` : 'none');
  await goNear(page, garg.x, garg.z + 1.5, Math.PI, garg.name);
  await D(page, () => window.__dakar.act()); await page.waitForTimeout(300);
  await pick(page, 'Livraisons Tiak Tiak');
  await page.screenshot({ path: `${out}/desktop-jobs-offers.png` });
  const offerCount = await page.locator('#modal.on .item:not(.close)').count();
  check('pick-up point lists its delivery offers', offerCount >= 2, `${offerCount} offers`);
  const wallet0 = await D(page, () => window.__dakar.state.wallet);
  await pick(page, 'Garage Modou');
  const job = await D(page, () => window.__dakar.activeJob());
  check('delivery accepted at the pick-up point (parcel in hand)', job?.routeId === 'pk_mame_garage' && job.stage === 'deliver', JSON.stringify(job));

  // marker + HUD line, seen from the street
  await D(page, ([x, z]) => window.__dakar.place(x, z + 22, Math.PI), [garage.x, garage.z]);
  await page.waitForFunction(() => /, 2\d m/.test(document.querySelector('#delivery.on')?.textContent ?? ''), null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(800);
  const line = await D(page, () => document.querySelector('#delivery.on')?.textContent ?? '');
  const mk = await D(page, () => window.__dakar.marker());
  check('HUD line "Livraison → <place>, X m"', /Livraison → Garage Modou, \d+ m/.test(line), line);
  check('world marker on the drop-off', mk.visible && Math.hypot(mk.x - garage.x, mk.z - garage.z) < 0.5, JSON.stringify(mk));
  await page.screenshot({ path: `${out}/desktop-delivery-marker.png` });

  // walk the last metres into the ring: paid on arrival (SwiftShader runs at a few fps here, so allow time)
  await D(page, ([x, z]) => window.__dakar.place(x, z + 6.5, Math.PI), [garage.x, garage.z]);
  await page.waitForTimeout(300);
  await page.keyboard.down('KeyW');
  for (let i = 0; i < 150 && (await D(page, () => window.__dakar.activeJob())); i++) await page.waitForTimeout(200);
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(300);
  const paidToast = await toast(page);
  await page.screenshot({ path: `${out}/desktop-delivery-paid.png` });
  const wallet1 = await D(page, () => window.__dakar.state.wallet);
  check('walked to the drop-off: delivery paid', wallet1 - wallet0 === 1200 && (await D(page, () => window.__dakar.activeJob())) === null, `${wallet0} → ${wallet1} · ${paidToast}`);
  check('first client met, recommended run unlocked', /Nouvelle cliente/.test(paidToast) && (await D(page, () => window.__dakar.jobs()))[0]?.recommended === true, paidToast);
  // the same run handed over again pays nothing
  const again = await D(page, id => window.__dakar.completeJob(id), job.runId);
  check('completing the same run id twice pays once', again === null && (await D(page, () => window.__dakar.state.wallet)) === wallet1);
  // a second run via the debug hooks: complete() twice → one payment; cancel → nothing
  const j2 = await D(page, () => window.__dakar.acceptJob('pk_maiga_cafe'));
  const c1 = await D(page, () => window.__dakar.completeJob()), c2 = await D(page, id => window.__dakar.completeJob(id), j2.runId);
  const wallet2 = await D(page, () => window.__dakar.state.wallet);
  check('second run: complete twice → one payment', c1?.paid === 1000 && c2 === null && wallet2 === wallet1 + 1000, `${JSON.stringify(c1)} ${JSON.stringify(c2)} ${wallet2}`);
  await D(page, () => window.__dakar.acceptJob('pk_pathe_arena'));
  const cancelled = await D(page, () => [window.__dakar.cancelJob(), window.__dakar.cancelJob(), window.__dakar.completeJob()]);
  check('cancel: no payment, no double effect', cancelled[0] === true && cancelled[1] === false && cancelled[2] === null && (await D(page, () => window.__dakar.state.wallet)) === wallet2);
  const led = await D(page, () => window.__dakar.ledger());
  check('ledger records the deliveries (newest first)', led.length === 2 && led[0].amount === 1000 && /Livraison Tiak Tiak/.test(led[1].label), JSON.stringify(led));

  // Ibou reacts to the first delivery and suggests a goal (UI)
  check('Ibou’s delivery beat is suggested', (await D(page, () => window.__dakar.suggestion())) === 'ibou_tiak');
  await D(page, () => window.__dakar.openNpc('ibou')); await page.waitForTimeout(300);
  await pick(page, 'Le Tiak Tiak');
  await page.screenshot({ path: `${out}/desktop-ibou-tiak.png` });
  await pick(page, 'une radio');
  await page.screenshot({ path: `${out}/desktop-ibou-tiak-reply.png` });
  await pick(page, 'Continuer');
  check('Ibou sets the goal (radio)', (await D(page, () => window.__dakar.flags())).includes('objectif:radio'));
  const goalId = await D(page, () => window.__dakar.suggestion());
  await closeModal(page);
  check('the chip now points to buying the radio', goalId === 'goal_buy', goalId);

  // buy the radio at the stall (UI)
  await goNear(page, shop.x, shop.z + 1.5, Math.PI, shop.name);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/desktop-shop-stall.png` });
  await D(page, () => window.__dakar.act()); await page.waitForTimeout(300);
  await pick(page, 'Voir les meubles');
  await page.screenshot({ path: `${out}/desktop-shop-menu.png` });
  const w3 = await D(page, () => window.__dakar.state.wallet);
  await pick(page, 'Petite radio');
  const f1 = await D(page, () => window.__dakar.furniture());
  const w4 = await D(page, () => window.__dakar.state.wallet);
  check('bought the radio at the stall (charged once)', f1.owned.includes('radio') && w3 - w4 === 4000, `${w3} → ${w4}`);
  check('buying it again is refused (no double charge)', (await D(page, () => window.__dakar.buy('radio'))) === false && (await D(page, () => window.__dakar.state.wallet)) === w4);

  // it is in the room and usable
  await D(page, () => window.__dakar.enter('home'));
  await insideRoom(page);
  await roomCam(page, ox); await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}/desktop-room-after-radio.png` });
  await D(page, () => window.__dakar.cam(null));
  await goNear(page, ox - 0.9, -1.55, Math.PI, 'Petite radio');
  const nearRadio = await D(page, () => window.__dakar.pos().near);
  check('radio is in the room with its action', nearRadio === 'Petite radio', nearRadio);
  const moral0 = await D(page, () => window.__dakar.state.data.needs.moral);
  await D(page, () => window.__dakar.act()); await page.waitForTimeout(300);
  await pick(page, 'Écouter la radio');
  await page.waitForFunction(() => window.__dakar.pos().mode === 'play', null, { timeout: 10000 }).catch(() => {});
  const moral1 = await D(page, () => window.__dakar.state.data.needs.moral);
  check('« Écouter la radio » raises the mood', moral1 > moral0, `${moral0.toFixed(1)} → ${moral1.toFixed(1)}`);
  await page.screenshot({ path: `${out}/desktop-room-radio-gameplay.png` });

  // more furniture (debug money, labelled in the ledger) while standing in the room: it refreshes in place
  await D(page, () => window.__dakar.state.addMoney(40000, 'Argent de test (debug)'));
  const bought = await D(page, () => ['miroir', 'tapis', 'chaises', 'matelas', 'tele'].map(id => window.__dakar.buy(id)));
  check('all six items can be bought; the room refreshes while inside', bought.every(Boolean) && (await D(page, () => window.__dakar.pos().x)) > 900, JSON.stringify(bought));
  await page.waitForTimeout(400);
  await roomCam(page, ox); await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}/desktop-room-after-all.png` });
  await D(page, () => window.__dakar.cam(null));
  await goNear(page, ox - 0.25, -0.6, -Math.PI / 2, 'Lit · bon matelas');
  await D(page, () => window.__dakar.act()); await page.waitForTimeout(300);
  const bedMenu = await D(page, () => document.querySelector('#modal.on')?.textContent ?? '');
  check('bed now offers the better sleep', /bon matelas/.test(bedMenu), bedMenu.slice(0, 80));
  await closeModal(page); await page.waitForTimeout(200);
  await outside(page);

  // Ibou's furniture beat is available; then reload and check everything persisted
  check('Ibou’s furniture beat is suggested', (await D(page, () => window.__dakar.suggestion())) === 'ibou_meuble');
  await page.waitForTimeout(300);
  const before = await D(page, () => ({ w: window.__dakar.state.wallet, ledger: window.__dakar.ledger(), owned: window.__dakar.furniture().owned, done: window.__dakar.state.data.jobs.done.length, n: window.__dakar.state.data.counters.livraisons }));
  await page.reload({ waitUntil: 'load' }); await ready(page); await page.waitForTimeout(1500);
  const after = await D(page, () => ({ w: window.__dakar.state.wallet, ledger: window.__dakar.ledger(), owned: window.__dakar.furniture().owned, done: window.__dakar.state.data.jobs.done.length, n: window.__dakar.state.data.counters.livraisons, ver: JSON.parse(localStorage.getItem('dakarrek.guest.save')).schemaVersion }));
  check('reload: money persisted', after.w === before.w, `${before.w} / ${after.w}`);
  check('reload: ledger persisted', JSON.stringify(after.ledger) === JSON.stringify(before.ledger) && after.ledger.length >= 8, `${after.ledger.length} entries`);
  check('reload: furniture persisted', JSON.stringify(after.owned) === JSON.stringify(before.owned) && after.owned.length === 6, after.owned.join(','));
  check('reload: completed runs and delivery count persisted', after.done === before.done && after.n === before.n, `${after.done} runs, ${after.n} deliveries`);
  check('save is schema v3', after.ver === 3, after.ver);
  check('reload: Ibou’s furniture beat still available', (await D(page, () => window.__dakar.suggestion())) === 'ibou_meuble');
  await D(page, () => { window.__dakar.setHour(10); window.__dakar.teleport('pikine'); }); await page.waitForTimeout(600);
  await D(page, () => window.__dakar.openNpc('ibou')); await page.waitForTimeout(300);
  await pick(page, 'La chambre prend forme');
  await page.screenshot({ path: `${out}/desktop-ibou-meuble.png` });
  await pick(page, 'Des chaises');
  await pick(page, 'Continuer');
  await closeModal(page);
  check('after Ibou’s furniture beat the chip moves on', (await D(page, () => window.__dakar.suggestion())) !== 'ibou_meuble');
  await D(page, () => window.__dakar.wallet()); await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/desktop-wallet.png` });
  await closeModal(page);
  // a room rebuilt from the save after reload still shows the furniture
  await D(page, () => window.__dakar.enter('home'));
  await insideRoom(page);
  await roomCam(page, ox); await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}/desktop-room-after-reload.png` });
  await D(page, () => window.__dakar.cam(null)); await outside(page);
  savedJson = await D(page, () => { window.__dakar.state.data.jobs.active = null; return localStorage.getItem('dakarrek.guest.save'); });
  check('desktop: no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// ------------------------------------------------------------------ phone 390×844: same save, menus and HUD line
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  await ctx.addInitScript(s => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('dakarrek.guest.save', s); sessionStorage.setItem('seeded', '1'); } }, savedJson);
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await page.goto(`${base}?debug&touch`, { waitUntil: 'load' }); await ready(page); await page.waitForTimeout(1500);
  await D(page, () => { window.__dakar.setHour(16); window.__dakar.teleport('pikine'); }); await page.waitForTimeout(600);
  check('phone: save loaded with furniture', (await D(page, () => window.__dakar.furniture().owned.length)) === 6);
  await D(page, () => window.__dakar.jobsMenu()); await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/phone-jobs-app.png` });
  await pick(page, 'Gare des cars rapides');      // accepted from the phone: go to the pick-up first
  const pj = await D(page, () => window.__dakar.activeJob());
  check('phone: accepted from the jobs app → pick-up stage', pj?.stage === 'pickup', JSON.stringify(pj));
  const its = await D(page, () => window.__dakar.interactables());
  const maiga = its.find(i => /:maiga:/.test(i.id));
  await D(page, ([x, z]) => window.__dakar.place(x, z + 2, Math.PI), [maiga.x, maiga.z]);
  await page.waitForFunction(() => window.__dakar.activeJob()?.stage === 'deliver', null, { timeout: 15000 }).catch(() => {});
  const st = await D(page, () => window.__dakar.activeJob());
  check('phone: walking to the pick-up point starts the delivery leg', st?.stage === 'deliver', JSON.stringify(st));
  const station = its.find(i => /:station/.test(i.id));
  await D(page, ([x, z, mx, mz]) => { const yaw = Math.atan2(x - mx, z - mz); window.__dakar.place(mx + (x - mx) * 0.6, mz + (z - mz) * 0.6, yaw); }, [station.x, station.z, maiga.x, maiga.z]);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/phone-delivery-marker.png` });
  const line = await D(page, () => document.querySelector('#delivery.on')?.textContent ?? '');
  check('phone: HUD line visible', /Livraison → Gare des cars rapides, \d+ m/.test(line), line);
  await D(page, () => window.__dakar.completeJob()); await page.waitForTimeout(300);
  await D(page, () => window.__dakar.homeApp()); await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/phone-home-app.png` });
  await closeModal(page);
  await D(page, () => window.__dakar.wallet()); await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/phone-wallet.png` });
  await closeModal(page);
  await D(page, () => window.__dakar.enter('home'));
  await insideRoom(page);
  await page.screenshot({ path: `${out}/phone-room-gameplay.png` });
  await outside(page);
  check('phone: no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// ------------------------------------------------------------------ an old v2 off-map save still loads (launch check case)
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await ctx.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('dakarrek.guest.save', JSON.stringify({ schemaVersion: 2, guestId: 'recovery-test', hub: 'pikine', x: 1040, z: 0, wallet: 7777 })); sessionStorage.setItem('seeded', '1'); } });
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await page.goto(`${base}?debug&touch`, { waitUntil: 'load' }); await ready(page); await page.waitForTimeout(800);
  const r = await D(page, () => ({ p: window.__dakar.pos(), w: window.__dakar.state.wallet, ledger: window.__dakar.ledger().length, owned: window.__dakar.furniture().owned.length, ver: window.__dakar.state.data.schemaVersion }));
  check('old v2 off-map save: recovered in the city, money kept, empty ledger, no furniture, v3', Math.abs(r.p.x) < 200 && Math.abs(r.p.z) < 200 && r.w === 7777 && r.ledger === 0 && r.owned === 0 && r.ver === 3, JSON.stringify(r));
  check('old save: no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

await browser.close();
fs.writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 1));
console.log(`${results.filter(r => r.ok).length}/${results.length} passed`);
process.exit(results.every(r => r.ok) ? 0 : 1);
