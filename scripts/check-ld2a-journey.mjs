// LD2.0-A acceptance (« Earn & Guidance »), on a phone (390×844, touch), real taps wherever a player taps; the debug hooks only set a scene up
// (the money a player has saved before, the place to stand, played time) and read the state.
//
//   Journey A — the guided life: a Tiak delivery → paid once → one lead offered after its card → « Mes pistes » → the bank → an account and a
//   deposit → the conseillère's advice → the bana-bana table bought → stocked and run → its till paid, its hourly income → reload: every franc,
//   the account, the table and the leads as they were.
//   Journey B — the free life: the same start, every lead ignored (« Plus tard », « Pas maintenant »): work goes on, nothing is locked, the same
//   lead is not offered again, and a reload brings none of them back.
// Usage: node scripts/check-ld2a-journey.mjs <baseUrl> <outDir>
import { chromium } from 'playwright';
import fs from 'node:fs';
import { realTouch } from './lib/realTouch.mjs';

const [base = 'http://localhost:4604/', out = '/tmp/claude-0/ld2/journey'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const results = []; let failed = 0;
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail: String(detail).slice(0, 400) }); if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${String(detail).slice(0, 400)}`); };
const F = v => `${Math.round(v).toLocaleString('fr-FR')} F`, NB = s => String(s).replace(/[  ]/g, ' ').replace(/\s+/g, ' ');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });

async function life(label, guided) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'low'); } catch { /* */ } });
  const page = await ctx.newPage(); page.setDefaultTimeout(240000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const d = (fn, a) => page.evaluate(fn, a), wait = ms => page.waitForTimeout(ms);
  const until = (fn, a, ms = 60000) => page.waitForFunction(fn, a, { timeout: ms, polling: 250 }).then(() => true, () => false);
  const shot = name => page.screenshot({ path: `${out}/${label}-${name}.png` }).catch(() => {});
  const ready = () => page.waitForFunction(() => window.__dakar?.pos?.().hub === 'pikine' && window.__dakar.bank && window.__dakar.bana?.().at && window.__dakar.pistes && !document.getElementById('studio'), null, { timeout: 300000 });
  const sheet = () => d(() => ({ open: !!document.querySelector('#modal.on'), title: document.querySelector('#modal.on h2')?.textContent ?? '', text: document.querySelector('#modal.on')?.innerText ?? '', rows: [...document.querySelectorAll('#modal.on .item:not(.close)')].map(e => e.textContent) }));
  /** A finger on an element once its sheet or screen has stopped sliding in (a software renderer draws the slide late) and it stands still. */
  const still = async (find, arg) => {
    await page.waitForFunction(() => !document.querySelector('#modal.on .sheet, #phone.on')?.getAnimations({ subtree: true }).some(a => a.playState === 'running' && a.effect?.getComputedTiming?.().iterations !== Infinity), null, { timeout: 30000 }).catch(() => {});
    let prev = null;
    for (let i = 0; i < 40; i++) {
      const c = await d(([src, a]) => { const e = (0, eval)(src)(a); if (!e) return null; e.scrollIntoView({ block: 'nearest' }); const r = e.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; }, [find.toString(), arg]);
      if (!c) return null;
      if (prev && prev.x === c.x && prev.y === c.y) return c;
      prev = c; await wait(160);
    }
    return prev;
  };
  const tapOn = async (find, arg) => { await wait(400); const c = await still(find, arg); if (!c) throw new Error(`nothing to tap: ${arg}`); await t.down(9, c.x, c.y); await wait(60); await t.up(9); await wait(450); };
  const row = text => tapOn(x => [...document.querySelectorAll('#modal.on .item:not(.close)')].find(e => e.textContent.replace(/[  ]/g, ' ').includes(x)), text);
  const sel = s => tapOn(x => document.querySelector(x), s);
  const titled = x => until(y => document.querySelector('#modal.on h2')?.textContent === y, x, 30000);
  const money = () => d(() => ({ wallet: window.__dakar.state.wallet, savings: window.__dakar.state.data.bank.savings, ledger: window.__dakar.state.data.ledger.length }));
  const deliver = async () => {
    const w0 = (await money()).wallet;
    const job = await d(() => { const j = window.__dakar.jobs().find(x => !x.blocked); return j ? window.__dakar.acceptJob(j.id, true) : null; });
    const done = await d(() => window.__dakar.completeJob()), again = await d(() => window.__dakar.completeJob());
    return { job, done, again, gained: (await money()).wallet - w0 };
  };
  const goTo = async id => { const p = await d(x => (window.__dakar.cityPlaces?.() ?? window.__dakar.interactables()).find(i => i.id === x) ?? window.__dakar.interactables().find(i => i.id === x), id); await d(k => window.__dakar.place(k.x, k.z + 1.6, Math.PI), p); return until(x => window.__dakar.focus()?.id === x, id, 60000); };

  // a player who has worked a few days already: 70 000 F put together, two deliveries made
  await page.goto(`${base}?debug&touch&heure=11&argent=70000`, { timeout: 180000 });
  await ready();
  const t = await realTouch(page);
  await d(() => { const D = window.__dakar; D.teleport('pikine'); D.setHour(11); const s = D.state.data; s.counters.livraisons = 2; Object.assign(s.needs, { social: 60, moral: 60, energie: 95, faim: 80 }); });
  await until(() => window.__dakar.pos().hub === 'pikine', null, 120000); await wait(2000);

  // 1 — a Tiak delivery, paid once, its card, then one lead
  const del = await deliver();
  check(`${label} 1a. a Tiak delivery is paid once (the same run never paid again)`, del.done?.paid > 0 && del.gained === del.done.paid && !del.again, JSON.stringify({ paid: del.done?.paid, gained: del.gained }));
  const card = await until(() => !!document.querySelector('#toast .mo.bc'), null, 10000);
  check(`${label} 1b. its work card first, no lead over it`, card && !(await d(() => !!document.querySelector('#toast .mo.of'))));
  const offered = await until(() => !!document.querySelector('#toast .mo.of'), null, 40000);
  const offer = NB(await d(() => document.querySelector('#toast .mo.of')?.textContent ?? ''));
  await shot('1-offer');
  check(`${label} 1c. then one lead from the real situation (Pape Sarr for a car: never a promised loan)`, offered && /Pape Sarr/.test(offer) && !/étudiera|accord/.test(offer), offer);
  await sel('#toast .mo.of .of-b:not(.on)');                                           // « Plus tard »
  check(`${label} 1d. « Plus tard » closes it`, await until(() => !document.querySelector('#toast .mo.of'), null, 8000));

  if (guided) {
    // 2 — « Mes pistes » in the phone: « Mettre de côté » → the bank
    await sel('#menuBtn'); await until(() => window.__dakar.phoneInfo().open, null, 30000);
    const homeRow = await until(() => !!document.querySelector('#phone .hm-pistes'), null, 15000);
    await sel('#phone .hm-pistes'); await until(() => window.__dakar.phoneInfo().screen === 'pistes', null, 30000); await wait(500);
    const leads = await d(() => [...document.querySelectorAll('#phone .pi b')].map(b => b.textContent));
    await shot('2-mes-pistes');
    check(`${label} 2a. the phone's home shows « Mes pistes »; the leads are real ones: the savings account, the first business (70 000 F in hand)`, homeRow && leads.includes('Mettre de côté') && leads.includes('Ta première affaire'), leads.join(' · '));
    await tapOn(() => { const c = [...document.querySelectorAll('#phone .pi')].find(e => e.textContent.includes('Mettre de côté')); return c?.querySelector('[data-act="go"]'); }, 'Y aller · Mettre de côté');
    await until(() => !window.__dakar.phoneInfo().open, null, 20000);
    const marked = await d(() => window.__dakar.destination());
    check(`${label} 2b. « Y aller » marks the Banque Teranga of Pikine`, marked === 'pikine:city:bank', String(marked));

    // 3 — at the counter: an account, a deposit of 25 000 F, the goal « Bana-bana »
    await goTo('pikine:city:bank'); await wait(600);
    await sel('#act'); await until(() => !!document.querySelector('#modal.on .item'), null, 60000);
    await row('Ouvrir un compte'); await titled('Ouvrir un compte');
    await row('Ouvrir mon compte Épargne Teranga'); await titled('Mon épargne');
    await row('Déposer'); await titled('Déposer');
    await tapOn(a => [...document.querySelectorAll('#modal.on .bk-chip')].find(e => e.dataset.amt === a), '25000');
    await titled('Confirmer le dépôt');
    const m0 = await money();
    await row('Déposer 25'); await titled('Mon épargne'); await wait(500);
    const m1 = await money();
    check(`${label} 3a. an account opened at the counter and 25 000 F deposited: the wallet −25 000, the savings +25 000, nothing created or lost`, m1.savings === 25000 && m0.wallet - m1.wallet === 25000 && m1.wallet + m1.savings === m0.wallet + m0.savings, JSON.stringify({ m0, m1 }));
    await row('Choisir un objectif'); await titled('Mon objectif'); await row('Bana-bana'); await titled('Mon épargne');
    const goal = await d(() => window.__dakar.bank.info().goal);
    check(`${label} 3b. the goal « Bana-bana » at the real price of a table (50 000 F)`, goal?.label === 'Bana-bana' && goal?.amount === 50000, JSON.stringify(goal));

    // 4 — the conseillère's advice, from the real state
    await row('Demander conseil à la conseillère'); await titled('La conseillère'); await wait(400);
    const advice = NB((await d(() => [...document.querySelectorAll('#modal.on .bk-advice li')].map(e => e.textContent))).join(' | '));
    const rules = NB((await d(() => window.__dakar.bank.advice())).join(' | '));
    await shot('3-advice');
    check(`${label} 4. her advice is the rules' own for this state: the table within reach of wallet + savings, Pape Sarr never promised`, advice === rules && /Table de bana-bana/.test(advice) && !/étudiera/.test(advice), advice);
    await row('Merci'); await until(() => !document.querySelector('#modal.on'), null, 15000);

    // 4b — mobile banking: 10 000 F back from the savings, so the wallet pays for the table
    await sel('#menuBtn'); await until(() => window.__dakar.phoneInfo().open, null, 30000);
    await d(() => window.__dakar.phone('banque')); await until(() => window.__dakar.phoneInfo().screen === 'banque', null, 30000);
    await sel('#phone .pk-btn[data-arg="withdraw"]'); await until(() => window.__dakar.phoneInfo().arg === 'withdraw', null, 30000);
    await tapOn(a => [...document.querySelectorAll('#phone .bk-chip')].find(e => e.dataset.arg === a), '10000');
    await until(() => !document.querySelector('#phone .bk-conf')?.hidden, null, 30000);
    const m4 = await money();
    await sel('#phone .bk-conf [data-act="ok"]'); await until(() => window.__dakar.phoneInfo().arg === null, null, 30000); await wait(500);
    const m4b = await money();
    check(`${label} 4b. 10 000 F withdrawn from the phone: back in the wallet, out of the savings`, m4b.savings === m4.savings - 10000 && m4b.wallet === m4.wallet + 10000, JSON.stringify({ m4, m4b }));
    await d(() => window.__dakar.phoneClose()); await wait(600);

    // 5 — the bana-bana table: the lead leads there, bought at the table from the wallet
    const banaLead = await d(() => window.__dakar.pistes.list().find(p => p.id === 'first_business'));
    check(`${label} 5a. « Ta première affaire » leads to the table in the world (its place, not just an app)`, banaLead?.go?.place?.id === 'pikine:bana', JSON.stringify(banaLead?.go));
    const b0 = await d(() => window.__dakar.bana());
    await d(f => window.__dakar.place(f.x, f.z + 0.2, Math.PI), b0.front); await until(() => window.__dakar.focus()?.id === 'pikine:bana', null, 60000);
    await sel('#act'); await titled('Table à céder');
    const w5 = (await money()).wallet;
    await row('Reprendre la table'); await titled('Ta table de bana-bana');
    const after5 = await money(), biz = await d(() => window.__dakar.business());
    check(`${label} 5b. the table bought once at its price: −50 000 F, one bana unit owned`, w5 - after5.wallet === 50000 && biz.owned.bana === 1, JSON.stringify({ w5, after: after5.wallet, owned: biz.owned }));

    // 6 — run it: stock, serve the customers, close: the till paid once
    await row('Acheter de la marchandise'); await titled('Marchandise');
    for (const g of ['cornets d’arachides', 'cartes de recharge', 'paquets de mouchoirs']) await row(g);
    const stocked = await money();
    await sel('#modal.on .sh-x'); await until(() => !document.querySelector('#modal.on'), null, 15000); await wait(800);
    await sel('#act'); await titled('Table ouverte'); await wait(1200);
    for (let k = 0; k < 8 && (await d(() => window.__dakar.bana().customer)); k++) {
      const n = await d(() => window.__dakar.bana().card.open?.served ?? 0), c = await d(() => window.__dakar.bana().customer);
      await row(`Servir ${c.name}`);
      await until(m => (window.__dakar.bana().card.open?.served ?? 0) > m, n, 15000);
    }
    const open = await d(() => window.__dakar.bana().card.open);
    await shot('4-till');
    await row('Fermer et encaisser'); await wait(600);
    const closed = await money(), last = await d(() => window.__dakar.bana().card.last), shown = NB((await sheet()).text);
    check(`${label} 6a. customers served and the till paid once: + the recette, one « Recette » line; the sheet's calculation is the money`,
      open?.served >= 1 && closed.wallet - stocked.wallet === open.sales && closed.ledger === stocked.ledger + 1 && last.profit === open.sales - open.cost && shown.includes('Bénéfice') && shown.includes(NB(F(last.profit))),
      JSON.stringify({ served: open?.served, sales: open?.sales, cost: open?.cost, paid: closed.wallet - stocked.wallet, profit: last?.profit }));
    await row('OK');
    // the venture's own income: an in-game hour of play later, +400 F, one line (unchanged by the table)
    const w6 = (await money()).wallet;
    await d(() => window.__dakar.advancePlayed(window.__dakar.business().hourMs));
    const rev = await d(() => window.__dakar.state.data.ledger.slice(-1)[0]);
    check(`${label} 6b. the table's hourly income as before: an in-game hour of play later, one « Revenus » line of 400 F`, /^Revenus/.test(rev.label) && rev.amount >= 400 && rev.amount < 800 && (await money()).wallet - w6 === rev.amount, JSON.stringify(rev));
  } else {
    // the free life: the leads ignored in the phone too
    await sel('#menuBtn'); await until(() => window.__dakar.phoneInfo().open, null, 30000);
    await d(() => window.__dakar.phone('pistes')); await until(() => window.__dakar.phoneInfo().screen === 'pistes', null, 30000); await wait(500);
    let n = await d(() => document.querySelectorAll('#phone .pi').length);
    const n0 = n;
    for (let k = 0; k < 6 && n > 0; k++) { await sel('#phone [data-act="drop"]'); await wait(600); n = await d(() => document.querySelectorAll('#phone .pi').length); }
    check(`${label} 2. every lead in the phone set aside with « Pas maintenant »`, n0 > 0 && n === 0, JSON.stringify({ n0, n }));
    await d(() => window.__dakar.phoneClose()); await wait(600);
    // work goes on: another delivery paid once, nothing locked, no lead offered for the same situation again
    const del2 = await deliver();
    check(`${label} 3. work goes on: another delivery paid once`, del2.done?.paid > 0 && del2.gained === del2.done.paid && !del2.again, JSON.stringify({ paid: del2.done?.paid }));
    await wait(16000);
    check(`${label} 4. no lead offered again for the same situation`, !(await d(() => !!document.querySelector('#toast .mo.of'))));
    // the economy stays open: the table can still be bought directly (from the Affaires app), nothing depends on a lead
    const can = await d(() => window.__dakar.business().next.bana);
    check(`${label} 5. nothing is locked behind a lead: the bana-bana is open to whoever pays (Affaires)`, can && !can.locked && can.price === 50000, JSON.stringify(can));
  }

  // reload: everything as it was
  const keep = await d(() => { const s = window.__dakar.state.data; return JSON.stringify({ wallet: s.wallet, bank: s.bank, pistes: s.pistes, bana: { ...s.bana, clientMs: 0, clients: 0 }, assets: s.assets.list.map(a => a.spec).sort(), ledger: s.ledger.length }); });
  await d(() => window.dispatchEvent(new Event('pagehide'))); await wait(300);
  await page.goto(`${base}?debug&touch&heure=11`, { timeout: 180000 }); await ready(); await wait(2500);
  const back = await d(() => { const s = window.__dakar.state.data; return JSON.stringify({ wallet: s.wallet, bank: s.bank, pistes: s.pistes, bana: { ...s.bana, clientMs: 0, clients: 0 }, assets: s.assets.list.map(a => a.spec).sort(), ledger: s.ledger.length }); });
  const k = JSON.parse(keep), b = JSON.parse(back);
  // played time goes on while the page reloads: an hourly payout may come in; nothing else may change
  const drift = b.wallet - k.wallet;
  check(`${label} R. reload: the wallet, the account and its history, the table, the leads and what is owned, as they were`,
    JSON.stringify({ ...b, wallet: 0, ledger: 0 }) === JSON.stringify({ ...k, wallet: 0, ledger: 0 }) && drift >= 0 && drift <= 800 && b.ledger - k.ledger <= 1,
    JSON.stringify({ drift, ledger: [k.ledger, b.ledger], diff: Object.keys(k).filter(x => JSON.stringify(k[x]) !== JSON.stringify(b[x])).map(x => [x, typeof k[x] === 'object' && k[x] ? Object.keys(k[x]).filter(y => JSON.stringify(k[x][y]) !== JSON.stringify(b[x]?.[y])).map(y => `${y}: ${JSON.stringify(k[x][y]).slice(0, 80)} → ${JSON.stringify(b[x]?.[y]).slice(0, 80)}`) : `${k[x]} → ${b[x]}`]) }));
  if (!guided) check(`${label} R2. after the reload no ignored lead comes back`, (await d(() => window.__dakar.pistes.list().length)) === 0, JSON.stringify(await d(() => window.__dakar.pistes.list().map(p => p.id))));
  await shot('5-after-reload');
  check(`${label} no JavaScript errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

try {
  if (process.env.LIFE !== 'B') await life('A', true);          // LIFE=A or LIFE=B runs one of the two
  if (process.env.LIFE !== 'A') await life('B', false);
} catch (e) {
  check('the run went through', false, e.stack ?? String(e));
} finally {
  await browser.close();
  fs.writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 2));
  console.log(`${results.length - failed}/${results.length} passed`);
  process.exitCode = failed ? 1 : 0;
}
