// The consistency pass over the surfaces a player touches: the phone's screens (home, Profil, Argent, Travail, Maison, Carte, Réglages, Notifications,
// Santé, Carnet, Aide, Pistes, Banque, Messages: its list, « Nouveau message », a conversation) and the HUD's sheets (the Maison app's house sheet, an asset's sheet, the HUD on foot). On each one, measured on the page:
//   – every visible control is at least 44 px tall (Apple's minimum touch target) — a list of the ones under it;
//   – no visible text under 11 px;
//   – one family of type (the HUD and the phone share the system stack);
//   – a sheet or a screen always has its way out (« Fermer », or the phone's back/close);
//   – nothing sticks out sideways.
// Usage: node scripts/check-ui-consistency.mjs <baseUrl> <outDir>   (a ?debug build served)
import { chromium } from 'playwright';
import fs from 'node:fs';

const [base = 'http://localhost:4601/', out = '/tmp/claude-0/beta/ui'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const results = []; let failed = 0;
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail: String(detail).slice(0, 400) }); if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${String(detail).slice(0, 400)}`); };
// Messages (LD2.0-B): the list, « Nouveau message » and a conversation, on the simulated account (`fakeonline`: also Argent's Teranga Money block)
const SCREENS = ['home', 'profil', 'portefeuille', 'travailler', 'logement', 'carte', 'reglages', 'notifs', 'sante', 'carnet', 'aide', 'pistes', 'banque', 'messages', 'messages:new', 'messages:a11ce0000000a001'];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'low'); } catch { /* */ } });
  const page = await ctx.newPage(); page.setDefaultTimeout(300000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const d = (fn, a) => page.evaluate(fn, a);
  await page.goto(`${base}?debug&touch&fakeonline&heure=11&argent=2000000`, { timeout: 180000 });
  await page.waitForFunction(() => window.__dakar?.pos?.().hub && window.__dakar.estate && !document.getElementById('studio'), null, { timeout: 300000 });
  await page.waitForTimeout(2500);

  /** The audit of one surface (the root's visible part only). */
  const audit = root => d(sel => {
    const rootEl = document.querySelector(sel); if (!rootEl) return null;
    const W = innerWidth, H = innerHeight;
    const vis = e => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0 && r.bottom > 0 && r.top < H && !e.closest('[hidden],[aria-hidden="true"],#temp'); };   // #temp: the ?debug build tag
    /** Inside a row that scrolls sideways by design (the map's strip of places): its items may run past the edge. */
    const scrolls = e => { for (let p = e.parentElement; p && p !== rootEl.parentElement; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll') return true; } return false; };
    const name = e => (e.getAttribute('aria-label') || e.innerText || e.id || e.className || e.tagName).toString().replace(/\s+/g, ' ').trim().slice(0, 40);
    const controls = [...rootEl.querySelectorAll('button, a[href], [role="button"], .item, input:not([type="hidden"]), select, textarea, label.pk-btn')].filter(vis);
    // a control inside another control is one target (the outer one)
    const outer = controls.filter(c => !controls.some(o => o !== c && o.contains(c)));
    const small = outer.map(c => ({ c, r: c.getBoundingClientRect() })).filter(({ c, r }) => r.height < 44 - 0.5 && !(c.tagName === 'INPUT' && ['checkbox', 'radio', 'range'].includes(c.type))).map(({ c, r }) => `${name(c)} ${Math.round(r.width)}×${Math.round(r.height)}`);
    const texts = [...rootEl.querySelectorAll('*')].filter(e => vis(e) && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()));
    const tiny = texts.filter(e => parseFloat(getComputedStyle(e).fontSize) < 11 - 0.01).map(e => `${name(e)} ${getComputedStyle(e).fontSize}`);
    const fams = [...new Set(texts.map(e => getComputedStyle(e).fontFamily.split(',')[0].replace(/["']/g, '').trim()))];
    const wide = [...rootEl.querySelectorAll('*')].filter(e => { if (!vis(e)) return false; const r = e.getBoundingClientRect(); return (r.right > W + 1 || r.left < -1) && !scrolls(e); }).length;
    const exit = !!rootEl.querySelector('[aria-label*="Fermer"], .sh-x, .ph-x, [data-act="close"], .item.close') || [...rootEl.querySelectorAll('button')].some(b => /Fermer|Retour/.test(b.innerText || b.getAttribute('aria-label') || ''));
    return { controls: outer.length, small, tiny, fams, wide, exit };
  }, root);

  const report = {};
  const judge = (label, a, needExit = true) => {
    report[label] = a;
    if (!a) { check(`${label}: opens`, false, 'not found'); return; }
    check(`${label}: every control at least 44 px tall`, a.small.length === 0, a.small.join(' · '));
    check(`${label}: no text under 11 px`, a.tiny.length === 0, a.tiny.slice(0, 8).join(' · '));
    check(`${label}: one type family`, a.fams.length <= 2, a.fams.join(' | '));
    check(`${label}: nothing sticks out sideways`, a.wide === 0, String(a.wide));
    if (needExit) check(`${label}: a way out (« Fermer » / back)`, a.exit);
  };

  // the HUD on foot
  await page.screenshot({ path: `${out}/hud-foot.png` });
  judge('HUD on foot', await audit('#hud, body'), false);

  // the phone's screens
  for (const id of SCREENS) {
    await d(a => window.__dakar.phone(a), id);
    await page.waitForFunction(a => window.__dakar.phoneInfo().screen === a.split(':')[0], id, { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${out}/phone-${id.replace(/:/g, '-')}.png` });
    judge(`phone ${id}`, await audit('#phone'));
  }
  await d(() => window.__dakar.phoneClose()); await page.waitForTimeout(600);

  // the HUD's sheets: the Maison app (the house sheet) and an asset's sheet
  await d(() => window.__dakar.phone('maison')); await page.waitForSelector('#modal.on .item'); await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}/sheet-maison.png` });
  judge('sheet Maison', await audit('#modal.on'));
  await d(() => document.querySelector('#modal.on .sh-x, #modal.on [aria-label="Fermer"]')?.click()); await page.waitForTimeout(600);
  await d(() => window.__dakar.assetSheet('maison_cite')); await page.waitForSelector('#modal.on .item'); await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}/sheet-asset.png` });
  judge('sheet of an asset (Cité Jàmm house)', await audit('#modal.on'));
  await d(() => document.querySelector('#modal.on .sh-x, #modal.on [aria-label="Fermer"]')?.click()); await page.waitForTimeout(600);

  check('no JavaScript errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  fs.writeFileSync(`${out}/audit.json`, JSON.stringify(report, null, 2));
} finally {
  await browser.close();
  fs.writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 2));
  console.log(`${results.length - failed}/${results.length} passed`);
  process.exitCode = failed ? 1 : 0;
}
