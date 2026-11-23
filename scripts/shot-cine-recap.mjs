// A capture of the cinematic bout's result card (a draw by the clock). Usage: flock -o /tmp/dakar-browser.lock node scripts/shot-cine-recap.mjs <baseUrl> <out.jpg> [w h]
import { chromium } from 'playwright';
const [,, base, out, w = '390', h = '844'] = process.argv;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: +w, height: +h }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
await ctx.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'medium'); } catch { } });
const page = await ctx.newPage(); page.setDefaultTimeout(300000);
const errors = []; page.on('pageerror', e => errors.push(String(e)));
await page.goto(`${base}?debug&touch&rdabody=force`);
await page.waitForFunction(() => window.__dakar && window.__dakar.pos().hub);
await page.evaluate(() => { window.__dakar.teleport('pikine'); window.__dakar.setHour(16); });
await page.waitForFunction(() => window.__dakar.pos().hub === 'pikine');
await page.evaluate(() => window.__dakar.duelStart('amical', 'costaud', 'sans_frappe', 'Gora'));
await page.waitForFunction(() => (() => { const i = window.__dakar.duelInfo(); const c = i?.combat?.cine ?? i?.cine; return c?.phase === 'debout'; })());
// a sortie for him: walk him out? simpler: time out with the player ahead on points is not reachable here; end by the clock
await page.evaluate(() => window.__dakar.duelClock(0.5));
await page.waitForFunction(() => window.__dakar.duelInfo()?.phase === 'result');
await page.waitForTimeout(1200);
await page.screenshot({ path: out, type: 'jpeg', quality: 85 });
console.log(JSON.stringify({ errors }));
await browser.close();
