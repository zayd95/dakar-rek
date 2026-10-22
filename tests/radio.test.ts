import { describe, expect, it } from 'vitest';
import { RADIO_LEVEL, STATIONS, VOLUMES, radioGain } from '../src/transport/radio';
import { PROFILES } from '../src/transport/vehicleAudio';

/** The car's radio (src/transport/radio.ts): three stations, under the engine when accelerating, lowered by the horn, a knock, the phone and the job's card. */
describe('the car radio', () => {
  const base = { volume: 1, throttle: 0, ducks: [], now: 10, phone: false, horn: false };
  it('three stations, named as a Dakar listener would', () => {
    expect(STATIONS.map(s => s.name)).toEqual(['Sénégal Hits', 'Radio Téranga', 'Corniche FM']);
    expect(VOLUMES.map(v => v.v)).toEqual([0.45, 0.7, 1]);
  });
  it('the music stays under the engine when accelerating', () => {
    const full = radioGain({ ...base, throttle: 1 }), engineAccel = PROFILES.sedan.drive * PROFILES.sedan.level * (1 + PROFILES.sedan.swell);
    expect(full).toBeLessThan(engineAccel); expect(full).toBeLessThan(radioGain(base));
    expect(radioGain(base)).toBe(RADIO_LEVEL);
  });
  it('the horn, the phone, a knock and the card lower it; a duck ends', () => {
    expect(radioGain({ ...base, horn: true })).toBeLessThan(RADIO_LEVEL * 0.4);
    expect(radioGain({ ...base, phone: true })).toBeLessThan(RADIO_LEVEL * 0.35);
    expect(radioGain({ ...base, ducks: [{ f: 0.25, until: 12 }] })).toBeCloseTo(RADIO_LEVEL * 0.25, 6);
    expect(radioGain({ ...base, ducks: [{ f: 0.25, until: 9 }] })).toBe(RADIO_LEVEL);
    expect(radioGain({ ...base, volume: 0.45 })).toBeCloseTo(RADIO_LEVEL * 0.45, 6);
  });
});
