// 1.0.1 HUD polish pass (docs/proof/release-1.0.1/hud/): the whole HUD as the 1.0.1 packages left it, the same moments before and after each fix, on two
// phones in both orientations and a desktop. The moments: the street by day with the goal line; a Tiak Tiak run in hand (the delivery line, the goal line,
// the marker); the notices stacked over it (the money-received card, a moment that waits behind it, a refusal, a spoken line); the card after a delivery
// with the next run; the street at night in the Almadies; inside a living place (the Terrasse de Ngor at 21 h); riding the moto at night; the opening's
// « Passer ». Each picture is written with `__dakar.quiet()` (the overlays over the middle of the screen, the transient lines, the cards) and the boxes
// of the HUD's parts, so an overlap or a part off the screen can be read, not only seen.
// What sets the scene is the debug API (district, hour, money, a run accepted and handed over, the notices); nothing here is a player's touch.
// Usage: node scripts/shots-hud-101.mjs <baseUrl> <outDir> <prefix> [views=p390,p360,l844,l780,desk] [moments=day,tiak,stacked,next,night,venue,ride,opening]
import { chromium } from 'playwright';
import fs from 'node:fs';

const [base = 'http://127.0.0.1:47311/', out = 'docs/proof/release-1.0.1/hud', prefix = 'after', viewsArg = 'p390,p360,l844,l780,desk', momentsArg = 'day,tiak,stacked,next,night,venue,ride,opening'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const VIEWS = { p390: [390, 844, true], p360: [360, 780, true], l844: [844, 390, true], l780: [780, 360, true], desk: [1280, 800, false] };
const MOMENTS = momentsArg.split(',');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const report = {};
const PARTS = ['#stats', '#place', '#menuBtn', '#goal', '#delivery', '#toast .mo', '#toast .t', '#act', '#actMore', '#progress', '#joy', '#runBtn', '#chatBtn', '#presenceBtn', '#minimap', '#mm', '#speedo', '#ridepad', '#steerpad', '#opening .op-skip', '#streakChip', '#sceneTag'];

for (const v of viewsArg.split(',')) {
  const [w, h, touch] = VIEWS[v];
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch, deviceScaleFactor: 2 });
  await ctx.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'low'); } catch { /* */ } });
  const page = await ctx.newPage(); page.setDefaultTimeout(240000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const d = (fn, a) => page.evaluate(fn, a);
  const settle = () => page.waitForFunction(() => document.getAnimations().every(a => a.playState !== 'running' || a.effect?.getComputedTiming().iterations === Infinity), null, { timeout: 15000 }).catch(() => {});
  const shot = async name => {
    await page.waitForTimeout(400); await settle(); await page.waitForTimeout(200);
    const file = `${out}/${prefix}-${v}-${name}.png`;
    await page.screenshot({ path: file, timeout: 120000 });
    const info = await d(parts => {
      const box = s => { const e = document.querySelector(s); if (!e) return null; const cs = getComputedStyle(e); const r = e.getBoundingClientRect(); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0 || r.width === 0 || r.height === 0) return null; return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]; };
      return { quiet: window.__dakar.quiet?.(), boxes: Object.fromEntries(parts.map(p => [p, box(p)]).filter(([, b]) => b)) };
    }, PARTS);
    (report[v] ??= {})[name] = info;
    console.log(`${prefix}-${v}-${name}`);
  };
  const ready = () => page.waitForFunction(() => window.__dakar?.pos?.().hub && window.__dakar.pos().mode === 'play', null, { timeout: 240000 });
  const goHub = async (hub, hour, at) => {
    await d(([x, hr, p]) => { window.__dakar.setHour(hr); return p ? window.__dakar.teleport(x, p.x, p.z, p.yaw ?? 0) : window.__dakar.teleport(x); }, [hub, hour, at]);
    await page.waitForFunction(x => window.__dakar.pos().hub === x && window.__dakar.pos().mode === 'play', hub, { timeout: 120000 });
    await page.waitForTimeout(2500);
    await d(() => { const n = window.__dakar.state.data.needs; n.energie = 90; n.faim = 80; n.moral = 80; n.social = 70; n.hygiene = 80; });
  };
  await page.goto(`${base}?debug${touch ? '&touch' : ''}&heure=10&argent=900000`, { timeout: 180000 });
  await ready();

  if (MOMENTS.includes('day')) { await goHub('pikine', 10); await shot('day'); }
  let run = null;
  if (MOMENTS.some(m => ['tiak', 'stacked', 'next'].includes(m))) {
    await goHub('pikine', 15);
    const b = (await d(() => window.__dakar.board())).filter(x => x.toHub === 'pikine' && !x.blocked).sort((p, q) => p.metres - q.metres)[0];
    if (b) { await d(id => window.__dakar.acceptJob(id, false), b.id); run = await d(() => window.__dakar.activeJob()); }
    await page.waitForFunction(() => document.querySelector('#delivery.on'), null, { timeout: 30000 }).catch(() => {});
    if (MOMENTS.includes('tiak')) await shot('tiak');
    if (MOMENTS.includes('stacked')) {
      await d(() => {
        const k = window.__dakar;
        k.uiOffer?.({ icon: '💸', title: '1 000 F reçus de Moussa', line: 'Sur ton Teranga Money. Retire-les pour les avoir dans ton portefeuille.', actions: [{ label: 'Retirer 1 000 F', primary: true }, { label: 'Voir' }], keep: true });
        k.uiMoment('Nouvelle cliente', ['Awa, du Salon Awa, te recommandera.']);
        k.uiToast('Cheikh : « Café Touba, chaud ! »');
        k.uiToast('Pas assez d’énergie pour courir', 'warn');
      });
      await shot('stacked');
    }
    if (MOMENTS.includes('next') && run) {
      await d(() => document.querySelectorAll('#toast .mo').forEach(e => e.remove()));
      await d(() => { const a = window.__dakar.state.data.jobs.active; if (a) { a.stage = 'deliver'; a.startedMs = window.__dakar.state.data.playedMs; a.limitMs = 600000; } });
      await d(id => window.__dakar.completeJob(id), run.runId);
      await page.waitForFunction(() => document.querySelector('#toast .mo.bc'), null, { timeout: 30000 }).catch(() => {});
      await shot('next');
      await d(() => { document.querySelectorAll('#toast .mo').forEach(e => e.remove()); window.__dakar.cancelJob(); });
    }
  }
  if (MOMENTS.includes('night')) { await goHub('almadies', 21); await shot('night'); }
  if (MOMENTS.includes('venue')) {
    if ((await d(() => window.__dakar.pos().hub)) !== 'almadies') await goHub('almadies', 21);
    const door = (await d(() => window.__dakar.interactables())).find(i => i.id === 'almadies:rooftop:almadies');
    if (door) {
      await d(p => window.__dakar.place(p.x, p.z, 0), door);
      await page.waitForFunction(() => window.__dakar.focus()?.id === 'almadies:rooftop:almadies', null, { timeout: 30000 }).catch(() => {});
      await d(() => window.__dakar.act());
      await page.waitForFunction(() => window.__dakar.pos().x > 1000 && window.__dakar.pos().mode === 'play', null, { timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(3000);
      await shot('venue');
      await d(() => window.__dakar.exit()); await page.waitForFunction(() => window.__dakar.pos().x < 900 && window.__dakar.pos().mode === 'play', null, { timeout: 60000 }).catch(() => {});
    }
  }
  if (MOMENTS.includes('ride')) {
    await goHub('pikine', 21);
    await d(() => window.__dakar.moto.own());
    await page.waitForFunction(() => window.__dakar.moto.at(), null, { timeout: 60000 }).catch(() => {});
    const c = await d(() => window.__dakar.moto.at());
    if (c) {
      const L = { x: Math.cos(c.yaw), z: -Math.sin(c.yaw) };
      await d(([x, z, yaw]) => window.__dakar.place(x, z, yaw), [c.x + L.x * 1.6, c.z + L.z * 1.6, Math.atan2(-L.x, -L.z)]);
      await page.waitForFunction(() => window.__dakar.focus()?.id === 'moto:parked', null, { timeout: 20000 }).catch(() => {});
      await d(() => window.__dakar.act());
      await page.waitForFunction(() => window.__dakar.moto.at()?.driving, null, { timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(2500);
      await shot('ride');
    }
  }
  if (MOMENTS.includes('opening')) {
    const p2 = await ctx.newPage();
    await p2.goto(`${base}?intro${touch ? '&touch' : ''}`, { timeout: 180000 });
    await p2.waitForFunction(() => document.querySelector('#opening .op-skip') && getComputedStyle(document.querySelector('#opening .op-skip')).display !== 'none', null, { timeout: 240000 }).catch(() => {});
    await p2.waitForTimeout(2500);
    await p2.screenshot({ path: `${out}/${prefix}-${v}-opening.png` });
    console.log(`${prefix}-${v}-opening`);
    await p2.close();
  }
  if (errors.length) console.log(`  ${v}: page errors: ${errors.slice(0, 3).join(' | ')}`);
  await ctx.close();
}
fs.writeFileSync(`${out}/${prefix}-boxes.json`, JSON.stringify(report, null, 1));
await browser.close();
