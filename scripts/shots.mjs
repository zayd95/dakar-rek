// Headless verification + screenshots. Usage: node scripts/shots.mjs <baseUrl> <outDir>
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:4173/';
const out = process.argv[3] ?? 'shots';
fs.mkdirSync(out, { recursive: true });
const hubs = ['plateau', 'corniche', 'almadies', 'pikine'];
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok, extra }); console.log(ok ? 'PASS' : 'FAIL', name, extra); };

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });

for (const [label, vp, touch] of [['desktop', { width: 1280, height: 720 }, false], ['phone', { width: 390, height: 844 }, true]]) {
  const ctx = await browser.newContext({ viewport: vp, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const url = m.location().url;
    // The optional Blender vehicle is absent until its export lands; the game uses its procedural car.
    if (url.endsWith('/assets/car_rapide.glb') && m.text().includes('404')) return;
    errors.push(`${m.text()} ${url}`);
  });
  await page.goto(`${base}?debug${touch ? '&touch' : ''}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__dakar, null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  for (const h of hubs) for (const hour of [13, 21]) {
    await page.evaluate(([hub, hr]) => { window.__dakar.setHour(hr); window.__dakar.teleport(hub); }, [h, hour]);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${out}/${label}-${h}-${hour === 13 ? 'day' : 'night'}.png` });
    const p = await page.evaluate(() => ({ pos: window.__dakar.pos(), dc: window.__dakar.drawCalls(), tris: window.__dakar.tris() }));
    check(`${label}: ${h} ${hour}h loads`, p.pos.hub === h, `draw calls ${p.dc}, tris ${p.tris}`);
  }
  check(`${label}: no page errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// Gameplay checks (desktop)
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  await page.goto(`${base}?debug`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__dakar, null, { timeout: 30000 });
  await page.waitForTimeout(1000);
  await page.evaluate(() => { window.__dakar.setHour(13); window.__dakar.teleport('pikine'); });
  await page.waitForTimeout(500);
  const a = await page.evaluate(() => window.__dakar.pos());
  await page.keyboard.down('KeyW'); await page.waitForTimeout(3000); await page.keyboard.up('KeyW');
  const b = await page.evaluate(() => window.__dakar.pos());
  check('movement: W moves the character', Math.hypot(b.x - a.x, b.z - a.z) > 1, `moved ${Math.hypot(b.x - a.x, b.z - a.z).toFixed(1)}`);
  // walk into a wall for a long time: must stay inside the world and not tunnel
  await page.keyboard.down('KeyW'); await page.waitForTimeout(8000); await page.keyboard.up('KeyW');
  const c = await page.evaluate(() => window.__dakar.pos());
  check('collision: position stays finite', Number.isFinite(c.x) && Number.isFinite(c.z), `${c.x.toFixed(0)},${c.z.toFixed(0)}`);
  // interaction
  const items = await page.evaluate(() => window.__dakar.interactables());
  const ibou = items.find(i => /ibou/i.test(i.name)) ?? items[0];
  await page.evaluate(([x, z]) => window.__dakar.teleport('pikine', x, z + 2, 0), [ibou.x, ibou.z]);
  await page.waitForTimeout(600);
  const near = await page.evaluate(() => window.__dakar.nearestInteractable());
  check('interaction: nearby place detected', !!near, String(near));
  await page.screenshot({ path: `${out}/desktop-interaction-prompt.png` });
  await page.evaluate(() => window.__dakar.act());
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/desktop-action-menu.png` });
  // interiors: enter the starter room, walk into a wall, save while inside, exit
  await page.evaluate(() => { window.__dakar.setHour(13); window.__dakar.enter('home'); });
  await page.waitForFunction(() => window.__dakar.pos().x > 900, null, { timeout: 8000 }).catch(() => {});
  const inRoom = await page.evaluate(() => window.__dakar.pos());
  check('interior: enter starter room', inRoom.x > 900, `${inRoom.x.toFixed(1)},${inRoom.z.toFixed(1)}`);
  await page.keyboard.down('KeyW'); await page.waitForTimeout(4000); await page.keyboard.up('KeyW');
  const wallPos = await page.evaluate(() => window.__dakar.pos());
  check('interior: walls hold the player inside', wallPos.x > 996 && wallPos.x < 1004 && Math.abs(wallPos.z) < 3, `${wallPos.x.toFixed(1)},${wallPos.z.toFixed(1)}`);
  await page.screenshot({ path: `${out}/desktop-interior-home.png` });
  await page.evaluate(() => { window.__dakar.state.data.wallet += 0; });
  await page.evaluate(() => window.__dakar.exit());
  await page.waitForFunction(() => window.__dakar.pos().x < 900, null, { timeout: 8000 }).catch(() => {});
  const outPos = await page.evaluate(() => window.__dakar.pos());
  check('interior: exit back to the street', outPos.x < 900 && outPos.hub === 'pikine', `${outPos.x.toFixed(1)},${outPos.z.toFixed(1)}`);
  // dibiterie: walk in from the street to the counter
  await page.evaluate(() => { const d = window.__dakar; d.teleport('pikine'); d.place(-18, -56, 0); });
  await page.keyboard.down('KeyW'); for (let i = 0; i < 40; i++) { await page.waitForTimeout(300); if ((await page.evaluate(() => window.__dakar.pos())).z > -50.5) break; } await page.keyboard.up('KeyW');
  const dib = await page.evaluate(() => window.__dakar.pos());
  check('dibiterie: walk in from the street', /Dibiterie/.test(dib.near ?? ''), `${dib.z.toFixed(1)} ${dib.near}`);
  // Maïga: enter and find the counter
  await page.evaluate(() => { const d = window.__dakar; d.teleport('pikine'); d.enter('maiga'); });
  await page.waitForFunction(() => window.__dakar.pos().x > 900, null, { timeout: 8000 }).catch(() => {});
  const mg = await page.evaluate(() => window.__dakar.pos());
  check('maiga: enter the narrow room', mg.x > 900, `${mg.x.toFixed(1)} ${mg.near}`);
  await page.evaluate(() => window.__dakar.exit());
  await page.waitForFunction(() => window.__dakar.pos().x < 900, null, { timeout: 8000 }).catch(() => {});
  // làmb bout against a local opponent: grabbing and pushing in the empoignade wins, the result is recorded
  await page.evaluate(() => { const d = window.__dakar; d.teleport('pikine'); d.duel(); });
  await page.waitForFunction(() => window.__dakar.duelInfo()?.phase === 'fight', null, { timeout: 120000 }).catch(() => {});
  for (let i = 0; i < 400; i++) { const inf = await page.evaluate(() => window.__dakar.duelInfo()); if (!inf || inf.phase === 'fall' || inf.phase === 'result') break; await page.evaluate(() => window.__dakar.duelGrab()); await page.waitForTimeout(100); }
  const bout = await page.evaluate(() => window.__dakar.duelInfo());
  await page.waitForFunction(() => window.__dakar.duelInfo() === null, null, { timeout: 120000 }).catch(() => {});
  const wins = await page.evaluate(() => ({ v: window.__dakar.state.data.counters.victoires ?? 0, mode: window.__dakar.pos().mode }));
  check('lamb: controlled bout, grab and empoignade win', bout?.winner === 'player' && wins.v >= 1 && wins.mode === 'play', `${JSON.stringify(bout)} wins ${wins.v} ${wins.mode}`);
  // monument stair: standing half-way up puts the player well above the street
  await page.evaluate(() => { const d = window.__dakar; d.teleport('corniche'); d.place(-44, -90, Math.PI / 2); });
  await page.waitForTimeout(400);
  const st = await page.evaluate(() => window.__dakar.pos());
  check('monument: stair height', st.y > 4 && st.y < 9, st.y.toFixed(2));
  await page.evaluate(() => window.__dakar.teleport('pikine'));
  // travel
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__dakar.travelTo('corniche'));
  // wait for the arrival (fade + hub build take ~3 s under SwiftShader); still fails if the player never arrives
  await page.waitForFunction(() => window.__dakar.pos().hub === 'corniche', null, { timeout: 15000 }).catch(() => {});
  const t = await page.evaluate(() => window.__dakar.pos());
  check('travel: pikine -> corniche', t.hub === 'corniche', t.hub);
  // save + reload
  await page.evaluate(() => { window.__dakar.state.data.wallet += 1; });
  await page.waitForTimeout(9000);
  const saved = await page.evaluate(() => localStorage.getItem('dakarrek.guest.save'));
  check('save: written to device storage', !!saved && JSON.parse(saved).schemaVersion === 2, saved ? `${saved.length} bytes` : 'none');
  const walletBefore = await page.evaluate(() => window.__dakar.state.data.wallet);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__dakar, null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  const after = await page.evaluate(() => ({ w: window.__dakar.state.data.wallet, hub: window.__dakar.pos().hub }));
  check('save: restored after reload', after.w === walletBefore && after.hub === 'corniche', `wallet ${after.w}, hub ${after.hub}`);
  await ctx.close();
}

// Neighbourhood relationships and làmb scenes (desktop + phone)
for (const [label, vp, touch] of [['desktop', { width: 1280, height: 720 }, false], ['phone', { width: 390, height: 844 }, true]]) {
  const ctx = await browser.newContext({ viewport: vp, hasTouch: touch, isMobile: touch });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`${base}?debug${touch ? '&touch' : ''}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__dakar, null, { timeout: 30000 });
  await page.evaluate(() => localStorage.clear()); await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__dakar, null, { timeout: 30000 });
  await page.waitForTimeout(1200);
  await page.evaluate(() => { window.__dakar.setHour(10); window.__dakar.teleport('pikine'); });
  await page.waitForTimeout(800);
  const sug = await page.evaluate(() => window.__dakar.suggestion());
  check(`${label}: first suggested beat is Ibou`, sug === 'ibou_welcome', String(sug));
  if (label === 'desktop') await page.screenshot({ path: `${out}/desktop-pikine-goal.png` });
  await page.evaluate(() => window.__dakar.openNpc('ibou')); await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/${label}-npc-menu.png` });
  await page.click('.item >> nth=0'); await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/${label}-beat.png` });
  await page.click('.item >> nth=0'); await page.waitForTimeout(300);
  await page.click('.item >> nth=0'); await page.waitForTimeout(300);
  const flags = await page.evaluate(() => window.__dakar.flags());
  check(`${label}: beat choice sets reco_modou via UI`, flags.includes('reco_modou'), flags.join(','));
  await page.evaluate(() => { const d = window.__dakar; d.playBeat('ablaye_join', 'rejoindre'); d.state.count('lutte', 2); d.playBeat('ablaye_rival', 'pret'); d.playBeat('lamine_meet', 'respect'); d.setLook('indigo', 'rayures', ['taille', 'bras_d']); });
  await page.evaluate(() => window.__dakar.journal()); await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/${label}-journal.png` });
  await page.keyboard.press('Escape'); await page.evaluate(() => document.querySelector('#modal')?.classList.remove('on')); await page.waitForTimeout(200);
  if (label === 'desktop') { await page.evaluate(() => window.__dakar.outfit()); await page.waitForTimeout(300); await page.screenshot({ path: `${out}/desktop-outfit.png` }); await page.evaluate(() => document.querySelector('#modal')?.classList.remove('on')); await page.waitForTimeout(200); }
  for (const [kind, times] of [['entrance', [3.5, 9, 13]], ['training', [3]], ['celebration', [3]], ['watch', [3]]]) {
    await page.evaluate(k => window.__dakar.scene(k), kind); await page.waitForTimeout(300);
    for (const t of times) {
      await page.evaluate(tt => window.__dakar.scenePeek(tt), t); await page.waitForTimeout(700);
      if (label === 'desktop' || t === times[times.length - 1] || kind === 'entrance') await page.screenshot({ path: `${out}/${label}-scene-${kind}-${t}.png` });
    }
    await page.evaluate(() => window.__dakar.scenePeek(99)); await page.waitForFunction(() => window.__dakar.sceneInfo() === null, null, { timeout: 8000 }).catch(() => {});
    const si = await page.evaluate(() => window.__dakar.sceneInfo());
    check(`${label}: scene ${kind} runs and ends`, si === null);
  }
  check(`${label}: Blender wrestler asset loaded`, await page.evaluate(() => window.__dakar.wrestlerReady()));
  await page.evaluate(() => { const d = window.__dakar; d.setHour(16); d.teleport('pikine', 0, -30, 0); });
  await page.waitForTimeout(600);
  await page.evaluate(() => { const d = window.__dakar; d.faceCamera(); d.emote(0); });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/${label}-emote-dance.png` });
  await page.evaluate(() => window.__dakar.emote(2)); await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/${label}-emote-celebrate.png` });
  const ent = await page.evaluate(() => window.__dakar.state.data.counters.entrees ?? 0);
  check(`${label}: entrance completion recorded`, ent >= 1, String(ent));
  check(`${label}: no page errors (social + scenes)`, errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}
await browser.close();
fs.writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 1));
process.exit(results.every(r => r.ok) ? 0 : 1);
