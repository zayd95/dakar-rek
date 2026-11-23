// Furnishing on a phone: orbit / pinch / overhead view, drag a piece, rotate, collisions, close, reopen, reload.
// Usage: node scripts/check-home-editor.mjs [baseUrl] [outDir]   (localhost preview: ?argent= is honoured there)
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:4447/', out = process.argv[3] ?? 'shots/home-editor';
fs.mkdirSync(out, { recursive: true });
const T = { timeout: 120000 };
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`, extra); assert.ok(ok, name); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });

async function run(label, viewport) {
  const ctx = await browser.newContext({ viewport, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }), page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const d = (fn, arg) => page.evaluate(fn, arg);
  const shot = async n => { await page.waitForTimeout(350); await page.screenshot({ path: `${out}/${label}-${n}.png` }); };
  const go = async () => { await page.goto(`${base}?debug&touch&argent=50000000`, T); await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.estate, null, T); };
  const enterApartment = async () => { await d(() => window.__dakar.assetSheet('appart_jamm')); await page.locator('#modal.on .item', { hasText: 'Entrer chez toi' }).first().click(); };
  const info = () => d(() => window.__dakar.placer.info());
  /** Synthetic touch pointers on the canvas (pointer events: what the editor listens to). */
  const ptr = (type, id, x, y) => d(([type, id, x, y]) => document.getElementById('c').dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: id === 1, clientX: x, clientY: y, bubbles: true, cancelable: true })), [type, id, x, y]);
  const drag = async (id, x0, y0, x1, y1, steps = 8) => { await ptr('pointerdown', id, x0, y0); for (let i = 1; i <= steps; i++) { await ptr('pointermove', id, x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps); await page.waitForTimeout(30); } await ptr('pointerup', id, x1, y1); };

  await go();
  await d(() => { const D = window.__dakar; D.buyAsset('appart_jamm'); D.moveIn('appart_jamm'); for (const p of ['miroir', 'tapis', 'chaises']) D.buyPiece(p); });
  await d(() => { window.__dakar.setHour(10); window.__dakar.teleport('pikine'); }); await page.waitForTimeout(1500);
  await enterApartment(); await page.waitForFunction(() => window.__dakar.pos().x > 900, null, T);
  await page.waitForFunction(() => window.__dakar.pos().mode === 'play', null, T).catch(() => {});
  await page.waitForTimeout(800);
  const joyBefore = await d(() => getComputedStyle(document.getElementById('joy')).display);
  check(`${label}: opening the editor works inside the F2 apartment`, await d(() => window.__dakar.placer.open()) === true && (await info()).open);
  await page.waitForTimeout(600);
  check(`${label}: the toolbar is compact (under 22% of the screen height, collapsed)`, await d(() => { const r = document.getElementById('placer').getBoundingClientRect(); return r.height / innerHeight < 0.22; }), String(await d(() => Math.round(document.getElementById('placer').getBoundingClientRect().height))));
  check(`${label}: Rotate, Place, Store and Done are all on the toolbar`, await d(() => ['rot', 'put', 'stash', 'done'].every(a => { const b = document.querySelector(`#placer [data-a="${a}"]`); return b && b.getBoundingClientRect().width > 30 && b.getBoundingClientRect().bottom <= innerHeight; })));
  await shot('1-overhead-open');

  // keep a piece placed to compare against
  const before = await info();
  const W = viewport.width, H = viewport.height;
  // orbit with one finger on an empty spot: nothing moves
  const l0 = await d(() => window.__dakar.placer.look());
  await drag(1, W * 0.06, H * 0.45, W * 0.06 + 90, H * 0.45 + 70);
  const l1 = await d(() => window.__dakar.placer.look());
  const afterOrbit = await info();
  check(`${label}: a one-finger drag on an empty spot orbits the room (yaw/pitch changed)`, Math.abs(l1.yaw - l0.yaw) > 0.3 && Math.abs(l1.pitch - l0.pitch) > 0.1, JSON.stringify([l0, l1]));
  check(`${label}: orbiting moves no furniture`, JSON.stringify(afterOrbit.items) === JSON.stringify(before.items) && JSON.stringify(afterOrbit.pending) === JSON.stringify(before.pending));
  await shot('2-orbited');
  // pinch to zoom in
  await ptr('pointerdown', 1, W * 0.4, H * 0.4); await ptr('pointerdown', 2, W * 0.6, H * 0.4);
  for (let i = 1; i <= 6; i++) { await ptr('pointermove', 1, W * (0.4 - 0.03 * i), H * 0.4); await ptr('pointermove', 2, W * (0.6 + 0.03 * i), H * 0.4); await page.waitForTimeout(30); }
  await ptr('pointerup', 2, W * 0.78, H * 0.4); await ptr('pointerup', 1, W * 0.22, H * 0.4);
  const l2 = await d(() => window.__dakar.placer.look());
  check(`${label}: pinch zooms in (${l1.zoom.toFixed(2)} → ${l2.zoom.toFixed(2)}) and moves no furniture`, l2.zoom < l1.zoom - 0.2 && JSON.stringify((await info()).items) === JSON.stringify(before.items));
  await shot('3-zoomed');
  // overhead / angle toggle
  await page.locator('#placer [data-a="view"]').tap(); await page.waitForTimeout(200);
  const l3 = await d(() => window.__dakar.placer.look());
  check(`${label}: the view button switches between the angled and the overhead view`, Math.abs(l3.pitch - l2.pitch) > 0.3, `${l2.pitch.toFixed(2)} → ${l3.pitch.toFixed(2)}`);
  await d(() => window.__dakar.placer.look({ yaw: 0, pitch: 1.53, zoom: 1 })); await page.waitForTimeout(300);

  // pick the first piece and drag it with one finger
  const first = (await info()).items.find(f => f.spec === 'chaises');
  await d(uid => window.__dakar.placer.select(uid), first.uid); await page.waitForTimeout(300);
  const scan = []; for (let ox = -42; ox <= 42; ox += 6) for (let oy = -30; oy <= 30; oy += 6) scan.push([ox, oy]); scan.sort((a, b) => Math.hypot(...a) - Math.hypot(...b));
  const trial = [[0, 0], [0.07, 0], [-0.07, 0], [0, 0.04], [0, -0.04], [0.06, 0.04], [-0.06, -0.04]];
  let i2 = null, at0 = null, moved = false, drags = 0;
  for (const [fx, fy] of trial) {
    if (fx === 0 && fy === 0) continue;
    await d(uid => { window.__dakar.placer.look({ yaw: 0, pitch: 1.53, zoom: 1 }); window.__dakar.placer.select(uid); }, first.uid); await page.waitForTimeout(300);
    const c0 = await d(() => window.__dakar.placer.screenOf());
    // the pair of chairs has a gap in its middle: find a pixel that is on a chair (a real finger taps the piece itself)
    let p0 = c0;
    for (const [ox, oy] of scan) {
      await ptr('pointerdown', 1, c0.x + ox, c0.y + oy); const g = (await info()).gesture; await ptr('pointerup', 1, c0.x + ox, c0.y + oy);
      if (g === 'drag') { p0 = { x: c0.x + ox, y: c0.y + oy }; break; }
    }
    await d(uid => { window.__dakar.placer.look({ yaw: 0, pitch: 1.53, zoom: 1 }); window.__dakar.placer.select(uid); }, first.uid); await page.waitForTimeout(300);
    at0 = (await info()).pending;
    await drag(1, p0.x, p0.y, p0.x + W * fx, p0.y + H * fy, 10); drags++;
    i2 = await info(); moved = !!i2.pending && (i2.pending.x !== at0.x || i2.pending.z !== at0.z);
    if (moved && !i2.why) break;
  }
  check(`${label}: dragging the piece with one finger moves it (grid ${at0.x},${at0.z} → ${i2.pending.x},${i2.pending.z}, ${drags} tries) and does not orbit`, moved && JSON.stringify(await d(() => window.__dakar.placer.look())) === JSON.stringify({ yaw: 0, pitch: 1.53, zoom: 1 }));
  const placed = i2.items.find(f => f.uid === first.uid);
  check(`${label}: released where it fits, the piece is placed and saved at once`, !i2.why && !!placed?.at && placed.at.x === i2.pending.x && placed.at.z === i2.pending.z, JSON.stringify([i2.why, placed]));
  await shot('4-dragged');
  // rotate
  const r0 = (await info()).pending.rot; await page.locator('#placer [data-a="rot"]').tap(); await page.waitForTimeout(150);
  const r1 = (await info()).pending.rot;
  check(`${label}: Rotate turns the piece`, r1 !== r0, `${r0} → ${r1}`);
  const whyRot = (await info()).why;
  await page.locator('#placer [data-a="put"]').tap(); await page.waitForTimeout(200);
  const savedRot = (await info()).items.find(f => f.uid === first.uid).at.rot;
  check(`${label}: Place saves the rotation when it fits, and refuses it when it does not (${whyRot ?? 'fits'})`, whyRot ? savedRot === r0 : savedRot === r1);
  // collisions: out of the room is refused, and not saved
  await d(() => window.__dakar.placer.moveTo(40, 40));
  const bad = await info(), saved = bad.items.find(f => f.uid === first.uid).at;
  await page.locator('#placer [data-a="put"]').tap(); await page.waitForTimeout(200);
  const after = (await info()).items.find(f => f.uid === first.uid).at;
  check(`${label}: a spot out of the room is refused ("${bad.why}") and the saved spot is kept`, !!bad.why && after.x === saved.x && after.z === saved.z);
  await shot('5-refused');
  // the list drawer
  await page.locator('#placer [data-a="more"]').tap(); await page.waitForTimeout(250);
  check(`${label}: the list opens from the toolbar and stays inside the screen`, await d(() => { const r = document.getElementById('placer').getBoundingClientRect(); return document.querySelectorAll('#placer .pl-items button').length >= 3 && r.top > 0 && r.bottom <= innerHeight + 1; }));
  await shot('6-list');
  await page.locator('#placer [data-a="more"]').tap();

  // close: normal play camera and controls come back
  const finalAt = (await info()).items.map(f => ({ uid: f.uid, at: f.at }));
  await d(() => window.__dakar.placer.moveTo(0, 0)); // leave a pending move that must not be saved
  await page.locator('#placer [data-a="done"]').tap(); await page.waitForTimeout(600);
  const st = await d(() => ({ mode: window.__dakar.pos().mode, placing: document.body.classList.contains('placing'), joy: getComputedStyle(document.getElementById('joy')).display, open: window.__dakar.placer.info().open }));
  check(`${label}: Done restores the play mode, the joystick and the normal camera`, st.mode === 'play' && !st.placing && !st.open && st.joy === joyBefore, JSON.stringify(st));
  await shot('7-closed');
  // reopen: the same placements
  await d(() => window.__dakar.placer.open()); await page.waitForTimeout(400);
  const reopened = (await info()).items.map(f => ({ uid: f.uid, at: f.at }));
  check(`${label}: reopening shows every piece where it was left`, JSON.stringify(reopened) === JSON.stringify(finalAt));
  await d(() => window.__dakar.placer.close());
  // reload
  await d(() => dispatchEvent(new Event('pagehide')));
  await page.goto('about:blank'); await go();
  await d(() => { window.__dakar.setHour(10); window.__dakar.teleport('pikine'); }); await page.waitForTimeout(1500);
  await enterApartment(); await page.waitForFunction(() => window.__dakar.pos().x > 900, null, T); await page.waitForTimeout(600);
  await d(() => window.__dakar.placer.open()); await page.waitForTimeout(400);
  const reloaded = (await info()).items.map(f => ({ uid: f.uid, at: f.at }));
  check(`${label}: after a reload every piece is where it was placed`, JSON.stringify(reloaded) === JSON.stringify(finalAt), JSON.stringify(reloaded));
  await shot('8-reloaded');
  check(`${label}: no JavaScript errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}
try {
  if (process.env.ONLY !== 'landscape') await run('portrait', { width: 390, height: 844 });
  if (process.env.ONLY !== 'portrait') await run('landscape', { width: 844, height: 390 });
  console.log('home editor checks passed');
} finally { await browser.close(); }
