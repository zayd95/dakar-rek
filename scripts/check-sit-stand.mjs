// Sit and stand on the player's own: walking to a chair round its table, sitting, then standing up. The body must rise
// back to the spot it came from (or a free spot right beside the seat), in a smooth movement: never a jump, never next to
// another chair. Usage: flock /tmp/dakar-browser.lock node scripts/check-sit-stand.mjs [baseUrl] [outDir]
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:4232/';
const out = process.argv[3] ?? 'docs/screenshots/sit-stand';
fs.mkdirSync(out, { recursive: true });
const results = []; let failed = 0;
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail: String(detail).slice(0, 400) }); if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${String(detail).slice(0, 400)}`); };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
for (const [label, viewport, touch] of [['desktop', { width: 1280, height: 800 }, false], ['phone', { width: 390, height: 844 }, true]]) {
  if (process.env.ONLY && process.env.ONLY !== label) continue;
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch });
  await context.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'low'); } catch { /* */ } });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}?debug${touch ? '&touch' : ''}`, { timeout: 120000 });
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.sitWalk, null, { timeout: 240000 });
  const d = (fn, arg) => page.evaluate(fn, arg);
  const shot = async name => { await page.waitForTimeout(400); try { await page.screenshot({ path: `${out}/${label}-${name}.png` }); } catch { /* */ } };

  const tried = [];
  for (const hub of ['pikine', 'plateau', 'corniche']) {
    await d(h => { window.__dakar.teleport(h); window.__dakar.setHour(13); }, hub);
    await page.waitForFunction(h => window.__dakar.pos().hub === h, hub, { timeout: 120000 });
    await page.waitForTimeout(1500);
    // the chairs, stools and benches at a table: seats with a neighbour within 1.6 m
    const cands = await d(() => {
      const all = window.__dakar.seatsHere().filter(s => (s.kind === 'chair' || s.kind === 'stool' || s.kind === 'bench') && !s.occupant);
      return all.filter(s => s.table && all.some(o => o.id !== s.id && Math.hypot(o.x - s.x, o.z - s.z) < 1.6)).sort((a, b) => (a.kind === 'chair' ? 0 : 1) - (b.kind === 'chair' ? 0 : 1)).slice(0, 4).map(s => ({ id: s.id, x: s.x, z: s.z, yaw: s.yaw }));
    });
    for (const c of cands) tried.push({ hub, ...c });
    console.log(`NOTE: ${hub}: ${cands.length} seats at tables with a neighbour`);
    if (tried.length >= 4) break;
  }
  check(`${label}: there are chairs at tables to try`, tried.length >= 1, JSON.stringify(tried.slice(0, 3)));
  let n = 0;
  for (const c of tried.slice(0, 4)) {
    await d(h => window.__dakar.teleport(h), c.hub);
    await page.waitForFunction(h => window.__dakar.pos().hub === h, c.hub, { timeout: 120000 });
    // 2.2 m from the seat, on the side it faces (the table side): the walk goes round the furniture
    await d(([x, z, yaw]) => window.__dakar.place(x + Math.sin(yaw) * 2.2, z + Math.cos(yaw) * 2.2, yaw + Math.PI), [c.x, c.z, c.yaw]);
    await page.waitForTimeout(600);
    const started = await d(id => window.__dakar.sitWalk(id), c.id);
    if (!started) { console.log(`NOTE: ${c.id} could not be walked to`); continue; }
    const seatedOk = await page.waitForFunction(id => window.__dakar.seated() === id, c.id, { timeout: 60000, polling: 100 }).then(() => true).catch(() => false);
    const origin = await d(() => window.__dakar.sitOrigin?.() ?? null);
    const onSeat = await d(() => window.__dakar.pos());
    await shot(`seat${n}-seated`);
    if (!seatedOk) { check(`${label}: ${c.id} walks to the seat and sits`, false, JSON.stringify(onSeat)); continue; }
    // stand up, sampling the position every frame
    await d(() => { window.__trace = []; { const p = window.__dakar.pos(); window.__trace.push([performance.now(), p.x, p.z, p.y]); } const f = () => { const p = window.__dakar.pos(); window.__trace.push([performance.now(), p.x, p.z, p.y]); if (window.__trace.length < 400) requestAnimationFrame(f); }; requestAnimationFrame(f); window.__dakar.stand(); });
    await page.waitForTimeout(1600);
    const tr = await d(() => window.__trace);
    const end = await d(() => window.__dakar.pos());
    const others = await d(([id]) => window.__dakar.seatsHere().filter(s => s.id !== id).map(s => ({ id: s.id, x: s.x, z: s.z })), [c.id]);
    let maxStep = 0; for (let i = 1; i < tr.length; i++) maxStep = Math.max(maxStep, Math.hypot(tr[i][1] - tr[i - 1][1], tr[i][2] - tr[i - 1][2]));
    const toSeat = Math.hypot(end.x - c.x, end.z - c.z);
    const nearest = others.reduce((m, o) => Math.min(m, Math.hypot(o.x - end.x, o.z - end.z)), Infinity);
    const nearestSeat = others.reduce((m, o) => Math.hypot(o.x - end.x, o.z - end.z) < Math.hypot(m.x - end.x, m.z - end.z) ? o : m, others[0] ?? { x: 1e9, z: 1e9 });
    const fromSeatToOther = Math.hypot(nearestSeat.x - c.x, nearestSeat.z - c.z);
    const dFromOrigin = origin ? Math.hypot(end.x - origin.x, end.z - origin.z) : -1;
    check(`${label}: ${c.id} stands up beside its own seat (${toSeat.toFixed(2)} m), nearer to it than to any other chair`, toSeat <= 1.0 && toSeat < nearest + 0.05, `end ${end.x.toFixed(2)},${end.z.toFixed(2)} · nearest other seat ${nearest.toFixed(2)} m (${nearestSeat.id ?? '-'} is ${fromSeatToOther.toFixed(2)} m from this one)`);
    check(`${label}: ${c.id} stands up smoothly: no step above 0.35 m in a frame (max ${maxStep.toFixed(2)})`, maxStep < 0.35, `${tr.length} samples`);
    // the spot it sat down from is used when it is free ground; at a table it can be inside the furniture, so it is only reported
    if (origin) console.log(`NOTE: ${c.id} sat down from ${origin.x},${origin.z}; rose to ${end.x.toFixed(2)},${end.z.toFixed(2)} (${dFromOrigin.toFixed(2)} m from it)`);
    await shot(`seat${n}-stood`);
    n++;
    // the other way up: sit again, then push the stick / key forward (what a thumb does): the body rises smoothly, then walks on
    if (n === 1) {
      await d(([x, z, yaw]) => window.__dakar.place(x + Math.sin(yaw) * 2.2, z + Math.cos(yaw) * 2.2, yaw + Math.PI), [c.x, c.z, c.yaw]);
      await page.waitForTimeout(500);
      await d(id => window.__dakar.sitWalk(id), c.id);
      await page.waitForFunction(id => window.__dakar.seated() === id, c.id, { timeout: 60000, polling: 100 }).catch(() => {});
      await d(() => { window.__trace = []; { const p = window.__dakar.pos(); window.__trace.push([performance.now(), p.x, p.z, p.y]); } const f = () => { const p = window.__dakar.pos(); window.__trace.push([performance.now(), p.x, p.z, p.y]); if (window.__trace.length < 600) requestAnimationFrame(f); }; requestAnimationFrame(f); });
      await page.keyboard.down('KeyW'); await page.waitForTimeout(1500); await page.keyboard.up('KeyW');
      const tr2 = await d(() => window.__trace);
      const stoodUp = await d(() => window.__dakar.seated() === null);
      let jump = 0; for (let i = 1; i < tr2.length; i++) jump = Math.max(jump, Math.hypot(tr2[i][1] - tr2[i - 1][1], tr2[i][2] - tr2[i - 1][2]));
      check(`${label}: ${c.id} the stick stands the player up, smoothly (max step ${jump.toFixed(2)} m), and he walks on`, stoodUp && jump < 0.6, `${tr2.length} samples`);
    }
  }
  check(`${label}: no page errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
  await context.close();
}
await browser.close();
fs.writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 2));
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
