// MOBILE-01: does the built playtest preview start and measure, from a folder that is not the site root, under a strict content-security policy, with nothing but its own files?
// Usage: node scripts/check-preview.mjs [dir=dist-preview] [outDir=/tmp/preview-check]
// It serves the folder under a made-up sub-path (the way a hosted page is not at "/"), with a policy that allows only the page's own origin (plus inline script/style, blob workers
// and data: images, the things a sandboxed page host typically allows). A phone-sized touch page then: reads version.json, picks « Vitrine du propriétaire », waits for the frame
// meter (« Mesure de fluidité » is on in this build), checks no boot-error box and no policy violation, and, in a second page with ?debug, changes district and waits for the
// meter to name the change. It checks that the preview RUNS and is what version.json says; it does not say how the game plays on a phone (docs/mobile/MOBILE-01.md).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const [dir = 'dist-preview', out = '/tmp/preview-check'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const PREFIX = '/preview/92a6e2cf/', T = { timeout: 240000 };
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' };
const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'self' data: blob:; worker-src 'self' blob:; font-src 'self' data:";
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'); if (!u.pathname.startsWith(PREFIX)) { res.writeHead(404).end(); return; }
  let f = path.join(dir, decodeURIComponent(u.pathname.slice(PREFIX.length)) || 'index.html'); if (f.endsWith(path.sep)) f += 'index.html';
  if (!f.startsWith(path.resolve(dir)) && !path.resolve(f).startsWith(path.resolve(dir))) { res.writeHead(403).end(); return; }
  fs.readFile(f, (e, b) => { if (e) { res.writeHead(404).end(); return; } res.writeHead(200, { 'content-type': MIME[path.extname(f)] ?? 'application/octet-stream', 'content-security-policy': CSP, 'cache-control': 'no-store' }); res.end(b); });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}${PREFIX}`;
const version = JSON.parse(fs.readFileSync(path.join(dir, 'version.json'), 'utf8'));
let fails = 0; const check = (n, ok, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${n}${d ? ' ' + d : ''}`); if (!ok) fails++; };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const bundleServed = { v: false };
const open = async (query) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await context.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'low'); } catch { /* */ } });
  const page = await context.newPage(); page.setDefaultTimeout(240000);
  const problems = []; page.on('pageerror', e => problems.push('pageerror: ' + e.message));
  const optional = u => /car_rapide\.glb$|\/favicon\.ico$/.test(u);          // car_rapide.glb: an optional model the game asks for and does without (a 404 in every build and on every host); /favicon.ico: asked for when a host nests the page, whose icon link then sits in its body
  page.on('console', m => { if ((m.type() === 'error' || /Refused to|Content Security Policy/.test(m.text())) && !optional(m.location().url ?? '')) problems.push('console: ' + m.text().slice(0, 160) + ' ' + (m.location().url ?? '').slice(-80)); });
  page.on('requestfailed', r => { if (!optional(r.url())) problems.push('requestfailed: ' + r.url().slice(-80)); });
  page.on('console', m => { if (/\[vehicles\].*did not load/.test(m.text())) problems.push('vehicle model fell back: ' + m.text().slice(0, 160)); });
  page.on('response', r => { if (/glb-bundle\.json$/.test(r.url()) && r.status() === 200) bundleServed.v = true; });
  page.on('response', r => { if (r.status() >= 400 && !optional(r.url())) problems.push(`http ${r.status()}: ${r.url().slice(-80)}`); });
  await page.goto(base + (query ?? ''), { timeout: 180000 });
  return { page, context, problems };
};

// 1. the page as the owner gets it: no query string
{
  const { page, context, problems } = await open('');
  const v = await page.evaluate(async () => (await fetch('version.json')).json());
  check('version.json is served next to the page and names the playtest commit and the accepted candidate', v.commit === version.commit && v.baseCommit === version.baseCommit && v.baseCommit.startsWith('92a6e2cf'), `${v.buildId} <- ${v.baseCommit.slice(0, 8)}`);
  await page.waitForSelector('#owner-showcase [data-pick="showcase"]', T);
  await page.screenshot({ path: `${out}/01-start-card.png` });
  await page.click('[data-pick="showcase"]');
  await page.waitForFunction(() => /img\/s/.test(document.body.innerText), null, T);
  await page.waitForTimeout(8000);
  const meter = await page.evaluate(() => [...document.querySelectorAll('div')].map(d => d.innerText).find(t => /img\/s · 95 %/.test(t) && t.length < 200) ?? '');
  check('the frame meter is on from the start and names the place', /\d+ img\/s · 95 % < \d+ ms · [^·]+ · (à pied|au volant|dans un logement)/.test(meter), JSON.stringify(meter));
  check('memory shows on the meter (JS heap in Chrome, the renderer\'s own counts elsewhere)', /\d+ Mo|\d+ géom\./.test(meter), JSON.stringify(meter));
  const boot = await page.evaluate(() => [...document.querySelectorAll('pre')].some(p => /toucher pour fermer/.test(p.textContent ?? '')));
  check('no boot-error box on screen', !boot);
  check('the GLB models came from the bundle (this host serves no .glb) and the vehicles loaded as models, not stand-ins', bundleServed.v && !problems.some(p => /vehicle model fell back/.test(p)));
  check('nothing was refused by the policy, nothing failed to load, no uncaught error', problems.length === 0, JSON.stringify(problems.slice(0, 5)));
  await page.screenshot({ path: `${out}/02-showcase-start.png` });
  await context.close();
}

// 2. a district change is filed and shown (?debug only to change district quickly; the build under test is the same)
{
  const { page, context, problems } = await open('?debug&touch&heure=14');
  await page.waitForSelector('[data-pick="showcase"]', T); await page.click('[data-pick="showcase"]');
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub, null, T);
  await page.waitForTimeout(6000);
  const from = await page.evaluate(() => window.__dakar.pos().hub), to = from === 'corniche' ? 'plateau' : 'corniche';
  await page.evaluate(h => window.__dakar.teleport(h), to);
  await page.waitForFunction(h => window.__dakar.pos().hub === h, to, T);
  await page.waitForFunction(() => /quartier \d+ ms \(pire image \d+\)/.test(document.body.innerText), null, T);
  const meter = await page.evaluate(() => (document.body.innerText.match(/quartier \d+ ms \(pire image \d+\)/) ?? [''])[0]);
  check(`a district change (${from} → ${to}) is timed and shown on the meter`, !!meter, JSON.stringify(meter));
  check('no uncaught error across the change', problems.filter(p => /^pageerror/.test(p)).length === 0, JSON.stringify(problems.slice(0, 3)));
  await page.screenshot({ path: `${out}/03-after-district-change.png` });
  await context.close();
}
await browser.close(); server.close();
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
