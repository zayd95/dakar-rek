/**
 * Frame times measured on the player's own device (docs/beta/IPHONE_PLAYTEST.md): « Mesure de fluidité » in the phone's Réglages. Off by default,
 * kept in localStorage (never in the save). While it is on, every frame's duration is filed under where the player is (the district, and on foot,
 * at the wheel or inside a home); « Signaler un problème » then adds one line per place to the report, so a tester's message carries real numbers.
 * Off, the cost is one boolean test per frame. Nothing is sent anywhere.
 */
const KEY = 'dakarrek.fps';
const BINS = 121;                                          // 1 ms bins, the last one « 120 ms and more »
/** A frame longer than this is a hitch the player feels. */
export const HITCH_MS = 50;
/** A gap longer than this is a hidden tab or a paused game, not a frame: it is left out. */
const GAP_MS = 2000;

export interface FrameBucket { key: string; frames: number; ms: number; worst: number; hitches: number; hist: Uint32Array; calls: number; tris: number }

const store = () => { try { return window.localStorage; } catch { return null; } };

export class FrameStats {
  private buckets = new Map<string, FrameBucket>();
  private last = 0;
  private lastKey = '';
  private on = false;
  /** The device's own GPU name where the browser says it (WEBGL_debug_renderer_info), for the report. */
  gpu = '';
  constructor(readInitial = true) { if (readInitial) this.on = (() => { try { return store()?.getItem(KEY) === 'on'; } catch { return false; } })(); }

  get enabled(): boolean { return this.on; }
  setEnabled(on: boolean) {
    this.on = on; this.last = 0;
    try { if (on) store()?.setItem(KEY, 'on'); else store()?.removeItem(KEY); } catch { /* session only */ }
  }

  /** One frame, at `now` (ms, the animation frame's timestamp), in the place `key`, with the last render's draw calls and triangles. */
  tick(now: number, key: string, calls = 0, tris = 0) {
    const dt = this.last ? now - this.last : 0; this.last = now;
    if (dt <= 0 || dt > GAP_MS) return;
    let b = this.buckets.get(key);
    if (!b) { b = { key, frames: 0, ms: 0, worst: 0, hitches: 0, hist: new Uint32Array(BINS), calls: 0, tris: 0 }; this.buckets.set(key, b); }
    b.frames++; b.ms += dt; if (dt > b.worst) b.worst = dt; if (dt > HITCH_MS) b.hitches++;
    b.hist[Math.min(BINS - 1, Math.floor(dt))]++;
    if (calls > b.calls) b.calls = calls; if (tris > b.tris) b.tris = tris;
    this.lastKey = key;
  }

  /** The duration under which `share` (0…1) of the place's frames fall. */
  percentile(b: FrameBucket, share: number): number {
    const want = Math.ceil(b.frames * share); let seen = 0;
    for (let i = 0; i < BINS; i++) { seen += b.hist[i]; if (seen >= want) return i + 1; }
    return BINS;
  }

  /** The place the last frame was filed under, with its figures (the little on-screen meter). */
  current(): { key: string; fps: number; p95: number } | null {
    const b = this.buckets.get(this.lastKey); if (!b || b.frames < 5) return null;
    return { key: b.key, fps: Math.round((b.frames * 1000) / b.ms), p95: this.percentile(b, 0.95) };
  }

  /** One line per place, the busiest first; places with fewer than 30 frames are too short to say anything. */
  lines(): string[] {
    return [...this.buckets.values()].filter(b => b.frames >= 30).sort((a, b) => b.frames - a.frames).map(b => {
      const secs = Math.round(b.ms / 1000), fps = Math.round((b.frames * 1000) / b.ms);
      return `${b.key} : ${fps} images/s en moyenne · 95 % des images sous ${this.percentile(b, 0.95)} ms · pire ${Math.round(b.worst)} ms · ${b.hitches} à-coups (> ${HITCH_MS} ms) · jusqu’à ${b.calls} appels et ${Math.round(b.tris / 1000)} k triangles · ${secs} s mesurées`;
    });
  }

  /** What the report carries: a title, the GPU, then the lines (nothing when the meter was never on). */
  reportLines(): string[] {
    const l = this.lines();
    return l.length ? ['Fluidité mesurée sur cet appareil' + (this.gpu ? ` (${this.gpu})` : '') + ' :', ...l] : [];
  }

  reset() { this.buckets.clear(); this.last = 0; this.lastKey = ''; }
}

/** The one meter of the page. */
export const frameStats = new FrameStats();

/** The browser's name for the GPU, where it gives one. */
export function gpuName(gl: WebGLRenderingContext | WebGL2RenderingContext | null): string {
  try {
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return ext ? String(gl!.getParameter(ext.UNMASKED_RENDERER_WEBGL)).slice(0, 80) : '';
  } catch { return ''; }
}
