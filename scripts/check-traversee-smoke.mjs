// La traversée, lane G's smoke on a phone (docs/TRAVERSEE.md): at the Embarcadère de Ngor's pier end, open the choice with real taps on the action
// button, take the pirogue across to the island and back, follow window.__dakar.traversee() through every step, and check that each leg pays once
// exactly what the rules say (fares − Ousmane's share); then a reload in the middle of a leg (back on the pier, nothing paid, nothing twice) and the
// night (no crossing, the reason shown). Pictures at the boarding, mid-crossing, at the island and back (PNG, compressed under 400 kB).
// The integration owner's acceptance is scripts/check-traversee.mjs; this one is the crossing lane's own.
// Usage: npx vite build && node /tmp/claude-0/beta/tools/serve.mjs "$PWD/dist" 4817 &  node scripts/check-traversee-smoke.mjs [baseUrl] [outDir]
import { chromium } from 'playwright';
import fs from 'node:fs';
import sharp from 'sharp';

const base = process.argv[2] ?? 'http://127.0.0.1:4817/';
const out = process.argv[3] ?? 'docs/proof/traversee/crossing';
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
await d(() => { window.__dakar.setHour(10); window.__dakar.place(30, -150, Math.PI); });
await until(() => (window.__dakar.traversee()?.customers ?? []).filter(c => c.state === 'wait').length >= 3, null, 60);

// ================================================================== the choice at the pier's end
let t0 = await tr();
check('the embarcadère is built in the Almadies: both boats moored, customers waiting on the pier', !!t0 && t0.phase === 'idle' && t0.customers.length >= 3,
  JSON.stringify({ moored: t0?.moored && Object.fromEntries(Object.entries(t0.moored).map(([k, p]) => [k, [p.x, p.z, p.yaw]])), waiting: t0?.customers.length }));
const c1 = await takeCrossing('pirogue');
check('standing at the pier\'s end focuses the embarcadère; the action button offers the crossings', c1.focused && /Traversées/.test(c1.act), c1.act);
const pir = c1.items.find(i => /Traversée en pirogue/.test(i.text)), cha = c1.items.find(i => /Traversée en chaloupe/.test(i.text));
check('a tap opens the choice: the pirogue shows its fare, the passengers waiting and Ousmane\'s share', c1.sheet && !!pir && !pir.dis && /passagers? attend/.test(pir.text) && /1.000.F la place/.test(pir.text) && /Ousmane prend 40/.test(pir.text), pir?.text);
check('the chaloupe is closed and says how many pirogue crossings remain', !!cha && cha.dis && /encore 3/.test(cha.text), cha?.text);
await shot('01-choice');

// ================================================================== a pirogue round trip
const w0 = await wallet(), l0 = await ledgerLen(), counters0 = (await tr()).counters;
await c1.pick();
const helm = await until(() => { const t = window.__dakar.traversee(); return t.helm.seated && t.helm.locked && t.phase !== 'idle'; }, null, 60);
const plan = (await tr()).plan;
check('a tap on « Traversée en pirogue »: the player takes the helm (seated, locked)', helm, JSON.stringify({ seated: await d(() => window.__dakar.seated()), plan: { out: plan.out.passengers, back: plan.back.passengers } }));
await until(() => { const t = window.__dakar.traversee(); return t.customers.filter(c => c.leg === 'aller' && c.seated).length >= 2 && t.customers.some(c => c.leg === 'aller' && !c.seated); }, null, 120);
await shot('02-boarding');
const boarded = await until(p => window.__dakar.traversee().customers.filter(c => c.leg === 'aller' && c.seated).length === p, plan.out.passengers, 180);
check(`${plan.out.passengers} customers walk down the pier and sit aboard`, boarded, JSON.stringify((await tr()).customers.map(c => [c.state, c.leg])));
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
check('across the open water: the boat moves, rocks, its wake shows, the helm stays locked', mid.pose.z < z0 - 40 && sea.roll > 0.02 && sea.wake > 0.25 && mid.helm.locked && mid.helm.seated,
  JSON.stringify({ z: mid.pose.z, roll: +sea.roll.toFixed(3), wake: sea.wake, yaw: mid.pose.yaw }));
await shot('03-mid-crossing');
const landed = await until(() => window.__dakar.traversee().phase === 'land', null, 180);
const atIsland = await tr();
check('it moors at the island\'s jetty', landed && Math.abs(atIsland.pose.x - 40.2) < 0.3 && Math.abs(atIsland.pose.z + 290) < 0.3, JSON.stringify(atIsland.pose));
await until(() => window.__dakar.traversee().customers.filter(c => c.leg === 'aller' && c.state === 'leave').length >= 2, null, 60);
await shot('04-island');
const paid1 = await until(() => window.__dakar.traversee().paid.length >= 1, null, 120);
const w1 = await wallet(), legs1 = await ledgerSince(l0);
const leg1 = legs1.filter(([l]) => /^Traversée vers Ngor/.test(l));
check(`the island's leg is paid once on arrival: ${plan.out.net} F (${plan.out.fares} F − Ousmane's ${plan.out.share} F)`, paid1 && leg1.length === 1 && leg1[0][1] === plan.out.net && w1 - w0 === legs1.reduce((s, [, a]) => s + a, 0),
  JSON.stringify({ lines: legs1, wallet: [w0, w1] }));
const walkedOff = await until(() => window.__dakar.traversee().customers.filter(c => c.leg === 'aller').every(c => c.state === 'leave' || c.state === 'gone'), null, 60);
check('the customers step off onto the jetty and walk up onto the island', walkedOff, JSON.stringify((await tr()).customers.filter(c => c.side === 'ile').map(c => [c.state, c.x, c.z])));
const backBoarded = await until(() => window.__dakar.traversee().phase === 'back', null, 120);
check(`${plan.back.passengers} return customers come down the jetty and board`, backBoarded && (await tr()).customers.filter(c => c.leg === 'retour' && c.seated).length === plan.back.passengers);
const home = await until(() => window.__dakar.traversee().phase === 'landBack', null, 240);
const atQuay = await tr();
check('the boat crosses back and moors at the pontoon, west side against it', home && Math.abs(atQuay.pose.x - 34.2) < 0.3 && Math.abs(atQuay.pose.z + 168.5) < 0.3 && Math.abs(atQuay.pose.yaw) < 0.05, JSON.stringify(atQuay.pose));
const done = await until(() => window.__dakar.traversee().phase === 'idle' && !window.__dakar.activity(), null, 120);
await until(() => window.__dakar.traversee().customers.some(c => c.side === 'quai' && c.state === 'leave'), null, 10);
await shot('05-back');
const w2 = await wallet(), legs2 = await ledgerSince(l0), t2 = await tr();
const leg2 = legs2.filter(([l]) => /^Traversée retour de Ngor/.test(l));
check(`the return leg is paid once: ${plan.back.net} F (${plan.back.fares} F − Ousmane's ${plan.back.share} F)`, done && leg2.length === 1 && leg2[0][1] === plan.back.net && w2 - w0 === legs2.reduce((s, [, a]) => s + a, 0),
  JSON.stringify({ lines: legs2, wallet: [w0, w1, w2] }));
check('the counters move by one round trip', t2.counters.traversees === counters0.traversees + 1 && t2.counters.traversees_pirogue === counters0.traversees_pirogue + 1 && t2.counters.passagers_ngor === counters0.passagers_ngor + plan.out.passengers + plan.back.passengers, JSON.stringify(t2.counters));
const p2 = await d(() => window.__dakar.pos());
check('the player is set down on the pier at the anchor, free to walk', Math.hypot(p2.x - 30, p2.z + 152) < 2.5 && p2.mode === 'play' && !(await d(() => window.__dakar.seated())), JSON.stringify(p2));
console.log(`PAID: aller ${leg1[0]?.[1]} F · retour ${leg2[0]?.[1]} F · plan ${JSON.stringify({ out: plan.out, back: plan.back })}`);

// ================================================================== a reload in the middle of a leg
const c2 = await takeCrossing('pirogue');
await c2.pick();
await until(() => window.__dakar.traversee().phase === 'out' && window.__dakar.traversee().pose.z < -200, null, 240);
await shot('06-before-reload');
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
await shot('07-night');

check('no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
console.log(`\n${results.length - failed}/${results.length} passed`);
await browser.close();
process.exit(failed ? 1 : 0);
