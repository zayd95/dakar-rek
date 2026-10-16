import { audioBus, Percussion, type Rhythm } from '../lamb/audio';

/**
 * The sound of a fight evening outside the arena: the drummers by the gate and a soft crowd murmur near the queue.
 * The drums are the synthesised percussion of src/lamb/audio.ts — a generic PLACEHOLDER pattern, not a transcription of
 * any sabar rhythm; real recordings or validated rhythms replace it after review. No audio files.
 * Loudness comes from src/arena/exteriorRules.ts (distance, interiors, the sound setting); the master gain of
 * src/lamb/audio.ts also follows the sound setting. Nothing is created before the player's first tap, click or key
 * (browsers only let an AudioContext play after a user gesture).
 */
let gestured = false;
let listening = false;
/** Whether the player has tapped, clicked or pressed a key yet (sound may only start after that). */
export const hasGestured = () => gestured;
let rhythm: Rhythm = 'gala';
/** The evening's drums change rhythm for a wrestler's bàkk (src/arena/ceremony.ts), then go back ('gala'). */
export function drumRhythm(r?: Rhythm): Rhythm { if (r) rhythm = r; return rhythm; }
/** Watches for the first user gesture (once per page). */
export function listenForGesture() {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  const on = () => { gestured = true; };
  for (const type of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(type, on, { once: true, capture: true, passive: true });
}

export class ExteriorAudio {
  private drums: { gain: GainNode; perc: Percussion } | null = null;
  private murmur: { gain: GainNode; src: AudioBufferSourceNode } | null = null;
  /** Loudness asked for (0..1 each), whatever the audio state. */
  level = { drums: 0, murmur: 0 };

  /** Called every frame with the loudness of each sound; both at 0 stops everything. */
  set(drums: number, murmur: number) {
    this.level = { drums, murmur };
    if (drums <= 0 && murmur <= 0) { this.stop(); return; }
    if (!gestured) return;
    if (!this.drums) this.start();
    if (!this.drums || !this.murmur) return;
    if (this.drums.perc.rhythm !== rhythm) this.drums.perc.setRhythm(rhythm);
    const t = this.drums.gain.context.currentTime;
    this.drums.gain.gain.setTargetAtTime(drums * 0.8, t, 0.15);
    this.murmur.gain.gain.setTargetAtTime(murmur * 0.22, t, 0.3);
  }

  private start() {
    const d = audioBus(), m = audioBus();
    if (!d || !m) return;
    const perc = new Percussion(d.gain);
    perc.start(112);
    // murmur: two seconds of noise, looped, through a low band (voices far off)
    const c = m.ctx, len = Math.floor(c.sampleRate * 2), buf = c.createBuffer(1, len, c.sampleRate), data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = last * 0.96 + (Math.random() * 2 - 1) * 0.04; data[i] = last * 6; }
    const src = c.createBufferSource(), band = c.createBiquadFilter();
    src.buffer = buf; src.loop = true; band.type = 'bandpass'; band.frequency.value = 520; band.Q.value = 0.6;
    src.connect(band).connect(m.gain); src.start();
    this.drums = { gain: d.gain, perc };
    this.murmur = { gain: m.gain, src };
  }

  stop() {
    if (this.drums) { this.drums.perc.stop(); this.drums.gain.disconnect(); this.drums = null; }
    if (this.murmur) { try { this.murmur.src.stop(); } catch { /* already stopped */ } this.murmur.gain.disconnect(); this.murmur = null; }
  }

  /** For the checks: what is playing and how loud (the gains' targets). */
  info() {
    return {
      gestured, playing: !!this.drums?.perc.playing, murmuring: !!this.murmur, rhythm: this.drums?.perc.rhythm ?? rhythm,
      drums: this.drums ? this.level.drums : 0, murmur: this.murmur ? this.level.murmur : 0,
      context: this.drums?.gain.context.state ?? null,
    };
  }
}
