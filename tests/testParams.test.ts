import { describe, expect, it } from 'vitest';
import { isTestHost, readTestParams } from '../src/core/testParams';

describe('preview test links', () => {
  it('are honoured on local dev and Cloudflare preview hosts only', () => {
    expect(isTestHost('localhost')).toBe(true);
    expect(isTestHost('lane-npc-football-dakar-rek.habibjallow95.workers.dev')).toBe(true);
    expect(isTestHost('fd6e3094-dakar-rek.habibjallow95.workers.dev')).toBe(true);
    expect(isTestHost('dakar-rek.habibjallow95.workers.dev')).toBe(false);
    expect(isTestHost('evil-dakar-rek.example.com')).toBe(false);
  });
  it('read the hour and the money', () => {
    const host = 'lane-npc-football-dakar-rek.habibjallow95.workers.dev';
    expect(readTestParams(host, '?heure=17.5&argent=1000000')).toEqual({ hour: 17.5, money: 1000000 });
    expect(readTestParams(host, '?heure=25&argent=-3')).toEqual({ hour: null, money: null });
    expect(readTestParams(host, '')).toEqual({ hour: null, money: null });
  });
  it('do nothing on production', () => {
    expect(readTestParams('dakar-rek.habibjallow95.workers.dev', '?heure=17.5&argent=1000000')).toEqual({ hour: null, money: null });
  });
});
