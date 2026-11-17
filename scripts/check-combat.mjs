// Headless checks of the new bout (docs/wrestling/COMBAT.md; src/lamb/combat.ts, combatAi.ts, combatRig.ts, duel.ts): the
// player's own bout with grips, a balance with a direction, throws with their set-up, the opponent's AI and the referee's
// fall rule — on a phone in portrait (390×844) and in landscape (844×390), with REAL touch on the controls (Chrome's own
// input pipeline, scripts/lib/realTouch.mjs), and on a desktop with the keys.
//  - portrait: the friendly menu by touch; the HUD (three buttons, gauges, the Prise), the stance on the bodies (crouched,
//    feet planted, stepping); a whole bout to a WIN played by a thumb (joystick and buttons: walk in, Saisir, push / pull /
//    pivot with the stick, brace his throws, Projeter when the button lights) — « Revanche » by touch when a bout is lost —
//    then a whole bout to a LOSS (the guard held: the referee does not let it draw); the grip, the imbalance and a throw
//    seen on the bodies (hands on his body, his trunk leaning the way his balance goes, a head on the sand); the
//    referee's call and the result;
//  - landscape: the layout, the empoignade's close-up (heads under the Prise, feet over the controls), a throw by touch;
//  - desktop: the bout with the keys (walk, E, the arrows, K), the lesson's first steps with the new controls.
// No page error anywhere. RDABODY=1: the same with the Roi des Arènes bodies (?rdabody=force), output in <outDir>-rda.
// Usage: flock /tmp/dakar-browser.lock node scripts/check-combat.mjs [baseUrl] [outDir]   (SwiftShader: every wait is on game state)
import { chromium } from 'playwright';
import fs from 'node:fs';
import { realTouch } from './lib/realTouch.mjs';

const base = process.argv[2] ?? 'http://127.0.0.1:5311/';
const RDA = process.env.RDABODY ? '&rdabody=force' : '';
const out = (process.argv[3] ?? 'docs/wrestling/combat/check') + (RDA ? '-rda' : '');
fs.mkdirSync(out, { recursive: true });
const SLOW = Number(process.env.LAMB_SLOW ?? 4);
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok }); console.log(ok ? 'PASS' : 'FAIL', name, typeof extra === 'string' ? extra : JSON.stringify(extra)); };
const launch = { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] };
if (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome')) launch.executablePath = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch(launch);

async function open(vp, touch) {
  const ctx = await browser.newContext({ viewport: vp, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'low'); } catch { /* */ } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60000 * SLOW);
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() !== 'error') return; const u = m.location().url; if (u.endsWith('/assets/car_rapide.glb') || /ws|websocket|8787/i.test(m.text() + u)) return; errors.push(`${m.text()} ${u}`); });
  await page.goto(`${base}?debug&lamb2${touch ? '&touch' : ''}${RDA}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__dakar && window.__dakar.pos().hub, null, { timeout: 120000 * SLOW });
  if (RDA) await page.waitForFunction(() => window.__dakar.rda().ready, null, { timeout: 120000 }).catch(() => {});
  await page.evaluate(() => { window.__dakar.teleport('pikine'); window.__dakar.setHour(16); });
  await page.waitForFunction(() => window.__dakar.pos().hub === 'pikine', null, { timeout: 60000 * SLOW });
  return { ctx, page, errors };
}
const info = page => page.evaluate(() => window.__dakar.duelInfo());
const wait = (page, fn, arg, ms = 120000) => page.waitForFunction(fn, arg, { timeout: ms * SLOW, polling: 120 }).then(() => true, () => false);
const shot = (page, name) => page.screenshot({ path: `${out}/${name}.jpg`, quality: 70 });
const bodies = page => page.evaluate(() => window.__dakar.wrestlers().map(w => w.body));

/** The duel's buttons and the HUD blocks: on screen, apart, readable; nothing over the two wrestlers' heads and bodies. */
const layout = page => page.evaluate(() => {
  const r = el => { const b = el.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; };
  const shown = el => !!el && !el.hidden && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0;
  const hit = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
  const btns = [...document.querySelectorAll('.duel-btns button')].filter(shown).map(b => ({ k: b.dataset.k, text: b.innerText.replace(/\s+/g, ' ').trim(), font: parseFloat(getComputedStyle(b).fontSize), w: b.getBoundingClientRect().width, cut: b.scrollWidth > b.clientWidth + 1, ...r(b) }));
  const joy = document.getElementById('joy'), others = shown(joy) ? [{ k: 'joy', ...r(joy) }] : [];
  const clash = [];
  for (let i = 0; i < btns.length; i++) for (let j = i + 1; j < btns.length; j++) if (hit(btns[i], btns[j])) clash.push(`${btns[i].k}/${btns[j].k}`);
  for (const b of btns) for (const o of others) if (hit(b, o)) clash.push(`${b.k}/joy`);
  const pts = window.__dakar.duelScreen() ?? [];
  const blocks = [...btns, ...others, ...[...document.querySelectorAll('.duel-bars > div, .duel-clinch, .duel-step')].filter(shown).map(e => ({ k: e.className || e.dataset.k, ...r(e) }))];
  const covered = pts.flatMap((p, n) => blocks.filter(b => p.x > b.l && p.x < b.r && p.y > b.t && p.y < b.b).map(b => `${['feet', 'waist', 'head'][n % 3]}${n < 3 ? '·toi' : '·lui'}/${b.k}`));
  return { n: btns.length, labels: btns.map(b => b.text), clash, inside: btns.every(b => b.l >= 0 && b.t >= 0 && b.r <= innerWidth && b.b <= innerHeight), small: btns.filter(b => b.font < 12 || b.w < 60 || b.cut).map(b => b.k), covered, bars: !!document.querySelector('[data-k=mebal]'), vw: innerWidth, vh: innerHeight };
});
const layoutOk = (l, n) => l.n === n && l.clash.length === 0 && l.inside && l.small.length === 0 && l.covered.length === 0 && l.bars;

/**
 * A thumb on the phone: the joystick (finger 1: walk in, then push / pull / pivot and brace in the empoignade, towards
 * or away from him as he stands on the screen) and the buttons (finger 2: Saisir, Projeter / Contrer, Casser, Garde).
 * `mode` 'win': plays to win (reads his body: answers his move with the move that beats it, braces his throw, throws
 * when the button lights); 'loss': holds the guard up the whole bout and does nothing else. Returns what it saw.
 */
async function thumb(page, t, mode, budgetMs) {
  const joy = await t.centre('#joy'), R = 46;
  let stickAt = null, guardDown = false, lastTap = 0, lastMove = 0;
  const seen = { clinch: false, grip: 1, hold: null, imbalance: null, attempt: false, brace: false, ready: false };
  const stick = async (fx, fy = 0) => {
    const p = await page.evaluate(() => window.__dakar.duelScreen());
    const dir = p ? Math.sign(p[3].x - p[0].x) || 1 : 1;
    const x = joy.x + dir * fx * R, y = joy.y - fy * R;
    if (!stickAt) { await t.down(1, joy.x, joy.y); stickAt = { x: joy.x, y: joy.y }; }
    if (Math.hypot(x - stickAt.x, y - stickAt.y) > 2) { await t.move(1, x, y, 2); stickAt = { x, y }; }
  };
  const release = async () => { if (stickAt) { await t.up(1); stickAt = null; } };
  const tap = async k => { await t.tap(`.duel-btns button[data-k=${k}]`, 2); lastTap = Date.now(); };
  const t0 = Date.now();
  let i = await info(page);
  while (Date.now() - t0 < budgetMs * SLOW && i && !['fall', 'result'].includes(i.phase)) {
    i = await info(page); if (!i) break;
    const c = i.combat;
    if (mode === 'loss') {
      if (!guardDown) { const g = await t.centre('.duel-btns button[data-k=guard]'); await t.down(2, g.x, g.y); guardDown = true; }
      if (i.phase === 'clinch') { seen.clinch = true; seen.hold = c.opponent.hold?.kind ?? seen.hold; }
      await page.waitForTimeout(150); continue;
    }
    if (i.phase === 'fight') {
      if (i.dist > 1.35) await stick(1); else { await release(); if (Date.now() - lastTap > 900) await tap('grab'); }
    } else if (i.phase === 'clinch') {
      seen.clinch = true;
      if (c.player.hold && c.body?.player?.handGap >= 0) seen.grip = Math.min(seen.grip, c.body.player.handGap);
      if (c.player.hold) seen.hold = c.player.hold.kind;
      if (c.opponent.lean.depth >= 0.25 && (!seen.imbalance || c.opponent.lean.depth > seen.imbalance.depth)) seen.imbalance = { ...c.opponent.lean, trunk: c.body?.opponent?.trunk };
      const att = c.attempt;
      if (att && att.by === 'opponent') {
        // his throw, seen on his body: lean against its way (the stick), as the button turns « Contrer »
        const d = { hanche: -1, ramene: -1, souleve: -1, croc: 1, jambe: 1, balayage: 0 }[att.id];
        if (d) await stick(d); else await stick(0, c.player.lean.s >= 0 ? -1 : 1);
        seen.brace = true;
      } else if (att) { seen.attempt = true; }
      else if (c.best?.ready && Date.now() - lastTap > 500) { seen.ready = true; await release(); await tap('grab'); }
      else if (i.clinch.posture.player !== 'stable' && c.prise > -35 && c.prise < -15 && Date.now() - lastTap > 800) await tap('break');
      else {
        const his = i.clinch.move.opponent;
        if (his && Date.now() - lastMove > 300) { lastMove = Date.now(); if (his === 'push') await stick(-1); else if (his === 'pull') await stick(0.2, 1); else await stick(1); }
        else if (!his) { if (Date.now() - lastMove > 650) { lastMove = Date.now(); await release(); } else await stick(1); }
      }
    }
    await page.waitForTimeout(90);
  }
  await release(); if (guardDown) await t.up(2);
  return { i: await info(page), seen };
}

/** Waits for the referee: the fall's call, the arm raised, then the result's card. */
async function referee(page) {
  let call = null, arm = false, head = null;
  for (const t0 = Date.now(); Date.now() - t0 < 90000 * SLOW;) {
    const i = await info(page); if (!i) break;
    call = i.combat?.referee ?? call;
    if (i.phase === 'fall') { arm ||= !!i.fall?.arm || !!i.refereeRaised; const loser = i.winner === 'player' ? 'opponent' : 'player'; const h = i.combat?.body?.[loser]?.head; if (h != null) head = Math.min(head ?? 9, h); }
    if (i.phase === 'result') { arm ||= !!i.refereeRaised; break; }
    await page.waitForTimeout(150);
  }
  const card = await page.evaluate(() => { const r = document.querySelector('.duel-recap'); return r && !r.hidden ? r.innerText.replace(/\s+/g, ' ') : ''; });
  return { call, arm, head, card };
}

// ------------------------------------------------------------------ phone, portrait: a win and a loss with real touch
{
  const { ctx, page, errors } = await open({ width: 390, height: 844 }, true);
  const t = await realTouch(page);
  // the friendly menu at the arena, by touch
  const name = await page.evaluate(() => { const d = window.__dakar; d.state.data.flags.push('ecurie_baobab'); const a = d.interactables().find(i => i.id.endsWith(':arena')); d.place(a.x, a.z, 0); return a.name; });
  await wait(page, n => window.__dakar.nearestInteractable() === n, name, 30000);
  await t.tap('#act').catch(() => {});
  if (!(await wait(page, () => document.querySelector('#modal.on'), null, 15000))) { console.log('(the action button was not on screen: the arena\'s menu opened by the game\'s own action)'); await page.evaluate(() => window.__dakar.act()); await wait(page, () => document.querySelector('#modal.on'), null, 20000); }
  await page.evaluate(() => [...document.querySelectorAll('#modal .item')].find(b => /Combat amical/.test(b.textContent))?.setAttribute('data-pick', '1'));
  await t.tap('#modal .item[data-pick="1"]');
  await wait(page, () => /Combat amical/.test(document.querySelector('#modal.on h2')?.textContent ?? ''), null, 20000);
  await page.evaluate(() => [...document.querySelectorAll('#modal .item')].find(b => /^Gora · Costaud/.test(b.textContent.trim()))?.setAttribute('data-pick', '2'));
  await t.tap('#modal .item[data-pick="2"]');
  const started = await wait(page, () => window.__dakar.duelInfo()?.phase === 'fight', null, 90000);
  const i0 = await info(page);
  check('portrait: « Combat amical » picked by touch starts the new bout sans frappe against Gora (combat on by default)', started && !!i0?.combat && i0.discipline === 'sans_frappe' && i0.opponent === 'Gora' && (await page.evaluate(() => window.__dakar.combatOn())), { phase: i0?.phase, combat: !!i0?.combat, opponent: i0?.opponent });
  if (RDA) { const b = await bodies(page); check('rda: both wrestlers of the bout are Roi des Arènes bodies', b.filter(x => x === 'rda').length >= 2, b.join(' ')); }
  const l0 = await layout(page);
  check('portrait 390×844: three big buttons (Reculer, Garde, Saisir), apart, clear of the joystick, readable; nobody under a button or a gauge', layoutOk(l0, 3) && l0.labels.join() === 'Reculer,Garde,Saisir', l0);
  // the stance on the bodies: crouched, the feet planted, stepping as he walks in
  const s0 = await info(page);
  await shot(page, 'portrait-1-stance');
  const legs = s0.combat.body.player;
  check('portrait: a crouched fighting stance, feet planted (the hips low, the knees bent, the legs on the stance rig)', legs && legs.legs > 0.9 && legs.drop > 0.05 && legs.kneeBend > 0.2 && legs.planted.some(Boolean), legs);

  // a whole bout to a win, with the thumb; a lost one is followed by « Revanche » (touch)
  let win = null, played = 0, seenAll = { grip: 1, imbalance: null, ready: false, brace: false, hold: null, steps: 0 };
  for (; played < 4 && !win; played++) {
    const r = await thumb(page, t, 'win', 240000);
    seenAll.grip = Math.min(seenAll.grip, r.seen.grip); seenAll.imbalance ??= r.seen.imbalance; seenAll.ready ||= r.seen.ready; seenAll.brace ||= r.seen.brace; seenAll.hold ??= r.seen.hold;
    seenAll.steps = Math.max(seenAll.steps, (await info(page))?.combat?.body?.player?.steps ?? 0);
    if (played === 0) await shot(page, 'portrait-2-after-first-bout');
    const ref = await referee(page);
    if (r.i?.winner === 'player' || (await info(page))?.winner === 'player') { win = ref; break; }
    if (!(await page.evaluate(() => !!document.querySelector('.duel-recap [data-k=again]')))) break;
    await t.tap('.duel-recap [data-k=again]');
    await wait(page, () => window.__dakar.duelInfo()?.phase === 'fight', null, 90000);
  }
  check('portrait: a whole bout won with real touch (joystick and buttons), the referee calls the fall and raises the arm, the card says « Victoire »', !!win && /^Chute : (le dos au sol|les quatre appuis)/.test(win.call ?? '') && win.arm && /Victoire/.test(win.card), { played: played + 1, win });
  check('portrait: grips on the bodies — the hands on the hold (within 15 cm of his nape, arm, belt or leg)', seenAll.grip <= 0.15 && !!seenAll.hold, { grip: seenAll.grip, hold: seenAll.hold });
  check('portrait: imbalance on the bodies — pushed back, his trunk arches back (drawn), deep enough for a throw', !!seenAll.imbalance && (seenAll.imbalance.f >= 0 || (seenAll.imbalance.trunk?.f ?? 1) < 0.15), seenAll.imbalance);
  check('portrait: a throw seen — the loser’s head on the sand (under 0.8 m), the feet stepped through the bout', !!win && win.head !== null && win.head < 0.8 && seenAll.steps > 2, { head: win?.head, steps: seenAll.steps });
  await shot(page, 'portrait-3-win-card');
  // « Revanche » by touch, then a bout to a loss: the guard held up all along (no draw: the referee presses, he throws)
  const again = await page.evaluate(() => !!document.querySelector('.duel-recap [data-k=again]'));
  if (again) await t.tap('.duel-recap [data-k=again]');
  const restarted = again && await wait(page, () => window.__dakar.duelInfo()?.phase === 'fight', null, 90000);
  check('portrait: « Revanche » on the result starts the same bout again (the first one recorded)', restarted, { again });
  const lost = restarted ? await thumb(page, t, 'loss', 240000) : null;
  const lref = await referee(page);
  check('portrait: a whole bout lost — the guard held all along never draws: he takes hold and throws (or wins on points)', !!lost && (await info(page))?.winner === 'opponent' && /Défaite/.test(lref.card) && lost.seen.clinch, { winner: (await info(page))?.winner, card: lref.card.slice(0, 80), call: lref.call });
  await shot(page, 'portrait-4-loss-card');
  await t.tap('.duel-recap [data-k=continue]').catch(() => {});
  await wait(page, () => !window.__dakar.duelInfo(), null, 30000);
  const rec = await page.evaluate(() => window.__dakar.state.data.counters);
  check('portrait: the bouts are recorded as before (the sans-frappe friendly record and the global count)', (rec.lamb_amical_v ?? 0) >= 1 && (rec.lamb_amical_d ?? 0) >= 1 && (rec.combats ?? 0) >= played + 2, { v: rec.lamb_amical_v, d: rec.lamb_amical_d, combats: rec.combats });
  check('portrait: no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// ------------------------------------------------------------------ phone, landscape: layout, close-up, a throw by touch
{
  const { ctx, page, errors } = await open({ width: 844, height: 390 }, true);
  const t = await realTouch(page);
  await page.evaluate(() => window.__dakar.duelStart('amical', 'costaud', 'avec_frappe', 'Gora'));
  await wait(page, () => window.__dakar.duelInfo()?.phase === 'fight', null, 90000);
  const l = await layout(page);
  check('landscape 844×390, avec frappe: four buttons (Reculer, Garde, Saisir, Frappe) apart, clear of the joystick, readable; nobody covered', layoutOk(l, 4) && l.labels.includes('Frappe'), l);
  await page.evaluate(() => { window.__dakar.duelHold(true); window.__dakar.duelClock(90); });
  for (let k = 0; k < 120; k++) { const i = await info(page); if (i.phase !== 'fight' || i.dist < 1.3) break; await page.evaluate(() => window.__dakar.duelStick(1, 0, 0.3)); await page.waitForTimeout(120); }
  await t.tap('.duel-btns button[data-k=grab]');
  await wait(page, () => window.__dakar.duelInfo()?.phase === 'clinch', null, 30000);
  // the close-up settles (the camera eases), then the layout in the empoignade
  for (let k = 0; k < 40; k++) { const i = await info(page); if (i.fx?.close >= 1) break; await page.waitForTimeout(250); }
  await page.waitForTimeout(1200);
  const cu = await page.evaluate(() => { const p = window.__dakar.duelScreen(), pr = document.querySelector('.duel-clinch').getBoundingClientRect(); return { headGap: Math.round(Math.min(p[2].y, p[5].y) - pr.bottom), i: window.__dakar.duelInfo() }; });
  const l2 = await layout(page);
  await shot(page, 'landscape-1-clinch');
  check('landscape: the empoignade at contact (≤ 0.8 m), hands on him, the heads under the Prise, nobody under a control; the buttons read Casser / the hold / the throw', cu.i.fx.clinchDist <= 0.8 && cu.headGap >= 8 && l2.covered.length === 0 && l2.labels.includes('Casser') && cu.i.combat.body.player.hands > 0.5, { dist: cu.i.fx.clinchDist, headGap: cu.headGap, covered: l2.covered, labels: l2.labels, hands: cu.i.combat.body.player.hands });
  // pushed back deep, the button names the throw and lights; a touch throws it
  await page.evaluate(() => { window.__dakar.duelSet('player', { hold: ['bras', 75], stamina: 100 }); window.__dakar.duelSet('opponent', { balance: 45, lean: [-1, 0] }); });
  await wait(page, () => document.querySelector('.duel-btns button[data-k=grab]')?.classList.contains('ready'), null, 20000);
  const label = await page.evaluate(() => document.querySelector('.duel-btns button[data-k=grab]').innerText.trim());
  await t.tap('.duel-btns button[data-k=grab]');
  await page.evaluate(() => window.__dakar.duelHold(false));
  const ref = await referee(page);
  const end = await info(page);
  check('landscape: the lit button says « Croc » for a man pushed back; a touch throws him on his back; the referee calls it', label === 'Croc' && end?.lastThrow?.throw === 'croc' && end.winner === 'player' && /dos au sol/.test(ref.call ?? ''), { label, lastThrow: end?.lastThrow, call: ref.call });
  check('landscape: no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// ------------------------------------------------------------------ desktop: the keys, and the lesson with the new controls
{
  const { ctx, page, errors } = await open({ width: 1280, height: 720 }, false);
  await page.evaluate(() => window.__dakar.duelStart('amical', 'rapide', 'sans_frappe', 'Pape'));
  await wait(page, () => window.__dakar.duelInfo()?.phase === 'fight', null, 90000);
  const note = await page.evaluate(() => document.querySelector('.duel-note')?.textContent ?? '');
  check('desktop: the keys are told (flèches, E saisir / projeter, G garde / prise, X reculer / casser, K)', /flèches/.test(note) && /E saisir/.test(note) && /X reculer/.test(note), note);
  await page.evaluate(() => window.__dakar.duelHold(true));
  await page.keyboard.down('KeyD');
  for (let k = 0; k < 120; k++) { const i = await info(page); if (i.dist < 1.3) break; await page.waitForTimeout(120); }
  await page.keyboard.up('KeyD');
  await page.keyboard.down('KeyE'); await page.waitForTimeout(700); await page.keyboard.up('KeyE');   // held: the belt
  await wait(page, () => window.__dakar.duelInfo()?.phase === 'clinch', null, 30000);
  const k1 = await info(page);
  check('desktop: E held reaches for the belt (the empoignade starts with the ceinture)', k1.phase === 'clinch' && k1.combat.player.hold?.kind === 'ceinture', k1.combat?.player?.hold);
  // the arrow towards him pushes: his weight goes back
  const dir = await page.evaluate(() => { const p = window.__dakar.duelScreen(); return p[3].x > p[0].x ? 'ArrowRight' : 'ArrowLeft'; });
  for (let k = 0; k < 6; k++) { await page.keyboard.down(dir); await page.waitForTimeout(500); }
  await page.keyboard.up(dir);
  const k2 = await info(page);
  check('desktop: the arrow towards him pushes — the exchanges drive his weight back', k2.combat.opponent.lean.f < -0.05, k2.combat.opponent.lean);
  await page.evaluate(() => window.__dakar.duelSet('opponent', { balance: 40, lean: [-1, 0] }));
  await page.keyboard.press('KeyK');
  await page.evaluate(() => window.__dakar.duelHold(false));
  const r = await referee(page);
  check('desktop: K throws (the throw the hold gives), the referee calls the fall, the result', /^Chute/.test(r.call ?? '') && /Victoire/.test(r.card), { call: r.call, card: r.card.slice(0, 60) });
  await page.keyboard.press('Escape').catch(() => {});
  await page.evaluate(() => window.__dakar.duelFinish());
  await wait(page, () => !window.__dakar.duelInfo(), null, 30000);
  // Coach Ablaye's lesson with the new controls
  await page.evaluate(() => { const d = window.__dakar; d.teleport('pikine'); const e = d.interactables().find(i => i.actions.some(a => a.id === 'combat_entrainement')); d.place(e.x, e.z, 0); });
  await page.evaluate(() => window.__dakar.drillStart('combat_entrainement'));
  await wait(page, () => !!window.__dakar.duelInfo()?.lesson, null, 60000);
  await wait(page, () => window.__dakar.duelInfo()?.phase === 'fight', null, 60000);
  const c1 = await page.evaluate(() => ({ i: window.__dakar.duelInfo(), card: document.querySelector('.duel-step')?.innerText ?? '' }));
  check('desktop: the lesson is the new one (Coach Ablaye, « Approche-toi, en garde basse », his word with its gloss)', c1.i.lesson.combat && c1.i.lesson.step === 'distance' && /Coach Ablaye/.test(c1.card) && /\(viens ici\)/.test(c1.card), c1.card);
  await page.evaluate(() => { window.__dakar.duelLessonSkip(); window.__dakar.duelLessonSkip(); });
  const c2 = await page.evaluate(() => window.__dakar.duelInfo().lesson.step);
  check('desktop: « Passer » goes through the steps (the empoignade read with the stick: « moves »)', c2 === 'moves', c2);
  await page.evaluate(() => window.__dakar.duelAbandon(true));
  check('desktop: no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

await browser.close();
const failed = results.filter(r => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
fs.writeFileSync(`${out}/check-combat.json`, JSON.stringify(results, null, 1));
process.exit(failed ? 1 : 0);
