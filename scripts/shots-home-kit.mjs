// The home kit's pictures (docs/kits/HOMES.md): every template, the small ones under every hub identity, a plan and its mirror; from tools/home-viewer (src/housing/kit/viewer.ts), built apart
// from the game. Usage: node scripts/shots-home-kit.mjs [outDir]   (default docs/kits/homes). Needs `sharp` and a Chromium (CHROMIUM, or the Playwright one).
import { chromium } from 'playwright';
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import sharp from 'sharp';

const out = process.argv[2] ?? 'docs/kits/homes', dist = process.env.HOMES_DIST ?? '/tmp/claude-0/homes-dist';
fs.mkdirSync(out, { recursive: true });
execSync(`npx vite build -c vite.homes.config.ts --outDir ${dist} --emptyOutDir`, { stdio: 'inherit' });
const server = spawn('python3', ['-m', 'http.server', '4745', '-d', dist], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 640 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:4745/index.html');
  await page.waitForFunction(() => window.homes?.ready, null, { timeout: 120000 });
  const stats = {};
  const shot = async (name, o) => {
    const r = await page.evaluate(o => window.homes.show(o), o);
    await page.waitForTimeout(200);
    const buf = await page.screenshot({ type: 'png' });
    const png = await sharp(buf).png({ palette: true, quality: 90, effort: 8 }).toBuffer();
    fs.writeFileSync(`${out}/${name}.png`, png); stats[name] = { ...r, bytes: png.length };
    return png;
  };
  const sheet = async (name, names, cols) => {
    const imgs = await Promise.all(names.map(n => sharp(`${out}/${n}.png`).resize(450, 320).toBuffer()));
    const rows = Math.ceil(imgs.length / cols), canvas = sharp({ create: { width: cols * 450, height: rows * 320, channels: 3, background: '#0d1424' } });
    const buf = await canvas.composite(imgs.map((input, i) => ({ input, left: (i % cols) * 450, top: Math.floor(i / cols) * 320 }))).png({ palette: true, quality: 90, effort: 8 }).toBuffer();
    fs.writeFileSync(`${out}/${name}.png`, buf);
  };
  // every template, its own colours (the villa and the residence: the signature look; the house shows both its levels)
  const ladder = ['mini_studio', 'studio', 'f2', 'f3', 'house', 'villa', 'residence'];
  for (const t of ladder) await shot(t, { template: t, view: 'oblique' });
  await shot('house-etage', { template: 'house', level: 'etage', view: 'oblique' });
  await shot('villa-etage', { template: 'villa', level: 'etage', view: 'oblique' });
  // the same plan under every hub's identity
  const ids = ['pikine', 'mermoz', 'plateau', 'corniche', 'almadies'];
  for (const t of ['mini_studio', 'f3']) for (const id of ids) await shot(`${t}-${id}`, { template: t, identity: id, view: 'oblique' });
  await shot('f3-mermoz-miroir', { template: 'f3', identity: 'mermoz', mirror: true, view: 'oblique' });
  await shot('studio-mermoz-nuit', { template: 'studio', identity: 'mermoz', night: true, view: 'oblique' });
  await sheet('echelle', [...ladder], 4);
  await sheet('identites-mini-studio', ids.map(id => `mini_studio-${id}`), 3);
  await sheet('identites-f3', ids.map(id => `f3-${id}`), 3);
  fs.writeFileSync(`${out}/stats.json`, JSON.stringify({ errors, stats }, null, 1));
  console.log(errors.length ? `page errors: ${errors.join(' | ')}` : 'no page errors', Object.keys(stats).length, 'pictures');
  process.exitCode = errors.length ? 1 : 0;
} finally { await browser.close(); server.kill(); }
