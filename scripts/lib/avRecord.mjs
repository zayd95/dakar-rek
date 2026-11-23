// Ordinary MP4 captures of the game WITH its sound: Playwright records the page's picture (context option `recordVideo`), the page records what it sends to the speaker
// (src/transport/vehicleAudio.ts captureStream: the master output, after the limiter and the sound setting) with MediaRecorder, and ffmpeg puts the two together as H.264 + AAC
// (plays on an iPhone, in a browser, anywhere). The picture and the sound are lined up by the wall clock: the audio starts `offset` seconds after the page's first frame.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

/** Starts recording the page's sound (after the first gesture: before it the page has no audio context). */
export async function startSound(page) {
  return page.evaluate(() => {
    const va = window.__dakar.car.lab().va, stream = va.captureStream(); if (!stream) return null;
    const mr = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 160000 }), chunks = [];
    mr.ondataavailable = e => chunks.push(e.data); mr.start(250);
    window.__avrec = { mr, chunks };
    // the clapperboard: a magenta flash on screen and the test tone in the sound at the same instant, so the two tracks are lined up exactly (see `sync`)
    setTimeout(() => {
      const f = document.createElement('div'); f.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#ff00ff;pointer-events:none'; document.body.appendChild(f);
      requestAnimationFrame(() => { window.__avrec.beepAt = va.bus?.ctx.currentTime ?? null; va.beep(); setTimeout(() => f.remove(), 400); });
    }, 400);
    return Date.now();
  });
}

/** Where the clapperboard is in each track: the first magenta frame of the video, the first loud instant of the sound. Returns the offset to give the sound (s). */
export function sync(video, audio) {
  const W = 8, H = 8, fps = 50;
  const v = execFileSync('ffmpeg', ['-v', 'error', '-i', video, '-vf', `fps=${fps},crop=${W}:${H}:2:2`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 28 });
  let flash = null;
  for (let i = 0; i * W * H * 3 < v.length; i++) { const o = i * W * H * 3, r = v[o], g = v[o + 1], b = v[o + 2]; if (r > 200 && g < 70 && b > 200) { flash = i / fps; break; } }
  const a = execFileSync('ffmpeg', ['-v', 'error', '-i', audio, '-ac', '1', '-ar', '8000', '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
  const x = new Float32Array(a.buffer.slice(a.byteOffset, a.byteOffset + (a.byteLength & ~3)));
  let beep = null; for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) > 0.05) { beep = i / 8000; break; }
  return flash === null || beep === null ? null : { flash, beep, offset: +(flash - beep).toFixed(3) };
}

/** Stops it and writes the WebM/Opus file. */
export async function stopSound(page, file) {
  const b64 = await page.evaluate(async () => {
    const r = window.__avrec; if (!r) return null;
    await new Promise(res => { r.mr.onstop = res; r.mr.stop(); });
    const u = new Uint8Array(await new Blob(r.chunks).arrayBuffer()); let s = '';
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
    window.__avrec = null; return btoa(s);
  });
  if (b64) fs.writeFileSync(file, Buffer.from(b64, 'base64'));
  return !!b64;
}

/** The page's video (WebM from Playwright) + the sound, offset by `offset` s, cut to [from, to] s of the video and ending with the sound: an MP4 for any phone. */
export function mux(video, audio, offset, out, { from = 0, to = null } = {}) {
  const cut = ['-ss', String(from), ...(to ? ['-to', String(to)] : [])];
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', video, '-itsoffset', String(offset), '-i', audio, '-map', '0:v', '-map', '1:a', ...cut,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26', '-pix_fmt', 'yuv420p', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-r', '25',
    '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-shortest', '-movflags', '+faststart', out]);
  return out;
}

/** Loudness of the sound in a file over time, per `win` s: [{ t, peakDb, rmsDb }] — evidence that the MP4 carries the sounds where they were played. */
export function loudness(file, win = 0.25) {
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-vn', '-ac', '1', '-ar', '8000', '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
  const x = new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + (raw.byteLength & ~3))), n = Math.round(8000 * win), out = [];
  const dB = v => v > 1e-6 ? +(20 * Math.log10(v)).toFixed(1) : -120;
  for (let i = 0; i + n <= x.length; i += n) { let pk = 0, ss = 0; for (let j = i; j < i + n; j++) { const a = Math.abs(x[j]); if (a > pk) pk = a; ss += x[j] * x[j]; } out.push({ t: +(i / 8000).toFixed(2), peakDb: dB(pk), rmsDb: dB(Math.sqrt(ss / n)) }); }
  return out;
}
