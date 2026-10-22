/**
 * The car's radio. Three stations, made in the browser (no recording, no stream, nothing downloaded): « Sénégal Hits » (a mbalax groove: sabar and tama, bass,
 * a kora-like pluck, keyboard stabs), « Radio Téranga » (talk: two hosts in turn, their voices made of a pulse through vowel formants, behind the radio's
 * narrow band, with the station's jingle and a news ident now and then) and « Corniche FM » (calm: slow chords, a kora line, the sea).
 *
 * It plays only in a car the player sits at the wheel of (their own or a dealer's on a trial), through the vehicles' sound bus (src/transport/vehicleAudio.ts
 * `radioBus`): the sound setting mutes it, and nothing plays before the first tap (the iPhone's rule). It is kept under the engine when accelerating, and it is
 * lowered for a moment by the horn, a knock, the phone and the card after a job. Its volume (Réglages › Son) is a share of the game's own.
 */
export interface Station { id: 'hits' | 'teranga' | 'corniche'; name: string; freq: string }
export const STATIONS: readonly Station[] = [
  { id: 'hits', name: 'Sénégal Hits', freq: '97.6' },
  { id: 'teranga', name: 'Radio Téranga', freq: '101.4' },
  { id: 'corniche', name: 'Corniche FM', freq: '92.3' },
];
/** The radio's level at full volume, before ducking: well under the engine (~0.045 on the bus when accelerating) and the horn (0.5). */
export const RADIO_LEVEL = 0.03;
/** Volume settings (Réglages › Son › Radio de la voiture). */
export const VOLUMES = [{ id: 'bas', label: 'Bas', v: 0.45 }, { id: 'moyen', label: 'Moyen', v: 0.7 }, { id: 'fort', label: 'Fort', v: 1 }] as const;
const VOL_KEY = 'dakarrek.radio.volume', ST_KEY = 'dakarrek.radio.station';
const store = () => { try { return localStorage; } catch { return null; } };

/** The level the radio is kept at now (pure, unit-tested): the volume, under the engine's load, and the shortest-lived of the ducks in force. */
export function radioGain(o: { volume: number; throttle: number; ducks: readonly { f: number; until: number }[]; now: number; phone: boolean; horn: boolean }): number {
  let f = 1 - 0.4 * Math.max(0, Math.min(1, o.throttle));                // accelerating: the engine leads, the music steps back
  for (const d of o.ducks) if (d.until > o.now) f = Math.min(f, d.f);
  if (o.phone) f = Math.min(f, 0.3);
  if (o.horn) f = Math.min(f, 0.35);
  return RADIO_LEVEL * o.volume * f;
}

type Bus = { ctx: AudioContext; gain: GainNode };
const A = 440, note = (semis: number) => A * 2 ** (semis / 12);
/** A plucked string (Karplus–Strong), rendered once per pitch: the kora's voice. */
const plucks = new Map<string, AudioBuffer>();
function pluck(c: AudioContext, f: number, dur = 1.6, damp = 0.996): AudioBuffer {
  const k = `${c.sampleRate}:${f.toFixed(2)}:${damp}`; const hit = plucks.get(k); if (hit) return hit;
  const sr = c.sampleRate, n = Math.floor(sr * dur), p = Math.max(2, Math.round(sr / f)), b = c.createBuffer(1, n, sr), d = b.getChannelData(0), ring = new Float32Array(p);
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 * 2 - 1; };
  for (let i = 0; i < p; i++) ring[i] = rnd();
  for (let i = 0, j = 0; i < n; i++, j = (j + 1) % p) { const nx = (j + 1) % p, v = ring[j]; d[i] = v; ring[j] = damp * 0.5 * (v + ring[nx]); }
  plucks.set(k, b); return b;
}
let noiseB: AudioBuffer | null = null;
const noise = (c: AudioContext) => noiseB ??= (() => { const b = c.createBuffer(1, c.sampleRate, c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; })();

/** One station's music, scheduled a quarter of a second ahead each frame. */
interface Gen { tick(t: number): void; stop(): void }

function hitsGen(c: AudioContext, out: AudioNode): Gen {
  const bpm = 124, step = 60 / bpm / 4; let next = c.currentTime + 0.05, i = 0;
  const bassLine = [-24 - 12 + 0, -24 - 12 - 2, -24 - 12 - 4, -24 - 12 - 2];    // A1 G1 F1 G1 (relative to A4): Am G F G
  const scale = [0, 3, 5, 7, 10, 12, 15];                                       // A minor pentatonic
  const kick = (t: number) => { const o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(75, t); o.frequency.exponentialRampToValueAtTime(46, t + 0.12); g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2); o.connect(g).connect(out); o.start(t); o.stop(t + 0.22); };
  const slap = (t: number, acc: number) => { const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); s.buffer = noise(c); f.type = 'bandpass'; f.frequency.value = 2300; f.Q.value = 1.4; g.gain.setValueAtTime(0.35 * acc, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.06); s.connect(f).connect(g).connect(out); s.start(t, Math.random() * 0.5); s.stop(t + 0.08); };
  const tama = (t: number) => { const o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(420, t); o.frequency.exponentialRampToValueAtTime(250, t + 0.14); g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.16); o.connect(g).connect(out); o.start(t); o.stop(t + 0.18); };
  const bass = (t: number, semis: number) => { const o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain(); o.type = 'triangle'; o.frequency.value = note(semis); f.type = 'lowpass'; f.frequency.value = 700; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.5, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + 0.26); o.connect(f).connect(g).connect(out); o.start(t); o.stop(t + 0.3); };
  const kora = (t: number, semis: number, v = 0.3) => { const s = c.createBufferSource(), g = c.createGain(); s.buffer = pluck(c, note(semis)); g.gain.value = v; s.connect(g).connect(out); s.start(t); s.stop(t + 1.2); };
  const stab = (t: number, root: number) => { for (const k of [0, 7]) { const o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain(); o.type = 'square'; o.frequency.value = note(root + 12 + k); f.type = 'lowpass'; f.frequency.value = 1600; g.gain.setValueAtTime(0.06, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12); o.connect(f).connect(g).connect(out); o.start(t); o.stop(t + 0.14); } };
  let seed = 3; const rnd = () => { seed = (seed * 48271) % 2147483647; return seed / 2147483647; };
  return {
    tick(t) {
      while (next < t + 0.25) {
        const s = i % 16, bar = Math.floor(i / 16) % 4, root = bassLine[bar];
        if (s === 0 || s === 6 || s === 10) kick(next);
        if ([2, 3, 5, 7, 8, 11, 13, 14, 15].includes(s)) slap(next, s === 3 || s === 11 ? 1 : 0.6);
        if ((s === 4 || s === 12) && bar % 2 === 1) tama(next);
        if (s === 0 || s === 3 || s === 8 || s === 11) bass(next, root);
        if (s % 4 === 2) stab(next, root + 24);
        if (s % 2 === 0 && rnd() < 0.62) kora(next, -12 + scale[Math.floor(rnd() * scale.length)] + (bar === 3 ? -2 : 0), 0.22 + 0.12 * rnd());
        next += step; i++;
      }
    },
    stop() { /* the nodes end by themselves */ },
  };
}

function corniche(c: AudioContext, out: AudioNode): Gen {
  const bpm = 76, beat = 60 / bpm; let next = c.currentTime + 0.05, i = 0;
  const chords = [[0, 4, 7, 11], [-3, 0, 4, 7], [-7, -3, 0, 4], [-5, -1, 2, 7]].map(ch => ch.map(n => n - 9));   // Cmaj7, Am7, Fmaj7, G (around C4)
  const sea = c.createBufferSource(), seaF = c.createBiquadFilter(), seaG = c.createGain(), lfo = c.createOscillator(), lfoG = c.createGain();
  sea.buffer = noise(c); sea.loop = true; seaF.type = 'lowpass'; seaF.frequency.value = 520; seaG.gain.value = 0.05; lfo.frequency.value = 0.11; lfoG.gain.value = 0.045;
  lfo.connect(lfoG).connect(seaG.gain); sea.connect(seaF).connect(seaG).connect(out); sea.start(); lfo.start();
  const pad = (t: number, ch: number[], dur: number) => {
    const f = c.createBiquadFilter(), g = c.createGain(); f.type = 'lowpass'; f.frequency.value = 900; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.09, t + 0.8); g.gain.setValueAtTime(0.09, t + dur - 0.8); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.3);
    f.connect(g).connect(out);
    for (const n of ch) for (const det of [-6, 6]) { const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = note(n); o.detune.value = det; o.connect(f); o.start(t); o.stop(t + dur + 0.4); }
  };
  const kora = (t: number, semis: number) => { const s = c.createBufferSource(), g = c.createGain(); s.buffer = pluck(c, note(semis), 2.2, 0.997); g.gain.value = 0.22; s.connect(g).connect(out); s.start(t); s.stop(t + 2); };
  return {
    tick(t) {
      while (next < t + 0.3) {
        const b = i % 8, ch = chords[Math.floor(i / 8) % 4];
        if (b === 0) pad(next, ch, beat * 8);
        kora(next + 0, ch[(b * 3) % 4] + 12);
        if (b % 2 === 1) kora(next + beat / 2, ch[(b + 2) % 4] + 12);
        next += beat; i++;
      }
    },
    stop() { try { sea.stop(); lfo.stop(); } catch { /* stopped */ } },
  };
}

/** Talk radio: two hosts in turn, voices from a pulse through two vowel formants, behind the radio's band; the jingle every 40 s or so, the news ident now and then. */
function talk(c: AudioContext, out: AudioNode): Gen {
  const band = c.createBiquadFilter(), band2 = c.createBiquadFilter(); band.type = 'highpass'; band.frequency.value = 280; band2.type = 'lowpass'; band2.frequency.value = 3200;
  band.connect(band2).connect(out);
  const src = c.createOscillator(), f1 = c.createBiquadFilter(), f2 = c.createBiquadFilter(), g = c.createGain(), g2 = c.createGain();
  src.type = 'sawtooth'; f1.type = 'bandpass'; f1.Q.value = 6; f2.type = 'bandpass'; f2.Q.value = 9; g.gain.value = 0; g2.gain.value = 0.55;
  src.connect(f1).connect(g); src.connect(f2).connect(g2).connect(g); g.connect(band); src.start();
  const VOWELS = [[800, 1250], [450, 1900], [320, 2250], [520, 950], [340, 850], [620, 1600]];
  let next = c.currentTime + 0.1, phrase = 0, sylLeft = 0, f0 = 120, voice = 0, sinceJingle = 0;
  let seed = 11; const rnd = () => { seed = (seed * 48271) % 2147483647; return seed / 2147483647; };
  const jingle = (t: number) => {
    for (const [k, semis] of [7, 12, 16, 19].entries()) { const s = c.createBufferSource(), gg = c.createGain(); s.buffer = pluck(c, note(semis - 12), 1.4); gg.gain.value = 0.35; s.connect(gg).connect(out); s.start(t + k * 0.13); s.stop(t + k * 0.13 + 1.2); }
    return 0.9;
  };
  return {
    tick(t) {
      while (next < t + 0.3) {
        if (sylLeft <= 0) {                                                        // a new phrase (or a jingle)
          if (sinceJingle > 40 && rnd() < 0.5) { sinceJingle = 0; next += jingle(next) + 0.4; continue; }
          phrase++; voice = rnd() < 0.55 ? (phrase % 2) : voice; f0 = voice ? 205 : 118; sylLeft = 6 + Math.floor(rnd() * 14);
          next += 0.35 + rnd() * 0.5; sinceJingle += 1.5;
        }
        const d = 0.08 + rnd() * 0.12, [a, b] = VOWELS[Math.floor(rnd() * VOWELS.length)], k = voice ? 1.18 : 1, pitch = f0 * (0.85 + 0.25 * rnd()) * (1 - 0.15 * (1 - sylLeft / 20));
        src.frequency.setTargetAtTime(pitch, next, 0.03);
        f1.frequency.setTargetAtTime(a * k, next, 0.02); f2.frequency.setTargetAtTime(b * k, next, 0.02);
        g.gain.setTargetAtTime(0.42, next, 0.012); g.gain.setTargetAtTime(0.0001, next + d * 0.8, 0.02);
        next += d + (rnd() < 0.25 ? 0.07 : 0.015); sylLeft--; sinceJingle += d;
      }
    },
    stop() { try { src.stop(); } catch { /* stopped */ } g.disconnect(); band2.disconnect(); },
  };
}

class Radio {
  /** The station playing (index in STATIONS), −1: off. */
  station = -1;
  volume = (() => { const v = Number(store()?.getItem(VOL_KEY)); return Number.isFinite(v) && v > 0 && v <= 1 ? v : 0.7; })();
  private bus: Bus | null = null;
  private out: GainNode | null = null;
  private gen: Gen | null = null;
  private ducks: { f: number; until: number }[] = [];
  /** Asked for while there is no sound yet (before the first tap): it starts as soon as there is. */
  private want = -1;
  private log = { started: 0, ducked: 0, ticks: 0, level: 0 };

  /** The last station the player listened to (the radio comes back on with it when they sit in a car again), −1: it was off. */
  get remembered() { const v = Number(store()?.getItem(ST_KEY) ?? -1); return Number.isInteger(v) && v >= -1 && v < STATIONS.length ? v : -1; }

  /** The next station (off → the first → … → off), for the « 📻 » button. Returns the station now on, or null when off. */
  next(bus: Bus | null): Station | null { const i = this.station + 1 >= STATIONS.length ? -1 : this.station + 1; this.set(bus, i); try { store()?.setItem(ST_KEY, String(i)); } catch { /* */ } return i >= 0 ? STATIONS[i] : null; }
  set(bus: Bus | null, i: number) {
    this.gen?.stop(); this.gen = null; this.station = i; this.want = i;
    if (i < 0) { this.fade(0.25); return; }
    if (!bus) return;                                                             // no sound yet: it starts with the first tap (update)
    this.bus = bus; const c = bus.ctx;
    if (!this.out || this.out.context !== c) { this.out = c.createGain(); this.out.gain.value = 0; this.out.connect(bus.gain); }
    this.gen = STATIONS[i].id === 'hits' ? hitsGen(c, this.out) : STATIONS[i].id === 'teranga' ? talk(c, this.out) : corniche(c, this.out);
    this.log.started++;
  }
  /** A moment lower: the horn, a knock (`f` of the level for `s` seconds). */
  duck(f: number, s: number) { const c = this.bus?.ctx; if (!c || this.station < 0) return; this.ducks.push({ f, until: c.currentTime + s }); this.log.ducked++; }
  /** Every frame at the wheel of a car: the music scheduled ahead, its level kept where it should be. */
  update(bus: Bus | null, o: { throttle: number; horn: boolean; phone: boolean }) {
    if (this.want >= 0 && !this.gen && bus) this.set(bus, this.want);
    if (!this.gen || !this.bus || !this.out) return;
    const c = this.bus.ctx, now = c.currentTime;
    this.ducks = this.ducks.filter(d => d.until > now);
    this.gen.tick(now); this.log.ticks++;
    const g = radioGain({ volume: this.volume, throttle: o.throttle, ducks: this.ducks, now, phone: o.phone, horn: o.horn });
    this.log.level = g;
    this.out.gain.setTargetAtTime(g, now, 0.25);
  }
  /** Out of the car: the radio stops (it never plays in the street); the station is remembered for the next ride. */
  leave() { this.gen?.stop(); this.gen = null; this.want = -1; this.station = -1; this.fade(0.2); }
  private fade(s: number) { const o = this.out, c = this.bus?.ctx; if (o && c) o.gain.setTargetAtTime(0, c.currentTime, s / 3); }
  setVolume(v: number) { this.volume = v; try { store()?.setItem(VOL_KEY, String(v)); } catch { /* */ } }
  info() { return { station: this.station >= 0 ? STATIONS[this.station].id : null, volume: this.volume, playing: !!this.gen, want: this.want, ducks: this.ducks.length, ...this.log }; }
}
export const radio = new Radio();
