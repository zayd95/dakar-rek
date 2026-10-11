// Checks of the fighter's evening (src/arena/fighter.ts): a bout tonight sends the player to « Entrée des lutteurs »,
// through the wrestlers' tunnel (no ticket needed) to the écurie's corner, a short moment there (drums louder), on cue to
// the ring's edge, the existing duel (abandoned here: the duel's own checks cover the bout), then back out through the
// tunnel. Desktop 1280×800 (medium) and phone 390×844 (low, touch).
// Usage: flock /tmp/dakar-browser.lock node scripts/check-arena-fighter.mjs [baseUrl] [outDir]. ONLY=desktop|phone.
// LAMB2=1: with ?lamb2 the bout is avec frappe against the career's opponent as himself, and a knockdown in it is answered
// by the stands and the announcer (« … vacille ! Il n’est pas tombé ») — captures and results suffixed -lamb2.
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:4234/';
const L2 = process.env.LAMB2 === '1';
const out = (process.argv[3] ?? 'docs/screenshots/arena-fighter') + (L2 ? '-lamb2' : '');
fs.mkdirSync(out, { recursive: true });
const SLOW = Number(process.env.SLOW ?? 3);
const WALL_R = 21.7;
const results = []; let failed = 0;
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail: String(detail).slice(0, 300) }); if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${String(detail).slice(0, 300)}`); };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
for (const [label, viewport, touch, quality] of [['desktop', { width: 1280, height: 800 }, false, 'medium'], ['phone', { width: 390, height: 844 }, true, 'low']]) {
  if (process.env.ONLY && process.env.ONLY !== label) continue;
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch });
  await context.addInitScript(q => { try { localStorage.setItem('dakarrek.quality', q); } catch { /* */ } }, quality);
  const page = await context.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}?debug${touch ? '&touch' : ''}${L2 ? '&lamb2' : ''}`, { timeout: 120000 });
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.fighter, null, { timeout: 120000 * SLOW });
  const d = (fn, arg) => page.evaluate(fn, arg);
  const until = (fn, arg, timeout = 60000) => page.waitForFunction(fn, arg, { timeout: timeout * SLOW, polling: 250 }).then(() => true).catch(() => false);
  const shot = async name => {
    await page.waitForTimeout(800);
    try { await page.screenshot({ path: `${out}/${label}-${name}.png`, timeout: 120000 * SLOW }); }
    catch (e) { console.log(`NOTE: capture ${label}-${name} skipped (${String(e.message).split('\n')[0]})`); }
  };
  const fi = () => d(() => window.__dakar.fighter());
  const walk = async (pred, arg, ms = 30000) => { await page.keyboard.down('KeyW'); const ok = await until(pred, arg, ms); await page.keyboard.up('KeyW'); return ok; };

  // the evening (19 h: doors open, the gate checks tickets) — the player has no ticket and fights tonight
  await d(() => { window.__dakar.teleport('pikine'); window.__dakar.setHour(19); window.__dakar.state.data.needs.energie = 100; delete window.__dakar.state.data.counters.arena_ticket_day; });
  await until(() => window.__dakar.pos().hub === 'pikine' && window.__dakar.fighter().spots);
  const began = await d(() => window.__dakar.fighterBegin('amical', 'costaud'));
  let f = await fi();
  const s = f.spots, cz = s.ring.z - 10.4, cx = s.ring.x;
  check(`${label}: a bout tonight sends the player to « Entrée des lutteurs »`, began && f.phase === 'called' && (await d(() => window.__dakar.destination())) === 'pikine:arena:lutteurs', JSON.stringify({ phase: f.phase, dest: await d(() => window.__dakar.destination()) }));

  // at the wrestlers' gate
  await d(([x, z]) => window.__dakar.place(x, z, Math.PI), [s.gate.x, s.gate.z + 0.9]);
  const atGate = await until(() => /pikine:arena:lutteurs/.test(window.__dakar.focus()?.id ?? ''), null, 20000);
  const fg = await d(() => window.__dakar.focus());
  check(`${label}: « Entrée des lutteurs » offers to go in`, atGate && fg.primary === 'Entrer · Entrée des lutteurs', JSON.stringify(fg));
  await d(([p, t]) => window.__dakar.cam(p, t), [[cx + 6, 3, s.gate.z + 9], [cx, 2.6, cz + WALL_R]]); await shot('fighters-gate'); await d(() => window.__dakar.cam(null));
  await d(() => window.__dakar.act());
  const inTunnel = await until(() => window.__dakar.fighter().phase === 'tunnel', null, 15000);
  check(`${label}: through the gate into the wrestlers' tunnel, marker on the corner`, inTunnel && (await d(() => window.__dakar.destination())) === 'pikine:arena:coin', JSON.stringify(await d(() => window.__dakar.pos())));
  // walking down the tunnel: no ticket needed (the gate's controller lets tonight's wrestler in)
  const through = await walk(z => window.__dakar.pos().z < z, cz + 15.5, 30000);
  const p1 = await d(() => window.__dakar.pos());
  check(`${label}: down the tunnel to the ring side, not sent back by the ticket controller`, through && p1.z > cz && Math.abs(p1.x - cx) < 2.5, `${(p1.x - cx).toFixed(1)}, ${(p1.z - cz).toFixed(1)} from the centre`);
  await shot('tunnel-walk');

  // the corner: a short moment, the drums louder
  await d(([x, z, ox, oz]) => window.__dakar.place(x, z, Math.atan2(ox - x, oz - z)), [s.corner.x, s.corner.z, cx, cz]);
  const prep = await until(() => window.__dakar.fighter().phase === 'prep', null, 15000);
  const drums = await d(() => window.__dakar.arenaOut().audio.want.drums);
  check(`${label}: in the écurie's corner: the moment before the bout, drums louder`, prep && drums > 1.1, `drums ${drums?.toFixed?.(2)}`);
  await d(([p, t]) => window.__dakar.cam(p, t), [[s.corner.x + (cx - s.corner.x) * 0.45, 2.6, s.corner.z - 3.5], [s.corner.x, 1.0, s.corner.z]]); await shot('corner'); await d(() => window.__dakar.cam(null));
  const ready = await until(() => /pikine:arena:coin/.test(window.__dakar.focus()?.id ?? '') && window.__dakar.focus()?.primary === 'Je suis prêt', null, 15000);
  if (ready) await d(() => window.__dakar.act());
  const ring = await until(() => window.__dakar.fighter().phase === 'ring', null, 30000);
  check(`${label}: on cue, toward the ring (« Je suis prêt » or after the wait)`, ring && (await d(() => window.__dakar.destination())) === 'pikine:arena:cercle', (await fi()).phase);

  // the ring's edge: the existing duel starts
  await d(([x, z]) => window.__dakar.place(x, z, Math.PI), [s.ring.x, s.ring.z + 0.3]);
  const bout = await until(() => window.__dakar.fighter().phase === 'bout' && !!window.__dakar.duelInfo(), null, 20000);
  check(`${label}: at the ring's edge the bout starts (the existing duel)`, bout, JSON.stringify(await d(() => window.__dakar.duelInfo())).slice(0, 160));
  await page.waitForTimeout(1500); await shot('bout');
  if (L2) {
    // Làmb 2.0: the main event is fought avec frappe; a knockdown is answered by the stands and the announcer, not as the fall
    const b0 = await d(() => window.__dakar.duelInfo());
    check(`${label}: with ?lamb2 the bout is avec frappe`, b0?.discipline === 'avec_frappe', JSON.stringify({ discipline: b0?.discipline, identity: b0?.identity }));
    await until(() => window.__dakar.duelInfo()?.phase === 'fight', null, 30000);
    await d(() => window.__dakar.duelHold(true));                          // he stands still: the set-up is the check's
    let st = null;
    for (const t0 = Date.now(); Date.now() - t0 < 60000 * SLOW;) {
      st = await d(() => window.__dakar.duelInfo());
      if (!st || st.phase !== 'fight' || st.stagger === 'opponent') break;
      if (st.dist > 1.5) { await page.keyboard.down('KeyD'); await page.waitForTimeout(150); continue; }
      await page.keyboard.up('KeyD');
      await d(() => { window.__dakar.duelSet('opponent', { balance: 4 }); window.__dakar.duelSet('player', { stamina: 100 }); window.__dakar.duelStrike('quick'); });
      await page.waitForTimeout(250);
    }
    await page.keyboard.up('KeyD');
    const said = await until(() => /vacille ! Il n’est pas tombé/.test(document.getElementById('toast')?.textContent ?? ''), null, 15000);
    check(`${label}: a knockdown (he staggers) — the announcer says he is still up, the bout goes on`, st?.stagger === 'opponent' && said, JSON.stringify({ stagger: st?.stagger, phase: st?.phase, toast: await d(() => document.getElementById('toast')?.textContent ?? '') }).slice(0, 300));
    await shot('bout-knockdown');
  }
  await d(() => window.__dakar.duelAbandon(true));
  const back = await until(() => !window.__dakar.duelInfo() && window.__dakar.fighter().phase === 'return', null, 60000);
  check(`${label}: after the result, back through the tunnel (marker on the wrestlers' gate)`, back && (await d(() => window.__dakar.destination())) === 'pikine:arena:lutteurs', (await fi()).phase);

  // out through the tunnel and the gate
  await d(([x, z]) => window.__dakar.place(x, z, 0), [cx, cz + 16.5]);
  const outside = await walk(() => window.__dakar.fighter().phase === 'idle', null, 40000);
  check(`${label}: out through the tunnel and the wrestlers' gate: the path ends`, outside && /Ba beneen yoon/.test(await d(() => document.getElementById('toast')?.textContent ?? '')), JSON.stringify(await d(() => window.__dakar.pos())));
  check(`${label}: no page errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
  await context.close();
}
await browser.close();
fs.writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 2));
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
