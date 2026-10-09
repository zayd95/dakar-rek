// Text chat checks on the real local Workers runtime with two Chromium clients (phone + desktop),
// raw WebSocket checks of the server rules, then the solo build without a Worker.
// Usage: npm run check:chat [-- http://existing-worker-url/]
// Ports: wrangler dev 8794 (inspector 9294), vite preview of the solo build 4204 (override with CHAT_PORT / CHAT_PREVIEW_PORT).
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
// Mirrors src/multiplayer/chatRules.ts (CHAT_MAX_CHARS, CHAT_RATE_COUNT).
const CHAT_MAX = 500, RATE = 10;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const checks = [];
function check(name, ok, detail = '') { checks.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`, detail); assert.ok(ok, `${name} ${detail}`); }
const PORT = Number(process.env.CHAT_PORT || 8794), PREVIEW_PORT = Number(process.env.CHAT_PREVIEW_PORT || 4204);
const SHOTS = 'docs/screenshots/chat';
let base = process.argv[2], worker, preview, logs = '';
let browser;
const sockets = [], contexts = [];
const procLog = p => { for (const stream of [p.stdout, p.stderr]) stream.on('data', b => { logs = (logs + b).slice(-12000); }); };
async function waitHttp(url, proc, ms = 90000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (proc && proc.exitCode !== null) throw new Error(`Process exited: ${logs}`);
    try { if ((await fetch(url)).ok) return; } catch { /* starting */ }
    await sleep(300);
  }
  throw new Error(`Timeout waiting for ${url}`);
}
const state = page => page.evaluate(() => window.__dakarChat.state());
const conv = (s, key) => s.history[key] ?? [];
async function openChat(page, tab = 'near') {
  if (!(await state(page)).open) await page.click('#chatBtn');
  await page.click(`.chat-tabs button[data-tab="${tab}"]`);
}
let lastSaid = '';
async function say(page, text) { lastSaid = text; await page.fill('#chatInput', text); await page.press('#chatInput', 'Enter'); }
/** Status line of one of my messages once the panel shows a final state (the panel renders on the next frame). */
async function domStatus(page, id) {
  const handle = await page.waitForFunction(id => { const t = document.querySelector(`.chat-log li[data-id="${id}"] .chat-status`)?.textContent; return t && !t.startsWith('envoi') ? t : null; }, id, { timeout: 30000 });
  return handle.jsonValue();
}
/** Waits for the latest own message with this text to leave the "sending" state. */
async function settled(page, key, text = lastSaid) {
  await page.waitForFunction(([key, text]) => { const e = (window.__dakarChat.state().history[key] ?? []).filter(e => e.mine && e.text === text).at(-1); return e && e.status !== 'sending'; }, [key, text], { timeout: 60000 });
  return conv(await state(page), key).filter(e => e.mine && e.text === text).at(-1);
}

try {
  await fs.mkdir(SHOTS, { recursive: true });
  if (!base) {
    base = `http://127.0.0.1:${PORT}/`;
    worker = spawn(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'dev', '--local', '--ip', '127.0.0.1', '--port', String(PORT), '--inspector-port', String(PORT + 500)], { env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }, stdio: ['ignore', 'pipe', 'pipe'] });
    procLog(worker);
    await waitHttp(new URL('/api/health', base), worker, 180000);
  }
  browser = await chromium.launch({
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    ...(process.env.DAKAR_BROWSER_PROXY ? { proxy: { server: process.env.DAKAR_BROWSER_PROXY } } : {}),
  });
  const pageErrors = [];
  for (const [i, viewport] of [[0, { width: 390, height: 844 }], [1, { width: 1280, height: 720 }]]) {
    const ctx = await browser.newContext({ viewport, hasTouch: i === 0, isMobile: i === 0, ignoreHTTPSErrors: process.env.DAKAR_TEST_PROXY_TLS === 'true' }); contexts.push(ctx);
    await ctx.addInitScript(i => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('dakarrek.quality', 'low'); localStorage.setItem('dakarrek.presence.profile', JSON.stringify({ name: i ? 'Awa' : 'Moussa', look: i ? 1 : 0 })); } }, i);
    const page = await ctx.newPage(); page.setDefaultTimeout(90000); page.on('pageerror', e => pageErrors.push(e.message));
    await page.goto(`${base}?debug${i === 0 ? '&touch' : ''}`);
    await page.waitForFunction(() => window.__dakar?.presence().status === 'online' && window.__dakarChat, null, { timeout: 60000 });
  }
  const [a, b] = contexts.map(c => c.pages()[0]);
  for (const page of [a, b]) await page.waitForFunction(() => window.__dakar.presence().peers.length === 1, null, { timeout: 90000 });
  const idOf = page => page.evaluate(() => window.__dakar.presence().id);
  // SwiftShader on a shared machine can take seconds per screenshot: keep bubbles up while checking, then test the real 6 s.
  for (const page of [a, b]) await page.evaluate(() => window.__dakarChat.bubbleSeconds(60));

  // ---- layout: button under the multiplayer button, never on the hub title (also at 320 px)
  for (const width of [390, 320]) {
    await a.setViewportSize({ width, height: width === 320 ? 568 : 844 }); await sleep(700);
    const box = await a.evaluate(() => { const r = id => document.getElementById(id).getBoundingClientRect(); const c = r('chatBtn'), p = r('presenceBtn'), t = r('place'); return { c: [c.left, c.top, c.right, c.bottom], p: [p.left, p.top, p.right, p.bottom], t: [t.left, t.top, t.right, t.bottom] }; });
    const overlap = (x, y) => x[0] < y[2] && x[2] > y[0] && x[1] < y[3] && x[3] > y[1];
    check(`chat button below the multiplayer button, clear of the hub title (${width} px)`, box.c[1] >= box.p[3] && !overlap(box.c, box.t) && !overlap(box.c, box.p) && box.c[2] <= width, JSON.stringify(box));
  }
  await a.setViewportSize({ width: 390, height: 844 }); await sleep(500);

  // ---- proximity message: delivered, bubble on the other screen and above the speaker
  await a.evaluate(() => { window.__dakar.setHour(16); window.__dakar.place(-6, -30, 0); });
  await b.evaluate(() => { window.__dakar.setHour(16); window.__dakar.place(-7, -25, Math.PI); });
  await a.waitForFunction(() => window.__dakar.presence().peers.some(p => Math.abs(p.x + 7) < 0.2 && Math.abs(p.z + 25) < 0.2) && window.__dakar.presence().visible === 1);
  await b.waitForFunction(() => window.__dakar.presence().peers.some(p => Math.abs(p.x + 6) < 0.2 && Math.abs(p.z + 30) < 0.2));
  const bId = await idOf(b), aId = await idOf(a);
  await openChat(b, 'near');
  await say(b, 'Salaam aleekum Moussa, na nga def ? 🙏🏾');
  const sentNear = await settled(b, 'near');
  check('proximity message acknowledged as received by one nearby player', sentNear.status === 'sent' && sentNear.delivered === 1, JSON.stringify(sentNear));
  const selfBubble = await b.waitForFunction(() => window.__dakarChat.state().bubbles.some(x => x.owner === 'self' && x.visible), null, { timeout: 5000 }).then(() => true, () => false);
  check('speaker sees their own bubble and the "reçu" status', selfBubble && (await domStatus(b, sentNear.id)) === 'reçu');
  await b.screenshot({ path: `${SHOTS}/desktop-near-panel.png` });
  await a.waitForFunction(() => (window.__dakarChat.state().history.near ?? []).some(e => e.text.startsWith('Salaam aleekum')));
  await a.waitForFunction(id => window.__dakarChat.state().bubbles.some(x => x.owner === id && x.visible), bId);
  check('text shown unchanged and bubble visible above the speaker on the other screen', (await state(a)).history.near.at(-1).text === 'Salaam aleekum Moussa, na nga def ? 🙏🏾');
  await sleep(400);
  await a.screenshot({ path: `${SHOTS}/phone-bubble.png` });

  // ---- out of range: not delivered
  await a.evaluate(() => window.__dakar.place(-6, 20, 0));
  await b.waitForFunction(() => window.__dakar.presence().peers.some(p => Math.abs(p.z - 20) < 0.2));
  await say(b, 'Tu m’entends de là-bas ?');
  const far = await settled(b, 'near'); await sleep(800);
  check('out of range (46 m): not delivered, sender sees "personne à portée"', far.status === 'sent' && far.delivered === 0 && !conv(await state(a), 'near').some(e => e.text.startsWith('Tu m’entends')) && (await domStatus(b, far.id)) === 'reçu · personne à portée');

  // ---- different space: shared Maïga vs street; personal room is private
  await a.evaluate(() => window.__dakar.place(-6, -30, 0));
  await b.waitForFunction(() => window.__dakar.presence().peers.some(p => Math.abs(p.z + 30) < 0.2));
  await a.evaluate(() => window.__dakar.enter('maiga')); await a.waitForFunction(() => window.__dakar.pos().x > 900);
  await b.waitForFunction(() => window.__dakar.presence().peers.some(p => p.space.includes(':maiga:')));
  await say(b, 'Message de la rue');
  const street = await settled(b, 'near'); await sleep(800);
  check('street message does not reach a player inside the Maïga', street.delivered === 0 && !conv(await state(a), 'near').some(e => e.text === 'Message de la rue'));
  await b.evaluate(() => window.__dakar.enter('maiga')); await b.waitForFunction(() => window.__dakar.pos().x > 900);
  await a.waitForFunction(() => window.__dakar.presence().visible === 1);
  await say(b, 'On est au Maïga');
  const inside = await settled(b, 'near');
  await a.waitForFunction(() => (window.__dakarChat.state().history.near ?? []).some(e => e.text === 'On est au Maïga'));
  check('shared public interior: proximity message delivered', inside.delivered === 1);
  for (const page of [a, b]) { await page.evaluate(() => window.__dakar.exit()); await page.waitForFunction(() => window.__dakar.pos().x < 900); }
  await a.evaluate(() => window.__dakar.enter('home')); await a.waitForFunction(() => window.__dakar.pos().x > 900);
  await b.waitForFunction(() => window.__dakar.presence().peers.some(p => p.space === 'home'));
  await openChat(a, 'near'); await say(a, 'Allô ?');
  const home = await settled(a, 'near');
  check('personal room: proximity message refused with a readable status', home.status === 'failed' && home.reason === 'private-space' && (await domStatus(a, home.id)).includes('personne ne t’entend ici'), JSON.stringify(home));
  await a.evaluate(() => window.__dakar.exit()); await a.waitForFunction(() => window.__dakar.pos().x < 900);
  await a.evaluate(() => window.__dakar.place(-6, -30, 0)); await b.evaluate(() => window.__dakar.place(-7, -25, Math.PI));
  await a.keyboard.press('Escape');
  check('Escape closes the chat panel without opening the game menu', !(await state(a)).open && (await a.locator('#modal.on').count()) === 0);

  // ---- movement and camera suspended while typing (desktop keys, phone joystick), restored after
  await b.click('#chatInput');
  const p0 = await b.evaluate(() => window.__dakar.pos());
  await b.keyboard.down('KeyW'); await sleep(700); await b.keyboard.up('KeyW');
  const p1 = await b.evaluate(() => window.__dakar.pos());
  check('desktop: typing W in the chat field does not move the player', Math.hypot(p1.x - p0.x, p1.z - p0.z) < 0.05 && (await b.inputValue('#chatInput')).includes('w'), JSON.stringify([p0, p1]));
  await b.fill('#chatInput', '');
  await openChat(a, 'near'); await a.focus('#chatInput');
  const joy = (page, phase, x, y) => page.evaluate(([phase, x, y]) => document.getElementById('c').dispatchEvent(new PointerEvent(phase, { pointerId: 7, pointerType: 'touch', clientX: x, clientY: y, bubbles: true })), [phase, x, y]);
  const q0 = await a.evaluate(() => window.__dakar.pos());
  await joy(a, 'pointerdown', 88, 744); await joy(a, 'pointermove', 88, 680); await sleep(700); await joy(a, 'pointerup', 88, 680);
  const q1 = await a.evaluate(() => window.__dakar.pos());
  check('phone: joystick ignored while the keyboard field is focused', Math.hypot(q1.x - q0.x, q1.z - q0.z) < 0.05, JSON.stringify([q0, q1]));
  await a.keyboard.press('Escape');
  await joy(a, 'pointerdown', 88, 744); await joy(a, 'pointermove', 88, 680);
  await a.waitForFunction(z => Math.abs(window.__dakar.pos().z - z) > 0.3, q1.z, { timeout: 60000 }).catch(() => {}); await joy(a, 'pointerup', 88, 680);
  const q2 = await a.evaluate(() => window.__dakar.pos());
  check('phone: joystick works again once the chat is closed', Math.hypot(q2.x - q1.x, q2.z - q1.z) > 0.3, JSON.stringify([q1, q2]));
  await a.evaluate(() => window.__dakar.place(-6, -30, 0));

  // ---- private message, draft kept
  await b.click('.chat-tabs button[data-tab="dm"]');
  await b.locator('.chat-person-open', { hasText: 'Moussa' }).click();
  await b.fill('#chatInput', 'Brouillon pas fini');
  await b.click('.chat-close'); await b.click('#chatBtn');
  check('draft kept after closing and reopening the panel', (await b.inputValue('#chatInput')) === 'Brouillon pas fini');
  await say(b, 'Rendez-vous au Maïga ce soir ?');
  const dm = await settled(b, `dm:${(await state(b)).peer}`);
  check('private message acknowledged', dm.status === 'sent' && dm.delivered === 1, JSON.stringify(dm));
  await a.waitForFunction(() => Object.entries(window.__dakarChat.state().history).some(([k, v]) => k.startsWith('dm:') && v.some(e => e.text === 'Rendez-vous au Maïga ce soir ?')));
  check('private message delivered to the recipient only, with an unread badge', (await a.waitForFunction(() => document.querySelector('#chatBtn .chat-badge')?.textContent !== '', null, { timeout: 10000 }).then(() => true, () => false)) && !conv(await state(a), 'near').some(e => e.text.startsWith('Rendez-vous')));
  await a.click('#chatBtn'); await a.click('.chat-tabs button[data-tab="dm"]'); await a.locator('.chat-person-open', { hasText: 'Awa' }).click();
  await sleep(300); await a.screenshot({ path: `${SHOTS}/phone-private.png` });

  // ---- duplicate after a forced reconnect is not shown twice
  const dmKeyA = Object.keys((await state(a)).history).find(k => k.startsWith('dm:'));
  await contexts[1].setOffline(true);
  await b.waitForFunction(() => window.__dakar.presence().status === 'offline');
  await contexts[1].setOffline(false);
  await b.waitForFunction(() => window.__dakar.presence().status === 'online', null, { timeout: 90000 });
  await a.waitForFunction(old => window.__dakar.presence().peers.length === 1 && !window.__dakar.presence().peers.some(p => p.id === old), bId, { timeout: 90000 });
  const bId2 = await idOf(b);
  check('reconnected player keeps the same public tag (mute/block survive reconnects)', (await a.evaluate(() => window.__dakar.presence().peers[0].tag))?.length === 16 && Object.keys((await state(a)).history).includes(dmKeyA));
  await b.evaluate(id => window.__dakarChat.resend(id), dm.id);
  const again = await settled(b, `dm:${(await state(b)).peer}`, dm.text); await sleep(1000);
  check('resending the same message id after a reconnect does not duplicate it', again.status === 'sent' && conv(await state(a), dmKeyA).filter(e => e.id === dm.id).length === 1);

  // ---- over-long and rate-limited messages: rejected with a visible status
  await b.click('.chat-tabs button[data-tab="near"]');
  await b.evaluate(() => { const f = document.getElementById('chatInput'); f.removeAttribute('maxlength'); f.value = 'a'.repeat(CHAT_MAX + 50); f.dispatchEvent(new Event('input')); });
  await b.press('#chatInput', 'Enter');
  const long = await settled(b, 'near', 'a'.repeat(CHAT_MAX + 50));
  check('over-long message rejected with "trop long"', long.status === 'failed' && long.reason === 'too-long' && (await domStatus(b, long.id)).includes('trop long'));
  await b.evaluate(() => document.getElementById('chatInput').setAttribute('maxlength', String(CHAT_MAX)), CHAT_MAX);
  // One burst of RATE + 1 quick reactions (Playwright clicks are slow under SwiftShader and would spread over the window).
  await b.evaluate(n => { const r = [...document.querySelectorAll('.chat-react button')]; for (let i = 0; i < n; i++) r[i % r.length].click(); }, RATE + 1);
  await b.waitForFunction(n => (window.__dakarChat.state().history.near ?? []).filter(e => e.mine).slice(-n).every(e => e.status !== 'sending'), RATE + 1, { timeout: 60000 });
  const burst = conv(await state(b), 'near').filter(e => e.mine).slice(-(RATE + 1));
  check(`message ${RATE + 1} in ten seconds is rate-limited, with a retry button`, burst.slice(0, RATE).every(e => e.status === 'sent') && burst[RATE].status === 'failed' && burst[RATE].reason === 'rate-limited' && (await domStatus(b, burst[RATE].id)).includes('Réessayer'), JSON.stringify(burst.map(e => e.status + ':' + (e.reason ?? ''))));
  await sleep(300); await b.screenshot({ path: `${SHOTS}/desktop-statuses.png` });

  // ---- mute hides bubbles and messages; block hides the avatar; report confirmed
  await a.click('.chat-mute');
  await b.waitForTimeout(10500);                             // let the rate-limit window pass
  await say(b, 'Tu ne devrais pas voir ceci');
  const mutedMsg = await settled(b, 'near'); await sleep(1200);
  const sa = await state(a);
  check('mute: no bubble and no history line from the muted player', mutedMsg.delivered === 1 && !sa.bubbles.some(x => x.owner === bId2) && !conv(sa, 'near').some(e => e.text === 'Tu ne devrais pas voir ceci') && sa.muted.includes('Awa'));
  await a.click('.chat-mute');
  await a.click('.chat-block');
  await a.waitForFunction(() => window.__dakar.presence().visible === 0);
  check('block: the blocked player’s avatar is hidden on this device', (await state(a)).blocked.includes('Awa'));
  await a.click('.chat-block'); await a.waitForFunction(() => window.__dakar.presence().visible === 1);
  await a.click('.chat-report'); await a.locator('.chat-report-box button', { hasText: 'Insultes' }).click();
  await a.waitForFunction(() => window.__dakarChat.state().reports.some(r => r.server === 'counted'));
  check('report: confirmed as "Signalé", logged locally and counted by the server', await a.waitForFunction(() => document.querySelector('.chat-report')?.textContent === 'Signalé', null, { timeout: 10000 }).then(() => true, () => false));
  await sleep(300); await a.screenshot({ path: `${SHOTS}/phone-profile-report.png` });
  await a.evaluate(() => window.__dakar.place(-6, -30, 0)); await sleep(300);
  await a.click('.chat-close');
  await say(b, 'Tout va bien, on se voit à Pikine'); await b.click('.chat-close');
  await a.waitForFunction(id => window.__dakarChat.state().bubbles.some(x => x.owner === id && x.visible), bId2);
  await a.screenshot({ path: `${SHOTS}/phone-bubble-closed-panel.png` });
  await b.waitForFunction(() => window.__dakarChat.state().bubbles.some(x => x.owner === 'self' && x.visible), null, { timeout: 5000 }).catch(() => {});
  await b.screenshot({ path: `${SHOTS}/desktop-bubble.png` });
  // Real lifetime: a new bubble lasts 6 s and then disappears.
  await a.evaluate(() => window.__dakarChat.bubbleSeconds(6));
  await b.click('#chatBtn'); await say(b, 'À tout à l’heure');
  await a.waitForFunction(id => window.__dakarChat.state().bubbles.some(x => x.owner === id && x.left <= 6.01), bId2);
  const t0 = Date.now();
  await a.waitForFunction(id => !window.__dakarChat.state().bubbles.some(x => x.owner === id), bId2, { timeout: 30000 });
  check('bubble fades out after 6 seconds (history keeps the message)', Date.now() - t0 < 25000 && conv(await state(a), 'near').some(e => e.text === 'À tout à l’heure'));
  void aId;

  // ---- raw WebSocket checks of the server rules (isolated group)
  function connect(params) {
    return new Promise((resolve, reject) => {
      const url = new URL('/api/presence', base); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'; url.search = new URLSearchParams(params).toString();
      const ws = new WebSocket(url); sockets.push(ws); const inbox = [];
      const timer = setTimeout(() => reject(new Error('WebSocket welcome timeout')), 10000);
      ws.addEventListener('message', e => { const m = JSON.parse(e.data); inbox.push(m); if (m.type === 'welcome') { clearTimeout(timer); resolve({ ws, welcome: m, inbox }); } });
      ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('WebSocket error')); }, { once: true });
    });
  }
  const until = async (inbox, fn, ms = 5000) => { const end = Date.now() + ms; while (Date.now() < end) { const m = inbox.find(fn); if (m) return m; await sleep(50); } return null; };
  const move = (ws, x, z) => ws.send(JSON.stringify({ type: 'move', x, y: 0.1, z, yaw: 0, speed: 0, space: 'street', clip: 'Idle' }));
  const room = { hub: 'plateau', room: '9' };
  const s1 = await connect({ ...room, name: 'Testeur', key: 'a'.repeat(32) }), s2 = await connect({ ...room, name: 'Témoin', key: 'b'.repeat(32) });
  move(s1.ws, 0, 0); move(s2.ws, 3, 3); await sleep(400);
  const run = Date.now().toString(36);                        // dedupe entries persist in the local Durable Object storage
  const mid = `check-${run}-near`;
  s1.ws.send(JSON.stringify({ type: 'chat', id: mid, channel: 'near', text: 'Bonjour le Plateau', from: 'quelqu-un-d-autre', amount: 100000 }));
  const got = await until(s2.inbox, m => m.type === 'chat' && m.id === mid);
  check('server delivers with server-side identity, ignoring spoofed fields', got && got.from === s1.welcome.id && got.name === 'Testeur' && got.text === 'Bonjour le Plateau' && !('amount' in got) && got.tag?.length === 16);
  s1.ws.close(); await sleep(300);
  const s1b = await connect({ ...room, name: 'Testeur', key: 'a'.repeat(32) });
  move(s1b.ws, 0, 0); await sleep(300);
  s1b.ws.send(JSON.stringify({ type: 'chat', id: mid, channel: 'near', text: 'Bonjour le Plateau' }));
  const dupAck = await until(s1b.inbox, m => m.type === 'chat-ack' && m.id === mid); await sleep(700);
  check('server: same id after reconnect acknowledged as duplicate, not delivered twice', dupAck?.ok === true && dupAck.duplicate === true && s2.inbox.filter(m => m.type === 'chat' && m.id === mid).length === 1);
  s1b.ws.send(JSON.stringify({ type: 'chat', id: `long-${run}`, channel: 'near', text: 'x'.repeat(CHAT_MAX + 1) }));
  s1b.ws.send(JSON.stringify({ type: 'chat', id: `nobody-${run}`, channel: 'dm', to: '00000000-0000-4000-8000-000000000000', text: 'allô' }));
  const longAck = await until(s1b.inbox, m => m.type === 'chat-ack' && m.id === `long-${run}`);
  const dmAck = await until(s1b.inbox, m => m.type === 'chat-ack' && m.id === `nobody-${run}`);
  check(`server rejects over ${CHAT_MAX} characters and private messages to absent players`, longAck?.reason === 'too-long' && dmAck?.reason === 'offline');
  for (let i = 0; i <= RATE; i++) s1b.ws.send(JSON.stringify({ type: 'chat', id: `rate-${run}-${i}`, channel: 'dm', to: s2.welcome.id, text: `n°${i}` }));
  const over = await until(s1b.inbox, m => m.type === 'chat-ack' && m.id === `rate-${run}-${RATE}`);
  check(`server rate limit: ${RATE} per ten seconds per connection`, over?.ok === false && over.reason === 'rate-limited');
  check('no browser page errors (online)', pageErrors.length === 0, pageErrors.join(' | '));

  // ---- solo build (no Worker): chat hidden, no errors
  for (const ctx of contexts.splice(0)) await ctx.close();   // free the CPU for the next page under SwiftShader
  await new Promise((resolve, reject) => { const p = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--outDir', 'shots/chat-solo-dist', '--emptyOutDir'], { stdio: ['ignore', 'pipe', 'pipe'] }); procLog(p); p.on('exit', c => (c === 0 ? resolve() : reject(new Error(`solo build failed: ${logs}`)))); });
  preview = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--outDir', 'shots/chat-solo-dist', '--port', String(PREVIEW_PORT), '--strictPort', '--host', '127.0.0.1'], { stdio: ['ignore', 'pipe', 'pipe'] }); procLog(preview);
  await waitHttp(`http://127.0.0.1:${PREVIEW_PORT}/`, preview);
  const soloErrors = [];
  const solo = await (await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })).newPage();
  solo.setDefaultTimeout(90000); solo.on('pageerror', e => soloErrors.push(e.message));
  await solo.goto(`http://127.0.0.1:${PREVIEW_PORT}/?debug&touch`);
  await solo.waitForFunction(() => window.__dakar?.presence().status === 'solo', null, { timeout: 90000 });
  await sleep(1000);
  check('solo build: no chat button, no chat runtime, no page errors', (await solo.locator('#chatBtn').count()) === 0 && !(await solo.evaluate(() => !!window.__dakarChat)) && soloErrors.length === 0, soloErrors.join(' | '));
  await solo.context().close();

  await fs.writeFile(`${SHOTS}/results.json`, JSON.stringify(checks, null, 2));
  console.log(`\n${checks.filter(c => c.ok).length}/${checks.length} chat checks passed`);
} catch (error) {
  console.error(error); if (logs) console.error(logs.slice(-4000)); process.exitCode = 1;
  for (const ctx of contexts) {
    const page = ctx.pages()[0];
    try { console.error('client state', JSON.stringify(await page.evaluate(() => ({ pos: window.__dakar.pos(), presence: window.__dakar.presence(), chat: window.__dakarChat.state() })))); await page.screenshot({ path: `${SHOTS}/failure-${contexts.indexOf(ctx)}.png` }); } catch { /* page gone */ }
  }
}
finally {
  for (const ws of sockets) try { ws.close(); } catch { /* closed */ }
  for (const ctx of contexts) await ctx.close().catch(() => {});
  await browser?.close(); worker?.kill('SIGTERM'); preview?.kill('SIGTERM');
}
