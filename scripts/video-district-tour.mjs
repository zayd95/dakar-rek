// LD2.0-E: a smooth flythrough of the Almadies district on a phone page, for the owner. The game is paused and advanced 1/24 s per frame (`step`), each frame
// drawn from a free camera that glides along a smoothed route at street height and saved, so the video runs at 24 frames a second whatever the machine draws
// in real time (a software renderer here). The route: the sea-front coast road past the hotels → the avenue and its villas → the Ngor residence and the
// flagship → down the central avenue to the mall → the residences and the hotel tower; day, then dusk, then night (the hour moves with the camera).
// ROUTE=round3 (LD2.0-E round 3, « life on the ground »): at a walking person's height: the coast road past the hotel's terrace and lobby → the port's plaza down the pier's approach → the avenue and the Ngor residence's street
// → the meeting square's path to its centre → the mall's street; the game runs a few seconds before the camera starts so the street's people are out.
// Usage: node scripts/video-district-tour.mjs <baseUrl> <out.mp4> [seconds=70]   (a static build of the game, served; DRY=1: the route's length only, no frames; ROUTE=round3)
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const [base = 'http://127.0.0.1:4971/', outFile = 'district-tour.mp4', secArg = '70'] = process.argv.slice(2);
const FPS = 24, DT = 1 / FPS, SECONDS = Number(secArg), FRAMES = `/tmp/claude-0/ld2d/district-frames-${Date.now()}`, DRY = !!process.env.DRY;
fs.mkdirSync(FRAMES, { recursive: true });
// [x, z, height]: the camera's route (the roads at −120, −60, 0, 60; the sea to the north, −z), looking ahead along it with a slow sway
const ROUTE_ROUND2 = [
  [-124, -100, 3.2], [-120, -112, 3.4], [-100, -121, 3.6], [-60, -122, 4.4], [-20, -121, 3.6], [20, -120, 4], [60, -121, 3.6],        // the coast road, hotels and the sea-front residence on the left
  [62, -100, 4.6], [60, -64, 3.4], [30, -61, 3.2], [-20, -61, 3.4], [-62, -62, 3.6],                                                   // back along the first avenue
  [-60, -30, 3.4], [-56, -4, 3.2], [-30, -1, 3.0], [-4, 1, 3.4],                                                                          // down to the Ngor residence and the flagship villa
  [2, 24, 4.0], [4, 56, 3.6], [30, 61, 4], [58, 60, 5.2], [64, 90, 6.4], [62, 118, 8],                                                  // the mall's street, the hotel tower
  [20, 122, 9], [-30, 121, 7], [-62, 100, 6], [-60, 64, 5], [-62, 30, 8],                                                               // round the courtyard residence, then up
];
const ROUTE_ROUND3 = [
  [-66, -117, 2.4], [-48, -117, 2.4], [-32, -117, 2.2], [-12, -117, 2.4], [12, -117, 2.6],                                                // the coast road in front of the boutique hotel: the doorman, the terrace
  [24, -109, 2.8], [30, -100, 2.4], [30, -88, 2.2], [30, -76, 2.2], [30, -68.5, 2.4],                                                      // the pier's approach, the plaza, the market stalls, the lawns
  [24, -64, 2.8], [8, -62.5, 2.8], [4, -52, 3], [4, -30, 2.6], [4, -8, 2.6], [4, 2, 2.8],                                                  // west along the first avenue, then down the central avenue
  [30, 2.5, 2.8], [60, 3, 2.6], [88, 4.5, 2.4], [90, 12, 2.0], [90, 22, 1.9], [90, 36, 1.9], [90, 50, 2.2], [93, 58, 3.2],                // east to the meeting square, its path, its centre
];
// ROUTE=rooftop (round 4): along the sea road from 130 m east of the boutique hotel to 80 m west of it, the camera held on the roof sign (« visible from the street and far »), dusk to night
const ROUTE_ROOFTOP = [[100, -118, 2.0], [60, -118, 2.0], [20, -118, 2.1], [-10, -117.5, 2.2], [-30, -117, 2.4], [-55, -117.5, 2.4], [-80, -118, 2.2]];
const LOOK = process.env.ROUTE === 'rooftop' ? [-30, 17.5, -104.6] : null;
const ROUTE = process.env.ROUTE === 'round3' ? ROUTE_ROUND3 : process.env.ROUTE === 'rooftop' ? ROUTE_ROOFTOP : ROUTE_ROUND2;
const TARGET_AHEAD = 11;
// a centripetal-ish Catmull-Rom through the route, sampled by arc length
const pts = ROUTE.map(([x, z, y]) => ({ x, z, y }));
const cr = (p0, p1, p2, p3, t) => { const t2 = t * t, t3 = t2 * t; const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3); return { x: f(p0.x, p1.x, p2.x, p3.x), z: f(p0.z, p1.z, p2.z, p3.z), y: f(p0.y, p1.y, p2.y, p3.y) }; };
const samples = [];
for (let i = 0; i < pts.length - 1; i++) for (let k = 0; k < 40; k++) samples.push(cr(pts[Math.max(0, i - 1)], pts[i], pts[i + 1], pts[Math.min(pts.length - 1, i + 2)], k / 40));
samples.push(pts[pts.length - 1]);
const cum = [0]; for (let i = 1; i < samples.length; i++) cum.push(cum[i - 1] + Math.hypot(samples[i].x - samples[i - 1].x, samples[i].z - samples[i - 1].z));
const total = cum[cum.length - 1], at = s => { s = Math.max(0, Math.min(total, s)); let lo = 0, hi = cum.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; } const t = (s - cum[lo]) / Math.max(1e-6, cum[hi] - cum[lo]); return { x: samples[lo].x + (samples[hi].x - samples[lo].x) * t, z: samples[lo].z + (samples[hi].z - samples[lo].z) * t, y: samples[lo].y + (samples[hi].y - samples[lo].y) * t }; };
const N = SECONDS * FPS;
console.log(`route ${Math.round(total)} m, ${N} frames (${SECONDS} s at ${(total / SECONDS).toFixed(1)} m/s)`);
if (DRY) process.exit(0);
// the hour: late morning → golden hour → dusk → night over the route
const hourAt = u => process.env.ROUTE === 'rooftop' ? 18 + u * 3 : u < 0.4 ? 10.5 + (u / 0.4) * 6.5 : u < 0.7 ? 17 + ((u - 0.4) / 0.3) * 2.2 : 19.2 + ((u - 0.7) / 0.3) * 2.2;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'medium'); } catch { /* */ } });
  const page = await ctx.newPage(); page.setDefaultTimeout(300000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const d = (fn, a) => page.evaluate(fn, a);
  await page.goto(`${base}?debug&touch&argent=999000000`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.estate, null, { timeout: 300000 });
  await d(([x, z]) => { window.__dakar.setHour(10.5); window.__dakar.teleport('almadies', x, z, 0); }, ROUTE[0]);
  await page.waitForFunction(() => window.__dakar.pos().hub === 'almadies', null, { timeout: 120000 });
  await page.waitForTimeout(2500);
  if (process.env.ROUTE === 'round3' || process.env.ROUTE === 'rooftop') await d(() => { const D = window.__dakar; D.ambientRun?.(150); D.ambientSettle?.(); for (let i = 0; i < 240; i++) D.step(1 / 24, 1); });   // the street's people are out
  await d(() => window.__dakar.pause(true));
  for (let f = 0; f < N; f++) {
    const u = f / (N - 1), s = u * total, c = at(s), a = at(s + TARGET_AHEAD), sway = Math.sin(u * Math.PI * 14) * 1.2;
    const yaw = Math.atan2(a.x - c.x, a.z - c.z), tx = LOOK ? LOOK[0] : a.x + Math.cos(yaw) * sway, tz = LOOK ? LOOK[2] : a.z - Math.sin(yaw) * sway;
    await d(([c, tx, tz, h, ly]) => { window.__dakar.setHour(h); window.__dakar.cam([c.x, c.y, c.z], [tx, ly ?? Math.max(1.5, c.y * 0.9), tz]); window.__dakar.step(1 / 24, 1); window.__dakar.render(); }, [c, tx, tz, hourAt(u), LOOK ? LOOK[1] : null]);
    await page.screenshot({ path: `${FRAMES}/${String(f).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 86 });
    if (f % 120 === 0) console.log(`frame ${f}/${N}`);
  }
  console.log('errors', JSON.stringify(errors.slice(0, 3)));
} finally { await browser.close(); }
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', `${FRAMES}/%05d.jpg`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '24', '-movflags', '+faststart', outFile], { stdio: 'inherit' });
fs.rmSync(FRAMES, { recursive: true, force: true });
console.log('video:', outFile, Math.round(fs.statSync(outFile).size / 1024), 'kB');
