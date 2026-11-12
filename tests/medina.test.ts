import { describe, expect, it } from 'vitest';
import { stubCanvas } from './hubstub';
import { buildHub, BLK, PITCH, ROAD } from '../src/world/builder';
import { placeParked, PARKED_COUNT } from '../src/game/parkedVehicles';
import { TRADE_PLACES } from '../src/districts/tradePlaces';

stubCanvas();
const HALF = 127, roadC = (k: number) => -HALF + ROAD / 2 + k * PITCH, blockMin = (i: number) => -HALF + ROAD + i * PITCH;   // (src/world/builder.ts)

/** M2's Médina quarter (src/world/builder.ts `medinaBlock`, the market streets; docs/districts/M2-PLATEAU-MEDINA.md): the four south-west blocks of the Plateau. */
describe('the Plateau’s Médina quarter', () => {
  const hub = buildHub('plateau', true);
  const inBlock = (c: { x0: number; z0: number; x1: number; z1: number }, i: number, j: number) => c.x0 >= blockMin(i) - 0.5 && c.x1 <= blockMin(i) + BLK + 0.5 && c.z0 >= blockMin(j) - 0.5 && c.z1 <= blockMin(j) + BLK + 0.5;

  it('is low: nothing in its blocks stands above three storeys (the Plateau around it rises to seven, and towers)', () => {
    for (const [i, j] of [[0, 2], [0, 3], [1, 2], [1, 3]]) {
      const here = hub.colliders.filter(c => inBlock(c, i, j));
      expect(here.length).toBeGreaterThan(4);
      for (const c of here) expect(c.h).toBeLessThanOrEqual(3 * 3.2 + 0.5);
    }
    expect(hub.colliders.some(c => inBlock(c, 3, 3) && c.h > 3 * 3.2 + 0.5) || hub.colliders.some(c => inBlock(c, 2, 0) && c.h > 3 * 3.2 + 0.5)).toBe(true);
  });

  it('its market streets keep their roads and pavements: nothing solid within 7 m of the centre line but the kerb’s lamp posts and the cloths’ poles (at the block edge)', () => {
    const streets = [{ c: roadC(1), t0: blockMin(2), t1: blockMin(3) + BLK, alongZ: true }, { c: roadC(3), t0: blockMin(0), t1: blockMin(1) + BLK, alongZ: false }];
    for (const s of streets) {
      const across = (c: (typeof hub.colliders)[number]) => (s.alongZ ? [c.x0, c.x1] : [c.z0, c.z1]);
      const along = (c: (typeof hub.colliders)[number]) => (s.alongZ ? [c.z0, c.z1] : [c.x0, c.x1]);
      const onIt = hub.colliders.filter(c => { const [a0, a1] = along(c), [b0, b1] = across(c); return a1 > s.t0 && a0 < s.t1 && b1 > s.c - ROAD / 2 + 0.3 && b0 < s.c + ROAD / 2 - 0.3; });   // (a kiosk's wall from before overhangs the block edge by 0.2 m)
      for (const c of onIt) expect(Math.max(c.x1 - c.x0, c.z1 - c.z0), JSON.stringify(c)).toBeLessThan(0.6);
    }
  });

  it('a merchants’ loading area on the z = 60 street, kept clear of parked cars; nothing of it on the Grande Mosquée’s block or its frontage', () => {
    expect((hub.keepClear ?? []).some(k => k.why === 'medina_bay' && k.z0 > roadC(3) && k.z1 <= roadC(3) + ROAD / 2)).toBe(true);
    // the cloths' poles (0.16 m, 5.5 m tall) stand only on the two market streets: none on the mosque's block or its frontage on the street at z = 0
    const poles = hub.colliders.filter(c => Math.abs(c.x1 - c.x0 - 0.16) < 0.01 && Math.abs(c.z1 - c.z0 - 0.16) < 0.01 && Math.abs(c.h - 5.5) < 0.01);
    expect(poles.length).toBeGreaterThan(8);
    for (const p of poles) expect(p.x0 > blockMin(1) - ROAD && p.x1 < blockMin(1) + BLK + ROAD && p.z0 > blockMin(1) - ROAD && p.z1 < blockMin(1) + BLK + ROAD, JSON.stringify(p)).toBe(false);
  });

  it('no parked car in the trade places’ loading bays or the merchants’ loading area (at every quality’s count)', () => {
    const bays = [...TRADE_PLACES.map(p => p.bay), ...(hub.keepClear ?? []).filter(k => k.why === 'medina_bay')];
    for (const n of [PARKED_COUNT.low, PARKED_COUNT.medium, PARKED_COUNT.high]) {
      const g = placeParked(hub, n);
      expect(g.children.length).toBeGreaterThan(0);
      for (const v of g.children) for (const b of bays) expect(v.position.x > b.x0 - 1 && v.position.x < b.x1 + 1 && v.position.z > b.z0 - 1 && v.position.z < b.z1 + 1, JSON.stringify([v.position, b])).toBe(false);
    }
  });
});
