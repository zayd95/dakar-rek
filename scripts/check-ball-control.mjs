// The player's ball control on the Corniche's pitch, in the REAL game with REAL touch: acquire → dribble straight → turn → slalom → stop → pass → regain → shoot
// (a real goal, counted once) → shoot wide (play goes on) → leave. Fingers go through Chrome's input pipeline (CDP touch: the joystick, the action button « Passer »,
// the held « Frappe »). The game loop is paused and stepped one 1/60 s frame at a time (__dakar.pause / step), so physics runs at a phone's 60 fps whatever the
// headless renderer's speed; the thumb re-aims every 6 frames (0.1 s), as a thumb does. The ball and the body are read from the game's own state every frame.
// No iPhone is involved: this is Chromium (SwiftShader) with touch emulation.
// Usage: node scripts/check-ball-control.mjs <baseUrl> <outDir>
import { chromium } from 'playwright';
import fs from 'node:fs';
import { realTouch } from './lib/realTouch.mjs';

const [base = 'http://127.0.0.1:4640/', out = '/tmp/claude-0/ball/run'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const T = { timeout: 300000 };
let failed = 0, total = 0;
const log = {};
const check = (name, ok, detail = '') => { total++; if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${detail}`); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
await context.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'low'); } catch { /* */ } });
// a virtual clock for the stepped game: the game's shared clock (the ball keeps its pace even when frames are slow, football.ts) reads Date / performance time, and the
// real-time gaps of the script's own round trips would otherwise be played as one long frame. Once the loop is paused, time only advances with each stepped frame.
await context.addInitScript(() => {
  const pn = performance.now.bind(performance), dn = Date.now.bind(Date), V = window.__vclock = { on: false, vt: 0, vt0: 0, d0: 0 };
  performance.now = () => (V.on ? V.vt : pn());
  Date.now = () => (V.on ? V.d0 + (V.vt - V.vt0) : dn());
});
const page = await context.newPage(); page.setDefaultTimeout(300000);
const errors = []; page.on('pageerror', e => errors.push(e.message));
const d = (fn, a) => page.evaluate(fn, a);
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
let shotN = 0; const shot = async n => { await d(() => window.__dakar.render()); await page.screenshot({ path: `${out}/${String(++shotN).padStart(2, '0')}-${n}.png` }); };

await page.goto(`${base}?debug&touch&heure=11`, { timeout: 180000 });                  // 11:00: no NPC match, the kickabout ball is the pitch's
await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.kickabout, null, T);
await d(() => window.__dakar.teleport('corniche', -84, -3, 0));
await page.waitForFunction(() => window.__dakar.pos().hub === 'corniche' && window.__dakar.pos().mode === 'play', null, T);
await page.waitForTimeout(1500);
const P = (await d(() => window.__dakar.football())).pitch;
const goalX = P.x + P.hx;
const t = await realTouch(page);
const joy = await t.centre('#joy');

// the paused game, stepped 1/60 s at a time; each frame's ball and body, as arrays: [ball x, ball z, body x, body z, body pace, touches, goals, ball pace, ball in net]
await d(() => {
  const D = window.__dakar;
  D.pause(true);
  const V = window.__vclock; V.vt = performance.now(); V.vt0 = V.vt; V.d0 = Date.now(); V.on = true;
  window.__bc = { run(n) { const o = []; for (let i = 0; i < n; i++) { V.vt += 1000 / 60; const s = D.step(1 / 60, 1), k = D.kickabout(); o.push([k.ball.x, k.ball.z, s.x, s.z, s.speed, k.stats.touches, k.myGoals, k.ball.speed, k.ball.net]); } return o; } };
});
const S = [], marks = []; let clock = 0;
const mark = name => marks.push([+clock.toFixed(3), name]);
const frames = async n => { const o = await d(n => window.__bc.run(n), n); for (const f of o) { clock += 1 / 60; S.push({ t: clock, bx: f[0], bz: f[1], px: f[2], pz: f[3], pace: f[4], touches: f[5], goals: f[6], bv: f[7], net: f[8], dist: Math.hypot(f[0] - f[2], f[1] - f[3]) }); } return S[S.length - 1]; };
const last = () => S[S.length - 1];
const since = t0 => S.filter(s => s.t >= t0);
/** The left thumb: the stick pushed toward world (tx, tz) with `push` of its travel, relative to the camera. */
async function thumb(tx, tz, push) {
  const p = await d(() => window.__dakar.pos());
  const a = wrap(Math.atan2(tx - p.x, tz - p.z) - p.cam), R = push * 50;
  const x = joy.x - Math.sin(a) * R, y = joy.y - Math.cos(a) * R;
  if (!t.fingers.has(3)) await t.down(3, joy.x, joy.y);
  await t.move(3, x, y, 1);
}
const release = async () => { if (t.fingers.has(3)) await t.up(3); };
/** Thumb toward a world point for `secs` of game time (re-aimed every 6 frames); `until(frame)` may end it early. Returns the time it ran. */
async function steer(point, push, secs, until) {
  const t0 = clock;
  while (clock - t0 < secs) {
    const tgt = typeof point === 'function' ? point(last()) : point;
    await thumb(tgt[0], tgt[1], push);
    const f = await frames(6);
    if (until && until(f)) break;
  }
  return clock - t0;
}
const heading = (yaw, dist = 30) => f => [f.px + Math.sin(yaw) * dist, f.pz + Math.cos(yaw) * dist];
const E = Math.PI / 2;
const within = (frames, lim) => frames.filter(f => f.dist <= lim).length / Math.max(1, frames.length);
const put = async (px, pz, yaw, bx, bz) => {                                               // a set-up, labelled: the player and the ball put on the grass
  await release();
  await d(([x, z, y, a, b]) => { window.__dakar.place(x, z, y); window.__dakar.kickaboutPlace(a, b); }, [P.x + px, P.z + pz, yaw, bx, bz]);
  await frames(20);
};

// ---------------------------------------------------------------- 1. acquire
mark('acquire');
await put(-14, 0, E, -8, 3);
await shot('start');
const t1 = clock, n1 = last()?.touches ?? 0;
await steer(f => [S.at(-1).bx, S.at(-1).bz], 0.75, 8, f => f.touches > n1);
const acq = last().touches > n1 ? clock - t1 : -1;
check('acquire: running to a loose ball (to the side), the first touch comes', acq > 0 && acq < 6, `at ${acq.toFixed(2)} s`);
const w1 = clock;
await steer([P.x + 30, P.z], 0.75, 2);
check('acquire: carried on toward the goal, the ball stays within a stride', within(since(w1), 1.6) >= 0.97, JSON.stringify({ within1_6: +within(since(w1), 1.6).toFixed(2), max: +Math.max(...since(w1).map(f => f.dist)).toFixed(2) }));

// ---------------------------------------------------------------- 2. dribble straight: walk, jog, sprint
const straight = {};
for (const [name, push, secs] of [['walk', 0.55, 2.4], ['jog', 0.75, 2.4], ['sprint', 1, 2.2]]) {
  mark(`dribble ${name}`);
  await put(-19, 0, E, -18.2, 0);
  await steer(heading(E), push, 0.7);
  const w = clock; const n0 = last().touches;
  await steer(heading(E), push, secs);
  const win = since(w), tch = last().touches - n0;
  straight[name] = { max: +Math.max(...win.map(f => f.dist)).toFixed(2), within1: +within(win, 1).toFixed(2), touchesPerS: +(tch / secs).toFixed(1), pace: +last().pace.toFixed(1) };
  check(`dribble straight at a ${name}: the ball stays within a stride and the touches have a human cadence`, straight[name].max <= 1.6 && straight[name].within1 >= 0.9 && tch / secs >= 1 && tch / secs <= 7, JSON.stringify(straight[name]));
}
log.straight = straight;
await shot('dribble');

// ---------------------------------------------------------------- 3. turns and a slalom
const turns = {};
for (const [name, turn] of [['45°', Math.PI / 4], ['90°', Math.PI / 2], ['−90°', -Math.PI / 2], ['180°', Math.PI]]) {
  mark(`turn ${name}`);
  await put(-17, 0, E, -16.2, 0);
  await steer(heading(E), 0.75, 2.2);
  const w = clock;
  await steer(heading(E + turn), 0.75, 2.5);
  const win = since(w);
  turns[name] = { max: +Math.max(...win.map(f => f.dist)).toFixed(2), within1_6: +within(win, 1.6).toFixed(2) };
  check(`turn ${name} at a jog: the ball goes with the player`, turns[name].max <= 2.2 && turns[name].within1_6 >= 0.95, JSON.stringify(turns[name]));
}
log.turns = turns;
mark('slalom');
await put(-19, 0, E, -18.2, 0);
await steer(heading(E), 0.75, 2.2);
const ws = clock;
for (let i = 0; i < 6; i++) await steer(heading(E + (i % 2 ? 0.8 : -0.8)), 0.75, 1);
log.slalom = { within1_6: +within(since(ws), 1.6).toFixed(2), max: +Math.max(...since(ws).map(f => f.dist)).toFixed(2) };
check('slalom (±0.8 rad each second): the ball stays with the player', log.slalom.within1_6 >= 0.95 && log.slalom.max <= 2.4, JSON.stringify(log.slalom));
await shot('slalom');

// ---------------------------------------------------------------- 4. stop
const stops = {};
for (const [name, push, secs] of [['a jog', 0.75, 3], ['a sprint', 1, 2]]) {
  mark(`stop from ${name}`);
  await put(-19, 0, E, -18.2, 0);
  await steer(heading(E), push, secs);
  await release();
  await frames(150);
  stops[name] = { ballPace: +last().bv.toFixed(2), dist: +last().dist.toFixed(2) };
  check(`stop from ${name}: the ball ends at rest at the foot`, last().bv < 0.3 && last().dist <= 1.8, JSON.stringify(stops[name]));
}
log.stops = stops;

// ---------------------------------------------------------------- 5. pass (« Passer »), 6. regain
mark('pass');
await put(-6, -8, 0, -6, -7.2);                                                           // facing +z (the pass is a straight punt without a receiver: not at the goal)
await steer(heading(0), 0.75, 1.5);
await release(); await frames(60);
const focus = await d(() => window.__dakar.focus()?.id ?? null);
check('« Passer » is on the action button with the ball at the foot', focus === 'kickabout:ball', String(focus));
const nBefore = last().touches, pBall = { x: last().bx, z: last().bz };
await t.tap('#act'); await frames(1);
let jump = 0, prev = { x: last().bx, z: last().bz }, v0 = last().bv;
const wp = clock;
for (let i = 0; i < 40; i++) { const f = await frames(1); jump = Math.max(jump, Math.hypot(f.bx - prev.x, f.bz - prev.z) - f.bv / 60); prev = { x: f.bx, z: f.bz }; }
const away = Math.hypot(last().bx - pBall.x, last().bz - pBall.z);
log.pass = { startPace: +v0.toFixed(1), travelled40f: +away.toFixed(2), maxJumpOverPace: +jump.toFixed(3), bodyTouches: last().touches - nBefore };
check('pass: the ball leaves at pace and travels by itself (no teleport, the body does not touch it again)', v0 > 6 && away > 5 && jump < 0.3 && last().touches - nBefore <= 1, JSON.stringify(log.pass));
await shot('pass');
await frames(120);
mark('regain');
const n2 = last().touches;
await steer(f => [S.at(-1).bx, S.at(-1).bz], 0.75, 14, f => f.touches > n2);
check('regain: running onto the ball, possession comes back', last().touches > n2, `after ${(clock - wp).toFixed(1)} s`);
await release(); await frames(150);
log.regain = { ballPace: +last().bv.toFixed(2), dist: +last().dist.toFixed(2) };
check('regain: stopped, the ball is at the foot at rest', last().bv < 0.3 && last().dist <= 1.9, JSON.stringify(log.regain));

// ---------------------------------------------------------------- 7. shoot: « Frappe » held and released: a real goal, once
const goals0 = last().goals;
mark('shot (goal)');
await put(7, 0, E, 8.0, 0);
await frames(30);
const btn = await d(() => document.getElementById('kickShot')?.classList.contains('on') ?? false);
check('« Frappe » is up with the ball at the foot', btn);
const fb = await t.centre('#kickShot');
await t.down(4, fb.x, fb.y);
await frames(40);                                                                          // held 0.67 s of game time: a firm shot
await t.up(4);
let maxX = -1e9;
for (let i = 0; i < 12; i++) { const f = await frames(10); maxX = Math.max(maxX, f.bx); }
const goalsAfter = last().goals - goals0;
check('shot: the ball crossed the goal line and one goal is counted', maxX > goalX && goalsAfter === 1, JSON.stringify({ maxBallX: +(maxX - P.x).toFixed(1), goalLineX: P.hx, goals: goalsAfter }));
await shot('goal');
await frames(60 * 6);
check('shot: the goal is not counted again while the ball sits in the net or comes back', last().goals - goals0 === 1, `goals ${last().goals - goals0}`);

// ---------------------------------------------------------------- 8. shoot wide: no goal, play goes on
mark('shot (wide)');
await put(7, 9, E, 8.0, 9);
await frames(30);
const g1 = last().goals;
const fb2 = await t.centre('#kickShot');
await t.down(4, fb2.x, fb2.y); await frames(40); await t.up(4);
await frames(60 * 4);
const bp = { x: last().bx - P.x, z: last().bz - P.z };
check('wide shot: no goal, the ball stays on the grass inside the curb', last().goals === g1 && Math.abs(bp.x) <= 22.01 && Math.abs(bp.z) <= 17.01, JSON.stringify({ goals: last().goals - g1, ball: { x: +bp.x.toFixed(1), z: +bp.z.toFixed(1) } }));
await shot('wide');
const n3 = last().touches;
await steer(f => [S.at(-1).bx, S.at(-1).bz], 0.75, 20, f => f.touches > n3);
check('after the miss the ball is still playable: the player takes it again', last().touches > n3, `${(clock).toFixed(0)} s`);

// ---------------------------------------------------------------- 9. leave: ordinary controls
mark('leave');
await release();
const k0 = await d(() => window.__dakar.kickabout());
await d(([x, z]) => window.__dakar.place(x, z, Math.PI), [P.x + 100, P.z]);                // 80 m from the grass: beyond the kickabout's range (football.ts NEAR_OUT 66 m)
await frames(30);
const k1 = await d(() => window.__dakar.kickabout());
const ctl = await d(() => ({ mode: window.__dakar.pos().mode, shot: document.getElementById('kickShot')?.classList.contains('on') ?? false, joy: !!document.querySelector('#joy') }));
const p0 = await d(() => window.__dakar.pos());
await t.down(3, joy.x, joy.y); await t.move(3, joy.x, joy.y - 40, 1); await frames(60); await t.up(3);
const p1 = await d(() => window.__dakar.pos());
check('leaving: the pitch lets go (no kickabout, no « Frappe »), and the stick walks the player as usual', k0.on === true && k1.on === false && ctl.mode === 'play' && !ctl.shot && Math.hypot(p1.x - p0.x, p1.z - p0.z) > 1, JSON.stringify({ kickaboutBefore: k0.on, kickaboutAfter: k1.on, ...ctl, moved: +Math.hypot(p1.x - p0.x, p1.z - p0.z).toFixed(1) }));
const nets = await d(() => ({ match: window.__dakar.football().active }));
check('one ball: no NPC match running over the kickabout', nets.match === false);
check('no page errors', errors.length === 0, JSON.stringify(errors.slice(0, 3)));

fs.writeFileSync(`${out}/summary.json`, JSON.stringify({ log, marks, checks: { total, failed }, frames: S.length }, null, 1));
fs.writeFileSync(`${out}/frames.json`, JSON.stringify(S.map(s => [+s.t.toFixed(3), +s.bx.toFixed(3), +s.bz.toFixed(3), +s.px.toFixed(3), +s.pz.toFixed(3), +s.dist.toFixed(3), +s.bv.toFixed(2), s.touches, s.goals])));
console.log(`${total - failed}/${total} checks passed, ${S.length} frames`);
await context.close(); await browser.close();
process.exit(failed ? 1 : 0);
