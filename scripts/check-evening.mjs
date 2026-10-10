// Habib's evening (10 Oct): a new player works in the afternoon, gets to the arena, watches the bout from the stands, then
// looks for what comes next (La Vague, Almadies). Plays the chain on the integrated build and records what a player meets
// on the way: guidance, distances, waits, prices, crowd, what is empty. Usage:
//   flock /tmp/dakar-browser.lock node scripts/check-evening.mjs [baseUrl] [outDir]      (ONLY=desktop|phone, LAMB2=1: with ?lamb2)
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:4212/';
const out = process.argv[3] ?? 'docs/screenshots/evening';
fs.mkdirSync(out, { recursive: true });
const T = { timeout: 360000 };
// LAMB2=1: the game loads with ?lamb2 (Làmb 2.0): the watched bout is avec frappe; without it, nothing changes
const L2 = process.env.LAMB2 === '1';
const results = [], notes = []; let failed = 0;
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${detail}`); };
const note = (label, k, v) => { notes.push({ view: label, k, v }); console.log(`NOTE ${label} · ${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`); };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
for (const [label0, viewport, touch] of [['desktop', { width: 1280, height: 800 }, false], ['phone', { width: 390, height: 844 }, true]]) {
  if (process.env.ONLY && process.env.ONLY !== label0) continue;
  const label = L2 ? `${label0}-lamb2` : label0;
  const page = await (await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch })).newPage();   // fresh storage: a new game
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}?debug${touch ? '&touch' : ''}${L2 ? '&lamb2' : ''}`, { timeout: 120000 });
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.arena, null, T);
  const d = (fn, arg) => page.evaluate(fn, arg);
  const shot = async name => { await page.waitForTimeout(700); try { await page.screenshot({ path: `${out}/${label}-${name}.png`, timeout: 240000 }); } catch (e) { console.log(`NOTE: capture ${name} skipped`); } };
  const idle = () => page.waitForFunction(() => !window.__dakar.activity() && window.__dakar.pos().mode === 'play', null, T).catch(() => {});
  const goal = () => d(() => document.getElementById('goal')?.textContent ?? '');
  const t0 = Date.now(), wall = () => Math.round((Date.now() - t0) / 1000);

  // 1. Afternoon, new game: where am I, what does the game suggest?
  await d(() => window.__dakar.setHour(15));
  const start = await d(() => ({ hub: window.__dakar.pos().hub, wallet: window.__dakar.state.wallet, guide: window.__dakar.guide?.() ?? null }));
  note(label, 'start', { ...start, goal: await goal() });
  check(`${label}: a new game starts in Pikine with a next step`, start.hub === 'pikine' && (await goal()).length > 4);
  await shot('01-afternoon');

  // 2. Work: three Tiak Tiak deliveries (completed through the debug API: the walking itself is covered by check-economy)
  let earned = 0;
  for (let i = 0; i < 3; i++) {
    const j = (await d(() => window.__dakar.jobs())).find(x => !x.blocked);
    if (!j) break;
    await d(id => window.__dakar.acceptJob(id, true), j.id);
    const c = await d(() => window.__dakar.completeJob());
    if (c) earned += c.paid;
  }
  note(label, 'afternoon work', { deliveries: 3, earned, wallet: await d(() => window.__dakar.state.wallet) });
  check(`${label}: the afternoon's work pays`, earned > 0, `+${earned} F`);

  // 3. Late afternoon: does anything point the player to tonight's bout?
  await d(() => window.__dakar.setHour(17.6));
  await page.waitForTimeout(1200);
  const hint = await d(() => ({ goal: document.getElementById('goal')?.textContent ?? '', toast: document.getElementById('toast')?.textContent ?? '', guide: window.__dakar.guide?.() ?? null, out: window.__dakar.arenaOut?.() ?? null, arena: window.__dakar.arena.info(), evening: window.__dakar.evening?.() ?? null }));
  note(label, 'towards the evening', { goal: hint.goal, toast: hint.toast, evening: hint.evening?.text ?? null, guide: hint.guide?.name ?? null, street: hint.arena?.street, size: hint.out?.size, event: hint.out?.event });
  // the evening's call (src/arena/eveningCall.ts): a word at the doors, then the goal line (after the welcome beat)
  check(`${label}: at 17.6 h the goal or the evening's call points to the arena`, /arène/i.test(hint.goal + ' ' + hint.toast), JSON.stringify({ goal: hint.goal, toast: hint.toast }));
  check(`${label}: tonight there is a bout at the arena (every evening)`, !!hint.out?.event || hint.arena?.street !== 'quiet', JSON.stringify({ street: hint.arena?.street, event: hint.out?.event }));
  await shot('02-before-the-bout');

  // 4. Getting there: on foot from where the player is, or by car rapide (nearest stop to the gate)
  const g = await d(() => window.__dakar.arena.info().gate ?? window.__dakar.arenaOut().gate);
  const here = await d(() => window.__dakar.pos());
  const lines = await d(() => window.__dakar.transport?.lines?.() ?? []);
  const stops = lines.flatMap(l => l.stops.map(s => ({ line: l.id, fare: l.fare, name: s.name, dist: Math.round(Math.hypot(s.x - g.x, s.z - g.z)) }))).sort((a, b) => a.dist - b.dist);
  note(label, 'getting to the arena', { walk_m: Math.round(Math.hypot(here.x - g.x, here.z - g.z)), nearestStop: stops[0] ?? null });

  // 5. The street outside at 18 h, the ticket, a place on the tiers
  await d(() => window.__dakar.setHour(18));
  await page.waitForFunction(() => window.__dakar.arena.info()?.street === 'doors', null, T).catch(() => {});
  await d(p => window.__dakar.place(p.x + 6, p.z - 15, -0.35), g);
  await page.waitForTimeout(2500);
  const street = await d(() => window.__dakar.arenaOut());
  note(label, 'outside the arena', { size: street.size, present: street.present, drawn: street.drawn, queue: street.queue, vendors: street.vendors.length });
  await shot('03-outside');
  await d(p => window.__dakar.place(p.x - 5.2, p.z - 4.35, Math.PI), g);
  await page.waitForFunction(() => /Guichet/.test(window.__dakar.focus()?.name ?? ''), null, T).catch(() => {});
  await idle(); await d(() => window.__dakar.act());
  await page.waitForFunction(() => document.querySelector('#modal.on'), null, { timeout: 30000 }).catch(() => {});
  const sheet = await d(() => document.querySelector('#modal.on')?.textContent ?? '');
  await d(() => { const b = [...document.querySelectorAll('#modal.on .item')].find(e => /Payer|Acheter|billet/i.test(e.textContent) && !e.classList.contains('dis')); b?.click(); });
  await page.waitForFunction(() => window.__dakar.arena.info().ticket, null, T).catch(() => {});
  const tk = await d(() => ({ ticket: window.__dakar.arena.info().ticket, wallet: window.__dakar.state.wallet }));
  note(label, 'ticket', { sheet: sheet.slice(0, 120), ...tk });
  check(`${label}: a ticket is bought at the window (price shown first)`, !!tk.ticket, sheet.slice(0, 80));
  await shot('04-ticket');
  const C = await d(() => window.__dakar.arena.info().centre ?? null) ?? { x: g.x, z: g.z + 14 };
  const seat = await d(c => window.__dakar.arena.freeSeat(c.x + 9, c.z - 14), C);
  if (seat) {
    await d(([c, s]) => window.__dakar.place(c.x + (s.x - c.x) * 0.92, c.z + (s.z - c.z) * 0.92, s.yaw + Math.PI), [C, seat]);
    await page.waitForFunction(() => window.__dakar.focus()?.kind === 'seat', null, T).catch(() => {});
    await d(() => window.__dakar.act());
  }
  await page.waitForFunction(() => window.__dakar.seated(), null, { timeout: 60000 }).catch(() => {});
  check(`${label}: seated on the tiers`, !!(await d(() => window.__dakar.seated())));

  // 6. The evening: crowd, entrance, bout, result (sped up once the bout runs)
  const tWait = Date.now();
  await page.waitForFunction(() => window.__dakar.arena.info().phase !== 'idle', null, T).catch(() => {});
  note(label, 'wait for the show to start (wall s)', Math.round((Date.now() - tWait) / 1000));
  await page.waitForFunction(() => { const i = window.__dakar.arena.info(); return i.phase === 'entrance'; }, null, T).catch(() => {});
  await shot('05-entrance');
  await page.waitForFunction(() => window.__dakar.arena.info().phase === 'bout', null, T).catch(() => {});
  await shot('06-bout');
  const crowd = await d(() => window.__dakar.arena.info().crowd);
  note(label, 'crowd during the bout', crowd);
  await d(() => window.__dakar.arena.speed(6));
  await page.waitForFunction(() => ['result', 'leaving', 'over'].includes(window.__dakar.arena.info().phase), null, { timeout: 300000 }).catch(() => {});
  await d(() => window.__dakar.arena.speed(1));
  const res = await d(() => ({ ...window.__dakar.arena.info(), toast: document.getElementById('toast')?.textContent ?? null }));
  note(label, 'result', { phase: res.phase, winner: res.bout?.winner ?? res.result ?? null, toast: res.toast });
  check(`${label}: the bout reaches its result`, ['result', 'leaving', 'over'].includes(res.phase), res.phase);
  const lb = res.lastBout;
  check(`${label}: the watched bout is ${L2 ? 'avec frappe (Làmb 2.0)' : 'sans frappe, as before'}`, lb?.discipline === (L2 ? 'avec_frappe' : 'sans_frappe'), JSON.stringify(lb));
  if (L2) check(`${label}: avec frappe — the referee raised the winner's arm and the stands reacted to the fall`,
    !!lb?.outcome && (!lb.winner || lb.refereeRaised === true) && (lb.outcome !== 'projection' || (lb.fallSplit?.celebrate > 0 && lb.fallSplit?.heads > 0)), JSON.stringify(lb));
  await shot('07-result');

  // 7. After the bout: what next? (La Vague is in Almadies — its lane is not integrated yet)
  await page.waitForFunction(() => window.__dakar.arena.info().phase === 'over', null, T).catch(() => {});
  await d(() => window.__dakar.act());
  await idle();
  const after = await d(() => ({ goal: document.getElementById('goal')?.textContent ?? '', hour: window.__dakar.pos().hour ?? null, places: window.__dakar.placeList().filter(p => /club|vague|night/i.test(p.id + p.name)).map(p => p.name) }));
  note(label, 'after the bout', after);
  // walked out of the gate: one place open at that hour to end the evening (src/arena/eveningCall.ts), else nothing
  const gOut = await d(() => window.__dakar.arena.info().gate ?? window.__dakar.arenaOut().gate);
  if (gOut) { await d(([x, z]) => window.__dakar.place(x, z, Math.PI), [gOut.x, gOut.z - 7]); await page.waitForTimeout(1200); }
  const next = await d(() => ({ goal: document.getElementById('goal')?.textContent ?? '', evening: window.__dakar.evening?.() ?? null }));
  note(label, 'after the bout, outside the gate', { goal: next.goal, suggestion: next.evening?.text ?? null, target: next.evening?.target?.name ?? null });
  await shot('08-after');
  note(label, 'wall time of the evening (s)', wall());
  check(`${label}: no page errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.context().close();
}
await browser.close();
fs.writeFileSync(`${out}/results.json`, JSON.stringify({ results, notes }, null, 2));
console.log(`\n${results.length - failed}/${results.length} evening checks passed`);
process.exit(failed ? 1 : 0);
