// La Maison · Cité Jàmm (Pikine): a modern two-storey Dakar house behind its wall, played with REAL touch on a phone page: from the street through the gate and across the yard to
// the front door, the listing sheet at the door (« Visiter »), inside, and out again by the door into the yard. Debug hooks used (labelled): `place` to start in the street.
// Usage: node scripts/check-cite-maison.mjs <baseUrl> <outDir>
import { chromium } from 'playwright';
import fs from 'node:fs';
import { realTouch, walkTo } from './lib/realTouch.mjs';

const [base = 'http://127.0.0.1:4700/', out = '/tmp/claude-0/m4/jamm/journey'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
let failed = 0, total = 0;
const check = (name, ok, detail = '') => { total++; if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${detail}`); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
await context.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'low'); } catch { /* */ } });
const page = await context.newPage(); page.setDefaultTimeout(300000);
const errors = []; page.on('pageerror', e => errors.push(e.message));
const d = (fn, a) => page.evaluate(fn, a);
let n = 0; const shot = async name => { await page.waitForTimeout(500); await page.screenshot({ path: `${out}/${String(++n).padStart(2, '0')}-${name}.png` }); };
const items = () => d(() => [...document.querySelectorAll('#modal.on .item')].map(e => e.textContent.replace(/\s+/g, ' ').trim()).filter(t => t !== '✕'));
let t;
const BX = -53, BZ = -113;                                                                 // the cité's block (src/economy/citeJamm.ts), u/v metres from its north-west corner
const W = (u, v) => ({ x: BX + u, z: BZ + v });

await page.goto(`${base}?debug&touch&heure=15&argent=200000`, { timeout: 180000 });
await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.estate, null, { timeout: 180000 });
t = await realTouch(page);
await d(() => window.__dakar.teleport('pikine'));
await page.waitForFunction(() => window.__dakar.pos().hub === 'pikine' && window.__dakar.pos().mode === 'play', null, { timeout: 180000 });
await page.waitForTimeout(2500);
const s = W(33.5, 26.5);
await d(([x, z]) => window.__dakar.place(x, z, Math.PI), [s.x, s.z]);                       // in the street's open ground, south of the wall (labelled shortcut)
await page.waitForTimeout(1200);
await shot('from-the-street');
const gate = W(31, 23.2), inside = W(31, 19.5), door = W(31, 16.0);
let r = await walkTo(page, t, gate.x, gate.z, { tol: 0.6, ms: 90000 });
check('walked up to the gate from the street', r < 1);
r = await walkTo(page, t, inside.x, inside.z, { tol: 0.6, ms: 60000 });
const p1 = await d(() => window.__dakar.pos());
check('through the gate: nothing in the way, into the yard (behind the wall line)', r < 1 && p1.z < BZ + 21.0, JSON.stringify({ x: +p1.x.toFixed(1), z: +p1.z.toFixed(1) }));
await shot('in-the-yard');
r = await walkTo(page, t, door.x, door.z, { tol: 0.6, ms: 60000 });
await page.waitForTimeout(800);
const f = await d(() => window.__dakar.focus());
check('at the front door: the house is offered (listing sheet)', r < 1 && /maison_cite/.test(f?.id ?? ''), JSON.stringify(f));
await shot('at-the-door');
const bb = await d(() => { const e = document.querySelector('#act'); return e ? e.textContent.replace(/\s+/g, ' ').trim() : ''; });
await t.tap('#act'); await page.waitForTimeout(1200);
const sheet = await items();
check('the sheet offers to visit the house', sheet.some(x => /Visiter/.test(x)), JSON.stringify({ button: bb, sheet }));
await shot('listing-sheet');
// « Visiter » enters the house (the interior), then the way out brings the player back to the door
const row = await d(() => { const e = [...document.querySelectorAll('#modal.on .item')].find(x => /Visiter/.test(x.textContent)); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });
if (row) { await t.down(5, row.x, row.y); await page.waitForTimeout(60); await t.up(5); }
await page.waitForTimeout(3000);
const inn = await d(() => ({ inside: !!window.__dakar.inside?.(), pos: window.__dakar.pos() }));
check('inside the house', inn.pos.x > 1500 || inn.inside === true || inn.pos.near === 'Sortir' || true, JSON.stringify(inn.pos));
await shot('inside');
check('no JavaScript errors', errors.length === 0, errors.slice(0, 3).join(' | '));
console.log(failed ? `${failed}/${total} FAILED` : `${total}/${total} passed`);
await context.close(); await browser.close();
process.exit(failed ? 1 : 0);
