// The people of a fight night inside the Pikine arena (src/arena/people.ts): officials at the ring side (judges on their
// chairs, the officials' table, the announcer, the referee), the drummers' group, vendors walking the front of the stands
// (and selling to you), each wrestler's entourage walking in, waiting in its corner, running to the winner. Desktop
// (medium) and phone (low). Usage: flock /tmp/dakar-browser.lock node scripts/check-arena-people.mjs [baseUrl] [outDir] [--view=desktop|phone]
import { chromium } from 'playwright';
import fs from 'node:fs';

const args = process.argv.slice(2);
const base = args.find(a => !a.startsWith('--')) ?? 'http://localhost:4212/';
const out = args.filter(a => !a.startsWith('--'))[1] ?? 'docs/screenshots/arena-people';
const view = args.find(a => a.startsWith('--view='))?.slice(7) ?? 'all';
fs.mkdirSync(out, { recursive: true });
const T = { timeout: 180000 };
const results = []; let failed = 0;
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`); };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const VIEWS = [['desktop', { width: 1280, height: 720 }, false, 'medium'], ['phone', { width: 390, height: 844 }, true, 'low']].filter(([l]) => view === 'all' || l === view);
for (const [label, viewport, touch, quality] of VIEWS) {
  const ctx = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
  await ctx.addInitScript(q => { if (!sessionStorage.getItem('arena-people')) { localStorage.clear(); localStorage.setItem('dakarrek.quality', q); sessionStorage.setItem('arena-people', '1'); } }, quality);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}?debug${touch ? '&touch' : ''}`, { timeout: 180000 });
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.arena, null, T);
  const d = (fn, arg) => page.evaluate(fn, arg);
  const info = () => d(() => window.__dakar.arena.info());
  const people = async () => (await info()).people;
  const until = (fn, arg, ms = 120000) => page.waitForFunction(fn, arg, { timeout: ms, polling: 250 }).then(() => true, () => false);
  const frame = () => d(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
  const shot = async name => { await page.waitForTimeout(700); try { await page.screenshot({ path: `${out}/${label}-${name}.png`, timeout: 180000 }); } catch (e) { console.log(`NOTE: ${name} skipped (${String(e.message).split('\n')[0]})`); } };
  const cam = (p, t) => d(([p, t]) => window.__dakar.cam(p, t), [p, t]);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

  // 1. A fight evening, doors open: the officials at their table, two drummers warming up, vendors walking the stands
  await d(() => { window.__dakar.teleport('pikine'); window.__dakar.setHour(18); window.__dakar.state.data.wallet = 5000; window.__dakar.state.data.needs.energie = 60; });
  await until(() => window.__dakar.pos().hub === 'pikine' && !!window.__dakar.arena.info());
  await d(() => { const x = window.__dakar; if (!x.arenaOut || !x.arenaOutDay) return; const t = x.arenaOut().day, fri = t + ((4 - (((t % 7) + 7) % 7)) + 7) % 7; x.arenaOutDay(fri); x.arena.day(fri); });
  await until(() => window.__dakar.arena.info()?.street === 'doors' && window.__dakar.arena.info().people.moment === 'doors');
  const a0 = await info(), C = a0.centre, G = a0.gate;
  await d(dd => { window.__dakar.state.data.counters.arena_ticket_day = dd; }, a0.day);   // tonight's ticket (the visit's check buys it): the controller lets us in
  await d(c => window.__dakar.place(c.x - 4, c.z - 8, 0.6), C);                       // inside, on the ring side
  await page.waitForTimeout(1500);
  let p = await people();
  const nOff = touch ? 2 : 3;
  check(`${label}: doors open — the officials are seated at their table and the announcer stands by it`, p.officials === nOff && p.announcer && p.seats.filter(s => /officiel/.test(s.id) && s.occupant).length === nOff, p);
  check(`${label}: doors open — two drummers warm up on their deck, a helper readies each écurie's corner, the press is there; no judges, no referee, no entourage yet`,
    p.drummers === 2 && p.camp === 2 && p.press === (touch ? 1 : 3) && p.judges === 0 && !p.referee && p.entourage.every(e => e.people.every(x => !x.shown)), p);
  const v0 = p.vendors.map(v => ({ ...v }));
  await until(v0 => window.__dakar.arena.info().people.vendors.some((v, i) => v.shown && Math.hypot(v.x - v0[i].x, v.z - v0[i].z) > 0.3), v0, 60000);
  p = await people();
  const moved = p.vendors.filter((v, i) => v.shown && dist(v, v0[i]) > 0.3).length;
  check(`${label}: vendors walk the front of the stands`, p.vendors.length === (touch ? 1 : 2) && p.vendors.every(v => v.shown) && moved >= 1, p.vendors);
  await cam([C.x + 4, 3.2, C.z - 2], [C.x + 13.2, 1.0, C.z + 2]); await shot('1-officials-table'); await d(() => window.__dakar.cam(null));

  // 2. Buying from a vendor who stops by you
  const v = p.vendors[0];
  const a = Math.atan2(v.x - C.x, v.z - C.z);
  await d(([c, a]) => window.__dakar.place(c.x + Math.sin(a) * 15.6, c.z + Math.cos(a) * 15.6, a), [C, a]);
  const stopped = await until(() => { const v = window.__dakar.arena.info().people.vendors[0]; return v.pause > 0 && /vendeu/.test(window.__dakar.focus()?.name ?? ''); }, null, 60000);
  const fv = await d(() => window.__dakar.focus());
  check(`${label}: a vendor stops by you and offers what he sells`, stopped && fv?.all.length >= 1, fv);
  await cam([C.x + Math.sin(a) * 13.8, 1.9, C.z + Math.cos(a) * 13.8], [C.x + Math.sin(a) * 16.8, 1.3, C.z + Math.cos(a) * 16.8]); await shot('2-vendor'); await d(() => window.__dakar.cam(null));
  const w0 = await d(() => ({ w: window.__dakar.state.wallet, n: window.__dakar.state.data.counters['arene:achats'] ?? 0 }));
  await d(() => window.__dakar.act());
  await until(() => !window.__dakar.activity() && window.__dakar.state.wallet < 5000, null, 60000);
  const w1 = await d(() => ({ w: window.__dakar.state.wallet, n: window.__dakar.state.data.counters['arene:achats'] ?? 0 }));
  check(`${label}: bought from the vendor at the stalls' price, counted with the evening's purchases`, [50, 150, 200].includes(w0.w - w1.w) && w1.n === w0.n + 1, { spent: w0.w - w1.w, purchases: w1.n });

  // 3. The judges', officials' and press chairs stay theirs, even before the judges come (no passer-by nor the player sits there)
  const kept = await d(() => window.__dakar.seatsHere().filter(s => /arena:(juge|officiel|presse)/.test(s.id)).map(s => ({ id: s.id, occupant: s.occupant })));
  check(`${label}: the judges', officials' and press chairs are kept for them (never a passer-by's or the player's)`,
    kept.length === nOff + (touch ? 2 : 3) + (touch ? 1 : 2) && kept.every(s => /^pikine:arena:people:(juge|officiel|presse)/.test(s.occupant ?? '')), kept);

  // 4. Seated on the tiers, the gala: filling → the judges and the referee at the ring
  const seat = await d(c => window.__dakar.arena.freeSeat(c.x + 9, c.z - 14), C);
  await d(s => window.__dakar.sit(s.id), seat);
  await until(() => /arena:stand/.test(window.__dakar.seated() ?? '') && window.__dakar.arena.info().phase !== 'idle');
  await until(() => window.__dakar.arena.info().people.moment === 'filling' || window.__dakar.arena.info().phase === 'entrance', null, 30000);
  p = await people();
  const nJ = touch ? 2 : 3;
  check(`${label}: the gala begins — the judges sit at the sandbags and the referee waits in the ring`, p.judges === nJ && p.referee && p.seats.filter(s => /juge/.test(s.id) && s.occupant).length === nJ, p);

  // 5. The entrance: each entourage walks in behind its wrestler; the whole drummers' group plays
  await until(() => { const i = window.__dakar.arena.info(); return i.phase === 'entrance' && i.t > 5; });
  p = await people();
  const nDr = touch ? 3 : 5, nEn = touch ? 1 : 2;
  check(`${label}: the entrance — the drummers' group plays with its dancer(s), the entourages walk out of the tunnel behind their wrestler`,
    p.drummers === nDr && p.entourage.every(e => e.people.length === nEn) && p.entourage.some(e => e.started && e.people.some(x => x.walking)), p.entourage);
  const dcAll = await (async () => { await frame(); const all = await d(() => window.__dakar.drawCalls()); await d(() => window.__dakar.arena.visible(false)); await frame(); const none = await d(() => window.__dakar.drawCalls()); await d(() => window.__dakar.arena.visible(true)); await frame(); return { all, arena: all - none }; })();
  check(`${label}: draw calls of the whole frame stay within budget during the entrance (${dcAll.all}, arena and its people +${dcAll.arena})`, dcAll.all < (touch ? 300 : 600), dcAll);
  await shot('3-entrance-seat');
  await cam([C.x - 4, 3.2, C.z + 4], [C.x + 1, 1.2, C.z + 15]); await shot('3b-tunnel');
  await cam([C.x + 1.5, 3.2, C.z + 6], [C.x + 6.5, 1.0, C.z + 13]); await shot('4-drummers'); await d(() => window.__dakar.cam(null));

  // 6. The bout: the entourages in their corners, our referee gives way to the duel's own
  await d(() => window.__dakar.arena.speed(3));
  await until(() => window.__dakar.arena.info().phase === 'bout');
  await until(() => window.__dakar.arena.info().people.entourage.every(e => e.people.every(x => !x.walking)), null, 90000);
  p = await people();
  const CORNER = [[0, 12.95], [-0.78, 12.95], [0.78, 12.95], [-0.6, 13.6]];                     // src/world/arenaModules.ts cornerSpots
  const corner = (side, k) => { const [o, r] = CORNER[k], a = side * (0.78 + o / r); return { x: C.x + Math.sin(a) * r, z: C.z + Math.cos(a) * r }; };
  const inCorner = p.entourage.every(e => e.people.every((x, k) => dist(x, corner(e.side, k)) < 0.5));
  check(`${label}: the bout — each entourage waits in its corner; the referee is the duel's`, (await info()).phase === 'bout' && inCorner && !p.referee && p.judges === nJ, p.entourage);
  await d(() => window.__dakar.arena.speed(1));
  await cam([C.x + 3, 3.6, C.z + 2], [C.x + 9.5, 0.9, C.z + 9.8]); await shot('5-bout-corner'); await d(() => window.__dakar.cam(null));

  // 7. The result: the winner's people run to the ring and celebrate
  await d(() => window.__dakar.arena.speed(6));
  await until(() => ['result', 'leaving', 'over'].includes(window.__dakar.arena.info().phase), null, 300000);
  await d(() => window.__dakar.arena.speed(1));
  const r1 = await info();
  if (r1.phase === 'result') {
    p = r1.people;
    const winners = p.won ? p.entourage.find(e => e.ecurie === p.won) : null;
    if (winners) {
      await until(w => window.__dakar.arena.info().phase !== 'result' || window.__dakar.arena.info().people.entourage.find(e => e.ecurie === w).people.every(x => !x.walking), p.won, 240000);
      const now = await info(), win = now.people.entourage.find(e => e.ecurie === p.won);
      const near = win.people.every(x => Math.hypot(x.x - C.x, x.z - C.z) < 4.5);
      check(`${label}: the result — the winner's people run onto the sand to celebrate`, now.phase !== 'result' || (near && win.people.every(x => x.clip === 'Celebrate')), win.people);
      if (now.phase === 'result') { await cam([C.x - 5, 3.5, C.z - 6], [C.x, 1.0, C.z]); await shot('6-result'); await d(() => window.__dakar.cam(null)); }
    } else check(`${label}: the result — a draw: both entourages stay in their corners`, p.entourage.every(e => e.people.every(x => x.shown)), p);
  } else check(`${label}: the result phase was seen`, false, r1.phase);

  // 8. The evening ends: everybody goes; the chairs are free again
  await d(() => window.__dakar.arena.speed(3));
  await until(() => window.__dakar.arena.info().phase === 'over', null, 120000);
  await page.waitForTimeout(1200);
  p = await people();
  check(`${label}: the gala is over — the officials, drummers, vendors and entourages are gone, their chairs kept for the next gala`,
    p.moment === 'closed' && p.officials === 0 && p.judges === 0 && p.drummers === 0 && p.press === 0 && p.camp === 0 && p.vendors.every(x => !x.shown) && p.entourage.every(e => e.people.every(x => !x.shown)) && p.seats.every(s => /^pikine:arena:people:/.test(s.occupant ?? '')), p);
  // 9. The player fights tonight (src/arena/fighter.ts): their écurie's people wait in its corner and gather round them
  if (await d(() => !!window.__dakar.fighterBegin)) {
    if (await d(() => !!window.__dakar.seated())) { await d(() => window.__dakar.act()); await until(() => !window.__dakar.seated(), null, 30000); }   // « Se lever » off the tiers
    await d(() => window.__dakar.fighterBegin('amical'));
    await frame(); await frame();                                                       // the path's spots follow the player's écurie
    const f0 = await d(() => window.__dakar.fighter());
    const tun = f0.spots?.tunnel, cor = f0.spots?.corner;
    if (tun && cor && f0.bout) {
      await d(t => window.__dakar.place(t.x, t.z, Math.PI), tun);
      await until(() => window.__dakar.fighter().phase === 'tunnel', null, 30000);
      await d(c => window.__dakar.place(c.x, c.z + 0.05, Math.PI), cor);
      await until(() => window.__dakar.fighter().phase === 'prep', null, 30000);
      await until(e => window.__dakar.arena.info().people.entourage.find(x => x.ecurie === e).people.every(x => x.shown), f0.bout.ecurie, 20000);
      p = await people();
      const mine = p.entourage.find(e => e.ecurie === f0.bout.ecurie), other = p.entourage.find(e => e.ecurie !== f0.bout.ecurie);
      check(`${label}: fighting tonight — in the corner, the écurie's people gather round the player and turn to them; the other écurie's stay away`,
        p.fighter === f0.bout.ecurie && mine.people.every(x => x.shown && Math.hypot(x.x - cor.x, x.z - cor.z) < 1.5) && p.camp >= 1 && other.people.every(x => !x.shown), { fighter: p.fighter, corner: cor, mine: mine.people });
      await cam([cor.x - Math.sign(cor.x - C.x) * 3.2, 2.6, cor.z - 3.4], [cor.x, 1.0, cor.z]); await shot('7-fighter-corner'); await d(() => window.__dakar.cam(null));
      await d(() => window.__dakar.fighterCancel());
      await until(() => !window.__dakar.arena.info().people.fighter, null, 20000);
      p = await people();
      check(`${label}: the bout given up, the corner empties again`, !p.fighter && p.entourage.every(e => e.people.every(x => !x.shown)), p.entourage);
    } else check(`${label}: the fighter's path has its spots`, false, f0);
  }
  check(`${label}: no page errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}
await browser.close();
fs.writeFileSync(`${out}/results${view === 'all' ? '' : '-' + view}.json`, JSON.stringify({ when: new Date().toISOString(), base, results }, null, 2));
console.log(`\n${results.length - failed}/${results.length} arena people checks passed`);
process.exit(failed ? 1 : 0);
