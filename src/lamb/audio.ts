/**
 * Synthesised percussion and crowd — TEMPORARY. The rhythm below is a generic placeholder pattern, not a
 * transcription of any sabar rhythm. Real recordings or validated rhythms replace it after review.
 */
import { isMuted, onMuteChange } from '../core/audioSettings';

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

function hit(c: AudioContext, when: number, freq: number, decay: number, gain: number, slap = false) {
  const o = c.createOscillator(), g = c.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(freq * (slap ? 1.8 : 1.2), when); o.frequency.exponentialRampToValueAtTime(freq, when + 0.04);
  g.gain.setValueAtTime(gain, when); g.gain.exponentialRampToValueAtTime(0.001, when + decay);
  o.connect(g).connect(out()); o.start(when); o.stop(when + decay + 0.02);
  if (slap) {
    const len = Math.floor(c.sampleRate * 0.05), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const n = c.createBufferSource(), ng = c.createGain(), f = c.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = 1800; n.buffer = buf; ng.gain.value = gain * 0.6;
    n.connect(f).connect(ng).connect(out()); n.start(when);
  }
}

// Placeholder 16-step pattern: 1 = low tone, 2 = open, 3 = slap.
const PATTERN = [1, 0, 3, 0, 2, 0, 3, 3, 1, 0, 3, 0, 2, 3, 0, 3];

export class Percussion {
  private timer = 0; private step = 0; private next = 0;
  playing = false;
  start(bpm = 118) {
    const c = ac(); if (!c || this.playing) return;
    this.playing = true; this.step = 0; this.next = c.currentTime + 0.05;
    const dur = 60 / bpm / 4;
    this.timer = window.setInterval(() => {
      while (this.next < c.currentTime + 0.12) {
        const v = PATTERN[this.step % PATTERN.length];
        if (v === 1) hit(c, this.next, 95, 0.25, 0.5);
        if (v === 2) hit(c, this.next, 180, 0.18, 0.35);
        if (v === 3) hit(c, this.next, 320, 0.08, 0.28, true);
        this.next += dur; this.step++;
      }
    }, 40);
  }
  stop() { clearInterval(this.timer); this.playing = false; }
}

/** Crowd swell: filtered noise with a short envelope. */
export function crowdCheer(seconds = 2.5, level = 0.18) {
  const c = ac(); if (!c) return;
  const len = Math.floor(c.sampleRate * seconds), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const n = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 0.7; n.buffer = buf;
  const t = c.currentTime;
  g.gain.setValueAtTime(0.001, t); g.gain.exponentialRampToValueAtTime(level, t + 0.4); g.gain.exponentialRampToValueAtTime(0.001, t + seconds);
  n.connect(f).connect(g).connect(out()); n.start(t);
}
