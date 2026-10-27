// LD2.0-D round 2, lane R2-E (docs/ld2/LD2_D.md « Round 2: the owner's review »): the villa's main entrance for people, on phone pages with REAL touches
// (scripts/lib/realTouch.mjs), two players on the real local Workers runtime (`wrangler dev --local`, fresh state), as in scripts/check-ld2d.mjs.
//  A. Awa, the owner (the villa bought with game money, her principal residence; her Lamane Sport parked in bay 1): from the pavement she walks up to the main
//     entrance, the door swings open before she reaches it; she walks through and straight up the path to the front door, never in a bay nor behind the car;
//     the door shuts behind her; « Entrer chez toi » at the front door, and she is in her villa.
//  B. Moussa, a stranger to the villa (no invitation): the door stays shut, he stays on the pavement.
//  C. Awa invites him from Messages, he accepts: the door opens for him, the path, « Entrer chez Awa (invité) » at the front door, and he is in.
//  D. Pictures (docs/proof/ld2d/r2-entrance/, PNG < 400 kB): the entrance from the street by day and at 21 h, from above, the door open, a walker on the path;
//     with a second URL, the same views on the build before the entrance (`before-*`).
// Debug hooks only set the scene (money, the villa's purchase through the game's own buyAsset, the SUV, a starting spot in the street) and read the state.
// Usage: npm run build:online && node scripts/check-villa-entrance.mjs [outDir=docs/proof/ld2d/r2-entrance] [beforeUrl]
//   Ports: wrangler dev ENTRANCE_PORT (default 4993; its inspector 4994).
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import sharp from 'sharp';
import { realTouch, walkTo } from './lib/realTouch.mjs';

const OUT = process.argv[2] || 'docs/proof/ld2d/r2-entrance', BEFORE = process.argv[3] || '';
const PORT = Number(process.env.ENTRANCE_PORT || 4993);
const STATE = `/tmp/claude-0/r2e/entrance-state-${Date.now()}`;
const BASE = `http://127.0.0.1:${PORT}/`;
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(STATE, { recursive: true });
if (!fs.existsSync('dist/index.html')) { console.error('No build: run `npm run build:online` first.'); process.exit(2); }

const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`, ok || !extra ? '' : String(extra).slice(0, 700)); };
// the villa's lot (src/housing/villa.ts): plan metres from the lot's centre, +z toward the street
const LOT = { cx: -18, cz: -18 }, P = (x, z) => ({ x: LOT.cx + x, z: LOT.cz + z }), L = (x, y, z) => [LOT.cx + x, y, LOT.cz + z];
const ENTRANCE = { x0: -3.8, x1: -2.2, z: 11 }, EX = (ENTRANCE.x0 + ENTRANCE.x1) / 2 + 0.15;   // the way through, beside the open leaf
const FRONT_DOOR = { x: -3, z: 4 }, BAYS = [{ x: 3.1, z: 7.3 }, { x: 6.1, z: 7.3 }];
const VILLA = 'villa_almadies';
const inBay = ([x, z]) => BAYS.some(b => Math.abs(x - LOT.cx - b.x) < 1.3 + 0.5 && Math.abs(z - LOT.cz - b.z) < 2.7 + 0.5);   // a body (0.5 m) touching a bay

let logs = '';
const worker = spawn(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'dev', '--local', '--ip', '127.0.0.1', '--port', String(PORT), '--inspector-port', String(PORT + 1), '--persist-to', STATE],
  { env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }, stdio: ['ignore', 'pipe', 'pipe'] });
for (const s of [worker.stdout, worker.stderr]) s.on('data', b => { logs = (logs + b).slice(-20000); });
const health = async () => { const until = Date.now() + 180000; while (Date.now() < until) { if (worker.exitCode !== null) throw new Error(`wrangler exited: ${logs}`); try { if ((await fetch(`${BASE}api/health`)).ok) return; } catch { /* starting */ } await sleep(400); } throw new Error('wrangler did not answer'); };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });

/** One player in a phone-sized page with its own storage (its own device key, so its own account), online (scripts/check-ld2d.mjs). */
async function player(name, look, avatar, guest) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await ctx.addInitScript(([name, look, avatar, guest]) => {
    try {
      if (!localStorage.getItem('dakarrek.guest.save.v6')) localStorage.setItem('dakarrek.guest.save.v6', JSON.stringify({ schemaVersion: 6, guestId: guest, avatar }));
      localStorage.setItem('dakarrek.quality', 'medium');
      localStorage.setItem('dakarrek.presence.profile', JSON.stringify({ name, look }));
    } catch { /* */ }
  }, [name, look, avatar, guest]);
  const p = { name, ctx, page: null, t: null, errors: [] };
  p.open = async () => {
    const page = await ctx.newPage(); page.setDefaultTimeout(240000);
    page.on('pageerror', e => p.errors.push(e.message));
    await page.goto(`${BASE}?debug&touch`, { timeout: 180000 });
    await page.waitForFunction(() => window.__dakar?.pos?.().hub && !document.getElementById('studio'), null, { timeout: 300000 });
    await page.waitForFunction(() => window.__dakar.presence().status === 'online' && window.__dakar.account()?.status === 'online' && !!window.__dakar.account().me, null, { timeout: 300000 });
    p.page = page; p.t = await realTouch(page);
    p.tag = await page.evaluate(() => window.__dakar.account().me.tag);
  };
  p.d = (fn, a) => p.page.evaluate(fn, a);
  p.wait = ms => p.page.waitForTimeout(ms);
  p.until = (fn, arg, ms = 30000) => p.page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
  p.focus = () => p.d(() => window.__dakar.focus());
  p.waitFocus = (re, ms = 30000) => p.until(r => new RegExp(r).test(window.__dakar.focus()?.primary ?? ''), re.source, ms);
  const settled = () => p.page.waitForFunction(() => !document.querySelector('#phone.on')?.getAnimations({ subtree: true }).some(a => a.playState === 'running' && a.effect?.getComputedTiming?.().iterations !== Infinity), null, { timeout: 30000 }).catch(() => {});
  /** A real tap on a selector's element (scrolled into view first), after the phone has settled. */
  p.tap = async sel => {
    await p.wait(450); await settled();
    const at = () => p.d(s => { const el = document.querySelector(s); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, out: r.top < 0 || r.bottom > innerHeight }; }, sel);
    let c = await at();
    if (c?.out) { await p.d(s => document.querySelector(s).scrollIntoView({ block: 'center', behavior: 'instant' }), sel); await p.wait(300); c = await at(); }
    for (let k = 0; k < 20 && c; k++) { await p.wait(120); const c2 = await at(); if (c2 && Math.abs(c2.y - c.y) < 1 && Math.abs(c2.x - c.x) < 1) break; c = c2; }
    if (!c) throw new Error(`${name}: nothing to tap: ${sel}`);
    await p.t.down(9, c.x, c.y); await p.wait(50); await p.t.up(9);
  };
  p.items = tag => p.d(t => window.__dakar.account().items(t).map(i => ({ ...i })), tag);
  /** Where the player walks, sampled every 100 ms in the page (hub x, z). */
  p.trail = { start: () => p.d(() => { window.__trail = []; clearInterval(window.__trailT); window.__trailT = setInterval(() => { const q = window.__dakar.pos(); window.__trail.push([q.x, q.z]); }, 100); }),
    stop: () => p.d(() => { clearInterval(window.__trailT); return window.__trail; }) };
  return p;
}
/** A picture of the view `cam` (or of the player's own camera), under 400 kB; the game paused while it is drawn when `still`. */
async function shot(page, file, cam, still = true) {
  const d = (fn, a) => page.evaluate(fn, a);
  if (still) await d(() => window.__dakar.pause(true));
  if (cam) await d(c => { window.__dakar.cam(c.p, c.t); window.__dakar.render(); }, cam);
  await page.waitForTimeout(still ? 500 : 1200);
  const buf = await page.screenshot();
  if (still) await d(() => window.__dakar.pause(false));
  if (cam) await d(() => window.__dakar.cam(null));
  let png = await sharp(buf).png({ compressionLevel: 9 }).toBuffer();
  if (png.length > 390_000) png = await sharp(buf).png({ palette: true, quality: 88, compressionLevel: 9 }).toBuffer();
  fs.writeFileSync(`${OUT}/${file}.png`, png);
  return png.length;
}
// the views pictured, the same before and after (hub coordinates)
const VIEWS = {
  'street-day': { p: L(1.5, 2.2, 16.5), t: L(-3.6, 2.0, 10) },
  'street-wide': { p: L(16.5, 5.2, 25.5), t: L(0.5, 3, 4) },
  'above': { p: L(-1, 24, 20), t: L(-1, 0, 4.5) },
  'walker': { p: L(EX + 2.6, 4.2, 15.2), t: L(EX - 0.6, 0.9, 6.5) },
};

const A = await player('Awa', 2, 'femme', 'g-r2e-awa'), B = await player('Moussa', 4, 'homme', 'g-r2e-moussa');
try {
  await health();
  await A.open(); await B.open();
  check('0. two players on the local Workers runtime, each online with their own account', A.tag && B.tag && A.tag !== B.tag, JSON.stringify({ a: A.tag, b: B.tag }));

  // ------------------------------------------------------------------ A. the owner walks in by the main entrance
  const w0 = await A.d(() => { window.__dakar.giveMoney(1_200_000_000); return window.__dakar.state.wallet; });
  const bought = await A.d(v => { const D = window.__dakar; return !!D.buyAsset(v) && !!D.moveIn(v); }, VILLA);
  const w1 = await A.d(() => window.__dakar.state.wallet);
  check('the scene: Awa buys the villa (400 000 000 F of game money) and makes it her principal residence', bought && w0 - w1 === 400_000_000 && (await A.d(() => window.__dakar.villa.hold())) === 'owned', JSON.stringify({ paid: w0 - w1 }));
  const start = P(-9.5, 12.7);
  await A.d(([x, z]) => { const D = window.__dakar; D.teleport('almadies', x, z, Math.PI / 2); D.setHour(10.5); }, [start.x, start.z]);
  await A.until(() => window.__dakar.pos().hub === 'almadies' && window.__dakar.pos().mode === 'play', null, 120000); await A.wait(2500);
  // her Lamane Sport in bay 1 (the car she no longer has to walk behind)
  await A.d(() => window.__dakar.suv.own());
  await A.until(() => window.__dakar.suv.info().owned && window.__dakar.suv.info().here, null, 30000);
  const bay1 = await A.d(() => window.__dakar.villa.bays()[0]);
  await A.d(b => window.__dakar.suv.place(b.x, b.z, b.yaw), bay1); await A.wait(800);
  const d0 = await A.d(() => window.__dakar.villa.entrance());
  check('the main entrance stands shut and solid before anyone comes; the gate too', d0?.k === 0 && d0.solid === 'shut' && (await A.d(() => window.__dakar.villa.gate().k)) === 0, JSON.stringify(d0));
  await A.trail.start();
  // along the pavement to the door: it swings open before she reaches it
  const front = P(EX, ENTRANCE.z + 1.7);
  await walkTo(A.page, A.t, front.x, front.z, { tol: 0.45, ms: 60000 });
  const a1 = await A.d(() => ({ e: window.__dakar.villa.entrance(), p: window.__dakar.pos(), gate: window.__dakar.villa.gate() }));
  check('A1. walking up from the pavement, the door swings open for its owner before she reaches it (the car gate stays shut)', a1.e.k > 0.5 && a1.p.z > LOT.cz + ENTRANCE.z && a1.gate.k === 0, JSON.stringify(a1));
  await A.until(() => window.__dakar.villa.entrance().solid === 'open', null, 5000);
  await shot(A.page, 'after-door-open', { p: L(EX + 2.4, 2.1, 16.2), t: L(EX - 0.4, 1.5, 10.2) });
  // through it, and straight up the path; a picture of her on it
  const mid = P(EX, 8.2);
  await walkTo(A.page, A.t, mid.x, mid.z, { tol: 0.45, ms: 60000 });
  const a2 = await A.d(() => ({ e: window.__dakar.villa.entrance(), p: window.__dakar.pos() }));
  check('A2. she walks through it onto the path, inside the walls', a2.p.z < LOT.cz + 9 && a2.p.x > LOT.cx - 4 && a2.p.x < LOT.cx - 2, JSON.stringify(a2));
  await shot(A.page, 'after-walker', VIEWS.walker);
  const door = P(FRONT_DOOR.x, FRONT_DOOR.z + 1.1);
  await walkTo(A.page, A.t, door.x, door.z, { tol: 0.4, ms: 60000 });
  const trail = await A.trail.stop();
  const atDoor = await A.waitFocus(/Entrer chez toi/);
  check('A3. « Entrer chez toi » at the front door', atDoor, JSON.stringify(await A.focus()));
  const off = trail.filter(([x, z]) => z < LOT.cz + ENTRANCE.z - 0.3 && (x < LOT.cx - 4.05 || x > LOT.cx - 1.95));
  check(`A4. the way in never touches a bay nor goes behind the car: ${trail.length} steps sampled, all inside the walls on the path (ENTRY_WALK)`, trail.length > 20 && !trail.some(inBay) && off.length === 0, JSON.stringify({ n: trail.length, inBay: trail.filter(inBay).slice(0, 3), off: off.slice(0, 3) }));
  const shutBehind = await A.until(() => { const e = window.__dakar.villa.entrance(); return e.k === 0 && e.solid === 'shut'; }, null, 15000);
  check('A5. the door shuts behind her, solid again', shutBehind, JSON.stringify(await A.d(() => window.__dakar.villa.entrance())));
  await A.t.tap('#act');
  const inA = await A.until(() => window.__dakar.villa.inside() === 'almadies:home:villa' && window.__dakar.pos().mode === 'play', null, 60000);
  check('A6. …and she is in her villa', inA && await A.d(() => window.__dakar.villa.inOwnVilla()), JSON.stringify(await A.d(() => ({ inside: window.__dakar.villa.inside(), own: window.__dakar.villa.inOwnVilla() }))));

  // ------------------------------------------------------------------ B. a stranger: kept out
  const sB = P(EX, ENTRANCE.z + 1.9);
  await B.d(([x, z]) => { const D = window.__dakar; D.teleport('almadies', x, z, Math.PI); D.setHour(10.5); }, [sB.x, sB.z]);
  await B.until(() => window.__dakar.pos().hub === 'almadies' && window.__dakar.pos().mode === 'play', null, 120000); await B.wait(2500);
  check('B0. Moussa does not hold the villa and has no invitation to it', (await B.d(() => window.__dakar.villa.hold())) === null);
  const inB0 = P(EX, 8.2);
  await walkTo(B.page, B.t, inB0.x, inB0.z, { tol: 0.5, ms: 15000 });
  const b1 = await B.d(() => ({ e: window.__dakar.villa.entrance(), p: window.__dakar.pos() }));
  check('B1. for a stranger the door stays shut and he stays on the pavement', b1.e.k === 0 && b1.e.solid === 'shut' && b1.p.z > LOT.cz + ENTRANCE.z + 0.35, JSON.stringify(b1));
  await shot(B.page, 'after-stranger-kept-out', null, false);

  // ------------------------------------------------------------------ C. the invited guest
  await A.d(t => window.__dakar.phone(`messages:${t}`), B.tag); await A.until(t => window.__dakar.phoneInfo().arg === t, B.tag);
  await A.tap('#phone .mg-plus'); await A.tap('#phone .mg-pi[data-do="invite"]');
  await A.until(() => !!document.querySelector('#phone .mg-sheet .mg-ok'));
  await A.tap('#phone .mg-ok');
  await A.until(() => !document.querySelector('#phone .mg-sheet-wrap'), null, 30000);
  await A.until(t => window.__dakar.account().items(t).some(i => i.k === 'invite'), B.tag, 30000);
  const inv = (await A.items(B.tag)).filter(i => i.k === 'invite').pop();
  await A.d(() => window.__dakar.phoneClose());
  await B.d(t => window.__dakar.phone(`messages:${t}`), A.tag); await B.until(t => window.__dakar.phoneInfo().arg === t, A.tag);
  await B.until(r => !!document.querySelector(`#phone [data-key="${r}"] [data-do="accept"]`), inv?.id, 30000);
  await B.tap(`#phone [data-key="${inv.id}"] [data-do="accept"]`);
  await B.until(r => !!document.querySelector(`#phone [data-key="${r}"] [data-do="go"]`), inv.id, 30000);
  await B.d(() => window.__dakar.phoneClose());
  await B.until(() => !window.__dakar.phoneInfo().open, null, 10000);
  check('C0. Awa invites Moussa to her villa from Messages, he accepts', inv?.home?.spec === VILLA, JSON.stringify(inv?.home));
  await B.wait(1600);                                                                     // (the villa reads the invitations once a second)
  await B.trail.start();
  const c1 = await (async () => { const f = P(EX, ENTRANCE.z + 1.7); await walkTo(B.page, B.t, f.x, f.z, { tol: 0.45, ms: 30000 }); await B.wait(500); return B.d(() => ({ e: window.__dakar.villa.entrance(), p: window.__dakar.pos() })); })();
  check('C1. now the door opens for the invited guest', c1.e.k > 0.5, JSON.stringify(c1));
  await walkTo(B.page, B.t, mid.x, mid.z, { tol: 0.45, ms: 60000 });
  await walkTo(B.page, B.t, door.x, door.z, { tol: 0.4, ms: 60000 });
  const trailB = await B.trail.stop();
  const guestDoor = await B.waitFocus(/Entrer chez Awa \(invité\)/, 20000);
  check('C2. up the path to the front door (never in a bay): « Entrer chez Awa (invité) »', guestDoor && !trailB.some(inBay), JSON.stringify({ focus: await B.focus(), inBay: trailB.filter(inBay).slice(0, 3) }));
  await shot(B.page, 'after-guest-at-door', null, false);
  await B.t.tap('#act');
  const inB = await B.until(() => window.__dakar.visit.info().visiting?.inside === true && window.__dakar.pos().mode === 'play', null, 60000);
  check('C3. …and he is in Awa\'s villa, her guest', inB, JSON.stringify(await B.d(() => window.__dakar.visit.info())));

  check('no page errors in either game', !A.errors.length && !B.errors.length, JSON.stringify({ a: A.errors.slice(0, 3), b: B.errors.slice(0, 3) }));
} catch (e) {
  check('the checks went through', false, e.stack ?? String(e));
} finally {
  await A.ctx.close(); await B.ctx.close();
}

// ------------------------------------------------------------------ D. pictures of the entrance, its cost (a third page: nobody at the door)
/** A page of the build at `url` in the Almadies, the villa its owner's, her Lamane Sport in bay 1; `label`: the pictures' prefix. */
async function camera(url, label) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'medium'); } catch { /* */ } });
  const page = await ctx.newPage(); page.setDefaultTimeout(240000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const d = (fn, a) => page.evaluate(fn, a);
  await page.goto(`${url}?debug&touch&argent=999000000`, { timeout: 180000 });
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub, null, { timeout: 300000 });
  await d(v => { const D = window.__dakar; D.buyAsset(v); D.moveIn(v); }, VILLA);
  const w = P(-8, 6.5);
  await d(([x, z]) => { window.__dakar.teleport('almadies', x, z, Math.PI); window.__dakar.setHour(10.5); }, [w.x, w.z]);
  await page.waitForFunction(() => window.__dakar.pos().hub === 'almadies' && window.__dakar.pos().mode === 'play', null, { timeout: 120000 }); await page.waitForTimeout(2500);
  // her Lamane Sport in bay 1
  await d(() => window.__dakar.suv.own());
  await page.waitForFunction(() => window.__dakar.suv.info().owned && window.__dakar.suv.info().here, null, { timeout: 30000 }).catch(() => {});
  const b1 = await d(() => window.__dakar.villa.bays()[0]);
  await d(b => window.__dakar.suv.place(b.x, b.z, b.yaw), b1);
  await d(([x, z]) => window.__dakar.place(x, z, Math.PI), [w.x, w.z]); await page.waitForTimeout(1200);
  return { ctx, page, d, errors, label };
}
async function views(c, walker) {
  const { page, d, label } = c;
  // the walker: after, on the path; before, as the owner walked in: from the gate, past the bays and behind her car
  await d(([x, z, yaw]) => window.__dakar.place(x, z, yaw), walker); await page.waitForTimeout(1500);
  await shot(page, `${label}-walker`, VIEWS.walker);
  await d(([x, z]) => window.__dakar.place(x, z, Math.PI), [P(-8, 6.5).x, P(-8, 6.5).z]); await page.waitForTimeout(800);
  for (const [hour, tag] of [[10.5, 'day'], [21, '21h']]) {
    await d(h => window.__dakar.setHour(h), hour); await page.waitForTimeout(2500);
    for (const [name, cam] of Object.entries(VIEWS)) if (name !== 'walker' && !(tag === '21h' && name === 'above')) await shot(page, `${label}-${name.replace('-day', '')}-${tag}`, cam);
  }
  await d(() => window.__dakar.setHour(10.5)); await page.waitForTimeout(1500);
  await shot(page, `${label}-above-day`, VIEWS.above);
}
try {
  const c = await camera(BASE, 'after');
  await views(c, [P(EX, 8.0).x, P(EX, 8.0).z, Math.PI]);
  // the cost of the compound on this phone page (medium): its group, and the entrance's two meshes, in a view of the entrance
  const cost = await c.d(() => {
    const D = window.__dakar, g = D.three.scene.getObjectByName('villa-compound'); if (!g) return null;
    D.pause(true); D.cam([-14, 4, -2], [-21, 1.5, -9]); D.render(); const all = { calls: D.drawCalls(), tris: D.tris() };
    g.visible = false; D.render(); const without = { calls: D.drawCalls(), tris: D.tris() }; g.visible = true;
    const e = g.getObjectByName('villa-entrance'), dm = g.getObjectByName('villa-entrance-door');
    e.visible = dm.visible = false; D.render(); const noEntrance = { calls: D.drawCalls(), tris: D.tris() }; e.visible = dm.visible = true;
    const tri = m => (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
    let meshes = 0; g.traverse(o => { if (o.isMesh) meshes++; });
    D.render(); D.cam(null); D.pause(false);
    return { compound: { meshes, calls: all.calls - without.calls, tris: all.tris - without.tris }, entrance: { calls: all.calls - noEntrance.calls, tris: all.tris - noEntrance.tris, stoneTris: tri(e), doorTris: tri(dm) } };
  });
  check(`D1. the compound costs at most 25 draw calls, the main entrance 2: ${JSON.stringify(cost)}`, cost && cost.compound.calls <= 25 && cost.entrance.calls <= 2, JSON.stringify(cost));
  fs.writeFileSync(`${OUT}/cost.json`, JSON.stringify(cost, null, 1));
  check('no page errors on the pictures\' page', !c.errors.length, JSON.stringify(c.errors.slice(0, 3)));
  await c.ctx.close();
  if (BEFORE) {
    const b = await camera(BEFORE, 'before');
    await views(b, [P(1.3, 9.4).x, P(1.3, 9.4).z, Math.PI * 1.15]);
    await b.ctx.close();
  }
} catch (e) {
  check('the pictures', false, e.stack ?? String(e));
} finally {
  worker.kill('SIGTERM');
}
await browser.close();
for (const f of fs.readdirSync(OUT).filter(f => f.endsWith('.png'))) { const n = fs.statSync(`${OUT}/${f}`).size; check(`picture ${f} under 400 kB`, n < 400_000, `${Math.round(n / 1024)} kB`); }
const failed = results.filter(r => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
fs.writeFileSync(`${OUT}/results.json`, JSON.stringify({ results }, null, 1));
process.exit(failed ? 1 : 0);
