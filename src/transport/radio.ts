/**
 * The car's radio: real Senegalese stations, live (docs/audio/ARENA_AND_RADIO.md). Each is the station's own public stream on Zeno.FM
 * (`stream.zeno.fm/<mount>`, which redirects to the broadcaster's tokenised Icecast URL); the 📻 button by « Vue » goes off → RFM → Sud FM →
 * Rewmi FM → off, and the station's name shows on the toast and the dashboard screen. Nothing is synthesised any more.
 *
 * How it plays: an <audio> element streams the URL with `crossOrigin = 'anonymous'` into the page's Web Audio graph (MediaElementSource → a
 * gain → the vehicles' bus of src/transport/vehicleAudio.ts `radioBus`): so the game's sound setting mutes it, it starts only after the first
 * tap (the iPhone's rule), it is kept a little under the engine when accelerating and lowered for a moment by the horn, a knock, the phone and
 * the card after a job, and its volume (Réglages › Son) is a share of the game's — on an iPhone too, where an element's own `volume` cannot be
 * set. If that load fails (a stream without CORS headers), it falls back to a plain element whose `volume` is set instead (on an iPhone that
 * one plays at the phone's volume: it can only be muted, which it is under the horn and the phone). If the stream fails, stalls for good or
 * never starts, the radio says « RFM indisponible » once and falls silent (no stand-in noise); the next tap moves on.
 *
 * Bandwidth: the stream exists only while it is heard — the element is emptied (its download aborted) when the radio is off, when the
 * player gets out of the car, when the page is hidden, when the phone interrupts the sound (a call) and with the game's sound off; it
 * reconnects to the live broadcast when the sound comes back. A private Claude preview blocks external media (its CSP): the radio then says
 * the station is unavailable, as for any failure.
 */
export interface Station { id: 'rfm' | 'sudfm' | 'rewmi'; name: string; freq: string; full: string; url: string; page: string }
/**
 * Verified on 2026-10-23: each Zeno.FM page lists the station (Senegal) and links to the broadcaster's own site or accounts, and its stream URL answers 302
 * to the broadcaster's Icecast server (an unknown mount answers 404). A relay whose page does not link to the broadcaster (Zik FM's) is left out: only
 * streams that can be shown to be the station's own are played.
 */
export const STATIONS: readonly Station[] = [
  { id: 'rfm', name: 'RFM', freq: '94.0', full: 'Radio Futurs Médias', url: 'https://stream.zeno.fm/2h77qvxhq9duv', page: 'https://zeno.fm/radio/radiofuturmedia-rfm/' },
  { id: 'sudfm', name: 'Sud FM', freq: '98.5', full: 'Sud FM Sénégal', url: 'https://stream.zeno.fm/y763bdfn3reuv', page: 'https://zeno.fm/radio/sudfmsenegal/' },
  { id: 'rewmi', name: 'Rewmi FM', freq: '97.5', full: 'Radio Rewmi FM Dakar', url: 'https://stream.zeno.fm/smw7kg16t8quv', page: 'https://zeno.fm/radio/radiorewmi/' },
];
/**
 * The radio's gain at full volume, before ducking, for a broadcast mastered near −14 LUFS: about −30 dB rms at the speaker on « Moyen »
 * (measured with a stand-in stream, the vehicles' bus and its limiter included: docs/audio/ARENA_AND_RADIO.md), some 10 dB above the cabin's
 * quiet engine at idle (about −40 dB), under the horn and the arena's drums.
 */
export const RADIO_LEVEL = 0.1;
/** A plain element plays outside the vehicles' bus, whose limiter adds about 6 dB of make-up gain: its volume is raised as much to sound the same. */
export const ELEMENT_GAIN = 2;
/** Volume settings (Réglages › Son › Radio de la voiture). */
export const VOLUMES = [{ id: 'bas', label: 'Bas', v: 0.45 }, { id: 'moyen', label: 'Moyen', v: 0.7 }, { id: 'fort', label: 'Fort', v: 1 }] as const;
/** How long a station may take to start, and to recover from a stall, before it is said to be unavailable (ms). */
export const CONNECT_TIMEOUT = 12000, STALL_TIMEOUT = 9000;
/** A stream through the graph that has played only exact zeros this long (a cross-origin stream the browser silences) is replayed through a plain element (ms). */
export const SILENT_PROBE = 5000;
const VOL_KEY = 'dakarrek.radio.volume', ST_KEY = 'dakarrek.radio.station';
const store = () => { try { return localStorage; } catch { return null; } };

/** The level the radio is kept at now (pure, unit-tested): the volume, under the engine's load, and the shortest-lived of the ducks in force. */
export function radioGain(o: { volume: number; throttle: number; ducks: readonly { f: number; until: number }[]; now: number; phone: boolean; horn: boolean }): number {
  return RADIO_LEVEL * o.volume * duckFactor(o);
}
/** The share of the volume kept: accelerating, the engine leads (−4.4 dB at full throttle); the horn, the phone and the ducks lower it more. */
export function duckFactor(o: { throttle: number; ducks: readonly { f: number; until: number }[]; now: number; phone: boolean; horn: boolean }): number {
  let f = 1 - 0.4 * Math.max(0, Math.min(1, o.throttle));
  for (const d of o.ducks) if (d.until > o.now) f = Math.min(f, d.f);
  if (o.phone) f = Math.min(f, 0.3);
  if (o.horn) f = Math.min(f, 0.35);
  return f;
}
/** The toast when a station cannot be played. */
export const unavailable = (s: Station) => `📻 ${s.name} indisponible`;

/** What the radio needs of an <audio> element (a fake in the tests). */
export interface MediaLike {
  src: string; crossOrigin: string | null; preload: string; volume: number; muted: boolean;
  readonly paused: boolean; readonly currentTime: number;
  play(): Promise<void> | void; pause(): void; load(): void; removeAttribute(name: string): void;
  addEventListener(type: string, fn: (e?: unknown) => void): void;
}
/** The page around the radio (the browser's, or a fake in the tests). */
export interface RadioEnv {
  makeAudio(): MediaLike | null;
  now(): number;
  hidden(): boolean;
  /** Calls `fn` when the page is hidden or shown again, and at every gesture (where a blocked `play()` may be retried). */
  listen(fn: (why: 'visibility' | 'gesture') => void): void;
}
type Bus = { ctx: AudioContext; gain: GainNode };
export type RadioStatus = 'off' | 'waiting' | 'connecting' | 'playing' | 'stalled' | 'blocked' | 'failed';

/** Checks only (`?debug&radio=<base>`): each station streams from `<base><id>` instead (a stand-in served by the test server). */
function streamUrl(s: Station): string {
  try {
    const q = new URLSearchParams(location.search), base = q.get('radio');
    if (base !== null && q.has('debug')) return `${base}${s.id}`;
  } catch { /* no page */ }
  return s.url;
}
const browserEnv = (): RadioEnv => ({
  makeAudio: () => { try { return new Audio() as unknown as MediaLike; } catch { return null; } },
  now: () => performance.now(),
  hidden: () => typeof document !== 'undefined' && document.visibilityState === 'hidden',
  listen: fn => {
    if (typeof document === 'undefined') return;
    document.addEventListener('visibilitychange', () => fn('visibility'));
    for (const t of ['pointerup', 'touchend', 'click', 'keydown']) window.addEventListener(t, () => fn('gesture'), { capture: true, passive: true });
  },
});

export class Radio {
  /** The station chosen (index in STATIONS), −1: off. */
  station = -1;
  volume = (() => { const v = Number(store()?.getItem(VOL_KEY)); return Number.isFinite(v) && v > 0 && v <= 1 ? v : 0.7; })();
  status: RadioStatus = 'off';
  /** How the stream plays: through the Web Audio graph, or a plain element (its own volume). */
  mode: 'graph' | 'element' | null = null;
  /** Told when a station cannot be played (src/transport/ownedModule.ts shows it as a toast). */
  notify: ((msg: string) => void) | null = null;
  private bus: Bus | null = null;
  private el: MediaLike | null = null;
  private graphEl: MediaLike | null = null;
  private graphSrc: AudioNode | null = null;
  private out: GainNode | null = null;
  private probe: AnalyserNode | null = null;
  private plainEl: MediaLike | null = null;
  private since = 0; private stallSince = 0; private playingSince = 0; private heard = false;
  private triedPlain = false; private retried = false; private releasing = false;
  /** Stations whose stream played only on a plain element (no CORS headers): straight there next time. */
  private noCors = new Set<string>();
  /** iOS: a plain element's volume cannot be set (it stays at 1). */
  private volumeFixed = false;
  private ducks: { f: number; until: number }[] = [];
  private level = -1;
  private env: RadioEnv | null = null;
  private log = { started: 0, played: 0, failed: 0, fallbacks: 0, reconnects: 0, released: 0, ducked: 0, blocked: 0, level: 0, lastError: '' };

  constructor(private envFactory: () => RadioEnv = browserEnv) {}
  private get e(): RadioEnv {
    if (!this.env) { this.env = this.envFactory(); this.env.listen(why => this.onPage(why)); }
    return this.env;
  }

  /** The last station the player listened to (the radio comes back on with it when they sit in a car again), −1: it was off. */
  get remembered() { const id = store()?.getItem(ST_KEY) ?? ''; return STATIONS.findIndex(s => s.id === id); }
  /** The station on now, or null. */
  get current(): Station | null { return this.station >= 0 ? STATIONS[this.station] : null; }

  /** The next station (off → the first → … → off), for the « 📻 » button. Returns the station now on, or null when off. */
  next(bus: Bus | null): Station | null {
    const i = this.station + 1 >= STATIONS.length ? -1 : this.station + 1;
    this.set(bus, i);
    try { store()?.setItem(ST_KEY, i >= 0 ? STATIONS[i].id : ''); } catch { /* kept for this session only */ }
    return this.current;
  }
  /** Tunes to station `i` (−1: off). The stream starts at once when sound may play, else as soon as it may. */
  set(bus: Bus | null, i: number) {
    this.release();
    this.station = i; this.ducks = []; this.triedPlain = false; this.retried = false;
    this.status = i < 0 ? 'off' : 'waiting';
    if (i >= 0 && bus && this.mayPlay(bus)) this.connect(bus);
  }
  /** A moment lower: the horn, a knock (`f` of the level for `s` seconds). */
  duck(f: number, s: number) { if (this.station < 0) return; this.ducks.push({ f, until: this.e.now() + s * 1000 }); this.log.ducked++; }

  /** Every frame at the wheel of a car: the stream kept alive (or released while sound may not play), its level where it should be. */
  update(bus: Bus | null, o: { throttle: number; horn: boolean; phone: boolean }) {
    if (this.station < 0) return;
    const now = this.e.now();
    if (!bus || !this.mayPlay(bus)) {                                          // the sound off, the phone's call, the page hidden: no stream
      if (this.el) { this.release(); if (this.status !== 'failed') this.status = 'waiting'; }
      return;
    }
    if (this.status === 'waiting') this.connect(bus);
    if (this.status === 'connecting' && now - this.since > CONNECT_TIMEOUT) this.fail('timeout');
    if (this.status === 'stalled' && now - this.stallSince > STALL_TIMEOUT) this.fail('stall');
    if (this.status === 'playing' && this.mode === 'graph' && !this.heard) this.listen(now);
    if (!this.el) return;
    this.ducks = this.ducks.filter(d => d.until > now);
    const g = radioGain({ volume: this.volume, throttle: o.throttle, ducks: this.ducks, now, phone: o.phone, horn: o.horn });
    this.log.level = g;
    if (Math.abs(g - this.level) < 0.002) return;
    this.level = g;
    if (this.mode === 'graph' && this.out) this.out.gain.setTargetAtTime(g, bus.ctx.currentTime, 0.25);
    else if (this.mode === 'element') {
      const el = this.el;
      try { el.volume = Math.max(0, Math.min(1, g * ELEMENT_GAIN)); } catch { /* read-only */ }
      if (g * ELEMENT_GAIN < 0.99 && el.volume >= 0.999) this.volumeFixed = true;
      if (this.volumeFixed) el.muted = g < RADIO_LEVEL * this.volume * 0.45;     // iPhone: no volume of its own, so the horn and the phone mute it
    }
  }
  /** Out of the car: the radio stops (it never plays in the street) and lets the stream go; the station is remembered for the next ride. */
  leave() { this.release(); this.station = -1; this.status = 'off'; this.ducks = []; }
  setVolume(v: number) { this.volume = v; this.level = -1; try { store()?.setItem(VOL_KEY, String(v)); } catch { /* */ } }

  private mayPlay(bus: Bus) { return bus.ctx.state === 'running' && !this.e.hidden(); }
  private onPage(why: 'visibility' | 'gesture') {
    if (why === 'visibility' && this.e.hidden() && this.el) { this.release(); if (this.status !== 'failed') this.status = 'waiting'; }   // no hidden download
    if (why === 'gesture' && this.status === 'blocked' && this.el) this.play(this.el);                                                // the iPhone lets it play now
  }

  /** Starts the stream: through the graph (with CORS), or a plain element once the graph's way failed. */
  private connect(bus: Bus) {
    const st = this.current; if (!st) return;
    this.bus = bus;
    const plain = this.noCors.has(st.id) || this.triedPlain;
    const el = plain ? this.plainElement() : this.graphElement(bus);
    if (!el) { this.fail('no audio element'); return; }
    this.mode = plain ? 'element' : 'graph';
    this.el = el; this.status = 'connecting'; this.since = this.e.now(); this.heard = false; this.level = -1;
    if (plain) { try { el.volume = 0; } catch { /* iPhone */ } el.muted = false; }
    else if (this.out) this.out.gain.value = 0;
    el.preload = 'none';
    el.src = streamUrl(st);
    this.log.started++;
    this.play(el);
  }
  private play(el: MediaLike) {
    let p: Promise<void> | void;
    try { p = el.play(); } catch (err) { this.onError(el, String(err)); return; }
    if (p && typeof (p as Promise<void>).catch === 'function') (p as Promise<void>).catch((err: { name?: string }) => {
      if (el !== this.el) return;
      if (err?.name === 'NotAllowedError') { this.status = 'blocked'; this.log.blocked++; return; }   // waits for the next tap
      if (err?.name !== 'AbortError') this.onError(el, err?.name ?? 'play');
    });
  }
  /** The graph's element (one for the page: an element can be wired into the graph only once), with CORS. */
  private graphElement(bus: Bus): MediaLike | null {
    if (this.graphEl && this.graphSrc && this.out && this.out.context === bus.ctx) return this.graphEl;
    const el = this.e.makeAudio(); if (!el) return null;
    el.crossOrigin = 'anonymous';
    this.watch(el);
    try {
      const c = bus.ctx, src = c.createMediaElementSource(el as unknown as HTMLMediaElement), out = c.createGain(), probe = c.createAnalyser();
      out.gain.value = 0; probe.fftSize = 512;
      src.connect(out); out.connect(bus.gain); src.connect(probe);
      this.graphEl = el; this.graphSrc = src; this.out = out; this.probe = probe;
      return el;
    } catch { this.triedPlain = true; return this.plainElement(); }
  }
  private plainElement(): MediaLike | null {
    if (this.plainEl) return this.plainEl;
    const el = this.e.makeAudio(); if (!el) return null;
    this.watch(el); this.plainEl = el; return el;
  }
  private watch(el: MediaLike) {
    el.addEventListener('playing', () => { if (el !== this.el) return; this.status = 'playing'; this.playingSince = this.e.now(); this.retried = false; this.log.played++; const st = this.current; if (st && this.mode === 'element' && this.triedPlain) this.noCors.add(st.id); });
    for (const t of ['waiting', 'stalled']) el.addEventListener(t, () => { if (el === this.el && this.status === 'playing') { this.status = 'stalled'; this.stallSince = this.e.now(); } });
    el.addEventListener('pause', () => { if (el === this.el && !this.releasing && this.status === 'playing') { this.status = 'stalled'; this.stallSince = this.e.now(); } });   // paused by the system (a call)
    el.addEventListener('ended', () => { if (el === this.el) this.fail('ended'); });
    el.addEventListener('error', () => { if (el === this.el) this.onError(el, 'error'); });
  }
  private onError(el: MediaLike, why: string) { if (el === this.el) this.fail(why); }
  /** A stream through the graph that the browser silences (only exact zeros while it plays) goes through a plain element instead. */
  private listen(now: number) {
    const p = this.probe; if (!p) { this.heard = true; return; }
    const buf = new Float32Array(p.fftSize); p.getFloatTimeDomainData(buf);
    for (const x of buf) if (x !== 0) { this.heard = true; return; }
    if (now - this.playingSince > SILENT_PROBE) this.fail('silent');
  }
  /**
   * Something went wrong: the plain element once when the graph's load failed (a stream without CORS headers fails at once, with an error, as a
   * blocked or dead one does), a reconnection once after a stall, then « indisponible ». A stream that never starts is not retried.
   */
  private fail(why: string) {
    const st = this.current, bus = this.bus;
    this.log.lastError = why;
    if (st && bus && this.mode === 'graph' && !this.triedPlain && why !== 'stall' && why !== 'ended' && why !== 'timeout') {
      this.release(); this.triedPlain = true; this.log.fallbacks++; this.connect(bus); return;
    }
    if (st && bus && !this.retried && (why === 'stall' || why === 'ended')) {
      this.release(); this.retried = true; this.log.reconnects++; this.connect(bus); return;
    }
    this.release(); this.status = 'failed'; this.log.failed++;
    if (st) this.notify?.(unavailable(st));
  }
  /** Lets the stream go: paused, its source removed and the element reset (the download is aborted). */
  private release() {
    const el = this.el; if (!el) return;
    this.el = null; this.releasing = true;
    try { el.pause(); el.removeAttribute('src'); el.load(); } catch { /* already gone */ }
    this.releasing = false; this.log.released++;
    if (this.out && this.bus) this.out.gain.setTargetAtTime(0, this.bus.ctx.currentTime, 0.05);
  }

  info() {
    const st = this.current;
    return { station: st?.id ?? null, name: st ? `${st.name} ${st.freq}` : null, status: this.status, mode: this.mode, streaming: !!this.el, volume: this.volume, volumeFixed: this.volumeFixed,
      noCors: [...this.noCors], ducks: this.ducks.length, playing: this.status === 'playing', ...this.log };
  }
}
export const radio = new Radio();

/** For the phone's settings (another lane's UI): the stations, the one on, its state, the volumes. */
export function radioSettings() {
  return { stations: STATIONS.map(s => ({ id: s.id, label: `${s.name} ${s.freq}` })), station: radio.current?.id ?? null, status: radio.status, volume: radio.volume, volumes: VOLUMES };
}
