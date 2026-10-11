// Checks of the fighter's evening (src/arena/fighter.ts): a bout tonight sends the player to « Entrée des lutteurs »,
// through the wrestlers' tunnel (no ticket needed) to the écurie's corner, a short moment there (drums louder), on cue to
// the ring's edge, the existing duel (abandoned here: the duel's own checks cover the bout), then back out through the
// tunnel. Then the player's own gala night (src/arena/myGala.ts): a gala place makes them tonight's main event — the bill
// and the posters name them, the preliminaries run while their corner is held, the ceremony is theirs (announcer with
// their record, griot, people), « Faire ton bàkk » on the walk-out, their duel, their real result as the show's, and
// their presence (arena.m = 1, in the ring in a fighting stance). Desktop 1280×800 (medium) and phone 390×844 (low, touch).
// The city clock is moved to the start of a Saturday (a gala evening, Friday–Sunday) for the whole page: the gala place
// is only offered on fight evenings. The fighter's first path does not depend on the day.
// LAMB2=1: with ?lamb2 their main event is fought avec frappe (labels and results suffixed -lamb2).
// Usage: flock /tmp/dakar-browser.lock node scripts/check-arena-fighter.mjs [baseUrl] [outDir]. ONLY=desktop|phone.
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:4234/';
const out = process.argv[3] ?? 'docs/screenshots/arena-fighter';
fs.mkdirSync(out, { recursive: true });
const SLOW = Number(process.env.SLOW ?? 3);
const WALL_R = 21.7;
const L2 = process.env.LAMB2 === '1';
const ME = 'Moussa';
const results = []; let failed = 0;
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail: String(detail).slice(0, 300) }); if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${String(detail).slice(0, 300)}`); };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
for (const [label0, viewport, touch, quality] of [['desktop', { width: 1280, height: 800 }, false, 'medium'], ['phone', { width: 390, height: 844 }, true, 'low']]) {
  if (process.env.ONLY && process.env.ONLY !== label0) continue;
  const label = L2 ? `${label0}-lamb2` : label0;
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch });
  await context.addInitScript(([q, me]) => { try { localStorage.setItem('dakarrek.quality', q); localStorage.setItem('dakarrek.presence.profile', JSON.stringify({ name: me, look: 0 })); } catch { /* */ } }, [quality, ME]);
  // the city clock (src/core/clock.ts: one city day = 24 real minutes, day 1 = 2026-10-06 UTC) at the start of the next
  // Saturday, one minute in: a gala evening for the next 47 minutes (offline, the city clock is the device's)
  const at = (() => { const E = Date.UTC(2026, 9, 6), D = 24 * 60 * 1000; let day = Math.floor((Date.now() - E) / D) + 2; while (day % 7 !== 5) day++; return E + (day - 1) * D + 60000; })();
  await context.addInitScript(at => { const real = Date.now.bind(Date), off = at - real(); Date.now = () => real() + off; }, at);
  const page = await context.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}?debug${touch ? '&touch' : ''}${L2 ? '&lamb2' : ''}`, { timeout: 120000 });
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.fighter, null, { timeout: 120000 * SLOW });
  const d = (fn, arg) => page.evaluate(fn, arg);
  const until = (fn, arg, timeout = 60000) => page.waitForFunction(fn, arg, { timeout: timeout * SLOW, polling: 250 }).then(() => true).catch(() => false);
  const shot = async name => {
    await page.waitForTimeout(800);
    try { await page.screenshot({ path: `${out}/${label}-${name}.png`, timeout: 120000 * SLOW }); }
    catch (e) { console.log(`NOTE: capture ${label}-${name} skipped (${String(e.message).split('\n')[0]})`); }
  };
  const fi = () => d(() => window.__dakar.fighter());
  const walk = async (pred, arg, ms = 30000) => { await page.keyboard.down('KeyW'); const ok = await until(pred, arg, ms); await page.keyboard.up('KeyW'); return ok; };

  // the evening (19 h: doors open, the gate checks tickets) — the player has no ticket and fights tonight
  await d(() => { window.__dakar.teleport('pikine'); window.__dakar.setHour(19); window.__dakar.state.data.needs.energie = 100; delete window.__dakar.state.data.counters.arena_ticket_day; });
  await until(() => window.__dakar.pos().hub === 'pikine' && window.__dakar.fighter().spots);
  const began = await d(() => window.__dakar.fighterBegin('amical', 'costaud'));
  let f = await fi();
  const s = f.spots, cz = s.ring.z - 10.4, cx = s.ring.x;
  check(`${label}: a bout tonight sends the player to « Entrée des lutteurs »`, began && f.phase === 'called' && (await d(() => window.__dakar.destination())) === 'pikine:arena:lutteurs', JSON.stringify({ phase: f.phase, dest: await d(() => window.__dakar.destination()) }));

  // at the wrestlers' gate
  await d(([x, z]) => window.__dakar.place(x, z, Math.PI), [s.gate.x, s.gate.z + 0.9]);
  const atGate = await until(() => /pikine:arena:lutteurs/.test(window.__dakar.focus()?.id ?? ''), null, 20000);
  const fg = await d(() => window.__dakar.focus());
  check(`${label}: « Entrée des lutteurs » offers to go in`, atGate && fg.primary === 'Entrer · Entrée des lutteurs', JSON.stringify(fg));
  await d(([p, t]) => window.__dakar.cam(p, t), [[cx + 6, 3, s.gate.z + 9], [cx, 2.6, cz + WALL_R]]); await shot('fighters-gate'); await d(() => window.__dakar.cam(null));
  await d(() => window.__dakar.act());
  const inTunnel = await until(() => window.__dakar.fighter().phase === 'tunnel', null, 15000);
  check(`${label}: through the gate into the wrestlers' tunnel, marker on the corner`, inTunnel && (await d(() => window.__dakar.destination())) === 'pikine:arena:coin', JSON.stringify(await d(() => window.__dakar.pos())));
  // walking down the tunnel: no ticket needed (the gate's controller lets tonight's wrestler in)
  const through = await walk(z => window.__dakar.pos().z < z, cz + 15.5, 30000);
  const p1 = await d(() => window.__dakar.pos());
  check(`${label}: down the tunnel to the ring side, not sent back by the ticket controller`, through && p1.z > cz && Math.abs(p1.x - cx) < 2.5, `${(p1.x - cx).toFixed(1)}, ${(p1.z - cz).toFixed(1)} from the centre`);
  await shot('tunnel-walk');

  // the corner: a short moment, the drums louder
  await d(([x, z, ox, oz]) => window.__dakar.place(x, z, Math.atan2(ox - x, oz - z)), [s.corner.x, s.corner.z, cx, cz]);
  const prep = await until(() => window.__dakar.fighter().phase === 'prep', null, 15000);
  const drums = await d(() => window.__dakar.arenaOut().audio.want.drums);
  check(`${label}: in the écurie's corner: the moment before the bout, drums louder`, prep && drums > 1.1, `drums ${drums?.toFixed?.(2)}`);
  await d(([p, t]) => window.__dakar.cam(p, t), [[s.corner.x + (cx - s.corner.x) * 0.45, 2.6, s.corner.z - 3.5], [s.corner.x, 1.0, s.corner.z]]); await shot('corner'); await d(() => window.__dakar.cam(null));
  const ready = await until(() => /pikine:arena:coin/.test(window.__dakar.focus()?.id ?? '') && window.__dakar.focus()?.primary === 'Je suis prêt', null, 15000);
  if (ready) await d(() => window.__dakar.act());
  const ring = await until(() => window.__dakar.fighter().phase === 'ring', null, 30000);
  check(`${label}: on cue, toward the ring (« Je suis prêt » or after the wait)`, ring && (await d(() => window.__dakar.destination())) === 'pikine:arena:cercle', (await fi()).phase);

  // the ring's edge: the existing duel starts
  await d(([x, z]) => window.__dakar.place(x, z, Math.PI), [s.ring.x, s.ring.z + 0.3]);
  const bout = await until(() => window.__dakar.fighter().phase === 'bout' && !!window.__dakar.duelInfo(), null, 20000);
  check(`${label}: at the ring's edge the bout starts (the existing duel)`, bout, JSON.stringify(await d(() => window.__dakar.duelInfo())).slice(0, 160));
  await page.waitForTimeout(1500); await shot('bout');
  await d(() => window.__dakar.duelAbandon(true));
  const back = await until(() => !window.__dakar.duelInfo() && window.__dakar.fighter().phase === 'return', null, 60000);
  check(`${label}: after the result, back through the tunnel (marker on the wrestlers' gate)`, back && (await d(() => window.__dakar.destination())) === 'pikine:arena:lutteurs', (await fi()).phase);

  // out through the tunnel and the gate
  await d(([x, z]) => window.__dakar.place(x, z, 0), [cx, cz + 16.5]);
  const outside = await walk(() => window.__dakar.fighter().phase === 'idle', null, 40000);
  check(`${label}: out through the tunnel and the wrestlers' gate: the path ends`, outside && /Ba beneen yoon/.test(await d(() => document.getElementById('toast')?.textContent ?? '')), JSON.stringify(await d(() => window.__dakar.pos())));

  // ---------------------------------------------------------------- the player's own gala night (src/arena/myGala.ts)
  // every toast of the evening, kept (the ceremony's lines follow each other quickly)
  await d(() => {
    window.__toasts = []; const box = document.getElementById('toast');
    new MutationObserver(() => { for (const c of box.children) { const m = c.dataset?.msg; if (m && !window.__toasts.includes(m)) window.__toasts.push(m); } }).observe(box, { childList: true });
  });
  const toasts = () => d(() => window.__toasts.slice());
  // a record from the career first (two ranked wins), so the announcer and the griot have one to read
  await d(() => { const D = window.__dakar; D.careerBout('classe', 'player', 2, 'projection', 'Gora'); D.careerBout('classe', 'player', 2, 'decision', 'Pape'); D.setHour(19); D.state.data.needs.energie = 100; });
  const wins = (await d(() => window.__dakar.career())).record.v;
  const signed = await d(() => window.__dakar.careerSign('gala'));
  const lad = await d(() => window.__dakar.careerLadder()), fb = await fi(), opp = fb.bout?.opponent;
  const posterTitle = (await d(() => window.__dakar.posters?.() ?? null))?.lines?.title ?? '';
  check(`${label}: a gala place tonight: the player is the main event, the bill names them (left) against their opponent, the posters too`,
    signed?.kind === 'gala' && fb.bout?.main === 'gala' && lad.card.left.id === 'player' && lad.card.left.name === ME && lad.card.right.name === opp && !lad.card.title
    && posterTitle.startsWith(ME.toUpperCase()), JSON.stringify({ signed, card: lad.card, posterTitle, day: await d(() => window.__dakar.arena.info()?.day) }));
  const gs = fb.spots;
  // into the wrestlers' tunnel: their show starts (the stands fill), on their night
  await d(p => window.__dakar.place(p.x, p.z, Math.PI), gs.tunnel);
  const showOn = await until(() => window.__dakar.fighter().phase === 'tunnel' && ['filling', 'prelims'].includes(window.__dakar.arena.info()?.phase), null, 20000);
  const g0 = await d(() => window.__dakar.arena.info());
  check(`${label}: in the tunnel the show starts, on their own night (mine)`, showOn && g0.mine === true && !g0.remote, JSON.stringify({ phase: g0.phase, mine: g0.mine, fighter: (await fi()).phase }));
  // their corner: held while the preliminaries run (well past the usual 8 s), their people round them
  await d(([x, z, ox, oz]) => window.__dakar.place(x, z, Math.atan2(ox - x, oz - z)), [gs.corner.x, gs.corner.z, cx, cz]);
  const inCorner = await until(() => window.__dakar.fighter().phase === 'prep', null, 15000);
  await page.waitForTimeout(10000);
  const [fh, g1, said1] = [await fi(), await d(() => window.__dakar.arena.info()), await toasts()];
  const mySide = g1.people?.entourage?.find(e => e.who === 'left');
  check(`${label}: their corner is held while the preliminaries run (told so), their people round them`,
    inCorner && fh.phase === 'prep' && ['filling', 'prelims'].includes(g1.phase) && said1.some(t => /préliminaires d’abord/.test(t)) && g1.people?.fighter === 'left' && mySide?.wrestler === ME,
    JSON.stringify({ fighter: fh.phase, show: g1.phase, prelims: g1.prelims?.i, people: { fighter: g1.people?.fighter, side: mySide?.wrestler } }));
  await d(([p, t]) => window.__dakar.cam(p, t), [[gs.corner.x + (cx - gs.corner.x) * 0.45, 2.6, gs.corner.z - 3.5], [gs.corner.x, 1.0, gs.corner.z]]); await shot('my-gala-corner'); await d(() => window.__dakar.cam(null));
  // « Je suis prêt »: the rest of the preliminaries skipped, their entrance starts (the ceremony faster for the check)
  await d(() => window.__dakar.arena.speed(4));
  const readyG = await until(() => /pikine:arena:coin/.test(window.__dakar.focus()?.id ?? '') && window.__dakar.focus()?.primary === 'Je suis prêt', null, 15000);
  if (readyG) await d(() => window.__dakar.act());
  const entr = await until(() => window.__dakar.arena.info().phase === 'entrance', null, 15000);
  const g2 = await d(() => window.__dakar.arena.info()), tl = await d(() => window.__dakar.arena.timeline());
  const iPre = tl.findIndex(x => /^prelim/.test(x.phase)), iEnt = tl.findIndex(x => x.phase === 'entrance');
  check(`${label}: « Je suis prêt »: their entrance, after the preliminaries; only their opponent is drawn walking out, the card names them`,
    readyG && entr && iPre >= 0 && iPre < iEnt && (g2.ceremony?.wrestlers ?? []).every(w => w.who === 'right') && new RegExp(`Entrée des lutteurs · ${ME} `).test(g2.card) && (await fi()).phase === 'prep',
    JSON.stringify({ timeline: tl.map(x => x.phase), wrestlers: g2.ceremony?.wrestlers?.map(w => w.who), card: g2.card }));
  // the ceremony names them, then they walk out: « Faire ton bàkk » offered on the way to the ring
  const walkOut = await until(() => window.__dakar.fighter().phase === 'ring', null, 40000);
  const [bk, said2] = [await d(() => window.__dakar.bakk()), await toasts()];
  const announced = said2.find(t => /L’annonceur : À ma gauche/.test(t) && t.includes(`${ME} !`)) ?? '', griot = said2.find(t => /Le griot/.test(t) && t.includes(ME)) ?? '';
  check(`${label}: their ceremony: the announcer reads their real record, their griot sings them, their people chant`,
    new RegExp(`${ME} ! ${wins} victoires`).test(announced) && new RegExp(`${wins} (victoires|combats)`).test(griot) && said2.some(t => t.startsWith(`L’entourage de ${ME}`)),
    JSON.stringify({ announced, griot, wins }));
  check(`${label}: released at the walk-out: on to the ring, « Faire ton bàkk » offered`, walkOut && bk.offer && said2.some(t => /Faire ton bàkk/.test(t)) && (await d(() => window.__dakar.destination())) === 'pikine:arena:cercle', JSON.stringify(bk));
  await d(() => window.__dakar.arena.speed(1));
  // the ring: their duel, against their opponent; the show is in its bout and simulates nothing
  await d(([x, z]) => window.__dakar.place(x, z, Math.PI), [gs.ring.x, gs.ring.z + 0.3]);
  const duelOn = await until(() => window.__dakar.fighter().phase === 'bout' && !!window.__dakar.duelInfo() && window.__dakar.arena.info().phase === 'bout', null, 20000);
  await page.waitForTimeout(1200);
  const [di, g3, tg3, mv3] = [await d(() => window.__dakar.duelInfo()), await d(() => window.__dakar.arena.info()), await d(() => window.__dakar.together()), await d(() => window.__dakar.presence().move)];
  check(`${label}: at the ring their duel starts against ${opp} (${L2 ? 'avec frappe' : 'sans frappe'}); the show simulates no bout`,
    duelOn && di.opponent === opp && di.mode === 'classe' && di.discipline === (L2 ? 'avec_frappe' : 'sans_frappe') && g3.bout === null && g3.mine === true
    && new RegExp(`lutte ${L2 ? 'avec' : 'sans'} frappe · ${ME} `).test(g3.card), JSON.stringify({ opponent: di?.opponent, discipline: di?.discipline, bout: g3.bout, card: g3.card }));
  check(`${label}: their presence: tonight's main event (arena.m = 1, in its bout), in the ring in a fighting stance`,
    tg3.field?.m === 1 && tg3.field?.p === 4 && mv3?.clip === 'Stance' && mv3?.space === 'street' && Math.hypot(mv3.x - cx, mv3.z - cz) < 8 && mv3?.arena?.m === 1,
    JSON.stringify({ field: tg3.field, move: mv3 && { x: +(mv3.x - cx).toFixed(2), z: +(mv3.z - cz).toFixed(2), clip: mv3.clip, space: mv3.space, arena: mv3.arena } }));
  await shot('my-gala-bout');
  // their real result is the show's: given up here, said as such, never a made-up winner; the career recorded it
  await d(() => window.__dakar.duelAbandon(true));
  await until(() => window.__dakar.duelInfo()?.phase === 'result', null, 60000);
  await d(() => window.__dakar.duelFinish());
  const sent = await until(() => { const f = window.__dakar.together().field; return !window.__dakar.duelInfo() && !!f && f.m === 1 && f.w !== undefined; }, null, 30000);
  const [g4, tg4, c4] = [await d(() => window.__dakar.arena.info()), await d(() => window.__dakar.together()), await d(() => window.__dakar.career())];
  const last = c4.bouts.at(-1);
  check(`${label}: their real result is the show's (an abandon, told as such), recorded once by the career as their gala bout`,
    sent && ['result', 'leaving'].includes(g4.phase) && new RegExp(`Abandon : ${ME} s’arrête là`).test(g4.result) && last?.res === 'A' && last?.kind === 'gala' && last?.opp === opp && !g4.bout,
    JSON.stringify({ phase: g4.phase, result: g4.result, last }));
  check(`${label}: their presence carries that result for friends, once known (m = 1, w = 0, o = abandon)`, tg4.field?.m === 1 && tg4.field?.w === 0 && tg4.field?.o === 3, JSON.stringify(tg4.field));
  check(`${label}: the gala card keeps their bill through the result (the career has forgotten the sign-up)`,
    new RegExp(`${ME} \\(`).test(g4.card) && !(await d(() => window.__dakar.careerLadder())).signed, g4.card);
  await d(() => window.__dakar.fighterCancel());
  check(`${label}: no page errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
  await context.close();
}
await browser.close();
fs.writeFileSync(`${out}/results${L2 ? '-lamb2' : ''}.json`, JSON.stringify(results, null, 2));
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
