// iPhone-sized (390 × 844 @2×) shots of every sign worth checking, each from three distances: the player stands in front of the sign and
// the follow camera rides 10.5 m behind him, so the sign is seen from his distance + 10.5 m (the way the game is played).
// Usage: node scripts/capture-pikine-signs.mjs <baseUrl> <outDir> <signs.json from check-pikine-signs.mjs> [distances=2,8,14] [hour=11] [only=substring,...]
import { chromium } from 'playwright';
import fs from 'node:fs';

const [base, out, signsFile] = process.argv.slice(2, 5);
const dists = (process.argv[5] ?? '2,8,14').split(',').map(Number), hour = Number(process.argv[6] ?? 11), only = (process.argv[7] ?? '').split(',').filter(Boolean);
const data = JSON.parse(fs.readFileSync(signsFile, 'utf8'));
const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 28);
// targets: the builder's boards by their text, the Street DNA's boards by their role and name (the same positions in every build of this seed)
const names = Object.fromEntries((data.dna?.names ?? []).map(n => [n.id, n.name]));
let targets = [
  ...data.hubs.pikine.map(p => ({ name: p.text, x: p.x, y: p.y, z: p.z, yaw: p.yaw })),
  ...(data.dna?.uses ?? []).map(u => ({ name: `${u.role} ${names[u.id] ?? u.id}`, x: u.x, y: u.y, z: u.z, yaw: u.yaw })),
];
if (only.length) targets = targets.filter(t => only.some(o => t.name.toLowerCase().includes(o.toLowerCase())));
const seen = new Set(); targets = targets.filter(t => { const k = slug(t.name) + Math.round(t.x) + Math.round(t.z); if (seen.has(k)) return false; seen.add(k); return true; });
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
await ctx.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'medium'); localStorage.setItem('dakarrek.guest.save.v6', ''); } catch { /* */ } });
const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.goto(`${base}?debug&touch`);
await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub, null, { timeout: 240000 });
await page.evaluate(() => window.__dakar.teleport('pikine'));
await page.waitForFunction(() => window.__dakar.pos().hub === 'pikine', null, { timeout: 240000 });
await page.evaluate(h => window.__dakar.setHour(h), hour); await page.waitForTimeout(1500);
const index = [];
for (const [i, t] of targets.entries()) {
  for (const d of dists) {
    const px = t.x + Math.sin(t.yaw) * d, pz = t.z + Math.cos(t.yaw) * d, yaw = t.yaw + Math.PI;
    await page.evaluate(([x, z, y]) => window.__dakar.place(x, z, y), [px, pz, yaw]);
    await page.waitForTimeout(1500);
    const file = `${String(i).padStart(2, '0')}-${slug(t.name)}-d${d}.png`;
    await page.screenshot({ path: `${out}/${file}` });
    index.push({ file, name: t.name, d, x: t.x, y: t.y, z: t.z, yaw: t.yaw });
  }
}
fs.writeFileSync(`${out}/index.json`, JSON.stringify(index, null, 1));
console.log(errors.length ? `page errors: ${errors.slice(0, 3).join(' | ')}` : 'no page errors', `· ${index.length} shots in ${out}`);
await browser.close();
