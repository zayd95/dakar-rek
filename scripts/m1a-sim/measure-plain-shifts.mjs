// Real duration of the plain (timed, no gesture) paid shifts, in the browser (docs/M1A-ECONOMY.md, F1): from picking the action to the
// end of the activity, in the game's own clock (frames count at most 0.1 s, like the game). Verifies the 4–6 s the simulation assumes.
// Usage: npx vite preview --port 4206 (after a build), node scripts/m1a-sim/measure-plain-shifts.mjs [baseUrl] [trials]
import { chromium } from 'playwright';
const base = process.argv[2] ?? 'http://localhost:4206/';
const TRIALS = Number(process.argv[3] ?? 3);
const T = { timeout: 120000 };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
await page.goto(`${base}?debug`, { timeout: 120000 });
await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub, null, T);
const d = (fn, arg) => page.evaluate(fn, arg);
const ONLY = process.argv[4] ? process.argv[4].split(',') : null;
const SHIFTS = [
  { id: 'courrier', frag: ':bank', action: 'Livrer les dossiers', pay: 2400 }, { id: 'boutique-stock', frag: ':boutique', action: 'ranger le stock', pay: 1500 },
  { id: 'debarquement', frag: ':soumbedioune', action: 'Débarquer les caisses', pay: 3200 }, { id: 'filets', frag: ':soumbedioune', action: 'réparer les filets', pay: 1800 },
  { id: 'poisson-service', frag: ':fish', action: 'nettoyage et à la vente', pay: 2200 }, { id: 'atelier', frag: ':craft', action: 'préparer une commande', pay: 1600 },
  { id: 'couture', frag: ':salon-tech', action: 'préparer une commande', pay: 1800 }, { id: 'tech-service', frag: ':salon-tech', action: 'préparer les commandes', pay: 2000 },
  { id: 'expo', frag: ':square', action: 'Installer les stands', pay: 2800 }, { id: 'maison-service', frag: ':maison', action: 'Ranger les arrivages', pay: 2100 },
];
const HUBS = ['pikine', 'plateau', 'corniche', 'almadies'];
const timed = () => d(() => new Promise(resolve => {
  let t = 0, last = performance.now(), started = false;
  const loop = () => { const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now; const a = window.__dakar.activity();
    if (a) { started = true; t += dt; } else if (started) return resolve(+t.toFixed(2)); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
}));
const out = [];
for (const sh of SHIFTS.filter(s => !ONLY || ONLY.includes(s.id))) {
  let found = false;
  for (const hub of HUBS) {
    await d(h => { window.__dakar.teleport(h); window.__dakar.setHour(10); }, hub);
    await page.waitForFunction(h => window.__dakar.pos().hub === h, hub, T).catch(() => {});
    const it = (await d(() => window.__dakar.interactables())).find(i => i.id.includes(sh.frag));
    if (!it) continue;
    const res = [];
    for (let i = 0; i < TRIALS; i++) {
      await d(() => { const s = window.__dakar.state; s.data.wallet = 0; s.data.needs.energie = 95; s.data.needs.faim = 90; s.data.needs.hygiene = 90; });
      await d(p => window.__dakar.place(p.x, p.z, 0), it);
      await page.waitForFunction(f => (window.__dakar.focus()?.id ?? '').includes(f), sh.frag, T).catch(() => {});
      await d(() => window.__dakar.act());
      await page.waitForFunction(() => document.querySelector('#modal.on'), null, T).catch(() => {});
      const item = page.locator('#modal.on .item', { hasText: sh.action }).first();
      if (!(await item.count())) break;
      const timer = timed(); await item.click(); const secs = await timer;
      res.push({ secs, paid: await d(() => window.__dakar.state.wallet) });
    }
    if (!res.length) continue;
    found = true;
    const mean = +(res.reduce((t, r) => t + r.secs, 0) / res.length).toFixed(2);
    const row = { shift: sh.id, hub, trials: res.length, secs: mean, paid: res[0].paid, listed: sh.pay }; out.push(row); console.log(JSON.stringify(row)); break;
  }
  if (!found) console.log(JSON.stringify({ shift: sh.id, note: 'not available (closed, locked or not found)' }));
}
console.log('\nSUMMARY (game-clock seconds per plain shift):');
for (const r of out) console.log(r.shift.padEnd(16), String(r.secs).padStart(6), 's  paid', r.paid, '(listed', r.listed + ')');
await browser.close();
