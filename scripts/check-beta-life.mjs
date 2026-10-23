// The unified beta as ONE life on a phone page (390 × 844, real touches), checking that the parts built in separate lanes tell the same story:
//   1. a new character from the studio (a name, the femme body, a hairstyle) into Pikine;
//   2. the HUD: the streak chip at « Série 0 j », the phone button, nothing over the phone when it is open;
//   3. the phone: its home (who, where, the wallet, five destinations) and the Profile above the fold (the studio's portrait, the name, the residence,
//      « Modifier mon personnage »), with no sideways overflow;
//   4. a Tiak delivery accepted and delivered through the real job path: paid exactly once, and the day counts: the chip turns « 🔥 1 j » at once;
//   5. the Teranga bought at Sarr Auto, the Cité Jàmm house bought and made the principal residence through its sheet, two pieces of furniture;
//   6. the phone says the same life everywhere: Profil (the house, a vehicle, the run), Maison (« Domicile principal »), Argent (the wallet the save holds);
//   7. leave and come back: the character, the run, the house, the car, the money, the same.
// Usage: node scripts/check-beta-life.mjs <baseUrl> [outDir]   (a localhost build: ?argent= and ?avatar= are honoured there)
import { chromium } from 'playwright';
import fs from 'node:fs';

const [base = 'http://localhost:4601/', out = '/tmp/claude-0/beta/life'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok: !!ok, extra: String(extra).slice(0, 300) }); console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`, extra ? String(extra).slice(0, 260) : ''); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const KEY = 'dakarrek.guest.save.v6';
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'low'); } catch { /* */ } });
  const page = await ctx.newPage(); page.setDefaultTimeout(300000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const d = (fn, a) => page.evaluate(fn, a);
  const tap = sel => page.locator(sel).first().tap();
  const shot = name => page.screenshot({ path: `${out}/${name}.png` });
  const ready = () => page.waitForFunction(() => window.__dakar?.pos?.().hub && window.__dakar.estate && window.__dakar.teranga && !document.getElementById('studio'), null, { timeout: 300000 });
  const phoneOpen = async app => { await d(a => window.__dakar.phone(a), app); await page.waitForTimeout(700); };
  const phoneText = () => d(() => document.querySelector('#phone')?.innerText ?? '');
  const overflow = () => d(() => { const ph = document.getElementById('phone'); const w = innerWidth; return [...ph.querySelectorAll('*')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > w + 1 || r.left < -1); }).length + (document.scrollingElement.scrollWidth > w + 1 ? 1 : 0); });

  // 1 — the studio
  await page.goto(`${base}?debug&touch&avatar=choisir&heure=11&argent=200000000`, { timeout: 180000 });
  await page.waitForSelector('#stName', { state: 'visible' });
  await page.locator('#stName').fill('Awa'); await tap('#stContinue');
  await page.waitForFunction(() => window.__studio?.state().step === 'look', null, { timeout: 120000 });
  await tap('.st-tab[data-cat="corps"]'); await tap('#studio .st-panel [data-g="body"][data-v="femme"]');
  await page.waitForFunction(() => window.__studio.state().drawn === 'meshy_f', null, { timeout: 120000 });
  await tap('.st-tab[data-cat="coiffure"]'); await tap('#studio .st-panel [data-g="hair"][data-v="puff"]');
  await page.waitForFunction(() => window.__studio.state().view.settled, null, { timeout: 120000 });
  await shot('1-studio');
  await tap('#stPlay');
  await ready(); await page.waitForTimeout(2500);
  const who = await d(() => ({ hub: window.__dakar.pos().hub, avatar: window.__dakar.state.data.avatar, look: window.__dakar.state.data.appearance, name: window.__dakar.phoneHooks?.profileName?.() ?? null }));
  check('1. a new character from the studio: Awa, the femme body, her hairstyle, in Pikine', who.hub === 'pikine' && who.avatar === 'femme' && who.look?.hair === 'puff', JSON.stringify(who));

  // 2 — the HUD
  const chip = await d(() => { const c = document.getElementById('streakChip'); const r = c?.getBoundingClientRect(); return c ? { text: c.innerText.replace(/\s+/g, ' ').trim(), shown: r.width > 0 && getComputedStyle(c).display !== 'none' } : null; });
  check('2. the HUD shows the streak chip at « Série 0 j »', chip?.shown && /Série\s*0\s*j/.test(chip.text), JSON.stringify(chip));
  await shot('2-hud');

  // 3 — the phone's home and the Profile
  await tap('#menuBtn'); await page.waitForTimeout(900);
  const home = await phoneText();
  check('3a. the phone opens on its home: the name, the district, the wallet, the five destinations', /Awa/.test(home) && /Pikine/.test(home) && ['Carte', 'Travailler', 'Ma vie', 'Maison', 'Argent'].every(w => home.includes(w)), home.replace(/\s+/g, ' ').slice(0, 200));
  check('3b. nothing of the HUD shows over the open phone', await d(() => getComputedStyle(document.getElementById('joy')).visibility === 'hidden' || getComputedStyle(document.getElementById('joy')).display === 'none'));
  await shot('3-phone-home');
  await phoneOpen('profil');
  const prof = await d(() => {
    const ph = document.getElementById('phone'), img = ph.querySelector('img'), btn = [...ph.querySelectorAll('button')].find(b => /Modifier mon personnage/.test(b.textContent));
    return { portrait: !!img && /^data:image\//.test(img.src) && img.getBoundingClientRect().bottom < innerHeight, edit: !!btn && btn.getBoundingClientRect().bottom < innerHeight, text: ph.innerText };
  });
  check('3c. the Profile above the fold: the studio\'s portrait, the name, « Modifier mon personnage », the run', prof.portrait && prof.edit && /Awa/.test(prof.text) && /Série\s*0\s*j/.test(prof.text), prof.text.replace(/\s+/g, ' ').slice(0, 200));
  check('3d. no sideways overflow in the phone', (await overflow()) === 0);
  await shot('3-profile');
  await d(() => window.__dakar.phoneClose()); await page.waitForTimeout(500);

  // 4 — a paid delivery through the real job path, the day counted at once
  const w0 = await d(() => window.__dakar.state.wallet), l0 = await d(() => window.__dakar.state.data.ledger.filter(e => e.amount > 0).length);
  const job = await d(() => { const j = window.__dakar.jobs().find(x => !x.blocked); return j ? window.__dakar.acceptJob(j.id, true) : null; });
  const done = await d(() => window.__dakar.completeJob());
  await page.waitForTimeout(1500);
  const w1 = await d(() => window.__dakar.state.wallet), again = await d(() => window.__dakar.completeJob());
  const ledger = await d(() => window.__dakar.state.data.ledger.filter(e => e.amount > 0).length) - l0;   // the test money (?argent) is an entry of its own
  check('4a. a Tiak delivery accepted and delivered: paid once, the same run never paid again', !!job && !!done && done.paid > 0 && w1 - w0 === done.paid && !again && ledger === 1, JSON.stringify({ job: job?.runId, paid: done?.paid, gained: w1 - w0, again, ledger }));
  const t0 = await d(() => window.__dakar.hudTicks());                // « at once » is the next HUD refresh (a few a second; slow on a software renderer)
  await page.waitForFunction(t => window.__dakar.hudTicks() > t + 1, t0, { timeout: 120000 });
  const chip2 = await d(() => ({ text: document.getElementById('streakChip')?.innerText.replace(/\s+/g, ' ').trim(), run: window.__dakar.state.data.streak.run }));
  check('4b. the day counts at once: the chip shows « 🔥 1 j » and the save\'s run is 1', chip2.run === 1 && /1\s*j/.test(chip2.text) && !/Série/.test(chip2.text), JSON.stringify(chip2));
  await d(() => document.querySelector('#workCard, .work-card, [data-card]')?.click?.()); await page.waitForTimeout(600);
  await shot('4-streak');

  // 5 — the car, the house as the principal residence, furniture
  await page.waitForFunction(() => window.__dakar.teranga.info().floor.length > 0, null, { timeout: 300000 });
  await d(() => window.__dakar.teranga.own());
  await page.waitForFunction(() => window.__dakar.teranga.info().owned, null, { timeout: 300000 });
  await d(() => window.__dakar.assetSheet('maison_cite')); await page.waitForSelector('#modal.on .item');
  const pick = async text => { await page.locator('#modal.on .item', { hasText: text }).first().click(); await page.waitForTimeout(350); };
  await pick('Acheter'); await pick('Acheter'); await pick('Définir comme domicile principal');
  for (const id of ['canape_wax', 'table_basse']) await d(i => window.__dakar.buyPiece(i), id);
  await d(() => document.querySelector('#modal.on .sh-x, #modal.on [aria-label="Fermer"]')?.click()); await page.waitForTimeout(500);
  const life = await d(() => ({ home: window.__dakar.estate().home, car: window.__dakar.teranga.info().owned, pieces: window.__dakar.estate().assets.filter(a => a.kind === 'furniture').length }));
  check('5. the Teranga owned, the Cité Jàmm house the principal residence, two pieces delivered there', life.home === 'maison_cite' && life.car && life.pieces === 2, JSON.stringify(life));

  // 6 — the phone tells the same life everywhere
  await tap('#menuBtn'); await page.waitForTimeout(700);
  await phoneOpen('profil'); const p6 = await phoneText(); await shot('6-profile');
  await phoneOpen('maison'); await page.waitForSelector('#modal.on .item');   // the Maison app is the house sheet (the phone steps aside)
  const m6 = await d(() => document.querySelector('#modal.on')?.innerText ?? ''); await shot('6-maison');
  await d(() => window.__dakar.phone()); await page.waitForTimeout(700);
  await phoneOpen('argent'); const a6 = await phoneText(); await shot('6-argent');
  const wallet = await d(() => window.__dakar.state.wallet);
  const fmt = n => n.toLocaleString('fr-FR').replace(/\s/g, ' ');
  check('6a. Profil: the house, a vehicle, the run of 1 day', /Maison familiale/.test(p6) && /1\s*j/.test(p6), p6.replace(/\s+/g, ' ').slice(0, 220));
  check('6b. Maison: the Cité Jàmm house as « Domicile principal »', /Domicile principal/.test(m6) && /Maison familiale/.test(m6), m6.replace(/\s+/g, ' ').slice(0, 220));
  check('6c. Argent: the balance is the save\'s wallet, to the franc', a6.replace(/\s/g, ' ').includes(fmt(wallet)), `${fmt(wallet)} · ${a6.replace(/\s+/g, ' ').slice(0, 160)}`);
  check('6d. no sideways overflow on those screens', (await overflow()) === 0);
  await d(() => window.__dakar.phoneClose());

  // 7 — leave and come back
  await d(() => window.dispatchEvent(new Event('pagehide')));
  const kept = await d(k => JSON.parse(localStorage.getItem(k)), KEY);
  await page.goto(`${base}?debug&touch&heure=11`, { timeout: 180000 }); await ready(); await page.waitForTimeout(2500);
  const back = await d(() => ({ avatar: window.__dakar.state.data.avatar, look: window.__dakar.state.data.appearance, run: window.__dakar.state.data.streak.run, home: window.__dakar.estate().home, car: window.__dakar.teranga.info().owned, wallet: window.__dakar.state.wallet, name: document.getElementById('streakChip')?.innerText.replace(/\s+/g, ' ') }));
  check('7. back after leaving: the same character and look, the run, the house, the car, the money', back.avatar === 'femme' && back.look?.hair === 'puff' && back.run === 1 && back.home === 'maison_cite' && back.car && Math.abs(back.wallet - kept.wallet) <= 200, JSON.stringify({ ...back, saved: kept.wallet }));
  await shot('7-after-return');
  check('no JavaScript errors', errors.length === 0, errors.join(' | '));
} finally {
  fs.writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 1));
  const failed = results.filter(r => !r.ok).length;
  console.log(`${results.length - failed}/${results.length} passed`);
  await browser.close();
  process.exitCode = failed ? 1 : 0;
}
