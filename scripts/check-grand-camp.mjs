// Dakar Rek 1.0.1 — Grand Camp (docs/release/GRAND-CAMP-RULES-1.0.1.md): the server-authoritative player-organized match, end to end on the real
// local Workers runtime (`wrangler dev --local`, fresh state), with 10 INDEPENDENT clients: 10 device keys, 10 accounts, each funded through the
// ledger's own top-up (`fund` on /api/me). No browser: each player is the real client module (src/online/campClient.ts, bundled here with esbuild)
// driven by a scripted bot (tests/helpers/campBot.ts) that only reads its snapshots and only sends stick frames (move vector, facing, pass /
// dribble / shoot with a power). The phone's screens and the drawn match are D2's; this checks the server, the protocol, the client and the money.
//
//   Run 1 (production timings): the organizer opens a public 10-player match at 1 000 F, equal split; 9 find it in the district's list and join;
//   5 v 5; one un-readies and is refunded; one readies with part of the fee from the wallet; all ready: kick-off; the bots play; one player drops
//   and comes back within 60 s to the same team; one leaves for good; full time; every client saw the same events in the same order; the ledger
//   (read from its own SQLite file) shows one settlement, the pot equal to the holds, each winner's +2 000 F, each loser's −1 000 F, a bystander
//   untouched, totals conserved.
//   Run 2 (a second worker, CAMP_TEST_CLOCK=20: a 20 s match): a cancelled lobby refunds everyone; a player without the fee cannot be ready (told
//   why); a draw at full time refunds everyone; a 0 F match touches no money.
// Usage: node scripts/check-grand-camp.mjs          Ports: CAMP_PORT (default 8743) and the next one, inspectors at +500. Logs and results: CAMP_TMP.
import { spawn } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PORT = Number(process.env.CAMP_PORT || 8743);
const TMP = process.env.CAMP_TMP || path.join(os.tmpdir(), `dakar-camp-check-${PORT}`);
fs.rmSync(TMP, { recursive: true, force: true }); fs.mkdirSync(TMP, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail: typeof detail === 'string' ? detail : JSON.stringify(detail) }); console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`); return !!ok; };
const until = async (fn, ms = 15000, step = 50) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (await fn()) return true; } catch { /* not yet */ } await sleep(step); } return false; };
const tagOf = key => createHash('sha256').update(`dakar-rek:tag:${key}`).digest().subarray(0, 8).toString('hex');
const F = n => `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} F`;

// ------------------------------------------------------------------ the client module and the bots, as the game ships them (TypeScript → one ES module)
const esbuild = createRequire(import.meta.url)(path.join(ROOT, 'node_modules/esbuild'));
await esbuild.build({
  stdin: { contents: "export { CampClient } from './src/online/campClient'; export { CampBot, STRONG, WEAK, STILL, WARM } from './tests/helpers/campBot';", resolveDir: ROOT, loader: 'ts' },
  bundle: true, format: 'esm', platform: 'neutral', target: 'es2022', outfile: path.join(TMP, 'camp-lib.mjs'), logLevel: 'warning',
});
const lib = await import(pathToFileURL(path.join(TMP, 'camp-lib.mjs')).href);

// ------------------------------------------------------------------ a local worker (the project's wrangler.jsonc, absolute paths, empty assets, fresh state)
const workers = [];
async function startWorker(port, name, vars = []) {
  const dir = path.join(TMP, name); fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'assets', 'index.html'), '<!doctype html><title>check</title>');
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'wrangler.jsonc'), 'utf8').split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n'));
  delete cfg.$schema; delete cfg.build;
  cfg.main = path.join(ROOT, cfg.main); cfg.assets = { ...cfg.assets, directory: path.join(dir, 'assets') };
  fs.writeFileSync(path.join(dir, 'wrangler.json'), JSON.stringify(cfg, null, 2));
  const w = { base: `http://127.0.0.1:${port}/`, dir, logs: '' };
  w.proc = spawn(process.execPath, [path.join(ROOT, 'node_modules/wrangler/bin/wrangler.js'), 'dev', '--local', '--config', path.join(dir, 'wrangler.json'), '--ip', '127.0.0.1', '--port', String(port),
    '--inspector-port', String(port + 500), '--persist-to', path.join(dir, 'state'), '--show-interactive-dev-session=false', ...vars.flatMap(v => ['--var', v])],
  { cwd: ROOT, env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  const log = fs.createWriteStream(path.join(TMP, `${name}-wrangler.log`));
  for (const s of [w.proc.stdout, w.proc.stderr]) s.on('data', b => { w.logs = (w.logs + b).slice(-40000); log.write(b); });
  workers.push(w);
  const end = Date.now() + 180000;
  while (Date.now() < end) {
    if (w.proc.exitCode !== null) throw new Error(`wrangler exited: ${w.logs}`);
    try { if ((await fetch(new URL('/api/health', w.base))).ok) return w; } catch { /* starting */ }
    await sleep(400);
  }
  throw new Error(`wrangler did not answer: ${w.logs}`);
}

// ------------------------------------------------------------------ accounts: /api/me, the ledger's own top-up, the balance the server gives
function account(base, key, name) {
  return new Promise((resolve, reject) => {
    const u = new URL('/api/me', base); u.protocol = 'ws:'; u.search = new URLSearchParams({ key, name, look: '1' }).toString();
    const ws = new WebSocket(u), a = { ws, inbox: [] };
    const t = setTimeout(() => reject(new Error(`no welcome for ${name}`)), 20000);
    ws.addEventListener('message', e => { if (e.data === 'pong') return; const m = JSON.parse(e.data); a.inbox.push(m); if (m.type === 'welcome') { clearTimeout(t); a.welcome = m; resolve(a); } });
    ws.addEventListener('error', () => { clearTimeout(t); reject(new Error('account socket error')); }, { once: true });
    a.req = async m => { m.id ??= randomUUID(); const from = a.inbox.length; ws.send(JSON.stringify(m)); const ok = await until(() => a.inbox.slice(from).some(x => x.type === 'ack' && x.id === m.id), 10000); return ok ? a.inbox.slice(from).find(x => x.type === 'ack' && x.id === m.id) : null; };
    a.close = () => new Promise(r => { if (ws.readyState !== 1) return r(); ws.addEventListener('close', r, { once: true }); ws.close(); setTimeout(r, 2000); });
  });
}
/** The Teranga Money balance the server holds now (a fresh connection's welcome). */
async function balance(base, key) { const a = await account(base, key, 'Solde'); const b = a.welcome.balance; await a.close(); return b; }
/** The ledger's own rows, read from its SQLite file (a copy: the worker keeps the file open). */
function ledgerRows(w, match) {
  const dir = path.join(w.dir, 'state', 'v3', 'do', 'dakar-rek-Social');
  const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.sqlite') && x !== 'metadata.sqlite')) {
    const copy = path.join(TMP, `ledger-copy-${Date.now()}.sqlite`);
    fs.copyFileSync(path.join(dir, f), copy);
    for (const ext of ['-wal', '-shm']) if (fs.existsSync(path.join(dir, f + ext))) fs.copyFileSync(path.join(dir, f + ext), copy + ext);
    const db = new DatabaseSync(copy);
    try {
      if (!db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'accounts'`).get()) continue;
      const has = !!db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'camp_pools'`).get();
      const q = (sql, ...a) => (has ? db.prepare(sql).all(...a) : []);
      return {
        pools: q('SELECT * FROM camp_pools WHERE match = ?', match), holds: q('SELECT * FROM camp_holds WHERE match = ?', match), ops: q('SELECT * FROM camp_ops WHERE match = ?', match),
        accounts: db.prepare('SELECT tag, balance, funded FROM accounts').all(), history: db.prepare(`SELECT COUNT(*) AS n FROM ops WHERE kind NOT IN ('fund', 'cashout', 'pay')`).get().n,
      };
    } finally { db.close(); }
  }
  return null;
}

// ------------------------------------------------------------------ players: the client module, a bot on its snapshots
const NAMES = ['Awa', 'Moussa', 'Fatou', 'Ibou', 'Khady', 'Modou', 'Ndeye', 'Pape', 'Aminata', 'Cheikh', 'Seynabou', 'Lamine', 'Mariama', 'Ousmane'];
function player(base, i) {
  const key = randomBytes(16).toString('hex'), name = NAMES[i % NAMES.length];
  const client = new lib.CampClient({ key: () => key, profile: () => ({ name, look: i % 6 }), endpoint: new URL('/api/camp', base).href, WebSocketImpl: WebSocket, fetchImpl: fetch });
  return { i, key, name, tag: tagOf(key), client, bot: null, timer: null, style: lib.STILL };
}
const teamIn = (c, sid) => c.state.roster?.find(r => r.sid === sid)?.team ?? null;
/** The bot plays from this player's own snapshots, 20 times a second, through `input` (the stick and the actions a thumb would send). */
function drive(p) {
  const t0 = Date.now();
  p.timer = setInterval(() => {
    const c = p.client, s = c.state.snap, sid = c.state.sid;
    if (!s || sid === null || c.state.lobby?.state !== 'play' || c.state.status !== 'open') return;
    p.bot ??= new lib.CampBot(sid, teamIn(c, sid), p.style, p.i + 1);
    p.bot.style = p.style;
    const o = p.bot.think(s, x => teamIn(c, x), (Date.now() - t0) / 1000);
    c.input(o.mx, o.mz, o.f, o.a, o.p);
  }, 50);
}
const stop = p => { if (p.timer) clearInterval(p.timer); p.timer = null; };
const seat = (p, of = p) => of.client.state.lobby?.players.find(x => x.tag === p.tag) ?? null;
const evKey = e => `${e.n}:${e.k}:${e.team ?? ''}:${e.who ?? ''}:${e.to ?? ''}:${e.sc ? e.sc.join('-') : ''}`;

try {
  // ==================================================================================================== run 1: ten players, real timings
  const W = await startWorker(PORT, 'main');
  const ps = Array.from({ length: 10 }, (_, i) => player(W.base, i));
  const by = player(W.base, 10);                                                   // a bystander: funded, never plays
  const before = {};
  for (const p of [...ps, by]) {
    const a = await account(W.base, p.key, p.name);
    const r = await a.req({ type: 'fund', amount: p.i === 9 ? 400 : 5000 });
    before[p.tag] = r?.ok ? r.balance : null; p.tag2 = a.welcome.tag;
    await a.close();
  }
  check('0. local Workers runtime with the v3 GrandCamp class; 11 accounts (10 players + a bystander) funded through the ledger’s own top-up',
    ps.every(p => p.tag2 === p.tag) && Object.values(before).every(b => typeof b === 'number') && before[ps[9].tag] === 400 && before[ps[0].tag] === 5000,
    `balances ${ps.map(p => before[p.tag]).join(' ')} · bystander ${before[by.tag]}`);
  const health = await (await fetch(new URL('/api/health', W.base))).json();

  // ------------------------------------------------------------------ 1. the organizer opens a public 10-player match at 1 000 F, equal split
  const [P1] = ps;
  const made = await P1.client.create({ fee: 1000, size: 10, dist: 'team', open: true, hub: 'corniche' });
  const match = made.match;
  await until(() => P1.client.state.lobby?.match === match);
  const L1 = P1.client.state.lobby;
  check('1. the organizer opens a public match: 1 000 F, 10 players, « Équipe gagnante — partage égal »; first place theirs; the pool if full 10 000 F; a winner’s share 2 000 F',
    made.ok && L1?.org === P1.tag && L1.terms.fee === 1000 && L1.terms.size === 10 && L1.terms.dist === 'team' && L1.full === 10_000 && L1.frozen === false && L1.players.length === 1 && health.features?.includes('camp'),
    `match ${match} · org ${L1?.org === P1.tag} · full ${L1?.full} · features ${JSON.stringify(health.features)}`);

  // ------------------------------------------------------------------ 2. nine players find it in the district's list and join: 5 v 5
  const listed = await lib.CampClient.list('corniche', { endpoint: new URL('/api/camp', W.base).href, fetchImpl: fetch, key: () => ps[1].key });
  const entry = listed.ok ? listed.matches.find(m => m.match === match) : null;
  check('2a. the nine others see it in the Corniche’s list before joining (fee, size, distribution, organizer, places taken)', !!entry && entry.terms.fee === 1000 && entry.count === 1 && entry.org.name === P1.name,
    JSON.stringify(entry));
  for (const p of ps.slice(1)) { await p.client.open(match); const r = await p.client.join(); if (!r.ok) throw new Error(`${p.name} could not join: ${r.reason}`); }
  await until(() => ps.every(p => p.client.state.lobby?.players.length === 10));
  const L2 = P1.client.state.lobby;
  const t0 = L2.players.filter(x => x.team === 0).map(x => x.tag), t1 = L2.players.filter(x => x.team === 1).map(x => x.tag);
  const listedFull = await lib.CampClient.list('corniche', { endpoint: new URL('/api/camp', W.base).href, fetchImpl: fetch, key: () => by.key });
  check('2b. ten players, 5 v 5 (« Rouge » / « Jaune »), the terms frozen, everyone connected; a full lobby leaves the list',
    L2.players.length === 10 && t0.length === 5 && t1.length === 5 && L2.frozen && L2.players.every(x => x.on) && L2.teams.join('/') === 'Rouge/Jaune' && listedFull.ok && !listedFull.matches.some(m => m.match === match),
    `team 0: ${t0.length}, team 1: ${t1.length}`);

  // ------------------------------------------------------------------ 3. « Prêt »: fees held; one un-readies and is refunded; one pays part from the wallet
  for (const p of ps.slice(0, 9)) { const r = await p.client.ready(); if (!r.ok) throw new Error(`${p.name} not ready: ${r.reason}`); }
  const held9 = ps.slice(0, 9).map(p => p.client.state.money.find(m => m.step === 'hold'));
  await until(() => P1.client.state.lobby?.pool === 9000);
  check('3a. nine « Prêt »: each fee held by the ledger (the client’s hold step: pending, then done with the ledger’s balance 4 000 F); pool 9 000 F',
    held9.every(m => m?.state === 'done' && m.amount === 1000 && m.balance === 4000) && P1.client.state.lobby.pool === 9000, `pool ${P1.client.state.lobby.pool}`);
  const P4 = ps[3];
  const un = await P4.client.unready();
  const rel = P4.client.state.money.find(m => m.step === 'release');
  await until(() => P1.client.state.lobby?.pool === 8000);
  const b4 = await balance(W.base, P4.key);
  check('3b. one un-readies (« Pas prêt »): the fee comes back at once — release done 1 000 F, Teranga Money 5 000 F again, pool 8 000 F',
    un.ok && rel?.state === 'done' && rel.amount === 1000 && rel.balance === 5000 && b4 === 5000 && P1.client.state.lobby.pool === 8000, `release ${JSON.stringify(rel)} · balance ${b4}`);
  const started = Promise.all(ps.map(p => until(() => !!p.client.state.roster, 20000)));
  await P4.client.ready();
  const P10 = ps[9];
  const r10 = await P10.client.ready({ fund: 600 });                              // Teranga Money 400 F + 600 F from the wallet, in the same ledger operation
  await started;
  const L3 = P1.client.state.lobby;
  check('3c. the last one readies with 400 F on Teranga Money and 600 F from the wallet (one operation, as a send): every place ready → kick-off by itself; pool 10 000 F',
    r10.ok && P10.client.state.money.find(m => m.step === 'hold')?.balance === 0 && L3.state === 'play' && L3.pool === 10_000 && ps.every(p => p.client.state.roster?.length === 10),
    `state ${L3.state} · pool ${L3.pool}`);
  const late = await ps[1].client.unready();
  check('3d. after kick-off the fee is frozen: « Pas prêt » refused (« Le match a déjà commencé. »)', !late.ok && late.reason === 'started' && /déjà commencé/.test(late.text), late.text);

  // ------------------------------------------------------------------ 4. the match: bots through the real stick messages
  for (const p of ps) { p.style = lib.WARM; drive(p); }                            // phase 1: everyone moves, passes, dribbles; nobody shoots yet
  const tKick = Date.now();
  await sleep(4000);
  const P3 = ps[2], sid3 = P3.client.state.sid, team3 = seat(P3).team;
  const lastS = () => P1.client.state.snap;
  await P3.client.close(); stop(P3);                                               // P3's connection drops
  const dropped = await until(() => seat(P3, P1)?.on === false && P1.client.state.events.some(e => e.k === 'drop' && e.who === sid3), 8000);
  const offPitch = await until(() => !lastS().players.some(x => x.sid === sid3), 3000);
  await sleep(5000);
  await P3.client.open(match); drive(P3);                                          // back after ~5 s: same place
  const back = await until(() => seat(P3, P1)?.on === true && P1.client.state.events.some(e => e.k === 'back' && e.who === sid3), 8000);
  const onPitch = await until(() => lastS().players.some(x => x.sid === sid3), 3000);
  // the events it missed while away come with its return: its list is whole again, from the first, with its own « back »
  const catchUp = await until(() => P3.client.state.events.every((e, i) => e.n === i + 1) && P3.client.state.events.some(e => e.k === 'back' && e.who === sid3), 5000);
  check('4a. a player drops during the match: off the pitch (their team one short), « drop » for everyone; back after ~5 s (within 60 s): the same pitch number and team, « back », the events missed sent again',
    dropped && offPitch && back && onPitch && catchUp && P3.client.state.sid === sid3 && seat(P3).team === team3,
    `sid ${sid3} team ${team3} · ${JSON.stringify({ dropped, offPitch, back, onPitch, catchUp, sameSid: P3.client.state.sid === sid3, sameTeam: seat(P3)?.team === team3 })} · events on return ${P3.client.state.events.length}`);
  await sleep(1500);
  const P5 = ps[4], sid5 = P5.client.state.sid;
  const left = await P5.client.leave(); stop(P5);
  await P5.client.close();
  const gone = await until(() => seat(P5, P1)?.gone === true && P1.client.state.events.some(e => e.k === 'gone' && e.who === sid5), 8000);
  check('4b. a player leaves for good (« Quitter »): gone from the pitch, still on the roster (they follow their team’s result)', left.ok && gone, `sid ${sid5} · team ${seat(P5, P1)?.team} · ${JSON.stringify({ left: left.ok, gone, onRoster: !!seat(P5, P1) })}`);
  for (const p of ps) p.style = t0.includes(p.tag) ? lib.STRONG : lib.WEAK;          // phase 2: both teams play, team 0 the stronger
  const ended = await until(() => ps.filter(p => p !== P5).every(p => p.client.state.result), 330000, 200);
  for (const p of ps) stop(p);
  const tEnd = Date.now();
  const R = P1.client.state.result;
  const ev1 = P1.client.state.events;
  const goals = ev1.filter(e => e.k === 'goal');
  const winnersT = R?.winner === 1 ? t1 : t0, losersT = R?.winner === 1 ? t0 : t1;
  fs.writeFileSync(path.join(TMP, 'events.json'), JSON.stringify(ev1));
  check('4c. full time: « full » after the goals; a team wins (first to 3 or the clock), the result says which',
    ended && R?.end === 'win' && (R.winner === 0 || R.winner === 1) && ev1.at(-1)?.k === 'full' && goals.length === R.score[0] + R.score[1] && R.score[R.winner] > R.score[1 - R.winner],
    `score ${R?.score?.join('-')} (team ${R?.winner} wins; the leaver’s team ${t0.includes(P5.tag) ? 0 : 1}) · ${goals.length} goals · ${Math.round((tEnd - tKick) / 1000)} s from kick-off`);
  const stay = ps.filter(p => p !== P5);
  const seqs = stay.map(p => p.client.state.events.map(evKey).join('|'));
  const kinds = {}; for (const e of ev1) kinds[e.k] = (kinds[e.k] ?? 0) + 1;
  const asked = ps.reduce((s, p) => { for (const k of ['pass', 'shot', 'dribble']) s[k] += p.bot?.asked[k] ?? 0; return s; }, { pass: 0, shot: 0, dribble: 0 });
  check('4d. every client still connected (9, the returned one included) saw the same events in the same order, the same score',
    seqs.every(s => s === seqs[0]) && stay.every(p => p.client.state.result?.score.join() === R.score.join()) && ev1.every((e, i) => e.n === i + 1),
    `${ev1.length} events ${JSON.stringify(kinds)} · ${new Set(seqs).size} distinct sequence(s) over ${seqs.length} clients · bots asked ${JSON.stringify(asked)}`);

  // ------------------------------------------------------------------ 5. the money: one settlement, the pot equal to the holds, ±, conserved
  const after = {};
  for (const p of [...ps, by]) after[p.tag] = await balance(W.base, p.key);
  const pay = Object.fromEntries((R?.payouts ?? []).map(x => [x.tag, x.amount]));
  check('5a. the result (sent once the ledger wrote it): pool 10 000 F, five shares of 2 000 F to the winning team — the one who left for good following their team — nothing to the others',
    R?.money === 'settled' && R.total === 10_000 && R.payouts.length === 5 && winnersT.every(t => pay[t] === 2000) && losersT.every(t => !pay[t]) && (pay[P5.tag] ?? 0) === (winnersT.includes(P5.tag) ? 2000 : 0),
    `payouts ${R?.payouts?.map(x => x.amount).join(' ')} · the leaver ${winnersT.includes(P5.tag) ? 'won: paid 2 000 F though gone' : 'lost: not refunded'}`);
  const net = p => after[p.tag] - before[p.tag] - (p === P10 ? 600 : 0);
  check('5b. Teranga Money: each winner +2 000 F at the settlement (net +1 000 F), each loser −1 000 F (the wallet part counted), the bystander unchanged; totals conserved',
    winnersT.every(t => net(ps.find(p => p.tag === t)) === 1000) && losersT.every(t => net(ps.find(p => p.tag === t)) === -1000) && after[by.tag] === before[by.tag]
    && Object.values(after).reduce((a, b) => a + b, 0) === Object.values(before).reduce((a, b) => a + b, 0) + 600,
    `after: ${ps.map(p => `${p.name} ${after[p.tag]}`).join(', ')}, bystander ${after[by.tag]}`);
  const L = ledgerRows(W, match);
  const sum = (k, f = () => true) => L.ops.filter(o => o.kind === k && f(o)).reduce((a, o) => a + o.amount, 0);
  const pool = L?.pools[0], settled = pool ? JSON.parse(pool.result) : null;
  check('5c. the ledger’s own rows: ONE pool for the match, settled once (result written), held 0; 11 holds (one player twice), 1 release, 5 payouts, no refund; payouts = holds − releases = 10 000 F; 5 paid, 5 lost',
    L && L.pools.length === 1 && pool.state === 'settled' && pool.held === 0 && settled?.total === 10_000 && L.ops.filter(o => o.kind === 'hold').length === 11 && L.ops.filter(o => o.kind === 'release').length === 1
    && L.ops.filter(o => o.kind === 'payout').length === 5 && !L.ops.some(o => o.kind === 'refund') && sum('payout') === sum('hold') - sum('release') && sum('payout') === 10_000
    && L.holds.filter(h => h.state === 'paid').length === 5 && L.holds.filter(h => h.state === 'lost').length === 5 && L.history === 0,
    `holds ${sum('hold')} − releases ${sum('release')} = payouts ${sum('payout')} · pool ${pool?.state}`);
  const paidSteps = stay.filter(p => winnersT.includes(p.tag)).map(p => p.client.state.money.filter(m => m.step === 'payout' && m.state === 'done').map(m => m.amount)[0]);
  check('5d. on the winners’ clients the payout is a done money step of 2 000 F (shown only after the server’s result); losers have none', paidSteps.every(a => a === 2000) && stay.filter(p => losersT.includes(p.tag)).every(p => !p.client.state.money.some(m => m.step === 'payout')),
    `payout steps ${paidSteps.join(' ')}`);

  // ------------------------------------------------------------------ 6. the wire: tick, snapshot rate and size, measured on the clients
  const secs = (tEnd - tKick) / 1000, w1 = P1.client.wire;
  const rate = w1.s.n / secs, avg = w1.s.bytes / w1.s.n, maxSnap = Math.max(...ps.filter(p => p !== P5).map(p => p.client.wire.s.bytes / p.client.wire.s.n));
  const inputs = Object.fromEntries(ps.map(p => [p.name, p.client.seq]));
  check('6. the wire, measured: a snapshot every tick (≈ 20 a second to each player), its size; events in their own frames', rate > 17 && rate < 21 && avg < 700,
    `${w1.s.n} snapshots in ${secs.toFixed(1)} s = ${rate.toFixed(1)}/s · ${Math.round(avg)} B average (largest client average ${Math.round(maxSnap)} B, 10 bodies) · ${(rate * avg / 1024).toFixed(1)} KiB/s per player · ${w1.ev?.n ?? 0} event frames · lobby frames ${w1.lobby?.n ?? 0}`);
  fs.writeFileSync(path.join(TMP, 'wire.json'), JSON.stringify({ secs, wire: Object.fromEntries(ps.map(p => [p.name, p.client.wire])), inputs }, null, 2));
  for (const p of ps) p.client.close();
  W.proc.kill('SIGTERM');

  // ==================================================================================================== run 2: cancel, no fee, a draw, a free match (a 20 s clock)
  const V = await startWorker(PORT + 1, 'short', ['CAMP_TEST_CLOCK:20']);
  const qs = Array.from({ length: 7 }, (_, i) => player(V.base, i));
  const v0 = {};
  for (const p of qs) { const a = await account(V.base, p.key, p.name); const r = await a.req({ type: 'fund', amount: p.i === 6 ? 300 : 5000 }); v0[p.tag] = r?.balance; await a.close(); }
  const [A, B, C, D, E, G, Poor] = qs;
  // a. a cancelled lobby refunds everyone
  const m1 = (await A.client.create({ fee: 1000, size: 6, dist: 'team', open: true, hub: 'plateau' })).match;
  for (const p of [B, C]) { await p.client.open(m1); await p.client.join(); }
  for (const p of [A, B, C]) await p.client.ready();
  await until(() => A.client.state.lobby?.pool === 3000);
  const cancelled = await A.client.cancel();
  await until(() => [A, B, C].every(p => p.client.state.result), 10000);
  const RC = B.client.state.result, late2 = await B.client.ready();
  const bal1 = await Promise.all([A, B, C].map(p => balance(V.base, p.key)));
  const LC = ledgerRows(V, m1);
  check('7. the organizer cancels a lobby where three were ready: every fee returned (refund steps done), balances as before; the ledger’s pool refunded; a « Prêt » after it refused',
    cancelled.ok && RC?.end === 'cancel' && RC.money === 'settled' && RC.total === 3000 && RC.payouts.every(x => x.amount === 1000) && bal1.every(b => b === 5000)
    && B.client.state.money.some(m => m.step === 'refund' && m.state === 'done' && m.amount === 1000) && LC.pools[0]?.state === 'refunded' && LC.ops.filter(o => o.kind === 'refund').length === 3 && !late2.ok,
    `refunds ${RC?.payouts?.map(x => x.amount).join(' ')} · balances ${bal1.join(' ')} · late « Prêt »: ${late2.reason}`);
  for (const p of [A, B, C]) p.client.close();
  // b. a player who cannot cover the fee cannot be ready, and is told why
  const m2 = (await D.client.create({ fee: 1000, size: 6, dist: 'team', open: true, hub: 'plateau' })).match;
  await Poor.client.open(m2); await Poor.client.join();
  const poor = await Poor.client.ready();
  await until(() => Poor.client.state.lobby?.players.find(x => x.tag === Poor.tag)?.hold === 'none');
  const poorSeat = seat(Poor), poorBal = await balance(V.base, Poor.key);
  check('8. a player with 300 F cannot be ready at 1 000 F: refused « insufficient » with the sentence (« Solde insuffisant… »), the hold step failed, not ready, nothing taken',
    !poor.ok && poor.reason === 'insufficient' && /Solde insuffisant/.test(poor.text) && Poor.client.state.money.find(m => m.step === 'hold')?.state === 'failed' && poorSeat?.ready === false && poorBal === 300,
    `${poor.text} · balance ${poorBal}`);
  await Poor.client.leave(); Poor.client.close();
  // c. a draw at full time refunds everyone (nobody touches the ball: 0-0 after the 20 s clock)
  const six = [D, A, B, C, E, G];
  for (const p of six.slice(1)) { p.client = new lib.CampClient({ key: () => p.key, profile: () => ({ name: p.name, look: 1 }), endpoint: new URL('/api/camp', V.base).href, WebSocketImpl: WebSocket, fetchImpl: fetch }); await p.client.open(m2); await p.client.join(); }
  for (const p of six) await p.client.ready();
  await until(() => six.every(p => p.client.state.roster), 15000);
  for (const p of six) { p.bot = null; p.style = lib.STILL; drive(p); }
  await until(() => six.every(p => p.client.state.result), 90000, 200);
  for (const p of six) stop(p);
  const RD = D.client.state.result, bal2 = await Promise.all(six.map(p => balance(V.base, p.key))), LD = ledgerRows(V, m2);
  check('9. a draw at full time (0-0 after the clock, a half time on the way): every fee returned, balances as before, the ledger’s pool refunded',
    RD?.end === 'draw' && RD.score.join() === '0,0' && RD.money === 'settled' && RD.total === 6000 && RD.payouts.length === 6 && RD.payouts.every(x => x.amount === 1000) && bal2.every(b => b === 5000)
    && LD.pools[0]?.state === 'refunded' && D.client.state.events.some(e => e.k === 'half'),
    `score ${RD?.score?.join('-')} · refunds ${RD?.payouts?.length} · balances ${bal2.join(' ')}`);
  for (const p of six) p.client.close();
  // d. a 0 F match touches no money
  for (const p of six) p.client = new lib.CampClient({ key: () => p.key, profile: () => ({ name: p.name, look: 1 }), endpoint: new URL('/api/camp', V.base).href, WebSocketImpl: WebSocket, fetchImpl: fetch });
  const m3 = (await D.client.create({ fee: 0, size: 6, dist: 'single', open: true, hub: 'plateau' })).match;
  for (const p of six.slice(1)) { await p.client.open(m3); await p.client.join(); }
  for (const p of six) await p.client.ready();
  await until(() => six.every(p => p.client.state.roster), 15000);
  for (const p of six) { const s = seat(p); p.bot = null; p.style = s?.team === 0 ? lib.STRONG : lib.WEAK; drive(p); }   // a new match: new pitch numbers
  await until(() => six.every(p => p.client.state.result), 90000, 200);
  for (const p of six) stop(p);
  const RF = D.client.state.result, bal3 = await Promise.all(six.map(p => balance(V.base, p.key))), LF = ledgerRows(V, m3);
  check('10. a free match (0 F): played to its end, no money step on any client, balances unchanged, no pool and no row in the ledger for it',
    !!RF && RF.money === 'none' && RF.total === 0 && RF.payouts.length === 0 && six.every(p => p.client.state.money.length === 0) && bal3.every(b => b === 5000) && LF.pools.length === 0 && LF.ops.length === 0,
    `end ${RF?.end} ${RF?.score?.join('-')} · ${D.client.state.events.filter(e => e.k === 'goal').length} goals · balances ${bal3.join(' ')}`);
  for (const p of six) p.client.close();
} catch (e) {
  check('the check went through', false, e.stack ?? String(e));
} finally {
  for (const w of workers) { try { w.proc.kill('SIGTERM'); } catch { /* gone */ } }
  const failed = results.filter(r => !r.ok).length;
  fs.writeFileSync(path.join(TMP, 'results.json'), JSON.stringify({ at: new Date().toISOString(), passed: results.length - failed, failed, results }, null, 2));
  console.log(`${results.length - failed}/${results.length} passed`);
  process.exitCode = failed ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 1500).unref();
}
