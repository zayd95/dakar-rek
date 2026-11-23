// The Corniche's round esplanade (src/world/cornicheEsplanade.ts): is it reached on foot from the street, and does the shore still stop the walker everywhere else?
// Usage: node scripts/check-corniche-esplanade.mjs <baseUrl> [outDir=/tmp/corniche-esplanade]
// A phone-sized touch page; the player walks with a real finger on the stick (scripts/lib/realTouch.mjs): from the end of the street at z = −60 across the promenade, through the
// opening in the railing and the sea wall, over the painted terraces onto the disc; then against the headland's seaward edge, its sides, and the water's edge of the fish beach.
import fs from 'node:fs';
import { chromium } from 'playwright';
import { realTouch, walkTo } from './lib/realTouch.mjs';

const [base = 'http://127.0.0.1:4173/', out = '/tmp/corniche-esplanade'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const T = { timeout: 300000 };
let fails = 0; const check = (n, ok, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${n}${d ? ' ' + d : ''}`); if (!ok) fails++; };
const E = { x: -160, z: -60, r: 15, x0: -176, shore: -155, z0: -78, z1: -42 };       // src/world/cornicheEsplanade.ts ESPLANADE

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
await context.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'low'); } catch { /* */ } });
const page = await context.newPage(); page.setDefaultTimeout(300000);
const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.goto(`${base}?debug&touch&heure=17`, { timeout: 180000 });
await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.pos().mode === 'play', null, T);
await page.evaluate(() => window.__dakar.teleport('corniche'));
await page.waitForFunction(() => window.__dakar.pos().hub === 'corniche' && window.__dakar.pos().mode === 'play', null, T);
const t = await realTouch(page);
const pos = () => page.evaluate(() => window.__dakar.pos());
const place = (x, z, yaw = 0) => page.evaluate(([x, z, yaw]) => window.__dakar.place(x, z, yaw), [x, z, yaw]);
const geo = await page.evaluate(() => { const g = window.__dakar.cityGeometry(); return { bounds: g.bounds, colliders: g.colliders.length, people: g.people.length }; });
check('the district reaches out to the headland', geo.bounds.x0 <= E.x0 - 0.5, JSON.stringify(geo));

// from the street's end, on the sea-side pavement, to the middle of the disc
await place(-128.2, -60, -Math.PI / 2); await page.waitForTimeout(800);
let d = await walkTo(page, t, -134.8, -60, { tol: 0.8, ms: 120000 });
check('across the promenade and through the opening in the railing and the sea wall', d < 0.8, `${d.toFixed(2)} m left, at ${JSON.stringify(await pos()).slice(0, 60)}`);
d = await walkTo(page, t, E.x, E.z, { tol: 1.0, ms: 180000 });
const mid = await pos();
check('over the painted terraces onto the middle of the round esplanade', d < 1.0, `${d.toFixed(2)} m left, at x ${mid.x.toFixed(1)} z ${mid.z.toFixed(1)}`);
await page.screenshot({ path: `${out}/01-on-the-esplanade.png` });

// the headland's edges hold
await walkTo(page, t, E.x0 - 8, E.z, { tol: 0.5, ms: 60000 });
let p = await pos();
check('the seaward edge stops the walker at the rocks', p.x > E.x0 - 0.7 && p.x < E.x0 + 1.5, `x ${p.x.toFixed(2)}`);
await page.screenshot({ path: `${out}/02-seaward-edge.png` });
await walkTo(page, t, E.x0 + 6, E.z0 - 8, { tol: 0.5, ms: 60000 });
p = await pos();
check('and so does its north side', p.z > E.z0 - 0.7, `z ${p.z.toFixed(2)}`);
await walkTo(page, t, E.x0 + 6, E.z1 + 8, { tol: 0.5, ms: 90000 });
p = await pos();
check('and its south side', p.z < E.z1 + 0.7, `z ${p.z.toFixed(2)}`);

// the grass between the railing and the sea wall is not a way along the shore
await place(-134.8, -60, 0); await page.waitForTimeout(500);
await walkTo(page, t, -134.8, -40, { tol: 0.5, ms: 30000 });
p = await pos();
check('the strip of grass behind the railing is closed either side of the way down', p.z < -53.2, `z ${p.z.toFixed(2)}`);

// the fish beach of Soumbédioune: the water's edge is where it was
await place(-150, 90, -Math.PI / 2); await page.waitForTimeout(500);
await walkTo(page, t, -170, 90, { tol: 0.5, ms: 40000 });
p = await pos();
check('on the fish beach the walker still stops at the water\'s edge', p.x > E.shore - 0.9, `x ${p.x.toFixed(2)}`);
// back the way they came
await place(E.x + 6, E.z, Math.PI / 2); await page.waitForTimeout(500);
d = await walkTo(page, t, -128.2, -60, { tol: 1.0, ms: 180000 });
check('and from the esplanade back up to the pavement', d < 1.0, `${d.toFixed(2)} m left`);
check('no JavaScript errors', errors.length === 0, JSON.stringify(errors.slice(0, 3)));
await browser.close();
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
