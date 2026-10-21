// Journey D of the vehicles economy (docs/vehicles/ECONOMY.md): a damaged car, not enough money for the repair, an arrangement with Modou, Lamine's real work, repaid later.
// Start (debug hooks, as a save would be): a player Tonton Ibou recommended to Modou (the beat « Recommandé par Ibou », played through the game's own effects), who owns a Teranga
// bought at Sarr Auto, badly knocked about (two hard crashes), with 25 000 F in pocket. Then, with real touch: the car is driven into Modou's repair bay; « Faire réparer »; Lamine walks
// over and inspects; the quote: the full repair is more than the player has; « Discuter avec Modou »: he offers to take part now and the rest on his slate (a debt, never money);
// accepted; Lamine works (about 30 s); ONE payment at the end (the part agreed), the car back to 100 %, the rest on Modou's slate; the slate is not the dealer's credit; the next day
// an installment falls due; the player repays at the garage (« Rembourser Modou »), then the rest; the slate closes; he remembers it (trust up). A reload keeps the slate.
// Usage: node scripts/check-garage-credit.mjs <baseUrl> <outDir>
import { chromium } from 'playwright';
import fs from 'node:fs';
import { realTouch, pilot, walkTo, boardVehicle } from './lib/realTouch.mjs';

const [base = 'http://127.0.0.1:4422/', out = '/tmp/claude-0/veh/journey-d'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
let failed = 0, total = 0; const T = { timeout: 300000 };
const check = (name, ok, detail = '') => { total++; if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${detail}`); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
await context.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'low'); } catch { /* */ } });
const page = await context.newPage(); page.setDefaultTimeout(300000);
const errors = []; page.on('pageerror', e => errors.push(e.message));
const d = (fn, a) => page.evaluate(fn, a);
let shotN = 0; const shot = async n => { await page.waitForTimeout(400); await page.screenshot({ path: `${out}/${String(++shotN).padStart(2, '0')}-${n}.png` }); };
const g = () => d(() => window.__dakar.garage.info()), W = () => d(() => window.__dakar.state.wallet), HP = () => d(() => window.__dakar.teranga.health());
const loans = () => d(() => window.__dakar.state.data.loans.list.map(l => ({ ...l })));
const modal = () => d(() => document.querySelector('#modal.on')?.textContent ?? '');
const tapItem = async text => { const it = page.locator('#modal .item', { hasText: text }).first(); if (!(await it.count())) return false; await it.scrollIntoViewIfNeeded().catch(() => {}); const b = await it.boundingBox(); await t.down(5, b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(60); await t.up(5); return true; };
const ready = () => page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.garage?.info().bay, null, T);

await page.goto(`${base}?debug&touch&heure=10&argent=4100000`, { timeout: 180000 });
await ready();
let t = await realTouch(page);
// ---- the start
await d(() => window.__dakar.playBeat('modou_reco', 'commencer'));
await page.waitForFunction(() => window.__dakar.teranga.info().floor.length > 0, null, T);
await d(() => window.__dakar.teranga.own());
await page.waitForFunction(() => window.__dakar.teranga.info().owned && window.__dakar.teranga.info().here, null, T);
await d(() => { window.__dakar.state.data.wallet = 25000; window.__dakar.teranga.hurt(16, true); window.__dakar.teranga.hurt(16, true); window.__dakar.teranga.hurt(16, true); });
const hp0 = await HP(), trust0 = await d(() => window.__dakar.rel.level('modou'));
check('the start: a Teranga badly knocked about (three hard crashes), 25 000 F in pocket, known to Modou (Ibou\'s recommendation)', hp0 < 70 && (await W()) === 25000 && trust0 >= 10, JSON.stringify({ hp0, trust0 }));
// ---- into the bay, driven
const bay = (await g()).bay;
await d(([x, z, yaw]) => window.__dakar.teranga.place(x, z, yaw), [bay.x - 28, bay.z + 0.3, Math.PI / 2]);        // up the street, in line with the bay along the kerb
await d(([x, z]) => window.__dakar.place(x, z, 0), [bay.x - 27.6, bay.z - 1.9]);                 // by the driver's door (the car's left, the kerb side)
await page.waitForTimeout(800);
await boardVehicle(page, t, 'teranga');
await pilot(page, t, 'teranga', [{ x: bay.x - 12, z: bay.z + 0.3, tol: 1.6, speed: 3 }, { x: bay.x - 4, z: bay.z + 0.15, tol: 1.2, speed: 1.8 }, { x: bay.x + 0.6, z: bay.z, tol: 0.9, speed: 1.1 }], { brakeAtEnd: true, cruise: 3 });
console.log('bay try', JSON.stringify({ car: await d(() => window.__dakar.teranga.at()), bay }));
await t.tap('#ridepad .rp-off'); await page.waitForFunction(() => !window.__dakar.teranga.info().driving && window.__dakar.pos().mode === 'play', null, T);
await page.waitForTimeout(800);
const inBay = await g();
check('driven into Modou\'s repair bay: the garage sees the damaged car', inBay.vehicles.some(v => v.asset === 'teranga'), JSON.stringify(inBay.vehicles));
await walkTo(page, t, bay.x, bay.z + 3.2, { tol: 0.9, ms: 60000 });
await page.waitForFunction(() => /Faire réparer/.test(window.__dakar.focus()?.all?.join('|') ?? ''), null, { timeout: 30000 }).catch(() => {});
await t.tap('#act');
await page.waitForFunction(() => window.__dakar.garage.info().phase === 'inspect', null, { timeout: 120000 }).catch(() => {});
await shot('lamine-inspects');
await page.waitForFunction(() => /devis/i.test(document.querySelector('#modal.on')?.textContent ?? ''), null, { timeout: 120000 });
const q = (await g()).job?.quote, qt = await modal();
await shot('quote');
const fullDisabled = await d(() => [...document.querySelectorAll('#modal .item')].find(b => /Réparer entièrement/.test(b.textContent))?.classList.contains('dis') ?? null);
check(`the quote: the full repair (${q?.cost} F) is more than the 25 000 F in pocket: it cannot be chosen; « Discuter avec Modou » is there`, q && q.cost > 25000 && fullDisabled !== false && /Discuter avec Modou/.test(qt), JSON.stringify({ q, fullDisabled }));
check('a repair of a 4 000 000 F car stays in proportion (not hundreds of thousands)', q && q.cost <= 60000, JSON.stringify(q));
await tapItem('Discuter avec Modou');
await page.waitForFunction(() => /Modou ·/.test(document.querySelector('#modal.on')?.textContent ?? ''), null, { timeout: 20000 });
const talk = await modal(); await shot('modou-arrangement');
check('Modou offers an arrangement: part now, the rest on his slate', /ardoise/.test(talk), talk.slice(0, 220));
const w0 = await W();
const picked = await tapItem('Tout réparer');
check('the arrangement chosen (the whole repair, part paid at the end)', picked);
await page.waitForFunction(() => window.__dakar.garage.info().phase === 'work', null, { timeout: 30000 });
await shot('lamine-works');
check('Lamine works; nothing is paid before the end', (await W()) === w0);
await page.waitForFunction(() => window.__dakar.garage.info().phase === null, null, { timeout: 180000 });
const w1 = await W(), hp1 = await HP(), L1 = (await loans()).filter(l => l.lender === 'modou');
const slate = L1[0];
check('ONE payment at the end (the part agreed); the car is back to 100 %', w0 - w1 > 0 && w0 - w1 < q.cost && hp1 >= 99.9, JSON.stringify({ paid: w0 - w1, hp1 }));
check('the rest is on Modou\'s slate: a debt with Modou (not the dealer\'s credit), principal = the quote minus what was paid; no money was given', slate && slate.kind === 'repair' && slate.principal + (w0 - w1) === q.cost && L1.length === 1 && !(await loans()).some(l => l.lender === 'sarr'), JSON.stringify(slate));
await shot('repaired');
// a reload keeps the slate
await d(() => window.__dakar.save()); await d(() => history.replaceState(null, '', location.href.replace(/&argent=\d+/, ''))); await page.reload(); await ready(); t = await realTouch(page); await page.waitForTimeout(1500);
const L2 = (await loans()).filter(l => l.lender === 'modou');
check('reloaded: the slate is still there, the same amount', L2.length === 1 && L2[0].principal === slate.principal && L2[0].paid === 0, JSON.stringify(L2[0]));
// the next day: an installment falls due. A shift helping the mechanic (real work, real pay), then repaid at the garage
await d(() => window.__dakar.nextDay(1)); await page.waitForTimeout(2500);
const shop = (await d(() => window.__dakar.cityPlaces())).find(p => p.actions?.some(a => a.id === 'meca'));
await walkTo(page, t, shop.x, shop.z + 2, { tol: 1.2, ms: 60000 });
await d(([x, z]) => window.__dakar.place(x, z + 1.6, Math.PI), [shop.x, shop.z]);
await page.waitForFunction(i => window.__dakar.focus()?.id === i, shop.id, { timeout: 15000 }).catch(() => {});
await t.tap('#act'); await page.waitForSelector('#modal.on', T);
const wShift = await W();
await tapItem('Aider le mécanicien');
await page.waitForFunction(w => window.__dakar.state.wallet > w, wShift, { timeout: 120000 }).catch(() => {});
const wb = await W();
check('a shift helping the mechanic pays (real work between the repair and the repayment)', wb > wShift, JSON.stringify({ before: wShift, after: wb }));
await walkTo(page, t, bay.x + 1.5, bay.z + 3.4, { tol: 1.0, ms: 60000 });
await page.waitForFunction(() => /Rembourser Modou/.test(window.__dakar.focus()?.primary ?? ''), null, { timeout: 30000 }).catch(() => {});
const foc = await d(() => window.__dakar.focus());
check('at the garage, owing Modou: « Rembourser Modou » is the prompt', /Rembourser Modou/.test(foc?.primary ?? ''), JSON.stringify({ primary: foc?.primary, all: foc?.all }));
await t.tap('#act');
await page.waitForSelector('#modal.on', T); await shot('repay-menu');
const menu = await modal();
const payInst = await tapItem('Payer une échéance') || await tapItem('Payer ce que j’ai') || await tapItem('Payer le retard');
await page.waitForTimeout(800);
const L3 = (await loans()).find(l => l.id === slate.id), w2 = await W();
check('an installment repaid: the slate goes down by what was paid, the wallet by the same', payInst && L3.paid > 0 && wb - w2 === L3.paid, JSON.stringify({ menu: menu.slice(0, 160), paid: L3.paid, wallet: wb - w2 }));
// the rest, a few days later (the money of those days stands in for a few days of work: a debug credit, labelled so)
await d(() => window.__dakar.nextDay(2)); await page.waitForTimeout(1500);
await d(() => window.__dakar.state.addMoney(20000, 'Test : quelques jours de travail'));
await t.tap('#menuBtn'); await page.waitForFunction(() => window.__dakar.phoneInfo().open, null, T);
await t.tap('#phone [data-nav="home"]'); await page.waitForTimeout(300);
await t.tap('#phone [data-app="credits"]'); await page.waitForSelector('#modal.on', T);
await shot('credits-app');
await tapItem('ardoise');
await page.waitForTimeout(500);
const allOk = await tapItem('Tout rembourser');
await page.waitForTimeout(800);
const L4 = (await loans()).find(l => l.id === slate.id), trust1 = await d(() => window.__dakar.rel.level('modou'));
check('the rest repaid from the phone (« Crédits »): the slate is closed, and Modou remembers a customer who pays (trust up)', allOk && L4.status === 'closed' && trust1 > trust0, JSON.stringify({ status: L4.status, paid: L4.paid, missed: L4.missed, trust0, trust1 }));
await shot('slate-closed');
check('no JavaScript error', errors.length === 0, errors.slice(0, 2).join(' | '));
await browser.close();
console.log(`${total - failed}/${total} passed`);
process.exit(failed ? 1 : 0);
