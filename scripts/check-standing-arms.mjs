// The player's arms standing (owner's iPhone playtest of the LD2.0-A preview, 25 Oct 2026: « the arm is still broken … when he runs it's fine but
// standing it looks broken »). The Idle clip holds the elbow nearly straight (3°), which a Meshy body's mesh pinches at the elbow; standing, the forearm
// is now bent and the upper arm brought a little forward (src/actors/humanoid.ts relaxArms, BODY_FIT.idleArms). Checked for both studio bodies:
//   - standing: the elbow bent 12–22°, the hand ahead of the shoulder line, the same after 40 still frames, after 10 s of play and after a walk;
//   - walking: the gait's arms (src/actors/gaitRig.ts), as in the build before;
//   - held poses (sitting, the wheel) exactly as the build before the change (`before` gives that build's URL);
//   - side and three-quarter pictures, standing, for the proof.
// Debug hooks only set the scene (the body, a place, the camera, a held pose, paused frames) and read the bones.
// Usage: node scripts/check-standing-arms.mjs <baseUrl> <outDir> [beforeUrl]
import { chromium } from 'playwright';
import fs from 'node:fs';

const [base = 'http://localhost:4173/', out = '/tmp/claude-0/ld2/arms', before] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
let fails = 0, total = 0;
const check = (name, ok, extra = '') => { total++; if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${String(extra).slice(0, 400)}`); };

/** A page with the player as `avatar`, at a quiet spot of Pikine, the HUD hidden. */
async function open(url, avatar) {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 560 } });
  await ctx.addInitScript(a => { try { localStorage.setItem('dakarrek.quality', 'high'); localStorage.setItem('dakarrek.guest.save.v6', JSON.stringify({ schemaVersion: 6, guestId: 'g-arms-' + a, avatar: a })); } catch { /* */ } }, avatar);
  const page = await ctx.newPage(); page.setDefaultTimeout(300000);
  await page.goto(`${url}?debug&heure=11`, { timeout: 180000 });
  await page.waitForFunction(() => window.__dakar?.pos?.().hub && window.__dakar.body?.() && !document.getElementById('studio'), null, { timeout: 300000 });
  await page.waitForTimeout(2000);
  await page.evaluate(() => { document.getElementById('ui').style.display = 'none'; window.__dakar.place(-8, -58.5, 0); });
  await page.waitForTimeout(1200);
  return { ctx, page };
}
/** Both arms: the elbow's bend (deg), and how far the hand is ahead of the shoulder (m, along the chest's forward axis). */
const arms = page => page.evaluate(() => {
  const g = window.__dakar.body().group, V = g.position.constructor, Q = g.quaternion.constructor; g.updateMatrixWorld(true);
  const P = n => { const v = new V(); g.getObjectByName(n).getWorldPosition(v); return v; };
  const qc = new Q(); g.getObjectByName('chest').getWorldQuaternion(qc); const fwd = new V(0, 0, 1).applyQuaternion(qc);
  const one = s => { const a = P('upper_arm' + s), e = P('forearm' + s), w = P('hand' + s); return { bend: +(Math.acos(Math.min(1, e.clone().sub(a).normalize().dot(w.clone().sub(e).normalize()))) * 57.2958).toFixed(1), ahead: +w.clone().sub(a).dot(fwd).toFixed(3) }; };
  return { L: one('L'), R: one('R') };
});
/** A fresh page's first steps of a walk (forward key held, paused frames): the right elbow's bend every 15 frames. */
async function walkFresh(url, avatar) {
  const { ctx, page } = await open(url, avatar);
  await still(page, 30); await page.keyboard.down('KeyW'); const walk = [];
  for (let i = 0; i < 6; i++) { await still(page, 15); walk.push((await arms(page)).R.bend); }
  await page.keyboard.up('KeyW'); await ctx.close(); return walk;
}
const still = (page, n, hold = null) => page.evaluate(([n, h]) => { const D = window.__dakar; D.pause(true); D.body().hold = h; D.step(1 / 60, n); }, [n, hold]);
const relaxed = a => a.L.bend >= 12 && a.L.bend <= 22 && a.R.bend >= 12 && a.R.bend <= 22 && a.L.ahead > 0.03 && a.R.ahead > 0.03;

try {
  for (const avatar of ['homme', 'femme']) {
    const { ctx, page } = await open(base, avatar);
    // standing, still frames (the mixer writes a bone only when the clip's value changes: the bend must not add up)
    await still(page, 40); const s40 = await arms(page);
    await still(page, 40); const s80 = await arms(page);
    check(`${avatar}: standing, the elbow bent 12–22° and the hand ahead of the shoulder; 40 frames on, the same bend (the clip breathes, the bend never adds up)`, relaxed(s40) && relaxed(s80) && Math.abs(s80.L.bend - s40.L.bend) < 0.5 && Math.abs(s80.R.bend - s40.R.bend) < 0.5, JSON.stringify({ s40, s80 }));
    // pictures
    for (const [tag, side] of [['side', Math.PI / 2], ['3q', 0.5]]) {
      await page.evaluate(s => { const D = window.__dakar; D.portrait(1.55, 1.05, s); D.step(1 / 60, 1); D.render?.(); }, side);
      await page.waitForTimeout(250); await page.screenshot({ path: `${out}/standing-${avatar}-${tag}.png` });
    }
    // ten seconds of play (real frames)
    await page.evaluate(() => { const D = window.__dakar; D.portrait(0); D.pause(false); });
    await page.waitForTimeout(10000);
    await page.evaluate(() => window.__dakar.pause(true)); const s10 = await arms(page);
    check(`${avatar}: after 10 s of play, standing, still relaxed`, relaxed(s10), JSON.stringify(s10));
    // a walk: the gait's arms, then standing again
    await page.evaluate(() => window.__dakar.pause(true));
    await page.keyboard.down('KeyW'); const walk = [];
    for (let i = 0; i < 6; i++) { await still(page, 15); walk.push((await arms(page)).R.bend); }
    await page.keyboard.up('KeyW');
    const moved = await page.evaluate(() => window.__dakar.pos());
    await still(page, 60); const after = await arms(page);
    check(`${avatar}: walking, the gait swings the arms (the elbow's bend changes from step to step), then standing again, relaxed as before`, Math.max(...walk) - Math.min(...walk) > 3 && relaxed(after) && Math.abs(after.R.bend - s40.R.bend) < 1.5, JSON.stringify({ walk, after, at: [moved.x.toFixed(1), moved.z.toFixed(1)] }));
    // held poses: what the build before shows (sitting on the ground, at the wheel)
    if (before) {
      const held = {};
      for (const h of ['Sit', 'Drive']) { await still(page, 40, h); held[h] = await arms(page); }
      const old = await open(before, avatar), heldBefore = {};
      for (const h of ['Sit', 'Drive']) { await still(old.page, 40, h); heldBefore[h] = await arms(old.page); }
      await old.ctx.close();
      const same = ['Sit', 'Drive'].every(h => ['L', 'R'].every(s => Math.abs(held[h][s].bend - heldBefore[h][s].bend) < 0.5 && Math.abs(held[h][s].ahead - heldBefore[h][s].ahead) < 0.01));
      check(`${avatar}: held poses (sitting, at the wheel) unchanged from the build before`, same, JSON.stringify({ held, heldBefore }));
      // walking: the gait's arms as before (its rest pose is taken before the standing arms; the first 0.25 s is the standing pose fading out)
      const [w1, w0] = [await walkFresh(base, avatar), await walkFresh(before, avatar)];
      check(`${avatar}: walking, the arms as in the build before once the standing pose has faded (0.25 s)`, w1.slice(1).every((v, i) => Math.abs(v - w0[i + 1]) < 0.5), JSON.stringify({ now: w1, before: w0 }));
    }
    await ctx.close();
  }
} catch (e) {
  check('the run went through', false, e.stack ?? String(e));
} finally {
  await browser.close();
  console.log(`${total - fails}/${total} passed`);
  process.exitCode = fails ? 1 : 0;
}
