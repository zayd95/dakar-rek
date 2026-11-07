/**
 * Frame times measured on the player's own device (docs/beta/IPHONE_PLAYTEST.md): « Mesure de fluidité » in the phone's Réglages. Off by default,
 * kept in localStorage (never in the save). While it is on, every frame's duration is filed under where the player is (the district, and on foot,
 * at the wheel or inside a home); « Signaler un problème » then adds one line per place to the report, so a tester's message carries real numbers.
 * Off, the cost is one boolean test per frame. Nothing is sent anywhere.
 *
 * MOBILE-01 (docs/mobile/MOBILE-01.md) adds, for the same report: the memory the browser and the renderer can tell (JS heap where the browser gives it: Chrome and Android,
 * not Safari; the renderer's own counts of geometries, textures and programs, which every browser gives), one line per district change (how long the load took, its longest
 * block, the worst frame until two seconds after it) and notes for what kills a game on a phone (a lost WebGL context, a page hidden and shown again). A build made for
 * the playtest (VITE_MEASURE_DEFAULT=1) starts with the measure on; the player can still switch it off in Réglages and that choice is kept.
 */
const KEY = 'dakarrek.fps';
const BINS = 121;                                          // 1 ms bins, the last one « 120 ms and more »
/** A frame longer than this is a hitch the player feels. */
export const HITCH_MS = 50;
/** A gap longer than this is a hidden tab or a paused game, not a frame: it is left out. */
const GAP_MS = 2000;

export interface FrameBucket { key: string; frames: number; ms: number; worst: number; hitches: number; hist: Uint32Array; calls: number; tris: number }

const store = () => { try { return window.localStorage; } catch { return null; } };
/** True in a build made for the device playtest (vite.preview.config.ts): the measure starts on unless the player switched it off. */
const DEFAULT_ON: boolean = (() => { try { return import.meta.env?.VITE_MEASURE_DEFAULT === '1'; } catch { return false; } })();
/** How long after a district change the worst frame is still counted against it. */
export const AFTER_TRANSITION_MS = 2000;
/** How often the memory is sampled for its peak. */
const MEMORY_EVERY_MS = 4000;

/** One district change: `route` is the staged load of a road crossing (the swap frame does the least), `saut` a direct load (a teleport, a door, the first load). */
export interface Transition { from: string; to: string; kind: 'route' | 'saut'; totalMs: number; maxStepMs: number; worstAfterMs: number; done: boolean }
/** What the browser and the renderer can tell about memory; a field is missing when the browser does not give it. */
export interface MemoryInfo { heapMB?: number; heapLimitMB?: number; geometries?: number; textures?: number; programs?: number }

/** The probe for a three.js renderer: the JS heap where the browser has `performance.memory` (Chrome, Android), and the renderer's own counts everywhere. */
export function memoryProbe(r: { info: { memory: { geometries: number; textures: number }; programs?: unknown[] | null } }): () => MemoryInfo {
  return () => {
    const m: MemoryInfo = { geometries: r.info.memory.geometries, textures: r.info.memory.textures };
    if (r.info.programs) m.programs = r.info.programs.length;
    const pm = typeof performance !== 'undefined' ? (performance as unknown as { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory : undefined;
    if (pm && pm.usedJSHeapSize > 0) { m.heapMB = Math.round(pm.usedJSHeapSize / 1048576); m.heapLimitMB = Math.round(pm.jsHeapSizeLimit / 1048576); }
    return m;
  };
}

export class FrameStats {
  private buckets = new Map<string, FrameBucket>();
  private last = 0;
  private lastKey = '';
  private on = false;
  /** The device's own GPU name where the browser says it (WEBGL_debug_renderer_info), for the report. */
  gpu = '';
  /** The district changes of this session, oldest first (the last 24). */
  transitions: Transition[] = [];
  /** Things that kill or pause a game on a phone, with the time: a lost WebGL context, a page hidden and shown again (the last 30). */
  events: string[] = [];
  /** Set by the game: what the renderer and the browser can tell about memory right now. */
  probe: (() => MemoryInfo) | null = null;
  private peak: MemoryInfo = {};
  private memAt = 0;
  private lastEndAt = 0;
  private open: { t: Transition; until: number } | null = null;
  constructor(readInitial = true) {
    if (readInitial) this.on = (() => { try { const v = store()?.getItem(KEY); return v === 'on' || (v == null && DEFAULT_ON); } catch { return DEFAULT_ON; } })();
  }

  get enabled(): boolean { return this.on; }
  setEnabled(on: boolean) {
    this.on = on; this.last = 0;
    try { if (on) store()?.setItem(KEY, 'on'); else if (DEFAULT_ON) store()?.setItem(KEY, 'off'); else store()?.removeItem(KEY); } catch { /* session only */ }
  }

  /** A district change starts. */
  beginTransition(from: string, to: string, kind: Transition['kind']) {
    if (!this.on) return;
    const t: Transition = { from, to, kind, totalMs: 0, maxStepMs: 0, worstAfterMs: 0, done: false };
    this.transitions.push(t); if (this.transitions.length > 24) this.transitions.shift();
    this.open = { t, until: Infinity };
    this.last = 0;                                                  // the frame the swap happens in is a frame like any other, but the gap before it is not
  }
  /** The load is over: how long it took in all and its longest single block (a staged load pauses between blocks). The worst frame counts until two seconds from now. */
  endTransition(totalMs: number, maxStepMs: number, now: number) {
    const o = this.open; if (!o) return;
    o.t.totalMs = Math.round(totalMs); o.t.maxStepMs = Math.round(maxStepMs); o.t.done = true; o.until = now + AFTER_TRANSITION_MS; this.lastEndAt = now;
  }
  /** The last finished district change, for the on-screen meter, while it is recent (`now` is the page's clock). */
  recentTransition(now: number, withinMs = 12000): Transition | null {
    for (let i = this.transitions.length - 1; i >= 0; i--) { const t = this.transitions[i]; if (t.done) return this.lastEndAt && now - this.lastEndAt <= withinMs ? t : null; }
    return null;
  }

  /** A thing worth knowing about (a lost context…), filed with the time. */
  note(text: string, at = new Date()) {
    this.events.push(`${at.toISOString().slice(11, 19)} UTC ${text}`); if (this.events.length > 30) this.events.shift();
  }

  /** The memory now, and the peak seen so far (sampled every few seconds while frames are measured). */
  memoryNow(): MemoryInfo | null { try { return this.probe ? this.probe() : null; } catch { return null; } }
  private samplePeak(now: number) {
    if (!this.probe || now - this.memAt < MEMORY_EVERY_MS) return;
    this.memAt = now; const m = this.memoryNow(); if (!m) return;
    for (const k of ['heapMB', 'heapLimitMB', 'geometries', 'textures', 'programs'] as const) { const v = m[k]; if (v !== undefined && v > (this.peak[k] ?? 0)) this.peak[k] = v; }
  }

  /** One frame, at `now` (ms, the animation frame's timestamp), in the place `key`, with the last render's draw calls and triangles. */
  tick(now: number, key: string, calls = 0, tris = 0) {
    const dt = this.last ? now - this.last : 0; this.last = now;
    if (this.open) {
      if (now > this.open.until) this.open = null;
      else if (dt > 0 && dt <= GAP_MS && dt > this.open.t.worstAfterMs) this.open.t.worstAfterMs = Math.round(dt);
    }
    this.samplePeak(now);
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
    const out = l.length ? ['Fluidité mesurée sur cet appareil' + (this.gpu ? ` (${this.gpu})` : '') + ' :', ...l] : [];
    const extra = [...this.memoryLines(), ...this.transitionLines(), ...this.events.map(e => `- ${e}`)];
    return extra.length ? [...out, ...extra] : out;
  }

  /** Memory, now and at its peak; says so when the browser does not give the JS heap (Safari does not). */
  memoryLines(): string[] {
    const now = this.memoryNow(); if (!now) return [];
    const fmt = (m: MemoryInfo) => [
      m.heapMB !== undefined ? `tas JS ${m.heapMB} Mo${m.heapLimitMB ? ` sur ${m.heapLimitMB}` : ''}` : null,
      m.geometries !== undefined ? `${m.geometries} géométries` : null,
      m.textures !== undefined ? `${m.textures} textures` : null,
      m.programs !== undefined ? `${m.programs} programmes` : null,
    ].filter(Boolean).join(' · ');
    const lines = [`Mémoire maintenant : ${fmt(now)}${now.heapMB === undefined ? ' · tas JS non communiqué par ce navigateur' : ''}`];
    if (Object.keys(this.peak).length) lines.push(`Mémoire au plus haut : ${fmt(this.peak)}`);
    return lines;
  }

  /** One line per finished district change. */
  transitionLines(): string[] {
    const done = this.transitions.filter(t => t.done);
    return done.length ? ['Changements de quartier :', ...done.map(t => `- ${t.from} → ${t.to} (${t.kind === 'route' ? 'par la route' : 'direct'}) : ${t.totalMs} ms de chargement · plus long bloc ${t.maxStepMs} ms · pire image jusqu’à 2 s après ${t.worstAfterMs} ms`)] : [];
  }

  reset() { this.buckets.clear(); this.last = 0; this.lastKey = ''; this.transitions = []; this.events = []; this.peak = {}; this.open = null; this.lastEndAt = 0; }
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
