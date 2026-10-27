// LD2.0-D acceptance (docs/ld2/LD2_D.md), the brief's journey: « walk from the gate to the entrance → tour the ground floor → climb upstairs → reach the
// rooftop → visit the pool → park the SUV → furnish a room → invite another player → verify persistence ».
// Two players on the real local Workers runtime (`wrangler dev --local`, fresh state), each in a phone-sized page of the real online build; every move is a
// real touch (the joystick, the action button, the driving pad, the editor's buttons, the phone), as in scripts/check-ld2b-journey.mjs.
//   Awa (the owner): her villa bought with game money; walks from the street through the gate to the front door, round the ground floor, up both flights to
//   the roof and the helicopter, down to the pool for a swim, out to drive her Lamane Sport into its bay, furnishes the salon with the « Collection
//   Almadies » and moves a piece with the editor, invites Moussa from Messages; then reloads.
//   Moussa (the guest): accepts, comes to the villa, the gate opens for him, « Entrer chez Awa (invité) » at the front door, inside with her furniture.
// Debug hooks only set the scene (money, the villa's purchase through the game's own buyAsset, the SUV, the pieces delivered, a starting spot in the street)
// and read the state. Awa's page is recorded (video, then MP4 with ffmpeg) for the owner.
// Usage: npm run build:online && node scripts/check-ld2d.mjs [outDir=docs/proof/ld2d/acceptance]   Ports: wrangler dev 8850 (inspector 9350); LD2D_PORT.
import { chromium } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import sharp from 'sharp';
import { realTouch, walkTo, pilot } from './lib/realTouch.mjs';

const OUT = process.argv[2] || 'docs/proof/ld2d/acceptance';
const PORT = Number(process.env.LD2D_PORT || 8850);
const STATE = `/tmp/claude-0/ld2d/acceptance-state-${Date.now()}`;
const VIDEO = `/tmp/claude-0/ld2d/acceptance-video-${Date.now()}`;
const BASE = `http://127.0.0.1:${PORT}/`;
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(STATE, { recursive: true }); fs.mkdirSync(VIDEO, { recursive: true });
if (!fs.existsSync('dist/index.html')) { console.error('No build: run `npm run build:online` first.'); process.exit(2); }

const sleep = ms => new Promise(r => setTimeout(r, ms));
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok: !!ok, extra: String(extra).slice(0, 600) }); console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`, ok || !extra ? '' : String(extra).slice(0, 600)); };
// the villa's lot (src/housing/villa.ts): plan metres from the lot's centre, +z toward the street
const LOT = { cx: -18, cz: -18 }, P = (x, z) => ({ x: LOT.cx + x, z: LOT.cz + z });
const GATE = { x0: 1.5, x1: 6.5, z: 11 }, GC = P((GATE.x0 + GATE.x1) / 2, GATE.z);
const VILLA = 'villa_almadies';
// the Collection Almadies pieces Awa has delivered (lane K-L's suggested salon and suite)
const PIECES = ['canape_courbe', 'table_basse_marbre_noir', 'tapis_rond_jute', 'fauteuil_boucle', 'gueridon_marbre', 'lampadaire_champignon', 'meuble_tv_laque',
  'lustre_couronne', 'salle_manger_ronde', 'lit_capitonne_noir', 'chevet_greige', 'banc_lit', 'dressing_bronze'];

let logs = '';
const worker = spawn(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'dev', '--local', '--ip', '127.0.0.1', '--port', String(PORT), '--inspector-port', String(PORT + 500), '--persist-to', STATE],
  { env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }, stdio: ['ignore', 'pipe', 'pipe'] });
for (const s of [worker.stdout, worker.stderr]) s.on('data', b => { logs = (logs + b).slice(-20000); });
const health = async () => { const until = Date.now() + 180000; while (Date.now() < until) { if (worker.exitCode !== null) throw new Error(`wrangler exited: ${logs}`); try { if ((await fetch(`${BASE}api/health`)).ok) return; } catch { /* starting */ } await sleep(400); } throw new Error('wrangler did not answer'); };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });

/** One player in a phone-sized page with its own storage (its own device key, so its own account); `video`: the page is recorded. */
async function player(name, look, avatar, guest, video = false) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, ...(video ? { recordVideo: { dir: VIDEO, size: { width: 390, height: 844 } } } : {}) });
  await ctx.addInitScript(([name, look, avatar, guest]) => {
    try {
      if (!localStorage.getItem('dakarrek.guest.save.v6')) localStorage.setItem('dakarrek.guest.save.v6', JSON.stringify({ schemaVersion: 6, guestId: guest, avatar }));
      localStorage.setItem('dakarrek.quality', 'low');
      localStorage.setItem('dakarrek.presence.profile', JSON.stringify({ name, look }));
    } catch { /* */ }
  }, [name, look, avatar, guest]);
  const p = { name, ctx, page: null, t: null, errors: [] };
  p.open = async () => {
    const page = p.page ?? await ctx.newPage(); page.setDefaultTimeout(240000);
    if (!p.page) page.on('pageerror', e => p.errors.push(e.message));
    await page.goto(`${BASE}?debug&touch`, { timeout: 180000 });
    await page.waitForFunction(() => window.__dakar?.pos?.().hub && !document.getElementById('studio'), null, { timeout: 300000 });
    await page.waitForFunction(() => window.__dakar.presence().status === 'online' && window.__dakar.account()?.status === 'online' && !!window.__dakar.account().me, null, { timeout: 120000 });
    p.page = page; p.t = await realTouch(page); p.cdp = await ctx.newCDPSession(page);
    p.tag = await page.evaluate(() => window.__dakar.account().me.tag);
    return page;
  };
  p.d = (fn, a) => p.page.evaluate(fn, a);
  p.wait = ms => p.page.waitForTimeout(ms);
  p.until = (fn, arg, ms = 30000) => p.page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
  p.focus = () => p.d(() => window.__dakar.focus());
  p.waitFocus = (re, ms = 30000) => p.until(r => new RegExp(r).test(window.__dakar.focus()?.primary ?? ''), re.source, ms);
  const settled = () => p.page.waitForFunction(() => !document.querySelector('#phone.on')?.getAnimations({ subtree: true }).some(a => a.playState === 'running' && a.effect?.getComputedTiming?.().iterations !== Infinity), null, { timeout: 30000 }).catch(() => {});
  /** A real tap on what `find` returns (scrolled into view first), after the phone has settled. */
  p.tapWhere = async (find, arg, { settle = 450 } = {}) => {
    await p.wait(settle); await settled();
    const at = () => p.d(([src, a]) => { const el = (0, eval)(src)(a); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, out: r.top < 0 || r.bottom > innerHeight }; }, [find.toString(), arg]);
    let c = await at();
    if (c?.out) { await p.d(([src, a]) => (0, eval)(src)(a).scrollIntoView({ block: 'center', behavior: 'instant' }), [find.toString(), arg]); await p.wait(300); c = await at(); }
    for (let k = 0; k < 20 && c; k++) { await p.wait(120); const c2 = await at(); if (c2 && Math.abs(c2.y - c.y) < 1 && Math.abs(c2.x - c.x) < 1) break; c = c2; }
    if (!c) throw new Error(`${name}: nothing to tap: ${arg}`);
    await p.t.down(9, c.x, c.y); await p.wait(50); await p.t.up(9);
  };
  p.tap = sel => p.tapWhere(s => document.querySelector(s), sel);
  p.items = tag => p.d(t => window.__dakar.account().items(t).map(i => ({ ...i })), tag);
  p.sheet = () => p.d(() => (document.querySelector('#phone .mg-sheet')?.innerText ?? '').replace(/\s+/g, ' '));
  /** A picture of what the player sees now, under 400 kB. */
  p.shot = async file => {
    await p.wait(400);
    let png = await sharp(await p.page.screenshot()).png({ compressionLevel: 9 }).toBuffer();
    if (png.length > 390_000) png = await sharp(png).png({ palette: true, quality: 88, compressionLevel: 9 }).toBuffer();
    fs.writeFileSync(`${OUT}/${file}.png`, png);
  };
  return p;
}

/** Inside a home: walks to (x, z) of the house (metres from its origin) with a thumb on the joystick, re-aimed as the camera follows (check-villa-walk.mjs). */
async function walkHome(p, O, x, z, { tol = 0.3, ms = 45000 } = {}) {
  const probe = () => p.d(() => { const D = window.__dakar; return { p: D.pos(), h: D.home() }; });
  const go = async () => {
    const j = await p.t.centre('#joy'), r = 50, t0 = Date.now();
    await p.t.down(3, j.x, j.y);
    let s = await probe(), best = Infinity, bestAt = Date.now();
    while (Date.now() - t0 < ms) {
      const dx = O.x + x - s.p.x, dz = O.z + z - s.p.z, dist = Math.hypot(dx, dz);
      if (dist < tol) break;
      if (dist < best - 0.05) { best = dist; bestAt = Date.now(); } else if (Date.now() - bestAt > 12000) break;
      const a = wrap(Math.atan2(dx, dz) - s.p.cam), k = dist > 1.2 ? 0.6 : dist > 0.6 ? 0.4 : 0.25;
      await p.t.move(3, j.x - Math.sin(a) * r * k, j.y - Math.cos(a) * r * k, 1);
      await p.wait(90); s = await probe();
    }
    await p.t.up(3); await p.wait(250); s = await probe();
    return { dist: Math.hypot(O.x + x - s.p.x, O.z + z - s.p.z), room: s.h?.room ?? null, level: s.h?.level ?? null, y: s.p.y };
  };
  let r = await go();
  if (r.dist >= 0.45 && r.dist < 1.5) r = await go();                                       // a thumb corrects (a slow frame on a shared machine)
  return r;
}
/** Walks a list of legs [x, z, room?, level?]; returns the legs missed and the rooms and levels seen. */
async function tour(p, O, legs) {
  const missed = [], rooms = new Set(), levels = new Set();
  for (const [x, z, room, level] of legs) {
    const r = await walkHome(p, O, x, z);
    if (r.room) rooms.add(r.room); if (r.level) levels.add(r.level);
    if (!(r.dist < 0.45 && (!room || r.room === room) && (!level || r.level === level))) missed.push({ to: [x, z], want: [room, level], got: r });
  }
  return { missed, rooms: [...rooms], levels: [...levels] };
}
const perfHere = p => p.d(() => ({ calls: window.__dakar.drawCalls(), tris: window.__dakar.tris() }));

const A = await player('Awa', 2, 'femme', 'g-ld2d-awa', true), B = await player('Moussa', 4, 'homme', 'g-ld2d-moussa');
const perf = {};
try {
  await health();
  await A.open(); await B.open();
  check('0. two players on the local Workers runtime, each online with their own account', A.tag && B.tag && A.tag !== B.tag, JSON.stringify({ a: A.tag, b: B.tag }));

  // ------------------------------------------------------------------ the scene: Awa buys the villa with game money and makes it her home; she stands in the street
  const w0 = await A.d(() => { window.__dakar.giveMoney(1_200_000_000); return window.__dakar.state.wallet; });
  const bought = await A.d(v => { const D = window.__dakar; return !!D.buyAsset(v) && !!D.moveIn(v); }, VILLA);
  const w1 = await A.d(() => window.__dakar.state.wallet);
  const est = await A.d(() => window.__dakar.estate());
  check('the scene: Awa buys the villa for 400 000 000 F of game money (the catalogue\'s price) and makes it her principal residence', bought && w0 - w1 === 400_000_000 && est.home === VILLA && est.assets.some(a => a.spec === VILLA && a.how === 'owned'), JSON.stringify({ paid: w0 - w1, home: est.home }));
  await A.d(([x, z]) => { const D = window.__dakar; D.teleport('almadies', x, z, Math.PI); D.setHour(10.5); }, [GC.x, 2.5]);
  await A.until(() => window.__dakar.pos().hub === 'almadies' && window.__dakar.pos().mode === 'play', null, 120000); await A.wait(2500);

  // ------------------------------------------------------------------ 1. from the gate to the entrance
  await walkTo(A.page, A.t, GC.x, GC.z + 3.6, { tol: 0.5, ms: 60000 }); await A.wait(700);
  const g1 = await A.d(() => ({ g: window.__dakar.villa.gate(), p: window.__dakar.pos() }));
  await A.shot('01-gate-opening');
  await walkTo(A.page, A.t, GC.x, GC.z - 3.4, { tol: 0.6, ms: 60000 });
  const door = P(-3, 4.9);
  await walkTo(A.page, A.t, door.x + 1.2, door.z + 1.4, { tol: 0.6, ms: 60000 });
  await walkTo(A.page, A.t, door.x, door.z + 0.3, { tol: 0.5, ms: 60000 });
  const atDoor = await A.waitFocus(/Entrer chez toi/), g2 = await A.d(() => window.__dakar.villa.gate());
  await A.shot('02-front-door');
  check('1a. walking up from the street, the gate slides open for its owner; she walks through and it shuts behind her', g1.g.k > 0 && g2.k === 0 && g2.solid, JSON.stringify({ g1, g2 }));
  check('1b. « Entrer chez toi » at the front door', atDoor, JSON.stringify(await A.focus()));
  await A.t.tap('#act');
  await A.until(() => window.__dakar.home()?.plan === 'villa_almadies' && window.__dakar.pos().mode === 'play', null, 60000); await A.wait(1500);
  const view = await A.d(() => window.__dakar.homeView()), O = { x: view.ox, z: view.oz };
  const h0 = await A.d(() => window.__dakar.home());
  check('1c. inside the villa, on the ground floor, in the entrée', h0?.level === 'rdc' && h0.room === 'entree', JSON.stringify({ level: h0?.level, room: h0?.room }));

  // ------------------------------------------------------------------ 2. the ground floor
  const rdc = await tour(A, O, [[-3, 1.0, 'entree', 'rdc'], [-3, -1.5, 'salon', 'rdc'], [-4.6, -3.6, 'salon', 'rdc'], [-4.5, -5.6, 'jardin', 'rdc'], [1.7, -5.6, 'jardin', 'rdc'],
    [1.7, -4.0, 'manger', 'rdc'], [2.6, -1.0, 'manger', 'rdc'], [2.6, 0.9, 'cuisine', 'rdc'], [2.6, -1.0, 'manger', 'rdc'], [3.4, -3.85, 'manger', 'rdc'], [5.3, -3.85, 'hall', 'rdc']]);
  perf.rdc = await perfHere(A); await A.shot('03-ground-floor');
  check('2. the ground floor toured with the joystick: entrée, salon, the pool garden, salle à manger, cuisine, hall', !rdc.missed.length && ['entree', 'salon', 'jardin', 'manger', 'cuisine', 'hall'].every(r => rdc.rooms.includes(r)), JSON.stringify(rdc));

  // ------------------------------------------------------------------ 3. upstairs
  const up = await tour(A, O, [[5.15, -3.0, 'hall', 'rdc'], [5.15, -0.5], [5.15, 1.3], [5.15, 2.3, 'palier', 'etage'], [3.6, 2.6, 'salon_familial', 'etage'], [-2.4, 3.2, 'salon_familial', 'etage'],
    [-3.6, 0.3, 'salon_familial', 'etage'], [-3.6, -1.1, 'suite', 'etage'], [-4.4, -2.6, 'suite', 'etage']]);
  perf.etage = await perfHere(A); await A.shot('04-first-floor-suite');
  check('3. up the first flight to the first floor: the landing, the salon familial, the master suite', !up.missed.length && up.levels.includes('etage') && up.rooms.includes('suite'), JSON.stringify(up));

  // ------------------------------------------------------------------ 4. the rooftop
  const roof = await tour(A, O, [[-3.6, 0.4, 'salon_familial', 'etage'], [3.6, 2.6, 'salon_familial', 'etage'], [6.2, 2.4, 'palier', 'etage'], [7.15, 1.9, 'palier', 'etage'], [7.15, -0.5],
    [7.15, -3.4, 'edicule', 'toit'], [6.0, -3.9, 'edicule', 'toit'], [3.6, -3.9, 'terrasse', 'toit'], [0.6, -3.4, 'terrasse', 'toit'], [-1.0, 1.0, 'terrasse', 'toit']]);
  const heli = await A.waitFocus(/Regarder l.hélicoptère/, 15000);
  perf.toit = await perfHere(A); await A.shot('05-rooftop-helicopter');
  let heliSheet = '';
  if (heli) { await A.t.tap('#act'); await A.until(() => !!document.querySelector('#modal.on')); heliSheet = await A.d(() => document.querySelector('#modal.on')?.innerText ?? ''); await A.d(() => document.querySelector('#modal.on .item')?.click()); await A.wait(500); }
  check('4. up the second flight to the roof terrace, by the helicopter: « Regarder l\'hélicoptère » (no flight: it comes with the airport)', !roof.missed.length && roof.levels.includes('toit') && heli && /aéroport/.test(heliSheet), JSON.stringify({ roof, heli, sheet: heliSheet.slice(0, 120) }));

  // ------------------------------------------------------------------ 5. the pool
  const down = await tour(A, O, [[0.6, -3.4, 'terrasse', 'toit'], [3.6, -3.9, 'terrasse', 'toit'], [6.0, -3.9, 'edicule', 'toit'], [7.15, -3.3, 'edicule', 'toit'], [7.15, 0.0], [7.15, 2.0, 'palier', 'etage'],
    [6.2, 2.4, 'palier', 'etage'], [5.15, 2.2, 'palier', 'etage'], [5.15, 0.5], [5.15, -3.2, 'hall', 'rdc'], [5.3, -3.85, 'hall', 'rdc'], [3.4, -3.85, 'manger', 'rdc'], [1.7, -4.0, 'manger', 'rdc'], [1.7, -5.6, 'jardin', 'rdc'], [-1.0, -5.6, 'jardin', 'rdc']]);
  const n0 = await A.d(() => ({ ...window.__dakar.state.data.needs }));
  const edge = await A.waitFocus(/Se baigner/, 15000);
  if (edge) await A.t.tap('#act');
  const swimming = await A.until(() => window.__dakar.villa.swim.info().swimming, null, 20000);
  await A.until(() => window.__dakar.villa.swim.info().t > 4, null, 60000);
  const sw = await A.d(() => ({ i: window.__dakar.villa.swim.info(), y: window.__dakar.pos().y }));
  await A.shot('06-pool-swim');
  if (await A.waitFocus(/Sortir de l.eau/, 10000)) await A.t.tap('#act');
  await A.until(() => !window.__dakar.villa.swim.info().swimming && window.__dakar.pos().mode === 'play', null, 60000); await A.wait(800);
  const n1 = await A.d(() => ({ ...window.__dakar.state.data.needs }));
  check('5. down both flights to the pool: « Se baigner » at its edge, in the water swimming, « Sortir de l\'eau », cleaner', !down.missed.length && edge && swimming && sw.i.t > 2 && sw.y < 0 && n1.hygiene > n0.hygiene, JSON.stringify({ missed: down.missed, edge, sw, n0: n0.hygiene, n1: n1.hygiene }));

  // ------------------------------------------------------------------ 6. the SUV into its bay
  await tour(A, O, [[1.7, -4.0, 'manger', 'rdc'], [-3, -1.5, 'salon', 'rdc'], [-3, 2.6, 'entree', 'rdc'], [-3, 3.1, 'entree', 'rdc']]);
  const out = await A.waitFocus(/^Sortir$/, 15000);
  if (out) await A.t.tap('#act');
  await A.until(() => !window.__dakar.home() && window.__dakar.pos().hub === 'almadies' && window.__dakar.pos().mode === 'play', null, 60000); await A.wait(1500);
  await A.d(() => window.__dakar.suv.own());
  await A.until(() => window.__dakar.suv.info().owned && window.__dakar.suv.info().here, null, 30000);
  await A.d(([x, z]) => window.__dakar.suv.place(x, z, Math.PI), [GC.x, 3.2]);
  await walkTo(A.page, A.t, GC.x, GC.z - 2.2, { tol: 0.6, ms: 60000 });                       // out through the gate (it opens from inside for anyone)
  await walkTo(A.page, A.t, GC.x - 1.9, 2.6, { tol: 0.5, ms: 60000 });
  const monter = await A.waitFocus(/Monter/, 15000);
  if (monter) await A.t.tap('#act');
  await A.until(() => window.__dakar.suv.info().driving, null, 60000);
  await pilot(A.page, A.t, 'suv', [{ x: GC.x, z: -2.5, tol: 1.5, speed: 3 }, { x: GC.x, z: -9.5, tol: 1.2, speed: 2.5 }, { x: GC.x - 0.4, z: -11.2, tol: 1, speed: 2 }], { brakeAtEnd: true, cruise: 3, ms: 120000 });
  const garer = await A.until(() => /Garer à la villa/.test(document.querySelector('#ridepad.extra .rp-extra')?.textContent ?? ''), null, 20000);
  if (garer) await A.t.tap('#ridepad .rp-extra');
  await A.until(() => !window.__dakar.suv.info().driving && window.__dakar.pos().mode === 'play', null, 30000); await A.wait(1200);
  const bays = await A.d(() => window.__dakar.villa.bays()), car = await A.d(() => window.__dakar.suv.info());
  const inBay = bays.find(b => Math.hypot(b.x - car.x, b.z - car.z) < 0.05);
  await A.shot('07-suv-in-bay');
  check('6. the Lamane Sport: « Monter » in the street, driven in through the gate, « Garer à la villa »: in its bay and saved there', monter && garer && !!inBay && car.record && Math.hypot(car.record.x - car.x, car.record.z - car.z) < 0.02, JSON.stringify({ monter, garer, car: { x: car.x, z: car.z, rec: car.record } }));

  // ------------------------------------------------------------------ 7. furnish a room
  const delivered = await A.d(ids => ids.map(id => [id, !!window.__dakar.buyPiece(id)]), PIECES);
  await walkTo(A.page, A.t, door.x + 1.2, door.z + 1.4, { tol: 0.6, ms: 60000 });
  await walkTo(A.page, A.t, door.x, door.z + 0.3, { tol: 0.5, ms: 60000 });
  if (await A.waitFocus(/Entrer chez toi/, 20000)) await A.t.tap('#act');
  await A.until(() => window.__dakar.home()?.plan === 'villa_almadies' && window.__dakar.pos().mode === 'play', null, 60000); await A.wait(1500);
  await walkHome(A, O, -3, -0.8);
  const placed0 = await A.d(() => window.__dakar.homeView().pieces.map(p => ({ uid: p.uid, spec: p.spec })));
  const fa = (await A.focus())?.primary ?? '';
  if (/Aménager/.test(fa)) await A.t.tap('#act'); else await A.d(() => window.__dakar.placer.open());
  await A.until(() => window.__dakar.placer.info().open && document.querySelector('#placer.on'), null, 30000); await A.wait(700);
  const armchair = (await A.d(() => window.__dakar.placer.info().items)).find(i => i.spec === 'fauteuil_boucle');
  // its chip, as a thumb picks it: the list shows the room the editor opened on (« Toutes les pièces » for the others), and scrolls sideways
  for (let i = 0; armchair && i < 3 && (await A.d(() => window.__dakar.placer.info().selected)) !== armchair.uid; i++) {
    if (!(await A.d(uid => !!document.querySelector(`#placer [data-uid="${uid}"]`), armchair.uid))) { await A.tap('#placer [data-a="all"]'); await A.wait(500); }
    await A.d(uid => document.querySelector(`#placer [data-uid="${uid}"]`)?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'instant' }), armchair.uid); await A.wait(400);
    await A.tap(`#placer [data-uid="${armchair.uid}"]`); await A.wait(400);
  }
  const chosen = (await A.d(() => window.__dakar.placer.info().selected)) ?? null;
  const before = (await A.d(() => window.__dakar.placer.info())).pending;
  const savedAt = uid => A.d(u => { window.__dakar.save(); return JSON.parse(localStorage.getItem('dakarrek.guest.save.v6')).assets.list.find(a => a.uid === u)?.at ?? null; }, uid);
  const save0 = armchair ? await savedAt(armchair.uid) : null;
  for (const dir of ['left', 'left', 'down']) { await A.tap(`#placer [data-a="${dir}"]`); await A.wait(250); }
  const why = (await A.d(() => window.__dakar.placer.info())).why ?? null;
  await A.tap('#placer [data-a="put"]'); await A.wait(500);
  const after = (await A.d(() => window.__dakar.placer.info())).items.find(i => i.uid === armchair?.uid)?.at ?? null;
  const save1 = armchair ? await savedAt(armchair.uid) : null;
  await A.tap('#placer [data-a="done"]'); await A.wait(800);
  perf.furnished = await perfHere(A); await A.shot('08-salon-furnished');
  check('7a. the Collection Almadies delivered and set out by the game in the villa (salon, salle à manger, suite)', delivered.every(([, ok]) => ok) && placed0.length >= PIECES.length, JSON.stringify({ delivered: delivered.filter(([, ok]) => !ok), n: placed0.length }));
  check('7b. « Aménager »: the bouclé armchair chosen and moved with the editor\'s buttons, « Poser »: saved at its new spot', !!armchair && chosen === armchair.uid && !why && !!after && !!before && (after.x !== before.x || after.z !== before.z)
    && !!save0 && !!save1 && (save1.x !== save0.x || save1.z !== save0.z), JSON.stringify({ fa, chosen: chosen === armchair?.uid, before, after, why, save0, save1 }));

  // ------------------------------------------------------------------ 8. invite another player
  await A.d(t => window.__dakar.phone(`messages:${t}`), B.tag); await A.until(t => window.__dakar.phoneInfo().arg === t, B.tag);
  await A.tap('#phone .mg-plus'); await A.tap('#phone .mg-pi[data-do="invite"]');
  await A.until(() => !!document.querySelector('#phone .mg-sheet .mg-ok'));
  const invSheet = await A.sheet();
  await A.tap('#phone .mg-ok');
  await A.until(() => !document.querySelector('#phone .mg-sheet-wrap'), null, 30000);
  await A.until(t => window.__dakar.account().items(t).some(i => i.k === 'invite'), B.tag, 30000);
  const inv = (await A.items(B.tag)).filter(i => i.k === 'invite').pop();
  await A.d(() => window.__dakar.phoneClose());
  await B.d(t => window.__dakar.phone(`messages:${t}`), A.tag); await B.until(t => window.__dakar.phoneInfo().arg === t, A.tag);
  await B.until(r => !!document.querySelector(`#phone [data-key="${r}"] [data-do="accept"]`), inv?.id, 30000);
  await B.tap(`#phone [data-key="${inv.id}"] [data-do="accept"]`);
  await B.until(r => !!document.querySelector(`#phone [data-key="${r}"] [data-do="go"]`), inv.id, 30000);
  await B.tap(`#phone [data-key="${inv.id}"] [data-do="go"]`);
  await B.until(() => !window.__dakar.phoneInfo().open);
  const destB = await B.d(() => window.__dakar.destination());
  check('8a. « Inviter chez moi » from Messages names the villa; Moussa accepts and « Y aller » guides him there', inv?.home?.spec === VILLA && !!destB, JSON.stringify({ sheet: invSheet.slice(0, 140), home: inv?.home, dest: destB }));
  // he comes to the Almadies (the city's way is long: he is put in the street before the villa), then walks
  await B.d(([x, z]) => { const D = window.__dakar; D.teleport('almadies', x, z, Math.PI); D.setHour(10.5); }, [GC.x + 1, 2.5]);
  await B.until(() => window.__dakar.pos().hub === 'almadies' && window.__dakar.pos().mode === 'play', null, 120000); await B.wait(2500);
  await walkTo(B.page, B.t, GC.x, GC.z + 3.6, { tol: 0.5, ms: 60000 }); await B.wait(700);
  const gB = await B.d(() => window.__dakar.villa.gate());
  await walkTo(B.page, B.t, GC.x, GC.z - 3.4, { tol: 0.6, ms: 60000 });
  await walkTo(B.page, B.t, door.x + 1.2, door.z + 1.4, { tol: 0.6, ms: 60000 });
  await walkTo(B.page, B.t, door.x, door.z + 0.3, { tol: 0.5, ms: 60000 });
  const guestDoor = await B.waitFocus(/Entrer chez Awa \(invité\)/, 20000);
  const fB = await B.focus();
  await B.shot('09-guest-at-door');
  check('8b. the gate opens for the invited guest; at the front door « Entrer chez Awa (invité) »', gB.k > 0 && guestDoor, JSON.stringify({ gate: gB, focus: fB }));
  await B.t.tap('#act');
  const inB = await B.until(() => window.__dakar.visit.info().visiting?.inside === true && window.__dakar.pos().mode === 'play', null, 60000);
  await B.wait(2500);
  const piecesA = (await A.d(() => window.__dakar.homeView())).pieces.length, viewB = await B.d(() => window.__dakar.homeView());
  const seesB = await A.until(t => window.__dakar.presence().peers.some(p => p.tag === t && p.space.startsWith('home:')), B.tag, 30000);
  const seesA = await B.until(t => window.__dakar.presence().peers.some(p => p.tag === t && p.space === `home:${t}`), A.tag, 30000);
  await B.shot('10-guest-inside');
  check('8c. both in the villa: her furniture drawn for him (the same pieces), and each one\'s game draws the other there', inB && viewB?.pieces.length === piecesA && seesA && seesB, JSON.stringify({ inB, piecesA, piecesB: viewB?.pieces.length, seesA, seesB }));

  // ------------------------------------------------------------------ 9. persistence
  const saved = await A.d(() => { window.__dakar.save(); const s = JSON.parse(localStorage.getItem('dakarrek.guest.save.v6')); return { home: s.assets.home, list: s.assets.list.filter(a => a.kind === 'furniture' || a.spec === 'villa_almadies').map(a => ({ uid: a.uid, spec: a.spec, how: a.how, at: a.at ?? null })) }; });
  const carSaved = await A.d(() => window.__dakar.suv.info().record);
  await A.page.reload({ timeout: 180000 });
  await A.until(() => window.__dakar?.pos?.().hub && window.__dakar.estate && window.__dakar.suv?.info, null, 300000); await A.wait(2500);
  const again = await A.d(() => { const s = JSON.parse(localStorage.getItem('dakarrek.guest.save.v6')); return { home: s.assets.home, list: s.assets.list.filter(a => a.kind === 'furniture' || a.spec === 'villa_almadies').map(a => ({ uid: a.uid, spec: a.spec, how: a.how, at: a.at ?? null })) }; });
  const est2 = await A.d(() => window.__dakar.estate()), car2 = await A.d(() => window.__dakar.suv.info());
  check('9. after a reload: the villa still hers and her home, every piece where she left it (the armchair at its new spot), the Lamane Sport in its bay',
    est2.home === VILLA && JSON.stringify(again) === JSON.stringify(saved) && JSON.stringify(again.list.find(a => a.uid === armchair?.uid)?.at) === JSON.stringify(save1) && carSaved && Math.hypot(car2.x - carSaved.x, car2.z - carSaved.z) < 0.05,
    JSON.stringify({ home: est2.home, same: JSON.stringify(again) === JSON.stringify(saved), car: [car2.x, car2.z], carSaved }));
  check('no page errors in either game', !A.errors.length && !B.errors.length, JSON.stringify({ a: A.errors.slice(0, 3), b: B.errors.slice(0, 3) }));
} catch (e) {
  check('the journey went through', false, e.stack ?? String(e));
} finally {
  const video = A.page?.video();
  await A.ctx.close(); await B.ctx.close();
  await browser.close();
  worker.kill('SIGTERM');
  // the owner's run as an MP4 for the phone (H.264, even size, 2× speed: SwiftShader draws slowly)
  try {
    const raw = video && await video.path();
    if (raw && fs.existsSync(raw)) {
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-vf', 'setpts=0.5*PTS,scale=390:844', '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '30', '-movflags', '+faststart', `${OUT}/villa-playthrough.mp4`]);
      console.log('video:', `${OUT}/villa-playthrough.mp4`, Math.round(fs.statSync(`${OUT}/villa-playthrough.mp4`).size / 1000), 'kB');
    }
  } catch (e) { console.log('video conversion failed:', e.message); }
  const failed = results.filter(r => !r.ok).length;
  fs.writeFileSync(`${OUT}/results.json`, JSON.stringify({ at: new Date().toISOString(), passed: results.length - failed, failed, perf, results }, null, 2));
  console.log('PERF', JSON.stringify(perf));
  console.log(`${results.length - failed}/${results.length} passed`);
  process.exitCode = failed ? 1 : 0;
}
