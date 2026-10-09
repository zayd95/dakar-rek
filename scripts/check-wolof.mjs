// Wolof in game (src/i18n): greetings by the hour, names, goodbyes, haggling, glosses on/off, the cast, the chat's
// quick phrases. Checks + captures in docs/screenshots/wolof (desktop 1280×720 and phone 390×844).
// Usage: node scripts/check-wolof.mjs [baseUrl=http://localhost:4247/] [outDir=docs/screenshots/wolof] [--only=solo|chat] [--view=desktop|phone] [--chat=http://127.0.0.1:8797/]
//   baseUrl: a solo build served by `npx vite preview --port 4247`; --chat: an online build served by `wrangler dev --local`.
import { chromium } from 'playwright';
import fs from 'node:fs';

const args = process.argv.slice(2);
const chatUrl = args.find(a => a.startsWith('--chat='))?.slice(7) ?? null;
const [base = 'http://localhost:4247/', out = 'docs/screenshots/wolof'] = args.filter(a => !a.startsWith('--'));
const only = args.find(a => a.startsWith('--only='))?.slice(7) ?? 'all';      // all | solo | chat
fs.mkdirSync(out, { recursive: true });
const T = { timeout: 120000 };
const results = []; let failed = 0;
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${detail}`); };
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const ALL_VIEWS = [['desktop', { width: 1280, height: 720 }, false], ['phone', { width: 390, height: 844 }, true]];
const view = args.find(a => a.startsWith('--view='))?.slice(7) ?? 'all';       // all | desktop | phone (solo part; the chat needs both)
const VIEWS = view === 'all' || only === 'chat' ? ALL_VIEWS : ALL_VIEWS.filter(([l]) => l === view);
const d = (page, fn, arg) => page.evaluate(fn, arg);
/** The toast's text, no-break spaces read as spaces (the lines use French typography: « Na nga def ? »). */
const toast = page => d(page, () => (document.getElementById('toast')?.textContent ?? '').replace(/[\u00a0\u202f]/g, ' '));
/** Keeps the toast visible while SwiftShader takes a capture (a capture can take longer than the toast's 2.6 s). */
const pinToast = (page, on) => d(page, on => {
  const t = document.getElementById('toast'); window.__pin?.disconnect(); window.__pin = null;
  if (!on || !t) return;
  t.classList.add('on');
  window.__pin = new MutationObserver(() => { if (!t.classList.contains('on')) t.classList.add('on'); });
  window.__pin.observe(t, { attributes: true, attributeFilter: ['class'] });
}, on);
async function shot(page, name, toastOn = true) {
  if (toastOn) await pinToast(page, true);
  await page.waitForTimeout(600);
  await page.screenshot();                         // under SwiftShader the first capture can show a stale frame
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/${name}.png` });
  if (toastOn) await pinToast(page, false);
}
async function waitToast(page, re, timeout = 20000) {
  return page.waitForFunction(src => new RegExp(src).test((document.getElementById('toast')?.textContent ?? '').replace(/[\u00a0\u202f]/g, ' ')), re.source, { timeout }).then(() => true, () => false);
}
const idle = page => page.waitForFunction(() => !window.__dakar.activity() && window.__dakar.pos().mode === 'play', null, T).catch(() => {});
/** Runs the affordance with this label on the focused target (through « ⋯ », like a player). */
async function runVerb(page, label) {
  await idle(page);
  await d(page, () => window.__dakar.more());
  await page.waitForFunction(() => document.querySelector('#modal.on'), null, T).catch(() => {});
  const item = page.locator('#modal .item', { hasText: label }).first();
  if (!(await item.count())) { await d(page, () => document.querySelector('#modal .item.close')?.click()); return false; }
  await item.click();
  return true;
}
async function open(viewport, touch, url = base) {
  const ctx = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { if (!sessionStorage.getItem('wolof-check')) { localStorage.clear(); localStorage.setItem('dakarrek.quality', 'low'); sessionStorage.setItem('wolof-check', '1'); } });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${url}?debug${touch ? '&touch' : ''}`, { timeout: 120000 });
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.wolof, null, T);
  return { ctx, page, errors };
}
/** Stand in front of a person of the street who is talking (not walking), facing them; returns the focus. */
async function meetPasserBy(page, skip = 0) {
  const folks = ((await d(page, () => window.__dakar.cityGeometry()))?.people ?? []).filter(p => p.clip === 'Talk' && !p.walkTo);
  for (const p of folks.slice(skip, skip + 10)) {
    await d(page, q => window.__dakar.place(q.x + Math.sin(q.yaw) * 1.1, q.z + Math.cos(q.yaw) * 1.1, q.yaw + Math.PI), p);
    if (await page.waitForFunction(() => window.__dakar.focus()?.kind === 'person', null, { timeout: 8000 }).then(() => true, () => false)) {
      return d(page, () => window.__dakar.focus());
    }
  }
  return null;
}
async function goTo(page, hub, find) {
  if ((await d(page, () => window.__dakar.pos().hub)) !== hub) {
    await d(page, h => window.__dakar.teleport(h), hub);
    await page.waitForFunction(h => window.__dakar.pos().hub === h, hub, T);
  }
  const it = (await d(page, () => window.__dakar.interactables())).find(find);
  if (!it) return null;
  // Stand at the place, or just beside it if a wall pushes the player out and something else takes the focus.
  for (const [dx, dz] of [[0, 1.8], [0, -1.8], [1.8, 0], [-1.8, 0], [0, 1], [0, -1], [0, 0]]) {
    await d(page, ([p, dx, dz]) => { const g = window.__dakar; g.place(p.x + dx, p.z + dz, Math.PI); g.state.data.needs.energie = 100; g.state.data.wallet = Math.max(g.state.data.wallet, 20000); }, [it, dx, dz]);
    const ok = await page.waitForFunction(id => window.__dakar.focus()?.id === id, it.id, { timeout: 6000 }).then(() => true, () => false);
    if (ok) return it;
  }
  return null;
}

if (only !== 'chat') for (const [label, viewport, touch] of VIEWS) {
  const { ctx, page, errors } = await open(viewport, touch);

  // 1. Greetings follow the hour; each person answers their own way; names; goodbyes.
  await d(page, () => { window.__dakar.setHour(9); window.__dakar.teleport('pikine'); });
  await page.waitForFunction(() => window.__dakar.pos().hub === 'pikine', null, T);
  let f = await meetPasserBy(page);
  check(`${label}: a passer-by can be greeted`, f?.primary === 'Saluer', JSON.stringify(f));
  if (f) {
    await idle(page); await d(page, () => window.__dakar.act());
    const ok = await waitToast(page, /Toi : « Salaam aleekum ! » · Passan(t|te) : « Maleekum salaam ! »/, 60000);   // first hub load: slow frames
    check(`${label}: « Salaam aleekum ! » — « Maleekum salaam ! »`, ok, await toast(page));
    await shot(page, `${label}-greet`);
    const follow = await waitToast(page, /« (Na nga fanaane \?|Jàmm nga am \?) »/, 4500);
    const t2 = await toast(page);
    check(`${label}: at 9 h the follow-up (when this person adds one) is the morning greeting or « Jàmm nga am ? »`, !follow || /Passan(t|te) : « (Na nga fanaane|Jàmm nga am) \? » \([^)]*\) · Toi : « Jàmm rekk\. »/.test(t2), t2);
    if (follow) await shot(page, `${label}-greet-morning`);
    const asked = await runVerb(page, 'Demander son nom');
    const named = asked && await waitToast(page, /Naka nga tudd \?.*(Maa ngi tudd [A-ZÀ-Ý]\S+\.|[A-ZÀ-Ý]\S+ laa tudd\.)/);
    check(`${label}: « Naka nga tudd ? » — « Maa ngi tudd … » / « … laa tudd »`, named, await toast(page));
    await shot(page, `${label}-name`);
    await d(page, () => window.__dakar.setHour(20.5));
    await idle(page);
    const YENDOO = /Toi : « Na nga yendoo \? » \(la journée s’est bien passée \?\) · \S+ : « Jàmm rekk\. »/;
    await d(page, () => window.__dakar.act());                                      // greet again: the evening greeting
    let evening = await waitToast(page, new RegExp(`${YENDOO.source}|Maleekum salaam`));
    if (evening && !YENDOO.test(await toast(page))) {
      // A walker passed in front and took the focus: that was a first greeting. Greet the same person once more.
      await idle(page); await page.waitForTimeout(2800); await d(page, () => window.__dakar.act());
      evening = await waitToast(page, YENDOO);
    } else evening = YENDOO.test(await toast(page));
    check(`${label}: greeting again at 20 h 30 uses « Na nga yendoo ? »`, evening, await toast(page));
    await shot(page, `${label}-greet-evening`);
    const bye = await runVerb(page, 'Dire au revoir');
    const night = bye && await waitToast(page, /Toi : « Fanaanal ak jàmm ! » \(bonne nuit\) · \S+ : « Ba suba ! » \(à demain\)/);
    check(`${label}: « Dire au revoir » at night: « Fanaanal ak jàmm ! » — « Ba suba ! »`, night, await toast(page));
    // Glosses hidden (Réglages › Langue): small talk without the French.
    await d(page, () => { window.__dakar.wolof.glosses(false); window.__dakar.setHour(9); });
    await page.waitForTimeout(2800);
    const talked = await runVerb(page, 'Parler avec') || await runVerb(page, 'Demander son nom');   // (if a walker took the focus)
    const plain = talked && await waitToast(page, /^[^()]+ : « [^»()]+ » · [^()]+ : « [^»()]+ »$/);
    check(`${label}: with glosses hidden the Wolof small talk stands alone`, plain, await toast(page));
    await shot(page, `${label}-talk-no-gloss`);
    await d(page, () => window.__dakar.wolof.glosses(true));
  }

  // 2. Haggling at the market: the Sandaga stall (a customer discusses the price), the Soumbédioune fish stall.
  const stall = await goTo(page, 'plateau', i => i.id.endsWith(':market'));
  if (stall && await runVerb(page, 'Tenir l’étal')) {
    const ok = await waitToast(page, /^Une cliente : « (Ñaata la \? » \(c’est combien \?\) · Toi : « 1 500 F\.|Seer na ! Wàññi ko tuuti\. » \(c’est cher · baisse un peu\) · Toi : « Déedéet, 1 500 F rekk\.)/);
    check(`${label}: selling at the Sandaga stall, a customer asks « Ñaata la ? » or haggles`, ok, await toast(page));
    await shot(page, `${label}-haggle-sandaga`);
    // Then the stall gesture: each customer asks for her goods, in French with a Wolof touch (src/activity/gestures.ts).
    await page.waitForFunction(() => window.__dakar.gesture?.()?.kind === 'choose', null, T).catch(() => {});
    const ask = await d(page, () => (document.querySelector('#gesture .gst-ask')?.textContent ?? '').replace(/[  ]/g, ' '));
    check(`${label}: at the stall each customer asks for her goods (French goods, glossed Wolof touch)`, /^Cliente « .+ »/.test(ask) && !/[⁣⁤]/.test(ask), ask);
    await shot(page, `${label}-stall-ask`, false);
    await page.keyboard.press('Escape');                                           // stops the shift (as in check-gestures)
    await page.waitForFunction(() => !window.__dakar.activity(), null, T).catch(() => {});
  } else check(`${label}: Sandaga stall found`, false);
  const fish = await goTo(page, 'corniche', i => i.id.endsWith(':city:fish-market'));
  if (fish && await runVerb(page, 'Commander du poisson grillé')) {
    const ok = await waitToast(page, /^Toi : « (Ñaata la \?|Seer na ! Wàññi ko tuuti\.) » .* · La vendeuse : « (1 200 F|Déedéet, 1 200 F rekk)/);
    check(`${label}: ordering grilled fish at Soumbédioune starts with the price`, ok, await toast(page));
    await shot(page, `${label}-haggle-fish`);
    const taste = await waitToast(page, /^Toi : « Neex na ! » \(c’est bon\)$/, 90000);     // SwiftShader: a frame can take longer than dt's 0.1 s cap
    check(`${label}: … and « Neex na ! » at the first bite`, taste, await toast(page));
    await page.waitForFunction(() => !window.__dakar.activity(), null, T).catch(() => {});
  } else check(`${label}: Soumbédioune fish stall found`, false);
  if (label === 'desktop') {
    const boutique = await goTo(page, 'pikine', i => i.id.endsWith(':city:boutique'));
    if (boutique && await runVerb(page, 'Pain et lait')) {
      const ok = await waitToast(page, /^Toi : « Ñaata la \? » \(c’est combien \?\) · Le boutiquier : « 400 F\./);
      check(`${label}: bread and milk at the Boutique Diallo: « Ñaata la ? » — « 400 F. »`, ok, await toast(page));
      await shot(page, `${label}-boutique-price`);
      await page.waitForFunction(() => !window.__dakar.activity(), null, T).catch(() => {});
    } else check(`${label}: Boutique Diallo found`, false);
  }

  // 3. The cast: Mamadou's greeting (desktop), Mame Diarra's sheet with her Wolof (phone), Réglages › Langue (phone).
  if (label === 'desktop') {
    // Tonton Ibou's welcome (first story beat): « Dalal ak jàmm » and a proverb.
    await d(page, () => { window.__dakar.setHour(10); window.__dakar.teleport('pikine'); });
    await page.waitForFunction(() => { const w = window.__dakar.npcWhere('ibou'); return w && w.here && !w.walking; }, null, T).catch(() => {});
    await d(page, () => window.__dakar.openNpc('ibou'));
    const beat = page.locator('#modal .item', { hasText: 'Bienvenue au quartier' }).first();
    if (await beat.count()) {
      await beat.click(); await page.waitForTimeout(400);
      const text = await d(page, () => document.querySelector('#modal p')?.textContent ?? '');
      check(`${label}: Ibou's welcome speaks Wolof with glosses`, /Dalal ak jàmm \(bienvenue\).*« Nit nitay garabam » \(l’homme est le remède de l’homme\)/.test(text), text);
      await page.waitForTimeout(800); await page.screenshot({ path: `${out}/desktop-ibou-welcome.png` });
    } else check(`${label}: Ibou's welcome beat is offered`, false);
    await d(page, () => document.querySelector('#modal .item.close')?.click());
    await idle(page);
    await page.waitForFunction(() => { const w = window.__dakar.npcWhere('mamadou'); return w && w.here; }, null, T).catch(() => {});
    const w = await d(page, () => window.__dakar.npcWhere('mamadou'));
    if (w) {
      await d(page, w => { const g = window.__dakar, px = w.x + 3.5, pz = w.z + 4.6; g.place(px, pz, Math.atan2(w.x - px, w.z - pz)); g.cam([w.x + 2.4, 1.8, w.z + 3.4], [w.x + 1.3, 1.1, w.z - 0.9]); }, w);
      await page.waitForTimeout(1500);
      await d(page, () => window.__dakar.openNpc('mamadou'));
      await page.waitForTimeout(400);
      const sub = await d(page, () => document.querySelector('#modal p')?.textContent ?? '');
      check(`${label}: Mamadou greets in Wolof`, /Dalal ak jàmm \(bienvenue\)|Salaam aleekum|Na nga def \?/.test(sub), sub);
      await page.screenshot({ path: `${out}/desktop-mamadou-greeting.png` });
      await d(page, () => { document.querySelector('#modal .item.close')?.click(); window.__dakar.cam(null); });
    }
  } else {
    await d(page, () => { const g = window.__dakar; g.setHour(13); g.rel.change('player', 'mame', 12); g.rel.change('player', 'ibou', 8); g.people(); });
    await page.locator('#modal .item', { hasText: /^Mame Diarra/ }).first().click();
    await page.waitForTimeout(300);
    await d(page, () => { const p = document.querySelector('#modal .panel'); p.scrollTop = p.scrollHeight; });
    const sheet = await d(page, () => document.querySelector('#modal .panel').textContent);
    check(`${label}: a sheet shows how the character speaks, with glosses`, /Sa façon de parler.*« Kaay lekk » \(viens manger\)/.test(sheet), sheet.slice(-140));
    await page.waitForTimeout(300); await page.screenshot({ path: `${out}/phone-mame-sheet.png` });
    await page.locator('#modal .item.close').tap();
    await page.waitForFunction(() => window.__dakar.pos().mode === 'play', null, T).catch(() => {});
    await d(page, () => window.__dakar.phone('reglages'));
    await page.waitForFunction(() => window.__dakar.phoneInfo().open, null, T);
    await page.waitForTimeout(600);
    await d(page, () => { const s = document.querySelector('#phone .ph-screen'); const h = [...s.querySelectorAll('h3')].find(x => x.textContent === 'Langue'); s.scrollTop = h.offsetTop - 12; });
    const lang = await d(page, () => document.querySelector('#phone [data-act="gloss"]')?.textContent ?? '');
    check(`${label}: Réglages › Langue has the gloss switch`, /Traduction des expressions wolof/.test(lang), lang);
    await page.waitForTimeout(800); await page.screenshot({ path: `${out}/phone-reglages-langue.png` });
    await d(page, () => window.__dakar.phoneClose());
  }
  check(`${label}: no page errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// 4. Chat (online build): the quick phrases follow the place and the hour, and arrive as written on the other screen.
if (chatUrl && only !== 'solo') {
  const sides = [];
  for (const [i, [label, viewport, touch]] of VIEWS.entries()) {
    const ctx = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
    await ctx.addInitScript(i => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.clear(); localStorage.setItem('dakarrek.quality', 'low'); localStorage.setItem('dakarrek.presence.profile', JSON.stringify({ name: i ? 'Moussa' : 'Awa', look: i })); } }, i);
    const page = await ctx.newPage(); page.setDefaultTimeout(90000);
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${chatUrl}?debug${touch ? '&touch' : ''}`);
    await page.waitForFunction(() => window.__dakar?.presence().status === 'online' && window.__dakarChat && window.__dakar.wolof, null, { timeout: 120000 });
    sides.push({ label, page, ctx, errors });
  }
  const [desk, phone] = sides;
  for (const s of sides) await s.page.waitForFunction(() => window.__dakar.presence().peers.length === 1, null, { timeout: 120000 });
  for (const s of sides) await s.page.evaluate(() => window.__dakarChat.bubbleSeconds(60));
  await desk.page.evaluate(() => { window.__dakar.setHour(9); window.__dakar.place(-6, -30, 0); });
  await phone.page.evaluate(() => { window.__dakar.setHour(9); window.__dakar.place(-7, -25, Math.PI); });
  await desk.page.waitForFunction(() => window.__dakar.presence().visible === 1, null, { timeout: 60000 }).catch(() => {});
  for (const s of sides) { if (!(await s.page.evaluate(() => window.__dakarChat.state().open))) await s.page.click('#chatBtn'); await s.page.click('.chat-tabs button[data-tab="near"]'); }
  await phone.page.waitForFunction(() => window.__dakarChat.state().phrases.length > 0, null, T);
  const st = await phone.page.evaluate(() => window.__dakarChat.state());
  check('chat: street quick phrases at 9 h start with « Salaam aleekum » and « Na nga fanaane ? »', st.place === 'street' && st.phrases[0] === 'Salaam aleekum' && st.phrases[1] === 'Na nga fanaane ?' && st.phrases.includes('Ba ci kanam'), st.phrases.join(' | '));
  const tip = await phone.page.evaluate(() => document.querySelector('.chat-phrases button:nth-child(2)')?.title);
  check('chat: the French gloss is the tooltip', tip === 'bien dormi ?', tip);
  await phone.page.locator('.chat-phrases button', { hasText: 'Na nga fanaane ?' }).click();
  await desk.page.waitForFunction(() => (window.__dakarChat.state().history.near ?? []).some(e => !e.mine && e.text === 'Na nga fanaane ?'), null, { timeout: 30000 }).then(() => check('chat: a quick phrase arrives as written on the other screen', true), () => check('chat: a quick phrase arrives as written on the other screen', false));
  await desk.page.locator('.chat-phrases button', { hasText: 'Jërëjëf' }).click();
  await phone.page.waitForFunction(() => (window.__dakarChat.state().history.near ?? []).some(e => !e.mine && e.text === 'Jërëjëf'), null, { timeout: 30000 }).catch(() => {});
  await phone.page.waitForTimeout(800); await phone.page.screenshot({ path: `${out}/phone-chat-phrases.png` });
  await desk.page.waitForTimeout(800); await desk.page.screenshot({ path: `${out}/desktop-chat-phrases.png` });
  // The same panel inside a gargote: « Neex na », « Dama suur ».
  for (const s of sides) await s.page.evaluate(() => { window.__dakar.setHour(13); window.__dakar.enter('gargote'); });
  await phone.page.waitForFunction(() => window.__dakarChat.state().place === 'food', null, { timeout: 30000 }).catch(() => {});
  const food = await phone.page.evaluate(() => window.__dakarChat.state());
  check('chat: inside a gargote the phrases offer « Neex na » and « Dama suur », greeting of the afternoon', food.place === 'food' && food.phrases.includes('Neex na') && food.phrases.includes('Dama suur') && food.phrases.includes('Na nga def ?'), food.phrases.join(' | '));
  if (!(await phone.page.evaluate(() => window.__dakarChat.state().open))) await phone.page.click('#chatBtn');
  await phone.page.waitForTimeout(1200); await phone.page.screenshot({ path: `${out}/phone-chat-gargote.png` });
  const tools = await phone.page.evaluate(() => !!document.querySelector('.chat-people, .chat-peer'));
  check('chat: block / mute / report tools are still there (people list)', tools);
  for (const s of sides) { check(`chat ${s.label}: no page errors`, s.errors.length === 0, s.errors.join(' | ')); await s.ctx.close(); }
}

await browser.close();
fs.writeFileSync(`${out}/results-${only}.json`, JSON.stringify({ when: new Date().toISOString(), base, chat: chatUrl, results }, null, 2));
console.log(`\n${results.length - failed}/${results.length} Wolof checks passed`);
process.exit(failed ? 1 : 0);
