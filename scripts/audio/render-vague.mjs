// La Vague's music (src/venues/vagueMusic.ts): an original mbalax / afro-pop flavoured groove, synthesised offline here — no samples, no downloads.
// Sabar-like drums (a bass drum, two hand-and-stick drums, a tama talking drum with its pitch bends), a kick, shaker and claps, an electric bass,
// an FM electric piano on the off-beats, two plucked guitars (Karplus-Strong) in the picked « sebene » style, a keyboard lead melody, a horn section and a pad,
// mixed with panning, a small plate-like reverb, a ping-pong delay on the lead, bus compression and a look-ahead limiter. 120 bpm, 24 bars = a 48 s seamless loop.
//
// The file the game plays:  [0.25 s silence][sync tick][…silence to 0.5 s][the loop's last bar][the 24-bar loop][the loop's first bar]
//   – the tick lets the game find where the decoder put the start (MP3 decoders add a different delay), so the loop points and the beat map are exact;
//   – one bar on either side of the loop is real, continuous music: the loop points land in the middle of steady audio, the seam is seamless.
// The beat map (src/venues/vagueTrack.ts) is written by this same script from the same grid the notes were placed on, and the downbeats are measured again
// in the encoded MP3 (decoded by ffmpeg) to prove that the dance timing matches what is heard.
//
// Usage: node scripts/audio/render-vague.mjs [outMp3=public/assets/audio/music/la-vague.mp3] [beatmapTs=src/venues/vagueTrack.ts] [--listen=/path/listen.mp3]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const flags = Object.fromEntries(process.argv.slice(2).filter(a => a.startsWith('--')).map(a => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));
const OUT = args[0] ?? 'public/assets/audio/music/la-vague.mp3';
const MAP = args[1] ?? 'src/venues/vagueTrack.ts';
const SR = 44100;
const BPM = 120, BEAT = 60 / BPM, STEP = BEAT / 4, BAR = BEAT * 4;
const BARS = 24, L = BARS * BAR;                 // 48 s
const LOOPS = 3;                                 // rendered three times: the middle one is steady (its tails and the effects' state come from the one before)
const TAIL = 4;
const N = Math.ceil((LOOPS * L + TAIL) * SR);
const TAU = Math.PI * 2;

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
  rev: [new Float32Array(N), new Float32Array(N)],
  dly: new Float32Array(N),
};
/** Adds a mono voice at `t` (s) with a gain, an equal-power pan (−1 … 1) and effect sends. */
function put(voice, t, { gain = 1, pan = 0, rev = 0, dly = 0, group = 'music' } = {}) {
  const s0 = Math.round(t * SR), a = (clamp(pan, -1, 1) + 1) * Math.PI / 4, gl = Math.cos(a) * gain, gr = Math.sin(a) * gain;
  const [bl, br] = bus[group], [rl, rr] = bus.rev;
  for (let i = 0; i < voice.length; i++) {
    const n = s0 + i; if (n < 0 || n >= N) continue;
    const v = voice[i];
    bl[n] += v * gl; br[n] += v * gr;
    if (rev) { rl[n] += v * gl * rev; rr[n] += v * gr * rev; }
    if (dly) bus.dly[n] += v * gain * dly;
  }
}

// ------------------------------------------------------------------------------------------------ instruments
/** Each voice's noise comes from its own seed (its bar and step): the three rendered loops are sample for sample the same, so the seam is exact. */
const noiseOf = seed => { const r = mulberry(seed * 7919 + 13); return () => r() * 2 - 1; };

function kick(vel, seed = 1) {
  const noise = noiseOf(seed), n = Math.round(0.42 * SR), out = new Float32Array(n), hp = new OnePole(1800);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, f = 47 + 125 * Math.exp(-t / 0.026) + 18 * Math.exp(-t / 0.11);
    ph += TAU * f / SR;
    const body = Math.sin(ph) * (1 - Math.exp(-t / 0.0012)) * Math.exp(-t / 0.29);
    const click = t < 0.005 ? hp.hp(noise()) * (1 - t / 0.005) * 0.45 : 0;
    out[i] = Math.tanh(1.7 * (body + click)) / Math.tanh(1.7) * vel;
  }
  return out;
}

const MODES = [1, 1.594, 2.136, 2.296, 2.653, 2.918, 3.156, 3.501];
/** A goatskin drum hit by the hand or the stick (modal synthesis): `open` rings, `slap` cracks, `tap` is muffled, `stick` is the galan's crack. */
function drum(f0, kind, vel, seed = 1) {
  const R = mulberry(seed), noise = noiseOf(seed + 101);
  const spec = {
    open: { amps: [1, 0.55, 0.36, 0.3, 0.2, 0.14, 0.1, 0.07], dec: [0.26, 0.17, 0.12, 0.1, 0.08, 0.07, 0.06, 0.05], nz: 0.25, nzf: 1600, nzd: 0.012, drop: 0.07, len: 0.45 },
    slap: { amps: [0.45, 0.55, 0.55, 0.5, 0.45, 0.4, 0.35, 0.3], dec: [0.09, 0.06, 0.05, 0.045, 0.04, 0.035, 0.03, 0.028], nz: 0.95, nzf: 2900, nzd: 0.022, drop: 0.04, len: 0.22 },
    tap: { amps: [0.9, 0.35, 0.2, 0.12, 0.08, 0.05, 0.03, 0.02], dec: [0.05, 0.035, 0.025, 0.02, 0.018, 0.015, 0.012, 0.01], nz: 0.18, nzf: 1200, nzd: 0.008, drop: 0.02, len: 0.12 },
    stick: { amps: [0.3, 0.45, 0.5, 0.55, 0.5, 0.45, 0.4, 0.38], dec: [0.07, 0.05, 0.04, 0.035, 0.03, 0.028, 0.025, 0.022], nz: 1.1, nzf: 4200, nzd: 0.016, drop: 0.03, len: 0.18 },
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
    out[i] = (s * 0.42 + nz) * (1 - Math.exp(-t / 0.0006)) * vel;
  }
  return out;
}

/** The tama (talking drum): a tuned tone whose pitch the player bends by squeezing the cords — from `f0` toward `f1`. */
function tama(f0, f1, vel, glide = 0.06, seed = 3) {
  const R = mulberry(seed), noise = noiseOf(seed + 202), n = Math.round(0.38 * SR), out = new Float32Array(n), bp = new SVF();
  const parts = [[1, 1, 0.24], [2.01, 0.42, 0.13], [2.98, 0.2, 0.08], [4.07, 0.08, 0.05]];
  const ph = parts.map(() => R());
  for (let i = 0; i < n; i++) {
    const t = i / SR, f = f1 + (f0 - f1) * Math.exp(-t / glide);
    let s = 0;
    for (let k = 0; k < parts.length; k++) { ph[k] += TAU * f * parts[k][0] / SR; s += parts[k][1] * Math.exp(-t / parts[k][2]) * Math.sin(ph[k]); }
    const nz = bp.run(noise(), 3200, 1.2, 'bp') * 0.6 * Math.exp(-t / 0.008);
    out[i] = (s * 0.5 + nz) * (1 - Math.exp(-t / 0.0008)) * vel;
  }
  return out;
}

function shaker(vel, long = false, seed = 1) {
  const noise = noiseOf(seed + 303), n = Math.round((long ? 0.12 : 0.08) * SR), out = new Float32Array(n), bp = new SVF(), hp = new OnePole(3500);
  for (let i = 0; i < n; i++) {
    const t = i / SR, env = (1 - Math.exp(-t / 0.006)) * Math.exp(-t / (long ? 0.05 : 0.032));
    out[i] = bp.run(hp.hp(noise()), 7600, 1.1, 'bp') * env * vel * 1.6;
  }
  return out;
}

function clap(vel, seed = 1) {
  const noise = noiseOf(seed + 404), n = Math.round(0.28 * SR), out = new Float32Array(n), bp = new SVF(), hp = new OnePole(700);
  const bursts = [0, 0.009, 0.017, 0.026];
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let env = 0;
    for (const b of bursts) if (t >= b) env = Math.max(env, Math.exp(-(t - b) / 0.007));
    env = Math.max(env, t > 0.026 ? 0.55 * Math.exp(-(t - 0.026) / 0.085) : 0);
    out[i] = bp.run(hp.hp(noise()), 1350, 1.0, 'bp') * env * vel * 1.4;
  }
  return out;
}

/** Electric bass: a round fundamental and a filtered saw, plucked. */
function bass(midi, dur, vel) {
  const f = mtof(midi), rel = 0.05, n = Math.round((dur + rel) * SR), out = new Float32Array(n), lp = new SVF();
  let ph = 0, ps = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    ph += TAU * f / SR; ps = (ps + f / SR) % 1;
    const saw = 2 * ps - 1 - polyblep(ps, f / SR);
    const osc = 0.7 * Math.sin(ph) + 0.45 * saw;
    const cut = 180 + f * 1.6 + 1500 * vel * Math.exp(-t / 0.06);
    let env = (1 - Math.exp(-t / 0.003)) * (0.62 + 0.38 * Math.exp(-t / 0.18));
    if (t > dur) env *= Math.exp(-(t - dur) / (rel / 3));
    out[i] = Math.tanh(1.4 * lp.run(osc, cut, 0.85) * env) * vel;
  }
  return out;
}

/** FM electric piano (a tine and its bell). */
function ep(midi, dur, vel) {
  const f = mtof(midi), rel = 0.14, n = Math.round((dur + rel + 0.05) * SR), out = new Float32Array(n);
  let pc = 0, pm = 0, pt = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    pm += TAU * f / SR; pc += TAU * f / SR; pt += TAU * f * 13.9 / SR;
    const I = 2.0 * vel * Math.exp(-t / 0.16) + 0.22;
    let env = (1 - Math.exp(-t / 0.002)) * Math.exp(-t / 0.95);
    if (t > dur) env *= Math.exp(-(t - dur) / (rel / 3));
    out[i] = (Math.sin(pc + I * Math.sin(pm)) + 0.1 * vel * Math.exp(-t / 0.022) * Math.sin(pt)) * env * vel;
  }
  return out;
}

/** A plucked string (Karplus-Strong with a fractional delay): `t60` how long it rings, `bright` 0–1, `pick` the position along the string. */
function pluck(midi, t60, vel, bright = 0.6, seed = 5, pick = 0.17) {
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
  const body = new SVF(), hp = new OnePole(120);
  for (let i = 0; i < n; i++) {
    const r0 = (w - di + len * 4) % len, r1 = (r0 - 1 + len) % len;
    const y = buf[r0] * (1 - fr) + buf[r1] * fr;
    const v = rho * (0.5 * y + 0.5 * last); last = y;
    buf[w] = v; w = (w + 1) % len;
    const s = hp.hp(y);
    out[i] = (s + 0.35 * body.run(s, 2400, 1.4, 'bp')) * vel * (1 - Math.exp(-i / SR / 0.0008));
  }
  return out;
}

/** A keyboard lead line (monophonic, legato glides, vibrato): notes [t, midi, dur] in seconds from the phrase start. */
function lead(notes, vel = 1) {
  const end = notes.reduce((m, [t, , d]) => Math.max(m, t + d), 0) + 0.4;
  const n = Math.round(end * SR), out = new Float32Array(n), lp = new SVF();
  let p1 = 0, p2 = 0, f = mtof(notes[0][1]), env = 0, k = 0, tn = 0, gate = false;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    while (k < notes.length && t >= notes[k][0]) { const legato = gate && Math.abs(t - (notes[k - 1][0] + notes[k - 1][2])) < 0.02; tn = legato ? tn : 0; if (!legato) f = mtof(notes[k][1]); k++; gate = true; }
    const cur = notes[Math.max(0, k - 1)];
    if (t > cur[0] + cur[2]) gate = false;
    const target = mtof(cur[1]);
    f += (target - f) * (1 - Math.exp(-1 / (SR * 0.035)));
    tn += 1 / SR;
    const vib = 1 + 0.011 * (1 - Math.exp(-Math.max(0, tn - 0.16) / 0.25)) * Math.sin(TAU * 5.4 * t);
    const fv = f * vib, d1 = fv * 1.0035 / SR, d2 = fv * 0.9965 / SR;
    p1 = (p1 + d1) % 1; p2 = (p2 + d2) % 1;
    const saw = 2 * p1 - 1 - polyblep(p1, d1);
    const sq = (p2 < 0.5 ? 1 : -1) + polyblep(p2, d2) - polyblep((p2 + 0.5) % 1, d2);
    env += ((gate ? 1 : 0) - env) * (1 - Math.exp(-1 / (SR * (gate ? 0.01 : 0.07))));
    const cut = Math.min(7000, 900 + fv * 2.6 + 2200 * Math.exp(-tn / 0.18));
    out[i] = lp.run(0.55 * saw + 0.4 * sq, cut, 1.05) * env * vel * 0.8;
  }
  return out;
}

/** The horn section: three detuned saws per note, a brassy filter swell. */
function brass(midi, dur, vel) {
  const f = mtof(midi), rel = 0.12, n = Math.round((dur + rel) * SR), out = new Float32Array(n), lp = new SVF();
  const det = [0.995, 1, 1.0052], ph = [0.1, 0.4, 0.7];
  for (let i = 0; i < n; i++) {
    const t = i / SR, scoop = 1 - 0.025 * Math.exp(-t / 0.03);
    let s = 0;
    for (let k = 0; k < 3; k++) { const dt = f * det[k] * scoop / SR; ph[k] = (ph[k] + dt) % 1; s += 2 * ph[k] - 1 - polyblep(ph[k], dt); }
    const cut = 500 + 2600 * (1 - Math.exp(-t / 0.035)) * (0.6 + 0.4 * Math.exp(-t / 0.15)) * vel;
    let env = 1 - Math.exp(-t / 0.018);
    if (t > dur) env *= Math.exp(-(t - dur) / (rel / 3));
    out[i] = lp.run(s / 3, cut, 0.8) * env * vel;
  }
  return out;
}

function pad(midis, dur, vel) {
  const rel = 0.7, n = Math.round((dur + rel) * SR), out = new Float32Array(n), lp = new SVF();
  const vs = midis.flatMap(m => [[mtof(m) * 0.996, 0.2], [mtof(m) * 1.004, 0.6]]);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let s = 0;
    for (const v of vs) { const dt = v[0] / SR; v[1] = (v[1] + dt) % 1; s += 2 * v[1] - 1 - polyblep(v[1], dt); }
    let env = 1 - Math.exp(-t / 0.35);
    if (t > dur) env *= Math.exp(-(t - dur) / (rel / 3));
    out[i] = lp.run(s / vs.length, 1100 + 300 * Math.sin(TAU * 0.25 * t), 0.7) * env * vel;
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ the song (one loop, in steps from its start)
// G major. The vamp: | G | C | D | C | (I – IV – V – IV), the break: | Em | Em | C | D |, the build: | G | C | D | D |.
const CH = { G: { root: 43, tones: [55, 59, 62, 67], gtr: [67, 71, 74, 79, 83] }, C: { root: 48, tones: [55, 60, 64, 67], gtr: [67, 72, 76, 79, 84] },
  D: { root: 50, tones: [57, 62, 66, 69], gtr: [69, 74, 78, 81, 86] }, Em: { root: 40, tones: [55, 59, 64, 67], gtr: [67, 71, 76, 79, 83] } };
const PROG = [...'GCDC GCDC GCDC GCDC'.split(' ').join('').split(''), 'Em', 'Em', 'C', 'D', 'G', 'C', 'D', 'D'];
const SECTION = b => (b < 8 ? 'A' : b < 16 ? 'B' : b < 20 ? 'break' : 'build');
const FILLS = [7, 15, 19, 23];
const ev = [];      // [timeInLoop (s), fn(t) => void]
/** The tama's pitches land on the G major pentatonic (it bends between them). */
const PENTA = [196, 220, 247, 294, 330, 392, 440, 494];
const inKey = f => PENTA.reduce((a, c) => (Math.abs(Math.log(c / f)) < Math.abs(Math.log(a / f)) ? c : a));
const at = (bar, step) => bar * BAR + step * STEP;
const hum = mulberry(99);
/** A few ms of human timing off the beat; the beats themselves stay on the grid (what the dancers tap to). */
const jit = (ms = 3, s = 1) => { const j = (hum() - 0.5) * 2 * ms / 1000; return s % 4 === 0 ? 0 : j; };

for (let b = 0; b < BARS; b++) {
  const sec = SECTION(b), ch = CH[PROG[b]], fill = FILLS.includes(b), brk = sec === 'break';
  const next = CH[PROG[(b + 1) % BARS]];
  // ---- kick: beats 1 and 3, a syncopated ghost (the mbalax push); in the break only the one
  const kicks = brk ? [[0, 1]] : [[0, 1], [6, 0.5], [8, 0.92], [11, 0.42]];
  if (b === 23) kicks.push([14, 0.7], [15, 0.8]);
  for (const [s, v] of kicks) ev.push([at(b, s), t => put(kick(v, b * 16 + s), t, { gain: 0.66, group: 'drums', rev: 0.03 })]);
  // ---- mbëng-mbëng (the sabar's bass drum): interlocking open tones
  for (const [s, v] of brk ? [[0, 0.9], [3, 0.7], [8, 0.8], [11, 0.7], [14, 0.6]] : [[3, 0.8], [7, 0.55], [11, 0.75], [14, 0.6]])
    ev.push([at(b, s) + jit(3, s), t => put(drum(98, 'open', v, b * 16 + s), t, { gain: 0.5, pan: -0.15, group: 'drums', rev: 0.08 })]);
  // ---- nder (the lead sabar): stick slaps, palm tones and muffled taps, sixteen to the bar; rolls on the fills and in the break
  const NDER = brk && b < 19 ? ['S', 't', 'S', 'S', 't', 'S', 'O', 't', 'S', 't', 'S', 'S', 'O', 't', 'S', 'O']
    : ['S', '.', 't', 'S', '.', 't', 'O', '.', 'S', '.', 't', 'S', 't', 'O', '.', 't'];
  NDER.forEach((k, s) => {
    if (k === '.') return;
    if (fill && s >= 12) return;
    const acc = s % 4 === 0 ? 1 : s % 2 === 0 ? 0.8 : 0.62;
    const kind = k === 'S' ? 'stick' : k === 'O' ? 'open' : 'tap';
    ev.push([at(b, s) + jit(4, s), t => put(drum(kind === 'open' ? 330 : 392, kind, acc * (kind === 'tap' ? 0.7 : 0.85), b * 31 + s), t, { gain: 0.5, pan: 0.28, group: 'drums', rev: 0.1 })]);
  });
  // ---- tungune (the small sabar): off-beat answers
  if (!brk || b === 19) for (const [s, k, v] of [[2, 'open', 0.7], [5, 'slap', 0.7], [10, 'open', 0.7], [13, 'slap', 0.75], [15, 'tap', 0.5]])
    ev.push([at(b, s) + jit(4, s), t => put(drum(247, k, v, b * 7 + s), t, { gain: 0.44, pan: -0.32, group: 'drums', rev: 0.1 })]);
  // ---- the fills: a stick roll in thirty-seconds, rising
  if (fill) for (let k = 0; k < 8; k++) {
    const v = 0.55 + k * 0.06;
    ev.push([at(b, 12) + k * STEP / 2 + jit(2), t => put(drum(330 + k * 8, k % 2 ? 'slap' : 'stick', v, 500 + b * 9 + k), t, { gain: 0.52, pan: k % 2 ? 0.25 : -0.2, group: 'drums', rev: 0.12 })]);
  }
  // ---- the tama: a few calls in the groove; the solo in the break (pitch bends up and down)
  const TAMA = brk ? [
    [[0, 230, 420, 1], [3, 300, 260, 0.7], [4, 260, 380, 0.8], [6, 420, 300, 0.75], [8, 230, 420, 0.9], [10, 380, 380, 0.6], [11, 380, 300, 0.7], [12, 260, 440, 0.9], [14, 440, 330, 0.7]],
    [[0, 330, 330, 0.8], [2, 260, 400, 0.85], [4, 400, 260, 0.7], [7, 230, 420, 0.9], [8, 300, 300, 0.6], [9, 300, 300, 0.5], [10, 260, 440, 0.9], [12, 440, 300, 0.75], [13, 300, 260, 0.6], [14, 230, 230, 0.8]],
    [[0, 230, 420, 1], [2, 420, 420, 0.6], [3, 420, 300, 0.7], [6, 260, 400, 0.85], [8, 230, 420, 0.95], [10, 380, 260, 0.7], [12, 260, 440, 0.9], [13, 440, 440, 0.6], [14, 440, 260, 0.75], [15, 300, 300, 0.6]],
    [[0, 230, 420, 1], [1, 300, 300, 0.5], [2, 300, 380, 0.6], [3, 380, 300, 0.6], [4, 260, 420, 0.8], [5, 300, 300, 0.55], [6, 300, 400, 0.65], [7, 400, 300, 0.65], [8, 260, 440, 0.9], [9, 330, 330, 0.6], [10, 330, 420, 0.7], [11, 420, 330, 0.7], [12, 260, 460, 1], [13, 460, 460, 0.7], [14, 460, 330, 0.8], [15, 330, 460, 0.9]],
  ][b - 16] : sec === 'B' || sec === 'build' ? [[7, 260, 400, 0.6], [15, 230, 420, 0.65]] : b % 2 ? [[15, 260, 400, 0.55]] : [];
  for (const [s, f0, f1, v] of TAMA) ev.push([at(b, s) + jit(3, s), t => put(tama(inKey(f0), inKey(f1), v, f0 < f1 ? 0.05 : 0.07, b * 13 + s), t, { gain: brk ? 0.6 : 0.42, pan: brk ? 0.05 : 0.2, group: 'drums', rev: 0.16 })]);
  // ---- shaker (sixteenths, the off-beats leaning) and claps on two and four
  for (let s = 0; s < 16; s++) {
    if (brk && s % 2) continue;
    const v = s % 4 === 2 ? 1 : s % 2 ? 0.55 : 0.7;
    ev.push([at(b, s) + (s % 2 ? 0.006 : 0) + jit(2, s), t => put(shaker(v, s % 4 === 2, b * 16 + s), t, { gain: 0.3, pan: 0.42, group: 'drums', rev: 0.05 })]);
  }
  if (sec === 'B' || sec === 'build' || (sec === 'A' && b >= 4)) for (const s of [4, 12]) ev.push([at(b, s) + jit(2, s), t => put(clap(0.9, b * 16 + s), t, { gain: 0.4, pan: 0, group: 'drums', rev: 0.3 })]);
  // ---- bass: the mbalax line, busy and pushed, approaching the next chord
  const r = ch.root, nr = next.root;
  const LINE = brk ? [[0, 0, 6, 1], [8, 0, 3, 0.8], [11, 7, 2, 0.7], [14, 12, 2, 0.75]]
    : [[0, 0, 2, 1], [3, 0, 1, 0.75], [4, 12, 1, 0.8], [6, 7, 2, 0.88], [8, 0, 2, 0.95], [10, 12, 1, 0.75], [11, 7, 1, 0.75], [13, 0, 1, 0.8], [14, nr - r + (nr > r ? -1 : 1), 1, 0.8], [15, nr - r, 1, 0.0]];
  for (const [s, iv, len, v] of LINE) if (v > 0) ev.push([at(b, s), t => put(bass(r + iv, len * STEP * 0.92, v), t, { gain: 0.36, pan: 0, rev: 0.02 })]);
  // ---- keys: the off-beat skank (and the downbeat in B); a pad in the break
  if (!brk) {
    for (const s of [2, 6, 10, 14]) ev.push([at(b, s) + jit(2, s), t => { for (const m of ch.tones.slice(0, 3)) put(ep(m + 12, STEP * 0.7, 0.75), t, { gain: 0.19, pan: -0.18, rev: 0.22 }); }]);
    if (sec === 'B' && b % 2 === 0) ev.push([at(b, 0), t => { for (const m of ch.tones) put(ep(m, BEAT * 1.2, 0.6), t, { gain: 0.09, pan: 0.12, rev: 0.25 }); }]);
  } else ev.push([at(b, 0), t => put(pad(ch.tones, BAR * 0.96, 0.9), t, { gain: 0.42, pan: 0, rev: 0.35 })]);
  // ---- guitar 1: the picked sebene arpeggio, sixteenths high on the neck (from the second half of A)
  if ((sec === 'A' && b >= 2) || sec === 'B' || sec === 'build') {
    const ARP = [0, 2, 1, 2, 3, 2, 1, 2, 0, 2, 1, 3, 4, 3, 2, 1];
    ARP.forEach((k, s) => {
      const v = s % 4 === 0 ? 0.9 : s % 2 ? 0.55 : 0.72;
      ev.push([at(b, s) + jit(3, s), t => put(pluck(ch.gtr[k], 0.32, v, 0.62, b * 17 + s), t, { gain: 0.34, pan: 0.5, rev: 0.18 })]);
    });
  }
  // ---- guitar 2: double-stops on the 3-3-2 (B and the build)
  if (sec === 'B' || sec === 'build') for (const s of [0, 3, 6, 8, 11, 14]) ev.push([at(b, s) + jit(3, s), t => { for (const m of [ch.gtr[1] - 12, ch.gtr[2] - 12]) put(pluck(m, 0.5, 0.7, 0.5, b * 3 + s + m), t, { gain: 0.24, pan: -0.5, rev: 0.2 }); }]);
  // ---- horns: answers at the end of each B phrase, hits in the build
  const HITS = b === 11 || b === 15 ? [[12, 1, 0.7], [14, 2, 0.9]] : b === 22 ? [[0, 2, 0.8], [6, 2, 0.7], [12, 4, 0.9]] : b === 23 ? [[0, 2, 0.9], [6, 1, 0.7], [8, 1, 0.75], [11, 1, 0.8]] : [];
  for (const [s, len, v] of HITS) ev.push([at(b, s), t => { ch.tones.forEach((m, i) => put(brass(m + 12, len * STEP * 0.85, v), t, { gain: 0.14, pan: (i - 1.5) * 0.25, rev: 0.22 })); }]);
}
// ---- the melody (B): two four-bar phrases, the hook, then its answer. [bar, step, midi, steps]
const MEL = [
  [0, 2, 74, 2], [0, 4, 71, 2], [0, 6, 74, 1], [0, 7, 76, 3], [0, 10, 74, 2], [0, 12, 71, 4],
  [1, 0, 72, 2], [1, 2, 76, 2], [1, 4, 76, 2], [1, 6, 74, 1], [1, 7, 72, 3], [1, 10, 69, 2], [1, 12, 67, 4],
  [2, 0, 69, 2], [2, 2, 74, 2], [2, 4, 78, 2], [2, 6, 76, 1], [2, 7, 74, 3], [2, 10, 69, 2], [2, 12, 71, 2], [2, 14, 72, 2],
  [3, 0, 76, 2], [3, 2, 74, 2], [3, 4, 71, 2], [3, 6, 69, 2], [3, 8, 67, 5], [3, 14, 74, 2],
  [4, 2, 74, 2], [4, 4, 71, 2], [4, 6, 74, 1], [4, 7, 76, 3], [4, 10, 79, 2], [4, 12, 76, 4],
  [5, 0, 72, 2], [5, 2, 76, 2], [5, 4, 79, 2], [5, 6, 76, 1], [5, 7, 74, 3], [5, 10, 72, 2], [5, 12, 69, 4],
  [6, 0, 69, 2], [6, 2, 74, 2], [6, 4, 78, 2], [6, 6, 76, 1], [6, 7, 74, 3], [6, 10, 69, 2], [6, 12, 71, 2], [6, 14, 72, 2],
  [7, 0, 76, 2], [7, 2, 79, 2], [7, 4, 76, 2], [7, 6, 74, 2], [7, 8, 71, 2], [7, 10, 69, 2], [7, 12, 67, 4],
];
ev.push([at(8, 0), t => put(lead(MEL.map(([b, s, m, len]) => [b * BAR + s * STEP, m, len * STEP * 0.94]), 0.9), t, { gain: 0.32, pan: 0.02, rev: 0.22, dly: 0.2 })]);
// in the build, the hook again an octave down on the guitar-like lead, softer
ev.push([at(20, 0), t => put(lead(MEL.slice(0, 27).map(([b, s, m, len]) => [b * BAR + s * STEP, m - 12, len * STEP * 0.94]), 0.7), t, { gain: 0.2, pan: -0.05, rev: 0.25, dly: 0.12 })]);

// ------------------------------------------------------------------------------------------------ render
const t0 = Date.now();
for (let k = 0; k < LOOPS; k++) for (const [t, fn] of ev) fn(k * L + t);
console.log(`voices: ${ev.length * LOOPS} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);

/** Freeverb (Jezar's), stereo, a short bright room: the terrace's wooden deck and the fence. */
function freeverb(inL, inR, room = 0.62, damp = 0.45, wet = 1) {
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617], aps = [556, 441, 341, 225], spread = 23;
  const fb = room * 0.28 + 0.7, d1 = damp * 0.4, d2 = 1 - d1;
  const mk = off => ({ c: combs.map(n => ({ b: new Float32Array(n + off), i: 0, s: 0 })), a: aps.map(n => ({ b: new Float32Array(n + off), i: 0 })) });
  const ch = [mk(0), mk(spread)];
  const outL = new Float32Array(N), outR = new Float32Array(N), pre = Math.round(0.018 * SR);
  const hpL = new OnePole(260), hpR = new OnePole(260);
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
    outL[n] = (o[0] * 0.85 + o[1] * 0.15) * wet; outR[n] = (o[1] * 0.85 + o[0] * 0.15) * wet;
  }
  return [outL, outR];
}
/** Ping-pong delay, a dotted eighth, its repeats darker. */
function pingpong(inp, time = BEAT * 0.75, fb = 0.32) {
  const D = Math.round(time * SR), bl = new Float32Array(D), br = new Float32Array(D), outL = new Float32Array(N), outR = new Float32Array(N);
  const lpL = new OnePole(3200), lpR = new OnePole(3200);
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

const drumGr = compress(bus.drums, -11, 2.0, 0.008, 0.12, 1);
const [rvL, rvR] = freeverb(bus.rev[0], bus.rev[1], 0.6, 0.5, 1);
const [dlL, dlR] = pingpong(bus.dly);
const M = [new Float32Array(N), new Float32Array(N)];
const hp = [new OnePole(28), new OnePole(28)];
for (let n = 0; n < N; n++) {
  M[0][n] = hp[0].hp(bus.drums[0][n] + bus.music[0][n] + rvL[n] * 0.9 + dlL[n] * 0.5);
  M[1][n] = hp[1].hp(bus.drums[1][n] + bus.music[1][n] + rvR[n] * 0.9 + dlR[n] * 0.5);
}
shelf(M, 'low', 90, -2.5); shelf(M, 'high', 3500, 3);
// level into the master chain: the middle loop's peak at about −3 dBFS before compression
let pk = 0; for (let n = Math.round(L * SR); n < Math.round(2 * L * SR); n++) pk = Math.max(pk, Math.abs(M[0][n]), Math.abs(M[1][n]));
const pre = 10 ** (-3 / 20) / pk;
for (let n = 0; n < N; n++) { M[0][n] *= pre; M[1][n] *= pre; }
const busGr = compress(M, -15, 2.0, 0.012, 0.16, 3.5);
const limGr = limit(M, -2);
console.log(`mix: drum bus GR ≤ ${drumGr.toFixed(1)} dB, master GR ≤ ${busGr.toFixed(1)} dB, limiter ≤ ${limGr.toFixed(1)} dB, render ${((Date.now() - t0) / 1000).toFixed(1)} s`);

{ // before encoding: the rendered loop against the next one (the effects' and the tails' state at the seam)
  const a0 = Math.round(L * SR), a1 = Math.round(2 * L * SR), nb = Math.round(BAR * SR); let e = 0, p = 0;
  for (let i = 0; i < nb; i++) { e += (M[0][a1 + i] - M[0][a0 + i]) ** 2; p += M[0][a0 + i] ** 2; }
  console.log(`seam before encoding: ${(10 * Math.log10(e / p)).toFixed(1)} dB`);
}
// ------------------------------------------------------------------------------------------------ the file: marker, the last bar, the loop, the first bar
const MARK = 0.25, LEAD = 0.5;                  // the tick at 0.25 s; the music from 0.5 s
const s0 = Math.round((L - BAR) * SR), s1 = Math.round((2 * L + BAR) * SR);
const lead0 = Math.round(LEAD * SR), total = lead0 + (s1 - s0);
const out = [new Float32Array(total), new Float32Array(total)];
for (let i = 0; i < Math.round(0.002 * SR); i++) { const w = Math.sin(Math.PI * i / Math.round(0.002 * SR)) ** 2, v = 0.5 * w * Math.sin(TAU * 2500 * i / SR); out[0][Math.round(MARK * SR) + i] = v; out[1][Math.round(MARK * SR) + i] = v; }
for (let i = 0; i < s1 - s0; i++) { out[0][lead0 + i] = M[0][s0 + i]; out[1][lead0 + i] = M[1][s0 + i]; }
// a few ms of fade at the file's very start of the music and end (never heard in the game: the loop is inside)
for (let i = 0; i < 64; i++) { const g = i / 64; out[0][lead0 + i] *= g; out[1][lead0 + i] *= g; out[0][total - 1 - i] *= g; out[1][total - 1 - i] *= g; }

function wav(file, chans, sr = SR) {
  const n = chans[0].length, buf = Buffer.alloc(44 + n * 4), R = mulberry(11);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVE', 8); buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) for (let c = 0; c < 2; c++) { const d = (R() - R()) / 32768; buf.writeInt16LE(clamp(Math.round((chans[c][i] + d) * 32767), -32768, 32767), 44 + i * 4 + c * 2); }
  fs.writeFileSync(file, buf);
}
const tmp = fs.mkdtempSync('/tmp/vague-');
wav(`${tmp}/vague.wav`, out);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', `${tmp}/vague.wav`, '-c:a', 'libmp3lame', '-b:a', '128k', '-joint_stereo', '1', OUT]);
if (flags.listen) {
  // for listening: two loops back to back, no tick (the seam in the middle is the game's)
  const two = [new Float32Array(2 * Math.round(L * SR)), new Float32Array(2 * Math.round(L * SR))];
  for (let i = 0; i < two[0].length; i++) { const j = Math.round(L * SR) + (i % Math.round(L * SR)); two[0][i] = M[0][j]; two[1][i] = M[1][j]; }
  wav(`${tmp}/listen.wav`, two);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', `${tmp}/listen.wav`, '-c:a', 'libmp3lame', '-b:a', '160k', flags.listen]);
}

// ------------------------------------------------------------------------------------------------ check what the encoded file holds: the tick, then the downbeats on the grid
const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', OUT, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
const x = new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + (raw.byteLength & ~3)));
let tick = -1; for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) > 0.12) { tick = i; break; }
// the tick's first loud sample in our own render (the burst rises over a few samples)
let tickOwn = -1; for (let i = 0; i < out[0].length; i++) if (Math.abs(out[0][i]) > 0.12) { tickOwn = i; break; }
const offset = tick - tickOwn;                                   // the decoder's delay, in samples
// each downbeat's attack (the kick's click, the stick, the shaker all start on it): the steepest rise of the high band's energy near the expected time
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
let lufs = null, tp = null;
try { const e = execFileSync('sh', ['-c', `ffmpeg -nostats -i '${OUT}' -af ebur128=peak=true -f null - 2>&1 | tail -12`]).toString(); lufs = Number(/I:\s+(-?[\d.]+) LUFS/.exec(e)?.[1]); tp = Number(/Peak:\s+(-?[\d.]+) dBFS/.exec(e)?.[1]); } catch { /* the loudness is only reported */ }
const bytes = fs.statSync(OUT).size;
console.log(`file: ${OUT} ${(bytes / 1024).toFixed(0)} KB, ${(total / SR).toFixed(2)} s; decoder delay in ffmpeg ${offset} samples; downbeats vs the grid: mean ${meanErr.toFixed(2)} ms, max ${maxErr.toFixed(2)} ms; loudness ${lufs} LUFS, true peak ${tp} dBFS; seam: the bars on either side differ from the loop's own by ${seamDb} dB`);

// ------------------------------------------------------------------------------------------------ the beat map (TypeScript)
const sections = [{ id: 'A', from: 0, to: 8 }, { id: 'B', from: 8, to: 16 }, { id: 'break', from: 16, to: 20 }, { id: 'build', from: 20, to: 24 }];
const ts = `// Generated by scripts/audio/render-vague.mjs — do not edit by hand (run the script again: it writes the music and this map together).
/**
 * La Vague's music (public/${OUT.replace(/^public\//, '')}): an original mbalax / afro-pop groove synthesised offline (sabar-like drums and a tama, kick,
 * shaker, claps, bass, electric piano, two plucked guitars, a keyboard lead, horns, a pad). ${BPM} bpm, ${BARS} bars of 4/4: a ${L} s seamless loop.
 * Every note was placed on this grid, so a beat k of the loop is at exactly k × 60 / bpm seconds after \`loopStart\` (in the file, before the decoder's
 * own delay — the game finds that delay from the sync tick at \`tick\`). Downbeats measured again in the encoded file: \`measured\`.
 */
export const VAGUE_TRACK = {
  file: '${OUT.replace(/^public\//, '')}',
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
  loopStart: ${LEAD + BAR},
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
