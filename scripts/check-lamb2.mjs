// Headless checks of Làmb 2.0, steps 1–6: the stand-up exchange of the « lutte avec frappe » (src/lamb/stand.ts,
// docs/LAMB2.md), behind the `lamb2` flag. Desktop: the arena menu offers it with ?lamb2 · three states and no HP ·
// a big strike out of reach misses and opens its author · a quick strike in reach takes balance and composure (or is
// guarded, at an endurance cost) · the guard absorbs the opponent's strikes for endurance · a wrestler out of balance
// staggers and a grab on him goes straight into the empoignade (grip) · in the empoignade, reading his move and
// answering it wins the exchange, a lost grip makes the balance slip (felt on screen), Casser breaks free, a
// throw on a wrestler who slips takes him down, then the fall (slow-down, referee, crowd) (desktop), his throw is countered with « Contrer » (phone) · recap with the strikes,
// not counted in any record. Phone: no « avec frappe » without the flag, the five buttons fit, Coach Ablaye's lesson
// (his word, the buttons highlighted step by step, « Passer »), captures. The gauges (src/ui/style.css): each named on
// its bar, the Prise with « toi » / « lui », readable and clear of the buttons and the joystick on 390×844, 844×390,
// 360×640 and 667×375.
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

/**
 * The duel's touch buttons: on screen, apart from each other, from the joystick and from any other control that is
 * showing (action button, « Courir », the gesture card), labels readable (≥ 11 px, not cut).
 */
const layout = page => page.evaluate(() => {
  const r = el => { const b = el.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; };
  const shown = el => !!el && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden' && el.getBoundingClientRect().width > 0;
  const btns = [...document.querySelectorAll('.duel-btns button')].map(b => ({ k: b.dataset.k, text: b.innerText.replace(/\s+/g, ' ').trim(), font: parseFloat(getComputedStyle(b).fontSize), cut: b.scrollWidth > b.clientWidth + 1 || b.scrollHeight > b.clientHeight + 1, ...r(b) }));
  const hit = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
  const others = ['joy', 'runBtn', 'act', 'actMore', 'gesture'].map(id => document.getElementById(id)).filter(shown).map(el => ({ k: el.id, ...r(el) }));
  const overlaps = [];
  for (let i = 0; i < btns.length; i++) for (let k = i + 1; k < btns.length; k++) if (hit(btns[i], btns[k])) overlaps.push(`${btns[i].k}/${btns[k].k}`);
  for (const o of others) for (const b of btns) if (hit(b, o)) overlaps.push(`${b.k}/${o.k}`);
  const inside = btns.every(b => b.l >= 0 && b.t >= 0 && b.r <= innerWidth && b.b <= innerHeight);
  const unreadable = btns.filter(b => b.font < 11 || b.cut).map(b => `${b.k}:${b.font}px${b.cut ? ' cut' : ''}`);
  return { n: btns.length, labels: btns.map(b => b.text), overlaps, inside, unreadable, others: others.map(o => o.k), bars: !!document.querySelector('[data-k=mebal]'), vw: innerWidth, vh: innerHeight };
});
const layoutOk = l => l.n === 5 && l.inside && l.overlaps.length === 0 && l.unreadable.length === 0 && l.bars;
/**
 * The duel's gauges (src/ui/style.css restyles the markup of src/lamb/duel.ts): each side's three bars named on the bar
 * (Endurance, Équilibre, Sang-froid, ≥ 10.5 px, the bar ≥ 6 px tall and ≥ 56 px long), in the Prise panel « toi » and
 * « lui » over the bar and its words (≥ 12 px); no life bar; every block on screen, apart from each other, never under
 * the duel's buttons or the joystick (the message: its words, not its full-width box).
 */
const gauges = page => page.evaluate(() => {
  const r = el => { const b = el.getBoundingClientRect(); return { l: Math.round(b.left), t: Math.round(b.top), r: Math.round(b.right), b: Math.round(b.bottom) }; };
  const shown = el => !!el && !el.hidden && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0;
  const hit = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
  const pseudo = (el, w) => { const c = getComputedStyle(el, w); return { text: c.content.replace(/^"|"$/g, ''), font: parseFloat(c.fontSize) }; };
  const sides = ['me', 'ai'].map(k => {
    const panel = document.querySelector(`[data-k=${k}bar]`);
    const bars = [...(panel?.querySelectorAll(':scope > i') ?? [])].map(i => ({ ...pseudo(i, '::before'), h: Math.round(i.getBoundingClientRect().height), w: Math.round(i.getBoundingClientRect().width), roomLeft: Math.round(i.getBoundingClientRect().left - panel.getBoundingClientRect().left) }));
    return { k, box: panel ? r(panel) : null, bars };
  });
  const named = sides.every(sd => sd.bars.map(b => b.text).join(',') === 'Endurance,Équilibre,Sang-froid' && sd.bars.every(b => b.font >= 10.5 && b.h >= 6 && b.w >= 56 && b.roomLeft >= 56));
  const cl = document.querySelector('.duel-clinch'), clOn = shown(cl), tug = cl?.querySelector(':scope > i');
  const prise = clOn ? { left: pseudo(tug, '::before').text, right: pseudo(tug, '::after').text, words: cl.querySelector('em')?.textContent ?? '', font: parseFloat(getComputedStyle(cl.querySelector('em')).fontSize), h: Math.round(tug.getBoundingClientRect().height) } : null;
  const msg = document.querySelector('.duel-msg'), rg = document.createRange(); rg.selectNodeContents(msg);
  const mr = rg.getBoundingClientRect(), msgBox = msg.textContent && mr.width > 0 ? { l: Math.round(mr.left), t: Math.round(mr.top), r: Math.round(mr.right), b: Math.round(mr.bottom) } : null;
  const blocks = [
    ...sides.filter(sd => sd.box).map(sd => ({ k: `${sd.k}bar`, ...sd.box })),
    ...[['note', '.duel-note'], ['step', '.duel-step'], ['clinch', '.duel-clinch'], ['head', '.duel-head'], ['timer', '.duel-timer'], ['abandon', '.duel-ab']].map(([k, q]) => [k, document.querySelector(q)]).filter(([, el]) => shown(el)).map(([k, el]) => ({ k, ...r(el) })),
    ...(msgBox ? [{ k: 'msg', ...msgBox }] : []),
  ];
  const controls = [...[...document.querySelectorAll('.duel-btns button')].map(b => ({ k: b.dataset.k, ...r(b) })), ...(shown(document.getElementById('joy')) ? [{ k: 'joy', ...r(document.getElementById('joy')) }] : [])];
  const clashes = [];
  for (const b of blocks) for (const c of controls) if (hit(b, c)) clashes.push(`${b.k}/${c.k}`);
  for (let i = 0; i < blocks.length; i++) for (let j = i + 1; j < blocks.length; j++) {
    const a = blocks[i], b = blocks[j];
    if (['head', 'timer', 'abandon'].includes(a.k) && ['head', 'timer', 'abandon'].includes(b.k)) continue;   // the duel's own top row
    if (hit(a, b)) clashes.push(`${a.k}/${b.k}`);
  }
  const off = blocks.filter(b => b.l < 0 || b.t < 0 || b.r > innerWidth || b.b > innerHeight).map(b => b.k);
  const lifeBar = /\bPV\b|points de vie|\bHP\b|barre de vie/i.test(document.querySelector('.duel-ui')?.textContent ?? '');
  return { vw: innerWidth, vh: innerHeight, named, sides, prise, clashes, off, lifeBar, legend: shown(document.querySelector('.duel-legend')) };
});
const gaugesOk = (g, clinch = false) => g.named && !g.lifeBar && !g.legend && g.clashes.length === 0 && g.off.length === 0
  && (!clinch || (!!g.prise && g.prise.left === 'Prise · toi' && g.prise.right === 'lui' && /^Prise : /.test(g.prise.words) && g.prise.font >= 12 && g.prise.h >= 10));

// ------------------------------------------------------------------ desktop, with the flag
{
  const { ctx, page, errors } = await open({ width: 1280, height: 720 }, false, true);
  const items = await friendlyMenu(page);
  check('menu: with ?lamb2 the friendly bouts include « avec frappe » against each of the six styles', ['Gora', 'Pape', 'Saliou', 'Ousmane · Technicien', 'Malick · Bon frappeur', 'Daouda · Grand lutteur de saisie'].every(n => items.some(t => t.includes(`Avec frappe · ${n}`))) && items.some(t => /Gora · Costaud · niveau/.test(t)), items.join(' | '));
  await shot(page, 'desktop-menu');
  await page.evaluate(() => [...document.querySelectorAll('#modal .item')].find(b => /Avec frappe · Gora/.test(b.textContent))?.click());
  // the opponent as himself: who he is, in one line, before the bout (intro) and in the header
  await wait(page, () => /Face à toi/.test(document.querySelector('.duel-msg')?.textContent ?? ''), null, 30000);
  const intro = await page.evaluate(() => ({ msg: document.querySelector('.duel-msg')?.textContent ?? '', head: document.querySelector('.duel-head small')?.textContent ?? '', id: window.__dakar.duelInfo()?.identity }));
  await shot(page, 'desktop-intro-identity');
  check('the opponent is the roster’s Gora: « Face à toi : Gora, costaud indépendant, V-D » before the bout, and in the header', /^Gora, costaud indépendant, \d+-\d+/.test(intro.id ?? '') && intro.msg.includes(intro.id) && intro.head.includes(intro.id), intro);
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

  // step 3: the empoignade is played — the buttons change, reading his move and answering it wins the exchange
  const ANSWER = { push: 'pull', pull: 'pivot', pivot: 'push' };
  // the earlier steps took their time: give the empoignade steps a whole round, so the bell does not end it first, and
  // fresh legs (a wrestler spent in the empoignade can no longer hold his balance)
  await page.evaluate(() => { window.__dakar.duelClock(90); window.__dakar.duelSet('player', { stamina: 100 }); });
  const intoClinch = () => until(page, i => !i || i.phase !== 'fight', async i => {
    if (i.dist > 1.4) await page.keyboard.down('KeyD'); else { await page.keyboard.up('KeyD'); await page.evaluate(() => window.__dakar.duelGrab()); }
  }, 60000).finally(() => page.keyboard.up('KeyD'));
  let cl3 = await intoClinch();
  const labels = await page.evaluate(() => [...document.querySelectorAll('.duel-btns button')].map(b => b.innerText.replace(/\s+/g, ' ').trim()));
  check('empoignade: the five buttons become Pousser, Tirer, Pivoter, Casser (Projeter next)', cl3?.phase === 'clinch' && ['Pousser', 'Tirer', 'Pivoter', 'Casser'].every(w => labels.some(t => t.startsWith(w))), { phase: cl3?.phase, labels });
  let read = null, seen = null;
  const cx = await until(page, i => !i || i.phase === 'fall' || i.phase === 'result' || !!read, async i => {
    if (i.phase === 'fight') { await intoClinch(); return; }
    const c = i.clinch;
    if (c.last?.winner === 'player' && c.last.result === 'counter') { read = i; return; }
    if (c.move.opponent && !c.move.player) { seen = c.move.opponent; await page.evaluate(m => window.__dakar.duelMove(m), ANSWER[c.move.opponent]); }
  }, 150000);
  if (read) await shot(page, 'desktop-clinch-counter');
  check('empoignade: reading his move and answering with the one that beats it wins the exchange (he slips)', !!read && read.balance.opponent < 100, read ? { last: read.clinch.last, balance: read.balance, grip: read.clinch.grip } : { phase: cx?.phase, seen, last: cx?.clinch?.last });
  // step 4: a grip clearly against you wears your balance away — the screen, the bar and the words say so.
  // From here to the throw the opponent, the round's clock and the referee are held still (duelHold): no move, throw
  // or counter of his, no bell, no separation — only the position set up works, alike on every run.
  await page.evaluate(() => window.__dakar.duelHold(true));
  let sl = await info(page);
  if (sl?.phase === 'fight') sl = await intoClinch();
  if (sl?.phase === 'clinch') {
    const b0 = sl.balance.player;
    await page.evaluate(() => { const d = window.__dakar; d.duelSet('opponent', { balance: 90 }); d.duelSet('player', { grip: -85, balance: Math.min(50, d.duelInfo().balance.player) }); });
    const sv = await until(page, i => !i || i.phase !== 'clinch' || i.clinch.posture.player !== 'stable', async () => page.evaluate(() => window.__dakar.duelSet('player', { grip: -85 })), 40000);
    // the words come once an earlier message has had its moment
    await wait(page, () => /glisses|tomber/.test(document.querySelector('.duel-msg')?.textContent ?? ''), null, 4000);
    const ui = await page.evaluate(() => ({ cls: document.querySelector('.duel-ui')?.className ?? '', msg: document.querySelector('.duel-msg')?.textContent ?? '', warn: !!document.querySelector('[data-k=mebal].warn') }));
    if (sv?.phase === 'clinch') await shot(page, 'desktop-clinch-slipping');
    check('empoignade: with his grip on you, your balance slips away and you feel it (edge of the screen, bar, words)', sv?.phase === 'clinch' && sv.clinch.posture.player !== 'stable' && sv.balance.player < Math.min(50, b0) && /slip|falling/.test(ui.cls) && ui.warn && /glisses|tomber/.test(ui.msg), { posture: sv?.clinch?.posture, balance: sv?.balance, ui });
    await page.evaluate(() => window.__dakar.duelSet('player', { grip: 0, balance: 80, stamina: 100 }));
  }
  // breaking free when the grip allows it
  let bf = await info(page);
  if (bf?.phase === 'clinch') {
    const before = bf.score.player.breaks;
    bf = await until(page, i => !i || i.phase !== 'clinch', async i => { if (!i.clinch.move.player && i.clinch.grip > -30) await page.evaluate(() => window.__dakar.duelBreak()); }, 40000);
    check('empoignade: breaking free (Casser) when the grip is not against you', bf?.phase === 'fight' && bf.score.player.breaks > before, { phase: bf?.phase, breaks: bf?.score?.player?.breaks });
  }
  // the evening's stands fill (18 h, a fight evening): they will react to the fall
  await page.evaluate(() => window.__dakar.setHour(18));
  const filled = await wait(page, () => (window.__dakar.arena.info()?.crowd?.present ?? 0) > 20, null, 30000);
  // step 5: « Projeter » on a man who slips, with the grip — the throw takes him down (he may block it: try again)
  let sawAttempt = false;
  const end = await until(page, i => !i || i.phase === 'fall' || i.phase === 'result', async i => {
    if (i.phase === 'fight') { await intoClinch(); return; }
    if (i.phase !== 'clinch') return;
    if (i.clinch.attempt) { if (i.clinch.attempt.by === 'player' && !sawAttempt) { sawAttempt = true; await shot(page, 'desktop-throw-attempt'); } return; }
    await page.evaluate(() => { window.__dakar.duelSet('opponent', { balance: 28, grip: -40 }); window.__dakar.duelSet('player', { stamina: 100 }); });   // as after a few lost exchanges
    if (!i.clinch.move.player) await page.evaluate(() => window.__dakar.duelThrow());
  }, 150000);
  await page.keyboard.up('KeyD');
  await page.evaluate(() => window.__dakar.duelHold(false));
  const lt = end?.lastThrow;
  check('step 5: a throw on a wrestler who slips, with the grip, takes him down (projection)', ['fall', 'result'].includes(end?.phase) && end.outcome === 'projection' && end.winner === 'player' && lt?.by === 'player' && lt.result === 'fall' && sawAttempt, { phase: end?.phase, outcome: end?.outcome, winner: end?.winner, lastThrow: lt, sawAttempt });
  // the stands react to your fall: your side celebrates, the other side and the ends hold their heads
  const stands = () => page.evaluate(() => (window.__dakar.crowds?.list() ?? []).find(c => c.name === 'arena-stands') ?? null);
  let st6 = null;
  for (const t0 = Date.now(); Date.now() - t0 < 30000 * SLOW;) { st6 = await stands(); if ((st6?.kinds?.celebrate ?? 0) > 0 && (st6?.kinds?.fall ?? 0) > 0) break; await page.waitForTimeout(150); }
  check('the stands react to the fall: the winner’s side celebrates, the other side holds its head', filled && (st6?.kinds?.celebrate ?? 0) > 0 && (st6?.kinds?.fall ?? 0) > 0, { filled, kinds: st6?.kinds, present: st6?.present });
  // step 6: the fall — a short slow-down on him going down, the referee comes up and raises your arm, the stands explode
  const slow = end?.phase === 'fall' && !!end.fall?.slow;
  if (slow) await shot(page, 'desktop-fall-slow');
  const fr = await until(page, i => !i || i.phase !== 'fall' || (i.fall?.arm && i.fall.cheered), null, 60000);
  const fmsg = await page.evaluate(() => document.querySelector('.duel-msg')?.textContent ?? '');
  if (fr?.phase === 'fall') await shot(page, 'desktop-fall-referee');
  check('step 6: the fall — a short slow-down, the referee walks up and raises the winner’s arm, the stands explode, then the result', slow && fr?.phase === 'fall' && fr.fall.arm && fr.fall.cheered && fr.fall.referee < fr.fall.refereeFrom && /arbitre lève ton bras/.test(fmsg), { slow, fall: fr?.fall, msg: fmsg });
  await wait(page, () => window.__dakar.duelInfo()?.phase === 'result', null, 60000);
  await page.waitForTimeout(400);
  const recap = await page.evaluate(() => document.querySelector('.duel-recap')?.textContent ?? '');
  await shot(page, 'desktop-recap');
  check('recap: strikes landed and staggers, lutte avec frappe, and who he was', /Frappes touchées/.test(recap) && /Adversaire vacille/.test(recap) && /Lutte avec frappe/.test(recap) && /Gora, costaud indépendant, \d+-\d+/.test(recap), recap.slice(0, 200));
  const c0 = await page.evaluate(() => ({ ...window.__dakar.state.data.counters }));
  await page.evaluate(() => window.__dakar.duelFinish());
  await wait(page, () => window.__dakar.duelInfo() === null, null, 30000);
  const c1 = await page.evaluate(() => ({ ...window.__dakar.state.data.counters }));
  const same = ['lamb_amical_v', 'lamb_amical_d', 'lamb_amical_n', 'lamb_classe_v'], af = ['lamb_af_amical_v', 'lamb_af_amical_d', 'lamb_af_amical_n'];
  const d = k => (c1[k] ?? 0) - (c0[k] ?? 0);
  check('recorded apart: the avec-frappe record (lamb_af_*) and the global count move, the sans-frappe record does not', same.every(k => d(k) === 0) && af.reduce((a, k) => a + d(k), 0) === 1 && d('combats') === 1,
    [...same, ...af, 'combats', 'victoires'].map(k => `${k} ${c0[k] ?? 0}→${c1[k] ?? 0}`).join(', '));
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
  const lay = await layout(page);
  check('phone 390×844: the five buttons fit, apart from each other, the joystick and any other control, labels readable', layoutOk(lay), lay);
  const g1 = await gauges(page);
  check('phone 390×844: the gauges named on their bars (Endurance, Équilibre, Sang-froid), no life bar, nothing under the buttons or the joystick', gaugesOk(g1), g1);
  await shot(page, 'phone-gauges');
  await strike(page, 'big');
  await wait(page, () => window.__dakar.duelInfo()?.strike?.player === 'big', null, 20000);
  await shot(page, 'phone-big-windup');
  await closeIn(page, 1.5);
  await strike(page, 'quick');
  await page.waitForTimeout(300);
  await shot(page, 'phone-exchange');
  // step 5 on the phone: he tries a throw, the button turns to « Contrer », and a steady counter turns it
  let hot = false, label = '', clinchLay = null, clinchG = null;
  const ph = await until(page, i => !i || i.phase === 'fall' || i.phase === 'result', async i => {
    if (i.phase === 'fight') { if (i.dist > 1.4) await page.keyboard.down('KeyD'); else { await page.keyboard.up('KeyD'); await page.evaluate(() => window.__dakar.duelGrab()); } return; }
    if (i.phase !== 'clinch') return;
    if (!clinchLay) { clinchLay = await layout(page); clinchG = await gauges(page); await shot(page, 'phone-clinch'); }
    const at = i.clinch.attempt;
    if (at?.by === 'opponent') {
      if (!at.counter) {
        const b = await page.evaluate(() => { const el = document.querySelector('[data-k=big]'); return { hot: el?.classList.contains('hot'), text: el?.innerText ?? '' }; });
        if (b.hot && /Contrer/.test(b.text)) { hot = true; label = b.text; if (!(await page.evaluate(() => window.__dakar.duelInfo()?.clinch?.attempt?.counter))) await shot(page, 'phone-counter'); }
        await page.evaluate(() => window.__dakar.duelSet('player', { balance: 90, grip: 20 }));    // he finds his feet in time
        await page.evaluate(() => window.__dakar.duelThrow());
      }
      return;
    }
    await page.evaluate(() => window.__dakar.duelSet('player', { balance: 22, grip: -45 }));     // as if he had the upper hand: bait the throw
  }, 150000);
  await page.keyboard.up('KeyD');
  check('phone, step 5: his throw turns the button into « Contrer », and the counter turns it (he goes down)', hot && /Contrer/.test(label) && ph?.lastThrow?.by === 'opponent' && ph.lastThrow.result === 'countered' && ph.winner === 'player', { hot, label, lastThrow: ph?.lastThrow, phase: ph?.phase, winner: ph?.winner });
  check('phone 390×844, empoignade: Pousser, Tirer, Pivoter, Casser, Projeter — fit and readable', !!clinchLay && layoutOk(clinchLay) && ['Pousser', 'Tirer', 'Pivoter', 'Casser', 'Projeter'].every(w => clinchLay.labels.some(t => t.startsWith(w))), clinchLay);
  check('phone 390×844, empoignade: the Prise named (« toi » / « lui »), its words readable, the four gauges clear of the buttons', !!clinchG && gaugesOk(clinchG, true), clinchG);
  check('phone: no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// ------------------------------------------------------------------ phone in landscape (844×390)
{
  const { ctx, page, errors } = await open({ width: 844, height: 390 }, true, false);
  await page.evaluate(() => window.__dakar.duelStart('amical', 'defensif', 'avec_frappe'));
  await wait(page, () => window.__dakar.duelInfo()?.phase === 'fight');
  await page.waitForTimeout(600);
  const l1 = await layout(page);
  check('phone 844×390: the five buttons fit, apart from each other, the joystick and any other control, labels readable', layoutOk(l1), l1);
  const lg1 = await gauges(page);
  check('phone 844×390: the gauges named on their bars in the top row, nothing under the buttons, the joystick or the title', gaugesOk(lg1), lg1);
  await shot(page, 'phone-landscape-fight');
  const cl = await until(page, i => !i || i.phase !== 'fight', async i => {
    if (i.dist > 1.4) await page.keyboard.down('KeyD'); else { await page.keyboard.up('KeyD'); await page.evaluate(() => window.__dakar.duelGrab()); }
  }, 60000);
  await page.keyboard.up('KeyD');
  if (cl?.phase === 'clinch') { await page.waitForTimeout(300); await shot(page, 'phone-landscape-clinch'); }
  const l2 = cl?.phase === 'clinch' ? await layout(page) : null;
  check('phone 844×390, empoignade: relabelled buttons fit and read', !!l2 && layoutOk(l2) && l2.labels.some(t => t.startsWith('Pousser')), l2 ?? { phase: cl?.phase });
  const lg2 = cl?.phase === 'clinch' ? await gauges(page) : null;
  check('phone 844×390, empoignade: the Prise named and readable, between the gauges and the buttons', !!lg2 && gaugesOk(lg2, true), lg2 ?? { phase: cl?.phase });
  check('phone landscape: no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// ------------------------------------------------------------------ small phones: 360×640 portrait, 667×375 landscape
for (const vp of [{ width: 360, height: 640 }, { width: 667, height: 375 }]) {
  const tag = `${vp.width}×${vp.height}`;
  const { ctx, page, errors } = await open(vp, true, false);
  await page.evaluate(() => window.__dakar.duelStart('amical', 'rapide', 'avec_frappe'));
  await wait(page, () => window.__dakar.duelInfo()?.phase === 'fight');
  await page.waitForTimeout(600);
  const l = await layout(page), g = await gauges(page);
  check(`small phone ${tag}: the five buttons fit, apart from each other and the joystick, labels readable`, layoutOk(l), l);
  check(`small phone ${tag}: the gauges named on their bars, no life bar, nothing under the buttons or the joystick`, gaugesOk(g), g);
  await shot(page, `phone-${tag}-fight`);
  const c = await until(page, i => !i || i.phase !== 'fight', async i => {
    if (i.dist > 1.4) await page.keyboard.down('KeyD'); else { await page.keyboard.up('KeyD'); await page.evaluate(() => window.__dakar.duelGrab()); }
  }, 60000);
  await page.keyboard.up('KeyD');
  if (c?.phase === 'clinch') { await page.evaluate(() => window.__dakar.duelSet('player', { grip: 30 })); await page.waitForTimeout(300); await shot(page, `phone-${tag}-clinch`); }
  const gc = c?.phase === 'clinch' ? await gauges(page) : null;
  check(`small phone ${tag}, empoignade: the Prise named and readable, clear of the buttons and the joystick`, !!gc && gaugesOk(gc, true), gc ?? { phase: c?.phase });
  check(`small phone ${tag}: no page errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// ------------------------------------------------------------------ phone: Coach Ablaye's lesson avec frappe at the écurie
{
  const { ctx, page, errors } = await open({ width: 390, height: 844 }, true, true);
  await page.evaluate(() => window.__dakar.duelStart('entrainement', undefined, 'avec_frappe'));
  await wait(page, () => window.__dakar.duelInfo()?.phase === 'fight' && window.__dakar.duelInfo()?.lesson?.step === 'distance', null, 60000);
  await page.waitForTimeout(400);
  const read = () => page.evaluate(() => ({
    step: window.__dakar.duelInfo()?.lesson?.step,
    box: document.querySelector('.duel-step')?.innerText ?? '',
    teach: [...document.querySelectorAll('.duel-btns button.teach')].map(b => b.dataset.k),
    joy: !!document.querySelector('#joy.teach'),
  }));
  const s1 = await read();
  await shot(page, 'phone-lesson-distance');
  check('lesson: Coach Ablaye’s first step, with his word (Wolof and its gloss, then French), the joystick highlighted', s1.step === 'distance' && /Coach Ablaye/.test(s1.box) && /«/.test(s1.box) && /\(viens ici\)/.test(s1.box) && /Passer/.test(s1.box) && s1.joy && s1.teach.length === 0, s1);
  await page.evaluate(() => [...document.querySelectorAll('.duel-step button')].find(b => /Passer/.test(b.textContent))?.click());
  await wait(page, () => window.__dakar.duelInfo()?.lesson?.step === 'quick', null, 20000);
  await page.waitForTimeout(300);
  const s2 = await read();
  check('lesson: « Passer » moves on; the quick strike step highlights « Frappe »', s2.step === 'quick' && s2.teach.join() === 'quick' && !s2.joy, s2);
  for (let k = 0; k < 3; k++) await page.evaluate(() => window.__dakar.duelLessonSkip());
  await wait(page, () => window.__dakar.duelInfo()?.lesson?.step === 'grab', null, 20000);
  for (let k = 0; k < 1; k++) await page.evaluate(() => window.__dakar.duelLessonSkip());
  await wait(page, () => window.__dakar.duelInfo()?.lesson?.step === 'moves' && window.__dakar.duelInfo()?.phase === 'clinch', null, 30000);
  await page.waitForTimeout(400);
  const s3 = await read();
  await shot(page, 'phone-lesson-moves');
  check('lesson: in the empoignade, Pousser / Tirer / Pivoter are highlighted', s3.step === 'moves' && ['grab', 'guard', 'quick'].every(k => s3.teach.includes(k)), s3);
  const lsg = await gauges(page);
  check('lesson (phone 390×844): Coach Ablaye’s card, the message, the Prise and the gauges apart, clear of the buttons', gaugesOk(lsg, true), lsg);
  for (let k = 0; k < 5; k++) await page.evaluate(() => window.__dakar.duelLessonSkip());
  const end = await wait(page, () => window.__dakar.duelInfo()?.phase === 'result', null, 60000);
  const rec = await page.evaluate(() => ({ outcome: window.__dakar.duelInfo()?.outcome, recap: document.querySelector('.duel-recap')?.textContent ?? '' }));
  check('lesson: skipped to the end, it closes as the usual training (recap, no other reward)', end && rec.outcome === 'entrainement' && /Entraînement terminé/.test(rec.recap), rec);
  check('lesson: no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

await browser.close();
fs.writeFileSync(`${out}/results.json`, JSON.stringify({ when: new Date().toISOString(), base, results }, null, 2));
const failed = results.filter(r => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} làmb 2.0 checks passed`);
process.exit(failed ? 1 : 0);
