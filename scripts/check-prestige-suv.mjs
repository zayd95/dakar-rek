// Journey B of the vehicles economy (docs/vehicles/ECONOMY.md): Prestige Auto (Almadies), a young player with 1 200 000 F and the red Lamane Sport (70 000 000 F, the flagship SUV).
// REAL touches from the pavement on: the salesperson greets once; the player walks round the red SUV on the floor (looked at from several sides); « Essayer cette voiture »: he walks
// to it, unlocks it, hands over the keys; « Ouvrir »: the door, the seat, the engine; the SAME car is driven out and round the block; parked on the forecourt; « Descendre »; he comes
// over; « Acheter »: the price and the wallet, « Confirmer l'achat » refused (not enough money), nothing paid; the player walks away down the street; the trial car goes back to its
// bay out of sight; coming back, it is there, the same red car, one copy, nothing owned, nothing saved, the wallet untouched.
// Usage: node scripts/check-prestige-suv.mjs <baseUrl> <outDir>
import { chromium } from 'playwright';
import { realTouch, walkTo, pilot } from './lib/realTouch.mjs';
import fs from 'node:fs';

const [base = 'http://127.0.0.1:4422/', out = '/tmp/claude-0/veh/journey-b'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const T = { timeout: 300000 };
let failed = 0, total = 0;
const check = (name, ok, detail = '') => { total++; if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${detail}`); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
await context.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'medium'); } catch { /* */ } });
const page = await context.newPage(); page.setDefaultTimeout(300000);
const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.goto(`${base}?debug&touch`, { timeout: 180000 });
await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub, null, T);
const t = await realTouch(page);
const d = (fn, arg) => page.evaluate(fn, arg);
let shotN = 0; const shot = async name => { await page.waitForTimeout(500); await page.screenshot({ path: `${out}/${String(++shotN).padStart(2, '0')}-${name}.png` }); };
const V = () => d(() => window.__dakar.suv.info()), S = () => d(() => window.__dakar.sales.info()), AT = () => d(() => window.__dakar.suv.at());
const wait = (fn, arg, ms = 240000) => page.waitForFunction(fn, arg, { timeout: ms });
const tapItem = async text => { const sel = await d(tx => { const i = [...document.querySelectorAll('#modal .item')].findIndex(e => e.textContent.includes(tx)); return i; }, text); if (sel < 0) return false; const c = await d(i => { const r = document.querySelectorAll('#modal .item')[i].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel); await t.down(8, c.x, c.y); await page.waitForTimeout(70); await t.up(8); return true; };
const count = () => d(() => { const names = []; window.__dakar.three.scene.traverse(o => { if (o.isGroup && /^suv:(floor:\d|mine)$/.test(o.name)) names.push(o.name); }); return names; });

// ---- 0. on the pavement outside Prestige Auto at noon, 1 200 000 F in the pocket
await d(() => { window.__dakar.teleport('almadies', -100.5, 4.6, 0); window.__dakar.setHour(11); });
await wait(() => window.__dakar.pos().hub === 'almadies' && window.__dakar.sales?.info().here && window.__dakar.suv?.info().floor.length >= 2);
await d(() => { window.__dakar.state.data.wallet = 1200000; });
await page.waitForTimeout(1500);
const v0 = await V(), red = v0.floor.find(c => c.colour === 'rouge');
check('the red Lamane Sport is on the floor, in its bay, at its price (70 000 000 F)', !!red && red.here && red.state === 'display' && v0.price === 70000000, JSON.stringify({ floor: v0.floor.map(c => [c.slot, c.colour, c.here]), price: v0.price }));
const wallet0 = await d(() => window.__dakar.state.wallet), led0 = await d(() => window.__dakar.state.data.ledger.length), names0 = await count();
// ---- 1. in by the doorway; greeted once
await walkTo(page, t, -101.2, 15.5, { tol: 0.6 });
await walkTo(page, t, -99.5, 20.5, { tol: 0.7 });
await wait(() => window.__dakar.sales.info().log.greetings >= 1).catch(() => {});
check('the salesperson walks over and greets once', (await S()).log.greetings === 1, JSON.stringify((await S()).log.said));
await shot('greeting');
// ---- 2. round the red SUV, looking at it (the player walks; the camera looks from each side)
const F = { x: Math.sin(red.yaw ?? 0), z: Math.cos(red.yaw ?? 0) };
for (const [k, [lat, along]] of [['front', [1.8, 3.6]], ['side', [3.4, 0]], ['rear', [1.6, -3.8]]]) {
  const L = { x: F.z, z: -F.x }, px = red.x + L.x * lat + F.x * along, pz = red.z + L.z * lat + F.z * along;
  await walkTo(page, t, px, pz, { tol: 0.8, ms: 60000 });
  await d(([x, z, cx, cz]) => { window.__dakar.place(x, z, Math.atan2(cx - x, cz - z)); window.__dakar.lookYaw?.(Math.atan2(cx - x, cz - z)); }, [px, pz, red.x, red.z]);
  await page.waitForTimeout(700); await shot(`inspect-${k}`);
}
// ---- 3. « Essayer cette voiture »
await walkTo(page, t, red.step.x, red.step.z + 0.2, { tol: 0.6, ms: 60000 });
await wait(i => window.__dakar.focus()?.id === `suv:floor:${i}`, red.slot, 60000).catch(() => {});
const f1 = await d(() => window.__dakar.focus());
check('the car itself offers the free trial and the purchase', f1?.primary === 'Essayer cette voiture' && f1.all.some(a => /^Acheter/.test(a)), JSON.stringify(f1));
await t.tap('#act');
await wait(() => /clés/.test(document.querySelector('#modal.on')?.textContent ?? ''));
const fl = (await V()).floor.find(c => c.slot === red.slot);
check('he walked to that car, unlocked it and offered the keys', fl.state === 'unlocked', JSON.stringify(fl.state));
await shot('keys');
await tapItem('Prendre les clés');
await wait(() => window.__dakar.sales.info().keys && window.__dakar.pos().mode === 'play', null, 60000);
await walkTo(page, t, red.step.x, red.step.z, { tol: 0.4 });
await wait(() => /Ouvrir/.test(window.__dakar.focus()?.primary ?? ''), null, 60000);
const n1 = await count();
await t.tap('#act');
await wait(() => window.__dakar.suv.info().driving, null, 120000);
const tr = await V(), n2 = await count(), a0 = await AT();
check('the car under the player is the very red car on the floor: one vehicle, no copy; a free trial (nothing paid, nothing owned)', tr.trial && !tr.owned && Math.hypot(a0.x - red.x, a0.z - red.z) < 0.8 && n2.length === n1.length && (await d(() => window.__dakar.state.wallet)) === wallet0, JSON.stringify({ n1, n2, at: [a0.x, a0.z] }));
await shot('at-the-wheel');
// ---- 4. out and round the block
const LAP = [
  { x: -88.3, z: 12, tol: 3 }, { x: -87, z: 6, tol: 2.2, speed: 4 }, { x: -80, z: 1.2, tol: 3, speed: 5 }, { x: -70, z: 1.2, tol: 3 }, { x: -64.5, z: 2.6, tol: 2.5, speed: 4 }, { x: -61.2, z: 7, tol: 2.5, speed: 4 }, { x: -60.4, z: 16, tol: 3 }, { x: -60.4, z: 30, tol: 4 }, { x: -60.4, z: 44, tol: 4 },
  { x: -61.4, z: 52.5, tol: 2.5, speed: 3 }, { x: -65, z: 58.8, tol: 2.5, speed: 3 }, { x: -72, z: 60, tol: 3, speed: 4 }, { x: -92, z: 60, tol: 4 }, { x: -108, z: 60, tol: 4 },
  { x: -114.8, z: 59.2, tol: 2.5, speed: 3 }, { x: -119.2, z: 55.6, tol: 2.5, speed: 3 }, { x: -120, z: 46, tol: 3.5 }, { x: -120, z: 24, tol: 4 },
  { x: -120, z: 16, tol: 3 }, { x: -120, z: 9.5, tol: 2, speed: 2.5 }, { x: -118.2, z: 4.6, tol: 2, speed: 2.5 }, { x: -113.5, z: 1.4, tol: 2.5, speed: 3 }, { x: -106, z: 1, tol: 3 }, { x: -98, z: 1.4, tol: 3 }, { x: -94, z: 3.8, tol: 2.5, speed: 3 }, { x: -91, z: 9, tol: 2.5, speed: 4 },
];
await pilot(page, t, 'suv', [{ x: red.x, z: 12, tol: 2.5, speed: 2.5 }, ...LAP.slice(1, 6)]);
await shot('out-on-the-road');
await pilot(page, t, 'suv', LAP.slice(6, 19));
await shot('round-the-block');
await pilot(page, t, 'suv', LAP.slice(19));
await pilot(page, t, 'suv', [{ x: -95, z: 11, tol: 1.6, speed: 2 }], { brakeAtEnd: true });
const parked = await AT();
check('driven out and round the block, back on the forecourt', parked.z > 8 && parked.z < 16.5 && parked.x > -112 && parked.x < -68, JSON.stringify(parked));
await t.tap('#ridepad .rp-off');
await wait(() => { const v = window.__dakar.suv.info(); return !v.driving && !v.exit && window.__dakar.pos().mode === 'play'; }, null, 60000);
await wait(() => window.__dakar.sales.info().task === 'meet', null, 120000).catch(() => {});
await wait(() => { const s = window.__dakar.sales.info(); return s.task === 'meet' && !s.moving; }, null, 240000).catch(() => {});
const meet = await S();
await walkTo(page, t, meet.x - 0.2, meet.z - 0.3, { tol: 1.55 });
await wait(() => window.__dakar.focus()?.id === 'prestige:sales', null, 60000);
await t.tap('#act');
await wait(() => /Acheter/.test(document.querySelector('#modal.on')?.textContent ?? ''), null, 60000);
await shot('talk');
await tapItem('Acheter');
await wait(() => /Confirmer l/.test(document.querySelector('#modal.on')?.textContent ?? ''), null, 60000);
const conf = await d(() => { const m = document.querySelector('#modal.on'); const b = [...m.querySelectorAll('.item')].find(e => /Confirmer l/.test(e.textContent)); return { text: m.textContent, disabled: b?.classList.contains('dis') || b?.getAttribute('aria-disabled') === 'true' || b?.disabled }; });
await shot('cannot-afford');
check('« Acheter »: the price and the wallet shown; « Confirmer l’achat » refused: not enough money', conf.disabled && /70\s?000\s?000/.test(conf.text.replace(/ | /g, ' ')) && /Pas assez/.test(conf.text), conf.text.slice(0, 200));
const tapped = await tapItem('Confirmer l');
await page.waitForTimeout(800);
check('tapping it anyway does nothing: nothing paid, nothing owned', (await d(() => window.__dakar.state.wallet)) === wallet0 && !(await V()).owned, JSON.stringify({ tapped }));
await d(() => { const m = document.querySelector('#modal.on'); if (m) { const b = [...m.querySelectorAll('.item')].find(e => /Pas maintenant|Fermer|Retour/.test(e.textContent)) ?? m.querySelector('.close'); b?.click(); } });
await wait(() => !document.querySelector('#modal.on') && window.__dakar.pos().mode === 'play', null, 20000).catch(() => {});
// ---- 5. walking away; the car goes back to its bay out of sight
await walkTo(page, t, -101.2, 15.5, { tol: 1.2 });
await walkTo(page, t, -100.5, 2.5, { tol: 1.5 });
await walkTo(page, t, -60.5, 2.5, { tol: 2, ms: 120000 });
await d(() => window.__dakar.lookYaw?.(Math.PI / 2));
await wait(i => { const v = window.__dakar.suv.info(); return !v.trial && v.floor.find(c => c.slot === i)?.here; }, red.slot, 240000).catch(() => {});
const back = await V();
check('the player walked away: the trial car went back to its bay (out of sight), the same red car', !back.trial && !back.here && back.floor.find(c => c.slot === red.slot)?.here && back.floor.find(c => c.slot === red.slot)?.colour === 'rouge', JSON.stringify({ trial: back.trial, here: back.here, floor: back.floor.map(c => [c.slot, c.colour, c.here, c.state]) }));
await walkTo(page, t, -100.5, 2.5, { tol: 1.5, ms: 120000 });
await walkTo(page, t, -101.2, 15.5, { tol: 1.2 });
await shot('back-in-the-hall');
const names1 = await count(), w1 = await d(() => window.__dakar.state.wallet), led1 = await d(() => window.__dakar.state.data.ledger.length);
check('nothing bought, nothing saved, nothing duplicated: the wallet and the ledger unchanged, the same SUVs on the floor', w1 === wallet0 && led1 === led0 && !back.owned && !back.record && JSON.stringify(names1.sort()) === JSON.stringify(names0.sort()), JSON.stringify({ names0, names1, w1, led1 }));
check('no JavaScript error', errors.length === 0, errors.slice(0, 2).join(' | '));
await browser.close();
console.log(`${total - failed}/${total} passed`);
process.exit(failed ? 1 : 0);
