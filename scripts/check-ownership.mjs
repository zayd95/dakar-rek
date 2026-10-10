// Ownership headless check (docs/OWNERSHIP.md): earn → buy furniture at Keur Meubles → it is delivered and set up at home
// → move it in the placement mode → sit on it; buy a plot and a billboard, let them, hourly income; rent the apartment,
// move in (the furniture follows), cook and shower; phone « Biens » and wallet; reload mid-flow and at the end (no double
// payment, nothing lost); an old v4 save migrates. Desktop 1280×800, then phone 390×844 (touch).
// Usage: npm run build && npx vite preview --port 4214 --strictPort, then node scripts/check-ownership.mjs [baseUrl] [outDir]
// Chromium + SwiftShader (CPU rendering): frame rates here are not phone numbers.
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:4214/';
const out = process.argv[3] ?? 'docs/screenshots/ownership';
fs.mkdirSync(out, { recursive: true });
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok: !!ok, extra: String(extra).slice(0, 400) }); console.log(ok ? 'PASS' : 'FAIL', name, String(extra).slice(0, 300)); };
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const T = { timeout: 60000 };
const D = (page, fn, arg) => page.evaluate(fn, arg);
const ready = page => page.waitForFunction(() => window.__dakar?.pos?.().hub && window.__dakar.estate, null, { timeout: 120000 });
const modal = page => D(page, () => ({ title: document.querySelector('#modal.on h2')?.textContent ?? '', text: document.querySelector('#modal.on .panel')?.textContent ?? '', items: [...document.querySelectorAll('#modal.on .item:not(.close)')].map(e => e.textContent ?? '') }));
const pick = async (page, text, touch = false) => {
  const l = page.locator('#modal.on .item:not(.dis)', { hasText: text }).first();
  await l.waitFor({ state: 'visible', timeout: 15000 });
  await (touch ? l.tap() : l.click()); await page.waitForTimeout(300);
};
const closeModal = page => D(page, () => document.querySelector('#modal')?.classList.remove('on'));
const focusIs = (page, test) => page.waitForFunction(t => { const f = window.__dakar.focus(); return !!f && new RegExp(t).test(`${f.id}|${f.primary}|${f.kind}`); }, test, T).then(() => true).catch(() => false);
const est = page => D(page, () => window.__dakar.estate());
const wallet = page => D(page, () => window.__dakar.state.wallet);
const watchErrors = page => { const errors = []; page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error' && !m.location().url.endsWith('/assets/car_rapide.glb')) errors.push(m.text()); }); return errors; };
const settle = (page, ms = 600) => page.waitForTimeout(ms);

let savedJson = null;
// ------------------------------------------------------------------ desktop: the whole loop
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await page.goto(`${base}?debug`, { waitUntil: 'load' }); await ready(page);
  await D(page, () => { localStorage.clear(); localStorage.setItem('dakarrek.quality', 'low'); }); await page.reload({ waitUntil: 'load' }); await ready(page);
  await D(page, () => { window.__dakar.setHour(10); window.__dakar.teleport('pikine'); }); await settle(page, 1200);
  const fresh = await est(page);
  check('fresh save: v5, the starter room is the home, nothing else owned', fresh.home === 'chambre_pikine' && fresh.assets.length === 1 && (await D(page, () => window.__dakar.state.data.schemaVersion)) === 5, JSON.stringify(fresh.assets));
  const spots = await D(page, () => window.__dakar.citeSpots());
  check('Pikine: the Cité Jàmm is built (Keur Meubles, Résidence Jàmm, house, two plots, billboard)', !!spots?.till && !!spots.homes.appart_jamm && !!spots.homes.maison_cite && Object.keys(spots.plots).length === 2 && !!spots.billboard, JSON.stringify(spots?.till));
  const dir = await D(page, () => window.__dakar.cityPlaces().map(p => p.id));
  check('the places directory lists the Cité Jàmm', ['pikine:city:keur_meubles', 'pikine:city:jamm', 'pikine:city:parcelles', 'pikine:city:panneau'].every(id => dir.includes(id)), dir.filter(i => /jamm|meubles|parcel|panneau|maison/.test(i)).join(','));
  await D(page, () => window.__dakar.cam([-30, 30, -40], [-30, 0, -88])); await settle(page, 1500);
  await page.screenshot({ path: `${out}/desktop-cite-jamm.png` });
  const calls = await D(page, () => window.__dakar.drawCalls());
  check('draw calls looking over the whole Cité Jàmm (Low quality; for the record)', calls > 0 && calls < 600, `${calls} draw calls`);
  await D(page, () => window.__dakar.cam(null));

  // earn: one Tiak Tiak delivery (a real job: paid once, in the ledger)
  const w0 = await wallet(page);
  await D(page, () => { window.__dakar.acceptJob('pk_mame_boutique'); window.__dakar.completeJob(); });
  const w1 = await wallet(page);
  check('earned with a delivery', w1 - w0 >= 1200, `${w0} → ${w1}`);

  // Keur Meubles: walk to the till, browse, a confirmation shows price and benefits, then buy a chair
  await D(page, s => window.__dakar.place(s.till.x, s.till.z + 0.6, Math.PI), spots);
  check('at the till, the action is « Voir les articles »', await focusIs(page, '^keur_meubles:till\\|Voir les articles'), JSON.stringify(await D(page, () => window.__dakar.focus())));
  await settle(page, 800); await page.screenshot({ path: `${out}/desktop-keur-meubles-till.png` });
  await D(page, () => window.__dakar.act()); await settle(page, 400);
  let m = await modal(page);
  check('the catalogue opens by room (Salon, Chambre, Cuisine, Bureau, Télé, Déco)', m.title === 'Keur Meubles' && m.items.length >= 6, m.items.map(t => t.slice(0, 20)).join(' | '));
  await pick(page, /^🪑Salon/);
  m = await modal(page);
  check('Salon lists simple, comfort and prestige pieces with prices', m.items.some(t => /Chaise en plastique/.test(t) && /1\s800\sF/.test(t)) && m.items.some(t => /Prestige/.test(t)), m.items.slice(0, 3).join(' | '));
  await page.screenshot({ path: `${out}/desktop-catalogue-salon.png` });
  await pick(page, 'Chaise en plastique');
  m = await modal(page);
  check('confirmation shows price, effect, delivery and what is left before buying', /^Acheter : Chaise en plastique/.test(m.title) && /Prix/.test(m.text) && /Livré/.test(m.text) && /Il te restera/.test(m.text), m.text.slice(0, 200));
  await page.screenshot({ path: `${out}/desktop-confirm-chair.png` });
  const w2 = await wallet(page);
  await pick(page, /^✅/);
  const w3 = await wallet(page);
  let e = await est(page);
  const chair = e.assets.find(a => a.spec === 'chaise_plastique');
  check('bought once (−1 800 F), delivered to the starter room and set up', w2 - w3 === 1800 && !!chair && chair.home === e.assets.find(a => a.spec === 'chambre_pikine').uid && !!chair.at, `${w2} → ${w3} · ${JSON.stringify(chair)}`);
  check('the purchase is in the wallet history', (await D(page, () => window.__dakar.ledger()[0])).label === 'Achat : Chaise en plastique');
  await closeModal(page);

  // reload mid-flow: the chair is still there, charged once
  await page.reload({ waitUntil: 'load' }); await ready(page); await settle(page, 1200);
  e = await est(page);
  check('reload after the purchase: chair kept, no double charge', (await wallet(page)) === w3 && e.assets.filter(a => a.spec === 'chaise_plastique').length === 1, `${await wallet(page)}`);
  await D(page, () => { window.__dakar.setHour(10); window.__dakar.teleport('pikine'); }); await settle(page, 800);

  // at home: the chair stands there; « Aménager » moves it; it is saved
  await D(page, () => window.__dakar.enter('home'));
  await page.waitForFunction(() => window.__dakar.pos().x > 900, null, T); await settle(page, 1000);
  let hv = await D(page, () => window.__dakar.homeView());
  check('inside: the chair is in the room with its seat', hv?.pieces.some(p => p.uid === chair.uid) && hv.seats.some(s => s.id.endsWith(`${chair.uid}:0`)), JSON.stringify(hv?.pieces));
  check('the chair is the 3D kit model (src/world/furnitureKit.ts)', hv?.pieces.find(p => p.uid === chair.uid)?.model?.startsWith('kit_'), hv?.pieces.map(p => p.model).join(','));
  check('« Aménager » is the action where nothing else is at hand', await focusIs(page, '^home:self\\|Aménager'), JSON.stringify(await D(page, () => window.__dakar.focus())));
  await D(page, () => window.__dakar.act());
  await page.waitForFunction(() => window.__dakar.placer.info().open && document.querySelector('#placer.on'), null, T).catch(() => {});
  let pi = await D(page, () => window.__dakar.placer.info());
  check('the placement mode opens on the chair (camera above the room, panel)', pi.open && pi.selected === chair.uid, JSON.stringify(pi));
  await settle(page, 1200); await page.screenshot({ path: `${out}/desktop-placement-before.png` });
  for (const a of ['left', 'left', 'down', 'down', 'down', 'rot', 'rot']) { await page.locator(`#placer [data-a="${a}"]`).click(); await page.waitForTimeout(150); }
  pi = await D(page, () => window.__dakar.placer.info());
  check('arrows and « Tourner » move the chair on the grid (not saved yet)', pi.pending.rot === (chair.at.rot + 2) % 4 && Math.abs(pi.pending.x - (chair.at.x - 0.5)) < 1e-6 && Math.abs(pi.pending.z - (chair.at.z + 0.75)) < 1e-6 && JSON.stringify((await est(page)).assets.find(a => a.uid === chair.uid).at) === JSON.stringify(chair.at), JSON.stringify(pi.pending));
  // an invalid spot is refused: inside the bed
  await D(page, () => window.__dakar.placer.moveTo(-1.9, -0.6)); await settle(page, 300);
  pi = await D(page, () => window.__dakar.placer.info());
  check('a spot on the bed is refused (red footprint, reason)', !!pi.why, pi.why);
  await D(page, () => window.__dakar.placer.moveTo(1.0, -1.25)); await settle(page, 300);
  pi = await D(page, () => window.__dakar.placer.info());
  check('a free spot fits (green footprint)', pi.why === null, JSON.stringify(pi.pending));
  await settle(page, 800); await page.screenshot({ path: `${out}/desktop-placement-moved.png` });
  await page.locator('#placer [data-a="put"]').click(); await settle(page, 300);
  const moved = (await est(page)).assets.find(a => a.uid === chair.uid).at;
  check('« Poser » saves the new spot', moved && Math.abs(moved.x - 1.0) < 1e-6 && Math.abs(moved.z + 1.25) < 1e-6 && moved.rot === pi.pending.rot, JSON.stringify(moved));
  await page.locator('#placer [data-a="done"]').click();
  await page.waitForFunction(() => window.__dakar.pos().mode === 'play' && !document.querySelector('#placer.on'), null, T).catch(() => {});
  check('« Terminé » gives the game back', (await D(page, () => window.__dakar.pos().mode)) === 'play');

  // sit on it
  hv = await D(page, () => window.__dakar.homeView());
  const seat = hv.seats.find(s => s.id.endsWith(`${chair.uid}:0`));
  await D(page, s => window.__dakar.place(s.x + Math.sin(s.yaw) * 0.75, s.z + Math.cos(s.yaw) * 0.75, s.yaw + Math.PI), seat);
  check('walking up to the chair offers « S’asseoir »', await focusIs(page, `^seat:.*${chair.uid}:0\\|S’asseoir`), JSON.stringify(await D(page, () => window.__dakar.focus())));
  await D(page, () => window.__dakar.act());
  await page.waitForFunction(() => window.__dakar.clip() === 'Sit', null, T).catch(() => {});
  const sat = await D(page, () => ({ seated: window.__dakar.seated(), y: window.__dakar.pos().y, clip: window.__dakar.clip() }));
  check('sitting on the chair at the right height', sat.seated === seat.id && sat.clip === 'Sit' && Math.abs(sat.y - (seat.top - 0.48)) < 0.05, JSON.stringify(sat));
  await D(page, st => window.__dakar.cam([st.x - 2.4, 2.3, st.z + 2.6], [st.x, 0.7, st.z]), seat); await settle(page, 1200);
  await page.screenshot({ path: `${out}/desktop-sitting-on-chair.png` });
  await D(page, () => window.__dakar.cam(null));
  await D(page, () => window.__dakar.stand());
  await D(page, () => window.__dakar.exit()); await page.waitForFunction(() => window.__dakar.pos().x < 900, null, T); await settle(page, 600);

  // land: buy the 150 m² plot at its board, let it to a market gardener
  await D(page, () => window.__dakar.giveMoney(30_000_000));
  await D(page, p => window.__dakar.place(p.x, p.z + 0.5, Math.PI), spots.plots.parcelle_150);
  check('at the plot board: « Voir la parcelle »', await focusIs(page, '^parcelle_150:sign\\|Voir la parcelle'), JSON.stringify(await D(page, () => window.__dakar.focus())));
  await D(page, () => window.__dakar.act()); await settle(page, 300);
  m = await modal(page);
  check('plot sheet: price, rent once let, Acheter', /3\s000\s000\sF/.test(m.text) && m.items.some(t => /^🔑Acheter/.test(t)), m.text.slice(0, 160));
  await pick(page, /^🔑Acheter/);
  m = await modal(page);
  check('plot confirmation shows the income it can bring', /Rapporte/.test(m.text) && /4\s500\sF/.test(m.text), m.text.slice(0, 200));
  const w4 = await wallet(page);
  await pick(page, /^✅/);
  check('plot bought (−3 000 000 F)', w4 - (await wallet(page)) === 3_000_000 && (await est(page)).assets.some(a => a.spec === 'parcelle_150' && a.how === 'owned'));
  await pick(page, 'Mettre en location');
  check('plot let to a market gardener', (await est(page)).assets.find(a => a.spec === 'parcelle_150').leased === true);
  await closeModal(page);
  await page.waitForFunction(() => /true/.test(window.__dakar.citeState().plots.parcelle_150 ?? ''), null, T).catch(() => {});
  await D(page, p => window.__dakar.cam([p.x + 9, 9, p.z + 9], [p.x, 0, p.z - 7]), spots.plots.parcelle_150); await settle(page, 1500);
  await page.screenshot({ path: `${out}/desktop-plot-let.png` });
  await D(page, () => window.__dakar.cam(null));

  // billboard: buy it, let it to advertisers
  await D(page, p => window.__dakar.place(p.x, p.z + 0.6, Math.PI), spots.billboard);
  check('at the billboard: « Voir le panneau »', await focusIs(page, '^panneau_jamm:sign\\|Voir le panneau'));
  await D(page, () => window.__dakar.act()); await settle(page, 300);
  m = await modal(page);
  check('billboard sheet also offers ad space for a day', m.items.some(t => /Louer l’espace pub/.test(t)), m.items.join(' | ').slice(0, 200));
  await pick(page, /^🔑Acheter/); await pick(page, /^✅/);
  await pick(page, 'Mettre en location');
  check('billboard bought and let to advertisers', (await est(page)).assets.find(a => a.spec === 'panneau_jamm')?.leased === true);
  await closeModal(page);
  await page.waitForFunction(() => /^leased/.test(window.__dakar.citeState().board), null, T).catch(() => {});
  check('the billboard shows an advertiser’s poster', /^leased/.test((await D(page, () => window.__dakar.citeState())).board));
  await D(page, p => window.__dakar.cam([p.x - 2, 4, p.z + 12], [p.x, 4.5, p.z]), spots.billboard); await settle(page, 1500);
  await page.screenshot({ path: `${out}/desktop-billboard-let.png` });
  await D(page, () => window.__dakar.cam(null));

  // an in-game hour of play: the rents are paid in one batch
  const hourMs = (await D(page, () => window.__dakar.business())).hourMs;
  const paid = await D(page, ms => window.__dakar.advancePlayed(ms), hourMs);
  const led = await D(page, () => window.__dakar.ledger()[0]);
  check('one in-game hour later: plot + billboard rents paid (one ledger line)', paid >= 16000 && /^Revenus · /.test(led.label) && led.amount === paid, `${paid} · ${led.label}`);

  // the apartment: rent it, move in (the chair follows), cook and shower there
  await D(page, p => window.__dakar.place(p.sign.x, p.sign.z + 0.5, Math.PI), spots.homes.appart_jamm);
  check('at the Résidence Jàmm: « Voir le logement »', await focusIs(page, '^appart_jamm:sign\\|Voir le logement'));
  await D(page, () => window.__dakar.act()); await settle(page, 300);
  m = await modal(page);
  check('apartment sheet: buy or rent, visit', m.items.some(t => /^🔑Acheter/.test(t)) && m.items.some(t => /^📝Louer/.test(t)) && m.items.some(t => /Visiter/.test(t)), m.items.join(' | ').slice(0, 200));
  await pick(page, /^📝Louer/);
  m = await modal(page);
  check('rent confirmation: rent per day and per hour, what it unlocks', /6\s000\sF \/ jour/.test(m.text) && /Débloque/.test(m.text), m.text.slice(0, 220));
  await page.screenshot({ path: `${out}/desktop-confirm-rent.png` });
  await pick(page, /^✅/);
  check('apartment rented', (await est(page)).assets.some(a => a.spec === 'appart_jamm' && a.how === 'rented'));
  await pick(page, 'Emménager ici');
  e = await est(page);
  const appart = e.assets.find(a => a.spec === 'appart_jamm');
  check('moved in: the chair followed and is set up there', e.home === 'appart_jamm' && e.assets.find(a => a.uid === chair.uid).home === appart.uid && !!e.assets.find(a => a.uid === chair.uid).at, JSON.stringify(e.assets.find(a => a.uid === chair.uid)));
  await pick(page, 'Entrer chez toi');
  await page.waitForFunction(() => window.__dakar.homeView()?.spec === 'appart_jamm', null, T).catch(() => {});
  await settle(page, 1000);
  hv = await D(page, () => window.__dakar.homeView());
  check('inside the apartment with the chair', hv?.spec === 'appart_jamm' && hv.pieces.some(p => p.uid === chair.uid), JSON.stringify(hv?.pieces));
  await page.screenshot({ path: `${out}/desktop-apartment.png` });
  const hs = await D(page, () => window.__dakar.homeSpots());
  await D(page, () => { window.__dakar.state.data.needs.faim = 30; window.__dakar.state.data.needs.hygiene = 30; });
  await D(page, k => window.__dakar.place(k.x + 0.4, k.z, -Math.PI / 2), hs.spots.kitchen);
  check('the kitchen offers « Cuisiner un repas »', await focusIs(page, '^home:appart_jamm:cuisine\\|Cuisiner'));
  await D(page, () => window.__dakar.act());
  await page.waitForFunction(() => !window.__dakar.activity() && window.__dakar.state.data.needs.faim > 60, null, { timeout: 90000 }).catch(() => {});
  check('cooking at home feeds the player (500 F of ingredients)', (await D(page, () => window.__dakar.state.data.needs.faim)) > 60 && (await D(page, () => window.__dakar.ledger()[0].amount)) === -500);
  await D(page, k => window.__dakar.place(k.x, k.z + 0.2, Math.PI), hs.spots.shower);
  check('the shower offers « Prendre une douche »', await focusIs(page, '^home:appart_jamm:douche\\|Prendre une douche'), JSON.stringify(await D(page, () => window.__dakar.focus())));
  await D(page, () => window.__dakar.act());
  await page.waitForFunction(() => !window.__dakar.activity() && window.__dakar.state.data.needs.hygiene > 80, null, { timeout: 90000 }).catch(() => {});
  check('the shower washes', (await D(page, () => window.__dakar.state.data.needs.hygiene)) > 80);
  await D(page, () => window.__dakar.exit()); await page.waitForFunction(() => window.__dakar.pos().x < 900, null, T); await settle(page, 600);
  const rentPaid = await D(page, ms => window.__dakar.advancePlayed(ms), hourMs);
  const led2 = await D(page, () => window.__dakar.ledger());
  // the rent runs at 250 F per in-game hour of play (the minutes played since renting count too)
  check('the next hour: rents in, the apartment’s rent out (250 F per in-game hour)', led2.some(l => /^Loyer · Appartement F2/.test(l.label) && l.amount <= -250 && l.amount % 1 === 0), `${rentPaid} · ${led2.slice(0, 2).map(l => l.label + ' ' + l.amount).join(' | ')}`);

  // phone: « Biens » and the wallet
  await page.locator('#menuBtn').click(); await page.locator('#phone [data-app="biens"]').waitFor({ state: 'visible', timeout: 10000 }).catch(() => {}); await settle(page, 600);
  await page.screenshot({ path: `${out}/desktop-phone-home.png` });
  await page.locator('#phone [data-app="biens"]').click(); await settle(page, 400);
  m = await modal(page);
  check('phone « Biens »: net worth, income, every asset held', m.title === 'Biens' && /Fortune totale/.test(m.text) && ['Parcelle de 150', 'Panneau 4', 'Appartement F2', 'Ta chambre'].every(n => m.items.some(t => t.includes(n))), m.items.map(t => t.slice(0, 26)).join(' | '));
  await page.screenshot({ path: `${out}/desktop-phone-biens.png` });
  await pick(page, 'Annonces');
  m = await modal(page);
  check('listings show the homes ladder up to the luxury residence and the jet (later)', ['Maison familiale', 'Villa avec piscine', 'Résidence de luxe', 'Jet privé'].every(n => m.items.some(t => t.includes(n))) && m.items.some(t => /2\s500\s000\s000\sF/.test(t)), m.items.length);
  await page.screenshot({ path: `${out}/desktop-annonces.png` });
  await closeModal(page);
  await D(page, () => window.__dakar.phone('portefeuille')); await settle(page, 400);
  const wtxt = await D(page, () => document.querySelector('#phone .ph-screen').textContent);
  check('wallet: value of assets, total wealth, income and charges per hour', /Valeur des biens/.test(wtxt) && /Fortune totale/.test(wtxt) && /Loyers et charges/.test(wtxt), wtxt.slice(0, 160));
  await page.screenshot({ path: `${out}/desktop-phone-wallet.png` });
  await D(page, () => window.__dakar.phoneClose());
  // the Dibi (venues module) talks business through the ownership sheet
  const dibi = await D(page, () => window.__dakar.dibiBusiness()); m = await modal(page);
  check('Dibi « Parler affaires » opens the ventures sheet', dibi?.offer && /Affaires/.test(m.title) && m.items.some(t => t.includes('Voir les affaires à acheter')), `${JSON.stringify(dibi)} · ${m.title}`);
  await pick(page, 'Voir les affaires à acheter'); m = await modal(page);
  check('… and leads to the « Affaires » app', m.items.some(t => /Table de bana-bana/.test(t)), m.items.slice(0, 3).join(' | '));
  await closeModal(page);

  // reload: everything persisted
  const before = await est(page), wb = await wallet(page);
  await D(page, () => window.__dakar.phone('reglages')); await page.locator('#phone [data-act="save"]').click(); await D(page, () => window.__dakar.phoneClose());
  await page.reload({ waitUntil: 'load' }); await ready(page); await settle(page, 1200);
  const after = await est(page), ver = await D(page, () => JSON.parse(localStorage.getItem('dakarrek.guest.save')).schemaVersion);
  check('reload: assets, placements, home and wallet persisted (schema v5)', ver === 5 && JSON.stringify(after.assets) === JSON.stringify(before.assets) && after.home === before.home && (await wallet(page)) >= wb - 300, `${ver} · ${after.assets.length} assets`);
  savedJson = await D(page, () => localStorage.getItem('dakarrek.guest.save'));
  check('desktop: no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// ------------------------------------------------------------------ phone 390×844 touch: same save
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  await ctx.addInitScript(s => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('dakarrek.guest.save', s); localStorage.setItem('dakarrek.quality', 'low'); sessionStorage.setItem('seeded', '1'); } }, savedJson);
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await page.goto(`${base}?debug&touch`, { waitUntil: 'load' }); await ready(page); await settle(page, 1200);
  await D(page, () => { window.__dakar.setHour(16); window.__dakar.teleport('pikine'); }); await settle(page, 800);
  const spots = await D(page, () => window.__dakar.citeSpots());
  // Keur Meubles by touch: a bed for the apartment
  await D(page, () => window.__dakar.giveMoney(200000));
  await D(page, s => window.__dakar.place(s.till.x, s.till.z + 0.6, Math.PI), spots);
  await focusIs(page, '^keur_meubles:till');
  await page.locator('#act').tap(); await settle(page, 400);
  await pick(page, /^🛏️Chambre/, true);
  await page.screenshot({ path: `${out}/phone-catalogue-chambre.png` });
  await pick(page, 'Matelas au sol', true);
  await page.screenshot({ path: `${out}/phone-confirm-bed.png` });
  await pick(page, /^✅/, true);
  let e = await est(page);
  const bed = e.assets.find(a => a.spec === 'matelas_sol');
  check('phone: a bed bought by touch, delivered to the apartment', !!bed && bed.home === e.assets.find(a => a.spec === 'appart_jamm').uid && !!bed.at, JSON.stringify(bed));
  await closeModal(page);
  await D(page, () => window.__dakar.enterHome('appart_jamm'));
  await page.waitForFunction(() => window.__dakar.homeView()?.spec === 'appart_jamm', null, T).catch(() => {});
  await settle(page, 800);
  // placement by touch: open from the action button, move with the arrows, put
  const hv0 = await D(page, () => window.__dakar.homeView());
  await D(page, v => window.__dakar.place(v.ox, v.oz + 0.8, Math.PI), hv0);
  check('phone: « Aménager » on the action button', await focusIs(page, '^home:self\\|Aménager'), JSON.stringify(await D(page, () => window.__dakar.focus())));
  await page.locator('#act').tap();
  await page.waitForFunction(() => document.querySelector('#placer.on'), null, T).catch(() => {});
  await page.locator(`#placer [data-uid="${bed.uid}"]`).tap(); await settle(page, 300);
  await page.locator('#placer [data-a="right"]').tap(); await page.locator('#placer [data-a="down"]').tap(); await settle(page, 300);
  let pi = await D(page, () => window.__dakar.placer.info());
  await page.screenshot({ path: `${out}/phone-placement.png` });
  if (pi.why) { await D(page, () => window.__dakar.placer.moveTo(0, 0)); pi = await D(page, () => window.__dakar.placer.info()); }
  await page.locator('#placer [data-a="put"]').tap(); await settle(page, 300);
  const bedAt = (await est(page)).assets.find(a => a.uid === bed.uid).at;
  check('phone: the bed moved and saved by touch', !!bedAt && Math.abs(bedAt.x - pi.pending.x) < 1e-6 && Math.abs(bedAt.z - pi.pending.z) < 1e-6, JSON.stringify(bedAt));
  await page.locator('#placer [data-a="done"]').tap();
  await page.waitForFunction(() => window.__dakar.pos().mode === 'play', null, T).catch(() => {});
  // sleep in it
  const hv = await D(page, () => window.__dakar.homeView());
  const bp = hv.pieces.find(p => p.uid === bed.uid);
  await D(page, () => { window.__dakar.state.data.needs.energie = 20; });
  await D(page, p => window.__dakar.place(p.x + 1.1, p.z, -Math.PI / 2), bp);
  check('phone: the bed offers « Dormir »', await focusIs(page, `^home:appart_jamm:${bed.uid}\\|Dormir`), JSON.stringify(await D(page, () => window.__dakar.focus())));
  await page.locator('#act').tap();
  await page.waitForFunction(() => window.__dakar.activity()?.step === 'Tu dors' && window.__dakar.clip() === 'Lie', null, T).catch(() => {});
  const asleep = await D(page, () => ({ clip: window.__dakar.clip(), seat: window.__dakar.seated(), pos: window.__dakar.pos() }));
  check('phone: asleep, lying along the floor mattress (Lie), on it', asleep.clip === 'Lie' && (asleep.seat ?? '').includes(bed.uid) && Math.hypot(asleep.pos.x - bp.x, asleep.pos.z - bp.z) < 0.2, JSON.stringify({ ...asleep, bed: bp }));
  await D(page, p => window.__dakar.cam([p.x + 2.0, p.y + 1.8, p.z + 0.6], [p.x, p.y + 0.15, p.z]), asleep.pos);
  await settle(page, 600); await page.screenshot({ path: `${out}/phone-sleeping.png` });
  await D(page, () => window.__dakar.cam(null));
  await page.waitForFunction(() => !window.__dakar.activity(), null, { timeout: 90000 }).catch(() => {});
  check('phone: a night on the floor mattress restores energy', (await D(page, () => window.__dakar.state.data.needs.energie)) >= 70, await D(page, () => window.__dakar.state.data.needs.energie));
  const awake = await D(page, () => ({ clip: window.__dakar.clip(), seat: window.__dakar.seated(), pos: window.__dakar.pos() }));
  check('phone: awake, up beside the mattress (no longer lying)', awake.seat === null && awake.clip !== 'Lie' && Math.hypot(awake.pos.x - bp.x, awake.pos.z - bp.z) > 0.7, JSON.stringify({ ...awake, bed: bp }));
  // phone « Biens » by touch
  await D(page, () => window.__dakar.exit()); await page.waitForFunction(() => window.__dakar.pos().x < 900, null, T); await settle(page, 600);
  await page.locator('#menuBtn').tap(); await page.locator('#phone [data-app="biens"]').waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
  await page.locator('#phone [data-app="biens"]').tap(); await settle(page, 400);
  const m = await modal(page);
  check('phone: « Biens » fits the screen', m.title === 'Biens' && (await D(page, () => { const p = document.querySelector('#modal .panel').getBoundingClientRect(); return p.width <= 390 && p.left >= 0; })), m.items.length);
  await page.screenshot({ path: `${out}/phone-biens.png` });
  await closeModal(page);
  check('phone: no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// ------------------------------------------------------------------ an old v4 save (affaires lane) migrates
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const v4 = { schemaVersion: 4, guestId: 'v4-test', hub: 'pikine', x: 0, z: 0, wallet: 123456, playedMs: 600000, counters: { livraisons: 3, 'inv:poisson': 4 }, furniture: ['radio', 'tapis', 'matelas'],
    business: { owned: { bana: 2 }, clockMs: 600000, payMs: 600000, carry: 12, earned: 900 }, activities: { known: ['livraison', 'services', 'commerce'], last: { livraison: 500000 } }, ledger: [], flags: [], beats: {} };
  await ctx.addInitScript(s => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('dakarrek.guest.save', s); localStorage.setItem('dakarrek.quality', 'low'); sessionStorage.setItem('seeded', '1'); } }, JSON.stringify(v4));
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await page.goto(`${base}?debug`, { waitUntil: 'load' }); await ready(page); await settle(page, 1200);
  const r = await D(page, () => ({ e: window.__dakar.estate(), b: window.__dakar.business(), inv: window.__dakar.inventory(), w: window.__dakar.state.wallet, ver: window.__dakar.state.data.schemaVersion, known: window.__dakar.state.data.activities.known }));
  const radio = r.e.assets.find(a => a.spec === 'radio');
  check('v4 save: money, ventures (2 bana-bana), earnings kept; furniture placed at its usual spots; inventory field', r.ver === 5 && r.w === 123456 && r.b.owned.bana === 2 && r.b.earned === 900 && radio?.at?.x === -0.9 && r.e.assets.some(a => a.spec === 'matelas') && r.inv.some(i => i.id === 'poisson' && i.count === 4) && r.known.includes('service'), JSON.stringify({ radio, inv: r.inv, known: r.known }));
  await D(page, () => window.__dakar.enter('home')); await page.waitForFunction(() => window.__dakar.pos().x > 900, null, T); await settle(page, 1000);
  const hv = await D(page, () => window.__dakar.homeView());
  check('v4 save: the radio and the rug stand in the room; the bed has the good mattress', hv.pieces.some(p => p.spec === 'radio') && hv.pieces.some(p => p.spec === 'tapis') && (await D(page, () => window.__dakar.roomInteractables().some(i => /bon matelas/.test(i.name)))), JSON.stringify(hv.pieces.map(p => p.spec)));
  await page.screenshot({ path: `${out}/desktop-v4-room.png` });
  check('old save: no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

await browser.close();
fs.writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 1));
console.log(`${results.filter(r => r.ok).length}/${results.length} passed`);
process.exit(results.every(r => r.ok) ? 0 : 1);
