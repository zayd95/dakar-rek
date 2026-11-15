// The Roi des Arènes wrestlers in the game (behind ?rdabody: docs/wrestling/RDA-INTEGRATION.md), on a phone (390×844, touch, the
// phone's default quality « medium », deviceScaleFactor 2), against the same moments on today's v4 wrestlers:
//  1. both physiques load from the medium file, their face maps on; the entrance's wrestlers, the watched gala bout and its fête (the
//     winner carried) and the player's own bout avec frappe all draw RDA bodies, heavy for « costaud », athletic otherwise;
//  2. with the accessory pieces on (an owner decision, off by default: ?rdaparts=arms,chest), every pouch stays on its bone through the
//     entrance, the watched bout, the fête and the player's bout (distance to its bone over every sampled frame), and no vertex is
//     detached or exploded (the skinned box of each body per frame);
//  3. a missing or a corrupt file: the v4 wrestlers, the bout as always, no page error;
//  4. phone captures (entrance, standing, clinch, throw, fall, result), old (v4) and new (RDA) side by side in docs/wrestling/rda/.
// Usage: flock /tmp/dakar-browser.lock node scripts/check-rda-fighter.mjs [baseUrl] [outDir=docs/wrestling/rda]   (RAW=dir keeps the raw captures)
// Headless SwiftShader renders a few frames a second: nothing here says anything about a phone's frame rate.
import { chromium } from 'playwright';
import fs from 'node:fs';
import sharp from 'sharp';

const base = process.argv[2] ?? 'http://127.0.0.1:5372/';
const out = process.argv[3] ?? 'docs/wrestling/rda';
const raw = process.env.RAW ?? `${out}/raw`;
fs.mkdirSync(out, { recursive: true }); fs.mkdirSync(raw, { recursive: true });
const SLOW = Number(process.env.SLOW ?? 4);
const results = []; let failed = 0;
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`.slice(0, 600)); };
const launch = { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] };
if (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome')) launch.executablePath = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch(launch);

async function open(qs, route = null) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await ctx.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'medium'); } catch { /* */ } });
  if (route) await ctx.route('**/assets/wrestlers/*.glb', route);
  const page = await ctx.newPage();
  page.setDefaultTimeout(60000 * SLOW);
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/ws|websocket|8787|car_rapide|404|Failed to load resource/i.test(m.text() + m.location().url)) errors.push(m.text()); });
  await page.goto(`${base}?debug&touch&lamb2${qs}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__dakar && window.__dakar.pos().hub && window.__dakar.arena, null, { timeout: 90000 * SLOW });
  return { ctx, page, errors };
}
const d = (page, fn, arg) => page.evaluate(fn, arg);
const wait = (page, fn, arg, timeout = 120000) => page.waitForFunction(fn, arg, { timeout: timeout * SLOW, polling: 150 }).then(() => true, () => false);
const info = page => d(page, () => window.__dakar.duelInfo());
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
/** The pouches' distances to their bones and the bodies' boxes, sampled: the first sample of each pouch is its reference. */
function sampler() {
  const ref = new Map(), s = { frames: 0, bodies: 0, worstDrift: 0, worstPiece: '', boxes: { maxSize: 0, maxReach: 0, minY: Infinity, maxY: -Infinity }, pouches: new Set(), builds: new Set(), face: true };
  s.add = r => {
    if (!r) return;
    s.frames++;
    for (const [k, b] of r.bodies.entries()) {
      s.bodies = Math.max(s.bodies, r.bodies.length); s.builds.add(b.build); s.face &&= b.faceMaps;
      s.boxes.maxSize = Math.max(s.boxes.maxSize, ...b.box.size); s.boxes.maxReach = Math.max(s.boxes.maxReach, b.reach); s.boxes.minY = Math.min(s.boxes.minY, b.box.min[1]); s.boxes.maxY = Math.max(s.boxes.maxY, b.box.min[1] + b.box.size[1]);
      b.probes.forEach((p, i) => {
        const key = `${b.build}:${k}:${p.piece}:${i}`; s.pouches.add(`${b.build}:${p.piece}:${i}`);
        if (!ref.has(key)) ref.set(key, p.d);
        const drift = Math.abs(p.d - ref.get(key)); if (drift > s.worstDrift) { s.worstDrift = drift; s.worstPiece = `${p.piece} on ${p.bone}`; }
      });
    }
  };
  return s;
}
const rda = page => d(page, () => window.__dakar.rda());
const shot = async (page, name) => { await page.waitForTimeout(250); const f = `${raw}/${name}.png`; await page.screenshot({ path: f }); return f; };
const intoClinch = page => until(page, i => !i || i.phase !== 'fight', async i => {
  if (i.dist > 1.35) await page.keyboard.down('KeyD'); else { await page.keyboard.up('KeyD'); await d(page, () => window.__dakar.duelGrab()); }
}, 90000).finally(() => page.keyboard.up('KeyD'));

/** One evening's moments on one set of bodies: `tag` 'v4' or 'rda'. Returns the captures and (rda) the samples. */
async function evening(tag) {
  const flag = tag === 'rda' ? '&rdabody&rdaparts=arms,chest' : '';
  const { ctx, page, errors } = await open(flag);
  const S = sampler(), caps = {};
  const sample = async () => { if (tag === 'rda') S.add(await rda(page)); };
  if (tag === 'rda') {
    const ready = await wait(page, () => window.__dakar.rda().ready, null, 60000), r = await rda(page);
    check('rda: the medium file loads and validates (behind ?rdabody, the phone\'s quality)', ready && r.load?.ok && r.load.level === 'medium', r.load);
  } else {
    const r = await rda(page);
    check('v4: without ?rdabody nothing is loaded and nothing changes', r.mode === 'off' && !r.ready && !r.load, { mode: r.mode, ready: r.ready });
  }
  // the entrance on a fight evening (src/arena/entrance.ts): the left wrestler walks out of the tunnel
  await d(page, () => { const x = window.__dakar; x.teleport('pikine'); x.setHour(18); });
  await wait(page, () => window.__dakar.pos().hub === 'pikine' && !!window.__dakar.arena.info(), null, 60000);
  await d(page, () => { const x = window.__dakar; if (x.arenaOut && x.arenaOutDay) { const t = x.arenaOut().day, fri = t + ((4 - (((t % 7) + 7) % 7)) + 7) % 7; x.arenaOutDay(fri); x.arena.day(fri); } });
  await wait(page, () => !!window.__dakar.arena.info()?.centre, null, 60000);
  const centre = await d(page, () => window.__dakar.arena.info().centre);
  await d(page, c => { window.__dakar.place(c.x, c.z + 12, Math.PI); window.__dakar.arena.go('entrance'); }, centre);
  await wait(page, () => window.__dakar.arena.info()?.phase === 'entrance' && window.__dakar.arena.info().entrance > 0, null, 60000);
  const ent = { t0: Date.now() };
  for (let k = 0; k < 40; k++) {
    const ws = await d(page, () => window.__dakar.wrestlers());
    await sample();
    const walking = ws.find(w => w.clip === 'Walk' || w.clip === 'Entrance_Walk' || Math.hypot(w.x - centre.x, w.z - centre.z) < 18);
    if (walking && Math.hypot(walking.x - centre.x, walking.z - centre.z) < 16 && k > 4) { ent.w = walking; ent.all = ws; break; }
    await page.waitForTimeout(400);
  }
  if (ent.w) {
    const w = ent.w, f = { x: Math.sin(w.yaw), z: Math.cos(w.yaw) };
    await d(page, ([p, t]) => window.__dakar.cam(p, t), [[w.x + f.x * 3.2 + f.z * 0.8, 1.75, w.z + f.z * 3.2 - f.x * 0.8], [w.x, 1.05, w.z]]);
    caps.entrance = await shot(page, `${tag}-1-entrance`);
    await d(page, () => window.__dakar.cam(null));
  }
  if (tag === 'rda') {
    const r = await rda(page), ws = await d(page, () => window.__dakar.wrestlers());
    check('rda: the entrance\'s wrestlers are RDA bodies, each with his physique (by the bill\'s styles)', ws.length > 0 && ws.every(w => w.body === 'rda') && r.bodies.length === ws.length, ws.map(w => `${w.body}/${w.build}`).join(' '));
  }
  // the watched gala bout and its result's fête (the winner carried round the ring): sampled while they run
  await d(page, () => { window.__dakar.arena.speed(6); window.__dakar.arena.go('bout'); });
  await wait(page, () => window.__dakar.arena.info()?.phase === 'bout', null, 60000);
  const watched = await d(page, () => window.__dakar.wrestlers());
  for (let k = 0; k < 120; k++) { await sample(); const ph = await d(page, () => window.__dakar.arena.info()?.phase); if (ph !== 'bout') break; await page.waitForTimeout(300); }
  for (let k = 0; k < 15; k++) { await sample(); await page.waitForTimeout(300); }      // the fête
  if (tag === 'rda') check('rda: the watched gala bout\'s two wrestlers are RDA bodies', watched.filter(w => w.body === 'rda').length >= 2, watched.map(w => `${w.body}/${w.build}`).join(' '));
  await d(page, () => { window.__dakar.arena.speed(1); window.__dakar.arena.go('over'); });
  await page.waitForTimeout(800);
  // the player's own bout avec frappe against Gora (« costaud »): standing, clinch, throw, fall, result
  await d(page, () => window.__dakar.duelStart('amical', 'costaud', 'avec_frappe', 'Gora'));
  await wait(page, () => window.__dakar.duelInfo()?.phase === 'fight');
  await page.waitForTimeout(500); await sample();
  caps.standing = await shot(page, `${tag}-2-standing`);
  if (tag === 'rda') {
    const ws = await d(page, () => window.__dakar.wrestlers()), r = await rda(page);
    check('rda: both physiques in the player\'s bout — the player athletic, Gora (costaud) heavy — their face maps on', ws.filter(w => w.body === 'rda').length >= 2 && r.bodies.some(b => b.build === 'heavy') && r.bodies.some(b => b.build === 'athletic') && r.bodies.every(b => b.faceMaps), r.bodies.map(b => `${b.build}${b.faceMaps ? '+face' : ''}`).join(' '));
    check('rda: the accessory pieces are on (the switch), four pieces and six pouches on each wrestler', r.bodies.every(b => b.probes.length === 6), r.bodies.map(b => b.probes.length).join(' '));
  }
  await d(page, () => { window.__dakar.duelClock(90); window.__dakar.duelSet('player', { stamina: 100 }); window.__dakar.duelHold(true); });
  let c = await intoClinch(page);
  if (c?.phase === 'clinch') { await d(page, () => window.__dakar.duelMove('push')); await page.waitForTimeout(300); await sample(); caps.clinch = await shot(page, `${tag}-3-clinch`); }
  let sawAttempt = false, sawSlow = false;
  const end = await until(page, i => !i || i.phase === 'result' || (i.phase === 'fall' && i.fall?.arm), async i => {
    await sample();
    if (i.phase === 'fight') { await intoClinch(page); return; }
    if (i.phase === 'fall') { if (i.fall?.slow && !sawSlow) { sawSlow = true; caps.fall = await shot(page, `${tag}-5-fall`); } return; }
    if (i.phase !== 'clinch') return;
    if (i.clinch.attempt) { if (i.clinch.attempt.by === 'player' && !sawAttempt) { sawAttempt = true; caps.throw = await shot(page, `${tag}-4-throw`); } return; }
    await d(page, () => { window.__dakar.duelSet('opponent', { balance: 28, grip: -40 }); window.__dakar.duelSet('player', { stamina: 100 }); });
    if (!i.clinch.move.player) await d(page, () => window.__dakar.duelThrow());
  }, 200000);
  await d(page, () => window.__dakar.duelHold(false));
  await wait(page, () => window.__dakar.duelInfo()?.phase === 'result', null, 60000);
  await page.waitForTimeout(500); await sample();
  caps.result = await shot(page, `${tag}-6-result`);
  check(`${tag}: the bout runs to its result as always (a throw, a fall)`, end && (end.phase === 'result' || end.phase === 'fall') && sawAttempt, { outcome: end?.outcome, winner: end?.winner, sawAttempt, sawSlow });
  await d(page, () => window.__dakar.duelFinish());
  if (tag === 'rda') {
    const r = await rda(page);
    S.render = r.render; S.memory = r.memory;
  }
  check(`${tag}: no page error`, errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
  return { caps, S };
}

const old = await evening('v4');
const neu = await evening('rda');
const S = neu.S;
check('rda: every pouch stays on its bone through the entrance, the watched bout, the fête and the player\'s bout (drift < 2 mm)', S.frames > 20 && S.pouches.size >= 12 && S.worstDrift < 0.002,
  { frames: S.frames, pouches: S.pouches.size, worstDriftMm: +(S.worstDrift * 1000).toFixed(2), worst: S.worstPiece });
// (the box's height above the sand is not a criterion: the fête lifts the winner onto his people's shoulders, his head near 2.8 m)
check('rda: no detached or exploded vertex (each body\'s skinned box < 2.4 m, every sampled vertex within 1.6 m of its hips)', S.frames > 20 && S.boxes.maxSize < 2.4 && S.boxes.maxReach < 1.6, S.boxes);
check('rda: both physiques were drawn, every body with its face maps', S.builds.has('heavy') && S.builds.has('athletic') && S.face, [...S.builds].join(' '));

// a missing file, then a corrupt one: the v4 wrestlers, the bout as always
for (const [label, route] of [['missing', r => r.fulfill({ status: 404, body: 'no' })], ['corrupt', r => r.fulfill({ status: 200, contentType: 'model/gltf-binary', body: Buffer.from('glTF not really a body') })]]) {
  const { ctx, page, errors } = await open('&rdabody', route);
  await page.waitForTimeout(1500);
  await d(page, () => { const x = window.__dakar; x.teleport('pikine'); x.setHour(16); });
  await wait(page, () => window.__dakar.pos().hub === 'pikine', null, 60000);
  const r = await rda(page);
  await d(page, () => window.__dakar.duelStart('amical', 'costaud', 'avec_frappe', 'Gora'));
  const fight = await wait(page, () => window.__dakar.duelInfo()?.phase === 'fight', null, 60000);
  const ws = await d(page, () => window.__dakar.wrestlers());
  check(`fallback (${label} file): v4 wrestlers, the bout starts as always, no page error`, !r.ready && r.load && !r.load.ok && fight && ws.length >= 2 && ws.every(w => w.body === 'v4') && errors.length === 0,
    { ready: r.ready, load: r.load, bodies: ws.map(w => w.body).join(' '), errors: errors.slice(0, 2) });
  await d(page, () => window.__dakar.duelAbandon(true)); await ctx.close();
}

// side by side: today's v4 (left) and the RDA bodies (right), at the same moments
const label = (text, w) => Buffer.from(`<svg width="${w}" height="64"><rect width="100%" height="100%" fill="rgba(0,0,0,0.55)"/><text x="20" y="42" font-family="sans-serif" font-size="30" fill="#fff">${text}</text></svg>`);
const pairs = [];
for (const [k, n] of [['entrance', '1-entrance'], ['standing', '2-standing'], ['clinch', '3-clinch'], ['throw', '4-throw'], ['fall', '5-fall'], ['result', '6-result']]) {
  const a = old.caps[k], b = neu.caps[k]; if (!a || !b) { check(`capture ${k}: both sides`, false, { v4: !!a, rda: !!b }); continue; }
  const [ma, mb] = [await sharp(a).metadata(), await sharp(b).metadata()];
  const file = `${out}/${n}.jpg`;
  await sharp({ create: { width: ma.width + mb.width + 12, height: Math.max(ma.height, mb.height), channels: 3, background: '#222' } })
    .composite([{ input: a, left: 0, top: 0 }, { input: b, left: ma.width + 12, top: 0 },
      { input: label('Aujourd’hui · v4', ma.width), left: 0, top: Math.round(ma.height * 0.56) }, { input: label('Roi des Arènes · ?rdabody', mb.width), left: ma.width + 12, top: Math.round(ma.height * 0.56) }])
    .jpeg({ quality: 78, mozjpeg: true }).toFile(file);
  pairs.push(file);
}
check('captures: entrance, standing, clinch, throw, fall, result side by side', pairs.length === 6, pairs.join(', '));
fs.writeFileSync(`${out}/check-rda-fighter.json`, JSON.stringify({ results, samples: { frames: S.frames, pouches: [...S.pouches], worstDrift: S.worstDrift, worstPiece: S.worstPiece, boxes: S.boxes, render: S.render, memory: S.memory } }, null, 1));
console.log(`${results.length - failed}/${results.length} passed`);
await browser.close();
process.exit(failed ? 1 : 0);
