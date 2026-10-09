// NPC life acceptance: routines by hour (places and poses), talking anywhere, regulars, the Peul trader beat,
// the Maïga meal and the grand-place attaya, the People list, sidewalk paths, first-session flow.
// Usage: node scripts/check-npc.mjs [baseUrl=http://localhost:4205/] [outDir=docs/screenshots/npc]
// Serve a build first: npm run build && npx vite preview --port 4205
// SwiftShader renders ~3 fps with dt clamped to 0.1 s: every wait is on game state, never a fixed delay alone.
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:4205/';
const out = process.argv[3] ?? 'docs/screenshots/npc';
fs.mkdirSync(out, { recursive: true });
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok: !!ok, extra }); console.log(ok ? 'PASS' : 'FAIL', name, extra); };
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const T = { timeout: 90000 };

async function open(label, viewport, touch) {
  const ctx = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !(m.location().url.endsWith('/assets/car_rapide.glb') && m.text().includes('404'))) errors.push(m.text()); });
  await page.goto(`${base}?debug${touch ? '&touch' : ''}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__dakar?.body(), null, T);
  return { ctx, page, errors, label };
}
const d = (page, fn, arg) => page.evaluate(fn, arg);
const closeModal = page => d(page, () => document.querySelector('#modal')?.classList.remove('on'));
const modal = page => d(page, () => ({ open: document.querySelector('#modal').classList.contains('on'), title: document.querySelector('#modal h2')?.textContent ?? '', sub: document.querySelector('#modal p')?.textContent ?? '', items: [...document.querySelectorAll('#modal .item')].map(b => b.textContent) }));
const clickItem = async (page, re) => { await page.locator('#modal .item', { hasText: re }).first().click(); await page.waitForTimeout(250); };
/** Teleport into the NPC's hub at a given hour, with the player far away so the NPC finishes walking on its own. */
async function goHour(page, hub, hour, id, far) {
  await d(page, ([hub, hour, far]) => { const g = window.__dakar; g.cam(null); g.setHour(hour); if (g.pos().hub !== hub) g.teleport(hub, far[0], far[1], 0); else g.place(far[0], far[1], 0); }, [hub, hour, far]);
  await page.waitForFunction(([id, hour]) => { const w = window.__dakar.npcWhere(id); const s = window.__dakar.npcSlots(hour).find(x => x.id === id); return w && w.here && !w.walking && (w.key === `${s.from}-${s.to}` || w.key.startsWith('wait')); }, [id, hour], T);
  return d(page, id => window.__dakar.npcWhere(id), id);
}
/**
 * Stand next to the NPC, facing them, at the first free offset where they are what the action button runs: act() runs
 * the focused target of the contextual system (a seat, a counter or a passer-by next to them could be focused instead).
 */
async function standBy(page, id, name) {
  for (const [ox, oz] of [[0, 2.1], [0, -2.1], [2.1, 0], [-2.1, 0], [1.6, 1.6], [-1.6, 1.6], [1.6, -1.6], [-1.6, -1.6], [0, 1.4], [0, -1.4], [1.4, 0], [-1.4, 0]]) {
    const w = await d(page, id => window.__dakar.npcWhere(id), id);
    await d(page, ([x, z, yaw]) => window.__dakar.place(x, z, yaw), [w.x + ox, w.z + oz, Math.atan2(-ox, -oz)]);
    try {
      await page.waitForFunction(([n, id]) => (window.__dakar.nearestInteractable() ?? '').startsWith(n) && window.__dakar.focus()?.id === 'npc:' + id, [name, id], { timeout: 15000 });
      return true;
    } catch { /* next offset */ }
  }
  return false;
}
/** Wait until the action button runs the place whose id starts with `prefix` (not a seat or a person next to it). */
const focusOn = (page, prefix) => page.waitForFunction(p => (window.__dakar.focus()?.id ?? '').startsWith(p), prefix, T);
const frame = (page, w, dx, h, dz) => d(page, ([w, dx, h, dz]) => window.__dakar.cam([w.x + dx, h, w.z + dz], [w.x, 0.85, w.z]), [w, dx, h, dz]);
const settleClip = (page, id, clip) => page.waitForFunction(([id, clip]) => window.__dakar.npcWhere(id)?.clip === clip, [id, clip], T).then(() => true, () => false);

// ------------------------------------------------------------------ desktop: the full scenario
{
  const { ctx, page, errors } = await open('desktop', { width: 1280, height: 720 }, false);
  await d(page, () => localStorage.clear()); await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__dakar?.body(), null, T);
  await d(page, () => { window.__dakar.setHour(10); window.__dakar.teleport('pikine'); });
  check('fresh save: first suggested beat is Ibou', (await d(page, () => window.__dakar.suggestion())) === 'ibou_welcome');
  const wait = await d(page, () => window.__dakar.npcWhere('ibou'));
  check('fresh save: Ibou waits in front of the room', wait.key === 'wait:ibou_welcome' && Math.hypot(wait.x + 36, wait.z + 54.5) < 0.1, `${wait.x},${wait.z}`);
  await d(page, () => window.__dakar.openNpc('ibou'));
  const m0 = await modal(page);
  check('openNpc(ibou): story beat first, greeting in the subtitle', /Bienvenue au quartier/.test(m0.items[0]) && /Te voilà enfin/.test(m0.sub), `${m0.items[0]} | ${m0.sub}`);
  await page.screenshot({ path: `${out}/desktop-ibou-first-menu.png` });
  await page.click('.item >> nth=0'); await page.click('.item >> nth=0'); await page.click('.item >> nth=0');
  check('beat choice through the UI sets reco_modou', (await d(page, () => window.__dakar.flags())).includes('reco_modou'));
  await closeModal(page);

  // Same NPC, four hours, four places and poses; talk to him where he is.
  const far = [0, -120];
  const want = { 8: ['café Touba', 'Sit'], 12: ['Boutique Diallo', 'Talk'], 14.5: ['Maïga', 'Sit'], 20: ['grand-place', 'Sit'] };
  const seen = [];
  for (const h of [8, 12, 14.5, 20]) {
    const w = await goHour(page, 'pikine', h, 'ibou', far);
    const near = await standBy(page, 'ibou', 'Tonton Ibou');
    const clipOk = await settleClip(page, 'ibou', want[h][1]);
    const w2 = await d(page, () => window.__dakar.npcWhere('ibou'));
    seen.push(`${w2.x},${w2.z}`);
    check(`ibou at ${h}h: ${w.place}`, w.place.includes(want[h][0]) && clipOk && near, `${w2.x},${w2.z} clip ${w2.clip} seated ${w2.sit}`);
    await d(page, () => window.__dakar.act());
    const m = await modal(page);
    check(`ibou at ${h}h: the player can talk to him there`, m.open && m.title.startsWith('Tonton Ibou'), m.title);
    await closeModal(page);
    await frame(page, w2, h === 12 ? -2.6 : 2.4, 1.7, h === 8 ? -2.6 : h === 20 ? -2.4 : 2.6);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${out}/desktop-ibou-${String(h).replace('.', 'h')}.png` });
    await d(page, () => window.__dakar.cam(null));
  }
  check('ibou: four different places at 8h, 12h, 14h30, 20h', new Set(seen).size === 4, seen.join(' | '));
  // He walks between places on the sidewalk when the player is around.
  await goHour(page, 'pikine', 8, 'ibou', far);
  const w8 = await d(page, () => window.__dakar.npcWhere('ibou'));
  await d(page, ([x, z]) => { const g = window.__dakar; g.place(x + 7, z - 3, 0); g.setHour(9.6); }, [w8.x, w8.z]);
  await page.waitForFunction(() => { const w = window.__dakar.npcWhere('ibou'); return w.walking && w.clip === 'Walk'; }, null, T).catch(() => {});
  const walking = await d(page, () => window.__dakar.npcWhere('ibou'));
  check('ibou walks to his next place when the hour changes', walking.walking && walking.clip === 'Walk' && walking.left > 20, `${walking.clip}, ${walking.left} m left`);
  await page.waitForFunction(l => window.__dakar.npcWhere('ibou').left < l - 5, walking.left, T).catch(() => {});
  const w6 = await d(page, () => window.__dakar.npcWhere('ibou'));
  await frame(page, w6, 3.5, 2.2, 3.5); await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/desktop-ibou-walking.png` });
  const it = await d(page, () => { const w = window.__dakar.npcWhere('ibou'); return { w, it: window.__dakar.interactables().find(i => i.id === 'npc:ibou') }; });
  check('his interactable moves with him', Math.hypot(it.it.x - it.w.x, it.it.z - it.w.z) < 0.6, `${it.it.x.toFixed(1)},${it.it.z.toFixed(1)}`);
  await d(page, () => window.__dakar.cam(null));

  // A regular: one meal at the gargote, two visits to Mame at different hours.
  await goHour(page, 'pikine', 12, 'mame', far);
  const g = await d(page, () => window.__dakar.interactables().find(i => i.id.startsWith('pikine:gargote')));
  await d(page, ([x, z]) => { const s = window.__dakar.state; s.data.wallet += 5000; window.__dakar.place(x, z + 0.6, Math.PI); }, [g.x, g.z]);
  await page.waitForFunction(() => /Gargote/.test(window.__dakar.nearestInteractable() ?? ''), null, T);
  await focusOn(page, 'pikine:gargote');
  await d(page, () => window.__dakar.act());
  await clickItem(page, /^Ceebu jën/);
  await page.waitForFunction(() => window.__dakar.pos().mode === 'play' && (window.__dakar.state.data.counters.served_mame ?? 0) >= 1, null, T);
  for (const h of [12, 13]) {
    await d(page, h => window.__dakar.setHour(h), h);
    await d(page, () => window.__dakar.openNpc('mame'));
    if (h === 12) { const m = await modal(page); check('Mame before: no regular greeting', !/habitué/.test(m.sub), m.sub); }
    await closeModal(page);
  }
  await d(page, () => window.__dakar.openNpc('mame'));
  const mReg = await modal(page);
  const flags = await d(page, () => window.__dakar.flags());
  check('after 3 visits/purchases Mame greets a regular', flags.includes('regular_mame') && /habitué/.test(mReg.sub), mReg.sub);
  check('a regular can be introduced to someone (Mame → Mamadou)', mReg.items.some(t => /Être présenté à Mamadou Diallo/.test(t)), mReg.items.join(' / '));
  await page.screenshot({ path: `${out}/desktop-mame-regular.png` });
  await clickItem(page, /Être présenté à Mamadou/);
  check('introduction unlocks the Peul trader’s beat', (await d(page, () => window.__dakar.flags())).includes('intro_mamadou'));
  await closeModal(page);
  await d(page, ([x, z]) => window.__dakar.place(x, z + 0.6, Math.PI), [g.x, g.z]);
  await page.waitForFunction(() => /Gargote/.test(window.__dakar.nearestInteractable() ?? ''), null, T);
  await focusOn(page, 'pikine:gargote');
  await d(page, () => window.__dakar.act());
  check('regular favour at her place (perk visible)', (await modal(page)).items.some(t => /plat de l’habitué/.test(t)));
  await closeModal(page);

  // Attaya on the grand-place: Ibou and Mamadou at 17h30; news unlocks an opportunity.
  await goHour(page, 'pikine', 17.5, 'mamadou', far);
  const wa = await goHour(page, 'pikine', 17.5, 'ibou', far);
  await standBy(page, 'ibou', 'Tonton Ibou');
  await settleClip(page, 'ibou', 'Sit');
  await d(page, () => window.__dakar.act());
  const ma = await modal(page);
  check('attaya situation offered by Ibou on the grand-place', ma.items.some(t => /attaya de la grand-place/.test(t)), ma.items.join(' / '));
  await clickItem(page, /attaya de la grand-place/);
  const mt = await modal(page);
  check('attaya text names Mamadou (present now)', /Mamadou/.test(mt.sub), mt.sub);
  await frame(page, wa, 2.4, 1.6, 2.6); await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/desktop-attaya-situation.png` });
  await clickItem(page, /Écouter les nouvelles/);
  check('attaya choice gives information (info_livraison)', (await d(page, () => window.__dakar.flags())).includes('info_livraison'), (await modal(page)).sub);
  await closeModal(page); await d(page, () => window.__dakar.cam(null));

  // The Peul trader's beat at the Boutique Diallo.
  const wm = await goHour(page, 'pikine', 10, 'mamadou', far);
  await standBy(page, 'mamadou', 'Mamadou Diallo');
  await d(page, () => window.__dakar.act());
  const mm = await modal(page);
  check('Mamadou (Boutique Diallo) offers his beat', /Le riz de Mame Diarra/.test(mm.items[0] ?? ''), `${mm.items[0]} | ${mm.sub}`);
  await clickItem(page, /Le riz de Mame Diarra/);
  await frame(page, wm, 2.5, 1.9, 4); await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/desktop-mamadou-beat.png` });
  const wal0 = await d(page, () => window.__dakar.state.wallet);
  await clickItem(page, /Je livre les sacs/);
  const after = await d(page, () => ({ w: window.__dakar.state.wallet, f: window.__dakar.flags(), rel: window.__dakar.rel.level('mamadou') }));
  check('Peul trader beat: delivery pays, trust and relation', after.w === wal0 + 1500 && after.f.includes('mamadou_trust') && after.rel >= 12, `${after.w - wal0} F, rel ${after.rel}`);
  await closeModal(page); await d(page, () => window.__dakar.cam(null));
  await d(page, () => window.__dakar.openNpc('mamadou'));
  const mm2 = await modal(page);
  check('Mamadou now introduces his niece Kadiatou (Fann)', mm2.items.some(t => /Être présenté à Kadiatou Diallo/.test(t)), mm2.items.join(' / '));
  await clickItem(page, /Être présenté à Kadiatou/);
  await closeModal(page);

  // Shared meal at the Maïga (13h–15h): pay for Babacar → he remembers, a favour later.
  const wb = await goHour(page, 'pikine', 14, 'babacar', far);
  await goHour(page, 'pikine', 14, 'modou', far);
  await standBy(page, 'babacar', 'Babacar');
  await settleClip(page, 'babacar', 'Sit');
  await d(page, () => window.__dakar.act());
  await clickItem(page, /Repas partagé à la Maïga/);
  const ms = await modal(page);
  check('Maïga situation: text varies with who is there (Modou)', /Modou/.test(ms.sub) && ms.items.some(t => /Payer son plat/.test(t)), ms.sub);
  await frame(page, wb, -0.5, 1.5, 3.2); await page.waitForTimeout(1000);
  await page.screenshot({ path: `${out}/desktop-maiga-meal.png` });
  const w1 = await d(page, () => window.__dakar.state.wallet);
  await clickItem(page, /Payer son plat/);
  const res = await d(page, () => ({ w: window.__dakar.state.wallet, f: window.__dakar.flags(), rel: window.__dakar.rel.level('babacar') }));
  check('Maïga situation: paying costs 1 000 F, Babacar remembers', res.w === w1 - 1000 && res.f.includes('babacar_doit') && res.rel >= 10, `rel ${res.rel}`);
  await closeModal(page); await d(page, () => window.__dakar.cam(null));
  await d(page, () => window.__dakar.act());
  const mb = await modal(page);
  check('Maïga situation: not twice the same day; Babacar now owes a favour', !mb.items.some(t => /Repas partagé/.test(t)) && mb.items.some(t => /rend la pareille/.test(t)) && /repas de la Maïga/.test(mb.sub), mb.sub);
  await clickItem(page, /rend la pareille/);
  check('the favour is a consequence (Babacar recommends you to Ablaye)', (await d(page, () => window.__dakar.flags())).includes('reco_ablaye'));
  await closeModal(page);

  // People app (phoneHooks.openPeople) and debug hooks.
  await d(page, () => window.__dakar.people());
  const mp = await modal(page);
  check('People list shows known neighbours with where they are now', mp.title === 'Les gens du quartier' && mp.items.length >= 5 && mp.items.some(t => /Mamadou Diallo/.test(t)), mp.items.slice(0, 4).join(' / '));
  await page.screenshot({ path: `${out}/desktop-people.png` });
  await clickItem(page, /^Mame Diarra/);
  const sh = await modal(page);
  const shHtml = await d(page, () => document.querySelector('#modal .panel').textContent);
  check('People sheet: job, place now, relation, last memory, Wolof expressions', /Dernier souvenir/.test(shHtml) && /Maintenant/.test(shHtml) && /Relation/.test(shHtml) && /Sa façon de parler.*« Kaay lekk » \(viens manger\)/.test(shHtml), sh.title);
  await page.screenshot({ path: `${out}/desktop-people-sheet.png` });
  await closeModal(page);
  const sheet = await d(page, () => window.__dakar.npcSheet('mamadou'));
  check('npcSheet(mamadou): sheet with Wolof expressions, routine and memory', sheet?.expressions?.length >= 2 && sheet.expressions.every(e => e.wo && e.fr) && sheet.routine.length >= 5 && !!sheet.lastMemory, `${sheet?.expressions?.map(e => e.wo).join(' | ')} · ${sheet?.lastMemory}`);

  // Kadiatou (Peul student) at Fann, and the beach training in the evening.
  const wk = await goHour(page, 'corniche', 15, 'kadiatou', [0, -100]);
  check('Kadiatou revises on a bench at Fann at 15h', /place des étudiants/.test(wk.place) && await settleClip(page, 'kadiatou', 'Sit'), wk.place);
  await standBy(page, 'kadiatou', 'Kadiatou Diallo');
  await d(page, () => window.__dakar.act());
  check('Kadiatou’s beat follows her uncle’s introduction', /L’enquête de Kadiatou/.test((await modal(page)).items[0] ?? ''));
  await closeModal(page);
  const wbch = await goHour(page, 'corniche', 18.5, 'moussa', [0, -100]);
  await goHour(page, 'corniche', 18.5, 'kadiatou', [0, -100]);
  check('collective training on the Soumbédioune beach at 18h30', /plage/.test(wbch.place), wbch.place);
  await frame(page, wbch, 6, 3, 5); await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/desktop-beach-training.png` });
  await d(page, () => window.__dakar.cam(null));
  // Ndeye (Sérère couturière) at the Atelier Ndeye.
  const wn = await goHour(page, 'plateau', 10, 'ndeye', [0, -120]);
  await standBy(page, 'ndeye', 'Ndeye Sène');
  await d(page, () => window.__dakar.act());
  check('Ndeye (Atelier Ndeye, Médina) offers her beat', /La commande de la fête/.test((await modal(page)).items[0] ?? ''));
  await closeModal(page);
  await frame(page, wn, 2.5, 1.9, 4); await page.waitForTimeout(1000);
  await page.screenshot({ path: `${out}/desktop-ndeye-atelier.png` });
  await d(page, () => window.__dakar.cam(null));

  // Every routine change in every hub has a sidewalk path clear of solid objects.
  for (const hub of ['pikine', 'plateau', 'corniche', 'almadies']) {
    await d(page, h => window.__dakar.teleport(h), hub);
    const a = await d(page, () => window.__dakar.npcAudit());
    check(`${hub}: routine paths clear of obstacles`, a.length > 0 && a.every(x => x.ok), `${a.length} transitions, ${a.filter(x => !x.ok).map(x => `${x.id}:${x.from}->${x.to}`).join(', ')}`);
  }
  check('desktop: no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// ------------------------------------------------------------------ phone 390×844
{
  const { ctx, page, errors } = await open('phone', { width: 390, height: 844 }, true);
  await d(page, () => localStorage.clear()); await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__dakar?.body(), null, T);
  await d(page, () => { window.__dakar.setHour(10); window.__dakar.teleport('pikine'); });
  check('phone: first suggested beat is Ibou', (await d(page, () => window.__dakar.suggestion())) === 'ibou_welcome');
  await d(page, () => window.__dakar.openNpc('ibou'));
  await page.screenshot({ path: `${out}/phone-ibou-first-menu.png` });
  await page.click('.item >> nth=0'); await page.click('.item >> nth=0'); await page.click('.item >> nth=0');
  check('phone: beat choice sets reco_modou', (await d(page, () => window.__dakar.flags())).includes('reco_modou'));
  await closeModal(page);
  for (const [h, clip] of [[14.5, 'Sit'], [20, 'Sit']]) {
    const w = await goHour(page, 'pikine', h, 'ibou', [0, -120]);
    await standBy(page, 'ibou', 'Tonton Ibou');
    check(`phone: ibou at ${h}h (${w.place})`, await settleClip(page, 'ibou', clip));
    await frame(page, w, 2.4, 1.7, h === 20 ? -2.4 : 2.6); await page.waitForTimeout(1200);
    await page.screenshot({ path: `${out}/phone-ibou-${String(h).replace('.', 'h')}.png` });
    await d(page, () => window.__dakar.cam(null));
  }
  await d(page, () => window.__dakar.people());
  await page.screenshot({ path: `${out}/phone-people.png` });
  check('phone: People list opens', (await modal(page)).title === 'Les gens du quartier');
  await closeModal(page);
  check('phone: no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

await browser.close();
fs.writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 1));
console.log(`${results.filter(r => r.ok).length}/${results.length} checks pass`);
process.exit(results.every(r => r.ok) ? 0 : 1);
