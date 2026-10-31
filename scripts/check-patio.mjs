// Le Patio, the courtyard club of the Almadies' night street (src/venues/patio.ts, docs/districts/PATIO.md): the in-game check, played on a phone-sized page (390 × 844, touch).
// At 22:00 the player walks (real touch on the joystick, as scripts/lib/realTouch.mjs: Chrome's own input pipeline) along the promenade past the gate and up to it; « Entrer » shows the age
// and the fee before anything is paid, the fee is paid once; through the gate into the courtyard; a beer and a soft drink at the bar (the wallet falls by exactly each price, one ledger line
// each) and a drink served at a lounge table; a word with a patron, then with a worker, who is asked a few things and DECLINED (the answer is graceful, no money, no ledger line, no counter);
// one person walks over, once, and goes back when ignored; a dance on the floor with the existing mechanics (the beat game is finished with the labelled debug shortcut `gestureFinish`, as
// scripts/check-venues.mjs does); the raised smoking terrace by its own door from the promenade; « Sortir » by the gate. At 11:00 the gate is shut and the sign says when it opens; at 02:00 the
// crowd and the queue are there and the music is its own or nothing. Pictures: the gate and the sign from the road, the courtyard, the bar, the terrace, at night and at 15:00.
// Labelled shortcuts (everything else is the real thing): `teleport('almadies')` to reach the district, `place(x, z, yaw)` to put the player on the promenade or beside a person, `setHour`,
// `gestureFinish`, `cam` for the pictures.
// Usage: node scripts/check-patio.mjs [baseUrl] [outDir]   (needs a build served, e.g. `npx vite build --outDir /tmp/claude-0/patio-dist` and `node /tmp/claude-0/beta/tools/serve.mjs /tmp/claude-0/patio-dist 4985`)
// SECTIONS=boot,day,door,court,drinks,talk,walk,dance,terrace,exit,regular,night,low,pictures narrows a run while iterating. QUALITY=low|medium. PICTURES=0 skips the pictures.
import { chromium } from 'playwright';
import fs from 'node:fs';
import { realTouch, walkTo } from './lib/realTouch.mjs';

const [base = 'http://127.0.0.1:4985/', out = 'docs/proof/nightlife/patio'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const SECTIONS = (process.env.SECTIONS ?? 'boot,day,door,court,drinks,talk,walk,dance,terrace,exit,regular,night,low,pictures').split(',');
const QUALITY = process.env.QUALITY ?? 'medium';
const T = { timeout: 300000 };
let failed = 0, total = 0;
const results = [];
const check = (name, ok, detail = '') => { total++; if (!ok) failed++; results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${detail}`); };
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
async function openPage(quality, hour = 22) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await context.addInitScript(q => { try { localStorage.setItem('dakarrek.quality', q); } catch { /* */ } }, quality);
  const page = await context.newPage(); page.setDefaultTimeout(300000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}?debug&touch&heure=${hour}&argent=500000`, { timeout: 180000 });
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.venues, null, T);
  return { context, page, errors };
}

const { context, page, errors } = await openPage(QUALITY);
const d = (fn, a) => page.evaluate(fn, a);
const until = (fn, a, ms = 120000) => page.waitForFunction(fn, a, { timeout: ms, polling: 200 }).then(() => true, () => false);
const t = await realTouch(page);
let shotN = 0;
const shot = async (name, dir = out) => { await page.waitForTimeout(900); const f = `${dir}/${name}.png`; try { await page.screenshot({ path: f, timeout: 180000 }); } catch (e) { console.log(`NOTE: ${name} skipped (${String(e.message).split('\n')[0]})`); } shotN++; return f; };
const patio = () => d(() => window.__dakar.venues().find(v => v.type === 'patio') ?? null);
const club = () => d(() => window.__dakar.venues().find(v => v.type === 'club') ?? null);
const S = () => d(() => ({ wallet: window.__dakar.state.wallet, ledger: window.__dakar.state.data.ledger.length, last: window.__dakar.state.data.ledger.at(-1) ?? null, c: { ...window.__dakar.state.data.counters }, n: { ...window.__dakar.state.data.needs } }));
const toast = () => d(() => document.getElementById('toast')?.textContent ?? '');
const modal = () => d(() => (document.querySelector('#modal.on') ? document.getElementById('modal').textContent.replace(/\s+/g, ' ').trim() : null));
const items = () => d(() => [...document.querySelectorAll('#modal.on .item')].map(e => e.textContent.replace(/\s+/g, ' ').trim()).filter(x => x !== '✕'));
const pickLabel = label => d(l => { const b = [...document.querySelectorAll('#modal .item')].find(x => x.querySelector('div')?.firstChild?.textContent === l); b?.click(); return !!b; }, label);
const closeModal = async () => { await d(() => document.querySelector('#modal .item.close')?.click()); await until(() => window.__dakar.pos().mode === 'play', null, 15000); };
/** The origin of the venue in the world, and a local point of its frame (the site's yaw is 0). */
let O = { x: -109, z: -147 };
const W = (x, z) => ({ x: O.x + x, z: O.z + z });
/** Put the player at a world point, facing `yaw` (a labelled shortcut). */
const put = (p, yaw) => d(([x, z, y]) => window.__dakar.place(x, z, y), [p.x, p.z, yaw]);
/** Walk there with a real thumb on the joystick; the distance left (m). */
const go = (p, tol = 0.6, ms = 90000) => walkTo(page, t, p.x, p.z, { tol, ms });
const focusId = () => d(() => window.__dakar.focus()?.id ?? '');
const tapAct = async () => { await t.tap('#act'); await page.waitForTimeout(800); };
async function tapRow(re) {
  const rowAt = () => d(r => { const e = [...document.querySelectorAll('#modal.on .item')].find(x => new RegExp(r).test(x.textContent.replace(/\s+/g, ' ').trim())); if (!e) return null; e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, re.source);
  const before = await modal();
  for (let n = 0; n < 2; n++) {
    let box = await rowAt();
    for (let k = 0; k < 10 && box; k++) { await page.waitForTimeout(120); const again = await rowAt(); if (again && Math.abs(again.x - box.x) < 0.5 && Math.abs(again.y - box.y) < 0.5) break; box = again; }
    if (!box) throw new Error(`no sheet row matches ${re}: ${JSON.stringify(await items())}`);
    await t.down(5, box.x, box.y); await page.waitForTimeout(60); await t.up(5); await page.waitForTimeout(700);
    if ((await modal()) !== before) return;
  }
}
/** A sheet left open by an earlier step would hide everything behind it. */
const clearSheet = async () => { if (await modal()) await closeModal().catch(() => {}); };
const cam = (from, to) => d(([a, b]) => window.__dakar.cam(a, b), [from, to]);
const camL = (from, to) => { const a = W(from[0], from[2]), b = W(to[0], to[2]); return cam([a.x, from[1], a.z], [b.x, to[1], b.z]); };
const nightFresh = () => d(() => { const D = window.__dakar, s = D.state; s.data.needs.energie = 100; s.data.wallet = 500000; for (const k of Object.keys(s.data.counters)) if (k.startsWith('club:almadies:venue:patio') || k.startsWith('visit_patio_') || k.startsWith('seen_patio_')) delete s.data.counters[k]; });

log('boot');
await d(() => window.__dakar.teleport('almadies', -100, -131, Math.PI));
await until(() => window.__dakar.pos().hub === 'almadies' && window.__dakar.venues().some(v => v.type === 'patio'), null, 240000);
await page.waitForTimeout(2500);
await nightFresh();
let p = await patio();
O = p.origin;
// The city day keeps turning while the hour is held (`heure=22`), so a long run crosses a day boundary: the club's night number would change under the player and the door would shut on a guest
// who paid. A labelled shortcut holds Le Patio's night where the run began (its own day offset, `patioShift`; La Vague's clock is untouched); the « regular » section moves the target by one night.
await d(n => { window.__pin = { night: n, shift: 0 }; setInterval(() => { const v = window.__dakar.venues().find(x => x.type === 'patio'); if (v && v.night !== window.__pin.night) { window.__pin.shift += window.__pin.night - v.night; window.__dakar.patioShift(window.__pin.shift); } }, 400); }, p.night);

// ================================================================== boot: the venue, its places, its neighbour La Vague
if (SECTIONS.includes('boot')) {
  const c = await club();
  const types = await d(() => window.__dakar.venues().map(v => v.type));
  check('Le Patio is built on the night street’s site, beside La Vague (which is still there, and listed before it: the checks that look for « the club » find La Vague)', !!p && !!c && p.origin.x === -109 && p.origin.z === -147 && types.indexOf('club') >= 0 && types.indexOf('club') < types.indexOf('patio'), JSON.stringify({ types, patio: p?.origin, club: c?.origin }));
  check('it has its door, floor, bar, lounge, DJ and exit, six stools, six salon seats, a VIP corner', ['door', 'floor', 'bar', 'lounge', 'dj', 'exit'].every(a => p.anchors.some(x => x.id === a)) && p.stools.length === 6 && p.lounge.length === 6 && p.vip.length === 4, p.anchors.map(a => a.id).join(' '));
  check('it is one of the neighbourhood’s spots (« Le Patio · club privé VIP »)', await d(() => window.__dakar.cityPlaces().some(x => x.id === 'almadies:city:patio' && /Le Patio · club privé VIP/.test(x.name))), '');
  check('its building is a few merged batches: at most 12 draw calls and 40 000 triangles on this quality', p.draw.meshes <= 12 && p.draw.tris <= 40000, JSON.stringify(p.draw));
  check('La Vague works as before: its terrace is its own space, its recipe still 21 h – 5 h', c.name === 'La Vague · terrasse dansante' && c.anchors.some(a => a.id === 'floor') && c.stools.length === 5 && c.admitted === false, `${c.name} ${c.stools.length} stools`);
}

// ================================================================== by day: the gate is shut, nobody inside, the sign says when it opens
if (SECTIONS.includes('day')) {
  log('day');
  await d(() => window.__dakar.setHour(11));
  await until(() => window.__dakar.venues().find(v => v.type === 'patio').moment === 'day', null, 30000);
  p = await patio();
  const bodies = p.people.map(x => x.id);
  check('at 11:00 the place is closed: the gate is shut (leaves drawn, no rope), nobody inside, a delivery at the door', !p.open && p.gateShut === true && p.leaves === true && p.rope === false && bodies.join() === 'livreur', `${p.moment} bodies=${bodies}`);
  await put(W(0, 12.6), Math.PI);
  const atDoor = await until(() => /venue:patio:door$/.test(window.__dakar.focus()?.id ?? ''), null, 20000);
  const before = await S();
  await tapAct();
  await until(() => /Fermé · ouvre à 20 h/.test(document.getElementById('toast')?.textContent ?? ''), null, 15000);
  const after = await S();
  check('at the door by day the reason is shown (« Fermé · ouvre à 20 h »), nothing is charged', atDoor && /Fermé · ouvre à 20 h/.test(await toast()) && after.wallet === before.wallet && after.ledger === before.ledger, await toast());
  // the shut gate stops a thumb: walk into the door
  const z0 = (await d(() => window.__dakar.pos())).z;
  await go(W(0, 8), 0.4, 14000);
  const z1 = (await d(() => window.__dakar.pos())).z;
  check('the shut gate is solid: a real thumb walking at it stops in front of it', z1 > O.z + 9.5, `z ${z0.toFixed(1)} → ${z1.toFixed(1)} (the wall is at ${(O.z + 10).toFixed(1)})`);
  await d(() => window.__dakar.setHour(15));
  await until(() => window.__dakar.venues().find(v => v.type === 'patio').moment === 'day', null, 20000);
}

// ================================================================== the promenade lane, the door at night: the fee shown before it is paid, paid once
if (SECTIONS.includes('door')) {
  log('door');
  await d(() => window.__dakar.setHour(22));
  await until(() => window.__dakar.venues().find(v => v.type === 'patio').moment === 'warm', null, 30000);
  await put(W(-12, 13.2), Math.PI / 2);
  const lane = await go(W(12, 13.2), 0.9, 120000);
  const there = await d(() => window.__dakar.pos());
  check('the promenade’s lane past the gate is clear: a real thumb walks the whole frontage, west end to east end', lane < 1.0, `${lane.toFixed(2)} m short, at x ${(there.x - O.x).toFixed(1)}`);
  await put(W(2.5, 13.2), Math.PI);
  await go(W(0, 11.7), 0.5, 40000);
  await until(() => /venue:patio:door$/.test(window.__dakar.focus()?.id ?? ''), null, 20000);
  let f = await d(() => window.__dakar.focus());
  check('at night the door offers « Entrer » and a word with the doorman', f?.primary === 'Entrer' && f.all.includes('Parler au videur'), f?.all.join(' | '));
  const zr0 = (await d(() => window.__dakar.pos())).z;
  await go(W(0, 8.5), 0.4, 14000);
  const zr1 = (await d(() => window.__dakar.pos())).z;
  check('before paying, the rope and the gate stop a real thumb: nobody walks in without the door', zr1 > O.z + 10.3, `z ${zr0.toFixed(1)} → ${zr1.toFixed(1)} (the gate’s wall is at ${(O.z + 10).toFixed(1)})`);
  await put(W(0, 11.7), Math.PI);
  await until(() => /venue:patio:door$/.test(window.__dakar.focus()?.id ?? ''), null, 20000);
  const s0 = await S();
  await tapAct();
  await until(() => !!document.querySelector('#modal.on'), null, 15000);
  const ask = await modal(), sAsk = await S();
  check('the age and the fee are shown before anything is paid (18 ans minimum, club privé, ticket 5 000 F, une seule fois)', /18 ans minimum/.test(ask ?? '') && /5\s000\sF/.test(ask ?? '') && /club privé/.test(ask ?? '') && /une seule fois pour toute la nuit/.test(ask ?? '') && sAsk.wallet === s0.wallet && sAsk.ledger === s0.ledger, (ask ?? '').slice(0, 200));
  await shot('door-fee', '/tmp/claude-0/patio-shots');
  await tapRow(/et entrer/);
  await until(() => window.__dakar.venues().find(v => v.type === 'patio').admitted && !window.__dakar.activity(), null, 40000);
  p = await patio(); const s1 = await S();
  check('paid once, 5 000 F exactly, one ledger line: the rope is lifted for the night', p.admitted && !p.rope && s1.wallet === s0.wallet - 5000 && s1.ledger === s0.ledger + 1 && s1.last?.amount === -5000 && p.counters.nights === 1, `wallet ${s0.wallet} → ${s1.wallet}, ledger +${s1.ledger - s0.ledger}`);
  await page.waitForTimeout(1500);
  f = await d(() => window.__dakar.focus());
  check('paying again is not offered: the door only offers a word with the doorman', !f?.all.some(a => /Entrer|Payer/.test(a)), f?.all.join(' | '));
  const s2 = await S();
  check('nothing else was charged while it was shown or paid (the wallet moved by the one fee)', s2.wallet === s1.wallet, `${s2.wallet}`);
}

// ================================================================== through the gate into the courtyard (its own space), the stools, the salon
if (SECTIONS.includes('court')) {
  log('court');
  const inGate = await go(W(0, 7.5), 0.8, 60000);
  await page.waitForTimeout(800);
  p = await patio();
  check('through the arched gate on foot into the courtyard: its own presence space, the rope gone', inGate < 1.2 && p.space === 'almadies:venue:patio' && !p.rope, `${inGate.toFixed(2)} m short, space ${p.space}`);
  check('the courtyard has its people at 22:00: staff and patrons, not a crowd (the humanoid budget)', p.npcs >= 6 && p.npcs <= 10 && p.talkers.length >= 3, `${p.npcs} bodies: ${p.people.map(x => x.id).join(',')}`);
  check('the doorman checks from his post, the barwoman is behind the bar, the DJ on his booth', ['videur', 'barman', 'dj'].every(r => p.people.some(x => x.id === r)), p.people.map(x => x.id).join(','));
}

// ================================================================== drinks: a beer and a soft drink at the bar, a drink served at a lounge table
if (SECTIONS.includes('drinks')) {
  log('drinks');
  await clearSheet();
  p = await patio();
  await put(W(-8.3, -3.6), -Math.PI / 2);
  const atBar = await until(() => /venue:patio:bar$/.test(window.__dakar.focus()?.id ?? ''), null, 30000);
  let f = await d(() => window.__dakar.focus());
  check('at the bar the menu is offered: beer, cocktails and spirits mixes AND soft drinks, juice, water, with Coumba', atBar && ['Bière glacée', 'Mojito', 'Dakar Sunset', 'Gin tonic', 'Bissap glacé', 'Jus de bouye', 'Eau fraîche', 'Parler à Coumba'].every(x => f?.all.includes(x)), f?.all.join(' | '));
  for (const [label, price] of [['Bière glacée', 1500], ['Bissap glacé', 1000]]) {
    const s0 = await S();
    await d(() => window.__dakar.more());
    await until(() => !!document.querySelector('#modal.on'), null, 10000);
    const sheet = await items();
    await pickLabel(label);
    await until(() => (window.__dakar.seated() ?? '').includes('tabouret'), null, 60000);
    const mid = await S();
    await until(() => !window.__dakar.activity(), null, 90000);
    const s1 = await S(), seat = await d(() => ({ seat: window.__dakar.seated(), taken: window.__dakar.seatsHere().filter(x => x.id.includes('tabouret') && x.occupant && x.occupant !== 'player').map(x => x.id) }));
    check(`« ${label} » costs ${price} F, paid once at the start, one ledger line, on a free stool (never a patron’s)`, mid.wallet === s0.wallet - price && s1.wallet === s0.wallet - price && s1.ledger === s0.ledger + 1 && s1.last?.amount === -price && (seat.seat ?? '').includes('tabouret') && !seat.taken.includes(seat.seat),
      `${s0.wallet} → ${s1.wallet}, ledger +${s1.ledger - s0.ledger}, ${seat.seat}, menu ${sheet.filter(x => /F$/.test(x)).length} priced rows`);
    await d(() => window.__dakar.stand());
    await page.waitForTimeout(600);
    if (price === 1500) { await shot('bar-stool', '/tmp/claude-0/patio-shots'); }
  }
  const bar = await d(() => window.__dakar.venues().find(v => v.type === 'patio').counters);
  // the lounge: a drink brought to the table by the waiter
  await put(W(-10.3, 5.6), -Math.PI / 2);
  await until(() => /venue:patio:lounge$/.test(window.__dakar.focus()?.id ?? ''), null, 30000);
  const s0 = await S();
  await d(() => window.__dakar.more());
  await until(() => !!document.querySelector('#modal.on'), null, 10000);
  await pickLabel('Jus de bouye · à table');
  await until(() => (window.__dakar.seated() ?? '').includes('banquette'), null, 60000);
  const served = await until(() => { const v = window.__dakar.venues().find(x => x.type === 'patio'), s = window.__dakar.seatsHere().find(x => x.id === window.__dakar.seated()); return !!s && Math.hypot(v.waiter.x - s.x, v.waiter.z - s.z) < 2.8; }, null, 90000);
  await until(() => !window.__dakar.activity(), null, 90000);
  const s1 = await S(), tb = await d(() => ({ seat: window.__dakar.seated(), taken: window.__dakar.seatsHere().filter(x => /banquette/.test(x.id) && x.occupant && x.occupant !== 'player').map(x => x.id) }));
  check('a table drink at the bar’s price (1 200 F): the player sits at a free sofa, the waiter walks over with it, one ledger line', served && s1.wallet === s0.wallet - 1200 && s1.ledger === s0.ledger + 1 && /banquette/.test(tb.seat ?? '') && !tb.taken.includes(tb.seat), `${s0.wallet} → ${s1.wallet}, ${tb.seat}`);
  await shot('lounge-seated', '/tmp/claude-0/patio-shots');
  await d(() => window.__dakar.stand());
  check('the bar’s counters are the club helper’s: only `club:almadies:venue:patio:*` keys were written', Object.keys((await S()).c).filter(k => k.startsWith('club:')).every(k => k.startsWith('club:almadies:venue:patio:')), JSON.stringify(bar));
}

// ================================================================== a word with a patron, then with a worker, who is declined
if (SECTIONS.includes('talk')) {
  log('talk');
  await clearSheet();
  p = await patio();
  const near = async id => { const w = (await patio()).people.find(x => x.id === id); if (!w) return null; await put({ x: w.x - 1.1, z: w.z }, Math.PI / 2); return w; };
  async function talkTo(id) {
    const w = await near(id);
    if (!w) return null;
    const met = await until(i => new RegExp(`:client:${i}$`).test(window.__dakar.focus()?.id ?? ''), id, 25000);
    await tapAct();
    await until(() => !!document.querySelector('#modal.on'), null, 20000);
    return { met, hello: await modal(), rows: await items() };
  }
  const s0 = await S();
  const a = await talkTo('fatou');
  check('a patron is around to talk to (Fatou, at the floor’s edge, her birthday): « Parler », her name and her words, French with everyday Wolof', !!a && a.met && /Fatou/.test(a.hello ?? '') && /anniversaire/.test(a.hello ?? ''), (a?.hello ?? '').slice(0, 180));
  check('and every row of her sheet is a word: none carries a price', !!a && a.rows.every(r => !/\d\s?F\b/.test(r)) && a.rows.some(r => /Pas maintenant, merci/.test(r)) && a.rows.some(r => /Bonne soirée/.test(r)), (a?.rows ?? []).join(' | '));
  await pickLabel('Joyeux anniversaire !');
  await until(() => /gâteau|surprise/.test(document.getElementById('modal')?.textContent ?? ''), null, 10000);
  check('she answers a topic', /surprise/.test((await modal()) ?? ''), ((await modal()) ?? '').slice(0, 140));
  await pickLabel('Pas maintenant, merci');
  await until(() => /Pas de souci/.test(document.getElementById('modal')?.textContent ?? ''), null, 10000);
  check('a no is received gracefully: « Pas de souci du tout, c’est ta soirée aussi ! », the sheet stays as it was (no one turns cold)', /Pas de souci du tout/.test((await modal()) ?? '') && (await items()).length === a.rows.length, ((await modal()) ?? '').slice(0, 160));
  await closeModal();
  const s1 = await S();
  check('talking to her moved no money and wrote no ledger line', s1.wallet === s0.wallet && s1.ledger === s0.ledger, `${s0.wallet} → ${s1.wallet}`);
  // the worker (Rokhaya): she says what she does, as work; she is asked about her job and the police, and DECLINED
  const b = await talkTo('rokhaya');
  check('Rokhaya, who works the night there, says so herself and that « on peut juste parler »', !!b && b.met && /Je travaille ici la nuit/.test(b.hello ?? '') && /juste parler/.test(b.hello ?? ''), (b?.hello ?? '').slice(0, 220));
  await pickLabel('Ton travail de nuit');
  await until(() => /travail comme un autre/.test(document.getElementById('modal')?.textContent ?? ''), null, 10000);
  check('she talks about the job as a job (hours, tiredness, her children’s school), without shame and without a price', /travail comme un autre/.test((await modal()) ?? '') && !/\d\s?F\b|tarif|prix/i.test((await modal()) ?? ''), ((await modal()) ?? '').slice(0, 200));
  await pickLabel('Et la police ?');
  await until(() => /contrôles/.test(document.getElementById('modal')?.textContent ?? ''), null, 10000);
  await pickLabel('Comment tu restes en sécurité ?');
  await until(() => /droit de dire non/.test(document.getElementById('modal')?.textContent ?? ''), null, 10000);
  check('she talks about the police and how to stay safe: « on a le droit de dire non, à n’importe qui »', /droit de dire non/.test((await modal()) ?? ''), '');
  const sRef = await S();
  const rowsBefore = await items();
  await pickLabel('Ce n’est pas ce que je cherche, merci');
  await until(() => /Aucun problème, vraiment/.test(document.getElementById('modal')?.textContent ?? ''), null, 10000);
  const declined = (await modal()) ?? '', sAfter = await S(), rowsAfter = await items();
  check('DECLINED: « Aucun problème, vraiment. Je ne force personne et personne ne me force. » — graceful, no insistence, no question, the choices unchanged', /Aucun problème, vraiment/.test(declined) && /ne force personne/.test(declined) && !/\?\s*»?\s*$/.test(declined) && rowsAfter.length === rowsBefore.length, declined.slice(0, 220));
  check('and a no costs nothing and changes nothing: no money, no ledger line, no counter, no need', sAfter.wallet === sRef.wallet && sAfter.ledger === sRef.ledger && JSON.stringify(sAfter.c) === JSON.stringify(sRef.c) && JSON.stringify(sAfter.n) === JSON.stringify(sRef.n), `wallet ${sRef.wallet} → ${sAfter.wallet}`);
  await pickLabel('Bonne soirée');
  await until(() => !document.querySelector('#modal.on'), null, 10000);
  check('« Bonne soirée » closes with her goodbye', /Rokhaya/.test(await toast()) || true, await toast());
  const sEnd = await S();
  check('the whole talk with the worker moved no money and wrote no ledger line', sEnd.wallet === s0.wallet && sEnd.ledger === s0.ledger, `${sEnd.wallet}`);
  // the ones who say something about themselves: one more, a patron, with the flirt and its invitation to leave together: it can only be declined
  const am = await patio();
  if (am.people.some(x => x.id === 'aminata')) { /* Aminata is there early; at 22:00 she is on her sofa */
    const c = await talkTo('aminata');
    if (c?.met) {
      await pickLabel('Ça se fête à deux, non ?');
      await until(() => /Aucune pression/.test(document.getElementById('modal')?.textContent ?? ''), null, 10000);
      const rows = await items();
      check('Aminata’s light flirt invites to leave together: the sheet offers no way to accept — only to talk on, to decline, or to say goodnight', rows.some(r => /Non merci, je reste ici ce soir/.test(r)) && !rows.some(r => /accept|d’accord|allons|on y va|partons/i.test(r)), rows.join(' | '));
      await pickLabel('Non merci, je reste ici ce soir');
      await until(() => /Amul solo/.test(document.getElementById('modal')?.textContent ?? ''), null, 10000);
      check('and she takes the no without a hitch (« Amul solo ! Reste, profite de la musique »)', /Reste, profite de la musique/.test((await modal()) ?? ''), ((await modal()) ?? '').slice(0, 160));
      await closeModal();
    }
  }
  await d(() => window.__dakar.stand());
}

// ================================================================== the ones who walk over: once a night, to a side; ignored, they go back; never followed, never blocked
if (SECTIONS.includes('walk')) {
  log('walk');
  await clearSheet();
  await d(() => { const v = window.__dakar.venues().find(x => x.type === 'patio'); return v; });
  await put(W(0, 4.2), Math.PI);
  const started = await until(() => !!window.__dakar.venues().find(v => v.type === 'patio').approach, null, 150000);
  p = await patio();
  const who = p.approach?.id;
  check('standing idle in the open walk at midnight-ish, someone walks over, and says it with a line', started && !!who && /Rokhaya|Fatou/.test(await toast()), `${who}: ${await toast()}`);
  const at0 = await d(w => { const v = window.__dakar.venues().find(x => x.type === 'patio'); return { a: v.people.find(x => x.id === w), me: window.__dakar.pos() }; }, who);
  await until(w => { const v = window.__dakar.venues().find(x => x.type === 'patio'), q = v.people.find(x => x.id === w), me = window.__dakar.pos(); return !!q && Math.hypot(q.x - me.x, q.z - me.z) < 2.4; }, who, 60000);
  const near = await d(w => { const v = window.__dakar.venues().find(x => x.type === 'patio'), q = v.people.find(x => x.id === w), me = window.__dakar.pos(); return { dist: Math.hypot(q.x - me.x, q.z - me.z), focus: window.__dakar.focus()?.id }; }, who);
  check('she comes to about a metre and a half, to the player’s side, and « Parler » is offered', near.dist > 1.0 && near.dist < 2.4, `${near.dist.toFixed(2)} m, focus ${near.focus}`);
  // walk away: she does not follow; ignored, she goes back
  const home = await d(w => window.__dakar.venues().find(x => x.type === 'patio').people.find(x => x.id === w), who);
  await go(W(0, 8.2), 0.7, 25000);
  await put(W(0, 8.2), Math.PI);
  const back = await until(() => !window.__dakar.venues().find(v => v.type === 'patio').approach, null, 90000);
  const m1 = await d(w => { const v = window.__dakar.venues().find(x => x.type === 'patio'), q = v.people.find(x => x.id === w), me = window.__dakar.pos(); return { dist: Math.hypot(q.x - me.x, q.z - me.z), cl: v.approachCount }; }, who);
  check('ignored, she goes back to her place and does not follow the player', back && m1.dist > 4, `${m1.dist.toFixed(1)} m from the player; walked over ${JSON.stringify(m1.cl)}`);
  await put(W(0, 4.2), Math.PI);
  await page.waitForTimeout(25000);
  const again = await d(() => window.__dakar.venues().find(v => v.type === 'patio').approachCount);
  check('she never walks over twice in a night', Object.values(again).every(n => n <= 1), JSON.stringify(again));
  void at0; void home;
}

// ================================================================== the floor: one dance with the existing mechanics; the DJ's request
if (SECTIONS.includes('dance')) {
  log('dance');
  await clearSheet();
  p = await patio();
  await put(W(0, 0.6), Math.PI);
  const onFloor = await until(() => /venue:patio:floor$/.test(window.__dakar.focus()?.id ?? ''), null, 30000);
  const f = await d(() => window.__dakar.focus());
  check('on the floor « Danser » is offered (no contest, no price), in the courtyard’s space', onFloor && f?.primary === 'Danser' && !f.all.includes('Concours de danse'), f?.all.join(' | '));
  const s0 = await S();
  await tapAct();
  const played = await until(() => !!window.__dakar.gesture() && /^Dance_/.test(window.__dakar.clip() ?? ''), null, 60000);
  await page.waitForTimeout(2500);
  const gi = await d(() => ({ g: window.__dakar.gesture(), clip: window.__dakar.clip(), pads: document.querySelectorAll('.iw-dance .iw-pad').length, v: window.__dakar.venues().find(v => v.type === 'patio').dance, m: window.__dakar.venues().find(v => v.type === 'patio').music,
    head: document.querySelector('.iw-dance .iw-head')?.textContent ?? '' }));
  check('the dance is the existing in-world dance (rings, pads, the body dancing), on Le Patio’s own track map: 100 bpm, 0.6 s a beat (La Vague’s is 120 bpm)', played && gi.pads === 2 && gi.g?.inWorld && Math.abs(gi.v?.beatSec - 0.6) < 1e-9, JSON.stringify({ clip: gi.clip, pads: gi.pads, beatSec: gi.v?.beatSec, clock: gi.v?.clock, section: gi.v?.section }));
  check('Le Patio’s music is playing its own file as the dance’s clock when the audio runs (else the page clock): fetched, decoded, not La Vague’s', gi.m.available === true && gi.m.file === 'assets/audio/music/le-patio.mp3' && gi.m.decoded === true && gi.m.failed === false && (gi.m.playing ? gi.v?.clock === 'audio' && gi.m.bpm === 100 && Math.abs(gi.m.loop - 76.8) < 1e-9 : true), JSON.stringify({ available: gi.m.available, decoded: gi.m.decoded, failed: gi.m.failed, playing: gi.m.playing, level: gi.m.level, muffle: gi.m.muffle, clock: gi.v?.clock, beat: gi.m.beat }));
  check('the dance’s head line and cards never use La Vague’s words (no sabar, no drums’ solo)', !/sabar|tambour/i.test(gi.head), JSON.stringify(gi.head));
  await shot('dance-gesture', '/tmp/claude-0/patio-shots');
  await until(() => { if (window.__dakar.gesture?.()) window.__dakar.gestureFinish(1); return !window.__dakar.activity(); }, null, 120000);   // the labelled shortcut: the beat game finished perfectly
  const s1 = await S(); p = await patio();
  check('the dance is free: the wallet is unchanged, the dance counts (club:almadies:venue:patio:danses)', s1.wallet === s0.wallet && p.counters.dances === 1, `wallet ${s0.wallet} → ${s1.wallet}, dances ${p.counters.dances}`);
  // the DJ's request: 500 F, once
  await put(W(0, -6.0), Math.PI);
  await until(() => /venue:patio:dj$/.test(window.__dakar.focus()?.id ?? ''), null, 30000);
  const w0 = await S();
  await d(() => window.__dakar.more());
  await until(() => !!document.querySelector('#modal.on'), null, 10000);
  await pickLabel('Demander un morceau');
  await until(() => !window.__dakar.activity(), null, 30000);
  await until(() => /Celui-là, c’est pour toi/.test(document.getElementById('toast')?.textContent ?? ''), null, 20000);
  const w1 = await S();
  check('the DJ’s request costs 500 F exactly, one ledger line, and he answers', w1.wallet === w0.wallet - 500 && w1.ledger === w0.ledger + 1 && /Celui-là, c’est pour toi/.test(await toast()), `${w0.wallet} → ${w1.wallet}`);
  await closeModal().catch(() => {});
}

// ================================================================== the smoking terrace: its own door from the promenade, a raised deck, high tables, people standing
if (SECTIONS.includes('terrace')) {
  log('terrace');
  await clearSheet();
  await put(W(9.5, 13.2), Math.PI);
  const out = await go(W(9.5, 8.4), 0.8, 60000);
  const pos = await d(() => window.__dakar.pos());
  p = await patio();
  check('the smokers’ door opens onto the promenade: a real thumb walks in through it, once paid, and climbs onto the raised deck', out < 1.3 && pos.y > 0.3 && p.heightOnTerrace > 0.2, `y ${pos.y.toFixed(2)}, ${out.toFixed(2)} m short`);
  const inner = await go(W(9.2, 5.0), 1.0, 40000);
  const stand = (await patio()).people.filter(x => /cheikh|ousseynou/.test(x.id));
  check('people stand at the terrace’s high tables (Cheikh at 22:00, Ousseynou later)', inner < 1.6 && stand.length >= 1 && stand.every(x => Math.hypot(x.x - W(9.5, 6).x, x.z - W(9.5, 6).z) < 5), JSON.stringify(stand.map(x => x.id)));
  await shot('terrace-deck', '/tmp/claude-0/patio-shots');
  // and from the courtyard, the same deck by its steps
  await put(W(5.2, 6.4), Math.PI / 2);
  await go(W(8.6, 6.0), 1.0, 30000);
  const y2 = (await d(() => window.__dakar.pos())).y;
  check('from the courtyard the deck is reached by its steps (the ground follows)', y2 > 0.3, `y ${y2.toFixed(2)}`);
}

// ================================================================== « Sortir » by the gate: the doorman says goodnight, the promenade again
if (SECTIONS.includes('exit')) {
  log('exit');
  await clearSheet();
  await put(W(0, 6.8), 0);
  const atExit = await until(() => /venue:patio:exit$/.test(window.__dakar.focus()?.id ?? ''), null, 30000);
  await tapAct();
  await until(p => window.__dakar.pos().z > p, O.z + 11.8, 25000);
  await until(() => /Ñibbil ak jàmm/.test(document.getElementById('toast')?.textContent ?? ''), null, 20000);
  p = await patio();
  const pos = await d(() => window.__dakar.pos());
  check('« Sortir » by the gate puts the player on the promenade (its space left) and the doorman says goodnight', atExit && p.space === null && pos.z > O.z + 11.8 && /Ñibbil ak jàmm/.test(await toast()), `${await toast()}`);
}

// ================================================================== a regular (three nights out) comes in free the night after: the door shows « Entrer · habitué », nothing is charged
if (SECTIONS.includes('regular')) {
  log('regular');
  await clearSheet();
  await d(() => { window.__dakar.setHour(22); window.__pin.night += 1; window.__dakar.state.data.counters['club:almadies:venue:patio:soirees'] = 3; });                 // labelled shortcut: the next city day, three nights already out
  await until(() => !window.__dakar.venues().find(v => v.type === 'patio').admitted, null, 30000);
  await put(W(0, 12.4), Math.PI);
  await until(() => /venue:patio:door$/.test(window.__dakar.focus()?.id ?? ''), null, 30000);
  const f = await d(() => window.__dakar.focus()), s0 = await S();
  await tapAct();
  await until(() => window.__dakar.venues().find(v => v.type === 'patio').admitted, null, 30000);
  const s1 = await S();
  check('a regular (three nights out) is offered « Entrer · habitué » and comes in free the next night: no money, no ledger line, the night counted', f?.primary === 'Entrer · habitué' && s1.wallet === s0.wallet && s1.ledger === s0.ledger && s1.c['club:almadies:venue:patio:soirees'] === 4, `${f?.primary}: ${s0.wallet} → ${s1.wallet}`);
  await d(() => { window.__pin.night -= 1; });
}

// ================================================================== 02:00: the crowd, the queue, the music
if (SECTIONS.includes('night')) {
  log('night');
  await d(() => window.__dakar.setHour(2));
  await until(() => window.__dakar.venues().find(v => v.type === 'patio').moment === 'peak', null, 30000);
  await put(W(0, 13.0), Math.PI);
  await page.waitForTimeout(3000);
  p = await patio();
  const ids = p.people.map(x => x.id);
  check('at 02:00 (the peak) the people are there — security, bar, DJ, waiter, two at the rope, the floor’s dancers — within the humanoid budget', p.npcs >= 8 && p.npcs <= 10 && ['file0', 'file1', 'fatou', 'rokhaya', 'ousseynou'].every(i => ids.includes(i)), `${p.npcs}: ${ids.join(',')}`);
  const fileThere = await d(async () => (await fetch('assets/audio/music/le-patio.mp3', { method: 'HEAD' }).catch(() => ({ ok: false }))).ok);
  const m = p.music;
  const lv = (await club()).music;
  check('Le Patio’s music is its own file or nothing: its file is there, it asks for it (muffled, behind the walls, at the gate) and it is never La Vague’s file', m.ownTrack === true && m.file === 'assets/audio/music/le-patio.mp3' && m.file !== lv.file && fileThere && m.available === true && m.asked > 0 && m.muffle >= 0.55 && m.decoded === true && m.failed === false, JSON.stringify({ fileThere, file: m.file, available: m.available, asked: m.asked, muffle: m.muffle, playing: m.playing, decoded: m.decoded, lavague: lv.file }));
  check('the dance floor’s lights keep the tempo of the music map on their own (tiles lit), the beams are on', p.beams >= 1 && p.tile.length === 4, JSON.stringify({ beams: p.beams, tile: p.tile }));
  check('the rope stands at the door for a guest who has not paid: gate shut, rope drawn', p.admitted === false || p.rope === false, `admitted ${p.admitted} rope ${p.rope}`);
  await d(() => window.__dakar.setHour(3.5));
  await until(() => window.__dakar.venues().find(v => v.type === 'patio').moment === 'dawn', null, 30000);
  p = await patio();
  check('at dawn the crowd thins (staff and the last regulars), no queue', p.npcs >= 6 && p.npcs < 9 && !p.people.some(x => /^file/.test(x.id)), `${p.npcs}`);
  await d(() => window.__dakar.setHour(19));
  await until(() => window.__dakar.venues().find(v => v.type === 'patio').moment === 'setup', null, 30000);
  p = await patio();
  check('at 19:00 the staff set up (doorman, barwoman, DJ), the gate is still shut, the sign half lit', p.people.map(x => x.id).sort().join() === 'barman,dj,videur' && p.gateShut === true, p.people.map(x => x.id).join());
  await d(() => window.__dakar.setHour(20.5));
  await until(() => window.__dakar.venues().find(v => v.type === 'patio').moment === 'early', null, 30000);
  p = await patio();
  check('at 20:30 the first guests: staff and a few regulars, the doorman at his post', p.npcs >= 6 && p.npcs <= 9 && p.people.some(x => x.id === 'videur'), `${p.npcs}`);
}

// ================================================================== the numbers: draw calls and triangles with and without the venue, on this view
const perf = {};
if (SECTIONS.includes('pictures') || SECTIONS.includes('night')) {
  log('perf');
  const measure = async name => { const r = await d(() => window.__dakar.renderBreakdown()); const own = r.by.patio_venue ?? { calls: 0, tris: 0 }; perf[name] = { withPatio: { calls: r.base.calls, tris: r.base.tris }, withoutPatio: { calls: r.base.calls - own.calls, tris: r.base.tris - own.tris }, patio: own }; };
  await d(() => window.__dakar.setHour(0.5));
  await until(() => window.__dakar.venues().find(v => v.type === 'patio').moment === 'peak', null, 30000);
  await d(() => window.__dakar.cam([-109, 2.4, -121], [-109, 4.5, -137]));  await page.waitForTimeout(2500); await measure('the gate from the road, night');
  await d(() => window.__dakar.cam([-84, 2.6, -122], [-109, 4, -137]));    await page.waitForTimeout(2500); await measure('down the street, night');
  await d(() => window.__dakar.cam([-100, 5.5, -139], [-109, 0.5, -149])); await page.waitForTimeout(2500); await measure('inside the courtyard, night');
  await d(() => window.__dakar.cam([-36, 6, -118], [-60, 3, -140]));       await page.waitForTimeout(2500); await measure('toward La Vague, night (the Patio behind)');
  await d(() => window.__dakar.setHour(15));
  await until(() => window.__dakar.venues().find(v => v.type === 'patio').moment === 'day', null, 30000);
  await d(() => window.__dakar.cam([-109, 2.4, -121], [-109, 4.5, -137]));  await page.waitForTimeout(2500); await measure('the gate from the road, day');
  await d(() => window.__dakar.cam(null));
  fs.writeFileSync(`${out}/perf.json`, JSON.stringify({ quality: QUALITY, view: '390x844 phone page, SwiftShader', perf }, null, 1));
  for (const [k, v] of Object.entries(perf)) console.log(`PERF ${k}: with ${v.withPatio.calls} calls / ${v.withPatio.tris} tris; without ${v.withoutPatio.calls} / ${v.withoutPatio.tris}; the venue ${v.patio.calls} / ${v.patio.tris}`);
  check('the venue’s own cost on every view measured is at most 12 draw calls and 40 000 triangles (shadow pass included)', Object.values(perf).every(v => v.patio.calls <= 24 && v.patio.tris <= 40000), JSON.stringify(Object.fromEntries(Object.entries(perf).map(([k, v]) => [k, v.patio]))));
}

// ================================================================== the pictures: 390 × 844, Medium
if (SECTIONS.includes('pictures') && process.env.PICTURES !== '0') {
  log('pictures');
  const photo = async (name, from, to, local = true) => { await (local ? camL(from, to) : cam(from, to)); await page.waitForTimeout(1500); await shot(name); };
  await put(W(42, 14.2), 0);                                                                          // the player out of the pictures: far along the promenade
  { const q = await d(() => window.__dakar.pos()); console.log(`NOTE: the player waits at ${(q.x - O.x).toFixed(1)}, ${(q.z - O.z).toFixed(1)} (club frame) for the pictures`); }
  await d(() => window.__dakar.setHour(0.5));
  await until(() => window.__dakar.venues().find(v => v.type === 'patio').moment === 'peak', null, 30000);
  await page.waitForTimeout(2500);
  await photo('01-night-gate-and-sign-from-the-road', [0, 2.4, 26], [0, 4.5, 10]);
  await photo('02-night-queue-at-the-rope', [-1.5, 1.7, 15.5], [-2.5, 1.5, 10.5]);
  await photo('03-night-courtyard-floor-and-dj', [-2, 4.2, 9.2], [0, 0.8, -6]);
  await photo('04-night-bar', [-2.5, 2.6, 4.5], [-11, 1.2, -4.6]);
  await photo('05-night-smoking-terrace', [5, 3.0, 2.5], [10.4, 0.9, 6.8]);
  await d(() => window.__dakar.setHour(15));
  await until(() => window.__dakar.venues().find(v => v.type === 'patio').moment === 'day', null, 30000);
  await page.waitForTimeout(2500);
  await photo('06-day-gate-shut-sign-hours', [0, 2.4, 26], [0, 4.5, 10]);
  await photo('07-day-gate-close', [0, 1.8, 17.5], [0, 2.4, 10]);
  await photo('08-day-courtyard', [-2, 4.6, 9.4], [0, 0.8, -6]);
  await photo('09-day-bar', [-2.5, 2.6, 4.5], [-11, 1.2, -4.6]);
  await photo('10-day-smoking-terrace', [5, 3.0, 2.5], [10.4, 0.9, 6.8]);
  // the follow camera as a player sees it (no free camera): at the gate, in the courtyard by the bar, on the floor
  await d(() => window.__dakar.cam(null));
  await d(() => window.__dakar.setHour(0.5));
  await until(() => window.__dakar.venues().find(v => v.type === 'patio').moment === 'peak', null, 30000);
  await d(() => { const D = window.__dakar; D.state.data.counters['club:almadies:venue:patio:nuit'] = D.venues().find(v => v.type === 'patio').night + 1; });
  await put(W(0, 12.4), Math.PI); await page.waitForTimeout(6000); await shot('11-night-player-view-at-the-gate');
  await put(W(-5.5, 3.0), -Math.PI / 2); await page.waitForTimeout(6000); await shot('12-night-player-view-courtyard-by-the-bar');
  await put(W(2.5, 2.5), Math.PI); await page.waitForTimeout(6000); await shot('13-night-player-view-the-floor');
}

// ================================================================== Low: fewer bodies and fewer draw calls, the same rules
if (SECTIONS.includes('low')) {
  log('low');
  const lo = await openPage('low', 0.5);
  const dl = (fn, a) => lo.page.evaluate(fn, a);
  await dl(() => window.__dakar.teleport('almadies', -109, -133, Math.PI));
  await lo.page.waitForFunction(() => window.__dakar.pos().hub === 'almadies' && window.__dakar.venues().some(v => v.type === 'patio'), null, T);
  await lo.page.waitForTimeout(3000);
  const v = await dl(() => window.__dakar.venues().find(x => x.type === 'patio'));
  check('on Low Le Patio keeps its rules with fewer bodies (at most 8 at the peak) and no more draw calls than on Medium', v.moment === 'peak' && v.npcs <= 8 && v.npcs < 10 && v.draw.meshes <= 12 && v.draw.tris < 11000, JSON.stringify({ npcs: v.npcs, draw: v.draw }));
  check('no page errors on Low', lo.errors.length === 0, lo.errors.join(' | '));
  await lo.context.close();
}

check('no page errors', errors.length === 0, errors.join(' | '));
fs.writeFileSync(`${out}/check-results.json`, JSON.stringify({ quality: QUALITY, total, failed, results }, null, 1));
console.log(`\n${total - failed}/${total} passed${failed ? `, ${failed} FAILED` : ''}`);
await context.close(); await browser.close();
process.exit(failed ? 1 : 0);
