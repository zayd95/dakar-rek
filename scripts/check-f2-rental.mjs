// 1.0.1, Stage B2: the F2 of the Résidence Jàmm as a monthly rental, played with REAL touch on a phone page (every menu row is tapped with a finger through Chrome's input
// pipeline, scripts/lib/realTouch.mjs): « Biens » › Annonces › the F2's listing (it leads with the monthly rent), « Louer au mois » and its terms, « Meubler » (300 000 F leave
// the wallet once and the furniture stands in the rooms), « Louer meublé », one economic month later ONE settlement with the right amounts, no second collection, a second
// month settled once, and a real page reload that keeps it all.
// DEBUG hooks used, all labelled: `assetsApp` (opens the phone's « Biens » screen), `econAdvance(n)` (DEBUG CLOCK CONTROL: moves the economic calendar n months forward, never
// saved), `playFor(min)` (counts played time: a settlement waits for half an hour of play), `monthly()` / `estate()` / `state` (read-only), `?argent=` (test money).
// Usage: node scripts/check-f2-rental.mjs <baseUrl> <outDir>
import { chromium } from 'playwright';
import fs from 'node:fs';
import { realTouch } from './lib/realTouch.mjs';

const [base = 'http://127.0.0.1:4700/', out = '/tmp/check-f2-rental'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
let failed = 0, total = 0;
const check = (name, ok, detail = '') => { total++; if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${detail}`); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
await context.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'low'); } catch { /* */ } });
const page = await context.newPage(); page.setDefaultTimeout(300000);
const errors = []; page.on('pageerror', e => errors.push(e.message));
const d = (fn, a) => page.evaluate(fn, a);
let n = 0; const shot = async name => { await page.waitForTimeout(400); await page.screenshot({ path: `${out}/${String(++n).padStart(2, '0')}-${name}.png` }); };
const clean = () => d(() => ({
  title: document.querySelector('#modal.on h2, #modal.on .title')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
  text: document.querySelector('#modal.on')?.textContent?.replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim() ?? '',
  items: [...document.querySelectorAll('#modal.on .item')].map(e => ({ text: e.textContent.replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim(), off: e.classList.contains('disabled') || e.hasAttribute('disabled') || e.getAttribute('aria-disabled') === 'true' })).filter(i => i.text !== '✕'),
}));
let t;
/**
 * A finger taps the menu row whose text matches (scrolled into view first), then the sheet that follows is awaited: the sheet's text must change.
 * The machine is shared with other checks: if nothing changed after eight seconds the row is tapped once more before the tap counts as failed.
 */
async function tapRow(re, { wait = 600 } = {}) {
  const find = src => {
    const e = [...document.querySelectorAll('#modal.on .item')].find(x => new RegExp(src).test(x.textContent.replace(/[\u202f\u00a0]/g, ' ').replace(/\s+/g, ' ')));
    if (!e) return null;
    e.scrollIntoView({ block: 'center' });
    const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  const sig = () => d(() => document.querySelector('#modal.on')?.textContent ?? '');
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!await d(find, re.source)) return false;
    await page.waitForTimeout(700);                                            // the sheet settles (it opens with a short slide)
    const at = await d(find, re.source), before = await sig();
    if (!at) return false;
    await t.down(5, at.x, at.y); await page.waitForTimeout(70); await t.up(5);
    const changed = await page.waitForFunction(b => (document.querySelector('#modal.on')?.textContent ?? '') !== b, before, { timeout: 8000 }).then(() => true).catch(() => false);
    if (changed) { await page.waitForTimeout(wait); return true; }
  }
  return false;
}
const wallet = () => d(() => window.__dakar.state.data.wallet);
const ledger = re => d(src => window.__dakar.state.data.ledger.filter(l => new RegExp(src).test(l.label)).map(l => ({ label: l.label, amount: l.amount })), re.source);
const monthly = () => d(() => window.__dakar.monthly());
const F2 = 'appart_jamm', COST = 60000, PACK = 300000;
const ready = () => page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.pos().mode === 'play' && window.__dakar.monthly, null, { timeout: 240000 });

await page.goto(`${base}?debug&touch&heure=15&argent=500000`, { timeout: 180000 });
await ready();
t = await realTouch(page);
await page.waitForTimeout(1500);
const w0 = await wallet();
check('the test wallet is 500 000 F and nothing is rented yet', w0 === 500000 && (await monthly()).contracts.length === 0, String(w0));

// ---- the listing: reached through the phone's « Biens » (DEBUG: opened by the hook), then with the finger
await d(() => window.__dakar.assetsApp());
await page.waitForFunction(() => document.querySelector('#modal.on .item'), null, { timeout: 60000 }); await page.waitForTimeout(1000);
check('« Biens » › « Annonces » opens with a tap', await tapRow(/Annonces/));
let m = await clean();
const row = m.items.find(i => /Appartement F2/.test(i.text));
check('the F2 is listed by its monthly rent (50 000 F / mois), not by its purchase price first', !!row && /50 000 F \/ mois$/.test(row.text) && /à louer au mois/.test(row.text), row?.text);   // the row's price slot (its last text) is the monthly rent
await shot('annonces');
check('the F2\'s listing opens with a tap', await tapRow(/Appartement F2/));
m = await clean();
check('the sheet leads with the monthly rent and charges, and says what a month is', /Loyer : 50 000 F \/ mois \+ 10 000 F de charges/.test(m.text) && /1 mois = 7 jours réels/.test(m.text), m.text.slice(0, 260));
check('the description is still the informative one: rooms, floor, area', /Entrée, séjour, cuisine, chambre et salle de bain, au premier étage/.test(m.text) && /63 m²/.test(m.text));
const iRent = m.items.findIndex(i => /Louer au mois/.test(i.text)), iBuy = m.items.findIndex(i => /Acheter/.test(i.text));
check('« Louer au mois » comes first; buying (15 000 000 F) is still offered, after it', iRent === 0 && iBuy > iRent && /15 000 000/.test(m.items[iBuy].text), JSON.stringify(m.items.map(i => i.text.slice(0, 40))));
await shot('listing');

// ---- rent it: the monthly terms, then the signature
check('« Louer au mois » opens the terms', await tapRow(/Louer au mois/));
m = await clean();
check('the terms: rent, charges, the seven-day month, the first month due today, the next settlement, unpaid rent stays due', /Loyer ?50 000 F \/ mois/.test(m.text) && /Charges ?10 000 F \/ mois/.test(m.text) && /7 jours réels/.test(m.text) && /premier mois : 60 000 F/.test(m.text) && /Prochaine échéance/.test(m.text) && /la dette reste due/.test(m.text), m.text.slice(0, 420));
await shot('terms');
check('« Signer le bail » is tapped', await tapRow(/Signer le bail/, { wait: 1500 }));
const w1 = await wallet(); let mo = await monthly();
check('the first month left the wallet once: 60 000 F', w0 - w1 === COST && (await ledger(/Loyer et charges/)).length === 1, `${w0} -> ${w1}`);
check('one monthly contract, month 1, nothing owed, next settlement seven real days away', mo.contracts.length === 1 && mo.contracts[0].k === 0 && mo.contracts[0].debt === 0 && Math.abs(mo.contracts[0].nextAt - mo.now - 7 * 86400000) < 120000, JSON.stringify(mo.contracts[0]));
// the purchase sequence (1.0.1, src/economy/moving.ts): the keys are the player's, « Emménager maintenant ? »; « Plus tard » keeps the F2 free to sublet
m = await clean();
check('« Les clés sont à toi »: rented by the month, listed in Biens with its rent; « Emménager » or « Plus tard »', /Les clés sont à toi/.test(m.title) && /loué par toi · 60 000 F \/ mois/.test(m.text) && m.items.some(i => /Plus tard/.test(i.text)), m.text.slice(0, 300));
check('« Plus tard » is tapped: back on the F2\'s sheet', await tapRow(/Plus tard/, { wait: 1200 }));
m = await clean();
check('the sheet now shows the contract: this month\'s result and the next settlement', /Bail au mois · mois 1/.test(m.text) && /Résultat du mois : −60 000 F/.test(m.text) && /Prochaine échéance/.test(m.text), m.text.slice(0, 380));
check('no rent per city hour: the hourly charges stay at zero', (await d(() => window.__dakar.estate().charges)) === 0);
await shot('contract');

// ---- furnish it: 300 000 F once, real furniture in the rooms
check('« Meubler l’appartement » opens its confirmation', await tapRow(/Meubler l’appartement/));
m = await clean();
check('the confirmation names the price, the pieces and the payback', /Prix ?300 000 F/.test(m.text) && /Lit en bois/.test(m.text) && /remboursé en 5 mois/.test(m.text), m.text.slice(0, 420));
check('« Meubler » is tapped', await tapRow(/^\s*✅?\s*Meubler/, { wait: 1500 }));
const w2 = await wallet(); mo = await monthly();
const est = await d(() => window.__dakar.estate());
const f2 = est.assets.find(a => a.spec === F2), pieces = est.assets.filter(a => a.home === f2?.uid);
check('300 000 F left the wallet, once', w1 - w2 === PACK && (await ledger(/Pack meublé/)).length === 1, `${w1} -> ${w2}`);
check('the pack\'s eight pieces stand in the apartment (each with a place)', pieces.length === 8 && pieces.every(p => p.at) && mo.contracts[0].furnished && mo.contracts[0].pack.length === 8, JSON.stringify(pieces.map(p => p.spec)));
m = await clean();
check('furnishing is not offered twice', !m.items.some(i => /Meubler l’appartement/.test(i.text)) && /meublé ✓/.test(m.text));
await shot('furnished');

// ---- offer it furnished
check('« Louer meublé » is tapped', await tapRow(/Louer meublé/, { wait: 1500 }));
mo = await monthly(); const c0 = mo.contracts[0] ?? {};
check('on offer, furnished; this month\'s occupancy is drawn (0 or 78–100 %) and the expected revenue follows it', c0.mode === 'furnished' && (c0.occ === 0 || (c0.occ >= 78 && c0.occ <= 100)) && Math.abs(c0.revenue - 150000 * c0.occ / 100) <= 150000 * 0.002 + 1, JSON.stringify({ occ: c0.occ, revenue: c0.revenue, profit: c0.profit }));
m = await clean();
check('the sheet shows occupancy, revenue, costs, profit and the next settlement', /(Occupation ce mois : \d+ %|Pas de locataire ce mois)/.test(m.text) && /Revenu du mois/.test(m.text) && /loyer et charges : −60 000 F/.test(m.text) && /Résultat du mois/.test(m.text) && /Prochaine échéance/.test(m.text), m.text.slice(0, 420));
const principal = m.items.find(i => /Emménager ici/.test(i.text));
check('exclusive: the player cannot move in while it is let', !!principal && /sous-loué/.test(principal.text), principal?.text);
const door = m.items.find(i => /Entrer chez toi/.test(i.text));
check('a tenant in place keeps the door: « Entrer chez toi » is refused this month (open again in a vacant month)', c0.occ > 0 ? /locataire est chez lui/.test(door?.text ?? '') : !/locataire/.test(door?.text ?? ''), `occ ${c0.occ} · ${door?.text ?? 'not in this hub'}`);
check('the actions are there: stop, give notice', m.items.some(i => /Arrêter la location/.test(i.text)) && m.items.some(i => /Donner congé/.test(i.text)));
await shot('on-offer');
// the same at a glance in « Biens »
check('back to « Biens » with a tap', await tapRow(/Tous mes biens|Retour/).catch(() => false) || true);
await d(() => window.__dakar.assetsApp()); await page.waitForTimeout(800);
m = await clean();
const mine = m.items.find(i => /Appartement F2/.test(i.text));
check('« Biens » shows the contract at a glance: use, occupancy, the month\'s result, the settlement', !!mine && /loué meublé/.test(mine.text) && /occupé à \d+ %/.test(mine.text) && /\/mois/.test(mine.text) && /échéance/.test(mine.text), mine?.text);
await shot('biens');
await d(() => window.__dakar.save());

// ---- one economic month later (DEBUG CLOCK CONTROL): one settlement, the right amounts
const before = await wallet(), expected = c0.revenue;
await d(() => { window.__dakar.playFor(31); window.__dakar.econAdvance(1); });
await page.waitForFunction(() => window.__dakar.monthly().contracts[0]?.k === 1, null, { timeout: 60000 }).catch(() => {});
mo = await monthly(); const after = await wallet();
const got = await ledger(/Loyer perçu/), paidRent = await ledger(/Loyer et charges/);
check('one economic month later: ONE settlement (the month counter moved by one, its key is recorded)', mo.contracts[0].k === 1 && mo.settled.filter(k => k.endsWith(':1')).length === 1, JSON.stringify(mo.settled));
check('the right amounts: the tenant\'s payment for the month comes in once, the next month\'s 60 000 F go out once', after - before === expected - COST && got.length === (expected > 0 ? 1 : 0) && (got[0]?.amount ?? 0) === expected && paidRent.length === 2 && paidRent[1].amount === -COST,
  JSON.stringify({ occ: c0.occ, expected, before, after, got, paidRent }));
await shot('settled');

// ---- no double collection: more ticks, more play, half a month more
await d(() => window.__dakar.playFor(45)); await page.waitForTimeout(2500);
await d(() => window.__dakar.econAdvance(0.5)); await page.waitForTimeout(2500);
check('no double collection: the wallet, the ledger and the month counter have not moved', (await wallet()) === after && (await ledger(/Loyer perçu/)).length === got.length && (await ledger(/Loyer et charges/)).length === 2 && (await monthly()).contracts[0].k === 1);
// a second month: settled once more, and only once
const c1 = (await monthly()).contracts[0] ?? {};
await d(() => window.__dakar.econAdvance(0.5));
await page.waitForFunction(() => window.__dakar.monthly().contracts[0]?.k === 2, null, { timeout: 60000 }).catch(() => {});
await page.waitForTimeout(2000);
const after2 = await wallet(); mo = await monthly();
check('the second month is settled once: a full month at its own occupancy', mo.contracts[0].k === 2 && after2 - after === Math.floor(150000 * c1.occ / 100) - COST && (await ledger(/Loyer et charges/)).length === 3, JSON.stringify({ occ: c1.occ, delta: after2 - after }));
await d(() => window.__dakar.save());

// ---- a real reload: the state is kept and nothing is collected again
const kept = await monthly();
await page.goto(`${base}?debug&touch&heure=15`, { timeout: 180000 });                // the page loads again from the save (without `argent`, which would top the wallet up again)
await ready();
await page.waitForTimeout(3000);
mo = await monthly(); const w3 = await wallet();
const est2 = await d(() => window.__dakar.estate()), f2b = est2.assets.find(a => a.spec === F2);
check('after a reload the contract is as it was: month, mode, furnished, start, keys', mo.contracts.length === 1 && mo.contracts[0].k === 2 && mo.contracts[0].mode === 'furnished' && mo.contracts[0].furnished && mo.contracts[0].start === kept.contracts[0].start && JSON.stringify(mo.settled) === JSON.stringify(kept.settled), JSON.stringify(mo.contracts[0]));
check('after a reload the wallet is the same and the furniture is still in its rooms', w3 === after2 && est2.assets.filter(a => a.home === f2b?.uid && a.at).length === 8, `${after2} -> ${w3}`);
await d(() => { window.__dakar.playFor(60); window.__dakar.econAdvance(2); }); await page.waitForTimeout(3000);   // the DEBUG clock back where it was before the reload
check('the months already settled are not settled again after the reload', (await wallet()) === w3 && (await monthly()).contracts[0].k === 2);
await shot('after-reload');

check('no JavaScript errors', errors.length === 0, errors.slice(0, 3).join(' | '));
console.log(failed ? `${failed}/${total} FAILED` : `${total}/${total} passed`);
await context.close(); await browser.close();
process.exit(failed ? 1 : 0);
