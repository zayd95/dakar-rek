// The phone and the HUD at the phone sizes the game is played on (320–430 px portrait, and a landscape phone): screenshots of the screens a first-time
// player sees, and two automated checks at every size:
//   – nothing in the phone overflows sideways (the screen never scrolls horizontally, no text is cut at the right edge, nothing sticks out of the glass);
//   – the HUD's controls never overlap one another (on foot, with a job in hand, at the wheel).
// Usage: node scripts/check-phone-ux.mjs <baseUrl> <outDir> [label] [--only=390x844,…] [--quick]
// One headless browser at a time; the renderer is slow (2–6 fps): the waits are generous.
import { chromium } from 'playwright';
import fs from 'node:fs';

const args = process.argv.slice(2), flags = args.filter(a => a.startsWith('--')), pos = args.filter(a => !a.startsWith('--'));
const [base = 'http://127.0.0.1:4611/', out = '/tmp/claude-0/beta/ux/after', label = 'after'] = pos;
const only = flags.find(f => f.startsWith('--only='))?.slice(7).split(',') ?? null;
const quick = flags.includes('--quick');
fs.mkdirSync(out, { recursive: true });
const VIEWPORTS = [[320, 568], [375, 667], [390, 844], [430, 932], [844, 390]].filter(([w, h]) => !only || only.includes(`${w}x${h}`));
const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let failed = 0, total = 0;
const results = [];
const check = (name, ok, detail = '') => { total++; if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ' · ' + detail : ''}`); results.push({ name, ok, detail }); };

/** Everything in the phone that sticks out sideways: the screen scrolling horizontally, an element past the glass, a text cut at its right edge. */
function phoneOverflow() {
  const glass = document.querySelector('#phone .ph-glass') ?? document.querySelector('#phone');
  const screen = document.querySelector('#phone .ph-screen');
  const g = glass.getBoundingClientRect(), bad = [];
  if (screen && screen.scrollWidth > screen.clientWidth + 1) bad.push(`screen scrolls sideways (${screen.scrollWidth} > ${screen.clientWidth})`);
  const name = e => (e.id ? '#' + e.id : e.tagName.toLowerCase()) + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '') + (e.dataset?.app ? `[${e.dataset.app}]` : '');
  for (const e of glass.querySelectorAll('*')) {
    const cs = getComputedStyle(e);
    if (cs.display === 'none' || cs.visibility === 'hidden' || e.closest('[hidden]')) continue;
    // swiping strips and live maps scroll or pan on purpose; the wallpaper is decoration
    if (e.closest('.cm-strip, .ph-wall, canvas, .gm-map, .maplibregl-map, .ph-calc output, .ph-scrollx')) continue;
    const r = e.getBoundingClientRect(); if (r.width < 1 || r.height < 1) continue;
    if (r.right > g.right + 1 || r.left < g.left - 1) bad.push(`${name(e)} out of the glass (${Math.round(r.left)}–${Math.round(r.right)} vs ${Math.round(g.left)}–${Math.round(g.right)})`);
    const clips = cs.overflowX !== 'visible' || cs.textOverflow === 'ellipsis';
    if (clips && cs.overflowX !== 'auto' && cs.overflowX !== 'scroll' && e.scrollWidth > e.clientWidth + 1 && e.textContent.trim()) bad.push(`${name(e)} text cut (« ${e.textContent.trim().slice(0, 40)} » ${e.scrollWidth} > ${e.clientWidth})`);
  }
  return [...new Set(bad)].slice(0, 12);
}

/** The HUD's controls on screen (visible, with a size) and the pairs that overlap. */
function hudOverlaps() {
  const SEL = ['#stats', '#place', '#menuBtn', '#streakChip', '#goal', '#minimap', '#act', '#actMore', '#joy', '#progress', '#sceneTag', '#delivery', '#ride', '#presenceBtn', '#chatBtn',
    '#ridepad .rp-gas', '#ridepad .rp-brake', '#ridepad .rp-off', '#ridepad .rp-view', '#ridepad .rp-radio', '#stamina', '#hudFocusExit'];
  const boxes = [];
  for (const s of SEL) for (const e of document.querySelectorAll(s)) {
    const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) continue;
    let hidden = false; for (let p = e.parentElement; p; p = p.parentElement) { const c = getComputedStyle(p); if (c.display === 'none' || c.visibility === 'hidden' || Number(c.opacity) < 0.05) { hidden = true; break; } }
    if (hidden) continue;
    const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
    if (r.right < 0 || r.bottom < 0 || r.left > innerWidth || r.top > innerHeight) continue;
    boxes.push({ id: s, l: r.left, t: r.top, r: r.right, b: r.bottom });
  }
  const pairs = [];
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j], w = Math.min(a.r, b.r) - Math.max(a.l, b.l), h = Math.min(a.b, b.b) - Math.max(a.t, b.t);
    if (w > 1 && h > 1) pairs.push(`${a.id} × ${b.id} (${Math.round(w)}×${Math.round(h)})`);
  }
  const off = boxes.filter(b => b.l < -1 || b.t < -1 || b.r > innerWidth + 1 || b.b > innerHeight + 1).map(b => `${b.id} off screen`);
  return { shown: boxes.map(b => b.id), pairs, off };
}

const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
try {
  for (const [w, h] of VIEWPORTS) {
    const vp = `${w}x${h}`;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await ctx.addInitScript(() => { try { if (!sessionStorage.getItem('ux-check')) { localStorage.clear(); localStorage.setItem('dakarrek.quality', 'low'); sessionStorage.setItem('ux-check', '1'); } } catch { /* */ } });
    const page = await ctx.newPage(); page.setDefaultTimeout(240000);
    const errors = []; page.on('pageerror', e => errors.push(String(e)));
    const d = (fn, a) => page.evaluate(fn, a);
    const shot = async n => { await page.waitForTimeout(700); await page.screenshot({ path: `${out}/${label}-${vp}-${n}.jpg`, type: 'jpeg', quality: 62 }); };
    await page.goto(`${base}?debug&touch&heure=11&argent=500000`, { timeout: 240000 });
    await page.waitForFunction(() => window.__dakar?.pos?.().hub && window.__dakar.body?.(), null, { timeout: 240000 });
    await d(() => { const k = window.__dakar; k.teleport('pikine', -42, -66, Math.PI / 2); k.setHour(11); });
    await page.waitForTimeout(2500);

    // ---- on foot
    await shot('hud-foot');
    let o = await d(hudOverlaps);
    check(`${vp}: on foot, no HUD controls overlap`, !o.pairs.length && !o.off.length, [...o.pairs, ...o.off].join(' ; ') || o.shown.join(' '));

    // ---- one action nearby: the action button and its pin over the target
    const near = await d(() => { const k = window.__dakar, me = k.pos(); const list = k.interactables().map(i => ({ ...i, d: Math.hypot(i.x - me.x, i.z - me.z) })).sort((a, b) => a.d - b.d); return list.slice(0, 8); });
    for (const it of near) {
      await d(i => { const k = window.__dakar, me = k.pos(), a = Math.atan2(i.x - me.x, i.z - me.z), x = i.x - Math.sin(a) * 1.6, z = i.z - Math.cos(a) * 1.6; k.place(x, z, a); }, it);
      if (await page.waitForFunction(() => !!window.__dakar.focus()?.primary, null, { timeout: 6000 }).then(() => true, () => false)) break;
    }
    await page.waitForTimeout(1500);
    await shot('hud-interact');
    o = await d(hudOverlaps);
    check(`${vp}: one action nearby, no HUD controls overlap`, !o.pairs.length && !o.off.length, [...o.pairs, ...o.off].join(' ; ') || o.shown.join(' '));
    await d(() => window.__dakar.place(-42, -66, Math.PI / 2)); await page.waitForTimeout(800);

    // ---- the phone's screens
    const screens = [['home', 'phone-home'], ['profil', 'profile'], ['portefeuille', 'money'], [label === 'before' ? 'travail' : 'travailler', 'work'], ['reglages', 'settings']];
    for (const [app, n] of quick ? screens.slice(0, 2) : screens) {
      const opened = await d(a => window.__dakar.phone(a), app);
      await page.waitForTimeout(900);
      const phoneOn = await d(() => !!document.querySelector('#phone.on'));
      await shot(n);
      if (phoneOn) {
        const bad = await d(phoneOverflow);
        check(`${vp}: phone « ${app} » fits the width`, opened && !bad.length, bad.join(' ; '));
      } else check(`${vp}: « ${app} » opened (a sheet of its own module)`, opened, '');
      if (app === 'profil') {
        const tabs = await d(() => [...document.querySelectorAll('#phone [data-tab]')].map(b => b.dataset.tab));
        for (const tab of tabs) {
          await page.locator(`#phone [data-tab="${tab}"]`).tap(); await page.waitForTimeout(500);
          await shot(`profile-${tab}`);
          const bad = await d(phoneOverflow);
          check(`${vp}: Profil › ${tab} fits the width`, !bad.length, bad.join(' ; '));
        }
        // above the fold: the portrait, the name, the edit button
        const fold = await d(() => {
          const s = document.querySelector('#phone .ph-screen').getBoundingClientRect(), q = sel => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return r.bottom <= s.bottom + 1 && r.top >= s.top - 1; };
          return { portrait: q('#phone .pf-pic, #phone .ph-portrait, #phone .ph-profile > i'), name: q('#phone .pf-name, #phone .ph-profile b'), edit: q('#phone [data-act="editchar"]') };
        });
        check(`${vp}: Profil: portrait, name and « Modifier mon personnage » above the fold`, fold.portrait && fold.name && fold.edit, JSON.stringify(fold));
      }
      await d(() => { window.__dakar.phoneClose(); window.__dakar.closeModal?.(); document.querySelector('#modal .sh-x')?.click(); });
      await page.waitForTimeout(400);
    }
    if (quick) { await ctx.close(); continue; }

    // ---- a job in hand (Tiak Tiak, accepted from the phone: go to the pick-up)
    const job = await d(() => { const k = window.__dakar, j = k.jobs?.().find(x => !x.blocked); return j ? k.acceptJob(j.id, false) : null; });
    await page.waitForTimeout(2500);
    await shot('hud-job');
    o = await d(hudOverlaps);
    check(`${vp}: a job in hand, no HUD controls overlap`, !!job && !o.pairs.length && !o.off.length, [...o.pairs, ...o.off].join(' ; ') || o.shown.join(' '));
    // the phone open over it
    await d(() => window.__dakar.phone('home')); await page.waitForTimeout(900);
    await shot('hud-phone-open');
    await d(() => window.__dakar.phoneClose()); await page.waitForTimeout(400);
    await d(() => window.__dakar.cancelJob?.());

    // ---- at the wheel (the player's own Jakarta, boarded as a player does: next to it, « Monter »)
    const drove = await (async () => {
      try {
        await d(() => window.__dakar.moto.own());
        await page.waitForFunction(() => window.__dakar.moto.info().owned && window.__dakar.moto.info().here, null, { timeout: 120000 });
        await d(() => { const k = window.__dakar; k.moto.place(-62.1, 6, 0); k.place(-60.2, 6.3, -Math.PI / 2); });
        await page.waitForFunction(() => window.__dakar.focus()?.id === 'moto:parked', null, { timeout: 30000 });
        await d(() => window.__dakar.act());
        await page.waitForFunction(() => window.__dakar.moto.at()?.driving && document.body.classList.contains('ridepad'), null, { timeout: 60000 });
        return true;
      } catch { return false; }
    })();
    await page.waitForTimeout(1500);
    await shot('hud-drive');
    o = await d(hudOverlaps);
    check(`${vp}: at the wheel, no HUD controls overlap`, drove && !o.pairs.length && !o.off.length, (drove ? '' : 'not boarded · ') + ([...o.pairs, ...o.off].join(' ; ') || o.shown.join(' ')));
    // a car's pedals are bigger than the bike's: the same layout with the car's sizes (the pad's own classes, src/transport/ridePad.ts show({ car: true }))
    if (drove) {
      await d(() => document.body.classList.add('ridepad-car')); await page.waitForTimeout(500);
      await shot('hud-drive-car');
      o = await d(hudOverlaps);
      check(`${vp}: at the wheel of a car, no HUD controls overlap`, !o.pairs.length && !o.off.length, [...o.pairs, ...o.off].join(' ; ') || o.shown.join(' '));
      await d(() => document.body.classList.remove('ridepad-car'));
    }
    // focus modes other lanes signal (an activity, the prayer): only the essentials stay
    if (label !== 'before') {
      for (const f of ['activity', 'prayer']) {
        // the game paused while it is measured: a running module owns its focus (the mosque clears « prayer » each frame no one prays)
        await d(m => { window.__dakar.pause(true); document.body.dataset.focus = m; }, f); await page.waitForTimeout(600);
        await shot(`hud-focus-${f}`);
        const shown = (await d(hudOverlaps)).shown;
        check(`${vp}: focus « ${f} »: the HUD steps back`, f === 'prayer' ? !shown.some(s => /#stats|#goal|#minimap|#streakChip|#place/.test(s)) : !shown.some(s => /#goal|#minimap|#streakChip/.test(s)), shown.join(' '));
      }
      await d(() => { delete document.body.dataset.focus; window.__dakar.pause(false); });
    }
    check(`${vp}: no page errors`, !errors.length, errors.slice(0, 3).join(' | '));
    await ctx.close();
  }
} finally { await browser.close(); }
fs.writeFileSync(`${out}/${label}-results.json`, JSON.stringify(results, null, 2));
console.log(`${total - failed}/${total} passed`);
if (failed) process.exitCode = 1;
