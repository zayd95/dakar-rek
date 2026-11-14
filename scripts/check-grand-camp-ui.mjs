// Dakar Rek 1.0.1 — Grand Camp in the game (docs/release/GRAND-CAMP-RULES-1.0.1.md, work package D2): the phone's screens, the match drawn and played on
// the Corniche's pitch, PASSE · DRIBBLE · TIR, on the real local Workers runtime (`wrangler dev --local`, fresh state, serving the online build), with
// REAL browser pages (phone viewport, real touch through Chrome's input pipeline: scripts/lib/realTouch.mjs) and bot clients (the real client module,
// src/online/campClient.ts, driven by tests/helpers/campBot.ts through the real messages) — 10 players:
//   the organizer (page A) fills the form (1 000 F, 10, « Équipe gagnante — partage égal », privé); invites the friend (page B) from the street's player
//   menu; B gets the message and opens the match from its « Voir le match »; both walk to the pitch (the stick); 8 bots are invited, join and ready;
//   both pages press « Prêt » (the fee pending → done); kick-off; the pages play with PASSE · DRIBBLE · TIR through real taps (a finger on the stick, a
//   second one on the buttons); a goal, and every page shows the server's score; A's socket drops (« Reconnexion… ») and comes back; B reloads mid-match
//   and is back on the pitch within 60 s; full time; the result and the payout only after the server's settlement; Teranga Money matches the ledger.
//   Then the draw calls and the bodies drawn per quality, during that 10-player match and a 14-player one (page A + 13 bots).
// Debug hooks only set the scene (a district, a place to stand, the bots' invitation, the quality) and read state; nothing is paid or played by them.
// Usage: npx vite build --mode online --outDir <dist> && node scripts/check-grand-camp-ui.mjs <dist> [outDir]
//   Ports: CAMPUI_PORT (default 8961) and +500 (inspector). Extra real pages (3rd, 4th: watching from the touchline): CAMPUI_PAGES=3|4.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { realTouch, walkTo } from './lib/realTouch.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DIST = path.resolve(process.argv[2] || path.join(ROOT, 'dist'));
const OUT = path.resolve(process.argv[3] || path.join(ROOT, 'docs/proof/release-1.0.1/grand-camp'));
const PORT = Number(process.env.CAMPUI_PORT || 8961), PAGES = Math.max(2, Math.min(4, Number(process.env.CAMPUI_PAGES || 2)));
const TMP = process.env.CAMPUI_TMP || path.join(os.tmpdir(), `dakar-campui-${PORT}`);
const BASE = `http://127.0.0.1:${PORT}/`;
const CHROME = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome';
if (!fs.existsSync(path.join(DIST, 'index.html'))) { console.error(`No build in ${DIST}: npx vite build --mode online --outDir <dist> first.`); process.exit(2); }
fs.rmSync(TMP, { recursive: true, force: true }); fs.mkdirSync(TMP, { recursive: true }); fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [], notes = {};
const check = (name, ok, detail = '') => { const d = typeof detail === 'string' ? detail : JSON.stringify(detail); results.push({ name, ok: !!ok, detail: d.slice(0, 900) }); console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${d ? ` — ${d.slice(0, 900)}` : ''}`); return !!ok; };
const until = async (fn, ms = 15000, step = 100) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (await fn()) return true; } catch { /* not yet */ } await sleep(step); } return false; };
const tagOf = key => createHash('sha256').update(`dakar-rek:tag:${key}`).digest().subarray(0, 8).toString('hex');
const NB = s => String(s ?? '').replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim();
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

// ------------------------------------------------------------------ the client module and the bots, as the game ships them
const esbuild = createRequire(import.meta.url)(path.join(ROOT, 'node_modules/esbuild'));
await esbuild.build({
  stdin: { contents: "export { CampClient } from './src/online/campClient'; export { CampBot, STRONG, WEAK, STILL, WARM } from './tests/helpers/campBot';", resolveDir: ROOT, loader: 'ts' },
  bundle: true, format: 'esm', platform: 'neutral', target: 'es2022', outfile: path.join(TMP, 'camp-lib.mjs'), logLevel: 'warning',
});
const lib = await import(pathToFileURL(path.join(TMP, 'camp-lib.mjs')).href);

// ------------------------------------------------------------------ the local worker: the project's wrangler.jsonc, the online build as its assets, fresh state
let worker = null, wlogs = '';
async function startWorker() {
  const dir = path.join(TMP, 'worker'); fs.mkdirSync(dir, { recursive: true });
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'wrangler.jsonc'), 'utf8').split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n'));
  delete cfg.$schema; delete cfg.build;
  cfg.main = path.join(ROOT, cfg.main); cfg.assets = { ...cfg.assets, directory: DIST };
  fs.writeFileSync(path.join(dir, 'wrangler.json'), JSON.stringify(cfg, null, 2));
  worker = spawn(process.execPath, [path.join(ROOT, 'node_modules/wrangler/bin/wrangler.js'), 'dev', '--local', '--config', path.join(dir, 'wrangler.json'), '--ip', '127.0.0.1', '--port', String(PORT),
    '--inspector-port', String(PORT + 500), '--persist-to', path.join(dir, 'state'), '--show-interactive-dev-session=false'],
  { cwd: ROOT, env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  const log = fs.createWriteStream(path.join(TMP, 'wrangler.log'));
  for (const s of [worker.stdout, worker.stderr]) s.on('data', b => { wlogs = (wlogs + b).slice(-40000); log.write(b); });
  const end = Date.now() + 180000;
  while (Date.now() < end) {
    if (worker.exitCode !== null) throw new Error(`wrangler exited: ${wlogs}`);
    try { if ((await fetch(new URL('/api/health', BASE))).ok) return dir; } catch { /* starting */ }
    await sleep(400);
  }
  throw new Error(`wrangler did not answer: ${wlogs}`);
}
/** The ledger's own rows (its SQLite file, copied: the worker keeps it open). */
function ledgerRows(dir, match) {
  const d = path.join(dir, 'state', 'v3', 'do', 'dakar-rek-Social');
  const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
  for (const f of fs.readdirSync(d).filter(x => x.endsWith('.sqlite') && x !== 'metadata.sqlite')) {
    const copy = path.join(TMP, `ledger-${Date.now()}.sqlite`);
    fs.copyFileSync(path.join(d, f), copy);
    for (const ext of ['-wal', '-shm']) if (fs.existsSync(path.join(d, f + ext))) fs.copyFileSync(path.join(d, f + ext), copy + ext);
    const db = new DatabaseSync(copy);
    try {
      if (!db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'accounts'`).get()) continue;
      const has = !!db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'camp_pools'`).get();
      const q = (sql, ...a) => (has ? db.prepare(sql).all(...a) : []);
      return { pools: q('SELECT * FROM camp_pools WHERE match = ?', match), holds: q('SELECT * FROM camp_holds WHERE match = ?', match), ops: q('SELECT * FROM camp_ops WHERE match = ?', match), accounts: db.prepare('SELECT tag, balance, funded FROM accounts').all() };
    } finally { db.close(); }
  }
  return null;
}
/** An account opened on /api/me with a device key, funded through the ledger's own top-up (the bots' money). */
function account(key, name, fund) {
  return new Promise((resolve, reject) => {
    const u = new URL('/api/me', BASE); u.protocol = 'ws:'; u.search = new URLSearchParams({ key, name, look: '1' }).toString();
    const ws = new WebSocket(u), inbox = [];
    const t = setTimeout(() => reject(new Error(`no welcome for ${name}`)), 30000);
    ws.addEventListener('message', async e => {
      if (e.data === 'pong') return; const m = JSON.parse(e.data); inbox.push(m);
      if (m.type === 'welcome') { clearTimeout(t); const id = randomUUID(); ws.send(JSON.stringify({ type: 'fund', id, amount: fund })); const ok = await until(() => inbox.some(x => x.type === 'ack' && x.id === id), 15000); ws.close(); resolve(ok ? inbox.find(x => x.type === 'ack' && x.id === id) : null); }
    });
    ws.addEventListener('error', () => { clearTimeout(t); reject(new Error('account socket error')); }, { once: true });
  });
}

// ------------------------------------------------------------------ bots: the client module, a bot on its own snapshots, through `input`
const NAMES = ['Moussa', 'Fatou', 'Ibou', 'Khady', 'Modou', 'Ndeye', 'Pape', 'Aminata', 'Cheikh', 'Seynabou', 'Lamine', 'Mariama', 'Ousmane', 'Bineta'];
function bot(i) {
  const key = randomBytes(16).toString('hex'), name = NAMES[i % NAMES.length];
  const client = new lib.CampClient({ key: () => key, profile: () => ({ name, look: i % 6 }), endpoint: new URL('/api/camp', BASE).href, WebSocketImpl: WebSocket, fetchImpl: fetch });
  return { i, key, name, tag: tagOf(key), client, bot: null, timer: null, style: lib.WARM };
}
const teamIn = (c, sid) => c.state.roster?.find(r => r.sid === sid)?.team ?? null;
function drive(b) {
  const t0 = Date.now();
  b.timer = setInterval(() => {
    const c = b.client, s = c.state.snap, sid = c.state.sid;
    if (!s || sid === null || c.state.lobby?.state !== 'play' || c.state.status !== 'open') return;
    b.bot ??= new lib.CampBot(sid, teamIn(c, sid), b.style, b.i + 1);
    b.bot.style = b.style;
    const o = b.bot.think(s, x => teamIn(c, x), (Date.now() - t0) / 1000);
    c.input(o.mx, o.mz, o.f, o.a, o.p);
  }, 50);
}
const stopBot = b => { if (b.timer) clearInterval(b.timer); b.timer = null; };

// ------------------------------------------------------------------ real pages: a phone each (its own storage: its own device key and account)
const browser = await chromium.launch({ executablePath: CHROME, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
async function page(name, look, guest, quality = 'low') {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.addInitScript(([name, look, guest, quality]) => {
    try {
      if (!localStorage.getItem('dakarrek.guest.save.v6')) localStorage.setItem('dakarrek.guest.save.v6', JSON.stringify({ schemaVersion: 6, guestId: guest, avatar: 'homme' }));
      if (!localStorage.getItem('dakarrek.quality')) localStorage.setItem('dakarrek.quality', quality);
      localStorage.setItem('dakarrek.presence.profile', JSON.stringify({ name, look }));
    } catch { /* */ }
  }, [name, look, guest, quality]);
  const p = { name, ctx, page: null, t: null, errors: [] };
  p.open = async () => {
    const pg = await ctx.newPage(); pg.setDefaultTimeout(240000);
    pg.on('pageerror', e => p.errors.push(e.message));
    const t0 = Date.now();
    await pg.goto(`${BASE}?debug&touch&avatar=v4`, { timeout: 300000 });
    await pg.waitForFunction(() => window.__dakar?.pos?.().hub && !document.getElementById('studio'), null, { timeout: 480000 });
    await pg.waitForFunction(() => window.__dakar.presence().status === 'online' && window.__dakar.account()?.status === 'online' && !!window.__dakar.account().me, null, { timeout: 420000 });
    p.page = pg; p.t = await realTouch(pg); p.cdp = await ctx.newCDPSession(pg);
    p.tag = await pg.evaluate(() => window.__dakar.account().me.tag);
    p.loadS = (Date.now() - t0) / 1000;
    return pg;
  };
  const d = (fn, a) => p.page.evaluate(fn, a);
  p.d = d;
  p.wait = ms => p.page.waitForTimeout(ms);
  p.until = (fn, arg, ms = 30000) => p.page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
  const settled = () => p.page.waitForFunction(() => !document.querySelector('#phone.on')?.getAnimations({ subtree: true }).some(a => a.playState === 'running' && a.effect?.getComputedTiming?.().iterations !== Infinity), null, { timeout: 30000 }).catch(() => {});
  /** A real tap on what `find` returns (scrolled into view first, as a thumb would), after the phone has settled. */
  p.tapWhere = async (find, arg, { settle = 450 } = {}) => {
    await p.wait(settle); await settled();
    const at = () => d(([src, a]) => { const el = (0, eval)(src)(a); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, out: r.top < 0 || r.bottom > innerHeight }; }, [find.toString(), arg]);
    let c = await at();
    if (c?.out) { await d(([src, a]) => (0, eval)(src)(a).scrollIntoView({ block: 'center', behavior: 'instant' }), [find.toString(), arg]); await p.wait(300); c = await at(); }
    for (let k = 0; k < 20 && c; k++) { await p.wait(120); const c2 = await at(); if (c2 && Math.abs(c2.y - c.y) < 1 && Math.abs(c2.x - c.x) < 1) break; c = c2; }
    if (!c) throw new Error(`${name}: nothing to tap: ${arg ?? find}`);
    await p.t.down(9, c.x, c.y); await p.wait(60); await p.t.up(9);
  };
  p.tap = (sel, o) => p.tapWhere(s => document.querySelector(s), sel, o);
  p.tapText = (sel, re, o) => p.tapWhere(([s, r]) => [...document.querySelectorAll(s)].find(e => new RegExp(r).test(e.textContent.replace(/[  ]/g, ' '))), [sel, re.source], o);
  p.shot = async file => { await p.wait(350); await p.page.screenshot({ path: path.join(OUT, `${file}.jpg`), type: 'jpeg', quality: 74 }); };
  p.screen = () => d(() => document.querySelector('#phone .ph-screen')?.innerText ?? '').then(NB);
  p.info = () => d(() => window.__dakar.grandCamp.info());
  /** The phone's Grand Camp, opened as a player does: the phone, « Toutes les apps », the Grand Camp tile. */
  p.campApp = async () => {
    await d(() => window.__dakar.phone('home')); await p.until(() => window.__dakar.phoneInfo().screen === 'home'); await p.wait(700);
    await p.tap('#phone .hm-tile[data-go="apps"]'); await p.until(() => window.__dakar.phoneInfo().screen === 'apps'); await p.wait(400);
    await p.tap('#phone .ph-app[data-app="grandcamp"]'); await p.until(() => window.__dakar.phoneInfo().screen === 'camp');
  };
  return p;
}
/** Walk to (x, z) with the stick, as a thumb does. */
const walk = (p, x, z, tol = 1.2) => walkTo(p.page, p.t, x, z, { tol, ms: 60000 });
/**
 * Plays for `ms` with real fingers: the stick toward the ball (finger 3, re-aimed every loop as the camera follows), and PASSE · DRIBBLE · TIR on a
 * second finger (9) when the ball is within reach (the server keeps an asked pass or shot ~1.2 s for the ball to reach the foot). Returns the taps and
 * a trace (the closest the player came to the ball, how far it ran).
 */
async function play(p, ms, order = ['dribble', 'pass', 'shot']) {
  const j = await p.t.centre('#joy'), r = 38, t0 = Date.now(), out = { taps: { pass: 0, dribble: 0, shot: 0 }, loops: 0, minD: Infinity, ran: 0 };
  let k = 0, last = 0, down = false, prev = null;
  try {
    while (Date.now() - t0 < ms) {
      const v = await p.d(() => { const v = window.__dakar.grandCamp.view(), pos = window.__dakar.pos(); return v ? { ball: v.ball, cam: pos.cam, px: pos.x, pz: pos.z, pad: !!document.querySelector('#campPad.on') } : null; });
      out.loops++;
      if (!v || !v.pad) { if (down) { await p.t.up(3); down = false; } await sleep(200); continue; }
      const me = { x: v.px, z: v.pz }, d = Math.hypot(v.ball.x - me.x, v.ball.z - me.z);
      if (prev) out.ran += Math.hypot(me.x - prev.x, me.z - prev.z); prev = me;
      out.minD = Math.min(out.minD, d);
      // a slow page re-aims every second or two: run to where the ball will be, not where it was
      const lead = Math.min(1.2, d / 7), tx = v.ball.x + (v.ball.vx ?? 0) * lead, tz = v.ball.z + (v.ball.vz ?? 0) * lead;
      const a = wrap(Math.atan2(tx - me.x, tz - me.z) - v.cam), push = d < 1.2 ? 0.5 : 1;
      if (!down) { await p.t.down(3, j.x, j.y); down = true; }
      await p.t.move(3, j.x - Math.sin(a) * r * push, j.y - Math.cos(a) * r * push, 1);
      // in reach (the server keeps an asked pass or shot ~1.2 s for the ball to reach the foot), or now and then anyway: a player presses a button away from the ball too
      if ((d < 2.8 && Date.now() - last > 1000) || Date.now() - last > 6000) {
        const what = order[k++ % order.length], c = await p.t.centre(`#campPad .cp-${what}`);
        await p.t.down(9, c.x, c.y); await sleep(what === 'shot' ? 450 : 80); await p.t.up(9);
        out.taps[what]++; last = Date.now();
      }
      await sleep(90);
    }
  } finally { if (down) await p.t.up(3); }
  out.minD = +out.minD.toFixed(2); out.ran = +out.ran.toFixed(1);
  return out;
}

const pages = [];
let W = null;
try {
  W = await startWorker();
  const A = await page('Awa', 2, 'g-campui-awa'), B = await page('Moussa', 4, 'g-campui-moussa');
  pages.push(A, B);
  await A.open(); await B.open();
  for (let i = 2; i < PAGES; i++) { const X = await page(['Fatou', 'Ibou'][i - 2], i, `g-campui-${i}`); pages.push(X); await X.open(); }
  check(`0. the local Workers runtime serves the online build; ${PAGES} real pages online (presence and account), each its own account`, A.tag && B.tag && A.tag !== B.tag,
    `tags ${A.tag} ${B.tag} · loaded in ${pages.map(p => p.loadS.toFixed(0) + ' s').join(', ')}`);

  // ------------------------------------------------------------------ the scene: both in the Corniche, on the street beside the pitch (19 m from its grass), face to face
  for (const p of pages) { await p.d(() => window.__dakar.teleport('corniche')); }
  for (const p of pages) await p.until(() => window.__dakar.pos().hub === 'corniche' && !!window.__dakar.grandCamp.info().pitch && window.__dakar.pos().mode === 'play', null, 300000);
  const pitch = await A.d(() => window.__dakar.grandCamp.info().pitch);
  const spotA = { x: pitch.x, z: pitch.z - 36 }, spotB = { x: pitch.x + 1.4, z: pitch.z - 36 };
  await A.d(s => window.__dakar.place(s.x, s.z, Math.PI / 2), spotA); await B.d(s => window.__dakar.place(s.x, s.z, -Math.PI / 2), spotB);
  for (const [i, p] of pages.slice(2).entries()) await p.d(s => window.__dakar.place(s.x, s.z, 0), { x: pitch.x - 6 + 3 * i, z: pitch.z - 19.5 });   // watching from the touchline
  const seeEach = await A.until(t => window.__dakar.presence().peers.some(p => p.tag === t), B.tag, 60000) && await B.until(t => window.__dakar.presence().peers.some(p => p.tag === t), A.tag, 60000);
  check('0b. the scene: both in the Corniche on the street by the pitch, side by side, in the same presence room', seeEach, JSON.stringify({ pitch }));

  // ------------------------------------------------------------------ 1. the organizer's form: 1 000 F, 10 players, partage égal, privé
  await A.campApp();
  const listA = await A.screen();
  await A.tap('#phone .gc-new');
  await A.until(() => window.__dakar.phoneInfo().arg === 'new');
  await A.tap('#phone .gc-chip[data-fee="1000"]');
  await A.tap('#phone [data-size="10"]');
  await A.tap('#phone [data-dist="team"]');
  await A.tap('#phone [data-open="0"]');
  await A.wait(300);
  const formText = await A.screen();
  await A.d(() => document.querySelector('#phone .gc-sum-card')?.scrollIntoView({ block: 'center' }));
  await A.shot('1-form');
  check('1a. the form: Gratuit · 500 F · 1 000 F · 2 500 F · 5 000 F or typed, 6 · 10 · 14, the two distributions, Public / Privé; the live summary « Cagnotte totale si tous les joueurs participent : 10 000 F », « Gain par gagnant : 2 000 F », « Sans commission »',
    /Gratuit/.test(formText) && /500 F/.test(formText) && /2 500 F/.test(formText) && /5 000 F/.test(formText) && /Autre montant/.test(formText) && /14 · 7 contre 7/.test(formText)
    && /Équipe gagnante — partage égal/.test(formText) && /Un seul gagnant/.test(formText) && /Privé/.test(formText)
    && /Cagnotte totale si tous les joueurs participent : 10 000 F/.test(formText) && /Gain par gagnant : 2 000 F/.test(formText) && /Sans commission/.test(formText) && /Organiser un Grand Camp|Organiser/.test(listA),
    formText.slice(0, 420));
  await A.tap('#phone .gc-create');
  const created = await A.until(() => /^[0-9a-f]{16}$/.test(window.__dakar.phoneInfo().arg ?? '') && !!window.__dakar.grandCamp.info().match, null, 60000);
  const match = await A.d(() => window.__dakar.phoneInfo().arg);
  await A.until(() => /Rouge/.test(document.querySelector('#phone .gc-s-teams')?.innerText ?? ''), null, 30000);
  const lobbyA = await A.screen();
  check('1b. « Organiser le match »: the server opened it; the lobby shows « Rouge » and « Jaune », my place (organisateur), the fee and the pool, « Aller au terrain » (19 m from the grass: « Prêt » says why), « Inviter », « Retirer un joueur », « Annuler le match »',
    created && /Grand Camp de Awa/.test(lobbyA) && /Rouge/.test(lobbyA) && /Jaune/.test(lobbyA) && /organisateur/.test(lobbyA) && /Mise 1 000 F · 5 contre 5 · partage égal · privé/.test(lobbyA)
    && /Aller au terrain/.test(lobbyA) && /Va d’abord au terrain de la Corniche/.test(lobbyA) && /Inviter/.test(lobbyA) && /Retirer un joueur/.test(lobbyA) && /Annuler le match/.test(lobbyA) && /1\/10 joueurs/.test(lobbyA),
    `match ${match} · ${lobbyA.slice(0, 500)}`);
  await A.d(() => window.__dakar.phoneClose());

  // ------------------------------------------------------------------ 2. the invitation from the street's player menu; B opens the match from the message
  await A.d(s => window.__dakar.place(s.x, s.z, Math.PI / 2), spotA);
  await A.until(t => window.__dakar.focus()?.id?.startsWith('peer:') && window.__dakar.presence().peers.some(p => p.tag === t), B.tag, 30000);
  await A.wait(600);
  await A.t.tap('#act');
  await A.until(() => [...document.querySelectorAll('#modal button')].some(b => /Inviter au Grand Camp/.test(b.textContent)), null, 20000);
  const menuA = NB(await A.d(() => document.querySelector('#modal')?.innerText ?? ''));
  await A.tapText('#modal button', /Inviter au Grand Camp/);
  const invited = await until(async () => (await B.d(() => window.__dakar.account().unread())) >= 1, 30000, 300);
  await B.d(t => window.__dakar.phone(`messages:${t}`), A.tag);
  await B.until(() => !!document.querySelector('#phone .mg-camp'), null, 30000);
  const bubble = NB(await B.d(() => document.querySelector('#phone .mg-campinv')?.innerText ?? ''));
  const rawText = await B.d(t => window.__dakar.account().items(t).filter(i => i.k === 'text').pop()?.text ?? '', A.tag);
  await B.shot('2-message-voir-le-match');
  check('2a. « Inviter au Grand Camp » from the street’s player menu: the server’s invitation and an ordinary text message (a 1.0 client reads the text), shown to a 1.0.1 client with « Voir le match »',
    /Inviter au Grand Camp/.test(menuA) && invited && /Je t’invite à mon Grand Camp au terrain de la Corniche : mise 1 000 F, 5 contre 5/.test(bubble) && /Voir le match/.test(bubble) && rawText.includes(`match ${match}`),
    JSON.stringify({ menu: menuA.slice(0, 160), bubble, rawText: NB(rawText) }));
  await B.tap('#phone .mg-camp');
  await B.until(m => window.__dakar.phoneInfo().screen === 'camp' && window.__dakar.phoneInfo().arg === m, match, 30000);
  await B.until(() => /Rejoindre/.test(document.querySelector('#phone .gc-s-acts')?.innerText ?? ''), null, 30000);
  const before = await B.screen();
  await B.tap('#phone .gc-a[data-act="join"]');
  const joined = await B.until(() => /\(toi\)/.test(document.querySelector('#phone .gc-s-teams')?.innerText ?? ''), null, 30000);
  const lobbyB = await B.screen();
  check('2b. B opens the match from the message: before accepting he sees the fee, the pool if full, the distribution and « privé »; « Rejoindre » gives him a place in the other team (Jaune)',
    /Mise 1 000 F/.test(before) && /Cagnotte totale si tous les joueurs participent : 10 000 F/.test(before) && /partage égal/.test(before) && /Privé/.test(before) && joined && /Jaune/.test(lobbyB) && /2\/10 joueurs/.test(lobbyB),
    before.slice(0, 300));
  await A.d(() => window.__dakar.phoneHooks.openPhone('grandcamp')); await A.until(() => window.__dakar.phoneInfo().screen === 'camp' && !window.__dakar.phoneInfo().arg);
  await A.tap('#phone [data-gc="mine"] .pk-row');
  await A.until(() => /Moussa/.test(document.querySelector('#phone .gc-s-teams')?.innerText ?? ''), null, 30000);

  // ------------------------------------------------------------------ 3. eight bots (invited by the organizer: the scene), joined and ready
  const bots = Array.from({ length: 8 }, (_, i) => bot(i + 2));
  const funded = await Promise.all(bots.map(b => account(b.key, b.name, 5000)));
  const botInv = await A.d(tags => window.__dakar.grandCamp.inviteTags(tags), bots.map(b => b.tag));
  if (!botInv?.ok) throw new Error(`the bots' invitation was refused: ${JSON.stringify(botInv)}`);
  for (const b of bots) { await b.client.open(match); const r = await b.client.join(); if (!r.ok) throw new Error(`${b.name} could not join: ${r.reason}`); }
  for (const b of bots) { const r = await b.client.ready(); if (!r.ok) throw new Error(`${b.name} not ready: ${r.reason}`); }
  await A.until(() => /10\/10 joueurs/.test(document.querySelector('#phone .gc-s-head')?.innerText ?? ''), null, 30000);
  await A.wait(800);
  await A.d(() => document.querySelector('#phone .gc-s-teams')?.scrollIntoView({ block: 'start' }));
  await A.shot('3-lobby');
  const lobby10 = await A.screen();
  check('3. eight bots joined (5 v 5) and are ready: their fees held (« prêt ✓ »), the pool 8 000 F; Awa and Moussa not yet ready',
    funded.every(f => f?.ok) && /10\/10 joueurs/.test(lobby10) && (lobby10.match(/prêt ✓/g) ?? []).length === 8 && /Cagnotte maintenant : 8 000 F/.test(lobby10),
    lobby10.slice(0, 400));

  // ------------------------------------------------------------------ 4. both walk to the pitch, then « Prêt »: the fee pending → done
  for (const p of [A, B]) await p.d(() => window.__dakar.phoneClose());
  const [dA, dB] = await Promise.all([walk(A, pitch.x - 2, pitch.z - 19.5), walk(B, pitch.x + 2, pitch.z - 19.5)]);
  const atA = (await A.info()).atPitch, atB = (await B.info()).atPitch;
  check('4a. both walk to the pitch with the stick (no teleport): now « at the pitch »', atA && atB, JSON.stringify({ dA, dB }));
  const watch = p => p.d(() => { window.__moneySeen = []; const el = document.getElementById('phone'); new MutationObserver(() => { for (const li of document.querySelectorAll('#phone .gc-m')) { const t = li.className + '|' + li.textContent; if (!window.__moneySeen.includes(t)) window.__moneySeen.push(t); } }).observe(el, { subtree: true, childList: true, characterData: true }); });
  const tm0 = {};
  for (const p of [A, B]) {
    tm0[p.name] = { wallet: await p.d(() => window.__dakar.state.wallet), tm: await p.d(() => window.__dakar.account().balance?.amount ?? 0) };
    await p.d(m => window.__dakar.phoneHooks.openPhone(`grandcamp:${m}`), match);       // the route other modules use (« Autour de moi »)
    await p.until(() => /Prêt/.test(document.querySelector('#phone .gc-s-acts')?.innerText ?? '') && !document.querySelector('#phone .gc-a[data-act="ready"]')?.disabled, null, 30000);
    await watch(p);
    const quote = NB(await p.d(() => document.querySelector('#phone .gc-quote')?.textContent ?? ''));
    notes[`quote ${p.name}`] = quote;
    if (p === A) await A.shot('4-lobby-pret');
    await p.tap('#phone .gc-a[data-act="ready"]');
  }
  const started = await until(() => bots.every(b => b.client.state.roster) && bots[0].client.state.lobby?.state === 'play', 60000, 200);
  const seen = {};
  for (const p of [A, B]) seen[p.name] = (await p.d(() => window.__moneySeen ?? [])).map(NB);
  const holdA = (await A.info()).money.find(m => m.step === 'hold'), holdB = (await B.info()).money.find(m => m.step === 'hold');
  check('4b. « Prêt » on both pages: the fee shown pending (« en attente du serveur… ») then done (« Mise prise : 1 000 F ») only once the server held it — 1 000 F from the wallet through Teranga Money',
    started && [A, B].every(p => seen[p.name].some(t => /wait\|Mise de 1 000 F : en attente du serveur/.test(t)) && seen[p.name].some(t => /ok\|Mise prise : 1 000 F/.test(t)))
    && holdA?.state === 'done' && holdA.amount === 1000 && holdB?.state === 'done' && /portefeuille/.test(notes['quote Awa'] ?? ''),
    JSON.stringify({ seen, quote: notes['quote Awa'] }));

  // ------------------------------------------------------------------ 5. kick-off: the pages on the pitch, PASSE · DRIBBLE · TIR, nothing else
  for (const b of bots) { b.style = lib.WARM; drive(b); }
  for (const p of [A, B]) { if (await p.d(() => !!document.querySelector('#phone .gc-a[data-act="play"]'))) await p.tap('#phone .gc-a[data-act="play"]'); else await p.d(() => window.__dakar.phoneClose()); }
  const liveBoth = await A.until(() => window.__dakar.grandCamp.info().live && window.__dakar.grandCamp.info().pad, null, 30000) && await B.until(() => window.__dakar.grandCamp.info().live && window.__dakar.grandCamp.info().pad, null, 30000);
  await A.wait(2500);
  const hud = await A.d(() => ({ act: getComputedStyle(document.getElementById('act')).display, more: getComputedStyle(document.getElementById('actMore')).display, pad: [...document.querySelectorAll('#campPad.on .cp-b')].filter(b => getComputedStyle(b).display !== 'none').map(b => b.textContent.replace(/\s+/g, ' ').trim()), band: document.getElementById('campBand')?.innerText, place: getComputedStyle(document.getElementById('place')).display }));
  const iA = await A.info();
  const onSpot = iA.me && Math.hypot(iA.me.x - iA.pos.x, iA.me.z - iA.pos.z) < 1.5;
  check('5a. kick-off: each page on the pitch at its place (the server’s body, predicted), the action area PASSE · DRIBBLE · TIR and nothing else, the band « Rouge 0 – 0 Jaune » and the clock',
    liveBoth && onSpot && hud.act === 'none' && hud.more === 'none' && hud.pad.length === 3 && /PASSE/.test(hud.pad[0]) && /DRIBBLE/.test(hud.pad[1]) && /TIR/.test(hud.pad[2]) && /Rouge/.test(hud.band) && /0 – 0/.test(hud.band) && hud.place === 'none',
    JSON.stringify({ hud, me: iA.me, pos: iA.pos, bodies: iA.bodies, full: iA.full }));
  const bodiesA = await A.until(() => window.__dakar.grandCamp.info().bodies >= 9, null, 20000);
  const iA2 = await A.info();
  check('5b. the nine other players drawn from the snapshots (their look, their team’s shirt), the NPCs’ match and kickabout aside, presence avatars of the players not drawn twice',
    bodiesA && iA2.bodies === 9 && (await A.d(() => window.__dakar.kickabout()?.booked)) === true && (await A.d(() => window.__dakar.presence().visible)) <= PAGES - 2,
    JSON.stringify({ bodies: iA2.bodies, full: iA2.full, figures: iA2.figures, presenceDrawn: await A.d(() => window.__dakar.presence().visible) }));
  // a third (fourth) page that is not in the match watches from the touchline: the street's presence shows the players on the pitch
  for (const X of pages.slice(2)) {
    const onGrass = await X.until(([tags, pt]) => { const ps = window.__dakar.presence().peers.filter(p => tags.includes(p.tag)); return ps.length === tags.length && ps.every(p => Math.abs(p.x - pt.x) < 22 && Math.abs(p.z - pt.z) < 17); }, [[A.tag, B.tag], pitch], 30000);
    const seen = await X.d(tags => window.__dakar.presence().peers.filter(p => tags.includes(p.tag)).map(p => ({ name: p.name, x: +p.x.toFixed(1), z: +p.z.toFixed(1), clip: p.clip })), [A.tag, B.tag]);
    check(`5c. ${X.name} (a real page, not in the match, at the touchline): the street’s presence shows Awa and Moussa on the pitch’s grass`, onGrass, JSON.stringify({ seen, pitch }));
    if (X === pages[2]) await X.shot('5-spectator-touchline');
  }
  // the pages play: a finger on the stick toward the ball, a second on PASSE · DRIBBLE · TIR
  const sid = async p => (await p.info()).sid;
  const sidA = await sid(A), sidB = await sid(B);
  await A.wait(500);
  for (const b of bots) b.style = lib.STILL;                                // the pages are the only movers: the ball stays loose for them (a stalled kick-off falls to the nearest player of that side: a page)
  const playing = Promise.all([play(A, 40000, ['shot', 'dribble', 'pass']), play(B, 40000, ['pass', 'dribble', 'shot'])]);
  await sleep(9000);
  await A.shot('5-match-player-camera');
  const [pa, pb] = await playing;
  const tapsOf = o => o.taps.pass + o.taps.dribble + o.taps.shot;
  for (let extra = 0; extra < 2 && (!tapsOf(pa) || !tapsOf(pb)); extra++) {   // a page that never reached the ball plays on a little (bounded: the match's clock runs)
    const more = await Promise.all([pa, pb].map((o, i) => (tapsOf(o) ? null : play([A, B][i], 15000, i ? ['pass', 'dribble', 'shot'] : ['shot', 'dribble', 'pass']))));
    more.forEach((m, i) => { if (!m) return; const o = [pa, pb][i]; for (const k of ['pass', 'dribble', 'shot']) o.taps[k] += m.taps[k]; o.loops += m.loops; o.minD = Math.min(o.minD, m.minD); o.ran += m.ran; });
  }
  const evs = bots[0].client.state.events;
  const byA = evs.filter(e => e.who === sidA && (e.k === 'pass' || e.k === 'shot')).length, byB = evs.filter(e => e.who === sidB && (e.k === 'pass' || e.k === 'shot')).length;
  const sentA = (await A.info()).log.sent, sentB = (await B.info()).log.sent;
  check('5d. the pages play through real taps (two fingers: the stick and a button): each page’s PASSE, DRIBBLE and TIR sent to the server, and the server’s events show the pages’ own passes / shots',
    ['pass', 'dribble', 'shot'].every(k => pa.taps[k] > 0 && pb.taps[k] > 0 && sentA[k] > 0 && sentB[k] > 0) && byA + byB >= 1,
    JSON.stringify({ tapsA: pa.taps, tapsB: pb.taps, sentA, sentB, serverEvents: { byA, byB }, traceA: { loops: pa.loops, minD: pa.minD, ran: pa.ran }, traceB: { loops: pb.loops, minD: pb.minD, ran: pb.ran }, kicksDrawnA: (await A.info()).log.kicks }));

  // ------------------------------------------------------------------ 6. a goal: every page shows the server's score
  for (const b of bots) b.style = (b.client.state.roster?.find(r => r.tag === b.tag)?.team ?? 0) === 0 ? lib.STRONG : lib.WEAK;
  const goal = await until(() => bots[0].client.state.events.some(e => e.k === 'goal'), 150000, 300);
  for (const b of bots) b.style = lib.WARM;
  await sleep(2500);
  const server = bots[0].client.state.snap?.score ?? null;
  const shown = await Promise.all([A, B].map(p => p.d(() => ({ score: window.__dakar.grandCamp.info().score, band: document.getElementById('campBand')?.innerText ?? '', moments: window.__dakar.grandCamp.info().log.moments }))));
  check('6. a goal: every page shows the server’s score (the band and the view), the goal said as a moment',
    goal && shown.every(s => s.score?.join() === server?.join() && NB(s.band).includes(`${server[0]} – ${server[1]}`) && s.moments.some(m => m.startsWith('goal:'))),
    JSON.stringify({ server, shown: shown.map(s => ({ score: s.score, band: NB(s.band), last: s.moments.slice(-2) })) }));
  await A.shot('6-goal-band');

  // ------------------------------------------------------------------ 7. a dropped connection: « Reconnexion… », then the pitch back; a reload mid-match: back within 60 s
  // the connection goes for a few seconds, then comes back
  await A.d(() => { window.__bandSeen = []; new MutationObserver(() => { const t = document.getElementById('campBand')?.innerText ?? ''; if (!window.__bandSeen.includes(t)) window.__bandSeen.push(t); }).observe(document.getElementById('campBand'), { subtree: true, childList: true, characterData: true }); });
  await A.d(() => window.__dakar.grandCamp.dropSocket(6000));            // the client's own back-off: back in 6–10 s
  // the band is drawn by the game's frame; a page drawing well under a frame a second here could miss the window: one game frame is stepped (no render)
  let reco = false, recoStatus = null;
  for (let i = 0; i < 20 && !reco; i++) {
    const r = await A.d(() => { window.__dakar.step(1 / 30, 1); return { band: document.getElementById('campBand')?.innerText ?? '', status: window.__dakar.grandCamp.info().status }; });
    recoStatus = r.status; reco = /Reconnexion/.test(r.band) && r.status !== 'open';
    if (!reco) await sleep(250);
  }
  notes.reconnectStatus = recoStatus;
  if (reco) await A.shot('7-reconnexion');
  const backA = await A.until(() => window.__dakar.grandCamp.info().status === 'open' && !!window.__dakar.grandCamp.info().me && !/Reconnexion/.test(document.getElementById('campBand')?.innerText ?? ''), null, 60000);
  notes.bandDuringDrop = (await A.d(() => window.__bandSeen ?? [])).map(NB).slice(0, 6);
  check('7a. A’s socket drops during the match: the band says « Reconnexion… », then the client is back on the pitch by itself', reco && backA, JSON.stringify({ reco, backA }));
  // the server's side, timed from the bots' socket: B's « drop » when the old page goes, « back » when the new page's socket has the pitch again
  const ev0 = bots[0].client.state.events.length;
  let backAt = null, dropAt = null;
  const offEv = bots[0].client.onEvent(e => { if (e.who !== sidB) return; if (e.k === 'drop' && dropAt === null) dropAt = Date.now(); if (e.k === 'back' && backAt === null) backAt = Date.now(); });
  await A.d(() => { window.__dakar.step(1 / 30, 1); window.__dakar.pause(true); });   // (A's stick at rest; its game loop paused while B reloads: CPU for B)
  const tR = Date.now();
  await B.page.reload({ timeout: 300000 });
  B.t = await realTouch(B.page);
  await until(() => backAt !== null || (dropAt === null && Date.now() - tR > 15000), 90000, 100);
  const liveB = await B.page.waitForFunction(() => window.__dakar?.grandCamp?.info?.().live && !!window.__dakar.grandCamp.info().me && window.__dakar.grandCamp.info().pad, null, { timeout: 420000 }).then(() => true, () => false);
  const backS = (Date.now() - tR) / 1000;
  await A.d(() => window.__dakar.pause(false));
  offEv();
  const serverBackS = backAt !== null ? (backAt - tR) / 1000 : dropAt === null ? 0 : null;     // never dropped: the new socket took over before the old one closed
  const bSeat = bots[0].client.state.lobby?.players.find(x => x.tag === B.tag);
  const iB = await B.info();
  check('7b. B reloads mid-match: the page opens the match’s socket again at once (before the city has loaded); the server has B back on the pitch within 60 s (same place on the roster, not gone); the page draws and plays it again once loaded',
    serverBackS !== null && serverBackS < 60 && liveB && !!iB.me && bSeat && !bSeat.gone && bSeat.on && iB.sid === sidB,
    `server: back on the pitch ${serverBackS === null ? 'never' : serverBackS.toFixed(1) + ' s'} after the reload began (drop ${dropAt ? ((dropAt - tR) / 1000).toFixed(1) + ' s' : 'none'}) · page live again in ${backS.toFixed(1)} s (this machine's full reload of the game) · events since: ${bots[0].client.state.events.slice(ev0).filter(e => e.who === sidB).map(e => e.k).join(',')} · ${JSON.stringify({ sid: iB.sid, seat: bSeat ? { on: bSeat.on, gone: !!bSeat.gone } : null })}`);
  notes.reloadServerBackS = serverBackS === null ? null : +serverBackS.toFixed(1);
  notes.reloadPageLiveS = +backS.toFixed(1);

  // ------------------------------------------------------------------ 8. full time; the result and the payout only after the server's settlement
  for (const b of bots) b.style = (b.client.state.roster?.find(r => r.tag === b.tag)?.team ?? 0) === 0 ? lib.STRONG : lib.WEAK;
  const [pa8, pb8] = await Promise.all([play(A, 30000), play(B, 30000)]);
  notes.taps = { Awa: { ...pa.taps }, Moussa: { ...pb.taps } };
  for (const k of ['pass', 'dribble', 'shot']) { notes.taps.Awa[k] += pa8.taps[k]; notes.taps.Moussa[k] += pb8.taps[k]; }
  const ended = await until(() => bots.every(b => b.client.state.result), 360000, 300);
  for (const b of bots) stopBot(b);
  const R = bots[0].client.state.result;
  await Promise.all([A, B].map(p => p.until(() => !!window.__dakar.grandCamp.info().result, null, 30000)));
  await A.wait(1500);
  await A.shot('8-result-card');
  const order = await Promise.all([A, B].map(p => p.d(() => { const i = window.__dakar.grandCamp.info(); return { result: i.result, money: i.money, moments: i.log.moments, results: i.log.results }; })));
  const L = ledgerRows(W, match);
  const pool = L?.pools[0], payOps = (L?.ops ?? []).filter(o => o.kind === 'payout' || o.kind === 'refund');
  const pageMoney = [A, B].map((p, i) => ({ name: p.name, payout: order[i].money.filter(m => (m.step === 'payout' || m.step === 'refund') && m.state === 'done').map(m => m.amount), expect: R?.payouts.find(x => x.tag === p.tag)?.amount ?? 0 }));
  notes.pagesInMatch = { sent: { Awa: (await A.info()).log.sent, Moussa: (await B.info()).log.sent }, serverEvents: Object.fromEntries([['Awa', sidA], ['Moussa', sidB]].map(([n, sd]) => [n, bots[0].client.state.events.filter(e => e.who === sd && (e.k === 'pass' || e.k === 'shot' || e.k === 'goal')).map(e => e.k)])) };
  notes.pagePlayersSeen = { gone: (bots[0].client.state.lobby?.players ?? []).filter(x => x.gone).map(x => x.name), events: bots[0].client.state.events.filter(e => (e.who === sidA || e.who === sidB) && ['drop', 'back', 'gone'].includes(e.k)).map(e => `${e.k}:${e.who}@${e.c / 10}s`) };
  check('8a. full time: the server settled the pool once (the ledger’s row « settled », its payouts = the result’s); each page shows the result and its payout or nothing, as the result says',
    ended && !!R && pool && (pool.state === 'settled' || pool.state === 'refunded') && payOps.reduce((a, o) => a + o.amount, 0) === R.total && order.every(o => !!o.result && o.result.at === R.at)
    && pageMoney.every(m => (m.payout[0] ?? 0) === m.expect) && !notes.pagePlayersSeen.gone.some(n => n === 'Awa' || n === 'Moussa'),
    JSON.stringify({ end: R?.end, score: R?.score, winner: R?.winner, total: R?.total, pool: pool?.state, pageMoney, gone: notes.pagePlayersSeen.gone, pageEvents: notes.pagePlayersSeen.events }));
  await A.d(m => window.__dakar.phone(`camp:${m}`), match);
  await A.until(() => /Fermer/.test(document.querySelector('#phone .gc-s-result')?.innerText ?? ''), null, 30000);
  await A.wait(600);
  await A.shot('8-result');
  const resText = NB(await A.d(() => document.querySelector('#phone .gc-s-result')?.innerText ?? ''));
  check('8b. the result screen (the phone): who won, the score, and my share or my loss as the server wrote it', /Victoire|Défaite|Match nul|arrêté/.test(resText) && /\d – \d/.test(resText), resText);
  // Teranga Money: each page's balance = the ledger's
  await sleep(2500);
  const L2 = ledgerRows(W, match);
  const tmNow = await Promise.all([A, B].map(p => p.d(() => window.__dakar.account().balance?.amount ?? null)));
  const ledgerBal = [A, B].map(p => L2.accounts.find(a => a.tag === p.tag)?.balance ?? null);
  check('8c. Teranga Money on each page = the ledger’s balance after the settlement', tmNow.every((b, i) => b === ledgerBal[i] && b !== null), JSON.stringify({ pages: tmNow, ledger: ledgerBal, before: tm0 }));
  await A.tap('#phone .gc-s-result [data-act="done"]');
  await B.d(m => window.__dakar.phone(`camp:${m}`), match);
  await B.until(() => /Fermer/.test(document.querySelector('#phone .gc-s-result')?.innerText ?? ''), null, 30000);
  await B.tap('#phone .gc-s-result [data-act="done"]');
  const forgot = await A.until(() => !window.__dakar.grandCamp.info().mine, null, 15000) && await B.until(() => !window.__dakar.grandCamp.info().mine, null, 15000);
  for (const b of bots) b.client.close();
  for (const p of [A, B]) await p.d(() => window.__dakar.phoneClose());

  // ------------------------------------------------------------------ 9. the draw calls and the bodies per quality: a 10-player match (page B + 9 bots), a 7 v 7 (page A + 13 bots)
  /** A measurement match: `p` organizes it (free, public: the scene), `n` bots join and ready, `p` taps « Prêt »; then, each quality in turn (Réglages, a real tap: the hub is rebuilt, the match goes on), the draw calls of 24 frames and the bodies drawn. */
  async function measure(p, n, label) {
    const bs = Array.from({ length: n }, (_, i) => bot(i + (n === 9 ? 30 : 50)));
    await Promise.all(bs.map(b => account(b.key, b.name, 5000)));
    await p.d(s => window.__dakar.place(s.x, s.z, 0), { x: pitch.x + (n === 9 ? -3 : 3), z: pitch.z - 19.5 });
    const m = await p.d(async size => { const r = await window.__dakar.grandCamp.organize({ fee: 0, size, dist: 'team', open: true, hub: 'corniche' }); return r.ok ? r.match : JSON.stringify(r); }, n + 1);
    if (!/^[0-9a-f]{16}$/.test(m)) throw new Error(`${label}: not organized: ${m}`);
    for (const b of bs) { await b.client.open(m); const r = await b.client.join(); if (!r.ok) throw new Error(`${b.name} could not join (${label}): ${r.reason}`); await b.client.ready(); }
    await p.d(mm => window.__dakar.phone(`camp:${mm}`), m);
    await p.until(k => !document.querySelector('#phone .gc-a[data-act="ready"]')?.disabled && new RegExp(`${k}/${k}`).test(document.querySelector('#phone .gc-s-head')?.innerText ?? ''), n + 1, 30000);
    await p.tap('#phone .gc-a[data-act="ready"]');
    const go = await until(() => bs.every(b => b.client.state.roster), 60000, 200);
    for (const b of bs) { b.style = lib.WARM; drive(b); }
    await p.until(() => !!document.querySelector('#phone .gc-a[data-act="play"]'), null, 20000);
    if (await p.d(() => !!document.querySelector('#phone .gc-a[data-act="play"]'))) await p.tap('#phone .gc-a[data-act="play"]'); else await p.d(() => window.__dakar.phoneClose());
    await p.until(k => window.__dakar.grandCamp.info().live && window.__dakar.grandCamp.info().bodies >= k, n, 60000);
    const out = {};
    for (const q of ['low', 'medium', 'high']) {
      if (q !== (await p.d(() => window.__dakar.phoneInfo().quality))) {
        await p.d(() => window.__dakar.phone('reglages')); await p.until(() => window.__dakar.phoneInfo().screen === 'reglages');
        await p.tap(`#phone [data-q="${q}"]`); await p.d(() => window.__dakar.phoneClose());
        const back = await p.until(([qq, k]) => window.__dakar.phoneInfo().quality === qq && window.__dakar.grandCamp.info().live && window.__dakar.grandCamp.info().bodies >= k, [q, n], 420000);
        if (!back) {
          const why = await p.d(() => { const i = window.__dakar.grandCamp.info(), pos = window.__dakar.pos(); return { quality: window.__dakar.phoneInfo().quality, live: i.live, bodies: i.bodies, status: i.status, state: i.state, mine: i.mine, hub: pos.hub, mode: pos.mode, x: pos.x, z: pos.z, phone: window.__dakar.phoneInfo().open }; }).catch(e => String(e));
          throw new Error(`${label}: the match is not drawn again on ${q} after the hub's rebuild: ${JSON.stringify(why)}`);
        }
      }
      await p.wait(5000);                                                  // the street's budget has adopted the match's bodies (its scan: every 2 s)
      const s = await p.d(async () => { const o = []; for (let i = 0; i < 30; i++) { await new Promise(r => requestAnimationFrame(r)); const g = window.__dakar.grandCamp.info(), h = window.__dakar.humanoids(); o.push([window.__dakar.drawCalls(), g.full, g.figures, h.full, h.budget, g.bodies, g.live ? 1 : 0]); } return o; });
      out[q] = { maxCalls: Math.max(...s.map(x => x[0])), avgCalls: Math.round(s.reduce((a, x) => a + x[0], 0) / s.length), matchBodies: Math.min(...s.map(x => x[5])), matchFull: Math.max(...s.map(x => x[1])), matchFigures: Math.max(...s.map(x => x[2])),
        streetFull: Math.max(...s.map(x => x[3])), streetBudget: s[0][4], live: s.every(x => x[6] === 1), budget: { low: 180, medium: 300, high: 420 }[q] };
      if (q === 'low') await p.shot(`9-match-${n + 1}-low`);
    }
    await p.d(() => window.__dakar.phone('reglages')); await p.until(() => window.__dakar.phoneInfo().screen === 'reglages'); await p.tap('#phone [data-q="low"]'); await p.d(() => window.__dakar.phoneClose());
    for (const b of bs) { stopBot(b); b.client.close(); }
    return { started: go, ...out };
  }
  await A.d(() => window.__dakar.pause(true));                            // (one page drawn at a time: the machine's other agents keep it busy)
  const perf10 = await measure(B, 9, '10 players');
  notes.perf10 = perf10;
  await B.page.close().catch(() => {});                                  // (the machine draws one page for the 7 v 7)
  await A.d(() => window.__dakar.pause(false));
  check('9a. a 10-player match (page B + 9 bots): draw calls within 180 / 300 / 420 on each quality; the players drawn full or as figures by the street’s shared budget, the nearest first',
    perf10.started && ['low', 'medium', 'high'].every(q => perf10[q].live && perf10[q].matchBodies >= 9 && perf10[q].maxCalls <= perf10[q].budget), JSON.stringify(perf10));
  const perf14 = await measure(A, 13, '14 players');
  notes.perf14 = perf14;
  check('9b. a 7 v 7 (page A + 13 bots): draw calls within 180 / 300 / 420 on each quality; on Low at most 12 animated bodies with mine (the farthest players as the cheap figure)',
    perf14.started && ['low', 'medium', 'high'].every(q => perf14[q].live && perf14[q].matchBodies >= 13 && perf14[q].maxCalls <= perf14[q].budget) && perf14.low.streetFull + 1 <= 12 && perf14.low.matchFigures >= 1, JSON.stringify(perf14));
  check('9c. the earlier match was closed and forgotten on both pages after its result (« Fermer »), so each could open the next', forgot, '');

  check('no page errors', pages.every(p => !p.errors.length), JSON.stringify(pages.map(p => ({ [p.name]: p.errors.slice(0, 3) }))));
} catch (e) {
  check('the check went through', false, e.stack ?? String(e));
} finally {
  await browser.close().catch(() => {});
  if (worker) { try { worker.kill('SIGTERM'); } catch { /* gone */ } }
  const failed = results.filter(r => !r.ok).length;
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ at: new Date().toISOString(), pages: PAGES, bots: { match10: 8, match14: 13 }, passed: results.length - failed, failed, notes, results }, null, 2));
  console.log(`${results.length - failed}/${results.length} passed · ${PAGES} real pages · bots: 8 (10-player match), 13 (14-player match)`);
  process.exitCode = failed ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 1500).unref();
}
