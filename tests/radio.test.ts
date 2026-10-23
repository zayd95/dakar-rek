import { describe, expect, it } from 'vitest';
import { CONNECT_TIMEOUT, RADIO_LEVEL, Radio, SILENT_PROBE, STALL_TIMEOUT, STATIONS, VOLUMES, duckFactor, radioGain, radioSettings, unavailable, type MediaLike, type RadioEnv } from '../src/transport/radio';

/** The car radio (src/transport/radio.ts): live Senegalese stations, ducked under the horn, the phone, a knock and the job's card; released whenever it is not heard. */
describe('the car radio: stations and level', () => {
  const base = { volume: 1, throttle: 0, ducks: [], now: 10, phone: false, horn: false };
  it('four real Senegalese stations, each its own live stream on Zeno.FM (no synthesised station left)', () => {
    expect(STATIONS.map(s => `${s.name} ${s.freq}`)).toEqual(['RFM 94.0', 'Sud FM 98.5', 'Zik FM 89.7', 'Rewmi FM 97.5']);
    for (const s of STATIONS) { expect(s.url).toMatch(/^https:\/\/stream\.zeno\.fm\/[a-z0-9]{10,}$/); expect(s.page).toMatch(/^https:\/\/zeno\.fm\/radio\//); }
    expect(new Set(STATIONS.map(s => s.url)).size).toBe(STATIONS.length);
    expect(VOLUMES.map(v => v.v)).toEqual([0.45, 0.7, 1]);
    expect(unavailable(STATIONS[0])).toBe('📻 RFM indisponible');
    expect(radioSettings().stations.map(s => s.id)).toEqual(['rfm', 'sudfm', 'zik', 'rewmi']);
  });
  it('a little under the engine when accelerating; the horn, the phone, a knock and the card lower it; a duck ends', () => {
    expect(radioGain(base)).toBe(RADIO_LEVEL);
    expect(radioGain({ ...base, throttle: 1 })).toBeCloseTo(RADIO_LEVEL * 0.6, 6);
    expect(radioGain({ ...base, horn: true })).toBeLessThan(RADIO_LEVEL * 0.4);
    expect(radioGain({ ...base, phone: true })).toBeLessThan(RADIO_LEVEL * 0.35);
    expect(radioGain({ ...base, ducks: [{ f: 0.25, until: 12 }] })).toBeCloseTo(RADIO_LEVEL * 0.25, 6);
    expect(radioGain({ ...base, ducks: [{ f: 0.25, until: 9 }] })).toBe(RADIO_LEVEL);
    expect(radioGain({ ...base, volume: 0.45 })).toBeCloseTo(RADIO_LEVEL * 0.45, 6);
    expect(duckFactor({ ...base, horn: true, phone: true })).toBe(0.3);
  });
});

/** A fake <audio> element: records what the radio does to it; `fire` plays the browser's events. */
class FakeEl implements MediaLike {
  src = ''; crossOrigin: string | null = null; preload = 'auto'; muted = false; paused = true; currentTime = 0;
  private vol = 1; fixedVolume = false;
  get volume() { return this.fixedVolume ? 1 : this.vol; } set volume(v: number) { this.vol = v; }       // an iPhone ignores it: always 1
  plays = 0; loads = 0; srcs: string[] = []; playResult: () => Promise<void> = () => Promise.resolve();
  private on = new Map<string, ((e?: unknown) => void)[]>();
  play() { this.plays++; this.paused = false; if (this.src) this.srcs.push(this.src); return this.playResult(); }
  pause() { this.paused = true; this.fire('pause'); }
  load() { this.loads++; }
  removeAttribute(n: string) { if (n === 'src') this.src = ''; }
  addEventListener(t: string, f: (e?: unknown) => void) { this.on.set(t, [...(this.on.get(t) ?? []), f]); }
  fire(t: string) { for (const f of this.on.get(t) ?? []) f(); }
}
function rig(o: { zeros?: boolean } = {}) {
  const els: FakeEl[] = [], notices: string[] = [];
  let clock = 0, hidden = false, page: (why: 'visibility' | 'gesture') => void = () => {};
  const node = () => ({ context: ctx, connect: (n: unknown) => n, disconnect() {}, gain: { value: 0, setTargetAtTime(v: number) { this.value = v; } } });
  const ctx: { state: string; currentTime: number; graphSources: number; createMediaElementSource(): unknown; createGain(): unknown; createAnalyser(): unknown } = {
    state: 'running', currentTime: 0, graphSources: 0,
    createMediaElementSource() { this.graphSources++; return node(); },
    createGain: () => node(),
    createAnalyser: () => ({ fftSize: 512, connect: (n: unknown) => n, getFloatTimeDomainData(b: Float32Array) { b.fill(o.zeros ? 0 : 0.01); } }),
  };
  const bus = { ctx, gain: node() } as unknown as { ctx: AudioContext; gain: GainNode };
  const env: RadioEnv = { makeAudio: () => { const e = new FakeEl(); els.push(e); return e; }, now: () => clock, hidden: () => hidden, listen: fn => { page = fn; } };
  const r = new Radio(() => env); r.notify = m => notices.push(m);
  const drive = { throttle: 0, horn: false, phone: false };
  return {
    r, els, notices, bus, ctx, drive,
    tick: (ms: number, b: typeof bus | null = bus) => { for (let t = 0; t < ms; t += 100) { clock += 100; r.update(b, drive); } },
    hide: (h: boolean) => { hidden = h; page('visibility'); },
    tap: () => page('gesture'),
    streaming: () => els.filter(e => e.src !== ''),
  };
}

describe('the car radio: streaming', () => {
  it('a station streams through the game\'s sound (CORS, Web Audio): tuned, playing, and released when switched off', () => {
    const k = rig();
    expect(k.r.next(k.bus)?.id).toBe('rfm');
    const el = k.els[0];
    expect(el.crossOrigin).toBe('anonymous'); expect(el.src).toBe(STATIONS[0].url); expect(el.plays).toBe(1);
    expect(k.r.status).toBe('connecting'); expect(k.r.mode).toBe('graph'); expect(k.ctx.graphSources).toBe(1);
    el.fire('playing'); expect(k.r.status).toBe('playing');
    k.r.next(k.bus); k.r.next(k.bus); k.r.next(k.bus);                                   // Sud FM, Zik FM, Rewmi FM: the same element, a new stream each time
    expect(el.srcs).toEqual(STATIONS.map(s => s.url)); expect(k.ctx.graphSources).toBe(1);
    expect(k.r.next(k.bus)).toBeNull();                                                  // off
    expect(k.r.status).toBe('off'); expect(k.streaming()).toEqual([]); expect(el.paused).toBe(true); expect(el.loads).toBeGreaterThanOrEqual(4);
    expect(k.r.info().streaming).toBe(false);
  });
  it('a stream refused through the graph (no CORS headers) plays on a plain element, its volume set and ducked', () => {
    const k = rig();
    k.r.next(k.bus); k.els[0].fire('error');
    const plain = k.els[1];
    expect(plain.crossOrigin).toBeNull(); expect(plain.src).toBe(STATIONS[0].url); expect(k.r.mode).toBe('element');
    plain.fire('playing'); k.tick(300);
    expect(plain.volume).toBeCloseTo(RADIO_LEVEL * k.r.volume, 5);
    k.drive.horn = true; k.tick(200);
    expect(plain.volume).toBeLessThan(RADIO_LEVEL * k.r.volume * 0.4);
    expect(k.notices).toEqual([]);
    k.r.next(k.bus); expect(k.els[0].src).toBe('');                                     // the next station goes straight to a plain element (the graph's way is known to fail)
    expect(k.r.mode).toBe('element'); expect(plain.src).toBe(STATIONS[1].url);
  });
  it('on an iPhone a plain element\'s volume cannot be set: the horn and the phone mute it instead', () => {
    const k = rig();
    k.r.next(k.bus); k.els[0].fire('error');
    const plain = k.els[1]; plain.fixedVolume = true; plain.fire('playing'); k.tick(300);
    expect(k.r.info().volumeFixed).toBe(true); expect(plain.muted).toBe(false);
    k.drive.phone = true; k.tick(200); expect(plain.muted).toBe(true);
    k.drive.phone = false; k.tick(200); expect(plain.muted).toBe(false);
  });
  it('a station that fails both ways is said unavailable once and falls silent (no noise in its place); the next tap moves on', () => {
    const k = rig();
    k.r.next(k.bus); k.els[0].fire('error'); k.els[1].fire('error');
    expect(k.r.status).toBe('failed'); expect(k.notices).toEqual(['📻 RFM indisponible']); expect(k.streaming()).toEqual([]);
    k.tick(20000); expect(k.notices.length).toBe(1); expect(k.streaming()).toEqual([]);
    expect(k.r.next(k.bus)?.name).toBe('Sud FM'); expect(k.streaming().length).toBe(1);
  });
  it('a station that never starts is unavailable after the timeout (blocked media, a dead stream, a preview\'s CSP)', () => {
    const k = rig();
    k.r.next(k.bus); k.tick(CONNECT_TIMEOUT + 200);
    expect(k.r.mode).toBe('element'); expect(k.notices).toEqual([]);
    k.tick(CONNECT_TIMEOUT + 200);
    expect(k.r.status).toBe('failed'); expect(k.notices).toEqual(['📻 RFM indisponible']); expect(k.streaming()).toEqual([]);
  });
  it('a stall reconnects to the live broadcast once; a second one for good says unavailable', () => {
    const k = rig();
    k.r.next(k.bus); const el = k.els[0]; el.fire('playing');
    el.fire('waiting'); expect(k.r.status).toBe('stalled');
    k.tick(STALL_TIMEOUT + 200);
    expect(k.r.info().reconnects).toBe(1); expect(k.r.status).toBe('connecting'); expect(el.src).toBe(STATIONS[0].url);
    el.fire('playing'); el.fire('stalled'); k.tick(STALL_TIMEOUT + 200);
    expect(k.r.info().reconnects).toBe(2);                                               // it played again in between: a new chance
    k.tick(CONNECT_TIMEOUT + 200);                                                       // …but this time it never comes back
    k.tick(CONNECT_TIMEOUT + 200);
    expect(k.r.status).toBe('failed'); expect(k.notices).toEqual(['📻 RFM indisponible']);
  });
  it('no hidden download: out of the car, the sound off, the page hidden, a phone call — the stream is let go, and comes back with the sound', () => {
    const k = rig();
    k.r.next(k.bus); k.els[0].fire('playing');
    k.tick(100, null);                                                                   // the game's sound switched off (no bus)
    expect(k.streaming()).toEqual([]); expect(k.r.status).toBe('waiting');
    k.tick(100); expect(k.streaming().length).toBe(1); k.els[0].fire('playing');
    k.hide(true); expect(k.streaming()).toEqual([]);
    k.tick(500); expect(k.streaming()).toEqual([]);                                      // hidden: nothing reconnects
    k.hide(false); k.tick(100); expect(k.streaming().length).toBe(1); k.els[0].fire('playing');
    (k.ctx as { state: string }).state = 'interrupted'; k.tick(100); expect(k.streaming()).toEqual([]);   // a call on the iPhone
    (k.ctx as { state: string }).state = 'running'; k.tick(100); expect(k.streaming().length).toBe(1);
    k.r.leave(); expect(k.streaming()).toEqual([]); expect(k.r.status).toBe('off');
    k.tick(1000); expect(k.streaming()).toEqual([]);
    expect(k.notices).toEqual([]);
  });
  it('before the first tap, or with play() refused, it waits; the next tap starts it', () => {
    const k = rig();
    k.r.set(null, 0); expect(k.r.status).toBe('waiting'); expect(k.els.length).toBe(0);
    k.tick(100); expect(k.streaming().length).toBe(1);
    const k2 = rig(); k2.r.next(null);
    const el = new FakeEl(); el.playResult = () => Promise.reject(Object.assign(new Error('no'), { name: 'NotAllowedError' }));
    (k2.r as unknown as { e: RadioEnv }).e.makeAudio = () => { k2.els.push(el); return el; };
    k2.tick(100);
    return Promise.resolve().then(() => Promise.resolve()).then(() => {
      expect(k2.r.status).toBe('blocked');
      el.playResult = () => Promise.resolve(); k2.tap();
      expect(el.plays).toBe(2); el.fire('playing'); expect(k2.r.status).toBe('playing');
    });
  });
  it('a stream the browser silences through the graph (only zeros) is replayed on a plain element', () => {
    const k = rig({ zeros: true });
    k.r.next(k.bus); k.els[0].fire('playing');
    k.tick(SILENT_PROBE + 300);
    expect(k.r.mode).toBe('element'); expect(k.els[1].src).toBe(STATIONS[0].url);
    const k2 = rig(); k2.r.next(k2.bus); k2.els[0].fire('playing'); k2.tick(SILENT_PROBE + 300);
    expect(k2.r.mode).toBe('graph');
  });
  it('the station is remembered for the next ride', () => {
    const k = rig();
    k.r.next(k.bus); k.r.next(k.bus);
    expect(STATIONS[k.r.station].id).toBe('sudfm');
  });
});
