// Tiak Tiak everywhere (1.0.1, src/economy/tiakOffers.ts): a phone, real touch everywhere a player touches (fingers through Chrome's input pipeline, scripts/lib/realTouch.mjs).
//  A. In each of the five districts: the phone's « Tiak Tiak » board opened with taps, at least three cards in the compact form (route / kind / pay / « Accepter », nothing else, no
//     paragraph), one run inside the district accepted with a tap; the waypoint is on the pick-up; walked there with the joystick along the streets (a way found round the built
//     colliders, re-aimed as a thumb does; a leg longer than about 170 m is cut to its last 80 m with the debug hook, said in the output); the waypoint moves to the drop-off; walked there; paid exactly the pay the card stated, once (one wallet line); the card after the
//     delivery says what was paid and offers the next run nearby (the board's run whose pick-up is nearest, wherever it goes), taken with one tap (then cancelled: nothing paid).
//  B. One delivery to another district end to end: accepted on the board, picked up on foot, the car rapide taken at the district's stop with taps (the action button, the menu),
//     handed over on foot in the other district: paid the stated pay once; the board there offers runs leaving from THAT district.
//  C. A reload in the middle of a run: the parcel is still in hand with the same pay; delivered: paid once; a second reload pays nothing more.
// What is not a player's touch, and said so: the district is changed with the debug `travelTo` between parts (a player takes the car rapide, as part B does), energy and a little money
// are set at the start (debug), and the hour is fixed by `?heure=`. Game time is the game's own clock; a headless renderer says nothing about a phone's frame rate.
// Usage: node scripts/check-tiak-everywhere.mjs <baseUrl> <outDir>   (ONLY=pikine,mermoz limits part A and skips part B; SKIP_A=1 runs parts B and C only)
import { chromium } from 'playwright';
import fs from 'node:fs';
import { realTouch } from './lib/realTouch.mjs';

const [base = 'http://127.0.0.1:4422/', out = '/tmp/claude-0/tiak-everywhere'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
let failed = 0, total = 0; const T = { timeout: 300000 };
const check = (name, ok, detail = '') => { total++; if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${detail}`); };
const HUBS = (process.env.ONLY ? process.env.ONLY.split(',') : ['pikine', 'plateau', 'mermoz', 'corniche', 'almadies']);
const NAMES = { pikine: 'Pikine', plateau: 'Plateau', mermoz: 'Mermoz · Sacré-Cœur', corniche: 'Corniche', almadies: 'Almadies · Ngor' };
const TYPES = ['Repas', 'Documents', 'Colis', 'Commande boutique', 'Express'];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
await context.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'low'); } catch { /* */ } });
const page = await context.newPage(); page.setDefaultTimeout(300000);
const errors = []; page.on('pageerror', e => errors.push(e.message));
const d = (fn, a) => page.evaluate(fn, a);
let shotN = 0; const shot = async n => { await page.waitForTimeout(250); await page.screenshot({ path: `${out}/${String(++shotN).padStart(2, '0')}-${n}.png` }); };
const ready = () => page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.pos().mode === 'play' && window.__dakar.board, null, T);
const wallet = () => d(() => window.__dakar.state.wallet);
const job = () => d(() => window.__dakar.activeJob());
const tiakLines = async () => (await d(() => window.__dakar.ledger())).filter(l => /Livraison Tiak Tiak/.test(l.label));
const money = text => Number(text.replace(/[^\d]/g, ''));
const stats = { runs: [] };

/** A way on foot from the player to within `reach` m of (x, z), round the district's built colliders (1 m cells, grown by the walker's width): the points a thumb aims at, one after the other. */
async function wayTo(x, z, reach = 2.2, cellsOnly = false) {
  const { me, cols } = await d(() => ({ me: window.__dakar.pos(), cols: window.__dakar.cityGeometry().colliders.map(c => [c.x0, c.z0, c.x1, c.z1]) }));
  const H = 200, N = 2 * H;
  const cell = (px, pz) => Math.floor(pz + H) * N + Math.floor(px + H), start = cell(me.x, me.z);
  // the colliders grown by a walker's margin; where the courier stands in a tight spot (a kiosk's tables), the way starts from the open ground around them, and the
  // margin narrows if no way is found with the wider one
  for (const R of [0.75, 0.5, 0.35]) {
    const blocked = new Uint8Array(N * N);
    for (const [x0, z0, x1, z1] of cols) for (let j = Math.max(0, Math.floor(z0 - R + H)); j <= Math.min(N - 1, Math.floor(z1 + R + H)); j++) for (let i = Math.max(0, Math.floor(x0 - R + H)); i <= Math.min(N - 1, Math.floor(x1 + R + H)); i++) {
      const cx = i - H + 0.5, cz = j - H + 0.5; if (cx > x0 - R && cx < x1 + R && cz > z0 - R && cz < z1 + R) blocked[j * N + i] = 1;
    }
    const prev = new Int32Array(N * N).fill(-1), queue = [start]; prev[start] = start;
    for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
      const k = cell(me.x + dx, me.z + dz); if (prev[k] < 0 && !blocked[k] && Math.hypot(dx, dz) <= 3) { prev[k] = k; queue.push(k); }
    }
    let goal = -1;
    for (let q = 0; q < queue.length; q++) {
      const k = queue[q], i = k % N, j = Math.floor(k / N);
      if (Math.hypot(i - H + 0.5 - x, j - H + 0.5 - z) < reach) { goal = k; break; }
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= N || b >= N) continue;
        const n = b * N + a; if (prev[n] >= 0 || blocked[n]) continue;
        if (di && dj && (blocked[j * N + a] || blocked[b * N + i])) continue;                      // no cutting a corner
        prev[n] = k; queue.push(n);
      }
    }
    if (goal < 0) continue;
    const cells = []; for (let k = goal; ; k = prev[k]) { cells.unshift(k); if (prev[k] === k) break; }
    const pts = cells.map(k => ({ x: (k % N) - H + 0.5, z: Math.floor(k / N) - H + 0.5 }));
    const clear = (p, q) => { const n = Math.ceil(Math.hypot(q.x - p.x, q.z - p.z) / 0.4); for (let t = 0; t <= n; t++) if (blocked[cell(p.x + ((q.x - p.x) * t) / n, p.z + ((q.z - p.z) * t) / n)]) return false; return true; };
    if (cellsOnly) return pts;
    const way = []; let from = { x: me.x, z: me.z };
    for (let i = 0; i < pts.length;) { let j = Math.min(pts.length - 1, i + 40); while (j > i && !clear(from, pts[j])) j--; way.push(pts[j]); from = pts[j]; i = j + 1; }
    return way;
  }
  console.log(`  (no way found on foot from ${me.x.toFixed(1)},${me.z.toFixed(1)} to ${x.toFixed(1)},${z.toFixed(1)})`);
  return null;
}
/**
 * On foot to (x, z) with the joystick, as scripts/lib/realTouch.mjs `walkTo` does (the stick pushed the way the target lies from the camera, re-aimed as the camera follows), but
 * as a courier in a hurry: the thumb at the stick's edge (the run) until the last metres, then a walk.
 */
async function stickTo(x, z, { tol = 1.1, ms = 60000, finger = 3 } = {}) {
  const j = await touch.centre('#joy'), t0 = Date.now(), wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  await touch.down(finger, j.x, j.y);
  let dist = Infinity;
  while (Date.now() - t0 < ms) {
    const p = await d(() => window.__dakar.pos());
    dist = Math.hypot(x - p.x, z - p.z); if (dist < tol) break;
    const a = wrap(Math.atan2(x - p.x, z - p.z) - p.cam), r = dist > 7 ? 48 : 28;
    await touch.move(finger, j.x - Math.sin(a) * r, j.y - Math.cos(a) * r, 1);
    await page.waitForTimeout(90);
  }
  await touch.up(finger);
  return dist;
}
/**
 * A long way to a place is shortened (debug `place`, said in the output): the courier is put on the way, `keep` m before the place, and walks the rest with the joystick.
 * SwiftShader runs the game several times slower than a phone, so a leg of more than about 170 m is cut to its last 80 m.
 */
async function bringNear(place, keep = 80) {
  const cells = await wayTo(place.x, place.z, 2.2, true);
  if (!cells || cells.length <= 170) return 0;
  const p = cells[cells.length - keep], q = cells[cells.length - keep + 3];
  await d(([x, z, yaw]) => window.__dakar.place(x, z, yaw), [p.x, p.z, Math.atan2(q.x - p.x, q.z - p.z)]);
  await page.waitForTimeout(600);
  return cells.length - keep;
}
/** Walk to a place with the joystick along that way, until `until()` holds (the game took the parcel / paid) or the place is reached. Re-plans when the walker is held up. */
async function walkToPlace(place, until) {
  const t0 = Date.now(), g0 = await d(() => window.__dakar.state.data.playedMs), m0 = await d(() => window.__dakar.pos());
  let metres = 0, last = m0;
  for (let plan = 0; plan < 6; plan++) {
    const way = await wayTo(place.x, place.z);
    if (!way) break;
    for (const p of way) {
      await stickTo(p.x, p.z);
      const me = await d(() => window.__dakar.pos()); metres += Math.hypot(me.x - last.x, me.z - last.z); last = me;
      if (process.env.VERBOSE) console.log(`  walk plan ${plan} → ${p.x.toFixed(1)},${p.z.toFixed(1)} at ${me.x.toFixed(1)},${me.z.toFixed(1)} mode ${me.mode} ${((Date.now() - t0) / 1000).toFixed(0)} s`);
      if (await d(until)) return { ok: true, metres, wallMs: Date.now() - t0, gameMs: (await d(() => window.__dakar.state.data.playedMs)) - g0 };
      if (Math.hypot(me.x - p.x, me.z - p.z) > 2.5) break;                                       // held up (a passer-by, a stall): find the way again from here
    }
    if (await page.waitForFunction(until, null, { timeout: 4000 }).then(() => true, () => false)) return { ok: true, metres, wallMs: Date.now() - t0, gameMs: (await d(() => window.__dakar.state.data.playedMs)) - g0 };
  }
  return { ok: false, metres, wallMs: Date.now() - t0, gameMs: 0 };
}
/** The phone's « Tiak Tiak » app, opened with taps. */
async function openBoard() {
  await touch.tap('#menuBtn'); await page.waitForFunction(() => window.__dakar.phoneInfo().open, null, T);
  await touch.tap('#phone [data-nav="home"]'); await page.waitForTimeout(300);
  await touch.tap('#phone [data-app="travail"]'); await page.waitForSelector('#modal.on', T);
  await page.waitForTimeout(300);
}
/**
 * The board as the player sees it: the phone's « Tiak Tiak » opened with taps, its cards, and what the game says of each (`__dakar.board()`), read together. The board
 * turns with the city's day and hour (a city day is 24 real minutes): a board that turned between being drawn and being read is closed and opened again, as a player
 * would see a new list. A card already on screen stays valid (its id describes its run), so nothing here waits on the clock.
 */
async function boardNow() {
  for (let k = 0; k < 4; k++) {
    await openBoard();
    const snap = await d(() => ({ ids: [...document.querySelectorAll('#modal.on .dcard.job')].map(e => e.dataset.route), board: window.__dakar.board() }));
    if (snap.ids.length && snap.ids.every(id => snap.board.some(b => b.id === id))) return { cards: await cardsNow(), board: snap.board };
    console.log('  (the board turned while it was being read: opened again)');
    await touch.tap('#modal.on .sh-x'); await page.waitForFunction(() => !document.querySelector('#modal.on'), null, { timeout: 30000 }).catch(() => {});
    if (await d(() => window.__dakar.phoneInfo().open)) await touch.tap('#phone [data-nav="close"]');
    await page.waitForFunction(() => window.__dakar.pos().mode === 'play' && !window.__dakar.phoneInfo().open, null, { timeout: 30000 }).catch(() => {});
  }
  throw new Error('the board kept turning');
}
/** The cards on the open board, as a player reads them. */
const cardsNow = () => d(() => [...document.querySelectorAll('#modal.on .dcard.job')].map(e => {
  const r = e.getBoundingClientRect(), parts = [...e.querySelector('.face').children].map(c => c.textContent.trim());
  return { route: e.dataset.route, parts, h: Math.round(r.height), right: Math.round(r.right), dis: e.classList.contains('dis'), extra: e.querySelectorAll('p, small, .chip, .dbadge').length };
}));
const compact = c => c.parts.length === 4 && / → /.test(c.parts[0]) && TYPES.includes(c.parts[1].replace(/^★ /, '')) && /^\d[\d\s]*\sF$/.test(c.parts[2]) && c.parts[3] === 'Accepter' && c.extra === 0;
/**
 * Tap a card or a row of the open sheet with one finger: brought to the middle of the sheet (the sheet keeps its sticky title over the top of its list, and may open
 * scrolled where the last sheet was left), tapped once it is still and is what lies under its own centre. Returns what was under the finger.
 */
async function tapInSheet(loc) {
  await loc.evaluate(e => e.scrollIntoView({ block: 'center' }));
  let box = null, mine = false;
  for (let k = 0; k < 40; k++) {
    await page.waitForTimeout(150);
    // the sheet's own slide-in and scroll must be over: at a few frames a second two reads can see the same frame of a moving sheet
    const moving = await page.evaluate(() => (document.querySelector('#modal')?.getAnimations({ subtree: true }) ?? []).some(a => a.playState === 'running'));
    const b = moving ? null : await loc.boundingBox();
    mine = !!b && await loc.evaluate((e, [x, y]) => { const h = document.elementFromPoint(x, y); return !!h && (h === e || e.contains(h)); }, [b.x + b.width / 2, b.y + b.height / 2]);
    if (b && box && mine && Math.abs(b.y - box.y) < 0.5) { box = b; break; }
    if (b) box = b;
  }
  box ??= await loc.boundingBox();
  if (!mine) console.log('  (the row was not under the finger when it was tapped)');
  await touch.down(5, box.x + box.width / 2, box.y + box.height / 2); await page.waitForTimeout(60); await touch.up(5);
  return mine;
}
const tapCard = route => tapInSheet(page.locator(`#modal.on .dcard.job[data-route="${route}"]`).first());
const placeOf = async id => (await d(() => window.__dakar.interactables())).find(i => i.id === id);
const pointByName = async name => { const p = (await d(() => window.__dakar.tiakPoints())).find(q => q.name === name); return p?.place ?? null; };
const goHub = async h => {
  if ((await d(() => window.__dakar.pos().hub)) !== h) { await d(x => { window.__dakar.travelTo(x); }, h); await page.waitForFunction(x => window.__dakar.pos().hub === x && window.__dakar.pos().mode === 'play', h, T); }
  await page.waitForTimeout(1500);
  await d(() => { const n = window.__dakar.state.data.needs; n.energie = 100; n.faim = 100; });   // debug: a rested courier in every district (the checks are about the board, not the needs)
};
/** One run from the board to its hand-over on foot: the card's stated pay, the waypoint at both stages, the wallet and the ledger. */
async function deliver(label, info, cards, { stay = true } = {}) {
  const route = info.id, card = cards.find(c => c.route === route), stated = money(card.parts[2]);
  const w0 = await wallet(), l0 = (await tiakLines()).length;
  await tapCard(route);
  await page.waitForFunction(r => window.__dakar.activeJob()?.routeId === r, route, { timeout: 90000 }).catch(() => {});
  const j = await job();
  check(`${label}: a tap on the card takes the run (go and fetch the parcel), at the pay the card states`, j?.routeId === route && j.stage === 'pickup' && info.payNow === stated, JSON.stringify({ card: card.parts, job: j }));
  await page.waitForFunction(() => window.__dakar.pos().mode === 'play', null, { timeout: 60000 }).catch(() => {});
  await page.waitForFunction(id => window.__dakar.destination() === id, info.fromPlace, { timeout: 60000 }).catch(() => {});
  const pick = await placeOf(info.fromPlace), mk = await d(() => window.__dakar.marker());
  check(`${label}: the waypoint is on the pick-up (${info.from}) at once`, (await d(() => window.__dakar.destination())) === info.fromPlace && mk.visible && Math.hypot(mk.x - pick.x, mk.z - pick.z) < 0.6, JSON.stringify({ dest: await d(() => window.__dakar.destination()), mk }));
  await shot(`${label}-accepted`);
  const skipped = await bringNear(pick);
  if (skipped) console.log(`  (${label}: put ${skipped} m nearer the pick-up with the debug hook; the last 80 m are walked)`);
  const leg1 = await walkToPlace(pick, () => window.__dakar.activeJob()?.stage === 'deliver');
  check(`${label}: walked to the pick-up with the joystick: the parcel is in hand`, leg1.ok && (await job())?.stage === 'deliver' && (await wallet()) === w0, JSON.stringify({ m: Math.round(leg1.metres), gameS: Math.round(leg1.gameMs / 1000) }));
  return { stated, info, w0, l0, leg1, runId: j?.runId, stay };
}
async function handOver(label, run, drop) {
  await page.waitForFunction(id => window.__dakar.destination() === id, drop.id, { timeout: 60000 }).catch(() => {});
  check(`${label}: the waypoint moves to the drop-off (${run.info.to})`, (await d(() => window.__dakar.destination())) === drop.id, String(await d(() => window.__dakar.destination())));
  const skipped = await bringNear(drop);
  if (skipped) console.log(`  (${label}: put ${skipped} m nearer the drop-off with the debug hook; the last 80 m are walked)`);
  const leg2 = await walkToPlace(drop, () => !window.__dakar.activeJob());
  const w1 = await wallet(), lines = await tiakLines();
  check(`${label}: handed over on foot: paid exactly the stated ${run.stated} F, once (one wallet line)`, leg2.ok && !(await job()) && w1 - run.w0 === run.stated && lines.length === run.l0 + 1 && lines[0].amount === run.stated, JSON.stringify({ paid: w1 - run.w0, stated: run.stated, lines: lines.length - run.l0 }));
  stats.runs.push({ label, route: run.info.id, pay: run.stated, metres: run.info.metres, walked: Math.round(run.leg1.metres + leg2.metres), pickupS: Math.round(run.leg1.gameMs / 1000), deliverS: Math.round(leg2.gameMs / 1000), limitS: Math.round(run.info.limitMs / 1000) });
  return { w1, leg2 };
}

await page.goto(`${base}?debug&touch&heure=10`, { timeout: 180000 });
await ready();
const touch = await realTouch(page);
await d(() => { window.__dakar.giveMoney(20000); });                                             // debug: the car rapide's fares between the districts of this check

// ---- A. every district: the board, one run inside the district, the next offer
for (const h of process.env.SKIP_A ? [] : HUBS) {
  const L = NAMES[h];
  await goHub(h);
  const { cards, board } = await boardNow();
  await shot(`${h}-board`);
  check(`${L}: the board lists at least three runs (${cards.length})`, cards.length >= 3 && cards.every(c => !c.dis), cards.map(c => c.parts[0]).join(' | '));
  check(`${L}: every card is compact: route / kind / pay / « Accepter », nothing else`, cards.length > 0 && cards.every(compact), JSON.stringify(cards.filter(c => !compact(c)).map(c => c.parts)));
  const paragraphs = await d(() => [...document.querySelectorAll('#modal.on .dlv p, #modal.on .dlv .dtip')].filter(p => p.offsetParent !== null).length);
  check(`${L}: no tutorial paragraph on the board; cards a thumb can tap, inside the screen`, paragraphs === 0 && cards.every(c => c.h >= 56 && c.right <= 390), JSON.stringify({ paragraphs, h: cards.map(c => c.h) }));
  const points = await d(() => window.__dakar.tiakPoints());
  check(`${L}: every run leaves from this district, from a place built here; a run to another district only where a road goes`, board.every(b => b.fromPlace && b.fromPlace.startsWith(h + ':')) && points.every(p => p.place) && board.some(b => b.toHub !== h), JSON.stringify(points.filter(p => !p.place).map(p => p.id)));
  const local = board.filter(b => b.toHub === h && !b.recommended).sort((p, q) => p.metres - q.metres)[0];      // the shortest of the runs inside the district
  const run = await deliver(L, local, cards);
  const drop = await pointByName(local.to);
  const done = await handOver(L, run, drop);
  // the card after the delivery: the pay, and the next run nearby in one tap. « Nearby » is the game's rule (src/economy/ui.ts nextNearby): of this district's
  // board, the run whose PICK-UP is nearest the courier, wherever it goes (a run to another district leaving from where the parcel was handed over is the nearest)
  await page.waitForSelector('#toast .mo.bc .bc-go', { timeout: 60000 }).catch(() => {});
  // read and tapped at once: the card stays 12 s on screen, and a screenshot of SwiftShader on a loaded machine can take longer than that (it comes after the tap)
  const after = await d(done => {
    const c = document.querySelector('#toast .mo.bc'); if (!c) return null;
    const k = window.__dakar, at = k.pos(), pts = Object.fromEntries(k.tiakPoints().filter(p => p.place).map(p => [p.place.id, p.place]));
    const near = k.board().filter(b => b.id !== done && !b.blocked && pts[b.fromPlace]).map(b => ({ id: b.id, m: Math.round(Math.hypot(pts[b.fromPlace].x - at.x, pts[b.fromPlace].z - at.z)) }));
    return { text: c.innerText.replace(/\s+/g, ' '), go: c.querySelector('.bc-go')?.innerText.replace(/\s+/g, ' ') ?? null, near };
  }, local.id);
  if (after?.go) await touch.tap('#toast .mo.bc .bc-go');
  await shot(`${h}-next-taken`);
  await page.waitForFunction(() => window.__dakar.activeJob(), null, { timeout: 90000 }).catch(() => {});
  // the reward as a phone shows it since the 1.0.1 HUD pass: « Livraison réussie · +1 150 F » on the title's line (the « Payé » row is the wider screens')
  const shown = money(after?.text.match(/(?:Payé|\+)\s*([\d\s]+F)/)?.[1] ?? ''), taken = (await job())?.routeId ?? null;
  const offered = after?.near.find(n => n.id === taken), nearest = Math.min(...(after?.near ?? []).map(n => n.m));
  check(`${L}: the card after the delivery shows the reward and offers the next run nearby (the board's nearest pick-up)`, !!after && shown === run.stated && / → /.test(after.go ?? '') && /Accepter/.test(after.go ?? '') && !!offered && offered.m <= nearest + 2,
    JSON.stringify({ text: after?.text, shown, stated: run.stated, taken, offered, nearest }));
  // its guidance, on the next frames: the walking marker on its pick-up, or on its drop-off here; a parcel already in hand for another district is guided by the
  // delivery line, which then names that district (the driving directions take over on the way: src/game/navigation.ts)
  const guided = () => page.evaluate(([names]) => {
    const j = window.__dakar.activeJob(); if (!j) return null;
    const to = /^t:[a-z]+\.[a-z]+>([a-z]+)\./.exec(j.routeId)?.[1] ?? j.hub, line = document.querySelector('#delivery.on')?.textContent ?? '';
    return window.__dakar.destination() ? 'marker' : j.stage === 'deliver' && to !== j.hub && line.includes(names[to]) ? `line: ${names[to]}` : null;
  }, [{ pikine: 'Pikine', plateau: 'Plateau', corniche: 'Corniche', almadies: 'Almadies', mermoz: 'Mermoz' }]);
  await page.waitForFunction(() => !!window.__dakar.activeJob() && (!!window.__dakar.destination() || !!document.querySelector('#delivery.on')), null, { timeout: 60000 }).catch(() => {});
  let guide = null; for (let k = 0; k < 40 && !(guide = await guided()); k++) await page.waitForTimeout(250);
  const next = await job();
  check(`${L}: one tap takes the next run, leaving from this district, guided at once; nothing more is paid`, !!next && next.hub === h && next.runId !== run.runId && (await wallet()) === done.w1 && !!guide, JSON.stringify({ next, guide, wallet: await wallet(), was: done.w1, was1: run.runId }));
  await d(() => window.__dakar.cancelJob());
  check(`${L}: that run cancelled: no payment`, !(await job()) && (await wallet()) === done.w1);
}

// ---- B. one delivery to another district, end to end (the car rapide between the two)
if (!process.env.ONLY) {
  await goHub('corniche');
  // the ride of this hour's board with the most time to spare (the car rapide's journey counts on the run's clock: a short hop to the next district would arrive late that way)
  const { cards, board } = await boardNow();
  const ride = board.filter(b => b.toHub !== 'corniche').sort((p, q) => q.limitMs - p.limitMs)[0], card = cards.find(c => c.route === ride.id);
  check('Between districts: the board offers a ride to another district, by its two districts', !!card && compact(card) && card.parts[0].startsWith('Corniche → '), JSON.stringify(card?.parts));
  await shot('between-board');
  const run = await deliver('Between districts', ride, cards);
  // to the stop, the action button, the car rapide's menu, the district of the drop-off
  const stop = (await d(() => window.__dakar.interactables())).find(i => i.id === 'corniche:station');
  await bringNear(stop);
  const toStop = await walkToPlace(stop, () => window.__dakar.focus()?.id === 'corniche:station');
  await touch.tap('#act'); await page.waitForSelector('#modal.on', T); await page.waitForTimeout(300);
  await shot('between-car-rapide');
  // the car rapide's row for that district (« ≈ 25 min de route »; the rows on foot say « de marche »), tapped once it has stopped moving (the sheet scrolls to it first)
  const word = { plateau: 'Plateau', almadies: 'Almadies', pikine: 'Pikine', mermoz: 'Mermoz', corniche: 'Corniche' }[ride.toHub];
  const row = page.locator('#modal.on .item:not(.close)').filter({ hasText: 'min de route' }).filter({ hasText: word }).first();
  console.log(`  the car rapide sheet opened scrolled by ${await d(() => document.querySelector('#modal .panel')?.scrollTop ?? null)} px`);
  console.log(`  the car rapide row under the finger: ${await tapInSheet(row)}`);
  await page.waitForFunction(() => window.__dakar.pos().mode !== 'menu', null, { timeout: 60000 }).catch(() => {});
  console.log('  after the tap: ' + JSON.stringify(await d(() => ({ mode: window.__dakar.pos().mode, hub: window.__dakar.pos().hub, modal: !!document.querySelector('#modal.on') }))));
  await page.waitForFunction(h => window.__dakar.pos().hub === h && window.__dakar.pos().mode === 'play', ride.toHub, T).catch(() => {});
  await page.waitForTimeout(1500);
  const fare = run.w0 - (await wallet()), hubNow = await d(() => window.__dakar.pos().hub);
  check(`Between districts: the car rapide taken with taps at the stop; in ${ride.toHub} with the parcel, nothing paid yet`, toStop.ok && hubNow === ride.toHub && (await job())?.stage === 'deliver' && fare > 0, JSON.stringify({ hub: hubNow, fare, job: await job() }));
  if (hubNow !== ride.toHub) throw new Error(`not in ${ride.toHub} (in ${hubNow}): the rest of part B cannot run`);
  const drop = await pointByName(ride.to);
  run.w0 -= fare;
  const done = await handOver('Between districts', run, drop);
  await shot('between-delivered');
  const there = await d(() => window.__dakar.board());
  check(`Between districts: the board there offers runs leaving from ${ride.toHub} (nobody is sent back)`, there.length >= 3 && there.every(b => b.fromPlace?.startsWith(ride.toHub + ':')), there.map(b => b.title).join(' | '));
  void done;
}

// ---- C. a reload in the middle of a run
{
  await d(() => { window.__dakar.cancelJob(); window.__dakar.setHour(10); });
  await goHub('mermoz');
  const { cards, board } = await boardNow(), local = board.filter(b => b.toHub === 'mermoz').sort((p, q) => p.metres - q.metres)[0];
  const run = await deliver('Reload', local, cards);
  const before = await job();
  await d(() => window.__dakar.save());
  await page.reload(); await ready(); await page.waitForTimeout(2000);
  const back = await job();
  check('Reload mid-run: the parcel is still in hand, the same run at the same pay, nothing paid', !!back && back.runId === before.runId && back.stage === 'deliver' && back.pay === before.pay && (await wallet()) === run.w0 && (await d(() => window.__dakar.pos().hub)) === 'mermoz', JSON.stringify({ before, back }));
  const touch2 = await realTouch(page); Object.assign(touch, touch2);
  const drop = await pointByName(local.to);
  const done = await handOver('Reload', run, drop);
  await d(() => window.__dakar.save());
  await page.reload(); await ready(); await page.waitForTimeout(2000);
  check('Reloaded after the delivery: no parcel, nothing paid twice (one wallet line for the run)', !(await job()) && (await wallet()) === done.w1 && (await tiakLines()).length === run.l0 + 1, JSON.stringify({ wallet: await wallet(), was: done.w1 }));
  check('… and the same run handed over again pays nothing', (await d(id => window.__dakar.completeJob(id), before.runId)) === null && (await wallet()) === done.w1);
}
check('no JavaScript error', errors.length === 0, errors.slice(0, 3).join(' | '));
fs.writeFileSync(`${out}/runs.json`, JSON.stringify(stats, null, 2));
console.log('RUNS ' + JSON.stringify(stats.runs));
await browser.close();
console.log(`${total - failed}/${total} passed`);
process.exit(failed ? 1 : 0);
