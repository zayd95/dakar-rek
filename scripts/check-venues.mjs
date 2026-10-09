// End-to-end checks of the composed venues (src/venues): walk in from the street, recognise the place, play its routes
// (order → sit → eat; the grill gesture; the owner; ablutions → shoes off → prayer → imam), day / night / closed.
// (order → sit → eat; the grill; the owner; ablutions → shoes off → prayer → imam; the pirogue trip → the mareyeuses;
// La Vague: the door by day and at night, the entry, the dance gesture, the contest, the bar's stools, the DJ).
// Usage: flock /tmp/dakar-browser.lock node scripts/check-venues.mjs [baseUrl] [outDir]   (needs a running build, e.g.
// `npx vite preview --port 4212`). ONLY=desktop|phone and SECTIONS=dibi,mosque,beach,salon,club narrow a run while iterating.
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:4212/';
const out = process.argv[3] ?? 'docs/screenshots/venues';
fs.mkdirSync(out, { recursive: true });
const SLOW = Number(process.env.SLOW ?? 3);
const T = { timeout: 120000 * SLOW };
const results = []; let failed = 0;
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${detail}`); };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const SECTIONS = (process.env.SECTIONS ?? 'dibi,mosque,beach,salon,club').split(',');
for (const [label, viewport, touch] of [['desktop', { width: 1280, height: 800 }, false], ['phone', { width: 390, height: 844 }, true]]) {
  if (process.env.ONLY && process.env.ONLY !== label) continue;
  const page = await (await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch })).newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}?debug${touch ? '&touch' : ''}`, { timeout: 120000 });
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.venues, null, T);
  const d = (fn, arg) => page.evaluate(fn, arg);
  // a loaded machine renders SwiftShader at a few frames per second and game time follows the frames (dt ≤ 0.1 s): wait long
  const until = (fn, arg, timeout = 60000) => page.waitForFunction(fn, arg, { timeout: timeout * SLOW, polling: 200 }).then(() => true).catch(() => false);
  // a capture never fails a run: on a loaded machine a frame can take longer than Playwright's default 30 s
  const shot = async name => {
    await page.waitForTimeout(700);
    try { await page.screenshot({ path: `${out}/${label}-${name}.png`, timeout: 120000 * SLOW }); }
    catch (e) { console.log(`NOTE: capture ${label}-${name} skipped (${String(e.message).split('\n')[0]})`); }
  };
  const W = (v, lx, lz) => ({ x: v.origin.x + lx * Math.cos(v.yaw) + lz * Math.sin(v.yaw), z: v.origin.z - lx * Math.sin(v.yaw) + lz * Math.cos(v.yaw) });
  const cam = (v, from, to) => { const a = W(v, from[0], from[2]), b = W(v, to[0], to[2]); return d(([p, q]) => window.__dakar.cam(p, q), [[a.x, from[1], a.z], [b.x, to[1], b.z]]); };
  const venue = type => d(t => window.__dakar.venues().find(v => v.type === t) ?? null, type);
  const anchor = (v, id) => v.anchors.find(a => a.id === id);
  /** Stand `dist` metres in front of a point (local direction of the venue), facing it, and wait until it is focused. */
  const standAt = async (pt, yaw, focusRe, back = 0.6) => {
    await d(([x, z, y]) => window.__dakar.place(x, z, y), [pt.x - Math.sin(yaw) * back, pt.z - Math.cos(yaw) * back, yaw]);
    return until(re => new RegExp(re).test(window.__dakar.focus()?.id ?? ''), focusRe.source, 30000);
  };
  /** Walk forward (W) until the predicate holds or the time runs out. */
  const walk = async (pred, arg, ms = 25000) => {
    await page.keyboard.down('KeyW');
    const ok = await until(pred, arg, ms);
    await page.keyboard.up('KeyW');
    return ok;
  };
  const toast = () => d(() => document.getElementById('toast')?.textContent ?? '');
  const modal = () => d(() => (document.querySelector('#modal.on') ? document.getElementById('modal').textContent : null));
  const pick = async text => { await page.locator('#modal .item', { hasText: text }).first().click(); };
  /** Click the menu item whose label is exactly `label` (details may mention other items' words). */
  const pickLabel = label => d(l => { const b = [...document.querySelectorAll('#modal .item')].find(x => x.querySelector('div')?.firstChild?.textContent === l); b?.click(); return !!b; }, label);
  const closeModal = async () => { await d(() => document.querySelector('#modal .item.close')?.click()); await until(() => window.__dakar.pos().mode === 'play', null, 10000); };

  // ================================================================== Dibi of Pikine
  if (SECTIONS.includes('dibi')) {
  await d(() => { window.__dakar.teleport('pikine'); window.__dakar.setHour(12.5); window.__dakar.state.data.needs.energie = 100; });
  await until(() => window.__dakar.pos().hub === 'pikine' && window.__dakar.venues().some(v => v.type === 'dibi'));
  let v = await venue('dibi');
  check(`${label}: Pikine has its Dibi composed on the old dibiterie lot`, !!v && v.name === 'Dibiterie Chez Pathé' && v.seats.length >= 18, v ? `${v.seats.length} seats` : 'none');
  // walk in from the street: the place recognises the player at its entrance, then the counter takes over
  const into = v.yaw + Math.PI;                                        // facing the back of the lot
  await d(([p, y]) => window.__dakar.place(p.x, p.z, y), [W(v, -3.2, 14.5), into]);
  const met = await walk(n => window.__dakar.focus()?.name === n, v.name, 20000);
  check(`${label}: walking in from the street, the Dibi greets you by its name`, met, JSON.stringify(await d(() => window.__dakar.focus())));
  const sheet = await d(() => window.__dakar.interactables().find(i => i.id === 'pikine:dibiterie:11'));
  check(`${label}: the place keeps its identity for deliveries and routines`, !!sheet && Math.hypot(sheet.x - W(v, -2.4, 9.3).x, sheet.z - W(v, -2.4, 9.3).z) < 0.1, JSON.stringify(sheet));
  const inside = await walk(p => Math.hypot(window.__dakar.pos().x - p.x, window.__dakar.pos().z - p.z) < 2.5, W(v, -3.2, 2), 25000);
  check(`${label}: the entrance is walkable all the way into the courtyard`, inside, JSON.stringify(await d(() => window.__dakar.pos())));
  await cam(v, [-17, 7.5, 19], [-2, 0.5, 0]); await shot('dibi-day-corner');
  await cam(v, [9, 2.4, 9], [-6, 1.0, -2]); await shot('dibi-day-inside'); await d(() => window.__dakar.cam(null));

  // the counter: what you can order
  const counterAt = anchor(v, 'counter'), counterYaw = v.yaw + Math.PI;
  check(`${label}: standing at the counter focuses it`, await standAt(counterAt, counterYaw, /:counter$/), '');
  const f = await d(() => window.__dakar.focus());
  check(`${label}: the counter offers dibi, brochettes, the day's special, bissap and Pathé`, ['Dibi mouton', 'Brochettes', 'Bissap frais', 'Parler à Pathé'].every(x => f?.all.includes(x)) && f.all.some(x => x.startsWith('Plat du jour')), f?.all.join(' | '));
  // a wall does not let you through: push into the counter
  if (!touch) {
    const z0 = await d(() => window.__dakar.pos());
    await page.keyboard.down('KeyW'); await page.waitForTimeout(2500); await page.keyboard.up('KeyW');
    const z1 = await d(() => window.__dakar.pos());
    const behind = W(v, -4.8, -6.6);
    check('desktop: the counter is solid (no walking through it)', Math.hypot(z1.x - behind.x, z1.z - behind.z) > 0.6 && Math.hypot(z1.x - z0.x, z1.z - z0.z) < 1.2, `${z0.x.toFixed(1)},${z0.z.toFixed(1)} → ${z1.x.toFixed(1)},${z1.z.toFixed(1)}`);
    await standAt(counterAt, counterYaw, /:counter$/);
  }
  // order → prepared → sit at a free table → eat (the plate on the table) → stay seated
  await d(() => { const s = window.__dakar.state; s.data.wallet = 5000; s.data.needs.faim = 30; });
  await d(() => window.__dakar.act());
  await until(() => window.__dakar.activity()?.step === 'Préparation', null, 20000);
  const waiting = await d(() => ({ a: window.__dakar.activity(), wallet: window.__dakar.state.wallet, seated: window.__dakar.seated() }));
  check(`${label}: « Dibi mouton » is paid at the counter, then grilled`, waiting.wallet === 3000 && waiting.a?.id === 'dibi' && !waiting.seated, JSON.stringify(waiting));
  await until(() => window.__dakar.activity()?.step === 'Tu manges', null, 120000);
  const eating = await d(() => ({ seat: window.__dakar.seated(), clip: window.__dakar.clip(), v: window.__dakar.venues().find(x => x.type === 'dibi'), seats: window.__dakar.seatsHere() }));
  const mySeat = eating.seats.find(s => s.id === eating.seat);
  check(`${label}: then you sit at a free table seat of the Dibi, with your dibi on the table`, !!eating.seat && eating.seat.includes('venue:dibiterie') && eating.clip === 'Sit' && eating.v.prop === 'dibi' && mySeat?.occupant === 'player', `${eating.seat} ${eating.clip} ${eating.v.prop}`);
  await shot('dibi-eating');
  await until(() => !window.__dakar.activity(), null, 120000);
  const ate = await d(() => ({ faim: window.__dakar.state.data.needs.faim, seated: window.__dakar.seated(), focus: window.__dakar.focus()?.primary, meals: window.__dakar.venues().find(x => x.type === 'dibi').counters.meals }));
  check(`${label}: the meal feeds you, counts at this Dibi and you stay seated`, ate.faim >= 80 && !!ate.seated && ate.focus === 'Se lever' && ate.meals === 1, JSON.stringify(ate));
  const saved = await d(() => { const s = JSON.parse(localStorage.getItem('dakarrek.guest.save') ?? '{}'); return Object.entries(s.counters ?? {}).filter(([k]) => k.includes('venue:dibiterie')); });
  check(`${label}: the meal is saved on the device`, saved.some(([k, n]) => k.startsWith('repas:') && n >= 1), JSON.stringify(saved));
  await d(() => window.__dakar.stand());

  // Pathé: a short conversation (his line, the player's choices)
  await standAt(counterAt, counterYaw, /:counter$/);
  await d(() => window.__dakar.more());
  await until(() => !!document.querySelector('#modal.on'), null, 10000);
  await pick('Parler à Pathé');
  await until(() => /Pathé/.test(document.getElementById('modal').textContent ?? ''), null, 10000);
  await pick('Demander du travail');
  await until(() => /liggéey|services/.test(document.getElementById('modal').textContent ?? ''), null, 10000);
  check(`${label}: Pathé talks (Wolof greeting) and explains the grill ladder`, /liggéey|services/.test(await modal() ?? ''), (await modal())?.slice(0, 160));
  await shot('dibi-pathe');
  await closeModal();

  // the grill: a work shift beside the cook, facing the fire (a timed step; the integration makes it the shared timing gesture)
  const grillAt = anchor(v, 'grill');
  check(`${label}: the grill is a place to work`, await standAt(grillAt, v.yaw, /:grill$/, 0.2), JSON.stringify(await d(() => window.__dakar.focus())));
  const g0 = await d(() => ({ f: window.__dakar.focus(), wallet: window.__dakar.state.wallet }));
  check(`${label}: « Aider au grill » is offered with its pay and the next rung`, g0.f?.primary === 'Aider au grill', g0.f?.all.join(' | '));
  await d(() => window.__dakar.act());
  await until(() => (window.__dakar.activity()?.id ?? '').startsWith('grill_'), null, 20000);
  await until(p => window.__dakar.clip() === 'Talk' && Math.hypot(window.__dakar.pos().x - p.x, window.__dakar.pos().z - p.z) < 0.3, W(v, -8.0 + 1.15, 8.6 - 0.85), 30000);
  const gw = await d(([p]) => ({ a: window.__dakar.activity(), clip: window.__dakar.clip(), pos: window.__dakar.pos(), cook: p }), [W(v, -8.0 + 1.15, 8.6 - 0.85)]);
  check(`${label}: the player steps beside the cook and works the skewers`, gw.a?.id === 'grill_aide' && gw.clip === 'Talk' && Math.hypot(gw.pos.x - gw.cook.x, gw.pos.z - gw.cook.z) < 0.3, JSON.stringify({ clip: gw.clip, step: gw.a?.step }));
  await cam(v, [-3.5, 2.6, 4.5], [-7.5, 1.0, 8.6]); await shot('dibi-grill'); await d(() => window.__dakar.cam(null));
  // the grill is a timing gesture (scripts/check-gestures.mjs plays gestures for real): here, a perfect shift
  await until(() => { if (window.__dakar.gesture?.()) window.__dakar.gestureFinish(1); return !window.__dakar.activity(); }, null, 120000);
  const g1 = await d(() => ({ wallet: window.__dakar.state.wallet, grill: window.__dakar.venues().find(x => x.type === 'dibi').counters.grill, ledger: window.__dakar.state.data.ledger.at(-1) }));
  check(`${label}: the shift pays, goes to the wallet history and counts toward the next rung`, g1.wallet - g0.wallet === 1080 && g1.grill === 1 && /Aider au grill/.test(g1.ledger?.label ?? ''), `+${g1.wallet - g0.wallet} F « ${g1.ledger?.label} »`);

  // the evening: more people, lights, attaya; then closed
  await d(() => window.__dakar.setHour(21.5));
  await until(() => window.__dakar.venues().find(x => x.type === 'dibi').moment === 'evening', null, 20000);
  const ev = await d(() => window.__dakar.venues().find(x => x.type === 'dibi'));
  check(`${label}: lively at night (more clients)`, ev.npcs >= (touch ? 4 : 6), `${ev.npcs} people`);
  await standAt(counterAt, counterYaw, /:counter$/);
  const fe = await d(() => window.__dakar.focus());
  check(`${label}: attaya after the meal, in the evening`, fe?.all.includes('Attaya après le repas'), fe?.all.join(' | '));
  await cam(v, [-17, 7.5, 19], [-2, 0.5, 0]); await shot('dibi-night-corner');
  await cam(v, [9, 2.4, 9], [-6, 1.0, -2]); await shot('dibi-night-inside'); await d(() => window.__dakar.cam(null));
  await d(() => window.__dakar.setHour(8));
  await until(() => window.__dakar.venues().find(x => x.type === 'dibi').moment === 'closed', null, 20000);
  await standAt(counterAt, counterYaw, /:counter$/);
  await d(() => window.__dakar.act());
  await until(() => /Fermé/.test(document.getElementById('toast')?.textContent ?? ''), null, 10000);
  const closed = await d(() => ({ v: window.__dakar.venues().find(x => x.type === 'dibi'), toast: document.getElementById('toast').textContent, a: window.__dakar.activity() }));
  check(`${label}: closed in the morning, with the reason shown (shutter down, cold grill, nobody)`, /Fermé · ouvre à 11 h/.test(closed.toast ?? '') && !closed.a && closed.v.shutter && !closed.v.smoke && closed.v.npcs === 0, `« ${closed.toast} » shutter=${closed.v.shutter}`);
  await shot('dibi-closed');

  }
  // ================================================================== Grande Mosquée (Plateau)
  if (SECTIONS.includes('mosque')) {
  await d(() => { window.__dakar.teleport('plateau'); window.__dakar.setHour(10); });
  await until(() => window.__dakar.pos().hub === 'plateau' && window.__dakar.venues().some(x => x.type === 'mosque'));
  const m = await venue('mosque');
  check(`${label}: the Plateau has its Grande Mosquée (courtyard, taps, prayer hall)`, !!m && m.prayerSeats >= 60 && m.stools.length >= 6, m ? `${m.prayerSeats} places, ${m.stools.length} taps` : 'none');
  await d(([p, y]) => window.__dakar.place(p.x, p.z, y), [W(m, 0, 27), m.yaw + Math.PI]);
  const inCourt = await walk(p => Math.hypot(window.__dakar.pos().x - p.x, window.__dakar.pos().z - p.z) < 2.5, W(m, 0, 16), 30000);
  check(`${label}: walking in through the gate into the courtyard`, inCourt, JSON.stringify(await d(() => window.__dakar.pos())));
  await cam(m, [14, 9, 40], [-2, 5, 4]); await shot('mosque-day-front'); await d(() => window.__dakar.cam(null));
  // no prayer before ablutions; ablutions at the taps, seated on a stool, change nothing in the save
  const tapsAt = anchor(m, 'ablutions');
  check(`${label}: the taps are a place for ablutions`, await standAt(tapsAt, m.yaw - Math.PI / 2, /:ablutions$/, 0.3), JSON.stringify(await d(() => window.__dakar.focus())));
  const before = await d(() => JSON.stringify({ n: window.__dakar.state.data.needs, w: window.__dakar.state.wallet, c: window.__dakar.state.data.counters }));
  await d(() => window.__dakar.act());
  await until(() => window.__dakar.activity()?.id === 'ablutions', null, 20000);
  await until(() => window.__dakar.clip() === 'Sit', null, 30000);
  const wash = await d(() => ({ seat: window.__dakar.seated(), clip: window.__dakar.clip() }));
  check(`${label}: ablutions seated on the low stool in front of a tap`, (wash.seat ?? '').includes('robinet') && wash.clip === 'Sit', JSON.stringify(wash));
  await shot('mosque-ablutions');
  await until(() => !window.__dakar.activity(), null, 60000);
  const after = await d(() => JSON.stringify({ n: window.__dakar.state.data.needs, w: window.__dakar.state.wallet, c: window.__dakar.state.data.counters }));
  const washed = await d(() => window.__dakar.venues().find(x => x.type === 'mosque').washed);
  check(`${label}: ablutions done — no reward of any kind`, washed && JSON.parse(after).w === JSON.parse(before).w && JSON.stringify(JSON.parse(after).c) === JSON.stringify(JSON.parse(before).c) && Math.abs(JSON.parse(after).n.hygiene - JSON.parse(before).n.hygiene) < 1, '');
  await d(() => window.__dakar.stand());
  // shoes off at the door
  check(`${label}: at the door: « Entrer · laisser ses chaussures »`, await standAt(anchor(m, 'door'), m.yaw + Math.PI, /:door$/), JSON.stringify(await d(() => window.__dakar.focus())));
  await d(() => window.__dakar.act());
  await until(() => window.__dakar.pos().x > 1500, null, 20000);
  const hall = await d(() => ({ pos: window.__dakar.pos(), v: window.__dakar.venues().find(x => x.type === 'mosque') }));
  check(`${label}: inside the prayer hall, barefoot, the shoes wait on the rack`, hall.pos.x > 1500 && hall.v.barefoot && hall.v.shoesOnRack, JSON.stringify({ x: hall.pos.x, barefoot: hall.v.barefoot }));
  await shot('mosque-hall');
  // pray on a row, kneeling; nothing changes in the save
  await d(() => window.__dakar.place(1600.4, 1.6, Math.PI));
  await until(() => /:hall$/.test(window.__dakar.focus()?.id ?? ''), null, 20000);
  const fh = await d(() => window.__dakar.focus());
  check(`${label}: the rows offer prayer and a calm seat; reading waits for a verified text`, ['Prier', 'S’asseoir au calme'].every(x => fh?.all.includes(x)), fh?.all.join(' | '));
  const b2 = await d(() => JSON.stringify({ n: window.__dakar.state.data.needs, w: window.__dakar.state.wallet, c: window.__dakar.state.data.counters }));
  await d(() => window.__dakar.act());
  await until(() => window.__dakar.activity()?.id === 'priere', null, 20000);
  await until(() => window.__dakar.clip() === 'Kneel', null, 30000);
  const pr = await d(() => ({ seat: window.__dakar.seated(), clip: window.__dakar.clip(), y: window.__dakar.pos().y, seats: window.__dakar.seatsHere() }));
  const row = pr.seats.find(s => s.id === pr.seat);
  check(`${label}: prayer on a free place of a row, kneeling on the floor`, row?.kind === 'prayer' && row.occupant === 'player' && pr.clip === 'Kneel' && Math.abs(pr.y - 0.1) < 0.05, JSON.stringify({ seat: pr.seat, clip: pr.clip, y: pr.y }));
  await d(() => window.__dakar.cam([1600 + 3, 2.2, 3.5], [1600 - 0.5, 0.6, -2])); await shot('mosque-prayer'); await d(() => window.__dakar.cam(null));
  await until(() => !window.__dakar.activity(), null, 60000);
  const a2 = await d(() => JSON.stringify({ n: window.__dakar.state.data.needs, w: window.__dakar.state.wallet, c: window.__dakar.state.data.counters }));
  const sameNeeds = Object.entries(JSON.parse(a2).n).every(([k, x]) => Math.abs(x - JSON.parse(b2).n[k]) < 1);
  check(`${label}: prayer brings no reward (needs, money, counters unchanged)`, sameNeeds && JSON.parse(a2).w === JSON.parse(b2).w && JSON.stringify(JSON.parse(a2).c) === JSON.stringify(JSON.parse(b2).c), '');
  await d(() => window.__dakar.stand());
  // the imam: an everyday exchange
  const imamAt = anchor(m, 'imam');
  check(`${label}: the imam can be greeted`, await standAt(imamAt, Math.PI, /:imam$/, 0.5), JSON.stringify(await d(() => window.__dakar.focus())));
  await d(() => window.__dakar.act());
  await until(() => /Maleekum salaam/.test(document.querySelector('#modal.on') ? document.getElementById('modal').textContent : ''), null, 10000);
  await pick('Les heures de prière');
  await until(() => /Tisbaar/.test(document.getElementById('modal').textContent ?? ''), null, 10000);
  check(`${label}: the imam answers in French and Wolof, with the prayer times`, /Tisbaar/.test(await modal() ?? ''), (await modal())?.slice(0, 160));
  await shot('mosque-imam');
  await closeModal();
  // out again: shoes back on
  await d(() => window.__dakar.exit());
  await until(() => window.__dakar.pos().x < 900, null, 20000);
  const outside = await d(() => window.__dakar.venues().find(x => x.type === 'mosque'));
  check(`${label}: leaving the hall, shoes back on`, !outside.barefoot && !outside.shoesOnRack, '');
  // prayer time: the rows fill up (exposed to the NPC system as the place's peaks)
  await d(() => window.__dakar.setHour(14.1));
  await until(() => window.__dakar.venues().find(x => x.type === 'mosque').moment === 'prayer', null, 20000);
  const pt = await d(() => window.__dakar.venues().find(x => x.type === 'mosque'));
  check(`${label}: at Tisbaar the congregation gathers`, pt.congregation === 'Tisbaar' && pt.npcsHall >= (touch ? 6 : 12), `${pt.npcsHall} in the hall`);
  if (!touch) {
    await d(([p, y]) => window.__dakar.place(p.x, p.z, y), [anchor(m, 'door'), m.yaw + Math.PI]);
    await until(() => /:door$/.test(window.__dakar.focus()?.id ?? ''), null, 20000);
    await d(() => window.__dakar.act()); await until(() => window.__dakar.pos().x > 1500, null, 20000);
    await d(() => window.__dakar.cam([1600 + 8, 3.6, 6.5], [1600 - 1, 1, -5])); await shot('mosque-hall-tisbaar'); await d(() => window.__dakar.cam(null));
    await d(() => window.__dakar.exit()); await until(() => window.__dakar.pos().x < 900, null, 20000);
  }
  await d(() => window.__dakar.setHour(20.6));
  await cam(m, [14, 9, 40], [-2, 5, 4]); await shot('mosque-night-front'); await d(() => window.__dakar.cam(null));
  // the Médina's Dibi is the same venue (one system, many places)
  const med = await d(() => window.__dakar.venues().find(x => x.type === 'dibi'));
  check(`${label}: the Médina's Dibi is the same venue with its own owner`, med?.name === 'Dibiterie de la Médina' && med.owner === 'Aliou' && med.seats.length >= 18, med?.name);
  }
  // ================================================================== Soumbédioune: the pirogue, then the mareyeuses
  if (SECTIONS.includes('beach')) {
  await d(() => { window.__dakar.teleport('corniche'); window.__dakar.setHour(7.5); const s = window.__dakar.state; s.data.needs.energie = 100; s.data.wallet = 1000; });
  await until(() => window.__dakar.pos().hub === 'corniche' && (window.__dakar.venues().find(x => x.type === 'beach')?.crew ?? 0) > 0);
  const b = await venue('beach');
  check(`${label}: Soumbédioune has a pirogue ready to leave and the mareyeuses`, !!b && b.anchors.length === 2 && b.crew >= 1, b ? `${b.crew} fishermen` : 'none');
  const boatAt = anchor(b, 'pirogue'), marketAt = anchor(b, 'mareyeuses');
  // walk across the sand to the pirogue (from the landing, toward the boat's side)
  await d(([p]) => window.__dakar.place(p.x + 5, p.z, -Math.PI / 2), [boatAt]);   // the corridor between the hub's last boat and ours
  const reached = await walk(() => /:pirogue$/.test(window.__dakar.focus()?.id ?? ''), null, 30000);
  const fb = await d(() => window.__dakar.focus());
  check(`${label}: walking up to the pirogue offers the trip (morning catch)`, reached && fb?.primary === 'Partir avec les pêcheurs', JSON.stringify(fb));
  const fish0 = await d(() => window.__dakar.inventory().find(i => i.id === 'poisson')?.count ?? 0);
  await d(() => window.__dakar.act());
  await until(() => window.__dakar.seated() === window.__dakar.venues().find(x => x.type === 'beach').seat, null, 20000);
  await until(() => window.__dakar.venues().find(x => x.type === 'beach').off > 25, null, 120000);
  const sea = await d(() => ({ v: window.__dakar.venues().find(x => x.type === 'beach'), pos: window.__dakar.pos(), a: window.__dakar.activity() }));
  check(`${label}: aboard, the pirogue takes you out to sea`, sea.v.atSea && sea.pos.x < sea.v.dock.x - 20 && !!sea.a, `off=${sea.v.off.toFixed(1)} step=${sea.a?.step}`);
  await d(([p]) => window.__dakar.cam([p.x + 14, 6, p.z + 10], [p.x - 2, 0.5, p.z]), [sea.pos]); await shot('beach-at-sea'); await d(() => window.__dakar.cam(null));
  await until(() => { if (window.__dakar.gesture?.()) window.__dakar.gestureFinish(1); return !window.__dakar.activity(); }, null, 240000);   // the net is a gesture
  const back = await d(() => ({ v: window.__dakar.venues().find(x => x.type === 'beach'), seat: window.__dakar.seated(), fish: window.__dakar.inventory().find(i => i.id === 'poisson')?.count ?? 0 }));
  check(`${label}: back on the sand with the catch (6 fish in the morning), still aboard`, back.fish - fish0 === 6 && back.seat === back.v.seat && back.v.off < 2, `fish ${fish0} → ${back.fish}`);
  await d(() => window.__dakar.stand());
  // the mareyeuses buy the catch
  check(`${label}: at the fish market, the mareyeuses buy fish`, await standAt(marketAt, Math.PI, /:mareyeuses$/, 0.4), JSON.stringify(await d(() => window.__dakar.focus())));
  const w0 = await d(() => window.__dakar.state.wallet);
  await d(() => window.__dakar.act());
  await until(() => !window.__dakar.activity() && (window.__dakar.inventory().find(i => i.id === 'poisson')?.count ?? 0) < 6 + 0, null, 60000);
  await until(() => !window.__dakar.activity(), null, 60000);
  const sold = await d(() => ({ w: window.__dakar.state.wallet, fish: window.__dakar.inventory().find(i => i.id === 'poisson')?.count ?? 0, save: JSON.parse(localStorage.getItem('dakarrek.guest.save') ?? '{}').counters?.['inv:poisson'] ?? 0 }));
  check(`${label}: selling 4 fish pays 2 400 F; the 2 left are saved in the inventory`, sold.w - w0 === 2400 && sold.fish === back.fish - 4 && sold.save === sold.fish, JSON.stringify(sold));
  await d(([p]) => window.__dakar.cam([p.x - 2.5, 2.4, p.z - 5.5], [p.x, 1.1, p.z]), [marketAt]); await shot('beach-mareyeuses'); await d(() => window.__dakar.cam(null));
  await d(() => window.__dakar.setHour(21));
  await d(([p]) => window.__dakar.place(p.x, p.z, -Math.PI / 2), [boatAt]);
  await until(() => /:pirogue$/.test(window.__dakar.focus()?.id ?? ''), null, 20000);
  await d(() => window.__dakar.act());
  await until(() => /Fermé · ouvre à 6 h/.test(document.getElementById('toast')?.textContent ?? ''), null, 15000);
  check(`${label}: no trips at night (the reason is shown)`, /Fermé · ouvre à 6 h/.test(await toast()) && !(await d(() => window.__dakar.activity())), await toast());
  }
  // ================================================================== Salon Awa: a chair, a cut, a look that stays
  if (SECTIONS.includes('salon')) {
  await d(() => { window.__dakar.teleport('pikine'); window.__dakar.setHour(11); const s = window.__dakar.state; s.data.wallet = 5000; delete s.data.counters.coiffure; });
  await until(() => window.__dakar.pos().hub === 'pikine' && window.__dakar.venues().some(x => x.type === 'salon'));
  const sv = await venue('salon');
  check(`${label}: Salon Awa has two styling chairs`, !!sv && sv.seats.length === 2, sv ? sv.seats.join(' ') : 'none');
  const sheetIt = await d(() => window.__dakar.interactables().find(i => i.id === 'pikine:city:salon-tech'));
  await d(([p]) => window.__dakar.place(p.x + 3.6, p.z + 1.2, Math.PI), [sheetIt]);
  const toChair = await walk(() => /venue:salon:chair$/.test(window.__dakar.focus()?.id ?? ''), null, 30000);
  const fs = await d(() => window.__dakar.focus());
  check(`${label}: walking into the shop, the chairs offer cuts and the beard`, toChair && ['Coupe courte', 'Coiffure afro', 'Crâne rasé', 'Barbe taillée'].every(x => fs?.all.includes(x)), fs?.all.join(' | '));
  await d(() => window.__dakar.more());
  await until(() => !!document.querySelector('#modal.on'), null, 10000);
  await pick('Coiffure afro');
  await until(() => window.__dakar.activity()?.id === 'afro', null, 20000);
  const cut = await d(() => ({ seat: window.__dakar.seated(), wallet: window.__dakar.state.wallet }));
  check(`${label}: « Coiffure afro » is paid and you sit in the free chair`, (cut.seat ?? '').includes('venue:salon:fauteuil') && cut.wallet === 2500, JSON.stringify(cut));
  await d(() => window.__dakar.portrait(2.6, 1.6, 1.1)); await shot('salon-cut'); await d(() => window.__dakar.portrait(0));
  await until(() => !window.__dakar.activity(), null, 120000);
  const look = await d(() => { let short = false, puff = false; window.__dakar.body().group.traverse(o => { if (o.isMesh && o.name.startsWith('Hair_Short')) short ||= o.visible; if (o.isMesh && o.name.startsWith('Hair_Puff')) puff ||= o.visible; }); return { short, puff, saved: JSON.parse(localStorage.getItem('dakarrek.guest.save') ?? '{}').counters?.coiffure ?? 0 }; });
  check(`${label}: the new cut shows on your character and is saved`, !look.short && look.puff && look.saved === 3, JSON.stringify(look));
  await d(() => window.__dakar.portrait(2.2, 1.5, 0.6)); await shot('salon-afro'); await d(() => window.__dakar.portrait(0));
  await d(() => window.__dakar.stand());
  }
  // ================================================================== La Vague (Ngor): the night club MVP, end to end
  if (SECTIONS.includes('club')) {
  await d(() => { const D = window.__dakar; D.teleport('almadies'); D.setHour(13); D.clubShift(0); const s = D.state; s.data.needs.energie = 100; s.data.wallet = 20000; for (const k of Object.keys(s.data.counters)) if (k.startsWith('club:')) delete s.data.counters[k]; });
  await until(() => window.__dakar.pos().hub === 'almadies' && window.__dakar.venues().some(x => x.type === 'club'));
  let c = await venue('club');
  check(`${label}: Ngor's beach has La Vague (door, floor, bar with 5 stools, lounge tables, DJ, exit)`, !!c && c.stools.length === 5 && c.lounge.length === 6 && ['door', 'floor', 'bar', 'lounge', 'dj', 'exit'].every(a => anchor(c, a)), c ? c.anchors.map(a => a.id).join(' ') : 'none');
  check(`${label}: it is one of the neighbourhood's spots`, await d(() => window.__dakar.cityPlaces().some(p => p.id === 'almadies:city:club')), '');
  // tonight becomes the week's contest night (debug shift of the city day), so one visit plays every route
  await d(n => window.__dakar.clubShift(n), c.contestIn);
  await until(() => window.__dakar.venues().find(x => x.type === 'club').moment === 'closed');
  c = await venue('club');
  check(`${label}: by day it is closed: the gate is shut, nobody inside`, !c.open && c.gateShut === true && c.npcs === 0 && c.theme === 'sabar', `${c.moment} ${c.theme} npcs=${c.npcs}`);
  await d(([p]) => window.__dakar.place(p.x, p.z, Math.PI), [W(c, 0, 14)]);
  const atDoor = await walk(() => /venue:club:door$/.test(window.__dakar.focus()?.id ?? ''), null, 30000);
  await d(() => window.__dakar.act());
  await until(() => /Fermé · ouvre à 21 h/.test(document.getElementById('toast')?.textContent ?? ''), null, 15000);
  check(`${label}: at the door by day the reason is shown (« Fermé · ouvre à 21 h »)`, atDoor && /Fermé · ouvre à 21 h/.test(await toast()) && !(await d(() => window.__dakar.activity())), await toast());
  await walk(() => false, null, 3000);
  const held = await d(() => window.__dakar.pos());
  check(`${label}: the shut gate keeps you outside`, held.z > W(c, 0, 9.5).z, `z=${held.z.toFixed(2)} gate at ${W(c, 0, 9).z.toFixed(2)}`);
  await cam(c, [10, 6, 27], [0, 1.6, 6]); await shot('club-day-gate'); await d(() => window.__dakar.cam(null));
  // the crowd follows the hour: almost empty at 21 h, building before midnight, the peak after it, thinning at dawn
  const crowd = {};
  for (const [m, h] of [['early', 21.5], ['warm', 23.5], ['peak', 1], ['dawn', 4.2]]) {
    await d(x => window.__dakar.setHour(x), h);
    await until(mm => window.__dakar.venues().find(x => x.type === 'club').moment === mm, m);
    crowd[m] = (await venue('club')).npcs;
  }
  check(`${label}: the crowd: few early, more before midnight, the peak after it, fewer at dawn`, crowd.early < crowd.warm && crowd.warm < crowd.peak && crowd.dawn < crowd.peak, JSON.stringify(crowd));
  // the door at night: « Entrer » shows the fee first; paying is a second, explicit choice
  await d(() => window.__dakar.setHour(23.5));
  await until(() => window.__dakar.venues().find(x => x.type === 'club').moment === 'warm');
  await d(([p]) => window.__dakar.place(p.x, p.z, Math.PI), [W(c, 0, 11.4)]);
  await until(() => /venue:club:door$/.test(window.__dakar.focus()?.id ?? ''), null, 20000);
  let f = await d(() => window.__dakar.focus());
  check(`${label}: at night the door offers « Entrer » and the week's programme`, f?.primary === 'Entrer' && f.all.includes('Le programme de la semaine'), f?.all.join(' | '));
  const w0 = await d(() => window.__dakar.state.wallet);
  await d(() => window.__dakar.act());
  await until(() => !!document.querySelector('#modal.on'), null, 15000);
  const ask = await modal(), wAsk = await d(() => window.__dakar.state.wallet);
  check(`${label}: the fee is shown before anything is paid`, /2\s000\sF/.test(ask ?? '') && /une seule fois pour toute la nuit/.test(ask ?? '') && wAsk === w0, (ask ?? '').slice(0, 160));
  await shot('club-door-fee');
  await pick('et entrer');
  await until(() => window.__dakar.venues().find(x => x.type === 'club').admitted && !window.__dakar.activity(), null, 30000);
  c = await venue('club');
  const w1 = await d(() => window.__dakar.state.wallet);
  check(`${label}: paid once (2 000 F): the rope is lifted for the night`, c.admitted && !c.rope && w1 === w0 - 2000 && c.counters.nights === 1, `wallet ${w0} → ${w1}, rope ${c.rope}`);
  const walkedIn = await walk(p => window.__dakar.pos().z < p.z, W(c, 0, 6), 30000);
  check(`${label}: through the gate onto the terrace, its own space (chat and presence)`, walkedIn && (await venue('club')).space === 'almadies:venue:club', JSON.stringify(await d(() => window.__dakar.pos())));
  // the dance floor: the shared timing gesture on the drum's beat, the body dances
  check(`${label}: on the floor « Danser » is offered, in the terrace's space`, await standAt(anchor(c, 'floor'), Math.PI, /venue:club:floor$/, 1.2) && (await d(() => window.__dakar.focus()?.space)) === 'almadies:venue:club', JSON.stringify(await d(() => window.__dakar.focus())));
  await d(() => window.__dakar.act());
  const played = await until(() => !!window.__dakar.gesture() && /^Dance_/.test(window.__dakar.clip() ?? ''), null, 20000);
  const gi = await d(() => ({ g: window.__dakar.gesture(), clip: window.__dakar.clip(), title: document.querySelector('#gesture .gst-title')?.textContent ?? '' }));
  check(`${label}: dancing is a timing gesture on the drum while the body dances`, played && gi.g?.kind === 'timing' && /tambour/.test(gi.title) && /^Dance_/.test(gi.clip ?? ''), JSON.stringify(gi));
  await shot('club-dance-gesture');
  await until(() => { if (window.__dakar.gesture()) window.__dakar.gestureFinish(1); return !window.__dakar.activity(); }, null, 90000);
  const cheered = await until(() => window.__dakar.venues().find(x => x.type === 'club').dancers.some(x => x?.clip === 'Celebrate') || /Rafet na/.test(document.getElementById('toast')?.textContent ?? ''), null, 30000);
  c = await venue('club');
  check(`${label}: a perfect dance counts and the crowd cheers`, c.counters.dances === 1 && cheered, `dances=${c.counters.dances}`);
  await cam(c, [1, 8, 21], [-2, 1, -3]); await shot('club-night-terrace');
  await cam(c, [3, 2.6, 2], [-3, 2.8, -7]); await shot('club-night-dj'); await d(() => window.__dakar.cam(null));
  // the contest of the sabar night, after 23 h: three rounds, faster each time
  await until(() => window.__dakar.focus()?.all.includes('Concours de danse'), null, 20000);
  const w2 = await d(() => window.__dakar.state.wallet);
  await d(() => window.__dakar.more());
  await until(() => !!document.querySelector('#modal.on'), null, 10000);
  await pickLabel('Concours de danse');
  await until(() => { const g = window.__dakar.gesture(); if (g) { window.__dakar.gestureFinish(1); window.__cr = (window.__cr ?? 0) + 1; } return !window.__dakar.activity() && (window.__cr ?? 0) > 0; }, null, 150000);
  const rounds = await d(() => window.__cr ?? 0);
  c = await venue('club');
  const w3 = await d(() => window.__dakar.state.wallet);
  check(`${label}: the dance contest: three rounds danced perfectly win 7 200 F, once a night`, w3 - w2 === 7200 && c.counters.contests === 1 && c.counters.contestNight === c.night + 1 && rounds >= 3, `+${w3 - w2} F, ${rounds} gestures`);
  // the bar: a drink seats you on a free stool
  check(`${label}: at the bar the juices are offered`, await standAt(anchor(c, 'bar'), Math.PI / 2, /venue:club:bar$/, 0.4), JSON.stringify(await d(() => window.__dakar.focus())));
  f = await d(() => window.__dakar.focus());
  check(`${label}: bissap, bouye, a fruit cocktail (no alcohol), the barman`, ['Bissap glacé', 'Jus de bouye', 'Cocktail de fruits maison', 'Parler au barman'].every(x => f?.all.includes(x)), f?.all.join(' | '));
  await d(() => window.__dakar.more());
  await until(() => !!document.querySelector('#modal.on'), null, 10000);
  await pick('Bissap glacé');
  await until(() => (window.__dakar.seated() ?? '').includes('tabouret'), null, 30000);
  const st = await d(() => ({ seat: window.__dakar.seated(), taken: window.__dakar.seatsHere().filter(s => s.id.includes('tabouret') && s.occupant && s.occupant !== 'player').map(s => s.id) }));
  check(`${label}: the drink seats you on a free stool (never a clubber's)`, (st.seat ?? '').includes('tabouret') && !st.taken.includes(st.seat) && st.taken.length >= 1, JSON.stringify(st));
  await until(() => !window.__dakar.activity(), null, 60000);
  await cam(c, [5.5, 2.2, 3.5], [10, 1.3, -1.5]); await shot('club-night-bar'); await d(() => window.__dakar.cam(null));
  await d(() => window.__dakar.stand());
  // table service in the lounge: sit at a free table, the waiter walks over with the drink
  check(`${label}: the lounge offers drinks served at the table`, await standAt(anchor(c, 'lounge'), -Math.PI / 2, /venue:club:lounge$/, 0.3), JSON.stringify(await d(() => window.__dakar.focus())));
  await d(() => window.__dakar.more());
  await until(() => !!document.querySelector('#modal.on'), null, 10000);
  await pick('Jus de bouye · à table');
  await until(() => (window.__dakar.seated() ?? '').includes('banquette'), null, 30000);
  const served = await until(() => { const v = window.__dakar.venues().find(x => x.type === 'club'), s = window.__dakar.seatsHere().find(x => x.id === window.__dakar.seated()); return !!s && Math.hypot(v.waiter.x - s.x, v.waiter.z - s.z) < 2.6; }, null, 60000);
  const tb = await d(() => ({ seat: window.__dakar.seated(), taken: window.__dakar.seatsHere().filter(s => s.id.includes('banquette') && s.occupant && s.occupant !== 'player').map(s => s.id), waiter: window.__dakar.venues().find(x => x.type === 'club').waiter }));
  check(`${label}: at a free lounge place (never a clubber's), the waiter comes to the table`, served && (tb.seat ?? '').includes('banquette') && !tb.taken.includes(tb.seat), JSON.stringify(tb));
  await cam(c, [-6, 2.6, 5], [-10.5, 1.0, -1]); await shot('club-night-lounge'); await d(() => window.__dakar.cam(null));
  await until(() => !window.__dakar.activity(), null, 60000);
  await d(() => window.__dakar.stand());
  // a word with a clubber (French and everyday Wolof)
  const tks = (await venue('club')).talkers;
  const where = tks.find(x => x.id === 'debout0') ?? tks.find(x => !x.id.startsWith('bar')) ?? tks[0];
  check(`${label}: clubbers are around to talk to`, !!where, JSON.stringify(tks));
  if (where) {
    await d(([p]) => window.__dakar.place(p.x + 1.1, p.z, -Math.PI / 2), [where]);
    const met = await until(() => /:client:/.test(window.__dakar.focus()?.id ?? ''), null, 20000);
    await d(() => window.__dakar.act());
    await until(() => !!document.querySelector('#modal.on'), null, 15000);
    const hello = await modal();
    check(`${label}: « Discuter » with a clubber: a short exchange with everyday Wolof`, met && /Moi c’est/.test(hello ?? '') && /Na nga def|Lu bees|Dama sonn/.test(hello ?? ''), (hello ?? '').slice(0, 160));
    await pick('La soirée');
    await until(() => /Ce soir, c’est/.test(document.getElementById('modal')?.textContent ?? ''), null, 10000);
    check(`${label}: the clubber talks about tonight`, /Ce soir, c’est/.test((await modal()) ?? ''), ((await modal()) ?? '').slice(0, 160));
    await closeModal();
  }
  // the DJ plays your song
  check(`${label}: at the booth, ask the DJ for a song`, await standAt(anchor(c, 'dj'), Math.PI, /venue:club:dj$/, 0.2), JSON.stringify(await d(() => window.__dakar.focus())));
  const w4 = await d(() => window.__dakar.state.wallet);
  await d(() => window.__dakar.act());
  await until(() => !window.__dakar.activity() && window.__dakar.state.wallet < w4, null, 30000);
  await until(() => /Waaw kay/.test(document.getElementById('toast')?.textContent ?? ''), null, 20000);
  check(`${label}: the song request (500 F) and the DJ's answer`, (await d(() => window.__dakar.state.wallet)) === w4 - 500 && /Waaw kay/.test(await toast()), await toast());
  // the way out: « Sortir » by the gate puts you back in the street
  check(`${label}: « Sortir » by the gate`, await standAt(anchor(c, 'exit'), 0, /venue:club:exit$/, 0.3), JSON.stringify(await d(() => window.__dakar.focus())));
  await d(() => window.__dakar.act());
  await until(p => window.__dakar.pos().z > p.z, W(c, 0, 10.5), 20000);
  await until(() => /Ñibbil ak jàmm/.test(document.getElementById('toast')?.textContent ?? ''), null, 20000);
  c = await venue('club');
  check(`${label}: back in the street (its space again), the doorman says goodnight`, c.space === null && (await d(() => window.__dakar.pos().z)) > W(c, 0, 10.5).z && /Ñibbil ak jàmm/.test(await toast()), await toast());
  // closing time never traps anyone: by day the gate opens from the inside
  await d(([p]) => { window.__dakar.setHour(13); window.__dakar.place(p.x, p.z, 0); }, [W(c, 0, 6)]);
  const left = await walk(p => window.__dakar.pos().z > p.z, W(c, 0, 10.5), 30000);
  check(`${label}: by day you can always walk out through the gate`, left && (await venue('club')).gateShut !== false, JSON.stringify(await d(() => window.__dakar.pos())));
  await d(() => window.__dakar.clubShift(0));
  }
  check(`${label}: no page errors`, errors.length === 0, errors.join(' | '));
}
await browser.close();
fs.writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 2));
console.log(`\n${results.length - failed}/${results.length} venue checks passed`);
process.exit(failed ? 1 : 0);
