// Real gesture durations of the paid trades, played in the browser by a human-like bot (docs/M1A-ECONOMY.md, finding F1).
// Time is counted in the gesture's own clock: the game advances it by at most 0.1 s per frame (src/ui/gesture.ts), so wall time under
// software rendering would overstate it. The bot reads the card like a player: a reaction time before each pick (1.0–1.6 s to read
// and tap a choice, 0.9–1.5 s per wheel step), aims for the middle of the green zone on timing rounds and taps 0.12–0.30 s late
// (the cursor keeps moving), and picks a wrong goods item 5 % of the time.
// Usage: npx vite preview --port 4206 (after a build), node scripts/m1a-sim/measure-gestures.mjs [baseUrl] [trials]
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:4206/';
const TRIALS = Number(process.argv[3] ?? 5);
const T = { timeout: 180000 };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
await page.goto(`${base}?debug`, { timeout: 120000 });
await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub, null, T);
const d = (fn, arg) => page.evaluate(fn, arg);

const startAt = async (frag, action) => {
  const it = (await d(() => window.__dakar.interactables())).find(i => i.id.includes(frag));
  if (!it) return false;
  await d(p => window.__dakar.place(p.x, p.z, 0), it);
  await page.waitForFunction(f => (window.__dakar.focus()?.id ?? '').includes(f), frag, T).catch(() => {});
  await d(() => window.__dakar.act());
  await page.waitForFunction(() => document.querySelector('#modal.on'), null, T).catch(() => {});
  const item = page.locator('#modal.on .item', { hasText: action }).first();
  if (!(await item.count())) return false;
  await item.click();
  await page.waitForFunction(() => window.__dakar.gesture(), null, T).catch(() => {});
  return true;
};

/** Plays the whole shift (every gesture part) like a person; returns the gesture-clock seconds and the rounds played. */
const play = () => d(() => new Promise(resolve => {
  const rnd = (a, b) => a + Math.random() * (b - a);
  let gameT = 0, last = performance.now(), start = null, key = '', due = null, aimed = false, rounds = 0;
  const loop = () => {
    const now = performance.now(); const dt = Math.min(0.1, (now - last) / 1000); last = now;
    const g = window.__dakar.gesture();
    if (!g) { if (start !== null && !window.__dakar.activity()) return resolve({ secs: +(gameT - start).toFixed(2), rounds }); if (start !== null) gameT += dt; return requestAnimationFrame(loop); }
    gameT += dt; if (start === null) start = gameT - dt;
    if (g.pause) { key = ''; due = null; return requestAnimationFrame(loop); }
    const k = `${g.kind}:${g.label}:${g.round}:${g.results.length}`;
    if (k !== key) { key = k; due = null; aimed = false; rounds++; }
    if (g.kind === 'timing') {
      const w = g.zone[1] - g.zone[0], c = (g.zone[0] + g.zone[1]) / 2;
      if (!aimed && Math.abs(g.cursor - c) < w * 0.3) { aimed = true; due = gameT + rnd(0.12, 0.30); }
      if (due !== null && gameT >= due) { document.querySelector('#gesture .gst-tap')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); due = null; aimed = true; }
    } else {
      if (due === null) due = gameT + (g.kind === 'choose' ? rnd(1.0, 1.6) : rnd(0.9, 1.5));
      if (gameT >= due) {
        const id = g.kind === 'choose' ? (Math.random() < 0.05 ? g.shown.find(x => x !== g.ask) : g.ask) : g.next;
        document.querySelector(`#gesture [data-pick="${id}"]`)?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); due = Infinity;
      }
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}));

const SHIFTS = [
  { id: 'meca', hub: 'pikine', frag: ':garage:', action: 'Aider le mécanicien', pay: 2000 },
  { id: 'roue', hub: 'pikine', frag: ':garage:', action: 'Changer une roue', pay: 1500 },
  { id: 'vendre', hub: 'plateau', frag: ':market', action: 'Tenir l’étal', pay: 2500 },
  { id: 'pecheurs', hub: 'almadies', frag: ':port', action: 'Aider les pêcheurs', pay: 3500 },
  { id: 'pirogue', hub: 'almadies', frag: ':port', action: 'Pirogue du matin', pay: 4500 },
];
const out = [];
for (const sh of SHIFTS) {
  await d(h => { window.__dakar.teleport(h); window.__dakar.setHour(10); }, sh.hub);
  await page.waitForFunction(h => window.__dakar.pos().hub === h, sh.hub, T).catch(() => {});
  const res = [];
  for (let i = 0; i < TRIALS; i++) {
    await d(() => { const s = window.__dakar.state; s.data.wallet = 0; s.data.needs.energie = 95; s.data.needs.faim = 90; });
    if (!(await startAt(sh.frag, sh.action))) { console.log(sh.id, 'not available here, skipped'); break; }
    const r = await play();
    await page.waitForFunction(() => !window.__dakar.activity(), null, T).catch(() => {});
    const paid = await d(() => window.__dakar.state.wallet);
    res.push({ ...r, paid, factor: +(paid / sh.pay).toFixed(2) });
  }
  if (!res.length) continue;
  const mean = k => +(res.reduce((t, r) => t + r[k], 0) / res.length).toFixed(2);
  const row = { shift: sh.id, trials: res.length, secs: mean('secs'), min: Math.min(...res.map(r => r.secs)), max: Math.max(...res.map(r => r.secs)), rounds: mean('rounds'), payFactor: mean('factor') };
  out.push(row); console.log(JSON.stringify(row), JSON.stringify(res.map(r => [r.secs, r.factor])));
}
console.log('\nSUMMARY (gesture-clock seconds per shift, human-like bot):');
for (const r of out) console.log(r.shift.padEnd(10), String(r.secs).padStart(6), 's  (min', r.min, 'max', r.max, ') rounds', r.rounds, ' pay factor', r.payFactor);
await browser.close();
