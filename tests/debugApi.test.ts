import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PUBLIC_DEBUG_HOOKS, debugApiFor, dropWorkInHand } from '../src/core/testParams';
import { GameState } from '../src/core/state';
import { newSave } from '../src/core/save';
import { acceptJob, completeJob } from '../src/economy/jobs';
import { fakeOnlineRequested } from '../src/online/fake';

/**
 * 1.0.1: `?debug` on the public game (src/main.ts `window.__dakar`). The public host keeps the hooks that read the game and the public smoke test's
 * moves; every hook that makes money or value, or changes the economy or a save's progress, exists on test hosts only (src/core/testParams.ts).
 */
const PUBLIC = 'dakar-rek.habibjallow95.workers.dev';
const text = (path: string) => new TextDecoder().decode(readFileSync(new URL(path, import.meta.url)));

/** A stand-in for the full API: every public hook, and the ones that move money, value or progress (names from src/main.ts, src/economy, the modules). */
const fn = () => () => 0;
const full = (): Record<string, unknown> => ({
  ...Object.fromEntries(PUBLIC_DEBUG_HOOKS.map(k => [k, fn()])),
  state: { addMoney: fn() }, rel: {}, giveMoney: fn(), buyVenture: fn(), buy: fn(), advancePlayed: fn(), acceptJob: fn(), completeJob: fn(), acceptTour: fn(),
  playBeat: fn(), nextDay: fn(), setHour: fn(), travelTo: fn(), character: fn(), save: fn(), phoneHooks: {}, account: fn(), three: {},
  econAdvance: fn(), bank: {}, credit: {}, estate: {}, garage: {}, bana: {}, streak: {}, pistes: {},
});

describe('the ?debug API by host', () => {
  it('on the public game: only the public hooks, none that makes money or changes progress', () => {
    const api = debugApiFor(PUBLIC, full(), () => {});
    expect(Object.keys(api).sort()).toEqual([...PUBLIC_DEBUG_HOOKS].sort());
    for (const k of ['state', 'rel', 'giveMoney', 'buyVenture', 'buy', 'advancePlayed', 'acceptJob', 'completeJob', 'acceptTour', 'playBeat', 'nextDay', 'setHour',
      'travelTo', 'character', 'save', 'phoneHooks', 'account', 'three', 'econAdvance', 'bank', 'credit', 'estate', 'garage', 'bana', 'streak', 'pistes']) expect(api, k).not.toHaveProperty(k);
  });
  it('a custom domain or any other host is treated as the public game', () => {
    for (const host of ['dakarrek.sn', 'evil-dakar-rek.example.com', '']) expect(debugApiFor(host, full(), () => {})).not.toHaveProperty('giveMoney');
  });
  it('on a test host (local, a Cloudflare preview): everything, unchanged', () => {
    for (const host of ['localhost', '127.0.0.1', 'wp101-opening-dakar-rek.habibjallow95.workers.dev']) {
      const a = full();
      expect(debugApiFor(host, a, () => {})).toBe(a);
    }
  });
  it('keeps every hook the public smoke test calls (scripts/check-public-smoke.mjs runs against the published address)', () => {
    const used = new Set([...text('../scripts/check-public-smoke.mjs').matchAll(/__dakar\??\.(\w+)/g)].map(m => m[1]));
    expect(used.size).toBeGreaterThanOrEqual(5);
    for (const k of used) expect(PUBLIC_DEBUG_HOOKS, k).toContain(k);
  });
  it('the public hooks only read or move (no money, item, job, rent, loan or save word in their names)', () => {
    for (const k of PUBLIC_DEBUG_HOOKS) expect(k).not.toMatch(/money|give|buy|pay|job|rent|loan|credit|save|state|set|advance|complete|bank/i);
  });
});

describe('a teleport on the public game is not a trip (?debug teleport onto a drop-off)', () => {
  it('drops the delivery and the ride in hand, unpaid, before the jump; the jump itself is the full API\'s', () => {
    const s = new GameState(newSave(0)), w0 = s.wallet;
    const run = acceptJob(s, 'pk_mame_boutique', true, 600_000)!;
    s.data.vtc.active = { id: 'V1', from: 'pikine', to: 'plateau', pickup: { x: 1, z: 2, name: 'A' }, dropoff: { x: 3, z: 4, name: 'B' }, fare: 3000, stage: 'aboard', passenger: { name: 'Awa', seed: 2 }, acceptedMs: 0 };
    const calls: string[] = [], api = { ...full(), teleport: (hub: string) => { calls.push(`jump:${hub}:${!!s.data.jobs.active}`); } };
    const pub = debugApiFor(PUBLIC, api, () => { calls.push(`drop:${dropWorkInHand(s.data)}`); }) as { teleport: (hub: string, x?: number, z?: number) => void };
    pub.teleport('pikine', 12, 34);
    expect(calls).toEqual(['drop:true', 'jump:pikine:false']);                                 // dropped first, then the jump
    expect(s.data.jobs.active).toBeNull(); expect(s.data.vtc.active).toBeNull();
    expect(completeJob(s, run.runId)).toBeNull(); expect(s.wallet).toBe(w0);                  // the arrival can no longer hand it over: nothing paid
    pub.teleport('plateau'); expect(calls.at(-2)).toBe('drop:false');                          // nothing in hand: the moves of the smoke test are unchanged
  });
  it('on a test host the API is untouched: the checks teleport with a run in hand', () => {
    let dropped = 0; const api = full();
    expect(debugApiFor('localhost', api, () => { dropped++; })).toBe(api);
    (api.teleport as () => void)(); expect(dropped).toBe(0);
  });
});

describe('the simulated online account (?debug&fakeonline)', () => {
  it('installs on test hosts only: its script pays the wallet', () => {
    expect(fakeOnlineRequested('?debug&fakeonline', 'localhost')).toBe(true);
    expect(fakeOnlineRequested('?debug&fakeonline', 'lane-x-dakar-rek.habibjallow95.workers.dev')).toBe(true);
    expect(fakeOnlineRequested('?debug&fakeonline', PUBLIC)).toBe(false);
    expect(fakeOnlineRequested('?fakeonline', 'localhost')).toBe(false);
  });
});
