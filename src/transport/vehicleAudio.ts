import { audioBus } from '../lamb/audio';
import { isMuted } from '../core/audioSettings';
import { hasGestured, listenForGesture } from '../arena/exteriorAudio';

/**
 * The sounds of a vehicle the player drives (synthesised, no audio file; TEMPORARY like the rest of the city's sound): door, engine start, idle, an engine
 * that rises and falls with the speed through its gears, brake squeal, a tap or a real impact, the horn, and a very low bed of Dakar traffic while driving.
 * Few layers on purpose (two oscillators, two filtered noises, one-shots), all under the page's master gain: the sound setting (phone › Réglages) mutes
 * it, and nothing plays before the player's first tap or key (an iPhone only lets a page play after one: the first gesture creates and resumes the context).
 * Pure helpers (`rpmOf`, `impactKind`, `brakeIntensity`) carry the rules and are unit-tested.
 */
export interface EngineProfile {
  /** Firing frequency at idle and the span up to the rev limit (Hz). */
  base: number; span: number;
  /** The sub-octave's weight (a bigger engine is thicker) and the filter's opening (Hz at mid revs). */
  sub: number; cutoff: number;
  /** Gears: the revs fall each time the car passes a gear's top. */
  gears: number;
  /** Overall level of this engine. */
  level: number;
}
export const PROFILES: Record<'sedan' | 'luxury' | 'suv' | 'moto', EngineProfile> = {
  sedan: { base: 34, span: 105, sub: 0.55, cutoff: 700, gears: 4, level: 1 },
  luxury: { base: 28, span: 95, sub: 0.8, cutoff: 560, gears: 5, level: 0.95 },
  suv: { base: 26, span: 88, sub: 0.9, cutoff: 520, gears: 4, level: 1 },
  moto: { base: 62, span: 190, sub: 0.25, cutoff: 1500, gears: 4, level: 0.9 },
};
export const profileFor = (kit: string): EngineProfile => PROFILES[(kit in PROFILES ? kit : 'sedan') as keyof typeof PROFILES];

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

type Bus = { ctx: AudioContext; gain: GainNode };
let noiseBuf: AudioBuffer | null = null;
const noise = (c: AudioContext) => noiseBuf ??= (() => { const b = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; })();

class VehicleAudio {
  /** Sounds asked for and played, by kind (the checks: nothing before a gesture, nothing when muted). */
  readonly count: Record<string, number> = { asked: 0, played: 0, door: 0, start: 0, brake: 0, tap: 0, impact: 0, horn: 0, unlock: 0 };
  private bus: Bus | null = null;
  private eng: { prof: EngineProfile; o1: OscillatorNode; o2: OscillatorNode; lp: BiquadFilterNode; gEng: GainNode; road: GainNode; roadF: BiquadFilterNode; bed: GainNode; srcs: AudioScheduledSourceNode[]; rpm: number; ready: number } | null = null;
  private horn: { gain: GainNode; oscs: OscillatorNode[] } | null = null;
  private lastShot = new Map<string, number>();
  private bedTimer = 0;
  private unlocked = false;

  /** First tap or key: create and resume the audio context inside the gesture (iPhone Safari). Idempotent. */
  unlockOnGesture() {
    if (this.unlocked || typeof window === 'undefined') return;
    this.unlocked = true; listenForGesture();
    const go = () => { try { this.bus ??= audioBus(); void this.bus?.ctx.resume(); } catch { /* no audio on this device */ } for (const t of ['pointerdown', 'touchend', 'keydown']) window.removeEventListener(t, go, true); };
    for (const t of ['pointerdown', 'touchend', 'keydown']) window.addEventListener(t, go, { capture: true, passive: true });
  }

  /** The bus, when sound may play (a gesture was made, the sound setting is on). */
  private open(): Bus | null {
    if (isMuted() || !hasGestured()) return null;
    try { this.bus ??= audioBus(); } catch { return null; }
    const b = this.bus; if (!b) return null;
    if (b.ctx.state === 'suspended') void b.ctx.resume();
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

  /** Engine start: a stuttering crank that catches (the loop's own fade-in follows it). Returns the seconds until it catches. */
  start(prof: EngineProfile): number {
    const b = this.ready('start', 0.5); if (!b) return 0;
    const c = b.ctx, t = c.currentTime, o = c.createOscillator(), lp = c.createBiquadFilter(), g = c.createGain();
    o.type = 'sawtooth'; lp.type = 'lowpass'; lp.frequency.value = 420;
    const steps = [16, 21, 15, 23, 18, 28, 44, prof.base];
    steps.forEach((f, i) => o.frequency.setValueAtTime(f * (prof.base / 34), t + i * 0.085));
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.1 * prof.level, t + 0.05); g.gain.setValueAtTime(0.1 * prof.level, t + 0.6); g.gain.exponentialRampToValueAtTime(0.0008, t + 0.8);
    o.connect(lp).connect(g).connect(b.gain); o.start(t); o.stop(t + 0.85);
    return 0.55;
  }

  /** The engine loop and the traffic bed: on while driving. */
  run(prof: EngineProfile, delay = 0) {
    if (this.eng) return;
    const b = this.open(); if (!b) return;
    const c = b.ctx, t = c.currentTime;
    const o1 = c.createOscillator(), o2 = c.createOscillator(), lp = c.createBiquadFilter(), gEng = c.createGain(), mix2 = c.createGain();
    o1.type = 'sawtooth'; o2.type = 'square'; lp.type = 'lowpass'; lp.Q.value = 0.8; mix2.gain.value = prof.sub;
    gEng.gain.value = 0;
    o1.connect(lp); o2.connect(mix2).connect(lp); lp.connect(gEng).connect(b.gain);
    const n1 = c.createBufferSource(), roadF = c.createBiquadFilter(), road = c.createGain();
    n1.buffer = noise(c); n1.loop = true; roadF.type = 'bandpass'; roadF.frequency.value = 400; roadF.Q.value = 0.6; road.gain.value = 0;
    n1.connect(roadF).connect(road).connect(b.gain);
    const n2 = c.createBufferSource(), bedF = c.createBiquadFilter(), bed = c.createGain(), lfo = c.createOscillator(), lfoG = c.createGain();
    n2.buffer = noise(c); n2.loop = true; bedF.type = 'lowpass'; bedF.frequency.value = 330; bed.gain.value = 0;
    lfo.frequency.value = 0.09; lfoG.gain.value = 0.006; lfo.connect(lfoG).connect(bed.gain);
    n2.connect(bedF).connect(bed).connect(b.gain);
    const f0 = prof.base;
    o1.frequency.value = f0; o2.frequency.value = f0 / 2;
    for (const s of [o1, o2, n1, n2, lfo]) s.start(t + delay);
    gEng.gain.setTargetAtTime(0.1 * prof.level, t + delay, 0.12);
    bed.gain.setTargetAtTime(0.011, t + delay + 0.5, 0.8);
    this.eng = { prof, o1, o2, lp, gEng, road, roadF, bed, srcs: [o1, o2, n1, n2, lfo], rpm: 0.15, ready: t + delay };
    this.bedTimer = 7 + Math.random() * 8;
  }

  /** Each frame while driving: revs follow the speed and the throttle, tyre noise follows the speed, the bed stays very low (and ducks under the horn). */
  update(dt: number, speed: number, maxSpeed: number, throttle: number) {
    const e = this.eng; if (!e || !this.bus) return;
    const c = this.bus.ctx, t = c.currentTime;
    const want = rpmOf(speed, maxSpeed, e.prof.gears, throttle);
    e.rpm += (want - e.rpm) * Math.min(1, dt * (want > e.rpm ? 5 : 3));
    const f = e.prof.base + e.prof.span * e.rpm;
    e.o1.frequency.setTargetAtTime(f, t, 0.04); e.o2.frequency.setTargetAtTime(f / 2, t, 0.04);
    e.lp.frequency.setTargetAtTime(e.prof.cutoff * (0.55 + 1.3 * e.rpm), t, 0.06);
    const load = 0.06 + 0.09 * e.rpm + 0.05 * Math.max(0, throttle);
    e.gEng.gain.setTargetAtTime(Math.min(0.2, load) * e.prof.level, t, 0.06);
    const v = Math.min(1, Math.abs(speed) / Math.max(0.1, maxSpeed));
    e.road.gain.setTargetAtTime(0.035 * v * v * (e.prof === PROFILES.moto ? 1.3 : 1), t, 0.1); e.roadF.frequency.setTargetAtTime(260 + 900 * v, t, 0.1);
    e.bed.gain.setTargetAtTime(this.horn ? 0.002 : 0.011, t, 0.2);
    if ((this.bedTimer -= dt) <= 0) { this.bedTimer = 12 + Math.random() * 14; this.distantHorn(); }
  }

  /** The engine stops (a short fall of the revs). */
  stop() {
    const e = this.eng; if (!e || !this.bus) { this.eng = null; return; }
    const c = this.bus.ctx, t = c.currentTime;
    e.gEng.gain.cancelScheduledValues(t); e.gEng.gain.setTargetAtTime(0, t, 0.09); e.road.gain.setTargetAtTime(0, t, 0.08); e.bed.gain.setTargetAtTime(0, t, 0.15);
    e.o1.frequency.setTargetAtTime(e.prof.base * 0.6, t, 0.12); e.o2.frequency.setTargetAtTime(e.prof.base * 0.3, t, 0.12);
    const srcs = e.srcs; this.eng = null;
    setTimeout(() => { for (const s of srcs) { try { s.stop(); s.disconnect(); } catch { /* already stopped */ } } }, 700);
    this.hornOff();
  }
  get running() { return !!this.eng; }
  get rpm() { return this.eng?.rpm ?? 0; }

  /** Tyres on hard braking: a squeal, louder the harder. */
  brake(intensity: number) {
    if (intensity <= 0.05) return;
    const b = this.ready('brake', 0.9); if (!b) return;
    const t = b.ctx.currentTime;
    this.burst(b, t, 0.4, 2300, 9, 0.025 + 0.06 * intensity); this.burst(b, t + 0.03, 0.34, 3100, 12, 0.012 + 0.03 * intensity);
  }
  /** A light tap (a soft bump) or a real impact (a crunch, a boom, a metallic ring), by the speed at the moment of contact. */
  impact(speed: number) {
    const kind = impactKind(speed), b = this.ready(kind, kind === 'tap' ? 0.25 : 0.4); if (!b) return;
    const t = b.ctx.currentTime, v = Math.abs(speed);
    if (kind === 'tap') { this.thud(b, t, 150, 0.09, 0.12 + 0.03 * v); this.burst(b, t, 0.05, 800, 1, 0.05); return; }
    const k = Math.min(1, v / 14);
    this.thud(b, t, 58, 0.4, 0.3 + 0.3 * k); this.burst(b, t, 0.22, 1100, 0.7, 0.14 + 0.16 * k);
    for (const [f, d] of [[420, 0.3], [637, 0.22]] as const) { const o = b.ctx.createOscillator(), g = b.ctx.createGain(); o.type = 'triangle'; o.frequency.value = f; g.gain.setValueAtTime(0.05 + 0.06 * k, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0008, t + d); o.connect(g).connect(b.gain); o.start(t); o.stop(t + d + 0.02); }
  }
  /** The horn, held (two reeds for a car, one for a motorbike). */
  hornOn(moto = false) {
    if (this.horn) return;
    const b = this.ready('horn', 0); if (!b) return;
    const c = b.ctx, g = c.createGain(), lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 1900; g.gain.setValueAtTime(0, c.currentTime); g.gain.linearRampToValueAtTime(0.14, c.currentTime + 0.02);
    const oscs = (moto ? [740] : [392, 494]).map(f => { const o = c.createOscillator(); o.type = 'square'; o.frequency.value = f; o.connect(lp); o.start(); return o; });
    lp.connect(g).connect(b.gain); this.horn = { gain: g, oscs };
  }
  hornOff() {
    const h = this.horn; if (!h || !this.bus) { this.horn = null; return; }
    this.horn = null;
    const t = this.bus.ctx.currentTime; h.gain.gain.cancelScheduledValues(t); h.gain.gain.setTargetAtTime(0, t, 0.02);
    setTimeout(() => { for (const o of h.oscs) { try { o.stop(); o.disconnect(); } catch { /* done */ } } }, 160);
  }
  /** A far-off horn in the traffic bed: very quiet, now and then. */
  private distantHorn() {
    const b = this.bus; if (!b || isMuted()) return;
    const c = b.ctx, t = c.currentTime, g = c.createGain(), lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 900; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.012, t + 0.03); g.gain.setValueAtTime(0.012, t + 0.2); g.gain.linearRampToValueAtTime(0, t + 0.3);
    for (const f of [350 + Math.random() * 80, 440 + Math.random() * 60]) { const o = c.createOscillator(); o.type = 'square'; o.frequency.value = f; o.connect(lp); o.start(t); o.stop(t + 0.32); }
    lp.connect(g).connect(b.gain);
  }

  info() { return { count: { ...this.count }, running: !!this.eng, rpm: +(this.eng?.rpm ?? 0).toFixed(2), horn: !!this.horn, gestured: hasGestured(), muted: isMuted(), state: this.bus?.ctx.state ?? 'none' }; }
}

export const vehicleAudio = new VehicleAudio();
