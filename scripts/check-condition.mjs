// Pass 3 S1/S2 on a phone with real fingers: a car the player owns is worn by a hard hit (once per contact, saved), shows its health on the card, a car at 0 % does not run (it stalls, will not
// start, cannot move), the roadside fix is physical (at the bonnet, a timed activity, nothing instant) and lifts it to « enough to crawl » (15 %, slow), and all of it survives a reload.
// Usage: node scripts/check-condition.mjs [baseUrl] [outDir]   (a running build)
import { chromium } from 'playwright';
import fs from 'node:fs';
import { realTouch, walkTo, padDrive } from './lib/realTouch.mjs';

const base = process.argv[2] ?? 'http://localhost:4214/', out = process.argv[3] ?? 'docs/screenshots/condition';
fs.mkdirSync(out, { recursive: true });
const T = { timeout: 240000 }, results = []; let failed = 0;
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${detail}`); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const page = await context.newPage(); page.setDefaultTimeout(240000);
const errors = []; page.on('pageerror', e => errors.push(e.message));
const d = (fn, arg) => page.evaluate(fn, arg);
const tr = await realTouch(page);
const at = () => d(() => window.__dakar.car.at()), hp = () => d(() => window.__dakar.car.health()), card = () => d(() => window.__dakar.car.card()), au = () => d(() => window.__dakar.car.audio());
const wait = (fn, arg, ms = 120000) => page.waitForFunction(fn, arg, { timeout: ms });
const simWait = async s => { const t0 = (await at()).t; await page.waitForFunction(([a, s]) => window.__dakar.car.at().t >= a + s, [t0, s], { timeout: 240000 }).catch(() => {}); };
const quickItem = async text => {                                   // « ⋯ » then the item whose label holds `text`
  await d(() => { if (document.querySelector('#modal.on')) document.querySelector('#modal .sh-x')?.click(); }); await page.waitForTimeout(300);
  const dbg = await d(() => ({ focus: window.__dakar.focus()?.id, more: document.querySelector('#actMore')?.className, mode: window.__dakar.pos().mode }));
  if (dbg.more === 'off') return null;                                // no « ⋯ »: nothing besides the main action is offered
  await tr.tap('#actMore'); await page.waitForTimeout(600);
  const sel = await d(tx => { const els = [...document.querySelectorAll('#modal .item')]; const i = els.findIndex(e => e.textContent.includes(tx)); return i < 0 ? null : { i, text: els[i].textContent, disabled: els[i].classList.contains('off') || els[i].hasAttribute('disabled') || /Place-toi|Termine/.test(els[i].textContent) }; }, text);
  return sel;
};
const tapQuick = async i => { const c = await d(i => { const r = document.querySelectorAll('#modal .item')[i].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, i); await tr.down(8, c.x, c.y); await page.waitForTimeout(60); await tr.up(8); };
const closeSheet = async () => { await d(() => window.__dakar && document.querySelector('#modal.on') && document.querySelector('#modal .sh-x')?.click()); await page.waitForTimeout(300); };

async function boot(reload = false) {
  if (reload) { await d(() => window.__dakar.save?.()); await page.waitForTimeout(1200); await page.reload(); } else await page.goto(`${base}?debug&touch&heure=11&argent=50000000`, { timeout: 120000 });
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.car, null, T);
  await page.waitForTimeout(1500);
}
async function getIn(near = false) {
  const c = await at();
  if (near) await d(c => window.__dakar.place(c.x + Math.cos(c.yaw) * 5, c.z - Math.sin(c.yaw) * 5, 0), c);      // set-up only: the player stands a few metres from the car he just bought (the test walks the rest)
  const L = { x: Math.cos(c.yaw), z: -Math.sin(c.yaw) }, F = { x: Math.sin(c.yaw), z: Math.cos(c.yaw) }, me = await d(() => window.__dakar.pos());
  const spots = [[2.0, 0.4], [-2.0, 0.4]].sort((a, b) => Math.hypot(c.x + L.x * a[0] + F.x * a[1] - me.x, c.z + L.z * a[0] + F.z * a[1] - me.z) - Math.hypot(c.x + L.x * b[0] + F.x * b[1] - me.x, c.z + L.z * b[0] + F.z * b[1] - me.z));
  for (const [side, along] of spots) {
    await walkTo(page, tr, c.x + L.x * side + F.x * along, c.z + L.z * side + F.z * along, { tol: 0.9, ms: 40000 });
    if (await page.waitForFunction(() => window.__dakar.focus()?.id === 'car:parked', null, { timeout: 6000 }).then(() => true, () => false)) break;
  }
  await tr.tap('#act');
  await wait(() => window.__dakar.car.at().driving && document.body.classList.contains('ridepad'), null, 60000).catch(async e => { console.log('GETIN', JSON.stringify(await d(() => ({ focus: window.__dakar.focus(), pos: window.__dakar.pos(), car: window.__dakar.car.at(), info: window.__dakar.car.info().here, modal: document.querySelector('#modal.on')?.textContent?.slice(0, 120) }))), 'wanted spots', JSON.stringify(spots)); throw e; });
  await page.waitForTimeout(800);
}
async function getOff() { await wait(() => Math.abs(window.__dakar.car.at().speed) < 0.3).catch(async e => { console.log('GETOFF', JSON.stringify(await at()), await hp()); throw e; }); await tr.tap('#ridepad .rp-off'); await wait(() => !window.__dakar.car.at().driving && !window.__dakar.car.info().exit && window.__dakar.pos().mode === 'play').catch(async e => { console.log('GETOFF2', JSON.stringify({ at: await at(), pos: await d(() => window.__dakar.pos()), info: await d(() => window.__dakar.car.info()), tog: await d(() => document.body.className) })); throw e; }); await page.waitForTimeout(600); }

// ---- buy it (paid through the asset model, delivered at the kerb), get in
await boot();
await d(() => window.__dakar.teleport('plateau'));
await wait(() => window.__dakar.pos().hub === 'plateau' && window.__dakar.car?.info().dealer);
await d(() => window.__dakar.car.own());
await wait(() => window.__dakar.car.info().owned && window.__dakar.car.info().here);
await page.waitForTimeout(1500);
await getIn(true);
const home = await at();                                              // open kerb where it was delivered (the wall test below drives it away)
check('a car bought is whole: 100 %, and its card says nothing about its health', (await hp()) === 100 && !/%/.test(await card()), JSON.stringify({ hp: await hp(), card: await card() }));

// ---- a hard hit wears it, once per contact
const cols = await d(() => { const all = window.__dakar.cityGeometry().colliders; return all.filter(c => c.h >= 6 && c.x1 - c.x0 > 8 && c.z1 - c.z0 > 14).filter(c => { const zc = (c.z0 + c.z1) / 2; return !all.some(o => o !== c && o.x1 > c.x0 - 11 && o.x0 < c.x0 + 0.5 && o.z1 > zc - 2.5 && o.z0 < zc + 2.5); }).slice(0, 30); });
let wall = null;
for (const c of cols) {
  await d(([x, z]) => { window.__dakar.car.place(x, z, Math.PI / 2); window.__dakar.car.feelReset(); }, [c.x0 - 7, (c.z0 + c.z1) / 2]);
  await d(() => window.__dakar.car.boost(13));
  await page.waitForFunction(() => window.__dakar.car.feel().impacts.length > 0, null, { timeout: 12000 }).catch(() => {});
  const f = await d(() => window.__dakar.car.feel()); if (f.impacts[0] && f.impacts[0].kind === 'hit' && f.impacts[0].speed >= 8) { wall = { c, im: f.impacts[0] }; break; }
}
await page.waitForTimeout(600);
const h1 = await hp();
check('a hard hit wears it, by what the rules say (a glancing blow 60 % of a head-on one)', !!wall && h1 < 100 && 100 - h1 >= 2 && 100 - h1 <= 35, JSON.stringify({ hp: h1, impact: wall?.im }));
check('its card shows the figure now (discreet: « 87 % » in the title), and the damage is saved in the asset (save v6)', /\d+ %/.test(await card()) && (await d(() => window.__dakar.car.info().asset?.condition)) === h1, JSON.stringify({ card: await card() }));
const g = await tr.centre('#ridepad .rp-gas'); await tr.down(1, g.x, g.y); await simWait(5); await tr.up(1);
const h2 = await hp();
check('pushing on against the wall costs at most one more hit (never a loss on every frame)', h1 - h2 <= 15, JSON.stringify({ before: h1, after: h2 }));
await page.screenshot({ path: `${out}/1-worn.png` });

// ---- worn below 70 %: slower and the card warns; 0 %: stalls, will not start, cannot move
await d(() => { for (let i = 0; i < 2; i++) window.__dakar.car.hurt(12); });
const h3 = await hp();
check(`under 70 % the card warns (${h3} %)`, h3 < 70 && /Abîmée|abîmée/.test(await card()), JSON.stringify({ hp: h3, card: await card() }));
await d(() => { for (let i = 0; i < 6; i++) window.__dakar.car.hurt(14); });
check('at 0 % the engine is dead: the car is at 0 %, the engine sound stopped, the card says so', (await hp()) === 0 && !(await au()).running && /panne|ne tourne plus/i.test(await card()), JSON.stringify({ hp: await hp(), running: (await au()).running, card: await card() }));
await d(() => window.__dakar.car.feelReset());
const p0 = await at(); await tr.down(1, g.x, g.y); await simWait(4); await tr.up(1);
const p1 = await at();
check('a dead car does not move under full gas', Math.hypot(p1.x - p0.x, p1.z - p0.z) < 1.2 && Math.abs(p1.speed) < 0.5, JSON.stringify({ moved: +Math.hypot(p1.x - p0.x, p1.z - p0.z).toFixed(2), speed: p1.speed }));
await page.screenshot({ path: `${out}/2-dead.png` });
await getOff();
const w0 = await d(() => window.__dakar.state.wallet);
await getIn();
check('getting back in: it will not start (no engine), nothing was charged', !(await au()).running && (await hp()) === 0 && (await d(() => window.__dakar.state.wallet)) === w0, JSON.stringify({ running: (await au()).running }));
await getOff();

// ---- the roadside fix: physical (set-up only: the dead car is put back on the open kerb; the player stands by its door)
await closeSheet();
await d(h => { window.__dakar.car.place(h.x, h.z, h.yaw); }, home);
await page.waitForTimeout(800);
await d(h => window.__dakar.place(h.x + Math.cos(h.yaw) * 2.2, h.z - Math.sin(h.yaw) * 2.2, 0), home);
await wait(() => window.__dakar.focus()?.id === 'car:parked', null, 20000).catch(() => {});
const far = await quickItem('Réparation de fortune');
check('from beside the door the roadside fix is offered but asks you to stand at the bonnet', !!far && /capot/.test(far.text), JSON.stringify(far));
await closeSheet();
const car0 = await at(), hood = { x: car0.x + Math.sin(car0.yaw) * 2.9, z: car0.z + Math.cos(car0.yaw) * 2.9 };
await walkTo(page, tr, hood.x, hood.z, { tol: 0.7, ms: 60000 });
const near = await quickItem('Réparation de fortune');
check('at the bonnet it is available and free', !!near && !/Place-toi/.test(near.text), JSON.stringify(near));
if (near) await tapQuick(near.i);
await page.waitForTimeout(1200);
const mid = await hp(), busy = await d(() => document.querySelector('#progress')?.classList.contains('on') ?? !!document.querySelector('#progress.on'));
check('it is not instant: the work takes time (progress shown), the car is still at 0 % while the player works', mid === 0, JSON.stringify({ hp: mid, progress: busy }));
await wait(() => window.__dakar.car.health() > 0, null, 180000).catch(() => {});
const h4 = await hp();
check('when the work is done the car is lifted to 15 % (enough to crawl), nothing charged', h4 === 15 && (await d(() => window.__dakar.state.wallet)) === w0, JSON.stringify({ hp: h4 }));
await page.screenshot({ path: `${out}/3-fixed.png` });
await page.waitForTimeout(800);
const again = await quickItem('Réparation de fortune');
check('and it is offered no more once the car runs (a fix, not a repair)', !again, JSON.stringify(again));
await closeSheet();

// ---- it limps
await getIn();
let peak = 0; await tr.down(1, g.x, g.y);
for (let i = 0; i < 14; i++) { await page.waitForTimeout(500); peak = Math.max(peak, Math.abs((await at()).speed)); }
await tr.up(1); const lim = { speed: peak };
const bk = await tr.centre('#ridepad .rp-brake'); await tr.down(2, bk.x, bk.y); await simWait(3); await tr.up(2);
const maxSpeed = await d(() => window.__dakar.car.info().maxSpeed ?? null);
check('at 15 % it runs, slowly (top speed about half), the engine sound is back', (await au()).running && lim.speed > 1 && lim.speed < 11, JSON.stringify({ speed: lim.speed, running: (await au()).running, maxSpeed }));
await getOff();

// ---- everything is kept across a reload
const parked0 = await at(), hpBefore = await hp();                  // (a wall may have worn it a little while it limped)
await boot(true);
const parked1 = await at();
check('after a reload the car is where it was, at the same health, still the player\'s (not duplicated)', (await hp()) === hpBefore && Math.hypot(parked1.x - parked0.x, parked1.z - parked0.z) < 0.2 && (await d(() => window.__dakar.car.info().owned)), JSON.stringify({ hp: await hp(), hpBefore, moved: +Math.hypot(parked1.x - parked0.x, parked1.z - parked0.z).toFixed(2) }));
check('no JavaScript errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await context.close(); await browser.close();
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
