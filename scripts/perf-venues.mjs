// 1.0.1 living places: what each of the four places costs to draw at its busy hour, the same way before and after (any build: nothing here needs the new hooks).
// On a phone-sized touch page, the « Moyenne » preset unless QUALITY says otherwise: Le Patio at 1 h (in the courtyard, the dance floor ahead), Ngor's beach at 15 h
// (on the boardwalk, the sea ahead), the Terrasse de Ngor and Toit Baobab at 21 h (on the deck, from the stairs). For each: the frame's draw calls and triangles
// (three.js renderer.info, the most over three looks of six frames) and the animated bodies in view (every visible humanoid but the player's). Counts carry over to a
// phone; frame times on this software renderer do not, and none are reported. Usage: node scripts/perf-venues.mjs <baseUrl> <out.json> [label]
import { chromium } from 'playwright';
import fs from 'node:fs';
const [base = 'http://127.0.0.1:4173/', outFile = '/tmp/perf-venues.json', label = ''] = process.argv.slice(2);
const quality = process.env.QUALITY ?? 'medium', T = { timeout: 300000 };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
await context.addInitScript(q => { try { localStorage.setItem('dakarrek.quality', q); } catch { /* */ } }, quality);
const page = await context.newPage(); page.setDefaultTimeout(300000);
await page.goto(`${base}?debug&touch&heure=15`, { timeout: 180000 });
await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.pos().mode === 'play', null, T);
const d = (fn, a) => page.evaluate(fn, a);
const go = async hub => {
  if ((await d(() => window.__dakar.pos().hub)) === hub) return;
  await d(h => window.__dakar.teleport(h), hub);
  await page.waitForFunction(h => window.__dakar.pos().hub === h && window.__dakar.pos().mode === 'play', hub, T);
};
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
const yawTo = (a, b) => Math.atan2(b.x - a.x, b.z - a.z);
const terrace = hub => async () => {
  await go(hub);
  await page.waitForFunction(() => !!window.__dakar.rooftop?.info(), null, T);
  await d(() => window.__dakar.rooftop.enter());
  await page.waitForFunction(() => window.__dakar.pos().mode === 'play' && Math.abs(window.__dakar.pos().x) > 3000, null, T);
  const i = await d(() => window.__dakar.rooftop.info()), ox = i.bar.x - 2.2;
  await d(([x, z, y]) => window.__dakar.place(x, z, y), [ox + 4.6, 4.0, Math.PI + 0.3]);
};
const VENUES = [
  ['Le Patio', 1, async () => {
    await go('almadies');
    await page.waitForFunction(() => window.__dakar.venues?.().some(v => v.type === 'patio'), null, T);
    const p = await d(() => window.__dakar.venues().find(v => v.type === 'patio'));
    await d(([x, z, y]) => window.__dakar.place(x, z, y), [p.inside.x, p.inside.z, yawTo(p.inside, p.floor)]);
  }],
  ['Ngor beach', 15, async () => { await go('almadies'); await d(() => window.__dakar.place(-8, -131.6, Math.PI)); }],
  ['Terrasse de Ngor', 21, terrace('almadies')],
  ['Toit Baobab', 21, terrace('plateau')],
];
const rows = [];
for (const [name, hour, view] of VENUES) {
  await d(h => window.__dakar.setHour(h), hour);
  await view();
  await page.waitForTimeout(8000);                                    // the venue's people, the street and the staged pieces have settled
  let m = { calls: 0, tris: 0, bodies: 0 };
  for (let k = 0; k < 3; k++) { const x = await measure(); m = { calls: Math.max(m.calls, x.calls), tris: Math.max(m.tris, x.tris), bodies: Math.max(m.bodies, x.bodies) }; await page.waitForTimeout(2000); }
  const life = await d(() => (window.__dakar.venueLife?.() ?? []).filter(l => l.active).map(l => ({ name: l.name, present: l.present, bodies: l.bodies, figures: l.figures, drawCalls: l.drawCalls })));
  rows.push({ venue: name, hour, quality, ...m, life });
  console.log(`${quality} ${name} ${hour} h: ${m.calls} calls, ${m.tris} tris, ${m.bodies} bodies${life.length ? ` · ${JSON.stringify(life)}` : ''}`);
}
await browser.close();
fs.writeFileSync(outFile, JSON.stringify({ label, base, quality, at: new Date().toISOString(), rows }, null, 1));
