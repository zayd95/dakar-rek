// « Reconnexion » during play (playtest of 24 Oct 2026): an online build whose presence socket keeps dropping (here: no server at all, the worst case)
// must not keep a « Reconnexion… » pill over the game on a phone. Samples the pill for `secs` seconds in portrait and landscape.
// Usage: node scripts/check-presence-quiet.mjs <baseUrl of an online-mode build> [secs]
import { chromium } from 'playwright';

const [base = 'http://localhost:4602/', secs = '30'] = process.argv.slice(2);
const results = []; let failed = 0;
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok }); if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${detail}`); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
try {
  for (const [label, viewport] of [['portrait 390×844', { width: 390, height: 844 }], ['landscape 844×390', { width: 844, height: 390 }]]) {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await ctx.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'low'); } catch { /* */ } });
    const page = await ctx.newPage();
    await page.goto(`${base}?debug&touch&heure=11`, { timeout: 180000 });
    await page.waitForFunction(() => window.__dakar?.pos?.().hub && !document.getElementById('studio'), null, { timeout: 300000 });
    const seen = new Map();
    for (let i = 0; i < +secs; i++) {
      const s = await page.evaluate(() => { const b = document.getElementById('presenceBtn'); if (!b) return null; const r = b.getBoundingClientRect(), cs = getComputedStyle(b); return { state: b.dataset.state, text: b.textContent, shown: cs.display !== 'none' && r.width > 0 && r.height > 0 }; });
      if (s) { const k = `${s.state}|${s.shown ? 'shown' : 'hidden'}|${s.text}`; seen.set(k, (seen.get(k) ?? 0) + 1); }
      await page.waitForTimeout(1000);
    }
    const states = [...seen.keys()];
    console.log(`  ${label}: ${states.map(k => `${k} ×${seen.get(k)}`).join(' · ')}`);
    check(`${label}: the presence socket really dropped and retried during the sample`, states.some(k => k.startsWith('reconnecting') || k.startsWith('connecting')));
    check(`${label}: no connection pill over the game while it retries`, !states.some(k => k.includes('|shown|')), states.filter(k => k.includes('|shown|')).join(' · '));
    await ctx.close();
  }
} finally {
  await browser.close();
  console.log(`${results.length - failed}/${results.length} passed`);
  process.exitCode = failed ? 1 : 0;
}
