// Le Patio's music (the second club of the Almadies night street, 70 m from La Vague): an original warm, low-key lounge / afro-house groove, synthesised offline here — no samples, no downloads.
// A soft kick on every beat, a swung shaker and off-beat hat, a rim and a clap on two and four, a round electric bass with room around it, a mellow FM electric piano
// (rootless 9th chords), a kora-like pluck pattern (Karplus-Strong strings with a calabash body), a slow pad, a few soft congas, and a sparse high flute-like lead that
// only comes in on the B section; mixed with panning, a long dark courtyard reverb, a dotted-eighth ping-pong delay, a gentle kick-driven pump on the bass and pad,
// bus compression and a look-ahead limiter. D minor, 100 bpm with a light 16th swing, 32 bars = a 76.8 s seamless loop.
// Nothing here is La Vague's: not its tempo (120), key (G major), chords (G-C-D-C, Em: here Dm9, Bbmaj7, Gm9, Fmaj7, Am7, Em7b5, A7 …), drum pattern (sabar, 3-3-2) or melody.
//
// The file the game plays:  [0.25 s silence][sync tick][…silence to 0.5 s][the loop's last bar][the 32-bar loop][the loop's first bar]
//   – the tick lets the game find where the decoder put the start (MP3 decoders add a different delay), so the loop points and the beat map are exact;
//   – one bar on either side of the loop is real, continuous music: the loop points land in the middle of steady audio, the seam is seamless.
// The beat map (src/venues/patioTrack.ts) is written by this same script from the same grid the notes were placed on, and the downbeats are measured again
// in the encoded MP3 (decoded by ffmpeg) to prove that the timing matches what is heard. The output is deterministic: every random choice is seeded.
//
// Usage: node render-patio.mjs [outMp3=public/assets/audio/music/le-patio.mp3] [beatmapTs=src/venues/patioTrack.ts] [--listen=/path/listen.mp3] [--wav=/path/frame.wav]
//   (--listen: two loops back to back, no tick, for listening; --wav: the file's frame before the MP3 encode, for the checks)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const flags = Object.fromEntries(process.argv.slice(2).filter(a => a.startsWith('--')).map(a => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));
const OUT = args[0] ?? 'public/assets/audio/music/le-patio.mp3';
const MAP = args[1] ?? 'src/venues/patioTrack.ts';
const GAME_FILE = 'assets/audio/music/le-patio.mp3';       // where the game finds the file (under public/), whatever OUT is
const SR = 44100;
const BPM = 100, BEAT = 60 / BPM, STEP = BEAT / 4, BAR = BEAT * 4;     // 0.6 s, 0.15 s, 2.4 s: every one a whole number of samples at 44.1 kHz
const BARS = 32, L = BARS * BAR;                 // 76.8 s
const KICK_GAIN = 0.43;
const CLICK = 0.8;                                // the downbeat's knock, in the mix's own scale (the kick's other beats carry a quarter of it); the MP3 check below finds the bar lines by it
const TICK_GAIN = 1.0;
const SWING = 0.13;                              // the odd sixteenths come 13 % of a step late: 56.5 : 43.5 inside each pair, a gentle swing (the beats stay on the grid)
const LOOPS = 3;                                 // rendered three times: the middle one is steady (its tails and the effects' state come from the one before)
const TAIL = 4;
const N = Math.ceil((LOOPS * L + TAIL) * SR);
const TAU = Math.PI * 2;
const KBPS = 80;                                 // 32 bars do not fit a smaller file at a higher rate (≈ 82 s of audio, 900 KB at most)
const TARGET_LUFS = -16, TP_MAX = -1.3;          // loudness aimed at (EBU R128, integrated), true peak not to exceed (dBTP): the brief asks for under -1

// ------------------------------------------------------------------------------------------------ helpers
function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const mtof = m => 440 * 2 ** ((m - 69) / 12);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const db = x => 20 * Math.log10(Math.max(1e-9, x));

/** Topology-preserving state-variable filter (Zavalishin): lp / bp / hp at a cutoff that may move every sample. */
class SVF {
  constructor() { this.ic1 = 0; this.ic2 = 0; }
  run(x, fc, q, mode = 'lp') {
    const g = Math.tan(Math.PI * clamp(fc, 10, SR * 0.45) / SR), k = 1 / q;
    const a1 = 1 / (1 + g * (g + k)), a2 = g * a1, a3 = g * a2;
    const v3 = x - this.ic2, v1 = a1 * this.ic1 + a2 * v3, v2 = this.ic2 + a2 * this.ic1 + a3 * v3;
    this.ic1 = 2 * v1 - this.ic1; this.ic2 = 2 * v2 - this.ic2;
    return mode === 'lp' ? v2 : mode === 'bp' ? v1 : x - k * v1 - v2;
  }
}
/** One-pole low / high pass. */
class OnePole { constructor(fc) { this.a = Math.exp(-TAU * fc / SR); this.z = 0; } lp(x) { this.z = x * (1 - this.a) + this.z * this.a; return this.z; } hp(x) { return x - this.lp(x); } }
function polyblep(t, dt) { if (t < dt) { t /= dt; return t + t - t * t - 1; } if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; } return 0; }

// ------------------------------------------------------------------------------------------------ the buses
const bus = {
  drums: [new Float32Array(N), new Float32Array(N)],
  music: [new Float32Array(N), new Float32Array(N)],
  pump: [new Float32Array(N), new Float32Array(N)],      // the bass and the pad: ducked a little by every kick
  rev: [new Float32Array(N), new Float32Array(N)],
  dly: new Float32Array(N),
};
/** What each part adds to the middle loop (power, for the calibration printout only). */
const stat = {};
/** Adds a mono voice at `t` (s) with a gain, an equal-power pan (−1 … 1) and effect sends. */
function put(voice, t, { gain = 1, pan = 0, rev = 0, dly = 0, group = 'music', label = '' } = {}) {
  const s0 = Math.round(t * SR), a = (clamp(pan, -1, 1) + 1) * Math.PI / 4, gl = Math.cos(a) * gain, gr = Math.sin(a) * gain;
  const [bl, br] = bus[group], [rl, rr] = bus.rev;
  const m0 = Math.round(L * SR), m1 = Math.round(2 * L * SR);
  let pw = 0;
  for (let i = 0; i < voice.length; i++) {
    const n = s0 + i; if (n < 0 || n >= N) continue;
    const v = voice[i];
    bl[n] += v * gl; br[n] += v * gr;
    if (rev) { rl[n] += v * gl * rev; rr[n] += v * gr * rev; }
    if (dly) bus.dly[n] += v * gain * dly;
    if (n >= m0 && n < m1) pw += v * v * gain * gain;
  }
  if (label) stat[label] = (stat[label] ?? 0) + pw;
}

// ------------------------------------------------------------------------------------------------ instruments
/** Each voice's noise comes from its own seed (its bar and step): the three rendered loops are sample for sample the same, so the seam is exact. */
const noiseOf = seed => { const r = mulberry(seed * 7919 + 13); return () => r() * 2 - 1; };

/** A soft kick: a round sine that falls from ~115 Hz to ~54 Hz, and the knock of `clickAt` on top (`click` scales it: the downbeat's is the strongest — the bar lines are found by it). */
function kick(vel, click = 0.25) {
  const n = Math.round(0.4 * SR), out = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, f = 54 + 52 * Math.exp(-t / 0.03) + 9 * Math.exp(-t / 0.12);
    ph += TAU * f / SR;
    const body = Math.sin(ph) * (1 - Math.exp(-t / 0.0016)) * Math.exp(-t / 0.2);
    out[i] = Math.tanh(1.25 * body) / Math.tanh(1.25) * vel + clickAt(t) * click * vel;
  }
  return out;
}
/** The click: a two-tone knock (1.9 and 3 kHz, 1–2 ms), squared off a little by a tanh so that it keeps its energy at a lower peak, and faded in over a tenth of a
 *  millisecond so that the first sample of a bar stays small. A tone, not noise, so the MP3 coder keeps it whole; the downbeat is found by it. */
const clickAt = t => (t < 0.004 ? 0.78 * Math.min(1, t / 0.00012) ** 2 * Math.tanh(2.2 * (Math.sin(TAU * 1900 * t) * Math.exp(-t / 0.0012) + 0.5 * Math.sin(TAU * 3000 * t) * Math.exp(-t / 0.0008))) / Math.tanh(2.2) : 0);

/** The same knock alone: the downbeat's mark where there is no kick (the break). */
function tock(vel) {
  const n = Math.round(0.02 * SR), out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = clickAt(i / SR) * vel;
  return out;
}

/** A cross-stick: two short woody tones and a puff of noise. */
function rim(vel, seed = 1) {
  const noise = noiseOf(seed + 505), n = Math.round(0.14 * SR), out = new Float32Array(n), bp = new SVF();
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const tone = 0.6 * Math.sin(TAU * 830 * t) * Math.exp(-t / 0.02) + 0.4 * Math.sin(TAU * 1980 * t) * Math.exp(-t / 0.011);
    const nz = bp.run(noise(), 3200, 1.0, 'bp') * 0.55 * Math.exp(-t / 0.007);
    out[i] = (tone + nz) * (1 - Math.exp(-t / 0.0004)) * vel;
  }
  return out;
}

/** A closed or open hat: high band noise, an instant attack. */
function hat(vel, open = false, seed = 1) {
  const noise = noiseOf(seed + 606), n = Math.round((open ? 0.32 : 0.07) * SR), out = new Float32Array(n), bp = new SVF(), hp = new OnePole(6000);
  for (let i = 0; i < n; i++) {
    const t = i / SR, env = (1 - Math.exp(-t / 0.0007)) * Math.exp(-t / (open ? 0.09 : 0.016));
    out[i] = bp.run(hp.hp(noise()), 9200, 0.8, 'bp') * env * vel * 2.2;
  }
  return out;
}

/** A shaker: softer, rounder and lower than the hat. */
function shaker(vel, seed = 1) {
  const noise = noiseOf(seed + 303), n = Math.round(0.09 * SR), out = new Float32Array(n), bp = new SVF(), hp = new OnePole(3000);
  for (let i = 0; i < n; i++) {
    const t = i / SR, env = (1 - Math.exp(-t / 0.004)) * Math.exp(-t / 0.026);
    out[i] = bp.run(hp.hp(noise()), 6400, 1.0, 'bp') * env * vel * 1.7;
  }
  return out;
}

/** A soft clap: three quick bursts and a short tail, mostly in the reverb. */
function clap(vel, seed = 1) {
  const noise = noiseOf(seed + 404), n = Math.round(0.26 * SR), out = new Float32Array(n), bp = new SVF(), hp = new OnePole(600);
  const bursts = [0, 0.011, 0.023];
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let env = 0;
    for (const b of bursts) if (t >= b) env = Math.max(env, Math.exp(-(t - b) / 0.008));
    env = Math.max(env, t > 0.023 ? 0.5 * Math.exp(-(t - 0.023) / 0.07) : 0);
    out[i] = bp.run(hp.hp(noise()), 1150, 0.9, 'bp') * env * vel * 1.4;
  }
  return out;
}

const MODES = [1, 1.594, 2.136, 2.296, 2.653, 2.918, 3.156, 3.501];
/** A goatskin drum hit by the hand (modal synthesis), used here as a soft conga: `open` rings, `tap` is muffled, `slap` cracks. */
function conga(f0, kind, vel, seed = 1) {
  const R = mulberry(seed), noise = noiseOf(seed + 101);
  const spec = {
    open: { amps: [1, 0.5, 0.3, 0.22, 0.14, 0.1, 0.07, 0.05], dec: [0.3, 0.18, 0.12, 0.09, 0.07, 0.06, 0.05, 0.04], nz: 0.2, nzf: 1500, nzd: 0.012, drop: 0.06, len: 0.5 },
    slap: { amps: [0.45, 0.55, 0.5, 0.45, 0.4, 0.35, 0.3, 0.25], dec: [0.1, 0.07, 0.055, 0.05, 0.04, 0.035, 0.03, 0.028], nz: 0.8, nzf: 2600, nzd: 0.02, drop: 0.04, len: 0.24 },
    tap: { amps: [0.9, 0.35, 0.2, 0.12, 0.08, 0.05, 0.03, 0.02], dec: [0.06, 0.04, 0.03, 0.022, 0.018, 0.015, 0.012, 0.01], nz: 0.18, nzf: 1200, nzd: 0.008, drop: 0.02, len: 0.14 },
  }[kind];
  const n = Math.round(spec.len * SR), out = new Float32Array(n), bp = new SVF(), ph = MODES.map(() => R() * 0.3);
  const detune = MODES.map(() => 1 + (R() - 0.5) * 0.01);
  for (let i = 0; i < n; i++) {
    const t = i / SR, bend = 1 + spec.drop * Math.exp(-t / 0.025);
    let s = 0;
    for (let k = 0; k < MODES.length; k++) {
      const a = spec.amps[k] * Math.exp(-t / spec.dec[k]); if (a < 1e-5) continue;
      ph[k] += TAU * f0 * MODES[k] * detune[k] * bend / SR;
      s += a * Math.sin(ph[k]);
    }
    const nz = bp.run(noise(), spec.nzf, 0.9, 'bp') * spec.nz * Math.exp(-t / spec.nzd);
    out[i] = (s * 0.42 + nz) * (1 - Math.exp(-t / 0.0008)) * vel;
  }
  return out;
}

/** Electric bass: a round fundamental, a little second and third harmonic, a slow low-pass; plucked softly and left to ring. */
function bass(midi, dur, vel) {
  const f = mtof(midi), rel = 0.09, n = Math.round((dur + rel) * SR), out = new Float32Array(n), lp = new SVF();
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    ph += TAU * f / SR;
    const osc = Math.sin(ph) + 0.24 * Math.sin(2 * ph + 0.3) + 0.1 * Math.sin(3 * ph + 0.9);
    const cut = 220 + f * 2.2 + 800 * vel * Math.exp(-t / 0.08);
    let env = (1 - Math.exp(-t / 0.008)) * (0.68 + 0.32 * Math.exp(-t / 0.3));
    if (t > dur) env *= Math.exp(-(t - dur) / (rel / 3));
    out[i] = Math.tanh(1.25 * lp.run(osc, cut, 0.75) * env) * vel;
  }
  return out;
}

/** FM electric piano (a tine and its bell), softened by a low-pass that closes as the note decays; a long warm ring. */
function ep(midi, dur, vel) {
  const f = mtof(midi), rel = 0.25, n = Math.round((dur + rel + 0.05) * SR), out = new Float32Array(n), lp = new SVF();
  let pc = 0, pm = 0, pt = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    pm += TAU * f / SR; pc += TAU * f / SR; pt += TAU * f * 13.9 / SR;
    const I = 1.3 * vel * Math.exp(-t / 0.2) + 0.12;
    let env = (1 - Math.exp(-t / 0.003)) * Math.exp(-t / 1.4);
    if (t > dur) env *= Math.exp(-(t - dur) / (rel / 3));
    const s = Math.sin(pc + I * Math.sin(pm)) + 0.06 * vel * Math.exp(-t / 0.02) * Math.sin(pt);
    out[i] = lp.run(s, 1500 + 1800 * vel * Math.exp(-t / 0.1), 0.7) * env * vel;
  }
  return out;
}

/** A plucked string (Karplus-Strong with a fractional delay), here a kora-like one: `body` is the calabash's resonance. */
function pluck(midi, t60, vel, bright = 0.6, seed = 5, pick = 0.17, body = 2400, soft = 0) {
  const R = mulberry(seed), f = mtof(midi), D = SR / f - 0.5, len = Math.ceil(D) + 2;
  const buf = new Float32Array(len), n = Math.round(Math.min(t60 * 1.2, 2.4) * SR), out = new Float32Array(n);
  const lp = new OnePole(800 + 9000 * bright);
  const exc = new Float32Array(len);
  for (let i = 0; i < len; i++) exc[i] = lp.lp(R() * 2 - 1);
  const shift = Math.max(1, Math.round(pick * D));
  for (let i = 0; i < len; i++) buf[i] = exc[i] - (i >= shift ? exc[i - shift] : 0);
  const rho = 10 ** (-3 / (t60 * f));
  let w = 0, last = 0;
  const di = Math.floor(D), fr = D - di;
  const res = new SVF(), hp = new OnePole(120);
  for (let i = 0; i < n; i++) {
    const r0 = (w - di + len * 4) % len, r1 = (r0 - 1 + len) % len;
    const y = buf[r0] * (1 - fr) + buf[r1] * fr;
    const v = rho * (0.5 * y + 0.5 * last); last = y;
    buf[w] = v; w = (w + 1) % len;
    const s = hp.hp(y);
    out[i] = (s + 0.3 * res.run(s, body, 1.4, 'bp')) * vel * (1 - Math.exp(-i / SR / 0.0008));
  }
  if (soft) { const a = new SVF(), c = new SVF(); for (let i = 0; i < n; i++) out[i] = c.run(a.run(out[i], soft, 0.7), soft, 0.7); }       // a rounder string: nothing much above `soft` Hz
  return out;
}

/** A sparse, airy lead (monophonic, legato glides, a late soft vibrato, a breath of noise): notes [t, midi, dur] in seconds from the phrase start. */
function airy(notes, vel = 1, seed = 31) {
  const noise = noiseOf(seed), end = notes.reduce((m, [t, , d]) => Math.max(m, t + d), 0) + 0.5;
  const n = Math.round(end * SR), out = new Float32Array(n), lp = new SVF(), br = new SVF();
  let p1 = 0, ph = 0, f = mtof(notes[0][1]), env = 0, k = 0, tn = 0, gate = false;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    while (k < notes.length && t >= notes[k][0]) { const legato = gate && Math.abs(t - (notes[k - 1][0] + notes[k - 1][2])) < 0.02; tn = legato ? tn : 0; if (!legato) f = mtof(notes[k][1]); k++; gate = true; }
    const cur = notes[Math.max(0, k - 1)];
    if (t > cur[0] + cur[2]) gate = false;
    const target = mtof(cur[1]);
    f += (target - f) * (1 - Math.exp(-1 / (SR * 0.04)));
    tn += 1 / SR;
    const vib = 1 + 0.008 * (1 - Math.exp(-Math.max(0, tn - 0.25) / 0.3)) * Math.sin(TAU * 4.8 * t);
    const fv = f * vib, dt = fv / SR;
    ph += TAU * dt; p1 = (p1 + dt) % 1;
    const saw = 2 * p1 - 1 - polyblep(p1, dt);
    const osc = 0.8 * Math.sin(ph) + 0.1 * Math.sin(2 * ph) + 0.16 * saw;
    env += ((gate ? 1 : 0) - env) * (1 - Math.exp(-1 / (SR * (gate ? 0.03 : 0.15))));
    const cut = Math.min(2600, 900 + fv * 1.1 + 700 * Math.exp(-tn / 0.25));
    const breath = br.run(noise(), 3600, 1.0, 'bp') * 0.035 * env;
    out[i] = (lp.run(osc, cut, 0.9) + breath) * env * vel * 0.8;
  }
  return out;
}

/** A slow pad: one detuned layer of triangle waves (called twice, once for each side), a long swell in and out. Triangles and two low-passes in a row (24 dB/oct):
 *  no edge, no buzz where the voices' phases line up — the pad has nothing above ~1.2 kHz for the downbeat check to mistake for an attack. */
const padCache = new Map();
function pad(midis, dur, vel, det = 1) {
  const key = `${midis}|${dur}|${vel}|${det}`;
  if (padCache.has(key)) return padCache.get(key);
  const rel = 0.9, n = Math.round((dur + rel) * SR), out = new Float32Array(n), lp1 = new SVF(), lp2 = new SVF();
  const vs = midis.map((m, i) => [mtof(m) * det, (i * 0.37) % 1]);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let s = 0;
    for (const v of vs) { v[1] = (v[1] + v[0] / SR) % 1; s += 4 * Math.abs(v[1] - 0.5) - 1; }
    let env = 1 - Math.exp(-t / 0.3);
    if (t > dur) env *= Math.exp(-(t - dur) / (rel / 3));
    const fc = 640 + 160 * Math.sin(TAU * 0.2 * t);
    out[i] = lp2.run(lp1.run(s / vs.length, fc, 0.7), fc, 0.7) * env * vel * 1.9;
  }
  padCache.set(key, out);
  return out;
}

/** A noise riser: a band that opens upward, getting louder, and is gone before the downbeat it leads to. */
function riser(dur, vel) {
  const noise = noiseOf(77), n = Math.round(dur * SR), out = new Float32Array(n), bp = new SVF();
  for (let i = 0; i < n; i++) {
    const u = i / n, fc = 500 * 12 ** u;
    const amp = u * u * Math.min(1, (n - i) / (0.03 * SR));
    out[i] = bp.run(noise(), fc, 1.4, 'bp') * amp * vel * 2.2;
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ the song (one loop, in steps from its start)
// D minor, one chord to the bar. A: | Dm9 | Bbmaj7 | Gm9 | A7sus4 | twice (the second ends on A7). B: sixteen bars, the lead sings over | Bbmaj7 | Fmaj7 | Gm9 | Dm9 | Bbmaj7 | Am7 | Em7b5 | A7 |
// and again (the second time it ends on A7sus4 → A7). The break: | Gm9 | Gm9 | Bbmaj7 | A7sus4 |, the build: | Dm9 | Bbmaj7 | Gm9 | A7 |.
// Per chord: root (the bass), the electric piano's rootless voicing, the pad's voicing, the pitch classes the kora's strings are tuned to.
const CH = {
  Dm9: { root: 38, ep: [53, 57, 60, 64], pad: [50, 57, 60, 64], pcs: [2, 5, 9, 0] },
  Bbmaj7: { root: 34, ep: [50, 53, 57, 62], pad: [46, 53, 57, 62], pcs: [10, 2, 5, 9] },
  Gm9: { root: 43, ep: [53, 58, 62, 67], pad: [55, 58, 62, 65], pcs: [7, 10, 2, 5] },
  A7sus4: { root: 45, ep: [55, 62, 64, 69], pad: [52, 57, 62, 67], pcs: [9, 2, 4, 7] },
  A7: { root: 45, ep: [55, 61, 64, 69], pad: [52, 57, 61, 67], pcs: [9, 1, 4, 7] },
  Fmaj7: { root: 41, ep: [57, 60, 64, 65], pad: [53, 57, 60, 64], pcs: [5, 9, 0, 4] },
  Em7b5: { root: 40, ep: [55, 58, 62, 64], pad: [52, 55, 58, 62], pcs: [4, 7, 10, 2] },
  Am7: { root: 45, ep: [55, 60, 64, 69], pad: [52, 57, 60, 67], pcs: [9, 0, 4, 7] },
};
const PROG = [
  'Dm9', 'Bbmaj7', 'Gm9', 'A7sus4', 'Dm9', 'Bbmaj7', 'Gm9', 'A7',
  'Bbmaj7', 'Fmaj7', 'Gm9', 'Dm9', 'Bbmaj7', 'Am7', 'Em7b5', 'A7', 'Bbmaj7', 'Fmaj7', 'Gm9', 'Dm9', 'Bbmaj7', 'Am7', 'A7sus4', 'A7',
  'Gm9', 'Gm9', 'Bbmaj7', 'A7sus4',
  'Dm9', 'Bbmaj7', 'Gm9', 'A7',
];
const SECTION = b => (b < 8 ? 'A' : b < 24 ? 'B' : b < 28 ? 'break' : 'build');
const FILLS = [7, 15, 23, 27, 31];
const ev = [];      // [timeInLoop (s), fn(t) => void]
const kicks = [];   // the samples every kick starts at (the pump follows them)
/** The kora's strings for a chord: its pitch classes between Bb3 and Ab5. */
const pool = pcs => { const p = []; for (let m = 58; m <= 80; m++) if (pcs.includes(m % 12)) p.push(m); return p; };
/** A step of the bar in seconds from the loop's start: the odd sixteenths come a little late (the swing); the beats stay on the grid. */
const at = (bar, step) => bar * BAR + step * STEP + (Number.isInteger(step) && step % 2 === 1 ? SWING * STEP : 0);
const hum = mulberry(99);
/** A few ms of human timing off the beat; the beats themselves stay on the grid (what the dancers tap to). */
const jit = (ms = 3, s = 1) => { const j = (hum() - 0.5) * 2 * ms / 1000; return s % 4 === 0 ? 0 : j; };

// the patterns: [step, …]
const BASS_A = [[0, 0, 5, 1], [6, 12, 2, 0.7], [10, 7, 3, 0.82]];               // [step, semitones over the root, steps long, velocity]
const BASS_B = [[0, 0, 5, 1], [6, 12, 2, 0.7], [10, 0, 2, 0.85], [13, 7, 2, 0.62]];
const EP_A = [[0, 5, 0.72], [7, 2, 0.5], [10, 4, 0.58]];                         // [step, steps long, velocity]
const KORA_A = [[0, 0, 0.8], [2, 2, 0.5], [4, 4, 0.55], [6, 2, 0.5], [8, 1, 0.7], [10, 3, 0.5], [12, 5, 0.6], [14, 3, 0.5]];        // [step, string (index in the chord's pool), velocity]
const KORA_B = [[0, 0, 0.8], [2, 3, 0.5], [5, 5, 0.45], [6, 4, 0.55], [8, 1, 0.7], [10, 4, 0.5], [13, 6, 0.45], [14, 5, 0.55]];
const KORA_S = [[0, 0, 0.7], [4, 3, 0.45], [8, 1, 0.6], [12, 4, 0.5], [14, 3, 0.4]];                                              // the thinner one of A's second half
const roll = (b, from, to, v0, v1, push) => { for (let s = from; s <= to; s++) push(s, v0 + (v1 - v0) * (s - from) / Math.max(1, to - from)); };

for (let b = 0; b < BARS; b++) {
  const sec = SECTION(b), ch = CH[PROG[b]], pl = pool(ch.pcs);
  const inA = sec === 'A', inB = sec === 'B', brk = sec === 'break', bld = sec === 'build', B2 = inB && b >= 16;
  const fill = FILLS.includes(b);
  const str = i => pl[Math.min(i, pl.length - 1)];
  // ---- kick: a soft one on every beat; none in the break; back in the build with a breath before the loop
  const KICKS = brk ? [] : b === 28 ? [[0, 0.8], [8, 0.7]] : b === 31 ? [[0, 1], [4, 0.8], [8, 0.92]] : [[0, 1], [4, 0.78], [8, 0.92], [12, 0.78]];
  for (const [s, v] of KICKS) ev.push([at(b, s), t => { put(kick(v, (s === 0 ? CLICK : 0.25 * CLICK) / KICK_GAIN), t, { gain: KICK_GAIN, group: 'drums', rev: 0.02, label: 'kick' }); kicks.push(Math.round(t * SR)); }]);
  // ---- the rim on two and four (and a soft clap behind it in the second half of B and in the build); rolls on the fills
  const rimAt = (s, v) => ev.push([at(b, s) + jit(2, s), t => put(rim(v, b * 16 + s), t, { gain: 1.7, pan: -0.12, group: 'drums', rev: 0.14, label: 'rim' })]);
  if (!brk) {
    rimAt(4, 0.8);
    if (!fill && b !== 30) rimAt(12, 0.8);
    if (B2 || bld) for (const s of [4, 12]) if (!(s === 12 && (fill || b === 30))) ev.push([at(b, s) + jit(2, s), t => put(clap(0.5, b * 16 + s), t, { gain: 2.0, pan: 0.05, group: 'drums', rev: 0.4, label: 'clap' })]);
  }
  if (b === 7 || b === 23) roll(b, 12, 15, 0.35, 0.75, rimAt);
  if (b === 15) roll(b, 13, 15, 0.35, 0.65, rimAt);
  if (b === 27) { rimAt(12, 0.6); roll(b, 13, 15, 0.35, 0.8, rimAt); }
  if (b === 30) roll(b, 12, 15, 0.4, 0.85, rimAt);
  if (b === 31) { roll(b, 8, 15, 0.3, 0.95, rimAt); ev.push([at(b, 14), t => put(clap(0.8, b), t, { gain: 2.2, pan: 0.05, group: 'drums', rev: 0.4, label: 'clap' })]); }
  // ---- hats on the off-beats (open at the end of the phrases), the shaker: on the beats in A, in sixteenths in B and the build
  if (!brk) for (const [s, v] of [[2, 0.5], [6, 0.55], [10, 0.5], [14, 0.6]]) {
    const open = s === 14 && (b === 7 || b === 23 || b === 15);
    ev.push([at(b, s) + jit(2, s), t => put(hat(open ? v * 0.8 : v, open, b * 16 + s), t, { gain: 1.5, pan: 0.3, group: 'drums', rev: 0.08, label: 'hat' })]);
  }
  else {
    ev.push([at(b, 8), t => put(hat(0.35, false, b * 16 + 8), t, { gain: 1.5, pan: 0.3, group: 'drums', rev: 0.1, label: 'hat' })]);
    ev.push([at(b, 0), t => put(tock(1), t, { gain: TICK_GAIN, pan: -0.1, group: 'drums', rev: 0.08, label: 'tick' })]);
  }
  const SHK = [];
  if (inA) for (const s of [0, 4, 8, 12]) SHK.push([s, 0.42]);
  else if (inB) for (const s of [0, 2, 4, 6, 7, 8, 10, 12, 14, 15]) SHK.push([s, s % 4 === 0 ? 0.55 : s % 4 === 2 ? 0.42 : 0.24]);
  else if (bld) for (let s = 0; s < 16; s++) SHK.push([s, (s % 4 === 0 ? 0.5 : s % 2 ? 0.28 : 0.4) * (0.7 + 0.1 * (b - 28))]);
  else if (b === 27) for (let s = 8; s < 16; s++) SHK.push([s, 0.2 + 0.07 * (s - 8)]);
  else SHK.push([0, 0.35], [8, 0.3]);
  for (const [s, v] of SHK) ev.push([at(b, s) + jit(2, s), t => put(shaker(v, b * 16 + s), t, { gain: 1.4, pan: 0.42, group: 'drums', rev: 0.06, label: 'shaker' })]);
  // ---- soft congas, only in the second half of B
  if (B2) for (const [s, f0, k, v] of [[6, 196, 'open', 0.55], [11, 294, 'tap', 0.45], [14, 294, 'open', 0.5]]) ev.push([at(b, s) + jit(3, s), t => put(conga(f0, k, v, b * 7 + s), t, { gain: 1.0, pan: 0.3, group: 'drums', rev: 0.14, label: 'conga' })]);
  // ---- bass: round, with room around it; a held note in the break, an eighth-note pulse before the loop
  const r = ch.root;
  const LINE = brk ? [[0, 0, b === 27 ? 10 : 14, 0.9]]
    : b === 30 ? Array.from({ length: 8 }, (_, i) => [i * 2, 0, 1, i % 2 ? 0.7 : 1])
      : b === 31 ? Array.from({ length: 6 }, (_, i) => [i * 2, 0, 1, i % 2 ? 0.7 : 1])
        : inB && b >= 12 ? BASS_B : BASS_A;
  for (const [s, iv, len, v] of LINE) ev.push([at(b, s), t => put(bass(r + iv, len * STEP * 0.92, v), t, { gain: 0.27, pan: 0, group: 'pump', rev: 0.02, label: 'bass' })]);
  // ---- keys: the electric piano's chord, three times a bar (rolled a little, low to high); in the break one long roll
  const strum = (notes, t, len, vel, gain) => { notes.forEach((m, i) => put(ep(m, len, vel), t + i * 0.003, { gain, pan: -0.2 + i * 0.03, rev: 0.28, label: 'ep' })); };
  if (brk) ev.push([at(b, 0), t => { ch.ep.forEach((m, i) => put(ep(m, STEP * 12, 0.6), t + i * 0.3, { gain: 0.24, pan: -0.15 + i * 0.1, rev: 0.4, dly: 0.1, label: 'ep' })); }]);
  else if (b >= 30) for (const s of [0, 4, 8, 12]) ev.push([at(b, s), t => strum(ch.ep, t, STEP * 3, 0.55 + 0.06 * (s / 4) + (b - 30) * 0.1, 0.24)]);
  else for (const [s, len, v] of EP_A) ev.push([at(b, s) + jit(2, s), t => strum(ch.ep, t, STEP * len, v, 0.24)]);
  // ---- the kora: a flowing, alternating pattern (thinner at first); a few long strings in the break; sixteenths rising into the loop
  const koraAt = (s, i, v, t60 = 1.0, dly = 0.1) => ev.push([at(b, s) + jit(2, s), t => put(pluck(str(i), t60, v, 0.3, b * 17 + s, 0.2, 1500, 2600), t, { gain: 1.0, pan: 0.38, rev: 0.22, dly, label: 'kora' })]);
  if (inA && b >= 4) for (const [s, i, v] of KORA_S) koraAt(s, i, v * 0.9);
  else if (inB || (bld && b < 30)) for (const [s, i, v] of (b % 2 ? KORA_B : KORA_A)) koraAt(s, i, v);
  else if (brk) for (const [s, i, v] of [[0, 3, 0.6], [6, 5, 0.45], [10, 4, 0.5]]) koraAt(s, i, v, 1.6, 0.2);
  else if (b >= 30) for (let s = 0; s < 16; s++) koraAt(s, Math.floor(s / 2) % 6 + (b - 30), 0.4 + 0.035 * s + 0.1 * (b - 30), 0.7, 0.05);
  // ---- the pad: two detuned layers, one a side, every bar; fuller in the break
  const pv = inA ? 0.5 : inB ? 0.6 : brk ? 0.95 : 0.75;
  for (const [det, pan] of [[0.9965, -0.55], [1.0035, 0.55]]) ev.push([at(b, 0), t => put(pad(ch.pad, BAR, pv, det), t, { gain: 0.25, pan, rev: 0.3, group: 'pump', label: 'pad' })]);
}
// ---- the riser at the end of the break
ev.push([at(27, 0), t => put(riser(BAR - 0.06, 0.6), t, { gain: 0.28, pan: 0, rev: 0.3, label: 'riser' })]);

// ---- the lead (B): two eight-bar statements over the chords, the second higher and a little busier. [bar, step, midi, steps]
const MEL1 = [
  [0, 4, 81, 8], [0, 12, 77, 4],
  [1, 4, 76, 4], [1, 8, 77, 3], [1, 12, 81, 4],
  [2, 2, 82, 6], [2, 10, 79, 6],
  [3, 4, 77, 4], [3, 10, 74, 6],
  [4, 6, 81, 6], [4, 12, 82, 4],
  [5, 2, 79, 4], [5, 8, 84, 8],
  [6, 4, 82, 4], [6, 8, 79, 4], [6, 12, 76, 4],
  [7, 2, 73, 6], [7, 10, 76, 6],
];
const MEL2 = [
  [0, 2, 86, 6], [0, 10, 84, 3], [0, 13, 81, 3],
  [1, 4, 84, 4], [1, 8, 81, 4], [1, 12, 77, 4],
  [2, 2, 79, 4], [2, 6, 82, 4], [2, 12, 86, 4],
  [3, 4, 84, 4], [3, 8, 81, 8],
  [4, 6, 77, 2], [4, 8, 81, 4], [4, 12, 86, 4],
  [5, 2, 88, 6], [5, 10, 84, 6],
  [6, 4, 81, 4], [6, 8, 79, 4], [6, 12, 76, 4],
  [7, 0, 73, 8], [7, 8, 74, 8],
];
for (const [bar0, MEL, v] of [[8, MEL1, 0.85], [16, MEL2, 0.95]])
  ev.push([at(bar0, 0), t => put(airy(MEL.map(([b, s, m, len]) => [b * BAR + s * STEP + 0.012, m, len * STEP * 0.94]), v), t, { gain: 0.5, pan: 0.05, rev: 0.32, dly: 0.3, label: 'lead' })]);

// ------------------------------------------------------------------------------------------------ render
for (let k = 0; k < LOOPS; k++) for (const [t, fn] of ev) fn(k * L + t);
console.log(`voices: ${ev.length * LOOPS}`);
{ // what each part adds to the middle loop, in dB below the loudest part (the calibration of the mix; not a measure of loudness)
  const e = Object.entries(stat).map(([k, v]) => [k, 10 * Math.log10(v / (L * SR))]), top = Math.max(...e.map(x => x[1]));
  console.log('parts (power, dB re the loudest): ' + e.sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(v - top).toFixed(1)}`).join(', '));
}

/** Freeverb (Jezar's), stereo, a long dark room: the courtyard's walls and its stone floor. */
function freeverb(inL, inR, room = 0.62, damp = 0.45, wet = 1) {
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617], aps = [556, 441, 341, 225], spread = 23;
  const fb = room * 0.28 + 0.7, d1 = damp * 0.4, d2 = 1 - d1;
  const mk = off => ({ c: combs.map(n => ({ b: new Float32Array(n + off), i: 0, s: 0 })), a: aps.map(n => ({ b: new Float32Array(n + off), i: 0 })) });
  const ch = [mk(0), mk(spread)];
  const outL = new Float32Array(N), outR = new Float32Array(N), pre = Math.round(0.024 * SR);
  const hpL = new OnePole(220), hpR = new OnePole(220), dkL = new OnePole(5500), dkR = new OnePole(5500);        // the walls take the top off the reverb
  for (let n = 0; n < N; n++) {
    const x = [hpL.hp(n >= pre ? inL[n - pre] : 0), hpR.hp(n >= pre ? inR[n - pre] : 0)], o = [0, 0];
    for (let c = 0; c < 2; c++) {
      const input = (x[0] + x[1]) * 0.015;
      let s = 0;
      for (const cb of ch[c].c) { const y = cb.b[cb.i]; cb.s = y * d2 + cb.s * d1; cb.b[cb.i] = input + cb.s * fb; cb.i = (cb.i + 1) % cb.b.length; s += y; }
      for (const ap of ch[c].a) { const y = ap.b[ap.i]; const v = -s + y; ap.b[ap.i] = s + y * 0.5; ap.i = (ap.i + 1) % ap.b.length; s = v; }
      o[c] = s;
    }
    // a little stereo width: each side mixes a share of the other
    outL[n] = dkL.lp((o[0] * 0.85 + o[1] * 0.15) * wet); outR[n] = dkR.lp((o[1] * 0.85 + o[0] * 0.15) * wet);
  }
  return [outL, outR];
}
/** Ping-pong delay, a dotted eighth, its repeats darker. */
function pingpong(inp, time = BEAT * 0.75, fb = 0.34) {
  const D = Math.round(time * SR), bl = new Float32Array(D), br = new Float32Array(D), outL = new Float32Array(N), outR = new Float32Array(N);
  const lpL = new OnePole(2600), lpR = new OnePole(2600);
  let i = 0;
  for (let n = 0; n < N; n++) {
    const oL = bl[i], oR = br[i];
    bl[i] = inp[n] + fb * lpR.lp(oR); br[i] = fb * lpL.lp(oL);
    i = (i + 1) % D;
    outL[n] = oL; outR[n] = oR;
  }
  return [outL, outR];
}
/** RBJ biquad shelf (low or high), applied in place to both channels. */
function shelf(chans, kind, f0, gainDb, S = 0.8) {
  const A = 10 ** (gainDb / 40), w = TAU * f0 / SR, cw = Math.cos(w), sw = Math.sin(w), alpha = sw / 2 * Math.sqrt((A + 1 / A) * (1 / S - 1) + 2), sa = 2 * Math.sqrt(A) * alpha;
  let b0, b1, b2, a0, a1, a2;
  if (kind === 'low') { b0 = A * ((A + 1) - (A - 1) * cw + sa); b1 = 2 * A * ((A - 1) - (A + 1) * cw); b2 = A * ((A + 1) - (A - 1) * cw - sa); a0 = (A + 1) + (A - 1) * cw + sa; a1 = -2 * ((A - 1) + (A + 1) * cw); a2 = (A + 1) + (A - 1) * cw - sa; }
  else { b0 = A * ((A + 1) + (A - 1) * cw + sa); b1 = -2 * A * ((A - 1) + (A + 1) * cw); b2 = A * ((A + 1) + (A - 1) * cw - sa); a0 = (A + 1) - (A - 1) * cw + sa; a1 = 2 * ((A - 1) - (A + 1) * cw); a2 = (A + 1) - (A - 1) * cw - sa; }
  for (const x of chans) { let x1 = 0, x2 = 0, y1 = 0, y2 = 0; for (let n = 0; n < x.length; n++) { const x0 = x[n], y = (b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0; x2 = x1; x1 = x0; y2 = y1; y1 = y; x[n] = y; } }
}
/** Stereo-linked feed-forward compressor (soft knee). */
function compress([L0, R0], thrDb, ratio, attack, release, makeupDb = 0) {
  const aA = Math.exp(-1 / (attack * SR)), aR = Math.exp(-1 / (release * SR)), knee = 6, mk = 10 ** (makeupDb / 20);
  let env = -120, maxGr = 0;
  for (let n = 0; n < L0.length; n++) {
    const lv = db(Math.max(Math.abs(L0[n]), Math.abs(R0[n])));
    env = lv > env ? aA * env + (1 - aA) * lv : aR * env + (1 - aR) * lv;
    const over = env - thrDb;
    const gr = over <= -knee / 2 ? 0 : over >= knee / 2 ? over * (1 - 1 / ratio) : (1 - 1 / ratio) * (over + knee / 2) ** 2 / (2 * knee);
    if (gr > maxGr) maxGr = gr;
    const g = 10 ** (-gr / 20) * mk;
    L0[n] *= g; R0[n] *= g;
  }
  return maxGr;
}
/** Look-ahead limiter: the gain is the minimum needed over the next `la` seconds, smoothed in, released slowly. Never clips. */
function limit([L0, R0], ceilingDb = -1.5, la = 0.005, release = 0.09) {
  const c = 10 ** (ceilingDb / 20), W = Math.round(la * SR), n = L0.length;
  const need = new Float32Array(n);
  for (let i = 0; i < n; i++) { const p = Math.max(Math.abs(L0[i]), Math.abs(R0[i])); need[i] = p > c ? c / p : 1; }
  // sliding minimum over [i, i + W]
  const mins = new Float32Array(n), dq = new Int32Array(n); let h = 0, t = 0;
  for (let i = n - 1; i >= 0; i--) {
    while (t > h && need[dq[t - 1]] >= need[i]) t--;
    dq[t++] = i;
    while (dq[h] > i + W) h++;
    mins[i] = need[dq[h]];
  }
  const aR = Math.exp(-1 / (release * SR));
  let acc = 0, g = 1, maxGr = 0;
  const box = new Float32Array(W);
  for (let i = 0; i < n; i++) {
    acc += mins[i] - box[i % W]; box[i % W] = mins[i];
    const sm = Math.min(acc / W, mins[i]);
    g = sm < g ? sm : aR * g + (1 - aR) * sm;
    L0[i] *= g; R0[i] *= g;
    if (i > L * SR && i < 2 * L * SR) maxGr = Math.max(maxGr, -db(g));
  }
  return maxGr;
}

const drumGr = compress(bus.drums, -16, 1.8, 0.01, 0.14, 0.5);
// the pump: the bass and the pad give way to every kick by a few dB, and swell back over a sixth of a second
const duck = new Float32Array(N);
{ const hits = new Uint8Array(N); for (const k of kicks) if (k < N) hits[k] = 1; const aR = Math.exp(-1 / (0.17 * SR)), aA = 1 - Math.exp(-1 / (0.004 * SR)); let e = 0, s = 0;
  for (let n = 0; n < N; n++) { e = Math.max(e * aR, hits[n]); s += (e - s) * aA; duck[n] = s; } }
const DUCK = 0.38;
for (let c = 0; c < 2; c++) for (let n = 0; n < N; n++) bus.pump[c][n] *= 1 - DUCK * duck[n];
const [rvL, rvR] = freeverb(bus.rev[0], bus.rev[1], 0.72, 0.62, 1);
const [dlL, dlR] = pingpong(bus.dly);
const Mraw = [new Float32Array(N), new Float32Array(N)];
const hp = [new OnePole(28), new OnePole(28)];
for (let n = 0; n < N; n++) {
  Mraw[0][n] = hp[0].hp(bus.drums[0][n] + bus.music[0][n] + bus.pump[0][n] + rvL[n] * 0.9 + dlL[n] * 0.5);
  Mraw[1][n] = hp[1].hp(bus.drums[1][n] + bus.music[1][n] + bus.pump[1][n] + rvR[n] * 0.9 + dlR[n] * 0.5);
}
shelf(Mraw, 'low', 90, -1.5); shelf(Mraw, 'high', 4500, -1);
// level into the master chain: the middle loop's peak at a fixed reference before the closed loop below sets the gain
let pk = 0; for (let n = Math.round(L * SR); n < Math.round(2 * L * SR); n++) pk = Math.max(pk, Math.abs(Mraw[0][n]), Math.abs(Mraw[1][n]));
const NORM = 10 ** (-6 / 20) / pk;

{ // before encoding: the rendered loop against the next one (the effects' and the tails' state at the seam)
  const a0 = Math.round(L * SR), a1 = Math.round(2 * L * SR), nb = Math.round(BAR * SR); let e = 0, p = 0;
  for (let i = 0; i < nb; i++) { e += (Mraw[0][a1 + i] - Mraw[0][a0 + i]) ** 2; p += Mraw[0][a0 + i] ** 2; }
  console.log(`seam before the master chain: ${(10 * Math.log10(e / p)).toFixed(1)} dB`);
}

// ------------------------------------------------------------------------------------------------ the file: marker, the last bar, the loop, the first bar
const MARK = 0.25, LEAD = 0.5;                  // the tick at 0.25 s; the music from 0.5 s
const s0 = Math.round((L - BAR) * SR), s1 = Math.round((2 * L + BAR) * SR);
const lead0 = Math.round(LEAD * SR), total = lead0 + (s1 - s0);

function wav(file, chans, sr = SR) {
  const n = chans[0].length, buf = Buffer.alloc(44 + n * 4), R = mulberry(11);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVE', 8); buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) for (let c = 0; c < 2; c++) { const d = (R() - R()) / 32768; buf.writeInt16LE(clamp(Math.round((chans[c][i] + d) * 32767), -32768, 32767), 44 + i * 4 + c * 2); }
  fs.writeFileSync(file, buf);
}
const tmp = path.join(os.tmpdir(), `patio-render-${process.pid}`);        // (one folder per run, so two runs can go side by side)
fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true });
fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true });

/** The master chain at a trial gain and ceiling, the file's frame (tick, bars, fades), its WAV and MP3, and what the encoded MP3 measures. */
function master(preDb, ceilDb) {
  const M = [Float32Array.from(Mraw[0]), Float32Array.from(Mraw[1])], g = NORM * 10 ** (preDb / 20);
  for (let n = 0; n < N; n++) { M[0][n] *= g; M[1][n] *= g; }
  const busGr = compress(M, -20, 2.0, 0.015, 0.2, 0);
  const limGr = limit(M, ceilDb, 0.006, 0.12);
  const out = [new Float32Array(total), new Float32Array(total)];
  for (let i = 0; i < Math.round(0.002 * SR); i++) { const w = Math.sin(Math.PI * i / Math.round(0.002 * SR)) ** 2, v = 0.5 * w * Math.sin(TAU * 2500 * i / SR); out[0][Math.round(MARK * SR) + i] = v; out[1][Math.round(MARK * SR) + i] = v; }
  for (let i = 0; i < s1 - s0; i++) { out[0][lead0 + i] = M[0][s0 + i]; out[1][lead0 + i] = M[1][s0 + i]; }
  // a few ms of fade at the file's very start of the music and end (never heard in the game: the loop is inside)
  for (let i = 0; i < 64; i++) { const gg = i / 64; out[0][lead0 + i] *= gg; out[1][lead0 + i] *= gg; out[0][total - 1 - i] *= gg; out[1][total - 1 - i] *= gg; }
  wav(`${tmp}/patio.wav`, out);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', `${tmp}/patio.wav`, '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:a', '+bitexact', '-c:a', 'libmp3lame', '-b:a', `${KBPS}k`, '-joint_stereo', '1', OUT]);
  const e = spawnSync('ffmpeg', ['-nostats', '-i', OUT, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' }).stderr.split('Summary:').pop();
  const lufs = Number(/I:\s+(-?[\d.]+) LUFS/.exec(e)?.[1]), tp = Number(/Peak:\s+(-?[\d.]+) dBFS/.exec(e)?.[1]);
  return { M, out, busGr, limGr, lufs, tp };
}
// the closed loop: the gain into the compressor and limiter, and the limiter's ceiling, until the ENCODED file measures the target loudness under the true-peak limit
let pre = 10, ceil = -3.5, res = null, prev = null, slope = 0.75;
for (let it = 0; it < 8; it++) {
  res = master(pre, ceil);
  const eL = TARGET_LUFS - res.lufs, eT = TP_MAX - res.tp;
  console.log(`master ${it}: pre ${pre.toFixed(2)} dB, ceiling ${ceil.toFixed(2)} dBFS → ${res.lufs} LUFS, true peak ${res.tp} dBFS, master GR ≤ ${res.busGr.toFixed(1)} dB, limiter ≤ ${res.limGr.toFixed(1)} dB`);
  if (Math.abs(eL) <= 0.12 && eT >= 0) break;
  if (prev && Math.abs(pre - prev.pre) > 0.05 && prev.ceil === ceil) slope = clamp((res.lufs - prev.lufs) / (pre - prev.pre), 0.3, 1);   // how much louder one dB more drive makes the file
  prev = { pre, lufs: res.lufs, ceil };
  if (eT < 0) ceil += eT - 0.1;
  pre += eL / slope;
}
const { M, out } = res;
if (flags.wav) fs.copyFileSync(`${tmp}/patio.wav`, flags.wav);        // the file's frame before the MP3 (for the checks)
console.log(`mix: drum bus GR ≤ ${drumGr.toFixed(1)} dB`);
if (flags.listen) {
  // for listening: two loops back to back, no tick (the seam in the middle is the game's)
  const two = [new Float32Array(2 * Math.round(L * SR)), new Float32Array(2 * Math.round(L * SR))];
  for (let i = 0; i < two[0].length; i++) { const j = Math.round(L * SR) + (i % Math.round(L * SR)); two[0][i] = M[0][j]; two[1][i] = M[1][j]; }
  wav(`${tmp}/listen.wav`, two);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', `${tmp}/listen.wav`, '-c:a', 'libmp3lame', '-b:a', '128k', flags.listen]);
}

// ------------------------------------------------------------------------------------------------ check what the encoded file holds: the tick, then the downbeats on the grid
const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', OUT, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
const x = new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + (raw.byteLength & ~3)));
let tick = -1; for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) > 0.12) { tick = i; break; }
// the tick's first loud sample in our own render (the burst rises over a few samples)
let tickOwn = -1; for (let i = 0; i < out[0].length; i++) if (Math.abs(out[0][i]) > 0.12) { tickOwn = i; break; }
const offset = tick - tickOwn;                                   // the decoder's delay, in samples
// each downbeat's attack (the kick's click and the hat both start on it): the steepest rise of the high band's energy near the expected time
const hiE = new Float32Array(x.length); { const hp1 = new OnePole(1000); let acc = 0; const w = Math.round(0.001 * SR), sq = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) { const v = hp1.hp(x[i]); sq[i] = v * v; acc += sq[i] - (i >= w ? sq[i - w] : 0); hiE[i] = acc / w; } }
const errs = [];
for (let b = 0; b < BARS; b++) {
  const exp = offset + lead0 + Math.round((BAR + b * BAR) * SR), w = Math.round(0.001 * SR);
  let best = -Infinity, on = exp;
  const i0 = exp - Math.round(0.012 * SR), i1 = exp + Math.round(0.02 * SR);
  for (let i = i0; i < i1; i++) best = Math.max(best, hiE[i] - hiE[i - w]);
  for (let i = i0; i < i1; i++) if (hiE[i] - hiE[i - w] > best * 0.35) { on = i; break; }     // the first strong attack
  errs.push((on - w / 2 - exp) / SR * 1000);
}
const maxErr = Math.max(...errs.map(Math.abs)), meanErr = errs.reduce((a, b) => a + b, 0) / errs.length;
// the seam: the bar after the loop is the loop's first bar again, the bar before it the loop's last; how far apart they are in the decoded file (dB under the music)
const ls = offset + lead0 + Math.round(BAR * SR), le = ls + Math.round(L * SR), nB = Math.round(BAR * SR);
let e1 = 0, p1 = 0, e2 = 0, p2 = 0;
for (let i = 0; i < nB; i++) { e1 += (x[le + i] - x[ls + i]) ** 2; p1 += x[ls + i] ** 2; e2 += (x[ls - 1 - i] - x[le - 1 - i]) ** 2; p2 += x[le - 1 - i] ** 2; }
const seamDb = +(10 * Math.log10(Math.max(e1 / p1, e2 / p2))).toFixed(1);
const lufs = res.lufs, tp = res.tp;
const bytes = fs.statSync(OUT).size;
console.log(`file: ${OUT} ${(bytes / 1024).toFixed(0)} KB, ${(total / SR).toFixed(2)} s; decoder delay in ffmpeg ${offset} samples; downbeats vs the grid: mean ${meanErr.toFixed(2)} ms, max ${maxErr.toFixed(2)} ms; loudness ${lufs} LUFS, true peak ${tp} dBFS; seam: the bars on either side differ from the loop's own by ${seamDb} dB`);

// ------------------------------------------------------------------------------------------------ the beat map (TypeScript)
const sections = [{ id: 'A', from: 0, to: 8 }, { id: 'B', from: 8, to: 24 }, { id: 'break', from: 24, to: 28 }, { id: 'build', from: 28, to: 32 }];
const ts = `// Generated by scripts/audio/render-patio.mjs — do not edit by hand (run the script again: it writes the music and this map together).
/**
 * Le Patio's music (public/${GAME_FILE}): an original warm, low-key lounge / afro-house groove synthesised offline (a soft kick, shaker and hats, rim and clap,
 * a round bass, an FM electric piano, a kora-like pluck pattern, a pad, soft congas and a sparse high lead on the B section). ${BPM} bpm, ${BARS} bars of 4/4: a ${L} s seamless loop.
 * Every note was placed on this grid, so a beat k of the loop is at exactly k × 60 / bpm seconds after \`loopStart\` (in the file, before the decoder's
 * own delay — the game finds that delay from the sync tick at \`tick\`). Downbeats measured again in the encoded file: \`measured\`.
 */
export const PATIO_TRACK = {
  file: '${GAME_FILE}',
  bpm: ${BPM},
  beatsPerBar: 4,
  bars: ${BARS},
  /** Length of the loop (s). */
  loop: ${L},
  /** Where the sync tick starts in the file (s) — a 2 ms burst after silence: its first sample above 0.12 is at \`tickSample\` / sampleRate. */
  tick: ${MARK},
  tickSample: ${tickOwn},
  sampleRate: ${SR},
  /** Where the loop starts in the file (s), counted like \`tick\` (one bar of music before it: the seam lands in steady audio). */
  loopStart: ${+(LEAD + BAR).toFixed(6)},
  /** The song's parts, in bars of the loop. */
  sections: ${JSON.stringify(sections)} as readonly { id: 'A' | 'B' | 'break' | 'build'; from: number; to: number }[],
  /** Bars that end with a drum fill (the last beat rolls into the next bar). */
  fills: ${JSON.stringify(FILLS)} as readonly number[],
  /** Chords, one per bar. */
  chords: ${JSON.stringify(PROG)} as readonly string[],
  /** The downbeats as heard in the encoded file (decoded by ffmpeg, its delay found from the tick): ms from the grid, bar by bar. */
  measured: { maxErrorMs: ${maxErr.toFixed(2)}, meanErrorMs: ${meanErr.toFixed(2)}, downbeatsMs: ${JSON.stringify(errs.map(e => +e.toFixed(2)))} as readonly number[] },
  /** Loudness of the file (EBU R128) and its size. */
  lufs: ${lufs}, truePeakDb: ${tp}, bytes: ${bytes},
  /** The bars on either side of the loop against the loop's own first and last bar, in the decoded file (dB under the music: the seam is seamless). */
  seamDiffDb: ${seamDb},
} as const;
`;
fs.writeFileSync(MAP, ts);
console.log(`beat map: ${MAP}`);
fs.rmSync(tmp, { recursive: true, force: true });
