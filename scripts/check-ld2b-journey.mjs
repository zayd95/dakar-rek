// LD2.0-B acceptance (docs/ld2/LD2_B_CONTRACT.md): two players on the real local Workers runtime (`wrangler dev --local`, fresh state), each in their
// own phone-sized page of the real online build, every action a real tap (Chrome's touch pipeline, scripts/lib/realTouch.mjs):
//   1. connect and exchange private messages (Awa finds Moussa « à côté de toi », writes; Moussa's badge, his answer);
//   2. Awa requests 5 000 F, Moussa pays it from its card (a real DOUBLE tap on the confirmation): exactly once on the server's ledger, his wallet −5 000 F,
//      her Teranga Money +5 000 F, the request paid; paying it again is refused;
//   3. both reload: the same balances, the same server history, the same conversation;
//   4. Awa invites Moussa home, he accepts on the card and « Y aller » guides him to her door;
//   5. both are in Awa's home together: she went in, he walks to her door and taps « Entrer chez Awa (invité) »; each sees the other inside;
//   6. a meeting at the Grand-place at a city time: proposed, accepted, both there in its window → met on both sides, the card shown.
// Debug hooks only set the scene (names, a home and furniture for Awa, money for Moussa, a place to stand) and read the state; nothing is paid or sent by them.
// Usage: npm run build:online && node scripts/check-ld2b-journey.mjs [outDir]
// Ports: wrangler dev 8840 (inspector 9340); override with JOURNEY_PORT.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { realTouch, walkTo } from './lib/realTouch.mjs';

const OUT = process.argv[2] || 'docs/ld2/proof/journey-b';
const PORT = Number(process.env.JOURNEY_PORT || 8840);
const STATE = `/tmp/claude-0/ld2b/journey-state-${Date.now()}`;
const BASE = `http://127.0.0.1:${PORT}/`;
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(STATE, { recursive: true });
if (!fs.existsSync('dist/index.html')) { console.error('No build: run `npm run build:online` first.'); process.exit(2); }

const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok: !!ok, extra: String(extra).slice(0, 600) }); console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`, ok || !extra ? '' : String(extra).slice(0, 600)); };
const NB = s => String(s ?? '').replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim();
let logs = '';
const worker = spawn(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'dev', '--local', '--ip', '127.0.0.1', '--port', String(PORT), '--inspector-port', String(PORT + 500), '--persist-to', STATE],
  { env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }, stdio: ['ignore', 'pipe', 'pipe'] });
for (const s of [worker.stdout, worker.stderr]) s.on('data', b => { logs = (logs + b).slice(-20000); });
const health = async () => { const until = Date.now() + 180000; while (Date.now() < until) { if (worker.exitCode !== null) throw new Error(`wrangler exited: ${logs}`); try { if ((await fetch(`${BASE}api/health`)).ok) return; } catch { /* starting */ } await sleep(400); } throw new Error('wrangler did not answer'); };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });

/** One player: a phone-sized context (its own storage: its own device key, so its own account), the game loaded, and the helpers that tap like a thumb. */
async function player(name, look, avatar, guest) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await ctx.addInitScript(([name, look, avatar, guest]) => {
    try {
      if (!localStorage.getItem('dakarrek.guest.save.v6')) localStorage.setItem('dakarrek.guest.save.v6', JSON.stringify({ schemaVersion: 6, guestId: guest, avatar }));
      localStorage.setItem('dakarrek.quality', 'low');
      localStorage.setItem('dakarrek.presence.profile', JSON.stringify({ name, look }));
    } catch { /* */ }
  }, [name, look, avatar, guest]);
  const p = { name, ctx, page: null, t: null, errors: [] };
  p.open = async () => {
    const page = await ctx.newPage(); page.setDefaultTimeout(240000);
    page.on('pageerror', e => p.errors.push(e.message));
    await page.goto(`${BASE}?debug&touch`, { timeout: 180000 });
    await page.waitForFunction(() => window.__dakar?.pos?.().hub && !document.getElementById('studio'), null, { timeout: 300000 });
    await page.waitForFunction(() => window.__dakar.presence().status === 'online' && window.__dakar.account()?.status === 'online' && !!window.__dakar.account().me, null, { timeout: 120000 });
    p.page = page; p.t = await realTouch(page); p.cdp = await ctx.newCDPSession(page);
    p.tag = await page.evaluate(() => window.__dakar.account().me.tag);
    return page;
  };
  const d = (fn, a) => p.page.evaluate(fn, a);
  p.d = d;
  p.wait = ms => p.page.waitForTimeout(ms);
  p.until = (fn, arg, ms = 30000) => p.page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
  const settled = () => p.page.waitForFunction(() => !document.querySelector('#phone.on')?.getAnimations({ subtree: true }).some(a => a.playState === 'running' && a.effect?.getComputedTiming?.().iterations !== Infinity), null, { timeout: 30000 }).catch(() => {});
  /** A real tap on what `find` returns (scrolled into view first, as a thumb would), after the phone has settled; `twice`: a real double tap. */
  p.tapWhere = async (find, arg, { settle = 450, twice = false } = {}) => {
    await p.wait(settle); await settled();
    const at = () => d(([src, a]) => { const el = (0, eval)(src)(a); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, out: r.top < 0 || r.bottom > innerHeight }; }, [find.toString(), arg]);
    let c = await at();
    if (c?.out) { await d(([src, a]) => (0, eval)(src)(a).scrollIntoView({ block: 'center', behavior: 'instant' }), [find.toString(), arg]); await p.wait(300); c = await at(); }
    for (let k = 0; k < 20 && c; k++) { await p.wait(120); const c2 = await at(); if (c2 && Math.abs(c2.y - c.y) < 1 && Math.abs(c2.x - c.x) < 1) break; c = c2; }
    if (!c) throw new Error(`${name}: nothing to tap: ${arg}`);
    if (!twice) { await p.t.down(9, c.x, c.y); await p.wait(50); await p.t.up(9); return; }
    const t0 = Date.now() / 1000, pt = [{ id: 7, x: c.x, y: c.y, radiusX: 8, radiusY: 8, force: 1 }];
    await Promise.all([['touchStart', 0], ['touchEnd', 0.05], ['touchStart', 0.13], ['touchEnd', 0.18]].map(([type, dt]) => p.cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pt, timestamp: t0 + dt })));
  };
  p.tap = (sel, o) => p.tapWhere(s => document.querySelector(s), sel, o);
  p.type = async (sel, text) => { await p.tap(sel); await p.wait(150); await p.page.keyboard.insertText(text); };
  p.shot = async file => { await p.wait(300); await p.page.screenshot({ path: `${OUT}/${file}.jpg`, type: 'jpeg', quality: 72 }); };
  p.screen = () => d(() => document.querySelector('#phone .ph-screen')?.innerText ?? '').then(NB);
  p.sheet = () => d(() => document.querySelector('#phone .mg-sheet')?.innerText ?? '').then(NB);
  p.card = id => d(i => document.querySelector(`#phone .mg-log [data-key="${i}"]`)?.innerText ?? null, id).then(t => t === null ? null : NB(t));
  p.wallet = () => d(() => window.__dakar.state.wallet);
  p.acct = () => d(() => { const o = window.__dakar.account(); return { status: o.status, me: o.me, balance: o.balance, today: o.today, convs: o.convs(), unread: o.unread() }; });
  p.items = tag => d(t => window.__dakar.account().items(t).map(i => ({ ...i })), tag);
  p.history = () => d(async () => { const r = await window.__dakar.account().history(); return r.ok ? r.ops : r; });
  /** Messages, opened as a player does: the phone, « Toutes les apps », the Messages tile. */
  p.messages = async () => {
    await d(() => window.__dakar.phone('home')); await p.until(() => window.__dakar.phoneInfo().screen === 'home'); await p.wait(900);
    await p.tap('#phone .hm-tile[data-go="apps"]'); await p.until(() => window.__dakar.phoneInfo().screen === 'apps'); await p.wait(500);
    await p.tap('#phone .ph-app[data-app="messages"]'); await p.until(() => window.__dakar.phoneInfo().screen === 'messages');
  };
  /** A « + » action's confirmation: the sheet's « OK » after the outcome. */
  p.okOutcome = async re => {
    await p.until(r => new RegExp(r).test((document.querySelector('#phone .mg-sheet')?.innerText ?? '').replace(/[  ]/g, ' ')), re.source, 60000);
    const text = await p.sheet();
    await p.tapWhere(() => [...document.querySelectorAll('#phone .mg-sheet .pk-btn')].filter(b => /OK/.test(b.textContent)).pop());
    await p.until(() => !document.querySelector('#phone .mg-sheet-wrap'));
    return text;
  };
  return p;
}

const A = await player('Awa', 2, 'femme', 'g-ld2b-awa'), B = await player('Moussa', 4, 'homme', 'g-ld2b-moussa');
try {
  await health();
  await A.open(); await B.open();
  check('0. two players on the local Workers runtime: presence and the account online in both pages, two accounts (two device keys)', A.tag && B.tag && A.tag !== B.tag && /^[0-9a-f]{16}$/.test(A.tag), JSON.stringify({ a: A.tag, b: B.tag }));

  // ------------------------------------------------------------------ the scene: Awa's F2 at the Cité Jàmm (bought, furnished), Moussa's money, both by her door
  const spots = await A.d(() => window.__dakar.citeSpots());
  const door = (await A.d(() => window.__dakar.interactables())).find(i => i.id === 'pikine:home:jamm');
  const entry = spots.homes.appart_jamm.entry, dl = Math.hypot(entry.x - door.x, entry.z - door.z) || 1;
  const outside = k => ({ x: door.x + ((entry.x - door.x) / dl) * k, z: door.z + ((entry.z - door.z) / dl) * k });
  await A.d(() => { const d = window.__dakar; d.giveMoney(20_000_000); /* the F2 is 15 000 000 F */ d.buyAsset('appart_jamm'); d.moveIn('appart_jamm'); for (const id of ['canape_wax', 'table_basse', 'tele_plate', 'lit_bois']) d.buyPiece(id); d.save(); });
  await B.d(() => { window.__dakar.giveMoney(60_000); window.__dakar.save(); });
  for (const [p, k] of [[A, 4], [B, 7]]) { await p.d(s => window.__dakar.place(s.x, s.z, 0), outside(k)); }
  await A.until(t => window.__dakar.presence().peers.some(p => p.tag === t), B.tag, 60000);
  const sameRoom = await B.until(t => window.__dakar.presence().peers.some(p => p.tag === t), A.tag, 60000);
  check('0b. the scene: Awa owns and lives in the Résidence Jàmm’s F2 (furnished), Moussa has cash; both stand by her door and see each other (same presence room)', sameRoom
    && (await A.d(() => window.__dakar.estate().home)) === 'appart_jamm', JSON.stringify({ wallet: await B.wallet() }));

  // ------------------------------------------------------------------ 1. private messages
  await A.messages();
  await A.tap('#phone .mg-new');
  await A.until(t => !!document.querySelector(`#phone .mg-near .mg-person[data-tag="${t}"]`), B.tag, 30000);
  await A.shot('1-awa-new-message');
  await A.tap(`#phone .mg-near .mg-person[data-tag="${B.tag}"]`);
  await A.until(t => window.__dakar.phoneInfo().arg === t, B.tag);
  await A.type('#phone .mg-field', 'Salut Moussa ! Tu es où ?');
  await A.tap('#phone .mg-send', { settle: 100 });
  const sentA = await A.until(() => [...document.querySelectorAll('#phone .mg-b.me')].pop()?.innerText.includes('envoyé'), null, 30000);
  const badge = await B.until(() => window.__dakar.account().unread() === 1, null, 30000);
  await B.messages();
  const listB = await B.screen();
  await B.tap(`#phone .mg-conv[data-tag="${A.tag}"]`);
  await B.until(t => window.__dakar.phoneInfo().arg === t, A.tag);
  const seenB = await B.until(() => document.querySelector('#phone .mg-log')?.innerText.includes('Salut Moussa'));
  await B.type('#phone .mg-field', 'Devant ta porte, à la Cité Jàmm.');
  await B.tap('#phone .mg-send', { settle: 100 });
  const replyA = await A.until(() => document.querySelector('#phone .mg-log')?.innerText.includes('Devant ta porte'), null, 30000);
  check('1. private messages: Awa finds Moussa « à côté de toi » and writes (sent ✓); his badge shows 1, the list shows her line; he reads it and answers; she reads it',
    sentA && badge && /Awa/.test(listB) && /Salut Moussa/.test(listB) && seenB && replyA, listB.slice(0, 200));
  await A.shot('1-awa-conversation'); await B.shot('1-moussa-conversation');

  // ------------------------------------------------------------------ 2. a request of 5 000 F, paid once
  const walletB0 = await B.wallet(), balA0 = (await A.acct()).balance?.amount ?? 0;
  await A.tap('#phone .mg-plus'); await A.tap('#phone .mg-pi[data-do="ask"]');
  await A.until(() => !!document.querySelector('#phone .mg-sheet .mg-chip'));
  await A.tap('#phone .mg-chip[data-amt="5000"]');
  await A.type('#phone .mg-sheet [data-f="note"]', 'Pour le taxi');
  await A.tap('#phone .mg-next');
  await A.until(() => !!document.querySelector('#phone .mg-ok'));
  await A.tap('#phone .mg-ok');
  const askOut = await A.okOutcome(/Demande de 5 000 F envoyée à Moussa/);
  const askA = (await A.items(B.tag)).filter(i => i.k === 'ask').pop();
  await B.until(r => !!document.querySelector(`#phone [data-key="${r}"] [data-do="pay"]`), askA.id, 30000);
  const askCardB = await B.card(askA.id);
  await B.shot('2-moussa-request');
  await B.tap(`#phone [data-key="${askA.id}"] [data-do="pay"]`);
  await B.until(() => !!document.querySelector('#phone .mg-sheet .mg-ok'));
  await B.d(() => { const m = document.querySelector('#phone .mg-sheet details'); if (m) m.open = true; });
  const quoteB = await B.sheet(), payId = await B.d(() => document.querySelector('#phone .mg-ok').dataset.id);
  await B.shot('2-moussa-confirm');
  await B.tap('#phone .mg-ok', { twice: true });
  const payOut = await B.okOutcome(/envoyés à Awa/);
  await A.until(r => /Payée ✓/.test(document.querySelector(`#phone [data-key="${r}"]`)?.innerText ?? ''), askA.id, 30000);
  await sleep(1500);
  const walletB1 = await B.wallet(), accA = await A.acct(), accB = await B.acct();
  const histA = await A.history(), histB = await B.history();
  const paysB = Array.isArray(histB) ? histB.filter(o => o.kind === 'pay') : histB, paysA = Array.isArray(histA) ? histA.filter(o => o.kind === 'pay') : histA;
  const askAfterA = (await A.items(B.tag)).find(i => i.id === askA.id), askAfterB = (await B.items(A.tag)).find(i => i.id === askA.id);
  check('2a. Awa’s request « 5 000 F · Pour le taxi » reaches Moussa as a card with « Payer » / « Refuser »', /Demande de 5 000 F envoyée à Moussa/.test(askOut) && /5 000 F/.test(askCardB ?? '') && /Pour le taxi/.test(askCardB ?? '') && /Payer/.test(askCardB ?? ''), askCardB);
  check('2b. the confirmation says how it is paid: 5 000 F from his wallet (Teranga Money empty), then today’s limits', /Envoyer 5 000 F à Awa/.test(quoteB) && /portefeuille 5 000 F/i.test(quoteB), quoteB.slice(0, 300));
  check('2c. a real double tap: ONE operation on the server’s ledger, with the confirmation’s id and the request; his wallet −5 000 F exactly; her Teranga Money +5 000 F exactly',
    Array.isArray(paysB) && paysB.length === 1 && paysB[0].id === payId && paysB[0].amount === 5000 && paysB[0].req === askA.id && paysB[0].to === A.tag
    && Array.isArray(paysA) && paysA.length === 1 && paysA[0].id === payId && walletB1 === walletB0 - 5000 && accA.balance.amount === balA0 + 5000 && accB.balance.amount === 0,
    JSON.stringify({ paysB, paysA, walletB0, walletB1, balA: accA.balance, balB: accB.balance }));
  check('2d. both see the completed transaction: the request « Payée ✓ » on both sides, the outcome said to Moussa', askAfterA?.state === 'paid' && askAfterB?.state === 'paid' && /5 000 F envoyés à Awa/.test(payOut), JSON.stringify({ a: askAfterA?.state, b: askAfterB?.state, payOut }));
  const again = await B.d(async ([to, req]) => { const o = window.__dakar.account(); return o.pay({ id: o.newId(), to, amount: 5000, req }); }, [A.tag, askA.id]);
  await sleep(800);
  const histB2 = await B.history();
  check('2e. paying the same request again (a new operation id) is refused by the server, and nothing moves', !again.ok && /request|closed|demande/i.test(`${again.reason} ${again.text}`) && (await B.wallet()) === walletB1 && histB2.filter(o => o.kind === 'pay').length === 1, JSON.stringify(again));
  await A.shot('2-awa-paid'); await B.shot('2-moussa-paid');

  // ------------------------------------------------------------------ 3. both reload
  const convA0 = (await A.items(B.tag)).map(i => i.id).sort().join(','), saveB = await B.d(() => { window.__dakar.save(); return JSON.parse(localStorage.getItem('dakarrek.guest.save.v6')).wallet; });
  await A.page.close(); await B.page.close();
  await A.open(); await B.open();
  for (const [p, k] of [[A, 4], [B, 7]]) { await p.d(s => window.__dakar.place(s.x, s.z, 0), outside(k)); }
  await sleep(1500);
  const accA2 = await A.acct(), accB2 = await B.acct(), histA3 = await A.history(), histB3 = await B.history();
  await A.until(t => window.__dakar.account().items(t).length > 0, B.tag, 30000);
  const convA1 = (await A.items(B.tag)).map(i => i.id).sort().join(',');
  const pending = await B.d(() => JSON.parse(localStorage.getItem('dakarrek.guest.save.v6')).online?.pending?.length ?? 0);
  check('3. after both reload: her Teranga Money 5 000 F and his wallet as saved (−5 000 F), one transfer in both server histories, the conversation intact, nothing pending',
    accA2.balance.amount === balA0 + 5000 && accA2.balance.fresh && (await B.wallet()) === saveB && saveB === walletB1 && histA3.filter(o => o.kind === 'pay').length === 1 && histB3.filter(o => o.kind === 'pay').length === 1 && convA1 === convA0 && pending === 0,
    JSON.stringify({ balA: accA2.balance, walletB: await B.wallet(), saveB, convSame: convA1 === convA0, pending }));

  // ------------------------------------------------------------------ 4. an invitation home
  await A.d(t => window.__dakar.phone(`messages:${t}`), B.tag); await A.until(t => window.__dakar.phoneInfo().arg === t, B.tag);
  await A.tap('#phone .mg-plus'); await A.tap('#phone .mg-pi[data-do="invite"]');
  await A.until(() => !!document.querySelector('#phone .mg-sheet .mg-ok'));
  const invSheet = await A.sheet();
  await A.tap('#phone .mg-ok');
  await A.until(() => !document.querySelector('#phone .mg-sheet-wrap'), null, 30000);
  const inv = (await A.items(B.tag)).filter(i => i.k === 'invite').pop();
  await B.d(t => window.__dakar.phone(`messages:${t}`), A.tag); await B.until(t => window.__dakar.phoneInfo().arg === t, A.tag);
  await B.until(r => !!document.querySelector(`#phone [data-key="${r}"] [data-do="accept"]`), inv?.id, 30000);
  await B.tap(`#phone [data-key="${inv.id}"] [data-do="accept"]`);
  await B.until(r => !!document.querySelector(`#phone [data-key="${r}"] [data-do="go"]`), inv.id, 30000);
  const accepted = await A.until(r => /Acceptée/.test(document.querySelector(`#phone [data-key="${r}"]`)?.innerText ?? ''), inv.id, 30000);
  await B.shot('4-moussa-invitation');
  await B.tap(`#phone [data-key="${inv.id}"] [data-do="go"]`);
  await B.until(() => !window.__dakar.phoneInfo().open);
  await sleep(800);
  const destB = await B.d(() => window.__dakar.destination());
  check('4. « Inviter chez moi » (her F2) reaches Moussa; he accepts on the card (« Acceptée » on her side too) and « Y aller » guides him to her door',
    /Résidence Jàmm|F2|appartement/i.test(invSheet) && inv?.home?.spec === 'appart_jamm' && accepted && !!destB, JSON.stringify({ invSheet: invSheet.slice(0, 160), dest: destB }));

  // ------------------------------------------------------------------ 5. in her home together
  await A.d(() => window.__dakar.phoneClose());
  await A.d(() => window.__dakar.enterHome('appart_jamm'));
  await A.until(() => window.__dakar.homeView()?.spec === 'appart_jamm' && window.__dakar.pos().mode === 'play', null, 60000);
  const spaceA = await A.d(() => window.__dakar.visit.info().space);
  const dist = await walkTo(B.page, B.t, door.x, door.z, { tol: 1.1, ms: 90000 });
  await B.wait(700);
  const atDoor = await B.d(() => window.__dakar.focus());
  await B.shot('5-moussa-at-door');
  await B.t.tap('#act');
  const inB = await B.until(() => window.__dakar.visit.info().visiting?.inside === true && window.__dakar.pos().mode === 'play', null, 60000);
  await sleep(2500);
  const infoB = await B.d(() => window.__dakar.visit.info());
  const seesB = await A.until(t => window.__dakar.presence().peers.some(p => p.tag === t && p.space.startsWith('home:')) && window.__dakar.presence().visible >= 1, B.tag, 30000);
  const seesA = await B.until(t => window.__dakar.presence().peers.some(p => p.tag === t && p.space === `home:${t}`) && window.__dakar.presence().visible >= 1, A.tag, 30000);
  const piecesA = (await A.d(() => window.__dakar.homeView())).pieces.length, piecesB = (await B.d(() => window.__dakar.homeView()))?.pieces.length;
  check('5a. Moussa walks to her door (joystick) and is offered « Entrer chez Awa (invité) »', dist < 1.6 && atDoor?.primary === 'Entrer chez Awa (invité)', JSON.stringify({ dist, atDoor }));
  check('5b. both in her home: her space and his are `home:<her tag>`, her furniture drawn for him (same pieces), and each one’s game draws the other inside',
    inB && spaceA === `home:${A.tag}` && infoB.space === `home:${A.tag}` && piecesB === piecesA && piecesA === 4 && seesB && seesA, JSON.stringify({ spaceA, spaceB: infoB.space, piecesA, piecesB, seesB, seesA }));
  await A.d(() => { const d = window.__dakar; d.portrait?.(3.2, 1.6, 0.6); d.render?.(); }); await B.d(() => { const d = window.__dakar; d.portrait?.(3.2, 1.6, 0.6); d.render?.(); });
  await A.shot('5-awa-home-together'); await B.shot('5-moussa-home-together');
  await A.d(() => window.__dakar.portrait?.(0)); await B.d(() => window.__dakar.portrait?.(0));

  // ------------------------------------------------------------------ 6. a meeting at the Grand-place, at a city time
  await A.d(() => window.__dakar.exit()); await B.d(() => window.__dakar.exit());
  await A.until(() => !window.__dakar.homeView()); await B.until(() => !window.__dakar.homeView());
  await A.d(t => window.__dakar.phone(`messages:${t}`), B.tag); await A.until(t => window.__dakar.phoneInfo().arg === t, B.tag);
  await A.tap('#phone .mg-plus'); await A.tap('#phone .mg-pi[data-do="meet"]');
  await A.until(() => !!document.querySelector('#phone .mg-sheet [data-when="h1"]'));
  await A.tap('#phone .mg-sheet [data-place="pikine:city:square"]');
  await A.tap('#phone .mg-sheet [data-when="h1"]');
  const meetClock = await A.d(() => document.querySelector('#phone .mg-sheet [data-when="h1"] span')?.textContent ?? '');
  await A.shot('6-awa-meeting-sheet');
  await A.tap('#phone .mg-ok');
  await A.until(() => !document.querySelector('#phone .mg-sheet-wrap'), null, 30000);
  const meet = (await A.items(B.tag)).filter(i => i.k === 'meet').pop();
  await B.d(t => window.__dakar.phone(`messages:${t}`), A.tag); await B.until(t => window.__dakar.phoneInfo().arg === t, A.tag);
  await B.until(r => !!document.querySelector(`#phone [data-key="${r}"] [data-do="accept"]`), meet?.id, 30000);
  await B.tap(`#phone [data-key="${meet.id}"] [data-do="accept"]`);
  await A.until(r => window.__dakar.account().items(window.__dakar.account().convs()[0]?.with ?? '').some(i => i.id === r && i.state === 'accepted'), meet.id, 30000);
  // both go to the Grand-place (the city's walk is long: they are put a few metres from it, then walk the last metres with the joystick)
  const square = (await A.d(() => window.__dakar.interactables())).find(i => i.id === 'pikine:city:square');
  for (const p of [A, B]) { await p.d(() => window.__dakar.phoneClose()); await p.d(s => window.__dakar.place(s.x + 9, s.z, 0), square); }
  await walkTo(A.page, A.t, square.x + 2, square.z, { tol: 1.5, ms: 60000 }); await walkTo(B.page, B.t, square.x - 2, square.z, { tol: 1.5, ms: 60000 });
  const met = await A.until(r => { const o = window.__dakar.account(); return o.convs().some(c => o.items(c.with).some(i => i.id === r && i.state === 'met')); }, meet.id, 120000);
  const metB = await B.until(r => { const o = window.__dakar.account(); return o.convs().some(c => o.items(c.with).some(i => i.id === r && i.state === 'met')); }, meet.id, 30000);
  // the card « Vous êtes au rendez-vous ✓ » (src/online/meetups.ts): shown once on each side (its log), whenever the meeting turned met
  const cardA = await A.until(r => window.__dakar.meet.info().log.cards.includes(r), meet.id, 15000), cardB = await B.until(r => window.__dakar.meet.info().log.cards.includes(r), meet.id, 15000);
  await A.shot('6-awa-met'); await B.shot('6-moussa-met');
  check('6. a meeting « Grand-place de Pikine » at a city time (« À NN h », sent as server ms): Moussa accepts; both there in its window → met on both sides, the card shown',
    meet?.place?.id === 'pikine:city:square' && meet.when > meet.at && /^\d\d:00$/.test(meetClock) && met && metB && cardA && cardB, JSON.stringify({ meet, meetClock, met, metB, cardA, cardB }));

  check('no page errors in either game', !A.errors.length && !B.errors.length, JSON.stringify({ a: A.errors.slice(0, 3), b: B.errors.slice(0, 3) }));
} catch (e) {
  check('the journey went through', false, e.stack ?? String(e));
} finally {
  await browser.close();
  worker.kill('SIGTERM');
  const failed = results.filter(r => !r.ok).length;
  fs.writeFileSync(`${OUT}/results.json`, JSON.stringify({ at: new Date().toISOString(), passed: results.length - failed, failed, results }, null, 2));
  console.log(`${results.length - failed}/${results.length} passed`);
  process.exitCode = failed ? 1 : 0;
}
