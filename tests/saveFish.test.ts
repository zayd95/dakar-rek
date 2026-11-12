import { describe, expect, it } from 'vitest';
import { GameState } from '../src/core/state';
import { SAVE_KEY, loadSave, newSave, writeSave, type KV } from '../src/core/save';
import { Seats } from '../src/interact/seats';
import { ActivityRunner, type ActivityServices } from '../src/activity/runner';
import { Inventory } from '../src/activity/inventory';
import { FISH_PRICE } from '../src/activity/templates';
import { adoptStallItems } from '../src/economy/wear';
import * as P from '../src/activity/primitives';

/**
 * The catch sold at Soumbédioune survives a reload (check-venues « the 2 left are saved in the inventory »): the sale goes
 * through the activity runner, which saves at its end through the real save (writeSave), and a reload (loadSave, then
 * the start-up's adoptStallItems) gives back the fish left. Since schema v5 they are in the save's own `inventory`
 * field, no longer in the counters as `inv:poisson`.
 */
function memoryStore(): KV & { raw(): Record<string, unknown> } {
  const m = new Map<string, string>();
  return { getItem: k => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: k => { m.delete(k); }, raw: () => JSON.parse(m.get(SAVE_KEY) ?? '{}') };
}

describe('the fish left after a sale are saved and come back', () => {
  it('selling 4 of 6 fish pays 2 400 F; the save written at the end of the sale holds the 2 left; a reload gives them back', () => {
    const store = memoryStore();
    const state = new GameState(newSave()); state.data.wallet = 1000;
    const inv = new Inventory(state);
    inv.add('poisson', 6);
    let saves = 0;
    const s: ActivityServices = {
      state, seats: new Seats(), space: () => 'street', player: () => ({ x: 0, z: 0 }), seated: () => null,
      sit: () => false, clip: () => {}, busy: () => {}, progress: () => {}, toast: () => {},
      save: () => { saves++; writeSave(store, state.data); },                  // what main.ts does: saveNow → writeSave
      item: (id, d) => inv.add(id, d), rel: () => {}, category: () => {},
    };
    const runner = new ActivityRunner(s);
    expect(runner.start(P.sell({ id: 'vendre', label: 'Vendre 4 poissons', price: FISH_PRICE.sell * 4, items: { poisson: 4 } }), { place: 'Soumbédioune' })).toBe(true);
    for (let t = 0; t < 10 && runner.running; t += 0.25) runner.update(0.25);
    expect(runner.running).toBe(false);
    expect(state.wallet).toBe(1000 + 2400);
    expect(inv.count('poisson')).toBe(2);
    expect(saves).toBeGreaterThanOrEqual(1);
    // what the check reads in localStorage: the save's own inventory, not the counters
    const raw = store.raw() as { inventory?: Record<string, number>; counters?: Record<string, number> };
    expect(raw.inventory?.poisson).toBe(2);
    expect(raw.counters?.['inv:poisson']).toBeUndefined();
    // a reload, then what the game does at start-up with the inventory
    const back = loadSave(store)!;
    const st2 = new GameState(back);
    adoptStallItems(st2);
    expect(st2.data.inventory.poisson).toBe(2);
    expect(st2.wallet).toBe(3400);
  });
});
