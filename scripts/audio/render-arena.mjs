// The arena's sound, authored offline (no recording, no download): the làmb evening as loops and one-shots for src/arena/soundscape.ts.
//
//   drums-*.mp3   one sabar ensemble per phase of the evening (gathering by the gate, the wrestlers' entrance, the bàkk, the bout, the fête), each
//                 eight bars of a lead drum, two accompaniment drums, a bass drum and a tama (talking drum), with the crowd's claps and « ho ! »
//                 shouts that go with the drums. Membrane synthesis: each stroke is a sum of the drum head's modes (circular-membrane ratios)
//                 with a pitch that falls as the skin relaxes after the strike, excited by a pulse as long as the hand's or the stick's contact
//                 (a hand rounds the tone off, a stick reaches the upper modes), plus the slap's noise, the stick's click, the shell's air
//                 resonance and a touch of saturation on hard strokes. The tama's pitch is bent per note (rising, falling, rolls).
//   bed-*.mp3     the crowd for each phase: many voices (a glottal pulse through three moving formants, syllables, pauses, intonation, laughs),
//                 each at its own distance (level, air absorption, reverberation), with whistles, ululations and claps where they belong.
//                 No words of any language: vowels, claps, cheers and calls only.
//   shot-*.mp3    one-shots: cheers, a big roar, a gasp (« ooh »), applause, the referee's whistle, an ululation.
//
// Every loop is written as one period plus a tail: the player starts each copy exactly one period after the last and the tail of one plays under
// the head of the next (src/arena/soundscape.ts), so the drums never gap or stutter at the seam, whatever the MP3 decoder adds at the start.
// The crowd beds fade in over their first `xfade` seconds and out over their tail, so two overlapping copies sum to a steady murmur.
//
// Usage: node scripts/audio/render-arena.mjs [outDir=public/assets/audio/arena] [--preview <dir>]   (needs ffmpeg with libmp3lame)
//   --preview also writes, to <dir>, one WAV per phase as the game mixes it (drums + crowd) and a spectrogram of each, for listening and measuring.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const OUT = args[0] && !args[0].startsWith('--') ? args[0] : 'public/assets/audio/arena';
const PREVIEW = args.includes('--preview') ? args[args.indexOf('--preview') + 1] : null;
const ONLY = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
const SR = 44100, BED_SR = 22050, TAU = Math.PI * 2;

// ------------------------------------------------------------------------------------------------ randomness, buffers, filters
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gauss = r => { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * r()); };
const pick = (r, a) => a[Math.floor(r() * a.length) % a.length];
const st = s => 2 ** (s / 12);
const dB = x => 20 * Math.log10(Math.max(1e-9, x));

/** RBJ biquad, processed sample by sample (`f` may be changed between samples with `set`). */
class Biquad {
  constructor(type, f, q, sr, gainDb = 0) { this.type = type; this.q = q; this.sr = sr; this.g = gainDb; this.x1 = this.x2 = this.y1 = this.y2 = 0; this.set(f); }
  set(f) {
    const w = TAU * Math.min(f, this.sr * 0.45) / this.sr, cw = Math.cos(w), sw = Math.sin(w), al = sw / (2 * this.q), A = 10 ** (this.g / 40);
    let b0, b1, b2, a0, a1, a2;
    switch (this.type) {
      case 'lp': b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; break;
      case 'hp': b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; break;
      case 'bp': b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; break;
      case 'peak': b0 = 1 + al * A; b1 = -2 * cw; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cw; a2 = 1 - al / A; break;
      case 'lshelf': { const s = 2 * Math.sqrt(A) * al; b0 = A * ((A + 1) - (A - 1) * cw + s); b1 = 2 * A * ((A - 1) - (A + 1) * cw); b2 = A * ((A + 1) - (A - 1) * cw - s); a0 = (A + 1) + (A - 1) * cw + s; a1 = -2 * ((A - 1) + (A + 1) * cw); a2 = (A + 1) + (A - 1) * cw - s; break; }
      case 'hshelf': { const s = 2 * Math.sqrt(A) * al; b0 = A * ((A + 1) + (A - 1) * cw + s); b1 = -2 * A * ((A - 1) + (A + 1) * cw); b2 = A * ((A + 1) + (A - 1) * cw - s); a0 = (A + 1) - (A - 1) * cw + s; a1 = 2 * ((A - 1) - (A + 1) * cw); a2 = (A + 1) - (A - 1) * cw - s; break; }
      default: throw new Error(this.type);
    }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
  }
  p(x) { const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2; this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y; return y; }
  run(buf) { for (let i = 0; i < buf.length; i++) buf[i] = this.p(buf[i]); return buf; }
}
/** Klatt's formant resonator (unity gain at DC): cascaded, three of them make a vowel. */
class Formant {
  constructor(sr) { this.sr = sr; this.y1 = this.y2 = 0; this.A = 1; this.B = 0; this.C = 0; }
  set(f, bw) { const r = Math.exp(-Math.PI * bw / this.sr); this.C = -r * r; this.B = 2 * r * Math.cos(TAU * f / this.sr); this.A = 1 - this.B - this.C; }
  p(x) { const y = this.A * x + this.B * this.y1 + this.C * this.y2; this.y2 = this.y1; this.y1 = y; return y; }
}
function add(dst, src, at, gain = 1) { const i0 = Math.round(at); for (let i = 0; i < src.length; i++) { const j = i0 + i; if (j >= 0 && j < dst.length) dst[j] += src[i] * gain; } }
const rms = b => { let s = 0; for (const x of b) s += x * x; return Math.sqrt(s / Math.max(1, b.length)); };
const peak = b => { let p = 0; for (const x of b) p = Math.max(p, Math.abs(x)); return p; };

/** A small feedback-delay-network reverberation (eight lines, Householder mixing, damped): wet signal only. */
function reverb(x, sr, { rt60 = 1, size = 1, damp = 5000, pre = 0.012, er = 0.4 }) {
  const lens = [29.7, 37.1, 41.1, 43.7, 53.9, 59.3, 67.1, 73.9].map(ms => Math.round(ms * size * sr / 1000));
  const lines = lens.map(n => ({ buf: new Float32Array(n), i: 0, n, g: 10 ** (-3 * n / (rt60 * sr)), lp: 0 }));
  const a = Math.exp(-TAU * damp / sr), preN = Math.round(pre * sr), y = new Float32Array(x.length), N = lines.length;
  const taps = [[0.0071, 0.5], [0.0113, -0.4], [0.0179, 0.32], [0.0233, -0.25], [0.0301, 0.2]].map(([t, g]) => [Math.round((t * size + pre) * sr), g]);
  const outs = new Float32Array(N);
  for (let i = 0; i < x.length; i++) {
    const xin = i >= preN ? x[i - preN] : 0;
    let sum = 0;
    for (let k = 0; k < N; k++) { const L = lines[k]; outs[k] = L.buf[L.i]; sum += outs[k]; }
    const h = (2 / N) * sum;
    let o = 0;
    for (let k = 0; k < N; k++) {
      const L = lines[k], v = (outs[k] - h) * L.g;
      L.lp = (1 - a) * v + a * L.lp;                              // the air and the walls take the highs first
      L.buf[L.i] = L.lp + xin * (k & 1 ? -0.35 : 0.35);
      L.i = (L.i + 1) % L.n;
      o += k & 1 ? -outs[k] : outs[k];
    }
    let e = 0; for (const [d, g] of taps) if (i >= d) e += x[i - d] * g;
    y[i] = o * 0.35 + e * er;
  }
  return y;
}

/** Peak limiter with a short look-ahead (the gain falls before a peak, never after it), then a hard ceiling. */
function limit(x, sr, ceiling = 0.89) {
  const look = Math.round(0.004 * sr), rel = Math.exp(-1 / (0.08 * sr)), need = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) need[i] = Math.min(1, ceiling / Math.max(1e-9, Math.abs(x[i])));
  // the lowest gain needed over the look-ahead window, then a smooth return
  const out = new Float32Array(x.length); let g = 1;
  const dq = []; // monotonic deque of indices for a sliding minimum
  for (let i = 0; i < x.length + look; i++) {
    if (i < x.length) { while (dq.length && need[dq[dq.length - 1]] >= need[i]) dq.pop(); dq.push(i); }
    const j = i - look; if (j < 0) continue;
    while (dq.length && dq[0] < j) dq.shift();
    const want = dq.length ? need[dq[0]] : 1;
    g = want < g ? want : want + (g - want) * rel;
    out[j] = Math.max(-ceiling, Math.min(ceiling, x[j] * g));
  }
  return out;
}
/** Scales to an rms target (dBFS), then limits the peaks. */
function master(x, sr, rmsDb, ceiling = 0.89) { const g = 10 ** (rmsDb / 20) / Math.max(1e-9, rms(x)); for (let i = 0; i < x.length; i++) x[i] *= g; return limit(x, sr, ceiling); }

// ------------------------------------------------------------------------------------------------ the drums
/** Mode ratios of a circular membrane (0,1) (1,1) (2,1) (0,2) (3,1) (1,2) (4,1) (2,2) (0,3) (5,1). */
const M = [1, 1.594, 2.136, 2.296, 2.653, 2.918, 3.156, 3.501, 3.6, 4.06];
/**
 * The strokes. modes: [ratio, amplitude, decay s]; contact: s (a hand is long, a stick short: the longer, the fewer upper modes);
 * bend: how far above its rest pitch the struck skin starts (it falls back in bendT s); noise: the slap's or the skin's buzz
 * [amp, centre Hz, q, decay s]; click: the stick's own tick; body: the shell's air column.
 */
const STROKES = {
  bass: { modes: [[M[0], 1, 0.17], [M[1], 0.32, 0.08], [M[2], 0.16, 0.055], [M[4], 0.07, 0.04]], fMul: 0.72, contact: 0.0042, bend: 0.15, bendT: 0.04, noise: [0.07, 600, 0.8, 0.018], body: 0.5, gain: 0.72 },
  open: { modes: [[M[0], 1, 0.13], [M[1], 0.55, 0.085], [M[2], 0.45, 0.065], [M[3], 0.25, 0.05], [M[5], 0.16, 0.04], [M[7], 0.08, 0.03]], contact: 0.0016, bend: 0.07, bendT: 0.03, noise: [0.08, 1700, 0.9, 0.016], body: 0.32, gain: 0.8 },
  slap: { modes: [[M[0], 0.25, 0.06], [M[2], 0.38, 0.05], [M[5], 0.5, 0.04], [M[7], 0.42, 0.035], [M[9], 0.3, 0.03]], contact: 0.0007, bend: 0.04, bendT: 0.02, noise: [0.55, 3100, 0.7, 0.028], body: 0.18, click: 0.25, gain: 0.85 },
  // the stick: the sabar's own sound, a dry, bright « pax » with the head ringing high
  stick: { modes: [[M[0], 0.3, 0.055], [M[1], 0.45, 0.048], [M[2], 0.55, 0.042], [M[4], 0.5, 0.036], [M[6], 0.42, 0.03], [M[8], 0.34, 0.026], [M[9] * 1.12, 0.25, 0.02]], contact: 0.00035, bend: 0.05, bendT: 0.018, noise: [0.4, 4000, 0.9, 0.013], body: 0.14, click: 0.85, gain: 0.9 },
  mute: { modes: [[M[0], 0.7, 0.05], [M[1], 0.4, 0.035], [M[2], 0.3, 0.03]], contact: 0.0015, bend: 0.03, bendT: 0.02, noise: [0.12, 1500, 0.9, 0.012], body: 0.2, gain: 0.6 },
};
/** The ensemble: the lead (nder), two accompaniment drums (mbëng-mbëng), the bass drum, and the tama. f: the head's rest pitch (Hz). */
const DRUMS = {
  nder: { f: 400, decay: 1, body: 610, tone: 1.0 },
  mbeng: { f: 300, decay: 1.05, body: 470, tone: 0.9 },
  mbeng2: { f: 262, decay: 1.05, body: 420, tone: 0.85 },
  lamb: { f: 165, decay: 1.1, body: 225, tone: 1.0 },
};
const excitation = (f, w) => 1 / (1 + (f * w * 1.1) ** 2);

/** One stroke on a drum, added into `out` at sample `at`. `v`: velocity 0..1. */
function stroke(out, sr, at, drum, kind, v, r) {
  const s = STROKES[kind], d = DRUMS[drum];
  const f0 = d.f * (s.fMul ?? 1) * (1 + (r() - 0.5) * 0.018), bend = s.bend * (0.45 + 0.9 * v), bT = s.bendT * (0.9 + 0.2 * r());
  const dur = Math.max(...s.modes.map(m => m[2])) * d.decay * 6.5, n = Math.ceil(dur * sr), y = new Float32Array(n);
  const bendCurve = new Float32Array(n); for (let j = 0; j < n; j++) bendCurve[j] = 1 + bend * Math.exp(-j / sr / bT);
  const w = s.contact * (1.25 - 0.4 * v);                                            // a harder stroke is a quicker one
  const attN = Math.max(2, Math.round(w * sr));
  for (const [ratio, amp, dec] of s.modes) {
    const fm = f0 * ratio, a = amp * excitation(fm, w) * (ratio > 1.4 ? 0.5 + 0.6 * v : 1);
    if (a < 2e-3 || fm > sr * 0.45) continue;
    const k = Math.exp(-1 / (dec * d.decay * (0.9 + 0.2 * r()) * sr));
    let ph = 0, env = 1;
    for (let j = 0; j < n; j++) {
      ph += TAU * fm * bendCurve[j] / sr; env *= k;
      const att = j < attN ? Math.sin(0.5 * Math.PI * j / attN) : 1;
      y[j] += a * env * att * Math.sin(ph);
    }
  }
  if (s.noise) {                                                                      // the slap's crack, the skin's buzz
    const [na, nf, nq, nd] = s.noise, bp = new Biquad('bp', nf * (0.92 + 0.16 * r()), nq, sr), k = Math.exp(-1 / (nd * sr)), m = Math.min(n, Math.ceil(nd * 8 * sr));
    let env = 1;
    for (let j = 0; j < m; j++) { env *= k; const att = j < 30 ? j / 30 : 1; y[j] += bp.p(r() * 2 - 1) * na * (0.5 + v) * env * att * 2.2; }
  }
  if (s.click) {                                                                      // the stick's own tick, a hard wooden one
    const cf = 2900 + 900 * r(), k = Math.exp(-1 / (0.0045 * sr)); let env = 1, ph = 0;
    for (let j = 0; j < Math.min(n, sr * 0.03); j++) { env *= k; ph += TAU * cf / sr; y[j] += s.click * v * env * Math.sin(ph); }
  }
  if (s.body) {                                                                       // the tall shell's air column, not bent by the strike
    const k = Math.exp(-1 / (0.05 * sr)); let env = 1, ph = 0;
    for (let j = 0; j < Math.min(n, sr * 0.35); j++) { env *= k; ph += TAU * d.body / sr; const att = j < attN * 2 ? j / (attN * 2) : 1; y[j] += s.body * env * att * Math.sin(ph) * 0.6; }
  }
  const g = s.gain * d.tone * v ** 1.35, drive = 1 + 1.8 * v * v;                  // a hard stroke saturates the skin a little
  const norm = Math.tanh(drive);
  for (let j = 0; j < n; j++) y[j] = Math.tanh(y[j] * 0.55 * drive) / norm * g;
  add(out, y, at);
}

/** The tama (talking drum): a pitched note bent by the player's arm. contour: [[t s, semitones]...]. */
function tamaNote(out, sr, at, f0, contour, v, r, len = 0.32) {
  const n = Math.ceil(len * 2.2 * sr), y = new Float32Array(n), modes = [[1, 1, 0.16], [2.01, 0.42, 0.1], [2.93, 0.2, 0.06], [3.96, 0.1, 0.045], [5.1, 0.05, 0.03]];
  const semis = new Float32Array(n);
  for (let j = 0, c = 0; j < n; j++) {
    const t = j / sr; while (c < contour.length - 2 && contour[c + 1][0] < t) c++;
    const [t0, s0] = contour[c], [t1, s1] = contour[Math.min(c + 1, contour.length - 1)];
    const u = t1 > t0 ? Math.max(0, Math.min(1, (t - t0) / (t1 - t0))) : 1, e = u * u * (3 - 2 * u);
    semis[j] = s0 + (s1 - s0) * e + 0.9 * Math.exp(-t / 0.012);                      // the stick's strike lifts it for an instant
  }
  const decay = len / 2.2;
  for (const [ratio, amp, dec] of modes) {
    const k = Math.exp(-1 / (Math.min(decay, dec * 1.8) * sr)); let ph = 0, env = 1;
    for (let j = 0; j < n; j++) { ph += TAU * f0 * ratio * st(semis[j]) / sr; env *= k; const att = j < 25 ? j / 25 : 1; y[j] += amp * env * att * Math.sin(ph); }
  }
  const bp = new Biquad('bp', 3400, 1.2, sr), kc = Math.exp(-1 / (0.004 * sr)); let ec = 1;
  for (let j = 0; j < Math.min(n, 400); j++) { ec *= kc; y[j] += bp.p(r() * 2 - 1) * 0.9 * ec; }
  for (let j = 0; j < n; j++) y[j] = Math.tanh(y[j] * 0.8) * 0.75 * v ** 1.2;
  add(out, y, at);
}
/** The tama's figures, by letter: n a plain note, u rising, d falling, w up and down, r a roll of four rising. */
function tama(out, sr, at, kind, step, f0, v, r) {
  const T = s => s;
  switch (kind) {
    case 'n': tamaNote(out, sr, at, f0, [[0, 0], [0.08, -0.6]], v, r, 0.18); break;
    case 'u': tamaNote(out, sr, at, f0, [[0, -1], [0.05, 0], [0.16, 5 + r() * 2]], v, r, 0.36); break;
    case 'd': tamaNote(out, sr, at, f0, [[0, 5], [0.04, 4.5], [0.14, -1.5]], v, r, 0.3); break;
    case 'w': tamaNote(out, sr, at, f0, [[0, 0], [0.09, 6], [0.22, 1]], v, r, 0.4); break;
    case 'r': for (let k = 0; k < 4; k++) tamaNote(out, sr, at + T(k * step / 2.4) * sr, f0, [[0, k * 1.4], [0.06, k * 1.4 - 0.3]], v * (0.7 + 0.1 * k), r, 0.16); break;
    default: break;
  }
}

// ------------------------------------------------------------------------------------------------ hands, whistles, voices
/** One person's clap: the hands' air pocket (three quick bursts), then the crack's short decay. */
function clap(out, sr, at, v, r, centre = 1200 + r() * 900) {
  const n = Math.ceil(0.12 * sr), y = new Float32Array(n), bp = new Biquad('bp', centre, 1.1, sr), lo = new Biquad('bp', 520 + r() * 200, 1.4, sr);
  const bursts = [[0, 1], [0.004 + r() * 0.003, 0.7], [0.009 + r() * 0.004, 0.5]], kd = Math.exp(-1 / ((0.022 + r() * 0.02) * sr));
  let env = 0;
  for (let j = 0; j < n; j++) {
    const t = j / sr;
    for (const [bt, ba] of bursts) if (Math.abs(t - bt) < 0.5 / sr) env = Math.max(env, ba);
    env *= kd;
    const w = r() * 2 - 1;
    y[j] = (bp.p(w) * 1.6 + lo.p(w) * 0.5) * env;
  }
  add(out, y, at, v);
}

/** A whistle: `kind` 'ref' (the referee's pea whistle: a trill), 'wolf' (a supporter's « fwee-fwoo »), 'call' (a long two-finger whistle). */
function whistle(out, sr, at, kind, dur, v, r) {
  const n = Math.ceil(dur * sr), y = new Float32Array(n), bp = new Biquad('bp', 3000, 5, sr);
  const f0 = kind === 'ref' ? 3050 + r() * 200 : 2100 + r() * 700, flutter = 34 + r() * 14;
  let ph = 0, fph = 0;
  for (let j = 0; j < n; j++) {
    const t = j / sr, u = t / dur;
    let f = f0;
    if (kind === 'wolf') f = u < 0.45 ? f0 * (0.78 + 0.32 * (u / 0.45)) : f0 * (1.1 - 0.42 * ((u - 0.45) / 0.55) ** 1.4);
    if (kind === 'call') f = f0 * (1 + 0.04 * Math.sin(TAU * 1.3 * t)) * (u > 0.8 ? 1 - 0.25 * (u - 0.8) / 0.2 : 1);
    fph += TAU * flutter * (1 + 0.2 * Math.sin(TAU * 3 * t)) / sr;
    const trill = kind === 'ref' ? 0.62 + 0.38 * Math.sin(fph) : 1;
    if (kind === 'ref') f *= 1 + 0.035 * Math.sin(fph + 0.6);
    ph += TAU * f / sr;
    const env = Math.min(1, t / 0.02, (dur - t) / 0.04);
    y[j] = (Math.sin(ph) + 0.12 * Math.sin(2 * ph)) * trill * env * 0.6 + bp.p(r() * 2 - 1) * 0.05 * env;
  }
  add(out, y, at, v);
}

const VOWELS = { a: [760, 1250, 2600], e: [450, 1950, 2600], E: [600, 1750, 2550], i: [300, 2250, 3000], o: [480, 900, 2450], O: [610, 1000, 2500], u: [330, 850, 2300], '@': [520, 1450, 2550] };
const VOWEL_KEYS = Object.keys(VOWELS);
/**
 * A voice reading a plan: segments { d: s, v: vowel, s: semitones from its pitch, a: level 0..1, c: consonant 's'|'sh'|'p'|'h'|null }.
 * A band-limited sawtooth (the glottis) through three formants (the vowel), the formants and the pitch glide from one segment to the next.
 * o: { f0, fmt (formant scale), bright (0..1: a shout keeps its upper harmonics), breath, vib: [Hz, semitones], jitter }
 */
function voice(out, sr, at, plan, o, r, gain = 1) {
  const total = plan.reduce((s, p) => s + p.d, 0), n = Math.ceil((total + 0.1) * sr), y = new Float32Array(n);
  const F = [new Formant(sr), new Formant(sr), new Formant(sr)], tilt = new Biquad('lp', 1600 + 3600 * (o.bright ?? 0.3), 0.5, sr);
  // consonants, each its own filter on its own noise (never through the vowel's resonators): « s », « ch », a breath, a puff
  const fric = new Biquad('bp', 4600, 2, sr), fric2 = new Biquad('bp', 2500, 1.6, sr), asp = new Biquad('bp', 1300, 0.9, sr), puff = new Biquad('lp', 1600, 0.7, sr);
  const fmt = o.fmt ?? 1, bws = [80, 110, 160].map(b => b * (o.bw ?? 1));
  let ph = 0, segI = 0, segT = 0, f1 = VOWELS[plan[0].v][0], f2 = VOWELS[plan[0].v][1], f3 = VOWELS[plan[0].v][2], pitch = plan[0].s, amp = 0, jit = 0, consT = 0;
  const dt = 1 / sr, glide = Math.exp(-1 / (0.035 * sr)), ag = Math.exp(-1 / (0.018 * sr)), pg = Math.exp(-1 / (0.05 * sr));
  for (let j = 0; j < n; j++) {
    let seg = plan[segI];
    if (segT >= seg.d && segI < plan.length - 1) { segI++; segT = 0; seg = plan[segI]; consT = 0; }
    segT += dt; consT += dt;
    const done = j > total * sr;
    const tv = VOWELS[seg.v] ?? VOWELS['@'], cons = seg.c && consT < (seg.c === 'p' ? 0.05 : 0.09);
    f1 = tv[0] * fmt + (f1 - tv[0] * fmt) * glide; f2 = tv[1] * fmt + (f2 - tv[1] * fmt) * glide; f3 = tv[2] * fmt + (f3 - tv[2] * fmt) * glide;
    pitch = seg.s + (pitch - seg.s) * pg;
    const wantA = done ? 0 : cons ? 0 : seg.a;
    amp = wantA + (amp - wantA) * ag;
    if ((j & 15) === 0) { F[0].set(f1, bws[0]); F[1].set(f2, bws[1]); F[2].set(f3, bws[2]); jit += (gauss(r) * 0.08 - jit * 0.05) * (o.jitter ?? 1); }
    const vib = o.vib ? o.vib[1] * Math.sin(TAU * o.vib[0] * j * dt) : 0;
    const f = o.f0 * st(pitch + vib + jit);
    ph += f * dt; if (ph >= 1) ph -= 1;
    // band-limited sawtooth (polyBLEP)
    let saw = 2 * ph - 1; const inc = f * dt;
    if (ph < inc) { const t = ph / inc; saw -= t + t - t * t - 1; } else if (ph > 1 - inc) { const t = (ph - 1) / inc; saw -= t * t + t + t + 1; }
    const noise = r() * 2 - 1;
    const src = tilt.p(saw + noise * (o.breath ?? 0.04)) * amp;                       // the breath goes through the same glottal tilt as the voice
    let v = F[2].p(F[1].p(F[0].p(src)));
    if (cons) {                                                                       // a consonant: a hiss, a puff, a breath
      const ce = Math.min(1, consT / 0.01) * (seg.c === 'p' ? (consT > 0.035 ? 1 : 0) * Math.exp(-(consT - 0.035) / 0.008) : 1);
      const hiss = seg.c === 's' ? fric.p(noise) * 0.45 : seg.c === 'sh' ? fric2.p(noise) * 0.4 : seg.c === 'h' ? asp.p(noise) * 0.35 : puff.p(noise) * 0.5;
      v += hiss * ce * seg.a;                                                          // about 15 dB under the vowels, as in speech
    }
    y[j] = v;
  }
  add(out, y, at, gain);
}

/** Someone talking for `dur` seconds: phrases of syllables, pauses, a falling intonation, now and then a laugh. */
function chatter(dur, r, o = {}) {
  const plan = []; let t = 0;
  const excited = o.excited ?? 0;
  if (r() < 0.6) { const p = 0.2 + r() * 1.5; plan.push({ d: p, v: '@', s: 0, a: 0, c: null }); t += p; }
  while (t < dur) {
    const syl = 3 + Math.floor(r() * 10), start = 1.5 + 3 * r() + excited * 3;
    for (let k = 0; k < syl && t < dur; k++) {
      const d = 0.09 + r() * 0.13 * (1 - 0.3 * excited), stress = r() < 0.25 ? 2 + r() * 2.5 : 0;
      const c = r() < 0.25 ? pick(r, ['s', 'sh', 'p', 'h', 'p', 'p']) : null;
      plan.push({ d, v: pick(r, VOWEL_KEYS), s: start - 4.5 * (k / syl) + stress + gauss(r) * 0.6, a: 0.55 + 0.4 * r() + (stress ? 0.2 : 0), c });
      t += d;
    }
    if (r() < 0.08 + excited * 0.08) {                                                 // a laugh
      const hs = 3 + Math.floor(r() * 4);
      for (let k = 0; k < hs; k++) { plan.push({ d: 0.075, v: 'a', s: 6 - k * 0.8, a: 0.75, c: 'h' }); plan.push({ d: 0.06, v: '@', s: 5, a: 0.05, c: null }); t += 0.135; }
    }
    const pause = 0.15 + r() * (excited ? 0.6 : 1.3); plan.push({ d: pause, v: '@', s: 0, a: 0, c: null }); t += pause;
  }
  return plan;
}
/** A cheer: a sustained, rising shout. */
function cheerPlan(dur, r, { rise = 3, vowel } = {}) {
  const v = vowel ?? pick(r, ['a', 'a', 'e', 'E', 'O', 'o']), a = 0.8 + 0.2 * r();
  return [{ d: 0.05, v, s: -rise - 2, a: 0.25, c: null }, { d: 0.12, v, s: -rise * 0.4, a, c: null }, { d: dur * 0.55, v, s: 0.5, a, c: null }, { d: dur * 0.3, v: r() < 0.5 ? v : 'o', s: -1.5, a: a * 0.8, c: null }, { d: dur * 0.15, v, s: -5, a: 0.3, c: null }];
}
/** A short group shout (« ho ! », « hé ! »). */
const shoutPlan = (v, r) => [{ d: 0.025, v, s: -2, a: 0.4, c: null }, { d: 0.14 + r() * 0.05, v, s: 0, a: 1, c: null }, { d: 0.07, v, s: -3, a: 0.4, c: null }];
/** An ululation: a high voice, the tongue trilling (the level dips and the vowel flutters about seven times a second). */
function ululation(out, sr, at, dur, v, r) {
  const f0 = 760 + r() * 160, rate = 6.3 + r() * 1.4, n = Math.ceil(dur * sr), y = new Float32Array(n);
  const F = [new Formant(sr), new Formant(sr), new Formant(sr)], tilt = new Biquad('lp', 4200, 0.5, sr);
  let ph = 0, lph = 0;
  for (let j = 0; j < n; j++) {
    const t = j / sr, u = t / dur;
    lph += TAU * rate * (1 + 0.05 * Math.sin(TAU * 0.7 * t)) / sr;
    const tongue = 0.5 + 0.5 * Math.cos(lph);                                        // 1: the vowel open, 0: the tongue against the palate
    const f = f0 * st((u < 0.08 ? -3 + 3 * u / 0.08 : 0) - (u > 0.85 ? 4 * (u - 0.85) / 0.15 : 0) + 0.25 * Math.sin(lph * 0.5));
    if ((j & 7) === 0) { F[0].set(380 + 260 * tongue, 90); F[1].set(1500 + 900 * tongue, 140); F[2].set(2900, 200); }
    ph += f / sr; if (ph >= 1) ph -= 1;
    const amp = (0.35 + 0.65 * tongue ** 0.7) * Math.min(1, t / 0.06, (dur - t) / 0.12);
    y[j] = F[2].p(F[1].p(F[0].p(tilt.p(2 * ph - 1)))) * amp;
  }
  add(out, y, at, v);
}

/** Where a person in the crowd is: level, air absorption and how much of them is reverberation. */
function place(sig, sr, dist) {
  const g = 1 / Math.max(1, dist / 3), lp = new Biquad('lp', Math.max(900, 9000 / (1 + dist / 9)), 0.6, sr);
  for (let i = 0; i < sig.length; i++) sig[i] = lp.p(sig[i]) * g;
  return sig;
}

// ------------------------------------------------------------------------------------------------ the evening's drum loops
/**
 * Parts per bar on a grid of sixteenths: B bass tone, O open tone, o soft open, S stick, s ghost stick, X accent (a slap or a hard stick),
 * R a roll (three quick strokes), M a muted stroke; tama letters n u d w r; claps C (full) c (soft); shouts H (« ho ») E (« hé »).
 * A part's bars repeat to fill the loop.
 */
const LOOPS = {
  // by the gate before the show and in the stands while they fill: a medium groove, the lead's phrases, a unison figure to close the eight bars
  street: {
    bpm: 112, bars: 8, swing: 0.11, room: 'street', seed: 11,
    lamb: ['B..S..B.B...S.s.', 'B..S..B.B.S.B.s.', 'B..S..B.B...S.s.', 'B..S..B.B.S.B.sS', 'B..S..B.B...S.s.', 'B..S..B.B.S.B.s.', 'B..S..B.B...S.s.', 'B.B.BB.B..B.B...'],
    mbeng: ['O.S.SOS.O.S.SOS.', 'O.S.SOS.O.S.SOSs', 'O.S.SOS.O.S.SOS.', 'O.S.SOS.O.SsSOS.', 'O.S.SOS.O.S.SOS.', 'O.S.SOS.O.S.SOSs', 'O.S.SOS.O.S.SOS.', 'X.X.XX.X..X.X...'],
    mbeng2: ['..O.S..S..O.S..S', '..O.S..S..O.S.sS', '..O.S..S..O.S..S', '..O.S..S..O.SsSS', '..O.S..S..O.S..S', '..O.S..S..O.S.sS', '..O.S..S..O.S..S', 'X.X.XX.X..X.X...'],
    nder: ['X...S.X...X.S...', 'X.S.S.X.SsX.S...', '..X.X...X.X.XsSs', 'X...S.X...X.R.R.', 'X.S.S.X.SsX.S.X.', '..X.X...X.X.X...', 'SsSsSsX.X.X.SsSs', 'X.X.XX.X..X.X...'],
    tama: ['................', '................', '....nnu.....d...', '................', '................', '........r..u....', '................', 'u.u.uu.u..u.u...'],
    claps: ['................', '................', '................', '................', '....c.......c...', '....c.......c...', '....c.......c...', '....c.......c...'], clappers: 6, levels: { nder: 1, mbeng: 0.8, mbeng2: 0.7, lamb: 0.95, tama: 0.75, claps: 0.5 },
  },
  // the wrestlers walk out: the bass on every beat, the tama calls, the stands clap on two and four
  entrance: {
    bpm: 120, bars: 8, swing: 0.08, room: 'arena', seed: 23,
    lamb: ['B...B.S.B...B.SB', 'B...B.S.B...B.SB', 'B...B.S.B...B.SB', 'B...B.S.B.B.B.B.', 'B...B.S.B...B.SB', 'B...B.S.B...B.SB', 'B...B.S.B...B.SB', 'B.BB.B.BB.B.B...'],
    mbeng: ['O.SSO.S.O.SSO.S.', 'O.SSO.S.O.SSO.Ss', 'O.SSO.S.O.SSO.S.', 'O.SSO.S.O.SSOsSs', 'O.SSO.S.O.SSO.S.', 'O.SSO.S.O.SSO.Ss', 'O.SSO.S.O.SSO.S.', 'X.XX.X.XX.X.X...'],
    mbeng2: ['..S.O.S...S.O.SS', '..S.O.S...S.O.SS', '..S.O.S...S.O.SS', '..S.O.S...SsO.SS', '..S.O.S...S.O.SS', '..S.O.S...S.O.SS', '..S.O.S...S.O.SS', 'X.XX.X.XX.X.X...'],
    nder: ['X...X...X.X.X...', 'SsSsX...X...XsXs', 'X..X..X...X.X...', 'X.X.X.SsSsSsX...', 'X...X...X.X.X...', 'SsSsX...X...XsXs', 'X..X..X...X.X...', 'X.XX.X.XX.X.X...'],
    tama: ['........nnu.....', '................', 'd.....u.........', '............r...', '................', '....nnuu........', '................', 'u.uu.u.uu.u.u...'],
    claps: ['....C.......C...'], clappers: 26, shouts: ['................', '................', '................', '................', '................', '................', '................', '............H...'], shouters: 16,
    levels: { nder: 1, mbeng: 0.8, mbeng2: 0.7, lamb: 0.8, tama: 0.95, claps: 0.55, shouts: 0.5 },
  },
  // a wrestler's bàkk: fast, two bars of groove and two of a unison figure, claps on every beat, « ho ! » on the figure's last accents
  bakk: {
    bpm: 132, bars: 8, swing: 0.06, room: 'arena', seed: 37,
    lamb: ['B..SB.S.B..SB.SS', 'B..SB.S.B..SB.SS', 'B..B..B.B..B..B.', 'B.B.B.BB.B.BB...', 'B..SB.S.B..SB.SS', 'B..SB.S.B..SB.SS', 'BBB.BBB.BBB.B.B.', 'B.B.BB.BB.B.B...'],
    mbeng: ['OSSOSOS.OSSOSOS.', 'OSSOSOS.OSSOSOSs', 'X..X..X.X..X..X.', 'X.X.X.XX.X.XX...', 'OSSOSOS.OSSOSOS.', 'OSSOSOS.OSSOSOSs', 'XXX.XXX.XXX.X.X.', 'X.X.XX.XX.X.X...'],
    mbeng2: ['S.S.SS.SS.S.SS.S', 'S.S.SS.SS.S.SS.S', 'X..X..X.X..X..X.', 'X.X.X.XX.X.XX...', 'S.S.SS.SS.S.SS.S', 'S.S.SS.SS.S.SS.S', 'XXX.XXX.XXX.X.X.', 'X.X.XX.XX.X.X...'],
    nder: ['X.SsX.SsX.X.R.R.', 'XsXsX..X.X.XSsSs', 'X..X..X.X..X..X.', 'X.X.X.XX.X.XX...', 'X.SsX.SsX.X.R.R.', 'XsXsX..X.X.XRRRR', 'XXX.XXX.XXX.X.X.', 'X.X.XX.XX.X.X...'],
    tama: ['..nnu...r...u...', '....d.d.u...nnu.', 'u..u..u.u..u..u.', 'u.u.u.uu.u.uu...', '..nnu...r...w...', '....d.d.u...rr..', 'uuu.uuu.uuu.u.u.', 'u.u.uu.uu.u.u...'],
    claps: ['C...C...C...C...', 'C...C...C...C...', 'C..C..C.C..C..C.', 'C.C.C.CC.C.C....', 'C...C...C...C...', 'C...C...C...C...', 'C...C...C...C...', 'C.C.CC.CC.C.C...'], clappers: 34,
    shouts: ['................', '................', '................', '...........HH...', '................', '................', '................', '..........E.E...'], shouters: 22,
    levels: { nder: 1, mbeng: 0.85, mbeng2: 0.75, lamb: 0.8, tama: 1, claps: 0.6, shouts: 0.6 },
  },
  // the bout: two drummers keep a light, tense pulse, the tama asks questions, the lead answers now and then
  bout: {
    bpm: 116, bars: 8, swing: 0.1, room: 'arena', seed: 53,
    lamb: ['B.......B...s...', 'B.......B...s.s.', 'B.......B...s...', 'B.......B.B.s...', 'B.......B...s...', 'B.......B...s.s.', 'B.......B...s...', 'B.B.B...B.......'],
    mbeng: ['..S...S...S...S.', '..S...S.s.S...S.', '..S...S...S...S.', '..S...S.s.S.s.S.', '..S...S...S...S.', '..S...S.s.S...S.', '..S...S...S...S.', 'X.X.X...........'],
    nder: ['................', '........X.X.....', '................', 'X.......SsSs....', '................', '....X.....X.X...', '................', 'X.X.X...........'],
    tama: ['............u...', '................', '....nnu.........', '..............d.', '........r.......', '................', 'd.d.u...........', '........w.......'],
    levels: { nder: 0.85, mbeng: 0.75, lamb: 0.75, tama: 1 },
  },
  // the fête after the fall: everything at once, claps on every beat, the shouts
  fete: {
    bpm: 138, bars: 8, swing: 0.05, room: 'arena', seed: 71,
    lamb: ['B.SBB.S.B.SBB.SS', 'B.SBB.S.B.SBB.SS', 'B.SBB.S.B.SBB.SS', 'B.SBB.S.B.SBBBBB', 'B.SBB.S.B.SBB.SS', 'B.SBB.S.B.SBB.SS', 'B.SBB.S.B.SBB.SS', 'B.B.B.B.BB.BB...'],
    mbeng: ['OSSOSOSSOSSOSOSS', 'OSSOSOSSOSSOSOSS', 'OSSOSOSSOSSOSOSS', 'OSSOSOSSXXXXXXXX', 'OSSOSOSSOSSOSOSS', 'OSSOSOSSOSSOSOSS', 'OSSOSOSSOSSOSOSS', 'X.X.X.X.XX.XX...'],
    mbeng2: ['S.SSS.SSS.SSS.SS', 'S.SSS.SSS.SSS.SS', 'S.SSS.SSS.SSS.SS', 'S.SSS.SSXXXXXXXX', 'S.SSS.SSS.SSS.SS', 'S.SSS.SSS.SSS.SS', 'S.SSS.SSS.SSS.SS', 'X.X.X.X.XX.XX...'],
    nder: ['X.X.R.R.X.X.RRRR', 'XsXsXsX.X.X.XXXX', 'X..X..X.X..X..X.', 'RRRRX.X.XXXXXXXX', 'X.X.R.R.X.X.RRRR', 'XsXsXsX.X.X.XXXX', 'X..X..X.X..X..X.', 'X.X.X.X.XX.XX...'],
    tama: ['nnu.nnu.r...u.u.', 'd.d.u...rrr.u...', 'u..u..u.u..u..u.', 'r.r.u.u.uuuuuuuu', 'nnu.nnu.r...u.u.', 'd.d.u...rrr.u...', 'w...w...u.u.u.u.', 'u.u.u.u.uu.uu...'],
    claps: ['C...C...C...C...', 'C...C...C...C...', 'C...C...C...C...', 'C...C...C.C.C.C.', 'C...C...C...C...', 'C...C...C...C...', 'C...C...C...C...', 'C.C.C.C.CC.CC...'], clappers: 40,
    shouts: ['................', '................', '................', '............E...', '................', '................', '................', '.........HH.....'], shouters: 26,
    levels: { nder: 1, mbeng: 0.85, mbeng2: 0.75, lamb: 0.8, tama: 0.9, claps: 0.65, shouts: 0.65 },
  },
};
const ROOMS = { street: { rt60: 0.55, size: 0.8, damp: 4200, mix: 0.16, er: 0.5 }, arena: { rt60: 1.15, size: 1.35, damp: 3600, mix: 0.24, er: 0.35 } };

function renderDrums(name, L) {
  const r = rng(L.seed), sixteenth = 60 / L.bpm / 4, period = L.bars * 16 * sixteenth, tail = 1.2, n = Math.ceil((period + tail) * SR);
  const dry = new Float32Array(n), crowd = new Float32Array(n);
  // each drummer has their own small lean on the beat
  const lean = { nder: -0.004, mbeng: 0.002, mbeng2: 0.006, lamb: 0, tama: -0.002 };
  const when = (bar, i, who, jitter = 0.004) => {
    const swung = i % 2 === 1 ? L.swing * sixteenth : 0;
    return ((bar * 16 + i) * sixteenth + swung + (lean[who] ?? 0) + gauss(r) * jitter) * SR;
  };
  const accent = i => (i % 4 === 0 ? 1 : i % 2 === 0 ? 0.88 : 0.8);
  for (const drum of ['lamb', 'mbeng', 'mbeng2', 'nder']) {
    const bars = L[drum]; if (!bars) continue;
    const lvl = L.levels[drum] ?? 1;
    for (let bar = 0; bar < L.bars; bar++) {
      const p = bars[bar % bars.length];
      for (let i = 0; i < 16; i++) {
        const c = p[i], v0 = accent(i) * (0.88 + 0.12 * r()) * lvl, at = when(bar, i, drum);
        if (c === '.') continue;
        if (c === 'B') stroke(dry, SR, at, drum, drum === 'lamb' ? 'bass' : 'open', v0, r);
        else if (c === 'O') stroke(dry, SR, at, drum, 'open', v0 * 0.9, r);
        else if (c === 'o') stroke(dry, SR, at, drum, 'open', v0 * 0.5, r);
        else if (c === 'S') stroke(dry, SR, at, drum, 'stick', v0 * 0.85, r);
        else if (c === 's') stroke(dry, SR, at, drum, 'stick', v0 * 0.38, r);
        else if (c === 'M') stroke(dry, SR, at, drum, 'mute', v0 * 0.7, r);
        else if (c === 'X') { stroke(dry, SR, at, drum, drum === 'lamb' ? 'bass' : 'stick', Math.min(1, v0 * 1.12), r); if (drum !== 'lamb') stroke(dry, SR, at + 0.003 * SR, drum, 'slap', v0 * 0.6, r); }
        else if (c === 'R') for (let k = 0; k < 3; k++) stroke(dry, SR, at + k * sixteenth / 3 * SR, drum, 'stick', v0 * (0.55 + 0.18 * k), r);
      }
    }
  }
  if (L.tama) {
    const f0 = 292, lvl = L.levels.tama ?? 1;
    for (let bar = 0; bar < L.bars; bar++) {
      const p = L.tama[bar % L.tama.length];
      for (let i = 0; i < 16; i++) if (p[i] !== '.') tama(dry, SR, when(bar, i, 'tama'), p[i], sixteenth * SR, f0 * st(gauss(r) * 0.3), accent(i) * (0.85 + 0.15 * r()) * lvl, r);
    }
  }
  if (L.claps) {                                                                     // the people who clap, each a little early or late, each their own hands
    const people = Array.from({ length: L.clappers }, () => ({ off: gauss(r) * 0.014, sd: 0.006 + r() * 0.012, c: 900 + r() * 1500, g: (0.4 + 0.6 * r()) / Math.sqrt(L.clappers), miss: r() * 0.15, d: 2 + r() * 18 }));
    for (let bar = 0; bar < L.bars; bar++) {
      const p = L.claps[bar % L.claps.length];
      for (let i = 0; i < 16; i++) {
        if (p[i] === '.') continue;
        const soft = p[i] === 'c' ? 0.55 : 1;
        for (const q of people) if (r() > q.miss) clap(crowd, SR, ((bar * 16 + i) * sixteenth + q.off + gauss(r) * q.sd) * SR, q.g * soft * (L.levels.claps ?? 1) * 3 / Math.max(1, q.d / 4), r, q.c);
      }
    }
  }
  if (L.shouts) {
    const voices = Array.from({ length: L.shouters }, () => ({ f0: r() < 0.7 ? 150 + r() * 70 : 290 + r() * 90, fmt: 1 + r() * 0.12, d: 4 + r() * 22, off: gauss(r) * 0.02 }));
    for (let bar = 0; bar < L.bars; bar++) {
      const p = L.shouts[bar % L.shouts.length];
      for (let i = 0; i < 16; i++) {
        if (p[i] === '.') continue;
        const vowel = p[i] === 'H' ? 'O' : 'E';
        for (const q of voices) {
          const one = new Float32Array(Math.ceil(0.5 * SR));
          voice(one, SR, 0, shoutPlan(vowel, r), { f0: q.f0 * st(gauss(r) * 0.4), fmt: q.fmt * 1.06, bright: 0.85, breath: 0.06 }, r);
          add(crowd, place(one, SR, q.d), ((bar * 16 + i) * sixteenth + q.off + gauss(r) * 0.012 - 0.02) * SR, (L.levels.shouts ?? 1) * 2.4 / Math.sqrt(L.shouters));
        }
      }
    }
  }
  const room = ROOMS[L.room], mix = new Float32Array(n);
  for (let i = 0; i < n; i++) mix[i] = dry[i] + crowd[i] * 0.9;
  new Biquad('hp', 70, 0.7, SR).run(mix); new Biquad('lshelf', 160, 0.7, SR, -4).run(mix);   // the bass is felt, not a hum (a phone plays little of it anyway)
  const wet = reverb(mix, SR, room);
  for (let i = 0; i < n; i++) mix[i] = mix[i] + wet[i] * room.mix * 2.2;
  new Biquad('hshelf', 8000, 0.7, SR, -2).run(mix);                                 // a softer top: drums heard across a crowd, not in a studio
  for (let i = n - Math.round(0.05 * SR); i < n; i++) mix[i] *= (n - i) / (0.05 * SR);
  return { pcm: master(mix, SR, -17.5), sr: SR, period, tail, bpm: L.bpm, bars: L.bars };
}

// ------------------------------------------------------------------------------------------------ the crowd beds
/**
 * People at distances: `talkers` chatting, some `excited`; a share of them cheer now and then (`swells`), whistles, ululations,
 * a few claps, a distant background. Rendered at BED_SR (the crowd needs no more than 10 kHz).
 */
const BEDS = {
  // outside the gate: people arriving, talking, laughing, a vendor's call, a whistle from far off
  street: { dur: 22, xfade: 2, talkers: 30, near: 4, far: 32, excited: 0.1, room: 'street', calls: 3, whistles: 2, ululations: 0, claps: 0, swells: 0, rumble: 0.5, seed: 101, rmsDb: -21 },
  // the stands filling: a big, reverberant murmur, claps here and there, a section cheering now and then
  stands: { dur: 24, xfade: 2, talkers: 54, near: 5, far: 40, excited: 0.25, room: 'arena', calls: 2, whistles: 4, ululations: 0, claps: 3, swells: 2, rumble: 0.3, seed: 202, rmsDb: -20 },
  // the wrestlers' entrance and the bàkk: everybody up, shouting, whistling, the women's ululations
  hype: { dur: 20, xfade: 2, talkers: 46, near: 5, far: 38, excited: 0.75, room: 'arena', calls: 0, whistles: 6, ululations: 3, claps: 4, swells: 5, rumble: 0.2, seed: 303, rmsDb: -18.5 },
  // the bout: a low, held murmur, a gasp, single voices urging their man on
  tension: { dur: 20, xfade: 2, talkers: 40, near: 6, far: 40, excited: 0.35, room: 'arena', calls: 0, whistles: 2, ululations: 0, claps: 1, swells: 2, gasps: 2, urges: 6, rumble: 0.2, seed: 404, rmsDb: -21 },
  // the fête: the roar, whistles, ululations, applause
  roar: { dur: 20, xfade: 2, talkers: 30, near: 5, far: 36, excited: 1, room: 'arena', calls: 0, whistles: 8, ululations: 5, claps: 8, swells: 10, sustain: 50, rumble: 0.2, seed: 505, rmsDb: -17.5 },
};

function person(r) { const female = r() < 0.4, young = r() < 0.25; return { f0: female ? 185 + r() * 60 : 98 + r() * 40, fmt: female ? 1.14 + r() * 0.06 : 1 + r() * 0.06, female, young }; }

function renderBed(name, B) {
  const sr = BED_SR, r = rng(B.seed), len = B.dur + B.xfade, n = Math.ceil(len * sr), mix = new Float32Array(n), room = ROOMS[B.room];
  const at = t => t * sr;
  const dist = () => B.near + (B.far - B.near) * Math.sqrt(r());                    // more people far off than near
  for (let k = 0; k < B.talkers; k++) {                                               // the talk
    const p = person(r), d = dist(), sig = new Float32Array(n);
    const ex = Math.min(1, B.excited * (0.6 + 0.8 * r()));
    voice(sig, sr, 0, chatter(len, r, { excited: ex }), { f0: p.f0 * st(ex * 2.5), fmt: p.fmt * (1 + ex * 0.04), bright: 0.25 + 0.4 * ex, breath: 0.05, jitter: 1 }, r, 0.55 + 0.45 * ex);
    add(mix, place(sig, sr, d), 0, 1);
  }
  const swell = (t0, size, dur) => {                                                   // a group cheers
    for (let k = 0; k < size; k++) {
      const p = person(r), d = dist(), sig = new Float32Array(Math.ceil((dur + 0.6) * sr));
      voice(sig, sr, 0, cheerPlan(dur * (0.6 + 0.5 * r()), r), { f0: p.f0 * st(5 + r() * 4), fmt: p.fmt * 1.06, bright: 0.8, breath: 0.07, vib: [5 + r(), 0.35] }, r);
      add(mix, place(sig, sr, d), at(t0 + Math.abs(gauss(r)) * 0.25), 1.1);
    }
  };
  for (let k = 0; k < (B.swells ?? 0); k++) swell(B.xfade + r() * (B.dur - 3), 6 + Math.floor(r() * 10), 1 + r() * 1.6);
  if (B.sustain) for (let t = 0; t < len; t += 0.35) {                                // the roar: cheering held for the whole loop, voices taking over from each other
    const k = Math.round(B.sustain * 0.35 / 1.8);
    for (let i = 0; i < k; i++) {
      const p = person(r), d = dist(), dur = 1.2 + r() * 1.6, sig = new Float32Array(Math.ceil((dur + 0.5) * sr));
      voice(sig, sr, 0, cheerPlan(dur, r, { rise: 1.5 }), { f0: p.f0 * st(6 + r() * 5), fmt: p.fmt * 1.08, bright: 0.85, breath: 0.08, vib: [5 + r() * 1.5, 0.4] }, r);
      add(mix, place(sig, sr, d), at(t + r() * 0.35), 0.75);
    }
  }
  for (let k = 0; k < (B.calls ?? 0); k++) {                                         // a vendor, a friend calling across: a long sung vowel
    const p = person(r), d = 8 + r() * 20, sig = new Float32Array(Math.ceil(2.2 * sr)), v = pick(r, ['e', 'a', 'o']);
    voice(sig, sr, 0, [{ d: 0.08, v, s: -2, a: 0.5 }, { d: 0.5, v, s: 3, a: 1 }, { d: 0.25, v, s: 5, a: 0.9 }, { d: 0.55, v: 'o', s: 1, a: 0.8 }, { d: 0.2, v, s: -3, a: 0.3 }], { f0: p.f0 * st(4), fmt: p.fmt, bright: 0.7, vib: [5.5, 0.3] }, r);
    add(mix, place(sig, sr, d), at(B.xfade + r() * (B.dur - 2.5)), 1.2);
  }
  for (let k = 0; k < (B.urges ?? 0); k++) {                                         // single voices urging a wrestler on: « hé ! hé ! »
    const p = person(r), d = 6 + r() * 18, sig = new Float32Array(Math.ceil(1.4 * sr)), v = pick(r, ['E', 'O', 'a']);
    const plan = []; for (let q = 0; q < 2 + Math.floor(r() * 2); q++) { plan.push(...shoutPlan(v, r)); plan.push({ d: 0.12 + r() * 0.1, v: '@', s: 0, a: 0 }); }
    voice(sig, sr, 0, plan, { f0: p.f0 * st(5), fmt: p.fmt * 1.05, bright: 0.85, breath: 0.06 }, r);
    add(mix, place(sig, sr, d), at(B.xfade + r() * (B.dur - 2)), 1.1);
  }
  for (let k = 0; k < (B.gasps ?? 0); k++) {                                         // the stands catch their breath: « ooh »
    const t0 = B.xfade + r() * (B.dur - 3);
    for (let i = 0; i < 18; i++) {
      const p = person(r), d = dist(), sig = new Float32Array(Math.ceil(1.8 * sr));
      voice(sig, sr, 0, [{ d: 0.06, v: 'o', s: 3, a: 0.4 }, { d: 0.5, v: 'o', s: 2, a: 0.9 }, { d: 0.5, v: 'u', s: -2, a: 0.6 }, { d: 0.2, v: 'u', s: -5, a: 0.2 }], { f0: p.f0 * st(4), fmt: p.fmt, bright: 0.5, breath: 0.1 }, r);
      add(mix, place(sig, sr, d), at(t0 + Math.abs(gauss(r)) * 0.12), 0.9);
    }
  }
  for (let k = 0; k < (B.whistles ?? 0); k++) whistleInto(mix, sr, at(B.xfade * 0.5 + r() * (B.dur - 1)), pick(r, ['wolf', 'call', 'wolf']), 0.5 + r() * 0.9, (0.15 + 0.18 * r()) / Math.max(1, (6 + r() * 20) / 6), r);
  for (let k = 0; k < (B.ululations ?? 0); k++) ululation(mix, sr, at(B.xfade + r() * (B.dur - 3)), 1.6 + r() * 1.2, 0.18 + 0.12 * r(), r);
  for (let k = 0; k < (B.claps ?? 0); k++) {                                         // someone (or a few) clapping along for a moment, out of step with the drums
    const who = 1 + Math.floor(r() * 4), t0 = B.xfade + r() * (B.dur - 4), beat = 0.42 + r() * 0.12;
    for (let q = 0; q < who; q++) { const c = 1000 + r() * 1200, d = 6 + r() * 20; for (let b = 0; b < 4 + Math.floor(r() * 6); b++) clap(mix, sr, at(t0 + b * beat + gauss(r) * 0.01), 0.35 / Math.max(1, d / 5), r, c); }
  }
  if (B.rumble) {                                                                     // the far-off city and the wind: very low, very soft
    const lp = new Biquad('lp', 260, 0.6, sr), lp2 = new Biquad('lp', 400, 0.5, sr); let b = 0;
    for (let i = 0; i < n; i++) { b = 0.985 * b + 0.015 * (r() * 2 - 1); mix[i] += lp2.p(lp.p(b)) * 0.6 * B.rumble; }
  }
  const hp = new Biquad('hp', 90, 0.7, sr); hp.run(mix);
  const wet = reverb(mix, sr, room);
  for (let i = 0; i < n; i++) mix[i] = mix[i] + wet[i] * room.mix * 3;
  new Biquad('hshelf', 5200, 0.7, sr, -4).run(mix);                                 // never a hiss on top: a crowd's air, not a noise
  // the loop's seam: fade in over the first xfade seconds, out over the tail (two copies overlapping sum to the same power)
  const X = Math.round(B.xfade * sr), P = Math.round(B.dur * sr);
  for (let i = 0; i < X; i++) { mix[i] *= Math.sin(0.5 * Math.PI * i / X); if (P + i < n) mix[P + i] *= Math.cos(0.5 * Math.PI * i / X); }
  return { pcm: master(mix, sr, B.rmsDb, 0.8), sr, period: B.dur, tail: B.xfade, xfade: B.xfade };
}
const whistleInto = (mix, sr, at, kind, dur, v, r) => whistle(mix, sr, at, kind, dur, v, r);

// ------------------------------------------------------------------------------------------------ one-shots
function renderShot(name, seed) {
  const sr = BED_SR, r = rng(seed);
  const len = { cheer1: 2.2, cheer2: 2.6, cheerBig: 4.2, ooh: 2.4, applause: 3.6, whistle: 1.4, ululation: 3 }[name], n = Math.ceil(len * sr), mix = new Float32Array(n);
  const crowd = (size, dur, rise, o = {}) => {
    for (let k = 0; k < size; k++) {
      const p = person(r), d = 4 + 30 * Math.sqrt(r()), sig = new Float32Array(Math.ceil((dur + 1) * sr));
      voice(sig, sr, 0, o.plan ? o.plan(r) : cheerPlan(dur * (0.7 + 0.5 * r()), r, { rise }), { f0: p.f0 * st((o.up ?? 6) + r() * 4), fmt: p.fmt * 1.06, bright: 0.8, breath: 0.08, vib: [5 + r(), 0.35] }, r);
      add(mix, place(sig, sr, d), (o.at ?? 0.05) * sr + Math.abs(gauss(r)) * (o.spread ?? 0.18) * sr, 1);
    }
  };
  const applause = (t0, dur, people) => {
    for (let q = 0; q < people; q++) {
      const c = 900 + r() * 1500, d = 4 + r() * 28, rate = 3.6 + r() * 2.4, g = 0.5 / Math.max(1, d / 5);
      for (let t = t0 + r() * 0.2; t < t0 + dur * (0.7 + 0.3 * r()); t += 1 / rate * (0.9 + 0.2 * r())) clap(mix, sr, t * sr, g * Math.min(1, (t0 + dur - t) / 0.8), r, c);
    }
  };
  switch (name) {
    case 'cheer1': crowd(26, 1.3, 3); break;
    case 'cheer2': crowd(34, 1.7, 4); applause(0.3, 1.8, 10); break;
    case 'cheerBig': crowd(28, 0.6, 1, { plan: rr => [{ d: 0.05, v: 'o', s: 2, a: 0.5 }, { d: 0.35, v: 'O', s: 4, a: 1 }, { d: 0.2, v: 'o', s: 1, a: 0.5 }], spread: 0.05 }); crowd(60, 2.8, 4, { at: 0.25, spread: 0.3 }); applause(0.6, 3, 16); whistle(mix, sr, 1.0 * sr, 'wolf', 0.9, 0.12, r); break;
    case 'ooh': crowd(40, 1.4, 0, { plan: rr => [{ d: 0.06, v: 'o', s: 3, a: 0.4 }, { d: 0.55, v: 'o', s: 2.5, a: 1 }, { d: 0.6, v: 'u', s: -2.5, a: 0.6 }, { d: 0.25, v: 'u', s: -6, a: 0.15 }], up: 4, spread: 0.1 }); break;
    case 'applause': applause(0.05, 3.2, 34); crowd(10, 1.2, 3, { at: 0.2, spread: 0.6 }); break;
    case 'whistle': whistle(mix, sr, 0.02 * sr, 'ref', 0.24, 0.6, r); whistle(mix, sr, 0.36 * sr, 'ref', 0.85, 0.65, r); break;
    case 'ululation': ululation(mix, sr, 0.05 * sr, 2.4, 0.5, r); ululation(mix, sr, 0.45 * sr, 2.2, 0.35, r); ululation(mix, sr, 0.9 * sr, 1.8, 0.25, r); break;
    default: throw new Error(name);
  }
  const room = ROOMS.arena, wet = reverb(mix, sr, room);
  for (let i = 0; i < n; i++) mix[i] = mix[i] + wet[i] * room.mix * (name === 'whistle' ? 1.2 : 2.5);
  new Biquad('hp', 100, 0.7, sr).run(mix); new Biquad('hshelf', 5200, 0.7, sr, -3).run(mix);
  for (let i = n - Math.round(0.08 * sr); i < n; i++) mix[i] *= (n - i) / (0.08 * sr);
  return { pcm: master(mix, sr, name === 'whistle' ? -18 : -16.5, 0.85), sr, length: len };
}

// ------------------------------------------------------------------------------------------------ encoding
export { voice, chatter, cheerPlan, shoutPlan, person, place, stroke, tama, clap, whistle, ululation, reverb, master, rng, Biquad, rms, peak, renderDrums, renderBed, renderShot, LOOPS, BEDS };
const MAIN = import.meta.url === pathToFileURL(process.argv[1] ?? '').href;
const tmp = MAIN ? fs.mkdtempSync(path.join(os.tmpdir(), 'arena-audio-')) : null;
function encode(pcm, sr, file, kbps) {
  const raw = path.join(tmp, 'x.f32'); fs.writeFileSync(raw, Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength));
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'f32le', '-ar', String(sr), '-ac', '1', '-i', raw, '-c:a', 'libmp3lame', '-b:a', `${kbps}k`, '-ar', String(sr), '-map_metadata', '-1', '-id3v2_version', '0', '-write_xing', '1', file]);
  return fs.statSync(file).size;
}
function writeWav(pcm, sr, file) {
  const n = pcm.length, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(pcm[i] * 32767))), 44 + i * 2);
  fs.writeFileSync(file, b);
}

if (MAIN) main();
function main() {
fs.mkdirSync(OUT, { recursive: true });
const manifest = { note: 'Authored offline by scripts/audio/render-arena.mjs (synthesis, no recordings). period: seconds between two copies of a loop; tail: what follows it (plays under the next copy).', drums: {}, beds: {}, shots: {} };
const t0 = Date.now(); let total = 0;
const stash = {};
for (const [name, L] of Object.entries(LOOPS)) {
  if (ONLY && !ONLY.includes(`drums-${name}`)) continue;
  const d = renderDrums(name, L), file = `drums-${name}.mp3`, size = encode(d.pcm, d.sr, path.join(OUT, file), 96);
  total += size; stash[`drums-${name}`] = d;
  manifest.drums[name] = { file, period: +d.period.toFixed(6), tail: d.tail, bpm: d.bpm, bars: d.bars, bar: +(d.period / d.bars).toFixed(6) };
  console.log(`drums-${name}: ${d.period.toFixed(2)} s + ${d.tail} s, ${(size / 1024).toFixed(0)} KB, rms ${dB(rms(d.pcm)).toFixed(1)} dB, peak ${dB(peak(d.pcm)).toFixed(1)} dB`);
}
for (const [name, B] of Object.entries(BEDS)) {
  if (ONLY && !ONLY.includes(`bed-${name}`)) continue;
  const d = renderBed(name, B), file = `bed-${name}.mp3`, size = encode(d.pcm, d.sr, path.join(OUT, file), 48);
  total += size; stash[`bed-${name}`] = d;
  manifest.beds[name] = { file, period: d.period, tail: d.tail };
  console.log(`bed-${name}: ${d.period} s + ${d.tail} s, ${(size / 1024).toFixed(0)} KB, rms ${dB(rms(d.pcm)).toFixed(1)} dB, peak ${dB(peak(d.pcm)).toFixed(1)} dB`);
}
for (const [i, name] of ['cheer1', 'cheer2', 'cheerBig', 'ooh', 'applause', 'whistle', 'ululation'].entries()) {
  if (ONLY && !ONLY.includes(`shot-${name}`)) continue;
  const d = renderShot(name, 900 + i), file = `shot-${name}.mp3`, size = encode(d.pcm, d.sr, path.join(OUT, file), 56);
  total += size; stash[`shot-${name}`] = d;
  manifest.shots[name] = { file, length: d.length };
  console.log(`shot-${name}: ${d.length} s, ${(size / 1024).toFixed(0)} KB, rms ${dB(rms(d.pcm)).toFixed(1)} dB, peak ${dB(peak(d.pcm)).toFixed(1)} dB`);
}
if (!ONLY) fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
console.log(`total ${(total / 1024).toFixed(0)} KB in ${((Date.now() - t0) / 1000).toFixed(1)} s`);

// ------------------------------------------------------------------------------------------------ previews: each phase as the game mixes it
if (PREVIEW) {
  fs.mkdirSync(PREVIEW, { recursive: true });
  const up = (d, sr = SR) => { if (d.sr === sr) return d.pcm; const k = sr / d.sr, y = new Float32Array(Math.ceil(d.pcm.length * k)); for (let i = 0; i < y.length; i++) { const x = i / k, j = Math.floor(x), f = x - j; y[i] = (d.pcm[j] ?? 0) * (1 - f) + (d.pcm[j + 1] ?? 0) * f; } return y; };
  /** Two periods of a loop played as the game plays it: copies one period apart, the tail under the next. */
  const loop2 = (d, secs) => { const y = new Float32Array(Math.ceil(secs * SR)), x = up(d); for (let t = 0; t < secs; t += d.period) add(y, x, t * SR); return y; };
  const PH = { gathering: ['drums-street', 'bed-street', 0.55, 0.5], entrance: ['drums-entrance', 'bed-hype', 0.75, 0.45], ceremony: ['drums-bakk', 'bed-hype', 0.8, 0.45], bout: ['drums-bout', 'bed-tension', 0.6, 0.55], celebration: ['drums-fete', 'bed-roar', 0.75, 0.55] };
  for (const [ph, [dk, bk, dg, bg]] of Object.entries(PH)) {
    if (!stash[dk] || !stash[bk]) continue;
    const secs = 24, a = loop2(stash[dk], secs), b = loop2(stash[bk], secs), y = new Float32Array(secs * SR);
    for (let i = 0; i < y.length; i++) y[i] = a[i] * dg + b[i] * bg;
    const f = path.join(PREVIEW, `phase-${ph}.wav`); writeWav(y, SR, f);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', f, '-lavfi', 'showspectrumpic=s=1024x384:legend=1:fscale=lin:stop=11000', path.join(PREVIEW, `phase-${ph}.png`)]);
    console.log(`preview ${ph}: rms ${dB(rms(y)).toFixed(1)} dB, peak ${dB(peak(y)).toFixed(1)} dB`);
  }
}
fs.rmSync(tmp, { recursive: true, force: true });
}
