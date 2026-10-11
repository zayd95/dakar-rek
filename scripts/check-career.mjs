// Career checks (docs/CAREER.md): a bout's result means something — kept in the record, a purse for ranked bouts, the
// rank moving — the écurie drills feed the attributes, the phone shows the four gauges and the arena record, and it
// all survives a reload; a gala place makes the player tonight's main event (the bill and the posters name them; given
// up, the city's card is back). Desktop and phone portrait.
// Usage: node scripts/check-career.mjs [baseUrl] [outDir]   (needs a running build, e.g. `npx vite preview --port 4216`)
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:4216/';
const out = process.argv[3] ?? 'docs/screenshots/career';
fs.mkdirSync(out, { recursive: true });
const T = { timeout: 90000 };
const results = []; let failed = 0;
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${detail}`); };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
for (const [label, viewport, touch] of [['desktop', { width: 1280, height: 800 }, false], ['phone', { width: 390, height: 844 }, true]]) {
  const ctx = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'low'); } catch { /* private mode */ } });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}?debug${touch ? '&touch' : ''}`, { timeout: 120000 });
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub, null, T);
  const d = (fn, arg) => page.evaluate(fn, arg);
  const career = () => d(() => window.__dakar.career());

  // 1. A fresh life: no class to pick, the first rung, an empty record.
  await d(() => { localStorage.clear(); });
  await page.reload(); await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub, null, T);
  const c0 = await career();
  check(`${label}: a new life starts at « Petits combats » with an empty record`, c0.rank.label === 'Petits combats' && c0.record.bouts === 0 && c0.line === 'Pas encore de combat', JSON.stringify(c0.rank));
  check(`${label}: four gauges, never a career to choose`, c0.dims.map(x => x.label).join(',') === 'Forme,Richesse,Réputation,Influence', JSON.stringify(c0.dims.map(x => [x.label, x.score, x.level])));

  // 2. A ranked win pays a purse (wallet history line), moves the rank and is kept in the record.
  const w0 = await d(() => window.__dakar.state.wallet);
  const lines = await d(() => window.__dakar.careerBout('classe', 'player', 2, 'projection', 'Gora'));
  const c1 = await career(); const w1 = await d(() => window.__dakar.state.wallet);
  const ledger = await d(() => window.__dakar.state.data.ledger.at(-1));
  check(`${label}: a ranked win pays its purse once, with a wallet line`, w1 - w0 === c1.bouts[0].purse && c1.bouts[0].purse > 0 && /Cachet/.test(ledger?.label ?? ''), `${w0} → ${w1} · ${ledger?.label} · ${lines.join(' | ')}`);
  check(`${label}: the rank moves and the record keeps the bout`, c1.rank.score > c0.rank.score && c1.record.v === 1 && c1.bouts[0].opp === 'Gora', JSON.stringify(c1.rank));
  // a defeat costs a little and makes a rival; a friendly pays nothing
  await d(() => window.__dakar.careerBout('classe', 'opponent', 2, 'decision', 'Gora'));
  await d(() => window.__dakar.careerBout('amical', 'player', 1, 'projection', 'Pape'));
  const c2 = await career();
  check(`${label}: a defeat lowers the purse and the points, never to zero; a rivalry appears`, c2.bouts[1].purse < c2.bouts[0].purse && c2.bouts[1].pts < 0 && c2.rank.score > 0 && c2.record.rival?.name === 'Gora', JSON.stringify(c2.record.rival));
  check(`${label}: a friendly bout pays nothing`, c2.bouts[2].purse === 0 && c2.bouts[2].mode === 'amical');
  // the city's ladder: twelve named wrestlers, a belt, a real card; the ranked bout faces one of them; the public record
  const lad = await d(() => window.__dakar.careerLadder());
  check(`${label}: the city's ladder names its wrestlers, the belt and the evening's card`, lad.table.length === 12 && !!lad.title.holder && lad.table.some(s => s.name === lad.card.left.name) && lad.card.left.name !== lad.card.right.name,
    `${lad.card.left.name} – ${lad.card.right.name} · ceinture ${lad.title.holder}`);
  check(`${label}: the public record line under the name follows the ranked bouts`, new RegExp(`^${c2.rank.label} · 1-1( · Écurie \\p{L}+)?$`, 'u').test(c2.rec ?? ''), String(c2.rec));

  // 3. The real bout path: a ranked bout started and abandoned goes through main.ts into the record (no purse).
  await d(() => { window.__dakar.teleport('pikine'); });
  await page.waitForFunction(() => window.__dakar.pos().hub === 'pikine', null, T);
  await d(() => window.__dakar.duelStart('classe'));
  await page.waitForFunction(() => window.__dakar.duelInfo(), null, T).catch(() => {});
  await d(() => window.__dakar.duelAbandon(true));
  await page.waitForFunction(() => window.__dakar.duelInfo()?.phase === 'result', null, T).catch(() => {});
  await d(() => window.__dakar.duelFinish());
  await page.waitForFunction(() => !window.__dakar.sceneInfo?.() && !window.__dakar.duelInfo(), null, T).catch(() => {});
  const c3 = await career();
  const toast = await d(() => document.getElementById('toast')?.textContent ?? '');
  check(`${label}: a real bout's end reaches the record (abandon, no purse)`, c3.bouts.length === 4 && c3.bouts[3].res === 'A' && c3.bouts[3].purse === 0, `${JSON.stringify(c3.bouts[3])} · ${toast}`);

  // 4. Écurie drills sit with Coach Ablaye's session and feed the attributes.
  const ecurie = (await d(() => window.__dakar.interactables())).find(i => i.id.endsWith(':ecurie'));
  if (ecurie) {
    await d(() => { const s = window.__dakar.state; s.data.needs.energie = 90; if (!s.data.flags.includes('ecurie_baobab')) s.data.flags.push('ecurie_baobab'); });
    await d(p => window.__dakar.place(p.x, p.z + 1, Math.PI), ecurie);
    await page.waitForFunction(() => /:ecurie$/.test(window.__dakar.focus()?.id ?? ''), null, T).catch(() => {});
    const f = await d(() => window.__dakar.focus());
    check(`${label}: the écurie offers the drills (sac de frappe, saisies, gainage)`, ['Sac de frappe', 'Travail des saisies', 'Gainage et pompes'].every(x => f?.all?.includes(x)), JSON.stringify(f?.all));
    const before = (await career()).attrs.frappe;
    await d(() => window.__dakar.act());
    await page.waitForFunction(() => document.querySelector('#modal.on'), null, T).catch(() => {});
    await page.locator('#modal .item', { hasText: 'Sac de frappe' }).first().click();
    await page.waitForFunction(() => (window.__dakar.state.data.counters.entr_frappe ?? 0) >= 1 && window.__dakar.pos().mode === 'play', null, T).catch(() => {});
    const after = (await career()).attrs.frappe;
    check(`${label}: the punching bag raises Frappe`, after > before, `${before} → ${after}`);
  } else check(`${label}: Pikine has the écurie`, false);

  // 5. The phone: the profile card and the arena record.
  await d(() => window.__dakar.phone('profil'));
  await page.waitForFunction(() => document.querySelector('#phone.on .ph-dims'), null, T).catch(() => {});
  const dims = await d(() => [...document.querySelectorAll('#phone .ph-dims > div')].map(e => e.textContent));
  check(`${label}: the phone's profile shows the four gauges`, dims.length === 4 && /Forme/.test(dims[0]) && /Influence/.test(dims[3]), dims.join(' | '));
  await page.waitForTimeout(300); await page.screenshot({ path: `${out}/${label}-profile.png`, timeout: 120000 });
  await d(() => window.__dakar.phone('arene'));
  await page.waitForTimeout(300);
  const arena = await d(() => document.querySelector('#phone .ph-screen')?.textContent ?? '');
  check(`${label}: the arena app shows rank, record, rivalry and purses`, ['Rang', 'Palmarès', 'Rivalité', 'Plus gros cachet', 'Physique'].every(x => arena.includes(x)), arena.slice(0, 160));
  await page.screenshot({ path: `${out}/${label}-arena.png`, timeout: 120000 });
  await d(() => window.__dakar.phoneClose());

  // 6b. A fight night in the world: the open bout for anyone, the poster, people outside, the rank on the way out.
  if (await d(() => typeof window.__dakar.poster === 'function')) {
    await d(() => { window.__dakar.setHour(18); window.__dakar.teleport('pikine'); });
    await page.waitForFunction(() => window.__dakar.pos().hub === 'pikine', null, T);
    const arena = await d(() => window.__dakar.careerArena());
    const spot = (r, side = 0) => ({ x: arena.cx + side, z: arena.cz - r });
    // the arena's door: « Petit combat de quartier » is offered even without an écurie, and starts a real bout
    await d(() => { const s = window.__dakar.state.data; s.flags = s.flags.filter(f => f !== 'ecurie_baobab'); s.needs.energie = 90; });
    const door = (await d(() => window.__dakar.interactables())).find(i => i.id.endsWith(':arena'));
    if (door) {
      await d(p => window.__dakar.place(p.x, p.z - 1, 0), door);
      await page.waitForFunction(() => /:arena$/.test(window.__dakar.focus()?.id ?? ''), null, T).catch(() => {});
      const f = await d(() => window.__dakar.focus());
      check(`${label}: the arena offers an open bout to anyone (« Combat du soir » / « Petit combat de quartier »)`, (f?.all ?? []).some(x => /Petit combat de quartier|Combat du soir/.test(x)), JSON.stringify(f?.all));
      await d(() => window.__dakar.act());
      await page.waitForFunction(() => document.querySelector('#modal.on'), null, T).catch(() => {});
      await page.locator('#modal .item', { hasText: /Petit combat de quartier|Combat du soir/ }).first().click();
      // not the duel at once: the fighter's evening (« Entrée des lutteurs » → tunnel → corner → ring → duel)
      const called = await page.waitForFunction(() => window.__dakar.fighter?.().phase === 'called', null, { timeout: 20000 }).then(() => true, () => false);
      const fb = await d(() => window.__dakar.fighter?.());
      check(`${label}: the open bout sends the player to the wrestlers' entrance (ranked, against the ranked opponent)`, called && fb.bout?.mode === 'classe' && !!fb.bout?.opponent, JSON.stringify(fb?.bout));
      const sp = fb?.spots;
      if (called && sp) {
        await d(p => window.__dakar.place(p.x, p.z, Math.PI), sp.tunnel);
        await page.waitForFunction(() => window.__dakar.fighter().phase === 'tunnel', null, { timeout: 20000 }).catch(() => {});
        await d(p => window.__dakar.place(p.x, p.z, 0), sp.corner);
        await page.waitForFunction(() => window.__dakar.fighter().phase === 'ring', null, { timeout: 60000 }).catch(() => {});
        await d(p => window.__dakar.place(p.x, p.z, 0), sp.ring);
        const fought = await page.waitForFunction(() => window.__dakar.duelInfo(), null, { timeout: 30000 }).then(() => true, () => false);
        check(`${label}: at the ring the ranked bout starts, the same evening`, fought, JSON.stringify(await d(() => window.__dakar.fighter())));
        if (fought) {
          const n0 = (await career()).bouts.length;
          await d(() => window.__dakar.duelAbandon(true));
          await page.waitForFunction(() => window.__dakar.duelInfo()?.phase === 'result', null, T).catch(() => {});
          await d(() => window.__dakar.duelFinish());
          await page.waitForFunction(() => !window.__dakar.duelInfo(), null, T).catch(() => {});
          check(`${label}: the fighter's bout reaches the record`, (await career()).bouts.length === n0 + 1);
        }
      }
      await d(() => window.__dakar.fighterCancel?.());
    } else check(`${label}: Pikine has the arena`, false);
    // a win: the poster carries the name, people by the gate talk about it, the rank is said on the way out
    await d(() => window.__dakar.careerBout('classe', 'player', 1, 'projection', 'Pape'));
    await page.waitForFunction(() => /VAINQUEUR/.test(window.__dakar.poster()), null, { timeout: 15000 }).catch(() => {});
    check(`${label}: the arena's poster carries the winner's name`, /VAINQUEUR\|[^|]+\|a battu Pape/.test(await d(() => window.__dakar.poster())), await d(() => window.__dakar.poster()));
    const city = await d(() => window.__dakar.posters?.() ?? null);
    if (city) check(`${label}: the city's fight posters print the result`, JSON.stringify(city).includes('bat Pape, victoire par chute'), JSON.stringify(city).slice(0, 200));
    await d(() => { window.__dakar.state.data.playedMs += 10000; });
    await d(p => window.__dakar.place(p.x, p.z, Math.PI), spot(26 + 5, -3));
    const heard = await page.waitForFunction(() => /Un supporter/.test(document.getElementById('toast')?.textContent ?? ''), null, { timeout: 20000 }).then(() => true, () => false);
    check(`${label}: people outside the arena talk about the result`, heard, await d(() => document.getElementById('toast')?.textContent ?? ''));
    await page.screenshot({ path: `${out}/${label}-poster.png`, timeout: 120000 });
    await d(p => window.__dakar.place(p.x, p.z, Math.PI), spot(60, 6));
    const said = await page.waitForFunction(() => /Classement/.test(document.getElementById('toast')?.textContent ?? ''), null, { timeout: 20000 }).then(() => true, () => false);
    check(`${label}: the rank change is said on the way out`, said, await d(() => document.getElementById('toast')?.textContent ?? ''));
  } else console.log(`${label}: fight-night checks skipped (build without them)`);

  // 6. The story persists: reload and everything is there.
  const n = (await career()).bouts.length;
  await page.reload(); await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub, null, T);
  const c6 = await career();
  check(`${label}: the record survives a reload`, c6.bouts.length === n && c6.record.rival?.name === 'Gora', `${c6.bouts.length}/${n}`);
  check(`${label}: no page errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();

  // 7. A gala place makes the player tonight's main event (src/arena/myGala.ts): the bill, the posters and the phone's
  // « Ce soir » name them against their opponent, their corner is the one the ceremony gives their side; given up, the
  // city's card comes back. A fresh life on a gala evening: the city clock at the start of a Saturday (offline, the
  // clock is the device's; one city day = 24 real minutes).
  {
    const ME = 'Moussa';
    const at = (() => { const E = Date.UTC(2026, 9, 6), D = 24 * 60 * 1000; let day = Math.floor((Date.now() - E) / D) + 2; while (day % 7 !== 5) day++; return E + (day - 1) * D + 60000; })();
    const gctx = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
    await gctx.addInitScript(([at, me]) => {
      try { localStorage.setItem('dakarrek.quality', 'low'); localStorage.setItem('dakarrek.presence.profile', JSON.stringify({ name: me, look: 0 })); } catch { /* private mode */ }
      const real = Date.now.bind(Date), off = at - real(); Date.now = () => real() + off;
    }, [at, ME]);
    const gp = await gctx.newPage();
    const gerr = []; gp.on('pageerror', e => gerr.push(e.message));
    await gp.goto(`${base}?debug${touch ? '&touch' : ''}`, { timeout: 120000 });
    await gp.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.careerSign, null, T);
    const g = (fn, arg) => gp.evaluate(fn, arg);
    await g(() => { window.__dakar.teleport('pikine'); });
    await gp.waitForFunction(() => window.__dakar.pos().hub === 'pikine', null, T);
    await g(() => { const D = window.__dakar; D.setHour(19); D.state.data.needs.energie = 90; });
    const before = await g(() => window.__dakar.careerLadder());
    const signedG = await g(() => window.__dakar.careerSign('gala'));
    const [lg, fg, pg] = [await g(() => window.__dakar.careerLadder()), await g(() => window.__dakar.fighter()), await g(() => window.__dakar.posters?.() ?? null)];
    const opp = fg.bout?.opponent, oppEc = lg.card.right.ecurie;
    check(`${label}: a gala place: the bill names the player against their opponent (no belt), the fighter's path is their main event`,
      signedG?.kind === 'gala' && lg.card.left.id === 'player' && lg.card.left.name === ME && lg.card.right.name === opp && !lg.card.title && fg.bout?.main === 'gala' && fg.phase === 'called',
      JSON.stringify({ signed: signedG, card: lg.card, bout: fg.bout }));
    check(`${label}: the city's posters print their bill tonight`, !pg || pg.lines.title.startsWith(ME.toUpperCase()), JSON.stringify(pg?.lines));
    // their corner: never their opponent's écurie's (an independent facing a Baobab man takes Teranga's, and the reverse)
    check(`${label}: their corner is the one the ceremony gives their side`, fg.bout?.ecurie !== (oppEc === 'Baobab' ? 'baobab' : oppEc === 'Teranga' ? 'teranga' : '-'), JSON.stringify({ corner: fg.bout?.ecurie, opponent: lg.card.right }));
    const again = await g(() => window.__dakar.careerSign('gala')), toastG = await g(() => document.getElementById('toast')?.textContent ?? '');
    check(`${label}: a second sign-up the same evening is refused`, JSON.stringify(again) === JSON.stringify(signedG) && /déjà prévu/.test(toastG) && (await g(() => window.__dakar.fighter())).bout?.opponent === opp, toastG.slice(0, 160));
    // given up before the arena: the sign-up is forgotten, the city's card is back on the bill and the posters
    await g(() => window.__dakar.fighterCancel());
    const back = await gp.waitForFunction(() => window.__dakar.careerLadder().card.left.id !== 'player', null, { timeout: 20000 }).then(() => true, () => false);
    const la = await g(() => window.__dakar.careerLadder());
    check(`${label}: given up, the sign-up is forgotten and the city's card is the bill again`, back && !la.signed && la.card.left.id === before.card.left.id && la.card.right.id === before.card.right.id, JSON.stringify(la.card));
    check(`${label}: no page errors (gala evening)`, gerr.length === 0, gerr.join(' | '));
    await gctx.close();
  }
}
await browser.close();
fs.writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 2));
console.log(`\n${results.length - failed}/${results.length} career checks passed`);
process.exit(failed ? 1 : 0);
