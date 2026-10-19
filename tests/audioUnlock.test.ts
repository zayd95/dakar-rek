import { describe, expect, it } from 'vitest';
import { GESTURES, keepAlive, needsResume, nudge, sessionType, setPlaybackSession } from '../src/transport/audioUnlock';
import { HORNS, PROFILES, hornFor } from '../src/transport/vehicleAudio';

/** A tiny event target standing in for window / document. */
function target() {
  const h = new Map<string, Set<(e: Event) => void>>();
  return {
    visibilityState: 'visible' as DocumentVisibilityState,
    addEventListener: (t: string, f: (e: Event) => void) => { (h.get(t) ?? h.set(t, new Set()).get(t)!).add(f); },
    removeEventListener: (t: string, f: (e: Event) => void) => { h.get(t)?.delete(f); },
    fire: (t: string) => { for (const f of [...(h.get(t) ?? [])]) f({ type: t } as Event); },
    count: (t: string) => h.get(t)?.size ?? 0,
  };
}
const ctx = (state: string) => { const c = { state, resumed: 0, resume() { c.resumed++; return Promise.resolve(); } }; return c; };

describe('a context that stopped is asked to run again', () => {
  it('suspended and Safari\'s interrupted are resumed; running and closed are left alone', () => {
    expect(needsResume('suspended')).toBe(true); expect(needsResume('interrupted')).toBe(true);
    expect(needsResume('running')).toBe(false); expect(needsResume('closed')).toBe(false); expect(needsResume(undefined)).toBe(false);
    for (const [s, n] of [['suspended', 1], ['interrupted', 1], ['running', 0], ['closed', 0]] as const) { const c = ctx(s); nudge(c); expect(c.resumed).toBe(n); }
  });
  it('never throws, whatever the context does (a rejected promise, a throw, nothing at all)', () => {
    expect(() => nudge({ state: 'suspended', resume: () => Promise.reject(new Error('not allowed')) })).not.toThrow();
    expect(() => nudge({ state: 'interrupted', resume: () => { throw new Error('x'); } })).not.toThrow();
    expect(nudge(null)).toBe(false);
  });
});

describe('the gestures that keep a phone\'s sound alive', () => {
  it('include the end of a touch (the one iOS accepts), a click and a key, not only the start of a touch', () => {
    for (const t of ['pointerup', 'touchend', 'click', 'keydown']) expect(GESTURES).toContain(t);
  });
  it('stay for the whole life of the page: an unlock that fails at the start of a touch is retried at its end', () => {
    const win = target(), doc = target(); let c = ctx('suspended');
    // iOS: only the end of a touch may start a context; the start of one asks, and nothing happens
    const strict = { get state() { return c.state; }, resume() { if (cur === 'touchend' || cur === 'click') c.state = 'running'; c.resumed++; return Promise.resolve(); } };
    let cur = '';
    keepAlive(win, doc, () => strict, () => strict);
    for (const t of ['pointerdown', 'touchend']) { cur = t; win.fire(t); }
    expect(c.state).toBe('running');
    cur = 'pointerdown'; win.fire('pointerdown'); const n = c.resumed; win.fire('touchend'); expect(c.resumed).toBe(n);        // running: nothing more is asked
    for (const t of GESTURES) expect(win.count(t)).toBe(1);                                                                 // and the listeners are still there
  });
  it('a context that stops later (a call, the lock screen) is resumed by the next gesture and by the return to the page', () => {
    const win = target(), doc = target(), c = ctx('running'), told: string[] = [];
    keepAlive(win, doc, () => c, () => c, why => told.push(why));
    c.state = 'interrupted'; win.fire('pointerup'); expect(c.resumed).toBe(1);
    c.state = 'suspended'; doc.visibilityState = 'hidden'; doc.fire('visibilitychange'); expect(c.resumed).toBe(1);           // hidden: not asked
    doc.visibilityState = 'visible'; doc.fire('visibilitychange'); expect(c.resumed).toBe(2);
    c.state = 'interrupted'; win.fire('pageshow'); expect(c.resumed).toBe(3);
    expect(told).toEqual(['pointerup', 'visibilitychange', 'pageshow']);
  });
  it('the first gesture creates the context when there is none yet, and the remover takes every listener off', () => {
    const win = target(), doc = target(); const made = ctx('suspended'); let have = false;
    const off = keepAlive(win, doc, () => have ? made : null, () => { have = true; return made; });
    win.fire('touchend'); expect(have).toBe(true); expect(made.resumed).toBe(1);
    off(); for (const t of GESTURES) expect(win.count(t)).toBe(0); expect(doc.count('visibilitychange')).toBe(0);
  });
});

describe('the audio session', () => {
  it('asks for a playback session while driving and goes back to auto after', () => {
    const nav = { audioSession: { type: 'auto' } };
    expect(setPlaybackSession(true, nav)).toBe(true); expect(nav.audioSession.type).toBe('playback'); expect(sessionType(nav)).toBe('playback');
    expect(setPlaybackSession(false, nav)).toBe(true); expect(nav.audioSession.type).toBe('auto');
  });
  it('a browser without the API (or one that refuses) is not an error, and is reported as such', () => {
    expect(setPlaybackSession(true, {})).toBe(false); expect(sessionType({})).toBe('unsupported');
    expect(setPlaybackSession(true, { audioSession: { get type() { return 'auto'; }, set type(_v: string) { throw new Error('no'); } } })).toBe(false);
  });
});

describe('the horns', () => {
  it('each kind of vehicle has its own, a car sounds two reeds and a motorbike one', () => {
    expect(HORNS.sedan.reeds).toHaveLength(2); expect(HORNS.suv.reeds).toHaveLength(2); expect(HORNS.moto.reeds).toHaveLength(1);
    expect(new Set(Object.values(HORNS).map(h => h.reeds.join('/'))).size).toBe(Object.keys(HORNS).length);
    expect(hornFor('nothing')).toBe(HORNS.sedan);
  });
  it('are made for a phone speaker: every reed above 330 Hz, full of harmonics, lifted where a small speaker is strong', () => {
    for (const [k, h] of Object.entries(HORNS)) {
      expect(Math.min(...h.reeds), k).toBeGreaterThanOrEqual(330);
      expect(['sawtooth', 'square']).toContain(h.wave);
      expect(h.hp).toBeGreaterThanOrEqual(200); expect(h.peakHz).toBeGreaterThanOrEqual(1200); expect(h.peakHz).toBeLessThanOrEqual(3000); expect(h.peakDb).toBeGreaterThan(0);
      expect(h.detune).toBeGreaterThan(0); expect(h.level).toBeGreaterThan(0.2);
    }
  });
  it('the SUV\'s is lower than the saloon\'s and the motorbike\'s higher, as their engines are', () => {
    expect(Math.min(...HORNS.suv.reeds)).toBeLessThan(Math.min(...HORNS.sedan.reeds));
    expect(Math.min(...HORNS.moto.reeds)).toBeGreaterThan(Math.max(...HORNS.sedan.reeds));
    expect(Object.keys(HORNS).sort()).toEqual(Object.keys(PROFILES).sort());
  });
});
