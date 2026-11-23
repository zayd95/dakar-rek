import { describe, expect, it } from 'vitest';
import { BOARD, FASCIA, SHOP_NAMES } from '../src/game/pikineDna';
import { signCanvasSize } from '../src/world/batch';

describe('the Pikine street DNA signs', () => {
  it('has no « Télécentre » any more, and a Multiservice Jàmm with what it sells', () => {
    expect(SHOP_NAMES.some(n => /t[ée]l[ée]centre/i.test(n.name + [n.sub].flat().join(' ')))).toBe(false);
    const ms = SHOP_NAMES.find(n => n.name === 'MULTISERVICE JÀMM');
    expect(ms).toBeDefined();
    const lines = [ms!.sub].flat().join(' ');
    for (const w of ['Wave', 'Orange Money', 'Impression', 'Photocopie']) expect(lines).toContain(w);
  });
  it('gives each shop a name of its own, short enough to be read from the phone camera', () => {
    const names = SHOP_NAMES.map(n => n.name);
    expect(new Set(names).size).toBe(names.length);
    for (const n of SHOP_NAMES) { expect(n.name.length).toBeLessThanOrEqual(18); expect([n.sub].flat().length).toBeLessThanOrEqual(2); }
  });
  it('keeps one look per trade: every trade has a name', () => {
    const trades = new Set(SHOP_NAMES.map(n => n.trade));
    for (const t of ['boutique', 'couture', 'quinc', 'multiservice', 'cantine', 'pharmacie', 'coiffure', 'cyber', 'supporters']) expect(trades.has(t as never)).toBe(true);
  });
  it('cuts every board in a cell of its own proportions, within a small budget', () => {
    for (const [id, b] of [...Object.entries(BOARD), ['fascia', FASCIA]] as [string, { w: number; h: number; ppm: number }][]) {
      const cw = Math.round(b.w * b.ppm), ch = Math.round(b.h * b.ppm);
      expect(Math.abs(cw / ch / (b.w / b.h) - 1), id).toBeLessThan(0.015);
      expect(cw, id).toBeLessThanOrEqual(1024);
      expect(cw * ch * 4, id).toBeLessThan(200_000);
    }
  });
});

describe('builder sign canvases (draft PR #52, integrated)', () => {
  it('keeps the proportions of the board and stays under 80 px a metre', () => {
    for (const [w, h] of [[16.5, 0.8], [21, 0.8], [7.2, 1.0], [2.6, 0.7], [6, 1.5], [6.6, 0.42]] as const) {
      const c = signCanvasSize(w, h);
      expect(Math.abs(c.width / c.height / (w / h) - 1)).toBeLessThan(0.03);
      expect(c.width / w).toBeLessThanOrEqual(80.5);
      expect(c.width).toBeLessThanOrEqual(1536);
    }
  });
});
