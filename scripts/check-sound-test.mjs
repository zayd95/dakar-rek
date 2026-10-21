// The phone's « Tester le son » (src/ui/soundTest.ts), portrait, real CDP touches, Chromium held to the iPhone's gesture rule (--autoplay-policy=user-gesture-required):
// before any touch the page has no sound; the touches that open the phone start it; the recordings are decoded; every button (ignition, idle, acceleration, horn, light and heavy
// impact, test tone; the car's and the Jakarta's voices) sends sound to the speaker (measured at the master output, after the limiter and the sound setting); the sound setting
// silences it and says so; a context put to sleep (as a phone call or the lock screen does) is woken by the next touch; a recording that fails to download is named in the panel,
// its sound says it is not ready, and the others still play. The session is filmed with its sound: an ordinary MP4 (H.264 + AAC).
// A desktop browser has no loudspeaker and is not an iPhone: this proves what the page sends, not what a phone's speaker plays.
// Usage: node scripts/check-sound-test.mjs <baseUrl> <outDir>
import { chromium } from 'playwright';
import fs from 'node:fs';
import { realTouch } from './lib/realTouch.mjs';
import { startSound, stopSound, mux, loudness, sync } from './lib/avRecord.mjs';

const [base = 'http://127.0.0.1:4420/', out = '/tmp/claude-0/veh/sound-test'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
let failed = 0; const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${detail}`); };
const T = { timeout: 240000 };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--autoplay-policy=user-gesture-required'] });

async function session({ film = false, block = null } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, ...(film ? { recordVideo: { dir: `${out}/raw`, size: { width: 390, height: 844 } } } : {}) });
  await context.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'low'); } catch { /* */ } });
  if (block) await context.route(`**/assets/audio/vehicles/${block}.mp3`, r => r.fulfill({ status: 404, body: '' }));
  const page = await context.newPage(), born = Date.now(), errors = []; page.on('pageerror', e => errors.push(e.message));
  page.setDefaultTimeout(240000);
  await page.goto(`${base}?debug&touch&heure=11`, { timeout: 180000 });
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.car?.lab, null, T);
  const t = await realTouch(page), d = (fn, a) => page.evaluate(fn, a);
  const va = () => d(() => window.__dakar.car.lab().va.info());
  const rows = () => d(() => Object.fromEntries([...document.querySelectorAll('#phone .ph-sound-state > div')].map(r => [r.querySelector('span').textContent, r.querySelector('em').textContent])));
  const said = () => d(() => document.querySelector('#phone .ph-sound-said')?.textContent ?? '');
  /** Taps a button with a real finger and reads the speaker level for `ms`: the loudest peak and speaker-band level. */
  const play = async (sel, ms) => {
    await t.tap(sel);
    return d(async ms => { const va = window.__dakar.car.lab().va, t0 = performance.now(); let peak = -120, sp = -120; while (performance.now() - t0 < ms) { const m = va.meter(); if (m) { peak = Math.max(peak, m.peakDb); sp = Math.max(sp, m.speakerDb); } await new Promise(r => setTimeout(r, 60)); } return { peak, sp }; }, ms);
  };
  const openTest = async () => {
    await t.tap('#menuBtn'); await page.waitForFunction(() => window.__dakar.phoneInfo().open, null, T);
    await t.tap('#phone [data-nav="home"]'); await page.waitForTimeout(200);
    await t.tap('#phone [data-app="reglages"]'); await page.waitForFunction(() => window.__dakar.phoneInfo().screen === 'reglages', null, T);
    await page.evaluate(() => document.querySelector('#phone [data-act="soundtest"]').scrollIntoView({ block: 'center' })); await page.waitForTimeout(200);
    await t.tap('#phone [data-act="soundtest"]'); await page.waitForFunction(() => window.__dakar.phoneInfo().screen === 'sontest', null, T);
  };
  return { context, page, born, errors, t, d, va, rows, said, play, openTest };
}

// ---- 1. the whole test, filmed with its sound
const s = await session({ film: true });
const before = await s.va();
check('before any touch: no sound at all (no context, no gesture), as on an iPhone', !before.gestured && before.state === 'none', JSON.stringify({ gestured: before.gestured, state: before.state }));
await s.openTest();
await s.page.waitForFunction(() => { const i = window.__dakar.car.lab().va.info(); return i.state === 'running' && i.samples.loaded + i.samples.failed.length >= 9; }, null, { timeout: 60000 }).catch(() => {});
const r0 = await s.rows(), v0 = await s.va();
check('the touches that opened the phone started the sound; the nine recordings are decoded', v0.state === 'running' && v0.samples.loaded === 9 && v0.samples.failed.length === 0, JSON.stringify(v0.samples));
check('the panel says so in words', r0['Audio du téléphone'] === 'Actif' && /9\/9 prêts/.test(r0['Enregistrements']) && r0['Son du jeu'] === 'Activé', JSON.stringify(r0));
await s.page.screenshot({ path: `${out}/01-panel.png` });
const audioStart = await startSound(s.page); let offset = (audioStart - s.born) / 1000;
await s.page.waitForTimeout(1400);                                                         // the clapperboard (flash + tone) has played
const marks = [];
const CAR = [['start', 3600], ['idle', 4400], ['accel', 10300], ['horn', 1300], ['tap', 1300], ['impact', 2200], ['bip', 800]];
for (const [k, ms] of CAR) {
  marks.push({ k: `car:${k}`, at: (Date.now() - audioStart) / 1000 });
  const m = await s.play(`#phone [data-check="${k}"]`, ms);
  check(`car « ${k} »: sound sent to the speaker`, m.peak > -45, `peak ${m.peak} dB, speaker band ${m.sp} dB · « ${await s.said()} »`);
  if (k === 'accel') await s.page.screenshot({ path: `${out}/02-accel.png` });
}
await s.t.tap('#phone [data-kit="moto"]'); await s.page.waitForTimeout(300);
for (const [k, ms] of [['start', 3600], ['accel', 10300], ['horn', 1300]]) {
  marks.push({ k: `jakarta:${k}`, at: (Date.now() - audioStart) / 1000 });
  const m = await s.play(`#phone [data-check="${k}"]`, ms);
  check(`Jakarta « ${k} »: sound sent to the speaker`, m.peak > -45, `peak ${m.peak} dB, speaker band ${m.sp} dB`);
}
const after = await s.va();
check('the engine is off once the test is over (nothing left running)', !after.running && !after.horn, JSON.stringify({ running: after.running, horn: after.horn }));
// the film stops here: while the sound is off or asleep the page sends no audio frames at all, and MediaRecorder would close the gap (the picture and the sound would drift apart)
await s.page.waitForTimeout(600);
await stopSound(s.page, `${out}/raw/sound.webm`);
// the sound setting
await s.t.tap('#phone [data-nav="back"]'); await s.page.waitForFunction(() => window.__dakar.phoneInfo().screen === 'reglages', null, T);
await s.t.tap('#phone [data-act="sound"]'); await s.page.waitForTimeout(200);
await s.page.evaluate(() => document.querySelector('#phone [data-act="soundtest"]').scrollIntoView({ block: 'center' }));
await s.t.tap('#phone [data-act="soundtest"]'); await s.page.waitForFunction(() => window.__dakar.phoneInfo().screen === 'sontest', null, T);
const mm = await s.play('#phone [data-check="horn"]', 1300), muteSaid = await s.said(), mr = await s.rows();
check('sound off (Réglages › Son): the horn button plays nothing and says why', mm.peak < -90 && /coupé/.test(muteSaid) && mr['Son du jeu'] === 'Coupé', `peak ${mm.peak} · « ${muteSaid} »`);
await s.page.screenshot({ path: `${out}/03-muted.png` });
await s.t.tap('#phone [data-nav="back"]'); await s.page.waitForFunction(() => window.__dakar.phoneInfo().screen === 'reglages', null, T);
await s.t.tap('#phone [data-act="sound"]'); await s.page.waitForTimeout(200);
await s.page.evaluate(() => document.querySelector('#phone [data-act="soundtest"]').scrollIntoView({ block: 'center' }));
await s.t.tap('#phone [data-act="soundtest"]'); await s.page.waitForFunction(() => window.__dakar.phoneInfo().screen === 'sontest', null, T);
// a phone call / the lock screen: the context sleeps; the next touch wakes it
await s.d(() => window.__dakar.car.lab().va.suspendForTest()); await s.page.waitForTimeout(500);
const zz = await s.rows();
check('the context put to sleep (a call, the lock screen): the panel says « En veille »', /En veille/.test(zz['Audio du téléphone']), JSON.stringify(zz['Audio du téléphone']));
await s.page.screenshot({ path: `${out}/04-asleep.png` });
const wk = await s.play('#phone [data-check="horn"]', 1500), wv = await s.va();
check('the next touch wakes it and the horn is heard again', wv.state === 'running' && wk.peak > -45, `state ${wv.state}, peak ${wk.peak} dB, resumed by ${wv.nudgedBy}`);
check('no JavaScript error', s.errors.length === 0, s.errors.slice(0, 2).join(' | '));
const video = await s.page.video().path(); await s.context.close();
const clap = sync(video, `${out}/raw/sound.webm`);
check('the picture and the sound are lined up by the clapperboard (a flash and a tone at the same instant)', !!clap, JSON.stringify({ clap, wallClockGuess: offset }));
if (clap) offset = clap.offset;
mux(video, `${out}/raw/sound.webm`, offset, `${out}/sound-test.mp4`, { from: Math.max(0, offset - 1) });
const lv = loudness(`${out}/sound-test.mp4`, 0.25), shift = Math.min(1, offset);
const loudAt = (a, b) => Math.max(...lv.filter(w => w.t >= a + shift && w.t < b + shift).map(w => w.peakDb), -120);
const heard = marks.map((m, i) => ({ k: m.k, peak: loudAt(m.at, (marks[i + 1]?.at ?? m.at + 2)) }));
check('the MP4 (H.264 + AAC) carries each sound where it was played', heard.every(h => h.peak > -45), JSON.stringify(heard));

// ---- 2. a recording that does not arrive (here the car horn, blocked): named, its sound not ready, the rest unaffected
const b = await session({ block: 'horn-car' });
await b.openTest();
await b.page.waitForFunction(() => { const i = window.__dakar.car.lab().va.info(); return i.samples.loaded + i.samples.failed.length >= 9; }, null, { timeout: 60000 }).catch(() => {});
const br = await b.rows();
check('a recording that fails to load is named in the panel', /échec : horn-car/.test(br['Enregistrements']), br['Enregistrements']);
const bh = await b.play('#phone [data-check="horn"]', 1200), bSaid = await b.said();
check('… its button says it could not be loaded (no silent failure)', /n’a pas pu être chargé/.test(bSaid) && bh.peak < -60, `« ${bSaid} » peak ${bh.peak}`);
const bs = await b.play('#phone [data-check="start"]', 3600);
check('… and the other sounds still play', bs.peak > -45, `ignition peak ${bs.peak} dB`);
await b.page.screenshot({ path: `${out}/05-missing-recording.png` });
await b.context.close();

await browser.close();
fs.writeFileSync(`${out}/results.json`, JSON.stringify({ results, marks, offset }, null, 1));
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
