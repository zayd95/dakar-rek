// Runs the compatibility proof headlessly and writes docs/meshy/proof/results.json (+ shots when --shots).
// Needs `npx vite --port 5199` running at the repo root. Usage: node proof/meshy/run-proof.mjs [--shots]
import { chromium } from 'playwright';
import fs from 'node:fs';
const OUT = 'docs/meshy/proof', shots = process.argv.includes('--shots');
fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 720, height: 480 } });
const errors = []; p.on('pageerror', e => errors.push(String(e))); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await p.goto('http://127.0.0.1:5199/proof/meshy/harness.html'); await p.waitForFunction(() => window.ready, null, { timeout: 120000 });
const results = { init: await p.evaluate(() => window.proof.init()), cases: {} };
const ids = await p.evaluate(() => window.proof.cases);
for (const id of ids) {
  const r = results.cases[id] = {};
  r.onFoot = {}; for (const [name, sp] of [['walk', 1.4], ['jog', 3.8], ['run', 5.8]]) r.onFoot[name] = await p.evaluate(([i, s]) => window.proof.onFoot(window.proof.caseOf(i), s), [id, sp]);
  r.footShape = await p.evaluate(i => window.proof.footShape(window.proof.caseOf(i)), id);
  r.sitStand = await p.evaluate(i => window.proof.sitStand(window.proof.caseOf(i)), id);
  r.ride = await p.evaluate(i => window.proof.ride(window.proof.caseOf(i)), id);
  r.gestures = await p.evaluate(i => window.proof.gestures(window.proof.caseOf(i)), id);
  r.transitions = await p.evaluate(i => window.proof.transitions(window.proof.caseOf(i)), id);
  r.cost = await p.evaluate(i => window.proof.cost(window.proof.caseOf(i)), id);
  console.log('done', id);
}
results.switching = await p.evaluate(() => window.proof.switching());
results.lodVariants = {};
for (const [id, caseId, file] of [['meshy_m', 'meshy_m', 'meshy_m_low.glb'], ['meshy_f', 'meshy_f', 'meshy_f_low.glb']]) {
  const load = await p.evaluate(([i, f]) => window.proof.loadVariant(i, f), [id, file]);
  results.lodVariants[file] = { load, cost: await p.evaluate(i => window.proof.cost(window.proof.caseOf(i)), caseId), onFootRun: await p.evaluate(i => window.proof.onFoot(window.proof.caseOf(i), 5.8), caseId) };
  await p.evaluate(([i, f]) => window.proof.loadVariant(i, f), [id, id === 'meshy_m' ? 'meshy_m_v4rig.glb' : 'meshy_f_v4rig.glb']);
}
results.pageErrors = errors;
fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 1));
if (shots) {
  await p.setViewportSize({ width: 1100, height: 520 }); await p.evaluate(() => window.proof.resize(1100, 520));
  for (const k of ['idle', 'walk', 'run', 'sit', 'talk', 'gesture']) { await p.evaluate(k => { window.__cleanup = window.proof.lineup(k); }, k); await p.screenshot({ path: `${OUT}/lineup-${k}.png` }); await p.evaluate(() => window.__cleanup()); }
  await p.setViewportSize({ width: 520, height: 640 }); await p.evaluate(() => window.proof.resize(520, 640));
  for (const id of ['meshy_m', 'meshy_f', 'v4_m']) for (const v of ['front', 'side', 'back', 'face', 'hands']) { await p.evaluate(([i, v]) => { window.__cleanup = window.proof.closeUp(i, v); }, [id, v]); await p.screenshot({ path: `${OUT}/${id}-${v}.png` }); await p.evaluate(() => window.__cleanup()); }
}
console.log('page errors:', errors.length, errors.slice(0, 3));
await b.close();
