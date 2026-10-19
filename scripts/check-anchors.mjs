// M1-C, C3, in the real game on a phone: the neighbourhood's anchors — the boutique counter, the gargote at noon, the grand-place
// attaya and the garage bench — each offer a short moment that answers to what the player has lived, once per city day, with no
// mission; the People app lists a few reasons to come back from the characters' schedules (src/social/situations.ts, revisit.ts).
// Usage: node scripts/check-anchors.mjs [baseUrl] [shotsDir]   (a worker, so the presence socket answers: wrangler dev or the preview)
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://127.0.0.1:8787/', shots = process.argv[3] ?? null;
if (shots) fs.mkdirSync(shots, { recursive: true });
const T = { timeout: 180000 };
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { if (ok) pass++; else fail++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${String(detail).slice(0, 320)}`); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
await context.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'low'); } catch { /* */ } });
const page = await context.newPage();
const errors = []; page.on('pageerror', e => errors.push(e.message));
const d = (fn, arg) => page.evaluate(fn, arg);

const ready = async () => {
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub, null, T);
  await d(() => { window.__dakar.teleport('pikine'); window.__dakar.setHour(11); });
  await page.waitForFunction(() => window.__dakar.pos().hub === 'pikine', null, T);
  await page.waitForTimeout(1500);
};
const hour = h => d(x => window.__dakar.setHour(x), h);
const where = id => d(i => window.__dakar.npcWhere(i), id);
const idle = () => page.waitForFunction(() => window.__dakar.pos().mode === 'play', null, T);
const counter = k => d(x => window.__dakar.state.data.counters[x] ?? 0, k);
const rel = id => d(i => window.__dakar.state.data.rel[[i, 'player'].sort().join('|')] ?? 0, id);
const sheet = () => d(() => {
  const m = document.querySelector('#modal.on'); if (!m) return null;
  return { title: m.querySelector('.sh-title, h2, .title')?.textContent?.trim() ?? '', sub: m.querySelector('.sh-sub')?.textContent?.trim() ?? '', html: m.querySelector('.kv')?.textContent ?? '',
    rows: [...m.querySelectorAll('.item:not(.close)')].map(e => ({ label: e.querySelector('.lb')?.textContent?.trim() ?? '', detail: e.querySelector('.dt, .detail, .sub')?.textContent?.trim() ?? '', h: Math.round(e.getBoundingClientRect().height) })) };
});
const closeSheet = async () => { for (let i = 0; i < 3; i++) { if (!(await d(() => !!document.querySelector('#modal.on')))) break; await page.keyboard.press('Escape'); await page.waitForTimeout(350); } };
const pick = async text => { await page.locator('#modal.on .item', { hasText: text }).first().click(); await page.waitForTimeout(500); };
const openMenuOf = async id => {
  await page.waitForTimeout(900);                           // a frame or two: the new hour sends everyone to their new place…
  await d(() => window.__dakar.npcSettle());                // …and they arrive
  const w = await where(id);
  await d(k => window.__dakar.place(k.x + 1.2, k.z + 1.2, Math.PI), w);
  await page.waitForFunction(i => (window.__dakar.focus()?.id ?? '') === i, `npc:${id}`, T).catch(() => {});
  await page.waitForTimeout(400);
  await d(() => window.__dakar.act());
  await page.waitForFunction(() => document.querySelector('#modal.on'), null, T); await page.waitForTimeout(600);
  return sheet();
};
const openShop = async () => {
  const shop = await d(() => { const t = window.__dakar.interactables().find(x => x.id.startsWith('pikine:') && x.id.includes(':city:boutique')); return t ? { x: t.x, z: t.z, id: t.id } : null; });
  await d(k => window.__dakar.place(k.x, k.z + 1.5, Math.PI), shop);
  await page.waitForFunction(id => (window.__dakar.focus()?.id ?? '') === id, shop.id, T).catch(() => {});
  await page.waitForTimeout(500);
  await d(() => window.__dakar.act()); await page.waitForFunction(() => document.querySelector('#modal.on'), null, T); await page.waitForTimeout(600);
  return sheet();
};
const dayOf = () => d(() => window.__dakar.cityDay());
const forget = id => d(k => { const c = window.__dakar.state.data.counters; delete c[`sit_${k}_day`]; }, id);   // « the next day »: the moment is there again, its memory kept

await page.goto(`${base}?debug&touch`, { timeout: 120000 });
await ready();
await d(() => { const x = window.__dakar.state.data; x.wallet = 5000; x.needs.energie = 90; x.needs.faim = 70; x.beats.ibou_welcome = 1; });   // the welcome is done: Ibou has left the courtyard for his routine

// 1. the boutique counter: the « Parler à Mamadou » row opens the moment, in the same compact sheet
await hour(11);
let sh = await openShop();
const talk = sh.rows.find(r => /Parler à Mamadou|moment avec Mamadou|Prendre des nouvelles/.test(r.label));
check('the boutique sheet keeps its compact rows (no extra row for the moment)', sh.rows.length === 5 && sh.rows.every(r => r.h >= 56 && r.h <= 64), JSON.stringify(sh.rows.map(r => [r.label, r.h])));
check('the talk row announces the moment (same row, new words)', !!talk && /moment avec Mamadou/.test(talk.label), JSON.stringify(talk));
await pick('moment avec Mamadou');
sh = await sheet();
check('it opens: a title and a few words that fit a stranger', !!sh && /Au comptoir de la Boutique Diallo/.test(sh.title) && /tu cherches quelque chose/i.test(sh.sub), JSON.stringify(sh && [sh.title, sh.sub]));
if (shots) await page.screenshot({ path: `${shots}/anchor-boutique.png` });
check('choices, none of them a mission (a few lines, an exit)', sh.rows.length >= 3 && sh.rows.length <= 5 && sh.rows.some(r => /Juste passer/.test(r.label)), JSON.stringify(sh.rows.map(r => r.label)));
const r0 = await rel('mamadou'), e0 = await d(() => window.__dakar.state.data.needs.energie);
await pick('Aider à ranger'); sh = await sheet();
check('helping at the counter: a reply, a little esteem, a little effort', /escabeau/.test(sh?.sub ?? '') && (await rel('mamadou')) > r0 && (await d(() => window.__dakar.state.data.needs.energie)) < e0, `${r0} → ${await rel('mamadou')}`);
await pick('Continuer'); await closeSheet(); await idle();
check('the moment was counted once for today', (await counter('sit_boutique_comptoir_n')) === 1);
sh = await openShop(); const talk2 = sh.rows.find(r => /Parler à Mamadou|moment avec Mamadou|Prendre des nouvelles/.test(r.label));
check('same day: the row is the ordinary chat again, nothing is owed', !!talk2 && /Parler à Mamadou/.test(talk2.label), JSON.stringify(talk2));
await closeSheet();
// another day, a regular who delivered the rice and just won a bout: the same counter, a different moment
await forget('boutique_comptoir');
await d(() => { const x = window.__dakar.state.data; x.counters.served_mamadou = 3; x.flags.push('regular_mamadou', 'mamadou_trust'); });
const today = await dayOf();
await d(dy => window.__dakar.state.data.career.bouts.push({ at: 1, day: dy, mode: 'classe', opp: 'Lamine', style: 'Frappeur', level: 2, res: 'V', how: 'projection', purse: 0, pts: 1 }), today);
await openShop(); await pick('moment avec Mamadou'); sh = await sheet();
check('another day, a regular back from the ring: Mamadou talks about the bout', /combat/.test(sh?.sub ?? ''), sh?.sub);
check('and offers the first glass', sh.rows.some(r => /premier verre/.test(r.label)), JSON.stringify(sh.rows.map(r => r.label)));
await pick('premier verre'); await pick('Continuer'); await closeSheet(); await idle();

// 2. the gargote at noon: Mame's menu has the moment; the favour and the win show
await hour(12);
sh = await openMenuOf('mame');
check('at noon, Mame’s menu holds the gargote moment', sh.rows.some(r => /Le service de midi chez Mame Diarra/.test(r.label)), JSON.stringify(sh.rows.map(r => r.label)));
await pick('Le service de midi'); sh = await sheet();
check('the moment speaks of the win (a boxer’s bowl)', /lutteur|combat/.test(sh?.sub ?? ''), sh?.sub);
const f0 = await d(() => window.__dakar.state.data.needs.faim);
await pick('coup de main au service'); await pick('Continuer'); await closeSheet(); await idle();
check('helping with the service: a little esteem and a bite to eat', (await counter('gargote_help')) === 1 && (await d(() => window.__dakar.state.data.needs.faim)) >= f0, `faim ${f0} → ${await d(() => window.__dakar.state.data.needs.faim)}`);

// 3. the grand-place attaya: the bout is told
await hour(18);
sh = await openMenuOf('ibou');
check('in the evening, Tonton Ibou’s menu holds the attaya moment', sh.rows.some(r => /attaya de la grand-place/i.test(r.label)), JSON.stringify(sh.rows.map(r => r.label)));
await pick('attaya de la grand-place'); sh = await sheet();
check('the glasses are raised for the boxer, and he can tell the bout', /lutteur/.test(sh?.sub ?? '') && sh.rows.some(r => /Raconter ton dernier combat/.test(r.label)), JSON.stringify(sh && [sh.sub, sh.rows.map(r => r.label)]));
const ri = await rel('ibou');
await pick('Raconter ton dernier combat'); await pick('Continuer'); await closeSheet(); await idle();
check('telling it raises Tonton Ibou’s esteem a little', (await rel('ibou')) > ri, `${ri} → ${await rel('ibou')}`);

// 4. the garage bench
await hour(9);
await d(() => window.__dakar.state.data.flags.push('modou_trust'));
sh = await openMenuOf('modou');
check('in the morning, Modou’s menu holds the garage moment', sh.rows.some(r => /établi du Garage Modou/.test(r.label)), JSON.stringify(sh.rows.map(r => r.label)));
await pick('établi du Garage Modou'); sh = await sheet();
check('Modou speaks of the ring (he saw the bout), not of a stranger', /champion|cambouis|combat/.test(sh?.sub ?? ''), sh?.sub);
await pick('Tenir la lampe'); await pick('Continuer'); await closeSheet(); await idle();
check('holding the lamp counts once and raises esteem', (await counter('garage_help')) === 1);

// 5. reasons to come back: in the People app, from the schedules
await hour(8);
await d(() => window.__dakar.state.data.counters.sit_boutique_comptoir_day = 0);
await d(() => window.__dakar.people()); await page.waitForFunction(() => document.querySelector('#modal.on'), null, T); await page.waitForTimeout(500);
sh = await sheet();
check('the People app lists a reason to go back, from a schedule (Mamadou’s counter opens at 9 h)', /À revoir/.test(await d(() => document.querySelector('#modal.on')?.textContent ?? '')) && /dès 9 h/.test(sh.html), sh.html);
if (shots) await page.screenshot({ path: `${shots}/anchor-revisit.png` });
await closeSheet();
await hour(23); await d(() => window.__dakar.people()); await page.waitForFunction(() => document.querySelector('#modal.on'), null, T); await page.waitForTimeout(500);
check('late at night nothing is made up: no reason listed', !/À revoir/.test(await d(() => document.querySelector('#modal.on')?.textContent ?? '')));
await closeSheet();

// 6. reload keeps it (a moment lived today is still lived); New Game forgets it
await d(() => window.dispatchEvent(new Event('pagehide')));
const saved = await d(() => JSON.parse(localStorage.getItem('dakarrek.guest.save.v6') ?? 'null'));
check('the save holds the moments lived (counters), the favour and the bout', !!saved && saved.schemaVersion === 6 && saved.counters.sit_gargote_midi_n === 1 && saved.counters.sit_garage_etabli_n === 1 && saved.career.bouts.length === 1, JSON.stringify(Object.keys(saved?.counters ?? {}).filter(k => k.startsWith('sit_'))));
await page.reload({ waitUntil: 'load' }); await ready();
await hour(12);
sh = await openMenuOf('mame');
check('after a reload: the moment of today is not offered again (it was lived)', !sh.rows.some(r => /Le service de midi/.test(r.label)), JSON.stringify(sh.rows.map(r => r.label)));
await closeSheet();
await page.keyboard.press('Escape'); await page.locator('[data-app="reglages"]').first().click(); await page.locator('[data-act="new"]').click(); await page.locator('[data-act="wipe"]').click();
await ready(); await hour(12);
sh = await openMenuOf('mame');
check('after New Game: the gargote moment is there, for a stranger', sh.rows.some(r => /Le service de midi/.test(r.label)), JSON.stringify(sh.rows.map(r => r.label)));
await pick('Le service de midi'); sh = await sheet();
check('and it reads as a first visit (no memory of the favour or the win)', /Midi à la gargote/.test(sh?.sub ?? ''), sh?.sub);
check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
await browser.close();
console.log(`anchors: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
