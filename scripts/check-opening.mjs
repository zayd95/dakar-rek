// 1.0.1: the opening fly-in (src/game/opening.ts) on a phone-sized touch page, with real touch (scripts/lib/realTouch.mjs).
// Usage: node scripts/check-opening.mjs <baseUrl> [outDir=docs/proof/release-1.0.1/opening] [parts=flight,skip,first,reduced,replay,perf,shots]
//   flight   a new game (the New Game studio, real taps) plays the flight: the camera moves for 12–18 s with the HUD hidden, lands on the play camera
//            without a jump, the HUD and the welcome come back, the stick walks the player; no JavaScript error;
//   skip     a tap anywhere during the flight lands on the same play camera within a second (« Passer » shown meanwhile), and the player walks; on a renderer slower
//            than 4 frames a second: on the first frame drawn after the page received the tap (or the next), the wall clock printed;
//   first    without ?debug (the public path): a first launch plays it, a reload does not, a New Game on the same device does not either;
//   reduced  prefers-reduced-motion: a short fade to the play camera, the camera never moving;
//   replay   Réglages › « Revoir l'ouverture » plays it again in Pikine (and says where it can be seen elsewhere);
//   perf     the frames drawn during the flight, the player in a body of the New Game studio (homme at 10 h, femme at 21 h): peak draw calls and
//            triangles on « Basse », « Moyenne », « Haute », at 10 h and 21 h (the budgets:
//            180 / 300 / 420 calls). Counts carry over to a phone; frame TIMES here are a software renderer's and are not reported;
//   shots    four moments, deviceScaleFactor 2, into outDir (17.5 h, or SHOT_HOUR; a clear day held).
// ?debug runs skip the opening; `?intro` (test hosts) forces it. It does not say how the game runs on a phone. The opening keeps the wall clock (a frame counts
// one second at most): when this machine's software renderer draws slower than 4 frames a second, the 14 s are checked on the opening's own clock and frame by
// frame, and the wall-clock times are printed, not judged.
import fs from 'node:fs';
import { chromium } from 'playwright';
import { realTouch } from './lib/realTouch.mjs';

const [baseArg = 'http://127.0.0.1:4735/', out = 'docs/proof/release-1.0.1/opening', partsArg = 'flight,skip,first,reduced,replay,perf,shots'] = process.argv.slice(2);
const base = baseArg.endsWith('/') ? baseArg : baseArg + '/', parts = new Set(partsArg.split(','));
fs.mkdirSync(out, { recursive: true });
const T = { timeout: 300000 };
let fails = 0; const check = (n, ok, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${n}${d ? ' ' + d : ''}`); if (!ok) fails++; };
const BUDGET = { low: 180, medium: 300, high: 420 };
const errors = [];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });

/** A phone-sized touch page (the quality preset kept in its storage), errors collected; `reduced`: prefers-reduced-motion. */
async function phone({ quality = 'medium', dsf = 1, reduced = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: dsf, isMobile: true, hasTouch: true, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  await context.addInitScript(q => {
    try { if (!localStorage.getItem('dakarrek.quality')) localStorage.setItem('dakarrek.quality', q); } catch { /* */ }
    // a New Game on this device (part « first »): the save goes before the game reads it, after the page that is left wrote it one last time
    try { if (sessionStorage.getItem('wipeSave') === '1') { sessionStorage.removeItem('wipeSave'); localStorage.removeItem('dakarrek.guest.save.v6'); } } catch { /* */ }
    // did this page ever play the opening (the public path has no debug API: the HUD's body class says it)
    window.__openingShown = false;
    // (the document itself: its <html> element does not exist yet when this runs)
    new MutationObserver(() => { if (document.body?.classList.contains('opening')) window.__openingShown = true; }).observe(document, { subtree: true, attributes: true, attributeFilter: ['class'] });
    // every drawn frame from the page's start, sampled just after the game drew it (a task queued from the frame's callbacks runs after all of them):
    // the opening's phase and second, the camera, the HUD, the draw calls and triangles of that frame, the mode
    window.__rec = [];
    const sample = () => {
      const A = window.__dakar, ui = document.getElementById('ui');
      if (!A?.opening || !A.pos().hub || !A.drawCalls()) return;
      const o = A.opening();
      window.__rec.push({ ms: performance.now(), phase: o.phase, t: o.t, hud: o.hud, cam: A.camera().at, calls: A.drawCalls(), tris: A.tris(), mode: A.pos().mode, ui: +getComputedStyle(ui).opacity });
    };
    const loop = () => { setTimeout(sample, 0); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    // the moment the page receives each finger (part « skip »): on a loaded machine a tap reaches a busy page later than the harness sends it
    window.__downs = [];
    addEventListener('pointerdown', () => window.__downs.push(performance.now()), true);
    // every message the HUD gives as it comes (src/ui/hud.ts toast: read out in #toast's live region, and shown, or kept in the phone's notifications by the
    // quiet screen's rules, src/ui/quiet.ts): a slow renderer can outlast one between two looks
    window.__toasts = [];
    new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && n.parentElement?.closest('#toast')) window.__toasts.push({ ms: performance.now(), text: n.textContent }); })
      .observe(document, { subtree: true, childList: true });
  }, quality);
  const page = await context.newPage(); page.setDefaultTimeout(300000);
  page.on('pageerror', e => errors.push('pageerror: ' + e.message.slice(0, 200)));
  page.on('console', m => { if (m.type() === 'error' && !/car_rapide\.glb|favicon/.test(m.text() + (m.location()?.url ?? ''))) errors.push('console: ' + m.text().slice(0, 200)); });
  return { context, page };
}
const d3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const median = xs => { const v = [...xs].sort((a, b) => a - b); return v.length ? v[v.length >> 1] : 0; };
/** Seconds between two drawn frames (the renderer's pace: the wall-clock checks need 4 frames a second at least). */
const pace = rec => median(rec.slice(1).map((r, i) => (r.ms - rec[i].ms) / 1000));
/** Waits for n more frames to be drawn. */
const frames = (page, n = 2) => page.evaluate(n => new Promise(r => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
/** The New Game studio, with real taps: a first name, « Continuer », « Jouer ». */
async function studio(page, t, name = 'Awa') {
  await page.waitForSelector('#stName', { state: 'visible', ...T });
  await t.tap('#stName'); await page.keyboard.type(name);
  await page.waitForFunction(() => !document.querySelector('#stContinue')?.disabled);
  await t.tap('#stContinue');
  await page.waitForSelector('#stPlay', { state: 'visible' }); await page.waitForTimeout(1500);
  for (let i = 0; i < 3; i++) {                                                         // (a tap while the look step is still sliding in can land on nothing: tapped again)
    await t.tap('#stPlay');
    if (await page.waitForSelector('#studio.st-leaving', { timeout: 8000 }).then(() => true).catch(() => false)) return;
  }
  throw new Error('the studio did not take « Jouer »');
}
/** The stick pushed up with a real thumb: how far the player went (m). */
async function walk(page, t) {
  const p0 = await page.evaluate(() => window.__dakar.pos()), jc = await t.centre('#joy');
  await t.down(1, jc.x, jc.y); await t.move(1, jc.x, jc.y - 60, 4);
  await page.waitForFunction(p => { const q = window.__dakar.pos(); return Math.hypot(q.x - p.x, q.z - p.z) > 1.5; }, p0, { timeout: 300000 }).catch(() => {});
  await t.up(1);
  const p1 = await page.evaluate(() => window.__dakar.pos());
  return Math.hypot(p1.x - p0.x, p1.z - p0.z);
}
const waitPhase = (page, ph, timeout = 600000) => page.waitForFunction(ph => window.__dakar?.opening?.().phase === ph, ph, { timeout });
const waitEnd = (page, timeout = 900000) => page.waitForFunction(() => { const o = window.__dakar.opening(); return o.phase === null && window.__dakar.pos().mode === 'play'; }, null, { timeout });

let landed = null;   // the play camera the flight lands on (part « flight »), for the skip's comparison
if (parts.has('flight')) {
  const { context, page } = await phone();
  await page.goto(base + '?debug&touch&heure=10&avatar=choisir&intro', { timeout: 240000 });
  const t = await realTouch(page);
  await studio(page, t);
  await waitPhase(page, 'flight');
  await page.waitForFunction(() => window.__dakar.opening().t > 3, null, { timeout: 600000 });   // (a few frames drawn: the HUD's fade, timed by frames, is done)
  const mid = await page.evaluate(() => ({ ui: +getComputedStyle(document.getElementById('ui')).opacity, skip: !!document.querySelector('#opening .op-skip')?.offsetWidth, welcome: window.__toasts.some(t => /Bienvenue à Pikine/.test(t.text)) }));
  await waitEnd(page); await page.waitForTimeout(1500);
  const rec = await page.evaluate(() => window.__rec), first = rec.findIndex(r => r.phase === 'flight'), fl = rec.filter(r => r.phase === 'flight'), after = rec.slice(first).filter(r => r.phase === null);
  const wall = fl.length ? (after[0].ms - fl[0].ms) / 1000 + fl[0].t : 0, frameS = pace(fl);   // (+ the seconds it had flown when the recording began)
  let path = 0; for (let i = 1; i < fl.length; i++) path += d3(fl[i].cam, fl[i - 1].cam);
  const moving = fl.filter((r, i) => i > 0 && d3(r.cam, fl[i - 1].cam) > 0.02).length / Math.max(1, fl.length - 1);
  check('a new game (the studio, real taps) plays the flight: the camera moves all through its 14 s, then lands', fl.length >= 8 && fl[0].t <= 1.01 && fl.at(-1).t >= 12 && after.length > 0 && path > 50 && moving > 0.8,
    `${fl.length} frames from ${fl[0].t} s to ${fl.at(-1).t} s of its clock, the camera flew ${path.toFixed(0)} m, moving in ${Math.round(moving * 100)} % of the frames, from ${fl[0].cam.map(n => n.toFixed(1))} to ${fl.at(-1).cam.map(n => n.toFixed(1))}`);
  if (frameS <= 0.25) check('in real time: 12–18 s of wall clock', wall >= 12 && wall <= 18, `${wall.toFixed(1)} s`);
  else console.log(`(wall clock not judged: this renderer drew a frame every ${frameS.toFixed(1)} s, so the flight took ${wall.toFixed(0)} s of wall clock here)`);
  check('the HUD is hidden during the flight, « Passer » shown, no welcome yet', fl.every(r => !r.hud) && mid.ui < 0.05 && mid.skip && !mid.welcome, JSON.stringify(mid).slice(0, 160));
  // no cut: the step from the last flying frame to the first played one is no bigger than the flight's own last steps (frames are slow here), and then it holds
  const jump = d3(fl.at(-1).cam, after[0].cam), lastSteps = fl.slice(-6).map((r, i, a) => (i ? d3(r.cam, a[i - 1].cam) : 0));
  check('it lands on the play camera behind the player: no cut when the player takes over', jump <= Math.max(0.08, 2 * Math.max(...lastSteps)) && after.slice(0, 20).every(r => d3(r.cam, after[0].cam) < 0.05),
    `${jump.toFixed(3)} m between the last flying frame and the first played one (the flight's last steps: ${lastSteps.slice(1).map(n => n.toFixed(3)).join(', ')} m)`);
  const end = await page.evaluate(() => ({ ui: +getComputedStyle(document.getElementById('ui')).opacity, welcome: window.__toasts.find(t => /Bienvenue à Pikine/.test(t.text)) ?? null, mode: window.__dakar.pos().mode, layer: !!document.getElementById('opening'), seen: window.__dakar.opening().seen }));
  check('then the HUD comes back and the welcome is given (after the landing, not before), the layer is gone, the device remembers it', end.ui > 0.95 && !!end.welcome && end.welcome.ms > fl.at(-1).ms && end.mode === 'play' && !end.layer && end.seen,
    JSON.stringify({ ...end, welcome: end.welcome && { text: end.welcome.text, afterLanding: end.welcome.ms > fl.at(-1).ms } }).slice(0, 220));
  landed = await page.evaluate(() => window.__dakar.camera().at);
  const m = await walk(page, t);
  check('and the player walks (a real thumb on the stick)', m > 1.5, `${m.toFixed(1)} m`);
  const pk = fl.reduce((a, r) => ({ calls: Math.max(a.calls, r.calls), tris: Math.max(a.tris, r.tris) }), { calls: 0, tris: 0 });
  check('the flight\'s frames stay within « Moyenne »\'s budget', pk.calls <= BUDGET.medium, `peak ${pk.calls} draw calls, ${pk.tris} triangles`);
  await context.close();
}

if (parts.has('skip')) {
  const { context, page } = await phone();
  await page.goto(base + '?debug&touch&heure=10&intro', { timeout: 240000 });
  await waitPhase(page, 'flight');
  await page.waitForFunction(() => window.__dakar.opening().t > 4, null, { timeout: 600000 });
  const skip = await page.evaluate(() => { const b = document.querySelector('#opening .op-skip'); const r = b?.getBoundingClientRect(); return b ? { text: b.textContent.trim(), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(innerWidth - r.right), bottom: Math.round(innerHeight - r.bottom) } : null; });
  check('« Passer », small and discreet in a corner, during the flight', !!skip && /Passer/.test(skip.text) && skip.h <= 44 && skip.w <= 120, JSON.stringify(skip));
  const t = await realTouch(page);
  const tapAt = await page.evaluate(() => performance.now());
  await t.down(2, 200, 380); await page.waitForTimeout(60); await t.up(2);              // a tap in the middle of the screen, not on the label
  await waitEnd(page); await frames(page, 2);
  const rec = await page.evaluate(() => window.__rec), frameS = pace(rec);
  const back = rec.find(r => r.ms > tapAt && r.mode === 'play'), dipped = rec.some(r => r.ms > tapAt && (r.phase === 'out' || r.phase === 'in'));
  const between = back ? rec.filter(r => r.ms > tapAt && r.ms < back.ms).length : Infinity;
  const cam = await page.evaluate(() => window.__dakar.camera().at);
  const seen = (await page.evaluate(() => window.__downs)).find(ms => ms > tapAt) ?? null;
  const afterSeen = back && seen !== null ? rec.filter(r => r.ms > seen && r.ms < back.ms).length : Infinity;
  // The skip dips for 0.2 s of the opening's clock (its wall clock, a frame counting one second at most), then the controls are back.
  // - A renderer of 4 frames a second or more (a phone, a desktop): judged on the wall clock, from the finger: under a second.
  // - A slower one (this machine's software renderer, a frame every 0.4–2 s): one frame covers the dip, so it is judged frame by frame from the moment the
  //   page received the tap: the controls are back on the first frame drawn after it, or the next one when the tap came in while a frame was on its way.
  //   The wall clock and the frames between the harness sending the tap and the page receiving it (that machine's input latency, not the game's) are printed, not judged.
  const ms = back ? back.ms - tapAt : Infinity, fast = frameS <= 0.25, onTime = fast ? ms < 1000 : afterSeen <= 1;
  check(fast ? 'a tap skips it within a second (wall clock), onto the same play camera' : 'a tap skips it on the next frame drawn after it (a slow renderer: judged in frames), onto the same play camera',
    onTime && dipped && (!landed || d3(cam, landed) < 0.25) && (!landed || d3(back.cam, landed) < 0.25),
    `the controls back ${afterSeen} frame(s) after the page received the tap (${between} after it was sent; ${seen === null ? 'not seen' : `${Math.round(seen - tapAt)} ms to reach the page`}), ${Math.round(ms)} ms of wall clock after it was sent (a frame every ${frameS.toFixed(2)} s here${fast ? '' : ': wall clock not judged'}); camera ${cam.map(n => n.toFixed(2))}${landed ? ` vs the flight's landing ${landed.map(n => n.toFixed(2))}` : ''}`);
  const hud = await page.evaluate(() => ({ ui: +getComputedStyle(document.getElementById('ui')).opacity, layer: !!document.getElementById('opening') }));
  check('the HUD is back and the layer gone after the skip', hud.ui > 0.95 && !hud.layer, JSON.stringify(hud));
  const m = await walk(page, t);
  check('the player walks after a skip', m > 1.5, `${m.toFixed(1)} m`);
  // a key skips too (a keyboard at a desk)
  await page.evaluate(() => window.__dakar.openingPlay());
  await page.waitForFunction(() => window.__dakar.opening().t > 1, null, { timeout: 600000 });
  await page.keyboard.press('Escape');
  const keyed = await page.waitForFunction(() => window.__dakar.opening().phase === null && window.__dakar.pos().mode === 'play', null, { timeout: 300000 }).then(() => true).catch(() => false);
  const phoneOpen = await page.evaluate(() => window.__dakar.phoneInfo().open);
  check('a key skips it too (Échap: the phone does not open)', keyed && !phoneOpen);
  await context.close();
}

if (parts.has('first')) {
  const { context, page } = await phone({ quality: 'low' });
  const shown = () => page.evaluate(() => window.__openingShown);
  const playing = () => page.waitForFunction(() => document.getElementById('joy') && getComputedStyle(document.getElementById('ui')).opacity > 0.95 && !document.getElementById('studio'), null, T);
  await page.goto(base + '?touch', { timeout: 240000 });
  const t = await realTouch(page);
  await studio(page, t, 'Moussa');
  await page.waitForFunction(() => window.__openingShown, null, { timeout: 240000 }).catch(() => {});
  const first = await shown();
  await page.waitForFunction(() => !document.body.classList.contains('opening'), null, { timeout: 900000 }).catch(() => {});
  check('without ?debug (the public path): the first launch plays it after the character is made', first && await page.evaluate(() => localStorage.getItem('dakarrek.opening') === '1'));
  await playing(); await page.waitForTimeout(9000);                                     // (the 8 s autosave: the reload resumes a saved game)
  await page.reload({ timeout: 240000 }); await playing(); await page.waitForTimeout(6000);
  check('a reload does not play it again', first && !(await shown()) && await page.evaluate(() => !document.getElementById('opening')));
  await page.evaluate(() => sessionStorage.setItem('wipeSave', '1'));
  await page.reload({ timeout: 240000 });
  await studio(page, await realTouch(page), 'Fatou');
  await playing(); await page.waitForTimeout(6000);
  check('a New Game on the same device does not play it again (never forced)', first && !(await shown()) && await page.evaluate(() => !!localStorage.getItem('dakarrek.guest.save.v6')));
  await context.close();
}

if (parts.has('reduced')) {
  const { context, page } = await phone({ reduced: true });
  await page.goto(base + '?debug&touch&heure=10', { timeout: 240000 });                 // (no ?intro: started below, while recording, as the start of a first launch does)
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().mode === 'play', null, T); await page.waitForTimeout(2500);
  const cam0 = await page.evaluate(() => window.__dakar.camera().at);
  const t0 = await page.evaluate(() => { const ok = window.__dakar.openingPlay(); const v = document.querySelector('#opening .op-veil'); return { ms: performance.now(), ok, o: window.__dakar.opening(), veil: v ? +getComputedStyle(v).opacity : null }; });
  await waitEnd(page); await frames(page, 2);
  const all = await page.evaluate(() => window.__rec), rec = all.filter(r => r.ms >= t0.ms), cams = rec.map(r => r.cam), frameS = pace(all);
  const moved = Math.max(...cams.map(c => d3(c, cam0)));
  const end = rec.findIndex(r => r.phase === null && r.mode === 'play'), endMs = end >= 0 ? rec[end].ms - t0.ms : Infinity;
  const short = frameS <= 0.25 ? endMs < 2500 : end >= 0 && end <= 3;                   // 1.2 s of the opening's clock: a few frames on a slow renderer
  check('reduced motion: no flight, a short fade to the play camera (the camera never moves), the HUD back at the end', t0.ok && t0.o.phase === 'fade' && t0.veil > 0.9 && rec.every(r => r.phase !== 'flight') && rec.filter(r => r.phase === 'fade').every(r => !r.hud) && moved < 0.05 && short && rec.at(-1).hud,
    `phases ${[...new Set(rec.map(r => r.phase))].join('/')}, veil from ${t0.veil}, camera moved ${moved.toFixed(3)} m, controls back after ${end} frame(s), ${Math.round(endMs)} ms of wall clock (a frame every ${frameS.toFixed(2)} s here)`);
  await context.close();
}

if (parts.has('replay')) {
  const { context, page } = await phone({ quality: 'low' });
  await page.goto(base + '?debug&touch&heure=10', { timeout: 240000 });                 // a new game at the spawn (?debug: no opening at the start)
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().mode === 'play', null, T); await frames(page, 2);
  const t = await realTouch(page);
  const row = async () => {
    await page.evaluate(() => window.__dakar.phone('reglages')); await page.waitForSelector('#phone [data-act="opening"]', { state: 'attached', timeout: 120000 });
    await page.evaluate(() => document.querySelector('#phone [data-act="opening"]').scrollIntoView({ block: 'center' })); await frames(page, 1); await page.waitForTimeout(600);
    await t.tap('#phone [data-act="opening"]');
  };
  await row();
  await waitPhase(page, 'flight');
  const o = await page.evaluate(() => ({ ...window.__dakar.opening(), phone: window.__dakar.phoneInfo().open }));
  check('Réglages › « Revoir l’ouverture » plays it again (the phone closed; the player at the spawn: it lands on them)', o.phase === 'flight' && o.live === true && !o.phone && !o.hud, JSON.stringify(o));
  await page.waitForFunction(() => window.__dakar.opening().t > 1, null, { timeout: 600000 });
  await t.down(3, 200, 400); await page.waitForTimeout(60); await t.up(3);
  await waitEnd(page);
  await page.evaluate(() => window.__dakar.teleport('plateau'));
  await page.waitForFunction(() => window.__dakar.pos().hub === 'plateau' && window.__dakar.pos().mode === 'play', null, T); await frames(page, 2);
  await row(); await frames(page, 2);
  const away = await page.evaluate(() => ({ phase: window.__dakar.opening().phase, toast: document.getElementById('toast').innerText }));
  check('elsewhere than Pikine\'s streets it says where it can be seen instead of flying', away.phase === null && /rues de Pikine/.test(away.toast), JSON.stringify(away));
  await context.close();
}

if (parts.has('perf')) {
  const rows = [];
  for (const quality of ['low', 'medium', 'high']) for (const hour of [10, 21]) {
    const { context, page } = await phone({ quality });
    await page.goto(base + `?debug&touch&heure=${hour}&intro&avatar=${hour === 10 ? 'homme' : 'femme'}`, { timeout: 240000 });   // (the studio's bodies, as on a first launch)
    await waitPhase(page, 'flight');
    await waitEnd(page); await frames(page, 3);
    const rec = await page.evaluate(() => window.__rec), fl = rec.filter(r => r.phase === 'flight'), play = rec.filter(r => r.phase === null).slice(-3);
    const pk = fl.reduce((a, r) => ({ calls: Math.max(a.calls, r.calls), tris: Math.max(a.tris, r.tris) }), { calls: 0, tris: 0 });
    const land = play.reduce((a, r) => ({ calls: Math.max(a.calls, r.calls), tris: Math.max(a.tris, r.tris) }), { calls: 0, tris: 0 });
    rows.push({ quality, hour, frames: fl.length, peakCalls: pk.calls, peakTris: pk.tris, landedCalls: land.calls, landedTris: land.tris });
    check(`flight on « ${quality} » at ${hour} h within ${BUDGET[quality]} draw calls`, pk.calls <= BUDGET[quality] && fl.length > 10, `peak ${pk.calls} calls / ${pk.tris} triangles over ${fl.length} frames (landed: ${land.calls} / ${land.tris})`);
    await context.close();
  }
  fs.writeFileSync(`${out}/perf.json`, JSON.stringify({ base, at: new Date().toISOString(), note: 'renderer.info of every frame drawn during the flight (shadow passes included); a software renderer: counts only, no frame times', rows }, null, 1));
}

if (parts.has('shots')) {
  const hour = process.env.SHOT_HOUR ?? '17.5';
  const { context, page } = await phone({ quality: 'high', dsf: 2 });
  await page.goto(base + `?debug&touch&heure=${hour}&intro&avatar=femme&meteo=soleil`, { timeout: 240000 });   // (a clear day held: the stills show the flight, not the day's weather)
  await waitPhase(page, 'flight');
  for (const [name, s] of [['01-over-the-roofs', 1.5], ['02-the-street-below', 6.5], ['03-onto-the-player', 11]]) {
    await page.evaluate(s => window.__dakar.openingHold(s), s); await frames(page, 3); await page.waitForTimeout(500);
    await page.screenshot({ path: `${out}/${name}.png` });
  }
  await page.evaluate(() => window.__dakar.openingHold(null));
  await waitEnd(page); await frames(page, 3);
  await page.screenshot({ path: `${out}/04-landed.png` });
  console.log(`(stills at ${hour} h, « Haute », deviceScaleFactor 2: ${out})`);
  await context.close();
}

check('no JavaScript error', errors.length === 0, JSON.stringify(errors.slice(0, 5)));
await browser.close();
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
