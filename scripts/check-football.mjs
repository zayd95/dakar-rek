// NPC football on the Corniche's pitch (src/game/football.ts, src/game/footballSim.ts): at 17:30 the city's footballers
// play a match. The check proves that the ball moves, that passes go from teammate to teammate, that the foot (a
// keeper's hands) is on the ball at each contact — the gap measured on the drawn bones at that frame — that a goal is
// scored within the time limit, that the scorer celebrates with his teammates around him, that play restarts from the
// centre spot, that the match costs nothing when the pitch is far, and that the page throws no error. Pictures: an
// elevated view of the whole pitch, close views of a kick and of a celebration. Also the numbers near the pitch: draw
// calls, the football and ambient-life modules' milliseconds, the frame time (SwiftShader: compare builds, not phones).
// The game is paused and stepped 1/30 s at a time (__dakar.pause, step, render): every reading is exact.
// Usage: flock /tmp/dakar-browser.lock node scripts/check-football.mjs [baseUrl] [outDir]   (a running build, e.g. `npx vite preview --port 4221`)
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:4221/';
const out = process.argv[3] ?? 'docs/screenshots/football';
fs.mkdirSync(out, { recursive: true });
const T = { timeout: 180000 };
/** Game seconds for a goal; the most a contact's gap may be (m): the foot's own half-thickness is about 3 cm. */
const GOAL_LIMIT = 180, GAP_MAX = 0.1;
const DT = 1 / 30;
const results = []; let failed = 0;
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`); };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.goto(`${base}?debug`, { timeout: 120000 });
await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.football, null, T);
const d = (fn, arg) => page.evaluate(fn, arg);
const info = () => d(() => window.__dakar.football());
const quality = await d(() => window.__dakar.quality?.() ?? 'high');

// 17:30 at the Corniche, the player on the touchline at the halfway line, facing the pitch
await d(() => { window.__dakar.setHour(17.5); window.__dakar.teleport('corniche'); });
await page.waitForFunction(() => window.__dakar.pos().hub === 'corniche' && window.__dakar.football().pitch, null, T);
const pitch = (await info()).pitch;
await d(p => window.__dakar.place(p.x + 2, p.z - p.hz - 3.5, 0), pitch);
await page.waitForTimeout(2500);
await d(() => window.__dakar.ambientSettle());
await page.waitForFunction(() => window.__dakar.football().active, null, { timeout: 60000 }).catch(() => {});
let f = await info();
check('the evening\'s footballers make two teams on the pitch at 17:30', f.active && f.teams[0] >= 2 && f.teams[1] >= 2, { teams: f.teams, waiting: f.waiting, fans: f.fans, quality });
await d(() => window.__dakar.footballReset());
await d(() => window.__dakar.pause(true));

/** Step the paused game until `stop` (an expression on n = __dakar.footballNow()) or `seconds` of game time; returns the last reading. */
const advance = (seconds, stop = 'false') => d(([s, stop, dt]) => {
  const D = window.__dakar, until = new Function('n', `return (${stop});`);
  let n = D.footballNow();
  for (let t = 0; t < s; t += dt) { D.step(dt, 1); n = D.footballNow(); if (until(n)) return { ...n, stopped: true }; }
  return { ...n, stopped: false };
}, [seconds, stop, DT]);
/** The camera at `at` looking at `look` (world), the frame drawn, a picture. */
const shoot = async (name, at, look) => { await d(([a, l]) => { window.__dakar.cam(a, l); window.__dakar.render(); }, [at, look]); await page.screenshot({ path: `${out}/${name}.png` }); };

// 1. play starts: the ball moves, passes, contacts — a picture of the whole pitch from above a corner
let n = await advance(25);
f = await info();
await shoot('1-elevated', [pitch.x - 26, 19, pitch.z - 33], [pitch.x + 1, 0, pitch.z + 1]);
check('the ball moves', f.stats.ballTravel > 25, { ballTravel: f.stats.ballTravel, ball: f.ball });
check('the ball is drawn on the grass', f.ball.visible && f.ball.y > 0.2 && f.ball.y < 3.5, f.ball);

// 2. a kick close up: stop on the frame of a pass or a shot by a drawn body, the camera beside the kicker
n = await advance(60, "n.contact && n.body && (n.contact.kind === 'pass' || n.contact.kind === 'shot')");
if (n.stopped) {
  const who = await d(id => window.__dakar.footballWho(id), n.contact.id);
  const yaw = who.yaw, side = n.contact.kind === 'shot' ? 1 : -1;
  const at = [who.x + Math.cos(yaw) * 2.6 * side + Math.sin(yaw) * 1.4, who.y + 1.2, who.z - Math.sin(yaw) * 2.6 * side + Math.cos(yaw) * 1.4];
  await shoot(`2-kick-${n.contact.kind}`, at, [who.x + Math.sin(yaw) * 0.3, who.y + 0.45, who.z + Math.cos(yaw) * 0.3]);
  const last = (await d(() => window.__dakar.footballLog(1)))[0];
  check('at the frame of a kick, the drawn foot is on the ball', last && last.foot !== null && last.foot <= GAP_MAX, last);
  // the next frames: the follow-through
  await d(() => window.__dakar.step(1 / 30, 4));
  await shoot(`2-kick-${n.contact.kind}-after`, at, [who.x + Math.sin(yaw) * 0.6, who.y + 0.45, who.z + Math.cos(yaw) * 0.6]);
} else check('a pass or a shot by a drawn body to picture', false, n);

// 3. a goal within the limit
f = await info();
const goalsBefore = f.stats.goals, tGoal0 = f.t;
n = f.stats.goals > 0 && f.phase === 'goal' ? { ...n, stopped: true } : await advance(GOAL_LIMIT - f.t, "n.phase === 'goal'");
f = await info();
check(`a goal within ${GOAL_LIMIT} s of play`, f.stats.goals > 0, { t: f.t, score: f.score, shots: f.stats.shots, onTarget: f.stats.onTarget, saves: f.stats.saves, goals: f.goals });
void goalsBefore; void tGoal0;

// 4. the celebration: the scorer's arms up, teammates around him, the spectators cheering — a picture
if (f.phase === 'goal') {
  await advance(5, "n.phaseT > 4.6");
  f = await info();
  const s = await d(() => window.__dakar.footballWho());
  const mates = f.players.filter(p => p.team === s.team && p.id !== s.id && Math.hypot(p.x - s.x, p.z - s.z) < 2.6);
  const cheering = f.players.filter(p => p.cheer);
  check('the scorer celebrates (Celebrate held)', s.cheer > 0 && (!s.body || s.clip === 'Celebrate'), s);
  check('his teammates run to him and celebrate', mates.length >= 1 && cheering.length >= 2, { mates: mates.map(m => ({ id: m.id, cheer: m.cheer, clip: m.clip })), cheering: cheering.length });
  check('the spectators on the touchline cheer the goal', f.fans === 0 || f.fansCheering > 0, { fans: f.fans, cheering: f.fansCheering });
  const away = Math.atan2(s.x - pitch.x, s.z - pitch.z);
  await shoot('3-celebration', [s.x - Math.sin(away) * 5.5 + 1.2, s.y + 2.1, s.z - Math.cos(away) * 5.5], [s.x, s.y + 1.0, s.z]);
} else check('a goal\'s celebration to watch', false, { phase: f.phase, goals: f.stats.goals });

// 5. the restart from the centre spot
n = await advance(25, "n.phase === 'play'");
await advance(1);
f = await info();
const ko = f.kickoffs.at(-1);
check('play restarts from the centre spot after the goal', n.phase === 'play' && !!ko && ko.dist < 1.6 && f.stats.kickoffs >= 2, { kickoffs: f.kickoffs, phase: n.phase });

// 6. more play, then the match's numbers: passes between teammates, every contact measured on the bones
await advance(Math.max(0, 120 - f.t));
f = await info();
check('passes go from teammate to teammate', f.stats.completed >= 5, { passes: f.stats.passes, completed: f.stats.completed, intercepted: f.stats.intercepted, perMinute: f.perMinute });
check(`the foot (hands) is within ${GAP_MAX * 100} cm of the ball at every measured contact`, f.contacts.measured >= 20 && f.contacts.max <= GAP_MAX, f.contacts);
check('nearly every contact is measured on a drawn body', f.contacts.unmeasured <= Math.max(3, f.stats.contacts * 0.1), { measured: f.contacts.measured, unmeasured: f.contacts.unmeasured, contacts: f.stats.contacts });
check('a planned contact is seldom missed', f.stats.whiffs <= f.stats.contacts * 0.15, { whiffs: f.stats.whiffs, contacts: f.stats.contacts });
const log = await d(() => window.__dakar.footballLog(400));
check('every contact had the ball at the contact point (the sim\'s own reach)', log.every(c => c.reach <= 0.3), log.filter(c => c.reach > 0.3).slice(0, 5));

// 7. the numbers near the pitch, in real time: the player on the touchline (follow camera), then the elevated view
await d(() => { window.__dakar.cam(null); window.__dakar.pause(false); });
const measure = async label => {
  await page.waitForTimeout(800);
  await d(() => window.__dakar.perfOn(true));
  const ft = await d(() => new Promise(res => { const o = []; let last = performance.now(), k = 0; const fr = () => { const now = performance.now(); if (k++ > 0) o.push(now - last); last = now; if (k > 60) res(o); else requestAnimationFrame(fr); }; requestAnimationFrame(fr); }));
  const perf = await d(() => window.__dakar.perf());
  await d(() => window.__dakar.perfOn(false));
  const rb = await d(() => window.__dakar.renderBreakdown());
  ft.sort((a, b) => a - b);
  const row = { label, calls: rb.base.calls, football: rb.by.football?.calls ?? 0, ambient: rb.by.ambient_life?.calls ?? 0, frameMs: +ft[Math.floor(ft.length / 2)].toFixed(1),
    footballMs: perf['module:football'] ?? 0, ambientMs: perf['module:ambient-life'] ?? 0, updateMs: +Object.entries(perf).filter(([k]) => k !== 'frame (JS)' && k !== 'render (CPU)').reduce((s, [, v]) => s + v, 0).toFixed(2) };
  console.log(`${label}: ${JSON.stringify(row)}`);
  return row;
};
const perf = [];
perf.push(await measure('touchline, follow camera'));
await d(p => window.__dakar.cam([p.x - 26, 19, p.z - 33], [p.x + 1, 0, p.z + 1]), pitch);
perf.push(await measure('elevated view'));
const BUDGET = { low: 180, medium: 300, high: 420 }[quality];
check(`near the pitch the frame stays in the ${quality} budget (${BUDGET} draw calls)`, perf.every(r => r.calls <= BUDGET), perf);
check('the ball and the nets cost at most 4 draw calls', perf.every(r => r.football <= 4), perf.map(r => r.football));

// 8. far from the pitch: no match, no cost
await d(() => window.__dakar.cam(null));
await d(p => window.__dakar.place(p.x + 150, p.z + 60, 0), pitch);
await page.waitForTimeout(1500);
await d(() => window.__dakar.perfOn(true));
await page.waitForTimeout(1500);
const far = { info: await info(), perf: await d(() => window.__dakar.perf()) };
await d(() => window.__dakar.perfOn(false));
check('far from the pitch the match is put away (the people roam as before) and costs next to nothing', !far.info.near && !far.info.active && (far.perf['module:football'] ?? 0) < 0.02, { near: far.info.near, active: far.info.active, ms: far.perf['module:football'] });

check('no page errors', errors.length === 0, errors.join(' | '));
await browser.close();
f = { ...f, perf };
fs.writeFileSync(`${out}/results.json`, JSON.stringify({ results, numbers: { stats: f.stats, perMinute: f.perMinute, contacts: f.contacts, score: f.score, t: f.t, perf, far: far.perf['module:football'] ?? 0, quality } }, null, 2));
console.log(`\n${results.length - failed}/${results.length} football checks passed`);
process.exit(failed ? 1 : 0);
