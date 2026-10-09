import { describe, it, expect } from 'vitest';
import { GameState } from '../src/core/state';
import { newSave } from '../src/core/save';
import { Seats, benchSeats, type Seat } from '../src/interact/seats';
import { ActivityRunner, type ActivityServices } from '../src/activity/runner';
import { Places, isOpen, type PlaceSpec } from '../src/activity/places';
import { Inventory } from '../src/activity/inventory';
import { applyEffects, totals } from '../src/activity/effects';
import * as P from '../src/activity/primitives';
import type { Target } from '../src/interact/types';

function world(money = 5000) {
  const state = new GameState(newSave()); state.data.wallet = money; state.data.needs.faim = 20;
  const seats = new Seats(); seats.addAll(benchSeats('b', 0, 0, 0, 0.58, 'dibi'));
  let seated: Seat | null = null; const log: string[] = [];
  const inv = new Inventory(state);
  const s: ActivityServices = {
    state, seats, space: () => 'dibi', player: () => ({ x: 0, z: 2 }), seated: () => seated,
    sit: seat => { if (!seats.occupy(seat.id, 'player')) return false; seated = seat; log.push('sit:' + seat.id); return true; },
    clip: c => log.push('clip:' + c), busy: on => log.push('busy:' + on), progress: () => {}, toast: m => log.push('toast:' + m), save: () => log.push('save'),
    item: (id, d) => inv.add(id, d), rel: (n, d) => log.push(`rel:${n}${d}`), category: c => log.push('cat:' + c),
  };
  return { state, seats, runner: new ActivityRunner(s), log, inv, seated: () => seated };
}
const run = (r: ActivityRunner, seconds: number) => { for (let t = 0; t < seconds; t += 0.25) r.update(0.25); };

describe('activity runner', () => {
  it('order: pays first, waits, takes the nearest free seat, eats, and stays seated', () => {
    const w = world();
    const dibi = P.order({ id: 'dibi', label: 'Dibi mouton', price: 2000, prep: 2, eat: 3, needs: { faim: 50 } });
    expect(w.runner.start(dibi, { place: 'Chez Ass' })).toBe(true);
    expect(w.state.wallet).toBe(3000);                                       // paid at the counter
    expect(w.state.data.ledger.at(-1)).toMatchObject({ label: 'Dibi mouton · Chez Ass', amount: -2000 });
    expect(w.seated()).toBeNull();                                           // still waiting for the plate
    run(w.runner, 2.1);
    expect(w.seated()?.id).toBe('b:1');                                      // the closest free place on the bench
    expect(w.state.data.needs.faim).toBe(20);
    run(w.runner, 3.2);
    expect(w.runner.running).toBe(false);
    expect(w.state.data.needs.faim).toBe(70);
    expect(w.state.data.counters.meals).toBe(1);
    expect(w.log).toContain('cat:loisir');
    expect(w.log.at(-1)).toBe('save');
  });
  it('stopping keeps the price but skips unfinished effects', () => {
    const w = world();
    w.runner.start(P.order({ id: 'x', label: 'Mafé', price: 700, prep: 1, eat: 4, needs: { faim: 45 } }));
    run(w.runner, 2); w.runner.cancel('Arrêté');
    expect(w.state.wallet).toBe(4300);
    expect(w.state.data.needs.faim).toBe(20);
    expect(w.runner.running).toBe(false);
  });
  it('refuses with a reason: busy, money, requirement', () => {
    const w = world(100);
    expect(w.runner.blocked(P.order({ id: 'a', label: 'A', price: 2000, needs: {} }))).toBe('Pas assez d’argent');
    expect(w.runner.blocked(P.use({ id: 'u', label: 'U', seconds: 1, requires: () => 'Fermé' }))).toBe('Fermé');
    w.runner.start(P.use({ id: 'u2', label: 'U2', seconds: 5 }));
    expect(w.runner.blocked(P.use({ id: 'u3', label: 'U3', seconds: 1 }))).toBe('Termine d’abord ce que tu fais');
  });
  it('work pays, sell needs and removes items, buy adds them', () => {
    const w = world(0);
    w.runner.start(P.fish({ id: 'peche', label: 'Débarquer les caisses', seconds: 2, pay: 1500, fish: 3 })); run(w.runner, 2.1);
    expect(w.state.wallet).toBe(1500); expect(w.inv.count('poisson')).toBe(3);
    w.runner.start(P.sell({ id: 'vente', label: 'Vendre 2 poissons', price: 1200, items: { poisson: 2 } })); run(w.runner, 2);
    expect(w.state.wallet).toBe(2700); expect(w.inv.count('poisson')).toBe(1);
    w.runner.start(P.buy({ id: 'pain', label: 'Pain', price: 150, items: { pain: 1 } })); run(w.runner, 1.1);
    expect(w.inv.list()).toEqual(expect.arrayContaining([{ id: 'pain', count: 1 }, { id: 'poisson', count: 1 }]));
  });
  it('hand-over primitives run their system at once (talk, own, ride, invite…)', () => {
    const w = world(); let opened = '';
    w.runner.start(P.own({ id: 'parcelle', label: 'Voir la parcelle', then: () => { opened = 'plot'; } }));
    expect(opened).toBe('plot'); expect(w.runner.running).toBe(false);
  });
  it('pray: optional ablutions, then a prayer row seat; spiritual category', () => {
    const w = world();
    const a = P.pray({ id: 'priere', label: 'Prier', wash: true, seconds: 2 });
    expect(a.steps.map(s => s.primitive)).toEqual(['wash', 'pray']);
    w.runner.start(a); run(w.runner, 5.5);
    expect(w.state.data.counters.prieres).toBe(1); expect(w.log).toContain('cat:spirituel');
  });
});

describe('gestures of the trades', async () => {
  const { gesturePay } = await import('../src/activity/runner');
  const { G } = await import('../src/activity/gestures');
  const shift = () => P.trade({ id: 'meca', label: 'Aider le mécanicien', pay: 2000, needs: { energie: -18 }, counter: 'garage', category: 'artisanat',
    parts: [{ label: 'Passer les outils', gesture: G.tools(4) }, { label: 'Serrer les écrous', gesture: G.bolts(4) }] });
  it('the pay follows how well each part is played (30 % floor, 20 % tip when perfect)', () => {
    expect(gesturePay(1000, 0)).toBe(300); expect(gesturePay(1000, 0.5)).toBe(650); expect(gesturePay(1000, 1)).toBe(1200);
  });
  it('a shift waits for each gesture, pays per part and tires only at the end', () => {
    const w = world(0); const pending: ((s: number) => void)[] = [];
    const r = new ActivityRunner({ ...(w.runner as unknown as { s: ActivityServices }).s, gesture: (_g, _l, done) => { pending.push(done); return () => {}; } });
    w.state.data.needs.energie = 80;
    r.start(shift());
    run(r, 20);                                                              // time alone never ends a gesture
    expect(r.current?.index).toBe(0); expect(w.state.wallet).toBe(0);
    pending.shift()!(1);                                                     // perfect tools
    expect(w.state.wallet).toBe(1200); expect(w.state.data.needs.energie).toBe(80);
    pending.shift()!(0.5);                                                   // so-so bolts
    expect(w.state.wallet).toBe(1200 + 650); expect(w.state.data.needs.energie).toBe(62);
    expect(w.state.data.counters.garage).toBe(1); expect(r.running).toBe(false);
  });
  it('stopping mid-gesture aborts it: no pay, no late callback', () => {
    const w = world(0); let aborted = 0; let late: ((s: number) => void) | null = null;
    const r = new ActivityRunner({ ...(w.runner as unknown as { s: ActivityServices }).s, gesture: (_g, _l, done) => { late = done; return () => { aborted++; }; } });
    r.start(shift()); r.cancel('Arrêté');
    expect(aborted).toBe(1); late!(1);
    expect(w.state.wallet).toBe(0); expect(r.running).toBe(false);
  });
  it('without a gesture player, a gesture step is a short timed step with a middling score', () => {
    const w = world(0); w.runner.start(shift()); run(w.runner, 7);
    expect(w.runner.running).toBe(false); expect(w.state.wallet).toBe(2 * gesturePay(1000, 0.6));
  });
});

describe('places compose primitives at anchors', () => {
  const w = world();
  const place: PlaceSpec = {
    id: 'pk:dibi', type: 'dibi', name: 'Dibiterie Chez Ass', space: 'dibi', hours: [11, 2],
    anchors: [{ id: 'counter', kind: 'counter', x: 0, z: 2 }, { id: 'grill', name: 'Grill', kind: 'spot', x: 10, z: 10 }],
    offers: {
      counter: [P.order({ id: 'dibi', label: 'Dibi mouton', price: 2000, needs: { faim: 50 } }), P.order({ id: 'bissap', label: 'Bissap', price: 300, drink: true, seat: false, needs: { moral: 3 } })],
      grill: [P.work({ id: 'aide', label: 'Aider au grill', pay: 800, seconds: 4, category: 'service' })],
    },
  };
  let hour = 13;
  const places = new Places(w.runner, () => hour); places.add(place);
  const at = (x: number, z: number) => { const out: Target[] = []; places.collect('dibi', x, z, out); return out; };
  it('offers the anchor’s activities with their price', () => {
    const t = at(0, 1.5); expect(t).toHaveLength(1);
    const list = t[0].affordances();
    expect(list.map(a => a.label)).toEqual(['Dibi mouton', 'Bissap']);
    expect(list[0]).toMatchObject({ verb: 'order', cost: 2000, disabled: null });
  });
  it('closed hours grey the activities out', () => {
    hour = 9; expect(at(0, 1.5)[0].affordances()[0].disabled).toMatch(/Fermé/);
    hour = 1; expect(at(0, 1.5)[0].affordances()[0].disabled).toBeNull();   // open past midnight
    hour = 13;
  });
  it('the same registry knows which place a point belongs to', () => {
    expect(places.at('dibi', 9, 9)?.id).toBe('pk:dibi');
    expect(places.at('street', 0, 0)).toBeNull();
  });
  it('helpers', () => {
    expect(isOpen([20, 4], 23)).toBe(true); expect(isOpen([20, 4], 12)).toBe(false); expect(isOpen(undefined, 3)).toBe(true);
    expect(totals(500, [{ effects: { money: 1200 } }, { effects: { money: -200 } }])).toEqual({ cost: 700, gain: 1200 });
    const st = new GameState(newSave()); st.data.wallet = 0;
    expect(applyEffects(st, { money: 1500, needs: { faim: 5 } }, 'Test')).toEqual(['+1 500 F']);
  });
});

describe('place recipes compose the same primitives differently', async () => {
  const T = await import('../src/activity/templates');
  const { itemsUsed } = await import('../src/activity/runner');
  const A = (id: string, x = 0, z = 0) => ({ id, kind: 'spot' as const, x, z });
  it('a Dibi, a mosque, a beach, a club and a plot are all just anchors + primitives', () => {
    const dibi = T.dibi({ id: 'd', name: 'Chez Ass', space: 'street', anchors: [A('counter'), A('grill', 5)] });
    expect(dibi.offers.counter.map(o => o.primitive)).toEqual(['order', 'order', 'order']);
    expect(dibi.offers.grill[0].primitive).toBe('work');
    const talkOn = T.dibi({ id: 'd2', name: 'Chez Ass', space: 'street', anchors: [A('counter'), A('grill', 5)] }, { converse: () => {} });
    expect(talkOn.offers.counter.at(-1)?.primitive).toBe('talk');                    // hooks add hand-over verbs
    const m = T.mosque({ id: 'm', name: 'Mosquée', space: 'mosque', anchors: [A('ablutions'), A('hall', 3), A('imam', 6)] });
    expect(m.offers.ablutions[0].primitive).toBe('wash');
    expect(m.offers.hall[0].primitive).toBe('pray');
    expect(m.hours).toBeUndefined();                                                  // always open
    const beach = T.fishingBeach({ id: 'b', name: 'Soumbédioune', space: 'street', anchors: [A('pirogue'), A('mareyeuses', 4)] });
    expect(beach.offers.mareyeuses.map(o => o.primitive)).toEqual(['sell', 'buy']);
    expect(T.club({ id: 'c', name: 'Club', space: 'club', anchors: [A('floor'), A('bar', 3)] }).hours).toEqual([21, 5]);
    const plot = T.ownable({ id: 'p', name: 'Parcelle 12', space: 'street', anchors: [A('sign')], type: 'plot', assetId: 'plot:12' }, { ownership: () => {} });
    expect(plot.offers.sign[0].primitive).toBe('inspect');
    expect(() => T.dibi({ id: 'x', name: 'x', space: 'street', anchors: [A('counter')] })).toThrow(/grill/);
  });
  it('selling needs the goods', () => {
    const beach = T.fishingBeach({ id: 'b', name: 'Soumbédioune', space: 'street', anchors: [A('pirogue'), A('mareyeuses', 4)] });
    const sell = beach.offers.mareyeuses[0];
    expect(itemsUsed(sell)).toEqual({ poisson: 4 });
    const w = world(0); let fish = 0;
    const r = new ActivityRunner({ ...(w.runner as unknown as { s: ActivityServices }).s, hasItem: (_id, n) => fish >= n });
    expect(r.blocked(sell)).toMatch(/poisson/);
    fish = 4; expect(r.blocked(sell)).toBeNull();
  });
});
