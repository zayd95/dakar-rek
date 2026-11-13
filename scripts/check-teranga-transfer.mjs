// Dakar Rek 1.0.1 — Teranga Money between two real players (the owner's report: « I sent 1 000 F and 2 000 F, the sender saw success, the recipient never
// received it »). Two phone-sized pages of the real online build on the real local Workers runtime (`wrangler dev --local`, fresh state), every player
// action a real tap (Chrome's touch pipeline, scripts/lib/realTouch.mjs):
//   1. the street: Awa's action button on Moussa opens the ONE player menu (Saluer, Message, Envoyer de l’argent, Inviter…); « Envoyer de l’argent »
//      opens Messages on Moussa with the money sheet; she sends 1 000 F;
//   2. Moussa cannot miss it: the notice card (« 1 000 F reçus de Awa » + « Retirer »), the chat button's badge, the card in the conversation, Teranga
//      Money beside the wallet in Argent (and in the total); his wallet's figure has not moved (the server holds the money);
//   3. « Retirer » on the card (a real DOUBLE tap): his wallet +1 000 F exactly, once on the server's ledger; her total −1 000 F exactly;
//   4. the same operation id sent again to the server (a raw resend on her device key): the same answer, nothing twice;
//   5. Moussa offline during a send of 2 000 F: on reconnect the notice, the card and the balance are there; « Retirer » on the notice: +2 000 F;
//      unread counts agree with the server across the reconnect;
//   6. no answer from the server: « En attente de confirmation… » (never « Rien n’est parti »), a waiting card; resolved to a yes at the next
//      connection (once on the ledger), and, for a second one, to a no (the wallet part given back exactly);
//   7. the HUD's chat button opens the phone's Messages inbox; « À proximité » there opens the proximity talk; no friend code in a conversation's header;
//   8. a second worker whose deliveries of money items ALL fail (SOCIAL_TEST_FAULT=deliver): the sender sees success, the recipient gets nothing live,
//      and at the recipient's next connection the card, the notice and the balance come from the ledger (once).
// Debug hooks only set the scene (names, money for Awa, a place to stand, a block) and read the state; nothing is paid or withdrawn by them.
// Usage: npm run build:online && node scripts/check-teranga-transfer.mjs [outDir]      Ports: TERANGA_PORT (default 8870) and the next one.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { realTouch } from './lib/realTouch.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = process.argv[2] || 'proof/teranga-transfer';
const PORT = Number(process.env.TERANGA_PORT || 8870);
const TMP = `/tmp/claude-0/teranga/run-${Date.now()}`;
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(TMP, { recursive: true });
if (!fs.existsSync(path.join(ROOT, 'dist/index.html'))) { console.error('No build: run `npm run build:online` first.'); process.exit(2); }

const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok: !!ok, extra: String(extra).slice(0, 700) }); console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`, ok || !extra ? '' : String(extra).slice(0, 700)); };
const NB = s => String(s ?? '').replace(/[\u00a0\u202f\u2009]/g, ' ').replace(/\s+/g, ' ').trim();

/** A local worker on the built game (the project's wrangler.jsonc without its build step), with its own fresh state; `vars`: `--var` bindings. */
async function startWorker(port, name, vars = []) {
  const dir = path.join(TMP, name); fs.mkdirSync(dir, { recursive: true });
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'wrangler.jsonc'), 'utf8').split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n'));
  delete cfg.$schema; delete cfg.build;
  cfg.main = path.join(ROOT, cfg.main); cfg.assets = { ...cfg.assets, directory: path.join(ROOT, 'dist') };
  fs.writeFileSync(path.join(dir, 'wrangler.json'), JSON.stringify(cfg, null, 2));
  const w = { base: `http://127.0.0.1:${port}/`, logs: '' };
  w.proc = spawn(process.execPath, [path.join(ROOT, 'node_modules/wrangler/bin/wrangler.js'), 'dev', '--local', '--config', path.join(dir, 'wrangler.json'), '--ip', '127.0.0.1', '--port', String(port),
    '--inspector-port', String(port + 500), '--persist-to', path.join(dir, 'state'), '--show-interactive-dev-session=false', ...vars.flatMap(v => ['--var', v])],
  { cwd: ROOT, env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  for (const s of [w.proc.stdout, w.proc.stderr]) s.on('data', b => { w.logs = (w.logs + b).slice(-20000); });
  const until = Date.now() + 180000;
  while (Date.now() < until) {
    if (w.proc.exitCode !== null) throw new Error(`wrangler exited: ${w.logs}`);
    try { if ((await fetch(`${w.base}api/health`)).ok) return w; } catch { /* starting */ }
    await sleep(400);
  }
  throw new Error(`wrangler did not answer: ${w.logs}`);
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });

/** One player: a phone-sized context (its own storage: its own device key and account), the game loaded, and helpers that tap like a thumb. */
async function player(base, name, look, avatar, guest) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await ctx.addInitScript(([name, look, avatar, guest]) => {
    try {
      if (!localStorage.getItem('dakarrek.guest.save.v6')) localStorage.setItem('dakarrek.guest.save.v6', JSON.stringify({ schemaVersion: 6, guestId: guest, avatar }));
      localStorage.setItem('dakarrek.quality', 'low');
      localStorage.setItem('dakarrek.presence.profile', JSON.stringify({ name, look }));
    } catch { /* */ }
    // everything the HUD says, as it says it: lines, subtitle and cards (read by the checks; nothing is added to the page)
    window.__said = [];
    const seen = () => { const t = document.getElementById('toast')?.innerText?.replace(/\s+/g, ' ').trim(); if (t && window.__said[window.__said.length - 1] !== t) window.__said.push(t); };
    addEventListener('DOMContentLoaded', () => new MutationObserver(seen).observe(document.documentElement, { childList: true, subtree: true, characterData: true }));
  }, [name, look, avatar, guest]);
  const p = { name, ctx, page: null, t: null, errors: [] };
  p.open = async () => {
    const page = await ctx.newPage(); page.setDefaultTimeout(240000);
    page.on('pageerror', e => p.errors.push(e.message));
    await page.goto(`${base}?debug&touch`, { timeout: 180000 });
    await page.waitForFunction(() => window.__dakar?.pos?.().hub && !document.getElementById('studio'), null, { timeout: 300000 });
    await page.waitForFunction(() => window.__dakar.presence().status === 'online' && window.__dakar.account()?.status === 'online' && !!window.__dakar.account().me, null, { timeout: 300000 }).catch(async () => { throw new Error(`${name}: not online after 300 s: ${JSON.stringify(await page.evaluate(() => ({ presence: window.__dakar.presence().status, account: window.__dakar.account()?.status })))}`); });
    p.page = page; p.t = await realTouch(page); p.cdp = await ctx.newCDPSession(page);
    p.tag = await page.evaluate(() => window.__dakar.account().me.tag);
    return page;
  };
  const d = (fn, a) => p.page.evaluate(fn, a);
  p.d = d;
  p.wait = ms => p.page.waitForTimeout(ms);
  p.until = (fn, arg, ms = 30000) => p.page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
  const settled = () => p.page.waitForFunction(() => !document.querySelector('#phone.on')?.getAnimations({ subtree: true }).some(a => a.playState === 'running' && a.effect?.getComputedTiming?.().iterations !== Infinity), null, { timeout: 30000 }).catch(() => {});
  /** A real tap on what `find` returns (scrolled into view first, as a thumb would), once it stands still; `twice`: a real double tap. */
  p.tapWhere = async (find, arg, { settle = 450, twice = false } = {}) => {
    await p.wait(settle); await settled();
    const at = () => d(([src, a]) => { const el = (0, eval)(src)(a); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, out: r.top < 0 || r.bottom > innerHeight }; }, [find.toString(), arg]);
    let c = await at();
    if (c?.out) { await d(([src, a]) => (0, eval)(src)(a).scrollIntoView({ block: 'center', behavior: 'instant' }), [find.toString(), arg]); await p.wait(300); c = await at(); }
    for (let k = 0; k < 20 && c; k++) { await p.wait(120); const c2 = await at(); if (c2 && Math.abs(c2.y - c.y) < 1 && Math.abs(c2.x - c.x) < 1) break; c = c2; }
    if (!c) throw new Error(`${name}: nothing to tap: ${arg ?? find}`);
    if (!twice) { await p.t.down(9, c.x, c.y); await p.wait(50); await p.t.up(9); return; }
    const t0 = Date.now() / 1000, pt = [{ id: 7, x: c.x, y: c.y, radiusX: 8, radiusY: 8, force: 1 }];
    await Promise.all([['touchStart', 0], ['touchEnd', 0.05], ['touchStart', 0.13], ['touchEnd', 0.18]].map(([type, dt]) => p.cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pt, timestamp: t0 + dt })));
  };
  p.tap = (sel, o) => p.tapWhere(s => document.querySelector(s), sel, o);
  p.shot = async file => { await p.wait(300); await p.page.screenshot({ path: `${OUT}/${file}.jpg`, type: 'jpeg', quality: 72 }); };
  p.screen = () => d(() => document.querySelector('#phone .ph-screen')?.innerText ?? '').then(NB);
  p.sheet = () => d(() => document.querySelector('#phone .mg-sheet')?.innerText ?? '').then(NB);
  p.card = id => d(i => document.querySelector(`#phone .mg-log [data-key="${i}"]`)?.innerText ?? null, id).then(t => t === null ? null : NB(t));
  p.wallet = () => d(() => window.__dakar.state.wallet);
  p.hud = () => d(() => document.getElementById('money')?.textContent ?? '').then(NB);
  p.said = () => d(() => window.__said.slice()).then(l => l.map(NB));
  p.acct = () => d(() => { const o = window.__dakar.account(); return { status: o.status, balance: o.balance?.amount ?? null, unread: o.unread(), convs: o.convs().map(c => ({ with: c.with, name: c.name, unread: c.unread, last: c.last?.id ?? null })) }; });
  p.items = tag => d(t => window.__dakar.account().items(t).map(i => ({ ...i })), tag);
  p.history = () => d(async () => { const r = await window.__dakar.account().history(); return r.ok ? r.ops : []; });
  p.pending = () => d(() => window.__dakar.state.data.online.pending.map(x => ({ id: x.id, kind: x.kind, amount: x.amount, fund: x.fund })));
  p.conv = async tag => { await d(t => window.__dakar.phone(`messages:${t}`), tag); await p.until(t => window.__dakar.phoneInfo().arg === t, tag); };
  /** The money sheet from the conversation's « + »: an amount chip, « Continuer », the confirmation's id; `confirm` taps it. */
  p.sendSheet = async amt => {
    await p.until(() => !!document.querySelector('#phone .mg-sheet .mg-chip'));
    await p.tap(`#phone .mg-chip[data-amt="${amt}"]`); await p.tap('#phone .mg-next');
    await p.until(() => !!document.querySelector('#phone .mg-ok'));
    return d(() => document.querySelector('#phone .mg-ok').dataset.id);
  };
  p.plusPay = async () => { await p.tap('#phone .mg-plus'); await p.tap('#phone .mg-pi[data-do="pay"]'); };
  p.closeSheet = async () => { await p.tapWhere(() => document.querySelector('#phone .mg-sheet [data-act="close"]')); await p.until(() => !document.querySelector('#phone .mg-sheet-wrap')); };
  return p;
}
const total = async p => (await p.wallet()) + ((await p.acct()).balance ?? 0);
const tagOf = key => createHash('sha256').update(`dakar-rek:tag:${key}`).digest().subarray(0, 8).toString('hex');
/** A raw client of `/api/me` on a device key (the resend of step 4): the welcome, then one request and its answer. */
async function rawRequest(base, key, msg) {
  const u = new URL('/api/me', base); u.protocol = 'ws:'; u.search = new URLSearchParams({ key, name: 'Awa', look: '2' }).toString();
  const ws = new WebSocket(u), inbox = [];
  ws.addEventListener('message', e => { if (e.data !== 'pong') inbox.push(JSON.parse(e.data)); });
  const wait = async fn => { const end = Date.now() + 10000; while (Date.now() < end) { const m = inbox.find(fn); if (m) return m; await sleep(25); } return null; };
  const welcome = await wait(m => m.type === 'welcome');
  ws.send(JSON.stringify(msg));
  const ack = await wait(m => m.type === 'ack' && m.id === msg.id);
  ws.close();
  return { welcome, ack };
}

const workers = [];
try {
  // ====================================================================================================== the first worker: everything works
  const W = await startWorker(PORT, 'main'); workers.push(W);
  const A = await player(W.base, 'Awa', 2, 'femme', 'g-tm-awa'), B = await player(W.base, 'Moussa', 4, 'homme', 'g-tm-moussa');
  await A.open(); await B.open();
  await A.d(() => { window.__dakar.giveMoney(60_000); window.__dakar.save(); });
  // side by side on an open piece of street (where neither has a seat or a door in reach): each is the other's target
  const here = await A.d(() => window.__dakar.pos());
  let spot = null;
  for (const [dx, dz] of [[0, 0], [6, 0], [0, 6], [-6, 0], [0, -6], [12, 6], [-12, -6], [18, 0], [0, 18]]) {
    const x = here.x + dx, z = here.z + dz;
    await A.d(([x, z]) => window.__dakar.place(x, z, Math.PI / 2), [x, z]); await B.d(([x, z]) => window.__dakar.place(x + 1.6, z, -Math.PI / 2), [x, z]);
    if (await A.until(t => { const f = window.__dakar.focus(); const p = window.__dakar.presence().peers.find(q => q.tag === t); return !!p && f?.id === 'peer:' + p.id; }, B.tag, 8000)) { spot = { x, z }; break; }
  }
  const wA0 = await A.wallet(), tA0 = await total(A), wB0 = await B.wallet(), tB0 = await total(B);
  check('0. two players on the local Workers runtime, two accounts; they stand side by side and each one’s game draws the other', !!spot && A.tag !== B.tag && (await B.until(() => window.__dakar.presence().visible >= 1)), JSON.stringify({ spot, a: A.tag, b: B.tag }));

  // ------------------------------------------------------------------ 1. the street's player menu → « Envoyer de l’argent »
  const prompt = await A.d(() => ({ focus: window.__dakar.focus(), act: document.getElementById('act')?.innerText.replace(/\s+/g, ' ').trim() }));
  await A.shot('1-awa-street-prompt');
  await A.t.tap('#act');
  await A.until(() => document.querySelectorAll('#modal.on button.item:not(.close)').length >= 4);
  const menu = await A.d(() => [...document.querySelectorAll('#modal button.item:not(.close)')].map(b => ({ label: b.querySelector('.lb')?.textContent ?? '', off: b.getAttribute('aria-disabled') === 'true' })));
  await A.shot('1-awa-player-menu');
  const labels = menu.map(m => m.label);
  check('1a. the action button on another player opens ONE menu, named after them: Saluer first, then Message, Envoyer de l’argent, Inviter chez moi, Proposer un rendez-vous, then the other gestures',
    /Moussa/.test(prompt.act ?? '') && labels[0] === 'Saluer' && labels.indexOf('Message') === 1 && labels.indexOf('Envoyer de l’argent') === 2 && labels.includes('Inviter chez moi') && labels.includes('Proposer un rendez-vous')
    && ['Remercier', 'Applaudir', 'Rire ensemble'].every(l => labels.indexOf(l) > labels.indexOf('Proposer un rendez-vous')), JSON.stringify({ prompt, menu }));
  await A.tapWhere(() => [...document.querySelectorAll('#modal button.item')].find(b => b.querySelector('.lb')?.textContent === 'Envoyer de l’argent'));
  const opened = await A.until(t => window.__dakar.phoneInfo().open && window.__dakar.phoneInfo().screen === 'messages' && window.__dakar.phoneInfo().arg === t && !!document.querySelector('#phone .mg-sheet .mg-chip'), B.tag, 20000);
  const title = await A.d(() => document.querySelector('#phone .ph-head h2')?.textContent ?? '');
  const pay1 = await A.sendSheet(1000);
  await A.shot('1-awa-confirm');
  await A.tap('#phone .mg-ok');
  await A.until(() => /envoyés à|Rien|attente/.test(document.querySelector('#phone .mg-sheet')?.innerText ?? ''), null, 60000);
  const out1 = await A.sheet();
  await A.closeSheet();
  check('1b. « Envoyer de l’argent » opens Messages on Moussa (his name, from the street) with the money sheet; the server confirms: « 1 000 F envoyés à Moussa »', opened && /Moussa/.test(NB(title)) && /1 000 F envoyés à Moussa/.test(out1), JSON.stringify({ opened, title: NB(title), out1 }));

  // ------------------------------------------------------------------ 2. Moussa cannot miss it
  const noticed = await B.until(() => /1.000.F reçus de Awa/.test(document.querySelector('#toast .mo.of')?.innerText ?? ''), null, 20000);
  const notice = NB(await B.d(() => document.querySelector('#toast .mo.of')?.innerText ?? ''));
  await B.until(() => document.querySelector('#chatBtn .chat-badge')?.textContent === '1', null, 10000);
  const badge = await B.d(() => document.querySelector('#chatBtn .chat-badge')?.textContent ?? '');
  await B.shot('2-moussa-notice');
  const accB1 = await B.acct(), wB1 = await B.wallet(), hudB1 = await B.hud();
  check('2a. the notice: a card « 1 000 F reçus de Awa » that says where the money is and offers « Retirer »; the chat button’s badge shows 1', noticed && /Teranga Money/.test(notice) && /Retirer 1 000 F/.test(notice) && badge === '1' && accB1.unread === 1, JSON.stringify({ notice, badge, unread: accB1.unread }));
  check('2b. (the audit’s root cause) the server holds the money: Teranga Money 1 000 F, the wallet’s figure unchanged', accB1.balance === 1000 && wB1 === wB0 && Number(hudB1.replace(/\D/g, '')) === wB0, JSON.stringify({ balance: accB1.balance, wB0, wB1, hudB1 }));
  await B.d(() => window.__dakar.phone('portefeuille')); await B.until(() => window.__dakar.phoneInfo().screen === 'portefeuille'); await B.wait(900);
  const argent = NB(await B.d(() => document.querySelector('#phone .ph-balance')?.innerText ?? ''));
  await B.shot('2-moussa-argent');
  const sum = NB(await B.d(() => document.querySelector('#phone .mn-sum b')?.textContent ?? ''));
  check('2c. Argent: Teranga Money 1 000 F beside the wallet with « Retirer », and the two together', /Portefeuille/.test(argent) && /Teranga Money 1 000 F/.test(argent) && /Retirer/.test(argent) && /Portefeuille \+ Teranga Money/.test(argent)
    && Number(sum.replace(/\D/g, '')) === wB1 + 1000, JSON.stringify({ argent, sum }));
  await B.conv(A.tag);
  await B.until(i => !!document.querySelector(`#phone [data-key="${i}"] [data-do="cashout"]`), pay1, 20000);
  const card1 = await B.card(pay1), header = NB(await B.d(() => document.querySelector('#phone .mg-bar')?.innerText ?? ''));
  await B.shot('2-moussa-card');
  check('2d. the card in the conversation: « 1 000 F reçus », « Sur ton Teranga Money », « Retirer 1 000 F »', /1 000 F reçus/.test(card1 ?? '') && /Sur ton Teranga Money/.test(card1 ?? '') && /Retirer 1 000 F/.test(card1 ?? ''), card1);

  // ------------------------------------------------------------------ 3. « Retirer » on the card: a real double tap
  await B.tap(`#phone [data-key="${pay1}"] [data-do="cashout"]`, { twice: true });
  const cashed = await B.until(([w, i]) => window.__dakar.state.wallet === w && /Retiré/.test(document.querySelector(`#phone [data-key="${i}"]`)?.innerText ?? ''), [wB0 + 1000, pay1], 30000);
  await sleep(1500);
  const histB1 = await B.history(), wB2 = await B.wallet(), accB2 = await B.acct(), card1b = await B.card(pay1);
  await B.shot('3-moussa-withdrawn');
  check('3a. « Retirer » (a real double tap): Moussa’s wallet +1 000 F exactly, Teranga Money back to 0, ONE withdrawal on the server’s ledger; the card says « Retiré dans ton portefeuille ✓ »',
    cashed && wB2 === wB0 + 1000 && accB2.balance === 0 && histB1.filter(o => o.kind === 'cashout').length === 1 && histB1.find(o => o.kind === 'cashout').amount === 1000 && /Retiré dans ton portefeuille/.test(card1b ?? '') && !/Retirer/.test(card1b ?? ''),
    JSON.stringify({ wB0, wB2, balance: accB2.balance, hist: histB1, card1b }));
  const tA1 = await total(A), wA1 = await A.wallet(), tB1 = await total(B);
  check('3b. the money moved exactly once: Awa’s total (wallet + Teranga Money) −1 000 F, Moussa’s +1 000 F, nothing pending on either device', tA1 === tA0 - 1000 && wA1 === wA0 - 1000 && tB1 === tB0 + 1000 && (await A.pending()).length === 0 && (await B.pending()).length === 0, JSON.stringify({ tA0, tA1, tB0, tB1 }));

  // ------------------------------------------------------------------ 4. the same operation id, sent again
  const keyA = await A.d(() => localStorage.getItem('dakarrek.chat.key'));
  const again = await rawRequest(W.base, keyA, { type: 'pay', id: pay1, to: B.tag, amount: 1000, fund: 1000 });
  const twiceUi = await A.d(async ([id, to]) => window.__dakar.account().pay({ id, to, amount: 1000 }), [pay1, B.tag]);
  await sleep(1500);
  const histA2 = await A.history(), histB2 = await B.history(), cardsB = (await B.items(A.tag)).filter(i => i.k === 'pay');
  check('4. the same op id again (a raw resend to the server on Awa’s key, and the same confirmation asked again on her device): the first answer, marked duplicate; ONE send on both histories, one card, no balance moved',
    tagOf(keyA) === A.tag && again.ack?.ok === true && again.ack.duplicate === true && again.ack.op?.id === pay1 && twiceUi.ok === true && twiceUi.op?.id === pay1
    && histA2.filter(o => o.kind === 'pay').length === 1 && histB2.filter(o => o.kind === 'pay').length === 1 && cardsB.length === 1 && (await total(A)) === tA1 && (await total(B)) === tB1,
    JSON.stringify({ ack: again.ack, twiceUi, paysA: histA2.filter(o => o.kind === 'pay').length, cardsB: cardsB.length }));

  // ------------------------------------------------------------------ 5. Moussa offline during the send
  await B.d(() => window.__dakar.phoneClose()); await B.d(() => window.__dakar.save());
  const unreadBefore = (await B.acct()).unread;
  await B.page.close();
  await A.until(t => window.__dakar.account().seen(t) !== 'online', B.tag, 20000);
  await A.conv(B.tag);
  await A.plusPay();
  const pay2 = await A.sendSheet(2000);
  await A.tap('#phone .mg-ok');
  await A.until(() => /envoyés à|Rien|attente/.test(document.querySelector('#phone .mg-sheet')?.innerText ?? ''), null, 60000);
  const out2 = await A.sheet();
  await A.closeSheet();
  await B.open();
  const noticed2 = await B.until(() => /2.000.F reçus de Awa/.test(document.querySelector('#toast .mo.of')?.innerText ?? ''), null, 30000);
  const accB3 = await B.acct(), wB3 = await B.wallet();
  const badge2 = await B.d(() => document.querySelector('#chatBtn .chat-badge')?.textContent ?? '');
  // « Retirer » on the notice itself, in the street: one tap (while the card is up: it leaves by itself after half a minute)
  await B.tapWhere(() => [...document.querySelectorAll('#toast .mo.of .of-b')].find(b => /Retirer/.test(b.textContent)), null, { settle: 250 });
  check('5a. Moussa was offline: Awa still sees the server’s yes; when he reconnects the notice (« 2 000 F reçus de Awa »), the balance (2 000 F) and the unread count (1, on the badge too) are there; his wallet has not moved',
    /2 000 F envoyés à Moussa/.test(out2) && noticed2 && accB3.balance === 2000 && unreadBefore === 0 && accB3.unread === 1 && badge2 === '1' && wB3 === wB2 && accB3.convs.find(c => c.with === A.tag)?.last === pay2,
    JSON.stringify({ out2, noticed2, accB3, badge2, wB2, wB3 }));
  const cashed2 = await B.until(w => window.__dakar.state.wallet === w, wB2 + 2000, 30000);
  await sleep(1200);
  const saidB = await B.said(), histB3 = await B.history();
  await B.shot('5-moussa-withdrawn-from-notice');
  check('5b. « Retirer » on the notice, one tap in the street: his wallet +2 000 F exactly (the server’s withdrawal: 2 on its ledger now), said (« 2 000 F retirés »)', cashed2 && (await B.acct()).balance === 0 && histB3.filter(o => o.kind === 'cashout').length === 2 && saidB.some(t => /2 000 F retirés/.test(t)),
    JSON.stringify({ wallet: await B.wallet(), cashouts: histB3.filter(o => o.kind === 'cashout').length, said: saidB.slice(-4) }));
  await B.conv(A.tag);
  const readNow = await B.until(() => window.__dakar.account().unread() === 0, null, 15000);
  const card2 = await B.card(pay2);
  await B.d(() => window.__dakar.phoneClose()); await B.page.close(); await B.open();
  await sleep(1500);
  const accB4 = await B.acct(), said4 = await B.said();
  check('5c. unread stays right across clients and reconnects: reading the conversation clears it (badge empty), and after another reload it is still 0 on the server’s welcome; the card is there once, marked withdrawn; no second notice',
    readNow && /Retiré dans ton portefeuille/.test(card2 ?? '') && accB4.unread === 0 && (await B.d(() => document.querySelector('#chatBtn .chat-badge')?.textContent ?? '')) === ''
    && (await B.items(A.tag)).filter(i => i.k === 'pay').length === 2 && !said4.some(t => /reçus de Awa/.test(t)) && (await total(B)) === tB0 + 3000 && (await total(A)) === tA0 - 3000,
    JSON.stringify({ readNow, card2, unread: accB4.unread, said4, tB: await total(B), tA: await total(A) }));

  // ------------------------------------------------------------------ 6. no answer from the server: pending, then a yes; then a no
  // (the scene: Awa's page stops sending `pay` frames, as a connection that dies between the tap and the server; nothing else is touched)
  const mute = on => A.d(on => { if (!window.__realSend) window.__realSend = WebSocket.prototype.send; WebSocket.prototype.send = on ? function (data) { if (typeof data === 'string' && data.includes('"type":"pay"')) return; return window.__realSend.call(this, data); } : window.__realSend; }, on);
  for (const p of [A, B]) await p.d(([x, z, me]) => window.__dakar.place(x + (me ? 0 : 1.6), z, 0), [spot.x, spot.z, p === A]);
  const wA2 = await A.wallet(), tA2 = await total(A);
  await mute(true);
  await A.conv(B.tag); await A.plusPay();
  const pay3 = await A.sendSheet(5000);
  await A.tap('#phone .mg-ok');
  const waitingShown = await A.until(() => /En attente de confirmation/.test(document.querySelector('#phone .mg-sheet')?.innerText ?? ''), null, 40000);
  const sheet3 = await A.sheet();
  await A.shot('6-awa-pending-sheet');
  await A.closeSheet();
  const card3 = await A.card(pay3), pend3 = await A.pending(), wA3 = await A.wallet();
  await A.shot('6-awa-pending-card');
  await A.d(() => window.__dakar.phone('portefeuille')); await A.wait(900);
  const argentA = NB(await A.d(() => document.querySelector('#phone [data-slot="tm"]')?.innerText ?? ''));
  check('6a. no answer: the sheet says « En attente de confirmation… » (never « Rien n’est parti »), the conversation holds a waiting card (« Envoi de 5 000 F »), Argent says one operation is waiting; the wallet part is set aside, the op is pending',
    waitingShown && !/Rien n.est parti/.test(sheet3) && /Envoi de 5 000 F/.test(card3 ?? '') && /En attente de confirmation/.test(card3 ?? '') && !/envoyés/.test(card3 ?? '') && /opération en attente/.test(argentA)
    && pend3.length === 1 && pend3[0].id === pay3 && wA3 === wA2 - 5000, JSON.stringify({ sheet3, card3, pend3, wA2, wA3, argentA: argentA.slice(0, 200) }));
  // the next connection (a reload: the page's sockets are new) sends the same id again: the server's yes
  await A.d(() => { window.__dakar.phoneClose(); window.__dakar.save(); }); await A.page.close(); await A.open();
  const settled3 = await A.until(() => window.__dakar.state.data.online.pending.length === 0, null, 30000);
  const saidA = await A.until(() => window.__said.some(t => /5.000.F envoyés/.test(t)), null, 15000);
  const got3 = await B.until(() => window.__said.some(t => /5.000.F reçus de Awa/.test(t)), null, 20000);   // (said while Awa's page was still loading: the card may be gone by now)
  await A.conv(B.tag); await A.until(i => /envoyés/.test(document.querySelector(`#phone [data-key="${i}"]`)?.innerText ?? ''), pay3, 20000);
  const card3b = await A.card(pay3), histA3 = await A.history();
  await A.shot('6-awa-pending-resolved');
  check('6b. resolved on reconnect to a yes: the same id sent again, ONE send of 5 000 F on the ledger, Awa is told (« 5 000 F envoyés »), her card becomes « 5 000 F envoyés », Moussa gets his notice; her total −5 000 F exactly',
    settled3 && saidA && got3 && /5 000 F envoyés/.test(card3b ?? '') && histA3.filter(o => o.id === pay3).length === 1 && (await total(A)) === tA2 - 5000 && (await B.acct()).balance === 5000,
    JSON.stringify({ settled3, saidA, got3, card3b, tA2, tA: await total(A), balB: (await B.acct()).balance }));
  // and a no: Moussa blocks Awa while her next send waits; at her next connection the server refuses it and the wallet part comes back
  const wA4 = await A.wallet(), tA4 = await total(A);
  await mute(true);
  await A.plusPay();
  const pay4 = await A.sendSheet(2000);
  await A.tap('#phone .mg-ok');
  await A.until(() => /En attente de confirmation/.test(document.querySelector('#phone .mg-sheet')?.innerText ?? ''), null, 40000);
  await A.closeSheet();
  const wA5 = await A.wallet();
  await B.d(async t => { await window.__dakar.account().block(t, true); }, A.tag);
  await sleep(1200);
  await A.d(() => { window.__dakar.phoneClose(); window.__dakar.save(); }); await A.page.close(); await A.open();
  const settled4 = await A.until(() => window.__dakar.state.data.online.pending.length === 0, null, 30000);
  const toldNo = await A.until(() => window.__said.some(t => /Envoi de 2.000.F refusé/.test(t)), null, 15000);
  await A.conv(B.tag); await A.wait(1200);
  const card4 = await A.card(pay4), histA4 = await A.history();
  await A.shot('6-awa-pending-refused');
  check('6c. resolved on reconnect to a no (Moussa blocked her meanwhile): the wallet part is given back exactly, nothing on the ledger, she is told it was refused, the card says « 2 000 F non envoyés »',
    wA5 === wA4 - 2000 && settled4 && toldNo && (await A.wallet()) === wA4 && (await total(A)) === tA4 && !histA4.some(o => o.id === pay4) && /2 000 F non envoyés/.test(card4 ?? '') && /rien n.est parti/i.test(card4 ?? ''),
    JSON.stringify({ wA4, wA5, wA: await A.wallet(), settled4, toldNo, card4 }));
  await B.d(async t => { await window.__dakar.account().block(t, false); }, A.tag);

  // ------------------------------------------------------------------ 7. the chat button, the proximity talk, identity
  await A.d(() => window.__dakar.phoneClose()); await A.wait(600);
  await A.tap('#chatBtn', { settle: 1500 });                                   // (once it stands where the HUD puts it after the phone closed)
  const inbox = await A.until(() => window.__dakar.phoneInfo().open && window.__dakar.phoneInfo().screen === 'messages' && !window.__dakar.phoneInfo().arg, null, 15000);
  const panelClosed = await A.d(() => !document.getElementById('chatPanel')?.classList.contains('on'));
  const nearRow = NB(await A.d(() => document.querySelector('#phone .mg-near-go')?.innerText ?? ''));
  await A.shot('7-awa-inbox');
  await A.tap('#phone .mg-near-go');
  const nearOpen = await A.until(() => !window.__dakar.phoneInfo().open && document.getElementById('chatPanel')?.classList.contains('on') && window.__dakarChat.state().open, null, 15000);
  await A.shot('7-awa-proximity');
  await A.tapWhere(() => document.querySelector('#chatPanel .chat-dm'));
  const backToInbox = await A.until(() => window.__dakar.phoneInfo().open && window.__dakar.phoneInfo().screen === 'messages', null, 15000);
  check('7a. the HUD’s chat button opens the phone’s Messages inbox (not the panel); its first row « À proximité » closes the phone and opens the proximity talk, whose « Messages privés » leads back',
    inbox && panelClosed && /À proximité/.test(nearRow) && nearOpen && backToInbox, JSON.stringify({ inbox, panelClosed, nearRow, nearOpen, backToInbox }));
  await A.conv(B.tag); await A.wait(600);
  const head = NB(await A.d(() => document.querySelector('#phone .mg-bar')?.innerText ?? '')), anyCode = await A.d(() => /[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}/.test(document.querySelector('#phone .ph-screen')?.innerText ?? ''));
  await A.d(() => window.__dakar.phone('messages:new')); await A.until(() => window.__dakar.phoneInfo().arg === 'new'); await A.wait(600);
  const myCode = NB(await A.d(() => document.querySelector('#phone .mg-mycode')?.innerText ?? ''));
  await A.d(() => window.__dakar.phoneClose());
  for (const p of [A, B]) await p.d(([x, z, me]) => window.__dakar.place(x + (me ? 0 : 1.6), z, me ? Math.PI / 2 : -Math.PI / 2), [spot.x, spot.z, p === A]);
  await A.until(() => window.__dakar.presence().visible >= 1 && window.__dakar.presence().selfMarker, null, 20000); await A.wait(800);
  const pres = await A.d(() => { const p = window.__dakar.presence(); return { visible: p.visible, plates: p.plates, selfMarker: p.selfMarker }; });
  await A.d(() => { window.__dakar.portrait?.(4.2, 2.1, 0.8); window.__dakar.render?.(); }); await A.shot('7-awa-crown-and-nameplate'); await A.d(() => window.__dakar.portrait?.(0));
  check('7b. identity: no friend code in a conversation (header, list of items: none on the screen); it is still under « Ton code »; Moussa’s nameplate is drawn; a crown marks Awa’s own character on her screen only (a local sprite: nothing in what she publishes)',
    !anyCode && !/[0-9a-f]{16}/i.test(head.replace(/\s/g, '')) && /[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}/.test(myCode) && header.length < 40 && pres.visible >= 1 && pres.plates.shown >= 1 && pres.selfMarker === true
    && !JSON.stringify(await A.d(() => window.__dakar.presence().move)).includes('crown'), JSON.stringify({ head, anyCode, myCode: myCode.slice(0, 60), pres }));
  check('no page errors in either game (first worker)', !A.errors.length && !B.errors.length, JSON.stringify({ a: A.errors.slice(0, 3), b: B.errors.slice(0, 3) }));
  await A.ctx.close(); await B.ctx.close();
  W.proc.kill('SIGTERM');

  // ====================================================================================================== the second worker: every delivery of a money item fails
  const F = await startWorker(PORT + 1, 'fault', ['SOCIAL_TEST_FAULT:deliver']); workers.push(F);
  const C = await player(F.base, 'Awa', 2, 'femme', 'g-tm-awa2'), D = await player(F.base, 'Moussa', 4, 'homme', 'g-tm-moussa2');
  await C.open(); await D.open();
  await C.d(() => { window.__dakar.giveMoney(20_000); window.__dakar.save(); });
  const wD0 = await D.wallet(), tC0 = await total(C);
  await C.conv(D.tag); await C.plusPay();
  const pay5 = await C.sendSheet(2000);
  await C.tap('#phone .mg-ok');
  await C.until(() => /envoyés à|Rien|attente/.test(document.querySelector('#phone .mg-sheet')?.innerText ?? ''), null, 60000);
  const out5 = await C.sheet();
  await sleep(5000);
  const live = { items: (await D.items(C.tag)).length, said: (await D.said()).filter(t => /reçus/.test(t)).length, unread: (await D.acct()).unread };
  check('8a. (the fault) the sender’s account cannot deliver the money item: Awa sees the server’s yes, the ledger has the send, and Moussa — connected — is told nothing: no card, no notice (what the outbox alone would leave him with)',
    /2 000 F envoyés à Moussa/.test(out5) && (await C.history()).some(o => o.id === pay5) && live.items === 0 && live.said === 0 && live.unread === 0, JSON.stringify({ out5, live }));
  await D.page.close(); await D.open();
  const mended = await D.until(() => /2.000.F reçus de Awa/.test(document.querySelector('#toast .mo.of')?.innerText ?? ''), null, 30000);
  await D.shot('8-moussa-mended');
  const accD = await D.acct(), itemsD = (await D.items(C.tag)).filter(i => i.k === 'pay');
  await D.conv(C.tag);
  await D.until(i => !!document.querySelector(`#phone [data-key="${i}"] [data-do="cashout"]`), pay5, 20000);
  const card5 = await D.card(pay5);
  await D.tap(`#phone [data-key="${pay5}"] [data-do="cashout"]`);
  const cashed5 = await D.until(w => window.__dakar.state.wallet === w, wD0 + 2000, 30000);
  check('8b. at Moussa’s next connection his account asks the ledger: the card (from the ledger’s own row, the same id), the notice, the unread count and the balance are there, once; « Retirer » puts exactly 2 000 F in his wallet; Awa’s total −2 000 F',
    mended && accD.balance === 2000 && accD.unread === 1 && itemsD.length === 1 && itemsD[0].id === pay5 && itemsD[0].amount === 2000 && /2 000 F reçus/.test(card5 ?? '') && cashed5 && (await total(C)) === tC0 - 2000,
    JSON.stringify({ mended, accD, itemsD, card5, cashed5 }));
  await D.d(() => window.__dakar.phoneClose()); await D.page.close(); await D.open(); await sleep(2500);
  const itemsD2 = (await D.items(C.tag)).filter(i => i.k === 'pay'), saidD2 = await D.said();
  check('8c. and only once: another reconnect brings no second card and no second notice; nothing pending; no page errors', itemsD2.length <= 1 && !saidD2.some(t => /reçus de Awa/.test(t)) && (await D.pending()).length === 0 && (await D.wallet()) === wD0 + 2000 && !C.errors.length && !D.errors.length,
    JSON.stringify({ n: itemsD2.length, saidD2, errors: [C.errors.slice(0, 2), D.errors.slice(0, 2)] }));
} catch (e) {
  check('the check went through', false, e.stack ?? String(e));
} finally {
  await browser.close();
  for (const w of workers) w.proc.kill('SIGTERM');
  const failed = results.filter(r => !r.ok).length;
  fs.writeFileSync(`${OUT}/results.json`, JSON.stringify({ at: new Date().toISOString(), passed: results.length - failed, failed, results }, null, 2));
  console.log(`${results.length - failed}/${results.length} passed`);
  process.exitCode = failed ? 1 : 0;
}
