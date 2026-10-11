import { describe, it, expect } from 'vitest';
import { SAVE_KEY, SCHEMA_VERSION, loadSave, resumeSpot } from '../src/core/save';
import { GameState } from '../src/core/state';
import { HUB_IDS, type HubId } from '../src/core/types';
import { rankOf, summary } from '../src/career/career';
import { recordDay, scoresOf, stepsCrossed } from '../src/career/progress';
import { ticketTier } from '../src/arena/program';
import { tierRows } from '../src/arena/tickets';
import { WEAR } from '../src/economy/catalog';
import { holds, assetsOf } from '../src/economy/assets';
import { WORN_COUNTER, adoptStallItems, fanOf, setWorn, worn } from '../src/economy/wear';
import { vendorPlaces } from '../src/arena/exteriorRules';
import { parseMove } from '../src/multiplayer/protocol';
import { stubCanvas } from './hubstub';

/**
 * Saves from every older schema, through the real load (`loadSave`: a JSON string in the device's storage) and the
 * real migration, then what the wave-5 code reads at start-up (the career, the ticket tiers, the supporters' colours,
 * the presence field), and where the player resumes (`resumeSpot`, main.ts loadHub).
 */
const store = (raw: unknown) => { const m = new Map([[SAVE_KEY, JSON.stringify(raw)]]); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }; };

const V1 = { schemaVersion: 1, guestId: 'g-old1', createdAt: 1_700_000_000_000, savedAt: 1_700_000_100_000, playedMs: 600_000, hub: 'pikine', x: 12.5, z: -8, yaw: 1.2,
  wallet: 4250, needs: { faim: 40, energie: 60, moral: 55, social: 30, hygiene: 70 }, counters: { combats: 2, victoires: 1, lamb_skill: 3 } };
const V2 = { ...V1, schemaVersion: 2, guestId: 'g-old2', hub: 'plateau', wallet: 18_000, rel: { 'ibou|player': 20, 'ablaye|player': 35 }, flags: ['met_ibou', 'ecurie_baobab'],
  beats: { ibou_welcome: 'merci' }, wrestler: { ngembColor: 'vert', ngembPattern: 'bordure', accessories: ['gris_gris'] } };
const V3 = { ...V2, schemaVersion: 3, guestId: 'g-old3', hub: 'almadies', wallet: 52_300, ledger: [{ at: 1, label: 'Livraison', amount: 1200 }],
  jobs: { active: null, done: ['r1', 'r2'], seq: 2 }, furniture: ['lit_bois', 'natte'] };
const V4 = { ...V3, schemaVersion: 4, guestId: 'g-old4', hub: 'corniche', wallet: 260_000, activities: { known: ['livraison', 'services'], last: { livraison: 500_000, services: 400_000 } },
  business: { owned: { bana: 2 }, clockMs: 550_000, payMs: 550_000, carry: 120, earned: 9000 }, counters: { ...V1.counters, 'inv:poisson': 3 } };
/** A v5 save from before the career, the ticket tiers, the supporters' stall and the wear counter. */
const V5_PRE = { ...V4, schemaVersion: 5, guestId: 'g-old5', hub: 'pikine', wallet: 1_250_000, inventory: { poisson: 2 },
  assets: { list: [{ uid: 'a1', spec: 'chambre_pikine', how: 'given', since: 0, paid: 0, condition: 100, upgrades: [], leased: false }], seq: 1, home: 'a1', clockMs: 600_000, payMs: 600_000, carryIn: 0, carryOut: 0, earned: 0, spent: 0, arrears: 0, adUntil: 0 } };
delete (V5_PRE as Record<string, unknown>).furniture; delete (V5_PRE as Record<string, unknown>).business;
/** A v5 save of the integration/living-dakar build: a career without galas or gauges, a « Populaire » ticket of a past
 * evening, and a scarf and a flag bought at the old stall (inventory items, before « Couleurs du Géew »). */
const V5_LIVING = { ...V5_PRE, guestId: 'g-old6', wallet: 7300, inventory: { echarpe_baobab: 1, drapeau_teranga: 2, poisson: 1 },
  counters: { ...V1.counters, arena_ticket_day: 9, arena_gala_day: 9 },
  career: { bouts: [{ at: 1, day: 8, mode: 'classe', opp: 'Gora', style: 'Costaud', level: 2, res: 'V', how: 'projection', purse: 8250, pts: 28 }], best: 1 } };

const FIXTURES: [string, Record<string, unknown>][] = [['v1', V1], ['v2', V2], ['v3', V3], ['v4', V4], ['v5 (before the career)', V5_PRE], ['v5 (living-dakar)', V5_LIVING]];

describe('old saves: loaded through the real load and migration', () => {
  for (const [name, raw] of FIXTURES) {
    it(`${name}: no crash, money kept, the same hub and spot, the wave-5 fields start empty`, () => {
      const data = loadSave(store(raw));
      expect(data).not.toBeNull();
      const s = new GameState(data!);
      expect(s.data.schemaVersion).toBe(SCHEMA_VERSION);
      expect(s.wallet).toBe(raw.wallet);                                                       // money kept
      expect(s.data.hub).toBe(raw.hub); expect(HUB_IDS).toContain(s.data.hub);
      expect([s.data.x, s.data.z, s.data.yaw]).toEqual([raw.x, raw.z, raw.yaw]);
      // the career: an empty record (or the one kept), its rank and gauges' history readable
      const c = s.data.career;
      expect(Array.isArray(c.bouts)).toBe(true); expect(c.galas).toEqual([]);
      expect(() => rankOf(c.bouts, 12)).not.toThrow(); expect(summary(c.bouts).bouts).toBe(c.bouts.length);
      expect(recordDay(c.dims ?? [], 12, scoresOf([]))).toHaveLength(1);
      expect(stepsCrossed(c.dimBest, [10, 10, 10, 10]).up).toEqual([]);                         // the first look only remembers
      // tickets: an older evening's ticket is no ticket tonight; the window's rows from the wallet
      expect(ticketTier(s.data.counters, 12)).toBeNull();
      expect(tierRows(s.wallet)).toHaveLength(3);
      // the supporters' colours: nothing worn, nothing to say over the protocol
      expect(worn(s)).toBeNull(); expect(fanOf(worn(s))).toBeNull();
      expect(s.data.counters[WORN_COUNTER]).toBeUndefined();
      s.tick(60_000); s.addMoney(-100, 'Test');                                               // the game runs on it
      expect(s.wallet).toBe((raw.wallet as number) - 100);
    });
  }
  it('older saves keep what they had: relations, flags, ledger, deliveries, ventures and furniture as assets, the inventory', () => {
    const v4 = new GameState(loadSave(store(V4))!);
    expect(v4.data.rel['ablaye|player']).toBe(35); expect(v4.data.flags).toContain('ecurie_baobab');
    expect(v4.data.ledger).toHaveLength(1); expect(v4.data.jobs.done).toEqual(['r1', 'r2']);
    expect(v4.data.inventory).toEqual({ poisson: 3 });
    expect(v4.data.assets.list.filter(a => a.spec === 'bana')).toHaveLength(2);
    expect(v4.data.assets.list.filter(a => a.home).map(a => a.spec).sort()).toEqual(['lit_bois', 'natte']);
    expect(v4.data.activities.known).toEqual(expect.arrayContaining(['livraison', 'service']));
    const living = new GameState(loadSave(store(V5_LIVING))!);
    expect(living.data.career.bouts).toHaveLength(1); expect(rankOf(living.data.career.bouts, 12).score).toBeGreaterThan(0);
    expect(assetsOf(living, 'wear')).toEqual([]);                                             // not yet: see the stall's scarves below
  });
  it('the player is put back in the city: a spot inside the hub is kept, one outside it (an older map, a bad value) gives the spawn', async () => {
    stubCanvas();
    const { buildHub } = await import('../src/world/builder');
    const hubs = new Map<HubId, ReturnType<typeof buildHub>>();
    const hub = (id: HubId) => { if (!hubs.has(id)) hubs.set(id, buildHub(id, true)); return hubs.get(id)!; };
    for (const [, raw] of FIXTURES) {
      const d = loadSave(store(raw))!, w = hub(d.hub);
      const inside = { x: (w.bounds.x0 + w.bounds.x1) / 2, z: (w.bounds.z0 + w.bounds.z1) / 2, yaw: d.yaw };
      expect(resumeSpot(inside, w.bounds, w.spawn)).toBe(inside);
      for (const far of [{ x: 99_999, z: d.z, yaw: 0 }, { x: d.x, z: -99_999, yaw: 0 }, { x: Number.NaN, z: 0, yaw: 0 }]) expect(resumeSpot(far, w.bounds, w.spawn)).toBe(w.spawn);
      expect(resumeSpot(undefined, w.bounds, w.spawn)).toBe(w.spawn);
      const sp = w.spawn, b = w.bounds;
      expect(sp.x >= b.x0 && sp.x <= b.x1 && sp.z >= b.z0 && sp.z <= b.z1).toBe(true);
    }
    // a corrupt position in the stored save: the migration gives 0, 0, and the game starts at the hub's spawn
    const bad = loadSave(store({ ...V1, x: 'far', z: null, yaw: Infinity }))!;
    expect([bad.x, bad.z, bad.yaw]).toEqual([0, 0, 0]);
  }, 60_000);
  it('a moved player is still one the protocol accepts: the resumed yaw and position are finite', () => {
    for (const [, raw] of FIXTURES) {
      const d = loadSave(store(raw))!;
      expect(parseMove({ type: 'move', x: d.x, y: 0.1, z: d.z, yaw: d.yaw, speed: 0, space: 'street', clip: 'Idle' }, d.hub)).not.toBeNull();
    }
  });
});

describe('old saves: the scarves and flags bought at the old arena stall', () => {
  it('become the owned pieces they are now (« Biens », wearable), off the inventory; the stall no longer sells them again', () => {
    const s = new GameState(loadSave(store(V5_LIVING))!);
    // before: inventory items with the pieces' own ids, not owned, sold again at the stall
    expect(WEAR.map(w => w.id)).toEqual(expect.arrayContaining(['echarpe_baobab', 'drapeau_teranga']));
    expect(holds(s, 'echarpe_baobab')).toBe(false);
    const stall = () => vendorPlaces('pikine', { cx: 0, cz: 0 }, { owns: id => holds(s, id) }).find(p => p.id.endsWith(':supporters'))!.offers.stall;
    const refused = (id: string) => stall().find(o => o.id === id)?.requires?.() ?? null;
    expect(refused('echarpe_baobab')).toBeNull();
    const wallet = s.wallet;
    expect(adoptStallItems(s).sort()).toEqual(['drapeau_teranga', 'echarpe_baobab']);
    expect(holds(s, 'echarpe_baobab')).toBe(true); expect(holds(s, 'drapeau_teranga')).toBe(true);
    expect(s.data.inventory).toEqual({ poisson: 1 });                                         // the rest of the inventory kept
    expect(s.wallet).toBe(wallet);                                                            // nothing paid or given
    expect(worn(s)).toBeNull();                                                               // nothing put on by itself
    expect(setWorn(s, 'drapeau_teranga')).toBe(true); expect(fanOf(worn(s))).toEqual({ e: 'teranga', k: 'flag' });
    expect(refused('echarpe_baobab')).toMatch(/Déjà à toi/);
    expect(adoptStallItems(s)).toEqual([]);                                                   // once: nothing more the next start
    expect(assetsOf(s, 'wear').length).toBe(2);
  });
  it('a piece already owned is not doubled; a save without stall items is untouched', () => {
    const s = new GameState(loadSave(store(V5_LIVING))!);
    adoptStallItems(s);
    s.data.inventory.echarpe_baobab = 1;                                                      // somehow both
    expect(adoptStallItems(s)).toEqual([]);
    expect(assetsOf(s, 'wear').filter(a => a.spec === 'echarpe_baobab')).toHaveLength(1);
    expect(s.data.inventory.echarpe_baobab).toBeUndefined();
    const plain = new GameState(loadSave(store(V5_PRE))!), before = JSON.stringify(plain.data);
    expect(adoptStallItems(plain)).toEqual([]); expect(JSON.stringify(plain.data)).toBe(before);
  });
});
