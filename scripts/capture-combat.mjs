// Phone captures of the new bout (docs/wrestling/combat/): deviceScaleFactor 2, 390×844 and 844×390, Medium, the Roi des
// Arènes bodies (?rdabody=force; V4=1 for today's v4 bodies), small JPGs. Each moment is set up with the checks' hooks
// (the opponent held still, a balance, a hold, his throw started) and then played by the rules: the grip fight, the
// empoignade's holds, the imbalance, two throws (the croc, the hip), a counter, the fall and the referee's call, the result.
// Usage: flock /tmp/dakar-browser.lock node scripts/capture-combat.mjs <baseUrl> [outDir=docs/wrestling/combat]
import { chromium } from 'playwright';
import fs from 'node:fs';
const [,, base = 'http://127.0.0.1:5311/', out = 'docs/wrestling/combat'] = process.argv;
fs.mkdirSync(out, { recursive: true });
const launch = { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] };
if (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome')) launch.executablePath = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch(launch);
const body = process.env.V4 ? '' : '&rdabody=force';
const log = [];
for (const [tag, vp] of [['portrait', { width: 390, height: 844 }], ['landscape', { width: 844, height: 390 }]]) {
  const ctx = await browser.newContext({ viewport: vp, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await ctx.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'medium'); } catch { /* */ } });
  const page = await ctx.newPage(); page.setDefaultTimeout(300000);
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`${base}?debug&touch&lamb2${body}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__dakar && window.__dakar.pos().hub);
  if (body) await page.waitForFunction(() => window.__dakar.rda().ready, null, { timeout: 120000 }).catch(() => {});
  await page.evaluate(() => { window.__dakar.teleport('pikine'); window.__dakar.setHour(16); });
  await page.waitForFunction(() => window.__dakar.pos().hub === 'pikine');
  const D = (fn, a) => page.evaluate(fn, a);
  const info = () => D(() => window.__dakar.duelInfo());
  const frames = n => D(k => new Promise(r => { let i = 0; const f = () => (++i >= k ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
  const shot = async (name, settle = 4) => { await frames(settle); await page.screenshot({ path: `${out}/${tag}-${name}.jpg`, quality: 62, scale: 'css' }); const i = await info(); log.push({ tag, name, phase: i?.phase, said: await D(() => document.querySelector('.duel-msg')?.textContent ?? ''), combat: i?.combat ? { player: i.combat.player.hold, opp: i.combat.opponent.hold, lean: i.combat.opponent.lean, best: i.combat.best, attempt: i.combat.attempt, fall: i.combat.fall, referee: i.combat.referee } : null }); };
  const until = async (cond, ms = 60000) => { const t0 = Date.now(); for (;;) { const i = await info(); if (cond(i) || Date.now() - t0 > ms) return i; await page.waitForTimeout(80); } };
  /** A new bout against Gora (costaud, avec frappe), opponent held still, walked in to reach distance. */
  const fresh = async () => {
    if (await info()) { await D(() => { window.__dakar.duelAbandon(true); }); await until(i => !i || i.phase === 'result', 20000); await D(() => window.__dakar.duelFinish()); await until(i => !i, 20000); }
    await D(() => window.__dakar.duelStart('amical', 'costaud', 'avec_frappe', 'Gora'));
    await until(i => i?.phase === 'fight', 120000);
    await D(() => { window.__dakar.duelHold(true); window.__dakar.duelClock(90); });
    await until(i => { if (i.dist > 1.45) D(() => window.__dakar.duelStick(1, 0, 0.3)); return i.dist <= 1.45; });
  };
  /** Into the empoignade by the player's reach, with these holds. */
  const clinch = async (mine, his) => {
    await D(() => window.__dakar.duelReach('tap'));
    await until(i => i.phase === 'clinch', 20000);
    await D(([a, b]) => { window.__dakar.duelSet('player', { hold: a, stamina: 100, balance: 100 }); window.__dakar.duelSet('opponent', { hold: b, stamina: 90, balance: 100 }); }, [mine, his]);
    await until(i => (i.fx?.close ?? 1) >= 1, 15000); await page.waitForTimeout(600);
  };
  // 1 · the grip fight: his reach for the belt, seen coming (his hands go for it), the player's guard
  await fresh();
  await D(() => window.__dakar.duelHold(false));
  await D(() => window.__dakar.duelReach('hold'));
  await until(i => (i.combat?.player?.reach?.t ?? 0) > 0.25, 10000);
  await shot('1-grip-fight', 2);
  // 2 · the empoignade: chest to chest, the hands on the belt and on the nape
  await D(() => window.__dakar.duelHold(true));
  await until(i => i.phase === 'clinch', 20000);
  if ((await info()).phase !== 'clinch') await clinch(['ceinture', 70], ['nuque', 45]);
  await D(() => { window.__dakar.duelSet('player', { hold: ['ceinture', 70] }); window.__dakar.duelSet('opponent', { hold: ['nuque', 45] }); });
  await until(i => (i.fx?.close ?? 1) >= 1, 15000); await page.waitForTimeout(600);
  await shot('2-grips');
  // 3 · the imbalance: pushed back, his trunk arched, the button names the throw
  for (let k = 0; k < 5; k++) { await D(() => window.__dakar.duelStick(1, 0, 0.6)); await page.waitForTimeout(500); }
  await D(() => window.__dakar.duelSet('opponent', { balance: 52, lean: [-1, 0] }));
  await page.waitForTimeout(500);
  await shot('3-imbalance');
  // 4 · a throw: the croc (pushed back), its tell, then the fall and the referee's call
  await D(() => { window.__dakar.duelSet('player', { hold: ['nuque', 75] }); window.__dakar.duelSet('opponent', { balance: 45, lean: [-1, 0] }); window.__dakar.duelGrab(); });
  await until(i => (i.combat?.attempt?.t ?? 0) > 0.25, 8000);
  await shot('4-throw-croc', 2);
  await D(() => window.__dakar.duelHold(false));
  await until(i => i.phase === 'fall' && (i.fall?.t ?? 0) > 0.7, 20000);
  await shot('5-fall-croc', 2);
  await until(i => i.phase === 'fall' && i.fall?.arm, 20000);
  await shot('6-referee-call', 2);
  await until(i => i.phase === 'result', 30000); await page.waitForTimeout(800);
  await shot('7-result', 2);
  // 8 · another throw: the hip (pulled in), from the arm
  await fresh(); await clinch(['bras', 75], ['nuque', 40]);
  await D(() => { window.__dakar.duelSet('opponent', { balance: 45, lean: [1, 0] }); window.__dakar.duelGrab(); });
  await until(i => (i.combat?.attempt?.t ?? 0) > 0.35, 8000);
  await shot('8-throw-hanche', 2);
  await D(() => window.__dakar.duelHold(false));
  await until(i => i.phase === 'fall' && (i.fall?.t ?? 0) > 0.35, 20000);
  await shot('9-fall-hanche', 2);
  // 10 · a counter: his croc, turned (« Contrer »)
  await fresh(); await clinch(['ceinture', 85], ['nuque', 30]);
  await D(() => { window.__dakar.duelSet('opponent', { balance: 40 }); window.__dakar.duelAiThrow('croc'); });
  await until(i => (i.combat?.attempt?.t ?? 0) > 0.2, 8000);
  await shot('10-his-throw-contrer', 1);
  await D(() => window.__dakar.duelGrab());
  await D(() => window.__dakar.duelHold(false));
  await until(i => i.phase === 'fall' && (i.fall?.t ?? 0) > 0.4, 20000);
  await shot('11-counter-fall', 2);
  log.push({ tag, errors });
  await ctx.close();
}
await browser.close();
fs.writeFileSync(`${out}/captures.json`, JSON.stringify(log, null, 1));
console.log(JSON.stringify(log.filter(l => l.errors || l.name === '6-referee-call' || l.name === '11-counter-fall')));
