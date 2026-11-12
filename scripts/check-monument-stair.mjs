// The Monument de la Renaissance on its hill (src/world/builder.ts, case 'monument'): is the long stair climbed on foot to the summit, and is the hill closed everywhere else?
// Usage: node scripts/check-monument-stair.mjs <baseUrl> [outDir=/tmp/monument-stair]
// A phone-sized touch page; the player walks with a real finger on the stick (scripts/lib/realTouch.mjs).
import fs from 'node:fs';
import { chromium } from 'playwright';
import { realTouch, walkTo } from './lib/realTouch.mjs';

const [base = 'http://127.0.0.1:4173/', out = '/tmp/monument-stair'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const T = { timeout: 300000 };
let fails = 0; const check = (n, ok, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${n}${d ? ' ' + d : ''}`); if (!ok) fails++; };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
await context.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'low'); } catch { /* */ } });
const page = await context.newPage(); page.setDefaultTimeout(300000);
const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.goto(`${base}?debug&touch&heure=16&meteo=soleil`, { timeout: 180000 });
await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.pos().mode === 'play', null, T);
await page.evaluate(() => window.__dakar.teleport('corniche'));
await page.waitForFunction(() => window.__dakar.pos().hub === 'corniche' && window.__dakar.pos().mode === 'play', null, T);
const t = await realTouch(page);
const pos = () => page.evaluate(() => window.__dakar.pos());
const m = await page.evaluate(() => { const w = window.__dakar.world?.() ?? null; return w?.monument ?? window.__dakar.monument?.() ?? null; });
// (the stair's run, from the hub when a debug hook gives it, else as built: block « 1,0 », centre x −30, z −90)
const S = m ? { x0: m.stairX0, x1: m.stairX1, z: m.stairZ, y1: m.y1 } : { x0: -52.6, x1: -29.5, z: -90, y1: 17.19 };
console.log('stair', JSON.stringify(S), m ? '(from the hub)' : '(as built)');

await page.evaluate(([x, z]) => window.__dakar.place(x, z, Math.PI / 2), [S.x0 - 3, S.z]); await page.waitForTimeout(800);
const foot = await pos();
check('at the foot of the stair the player stands on the ground', foot.y < 0.6, `y ${foot.y.toFixed(2)}`);
await page.screenshot({ path: `${out}/01-foot.png` });
let d = await walkTo(page, t, (S.x0 + S.x1) / 2, S.z, { tol: 1.0, ms: 240000 });
const mid = await pos();
check('half way up, the player is half way up', d < 1.0 && Math.abs(mid.y - S.y1 / 2) < 1.6, `${d.toFixed(2)} m left, y ${mid.y.toFixed(2)} of ${S.y1.toFixed(1)}`);
await page.screenshot({ path: `${out}/02-half-way.png` });
d = await walkTo(page, t, S.x1 + 0.9, S.z, { tol: 0.8, ms: 240000 });
const top = await pos();
check('the stair is climbed to the summit terrace', d < 0.8 && top.y > S.y1 - 0.6, `${d.toFixed(2)} m left, y ${top.y.toFixed(2)}`);
await page.screenshot({ path: `${out}/03-summit.png` });
await walkTo(page, t, S.x1 + 12, S.z, { tol: 0.5, ms: 30000 });
const rock = await pos();
check('the group stops the walker at the far side of its terrace (3.6 m deep)', rock.x < S.x1 + 4.2 && rock.x > S.x1 + 1.5, `x ${rock.x.toFixed(2)}`);
await walkTo(page, t, S.x1 - 4, S.z + 12, { tol: 0.5, ms: 30000 });
const side = await pos();
check('and the parapet keeps them on the stair', Math.abs(side.z - S.z) < 4.6, `z ${side.z.toFixed(2)}`);
d = await walkTo(page, t, S.x0 - 3, S.z, { tol: 1.0, ms: 240000 });
const down = await pos();
check('and back down to the street', d < 1.0 && down.y < 0.6, `${d.toFixed(2)} m left, y ${down.y.toFixed(2)}`);
// the hill itself is not walked through from the street
await page.evaluate(([x, z]) => window.__dakar.place(x, z, Math.PI / 2), [S.x0 - 3, S.z + 12]); await page.waitForTimeout(500);
await walkTo(page, t, S.x0 + 12, S.z + 12, { tol: 0.5, ms: 30000 });
const flank = await pos();
check('the hill\'s flank is closed beside the stair', flank.x < S.x0 + 2.5 && flank.y < 0.6, `x ${flank.x.toFixed(2)} y ${flank.y.toFixed(2)}`);
const group = await page.evaluate(() => { let m = null; window.__dakar.three.scene.traverse(o => { if (o.name === 'landmark_monument_group') m = o; }); return m ? { tris: m.geometry.index.count / 3, y: +m.position.y.toFixed(1), map: !!m.material.map } : null; });
check('the statue group\'s model is in the scene, textured', !!group && group.tris > 5000 && group.map, JSON.stringify(group));
check('no JavaScript errors', errors.length === 0, JSON.stringify(errors.slice(0, 3)));
await browser.close();
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
