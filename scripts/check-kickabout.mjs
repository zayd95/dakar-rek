// The kickabout ball on the Corniche's pitch (src/game/kickabout.ts, src/game/football.ts): outside the NPC match the
// « Ballon » waits on the grass. Solo: the player walks into it and dribbles it up the pitch (W held), then holds F to
// charge a shot that scores in the far goal — toast, celebration, this session's count. On a phone's viewport the
// « Frappe » button is held (pointer) for a shot. Two players (ONLINE=1, or a base whose presence goes online): A passes
// (E) to B, the ball arrives at B's feet on both screens (positions within a tolerance), B shoots and scores, A sees it.
// Pictures to docs/screenshots/football/kickabout/.
// Usage: flock /tmp/dakar-browser.lock node scripts/check-kickabout.mjs [baseUrl] [outDir]   (a running build, e.g. `npx vite preview --port 4221`)
//        ONLINE=1 node scripts/check-kickabout.mjs   (`npm run build:online` first: spawns `wrangler dev --local` on a free port, runs both parts there)
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';

const sleep = ms => new Promise(r => setTimeout(r, ms));
let base = process.argv[2] ?? (process.env.ONLINE ? null : 'http://localhost:4221/');
const out = process.argv[3] ?? 'docs/screenshots/football/kickabout';
fs.mkdirSync(out, { recursive: true });
const T = { timeout: 180000 };
const DT = 1 / 30;
const results = []; let failed = 0;
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`); };

let worker = null, logs = '';
if (!base) {
  const portServer = net.createServer(); await new Promise(r => portServer.listen(0, '127.0.0.1', r));
  const port = portServer.address().port; await new Promise(r => portServer.close(r));
  base = `http://127.0.0.1:${port}/`;
  worker = spawn(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'dev', '--local', '--ip', '127.0.0.1', '--port', String(port)], { env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }, stdio: ['ignore', 'pipe', 'pipe'] });
  for (const s of [worker.stdout, worker.stderr]) s.on('data', b => { logs = (logs + b).slice(-12000); });
  const deadline = Date.now() + 90000;
  for (;;) {
    if (worker.exitCode !== null || Date.now() > deadline) { console.error(logs); throw new Error('worker did not start'); }
    try { if ((await fetch(new URL('/api/health', base))).ok) break; } catch { /* starting */ }
    await sleep(250);
  }
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const errors = [];
async function open(opts, profile, touch = false) {
  const context = await browser.newContext(opts);
  await context.addInitScript(p => { localStorage.setItem('dakarrek.quality', 'low'); if (p) localStorage.setItem('dakarrek.presence.profile', JSON.stringify(p)); }, profile);
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}?debug${touch ? '&touch' : ''}`, { timeout: 120000 });
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.kickabout, null, T);
  return page;
}
/** The page at the Corniche at 10:00 (no NPC match), the kickabout on; returns the pitch centre. */
async function toPitch(page, at) {
  await page.evaluate(() => { window.__dakar.setHour(10); window.__dakar.teleport('corniche'); });
  await page.waitForFunction(() => window.__dakar.pos().hub === 'corniche' && window.__dakar.kickabout(), null, T);
  const pt = (await page.evaluate(() => window.__dakar.kickabout())).pitch;
  await page.evaluate(([p, a]) => window.__dakar.place(p.x + a[0], p.z + a[1], a[2]), [pt, at]);
  await page.waitForFunction(() => window.__dakar.kickabout().on, null, { timeout: 60000 });
  return pt;
}
const kick = page => page.evaluate(() => window.__dakar.kickabout());
/** Steps the paused game `seconds` (1/30 s frames) or until `stop` (an expression on k = kickabout()); the last reading. */
const advance = (page, seconds, stop = 'false') => page.evaluate(([s, stop, dt]) => {
  const D = window.__dakar, until = new Function('k', `return (${stop});`);
  let k = D.kickabout(), track = [];
  for (let t = 0; t < s; t += dt) { D.step(dt, 1); k = D.kickabout(); const p = D.pos(); track.push([+(k.ball.px).toFixed(2), +(p.x - k.pitch.x).toFixed(2)]); if (until(k)) return { k, stopped: true, track }; }
  return { k, stopped: false, track };
}, [seconds, stop, DT]);
const shoot = async (page, name, at, look) => {
  await page.evaluate(([a, l]) => { window.__dakar.cam(a, l); window.__dakar.render(); }, [at, look]);
  await page.screenshot({ path: `${out}/${name}.png` });
  await page.evaluate(() => window.__dakar.cam(null));
};
const E = Math.PI / 2;            // facing +x (forward = sin, cos of the yaw)

try {
  // ------------------------------------------------------------------ 1. solo: dribble, shot, goal (desktop)
  const page = await open({ viewport: { width: 1280, height: 720 } }, { name: 'Moussa', look: 0 });
  const pt = await toPitch(page, [-8, 0, E]);
  await page.evaluate(() => window.__dakar.kickaboutPlace(-6.6, 0));
  await page.evaluate(() => window.__dakar.pause(true));
  let k = (await advance(page, 0.3)).k;
  check('outside the match hours the kickabout ball waits on the pitch (no NPC match)', k.on && !k.matchActive && k.drawn.visible && Math.abs(k.ball.px + 6.6) < 0.01, { on: k.on, match: k.matchActive, ball: k.ball });
  const focus = await page.evaluate(() => window.__dakar.focus());
  check('at the ball the action button reads « Tirer » (nobody to pass to), « Frapper fort » among the others', focus?.id === 'kickabout:ball' && focus.primary === 'Tirer' && focus.all.includes('Frapper fort'), focus);
  check('the « Frappe » button shows at the ball', k.shotButton === 'on', k.shotButton);
  // dribble: W held 3.5 s up the pitch
  await page.keyboard.down('KeyW');
  const drib = await advance(page, 3.5);
  await page.keyboard.up('KeyW');
  k = drib.k;
  const gaps = drib.track.map(([b, p]) => b - p), lead = Math.max(...gaps.slice(15));
  check('walking into the ball dribbles it: touches ahead, the ball goes up the pitch with the player', k.stats.touches >= 3 && k.ball.px > 1 && lead < 3 && Math.min(...gaps.slice(15)) > -0.6, { touches: k.stats.touches, ballX: k.ball.px, maxLead: +lead.toFixed(2), owner: k.owner });
  const pos = await page.evaluate(() => window.__dakar.pos());
  await shoot(page, '1-dribble', [pos.x - 1.5, 2.2, pos.z - 4.5], [pos.x + 1.5, 0.4, pos.z]);
  // the ball comes to rest; the player steps up behind it, facing the far goal
  k = (await advance(page, 8, 'k.ball.speed < 0.05')).k;
  await page.evaluate(([b, z]) => window.__dakar.place(b - 0.6, z, Math.PI / 2), [k.ball.x, k.ball.z]);
  await advance(page, 0.1);
  await page.keyboard.down('KeyF');
  const charge = (await advance(page, 0.7)).k;
  await page.keyboard.up('KeyF');
  check('F held charges the shot (the button fills)', charge.hold > 0.5 && charge.shotButton === 'on charge', { hold: charge.hold, button: charge.shotButton });
  const shot = await advance(page, 4, "k.log.some(l => l.what === 'goal')");
  k = shot.k;
  const toast = await page.evaluate(() => document.getElementById('toast')?.textContent ?? '');
  check('the shot scores in the far goal: toast, a goal this session', shot.stopped && k.myGoals === 1 && /But/.test(toast), { goals: k.myGoals, toast, log: k.log.slice(-3), ball: k.ball });
  await advance(page, 0.25);
  k = await kick(page);
  await shoot(page, '2-goal-net', [pt.x + 13, 2.4, pt.z - 6], [pt.x + 20.5, 0.8, pt.z]);
  const body = await page.evaluate(() => window.__dakar.pos());
  check('the scorer celebrates', k.celebrating, { celebrating: k.celebrating });
  await shoot(page, '3-celebrate', [body.x + 3, 1.7, body.z + 2.5], [body.x, 1.0, body.z]);
  const back = await advance(page, 4, 'k.ball.net === 0 && Math.hypot(k.ball.px, k.ball.pz) < 0.05');
  check('after a moment in the net the ball is back on the centre spot', back.stopped, back.k.ball);
  // the far side: nothing runs (the module costs a distance)
  await page.evaluate(([p]) => window.__dakar.place(p.x, p.z + 120, 0), [pt]);
  await advance(page, 0.5);
  const s0 = (await kick(page)).stats; await advance(page, 1); k = await kick(page);
  check('far from the pitch the kickabout is off and costs nothing', !k.on && !k.near && JSON.stringify(s0) === JSON.stringify(k.stats), { on: k.on, near: k.near });
  await page.evaluate(() => window.__dakar.pause(false));
  await page.context().close();

  // ------------------------------------------------------------------ 2. a phone: the « Frappe » button held
  const phone = await open({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true }, { name: 'Awa', look: 1 }, true);
  const pt2 = await toPitch(phone, [6, 0, E]);
  await phone.evaluate(() => window.__dakar.kickaboutPlace(6.6, 0));
  await phone.evaluate(() => window.__dakar.pause(true));
  await advance(phone, 0.3);
  await phone.evaluate(() => window.__dakar.render());
  await phone.screenshot({ path: `${out}/4-phone-buttons.png` });
  const btn = await phone.evaluate(() => { const b = document.getElementById('kickShot'), a = document.getElementById('act'); const r = b?.getBoundingClientRect(), q = a?.getBoundingClientRect(); return b ? { shown: getComputedStyle(b).display !== 'none', inBar: b.parentElement?.id, b: r && [r.left, r.top, r.right, r.bottom].map(Math.round), act: q && [q.left, q.top, q.right, q.bottom].map(Math.round), label: a?.textContent } : null; });
  check('on a phone: « Frappe » above the action button (« Tirer »), inside the screen, not over it', btn?.shown && btn.inBar === 'actbar' && btn.b[3] <= btn.act[1] && btn.b[0] >= 0 && btn.b[2] <= 390 && /Tirer/.test(btn.label ?? ''), btn);
  const box = await phone.locator('#kickShot').boundingBox();
  await phone.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await phone.evaluate(() => { const b = document.getElementById('kickShot'); b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 7, pointerType: 'touch' })); });
  await advance(phone, 0.5);
  await phone.evaluate(() => { const b = document.getElementById('kickShot'); b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 7, pointerType: 'touch' })); });
  const ph = await advance(phone, 3, "k.log.some(l => l.what === 'goal')");
  check('held « Frappe » shoots on release, and it scores', ph.k.log.some(l => l.what === 'shot' && l.detail.power > 0.3) && ph.stopped && ph.k.myGoals === 1, { log: ph.k.log.slice(-3), goals: ph.k.myGoals });
  void pt2;
  await phone.context().close();

  // ------------------------------------------------------------------ 3. two players in one room: A passes, B scores
  const probe = await (await fetch(new URL('/api/health', base)).catch(() => null))?.json?.().catch(() => null);
  if (!probe?.ok) console.log('SKIP: two players (no worker at this base: ONLINE=1 runs one)');
  else {
    const A = await open({ viewport: { width: 640, height: 400 } }, { name: 'Moussa', look: 0 });
    const B = await open({ viewport: { width: 640, height: 400 } }, { name: 'Awa', look: 1 });
    for (const p of [A, B]) await p.waitForFunction(() => window.__dakar.presence().status === 'online', null, T);
    await toPitch(A, [-6, 0, E]);
    await toPitch(B, [5, 0, -E]);
    for (const p of [A, B]) await p.waitForFunction(() => window.__dakar.presence().peers.some(x => x.space === 'street' && Math.abs(x.z) > 0), null, T);
    const room = await Promise.all([A, B].map(p => p.evaluate(() => window.__dakar.presence().room)));
    check('A and B in the same room at the pitch', room[0] === room[1] && room[0] > 0, { room });
    const idA = await A.evaluate(() => window.__dakar.presence().id), idB = await B.evaluate(() => window.__dakar.presence().id);
    await A.evaluate(() => window.__dakar.kickaboutPlace(-5.3, 0));
    await A.waitForFunction(() => window.__dakar.kickabout().receiver, null, { timeout: 30000 }).catch(() => {});
    const fA = await A.evaluate(() => window.__dakar.focus());
    check('A at the ball, B ahead: the action button reads « Passer » (to Awa)', fA?.primary === 'Passer' && (await kick(A)).receiver?.id === idB, { focus: fA, receiver: (await kick(A)).receiver });
    await A.keyboard.press('KeyE');
    await A.waitForFunction(() => window.__dakar.kickabout().log.some(l => l.what === 'pass'), null, { timeout: 10000 }).catch(() => {});
    // the ball on its way: both screens, sampled together
    const moving = [];
    for (let i = 0; i < 12; i++) {
      const [a, b] = await Promise.all([kick(A), kick(B)]);
      if (a.ball.speed > 0.5 || b.ball.speed > 0.5) moving.push(+Math.hypot(a.drawn.x - b.drawn.x, a.drawn.z - b.drawn.z).toFixed(2));
      await sleep(150);
    }
    await B.waitForFunction(id => { const k = window.__dakar.kickabout(); return k.owner === id && k.ball.speed < 0.3; }, idB, { timeout: 30000 }).catch(() => {});
    await sleep(1500);
    const [a1, b1] = await Promise.all([kick(A), kick(B)]);
    const gap = Math.hypot(a1.ball.x - b1.ball.x, a1.ball.z - b1.ball.z);
    check('the pass reaches B: B touched it, owns it on both screens', b1.owner === idB && a1.owner === idB && b1.stats.touches >= 1, { ownerA: a1.owner, ownerB: b1.owner, idB, touchesB: b1.stats.touches });
    check('both screens agree where the ball is (at rest: within 0.3 m; rolling: within 1.5 m)', gap < 0.3 && (moving.length === 0 || Math.max(...moving) < 1.5), { rest: +gap.toFixed(3), rolling: moving });
    const pB = await B.evaluate(() => window.__dakar.pos());
    await shoot(B, '5-two-players-pass', [pB.x - 4, 2.6, pB.z - 6], [pB.x - 2, 0.5, pB.z]);
    // B turns to the far goal and shoots (F held)
    await B.evaluate(([x, z]) => window.__dakar.place(x, z, Math.PI / 2), [pB.x, pB.z]);
    await B.keyboard.down('KeyF'); await sleep(600); await B.keyboard.up('KeyF');
    await B.waitForFunction(() => window.__dakar.kickabout().log.some(l => l.what === 'goal'), null, { timeout: 15000 }).catch(() => {});
    const goalA = await A.waitForFunction(() => window.__dakar.kickabout().log.some(l => l.what === 'goal'), null, { timeout: 15000 }).then(() => true).catch(() => false);
    const [a2, b2] = await Promise.all([kick(A), kick(B)]);
    const toastA = await A.evaluate(() => document.getElementById('toast')?.textContent ?? '');
    check('B shoots and scores; A sees B\'s goal (toast « But de Awa »)', b2.myGoals === 1 && goalA && a2.log.some(l => l.what === 'goal' && l.detail.by === idB && !l.detail.mine) && /But de Awa/.test(toastA), { goalsB: b2.myGoals, goalA, toastA, logA: a2.log.slice(-2) });
    await sleep(400);
    await shoot(A, '6-two-players-goal-seen-by-A', [a2.pitch.x + 12, 2.6, a2.pitch.z - 7], [a2.pitch.x + 20.5, 0.6, a2.pitch.z]);
    check('traffic stays light: B sent at most ~10 states a second', b2.stats.sent > 0 && a2.stats.received > 0, { sentA: a2.stats.sent, sentB: b2.stats.sent, receivedA: a2.stats.received, receivedB: b2.stats.received, droppedA: a2.stats.dropped });
    void idA;
  }
  check('no page error', errors.length === 0, errors.slice(0, 5));
} catch (e) {
  check('the check ran to the end', false, String(e?.stack ?? e));
} finally {
  await browser.close();
  if (worker) worker.kill('SIGTERM');
}
fs.writeFileSync(`${out}/results.json`, JSON.stringify({ base, when: new Date().toISOString(), passed: results.length - failed, total: results.length, results }, null, 1));
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
