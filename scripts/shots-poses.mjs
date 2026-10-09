// Before / after captures of the home and social poses (bed → Lie, mat / rug → SitFloor, attaya circle → SitFloor),
// desktop and phone, plus the vehicle animation (steering and moto lean). Needs a running build (?debug).
// Usage: flock /tmp/dakar-browser.lock node scripts/shots-poses.mjs [baseUrl] [outDir]
// « before » rebuilds the old logic in the same build: every seat held the chair Sit clip 0.48 m under its surface.
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:4215/';
const out = process.argv[3] ?? 'docs/screenshots/poses';
fs.mkdirSync(out, { recursive: true });
const T = { timeout: 180000 };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const errors = []; let shots = 0;
const VIEWS = {
  bed: { p: [0.6, 2.7, 3.9], t: [0, 0.45, -0.6] },
  mat: { p: [0.5, 2.3, 3.7], t: [0, 0.3, 0] },
  attaya: { p: [0.4, 2.0, 3.2], t: [0, 0.35, -0.15] },
};
for (const [label, viewport, touch] of [['desktop', { width: 1280, height: 720 }, false], ['phone', { width: 390, height: 844 }, true]]) {
  const page = await (await browser.newContext({ viewport, hasTouch: touch, isMobile: touch })).newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'high'); } catch { /* */ } });
  await page.goto(`${base}?debug${touch ? '&touch' : ''}`, T);
  await page.waitForFunction(() => window.__dakar?.pos().hub && window.__dakar.kitPoses && window.__dakar.wrestlerReady(), null, T);
  await page.evaluate(() => { document.getElementById('ui').style.visibility = 'hidden'; window.__dakar.teleport('almadies'); window.__dakar.setHour(11); });
  const settle = () => page.evaluate(() => new Promise(r => { let n = 0; const f = () => (++n < 6 ? requestAnimationFrame(f) : r()); requestAnimationFrame(f); }));
  for (const scene of ['bed', 'mat', 'attaya']) {
    for (const before of [true, false]) {
      const people = await page.evaluate(([s, b]) => { const d = window.__dakar; const r = d.kitPoses(s, { before: b }); d.place(4000, 30, 0); const body = d.body(); if (body) body.group.scale.setScalar(0.0001); return r; }, [scene, before]);
      const v = VIEWS[scene], k = touch ? 1.55 : 1;
      await page.evaluate(([p, t]) => window.__dakar.cam(p, t), [[4000 + v.p[0], v.p[1] * (touch ? 1.25 : 1), v.p[2] * k], [4000 + v.t[0], v.t[1], v.t[2]]]);
      await settle(); await page.waitForTimeout(400);
      await page.screenshot({ path: `${out}/${before ? 'before' : 'after'}-${scene}-${label}.jpg`, quality: 82 }); shots++;
      console.log(label, scene, before ? 'before' : 'after', people.length, 'people');
    }
  }
  if (!touch) {
    // vehicle animation: front wheels and the moto's front end steer, motos lean into the turn
    for (const [name, steer] of [['straight', 0], ['turning', 0.45]]) {
      const spots = await page.evaluate(() => window.__dakar.kitShowroom({ vehicles: [{ kind: 'moto', seed: 1 }, { kind: 'moto', seed: 3 }, { kind: 'taxi', seed: 2 }], gap: 1.6, yaw: 0 }));
      await page.evaluate(s => window.__dakar.kitDrive(8, s, 1.5), steer);
      const m = (spots[0].x + spots[spots.length - 1].x) / 2;
      await page.evaluate(([m]) => window.__dakar.cam([m + 1.2, 2.2, 6.4], [m, 0.7, 0]), [m]);
      await settle(); await page.waitForTimeout(300);
      await page.screenshot({ path: `${out}/drive-${name}-${label}.jpg`, quality: 82 }); shots++;
    }
  }
  await page.evaluate(() => window.__dakar.kitClear());
  await page.context().close();
}
await browser.close();
console.log(JSON.stringify({ shots, errors }));
if (errors.length) process.exitCode = 1;
