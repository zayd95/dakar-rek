import { describe, it, expect } from 'vitest';
import { cityTimeAt, CITY_EPOCH_MS, CITY_DAY_MS, daylight } from '../src/core/clock';
import { migrate, newSave, loadSave, writeSave, SAVE_KEY, SCHEMA_VERSION } from '../src/core/save';
import { GameState } from '../src/core/state';
import { len2 } from '../src/core/math';

const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m }; };

describe('city clock', () => {
  it('is identical for the same instant and one city day is 24 real minutes', () => {
    const t = CITY_EPOCH_MS + 1234567;
    expect(cityTimeAt(t)).toEqual(cityTimeAt(t));
    expect(cityTimeAt(CITY_EPOCH_MS + CITY_DAY_MS).day).toBe(2);
    expect(cityTimeAt(CITY_EPOCH_MS + CITY_DAY_MS / 2).hour).toBe(12);
  });
  it('is made once for a millisecond (every module reads it, many times a frame), with its label built when read', () => {
    const t = CITY_EPOCH_MS + 7 * CITY_DAY_MS + 7.25 * 60 * 1000;                      // day 8, 07:15
    const a = cityTimeAt(t), b = cityTimeAt(t);
    expect(b).toBe(a);
    expect(a).toMatchObject({ day: 8, hour: 7, minute: 15, isNight: false });
    expect(a.hourFloat).toBeCloseTo(7.25, 9);
    expect(a.label).toBe('Jour 8 · 07:15');
    const c = cityTimeAt(t + 1);
    expect(c).not.toBe(a);                                                              // another millisecond: made again
    expect(cityTimeAt(t)).toEqual(a);                                                   // and the first one asked again is the same time
    expect(cityTimeAt(CITY_EPOCH_MS + 23.5 * 60 * 1000).label).toBe('Jour 1 · 23:30');
  });
  it('has daylight at noon and none at midnight', () => {
    expect(daylight(12.5)).toBeGreaterThan(0.9);
    expect(daylight(0)).toBe(0);
  });
});

describe('len2', () => {
  it('is the length of (x, z) like Math.hypot, for the distances of a frame', () => {
    let seed = 99; const r = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
    for (let k = 0; k < 2000; k++) {
      const x = (r() - 0.5) * 600, z = (r() - 0.5) * 600;
      expect(Math.abs(len2(x, z) - Math.hypot(x, z))).toBeLessThan(1e-9);
    }
    expect(len2(3, 4)).toBe(5);
    expect(len2(0, 0)).toBe(0);
    expect(len2(-6, 8)).toBe(10);
  });
});

describe('save', () => {
  it('round-trips through storage', () => {
    const s = mem(); const d = newSave(); d.wallet = 4200;
    expect(writeSave(s, d)).toBe(true);
    expect(loadSave(s)?.wallet).toBe(4200);
  });
  it('clamps invalid values and rejects newer schema versions', () => {
    const m = migrate({ schemaVersion: 1, wallet: -5, needs: { faim: 400 }, hub: 'nowhere', x: 'a' });
    expect(m?.wallet).toBe(0); expect(m?.needs.faim).toBe(100); expect(m?.hub).toBe('pikine'); expect(m?.x).toBe(0);
    expect(migrate({ schemaVersion: SCHEMA_VERSION + 1 })).toBeNull();
    expect(migrate('x')).toBeNull();
  });
  it('survives corrupt storage', () => {
    const s = mem(); s.setItem(SAVE_KEY, '{oops');
    expect(loadSave(s)).toBeNull();
  });
});

describe('needs', () => {
  it('drain with played time and stay within 0..100', () => {
    const g = new GameState(); g.tick(10 * 60000);
    expect(g.data.needs.faim).toBeLessThan(70);
    g.tick(1e9);
    for (const v of Object.values(g.data.needs)) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(100); }
  });
  it('never lets the wallet go negative', () => {
    const g = new GameState(); g.addMoney(-1e6); expect(g.wallet).toBe(0);
  });
});
