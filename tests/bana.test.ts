import { describe, expect, it } from 'vitest';
import { GameState } from '../src/core/state';
import { EXTRAS_KEY, EXTRAS_V2_KEY, EXTRAS_V3_KEY, EXTRA_FIELDS, EXTRA_FIELDS_V3, SAVE_KEY, loadSave, migrate, newSave, writeSave, type KV } from '../src/core/save';
import { ECONOMY } from '../src/economy/config';
import { HOUR_MS, accrue, buyVenture, incomePerHour, ownedOf } from '../src/economy/business';
import { BANA_FLAG, GOODS, closeSession, customer, goodById, nextClientIn, openSession, ownsTable, restock, serve, stockOf, stockValue, sync, tableCard, whyNotOpen, whyNotRestock } from '../src/economy/bana';
import { walkupLine, markWalkup } from '../src/social/walkup';
import { Relations } from '../src/social/relations';

/**
 * LD2.0-A, the player's bana-bana table (src/economy/bana.ts): the session's money is exact (sales − cost of the goods sold = profit, the till paid once),
 * the customers come from a clientèle that only played time rebuilds (no farming, nothing offline), the venture's hourly income is untouched, and the
 * table's state survives the save, a malformed save and a rollback to a client that does not know it.
 */
const mem = (m = new Map<string, string>()): KV & { m: Map<string, string> } => ({ m, getItem: k => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: k => { m.delete(k); } });
const player = (wallet = 200_000) => { const s = new GameState(newSave(1000)); s.data.wallet = wallet; s.data.play.day = 3; return s; };
const owner = (wallet = 200_000) => { const s = player(wallet); expect(buyVenture(s, 'bana')).toBe(true); sync(s); return s; };
const G = Object.fromEntries(GOODS.map(g => [g.id, g]));
const C = ECONOMY.bana.clientele;

describe('the table and the venture', () => {
  it('no table before a bana unit is owned; the one venture purchase sets it up with its first customers and the flag', () => {
    const s = player();
    expect(ownsTable(s)).toBe(false); expect(sync(s).since).toBe(-1);
    expect(whyNotOpen(s)).toMatch(/pas \(encore\) ta table/); expect(restock(s, 'arachides')).toBeNull();
    expect(buyVenture(s, 'bana')).toBe(true);
    const b = sync(s);
    expect(ownsTable(s)).toBe(true); expect(b.since).toBe(s.data.playedMs); expect(b.clients).toBe(C.start);
    expect(s.data.flags).toContain(BANA_FLAG);
    expect(s.data.ledger.at(-1)).toMatchObject({ label: 'Achat : Table de bana-bana', amount: -50_000 });
  });

  it('the venture’s hourly income is exactly what it was: a session, restocking and customers add no second passive stream', () => {
    const a = owner(), b = owner();                                 // b keeps its table, a does nothing with it
    const base = ECONOMY.business.tiers.find(t => t.id === 'bana')!.perHour;
    expect(incomePerHour(b)).toBe(base);
    restock(b, 'arachides'); restock(b, 'recharge'); openSession(b); serve(b); serve(b);
    expect(incomePerHour(b)).toBe(base);
    closeSession(b);
    for (const s of [a, b]) { s.data.playedMs += 3 * HOUR_MS; }
    const before = [a.wallet, b.wallet], paid = [accrue(a), accrue(b)];
    expect(paid).toEqual([3 * base, 3 * base]);
    expect([a.wallet - before[0], b.wallet - before[1]]).toEqual(paid);
    expect(a.data.ledger.at(-1)!.label).toBe('Revenus · Table de bana-bana');
  });

  it('several units are still one table: the others are the family’s, counted as before', () => {
    const s = owner(1_000_000);
    buyVenture(s, 'bana'); buyVenture(s, 'bana');
    const c = tableCard(s);
    expect(ownedOf(s, 'bana')).toBe(3); expect(c.units).toBe(3); expect(c.family).toBe(2);
    expect(incomePerHour(s)).toBe(3 * 400);
    expect(sync(s).clients).toBe(C.start);                          // more units bring no more customers to the player's own table
  });
});

describe('stock', () => {
  it('a lot is bought at the wholesaler’s cost, one ledger line; never beyond what the table holds, never without the money', () => {
    const s = owner(); s.data.wallet = 10_000;
    const r = restock(s, 'arachides')!;
    expect(r).toEqual({ units: G.arachides.lot, cost: G.arachides.lot * G.arachides.cost });
    expect(s.wallet).toBe(10_000 - r.cost);
    expect(s.data.ledger.at(-1)).toMatchObject({ amount: -r.cost, label: `Marchandise · bana-bana : ${G.arachides.lot} cornets d’arachides` });
    while (restock(s, 'arachides')) { /* fill it */ }
    expect(stockOf(s, 'arachides')).toBe(G.arachides.max);
    expect(whyNotRestock(s, 'arachides')).toMatch(/Plus de place/);
    s.data.wallet = 100;
    expect(whyNotRestock(s, 'recharge')).toBe('Pas assez d’argent'); expect(restock(s, 'recharge')).toBeNull(); expect(s.wallet).toBe(100);
    expect(GOODS.length).toBeLessThanOrEqual(3);
    for (const g of GOODS) { expect(g.price).toBeGreaterThan(g.cost); expect(g.max).toBeLessThanOrEqual(30); }
  });
});

describe('a session: sales − cost of the goods sold = profit, the till paid once', () => {
  it('serves each customer at the price of what they take, and closing pays exactly the till, once', () => {
    const s = owner();
    for (const g of GOODS) restock(s, g.id);
    const stock0 = Object.fromEntries(GOODS.map(g => [g.id, stockOf(s, g.id)])), value0 = stockValue(s), clients0 = sync(s).clients;
    expect(openSession(s)).not.toBeNull();
    let sales = 0, cost = 0, served = 0;
    for (;;) {
      const c = customer(s); if (!c) break;
      expect(c.qty).toBeGreaterThanOrEqual(1); expect(c.qty).toBeLessThanOrEqual(stockOf(s, c.good.id));
      expect(c.amount).toBe(c.qty * c.good.price); expect(c.cost).toBe(c.qty * c.good.cost);
      expect(customer(s)).toEqual(c);                               // the same person until served
      expect(serve(s)).toEqual(c);
      sales += c.amount; cost += c.cost; served++;
    }
    expect(served).toBe(clients0); expect(sync(s).clients).toBe(0);
    const sold = Object.fromEntries(GOODS.map(g => [g.id, stock0[g.id] - stockOf(s, g.id)]));
    expect(cost).toBe(GOODS.reduce((t, g) => t + sold[g.id] * g.cost, 0));
    expect(value0 - stockValue(s)).toBe(cost);
    const w0 = s.wallet, n0 = s.data.ledger.length;
    const r = closeSession(s, 5)!;
    expect(r).toMatchObject({ sales, cost, profit: sales - cost, served, day: 3, at: 5 });
    expect(s.wallet - w0).toBe(sales);                              // the till, once
    expect(s.data.ledger.length).toBe(n0 + 1);
    expect(s.data.ledger.at(-1)).toMatchObject({ amount: sales, label: `Recette · Table de bana-bana (${served} clients)` });
    expect(closeSession(s)).toBeNull(); expect(s.wallet - w0).toBe(sales);   // a second close (a double tap) pays nothing
    const b = sync(s);
    expect(b.last).toEqual(r); expect(b.today).toBe(r.profit); expect(b.total).toBe(r.profit); expect(b.sessions).toBe(1);
    expect(r.profit).toBeGreaterThan(0);
  });

  it('a full table of customers is worth about a Tiak Tiak delivery, never many of them', () => {
    const pays = Object.values(ECONOMY.tiak.pay).filter(p => p <= 2400);
    const per = GOODS.map(g => g.qty[1] * (g.price - g.cost));        // the best a customer can bring
    const best = C.max * Math.max(...per), typical = C.max * GOODS.reduce((t, g) => t + ((g.qty[0] + g.qty[1]) / 2) * (g.price - g.cost), 0) / GOODS.length;
    expect(typical).toBeGreaterThanOrEqual(Math.min(...pays));        // worth doing
    expect(best).toBeLessThanOrEqual(3 * Math.max(...pays));          // never dwarfs the deliveries
  });

  it('profit = sales − cost exactly over many random sessions; the money is only ever the till and the stock bought', () => {
    const s = owner(5_000_000);
    let bought = 0, paid = 0, profit = 0;
    for (let k = 0; k < 40; k++) {
      for (const g of GOODS) { const r = restock(s, g.id); if (r) bought += r.cost; }
      s.data.playedMs += (k % 5) * HOUR_MS;
      if (!openSession(s)) continue;
      for (let i = 0; i < (k % 7) + 1; i++) serve(s);
      const w = s.wallet, r = closeSession(s)!;
      expect(r.profit).toBe(r.sales - r.cost); expect(s.wallet - w).toBe(r.sales);
      paid += r.sales; profit += r.profit;
    }
    const left = stockValue(s);
    expect(sync(s).total).toBe(profit);
    expect(paid - bought + left).toBe(profit);                        // what came in − what went out + what is still on the table = the profit
  });

  it('nothing to sell or nobody there: the table does not open', () => {
    const s = owner();
    expect(whyNotOpen(s)).toMatch(/Pas de marchandise/);
    restock(s, 'mouchoirs'); s.data.bana.clients = 0;
    expect(whyNotOpen(s)).toMatch(/Personne pour l’instant/); expect(openSession(s)).toBeNull();
  });
});

describe('the clientèle: played time only, no farming', () => {
  it('one customer per in-game hour of play, up to the maximum; reopening the table brings nobody', () => {
    const s = owner();
    for (const g of GOODS) restock(s, g.id);
    openSession(s); while (serve(s)) { /* everyone */ } closeSession(s);
    expect(sync(s).clients).toBe(0);
    for (let i = 0; i < 5; i++) { openSession(s); closeSession(s); }   // open and close again and again
    expect(sync(s).clients).toBe(0); expect(openSession(s)).toBeNull();
    s.data.playedMs += HOUR_MS - 1; expect(sync(s).clients).toBe(0); expect(nextClientIn(s)).toBe(1);
    s.data.playedMs += 1; expect(sync(s).clients).toBe(1);
    s.data.playedMs += 2.5 * HOUR_MS; expect(sync(s).clients).toBe(3);
    s.data.playedMs += 100 * HOUR_MS; expect(sync(s).clients).toBe(C.max); expect(nextClientIn(s)).toBe(Infinity);
    s.data.playedMs += 10 * HOUR_MS; expect(sync(s).clients).toBe(C.max);   // a full clientèle does not bank more
    serve(s); expect(sync(s).clients).toBe(C.max);                        // (no session: nothing served)
  });

  it('nothing grows offline or with the device clock: only playedMs counts; a clock ahead of the played time is pulled back', () => {
    const s = owner(); s.data.bana.clients = 0; s.data.bana.clientMs = s.data.playedMs;
    const realNow = Date.now; Date.now = () => realNow() + 30 * 86_400_000;
    try { expect(sync(s).clients).toBe(0); } finally { Date.now = realNow; }
    s.data.bana.clientMs = s.data.playedMs + 50 * HOUR_MS;
    expect(sync(s).clients).toBe(0); expect(s.data.bana.clientMs).toBe(s.data.playedMs);
  });

  it('a new day starts a new « today »; the total keeps counting', () => {
    const s = owner(); restock(s, 'arachides'); openSession(s); serve(s); const r1 = closeSession(s)!;
    s.data.play.day = 4; s.data.playedMs += 3 * HOUR_MS;
    expect(sync(s).today).toBe(0);
    openSession(s); serve(s); const r2 = closeSession(s)!;
    expect(sync(s).today).toBe(r2.profit); expect(sync(s).total).toBe(r1.profit + r2.profit);
  });
});

describe('the neighbour’s line', () => {
  it('Modou says it once, even to a player he has not met; never again', () => {
    const s = owner(), r = new Relations(s.data);
    const said = walkupLine('modou', s, r, 1, 11)!;
    expect(said).toMatchObject({ key: 'bana', once: true }); expect(said.line).toMatch(/table/);
    markWalkup('modou', said, s, 1, 11);
    expect(sync(s).ack).toBe(true);
    expect(walkupLine('modou', s, r, 1, 15)).toBeNull();              // a stranger only hears the news, and only once
    const p = player(); expect(walkupLine('modou', p, new Relations(p.data), 1, 11)).toBeNull();   // no table, no news
  });
});

describe('the table in the save', () => {
  it('survives a reload exactly, the open session’s till included', () => {
    const store = mem(), s = owner();
    restock(s, 'arachides'); restock(s, 'recharge'); openSession(s); serve(s); serve(s);
    writeSave(store, s.data);
    const back = loadSave(store)!;
    expect(back.bana).toEqual(s.data.bana);
    const t = new GameState(back), w = t.wallet, till = back.bana.open!.sales;
    expect(closeSession(t)!.sales).toBe(till); expect(t.wallet - w).toBe(till);
  });

  it('a save without the field (every save before LD2.0) gets an empty table; one that owns bana units gets its table at once, with sane defaults', () => {
    const d = migrate({ ...newSave(1), bana: undefined })!;
    expect(d.bana).toEqual({ since: -1, stock: {}, clients: 0, clientMs: 0, open: null, last: null, day: -1, today: 0, total: 0, sessions: 0, seq: 0, ack: false });
    const old = player(); buyVenture(old, 'bana'); buyVenture(old, 'bana'); old.data.playedMs = 9 * HOUR_MS;
    const raw = JSON.parse(JSON.stringify(old.data)); delete raw.bana;
    const s = new GameState(migrate(raw)!);
    const b = sync(s);
    expect(ownedOf(s, 'bana')).toBe(2); expect(b.since).toBe(9 * HOUR_MS); expect(b.clients).toBe(C.start); expect(b.stock).toEqual({}); expect(b.open).toBeNull();
  });

  it('a malformed table is cleaned: whole non-negative amounts, clocks never ahead, the last profit always its sales − cost', () => {
    const d = migrate({ ...newSave(1), playedMs: 1000, bana: {
      since: 5000, stock: { arachides: -3, recharge: 4.7, 'BAD KEY': 3, mouchoirs: 'x' }, clients: -2, clientMs: 99_999,
      open: { id: 3, startedMs: 50_000, sales: -10, cost: 20.4, served: 2, sold: { arachides: 2 } },
      last: { id: 2, day: 1, at: 7, sales: 900, cost: 400, profit: 1_000_000, served: 3, sold: {} }, seq: 1, today: 'x', total: 500, sessions: -1, ack: 'yes',
    } })!;
    expect(d.bana).toMatchObject({ since: 1000, stock: { recharge: 4 }, clients: 0, clientMs: 1000, seq: 3, today: 0, total: 500, sessions: 0, ack: false });
    expect(d.bana.open).toEqual({ id: 3, startedMs: 1000, sales: 0, cost: 20, served: 2, sold: { arachides: 2 } });
    expect(d.bana.last!.profit).toBe(500);
    expect(migrate({ ...newSave(1), bana: 'nonsense' })!.bana.since).toBe(-1);
  });

  it('a rollback to a client that does not know the table (it saves without it, and rewrites the first two backups) never loses it', () => {
    expect(EXTRA_FIELDS_V3).toContain('bana'); expect(EXTRA_FIELDS as readonly string[]).not.toContain('bana');
    const store = mem(), s = owner();
    restock(s, 'arachides'); openSession(s); serve(s); closeSession(s); restock(s, 'mouchoirs');
    writeSave(store, s.data);
    expect(JSON.parse(store.getItem(EXTRAS_V3_KEY)!).bana).toEqual(s.data.bana);
    // the older client: rebuilds the save from the fields it knows (no `bana`), adds 1 000 F of work, writes its two backups without it
    const old = JSON.parse(store.getItem(SAVE_KEY)!); delete old.bana; old.wallet += 1_000;
    store.setItem(SAVE_KEY, JSON.stringify(old));
    const extras = JSON.stringify({ guestId: old.guestId, savedAt: Date.now() + 5, ...Object.fromEntries(EXTRA_FIELDS.map(k => [k, old[k]])) });
    store.setItem(EXTRAS_KEY, extras); store.setItem(EXTRAS_V2_KEY, extras);
    const back = loadSave(store)!;
    expect(back.bana).toEqual(s.data.bana); expect(back.wallet).toBe(s.data.wallet + 1_000);
    expect(goodById('mouchoirs')).toBeTruthy(); expect(back.bana.stock.mouchoirs).toBe(G.mouchoirs.lot);
  });

  it('another game on the device (another guest) never takes this one’s table', () => {
    const store = mem(), s = owner(); restock(s, 'arachides'); writeSave(store, s.data);
    const other = newSave(2); other.guestId = 'someone-else';
    const raw = JSON.parse(JSON.stringify(other)); delete raw.bana;
    store.setItem(SAVE_KEY, JSON.stringify(raw));
    expect(loadSave(store)!.bana.since).toBe(-1);
  });
});
