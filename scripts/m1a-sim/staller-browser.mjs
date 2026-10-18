// The minimal-input strategies played in the real game with real keyboard events (default làmb, sans frappe): a ranked bout started
// through the game's own flow, then nothing / Garde held (KeyG) / Garde held + Dégager (KeyX) in the clinch window. Reports the result,
// its length in game seconds and the purse the career paid. Usage: npx vite preview --port 4207, then
//   node scripts/m1a-sim/staller-browser.mjs [baseUrl] [bouts per strategy]
import { chromium } from 'playwright';
const base = process.argv[2] ?? 'http://localhost:4207/';
const BOUTS = Number(process.argv[3] ?? 2);
const T = { timeout: 600000 };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 640, height: 360 } });
await ctx.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'low'); } catch { /* */ } });
const page = await ctx.newPage();
await page.goto(`${base}?debug`, { timeout: 120000 });
await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub, null, T);
const d = (fn, arg) => page.evaluate(fn, arg);
await d(() => { window.__dakar.teleport('pikine'); window.__dakar.setHour(10); });
await page.waitForFunction(() => window.__dakar.pos().hub === 'pikine', null, T);
console.log('lamb2 on:', await d(() => new URLSearchParams(location.search).has('lamb2')), '(default game: sans frappe)');
const rows = [];
for (const strategy of ['idle', 'holdGuard', 'guardAndBreak']) {
  for (let b = 0; b < BOUTS; b++) {
    await d(() => { const s = window.__dakar.state; s.data.needs.energie = 95; });
    const before = await d(() => ({ bouts: (window.__dakar.state.data.career?.bouts ?? []).length, wallet: window.__dakar.state.wallet }));
    await d(() => window.__dakar.duelStart('classe'));
    await page.waitForFunction(() => window.__dakar.duelInfo()?.phase === 'fight', null, T);
    // the game's own clock: frames count at most 0.1 s, like the duel (software rendering is slow)
    const t0 = await d(() => window.__dakar.duelInfo().t ?? null);
    if (strategy !== 'idle') await page.keyboard.down('KeyG');
    let inWindow = false, guard = 0;
    for (let guardN = 0; guardN < 4000; guardN++) {
      const i = await d(() => window.__dakar.duelInfo());
      if (!i || i.phase === 'result') break;
      if (strategy === 'guardAndBreak') {
        const open = i.phase === 'clinch' && !!i.clinch?.losing && !!i.clinch?.breakWindow;
        if (open && !inWindow) await page.keyboard.press('KeyX');
        inWindow = open;
      }
      await page.waitForTimeout(150);
    }
    await page.keyboard.up('KeyG');
    const res = await d(() => { const i = window.__dakar.duelInfo(); return i ? { phase: i.phase, result: i.result ?? null } : null; });
    await page.keyboard.press('Escape');                      // leaves the result card
    await page.waitForFunction(() => !window.__dakar.duelInfo(), null, T).catch(() => {});
    const after = await d(() => { const bs = window.__dakar.state.data.career?.bouts ?? []; return { bouts: bs.length, last: bs.at(-1) ?? null, wallet: window.__dakar.state.wallet }; });
    const row = { strategy, opp: after.last ? `${after.last.opp} L${after.last.level}` : '?', res: after.last?.res ?? '?', how: after.last?.how ?? '', purse: after.last?.purse ?? 0, newBouts: after.bouts - before.bouts, walletDelta: after.wallet - before.wallet, resultInfo: res };
    rows.push(row); console.log(JSON.stringify(row));
  }
}
console.log('\nSUMMARY');
for (const s of ['idle', 'holdGuard', 'guardAndBreak']) { const r = rows.filter(x => x.strategy === s); console.log(s.padEnd(14), r.map(x => `${x.res}${x.how ? '(' + x.how + ')' : ''} ${x.opp} +${x.purse}`).join(' | ')); }
await browser.close();
