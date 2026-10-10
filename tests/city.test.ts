import { describe, expect, it } from 'vitest';
import { ARENA_PARKED, LEAVING_FROM, SIZE_SHARE, arenaArrivals, arenaDepartures, curve, dropInterval, weatherAt, weatherStreet } from '../src/city/rules';
import { passengerPatterns } from '../src/transport/passengers';
import { carRapideSpec } from '../src/transport/carRapide';
import { LINES } from '../src/transport/lines';

describe('the streets round the arena on a fight evening', () => {
  it('arrivals build from 16 h to a peak before the bouts, nobody comes in the morning', () => {
    expect(arenaArrivals(10, 'gala')).toBe(0); expect(arenaArrivals(15.9, 'gala')).toBe(0);
    expect(arenaArrivals(17, 'gala')).toBeGreaterThan(0.2);
    expect(arenaArrivals(19, 'gala')).toBe(1);
    expect(arenaArrivals(21, 'gala')).toBeLessThan(0.4);
    for (let h = 16; h < 19; h += 0.25) expect(arenaArrivals(h + 0.25, 'gala')).toBeGreaterThanOrEqual(arenaArrivals(h, 'gala'));
  });

  it('everyone leaves after the main bout, the street is empty by midnight', () => {
    expect(arenaDepartures(20, 'gala')).toBe(0);
    expect(arenaDepartures(22.6, 'gala')).toBe(1); expect(arenaDepartures(LEAVING_FROM + 0.2, 'gala')).toBeGreaterThan(0.5);
    expect(arenaDepartures(23.99, 'gala')).toBeLessThan(0.05);
  });

  it('a weekday card brings fewer people than a gala', () => {
    expect(SIZE_SHARE.card).toBeLessThan(SIZE_SHARE.gala);
    expect(arenaArrivals(19, 'card')).toBeCloseTo(SIZE_SHARE.card);
    expect(dropInterval(arenaArrivals(19, 'card'), false)).toBeGreaterThan(dropInterval(arenaArrivals(19, 'gala'), false));
    expect(dropInterval(0, false)).toBe(Infinity); expect(dropInterval(1, true)).toBeGreaterThan(dropInterval(1, false));
    expect(ARENA_PARKED.low).toBe(0);
  });

  it('curves interpolate between their points and hold at the ends', () => {
    const c = [[10, 0], [12, 1]] as const;
    expect(curve(c, 11)).toBeCloseTo(0.5); expect(curve(c, 8)).toBe(0); expect(curve(c, 13)).toBe(1);
  });
});

describe('fuller car rapides on fight evenings', () => {
  it('the evening line packs its cars, still leaving seats for the player', () => {
    const spec = carRapideSpec(), eve = LINES.find(l => l.id === '23s')!;
    const gala = eve.fill!(4, 19), card = eve.fill!(1, 19);                  // day 4 is a Friday (city day 1 = Tuesday)
    expect(gala).toBeGreaterThan(card); expect(card).toBeGreaterThan(0.5);
    const taken = (fill: number) => passengerPatterns(spec.seats, 4, 23, 2, fill).reduce((t, p) => t + p.length, 0) / 4;
    expect(taken(gala)).toBeGreaterThan(taken(0.5));
    for (const p of passengerPatterns(spec.seats, 4, 23, 2, gala)) expect(spec.seats.filter(s => !s.npcOnly && !p.includes(s.id)).length).toBeGreaterThanOrEqual(2);
  });
});

describe('the day\'s weather', () => {
  it('is the same for everyone at the same city time, and changes from day to day', () => {
    expect(weatherAt(42, 15.3)).toEqual(weatherAt(42, 15.3));
    const kinds = new Set(Array.from({ length: 60 }, (_, d) => weatherAt(d, 15).kind === 'rain' || weatherAt(d, 14).kind === 'rain' ? 'wetday' : weatherAt(d, 15).kind));
    expect(kinds.size).toBeGreaterThan(1);
  });

  it('mostly sunny, some overcast days, an afternoon shower about one day in six', () => {
    let sun = 0, rainDays = 0;
    for (let d = 0; d < 600; d++) {
      if (weatherAt(d, 9).kind === 'sun' && weatherAt(d, 15).kind === 'sun') sun++;
      let rained = false;
      for (let h = 0; h < 24; h += 0.25) {
        const w = weatherAt(d, h);
        if (w.rain > 0) { rained = true; expect(h).toBeGreaterThanOrEqual(12); expect(h).toBeLessThan(19); expect(w.wet).toBe(1); }
      }
      if (rained) rainDays++;
    }
    expect(sun / 600).toBeGreaterThan(0.5); expect(rainDays / 600).toBeGreaterThan(0.08); expect(rainDays / 600).toBeLessThan(0.28);
  });

  it('the streets stay wet after a shower, drying within a few hours', () => {
    const day = Array.from({ length: 400 }, (_, d) => d).find(d => Array.from({ length: 96 }, (_, k) => weatherAt(d, k / 4)).some(w => w.kind === 'rain'))!;
    const ws = Array.from({ length: 96 }, (_, k) => weatherAt(day, k / 4));
    const last = ws.map(w => w.kind).lastIndexOf('rain');
    expect(ws[last + 1].kind).toBe('after'); expect(ws[last + 1].wet).toBeGreaterThan(0.8);
    expect(ws[Math.min(95, last + 4)].wet).toBeLessThan(ws[last + 1].wet);
    expect(ws[Math.min(95, last + 14)].wet).toBe(0);
  });

  it('rain empties the pavements and slows the cars; a dry day changes nothing', () => {
    const rain = weatherStreet({ kind: 'rain', cloud: 0.85, rain: 1, wet: 1 }), dry = weatherStreet({ kind: 'sun', cloud: 0, rain: 0, wet: 0 });
    expect(rain.walkers).toBeLessThan(0.5); expect(rain.speed).toBeLessThan(dry.speed); expect(rain.traffic).toBeLessThan(1);
    expect(dry).toEqual({ walkers: 1, traffic: 1, speed: 1 });
  });
});
