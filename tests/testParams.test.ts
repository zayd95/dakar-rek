import { describe, expect, it, vi } from 'vitest';
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
    expect(readTestParams(host, '?heure=17.5&argent=1000000')).toEqual({ hour: 17.5, money: 1000000, avatar: null, weather: null, intro: false, pouce: false });
    expect(readTestParams(host, '?heure=25&argent=-3')).toEqual({ hour: null, money: null, avatar: null, weather: null, intro: false, pouce: false });
    expect(readTestParams(host, '')).toEqual({ hour: null, money: null, avatar: null, weather: null, intro: false, pouce: false });
  });
  it('do nothing on production', () => {
    expect(readTestParams('dakar-rek.habibjallow95.workers.dev', '?heure=17.5&argent=1000000')).toEqual({ hour: null, money: null, avatar: null, weather: null, intro: false, pouce: false });
  });
  it('force the opening fly-in on request (?intro), on preview hosts only', () => {
    expect(readTestParams('localhost', '?debug&intro').intro).toBe(true);
    expect(readTestParams('lane-x-dakar-rek.habibjallow95.workers.dev', '?intro').intro).toBe(true);
    expect(readTestParams('localhost', '?debug').intro).toBe(false);
    expect(readTestParams('dakar-rek.habibjallow95.workers.dev', '?intro').intro).toBe(false);
  });
  it('keep « Coups de pouce » on in a ?debug run on request (?pouce), on preview hosts only', () => {
    expect(readTestParams('localhost', '?debug&pouce').pouce).toBe(true);
    expect(readTestParams('localhost', '?debug').pouce).toBe(false);
    expect(readTestParams('dakar-rek.habibjallow95.workers.dev', '?debug&pouce').pouce).toBe(false);   // (the public host has the ladder whatever the link: src/economy/pouce.ts pouceWanted)
  });
  it('holds a weather on request, on preview hosts only', () => {
    expect(readTestParams('localhost', '?meteo=pluie').weather).toBe('rain');
    expect(readTestParams('localhost', '?meteo=apres').weather).toBe('after');
    expect(readTestParams('localhost', '?meteo=orage').weather).toBeNull();
    expect(readTestParams('dakar-rek.example.com', '?meteo=pluie').weather).toBeNull();
  });
  it('an offline preview build (VITE_PREVIEW_TEST) carries its own link on any host, the page\'s query can override it, and a normal build has neither', async () => {
    vi.stubEnv('VITE_PREVIEW_TEST', 'true'); vi.stubEnv('VITE_PREVIEW_SEARCH', '?argent=200000000&heure=11'); vi.resetModules();
    const p = await import('../src/core/testParams');
    expect(p.isTestHost('abc.claudeusercontent.com')).toBe(true);
    expect(p.readTestParams('abc.claudeusercontent.com', '')).toEqual({ hour: 11, money: 200000000, avatar: null, weather: null, intro: false, pouce: false });
    expect(p.readTestParams('abc.claudeusercontent.com', '?touch&argent=5')).toEqual({ hour: 11, money: 5, avatar: null, weather: null, intro: false, pouce: false });
    vi.unstubAllEnvs(); vi.resetModules();
    const n = await import('../src/core/testParams');
    expect(n.isTestHost('abc.claudeusercontent.com')).toBe(false);
    expect(n.readTestParams('abc.claudeusercontent.com', '?argent=200000000')).toEqual({ hour: null, money: null, avatar: null, weather: null, intro: false, pouce: false });
  });
});
