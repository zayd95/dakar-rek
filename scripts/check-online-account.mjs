// LD2.0-B « Belong Online »: raw-socket checks of the account server (server/social.ts: the accounts and the Teranga Money ledger) and of the
// `home:<tag>` presence space (server/worker.ts CityRoom), on the real local Workers runtime (`wrangler dev --local`). No browser.
// Usage: node scripts/check-online-account.mjs [-- http://existing-worker-url/]
// Ports: wrangler dev 8820 (inspector 9320); override with ONLINE_PORT. The Worker runs from a throwaway config (no build, empty assets, fresh state).
import { spawn } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const PORT = Number(process.env.ONLINE_PORT || 8820), ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const TMP = path.join(process.env.ONLINE_TMP || os.tmpdir(), `dakar-online-check-${PORT}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
function check(name, ok, detail = '') { results.push({ name, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${ok || !detail ? '' : ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`); return !!ok; }
let base = process.argv[2], worker, logs = '';
const sockets = [];

async function startWorker() {
  await fs.rm(TMP, { recursive: true, force: true });
  await fs.mkdir(path.join(TMP, 'assets'), { recursive: true });
  await fs.writeFile(path.join(TMP, 'assets', 'index.html'), '<!doctype html><title>check</title>');
  // the project's wrangler.jsonc, with absolute paths, an empty assets folder and no build step (the game is not needed here)
  const raw = await fs.readFile(path.join(ROOT, 'wrangler.jsonc'), 'utf8');
  const cfg = JSON.parse(raw.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n'));
  delete cfg.$schema; delete cfg.build;
  cfg.main = path.join(ROOT, cfg.main); cfg.assets = { ...cfg.assets, directory: path.join(TMP, 'assets') };
  await fs.writeFile(path.join(TMP, 'wrangler.json'), JSON.stringify(cfg, null, 2));
  base = `http://127.0.0.1:${PORT}/`;
  worker = spawn(process.execPath, [path.join(ROOT, 'node_modules/wrangler/bin/wrangler.js'), 'dev', '--local', '--config', path.join(TMP, 'wrangler.json'), '--ip', '127.0.0.1',
    '--port', String(PORT), '--inspector-port', String(PORT + 500), '--persist-to', path.join(TMP, 'state'), '--show-interactive-dev-session=false'],
  { cwd: ROOT, env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  for (const s of [worker.stdout, worker.stderr]) s.on('data', b => { logs = (logs + b).slice(-20000); });
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (worker.exitCode !== null) throw new Error(`wrangler exited: ${logs}`);
    try { if ((await fetch(new URL('/api/health', base))).ok) return; } catch { /* starting */ }
    await sleep(400);
  }
  throw new Error('wrangler dev did not start');
}

/** The status a WebSocket upgrade request gets (Node's fetch will not send `Upgrade`): 101, or the refusal's code. */
function upgradeStatus(p, headers = {}) {
  return new Promise(resolve => {
    const req = http.get(new URL(p, base), { headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Key': randomBytes(16).toString('base64'), 'Sec-WebSocket-Version': '13', ...headers } });
    req.on('upgrade', (res, socket) => { socket.destroy(); resolve(101); });
    req.on('response', res => { res.resume(); resolve(res.statusCode); });
    req.on('error', () => resolve(-1));
  });
}
const tagOf = key => createHash('sha256').update(`dakar-rek:tag:${key}`).digest().subarray(0, 8).toString('hex');
const newKey = () => randomBytes(16).toString('hex');
const id = () => randomUUID();
const wsUrl = (p, params) => { const u = new URL(p, base); u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:'; u.search = new URLSearchParams(params).toString(); return u; };

/** One client of `/api/me`: its inbox, a request helper (waits for the answer with the same id), waits on pushes. */
function account(key, name, look = 1) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl('/api/me', { key, name, look: String(look) })); sockets.push(ws);
    const c = { ws, key, tag: tagOf(key), inbox: [], closed: null };
    const timer = setTimeout(() => reject(new Error(`welcome timeout for ${name}`)), 15000);
    ws.addEventListener('message', e => {
      if (e.data === 'pong') return;
      const m = JSON.parse(e.data); c.inbox.push(m);
      if (m.type === 'welcome') { clearTimeout(timer); c.welcome = m; resolve(c); }
    });
    ws.addEventListener('close', e => { c.closed = e.code; clearTimeout(timer); });
    ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('socket error')); }, { once: true });
    c.send = m => ws.send(JSON.stringify(m));
    c.wait = async (fn, ms = 6000, from = 0) => { const end = Date.now() + ms; while (Date.now() < end) { const m = c.inbox.slice(from).find(fn); if (m) return m; await sleep(25); } return null; };
    /** Sends a request and waits for ITS answer (a new frame with the same id: a resend's answer, not the first one's). */
    c.req = async (m, ms = 8000) => { m.id ??= id(); const from = c.inbox.length; c.send(m); return c.wait(x => x.id === m.id && ['ack', 'visit', 'lookup', 'find'].includes(x.type), ms, from); };
    c.close = async () => { if (ws.readyState === WebSocket.OPEN) { ws.close(); await new Promise(r => { ws.addEventListener('close', r, { once: true }); setTimeout(r, 3000); }); } };
  });
}
/** A presence socket (CityRoom) for the `home:<tag>` checks. */
function presence(key, name, room = '7') {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl('/api/presence', { hub: 'plateau', room, name, key })); sockets.push(ws);
    const c = { ws, inbox: [] };
    const timer = setTimeout(() => reject(new Error('presence welcome timeout')), 15000);
    ws.addEventListener('message', e => { if (e.data === 'pong') return; const m = JSON.parse(e.data); c.inbox.push(m); if (m.type === 'welcome') { clearTimeout(timer); c.id = m.id; resolve(c); } });
    ws.addEventListener('close', e => { c.closed = e.code; });
    c.move = (space, x = 1, z = 2) => ws.send(JSON.stringify({ type: 'move', x, y: 0, z, yaw: 0, speed: 0, space, clip: 'Idle' }));
    c.wait = async (fn, ms = 4000) => { const end = Date.now() + ms; while (Date.now() < end) { const m = c.inbox.find(fn); if (m) return m; await sleep(25); } return null; };
  });
}
const snapshot = () => ({ home: { spec: 'appart_plateau', hub: 'plateau', door: 'door:residence-jamm', name: 'Résidence Jàmm · appartement' }, upgrades: ['peinture'],
  furniture: [{ spec: 'canape', at: { x: 1, z: -2, rot: 1 } }, { spec: 'tele', at: { x: -1.5, z: 2, rot: 2 } }], at: Date.now() });

try {
  if (!base) await startWorker();
  console.log(`worker at ${base}`);

  // ---------------------------------------------------------------- the route
  const plain = await fetch(new URL('/api/me', base));
  const noKey = await new Promise(r => { const ws = new WebSocket(wsUrl('/api/me', { name: 'X' })); ws.addEventListener('error', () => r('refused')); ws.addEventListener('open', () => { ws.close(); r('opened'); }); });
  const badKey = await upgradeStatus('/api/me?key=nope'), foreign = await upgradeStatus(`/api/me?key=${newKey()}`, { Origin: 'https://evil.example' });
  check('/api/me: a WebSocket only (426), a device key required (400), the presence Origin check (403)', plain.status === 426 && noKey === 'refused' && badKey === 400 && foreign === 403, [plain.status, noKey, badKey, foreign]);

  // ---------------------------------------------------------------- two accounts
  const kA = newKey(), kB = newKey(), kC = newKey();
  let A = await account(kA, 'Awa', 1), B = await account(kB, 'Moussa', 0);
  const C = await account(kC, 'Cheikh', 2);
  const code = A.tag.toUpperCase().match(/.{4}/g).join('-');
  check('welcome: the tag of the device key (as presence), the friend code, Teranga Money at 0 with the limits', A.welcome.tag === A.tag && A.welcome.code === code && A.welcome.balance === 0
    && JSON.stringify(A.welcome.limits) === JSON.stringify({ opMax: 250000, fundDayMax: 500000, sendDayMax: 500000, receiveDayMax: 1000000, balanceMax: 5000000 })
    && JSON.stringify(A.welcome.today) === JSON.stringify({ funded: 0, sent: 0, received: 0 }) && Array.isArray(A.welcome.convs) && A.welcome.v === 1, A.welcome);

  // a meeting nobody answers, checked at the end: the proposer's account turns it « missed » by itself (its alarm), past its window
  // set as early as the account allows (its window opened 5 real minutes ago), so its window closes as soon as possible: ECONOMY.online meetEarlyMs / meetLateMs
  const EARLY = 5 * 60_000, LATE = 10 * 60_000;
  const lonelyAt = Date.now(), lonely = await A.req({ type: 'meet', to: C.tag, place: { id: 'pikine:marche', hub: 'pikine', name: 'Marché' }, when: lonelyAt - EARLY + 3000 });
  const ghost = tagOf(newKey());
  const unknown = await A.req({ type: 'say', to: ghost, text: 'Tu es là ?' });
  const unknownPay = await A.req({ type: 'pay', to: ghost, amount: 100, fund: 100 });
  check('a player who never opened Messages cannot be written to or paid (unknown-recipient)', unknown?.reason === 'unknown-recipient' && unknownPay?.reason === 'unknown-recipient', [unknown, unknownPay]);

  // ---------------------------------------------------------------- messages
  const look = await A.req({ type: 'lookup', code: B.welcome.code.toLowerCase() });
  const noOne = await A.req({ type: 'lookup', code: ghost.toUpperCase() });
  check('« Ajouter par code »: a friend code finds the player (name, look); a code nobody connected with finds no one', look?.tag === B.tag && look.name === 'Moussa' && look.look === 0 && noOne?.tag === null, [look, noOne]);

  const say1 = { type: 'say', id: id(), to: B.tag, text: 'Salaam aleekum Moussa 🙏🏾' };
  const ack1 = await A.req(say1);
  const got1 = await B.wait(m => m.type === 'item' && m.item.id === say1.id);
  check('A → B: acknowledged with the item, pushed to B with A’s name', ack1?.ok && ack1.item.text === 'Salaam aleekum Moussa 🙏🏾' && got1?.with === A.tag && got1.item.from === A.tag && got1.name === 'Awa', [ack1, got1]);
  const dup1 = await A.req({ ...say1 });
  await sleep(500);
  check('the same message id again: acknowledged as a duplicate, delivered once', dup1?.ok && dup1.duplicate === true && B.inbox.filter(m => m.type === 'item' && m.item.id === say1.id).length === 1, dup1);

  await B.close();
  const say2 = await A.req({ type: 'say', to: B.tag, text: 'Tu es hors ligne ? Je te laisse un message.' });
  B = await account(kB, 'Moussa', 0);
  const cB = B.welcome.convs.find(c => c.with === A.tag);
  B.send({ type: 'conv', with: A.tag });
  const histB = await B.wait(m => m.type === 'conv' && m.with === A.tag);
  check('B offline, then back: the conversation is there (list: last message, unread 2; history: both, newest first)', say2?.ok && cB?.last?.id === say2.item.id && cB.unread === 2 && cB.name === 'Awa'
    && histB?.items.map(i => i.id).join() === [say2.item.id, say1.id].join(), { cB, histB });
  const seenA = await B.wait(m => m.type === 'seen' && m.tag === A.tag);
  check('the other player’s account is said online', seenA?.seen === 'online', seenA);
  B.send({ type: 'read', with: A.tag }); await sleep(200);
  await B.close(); B = await account(kB, 'Moussa', 0);
  check('read: the unread count stays at 0 after a reconnect', B.welcome.convs.find(c => c.with === A.tag)?.unread === 0);
  const longTxt = await A.req({ type: 'say', to: B.tag, text: 'a'.repeat(501) });
  const spoof = await A.req({ type: 'say', to: B.tag, text: 'x', amount: 100000 });
  check('text over 500 characters (too-large) and an unknown field (invalid) are refused; the socket stays', longTxt?.reason === 'too-large' && spoof?.reason === 'invalid' && A.ws.readyState === WebSocket.OPEN, [longTxt, spoof]);

  // ---------------------------------------------------------------- money: top-up, request, pay once
  const f1 = await A.req({ type: 'fund', amount: 20000 });
  check('top-up 20 000 F (wallet → Teranga Money): acknowledged with the balance', f1?.ok && f1.balance === 20000 && f1.op.kind === 'fund', f1);
  const askId = id();
  const ask = await B.req({ type: 'ask', id: askId, to: A.tag, amount: 5000, note: 'Le taxi' });
  const askAtA = await A.wait(m => m.type === 'item' && m.item.id === askId);
  check('B asks A for 5 000 F: the request reaches A, open', ask?.ok && askAtA?.item.state === 'open' && askAtA.item.amount === 5000, [ask, askAtA]);
  const p1 = id();
  const pay1 = await A.req({ type: 'pay', id: p1, to: B.tag, amount: 5000, fund: 0, req: askId });
  const payAtB = await B.wait(m => m.type === 'item' && m.item.id === p1);
  const paidAtB = await B.wait(m => m.type === 'item' && m.item.id === askId && m.item.state === 'paid');
  const balB = await B.wait(m => m.type === 'balance' && m.balance === 5000);
  check('A pays the request: one debit (15 000), one credit (5 000), the request paid, the card at B', pay1?.ok && pay1.balance === 15000 && pay1.op.req === askId && payAtB && paidAtB?.item.paidBy === p1 && balB, [pay1, paidAtB, balB]);
  const pay1again = await A.req({ type: 'pay', id: p1, to: B.tag, amount: 5000, fund: 0, req: askId });
  const payOther = await A.req({ type: 'pay', to: B.tag, amount: 5000, fund: 0, req: askId });
  check('the same pay id again: the first result (duplicate); the same request with another id: refused (request-closed)', pay1again?.ok && pay1again.duplicate && pay1again.balance === 15000 && payOther?.reason === 'request-closed', [pay1again, payOther]);

  // the same pay sent at once from two sockets of the same account
  const A2 = await account(kA, 'Awa', 1);
  const p3 = { type: 'pay', id: id(), to: B.tag, amount: 1000, fund: 0 };
  A.send(p3); A2.send(p3);
  const [r1, r2] = await Promise.all([A.wait(m => m.id === p3.id), A2.wait(m => m.id === p3.id)]);
  check('the same pay sent at once from two sockets of one account: both answered ok, one of them a duplicate, applied once', r1?.ok && r2?.ok && [r1.duplicate, r2.duplicate].filter(Boolean).length === 1 && r1.balance === 14000 && r2.balance === 14000, [r1, r2]);
  await A2.close();

  // a reconnect in the middle of an operation
  const p4 = { type: 'pay', id: id(), to: B.tag, amount: 1000, fund: 1000, note: 'Pour le pain' };
  A.send(p4); A.ws.close();
  A = await account(kA, 'Awa', 1);
  const mid = A.welcome.balance;
  const p4again = await A.req({ ...p4 });
  check('a reconnect in the middle of a send: the same id sent again is applied once (top-up 1 000 + send 1 000)', mid === 14000 && p4again?.ok && p4again.balance === 14000 && p4again.op.fund === 1000, { mid, p4again });
  const hA = await (async () => { A.send({ type: 'history' }); return A.wait(m => m.type === 'history'); })();
  const hB = await (async () => { B.send({ type: 'history' }); return B.wait(m => m.type === 'history'); })();
  const count = (h, opId) => h?.ops.filter(o => o.id === opId).length;
  check('history (both sides): each op once; B received 5 000 + 1 000 + 1 000', count(hA, p1) === 1 && count(hA, p3.id) === 1 && count(hA, p4.id) === 1 && count(hB, p1) === 1
    && hB.ops.filter(o => o.kind === 'pay' && o.to === B.tag).reduce((n, o) => n + o.amount, 0) === 7000, { hA, hB });
  await B.close(); B = await account(kB, 'Moussa', 0);
  check('reconnect: balances as the server holds them (A 14 000, B 7 000)', A.welcome.balance === 14000 && B.welcome.balance === 7000 && B.welcome.today.received === 7000, [A.welcome.balance, B.welcome.balance, B.welcome.today]);

  // cashout
  const co = id();
  const cash = await B.req({ type: 'cashout', id: co, amount: 2000 });
  const cashAgain = await B.req({ type: 'cashout', id: co, amount: 2000 });
  check('withdrawal 2 000 F: debited once (the device credits its wallet once, by this id)', cash?.ok && cash.balance === 5000 && cashAgain?.duplicate && cashAgain.balance === 5000, [cash, cashAgain]);

  // ---------------------------------------------------------------- limits
  const opMax = await A.req({ type: 'pay', to: B.tag, amount: 250001, fund: 250001 });
  const fundMax = await A.req({ type: 'fund', amount: 250001 });
  const f2 = await A.req({ type: 'fund', amount: 250000 }), f3 = await A.req({ type: 'fund', amount: 229000 });
  const fundDay = await A.req({ type: 'fund', amount: 1 });
  const s1 = await A.req({ type: 'pay', to: B.tag, amount: 250000, fund: 0 }), s2 = await A.req({ type: 'pay', to: B.tag, amount: 243000, fund: 0 });
  const sendDay = await A.req({ type: 'pay', to: B.tag, amount: 1, fund: 0 });
  const amountBad = await A.req({ type: 'pay', to: B.tag, amount: 0, fund: 0 });
  check('limits: one op ≤ 250 000 F, top-ups ≤ 500 000 F a day, sends ≤ 500 000 F a day, a whole amount ≥ 1', opMax?.reason === 'limit-op' && fundMax?.reason === 'limit-op' && f2?.ok && f3?.ok && f3.balance === 493000
    && fundDay?.reason === 'limit-fund' && s1?.ok && s2?.ok && sendDay?.reason === 'limit-send' && amountBad?.reason === 'amount' && s2.balance === 0, { opMax, fundMax, f3, fundDay, s1, s2, sendDay, amountBad });

  // ---------------------------------------------------------------- blocking
  const blk = await B.req({ type: 'block', tag: A.tag, on: true });
  const payBlocked = await A.req({ type: 'pay', to: B.tag, amount: 100, fund: 0 });
  const askBlocked = await A.req({ type: 'ask', to: B.tag, amount: 100 });
  const invBlocked = await A.req({ type: 'invite', to: B.tag, snapshot: snapshot(), perms: { use: true } });
  const sayBlocked = await A.req({ type: 'say', to: B.tag, text: 'Tu me reçois ?' });
  await sleep(800);
  B.send({ type: 'conv', with: A.tag });
  const convBlocked = await B.wait(m => m.type === 'conv' && m.with === A.tag && m !== histB);
  check('blocked: money, requests and invitations refused (unavailable); text accepted but never delivered', blk?.ok && payBlocked?.reason === 'unavailable' && askBlocked?.reason === 'unavailable'
    && invBlocked?.reason === 'unavailable' && sayBlocked?.ok && !B.inbox.some(m => m.type === 'item' && m.item.id === sayBlocked.item.id) && !convBlocked?.items.some(i => i.id === sayBlocked.item.id),
  { blk, payBlocked, askBlocked, invBlocked, sayBlocked });
  await B.close(); B = await account(kB, 'Moussa', 0);
  check('the block holds after a reconnect (welcome: blocked list)', B.welcome.blocked.includes(A.tag) && B.welcome.convs.find(c => c.with === A.tag)?.blocked === true);
  const unblk = await B.req({ type: 'block', tag: A.tag, on: false });
  const payAfter = await A.req({ type: 'pay', to: B.tag, amount: 100, fund: 0 });
  check('unblocked: no longer unavailable (the day’s send limit, reached above, answers now)', unblk?.ok && payAfter?.reason === 'limit-send', [unblk, payAfter]);

  // ---------------------------------------------------------------- invitation, visit, the home space
  const findBefore = await B.req({ type: 'find', tag: A.tag });
  check('find: nothing said without an accepted invitation or meeting', findBefore?.type === 'ack' && findBefore.reason === 'unavailable', findBefore);
  const snap = snapshot();
  const invId = id();
  const inv = await A.req({ type: 'invite', id: invId, to: B.tag, snapshot: snap, perms: { use: true } });
  const invAtB = await B.wait(m => m.type === 'item' && m.item.id === invId);
  const visitEarly = await B.req({ type: 'visit', host: A.tag });
  const acc = await B.req({ type: 'invite-answer', ref: invId, accept: true });
  const accAtA = await A.wait(m => m.type === 'item' && m.item.id === invId && m.item.state === 'accepted');
  const visit = await B.req({ type: 'visit', host: A.tag });
  check('invitation: sent, accepted by the guest (the host sees it), then « visit » gives the host’s home as the host has it', inv?.ok && invAtB?.item.state === 'open' && visitEarly?.ok === false && visitEarly.reason === 'no-invite'
    && acc?.ok && acc.item.state === 'accepted' && accAtA && visit?.ok && JSON.stringify(visit.snapshot) === JSON.stringify(snap) && visit.perms.use === true && visit.invite === invId, { inv, acc, visit, visitEarly });
  const cVisit = await C.req({ type: 'visit', host: A.tag });
  check('a player without an invitation is not let in', cVisit?.ok === false && cVisit.reason === 'no-invite', cVisit);

  const PA = await presence(kA, 'Awa'), PB = await presence(kB, 'Moussa'), PC = await presence(kC, 'Cheikh');
  for (const p of [PA, PB, PC]) p.move('street', 3, 3);
  await sleep(400);
  PA.move(`home:${A.tag}`, 0.5, 0.5);
  const maskedAtC = await PC.wait(m => m.type === 'peer' && m.peer.id === PA.id && m.peer.space === 'home');
  check('presence: the host in `home:<tag>`; outside, the others only see « at home », without a position', maskedAtC && maskedAtC.peer.x === 0 && maskedAtC.peer.z === 0 && !PC.inbox.some(m => m.type === 'peer' && m.peer.space?.startsWith('home:')), maskedAtC);
  PC.move(`home:${A.tag}`, 0.7, 0.7);
  await sleep(1200);
  check('a move into `home:<host>` without an invitation is refused (that move only: the socket stays)', !PA.inbox.some(m => m.type === 'peer' && m.peer.id === PC.id && m.peer.space === `home:${A.tag}`) && PC.ws.readyState === WebSocket.OPEN);
  PB.move(`home:${A.tag}`, 1.5, -1);
  const bInside = await PA.wait(m => m.type === 'peer' && m.peer.id === PB.id && m.peer.space === `home:${A.tag}`);
  const aForB = await PB.wait(m => m.type === 'peer' && m.peer.id === PA.id && m.peer.space === `home:${A.tag}`);
  await sleep(500);
  check('with the accepted invitation the guest is relayed in the home, to the host only; the guest is sent the host already there', bInside && bInside.peer.x === 1.5 && aForB
    && !PC.inbox.some(m => m.type === 'peer' && m.peer.id === PB.id && m.peer.space === `home:${A.tag}`), { bInside: !!bInside, aForB: !!aForB });

  // ---------------------------------------------------------------- a meeting
  const when = Date.now() + 12000, meetId = id();
  const place = { id: 'corniche:pitch', hub: 'corniche', name: 'Terrain de la Corniche', icon: '⚽' };
  const meet = await A.req({ type: 'meet', id: meetId, to: B.tag, place, when, note: 'Un petit match ?' });
  const meetAtB = await B.wait(m => m.type === 'item' && m.item.id === meetId);
  const cFind = await C.req({ type: 'find', tag: A.tag });
  const mAcc = await B.req({ type: 'meet-answer', ref: meetId, accept: true });
  A.send({ type: 'where', hub: 'plateau', room: 7 }); await sleep(200);
  const bFind = await B.req({ type: 'find', tag: A.tag });
  check('find: with an accepted invitation or meeting, where the other is (district and room); never for a stranger', meet?.ok && meetAtB && mAcc?.ok && mAcc.item.state === 'accepted'
    && bFind?.type === 'find' && bFind.hub === 'plateau' && bFind.room === 7 && cFind?.reason === 'unavailable', { bFind, cFind });
  // too early: a second meeting, set beyond the window's opening (ECONOMY.online.meetEarlyMs, 5 real minutes before its time)
  const farId = id();
  await A.req({ type: 'meet', id: farId, to: B.tag, place, when: Date.now() + EARLY + 60_000 });
  await B.req({ type: 'meet-answer', ref: farId, accept: true });
  const early = await B.req({ type: 'meet-here', ref: farId });
  const hereB = await B.req({ type: 'meet-here', ref: meetId });
  const hereA = await A.req({ type: 'meet-here', ref: meetId });
  const metAtB = await B.wait(m => m.type === 'item' && m.item.id === meetId && m.item.state === 'met');
  check('a meeting: proposed, accepted, « here » × 2 in its window → met (both sides); too early is refused', early?.reason === 'closed' && hereB?.ok && hereB.item.state === 'accepted' && hereA?.ok && hereA.item.state === 'met'
    && metAtB && metAtB.item.here.length === 2, { early, hereB, hereA });

  // ---------------------------------------------------------------- revoke
  const rev = await A.req({ type: 'invite-revoke', ref: invId });
  const end = await B.wait(m => m.type === 'visit-end' && m.invite === invId);
  const revAtB = await B.wait(m => m.type === 'item' && m.item.id === invId && m.item.state === 'revoked');
  const visitAfter = await B.req({ type: 'visit', host: A.tag });
  check('revoked: the guest is told to leave (visit-end), the card says it, a new visit is refused (revoked)', rev?.ok && end && revAtB && visitAfter?.ok === false && visitAfter.reason === 'revoked', { rev, end, visitAfter });

  // ---------------------------------------------------------------- a counter-proposal, cancel, reports, forget, sockets
  const m2 = id();
  await A.req({ type: 'meet', id: m2, to: B.tag, place, when: 0 });
  await B.wait(m => m.type === 'item' && m.item.id === m2);
  const counter = await B.req({ type: 'meet', to: A.tag, place: { ...place, id: 'plateau:gargote-01', hub: 'plateau', name: 'Gargote' }, when: 0, counter: m2 });
  const counteredAtA = await A.wait(m => m.type === 'item' && m.item.id === m2 && m.item.state === 'countered');
  const cancel = await A.req({ type: 'meet-cancel', ref: counter?.item?.id ?? 'nope-nope' });
  check('a counter-proposal makes the first one « countered »; the new one can be cancelled by the other player', counter?.ok && counter.item.counter === m2 && counteredAtA && cancel?.ok && cancel.item.state === 'cancelled', { counter, cancel });
  const rep1 = await A.req({ type: 'report', tag: C.tag, reason: 'arnaque' }), rep2 = await A.req({ type: 'report', tag: C.tag, reason: 'autre' });
  check('report: counted once per player', rep1?.ok && rep2?.ok && rep2.duplicate === true, [rep1, rep2]);
  const fg = await B.req({ type: 'forget', with: A.tag });
  await B.close(); B = await account(kB, 'Moussa', 0);
  await A.close(); A = await account(kA, 'Awa', 1);
  check('forget: the conversation leaves B’s account only', fg?.ok && !B.welcome.convs.some(c => c.with === A.tag) && A.welcome.convs.some(c => c.with === B.tag));

  const T = await account(newKey(), 'Rapide');
  T.ws.send('x'.repeat(16385));
  await sleep(600);
  const T2 = await account(newKey(), 'Rafale');
  for (let i = 0; i < 25; i++) T2.send({ type: 'where', hub: 'pikine', room: 1 });
  await sleep(600);
  check('a frame over 16 384 characters closes the socket (1009); more than 20 messages a second too (1008)', T.closed === 1009 && T2.closed === 1008, [T.closed, T2.closed]);

  // ---------------------------------------------------------------- the revoked guest's moves in the home (after the CityRoom cache)
  console.log('(waiting 31 s for the room’s cached answer to expire)');
  await sleep(31000);
  const before = PA.inbox.length;
  PB.move(`home:${A.tag}`, -2, -2);
  await sleep(1500);
  check('after a revocation the guest’s moves in the home are refused (CityRoom asks the host’s account again after 30 s)', !PA.inbox.slice(before).some(m => m.type === 'peer' && m.peer.id === PB.id && m.peer.x === -2), PA.inbox.slice(before).filter(m => m.type === 'peer').map(m => m.peer.space));

  // ---------------------------------------------------------------- the alarm: the unanswered meeting is missed on both sides
  await sleep(Math.max(0, lonelyAt - EARLY + 3000 + LATE + 2500 - Date.now()));
  A.send({ type: 'conv', with: C.tag }); C.send({ type: 'conv', with: A.tag });
  const convAC = await A.wait(m => m.type === 'conv' && m.with === C.tag), convCA = await C.wait(m => m.type === 'conv' && m.with === A.tag);
  const missA = convAC?.items.find(i => i.id === lonely?.item?.id), missC = convCA?.items.find(i => i.id === lonely?.item?.id);
  check('an unanswered meeting past its window becomes « missed » by the proposer’s alarm, on both sides', lonely?.ok && missA?.state === 'missed' && missC?.state === 'missed', { missA, missC });

  // ---------------------------------------------------------------- the account client (src/online/client.ts, the OnlineApi) on this same server
  if (!process.env.ONLINE_NO_CLIENT) {
    const live = await new Promise(resolve => {
      const p = spawn(process.execPath, [path.join(ROOT, 'node_modules/vitest/vitest.mjs'), 'run', 'tests/onlineClient.live.test.ts'], { cwd: ROOT, env: { ...process.env, ONLINE_URL: base }, stdio: ['ignore', 'pipe', 'pipe'] });
      let out = ''; for (const st of [p.stdout, p.stderr]) st.on('data', b => { out += b; });
      p.on('exit', code => resolve({ code, out }));
    });
    check('two account clients (OnlineApi) on this server: messages, 5 000 F requested and paid once, an invitation and a visit, a meeting, a block', live.code === 0 && /1 passed/.test(live.out), live.out.slice(-2000));
  }
} catch (error) {
  console.error(error); if (logs) console.error(logs.slice(-6000));
  check('the run finished without an exception', false, String(error));
} finally {
  for (const ws of sockets) try { ws.close(); } catch { /* closed */ }
  worker?.kill('SIGTERM');
}
const passed = results.filter(r => r.ok).length;
console.log(`\n${passed}/${results.length} online account checks passed`);
if (process.env.ONLINE_LOGS) console.log(logs.slice(-8000));
process.exitCode = passed === results.length && results.length > 0 ? 0 : 1;
setTimeout(() => process.exit(process.exitCode), 1500).unref();
