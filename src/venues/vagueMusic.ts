import { audioBus } from '../lamb/audio';
import { hasGestured, listenForGesture } from '../arena/exteriorAudio';
import { VAGUE_TRACK as T } from './vagueTrack';

/**
 * La Vague's music: the track of scripts/audio/render-vague.mjs (public/assets/audio/music/la-vague.mp3, its beat map in
 * src/venues/vagueTrack.ts) looped on the page's Web Audio graph — source → low-pass (heard through the fence and from
 * afar) → stereo pan → its own bus under the master gain (the sound setting mutes it with everything else).
 * The loop points come from the file's sync tick (each browser's MP3 decoder adds its own delay), so beat k of the music
 * is exactly k × 60 / bpm after the loop's start. `clock()` gives the beat the player HEARS now: the audio context's own
 * output timestamp (what reaches the speaker), not a page timer — the dance is judged on it (src/venues/dancePlay.ts).
 * Nothing is created before the player's first gesture; the bytes are fetched when the club's hub is loaded.
 */
export const BEAT = 60 / T.bpm;
export const LOOP_BEATS = T.bars * T.beatsPerBar;

interface Chain { ctx: AudioContext; bus: GainNode; lp: BiquadFilterNode; pan: StereoPannerNode | null; src: AudioBufferSourceNode; start: number; loopStart: number; delay: number }

export class VagueMusic {
  private bytes: Promise<ArrayBuffer | null> | null = null;
  private buf: AudioBuffer | null = null;
  private decoding: Promise<void> | null = null;
  private chain: Chain | null = null;
  private quietFor = 0;
  /** Fetch or decode failed: the club stays silent (its lights keep their own beat), nothing else is touched. */
  failed = false;
  /** What the venue asked for last (0…1 loudness, 0…1 muffled, −1…1 pan). */
  want = { level: 0, muffle: 0, pan: 0 };
  /** Debug: the decoder's delay found from the tick (s), and when the loop started on the context's clock. */
  get delay() { return this.chain?.delay ?? null; }

  constructor(private readonly base = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/') { listenForGesture(); }

  /** Starts fetching the file (once). */
  prefetch() {
    if (this.bytes || typeof fetch === 'undefined') return;
    this.bytes = fetch(`${this.base}${T.file}`).then(r => (r.ok ? r.arrayBuffer() : null)).catch(() => null);
  }

  /** Every frame: how loud (0…1), how muffled (0 clear … 1 far behind the fence), from which side. 0 fades out, then stops. */
  update(dt: number, level: number, muffle = 0, pan = 0) {
    this.want = { level, muffle, pan };
    if (level <= 0.001) {
      if (!this.chain) return;
      this.ramp(0, 0.4);
      this.quietFor += dt;
      if (this.quietFor > 2.5) this.stopChain();                        // silent a while: the source stops (the decoded track is kept)
      return;
    }
    this.quietFor = 0;
    if (!this.chain) { if (hasGestured()) this.begin(); return; }
    const c = this.chain, t = c.ctx.currentTime;
    this.ramp(level, 0.35);
    c.lp.frequency.setTargetAtTime(18000 * Math.pow(400 / 18000, Math.max(0, Math.min(1, muffle))), t, 0.25);
    c.pan?.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)), t, 0.25);
  }

  /** Starts the music now if it can (a dance asks for it right after the player's tap: the context may start). */
  ensure() { if (!this.chain && this.want.level > 0) this.begin(); }

  private ramp(level: number, tc: number) {
    const c = this.chain; if (!c) return;
    c.bus.gain.setTargetAtTime(level * 0.62, c.ctx.currentTime, tc);
  }

  private begin() {
    if (this.failed || this.decoding) return;
    const b = audioBus(); if (!b) { this.failed = true; return; }
    this.prefetch();
    const ctx = b.ctx;
    this.decoding = (async () => {
      try {
        if (!this.buf) {
          const bytes = await this.bytes;
          if (!bytes) throw new Error('not fetched');
          this.buf = await ctx.decodeAudioData(bytes.slice(0));
        }
        if (this.want.level <= 0.001) { b.gain.disconnect(); return; }
        this.startChain(ctx, b.gain, this.buf);
      } catch { this.failed = true; b.gain.disconnect(); }
      finally { this.decoding = null; }
    })();
  }

  /** The loop's start in the decoded buffer: where the tick landed, minus where it is in the file. */
  static loopPoints(buf: AudioBuffer): { start: number; delay: number } {
    const x = buf.getChannelData(0), sr = buf.sampleRate, lim = Math.min(x.length, Math.round(sr * 1.2));
    let at = -1;
    for (let i = 0; i < lim; i++) if (Math.abs(x[i]) > 0.12) { at = i; break; }
    const delay = at < 0 ? 0 : at / sr - T.tickSample / T.sampleRate;
    return { start: T.loopStart + delay, delay };
  }

  private startChain(ctx: AudioContext, bus: GainNode, buf: AudioBuffer) {
    const { start: loopStart, delay } = VagueMusic.loopPoints(buf);
    const src = ctx.createBufferSource(), lp = ctx.createBiquadFilter();
    src.buffer = buf; src.loop = true; src.loopStart = loopStart; src.loopEnd = loopStart + T.loop;
    lp.type = 'lowpass'; lp.Q.value = 0.5; lp.frequency.value = 18000;
    const pan = typeof ctx.createStereoPanner === 'function' ? ctx.createStereoPanner() : null;
    src.connect(lp);
    if (pan) lp.connect(pan).connect(bus); else lp.connect(bus);
    bus.gain.value = 0;
    const start = ctx.currentTime + 0.08;
    src.start(start, loopStart);
    this.chain = { ctx, bus, lp, pan, src, start, loopStart, delay };
    this.ramp(this.want.level, 0.5);
  }

  private stopChain() {
    const c = this.chain; if (!c) return;
    this.chain = null;
    try { c.src.stop(); } catch { /* already stopped */ }
    c.src.disconnect(); c.bus.disconnect();
  }

  get playing() { return !!this.chain && this.chain.ctx.state === 'running'; }

  /**
   * Seconds of music the player has heard since beat 0 of the loop (unwrapped: it keeps counting over the loops), at the
   * page time `perfNow` (ms, performance.now(), or an event's timeStamp). From the context's output timestamp: the sample
   * leaving for the speaker at that moment. Null when the music is not playing.
   */
  heard(perfNow = performance.now()): number | null {
    const c = this.chain; if (!c || c.ctx.state !== 'running') return null;
    const ctx = c.ctx;
    let t: number;
    const ts = typeof ctx.getOutputTimestamp === 'function' ? ctx.getOutputTimestamp() : null;
    if (ts && ts.contextTime && ts.performanceTime) t = ts.contextTime + Math.max(-0.05, Math.min(0.25, (perfNow - ts.performanceTime) / 1000));
    else t = ctx.currentTime - (ctx.outputLatency || 0) - (ctx.baseLatency || 0) + (perfNow - performance.now()) / 1000;
    return t - c.start;
  }

  /** The beat heard now (unwrapped, fractional), or null. */
  beat(perfNow?: number): number | null { const h = this.heard(perfNow); return h === null ? null : h / BEAT; }

  /** For the checks and the debug panel. */
  info() {
    const c = this.chain, h = this.heard();
    return {
      file: T.file, bpm: T.bpm, loop: T.loop, decoded: !!this.buf, failed: this.failed, playing: this.playing, gestured: hasGestured(),
      level: +this.want.level.toFixed(3), muffle: +this.want.muffle.toFixed(3), pan: +this.want.pan.toFixed(2),
      gain: c ? +c.bus.gain.value.toFixed(3) : 0, cutoff: c ? Math.round(c.lp.frequency.value) : null,
      decoderDelay: c ? +c.delay.toFixed(4) : null, loopStart: c ? +c.loopStart.toFixed(4) : null, sampleRate: this.buf?.sampleRate ?? null,
      heard: h === null ? null : +h.toFixed(3), beat: h === null ? null : +(h / BEAT).toFixed(3),
      latency: c ? { base: c.ctx.baseLatency ?? null, output: c.ctx.outputLatency ?? null } : null,
    };
  }

  dispose() { this.stopChain(); this.buf = null; this.bytes = null; }
}
