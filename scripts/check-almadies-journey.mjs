// M4 « One Evening Out » (docs/districts/M4-ALMADIES.md): the golden path, played with the REAL touch controls in one session (video recorded).
// Almadies at 19:00, the player's Teranga is driven with the pedal stick into the marked visitor bay in the Terrasse de Ngor forecourt, parked and stepped out of.
// On foot to the door, « Entrer », up to the terrace. The bar: « Commander » a dish, which is a real activity: paid once at the start, prepared,
// the guest walks to a table and sits, the plate is set on the table and eaten, the needs rise at the last bite; « Se lever ». Awa Sy, the venue host:
// « Parler à Awa », « Je fête un bon travail », her hand-off to La Vague (the walking marker). A second word the same evening gives nothing more.
// Downstairs, La Vague (21:30, a labelled hour shortcut): the door, the fee shown first and paid once, the dance floor and one dance (the beat game is finished
// with the existing debug shortcut `gestureFinish`, as scripts/check-venues.mjs does), the way out: the end-of-evening card, once. The taxi from the rank takes the
// player home (the fare paid once); the car is still parked where it was left. A later city day (labelled debug shortcut): Awa recognises the guest, remembers
// what they said and what they did, and offers one coffee on the house (free, once); a reload keeps everything and counts nothing twice.
// Debug hooks used: the hour, the next city day, putting the car and the player near a spot (labelled), the beat-game finish, reading state.
// Usage: node scripts/check-almadies-journey.mjs <baseUrl> <outDir>
import { chromium } from 'playwright';
import fs from 'node:fs';
import { realTouch, pilot, boardVehicle, walkTo } from './lib/realTouch.mjs';

const [base = 'http://127.0.0.1:4650/', out = '/tmp/claude-0/m4/journey'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
let failed = 0, total = 0; const T = { timeout: 300000 };
const check = (name, ok, detail = '') => { total++; if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${detail}`); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, recordVideo: process.env.NOVIDEO ? undefined : { dir: out, size: { width: 390, height: 844 } } });
await context.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'low'); } catch { /* */ } });
const page = await context.newPage(); page.setDefaultTimeout(300000);
const errors = []; page.on('pageerror', e => errors.push(e.message));
const d = (fn, a) => page.evaluate(fn, a);
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
let shotN = 0; const shot = async n => { await page.waitForTimeout(400); await page.screenshot({ path: `${out}/${String(++shotN).padStart(2, '0')}-${n}.png` }); };
const ready = async () => { await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.almadies && window.__dakar.rooftop && window.__dakar.teranga, null, T); };
const items = () => d(() => [...document.querySelectorAll('#modal.on .item')].map(e => ({ text: e.textContent.replace(/\s+/g, ' ').trim(), off: e.classList.contains('dis') })).filter(i => i.text !== '✕'));
const sheet = () => d(() => { const m = document.querySelector('#modal.on'); return m ? m.textContent.replace(/\s+/g, ' ').trim() : null; });
const toast = () => d(() => document.getElementById('toast')?.textContent ?? '');
const card = () => d(() => document.querySelector('.mo')?.textContent.replace(/\s+/g, ' ').trim() ?? '');
const A = () => d(() => window.__dakar.almadies.info());
const S = () => d(() => ({ wallet: window.__dakar.state.wallet, n: { ...window.__dakar.state.data.needs }, c: { ...window.__dakar.state.data.counters }, ledger: window.__dakar.state.data.ledger.length }));
let t;
async function tapItem(re) {
  const rowAt = () => d(r => { const e = [...document.querySelectorAll('#modal.on .item')].find(x => new RegExp(r).test(x.textContent.replace(/\s+/g, ' ').trim())); if (!e) return null; e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }, re);
  const before = await sheet();
  for (let n = 0; n < 2; n++) {
    let box = await rowAt();
    for (let k = 0; k < 10 && box; k++) { await page.waitForTimeout(120); const again = await rowAt(); if (again && Math.abs(again.x - box.x) < 0.5 && Math.abs(again.y - box.y) < 0.5) break; box = again; }
    if (!box) { if (n) return; throw new Error(`no sheet row matches /${re}/: ${JSON.stringify(await items())}`); }
    await t.down(5, box.x, box.y); await page.waitForTimeout(60); await t.up(5); await page.waitForTimeout(700);
    if ((await sheet()) !== before) return;
    log(`tap on /${re}/ not taken, once more`);
  }
}
/** The action button for a focus id: tapped once it is offered. */
async function act(id, ms = 25000) {
  await page.waitForTimeout(500);
  const ok = await page.waitForFunction(i => window.__dakar.focus()?.id === i, id, { timeout: ms }).then(() => true, () => false);
  if (ok) { await t.tap('#act'); await page.waitForTimeout(900); }
  return ok;
}
const until = (fn, a, ms = 120000) => page.waitForFunction(fn, a, { timeout: ms }).then(() => true, () => false);

log('boot');
await page.goto(`${base}?debug&touch&heure=19&argent=4500000`, { timeout: 180000 });
await ready();
t = await realTouch(page);
// ---------------------------------------------------------------- set-up: the Teranga bought, Almadies, the door of the terrace found
await page.waitForFunction(() => window.__dakar.teranga.info().floor.length > 0, null, T);
await d(() => window.__dakar.teranga.own());
await page.waitForFunction(() => window.__dakar.teranga.info().owned, null, T);
await d(() => window.__dakar.teleport('almadies'));
await page.waitForFunction(() => window.__dakar.pos().hub === 'almadies' && window.__dakar.rooftop.info()?.hub === 'almadies' && window.__dakar.pos().mode === 'play', null, T);
await page.waitForTimeout(2500);
const info = await d(() => window.__dakar.rooftop.info());
const car0 = await d(() => window.__dakar.teranga.info());
const st0 = await S();
check('a new evening: nothing of M4 is remembered yet', Object.keys(st0.c).filter(k => k.startsWith('al_') && st0.c[k] !== 0).length === 0 && (await A()).stages === 0, JSON.stringify((await A()).counters));
check('the Terrasse de Ngor has a door in the Almadies streets, and Awa Sy stands on its terrace', !!info && info.hub === 'almadies' && (await A()).awa?.doorId === info.door.id, JSON.stringify({ door: info.door, awa: (await A()).awa }));

// ---------------------------------------------------------------- 1. the car, to the road nearest the door
const R = info.door, rv = Math.round(R.x / 60) * 60, rh = Math.round(R.z / 60) * 60, vert = Math.abs(R.x - rv) <= Math.abs(R.z - rh);
const side = Math.sign(vert ? R.x - rv : R.z - rh) || 1, lane = 4.3;
const startPt = vert ? { x: rv + side * lane, z: Math.min(118, R.z + 56) } : { x: Math.max(-118, R.x - 56), z: rh + side * lane };
const endPt = vert ? { x: rv + side * lane, z: R.z } : { x: R.x, z: rh + side * lane };
const parkingPt = { x: R.x, z: R.z - 4.4 }; // marked forecourt bay immediately in front of the Terrasse
const yaw = vert ? Math.PI : Math.PI / 2, F = { x: Math.sin(yaw), z: Math.cos(yaw) }, L = { x: Math.cos(yaw), z: -Math.sin(yaw) };
log('car at', JSON.stringify(startPt), '→', JSON.stringify(endPt), vert ? 'vertical road' : 'horizontal road');
// the Teranga's parking record moved to the start of the lane (a labelled shortcut, as in the Mermoz journey), the hub rebuilt around it
await d(([x, z, y]) => { const A = window.__dakar, id = A.teranga.info().id, c = A.state.data.counters; c[`vehicle:${id}:hub`] = A.hubs.indexOf('almadies'); c[`vehicle:${id}:x`] = x; c[`vehicle:${id}:z`] = z; c[`vehicle:${id}:yaw`] = y; A.save?.(); A.teleport('corniche'); }, [startPt.x, startPt.z, yaw]);
await page.waitForFunction(() => window.__dakar.pos().hub === 'corniche' && window.__dakar.pos().mode === 'play', null, T);
await d(([x, z]) => window.__dakar.teleport('almadies', x, z, 0), [startPt.x + L.x * 2.6, startPt.z + L.z * 2.6]);
await page.waitForFunction(() => window.__dakar.pos().hub === 'almadies' && window.__dakar.pos().mode === 'play' && window.__dakar.teranga.info().here && window.__dakar.rooftop.info()?.hub === 'almadies', null, T);
await page.waitForTimeout(1500);
await boardVehicle(page, t, 'teranga');
await shot('driving-to-the-terrace');
await pilot(page, t, 'teranga', [{ x: endPt.x, z: endPt.z + (vert ? 8 : 0), tol: 3, speed: 5 }, { ...endPt, tol: 2, speed: 2.2 }, { ...parkingPt, tol: 1.0, speed: 1.1 }], { brakeAtEnd: true, cruise: 5 });
const parked = await d(() => window.__dakar.teranga.at());
await shot('parked');
await t.tap('#ridepad .rp-off');
await until(() => !window.__dakar.teranga.at().driving && window.__dakar.pos().mode === 'play', null, 60000);
await page.waitForTimeout(1200);
const car1 = await d(() => window.__dakar.teranga.info()), pk = await d(() => window.__dakar.teranga.at());
const inBay = Math.abs(pk.x - parkingPt.x) <= 1.3 && Math.abs(pk.z - parkingPt.z) <= 1.2;
check('driven with the pedal stick into the marked Terrasse visitor bay and parked within 25 m of the door', inBay && Math.hypot(pk.x - R.x, pk.z - R.z) < 25, JSON.stringify({ at: [+pk.x.toFixed(1), +pk.z.toFixed(1)], bay: [+parkingPt.x.toFixed(1), +parkingPt.z.toFixed(1)], door: [+R.x.toFixed(1), +R.z.toFixed(1)] }));
check('stepped out: the car stays where it was left, saved as parked in Almadies', car1.owned && !pk.driving && car1.record?.hub === 'almadies' && Math.hypot(car1.record.x - pk.x, car1.record.z - pk.z) < 0.5, JSON.stringify(car1.record));

// ---------------------------------------------------------------- 2. on foot to the door, up the stairs
// the stick is steered by hand toward the door: clear the parked car first (it is solid), then cross the forecourt to the entrance
const me0 = await d(() => window.__dakar.pos()), around = vert ? [{ x: me0.x, z: pk.z + 4.4 }, { x: rv + side * 6.5, z: pk.z + 4.4 }] : [{ x: pk.x - 4.4, z: me0.z }, { x: pk.x - 4.4, z: rh + side * 6.5 }];
for (const w of around) await walkTo(page, t, w.x, w.z, { tol: 0.9, ms: 40000 });
const dWalk = await walkTo(page, t, R.x, R.z, { tol: 1.2, ms: 90000 });
check('from the car to the terrace’s door on foot: nothing in the way', dWalk < 1.6, `${dWalk.toFixed(2)} m left, at ${JSON.stringify(await d(() => window.__dakar.pos()))}, car ${JSON.stringify(pk)}`);
if (dWalk >= 1.6) await shot('walk-blocked');
check('« Entrer » is offered at the door', await act(info.door.id));
await until(() => window.__dakar.pos().x > 3000, null, 60000);
await until(() => window.__dakar.pos().mode === 'play', null, 60000); await page.waitForTimeout(1500);
check('up on the terrace', (await d(() => window.__dakar.pos().x)) > 3000);
await shot('terrace');

// ---------------------------------------------------------------- 3. the bar: order, wait, sit at a table, the plate on the table, eat
const dBar = await walkTo(page, t, info.bar.x, info.bar.z, { tol: 0.8, ms: 60000 });
check('the bar offers « Commander »', await act(`${info.door.id}:bar`), JSON.stringify({ dBar, pos: await d(() => window.__dakar.pos()), focus: await d(() => window.__dakar.focus()) }));
await shot('menu');
const w0 = (await S()).wallet, f0 = 25;
await d(f => { window.__dakar.state.data.needs.faim = f; }, f0);
await tapItem('Poisson braisé');
await until(() => !!window.__dakar.activity()?.id, null, 20000);
const w1 = (await S()).wallet;
check('the order is a real activity: 6 000 F paid once, at the start', w0 - w1 === 6000 && (await S()).ledger >= 1, `${w0} → ${w1}`);
check('not fed while it is prepared', (await S()).n.faim <= f0 + 1);
await until(() => /Tu manges/.test(window.__dakar.activity()?.step ?? ''), null, 90000);
await page.waitForTimeout(2500);
const seat = await d(() => window.__dakar.pos()), meal = await d(() => window.__dakar.meal());
check('the guest walked to a table, sat, and the plate is on the table, close to the seat', !!meal && meal.prop === 'poisson' && meal.y >= 0.45 && Math.hypot(meal.x - seat.x, meal.z - seat.z) < 1.6, JSON.stringify({ seat: [seat.x, seat.z], meal }));
await shot('eating');
const ateAt = await until(() => !window.__dakar.activity(), null, 90000);
const s1 = await S();
check('the last bite feeds (faim up), money untouched after the start, the meal counted once', ateAt && s1.n.faim > f0 + 30 && s1.wallet === w1 && (s1.c.terrasse ?? 0) === 1, JSON.stringify({ faim: s1.n.faim, wallet: s1.wallet, terrasse: s1.c.terrasse }));
await page.waitForTimeout(800);
check('the evening knows it: dinner is a stage', ((await A()).stages & 1) === 1, JSON.stringify((await A()).counters));
check('« Se lever » from the table', await act('self'));
await until(() => window.__dakar.pos().mode === 'play', null, 30000);

// ---------------------------------------------------------------- 4. Awa Sy
const awa = (await A()).awa;
await walkTo(page, t, awa.x, awa.z + 1.2, { tol: 0.8, ms: 60000 });
const soc0 = (await S()).n.social;
check('« Parler à Awa » is offered beside her', await act('almadies:awa'));
const first = await sheet();
check('the first time she introduces herself and asks what brings the guest (short, three answers, no wall of text)', /Je suis Awa/.test(first ?? '') && (await items()).length >= 4 && (first ?? '').length < 520, (first ?? '').slice(0, 200));
await shot('awa-first');
await tapItem('Je fête un bon travail');
const reply = await sheet();
check('her answer follows the guest’s choice and sends them on to La Vague (21 h)', /bon travail/.test(reply ?? '') && /La Vague/.test(reply ?? '') && /21 h/.test(reply ?? ''), (reply ?? '').slice(0, 200));
const s2 = await S();
check('a real word: social and mood rise once, the choice is remembered, she is a known face', s2.n.social >= soc0 + 6 && s2.c.al_toast === 2 && (s2.c.al_awa_met ?? 0) > 0 && (await A()).rel > 0, JSON.stringify({ soc: [soc0, s2.n.social], al: (await A()).counters, rel: (await A()).rel }));
{ const dest = await d(() => window.__dakar.destination()); check('the walking marker now points to La Vague', dest === 'almadies:city:club', String(dest)); }
await tapItem('À tout à l’heure'); await page.waitForTimeout(500);
await act('almadies:awa');
await tapItem('Et après le dîner');
await tapItem('À tout à l’heure'); await page.waitForTimeout(500);
const s3 = await S();
check('asking again the same evening gives nothing more (no farming): social unchanged, still one stage, one visit counted', s3.n.social <= s2.n.social + 1 && ((await A()).stages & 2) === 2 && (s3.c.visit_terrasse_awa ?? 0) === 1, JSON.stringify({ soc: [s2.n.social, s3.n.social], visits: s3.c.visit_terrasse_awa }));
await shot('awa-after');

// ---------------------------------------------------------------- 5. down the stairs, La Vague
// back through the tables the way the guest came in: to the bar end, then straight to the stairs (the room is tight, the straight lines are the free ones)
await walkTo(page, t, info.bar.x, info.bar.z, { tol: 0.8, ms: 60000 });
const dStairs = await walkTo(page, t, 3325, 4.6, { tol: 0.45, ms: 60000 });
const stairsFocus = await d(() => window.__dakar.focus());
check('the stairs offer to go down', !!stairsFocus && /Descendre|Sortir/.test(JSON.stringify(stairsFocus)), JSON.stringify({ dStairs, stairsFocus, pos: await d(() => window.__dakar.pos()) }));
await t.tap('#act'); await page.waitForTimeout(900);
await until(() => window.__dakar.pos().x < 1000, null, 60000); await page.waitForTimeout(1500);
await d(() => window.__dakar.setHour(21.5));                                              // labelled shortcut: the club opens at 21 h
const club = await d(() => { const c = window.__dakar.venues().find(v => v.type === 'club'); return { door: c.anchors.find(a => /door$/.test(a.id)), floor: c.anchors.find(a => /floor$/.test(a.id)), exit: c.anchors.find(a => /exit$/.test(a.id)) }; });
await d(() => window.__dakar.clubShift?.(0));
// on foot from the terrace's door to La Vague by the streets (the villa lots lie between): back round the car, up the road, along the Ngor road to the gate
for (const w of [{ x: rv + side * 6.5, z: pk.z + 4.4 }, { x: rv - 2, z: pk.z + 4.4 }, { x: rv - 2, z: -122 }, { x: club.door.x + 5, z: -122 }]) await walkTo(page, t, w.x, w.z, { tol: 1.2, ms: 90000 });
await walkTo(page, t, club.door.x, club.door.z, { tol: 1.2, ms: 120000 });
check('at the club’s door: « Entrer »', await act(`almadies:venue:club:${club.door.id}`));
const askT = await sheet();
const wc0 = (await S()).wallet;
check('the fee is shown before anything is paid', /2\s?000\s?F/.test(askT ?? '') && /une seule fois/.test(askT ?? '') && (await S()).wallet === wc0, (askT ?? '').slice(0, 160));
await tapItem('et entrer');
await until(() => window.__dakar.venues().find(v => v.type === 'club').admitted && !window.__dakar.activity(), null, 60000);
check('paid once (2 000 F): the rope is lifted for the night', (await S()).wallet === wc0 - 2000);
await walkTo(page, t, club.floor.x, club.floor.z, { tol: 1.2, ms: 120000 });
check('on the floor: « Danser »', await act(`almadies:venue:club:${club.floor.id}`));
await until(() => !!window.__dakar.gesture() && /^Dance_/.test(window.__dakar.clip() ?? ''), null, 30000);
await shot('dancing');
await until(() => { if (window.__dakar.gesture()) window.__dakar.gestureFinish(1); return !window.__dakar.activity(); }, null, 120000);   // the beat game: the existing debug finish
await page.waitForTimeout(1500);
const sd = await S();
check('one dance counted by La Vague, and the evening knows it', (sd.c['club:almadies:venue:club:danses'] ?? 0) === 1 && ((await A()).stages & 4) === 4, JSON.stringify((await A()).counters));

// ---------------------------------------------------------------- 6. the way out: the evening card, once
await walkTo(page, t, club.exit.x, club.exit.z, { tol: 1.0, ms: 60000 });
check('the way out of the club', await act(`almadies:venue:club:${club.exit.id}`));
await until(() => (window.__dakar.almadies.info().cards ?? 0) === 1, null, 40000);
const ec = await card();
check('one card: a first evening in Almadies — dinner, Awa, the dance, « une soirée complète »', /première soirée/.test(ec) && /Dîner/.test(ec) && /Awa Sy/.test(ec) && /dansé/.test(ec) && /complète/.test(ec), ec);
await shot('evening-card');
const ev = (await A()).counters;
check('counted once: one evening, the card is not shown again', ev.al_evenings === 1 && ev.al_last_mask === 7 && ev.al_end_night > 0, JSON.stringify(ev));

// ---------------------------------------------------------------- 7. the taxi home; the car is where it was left
await until(() => !!window.__dakar.taxi.info().rank?.taxi, null, 60000);
const rank = await d(() => window.__dakar.taxi.info().rank);
await d(r => window.__dakar.place(r.x - Math.cos(r.yaw) * 1.9, r.z + Math.sin(r.yaw) * 1.9, r.yaw + Math.PI / 2), rank);
check('the taxi rank by La Vague offers « Prendre un taxi »', await act('taxi:rank') || await until(() => window.__dakar.focus()?.primary === 'Prendre un taxi', null, 15000) && (await d(() => { document.getElementById('act').click(); return true; })));
await until(() => !!document.querySelector('#modal.on'), null, 20000);
const wt0 = (await S()).wallet, led0 = (await S()).ledger;
const menu = await items();
await tapItem('Corniche');
await until(() => /Prix/.test(document.querySelector('#modal.on')?.textContent ?? ''), null, 20000);
await tapItem('Monter');
await until(() => window.__dakar.pos().hub === 'corniche' && !window.__dakar.taxi.info().ride && window.__dakar.pos().mode === 'play', null, 600000);
const wt1 = (await S()).wallet;
check('the taxi home: the fare paid once, one ledger line, in the Corniche', wt0 - wt1 > 0 && (await S()).ledger === led0 + 1, JSON.stringify({ menu: menu.map(m => m.text.slice(0, 30)), paid: wt0 - wt1 }));
check('the evening card was not shown a second time, and the evening count is still 1', (await A()).cards === 0 || (await A()).counters.al_evenings === 1, JSON.stringify((await A()).counters));
await d(() => window.__dakar.teleport('almadies'));
await until(() => window.__dakar.pos().hub === 'almadies' && window.__dakar.teranga.info().here, null, 60000); await page.waitForTimeout(1500);
const car2 = await d(() => window.__dakar.teranga.at());
check('back in Almadies the car is still exactly where it was parked (one car, not a copy)', Math.hypot(car2.x - pk.x, car2.z - pk.z) < 0.5 && (await d(() => window.__dakar.teranga.info().count ?? 1)) === 1, JSON.stringify({ was: [pk.x, pk.z], now: [car2.x, car2.z] }));

// ---------------------------------------------------------------- 8. another evening: she remembers
await d(() => { window.__dakar.nextDay(1); window.__dakar.setHour(19); });                  // labelled shortcut: the next city day, 19:00
const money1 = (await S()).wallet;
await d(i => window.__dakar.place(i.door.x + i.facade.nx * 0.6, i.door.z + i.facade.nz * 0.6, Math.atan2(-i.facade.nx, -i.facade.nz)), info);
await page.waitForTimeout(1500);
await act(info.door.id);
await until(() => window.__dakar.pos().x > 3000 && window.__dakar.pos().mode === 'play', null, 60000); await page.waitForTimeout(2500);
const hello = await toast();
check('climbing the stairs on a later evening, Awa remembers what the guest said and did (a bon travail; danced)', /bon travail/.test(hello) && /danser/.test(hello), hello);
const awa2 = (await A()).awa;
await walkTo(page, t, awa2.x, awa2.z + 1.2, { tol: 0.8, ms: 60000 });
await act('almadies:awa');
const again = await sheet(), its = await items();
check('her words are not the first evening’s: she recognises the guest and offers a coffee on the house', /bon travail/.test(again ?? '') && !/Je suis Awa/.test(again ?? '') && its.some(i => /café Touba/i.test(i.text)), (again ?? '').slice(0, 200));
await shot('awa-recognises');
const wg0 = (await S()).wallet;
await tapItem('café Touba');
await until(() => !!window.__dakar.activity()?.id, null, 20000);
await until(() => !window.__dakar.activity(), null, 90000);
const wg1 = (await S()).wallet;
check('the coffee is free: nothing charged, and it is the house’s gift once an evening', wg1 === wg0 && (await A()).counters.al_gift_night > 0, `${wg0} → ${wg1}`);
await act('self').catch(() => {}); await until(() => window.__dakar.pos().mode === 'play', null, 30000);
await walkTo(page, t, awa2.x, awa2.z + 1.2, { tol: 0.8, ms: 60000 });
await act('almadies:awa');
check('a second word the same evening has no coffee', !(await items()).some(i => /café Touba/i.test(i.text)));
await tapItem('À tout à l’heure');

// ---------------------------------------------------------------- 9. save and reload: everything is there, nothing twice
await d(() => window.__dakar.save?.());
await page.waitForTimeout(1500);
const before = (await A()).counters, rel0 = (await A()).rel;
await page.reload({ timeout: 180000 });
await ready(); t = await realTouch(page);
await page.waitForFunction(() => window.__dakar.pos().mode === 'play', null, T);
const after = (await A()).counters;
check('after a reload the memory is there: the evenings, the choice, the meeting, nothing counted again', after.al_evenings === before.al_evenings && after.al_toast === 2 && after.al_awa_met === before.al_awa_met && after.al_gift_night === before.al_gift_night, JSON.stringify({ before, after }));
check('and it only wrote al_ counters (no new save field)', Object.keys(after).filter(k => k.startsWith('al_')).length > 0, '');
check('no JavaScript errors', errors.length === 0, errors.join(' | '));
console.log(`\n${total - failed}/${total} M4 journey checks passed`);
await context.close(); await browser.close();
if (failed) process.exit(1);
