// La traversée's acceptance on a phone (docs/TRAVERSEE.md « Acceptance »): the quay is the Embarcadère de Ngor and offers no fishing any more; at the
// pier's end the choice opens with real taps on the action button; a pirogue round trip to the island of Ngor and back, followed through
// window.__dakar.traversee(), each leg paying once exactly what the rules say (fares − Ousmane's share); after three pirogue round trips (the first
// by taps, the counter set for the other two) the chaloupe opens and a chaloupe round trip pays its own fares; a reload in the middle of a leg (back
// on the pier, nothing paid, nothing twice); the night (no crossing, the reason shown); Soumbédioune still offers its fishing trip. Pictures of the
// quay, the island from the pier, the boarding, the crossing, the island, the return (PNG, compressed under 400 kB).
// Usage: npx vite build && node /tmp/claude-0/beta/tools/serve.mjs "$PWD/dist" 4817 &  node scripts/check-traversee.mjs [baseUrl] [outDir]
import { chromium } from 'playwright';
import fs from 'node:fs';
import sharp from 'sharp';

const base = process.argv[2] ?? 'http://127.0.0.1:4817/';
const out = process.argv[3] ?? 'docs/proof/traversee/acceptance';
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

/** At the pier's end, the choice opened by a real tap on the action button (#act), the boat picked by a tap in the sheet. */
async function takeCrossing(kind) {
  await d(() => { window.__dakar.setHour(10); window.__dakar.place(30, -150, Math.PI); window.__dakar.state.data.needs.energie = 100; });
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
await d(() => { window.__dakar.setHour(10); window.__dakar.place(30, -150, Math.PI); });
await until(() => (window.__dakar.traversee()?.customers ?? []).filter(c => c.state === 'wait').length >= 3, null, 60);
await shot('01-island-from-the-pier');

// ================================================================== the choice at the pier's end
let t0 = await tr();
check('the embarcadère is built in the Almadies: both boats moored, customers waiting on the pier', !!t0 && t0.phase === 'idle' && t0.customers.length >= 3,
  JSON.stringify({ moored: t0?.moored && Object.fromEntries(Object.entries(t0.moored).map(([k, p]) => [k, [p.x, p.z, p.yaw]])), waiting: t0?.customers.length }));
const c1 = await takeCrossing('pirogue');
check('standing at the pier\'s end focuses the embarcadère; the action button offers the crossings', c1.focused && /Traversées/.test(c1.act), c1.act);
const pir = c1.items.find(i => /Traversée en pirogue/.test(i.text)), cha = c1.items.find(i => /Traversée en chaloupe/.test(i.text));
check('a tap opens the choice: the pirogue shows its fare, the passengers waiting and Ousmane\'s share', c1.sheet && !!pir && !pir.dis && /passagers? attend/.test(pir.text) && /1.000.F la place/.test(pir.text) && /Ousmane prend 40/.test(pir.text), pir?.text);
check('the chaloupe is closed and says how many pirogue crossings remain', !!cha && cha.dis && /encore 3/.test(cha.text), cha?.text);
await shot('02-choice');

// ================================================================== a round trip (the pirogue by taps; the chaloupe the same way)
/** Picks `kind` in the open choice and follows the crossing to the island and back, checking each leg's payment, the counters and the way off. */
async function roundTrip(kind, pick, shots) {
  const w0 = await wallet(), l0 = await ledgerLen(), counters0 = (await tr()).counters, fare = kind === 'pirogue' ? 1000 : 2500;
  await pick();
  const helm = await until(() => { const t = window.__dakar.traversee(); return t.helm.seated && t.helm.locked && t.phase !== 'idle'; }, null, 60);
  const plan = (await tr()).plan;
  check(`${kind}: a tap on « Traversée en ${kind} »: the player takes the helm (seated, locked)`, helm && (await tr()).boat === kind, JSON.stringify({ seated: await d(() => window.__dakar.seated()), plan: { out: plan.out.passengers, back: plan.back.passengers } }));
  if (shots) {
    await until(() => { const t = window.__dakar.traversee(); return t.customers.filter(c => c.leg === 'aller' && c.seated).length >= 2 && t.customers.some(c => c.leg === 'aller' && !c.seated); }, null, 120);
    await shot(`${shots}-boarding`);
  }
  const boarded = await until(p => window.__dakar.traversee().customers.filter(c => c.leg === 'aller' && c.seated).length === p, plan.out.passengers, 180);
  check(`${kind}: ${plan.out.passengers} customers walk down the pier and sit aboard`, boarded, JSON.stringify((await tr()).customers.map(c => [c.state, c.leg])));
  const z0 = (await tr()).pose.z;
  let sea = { roll: 0, wake: 0, z: z0 };
  await until(() => window.__dakar.traversee().phase === 'out', null, 60);
  for (let k = 0; k < 400; k++) {
    const t = await tr();
    sea = { roll: Math.max(sea.roll, Math.abs(t.pose.roll)), wake: Math.max(sea.wake, t.pose.wake), z: Math.min(sea.z, t.pose.z), locked: t.helm.locked };
    if (t.pose.z < -222 || t.phase !== 'out') break;
    await page.waitForTimeout(250);
  }
  const mid = await tr();
  check(`${kind}: across the open water: the boat moves, rocks, its wake shows, the helm stays locked`, mid.pose.z < z0 - 40 && sea.roll > 0.005 && sea.wake > 0.2 && mid.helm.locked && mid.helm.seated,
    JSON.stringify({ z: mid.pose.z, roll: +sea.roll.toFixed(3), wake: sea.wake, yaw: mid.pose.yaw }));
  if (shots) await shot(`${shots}-mid-crossing`);
  const landed = await until(() => window.__dakar.traversee().phase === 'land', null, 180);
  const atIsland = await tr();
  check(`${kind}: it moors at the island's jetty`, landed && Math.abs(atIsland.pose.x - 40.2) < 0.3 && Math.abs(atIsland.pose.z + 290) < 0.3, JSON.stringify(atIsland.pose));
  if (shots) { await until(() => window.__dakar.traversee().customers.filter(c => c.leg === 'aller' && c.state === 'leave').length >= 2, null, 60); await shot(`${shots}-island`); }
  const paid1 = await until(() => window.__dakar.traversee().paid.some(p => p.leg === 'aller' && p.kind === window.__dakar.traversee().boat), null, 120);
  const w1 = await wallet(), legs1 = await ledgerSince(l0);
  const leg1 = legs1.filter(([l]) => /^Traversée vers Ngor/.test(l));
  check(`${kind}: the island's leg is paid once on arrival: ${plan.out.net} F (${plan.out.passengers} × ${fare} F = ${plan.out.fares} F − Ousmane's ${plan.out.share} F)`,
    paid1 && plan.out.fares === plan.out.passengers * fare && leg1.length === 1 && leg1[0][1] === plan.out.net && w1 - w0 === legs1.reduce((s, [, a]) => s + a, 0),
    JSON.stringify({ lines: legs1, wallet: [w0, w1] }));
  const walkedOff = await until(() => window.__dakar.traversee().customers.filter(c => c.leg === 'aller').every(c => c.state === 'leave' || c.state === 'gone'), null, 60);
  check(`${kind}: the customers step off onto the jetty and walk up onto the island`, walkedOff, JSON.stringify((await tr()).customers.filter(c => c.side === 'ile').map(c => [c.state, c.x, c.z])));
  const backBoarded = await until(() => window.__dakar.traversee().phase === 'back', null, 120);
  check(`${kind}: ${plan.back.passengers} return customers come down the jetty and board`, backBoarded && (await tr()).customers.filter(c => c.leg === 'retour' && c.seated).length === plan.back.passengers);
  const home = await until(() => window.__dakar.traversee().phase === 'landBack', null, 240);
  const atQuay = await tr();
  check(`${kind}: the boat crosses back and moors at the pontoon, west side against it`, home && Math.abs(atQuay.pose.x - 34.2) < 0.3 && Math.abs(atQuay.pose.z + 168.5) < 0.3 && Math.abs(atQuay.pose.yaw) < 0.05, JSON.stringify(atQuay.pose));
  const done = await until(() => window.__dakar.traversee().phase === 'idle' && !window.__dakar.activity(), null, 120);
  if (shots) { await until(() => window.__dakar.traversee().customers.some(c => c.side === 'quai' && c.state === 'leave'), null, 10); await shot(`${shots}-back`); }
  const w2 = await wallet(), legs2 = await ledgerSince(l0), t2 = await tr();
  const leg2 = legs2.filter(([l]) => /^Traversée retour de Ngor/.test(l));
  check(`${kind}: the return leg is paid once: ${plan.back.net} F (${plan.back.passengers} × ${fare} F − Ousmane's ${plan.back.share} F)`, done && plan.back.fares === plan.back.passengers * fare && leg2.length === 1 && leg2[0][1] === plan.back.net && w2 - w0 === legs2.reduce((s, [, a]) => s + a, 0),
    JSON.stringify({ lines: legs2, wallet: [w0, w1, w2] }));
  const key = `traversees_${kind}`;
  check(`${kind}: the counters move by one round trip`, t2.counters.traversees === counters0.traversees + 1 && t2.counters[key] === counters0[key] + 1 && t2.counters.passagers_ngor === counters0.passagers_ngor + plan.out.passengers + plan.back.passengers, JSON.stringify(t2.counters));
  const p2 = await d(() => window.__dakar.pos());
  check(`${kind}: the player is set down on the pier at the anchor, free to walk`, Math.hypot(p2.x - 30, p2.z + 152) < 2.5 && p2.mode === 'play' && !(await d(() => window.__dakar.seated())), JSON.stringify(p2));
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
check('reloaded mid-leg: the player is back on the pier at the anchor', Math.hypot(pR.x - 30, pR.z + 152) < 2.5 && !(await d(() => window.__dakar.seated())), JSON.stringify(pR));
check('both boats are at their moorings, nothing is paid for the unfinished leg, the counters as they were', tR.phase === 'idle' && Math.abs(tR.moored.pirogue.z + 168.5) < 0.1 && Math.abs(tR.moored.chaloupe.z + 168.5) < 0.1
  && (await wallet()) === wR && (await ledgerLen()) === lR && JSON.stringify(tR.counters) === JSON.stringify(cR), JSON.stringify({ moored: tR.moored, wallet: [wR, await wallet()], counters: tR.counters }));

// ================================================================== at night
await d(() => { window.__dakar.setHour(21); window.__dakar.place(30, -150, Math.PI); });
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
