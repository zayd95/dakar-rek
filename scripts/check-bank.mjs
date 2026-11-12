// Banque Teranga v1 on a phone page (390 × 844, real touches where a player taps; src/economy/bankModule.ts, src/ui/phone/apps/bank.ts, rules src/economy/bank.ts):
//   1. at the Pikine agency counter: « Ouvrir un compte » → the account opened;
//   2. a deposit of 25 000 F (quick amount): a real DOUBLE tap on the confirmation moves the money once, and replaying its ref is refused;
//      the account sheet shows the new balances at once (never stale); the savings' history says it;
//   3. the goal « Bana-bana » (its price read from the ventures' table);
//   4. the conseillère: her advice is the rules' own lines for this state (grounded: the real amounts), the old conversation's social effect once;
//   5. a withdrawal of a typed amount (5 000 F);
//   6. leave and come back: the same balances, history and goal, to the franc;
//   7. the phone: Argent's « Épargne » line, the Banque app shows the same numbers; a deposit from the phone (double tap again refused); no overflow;
//   8. a new player day: the interest paid once, capped;
//   9. the Plateau agency: the same account at its counter.
// Usage: node scripts/check-bank.mjs [baseUrl] [outDir] [proofDir]   (a localhost build: ?argent= is honoured there)
import { chromium } from 'playwright';
import fs from 'node:fs';
import { realTouch } from './lib/realTouch.mjs';

const [base = 'http://127.0.0.1:4621/', out = '/tmp/claude-0/ld2-bank/check', proof = ''] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true }); if (proof) fs.mkdirSync(proof, { recursive: true });
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok: !!ok, extra: String(extra).slice(0, 400) }); console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`, extra ? String(extra).slice(0, 300) : ''); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const NB = s => s.replace(/[  ]/g, ' ');
const F = n => `${Math.round(n).toLocaleString('fr-FR').replace(/[  \s]/g, ' ')} F`;
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => {
    try { localStorage.setItem('dakarrek.quality', 'low'); } catch { /* */ }
    window.__toastLog = []; const seen = () => { const t = document.getElementById('toast')?.textContent?.replace(/\s+/g, ' ').trim(); if (t && !window.__toastLog.includes(t)) window.__toastLog.push(t); };
    new MutationObserver(seen).observe(document, { childList: true, subtree: true, characterData: true });
  });
  const page = await ctx.newPage(); page.setDefaultTimeout(240000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const d = (fn, a) => page.evaluate(fn, a);
  const t = await realTouch(page), cdp = await page.context().newCDPSession(page);
  const wait = ms => page.waitForTimeout(ms);
  const shot = async name => { await page.screenshot({ path: `${out}/${name}.png` }); if (proof) await page.screenshot({ path: `${proof}/${name}.jpg`, type: 'jpeg', quality: 62 }); };
  const ready = () => page.waitForFunction(() => window.__dakar?.pos?.().hub && window.__dakar.bank && !document.getElementById('studio'), null, { timeout: 300000 });
  const bank = () => d(() => window.__dakar.bank.info());
  const sheet = () => d(() => { const m = document.querySelector('#modal.on'); return m ? { title: m.querySelector('h2')?.textContent ?? '', text: m.innerText.replace(/\s+/g, ' '), rows: [...m.querySelectorAll('.item:not(.close) .lb')].map(e => e.textContent) } : null; });
  /** A real tap on what the page shows: an element found by a function in the page, brought into view first (a thumb scrolls a long sheet), after the settle. */
  const tapWhere = async (find, arg, { settle = 450, twice = false } = {}) => {
    await wait(settle);
    // a sheet or a card opening plays a short slide-in: on a software renderer its frames come late, so a tap waits for it to end (as a thumb waits to see the row)
    await page.waitForFunction(() => !document.querySelector('#modal.on .sheet, #phone.on')?.getAnimations({ subtree: true }).some(a => a.playState === 'running' && !(a.effect?.getComputedTiming?.().iterations === Infinity)), null, { timeout: 30000 }).catch(() => {});
    const at = () => d(([src, a]) => { const el = (0, eval)(src)(a); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, out: r.top < 0 || r.bottom > innerHeight }; }, [find.toString(), arg]);
    let c = await at();
    if (c?.out) { await d(([src, a]) => (0, eval)(src)(a).scrollIntoView({ block: 'center', behavior: 'instant' }), [find.toString(), arg]); await wait(300); c = await at(); }
    // a sheet may still be settling into place (it rises once the HUD under it is hidden): tap where it stays
    for (let k = 0; k < 30 && c; k++) { await wait(250); const c2 = await at(); if (c2 && Math.abs(c2.y - c.y) < 1 && Math.abs(c2.x - c.x) < 1) break; c = c2; }
    if (!c) throw new Error(`nothing to tap: ${arg}`);
    if (process.env.BANK_DEBUG) console.log('tap', arg, JSON.stringify(c), await d(([x, y]) => { const e = document.elementFromPoint(x, y); return e ? (e.className || e.tagName) + ' ' + (e.textContent ?? '').slice(0, 40) : null; }, [c.x, c.y]));
    if (!twice) { await t.down(9, c.x, c.y); await wait(50); await t.up(9); return; }
    // a double tap at a thumb's pace: two taps 130 ms apart, each touch stamped with its own time and sent at once (on a software renderer, waiting for
    // each touch to be acknowledged would stretch the gap between the taps to seconds)
    const t0 = Date.now() / 1000, pt = [{ id: 7, x: c.x, y: c.y, radiusX: 8, radiusY: 8, force: 1 }];
    await Promise.all([['touchStart', 0], ['touchEnd', 0.05], ['touchStart', 0.13], ['touchEnd', 0.18]].map(([type, dt]) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pt, timestamp: t0 + dt })));
  };
  const row = (label, o) => tapWhere(l => [...document.querySelectorAll('#modal.on .item:not(.close)')].find(e => e.querySelector('.lb')?.textContent?.replace(/[  ]/g, ' ').includes(l)), label, o);
  const sel = (s, o) => tapWhere(x => document.querySelector(x), s, o);
  /** The sheet now showing has this title (or the check stops, saying what shows instead). */
  const titled = async title => {
    try { await page.waitForFunction(x => document.querySelector('#modal.on h2')?.textContent === x, title, { timeout: 30000 }); }
    catch { if (process.env.BANK_DEBUG) console.log(await d(() => window.__ev)); throw new Error(`expected the sheet « ${title} », got ${JSON.stringify(await sheet())} · mode ${await d(() => window.__dakar.pos().mode)}`); }
  };

  // 0 — a fresh life in Pikine, 60 000 F in the wallet
  await page.goto(`${base}?debug&touch&heure=11&argent=60000`, { timeout: 180000 });
  await ready();
  await d(() => { window.__dakar.teleport('pikine'); window.__dakar.setHour(11); });
  await page.waitForFunction(() => window.__dakar.pos().hub === 'pikine', null, { timeout: 120000 }); await wait(1500);
  await d(() => { const n = window.__dakar.state.data.needs; n.social = 50; n.moral = 50; n.energie = 90; });
  const w0 = await d(() => window.__dakar.state.wallet);
  if (process.env.BANK_DEBUG) await d(() => { window.__ev = []; const t0 = performance.now(); for (const k of ['touchstart', 'touchend', 'click']) document.addEventListener(k, e => window.__ev.push(`${Math.round(performance.now() - t0)} ${k}:${(e.target.className || e.target.id || e.target.tagName)}:${(e.target.textContent ?? '').slice(0, 24)} @${document.querySelector('#modal.on h2')?.textContent ?? '-'} sheet ${Math.round(document.querySelector('#modal .sheet')?.getBoundingClientRect().top ?? -1)} scroll ${document.querySelector('#modal .panel')?.scrollTop} doc ${document.scrollingElement.scrollTop} ${e.touches ? [...e.changedTouches].map(t => Math.round(t.clientY)).join(',') : e.clientY}`), true); });
  check('0. a fresh life in Pikine with 60 000 F and no account', w0 === 60000 && (await bank()).opened === -1, JSON.stringify({ w0 }));
  // the phone's Banque before any account: where to open one, and a marker to the agency
  await d(() => window.__dakar.phone('banque')); await page.waitForFunction(() => window.__dakar.phoneInfo().screen === 'banque', null, { timeout: 30000 }); await wait(600);
  const closed = NB(await d(() => document.querySelector('#phone .ph-screen').innerText));
  await shot('0-phone-no-account');
  await sel('#phone [data-act="agency"]');
  await page.waitForFunction(() => !window.__dakar.phoneInfo().open, null, { timeout: 30000 });
  const mark = await d(() => window.__dakar.phoneHooks.marked?.() ?? null);
  check('0b. without an account the Banque app says where to open one (Pikine or Plateau) and « Y aller » marks the Pikine agency', /Pas encore de compte/.test(closed) && /Pikine ou au Plateau/.test(closed) && mark?.id === 'pikine:city:bank', JSON.stringify({ closed: closed.slice(0, 160), mark }));

  // 1 — the agency counter: real taps on the action button and the sheet
  const desk = await d(() => window.__dakar.cityPlaces().find(p => p.id === 'pikine:city:bank'));
  await d(k => window.__dakar.place(k.x, k.z + 1.6, Math.PI), desk);
  await page.waitForFunction(() => window.__dakar.focus()?.id === 'pikine:city:bank', null, { timeout: 60000 });
  await wait(600); await sel('#act', { settle: 200 });
  await page.waitForFunction(() => document.querySelector('#modal.on .item'), null, { timeout: 60000 });
  const s1 = await sheet();
  check('1a. the counter of Banque Teranga · Pikine offers « Ouvrir un compte » and the conseillère; the generic conversation is gone',
    /Banque Teranga · Pikine/.test(s1.title) && s1.rows.includes('Ouvrir un compte') && s1.rows.includes('Demander conseil à la conseillère') && !s1.text.includes('Parler de son projet'), JSON.stringify(s1.rows));
  await row('Ouvrir un compte');
  await titled('Ouvrir un compte');
  await row('Ouvrir mon compte Épargne Teranga');
  await titled('Mon épargne');
  const b1 = await bank();
  check('1b. the account is opened, nothing moved', b1.opened >= 0 && b1.savings === 0 && b1.wallet === w0, JSON.stringify({ opened: b1.opened, savings: b1.savings, wallet: b1.wallet }));
  await shot('1-counter-account');

  // 2 — deposit 25 000 F: a quick amount, the confirmation double-tapped
  await row('Déposer');
  await titled('Déposer');
  await wait(500); await shot('2-counter-amounts');
  await tapWhere(a => [...document.querySelectorAll('#modal.on .bk-chip')].find(e => e.dataset.amt === a), '25000');
  await titled('Confirmer le dépôt');
  const ref = await d(() => document.querySelector('#modal.on .bk-after')?.dataset.ref ?? '');
  const conf = await sheet();
  await row('Déposer 25', { twice: true });
  await titled('Mon épargne'); await wait(600);
  const b2 = await bank(), dep = b2.tx.filter(x => x.kind === 'deposit');
  check('2a. a double tap on « Déposer 25 000 F » moves 25 000 F exactly once', b2.savings === 25000 && b2.wallet === w0 - 25000 && dep.length === 1 && dep[0].ref === ref && /Après : épargne 25 000 F · portefeuille 35 000 F/.test(NB(conf.text)),
    JSON.stringify({ savings: b2.savings, wallet: b2.wallet, deposits: dep.length, ref, ops: b2.log.ops }));
  const replay = await d(r => window.__dakar.bank.replay('deposit', 25000, r), ref), b2b = await bank();
  check('2b. the same confirmation replayed (its ref) is refused: nothing moves', !replay.ok && replay.why === 'duplicate' && b2b.savings === 25000 && b2b.wallet === w0 - 25000, JSON.stringify(replay));
  const s2 = await sheet();
  check('2c. the account sheet shows the balances after the operation (never stale)', NB(s2.text).includes(`Épargne ${F(25000)}`) && NB(s2.text).includes(`Portefeuille ${F(w0 - 25000)}`), NB(s2.text).slice(0, 160));
  const toasts2 = await d(() => window.__toastLog.join(' | '));
  check('2d. the level 25 000 F is reached and said', b2.milestones.includes(25000), NB(toasts2).slice(-200));
  await shot('2-after-deposit');
  await row('Historique');
  await titled('Historique');
  const h = await sheet();
  check('2e. the history: the deposit at the Pikine agency, +25 000 F, the balance after it', NB(h.text).includes('Épargne Teranga · dépôt (agence de Pikine)') && NB(h.text).includes(`+${F(25000)}`) && NB(h.text).includes(`solde ${F(25000)}`), NB(h.text).slice(0, 200));
  await row('Retour');
  await titled('Mon épargne');

  // 3 — the goal « Bana-bana »
  await row('Choisir un objectif');
  await titled('Mon objectif');
  const gs = await sheet();
  await row('Bana-bana');
  await titled('Mon épargne');
  const b3 = await bank(), s3 = await sheet();
  check('3. the goal « Bana-bana » at the price of a bana-bana table (50 000 F), its progress on the account', b3.goal?.label === 'Bana-bana' && b3.goal?.amount === 50000 && gs.rows.some(r => NB(r) === `Bana-bana · ${F(50000)}`) && gs.rows.some(r => NB(r).startsWith('Kiosque · ')) && NB(s3.text).includes(`Bana-bana · ${F(25000)} / ${F(50000)}`),
    JSON.stringify({ goal: b3.goal, rows: gs.rows }));

  // 4 — the conseillère
  const before4 = await d(() => ({ social: window.__dakar.state.data.needs.social, chats: window.__dakar.state.data.counters.chats ?? 0 }));
  await row('Demander conseil à la conseillère');
  await titled('La conseillère');
  const lines = await d(() => [...document.querySelectorAll('#modal.on .bk-advice li')].map(e => e.textContent)), rules = await d(() => window.__dakar.bank.advice());
  const after4 = await d(() => ({ social: window.__dakar.state.data.needs.social, chats: window.__dakar.state.data.counters.chats ?? 0 }));
  const joined = NB(lines.join(' | '));
  check('4a. her advice is the rules’ own lines for this state, 1 to 3', lines.length >= 1 && lines.length <= 3 && JSON.stringify(lines) === JSON.stringify(rules), joined);
  check('4b. grounded: the goal with the real amounts, the bana-bana within reach of the real cash (60 000 F), Pape Sarr not promised (a stranger to him)',
    joined.includes(`Objectif Bana-bana : ${F(25000)} sur ${F(50000)}, encore ${F(25000)}`) && joined.includes(`Avec ${F(w0)} entre portefeuille et épargne, une Table de bana-bana (${F(50000)}`) && !joined.includes('étudiera') && joined.includes('Pape Sarr veut d’abord mieux te connaître'), joined);
  check('4c. the old conversation’s social effect is kept (social +10, one chat)', Math.abs(after4.social - before4.social - 10) < 0.2 && after4.chats - before4.chats === 1, JSON.stringify({ before4, after4 }));
  await shot('3-advice');

  // 5 — withdraw a typed amount
  await row('Mon épargne');
  await titled('Mon épargne');
  await row('Retirer');
  await titled('Retirer');
  await sel('#modal.on .bk-free input');
  await page.keyboard.type('5 000');
  await sel('#modal.on .bk-free button', { settle: 150 });
  await titled('Confirmer le retrait');
  await row('Retirer 5');
  await titled('Mon épargne');
  const b5 = await bank();
  check('5. a withdrawal of a typed 5 000 F: savings 20 000 F, wallet back up by 5 000 F', b5.savings === 20000 && b5.wallet === w0 - 20000 && b5.tx.at(-1).amount === -5000, JSON.stringify({ savings: b5.savings, wallet: b5.wallet }));
  await d(() => document.querySelector('#modal.on .sh-x')?.click()); await wait(500);

  // 6 — leave and come back (no ?argent: the wallet is the save's own)
  await d(() => window.dispatchEvent(new Event('pagehide'))); await wait(300);
  const kept = await bank();
  await page.goto(`${base}?debug&touch&heure=11`, { timeout: 180000 }); await ready(); await wait(2500);
  const back = await bank(), pick = b => JSON.stringify({ savings: b.savings, wallet: b.wallet, tx: b.tx, goal: b.goal, opened: b.opened, milestones: b.milestones, interestDay: b.interestDay });
  check('6. after a reload: the same balances, history, goal and levels, to the franc', pick(back) === pick(kept) && back.savings === 20000, `${back.savings} / ${back.wallet} / ${back.tx.length} tx / ${JSON.stringify(back.goal)}`);

  // 7 — the phone: Argent → Épargne → Banque, the same numbers
  await sel('#menuBtn', { settle: 300 }); await page.waitForFunction(() => window.__dakar.phoneInfo().open, null, { timeout: 30000 });
  await sel('#phone .hm-dest [data-go="portefeuille"]');
  await page.waitForFunction(() => window.__dakar.phoneInfo().screen === 'portefeuille', null, { timeout: 30000 });
  const arg = NB(await d(() => document.querySelector('#phone [data-go="banque"]')?.innerText ?? ''));
  check('7a. Argent has one « Épargne » line with the savings', arg.includes('Épargne') && arg.includes(`${F(20000)} de côté`), arg);
  await sel('#phone [data-go="banque"]');
  await page.waitForFunction(() => window.__dakar.phoneInfo().screen === 'banque', null, { timeout: 30000 }); await wait(500);
  const ph = NB(await d(() => document.querySelector('#phone .ph-screen').innerText)), tips = await d(() => [...document.querySelectorAll('#phone .bk-tips li')].map(e => e.textContent)), rules7 = await d(() => window.__dakar.bank.advice());
  check('7b. the Banque app: the same savings and wallet, the goal and its progress, the same advice, the history', ph.includes(F(20000)) && ph.includes(`Portefeuille ${F(w0 - 20000)}`) && ph.includes('Bana-bana') && ph.includes(`${F(20000)} / ${F(50000)}`) && JSON.stringify(tips) === JSON.stringify(rules7) && ph.includes('Épargne Teranga · retrait (agence de Pikine)'),
    ph.slice(0, 300));
  const overflow = () => d(() => { const p = document.getElementById('phone'), w = innerWidth; return [...p.querySelectorAll('*')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > w + 1 || r.left < -1); }).length + (document.scrollingElement.scrollWidth > w + 1 ? 1 : 0); });
  const fold = await d(() => { const b = [...document.querySelectorAll('#phone .pk-btn')].find(e => /Déposer/.test(e.textContent)); return b ? b.getBoundingClientRect().bottom < innerHeight : false; });
  check('7c. no sideways overflow; « Déposer » above the fold', (await overflow()) === 0 && fold);
  await shot('4-phone-banque');
  // mobile banking: deposit 5 000 F from the phone, the confirmation double-tapped
  await sel('#phone .pk-btn[data-arg="deposit"]');
  await page.waitForFunction(() => window.__dakar.phoneInfo().arg === 'deposit', null, { timeout: 30000 });
  await tapWhere(a => [...document.querySelectorAll('#phone .bk-chip')].find(e => e.dataset.arg === a), '5000');
  await page.waitForFunction(() => !document.querySelector('#phone .bk-conf')?.hidden, null, { timeout: 30000 });
  const pref = await d(() => document.querySelector('#phone .bk-conf [data-act="ok"]')?.dataset.arg ?? '');
  await wait(300); await shot('5-phone-confirm');
  await sel('#phone .bk-conf [data-act="ok"]', { twice: true });
  await page.waitForFunction(() => window.__dakar.phoneInfo().screen === 'banque' && window.__dakar.phoneInfo().arg === null, null, { timeout: 30000 }); await wait(700);
  const b7 = await bank(), ph7 = NB(await d(() => document.querySelector('#phone .ph-screen').innerText));
  const replay7 = await d(r => window.__dakar.bank.replay('deposit', 5000, r), pref);
  check('7d. a deposit from the phone, double-tapped: 5 000 F once, the screen redrawn with the new balances, its ref refused again', b7.savings === 25000 && b7.wallet === w0 - 25000 && b7.tx.filter(x => x.ref === pref).length === 1 && ph7.includes(F(25000)) && ph7.includes(`Portefeuille ${F(w0 - 25000)}`) && ph7.includes('Épargne Teranga · dépôt (téléphone)') && !replay7.ok && replay7.why === 'duplicate',
    JSON.stringify({ savings: b7.savings, wallet: b7.wallet, replay7 }));
  await shot('6-phone-after-deposit');
  // the goal changed from the phone: « Changer » → Kiosque, at its real price
  await tapWhere(() => [...document.querySelectorAll('#phone .pk-btn')].find(e => /Changer/.test(e.textContent)), 'Changer');
  await page.waitForFunction(() => window.__dakar.phoneInfo().arg === 'goal', null, { timeout: 30000 });
  await sel('#phone [data-act="preset"][data-arg="kiosque"]');
  await page.waitForFunction(() => window.__dakar.phoneInfo().arg === null, null, { timeout: 30000 }); await wait(500);
  const g7 = (await bank()).goal, ph7e = NB(await d(() => document.querySelector('#phone .ph-screen').innerText));
  check('7e. the goal changed from the phone: Kiosque at 300 000 F, its progress shown', g7?.label === 'Kiosque' && g7?.amount === 300000 && ph7e.includes(`${F(25000)} / ${F(300000)}`), JSON.stringify(g7));
  await d(() => window.__dakar.phoneClose()); await wait(400);

  // 8 — a new player day: the interest of the day, once, capped (debug shortcut for the day a check cannot wait for)
  const s8 = (await bank()).savings;
  await d(() => window.__dakar.streak.nextDay());
  await page.waitForFunction(n => window.__dakar.bank.info().savings > n, s8, { timeout: 30000 }); await wait(1500);
  const b8 = await bank(), paid = b8.tx.filter(x => x.kind === 'interest');
  check('8. the next player day pays the interest once: 1 % of 25 000 F = 250 F (the cap of that level), nothing more on later frames', paid.length === 1 && paid[0].amount === 250 && b8.savings === s8 + 250 && b8.interestDay === b8.day,
    JSON.stringify({ paid: paid.map(p => p.amount), savings: b8.savings, day: b8.day }));

  // 9 — the Plateau agency: the same account at its counter
  await d(() => { window.__dakar.teleport('plateau'); window.__dakar.setHour(11); });
  await page.waitForFunction(() => window.__dakar.pos().hub === 'plateau', null, { timeout: 180000 }); await wait(1500);
  const desk2 = await d(() => window.__dakar.cityPlaces().find(p => p.id === 'plateau:city:bank'));
  await d(k => window.__dakar.place(k.x, k.z + 1.6, Math.PI), desk2);
  await page.waitForFunction(() => window.__dakar.focus()?.id === 'plateau:city:bank', null, { timeout: 60000 });
  await wait(600); await sel('#act', { settle: 200 });
  await page.waitForFunction(() => document.querySelector('#modal.on .item'), null, { timeout: 60000 });
  const s9 = await sheet();
  await row('Mon épargne'); await titled('Mon épargne');
  const s9b = NB((await sheet()).text), b9 = await bank();
  check('9. the Plateau agency offers « Mon épargne » on the same account, with the same balances', /Banque Teranga · Plateau/.test(s9.title) && s9.rows.includes('Mon épargne') && !s9.rows.includes('Ouvrir un compte') && s9b.includes('Banque Teranga · Plateau') && s9b.includes(`Épargne ${F(b9.savings)}`) && s9b.includes(`Portefeuille ${F(b9.wallet)}`),
    JSON.stringify({ rows: s9.rows, text: s9b.slice(0, 140) }));
  check('no JavaScript errors', errors.length === 0, errors.join(' | '));
} finally {
  fs.writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 1));
  const failed = results.filter(r => !r.ok).length;
  console.log(`${results.length - failed}/${results.length} passed`);
  await browser.close();
  process.exitCode = failed ? 1 : 0;
}
