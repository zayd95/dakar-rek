// La traversée's acceptance on a phone (docs/TRAVERSEE.md « Acceptance », version 2: boarded and left on the sand): the quay is the Embarcadère de
// Ngor and offers no fishing any more; both boats lie pulled up on the beach; on the sand by them the choice opens with real taps on the action button;
// a pirogue round trip to the island of Ngor and back, followed through window.__dakar.traversee(): the customers put on life jackets on the sand,
// wade in (feet under the sea) and climb aboard; the boat is pushed off stern first, crosses and runs up the island's beach bow first; they climb out
// into the shallows and take the jackets off on the sand; each leg pays once exactly what the rules say (fares − Ousmane's share); after three pirogue
// round trips (the first by taps, the counter set for the other two) the chaloupe opens and a chaloupe round trip pays its own fares; a reload in the
// middle of a leg (back on the sand at the anchor, nothing paid, nothing twice); the night (no crossing, the reason shown); Soumbédioune still offers
// its fishing trip. Pictures of the quay, the boats on the beach, the boarding, the wading, the crossing, the island's beach, the return (PNG, < 400 kB).
// Usage: npx vite build && node /tmp/claude-0/beta/tools/serve.mjs "$PWD/dist" 4817 &  node scripts/check-traversee.mjs [baseUrl] [outDir]
import { chromium } from 'playwright';
import fs from 'node:fs';
import sharp from 'sharp';

const base = process.argv[2] ?? 'http://127.0.0.1:4817/';
const out = process.argv[3] ?? 'docs/proof/traversee/crossing2';
fs.mkdirSync(out, { recursive: true });
const SLOW = Number(process.env.SLOW ?? 1);
const results = []; let failed = 0;
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ' · ' + detail : ''}`); };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const page = await context.newPage();
const errors = []; page.on('pageerror', e => errors.push(e.message));
const d = (fn, arg) => page.evaluate(fn, arg);
// software rendering draws a few frames a second and game time follows the frames (dt ≤ 0.1 s): wait long
const until = (fn, arg, s = 240) => page.waitForFunction(fn, arg, { timeout: s * 1000 * SLOW, polling: 250 }).then(() => true).catch(() => false);
const tr = () => d(() => window.__dakar.traversee());
const shot = async name => {
  await page.waitForTimeout(400);
  const file = `${out}/${name}.png`;
  try {
    const raw = await page.screenshot({ timeout: 120000 });
    let png = await sharp(raw).png({ compressionLevel: 9 }).toBuffer();
    if (png.length > 390_000) png = await sharp(raw).png({ palette: true, quality: 90, compressionLevel: 9 }).toBuffer();
    fs.writeFileSync(file, png);
    console.log(`  picture ${file} (${Math.round(png.length / 1024)} kB)`);
  } catch (e) { console.log(`NOTE: picture ${name} skipped (${String(e.message).split('\n')[0]})`); }
};
const ledgerSince = n => d(k => window.__dakar.state.data.ledger.slice(k).map(l => [l.label, l.amount]), n);
const ledgerLen = () => d(() => window.__dakar.state.data.ledger.length);
const wallet = () => d(() => window.__dakar.state.wallet);

/** On the sand at the anchor, the choice opened by a real tap on the action button (#act), the boat picked by a tap in the sheet. */
const ANCHOR = { x: 48.5, z: -154.5 };
const atAnchor = p => Math.hypot(p.x - ANCHOR.x, p.z - ANCHOR.z) < 2.5 && p.z > -157.01;
/** A boat on its beach pose: there, its heading, grounded (the bow lifted). */
const beachedAt = (b, at) => !!b && Math.abs(b.x - at.x) < 0.3 && Math.abs(b.z - at.z) < 0.3 && Math.abs(Math.atan2(Math.sin(b.yaw - at.yaw), Math.cos(b.yaw - at.yaw))) < 0.05 && b.ground > 0.99 && b.pitch > 0.025;
async function takeCrossing(kind) {
  await d(a => { window.__dakar.setHour(10); window.__dakar.place(a.x, a.z + 1.3, Math.PI); window.__dakar.state.data.needs.energie = 100; }, ANCHOR);
  const focused = await until(() => /:quai$/.test(window.__dakar.focus()?.id ?? ''), null, 60);
  const act = await d(() => document.getElementById('act')?.textContent ?? '');
  await page.locator('#act').tap();
  const sheet = await until(() => !!document.querySelector('#modal.on'), null, 30);
  const items = await d(() => [...document.querySelectorAll('#modal.on .item')].map(b => ({ text: b.textContent, dis: b.classList.contains('dis') })));
  const label = kind === 'pirogue' ? 'Traversée en pirogue' : 'Traversée en chaloupe';
  return { focused, act, sheet, items, pick: async () => { await page.locator('#modal.on .item', { hasText: label }).first().tap(); } };
}

await page.goto(`${base}?debug&touch`, { timeout: 180000 });
await until(() => window.__dakar?.pos?.()?.hub, null, 240);
await d(() => window.__dakar.teleport('almadies'));
await until(() => window.__dakar.pos().hub === 'almadies' && !!window.__dakar.traversee?.(), null, 240);

// ================================================================== the quay: the Embarcadère de Ngor, no fishing
const port = (await d(() => window.__dakar.interactables())).find(i => i.id === 'almadies:port');
await d(p => { window.__dakar.setHour(10); window.__dakar.place(p.x, p.z + 2.5, Math.PI); }, port);
const quayFocused = await until(() => window.__dakar.focus()?.id === 'almadies:port', null, 60);
const quay = await d(() => window.__dakar.focus());
check('the quay is the « Embarcadère de Ngor » and offers no fishing (« Aider les pêcheurs », « Pirogue du matin » are gone)',
  port?.name === 'Embarcadère de Ngor' && quayFocused && !/pêcheurs|Pirogue du matin/.test((quay?.all ?? []).join(' ')), JSON.stringify({ port, actions: quay?.all }));
await d(() => window.__dakar.place(30, -98, Math.PI)); await page.waitForTimeout(1500);
await shot('00-quay');
await d(a => { window.__dakar.setHour(10); window.__dakar.place(a.x + 3, a.z + 4, Math.PI - 0.35); }, ANCHOR);
await until(() => (window.__dakar.traversee()?.customers ?? []).filter(c => c.state === 'wait').length >= 3, null, 60);
await shot('01-boats-on-the-beach');

// ================================================================== the choice on the sand
let t0 = await tr();
const home0 = t0?.poses ?? {};
check('the embarcadère is built in the Almadies: both boats pulled up on the beach at their poses (bows on the sand), customers waiting on the sand without jackets',
  !!t0 && t0.phase === 'idle' && t0.customers.length >= 3 && ['pirogue', 'chaloupe'].every(k => beachedAt(t0.boats[k], home0[k].home)) && t0.customers.every(c => !c.vest && c.y > t0.seaY),
  JSON.stringify({ boats: t0?.boats && Object.fromEntries(Object.entries(t0.boats).map(([k, p]) => [k, [p.x, p.z, p.yaw, p.ground, p.pitch]])), waiting: t0?.customers.map(c => [c.x, c.z, c.vest]) }));
const c1 = await takeCrossing('pirogue');
check('standing on the sand by the boats focuses the embarcadère; the action button offers the crossings', c1.focused && /Prendre le bateau/.test(c1.act), c1.act);
const pir = c1.items.find(i => /Traversée en pirogue/.test(i.text)), cha = c1.items.find(i => /Traversée en chaloupe/.test(i.text));
check('a tap opens the choice: the pirogue shows its fare, the passengers waiting and Ousmane\'s share', c1.sheet && !!pir && !pir.dis && /passagers? attend/.test(pir.text) && /1.000.F la place/.test(pir.text) && /Ousmane prend 40/.test(pir.text), pir?.text);
check('the chaloupe is closed and says how many pirogue crossings remain', !!cha && cha.dis && /encore 3/.test(cha.text), cha?.text);
await shot('02-choice');

// ================================================================== a round trip (the pirogue by taps; the chaloupe the same way)
/** Picks `kind` in the open choice and follows the crossing to the island and back, checking each leg's payment, the counters and the way off. */
async function roundTrip(kind, pick, shots) {
  const w0 = await wallet(), l0 = await ledgerLen(), counters0 = (await tr()).counters, fare = kind === 'pirogue' ? 1000 : 2500;
  const tStart = (await tr()).events.at(-1)?.t ?? -1, evs = t => t.events.filter(e => e.t > tStart);     // this crossing's moves only
  await pick();
  const helm = await until(() => { const t = window.__dakar.traversee(); return t.helm.seated && t.helm.locked && t.phase !== 'idle'; }, null, 60);
  const plan = (await tr()).plan;
  check(`${kind}: a tap on « Traversée en ${kind} »: the player takes the helm (seated, locked)`, helm && (await tr()).boat === kind, JSON.stringify({ seated: await d(() => window.__dakar.seated()), plan: { out: plan.out.passengers, back: plan.back.passengers } }));
  const poses = (await tr()).poses[kind];
  // the boarding, sampled as it goes: jackets on, feet under the sea while wading in
  const seen = { vested: new Set(), wading: new Set(), seatedVest: new Set(), seatedBare: new Set() };
  const sample = t => { for (const c of t.customers) { if (!c.leg) continue; if (c.vest && c.side !== 'bord' && c.y > t.seaY) seen.vested.add(c.id); if (c.wading && c.vest) seen.wading.add(c.id); if (c.seated) (c.vest ? seen.seatedVest : seen.seatedBare).add(c.id); } };
  let shotBoard = !shots, shotWade = !shots;
  for (let k = 0; k < 600; k++) {
    const t = await tr(); sample(t);
    const out = t.customers.filter(c => c.leg === 'aller');
    if (!shotBoard && out.filter(c => c.vest && c.side !== 'bord').length >= 2) { await shot(`${shots}-boarding`); shotBoard = true; }
    else if (!shotWade && out.filter(c => c.wading).length >= 2) { await shot(`${shots}-wading`); shotWade = true; }
    if (out.length && out.every(c => c.seated) || t.phase === 'out') break;
    await page.waitForTimeout(200);
  }
  const tb = await tr(), evB = evs(tb).filter(e => e.leg === 'aller');
  const boardEv = evB.filter(e => e.what === 'board'), onEv = evB.filter(e => e.what === 'vest-on');
  const boarded = tb.customers.filter(c => c.leg === 'aller' && c.seated && c.vest).length === plan.out.passengers;
  check(`${kind}: ${plan.out.passengers} customers put on life jackets on the sand, wade in (feet under the sea) and sit aboard in them`,
    boarded && onEv.length === plan.out.passengers && onEv.every(e => e.y > tb.seaY) && boardEv.length === plan.out.passengers && boardEv.every(e => e.y < tb.seaY - 0.02 && e.vest) && seen.wading.size >= 1 && seen.seatedBare.size === 0,
    JSON.stringify({ seated: tb.customers.filter(c => c.leg === 'aller').map(c => [c.state, c.vest]), vestOn: onEv.map(e => e.y), climbFrom: boardEv.map(e => e.y), wadingSeen: seen.wading.size }));
  const z0 = (await tr()).pose.z;
  let sea = { roll: 0, wake: 0, z: z0 }, pushed = { astern: false, ground0: 1, groundMin: 1 };
  await until(() => window.__dakar.traversee().phase === 'out', null, 60);
  pushed.ground0 = (await tr()).pose.ground;
  for (let k = 0; k < 400; k++) {
    const t = await tr();
    if (t.pose.astern) pushed.astern = true;
    pushed.groundMin = Math.min(pushed.groundMin, t.pose.ground);
    sea = { roll: Math.max(sea.roll, Math.abs(t.pose.roll)), wake: Math.max(sea.wake, t.pose.wake), z: Math.min(sea.z, t.pose.z), locked: t.helm.locked };
    if (t.pose.z < -222 || t.phase !== 'out') break;
    await page.waitForTimeout(250);
  }
  const mid = await tr();
  check(`${kind}: pushed off stern first from the sand: astern, its bow off the sand (grounded → afloat)`, pushed.astern && pushed.ground0 > 0.9 && pushed.groundMin < 0.01, JSON.stringify(pushed));
  check(`${kind}: across the open water: the boat moves, rocks, its wake shows, the helm stays locked`, mid.pose.z < z0 - 40 && sea.roll > 0.005 && sea.wake > 0.2 && mid.helm.locked && mid.helm.seated,
    JSON.stringify({ z: mid.pose.z, roll: +sea.roll.toFixed(3), wake: sea.wake, yaw: mid.pose.yaw }));
  if (shots) await shot(`${shots}-mid-crossing`);
  if (shots) { await until(() => { const t = window.__dakar.traversee(); return t.phase !== 'out' || t.pose.len - t.pose.s < 26; }, null, 180); await shot(`${shots}-arriving`); }
  const landed = await until(() => window.__dakar.traversee().phase === 'land', null, 180);
  const atIsland = await tr();
  check(`${kind}: it comes in bow first and runs up the island's beach (grounded, the bow lifted)`, landed && beachedAt(atIsland.pose, poses.isle), JSON.stringify({ pose: atIsland.pose, isle: poses.isle }));
  if (shots) { await until(() => window.__dakar.traversee().customers.some(c => c.leg === 'aller' && c.side === 'ile' && c.wading), null, 60); await shot(`${shots}-island`); }
  const paid1 = await until(() => window.__dakar.traversee().paid.some(p => p.leg === 'aller' && p.kind === window.__dakar.traversee().boat), null, 120);
  const w1 = await wallet(), legs1 = await ledgerSince(l0);
  const leg1 = legs1.filter(([l]) => /^Traversée vers Ngor/.test(l));
  check(`${kind}: the island's leg is paid once on arrival: ${plan.out.net} F (${plan.out.passengers} × ${fare} F = ${plan.out.fares} F − Ousmane's ${plan.out.share} F)`,
    paid1 && plan.out.fares === plan.out.passengers * fare && leg1.length === 1 && leg1[0][1] === plan.out.net && w1 - w0 === legs1.reduce((s, [, a]) => s + a, 0),
    JSON.stringify({ lines: legs1, wallet: [w0, w1] }));
  const walkedOff = await until(() => window.__dakar.traversee().customers.filter(c => c.leg === 'aller').every(c => c.state === 'leave' || c.state === 'gone'), null, 60);
  await until(([n, t0]) => window.__dakar.traversee().events.filter(e => e.t > t0 && e.what === 'vest-off' && e.side === 'ile').length >= n, [plan.out.passengers, tStart], 60);
  const ti = await tr(), off1 = evs(ti).filter(e => e.side === 'ile' && e.what === 'alight' && e.leg === 'aller'), bare1 = evs(ti).filter(e => e.side === 'ile' && e.what === 'vest-off');
  check(`${kind}: the customers climb out into the shallows, wade to the sand, take their jackets off there and walk up the beach`,
    walkedOff && off1.length === plan.out.passengers && off1.every(e => e.y < ti.seaY - 0.02 && e.vest) && bare1.length === plan.out.passengers && bare1.every(e => e.y > ti.seaY && !e.vest),
    JSON.stringify({ climbOut: off1.map(e => e.y), jacketsOff: bare1.map(e => e.y), ashore: ti.customers.filter(c => c.side === 'ile').map(c => [c.state, c.x, c.z, c.vest]) }));
  const backBoarded = await until(() => window.__dakar.traversee().phase === 'back', null, 120);
  const tbb = await tr(), evR = evs(tbb).filter(e => e.leg === 'retour');
  check(`${kind}: ${plan.back.passengers} return customers come down the beach from the parasols, put on jackets, wade in and board`,
    backBoarded && tbb.customers.filter(c => c.leg === 'retour' && c.seated && c.vest).length === plan.back.passengers && evR.filter(e => e.what === 'vest-on' && e.y > tbb.seaY).length === plan.back.passengers
      && evR.filter(e => e.what === 'board' && e.y < tbb.seaY - 0.02).length === plan.back.passengers, JSON.stringify(evR.map(e => [e.id, e.what, e.y])));
  if (shots) { await until(() => { const t = window.__dakar.traversee(); return t.phase !== 'back' || t.pose.len - t.pose.s < 26; }, null, 240); await shot(`${shots}-return`); }
  const home = await until(() => window.__dakar.traversee().phase === 'landBack', null, 240);
  const atQuay = await tr();
  check(`${kind}: the boat crosses back and runs up its own beach bow first, at its pose`, home && beachedAt(atQuay.pose, poses.home), JSON.stringify({ pose: atQuay.pose, home: poses.home }));
  if (shots) { await until(() => window.__dakar.traversee().customers.some(c => c.leg === 'retour' && c.side === 'quai'), null, 30); await shot(`${shots}-back`); }
  const done = await until(() => window.__dakar.traversee().phase === 'idle' && !window.__dakar.activity(), null, 120);
  const tq = await tr(), offQ = evs(tq).filter(e => e.side === 'quai' && e.what === 'alight' && e.t >= (evR.at(-1)?.t ?? 0)), bareQ = evs(tq).filter(e => e.side === 'quai' && e.what === 'vest-off' && e.t >= (evR.at(-1)?.t ?? 0));
  check(`${kind}: at the mainland the same: out into the shallows, jackets off on the sand`, offQ.length === plan.back.passengers && offQ.every(e => e.y < tq.seaY - 0.02) && bareQ.length === plan.back.passengers && bareQ.every(e => e.y > tq.seaY && !e.vest),
    JSON.stringify({ climbOut: offQ.map(e => e.y), jacketsOff: bareQ.map(e => e.y) }));
  const w2 = await wallet(), legs2 = await ledgerSince(l0), t2 = await tr();
  const leg2 = legs2.filter(([l]) => /^Traversée retour de Ngor/.test(l));
  check(`${kind}: the return leg is paid once: ${plan.back.net} F (${plan.back.passengers} × ${fare} F − Ousmane's ${plan.back.share} F)`, done && plan.back.fares === plan.back.passengers * fare && leg2.length === 1 && leg2[0][1] === plan.back.net && w2 - w0 === legs2.reduce((s, [, a]) => s + a, 0),
    JSON.stringify({ lines: legs2, wallet: [w0, w1, w2] }));
  const key = `traversees_${kind}`;
  check(`${kind}: the counters move by one round trip`, t2.counters.traversees === counters0.traversees + 1 && t2.counters[key] === counters0[key] + 1 && t2.counters.passagers_ngor === counters0.passagers_ngor + plan.out.passengers + plan.back.passengers, JSON.stringify(t2.counters));
  const p2 = await d(() => window.__dakar.pos());
  check(`${kind}: the player is set down on the sand at the anchor, free to walk; the other boat never left its pose`, atAnchor(p2) && p2.mode === 'play' && !(await d(() => window.__dakar.seated())) && Object.entries(t2.boats).every(([k, b]) => beachedAt(b, t2.poses[k].home)),
    JSON.stringify({ pos: p2, boats: Object.fromEntries(Object.entries(t2.boats).map(([k, p]) => [k, [p.x, p.z, p.ground]])) }));
  console.log(`PAID ${kind}: aller ${leg1[0]?.[1]} F · retour ${leg2[0]?.[1]} F · plan ${JSON.stringify({ out: plan.out, back: plan.back })}`);
}
await roundTrip('pirogue', c1.pick, '03');

// ================================================================== the chaloupe, after three pirogue round trips
const before = (await tr()).counters.traversees_pirogue;
await d(() => window.__dakar.traverseeSet(3));        // the second and third pirogue round trips, set (the first was played above)
const c3 = await takeCrossing('chaloupe');
const cha3 = c3.items.find(i => /Traversée en chaloupe/.test(i.text));
check('after three pirogue round trips the chaloupe opens: its fare (2 500 F), its passengers, Ousmane\'s share', before === 1 && !!cha3 && !cha3.dis && /2.500.F la place/.test(cha3.text) && /Ousmane prend 40/.test(cha3.text), JSON.stringify({ before, text: cha3?.text }));
await roundTrip('chaloupe', c3.pick, null);

// ================================================================== a reload in the middle of a leg
const c2 = await takeCrossing('pirogue');
await c2.pick();
await until(() => window.__dakar.traversee().phase === 'out' && window.__dakar.traversee().pose.z < -200, null, 240);
await shot('04-before-reload');
const wR = await wallet(), lR = await ledgerLen(), cR = (await tr()).counters;
await d(() => window.__dakar.save());
await page.reload({ timeout: 180000 });
await until(() => window.__dakar?.pos?.()?.hub === 'almadies' && !!window.__dakar.traversee?.(), null, 240);
await d(() => window.__dakar.setHour(10));
await page.waitForTimeout(1500);
const pR = await d(() => window.__dakar.pos()), tR = await tr();
check('reloaded mid-leg: the player is back on the sand at the anchor', atAnchor(pR) && !(await d(() => window.__dakar.seated())), JSON.stringify(pR));
check('both boats are back on the beach at their poses, nothing is paid for the unfinished leg, the counters as they were', tR.phase === 'idle' && ['pirogue', 'chaloupe'].every(k => beachedAt(tR.boats[k], tR.poses[k].home))
  && (await wallet()) === wR && (await ledgerLen()) === lR && JSON.stringify(tR.counters) === JSON.stringify(cR), JSON.stringify({ boats: tR.boats, wallet: [wR, await wallet()], counters: tR.counters }));

// ================================================================== at night
await d(a => { window.__dakar.setHour(21); window.__dakar.place(a.x, a.z + 1.3, Math.PI); }, ANCHOR);
await until(() => /:quai$/.test(window.__dakar.focus()?.id ?? ''), null, 60);
await page.waitForTimeout(800);
const why = await d(() => window.__dakar.focus()?.why ?? []);
await page.locator('#act').tap();
await page.waitForTimeout(600);
const toastNight = await d(() => document.getElementById('toast')?.textContent ?? '');
const actNight = await d(() => document.getElementById('act')?.textContent ?? '');
check('at night no crossing: the choice says when they start again', /reprise demain à 7 h/.test(why.join(' ')) && /reprise demain à 7 h/.test(actNight + ' ' + toastNight) && !(await d(() => window.__dakar.activity())), JSON.stringify({ why, act: actNight, toast: toastNight }));
await shot('05-night');

// ================================================================== fishing stays at Soumbédioune (the Corniche)
await d(() => { window.__dakar.setHour(9); window.__dakar.teleport('corniche'); });
await until(() => window.__dakar.pos().hub === 'corniche' && (window.__dakar.venues?.() ?? []).some(v => v.type === 'beach'), null, 240);
const beach = (await d(() => window.__dakar.venues())).find(v => v.type === 'beach');
const boatAt = beach?.anchors.find(a => a.id === 'pirogue');
await d(a => { window.__dakar.setHour(9); window.__dakar.place(a.x, a.z + 1.6, Math.PI); }, boatAt);
await until(() => /pirogue/.test(window.__dakar.focus()?.id ?? ''), null, 60);
const fishing = await d(() => window.__dakar.focus());
check('Soumbédioune still offers its fishing trip (« Partir avec les pêcheurs »)', /Partir avec les pêcheurs/.test((fishing?.all ?? []).join(' ')), JSON.stringify({ anchor: boatAt, focus: fishing }));

check('no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
console.log(`\n${results.length - failed}/${results.length} passed`);
await browser.close();
process.exit(failed ? 1 : 0);
