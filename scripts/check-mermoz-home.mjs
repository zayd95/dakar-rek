// The F3 of the Résidence Les Filaos (docs/kits/HOMES.md, « The first listing »), on a phone-sized page with real touch: walk up to the listing board by the gate in Mermoz, look at the home,
// visit it empty, rent it (a day's rent), move in, enter it from the board, see its rooms, leave by its door inside the gate, reload and be a tenant still, then buy it out. Debug hooks are used
// for the money, the place to start from, the hour and to read state (labelled).
// Usage: node scripts/check-mermoz-home.mjs <baseUrl> <outDir>
import { chromium } from 'playwright';
import fs from 'node:fs';
import { realTouch, walkTo } from './lib/realTouch.mjs';
const [base = 'http://127.0.0.1:4700/', out = '/tmp/claude-0/mz-home/journey'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
let failed = 0, total = 0; const T = { timeout: 300000 };
const check = (name, ok, detail = '') => { total++; if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${detail}`); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
await context.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'low'); } catch { /* */ } });
const page = await context.newPage(); page.setDefaultTimeout(300000);
const errors = []; page.on('pageerror', e => errors.push(e.message));
const d = (fn, a) => page.evaluate(fn, a);
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
let n = 0; const shot = async name => { await page.waitForTimeout(500); await page.screenshot({ path: `${out}/${String(++n).padStart(2, '0')}-${name}.png` }); };
const held = () => d(() => window.__dakar.state.data.assets.list.find(a => a.spec === 'f3_filaos') ?? null);
const wallet = () => d(() => window.__dakar.state.wallet);
const sheet = () => d(() => { const m = document.querySelector('#modal.on'); return m ? m.textContent.replace(/\s+/g, ' ').trim() : null; });
const items = () => d(() => [...document.querySelectorAll('#modal.on .item')].map(e => ({ text: e.textContent.replace(/\s+/g, ' ').trim(), off: e.classList.contains('dis') })).filter(i => i.text !== '✕'));
let t;
async function tapItem(re) {
  const rowAt = () => d(r => { const e = [...document.querySelectorAll('#modal.on .item')].find(x => new RegExp(r).test(x.textContent.replace(/\s+/g, ' ').trim())); if (!e) return null; e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }, re);
  const before = await sheet();
  for (let k = 0; k < 2; k++) {
    let box = await rowAt();
    for (let j = 0; j < 10 && box; j++) { await page.waitForTimeout(120); const again = await rowAt(); if (again && Math.abs(again.x - box.x) < 0.5 && Math.abs(again.y - box.y) < 0.5) break; box = again; }
    if (!box) { if (k) return; throw new Error(`no sheet row matches /${re}/: ${JSON.stringify(await items())}`); }
    await t.down(5, box.x, box.y); await page.waitForTimeout(60); await t.up(5); await page.waitForTimeout(700);
    if ((await sheet()) !== before) return;
  }
}
const until = (fn, a, ms = 120000) => page.waitForFunction(fn, a, { timeout: ms }).then(() => true, () => false);
const BOARD = { x: 66.2, z: -36.5 };

log('boot');
await page.goto(`${base}?debug&touch&heure=15&argent=100000000`, { timeout: 180000 });
await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.pos().mode === 'play', null, T);
t = await realTouch(page);
await d(() => window.__dakar.teleport('mermoz'));
await page.waitForFunction(() => window.__dakar.pos().hub === 'mermoz' && window.__dakar.pos().mode === 'play', null, T);
await page.waitForTimeout(2500);
await d(([x, z]) => window.__dakar.place(x, z, Math.PI / 2), [BOARD.x - 6, BOARD.z + 3]);     // the pavement a few steps from the board (labelled shortcut)
await page.waitForTimeout(1500);
check('nothing of the Résidence is held yet', (await held()) === null);

// 1. walk up to the board
await walkTo(page, t, BOARD.x, BOARD.z + 0.8, { tol: 0.9, ms: 120000 });
await page.waitForTimeout(800);
const f = await d(() => window.__dakar.focus());
check('at the board by the gate, the home is offered', !!f && /Filaos|F3|logement/i.test(`${f.id} ${f.name} ${f.all?.join(' ')}`), JSON.stringify(f));
await shot('board');
await t.tap('#act'); await page.waitForTimeout(1200);
let s = await sheet();
check('« Voir le logement » opens the home: its name, the price and the rent', /Résidence Les Filaos/.test(s ?? '') && /30 000 000 F/.test(s ?? '') && /11 000 F \/ jour/.test(s ?? ''), (s ?? '').slice(0, 220));
await shot('sheet');

// 2. visit it empty
await tapItem('Visiter');
await until(() => window.__dakar.pos().mode === 'play' && !document.querySelector('#modal.on'), null, 60000);
await page.waitForTimeout(2500);
const inside = await d(() => window.__dakar.pos());
check('the visit puts the player inside the apartment, far from the street (its own slot)', inside.x > 1500, JSON.stringify({ x: Math.round(inside.x), z: Math.round(inside.z), hub: inside.hub }));
await shot('inside-entrance');
const room = await d(() => window.__dakar.pos());
await d(([x, z]) => window.__dakar.place(x, z, 0), [room.x, room.z - 4]); await page.waitForTimeout(1500);
await shot('inside-living');
await d(([x, z]) => window.__dakar.place(x, z, Math.PI), [room.x, room.z]); await page.waitForTimeout(1500);      // back at the door (labelled shortcut)

// 3. out by its door: just inside the gate, beside Pape's booth, not in the street
await t.tap('#act'); await page.waitForTimeout(2500);
await until(() => window.__dakar.pos().x < 200, null, 30000);
const out1 = await d(() => window.__dakar.pos());
check('« Sortir » comes out by the building’s door just inside the gate', Math.hypot(out1.x - 68.5, out1.z + 35.6) < 3, JSON.stringify({ x: +out1.x.toFixed(1), z: +out1.z.toFixed(1) }));
await shot('out-by-the-door');

// 4. rent it: a day's rent, nothing else, once
await walkTo(page, t, BOARD.x, BOARD.z + 0.8, { tol: 0.9, ms: 120000 });
await page.waitForTimeout(800);
const w0 = await wallet();
await t.tap('#act'); await page.waitForTimeout(1200);
await tapItem('Louer');
s = await sheet();
check('« Louer » asks first: the rent by the day and by the hour, three days unpaid, then the keys', /11 000 F \/ jour/.test(s ?? '') && /chaque heure/.test(s ?? '') && /3 jours/.test(s ?? ''), (s ?? '').slice(0, 260));
await shot('rent-confirm');
await tapItem('Une seule fois');
await until(() => window.__dakar.state.data.assets.list.some(a => a.spec === 'f3_filaos'), null, 20000);
const a1 = await held();
check('rented: the lease is held and nothing is paid at once', !!a1 && a1.how === 'rented' && (await wallet()) === w0, JSON.stringify({ how: a1?.how, wallet: await wallet() }));
log('after renting: sheet', (await sheet())?.slice(0, 200), JSON.stringify(await items())); await shot('after-rent');
await page.waitForTimeout(1500);
// 5. move in (the purchase sequence, 1.0.1: « Les clés sont à toi » › « Emménager » › the family room kept), then « Entrer chez toi » from the same sheet
await tapItem('Emménager'); await page.waitForTimeout(800); await tapItem('Garder comme chambre familiale');
await page.waitForTimeout(1500);
const homeNow = await d(() => window.__dakar.state.data.assets.home);
check('moved in: the F3 is the principal residence', homeNow === a1?.uid, JSON.stringify({ home: homeNow, uid: a1?.uid }));
if (!(await sheet())) { await t.tap('#act'); await page.waitForTimeout(1200); }
await tapItem('Entrer chez toi');
await until(() => window.__dakar.pos().x > 1500, null, 60000);
await page.waitForTimeout(2500);
const in2 = await d(() => window.__dakar.pos());
check('« Entrer chez toi » from the board leads inside', Math.abs(in2.x - 1900) < 40, JSON.stringify({ x: Math.round(in2.x) }));
await shot('home-lived-in');

// 6. reload from inside: still a tenant, at the same rent, in the same place
await page.waitForTimeout(1500);
await d(() => window.__dakar.saveNow?.());
await page.reload({ timeout: 180000 });
await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.pos().mode === 'play', null, T);
await page.waitForTimeout(3000);
const a2 = await held(), back = await d(() => window.__dakar.pos());
check('after a reload: still the tenant of the same lease, back at the building\u2019s door (or still inside)', !!a2 && a2.uid === a1?.uid && a2.how === 'rented' && (back.x > 1500 || Math.hypot(back.x - 68.5, back.z + 35.6) < 4), JSON.stringify({ how: a2?.how, x: Math.round(back.x) }));
await shot('after-reload');
check('no JavaScript errors', errors.length === 0, errors.slice(0, 3).join(' | '));

console.log(failed ? `${failed}/${total} Mermoz home checks FAILED ` : `${total}/${total} Mermoz home checks passed`);
await browser.close();
process.exit(failed ? 1 : 0);
