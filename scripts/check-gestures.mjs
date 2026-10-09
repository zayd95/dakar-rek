// Gestures of the trades, played in the browser: Garage Modou (pass the tools, tighten the nuts, change a wheel) and the
// Étal de Sandaga (serve the customers). Checks the pay follows the play, Escape stops cleanly, controls come back.
// Usage: node scripts/check-gestures.mjs [baseUrl] [outDir]   (needs a running build, e.g. `npx vite preview --port 4208`)
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:4208/';
const out = process.argv[3] ?? 'docs/screenshots/gestures';
fs.mkdirSync(out, { recursive: true });
const T = { timeout: 180000 };
const results = []; let failed = 0;
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${detail}`); };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
for (const [label, viewport, touch] of [['desktop', { width: 1280, height: 720 }, false], ['phone', { width: 390, height: 844 }, true]]) {
  const page = await (await browser.newContext({ viewport, hasTouch: touch, isMobile: touch })).newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}?debug${touch ? '&touch' : ''}`, { timeout: 120000 });
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub, null, T);
  const d = (fn, arg) => page.evaluate(fn, arg);
  const shot = async name => { await page.waitForTimeout(250); await page.screenshot({ path: `${out}/${label}-${name}.png` }); };
  const g = () => d(() => window.__dakar.gesture());
  /** Opens a place's sheet next to it and picks one of its actions. */
  const startAt = async (frag, action) => {
    const it = (await d(() => window.__dakar.interactables())).find(i => i.id.includes(frag));
    await d(p => window.__dakar.place(p.x, p.z, 0), it);
    await page.waitForFunction(f => (window.__dakar.focus()?.id ?? '').includes(f), frag, T).catch(() => {});
    await d(() => window.__dakar.act());
    await page.waitForFunction(() => document.querySelector('#modal.on'), null, T).catch(() => {});
    await page.locator('#modal.on .item', { hasText: action }).first().click();
    await page.waitForFunction(() => window.__dakar.gesture(), null, T).catch(() => {});
  };
  /** Plays the current gesture: `right` = the share of rounds to get right. Real clicks / taps on the card. */
  const playGesture = async (right = 1) => {
    let n = 0, label = null;
    const T2 = { timeout: 180000 };                      // software rendering can drop to ~1 frame/s under load
    for (let guard = 0; guard < 40; guard++) {
      const s = await g(); if (!s) break;
      if (label === null) label = s.label; else if (s.label !== label) break;   // the next part of the shift is played by the next call
      if (s.pause) { await page.waitForFunction(r => !window.__dakar.gesture()?.pause, null, T2).catch(() => {}); continue; }
      const good = n < Math.round(right * s.rounds);
      const before = { round: s.round, done: s.results.length };
      if (s.kind === 'choose') {
        const id = good ? s.ask : s.shown.find(x => x !== s.ask);
        await d(id => document.querySelector(`#gesture [data-pick="${id}"]`).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })), id); n++;
      } else if (s.kind === 'sequence') {
        await page.locator(`#gesture [data-pick="${s.next}"]`).dispatchEvent('pointerdown');
      } else {
        // press inside (or outside) the green zone: wait in the page for the cursor, then tap the button
        await d(want => new Promise(res => {
          const t0 = performance.now();
          const step = () => { const i = window.__dakar.gesture(); if (!i) return res(0); const inZone = i.cursor >= i.zone[0] + 0.01 && i.cursor <= i.zone[1] - 0.01;
            if (inZone === want || performance.now() - t0 > 60000) { document.querySelector('#gesture .gst-tap').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); return res(1); } requestAnimationFrame(step); };
          step();
        }), good); n++;
      }
      await page.waitForFunction(b => { const i = window.__dakar.gesture(); return !i || i.results.length > b.done || i.round > b.round; }, before, T2).catch(() => {});
    }
  };

  // 1. Garage Modou (Pikine): pass the tools, then tighten the nuts — all right = full pay with the tip.
  await d(() => { window.__dakar.teleport('pikine'); window.__dakar.setHour(10); const s = window.__dakar.state; s.data.wallet = 0; s.data.needs.energie = 90; });
  await page.waitForFunction(() => window.__dakar.pos().hub === 'pikine', null, T);
  await startAt(':garage:', 'Aider le mécanicien');
  const g1 = await g();
  check(`${label}: the garage shift starts with Modou asking for a tool`, g1?.kind === 'choose' && !!g1.ask && g1.shown.length === 4, JSON.stringify(g1));
  await shot('garage-tools');
  await playGesture(1);
  await page.waitForFunction(() => window.__dakar.gesture()?.kind === 'timing', null, T).catch(() => {});
  const g2 = await g();
  check(`${label}: then the wheel nuts — a cursor to stop in the green`, g2?.kind === 'timing' && g2.zone[1] > g2.zone[0], JSON.stringify(g2));
  await page.waitForTimeout(400); await shot('garage-bolts');
  await playGesture(1);
  await page.waitForFunction(() => !window.__dakar.activity(), null, T).catch(() => {});
  const w1 = await d(() => ({ wallet: window.__dakar.state.wallet, garage: window.__dakar.state.data.counters.garage, energie: window.__dakar.state.data.needs.energie, mode: window.__dakar.pos().mode, toast: document.getElementById('toast').textContent }));
  check(`${label}: a perfect shift pays the full rate plus the tip, tires, counts`, w1.wallet === 2400 && w1.garage === 1 && w1.energie <= 73 && w1.mode === 'play', JSON.stringify(w1));

  // 2. Badly played: half the tools wrong → less pay.
  await d(() => { const s = window.__dakar.state; s.data.wallet = 0; s.data.needs.energie = 90; });
  await startAt(':garage:', 'Aider le mécanicien');
  await playGesture(0.5);
  await page.waitForFunction(() => window.__dakar.gesture()?.kind === 'timing', null, T).catch(() => {});
  await playGesture(0.5);
  await page.waitForFunction(() => !window.__dakar.activity(), null, T).catch(() => {});
  const w2 = await d(() => window.__dakar.state.wallet);
  check(`${label}: a so-so shift pays less (the play matters)`, w2 > 0 && w2 < 2400, `${w2} F`);

  // 3. Change a wheel: steps in the right order.
  await d(() => { const s = window.__dakar.state; s.data.wallet = 0; s.data.needs.energie = 90; });
  await startAt(':garage:', 'Changer une roue');
  const g3 = await g();
  check(`${label}: changing a wheel asks for the steps in order`, g3?.kind === 'sequence' && g3.shown.length === 5, JSON.stringify(g3?.shown));
  await shot('garage-wheel');
  await playGesture(1);
  await page.waitForFunction(() => !window.__dakar.activity(), null, T).catch(() => {});
  check(`${label}: the wheel done in order pays the full rate`, (await d(() => window.__dakar.state.wallet)) === 1800, String(await d(() => window.__dakar.state.wallet)));

  // 4. Escape in the middle stops cleanly: no pay, card gone, controls back.
  await d(() => { const s = window.__dakar.state; s.data.wallet = 0; s.data.needs.energie = 90; });
  await startAt(':garage:', 'Aider le mécanicien');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !window.__dakar.activity(), null, T).catch(() => {});
  const st = await d(() => ({ g: window.__dakar.gesture(), a: window.__dakar.activity(), wallet: window.__dakar.state.wallet, mode: window.__dakar.pos().mode, card: document.getElementById('gesture').classList.contains('on'), phone: window.__dakar.phoneInfo?.().open ?? false }));
  check(`${label}: Escape stops the shift — no pay, the card closes, controls come back`, !st.g && !st.a && st.wallet === 0 && st.mode === 'play' && !st.card && !st.phone, JSON.stringify(st));

  // 5. The market stall (Plateau): serve the customers before they leave.
  await d(() => { window.__dakar.teleport('plateau'); const s = window.__dakar.state; s.data.wallet = 0; s.data.needs.energie = 90; });
  await page.waitForFunction(() => window.__dakar.pos().hub === 'plateau', null, T);
  await startAt(':market', 'Tenir l’étal');
  const g5 = await g();
  check(`${label}: at the stall a customer asks for something`, g5?.kind === 'choose' && g5.rounds === 6, JSON.stringify(g5));
  await shot('market');
  await playGesture(1);
  await page.waitForFunction(() => !window.__dakar.activity(), null, T).catch(() => {});
  check(`${label}: serving everyone right pays the stall's full rate`, (await d(() => window.__dakar.state.wallet)) === 3000, String(await d(() => window.__dakar.state.wallet)));
  check(`${label}: no page errors`, errors.length === 0, errors.join(' | '));
}
await browser.close();
fs.writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 2));
console.log(`\n${results.length - failed}/${results.length} gesture checks passed`);
process.exit(failed ? 1 : 0);
