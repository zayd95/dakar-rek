// The phone's Messages app and Teranga Money (LD2.0-B lane M) on a phone page (390 × 844, real touches through Chrome's input pipeline), against the
// in-memory account (src/online/fake.ts, `?debug&fakeonline`) whose scripted other player answers from `window.__dakarOnline`:
//   1. the list from « Toutes les apps » (the unread badge on the tile), a conversation, a text sent (sending → sent), a reply, the unread badge back;
//   2. « + » › Envoyer de l'argent: the quote (Teranga Money first, the wallet for the rest), today's limits, a real DOUBLE tap on the confirmation sends
//      once, the outcome said, the card in the conversation; a request from the other paid from its card; a request of the player's own, paid by the other;
//   3. « + » › Inviter chez moi (the guest's perms), accepted by the other; their invitation accepted here, then « Y aller »;
//   4. « + » › Proposer un rendez-vous at a city time (sent as ms), countered by the other, countered back, accepted, met;
//   5. « + » › Partager ma position; theirs, « Y aller »;
//   6. offline (the state said, the « + » actions closed with a sentence, a text waiting then sent), a failed text and « Réessayer »;
//   7. Signaler, Bloquer / Débloquer, Supprimer la conversation; « Nouveau message » › Ajouter par code;
//   8. Argent › Teranga Money: the balance and when it was known, Recharger (double tap: once), Retirer, the history, the limits, offline;
//   9. landscape (844 × 390): the conversation, its field and a sheet fit, nothing sideways; the chat panel's « Messages privés » hands over; the field
//      above a (simulated) keyboard; a long conversation scrolled up by a finger, its older page loaded without moving the view;
//  10. without the account: a solo build's Messages says so and Argent has no Teranga Money; an online build without its server says it reconnects.
// Usage: node scripts/check-messages.mjs [baseUrl] [outDir] [proofDir]   (a `vite build --mode online` served statically)
import { chromium } from 'playwright';
import fs from 'node:fs';
import { realTouch } from './lib/realTouch.mjs';

const [base = 'http://127.0.0.1:4630/', out = '/tmp/claude-0/ld2b-messages/check', proof = ''] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true }); if (proof) fs.mkdirSync(proof, { recursive: true });
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok: !!ok, extra: String(extra).slice(0, 400) }); console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`, ok || !extra ? '' : String(extra).slice(0, 400)); };
const NB = s => String(s ?? '').replace(/[\u202f\u00a0]/g, ' ').replace(/\s+/g, ' ').trim();
const AWA = 'a11ce0000000a001';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'low'); } catch { /* */ } });
  const page = await ctx.newPage(); page.setDefaultTimeout(120000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const d = (fn, a) => page.evaluate(fn, a);
  const t = await realTouch(page), cdp = await page.context().newCDPSession(page);
  const wait = ms => page.waitForTimeout(ms);
  let shots = 0;
  /** A screenshot in the run's folder; the proof folder keeps a handful (`keep`). */
  const shot = async (name, keep = true) => { await wait(250); await page.screenshot({ path: `${out}/${name}.png` }); if (proof && keep) { await page.screenshot({ path: `${proof}/${name}.jpg`, type: 'jpeg', quality: 72 }); shots++; } };
  const settled = () => page.waitForFunction(() => !document.querySelector('#phone.on')?.getAnimations({ subtree: true }).some(a => a.playState === 'running' && a.effect?.getComputedTiming?.().iterations !== Infinity), null, { timeout: 30000 }).catch(() => {});
  /** A real tap on the element a function finds (brought into view first, as a thumb scrolls), after the phone's settle and any slide-in. */
  const tapWhere = async (find, arg, { settle = 450, twice = false } = {}) => {
    await wait(settle); await settled();
    const at = () => d(([src, a]) => { const el = (0, eval)(src)(a); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, out: r.top < 0 || r.bottom > innerHeight, w: r.width, h: r.height }; }, [find.toString(), arg]);
    let c = await at();
    if (c?.out) { await d(([src, a]) => (0, eval)(src)(a).scrollIntoView({ block: 'center', behavior: 'instant' }), [find.toString(), arg]); await wait(300); c = await at(); }
    for (let k = 0; k < 20 && c; k++) { await wait(120); const c2 = await at(); if (c2 && Math.abs(c2.y - c.y) < 1 && Math.abs(c2.x - c.x) < 1) break; c = c2; }
    if (!c) throw new Error(`nothing to tap: ${arg}`);
    if (!twice) { await t.down(9, c.x, c.y); await wait(50); await t.up(9); return c; }
    const t0 = Date.now() / 1000, pt = [{ id: 7, x: c.x, y: c.y, radiusX: 8, radiusY: 8, force: 1 }];
    await Promise.all([['touchStart', 0], ['touchEnd', 0.05], ['touchStart', 0.13], ['touchEnd', 0.18]].map(([type, dt]) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pt, timestamp: t0 + dt })));
    return c;
  };
  const tap = (sel, o) => tapWhere(s => document.querySelector(s), sel, o);
  /** A button (or any element of `sel`) whose text contains `text`, the last one on the page (the newest card). */
  const tapText = (sel, text, o) => tapWhere(([s, x]) => [...document.querySelectorAll(s)].filter(e => e.textContent.replace(/[\u202f\u00a0]/g, ' ').includes(x)).pop(), [sel, text], o);
  const info = () => d(() => window.__dakarOnline.info());
  const phone = () => d(() => window.__dakar.phoneInfo());
  const screenText = () => d(() => document.querySelector('#phone .ph-screen')?.innerText ?? '').then(NB);
  const sheetText = () => d(() => document.querySelector('#phone .mg-sheet')?.innerText ?? '').then(NB);
  const until = (fn, arg, ms = 20000) => page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
  const last = (k) => d(([tag, kind]) => window.__dakarOnline.last(tag, kind), [AWA, k]);
  const cardOf = id => d(i => { const e = document.querySelector(`#phone .mg-log [data-key="${i}"]`); return e ? e.innerText.replace(/[\u202f\u00a0]/g, ' ').replace(/\s+/g, ' ').trim() : null; }, id);
  const type = async (sel, text) => { await tap(sel); await wait(150); await page.keyboard.insertText(text); };
  const wallet = () => d(() => window.__dakar.state.wallet);
  const atBottom = () => d(() => { const l = document.querySelector('#phone .mg-log'); return l ? l.scrollHeight - l.scrollTop - l.clientHeight < 4 : false; });
  const noSideways = () => d(() => {
    const W = innerWidth, bad = [...document.querySelectorAll('#phone *')].filter(e => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); if (!r.width || cs.visibility === 'hidden' || cs.display === 'none' || e.closest('[hidden]')) return false; return r.right > W + 1 || r.left < -1; });
    return { n: bad.length, doc: document.scrollingElement.scrollWidth <= W + 1, first: bad.slice(0, 3).map(e => `${e.className || e.tagName} ${Math.round(e.getBoundingClientRect().right)}`) };
  });

  // 0 — a life in Pikine, 60 000 F in the wallet; the account (the fake) answers once Messages opens
  await page.goto(`${base}?debug&touch&fakeonline&heure=11&argent=60000`, { timeout: 180000 });
  await page.waitForFunction(() => window.__dakar?.pos?.().hub && !document.getElementById('studio'), null, { timeout: 300000 });
  await wait(1500);
  await d(() => window.__dakar.phone('messages')); await until(() => !!window.__dakarOnline);
  await d(() => { window.__dakarOnline.stubWorld(); window.__dakar.phoneClose(); });
  const i0 = await info(), w0 = await wallet();
  check('0. the simulated account answers: Teranga Money 3 000 F, two conversations, one unread, a friend code', i0.balance.amount === 3000 && i0.convs.length === 2 && i0.unread === 1 && i0.me.code === 'F00D-FEED-CAFE-0001' && w0 === 60000, JSON.stringify({ bal: i0.balance, n: i0.convs.length, unread: i0.unread, w0 }));

  // 1 — home › « Toutes les apps » (badge) › Messages (badge) › the list › Awa
  await d(() => window.__dakar.phone('home')); await until(() => window.__dakar.phoneInfo().screen === 'home');
  await wait(1200);
  const homeBadge = await d(() => document.querySelector('#phone .hm-tile[data-go="apps"] .ph-badge')?.textContent ?? '');
  await tap('#phone .hm-tile[data-go="apps"]');
  await until(() => window.__dakar.phoneInfo().screen === 'apps'); await wait(600);
  const tileBadge = await d(() => document.querySelector('#phone .ph-app[data-app="messages"] .ph-badge')?.textContent ?? '');
  check('1a. the unread message shows on « Toutes les apps » and on the Messages tile', homeBadge === '1' && tileBadge === '1', JSON.stringify({ homeBadge, tileBadge }));
  await tap('#phone .ph-app[data-app="messages"]');
  await until(() => window.__dakar.phoneInfo().screen === 'messages');
  const list = await screenText();
  check('1b. the list: the state in words (simulated), « Nouveau message », Awa (unread 1, her last line, an hour), Moussa, the privacy line',
    /En ligne · simulé/.test(list) && /Nouveau message/.test(list) && /Awa \d\d:\d\d On se retrouve où tout à l’heure \? 1/.test(list) && /Moussa .* Jërëjëf/.test(list)
    && /gardées sur le serveur du jeu pour te suivre d’un appareil à l’autre\. Aucun message ne peut payer/.test(list) && /Bloquer un joueur le cache et refuse son argent et ses invitations/.test(list), list.slice(0, 400));
  await shot('1-list');
  await tap(`#phone .mg-conv[data-tag="${AWA}"]`);
  await until(t => window.__dakar.phoneInfo().arg === t, AWA); await wait(400);
  const conv = await screenText(), title = await d(() => document.querySelector('#phone .ph-head h2').textContent);
  check('1c. the conversation: « Awa », « en ligne », day separators, her bubbles left and mine right, read on screen',
    title === 'Awa' && /en ligne/.test(conv) && /Hier/.test(conv) && /Aujourd’hui/.test(conv) && (await info()).unread === 0
    && await d(() => { const them = document.querySelector('#phone .mg-b.them'), me = document.querySelector('#phone .mg-b.me'); return !!them && !!me && me.getBoundingClientRect().right > them.getBoundingClientRect().right + 40; }), conv.slice(0, 200));
  await type('#phone .mg-field', 'Devant la Corniche à 18 h ?');
  await tap('#phone .mg-send', { settle: 100 });
  const sending = await d(() => document.querySelector('#phone .mg-log > li:last-child')?.innerText ?? '');
  await until(() => [...document.querySelectorAll('#phone .mg-b.me')].pop()?.innerText.includes('envoyé'));
  const sent = await last('text');
  check('1d. a text: shown at once (« envoi… »), then sent; the field empties; the view stays at the bottom',
    /envoi…/.test(NB(sending)) && sent?.text === 'Devant la Corniche à 18 h ?' && !sent.status && (await d(() => document.querySelector('#phone .mg-field').value)) === '' && await atBottom(), NB(sending));
  await d(t => window.__dakarOnline.as(t).say('Oui ! Je ramène le ballon ⚽'), AWA);
  await until(() => document.querySelector('#phone .mg-log')?.innerText.includes('Je ramène le ballon'));
  check('1e. the reply arrives in place, at the bottom, and is read while the conversation shows', (await info()).unread === 0 && await atBottom());
  await tap('#phone [data-nav="back"]');
  await until(() => !window.__dakar.phoneInfo().arg && window.__dakar.phoneInfo().screen === 'messages');
  await d(t => window.__dakarOnline.as(t).say('Tu es où ?'), AWA);
  await until(() => document.querySelector('#phone .mg-conv .mg-unread')?.textContent === '1');
  check('1f. back on the list, a new line from Awa: her row moves up with its unread badge and preview', NB(await d(() => document.querySelector('#phone .mg-conv').innerText)).includes('Tu es où ? 1'));
  await tap(`#phone .mg-conv[data-tag="${AWA}"]`);
  await until(t => window.__dakar.phoneInfo().arg === t, AWA);

  // 2 — money: send 5 000 F (a real double tap on the confirmation)
  await tap('#phone .mg-plus');
  await until(() => !document.querySelector('#phone .mg-plus-pop').hidden);
  const plus = await d(() => [...document.querySelectorAll('#phone .mg-plus-pop .mg-pi b')].map(b => b.textContent));
  check('2a. « + » offers exactly: Envoyer de l’argent · Demander de l’argent · Inviter chez moi · Proposer un rendez-vous · Partager ma position (nothing else)',
    JSON.stringify(plus) === JSON.stringify(['Envoyer de l’argent', 'Demander de l’argent', 'Inviter chez moi', 'Proposer un rendez-vous', 'Partager ma position']), JSON.stringify(plus));
  await shot('2-plus', false);
  await tap('#phone .mg-pi[data-do="pay"]');
  await until(() => !!document.querySelector('#phone .mg-sheet .mg-chip'));
  await tap('#phone .mg-chip[data-amt="5000"]');
  await tap('#phone .mg-next');
  await until(() => !!document.querySelector('#phone .mg-ok'));
  await d(() => { const m = document.querySelector('#phone .mg-sheet details'); if (m) m.open = true; });
  const quote = await sheetText(), opId = await d(() => document.querySelector('#phone .mg-ok').dataset.id);
  check('2b. the confirmation says how it is paid (3 000 F from Teranga Money, 2 000 F from the wallet), the balances after and today’s limits',
    /Envoyer 5 000 F à Awa \?/.test(quote) && /Depuis Teranga Money 3 000 F/.test(quote) && /Depuis ton portefeuille 2 000 F/.test(quote) && /Teranga Money après 0 F/.test(quote) && /Portefeuille après 58 000 F/.test(quote)
    && /Envoyé aujourd’hui : 0 F sur 500 000 F/.test(quote) && /^fake-/.test(opId), quote);
  await shot('3-money-confirm');
  const opsBefore = (await info()).ops;
  await tap('#phone .mg-ok', { twice: true });
  await until(() => /envoyés à Awa/.test(document.querySelector('#phone .mg-sheet')?.innerText.replace(/[\u202f\u00a0]/g, ' ') ?? ''));
  await wait(800);
  const i2 = await info(), payCalls = i2.calls.filter(c => c.kind === 'pay');
  const outcome = await sheetText();
  check('2c. a real double tap on « Envoyer 5 000 F » sends it once: one request with the confirmation’s id, one operation, the wallet debited 2 000 F once',
    payCalls.length === 1 && payCalls[0].id === opId && i2.ops === opsBefore + 1 && (await wallet()) === 58000 && i2.balance.amount === 0 && i2.today.sent === 5000, JSON.stringify({ payCalls, ops: i2.ops, wallet: await wallet(), bal: i2.balance.amount }));
  check('2d. the outcome is said in words, with the balances after', /5 000 F envoyés à Awa/.test(outcome) && /Teranga Money : 0 F · portefeuille 58 000 F/.test(outcome), outcome);
  await shot('4-money-sent', false);
  await tapText('#phone .mg-sheet .pk-btn', 'OK');
  await until(() => !document.querySelector('#phone .mg-sheet-wrap'));
  const payCard = await cardOf(opId);
  check('2e. the conversation shows the money card « 5 000 F envoyés »', /TERANGA MONEY|Teranga Money/i.test(payCard ?? '') && /5 000 F envoyés/.test(payCard ?? ''), payCard);
  // a request from Awa, paid from its card
  const askRef = await d(t => window.__dakarOnline.as(t).ask(2000, 'Pour le ndogou'), AWA);
  await until(r => !!document.querySelector(`#phone [data-key="${r}"] [data-do="pay"]`), askRef);
  const askCard = await cardOf(askRef);
  check('2f. Awa’s request shows as a card with « Payer » / « Refuser »', /Awa te demande 2 000 F/.test(askCard) && /« Pour le ndogou »/.test(askCard) && /Payer/.test(askCard) && /Refuser/.test(askCard), askCard);
  await tap(`#phone [data-key="${askRef}"] [data-do="pay"]`);
  await until(() => !!document.querySelector('#phone .mg-sheet .mg-ok'));
  const reqConf = await sheetText();
  await tap('#phone .mg-ok');
  await until(() => /envoyés à Awa/.test(document.querySelector('#phone .mg-sheet')?.innerText.replace(/[\u202f\u00a0]/g, ' ') ?? ''));
  await tapText('#phone .mg-sheet .pk-btn', 'OK');
  await until(r => /Payée ✓/.test(document.querySelector(`#phone [data-key="${r}"]`)?.innerText ?? ''), askRef);
  const askAfter = await last('ask');
  check('2g. paying it goes through the same sheet (straight to its confirmation, the amount fixed) and the card says « Payée ✓ »',
    /Payer la demande/.test(reqConf) && /Envoyer 2 000 F à Awa \?/.test(reqConf) && askAfter.state === 'paid' && (await wallet()) === 56000, JSON.stringify({ reqConf: reqConf.slice(0, 120), state: askAfter.state }));
  // the player's own request
  await tap('#phone .mg-plus'); await tap('#phone .mg-pi[data-do="ask"]');
  await until(() => !!document.querySelector('#phone .mg-sheet .mg-chip'));
  await tap('#phone .mg-chip[data-amt="10000"]');
  await type('#phone .mg-sheet [data-f="note"]', 'Pour le taxi');
  await tap('#phone .mg-next');
  await until(() => !!document.querySelector('#phone .mg-ok'));
  await tap('#phone .mg-ok');
  await until(() => /Demande de 10 000 F envoyée à Awa/.test(document.querySelector('#phone .mg-sheet')?.innerText.replace(/[\u202f\u00a0]/g, ' ') ?? ''));
  await tapText('#phone .mg-sheet .pk-btn', 'OK');
  const mine = await last('ask');
  await until(r => !!document.querySelector(`#phone [data-key="${r}"] [data-do="cancel"]`), mine.id);
  const mineCard = await cardOf(mine.id);
  await d(([t, r]) => window.__dakarOnline.as(t).payAsk(r), [AWA, mine.id]);
  await until(r => /Payée ✓/.test(document.querySelector(`#phone [data-key="${r}"]`)?.innerText ?? ''), mine.id);
  check('2h. the player’s request: « Tu demandes 10 000 F » with « Annuler » while open, then « Payée ✓ » and Teranga Money +10 000 F when Awa pays',
    /Tu demandes 10 000 F/.test(mineCard) && /En attente/.test(mineCard) && /« Pour le taxi »/.test(mineCard) && (await info()).balance.amount === 10000, mineCard);

  // 3 — invitations
  await tap('#phone .mg-plus'); await tap('#phone .mg-pi[data-do="invite"]');
  await until(() => !!document.querySelector('#phone .mg-sheet [data-act="use"]'));
  const invSheet = await sheetText();
  await tap('#phone .mg-sheet [data-act="use"]');
  const useOff = await d(() => document.querySelector('#phone .mg-sheet [data-act="use"]').getAttribute('aria-checked'));
  await tap('#phone .mg-ok');
  await until(() => !document.querySelector('#phone .mg-sheet-wrap'));
  const inv = await last('invite');
  await until(r => !!document.querySelector(`#phone [data-key="${r}"]`), inv.id);
  const invCard = await cardOf(inv.id);
  check('3a. « Inviter chez moi »: the home, « Peut s’asseoir et utiliser la télé » (turned off here), sent; the card says it waits, with « Retirer l’invitation »',
    /Ta chambre chez la famille|Chambre familiale/.test(invSheet) && /Peut s’asseoir et utiliser la télé/.test(invSheet) && useOff === 'false' && inv.perms.use === false && /Invitation pour Awa/.test(invCard) && /Visite seulement/.test(invCard) && /En attente de réponse/.test(invCard) && /Retirer l’invitation/.test(invCard), invCard);
  await d(([t, r]) => window.__dakarOnline.as(t).accept(r), [AWA, inv.id]);
  await until(r => /Acceptée ✓/.test(document.querySelector(`#phone [data-key="${r}"]`)?.innerText ?? ''), inv.id);
  check('3b. Awa accepts it: the same card updates in place to « Acceptée ✓ »', /Acceptée ✓/.test(await cardOf(inv.id)));
  const theirInv = await d(t => window.__dakarOnline.as(t).invite({ use: true }), AWA);
  await until(r => !!document.querySelector(`#phone [data-key="${r}"] [data-do="accept"]`), theirInv);
  await tap(`#phone [data-key="${theirInv}"] [data-do="accept"]`);
  await until(r => !!document.querySelector(`#phone [data-key="${r}"] [data-do="go"]`), theirInv);
  const theirCard = await cardOf(theirInv);
  await shot('5-cards');
  await tap(`#phone [data-key="${theirInv}"] [data-do="go"]`);
  await until(() => !window.__dakar.phoneInfo().open);
  const goes = await d(() => window.__dakarOnline.goes.slice());
  check('3c. Awa’s invitation: « Accepter » → « Acceptée ✓ » and « Y aller », which closes the phone and guides to her door (onlineHooks.goToInvite)',
    /Invitation de Awa/.test(theirCard) && /Acceptée ✓/.test(theirCard) && (goes.some(g => g.to === 'invite' && g.id === theirInv && g.host === AWA) || !!(await d(() => window.__dakar.destination()))), JSON.stringify({ theirCard, goes, dest: await d(() => window.__dakar.destination()) }));
  await d(t => window.__dakar.phone(`messages:${t}`), AWA); await until(t => window.__dakar.phoneInfo().arg === t, AWA);
  check('3d. the phone opened on a conversation keeps the list under it (« ‹ Messages »)', (await d(() => document.querySelector('#phone .ph-back').textContent)) === 'Messages');

  // 4 — a meeting at a city time, countered both ways, accepted, met
  await tap('#phone .mg-plus'); await tap('#phone .mg-pi[data-do="meet"]');
  await until(() => !!document.querySelector('#phone .mg-sheet [data-when="h1"]'));
  await tap('#phone .mg-sheet [data-place^="pikine:arena"]');   // the stub's id, or the real world's (pikine:arena:guichet)
  await tap('#phone .mg-sheet [data-when="h1"]');
  const h1 = await d(() => { const b = document.querySelector('#phone .mg-sheet [data-when="h1"]'); return { label: b.querySelector('b').textContent, clock: b.querySelector('span').textContent, sub: b.querySelector('small').textContent }; });
  const meetSum = await d(() => document.querySelector('#phone .mg-sum').textContent);
  await shot('6-meet-sheet');
  await tap('#phone .mg-ok');
  await until(() => !document.querySelector('#phone .mg-sheet-wrap'));
  const m1 = await last('meet');
  const cityOf = ms => d(x => { const e = Date.UTC(2026, 9, 6), el = Math.max(0, x - e), h = ((el % 1440000) / 1440000) * 24; return `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`; }, ms);
  const m1clock = await cityOf(m1.when);
  await until(r => !!document.querySelector(`#phone [data-key="${r}"]`), m1.id);
  const m1card = await cardOf(m1.id);
  check('4a. « Proposer un rendez-vous »: a place and « À NN h » (city time, its real delay said), sent as server ms; the card says the place, the city time and that it waits',
    /^À \d+ h$/.test(h1.label) && /^\d\d:00$/.test(h1.clock) && /^dans \d+ min$/.test(h1.sub) && m1.place.id.startsWith('pikine:arena') && m1.when > Date.now() && m1clock === h1.clock
    && meetSum.includes(`à ${h1.clock}`) && m1card.includes('Arène de Pikine · ') && m1card.includes(`à ${h1.clock}`) && /En attente de Awa/.test(m1card), JSON.stringify({ h1, m1clock, meetSum, m1card }));
  const c1 = await d(([t, r, w]) => window.__dakarOnline.as(t).counter(r, w), [AWA, m1.id, m1.when + 120000]);
  await until(r => !!document.querySelector(`#phone [data-key="${r}"] [data-do="counter"]`), c1);
  const countered1 = await cardOf(m1.id);
  await tap(`#phone [data-key="${c1}"] [data-do="counter"]`);
  await until(() => /Proposer une autre heure/.test(document.querySelector('#phone .mg-sheet h3')?.textContent ?? ''));
  await tap('#phone .mg-sheet [data-when="soon"]');
  await tap('#phone .mg-ok');
  await until(() => !document.querySelector('#phone .mg-sheet-wrap'));
  const m2 = await last('meet');
  await until(r => /Autre heure proposée/.test(document.querySelector(`#phone [data-key="${r}"]`)?.innerText ?? ''), c1);
  check('4b. Awa proposes another time: the first card says « Autre heure proposée »; « Proposer une autre heure » answers hers (counter) and hers is countered in turn',
    /Autre heure proposée/.test(countered1) && m2.counter === c1 && m2.from !== AWA && m2.state === 'open' && /Autre heure proposée/.test(await cardOf(c1)), JSON.stringify({ countered1, m2 }));
  await d(([t, r]) => window.__dakarOnline.as(t).accept(r), [AWA, m2.id]);
  await until(r => !!document.querySelector(`#phone [data-key="${r}"] [data-do="go"]`), m2.id);
  await d(([t, r]) => { window.__dakarOnline.api.here(r); window.__dakarOnline.as(t).here(r); }, [AWA, m2.id]);
  await until(r => /Vous y êtes tous les deux ✓/.test(document.querySelector(`#phone [data-key="${r}"]`)?.innerText ?? ''), m2.id);
  check('4c. accepted (« Y aller » offered), then both there: « Vous y êtes tous les deux ✓ »', true);

  // 5 — positions
  await tap('#phone .mg-plus'); await tap('#phone .mg-pi[data-do="loc"]');
  await until(() => /Partager ta position avec Awa/.test(document.querySelector('#phone .mg-sheet')?.innerText ?? ''));
  const locSheet = await sheetText();
  await tap('#phone .mg-ok');
  await until(() => !document.querySelector('#phone .mg-sheet-wrap'));
  const myLoc = await last('loc');
  await until(r => /Ta position partagée/.test(document.querySelector(`#phone [data-key="${r}"]`)?.innerText ?? ''), myLoc.id);
  const theirLoc = await d(t => window.__dakarOnline.as(t).share({ hub: 'corniche', x: 4, z: 9, name: 'Terrain de la Corniche' }), AWA);
  await until(r => !!document.querySelector(`#phone [data-key="${r}"] [data-do="go"]`), theirLoc);
  await tap(`#phone [data-key="${theirLoc}"] [data-do="go"]`);
  await until(() => !window.__dakar.phoneInfo().open);
  // the nearest place is the world's: « Marché de Pikine » in the stub world, the real one in the game
  const locGo = await d(() => ({ goes: window.__dakarOnline.goes.slice(), dest: window.__dakar.destination?.() ?? null }));
  check('5. « Partager ma position » (one confirmation: the nearest place) sends it; Awa’s position has « Y aller »', !!myLoc.name && locSheet.includes(myLoc.name)
    && (locGo.goes.some(g => g.to === 'loc' && g.name === 'Terrain de la Corniche') || !!locGo.dest), JSON.stringify({ locSheet, name: myLoc.name, ...locGo }));
  await d(t => window.__dakar.phone(`messages:${t}`), AWA); await until(t => window.__dakar.phoneInfo().arg === t, AWA);

  // 6 — offline, failed, « Réessayer »
  await d(() => window.__dakarOnline.status('offline'));
  await until(() => !document.querySelector('#phone .mg-banner').hidden);
  const banner = NB(await d(() => document.querySelector('#phone .mg-banner').textContent));
  await tap('#phone .mg-plus');
  await until(() => !document.querySelector('#phone .mg-plus-pop').hidden);
  const closed = await d(() => [...document.querySelectorAll('#phone .mg-plus-pop .mg-pi')].map(b => ({ off: b.getAttribute('aria-disabled') === 'true', why: b.getAttribute('title') ?? '' })));
  const closedWhy = NB(await d(() => document.querySelector('#phone .mg-plus-pop .mg-pop-why')?.textContent ?? ''));
  await shot('7-offline');
  await tap('#phone .mg-plus');
  await type('#phone .mg-field', 'Je suis dans le car rapide');
  await tap('#phone .mg-send', { settle: 100 });
  const waiting = await last('text');
  await wait(1200);
  const still = (await d(([t, id]) => window.__dakarOnline.items(t).find(i => i.id === id), [AWA, waiting.id])).status;
  await d(() => window.__dakarOnline.status('online'));
  await until(([t, id]) => !window.__dakarOnline.items(t).find(i => i.id === id).status, [AWA, waiting.id]);
  check('6a. offline: said in words, every « + » action closed (its sentence said once above them), a text waits (« envoi… ») and goes with the same id once back online',
    /Hors ligne/.test(banner) && closed.length === 5 && closed.every(c => c.off && /Hors ligne/.test(c.why)) && /^Hors ligne : possible dès que tu es reconnecté\.$/.test(closedWhy) && still === 'sending', JSON.stringify({ banner, closedWhy, closed: closed.slice(0, 2), still }));
  await d(() => window.__dakarOnline.failNext('rate-limited'));
  await type('#phone .mg-field', 'Allô ?');
  await tap('#phone .mg-send', { settle: 100 });
  await until(() => !!document.querySelector('#phone .mg-retry'));
  const failedTx = NB(await d(() => document.querySelector('#phone .mg-b.failed').innerText));
  const failedId = (await last('text')).id;
  await tap('#phone .mg-retry');
  await until(id => !document.querySelector(`#phone [data-key="${id}"]`) && [...document.querySelectorAll('#phone .mg-b.me')].pop()?.innerText.includes('envoyé'), failedId);
  const resent = await last('text');
  check('6b. a refused text says why (« Pas envoyé · trop rapide ») with « Réessayer », which sends it again (the failed one gives way)',
    /Pas envoyé · trop rapide/.test(failedTx) && /Réessayer/.test(failedTx) && resent.text === 'Allô ?' && resent.id !== failedId && !resent.status, failedTx);

  // 7 — report, block, unblock, forget; « Nouveau message » › Ajouter par code
  await tap('#phone .mg-menu-btn');
  await until(() => !document.querySelector('#phone .mg-menu-pop').hidden);
  const menu = await d(() => [...document.querySelectorAll('#phone .mg-menu-pop .mg-pi b')].map(b => b.textContent));
  await tap('#phone [data-act="m-report"]');
  await until(() => !!document.querySelector('#phone .mg-sheet [data-reason="arnaque"]'));
  await tap('#phone .mg-sheet [data-reason="arnaque"]');
  await until(() => /Signalement envoyé/.test(document.querySelector('#phone .mg-sheet')?.innerText ?? ''));
  await tapText('#phone .mg-sheet .pk-btn', 'OK');
  check('7a. « ⋯ » offers Bloquer, Signaler, Supprimer la conversation; Signaler › Arnaque reaches the account', JSON.stringify(menu) === JSON.stringify(['Bloquer', 'Signaler', 'Supprimer la conversation'])
    && (await info()).reports.some(r => r.tag === AWA && r.reason === 'arnaque'), JSON.stringify(menu));
  await tap('#phone .mg-menu-btn'); await tap('#phone [data-act="m-block"]');
  await until(() => /Bloquer Awa \?/.test(document.querySelector('#phone .mg-sheet')?.innerText ?? ''));
  await tap('#phone .mg-ok');
  await until(() => document.querySelector('#phone .mg-seen')?.textContent === 'bloqué');
  const blockedUi = await d(() => ({ field: document.querySelector('#phone .mg-field').disabled, ph: document.querySelector('#phone .mg-field').placeholder }));
  check('7b. Bloquer (confirmed): the account blocks her, the header says « bloqué », the field is closed', (await d(t => window.__dakarOnline.api.isBlocked(t), AWA)) && blockedUi.field && /bloqué/.test(blockedUi.ph), JSON.stringify(blockedUi));
  await tap('#phone .mg-menu-btn'); await tap('#phone [data-act="m-block"]');
  await until(() => document.querySelector('#phone .mg-seen')?.textContent !== 'bloqué');
  check('7c. Débloquer from the same menu', !(await d(t => window.__dakarOnline.api.isBlocked(t), AWA)));
  await tap('#phone .mg-menu-btn'); await tap('#phone [data-act="m-forget"]');
  await until(() => /Supprimer ta conversation avec Awa/.test(document.querySelector('#phone .mg-sheet')?.innerText ?? ''));
  await tap('#phone .mg-ok');
  await until(() => !window.__dakar.phoneInfo().arg && window.__dakar.phoneInfo().screen === 'messages');
  const after = await screenText();
  check('7d. Supprimer la conversation: back to the list, Awa’s conversation gone, Moussa’s kept', !/Awa/.test(after) && /Moussa/.test(after), after.slice(0, 200));
  await tap('#phone [data-act="new"]');
  await until(() => window.__dakar.phoneInfo().arg === 'new');
  await type('#phone .mg-code input', 'd00d00000000 0d04');
  const typedCode = await d(() => document.querySelector('#phone .mg-code input').value);
  const newText = await screenText();
  await tap('#phone .mg-code button[type="submit"]');
  await until(() => !!document.querySelector('#phone .mg-found .mg-person'));
  await shot('8-new-message');
  await tap('#phone .mg-found .mg-person');
  await until(() => window.__dakar.phoneInfo().arg === 'd00d000000000d04');
  const ibou = await screenText();
  await type('#phone .mg-field', 'Salut Ibou, c’est moi !');
  await tap('#phone .mg-send', { settle: 100 });
  await until(() => [...document.querySelectorAll('#phone .mg-b.me')].pop()?.innerText.includes('envoyé'));
  check('7e. Nouveau message › Ajouter par code (typed loosely, shown D00D-0000-0000-0D04) finds Ibou; his empty conversation invites to write; the first text goes',
    typedCode === 'D00D-0000-0000-0D04' && /F00D-FEED-CAFE-0001/.test(newText) && /Copier/.test(newText) && (await d(() => document.querySelector('#phone .ph-head h2').textContent)) === 'Ibou' && /en ligne/.test(ibou) && /touche « \+ »/.test(ibou)
    && (await info()).convs.some(c => c.name === 'Ibou'), JSON.stringify({ typedCode, ibou: ibou.slice(0, 160) }));
  await d(() => window.__dakar.phone('messages:c0ffee000000c003'));
  await until(() => window.__dakar.phoneInfo().arg === 'c0ffee000000c003'); await wait(400);
  const fatou = await screenText();
  check('7f. a player who never opened Messages: « pas encore sur Messages », the field closed with the reason', /pas encore sur Messages/.test(fatou) && /n’a pas encore ouvert Messages/.test(fatou) && await d(() => document.querySelector('#phone .mg-field').disabled), fatou.slice(0, 200));

  // 8 — Argent › Teranga Money
  await d(() => window.__dakar.phone('portefeuille')); await until(() => window.__dakar.phoneInfo().screen === 'portefeuille');
  await until(() => /Recharge depuis le portefeuille/.test(document.querySelector('#phone .tm-hist')?.innerText ?? ''));
  const arg0 = await screenText(), w8 = await wallet(), b8 = (await info()).balance.amount;
  check('8a. Argent shows Teranga Money beside the wallet: its balance « à l’instant », Recharger / Retirer, its history (the send to Awa, the payments), the limits',
    /TERANGA MONEY|Teranga Money/.test(arg0) && arg0.includes('10 000 F') && /à l’instant/.test(arg0) && /Recharger/.test(arg0) && /Retirer/.test(arg0) && /Envoyé à Awa/.test(arg0) && /Reçu de Awa/.test(arg0) && /Limites du jour/.test(arg0), arg0.slice(0, 500));
  await tap('#phone [data-act="tm-fund"]');
  await until(() => !!document.querySelector('#phone .mg-sheet .mg-chip'));
  await tap('#phone .mg-chip[data-amt="5000"]'); await tap('#phone .mg-next');
  await until(() => !!document.querySelector('#phone .mg-ok'));
  const fundConf = await sheetText(), fundId = await d(() => document.querySelector('#phone .mg-ok').dataset.id);
  await tap('#phone .mg-ok', { twice: true });
  await until(() => /rechargés sur Teranga Money/.test(document.querySelector('#phone .mg-sheet')?.innerText ?? ''));
  await wait(700);
  const fundCalls = (await info()).calls.filter(c => c.kind === 'fund');
  check('8b. Recharger 5 000 F (a double tap): the confirmation says the balances after; the wallet −5 000 F once, Teranga Money +5 000 F',
    /Recharger 5 000 F sur Teranga Money \?/.test(fundConf) && /Teranga Money après 15 000 F/.test(fundConf) && fundCalls.length === 1 && fundCalls[0].id === fundId && (await wallet()) === w8 - 5000 && (await info()).balance.amount === b8 + 5000,
    JSON.stringify({ fundConf: fundConf.slice(0, 160), fundCalls, w: await wallet(), w8 }));
  await tapText('#phone .mg-sheet .pk-btn', 'OK');
  await tap('#phone [data-act="tm-cashout"]');
  await until(() => !!document.querySelector('#phone .mg-sheet [data-f="amount"]'));
  await type('#phone .mg-sheet [data-f="amount"]', '1500');
  await tap('#phone .mg-next');
  await until(() => !!document.querySelector('#phone .mg-ok'));
  await tap('#phone .mg-ok');
  await until(() => /retirés dans ton portefeuille/.test(document.querySelector('#phone .mg-sheet')?.innerText ?? ''));
  await tapText('#phone .mg-sheet .pk-btn', 'OK');
  await until(() => /Retrait vers le portefeuille/.test(document.querySelector('#phone .tm-hist')?.innerText ?? ''));
  await d(() => { const m = document.querySelector('#phone .tm-limits'); if (m) m.open = true; });
  check('8c. Retirer 1 500 F (typed): the wallet +1 500 F, the history shows the top-up and the withdrawal', (await wallet()) === w8 - 5000 + 1500 && /Recharge depuis le portefeuille/.test(await screenText()));
  await shot('9-argent');
  await d(() => window.__dakarOnline.status('offline')); await wait(1300);
  const argOff = await screenText();
  check('8d. offline: the balance says when it was known (« · hors ligne »), Recharger and Retirer are closed with the reason',
    /hors ligne/.test(argOff) && /Recharger et Retirer reviennent avec la connexion/.test(argOff) && await d(() => [...document.querySelectorAll('#phone .tm-go')].every(b => b.disabled)), argOff.slice(0, 300));
  await d(() => window.__dakarOnline.status('online'));
  const side = await noSideways();
  check('8e. portrait: nothing sticks out sideways (Argent)', side.n === 0 && side.doc, JSON.stringify(side));

  // 9 — landscape, and the chat panel's hand-over
  await d(t => window.__dakar.phone(`messages:${t}`), 'b0b0000000000b02'); await until(() => window.__dakar.phoneInfo().arg === 'b0b0000000000b02');
  await page.setViewportSize({ width: 844, height: 390 }); await wait(1500);
  const land = await d(() => {
    const q = s => document.querySelector(s)?.getBoundingClientRect();
    const f = q('#phone .mg-field'), send = q('#phone .mg-send'), log = q('#phone .mg-log'), plus = q('#phone .mg-plus');
    return { field: f && f.bottom <= innerHeight && f.top > 0 && f.height >= 44, send: send && send.right <= innerWidth && send.height >= 44, plus: plus && plus.height >= 44, log: log && log.height > 120, h: innerHeight };
  });
  const sideL = await noSideways();
  await shot('10-landscape');
  check('9a. landscape (844 × 390): the conversation fits, its field, « + » and « Envoyer » in view and ≥ 44 px, the log has room, nothing sideways', land.field && land.send && land.plus && land.log && sideL.n === 0, JSON.stringify({ land, sideL }));
  await tap('#phone .mg-plus'); await tap('#phone .mg-pi[data-do="pay"]');
  await until(() => !!document.querySelector('#phone .mg-sheet .mg-next')); await settled();
  const sheetL = await d(() => { const s = document.querySelector('#phone .mg-sheet').getBoundingClientRect(), b = document.querySelector('#phone .mg-sh-body'); return { top: s.top >= 0, bottom: s.bottom <= innerHeight + 1, scrolls: b.scrollHeight > b.clientHeight, x: !!document.querySelector('#phone .mg-sh-x') }; });
  await tap('#phone .mg-next', {});                                          // brought into view inside the sheet's own scroll (disabled: nothing happens)
  check('9b. landscape: the money sheet fits the screen (its own scroll), « Fermer » in reach', sheetL.top && sheetL.bottom && sheetL.x, JSON.stringify(sheetL));
  await shot('11-landscape-sheet', false);
  await tap('#phone .mg-sh-x');
  await page.setViewportSize({ width: 390, height: 844 }); await wait(1200);
  await d(() => window.__dakar.phoneClose()); await wait(800);
  await d(t => window.__dakarOnline.as(t).say('Bien reçu 👍'), 'b0b0000000000b02');
  const chatBtn = await d(() => !!document.getElementById('chatBtn') && getComputedStyle(document.getElementById('chatBtn')).display !== 'none');
  if (chatBtn) {
    await until(() => document.querySelector('#chatBtn .chat-badge')?.textContent === '1');   // drawn by the chat's frame update
    const badge = await d(() => document.querySelector('#chatBtn .chat-badge')?.textContent ?? '');
    await tap('#chatBtn');
    await until(() => document.getElementById('chatPanel')?.classList.contains('on'));
    await tap('#chatPanel .chat-dm');
    await until(() => window.__dakar.phoneInfo().open && window.__dakar.phoneInfo().screen === 'messages');
    check('9c. the floating chat: its badge counts the unread message, « Messages privés ↗ » closes the panel and opens the phone’s Messages',
      badge === '1' && !(await d(() => document.getElementById('chatPanel').classList.contains('on'))), JSON.stringify({ badge }));
  } else check('9c. the floating chat exists in this build (vite build --mode online)', false, 'no #chatBtn');

  // the phone's keyboard (simulated: the visual viewport loses 336 px at the bottom, as Safari's): the field rides above it
  await d(() => window.__dakar.phone('messages:b0b0000000000b02')); await until(() => window.__dakar.phoneInfo().arg === 'b0b0000000000b02'); await wait(600);
  // (a loaded machine runs the phone's own animation late: the field is measured once it has stopped moving)
  const settle = sel => d(s => new Promise(done => { let last = NaN, same = 0, n = 0; const t = setInterval(() => { const b = document.querySelector(s)?.getBoundingClientRect().bottom; same = b === last ? same + 1 : 0; last = b; if (same >= 2 || ++n > 50) { clearInterval(t); done(); } }, 100); }), sel);
  await d(() => { const vv = window.visualViewport; Object.defineProperty(vv, 'height', { configurable: true, get: () => innerHeight - 336 }); vv.dispatchEvent(new Event('resize')); });
  await wait(400); await settle('#phone .mg-field');
  const kb = await d(() => { const f = document.querySelector('#phone .mg-field').getBoundingClientRect(), l = document.querySelector('#phone .mg-log').getBoundingClientRect(); return { field: f.bottom, log: l.height, limit: innerHeight - 336 }; });
  await d(() => { const vv = window.visualViewport; delete vv.height; vv.dispatchEvent(new Event('resize')); });
  await wait(300); await settle('#phone .mg-field');
  const kbOff = await d(() => document.querySelector('#phone .mg-field').getBoundingClientRect().bottom);
  // the same keyboard over a sheet: Argent › Recharger, the typed amount field in focus
  await d(() => window.__dakar.phone('portefeuille')); await until(() => window.__dakar.phoneInfo().screen === 'portefeuille');
  await tap('#phone [data-act="tm-fund"]');
  await until(() => !!document.querySelector('#phone .mg-sheet [data-f="amount"]'));
  await tap('#phone .mg-sheet [data-f="amount"]');
  await d(() => { const vv = window.visualViewport; Object.defineProperty(vv, 'height', { configurable: true, get: () => innerHeight - 336 }); vv.dispatchEvent(new Event('resize')); });
  await wait(500); await settle('#phone .mg-sheet [data-f="amount"]');
  const kbSheet = await d(() => { const f = document.querySelector('#phone .mg-sheet [data-f="amount"]').getBoundingClientRect(), sh = document.querySelector('#phone .mg-sheet').getBoundingClientRect(); return { field: f.bottom, fieldTop: f.top, sheet: sh.bottom, limit: innerHeight - 336, focused: document.activeElement?.dataset?.f ?? null }; });
  await d(() => { const vv = window.visualViewport; delete vv.height; vv.dispatchEvent(new Event('resize')); });
  await tap('#phone .mg-sh-x');
  check('9d. the phone’s keyboard never hides the field: with 336 px of keyboard the conversation’s field sits above it (the log shrinks) and comes back down after; a sheet’s amount field too',
    kb.field <= kb.limit && kb.log > 100 && kbOff > kb.limit + 200 && kbSheet.sheet <= kbSheet.limit + 1 && kbSheet.field <= kbSheet.limit && kbSheet.fieldTop >= 0, JSON.stringify({ kb, kbOff, kbSheet }));
  await d(() => window.__dakar.phoneClose());

  // 9e — a long conversation: a finger scrolls it up naturally; near the top the older page loads and the view stays where it was
  await d(() => window.__dakarOnline.as('Moussa').backlog(90));
  await d(() => window.__dakar.phone('messages:b0b0000000000b02')); await until(() => window.__dakar.phoneInfo().arg === 'b0b0000000000b02');
  const count = () => d(() => document.querySelectorAll('#phone .mg-log .mg-b, #phone .mg-log .mg-c').length);
  await until(() => document.querySelectorAll('#phone .mg-log .mg-b, #phone .mg-log .mg-c').length > 20);    // a first page too short to scroll asked for the next at once
  await wait(600);
  const n1 = await count(), top0 = await d(() => document.querySelector('#phone .mg-log').scrollTop), bottom0 = await atBottom();
  const lc = await t.centre('#phone .mg-log');
  for (let k = 0; k < 2; k++) { await t.down(5, lc.x, lc.y - 140); await t.move(5, lc.x, lc.y + 140, 10); await t.up(5); await wait(500); }
  const top1 = await d(() => document.querySelector('#phone .mg-log').scrollTop);
  await wait(1200);
  const before = await d(() => { const l = document.querySelector('#phone .mg-log'); l.scrollTop = 0; const a = l.querySelector('li[data-key]:not(.mg-day)'); return { key: a.dataset.key, top: a.getBoundingClientRect().top }; });
  await until(n => document.querySelectorAll('#phone .mg-log .mg-b, #phone .mg-log .mg-c').length > n, await count());
  await wait(300);
  const afterLoad = await d(k => { const a = document.querySelector(`#phone .mg-log [data-key="${k}"]`); return a ? a.getBoundingClientRect().top : null; }, before.key);
  const n2 = await count();
  check('9e. a long conversation opens at its newest items; a finger scrolls it up; at the top the older page loads and the item in view stays in place',
    bottom0 && top0 > 0 && top1 < top0 - 100 && n2 > n1 && afterLoad !== null && Math.abs(afterLoad - before.top) < 3, JSON.stringify({ n1, n2, top0, top1, before, afterLoad }));
  await d(() => window.__dakar.phoneClose());

  // 10 — a build without the account (no `fakeonline`): Messages says it plays solo, Argent shows no Teranga Money
  await page.goto(`${base}?debug&touch&heure=11&argent=60000`, { timeout: 180000 });
  await page.waitForFunction(() => window.__dakar?.pos?.().hub && !document.getElementById('studio'), null, { timeout: 300000 });
  await wait(1200);
  await d(() => window.__dakar.phone('apps')); await until(() => window.__dakar.phoneInfo().screen === 'apps'); await wait(500);
  await tap('#phone .ph-app[data-app="messages"]');
  await until(() => window.__dakar.phoneInfo().screen === 'messages');
  const solo = await screenText();
  await d(() => window.__dakar.phone('portefeuille')); await until(() => window.__dakar.phoneInfo().screen === 'portefeuille'); await wait(500);
  const soloArgent = await screenText();
  // a solo build has no account at all; an online build served without its server has the real one, never connected (it says it reconnects)
  const real = await d(() => { const a = window.__dakar.account?.(); return a ? { status: a.status, me: !!a.me } : null; });
  const tm = await d(() => !!document.querySelector('#phone [data-slot="tm"], #phone .tm-card'));
  check('10. without the account: Messages says it needs the online connection (the game goes on solo); Argent has no Teranga Money; no simulated account',
    (real ? /Reconnexion/.test(solo) && real.status !== 'online' : /Messages a besoin de la connexion en ligne/.test(solo) && !tm) && !(await d(() => !!window.__dakarOnline)),
    JSON.stringify({ real, tm, solo: solo.slice(0, 200), soloArgent: soloArgent.slice(0, 200), fake: await d(() => !!window.__dakarOnline) }));
  await shot('12-solo', false);

  check('no JavaScript errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  if (proof) console.log(`${shots} screenshots in ${proof}`);
} catch (e) {
  check(`the run finished (${e.message})`, false, e.stack);
} finally {
  await browser.close();
  fs.writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 2));
  const failed = results.filter(r => !r.ok).length;
  console.log(`${results.length - failed}/${results.length} passed`);
  process.exitCode = failed ? 1 : 0;
}
