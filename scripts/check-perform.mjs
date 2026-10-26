// Actions done in the world (src/game/perform.ts, src/game/meals.ts): for each kind of action, start it the way a
// player does, check that the character performs it (moves, carries, works, eats…) and that the progress shows in the
// world (pile, cup, basin…), and take a picture mid-action.
// Usage: node scripts/check-perform.mjs [baseUrl] [outDir]   (needs a running build, e.g. `npx vite preview --port 4208`)
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:4208/';
const out = process.argv[3] ?? 'docs/screenshots/perform';
fs.mkdirSync(out, { recursive: true });
const T = { timeout: 90000 };
const results = []; let failed = 0;
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${detail}`); };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.goto(`${base}?debug`, { timeout: 120000 });
await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub, null, T);
const d = (fn, arg) => page.evaluate(fn, arg);

async function hub(h) {
  if ((await d(() => window.__dakar.pos().hub)) === h && (await d(() => window.__dakar.pos().x)) < 900) return;
  await d(x => { window.__dakar.teleport(x); window.__dakar.setHour(10); }, h);
  await page.waitForFunction(x => window.__dakar.pos().hub === x && window.__dakar.pos().x < 900, h, T);
}
/**
 * Frame the player from `side` (radians from the way they face), `dist` m away, `h` m up; when a wall or a stall is in
 * the way, the nearest angle with a clear view is taken instead.
 */
const frame = (dist = 3.6, side = 1.1, h = 1.8, lookH = 1.0) => d(([dist, side, h, lookH]) => {
  const D = window.__dakar, p = D.pos(), y = D.body()?.group.rotation.y ?? 0, look = [p.x, p.y + lookH, p.z];
  const at = s => [p.x + Math.sin(y + s) * dist, p.y + h, p.z + Math.cos(y + s) * dist];
  const open = c => { const a = D.sightline(c, look), b = D.sightline(look, c); return a.hit >= a.len - 0.3 && b.hit >= b.len - 0.3; };
  const s = [side, -side, side + 0.5, -side - 0.5, side - 0.5, -side + 0.5, side + 1, -side - 1].find(s => open(at(s))) ?? side;
  D.cam(at(s), look);
  return s;
}, [dist, side, h, lookH]);

/**
 * Stand at a target (`find` returns {x, z} in page), pick `label` in its sheet, then check the performance:
 * `expect(first, later)` compares two readings of window.__dakar.performing() (or meal()).
 */
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
/** `views`: more pictures at the same moment, { suffix: [dist, side, h] } (e.g. a side view of the posture). */
/** `until`: after `wait`, the picture waits (a little) for this moment of the gesture, e.g. the cup at the lips. */
async function act({ name, find, label, wait = 0.45, until = null, cam = [3.6, 1.1, 1.8], views = {}, read = 'performing', expect, prep }) {
  if (ONLY && !ONLY.some(o => name === o || name.startsWith(o + '-'))) return;
  // nothing left open from the previous one
  await d(() => { document.querySelector('#modal.on .item.close')?.click(); });
  await page.waitForFunction(() => !window.__dakar.activity() && window.__dakar.pos().mode === 'play', null, T).catch(() => {});
  const t = await d(find);
  if (!t) { check(`${name}: target found`, false); return; }
  await d(() => { const s = window.__dakar.state; s.data.wallet = 20000; Object.assign(s.data.needs, { faim: 40, energie: 90, hygiene: 60, moral: 60, social: 60 }); });
  if (prep) await d(prep);
  await d(p => window.__dakar.place(p.x, p.z, p.yaw ?? 0), t);
  await page.waitForFunction(id => !id || window.__dakar.focus()?.id === id, t.id ?? null, { timeout: 20000 }).catch(() => {});
  await d(() => window.__dakar.more());
  await page.waitForFunction(() => document.querySelector('#modal.on'), null, T).catch(() => {});
  // the entry whose own label is `label` (a place named « Café Touba · Fann » must not be taken for « Café Touba »)
  const idx = await d(l => {
    const items = [...document.querySelectorAll('#modal .item')], own = b => (b.querySelector('div')?.firstChild?.textContent ?? '').trim();
    const i = items.findIndex(b => own(b) === l);
    return i >= 0 ? i : items.findIndex(b => own(b).startsWith(l));
  }, label);
  const item = page.locator('#modal .item').nth(Math.max(0, idx));
  if (idx < 0) { check(`${name}: « ${label} » offered`, false, await d(() => [...document.querySelectorAll('#modal .item')].map(b => b.textContent).join(' | '))); await d(() => document.querySelector('#modal .item.close')?.click()); return; }
  const why = await item.evaluate(b => b.classList.contains('dis') ? b.textContent : '');
  await item.click();
  if (why) { check(`${name}: « ${label} » available`, false, why); await d(() => document.querySelector('#modal.on .item.close')?.click()); return; }
  await page.waitForFunction(r => !!window.__dakar[r]?.(), read, { timeout: 120000 }).catch(() => {});
  const first = await d(r => window.__dakar[r]?.() ?? null, read);
  const total = await d(() => window.__dakar.activity()) ?? await d(() => `toast: ${document.getElementById('toast')?.textContent ?? ''} mode: ${window.__dakar.pos().mode}`);
  // wait until `wait` of the step has gone by (game time), take the picture there (a gesture step has no fixed length:
  // a moment is enough)
  if (read === 'gesture') await page.waitForTimeout(1500);
  else await page.waitForFunction(w => { const a = window.__dakar.activity(); return !a || (a.seconds > 0 && a.t >= w * a.seconds); }, wait, { timeout: 120000 }).catch(() => {});
  if (until) await page.waitForFunction(([r, f]) => { const i = window.__dakar[r]?.(); return !i || new Function('i', `return (${f})(i)`)(i); }, [read, until.toString()], { timeout: 30000 }).catch(() => {});
  await frame(...cam); await page.waitForTimeout(350);
  await page.screenshot({ path: `${out}/${name}.png` });
  const later = await d(r => window.__dakar[r]?.() ?? null, read);
  for (const [suffix, v] of Object.entries(views)) { await frame(...v); await page.waitForTimeout(250); await page.screenshot({ path: `${out}/${name}-${suffix}.png` }); }
  await d(() => window.__dakar.cam(null));
  check(`${name}: « ${label} » is performed in the world`, !!first && expect(first, later ?? {}), `${JSON.stringify(first)} → ${JSON.stringify(later)} ${typeof total === 'string' ? total : ''}`);
  if (read === 'gesture') await page.keyboard.press('Escape');      // the timing game waits for the player: stop it
  await page.waitForFunction(() => !window.__dakar.activity(), null, { timeout: 180000 }).catch(() => {});
  await d(() => window.__dakar.stand());
}

const byId = re => `(() => { const i = window.__dakar.interactables().find(i => ${re}.test(i.id)) ?? window.__dakar.cityPlaces().find(i => ${re}.test(i.id)); return i && { id: i.id, x: i.x, z: i.z }; })()`;
const find = re => new Function(`return ${byId(re)};`);

const SIDE = { side: [2.5, Math.PI / 2, 1.3] };
/** Soumbédioune's pirogue (src/venues/beach.ts): its place's anchor, standing on the sand beside the hull. */
const soumbedioune = () => { const v = window.__dakar.venues?.().find(x => x.type === 'beach'), a = v?.anchors.find(x => x.id === 'pirogue'); return a && { id: `${v.id}:pirogue`, x: a.x, z: a.z, yaw: -Math.PI / 2 }; };
// Corniche: the landing (crates carried on the head), the fish market (clean fish on the market's own table)
await hub('corniche');
await act({ name: 'carry-crates', find: find(/:city:soumbedioune$/), label: 'Débarquer les caisses', wait: 0.5, until: i => i.onHead, cam: [5, 1.4, 2.6], views: { close: [3, 0.9, 1.8] },
  expect: (a, b) => a.kind === 'carry' && b.moved > a.moved && a.leg > 0.5 });
// a player who walked up to the stalls (2.6 m in front of the place, facing the tables): the work is done on a real table
// (1 m to the side: on wave 5 the mareyeuses' counter, just west of there, takes the focus)
const nearStalls = () => { const i = window.__dakar.cityPlaces().find(i => /:city:fish-market$/.test(i.id)); return i && { id: i.id, x: i.x + 1, z: i.z - 2.6, yaw: Math.PI }; };
await act({ name: 'clean-fish', find: nearStalls, label: 'Aider au nettoyage', wait: 0.6, cam: [2.4, 0.8, 1.6], views: SIDE,
  expect: (a, b) => a.kind === 'handwork' && b.done > a.done && b.surface === true });
// Gym, garage, café and market wherever they are
for (const h of ['corniche', 'plateau', 'almadies', 'pikine']) {
  await hub(h);
  const has = await d(() => window.__dakar.interactables().map(i => i.id.split(':')[1]));
  if (has.includes('gym')) {
    await act({ name: `run-${h}`, find: find(/:gym$/), label: 'Courir', wait: 0.3, cam: [7, 1.5, 2.5], expect: (a, b) => a.kind === 'run' && b.metres > 2 });
    await act({ name: `pull-ups-${h}`, find: find(/:gym$/), label: 'Faire les barres', wait: 0.25, cam: [3.4, 1.2, 1.6], expect: (a, b) => a.kind === 'pullups' && b.reps >= 1 });
  }
  // wave 5 plays the garage, the stall and the pirogue with the shared timing gesture (scripts/check-gestures.mjs): it starts. The pirogue's haul is
  // Soumbédioune's (the Almadies' quay is the Embarcadère de Ngor, without fishing: docs/TRAVERSEE.md): the trip's « Tu tires le filet », out at sea
  if (h === 'corniche') await act({ name: 'haul-corniche', find: soumbedioune, label: 'Partir avec les pêcheurs', wait: 0.3, cam: [5, 2.2, 2.6], read: 'gesture', expect: a => a.kind === 'timing' });
  if (has.includes('garage')) await act({ name: `garage-${h}`, find: find(/:garage:/), label: 'Aider le mécanicien', wait: 0.3, cam: [2.6, 0.9, 1.6], read: 'gesture', expect: a => !!a.kind });
  if (has.includes('cafe')) await act({ name: `cafe-touba-${h}`, find: find(/:cafe:/), label: 'Café Touba', wait: 0.35, until: i => i.raised, cam: [2.1, 0.6, 1.6, 1.3], expect: (a, b) => a.kind === 'drink' && b.left < a.left });
  if (has.includes('market')) await act({ name: `market-sell-${h}`, find: find(/:market$/), label: 'Tenir l’étal', wait: 0.3, cam: [2.8, 0.9, 2.3], read: 'gesture', expect: a => a.kind === 'choose' });
}
// Almadies: Jus & Go (a juice in hand), the gallery walk
await hub('almadies');
await act({ name: 'juice', find: find(/:city:mall-juice$/), label: 'Jus de bouye', wait: 0.3, until: i => i.raised, cam: [2.1, 0.6, 1.6, 1.3], expect: (a, b) => a.kind === 'drink' && b.left < a.left });
await act({ name: 'gallery-walk', find: find(/:city:mall$/), label: 'Faire le tour', wait: 0.5, cam: [5, 1.2, 2.4], expect: (a, b) => a.kind === 'look' && b.stops >= 1 });
// Pikine: the boutique (bread, stock), the salon (haircut), the square (attaya, dames), the gargote, home
await hub('pikine');
await act({ name: 'bread', find: find(/:city:boutique$/), label: 'Pain et lait', wait: 0.3, until: i => i.raised, cam: [2.1, 0.6, 1.6, 1.3], expect: (a, b) => a.kind === 'eat' && b.left < a.left });
await act({ name: 'stock', find: find(/:city:boutique$/), label: 'Aider à ranger le stock', wait: 0.25, until: i => i.carrying && i.walked > 0.3, cam: [4.5, 1.3, 2.2], expect: (a, b) => a.kind === 'carry' && b.moved > a.moved && a.leg > 0.5 });
// (wave 5: the cut is the Salon Awa venue's chair, its stylist working behind you — scripts/check-venues.mjs)
if (!(await d(() => window.__dakar.venues?.().some(v => v.type === 'salon'))))
  await act({ name: 'haircut', find: find(/:city:salon-tech$/), label: 'Se faire coiffer', wait: 0.5, cam: [2.4, 1.6, 1.7], expect: (a, b) => a.kind === 'haircut' && a.barber && b.cuts > a.cuts });
await act({ name: 'attaya', find: find(/:city:square$/), label: 'Partager l’attaya', wait: 0.3, until: i => i.raised, cam: [2.1, 0.6, 1.6, 1.3], expect: (a, b) => a.kind === 'drink' && b.left < a.left });
await act({ name: 'dames', find: find(/:city:square$/), label: 'Regarder la partie de dames', wait: 0.5, cam: [3, 1.0, 1.8], expect: a => a.kind === 'watch' });
await act({ name: 'gargote-eat', find: () => { const i = window.__dakar.interactables().find(i => /:gargote:/.test(i.id)); return i && { id: i.id, x: i.x, z: i.z }; },
  label: 'Ceebu jën', read: 'meal', wait: 0.3, cam: [1.9, 0.6, 1.4], expect: (a, b) => a.prop === 'ceebu' && b.bites >= 1 });
await d(() => window.__dakar.enter('home'));
await page.waitForFunction(() => window.__dakar.pos().x > 900 && window.__dakar.pos().mode === 'play', null, T).catch(() => {});
const room = suffix => new Function(`const i = window.__dakar.roomInteractables().find(i => i.id.endsWith(${JSON.stringify(suffix)})); return i && { id: i.id, x: i.x, z: i.z };`);
await act({ name: 'wash', find: room(':in:wash'), label: 'Se laver', wait: 0.4, cam: [2.2, 1.2, 1.7], views: SIDE, expect: (a, b) => a.kind === 'wash' && a.bucket === 'room' && b.water < a.water });
await act({ name: 'sleep', find: room(':in:bed'), label: 'Dormir', wait: 0.45, cam: [2.4, 1.0, 2.2], expect: (a, b) => a.kind === 'sleep' && b.dark > 0.3 });
check('no page errors', errors.length === 0, errors.join(' | '));
await browser.close();
fs.writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 2));
console.log(`\n${results.length - failed}/${results.length} performance checks passed`);
process.exit(failed ? 1 : 0);
