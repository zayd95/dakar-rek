// Records a short in-game audition: the player's own vehicle driven by real touch through a populated street (the car in the Plateau, the Jakarta in Pikine), the page's own video and
// the game's own audio output (the vehicle bus: engine, tyres, the street's traffic bed and distant horns, ignition, door), joined into one MP4 a phone plays.
// Usage: node scripts/audio/render-street.mjs <car|moto> <baseUrl> <outDir>   (a running build; needs ffmpeg)
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { realTouch, walkTo } from '../lib/realTouch.mjs';

const KIT = process.argv[2] ?? 'car', base = process.argv[3] ?? 'http://localhost:4219/', out = process.argv[4] ?? '/tmp/street';
const W = Number(process.env.W ?? 390), H = Number(process.env.H ?? 844);
fs.mkdirSync(out, { recursive: true });
const HUB = KIT === 'car' ? 'plateau' : 'pikine', KEY = KIT === 'car' ? 'car' : 'tiak';       // the car: the dealer's free trial car; the bike: the Tiak Tiak loaner (the Jakarta's engine sound: the same profile)
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, recordVideo: { dir: `${out}/video`, size: { width: W, height: H } } });
const tVideo = Date.now();
const page = await context.newPage(); page.setDefaultTimeout(240000);
const d = (fn, arg) => page.evaluate(fn, arg);
const wait = (fn, arg, ms = 120000) => page.waitForFunction(fn, arg, { timeout: ms });
await page.goto(`${base}?debug&touch&heure=11&argent=50000000`, { timeout: 120000 });
await wait(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.car, null);
const tr = await realTouch(page);
await d(h => window.__dakar.teleport(h), HUB);
await wait(([h, k]) => window.__dakar.pos().hub === h && window.__dakar[k]?.at(), [HUB, KEY]).catch(() => {});
await page.waitForTimeout(1500);
const at = () => d(k => window.__dakar[k].at(), KEY);
if (KIT === 'car') {
  // the dealer's free trial car (Ndiaye Auto): « Voir les articles » → « Essayer gratuitement »
  const dl = await d(() => window.__dakar.car.info().dealer);
  const near = v => [-120, -60, 0, 60, 120].reduce((a, c) => Math.abs(c - v) < Math.abs(a - v) ? c : a);
  const rx = near(dl.x), rz = near(dl.z), road = Math.abs(dl.z - rz) < Math.abs(dl.x - rx) ? { x: 0, z: Math.sign(rz - dl.z) || 1 } : { x: Math.sign(rx - dl.x) || 1, z: 0 };
  await d(([p, r]) => window.__dakar.place(p.x + r.x * 0.7 + (r.x ? 0 : 0.4), p.z + r.z * 0.7 + (r.z ? 0 : 0.4), Math.atan2(-r.x, -r.z)), [dl, road]);
  await wait(() => /Voir les articles/.test(window.__dakar.focus()?.all?.join('|') ?? ''), null, 60000).catch(() => {});
  await page.waitForTimeout(1200);
  await tr.tap('#act'); await page.waitForSelector('#modal.on'); await page.waitForTimeout(1500);
  await page.locator('#modal .item', { hasText: 'Essayer gratuitement' }).first().tap();
  await wait(() => window.__dakar.car.info().here, null);
  await page.waitForTimeout(1500);
} else {
  const c = await d(() => window.__dakar.tiak.at());
  await d(() => window.__dakar.tiak.place(103.5, -4.3, -Math.PI / 2));                       // set-up: the bike on the kerb in front of the workshop, pointing west along the clear kerb
}
const c0 = await at();
// the player stands a few metres off and walks to the vehicle (as a person does); the audio context is made by the first tap
await d(c => { const f = { x: Math.sin(c.yaw), z: Math.cos(c.yaw) }; window.__dakar.place(c.x - f.x * 3.3 - Math.cos(c.yaw) * 1.4, c.z - f.z * 3.3 + Math.sin(c.yaw) * 1.4, c.yaw); }, c0);
await tr.down(1, 200, 420); await tr.up(1); await page.waitForTimeout(600);
await d(() => window.__dakar.car.lab().va.beep()); await wait(() => window.__dakar.car.lab().va.info().state === 'running' && window.__dakar.car.lab().va.info().samples.loaded >= 9, null, 60000);
await page.waitForTimeout(1500);
const L = { x: Math.cos(c0.yaw), z: -Math.sin(c0.yaw) }, F = { x: Math.sin(c0.yaw), z: Math.cos(c0.yaw) };
for (const side of KIT === 'car' ? [2.0, -2.0] : [1.2, -1.2]) {
  await walkTo(page, tr, c0.x + L.x * side + F.x * 0.4, c0.z + L.z * side + F.z * 0.4, { tol: 0.9, ms: 40000 });
  if (await page.waitForFunction(k => window.__dakar.focus()?.id === `${k}:parked`, KEY, { timeout: 6000 }).then(() => true, () => false)) break;
}
// the recording of the game's audio starts just before the player gets in (the door, the ignition are part of it)
const tAudio = await d(async () => {
  const va = window.__dakar.car.lab().va, stream = va.captureStream(); window.__rec = { chunks: [], mr: new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 160000 }) };
  window.__rec.mr.ondataavailable = e => window.__rec.chunks.push(e.data); window.__rec.mr.start(); return Date.now();
});
await tr.tap('#act');
await wait(k => window.__dakar[k].at().driving && document.body.classList.contains('ridepad'), KEY, 90000);
await page.waitForTimeout(1500);
const LIMIT = KIT === 'car' ? 22 : 14, start = await at();                              // the straight free run ahead of the vehicle (the checks found a wall about 33 m / 18 m on): stay well short of it
const travelled = async () => { const a = await at(); return Math.hypot(a.x - start.x, a.z - start.z); };
let over = false;
/** Wait `s` seconds of game time, or until the run is used up (then the next phases are only braking). */
const simWait = async s => { const t0 = (await at()).t; while (!over) { const a = await at(); if (a.t >= t0 + s) break; if (await travelled() > LIMIT) over = true; await page.waitForTimeout(100); } };
const gas = await tr.centre('#ridepad .rp-gas'), brk = await tr.centre('#ridepad .rp-brake');
const log = [];
const speed = async tag => { const a = await at(); log.push([tag, +a.speed.toFixed(1), +(await travelled()).toFixed(1)]); };
// everyday driving: pull away gently, ease off and roll (the car: through the cabin view), a little more, ease off, brake to a stop
await tr.down(1, gas.x, gas.y); await simWait(KIT === 'car' ? 1.9 : 1.7); await speed('pull away'); await tr.up(1);
if (KIT === 'car' && !over) await tr.tap('#ridepad .rp-view');                                          // chase → wheel view (inside the cabin)
await simWait(1.6); await speed('rolling');
if (!over) { await tr.down(1, gas.x, gas.y); await simWait(0.9); await speed('gas again'); await tr.up(1); }
await simWait(1.8); await speed(KIT === 'car' ? 'coasting in the cabin' : 'coasting');
if (KIT === 'car') { await tr.tap('#ridepad .rp-view'); await tr.tap('#ridepad .rp-view'); await simWait(0.6); }   // wheel → bird's-eye → chase
await tr.down(1, brk.x, brk.y); await wait(k => Math.abs(window.__dakar[k].at().speed) < 0.15, KEY, 120000).catch(() => {}); await tr.up(1);
await page.waitForTimeout(1500);
const simEnd = (await at())?.t ?? 0, wallDrive = (Date.now() - tAudio) / 1000;
await page.waitForTimeout(1500);
const b64 = await d(async () => { const r = window.__rec; r.mr.stop(); await new Promise(res => { r.mr.onstop = res; }); const buf = await new Blob(r.chunks).arrayBuffer(); let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); });
await context.close(); await browser.close();
const vid = fs.readdirSync(`${out}/video`).filter(f => f.endsWith('.webm')).map(f => `${out}/video/${f}`).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
fs.writeFileSync(`${out}/${KIT}-audio.webm`, Buffer.from(b64, 'base64'));
const off = ((tAudio - tVideo) / 1000).toFixed(2);
execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', off, '-i', vid, '-i', `${out}/${KIT}-audio.webm`, '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-pix_fmt', 'yuv420p', '-r', '20', '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart', `${out}/${KIT}-street.mp4`]);
console.log(JSON.stringify({ kit: KIT, videoOffsetS: off, speeds: log, simSeconds: simEnd, wallSecondsOfRecording: wallDrive }));
console.log('wrote', `${out}/${KIT}-street.mp4`);
