import { describe, it, expect } from 'vitest';
import { cityTimeAt, CITY_EPOCH_MS, CITY_DAY_MS, daylight } from '../src/core/clock';
import { migrate, newSave, loadSave, writeSave, SAVE_KEY, SCHEMA_VERSION } from '../src/core/save';
import { GameState } from '../src/core/state';

const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m }; };

describe('city clock', () => {
  it('is identical for the same instant and one city day is 24 real minutes', () => {
    const t = CITY_EPOCH_MS + 1234567;
    expect(cityTimeAt(t)).toEqual(cityTimeAt(t));
    expect(cityTimeAt(CITY_EPOCH_MS + CITY_DAY_MS).day).toBe(2);
    expect(cityTimeAt(CITY_EPOCH_MS + CITY_DAY_MS / 2).hour).toBe(12);
  });
  it('has daylight at noon and none at midnight', () => {
    expect(daylight(12.5)).toBeGreaterThan(0.9);
    expect(daylight(0)).toBe(0);
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
