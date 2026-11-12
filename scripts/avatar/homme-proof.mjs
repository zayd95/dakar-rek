// The homme's before/after evidence, from real Three.js renders of the hair lab (scripts/avatar/hairlab.ts, dev server): his face, his body and arms, his elbows
// bent (riding, sitting, gestures), the same scenes in clay (the geometry alone, no texture to hide or fake a fold), and the corrected body in every retained
// hairstyle, skin tone, outfit, light and gait. Three labelled sheets and one short animation (before | after, walk and run) into docs/avatar/proof/homme/.
// "Before" is the body as the studio shipped it before the fix: put that body_m.glb / body_m_low.glb under public/_before/assets/meshy/ (not committed).
// Usage: npx vite --port 4501 & node scripts/avatar/homme-proof.mjs [outDir=docs/avatar/proof/homme] [--only=visage|corps|matrice|animation]
import { chromium } from 'playwright';
import sharp from 'sharp';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2), ONLY = args.find(a => a.startsWith('--only='))?.slice(7), want = k => !ONLY || ONLY === k;
const out = args.filter(a => !a.startsWith('--'))[0] ?? 'docs/avatar/proof/homme', BASE = process.env.BASE ?? 'http://127.0.0.1:4501/';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
/** One lab picture: the query's rows × views, as a PNG buffer. */
async function lab(query, w, h) {
  const p = await browser.newPage({ viewport: { width: w, height: h } });
  p.on('pageerror', e => { if (e.message !== 'done') console.log('pageerror', e.message); });
  await p.goto(`${BASE}scripts/avatar/hairlab.html?${query}`);
  await p.waitForFunction(() => window.__ready, null, { timeout: 300000 });
  const png = await p.locator('#c').screenshot(); await p.close(); return png;
}
const BG = '#11151f', INK = '#f2ece2', DIM = '#9aa3b5', LW = 200, TITLE = 44;
const esc = t => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const svg = (w, h, body) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="${BG}"/>${body}</svg>`);
/** A panel: a title over the lab picture, a label at the left of each row. */
async function panel(title, png, labels, rowH) {
  const m = await sharp(png).metadata(), W = LW + m.width, H = TITLE + m.height;
  const text = labels.map((l, i) => `<text x="${LW - 12}" y="${TITLE + i * rowH + rowH / 2 + 6}" font-family="DejaVu Sans, Arial" font-size="17" fill="${l.startsWith('Avant') ? DIM : INK}" text-anchor="end">${esc(l)}</text>`).join('');
  return sharp(svg(W, H, `<text x="16" y="29" font-family="DejaVu Sans, Arial" font-size="21" font-weight="bold" fill="${INK}">${esc(title)}</text>${text}`)).composite([{ input: png, top: TITLE, left: LW }]).png().toBuffer();
}
/** Panels stacked into one JPEG. */
async function sheet(file, heading, panels) {
  const metas = await Promise.all(panels.map(p => sharp(p).metadata())), W = Math.max(...metas.map(m => m.width)) + 32, PAD = 18;
  const H = 70 + metas.reduce((s, m) => s + m.height + PAD, 0) + 14, comp = [{ input: svg(W, 60, `<text x="16" y="40" font-family="DejaVu Sans, Arial" font-size="27" font-weight="bold" fill="${INK}">${esc(heading)}</text>`), top: 0, left: 0 }];
  let y = 70; panels.forEach((p, i) => { comp.push({ input: p, top: y, left: 16 }); y += metas[i].height + PAD; });
  await sharp({ create: { width: W, height: H, channels: 3, background: BG } }).composite(comp).jpeg({ quality: 84 }).toFile(`${out}/${file}`);
  console.log('wrote', `${out}/${file}`, W, H);
}
const AB = (l, n = 1) => Array.from({ length: n }, () => [`Avant · ${l}`, `Après · ${l}`]).flat();

// ---- 1. the face: his natural cut, then shaved on the lightest and the darkest tone (the scalp, the hairline, the nape), then the geometry alone
const V4 = 'views=front,34,side,back';
if (want('visage')) await sheet('homme-visage-avant-apres.jpg', 'Homme · visage, avant / après (rendus Three.js réels)', [
  await panel('Court · teint Caramel : mâchoire, menton et barbe, nez', await lab(`rows=mb:natural:2:0:1,m:natural:2:0:1&${V4}&cell=300`, 1200, 600), AB('Court'), 300),
  await panel('Rasé · teints Clair et Ébène : crâne, ligne frontale, nuque', await lab(`rows=mb:shaved:0:0:1,m:shaved:0:0:1,mb:shaved:5:0:1,m:shaved:5:0:1&${V4}&cell=300`, 1200, 1200), [...AB('Clair'), ...AB('Ébène')], 300),
  await panel('Géométrie seule (argile, sans texture)', await lab(`rows=mb:natural:2:0:1,m:natural:2:0:1&views=front,34,side&cell=300&clay=1`, 900, 600), AB('argile'), 300),
]);

// ---- 2. the body: whole, the arm close, the arm in clay, the rest pose itself, the elbows bent (riding, sitting, gestures)
if (want('corps')) {
const bind = async src => lab(`glb=${src}&views=front,side,back&frame=bust&cell=300&clay=1`, 900, 300);
const bindAB = await sharp({ create: { width: 900, height: 600, channels: 3, background: BG } }).composite([{ input: await bind('/_before/assets/meshy/body_m.glb'), top: 0, left: 0 }, { input: await bind('/assets/meshy/body_m.glb'), top: 300, left: 0 }]).png().toBuffer();
await sheet('homme-corps-avant-apres.jpg', 'Homme · corps et bras, avant / après (rendus Three.js réels)', [
  await panel('Corps entier, au repos (Idle)', await lab(`rows=mb:natural:2:0:1,m:natural:2:0:1&${V4}&frame=body&cell=250`, 1000, 1000), AB('Idle'), 500),
  await panel('Épaules et bras : attache, écart au torse, coudes', await lab(`rows=mb:natural:2:0:1,m:natural:2:0:1&${V4}&frame=bust&cell=300`, 1200, 600), AB('buste'), 300),
  await panel('Épaule, coude, poignet (texture)', await lab(`rows=mb:natural:2:0:1,m:natural:2:0:1&${V4}&frame=arm&cell=300`, 1200, 600), AB('bras'), 300),
  await panel('Épaule, coude, poignet (argile : la géométrie seule)', await lab(`rows=mb:natural:2:0:1,m:natural:2:0:1&${V4}&frame=arm&cell=300&clay=1`, 1200, 600), AB('argile'), 300),
  await panel('La pose de liaison elle-même (argile, sans animation)', bindAB, AB('liaison'), 300),
  await panel('Coudes pliés : moto (Ride) et assis (Sit)', await lab(`rows=mb:natural:2:0:1:Ride,m:natural:2:0:1:Ride,mb:natural:2:0:1:Sit,m:natural:2:0:1:Sit&views=front,34,side&frame=body&cell=220`, 660, 1760), [...AB('Ride'), ...AB('Sit')], 440),
  await panel('Gestes : parler, attraper, célébrer', await lab(`rows=mb:natural:2:0:1:Talk:1.4,m:natural:2:0:1:Talk:1.4,mb:natural:2:0:1:Grab:0.5,m:natural:2:0:1:Grab:0.5,mb:natural:2:0:1:Celebrate:1.6,m:natural:2:0:1:Celebrate:1.6&views=front,34,side&frame=body&cell=220`, 660, 2640), [...AB('Talk'), ...AB('Grab'), ...AB('Celebr.')], 440),
]);
}

// ---- 3. the corrected homme everywhere the studio and the game show him
if (want('matrice')) await sheet('homme-apres-matrice.jpg', 'Homme corrigé · coiffures, teints, tenues, lumière, allures', [
  await panel('Coiffures retenues', await lab(`rows=m:natural:2:0:1,m:shaved:2:0:1,m:afro:2:0:1,m:kufi:2:0:4&${V4}&cell=260`, 1040, 1040), ['Court', 'Rasé', 'Afro', 'Kufi'], 260),
  await panel('Teints : Clair, Caramel, Ébène', await lab(`rows=m:natural:0:0:1,m:natural:2:0:1,m:natural:5:0:1&${V4}&cell=260`, 1040, 780), ['Clair', 'Caramel', 'Ébène'], 260),
  await panel('Tenues : Uni, Rayé, Imprimé', await lab(`rows=m:natural:3:0:2,m:natural:3:1:2,m:natural:3:2:2&views=front,34,side,back&frame=body&cell=200`, 800, 1200), ['Uni', 'Rayé', 'Imprimé'], 400),
  await panel('Lumière du jeu : midi', await lab(`rows=m:shaved:0:0:1,m:natural:5:2:3&views=front,34,back&frame=body&cell=200&light=day`, 600, 800), ['Rasé · Clair', 'Court · Ébène'], 400),
  await panel('Lumière du jeu : nuit', await lab(`rows=m:shaved:0:0:1,m:natural:5:2:3&views=front,34,back&frame=body&cell=200&light=night`, 600, 800), ['Rasé · Clair', 'Court · Ébène'], 400),
  await panel('Allures : marche, jogging, course', await lab(`rows=m:natural:2:0:1:Walk:0.5,m:natural:2:0:1:Walk:0.85,m:natural:2:0:1:Jog:0.5,m:natural:2:0:1:Run:0.5,m:natural:2:0:1:Run:0.68&views=front,34,side&frame=body&cell=200`, 600, 2000), ['Marche', 'Marche', 'Jogging', 'Course', 'Course'], 400),
]);

// ---- 4. the animation: before | after, side by side, walking then running (15 frames a second, simulated as the game does)
if (want('animation')) {
const frames = `${out}/_frames`; fs.rmSync(frames, { recursive: true, force: true }); fs.mkdirSync(frames);
let n = 0;
for (const [clip, label, t0, count] of [['Walk', 'Marche', 1.0, 24], ['Run', 'Course', 1.0, 18]]) {
  const ts = Array.from({ length: count }, (_, i) => +(t0 + i / 15).toFixed(4));
  // (six frames a page: a taller canvas than SwiftShader's limit gets no WebGL context)
  const strip = async b => { const parts = []; for (let k = 0; k < ts.length; k += 6) { const c = ts.slice(k, k + 6); parts.push(await lab(`rows=${c.map(t => `${b}:natural:2:0:1:${clip}:${t}`).join(',')}&views=34,side&frame=body&cell=220`, 440, 440 * c.length)); } return parts; };
  const [sb, sa] = [await strip('mb'), await strip('m')];
  for (let i = 0; i < count; i++) {
    const cut = async s => sharp(s[Math.floor(i / 6)]).extract({ left: 0, top: (i % 6) * 440, width: 440, height: 440 }).toBuffer();
    const head = svg(920, 40, `<text x="230" y="27" font-family="DejaVu Sans, Arial" font-size="19" fill="${DIM}" text-anchor="middle">Avant · ${label}</text><text x="690" y="27" font-family="DejaVu Sans, Arial" font-size="19" fill="${INK}" text-anchor="middle">Après · ${label}</text>`);
    for (let rep = 0; rep < 2; rep++) await sharp({ create: { width: 920, height: 480, channels: 3, background: BG } }).composite([{ input: head, top: 0, left: 0 }, { input: await cut(sb), top: 40, left: 0 }, { input: await cut(sa), top: 40, left: 480 }]).png().toFile(`${frames}/${String(n + rep * count + i).padStart(4, '0')}.png`);
  }
  // each clip plays twice
  n += count * 2;
}
console.log('frames', fs.readdirSync(frames).length);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '15', '-start_number', '0', '-i', `${frames}/%04d.png`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '24', `${out}/homme-animation-avant-apres.mp4`]);
fs.rmSync(frames, { recursive: true, force: true });
console.log('wrote', `${out}/homme-animation-avant-apres.mp4`, (fs.statSync(`${out}/homme-animation-avant-apres.mp4`).size / 1e6).toFixed(1), 'MB');
}
await browser.close();
