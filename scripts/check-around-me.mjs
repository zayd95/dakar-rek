// 1.0.1 « Autour de moi » (src/game/around.ts, src/ui/phone/apps/around.ts): the phone's screen of what can be done right here, right now, checked on the
// real local Workers runtime (`wrangler dev --local`, fresh state) serving an online build, in a phone-sized page, every action a real tap (Chrome's touch
// pipeline, scripts/lib/realTouch.mjs):
//   in Pikine (15 h) and in the Corniche (17 h): the phone opened with ☰ and the « Autour de moi » tile; at least three Tiak Tiak runs, each one the
//   district's board has, leaving from a place built there, with « Accepter »; one accepted with a tap: the run is in hand, the phone closed, the parcel's
//   marker on its pick-up; a place's « Y aller »: the walking marker and the way-finding pin on it, the goal line naming it;
//   in the Corniche, a SECOND client (the bundled client module src/online/campClient.ts, as scripts/check-grand-camp.mjs drives it with its bots,
//   tests/helpers/campBot.ts) opens a public Grand Camp lobby there: it appears on the screen within a few seconds; « Voir » opens the Grand Camp app's
//   route `grandcamp:<match>` where the phone has that app (a build with wp101/camp-ui merged), and where it has not, the row is shown without its
//   action and there is no « Organiser »; that client's account writes to the player: « Amis en ligne » shows them online, « Message » opens their
//   conversation;
//   the worker stopped: the online rows say « Hors ligne » once, the rest still works (the Tiak Tiak runs, the places).
// What is not a player's touch, and said so: the district and the hour are set with the debug API (`teleport`, `setHour`), energy is set full, a run
// taken is cancelled with the debug hook before the next step. Headless SwiftShader says nothing about a phone's frame rate.
// Usage: npx vite build --mode online --outDir <dist> && node scripts/check-around-me.mjs <dist> [outDir]
// Ports: AROUND_PORT (default 48761), inspector at +500. Logs: AROUND_TMP (default the system temp dir).
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { realTouch } from './lib/realTouch.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const [distArg, outArg = 'docs/proof/release-1.0.1/around'] = process.argv.slice(2);
if (!distArg || !fs.existsSync(path.join(distArg, 'index.html'))) { console.error('Usage: node scripts/check-around-me.mjs <online build dir> [outDir]'); process.exit(2); }
const DIST = path.resolve(distArg), OUT = path.resolve(outArg), PORT = Number(process.env.AROUND_PORT || 48761);
const TMP = process.env.AROUND_TMP || path.join(os.tmpdir(), `dakar-around-${PORT}`);
fs.rmSync(TMP, { recursive: true, force: true }); fs.mkdirSync(TMP, { recursive: true }); fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const tagOf = key => createHash('sha256').update(`dakar-rek:tag:${key}`).digest().subarray(0, 8).toString('hex');
let failed = 0, total = 0;
const check = (name, ok, detail = '') => { total++; if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`.slice(0, 700) : ''}`); return !!ok; };

// ------------------------------------------------------------------ the second client: the game's own client module, bundled (as check-grand-camp does)
const esbuild = createRequire(import.meta.url)(path.join(ROOT, 'node_modules/esbuild'));
await esbuild.build({
  stdin: { contents: "export { CampClient } from './src/online/campClient'; export { CampBot, STILL } from './tests/helpers/campBot';", resolveDir: ROOT, loader: 'ts' },
  bundle: true, format: 'esm', platform: 'neutral', target: 'es2022', outfile: path.join(TMP, 'camp-lib.mjs'), logLevel: 'warning',
});
const lib = await import(pathToFileURL(path.join(TMP, 'camp-lib.mjs')).href);

// ------------------------------------------------------------------ a local worker serving the build (the project's wrangler.jsonc, absolute paths, fresh state)
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'wrangler.jsonc'), 'utf8').split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n'));
delete cfg.$schema; delete cfg.build;
cfg.main = path.join(ROOT, cfg.main); cfg.assets = { ...cfg.assets, directory: DIST };
fs.writeFileSync(path.join(TMP, 'wrangler.json'), JSON.stringify(cfg, null, 2));
const BASE = `http://127.0.0.1:${PORT}/`;
let logs = '';
const worker = spawn(process.execPath, [path.join(ROOT, 'node_modules/wrangler/bin/wrangler.js'), 'dev', '--local', '--config', path.join(TMP, 'wrangler.json'), '--ip', '127.0.0.1', '--port', String(PORT),
  '--inspector-port', String(PORT + 500), '--persist-to', path.join(TMP, 'state'), '--show-interactive-dev-session=false'],
{ cwd: ROOT, env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
const wlog = fs.createWriteStream(path.join(TMP, 'wrangler.log'));
for (const s of [worker.stdout, worker.stderr]) s.on('data', b => { logs = (logs + b).slice(-20000); wlog.write(b); });
process.on('exit', () => { try { if (worker.exitCode === null) worker.kill('SIGTERM'); } catch { /* gone */ } });   // a check that throws never leaves its worker behind
const stopWorker = () => new Promise(r => { if (worker.exitCode !== null) return r(); worker.once('exit', r); worker.kill('SIGTERM'); setTimeout(() => { try { worker.kill('SIGKILL'); } catch { /* gone */ } r(); }, 8000); });
{
  const end = Date.now() + 180000;
  for (;;) {
    if (worker.exitCode !== null) throw new Error(`wrangler exited: ${logs}`);
    try { if ((await fetch(new URL('/api/health', BASE))).ok) break; } catch { /* starting */ }
    if (Date.now() > end) throw new Error(`wrangler did not answer: ${logs}`);
    await sleep(400);
  }
}

/** A second player's account (/api/me, raw socket): its welcome, and a request that waits for its answer. */
function account(key, name) {
  return new Promise((resolve, reject) => {
    const u = new URL('/api/me', BASE); u.protocol = 'ws:'; u.search = new URLSearchParams({ key, name, look: '1' }).toString();
    const ws = new WebSocket(u), a = { ws, inbox: [] };
    const t = setTimeout(() => reject(new Error(`no welcome for ${name}`)), 20000);
    ws.addEventListener('message', e => { if (e.data === 'pong') return; const m = JSON.parse(e.data); a.inbox.push(m); if (m.type === 'welcome') { clearTimeout(t); a.welcome = m; resolve(a); } });
    ws.addEventListener('error', () => { clearTimeout(t); reject(new Error('account socket error')); }, { once: true });
    a.req = async m => { m.id ??= randomUUID(); const from = a.inbox.length; ws.send(JSON.stringify(m)); const end = Date.now() + 10000; while (Date.now() < end) { const r = a.inbox.slice(from).find(x => x.id === m.id && x.type === 'ack'); if (r) return r; await sleep(50); } return null; };
  });
}

// ------------------------------------------------------------------ the player: a phone, the online build
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await context.addInitScript(() => {
  try {
    if (!localStorage.getItem('dakarrek.guest.save.v6')) localStorage.setItem('dakarrek.guest.save.v6', JSON.stringify({ schemaVersion: 6, guestId: 'around-check-0001', avatar: 'homme' }));
    localStorage.setItem('dakarrek.quality', 'low');
    localStorage.setItem('dakarrek.presence.profile', JSON.stringify({ name: 'Awa', look: 2 }));
  } catch { /* */ }
});
const page = await context.newPage(); page.setDefaultTimeout(300000);
const errors = []; page.on('pageerror', e => errors.push(e.message));
const d = (fn, a) => page.evaluate(fn, a);
const wait = ms => page.waitForTimeout(ms);
const until = (fn, a, ms = 30000) => page.waitForFunction(fn, a, { timeout: ms }).then(() => true, () => false);
let shotN = 0; const shot = async n => { await wait(400); await page.screenshot({ path: path.join(OUT, `${String(++shotN).padStart(2, '0')}-${n}.png`) }); };

await page.goto(`${BASE}?debug&touch&heure=15`, { timeout: 180000 });
await page.waitForFunction(() => window.__dakar?.pos?.().hub && window.__dakar.pos().mode === 'play' && window.__dakar.board && !document.getElementById('studio'), null, { timeout: 300000 });
check('the online build plays and its account connects to the local server', await until(() => window.__dakar.account()?.status === 'online' && !!window.__dakar.account().me, null, 120000), JSON.stringify(await d(() => ({ status: window.__dakar.account()?.status }))));
const me = await d(() => window.__dakar.account().me.tag);
const t = await realTouch(page);

/** A real tap on the element `find` marks (scrolled into view inside the phone first, as a thumb would), once the phone has settled. */
async function tapWhere(find, arg, settle = 450) {
  await wait(settle);
  // the phone's own slide and fades finished first: a software renderer draws a few frames a second, and a finger on a moving panel misses
  await page.waitForFunction(() => !document.querySelector('#phone.on')?.getAnimations({ subtree: true }).some(a => a.playState === 'running' && a.effect?.getComputedTiming?.().iterations !== Infinity), null, { timeout: 30000 }).catch(() => {});
  const mark = () => d(([src, a]) => { document.querySelectorAll('[data-check-tap]').forEach(e => e.removeAttribute('data-check-tap')); const el = (0, eval)(src)(a); if (!el) return false; el.setAttribute('data-check-tap', '1'); el.scrollIntoView({ block: 'center', behavior: 'instant' }); return true; }, [find.toString(), arg]);
  if (!(await mark())) throw new Error(`nothing to tap (${find.toString().slice(0, 90)}, ${arg}): ${JSON.stringify(await d(() => ({ phone: window.__dakar.phoneInfo(), grid: document.querySelectorAll('#phone .hm-grid .ph-app').length, tiles: [...document.querySelectorAll('#phone .ph-app')].map(e => e.dataset.app).join(','), mode: window.__dakar.pos().mode })))}`);
  await wait(300);
  const c = await t.centre('[data-check-tap]');
  await t.down(9, c.x, c.y); await wait(70); await t.up(9);
}
/** The phone opened with ☰, back to its home screen, the « Autour de moi » tile tapped. */
async function openAround() {
  for (let k = 0; k < 3 && !(await d(() => window.__dakar.phoneInfo().open)); k++) {
    await wait(450); await t.tap('#menuBtn');
    if (await until(() => window.__dakar.phoneInfo().open, null, 8000)) break;
    console.log('  (☰ did not open the phone: ' + JSON.stringify(await d(() => { const r = document.getElementById('menuBtn').getBoundingClientRect(), e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { at: e?.id || e?.className || e?.tagName, mode: window.__dakar.pos().mode }; })) + ')');
  }
  for (let k = 0; k < 3 && (await d(() => window.__dakar.phoneInfo().screen)) !== 'home'; k++) {      // it opens where it was left: the home indicator first
    await tapWhere(() => document.querySelector('#phone [data-nav="home"]'));
    if (await until(() => window.__dakar.phoneInfo().screen === 'home', null, 6000)) break;
    console.log('  (the home indicator did not answer: ' + JSON.stringify(await d(() => { const r = document.querySelector('#phone [data-nav="home"]').getBoundingClientRect(), e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { at: e?.className || e?.tagName, r: [r.left, r.top, r.width, r.height], info: window.__dakar.phoneInfo() }; })) + ')');
  }
  await tapWhere(() => document.querySelector('#phone .hm-grid .ph-app[data-app="autour"]'));
  await until(() => window.__dakar.phoneInfo().screen === 'autour' && !!document.querySelector('#phone .pg-autour'));
  await wait(600);
}
/** The screen as the player reads it: its sections, their rows, each row's one button. */
const rowsNow = () => d(() => [...document.querySelectorAll('#phone .pg-autour section[data-sec]')].map(s => ({
  id: s.dataset.sec, title: s.querySelector('h3')?.textContent ?? '',
  rows: [...s.querySelectorAll('[data-row]')].map(r => { const b = r.querySelector('button'); return { key: r.dataset.row, text: r.innerText.replace(/\s+/g, ' ').trim(), btn: b?.textContent ?? null, off: !!b?.classList.contains('off'), buttons: r.querySelectorAll('button').length }; }),
})));
const closePhone = async () => { if (await d(() => window.__dakar.phoneInfo().open)) { await tapWhere(() => document.querySelector('#phone [data-nav="close"]')); await until(() => !window.__dakar.phoneInfo().open && window.__dakar.pos().mode === 'play'); } };
async function goHub(h, hour) {
  await closePhone();
  await d(([x, hr]) => { window.__dakar.setHour(hr); return window.__dakar.teleport(x); }, [h, hour]);
  await until(x => window.__dakar.pos().hub === x && window.__dakar.pos().mode === 'play', h, 120000);
  await wait(2500);
  await d(() => { const n = window.__dakar.state.data.needs; n.energie = 100; n.faim = 100; });
}

/** In one district: the Tiak Tiak runs (at least three, the board's, « Accepter » takes one), and a place's « Y aller ». */
async function district(h, label) {
  await openAround();
  const secs = await rowsNow(), tiak = secs.find(s => s.id === 'tiak')?.rows ?? [];
  const board = await d(() => window.__dakar.board());
  const valid = tiak.filter(r => { const b = board.find(x => `tiak:${x.id}` === r.key); return b && b.fromPlace?.startsWith(h + ':') && !b.blocked && r.btn === 'Accepter' && !r.off && r.buttons === 1; });
  check(`${label}: the screen opens from the home grid with taps; at least three Tiak Tiak runs, each one on the district's board, leaving from a place built here, with « Accepter » (${valid.length}/${tiak.length})`, valid.length >= 3 && valid.length === tiak.length, tiak.map(r => r.text).join(' | '));
  check(`${label}: one action a row, every section`, secs.every(s => s.rows.every(r => r.buttons <= 1)), JSON.stringify(secs.map(s => [s.id, s.rows.length])));
  await shot(`${h}-screen`);
  // « Accepter »: the board's own accept, the phone closes, the parcel's marker on the pick-up
  const first = valid[0], id = first.key.slice('tiak:'.length), from = board.find(b => b.id === id).fromPlace;
  await tapWhere(k => [...document.querySelectorAll('#phone .pg-autour [data-row]')].find(r => r.dataset.row === k)?.querySelector('button'), first.key);
  const took = await until(r => window.__dakar.activeJob()?.routeId === r && !window.__dakar.phoneInfo().open, id, 30000);
  await until(f => window.__dakar.destination() === f && window.__dakar.marker().visible, from, 30000);
  const st = await d(() => ({ job: window.__dakar.activeJob(), dest: window.__dakar.destination(), marker: window.__dakar.marker(), mode: window.__dakar.pos().mode, goal: document.getElementById('goal')?.innerText.replace(/\s+/g, ' ') ?? '' }));
  check(`${label}: a tap on « Accepter » takes that run (go and fetch the parcel); the phone is closed, the marker is on the pick-up`, took && st.job?.stage === 'pickup' && st.dest === from && st.marker.visible && st.mode === 'play', JSON.stringify(st));
  await shot(`${h}-accepted`);
  await d(() => window.__dakar.cancelJob());                                   // (debug: the run is given back for the next step, nothing paid)
  // « Y aller » to a place open now: the walking marker, the pin, the goal line
  await openAround();
  const lieux = (await rowsNow()).find(s => s.id === 'lieux')?.rows.filter(r => r.btn === 'Y aller') ?? [];
  const facts = await d(() => window.__dakar.around().facts.targets);
  const pick = lieux[0], target = pick ? facts[pick.key.slice('lieu:'.length)] : null;
  check(`${label}: places open now, what is going on and how far, each with « Y aller » (${lieux.length})`, lieux.length >= 2 && !!target, lieux.map(r => r.text).join(' | '));
  if (!pick || !target) return;
  await tapWhere(k => [...document.querySelectorAll('#phone .pg-autour [data-row]')].find(r => r.dataset.row === k)?.querySelector('button'), pick.key);
  await until(tid => window.__dakar.destination() === tid && !window.__dakar.phoneInfo().open, target.id, 30000);
  await until(() => window.__dakar.uiMarkers().pin, null, 30000);
  const m = await d(() => ({ dest: window.__dakar.destination(), pin: window.__dakar.uiMarkers(), goal: document.getElementById('goal')?.innerText.replace(/\s+/g, ' ') ?? '', mode: window.__dakar.pos().mode }));
  check(`${label}: « Y aller » on ${target.name}: the phone closes, the walking marker and the pin are on it, the goal line names it`, m.dest === target.id && m.pin.pin && Math.hypot(m.pin.pinAt.x - target.x, m.pin.pinAt.z - target.z) < 3 && m.goal.includes(target.name.split(' · ')[0]) && m.mode === 'play', JSON.stringify(m));
  await shot(`${h}-venue-marker`);
  await d(() => window.__dakar.phoneHooks.markPlace?.(null));
}

// ---- 1. Pikine at 15 h
await goHub('pikine', 15);
await district('pikine', 'Pikine');

// ---- 2. the Corniche at 17 h: a second client's lobby, a friend online, then the same as in Pikine
await goHub('corniche', 17);
const key2 = randomBytes(16).toString('hex');
const moussa = await account(key2, 'Moussa'), tag2 = tagOf(key2);
const said = await moussa.req({ type: 'say', to: me, text: 'Je suis au terrain, viens !' });
check('a second player (their own device key and account) writes to the player', !!said?.ok, JSON.stringify(said));
const camp2 = new lib.CampClient({ key: () => key2, profile: () => ({ name: 'Moussa', look: 1 }), endpoint: new URL('/api/camp', BASE).href, WebSocketImpl: WebSocket, fetchImpl: fetch });
const made = await camp2.create({ fee: 0, size: 10, dist: 'team', open: true, hub: 'corniche' });
const bot = made.ok ? new lib.CampBot(0, 0, lib.STILL) : null;                  // (the lobby's organizer stays put: nothing is played here)
check('… and opens a public Grand Camp lobby in the Corniche (the client module, on the local server)', made.ok && !!bot, JSON.stringify(made));
const match = made.ok ? made.match : '';
await until(t2 => window.__dakar.account().convs().some(c => c.with === t2 && c.seen === 'online'), tag2, 30000);
await openAround();
const seen = await until(m => [...document.querySelectorAll('#phone .pg-autour [data-row]')].some(r => r.dataset.row === `camp:${m}`), match, 20000);
const camp = (await rowsNow()).find(s => s.id === 'camp');
const row = camp?.rows.find(r => r.key === `camp:${match}`);
const route = await d(() => !!window.__dakar.phoneHooks.canOpenPhone?.('grandcamp:x'));
check(`Corniche: the second client's lobby appears within a few seconds (organizer, fee, places left)`, seen && !!row && /Match de Moussa/.test(row.text) && /Gratuit · 9 places/.test(row.text), JSON.stringify(camp));
const amis = (await rowsNow()).find(s => s.id === 'amis');
const fr = amis?.rows.find(r => r.key === `ami:${tag2}`);
check('Corniche: « Amis en ligne » shows the player who wrote, online, with « Message » (they share no place: no « Rejoindre »)', !!fr && /Moussa/.test(fr.text) && /en ligne/.test(fr.text) && fr.btn === 'Message', JSON.stringify(amis));
await shot('corniche-screen-online');
if (route) {
  await tapWhere(k => [...document.querySelectorAll('#phone .pg-autour [data-row]')].find(r => r.dataset.row === k)?.querySelector('button'), `camp:${match}`);
  const opened = await until(m => window.__dakar.phoneInfo().arg === m, match, 20000);
  check('Corniche: « Voir » opens the Grand Camp app on that match (`grandcamp:<match>`)', opened, JSON.stringify(await d(() => window.__dakar.phoneInfo())));
  await shot('corniche-voir-grandcamp');
} else {
  check('Corniche: without the Grand Camp app in this build, the lobby row has no action and there is no « Organiser »', !!row && row.buttons === 0 && !camp.rows.some(r => r.key === 'camp:new'), JSON.stringify(camp?.rows));
}
await openAround();
await tapWhere(k => [...document.querySelectorAll('#phone .pg-autour [data-row]')].find(r => r.dataset.row === k)?.querySelector('button'), `ami:${tag2}`);
const conv = await until(t2 => window.__dakar.phoneInfo().screen === 'messages' && window.__dakar.phoneInfo().arg === t2, tag2, 20000);
check('Corniche: « Message » opens the conversation with that player', conv, JSON.stringify(await d(() => window.__dakar.phoneInfo())));
await shot('corniche-message');
await district('corniche', 'Corniche');

// ---- 3. the server gone: « Hors ligne » once, the rest works
camp2.close(); try { moussa.ws.close(); } catch { /* */ }
await stopWorker();
const off = await until(() => window.__dakar.account()?.status !== 'online', null, 60000);
await openAround();
await until(() => !!document.querySelector('#phone .pg-autour section[data-sec="enligne"]'), null, 15000);
const offline = await rowsNow(), all = offline.flatMap(s => s.rows);
check('server stopped: the online rows say « Hors ligne » once (no Grand Camp, no friends), Tiak Tiak and the places still work', off && all.filter(r => /Hors ligne/.test(r.text)).length === 1 && !offline.some(s => s.id === 'camp' || s.id === 'amis')
  && (offline.find(s => s.id === 'tiak')?.rows.filter(r => r.btn === 'Accepter').length ?? 0) >= 3 && (offline.find(s => s.id === 'lieux')?.rows.length ?? 0) >= 1, JSON.stringify(offline.map(s => [s.id, s.rows.map(r => r.text)])));
await shot('corniche-offline');

check('no JavaScript error', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
await stopWorker();
console.log(`${total - failed}/${total} passed`);
process.exit(failed ? 1 : 0);
