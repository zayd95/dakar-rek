// Buy an apartment through the real sheets, make it the principal residence when asked, and see the furniture follow, then reload.
// Usage: node scripts/check-home-move.mjs [baseUrl]   (a preview/dev server on localhost: ?argent= is honoured there)
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const base = process.argv[2] ?? 'http://localhost:4447/';
const T = { timeout: 120000 };
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`, extra); assert.ok(ok, name); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
try {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 700 } }), page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const go = async () => { await page.goto(`${base}?debug&argent=50000000`, T); await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.estate, null, T); };
  const d = (fn, arg) => page.evaluate(fn, arg);
  const est = () => d(() => window.__dakar.estate());
  const pieces = (e, uid) => e.assets.filter(a => a.home === uid && a.kind === 'furniture').map(a => a.spec).sort();
  const pick = async text => { await page.locator('#modal.on .item', { hasText: text }).first().click(); await page.waitForTimeout(250); };
  const title = () => d(() => document.querySelector('#modal.on h2')?.textContent ?? '');

  await go();
  const e0 = await est(), oldHome = e0.assets.find(a => a.kind === 'home' && a.how !== 'rented') ?? e0.assets.find(a => a.kind === 'home');
  const oldUid = oldHome.uid;
  check('start: a starter home, wallet topped up', !!oldUid && (await d(() => window.__dakar.state.wallet)) >= 50_000_000);
  // furniture bought before the apartment: in the old home
  await d(() => { window.__dakar.buyPiece('miroir'); window.__dakar.buyPiece('tapis'); });
  const e1 = await est();
  check('two pieces bought: they stand in the home where the player lives', pieces(e1, oldUid).includes('miroir') && pieces(e1, oldUid).includes('tapis'), JSON.stringify(pieces(e1, oldUid)));

  // the apartment, through the real sheet and confirmation
  await d(() => window.__dakar.assetSheet('appart_jamm')); await page.waitForSelector('#modal.on .item', T);
  await pick('Acheter');
  check('the purchase asks for one confirmation', /^Acheter : /.test(await title()), await title());
  await pick('Acheter');
  const askT = await title();
  check('right after buying, the game asks « Définir comme domicile principal ? »', /Définir comme domicile principal/.test(askT), askT);
  const askText = await d(() => document.querySelector('#modal.on .panel')?.textContent ?? '');
  check('the question says the furniture follows', /pièces te suivent/.test(askText), askText.slice(0, 160));
  const e2 = await est(), newHome = e2.assets.find(a => a.spec === 'appart_jamm');
  check('the apartment is bought but not yet lived in', !!newHome && e2.home !== 'appart_jamm', `home=${e2.home}`);
  await pick('Définir comme domicile principal');
  const e3 = await est();
  check('moved in: the apartment is the home', e3.home === 'appart_jamm', `home=${e3.home}`);
  check('the furniture followed to the new home, none left in the old one', pieces(e3, newHome.uid).includes('miroir') && pieces(e3, newHome.uid).includes('tapis') && pieces(e3, oldUid).length === 0, `new=${pieces(e3, newHome.uid)} old=${pieces(e3, oldUid)}`);
  // furniture ordered afterwards goes to the new home
  await d(() => window.__dakar.buyPiece('chaises'));
  const e4 = await est();
  check('a piece ordered afterwards is delivered to the new home', pieces(e4, newHome.uid).includes('chaises') && !pieces(e4, oldUid).includes('chaises'), JSON.stringify(pieces(e4, newHome.uid)));

  // save and reload (pagehide saves)
  await d(() => dispatchEvent(new Event('pagehide')));
  await page.goto('about:blank'); await go();
  const e5 = await est(), nh = e5.assets.find(a => a.spec === 'appart_jamm');
  check('after reload: still living in the apartment', e5.home === 'appart_jamm' && !!nh, `home=${e5.home}`);
  check('after reload: all three pieces are in the apartment and none in the old home', ['chaises', 'miroir', 'tapis'].every(p => pieces(e5, nh.uid).includes(p)) && pieces(e5, oldUid).length === 0, `new=${pieces(e5, nh.uid)} old=${pieces(e5, oldUid)}`);
  check('no JavaScript errors', errors.length === 0, errors.join(' | '));
  console.log('home move checks passed');
} finally { await browser.close(); }
