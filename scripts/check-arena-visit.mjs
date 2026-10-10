// An evening at the Pikine arena, end to end (src/arena): the ticket at the gate (price, confirmation, paid once) →
// the controller → a free place on the tiers → the crowd → the wrestlers' entrance → the watched bout → the result →
// the crowd leaves. (The street outside the walls is src/arena/exterior.ts, another lane.) Desktop 1280×720 and phone 390×844; captures in docs/screenshots/arena-visit.
// Usage: node scripts/check-arena-visit.mjs [baseUrl=http://localhost:4247/] [outDir=docs/screenshots/arena-visit] [--view=desktop|phone]
// LAMB2=1: with ?lamb2 (the watched bout avec frappe: referee's arm, the stands at the fall); captures and results suffixed -lamb2.
// Run it under the shared lock: flock /tmp/dakar-browser.lock node scripts/check-arena-visit.mjs …
import { chromium } from 'playwright';
import fs from 'node:fs';

const args = process.argv.slice(2);
const [base = 'http://localhost:4247/', out = 'docs/screenshots/arena-visit'] = args.filter(a => !a.startsWith('--'));
const view = args.find(a => a.startsWith('--view='))?.slice(7) ?? 'all';
// LAMB2=1: the game loads with ?lamb2 (Làmb 2.0): the watched gala bout is avec frappe; without it, nothing changes
const L2 = process.env.LAMB2 === '1';
fs.mkdirSync(out, { recursive: true });
const T = { timeout: 180000 };
const results = []; let failed = 0;
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`); };
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const VIEWS = [['desktop', { width: 1280, height: 720 }, false, 'medium'], ['phone', { width: 390, height: 844 }, true, 'low']].filter(([l]) => view === 'all' || l === view);

for (const [label0, viewport, touch, quality] of VIEWS) {
  const label = L2 ? `${label0}-lamb2` : label0;
  const ctx = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
  await ctx.addInitScript(q => { if (!sessionStorage.getItem('arena-visit')) { localStorage.clear(); localStorage.setItem('dakarrek.quality', q); sessionStorage.setItem('arena-visit', '1'); } }, quality);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}?debug${touch ? '&touch' : ''}${L2 ? '&lamb2' : ''}`, { timeout: 180000 });
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.arena, null, T);
  const d = (fn, arg) => page.evaluate(fn, arg);
  const info = () => d(() => window.__dakar.arena.info());
  const toast = () => d(() => (document.getElementById('toast')?.textContent ?? '').replace(/[  ]/g, ' '));
  const waitToast = re => page.waitForFunction(src => new RegExp(src).test((document.getElementById('toast')?.textContent ?? '').replace(/[  ]/g, ' ')), re.source, { timeout: 60000 }).then(() => true, () => false);
  // keeps the toast on for the capture; the observer adds the class only when missing (re-adding it queues another mutation: endless loop)
  const shot = async (name, pinToast = true) => {
    if (pinToast) await d(() => { const t = document.getElementById('toast'); t?.classList.add('on'); window.__pin?.disconnect(); window.__pin = new MutationObserver(() => { if (!t.classList.contains('on')) t.classList.add('on'); }); window.__pin.observe(t, { attributes: true }); });
    await page.waitForTimeout(700); await page.screenshot(); await page.waitForTimeout(500);
    await page.screenshot({ path: `${out}/${label}-${name}.png` });
    await d(() => { window.__pin?.disconnect(); window.__pin = null; });
  };
  // draw calls of the frame, and the arena's own share (the same frame with everything src/arena draws hidden)
  const frame = () => d(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
  const ownDc = async () => {
    await frame(); const all = await d(() => window.__dakar.drawCalls());
    await d(() => window.__dakar.arena.visible(false)); await frame(); const without = await d(() => window.__dakar.drawCalls());
    await d(() => window.__dakar.arena.visible(true)); await frame();
    return { all, own: all - without };
  };
  const idle = () => page.waitForFunction(() => !window.__dakar.activity() && window.__dakar.pos().mode === 'play', null, T).catch(() => {});

  // 1. The gate on a fight evening, with its ticket window.
  await d(() => { window.__dakar.teleport('pikine'); window.__dakar.setHour(18); window.__dakar.state.data.wallet = 5000; });
  await page.waitForFunction(() => window.__dakar.pos().hub === 'pikine' && !!window.__dakar.arena.info(), null, T);
  // a fight evening: with the exterior lane (src/arena/exterior.ts) both sides use its days (Friday–Sunday), so take the next Friday
  await d(() => { const x = window.__dakar; if (!x.arenaOut || !x.arenaOutDay) return; const t = x.arenaOut().day, fri = t + ((4 - (((t % 7) + 7) % 7)) + 7) % 7; x.arenaOutDay(fri); x.arena.day(fri); });
  await page.waitForFunction(() => window.__dakar.arena.info()?.street === 'doors', null, T);
  const a0 = await info(), G = a0.gate, C = a0.centre;
  await d(g => window.__dakar.place(g.x + 6, g.z - 15, -0.35), G);
  const places = await d(() => window.__dakar.placeList().filter(p => p.id.includes(':arena:')).map(p => p.id.split(':').pop()));
  check(`${label}: the ticket window is a place of the shared registry`, places.includes('guichet'), places.join(', '));
  await page.waitForTimeout(1500);
  const dcExt = await ownDc();
  await shot('1-gate', false);

  // 2. No ticket: the controller turns the player back at the gate.
  await d(c => window.__dakar.place(c.x, c.z - 15, 0), C);
  const stopped = await waitToast(/Le contrôleur : « Xaaral tuuti ! »/);
  const back = await d(() => window.__dakar.pos());
  check(`${label}: without a ticket the controller turns you back`, stopped && back.z < G.z, `${await toast()} · z ${back.z.toFixed(1)} < gate ${G.z.toFixed(1)}`);

  // 3. The ticket: price shown, confirmation, paid once, wallet line.
  const wallet0 = await d(() => window.__dakar.state.wallet);
  await d(g => window.__dakar.place(g.x - 5.2, g.z - 4.35, Math.PI), G);
  await page.waitForFunction(() => /Guichet/.test(window.__dakar.focus()?.name ?? ''), null, T).catch(() => {});
  const f = await d(() => window.__dakar.focus());
  check(`${label}: the ticket window offers the ticket with its price`, /Acheter un billet \(1\s000 F\)/.test((f?.all ?? []).join(' | ').replace(/[  ]/g, ' ')), f);
  await idle(); await d(() => window.__dakar.act());
  await page.waitForFunction(() => document.querySelector('#modal.on h2')?.textContent?.includes('Billet'), null, T).catch(() => {});
  const confirm = await d(() => ({ sub: document.querySelector('#modal.on p')?.textContent ?? '', items: [...document.querySelectorAll('#modal.on .item')].map(b => b.textContent) }));
  check(`${label}: the price is shown before paying`, /1\s000 F/.test(confirm.sub.replace(/[  ]/g, ' ')) && confirm.items.some(t => /Payer 1\s000 F/.test(t.replace(/[  ]/g, ' '))) && confirm.items.some(t => /Annuler/.test(t)), confirm);
  await shot('2-ticket-confirm', false);
  await page.locator('#modal.on .item', { hasText: 'Payer' }).first().click();
  await page.waitForFunction(() => window.__dakar.arena.info().ticket, null, T).catch(() => {});
  await waitToast(/Le guichetier : « 1 000 F, jërëjëf ! »/);
  const paid = await d(() => ({ wallet: window.__dakar.state.wallet, ledger: window.__dakar.state.data.ledger.at(-1), ticket: window.__dakar.arena.info().ticket }));
  check(`${label}: paid once, wallet line « Billet · gala de làmb · Arène de Pikine »`, paid.ticket && wallet0 - paid.wallet === 1000 && /Billet · gala de làmb · Arène de Pikine/.test(paid.ledger?.label ?? ''), paid);
  await idle(); await page.waitForTimeout(2800);
  await d(() => window.__dakar.act());
  const twice = await waitToast(/déjà ton billet/);
  check(`${label}: a second ticket is refused (already paid for tonight)`, twice && (await d(() => window.__dakar.state.wallet)) === paid.wallet, await toast());

  // 4. Through the gate: the controller lets ticket holders in.
  await d(g => window.__dakar.place(g.x, g.z - 2, 0), G);
  await page.waitForTimeout(800);
  await d(c => window.__dakar.place(c.x, c.z - 15, 0), C);
  const welcomed = await waitToast(/Le contrôleur : « Dalal ak jàmm ! »/);
  const inside = await d(() => window.__dakar.pos());
  check(`${label}: with a ticket you walk in (« Dalal ak jàmm ! »)`, welcomed && Math.hypot(inside.x - C.x, inside.z - C.z) < 17, `${await toast()} · ${Math.hypot(inside.x - C.x, inside.z - C.z).toFixed(1)} m from the ring`);

  // 5. A free place on the tiers: « S'asseoir », seated, the view faces the ring, the crowd around.
  const seat = await d(c => window.__dakar.arena.freeSeat(c.x + 9, c.z - 14), C);
  const r = Math.hypot(seat.x - C.x, seat.z - C.z), k = (r - 2.3) / r;
  await d(([c, s, k]) => window.__dakar.place(c.x + (s.x - c.x) * k, c.z + (s.z - c.z) * k, s.yaw + Math.PI), [C, seat, k]);
  await page.waitForFunction(() => window.__dakar.focus()?.kind === 'seat', null, T).catch(() => {});
  const fs1 = await d(() => window.__dakar.focus());
  check(`${label}: a free place on the tiers is offered from the ring side (« S’asseoir »)`, fs1?.name === 'Place en tribune' && /asseoir/.test(fs1.primary ?? ''), fs1);
  await d(() => window.__dakar.act());
  await page.waitForFunction(() => /arena:stand/.test(window.__dakar.seated() ?? ''), null, T).catch(() => {});
  await page.waitForFunction(() => window.__dakar.clip() === 'Sit', null, { timeout: 30000 }).catch(() => {});   // the pose blends in on the next frames
  const sat = await d(() => ({ seated: window.__dakar.seated(), clip: window.__dakar.clip() }));
  check(`${label}: seated on the tier, seated pose`, /arena:stand/.test(sat.seated ?? '') && sat.clip === 'Sit', sat);
  await page.waitForFunction(() => window.__dakar.arena.info().phase !== 'idle', null, T).catch(() => {});
  await page.waitForFunction(() => window.__dakar.arena.info().crowd.present > 0, null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1200);
  const cam = await d(() => window.__dakar.arena.cam());
  const toRing = { x: C.x - cam.x, z: C.z - cam.z }, len = Math.hypot(toRing.x, toRing.z), dirLen = Math.hypot(cam.dx, cam.dz);
  check(`${label}: the view from the seat frames the ring`, (cam.dx * toRing.x + cam.dz * toRing.z) / (len * dirLen) > 0.85 && cam.y > 1.5, cam);
  const s1 = await info();
  check(`${label}: the gala starts once seated; people are already in the stands`, s1.phase !== 'idle' && s1.crowd.present > 30 && /Gala de làmb/.test(s1.card), { phase: s1.phase, ...s1.crowd });
  const dcSeat = await ownDc();
  await shot('3-seated');

  // 5b. The preliminaries (src/arena/undercard.ts): the announcer names the first one, two young wrestlers walk out,
  //     a short seeded bout reaches its result while the stands fill; then on to the main event.
  await page.waitForFunction(() => { const i = window.__dakar.arena.info(); return i.phase === 'prelims' && i.prelims.stage === 'bout'; }, null, T).catch(() => {});
  const pr1 = await info(), tl1 = await d(() => window.__dakar.arena.timeline());
  check(`${label}: the preliminaries start soon after sitting down: the first bout on the sand, named on the card`,
    pr1.phase === 'prelims' && pr1.prelims.n >= 1 && pr1.prelims.stage === 'bout' && !!pr1.prelims.bout && /Préliminaires 1\//.test(pr1.card), { prelims: pr1.prelims, card: pr1.card, timeline: tl1 });
  await shot('3b-prelim');
  await d(() => window.__dakar.arena.speed(6));
  await page.waitForFunction(() => window.__dakar.arena.info().prelims.results.length >= 1, null, { timeout: 300000 }).catch(() => {});
  await d(() => window.__dakar.arena.speed(1));
  const pr2 = await info();
  check(`${label}: the first preliminary reaches its result, announced; the stands fuller than at the start`,
    /^Préliminaires : (.+ l’emporte (par chute|aux points)|match nul)\.$/.test(pr2.prelims.results[0] ?? '') && pr2.crowd.present > s1.crowd.present, { results: pr2.prelims.results, present: [s1.crowd.present, pr2.crowd.present], timeline: await d(() => window.__dakar.arena.timeline()) });
  await d(() => window.__dakar.arena.go('entrance'));                       // the remaining preliminaries skipped: the main event

  // 6. The wrestlers' entrance: drums and dances, the crowd stands (nearly full stands by now).
  await page.waitForFunction(() => { const i = window.__dakar.arena.info(); return i.phase === 'entrance' && i.t > 6.8; }, null, T).catch(() => {});
  const e1 = await info();
  check(`${label}: the wrestlers make their entrance (two wrestlers and their people, drums)`, e1.phase === 'entrance' && e1.entrance >= 2, e1);
  check(`${label}: the main event's entrance lands on nearly full stands`, e1.crowd.present >= e1.crowd.cap * 0.85, e1.crowd);
  await page.waitForFunction(() => window.__dakar.arena.info().crowd.cheering > 0, null, { timeout: 60000 }).catch(() => {});
  check(`${label}: the crowd reacts to the entrance`, (await info()).crowd.cheering > 0, (await info()).crowd);
  const dcShow = await ownDc();
  await shot('4-entrance');

  // 7. The bout: the existing duel played by the two wrestlers.
  await page.waitForFunction(() => window.__dakar.arena.info().phase === 'bout' && window.__dakar.arena.info().bout?.phase === 'fight', null, T).catch(() => {});
  const b1 = await info();
  check(`${label}: the bout starts (${L2 ? 'avec frappe, the two billed wrestlers, AI against AI' : 'lutte sans frappe'}, referee call, then the fight)`, b1.phase === 'bout' && !!b1.bout && b1.bout.mode === 'amical' && b1.bout.discipline === (L2 ? 'avec_frappe' : 'sans_frappe'), { phase: b1.bout?.phase, discipline: b1.bout?.discipline, identity: b1.bout?.identity });
  await page.waitForTimeout(2500);
  await shot('5-bout');
  await d(() => window.__dakar.arena.speed(6));
  await page.waitForFunction(() => ['result', 'leaving', 'over'].includes(window.__dakar.arena.info().phase), null, { timeout: 300000 }).catch(() => {});
  const r1 = await info();
  check(`${label}: the bout ends and the result is announced`, ['result', 'leaving', 'over'].includes(r1.phase) && /l’emporte|Match nul/.test(r1.result), r1.result);
  await d(() => window.__dakar.arena.speed(1));
  if (r1.phase === 'result') {
    check(`${label}: the crowd cheers the result`, r1.crowd.cheering > 0, r1.crowd);
    await shot('6-result');
  }
  if (L2) {
    // avec frappe: the referee raised the winner's arm, and at a fall the stands split (the winner's side celebrates)
    const lb = (await info()).lastBout;
    check(`${label}: avec frappe — the bout reached its result, the referee raised the winner's arm, the stands reacted to the fall`,
      !!lb && lb.discipline === 'avec_frappe' && !!lb.outcome && (!lb.winner || lb.refereeRaised === true) && (lb.outcome !== 'projection' || (lb.fallSplit?.celebrate > 0 && lb.fallSplit?.heads > 0)), lb);
  }

  // 8. The crowd goes home.
  await page.waitForFunction(() => window.__dakar.arena.info().phase === 'over', null, T).catch(() => {});
  const o1 = await info();
  check(`${label}: the stands empty and the gala is over for tonight`, o1.phase === 'over' && o1.crowd.present === 0 && o1.galaDone && o1.street === 'after', { phase: o1.phase, crowd: o1.crowd, galaDone: o1.galaDone, street: o1.street });
  await d(() => window.__dakar.act());                                            // « Se lever »
  await page.waitForFunction(() => !window.__dakar.seated(), null, T).catch(() => {});
  await d(g => window.__dakar.place(g.x + 6, g.z - 15, -0.35), G);
  await page.waitForTimeout(1500);
  const after = await info();
  check(`${label}: after the gala the gate no longer checks tickets and the stands stay empty`, after.street === 'after' && after.crowd.present === 0, { street: after.street, crowd: after.crowd });
  await shot('7-after', false);

  const dc = { gate: dcExt, seat: dcSeat, entrance: dcShow };
  const own = Math.max(dcExt.own, dcSeat.own, dcShow.own), all = Math.max(dcExt.all, dcSeat.all, dcShow.all);
  check(`${label}: the arena's own draw calls stay small (gate +${dcExt.own}, seat +${dcSeat.own}, entrance +${dcShow.own})`, own < (touch ? 60 : 160), dc);
  check(`${label}: draw calls of the whole frame stay within budget (max ${all})`, all < (touch ? 300 : 600), dc);
  check(`${label}: no page errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}

await browser.close();
fs.writeFileSync(`${out}/results${L2 ? '-lamb2' : ''}${view === 'all' ? '' : '-' + view}.json`, JSON.stringify({ when: new Date().toISOString(), base, results }, null, 2));
console.log(`\n${results.length - failed}/${results.length} arena visit checks passed`);
process.exit(failed ? 1 : 0);
