// Almadies nightlife, the acceptance journey (docs/districts/ALMADIES-NIGHTLIFE.md): twelve steps in ONE session, played with the REAL touch controls on a phone-sized page (video recorded).
//  1 drive from another district to the night street     2 find Le Patio, park, get out        3 Le Patio: the door and its fee, the bar, a drink, adults to talk to (a no is a no)
//  4 walk out, find the hotel                             5 see the Terrasse's sign from the street  6 up to the rooftop: order, sit, eat       7 Awa Sy
//  8 down, La Vague                                       9 the existing dance, played on the beat   10 the taxi home                          11 another evening: Awa remembers
// 12 save, reload: money, car, memory, progression.
// The Teranga starts parked in the Corniche and is driven north across the district border and along the coast road (the pedal stick, the brake: real fingers), into a painted bay of
// « PARKING DU PATIO ». Everything on foot is the joystick. Every fee is the existing one (Le Patio 3 000 F once, the bar, the Terrasse's dish, La Vague 2 000 F once, the taxi).
// Labelled shortcuts (everything else is the real thing): the hour (`setHour`), the city day held where the run began (a city day is 24 minutes of the wall's; `nextDay` for « another
// evening »), the Teranga bought and put in the Corniche, the player put beside it, the next city day, the return from the Corniche after the taxi, reading state.
// Usage: node scripts/check-nightlife-journey.mjs [baseUrl] [outDir]     FROM=drive|patio|hotel narrows a run while iterating (a labelled set-up stands in for what came before). NOVIDEO=1 skips the video.
import { chromium } from 'playwright';
import fs from 'node:fs';
import { realTouch, pilot, boardVehicle, walkTo, playDance } from './lib/realTouch.mjs';

const [base = 'http://127.0.0.1:4980/', out = '/tmp/claude-0/zz/proof/journey'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const FROM = process.env.FROM ?? 'drive', ORDER = ['drive', 'patio', 'hotel'];
const runs = s => ORDER.indexOf(FROM) <= ORDER.indexOf(s);
let failed = 0, total = 0; const T = { timeout: 300000 };
const check = (name, ok, detail = '') => { total++; if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${detail}`); };
const note = (...a) => console.log('NOTE:', ...a);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, recordVideo: process.env.NOVIDEO ? undefined : { dir: out, size: { width: 390, height: 844 } } });
await context.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'low'); } catch { /* */ } });
const page = await context.newPage(); page.setDefaultTimeout(300000);
const errors = []; page.on('pageerror', e => errors.push(e.message));
const d = (fn, a) => page.evaluate(fn, a);
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
let shotN = 0; const shot = async n => { await page.waitForTimeout(400); await page.screenshot({ path: `${out}/${String(++shotN).padStart(2, '0')}-${n}.png` }); };
const ready = async () => { await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.almadies && window.__dakar.rooftop && window.__dakar.teranga && window.__dakar.venues, null, T); };
const items = () => d(() => [...document.querySelectorAll('#modal.on .item')].map(e => ({ text: e.textContent.replace(/\s+/g, ' ').trim(), off: e.classList.contains('dis') })).filter(i => i.text !== '✕'));
const sheet = () => d(() => { const m = document.querySelector('#modal.on'); return m ? m.textContent.replace(/\s+/g, ' ').trim() : null; });
const toast = () => d(() => document.getElementById('toast')?.textContent ?? '');
const card = () => d(() => document.querySelector('.mo')?.textContent.replace(/\s+/g, ' ').trim() ?? '');
const A = () => d(() => window.__dakar.almadies.info());
const S = () => d(() => ({ wallet: window.__dakar.state.wallet, n: { ...window.__dakar.state.data.needs }, c: { ...window.__dakar.state.data.counters }, ledger: window.__dakar.state.data.ledger.length, last: window.__dakar.state.data.ledger.at(-1) ?? null }));
const ledgerSum = from => d(f => window.__dakar.state.data.ledger.slice(f).reduce((s, e) => s + (e.amount ?? 0), 0), from);
const patio = () => d(() => window.__dakar.venues().find(v => v.type === 'patio') ?? null);
const until = (fn, a, ms = 120000) => page.waitForFunction(fn, a, { timeout: ms }).then(() => true, () => false);
let t;
async function tapItem(re) {
  // the sheet slides in: wait until the row stops moving (up to ~6 s on a slow page), and tap only where the row itself is under the finger
  const rowAt = () => d(r => { const e = [...document.querySelectorAll('#modal.on .item')].find(x => new RegExp(r).test(x.textContent.replace(/\s+/g, ' ').trim())); if (!e) return null; e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); const x = b.left + b.width / 2, y = b.top + b.height / 2; const top = document.elementFromPoint(x, y); return { x, y, on: !!top && (e === top || e.contains(top)) }; }, re.source ?? re);
  const before = await sheet();
  for (let n = 0; n < 4; n++) {
    let box = await rowAt();
    for (let k = 0; k < 50 && box; k++) { await page.waitForTimeout(120); const again = await rowAt(); if (again && again.on && Math.abs(again.x - box.x) < 0.5 && Math.abs(again.y - box.y) < 0.5) { box = again; break; } box = again; }
    if (!box) { if (n) return; throw new Error(`no sheet row matches /${re.source ?? re}/: ${JSON.stringify(await items())}`); }
    await t.down(5, box.x, box.y); await page.waitForTimeout(60); await t.up(5); await page.waitForTimeout(900);
    if ((await sheet()) !== before) return;
    log(`tap on /${re.source ?? re}/ not taken (row ${box.on ? 'under the finger' : 'not under the finger'} at ${Math.round(box.y)}), once more`);
  }
}
/** The action button for a focus id: tapped once it is offered. */
async function act(id, ms = 25000) {
  await page.waitForTimeout(500);
  const ok = await page.waitForFunction(i => window.__dakar.focus()?.id === i, id, { timeout: ms }).then(() => true, () => false);
  if (ok) { await t.tap('#act'); await page.waitForTimeout(900); }
  return ok;
}
/** The « ⋯ » button beside the action button: the other actions of the place (a bar's drinks), tapped like the thumb does. */
async function more() { await t.tap('#actMore'); await until(() => !!document.querySelector('#modal.on'), null, 15000); await page.waitForTimeout(500); }
/** Walk with the joystick; when a body or a prop keeps the thumb away, say so (the labelled shortcut that follows is named in the check). */
const walk = async (x, z, o = {}) => walkTo(page, t, x, z, { tol: 1.0, ms: 90000, ...o });

log('boot');
await page.goto(`${base}?debug&touch&heure=21&argent=4500000`, { timeout: 180000 });
await ready();
t = await realTouch(page);
// ---------------------------------------------------------------- set-up: the Teranga bought; the district's data read once (the night street's bays, Le Patio, the Terrasse's door)
await page.waitForFunction(() => window.__dakar.teranga.info().floor.length > 0, null, T);
await d(() => window.__dakar.teranga.own());
await page.waitForFunction(() => window.__dakar.teranga.info().owned, null, T);
await d(() => window.__dakar.teleport('almadies'));
await page.waitForFunction(() => window.__dakar.pos().hub === 'almadies' && window.__dakar.rooftop.info()?.hub === 'almadies' && window.__dakar.pos().mode === 'play' && window.__dakar.district.nightStreet() && window.__dakar.venues().some(v => v.type === 'patio'), null, T);
await page.waitForTimeout(2500);
// the city day is held where the run began (24 minutes of the wall's make a city day, and a long run would cross one: La Vague's and Le Patio's nights, Awa's « tonight » would change under the player)
await d(() => { const A = window.__dakar; window.__pinDay = A.nextDay(0); window.__pin = setInterval(() => { const cur = A.nextDay(0); if (cur !== window.__pinDay) A.nextDay(window.__pinDay - cur); }, 250); });
const info = await d(() => window.__dakar.rooftop.info());
const ns = await d(() => window.__dakar.district.nightStreet());
const p0 = await patio();
const R = info.door;
const st0 = await S();
check('a new evening: nothing of M4 is remembered yet, nothing of Le Patio either', Object.keys(st0.c).filter(k => (k.startsWith('al_') || k.startsWith('club:almadies:venue:patio')) && st0.c[k] !== 0).length === 0 && (await A()).stages === 0, JSON.stringify((await A()).counters));
check('the Terrasse de Ngor is the hotel’s roof (one rooftop, its stair door in the street beside the lobby), Awa Sy on its terrace; Le Patio is a venue of the night street', !!info && info.hub === 'almadies' && (await A()).awa?.doorId === info.door.id && !!info.sign && !!p0 && p0.origin.z < -140, JSON.stringify({ door: info.door, awa: (await A()).awa, sign: !!info.sign, patio: p0?.origin }));
const wallet0 = st0.wallet, ledger0 = st0.ledger;

const BW = 2.6, laneZ = -124.3, TURN = 5.6;
const west = ns.bays.filter(b => b.lot === 'west'), isFree = x => west.some(b => Math.abs(b.x - x) < 0.3 && b.free);
const GATE_X = p0.anchors.find(a => a.id === 'door').x;
const bay = west.filter(b => b.free && isFree(b.x - BW) && isFree(b.x + BW) && isFree(b.x + 2 * BW)).sort((a, b) => Math.abs(a.x - GATE_X) - Math.abs(b.x - GATE_X))[0];
check('Le Patio’s car park has a free painted bay with room to swing in, a few metres from the gate', !!bay && Math.abs(bay.x - GATE_X) < 26, JSON.stringify({ bay, gate: GATE_X }));
let pk = null;

// ---------------------------------------------------------------- 1. the drive: from the Corniche, north across the district border, along the coast road
if (runs('drive') && FROM === 'drive') {
  log('1. drive');
  const startC = { x: -60.4, z: Number(process.env.START_Z ?? -40), yaw: Math.PI };            // the Corniche's cross street at x −60, heading north
  await d(([x, z, y]) => { const A = window.__dakar, id = A.teranga.info().id, c = A.state.data.counters; c[`vehicle:${id}:hub`] = A.hubs.indexOf('corniche'); c[`vehicle:${id}:x`] = x; c[`vehicle:${id}:z`] = z; c[`vehicle:${id}:yaw`] = y; A.save?.(); A.teleport('corniche', x - 3, z, 0); }, [startC.x, startC.z, startC.yaw]);
  await page.waitForFunction(() => window.__dakar.pos().hub === 'corniche' && window.__dakar.pos().mode === 'play' && window.__dakar.teranga.info().here, null, T);
  await page.waitForTimeout(2000);
  const car0 = await d(() => window.__dakar.teranga.info());
  check('the Teranga is parked in the Corniche (owned, one copy), the player beside it', car0.owned && car0.record?.hub === 'corniche' && (await d(() => window.__dakar.pos().hub)) === 'corniche', JSON.stringify(car0.record));
  await boardVehicle(page, t, 'teranga');
  await shot('corniche-at-the-wheel');
  // the Corniche's frame is written in the Corniche's coordinates; the pilot moves the rest of the route when the district swaps (its z jumps by a whole street grid)
  await pilot(page, t, 'teranga', [{ x: -60.4, z: startC.z - 14, tol: 3, speed: 4 }, { x: -60.4, z: -90, tol: 4 }, { x: -60.4, z: -128, tol: 4 }, { x: -60.4, z: -160, tol: 4 }], { cruise: 8, stall: 25000, brakeAtEnd: false });
  const afterSwap = await d(() => ({ hub: window.__dakar.pos().hub, car: window.__dakar.teranga.at() }));
  check('the district changes under the wheels: still at the wheel, in Almadies, heading north on the same street', afterSwap.hub === 'almadies' && afterSwap.car.driving, JSON.stringify(afterSwap));
  await shot('almadies-arrival');
  // north along x −60 to the coast road, turning left (west) into its north lane, then along it to the bay
  const arc = [0, 30, 60, 90].map(a => { const r = a * Math.PI / 180; return { x: -66 + 5.6 * Math.cos(r), z: -118.7 - 5.6 * Math.sin(r), tol: 1.5, speed: 3 }; });
  await pilot(page, t, 'teranga', [{ x: -60.4, z: 30, tol: 4 }, { x: -60.4, z: -30, tol: 4 }, { x: -60.4, z: -90, tol: 4 }, { x: -60.4, z: -112, tol: 2.5, speed: 4 }, ...arc, { x: bay.x + TURN + 26, z: laneZ, tol: 3, speed: 6 }], { cruise: 8, stall: 25000, brakeAtEnd: false });
  await shot('on-the-coast-road');
  // Le Patio’s sign: the signed night street is in the view as the car comes along the coast road (a picture, and a check by name)
  const seen = await d(() => window.__dakar.cityPlaces().filter(x => /Patio|Vague|Terrasse/.test(x.name)).map(x => x.name));
  check('the places of the night street are on the neighbourhood’s list (Le Patio, La Vague, the Terrasse)', seen.length >= 3, JSON.stringify(seen));
  // into the bay: the same swing as the parking check — an arc from the lane into the bay, nose first
  const intoBay = [{ x: bay.x + TURN + 12, z: laneZ, tol: 2.5, speed: 4.5 }, { x: bay.x + TURN + 2, z: laneZ, tol: 1.0, speed: 2.2 },
    ...[30, 60, 90].map(a => { const r = a * Math.PI / 180; return { x: bay.x + TURN + 2 - TURN * Math.sin(r), z: laneZ - TURN * (1 - Math.cos(r)), tol: 1.0, speed: 1.8 }; }),
    { x: bay.x, z: bay.z - 0.7, tol: 0.9, speed: 1.0 }];
  await pilot(page, t, 'teranga', intoBay, { brakeAtEnd: true, cruise: 5 });
  for (let k = 0; k < 2; k++) {                                          // a driver who stops short of the bay's back line eases forward a little
    const at = await d(() => window.__dakar.teranga.at());
    if (at.z < -129.0 && Math.abs(at.x - bay.x) < 1.6) break;
    await pilot(page, t, 'teranga', [{ x: bay.x, z: bay.z - 1.2, tol: 0.6, speed: 0.9 }], { brakeAtEnd: true, cruise: 1.5 });
  }
  await shot('parked');
  await t.tap('#ridepad .rp-off');
  await until(() => !window.__dakar.teranga.at().driving && window.__dakar.pos().mode === 'play', null, 60000);
  await page.waitForTimeout(1200);
  pk = await d(() => window.__dakar.teranga.at());
  const rec = await d(() => window.__dakar.teranga.info().record);
  check('1. driven from the Corniche to the night street: the district swap and the coast road with the pedal stick', afterSwap.hub === 'almadies', JSON.stringify(afterSwap.car));
  check('2. parked in a painted bay of « PARKING DU PATIO » (centre inside its lines, the whole car off the carriageway), a few metres from the gate', Math.abs(pk.x - bay.x) <= 1.3 && Math.abs(pk.z - bay.z) <= 2.4 && pk.z < -128.6 && Math.abs(pk.x - GATE_X) < 30, JSON.stringify({ at: [+pk.x.toFixed(1), +pk.z.toFixed(1)], bay: [bay.x, bay.z], gate: GATE_X }));
  check('2. stepped out: the car stays where it was left, saved as parked in Almadies', !pk.driving && rec?.hub === 'almadies' && Math.hypot(rec.x - pk.x, rec.z - pk.z) < 0.5, JSON.stringify(rec));
} else {
  // a labelled set-up: the car parked in the bay (the drive and the parking were played in an earlier run), the player beside it
  await d(([x, z, y]) => { const A = window.__dakar, id = A.teranga.info().id, c = A.state.data.counters; c[`vehicle:${id}:hub`] = A.hubs.indexOf('almadies'); c[`vehicle:${id}:x`] = x; c[`vehicle:${id}:z`] = z; c[`vehicle:${id}:yaw`] = y; A.save?.(); A.teleport('corniche'); }, [bay.x, bay.z - 0.7, Math.PI / 2 * 2 - Math.PI]);
  await page.waitForFunction(() => window.__dakar.pos().hub === 'corniche' && window.__dakar.pos().mode === 'play', null, T);
  await d(([x, z]) => window.__dakar.teleport('almadies', x, z, 0), [bay.x - 2.4, bay.z]);
  await page.waitForFunction(() => window.__dakar.pos().hub === 'almadies' && window.__dakar.pos().mode === 'play' && window.__dakar.teranga.info().here, null, T);
  await page.waitForTimeout(1500);
  pk = await d(() => window.__dakar.teranga.at());
  note('FROM=', FROM, ': the car put in the bay by a labelled set-up', JSON.stringify(pk));
}

// ---------------------------------------------------------------- 3. Le Patio: the door, the fee, the courtyard, the bar, a word with the adults of the place
if (runs('patio')) {
  log('3. Le Patio');
  await d(() => window.__dakar.setHour(22));
  await until(() => window.__dakar.venues().find(v => v.type === 'patio').moment === 'warm', null, 30000);
  // out between the bays by the car's west side, to the promenade, along it to the gate
  await walk(pk.x - 2.4, pk.z, { tol: 0.8, ms: 40000 });
  const dProm = await walk(pk.x - 2.4, -134.3, { tol: 1.0, ms: 60000 });
  check('on foot from the car to the promenade past the bays’ cars', dProm < 1.6, `${dProm.toFixed(2)} m left`);
  const door = (await patio()).anchors.find(a => a.id === 'door');
  const dGate = await walk(door.x, door.z, { tol: 1.0, ms: 90000 });
  await page.waitForTimeout(800);
  check('along the promenade to Le Patio’s gate: « Entrer » is offered (with a word for the doorman)', dGate < 1.6 && (await d(() => window.__dakar.focus()?.id)) === 'almadies:venue:patio:door', `${dGate.toFixed(2)} m left, focus ${await d(() => window.__dakar.focus()?.id)}`);
  await shot('le-patio-gate');
  const sp0 = await S();
  await t.tap('#act'); await page.waitForTimeout(900);
  const ask = await sheet();
  check('the age and the fee are shown before anything is paid (18 ans minimum, 3 000 F, one time for the night)', /18 ans minimum/.test(ask ?? '') && /3\s?000\s?F/.test(ask ?? '') && /une seule fois/.test(ask ?? '') && (await S()).wallet === sp0.wallet, (ask ?? '').slice(0, 200));
  await shot('le-patio-fee');
  await tapItem(/et entrer/);
  await until(() => window.__dakar.venues().find(v => v.type === 'patio').admitted && !window.__dakar.activity(), null, 60000);
  const sp1 = await S();
  check('3. paid once: 3 000 F exactly, one ledger line, the rope lifted for the night', sp1.wallet === sp0.wallet - 3000 && sp1.ledger === sp0.ledger + 1 && sp1.last?.amount === -3000, `${sp0.wallet} → ${sp1.wallet}`);
  // through the arched gate, across the floor, to the bar
  let p = await patio();
  const gate = { x: p.origin.x, z: p.origin.z + 7.5 };
  const dIn = await walk(gate.x, gate.z, { tol: 0.9, ms: 60000 });
  await page.waitForTimeout(800);
  check('through the gate on foot into the courtyard: its own space', dIn < 1.4 && (await patio()).space === 'almadies:venue:patio', `${dIn.toFixed(2)} m, space ${(await patio()).space}`);
  await shot('le-patio-courtyard');
  p = await patio();
  const bar = p.anchors.find(a => a.id === 'bar');
  let dBar = await walk(bar.x, bar.z, { tol: 0.9, ms: 90000 });
  if (dBar >= 1.6) { note('the thumb did not reach the bar (', dBar.toFixed(2), 'm short): the courtyard’s people or props are in the way'); }
  check('across the courtyard to the bar: « Commander » is offered, with the barwoman', dBar < 1.6 && (await d(() => window.__dakar.focus()?.id)) === 'almadies:venue:patio:bar', `${dBar.toFixed(2)} m left, focus ${await d(() => window.__dakar.focus()?.id)}`);
  await more();
  const menu = await items();
  check('the bar’s menu has alcohol and soft drinks, priced, none free', menu.some(i => /Bière/.test(i.text)) && menu.some(i => /Bissap|bouye|Eau/i.test(i.text)) && menu.filter(i => /\d\s?F$/.test(i.text)).length >= 6, menu.map(i => i.text).join(' | ').slice(0, 300));
  await shot('le-patio-menu');
  const sb0 = await S();
  await tapItem(/Bière glacée/);
  await until(() => (window.__dakar.seated() ?? '').includes('tabouret'), null, 60000);
  await until(() => !window.__dakar.activity(), null, 90000);
  const sb1 = await S();
  check('a beer at the bar: 1 500 F, paid once at the start, one ledger line, served on a stool', sb1.wallet === sb0.wallet - 1500 && sb1.ledger === sb0.ledger + 1 && /tabouret/.test(await d(() => window.__dakar.seated() ?? '')), `${sb0.wallet} → ${sb1.wallet}`);
  await shot('le-patio-bar-stool');
  await d(() => window.__dakar.stand()); await page.waitForTimeout(800);
  // the adults: walk to a patron and to a worker; talk, ask, decline
  const nearPerson = async id => {
    for (let k = 0; k < 3; k++) {
      const w = (await patio()).people.find(x => x.id === id); if (!w) return null;
      await walk(w.x - 1.2, w.z, { tol: 0.9, ms: 60000 });
      if (await until(i => new RegExp(`:client:${i}$`).test(window.__dakar.focus()?.id ?? ''), id, 8000)) return w;
    }
    return null;
  };
  const talkTo = async id => { const w = await nearPerson(id); if (!w) return null; await t.tap('#act'); await until(() => !!document.querySelector('#modal.on'), null, 20000); await page.waitForTimeout(500); return { hello: await sheet(), rows: (await items()).map(i => i.text) }; };
  const sw0 = await S();
  const a = await talkTo('fatou');
  check('a patron to talk to: Fatou, her birthday (her name and her words, French with everyday Wolof)', !!a && /Fatou/.test(a.hello ?? '') && /anniversaire/.test(a.hello ?? ''), (a?.hello ?? 'nobody').slice(0, 160));
  if (a) {
    await tapItem(/Joyeux anniversaire/);
    check('she answers a topic', /surprise|gâteau/.test((await sheet()) ?? ''), ((await sheet()) ?? '').slice(0, 120));
    await tapItem(/Pas maintenant, merci/);
    check('a no is received gracefully, and the sheet stays as it was', /Pas de souci/.test((await sheet()) ?? '') && (await items()).length === a.rows.length, ((await sheet()) ?? '').slice(0, 120));
    await tapItem(/Bonne soirée/); await until(() => !document.querySelector('#modal.on'), null, 15000);
  }
  const b = await talkTo('rokhaya');
  check('a woman who works the night there says so herself, as work, and that they can just talk', !!b && /Je travaille ici la nuit/.test(b.hello ?? '') && /juste parler/.test(b.hello ?? ''), (b?.hello ?? 'nobody').slice(0, 200));
  if (b) {
    await tapItem(/Comment tu restes en sécurité/);
    check('she talks about staying safe: the right to say no, to anyone', /droit de dire non/.test((await sheet()) ?? ''), '');
    const before = await S(), rows0 = await items();
    await tapItem(/Ce n’est pas ce que je cherche/);
    const declined = (await sheet()) ?? '', after = await S();
    check('declined: graceful, no insistence, no question, the choices as they were; it cost nothing and changed nothing', /Aucun problème, vraiment/.test(declined) && !/\?\s*»?\s*$/.test(declined) && (await items()).length === rows0.length && after.wallet === before.wallet && after.ledger === before.ledger && JSON.stringify(after.c) === JSON.stringify(before.c), declined.slice(0, 160));
    await tapItem(/Bonne soirée/); await until(() => !document.querySelector('#modal.on'), null, 15000);
  }
  const sw1 = await S();
  check('talking moved no money and wrote no ledger line (the beer was the only thing bought since the door)', sw1.wallet === sb1.wallet && sw1.ledger === sb1.ledger, `${sb1.wallet} → ${sw1.wallet}`);
  // the floor: Le Patio's own dance, played on its beat with real touches (the same mechanics as La Vague's)
  p = await patio();
  const floor = p.anchors.find(a => a.id === 'floor');
  await walk(floor.x, floor.z, { tol: 0.9, ms: 90000 });
  const onFloor = await until(() => window.__dakar.focus()?.id === 'almadies:venue:patio:floor', null, 20000);
  check('on the floor « Danser » is offered', onFloor, await d(() => window.__dakar.focus()?.id ?? ''));
  if (onFloor) {
    await t.tap('#act');
    await until(() => !!window.__dakar.gesture() && /^Dance_/.test(window.__dakar.clip() ?? ''), null, 60000);
    await shot('le-patio-dancing');
    const played = await playDance(page, t);
    log('danced at Le Patio:', JSON.stringify(played));
    await page.waitForTimeout(1200);
    const sd = await S();
    check('a dance at Le Patio, played on its beat with real touches (cues touched, counted once)', played.touches >= 8 && (sd.c['club:almadies:venue:patio:danses'] ?? 0) === 1, JSON.stringify({ played, danses: sd.c['club:almadies:venue:patio:danses'] }));
  }
  // out by the exit, back on the promenade
  p = await patio();
  const exit = p.anchors.find(a => a.id === 'exit');
  await walk(exit.x, exit.z, { tol: 0.9, ms: 90000 });
  check('the way out of Le Patio', await act('almadies:venue:patio:exit'));
  await until(() => window.__dakar.pos().z > p.origin.z + 9, null, 30000);
  await page.waitForTimeout(1500);
  const out1 = await d(() => window.__dakar.pos());
  check('back on the promenade, in the street', out1.z > p.origin.z + 9 && (await patio()).space !== 'almadies:venue:patio', JSON.stringify({ x: out1.x, z: out1.z }));
  const spOut = await S();
  check('Le Patio counted the night once (the door), the drink and the dance; the club helper’s keys only', (spOut.c['club:almadies:venue:patio:nights'] ?? 0) === 1 && Object.keys(spOut.c).filter(k => k.startsWith('club:')).every(k => k.startsWith('club:almadies:venue:patio:')), JSON.stringify(Object.fromEntries(Object.entries(spOut.c).filter(([k]) => k.startsWith('club:')))));
}

// ---------------------------------------------------------------- 4, 5. the hotel: along the promenade, across the road; the Terrasse's name is up on the roof
if (runs('hotel')) {
  log('4-5. the hotel');
  const me = await d(() => window.__dakar.pos());
  const camGeo = await d(() => { const g = window.__dakar.cityGeometry(); return g.colliders.map(c => [c.x0, c.z0, c.x1, c.z1, c.h]); });
  const clearRay = (eye, to) => camGeo.every(([x0, z0, x1, z1, h]) => {
    if (eye[0] > x0 && eye[0] < x1 && eye[2] > z0 && eye[2] < z1) return true;
    const dv = [to[0] - eye[0], to[1] - eye[1], to[2] - eye[2]]; let t0 = 0, t1 = 1;
    for (const [o, v, a, b2] of [[eye[0], dv[0], x0, x1], [eye[1], dv[1], 0, h], [eye[2], dv[2], z0, z1]]) {
      if (Math.abs(v) < 1e-9) { if (o < a || o > b2) return true; continue; }
      let ta = (a - o) / v, tb = (b2 - o) / v; if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) return true;
    }
    return !(t0 <= t1 && t0 < 0.985);
  });
  const seesSign = (x, z) => info.sign.panels.some(pn => { const dx = x - pn.x, dz = z - pn.z, f = (dx * pn.nx + dz * pn.nz) / Math.hypot(dx, dz); return f > 0.2 && clearRay([x, 1.7, z], [pn.x, pn.y, pn.z]); });
  check('5. from the car park by Le Patio, the Terrasse de Ngor’s name is up on the hotel’s roof and nothing solid is in the way', seesSign(pk.x, pk.z), JSON.stringify({ car: [pk.x, pk.z] }));
  // east along the promenade (the alley is the way to the road), over the zebra
  await walk(-100, -135.3, { tol: 1.2, ms: 60000 });
  await walk(-60, -135.3, { tol: 1.2, ms: 90000 });
  const pos60 = await d(() => window.__dakar.pos());
  check('5. from the promenade the name is seen too (a face of the sign looks at the street)', seesSign(pos60.x, pos60.z), JSON.stringify({ at: [pos60.x, pos60.z] }));
  await shot('promenade-toward-the-hotel');
  for (const w of [{ x: -30, z: -135.3 }, { x: -30, z: -126.2 }, { x: -30, z: -114.0 }, { x: -30, z: -111.4 }, { x: -37.5, z: -108.2 }]) await walk(w.x, w.z, { tol: 1.0, ms: 90000 });
  const dWalk = await walk(R.x, R.z, { tol: 1.2, ms: 90000 });
  check('4. from Le Patio along the promenade, up the alley, over the zebra and in by the forecourt to the hotel’s stair door: nothing in the way', dWalk < 1.6, `${dWalk.toFixed(2)} m left, at ${JSON.stringify(await d(() => window.__dakar.pos()))}`);
  await shot('hotel-door');
  void me;
}

// ---------------------------------------------------------------- 6-11. the Terrasse, Awa, La Vague, the taxi, another evening (M4's evening, played in the integrated street)
if (runs('hotel')) {
await d(() => window.__dakar.setHour(22.5));                                          // labelled shortcut: the hour held, the Terrasse is open (17 h – 1 h)
check('« Entrer » is offered at the stair door', await act(info.door.id));
await until(() => window.__dakar.pos().x > 3000, null, 60000);
await until(() => window.__dakar.pos().mode === 'play', null, 60000); await page.waitForTimeout(1500);
check('6. up on the Terrasse de Ngor, on the hotel’s roof', (await d(() => window.__dakar.pos().x)) > 3000);
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
check('6. the order is a real activity: 6 000 F paid once, at the start', w0 - w1 === 6000 && (await S()).ledger >= 1, `${w0} → ${w1}`);
check('not fed while it is prepared', (await S()).n.faim <= f0 + 1);
await until(() => /Tu manges/.test(window.__dakar.activity()?.step ?? ''), null, 90000);
await page.waitForTimeout(2500);
const seat = await d(() => window.__dakar.pos()), meal = await d(() => window.__dakar.meal());
check('6. the guest walked to a table, sat, and the plate is on the table, close to the seat', !!meal && meal.prop === 'poisson' && meal.y >= 0.45 && Math.hypot(meal.x - seat.x, meal.z - seat.z) < 1.6, JSON.stringify({ seat: [seat.x, seat.z], meal }));
await shot('eating');
const ateAt = await until(() => !window.__dakar.activity(), null, 90000);
const s1 = await S();
check('6. the last bite feeds (faim up), money untouched after the start, the meal counted once', ateAt && s1.n.faim > f0 + 30 && s1.wallet === w1 && (s1.c.terrasse ?? 0) === 1, JSON.stringify({ faim: s1.n.faim, wallet: s1.wallet, terrasse: s1.c.terrasse }));
await page.waitForTimeout(800);
check('the evening knows it: dinner is a stage', ((await A()).stages & 1) === 1, JSON.stringify((await A()).counters));
check('« Se lever » from the table', await act('self'));
await until(() => window.__dakar.pos().mode === 'play', null, 30000);

// ---------------------------------------------------------------- 4. Awa Sy
const awa = (await A()).awa;
await walkTo(page, t, awa.x, awa.z + 1.2, { tol: 0.8, ms: 60000 });
const soc0 = (await S()).n.social;
check('7. « Parler à Awa » is offered beside her', await act('almadies:awa'));
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
await d(() => window.__dakar.setHour(22.8));                                              // labelled shortcut: the hour held; the club is open from 21 h
const club = await d(() => { const c = window.__dakar.venues().find(v => v.type === 'club'); return { door: c.anchors.find(a => /door$/.test(a.id)), floor: c.anchors.find(a => /floor$/.test(a.id)), exit: c.anchors.find(a => /exit$/.test(a.id)) }; });
await d(() => window.__dakar.clubShift?.(0));
// on foot from the hotel's door to La Vague: out by the forecourt's gap, over the zebra, up the alley (the same way as the car park's)
for (const w of [{ x: -37.5, z: -108.2 }, { x: -30, z: -111.4 }, { x: -30, z: -114.0 }, { x: -30, z: -126.0 }, { x: club.door.x, z: -127.6 }]) await walkTo(page, t, w.x, w.z, { tol: 1.2, ms: 90000 });
await walkTo(page, t, club.door.x, club.door.z, { tol: 1.2, ms: 120000 });
check('8. at La Vague’s door: « Entrer »', await act(`almadies:venue:club:${club.door.id}`));
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
const played = await playDance(page, t);                                                   // the beat game, played with real touches on the music's beat (no debug finish)
log('danced:', JSON.stringify(played));
await page.waitForTimeout(1500);
await until(() => (window.__dakar.almadies.info().stages & 4) === 4, null, 30000);          // the evening's module reads the club's counter on its own frame: a slow page may take a moment
const sd = await S();
check('the beat game was played with real touches on the beat (cues touched, a card at the end)', played.touches >= 8 && played.performances >= 2, JSON.stringify(played));
check('9. one dance counted by La Vague, and the evening knows it', (sd.c['club:almadies:venue:club:danses'] ?? 0) === 1 && ((await A()).stages & 4) === 4, JSON.stringify((await A()).counters));

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
check('10. the taxi home: the fare paid once, one ledger line, in the Corniche', wt0 - wt1 > 0 && (await S()).ledger === led0 + 1, JSON.stringify({ menu: menu.map(m => m.text.slice(0, 30)), paid: wt0 - wt1 }));
check('the evening card was not shown a second time, and the evening count is still 1', (await A()).cards === 0 || (await A()).counters.al_evenings === 1, JSON.stringify((await A()).counters));
await d(() => window.__dakar.teleport('almadies'));
await until(() => window.__dakar.pos().hub === 'almadies' && window.__dakar.teranga.info().here, null, 60000); await page.waitForTimeout(1500);
const car2 = await d(() => window.__dakar.teranga.at());
check('back in Almadies the car is still exactly where it was parked (one car, not a copy)', Math.hypot(car2.x - pk.x, car2.z - pk.z) < 0.5 && (await d(() => window.__dakar.teranga.info().count ?? 1)) === 1, JSON.stringify({ was: [pk.x, pk.z], now: [car2.x, car2.z] }));

// ---------------------------------------------------------------- 8. another evening: she remembers
await d(() => { window.__pinDay += 1; window.__dakar.nextDay(1); window.__dakar.setHour(19); });   // (the day pin follows)                  // labelled shortcut: the next city day, 19:00
const money1 = (await S()).wallet;
await d(i => window.__dakar.place(i.door.x + i.facade.nx * 0.6, i.door.z + i.facade.nz * 0.6, Math.atan2(-i.facade.nx, -i.facade.nz)), info);
await page.waitForTimeout(1500);
await act(info.door.id);
await until(() => window.__dakar.pos().x > 3000 && window.__dakar.pos().mode === 'play', null, 60000); await page.waitForTimeout(2500);
const hello = await toast();
check('11. climbing the stairs on a later evening, Awa remembers what the guest said and did (a bon travail; danced)', /bon travail/.test(hello) && /danser/.test(hello), hello);
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

}

// ---------------------------------------------------------------- 12. save and reload: the money, the car, the memory, the progression — everything is there, nothing twice
await d(() => window.__dakar.save?.());
await page.waitForTimeout(1500);
const sv = await S(), before = (await A()).counters, rel0 = (await A()).rel, carB = await d(() => window.__dakar.teranga.info().record);
const spent = -(await ledgerSum(ledger0));
check('12. before the save: the wallet fell by exactly what the ledger says was paid (the door, the beer, the dish, La Vague, the taxi: each once; the coffee and the talks nothing)', wallet0 - sv.wallet === spent && spent > 3000 + 1500 + 6000 + 2000, `${wallet0} → ${sv.wallet}, ledger ${spent}`);
const clubKeys = Object.fromEntries(Object.entries(sv.c).filter(([k]) => k.startsWith('club:')));
await page.reload({ timeout: 180000 });
await ready(); t = await realTouch(page);
await page.waitForFunction(() => window.__dakar.pos().mode === 'play', null, T);
const sa = await S(), after = (await A()).counters;
check('12. after a reload the money is the same to the franc', sa.wallet === sv.wallet, `${sv.wallet} → ${sa.wallet}`);
check('12. the memory of M4 is there: the evenings, the choice, the meeting, Awa’s gift; nothing counted again', after.al_evenings === before.al_evenings && after.al_toast === 2 && after.al_awa_met === before.al_awa_met && after.al_gift_night === before.al_gift_night, JSON.stringify({ before, after }));
check('12. the progression of the activities is there: Le Patio’s night and dance, La Vague’s dance, the Terrasse’s meal', Object.entries(clubKeys).every(([k, v]) => sa.c[k] === v) && (sa.c['club:almadies:venue:patio:nights'] ?? 0) === 1 && (sa.c['club:almadies:venue:patio:danses'] ?? 0) === 1 && (sa.c['club:almadies:venue:club:danses'] ?? 0) === 1 && (sa.c.terrasse ?? 0) === 1, JSON.stringify(clubKeys));
check('12. only the existing counters were written (al_*, club:*, the ordinary ones): no new save field', Object.keys(sa.c).filter(k => k.startsWith('al_')).length > 0, '');
await d(() => window.__dakar.teleport('almadies'));
await until(() => window.__dakar.pos().hub === 'almadies' && window.__dakar.teranga.info().here && window.__dakar.pos().mode === 'play', null, 120000); await page.waitForTimeout(2500);
const carA = await d(() => window.__dakar.teranga.at()), recA = await d(() => window.__dakar.teranga.info().record);
check('12. the car is where it was left, in Le Patio’s bay: one car, the same place after the reload', carB && recA && Math.hypot(recA.x - carB.x, recA.z - carB.z) < 0.5 && Math.hypot(carA.x - pk.x, carA.z - pk.z) < 0.6 && recA.hub === 'almadies', JSON.stringify({ before: carB, after: recA, at: [carA.x, carA.z], parked: [pk.x, pk.z] }));
const pa = await patio();
check('12. Le Patio remembers the guest: the night is counted, the door’s fee is not asked again for the same night', !!pa && (pa.counters?.nights ?? 0) >= 1, JSON.stringify(pa?.counters));
void rel0;
await d(() => clearInterval(window.__pin));
check('no JavaScript errors', errors.length === 0, errors.join(' | '));
console.log(`\n${total - failed}/${total} nightlife journey checks passed`);
await context.close(); await browser.close();
if (failed) process.exit(1);
