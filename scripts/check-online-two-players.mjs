// Two players, one local Workers/Durable Objects server (the same worker the game ships): they connect, see each other (the avatar drawn, the position replicated), one drops off the network and
// the other sees it leave, it comes back and both see each other again with exactly one copy of each, its own state (money, place, counters) untouched; then it reloads the page (a new session)
// and rejoins with its saved state and no ghost of the old session; then the other leaves for good and comes back. Everything the checks read is what the game itself reports (`presence()`,
// the save): nothing is injected into the server. The saves are the browser's (localStorage): what « preserved » means here is the player's own state and the shared view of the street.
// Usage: node scripts/check-online-two-players.mjs <outDir>      (builds nothing: `npx vite build` first, the worker serves ./dist)
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';

const out = process.argv[2] ?? '/tmp/claude-0/online2';
fs.mkdirSync(out, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failed = 0, total = 0;
const check = (name, ok, detail = '') => { total++; if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${detail}`); };
let worker, browser, logs = '';
try {
  const srv = net.createServer(); await new Promise(r => srv.listen(0, '127.0.0.1', r)); const port = srv.address().port; await new Promise(r => srv.close(r));
  const base = `http://127.0.0.1:${port}/`;
  worker = spawn(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'dev', '--local', '--ip', '127.0.0.1', '--port', String(port)], { env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }, stdio: ['ignore', 'pipe', 'pipe'] });
  for (const s of [worker.stdout, worker.stderr]) s.on('data', b => { logs = (logs + b).slice(-8000); });
  for (const deadline = Date.now() + 90000; Date.now() < deadline;) { if (worker.exitCode !== null) throw new Error(`worker exited: ${logs}`); try { if ((await fetch(new URL('/api/health', base))).ok) break; } catch { /* starting */ } await sleep(300); }
  const health = await (await fetch(new URL('/api/health', base))).json();
  check('the worker is up and speaks the protocol the game does', health.ok && health.protocol === 1 && health.roomCapacity === 24, JSON.stringify(health));

  browser = await chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pageErrors = [], ctxs = [], pages = [];
  const NAMES = ['Moussa', 'Awa'];
  const open = async i => {
    const ctx = ctxs[i] ?? await browser.newContext({ viewport: i === 0 ? { width: 390, height: 844 } : { width: 1280, height: 720 }, hasTouch: i === 0, isMobile: i === 0 });
    if (!ctxs[i]) { ctxs[i] = ctx; await ctx.addInitScript(n => { try { if (!localStorage.getItem('dakarrek.quality')) localStorage.setItem('dakarrek.quality', 'low'); if (!localStorage.getItem('dakarrek.presence.profile')) localStorage.setItem('dakarrek.presence.profile', JSON.stringify({ name: n, look: n === 'Awa' ? 1 : 0 })); } catch { /* */ } }, NAMES[i]); }
    const first = !pages[i];                                                   // ?argent= gives the new game its money: only the first time (a reload with it would overwrite the save)
    const p = await ctx.newPage(); p.on('pageerror', e => pageErrors.push(`${NAMES[i]}: ${e.message}`)); pages[i] = p;
    await p.goto(`${base}?debug${i === 0 ? '&touch' : ''}${first ? '&argent=250000' : ''}`);
    await p.waitForFunction(() => window.__dakar?.presence().status === 'online', null, { timeout: 180000 });
    return p;
  };
  const pr = p => p.evaluate(() => { const x = window.__dakar.presence(); return { status: x.status, count: x.count, id: x.id, room: x.room, peers: x.peers.map(q => ({ id: q.id, name: q.name, x: q.x, z: q.z, hub: q.hub })), visible: x.visible }; });
  const state = p => p.evaluate(() => { const A = window.__dakar; return { wallet: A.state.wallet, pos: A.pos(), counters: { ...A.state.data.counters } }; });
  const drawn = async (p, n, ms = 45000) => { const t0 = Date.now(); const ok = await p.waitForFunction(n => window.__dakar.presence().visible === n, n, { timeout: ms }).then(() => true, () => false); return { ok, ms: Date.now() - t0, visible: (await pr(p)).visible }; };
  const diff = (a, b) => { const out = []; if (a.wallet !== b.wallet) out.push(`wallet ${a.wallet}→${b.wallet}`); if (a.pos.hub !== b.pos.hub) out.push(`hub ${a.pos.hub}→${b.pos.hub}`); const dp = Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z); if (dp > 0.3) out.push(`moved ${dp.toFixed(2)} m`); for (const k of new Set([...Object.keys(a.counters), ...Object.keys(b.counters)])) if (a.counters[k] !== b.counters[k]) out.push(`counter ${k} ${a.counters[k]}→${b.counters[k]}`); return out; };
  const peersOf = async (p, n, ms = 60000) => p.waitForFunction(n => window.__dakar.presence().peers.length === n, n, { timeout: ms }).then(() => true, () => false);

  const a = await open(0), b = await open(1);
  // both in the Almadies' night street, a few metres apart
  await a.evaluate(() => window.__dakar.teleport('almadies', -60, -135, 0)); await b.evaluate(() => window.__dakar.teleport('almadies', -56, -135, Math.PI));
  for (const p of [a, b]) await p.waitForFunction(() => window.__dakar.pos().hub === 'almadies' && window.__dakar.pos().mode === 'play', null, { timeout: 120000 });
  await a.evaluate(() => window.__dakar.place(-60, -135, 0)); await b.evaluate(() => window.__dakar.place(-56, -135, Math.PI));
  // 1. connect and see each other
  const seeA = await peersOf(a, 1), seeB = await peersOf(b, 1);
  const pa = await pr(a), pb = await pr(b);
  check('1. two independent clients connect to the same room and each counts two players', seeA && seeB && pa.count === 2 && pb.count === 2 && pa.room === pb.room, JSON.stringify({ a: [pa.count, pa.room], b: [pb.count, pb.room] }));
  const dA = await drawn(a, 1), dB = await drawn(b, 1);
  check('1. each sees the other: one avatar drawn (within 45 s of the peer being known), a distinct id', dA.ok && dB.ok && pa.peers[0].id === pb.id && pb.peers[0].id === pa.id && pa.id !== pb.id, JSON.stringify({ aSees: pa.peers[0]?.id === pb.id, bSees: pb.peers[0]?.id === pa.id, drawnAfterMs: [dA.ms, dB.ms], vis: [dA.visible, dB.visible] }));
  await a.waitForFunction(() => window.__dakar.presence().peers.some(q => Math.abs(q.x + 56) < 0.6 && Math.abs(q.z + 135) < 0.6), null, { timeout: 30000 }).catch(() => {});
  const seenAt = (await pr(a)).peers[0];
  check('1. movement is replicated: A sees B where B stands (±0.6 m), B sees A', Math.abs(seenAt.x + 56) < 0.6 && Math.abs(seenAt.z + 135) < 0.6, JSON.stringify(seenAt));
  await a.screenshot({ path: `${out}/1-a-sees-b.png` }); await b.screenshot({ path: `${out}/1-b-sees-a.png` });

  // A's own state before the drop
  await a.evaluate(() => { const A = window.__dakar; A.state.count('terrasse'); A.state.addMoney(-1500, 'Café Touba · test'); A.save?.(); });
  const s0 = await state(a);

  // 2. A drops off the network: B sees A leave; A knows it is offline
  await ctxs[0].setOffline(true);
  await a.waitForFunction(() => window.__dakar.presence().status === 'offline', null, { timeout: 60000 });
  const bSeesLeave = await peersOf(b, 0, 90000);
  const gB = await drawn(b, 0, 30000);
  check('2. A goes offline: A reports it, B sees A leave, and A\'s avatar is gone from B\'s street (no frozen ghost)', bSeesLeave && (await pr(b)).count === 1 && gB.ok, JSON.stringify({ ...(await pr(b)), goneAfterMs: gB.ms }));
  const sOff = await state(a);
  check('2. while offline A\'s own game goes on untouched: money, place, counters', diff(s0, sOff).length === 0, JSON.stringify(diff(s0, sOff)));

  // 3. A comes back: both see each other again, exactly one copy each, A's state unchanged
  await ctxs[0].setOffline(false);
  await a.waitForFunction(() => window.__dakar.presence().status === 'online', null, { timeout: 120000 });
  const backA = await peersOf(a, 1, 90000), backB = await peersOf(b, 1, 90000);
  const dA2 = await drawn(a, 1), dB2 = await drawn(b, 1);
  const pa2 = await pr(a), pb2 = await pr(b), s1 = await state(a);
  check('3. A reconnects: both see each other again, exactly one peer each (no duplicate of A)', backA && backB && pa2.peers.length === 1 && pb2.peers.length === 1 && pb2.count === 2 && dA2.ok && dB2.ok && pa2.visible === 1 && pb2.visible === 1, JSON.stringify({ a: pa2.peers.length, b: pb2.peers.length, count: pb2.count, vis: [pa2.visible, pb2.visible] }));
  check('3. A\'s state survived the drop and the reconnection: money, place, counters (and B still sees A where A stands)', diff(s0, s1).length === 0 && Math.abs(pb2.peers[0].x + 60) < 0.8 && Math.abs(pb2.peers[0].z + 135) < 0.8, JSON.stringify({ diff: diff(s0, s1), seenByB: pb2.peers[0] && [pb2.peers[0].x, pb2.peers[0].z] }));
  await b.screenshot({ path: `${out}/3-b-after-a-returns.png` });

  // 4. A reloads the page (a new session): the save brings its state back, B sees one A (the old session is gone)
  await a.close();
  const goneA = await peersOf(b, 0, 90000);
  const a2 = await open(0);
  await a2.waitForFunction(() => window.__dakar.pos().mode === 'play', null, { timeout: 120000 });
  const rejoinedB = await peersOf(b, 1, 90000), rejoinedA = await peersOf(a2, 1, 90000);
  await sleep(1500);
  const s2 = await state(a2), pb3 = await pr(b);
  check('4. A closes the page: B sees A leave; A opens a new session: B sees exactly one A again', goneA && rejoinedB && rejoinedA && pb3.peers.length === 1 && pb3.count === 2, JSON.stringify({ gone: goneA, peers: pb3.peers.length, count: pb3.count }));
  check('4. A\'s saved state is back after the reload: money and counters (the save is the browser\'s)', s2.wallet === s0.wallet && diff({ ...s0, pos: s2.pos }, s2).length === 0, JSON.stringify({ diff: diff({ ...s0, pos: s2.pos }, s2) }));
  await a2.screenshot({ path: `${out}/4-a-after-reload.png` });

  // 5. B leaves for good and returns: A sees it go and come back
  await b.close();
  const aSeesBGone = await peersOf(a2, 0, 90000);
  const b2 = await open(1);
  const aSeesBBack = await peersOf(a2, 1, 90000), bSeesA = await peersOf(b2, 1, 90000);
  check('5. B closes the page and returns: A sees B leave, then come back, one copy', aSeesBGone && aSeesBBack && bSeesA && (await pr(a2)).peers.length === 1, JSON.stringify({ left: aSeesBGone, back: aSeesBBack }));
  check('no browser page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
} catch (e) {
  check('the run completed without an exception', false, String(e?.stack ?? e).slice(0, 600));
} finally {
  await browser?.close().catch(() => {}); worker?.kill('SIGTERM');
}
console.log(`\n${total - failed}/${total} online two-player checks passed`);
process.exit(failed ? 1 : 0);
