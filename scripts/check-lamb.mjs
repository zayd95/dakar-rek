// Headless checks of the controlled làmb bout (provisional rules, sans frappe). Usage:
//   node scripts/check-lamb.mjs [baseUrl] [outDir]
// SwiftShader renders ~3 fps and the game clamps dt to 0.1 s, so every wait is on game state, never a fixed delay.
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:4203/';
const out = process.argv[3] ?? 'docs/screenshots/lamb';
fs.mkdirSync(out, { recursive: true });
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok, extra }); console.log(ok ? 'PASS' : 'FAIL', name, extra); };
const launch = { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] };
if (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome')) launch.executablePath = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch(launch);

// Wall-clock budgets are multiplied by SLOW: SwiftShader on a busy machine can drop well below 1 fps.
const SLOW = Number(process.env.LAMB_SLOW ?? 4);
async function open(vp, touch, quality) {
  const ctx = await browser.newContext({ viewport: vp, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
  await ctx.addInitScript(q => { try { localStorage.setItem('dakarrek.quality', q); } catch { /* */ } }, quality);
  const page = await ctx.newPage();
  page.setDefaultTimeout(60000 * SLOW);
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const url = m.location().url;
    if (url.endsWith('/assets/car_rapide.glb') && m.text().includes('404')) return;   // optional Blender vehicle
    if (/ws|websocket|8787/i.test(m.text() + url)) return;                               // no presence server here
    errors.push(`${m.text()} ${url}`);
  });
  await page.goto(`${base}?debug${touch ? '&touch' : ''}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__dakar && window.__dakar.pos().hub, null, { timeout: 60000 });
  await page.evaluate(() => { window.__dakar.teleport('pikine'); window.__dakar.setHour(16); });
  await page.waitForFunction(() => window.__dakar.pos().hub === 'pikine', null, { timeout: 30000 });
  return { ctx, page, errors };
}
const info = page => page.evaluate(() => window.__dakar.duelInfo());
const counters = page => page.evaluate(() => ({ ...window.__dakar.state.data.counters }));
const wait = (page, fn, arg, timeout = 120000) => page.waitForFunction(fn, arg, { timeout: timeout * SLOW, polling: 150 }).then(() => true, () => false);
/** Repeat an action until a condition holds (wall-clock budget); returns the last info seen. */
async function until(page, cond, act, budget = 120000) {
  let last = null;
  for (const t0 = Date.now(); Date.now() - t0 < budget * SLOW;) {
    last = await info(page);
    if (cond(last)) return last;
    if (act) await act(last);
    await page.waitForTimeout(120);
  }
  return last;
}
const shot = (page, name) => page.screenshot({ path: `${out}/${name}.jpg`, quality: 85 });

// ------------------------------------------------------------------ desktop: tutorial, friendly, dégagement, abandon, ranked
{
  const { ctx, page, errors } = await open({ width: 1280, height: 720 }, false, 'low');   // low quality: state checks on a slow CPU renderer
  // arena menu: friendly and ranked are separate, labelled as provisional rules
  const arenaName = await page.evaluate(() => { const d = window.__dakar; d.state.data.flags.push('ecurie_baobab'); const a = d.interactables().find(i => i.id.endsWith(':arena')); d.place(a.x, a.z, 0); return a.name; });
  await wait(page, n => window.__dakar.nearestInteractable() === n, arenaName, 30000);
  await page.evaluate(() => window.__dakar.act());
  await wait(page, () => document.querySelector('#modal.on'), null, 10000);
  const menu = await page.evaluate(() => [...document.querySelectorAll('#modal .item')].map(b => b.textContent));
  await shot(page, 'desktop-arena-menu');
  check('menu: arena offers friendly and ranked bouts with provisional rules', menu.some(t => /Combat amical/.test(t) && /provisoires/.test(t)) && menu.some(t => /Combat classé/.test(t) && /Termine d’abord l’entraînement/.test(t)), menu.filter(t => /Combat/.test(t)).join(' | '));
  await page.keyboard.press('Escape');

  // 1. guided training with Coach Ablaye at the écurie
  await page.evaluate(() => window.__dakar.duelStart('entrainement'));
  await wait(page, () => window.__dakar.duelInfo()?.phase === 'fight');
  await shot(page, 'desktop-training-move');
  await page.keyboard.down('KeyD');                                        // screen right: towards the partner
  let ti = await until(page, i => i?.step !== 'move', null, 90000);
  await page.keyboard.up('KeyD');
  check('training: move step (keyboard, camera-relative)', ti?.step === 'guard', JSON.stringify({ step: ti?.step, dist: ti?.dist }));
  await page.evaluate(() => window.__dakar.duelGuard(true));
  ti = await until(page, i => i?.step !== 'guard', null, 120000);
  await page.evaluate(() => window.__dakar.duelGuard(false));
  check('training: guard step (response window to a slow grab)', ti?.step === 'grab' && ti.score.player.guards >= 1, JSON.stringify({ step: ti?.step, score: ti?.score.player }));
  ti = await until(page, i => i?.step !== 'grab', async i => { if (i?.phase === 'fight' && i.dist > 1.3) await page.keyboard.down('KeyD'); else await page.keyboard.up('KeyD'); if (i?.phase === 'fight' && i.dist <= 1.45) await page.evaluate(() => window.__dakar.duelGrab()); }, 120000);
  await page.keyboard.up('KeyD');
  await shot(page, 'desktop-training-clinch');
  ti = await until(page, i => i?.step !== 'clinch' && i?.step !== 'grab', async i => { if (i?.phase === 'clinch') await page.evaluate(() => window.__dakar.duelGrab()); else if (i?.phase === 'fight' && i.dist <= 1.45) await page.evaluate(() => window.__dakar.duelGrab()); }, 120000);
  check('training: grab and empoignade steps', ti?.step === 'break', JSON.stringify({ step: ti?.step }));
  let sawWindow = false;
  ti = await until(page, i => !i || i.phase === 'result', async i => {
    if (i?.clinch?.losing && i.clinch.breakWindow) { if (!sawWindow) { sawWindow = true; await shot(page, 'desktop-training-break-window'); } await page.evaluate(() => window.__dakar.duelBreak()); }
  }, 150000);
  check('training: dégagement step completes the tutorial', ti?.phase === 'result' && ti.outcome === 'entrainement' && ti.score.player.breaks >= 1, JSON.stringify({ phase: ti?.phase, outcome: ti?.outcome, score: ti?.score?.player }));
  await page.waitForTimeout(400);
  await shot(page, 'desktop-training-recap');
  await page.evaluate(() => window.__dakar.duelFinish());
  await wait(page, () => window.__dakar.duelInfo() === null, null, 30000);
  let c = await counters(page);
  check('training: unranked, skill counter only', c.lamb_skill === 1 && !c.combats && !c.victoires, JSON.stringify(c));

  // 2. friendly bout won by grabbing (costaud, level 1)
  await page.evaluate(() => window.__dakar.duelStart('amical', 'costaud'));
  await wait(page, () => window.__dakar.duelInfo()?.phase === 'intro', null, 30000);
  await shot(page, 'desktop-referee');
  await wait(page, () => window.__dakar.duelInfo()?.phase === 'fight');
  await shot(page, 'desktop-friendly-fight');
  let bout = await until(page, i => !i || i.phase === 'fall' || i.phase === 'result', async () => page.evaluate(() => window.__dakar.duelGrab()), 150000);
  check('friendly: bout won by grabbing (projection)', bout?.winner === 'player' && bout.outcome === 'projection', JSON.stringify({ phase: bout?.phase, winner: bout?.winner, outcome: bout?.outcome }));
  await wait(page, () => window.__dakar.duelInfo()?.phase === 'result', null, 60000);
  await page.waitForTimeout(400);
  await shot(page, 'desktop-friendly-recap');
  const recapText = await page.evaluate(() => document.querySelector('.duel-recap')?.textContent ?? '');
  check('recap: result, how it ended, endurance, rewards', /Victoire/.test(recapText) && /Projection au sol/.test(recapText) && /Endurance restante/.test(recapText) && /Récompenses/.test(recapText), recapText.slice(0, 120));
  await wait(page, () => window.__dakar.duelInfo() === null, null, 120000);         // recap closes by itself
  c = await counters(page);
  check('friendly: recorded as a friendly win (global counters kept)', c.lamb_amical_v === 1 && c.victoires === 1 && c.combats === 1 && !c.lamb_classe_v, JSON.stringify(c));

  // 3. dégagement breaks a clinch, then the player abandons (Escape → confirm)
  await page.evaluate(() => window.__dakar.duelStart('amical', 'costaud'));
  await wait(page, () => window.__dakar.duelInfo()?.phase === 'fight');
  let sawWindup = false;
  const cl = await until(page, i => i?.phase === 'clinch' && i.clinch.by === 'opponent', async i => { if (i?.windup && !sawWindup) { sawWindup = true; await shot(page, 'desktop-response-window'); } }, 150000);
  check('response window: the opponent’s grab is announced before it lands', sawWindup && cl?.phase === 'clinch', JSON.stringify({ sawWindup, phase: cl?.phase }));
  const before = await info(page);
  const br = await until(page, i => !i || i.phase !== 'clinch', async i => { if (i?.clinch?.losing && i.clinch.breakWindow) await page.evaluate(() => window.__dakar.duelBreak()); }, 60000);
  check('dégagement: breaks a losing clinch at an endurance cost', br?.phase === 'fight' && br.score.player.breaks === 1 && br.winner === null && br.stamina.player < before.stamina.player, JSON.stringify({ phase: br?.phase, breaks: br?.score.player.breaks, st: [before.stamina.player, br?.stamina.player] }));
  await shot(page, 'desktop-after-break');
  const moralBefore = await page.evaluate(() => window.__dakar.state.data.needs.moral);
  await page.keyboard.press('Escape');
  await wait(page, () => !document.querySelector('.duel-confirm').hidden, null, 10000);
  const paused = (await info(page))?.paused;
  await shot(page, 'desktop-abandon-confirm');
  await page.click('.duel-confirm [data-k=yes]', { timeout: 30000 * SLOW });
  await wait(page, () => window.__dakar.duelInfo()?.phase === 'result', null, 30000);
  const ab = await info(page);
  await page.waitForTimeout(300);
  await shot(page, 'desktop-abandon-recap');
  await page.evaluate(() => window.__dakar.duelFinish());
  await wait(page, () => window.__dakar.duelInfo() === null, null, 30000);
  c = await counters(page);
  const moralAfter = await page.evaluate(() => window.__dakar.state.data.needs.moral);
  check('abandon: confirm pauses the bout', paused === true, String(paused));
  check('abandon: recorded apart (not a defeat by projection, no winner, no reward)', ab?.outcome === 'abandon' && ab.winner === null && c.lamb_amical_ab === 1 && c.lamb_abandons === 1 && !c.lamb_amical_d && c.combats === 1 && c.victoires === 1 && moralAfter <= moralBefore, JSON.stringify({ outcome: ab?.outcome, winner: ab?.winner, c, moral: [moralBefore, moralAfter] }));

  // 4. ranked bout: separate counters
  await page.evaluate(() => window.__dakar.duelStart('classe'));
  await wait(page, () => window.__dakar.duelInfo()?.phase === 'fight');
  const rk = await info(page);
  bout = await until(page, i => !i || i.phase === 'fall' || i.phase === 'result', async () => page.evaluate(() => window.__dakar.duelGrab()), 150000);
  await page.evaluate(() => window.__dakar.duelFinish());
  await wait(page, () => window.__dakar.duelInfo() === null, null, 120000);
  c = await counters(page);
  check('ranked: counters separate from friendly', rk?.mode === 'classe' && bout?.winner === 'player' && c.lamb_classe_v === 1 && c.lamb_amical_v === 1 && c.victoires === 2 && c.combats === 2, JSON.stringify({ style: rk?.style, level: rk?.level, c }));
  const prof = await page.evaluate(() => window.__dakar.arenaProfile());
  check('phone hook: arena profile rows', prof.find(r => r.label === 'Combats classés')?.value === '1 V · 0 D · 0 N' && prof.find(r => r.label === 'Combats amicaux')?.value === '1 V · 0 D · 0 N · 1 abandon' && prof.find(r => r.label === 'Compétence de lutte')?.value === '1', JSON.stringify(prof));
  check('desktop: no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// ------------------------------------------------------------------ phone: touch layout in portrait and landscape
for (const [label, vp] of [['phone-portrait', { width: 390, height: 844 }], ['phone-landscape', { width: 844, height: 390 }]]) {
  const { ctx, page, errors } = await open(vp, true, 'medium');
  await page.evaluate(() => window.__dakar.duelStart('amical', 'rapide'));
  await wait(page, () => window.__dakar.duelInfo()?.phase === 'fight');
  await page.waitForTimeout(600);
  const lay = await page.evaluate(() => {
    const rect = el => { const r = el.getBoundingClientRect(); return { x0: r.left, y0: r.top, x1: r.right, y1: r.bottom, w: r.width, h: r.height }; };
    const btns = [...document.querySelectorAll('.duel-btns button, .duel-ab')].map(b => ({ k: b.dataset.k, ...rect(b) }));
    const joy = rect(document.querySelector('#joy'));
    return { btns, joy, pts: window.__dakar.duelScreen(), W: innerWidth, H: innerHeight };
  });
  await shot(page, `${label}-fight`);
  const inside = (p, r, pad = 4) => p.x > r.x0 - pad && p.x < r.x1 + pad && p.y > r.y0 - pad && p.y < r.y1 + pad;
  const covered = lay.pts.filter(p => [...lay.btns, lay.joy].some(r => inside(p, r)));
  const onScreen = lay.pts.every(p => p.x > 0 && p.x < lay.W && p.y > 0 && p.y < lay.H);
  const fit = lay.btns.every(b => b.x0 >= 0 && b.x1 <= lay.W && b.y0 >= 0 && b.y1 <= lay.H && b.w >= 40 && b.h >= 40);
  check(`${label}: Garde/Saisir/Dégager/Abandonner on screen, touch-sized, not covering the fighters`, covered.length === 0 && onScreen && fit && lay.btns.length === 4 && lay.joy.w > 0, JSON.stringify({ covered: covered.length, onScreen, fit, btns: lay.btns.map(b => `${b.k}@${Math.round(b.x0)},${Math.round(b.y0)} ${Math.round(b.w)}x${Math.round(b.h)}`), joy: Math.round(lay.joy.w) }));
  // touch: Dégager in neutral steps back (endurance cost); Abandonner → Continuer resumes; then abandon for real
  const s0 = (await info(page)).stamina.player;
  await page.tap('.duel-btns [data-k=break]');
  const s1 = await until(page, i => i.stamina.player < s0 - 5, null, 20000);
  check(`${label}: touch Dégager (step back) costs endurance`, s1.stamina.player < s0 - 5, `${s0} → ${s1.stamina.player}`);
  await page.tap('.duel-ab');
  await wait(page, () => window.__dakar.duelInfo()?.paused === true, null, 10000);
  await shot(page, `${label}-abandon-confirm`);
  await page.tap('.duel-confirm [data-k=no]');
  const resumed = await wait(page, () => window.__dakar.duelInfo()?.paused === false && window.__dakar.duelInfo()?.phase !== 'result', null, 10000);
  await page.tap('.duel-ab');
  await wait(page, () => window.__dakar.duelInfo()?.paused === true, null, 10000);
  await page.tap('.duel-confirm [data-k=yes]');
  await wait(page, () => window.__dakar.duelInfo()?.phase === 'result', null, 30000);
  await page.waitForTimeout(300);
  await shot(page, `${label}-recap`);
  await page.tap('.duel-recap [data-k=continue]');
  await wait(page, () => window.__dakar.duelInfo() === null, null, 30000);
  const c = await counters(page);
  check(`${label}: touch abandon flow (cancel resumes, confirm records an abandon)`, resumed && c.lamb_amical_ab === 1 && !c.lamb_amical_d && !c.combats, JSON.stringify(c));
  check(`${label}: no page errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

await browser.close();
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
fs.writeFileSync(`${out}/check-lamb.json`, JSON.stringify(results, null, 2));
process.exit(failed.length ? 1 : 0);
