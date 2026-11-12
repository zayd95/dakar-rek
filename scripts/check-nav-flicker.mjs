// Driving directions on every district's streets (src/game/navRules.ts driverWay; the owner's report: « Fais demi-tour » flickering on any hub).
// Moves the player along two streets of each district, in the kerb lane, toward the district's centre, and records the goal line's text at each step
// (nav.info().now: computed on foot too, from the same rules as at the wheel). Prints, per run, how often the text changed and how often it said « Fais demi-tour »;
// fails if it ever did (none of these runs needs a U-turn). Usage: node scripts/check-nav-flicker.mjs <baseUrl>
import { chromium } from 'playwright';
const [base = 'http://127.0.0.1:4620/', tag = 'nav'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await ctx.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'low'); } catch { /* */ } });
const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.goto(`${base}?debug&touch&heure=15`, { timeout: 180000 });
await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub, null, { timeout: 240000 });
const d = (f, a) => page.evaluate(f, a);
const out = {};
// the goal: the district's centre (a place chosen on the map that the district does not have: its centre, never reached on these runs)
// streets: x = −63.5 (the kerb lane of x = −60), heading +z, from z = −110 to +40; and x heading −x along z = 63.5 (kerb lane of z = 60)
const runs = [{ name: 'north on x=-60', x0: -63.5, z0: -110, dx: 0, dz: 1, yaw: 0, n: 75 }, { name: 'west on z=60', x0: 110, z0: 63.5, dx: -1, dz: 0, yaw: -Math.PI / 2, n: 75 }];
for (const hub of ['plateau', 'pikine', 'almadies', 'corniche', 'mermoz']) {
  await d(h => window.__dakar.teleport(h, -63.5, -110, 0), hub);
  await page.waitForFunction(h => window.__dakar.pos().hub === h && window.__dakar.pos().mode === 'play', hub, { timeout: 240000 });
  await page.waitForTimeout(1500);
  for (const r of runs) {
    // a goal: a place chosen on the map (the debug hook sets the manual goal; the point is set directly)
    await d(a => { const A = window.__dakar; A.nav.to(a.hub, 'Probe'); }, { hub });
    const said = [];
    for (let i = 0; i < r.n; i += 2) {
      await d(a => { const A = window.__dakar; A.place(a.x, a.z, a.yaw); }, { x: r.x0 + r.dx * i, z: r.z0 + r.dz * i, yaw: r.yaw });
      await page.waitForTimeout(260);
      const t = await d(() => window.__dakar.nav.info().now?.text ?? null);
      said.push(t);
    }
    const ch = said.filter((t, i) => i && t !== said[i - 1]).length, backs = said.filter(t => /demi-tour/.test(t ?? '')).length;
    out[`${hub} ${r.name}`] = { changes: ch, backs, said: [...new Set(said)].slice(0, 6) };
  }
  console.log(hub, JSON.stringify(Object.entries(out).filter(([k]) => k.startsWith(hub)).map(([k, v]) => [k, v.changes, v.backs])));
}
console.log(tag, 'RESULT', JSON.stringify(out));
console.log('errors', errors.length, errors.slice(0, 2));
await browser.close();
const backs = Object.values(out).reduce((n, v) => n + v.backs, 0);
console.log(backs === 0 && errors.length === 0 ? 'PASS: no « Fais demi-tour » on any district\'s streets, no page error' : `FAIL: « Fais demi-tour » ${backs} times, ${errors.length} page errors`);
process.exit(backs === 0 && errors.length === 0 ? 0 : 1);
