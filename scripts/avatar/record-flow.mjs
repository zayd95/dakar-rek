// Records the whole creator journey on a phone with real touch (video + frames): New Game › name › « Mon personnage » (each row tried) › « C'est moi → Jouer » › a few steps in Pikine
// with the game's own joystick › phone › Profile › « Modifier mon personnage » › Enregistrer › walking on. Usage: node scripts/avatar/record-flow.mjs [baseUrl] [outDir=docs/avatar/proof]  (needs ffmpeg)
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
/** The game's floating stick, a real finger: down on the left zone, pushed up (forward) for `s` seconds, released. */
const walk = async (s, dx = 0) => { await touch('touchStart', 90, 690); for (let i = 1; i <= 6; i++) { await touch('touchMove', 90 + dx * i, 690 - 14 * i); await p.waitForTimeout(40); } await p.waitForTimeout(s * 1000); await touch('touchEnd'); };
const chip = (g, v) => p.locator(`#creator .cr-chip[data-g="${g}"][data-v="${v}"]`);
const beat = ms => p.waitForTimeout(ms);
await p.goto(`${base}?debug&touch&avatar=choisir&heure=11`, { waitUntil: 'load', timeout: 180000 });
await p.waitForSelector('#creator'); await beat(1500);
await p.locator('.cr-pill', { hasText: 'Awa' }).tap(); await beat(900);
await p.locator('#crContinue').tap();
await p.waitForFunction(() => !!document.querySelector('#crCanvas')?.dataset.body, null, { timeout: 180000 }); await beat(1800);
await chip('body', 'femme').tap(); await p.waitForFunction(() => document.querySelector('#crCanvas').dataset.body === 'meshy_f'); await beat(1500);
for (const s of [1, 3, 5, 4]) { await chip('skin', s).tap(); await beat(1100); }
for (const h of ['shaved', 'afro', 'wrap', 'natural']) { await chip('hair', h).tap(); await beat(1500); }
for (const [o, c] of [[1, 2], [2, 3], [2, 4], [0, 0]]) { await chip('outfit', o).tap(); await chip('color', c).tap(); await beat(1500); }
await chip('hair', 'afro').tap(); await chip('skin', 2).tap(); await chip('outfit', 2).tap(); await chip('color', 3).tap(); await beat(2000);
await p.locator('#crPlay').tap();
await p.waitForFunction(() => window.__dakar?.pos?.().hub, null, { timeout: 180000 }); await beat(3500);
await walk(3.5, 4); await beat(500); await walk(2.5, -6); await beat(700);
await p.locator('#menuBtn').tap(); await beat(900);
await p.locator('#phone [data-app="profil"]').tap(); await beat(1200);
await p.locator('#phone [data-act="editchar"]').tap();
await p.waitForSelector('#creator'); await p.waitForFunction(() => !!document.querySelector('#crCanvas')?.dataset.body); await beat(1800);
await chip('hair', 'wrap').tap(); await beat(1300); await chip('outfit', 1).tap(); await chip('color', 2).tap(); await beat(1500);
await p.locator('#crPlay').tap(); await beat(2500);
await walk(3.5, -4); await beat(800);
await context.close(); await browser.close();
const vid = fs.readdirSync(`${out}/video`).filter(f => f.endsWith('.webm')).map(f => `${out}/video/${f}`).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', vid, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '30', '-pix_fmt', 'yuv420p', '-r', '20', '-movflags', '+faststart', `${out}/creator-flow.mp4`]);
fs.rmSync(`${out}/video`, { recursive: true, force: true });
console.log('wrote', `${out}/creator-flow.mp4`, (fs.statSync(`${out}/creator-flow.mp4`).size / 1e6).toFixed(1), 'MB');
