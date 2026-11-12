// Independent checks of a rendered club track and its beat map (written for Le Patio, run the same way on La Vague for the comparisons).
// Everything here decodes the MP3 with ffmpeg the way the game's decoder would see it (the loop points come from the sync tick), and measures with
// methods that are NOT the ones render-patio.mjs uses to place or measure the downbeats. It listens to nothing: it only measures.
//
// Usage: node verify-patio.mjs <track.mp3> <trackMap.ts> [<other.mp3> <otherMap.ts>]
import fs from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';

const [MP3, MAP, MP3B, MAPB] = process.argv.slice(2);
const SR = 44100;
const TAU = Math.PI * 2;

// ------------------------------------------------------------------------------------------------ small tools
const pick = (src, re) => Number(re.exec(src)?.[1]);
const readMap = file => {
  const s = fs.readFileSync(file, 'utf8');
  return { bpm: pick(s, /bpm:\s*([\d.]+)/), bars: pick(s, /bars:\s*(\d+)/), loop: pick(s, /loop:\s*([\d.]+)/), tickSample: pick(s, /tickSample:\s*(\d+)/), loopStart: pick(s, /loopStart:\s*([\d.]+)/),
    sections: JSON.parse(/sections:\s*(\[.*?\])\s*as/.exec(s)[1]), fills: JSON.parse(/fills:\s*(\[.*?\])\s*as/.exec(s)[1]), chords: JSON.parse(/chords:\s*(\[.*?\])\s*as/.exec(s)[1]),
    measured: JSON.parse(/downbeatsMs:\s*(\[.*?\])\s*as/.exec(s)[1]) };
};
function decode(file) {
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '2', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
  const f = new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + (raw.byteLength & ~3))), n = f.length >> 1;
  const L = new Float32Array(n), R = new Float32Array(n);
  for (let i = 0; i < n; i++) { L[i] = f[2 * i]; R[i] = f[2 * i + 1]; }
  return { L, R, n };
}
function ebur(file, filter = 'ebur128=peak=true') {
  const e = spawnSync('ffmpeg', ['-nostats', '-i', file, '-af', filter, '-f', 'null', '-'], { encoding: 'utf8' }).stderr.split('Summary:').pop();
  return { lufs: Number(/I:\s+(-?[\d.]+) LUFS/.exec(e)?.[1]), lra: Number(/LRA:\s+(-?[\d.]+) LU/.exec(e)?.[1]), tp: Number(/Peak:\s+(-?[\d.]+) dBFS/.exec(e)?.[1]) };
}
/** In-place iterative radix-2 FFT. */
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -TAU / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2, xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}
const hann = n => Float64Array.from({ length: n }, (_, i) => 0.5 - 0.5 * Math.cos(TAU * i / n));
const dB10 = x => 10 * Math.log10(Math.max(1e-30, x));
const rms = (x, a, b) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / (b - a)); };
const pct = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

// ------------------------------------------------------------------------------------------------ one track
function analyse(mp3, mapFile, label) {
  const T = readMap(mapFile), { L, R, n } = decode(mp3), out = { label };
  const fileInfo = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,bit_rate,size:stream=codec_name,sample_rate,channels', '-of', 'json', mp3]).toString());
  out.file = { bytes: fs.statSync(mp3).size, duration: +fileInfo.format.duration, bitrate: +fileInfo.format.bit_rate, codec: fileInfo.streams[0].codec_name, channels: fileInfo.streams[0].channels, sampleRate: +fileInfo.streams[0].sample_rate };
  Object.assign(out, { bpm: T.bpm, bars: T.bars, loop: T.loop, sections: T.sections });

  // --- the game's own tick search (src/venues/vagueMusic.ts loopPoints): the first sample above 0.12 in the left channel within 1.2 s
  const lim = Math.min(n, Math.round(SR * 1.2));
  let at = -1; for (let i = 0; i < lim; i++) if (Math.abs(L[i]) > 0.12) { at = i; break; }
  const delay = at < 0 ? null : at / SR - T.tickSample / SR;
  const loopStart = Math.round((T.loopStart + (delay ?? 0)) * SR), loopLen = Math.round(T.loop * SR), ls = loopStart, le = ls + loopLen;
  out.tick = { foundAtSample: at, mapTickSample: T.tickSample, decoderDelayMs: delay === null ? null : +(delay * 1000).toFixed(3), quietBeforeTick: at > 0 && rms(L, 0, at) < 1e-4, loudestBeforeTick: at > 0 ? Math.max(...Array.from(L.subarray(0, at), Math.abs)) : 0 };
  out.loopPoints = { startSample: ls, endSample: le, fileSamples: n, endInsideFile: le + Math.round((T.loop / T.bars) * SR) <= n + 4 };

  // --- loudness, true peak, clipping
  const e = ebur(mp3); out.loudness = e;
  let pk = 0, clipped = 0; for (let i = 0; i < n; i++) { const a = Math.max(Math.abs(L[i]), Math.abs(R[i])); if (a > pk) pk = a; if (a >= 0.999) clipped++; }
  out.samplePeak = { linear: +pk.toFixed(4), dBFS: +(20 * Math.log10(pk)).toFixed(2), samplesAtOrAbove0_999: clipped };

  // --- the downbeats, by a different estimator than the renderer's: a 2–7 kHz band (two biquads), rectified, 0.2 ms smoothing; the onset is where the envelope first
  //     reaches 50 % of its peak within ±6 ms of the grid, interpolated between samples
  const bar = T.loop / T.bars, errs = [];
  const bp = (x, f1, f2) => { // RBJ high-pass at f1 then low-pass at f2 (Q 0.7), in sequence
    const y = Float64Array.from(x);
    for (const [kind, f] of [['hp', f1], ['lp', f2]]) {
      const w = TAU * f / SR, c = Math.cos(w), s = Math.sin(w), al = s / (2 * 0.707), a0 = 1 + al;
      const b0 = kind === 'hp' ? (1 + c) / 2 : (1 - c) / 2, b1 = kind === 'hp' ? -(1 + c) : 1 - c, b2 = b0, a1 = -2 * c, a2 = 1 - al;
      let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
      for (let i = 0; i < y.length; i++) { const x0 = y[i], v = (b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0; x2 = x1; x1 = x0; y2 = y1; y1 = v; y[i] = v; }
    }
    return y;
  };
  const band = bp(L, 2000, 7000), env = new Float64Array(n), sw = Math.round(0.0002 * SR);
  { let acc = 0; for (let i = 0; i < n; i++) { acc += Math.abs(band[i]) - (i >= sw ? Math.abs(band[i - sw]) : 0); env[i] = acc / sw; } }
  for (let b = 0; b < T.bars; b++) {
    const exp = ls + Math.round(b * bar * SR), a = exp - Math.round(0.006 * SR), z = exp + Math.round(0.006 * SR);
    let mx = 0; for (let i = a; i < z; i++) mx = Math.max(mx, env[i]);
    let k = a; while (k < z && env[k] < 0.5 * mx) k++;
    const frac = k > 0 ? (0.5 * mx - env[k - 1]) / Math.max(1e-12, env[k] - env[k - 1]) : 0;
    errs.push(((k - 1 + frac) - sw / 2 - exp) / SR * 1000);          // minus half the smoothing window (the envelope lags by that)
  }
  out.downbeats = { method: '2–7 kHz band, |x|, 0.2 ms mean, first crossing of 50 % of the local peak (±6 ms)', maxAbsMs: +Math.max(...errs.map(Math.abs)).toFixed(2), meanMs: +(errs.reduce((a, b) => a + b, 0) / errs.length).toFixed(2), perBarMs: errs.map(x => +x.toFixed(2)),
    mapMeasuredMaxAbsMs: +Math.max(...T.measured.map(Math.abs)).toFixed(2) };

  // --- how safe the renderer's own downbeat rule is on this file: the rule takes the first rise above 35 % of the window's best (the 1 kHz high-passed energy over 1 ms, ±12–20 ms);
  //     it is safe as long as nothing before the bar line rises by more than that threshold. margin = threshold / the loudest earlier rise (1 = on the edge; the renderer's rule is mono)
  {
    const m = new Float64Array(n), w = Math.round(0.001 * SR), a = Math.exp(-TAU * 1000 / SR), hiE = new Float64Array(n); let z = 0, acc = 0; const sq = new Float64Array(n);
    for (let i = 0; i < n; i++) m[i] = 0.5 * (L[i] + R[i]);
    for (let i = 0; i < n; i++) { z = m[i] * (1 - a) + z * a; const q = m[i] - z; sq[i] = q * q; acc += sq[i] - (i >= w ? sq[i - w] : 0); hiE[i] = acc / w; }
    let worst = Infinity, worstBar = -1;
    for (let b = 0; b < T.bars; b++) {
      const e = ls + Math.round(b * (T.loop / T.bars) * SR); let best = 0, pre = 0;
      for (let i = e - Math.round(0.012 * SR); i < e + Math.round(0.02 * SR); i++) best = Math.max(best, hiE[i] - hiE[i - w]);
      for (let i = e - Math.round(0.012 * SR); i < e - w; i++) pre = Math.max(pre, hiE[i] - hiE[i - w]);
      const mg = 0.35 * best / Math.max(1e-12, pre); if (mg < worst) { worst = mg; worstBar = b; }
    }
    out.downbeatRuleMargin = { worst: +worst.toFixed(2), atBar: worstBar };
  }

  // --- the seam: the game wraps from sample le-1 back to ls
  const seam = {};
  for (const [name, x] of [['L', L], ['R', R]]) {
    const wrap = Math.abs(x[ls] - x[le - 1]), natural = Math.abs(x[le] - x[le - 1]);
    let maxJump = 0, jumps = [];
    for (let i = ls + 1; i < le; i++) { const d = Math.abs(x[i] - x[i - 1]); jumps.push(d); if (d > maxJump) maxJump = d; }
    const w50 = Math.round(0.05 * SR);
    const lastRms = rms(x, le - w50, le), firstRms = rms(x, ls, ls + w50);
    // what the listener gets across the wrap (the end of the loop, then its start) against what the file holds there (the end of the loop, then its continuation)
    let maxDiff = 0, e2 = 0, p2 = 0; for (let i = 0; i < w50; i++) { const d = x[ls + i] - x[le + i]; maxDiff = Math.max(maxDiff, Math.abs(d)); e2 += d * d; p2 += x[le + i] ** 2; }
    seam[name] = { wrapJump: +wrap.toFixed(5), naturalJumpAtThatPlace: +natural.toFixed(5), largestJumpInsideLoop: +maxJump.toFixed(4), p99_99JumpInsideLoop: +pct(jumps, 0.9999).toFixed(4),
      rmsLast50ms: +rms(x, le - w50, le).toFixed(5), rmsFirst50ms: +firstRms.toFixed(5), rmsLastVsFirstDb: +(20 * Math.log10(lastRms / firstRms)).toFixed(2),
      wrapVsContinuationMaxAbs: +maxDiff.toFixed(5), wrapVsContinuationDb: +dB10(e2 / p2).toFixed(1) };
  }
  seam.fullScale = 1; seam.requirement = 'wrap jump under 0.05 of full scale';
  out.seam = seam;

  // --- the loop itself, mono, for the spectrum / onsets / tempo / key
  const x = new Float64Array(loopLen); for (let i = 0; i < loopLen; i++) x[i] = 0.5 * (L[ls + i] + R[ls + i]);

  // spectrum by band: Hann 4096, hop 2048, mean power spectrum
  {
    const N = 4096, w = hann(N), re = new Float64Array(N), im = new Float64Array(N), P = new Float64Array(N / 2 + 1); let frames = 0;
    for (let p = 0; p + N <= loopLen; p += N / 2) { for (let i = 0; i < N; i++) { re[i] = x[p + i] * w[i]; im[i] = 0; } fft(re, im); for (let k = 0; k <= N / 2; k++) P[k] += re[k] * re[k] + im[k] * im[k]; frames++; }
    const bands = [['sub 20–60 Hz', 20, 60], ['bass 60–250', 60, 250], ['low-mid 250–500', 250, 500], ['mid 500–2k', 500, 2000], ['upper-mid 2–4k', 2000, 4000], ['presence 4–8k', 4000, 8000], ['air 8–16k', 8000, 16000]];
    let tot = 0; for (let k = 1; k <= N / 2; k++) if (k * SR / N >= 20 && k * SR / N < 16000) tot += P[k];
    out.spectrum = {}; for (const [name, a, b] of bands) { let s = 0; for (let k = 1; k <= N / 2; k++) { const f = k * SR / N; if (f >= a && f < b) s += P[k]; } out.spectrum[name] = { percentOfEnergy: +(100 * s / tot).toFixed(2), dBvsTotal: +dB10(s / tot).toFixed(1) }; }
    let cen = 0, pw = 0, acc = 0, roll = 0; for (let k = 1; k <= N / 2; k++) { const f = k * SR / N; cen += f * P[k]; pw += P[k]; }
    for (let k = 1; k <= N / 2; k++) { acc += P[k]; if (acc >= 0.85 * pw) { roll = k * SR / N; break; } }
    out.spectrumSummary = { centroidHz: Math.round(cen / pw), rolloff85Hz: Math.round(roll) };
  }

  // onsets: log-magnitude spectral flux (1024 / hop 256, 40 Hz – 10 kHz), adaptive threshold (mean + 0.5 sd over ±0.5 s), peaks ≥ 45 ms apart
  {
    const N = 1024, H = 256, w = hann(N), re = new Float64Array(N), im = new Float64Array(N), k0 = Math.round(40 * N / SR), k1 = Math.round(10000 * N / SR);
    const nf = Math.floor((loopLen - N) / H), flux = new Float64Array(nf); let prev = null;
    for (let f = 0; f < nf; f++) {
      for (let i = 0; i < N; i++) { re[i] = x[f * H + i] * w[i]; im[i] = 0; } fft(re, im);
      const cur = new Float64Array(k1 - k0); for (let k = k0; k < k1; k++) cur[k - k0] = Math.log1p(1000 * Math.hypot(re[k], im[k]) / N);
      if (prev) { let s = 0; for (let k = 0; k < cur.length; k++) s += Math.max(0, cur[k] - prev[k]); flux[f] = s; }
      prev = cur;
    }
    const W = Math.round(0.5 * SR / H), onsets = [];
    for (let f = 4; f < nf - 4; f++) {
      let m = 0, c = 0; for (let g = Math.max(0, f - W); g < Math.min(nf, f + W); g++) { m += flux[g]; c++; } m /= c;
      let v = 0; for (let g = Math.max(0, f - W); g < Math.min(nf, f + W); g++) v += (flux[g] - m) ** 2; const sd = Math.sqrt(v / c);
      let isMax = true; for (let g = f - 4; g <= f + 4; g++) if (flux[g] > flux[f]) isMax = false;
      if (isMax && flux[f] > m + 0.5 * sd && (!onsets.length || (f - onsets[onsets.length - 1]) * H / SR >= 0.045)) onsets.push(f);
    }
    const times = onsets.map(f => (f * H + N / 2) / SR), perBar = new Array(T.bars).fill(0);
    for (const t of times) { const b = Math.floor(t / bar); if (b >= 0 && b < T.bars) perBar[b]++; }
    out.onsets = { method: 'log-magnitude spectral flux, adaptive threshold, peak picking (an estimate of note and hit onsets, same detector on both tracks)', total: times.length, perSecond: +(times.length / T.loop).toFixed(2), perBarMean: +(times.length / T.bars).toFixed(1), perBarMedian: pct(perBar, 0.5), perBarMin: Math.min(...perBar), perBarMax: Math.max(...perBar), perBar };
    // tempo: the autocorrelation of the flux, scored for each candidate beat period T between 0.35 and 1.0 s as its mean over T, 2T, 3T … up to 4.8 s
    const fm = flux.reduce((a, b) => a + b, 0) / nf, d = Float64Array.from(flux, v => v - fm);
    const ac = lag => { let s = 0; for (let f = 0; f + lag < nf; f++) s += d[f] * d[f + lag]; return s; }, ac0 = ac(0);
    const scores = [];
    for (let T = 0.35; T <= 1.0; T += H / SR) { let sum = 0, c = 0; for (let k = 1; k * T <= 4.8; k++) { sum += ac(Math.round(k * T * SR / H)) / ac0; c++; } scores.push([T, sum / c]); }
    scores.sort((a, b) => b[1] - a[1]);
    const near = (sec) => { let best = [0, -1]; for (const [T, sc] of scores) if (Math.abs(T - sec) < 0.02 && sc > best[1]) best = [T, sc]; return best; };
    out.tempo = { bestPeriodS: +scores[0][0].toFixed(3), impliedBpm: +(60 / scores[0][0]).toFixed(1), mapBpm: T.bpm, scoreAtBest: +scores[0][1].toFixed(3), scoreNearMapBeat: +near(60 / T.bpm)[1].toFixed(3), top3: scores.slice(0, 3).map(([t, sc]) => `${(60 / t).toFixed(1)} bpm (${sc.toFixed(3)})`) };
  }

  // key: chroma from 8192-point frames (65 Hz – 2.1 kHz), Krumhansl–Schmuckler profiles
  {
    const N = 8192, w = hann(N), re = new Float64Array(N), im = new Float64Array(N), chroma = new Float64Array(12);
    for (let p = 0; p + N <= loopLen; p += N / 2) {
      for (let i = 0; i < N; i++) { re[i] = x[p + i] * w[i]; im[i] = 0; } fft(re, im);
      for (let k = Math.round(65 * N / SR); k < Math.round(2100 * N / SR); k++) { const f = k * SR / N, m = Math.hypot(re[k], im[k]); const pc = ((Math.round(12 * Math.log2(f / 261.6256)) % 12) + 12) % 12; chroma[pc] += m; }
    }
    const maj = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88], min = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
    const names = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
    const corr = (a, b) => { const ma = a.reduce((s, v) => s + v, 0) / 12, mb = b.reduce((s, v) => s + v, 0) / 12; let sab = 0, sa = 0, sb = 0; for (let i = 0; i < 12; i++) { sab += (a[i] - ma) * (b[i] - mb); sa += (a[i] - ma) ** 2; sb += (b[i] - mb) ** 2; } return sab / Math.sqrt(sa * sb); };
    const cands = []; for (let t = 0; t < 12; t++) { const rot = i => chroma[(i + t) % 12]; cands.push([`${names[t]} major`, corr(Array.from({ length: 12 }, (_, i) => rot(i)), maj)], [`${names[t]} minor`, corr(Array.from({ length: 12 }, (_, i) => rot(i)), min)]); }
    cands.sort((a, b) => b[1] - a[1]);
    const tot = chroma.reduce((a, b) => a + b, 0);
    out.key = { top3: cands.slice(0, 3).map(([k, c]) => `${k} (${c.toFixed(2)})`), chromaPercent: Object.fromEntries(names.map((nm, i) => [nm, +(100 * chroma[i] / tot).toFixed(1)])) };
  }

  // stereo / mono compatibility
  {
    let sl = 0, sr = 0, slr = 0, mid = 0, side = 0; for (let i = ls; i < le; i++) { sl += L[i] ** 2; sr += R[i] ** 2; slr += L[i] * R[i]; mid += (0.5 * (L[i] + R[i])) ** 2; side += (0.5 * (L[i] - R[i])) ** 2; }
    const mono = ebur(mp3, 'pan=mono|c0=0.5*c0+0.5*c1,ebur128=peak=true');
    out.stereo = { correlationLR: +(slr / Math.sqrt(sl * sr)).toFixed(3), sideVsMidDb: +dB10(side / mid).toFixed(1), monoSumLufs: mono.lufs, stereoLufs: e.lufs, monoMinusStereoLu: +(mono.lufs - e.lufs).toFixed(2), monoTruePeak: mono.tp };
  }
  return out;
}

const a = analyse(MP3, MAP, 'track');
console.log(JSON.stringify(a, null, 1));
if (MP3B) {
  const b = analyse(MP3B, MAPB, 'other');
  console.log(JSON.stringify(b, null, 1));
  console.log('\n=== comparison (track vs other) ===');
  console.log(JSON.stringify({
    bpm: [a.bpm, b.bpm], key: [a.key.top3[0], b.key.top3[0]], onsetsPerBarMean: [a.onsets.perBarMean, b.onsets.perBarMean], onsetsPerSecond: [a.onsets.perSecond, b.onsets.perSecond],
    densityRatioPerSecond: +(a.onsets.perSecond / b.onsets.perSecond).toFixed(2), densityRatioPerBar: +(a.onsets.perBarMean / b.onsets.perBarMean).toFixed(2),
    spectrumPercent: Object.fromEntries(Object.keys(a.spectrum).map(k => [k, [a.spectrum[k].percentOfEnergy, b.spectrum[k].percentOfEnergy]])), centroidHz: [a.spectrumSummary.centroidHz, b.spectrumSummary.centroidHz],
    lufs: [a.loudness.lufs, b.loudness.lufs], truePeak: [a.loudness.tp, b.loudness.tp], chordsShared: a.chordsShared ?? null,
  }, null, 1));
  const ca = new Set(readMap(MAP).chords), cb = new Set(readMap(MAPB).chords);
  console.log('chord names in common:', [...ca].filter(c => cb.has(c)));
}
