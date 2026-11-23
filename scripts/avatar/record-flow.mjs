// Films the whole first launch on a phone with real touch (one MP4): the welcome, a first name, the studio (each category tried, both bodies, a few looks), « C'est moi →
// Jouer », the arrival, a few steps in Pikine with the game's own stick, the phone's Profile with the avatar's picture, « Modifier mon personnage », and walking on.
// Usage: node scripts/avatar/record-flow.mjs [baseUrl] [outDir=docs/avatar/proof]   (needs ffmpeg)
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:4401/', out = process.argv[3] ?? 'docs/avatar/proof';
fs.mkdirSync(`${out}/video`, { recursive: true });
const W = 390, H = 844;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, recordVideo: { dir: `${out}/video`, size: { width: W, height: H } } });
const p = await context.newPage(); p.setDefaultTimeout(180000);
const cdp = await context.newCDPSession(p);
const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
/** The game's floating stick, a real finger: down on the left of the screen, pushed forward for `s` seconds. */
const walk = async (s, dx = 0) => { await touch('touchStart', 90, 690); for (let i = 1; i <= 6; i++) { await touch('touchMove', 90 + dx * i, 690 - 14 * i); await p.waitForTimeout(40); } await p.waitForTimeout(s * 1000); await touch('touchEnd'); };
/** A drag across the stage: the avatar turns. */
const turn = async dx => { await touch('touchStart', 120, 330); for (let i = 1; i <= 10; i++) { await touch('touchMove', 120 + (dx * i) / 10, 330); await p.waitForTimeout(30); } await touch('touchEnd'); };
const tap = sel => p.locator(sel).first().tap();
const choice = (g, v) => tap(`#studio .st-panel [data-g="${g}"][data-v="${v}"]`);
const beat = ms => p.waitForTimeout(ms);
await p.goto(`${base}?debug&touch&avatar=choisir&heure=11`, { waitUntil: 'load' });
await p.waitForSelector('#studio .st-hero h1'); await beat(1800);
await p.locator('#stName').type('Awa', { delay: 160 }); await beat(700);
await tap('#stContinue');
await p.waitForFunction(() => window.__studio?.state().drawn, null, { timeout: 180000 }); await beat(1800);
await turn(160); await beat(1400);
await choice('body', 'femme'); await p.waitForFunction(() => window.__studio.state().drawn === 'meshy_f'); await beat(1600);
await tap('.st-tab[data-cat="peau"]'); await beat(1300);
for (const s of [1, 2, 5, 3]) { await choice('skin', s); await beat(900); }
await tap('.st-tab[data-cat="coiffure"]'); await beat(1500);
for (const h of ['afro', 'puff', 'wrap', 'afro']) { await choice('hair', h); await beat(1300); }
await tap('.st-tab[data-cat="tenue"]'); await beat(1300);
for (const [o, c] of [[1, 2], [2, 1], [2, 4], [2, 2]]) { await choice('outfit', o); await choice('color', c); await beat(1300); }
await tap('.st-tab[data-cat="corps"]'); await beat(900); await choice('body', 'homme'); await beat(1500); await choice('body', 'femme'); await beat(1400);
await tap('#stPlay');
await p.waitForFunction(() => window.__dakar?.pos?.().hub, null, { timeout: 180000 });
await p.waitForFunction(() => !document.getElementById('studio'), null, { timeout: 60000 }); await beat(2200);
await walk(3.2, 4); await beat(500); await walk(2.4, -6); await beat(800);
await tap('#menuBtn'); await beat(900);
await tap('#phone [data-app="profil"]'); await beat(2200);
await tap('#phone [data-act="editchar"]');
await p.waitForFunction(() => window.__studio?.state().drawn, null, { timeout: 180000 }); await beat(1600);
await tap('.st-tab[data-cat="coiffure"]'); await beat(1200); await choice('hair', 'wrap'); await beat(1500);
await tap('#stPlay'); await beat(2200);
await walk(3.2, -4); await beat(900);
await context.close(); await browser.close();
const vid = fs.readdirSync(`${out}/video`).filter(f => f.endsWith('.webm')).map(f => `${out}/video/${f}`).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', vid, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-pix_fmt', 'yuv420p', '-r', '24', '-movflags', '+faststart', `${out}/studio-flow.mp4`]);
fs.rmSync(`${out}/video`, { recursive: true, force: true });
console.log('wrote', `${out}/studio-flow.mp4`, (fs.statSync(`${out}/studio-flow.mp4`).size / 1e6).toFixed(1), 'MB');
