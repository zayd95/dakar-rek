import { audioBus } from '../lamb/audio';
import { isMuted } from '../core/audioSettings';
import { hasGestured } from '../arena/exteriorAudio';

/**
 * The sounds of the gala road (synthesised, no audio file): a car's horn from the jam, a car rapide's three-note toot,
 * the traffic agent's whistle. Each is a short burst on its own bus under the master gain (the sound setting mutes it),
 * at the loudness of its distance (src/city/galaRules.ts hornVolume). Nothing plays before the player's first gesture
 * (browsers only let an AudioContext play after one), with the sound off, or indoors.
 */
export type GalaSound = 'car' | 'rapide' | 'whistle';
export class GalaAudio {
  /** Bursts asked for and bursts played (the checks: horns are heard only after a gesture). */
  readonly count = { asked: 0, played: 0, car: 0, rapide: 0, whistle: 0 };
  private bus: { ctx: AudioContext; gain: GainNode } | null = null;

  play(kind: GalaSound, volume: number) {
    this.count.asked++; this.count[kind]++;
    if (volume <= 0.01 || isMuted() || !hasGestured()) return;
    this.bus ??= audioBus();
    const b = this.bus; if (!b) return;
    const c = b.ctx, t = c.currentTime, g = c.createGain();
    b.gain.gain.value = 1;
    g.gain.value = 0; g.connect(b.gain);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = kind === 'whistle' ? 6000 : 1900; lp.connect(g);
    const tone = (f: number, at: number, dur: number, type: OscillatorType, peak: number) => {
      const o = c.createOscillator(), e = c.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t + at);
      e.gain.setValueAtTime(0, t + at); e.gain.linearRampToValueAtTime(peak, t + at + 0.015); e.gain.setValueAtTime(peak, t + at + dur - 0.03); e.gain.linearRampToValueAtTime(0, t + at + dur);
      o.connect(e).connect(lp); o.start(t + at); o.stop(t + at + dur + 0.02);
      return o;
    };
    if (kind === 'car') {                                                   // two detuned reeds, a long press
      const long = 0.28 + (this.count.car % 3) * 0.12;
      tone(392, 0, long, 'square', 0.16); tone(494, 0, long, 'square', 0.13);
    } else if (kind === 'rapide') {                                         // tiit-tiit-tuuut, the car rapide's call
      for (const [f, at, dur] of [[660, 0, 0.12], [660, 0.18, 0.12], [523, 0.36, 0.34]] as const) { tone(f, at, dur, 'sawtooth', 0.11); tone(f * 1.5, at, dur, 'square', 0.04); }
    } else {                                                                // two blasts of the agent's whistle, trilled
      for (const [at, dur] of [[0, 0.22], [0.3, 0.5]] as const) {
        const o = tone(2900, at, dur, 'sine', 0.2), lfo = c.createOscillator(), depth = c.createGain();
        lfo.frequency.value = 28; depth.gain.value = 140; lfo.connect(depth).connect(o.frequency); lfo.start(t + at); lfo.stop(t + at + dur + 0.02);
      }
    }
    g.gain.setValueAtTime(Math.min(1, volume) * 0.9, t);
    setTimeout(() => g.disconnect(), 1500);
    this.count.played++;
  }

  dispose() { this.bus?.gain.disconnect(); this.bus = null; }
}
