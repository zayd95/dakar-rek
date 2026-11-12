/**
 * The làmb's sound: the page's audio context and master gain (the sound setting), the strikes of a bout, the
 * announcer's chime — and the drums and the crowd's cheers, which are the authored loops and one-shots of the arena
 * (src/arena/soundscape.ts registers them here with `useLambSounds`; files in public/assets/audio/arena/, made by
 * scripts/audio/render-arena.mjs). Before they are loaded a cheer is silent and the drums wait: no synthetic noise.
 */
import { isMuted, onMuteChange } from '../core/audioSettings';
import { standsGain } from '../arena/hearing';

let ctx: AudioContext | null = null;
/** Master gain: the sound setting (phone › Réglages) mutes everything at once. */
let master: GainNode | null = null;
function ac(): AudioContext | null {
  try { ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)(); } catch { return null; }
  if (!master) {
    master = ctx.createGain(); master.gain.value = isMuted() ? 0 : 1; master.connect(ctx.destination);
    onMuteChange(m => { if (ctx && master) master.gain.setValueAtTime(m ? 0 : 1, ctx.currentTime); });
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}
const out = () => master!;
/**
 * A bus of its own under the master gain (silent until its gain is raised): a sound placed in the world (the drummers
 * outside the arena…) gets its own loudness by distance. Null when audio is unavailable.
 */
/** The master gain itself (after the sound setting), for a module that puts its own chain (a limiter) in front of it. Null when audio is unavailable. */
export function audioMaster(): GainNode | null { return ac() ? master : null; }
export function audioBus(): { ctx: AudioContext; gain: GainNode } | null {
  const c = ac(); if (!c) return null;
  const g = c.createGain(); g.gain.value = 0; g.connect(out());
  return { ctx: c, gain: g };
}

function hit(c: AudioContext, when: number, freq: number, decay: number, gain: number, slap = false, dest: AudioNode = out()) {
  const o = c.createOscillator(), g = c.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(freq * (slap ? 1.8 : 1.2), when); o.frequency.exponentialRampToValueAtTime(freq, when + 0.04);
  g.gain.setValueAtTime(gain, when); g.gain.exponentialRampToValueAtTime(0.001, when + decay);
  o.connect(g).connect(dest); o.start(when); o.stop(when + decay + 0.02);
  if (slap) {
    const len = Math.floor(c.sampleRate * 0.05), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const n = c.createBufferSource(), ng = c.createGain(), f = c.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = 1800; n.buffer = buf; ng.gain.value = gain * 0.6;
    n.connect(f).connect(ng).connect(dest); n.start(when);
  }
}

export type Rhythm = 'gala' | 'bakk';
/** A bout's or a scene's own drums, as the arena's sound plays them. */
export interface LambDrums { setRhythm(r: Rhythm): void; stop(): void }
/** What src/arena/soundscape.ts provides: the stands' cheers and the drummers (null until it is loaded). */
export interface LambSounds { cheer(seconds: number, level: number): boolean; drums(bpm: number): LambDrums }
let sounds: LambSounds | null = null;
export function useLambSounds(s: LambSounds) { sounds = s; }

/**
 * The drummers of a bout or of a cinematic scene (src/lamb/duel.ts, src/lamb/scenes.ts): the arena's authored sabar loops
 * (the tempo picks one: the fête's fastest, the bout's, the entrance's), never two ensembles at once — while the arena's
 * own drummers are heard (a fight evening) these wait. `dest` is no longer used (kept for the callers).
 */
export class Percussion {
  private h: LambDrums | null = null;
  private rhythmNow: Rhythm = 'gala';
  playing = false;
  /** The rhythm being played (a bàkk's or the evening's). */
  get rhythm() { return this.rhythmNow; }
  setRhythm(r: Rhythm) { this.rhythmNow = r; this.h?.setRhythm(r); }
  constructor(_dest?: AudioNode) {}
  start(bpm = 118) {
    if (this.playing) return;
    ac(); this.playing = true; this.h = sounds?.drums(bpm) ?? null; this.h?.setRhythm(this.rhythmNow);
  }
  stop() { this.h?.stop(); this.h = null; this.playing = false; }
}

/** Làmb 2.0: the sound of a strike landing — a dull thud on a hit, a slap on a guard, a short swish on a miss. */
export function strikeSound(kind: 'quick' | 'big', result: 'hit' | 'stagger' | 'guarded' | 'miss') {
  const c = ac(); if (!c) return;
  const k = standsGain(); if (k <= 0.005) return;                         // a watched bout behind the walls is not heard across the city
  const t = c.currentTime + 0.01, big = kind === 'big';
  if (result === 'hit' || result === 'stagger') hit(c, t, big ? 62 : 85, big ? 0.22 : 0.12, (big ? 0.7 : 0.45) * k, true);
  else if (result === 'guarded') hit(c, t, big ? 160 : 240, 0.07, (big ? 0.4 : 0.25) * k, true);
  else {
    const len = Math.floor(c.sampleRate * 0.12), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.sin((Math.PI * i) / len);
    const n = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'bandpass'; f.frequency.value = big ? 700 : 1100; n.buffer = buf; g.gain.value = (big ? 0.18 : 0.1) * k;
    n.connect(f).connect(g).connect(out()); n.start(t);
  }
}

/** The stands cheer (`seconds` long, `level` 0..~0.3): the arena's authored one-shots, by the moment that called it (src/arena/soundscape.ts). */
export function crowdCheer(seconds = 2.5, level = 0.18) {
  if (!ac()) return;
  sounds?.cheer(seconds, level);
}

/**
 * The arena's public address before a line on the microphone (the announcer, a griot): two soft tones and a short
 * hum, as loud as the stands are heard where the player is; silent with the sound off.
 */
export function paChime(level = 0.05) {
  const c = ac(); if (!c) return;
  level *= standsGain(); if (level <= 0.001) return;                      // the arena's microphone is heard there, not across the city
  const t = c.currentTime;
  for (const [f, at] of [[660, 0], [880, 0.22]] as const) {
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t + at); g.gain.exponentialRampToValueAtTime(level, t + at + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.32);
    o.connect(g).connect(out()); o.start(t + at); o.stop(t + at + 0.35);
  }
  const h = c.createOscillator(), hg = c.createGain();
  h.type = 'sawtooth'; h.frequency.value = 110;
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400;
  hg.gain.setValueAtTime(0.0001, t + 0.5); hg.gain.exponentialRampToValueAtTime(level * 0.25, t + 0.6); hg.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
  h.connect(lp).connect(hg).connect(out()); h.start(t + 0.5); h.stop(t + 1.35);
}
