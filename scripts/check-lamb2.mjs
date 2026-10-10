// Headless checks of Làmb 2.0, step 1: the stand-up exchange of the « lutte avec frappe » (src/lamb/stand.ts,
// docs/LAMB2.md), behind the `lamb2` flag. Desktop: the arena menu offers it with ?lamb2 · three states and no HP ·
// a big strike out of reach misses and opens its author · a quick strike in reach takes balance and composure (or is
// guarded, at an endurance cost) · the guard absorbs the opponent's strikes for endurance · a wrestler out of balance
// staggers and a grab on him goes straight into the empoignade · the bout ends by projection, recap with the strikes,
// not counted in any record. Phone: no « avec frappe » without the flag, the five buttons fit, captures.
// Usage: node scripts/check-lamb2.mjs [baseUrl] [outDir]   — run it under the shared lock (flock /tmp/dakar-browser.lock).
// SwiftShader renders a few fps and the game clamps dt to 0.1 s, so every wait is on game state.
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:4249/';
const out = process.argv[3] ?? 'docs/screenshots/lamb2';
fs.mkdirSync(out, { recursive: true });
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok, extra }); console.log(ok ? 'PASS' : 'FAIL', name, typeof extra === 'string' ? extra : JSON.stringify(extra)); };
const launch = { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] };
if (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome')) launch.executablePath = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch(launch);
const SLOW = Number(process.env.LAMB_SLOW ?? 4);

async function open(vp, touch, flag) {
  const ctx = await browser.newContext({ viewport: vp, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'low'); } catch { /* */ } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60000 * SLOW);
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const url = m.location().url;
    if (url.endsWith('/assets/car_rapide.glb') && m.text().includes('404')) return;
    if (/ws|websocket|8787/i.test(m.text() + url)) return;
    errors.push(`${m.text()} ${url}`);
  });
  await page.goto(`${base}?debug${touch ? '&touch' : ''}${flag ? '&lamb2' : ''}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__dakar && window.__dakar.pos().hub, null, { timeout: 60000 * SLOW });
  await page.evaluate(() => { window.__dakar.teleport('pikine'); window.__dakar.setHour(16); });
  await page.waitForFunction(() => window.__dakar.pos().hub === 'pikine', null, { timeout: 30000 * SLOW });
  return { ctx, page, errors };
}
const info = page => page.evaluate(() => window.__dakar.duelInfo());
const wait = (page, fn, arg, timeout = 120000) => page.waitForFunction(fn, arg, { timeout: timeout * SLOW, polling: 120 }).then(() => true, () => false);
async function until(page, cond, act, budget = 120000) {
  let last = null;
  for (const t0 = Date.now(); Date.now() - t0 < budget * SLOW;) {
    last = await info(page);
    if (cond(last)) return last;
    if (act) await act(last);
    await page.waitForTimeout(100);
  }
  return last;
}
const shot = (page, name) => page.screenshot({ path: `${out}/${name}.jpg`, quality: 85 });
const strike = (page, kind) => page.evaluate(k => window.__dakar.duelStrike(k), kind);
/** Walks towards the opponent (screen right) until `dist` is at most `d`. */
async function closeIn(page, d) {
  const r = await until(page, i => !i || i.phase !== 'fight' || i.dist <= d, async () => { await page.keyboard.down('KeyD'); }, 60000);
  await page.keyboard.up('KeyD');
  return r;
}
/** Opens the friendly menu at the arena and returns its item texts. */
async function friendlyMenu(page) {
  const name = await page.evaluate(() => { const d = window.__dakar; d.state.data.flags.push('ecurie_baobab'); const a = d.interactables().find(i => i.id.endsWith(':arena')); d.place(a.x, a.z, 0); return a.name; });
  await wait(page, n => window.__dakar.nearestInteractable() === n, name, 30000);
  await page.evaluate(() => window.__dakar.act());
  await wait(page, () => document.querySelector('#modal.on'), null, 10000);
  await page.evaluate(() => [...document.querySelectorAll('#modal .item')].find(b => /Combat amical/.test(b.textContent))?.click());
  await wait(page, () => /Combat amical/.test(document.querySelector('#modal.on h2')?.textContent ?? ''), null, 10000);
  return page.evaluate(() => [...document.querySelectorAll('#modal .item')].map(b => b.textContent.replace(/\s+/g, ' ').trim()));
}

// ------------------------------------------------------------------ desktop, with the flag
{
  const { ctx, page, errors } = await open({ width: 1280, height: 720 }, false, true);
  const items = await friendlyMenu(page);
  check('menu: with ?lamb2 the friendly bouts include « avec frappe » against each style', ['Gora', 'Pape', 'Saliou'].every(n => items.some(t => t.includes(`Avec frappe · ${n}`))) && items.some(t => /Gora · Costaud · niveau/.test(t)), items.join(' | '));
  await shot(page, 'desktop-menu');
  await page.evaluate(() => [...document.querySelectorAll('#modal .item')].find(b => /Avec frappe · Gora/.test(b.textContent))?.click());
  await wait(page, () => window.__dakar.duelInfo()?.phase === 'fight');
  const i0 = await info(page);
  const hud = await page.evaluate(() => ({
    note: document.querySelector('.duel-note')?.textContent ?? '', legend: document.querySelector('.duel-legend')?.textContent ?? '',
    bars: ['me', 'mebal', 'mecmp', 'ai', 'aibal', 'aicmp'].every(k => !!document.querySelector(`[data-k=${k}]`)),
    buttons: [...document.querySelectorAll('.duel-btns button')].map(b => b.innerText.replace(/\s+/g, ' ')),
    hp: /\bPV\b|points de vie|\bHP\b|barre de vie/i.test(document.querySelector('.duel-ui')?.textContent ?? ''),
  }));
  check('bout: lutte avec frappe, three states (endurance, balance, composure) and no health bar', i0?.discipline === 'avec_frappe' && hud.bars && /Endurance/.test(hud.legend) && /Équilibre/.test(hud.legend) && /Sang-froid/.test(hud.legend) && /Lutte avec frappe/.test(hud.note) && !hud.hp && i0.balance.player === 100 && i0.composure.opponent === 100, { hud, balance: i0?.balance });
  check('bout: strike buttons next to grab, guard and step back', ['Frappe', 'Grosse frappe', 'Saisir', 'Garde', 'Reculer'].every(b => hud.buttons.some(t => t.replace(/\s+/g, ' ').includes(b))), hud.buttons.join(' | '));
  await shot(page, 'desktop-start');

  // a big strike out of reach: it misses and leaves the player open
  const far = await info(page);
  await strike(page, 'big');
  let seenBig = false;
  const miss = await until(page, i => i?.lastStrike?.by === 'player', async i => { if (!seenBig && i?.strike?.player === 'big') { seenBig = true; await shot(page, 'desktop-big-windup'); } }, 30000);
  check('big strike out of reach: misses, its author is open, endurance paid', far.dist > 2.2 && miss?.lastStrike?.kind === 'big' && miss.lastStrike.result === 'miss' && miss.open === 'player' && miss.stamina.player < far.stamina.player, { dist: far.dist, last: miss?.lastStrike, open: miss?.open, stamina: [far.stamina.player, miss?.stamina.player] });

  // quick strikes in reach: a clean hit takes the opponent's balance and composure; a guarded one costs him endurance
  await closeIn(page, 1.5);
  let hit = null, guarded = null, n = 0;
  const q = await until(page, i => !i || i.phase === 'fall' || i.phase === 'result' || (hit && (guarded || n > 16)) || n > 40, async i => {
    if (i?.phase === 'clinch') { await page.keyboard.up('KeyD'); if (i.clinch.losing && i.clinch.breakWindow) await page.evaluate(() => window.__dakar.duelBreak()); return; }
    if (i?.lastStrike?.by === 'player' && i.lastStrike.kind === 'quick') {
      if ((i.lastStrike.result === 'hit' || i.lastStrike.result === 'stagger') && !hit) hit = i;
      if (i.lastStrike.result === 'guarded' && !guarded) guarded = i;
    }
    if (i?.phase === 'fight' && !i.strike.player && i.open !== 'player') {
      if (i.dist > 1.55) { await page.keyboard.down('KeyD'); return; }
      await page.keyboard.up('KeyD');
      if (i.guard.opponent && !(hit && !guarded)) return;                      // strike when his guard is down (one guarded try is wanted too)
      await strike(page, 'quick'); n++;
    }
  }, 120000);
  await page.keyboard.up('KeyD');
  check('quick strike in reach: a clean hit takes balance and composure, never endurance', !!hit && hit.balance.opponent < 100 && hit.composure.opponent < 100 && hit.score.player.hits >= 1, hit ? { balance: hit.balance, composure: hit.composure, hits: hit.score.player.hits } : { phase: q?.phase, tries: n, last: q?.lastStrike });
  if (guarded) check('quick strike guarded: the guard pays endurance, the opponent scores a guard', guarded.score.opponent.guards >= 1, { guards: guarded.score.opponent.guards });
  await shot(page, 'desktop-exchange');

  // balance gone: the opponent staggers, and a grab on him goes straight into the empoignade
  let st = await until(page, j => !j || j.phase === 'fall' || j.phase === 'result' || j.stagger === 'opponent', async j => {
    if (j?.phase === 'clinch') { await page.keyboard.up('KeyD'); if (j.clinch.losing && j.clinch.breakWindow) await page.evaluate(() => window.__dakar.duelBreak()); return; }   // he grabbed: get out
    if (j?.phase !== 'fight' || j.strike.player || j.open === 'player') return;
    if (j.dist > 1.5) { await page.keyboard.down('KeyD'); return; }
    await page.keyboard.up('KeyD');
    await page.evaluate(() => window.__dakar.duelSet('opponent', { balance: 4 }));       // as after a few clean hits
    await strike(page, 'quick');
  }, 90000);
  await page.keyboard.up('KeyD');
  if (st?.stagger !== 'opponent') st = null;
  check('balance at zero: the opponent staggers (« vacille »)', st?.stagger === 'opponent' && st.score.player.staggers >= 1, st ? { staggers: st.score.player.staggers, balance: st.balance } : 'no stagger');
  if (st) {
    const label = await page.evaluate(() => document.querySelector('[data-k=aiopen]')?.textContent ?? '');
    // grab at once while he staggers (the player may still be recovering from his strike: press until it takes)
    const cl = await until(page, i => !i || i.phase !== 'fight' || i.stagger !== 'opponent', async i => {
      if (i.dist > 1.45) await page.keyboard.down('KeyD'); else { await page.keyboard.up('KeyD'); await page.evaluate(() => window.__dakar.duelGrab()); }
    }, 20000);
    await page.keyboard.up('KeyD');
    await shot(page, 'desktop-clinch-entry');
    check('a grab on a staggered opponent goes straight into the empoignade, with a strong grip (step 2)', /VACILLE/.test(label) && cl?.phase === 'clinch' && cl.clinch.by === 'player' && cl.clinch.entry === 'stagger' && cl.clinch.grip >= 40, { label, phase: cl?.phase, clinch: cl?.clinch });
  }

  // the guard: the opponent's strikes are absorbed for endurance
  let g = await info(page);
  if (g?.phase === 'clinch') g = await until(page, i => !i || i.phase !== 'clinch', async () => page.evaluate(() => window.__dakar.duelBreak()), 30000);
  if (g?.phase === 'fight') {
    await page.evaluate(() => window.__dakar.duelGuard(true));
    const gd = await until(page, i => !i || i.phase !== 'fight' || (i.lastStrike?.by === 'opponent' && i.lastStrike.result === 'guarded'), async i => { if (i?.phase === 'fight' && i.dist > 1.7) await page.keyboard.down('KeyD'); else await page.keyboard.up('KeyD'); }, 90000);
    await page.keyboard.up('KeyD');
    await page.evaluate(() => window.__dakar.duelGuard(false));
    check('guard: the opponent’s strike is absorbed (guarded) and counted', gd?.lastStrike?.by === 'opponent' && gd.lastStrike.result === 'guarded' && gd.score.player.guards >= 1, { phase: gd?.phase, last: gd?.lastStrike, guards: gd?.score?.player?.guards });
  }

  // to the end: grab and push the empoignade (projection), recap with the strikes, not counted
  const end = await until(page, i => !i || i.phase === 'fall' || i.phase === 'result', async i => {
    if (i?.phase === 'clinch') { for (let k = 0; k < 3; k++) await page.evaluate(() => window.__dakar.duelGrab()); return; }
    if (i?.phase === 'fight') { if (i.dist > 1.4) await page.keyboard.down('KeyD'); else { await page.keyboard.up('KeyD'); await page.evaluate(() => window.__dakar.duelGrab()); } }
  }, 200000);
  await page.keyboard.up('KeyD');
  check('the bout ends (projection after an empoignade, or the referee)', ['fall', 'result'].includes(end?.phase) && !!end.outcome, { phase: end?.phase, outcome: end?.outcome, winner: end?.winner });
  await wait(page, () => window.__dakar.duelInfo()?.phase === 'result', null, 60000);
  await page.waitForTimeout(400);
  const recap = await page.evaluate(() => document.querySelector('.duel-recap')?.textContent ?? '');
  await shot(page, 'desktop-recap');
  check('recap: strikes landed and staggers, lutte avec frappe', /Frappes touchées/.test(recap) && /Adversaire vacille/.test(recap) && /Lutte avec frappe/.test(recap), recap.slice(0, 160));
  const c0 = await page.evaluate(() => ({ ...window.__dakar.state.data.counters }));
  await page.evaluate(() => window.__dakar.duelFinish());
  await wait(page, () => window.__dakar.duelInfo() === null, null, 30000);
  const c1 = await page.evaluate(() => ({ ...window.__dakar.state.data.counters }));
  const keys = ['combats', 'victoires', 'lamb_amical_v', 'lamb_amical_d', 'lamb_amical_n', 'lamb_classe_v'];
  check('not counted: no record changes for a bout avec frappe (still being built)', keys.every(k => (c0[k] ?? 0) === (c1[k] ?? 0)), keys.map(k => `${k} ${c0[k] ?? 0}→${c1[k] ?? 0}`).join(', '));
  check('desktop: no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// ------------------------------------------------------------------ phone, without the flag
{
  const { ctx, page, errors } = await open({ width: 390, height: 844 }, true, false);
  const items = await friendlyMenu(page);
  check('phone: without the flag the arena offers the sans-frappe bouts only', !items.some(t => /Avec frappe/.test(t)) && items.some(t => /Gora/.test(t)), items.join(' | '));
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__dakar.duelStart('amical', 'rapide', 'avec_frappe'));
  await wait(page, () => window.__dakar.duelInfo()?.phase === 'fight');
  await page.waitForTimeout(600);
  const lay = await page.evaluate(() => {
    const r = el => { const b = el.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; };
    const btns = [...document.querySelectorAll('.duel-btns button')].map(b => ({ k: b.dataset.k, ...r(b) }));
    const joy = document.getElementById('joy'); const j = joy && getComputedStyle(joy).display !== 'none' ? r(joy) : null;
    const hit = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
    const overlaps = [];
    for (let i = 0; i < btns.length; i++) for (let k = i + 1; k < btns.length; k++) if (hit(btns[i], btns[k])) overlaps.push(`${btns[i].k}/${btns[k].k}`);
    if (j) for (const b of btns) if (hit(b, j)) overlaps.push(`${b.k}/joystick`);
    const inside = btns.every(b => b.l >= 0 && b.t >= 0 && b.r <= innerWidth && b.b <= innerHeight);
    return { n: btns.length, overlaps, inside, joy: j, bars: !!document.querySelector('[data-k=mebal]') };
  });
  check('phone: the five buttons fit on screen, apart from each other and from the joystick', lay.n === 5 && lay.inside && lay.overlaps.length === 0 && lay.bars, lay);
  await strike(page, 'big');
  await wait(page, () => window.__dakar.duelInfo()?.strike?.player === 'big', null, 20000);
  await shot(page, 'phone-big-windup');
  await closeIn(page, 1.5);
  await strike(page, 'quick');
  await page.waitForTimeout(300);
  await shot(page, 'phone-exchange');
  check('phone: no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

await browser.close();
fs.writeFileSync(`${out}/results.json`, JSON.stringify({ when: new Date().toISOString(), base, results }, null, 2));
const failed = results.filter(r => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} làmb 2.0 checks passed`);
process.exit(failed ? 1 : 0);
