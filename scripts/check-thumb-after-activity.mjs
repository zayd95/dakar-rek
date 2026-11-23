// A thumb that is already on the stick when an activity gives the controls back must walk the player (src/ui/hud.ts, src/venues/inWorldKit.ts).
// Usage: node scripts/check-thumb-after-activity.mjs <baseUrl> [screenshot.png]
// At La Vague: pay, walk onto the floor, « Danser »; while the dance is still on, a real finger goes down where the stick is and stays there; the dance ends; without
// being lifted, the finger must walk the player to the club's way out. (It did not: the Almadies evening journey failed there in two runs out of four.)
import { chromium } from 'playwright';
import { realTouch, walkTo } from './lib/realTouch.mjs';

const base = process.argv[2] ?? 'http://127.0.0.1:4173/', T = { timeout: 300000 };
let fails = 0; const check = (n, ok, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${n}${d ? ' ' + d : ''}`); if (!ok) fails++; };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
await context.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'low'); } catch { /* */ } });
const page = await context.newPage(); page.setDefaultTimeout(300000);
const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.goto(`${base}?debug&touch&heure=21&argent=500000`, { timeout: 180000 });
await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.pos().mode === 'play', null, T);
const d = (fn, a) => page.evaluate(fn, a);
await d(() => window.__dakar.teleport('almadies'));
await page.waitForFunction(() => window.__dakar.pos().hub === 'almadies' && window.__dakar.pos().mode === 'play' && window.__dakar.venues, null, T);
await d(() => window.__dakar.setHour(21.5)); await page.waitForTimeout(2500);
const t = await realTouch(page);
const club = await d(() => { const c = window.__dakar.venues().find(v => v.type === 'club'); return { door: c.anchors.find(a => /door$/.test(a.id)), floor: c.anchors.find(a => /floor$/.test(a.id)), exit: c.anchors.find(a => /exit$/.test(a.id)) }; });
await d(() => window.__dakar.clubShift?.(0));
await d(([x, z]) => window.__dakar.place(x, z + 1.6, Math.PI), [club.door.x, club.door.z]); await page.waitForTimeout(1200);
await walkTo(page, t, club.door.x, club.door.z, { tol: 1.2, ms: 60000 });
const act = async (id, ms = 25000) => { await page.waitForTimeout(500); const ok = await page.waitForFunction(i => window.__dakar.focus()?.id === i, id, { timeout: ms }).then(() => true, () => false); if (ok) { await t.tap('#act'); await page.waitForTimeout(900); } return ok; };
check('at the club\'s door: « Entrer »', await act(`almadies:venue:club:${club.door.id}`));
await page.waitForTimeout(1500);
const row = await d(() => { const e = [...document.querySelectorAll('#modal.on .item')].find(x => /et entrer/.test(x.textContent)); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });
if (row) { await t.down(5, row.x, row.y); await page.waitForTimeout(60); await t.up(5); }
const admitted = await page.waitForFunction(() => window.__dakar.venues().find(v => v.type === 'club').admitted && !window.__dakar.activity(), null, { timeout: 60000 }).then(() => true, () => false);
check('the fee is paid, the rope is lifted', admitted);
await walkTo(page, t, club.floor.x, club.floor.z, { tol: 1.2, ms: 120000 });
check('on the floor: « Danser »', await act(`almadies:venue:club:${club.floor.id}`));
await page.waitForFunction(() => !!window.__dakar.gesture() && /^Dance_/.test(window.__dakar.clip() ?? ''), null, { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(3000);
const st = () => d(() => { const k = window.__dakar, p = k.pos(); return { x: +p.x.toFixed(2), z: +p.z.toFixed(2), mode: p.mode }; });
const busy = await st();
check('the thumb goes down where the stick is while the dance is still on', busy.mode === 'busy', JSON.stringify(busy));
await d(() => { window.__moves = 0; addEventListener('pointermove', () => { window.__moves++; }, true); });
// the dance is ended (the debug finish, once per performance) while the finger stays where it is
setTimeout(async () => { for (let n = 0; n < 8; n++) { await d(() => window.__dakar.gestureFinish(0.3)); await page.waitForTimeout(900); if ((await d(() => window.__dakar.pos().mode)) === 'play') break; } }, 2500);
const left = await walkTo(page, t, club.exit.x, club.exit.z, { tol: 1.0, ms: 45000 });
const end = await st(), moves = await d(() => window.__moves);
check('never lifted, the thumb walks the player from the floor to the way out once the dance is over', left < 1 && end.mode === 'play', `${left.toFixed(2)} m left, ${moves} moves reached the page, at ${JSON.stringify(end)}`);
check('no JavaScript errors', errors.length === 0, JSON.stringify(errors.slice(0, 3)));
await page.screenshot({ path: process.argv[3] ?? '/tmp/thumb-after-activity.png' });
await browser.close();
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
