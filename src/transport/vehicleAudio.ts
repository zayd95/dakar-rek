import { audioBus, audioMaster } from '../lamb/audio';
import { isMuted } from '../core/audioSettings';
import { hasGestured, listenForGesture } from '../arena/exteriorAudio';
import { keepAlive, nudge, sessionType, setPlaybackSession } from './audioUnlock';
import { SampleBank, type SampleName } from './vehicleSamples';

/**
 * The sounds of a vehicle the player drives: door, engine start, idle, an engine that rises and falls with the speed through its gears, brake squeal, a tap or a real impact, a scrape,
 * the horn, and a very low bed of Dakar traffic while driving. The engines, horns and collisions are RECORDINGS (CC0, ~210 KB: src/transport/vehicleSamples.ts, docs/audio/VEHICLE_SAMPLES.md)
 * played through a small Web Audio graph: loops pitched with the revs and cross-faded, one-shots layered by severity, a grain scheduler for the scrape. The door, the key chirps and the
 * road/traffic noise bed stay synthesised. Everything goes through the page's master gain: the sound setting (phone › Réglages) mutes it, and nothing plays before the player's first tap
 * or key (an iPhone only lets a page play after one: the first gesture creates and resumes the context). Pure helpers (`rpmOf`, `impactKind`, `brakeIntensity`) carry the rules and are unit-tested.
 */
export interface EngineProfile {
  /** The two recorded loops: the idle one and the one that takes over as the revs climb. */
  idle: SampleName; rev: SampleName;
  /** The recorded ignition, its playback rate (the motorbike\'s is the same recording pitched up), and the second at which the engine catches in it (the loops fade in there). */
  start: SampleName; startRate: number; catchAt: number;
  /** Playback rate of each loop at the lowest and the highest revs (the loop's pitch follows the revs), and the revs (0…1) over which the idle loop hands over to the high one. */
  idleRate: [number, number]; revRate: [number, number]; xf: [number, number];
  /** Gears: the revs fall each time the car passes a gear's top. */
  gears: number;
  /** Overall level of this engine. */
  level: number;
  /** The gain it is brought down to at full revs (1 = not at all; the fall follows the revs, so the idle keeps its level; the bus limiter flattens loud input, so a −14 dB trim is about −5 dB at the speaker): a small motorbike's loops are far louder at speed than at rest. */
  topTrim: number;
  /** The tone: high-pass (Hz), low-pass at idle and at full revs (Hz), the lift of the 1.3 kHz band (dB: what a phone loudspeaker plays of an engine), and the weight of the harmonic exciter (the bass note's overtones). */
  hp: number; lpIdle: number; lpTop: number; air: number; excite: number;
}
export const PROFILES: Record<'sedan' | 'luxury' | 'suv' | 'moto', EngineProfile> = {
  sedan: { topTrim: 1, start: 'start-car', startRate: 1, catchAt: 0.8, idle: 'car-idle', rev: 'car-rev', idleRate: [0.85, 1.55], revRate: [0.9, 1.85], xf: [0.3, 0.7], gears: 4, level: 1, hp: 40, lpIdle: 2400, lpTop: 6500, air: 3, excite: 0.35 },
  luxury: { topTrim: 1, start: 'start-car', startRate: 1, catchAt: 0.8, idle: 'car-idle', rev: 'car-rev', idleRate: [0.8, 1.35], revRate: [0.85, 1.55], xf: [0.35, 0.8], gears: 5, level: 0.9, hp: 40, lpIdle: 1700, lpTop: 4600, air: 2, excite: 0.3 },
  suv: { topTrim: 1, start: 'start-car', startRate: 0.92, catchAt: 0.87, idle: 'car-idle', rev: 'car-rev', idleRate: [0.7, 1.3], revRate: [0.75, 1.55], xf: [0.3, 0.7], gears: 4, level: 1, hp: 32, lpIdle: 1900, lpTop: 5200, air: 3, excite: 0.45 },
  moto: { topTrim: 0.08, start: 'start-car', startRate: 1.3, catchAt: 0.62, idle: 'moto-idle', rev: 'car-rev', idleRate: [1.55, 2.7], revRate: [1.4, 2.8], xf: [0.2, 0.55], gears: 4, level: 0.9, hp: 230, lpIdle: 3800, lpTop: 8000, air: 6, excite: 0.5 },
};
export const profileFor = (kit: string): EngineProfile => PROFILES[(kit in PROFILES ? kit : 'sedan') as keyof typeof PROFILES];

/**
 * The horn of each kind of vehicle: a recorded car horn (two reeds, a major-third-ish pair near 400 and 500 Hz, with its overtones to 1.6 kHz: what a phone loudspeaker does play), played a little
 * lower for a big SUV and a little softer for a saloon; the motorbike has its own recording, derived from it at build time: pitched up, the lower reed taken out, so a smaller, single, reedier note.
 */
export interface HornVoice {
  sample: SampleName;
  /** Playback rate (the pitch). */
  rate: number;
  /** High-pass (Hz), and the lift (dB at Hz) that carries it through a phone speaker. */
  hp: number; peakHz: number; peakDb: number;
  /** Level of the horn before the bus's limiter. */
  level: number;
}
export const HORNS: Record<keyof typeof PROFILES, HornVoice> = {
  sedan: { sample: 'horn-car', rate: 1, hp: 200, peakHz: 1300, peakDb: 3, level: 0.5 },
  luxury: { sample: 'horn-car', rate: 0.94, hp: 200, peakHz: 1200, peakDb: 2, level: 0.46 },
  suv: { sample: 'horn-car', rate: 0.84, hp: 180, peakHz: 1100, peakDb: 3, level: 0.52 },
  moto: { sample: 'horn-moto', rate: 1, hp: 380, peakHz: 1800, peakDb: 3, level: 0.4 },
};
export const hornFor = (kit: string): HornVoice => HORNS[(kit in HORNS ? kit : 'sedan') as keyof typeof HORNS];

/** Revs 0…1 for a speed (m/s) up to `maxSpeed`: idle at a standstill, climbing within a gear, falling back at each change. */
export function rpmOf(speed: number, maxSpeed: number, gears: number, throttle = 0): number {
  const v = Math.min(1, Math.abs(speed) / Math.max(0.1, maxSpeed)), span = 1 / gears, g = Math.min(gears - 1, Math.floor(v / span)), within = (v - g * span) / span;
  const base = 0.16 + 0.62 * within + 0.1 * (g / gears);
  return Math.max(0.12, Math.min(1, base + 0.08 * Math.max(0, throttle) - 0.04 * Math.max(0, -throttle)));
}
/** A tap or an impact: below this speed (m/s) a contact is a bump, not a crash. */
export const IMPACT_SPEED = 2.5;
export function impactKind(speed: number): 'tap' | 'impact' { return Math.abs(speed) >= IMPACT_SPEED ? 'impact' : 'tap'; }
/** How hard a brake is, 0…1: the deceleration against what a hard stop is (m/s²), only while really moving. */
export function brakeIntensity(decel: number, speed: number): number { return speed < 4 ? 0 : Math.max(0, Math.min(1, (decel - 3) / 6)); }

/** Below this (Hz) a phone's loudspeaker gives next to nothing. */
export const SPEAKER_HZ = 300;
type Bus = { ctx: AudioContext; gain: GainNode };
let noiseBuf: AudioBuffer | null = null;
const noise = (c: AudioContext) => noiseBuf ??= (() => { const b = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; })();

/** A soft-saturation curve (tanh) with `drive`: the bass note of an engine gets its harmonics. */
function driveCurve(drive: number): Float32Array<ArrayBuffer> { const n = 1025, c = new Float32Array(new ArrayBuffer(n * 4)); for (let i = 0; i < n; i++) c[i] = Math.tanh(drive * ((i / (n - 1)) * 2 - 1)) / Math.tanh(drive); return c; }

class VehicleAudio {
  /** Sounds asked for and played, by kind (the checks: nothing before a gesture, nothing when muted). */
  readonly count: Record<string, number> = { asked: 0, played: 0, door: 0, start: 0, brake: 0, tap: 0, impact: 0, horn: 0, unlock: 0, scrape: 0 };
  private bus: Bus | null = null;
  private eng: { prof: EngineProfile; sIdle: AudioBufferSourceNode; sRev: AudioBufferSourceNode; gIdle: GainNode; gRev: GainNode; lp: BiquadFilterNode; gEng: GainNode; road: GainNode; roadF: BiquadFilterNode; bed: GainNode; srcs: AudioScheduledSourceNode[]; rpm: number; ready: number } | null = null;
  private horn: { gain: GainNode; srcs: AudioBufferSourceNode[] } | null = null;
  /** The recordings, and whether they are decoded; a horn asked for before they are decoded starts when they are. */
  readonly bank = new SampleBank();
  private decoded = false; private hornWanted: string | null = null; private hitN = 0;
  private lastShot = new Map<string, number>();
  private bedTimer = 0;
  private unlocked = false;
  /** How often the context was asked to resume, and by which event (the on-device diagnostics: a silent phone shows whether a gesture ever reached it). */
  private nudges = 0; private lastNudge = '';
  private meterNode: AnalyserNode | null = null;
  private scr: { gain: GainNode; bp: BiquadFilterNode; srcs: AudioScheduledSourceNode[]; next: number } | null = null;
  private scrLast = 0;

  /** The vehicles' bus: its own gain, then a limiter (a horn over an engine over a crash must not clip), then the page's master gain (which carries the sound setting). */
  private makeBus(): Bus | null {
    const b = audioBus(); if (!b) return null;
    const master = audioMaster();
    if (master) {
      try {
        const lim = b.ctx.createDynamicsCompressor(), pre = b.ctx.createGain(), soft = b.ctx.createWaveShaper();
        lim.threshold.value = -14; lim.knee.value = 8; lim.ratio.value = 8; lim.attack.value = 0.004; lim.release.value = 0.14;
        // what the compressor lets through is rounded off, never cut flat: tanh over a doubled range (unity gain for small signals, nothing past ±0.96)
        pre.gain.value = 0.5; const curve = new Float32Array(1025); curve.forEach((_, i) => { curve[i] = Math.tanh(2 * ((i / 512) - 1)); }); soft.curve = curve; soft.oversample = '2x';
        b.gain.disconnect(); b.gain.connect(lim); lim.connect(pre); pre.connect(soft); soft.connect(master);
      } catch { /* the plain bus still plays */ }
    }
    return b;
  }

  /**
   * Keeps the page's sound alive for as long as the page lives (src/transport/audioUnlock.ts): every gesture (the end of a touch, a click, a key) and every return to the page resumes a
   * context that stopped (suspended, or « interrupted » on iPhone after a call, the lock screen, another tab). The first one also creates it, inside the gesture. Idempotent.
   */
  unlockOnGesture() {
    if (this.unlocked || typeof window === 'undefined') return;
    this.unlocked = true; listenForGesture(); this.bank.prefetch();               // the recordings start downloading now; they are decoded when the first gesture makes the context
    keepAlive(window, document, () => this.bus?.ctx ?? null, () => { try { this.bus ??= this.makeBus(); } catch { /* no audio on this device */ } if (this.bus) this.ensureSamples(this.bus); return this.bus?.ctx ?? null; },
      why => { this.nudges++; this.lastNudge = why; });
  }

  /** The bus, when sound may play (a gesture was made, the sound setting is on). */
  private open(): Bus | null {
    if (isMuted() || !hasGestured()) return null;
    try { this.bus ??= this.makeBus(); } catch { return null; }
    const b = this.bus; if (!b) return null;
    if (nudge(b.ctx)) { this.nudges++; this.lastNudge = 'frame'; }
    b.gain.gain.value = 1;
    return b;
  }
  /** A one-shot of `kind`: counted when asked, played only when sound may play and not again within `gap` seconds. */
  private ready(kind: string, gap = 0): Bus | null {
    this.count.asked++;
    const b = this.open(); if (!b) return null;
    const now = b.ctx.currentTime, last = this.lastShot.get(kind) ?? -9;
    if (now - last < gap) return null;
    this.lastShot.set(kind, now);
    this.count.played++; this.count[kind] = (this.count[kind] ?? 0) + 1;
    return b;
  }

  private burst(b: Bus, at: number, dur: number, freq: number, q: number, peak: number, type: BiquadFilterType = 'bandpass') {
    const c = b.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = noise(c); f.type = type; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(peak, at + 0.008); g.gain.exponentialRampToValueAtTime(0.0008, at + dur);
    s.connect(f).connect(g).connect(b.gain); s.start(at, Math.random()); s.stop(at + dur + 0.02);
  }
  private thud(b: Bus, at: number, freq: number, dur: number, peak: number) {
    const c = b.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(freq * 1.6, at); o.frequency.exponentialRampToValueAtTime(freq, at + 0.05);
    g.gain.setValueAtTime(peak, at); g.gain.exponentialRampToValueAtTime(0.0008, at + dur);
    o.connect(g).connect(b.gain); o.start(at); o.stop(at + dur + 0.02);
  }

  /** A door: opening (latch, a short rush) or closing (a solid thud). */
  door(open: boolean) {
    const b = this.ready('door', 0.15); if (!b) return;
    const t = b.ctx.currentTime;
    if (open) { this.burst(b, t, 0.06, 1800, 3, 0.05); this.burst(b, t + 0.05, 0.1, 700, 1, 0.05); this.thud(b, t + 0.03, 110, 0.12, 0.18); }
    else { this.thud(b, t, 72, 0.2, 0.42); this.burst(b, t, 0.1, 520, 0.8, 0.12, 'lowpass'); this.burst(b, t + 0.06, 0.03, 2400, 4, 0.04); }
  }

  /** The remote of a car: two short chirps (the salesperson unlocks it), or one lower one (locks it again). */
  unlock() {
    const b = this.ready('unlock', 0.5); if (!b) return;
    const c = b.ctx, t = c.currentTime;
    for (const [i, f] of [1850, 2350].entries()) {
      const o = c.createOscillator(), g = c.createGain(), at = t + i * 0.16;
      o.type = 'square'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(0.035, at + 0.01); g.gain.setValueAtTime(0.035, at + 0.07); g.gain.exponentialRampToValueAtTime(0.0008, at + 0.1);
      o.connect(g).connect(b.gain); o.start(at); o.stop(at + 0.12);
    }
  }

  /** A recorded one-shot through a small chain (optional high-pass / low-pass), with its own envelope. `dur` and `offset` are in the sample's own time. */
  private shot(b: Bus, name: SampleName, o: { at?: number; offset?: number; dur: number; rate?: number; gain: number; hp?: number; lp?: number; attack?: number; release?: number; dest?: AudioNode }) {
    const buf = this.bank.get(name); if (!buf) return;
    const c = b.ctx, t = (o.at ?? c.currentTime), rate = o.rate ?? 1, wall = o.dur / rate, att = o.attack ?? 0.004, rel = Math.min(o.release ?? 0.06, wall * 0.8);
    const s = c.createBufferSource(), g = c.createGain();
    s.buffer = buf; s.playbackRate.value = rate;
    let node: AudioNode = s;
    if (o.hp) { const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = o.hp; node.connect(f); node = f; }
    if (o.lp) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; node.connect(f); node = f; }
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(o.gain, t + att); g.gain.setValueAtTime(o.gain, Math.max(t + att, t + wall - rel)); g.gain.linearRampToValueAtTime(0.0001, t + wall);
    node.connect(g).connect(o.dest ?? b.gain);
    s.start(t, Math.min(o.offset ?? 0, Math.max(0, buf.duration - 0.01)), o.dur + 0.02); s.stop(t + wall + 0.03);
  }
  /** Makes the samples ready: fetched at once, decoded as soon as the context exists. Idempotent. */
  private ensureSamples(b: Bus) { this.bank.decode(b.ctx).then(() => { this.decoded = true; }); }

  /** Engine start: the recorded ignition (the starter, the engine catching). Returns the second at which the engine catches in it (the loops fade in there). */
  start(prof: EngineProfile): number {
    const b = this.ready('start', 0.5); if (!b) return 0;
    const buf = this.bank.get(prof.start); if (buf) this.shot(b, prof.start, { dur: buf.duration, rate: prof.startRate, gain: 0.55 * prof.level, hp: prof.hp > 100 ? 160 : 70, attack: 0.02, release: 0.6 });
    return prof.catchAt;
  }
  /** The starter turning over and not catching (a dead car): the recorded ignition up to just before the engine catches (`catchAt`), then it dies away. No engine follows. */
  crank(prof: EngineProfile) {
    const b = this.ready('crank', 0.8); if (!b) return;
    this.shot(b, prof.start, { dur: Math.max(0.3, (prof.catchAt - 0.1) * prof.startRate), rate: prof.startRate, gain: 0.5 * prof.level, hp: prof.hp > 100 ? 160 : 70, attack: 0.02, release: 0.3 });
  }

  /** The engine loops and the traffic bed: on while driving. */
  run(prof: EngineProfile, delay = 0) {
    if (this.eng) return;
    const b = this.open(); if (!b) return;
    this.ensureSamples(b);
    const idle = this.bank.get(prof.idle), rev = this.bank.get(prof.rev);
    if (!idle || !rev) return;                                                   // still decoding: the module asks again next frame
    setPlaybackSession(true);                                                    // driving is not background music: not muted by the silent switch (where the browser has the API)
    const c = b.ctx, t = c.currentTime;
    const sIdle = c.createBufferSource(), sRev = c.createBufferSource(), gIdle = c.createGain(), gRev = c.createGain(), mix = c.createGain();
    sIdle.buffer = idle; sRev.buffer = rev; sIdle.loop = sRev.loop = true; sIdle.playbackRate.value = prof.idleRate[0]; sRev.playbackRate.value = prof.revRate[0];
    gIdle.gain.value = 1; gRev.gain.value = 0;
    sIdle.connect(gIdle).connect(mix); sRev.connect(gRev).connect(mix);
    // the tone: high-pass (a phone gives nothing below), a low-pass that opens with the revs and the throttle, a lift in the band the speaker does play
    const hp = c.createBiquadFilter(), lp = c.createBiquadFilter(), air = c.createBiquadFilter(), gEng = c.createGain();
    hp.type = 'highpass'; hp.frequency.value = prof.hp; hp.Q.value = 0.5; lp.type = 'lowpass'; lp.frequency.value = prof.lpIdle; lp.Q.value = 0.6;
    air.type = 'peaking'; air.frequency.value = 1300; air.Q.value = 0.8; air.gain.value = prof.air; gEng.gain.value = 0;
    mix.connect(hp).connect(lp).connect(air).connect(gEng).connect(b.gain);
    // the harmonic exciter: the bass note, saturated, keeps only its overtones in 200–1200 Hz (what is left of a 30–120 Hz engine on a small speaker)
    const exHp = c.createBiquadFilter(), ws = c.createWaveShaper(), exBp = c.createBiquadFilter(), gEx = c.createGain();
    exHp.type = 'highpass'; exHp.frequency.value = 50; ws.curve = driveCurve(3); ws.oversample = '2x'; exBp.type = 'bandpass'; exBp.frequency.value = 520; exBp.Q.value = 0.6; gEx.gain.value = prof.excite * 0.5;
    mix.connect(exHp).connect(ws).connect(exBp).connect(gEx).connect(gEng);
    const n1 = c.createBufferSource(), roadF = c.createBiquadFilter(), road = c.createGain();
    n1.buffer = noise(c); n1.loop = true; roadF.type = 'bandpass'; roadF.frequency.value = 400; roadF.Q.value = 0.6; road.gain.value = 0;
    n1.connect(roadF).connect(road).connect(b.gain);
    const n2 = c.createBufferSource(), bedF = c.createBiquadFilter(), bed = c.createGain(), lfo = c.createOscillator(), lfoG = c.createGain();
    n2.buffer = noise(c); n2.loop = true; bedF.type = 'lowpass'; bedF.frequency.value = 330; bed.gain.value = 0;
    lfo.frequency.value = 0.09; lfoG.gain.value = 0.006; lfo.connect(lfoG).connect(bed.gain);
    n2.connect(bedF).connect(bed).connect(b.gain);
    sIdle.start(t + delay, Math.random() * idle.duration); sRev.start(t + delay, Math.random() * rev.duration); n1.start(t + delay); n2.start(t + delay); lfo.start(t + delay);
    gEng.gain.setTargetAtTime(0.3 * prof.level, t + delay, 0.22);
    bed.gain.setTargetAtTime(0.011, t + delay + 0.5, 0.8);
    this.eng = { prof, sIdle, sRev, gIdle, gRev, lp, gEng, road, roadF, bed, srcs: [sIdle, sRev, n1, n2, lfo], rpm: 0.15, ready: t + delay };
    this.bedTimer = 7 + Math.random() * 8;
  }

  /** Each frame while driving: revs follow the speed and the throttle (the loops are pitched with them and handed over), tyre noise follows the speed, the bed stays very low (and ducks under the horn). */
  update(dt: number, speed: number, maxSpeed: number, throttle: number) {
    const e = this.eng; if (!e || !this.bus) return;
    const c = this.bus.ctx, t = c.currentTime, P = e.prof;
    const want = rpmOf(speed, maxSpeed, P.gears, throttle);
    e.rpm += (want - e.rpm) * Math.min(1, dt * (want > e.rpm ? 5 : 3));
    const k = Math.max(0, Math.min(1, (e.rpm - 0.12) / 0.88)), lift = throttle <= 0 && Math.abs(speed) > 4;       // off the throttle at speed: the engine brakes, the note closes up
    e.sIdle.playbackRate.setTargetAtTime(P.idleRate[0] + (P.idleRate[1] - P.idleRate[0]) * k, t, 0.05);
    e.sRev.playbackRate.setTargetAtTime(P.revRate[0] + (P.revRate[1] - P.revRate[0]) * k, t, 0.05);
    const x = Math.max(0, Math.min(1, (e.rpm - P.xf[0]) / (P.xf[1] - P.xf[0]))), h = x * x * (3 - 2 * x), load = Math.max(0, throttle);
    e.gIdle.gain.setTargetAtTime(Math.cos(h * Math.PI / 2) * 0.9 + 0.1, t, 0.06);                                       // equal-power hand-over; a little idle stays under the high loop
    e.gRev.gain.setTargetAtTime(Math.sin(h * Math.PI / 2) * (lift ? 0.7 : 0.8 + 0.3 * load), t, 0.06);
    e.lp.frequency.setTargetAtTime((P.lpIdle + (P.lpTop - P.lpIdle) * k) * (lift ? 0.65 : 0.85 + 0.25 * load), t, 0.06);
    const lvl = (0.3 + 0.2 * e.rpm + 0.1 * load) * (lift ? 0.78 : 1), trim = 1 + (P.topTrim - 1) * Math.pow(k, 0.6);   // the Jakarta: measured at the speaker (the limiter flattens what goes in), 0.2 was about −5 dB when riding, 0.08 is about −8 dB (−2.7 dB more, owner's second request); idle stays where it was
    e.gEng.gain.setTargetAtTime(Math.min(0.7, lvl) * P.level * trim, t, 0.06);
    const v = Math.min(1, Math.abs(speed) / Math.max(0.1, maxSpeed));
    e.road.gain.setTargetAtTime(0.035 * v * v * (P === PROFILES.moto ? 1.3 : 1), t, 0.1); e.roadF.frequency.setTargetAtTime(260 + 900 * v, t, 0.1);
    e.bed.gain.setTargetAtTime(this.horn ? 0.002 : 0.011, t, 0.2);
    if ((this.bedTimer -= dt) <= 0) { this.bedTimer = 12 + Math.random() * 14; this.distantHorn(); }
    if (this.hornWanted && !this.horn) this.startHorn(this.bus, this.hornWanted);       // the button was pressed before the recording was decoded
    if (this.scr && performance.now() - this.scrLast > 220) this.scrapeOff();           // a scrape that is not renewed ends
  }

  /** The engine stops (a short fall of the revs). */
  stop() {
    const e = this.eng; if (!e || !this.bus) { this.eng = null; return; }
    const c = this.bus.ctx, t = c.currentTime;
    e.gEng.gain.cancelScheduledValues(t); e.gEng.gain.setTargetAtTime(0, t, 0.09); e.road.gain.setTargetAtTime(0, t, 0.08); e.bed.gain.setTargetAtTime(0, t, 0.15);
    e.sIdle.playbackRate.setTargetAtTime(e.prof.idleRate[0] * 0.55, t, 0.14); e.sRev.playbackRate.setTargetAtTime(e.prof.revRate[0] * 0.55, t, 0.14);
    const srcs = e.srcs; this.eng = null;
    setTimeout(() => { for (const s of srcs) { try { s.stop(); s.disconnect(); } catch { /* already stopped */ } } }, 700);
    this.hornOff(); this.scrapeOff(); setPlaybackSession(false);
  }
  get running() { return !!this.eng; }
  get rpm() { return this.eng?.rpm ?? 0; }

  /** Tyres on hard braking: the recorded squeal, louder and longer the harder. */
  brake(intensity: number) {
    if (intensity <= 0.05) return;
    const b = this.ready('brake', 0.9); if (!b) return;
    const buf = this.bank.get('squeal'); if (!buf) return;
    this.shot(b, 'squeal', { offset: Math.random() * (buf.duration - 1.2), dur: 0.4 + 0.5 * intensity, rate: 0.92 + Math.random() * 0.16, gain: 0.12 + 0.3 * intensity, hp: 500, attack: 0.03, release: 0.18 });
  }
  /**
   * A light tap (a soft bump of the body) or a real impact (a solid metallic hit, and for a heavy one a crash with its long tail), by the speed at the moment of contact. Layers of the recordings,
   * each picked a little differently every time (pitch, start) so that two hits never sound the same.
   */
  impact(speed: number) {
    const kind = impactKind(speed), b = this.ready(kind, kind === 'tap' ? 0.25 : 0.4); if (!b) return;
    const v = Math.abs(speed), j = (this.hitN = (this.hitN + 1) % 3), jit = [1, 0.93, 1.08][j] * (0.97 + Math.random() * 0.06);
    if (kind === 'tap') {
      this.shot(b, 'thud', { dur: 0.16, rate: 1.7 * jit, gain: 0.18 + 0.05 * v, hp: 110, release: 0.05 });
      this.shot(b, 'crash', { offset: 0.004 * j, dur: 0.05, rate: 1.5 * jit, gain: 0.06 + 0.02 * v, hp: 1400, release: 0.02 });
      return;
    }
    const k = Math.min(1, v / 14);
    this.shot(b, 'thud', { dur: 0.5, rate: 0.95 * jit, gain: 0.45 + 0.4 * k, lp: 2600, release: 0.2 });                                   // the body
    this.shot(b, 'crash', { offset: 0.006 * j, dur: 0.22 + 0.35 * k, rate: (0.98 + 0.12 * (1 - k)) * jit, gain: 0.3 + 0.45 * k, hp: 280, release: 0.15 });   // the metal
    if (k > 0.5) this.shot(b, 'crash', { at: b.ctx.currentTime + 0.05, offset: 0.12, dur: 0.5 + 0.8 * k, rate: 0.85 * jit, gain: 0.14 + 0.22 * k, lp: 3800, hp: 120, attack: 0.03, release: 0.4 });   // the long tail of a heavy one
  }
  /**
   * A scrape: the vehicle sliding along a wall or another vehicle. A continuous grind made of short overlapping grains cut from the middle of the recorded crash (the metal texture), at a pitch and
   * a level that follow `level` (0…1, the speed along the wall); it stops by itself when it is no longer asked for (a frame or two): called every frame while it lasts, never a new knock per frame.
   */
  scrape(level: number) {
    const b = this.open(); if (!b) return;
    const buf = this.bank.get('crash'); if (!buf) return;
    const c = b.ctx, t = c.currentTime, k = Math.max(0, Math.min(1, level));
    if (!this.scr) {
      const g = c.createGain(), hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 260; g.gain.value = 1; g.connect(hp).connect(b.gain);
      this.scr = { gain: g, bp: hp, srcs: [], next: 0 }; this.count.scrape++; this.count.asked++; this.count.played++;
    }
    if (t >= this.scr.next) {
      this.scr.next = t + 0.06;
      this.shot(b, 'crash', { offset: 0.35 + Math.random() * 0.8, dur: 0.12, rate: 0.85 + 0.35 * k + Math.random() * 0.1, gain: 0.07 + 0.2 * k, attack: 0.04, release: 0.06, dest: this.scr.gain });
    }
    this.scrLast = performance.now();
  }
  scrapeOff() {
    const s = this.scr; if (!s) return;
    this.scr = null;
    if (this.bus) s.gain.gain.setTargetAtTime(0, this.bus.ctx.currentTime, 0.04);
    setTimeout(() => { try { s.gain.disconnect(); } catch { /* done */ } }, 400);
  }
  get scraping() { return !!this.scr; }

  /** The horn, held: the recording of this kind of vehicle (HORNS), looped. Starts at once and goes on for as long as it is asked for; `hornOff` releases it. */
  hornOn(kit = 'sedan') {
    if (this.horn) return;
    const b = this.ready('horn', 0); if (!b) return;
    this.ensureSamples(b);
    this.hornWanted = kit;
    this.startHorn(b, kit);
  }
  private startHorn(b: Bus, kit: string) {
    if (this.horn) return;
    const v = hornFor(kit), buf = this.bank.get(v.sample); if (!buf) return;      // still decoding: started the moment it is ready (see `update`) if the button is still held
    const c = b.ctx, t = c.currentTime, s = c.createBufferSource(), hp = c.createBiquadFilter(), pk = c.createBiquadFilter(), lp = c.createBiquadFilter(), g = c.createGain();
    s.buffer = buf; s.loop = true; s.playbackRate.value = v.rate;
    hp.type = 'highpass'; hp.frequency.value = v.hp; pk.type = 'peaking'; pk.frequency.value = v.peakHz; pk.Q.value = 0.9; pk.gain.value = v.peakDb; lp.type = 'lowpass'; lp.frequency.value = 7000;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v.level, t + 0.012);
    s.connect(hp).connect(pk).connect(lp).connect(g).connect(b.gain); s.start(t, 0);
    this.horn = { gain: g, srcs: [s] };
  }
  hornOff() {
    this.hornWanted = null;
    const h = this.horn; if (!h || !this.bus) { this.horn = null; return; }
    this.horn = null;
    const t = this.bus.ctx.currentTime; h.gain.gain.cancelScheduledValues(t); h.gain.gain.setValueAtTime(h.gain.gain.value, t); h.gain.gain.setTargetAtTime(0, t, 0.02);
    setTimeout(() => { for (const o of h.srcs) { try { o.stop(); o.disconnect(); } catch { /* done */ } } }, 200);
  }
  get hornHeld() { return !!this.horn; }
  /** A far-off horn in the traffic bed: the recorded horn, very quiet, now and then. */
  private distantHorn() {
    const b = this.bus; if (!b || isMuted()) return;
    const f = 0.9 + Math.random() * 0.25;
    this.shot(b, 'horn-car', { dur: 0.3, rate: f, gain: 0.03, lp: 900, hp: 150, attack: 0.03, release: 0.1 });
  }

  /**
   * What the page is sending to the speaker right now (after the limiter and the sound setting): peak and rms in dBFS, and the share of the energy above 800 Hz (a phone speaker's range). The checks and the on-device diagnostics read it:
   * a number a person can quote, where « the counter went up » says nothing about what comes out. Null before the bus exists.
   */
  meter(): { peakDb: number; rmsDb: number; high: number; speakerDb: number; airDb: number } | null {
    const b = this.bus; if (!b) return null;
    if (!this.meterNode) { this.meterNode = b.ctx.createAnalyser(); this.meterNode.fftSize = 2048; this.meterNode.smoothingTimeConstant = 0; (audioMaster() ?? b.gain).connect(this.meterNode); }   // after the limiter and the sound setting: what is sent to the speaker
    const a = this.meterNode, td = new Float32Array(a.fftSize), fd = new Float32Array(a.frequencyBinCount);
    a.getFloatTimeDomainData(td); a.getFloatFrequencyData(fd);
    let peak = 0, sum = 0; for (const x of td) { const m = Math.abs(x); if (m > peak) peak = m; sum += x * x; }
    const hz = b.ctx.sampleRate / a.fftSize; let lo = 0, hi = 0, sp = 0, air = 0;
    fd.forEach((db, i) => { const p = Math.pow(10, db / 10); if (i * hz >= 800) hi += p; else lo += p; if (i * hz >= SPEAKER_HZ) sp += p; if (i * hz >= 1800 && i * hz <= 4500) air += p; });
    const dB = (x: number) => x > 1e-6 ? +(20 * Math.log10(x)).toFixed(1) : -120, rms = Math.sqrt(sum / td.length);
    // « speaker » level: the rms of only what a phone's loudspeaker can play (above SPEAKER_HZ): an engine's bass counts for little there, a horn's body for all of it
    return { peakDb: dB(peak), rmsDb: dB(rms), high: +(hi / Math.max(1e-12, hi + lo)).toFixed(2), speakerDb: dB(rms * Math.sqrt(sp / Math.max(1e-12, hi + lo))), airDb: dB(rms * Math.sqrt(air / Math.max(1e-12, hi + lo))) };
  }
  /** Review hook: a stream of what the page sends to the speaker (after the limiter and the sound setting), for the A/B recordings of the audio review (scripts/audio/render-clips.mjs). */
  captureStream(): MediaStream | null {
    const b = this.bus; if (!b) return null;
    const d = b.ctx.createMediaStreamDestination(); (audioMaster() ?? b.gain).connect(d); return d.stream;
  }
  /** Test hook: puts the context to sleep as a phone call or the lock screen does. */
  suspendForTest(): Promise<void> { return this.bus?.ctx.suspend() ?? Promise.resolve(); }
  /** A short test tone through the same path as the horn (the diagnostics' button): whether it was started. */
  beep(): boolean {
    const b = this.open(); if (!b) return false;
    const c = b.ctx, t = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.type = 'triangle'; o.frequency.value = 880; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.25, t + 0.02); g.gain.setValueAtTime(0.25, t + 0.3); g.gain.exponentialRampToValueAtTime(0.0008, t + 0.4);
    o.connect(g).connect(b.gain); o.start(t); o.stop(t + 0.42); return true;
  }

  info() { return { samples: { loaded: this.bank.loaded, failed: [...this.bank.failed], decoded: this.decoded }, count: { ...this.count }, running: !!this.eng, rpm: +(this.eng?.rpm ?? 0).toFixed(2), horn: !!this.horn, scraping: !!this.scr, gestured: hasGestured(), muted: isMuted(), state: this.bus?.ctx.state ?? 'none', session: sessionType(), nudges: this.nudges, nudgedBy: this.lastNudge }; }
}

export const vehicleAudio = new VehicleAudio();
