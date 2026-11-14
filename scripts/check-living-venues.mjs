// The living places of 1.0.1 (src/venues/routine.ts, lifePlans.ts, venueLife.ts): Le Patio (Almadies), the rooftop terraces Toit Baobab (Plateau) and Terrasse de
// Ngor (the Almadies hotel's roof), and Ngor's beach. For each one, on a phone-sized touch page, at a busy hour and at a quiet one:
//  - the people are there at the busy hour (the hour's number, drawn) and nobody at the quiet one (__dakar.venueLife());
//  - some of them change phase (arrive → walk → gather → interact → leave) and place over time;
//  - every animated body in view (each visible humanoid of the scene but the player's) and the frame's draw calls stay within the tier's budgets
//    (12 / 20 / 30 bodies, 180 / 300 / 420 calls), the whole time;
//  - none of their spots was dropped as standing in a solid or in an anchor's way, and a real thumb on the stick still walks the player to the place's anchors,
//    which then take the focus (no one of the crowd stands in the way or takes it).
// They are simulated on the device only: nothing here is online. Usage: node scripts/check-living-venues.mjs <baseUrl> [shotsDir]
// QUALITY=low|medium|high (default medium); WALK=0 skips the walks (budget runs on other qualities).
import { chromium } from 'playwright';
import fs from 'node:fs';
import { realTouch, walkTo } from './lib/realTouch.mjs';

const base = process.argv[2] ?? 'http://127.0.0.1:4173/', shots = process.argv[3] ?? '';
const quality = process.env.QUALITY ?? 'medium', WALK = process.env.WALK !== '0';
const BODIES = { low: 12, medium: 20, high: 30 }[quality], CALLS = { low: 180, medium: 300, high: 420 }[quality];
const T = { timeout: 300000 };
let fails = 0; const check = (n, ok, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${n}${d ? ' ' + d : ''}`); if (!ok) fails++; };
if (shots) fs.mkdirSync(shots, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
await context.addInitScript(q => { try { localStorage.setItem('dakarrek.quality', q); } catch { /* */ } }, quality);
const page = await context.newPage(); page.setDefaultTimeout(300000);
const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.goto(`${base}?debug&touch&heure=15`, { timeout: 180000 });
await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.pos().mode === 'play', null, T);
const d = (fn, a) => page.evaluate(fn, a);
const t = await realTouch(page);
console.log(`quality ${await d(() => window.__dakar.quality?.() ?? localStorage.getItem('dakarrek.quality'))}: budgets ${BODIES} bodies, ${CALLS} draw calls`);

const life = name => d(n => (window.__dakar.venueLife?.() ?? []).find(l => l.name === n) ?? null, name);
/** The frame's draw calls and triangles, and the animated bodies in view (every visible humanoid but the player's), the most over six frames. */
const measure = () => d(async () => {
  const D = window.__dakar, scene = D.three.scene, me = D.body?.()?.group ?? null;
  const vis = o => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
  let calls = 0, tris = 0, bodies = 0;
  for (let i = 0; i < 6; i++) {
    await new Promise(r => requestAnimationFrame(() => r()));
    calls = Math.max(calls, D.drawCalls()); tris = Math.max(tris, D.tris());
    let n = 0; scene.traverse(o => { if (o.name === 'humanoid_v2' && o !== me && vis(o) && o.children[0]?.visible !== false) n++; });
    bodies = Math.max(bodies, n);
  }
  return { calls, tris, bodies };
});
const go = async hub => {
  if ((await d(() => window.__dakar.pos().hub)) === hub) return;
  await d(h => window.__dakar.teleport(h), hub);
  await page.waitForFunction(h => window.__dakar.pos().hub === h && window.__dakar.pos().mode === 'play', hub, T);
};
const yawTo = (a, b) => Math.atan2(b.x - a.x, b.z - a.z);
/** Walks a real thumb through `pts` (the last one within `tol`), then reads the focus. */
const walk = async (pts, tol = 1.2) => {
  let left = Infinity;
  for (let i = 0; i < pts.length; i++) left = await walkTo(page, t, pts[i].x, pts[i].z, { tol: i === pts.length - 1 ? tol : 0.9, ms: 90000 });
  await page.waitForTimeout(900);
  const f = await d(() => window.__dakar.focus());
  return { left, focus: f?.id ?? null };
};
const reachAnchor = async (label, pts, want, tol = 1.2) => {
  const r = await walk(pts, tol);
  check(`${label}: the thumb walks the player to it`, r.left < tol, `${r.left.toFixed(2)} m left`);
  check(`${label}: it takes the focus (nobody of the crowd stands in the way)`, r.focus === want, `focus ${r.focus}, want ${want}`);
};
const results = [];

/**
 * One place at one hour. `busy`: people must be there, change and move; else nobody. Measures the budgets at every look.
 */
async function hour(v, h, busy) {
  await d(x => window.__dakar.setHour(x), h);
  await v.view();
  await page.waitForFunction(n => { const l = (window.__dakar.venueLife?.() ?? []).find(x => x.name === n); return !!l; }, v.life, T);
  await page.waitForTimeout(4000);
  let l = await life(v.life), m = await measure(), most = { ...m };
  const tag = `${v.name} at ${h} h`;
  console.log(`${tag}: ${JSON.stringify({ active: l.active, share: l.share, target: l.target, capacity: l.capacity, present: l.present, phases: l.phases, bodies: l.bodies, bodiesAllowed: l.bodiesAllowed, others: l.others, figures: l.figures, lifeCalls: l.drawCalls, dropped: l.dropped })} frame ${JSON.stringify(m)}`);
  if (busy) {
    check(`${tag}: busy — the hour's people are there and drawn`, l.active && l.target === l.capacity && l.present >= Math.max(1, Math.ceil(l.target * 0.6)) && l.figures + l.bodies >= Math.min(l.present, 1), `${l.present} of ${l.target} (capacity ${l.capacity}), ${l.figures} figures + ${l.bodies} bodies`);
    check(`${tag}: every spot of the plan stands clear (none dropped as in a solid or an anchor's way)`, l.dropped.length === 0, JSON.stringify(l.dropped));
    // over time: some change phase, some change place
    const a = new Map(l.people.map(p => [p.id, p])), phases = new Set(l.people.map(p => p.phase)), t0 = Date.now();
    let changed = 0, moved = 0, arrived = 0, left = 0;
    while (Date.now() - t0 < 150000) {
      await page.waitForTimeout(5000);
      const b = await life(v.life); m = await measure();
      for (const k of ['calls', 'tris', 'bodies']) most[k] = Math.max(most[k], m[k]);
      const now = new Map(b.people.map(p => [p.id, p]));
      for (const p of b.people) phases.add(p.phase);
      changed = 0; moved = 0; arrived = 0; left = 0;
      for (const [id, p] of a) { const q = now.get(id); if (!q) { left++; continue; } if (q.phase !== p.phase) changed++; if (Math.hypot(q.x - p.x, q.z - p.z) > 0.5) moved++; }
      for (const id of now.keys()) if (!a.has(id)) arrived++;
      l = b;
      if (changed + left + arrived >= 3 && moved >= 3 && phases.size >= 4) break;
    }
    check(`${tag}: people change what they do over time`, changed + left + arrived >= 3 && phases.size >= 3, `${changed} changed phase, ${arrived} arrived, ${left} left in ${Math.round((Date.now() - t0) / 1000)} s; phases seen ${[...phases].join(', ')}`);
    check(`${tag}: people change place over time`, moved >= 3, `${moved} moved more than 0.5 m`);
    check(`${tag}: still the hour's number, never more`, l.present <= l.capacity && l.present >= 1, `${l.present} of ${l.capacity}`);
  } else {
    check(`${tag}: quiet — nobody of the crowd`, l.present === 0 && l.drawCalls === 0 && l.figures === 0, `${l.present} present, ${l.figures} figures, ${l.drawCalls} calls`);
  }
  check(`${tag}: animated bodies within the ${quality} budget (${BODIES})`, most.bodies <= BODIES, `most ${most.bodies} (the crowd's own ${l.bodies}, allowed ${l.bodiesAllowed} beside ${l.others} others; the code's cap ${l.bodyBudget})`);
  check(`${tag}: draw calls within the ${quality} budget (${CALLS})`, most.calls <= CALLS, `most ${most.calls} calls, ${most.tris} triangles (the crowd's ${l.drawCalls})`);
  results.push({ venue: v.name, hour: h, busy, quality, present: l.present, target: l.target, capacity: l.capacity, bodies: most.bodies, calls: most.calls, tris: most.tris, lifeCalls: l.drawCalls, lifeBodies: l.bodies });
  if (busy && WALK) await v.anchors();
  if (busy && shots && v.shot) {
    await v.shot(); await page.waitForTimeout(4000);
    await page.screenshot({ path: `${shots}/${v.file}.png`, timeout: 180000 }); console.log(`shot ${shots}/${v.file}.png`);
    await d(() => window.__dakar.cam(null));
  }
}

// ------------------------------------------------------------------ the places
const patioInfo = () => d(() => window.__dakar.venues().find(v => v.type === 'patio'));
const local = (p, x, z) => { const c = Math.cos(p.yaw), s = Math.sin(p.yaw); return { x: p.origin.x + x * c + z * s, z: p.origin.z - x * s + z * c }; };
const PATIO = {
  name: 'Le Patio', life: 'patio', file: 'patio-1h',
  async view() {
    await go('almadies');
    await page.waitForFunction(() => window.__dakar.venues?.().some(v => v.type === 'patio'), null, T);
    const p = await patioInfo();
    await d(([x, z, y]) => window.__dakar.place(x, z, y), [p.inside.x, p.inside.z, yawTo(p.inside, p.floor)]);
  },
  async anchors() {
    const p = await patioInfo(), A = id => p.anchors.find(a => a.id === id), id = a => `almadies:venue:patio:${a}`, L = (x, z) => local(p, x, z);
    // tonight is paid (the doorman's own counter): the gate is open and the courtyard's anchors offer what they offer a guest
    await d(n => { window.__dakar.state.data.counters['club:almadies:venue:patio:nuit'] = n + 1; }, p.night);
    const start = L(0, 13.1);
    await d(([x, z, y]) => window.__dakar.place(x, z, y), [start.x, start.z, yawTo(start, A('door'))]); await page.waitForTimeout(1500);
    await reachAnchor('Le Patio, the street door', [A('door')], id('door'));
    await reachAnchor('Le Patio, through the gate to the way out', [A('exit')], id('exit'));
    await reachAnchor('Le Patio, the dance floor', [L(0, 2), A('floor')], id('floor'));
    await reachAnchor('Le Patio, the bar', [L(-5, -4), A('bar')], id('bar'), 1.6);
    await reachAnchor('Le Patio, the salon', [L(-8.2, -1.5), L(-9.9, 1.2)], id('lounge'), 1.2);
    await reachAnchor('Le Patio, the DJ', [L(-4, -0.5), L(0, -5.4)], id('dj'), 1.3);
  },
  // from above the courtyard's front corner (the debug's free camera), the floor, the bar and the salon ahead; the player stays inside
  async shot() { const p = await patioInfo(), a = local(p, 0, 6.6), e = local(p, 6.2, 9.2), at = local(p, -2.5, -2.8); await d(([x, z, y]) => window.__dakar.place(x, z, y), [a.x, a.z, Math.PI]); await d(([e, at]) => window.__dakar.cam([e.x, 5.2, e.z], [at.x, 0.6, at.z]), [e, at]); },
};
const BEACH = {
  name: 'Ngor beach', life: 'plage', file: 'plage-15h',
  async view() { await go('almadies'); await d(() => window.__dakar.place(-8, -131.6, Math.PI)); },
  async anchors() {
    const id = a => `almadies:venue:plage:${a}`, P = (x, z) => ({ x, z });
    await reachAnchor('Ngor beach, the grilled-corn stall', [P(-3, -132.3)], id('grill'));
    await reachAnchor('Ngor beach, the sun beds (west)', [P(-8, -132.0), P(-8, -137.5), P(-8, -143.3), P(-16.6, -143.3), P(-17.4, -142.6)], id('transats_a'));
    await reachAnchor('Ngor beach, the bar', [P(-8.5, -143.3), P(-8.5, -149.6)], id('bar'));
  },
  async shot() { await d(() => { window.__dakar.place(-8, -133, Math.PI); window.__dakar.cam([1.5, 7.5, -130.5], [-9.5, 0.2, -152]); }); },
};
const terrace = (hub, name, life, file) => ({
  name, life, file,
  async view() {
    await go(hub);
    await page.waitForFunction(() => !!window.__dakar.rooftop?.info(), null, T);
    const i = await d(() => window.__dakar.rooftop.info());
    if (!(await d(() => window.__dakar.rooftop.life?.()?.active))) {
      await d(() => window.__dakar.rooftop.enter());
      await page.waitForFunction(id => window.__dakar.pos().mode === 'play' && window.__dakar.focus?.() !== undefined && Math.abs(window.__dakar.pos().x) > 3000, i.door.id, T);
    }
    const ox = i.bar.x - 2.2;
    await d(([x, z, y]) => window.__dakar.place(x, z, y), [ox + 4.6, 4.0, Math.PI + 0.3]);
  },
  async anchors() {
    const i = await d(() => window.__dakar.rooftop.info()), ox = i.bar.x - 2.2;
    await reachAnchor(`${name}, the bar (« Commander »)`, [{ x: ox + 3.6, z: 1.0 }, { x: i.bar.x, z: i.bar.z }], `${i.door.id}:bar`);
    await reachAnchor(`${name}, the way down`, [{ x: ox + 4.9, z: 1.0 }, { x: ox + 5, z: 4.7 }], `${hub}:rooftop:out`);
  },
  async shot() { const i = await d(() => window.__dakar.rooftop.info()), ox = i.bar.x - 2.2; await d(([x, z, y]) => window.__dakar.place(x, z, y), [ox + 5, 4.2, Math.PI]); await d(ox => window.__dakar.cam([ox + 7.2, 4.6, 5.2], [ox - 3.5, 0.4, -1.8]), ox); },
});
const NGOR_ROOF = terrace('almadies', 'Terrasse de Ngor', 'terrasse-almadies', 'terrasse-de-ngor-21h');
const BAOBAB = terrace('plateau', 'Toit Baobab', 'terrasse-plateau', 'toit-baobab-21h');

// the Almadies first (Le Patio, the beach, then up on the hotel's roof), then the Plateau
await d(() => window.__dakar.setHour(1));
await hour(PATIO, 1, true);
await hour(PATIO, 11, false);
await hour(BEACH, 15, true);
await hour(BEACH, 23, false);
await hour(NGOR_ROOF, 21, true);
await hour(NGOR_ROOF, 9, false);
await hour(BAOBAB, 21, true);
await hour(BAOBAB, 9, false);

console.log(`RESULTS ${JSON.stringify(results)}`);
check('no JavaScript errors', errors.length === 0, JSON.stringify(errors.slice(0, 3)));
await browser.close();
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
