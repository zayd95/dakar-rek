// The Tiak Tiak tour in the real game (docs/M1B-TIAK-TOUR.md): offered at its pick-up without any earlier delivery, one choice (who is
// served first) with the predicted outcome of each order, the real route ridden on the Tiak bike (the game paused and stepped at 30
// frames a second, the rider pressing the game's own keys or the touch pad), both stops handed over, the two orders giving different
// outcomes, abandoning disclosed and priced, a reload in the middle that neither pays twice nor loses the run, a later offer that
// remembers — and a panel made of cards (icons, short words, one big reward), not paragraphs: the word count of each panel is checked. Usage: flock /tmp/dakar-browser.lock node scripts/check-tiak-tour.mjs [baseUrl] [outDir]  (ONLY=desktop|phone)
import { chromium } from 'playwright';
import fs from 'node:fs';
import { mountAt, ride } from './m1b-tour/rider.mjs';

const base = process.argv[2] ?? 'http://localhost:4311/';
const out = process.argv[3] ?? 'docs/screenshots/tiak-tour';
fs.mkdirSync(out, { recursive: true });
const paths = JSON.parse(fs.readFileSync(new URL('./m1b-tour/paths.json', import.meta.url), 'utf8'));
const results = []; let failed = 0;
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail: String(detail).slice(0, 400) }); if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${String(detail).slice(0, 400)}`); };
const T = { timeout: 180000 };
const LEG = { 'pickup>0': 'pickup>agence', 'pickup>1': 'pickup>dames', '0>1': 'agence>dames', '1>0': 'dames>agence' };
const NAME = ['agence', 'dames'];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
for (const [label, viewport, touch] of [['desktop', { width: 1280, height: 800 }, false], ['phone', { width: 390, height: 844 }, true]]) {
  if (process.env.ONLY && process.env.ONLY !== label) continue;
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch });
  await context.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'low'); } catch { /* */ } });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const style = touch ? 'touch' : 'clavier';
  const d = (fn, arg) => page.evaluate(fn, arg);
  const shot = async name => { try { await d(() => { window.__dakar.render?.(); }); await page.waitForTimeout(300); await page.screenshot({ path: `${out}/${label}-${name}.png` }); } catch { /* */ } };
  const waitReady = async () => {
    await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.tiak && window.__dakar.tourOffer, null, T);
    await page.waitForFunction(() => window.__dakar.pos().hub === 'pikine' && window.__dakar.tiak.at() && window.__dakar.tourOffer().length > 0, null, T);
    await page.waitForTimeout(1200);
  };
  const reset = () => d(() => {
    const s = window.__dakar.state; s.data.wallet = 3000; s.data.needs.energie = 95; s.data.needs.faim = 90; s.data.jobs.active = null; s.data.jobs.done = [];
    for (const k of Object.keys(s.data.counters)) if (k.startsWith('tiak_') || k === 'livraisons' || k === 'tournees') delete s.data.counters[k];
  });
  const offer = () => d(() => window.__dakar.tourOffer()[0]);
  const tstate = () => d(() => window.__dakar.tourState());
  const wallet = () => d(() => window.__dakar.state.wallet);
  const modalText = () => d(() => document.querySelector('#modal.on')?.innerText ?? '');
  const closeModal = async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(300); };
  /**
   * Stand at the pick-up, open the kiosk, its delivery menu and the tour. `first`: undefined stops at the delivery menu, null at the
   * order menu, 0 / 1 picks the order (the index of the stop served first).
   */
  const openAtKiosk = async first => {
    const kiosk = await d(() => { const t = window.__dakar.interactables().find(i => i.id.startsWith('pikine:') && i.id.includes(':cafe:')); return t ? { id: t.id, x: t.x, z: t.z } : null; });
    await d(k => { window.__dakar.pause(false); window.__dakar.place(k.x + 1.2, k.z + 1.2, 0); }, kiosk);
    await page.waitForFunction(id => (window.__dakar.focus()?.id ?? '') === id, kiosk.id, T).catch(() => {});
    await d(() => window.__dakar.act());
    await page.waitForFunction(() => document.querySelector('#modal.on'), null, T);
    await page.locator('#modal.on .item', { hasText: 'Livraisons Tiak Tiak' }).first().click();
    await page.waitForTimeout(400);
    const cardsOf = sel => d(s => [...document.querySelectorAll(s)].map(e => { const r = e.getBoundingClientRect(); return { text: e.innerText.replace(/\s+/g, ' ').trim(), h: Math.round(r.height), right: Math.round(r.right), dis: e.classList.contains('dis'), late: e.querySelectorAll('.stop.late').length, ok: e.querySelectorAll('.stop.ok').length, verdict: e.querySelector('.verdict')?.textContent ?? '' }; }), sel);
    const res = { jobsText: await modalText(), cards: await cardsOf('#modal.on .dcard'), tour: await cardsOf('#modal.on .dcard.tour') };
    if (first === undefined) return res;
    await page.locator('#modal.on .dcard.tour').first().click();
    await page.waitForTimeout(400);
    res.orderText = await modalText();
    res.orders = await cardsOf('#modal.on .dcard.order');
    res.paragraphs = await d(() => [...document.querySelectorAll('#modal.on p')].filter(p => !p.hidden && p.offsetParent !== null && p.innerText.trim().length > 60).map(p => p.innerText));      // a paragraph = more than one short line
    if (first === null) return res;
    await page.locator(`#modal.on .dcard.order[data-first="${first}"]`).first().click();
    await page.waitForTimeout(400);
    return res;
  };
  const dismount = () => d(() => { const x = window.__dakar; for (const c of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) window.dispatchEvent(new KeyboardEvent('keyup', { code: c })); x.tiak.boost(0); x.step(1 / 30, 20); if (x.tiak.at()?.driving) { x.act(); x.step(1 / 30, 40); } });
  /** Rides the leg from `from` ('pickup' or a stop index) to stop `to`, until the tour moves on (the stop is handed over). */
  const hud = () => d(() => { const e = document.querySelector('#delivery.on'); return e ? { text: e.innerText.replace(/\s+/g, ' ').trim(), name: e.querySelector('.dv-main b')?.textContent, prog: e.querySelector('.dv-prog')?.textContent ?? '', clock: e.querySelector('.dv-clock')?.textContent ?? '', h: Math.round(e.getBoundingClientRect().height), right: Math.round(e.getBoundingClientRect().right) } : null; });
  const rideStop = async (from, to, continuous = false, mid = null) => {
    const path = paths[LEG[`${from}>${to}`]].path;
    // continuous: the bike leaves the stop without stopping (put on the next leg's line at 5 m/s: the measured flying start)
    const seated = continuous ? await d(([x, z, yaw]) => { const t = window.__dakar.tiak; if (!t.at()?.driving) return false; t.place(x, z, yaw); t.boost(5); return true; }, [path[0][0], path[0][1], Math.atan2(path[1][0] - path[0][0], path[1][1] - path[0][1])]) : await mountAt(page, path);
    await d(() => { window.__legStart = window.__dakar.tourState()?.leg ?? -1; });
    if (mid) { await ride(page, path, { style, maxS: 5, arrive: 0, until: () => false }); await mid(); }
    const r = await ride(page, path, { style, maxS: 90, arrive: 0, until: () => { const t = window.__dakar.tourState(); return !t || t.leg !== window.__legStart; } });
    const after = await d(() => ({ played: window.__dakar.state.data.playedMs, job: window.__dakar.activeJob() }));
    return { seated, r, clock: after.job ? +((after.played - after.job.startedMs) / 1000).toFixed(1) : null };
  };

  await page.goto(`${base}?debug${touch ? '&touch' : ''}`, { timeout: 120000 });
  await d(() => { window.__dakar.teleport('pikine'); window.__dakar.setHour(11); });
  await waitReady();

  // ---- 1. offered at the pick-up, no earlier delivery needed, a simple delivery recommended
  await reset();
  const o1 = await openAtKiosk();
  const tourCard = o1.tour[0];
  check(`${label}: the pick-up's Tiak Tiak panel offers the tour as a card with no delivery done before`, !!tourCard && !tourCard.dis && (await d(() => window.__dakar.state.data.counters.livraisons ?? 0)) === 0, JSON.stringify(tourCard));
  check(`${label}: the tour card is icons and numbers: pick-up, two stops, a big reward, the bonus, one action`, /☕/.test(tourCard.text) && /🏦/.test(tourCard.text) && /♟️/.test(tourCard.text) && /\+4\s?500\s?F/.test(tourCard.text) && /Gain estimé/.test(tourCard.text) && /2 arrêts/.test(tourCard.text) && /🎁 Bonus/.test(tourCard.text) && /Choisir ›/.test(tourCard.text), tourCard.text);
  check(`${label}: a one-line hint recommends starting simple (with an icon)`, /1re fois/.test(o1.jobsText) && /Commence simple/.test(o1.jobsText) && /👍/.test(o1.jobsText), o1.jobsText.slice(0, 200));
  const words = t => (t.match(/[A-Za-zÀ-ÿ'’-]{3,}/g) ?? []).length;      // real words: icons, numbers and « 12 s » do not count
  check(`${label}: the delivery panel is short (${words(o1.jobsText)} words, no paragraph)`, words(o1.jobsText) <= 30 && (await d(() => [...document.querySelectorAll('#modal.on p')].filter(p => p.offsetParent !== null && p.innerText.trim().length > 60).length)) === 0, o1.jobsText);
  check(`${label}: the tour card is big enough to tap and inside the screen`, tourCard.h >= 80 && tourCard.right <= viewport.width, JSON.stringify({ h: tourCard.h, right: tourCard.right }));
  await shot('kiosk-menu');
  await closeModal();

  // ---- 2. the order menu: the one choice, the predicted outcome of each order, the price of abandoning
  await reset();
  const o2 = await openAtKiosk(null);
  const offer0 = await offer();
  check(`${label}: « Qui en premier ? » is two cards, one per order, each client with a 🔥 urgency and a ⏱ limit, a ✓ / ! verdict beside the price`, o2.orders.length === 2 && o2.orders.every(c => (c.text.match(/🔥/g) ?? []).length >= 2 && (c.text.match(/⏱/g) ?? []).length === 2 && /(✓|!)/.test(c.verdict) && /≈ \+\d/.test(c.text)), JSON.stringify(o2.orders.map(c => c.text)));
  check(`${label}: each order shows one client on time and one late at trust 0 (red time, « ! » verdict) and the two pay differently: a real choice`, o2.orders.every(c => c.ok === 1 && c.late === 1 && c.verdict === '!') && offer0.orders[0].pay !== offer0.orders[1].pay, JSON.stringify({ orders: o2.orders.map(c => c.text), pays: offer0.orders.map(o => o.pay) }));
  check(`${label}: the panel has no paragraph and few words (${words(o2.orderText)}), memory is a ★ / 😒 mark and absent when neutral`, o2.paragraphs.length === 0 && words(o2.orderText) <= 25 && offer0.memory.every(m => m.trust === 0) && !/(★|😒)/.test(o2.orderText), JSON.stringify({ p: o2.paragraphs, w: words(o2.orderText), trust: offer0.memory.map(m => m.trust), mark: /(★|😒)/.test(o2.orderText) }));
  check(`${label}: the order cards are touch-sized and inside the screen`, o2.orders.every(c => c.h >= 90 && c.right <= viewport.width) && (await d(() => document.documentElement.scrollWidth <= window.innerWidth)), JSON.stringify(o2.orders.map(c => [c.h, c.right])));
  await shot('order-menu');
  const hidden = await d(() => [...document.querySelectorAll('#modal.on .ddisc p')].map(p => p.hidden));
  await page.locator('#modal.on .dmore').click();
  const disc = await d(() => document.querySelector('#modal.on .ddisc p')?.innerText ?? '');
  check(`${label}: what abandoning costs is one tap away (hidden first, then one short line: stops paid, no bonus, −1 ★ per client not delivered, free before leaving)`, hidden[0] === true && /gratuit/.test(disc) && /bonus/.test(disc) && /−1 ★/.test(disc), disc);
  await shot('order-disclosure');
  await closeModal();

  // ---- 3. one tour in each order, ridden for real
  const runTour = async first => {
    const other = 1 - first;
    await reset();
    const w0 = await wallet();
    await openAtKiosk(first);
    const accepted = await tstate();
    check(`${label}/${NAME[first]} first: accepted at the pick-up with both parcels in hand and the clock not started`, !!accepted && accepted.departed === false && accepted.order[0] === first && accepted.parcel === 'deliver' && accepted.leg === 0, JSON.stringify(accepted));
    await d(() => { window.__dakar.pause(true); window.__dakar.step(1 / 30, 14); });
    const pre = await hud();
    check(`${label}/${NAME[first]} first: before leaving the HUD shows only the next place, the progress and « Va ! » (no countdown yet)`, !!pre && pre.prog === '●○' && pre.clock === 'Va !' && pre.name === (first === 0 ? 'Banque' : 'Grand-place') && words(pre.text) <= 6, JSON.stringify(pre));
    await shot(`run-${NAME[first]}-accepted`);
    let riding = null;
    const a = await rideStop('pickup', first, false, async () => { riding = await hud(); await shot(`run-${NAME[first]}-riding`); });
    check(`${label}/${NAME[first]} first: while riding the HUD is the next place, ●○ progress and a countdown, in one short line`, !!riding && riding.prog === '●○' && /^\d+:\d\d$/.test(riding.clock) && words(riding.text) <= 6 && riding.right <= viewport.width, JSON.stringify(riding));
    const afterFirst = await tstate(), w1 = await wallet();
    check(`${label}/${NAME[first]} first: the real ride reached the first stop (tour clock ${a.clock} s) and it was handed over`, a.seated && a.r.ok && !!afterFirst && afterFirst.leg === 1 && afterFirst.departed === true && w1 > w0, JSON.stringify({ seated: a.seated, ride: a.r, leg: afterFirst?.leg, w0, w1 }));
    await shot(`run-${NAME[first]}-first-stop`);
    const b = await rideStop(first, other, true);
    const clock2 = b.r.events?.[0]?.clock ?? null;
    const end = await tstate(), w2 = await wallet();
    const led = await d(() => window.__dakar.ledger().slice(0, 3).map(l => l.label));
    const memory = (await offer()).memory;
    const counters = await d(() => ({ livraisons: window.__dakar.state.data.counters.livraisons ?? 0, tournees: window.__dakar.state.data.counters.tournees ?? 0, done: window.__dakar.state.data.jobs.done.length, active: window.__dakar.state.data.jobs.active }));
    check(`${label}/${NAME[first]} first: the second stop handed over at tour clock ${clock2} s, the run finished once, bonus paid`, b.r.ok && end === null && counters.tournees === 1 && counters.livraisons === 2 && counters.done === 1 && counters.active === null, JSON.stringify({ ride: b.r, end, counters }));
    check(`${label}/${NAME[first]} first: the money matches two stops and the bonus in the ledger, nothing paid twice`, w2 - w0 > 0 && led.length === 3 && /Tournée complète/.test(led[0]) && led.filter(l => /Tournée Tiak Tiak/.test(l)).length === 2, JSON.stringify({ paid: w2 - w0, led }));
    console.log(`  ${label}/${NAME[first]} first: stops handed over at tour clock ${a.clock} s and ${clock2} s; paid +${w2 - w0}; memory ${JSON.stringify(memory.map(m => [m.id, m.trust, m.history]))}`);
    await dismount();
    return { paid: w2 - w0, memory, first: a, second: b };
  };
  const A = await runTour(0), B = await runTour(1);
  const trustA = A.memory.map(m => m.trust).join(','), trustB = B.memory.map(m => m.trust).join(',');
  check(`${label}: the two orders gave different outcomes (paid ${A.paid} vs ${B.paid}; trust ${trustA} vs ${trustB})`, A.paid !== B.paid && trustA !== trustB, `${A.paid}/${B.paid} ${trustA}/${trustB}`);

  // ---- 4. a later offer remembers
  await reset();
  await d(() => { const c = window.__dakar.state.data.counters; c.tiak_trust_pk_agence = 2; c.tiak_ok_pk_agence = 2; c.tiak_trust_pk_dames = -1; c.tiak_late_pk_dames = 1; });
  const rem = await offer();
  await d(() => { window.__dakar.pause(false); window.__dakar.tourMenu(); });
  await page.waitForTimeout(400);
  const remText = await modalText();
  const orders1 = await d(() => [...document.querySelectorAll('#modal.on .dcard.order')].map(e => e.innerText.replace(/\s+/g, ' ')));
  check(`${label}: a later offer remembers (limits, pay, and a ★★ / 😒 mark on the cards)`, rem.limits[0] > offer0.limits[0] && rem.limits[1] < offer0.limits[1] && rem.pays[0] > offer0.pays[0] && rem.pays[1] === offer0.pays[1] && /★★/.test(remText) && /😒/.test(remText), JSON.stringify({ limits: rem.limits, pays: rem.pays, cards: orders1 }));
  await shot('order-memory');
  await closeModal();

  if (label === 'desktop') {
    // ---- 5. a reload in the middle: the run is kept, the first stop is not paid again, the second is
    await reset();
    await openAtKiosk(0);
    await d(() => window.__dakar.pause(true));
    await rideStop('pickup', 0);
    await dismount();
    const w1 = await wallet(), mid = await tstate(), trustMid = (await offer()).memory.map(m => m.trust);
    await d(() => window.__dakar.pause(false));
    await page.waitForTimeout(600);
    await page.reload({ timeout: 120000 });
    await waitReady();
    const back = await tstate(), wBack = await wallet(), trustBack = (await offer()).memory.map(m => m.trust);
    check(`${label}: after a reload in the middle the tour is exactly where it was (same stop, clock running, nothing paid again)`, !!mid && !!back && back.leg === 1 && back.departed === true && back.stop === mid.stop && back.runId === mid.runId && wBack === w1 && JSON.stringify(trustBack) === JSON.stringify(trustMid), JSON.stringify({ mid, back, w1, wBack }));
    await d(() => window.__dakar.pause(true));
    const r2 = await rideStop(0, 1);
    const wEnd = await wallet(), c = await d(() => ({ done: window.__dakar.state.data.jobs.done.length, tournees: window.__dakar.state.data.counters.tournees ?? 0, livraisons: window.__dakar.state.data.counters.livraisons ?? 0 }));
    check(`${label}: finishing after the reload pays the second stop and the bonus once`, r2.r.ok && (await tstate()) === null && wEnd > wBack && c.done === 1 && c.tournees === 1 && c.livraisons === 2, JSON.stringify({ r2: r2.r, wBack, wEnd, c }));
    await dismount();

    // ---- 6. abandoning: free before leaving the pick-up, priced after, said in one line before anything is lost
    await reset();
    await openAtKiosk(0);
    await d(() => { window.__dakar.pause(false); window.__dakar.jobsMenu(); });
    await page.waitForTimeout(400);
    const free = await d(() => document.querySelector('#modal.on .dlv')?.innerText ?? '');
    check(`${label}: with a tour in hand the jobs panel is the live card and one « Abandonner » button (${words(free)} words)`, /Tournée 1\/2/.test(free) && /Abandonner/.test(free) && words(free) <= 12, free);
    await page.locator('#modal.on .dcard.act').first().click();
    await page.waitForTimeout(300);
    const freeConfirm = await modalText();
    check(`${label}: before leaving the pick-up abandoning is said to cost nothing`, /aucun coût/.test(freeConfirm) && /Continuer/.test(freeConfirm), freeConfirm);
    await closeModal();
    const w3 = await wallet();
    await d(() => window.__dakar.abandonTour());
    check(`${label}: abandoning before departure is free (no pay, no trust change, nothing left running)`, (await tstate()) === null && (await wallet()) === w3 && (await offer()).memory.every(m => m.trust === 0), '');
    await reset();
    await openAtKiosk(1);
    await d(() => { const j = window.__dakar.state.data.jobs.active; j.tour.departed = true; j.startedMs = window.__dakar.state.data.playedMs; });
    await d(() => window.__dakar.jobsMenu());
    await page.waitForTimeout(400);
    const priced = await d(() => document.querySelector('#modal.on .dlv')?.innerText ?? '');
    check(`${label}: on the road the jobs panel is still the live card and the one button`, /Tournée/.test(priced) && /Abandonner/.test(priced), priced);
    await page.locator('#modal.on .dcard.act').first().click();
    await page.waitForTimeout(300);
    const confirm = await modalText();
    check(`${label}: a confirmation says the cost in one line before anything is lost (no bonus, −1 ★ for each client waiting)`, /Abandonner \?/.test(confirm) && /Pas de bonus/.test(confirm) && /−1 ★/.test(confirm) && /Oui, abandonner/.test(confirm) && /Continuer/.test(confirm) && words(confirm) <= 14, confirm);
    await shot('abandon-confirm');
    const w4 = await wallet();
    await page.locator('#modal.on .dcard', { hasText: 'Oui, abandonner' }).first().click();
    await page.waitForTimeout(400);
    const memAfter = (await offer()).memory;
    check(`${label}: abandoning on the road pays nothing and costs 1 trust with each waiting client`, (await tstate()) === null && (await wallet()) === w4 && memAfter.every(m => m.trust === -1 && m.history.dropped === 1), JSON.stringify(memAfter.map(m => [m.id, m.trust, m.history])));
  }

  check(`${label}: no page errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
  await context.close();
}
await browser.close();
fs.writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 2));
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
