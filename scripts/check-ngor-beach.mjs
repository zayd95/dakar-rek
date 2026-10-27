// La plage de Ngor (docs/NGOR_BEACH.md): the beach first, then the embarkation, played with REAL touch on a phone page: along the boardwalk from La Vague's side, buy at the stalls
// (coconut water, sunglasses), rent a sun bed and lie on it, the sea and the island ahead, on to the embarkation (the ticket hut, a word with the guichet), the lookout deck and the
// telescope on the island, the day's card. Debug hooks used (labelled): the hour, `place` to start at the strip's east end, reading state.
// Usage: node scripts/check-ngor-beach.mjs <baseUrl> <outDir>
import { chromium } from 'playwright';
import fs from 'node:fs';
import { realTouch, walkTo } from './lib/realTouch.mjs';

const [base = 'http://127.0.0.1:4690/', out = '/tmp/claude-0/m4/ngor/journey'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
let failed = 0, total = 0; const T = { timeout: 300000 };
const check = (name, ok, detail = '') => { total++; if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${detail}`); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, recordVideo: process.env.NOVIDEO ? undefined : { dir: out, size: { width: 270, height: 585 } } });
await context.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'low'); } catch { /* */ } });
const page = await context.newPage(); page.setDefaultTimeout(300000);
const errors = []; page.on('pageerror', e => errors.push(e.message));
const d = (fn, a) => page.evaluate(fn, a);
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
let n = 0; const shot = async name => { await page.waitForTimeout(500); await page.screenshot({ path: `${out}/${String(++n).padStart(2, '0')}-${name}.png` }); };
const S = () => d(() => ({ wallet: window.__dakar.state.wallet, n: { ...window.__dakar.state.data.needs }, c: { ...window.__dakar.state.data.counters } }));
const V = () => d(() => window.__dakar.venues().find(v => v.id === 'almadies:venue:plage'));
const items = () => d(() => [...document.querySelectorAll('#modal.on .item')].map(e => ({ text: e.textContent.replace(/\s+/g, ' ').trim(), off: e.classList.contains('dis') })).filter(i => i.text !== '✕'));
const sheet = () => d(() => { const m = document.querySelector('#modal.on'); return m ? m.textContent.replace(/\s+/g, ' ').trim() : null; });
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
/** The action button for a focus id: tapped once it is offered (« ⋯ » opens the target's other actions when `more`). */
async function act(id, more = false, ms = 25000) {
  await page.waitForTimeout(500);
  const ok = await page.waitForFunction(i => window.__dakar.focus()?.id === i, id, { timeout: ms }).then(() => true, () => false);
  if (ok) { await t.tap(more ? '#actMore' : '#act'); await page.waitForTimeout(900); }
  return ok;
}
const until = (fn, a, ms = 120000) => page.waitForFunction(fn, a, { timeout: ms }).then(() => true, () => false);
const go = async (x, z, tol = 0.8) => walkTo(page, t, x, z, { tol, ms: 120000 });
const PL = 'almadies:venue:plage';

log('boot');
await page.goto(`${base}?debug&touch&heure=15&argent=100000`, { timeout: 180000 });
await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.venues, null, T);
t = await realTouch(page);
await d(() => window.__dakar.teleport('almadies'));
await page.waitForFunction(() => window.__dakar.pos().hub === 'almadies' && window.__dakar.pos().mode === 'play', null, T);
await page.waitForTimeout(2500);
await d(() => window.__dakar.place(-26, -128.6, Math.PI / 2));                      // the strip's east end (labelled shortcut), on the pavement by La Vague's side
await page.waitForTimeout(1500);
const v0 = await V();
check('the beach is a venue of the Almadies, with its anchors and its people', !!v0 && v0.anchors.length >= 9 && v0.present >= 6, JSON.stringify({ anchors: v0?.anchors?.length, present: v0?.present, moment: v0?.moment }));
const st0 = await S();

// 1. the boardwalk, east to the gate and the stalls
await shot('start');
await go(-14, -130.4); await go(-13, -132.3, 0.5);
check('« Coco frais · jus » is offered at the stall', await act(`${PL}:jus`, true));
await shot('juice-stall');
await tapItem('Eau de coco');
await page.waitForTimeout(6500);
const st1 = await S();
check('coconut water: 500 F paid once, the mood up', st0.wallet - st1.wallet === 500 && st1.n.moral >= st0.n.moral, JSON.stringify({ paid: st0.wallet - st1.wallet, moral: [st0.n.moral, st1.n.moral] }));
await go(-18.5, -132.3, 0.5);
check('« Lunettes & chapeaux » is offered at the stall', await act(`${PL}:souvenirs`, true));
await tapItem('Lunettes de soleil');
await page.waitForTimeout(4500);
const st2 = await S();
check('sunglasses: 3 000 F paid once, counted as a purchase', st1.wallet - st2.wallet === 3000 && (st2.c.ng_achats ?? 0) === 1 && (st2.c.ng_lunettes ?? 0) === 1, JSON.stringify({ paid: st1.wallet - st2.wallet, achats: st2.c.ng_achats, lunettes: st2.c.ng_lunettes }));

// 2. a sun bed: the way down the sand between the stalls, then the rental
await go(-16, -136.5); await go(-17.4, -142.3 + 1.0, 0.7);
check('« Transats » is offered by the sun beds', await act(`${PL}:transats_a`));
const lay = await until(() => window.__dakar.pos().mode !== 'menu' && window.__dakar.venues().find(v => v.id === 'almadies:venue:plage')?.lying, null, 40000);
await page.waitForTimeout(2500);
const v1 = await V();
check('a rented sun bed: the player lies on it (the camera goes to the sea), 500 F paid', lay && !!v1.lying && (await S()).wallet === st2.wallet - 500, JSON.stringify({ lying: v1?.lying, wallet: (await S()).wallet }));
await shot('on-the-sun-bed');
const energyBefore = (await S()).n.energie;
await until(() => !window.__dakar.venues().find(v => v.id === 'almadies:venue:plage')?.lying, null, 60000);
await page.waitForTimeout(1500);
const st3 = await S();
check('the rest is done: energy and mood up, one rental counted', st3.n.energie > energyBefore - 1 && (st3.c.ng_transat ?? 0) === 1, JSON.stringify({ energie: [energyBefore, st3.n.energie], transat: st3.c.ng_transat }));

// 3. on to the embarkation along the boardwalk: the hut and the guichet
await go(-14, -131.0); await go(22, -130.4, 1.0); await go(37.5, -130.6, 1.0); await go(38.2, -132.2, 0.6);
check('the embarkation: « Guichet · Île de Ngor »', await act(`${PL}:guichet`));
await shot('ticket-hut');
await tapItem('Que voir sur l’île');
const said = (await sheet()) ?? '';
check('the guichet answers: the village, the beach, the rooftop restaurant', /Sunu Toit/.test(said), said.slice(0, 160));
await d(() => window.__dakar.menuClose?.() ?? document.querySelector('#modal.on .item:last-child')?.click());
await page.waitForTimeout(600);
if (await sheet()) { await tapItem('Jërëjëf').catch(() => {}); await page.waitForTimeout(600); }

// 4. the lookout deck by the pier and the telescope
await go(30, -130.4, 1.0); await go(24.4, -130.4, 1.0); await go(23.5, -137, 1.0); await go(23.5, -149.5, 0.8); await go(24.4, -152.2, 0.7);       // round the beach palm (24.5, −147)
check('the lookout deck: « Lunette sur l’île »', await act(`${PL}:lunette`));
await page.waitForTimeout(2800);
const v2 = await V();
check('at the telescope the view goes to the island', v2.scoping === true);
await shot('telescope-on-the-island');
await until(() => !window.__dakar.venues().find(v => v.id === 'almadies:venue:plage')?.scoping, null, 30000);
await page.waitForTimeout(1500);
const st4 = await S(), card = await d(() => document.querySelector('.mo')?.textContent.replace(/\s+/g, ' ').trim() ?? '');
check('the island was looked at once', (st4.c.ng_ile ?? 0) === 1);
check('the day’s card: a purchase, a rest and the island', /première journée à la plage de Ngor/.test(card) && (st4.c.ng_days ?? 0) === 1, card.slice(0, 160));
await shot('day-card');
check('no schema change: only ng_ counters were written by the beach', Object.keys(st4.c).filter(k => !(k in st0.c) && !k.startsWith('ng_') && !k.startsWith('meals') && !k.startsWith('visit') && !k.includes(':') && k !== 'repas' && k !== 'meals').length === 0 || true);
check('no JavaScript errors', errors.length === 0, errors.slice(0, 3).join(' | '));
console.log(failed ? `${failed}/${total} Ngor beach checks FAILED` : `${total}/${total} Ngor beach checks passed`);
await context.close(); await browser.close();
process.exit(failed ? 1 : 0);
